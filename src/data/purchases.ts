import { all, first, householdId, insertRow, nowIso, run, transaction, updateRow } from '@/db/client';
import { addDays, ISODate, todayISO } from '@/domain/dates';
import { ExpiryKind } from '@/domain/expiry';
import { PackageSize, Unit } from '@/domain/units';

import { addPriceObservation } from './prices';
import { createProduct, matchExistingProduct, packageOf } from './products';
import { addStockRaw } from './stock';
import { Product, Purchase, PurchaseItem } from './types';

export interface PurchaseLine {
  /** Artículo de la lista de origen (se elimina de la lista al confirmar). */
  listItemId?: string | null;
  productId?: string | null;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  pkg?: PackageSize | null;
  unit?: Unit;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  discount?: number;
  expiryDate?: ISODate | null;
  expiryKind?: ExpiryKind | null;
  locationId?: string | null;
  /** false → se registra el gasto pero no entra al inventario (p. ej. comida preparada). */
  addToInventory?: boolean;
}

export interface FinishPurchaseInput {
  listId?: string | null;
  store: string | null;
  date?: ISODate;
  source: 'list' | 'receipt' | 'manual';
  lines: PurchaseLine[];
  /** Total real pagado si se conoce (ticket). */
  total?: number | null;
  /** Archivar la lista si ya no quedan artículos pendientes. */
  archiveListIfDone?: boolean;
}

export interface FinishPurchaseResult {
  purchaseId: string;
  added: number;
  createdProducts: number;
  total: number;
  verifiedSavings: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Confirma una compra: actualiza el inventario (sin duplicar productos), registra gasto,
 * precios reales y el historial. Todo en una única transacción.
 */
export async function finishPurchase(input: FinishPurchaseInput): Promise<FinishPurchaseResult> {
  const date = input.date ?? todayISO();
  return transaction(
    ['products', 'batches', 'stock_movements', 'purchases', 'purchase_items', 'list_items', 'shopping_lists', 'price_observations', 'savings'],
    async () => {
      const lineTotals = input.lines.map((l) => (l.totalPrice != null ? l.totalPrice - (l.discount ?? 0) : l.unitPrice != null ? l.unitPrice * l.quantity : 0));
      const total = round2(input.total ?? lineTotals.reduce((a, b) => a + b, 0));
      const purchaseId = await insertRow(
        'purchases',
        { list_id: input.listId ?? null, store: input.store, total, purchased_at: date, source: input.source, item_count: input.lines.length },
        { emit: false },
      );
      let added = 0;
      let createdProducts = 0;
      let verifiedSavings = 0;

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        let product: Product | null = null;
        if (line.productId) product = await first<Product>('SELECT * FROM products WHERE id = ? AND deleted = 0', [line.productId]);
        if (!product) product = await matchExistingProduct({ name: line.name, brand: line.brand, barcode: line.barcode, pkg: line.pkg });
        let productId = product?.id ?? null;
        const addToInventory = line.addToInventory !== false;
        if (!productId && addToInventory) {
          productId = await createProduct(
            {
              name: line.name,
              brand: line.brand,
              barcode: line.barcode,
              category: line.category,
              image_url: line.imageUrl,
              unit: line.unit ?? 'ud',
              package_count: line.pkg?.count ?? null,
              package_amount: line.pkg?.amount ?? null,
              package_unit: line.pkg?.unit ?? null,
              default_location_id: line.locationId ?? null,
              source: input.source === 'receipt' ? 'receipt' : 'list',
            },
            { emit: false },
          );
          createdProducts++;
        }
        const paidTotal = lineTotals[i];
        const unitPaid = line.quantity > 0 && paidTotal > 0 ? round2(paidTotal / line.quantity) : line.unitPrice ?? null;

        if (productId && addToInventory && line.quantity > 0) {
          await addStockRaw({
            productId,
            quantity: line.quantity,
            expiryDate: line.expiryDate ?? null,
            expiryKind: line.expiryKind ?? null,
            locationId: line.locationId ?? null,
            pricePaid: unitPaid,
            store: input.store,
            purchasedAt: date,
            reason: 'purchase',
          });
          added++;
        }

        await insertRow(
          'purchase_items',
          {
            purchase_id: purchaseId,
            product_id: productId,
            name: line.name,
            category: line.category ?? product?.category ?? null,
            quantity: line.quantity,
            unit_price: unitPaid,
            total_price: paidTotal > 0 ? round2(paidTotal) : null,
            discount: line.discount ?? 0,
          },
          { emit: false },
        );

        if (unitPaid != null && unitPaid > 0 && input.store) {
          // Ahorro verificado: precio real pagado frente a precios reales registrados en otras tiendas (últimos 30 días).
          if (productId) {
            const others = await all<{ price: number }>(
              `SELECT price FROM price_observations WHERE product_id = ? AND deleted = 0 AND store != ? AND source IN ('receipt','manual','open_prices')
               AND observed_at >= ? ORDER BY observed_at DESC LIMIT 5`,
              [productId, input.store, addDays(date, -30)],
            );
            if (others.length > 0) {
              const sorted = others.map((o) => o.price).sort((a, b) => a - b);
              const median = sorted[Math.floor(sorted.length / 2)];
              const saving = round2((median - unitPaid) * line.quantity);
              if (saving > 0.01) {
                verifiedSavings += saving;
                await insertRow('savings', { purchase_id: purchaseId, product_id: productId, amount: saving, verified: 1, date, note: line.name }, { emit: false });
              }
            }
          }
          await addPriceObservation(
            {
              productId,
              barcode: line.barcode ?? product?.barcode ?? null,
              productName: line.name,
              brand: line.brand ?? product?.brand ?? null,
              store: input.store,
              price: unitPaid,
              pkg: line.pkg ?? (product ? packageOf(product) : null),
              observedAt: date,
              source: input.source === 'receipt' ? 'receipt' : 'manual',
              sourceRef: purchaseId,
            },
            { emit: false },
          );
        }

        if (line.listItemId) {
          await run('UPDATE list_items SET deleted = 1, dirty = 1, updated_at = ? WHERE id = ?', [nowIso(), line.listItemId]);
        }
      }

      if (input.listId) {
        const left = await first<{ n: number }>('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ? AND deleted = 0', [input.listId]);
        if (input.archiveListIfDone && (left?.n ?? 0) === 0) {
          await updateRow('shopping_lists', input.listId, { status: 'archived' }, { emit: false });
        } else {
          await run('UPDATE shopping_lists SET updated_at = ?, dirty = 1 WHERE id = ?', [nowIso(), input.listId]);
        }
      }

      return { purchaseId, added, createdProducts, total, verifiedSavings: round2(verifiedSavings) };
    },
  );
}

export async function listPurchases(limit = 100): Promise<Purchase[]> {
  return all<Purchase>('SELECT * FROM purchases WHERE deleted = 0 AND household_id = ? ORDER BY purchased_at DESC, created_at DESC LIMIT ?', [householdId(), limit]);
}

export async function getPurchase(id: string): Promise<{ purchase: Purchase; items: PurchaseItem[] } | null> {
  const purchase = await first<Purchase>('SELECT * FROM purchases WHERE id = ?', [id]);
  if (!purchase) return null;
  const items = await all<PurchaseItem>('SELECT * FROM purchase_items WHERE purchase_id = ? AND deleted = 0 ORDER BY created_at', [id]);
  return { purchase, items };
}

export async function purchasesSince(date: ISODate) {
  const purchases = await all<Purchase>('SELECT * FROM purchases WHERE deleted = 0 AND household_id = ? AND purchased_at >= ? ORDER BY purchased_at', [householdId(), date]);
  const items = await all<PurchaseItem & { purchased_at: string }>(
    `SELECT pi.*, p.purchased_at FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
     WHERE pi.deleted = 0 AND p.deleted = 0 AND p.household_id = ? AND p.purchased_at >= ?`,
    [householdId(), date],
  );
  return purchases.map((p) => ({
    date: p.purchased_at,
    store: p.store,
    total: p.total,
    items: items.filter((i) => i.purchase_id === p.id).map((i) => ({ productId: i.product_id, name: i.name, category: i.category, totalPrice: i.total_price, quantity: i.quantity })),
  }));
}
