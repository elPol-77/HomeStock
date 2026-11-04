/** Fechas "de calendario" (YYYY-MM-DD) en hora local, sin zonas horarias. */

export type ISODate = string; // YYYY-MM-DD

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function isValidISODate(s: string | null | undefined): s is ISODate {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

/** Días enteros de `from` a `to` (positivo si `to` es posterior). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function lastDayOfMonth(year: number, month1to12: number): ISODate {
  const d = new Date(year, month1to12, 0);
  return toISODate(d);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 15/11/2026 */
export function formatDate(date: ISODate | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** 15 nov */
export function formatShortDate(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatMonth(year: number, month0: number): string {
  return `${MONTHS_LONG[month0]} ${year}`;
}

export function monthShort(month0: number): string {
  return MONTHS[month0];
}

/** "hoy", "mañana", "en 3 días", "ayer", "hace 2 días" */
export function relativeDays(date: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 1) return diff < 60 ? `en ${diff} días` : `el ${formatDate(date)}`;
  return -diff < 60 ? `hace ${-diff} días` : `el ${formatDate(date)}`;
}

/** Inicio de semana (lunes) de una fecha. */
export function startOfWeek(date: ISODate): ISODate {
  const d = parseISODate(date);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}
