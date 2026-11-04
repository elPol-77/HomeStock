import { ISODate } from './dates';
import { MatchKind } from './matching';

export type PriceSource = 'receipt' | 'manual' | 'open_prices' | 'connector' | 'demo';

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  receipt: 'Ticket de tu hogar',
  manual: 'Registrado por tu hogar',
  open_prices: 'Open Prices (comunidad)',
  connector: 'Catálogo de la tienda',
  demo: 'DATOS DE DEMOSTRACIÓN',
};

export interface BasketItem {
  id: string;
  name: string;
  /** Envases a comprar. */
  quantity: number;
}

export interface PriceOffer {
  itemId: string;
  store: string;
  productName: string;
  price: number;
  isOffer: boolean;
  regularPrice?: number | null;
  match: Exclude<MatchKind, 'different'>;
  observedAt: ISODate;
  source: PriceSource;
}

export interface BasketOptions {
  /** Coste estimado de ir a una tienda adicional (tiempo, transporte). */
  extraStopCost: number;
  maxStores: number;
  allowAlternatives: boolean;
  /** Limitar a estas tiendas (opción C). */
  stores?: string[];
}

export interface Assignment {
  itemId: string;
  itemName: string;
  store: string;
  offer: PriceOffer;
  cost: number;
}

export interface StorePlan {
  stores: string[];
  assignments: Assignment[];
  missing: BasketItem[];
  /** Suma de productos (sin coste de desplazamiento). */
  productsTotal: number;
  travelCost: number;
  total: number;
  usesAlternatives: boolean;
  usesDemoData: boolean;
}

export interface BasketComparison {
  /** Opción A: cada tienda por separado, ordenadas por cobertura y precio. */
  singleStore: StorePlan[];
  /** Comparación justa: solo los productos que tienen precio en todas las tiendas comparadas. */
  commonItems: { items: BasketItem[]; totals: { store: string; total: number }[] } | null;
  /** Opción B: mejor combinación de tiendas. */
  multiStore: StorePlan | null;
  /** Opción C: mejor combinación usando solo las tiendas favoritas. */
  favorites: StorePlan | null;
  /** Ahorro estimado de B frente a la mejor tienda única, sobre los mismos productos. */
  estimatedSavings: number | null;
  itemsWithoutPrices: BasketItem[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bestOfferFor(item: BasketItem, store: string, offers: PriceOffer[], allowAlternatives: boolean): PriceOffer | null {
  let best: PriceOffer | null = null;
  for (const o of offers) {
    if (o.itemId !== item.id || o.store !== store) continue;
    if (o.match === 'alternative' && !allowAlternatives) continue;
    if (!best) best = o;
    else if (o.match === 'identical' && best.match === 'alternative') best = o;
    else if (o.match === best.match && (o.price < best.price || (o.price === best.price && o.observedAt > best.observedAt))) best = o;
  }
  return best;
}

function buildPlan(stores: string[], items: BasketItem[], offers: PriceOffer[], opts: BasketOptions): StorePlan {
  const assignments: Assignment[] = [];
  const missing: BasketItem[] = [];
  for (const item of items) {
    let best: Assignment | null = null;
    for (const s of stores) {
      const o = bestOfferFor(item, s, offers, opts.allowAlternatives);
      if (!o) continue;
      const cost = round2(o.price * item.quantity);
      if (!best || cost < best.cost || (cost === best.cost && o.match === 'identical' && best.offer.match !== 'identical')) {
        best = { itemId: item.id, itemName: item.name, store: s, offer: o, cost };
      }
    }
    if (best) assignments.push(best);
    else missing.push(item);
  }
  const usedStores = [...new Set(assignments.map((a) => a.store))];
  const productsTotal = round2(assignments.reduce((s, a) => s + a.cost, 0));
  const travelCost = round2(Math.max(0, usedStores.length - 1) * opts.extraStopCost);
  return {
    stores: usedStores.length ? usedStores : stores,
    assignments,
    missing,
    productsTotal,
    travelCost,
    total: round2(productsTotal + travelCost),
    usesAlternatives: assignments.some((a) => a.offer.match === 'alternative'),
    usesDemoData: assignments.some((a) => a.offer.source === 'demo'),
  };
}

function subsets<T>(arr: T[], maxSize: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length > 0) out.push([...acc]);
    if (acc.length === maxSize) return;
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function bestCombination(stores: string[], items: BasketItem[], offers: PriceOffer[], opts: BasketOptions): StorePlan | null {
  if (stores.length === 0) return null;
  // Precio de referencia de cada artículo (el más barato conocido) para penalizar los que quedan fuera.
  const refPrice = new Map<string, number>();
  for (const item of items) {
    let min = Infinity;
    for (const s of stores) {
      const o = bestOfferFor(item, s, offers, opts.allowAlternatives);
      if (o) min = Math.min(min, o.price * item.quantity);
    }
    if (min < Infinity) refPrice.set(item.id, min);
  }
  const candidates = stores.slice(0, 12);
  let best: { plan: StorePlan; score: number } | null = null;
  for (const subset of subsets(candidates, Math.max(1, opts.maxStores))) {
    const plan = buildPlan(subset, items, offers, opts);
    if (new Set(plan.assignments.map((a) => a.store)).size < subset.length) continue; // tienda que no aporta nada
    const penalty = plan.missing.reduce((s, it) => s + (refPrice.has(it.id) ? refPrice.get(it.id)! + opts.extraStopCost : 0), 0);
    const score = plan.total + penalty;
    if (!best || score < best.score - 0.001 || (Math.abs(score - best.score) < 0.001 && subset.length < best.plan.stores.length)) {
      best = { plan, score };
    }
  }
  return best?.plan ?? null;
}

export function compareBasket(items: BasketItem[], offers: PriceOffer[], opts: BasketOptions): BasketComparison {
  const allStores = [...new Set(offers.map((o) => o.store))].sort();
  const itemsWithoutPrices = items.filter((it) => !offers.some((o) => o.itemId === it.id && (opts.allowAlternatives || o.match === 'identical')));

  const singleStore = allStores
    .map((s) => buildPlan([s], items, offers, opts))
    .filter((p) => p.assignments.length > 0)
    .sort((a, b) => b.assignments.length - a.assignments.length || a.total - b.total);

  let commonItems: BasketComparison['commonItems'] = null;
  if (singleStore.length >= 2) {
    const storesCmp = singleStore.map((p) => p.stores[0]);
    const common = items.filter((it) => storesCmp.every((s) => bestOfferFor(it, s, offers, opts.allowAlternatives)));
    if (common.length > 0) {
      commonItems = {
        items: common,
        totals: storesCmp
          .map((s) => ({ store: s, total: round2(common.reduce((sum, it) => sum + bestOfferFor(it, s, offers, opts.allowAlternatives)!.price * it.quantity, 0)) }))
          .sort((a, b) => a.total - b.total),
      };
    }
  }

  const multiStore = bestCombination(allStores, items, offers, opts);
  const fav = opts.stores && opts.stores.length > 0 ? allStores.filter((s) => opts.stores!.includes(s)) : [];
  const favorites = fav.length > 0 ? bestCombination(fav, items, offers, opts) : null;

  let estimatedSavings: number | null = null;
  const bestSingle = singleStore[0];
  if (multiStore && bestSingle && multiStore.stores.length > 1) {
    const covered = bestSingle.assignments.map((a) => a.itemId).filter((id) => multiStore.assignments.some((m) => m.itemId === id));
    const singleCost = bestSingle.assignments.filter((a) => covered.includes(a.itemId)).reduce((s, a) => s + a.cost, 0);
    const multiCost = multiStore.assignments.filter((a) => covered.includes(a.itemId)).reduce((s, a) => s + a.cost, 0) + multiStore.travelCost;
    estimatedSavings = round2(singleCost - multiCost);
  }

  return { singleStore, commonItems, multiStore, favorites, estimatedSavings, itemsWithoutPrices };
}
