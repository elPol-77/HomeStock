"""Empareja productos de un catálogo de cadena con Open Food Facts (España) para añadir foto y, si es seguro, código de barras.

Uso: python3 match_off_images.py off_es.jsonl catalogo.json
  off_es.jsonl: una línea JSON por producto OFF {c, n, b, q, i, s} (ver off_es.py)
Reglas (preferimos no poner foto antes que poner una equivocada):
  - La marca del catálogo debe figurar entre las marcas del producto OFF.
  - Las palabras del nombre deben coincidir en buena parte (Dice >= 0.6, >= 0.75 si no hay tamaño comparable).
  - Si ambos tienen tamaño, debe ser el mismo (±3 %). El código de barras solo se guarda con tamaño igual y nombre muy parecido.
"""
import json, re, sys, unicodedata
from collections import defaultdict

STOP = {'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'en', 'para', 'sin', 'al', 'a', 'e', 'o', 'u'}


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


UNIT = {'kg': ('g', 1000), 'g': ('g', 1), 'gr': ('g', 1), 'l': ('ml', 1000), 'lt': ('ml', 1000), 'cl': ('ml', 10), 'ml': ('ml', 1)}


def size_of(text):
    t = norm(text).replace(',', '.')
    t = re.sub(r'(\d) (\d)', r'\1.\2', norm((text or '').replace(',', '.')).replace(' . ', '.'))
    raw = (text or '').lower().replace(',', '.').replace('×', 'x')
    m = re.search(r'(\d+)\s*(?:[a-záéíóúñ]+\s+){0,2}x\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l|lt)\b', raw)
    if m:
        base, k = UNIT[m.group(3)]
        return (base, round(int(m.group(1)) * float(m.group(2)) * k))
    m = re.search(r'(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l|lt)\b', raw)
    if m:
        base, k = UNIT[m.group(2)]
        return (base, round(float(m.group(1)) * k))
    return None


def tokens(s, drop=()):
    out = []
    for t in norm(s).split():
        if t in STOP or t in drop or re.fullmatch(r'\d+(\.\d+)?|\d+(g|kg|ml|cl|l)', t):
            continue
        out.append(t)
    return out


def cover(a, b):
    """Parte de las palabras de a que aparecen en b."""
    sa, sb = set(a), set(b)
    if not sa:
        return 0.0
    hit = sum(1 for t in sa if t in sb or (len(t) >= 5 and any(x.startswith(t[:5]) for x in sb if len(x) >= 5)))
    return hit / len(sa)


def dice(a, b):
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    common = 0.0
    for t in sa:
        if t in sb:
            common += 1
        elif len(t) >= 5 and any(x.startswith(t[:5]) for x in sb if len(x) >= 5):
            common += 0.6
    return 2 * common / (len(sa) + len(sb))


off = []
by_brand = defaultdict(list)
for line in open(sys.argv[1]):
    p = json.loads(line)
    brands = [norm(b) for b in (p.get('b') or '').split(',') if norm(b)]
    if not brands:
        continue
    p['brands'] = brands
    p['size'] = size_of(p.get('q'))
    off.append(p)
    for b in brands:
        by_brand[b].append(p)

cat = json.load(open(sys.argv[2]))
store = cat['store']
img = bc = 0
for it in cat['items']:
    it.pop('i', None)
    it.pop('e', None)
    brand = norm(it.get('b'))
    if not brand:
        continue
    cands = by_brand.get(brand, [])
    if not cands:
        continue
    btoks = set(brand.split())
    tt = tokens(it['n'], btoks)
    size = size_of(it.get('f')) or size_of(it['n'])
    best = None
    for p in cands:
        ot = tokens(p['n'], btoks)
        s = dice(tt, ot)
        # Toda palabra del nombre OFF debe estar en el nuestro (evita "gouda", "naranja", "chocolate blanco"…)
        if s < 0.6 or cover(ot, tt) < 0.99 or cover(tt, ot) < 0.6:
            continue
        same = None if not (size and p['size']) else (size[0] == p['size'][0] and abs(size[1] - p['size'][1]) <= 0.03 * max(size[1], p['size'][1]))
        if same is False:
            continue
        if same is None and s < 0.75:
            continue
        score = s + (0.15 if same else 0) + (0.05 if store in norm(p.get('s')) else 0)
        if not best or score > best[0]:
            best = (score, s, same, p)
    if best:
        _, s, same, p = best
        it['i'] = p['i']
        img += 1
        if same and s >= 0.85 and re.fullmatch(r'\d{8,14}', p['c'] or ''):
            it['e'] = p['c']
            bc += 1

json.dump(cat, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{store}: {img}/{len(cat["items"])} con foto, {bc} con código de barras')
