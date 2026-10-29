"""
utility_map_build.py - rebuilds utility-map.html for the Town of Winchester.

What it does
  1. Finds the newest FCC National Broadband Map release (biannual "as of" date).
  2. Downloads the Wisconsin files it needs from the FCC:
       - AT&T, T-Mobile and Verizon mobile coverage (H3 hexagons, 4G LTE and 5G 7/1 Mbps)
       - Fixed broadband availability by technology (fiber, cable, DSL, fixed wireless, satellite)
  3. Downloads the town boundary (U.S. Census TIGERweb) and the electric service
     territories that touch the town (PSC of Wisconsin).
  4. Cuts everything down to the town, compresses it, and writes utility-map.html
     from utility_map_template.html.

Usage
  python utility_map_build.py                 # fetch everything and rebuild utility-map.html
  python utility_map_build.py --data out.json # also save the compiled map data
  python utility_map_build.py --from-data out.json   # rebuild the page from saved data only

Requirements: pip install requests h3 shapely pyshp
The FCC download endpoints are the ones the public map's own Data Download page uses.
They are not a documented API and could change; if a step fails, the error says which.
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime

import h3
import requests
import shapefile  # pyshp
from shapely.geometry import Polygon, MultiPolygon, shape, box, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = f'{HERE}/utility_map_template.html'
OUTPUT = f'{HERE}/utility-map.html'

UA = {'User-Agent': 'WinchesterUtilityMap/1.0 (Town of Winchester WI clerk; clerk@winchester.wi.gov)'}
FCC = 'https://broadbandmap.fcc.gov/nbm/map/api'
STATE_FIPS = '55'
COUNTIES = ('55125', '55051')  # Vilas, Iron (the town sits on the Iron County line)
TOWN_GEOID = '5512587600'      # Winchester town, Vilas County
CARRIERS = {'att': '130077', 'tmo': '130403', 'vzw': '131425'}  # FCC provider IDs
MOBILE_TECH = {'4g': '4G LTE', '5g': '5G-NR (7/1 Mbps)'}
FIXED_TECH = {  # FCC technology_code_desc -> map category
    'Fiber to the Premises': 'fiber', 'Cable': 'cable', 'Copper': 'dsl',
    'Licensed Fixed Wireless': 'fw', 'Unlicensed Fixed Wireless': 'fw', 'LBR Fixed Wireless': 'fw',
    'Licensed-by-Rule Fixed Wireless': 'fw', 'GSO Satellite': 'sat', 'NGSO Satellite': 'sat',
}
WIRED = {'fiber', 'cable', 'dsl'}
TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/1/query'
PSC = 'https://maps.psc.wi.gov/server/rest/services/Electric/PSC_ElectricServiceTerritories/MapServer'


def log(msg):
    print(msg, flush=True)


def get(url, **kw):
    r = requests.get(url, headers=UA, timeout=kw.pop('timeout', 300), **kw)
    r.raise_for_status()
    return r


# ---------- encoding ----------
def encode(coords):
    """Google polyline encoding (precision 5) of (lng, lat) pairs."""
    out, plat, plng = [], 0, 0
    def e(v):
        v = ~(v << 1) if v < 0 else (v << 1)
        s = ''
        while v >= 0x20:
            s += chr((0x20 | (v & 0x1f)) + 63)
            v >>= 5
        return s + chr(v + 63)
    for x, y in coords:
        la, lo = round(y * 1e5), round(x * 1e5)
        out.append(e(la - plat) + e(lo - plng))
        plat, plng = la, lo
    return ''.join(out)


def rings_of(geom):
    """All rings (outer and holes) of a polygonal geometry, encoded."""
    if geom.is_empty:
        return []
    polys = [geom] if geom.geom_type == 'Polygon' else [g for g in getattr(geom, 'geoms', []) if g.geom_type == 'Polygon']
    out = []
    for p in polys:
        out.append(encode(list(p.exterior.coords)))
        out.extend(encode(list(h.coords)) for h in p.interiors)
    return out


def hex_poly(cell):
    return Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])


# ---------- town + electric ----------
def town_boundary():
    r = get(TIGER, params={'where': f"GEOID='{TOWN_GEOID}'", 'outFields': 'GEOID', 'returnGeometry': 'true',
                           'outSR': 4326, 'geometryPrecision': 5, 'maxAllowableOffset': 0.0003, 'f': 'geojson'}).json()
    feats = r.get('features') or []
    if not feats:
        raise RuntimeError('TIGERweb returned no town boundary for GEOID ' + TOWN_GEOID)
    g = make_valid(shape(feats[0]['geometry']))
    if g.geom_type != 'Polygon':
        g = max(g.geoms, key=lambda p: p.area)
    return g


PSC_CACHE = f'{HERE}/electric_psc_cache.json'


def psc_features(town):
    """PSC territory features touching the town. Tries a GET, then a POST; returns None if PSC refuses."""
    xmin, ymin, xmax, ymax = town.bounds
    env = json.dumps({'xmin': xmin, 'ymin': ymin, 'xmax': xmax, 'ymax': ymax, 'spatialReference': {'wkid': 4326}})
    feats = []
    for layer in (0, 1, 2):  # municipal, investor-owned, cooperative
        params = {'geometry': env, 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
                  'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'LABEL,WEB,PSC_ID',
                  'returnGeometry': 'true', 'outSR': 4326, 'maxAllowableOffset': 0.0002,
                  'geometryPrecision': 5, 'f': 'geojson'}
        try:
            r = requests.get(f'{PSC}/{layer}/query', headers=UA, timeout=120, params=params)
            if r.status_code != 200:
                r = requests.post(f'{PSC}/{layer}/query', headers=UA, timeout=120, data=params)
            r.raise_for_status()
            feats += r.json().get('features', [])
        except requests.RequestException as exc:
            log(f'  PSC server unavailable ({exc}); using the saved copy of the electric territories')
            return None
    return feats


def electric(town, view):
    out = []
    feats = psc_features(town)
    if feats is None:
        feats = json.load(open(PSC_CACHE, encoding='utf-8'))['features']
    else:
        with open(PSC_CACHE, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump({'type': 'FeatureCollection', 'features': feats}, fh, separators=(',', ':'))
    for f in feats:
        g = make_valid(shape(f['geometry'])).intersection(view).simplify(0.0001)
        if g.is_empty or g.intersection(town).area / town.area < 0.001:
            continue
        web = (f['properties'].get('WEB') or '').strip()
        if web and not web.startswith('http'):
            web = 'https://' + web
        out.append({'name': f['properties']['LABEL'], 'url': web, 'geom': g})
        log(f"  electric: {f['properties']['LABEL']}")
    if not out:
        raise RuntimeError('PSC returned no electric territories for the town')
    confirmed = refine_with_line_map(out, town)
    for e in out:
        e['rings'] = rings_of(e.pop('geom'))
    return out, confirmed


REFINEMENT = f'{HERE}/bayfield_refinement.json'


def refine_with_line_map(elec, town):
    """Adjust PSC territories with a utility's own line map, if bayfield_refinement.json is present.
    'confirmed' = within the set distance of the utility's mapped lines/meters (that utility serves here).
    'checked'   = ground covered by the line-map screenshots.
    PSC territories stay as published, with two changes:
      - where the PSC areas overlap inside 'checked', the spot goes to this utility only if it is
        'confirmed', and to the other utility otherwise;
      - 'confirmed' ground always goes to this utility (its lines reach past the PSC boundary)."""
    import os
    if not os.path.exists(REFINEMENT):
        return None
    ref = json.load(open(REFINEMENT, encoding='utf-8'))
    conf = make_valid(shape(ref['confirmed']))
    checked = make_valid(shape(ref['checked']))
    target = next((e for e in elec if e['name'] == ref['utility']), None)
    if target is None:
        log(f"  line map refinement skipped: {ref['utility']} not in PSC data")
        return None
    others = [e for e in elec if e is not target]
    other_union = unary_union([e['geom'] for e in others]) if others else None
    if other_union is not None:
        contested = make_valid(target['geom'].intersection(other_union).intersection(checked))
        target['geom'] = make_valid(target['geom'].difference(contested.difference(conf)))
    target['geom'] = make_valid(unary_union([target['geom'], conf])).simplify(0.00005)
    for e in others:
        e['geom'] = make_valid(e['geom'].difference(conf)).simplify(0.00005)
    log(f"  refined {ref['utility']} with its line map ({ref['source_date']})")
    return {'rings': rings_of(conf.intersection(town.buffer(0.002))), 'note': ref['note']}


# ---------- FCC ----------
def latest_release():
    data = get(f'{FCC}/published/filing').json()['data']
    def when(d):
        try:
            return datetime.strptime(d['filing_subtype'], '%B %d, %Y')
        except ValueError:
            return datetime.min
    best = max((d for d in data if d.get('filing_type') == 'Biannual'), key=when)
    return best['process_uuid'], when(best)


def file_list(uuid):
    rows = get(f'{FCC}/national_map_process/nbm_get_data_download/{uuid}/').json()['data']
    return [r for r in rows if r.get('state_fips') == STATE_FIPS]


def download(file_id):
    log(f'  downloading FCC file {file_id}')
    return zipfile.ZipFile(io.BytesIO(get(f'{FCC}/getNBMDataDownloadFile/{file_id}/1', timeout=900).content))


def mobile_layer(file_id, view):
    """Union of coverage hexagons inside the view box: 'all' = outdoor stationary or better, 'strong' = in-vehicle."""
    z = download(file_id)
    names = {n.rsplit('.', 1)[-1].lower(): n for n in z.namelist()}
    rd = shapefile.Reader(shp=io.BytesIO(z.read(names['shp'])), dbf=io.BytesIO(z.read(names['dbf'])),
                          shx=io.BytesIO(z.read(names['shx'])))
    fields = [f[0] for f in rd.fields[1:]]
    env_i = fields.index('environmnt')
    allp, strong = [], []
    for sr in rd.iterShapeRecords(bbox=view.bounds):
        p = Polygon(sr.shape.points)
        allp.append(p)
        if str(sr.record[env_i]).strip() == '1':  # 1 = in-vehicle mobile and outdoor stationary
            strong.append(p)
    return {'all': rings_of(unary_union(allp)) if allp else [],
            'strong': rings_of(unary_union(strong)) if strong else []}


def fixed_layers(rows, town):
    town_cells = {c for c in h3.geo_to_cells(mapping(town.buffer(0.01)), 8) if hex_poly(c).intersects(town)}
    providers, per_hex, all_locs, wired_locs = {}, {}, {}, {}
    for row in rows:
        cat = FIXED_TECH.get(row['technology_code_desc'])
        if row['data_type'] != 'Fixed Broadband' or row['data_category'] != 'Nationwide' or not cat:
            continue
        z = download(row['id'])
        with z.open(z.namelist()[0]) as fh:
            for rec in csv.DictReader(io.TextIOWrapper(fh, encoding='utf-8')):
                if not rec['block_geoid'].startswith(COUNTIES):
                    continue
                cell = rec['h3_res8_id'].strip()
                if cell not in town_cells:
                    continue
                key = cat + '|' + rec['provider_id']
                p = providers.setdefault(key, {'name': rec['brand_name'].strip(), 'type': cat, 'd': 0, 'u': 0})
                p['d'] = max(p['d'], int(float(rec['max_advertised_download_speed'] or 0)))
                p['u'] = max(p['u'], int(float(rec['max_advertised_upload_speed'] or 0)))
                per_hex.setdefault(cell, {}).setdefault(key, set()).add(rec['location_id'])
                all_locs.setdefault(cell, set()).add(rec['location_id'])
                if cat in WIRED:
                    wired_locs.setdefault(cell, set()).add(rec['location_id'])
    # short, stable codes per provider
    order = sorted(providers, key=lambda k: (['fiber', 'cable', 'dsl', 'fw', 'sat'].index(providers[k]['type']), providers[k]['name']))
    code = {k: f'p{i}' for i, k in enumerate(order)}
    prov = {code[k]: providers[k] for k in order}
    hexes = []
    for cell in sorted(all_locs):
        b = [(lng, lat) for lat, lng in h3.cell_to_boundary(cell)]
        hexes.append({'r': encode(b + [b[0]]), 't': len(all_locs[cell]), 'w': len(wired_locs.get(cell, ())),
                      'p': {code[k]: len(v) for k, v in sorted(per_hex[cell].items())}})
    sats = sorted({p['name'] for p in prov.values() if p['type'] == 'sat'})
    return prov, hexes, sats


def build_data():
    log('Town boundary')
    town = town_boundary()
    view = box(*town.buffer(0.045).bounds)
    log('Electric territories')
    elec, elec_confirmed = electric(town, view)
    log('FCC release')
    uuid, asof = latest_release()
    log(f'  newest release: data as of {asof:%B %d, %Y}')
    rows = file_list(uuid)
    cell = {}
    for ck, pid in CARRIERS.items():
        for tk, tech in MOBILE_TECH.items():
            match = [r for r in rows if r['data_category'] == 'Provider' and r['data_type'] == 'Mobile Broadband'
                     and str(r['provider_id']) == pid and r['technology_code_desc'] == tech]
            if not match:
                raise RuntimeError(f'No FCC mobile file for provider {pid} {tech}')
            cell[f'{ck}_{tk}'] = mobile_layer(match[0]['id'], view)
    prov, hexes, sats = fixed_layers(rows, town)
    return {
        'asof': f'{asof:%b} {asof.day}, {asof.year}',
        'town': [encode(list(town.exterior.coords))],
        'electric': elec,
        'electric_confirmed': elec_confirmed,
        'cell': cell,
        'providers': prov,
        'hex': hexes,
        'satellite_names': sats,
    }


def render(data, template=TEMPLATE, output=OUTPUT):
    html = open(template, encoding='utf-8').read()
    if '/*DATA*/null' not in html:
        raise RuntimeError('Template is missing the /*DATA*/null placeholder')
    html = html.replace('/*DATA*/null', json.dumps(data, separators=(',', ':')))
    with open(output, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    log(f'Wrote {output} ({len(html):,} bytes)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data', help='save the compiled map data to this JSON file')
    ap.add_argument('--from-data', help='skip downloads and rebuild the page from this JSON file')
    ap.add_argument('--template', default=TEMPLATE)
    ap.add_argument('--output', default=OUTPUT)
    a = ap.parse_args()
    data = json.load(open(a.from_data)) if a.from_data else build_data()
    if a.data:
        json.dump(data, open(a.data, 'w'), separators=(',', ':'))
    render(data, a.template, a.output)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:  # make failures readable in the Actions log
        print(f'ERROR: {exc}', file=sys.stderr)
        raise
