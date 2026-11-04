import { daysBetween, todayISO } from '@/domain/dates';
import { EQUIVALENT_THRESHOLD, isOwnLabel, productType, ProductType, typeSimilarity } from '@/domain/equivalence';
import { compareProducts } from '@/domain/matching';
import { normalizeText, tokenize } from '@/domain/text';
import { PackageSize, parsePackageSize, samePackageSize, unitPrice } from '@/domain/units';

import { BUNDLED_IMAGES } from './bundledImages';
import { packHas } from './imagePack';
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
  /** Foto de Open Food Facts emparejada (CC BY-SA), si la hay. */
  i?: string | null;
  /** Código de barras de Open Food Facts, solo si el emparejamiento es seguro. */
  e?: string | null;
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
  require('../../../assets/catalog/consum.json') as RawCatalog,
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
  imageUrl: string | null;
  barcode: string | null;
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
        imageUrl: BUNDLED_IMAGES[r.id] || packHas(r.id) ? `bundled:${r.id}` : (r.i ?? null),
        barcode: r.e ?? null,
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
    barcode: item.barcode,
    name: item.name,
    brand: item.brand,
    imageUrl: item.imageUrl,
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
  /** Marca propia de la cadena (Hacendado, Consum, Dia…). */
  ownLabel?: boolean;
  /** Mismo producto (misma marca) pero en otro tamaño. */
  otherSize?: boolean;
}

const typeCache = new Map<string, ProductType>();
function typeOf(item: BundledItem): ProductType {
  let t = typeCache.get(item.id);
  if (!t) {
    t = productType(item.name, item.brand);
    typeCache.set(item.id, t);
  }
  return t;
}

const normBrand = (b: string | null | undefined) => normalizeText(b ?? '').replace(/[\s.-]/g, '');

/** Precio por kg/L/ud del envase, para ordenar alternativas de distinto tamaño. */
export function bundledUnitPrice(item: BundledItem): number | null {
  const total = packagePrice(item);
  return total != null ? (unitPrice(total, item.pkg)?.value ?? null) : null;
}

/**
 * Lo que puedes comprar en lugar de un producto, en todos los súper del catálogo:
 *  - idéntico: misma marca, mismo producto y mismo tamaño (la Coca-Cola Zero 2 L en Consum y en DIA);
 *  - alternativas: el mismo TIPO de producto de otra marca (Pepsi Zero, la cola zero de marca blanca)
 *    o de la misma marca en otro tamaño, siempre con los mismos atributos (zero, sin lactosa, sabor…).
 * Las alternativas se ordenan por precio por litro/kg/unidad, que es lo que permite comparar de verdad.
 */
export function matchBundled(
  target: { name: string; brand?: string | null; barcode?: string | null; pkg?: PackageSize | null; bundledId?: string | null; category?: string | null },
  maxAlternatives = 4,
): BundledMatch[] {
  const out: BundledMatch[] = [];
  const own = target.bundledId ? bundledById(target.bundledId) : undefined;
  if (own) out.push({ item: own, kind: 'identical', score: 1, reason: 'Mismo producto del catálogo' });
  const brand = target.brand ?? own?.brand ?? null;
  const tType = own ? typeOf(own) : productType(target.name, brand);
  const category = target.category ?? own?.category ?? null;
  const tBrand = normBrand(brand);
  const pkg = target.pkg ?? own?.pkg ?? null;
  if (tType.words.length === 0) return out;

  const identical: BundledMatch[] = [];
  const alts: (BundledMatch & { unit: number | null })[] = [];
  for (const item of bundledItems()) {
    if (item === own) continue;
    if (category && item.category !== category) continue;
    if (target.barcode && item.barcode === target.barcode) {
      identical.push({ item, kind: 'identical', score: 1, reason: 'Mismo código de barras' });
      continue;
    }
    const sim = typeSimilarity(tType, typeOf(item));
    if (sim < EQUIVALENT_THRESHOLD) continue;
    const sameBrand = tBrand !== '' && normBrand(item.brand) === tBrand;
    const sameSize = samePackageSize(pkg, item.pkg);
    if (sameBrand && sameSize === true && sim >= 0.85) {
      identical.push({ item, kind: 'identical', score: sim, reason: 'Misma marca, producto y tamaño' });
      continue;
    }
    // Comprobación clásica por nombre para productos sin tipo claro (p. ej. sin marca en el nombre).
    if (!sameBrand && compareProducts({ name: target.name, brand, packageSize: pkg }, { name: item.name, brand: item.brand, packageSize: item.pkg }).kind === 'identical') {
      identical.push({ item, kind: 'identical', score: sim, reason: 'Mismo nombre, marca y tamaño' });
      continue;
    }
    const ownLabel = isOwnLabel(item.brand);
    alts.push({
      item,
      kind: 'alternative',
      score: sim,
      ownLabel,
      otherSize: sameBrand,
      unit: bundledUnitPrice(item),
      reason: sameBrand ? 'Mismo producto en otro tamaño' : ownLabel ? `Marca blanca${item.brand ? ` (${item.brand})` : ''}` : `Otra marca${item.brand ? `: ${item.brand}` : ''}`,
    });
  }
  // Un resultado por tienda y marca (el de mejor precio por litro/kg), del más barato al más caro.
  const best = new Map<string, BundledMatch & { unit: number | null }>();
  for (const a of alts) {
    const k = `${a.item.store}|${normBrand(a.item.brand)}|${a.otherSize ? 's' : 'o'}`;
    const prev = best.get(k);
    if (!prev || (a.unit ?? Infinity) < (prev.unit ?? Infinity)) best.set(k, a);
  }
  const altList = [...best.values()].sort((a, b) => (a.unit ?? Infinity) - (b.unit ?? Infinity) || b.score - a.score);
  // Idénticos: uno por tienda.
  const seenStore = new Set(out.map((o) => o.item.store));
  for (const i of identical.sort((a, b) => b.score - a.score)) {
    if (seenStore.has(i.item.store)) continue;
    seenStore.add(i.item.store);
    out.push(i);
  }
  return [...out, ...altList.slice(0, maxAlternatives)];
}

/** Busca un código de barras en los catálogos incluidos (solo existe si el emparejamiento con Open Food Facts fue seguro). */
export function bundledByBarcode(code: string): BundledItem | undefined {
  return bundledItems().find((i) => i.barcode === code);
}
