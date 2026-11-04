jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

import { parseVisionResponse } from '@/services/vision';

describe('respuesta de la IA de visión', () => {
  it('valida, normaliza y une duplicados', () => {
    const items = parseVisionResponse(
      JSON.stringify({
        items: [
          { name: 'bebida de almendras sin azúcar', brand: 'Consum', count: 1, size: '1 L', category: 'Bebidas', confidence: 'alta', evidence: 'Se lee CONSUM ALMENDRAS' },
          { name: 'Coca-Cola', brand: 'Coca-Cola', count: 1, size: '2 L', category: 'Bebidas', confidence: 'alta' },
          { name: 'Tomates', brand: null, count: 4, category: 'Frutas y verduras', confidence: 'media' },
          { name: 'Tomates', brand: 'null', count: 2, category: 'Frutas y verduras', confidence: 'media' },
          { name: 'Natillas de chocolate', count: 99, category: 'Postres', confidence: 'quizá' },
          { name: '', count: 1, category: 'Otros', confidence: 'baja' },
        ],
      }),
    );
    expect(items).toHaveLength(4);
    expect(items[0].name).toBe('Bebida de almendras sin azúcar');
    const tomates = items.find((i) => i.name === 'Tomates')!;
    expect(tomates.count).toBe(6);
    expect(tomates.brand).toBeNull();
    const natillas = items.find((i) => i.name.startsWith('Natillas'))!;
    expect(natillas.category).toBe('Otros'); // categoría desconocida → Otros
    expect(natillas.confidence).toBe('baja');
    expect(natillas.count).toBe(48); // límite razonable
  });

  it('acepta JSON envuelto en texto y rechaza respuestas sin lista', () => {
    expect(parseVisionResponse('Aquí tienes: {"items":[{"name":"Limones","count":3,"category":"Frutas y verduras","confidence":"alta"}]}')).toHaveLength(1);
    expect(() => parseVisionResponse('no sé')).toThrow();
    expect(() => parseVisionResponse('{"foo":1}')).toThrow();
  });
});
