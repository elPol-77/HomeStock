import Constants from 'expo-constants';

import { first, nowIso, run } from '@/db/client';
import { normalizeText } from '@/domain/text';
import { parsePackageSize, toUnit } from '@/domain/units';

import { CatalogProduct, CatalogSource } from './types';

/**
 * Open Food Facts (y sus bases hermanas) — datos abiertos bajo licencia ODbL.
 * Normas de uso: User-Agent propio, no buscar en cada pulsación, cachear resultados.
 * https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/
 */
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const CONTACT = process.env.EXPO_PUBLIC_OFF_CONTACT ?? 'homestock-app';
export const OFF_USER_AGENT = `HomeStock/${APP_VERSION} (${CONTACT})`;

const DATABASES: { source: CatalogSource; host: string }[] = [
  { source: 'off', host: 'https://world.openfoodfacts.org' },
  { source: 'opf', host: 'https://world.openproductsfacts.org' },
  { source: 'obf', host: 'https://world.openbeautyfacts.org' },
  { source: 'opff', host: 'https://world.openpetfoodfacts.org' },
];

const FIELDS = 'code,product_name,product_name_es,generic_name_es,brands,quantity,product_quantity,product_quantity_unit,image_front_url,image_front_small_url,categories_tags,packaging';
const CACHE_DAYS = 30;

async function fetchJson(url: string, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function cacheGet<T>(key: string): Promise<T | null | undefined> {
  const row = await first<{ json: string; fetched_at: string }>('SELECT json, fetched_at FROM catalog_cache WHERE key = ?', [key]);
  if (!row) return undefined;
  const age = (Date.now() - new Date(row.fetched_at).getTime()) / 86400000;
  if (age > CACHE_DAYS) return undefined;
  return JSON.parse(row.json) as T | null;
}

async function cacheSet(key: string, value: unknown) {
  await run('INSERT OR REPLACE INTO catalog_cache (key, json, fetched_at) VALUES (?, ?, ?)', [key, JSON.stringify(value), nowIso()]);
}

/** Traduce las categorías de Open Food Facts a las categorías de la app. */
export function mapCategory(tags: string[] | undefined, source: CatalogSource): string | null {
  if (source === 'obf') return 'Higiene personal';
  if (source === 'opff') return 'Mascotas';
  const t = (tags ?? []).join(' ');
  if (source === 'opf') {
    if (/laundry|detergent|lessive|fabric-softener/.test(t)) return 'Lavandería';
    if (/clean|dish|bleach|household/.test(t)) return 'Limpieza';
    if (/toilet-paper|tissue|hygiene/.test(t)) return 'Higiene personal';
    return 'Otros';
  }
  if (/frozen/.test(t)) return 'Congelados';
  if (/dairies|milks|yogurts|cheeses|eggs|butters/.test(t)) return 'Lácteos y huevos';
  if (/fresh-fruits|fresh-vegetables|fruits-based|vegetables-based|^en:fruits|en:vegetables/.test(t) && !/juices|canned/.test(t)) return 'Frutas y verduras';
  if (/meats|fishes|seafood|hams|sausages|poultries/.test(t)) return 'Carne y pescado';
  if (/beverages|waters|sodas|juices|beers|wines/.test(t)) return 'Bebidas';
  if (/breads|breakfast|cereals-and-their-products|biscuits|coffees|teas|cocoa|pastries/.test(t)) return 'Panadería y desayuno';
  if (/pet-food|cat-food|dog-food/.test(t)) return 'Mascotas';
  if (tags && tags.length) return 'Despensa';
  return null;
}

function toCatalogProduct(p: any, source: CatalogSource, host: string): CatalogProduct | null {
  const name: string = (p.product_name_es || p.product_name || p.generic_name_es || '').trim();
  if (!name) return null;
  const brand = typeof p.brands === 'string' ? p.brands.split(',')[0].trim() : Array.isArray(p.brands) ? p.brands[0] : null;
  let pkg = parsePackageSize(p.quantity);
  if (!pkg && p.product_quantity && p.product_quantity_unit) {
    const unit = toUnit(String(p.product_quantity_unit));
    if (unit) pkg = { count: 1, amount: Number(p.product_quantity), unit };
  }
  return {
    source,
    barcode: p.code ?? null,
    name,
    brand: brand && normalizeText(brand) !== normalizeText(name) ? prettyBrand(brand) : brand ? prettyBrand(brand) : null,
    imageUrl: p.image_front_url ?? p.image_front_small_url ?? null,
    quantityText: p.quantity ?? null,
    pkg,
    category: mapCategory(p.categories_tags, source),
    packaging: typeof p.packaging === 'string' ? p.packaging.split(',')[0].trim() || null : null,
    url: p.code ? `${host}/product/${p.code}` : null,
  };
}

function prettyBrand(b: string): string {
  // "MERCADONA" / "hacendado" → "Mercadona" / "Hacendado"
  if (b === b.toUpperCase() || b === b.toLowerCase()) return b.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_m, s: string, c: string) => s + c.toUpperCase());
  return b;
}

/** Busca un código de barras en todas las bases abiertas (alimentación, droguería, belleza y mascotas). */
export async function lookupBarcode(code: string): Promise<CatalogProduct | null> {
  const key = `barcode:${code}`;
  const cached = await cacheGet<CatalogProduct | null>(key);
  if (cached !== undefined) return cached;
  let lastError: unknown = null;
  for (const db of DATABASES) {
    try {
      const json = await fetchJson(`${db.host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}&lc=es`);
      if (json && json.status === 1 && json.product) {
        const product = toCatalogProduct({ code, ...json.product }, db.source, db.host);
        if (product) {
          await cacheSet(key, product);
          return product;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  await cacheSet(key, null);
  return null;
}

/** Búsqueda por texto (Search-a-licious de Open Food Facts). Llamar al confirmar la búsqueda, no en cada tecla. */
export async function searchCatalog(query: string, pageSize = 20): Promise<CatalogProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = `search:${normalizeText(q)}`;
  const cached = await cacheGet<CatalogProduct[]>(key);
  if (cached) return cached;
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${pageSize}&langs=es&fields=code,product_name,product_name_es,brands,quantity,product_quantity,product_quantity_unit,image_front_small_url,image_front_url,categories_tags,countries_tags,packaging`;
  const json = await fetchJson(url);
  const hits: any[] = json?.hits ?? [];
  // Priorizar productos vendidos en España.
  hits.sort((a, b) => Number((b.countries_tags ?? []).includes('en:spain')) - Number((a.countries_tags ?? []).includes('en:spain')));
  const results = hits.map((h) => toCatalogProduct(h, 'off', 'https://world.openfoodfacts.org')).filter((x): x is CatalogProduct => !!x);
  await cacheSet(key, results);
  return results;
}
