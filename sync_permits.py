"""
Winchester Permit Sync
──────────────────────
Reads the three permit tracker workbooks from SharePoint (Records Archive → Permits)
and writes permits.json to the winclerk.github.io repo.

  ROW  ->  Right-of-Way.xlsx          (sheet: ROW)
  DW   ->  Driveway.xlsx              (sheet: DW)
  RC   ->  Road Construction.xlsx     (sheet: RC)

Add to sync.py, or run standalone. Reuses get_token() and write_github()
from the existing sync pipeline.

Privacy — Driveway permits are treated more carefully than ROW/RC:
  - No applicant name, no parcel address in the public payload
  - Location shown as road-level only ("New driveway installation on <road>")
  - Full record still available on request under Wis. Stat. ch. 19

Requires: openpyxl (already in the GitHub Actions workflow)
"""

import io
import json
import re
from datetime import datetime, date

import requests
from openpyxl import load_workbook

# ══════════════════════════════════════════════════════════════
# CONFIG — three trackers, all on the same drive
# ══════════════════════════════════════════════════════════════
PERMITS_DRIVE_ID = "b!c95LT9gy6kqiItDGFto7RFnHF7mxITJGsCZJt01CCvi1TQvoZoFtT7YMKBgrUG67"

# Each source drives one workbook. sheet_hint is tried first; if not present,
# the code falls back to the first sheet in the workbook.
PERMIT_SOURCES = [
    {
        "type": "row",
        "label": "Right-of-Way",
        "item_id": "01UVO6XCSTSHOVIGOYBJE3ZIQJYCZ3YSTV",
        "sheet_hint": "ROW",
        "id_field": "permit_id",
        "number_field": "permit_number",
    },
    {
        "type": "driveway",
        "label": "Driveway",
        "item_id": "01UVO6XCXZ4OT5KA376BBJUTCPENRSMERP",
        "sheet_hint": "DW",
        "id_field": "permit_id",
        "number_field": "permit_number",
    },
    {
        "type": "road_construction",
        "label": "Road Construction",
        "item_id": "01UVO6XCWGHFSBESJDKVGZZBHO2XHQBZDR",
        "sheet_hint": "RC",
        "id_field": "project_id",
        "number_field": "project_number",
    },
]

# Statuses that appear on the public map. Everything else is withheld.
PUBLISHED_STATUSES = {"proposed", "approved"}

# Rows whose id begins with any of these tokens are treated as
# template/example rows and skipped.
EXAMPLE_TOKENS = ("EXAMPLE", "TEMPLATE", "SAMPLE")

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
    if re.match(r"^\d{4}-\d{2}-\d{2}$", t):
        return t
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T", t)
    if m:
        return m.group(1)
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
    """route_coords or project_pins cell -> list of [lat, lng] pairs, or None.
       Used for both line coordinates (2+ points) and multipoint (1+ points)."""
    t = _s(v)
    if not t:
        return None
    try:
        parsed = json.loads(t)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list) or len(parsed) < 1:
        return None
    out = []
    for pt in parsed:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            lat, lng = _float(pt[0]), _float(pt[1])
            if lat is not None and lng is not None:
                out.append([lat, lng])
    return out or None


# ══════════════════════════════════════════════════════════════
# FETCH WORKBOOK — auto-detect header row
# ══════════════════════════════════════════════════════════════
# Known column names across the three trackers — any of these appearing in a
# cell is a strong signal that row is the header row.
_HEADER_TOKENS = {
    "permit_id", "project_id", "submitted", "map_status", "permit_number",
    "project_number", "type", "title", "road", "applicant", "geo_type",
}


def _detect_header_row(rows, max_scan=5):
    """Return the 1-indexed row number whose cells look most like headers.
       Scans the first max_scan rows and picks the one with the most known
       header tokens. Falls back to row 1 if nothing matches."""
    best_row = 1
    best_score = 0
    for i in range(min(max_scan, len(rows))):
        score = sum(
            1 for cell in rows[i]
            if _s(cell).lower() in _HEADER_TOKENS
        )
        if score > best_score:
            best_score = score
            best_row = i + 1  # 1-indexed
    if best_score == 0:
        return None  # signal: no header row found
    return best_row


def _pick_sheet(wb, sheet_hint):
    """Return the sheet name to use. Try the hint first; otherwise use the
       first sheet in the workbook. Case-insensitive match on the hint."""
    if sheet_hint:
        for name in wb.sheetnames:
            if name.lower() == sheet_hint.lower():
                return name
    return wb.sheetnames[0] if wb.sheetnames else None


def fetch_source_rows(token, source):
    """Download one workbook and return its data rows as dicts (header -> value).
       Returns [] on any error (logged)."""
    url = f"{GRAPH}/drives/{PERMITS_DRIVE_ID}/items/{source['item_id']}/content"
    try:
        r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=60)
        r.raise_for_status()
    except Exception as e:
        print(f"   ! {source['label']}: could not download workbook ({e})")
        return []

    try:
        wb = load_workbook(io.BytesIO(r.content), data_only=True, read_only=True)
    except Exception as e:
        print(f"   ! {source['label']}: could not open workbook ({e})")
        return []

    sheet_name = _pick_sheet(wb, source.get("sheet_hint"))
    if not sheet_name:
        print(f"   ! {source['label']}: no sheets in workbook")
        wb.close()
        return []
    if source.get("sheet_hint") and sheet_name.lower() != source["sheet_hint"].lower():
        print(f"   ! {source['label']}: sheet '{source['sheet_hint']}' not found, using '{sheet_name}'")

    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        wb.close()
        return []

    header_row = _detect_header_row(rows)
    if header_row is None:
        print(f"   ! {source['label']}: could not identify a header row")
        wb.close()
        return []

    headers = [_s(h) for h in rows[header_row - 1]]
    out = []
    for raw in rows[header_row:]:
        rec = {}
        for i, h in enumerate(headers):
            if h and i < len(raw):
                rec[h] = raw[i]
        if any(_s(v) for v in rec.values()):
            out.append(rec)
    wb.close()
    return out


# ══════════════════════════════════════════════════════════════
# TRANSFORM — per-type entry builders
# ══════════════════════════════════════════════════════════════
def _example_row(row, id_field):
    """True if this row's id begins with any EXAMPLE_TOKENS."""
    ident = _s(row.get(id_field)).upper()
    return any(ident.startswith(t) for t in EXAMPLE_TOKENS)


def _dates(row, use_authorized_only=False):
    """Return (start, end) as ISO strings, or ('', '') if unavailable.
       ROW/RC prefer authorized dates but fall back to applicant-requested;
       Driveway has no applicant-requested dates so only authorized is used."""
    if use_authorized_only:
        start = _date(row.get("authorized_start"))
        end = _date(row.get("authorized_end"))
    else:
        start = _date(row.get("authorized_start")) or _date(row.get("start_date"))
        end = _date(row.get("authorized_end")) or _date(row.get("end_date"))
    if start and end and end < start:
        start, end = end, start
    return start, end


def _attach_geo(entry, row, allow_multipoint=False):
    """Populate geoType / coordinates / lat / lng on entry from row.
       Returns True if geo was set, False if the row has no usable location."""
    geo_type = _s(row.get("geo_type")).lower()
    route_coords = _coords(row.get("route_coords"))
    project_pins = _coords(row.get("project_pins")) if allow_multipoint else None
    lat = _float(row.get("lat"))
    lng = _float(row.get("lng"))

    # Line has priority when geo_type says line and coords are present
    if geo_type == "line" and route_coords and len(route_coords) >= 2:
        entry["geoType"] = "line"
        entry["coordinates"] = route_coords
        mid = route_coords[len(route_coords) // 2]
        entry["lat"], entry["lng"] = mid[0], mid[1]
        return True

    # Multipoint (RC only)
    if allow_multipoint and geo_type == "multipoint" and project_pins:
        entry["geoType"] = "multipoint"
        entry["points"] = project_pins
        # Anchor at centroid so list-view sorts sensibly
        centroid_lat = sum(p[0] for p in project_pins) / len(project_pins)
        centroid_lng = sum(p[1] for p in project_pins) / len(project_pins)
        entry["lat"], entry["lng"] = round(centroid_lat, 6), round(centroid_lng, 6)
        return True

    # Single point
    if lat is not None and lng is not None:
        entry["geoType"] = "point"
        entry["lat"], entry["lng"] = lat, lng
        return True

    # Fallbacks: if geo_type wasn't set but coords/pins exist, use them
    if route_coords and len(route_coords) >= 2:
        entry["geoType"] = "line"
        entry["coordinates"] = route_coords
        mid = route_coords[len(route_coords) // 2]
        entry["lat"], entry["lng"] = mid[0], mid[1]
        return True
    if allow_multipoint and project_pins:
        entry["geoType"] = "multipoint"
        entry["points"] = project_pins
        centroid_lat = sum(p[0] for p in project_pins) / len(project_pins)
        centroid_lng = sum(p[1] for p in project_pins) / len(project_pins)
        entry["lat"], entry["lng"] = round(centroid_lat, 6), round(centroid_lng, 6)
        return True

    return False


def _row_location(row):
    """ROW public location: road + address, deduplicated."""
    road = _s(row.get("road"))
    addr = _s(row.get("address"))
    if road and addr:
        if road.lower() in addr.lower():
            return addr
        return f"{road} — {addr}"
    return road or addr or "Location on file with the Town Clerk"


def _rc_location(row):
    """RC public location: road only (RC form has no address field)."""
    road = _s(row.get("road"))
    return road or "Location on file with the Town Clerk"


def _dw_location(row):
    """Driveway public location: road only (privacy — no parcel/address)."""
    road = _s(row.get("road"))
    return road or "Location on file with the Town Clerk"


def _build_row_entry(row, source):
    """Build a public entry for a Right-of-Way permit."""
    start, end = _dates(row, use_authorized_only=False)
    if not start or not end:
        return None, "dates"

    entry = {
        "id": _s(row.get(source["id_field"])),
        "permitNumber": _s(row.get(source["number_field"])),
        "title": _s(row.get("title")) or _s(row.get("type")) or "Permitted work",
        "org": _s(row.get("org")) or "Applicant on file",
        "location": _row_location(row),
        "startDate": start,
        "endDate": end,
        "status": _s(row.get("map_status")).lower(),
        "jurisdiction": "town",
        "permitType": "row",
    }

    if _s(row.get("traffic")):
        entry["traffic"] = _s(row.get("traffic"))
    if _s(row.get("public_contact_name")):
        entry["contactName"] = _s(row.get("public_contact_name"))
    if _s(row.get("public_contact_phone")):
        entry["contactPhone"] = _s(row.get("public_contact_phone"))

    if not _attach_geo(entry, row, allow_multipoint=False):
        return None, "geo"
    return entry, None


def _build_rc_entry(row, source):
    """Build a public entry for a Road Construction project."""
    start, end = _dates(row, use_authorized_only=False)
    if not start or not end:
        return None, "dates"

    entry = {
        "id": _s(row.get(source["id_field"])),
        "permitNumber": _s(row.get(source["number_field"])),
        "title": _s(row.get("title")) or _s(row.get("type")) or "Road construction project",
        "org": _s(row.get("org")) or "Applicant on file",
        "location": _rc_location(row),
        "startDate": start,
        "endDate": end,
        "status": _s(row.get("map_status")).lower(),
        "jurisdiction": "town",
        "permitType": "road_construction",
    }

    if _s(row.get("traffic")):
        entry["traffic"] = _s(row.get("traffic"))
    if _s(row.get("public_contact_name")):
        entry["contactName"] = _s(row.get("public_contact_name"))
    if _s(row.get("public_contact_phone")):
        entry["contactPhone"] = _s(row.get("public_contact_phone"))

    if not _attach_geo(entry, row, allow_multipoint=True):
        return None, "geo"
    return entry, None


def _build_dw_entry(row, source):
    """Build a public entry for a Driveway permit.
       Privacy: no applicant name, no parcel/address, no phone/email —
       only the road segment and a generic title."""
    # Driveway only gets published dates after Clerk fills in authorized_*
    start, end = _dates(row, use_authorized_only=True)
    if not start or not end:
        return None, "dates"

    entry = {
        "id": _s(row.get(source["id_field"])),
        "permitNumber": _s(row.get(source["number_field"])),
        "title": "New driveway installation",
        "org": "Property owner on file",
        "location": _dw_location(row),
        "startDate": start,
        "endDate": end,
        "status": _s(row.get("map_status")).lower(),
        "jurisdiction": "town",
        "permitType": "driveway",
    }

    # No traffic / public contact fields on the driveway form.
    if not _attach_geo(entry, row, allow_multipoint=False):
        return None, "geo"
    return entry, None


_BUILDERS = {
    "row": _build_row_entry,
    "driveway": _build_dw_entry,
    "road_construction": _build_rc_entry,
}


# ══════════════════════════════════════════════════════════════
# BUILD permits.json
# ══════════════════════════════════════════════════════════════
def build_permits_data(all_rows_by_source):
    """Convert tracker rows from all sources into the public permits.json.
       all_rows_by_source: list of (source_config, rows) tuples."""
    permits = []
    per_source_stats = {}

    for source, rows in all_rows_by_source:
        stats = {"total": len(rows), "published": 0, "status": 0, "dates": 0, "geo": 0, "example": 0}
        builder = _BUILDERS.get(source["type"])
        if not builder:
            print(f"   ! no builder for type '{source['type']}'; skipping")
            continue

        for row in rows:
            if _example_row(row, source["id_field"]):
                stats["example"] += 1
                continue

            status = _s(row.get("map_status")).lower()
            if status not in PUBLISHED_STATUSES:
                stats["status"] += 1
                continue

            entry, skip_reason = builder(row, source)
            if entry is None:
                stats[skip_reason] = stats.get(skip_reason, 0) + 1
                continue
            permits.append(entry)
            stats["published"] += 1

        per_source_stats[source["label"]] = stats

    # Sort: approved before proposed (front-end re-sorts by status bucket)
    order = {"approved": 0, "proposed": 1}
    permits.sort(key=lambda p: (order.get(p["status"], 2), p["startDate"]))

    return {
        "updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "permits": permits,
    }, per_source_stats


# ══════════════════════════════════════════════════════════════
# ENTRY POINT — call from sync.py
# ══════════════════════════════════════════════════════════════
def sync_permits(token, write_github_fn):
    """Fetch every tracker, transform, and publish permits.json.
       write_github_fn is the existing write_github(path, content) helper."""
    print("── Permits ──")

    all_rows = []
    for source in PERMIT_SOURCES:
        rows = fetch_source_rows(token, source)
        print(f"   {source['label']}: {len(rows)} row(s) in tracker")
        all_rows.append((source, rows))

    data, per_source_stats = build_permits_data(all_rows)

    total_published = len(data["permits"])
    print(f"   {total_published} total published")
    for label, s in per_source_stats.items():
        parts = [f"{s['published']} published"]
        if s.get("status"):   parts.append(f"{s['status']} withheld (status)")
        if s.get("dates"):    parts.append(f"{s['dates']} skipped (dates)")
        if s.get("geo"):      parts.append(f"{s['geo']} skipped (no map location)")
        if s.get("example"):  parts.append(f"{s['example']} example row(s)")
        print(f"     {label}: " + ", ".join(parts))

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
