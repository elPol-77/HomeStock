import csv, sys, json
csv.field_size_limit(10**9)
r = csv.reader(sys.stdin, delimiter='\t')
h = next(r); ix = {k: i for i, k in enumerate(h)}
need = ['code','product_name','product_name_es','brands','quantity','countries_tags','image_url','image_small_url','stores']
for k in need:
    if k not in ix: print('missing', k, file=sys.stderr)
n = 0
out = open(sys.argv[1], 'w')
for row in r:
    try:
        if 'spain' not in row[ix['countries_tags']]: continue
        img = row[ix['image_small_url']] or row[ix['image_url']]
        if not img: continue
        name = (row[ix['product_name_es']] if 'product_name_es' in ix else '') or row[ix['product_name']]
        if not name: continue
        out.write(json.dumps({'c': row[ix['code']], 'n': name, 'b': row[ix['brands']], 'q': row[ix['quantity']], 'i': img, 's': row[ix['stores']] if 'stores' in ix else ''}, ensure_ascii=False) + '\n')
        n += 1
    except IndexError:
        pass
print('es products with image:', n, file=sys.stderr)
