import { normalizeText, textSimilarity } from './text';
import { parsePackageSize, samePackageSize, PackageSize } from './units';

/** Marcas frecuentes en supermercados españoles (ayuda a construir la búsqueda desde el OCR). */
export const KNOWN_BRANDS = [
  'Hacendado', 'Bosque Verde', 'Deliplus', 'Compy', 'Carrefour', 'Auchan', 'Alcampo', 'Milbona', 'Lidl', 'Cien', 'W5', 'Formil',
  'Consum', 'Dia', 'Eroski', 'Pascual', 'Central Lechera Asturiana', 'Puleva', 'Kaiku', 'Danone', 'Activia', 'Coca-Cola', 'Pepsi',
  'Fanta', 'Nestlé', 'Nescafé', 'Cola Cao', 'ColaCao', 'Nocilla', 'Gallo', 'Brillante', 'SOS', 'La Fallera', 'Carbonell', 'Koipe',
  'Ybarra', 'La Española', 'Hojiblanca', 'Calvo', 'Isabel', 'Orlando', 'Hida', 'Ariel', 'Skip', 'Dixan', 'Wipp', 'Mimosín', 'Flor',
  'Fairy', 'Mistol', 'Don Limpio', 'Estrella', 'Colhogar', 'Scottex', 'Renova', 'Font Vella', 'Lanjarón', 'Bezoya', 'Solán de Cabras',
  'Mahou', 'Estrella Galicia', 'Estrella Damm', 'Cruzcampo', 'Bimbo', 'Panrico', 'Gullón', 'Cuétara', 'Fontaneda', 'Kellogg\'s',
  'El Pozo', 'Campofrío', 'Navidul', 'Pescanova', 'Findus', 'Royal', 'Maggi', 'Gallina Blanca', 'Litoral', 'Colgate', 'Signal',
  'Sanex', 'Dove', 'Nivea', 'H&S', 'Pantene', 'Gillette', 'Purina', 'Friskies', 'Pedigree', 'Whiskas', 'Affinity', 'Ultima',
];

export interface RecognitionQuery {
  brand: string | null;
  pkg: PackageSize | null;
  /** Texto de búsqueda propuesto (marca + palabras más relevantes). */
  query: string;
  /** Códigos EAN válidos encontrados en el texto. */
  eanCandidates: string[];
  ocrText: string;
}

/** Valida el dígito de control de un EAN-8/EAN-13/UPC-A. */
export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const NOISE = /^(ingredientes|informacion|valor|energia|grasas|hidratos|proteinas|sal|conservar|consumir|lote|fabricado|envasado|distribuido|www|tel|cad|nutricional|de los cuales|azucares|saturadas|kcal|kj)/;

export function buildRecognitionQuery(lines: string[]): RecognitionQuery {
  const ocrText = lines.join(' ');
  const norm = normalizeText(ocrText);

  const eanCandidates = [...new Set((ocrText.replace(/\s(?=\d)/g, '').match(/\d{8,13}/g) ?? []).filter(isValidEan))];

  let brand: string | null = null;
  for (const b of KNOWN_BRANDS) {
    const nb = normalizeText(b);
    if (new RegExp(`\\b${nb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm)) {
      brand = b;
      break;
    }
  }
  const pkg = parsePackageSize(ocrText);

  // Líneas "de portada": cortas, con letras, sin jerga nutricional, por orden de aparición.
  const words: string[] = [];
  for (const raw of lines) {
    const l = normalizeText(raw);
    if (!l || NOISE.test(l) || l.length > 60) continue;
    for (const w of l.split(' ')) {
      if (w.length < 3 || /\d/.test(w)) continue;
      if (brand && normalizeText(brand).split(' ').includes(w)) continue;
      if (!words.includes(w)) words.push(w);
    }
    if (words.length >= 5) break;
  }
  const query = [brand, ...words.slice(0, 4)].filter(Boolean).join(' ');
  return { brand, pkg, query, eanCandidates, ocrText };
}

export interface CandidateLike {
  name: string;
  brand?: string | null;
  quantityText?: string | null;
  pkg?: PackageSize | null;
}

/**
 * Puntuación 0..1 de lo bien que un producto del catálogo explica el texto leído en la foto.
 * Se usa para ordenar candidatos y para decidir si se puede presentar como "probable".
 */
export function scoreCandidate(q: RecognitionQuery, c: CandidateLike): number {
  const nameSim = textSimilarity(q.ocrText, `${c.name} ${c.brand ?? ''}`);
  // Cobertura: cuántas palabras del nombre del candidato aparecen en el texto OCR.
  const ocrNorm = normalizeText(q.ocrText);
  const nameWords = normalizeText(c.name).split(' ').filter((w) => w.length >= 3);
  const covered = nameWords.length ? nameWords.filter((w) => ocrNorm.includes(w)).length / nameWords.length : 0;
  let score = 0.25 * nameSim + 0.45 * covered;
  if (q.brand && c.brand) {
    const b1 = normalizeText(q.brand);
    const b2 = normalizeText(c.brand);
    score += b2.includes(b1) || b1.includes(b2) ? 0.2 : -0.1;
  }
  const cPkg = c.pkg ?? parsePackageSize(c.quantityText ?? c.name);
  const same = samePackageSize(q.pkg, cPkg);
  if (same === true) score += 0.1;
  if (same === false) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

export type Certainty = 'high' | 'medium' | 'low';

export function certaintyOf(score: number): Certainty {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}
