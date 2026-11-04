import { addListItem, defaultListId, productIdsInActiveLists } from '@/data/lists';
import { getProduct } from '@/data/products';
import { addStock, consumeStock } from '@/data/stock';
import { lastPaidPrice } from '@/data/prices';

import { haptic } from './haptics';
import { stockAlert } from './notifications';
import { toast } from './toast';

/** Añade un producto del inventario a la lista activa, evitando duplicados. */
export async function addProductToList(productId: string, quantity = 1, listId?: string) {
  const p = await getProduct(productId);
  if (!p) return;
  const id = listId ?? (await defaultListId());
  const price = await lastPaidPrice(productId);
  await addListItem(id, { productId, name: p.name, quantity, unit: 'ud', category: p.category, estimatedPrice: price });
  haptic.success();
  toast(`${p.name} añadido a la lista`);
}

/** Botón −: consume 1 (FEFO) y propone reponer si llega al mínimo. */
export async function decrementProduct(productId: string, amount = 1) {
  const remaining = await consumeStock(productId, amount, 'consume');
  const p = await getProduct(productId);
  if (!p) return remaining;
  const alert = stockAlert(p.name, remaining, p.min_quantity);
  if (alert) {
    const inList = (await productIdsInActiveLists()).has(productId);
    if (!inList) {
      haptic.warning();
      const suggested = Math.max(1, Math.ceil((p.usual_quantity ?? (p.min_quantity ?? 0) + 1) - remaining));
      toast(alert.title, 'warning', { label: 'Añadir', onPress: () => addProductToList(productId, suggested) });
    }
  }
  return remaining;
}

/** Botón +: suma 1 al lote más reciente compatible. */
export async function incrementProduct(productId: string, amount = 1) {
  return addStock({ productId, quantity: amount, reason: 'adjust' });
}
