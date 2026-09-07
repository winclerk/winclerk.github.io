"""
backup_to_sharepoint.py — daily snapshot of critical portal state to SharePoint.

Runs after the daily sync completes. Uploads state files to a versioned folder
structure inside townofwinchester's Backups/GitHub library so the portal can
be reconstructed if the repo is lost or corrupted.

Folder layout (created lazily):
  Backups/GitHub/
    daily/{YYYY-MM-DD}/         permits.json, data.json, permit_notify_state.json, permit_pdf_state.json
    weekly/{YYYY-MM-DD}/pdfs/   all generated PDFs (Sundays only)
    monthly/{YYYY-MM-DD}/       same JSONs as daily (1st of month only)
    annual/{YYYY}/              same JSONs as daily (Jan 1 only)

Retention:
  daily/    keep last 30 dated folders (auto-prune)
  weekly/   keep last 12 dated folders (auto-prune)
  monthly/  keep last 12 dated folders (auto-prune)
  annual/   never prune

Design notes:
  - Self-contained token fetch (no import of sync.py) so this works even if
    sync.py's deps aren't installed yet. Only requires `requests`.
  - Resolves site + library at runtime by path so the code has no baked-in
    drive IDs to break if the library ever moves.
  - Idempotent: re-running the same day overwrites that day's snapshot in
    place (safe if the workflow reruns or is manually re-triggered).
  - Every SharePoint call is best-effort — a failure to upload one file
    doesn't abort the rest of the snapshot.

Usage (from the winclerk.github.io repo root, after checkout):
    python backup_to_sharepoint.py

Env vars required: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.
"""

import os
import sys
from datetime import datetime, timezone

import requests


# ────────── Config ──────────

SITE_HOSTNAME    = "townofwinchester54557.sharepoint.com"
SITE_PATH        = "/sites/townofwinchester"     # site relative to host
LIBRARY_NAME     = "Backups"                     # document library name inside the site
ROOT_SUBFOLDER   = "GitHub"                      # subfolder inside the library

# Files backed up daily (small JSON state)
DAILY_STATE_FILES = [
    "permits.json",
    "data.json",
    "permit_notify_state.json",
    "permit_pdf_state.json",
]

# PDF directory — everything inside gets backed up weekly (Sundays)
PDF_DIR = "public/permits"

# Retention windows (folder count)
DAILY_KEEP   = 30
WEEKLY_KEEP  = 12
MONTHLY_KEEP = 12
# Annual: never pruned

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


# ────────── Token ──────────

def _fetch_token():
    """Fetch a Graph API token via client credentials flow.
       Duplicated from sync.py so this file has no local deps."""
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


# ────────── SharePoint helpers ──────────

def _headers(token, extra=None):
    h = {"Authorization": f"Bearer {token}"}
    if extra:
        h.update(extra)
    return h


def _resolve_drive(token):
    """Return the driveId of the Backups library on the townofwinchester site."""
    # Get site
    site_url = f"{GRAPH_BASE}/sites/{SITE_HOSTNAME}:{SITE_PATH}"
    r = requests.get(site_url, headers=_headers(token), timeout=15)
    r.raise_for_status()
    site_id = r.json()["id"]

    # List drives; pick the one matching LIBRARY_NAME
    drives_url = f"{GRAPH_BASE}/sites/{site_id}/drives"
    r = requests.get(drives_url, headers=_headers(token), timeout=15)
    r.raise_for_status()
    for d in r.json().get("value", []):
        if d.get("name") == LIBRARY_NAME:
            return d["id"]
    raise RuntimeError(f"library '{LIBRARY_NAME}' not found on site {SITE_PATH}")


def _ensure_folder(token, drive_id, path_from_root):
    """Ensure a nested folder path exists (idempotent). Returns the folder's item id.
       path_from_root is a forward-slash path like 'GitHub/daily/2026-09-15'."""
    parts = [p for p in path_from_root.split("/") if p]
    parent = "root"
    for name in parts:
        # Check if this child already exists
        list_url = f"{GRAPH_BASE}/drives/{drive_id}/items/{parent}/children"
        r = requests.get(list_url, headers=_headers(token), timeout=15)
        r.raise_for_status()
        existing = next((c for c in r.json().get("value", []) if c.get("name") == name), None)
        if existing:
            parent = existing["id"]
            continue
        # Create it
        create_url = f"{GRAPH_BASE}/drives/{drive_id}/items/{parent}/children"
        body = {"name": name, "folder": {}, "@microsoft.graph.conflictBehavior": "fail"}
        r = requests.post(create_url, headers=_headers(token, {"Content-Type": "application/json"}), json=body, timeout=15)
        if r.status_code in (200, 201):
            parent = r.json()["id"]
        elif r.status_code == 409:
            # Race — someone else created it. Re-list.
            r2 = requests.get(list_url, headers=_headers(token), timeout=15)
            r2.raise_for_status()
            existing = next((c for c in r2.json().get("value", []) if c.get("name") == name), None)
            if existing:
                parent = existing["id"]
            else:
                raise RuntimeError(f"could not create or find folder '{name}' at {path_from_root}")
        else:
            r.raise_for_status()
    return parent


def _upload_file(token, drive_id, folder_id, local_path, dest_name):
    """Upload a small file (<4MB) to a specific folder. Overwrites if it exists."""
    with open(local_path, "rb") as f:
        content = f.read()
    # PUT to /drives/{id}/items/{folder-id}:/{name}:/content
    url = f"{GRAPH_BASE}/drives/{drive_id}/items/{folder_id}:/{dest_name}:/content"
    r = requests.put(url, headers=_headers(token, {"Content-Type": "application/octet-stream"}), data=content, timeout=30)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"upload {dest_name} failed: {r.status_code} {r.text[:200]}")


def _list_child_folders(token, drive_id, path_from_root):
    """Return list of {name, id} for immediate child folders at the given path.
       If the path doesn't exist yet, returns []."""
    parts = [p for p in path_from_root.split("/") if p]
    parent = "root"
    for name in parts:
        list_url = f"{GRAPH_BASE}/drives/{drive_id}/items/{parent}/children"
        r = requests.get(list_url, headers=_headers(token), timeout=15)
        if r.status_code == 404:
            return []
        r.raise_for_status()
        existing = next((c for c in r.json().get("value", []) if c.get("name") == name), None)
        if not existing:
            return []
        parent = existing["id"]
    # Now list children of the final folder
    list_url = f"{GRAPH_BASE}/drives/{drive_id}/items/{parent}/children"
    r = requests.get(list_url, headers=_headers(token), timeout=15)
    r.raise_for_status()
    return [{"name": c["name"], "id": c["id"]} for c in r.json().get("value", []) if "folder" in c]


def _delete_item(token, drive_id, item_id):
    url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}"
    r = requests.delete(url, headers=_headers(token), timeout=15)
    if r.status_code not in (200, 204):
        print(f"     ! delete failed ({r.status_code}) for item {item_id}", file=sys.stderr)


# ────────── Rotation ──────────

def _prune_to_keep(token, drive_id, folder_path, keep_n):
    """Delete the oldest folders inside `folder_path` beyond `keep_n`. Assumes
       folder names sort chronologically (YYYY-MM-DD or YYYY works)."""
    folders = _list_child_folders(token, drive_id, folder_path)
    if len(folders) <= keep_n:
        return 0
    # Sort ascending, delete oldest
    folders.sort(key=lambda f: f["name"])
    to_delete = folders[: len(folders) - keep_n]
    for f in to_delete:
        print(f"   rotation: deleting {folder_path}/{f['name']}")
        _delete_item(token, drive_id, f["id"])
    return len(to_delete)


# ────────── Main ──────────

def main():
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    year_str = now.strftime("%Y")
    is_sunday = now.weekday() == 6         # Mon=0 ... Sun=6
    is_first_of_month = now.day == 1
    is_first_of_year = now.month == 1 and now.day == 1

    print(f"── Backup to SharePoint ({date_str} UTC) ──")

    print("Authenticating with Microsoft Graph...")
    token = _fetch_token()

    print(f"Resolving destination library ({SITE_PATH} / {LIBRARY_NAME})...")
    drive_id = _resolve_drive(token)
    print(f"   driveId = {drive_id[:40]}...")

    # ─── Daily snapshot (always) ───
    daily_folder = f"{ROOT_SUBFOLDER}/daily/{date_str}"
    print(f"Uploading daily snapshot to {daily_folder}/")
    folder_id = _ensure_folder(token, drive_id, daily_folder)
    uploaded = 0
    for fname in DAILY_STATE_FILES:
        if not os.path.exists(fname):
            print(f"   - {fname}: not present locally, skipping")
            continue
        try:
            _upload_file(token, drive_id, folder_id, fname, fname)
            print(f"   \u2713 {fname}")
            uploaded += 1
        except Exception as e:
            print(f"   ! {fname}: {e}", file=sys.stderr)
    print(f"   daily: {uploaded} file(s) uploaded")

    # ─── Weekly PDF snapshot (Sundays) ───
    if is_sunday:
        weekly_folder = f"{ROOT_SUBFOLDER}/weekly/{date_str}/pdfs"
        print(f"Uploading weekly PDF snapshot to {weekly_folder}/")
        if os.path.isdir(PDF_DIR):
            folder_id = _ensure_folder(token, drive_id, weekly_folder)
            pdf_count = 0
            for fname in sorted(os.listdir(PDF_DIR)):
                if not fname.lower().endswith(".pdf"):
                    continue
                path = os.path.join(PDF_DIR, fname)
                try:
                    _upload_file(token, drive_id, folder_id, path, fname)
                    pdf_count += 1
                except Exception as e:
                    print(f"   ! {fname}: {e}", file=sys.stderr)
            print(f"   weekly: {pdf_count} PDF(s) uploaded")
        else:
            print(f"   weekly: {PDF_DIR} not found locally, skipping")

    # ─── Monthly snapshot (1st of month) ───
    if is_first_of_month:
        monthly_folder = f"{ROOT_SUBFOLDER}/monthly/{date_str}"
        print(f"Uploading monthly snapshot to {monthly_folder}/")
        folder_id = _ensure_folder(token, drive_id, monthly_folder)
        m_uploaded = 0
        for fname in DAILY_STATE_FILES:
            if not os.path.exists(fname):
                continue
            try:
                _upload_file(token, drive_id, folder_id, fname, fname)
                m_uploaded += 1
            except Exception as e:
                print(f"   ! {fname}: {e}", file=sys.stderr)
        print(f"   monthly: {m_uploaded} file(s) uploaded")

    # ─── Annual snapshot (Jan 1) ───
    if is_first_of_year:
        annual_folder = f"{ROOT_SUBFOLDER}/annual/{year_str}"
        print(f"Uploading annual snapshot to {annual_folder}/")
        folder_id = _ensure_folder(token, drive_id, annual_folder)
        a_uploaded = 0
        for fname in DAILY_STATE_FILES:
            if not os.path.exists(fname):
                continue
            try:
                _upload_file(token, drive_id, folder_id, fname, fname)
                a_uploaded += 1
            except Exception as e:
                print(f"   ! {fname}: {e}", file=sys.stderr)
        print(f"   annual: {a_uploaded} file(s) uploaded")

    # ─── Rotation ───
    print("Rotation:")
    try:
        removed = _prune_to_keep(token, drive_id, f"{ROOT_SUBFOLDER}/daily", DAILY_KEEP)
        print(f"   daily: pruned {removed} old folder(s)")
    except Exception as e:
        print(f"   ! daily rotation failed: {e}", file=sys.stderr)
    try:
        removed = _prune_to_keep(token, drive_id, f"{ROOT_SUBFOLDER}/weekly", WEEKLY_KEEP)
        print(f"   weekly: pruned {removed} old folder(s)")
    except Exception as e:
        print(f"   ! weekly rotation failed: {e}", file=sys.stderr)
    try:
        removed = _prune_to_keep(token, drive_id, f"{ROOT_SUBFOLDER}/monthly", MONTHLY_KEEP)
        print(f"   monthly: pruned {removed} old folder(s)")
    except Exception as e:
        print(f"   ! monthly rotation failed: {e}", file=sys.stderr)
    print("   annual: never pruned")

    print("Done.")


if __name__ == "__main__":
    main()
