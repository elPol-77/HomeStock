import { all, first, householdId, insertRow, nowIso, run, softDelete, transaction, updateRow } from '@/db/client';
import { todayISO, addDays } from '@/domain/dates';
import { findExistingProduct } from '@/domain/matching';
import { PackageSize, Unit } from '@/domain/units';

import { Location, Product, ProductSource, ProductWithStock } from './types';

export interface ProductInput {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  category?: string | null;
  subcategory?: string | null;
  unit?: Unit;
  package_count?: number | null;
  package_amount?: number | null;
  package_unit?: Unit | null;
  packaging?: string | null;
  default_location_id?: string | null;
  min_quantity?: number | null;
  usual_quantity?: number | null;
  preferred_store?: string | null;
  notes?: string | null;
  source?: ProductSource;
}

export type InventoryFilter = 'all' | 'expiring' | 'low' | 'out';

const STOCK_SELECT = `
  SELECT p.*,
    COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id = p.id AND b.deleted = 0 AND b.quantity > 0), 0) AS quantity,
    (SELECT b.expiry_date FROM batches b WHERE b.product_id = p.id AND b.deleted = 0 AND b.quantity > 0 AND b.expiry_date IS NOT NULL ORDER BY b.expiry_date LIMIT 1) AS next_expiry,
    (SELECT b.expiry_kind FROM batches b WHERE b.product_id = p.id AND b.deleted = 0 AND b.quantity > 0 AND b.expiry_date IS NOT NULL ORDER BY b.expiry_date LIMIT 1) AS next_expiry_kind,
    (SELECT GROUP_CONCAT(DISTINCT l.name) FROM batches b JOIN locations l ON l.id = b.location_id WHERE b.product_id = p.id AND b.deleted = 0 AND b.quantity > 0) AS location_names,
    (SELECT COUNT(*) FROM batches b WHERE b.product_id = p.id AND b.deleted = 0 AND b.quantity > 0) AS batch_count,
    (SELECT po.price FROM price_observations po WHERE po.product_id = p.id AND po.deleted = 0 AND po.source != 'demo' ORDER BY po.observed_at DESC LIMIT 1) AS last_price
  FROM products p
  WHERE p.deleted = 0 AND p.household_id = ?`;

export async function listProductsWithStock(opts: { filter?: InventoryFilter; locationId?: string | null; search?: string; warnDays?: number } = {}): Promise<ProductWithStock[]> {
  const rows = await all<ProductWithStock>(`${STOCK_SELECT} ORDER BY p.name COLLATE NOCASE`, [householdId()]);
  const search = opts.search?.trim().toLowerCase();
  const limit = addDays(todayISO(), opts.warnDays ?? 3);
  let out = rows;
  if (opts.locationId) {
    const ids = new Set(
      (await all<{ product_id: string }>('SELECT DISTINCT product_id FROM batches WHERE deleted = 0 AND quantity > 0 AND location_id = ?', [opts.locationId])).map((r) => r.product_id),
    );
    out = out.filter((p) => ids.has(p.id) || (p.quantity <= 0 && p.default_location_id === opts.locationId));
  }
  if (search) {
    const s = search.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out = out.filter((p) =>
      `${p.name} ${p.brand ?? ''} ${p.category ?? ''} ${p.barcode ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(s),
    );
  }
  switch (opts.filter) {
    case 'expiring':
      out = out.filter((p) => p.next_expiry && p.next_expiry <= limit).sort((a, b) => (a.next_expiry ?? '').localeCompare(b.next_expiry ?? ''));
      break;
    case 'low':
      out = out.filter((p) => p.quantity > 0 && p.min_quantity != null && p.min_quantity > 0 && p.quantity <= p.min_quantity);
      break;
    case 'out':
      out = out.filter((p) => p.quantity <= 0);
      break;
  }
  return out;
}

export async function getProductWithStock(id: string): Promise<ProductWithStock | null> {
  return first<ProductWithStock>(`${STOCK_SELECT} AND p.id = ?`, [householdId(), id]);
}

export async function getProduct(id: string): Promise<Product | null> {
  return first<Product>('SELECT * FROM products WHERE id = ? AND deleted = 0', [id]);
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  return first<Product>('SELECT * FROM products WHERE barcode = ? AND deleted = 0 AND household_id = ? LIMIT 1', [barcode, householdId()]);
}

export async function allProducts(): Promise<Product[]> {
  return all<Product>('SELECT * FROM products WHERE deleted = 0 AND household_id = ? ORDER BY name COLLATE NOCASE', [householdId()]);
}

export function packageOf(p: Pick<Product, 'package_count' | 'package_amount' | 'package_unit'>): PackageSize | null {
  if (!p.package_amount || !p.package_unit) return null;
  return { count: p.package_count ?? 1, amount: p.package_amount, unit: p.package_unit };
}

/** Busca un producto existente equivalente (código o nombre/marca/tamaño) para no crear duplicados. */
export async function matchExistingProduct(input: { name: string; brand?: string | null; barcode?: string | null; pkg?: PackageSize | null }): Promise<Product | null> {
  const products = await allProducts();
  return findExistingProduct(
    { name: input.name, brand: input.brand, barcode: input.barcode, packageSize: input.pkg ?? null },
    products.map((p) => ({ ...p, packageSize: packageOf(p) })),
  ) as Product | null;
}

export async function createProduct(input: ProductInput, opts: { emit?: boolean } = {}): Promise<string> {
  return insertRow(
    'products',
    {
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      barcode: input.barcode?.trim() || null,
      image_url: input.image_url ?? null,
      category: input.category ?? null,
      subcategory: input.subcategory ?? null,
      unit: input.unit ?? 'ud',
      package_count: input.package_count ?? null,
      package_amount: input.package_amount ?? null,
      package_unit: input.package_unit ?? null,
      packaging: input.packaging ?? null,
      default_location_id: input.default_location_id ?? null,
      min_quantity: input.min_quantity ?? null,
      usual_quantity: input.usual_quantity ?? null,
      preferred_store: input.preferred_store ?? null,
      notes: input.notes ?? null,
      source: input.source ?? 'manual',
    },
    opts,
  );
}

export async function updateProduct(id: string, patch: ProductInput): Promise<void> {
  await updateRow('products', id, { ...patch });
}

export async function deleteProduct(id: string): Promise<void> {
  await transaction(['products', 'batches', 'list_items'], async () => {
    await softDelete('products', id, { emit: false });
    await run('UPDATE batches SET deleted = 1, dirty = 1, updated_at = ? WHERE product_id = ?', [nowIso(), id]);
  });
}

// ---- Ubicaciones ----

export async function listLocations(): Promise<Location[]> {
  return all<Location>('SELECT id, name, icon, sort_order FROM locations WHERE deleted = 0 AND household_id = ? ORDER BY sort_order, name', [householdId()]);
}

export async function createLocation(name: string, icon = 'cube-outline'): Promise<string> {
  const max = await first<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM locations WHERE household_id = ?', [householdId()]);
  return insertRow('locations', { name: name.trim(), icon, sort_order: (max?.m ?? 0) + 1 });
}

export async function updateLocation(id: string, name: string, icon: string): Promise<void> {
  await updateRow('locations', id, { name: name.trim(), icon });
}

export async function deleteLocation(id: string): Promise<void> {
  await transaction(['locations', 'batches'], async () => {
    await softDelete('locations', id, { emit: false });
    await run('UPDATE batches SET location_id = NULL, dirty = 1, updated_at = ? WHERE location_id = ?', [nowIso(), id]);
  });
}

export async function locationCounts(): Promise<Record<string, number>> {
  const rows = await all<{ location_id: string; n: number }>(
    'SELECT location_id, COUNT(DISTINCT product_id) AS n FROM batches WHERE deleted = 0 AND quantity > 0 AND household_id = ? GROUP BY location_id',
    [householdId()],
  );
  return Object.fromEntries(rows.map((r) => [r.location_id, r.n]));
}
