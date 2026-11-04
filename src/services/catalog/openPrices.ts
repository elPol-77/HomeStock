import { first, nowIso, run } from '@/db/client';

import { OFF_USER_AGENT } from './openFoodFacts';
import { storeKey } from './stores';
import { ExternalPrice } from './types';

/**
 * Open Prices — base de datos abierta y colaborativa de precios reales (con ticket o foto como prueba).
 * Licencia ODbL. No hace scraping: los precios los aportan personas.
 * https://prices.openfoodfacts.org/api/docs
 */
const BASE = 'https://prices.openfoodfacts.org/api/v1/prices';
const CACHE_HOURS = 12;

export interface GeoFilter {
  lat: number;
  lon: number;
  radiusKm: number;
}

export async function pricesForBarcodes(codes: string[], geo?: GeoFilter | null, sinceDays = 180): Promise<ExternalPrice[]> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) return [];
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
  const geoKey = geo ? `${geo.lat.toFixed(2)},${geo.lon.toFixed(2)},${geo.radiusKm}` : 'all';
  const out: ExternalPrice[] = [];
  // Lotes de 20 códigos por petición para no saturar la API.
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    const key = `prices:${geoKey}:${chunk.join(',')}`;
    const cached = await first<{ json: string; fetched_at: string }>('SELECT json, fetched_at FROM catalog_cache WHERE key = ?', [key]);
    if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) / 3600000 < CACHE_HOURS) {
      out.push(...(JSON.parse(cached.json) as ExternalPrice[]));
      continue;
    }
    const params = new URLSearchParams({ product_code__in: chunk.join(','), currency: 'EUR', date__gte: since, order_by: '-date', size: '100' });
    if (geo) {
      params.set('lat', String(geo.lat));
      params.set('lon', String(geo.lon));
      params.set('radius_km', String(geo.radiusKm));
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${BASE}?${params.toString()}`, { headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
      if (!res.ok) throw new Error(`Open Prices respondió ${res.status}`);
      const json = await res.json();
      const items: ExternalPrice[] = (json.items ?? [])
        .map((it: any): ExternalPrice | null => {
          const loc = it.location ?? {};
          if (loc.osm_address_country_code && loc.osm_address_country_code !== 'ES') return null;
          const brand: string | null = loc.osm_brand || loc.osm_name || null;
          const store = storeKey(brand);
          if (!store || typeof it.price !== 'number') return null;
          return {
            barcode: it.product_code,
            productName: it.product?.product_name ?? it.product_name ?? null,
            store,
            storeName: brand ?? store,
            storeLocation: loc.osm_address_city ?? null,
            price: it.price,
            regularPrice: typeof it.price_without_discount === 'number' ? it.price_without_discount : null,
            isOffer: !!it.price_is_discounted,
            perKg: it.price_per === 'KILOGRAM',
            date: String(it.date).slice(0, 10),
            source: 'open_prices',
            sourceRef: `https://prices.openfoodfacts.org/prices/${it.id}`,
            lat: typeof loc.osm_lat === 'number' ? loc.osm_lat : null,
            lon: typeof loc.osm_lon === 'number' ? loc.osm_lon : null,
          };
        })
        .filter((x: ExternalPrice | null): x is ExternalPrice => !!x);
      await run('INSERT OR REPLACE INTO catalog_cache (key, json, fetched_at) VALUES (?, ?, ?)', [key, JSON.stringify(items), nowIso()]);
      out.push(...items);
    } finally {
      clearTimeout(t);
    }
  }
  return out;
}

/** Último precio por (código, tienda): Open Prices puede tener varias entradas. */
export function latestPerStore(prices: ExternalPrice[]): ExternalPrice[] {
  const map = new Map<string, ExternalPrice>();
  for (const p of prices) {
    if (p.perKg) continue; // no comparable con precio por envase
    const k = `${p.barcode}|${p.store}`;
    const prev = map.get(k);
    if (!prev || p.date > prev.date) map.set(k, p);
  }
  return [...map.values()];
}
