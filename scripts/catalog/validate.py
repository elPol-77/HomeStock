"""Valida y normaliza un catálogo JSON de cadena antes de incluirlo en la app.

Uso: python3 validate.py entrada.json salida.json
Descarta artículos incompletos o dudosos (nunca inventa datos) y muestra un resumen.
"""
import json, re, sys, unicodedata

CATS = {"Lácteos y huevos", "Frutas y verduras", "Carne y pescado", "Despensa", "Panadería y desayuno", "Congelados",
        "Bebidas", "Limpieza", "Lavandería", "Higiene personal", "Bebé", "Mascotas", "Otros"}
UNITS = {"ud", "pack", "kg", "l"}


def slug(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:48]


src = json.load(open(sys.argv[1]))
assert src.get('store') and re.fullmatch(r'\d{4}-\d{2}-\d{2}', src.get('capturedAt', '')), 'falta store o capturedAt'
prefix = src['store'][:2] + '-'
out, seen, dropped = [], set(), []
for it in src.get('items', []):
    try:
        n = re.sub(r'\s+', ' ', str(it['n'])).strip()
        p = round(float(it['p']), 2)
        o = it.get('o')
        o = round(float(o), 2) if o not in (None, '', 0) else None
        u = it.get('u') if it.get('u') in UNITS else 'ud'
        c = it.get('c') if it.get('c') in CATS else 'Otros'
        f = re.sub(r'\s+', ' ', str(it['f'])).strip() if it.get('f') else None
    except (KeyError, TypeError, ValueError):
        dropped.append(it)
        continue
    if len(n) < 3 or not (0.05 <= p <= 600) or (o is not None and not (p < o <= 3 * p)):
        dropped.append(it)
        continue
    key = slug(n) + '|' + slug(f or '')
    if key in seen:
        continue
    seen.add(key)
    iid = it.get('id') or prefix + slug(f'{n} {f or ""}')
    if not iid.startswith(prefix):
        iid = prefix + iid
    out.append({'id': iid, 'n': n, 'b': it.get('b'), 'f': f, 'p': p, 'o': o, 'u': u, 'c': c, 's': it.get('s')})

ids = {}
for x in out:
    while x['id'] in ids:
        x['id'] += 'x'
    ids[x['id']] = 1
json.dump({'store': src['store'], 'capturedAt': src['capturedAt'], 'source': src.get('source', ''), 'items': out},
          open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print(f"{src['store']}: {len(out)} válidos, {len(dropped)} descartados")
