"""
Winchester Permit Sync
──────────────────────
Reads the permit tracker workbook from SharePoint (Records Archive → Permits)
and writes permits.json to the winclerk.github.io repo.

Add to sync.py, or run standalone. Reuses get_token() and write_github()
from the existing sync pipeline.

Requires: openpyxl  (add to requirements.txt / the GitHub Actions workflow)
"""

import io
import json
import re
from datetime import datetime, date

import requests
from openpyxl import load_workbook

# ══════════════════════════════════════════════════════════════
# CONFIG — Records Archive → Permits → "2026 to Present.xlsx"
# ══════════════════════════════════════════════════════════════
PERMITS_DRIVE_ID = "b!c95LT9gy6kqiItDGFto7RFnHF7mxITJGsCZJt01CCvi1TQvoZoFtT7YMKBgrUG67"
PERMITS_ITEM_ID  = "01UVO6XCSTSHOVIGOYBJE3ZIQJYCZ3YSTV"
PERMITS_SHEET    = "Permits"
HEADER_ROW       = 2          # row 1 is the FROM FORM / CLERK band
FIRST_DATA_ROW   = 3

# Statuses that appear on the public map. Everything else is withheld.
PUBLISHED_STATUSES = {"proposed", "approved"}

GRAPH = "https://graph.microsoft.com/v1.0"


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════
def _s(v):
    """Cell value -> clean string."""
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def _date(v):
    """Cell value -> YYYY-MM-DD, or '' if unparseable."""
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    t = str(v).strip()
    if not t:
        return ""
    # Already ISO
    if re.match(r"^\d{4}-\d{2}-\d{2}$", t):
        return t
    # ISO timestamp
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T", t)
    if m:
        return m.group(1)
    # US format
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y"):
        try:
            return datetime.strptime(t, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return ""


def _float(v):
    try:
        return round(float(str(v).strip()), 6)
    except (TypeError, ValueError):
        return None


def _coords(v):
    """route_coords cell -> list of [lat, lng] pairs, or None."""
    t = _s(v)
    if not t:
        return None
    try:
        parsed = json.loads(t)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list) or len(parsed) < 2:
        return None
    out = []
    for pt in parsed:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            lat, lng = _float(pt[0]), _float(pt[1])
            if lat is not None and lng is not None:
                out.append([lat, lng])
    return out if len(out) >= 2 else None


def _location(row):
    """Build a public-facing location string from road + address."""
    road = _s(row.get("road"))
    addr = _s(row.get("address"))
    if road and addr:
        # Don't repeat the road if the address already names it
        if road.lower() in addr.lower():
            return addr
        return f"{road} — {addr}"
    return road or addr or "Location on file with the Town Clerk"


# ══════════════════════════════════════════════════════════════
# FETCH WORKBOOK
# ══════════════════════════════════════════════════════════════
def fetch_permit_rows(token):
    """Download the tracker workbook and return a list of row dicts."""
    url = f"{GRAPH}/drives/{PERMITS_DRIVE_ID}/items/{PERMITS_ITEM_ID}/content"
    r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    r.raise_for_status()

    wb = load_workbook(io.BytesIO(r.content), data_only=True, read_only=True)
    if PERMITS_SHEET not in wb.sheetnames:
        raise RuntimeError(f"Sheet '{PERMITS_SHEET}' not found in workbook")
    ws = wb[PERMITS_SHEET]

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < HEADER_ROW:
        return []

    headers = [_s(h) for h in rows[HEADER_ROW - 1]]
    out = []
    for raw in rows[FIRST_DATA_ROW - 1:]:
        rec = {}
        for i, h in enumerate(headers):
            if h and i < len(raw):
                rec[h] = raw[i]
        # Skip fully blank rows
        if any(_s(v) for v in rec.values()):
            out.append(rec)
    wb.close()
    return out


# ══════════════════════════════════════════════════════════════
# BUILD permits.json
# ══════════════════════════════════════════════════════════════
def build_permits_data(rows):
    """
    Convert tracker rows into the public permits.json structure.

    PRIVACY: only the fields listed below are published. Applicant name,
    phone, email, parcel, signature, insurance, fee status, conditions,
    and clerk notes are deliberately excluded.
    """
    permits = []
    skipped = {"status": 0, "geo": 0, "dates": 0}

    for row in rows:
        status = _s(row.get("map_status")).lower()

        # Example/template row guard
        if _s(row.get("permit_id")).upper().startswith("EXAMPLE"):
            continue

        if status not in PUBLISHED_STATUSES:
            skipped["status"] += 1
            continue

        # Dates — authorized_* takes precedence over the applicant's request
        start = _date(row.get("authorized_start")) or _date(row.get("start_date"))
        end   = _date(row.get("authorized_end"))   or _date(row.get("end_date"))
        if not start or not end:
            skipped["dates"] += 1
            continue
        if end < start:
            start, end = end, start

        entry = {
            "id":           _s(row.get("permit_id")) or f"P{len(permits)+1:04d}",
            "permitNumber": _s(row.get("permit_number")),
            "title":        _s(row.get("title")) or _s(row.get("type")) or "Permitted work",
            "org":          _s(row.get("org")) or "Applicant on file",
            "location":     _location(row),
            "startDate":    start,
            "endDate":      end,
            "status":       status,
            "jurisdiction": "town",
        }

        traffic = _s(row.get("traffic"))
        if traffic:
            entry["traffic"] = traffic

        cname = _s(row.get("public_contact_name"))
        cphone = _s(row.get("public_contact_phone"))
        if cname:
            entry["contactName"] = cname
        if cphone:
            entry["contactPhone"] = cphone

        # ── Geometry ──
        geo_type = _s(row.get("geo_type")).lower()
        coords = _coords(row.get("route_coords"))
        lat, lng = _float(row.get("lat")), _float(row.get("lng"))

        if geo_type == "line" and coords:
            entry["geoType"] = "line"
            entry["coordinates"] = coords
            # Midpoint anchors the popup and the list view
            mid = coords[len(coords) // 2]
            entry["lat"], entry["lng"] = mid[0], mid[1]
        elif lat is not None and lng is not None:
            entry["geoType"] = "point"
            entry["lat"], entry["lng"] = lat, lng
        elif coords:
            # geo_type wasn't set but a route exists — treat as a line
            entry["geoType"] = "line"
            entry["coordinates"] = coords
            mid = coords[len(coords) // 2]
            entry["lat"], entry["lng"] = mid[0], mid[1]
        else:
            skipped["geo"] += 1
            continue

        permits.append(entry)

    # Active work first, then upcoming, pending, finished
    order = {"proposed": 1, "approved": 0}
    permits.sort(key=lambda p: (order.get(p["status"], 2), p["startDate"]))

    return {
        "updated": datetime.utcnow().strftime("%Y-%m-%d"),
        "permits": permits,
    }, skipped


# ══════════════════════════════════════════════════════════════
# ENTRY POINT — call from sync.py
# ══════════════════════════════════════════════════════════════
def sync_permits(token, write_github_fn):
    """
    Fetch, transform, and publish. `write_github_fn` is the existing
    write_github(path, content) helper from sync.py.
    """
    print("── Permits ──")
    rows = fetch_permit_rows(token)
    print(f"   {len(rows)} row(s) in tracker")

    data, skipped = build_permits_data(rows)
    print(f"   {len(data['permits'])} published")
    if skipped["status"]:
        print(f"   {skipped['status']} withheld (status not proposed/approved)")
    if skipped["dates"]:
        print(f"   {skipped['dates']} skipped — missing or invalid dates")
    if skipped["geo"]:
        print(f"   {skipped['geo']} skipped — no map location")

    payload = json.dumps(data, indent=2, ensure_ascii=False)
    write_github_fn("permits.json", payload)
    print("   permits.json written")
    return data


# ══════════════════════════════════════════════════════════════
# STANDALONE
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import sys
    try:
        from sync import get_token, write_github
    except ImportError:
        print("Run from the repo root so sync.py is importable.", file=sys.stderr)
        sys.exit(1)
    sync_permits(get_token(), write_github)
