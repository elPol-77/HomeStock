"""Convierte lo leído de las páginas de categoría de tienda.consum.es al formato de catálogo de HomeStock.

Entrada: JSON {"<idCategoria>": {"MARCA|Nombre": [marca, nombre, "x,xx €/1 Kg", precioAnterior, precio]}}
Uso: python3 consum_import.py entrada.json assets/catalog/consum.json 2026-11-04
"""
import hashlib, json, re, sys, unicodedata

TOP = {
    '2811': ('Despensa', 'Despensa'), '1690': ('Bebidas', 'Bebidas'), '2812': ('Frescos', None), '4108': ('Horno', 'Panadería y desayuno'),
    '1833': ('Platos preparados', None), '1783': ('Congelados y helados', 'Congelados'), '2297': ('Infantil', 'Bebé'),
    '1239': ('Droguería y limpieza', 'Limpieza'), '2814': ('Cuidado personal', 'Higiene personal'), '2469': ('Mascotas', 'Mascotas'),
}

RULES = [
    ('Bebé', r'\b(bebe|panal|infantil|biberon|chupete|potito|papilla|toallitas bebe)'),
    ('Mascotas', r'\b(perro|gato|mascota|pienso)'),
    ('Congelados', r'\b(congelad|ultracongelad|helado)'),
    ('Lavandería', r'\b(detergente|suavizante|quitamanchas|lavadora)'),
    ('Limpieza', r'\b(lejia|friegasuelos|lavavajillas|limpiador|limpia|estropajo|bayeta|ambientador|insecticida|bolsas basura|papel cocina|servilleta)'),
    ('Higiene personal', r'\b(champu|gel |jabon|dentifrico|pasta dientes|desodorante|compresa|papel higienico|colonia|crema|maquinilla)'),
    ('Lácteos y huevos', r'\b(postre|gazpacho|salmorejo|hummus|tortilla|pizza|lasana|croqueta|empanada|leche|yogur|queso|mantequilla|nata|huevo|kefir|bifidus|natillas|flan|cuajada)'),
    ('Bebidas', r'\b(agua|refresco|zumo|nectar|cerveza|vino|cava|sidra|tonica|bebida)'),
    ('Panadería y desayuno', r'\b(pan |pan$|galleta|cereales|muesli|cafe|capsulas|infusion|manzanilla|tila|cacao|mermelada|miel|bolleria|magdalena|croissant)'),
    ('Carne y pescado', r'\b(albondiga|alitas|alas |muslo|contramuslo|pechuga|solomillo|filete|costilla|panceta|morcilla|longaniza|butifarra|chistorra|mortadela|chopped|pate|sobrasada|anchoa|boqueron|sardina|atun fresco|rape|emperador|trucha|mejillon|almeja|navaja|surimi|pollo|pavo|cerdo|ternera|vacuno|cordero|conejo|carne|hamburguesa|salchicha|chorizo|jamon|lomo|bacon|fuet|salchichon|pescado|merluza|salmon|bacalao|gamba|langostino|calamar|sepia|pulpo|dorada|lubina)'),
    ('Frutas y verduras', r'\b(acelga|albahaca|perejil|cilantro|hierbabuena|puerro|apio|alcachofa|esparrago|judia verde|calabaza|boniato|rabano|remolacha|col |lombarda|repollo|endibia|canonigo|rucula|brote|mango|pina|papaya|granada|caqui|ciruela|melocoton|nectarina|cereza|frambuesa|arandano|manzana|platano|naranja|mandarina|limon|pera|uva|fresa|melon|sandia|kiwi|aguacate|tomate|lechuga|cebolla|ajo|patata|zanahoria|pimiento|calabacin|berenjena|pepino|espinaca|brocoli|coliflor|champinon|seta|ensalada|fruta|verdura)'),
]

SIZE = re.compile(r'((?:Pack de \d+ )?\d+ ?x ?\d+(?:[.,]\d+)? ?(?:Kg|Gr|g|ml|L|cl|U)\b\.?|\d+(?:[.,]\d+)? ?(?:Kg|Gr|g|ml|L|cl|U|ud\.?|Unidades|Lavados|Rollos|Bolsitas|Cápsulas|Pastillas)\b\.?)\s*$', re.I)


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def brand_case(b):
    return ' '.join(w.capitalize() if len(w) > 3 or not w.isupper() else w.capitalize() for w in b.split()).replace("'S", "'s")


def num(s):
    return round(float(s.replace('.', '').replace(',', '.')), 2) if s else None


src = json.load(open(sys.argv[1]))
if 'categories' in src:
    src = src['categories']
date = sys.argv[3] if len(sys.argv) > 3 else '2026-11-04'
out = {}
skipped = 0
key_of_row = {}
for cat, rows in src.items():
    section, fixed = TOP.get(cat, ('Otros', None))
    for row_key, (brand, name, unit, old, price) in rows.items():
        brand, name = brand.strip(), name.strip()
        # Productos sin marca (fruta, carne al peso): la primera línea es el nombre.
        if '€' in name:
            name, brand = brand, ''
        # Etiquetas delante de la marca ("Ecológico", nota "8.7", "Nº 1", "Al peso", "500 Gr")
        elif re.fullmatch(r'Ecol[oó]gico|Novedad|N[ºo] ?\d+|Al peso|\d+([.,]\d+)?( ?(Gr|Kg|ml|L|U))?|Sin gluten|Sin lactosa|Vegano', brand, re.I):
            if name.isupper():
                skipped += 1
                continue  # el nombre no se leyó bien: mejor no inventarlo
            brand = ''
        if not brand or '€' in brand:
            brand = ''
        p = num(price)
        o = num(old)
        if not p or p <= 0 or p > 600:
            continue
        if o is not None and not (p < o <= 3 * p):
            o = None
        name = re.sub(r'\s+', ' ', name).strip()
        if len(re.sub(r'[^A-Za-zÁÉÍÓÚÑáéíóúñ]', '', name)) < 3:
            skipped += 1
            continue  # nombre sin letras (una nota o un número): no es un producto legible
        m = SIZE.search(name)
        fmt = m.group(1).strip() if m else None
        base = name[: m.start()].strip() if m else name
        b = brand_case(brand.strip()) if brand and brand.strip() else None
        full = f'{base} {b}' if b and norm(b) not in norm(base) else base
        n_full = norm(full)
        c = fixed
        if c is None or c in ('Despensa', 'Limpieza'):
            for cc, rx in RULES:
                if re.search(rx, n_full):
                    if fixed is None or (fixed == 'Limpieza' and cc in ('Lavandería', 'Limpieza')) or (fixed == 'Despensa' and cc in ('Lácteos y huevos', 'Bebidas', 'Panadería y desayuno', 'Carne y pescado', 'Bebé', 'Mascotas')):
                        c = cc
                    break
            c = c or fixed or 'Otros'
        key = norm(full) + '|' + norm(fmt or '')
        key_of_row[row_key] = 'cs-' + hashlib.sha1(key.encode()).hexdigest()[:10]
        if key in out:
            continue
        u = 'ud'
        out[key] = {
            'id': 'cs-' + hashlib.sha1(key.encode()).hexdigest()[:10],
            'n': full, 'b': b, 'f': fmt, 'p': p, 'o': o, 'u': u, 'c': c, 's': section,
        }

items = sorted(out.values(), key=lambda x: (x['c'], x['n']))
json.dump({'store': 'consum', 'capturedAt': date, 'source': 'Web pública de Consum (tienda.consum.es), páginas de categoría', 'items': items},
          open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(items), 'productos;', skipped, 'descartados por nombre ilegible', Counter(i['c'] for i in items))

# Mapa «MARCA|Nombre» (como en la web) → id del catálogo, para enlazar las fotos (consum_images.py).
json.dump(key_of_row, open(sys.argv[2].replace('.json', '.rowids.json'), 'w'), ensure_ascii=False)
