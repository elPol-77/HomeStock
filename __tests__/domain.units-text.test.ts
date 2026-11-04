import { normalizeText, parseDecimal, textSimilarity } from '../src/domain/text';
import { formatPackage, formatUnitPrice, parsePackageSize, samePackageSize, unitPrice } from '../src/domain/units';
import { daysBetween, relativeDays, addDays, startOfWeek } from '../src/domain/dates';
import { expiryLabel, expiryStatus } from '../src/domain/expiry';

describe('texto', () => {
  it('normaliza tildes y mayúsculas', () => {
    expect(normalizeText('  Leche SEMIDESNATADA  Hacendado ')).toBe('leche semidesnatada hacendado');
    expect(normalizeText('Plátano de Canarias')).toBe('platano de canarias');
  });
  it('parsea decimales españoles', () => {
    expect(parseDecimal('1,25')).toBe(1.25);
    expect(parseDecimal('1.234,50')).toBe(1234.5);
    expect(parseDecimal('0.89 €')).toBe(0.89);
  });
  it('similitud tolerante al orden', () => {
    expect(textSimilarity('Leche semidesnatada Hacendado', 'Hacendado leche semidesnatada')).toBeCloseTo(1);
    expect(textSimilarity('Leche entera', 'Detergente líquido')).toBe(0);
  });
});

describe('unidades y precio unitario', () => {
  it('extrae tamaños de envase', () => {
    expect(parsePackageSize('Leche semidesnatada 1 L')).toEqual({ count: 1, amount: 1, unit: 'l' });
    expect(parsePackageSize('Pack 6 x 1 l')).toEqual({ count: 6, amount: 1, unit: 'l' });
    expect(parsePackageSize('Arroz 1,5kg')).toEqual({ count: 1, amount: 1.5, unit: 'kg' });
    expect(parsePackageSize('Coca-Cola Zero 2L')).toEqual({ count: 1, amount: 2, unit: 'l' });
    expect(parsePackageSize('Papel higiénico 12 rollos')).toEqual({ count: 1, amount: 12, unit: 'ud' });
    expect(parsePackageSize('Yogur natural')).toBeNull();
  });
  it('calcula precio por litro/kg', () => {
    expect(unitPrice(5.34, { count: 6, amount: 1, unit: 'l' })).toEqual({ value: 0.89, per: 'l' });
    expect(formatUnitPrice(unitPrice(1.2, { count: 1, amount: 500, unit: 'g' }))).toBe('2,40 €/kg');
  });
  it('distingue tamaños distintos', () => {
    expect(samePackageSize({ count: 1, amount: 1, unit: 'l' }, { count: 1, amount: 1000, unit: 'ml' })).toBe(true);
    expect(samePackageSize({ count: 1, amount: 3, unit: 'l' }, { count: 1, amount: 1.5, unit: 'l' })).toBe(false);
    expect(formatPackage({ count: 6, amount: 1, unit: 'l' })).toBe('6 x 1 L');
  });
});

describe('fechas y caducidad', () => {
  it('cuenta días entre fechas', () => {
    expect(daysBetween('2026-11-04', '2026-11-15')).toBe(11);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // cambio de hora
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
  });
  it('relativo en español', () => {
    expect(relativeDays('2026-11-05', '2026-11-04')).toBe('mañana');
    expect(relativeDays('2026-11-07', '2026-11-04')).toBe('en 3 días');
    expect(relativeDays('2026-11-02', '2026-11-04')).toBe('hace 2 días');
  });
  it('no trata el consumo preferente superado como caducado', () => {
    expect(expiryStatus('2026-11-01', 'best_before', 3, '2026-11-04')).toBe('past_best_before');
    expect(expiryStatus('2026-11-01', 'use_by', 3, '2026-11-04')).toBe('expired');
    expect(expiryStatus('2026-11-06', 'use_by', 3, '2026-11-04')).toBe('soon');
    expect(expiryLabel('2026-11-01', 'best_before', '2026-11-04')).toMatch(/revisa su estado/);
    expect(expiryLabel('2026-11-07', 'use_by', '2026-11-04')).toBe('Caduca en 3 días');
  });
});
