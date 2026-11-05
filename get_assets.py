"""Download Everway's realistic scenery from Poly Haven (all assets CC0).

Run GET_ASSETS.bat (Windows) or `python3 get_assets.py`. Needs Python 3 and internet.
Files go to dist/assets/ together with manifest.json, which the game reads on start.
Re-running only downloads what is missing. Delete dist/assets to go back to the
generated (no-download) look.
"""
import json
import os
import shutil
import sys
import time
import urllib.request

API = 'https://api.polyhaven.com'
HEADERS = {'User-Agent': 'Everway-asset-fetcher/1.0 (personal driving-game prototype)'}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'assets')

# Ground and road materials: preferred Poly Haven ids first, keywords as a fallback.
TEXTURES = {
    'grass':   (['aerial_grass_rock', 'forrest_ground_01', 'leafy_grass', 'grass_path_2'], ['grass', 'meadow', 'lawn'], '2k'),
    'rock':    (['rock_face', 'aerial_rocks_02', 'rocky_terrain_02', 'rock_wall_08'], ['rock', 'cliff'], '1k'),
    'sand':    (['aerial_beach_01', 'coast_sand_01', 'sand_01', 'aerial_sand'], ['sand', 'dune', 'beach'], '1k'),
    'snow':    (['snow_02', 'snow_01', 'snow_field_aerial', 'snow_03'], ['snow'], '1k'),
    'asphalt': (['asphalt_02', 'asphalt_01', 'asphalt_track', 'asphalt_04'], ['asphalt', 'tarmac', 'road'], '2k'),
}
MAPS = {'diff': ['diffuse', 'diff'], 'nor': ['nor_gl'], 'rough': ['rough']}

# Scenery models. Known-good Poly Haven ids are tried first; otherwise a model must have one of the
# include words as a whole word in its id or name, sit in one of the allowed categories, and contain
# none of the exclude words. (Loose matching once picked "street_rat" as a tree.)
MODELS = {
    # max_tris keeps the game smooth: some scanned plants are 600k triangles each
    'tree':  {'max_tris': 200000, 'prefer': ['island_tree_01', 'island_tree_02', 'island_tree_03', 'searsia_lucida', 'tree_small_02', 'jacaranda_tree'],
              'include': ['tree', 'oak', 'birch', 'maple', 'ash', 'acacia', 'searsia'], 'exclude': ['quiver', 'aloe'], 'count': 4, 'max_mb': 40},
    'desert': {'max_tris': 160000, 'prefer': ['quiver_tree_01', 'quiver_tree_02'],
               'include': ['quiver', 'aloe', 'cactus', 'succulent'], 'count': 2, 'max_mb': 40},
    'pine':  {'max_tris': 200000, 'prefer': ['fir_sapling', 'pine_sapling_small', 'pine_tree_01', 'fir_tree_01'],
              'include': ['pine', 'fir', 'spruce', 'conifer'], 'count': 3, 'max_mb': 40},
    'rock':  {'max_tris': 110000, 'prefer': ['boulder_01', 'namaqualand_boulder_02', 'namaqualand_boulder_03', 'namaqualand_boulder_05', 'rock_07'],
              'include': ['boulder', 'rock', 'stone'], 'count': 4, 'max_mb': 25},
    'shrub': {'max_tris': 60000, 'prefer': ['fern_02', 'shrub_04', 'shrub_01'],
              'include': ['shrub', 'bush', 'fern'], 'count': 3, 'max_mb': 25},
}
ALLOWED_CATEGORIES = {'desert': {'nature', 'plants', 'trees'}, 'tree': {'nature', 'plants', 'trees'}, 'pine': {'nature', 'plants', 'trees'},
                      'rock': {'nature', 'rocks', 'terrain'}, 'shrub': {'nature', 'plants'}}
EXCLUDE = {'rat', 'animal', 'street', 'lamp', 'pole', 'poles', 'bust', 'statue', 'fort', 'wall', 'set', 'pile', 'path',
           'stair', 'brick', 'bench', 'tile', 'fountain', 'dead', 'stump', 'log', 'trunk', 'branch', 'root', 'roots', 'cone',
           'needle', 'pot', 'planter', 'bonsai', 'palm', 'grass', 'moss', 'flower', 'dandelion', 'celandine', 'clover',
           'leaf', 'leaves', 'mushroom', 'modular', 'building', 'sign', 'fence', 'crate', 'barrel'}


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def download(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    tmp = path + '.part'
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, 'wb') as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, path)
    print('   ', os.path.relpath(path, ROOT), f'({os.path.getsize(path) // 1024} KB)')


def lookup(files, names):
    lower = {k.lower(): k for k in files}
    for n in names:
        if n in lower:
            return files[lower[n]]
    return None


def pick_res(entry, want):
    order = [want, '1k', '2k', '4k']
    for res in order:
        if res in entry:
            return entry[res]
    return next(iter(entry.values()), None)


def text_of(asset_id, info):
    parts = [asset_id, info.get('name', '')] + list(info.get('tags', [])) + list(info.get('categories', []))
    return ' '.join(parts).lower()


def choose_texture(catalog, preferred, keywords):
    for pid in preferred:
        if pid in catalog:
            return pid
    for aid, info in sorted(catalog.items(), key=lambda kv: -kv[1].get('download_count', 0)):
        if any(k in text_of(aid, info) for k in keywords):
            return aid
    return None


def fetch_textures(manifest):
    print('\nGround and road materials')
    catalog = get_json(API + '/assets?t=textures')
    for role, (preferred, keywords, res) in TEXTURES.items():
        aid = choose_texture(catalog, preferred, keywords)
        if not aid:
            print(f'  {role}: nothing suitable found, the game will generate it')
            continue
        print(f'  {role}: {aid}')
        try:
            files = get_json(f'{API}/files/{aid}')
            entry = {}
            for kind, names in MAPS.items():
                m = lookup(files, names)
                if not m:
                    continue
                r = pick_res(m, res)
                fmt = r.get('jpg') or r.get('png')
                if not fmt:
                    continue
                ext = 'jpg' if 'jpg' in r else 'png'
                rel = f'textures/{role}_{kind}.{ext}'
                download(fmt['url'], os.path.join(ROOT, rel))
                entry[kind] = rel
            if 'diff' in entry:
                entry['id'] = aid
                manifest['textures'][role] = entry
                manifest['credits'].append(f'{aid} (texture) - https://polyhaven.com/a/{aid}')
        except Exception as e:  # keep going: one failed asset should not stop the rest
            print(f'    skipped ({e})')
        time.sleep(0.3)


def gltf_size(files):
    g = files.get('gltf', {})
    r = g.get('1k') or g.get('2k')
    if not r or 'gltf' not in r:
        return None, None
    entry = r['gltf']
    size = entry.get('size', 0) + sum(v.get('size', 0) for v in entry.get('include', {}).values())
    return entry, size


def count_triangles(gltf_path):
    try:
        j = json.load(open(gltf_path, encoding='utf-8'))
        total = 0
        for mesh in j.get('meshes', []):
            for p in mesh.get('primitives', []):
                if 'indices' in p:
                    total += j['accessors'][p['indices']]['count'] // 3
                else:
                    total += j['accessors'][p['attributes']['POSITION']]['count'] // 3
        return total
    except Exception:
        return 0


def words(asset_id, info):
    return set(asset_id.lower().split('_')) | set(info.get('name', '').lower().replace('-', ' ').split())


def suitable(role, asset_id, info):
    w = words(asset_id, info)
    cats = {c.lower() for c in info.get('categories', [])}
    rule = MODELS[role]
    return bool(w & set(rule['include'])) and not (w & (EXCLUDE | set(rule.get('exclude', [])))) and bool(cats & ALLOWED_CATEGORIES[role])


def fetch_models(manifest):
    print('\nTrees, rocks and shrubs')
    catalog = get_json(API + '/assets?t=models')
    used = set()
    for role, rule in MODELS.items():
        preferred = [a for a in rule['prefer'] if a in catalog]
        others = sorted((a for a, info in catalog.items() if a not in preferred and suitable(role, a, info)),
                        key=lambda a: -catalog[a].get('download_count', 0))
        picked = []
        for aid in preferred + others:
            if len(picked) >= rule['count']:
                break
            if aid in used:
                continue
            try:
                files = get_json(f'{API}/files/{aid}')
            except Exception as e:
                print(f'  {aid}: skipped ({e})')
                continue
            entry, size = gltf_size(files)
            if not entry or size > rule['max_mb'] * 1024 * 1024:
                continue
            print(f'  {role}: {aid} ({size // (1024 * 1024)} MB)')
            try:
                folder = f'models/{aid}'
                main_file = os.path.basename(entry['url'].split('?')[0])
                download(entry['url'], os.path.join(ROOT, folder, main_file))
                tris = count_triangles(os.path.join(ROOT, folder, main_file))
                if tris > rule['max_tris']:
                    print(f'    skipped: {tris // 1000}k triangles is too detailed for smooth driving')
                    shutil.rmtree(os.path.join(ROOT, folder), ignore_errors=True)
                    continue
                for rel, inc in entry.get('include', {}).items():
                    download(inc['url'], os.path.join(ROOT, folder, rel))
                picked.append({'file': f'{folder}/{main_file}', 'id': aid, 'name': catalog[aid].get('name', aid)})
                used.add(aid)
                manifest['credits'].append(f'{aid} (model) - https://polyhaven.com/a/{aid}')
            except Exception as e:
                print(f'    skipped ({e})')
            time.sleep(0.3)
        if picked:
            manifest['models'][role] = picked
        else:
            print(f'  {role}: nothing suitable found, the game keeps its own')
    # remove models from earlier runs that are no longer used
    models_dir = os.path.join(ROOT, 'models')
    if os.path.isdir(models_dir):
        for d in os.listdir(models_dir):
            if d not in used:
                shutil.rmtree(os.path.join(models_dir, d), ignore_errors=True)
                print('  removed old model', d)


FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Overpass:wght@400;600;700;800&display=swap'
FONT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'


def fetch_fonts():
    """Save the interface fonts next to the game, so it looks right without internet."""
    import re
    print('\nInterface fonts')
    folder = os.path.join(os.path.dirname(ROOT), 'fonts')
    os.makedirs(folder, exist_ok=True)
    req = urllib.request.Request(FONTS_CSS, headers={'User-Agent': FONT_UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        css = r.read().decode('utf-8')
    for i, url in enumerate(sorted(set(re.findall(r'url\((https://[^)]+\.woff2)\)', css)))):
        name = f'font{i}.woff2'
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': FONT_UA}), timeout=60) as r, open(path, 'wb') as f:
                f.write(r.read())
        css = css.replace(url, name)
    with open(os.path.join(folder, 'fonts.css'), 'w', encoding='utf-8') as f:
        f.write(css)
    print('  saved to dist/fonts')


# Model kits you add yourself. Put free CC0 kits (for example Kenney's "Car Kit" and "City Kit
# (Suburban)" from kenney.nl) in dist/assets/packs/, unzipped as they come, and run this script again.
# Each .glb or .gltf file is sorted by its name: vehicles become traffic, buildings become houses.
PACKS = os.path.join(ROOT, 'packs')
CAR_WORDS = ('car', 'sedan', 'hatch', 'suv', 'van', 'taxi', 'truck', 'pickup', 'police', 'ambulance', 'delivery', 'coupe', 'wagon', 'race', 'sports')
HOUSE_WORDS = ('house', 'building', 'cottage', 'home', 'barn', 'cabin', 'villa', 'bungalow')
SKIP_WORDS = ('wheel', 'debris', 'cone', 'garage-door', 'roof', 'wall', 'door', 'window', 'fence', 'tree', 'path', 'road', 'tile', 'planter')


def scan_packs(manifest):
    if not os.path.isdir(PACKS):
        return
    found = {'car': [], 'house': []}
    for d, _, files in os.walk(PACKS):
        for n in sorted(files):
            if not n.lower().endswith(('.glb', '.gltf')):
                continue
            stem = os.path.splitext(n)[0].lower()
            words = stem.replace('_', '-').split('-')
            if any(w in SKIP_WORDS for w in words):
                continue
            role = 'car' if any(w in CAR_WORDS for w in words) else 'house' if any(w in HOUSE_WORDS for w in words) else None
            if not role or any(stem == os.path.splitext(f['file'])[0].split('/')[-1].lower() for f in found[role]):
                continue   # one copy of each model (kits often ship the same model in several formats)
            rel = os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, '/')
            found[role].append({'id': stem, 'name': stem.replace('-', ' ').replace('_', ' '), 'file': rel})
    for role, items in found.items():
        if items:
            manifest['models'][role] = items[:24]
            manifest['credits'].append(f'{len(items)} {role} models from your kits in assets/packs (check each kit for its licence)')
            print(f'  {role}: {len(items)} models from your kits')


def main():
    print('Everway: downloading realistic scenery from Poly Haven (CC0)')
    print('Saving to', ROOT)
    manifest = {'version': 1, 'source': 'Poly Haven (CC0)', 'textures': {}, 'models': {}, 'credits': []}
    try:
        fetch_textures(manifest)
        fetch_models(manifest)
        try:
            fetch_fonts()
        except Exception as e:
            print('  fonts skipped (' + str(e) + ')')
    except Exception as e:
        print('\nCould not reach Poly Haven:', e)
        print('Check your internet connection and try again.')
        if not manifest['textures'] and not manifest['models'] and not os.path.isdir(PACKS):
            return 1
    scan_packs(manifest)
    os.makedirs(ROOT, exist_ok=True)
    with open(os.path.join(ROOT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(ROOT, 'CREDITS.txt'), 'w', encoding='utf-8') as f:
        f.write('Assets from Poly Haven (https://polyhaven.com), released under CC0.\n\n' + '\n'.join(manifest['credits']) + '\n')
    total = sum(os.path.getsize(os.path.join(d, n)) for d, _, fs in os.walk(ROOT) for n in fs)
    print(f"\nDone: {len(manifest['textures'])} materials, {sum(len(v) for v in manifest['models'].values())} models, {total // (1024 * 1024)} MB.")
    print('Start the game with START_WINDOWS.bat. Settings should show REALISTIC SCENERY.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
