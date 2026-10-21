"""
sync_templates.py — mirror Luke's TEMPLATES folder (OneDrive) into the private
winclerk/clerk-files repo, under templates/.

Cloud Claude sessions can't download Word files from SharePoint/OneDrive, so
they build documents from these copies instead.

Source: Luke's OneDrive
  WINCHESTER-TOWN-RECORDS/10_INTERNAL-ADMIN/TEMPLATES   (all files and subfolders,
  except the "Claude outputs" scratch folder)
Destination: <dest>/ (a checkout of clerk-files/templates). Files deleted or
renamed in OneDrive are removed here too, so the folder is an exact mirror.

This workflow runs in a PUBLIC repo, so its log prints counts only, never
file contents.

Usage: python sync_templates.py <dest_dir>
Requires: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.
"""

import os
import sys

import requests

GRAPH = "https://graph.microsoft.com/v1.0"
OWNER = "luke@winchester.wi.gov"
SOURCE = "WINCHESTER-TOWN-RECORDS/10_INTERNAL-ADMIN/TEMPLATES"
SKIP_FOLDERS = {"claude outputs"}


def token():
    r = requests.post(
        f"https://login.microsoftonline.com/{os.environ['AZURE_TENANT_ID']}/oauth2/v2.0/token",
        data={"client_id": os.environ["AZURE_CLIENT_ID"],
              "client_secret": os.environ["AZURE_CLIENT_SECRET"],
              "grant_type": "client_credentials",
              "scope": "https://graph.microsoft.com/.default"}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def children(tok, url):
    items = []
    while url:
        r = requests.get(url, headers={"Authorization": f"Bearer {tok}"}, timeout=60)
        r.raise_for_status()
        d = r.json()
        items += d.get("value", [])
        url = d.get("@odata.nextLink")
    return items


def walk(tok, item_id, rel, out):
    url = f"{GRAPH}/users/{OWNER}/drive/items/{item_id}/children?$select=id,name,folder,file,size&$top=200"
    for c in children(tok, url):
        sub = f"{rel}/{c['name']}" if rel else c["name"]
        if "folder" in c:
            if c["name"].strip().lower() in SKIP_FOLDERS:
                continue
            walk(tok, c["id"], sub, out)
        elif "file" in c:
            out[sub] = c["id"]


def main():
    dest = sys.argv[1]
    tok = token()
    enc = requests.utils.quote(SOURCE)
    r = requests.get(f"{GRAPH}/users/{OWNER}/drive/root:/{enc}",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    r.raise_for_status()
    files = {}
    walk(tok, r.json()["id"], "", files)
    if not files:
        # An empty listing more likely means an access problem than an empty
        # folder; refuse to wipe the mirror.
        print("No template files found; leaving the mirror untouched.")
        sys.exit(1)

    os.makedirs(dest, exist_ok=True)
    written = 0
    for rel, item_id in files.items():
        r = requests.get(f"{GRAPH}/users/{OWNER}/drive/items/{item_id}/content",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=120)
        r.raise_for_status()
        path = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        old = open(path, "rb").read() if os.path.exists(path) else None
        if old != r.content:
            with open(path, "wb") as f:
                f.write(r.content)
            written += 1

    removed = 0
    keep = {os.path.normpath(os.path.join(dest, rel)) for rel in files}
    for root, _, names in os.walk(dest):
        for n in names:
            p = os.path.normpath(os.path.join(root, n))
            if p not in keep:
                os.remove(p)
                removed += 1
    for root, dirs, names in sorted(os.walk(dest), reverse=True):
        if root != dest and not dirs and not names:
            os.rmdir(root)

    print(f"Templates: {len(files)} in OneDrive, {written} added/updated, {removed} removed.")


if __name__ == "__main__":
    main()
