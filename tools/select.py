# Build tools/new-activities.json from the curated pool (tools/pool.json) by picking
# specific, high-quality activity IDs and applying a few category/label overrides.
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
pool = json.load(open(ROOT/'tools'/'pool.json', encoding='utf-8'))
index = {e['tid']: e for lst in pool.values() for e in lst}

# Selected activity IDs, grouped for readability. Nightlife prioritised for the
# young bar/hostel audience (Barcelona + a Salou party night).
SELECT = [
    # --- Barcelona: nightlife-forward ---
    '84906', '147204', '170032', '333276', '839587', '890438', '928143', '1082881',
    '1125011', '1138649', '1184893', '1219232', '1220933', '1255110', '1258142',
    '1262639', '157464', '629660', '711046', '1299826', '1310822', '1320452',
    # --- Girona province (Costa Brava + city) ---
    '149528', '151013', '309788', '407669', '419114', '831886', '215928', '220695',
    '222411', '396079', '425645', '475482', '546141', '1170725', '427417', '412981',
    '431485', '1204455', '680690', '590538', '1044479', '1316529',
    # --- Lleida province (Pyrenees / Val d'Aran) ---
    '838426', '1003663', '1057236', '1380382', '1397540',
    # --- Tarragona: Salou nightlife ---
    '1084504',
]

OVERRIDES = {
    '84906':   {'trending': True, 'categoria_label': 'Nightlife', 'etiqueta_pie': 'Boat Party'},
    '1082881': {'trending': True, 'categoria_label': 'Nightlife', 'etiqueta_pie': 'VIP Club'},
    '427417':  {'categoria': 'food', 'categoria_label': 'Food & Nightlife', 'etiqueta_pie': 'Boat Party'},
    '1204455': {'categoria': 'tours', 'categoria_label': 'Tour', 'etiqueta_pie': 'Bike Tour'},
    '1220933': {'categoria_label': 'Nightlife', 'etiqueta_pie': 'Rooftop & Boat'},
    '1184893': {'categoria_label': 'Nightlife', 'etiqueta_pie': 'Party Bus'},
    '1084504': {'categoria_label': 'Nightlife', 'etiqueta_pie': 'Party Night'},
}

out, missing = [], []
for tid in SELECT:
    e = index.get(tid)
    if not e:
        missing.append(tid); continue
    entry = {k: e[k] for k in ('path', 'provincia', 'city', 'categoria', 'categoria_label', 'etiqueta_pie')}
    entry.update(OVERRIDES.get(tid, {}))
    out.append(entry)

json.dump(out, open(ROOT/'tools'/'new-activities.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'selected {len(out)} activities; missing tids: {missing}')
from collections import Counter
print('by province:', dict(Counter(x['provincia'] for x in out)))
print('by category:', dict(Counter(x['categoria'] for x in out)))
