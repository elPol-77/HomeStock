import { normalizeText } from './text';

/**
 * ¿Sirve un producto en lugar de otro? (Coca-Cola Zero ↔ Pepsi Zero ↔ Cola Cero de Consum).
 * Se compara el TIPO de producto, quitando la marca, el envase y el tamaño, y exigiendo que coincidan
 * los atributos que cambian lo que compras: zero/light, sin cafeína, entera/desnatada, sin lactosa,
 * sabor… Así una Coca-Cola Zero nunca se propone como alternativa a una Coca-Cola normal.
 */

/** Marcas propias de cada cadena (marca blanca). */
const OWN_LABELS = [
  'hacendado', 'deliplus', 'bosque verde', 'compy', 'solcare', // Mercadona
  'consum', 'kyrei', 'kyrey', 'equilibrio consum', // Consum
  'dia', 'dia%', 'bonte', 'basic dia', 'as', 'dia delicious', // DIA
  'carrefour', 'carrefour bio', 'carrefour classic', 'auchan', 'alcampo', 'lidl', 'milbona', 'pilos', 'eroski', 'aldi',
];

export function isOwnLabel(brand: string | null | undefined): boolean {
  if (!brand) return false;
  const b = normalizeText(brand);
  return OWN_LABELS.some((o) => b === o || b.startsWith(`${o} `));
}

/** Palabras que no describen el producto (envase, relleno). */
const FILLER = new Set(
  'de del la el los las en con y x para al a por o u sin_x pack bipack tripack indivisible botella botellas lata latas brik briks brick bricks pet vidrio frasco tarro bote garrafa bolsa bolsita bolsitas paquete caja estuche doypack bandeja malla granel unidad unidades ud uds mini maxi familiar formato ahorro economico gratis oferta nuevo envase tapon abre facil'.split(' '),
);

/** Marcas que en el habla funcionan como nombre del producto. */
const BRAND_AS_TYPE: [RegExp, string][] = [
  [/\bcoca ?cola\b/, 'refresco cola'],
  [/\bpepsi( ?cola)?\b/, 'refresco cola'],
  [/\bpepsi max\b/, 'refresco cola zero'],
  [/\bfanta naranja\b/, 'refresco naranja'],
  [/\bfanta limon\b/, 'refresco limon'],
  [/\bnestea\b/, 'refresco te'],
  [/\b(cola ?cao|nesquik)\b/, 'cacao soluble'],
  [/\b(nocilla|nutella)\b/, 'crema cacao'],
  [/\bphiladelphia\b/, 'queso crema'],
  [/\bactimel\b/, 'leche fermentada'],
];

/** Grupos de atributos excluyentes: si uno lo tiene y el otro no (o tiene otro valor), no son equivalentes. */
const ATTRS: Record<string, [RegExp, string][]> = {
  azucar: [
    [/\b(zero zero|cero cero)\b/, 'zero'],
    [/\b(zero|cero|sin azucar(es)?( anadidos?)?|0 ?%? azucar|max)\b/, 'zero'],
    [/\blight\b/, 'light'],
  ],
  cafeina: [
    [/\b(zero zero|cero cero)\b/, 'sin'],
    [/\b(sin cafeina|descafeinad[oa])\b/, 'sin'],
  ],
  grasa: [
    [/\bsemi ?desnatad[oa]s?\b/, 'semi'],
    [/\bdesnatad[oa]s?\b/, 'desnatada'],
    [/\bentera?s?\b/, 'entera'],
    [/\b0 ?%? (materia )?grasa\b/, 'desnatada'],
  ],
  lactosa: [[/\bsin lactosa\b/, 'sin']],
  gluten: [[/\bsin gluten\b/, 'sin']],
  integral: [[/\bintegral(es)?\b/, 'si']],
  gas: [
    [/\bcon gas\b/, 'con'],
    [/\bsin gas\b/, 'sin'],
  ],
  conserva: [
    [/\b(aceite (de )?oliva|oliva virgen)\b/, 'oliva'],
    [/\bgirasol\b/, 'girasol'],
    [/\bal natural\b/, 'natural'],
    [/\bescabeche\b/, 'escabeche'],
  ],
};

const FLAVORS = new Set(
  'naranja limon lima cherry cereza vainilla fresa platano chocolate cacao melocoton pina mango manzana uva frutos rojos coco cafe caramelo menta tropical multifruta mandarina pomelo maracuya kiwi sandia melon arandanos frambuesa'.split(' '),
);

export interface ProductType {
  /** Palabras que describen qué es (sin marca, envase, tamaño ni atributos). */
  words: string[];
  attrs: Record<string, string>;
  flavors: string[];
}

function stripSizes(s: string): string {
  return s
    .replace(/\b\d+\s*x\s*\d+([.,]\d+)?\s*(kg|g|gr|grs|ml|cl|l|lt|litros?)\b/g, ' ')
    .replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|grs|ml|cl|l|lt|litros?|ud|uds|unidades|rollos|lavados|capsulas|sobres|piezas)\b/g, ' ')
    .replace(/\b\d+\s*x\b/g, ' ');
}

export function productType(name: string, brand?: string | null): ProductType {
  let n = ` ${normalizeText(name).replace(/[-/]/g, ' ')} `;
  for (const [rx, rep] of BRAND_AS_TYPE) if (rx.test(n)) n = `${n} ${rep} `;
  // La marca no describe el producto.
  if (brand) {
    const b = normalizeText(brand).replace(/[-/]/g, ' ').trim();
    if (b.length >= 2) n = n.split(` ${b} `).join(' ');
  }
  n = stripSizes(n);
  const attrs: Record<string, string> = {};
  // Primero se detectan todos los atributos sobre el texto completo y después se quitan.
  for (const [group, rules] of Object.entries(ATTRS)) {
    for (const [rx, value] of rules) {
      if (rx.test(n)) {
        attrs[group] = value;
        break;
      }
    }
  }
  for (const rules of Object.values(ATTRS)) for (const [rx] of rules) n = n.replace(new RegExp(rx.source, 'g'), ' ');
  const words: string[] = [];
  const flavors: string[] = [];
  for (const w of n.split(/\s+/)) {
    if (w.length < 3 || FILLER.has(w) || /\d/.test(w)) continue;
    if (FLAVORS.has(w)) flavors.push(w);
    else if (!['coca', 'pepsi', 'cola'].includes(w) || w === 'cola') words.push(w.replace(/s$/, ''));
  }
  return { words: [...new Set(words)], attrs, flavors: [...new Set(flavors)].sort() };
}

/**
 * Parecido entre dos tipos de producto (0-1). 0 si algún atributo o sabor no coincide.
 * Hace falta compartir casi todas las palabras: «Refresco cola» ≈ «Refresco de cola», pero
 * «Refresco cola» ≠ «Combinado whisky cola».
 */
export function typeSimilarity(a: ProductType, b: ProductType): number {
  for (const g of Object.keys(ATTRS)) if ((a.attrs[g] ?? '') !== (b.attrs[g] ?? '')) return 0;
  if (a.flavors.join(' ') !== b.flavors.join(' ')) return 0;
  if (a.words.length === 0 || b.words.length === 0) return 0;
  const sb = new Set(b.words);
  const inter = a.words.filter((w) => sb.has(w)).length;
  if (inter === 0) return 0;
  // Coeficiente de Sørensen-Dice: tolera una palabra de más («Refresco cola» vs «Refresco cola regular»).
  const dice = (2 * inter) / (a.words.length + b.words.length);
  if (dice >= EQUIVALENT_THRESHOLD) return dice;
  // Submarcas en el nombre («Atún claro … Dia Mari Marinera»): si uno contiene todo el otro y solo
  // sobran un par de palabras que no cambian el tipo de producto, también vale.
  const [short, long] = a.words.length <= b.words.length ? [a.words, b.words] : [b.words, a.words];
  const extras = long.filter((w) => !short.includes(w));
  if (short.length >= 2 && inter === short.length && extras.length <= 2 && !extras.some((w) => TYPE_CHANGERS.has(w))) return EQUIVALENT_THRESHOLD;
  return dice;
}

/** Palabras que convierten un producto en otro distinto aunque compartan el resto («cola» → «combinado whisky cola»). */
const TYPE_CHANGERS = new Set(
  'combinado whisky ron vodka ginebra licor cerveza vino helado polo granizado bizcocho galleta galletas barrita gominola caramelo chicle salsa crema pate mousse tarta pastel relleno rellenos bombon bombones cereales snack chip chips aperitivo infusion bebida batido yogur postre natilla flan sopa caldo pure tortilla empanada pizza bocadillo sandwich ensalada congelado precocinado rebozado empanado ahumado'.split(' '),
);

export const EQUIVALENT_THRESHOLD = 0.7;
