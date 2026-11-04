import { normalizeText, textSimilarity } from './text';
import { PackageSize, parsePackageSize, samePackageSize } from './units';

export interface ProductLike {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  packageSize?: PackageSize | null;
}

/**
 * - identical: mismo producto (mismo código de barras, o misma marca + tamaño + nombre casi igual).
 * - alternative: producto comparable pero distinto (otra marca o distinto tamaño). Se compara por precio unitario.
 * - different: no son comparables.
 */
export type MatchKind = 'identical' | 'alternative' | 'different';

export interface MatchResult {
  kind: MatchKind;
  score: number;
  reason: string;
}

function brandOf(p: ProductLike): string {
  return normalizeText(p.brand ?? '');
}

export function compareProducts(a: ProductLike, b: ProductLike): MatchResult {
  if (a.barcode && b.barcode) {
    if (a.barcode === b.barcode) return { kind: 'identical', score: 1, reason: 'Mismo código de barras' };
  }
  const sizeA = a.packageSize ?? parsePackageSize(a.name);
  const sizeB = b.packageSize ?? parsePackageSize(b.name);
  const sameSize = samePackageSize(sizeA, sizeB);
  const nameSim = textSimilarity(stripSize(a.name), stripSize(b.name));
  const ba = brandOf(a);
  const bb = brandOf(b);
  const sameBrand = ba !== '' && bb !== '' && (ba === bb || ba.includes(bb) || bb.includes(ba));

  if (nameSim < 0.45) return { kind: 'different', score: nameSim, reason: 'Nombres distintos' };
  if (sameBrand && sameSize === true && nameSim >= 0.75 && !(a.barcode && b.barcode)) {
    return { kind: 'identical', score: nameSim, reason: 'Misma marca, nombre y tamaño' };
  }
  if (sameSize === false) return { kind: 'alternative', score: nameSim, reason: 'Distinto tamaño de envase' };
  if (!sameBrand && ba && bb) return { kind: 'alternative', score: nameSim, reason: 'Distinta marca' };
  if (a.barcode && b.barcode) return { kind: 'alternative', score: nameSim, reason: 'Distinto código de barras' };
  return { kind: 'alternative', score: nameSim, reason: 'Producto similar, sin confirmar que sea el mismo' };
}

export function stripSize(name: string): string {
  return name.replace(/\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?\s*)?(kg|g|gr|ml|cl|l|lt|ud|uds|rollos|lavados)\b/gi, ' ').trim();
}

/** Busca en una lista el producto existente que corresponde a uno nuevo (para no duplicar). */
export function findExistingProduct<T extends ProductLike & { id: string }>(
  candidate: ProductLike,
  existing: T[],
): T | null {
  if (candidate.barcode) {
    const byCode = existing.find((p) => p.barcode === candidate.barcode);
    if (byCode) return byCode;
  }
  let best: { p: T; score: number } | null = null;
  for (const p of existing) {
    const r = compareProducts(candidate, p);
    if (r.kind === 'identical' && (!best || r.score > best.score)) best = { p, score: r.score };
    // Sin marca ni tamaño (p. ej. "Leche" en una lista), basta un nombre muy parecido.
    if (r.kind !== 'different' && !candidate.brand && !candidate.packageSize && r.score >= 0.9 && (!best || r.score > best.score)) {
      best = { p, score: r.score };
    }
  }
  return best?.p ?? null;
}
