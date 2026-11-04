import { all, first, householdId } from '@/db/client';
import { addDays, startOfMonth, todayISO } from '@/domain/dates';
import { learnUsualQuantity, restockSuggestions, RestockSuggestion } from '@/domain/suggestions';

import { productIdsInActiveLists } from './lists';
import { listProductsWithStock } from './products';
import { expiringBatches } from './stock';

export interface HomeSummary {
  productCount: number;
  unitsInStock: number;
  expiringSoon: Awaited<ReturnType<typeof expiringBatches>>;
  missingCount: number;
  lowCount: number;
  suggestions: RestockSuggestion[];
  activeList: { id: string; name: string; emoji: string | null; total: number; checked: number } | null;
  pendingTotal: number;
  spentThisMonth: number;
  verifiedSavingsMonth: number;
}

/** Cantidades totales tras cada compra, para aprender la "cantidad habitual". */
async function levelsAfterRestock(): Promise<Map<string, number[]>> {
  const rows = await all<{ product_id: string; created_at: string; delta: number; reason: string }>(
    `SELECT product_id, created_at, delta, reason FROM stock_movements WHERE deleted = 0 AND household_id = ? ORDER BY created_at`,
    [householdId()],
  );
  const level = new Map<string, number>();
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const next = Math.max(0, (level.get(r.product_id) ?? 0) + r.delta);
    level.set(r.product_id, next);
    if (r.reason === 'purchase') {
      const arr = out.get(r.product_id) ?? [];
      arr.push(next);
      out.set(r.product_id, arr);
    }
  }
  return out;
}

export async function getSuggestions(): Promise<RestockSuggestion[]> {
  const products = await listProductsWithStock();
  const inList = await productIdsInActiveLists();
  const levels = await levelsAfterRestock();
  // Solo productos que el hogar quiere controlar: con mínimo configurado, o que ya se compraron alguna vez.
  return restockSuggestions(
    products
      .filter((p) => (p.min_quantity ?? 0) > 0 || (levels.get(p.id)?.length ?? 0) > 0)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        minQuantity: p.min_quantity,
        usualQuantity: p.usual_quantity ?? learnUsualQuantity(levels.get(p.id) ?? []),
        alreadyInList: inList.has(p.id),
      })),
  );
}

export async function homeSummary(warnDays: number): Promise<HomeSummary> {
  const products = await listProductsWithStock();
  const expiring = await expiringBatches(addDays(todayISO(), Math.max(warnDays, 3) + 4));
  const list = await first<{ id: string; name: string; emoji: string | null; total: number; checked: number }>(
    `SELECT l.id, l.name, l.emoji,
      (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.deleted = 0) AS total,
      (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.deleted = 0 AND i.checked = 1) AS checked
     FROM shopping_lists l WHERE l.deleted = 0 AND l.status = 'active' AND l.household_id = ? ORDER BY l.updated_at DESC LIMIT 1`,
    [householdId()],
  );
  const pending = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM list_items i JOIN shopping_lists l ON l.id = i.list_id WHERE i.deleted = 0 AND i.checked = 0 AND l.deleted = 0 AND l.status = 'active' AND l.household_id = ?`,
    [householdId()],
  );
  const month = startOfMonth(todayISO());
  const spent = await first<{ s: number | null }>('SELECT SUM(total) AS s FROM purchases WHERE deleted = 0 AND household_id = ? AND purchased_at >= ?', [householdId(), month]);
  const saved = await first<{ s: number | null }>('SELECT SUM(amount) AS s FROM savings WHERE deleted = 0 AND verified = 1 AND household_id = ? AND date >= ?', [householdId(), month]);
  const inStock = products.filter((p) => p.quantity > 0);
  return {
    productCount: inStock.length,
    unitsInStock: inStock.reduce((s, p) => s + p.quantity, 0),
    expiringSoon: expiring,
    missingCount: products.filter((p) => p.quantity <= 0).length,
    lowCount: products.filter((p) => p.quantity > 0 && (p.min_quantity ?? 0) > 0 && p.quantity <= (p.min_quantity ?? 0)).length,
    suggestions: await getSuggestions(),
    activeList: list,
    pendingTotal: pending?.n ?? 0,
    spentThisMonth: spent?.s ?? 0,
    verifiedSavingsMonth: saved?.s ?? 0,
  };
}
