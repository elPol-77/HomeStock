import { all, first, householdId, insertRow, nowIso, run, transaction, updateRow } from '@/db/client';
import { ISODate, todayISO } from '@/domain/dates';
import { ExpiryKind } from '@/domain/expiry';
import { findMergeableBatch, planConsumption } from '@/domain/inventory';

import { getProduct } from './products';
import { Batch, Movement, MovementReason } from './types';

export async function getBatches(productId: string): Promise<(Batch & { location_name: string | null })[]> {
  return all(
    `SELECT b.*, l.name AS location_name FROM batches b LEFT JOIN locations l ON l.id = b.location_id
     WHERE b.product_id = ? AND b.deleted = 0 AND b.quantity > 0
     ORDER BY CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END, b.expiry_date`,
    [productId],
  );
}

export async function getMovements(productId: string, limit = 30): Promise<Movement[]> {
  return all<Movement>('SELECT * FROM stock_movements WHERE product_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT ?', [productId, limit]);
}

/** La cantidad de un lote es siempre la suma de sus movimientos (sin conflictos al sincronizar). */
export async function recomputeBatch(batchId: string): Promise<void> {
  await run(
    `UPDATE batches SET quantity = MAX(0, COALESCE((SELECT SUM(delta) FROM stock_movements WHERE batch_id = ? AND deleted = 0), 0)) WHERE id = ?`,
    [batchId, batchId],
  );
}

export async function recomputeAllBatches(): Promise<void> {
  await run(`UPDATE batches SET quantity = MAX(0, COALESCE((SELECT SUM(delta) FROM stock_movements m WHERE m.batch_id = batches.id AND m.deleted = 0), 0))`);
}

async function productTotal(productId: string): Promise<number> {
  const r = await first<{ q: number | null }>('SELECT SUM(quantity) AS q FROM batches WHERE product_id = ? AND deleted = 0', [productId]);
  return r?.q ?? 0;
}

export interface AddStockInput {
  productId: string;
  quantity: number;
  expiryDate?: ISODate | null;
  expiryKind?: ExpiryKind | null;
  locationId?: string | null;
  pricePaid?: number | null;
  store?: string | null;
  purchasedAt?: ISODate | null;
  reason?: MovementReason;
  author?: string | null;
}

/** Añade existencias. Sin transacción propia: úsala dentro de `transaction` o vía `addStock`. */
export async function addStockRaw(input: AddStockInput): Promise<string> {
  const product = await getProduct(input.productId);
  const locationId = input.locationId ?? product?.default_location_id ?? null;
  const batches = await all<Batch>('SELECT * FROM batches WHERE product_id = ? AND deleted = 0', [input.productId]);
  const mergeable = findMergeableBatch(
    batches.map((b) => ({ id: b.id, quantity: b.quantity, expiryDate: b.expiry_date, openedAt: b.opened_at, locationId: b.location_id })),
    input.expiryDate ?? null,
    locationId,
  );
  let batchId: string;
  if (mergeable && (input.pricePaid == null || batches.find((b) => b.id === mergeable.id)?.price_paid === input.pricePaid)) {
    batchId = mergeable.id;
  } else {
    batchId = await insertRow(
      'batches',
      {
        product_id: input.productId,
        location_id: locationId,
        quantity: 0,
        expiry_date: input.expiryDate ?? null,
        expiry_kind: input.expiryDate ? input.expiryKind ?? null : null,
        purchased_at: input.purchasedAt ?? todayISO(),
        price_paid: input.pricePaid ?? null,
        store: input.store ?? null,
      },
      { emit: false },
    );
  }
  await insertRow(
    'stock_movements',
    {
      product_id: input.productId,
      batch_id: batchId,
      delta: input.quantity,
      reason: input.reason ?? 'adjust',
      unit_price: input.pricePaid ?? null,
      store: input.store ?? null,
      author: input.author ?? null,
    },
    { emit: false },
  );
  await recomputeBatch(batchId);
  return batchId;
}

export async function addStock(input: AddStockInput): Promise<number> {
  return transaction(['batches', 'stock_movements', 'products'], async () => {
    await addStockRaw(input);
    return productTotal(input.productId);
  });
}

/** Consume existencias siguiendo FEFO. Devuelve la cantidad restante del producto. */
export async function consumeStock(productId: string, amount: number, reason: MovementReason = 'consume'): Promise<number> {
  return transaction(['batches', 'stock_movements', 'products'], async () => {
    const batches = await all<Batch>('SELECT * FROM batches WHERE product_id = ? AND deleted = 0 AND quantity > 0', [productId]);
    const plan = planConsumption(
      batches.map((b) => ({ id: b.id, quantity: b.quantity, expiryDate: b.expiry_date, openedAt: b.opened_at, locationId: b.location_id })),
      amount,
    );
    for (const c of plan) {
      const batch = batches.find((b) => b.id === c.batchId);
      await insertRow(
        'stock_movements',
        { product_id: productId, batch_id: c.batchId, delta: -c.amount, reason, unit_price: batch?.price_paid ?? null },
        { emit: false },
      );
      await recomputeBatch(c.batchId);
    }
    return productTotal(productId);
  });
}

/** Retira un lote completo (desechado o caducado). Queda registrado para estadísticas de desperdicio. */
export async function removeBatch(batchId: string, reason: 'discard' | 'expired' | 'consume'): Promise<void> {
  await transaction(['batches', 'stock_movements', 'products'], async () => {
    const b = await first<Batch>('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!b || b.quantity <= 0) return;
    await insertRow('stock_movements', { product_id: b.product_id, batch_id: b.id, delta: -b.quantity, reason, unit_price: b.price_paid }, { emit: false });
    await recomputeBatch(b.id);
  });
}

/** Corrige la cantidad de un lote (recuento manual). */
export async function setBatchQuantity(batchId: string, quantity: number): Promise<void> {
  await transaction(['batches', 'stock_movements', 'products'], async () => {
    const b = await first<Batch>('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!b) return;
    const delta = Math.round((quantity - b.quantity) * 1000) / 1000;
    if (delta === 0) return;
    await insertRow('stock_movements', { product_id: b.product_id, batch_id: b.id, delta, reason: 'adjust' }, { emit: false });
    await recomputeBatch(b.id);
  });
}

export async function updateBatch(
  batchId: string,
  patch: Partial<Pick<Batch, 'expiry_date' | 'expiry_kind' | 'opened_at' | 'location_id' | 'price_paid' | 'store'>>,
): Promise<void> {
  await updateRow('batches', batchId, patch);
}

export async function markOpened(batchId: string, opened: boolean): Promise<void> {
  await updateRow('batches', batchId, { opened_at: opened ? todayISO() : null });
}

/** Lotes con fecha próxima (para inicio y notificaciones). */
/** Lotes que caducan antes de `untilDate`: de la casa activa o, con `allHouseholds`, de todas (para los avisos). */
export async function expiringBatches(
  untilDate: ISODate,
  opts: { allHouseholds?: boolean } = {},
): Promise<
  { id: string; product_id: string; product_name: string; image_url: string | null; quantity: number; expiry_date: ISODate; expiry_kind: ExpiryKind | null; location_name: string | null; household_id: string; household_name: string | null }[]
> {
  return all(
    `SELECT b.id, b.product_id, p.name AS product_name, p.image_url, b.quantity, b.expiry_date, b.expiry_kind, l.name AS location_name, b.household_id, h.name AS household_name
     FROM batches b JOIN products p ON p.id = b.product_id LEFT JOIN locations l ON l.id = b.location_id LEFT JOIN households h ON h.id = b.household_id
     WHERE b.deleted = 0 AND p.deleted = 0 AND b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= ?
       ${opts.allHouseholds ? '' : 'AND b.household_id = ?'}
     ORDER BY b.expiry_date`,
    opts.allHouseholds ? [untilDate] : [untilDate, householdId()],
  );
}

export { nowIso };
