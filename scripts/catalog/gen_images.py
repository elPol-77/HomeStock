"""Genera src/services/catalog/bundledImages.ts a partir de assets/catalog/img/*.webp."""
import os
files = sorted(f for f in os.listdir('assets/catalog/img') if f.endswith('.webp'))
lines = ["/* Generado por scripts/catalog/gen_images.py — no editar a mano. */", "/* Fotos recortadas de las capturas aportadas por el usuario, para identificar el producto en la app. */", "/* eslint-disable @typescript-eslint/no-require-imports */", "export const BUNDLED_IMAGES: Record<string, number> = {"]
for f in files:
    lines.append(f"  '{f[:-5].replace('_', '-', 1)}': require('../../../assets/catalog/img/{f}'),")
lines.append("};\n")
open('src/services/catalog/bundledImages.ts', 'w').write('\n'.join(lines))
print(len(files), 'fotos')
