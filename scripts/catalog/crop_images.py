"""Recorta la foto de cada producto de las capturas (zona cuadrada sobre el nombre de la tarjeta)."""
import json, os, sys
from PIL import Image
import numpy as np

cards = json.load(open(sys.argv[1]))
src_dir, out_dir, size = sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 160
os.makedirs(out_dir, exist_ok=True)
cache = {}
ok = bad = 0
for iid, c in cards.items():
    if not c.get('pitch'):
        bad += 1; continue
    im = cache.get(c['file'])
    if im is None:
        im = Image.open(os.path.join(src_dir, c['file'])).convert('RGB'); cache.clear(); cache[c['file']] = im
    p = c['pitch']
    w = 0.895 * p
    bottom = c['top'] - 0.07 * p
    left = c['x'] - 0.02 * p
    box = [left, bottom - w, left + w, bottom]
    # Ajuste fino: el recuadro de la foto es gris muy claro sobre página blanca.
    pad = 0.08 * p
    region = [max(0, int(box[0] - pad)), max(0, int(box[1] - pad)), min(im.width, int(box[2] + pad)), min(im.height, int(box[3] + pad))]
    a = np.asarray(im.crop(region)).astype(int)
    nonwhite = (np.abs(a - 255).sum(axis=2) > 6)
    rows = np.where(nonwhite.mean(axis=1) > 0.5)[0]
    cols = np.where(nonwhite.mean(axis=0) > 0.5)[0]
    if len(rows) > 0.6 * w and len(cols) > 0.6 * w:
        box = [region[0] + cols[0], region[1] + rows[0], region[0] + cols[-1] + 1, region[1] + rows[-1] + 1]
    if box[1] < 0 or box[3] - box[1] < 0.5 * w:
        bad += 1; continue
    crop = im.crop(tuple(int(v) for v in box))
    if crop.width < 40 or crop.height < 40 or abs(crop.width - crop.height) > 0.25 * crop.width:
        bad += 1; continue
    # Tarjeta cortada por arriba de la captura: la foto no está completa.
    if c['top'] - 1.0 * p < 0:
        bad += 1; continue
    crop.thumbnail((size, size), Image.LANCZOS)
    crop.save(os.path.join(out_dir, iid.replace('-', '_') + '.webp'), 'WEBP', quality=72, method=6)
    ok += 1
print(f'{ok} recortadas, {bad} descartadas')
