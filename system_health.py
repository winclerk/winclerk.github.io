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

Then it emails Luke if anything is down or out of sync (portal sync, a window
sign, a Microsoft outage), once when it breaks and once when it's fixed.

It never fails the workflow: whatever it can't check is reported as an error
in the file. If it can't sign in at all, it can't write the file either, and
the hub shows the report as overdue, which is the warning.

Env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, GITHUB_TOKEN,
     GITHUB_REPOSITORY (set by Actions).
"""

import html
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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

# Email alerts (same rules as the Clerk Hub's red lights)
ALERT_TO = "luke@winchester.wi.gov"
SEND_FROM = "luke@winchester.wi.gov"
ALERT_STATE_FILE = "alert-state.json"
HUB_URL = "https://claude.ai/artifact/WkGzEtzk7daFTES3Q3DQ9y"
CENTRAL = ZoneInfo("America/Chicago")


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
    # Every open issue for the watched services, so the hub can tell a real incident from
    # Microsoft's minor "advisory" notices. Microsoft pages the list; follow every page.
    issues, complete = [], True
    try:
        data = graph_get(token, "/admin/serviceAnnouncement/issues", {
            "$filter": "isResolved eq false",
            "$select": "id,title,service,status,classification,lastModifiedDateTime",
            "$top": "100"})
        for _ in range(20):
            for i in data.get("value", []):
                if watched(i.get("service")):
                    issues.append({k: i.get(k, "") for k in
                                   ("id", "title", "service", "status", "classification", "lastModifiedDateTime")})
            nxt = data.get("@odata.nextLink")
            if not nxt:
                break
            r = requests.get(nxt, headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
            r.raise_for_status()
            data = r.json()
        else:
            complete = False
        # incidents first, then newest
        issues.sort(key=lambda i: i.get("lastModifiedDateTime", ""), reverse=True)
        issues.sort(key=lambda i: 0 if str(i.get("classification", "")).lower() == "incident" else 1)
    except Exception as e:  # noqa: BLE001 - the overview alone is still useful
        complete = False
        print(f"issues list unavailable: {short_error(e)}", file=sys.stderr)
    return {"state": "ok", "checked": now_iso(), "services": services,
            "issues": issues[:40], "issues_complete": complete and len(issues) <= 40}


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


# ---------------------------------------------------------------- email alerts
# Runs after the report is saved. Emails Luke when something turns red (down or out
# of sync) and again when it's fixed. It remembers what it already reported in
# ClerkHubStatus/alert-state.json, so a problem is emailed once, not every hour.

def _parse(ts):
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _clock(ts):
    d = _parse(ts)
    if not d:
        return "an unknown time"
    d = d.astimezone(CENTRAL)
    today = datetime.now(CENTRAL).date()
    t = d.strftime("%I:%M %p").lstrip("0")
    return t if d.date() == today else d.strftime("%b %d, ").replace(" 0", " ") + t


def sync_allowance(now):
    """Same as the hub: syncs run at :45 from 6:45 AM to 11:45 PM Central."""
    c = now.astimezone(CENTRAL)
    t = c.hour + c.minute / 60
    if t >= 7.5 or t < 0.75:
        return timedelta(hours=2)
    return timedelta(hours=t + (24 - 23.83) + 2)


def sync_problem(sync, now):
    if not sync or not sync.get("ok"):
        return None                     # can't tell; the hub shows this as "needs a look"
    runs = sorted(sync.get("runs") or [], key=lambda r: r.get("started") or r.get("updated") or "", reverse=True)
    done = [r for r in runs if r.get("status") == "completed" and r.get("conclusion") not in ("cancelled", "skipped")]
    ok = next((r for r in done if r.get("conclusion") == "success"), None)
    fails = 0
    for r in done:
        if r.get("conclusion") == "success":
            break
        fails += 1
    if not ok:
        return "None of the last portal syncs succeeded, so new SharePoint files aren't reaching the portal or the window sign."
    last = _parse(ok.get("updated") or ok.get("started"))
    if fails >= 2:
        return f"The last {fails} portal syncs failed. The last good one was at {_clock(ok.get('updated'))}."
    if last and now - last > sync_allowance(now) + timedelta(hours=2):
        return f"The portal is out of sync: the last good sync was at {_clock(ok.get('updated'))}."
    return None


def sign_problem(sign, now):
    checked = _parse(sign.get("checked"))
    if not checked or now - checked > timedelta(minutes=25):
        return (f"It hasn't checked in since {_clock(sign.get('checked'))}. "
                "The Pi may be off, unplugged, or off the Wi-Fi.")
    if sign.get("paused"):
        return None                     # stopped on purpose
    if sign.get("session_running") is False or sign.get("browser_running") is False:
        return "The sign page isn't open on the screen. Restart the Pi or double-click Start Window Sign."
    c = sign.get("content") or {}
    ok = _parse(c.get("last_success"))
    if not ok:
        return "It hasn't loaded any postings from the records portal."
    if now - ok > timedelta(minutes=60):
        return f"It's out of sync: it last got postings from the records portal at {_clock(c.get('last_success'))}."
    return None


def microsoft_problems(report):
    out = {}
    sp = report.get("sharepoint_read") or {}
    if sp and not sp.get("ok"):
        out["sharepoint"] = ("Microsoft 365", "The Winchester Sync app can't read SharePoint: "
                             + str(sp.get("error", "unknown error")) + ". Portal syncs will fail.")
    mh = report.get("m365_health") or {}
    if mh.get("state") == "ok":
        for sv in mh.get("services") or []:
            if sv.get("status") != "serviceInterruption":
                continue
            incidents = [i for i in mh.get("issues") or [] if i.get("service") == sv.get("name")
                         and str(i.get("classification", "")).lower() == "incident"]
            if incidents:
                out["ms:" + sv.get("name", "")] = ("Microsoft 365", f"Microsoft reports an outage in {sv.get('name')}: "
                                                    + incidents[0].get("title", "") + ".")
    return out


def _drive_id(token):
    return graph_get(token, f"/sites/{HOST}:{STATUS_SITE}:/drive", {"$select": "id"})["id"]


def read_status_files(token, drive):
    """Every sign check-in in the folder, plus the saved alert state."""
    kids = graph_get(token, f"/drives/{drive}/root:/{STATUS_FOLDER}:/children", {"$select": "name,id", "$top": "200"})
    signs, state = {}, {}
    for k in kids.get("value", []):
        name = k.get("name", "")
        if not (name.startswith("winchester-status-sign-") or name == ALERT_STATE_FILE):
            continue
        r = requests.get(f"{GRAPH}/drives/{drive}/items/{k['id']}/content",
                         headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
        r.raise_for_status()
        try:
            data = r.json()
        except ValueError:
            continue
        if name == ALERT_STATE_FILE:
            state = data if isinstance(data, dict) else {}
        else:
            signs[name] = data
    return signs, state


def current_problems(report, signs, now):
    probs = {}
    p = sync_problem(report.get("sync"), now)
    if p:
        probs["sync"] = ("Portal sync", p)
    probs.update(microsoft_problems(report))
    names = sorted(signs)
    for n in names:
        sg = signs[n] or {}
        label = sg.get("sign") or n.replace("winchester-status-sign-", "").replace(".json", "")
        p = sign_problem(sg, now)
        if p:
            title = "Window sign" if len(names) == 1 else f"Window sign ({label})"
            probs["sign:" + label] = (title, p)
    return probs


def alert_email(new, still, fixed):
    def items(d):
        return "".join(f"<li><b>{html.escape(t)}:</b> {html.escape(msg)}</li>" for t, msg in d.values())
    if new:
        subject = "Town systems: " + ", ".join(sorted({t for t, _ in new.values()})) + " needs attention"
    else:
        subject = "Town systems: " + ", ".join(sorted({t for t, _ in fixed.values()})) + " back to normal"
    parts = []
    if new:
        parts.append("<p>Something stopped working:</p><ul>" + items(new) + "</ul>")
    if still:
        parts.append("<p>Still not fixed from before:</p><ul>" + items(still) + "</ul>")
    if fixed:
        parts.append("<p>Working again:</p><ul>" + items(fixed) + "</ul>")
    body = ("<html><body style=\"font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1E2B2B\">"
            + "".join(parts)
            + f"<p>Details are in the <a href=\"{HUB_URL}\">Clerk Hub</a> (System status).</p>"
            + "<p style=\"color:#5C6B6A;font-size:13px\">Sent by the system health check that runs after each portal sync. "
            + "You get one email when something breaks and one when it's fixed.</p></body></html>")
    return subject, body


def send_mail(token, subject, body):
    payload = {"message": {"subject": subject, "body": {"contentType": "HTML", "content": body},
                           "toRecipients": [{"emailAddress": {"address": ALERT_TO}}]},
               "saveToSentItems": True}
    r = requests.post(f"{GRAPH}/users/{SEND_FROM}/sendMail", json=payload,
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, timeout=TIMEOUT)
    r.raise_for_status()


def check_alerts(token, report, now=None):
    """Compare what's red now with what was already emailed; email the difference."""
    now = now or datetime.now(timezone.utc)
    drive = _drive_id(token)
    signs, state = read_status_files(token, drive)
    probs = current_problems(report, signs, now)
    before = (state.get("active") or {}) if isinstance(state, dict) else {}
    new = {k: v for k, v in probs.items() if k not in before}
    still = {k: v for k, v in probs.items() if k in before}
    fixed = {k: (v.get("title", k), "Back to normal.") for k, v in before.items() if k not in probs}
    if not new and not fixed:
        print(f"Alerts: nothing new ({len(probs)} known problem(s))")
        return "none"
    subject, body = alert_email(new, still, fixed)
    send_mail(token, subject, body)          # only remember it once the email went out
    active = {k: {"title": t, "message": m, "since": (before.get(k) or {}).get("since") or now.strftime("%Y-%m-%dT%H:%M:%SZ")}
              for k, (t, m) in probs.items()}
    new_state = {"updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "active": active}
    r = requests.put(f"{GRAPH}/drives/{drive}/root:/{STATUS_FOLDER}/{ALERT_STATE_FILE}:/content",
                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                     data=json.dumps(new_state, indent=1).encode("utf-8"), timeout=TIMEOUT)
    r.raise_for_status()
    print(f"Alerts: emailed '{subject}'")
    return subject


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
    try:
        check_alerts(token, report)
    except Exception as e:  # noqa: BLE001 - alerts must never break the report
        print(f"Alerts not checked: {short_error(e)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
