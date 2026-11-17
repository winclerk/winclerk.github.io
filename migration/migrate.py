"""One-time copy of website agendas/minutes into SharePoint.

Reads a manifest (migration/manifest_<batch>.json). Each entry names a file
on winchesterwi.com and where it belongs in SharePoint: site, library,
folder and new file name.

DRY_RUN=true (the default) changes nothing. It checks every source file
downloads, every destination library exists, and whether a file with the
new name is already there, then writes the full plan to the run summary.

DRY_RUN=false copies the files. It never overwrites: a destination name
that already exists is skipped and reported. Folders are created as needed.
Nothing on the website is changed or deleted.
"""
import json
import os
import sys
import time
from urllib.parse import quote

import requests

HOST = "townofwinchester54557.sharepoint.com"
GRAPH = "https://graph.microsoft.com/v1.0"
SMALL_LIMIT = 4 * 1024 * 1024
UA = {"User-Agent": "Mozilla/5.0 (Winchester records migration)"}


def token():
    r = requests.post(
        f"https://login.microsoftonline.com/{os.environ['AZURE_TENANT_ID']}/oauth2/v2.0/token",
        data={"client_id": os.environ["AZURE_CLIENT_ID"],
              "client_secret": os.environ["AZURE_CLIENT_SECRET"],
              "scope": "https://graph.microsoft.com/.default",
              "grant_type": "client_credentials"}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


class Graph:
    def __init__(self):
        self.tok = token()
        self.drives = {}

    def h(self, extra=None):
        d = {"Authorization": f"Bearer {self.tok}"}
        d.update(extra or {})
        return d

    def get(self, url):
        r = requests.get(url, headers=self.h(), timeout=30)
        return r

    def drive(self, site, library):
        key = (site, library)
        if key not in self.drives:
            r = self.get(f"{GRAPH}/sites/{HOST}:{site}")
            r.raise_for_status()
            sid = r.json()["id"]
            r = self.get(f"{GRAPH}/sites/{sid}/drives")
            r.raise_for_status()
            match = [d for d in r.json()["value"] if d["name"] == library]
            if not match:
                raise RuntimeError(f"library '{library}' not found on {site}")
            self.drives[key] = match[0]["id"]
        return self.drives[key]

    def item(self, drive_id, path):
        r = self.get(f"{GRAPH}/drives/{drive_id}/root:/{quote(path)}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def ensure_folder(self, drive_id, folder):
        parent = "root"
        built = ""
        for part in [p for p in folder.split("/") if p]:
            built = f"{built}/{part}" if built else part
            existing = self.item(drive_id, built)
            if existing:
                parent = existing["id"]
                continue
            r = requests.post(f"{GRAPH}/drives/{drive_id}/items/{parent}/children",
                              headers=self.h({"Content-Type": "application/json"}),
                              json={"name": part, "folder": {},
                                    "@microsoft.graph.conflictBehavior": "fail"}, timeout=30)
            if r.status_code == 409:
                parent = self.item(drive_id, built)["id"]
            else:
                r.raise_for_status()
                parent = r.json()["id"]
        return parent

    def upload(self, drive_id, folder_id, name, data):
        if len(data) <= SMALL_LIMIT:
            r = requests.put(
                f"{GRAPH}/drives/{drive_id}/items/{folder_id}:/{quote(name)}:/content"
                "?@microsoft.graph.conflictBehavior=fail",
                headers=self.h({"Content-Type": "application/octet-stream"}), data=data, timeout=120)
            r.raise_for_status()
            return
        r = requests.post(f"{GRAPH}/drives/{drive_id}/items/{folder_id}:/{quote(name)}:/createUploadSession",
                          headers=self.h({"Content-Type": "application/json"}),
                          json={"item": {"@microsoft.graph.conflictBehavior": "fail"}}, timeout=30)
        r.raise_for_status()
        url = r.json()["uploadUrl"]
        chunk = 5 * 320 * 1024
        for start in range(0, len(data), chunk):
            part = data[start:start + chunk]
            end = start + len(part) - 1
            r = requests.put(url, data=part, timeout=120,
                             headers={"Content-Range": f"bytes {start}-{end}/{len(data)}"})
            r.raise_for_status()


def main():
    batch = os.environ.get("BATCH", "2025")
    dry = os.environ.get("DRY_RUN", "true").lower() != "false"
    manifest = json.load(open(f"migration/manifest_{batch}.json"))
    g = Graph()
    rows, problems = [], 0

    for e in manifest["files"]:
        dest = f"{e['folder']}/{e['name']}" if e["folder"] else e["name"]
        where = f"{e['site']} › {e['library']} › {dest}"
        status = ""
        try:
            drive_id = g.drive(e["site"], e["library"])
            src = requests.get(e["source"], headers=UA, timeout=60)
            if src.status_code != 200 or not src.content:
                status = f"SOURCE MISSING ({src.status_code})"
                problems += 1
            elif g.item(drive_id, dest):
                status = "already in SharePoint, skipped"
            elif dry:
                status = f"would copy ({len(src.content) // 1024} KB)"
            else:
                folder_id = g.ensure_folder(drive_id, e["folder"]) if e["folder"] else "root"
                g.upload(drive_id, folder_id, e["name"], src.content)
                status = "copied"
                time.sleep(0.3)
        except Exception as ex:  # report and keep going
            status = f"ERROR: {str(ex)[:160]}"
            problems += 1
        rows.append((e["source"].rsplit("/", 1)[-1], where, status, e.get("note", "")))
        print(f"{status:32} {where}")

    mode = "DRY RUN (nothing changed)" if dry else "COPY"
    out = [f"## Migration batch {batch}: {mode}", "",
           f"{len(rows)} files, {problems} problem(s).", "",
           "| Website file | Destination | Result | Approval note |", "| --- | --- | --- | --- |"]
    out += [f"| {a} | {b} | {c} | {d} |" for a, b, c, d in rows]
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        open(summary, "a").write("\n".join(out) + "\n")
    open(f"migration/report_{batch}.md", "w").write("\n".join(out) + "\n")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
