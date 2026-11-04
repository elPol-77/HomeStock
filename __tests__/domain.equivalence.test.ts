import { EQUIVALENT_THRESHOLD, isOwnLabel, productType, typeSimilarity } from '@/domain/equivalence';

const sim = (a: [string, string | null], b: [string, string | null]) => typeSimilarity(productType(...a), productType(...b));
const eq = (a: [string, string | null], b: [string, string | null]) => sim(a, b) >= EQUIVALENT_THRESHOLD;

describe('equivalencias entre marcas', () => {
  it('Coca-Cola Zero ≈ Pepsi Zero ≈ cola cero de marca blanca', () => {
    expect(eq(['Coca-Cola Zero 2 L', 'Coca-Cola'], ['Refresco Cola Zero Botella Pepsi-cola', 'Pepsi-cola'])).toBe(true);
    expect(eq(['Refresco Cola Zero Botella Coca-cola', 'Coca-cola'], ['Refresco Cola Cero Botella Consum', 'Consum'])).toBe(true);
    expect(eq(['Pepsi Max 1,5 L', 'Pepsi'], ['Refresco Cola Zero Lata Coca-cola', 'Coca-cola'])).toBe(true);
  });
  it('no mezcla normal con zero, ni sabores, ni sin cafeína', () => {
    expect(eq(['Refresco Cola Botella Coca-cola', 'Coca-cola'], ['Refresco Cola Zero Botella Coca-cola', 'Coca-cola'])).toBe(false);
    expect(eq(['Refresco Cola Zero Lata Coca-cola', 'Coca-cola'], ['Refresco Cola Zero Lima Lata Pepsi-cola', 'Pepsi-cola'])).toBe(false);
    expect(eq(['Refresco Cola Zero Lata Coca-cola', 'Coca-cola'], ['Refresco Cola Zero Zero Lata Coca-cola', 'Coca-cola'])).toBe(false);
    expect(eq(['Refresco Cola Lata Coca-cola', 'Coca-cola'], ['Combinado Whisky Cola Lata Coca-cola', 'Coca-cola'])).toBe(false);
  });
  it('leche: entera con entera, nunca con desnatada ni sin lactosa', () => {
    expect(eq(['Leche entera Asturiana', 'Asturiana'], ['Leche entera Hacendado', 'Hacendado'])).toBe(true);
    expect(eq(['Leche entera Hacendado', 'Hacendado'], ['Leche semidesnatada Hacendado', 'Hacendado'])).toBe(false);
    expect(eq(['Leche entera Hacendado', 'Hacendado'], ['Leche entera sin lactosa Hacendado', 'Hacendado'])).toBe(false);
  });
  it('reconoce las marcas blancas', () => {
    expect(isOwnLabel('Hacendado')).toBe(true);
    expect(isOwnLabel('Consum')).toBe(true);
    expect(isOwnLabel('Pepsi-cola')).toBe(false);
    expect(isOwnLabel(null)).toBe(false);
  });
});

describe('conservas', () => {
  it('atún en oliva no es atún en girasol', () => {
    expect(eq(['Atún Claro en Aceite de Oliva Campos', 'Campos'], ['Atún Claro Aceite Girasol Pack 3+1 Calvo', 'Calvo'])).toBe(false);
    expect(eq(['Atún Claro en Aceite de Oliva Campos', 'Campos'], ['Atún claro en aceite de oliva Dia Mari Marinera', 'Dia'])).toBe(true);
  });
});
