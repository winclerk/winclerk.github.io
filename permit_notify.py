"""
permit_notify.py — notify applicants (email) and the Town Board (Teams) on
permit status changes.

Called from sync.py's hook AFTER sync_permits() returns, using the same rows
already fetched (no re-download). Tracks last-notified status per permit in
permit_notify_state.json (committed to the winclerk repo) and fires only on
STATUS TRANSITIONS to {received, approved, approved conditionally, denied}.

Send rules (all four notifications) — restrictive per Clerk's spec:
  received                → only if permit_number AND board_date are set
  approved                → fires on transition (no extra requirement)
  approved conditionally  → only if conditions field is non-empty
  denied                  → only if clerk_notes field is non-empty (denial reason)

Multi-type — works for ROW, Driveway, and Road Construction. Email content
adapts to each permit type. Driveway applicants keep their applicant/email in
the internal record even though those fields aren't shown publicly.

Applicant email requires the Winchester Sync Azure app to have Mail.Send
(application) granted by an admin. Emails send as clerk@winchester.wi.gov.

Teams notification is delivered by POSTing a JSON payload to the Make.com
webhook, which routes to the Permits group chat via the fallback (status_change)
route on the router.
"""

import json
import os
import re
from datetime import datetime, date, timezone
from html import escape

import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

STATE_FILE = "permit_notify_state.json"
CLERK_EMAIL = "clerk@winchester.wi.gov"
# clerk@ is not a valid Graph user mailbox in the tenant right now (returns 404
# ErrorInvalidUser). Send from luke@ instead — that's a real user mailbox. Footer
# and reply-to still reference clerk@ so the applicant knows where to reach the
# office. Revisit if/when clerk@ is set up as a proper shared mailbox in M365.
SEND_FROM   = "luke@winchester.wi.gov"

MAKE_WEBHOOK_URL = "https://hook.us2.make.com/gatf2jagb2qfxkmczko6gugq2qx80uxr"

NOTIFY_STATUSES = {"received", "approved", "approved conditionally", "denied"}

STATUS_LABELS = {
    "received":               "Received",
    "approved":               "Approved",
    "approved conditionally": "Approved with conditions",
    "denied":                 "Denied",
}

# Per-type display labels for use in email subjects and body copy.
TYPE_DISPLAY = {
    "row":               {"noun": "right-of-way permit",   "short": "ROW permit"},
    "driveway":          {"noun": "driveway permit",       "short": "Driveway permit"},
    "road_construction": {"noun": "road construction project", "short": "Road construction project"},
}


# ══════════════════════════════════════════════════════════════
# State (last-notified status per permit)
# ══════════════════════════════════════════════════════════════
def _load_state():
    """Load state from local file (populated by actions/checkout from the repo).
       Falls back to empty dict if unreadable."""
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("permits", {}) if isinstance(data, dict) else {}
    except Exception as e:
        print(f"   ! state file unreadable ({e}) — starting fresh")
        return {}


def _save_state(state, write_github_fn=None):
    """Persist state. If write_github_fn is provided, commit the state file
       back to the repo so it survives across GitHub Actions runs. Otherwise
       write to a local file (standalone/dev use only)."""
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "permits": state,
    }
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    if write_github_fn is not None:
        try:
            write_github_fn(STATE_FILE, body)
        except Exception as e:
            print(f"   ! could not persist notify state to repo ({e})")
    else:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            f.write(body)


# ══════════════════════════════════════════════════════════════
# Value helpers
# ══════════════════════════════════════════════════════════════
def _s(v):
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def _fmt_date(v):
    t = _s(v)
    if not t:
        return ""
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(t[:10], fmt).strftime("%B %d, %Y")
        except ValueError:
            continue
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T", t)
    if m:
        try:
            return datetime.strptime(m.group(1), "%Y-%m-%d").strftime("%B %d, %Y")
        except ValueError:
            pass
    return t


def _valid_email(s):
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", s or ""))


def _permit_key(row):
    """Stable identifier for a row across syncs. Uses permit_number since
       we've dropped internal permit_id/project_id columns."""
    pn = _s(row.get("permit_number"))
    if pn:
        return pn
    # Fallback for pre-numbered rows: use submitted timestamp
    sub = _s(row.get("submitted"))
    return f"sub:{sub}" if sub else ""


# ══════════════════════════════════════════════════════════════
# Send-rule gating — applied BEFORE emails/Teams post fires
# ══════════════════════════════════════════════════════════════
def _should_notify(row, new_status):
    """Return (should_send, skip_reason). skip_reason is human-readable for logs."""
    if new_status == "received":
        if not _s(row.get("permit_number")):
            return False, "no permit_number"
        if not _s(row.get("board_date")):
            return False, "no board_date"
        return True, None
    if new_status == "approved":
        return True, None
    if new_status == "approved conditionally":
        if not _s(row.get("conditions")):
            return False, "no conditions listed"
        return True, None
    if new_status == "denied":
        if not _s(row.get("clerk_notes")):
            return False, "no denial reason in clerk_notes"
        return True, None
    return False, "status not notified"


# ══════════════════════════════════════════════════════════════
# Per-type title/location/applicant extraction
# ══════════════════════════════════════════════════════════════
def _row_title(row, permit_type):
    if permit_type == "driveway":
        return "Driveway permit application"
    return _s(row.get("title")) or _s(row.get("type")) or "Permit application"


def _row_location(row, permit_type):
    if permit_type == "row":
        road = _s(row.get("road"))
        addr = _s(row.get("address"))
        if road and addr:
            return addr if road.lower() in addr.lower() else f"{road} \u2014 {addr}"
        return road or addr or ""
    if permit_type == "driveway":
        road = _s(row.get("road"))
        parcel = _s(row.get("parcel"))
        if road and parcel:
            return f"{road} \u2014 {parcel}"
        return road or parcel or ""
    # road_construction
    return _s(row.get("road"))


def _applicant_name(row, permit_type):
    """Best-effort applicant display name for the email greeting."""
    if permit_type == "driveway":
        return _s(row.get("applicant")) or "there"
    # ROW / RC: applicant is a name; org is the company
    return _s(row.get("applicant")) or _s(row.get("org")) or "there"


# ══════════════════════════════════════════════════════════════
# Email body builder (multi-type)
# ══════════════════════════════════════════════════════════════
def _applicant_body(row, permit_type, new_status):
    title = _row_title(row, permit_type)
    location = _row_location(row, permit_type)
    applicant = _applicant_name(row, permit_type)
    noun = TYPE_DISPLAY.get(permit_type, {}).get("noun", "permit")

    if new_status == "received":
        headline = "We have received your permit application"
        lead = (
            f"Hello {escape(applicant)},<br><br>"
            f"The Town Clerk has received your {escape(noun)} application. "
            f"It has been assigned a permit number and scheduled for Board review."
        )
        next_step = (
            "You will receive another email once the Board acts on your application. "
            "If you need to update any information in the meantime, contact the Town Clerk."
        )
    elif new_status == "approved":
        headline = "Your permit application has been approved"
        lead = (
            f"Hello {escape(applicant)},<br><br>"
            f"The Town Board has approved your {escape(noun)} application."
        )
        if permit_type == "row":
            next_step = (
                "A certificate of insurance is required before work begins, and you must "
                "call Diggers Hotline at 811 before excavating."
            )
        elif permit_type == "driveway":
            next_step = (
                "The $100 permit fee is due if it has not been paid. "
                "Call Diggers Hotline at 811 before excavating. Contact the Town Clerk with any questions."
            )
        else:  # road_construction
            next_step = (
                "Confirm your traffic control plan with the Town before mobilizing. "
                "Contact the Town Clerk with any questions."
            )
    elif new_status == "approved conditionally":
        headline = "Your permit application has been approved with conditions"
        lead = (
            f"Hello {escape(applicant)},<br><br>"
            f"The Town Board has approved your {escape(noun)} application "
            f"subject to the conditions listed below. Please review them carefully."
        )
        next_step = (
            "You must satisfy all listed conditions to keep this permit in good standing. "
            "Contact the Town Clerk with any questions."
        )
    elif new_status == "denied":
        headline = "Your permit application was not approved"
        lead = (
            f"Hello {escape(applicant)},<br><br>"
            f"The Town Board reviewed your {escape(noun)} application and did not approve it. "
            f"The reason for the decision is included below."
        )
        next_step = (
            "If you would like to discuss the decision or resubmit with changes, "
            "please contact the Town Clerk."
        )
    else:
        return None  # shouldn't happen; filtered upstream

    approved_like = new_status in ("approved", "approved conditionally")
    conditions_text = _s(row.get("conditions")) if approved_like else ""
    denial_reason = _s(row.get("clerk_notes")) if new_status == "denied" else ""

    detail_pairs = [
        ("Project",       title),
        ("Location",      location),
        ("Permit number", _s(row.get("permit_number"))),
        ("Board meeting", _fmt_date(row.get("board_date"))),
    ]
    if approved_like:
        detail_pairs.append(("Authorized period", _date_range(row.get("authorized_start"), row.get("authorized_end"))))
    if conditions_text:
        detail_pairs.append(("Conditions", conditions_text))
    if denial_reason:
        detail_pairs.append(("Reason", denial_reason))

    return _wrap_html(headline, lead, _detail_rows(detail_pairs), next_step)


def _build_teams_payload(row, permit_type, new_status, old_status):
    """Compact JSON payload for the Make webhook. Make's router branches on
       event_type=status_change to send it via the fallback Teams module."""
    return {
        "event_type":       "status_change",
        "permit_type":      permit_type,
        "permit_number":    _s(row.get("permit_number")),
        "title":            _row_title(row, permit_type),
        "type":             _s(row.get("type")),
        "location":         _row_location(row, permit_type),
        "org":              _s(row.get("org")) or _s(row.get("applicant")),
        "status":           new_status,
        "status_label":     STATUS_LABELS.get(new_status, new_status.capitalize()),
        "old_status":       old_status,
        "board_date":       _s(row.get("board_date")),
        "authorized_start": _s(row.get("authorized_start")),
        "authorized_end":   _s(row.get("authorized_end")),
        "conditions":       _s(row.get("conditions")),
        "clerk_notes":      _s(row.get("clerk_notes")) if new_status == "denied" else "",
    }


def _send_teams_webhook(payload):
    try:
        r = requests.post(MAKE_WEBHOOK_URL, json=payload, timeout=30)
    except Exception as e:
        print(f"     ! Teams webhook failed: {e}")
        return False
    if 200 <= r.status_code < 300:
        return True
    print(f"     ! Teams webhook returned {r.status_code}: {r.text[:200]}")
    return False


def _date_range(a, b):
    fa, fb = _fmt_date(a), _fmt_date(b)
    if fa and fb:
        return f"{fa} through {fb}"
    return fa or fb or ""


def _detail_rows(pairs):
    live = [(lbl, val) for lbl, val in pairs if _s(val)]
    if not live:
        return ""
    trs = []
    for lbl, val in live:
        val_html = escape(str(val)).replace("\n", "<br>")
        trs.append(
            f'<tr>'
            f'<td style="padding:6px 14px 6px 0;vertical-align:top;font-weight:600;color:#555;font-size:13px;white-space:nowrap;">{escape(lbl)}</td>'
            f'<td style="padding:6px 0;vertical-align:top;color:#222;font-size:14px;">{val_html}</td>'
            f'</tr>'
        )
    return '<table style="border-collapse:collapse;margin:18px 0;width:100%;">' + "".join(trs) + "</table>"


def _wrap_html(headline, lead_html, rows_html, next_step):
    footer_lines = [
        "Town of Winchester &middot; 7228 CTH W, Winchester, WI 54557",
        f'715-686-2123 &middot; <a href="mailto:{CLERK_EMAIL}" style="color:#00505A;">{CLERK_EMAIL}</a>',
    ]
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
        '<body style="margin:0;padding:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;">'
        '<div style="max-width:640px;margin:0 auto;background:#fff;">'
        '<div style="background:#193C3C;padding:18px 26px;border-bottom:4px solid #A59664;">'
        '<div style="color:#A59664;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">Town of Winchester, Wisconsin</div>'
        '<div style="color:#fff;font-size:16px;margin-top:2px;">Permit tracker notification</div>'
        '</div>'
        '<div style="padding:28px 26px;">'
        f'<h1 style="margin:0 0 14px 0;color:#193C3C;font-size:22px;line-height:1.25;">{escape(headline)}</h1>'
        f'<div style="color:#222;font-size:15px;line-height:1.55;">{lead_html}</div>'
        f'{rows_html}'
        f'<div style="color:#333;font-size:14px;line-height:1.55;margin-top:6px;">{escape(next_step)}</div>'
        '</div>'
        '<div style="background:#F5F2EC;padding:16px 26px;color:#6b5f3e;font-size:11px;line-height:1.55;text-align:center;">'
        + "<br>".join(footer_lines) +
        '</div>'
        '</div>'
        '</body></html>'
    )


# ══════════════════════════════════════════════════════════════
# Send via Graph
# ══════════════════════════════════════════════════════════════
def _send(token, to_addr, subject, html_body):
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html_body},
            "toRecipients": [{"emailAddress": {"address": to_addr}}],
        },
        "saveToSentItems": True,
    }
    url = f"{GRAPH_BASE}/users/{SEND_FROM}/sendMail"
    r = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    if r.status_code == 202:
        return True
    print(f"     ! send failed ({r.status_code}) to {to_addr}: {r.text[:200]}")
    return False


# ══════════════════════════════════════════════════════════════
# Entry point — called from sync.py
# ══════════════════════════════════════════════════════════════
def notify_status_changes(token, all_rows_by_source, write_github_fn=None):
    """Compare current tracker rows against saved state, send email + Teams post
       on transitions that pass the restrictive send rules.

       all_rows_by_source: list of (source_config, rows) tuples returned by
       sync_permits.sync_permits(). Each row is a dict; each source_config has
       a 'type' key ('row' / 'driveway' / 'road_construction').

       write_github_fn: optional (path, content) writer. When provided, the
       state file is committed back to the repo so state persists across GitHub
       Actions runs. Without it, state writes are local only (dev/standalone).

       Returns (sent_count, skipped_count) for the log."""
    print("── Notifications ──")
    state = _load_state()
    new_state = dict(state)
    sent = 0
    skipped = 0

    for source, rows in all_rows_by_source:
        permit_type = source["type"]
        for row in rows:
            key = _permit_key(row)
            if not key:
                continue

            new_status = _s(row.get("map_status")).lower()
            old_status = state.get(key, "")

            if new_status == old_status:
                continue  # no change

            # Update tracked state for every change (so we don't re-notify next run
            # even if a send-rule blocks us from actually notifying now).
            new_state[key] = new_status

            if new_status not in NOTIFY_STATUSES:
                continue

            # Apply restrictive send rules
            should_send, skip_reason = _should_notify(row, new_status)
            if not should_send:
                print(f"   {key} \u2192 {new_status}: waiting ({skip_reason})")
                # Don't update state — leave it at old_status so next sync retries
                new_state[key] = old_status
                skipped += 1
                continue

            title = _row_title(row, permit_type)
            short_type = TYPE_DISPLAY.get(permit_type, {}).get("short", "Permit")
            subj_prefix = {
                "received":               f"{short_type} application received",
                "approved":               f"{short_type} approved",
                "approved conditionally": f"{short_type} approved with conditions",
                "denied":                 f"{short_type} not approved",
            }[new_status]
            subject = f"{subj_prefix}: {title}"

            # Applicant email
            applicant_addr = _s(row.get("email"))
            if _valid_email(applicant_addr):
                body = _applicant_body(row, permit_type, new_status)
                if body and _send(token, applicant_addr, subject, body):
                    print(f"   {key} \u2192 {new_status}: applicant email {applicant_addr}")
                    sent += 1
            else:
                print(f"   {key} \u2192 {new_status}: no valid applicant email (skipping applicant email)")
                skipped += 1

            # Board Teams post
            if _send_teams_webhook(_build_teams_payload(row, permit_type, new_status, old_status)):
                print(f"   {key} \u2192 {new_status}: board Teams post sent")
                sent += 1

    _save_state(new_state, write_github_fn)
    print(f"   done. sent={sent}, skipped={skipped}")
    return sent, skipped
