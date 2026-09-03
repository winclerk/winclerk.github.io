import os
import json
import base64
import io
import requests
from datetime import datetime, timezone
import re
from pypdf import PdfReader


TENANT_ID     = os.environ["AZURE_TENANT_ID"]
CLIENT_ID     = os.environ["AZURE_CLIENT_ID"]
CLIENT_SECRET = os.environ["AZURE_CLIENT_SECRET"]
GH_PAT        = os.environ["GH_PAT"]

GITHUB_REPO = "winclerk/winclerk.github.io"
GITHUB_FILE = "data.json"

SITE_HOSTNAME = "townofwinchester54557.sharepoint.com"
SITE_PATH     = "/sites/TownBoard"
LIBRARY_NAME  = "Documents"

NEXT_MEETING_PATH = "All Town Board Files/Next Meeting"
PREV_REGULAR_PATH = "All Town Board Files/Previous Regular Meetings"
PREV_SPECIAL_PATH = "All Town Board Files/Previous Special Meetings"

SKIP_FOLDER_NAME = "Internal Only"

# Non-meeting sites: flat document libraries, not meeting folders.
# Each library is scanned recursively up to MAX_SCAN_DEPTH subfolder levels.
MAX_SCAN_DEPTH = 1

FLAT_SITES = [
    {
        "key": "boardsCommissions",
        "path": "/sites/BoardsCommitteesCommissions",
        "libraries": [
            "Planning Commission",
            "Intermunicipal Committees",
            "NEMSD Shared Services",
        ],
    },
    {
        "key": "governance",
        "path": "/sites/Governance",
        "libraries": [
            "Ordinances",
            "Resolutions",
            "Notices",
            "Policies",
            "Fee Schedule",
        ],
    },
    {
        "key": "elections",
        "path": "/sites/Elections",
        "libraries": [
            "Election Notices",
            "Canvass Results & Certifications",
            "Voters",
            "Election Inspectors",
        ],
    },
]

ICAL_URL = "https://winchesterwi.com/?post_type=tribe_events&ical=1&eventDisplay=list"
MEETING_KEYWORDS = ["regular town board meeting", "special town board meeting"]


def get_token():
    url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type":    "client_credentials",
        "scope":         "https://graph.microsoft.com/.default",
    }
    r = requests.post(url, data=data)
    if not r.ok:
        print(f"Token error: {r.text}")
    r.raise_for_status()
    return r.json()["access_token"]


def graph_get(token, url):
    r = requests.get(url, headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()


def get_site_id(token, site_path=SITE_PATH):
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_HOSTNAME}:{site_path}"
    return graph_get(token, url)["id"]


def get_drive_id(token, site_id, library_name=LIBRARY_NAME):
    url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
    for d in graph_get(token, url)["value"]:
        if d["name"] == library_name:
            return d["id"]
    raise ValueError(f"Drive '{library_name}' not found")


def list_root(token, drive_id):
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root/children"
    items = []
    while url:
        data = graph_get(token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def list_children(token, drive_id, folder_path):
    encoded = requests.utils.quote(folder_path)
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{encoded}:/children"
    items = []
    while url:
        data = graph_get(token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def get_item(token, drive_id, item_path):
    encoded = requests.utils.quote(item_path)
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{encoded}"
    return graph_get(token, url)


def get_root_item(token, drive_id):
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root"
    return graph_get(token, url)


def make_folder_link(token, drive_id, folder_path=None):
    """Create (or fetch) a public view link for a folder itself, not a file
    inside it. folder_path=None means the library root. Returns None on
    failure (e.g. anonymous sharing blocked for this site) rather than
    raising, so callers can degrade gracefully."""
    try:
        item = get_item(token, drive_id, folder_path) if folder_path else get_root_item(token, drive_id)
        return make_link(token, drive_id, item["id"])
    except Exception as e:
        print(f"    Warning: could not create folder link for '{folder_path or '(root)'}': {e}")
        return None


def make_link(token, drive_id, item_id):
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/createLink"
    r = requests.post(url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"type": "view", "scope": "anonymous"})
    r.raise_for_status()
    return r.json()["link"]["webUrl"]


def download_file(token, drive_id, item_id):
    """Download a file's content from SharePoint via Graph API.
    Returns raw bytes, or None on failure."""
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/content"
    try:
        r = requests.get(url, headers={"Authorization": f"Bearer {token}"})
        r.raise_for_status()
        return r.content
    except Exception as e:
        print(f"    Warning: could not download file: {e}")
        return None


def extract_meeting_details_from_pdf(pdf_bytes):
    """Extract meeting time and location from a PDF agenda's header text.

    Looks for patterns like:
      'Wednesday, August 5 at 10:00 AM'
      'Winchester Town Hall - 7228 CTH W, Winchester, WI 54557'

    Returns a dict with 'time' and/or 'location' keys, or empty dict."""
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = reader.pages[0].extract_text() or ""
    except Exception as e:
        print(f"    Warning: could not read PDF: {e}")
        return {}

    result = {}

    time_match = re.search(
        r'(?:at\s+)?(\d{1,2}:\d{2}\s*[AaPp]\.?[Mm]\.?)',
        text
    )
    if time_match:
        raw_time = time_match.group(1).strip()
        raw_time = raw_time.replace(".", "")
        raw_time = re.sub(r'(\d)([AaPp])', r'\1 \2', raw_time)
        raw_time = raw_time.upper()
        result["time"] = raw_time

    loc_match = re.search(
        r'(Winchester\s+Town\s+Hall)',
        text,
        re.IGNORECASE
    )
    if loc_match:
        result["location"] = "Winchester Town Hall"

    return result


def extract_details_from_next_meeting(token, drive_id, docs):
    """Try to extract time/location from the first agenda PDF in the Next Meeting folder.
    Returns a dict with 'time' and/or 'location' keys, or empty dict."""
    for doc in docs:
        fn = doc["filename"]
        if not fn.lower().startswith("agenda") or not fn.lower().endswith(".pdf"):
            continue
        try:
            encoded = requests.utils.quote(f"{NEXT_MEETING_PATH}/{fn}")
            url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{encoded}"
            item = graph_get(token, url)
            pdf_bytes = download_file(token, drive_id, item["id"])
            if pdf_bytes:
                details = extract_meeting_details_from_pdf(pdf_bytes)
                if details:
                    print(f"    Parsed from PDF: {details}")
                    return details
        except Exception as e:
            print(f"    Warning: could not parse {fn}: {e}")
            continue
    return {}


def _fetch_ical_events():
    """Fetch and parse all events from the WordPress iCal feed.
    Returns a list of dicts with summary, dtstart_raw, location."""
    try:
        r = requests.get(ICAL_URL, timeout=10,
            headers={"User-Agent": "Winchester-Sync/1.0"})
        r.raise_for_status()
    except Exception as e:
        print(f"  Warning: could not fetch iCal feed: {e}")
        return []

    events = []
    current = {}
    in_event = False

    for line in r.text.splitlines():
        line = line.strip()
        if line == "BEGIN:VEVENT":
            in_event = True
            current = {}
        elif line == "END:VEVENT":
            if current:
                events.append(current)
            in_event = False
            current = {}
        elif in_event:
            if line.startswith("SUMMARY:"):
                current["summary"] = line[8:].strip()
            elif line.startswith("DTSTART"):
                current["dtstart_raw"] = line.split(":", 1)[-1].strip()
            elif line.startswith("LOCATION:"):
                current["location"] = line[9:].strip()

    return events


def _parse_event_dt(raw):
    """Parse an iCal DTSTART value into a datetime. Returns None on failure."""
    try:
        if "T" in raw:
            raw_clean = re.sub(r"[:-]", "", raw.replace("Z", ""))
            dt = datetime.strptime(raw_clean[:15], "%Y%m%dT%H%M%S")
            return dt.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.strptime(raw[:8], "%Y%m%d")
            return dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _event_to_result(dt, ev):
    """Convert a parsed event into a result dict with title, date, time, location."""
    raw_location = ev.get("location", "") or ""
    location = raw_location.split("\\,")[0].split(",")[0].strip()
    if not location:
        location = "Winchester Town Hall"
    if dt.hour or dt.minute:
        time_str = dt.strftime("%-I:%M %p")
    else:
        time_str = "6:00 PM"
    return {
        "title":    ev.get("summary", ""),
        "date":     dt.strftime("%Y-%m-%d"),
        "time":     time_str,
        "location": location,
    }


def get_next_meeting_from_ical(ical_events=None, match_date=None):
    """Find the next meeting from the iCal feed.

    Strategy:
    1. Try keyword match (MEETING_KEYWORDS) — finds standard regular/special meetings.
    2. If that fails and match_date is provided, find any event on that date.
    This handles non-standard meetings like budget meetings that aren't named
    with the standard keywords but are still in the Events Calendar."""
    if ical_events is None:
        ical_events = _fetch_ical_events()

    now = datetime.now(timezone.utc)

    # Pass 1: keyword match (standard meeting names)
    candidates = []
    for ev in ical_events:
        summary = ev.get("summary", "")
        if not any(kw in summary.lower() for kw in MEETING_KEYWORDS):
            continue
        dt = _parse_event_dt(ev.get("dtstart_raw", ""))
        if dt and dt >= now:
            candidates.append((dt, ev))

    if candidates:
        candidates.sort(key=lambda x: x[0])
        dt, ev = candidates[0]
        return _event_to_result(dt, ev)

    # Pass 2: date match (any event on the meeting date from SharePoint)
    if match_date:
        for ev in ical_events:
            dt = _parse_event_dt(ev.get("dtstart_raw", ""))
            if dt and dt.strftime("%Y-%m-%d") == match_date:
                print(f"  Found calendar event by date match: {ev.get('summary', '')}")
                return _event_to_result(dt, ev)

    print("  Warning: no matching town board meetings found in iCal feed.")
    return None


def clean_name(s):
    s = re.sub(r"_\d{8}$", "", s)
    s = re.sub(r"_\d{6}$", "", s)
    s = s.replace("-", " ").replace("_", " ").strip()
    s = re.sub(r"(\d{4}) (\d{2})\b", r"\1-\2", s)
    return s


def infer_label(filename):
    name = filename
    for ext in [".pdf", ".docx", ".xlsx", ".doc", ".xls", ".pptx"]:
        if name.lower().endswith(ext):
            name = name[:-len(ext)]
            break

    if re.search(r"NEMSD.{0,5}[Ii]ntermunicipal", name):
        return "NEMSD Intermunicipal Agreement - Current Signed Agreement"

    m = re.match(r"Agenda_(RTBM|STBM|TBSM|BOR)_\d{8}", name)
    if m:
        type_map = {"RTBM": "Regular Meeting Agenda", "STBM": "Special Meeting Agenda",
                    "TBSM": "Special Meeting Agenda", "BOR": "Board of Review Agenda"}
        return type_map[m.group(1)]

    m = re.match(r"Agenda_\d{8}", name)
    if m:
        return "Agenda"

    # Agenda with descriptive slug: Agenda_Some-Description_YYYYMMDD
    # e.g. Agenda_2027-Initial-Budget-Meeting_20260805 -> "2027 Initial Budget Meeting Agenda"
    m = re.match(r"Agenda_(.+?)_(\d{8})$", name)
    if m:
        slug = m.group(1).replace("-", " ").replace("_", " ").strip()
        return f"{slug} Agenda"

    m = re.match(r"Minutes_(BOR_)?\d{8}(_DRAFT)?", name)
    if m:
        is_bor = bool(m.group(1))
        is_draft = bool(m.group(2))
        base = "Board of Review Minutes" if is_bor else "Minutes"
        return f"{base} (Draft)" if is_draft else base

    m = re.match(r"Minutes_(?:RTBM_|STBM_|TBSM_)\d{8}(_DRAFT)?", name)
    if m:
        return "Minutes (Draft)" if m.group(1) else "Minutes"

    m = re.match(r"Report_Clerk_\d{8}", name)
    if m:
        return "Clerk's Report"

    m = re.match(r"Clerks?_Report_\d{8}", name, re.IGNORECASE)
    if m:
        return "Clerk's Report"

    m = re.match(r"Report_Treasurer_\d{6}", name)
    if m:
        return "Treasurer's Report"

    m = re.match(r"Report_NEMSD_\d{6}", name)
    if m:
        return "NEMSD Report"

    m = re.match(r"Report_Pedalers_\d{6}", name)
    if m:
        return "Pedalers Report"

    m = re.match(r"(?:Report_)?Disbursements_(\d{6})$", name)
    if m:
        dt = datetime.strptime(m.group(1), "%Y%m")
        return f"{dt.strftime('%B')} Disbursements"

    m = re.match(r"Report_(.+?)_\d{6}$", name)
    if m:
        return f"{m.group(1).replace('-', ' ').replace('_', ' ')} Report"

    m = re.match(r"Report_(.+?)_\d{8}$", name)
    if m:
        return f"{m.group(1).replace('-', ' ').replace('_', ' ')} Report"

    m = re.match(r"Policy_(\d{4}-\d{2})_(.+)", name)
    if m:
        return f"{m.group(1)} {clean_name(m.group(2))} Policy"

    m = re.match(r"Resolution_(\d{4}-\d{2})_(.+)", name)
    if m:
        return f"{m.group(1)} {clean_name(m.group(2))} Resolution"

    m = re.match(r"Ordinance_(\d{4}-\d{2})_(.+)", name)
    if m:
        return f"{m.group(1)} {clean_name(m.group(2))} Ordinance"

    m = re.match(r"Permit_(.+?)(?:_\d{8})?$", name)
    if m:
        return f"{m.group(1).replace('-', ' ').replace('_', ' ').strip()} Permit"

    m = re.match(r"Form_([A-Z0-9\-]+)_(.+?)(?:_\d{8})?$", name)
    if m:
        num = m.group(1).replace("-", " ")
        desc = m.group(2).replace("-", " ").replace("_", " ").strip()
        return f"{desc} Form {num}"

    m = re.match(r"Handbook_(.+?)(?:_\d{8})?$", name)
    if m:
        rest = re.sub(r"^TOW-?", "", m.group(1))
        rest = rest.replace("-", " ").replace("_", " ").strip()
        has_date = bool(re.search(r"_\d{8}$", name))
        return f"{rest} Handbook" + (" (revised)" if has_date else "")

    m = re.match(r"Comm_(.+?)_\d{6,8}$", name)
    if m:
        desc = m.group(1).replace("-", " ").replace("_", " ").strip()
        return f"{desc} Communication"

    return name.replace("_", " ").replace("-", " ").strip()


def parse_date(filename):
    m = re.search(r"(\d{8})", filename)
    if m:
        d = m.group(1)
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    # Try YYMMDD format (e.g. 260715 = 2026-07-15)
    m = re.search(r"_(\d{6})(?:\.|$)", filename)
    if m:
        d = m.group(1)
        yy, mm, dd = d[:2], d[2:4], d[4:6]
        if 1 <= int(mm) <= 12 and 1 <= int(dd) <= 31:
            return f"20{yy}-{mm}-{dd}"
    return None


def extract_meeting_slug(filename):
    """Extract a descriptive meeting title from a non-standard filename.
    e.g. Agenda_2027-Initial-Budget-Meeting_20260805.pdf -> '2027 Initial Budget Meeting'
    Returns None if the filename matches standard RTBM/STBM/TBSM patterns."""
    name = filename
    for ext in [".pdf", ".docx", ".xlsx", ".doc", ".xls", ".pptx"]:
        if name.lower().endswith(ext):
            name = name[:-len(ext)]
            break
    if not name.startswith("Agenda_"):
        return None
    if re.match(r"Agenda_(RTBM|STBM|TBSM|BOR)_", name):
        return None
    if re.match(r"Agenda_\d{8}$", name):
        return None
    slug = re.sub(r"^Agenda_", "", name)
    slug = re.sub(r"_?\d{8}$", "", slug)
    slug = re.sub(r"_?DRAFT$", "", slug, flags=re.IGNORECASE)
    slug = slug.replace("_", " ").replace("-", " ").strip()
    return slug if slug else None


def collect_all_next_meeting_filenames(token, drive_id):
    """List ALL filenames in the Next Meeting folder, including inside
    Internal Only. Used only for date/title extraction — not for publishing.
    Returns a list of filename strings."""
    filenames = []
    try:
        children = list_children(token, drive_id, NEXT_MEETING_PATH)
    except Exception as e:
        print(f"  Warning: could not list Next Meeting folder: {e}")
        return filenames

    for item in children:
        name = item["name"]
        if "folder" in item:
            # Recurse into ALL subfolders including Internal Only
            sub_path = f"{NEXT_MEETING_PATH}/{name}"
            try:
                sub_children = list_children(token, drive_id, sub_path)
                for sub in sub_children:
                    if "folder" not in sub:
                        filenames.append(sub["name"])
            except Exception:
                pass
        else:
            filenames.append(name)
    return filenames


def scan_folder(token, drive_id, folder_path):
    """Scan a meeting folder for documents and subfolders.
    Returns (docs, subfolders) where subfolders is a list of
    {"name": ..., "url": ..., "documents": [...]} dicts.
    Skips any subfolder named 'Internal Only'."""
    try:
        children = list_children(token, drive_id, folder_path)
    except Exception as e:
        print(f"  Warning: could not read {folder_path}: {e}")
        return [], []

    docs = []
    subfolders = []
    folder_url = None
    folder_url_fetched = False

    for item in children:
        name = item["name"]

        if "folder" in item:
            if name.strip().lower() == SKIP_FOLDER_NAME.lower():
                continue
            sub_path = f"{folder_path}/{name}"
            print(f"    Scanning subfolder: {name}...")
            sub_docs = scan_subfolder(token, drive_id, sub_path)
            if sub_docs:
                sub_folder_url = make_folder_link(token, drive_id, sub_path)
                subfolder_entry = {
                    "name": name,
                    "documents": sub_docs,
                }
                if sub_folder_url:
                    subfolder_entry["url"] = sub_folder_url
                subfolders.append(subfolder_entry)
            continue

        try:
            link = make_link(token, drive_id, item["id"])
        except Exception as e:
            print(f"  Warning: skipping {name}: {e}")
            continue

        if not folder_url_fetched:
            folder_url = make_folder_link(token, drive_id, folder_path)
            folder_url_fetched = True

        date = parse_date(name) or item.get("lastModifiedDateTime", "")[:10]
        posted = item.get("createdDateTime", item.get("lastModifiedDateTime", ""))[:10]
        doc = {"label": infer_label(name), "filename": name, "url": link, "date": date, "posted": posted}
        if "DRAFT" in name.upper():
            doc["draft"] = True
        if folder_url:
            doc["folderUrl"] = folder_url
        docs.append(doc)

    def key(d):
        l = d["label"].lower()
        if "agenda" in l: return (0, l)
        if "minutes" in l: return (1, l)
        return (2, l)
    docs.sort(key=key)
    return docs, subfolders


def scan_subfolder(token, drive_id, folder_path):
    """Scan a subfolder inside a meeting folder for files only.
    Returns a list of document dicts. Skips any nested subfolders."""
    try:
        children = list_children(token, drive_id, folder_path)
    except Exception as e:
        print(f"    Warning: could not read subfolder {folder_path}: {e}")
        return []

    docs = []
    for item in children:
        name = item["name"]
        if "folder" in item:
            continue

        try:
            link = make_link(token, drive_id, item["id"])
        except Exception as e:
            print(f"    Warning: skipping {name}: {e}")
            continue

        date = parse_date(name) or item.get("lastModifiedDateTime", "")[:10]
        posted = item.get("createdDateTime", item.get("lastModifiedDateTime", ""))[:10]
        doc = {"label": infer_label(name), "filename": name, "url": link, "date": date, "posted": posted}
        if "DRAFT" in name.upper():
            doc["draft"] = True
        docs.append(doc)

    docs.sort(key=lambda d: d["label"].lower())
    return docs


def scan_library(token, drive_id, folder_path=None, folder_label=None, depth=0):
    """Recursively scan a document library (not meeting-folder-shaped).
    Skips any folder named SKIP_FOLDER_NAME at any depth. Recurses into
    other subfolders up to MAX_SCAN_DEPTH levels below the library root.
    Each doc gets a folderUrl pointing at its own parent folder (fetched
    once per folder, not once per file)."""
    try:
        items = list_children(token, drive_id, folder_path) if folder_path else list_root(token, drive_id)
    except Exception as e:
        print(f"  Warning: could not read {folder_path or '(root)'}: {e}")
        return []

    docs = []
    folder_url = None
    folder_url_fetched = False

    for item in items:
        name = item["name"]

        if "folder" in item:
            if name.strip().lower() == SKIP_FOLDER_NAME.lower():
                continue
            if depth < MAX_SCAN_DEPTH:
                sub_path = f"{folder_path}/{name}" if folder_path else name
                docs.extend(scan_library(token, drive_id, sub_path, name, depth + 1))
            continue

        try:
            link = make_link(token, drive_id, item["id"])
        except Exception as e:
            print(f"    Warning: skipping {name}: {e}")
            continue

        if not folder_url_fetched:
            folder_url = make_folder_link(token, drive_id, folder_path)
            folder_url_fetched = True

        base = re.sub(r"\.(pdf|docx?|xlsx?|pptx?)$", "", name, flags=re.IGNORECASE)
        date = parse_date(name) or item.get("lastModifiedDateTime", "")[:10]
        posted = item.get("createdDateTime", item.get("lastModifiedDateTime", ""))[:10]
        doc = {"label": clean_name(base), "filename": name, "url": link, "date": date, "posted": posted}
        if folder_label:
            doc["folder"] = folder_label
        if folder_url:
            doc["folderUrl"] = folder_url
        docs.append(doc)

    return docs


def build_flat_site_data(token, site_config):
    print(f"Locating site: {site_config['key']} ({site_config['path']})...")
    try:
        site_id = get_site_id(token, site_config["path"])
    except Exception as e:
        print(f"  Warning: could not find site {site_config['path']}: {e}")
        return {"libraries": [{"name": lib, "documents": []} for lib in site_config["libraries"]]}

    libraries_out = []
    for lib_name in site_config["libraries"]:
        print(f"  Scanning library: {lib_name}...")
        try:
            drive_id = get_drive_id(token, site_id, lib_name)
        except Exception as e:
            print(f"    Warning: {e}")
            libraries_out.append({"name": lib_name, "documents": []})
            continue
        docs = scan_library(token, drive_id)
        docs.sort(key=lambda d: d["label"].lower())
        print(f"    Found {len(docs)} document(s).")
        libraries_out.append({"name": lib_name, "documents": docs})

    return {"libraries": libraries_out}


def parse_folder_name(name, mtype):
    m = re.search(r"(\d{8})$", name)
    if not m:
        return None
    raw = m.group(1)
    date_str = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    if mtype == "regular":
        return {"id": f"regular-{date_str}",
                "title": f"Regular Town Board Meeting - {dt.strftime('%B %Y')}",
                "date": date_str}
    else:
        return {"id": f"special-{date_str}",
                "title": f"Special Town Board Meeting - {dt.strftime('%B %-d, %Y')}",
                "date": date_str}


def build_data(token, drive_id):
    meetings = []

    print("Fetching Events Calendar...")
    ical_events = _fetch_ical_events()

    print("Scanning Next Meeting...")
    next_docs, next_subfolders = scan_folder(token, drive_id, NEXT_MEETING_PATH)

    # Collect ALL filenames (including Internal Only) for date/title extraction.
    # scan_folder skips Internal Only for publishing, but we still need those
    # filenames to determine the meeting date and title.
    print("  Collecting all filenames for date extraction...")
    all_next_filenames = collect_all_next_meeting_filenames(token, drive_id)
    print(f"  Found {len(all_next_filenames)} total file(s) (including internal)")

    next_date = None
    next_type = "regular"
    next_title = "Upcoming Town Board Meeting"
    next_time = "6:00 PM"
    next_location = "Winchester Town Hall"

    # First try published docs, then fall back to all filenames (including internal)
    all_sources = [d["filename"] for d in next_docs] + [
        fn for fn in all_next_filenames
        if fn not in [d["filename"] for d in next_docs]
    ]

    for fn in all_sources:
        m = re.search(r"(\d{8})", fn)
        if m:
            raw = m.group(1)
            next_date = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
            dt = datetime.strptime(next_date, "%Y-%m-%d")
            if "RTBM" in fn:
                next_type = "regular"
                next_title = f"Regular Town Board Meeting - {dt.strftime('%B %Y')}"
            elif "STBM" in fn or "TBSM" in fn:
                next_type = "special"
                next_title = f"Special Town Board Meeting - {dt.strftime('%B %-d, %Y')}"
            else:
                slug = extract_meeting_slug(fn)
                if slug:
                    next_title = slug
                else:
                    next_title = f"Town Board Meeting - {dt.strftime('%B %-d, %Y')}"
                next_type = "special"
            print(f"  Determined next meeting from filename: {fn}")
            print(f"    Date: {next_date}, Title: {next_title}, Type: {next_type}")
            break

    # Resolve time & location: PDF content is most reliable, iCal is fallback.
    print("  Extracting meeting details from agenda PDF...")
    pdf_details = extract_details_from_next_meeting(token, drive_id, next_docs)
    if pdf_details.get("time"):
        next_time = pdf_details["time"]
    if pdf_details.get("location"):
        next_location = pdf_details["location"]

    # If PDF didn't yield time, try iCal
    if not pdf_details.get("time"):
        ical_event = get_next_meeting_from_ical(ical_events, match_date=next_date)
        if ical_event:
            next_time = ical_event["time"]
            if not pdf_details.get("location"):
                next_location = ical_event["location"]
            print(f"  iCal fallback: {ical_event['title']} at {ical_event['time']} @ {ical_event['location']}")

    if not next_date:
        next_date = datetime.today().strftime("%Y-%m-%d")

    next_meeting = {
        "id": f"{next_type}-{next_date}", "title": next_title,
        "type": next_type, "status": "upcoming", "date": next_date,
        "time": next_time, "location": next_location,
        "documents": next_docs,
    }
    if next_subfolders:
        next_meeting["subfolders"] = next_subfolders
    meetings.append(next_meeting)

    print("Scanning Previous Regular Meetings...")
    try:
        reg_folders = list_children(token, drive_id, PREV_REGULAR_PATH)
    except Exception as e:
        print(f"  Warning: {e}")
        reg_folders = []
    reg = []
    for item in reg_folders:
        if "folder" not in item:
            continue
        p = parse_folder_name(item["name"], "regular")
        if not p:
            continue
        print(f"  Scanning {item['name']}...")
        docs, subfolders = scan_folder(token, drive_id, f"{PREV_REGULAR_PATH}/{item['name']}")
        entry = {"id": p["id"], "title": p["title"], "type": "regular",
                 "status": "complete", "date": p["date"], "documents": docs}
        if subfolders:
            entry["subfolders"] = subfolders
        reg.append(entry)
    reg.sort(key=lambda x: x["date"], reverse=True)
    meetings.extend(reg)

    print("Scanning Previous Special Meetings...")
    try:
        spec_folders = list_children(token, drive_id, PREV_SPECIAL_PATH)
    except Exception as e:
        print(f"  Warning: {e}")
        spec_folders = []
    spec = []
    for item in spec_folders:
        if "folder" not in item:
            continue
        p = parse_folder_name(item["name"], "special")
        if not p:
            continue
        print(f"  Scanning {item['name']}...")
        docs, subfolders = scan_folder(token, drive_id, f"{PREV_SPECIAL_PATH}/{item['name']}")
        entry = {"id": p["id"], "title": p["title"], "type": "special",
                 "status": "complete", "date": p["date"], "documents": docs}
        if subfolders:
            entry["subfolders"] = subfolders
        spec.append(entry)
    spec.sort(key=lambda x: x["date"], reverse=True)
    meetings.extend(spec)

    return {"meetings": meetings}


def write_github(data):
    headers = {"Authorization": f"Bearer {GH_PAT}", "Accept": "application/vnd.github+json"}
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}"
    r = requests.get(url, headers=headers)
    sha = r.json().get("sha") if r.status_code == 200 else None
    content = base64.b64encode(json.dumps(data, indent=2, ensure_ascii=False).encode()).decode()
    payload = {
        "message": f"Auto-sync from SharePoint [{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}]",
        "content": content
    }
    if sha:
        payload["sha"] = sha
    r = requests.put(url, headers=headers, json=payload)
    r.raise_for_status()
    print("data.json updated successfully.")

def write_github_file(path, content):
    """Write arbitrary content to any file in the repo (not just data.json).
       Path is repo-relative, e.g. 'permits.json'. Content is a string."""
    headers = {"Authorization": f"Bearer {GH_PAT}", "Accept": "application/vnd.github+json"}
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}"
    r = requests.get(url, headers=headers)
    sha = r.json().get("sha") if r.status_code == 200 else None
    import base64
    payload = {
        "message": f"Auto-sync {path} from SharePoint [{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}]",
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
    }
    if sha:
        payload["sha"] = sha
    r = requests.put(url, headers=headers, json=payload)
    r.raise_for_status()
def main():
    print("Authenticating with Microsoft Graph...")
    token = get_token()
    print("Locating SharePoint site and drive...")
    site_id = get_site_id(token)
    drive_id = get_drive_id(token, site_id)
    print("Building data.json from SharePoint...")
    data = build_data(token, drive_id)
    total = sum(len(m["documents"]) for m in data["meetings"])
    sub_total = sum(
        sum(len(sf["documents"]) for sf in m.get("subfolders", []))
        for m in data["meetings"]
    )
    print(f"Found {len(data['meetings'])} meetings, {total} documents + {sub_total} subfolder documents.")

    print("Scanning additional sites...")
    sites_data = {}
    for site_config in FLAT_SITES:
        sites_data[site_config["key"]] = build_flat_site_data(token, site_config)
    data["sites"] = sites_data
    sites_total = sum(
        len(lib["documents"])
        for site in sites_data.values()
        for lib in site["libraries"]
    )
    print(f"Found {sites_total} document(s) across {len(FLAT_SITES)} additional site(s).")

    print("Writing to GitHub...")
    write_github(data)
    print("Done.")    
    # ── Permits (three-tracker sync) ──
    try:
        import sync_permits
        all_rows = sync_permits.sync_permits(token, write_github_file)
        import permit_notify
        permit_notify.notify_status_changes(token, all_rows, write_github_file)
        # PDF generation — brief delay so permit_number PATCHes propagate before generating
        import time
        time.sleep(3)
        import permit_pdf
        flat_rows = [row for _, rows in all_rows for row in rows]
        permit_pdf.generate_for_rows(flat_rows, token=token)
    except Exception as e:
        import traceback
        print(f"Permit sync/notify/pdf failed: {e}")
        traceback.print_exc()
if __name__ == "__main__":
    main()

