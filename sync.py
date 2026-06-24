import os
import json
import base64
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
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


def get_site_id(token):
    url = f"https://graph.microsoft.com/v1.0/sites/{SITE_HOSTNAME}:{SITE_PATH}"
    return graph_get(token, url)["id"]


def get_drive_id(token, site_id):
    url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
    for d in graph_get(token, url)["value"]:
        if d["name"] == LIBRARY_NAME:
            return d["id"]
    raise ValueError(f"Drive '{LIBRARY_NAME}' not found")


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


def infer_label(filename):
    import re
    name = filename
    for ext in [".pdf", ".docx", ".xlsx", ".doc", ".xls", ".pptx"]:
        if name.lower().endswith(ext):
            name = name[:-len(ext)]
            break
    prefixes = {
        "Agenda_RTBM_": "Agenda", "Agenda_STBM_": "Agenda",
        "Agenda_TBSM_": "Agenda", "Agenda_BOR_": "Agenda (Board of Review)",
        "Agenda_": "Agenda", "Minutes_RTBM_": "Minutes",
        "Minutes_STBM_": "Minutes", "Minutes_TBSM_": "Minutes",
        "Minutes_": "Minutes", "Resolution_": "Resolution",
        "Ordinance_": "Ordinance", "Policy_": "Policy",
        "Procedure_": "Procedure", "Permit_": "Permit",
        "Report_Clerk_": "Clerk Report", "Report_Treasurer_": "Treasurer Report",
        "Report_NEMSD_": "NEMSD Report", "Report_Pedalers_": "Pedalers Report",
        "Report_": "Report", "Form_": "Form", "Handbook_": "Handbook",
    }
    for prefix, label in prefixes.items():
        if name.startswith(prefix):
            r = name[len(prefix):]
            r = re.sub(r"_?\d{8}$", "", r)
            r = re.sub(r"_?DRAFT$", " (Draft)", r)
            r = r.replace("_", " ").replace("-", " - ").strip()
            return f"{label} - {r}" if r and r != "Draft" else label
    return name.replace("_", " ").replace("-", " ").strip()


def parse_date(filename):
    import re
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
        if l.startswith("agenda"): return (0, l)
        if l.startswith("minutes"): return (1, l)
        return (2, l)
    docs.sort(key=key)
    return docs


def parse_folder_name(name, mtype):
    import re
    m = re.search(r"(\d{8})$", name)
    if not m:
        return None
    raw = m.group(1)
    date_str = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    if mtype == "regular":
        return {"id": f"regular-{date_str}", "title": f"Regular Town Board Meeting - {dt.strftime('%B %Y')}", "date": date_str}
    else:
        return {"id": f"special-{date_str}", "title": f"Special Town Board Meeting - {dt.strftime('%B %-d, %Y')}", "date": date_str}


def build_data(token, drive_id):
    import re
    meetings = []

    print("Scanning Next Meeting...")
    next_docs = scan_folder(token, drive_id, NEXT_MEETING_PATH)
    next_date = None
    next_type = "regular"
    next_title = "Upcoming Town Board Meeting"
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
    if not next_date:
        next_date = datetime.today().strftime("%Y-%m-%d")
    meetings.append({
        "id": f"{next_type}-{next_date}", "title": next_title,
        "type": next_type, "status": "upcoming", "date": next_date,
        "time": "6:05 PM", "location": "Winchester Town Hall",
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
    payload = {"message": f"Auto-sync from SharePoint [{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}]", "content": content}
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
    print("Writing to GitHub...")
    write_github(data)
    print("Done.")


if __name__ == "__main__":
    main()
