"""
notify_failure.py — send a failure email when a sync workflow errors.

Called from GitHub Actions' `if: failure()` step. Takes workflow name and
run URL as arguments, sends a short email to the on-call Clerk so failures
don't sit silently until someone notices missing permit updates.

Deliberately self-contained — does NOT import from sync.py so it works even
when the failure was at the "Install dependencies" step (missing pypdf etc.).
Only requires `requests`, which every workflow installs first.

Usage:
    python notify_failure.py "workflow name" "https://github.com/.../runs/12345"

Requires: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET env vars.
"""

import os
import sys
from datetime import datetime, timezone

import requests


ALERT_TO = "luke@winchester.wi.gov"
SEND_FROM = "luke@winchester.wi.gov"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def _fetch_token():
    """Fetch a Graph API token via client credentials flow.
       Duplicated from sync.py's get_token() so this file has no local deps."""
    tenant = os.environ.get("AZURE_TENANT_ID", "")
    client = os.environ.get("AZURE_CLIENT_ID", "")
    secret = os.environ.get("AZURE_CLIENT_SECRET", "")
    if not all([tenant, client, secret]):
        raise RuntimeError("missing AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET env vars")
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    data = {
        "client_id": client,
        "client_secret": secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    r = requests.post(url, data=data, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    if len(sys.argv) < 3:
        print("Usage: notify_failure.py <workflow_name> <run_url>", file=sys.stderr)
        sys.exit(1)

    workflow_name = sys.argv[1]
    run_url = sys.argv[2]

    try:
        token = _fetch_token()
    except Exception as e:
        # If we can't even auth to Graph, log and give up. Don't want the
        # failure notifier to itself fail loudly and mask the original error.
        print(f"notify_failure: couldn't fetch Graph token ({e})", file=sys.stderr)
        sys.exit(0)

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    subject = f"[Winchester Sync Failed] {workflow_name}"
    body_html = f"""<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#222;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#8B0000;margin-top:0;">Winchester sync workflow failed</h2>
<p><b>Workflow:</b> {workflow_name}<br>
<b>Failed at:</b> {now_utc}</p>
<p><a href="{run_url}" style="display:inline-block;padding:8px 16px;background:#193C3C;color:#fff;text-decoration:none;border-radius:4px;">View run log</a></p>
<p style="color:#666;font-size:12px;margin-top:20px;">
This is an automated alert. Fix the error, then trigger the workflow manually to catch up.
Ignoring failures may cause permit submissions or notifications to be delayed.
</p>
</div></body></html>"""

    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body_html},
            "toRecipients": [{"emailAddress": {"address": ALERT_TO}}],
        },
        "saveToSentItems": True,
    }

    url = f"{GRAPH_BASE}/users/{SEND_FROM}/sendMail"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=15)
        if r.status_code in (200, 202):
            print(f"notify_failure: alert sent to {ALERT_TO}")
        else:
            print(f"notify_failure: send returned {r.status_code}: {r.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"notify_failure: send error ({e})", file=sys.stderr)


if __name__ == "__main__":
    main()
