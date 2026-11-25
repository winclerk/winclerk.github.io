"""
system_health.py - writes the status report the Clerk Hub's "System status" page reads.

Runs in GitHub Actions right after every portal sync (and on a backup timer).
It checks, as the Winchester Sync app:
  * that it can still sign in to Microsoft (Graph token),
  * that it can read SharePoint (the Town Board site),
  * Microsoft's own service health for Exchange, SharePoint, OneDrive, Teams,
    Entra and the Microsoft 365 suite (needs ServiceHealth.Read.All; until
    that is granted it reports "no_permission" instead of failing),
  * the last 10 runs of the "Sync SharePoint to data.json" workflow, and when
    data.json last changed.

It writes everything to ClerkHubStatus/winchester-status-portal.json in the
System Status SharePoint site's Documents library. The Clerk Hub decides red/yellow/green;
this script only reports facts, so thresholds live in one place (the hub).

It never fails the workflow: whatever it can't check is reported as an error
in the file. If it can't sign in at all, it can't write the file either, and
the hub shows the report as overdue, which is the warning.

Env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, GITHUB_TOKEN,
     GITHUB_REPOSITORY (set by Actions).
"""

import json
import os
import sys
from datetime import datetime, timezone

import requests

GRAPH = "https://graph.microsoft.com/v1.0"
GITHUB_API = "https://api.github.com"
HOST = "townofwinchester54557.sharepoint.com"
READ_CHECK_SITE = "/sites/TownBoard"          # SharePoint read check
STATUS_SITE = "/sites/SystemStatus"           # where the report is written
STATUS_FOLDER = "ClerkHubStatus"                # folder in that site's Documents library
STATUS_FILE = "winchester-status-portal.json"
SYNC_WORKFLOW_FILE = "sync.yml"
WATCH_SERVICES = ("exchange", "sharepoint", "onedrive", "teams", "entra", "microsoft 365 suite")
TIMEOUT = 20


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def short_error(e):
    resp = getattr(e, "response", None)
    if resp is not None:
        detail = ""
        try:
            detail = resp.json().get("error", {}).get("message", "")
        except Exception:  # noqa: BLE001
            detail = (resp.text or "")[:160]
        return f"HTTP {resp.status_code}" + (f": {detail[:160]}" if detail else "")
    return f"{type(e).__name__}: {str(e)[:200]}"


def get_token():
    tenant = os.environ.get("AZURE_TENANT_ID", "")
    client = os.environ.get("AZURE_CLIENT_ID", "")
    secret = os.environ.get("AZURE_CLIENT_SECRET", "")
    if not all([tenant, client, secret]):
        raise RuntimeError("missing AZURE_* secrets")
    r = requests.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={"client_id": client, "client_secret": secret,
              "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"},
        timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["access_token"]


def graph_get(token, path, params=None):
    r = requests.get(GRAPH + path, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def check_sharepoint_read(token):
    site = graph_get(token, f"/sites/{HOST}:{READ_CHECK_SITE}", {"$select": "id"})
    graph_get(token, f"/sites/{site['id']}/drive/root", {"$select": "id"})
    return {"ok": True, "checked": now_iso()}


def watched(name):
    n = (name or "").lower()
    return any(w in n for w in WATCH_SERVICES)


def check_service_health(token):
    try:
        overview = graph_get(token, "/admin/serviceAnnouncement/healthOverviews", {"$select": "service,status"})
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 0
        if code in (401, 403):
            return {"state": "no_permission", "checked": now_iso(),
                    "message": "Winchester Sync needs ServiceHealth.Read.All (admin consent)"}
        raise
    services = [{"name": s.get("service", ""), "status": s.get("status", "")}
                for s in overview.get("value", []) if watched(s.get("service"))]
    issues = []
    try:
        data = graph_get(token, "/admin/serviceAnnouncement/issues", {
            "$filter": "isResolved eq false",
            "$select": "id,title,service,status,classification,lastModifiedDateTime",
            "$top": "50"})
        for i in data.get("value", []):
            if watched(i.get("service")):
                issues.append({k: i.get(k, "") for k in
                               ("id", "title", "service", "status", "classification", "lastModifiedDateTime")})
        issues.sort(key=lambda i: i.get("lastModifiedDateTime", ""), reverse=True)
    except Exception as e:  # noqa: BLE001 - the overview alone is still useful
        print(f"issues list unavailable: {short_error(e)}", file=sys.stderr)
    return {"state": "ok", "checked": now_iso(), "services": services, "issues": issues[:8]}


def github_get(path, params=None):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    tok = os.environ.get("GITHUB_TOKEN", "")
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    r = requests.get(GITHUB_API + path, headers=headers, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def check_sync(repo):
    data = github_get(f"/repos/{repo}/actions/workflows/{SYNC_WORKFLOW_FILE}/runs", {"per_page": "10"})
    runs = [{
        "id": r.get("id"),
        "status": r.get("status"),            # queued / in_progress / completed
        "conclusion": r.get("conclusion"),    # success / failure / cancelled / ... (None while running)
        "event": r.get("event"),
        "started": r.get("run_started_at") or r.get("created_at"),
        "updated": r.get("updated_at"),
        "url": r.get("html_url"),
    } for r in data.get("workflow_runs", [])]
    out = {"ok": True, "checked": now_iso(), "runs": runs}
    try:
        commits = github_get(f"/repos/{repo}/commits", {"path": "data.json", "per_page": "1"})
        if commits:
            out["data_json_changed"] = commits[0]["commit"]["committer"]["date"]
    except Exception as e:  # noqa: BLE001
        out["data_json_error"] = short_error(e)
    return out


def write_report(token, report):
    drive = graph_get(token, f"/sites/{HOST}:{STATUS_SITE}:/drive", {"$select": "id"})
    body = json.dumps(report, indent=1).encode("utf-8")
    r = requests.put(f"{GRAPH}/drives/{drive['id']}/root:/{STATUS_FOLDER}/{STATUS_FILE}:/content",
                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                     data=body, timeout=TIMEOUT)
    r.raise_for_status()


def build_report(token, token_error, repo):
    report = {"version": 1, "generated": now_iso(), "reporter": "system_health.py (GitHub Actions)",
              "run_url": os.environ.get("RUN_URL", "")}
    report["graph_token"] = {"ok": token is not None, "checked": now_iso()}
    if token_error:
        report["graph_token"]["error"] = token_error

    if token:
        try:
            report["sharepoint_read"] = check_sharepoint_read(token)
        except Exception as e:  # noqa: BLE001
            report["sharepoint_read"] = {"ok": False, "checked": now_iso(), "error": short_error(e)}
        try:
            report["m365_health"] = check_service_health(token)
        except Exception as e:  # noqa: BLE001
            report["m365_health"] = {"state": "error", "checked": now_iso(), "message": short_error(e)}

    try:
        report["sync"] = check_sync(repo)
    except Exception as e:  # noqa: BLE001
        report["sync"] = {"ok": False, "checked": now_iso(), "error": short_error(e), "runs": []}
    return report


def main():
    repo = os.environ.get("GITHUB_REPOSITORY", "winclerk/winclerk.github.io")
    token, token_error = None, None
    try:
        token = get_token()
    except Exception as e:  # noqa: BLE001
        token_error = short_error(e)

    report = build_report(token, token_error, repo)
    print(json.dumps(report, indent=1))

    if token is None:
        print(f"Can't sign in to Microsoft ({token_error}), so the report can't be saved. "
              "The hub will show the report as overdue.", file=sys.stderr)
        return 0
    try:
        write_report(token, report)
        print(f"Saved {STATUS_FILE} to {STATUS_SITE}")
    except Exception as e:  # noqa: BLE001
        print(f"Couldn't save {STATUS_FILE} to {STATUS_SITE}: {short_error(e)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
