import { addDays, ISODate, startOfMonth, startOfWeek, todayISO } from './dates';

export interface PurchaseRecord {
  date: ISODate;
  store: string | null;
  total: number;
  items: { productId: string | null; name: string; category: string | null; totalPrice: number | null; quantity: number }[];
}

export interface MovementRecord {
  date: ISODate;
  productId: string;
  productName: string;
  reason: 'consume' | 'discard' | 'expired' | 'purchase' | 'adjust';
  quantity: number;
  /** Valor estimado (precio pagado del lote) si se conoce. */
  value: number | null;
}

export interface SavingRecord {
  date: ISODate;
  amount: number;
  /** verified = precio pagado real comparado con un precio real observado de otra tienda. */
  verified: boolean;
}

export interface Bucket {
  key: string;
  label: string;
  value: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function spendingByWeek(purchases: PurchaseRecord[], weeks = 8, today: ISODate = todayISO()): Bucket[] {
  const current = startOfWeek(today);
  const keys: ISODate[] = [];
  for (let i = weeks - 1; i >= 0; i--) keys.push(addDays(current, -7 * i));
  const map = new Map(keys.map((k) => [k, 0]));
  for (const p of purchases) {
    const k = startOfWeek(p.date);
    if (map.has(k)) map.set(k, map.get(k)! + p.total);
  }
  return keys.map((k) => ({ key: k, label: `${Number(k.slice(8, 10))}/${Number(k.slice(5, 7))}`, value: round2(map.get(k)!) }));
}

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function spendingByMonth(purchases: PurchaseRecord[], months = 6, today: ISODate = todayISO()): Bucket[] {
  const keys: string[] = [];
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let i = 0; i < months; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  const map = new Map(keys.map((k) => [k, 0]));
  for (const p of purchases) {
    const k = startOfMonth(p.date).slice(0, 7);
    if (map.has(k)) map.set(k, map.get(k)! + p.total);
  }
  return keys.map((k) => ({ key: k, label: MONTH_LABELS[Number(k.slice(5, 7)) - 1], value: round2(map.get(k)!) }));
}

export function spendingByCategory(purchases: PurchaseRecord[], since: ISODate): Bucket[] {
  const map = new Map<string, number>();
  for (const p of purchases) {
    if (p.date < since) continue;
    for (const it of p.items) {
      if (it.totalPrice == null) continue;
      const c = it.category ?? 'Sin categoría';
      map.set(c, (map.get(c) ?? 0) + it.totalPrice);
    }
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, label: k, value: round2(v) })).sort((a, b) => b.value - a.value);
}

export function topProducts(purchases: PurchaseRecord[], limit = 8): Bucket[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const p of purchases) {
    for (const it of p.items) {
      const k = it.productId ?? it.name.toLowerCase();
      const prev = map.get(k) ?? { name: it.name, count: 0 };
      prev.count += 1;
      map.set(k, prev);
    }
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, label: v.name, value: v.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Productos que más veces se han agotado (existencias a 0 tras un consumo). */
export function frequentRunOuts(runOuts: { productId: string; productName: string }[], limit = 6): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of runOuts) {
    const b = map.get(r.productId) ?? { key: r.productId, label: r.productName, value: 0 };
    b.value += 1;
    map.set(r.productId, b);
  }
  return [...map.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}

export function wasteSummary(movements: MovementRecord[], since: ISODate) {
  const wasted = movements.filter((m) => (m.reason === 'discard' || m.reason === 'expired') && m.date >= since);
  const valueKnown = wasted.filter((m) => m.value != null);
  return {
    count: wasted.length,
    units: round2(wasted.reduce((s, m) => s + m.quantity, 0)),
    estimatedValue: round2(valueKnown.reduce((s, m) => s + (m.value ?? 0), 0)),
    valueIsPartial: valueKnown.length < wasted.length,
    items: wasted,
  };
}

/** Separa el ahorro verificado (real) del estimado. Nunca se suman juntos. */
export function savingsSummary(savings: SavingRecord[], since: ISODate) {
  const s = savings.filter((x) => x.date >= since);
  return {
    verified: round2(s.filter((x) => x.verified).reduce((a, x) => a + x.amount, 0)),
    estimated: round2(s.filter((x) => !x.verified).reduce((a, x) => a + x.amount, 0)),
  };
}

export function totalSpent(purchases: PurchaseRecord[], since: ISODate): number {
  return round2(purchases.filter((p) => p.date >= since).reduce((s, p) => s + p.total, 0));
}
