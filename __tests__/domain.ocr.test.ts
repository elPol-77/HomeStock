import { parseExpiryFromText } from '../src/domain/expiryOcr';
import { expandAbbreviations, parseReceipt, rowsFromBoxes } from '../src/domain/receiptParser';

const TODAY = '2026-11-04';

describe('OCR de fechas de caducidad', () => {
  it('detecta "consumir preferentemente antes del"', () => {
    const r = parseExpiryFromText(['Consumir preferentemente antes del:', '15/11/2026', 'L2310A'], TODAY);
    expect(r.best?.date).toBe('2026-11-15');
    expect(r.best?.kind).toBe('best_before');
    expect(r.needsConfirmation).toBe(false);
  });
  it('detecta caducidad en la misma línea y formato corto', () => {
    const r = parseExpiryFromText(['CAD: 20.11.26'], TODAY);
    expect(r.best?.date).toBe('2026-11-20');
    expect(r.best?.kind).toBe('use_by');
  });
  it('fin de mes con solo mes/año → consumo preferente', () => {
    const r = parseExpiryFromText(['Cons. pref. antes del fin de: 09/2027'], TODAY);
    expect(r.best?.date).toBe('2027-09-30');
    expect(r.best?.kind).toBe('best_before');
    expect(r.best?.monthOnly).toBe(true);
  });
  it('ignora fecha de envasado y lote', () => {
    const r = parseExpiryFromText(['Envasado el 01/11/2026', 'Fecha de caducidad 12/11/2026'], TODAY);
    expect(r.best?.date).toBe('2026-11-12');
    expect(r.candidates.find((c) => c.date === '2026-11-01')).toBeUndefined();
  });
  it('meses con nombre y errores de OCR', () => {
    expect(parseExpiryFromText(['EXP 15 NOV 2026'], TODAY).best?.date).toBe('2026-11-15');
    expect(parseExpiryFromText(['CAD 1O/12/2026'], TODAY).best?.date).toBe('2026-12-10');
  });
  it('pide confirmación si no hay palabra clave', () => {
    const r = parseExpiryFromText(['12/12/2026'], TODAY);
    expect(r.best?.date).toBe('2026-12-12');
    expect(r.needsConfirmation).toBe(true);
  });
  it('no inventa fechas', () => {
    const r = parseExpiryFromText(['Leche semidesnatada', 'Hacendado 1L'], TODAY);
    expect(r.best).toBeNull();
    expect(r.needsConfirmation).toBe(true);
  });
});

describe('Tickets', () => {
  it('ticket estilo Mercadona', () => {
    const lines = [
      'MERCADONA, S.A. A-46103834',
      'C/ MAYOR 1 46001 VALENCIA',
      'TELÉFONO: 963000000',
      '04/11/2026 18:32 OP: 123456',
      'FACTURA SIMPLIFICADA: 2345-012-345678',
      'Descripción P. Unit Importe',
      '2 LECHE SEMI HAC 0,89 1,78',
      '1 ARROZ REDONDO 1,15',
      '1 DETERG LIQ 5,50',
      'PLATANO',
      '0,826 kg 2,49 €/kg 2,06',
      'TOTAL (€) 10,49',
      'TARJETA BANCARIA 10,49',
      'IVA BASE IMPONIBLE (€) CUOTA (€)',
    ];
    const r = parseReceipt(lines);
    expect(r.store).toBe('mercadona');
    expect(r.date).toBe('2026-11-04');
    expect(r.total).toBe(10.49);
    expect(r.items).toHaveLength(4);
    expect(r.items[0]).toMatchObject({ quantity: 2, unitPrice: 0.89, totalPrice: 1.78 });
    expect(r.items[0].name).toBe('Leche semidesnatada Hacendado');
    expect(r.items[3]).toMatchObject({ weightKg: 0.826, totalPrice: 2.06 });
    expect(r.totalMatches).toBe(true);
  });
  it('ticket estilo Lidl con cantidad en línea aparte y descuento', () => {
    const lines = [
      'LIDL Supermercados S.A.U.',
      'EUR',
      'Leche semidesnatada 1,78 A',
      '2 x 0,89',
      'Huevos L docena 2,35 A',
      'Descuento Lidl Plus -0,30',
      'Papel higienico 12r 3,99 B',
      'Total 7,82',
      '03.11.26 19:01',
    ];
    const r = parseReceipt(lines);
    expect(r.store).toBe('lidl');
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ quantity: 2, unitPrice: 0.89 });
    expect(r.items[1].discount).toBe(0.3);
    expect(r.computedTotal).toBe(7.82);
    expect(r.totalMatches).toBe(true);
    expect(r.date).toBe('2026-11-03');
  });
  it('avisa cuando el total no cuadra', () => {
    const r = parseReceipt(['CONSUM', 'ACEITE OLIVA 4,95', 'PASTA ESPAG 0,85', 'TOTAL 9,99']);
    expect(r.totalMatches).toBe(false);
  });
  it('expande abreviaturas', () => {
    expect(expandAbbreviations('PAP HIG 12R')).toBe('Papel higiénico 12r');
  });
  it('reconstruye filas desde cajas OCR separadas en columnas', () => {
    const rows = rowsFromBoxes([
      { text: 'LECHE SEMI', top: 100, left: 10, height: 20 },
      { text: '0,89', top: 102, left: 300, height: 20 },
      { text: 'ARROZ', top: 130, left: 10, height: 20 },
      { text: '1,15', top: 129, left: 300, height: 20 },
    ]);
    expect(rows).toEqual(['LECHE SEMI 0,89', 'ARROZ 1,15']);
  });
});
