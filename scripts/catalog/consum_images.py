"""Enlaza las fotos de la web de Consum con el catálogo y las incluye en la app como miniaturas WebP.

Entrada: la lista de códigos de producto de Consum (base 36, separados por comas) en el mismo orden que las
filas del archivo de captura original (categorías y productos tal cual), emparejada en el navegador con lo
recogido en las páginas de categoría de tienda.consum.es. Vacío = sin foto encontrada.
La foto pública es https://cdn-consum.aktiosdigitalservices.com/tol/consum/media/product/img/300x300/<código>_001.jpg

Uso: python3 scripts/catalog/consum_images.py codigos.txt consum-catalogo.json
"""
import io
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from PIL import Image

OUT = 'assets/catalog/img'
SIZE = 160
CDN = 'https://cdn-consum.aktiosdigitalservices.com/tol/consum/media/product/img/300x300/{}_001.jpg'
UA = 'HomeStock/1.5 (app personal de inventario; pablobenlloch.es)'


def b36(s: str) -> int:
    return int(s, 36)


def fetch(pid, code):
    out = os.path.join(OUT, pid.replace('-', '_', 1) + '.webp')
    if os.path.exists(out):
        return pid, 'ya estaba'
    err = ''
    for attempt in range(3):
        try:
            req = urllib.request.Request(CDN.format(code), headers={'User-Agent': UA})
            data = urllib.request.urlopen(req, timeout=30).read()
            im = Image.open(io.BytesIO(data)).convert('RGB')
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            im.save(out, 'WEBP', quality=62, method=6)
            return pid, 'ok'
        except Exception as e:  # noqa: BLE001
            err = str(e)
            time.sleep(1 + attempt * 2)
    return pid, f'error: {err[:80]}'


if __name__ == '__main__':
    codes = open(sys.argv[1]).read().strip().split(',')
    src = json.load(open(sys.argv[2]))['categories']
    rows = [k for cat in src.values() for k in cat.keys()]
    assert len(rows) == len(codes), (len(rows), len(codes))
    rowids = json.load(open('scripts/catalog/data/consum.rowids.json'))
    ids = {x['id'] for x in json.load(open('assets/catalog/consum.json'))['items']}
    code_of = {}
    for row_key, c in zip(rows, codes):
        pid = rowids.get(row_key)
        if c.strip() and pid in ids and pid not in code_of:
            code_of[pid] = b36(c.strip())
    print(f'{len(code_of)} de {len(ids)} productos de Consum con foto de su web')
    # Las fotos de la web de Consum sustituyen a las de Open Food Facts (son las del producto exacto).
    if '--keep' not in sys.argv:
        for pid in code_of:
            p = os.path.join(OUT, pid.replace('-', '_', 1) + '.webp')
            if os.path.exists(p):
                os.remove(p)
    done = errors = 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        futs = [ex.submit(fetch, pid, code) for pid, code in code_of.items()]
        for fu in as_completed(futs):
            pid, st = fu.result()
            done += 1
            if st.startswith('error'):
                errors += 1
                if errors < 20:
                    print(pid, st, flush=True)
            if done % 500 == 0:
                print(f'{done}/{len(code_of)} ({errors} errores)', flush=True)
    print('fin', done, 'errores', errors)
