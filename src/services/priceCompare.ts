import { all } from '@/db/client';
import { getListItems } from '@/data/lists';
import { allProducts, packageOf } from '@/data/products';
import { BasketComparison, BasketItem, compareBasket, PriceOffer } from '@/domain/basket';
import { addDays, daysBetween, todayISO } from '@/domain/dates';
import { compareProducts } from '@/domain/matching';
import { textSimilarity } from '@/domain/text';
import { PackageSize, parsePackageSize, unitPrice } from '@/domain/units';
import type { PriceObservation, Product } from '@/data/types';

import { bundledCatalogInfo, matchBundled, packagePrice, priceUnitLabel } from './catalog/bundled';
import { latestPerStore, pricesForBarcodes } from './catalog/openPrices';
import { storeName } from './catalog/stores';
import { demoOffersFor } from './demoPrices';
import { settings } from './settings';

export interface ProductPriceRow {
  store: string;
  storeLabel: string;
  price: number;
  unitPriceText: string | null;
  unitPriceValue: number | null;
  isOffer: boolean;
  regularPrice: number | null;
  date: string;
  location: string | null;
  source: PriceOffer['source'];
  sourceRef: string | null;
  match: 'identical' | 'alternative';
  productName: string;
  matchReason: string;
  /** Marca propia del súper (marca blanca). */
  ownLabel?: boolean;
}

const BUNDLED_DATE = () => bundledCatalogInfo().reduce((d, c) => (c.capturedAt > d ? c.capturedAt : d), '1970-01-01');

function geoFilter() {
  const s = settings();
  return s.geo ? { lat: s.geo.lat, lon: s.geo.lon, radiusKm: s.maxDistanceKm } : null;
}

/** Precios conocidos de un producto concreto (por código o id), con alternativas comparables por precio unitario. */
export async function pricesForProduct(target: { productId?: string | null; barcode?: string | null; name: string; brand?: string | null; pkg?: PackageSize | null; bundledId?: string | null; category?: string | null }): Promise<{ rows: ProductPriceRow[]; publicError: string | null }> {
  const s = settings();
  const since = addDays(todayISO(), -s.priceMaxAgeDays);
  const rows: ProductPriceRow[] = [];
  const pkg = target.pkg ?? parsePackageSize(target.name);

  const local = await all<PriceObservation>(
    `SELECT * FROM price_observations WHERE deleted = 0 AND observed_at >= ? AND source != 'demo' ORDER BY observed_at DESC LIMIT 500`,
    [since],
  );
  const seen = new Set<string>();
  for (const o of local) {
    const oPkg = o.package_amount && o.package_unit ? { count: o.package_count ?? 1, amount: o.package_amount, unit: o.package_unit } : parsePackageSize(o.product_name);
    const sameId = (target.productId && o.product_id === target.productId) || (target.barcode && o.barcode === target.barcode);
    const cmp = sameId ? { kind: 'identical' as const, reason: target.barcode && o.barcode === target.barcode ? 'Mismo código de barras' : 'Mismo producto' } : compareProducts({ name: target.name, brand: target.brand, barcode: target.barcode, packageSize: pkg }, { name: o.product_name, brand: o.brand, barcode: o.barcode, packageSize: oPkg });
    if (cmp.kind === 'different') continue;
    if (!sameId && textSimilarity(target.name, o.product_name) < 0.5) continue;
    const key = `${o.store}|${cmp.kind}|${o.product_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const up = unitPrice(o.price, oPkg);
    rows.push({
      store: o.store, storeLabel: storeName(o.store), price: o.price, unitPriceValue: up?.value ?? null,
      unitPriceText: up ? `${up.value.toFixed(2).replace('.', ',')} €/${up.per === 'l' ? 'L' : up.per}` : null,
      isOffer: !!o.is_offer, regularPrice: o.regular_price, date: o.observed_at, location: o.store_location, source: o.source, sourceRef: o.source_ref,
      match: cmp.kind, productName: o.product_name, matchReason: cmp.reason,
    });
  }

  // Catálogos de supermercado incluidos en la app (precio con su fecha de captura).
  for (const m of matchBundled({ ...target, pkg }, 8)) {
    if (daysBetween(m.item.capturedAt, todayISO()) > s.priceMaxAgeDays) continue;
    const total = packagePrice(m.item);
    const shown = total ?? m.item.price;
    const up = total != null ? unitPrice(total, m.item.pkg) : null;
    rows.push({
      store: m.item.store, storeLabel: storeName(m.item.store), price: shown, unitPriceValue: up?.value ?? null,
      unitPriceText: up ? `${up.value.toFixed(2).replace('.', ',')} €/${up.per === 'l' ? 'L' : up.per}` : total == null ? `${m.item.price.toFixed(2).replace('.', ',')} € ${priceUnitLabel(m.item)}` : null,
      isOffer: m.item.isOffer, regularPrice: m.item.regularPrice, date: m.item.capturedAt, location: null, source: 'connector', sourceRef: null,
      match: m.kind, productName: [m.item.name, m.item.format].filter(Boolean).join(' · '), matchReason: m.reason, ownLabel: m.ownLabel,
    });
  }

  let publicError: string | null = null;
  if (s.usePublicPrices && target.barcode) {
    try {
      const ext = latestPerStore(await pricesForBarcodes([target.barcode], geoFilter(), s.priceMaxAgeDays));
      for (const e of ext) {
        const up = unitPrice(e.price, pkg);
        rows.push({
          store: e.store, storeLabel: storeName(e.store), price: e.price, unitPriceValue: up?.value ?? null,
          unitPriceText: up ? `${up.value.toFixed(2).replace('.', ',')} €/${up.per === 'l' ? 'L' : up.per}` : null,
          isOffer: e.isOffer, regularPrice: e.regularPrice, date: e.date, location: e.storeLocation, source: 'open_prices', sourceRef: e.sourceRef,
          match: 'identical', productName: e.productName ?? target.name, matchReason: 'Mismo código de barras',
        });
      }
    } catch (e) {
      publicError = e instanceof Error ? e.message : 'No se pudo consultar Open Prices';
    }
  }

  if (s.demoPrices) {
    for (const d of demoOffersFor(target.name, 1)) {
      const up = unitPrice(d.price, pkg);
      rows.push({
        store: d.store, storeLabel: storeName(d.store), price: d.price, unitPriceValue: up?.value ?? null,
        unitPriceText: up ? `${up.value.toFixed(2).replace('.', ',')} €/${up.per === 'l' ? 'L' : up.per}` : null,
        isOffer: d.isOffer, regularPrice: d.regularPrice ?? null, date: d.observedAt, location: null, source: 'demo', sourceRef: null,
        match: 'identical', productName: target.name, matchReason: 'Dato ficticio de demostración',
      });
    }
  }

  rows.sort((a, b) => (a.match === b.match ? a.price - b.price : a.match === 'identical' ? -1 : 1));
  return { rows, publicError };
}

export interface BasketRun {
  items: BasketItem[];
  offers: PriceOffer[];
  comparison: BasketComparison;
  publicError: string | null;
  sourcesUsed: Set<PriceOffer['source']>;
  oldestDays: number | null;
}

/** Reúne precios verificables para todos los artículos de una lista y compara la compra completa. */
export async function compareList(listId: string): Promise<BasketRun> {
  const s = settings();
  const items = (await getListItems(listId)).filter((i) => !i.checked);
  const products = await allProducts();
  const byId = new Map<string, Product>(products.map((p) => [p.id, p]));
  const since = addDays(todayISO(), -s.priceMaxAgeDays);
  const observations = await all<PriceObservation>(`SELECT * FROM price_observations WHERE deleted = 0 AND observed_at >= ? AND source != 'demo' ORDER BY observed_at DESC`, [since]);

  const basket: BasketItem[] = items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity }));
  const offers: PriceOffer[] = [];

  for (const item of items) {
    const product = item.product_id ? byId.get(item.product_id) : undefined;
    const pkg = product ? packageOf(product) : parsePackageSize(item.name);
    const latest = new Map<string, PriceOffer>();
    for (const o of observations) {
      let match: 'identical' | 'alternative' | null = null;
      if (product && (o.product_id === product.id || (product.barcode && o.barcode === product.barcode))) match = 'identical';
      else {
        const oPkg = o.package_amount && o.package_unit ? { count: o.package_count ?? 1, amount: o.package_amount, unit: o.package_unit } : null;
        const cmp = compareProducts({ name: product?.name ?? item.name, brand: product?.brand ?? null, barcode: product?.barcode ?? null, packageSize: pkg }, { name: o.product_name, brand: o.brand, barcode: o.barcode, packageSize: oPkg });
        if (cmp.kind === 'identical') match = 'identical';
        else if (cmp.kind === 'alternative' && cmp.score >= 0.6) match = 'alternative';
      }
      if (!match) continue;
      const key = `${o.store}|${match}`;
      if (latest.has(key)) continue; // ya tenemos la más reciente (orden DESC)
      latest.set(key, { itemId: item.id, store: o.store, productName: o.product_name, price: o.price, isOffer: !!o.is_offer, regularPrice: o.regular_price, match, observedAt: o.observed_at, source: o.source });
    }
    // Catálogo incluido: el idéntico si existe; si no, la mejor alternativa por tienda.
    if (daysBetween(BUNDLED_DATE(), todayISO()) <= s.priceMaxAgeDays) {
      for (const m of matchBundled({ name: product?.name ?? item.name, brand: product?.brand ?? null, barcode: product?.barcode ?? null, pkg }, 3)) {
        const key = `${m.item.store}|${m.kind}`;
        const prev = latest.get(key);
        if (prev && prev.observedAt >= m.item.capturedAt) continue;
        const total = packagePrice(m.item);
        if (total == null) continue;
        latest.set(key, { itemId: item.id, store: m.item.store, productName: m.item.name, price: total, isOffer: m.item.isOffer, regularPrice: m.item.regularPrice, match: m.kind, observedAt: m.item.capturedAt, source: 'connector' });
      }
    }
    offers.push(...latest.values());
  }

  let publicError: string | null = null;
  if (s.usePublicPrices) {
    const codes = new Map<string, string>();
    for (const i of items) {
      const p = i.product_id ? byId.get(i.product_id) : undefined;
      if (p?.barcode) codes.set(p.barcode, i.id);
    }
    if (codes.size > 0) {
      try {
        for (const e of latestPerStore(await pricesForBarcodes([...codes.keys()], geoFilter(), s.priceMaxAgeDays))) {
          const itemId = codes.get(e.barcode)!;
          const dup = offers.find((o) => o.itemId === itemId && o.store === e.store && o.match === 'identical');
          if (dup && dup.observedAt >= e.date) continue;
          if (dup) offers.splice(offers.indexOf(dup), 1);
          offers.push({ itemId, store: e.store, productName: e.productName ?? '', price: e.price, isOffer: e.isOffer, regularPrice: e.regularPrice, match: 'identical', observedAt: e.date, source: 'open_prices' });
        }
      } catch (e) {
        publicError = e instanceof Error ? e.message : 'Open Prices no disponible';
      }
    }
  }

  if (s.demoPrices) {
    for (const i of items) {
      for (const d of demoOffersFor(i.name, 1)) offers.push({ ...d, itemId: i.id });
    }
  }

  const comparison = compareBasket(basket, offers, {
    extraStopCost: s.extraStopCost,
    maxStores: s.maxStores,
    allowAlternatives: s.allowAlternatives,
    stores: s.favoriteStores,
  });
  const today = todayISO();
  const oldest = offers.length ? Math.max(...offers.map((o) => daysBetween(o.observedAt, today))) : null;
  return { items: basket, offers, comparison, publicError, sourcesUsed: new Set(offers.map((o) => o.source)), oldestDays: oldest };
}
