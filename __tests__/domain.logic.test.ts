import { compareBasket, PriceOffer } from '../src/domain/basket';
import { fefoOrder, findMergeableBatch, planConsumption, stockLevel } from '../src/domain/inventory';
import { compareProducts, findExistingProduct } from '../src/domain/matching';
import { planNotifications, stockAlertMessage } from '../src/domain/notificationsPlan';
import { savingsSummary, spendingByCategory, spendingByMonth, spendingByWeek, wasteSummary } from '../src/domain/stats';
import { learnUsualQuantity, restockSuggestions } from '../src/domain/suggestions';

describe('inventario', () => {
  const batches = [
    { id: 'a', quantity: 2, expiryDate: '2026-11-20', openedAt: null, locationId: 'n' },
    { id: 'b', quantity: 1, expiryDate: '2026-11-10', openedAt: null, locationId: 'n' },
    { id: 'c', quantity: 1, expiryDate: null, openedAt: null, locationId: 'n' },
    { id: 'd', quantity: 1, expiryDate: '2026-12-01', openedAt: '2026-11-03', locationId: 'n' },
  ];
  it('ordena FEFO con lo abierto primero', () => {
    expect(fefoOrder(batches).map((b) => b.id)).toEqual(['d', 'b', 'a', 'c']);
  });
  it('reparte el consumo sin negativos', () => {
    expect(planConsumption(batches, 3)).toEqual([
      { batchId: 'd', amount: 1 },
      { batchId: 'b', amount: 1 },
      { batchId: 'a', amount: 1 },
    ]);
    expect(planConsumption(batches, 99).reduce((s, c) => s + c.amount, 0)).toBe(5);
  });
  it('fusiona lotes iguales', () => {
    expect(findMergeableBatch(batches, '2026-11-20', 'n')?.id).toBe('a');
    expect(findMergeableBatch(batches, '2026-11-21', 'n')).toBeNull();
  });
  it('niveles de stock', () => {
    expect(stockLevel(0, 2)).toBe('out');
    expect(stockLevel(2, 2)).toBe('low');
    expect(stockLevel(3, 2)).toBe('ok');
  });
});

describe('coincidencia de productos', () => {
  it('mismo código = idéntico', () => {
    expect(compareProducts({ name: 'A', barcode: '1' }, { name: 'B', barcode: '1' }).kind).toBe('identical');
  });
  it('detergentes de distinto tamaño no son idénticos', () => {
    const r = compareProducts(
      { name: 'Detergente líquido Bosque Verde 40 lavados', brand: 'Bosque Verde' },
      { name: 'Detergente líquido Bosque Verde 20 lavados', brand: 'Bosque Verde' },
    );
    expect(r.kind).toBe('alternative');
  });
  it('misma marca y tamaño sin código = idéntico', () => {
    const r = compareProducts({ name: 'Coca-Cola Zero 2 L', brand: 'Coca-Cola' }, { name: 'Coca Cola Zero botella 2L', brand: 'Coca-Cola' });
    expect(r.kind).toBe('identical');
  });
  it('encuentra el producto existente para no duplicar', () => {
    const existing = [
      { id: '1', name: 'Leche semidesnatada', brand: 'Hacendado', barcode: '8480000101912' },
      { id: '2', name: 'Arroz redondo', brand: 'Hacendado', barcode: null },
    ];
    expect(findExistingProduct({ name: 'x', barcode: '8480000101912' }, existing)?.id).toBe('1');
    expect(findExistingProduct({ name: 'Arroz redondo' }, existing)?.id).toBe('2');
    expect(findExistingProduct({ name: 'Aceite de oliva' }, existing)).toBeNull();
  });
});

describe('sugerencias de reposición', () => {
  it('propone la diferencia con la cantidad habitual', () => {
    const s = restockSuggestions([
      { productId: 'l', name: 'Leche', quantity: 1, unit: 'ud', minQuantity: 2, usualQuantity: 4, alreadyInList: false },
      { productId: 'd', name: 'Detergente', quantity: 0, unit: 'ud', minQuantity: 1, usualQuantity: null, alreadyInList: false },
      { productId: 'a', name: 'Arroz', quantity: 0, unit: 'ud', minQuantity: 1, usualQuantity: null, alreadyInList: true },
      { productId: 'p', name: 'Pasta', quantity: 5, unit: 'ud', minQuantity: 2, usualQuantity: null, alreadyInList: false },
    ]);
    expect(s.map((x) => x.productId)).toEqual(['d', 'l']);
    expect(s[1].suggestedQuantity).toBe(3);
    expect(s[1].message).toBe('Normalmente tienes 4, pero ahora queda 1. ¿Quieres añadir 3 a tu lista?');
  });
  it('aprende la cantidad habitual', () => {
    expect(learnUsualQuantity([4, 4, 5, 3])).toBe(4);
    expect(learnUsualQuantity([4])).toBeNull();
  });
});

describe('comparador de cesta', () => {
  const items = [
    { id: 'leche', name: 'Leche', quantity: 2 },
    { id: 'arroz', name: 'Arroz', quantity: 1 },
    { id: 'deter', name: 'Detergente', quantity: 1 },
    { id: 'huevos', name: 'Huevos', quantity: 1 },
  ];
  const o = (itemId: string, store: string, price: number, match: 'identical' | 'alternative' = 'identical'): PriceOffer => ({
    itemId, store, price, match, productName: itemId, isOffer: false, observedAt: '2026-11-01', source: 'receipt',
  });
  const offers = [
    o('leche', 'mercadona', 0.89), o('leche', 'lidl', 0.85),
    o('arroz', 'mercadona', 1.15), o('arroz', 'lidl', 1.29),
    o('deter', 'mercadona', 5.5), o('deter', 'lidl', 3.99),
    o('deter', 'carrefour', 2.0, 'alternative'),
  ];
  it('opción A: tienda única con más cobertura y menor precio', () => {
    const r = compareBasket(items, offers, { extraStopCost: 1.5, maxStores: 3, allowAlternatives: false });
    expect(r.singleStore[0].stores).toEqual(['lidl']);
    expect(r.singleStore[0].total).toBe(6.98);
    expect(r.itemsWithoutPrices.map((i) => i.id)).toEqual(['huevos']);
    expect(r.commonItems?.items).toHaveLength(3);
  });
  it('opción B: no merece la pena ir a dos tiendas por 14 céntimos', () => {
    const r = compareBasket(items, offers, { extraStopCost: 1.5, maxStores: 3, allowAlternatives: false });
    expect(r.multiStore?.stores).toEqual(['lidl']);
  });
  it('opción B: sí con coste de desplazamiento 0', () => {
    const r = compareBasket(items, offers, { extraStopCost: 0, maxStores: 3, allowAlternatives: false });
    expect(r.multiStore?.stores.sort()).toEqual(['lidl', 'mercadona']);
    expect(r.multiStore?.total).toBe(6.84);
    expect(r.estimatedSavings).toBe(0.14);
  });
  it('alternativas solo si el usuario lo permite', () => {
    const r = compareBasket(items, offers, { extraStopCost: 0, maxStores: 3, allowAlternatives: true });
    expect(r.multiStore?.usesAlternatives).toBe(true);
  });
  it('opción C: solo favoritas', () => {
    const r = compareBasket(items, offers, { extraStopCost: 1.5, maxStores: 2, allowAlternatives: false, stores: ['mercadona'] });
    expect(r.favorites?.stores).toEqual(['mercadona']);
    expect(r.favorites?.total).toBe(8.43);
  });
});

describe('notificaciones', () => {
  const now = new Date(2026, 10, 4, 10, 0, 0);
  const settings = { expiryEnabled: true, warnDays: 3, hour: 9, shoppingReminderEnabled: true, shoppingWeekday: 5 };
  it('agrupa avisos por día y respeta consumo preferente', () => {
    const plan = planNotifications(
      [
        { productName: 'Yogur natural', quantity: 4, expiryDate: '2026-11-06', kind: 'use_by', locationName: 'Nevera' },
        { productName: 'Leche', quantity: 1, expiryDate: '2026-11-10', kind: 'best_before', locationName: 'Nevera' },
      ],
      settings,
      8,
      now,
    );
    const yogur = plan.find((p) => p.key === 'expiry:2026-11-05');
    expect(yogur?.title).toBe('¡Ojo! Tienes 4 × Yogur natural que caducan mañana');
    const leche = plan.find((p) => p.key === 'expiry:2026-11-09');
    expect(leche?.body).toMatch(/no significa que sea inseguro/);
    const shop = plan.find((p) => p.kind === 'shopping');
    expect(shop?.body).toBe('Tienes 8 productos pendientes en tu lista.');
    expect(shop?.fireAt.getDay()).toBe(6); // sábado
    expect(plan.every((p) => p.fireAt.getTime() > now.getTime())).toBe(true);
  });
  it('mensajes de stock', () => {
    expect(stockAlertMessage('Detergente', 0, 1)?.title).toBe('Te has quedado sin detergente');
    expect(stockAlertMessage('Aceite', 1, 1)?.title).toBe('Solo queda 1 de aceite');
    expect(stockAlertMessage('Aceite', 3, 1)).toBeNull();
  });
});

describe('estadísticas', () => {
  const purchases = [
    { date: '2026-11-03', store: 'lidl', total: 20, items: [{ productId: '1', name: 'Leche', category: 'Lácteos', totalPrice: 5, quantity: 2 }] },
    { date: '2026-10-20', store: 'mercadona', total: 30, items: [{ productId: '1', name: 'Leche', category: 'Lácteos', totalPrice: 6, quantity: 2 }, { productId: '2', name: 'Lejía', category: 'Limpieza', totalPrice: 1, quantity: 1 }] },
  ];
  it('agrega por semana, mes y categoría', () => {
    const weeks = spendingByWeek(purchases, 4, '2026-11-04');
    expect(weeks[3].value).toBe(20);
    const months = spendingByMonth(purchases, 2, '2026-11-04');
    expect(months.map((m) => m.value)).toEqual([30, 20]);
    expect(spendingByCategory(purchases, '2026-10-01')[0]).toMatchObject({ label: 'Lácteos', value: 11 });
  });
  it('separa ahorro verificado y estimado', () => {
    expect(savingsSummary([{ date: '2026-11-01', amount: 2, verified: true }, { date: '2026-11-01', amount: 5, verified: false }], '2026-10-01')).toEqual({ verified: 2, estimated: 5 });
  });
  it('desperdicio con valor parcial', () => {
    const w = wasteSummary(
      [
        { date: '2026-11-01', productId: '1', productName: 'Yogur', reason: 'expired', quantity: 2, value: 0.8 },
        { date: '2026-11-01', productId: '2', productName: 'Pan', reason: 'discard', quantity: 1, value: null },
      ],
      '2026-10-01',
    );
    expect(w).toMatchObject({ count: 2, estimatedValue: 0.8, valueIsPartial: true });
  });
});
