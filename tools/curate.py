# Turn the noisy harvest into a curated tools/new-activities.json:
#  - keep only Catalan locations, map each to its province,
#  - drop anything already in catalog.csv,
#  - guess category / labels / footer tag from the URL slug,
#  - balance the selection per province (nightlife prioritised for Barcelona).
import json, csv, re, pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
harvest = json.load(open(ROOT/'tools'/'harvest.json', encoding='utf-8'))

# location slug prefix -> (province, city)
GIRONA = ['girona','lloret-de-mar','tossa-de-mar','costa-brava','figueres','roses-spain','palamos',
          'l-estartit','sant-feliu-de-guixols','blanes','l-escala','empuriabrava','calonge',
          'platja-d-aro','llanca','peratallada','port-lligat','conjunt-de-castell-d-aro','cadaques',
          'besalu','begur','pals']
LLEIDA = ['vielha','baqueira','val-d-aran','lleida','la-seu-d-urgell','seu-d-urgell','sort','boi',
          'espot','rialp','tremp']
TARRAGONA = ['tarragona','salou','cambrils','reus','montblanc','portaventura','costa-daurada','costa-dorada']
BARCELONA = ['barcelona','sitges','montserrat','castelldefels','santa-susanna-spain','palafolls',
             'badalona','gothic-quarter-barcelona']

def province_city(loc):
    base = loc.rsplit('-l', 1)[0]
    for p, lst in [('girona', GIRONA), ('lleida', LLEIDA), ('tarragona', TARRAGONA), ('barcelona', BARCELONA)]:
        if base in lst:
            city = base.replace('-spain', '').replace('gothic-quarter-', '')
            return p, city
    return None, None

def categorize(slug, tag):
    s = slug.lower()
    if tag in ('bcn-nightlife', 'cat-nightlife'):
        return 'food'
    if re.search(r'boat|catamaran|kayak|snorkel|jet-ski|jetski|ferry|cruise|sailing|sail|dive|diving|paddle|speedboat|water-park|aquatic|parasail', s):
        return 'sea'
    if re.search(r'4x4|4-4|quad|rafting|canyon|hiking|hike|zip|zipline|via-ferrata|paraglid|horse|buggy|e-bike|bike|climb|adventure|trek|off-road|segway|kart', s):
        return 'sea'  # "Sea & Adventure" bucket
    if re.search(r'museum|cathedral|castle|dali|history|historic|walking|jewish|monaster|gothic|art|guided-tour|old-town|monument|palace|basilica|romanesque|heritage|game-of-thrones', s):
        return 'culture'
    if re.search(r'wine|tapas|food|paella|cooking|gastro|market|vermouth|flamenco|show|concert|dinner|brunch', s):
        return 'food'
    return 'tours'

LABEL = {'culture':'Culture','sea':'Sea & Adventure','tours':'Tour','food':'Food & Nightlife'}
def footer_tag(slug, cat, tag):
    s = slug.lower()
    if tag in ('bcn-nightlife','cat-nightlife') or 'pub-crawl' in s: return 'Nightlife'
    if 'boat-party' in s or 'party' in s: return 'Boat Party'
    if re.search(r'boat|catamaran|cruise|sailing|ferry', s): return 'Boat Trip'
    if re.search(r'kayak|snorkel|paddle|jet-ski|jetski|dive', s): return 'Water Sports'
    if re.search(r'4x4|quad|rafting|canyon|zip|buggy|off-road|adventure', s): return 'Adventure'
    if re.search(r'hiking|hike|trek', s): return 'Hiking'
    if re.search(r'museum|cathedral|castle|dali|art|palace|basilica', s): return 'Skip the Line'
    if re.search(r'wine|winery|vineyard', s): return 'Wine & Food'
    if re.search(r'flamenco|show|concert', s): return 'Live Show'
    if 'ski' in s or 'baqueira' in s: return 'Mountain'
    return 'Guided Tour'

# existing tids in catalog
existing = set()
with open(ROOT/'web'/'catalog.csv', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        m = re.search(r'-t(\d+)', r['url_getyourguide'])
        if m: existing.add(m.group(1))

pool = defaultdict(list)
for h in harvest:
    if h['tid'] in existing: continue
    prov, city = province_city(h['loc'])
    if not prov: continue
    cat = categorize(h['slug'], h['tag'])
    pool[prov].append({
        'path': h['path'], 'tid': h['tid'], 'provincia': prov, 'city': city,
        'categoria': cat, 'categoria_label': LABEL[cat], 'etiqueta_pie': footer_tag(h['slug'], cat, h['tag']),
        'tag': h['tag'], 'slug': h['slug'],
    })

print('CANDIDATE POOL (after Catalan filter + dedup):')
for p in ['barcelona','girona','lleida','tarragona']:
    items = pool[p]
    print(f'\n== {p.upper()} ({len(items)}) ==')
    by = defaultdict(int)
    for it in items: by[it['categoria']] += 1
    print('  by category:', dict(by))
    for it in items[:60]:
        print(f"   [{it['categoria']:7}] {it['tid']:>8}  {it['slug'][:70]}")

json.dump(pool, open(ROOT/'tools'/'pool.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
