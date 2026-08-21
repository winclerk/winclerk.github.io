"""
permit_notify.py — email applicants + Town Board on permit status changes.

Called from sync.py's sync_permits() with the raw tracker rows and the token
already obtained for Graph. Tracks last-notified status per permit in
permit_notify_state.json (committed to the winclerk repo) and emails on any
change to/among {proposed, approved, denied}.

Requires the Winchester Sync Azure app to have Mail.Send (application) granted
by an admin. Emails are sent as clerk@winchester.wi.gov.
"""

import io
import json
import os
import re
from datetime import datetime, date, timezone
from html import escape

import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

STATE_FILE = "permit_notify_state.json"
BOARD_EMAIL = "townboard@winchester.wi.gov"
CLERK_EMAIL = "clerk@winchester.wi.gov"
SEND_FROM   = "clerk@winchester.wi.gov"

# Only these three statuses trigger emails. "received" and "withdrawn" don't.
NOTIFY_STATUSES = {"proposed", "approved", "denied"}


# ── State (last-notified status per permit) ──────────────────────────
def _load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("permits", {}) if isinstance(data, dict) else {}
    except Exception as e:
        print(f"   ! state file unreadable ({e}) — starting fresh")
        return {}


def _save_state(state):
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "permits": state,
    }
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


# ── Value helpers ────────────────────────────────────────────────────
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
    # Try ISO first, then M/D/YYYY (Excel serial-converted output)
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(t[:len(fmt) + 6 if "T" in fmt else 10], fmt).strftime("%B %d, %Y")
        except ValueError:
            continue
    return t


def _valid_email(s):
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", s or ""))


def _permit_key(row):
    """Stable identifier for a row across syncs.
       permit_id when present, otherwise submitted-timestamp as fallback."""
    pid = _s(row.get("permit_id"))
    if pid:
        return pid
    sub = _s(row.get("submitted"))
    return f"sub:{sub}" if sub else ""


# ── Email body builders ─────────────────────────────────────────────
def _title_line(row):
    title = _s(row.get("title")) or "Permit Application"
    road  = _s(row.get("road"))
    where = _s(row.get("address"))
    parts = [p for p in [road, where] if p]
    return title, " — ".join(parts) if parts else ""


def _applicant_body(row, new_status, old_status):
    title, where = _title_line(row)
    applicant = _s(row.get("applicant")) or "Applicant"
    kind = _s(row.get("type")) or "permit"

    if new_status == "proposed":
        headline = "Your permit application is scheduled for Board review"
        lead = (
            f"Hello {escape(applicant)},<br><br>"
            f"The Town Clerk has completed the initial review of your {escape(kind.lower())} "
            f"application and forwarded it to the Town Board."
        )
        next_step = "The Board will consider your application at their next regular meeting."
    elif new_status == "approved":
        headline = "Your permit application has been approved"
        lead = (
            f"Hello {escape(applicant)},<br><br>"
            f"The Town Board has approved your {escape(kind.lower())} application."
        )
        next_step = (
            "Please review any conditions of approval below before beginning work. "
            "A certificate of insurance is required, and you must call Diggers Hotline at 811 "
            "before excavating."
        )
    elif new_status == "denied":
        headline = "Your permit application was not approved"
        lead = (
            f"Hello {escape(applicant)},<br><br>"
            f"The Town Board reviewed your {escape(kind.lower())} application and did not approve it."
        )
        next_step = (
            "If you would like to discuss the decision or resubmit with changes, "
            "please contact the Town Clerk."
        )
    else:
        return None  # shouldn't happen given NOTIFY_STATUSES filter

    rows_html = _detail_rows([
        ("Project",       title),
        ("Location",      where),
        ("Permit type",   kind),
        ("Permit number", _s(row.get("permit_number"))),
        ("Board meeting", _fmt_date(row.get("board_date"))),
        ("Authorized",    _date_range(row.get("authorized_start"), row.get("authorized_end"))
                          if new_status == "approved" else ""),
        ("Conditions",    _s(row.get("conditions")) if new_status == "approved" else ""),
    ])

    return _wrap_html(headline, lead, rows_html, next_step, footer_public=True)


def _board_body(row, new_status, old_status):
    title, where = _title_line(row)
    kind = _s(row.get("type")) or "permit"
    applicant = _s(row.get("applicant"))
    org = _s(row.get("org"))

    who = " / ".join([p for p in [applicant, org] if p]) or "Unspecified"

    verb = {
        "proposed": "forwarded to the Board",
        "approved": "marked APPROVED by the Board",
        "denied":   "marked DENIED by the Board",
    }[new_status]

    headline = f"Permit status update: {new_status.upper()}"
    lead = (
        f"A {escape(kind.lower())} permit application has been {verb}.<br><br>"
        f"<em>Previous status: {escape(old_status or 'not yet tracked')}</em>"
    )

    rows_html = _detail_rows([
        ("Project",         title),
        ("Location",        where),
        ("Applicant",       who),
        ("Applicant phone", _s(row.get("phone"))),
        ("Applicant email", _s(row.get("email"))),
        ("Permit type",     kind),
        ("Permit ID",       _s(row.get("permit_id"))),
        ("Permit number",   _s(row.get("permit_number"))),
        ("Requested dates", _date_range(row.get("start_date"), row.get("end_date"))),
        ("Board meeting",   _fmt_date(row.get("board_date"))),
        ("Authorized",      _date_range(row.get("authorized_start"), row.get("authorized_end"))
                            if new_status == "approved" else ""),
        ("Conditions",      _s(row.get("conditions")) if new_status == "approved" else ""),
        ("Clerk notes",     _s(row.get("clerk_notes"))),
    ])

    next_step = "This message was sent automatically when the permit tracker was published."
    return _wrap_html(headline, lead, rows_html, next_step, footer_public=False)


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
    return (
        '<table style="border-collapse:collapse;margin:18px 0;width:100%;">'
        + "".join(trs) +
        "</table>"
    )


def _wrap_html(headline, lead_html, rows_html, next_step, footer_public):
    footer_lines = [
        "Town of Winchester &middot; 7228 CTH W, Winchester, WI 54557",
        f'715-686-2123 &middot; <a href="mailto:{CLERK_EMAIL}" style="color:#00505A;">{CLERK_EMAIL}</a>',
    ]
    if not footer_public:
        footer_lines.append(
            "This is an internal notification containing applicant contact information. "
            "Not for public distribution without review under Wis. Stat. ch. 19."
        )

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


# ── Send via Graph ──────────────────────────────────────────────────
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


# ── Entry point called from sync.py ─────────────────────────────────
def notify_status_changes(token, rows):
    """Compare current tracker rows against saved state, email on changes.
       Returns (sent_count, skipped_count) for the run log."""
    state = _load_state()
    sent = 0
    skipped = 0
    new_state = dict(state)

    for row in rows:
        key = _permit_key(row)
        if not key:
            continue

        new_status = _s(row.get("map_status")).lower()
        old_status = state.get(key, "")

        if new_status == old_status:
            continue  # no change

        # Update tracked state for every change (so we don't re-notify next run)
        new_state[key] = new_status

        # But only actually send email for the three notification statuses
        if new_status not in NOTIFY_STATUSES:
            continue

        title, _ = _title_line(row)
        subj_prefix = {
            "proposed": "Permit scheduled for Board review",
            "approved": "Permit approved",
            "denied":   "Permit not approved",
        }[new_status]
        subject = f"{subj_prefix}: {title}"

        # Applicant email — only if we have a valid address on the row
        applicant_addr = _s(row.get("email"))
        if _valid_email(applicant_addr):
            body = _applicant_body(row, new_status, old_status)
            if body and _send(token, applicant_addr, subject, body):
                print(f"     \u2192 applicant: {applicant_addr}")
                sent += 1
        else:
            print(f"     ! no valid applicant email on {key} — applicant not notified")
            skipped += 1

        # Board email
        board_body = _board_body(row, new_status, old_status)
        board_subj = f"[Permit {new_status}] {title}"
        if _send(token, BOARD_EMAIL, board_subj, board_body):
            print(f"     \u2192 board: {BOARD_EMAIL}")
            sent += 1

    _save_state(new_state)
    return sent, skipped
