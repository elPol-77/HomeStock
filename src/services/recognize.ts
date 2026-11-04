import { scanFromURLAsync } from 'expo-camera';
import { Platform } from 'react-native';

import { allProducts, matchExistingProduct } from '@/data/products';
import { buildRecognitionQuery, certaintyOf, Certainty, scoreCandidate } from '@/domain/recognition';
import { parsePackageSize } from '@/domain/units';

import { bundledToCatalogProduct, matchBundled } from './catalog/bundled';
import { storeName } from './catalog/stores';
import { lookupBarcode, searchCatalog } from './catalog/openFoodFacts';
import { CatalogProduct } from './catalog/types';
import { isOcrAvailable, ocrImage } from './ocr';
import { identifyProductInPhoto, VisionError, visionReady } from './vision';

export interface RecognitionCandidate {
  product: CatalogProduct;
  score: number;
  certainty: Certainty;
  reason: string;
}

export interface RecognitionResult {
  ocrText: string;
  query: string;
  candidates: RecognitionCandidate[];
  /** Explicación honesta del resultado. */
  summary: string;
}

/**
 * Reconocimiento de producto por foto SIN servicios de pago:
 *  1) busca un código de barras en la foto (ML Kit vía expo-camera);
 *  2) lee el texto del envase (OCR en el dispositivo);
 *  3) busca coincidencias en tus productos y en Open Food Facts;
 *  4) puntúa cada candidato y nunca afirma certeza si no la hay.
 */
export async function recognizeProductPhoto(uri: string): Promise<RecognitionResult> {
  // 1) Código de barras visible en la foto: es la identificación más fiable.
  if (Platform.OS !== 'web') {
    try {
      const codes = await scanFromURLAsync(uri, ['ean13', 'ean8', 'upc_a', 'upc_e']);
      const code = codes[0]?.data;
      if (code) {
        const product = await lookupBarcode(code);
        if (product) {
          return {
            ocrText: '',
            query: code,
            candidates: [{ product, score: 0.98, certainty: 'high', reason: `Código de barras ${code} leído en la foto` }],
            summary: 'Producto identificado por su código de barras.',
          };
        }
      }
    } catch {
      // seguir con OCR
    }
  }

  // 2) IA (con sesión iniciada): identifica el producto aunque no se lea bien el texto.
  let aiProblem: string | null = null;
  if (visionReady()) {
    try {
      const ai = await recognizeWithAi(uri);
      if (ai) return ai;
      aiProblem = 'La IA no ha encontrado ningún producto en la foto.';
    } catch (e) {
      aiProblem = e instanceof VisionError ? e.message : 'La IA no ha podido analizar la foto.';
    }
  }

  // 3) Respaldo sin conexión/sin cuenta: lector de texto del móvil.
  if (!isOcrAvailable) {
    return { ocrText: '', query: '', candidates: [], summary: aiProblem ?? 'Inicia sesión para reconocer productos con IA, o escanea el código de barras.' };
  }
  let ocr;
  try {
    ocr = await ocrImage(uri);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ocrText: '', query: '', candidates: [], summary: `${aiProblem ? aiProblem + ' ' : ''}El lector de texto del móvil ha fallado (${detail}).` };
  }
  const q = buildRecognitionQuery(ocr.lines);
  if (!q.ocrText.trim()) {
    return { ocrText: '', query: '', candidates: [], summary: 'No se ha podido leer texto en la foto. Prueba con más luz, de frente y enfocando el nombre del producto.' };
  }

  const candidates: RecognitionCandidate[] = [];

  for (const ean of q.eanCandidates.slice(0, 2)) {
    const p = await lookupBarcode(ean).catch(() => null);
    if (p) candidates.push({ product: p, score: 0.95, certainty: 'high', reason: `Código ${ean} leído en el envase` });
  }

  // Productos que ya tienes en casa (muy probable que vuelvas a comprarlos).
  const local = await allProducts();
  for (const p of local) {
    const cp: CatalogProduct = {
      source: 'local', barcode: p.barcode, name: p.name, brand: p.brand, imageUrl: p.image_url, quantityText: null,
      pkg: p.package_amount && p.package_unit ? { count: p.package_count ?? 1, amount: p.package_amount, unit: p.package_unit } : parsePackageSize(p.name),
      category: p.category, packaging: p.packaging, url: null,
    };
    const score = scoreCandidate(q, cp);
    if (score >= 0.45) candidates.push({ product: cp, score: Math.min(0.97, score + 0.05), certainty: certaintyOf(score + 0.05), reason: 'Coincide con un producto de tu inventario' });
  }

  if (q.query.length >= 3) {
    try {
      const results = await searchCatalog(q.query, 15);
      for (const r of results) {
        const score = scoreCandidate(q, r);
        if (score >= 0.3) candidates.push({ product: r, score, certainty: certaintyOf(score), reason: 'Coincidencia en Open Food Facts por el texto del envase' });
      }
    } catch {
      // sin conexión: solo candidatos locales
    }
  }

  const unique = new Map<string, RecognitionCandidate>();
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    const k = c.product.barcode ?? `${c.product.name}|${c.product.brand}`;
    if (!unique.has(k)) unique.set(k, c);
  }
  const list = [...unique.values()].slice(0, 6);
  const best = list[0];
  let summary: string;
  if (!best) summary = 'No hemos encontrado el producto con seguridad. Puedes crearlo con el texto leído o escanear su código de barras.';
  else if (best.certainty === 'high') summary = 'Coincidencia probable. Revisa los datos antes de guardar.';
  else if (best.certainty === 'medium') summary = 'No estamos seguros. Elige la opción correcta o corrige los datos.';
  else summary = 'Coincidencias poco fiables. Te recomendamos escanear el código de barras o crear el producto a mano.';
  return { ocrText: q.ocrText, query: q.query, candidates: list, summary };
}

const AI_CERTAINTY = { alta: 'high', media: 'medium', baja: 'low' } as const;

/** Identificación con IA + búsqueda del mismo producto en tu casa, en el catálogo del súper y por código. */
async function recognizeWithAi(uri: string): Promise<RecognitionResult | null> {
  const p = await identifyProductInPhoto(uri);
  if (!p) return null;
  const pkg = parsePackageSize(p.size ?? '') ?? parsePackageSize(p.name);
  const label = [p.name, p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : null, p.size].filter(Boolean).join(' ');
  const candidates: RecognitionCandidate[] = [];

  if (p.barcode) {
    const off = await lookupBarcode(p.barcode).catch(() => null);
    if (off) candidates.push({ product: off, score: 0.98, certainty: 'high', reason: `Código ${p.barcode} leído en la foto` });
  }
  const existing = await matchExistingProduct({ name: [p.name, p.brand].filter(Boolean).join(' '), brand: p.brand, barcode: p.barcode, pkg }).catch(() => null);
  if (existing) {
    candidates.push({
      product: {
        source: 'local', barcode: existing.barcode, name: existing.name, brand: existing.brand, imageUrl: existing.image_url, quantityText: null,
        pkg: existing.package_amount && existing.package_unit ? { count: existing.package_count ?? 1, amount: existing.package_amount, unit: existing.package_unit } : null,
        category: existing.category, packaging: existing.packaging, url: null,
      },
      score: 0.96,
      certainty: 'high',
      reason: 'Ya lo tienes en tu inventario',
    });
  }
  for (const m of matchBundled({ name: p.name, brand: p.brand, pkg }, 3)) {
    candidates.push({
      product: bundledToCatalogProduct(m.item),
      score: m.kind === 'identical' ? 0.9 : 0.5,
      certainty: m.kind === 'identical' ? 'high' : 'medium',
      reason: m.kind === 'identical' ? `Mismo producto en el catálogo de ${storeName(m.item.store)}` : `Parecido en ${storeName(m.item.store)}: ${m.reason}`,
    });
  }
  const aiCert = AI_CERTAINTY[p.confidence];
  candidates.push({
    product: { source: 'ai', barcode: p.barcode, name: p.name, brand: p.brand, imageUrl: uri, quantityText: p.size, pkg, category: p.category, packaging: null, url: null },
    score: aiCert === 'high' ? 0.88 : aiCert === 'medium' ? 0.6 : 0.35,
    certainty: aiCert,
    reason: p.evidence ? `Reconocido con IA: ${p.evidence}` : 'Reconocido con IA',
  });

  const unique = new Map<string, RecognitionCandidate>();
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    const k = c.product.barcode ?? c.product.bundledId ?? `${c.product.name}|${c.product.brand}`;
    if (!unique.has(k)) unique.set(k, c);
  }
  const list = [...unique.values()].slice(0, 6);
  const best = list[0];
  const summary =
    best.certainty === 'high'
      ? `Parece «${label}». Revisa los datos antes de guardar.`
      : best.certainty === 'medium'
        ? `Podría ser «${label}». Elige la opción correcta o corrige los datos.`
        : `No está claro; la IA cree que es «${label}». Comprueba los datos o escanea el código de barras.`;
  return { ocrText: label, query: label, candidates: list, summary };
}
