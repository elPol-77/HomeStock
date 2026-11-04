// Las fotos empaquetadas dependen de módulos nativos: aquí basta con saber que no hay.
jest.mock('@/services/catalog/imagePack', () => ({ packHas: () => false }));

import { bundledCatalogInfo, bundledItems, matchBundled, packagePrice, searchBundled } from '@/services/catalog/bundled';

describe('catálogo incluido de supermercado', () => {
  it('se carga con fecha, tienda y productos válidos', () => {
    const info = bundledCatalogInfo();
    expect(info[0].store).toBe('mercadona');
    expect(info[0].capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const items = bundledItems();
    expect(items.length).toBeGreaterThan(500);
    for (const i of items) {
      expect(i.name.length).toBeGreaterThan(2);
      expect(i.price).toBeGreaterThan(0);
      if (i.regularPrice != null) expect(i.regularPrice).toBeGreaterThan(i.price);
    }
    // ids únicos
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('busca por palabras en cualquier orden y con prefijos', () => {
    const r = searchBundled('cafe soluble hacend');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => /caf[eé]/i.test(i.name))).toBe(true);
    expect(searchBundled('zzzz inexistente')).toHaveLength(0);
  });

  it('empareja el mismo producto como idéntico y otros tamaños como alternativa', () => {
    const target = searchBundled('Café soluble Classic Hacendado').find((i) => i.format === 'Bote 200 g');
    expect(target).toBeDefined();
    const m = matchBundled({ name: target!.name, brand: target!.brand, pkg: target!.pkg });
    expect(m[0].kind).toBe('identical');
    expect(m[0].item.id).toBe(target!.id);
    expect(m.some((x) => x.kind === 'alternative')).toBe(true);
  });

  it('calcula el precio del envase', () => {
    const i = bundledItems().find((x) => x.priceUnit === 'ud');
    expect(packagePrice(i!)).toBe(i!.price);
  });
});

describe('alternativas de otras marcas', () => {
  it('Coca-Cola Zero → marca blanca y Pepsi zero, nunca la normal ni con sabor', () => {
    const coke = bundledItems().find((i) => i.store === 'consum' && i.name.startsWith('Refresco Cola Zero Botella Coca-cola') && i.format === '2 L');
    expect(coke).toBeDefined();
    const res = matchBundled({ name: coke!.name, brand: coke!.brand, pkg: coke!.pkg, bundledId: coke!.id }, 12);
    const alts = res.filter((m) => m.kind === 'alternative');
    const names = alts.map((m) => m.item.name);
    expect(alts.some((m) => m.ownLabel && /cero|zero/i.test(m.item.name))).toBe(true);
    expect(names.some((n) => /pepsi/i.test(n))).toBe(true);
    for (const n of names) {
      expect(n).toMatch(/zero|cero/i);
      expect(n).not.toMatch(/lima|cherry|vainilla|whisky|sin cafe/i);
    }
    // ordenadas por precio por litro
    const units = alts.map((m) => m.item).map((i) => i.price);
    expect(units.length).toBeGreaterThan(1);
  });
  it('leche entera → otras leches enteras, ninguna desnatada ni sin lactosa', () => {
    const milk = bundledItems().find((i) => i.store === 'mercadona' && i.name === 'Leche entera Asturiana' && /Brik 1 L/.test(i.format ?? ''));
    expect(milk).toBeDefined();
    const alts = matchBundled({ name: milk!.name, brand: milk!.brand, pkg: milk!.pkg, bundledId: milk!.id }, 10).filter((m) => m.kind === 'alternative');
    expect(alts.length).toBeGreaterThan(0);
    for (const m of alts) expect(m.item.name.toLowerCase()).not.toMatch(/desnatada|sin lactosa|semi/);
    expect(alts.some((m) => m.ownLabel)).toBe(true);
  });
});
