import { normalizeText, parseDecimal } from './text';

/** Unidades con las que se cuentan existencias o se describe un envase. */
export type Unit = 'ud' | 'g' | 'kg' | 'ml' | 'cl' | 'l';
export type BaseUnit = 'ud' | 'g' | 'ml';

export const UNIT_LABELS: Record<Unit, string> = {
  ud: 'unidades',
  g: 'gramos',
  kg: 'kilogramos',
  ml: 'mililitros',
  cl: 'centilitros',
  l: 'litros',
};

export const UNIT_SHORT: Record<Unit, string> = { ud: 'ud', g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'L' };

export interface PackageSize {
  /** Número de envases en el pack (6 x 1 L → 6). */
  count: number;
  /** Cantidad de cada envase. */
  amount: number;
  unit: Unit;
}

const UNIT_ALIASES: Record<string, Unit> = {
  ud: 'ud', uds: 'ud', u: 'ud', unidad: 'ud', unidades: 'ud', rollos: 'ud', rollo: 'ud', lavados: 'ud',
  capsulas: 'ud', bolsitas: 'ud', piezas: 'ud', pastillas: 'ud',
  g: 'g', gr: 'g', grs: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', mililitros: 'ml',
  cl: 'cl',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
};

export function toUnit(raw: string | null | undefined): Unit | null {
  if (!raw) return null;
  return UNIT_ALIASES[normalizeText(raw).replace(/\./g, '')] ?? null;
}

/**
 * Extrae el tamaño de envase de un texto libre: "1 L", "6 x 1 l", "pack 4 x 125 g", "1,5kg", "500ml", "12 rollos".
 * Devuelve null si no hay un tamaño reconocible.
 */
export function parsePackageSize(text: string | null | undefined): PackageSize | null {
  if (!text) return null;
  const t = normalizeText(text).replace(/(\d),(\d)/g, '$1.$2');
  const unitGroup = '(kg|kgs|kilos?|g|gr|grs|gramos|ml|cl|l|lt|lts|litros?|ud|uds|unidades|rollos?|lavados|capsulas|bolsitas|piezas|pastillas)';
  // "6 x 1 l", "6 botellas x 1.5 l", "3 mini briks x 200 ml"
  const multi = new RegExp(`(\\d+)\\s*(?:[a-z]+\\s+){0,2}x\\s*(\\d+(?:\\.\\d+)?)\\s*${unitGroup}\\b`);
  const m1 = t.match(multi);
  if (m1) {
    const unit = toUnit(m1[3]);
    if (unit) return { count: Number(m1[1]), amount: Number(m1[2]), unit };
  }
  const single = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unitGroup}\\b`);
  const m2 = t.match(single);
  if (m2) {
    const unit = toUnit(m2[2]);
    if (unit === 'ud') {
      // "Caja 16 cápsulas (112 g)", "Paquete 20 ud. (200 g)": el peso/volumen total permite comparar por kg o litro.
      const rest = t.slice((m2.index ?? 0) + m2[0].length);
      const w = rest.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l)\b/);
      const wu = w ? toUnit(w[2]) : null;
      if (w && wu) return { count: 1, amount: Number(w[1]), unit: wu };
    }
    if (unit) return { count: 1, amount: Number(m2[1]), unit };
  }
  return null;
}

/** Convierte una cantidad a su unidad base (g, ml o ud). */
export function toBase(amount: number, unit: Unit): { value: number; base: BaseUnit } {
  switch (unit) {
    case 'kg':
      return { value: amount * 1000, base: 'g' };
    case 'g':
      return { value: amount, base: 'g' };
    case 'l':
      return { value: amount * 1000, base: 'ml' };
    case 'cl':
      return { value: amount * 10, base: 'ml' };
    case 'ml':
      return { value: amount, base: 'ml' };
    default:
      return { value: amount, base: 'ud' };
  }
}

/** Contenido total del envase en unidad base. */
export function packageTotalBase(pkg: PackageSize): { value: number; base: BaseUnit } {
  const b = toBase(pkg.amount, pkg.unit);
  return { value: b.value * pkg.count, base: b.base };
}

/**
 * Precio por kg, litro o unidad. Devuelve null si no se puede calcular.
 * Ej.: 1,29 € por 6 x 1 L → 0,215 €/L
 */
export function unitPrice(price: number, pkg: PackageSize | null): { value: number; per: 'kg' | 'l' | 'ud' } | null {
  if (!pkg || !(price > 0)) return null;
  const total = packageTotalBase(pkg);
  if (!(total.value > 0)) return null;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  if (total.base === 'g') return { value: r4((price / total.value) * 1000), per: 'kg' };
  if (total.base === 'ml') return { value: r4((price / total.value) * 1000), per: 'l' };
  return { value: r4(price / total.value), per: 'ud' };
}

export function formatUnitPrice(up: { value: number; per: 'kg' | 'l' | 'ud' } | null): string {
  if (!up) return '';
  const per = up.per === 'l' ? 'L' : up.per;
  return `${up.value.toFixed(2).replace('.', ',')} €/${per}`;
}

export function formatPackage(pkg: PackageSize | null): string {
  if (!pkg) return '';
  const amount = Number.isInteger(pkg.amount) ? String(pkg.amount) : String(pkg.amount).replace('.', ',');
  const base = `${amount} ${UNIT_SHORT[pkg.unit]}`;
  return pkg.count > 1 ? `${pkg.count} x ${base}` : base;
}

/** Dos envases son del mismo tamaño si su contenido total coincide (±2 %). */
export function samePackageSize(a: PackageSize | null, b: PackageSize | null): boolean | null {
  if (!a || !b) return null;
  const ta = packageTotalBase(a);
  const tb = packageTotalBase(b);
  if (ta.base !== tb.base) return false;
  const max = Math.max(ta.value, tb.value);
  return Math.abs(ta.value - tb.value) <= max * 0.02;
}

/** Formatea una cantidad de existencias ("3 ud", "1,5 kg"). */
export function formatQuantity(q: number, unit: Unit): string {
  const n = Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0+$/, '').replace('.', ',');
  return `${n} ${UNIT_SHORT[unit]}`;
}

export { parseDecimal };
