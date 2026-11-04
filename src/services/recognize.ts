import { scanFromURLAsync } from 'expo-camera';
import { Platform } from 'react-native';

import { allProducts } from '@/data/products';
import { buildRecognitionQuery, certaintyOf, Certainty, scoreCandidate } from '@/domain/recognition';
import { parsePackageSize } from '@/domain/units';

import { lookupBarcode, searchCatalog } from './catalog/openFoodFacts';
import { CatalogProduct } from './catalog/types';
import { ocrImage } from './ocr';

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

  const ocr = await ocrImage(uri);
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
