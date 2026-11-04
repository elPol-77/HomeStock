import { categorize, categorizeByName, categorizeByTags, suggestZone } from '@/domain/categorize';

const zones = [
  { id: 'n', name: 'Nevera' },
  { id: 'c', name: 'Congelador' },
  { id: 'd', name: 'Despensa' },
  { id: 'l', name: 'Armario de limpieza' },
  { id: 'b', name: 'Baño' },
];

describe('categorización', () => {
  it('por nombre', () => {
    expect(categorizeByName('Leche semidesnatada Hacendado')).toBe('Lácteos y huevos');
    expect(categorizeByName('Guisantes ultracongelados')).toBe('Congelados');
    expect(categorizeByName('Detergente líquido Bosque Verde')).toBe('Lavandería');
    expect(categorizeByName('Champú anticaspa')).toBe('Higiene personal');
    expect(categorizeByName('Chocolate con leche Valor')).toBe('Despensa');
    expect(categorizeByName('Cola Cao original')).toBe('Panadería y desayuno');
    expect(categorizeByName('Pañales talla 4')).toBe('Bebé');
    expect(categorizeByName('Comida gato adulto')).toBe('Mascotas');
    expect(categorizeByName('xyz')).toBeNull();
  });

  it('por etiquetas de Open Food Facts, la más específica gana y no confunde "plant-based-foods-and-beverages"', () => {
    expect(categorizeByTags(['en:plant-based-foods-and-beverages', 'en:plant-based-foods', 'en:legumes'])).toBe('Despensa');
    expect(categorizeByTags(['en:snacks', 'en:sweet-snacks', 'en:biscuits'])).toBe('Panadería y desayuno');
    expect(categorizeByTags(['en:meals', 'en:frozen-foods', 'en:pizzas'])).toBe('Congelados');
    expect(categorize('Algo raro', ['en:dairies', 'en:cheeses'])).toBe('Lácteos y huevos');
    expect(categorize('Atún claro en aceite', [])).toBe('Despensa');
  });

  it('propone la zona con su motivo', () => {
    expect(suggestZone({ name: 'Yogur natural', category: 'Lácteos y huevos' }, zones)?.id).toBe('n');
    expect(suggestZone({ name: 'Pizza 4 quesos ultracongelada', category: 'Congelados' }, zones)?.id).toBe('c');
    expect(suggestZone({ name: 'Lejía', category: 'Limpieza' }, zones)?.id).toBe('l');
    expect(suggestZone({ name: 'Gel de baño', category: 'Higiene personal' }, zones)?.id).toBe('b');
    expect(suggestZone({ name: 'Arroz redondo', category: 'Despensa' }, zones)?.id).toBe('d');
    expect(suggestZone({ name: 'Zumo de naranja recién exprimido', category: 'Bebidas' }, zones)?.id).toBe('n');
    expect(suggestZone({ name: 'Arroz' }, [])).toBeNull();
  });
});
