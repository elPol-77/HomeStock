import { daysBetween, ISODate, isValidISODate, lastDayOfMonth, todayISO } from './dates';
import { ExpiryKind } from './expiry';
import { normalizeText } from './text';

export interface ExpiryCandidate {
  date: ISODate;
  kind: ExpiryKind | null;
  /** 0..1 */
  confidence: number;
  raw: string;
  /** true si la fecha impresa solo tenía mes/año ("fin de 09/2027"). */
  monthOnly: boolean;
}

export interface ExpiryOcrResult {
  best: ExpiryCandidate | null;
  candidates: ExpiryCandidate[];
  /** true si el usuario debería confirmar (baja confianza, tipo dudoso o varias fechas). */
  needsConfirmation: boolean;
}

const MONTH_NAMES: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const USE_BY = [/fecha de caducidad/, /\bcaducidad\b/, /\bcaduca\b/, /\bcad\b\.?/, /consumir antes del?\b(?!.*preferente)/, /\buse by\b/, /\bexp\b/];
const BEST_BEFORE = [/preferente/, /\bcons\.? ?pref/, /\bc\.? ?p\.?\b/, /best before/, /\bbb\b/, /\bbbe\b/, /\bdluo\b/, /\bmhd\b/];
const NOT_EXPIRY = [/envasado/, /fabricacion/, /\bfab\b/, /\bprod\b/, /elaborado/, /\blote\b/, /\blot\b/, /\bl\s?\d{3,}/, /congelado el/, /\bpack(ed)? on\b/];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

interface RawDate {
  date: ISODate;
  monthOnly: boolean;
  raw: string;
  index: number;
}

function findDates(line: string, today: ISODate): RawDate[] {
  const out: RawDate[] = [];
  const t = line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Errores típicos de OCR en dígitos: O→0, I/l→1 cuando están entre números.
    .replace(/(?<=[\d./-])[oO](?=[\d./-])|(?<=\b)[oO](?=\d)/g, '0')
    .replace(/(?<=[\d./-])[il|](?=[\d./-])/g, '1')
    .replace(/[^a-z0-9./\-\s]/g, ' ')
    .replace(/\s*([./-])\s*/g, '$1')
    .replace(/\s+/g, ' ');
  let m: RegExpExecArray | null;

  // dd/mm/yyyy, dd.mm.yy, dd-mm-yyyy
  const dmy = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/g;
  while ((m = dmy.exec(t))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = expandYear(Number(m[3]));
    const iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (isValidISODate(iso)) out.push({ date: iso, monthOnly: false, raw: m[0], index: m.index });
  }
  // yyyy-mm-dd
  const ymd = /\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/g;
  while ((m = ymd.exec(t))) {
    const iso = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    if (isValidISODate(iso)) out.push({ date: iso, monthOnly: false, raw: m[0], index: m.index });
  }
  // 15 nov 2026 / 15nov26 / 15-nov-2026
  const named = /\b(\d{1,2})[\s./-]?([a-z]{3})[a-z]*[\s./-]?(\d{2}|\d{4})\b/g;
  while ((m = named.exec(t))) {
    const mo = MONTH_NAMES[m[2]];
    if (!mo) continue;
    const iso = `${expandYear(Number(m[3]))}-${pad(mo)}-${pad(Number(m[1]))}`;
    if (isValidISODate(iso)) out.push({ date: iso, monthOnly: false, raw: m[0], index: m.index });
  }
  // mm/yyyy (sin día) → fin de mes
  const my = /(?<![\d./-])(\d{1,2})[./-](20\d{2}|\d{2})\b(?![./-]\d)/g;
  while ((m = my.exec(t))) {
    if (out.some((o) => m!.index >= o.index && m!.index < o.index + o.raw.length)) continue;
    const mo = Number(m[1]);
    if (mo < 1 || mo > 12) continue;
    const y = expandYear(Number(m[2]));
    out.push({ date: lastDayOfMonth(y, mo), monthOnly: true, raw: m[0], index: m.index });
  }
  // nov 2026 → fin de mes
  const namedMonth = /\b([a-z]{3})[a-z]*[\s./-](20\d{2})\b/g;
  while ((m = namedMonth.exec(t))) {
    const mo = MONTH_NAMES[m[1]];
    if (!mo) continue;
    if (out.some((o) => m!.index >= o.index - 3 && m!.index < o.index + o.raw.length)) continue;
    out.push({ date: lastDayOfMonth(Number(m[2]), mo), monthOnly: true, raw: m[0], index: m.index });
  }
  // dd/mm sin año → próxima ocurrencia
  const dm = /(?<![\d./-])(\d{1,2})[./](\d{1,2})(?![\d./-])/g;
  while ((m = dm.exec(t))) {
    if (out.some((o) => m!.index >= o.index && m!.index < o.index + o.raw.length)) continue;
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const year = Number(today.slice(0, 4));
    let iso = `${year}-${pad(mo)}-${pad(d)}`;
    if (!isValidISODate(iso)) continue;
    if (daysBetween(today, iso) < -15) iso = `${year + 1}-${pad(mo)}-${pad(d)}`;
    out.push({ date: iso, monthOnly: false, raw: m[0], index: m.index });
  }
  return out;
}

function detectKind(context: string): { kind: ExpiryKind | null; strength: number; excluded: boolean } {
  const t = normalizeText(context);
  if (NOT_EXPIRY.some((r) => r.test(t)) && !USE_BY.some((r) => r.test(t)) && !BEST_BEFORE.some((r) => r.test(t))) {
    return { kind: null, strength: 0, excluded: true };
  }
  if (BEST_BEFORE.some((r) => r.test(t))) return { kind: 'best_before', strength: 1, excluded: false };
  if (USE_BY.some((r) => r.test(t))) return { kind: 'use_by', strength: 1, excluded: false };
  return { kind: null, strength: 0, excluded: false };
}

/**
 * Interpreta texto OCR de un envase y propone la fecha de caducidad o consumo preferente.
 * Nunca afirma certeza: devuelve candidatos con confianza y si requiere confirmación.
 */
export function parseExpiryFromText(lines: string[], today: ISODate = todayISO()): ExpiryOcrResult {
  const candidates: ExpiryCandidate[] = [];
  const clean = lines.map((l) => l.trim()).filter(Boolean);

  clean.forEach((line, i) => {
    const dates = findDates(line, today);
    if (dates.length === 0) return;
    const prev = clean[i - 1] ?? '';
    const own = detectKind(line);
    const ctx = own.kind || own.excluded ? own : detectKind(prev);

    for (const d of dates) {
      if (ctx.excluded) continue;
      const diff = daysBetween(today, d.date);
      // Fechas absurdas: más de 1 año en el pasado o más de 6 años en el futuro.
      if (diff < -365 || diff > 6 * 365) continue;
      let confidence = 0.45;
      if (ctx.kind) confidence += 0.35;
      if (diff >= -30) confidence += 0.1; // fechas futuras o recientes son más probables
      if (d.monthOnly) {
        confidence -= 0.05;
      }
      // Un mes/año sin día suele ser consumo preferente en productos de larga duración.
      const kind = ctx.kind ?? (d.monthOnly ? 'best_before' : null);
      candidates.push({ date: d.date, kind, confidence: Math.min(0.95, Math.max(0.1, confidence)), raw: d.raw, monthOnly: d.monthOnly });
    }
  });

  // Quitar duplicados conservando la mayor confianza.
  const byDate = new Map<string, ExpiryCandidate>();
  for (const c of candidates) {
    const prev = byDate.get(c.date);
    if (!prev || c.confidence > prev.confidence) byDate.set(c.date, c);
  }
  const unique = [...byDate.values()].sort((a, b) => b.confidence - a.confidence || a.date.localeCompare(b.date));

  const best = unique[0] ?? null;
  const ambiguous = unique.length > 1 && unique[1].confidence >= (best?.confidence ?? 0) - 0.1;
  const needsConfirmation = !best || best.confidence < 0.8 || best.kind === null || ambiguous;
  return { best, candidates: unique, needsConfirmation };
}
