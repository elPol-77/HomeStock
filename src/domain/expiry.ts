import { daysBetween, ISODate, relativeDays, todayISO } from './dates';

/**
 * - use_by: "fecha de caducidad" / "consumir antes del". Pasada la fecha, el producto NO debe consumirse.
 * - best_before: "consumo preferente". Pasada la fecha, puede perder calidad pero no es necesariamente inseguro.
 */
export type ExpiryKind = 'use_by' | 'best_before';

export type ExpiryStatus = 'none' | 'ok' | 'soon' | 'today' | 'expired' | 'past_best_before';

export const EXPIRY_KIND_LABEL: Record<ExpiryKind, string> = {
  use_by: 'Caducidad',
  best_before: 'Consumo preferente',
};

export function expiryStatus(
  expiry: ISODate | null | undefined,
  kind: ExpiryKind | null | undefined,
  warnDays = 3,
  today: ISODate = todayISO(),
): ExpiryStatus {
  if (!expiry) return 'none';
  const diff = daysBetween(today, expiry);
  if (diff < 0) return kind === 'best_before' ? 'past_best_before' : 'expired';
  if (diff === 0) return 'today';
  if (diff <= warnDays) return 'soon';
  return 'ok';
}

/** Texto breve y honesto para mostrar en la ficha. */
export function expiryLabel(
  expiry: ISODate | null | undefined,
  kind: ExpiryKind | null | undefined,
  today: ISODate = todayISO(),
): string {
  if (!expiry) return 'Sin fecha';
  const status = expiryStatus(expiry, kind, 3, today);
  const rel = relativeDays(expiry, today);
  const isBB = kind === 'best_before';
  switch (status) {
    case 'expired':
      return `Caducó ${rel}`;
    case 'past_best_before':
      return `Consumo preferente superado ${rel} · revisa su estado`;
    case 'today':
      return isBB ? 'Consumo preferente: hoy' : 'Caduca hoy';
    default:
      return isBB ? `Consumo preferente ${rel}` : `Caduca ${rel}`;
  }
}

export function isUrgent(status: ExpiryStatus): boolean {
  return status === 'soon' || status === 'today' || status === 'expired' || status === 'past_best_before';
}
