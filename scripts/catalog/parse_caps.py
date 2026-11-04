"""Parse Mercadona web screenshots (OCR boxes) into catalog entries.

Usage: python3 parse_caps.py caps_ocr_latin.json out.json
"""
import json, re, sys, statistics, unicodedata

ocr = json.load(open(sys.argv[1]))

ANCHOR = re.compile(r'a[ñn]adir\s*al\s*carro', re.I)
PRICE = re.compile(r'(\d{1,3}(?:[.,]\d{1,2}))\s*€')
FORMAT_WORDS = r'(bote|tarro|caja|paquete|botella|lata|latas|bandeja|pieza|brik|garrafa|bolsa|frasco|vaso|tarrina|pack|malla|sobre|sobres|estuche|tableta|barqueta|granel|cubo|tubo|spray|envase|tarrito|bolsita|cartucho|barra|rollo|rollos|bidón|bidon|bombona|blister|blíster|copa|unidad|unidades|docena|lote|saco|tetrabrik|cápsulas|capsulas|cesta|bandejas|paquetes|botellas|briks|tarros|vasos|tarrinas|botes|cajas|cuña|loncha|lonchas|ud\.|\d+\s*ud)'
FORMAT = re.compile(r'^\s*(' + FORMAT_WORDS + r')\b|\d\s*(g|kg|ml|l|cl|ud)\b\.?|\bx\s*\d', re.I)
HEADING_SKIP = re.compile(r'(mercadona|buscar|categor|listas|identif|pol[ií]tica|t[ée]rminos|atenci[óo]n|espa[ñn]ol|^ver\s)', re.I)


def unit_of(text):
    m = re.search(r'/\s*([a-zA-Z.]+)', text)
    if not m:
        return 'ud'
    u = m.group(1).lower().strip('.')
    if u.startswith('k'):
        return 'kg'
    if u.startswith('p'):
        return 'pack'
    if u in ('l', 'i', '1') or u.startswith('li'):
        return 'l'
    return 'ud'


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def clean(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.replace(' ,', ',').replace('( ', '(').replace(' )', ')')
    return s


items = []
stats = {}
for fname, lines in ocr.items():
    for l in lines:
        l['cx'] = l['left'] + l['width'] / 2
        l['bottom'] = l['top'] + l['height']
    anchors = [l for l in lines if ANCHOR.search(l['text'])]
    if not anchors:
        stats[fname] = 0
        continue
    h = statistics.median(a['height'] for a in anchors)
    xs = sorted(set(round(a['cx']) for a in anchors))
    diffs = [b - a for a, b in zip(xs, xs[1:]) if b - a > 3 * h]
    pitch = min(diffs) if diffs else 10 * h
    used = set()
    cards = []
    for a in anchors:
        band = [l for l in lines if l is not a and a['cx'] - 0.52 * pitch <= l['left'] < a['cx'] + 0.35 * pitch and l['top'] < a['top'] - 0.3 * h
                and a['top'] - l['top'] < 14 * h and not ANCHOR.search(l['text'])]
        # rows
        band.sort(key=lambda l: -l['top'])
        rows = []
        for l in band:
            if rows and abs(rows[-1][0]['top'] - l['top']) < 0.45 * h:
                rows[-1].append(l)
            else:
                rows.append([l])
        if not rows:
            continue
        price_row = rows[0]
        ptext = ' '.join(x['text'] for x in sorted(price_row, key=lambda x: x['left']))
        prices = PRICE.findall(ptext.replace(' ,', ','))
        if not prices:
            continue
        text_left = min(x['left'] for x in price_row)
        tol = 0.08 * pitch
        rest = []
        for r in rows[1:]:
            r = [x for x in r if abs(x['left'] - text_left) < tol]
            if r:
                rest.append(r[0])
        if not rest:
            continue
        # format = first row if it looks like a format
        chain = []
        prev = price_row[0]
        for x in rest:
            gap = prev['top'] - x['top']
            if gap > (3.2 if not chain else 2.0) * h:
                break
            chain.append(x)
            prev = x
            if len(chain) >= 5:
                break
        if not chain:
            continue
        fmt = None
        if FORMAT.search(chain[0]['text']) and len(chain) > 1:
            fmt = chain[0]
            names = chain[1:]
        else:
            names = chain
        names = names[:3]
        name = clean(' '.join(x['text'] for x in reversed(names)))
        if len(name) < 3:
            continue
        for x in [*price_row, *chain]:
            used.add(id(x))
        vals = [float(p.replace(',', '.')) for p in prices]
        price = vals[-1]
        old = vals[0] if len(vals) > 1 and vals[0] > price else None
        per_g = re.search(r'/\s*(\d+)\s*g\b', ptext.split('€')[-1])
        forced_unit = None
        if per_g:  # "1,94 € /150 g" (marisco a granel) -> €/kg
            k = 1000 / int(per_g.group(1))
            price = round(price * k, 2)
            old = round(old * k, 2) if old else None
            forced_unit = 'kg'
        cards.append({
            'name': name,
            'format': clean(fmt['text']) if fmt else None,
            'price': price,
            'old_price': old,
            'price_unit': forced_unit or unit_of(ptext.split('€')[-1]),
            'top': names[-1]['top'],
            'x': text_left,
            'score': min(x['score'] for x in [*names, *price_row]),
            'raw_price': ptext,
        })
    # headings: left-aligned to some column, larger than name text, not in cards
    name_h = statistics.median([l['height'] for l in lines if id(l) in used] or [h])
    col_lefts = sorted(set(round(c['x']) for c in cards))
    min_left = min(col_lefts) if col_lefts else 0
    def lonely(l):
        return not any(o is not l and abs(o['top'] - l['top']) < 0.5 * h and o['left'] > min_left + 0.5 * pitch for o in lines)
    heads = [l for l in lines if id(l) not in used and abs(l['left'] - min_left) < 0.08 * pitch
             and not HEADING_SKIP.search(l['text']) and not ANCHOR.search(l['text']) and '€' not in l['text']
             and not re.search(r'novedad|temporalmente|sin stock', l['text'], re.I) and lonely(l)]
    heads.sort(key=lambda l: l['top'])
    title = heads[0]['text'] if heads else None
    for c in cards:
        above = [hd for hd in heads if hd['top'] < c['top']]
        c['section'] = above[-1]['text'] if above else None
        c['page'] = title
        c['file'] = fname
        items.append(c)
    stats[fname] = len(cards)

json.dump({'items': items, 'stats': stats}, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print(len(items), 'items')
for f, n in stats.items():
    print(f, n, file=sys.stderr)
