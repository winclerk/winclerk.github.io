"""
internal_only_audit.py — make sure no "Internal Only" folder is publicly reachable.

Any folder with "Internal Only" in its name holds working files (drafts, notes,
contracts) that must never be reachable through an "Anyone with the link"
sharing link. An Anyone link on a parent folder covers every subfolder, so a
link anywhere above an Internal Only folder exposes it.

Run from sync.py after each sync. For every Internal Only folder in the Town
Board library and the flat-site libraries it:
  1. reads the folder's sharing permissions through Microsoft Graph,
  2. finds Anyone (anonymous) links that reach it — on the folder itself or
     inherited from a parent — and deletes them on the item that owns them,
  3. re-checks, and emails Luke if anything was removed or could not be fixed.

It never touches organization-only links or named people/groups.
"""

import requests

GRAPH = "https://graph.microsoft.com/v1.0"
MARKER = "internal only"
ALERT_TO = "luke@winchester.wi.gov"
SEND_FROM = "luke@winchester.wi.gov"


def _get(token, url):
    out = []
    while url:
        r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        r.raise_for_status()
        data = r.json()
        out.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return out


def _children(token, drive_id, item_id):
    return _get(token, f"{GRAPH}/drives/{drive_id}/items/{item_id}/children?$select=id,name,folder&$top=200")


def _find_internal_folders(token, drive_id, item_id, path, found):
    """Walk every folder under item_id and collect Internal Only folders."""
    for c in _children(token, drive_id, item_id):
        if "folder" not in c:
            continue
        sub = f"{path}/{c['name']}" if path else c["name"]
        if MARKER in c["name"].lower():
            found.append((c["id"], sub))
        # Keep walking: an Internal Only folder can hold more folders, and
        # other folders can hold nested Internal Only folders.
        _find_internal_folders(token, drive_id, c["id"], sub, found)


def _anon_links(token, drive_id, item_id):
    perms = _get(token, f"{GRAPH}/drives/{drive_id}/items/{item_id}/permissions")
    return [p for p in perms if (p.get("link") or {}).get("scope") == "anonymous"]


def _delete_anon_links_on(token, drive_id, item_id):
    """Delete the Anyone links that belong to item_id itself. Returns count."""
    removed = 0
    for p in _anon_links(token, drive_id, item_id):
        if p.get("inheritedFrom"):
            continue
        r = requests.delete(f"{GRAPH}/drives/{drive_id}/items/{item_id}/permissions/{p['id']}",
                            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if r.ok:
            removed += 1
        else:
            print(f"    Warning: could not delete Anyone link on item {item_id} ({r.status_code})")
    return removed


def audit_drive(token, drive_id, label, root_path=None):
    """Audit one library. root_path limits the walk to one folder (e.g.
    'All Town Board Files'); None walks the whole library."""
    if root_path:
        enc = requests.utils.quote(root_path)
        root = requests.get(f"{GRAPH}/drives/{drive_id}/root:/{enc}",
                            headers={"Authorization": f"Bearer {token}"}, timeout=30)
        root.raise_for_status()
        root_id = root.json()["id"]
    else:
        root_id = "root"

    found = []
    _find_internal_folders(token, drive_id, root_id, root_path or "", found)

    removed, unresolved = [], []
    for folder_id, path in found:
        links = _anon_links(token, drive_id, folder_id)
        if not links:
            continue
        owners = set()
        for p in links:
            src = p.get("inheritedFrom") or {}
            owners.add(src.get("id") or folder_id)
        for owner in owners:
            n = _delete_anon_links_on(token, drive_id, owner)
            if n:
                removed.append(f"{label}: {path} (removed {n} Anyone link(s) on the item that shared it)")
        if _anon_links(token, drive_id, folder_id):
            unresolved.append(f"{label}: {path}")

    print(f"  {label}: checked {len(found)} Internal Only folder(s); "
          f"{len(removed)} fixed, {len(unresolved)} still reachable.")
    return len(found), removed, unresolved


def send_report(token, removed, unresolved):
    if not removed and not unresolved:
        return
    items = "".join(f"<li>{x}</li>" for x in removed)
    bad = "".join(f"<li>{x}</li>" for x in unresolved)
    body = ("<div style='font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#222'>"
            "<h3 style='color:#193C3C'>Internal Only sharing check</h3>")
    if removed:
        body += f"<p>Anyone links reaching these Internal Only folders were removed:</p><ul>{items}</ul>"
    if unresolved:
        body += (f"<p style='color:#8B0000'><b>Still publicly reachable — please check by hand "
                 f"(or run Meeting Minutes &amp; Wrap-Up, part C):</b></p><ul>{bad}</ul>")
    body += "</div>"
    payload = {"message": {"subject": "[Winchester] Internal Only sharing check",
                           "body": {"contentType": "HTML", "content": body},
                           "toRecipients": [{"emailAddress": {"address": ALERT_TO}}]},
               "saveToSentItems": True}
    r = requests.post(f"{GRAPH}/users/{SEND_FROM}/sendMail",
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                      json=payload, timeout=30)
    print(f"  Internal Only report email: {r.status_code}")


def run(token, targets):
    """targets: list of (drive_id, label, root_path_or_None)."""
    all_removed, all_unresolved = [], []
    for drive_id, label, root_path in targets:
        try:
            _, removed, unresolved = audit_drive(token, drive_id, label, root_path)
            all_removed += removed
            all_unresolved += unresolved
        except Exception as e:
            print(f"  Warning: Internal Only check failed for {label}: {e}")
            all_unresolved.append(f"{label}: check could not run ({e})")
    send_report(token, all_removed, all_unresolved)
