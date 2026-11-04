import { all, first, householdId, insertRow, nowIso, run, softDelete, transaction, updateRow } from '@/db/client';
import { normalizeText } from '@/domain/text';
import { Unit } from '@/domain/units';

import { ListItem, ListKind, ShoppingList, ShoppingListWithCounts } from './types';

export async function listShoppingLists(status: 'active' | 'archived' = 'active'): Promise<ShoppingListWithCounts[]> {
  return all<ShoppingListWithCounts>(
    `SELECT l.*,
      (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.deleted = 0) AS total_items,
      (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.deleted = 0 AND i.checked = 1) AS checked_items,
      (SELECT SUM(i.estimated_price * i.quantity) FROM list_items i WHERE i.list_id = l.id AND i.deleted = 0) AS estimated_total
     FROM shopping_lists l WHERE l.deleted = 0 AND l.status = ? AND l.household_id = ?
     ORDER BY l.updated_at DESC`,
    [status, householdId()],
  );
}

export async function getList(id: string): Promise<ShoppingList | null> {
  return first<ShoppingList>('SELECT * FROM shopping_lists WHERE id = ? AND deleted = 0', [id]);
}

export async function getListItems(listId: string): Promise<ListItem[]> {
  return all<ListItem>(
    `SELECT i.*, p.image_url, p.brand FROM list_items i LEFT JOIN products p ON p.id = i.product_id
     WHERE i.list_id = ? AND i.deleted = 0 ORDER BY i.checked, i.category, i.sort_order, i.created_at`,
    [listId],
  );
}

export const LIST_KINDS: { kind: ListKind; label: string; emoji: string }[] = [
  { kind: 'weekly', label: 'Compra semanal', emoji: '🛒' },
  { kind: 'monthly', label: 'Compra mensual', emoji: '📦' },
  { kind: 'cleaning', label: 'Limpieza', emoji: '🧽' },
  { kind: 'party', label: 'Celebración', emoji: '🎉' },
  { kind: 'custom', label: 'Personalizada', emoji: '📝' },
];

export async function createList(name: string, kind: ListKind, emoji?: string | null): Promise<string> {
  return insertRow('shopping_lists', { name: name.trim(), kind, status: 'active', emoji: emoji ?? LIST_KINDS.find((k) => k.kind === kind)?.emoji ?? '📝' });
}

export async function renameList(id: string, name: string, store?: string | null): Promise<void> {
  await updateRow('shopping_lists', id, { name: name.trim(), store: store ?? null });
}

export async function setListStatus(id: string, status: 'active' | 'archived'): Promise<void> {
  await updateRow('shopping_lists', id, { status });
}

export async function deleteList(id: string): Promise<void> {
  await transaction(['shopping_lists', 'list_items'], async () => {
    await softDelete('shopping_lists', id, { emit: false });
    await run('UPDATE list_items SET deleted = 1, dirty = 1, updated_at = ? WHERE list_id = ?', [nowIso(), id]);
  });
}

/** Lista activa por defecto: la última usada o la primera. */
export async function defaultListId(): Promise<string> {
  const r = await first<{ id: string }>("SELECT id FROM shopping_lists WHERE deleted = 0 AND status = 'active' AND household_id = ? ORDER BY updated_at DESC LIMIT 1", [householdId()]);
  if (r) return r.id;
  return createList('Compra semanal', 'weekly');
}

export interface AddItemInput {
  productId?: string | null;
  name: string;
  quantity?: number;
  unit?: Unit;
  category?: string | null;
  estimatedPrice?: number | null;
  note?: string | null;
}

/** Añade un artículo. Si ya está pendiente en la lista, suma la cantidad (sin duplicados). */
export async function addListItem(listId: string, input: AddItemInput): Promise<string> {
  return transaction(['list_items', 'shopping_lists'], async () => {
    const pending = await all<ListItem>('SELECT * FROM list_items WHERE list_id = ? AND deleted = 0 AND checked = 0', [listId]);
    const norm = normalizeText(input.name);
    const same = pending.find((i) => (input.productId && i.product_id === input.productId) || (!input.productId && !i.product_id && normalizeText(i.name) === norm));
    const qty = input.quantity ?? 1;
    await run('UPDATE shopping_lists SET updated_at = ?, dirty = 1 WHERE id = ?', [nowIso(), listId]);
    if (same) {
      await updateRow('list_items', same.id, { quantity: same.quantity + qty }, { emit: false });
      return same.id;
    }
    const max = await first<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM list_items WHERE list_id = ?', [listId]);
    return insertRow(
      'list_items',
      {
        list_id: listId,
        product_id: input.productId ?? null,
        name: input.name.trim(),
        quantity: qty,
        unit: input.unit ?? 'ud',
        category: input.category ?? null,
        estimated_price: input.estimatedPrice ?? null,
        note: input.note ?? null,
        checked: 0,
        sort_order: (max?.m ?? 0) + 1,
      },
      { emit: false },
    );
  });
}

export async function updateListItem(id: string, patch: Partial<Pick<ListItem, 'name' | 'quantity' | 'unit' | 'estimated_price' | 'actual_price' | 'note' | 'category'>>): Promise<void> {
  await updateRow('list_items', id, patch);
}

export async function setItemChecked(id: string, checked: boolean): Promise<void> {
  await updateRow('list_items', id, { checked: checked ? 1 : 0, checked_at: checked ? nowIso() : null });
}

export async function removeListItem(id: string): Promise<void> {
  await softDelete('list_items', id);
}

export async function clearChecked(listId: string): Promise<void> {
  await run('UPDATE list_items SET deleted = 1, dirty = 1, updated_at = ? WHERE list_id = ? AND checked = 1', [nowIso(), listId]);
  const { emitChange } = await import('@/db/events');
  emitChange(['list_items', 'shopping_lists']);
}

export async function pendingItemsCount(): Promise<number> {
  const r = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM list_items i JOIN shopping_lists l ON l.id = i.list_id
     WHERE i.deleted = 0 AND i.checked = 0 AND l.deleted = 0 AND l.status = 'active' AND l.household_id = ?`,
    [householdId()],
  );
  return r?.n ?? 0;
}

/** Productos que ya están pendientes en alguna lista activa. */
export async function productIdsInActiveLists(): Promise<Set<string>> {
  const rows = await all<{ product_id: string }>(
    `SELECT DISTINCT i.product_id FROM list_items i JOIN shopping_lists l ON l.id = i.list_id
     WHERE i.deleted = 0 AND i.checked = 0 AND i.product_id IS NOT NULL AND l.deleted = 0 AND l.status = 'active'`,
  );
  return new Set(rows.map((r) => r.product_id));
}
