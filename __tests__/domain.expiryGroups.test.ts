import { mergeExpiryGroups, totalUnits } from '@/domain/expiryGroups';

describe('grupos de caducidad', () => {
  it('un lote por fecha distinta, sumando las repetidas', () => {
    const g = mergeExpiryGroups([
      { qty: 2, date: '2026-11-10' },
      { qty: 1, date: '2026-11-15' },
      { qty: 1, date: '2026-11-10' },
    ]);
    expect(g).toEqual([
      { qty: 3, date: '2026-11-10' },
      { qty: 1, date: '2026-11-15' },
    ]);
  });
  it('sin fecha cuenta como un grupo propio y se ignoran los vacíos', () => {
    expect(mergeExpiryGroups([{ qty: 0, date: '2026-11-10' }, { qty: 2, date: null }])).toEqual([{ qty: 2, date: null }]);
  });
  it('total de unidades', () => {
    expect(totalUnits([{ qty: 2, date: null }, { qty: 3, date: '2026-01-01' }])).toBe(5);
  });
});
