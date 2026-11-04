import { ISODate } from './dates';

export interface BatchLike {
  id: string;
  quantity: number;
  expiryDate: ISODate | null;
  openedAt: ISODate | null;
  locationId: string | null;
}

export interface Consumption {
  batchId: string;
  amount: number;
}

/**
 * Orden FEFO (first-expired, first-out): primero lo abierto, luego lo que antes caduca,
 * y al final lo que no tiene fecha.
 */
export function fefoOrder<T extends BatchLike>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    if (!!a.openedAt !== !!b.openedAt) return a.openedAt ? -1 : 1;
    if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
    if (a.expiryDate) return -1;
    if (b.expiryDate) return 1;
    return 0;
  });
}

/** Reparte un consumo entre lotes siguiendo FEFO. Nunca deja existencias negativas. */
export function planConsumption(batches: BatchLike[], amount: number): Consumption[] {
  let remaining = amount;
  const out: Consumption[] = [];
  for (const b of fefoOrder(batches.filter((x) => x.quantity > 0))) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    out.push({ batchId: b.id, amount: round(take) });
    remaining = round(remaining - take);
  }
  return out;
}

/**
 * Al añadir existencias, decide si se suman a un lote existente (misma fecha, misma ubicación, sin abrir)
 * o si hay que crear un lote nuevo.
 */
export function findMergeableBatch<T extends BatchLike>(
  batches: T[],
  expiryDate: ISODate | null,
  locationId: string | null,
): T | null {
  return (
    batches.find(
      (b) => b.quantity > 0 && !b.openedAt && (b.expiryDate ?? null) === (expiryDate ?? null) && (b.locationId ?? null) === (locationId ?? null),
    ) ?? null
  );
}

export function totalQuantity(batches: { quantity: number }[]): number {
  return round(batches.reduce((s, b) => s + Math.max(0, b.quantity), 0));
}

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevel(quantity: number, minQuantity: number | null | undefined): StockLevel {
  if (quantity <= 0) return 'out';
  if (minQuantity != null && minQuantity > 0 && quantity <= minQuantity) return 'low';
  return 'ok';
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
