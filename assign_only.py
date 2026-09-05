"""
assign_only.py — fast permit-number assignment + notification.

Triggered by Make.com immediately after a form submission lands in Excel.
Unlike sync.py (which does meeting sync, site sync, PDFs, etc.), this only:
  1. Fetches a Graph token
  2. Runs sync_permits.sync_permits() — assigns permit_numbers to new rows,
     writes permits.json
  3. Runs permit_notify.notify_status_changes() — sends the "Application
     received, your permit number is X" email to the applicant

The daily 7am sync (sync.py) still handles PDF generation, meeting sync,
other sites, and any status-change notifications for existing permits.

Design: this is a lightweight companion to sync.py. Runs in ~20 seconds
instead of ~2-3 minutes. Uses the same modules and state files so nothing
gets duplicated.
"""

import os
import sys
import traceback

# Reuse everything from sync.py — token, write_github_file
try:
    from sync import get_token, write_github_file
except ImportError as e:
    print(f"Run from the winclerk.github.io repo root (missing import: {e})", file=sys.stderr)
    sys.exit(1)


def main():
    print("Authenticating with Microsoft Graph...")
    token = get_token()

    print("── Permits (assign + notify) ──")
    try:
        import sync_permits
        all_rows = sync_permits.sync_permits(token, write_github_file)

        import permit_notify
        permit_notify.notify_status_changes(token, all_rows, write_github_file)

        print("Done.")
    except Exception as e:
        print(f"assign_only failed: {e}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
