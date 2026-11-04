import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { CATEGORIES } from '@/data/types';

/**
 * Reconocimiento de varios productos en una foto (nevera, despensa, compra en la mesa) con Gemini.
 * Usa la clave personal del usuario en el plan gratuito de Google AI Studio: la clave se guarda cifrada
 * en el móvil (SecureStore) y la foto se envía directamente a Google, reducida a 1600 px.
 * El resultado son PROPUESTAS: el usuario confirma cada producto antes de guardarlo.
 */

const KEY_STORE = 'homestock.gemini_key';
const MODEL_STORE = 'homestock.gemini_model';
export const DEFAULT_VISION_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_KEY_URL = 'https://aistudio.google.com/app/apikey';

export type Confidence = 'alta' | 'media' | 'baja';

export interface DetectedItem {
  name: string;
  brand: string | null;
  /** Unidades visibles (envases). */
  count: number;
  /** Tamaño del envase si se lee ("1 L", "500 g"). */
  size: string | null;
  category: string;
  confidence: Confidence;
  /** Por qué lo identifica: texto leído, forma, color… */
  evidence: string | null;
}

export class VisionError extends Error {
  constructor(
    public code: 'no_key' | 'bad_key' | 'quota' | 'network' | 'blocked' | 'parse' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

const memory: { key?: string | null; model?: string | null } = {};

async function getItem(k: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(k) ?? null;
  return SecureStore.getItemAsync(k);
}
async function setItem(k: string, v: string | null) {
  if (Platform.OS === 'web') {
    if (v) globalThis.localStorage?.setItem(k, v);
    else globalThis.localStorage?.removeItem(k);
    return;
  }
  if (v) await SecureStore.setItemAsync(k, v);
  else await SecureStore.deleteItemAsync(k);
}

export async function getVisionKey(): Promise<string | null> {
  if (memory.key === undefined) memory.key = await getItem(KEY_STORE);
  return memory.key ?? null;
}
export async function setVisionKey(key: string | null) {
  memory.key = key?.trim() || null;
  await setItem(KEY_STORE, memory.key);
}
export async function getVisionModel(): Promise<string> {
  if (memory.model === undefined) memory.model = await getItem(MODEL_STORE);
  return memory.model || DEFAULT_VISION_MODEL;
}
export async function setVisionModel(model: string | null) {
  memory.model = model?.trim() || null;
  await setItem(MODEL_STORE, memory.model);
}

const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

const PROMPT = `Eres el asistente de inventario de una casa en España. Analiza la foto (una nevera, despensa, armario o compra sobre la mesa) e identifica TODOS los productos que se vean, uno por línea de producto distinto.
Reglas:
- Nombre en español, concreto y como se diría en una lista de la compra ("Leche entera", "Bebida de almendras sin azúcar", "Tomates", "Jamón cocido en lonchas").
- Marca solo si se lee o es inequívoca por el envase (Hacendado, Consum, Coca-Cola, Navidul…); si no, null.
- count: cuántos envases o piezas iguales se ven (estimación honesta; 1 si no está claro).
- size: tamaño del envase si se lee (ej. "1 L", "125 g"); si no, null.
- category: una de estas exactamente: ${CATEGORY_NAMES.join(', ')}.
- confidence: "alta" si lees la etiqueta o es inconfundible; "media" si lo deduces por forma/color; "baja" si es una suposición.
- evidence: en pocas palabras qué te hace identificarlo (texto leído, forma, color).
- No inventes productos que no se vean. No incluyas el propio electrodoméstico, estantes ni recipientes vacíos. Si un táper o bolsa no deja ver el contenido, inclúyelo como "Táper con comida" o similar con confidence "baja".`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: 'string', nullable: true },
          count: { type: 'integer' },
          size: { type: 'string', nullable: true },
          category: { type: 'string', enum: CATEGORY_NAMES },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
          evidence: { type: 'string', nullable: true },
        },
        required: ['name', 'count', 'category', 'confidence'],
      },
    },
  },
  required: ['items'],
};

/** Reduce la foto (lado mayor 1600 px, JPEG 0,7) y la devuelve en base64. */
async function prepareImage(uri: string): Promise<string> {
  const r = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (r.base64) return r.base64;
  return new File(r.uri).base64();
}

/** Limpia y valida la respuesta del modelo: nunca devolvemos algo fuera del esquema. */
export function parseVisionResponse(text: string): DetectedItem[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new VisionError('parse', 'La IA no devolvió una lista válida.');
    data = JSON.parse(m[0]);
  }
  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) throw new VisionError('parse', 'La IA no devolvió una lista válida.');
  const out: DetectedItem[] = [];
  for (const raw of items as Record<string, unknown>[]) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (name.length < 2) continue;
    const brand = typeof raw.brand === 'string' && raw.brand.trim() && raw.brand.trim().toLowerCase() !== 'null' ? raw.brand.trim() : null;
    const count = Math.max(1, Math.min(48, Math.round(Number(raw.count) || 1)));
    const size = typeof raw.size === 'string' && raw.size.trim() ? raw.size.trim() : null;
    const category = CATEGORY_NAMES.includes(String(raw.category)) ? String(raw.category) : 'Otros';
    const confidence: Confidence = raw.confidence === 'alta' || raw.confidence === 'media' ? raw.confidence : 'baja';
    const evidence = typeof raw.evidence === 'string' && raw.evidence.trim() ? raw.evidence.trim() : null;
    out.push({ name: name.charAt(0).toUpperCase() + name.slice(1), brand, count, size, category, confidence, evidence });
  }
  // Une duplicados (mismo nombre y marca) sumando unidades.
  const merged = new Map<string, DetectedItem>();
  for (const it of out) {
    const k = `${it.name.toLowerCase()}|${(it.brand ?? '').toLowerCase()}|${(it.size ?? '').toLowerCase()}`;
    const prev = merged.get(k);
    if (prev) prev.count += it.count;
    else merged.set(k, { ...it });
  }
  return [...merged.values()];
}

export async function detectProductsInPhoto(uri: string, opts: { signal?: AbortSignal } = {}): Promise<DetectedItem[]> {
  const key = await getVisionKey();
  if (!key) throw new VisionError('no_key', 'Falta tu clave gratuita de Gemini.');
  const image = await prepareImage(uri);
  try {
    return await callVision(key, await getVisionModel(), image, opts.signal);
  } catch (e) {
    // Si Google ha retirado el modelo, elegimos otro vigente y reintentamos una vez.
    if (e instanceof VisionError && e.code === 'unknown' && /no está disponible/.test(e.message)) {
      const alt = await pickAvailableModel(key);
      if (alt) {
        await setVisionModel(alt);
        return callVision(key, alt, image, opts.signal);
      }
    }
    throw e;
  }
}

async function callVision(key: string, model: string, image: string, signal?: AbortSignal): Promise<DetectedItem[]> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
      signal,
    });
  } catch {
    throw new VisionError('network', 'Sin conexión. La foto de la nevera necesita internet.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 400 && /API key|API_KEY/i.test(body)) throw new VisionError('bad_key', 'La clave de Gemini no es válida. Revísala en Ajustes.');
    if (res.status === 401 || res.status === 403) throw new VisionError('bad_key', 'La clave de Gemini no es válida o no tiene permiso. Revísala en Ajustes.');
    if (res.status === 404) throw new VisionError('unknown', `El modelo «${model}» no está disponible. Cambia el modelo en Ajustes.`);
    if (res.status === 429) throw new VisionError('quota', 'Has llegado al límite gratuito de Gemini por ahora. Prueba en un rato o mañana.');
    throw new VisionError('unknown', `Gemini respondió con un error (${res.status}).`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) throw new VisionError('blocked', 'Gemini no ha querido analizar esta foto.');
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new VisionError('parse', 'Gemini no devolvió resultados. Prueba con otra foto.');
  return parseVisionResponse(text);
}

/** Prueba la clave con una petición mínima de texto. */
export async function testVisionKey(key: string, model?: string): Promise<{ ok: boolean; message: string }> {
  const m = model?.trim() || (await getVisionModel());
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responde solo: ok' }] }], generationConfig: { maxOutputTokens: 5 } }),
    });
    if (res.ok) return { ok: true, message: `Clave correcta. Modelo: ${m}.` };
    if (res.status === 404) {
      // El modelo ya no existe (Google los renueva): buscamos uno "flash" vigente con esta clave.
      const alt = await pickAvailableModel(key.trim());
      if (alt) {
        await setVisionModel(alt);
        return { ok: true, message: `Clave correcta. Modelo actualizado a ${alt}.` };
      }
      return { ok: false, message: `La clave funciona pero el modelo «${m}» no existe. Prueba otro.` };
    }
    if (res.status === 429) return { ok: true, message: 'Clave correcta (ahora mismo en el límite gratuito).' };
    return { ok: false, message: 'La clave no es válida.' };
  } catch {
    return { ok: false, message: 'Sin conexión.' };
  }
}

/** Elige un modelo multimodal ligero disponible para la clave (prefiere "flash-lite", luego "flash"). */
async function pickAvailableModel(key: string): Promise<string | null> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!res.ok) return null;
    const json = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const names = (json.models ?? [])
      .filter((x) => x.supportedGenerationMethods?.includes('generateContent'))
      .map((x) => x.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-/.test(n) && !/(preview|exp|image|tts|live|audio|embedding|thinking)/.test(n));
    const sortDesc = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });
    return names.filter((n) => /flash-lite/.test(n)).sort(sortDesc)[0] ?? names.filter((n) => /flash/.test(n)).sort(sortDesc)[0] ?? null;
  } catch {
    return null;
  }
}
