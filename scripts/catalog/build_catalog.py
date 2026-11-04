"""Build the bundled Mercadona catalog from parsed screenshot cards.

Usage: python3 build_catalog.py out.json parsed1.json [parsed2.json ...]
"""
import hashlib, json, re, sys, unicodedata

CAPTURED_AT = '2026-11-04'

BRANDS = [
    'La Hacienda del ibérico', 'Hacendado', 'Bosque Verde', 'Deliplus', 'Compy', 'Nescafé', 'Nestlé', 'Incarlopsa', 'La Selva',
    'Oscar Mayer', 'Noel', 'La Carloteña', 'Campofrío', 'Campina', 'Holland Corona', 'Philadelphia', 'Burgo de Arias', 'Babybel',
    'La vaca que ríe', "Kellogg's", 'Brüggen', 'Nature Valley', 'Enervit', 'Lotus Biscoff', 'Rogusa', 'Revilla', 'Covap', 'Schara',
    'Paletas Marpa', 'El Pozo', 'ElPozo', 'Cárnicas Gállego', 'Bricio', 'Coren', 'Zanetti', 'Punteiro', 'Marcillat', 'Plaisir de Roy',
    'Liptana', 'Valblu', 'Antonio Álvarez', 'Embutidos Pajariel', 'Jamcal', 'Can Pere Joan', "L'Illa especialidades", 'La Piara',
    'Bronchales', 'Cortes', 'Bezoya', 'Font Vella', 'Lanjarón', 'Solán de Cabras', 'Vichy Catalan', 'San Pellegrino', 'Fonter',
    'Aquarel', 'La Casa', 'Mahou', 'Estrella Galicia', 'Estrella Damm', 'Cruzcampo', 'Alhambra', 'Heineken', 'Amstel', 'San Miguel',
    'Voll-Damm', 'Ambar', 'Coca-Cola', 'Pepsi', 'Fanta', 'Cola Cao', 'ColaCao', 'Nesquik', 'Dolce Gusto', 'Marcilla', 'Saimaza',
    'Bonka', 'Pompadour', 'Hornimans', 'Lipton', 'Dodot', 'Nutribén', 'Blevit', 'Chicco', 'Nuk', 'Suavinex', 'Tío Pepe',
    'Don Simón', 'Ramón Bilbao', 'Protos', 'Viña Pomal', 'Marqués de Cáceres', 'Freixenet', 'Codorníu', 'Cune', 'Faustino',
    'El Gaitero', 'Trapiche', 'Lambrusco', 'Casera', 'Gallo', 'Ybarra', 'Carbonell', 'Calvo', 'Isabel', 'Orlando', 'Gullón',
    'Cuétara', 'Fontaneda', 'Danone', 'Pascual', 'Puleva', 'Kaiku', 'Central Lechera Asturiana',
    'Schweppes', 'Pringles', 'Valor', 'Ultrex', 'Pantene', 'Gillette', 'Nivea', 'Dove', 'Activia', 'Alpro', 'Kit-Kat',
    'Monster Energy', 'Aquarius', 'Fuze Tea', 'La Verja', 'Delikuit', 'Nuske', 'Granzoo', 'Asturiana', 'Turia', 'Paulaner',
    'Nidina', 'Hero Solo', 'Ruiz', 'Wasa', 'Anitin', 'La Muralla', 'Inés Rosales', 'Buitoni', 'Royal', 'Levital', 'Mission',
    'Delibreads', 'Galbusera', 'Bachman', 'Pescanova', 'MareDeus', 'Nortindal', 'Royal Greenland', 'Ubago', 'Colorcor',
    'Excellence Creme', 'Color Sensation', 'Alitey', 'Sprite', 'Iso drink', 'Maltín Polar', 'El Águila', 'Gallina Blanca',
    'Quartett', 'Gourmet Gold', 'Purina', 'Sabroz', 'Tivall', 'Heinz', 'Campina', 'Bifrutas', 'Actimel', 'Danonino',
    'Danacol', 'Cuidacol', 'L-casei', 'Petit', 'Nenuco', 'Colgate', 'Sensodyne', 'Oral-B', 'Listerine', 'Ausonia', 'Tampax',
]
BRANDS.sort(key=len, reverse=True)


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def brand_of(name):
    n = ' ' + norm(name) + ' '
    best = None
    for b in BRANDS:
        nb = ' ' + norm(b) + ' '
        i = n.rfind(nb)
        if i >= 0 and (best is None or i > best[0]):
            best = (i, b)
    if not best:
        return None
    b = best[1]
    return {'ElPozo': 'El Pozo', 'Lambrusco': None}.get(b, b)


FROZEN_PAGES = {'fruta y verdura', 'arroz y pasta', 'helados', 'hielo', 'pescado congelado', 'pizzas', 'rebozados', 'tartas y churros', 'carne congelada'}

RULES = [
    ('Bebé', r'\bbebes?\b|panal|infantil|biberon|chupete|potito|tarrito|papilla|toallitas y panales'),
    ('Mascotas', r'^(gato|perro)\b|pajaro|mascota|pienso|arena para gato|perro|gato adulto|gato junior'),
    ('Higiene personal', r'champu|acondicionador|mascarilla|coloracion|fijacion|cabello|afeitado|desodorante|\bgel\b|jabon|dental|bucal|dentifrico|higiene|compresa|tampon|protegeslip|manicura|pedicura|perfume|colonia|solar|aftersun|maquillaje|labios|\bojos\b|colorete|polvos|pinceles|facial|corporal|depilacion|fitoterapia|parafarmacia|botiquin|preservativo|toallitas'),
    ('Lavandería', r'detergente|suavizante|quitamanchas|planchado|lavadora|activador|perfumador ropa'),
    ('Limpieza', r'limpieza|lejia|liquidos fuertes|friegasuelos|limpiahogar|limpiacristales|estropajo|bayeta|guantes|insecticida|ambientador|lavavajillas|vajilla|menaje|conservacion de alimentos|bolsas de basura|pilas|utensilios|fregona|escoba|amoniaco|salfuman|piscina|celulosa|servilleta|rollo cocina|papel higienico|panuelos'),
    ('Bebidas', r'refresco|zumo|nectar|smoothie'),
    ('Lácteos y huevos', r'bifidus|natilla|\bflan\b|gelatina|kefir|cuajada|yogur|postre'),
    ('Panadería y desayuno', r'\bpicos\b|picatoste|rosquilleta|regana|grissini'),
    ('Panadería y desayuno', r'\bcafe\b|capsula|cacao|\bte\b|infusion|cereal|muesli|galleta|tortita|mermelada|\bpan\b|panaderia|bolleria|barrita|\bmiel\b'),
    ('Despensa', r'chocolate|bombon|turron|golosina|chicle|caramelo|frutos secos|fruta desecada|conserva|cocktail|berberecho|mejillon|almeja|atun|sardina|bonito'),
    ('Lácteos y huevos', r'queso|leche|yogur|huevo|mantequilla|margarina|postre|\bnata\b|requeson|mozzarella|burrata|batido'),
    ('Bebidas', r'cerveza|vino|sidra|cava|tinto|lambrusco|rosado|\bagua\b|refresco|zumo|isotonic|energetico|tonica|bitter|gaseosa|bebida|licor|sangria|vermut'),
    ('Carne y pescado', r'vacuno|cerdo|pollo|\baves\b|conejo|cordero|embutido|jamon|chopped|mortadela|bacon|salchich|pate|sobrasada|hamburguesa|arreglo|empanado|elaborado|\bcarne\b|marisco|pescado|salazon|ahumado|lomo|chorizo|salchichon|pavo'),
    ('Frutas y verduras', r'fruta|verdura|lechuga|ensalada|hortaliza'),
    ('Despensa', r'golosina|aceituna|encurtido|pepinillo|snack|aperitivo|patatas fritas|mayonesa|ketchup|mostaza|alioli|allioli|coctel|banderilla|chicle|caramelo|vinagre|harina|tomate|turron|azucar|chocolate|\barroz\b|legumbre|pasta|aceite|especia|salsa|conserva|caldo|sopa|crema|gazpacho|dulce|bombon|frutos secos|edulcorante|sal\b'),
]


def category_of(name, page, section):
    p = norm(page or '')
    nn = norm(name)
    if p in FROZEN_PAGES or re.search(r'congelad|ultracongelad', nn):
        return 'Congelados'
    if re.search(r'\bbebes?\b|panal|biberon|chupete|potito|tarrito|papilla', nn):
        return 'Bebé'
    for scope in (f'{p} {norm(section or "")}', nn):
        for cat, rx in RULES:
            if re.search(rx, scope):
                return cat
    return 'Otros'


def fix_text(s):
    s = s.replace('×', 'x')
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\.\.\.$|…$', '…', s)
    s = re.sub(r'(\d)\s*,\s*(\d)', r'\1,\2', s)
    return s


out = {}
cards = {}
rejected = []
for path in sys.argv[2:]:
    for it in json.load(open(path))['items']:
        raw = re.sub(r'\s+[\d\s]*[x×]\s*\W.*$', '', it['name'])  # formato ilegible pegado al nombre
        name = re.sub(r'^(novedad|nuevo)\s+', '', fix_text(raw), flags=re.I)
        fmt = fix_text(it['format']) if it['format'] else None
        if not re.search(r'[a-zA-Záéíóúñ]{3}', name) or re.search(r'€|a[ñn]adir', name, re.I) or not (0.05 <= it['price'] <= 600):
            rejected.append(it)
            continue
        if re.match(r'\d+\s+(mini\s+)?\w+\s*x\s*\d', name) or re.fullmatch(r'(lata|botella|botell[ií]n|paquete|caja|bote|tarro|bandeja|brik|pack|pieza|garrafa|bolsa)\b.*\d.*', name, re.I):
            rejected.append(it)
            continue
        old = it['old_price']
        if old and old > 2.0 * it['price']:
            # El precio tachado es pequeño y gris: el OCR confunde a menudo el "1" inicial con un "4".
            s_old = f"{old:.2f}"
            if s_old.startswith('4'):
                cand = float('1' + s_old[1:])
                old = cand if it['price'] < cand <= 1.6 * it['price'] else None
            else:
                old = None
        it['old_price'] = old
        name = re.sub(r'\s*\.{2,}$', '…', name)
        key = norm(name) + '|' + norm(fmt or '')
        if key in out:
            continue
        unit = it['price_unit']
        cards[key] = {'file': it['file'], 'x': it['x'], 'top': it['top'], 'pitch': it.get('pitch'), 'lh': it.get('lh')}
        out[key] = {
            'id': 'mc-' + hashlib.sha1(key.encode()).hexdigest()[:10],
            'n': name,
            'b': brand_of(name),
            'f': fmt,
            'p': round(it['price'], 2),
            'o': round(it['old_price'], 2) if it['old_price'] else None,
            'u': unit,
            'c': category_of(name, it['page'], it['section']),
            's': it['section'] or it['page'],
        }

items = sorted(out.values(), key=lambda x: (x['c'], x['s'] or '', x['n']))
json.dump({'store': 'mercadona', 'capturedAt': CAPTURED_AT, 'source': 'Web pública de Mercadona (capturas aportadas por el usuario)', 'items': items},
          open(sys.argv[1], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(items), 'items;', len(rejected), 'rejected')
from collections import Counter
print(Counter(i['c'] for i in items))

json.dump({out[k]['id']: cards[k] for k in out}, open(sys.argv[1].replace('.json', '.cards.json'), 'w'))
