"""
preview_emails.py — send all four notification email templates to a preview
address so you can see what they look like end-to-end.

Sends four emails:
  1. Received
  2. Approved
  3. Approved with conditions
  4. Denied

All four use the SAME sample permit data so you can see how each variant
renders. Nothing touches production notify state or Teams webhooks.

Usage from the winclerk.github.io repo root:
    python preview_emails.py

Or trigger it as a GitHub Actions workflow_dispatch job that just runs this
script — same env vars as sync.py already uses (AZURE_TENANT_ID, AZURE_CLIENT_ID,
AZURE_CLIENT_SECRET).
"""

import os
import sys

# Reuse everything from sync + permit_notify to avoid duplicating logic
try:
    from sync import get_token
    import permit_notify
except ImportError as e:
    print(f"Run from the winclerk.github.io repo root (missing import: {e})", file=sys.stderr)
    sys.exit(1)


PREVIEW_TO = "lukster97@gmail.com"

# Sample permit row — mimics what a ROW submission looks like after the Clerk
# has filled in every field that any of the four notification types would use.
# Feel free to edit for a different type/scenario preview.
SAMPLE_ROW = {
    "permit_number":    "PREVIEW-2026-01",
    "submitted":        "2026-09-01T15:22:00.000Z",
    "map_status":       "approved",
    "type":             "Overhead utility",
    "title":            "OPA WILDFIRE POLE REPLACEMENT",
    "road":             "Old County W",
    "address":          "53 S Owasso W.",
    "description":      "Replacement of aging distribution poles along the corridor.",
    "board_date":       "2026-09-15",
    "authorized_start": "2026-10-01",
    "authorized_end":   "2026-12-31",
    "conditions":       "Traffic control plan on file. Work outside school hours only.",
    "clerk_notes":      "Applicant did not provide certificate of insurance. Resubmit when available.",
    "traffic":          "Flaggers",
    "org":              "Xcel Energy",
    "applicant":        "Mark Brown",
    "phone":            "612-555-0123",
    "email":            PREVIEW_TO,   # NOTE: send target is the row's email
    "public_contact_name":  "Tiona Varela",
    "public_contact_phone": "763-357-5979",
}


def preview_all():
    token = get_token()
    print(f"Sending 4 preview emails to {PREVIEW_TO}...")

    statuses = [
        ("received",               "Right-of-Way Permit Application Received"),
        ("approved",               "Right-of-Way Permit Approved"),
        ("approved conditionally", "Right-of-Way Permit Approved with Conditions"),
        ("denied",                 "Right-of-Way Permit Not Approved"),
    ]

    sent = 0
    for status, subj_prefix in statuses:
        subject = f"[PREVIEW] {subj_prefix}: {SAMPLE_ROW['title']}"
        body = permit_notify._applicant_body(SAMPLE_ROW, "row", status)
        if not body:
            print(f"   ! no body for status '{status}' — skipping")
            continue
        ok = permit_notify._send(token, PREVIEW_TO, subject, body)
        if ok:
            print(f"   \u2713 sent: {status}")
            sent += 1
        else:
            print(f"   \u2717 FAILED: {status}")

    print(f"\nDone. {sent}/4 preview emails sent.")


if __name__ == "__main__":
    preview_all()
