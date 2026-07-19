import os
import json
import base64
import requests
from datetime import datetime, timezone
import re


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
            "Poll Worker Materials",
            "Canvass Results & Certifications",
            "Polling Place & District Info",
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


def make_link(token, drive_id, item_id):
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/createLink"
    r = requests.post(url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"type": "view", "scope": "anonymous"})
    r.raise_for_status()
    return r.json()["link"]["webUrl"]


def get_next_meeting_from_ical():
    try:
        r = requests.get(ICAL_URL, timeout=10,
            headers={"User-Agent": "Winchester-Sync/1.0"})
        r.raise_for_status()
    except Exception as e:
        print(f"  Warning: could not fetch iCal feed: {e}")
        return None

    now = datetime.now(timezone.utc)
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

    candidates = []
    for ev in events:
        summary = ev.get("summary", "")
        if not any(kw in summary.lower() for kw in MEETING_KEYWORDS):
            continue
        raw = ev.get("dtstart_raw", "")
        try:
            if "T" in raw:
                raw_clean = re.sub(r"[:-]", "", raw.replace("Z", ""))
                dt = datetime.strptime(raw_clean[:15], "%Y%m%dT%H%M%S")
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = datetime.strptime(raw[:8], "%Y%m%d")
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if dt >= now:
            candidates.append((dt, ev))

    if not candidates:
        print("  Warning: no upcoming town board meetings found in iCal feed.")
        return None

    candidates.sort(key=lambda x: x[0])
    dt, ev = candidates[0]

    # Extract just the venue name — everything before the first comma
    raw_location = ev.get("location", "") or ""
    location = raw_location.split("\\,")[0].split(",")[0].strip()
    if not location:
        location = "Winchester Town Hall"

    # Format time
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

    m = re.match(r"Minutes_(?:RTBM_|STBM_|TBSM_)?\d{8}(_DRAFT)?", name)
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

    return name.replace("_", " ").replace("-", " ").strip()


def parse_date(filename):
    m = re.search(r"(\d{8})", filename)
    if m:
        d = m.group(1)
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return None


def scan_folder(token, drive_id, folder_path):
    try:
        children = list_children(token, drive_id, folder_path)
    except Exception as e:
        print(f"  Warning: could not read {folder_path}: {e}")
        return []
    docs = []
    for item in children:
        name = item["name"]
        if "folder" in item:
            continue
        try:
            link = make_link(token, drive_id, item["id"])
        except Exception as e:
            print(f"  Warning: skipping {name}: {e}")
            continue
        date = parse_date(name) or item.get("lastModifiedDateTime", "")[:10]
        doc = {"label": infer_label(name), "filename": name, "url": link, "date": date}
        if "DRAFT" in name.upper():
            doc["draft"] = True
        docs.append(doc)

    def key(d):
        l = d["label"].lower()
        if "agenda" in l: return (0, l)
        if "minutes" in l: return (1, l)
        return (2, l)
    docs.sort(key=key)
    return docs


def scan_library(token, drive_id, folder_path=None, folder_label=None, depth=0):
    """Recursively scan a document library (not meeting-folder-shaped).
    Skips any folder named SKIP_FOLDER_NAME at any depth. Recurses into
    other subfolders up to MAX_SCAN_DEPTH levels below the library root."""
    try:
        items = list_children(token, drive_id, folder_path) if folder_path else list_root(token, drive_id)
    except Exception as e:
        print(f"  Warning: could not read {folder_path or '(root)'}: {e}")
        return []

    docs = []
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

        base = re.sub(r"\.(pdf|docx?|xlsx?|pptx?)$", "", name, flags=re.IGNORECASE)
        date = parse_date(name) or item.get("lastModifiedDateTime", "")[:10]
        doc = {"label": clean_name(base), "filename": name, "url": link, "date": date}
        if folder_label:
            doc["folder"] = folder_label
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

    print("Fetching next meeting from Events Calendar...")
    ical_event = get_next_meeting_from_ical()

    print("Scanning Next Meeting...")
    next_docs = scan_folder(token, drive_id, NEXT_MEETING_PATH)

    next_date = None
    next_type = "regular"
    next_title = "Upcoming Town Board Meeting"
    next_time = "6:00 PM"
    next_location = "Winchester Town Hall"

    for doc in next_docs:
        m = re.search(r"(\d{8})", doc["filename"])
        if m:
            raw = m.group(1)
            next_date = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
            dt = datetime.strptime(next_date, "%Y-%m-%d")
            if "STBM" in doc["filename"] or "TBSM" in doc["filename"]:
                next_type = "special"
                next_title = f"Special Town Board Meeting - {dt.strftime('%B %-d, %Y')}"
            else:
                next_type = "regular"
                next_title = f"Regular Town Board Meeting - {dt.strftime('%B %Y')}"
            break

    if ical_event:
        next_time = ical_event["time"]
        next_location = ical_event["location"]
        print(f"  Next meeting: {ical_event['title']} on {ical_event['date']} at {ical_event['time']} @ {ical_event['location']}")

    if not next_date:
        next_date = datetime.today().strftime("%Y-%m-%d")

    meetings.append({
        "id": f"{next_type}-{next_date}", "title": next_title,
        "type": next_type, "status": "upcoming", "date": next_date,
        "time": next_time, "location": next_location,
        "documents": next_docs,
    })

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
        docs = scan_folder(token, drive_id, f"{PREV_REGULAR_PATH}/{item['name']}")
        reg.append({"id": p["id"], "title": p["title"], "type": "regular",
                    "status": "complete", "date": p["date"], "documents": docs})
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
        docs = scan_folder(token, drive_id, f"{PREV_SPECIAL_PATH}/{item['name']}")
        spec.append({"id": p["id"], "title": p["title"], "type": "special",
                     "status": "complete", "date": p["date"], "documents": docs})
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


def main():
    print("Authenticating with Microsoft Graph...")
    token = get_token()
    print("Locating SharePoint site and drive...")
    site_id = get_site_id(token)
    drive_id = get_drive_id(token, site_id)
    print("Building data.json from SharePoint...")
    data = build_data(token, drive_id)
    total = sum(len(m["documents"]) for m in data["meetings"])
    print(f"Found {len(data['meetings'])} meetings, {total} documents total.")

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


if __name__ == "__main__":
    main()
