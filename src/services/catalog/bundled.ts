import { daysBetween, todayISO } from '@/domain/dates';
import { compareProducts, stripSize } from '@/domain/matching';
import { normalizeText, tokenize } from '@/domain/text';
import { PackageSize, parsePackageSize } from '@/domain/units';

import type { CatalogProduct } from './types';

/**
 * Catálogos de supermercado incluidos en la app (sin red).
 * Se generan con `tools/build_catalog.py` a partir de capturas de la web pública de cada cadena:
 * nombre, formato y precio tal y como aparecían ese día (sin imágenes de la cadena).
 * Cada precio lleva su fecha; la app nunca lo presenta como precio "de hoy" si no lo es.
 */
interface RawItem {
  id: string;
  /** Nombre visible (con marca). */
  n: string;
  b: string | null;
  /** Formato tal cual: "Bote 200 g", "6 botellas x 1,5 L"… */
  f: string | null;
  /** Precio mostrado. */
  p: number;
  /** Precio anterior tachado (oferta). */
  o: number | null;
  /** A qué se refiere el precio. */
  u: 'ud' | 'pack' | 'kg' | 'l';
  /** Categoría de HomeStock. */
  c: string;
  /** Sección de la tienda. */
  s: string | null;
}

interface RawCatalog {
  store: string;
  capturedAt: string;
  source: string;
  items: RawItem[];
}

// Para añadir una cadena: deja su JSON en assets/catalog/ y añádelo aquí.
const CATALOGS: RawCatalog[] = [
  require('../../../assets/catalog/mercadona.json') as RawCatalog,
  require('../../../assets/catalog/dia.json') as RawCatalog,
  // CATALOG_SLOT (no borrar: lo usa scripts/catalog para registrar catálogos)
];

export interface BundledItem {
  id: string;
  store: string;
  name: string;
  brand: string | null;
  format: string | null;
  pkg: PackageSize | null;
  price: number;
  regularPrice: number | null;
  isOffer: boolean;
  priceUnit: RawItem['u'];
  category: string;
  section: string | null;
  capturedAt: string;
  sourceNote: string;
  tokens: string[];
  norm: string;
}

let index: BundledItem[] | null = null;

export function bundledItems(): BundledItem[] {
  if (index) return index;
  index = [];
  for (const cat of CATALOGS) {
    for (const r of cat.items) {
      const pkg = parsePackageSize(r.f) ?? parsePackageSize(r.n);
      index.push({
        id: r.id,
        store: cat.store,
        name: r.n,
        brand: r.b,
        format: r.f,
        pkg,
        price: r.p,
        regularPrice: r.o,
        isOffer: r.o != null && r.o > r.p,
        priceUnit: r.u,
        category: r.c,
        section: r.s,
        capturedAt: cat.capturedAt,
        sourceNote: cat.source,
        tokens: tokenize(`${r.n} ${r.s ?? ''}`),
        norm: normalizeText(`${r.n} ${r.f ?? ''}`),
      });
    }
  }
  return index;
}

export function bundledCatalogInfo() {
  return CATALOGS.map((c) => ({ store: c.store, capturedAt: c.capturedAt, count: c.items.length, source: c.source, ageDays: daysBetween(c.capturedAt, todayISO()) }));
}

function scoreItem(item: BundledItem, q: string[]): number {
  let hits = 0;
  for (const t of q) {
    if (item.tokens.includes(t)) hits += 1;
    else if (item.tokens.some((x) => x.startsWith(t) || (t.length >= 5 && t.startsWith(x) && x.length >= 4))) hits += 0.8;
    else return 0; // todas las palabras deben aparecer
  }
  // Nombres más cortos (más específicos) primero; la palabra al inicio del nombre puntúa más.
  const first = item.tokens[0]?.startsWith(q[0]) ? 0.3 : 0;
  return hits / q.length + first - Math.min(item.tokens.length, 12) * 0.01;
}

/** Busca en los catálogos incluidos. Instantáneo y sin conexión. */
export function searchBundled(query: string, limit = 20): BundledItem[] {
  const q = tokenize(query);
  if (q.length === 0) return [];
  const scored: { item: BundledItem; score: number }[] = [];
  for (const item of bundledItems()) {
    const score = scoreItem(item, q);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.price - b.item.price);
  return scored.slice(0, limit).map((s) => s.item);
}

export function bundledById(id: string): BundledItem | undefined {
  return bundledItems().find((i) => i.id === id);
}

/** Precio del envase completo, si se puede saber (los productos al peso vienen en €/kg). */
export function packagePrice(item: BundledItem): number | null {
  if (item.priceUnit !== 'kg' && item.priceUnit !== 'l') return item.price;
  if (!item.pkg) return null;
  const total = item.pkg.count * item.pkg.amount;
  if (item.priceUnit === 'kg' && (item.pkg.unit === 'g' || item.pkg.unit === 'kg')) return Math.round(item.price * (item.pkg.unit === 'g' ? total / 1000 : total) * 100) / 100;
  if (item.priceUnit === 'l' && (item.pkg.unit === 'ml' || item.pkg.unit === 'cl' || item.pkg.unit === 'l')) {
    const liters = item.pkg.unit === 'ml' ? total / 1000 : item.pkg.unit === 'cl' ? total / 100 : total;
    return Math.round(item.price * liters * 100) / 100;
  }
  return null;
}

export function priceUnitLabel(item: BundledItem): string {
  return { ud: '/ud.', pack: '/pack', kg: '/kg', l: '/L' }[item.priceUnit];
}

export function bundledToCatalogProduct(item: BundledItem): CatalogProduct {
  return {
    source: 'store',
    barcode: null,
    name: item.name,
    brand: item.brand,
    imageUrl: null,
    quantityText: item.format,
    pkg: item.pkg,
    category: item.category,
    packaging: item.format?.split(' ')[0]?.toLowerCase() ?? null,
    url: null,
    bundledId: item.id,
    storePrice: { store: item.store, price: item.price, regularPrice: item.regularPrice, unitLabel: priceUnitLabel(item), date: item.capturedAt },
  };
}

export interface BundledMatch {
  item: BundledItem;
  kind: 'identical' | 'alternative';
  score: number;
  reason: string;
}

/**
 * Productos del catálogo incluido que corresponden a uno dado: idénticos (mismo nombre, marca y tamaño)
 * y alternativas comparables por precio unitario. Nunca se marca como idéntico algo dudoso.
 */
export function matchBundled(target: { name: string; brand?: string | null; barcode?: string | null; pkg?: PackageSize | null; bundledId?: string | null }, maxAlternatives = 4): BundledMatch[] {
  const out: BundledMatch[] = [];
  const own = target.bundledId ? bundledById(target.bundledId) : undefined;
  if (own) out.push({ item: own, kind: 'identical', score: 1, reason: 'Mismo producto del catálogo' });
  const tTokens = tokenize(stripSize(target.name)).filter((t) => t.length >= 3);
  if (tTokens.length === 0) return out;
  const alts: BundledMatch[] = [];
  for (const item of bundledItems()) {
    if (item === own) continue;
    if (!tTokens.some((t) => item.tokens.some((x) => x === t || (t.length >= 4 && x.startsWith(t))))) continue;
    const r = compareProducts({ name: target.name, brand: target.brand, barcode: target.barcode, packageSize: target.pkg ?? null }, { name: item.name, brand: item.brand, packageSize: item.pkg });
    if (r.kind === 'identical' && !own) out.push({ item, kind: 'identical', score: r.score, reason: r.reason });
    else if (r.kind !== 'different' && r.score >= 0.6) alts.push({ item, kind: 'alternative', score: r.score, reason: r.reason });
  }
  alts.sort((a, b) => b.score - a.score);
  return [...out, ...alts.slice(0, maxAlternatives)];
}
