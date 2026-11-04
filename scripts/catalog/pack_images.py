"""Empaqueta las miniaturas de un catálogo grande en un único archivo (assets/catalog/pack/<tienda>.imgpack).

Metro (el empaquetador de la app) no aguanta miles de imágenes sueltas: con ~12.700 se queda sin memoria.
Así que las fotos de Consum van juntas en un archivo binario + un índice JSON {id: [inicio, longitud]};
la app las extrae a su carpeta de documentos la primera vez que se abre (src/services/catalog/imagePack.ts).

Uso: python3 scripts/catalog/pack_images.py consum cs   (toma assets/catalog/img/cs_*.webp o, si ya se
movieron, scripts/catalog/data/img_cs/*.webp)
"""
import glob
import hashlib
import json
import os
import shutil
import sys

store, prefix = sys.argv[1], sys.argv[2]
src_dir = f'scripts/catalog/data/img_{prefix}'
os.makedirs(src_dir, exist_ok=True)
# Las sueltas salen de assets/catalog/img (para que Metro no las procese) y se guardan como fuente.
for f in glob.glob(f'assets/catalog/img/{prefix}_*.webp'):
    shutil.move(f, os.path.join(src_dir, os.path.basename(f)))

files = sorted(glob.glob(os.path.join(src_dir, '*.webp')))
os.makedirs('assets/catalog/pack', exist_ok=True)
index = {}
h = hashlib.sha1()
with open(f'assets/catalog/pack/{store}.imgpack', 'wb') as out:
    off = 0
    for f in files:
        data = open(f, 'rb').read()
        pid = os.path.basename(f)[:-5].replace('_', '-', 1)
        index[pid] = [off, len(data)]
        out.write(data)
        h.update(data)
        off += len(data)
json.dump({'v': h.hexdigest()[:12], 'items': index}, open(f'assets/catalog/pack/{store}.imgpack.json', 'w'), separators=(',', ':'))
print(store, len(index), 'fotos,', off // 1024, 'KB, versión', h.hexdigest()[:12])
