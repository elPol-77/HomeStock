"""Descarga las fotos de Open Food Facts (licencia CC BY-SA) que usan los catálogos de Consum y DIA,
las reduce a miniaturas WebP y las guarda en assets/catalog/img/ para que salgan al instante en la app
(el servidor de imágenes de OFF tarda varios segundos por foto).

Uso: python3 scripts/catalog/bundle_off_images.py   (después: python3 scripts/catalog/gen_images.py)
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
SIZE = 192  # px del lado mayor (las miniaturas de la app miden 40-72 dp)
UA = 'HomeStock/1.5 (app personal de inventario; contacto: pablobenlloch.es)'


def todo():
    for f in ['consum', 'dia']:
        items = json.load(open(f'assets/catalog/{f}.json'))['items']
        for x in items:
            if x.get('i'):
                yield x['id'], x['i']


def fetch(pid, url):
    out = os.path.join(OUT, pid.replace('-', '_', 1) + '.webp')
    if os.path.exists(out):
        return pid, 'ya estaba'
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            data = urllib.request.urlopen(req, timeout=40).read()
            im = Image.open(io.BytesIO(data)).convert('RGBA')
            bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
            im = Image.alpha_composite(bg, im).convert('RGB')
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            im.save(out, 'WEBP', quality=68, method=6)
            return pid, 'ok'
        except Exception as e:  # noqa: BLE001
            err = str(e)
            time.sleep(2 + attempt * 3)
    return pid, f'error: {err[:80]}'


if __name__ == '__main__':
    jobs = list(todo())
    print(len(jobs), 'fotos')
    done = errors = 0
    with ThreadPoolExecutor(max_workers=int(sys.argv[1]) if len(sys.argv) > 1 else 12) as ex:
        futs = [ex.submit(fetch, pid, url) for pid, url in jobs]
        for fu in as_completed(futs):
            pid, st = fu.result()
            done += 1
            if st.startswith('error'):
                errors += 1
                print(pid, st, flush=True)
            if done % 100 == 0:
                print(f'{done}/{len(jobs)} ({errors} errores)', flush=True)
    print('fin', done, 'errores', errors)
