import { suggestZone } from '@/domain/categorize';

import type { Location } from './types';

/** Propone una ubicación razonable según la categoría y el nombre (el usuario siempre puede cambiarla). */
export function guessLocation(category: string | null | undefined, locations: Location[], fallback?: string | null, name?: string | null): string | null {
  if (fallback) return fallback;
  return suggestZone({ name, category }, locations)?.id ?? null;
}
