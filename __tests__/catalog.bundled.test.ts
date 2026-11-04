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
