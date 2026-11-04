import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { CATEGORIES } from '@/data/types';

import { useAuth } from './auth';
import { isCloudConfigured, supabase } from './supabase';

/**
 * Reconocimiento de varios productos en una foto (nevera, despensa, compra en la mesa).
 * La foto (reducida a 1600 px) va a la Edge Function «vision» de Supabase, que la analiza con
 * Gemini usando la clave gratuita del proyecto guardada como secreto en el servidor.
 * La persona usuaria no configura nada: solo necesita la sesión iniciada (para repartir el cupo diario).
 * El resultado son PROPUESTAS: el usuario confirma cada producto antes de guardarlo.
 */

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/vision`;

/** Token de sesión vigente (getSession lo renueva si ha caducado, p. ej. tras horas en segundo plano). */
async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Las versiones anteriores guardaban una clave personal de Gemini: ya no hace falta, se borra del móvil. */
let legacyCleaned = false;
function forgetLegacyKey() {
  if (legacyCleaned || Platform.OS === 'web') return;
  legacyCleaned = true;
  SecureStore.deleteItemAsync('homestock.gemini_key').catch(() => {});
  SecureStore.deleteItemAsync('homestock.gemini_model').catch(() => {});
}

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
    public code: 'quota' | 'daily_limit' | 'login' | 'not_configured' | 'network' | 'blocked' | 'parse' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

/** Reduce la foto (lado mayor 1600 px, JPEG 0,7) y la devuelve en base64. */
async function prepareImage(uri: string, width = 1600): Promise<string> {
  const r = await manipulateAsync(uri, [{ resize: { width } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
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

/** ¿Se puede usar ya? Con sesión iniciada y nube configurada, sí. */
export function visionReady(): boolean {
  return isCloudConfigured && !!useAuth.getState().session;
}

export interface VisionStatus {
  ready: boolean;
  dailyLimit: number | null;
  remaining: number | null;
}

/** Estado del servicio y fotos que te quedan hoy (no gasta cupo). */
export async function visionStatus(): Promise<VisionStatus> {
  forgetLegacyKey();
  const token = isCloudConfigured && useAuth.getState().session ? await accessToken() : null;
  if (!token) return { ready: false, dailyLimit: null, remaining: null };
  try {
    const res = await fetch(FUNCTION_URL, {
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return { ready: true, dailyLimit: null, remaining: null };
    const json = (await res.json()) as { configured?: boolean; dailyLimit?: number; remaining?: number };
    return { ready: !!json.configured, dailyLimit: json.dailyLimit ?? null, remaining: json.remaining ?? null };
  } catch {
    return { ready: true, dailyLimit: null, remaining: null };
  }
}

async function callServer(image: string, mode: 'fridge' | 'product' | 'expiry', signal?: AbortSignal): Promise<string> {
  const token = isCloudConfigured && useAuth.getState().session ? await accessToken().catch(() => null) : null;
  if (!token) throw new VisionError('login', 'Inicia sesión (es gratis) para reconocer productos automáticamente.');
  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image, categories: CATEGORY_NAMES, mode }),
      signal,
    });
  } catch {
    throw new VisionError('network', 'Sin conexión: el reconocimiento con IA necesita internet.');
  }
  const json = (await res.json().catch(() => ({}))) as { text?: string; code?: VisionError['code']; message?: string };
  if (!res.ok || !json.text) {
    const code = json.code && ['login', 'not_configured', 'daily_limit', 'quota', 'blocked', 'parse'].includes(json.code) ? json.code : 'unknown';
    if (res.status === 401 && !json.code) throw new VisionError('login', 'Tu sesión ha caducado. Vuelve a iniciar sesión.');
    throw new VisionError(code, json.message ?? `El servidor respondió con un error (${res.status}).`);
  }
  return json.text;
}

export async function detectProductsInPhoto(uri: string, opts: { signal?: AbortSignal } = {}): Promise<DetectedItem[]> {
  if (!visionReady()) throw new VisionError('login', 'Inicia sesión (es gratis) para reconocer productos automáticamente.');
  return parseVisionResponse(await callServer(await prepareImage(uri), 'fridge', opts.signal));
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new VisionError('parse', 'La IA no devolvió un resultado válido.');
    return JSON.parse(m[0]) as Record<string, unknown>;
  }
}
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);
const conf = (v: unknown): Confidence => (v === 'alta' || v === 'media' ? v : 'baja');

export interface PhotoProduct {
  name: string;
  brand: string | null;
  size: string | null;
  barcode: string | null;
  category: string;
  confidence: Confidence;
  evidence: string | null;
}

/** Identifica UN producto en la foto (para añadirlo al inventario). */
export async function identifyProductInPhoto(uri: string, signal?: AbortSignal): Promise<PhotoProduct | null> {
  const raw = parseJson(await callServer(await prepareImage(uri, 1200), 'product', signal));
  const name = str(raw.name);
  if (!name) return null;
  const barcode = str(raw.barcode)?.replace(/\D/g, '') ?? null;
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    brand: str(raw.brand),
    size: str(raw.size),
    barcode: barcode && (barcode.length === 8 || barcode.length === 13) ? barcode : null,
    category: CATEGORY_NAMES.includes(String(raw.category)) ? String(raw.category) : 'Otros',
    confidence: conf(raw.confidence),
    evidence: str(raw.evidence),
  };
}

export interface PhotoExpiry {
  date: string | null;
  kind: 'use_by' | 'best_before';
  text: string | null;
  confidence: Confidence;
}

/** Lee la fecha de caducidad / consumo preferente impresa en el envase. */
export async function readExpiryInPhoto(uri: string, signal?: AbortSignal): Promise<PhotoExpiry> {
  const raw = parseJson(await callServer(await prepareImage(uri, 1600), 'expiry', signal));
  const d = str(raw.date);
  const valid = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null;
  return { date: valid, kind: raw.kind === 'use_by' ? 'use_by' : 'best_before', text: str(raw.text), confidence: valid ? conf(raw.confidence) : 'baja' };
}
