import { ISODate, isValidISODate } from './dates';
import { normalizeText, parseDecimal, sentenceCase } from './text';

export type StoreChain =
  | 'mercadona' | 'consum' | 'lidl' | 'carrefour' | 'alcampo' | 'dia' | 'aldi' | 'eroski' | 'hipercor' | 'bonpreu' | 'gadis' | 'ahorramas' | 'otro';

export interface ReceiptItem {
  rawName: string;
  name: string;
  quantity: number;
  /** kg si el artículo se vende al peso. */
  weightKg: number | null;
  unitPrice: number | null;
  totalPrice: number;
  /** Descuento aplicado (valor positivo). */
  discount: number;
  /** 0..1 — cuán seguro es que la línea es un artículo bien leído. */
  confidence: number;
}

export interface ParsedReceipt {
  store: StoreChain | null;
  date: ISODate | null;
  items: ReceiptItem[];
  total: number | null;
  /** Suma de artículos menos descuentos. */
  computedTotal: number;
  /** true si el total impreso coincide con la suma (±0,05 €). */
  totalMatches: boolean | null;
  /** Líneas que parecían artículos pero no se pudieron interpretar. */
  unparsedLines: string[];
}

const STORE_PATTERNS: [StoreChain, RegExp][] = [
  ['mercadona', /mercadona/],
  ['consum', /\bconsum\b/],
  ['lidl', /\blidl\b/],
  ['carrefour', /carrefour/],
  ['alcampo', /alcampo|auchan/],
  ['dia', /\bdia\b.*(retail|%|supermercado)|dia retail|supermercados dia|distribuidora internacional de alimentacion/],
  ['aldi', /\baldi\b/],
  ['eroski', /eroski/],
  ['hipercor', /hipercor|el corte ingles/],
  ['bonpreu', /bonpreu|bon preu/],
  ['gadis', /\bgadis\b/],
  ['ahorramas', /ahorramas/],
];

export const STORE_NAMES: Record<StoreChain, string> = {
  mercadona: 'Mercadona', consum: 'Consum', lidl: 'Lidl', carrefour: 'Carrefour', alcampo: 'Alcampo', dia: 'DIA',
  aldi: 'Aldi', eroski: 'Eroski', hipercor: 'Hipercor', bonpreu: 'Bonpreu', gadis: 'Gadis', ahorramas: 'Ahorramas', otro: 'Otro',
};

export function detectStore(lines: string[]): StoreChain | null {
  const head = normalizeText(lines.slice(0, 12).join(' '));
  for (const [chain, re] of STORE_PATTERNS) if (re.test(head)) return chain;
  const all = normalizeText(lines.join(' '));
  for (const [chain, re] of STORE_PATTERNS) if (re.test(all)) return chain;
  return null;
}

/** Abreviaturas frecuentes en tickets españoles. Se aplican por palabra completa. */
const ABBREVIATIONS: Record<string, string> = {
  semi: 'semidesnatada', semid: 'semidesnatada', desn: 'desnatada', ent: 'entera', lech: 'leche', lch: 'leche',
  hac: 'Hacendado', hacend: 'Hacendado', yog: 'yogur', yogu: 'yogur', nat: 'natural', azuc: 'azúcar', s: 'sin',
  pap: 'papel', hig: 'higiénico', deterg: 'detergente', det: 'detergente', liq: 'líquido', aceit: 'aceite', ac: 'aceite',
  oliv: 'oliva', ol: 'oliva', v: 'virgen', vext: 'virgen extra', ext: 'extra', ques: 'queso', pech: 'pechuga', poll: 'pollo',
  tom: 'tomate', ceb: 'cebolla', pat: 'patata', zum: 'zumo', nar: 'naranja', manz: 'manzana', plat: 'plátano',
  pan: 'pan', hue: 'huevos', huev: 'huevos', arr: 'arroz', redon: 'redondo', mac: 'macarrones', espag: 'espaguetis',
  gall: 'galletas', cerv: 'cerveza', ref: 'refresco', agu: 'agua', mant: 'mantequilla', jam: 'jamón', serr: 'serrano',
  cocid: 'cocido', frut: 'fruta', verd: 'verdura', limp: 'limpiador', suav: 'suavizante', lavav: 'lavavajillas',
  champ: 'champú', gel: 'gel', dent: 'dentífrico', pañ: 'pañales', bols: 'bolsa', cong: 'congelado', fresc: 'fresco',
  integ: 'integral', choc: 'chocolate', cafe: 'café', molid: 'molido', sal: 'sal', azucar: 'azúcar',
};

export function expandAbbreviations(raw: string): string {
  const words = raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => {
      const key = normalizeText(w).replace(/\./g, '');
      if (ABBREVIATIONS[key] && (w.endsWith('.') || w === w.toUpperCase() || key.length <= 6)) return ABBREVIATIONS[key];
      return w.toLowerCase();
    });
  return sentenceCase(words.join(' ')).replace(/\bhacendado\b/i, 'Hacendado');
}

const SKIP = [
  /\btotal\b/, /subtotal/, /\biva\b/, /base imp/, /\bcuota\b/, /tarjeta/, /efectivo/, /\bcambio\b/, /entregado/, /\bnif\b/,
  /\bcif\b/, /\btel[eé]?f?\b/, /factura/, /\bop\b/, /datafono/, /\bvisa\b/, /mastercard/, /contactless/, /\baut\b/,
  /\bimporte\b/, /\ba pagar\b/, /\bdevoluc/, /gracias/, /\bhora\b/, /\bcaja\b/, /\btique\b|\bticket\b/, /n[ºo°] ?art/,
  /articulos/, /\bcupon(es)?\b/, /puntos/, /\bc\.?p\.?\s?\d{5}\b/, /\bavda?\b|\bcalle\b|\bc\//, /www\./, /s\.a\.|s\.l\./,
  /descripcion/, /\bp\.? ?unit/, /\bimp\.?\b/, /\btarj\b/, /\bpendiente\b/, /\bvendedor\b/, /bancaria/,
];

const DISCOUNT = /(dto|descuento|ahorro|promo|oferta|rebaja|2a ud|2ª ud|cupon|bonif)/;

const PRICE_AT_END = /(-?\d{1,4}[.,]\d{2})\s*(?:€|eur)?\s*[a-e*]?\s*$/i;
const QTY_TIMES_PRICE = /^\s*(\d{1,3})\s*[xX×*]\s*(\d{1,4}[.,]\d{2})\b/;
const WEIGHT_LINE = /(\d{1,3}[.,]\d{1,3})\s*kg\s*[xX×*]?\s*(\d{1,4}[.,]\d{2})\s*(?:€\s*)?\/\s*kg/i;

function findTotal(lines: string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = normalizeText(lines[i]);
    if (/\btotal\b|a pagar|importe total/.test(t) && !/subtotal|total art|base/.test(t)) {
      const m = lines[i].match(/(\d{1,5}[.,]\d{2})/g);
      if (m) return parseDecimal(m[m.length - 1]);
      const next = lines[i + 1]?.match(/^\s*(\d{1,5}[.,]\d{2})/);
      if (next) return parseDecimal(next[1]);
    }
  }
  return null;
}

export function findReceiptDate(lines: string[]): ISODate | null {
  for (const line of lines) {
    const m = line.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (isValidISODate(iso)) return iso;
    }
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Interpreta las líneas OCR de un ticket. Las líneas deben venir ordenadas de arriba abajo,
 * idealmente reconstruidas por fila (nombre y precio en la misma línea).
 */
export function parseReceipt(rawLines: string[]): ParsedReceipt {
  const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 0);
  const store = detectStore(lines);
  const date = findReceiptDate(lines);
  const total = findTotal(lines);
  const items: ReceiptItem[] = [];
  const unparsedLines: string[] = [];

  // Las líneas de artículos suelen empezar tras la cabecera "DESCRIPCIÓN" o tras la fecha, y acabar en TOTAL.
  let start = lines.findIndex((l) => /descripci|art[ií]culo|p\.? ?unit/i.test(l));
  if (start < 0) start = 0;
  let end = lines.findIndex((l, i) => i > start && /^\s*total\b|\btotal\s*\(?€|\btotal\s+compra|^\s*a pagar/i.test(normalizeText(l)));
  if (end < 0) end = lines.length;

  let pendingQty: { qty: number; unit: number } | null = null;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    const norm = normalizeText(line);

    // "2 x 0,89" en línea propia → se aplica al artículo anterior (Lidl/Carrefour) o siguiente.
    const qtp = line.match(QTY_TIMES_PRICE);
    if (qtp && !/[a-z]{3,}/i.test(line.replace(QTY_TIMES_PRICE, ''))) {
      const qty = Number(qtp[1]);
      const unit = parseDecimal(qtp[2]);
      const last = items[items.length - 1];
      if (last && last.quantity === 1 && Math.abs(last.totalPrice - qty * unit) < 0.02) {
        last.quantity = qty;
        last.unitPrice = unit;
      } else {
        pendingQty = { qty, unit };
      }
      continue;
    }

    // Línea de peso "0,826 kg x 2,49 €/kg 2,06"
    const w = line.match(WEIGHT_LINE);
    if (w) {
      const kg = parseDecimal(w[1]);
      const perKg = parseDecimal(w[2]);
      const priceEnd = line.replace(WEIGHT_LINE, '').match(PRICE_AT_END);
      const totalPrice = priceEnd ? parseDecimal(priceEnd[1]) : round2(kg * perKg);
      const last = items[items.length - 1];
      if (last && last.totalPrice === 0) {
        last.weightKg = kg;
        last.unitPrice = perKg;
        last.totalPrice = totalPrice;
        last.confidence = 0.8;
      } else if (last && Math.abs(last.totalPrice - totalPrice) < 0.02) {
        last.weightKg = kg;
        last.unitPrice = perKg;
      } else if (last && !last.weightKg) {
        last.weightKg = kg;
        last.unitPrice = perKg;
      }
      continue;
    }

    if (SKIP.some((r) => r.test(norm))) continue;

    const priceMatch = line.match(PRICE_AT_END);

    // Descuentos
    if (DISCOUNT.test(norm) || (priceMatch && priceMatch[1].startsWith('-'))) {
      if (priceMatch && items.length > 0) {
        const value = Math.abs(parseDecimal(priceMatch[1]));
        items[items.length - 1].discount = round2(items[items.length - 1].discount + value);
      }
      continue;
    }

    if (!priceMatch) {
      // Nombre sin precio: puede ser un artículo al peso cuyo precio va en la línea siguiente.
      const letters = line.replace(/[^a-záéíóúñ]/gi, '');
      if (letters.length >= 3 && /^\s*\d{0,2}\s*[a-záéíóúñ]/i.test(line) && i + 1 < end && WEIGHT_LINE.test(lines[i + 1])) {
        const qm = line.match(/^\s*(\d{1,2})\s+(.*)$/);
        const rawName = (qm ? qm[2] : line).trim();
        items.push({ rawName, name: expandAbbreviations(rawName), quantity: 1, weightKg: null, unitPrice: null, totalPrice: 0, discount: 0, confidence: 0.5 });
      } else if (letters.length >= 4) {
        unparsedLines.push(line);
      }
      continue;
    }

    const totalPrice = parseDecimal(priceMatch[1]);
    let body = line.slice(0, priceMatch.index).trim();
    // Precio unitario previo: "2 YOGUR GRIEGO 1,20 2,40"
    let unitPriceVal: number | null = null;
    const unitAtEnd = body.match(/(\d{1,4}[.,]\d{2})\s*$/);
    if (unitAtEnd) {
      unitPriceVal = parseDecimal(unitAtEnd[1]);
      body = body.slice(0, unitAtEnd.index).trim();
    }
    let quantity = 1;
    const qm = body.match(/^(\d{1,2})\s+(.+)$/);
    if (qm) {
      quantity = Number(qm[1]);
      body = qm[2];
    }
    const lettersInBody = body.replace(/[^a-záéíóúñ]/gi, '').length;
    if (lettersInBody < 2 || !(totalPrice > 0) || totalPrice > 500) {
      unparsedLines.push(line);
      continue;
    }
    if (pendingQty && Math.abs(pendingQty.qty * pendingQty.unit - totalPrice) < 0.02) {
      quantity = pendingQty.qty;
      unitPriceVal = pendingQty.unit;
    }
    pendingQty = null;

    let confidence = 0.75;
    if (unitPriceVal != null) {
      if (Math.abs(unitPriceVal * quantity - totalPrice) < 0.02) confidence = 0.92;
      else confidence = 0.55;
    } else if (quantity > 1) {
      unitPriceVal = round2(totalPrice / quantity);
    } else {
      unitPriceVal = totalPrice;
    }
    if (/[^\w\sáéíóúñ.,%/'-]/i.test(body)) confidence -= 0.15;

    items.push({
      rawName: body,
      name: expandAbbreviations(body),
      quantity,
      weightKg: null,
      unitPrice: unitPriceVal,
      totalPrice,
      discount: 0,
      confidence: Math.max(0.2, confidence),
    });
  }

  const valid = items.filter((it) => it.totalPrice > 0);
  const computedTotal = round2(valid.reduce((s, it) => s + it.totalPrice - it.discount, 0));
  const totalMatches = total == null ? null : Math.abs(total - computedTotal) <= 0.05;
  return { store, date, items: valid, total, computedTotal, totalMatches, unparsedLines };
}

/**
 * Reconstruye filas a partir de bloques OCR con posición (cuando el OCR separa
 * la columna de nombres de la columna de precios).
 */
export interface OcrLineBox {
  text: string;
  top: number;
  left: number;
  height: number;
}

export function rowsFromBoxes(boxes: OcrLineBox[]): string[] {
  const sorted = [...boxes].sort((a, b) => a.top - b.top);
  const rows: OcrLineBox[][] = [];
  for (const b of sorted) {
    const centre = b.top + b.height / 2;
    const row = rows.find((r) => {
      const ref = r[0];
      const refCentre = ref.top + ref.height / 2;
      return Math.abs(refCentre - centre) <= Math.max(ref.height, b.height) * 0.55;
    });
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows.map((r) => r.sort((a, b) => a.left - b.left).map((b) => b.text).join(' '));
}
