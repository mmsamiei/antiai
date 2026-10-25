"""Fetch licensed, taxon-linked Commons photos; never modifies animal rankings.

Requires requests and Python 3.12. Run manually, not on app startup. Responses are
cached outside the repository; only verified photo assets and credits are saved.
"""
import hashlib
import html
import imghdr
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit, parse_qsl, urlencode
import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path('/root/.cache/animal-photos/raw')
CACHE.mkdir(parents=True, exist_ok=True)
AGENT = 'AntiAIGamesAnimalPhotos/1.0 (https://github.com/mmsamiei/antiai)'


class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = Text(); parser.feed(value or '')
    return re.sub(r'\s+', ' ', html.unescape(' '.join(parser.parts))).strip()


def api(params):
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    path = CACHE / (key + '.json')
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(4):
        response = requests.get('https://commons.wikimedia.org/w/api.php',
                                params={'action': 'query', 'format': 'json', 'maxlag': 5, **params},
                                headers={'User-Agent': AGENT}, timeout=45)
        if response.status_code in (429, 502, 503, 504):
            time.sleep(2 + attempt * 3); continue
        response.raise_for_status()
        data = response.json()
        if 'error' in data:
            if data['error']['code'] == 'maxlag':
                time.sleep(3 + attempt * 3); continue
            raise RuntimeError(str(data['error']))
        path.write_text(json.dumps(data, ensure_ascii=False))
        return data
    raise RuntimeError('Commons temporarily unavailable')


def file_key(name):
    return name.removeprefix('File:').replace('_', ' ').strip().casefold()


def metadata(batch):
    titles = '|'.join('File:' + name for name in batch)
    main = api({'titles': titles, 'redirects': 1, 'prop': 'imageinfo',
                'iiprop': 'url|mime|extmetadata', 'iiurlwidth': 640,
                'iiextmetadatafilter': 'Artist|Credit|LicenseShortName|LicenseUrl|AttributionRequired|Copyrighted|ObjectName'})
    small = api({'titles': titles, 'redirects': 1, 'prop': 'imageinfo',
                 'iiprop': 'url', 'iiurlwidth': 160})
    pages = {file_key(p['title']): p for p in main.get('query', {}).get('pages', {}).values()}
    thumbnails = {file_key(p['title']): p for p in small.get('query', {}).get('pages', {}).values()}
    redirects = {file_key(x['from']): file_key(x['to']) for x in main.get('query', {}).get('redirects', [])}
    result = {}
    for title in batch:
        key = file_key(title); key = redirects.get(key, key)
        page = pages.get(key, {}); info = page.get('imageinfo', [{}])[0]
        thumbnail = thumbnails.get(key, {}).get('imageinfo', [{}])[0]
        if not info.get('thumburl') or not thumbnail.get('thumburl'):
            continue
        result[title] = {**info, 'smallThumbUrl': thumbnail['thumburl'], 'fileTitle': page['title']}
    return result


def clean_url(url):
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode([(k, v) for k, v in parse_qsl(p.query) if not k.startswith('utm_')]), ''))


def download(url, animal_id, size):
    url = clean_url(url)
    cached = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.image')
    if cached.exists():
        data = cached.read_bytes()
    else:
        for attempt in range(4):
            response = requests.get(url, headers={'User-Agent': AGENT}, timeout=45)
            if response.status_code in (429, 502, 503, 504):
                time.sleep(2 + 3 * attempt); continue
            response.raise_for_status()
            data = response.content
            if len(data) > 3_000_000:
                raise RuntimeError('Thumbnail too large')
            cached.write_bytes(data)
            break
        else:
            raise RuntimeError('Thumbnail unavailable')
    ext = 'jpg' if data.startswith(b'\xff\xd8\xff') else {'png': 'png', 'webp': 'webp'}.get(imghdr.what(None, data))
    if not ext:
        raise RuntimeError('Unsupported image signature')
    filename = f'{animal_id}-{size}-{hashlib.sha256(data).hexdigest()[:12]}.{ext}'
    output = ROOT / 'public' / 'animals' / filename
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    return {'src': '/animals/' + filename, 'bytes': len(data)}


def main():
    animals = json.loads((ROOT / 'scripts/data/animals-v1.json').read_text())['animals']
    # Exact P225 scientific-name matches; no fuzzy image search.
    wikidata = CACHE / 'wikidata.json'
    if not wikidata.exists():
        query = 'SELECT ?item ?name ?image WHERE { VALUES ?name {' + ' '.join(json.dumps(a['scientific']) for a in animals) + '} ?item wdt:P225 ?name; wdt:P18 ?image. }'
        response = requests.get('https://query.wikidata.org/sparql', params={'query': query, 'format': 'json'}, headers={'User-Agent': AGENT}, timeout=60)
        response.raise_for_status(); wikidata.write_text(json.dumps(response.json()))
    bindings = json.loads(wikidata.read_text())['results']['bindings']
    choices = {}
    for row in bindings:
        title = unquote(row['image']['value'].split('/Special:FilePath/')[-1])
        choices.setdefault(row['name']['value'], []).append((title, row['item']['value'].replace('http:', 'https:')))
    # The expanded species catalog carries exact Wikidata taxon and image links,
    # so new animals do not depend on refreshing a stale SPARQL cache.
    popular = ROOT / 'scripts/data/animal-wikipedia-popular-v1.json'
    wikidata_item_by_scientific = {}
    if popular.exists():
        for animal in json.loads(popular.read_text()).get('addedAnimals', []):
            wikidata_item_by_scientific[animal['scientific']] = 'https://www.wikidata.org/entity/' + animal['wikidata']
            if animal.get('wikidataImage'):
                title = unquote(animal['wikidataImage'].split('/Special:FilePath/')[-1])
                choices.setdefault(animal['scientific'], []).insert(
                    0, (title, wikidata_item_by_scientific[animal['scientific']]))
    curated_path = ROOT / 'scripts/data/animal-curated-additions-v1.json'
    if curated_path.exists():
        for animal in json.loads(curated_path.read_text()).get('animals', []):
            item_url = 'https://www.wikidata.org/entity/' + animal['wikidata']
            wikidata_item_by_scientific[animal['scientific']] = item_url
            for title in reversed(animal.get('commonsFiles', [])):
                choices.setdefault(animal['scientific'], []).insert(0, (title, item_url))
    overrides = ROOT / 'scripts/data/animal-photo-overrides.json'
    if overrides.exists():
        for animal in animals:
            for title in reversed(json.loads(overrides.read_text()).get(animal['id'], [])):
                item = wikidata_item_by_scientific.get(animal['scientific']) or next(
                    row['item']['value'].replace('http:', 'https:') for row in bindings
                    if row['name']['value'] == animal['scientific'])
                choices.setdefault(animal['scientific'], []).insert(0, (title, item))
    titles = list(dict.fromkeys(title for rows in choices.values() for title, _ in rows))
    info = {}
    batches = [titles[i:i+5] for i in range(0, len(titles), 5)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        for index, result in enumerate(pool.map(metadata, batches)):
            info.update(result)
            print(f'Metadata {index+1}/{len(batches)}', flush=True)
    (CACHE / 'all-metadata.json').write_text(json.dumps(info, ensure_ascii=False, indent=2))

    def choose(animal):
        errors = []
        for title, item in choices.get(animal['scientific'], []):
            try:
                image = info.get(title)
                if not image or image.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'):
                    continue
                meta = image.get('extmetadata', {})
                value = lambda key: plain(meta.get(key, {}).get('value', ''))
                license_name, artist = value('LicenseShortName'), value('Artist')
                if not re.fullmatch(r'CC (?:BY(?:-SA)? \d\.\d(?: [a-z]{2})?|0)', license_name) and license_name not in ('Public domain', 'CC0'):
                    continue
                if not artist and value('AttributionRequired').lower() == 'true':
                    continue
                if not artist:
                    artist = 'نام عکاس در ویکی‌انبار درج نشده'
                license_url = value('LicenseUrl')
                if license_url.startswith('//'): license_url = 'https:' + license_url
                small = download(image['smallThumbUrl'], animal['id'], 'small')
                large = download(image['thumburl'], animal['id'], 'large')
                return {'animalId': animal['id'], 'scientific': animal['scientific'], 'name': animal['name'],
                        'wikidataUrl': item, 'commonsTitle': image['fileTitle'],
                        'sourceUrl': image['descriptionurl'], 'artist': artist,
                        'license': license_name, 'licenseUrl': license_url,
                        'small': small, 'large': large}
            except Exception as error:
                errors.append(f'{title}: {type(error).__name__} {error}')
        return {'animalId': animal['id'], 'name': animal['name'], 'missing': True, 'errors': errors}

    with ThreadPoolExecutor(max_workers=3) as pool:
        catalog = []
        for entry in pool.map(choose, animals):
            catalog.append(entry); print(entry['name'], 'MISSING' if entry.get('missing') else 'OK', flush=True)
    missing = [x for x in catalog if x.get('missing')]
    (CACHE / 'download-report.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
    if missing:
        print('Missing:', json.dumps(missing, ensure_ascii=False), flush=True)
        raise RuntimeError(f'{len(missing)} animals still need photos; catalog not published')
    path = ROOT / 'scripts/data/animal-photos.json'
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print('Catalog ready:', len(catalog), 'animals;', sum(x['small']['bytes']+x['large']['bytes'] for x in catalog), 'bytes', flush=True)


if __name__ == '__main__':
    main()
