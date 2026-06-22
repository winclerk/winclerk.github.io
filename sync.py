import os
import json
import base64
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
TENANT_ID       = os.environ["AZURE_TENANT_ID"]
CLIENT_ID       = os.environ["AZURE_CLIENT_ID"]
CLIENT_SECRET   = os.environ["AZURE_CLIENT_SECRET"]
REFRESH_TOKEN   = os.environ.get("MS_REFRESH_TOKEN", "")
GH_PAT          = os.environ["GH_PAT"]

GITHUB_REPO     = "winclerk/winclerk.github.io"
GITHUB_FILE     = "data.json"

SITE_HOSTNAME   = "townofwinchester54557.sharepoint.com"
SITE_PATH       = "/sites/TownBoard"
LIBRARY_NAME    = "Shared Documents"

# Folder paths inside the library
NEXT_MEETING_PATH      = "All Town Board Files/Next Meeting"
PREV_REGULAR_PATH      = "All Town Board Files/Previous Regular Meetings"
PREV_SPECIAL_PATH      = "All Town Board Files/Previous Special Meetings"

SKIP_FOLDER_NAME = "Internal Only"

# ── Auth ──────────────────────────────────────────────────────────────────────
def get_token():
    """Exchange refresh token for access token, print new refresh token for secret rotation."""
    url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id":     CLIENT_ID,
        "grant_type":    "refresh_token",
        "refresh_token": REFRESH_TOKEN,
        "scope":         "https://graph.microsoft.com/Sites.Read.All https://graph.microsoft.com/Files.ReadWrite.All offline_access",
    }
    r = requests.post(url, data=data)
    if not r.ok:
        print(f"Token error response: {r.text}")
    r.raise_for_status()
    tokens = r.json()
    new_refresh = tokens.get("refresh_token", "")
    if new_refresh and new_refresh != REFRESH_TOKEN:
        print(f"NEW_REFRESH_TOKEN={new_refresh}")
    return tokens["access_token"], new_refresh

# ── Graph helpers ─────────────────────────────────────────────────────────────
def graph_get(access_token, url):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.get(url, headers=headers)
    r.raise_for_status()
    return r.json()

def get_site_id(access_token):
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_HOSTNAME}:{SITE_PATH}"
    return graph_get(access_token, url)["id"]

def get_drive_id(access_token, site_id):
    url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
    drives = graph_get(access_token, url)["value"]
    for d in drives:
        if d["name"] == LIBRARY_NAME:
            return d["id"]
    raise ValueError(f"Drive '{LIBRARY_NAME}' not found")

def list_folder_children(access_token, drive_id, folder_path):
    encoded = requests.utils.quote(folder_path)
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{encoded}:/children"
    items = []
    while url:
        data = graph_get(access_token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items

def create_sharing_link(access_token, drive_id, item_id, is_folder=False):
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/createLink"
    body = {"type": "view", "scope": "anonymous"}
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    r = requests.post(url, headers=headers, json=body)
    r.raise_for_status()
    return r.json()["link"]["webUrl"]

# ── Label inference ───────────────────────────────────────────────────────────
def infer_label(filename):
    """Turn a raw filename into a human-readable label."""
    name = filename
    # Strip extension
    for ext in [".pdf", ".docx", ".xlsx", ".doc", ".xls", ".pptx"]:
        if name.lower().endswith(ext):
            name = name[: -len(ext)]
            break

    # Known prefix mappings
    prefixes = {
        "Agenda_RTBM_": "Agenda",
        "Agenda_STBM_": "Agenda",
        "Agenda_TBSM_": "Agenda",
        "Agenda_BOR_":  "Agenda (Board of Review)",
        "Agenda_":      "Agenda",
        "Minutes_RTBM_": "Minutes",
        "Minutes_STBM_": "Minutes",
        "Minutes_TBSM_": "Minutes",
        "Minutes_":      "Minutes",
        "Resolution_":   "Resolution",
        "Ordinance_":    "Ordinance",
        "Policy_":       "Policy",
        "Procedure_":    "Procedure",
        "Permit_":       "Permit",
        "Report_Clerk_": "Clerk Report",
        "Report_Treasurer_": "Treasurer Report",
        "Report_NEMSD_": "NEMSD Report",
        "Report_Pedalers_": "Pedalers Report",
        "Report_":       "Report",
        "Form_":         "Form",
        "Handbook_":     "Handbook",
    }
    for prefix, label in prefixes.items():
        if name.startswith(prefix):
            remainder = name[len(prefix):]
            # Try to extract a date suffix like _20260608 and drop it
            import re
            remainder = re.sub(r"_?\d{8}$", "", remainder)
            remainder = re.sub(r"_?DRAFT$", " (Draft)", remainder)
            remainder = remainder.replace("_", " ").replace("-", " — ").strip()
            if remainder and remainder not in ("Draft",):
                return f"{label} — {remainder}" if remainder else label
            return label

    # Fallback: clean up underscores/dashes
    return name.replace("_", " ").replace("-", " ").strip()

def parse_date_from_filename(filename):
    """Extract YYYYMMDD from filename if present, return as YYYY-MM-DD."""
    import re
    m = re.search(r"(\d{8})", filename)
    if m:
        d = m.group(1)
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return None

# ── Folder scanning ───────────────────────────────────────────────────────────
def scan_folder_for_docs(access_token, drive_id, folder_path):
    """Return list of document dicts for all non-internal files in a flat folder."""
    try:
        children = list_folder_children(access_token, drive_id, folder_path)
    except Exception as e:
        print(f"  Warning: could not read {folder_path}: {e}")
        return []

    docs = []
    for item in children:
        name = item["name"]
        is_folder = "folder" in item

        # Skip Internal Only folder entirely
        if is_folder and name == SKIP_FOLDER_NAME:
            continue
        # Skip other subfolders (not expected at this level, but be safe)
        if is_folder:
            continue

        item_id = item["id"]
        try:
            link = create_sharing_link(access_token, drive_id, item_id)
        except Exception as e:
            print(f"  Warning: could not create link for {name}: {e}")
            continue

        date = parse_date_from_filename(name) or item.get("lastModifiedDateTime", "")[:10]
        label = infer_label(name)
        is_draft = "DRAFT" in name.upper()

        doc = {
            "label":    label,
            "filename": name,
            "url":      link,
            "date":     date,
        }
        if is_draft:
            doc["draft"] = True
        docs.append(doc)

    # Sort: agendas first, then minutes, then rest alphabetically
    def sort_key(d):
        l = d["label"].lower()
        if l.startswith("agenda"):   return (0, l)
        if l.startswith("minutes"):  return (1, l)
        return (2, l)
    docs.sort(key=sort_key)
    return docs

def parse_meeting_folder_name(name, meeting_type):
    """Parse RTBM_YYYYMMDD or STBM_YYYYMMDD into id, title, date."""
    import re
    m = re.search(r"(\d{8})$", name)
    if not m:
        return None
    raw = m.group(1)
    date_str = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    month_year = dt.strftime("%B %Y")

    if meeting_type == "regular":
        meeting_id = f"regular-{date_str}"
        title = f"Regular Town Board Meeting — {month_year}"
    else:
        meeting_id = f"special-{date_str}"
        title = f"Special Town Board Meeting — {dt.strftime('%B %-d, %Y')}"

    return {"id": meeting_id, "title": title, "date": date_str}

# ── Main build ────────────────────────────────────────────────────────────────
def build_data_json(access_token, drive_id):
    meetings = []

    # ── 1. Next Meeting (upcoming) ────────────────────────────────────────────
    print("Scanning Next Meeting...")
    next_docs = scan_folder_for_docs(access_token, drive_id, NEXT_MEETING_PATH)

    # Infer the next meeting date from the agenda filename if possible
    import re
    next_date = None
    next_title = "Upcoming Town Board Meeting"
    for doc in next_docs:
        m = re.search(r"(\d{8})", doc["filename"])
        if m:
            raw = m.group(1)
            next_date = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
            dt = datetime.strptime(next_date, "%Y-%m-%d")
            # Detect if special from filename
            if "STBM" in doc["filename"] or "TBSM" in doc["filename"]:
                next_title = f"Special Town Board Meeting — {dt.strftime('%B %-d, %Y')}"
                next_type = "special"
            else:
                next_title = f"Regular Town Board Meeting — {dt.strftime('%B %Y')}"
                next_type = "regular"
            break

    if not next_date:
        next_date = datetime.today().strftime("%Y-%m-%d")
        next_type = "regular"

    meetings.append({
        "id":        f"{next_type}-{next_date}",
        "title":     next_title,
        "type":      next_type,
        "status":    "upcoming",
        "date":      next_date,
        "time":      "6:05 PM",
        "location":  "Winchester Town Hall",
        "documents": next_docs,
    })

    # ── 2. Previous Regular Meetings ──────────────────────────────────────────
    print("Scanning Previous Regular Meetings...")
    try:
        reg_folders = list_folder_children(access_token, drive_id, PREV_REGULAR_PATH)
    except Exception as e:
        print(f"  Warning: {e}")
        reg_folders = []

    reg_meetings = []
    for item in reg_folders:
        if "folder" not in item:
            continue
        name = item["name"]
        parsed = parse_meeting_folder_name(name, "regular")
        if not parsed:
            continue
        folder_path = f"{PREV_REGULAR_PATH}/{name}"
        print(f"  Scanning {name}...")
        docs = scan_folder_for_docs(access_token, drive_id, folder_path)
        reg_meetings.append({
            "id":        parsed["id"],
            "title":     parsed["title"],
            "type":      "regular",
            "status":    "complete",
            "date":      parsed["date"],
            "documents": docs,
        })

    reg_meetings.sort(key=lambda m: m["date"], reverse=True)
    meetings.extend(reg_meetings)

    # ── 3. Previous Special Meetings ──────────────────────────────────────────
    print("Scanning Previous Special Meetings...")
    try:
        spec_folders = list_folder_children(access_token, drive_id, PREV_SPECIAL_PATH)
    except Exception as e:
        print(f"  Warning: {e}")
        spec_folders = []

    spec_meetings = []
    for item in spec_folders:
        if "folder" not in item:
            continue
        name = item["name"]
        parsed = parse_meeting_folder_name(name, "special")
        if not parsed:
            continue
        folder_path = f"{PREV_SPECIAL_PATH}/{name}"
        print(f"  Scanning {name}...")
        docs = scan_folder_for_docs(access_token, drive_id, folder_path)
        spec_meetings.append({
            "id":        parsed["id"],
            "title":     parsed["title"],
            "type":      "special",
            "status":    "complete",
            "date":      parsed["date"],
            "documents": docs,
        })

    spec_meetings.sort(key=lambda m: m["date"], reverse=True)
    meetings.extend(spec_meetings)

    return {"meetings": meetings}

# ── GitHub write ──────────────────────────────────────────────────────────────
def write_to_github(data):
    headers = {
        "Authorization": f"Bearer {GH_PAT}",
        "Accept": "application/vnd.github+json",
    }
    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}"

    # Get current SHA (needed to update existing file)
    r = requests.get(api_url, headers=headers)
    sha = r.json().get("sha") if r.status_code == 200 else None

    content = json.dumps(data, indent=2, ensure_ascii=False)
    encoded = base64.b64encode(content.encode()).decode()

    payload = {
        "message": f"Auto-sync from SharePoint [{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}]",
        "content": encoded,
    }
    if sha:
        payload["sha"] = sha

    r = requests.put(api_url, headers=headers, json=payload)
    r.raise_for_status()
    print(f"data.json updated successfully.")

# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    print("Authenticating with Microsoft Graph...")
    access_token, new_refresh = get_token()

    print("Locating SharePoint site and drive...")
    site_id  = get_site_id(access_token)
    drive_id = get_drive_id(access_token, site_id)

    print("Building data.json from SharePoint...")
    data = build_data_json(access_token, drive_id)

    total_docs = sum(len(m["documents"]) for m in data["meetings"])
    print(f"Found {len(data['meetings'])} meetings, {total_docs} documents total.")

    print("Writing to GitHub...")
    write_to_github(data)
    print("Done.")

if __name__ == "__main__":
    main()
