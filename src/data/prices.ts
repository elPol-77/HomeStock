import { all, householdId, insertRow } from '@/db/client';
import type { PriceSource } from '@/domain/basket';
import { ISODate, todayISO } from '@/domain/dates';
import { PackageSize } from '@/domain/units';

import { PriceObservation } from './types';

export interface PriceInput {
  productId?: string | null;
  barcode?: string | null;
  productName: string;
  brand?: string | null;
  store: string;
  storeLocation?: string | null;
  price: number;
  regularPrice?: number | null;
  isOffer?: boolean;
  pkg?: PackageSize | null;
  observedAt?: ISODate;
  source: PriceSource;
  sourceRef?: string | null;
}

export async function addPriceObservation(input: PriceInput, opts: { emit?: boolean } = {}): Promise<string> {
  return insertRow(
    'price_observations',
    {
      product_id: input.productId ?? null,
      barcode: input.barcode ?? null,
      product_name: input.productName,
      brand: input.brand ?? null,
      store: input.store,
      store_location: input.storeLocation ?? null,
      price: Math.round(input.price * 100) / 100,
      regular_price: input.regularPrice ?? null,
      is_offer: input.isOffer ? 1 : 0,
      package_count: input.pkg?.count ?? null,
      package_amount: input.pkg?.amount ?? null,
      package_unit: input.pkg?.unit ?? null,
      observed_at: input.observedAt ?? todayISO(),
      source: input.source,
      source_ref: input.sourceRef ?? null,
    },
    opts,
  );
}

/** Precios registrados por el hogar para un producto (por id o código de barras). */
export async function localPricesFor(productId: string | null, barcode: string | null): Promise<PriceObservation[]> {
  return all<PriceObservation>(
    `SELECT * FROM price_observations WHERE deleted = 0 AND household_id = ?
       AND ((? IS NOT NULL AND product_id = ?) OR (? IS NOT NULL AND barcode = ?))
     ORDER BY observed_at DESC`,
    [householdId(), productId, productId, barcode, barcode],
  );
}

export async function searchLocalPrices(text: string): Promise<PriceObservation[]> {
  const like = `%${text.trim()}%`;
  return all<PriceObservation>(
    `SELECT * FROM price_observations WHERE deleted = 0 AND household_id = ? AND (product_name LIKE ? OR brand LIKE ?)
     ORDER BY observed_at DESC LIMIT 200`,
    [householdId(), like, like],
  );
}

/** Último precio conocido (real, no demo) de cada producto en cada tienda. */
export async function latestPricesByProduct(productIds: string[]): Promise<PriceObservation[]> {
  if (productIds.length === 0) return [];
  const placeholders = productIds.map(() => '?').join(',');
  return all<PriceObservation>(
    `SELECT po.* FROM price_observations po
     WHERE po.deleted = 0 AND po.product_id IN (${placeholders})
       AND po.observed_at = (SELECT MAX(p2.observed_at) FROM price_observations p2 WHERE p2.deleted = 0 AND p2.product_id = po.product_id AND p2.store = po.store)`,
    productIds,
  );
}

export async function lastPaidPrice(productId: string): Promise<number | null> {
  const rows = await all<{ price: number }>(
    "SELECT price FROM price_observations WHERE product_id = ? AND deleted = 0 AND source IN ('receipt','manual') ORDER BY observed_at DESC LIMIT 1",
    [productId],
  );
  return rows[0]?.price ?? null;
}
