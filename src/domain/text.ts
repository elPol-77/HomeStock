/** Utilidades de texto puras (sin dependencias de React Native). */

/** Minúsculas, sin tildes, sin signos; espacios simples. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'en', 'para', 'sin', 'al', 'a']);

export function tokenize(input: string | null | undefined): string[] {
  return normalizeText(input)
    .replace(/[.,]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

/** Similitud 0..1 entre dos textos (Dice sobre tokens, tolerante a orden). */
export function textSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let common = 0;
  const seen = new Set<string>();
  for (const t of ta) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (setB.has(t)) common++;
    else if (t.length >= 4 && tb.some((x) => x.length >= 4 && (x.startsWith(t) || t.startsWith(x)))) common += 0.7;
  }
  const uniqueA = new Set(ta).size;
  const uniqueB = setB.size;
  return Math.min(1, (2 * common) / (uniqueA + uniqueB));
}

/** Convierte "1,25" o "1.25" en número. Devuelve NaN si no es válido. */
export function parseDecimal(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, '').replace('€', '');
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return Number(cleaned.replace(',', '.'));
}

export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Pone en mayúscula la primera letra y el resto en minúscula (para nombres de tickets en MAYÚSCULAS). */
export function sentenceCase(s: string): string {
  const lower = s.toLowerCase();
  return capitalize(lower);
}

export function formatEuro(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2).replace('.', ',')} €`;
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : plural ?? `${singular}s`;
}
