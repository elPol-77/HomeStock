// Supabase Edge Function (Deno): reconoce productos en una foto con Gemini usando la clave
// gratuita del proyecto, para que la persona usuaria no tenga que crear ni pegar ninguna clave.
//
// Seguridad:
// - La clave GEMINI_API_KEY es un «secret» de Supabase: vive solo en el servidor, nunca en la app ni en GitHub.
// - Solo responde a usuarios con sesión iniciada (se valida el token con Supabase Auth).
// - Límite diario por persona (VISION_DAILY_LIMIT, 20 por defecto) para no agotar el plan gratuito.
// - El prompt lo fija el servidor: la app solo manda la foto y la lista de categorías.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { VISION_MODELS, visionRequestBody } from '../_shared/visionPrompt.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const DAILY_LIMIT = Number(Deno.env.get('VISION_DAILY_LIMIT') ?? '20');
const MAX_IMAGE_CHARS = 3_000_000; // ~2,2 MB de JPEG; la app manda ~300-600 KB

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

let model: string | null = Deno.env.get('GEMINI_MODEL') || null;

async function pickModel(): Promise<string | null> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': GEMINI_KEY } });
    if (!res.ok) return null;
    const json = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const names = (json.models ?? [])
      .filter((x) => x.supportedGenerationMethods?.includes('generateContent'))
      .map((x) => x.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-/.test(n) && !/(preview|exp|image|tts|live|audio|embedding|thinking)/.test(n));
    for (const m of VISION_MODELS) if (names.includes(m)) return m;
    const desc = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });
    return names.filter((n) => /flash-lite/.test(n)).sort(desc)[0] ?? names.filter((n) => /flash/.test(n)).sort(desc)[0] ?? null;
  } catch {
    return null;
  }
}

async function callGemini(m: string, body: unknown): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { code: 'unknown', message: 'Método no permitido.' });
  if (!GEMINI_KEY) return reply(503, { code: 'not_configured', message: 'El reconocimiento automático aún no está activado en el servidor.' });

  // 1) Usuario con sesión.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null }, error: true };
  const user = userData?.user;
  if (userError || !user || user.is_anonymous) return reply(401, { code: 'login', message: 'Inicia sesión para usar el reconocimiento automático.' });

  // 2) Datos de entrada.
  let image = '';
  let categories: string[] = [];
  try {
    const body = (await req.json()) as { image?: unknown; categories?: unknown };
    image = typeof body.image === 'string' ? body.image : '';
    categories = Array.isArray(body.categories)
      ? body.categories.filter((c): c is string => typeof c === 'string' && /^[\p{L} ,.'/-]{2,30}$/u.test(c)).slice(0, 30)
      : [];
  } catch {
    return reply(400, { code: 'unknown', message: 'Petición no válida.' });
  }
  if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 200))) return reply(400, { code: 'unknown', message: 'Foto no válida.' });
  if (categories.length === 0) categories = ['Otros'];

  // 3) Cupo diario por persona (atómico en la base de datos).
  const { data: left, error: quotaError } = await admin.rpc('vision_consume', { p_user: user.id, p_limit: DAILY_LIMIT });
  if (quotaError) return reply(500, { code: 'unknown', message: 'No se pudo comprobar tu cupo diario.' });
  if ((left as number) < 0) return reply(429, { code: 'daily_limit', message: `Has usado las ${DAILY_LIMIT} fotos de hoy. Mañana tendrás más.` });

  // 4) Gemini (con cambio automático de modelo si Google retira el actual).
  const payload = visionRequestBody(image, categories);
  if (!model) model = (await pickModel()) ?? VISION_MODELS[0];
  let res = await callGemini(model, payload);
  if (res.status === 404) {
    const alt = await pickModel();
    if (alt && alt !== model) {
      model = alt;
      res = await callGemini(model, payload);
    }
  }
  if (!res.ok) {
    try {
      await admin.rpc('vision_refund', { p_user: user.id });
    } catch {
      /* sin importancia */
    }
    if (res.status === 429) return reply(429, { code: 'quota', message: 'El servicio gratuito está saturado ahora mismo. Prueba en un rato.' });
    const errBody = await res.text().catch(() => '');
    if ((res.status === 400 && /API.?key/i.test(errBody)) || res.status === 401 || res.status === 403) return reply(503, { code: 'not_configured', message: 'La clave del servidor no es válida. Avisa a quien administra la app.' });
    return reply(502, { code: 'unknown', message: `Gemini respondió con un error (${res.status}).` });
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) return reply(422, { code: 'blocked', message: 'Gemini no ha querido analizar esta foto.' });
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) return reply(502, { code: 'parse', message: 'Gemini no devolvió resultados. Prueba con otra foto.' });
  return reply(200, { text, model, remaining: left });
});
