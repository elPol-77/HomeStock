import { normalizeText } from '@/domain/text';

import type { Location } from './types';

const RULES: [RegExp, RegExp][] = [
  [/congelad/, /congel/],
  [/lacteos|carne|pescado|frutas|verdur/, /nevera|frigo|refri/],
  [/limpieza|lavanderia/, /limpieza|lavadero|armario/],
  [/higiene/, /bano|aseo/],
];

/** Propone una ubicación razonable según la categoría (el usuario siempre puede cambiarla). */
export function guessLocation(category: string | null | undefined, locations: Location[], fallback?: string | null): string | null {
  if (fallback) return fallback;
  const c = normalizeText(category ?? '');
  for (const [cat, loc] of RULES) {
    if (cat.test(c)) {
      const found = locations.find((l) => loc.test(normalizeText(l.name)));
      if (found) return found.id;
    }
  }
  return locations.find((l) => /despensa/.test(normalizeText(l.name)))?.id ?? locations[0]?.id ?? null;
}
