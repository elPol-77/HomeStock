import { addDays, daysBetween, ISODate, parseISODate, todayISO } from './dates';
import { ExpiryKind } from './expiry';
import { pluralize } from './text';

export interface ExpiringBatch {
  productName: string;
  quantity: number;
  expiryDate: ISODate;
  kind: ExpiryKind | null;
  locationName: string | null;
}

export interface NotificationSettings {
  expiryEnabled: boolean;
  /** Días de antelación del primer aviso. */
  warnDays: number;
  /** Hora local (0-23) a la que se envían los avisos programados. */
  hour: number;
  shoppingReminderEnabled: boolean;
  /** 0 = lunes … 6 = domingo */
  shoppingWeekday: number;
}

export interface PlannedNotification {
  key: string;
  kind: 'expiry' | 'shopping';
  title: string;
  body: string;
  fireAt: Date;
}

const HORIZON_DAYS = 45;
const MAX_NOTIFICATIONS = 50;

function at(date: ISODate, hour: number): Date {
  const d = parseISODate(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function when(diff: number): string {
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  return `en ${diff} días`;
}

function describe(b: ExpiringBatch): string {
  const where = b.locationName ? ` (${b.locationName.toLowerCase()})` : '';
  return b.quantity > 1 ? `${formatQty(b.quantity)} × ${b.productName}${where}` : `${b.productName}${where}`;
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(1).replace('.', ',');
}

/**
 * Calcula las notificaciones locales que deben estar programadas a partir del estado actual.
 * El servicio de notificaciones reprograma esta lista cada vez que cambia el inventario.
 */
export function planNotifications(
  batches: ExpiringBatch[],
  settings: NotificationSettings,
  pendingShoppingItems: number,
  now: Date = new Date(),
): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const today = todayISO(now);

  if (settings.expiryEnabled) {
    const byFireDate = new Map<ISODate, { batch: ExpiringBatch; diff: number }[]>();
    for (const b of batches) {
      if (b.quantity <= 0) continue;
      const offsets = new Set<number>([Math.max(1, settings.warnDays), 1]);
      if (b.kind !== 'best_before') offsets.add(0);
      for (const off of offsets) {
        const fireDate = addDays(b.expiryDate, -off);
        const d = daysBetween(today, fireDate);
        if (d < 0 || d > HORIZON_DAYS) continue;
        const list = byFireDate.get(fireDate) ?? [];
        list.push({ batch: b, diff: off });
        byFireDate.set(fireDate, list);
      }
    }
    for (const [fireDate, entries] of [...byFireDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const fireAt = at(fireDate, settings.hour);
      if (fireAt.getTime() <= now.getTime()) continue;
      const soonest = Math.min(...entries.map((e) => e.diff));
      const relevant = entries.filter((e) => e.diff === soonest);
      const others = entries.length - relevant.length;
      let title: string;
      let body: string;
      if (relevant.length === 1) {
        const { batch } = relevant[0];
        if (batch.kind === 'best_before') {
          title = `${batch.productName}: consumo preferente ${when(soonest)}`;
          body = `${describe(batch)} llega a su fecha de consumo preferente ${when(soonest)}. Después puede perder calidad, pero no significa que sea inseguro: revisa su estado.`;
        } else {
          const n = batch.quantity;
          title = n > 1 ? `¡Ojo! Tienes ${formatQty(n)} × ${batch.productName} que caducan ${when(soonest)}` : `¡Ojo! ${batch.productName} caduca ${when(soonest)}`;
          body = `${describe(batch)}. Planifica cuándo consumirlo.`;
        }
      } else {
        title = `${relevant.length} ${pluralize(relevant.length, 'producto')} caducan ${when(soonest)}`;
        body = relevant.slice(0, 4).map((e) => describe(e.batch)).join(', ') + (relevant.length > 4 ? '…' : '');
      }
      if (others > 0) body += ` Y ${others} más próximos a caducar.`;
      out.push({ key: `expiry:${fireDate}`, kind: 'expiry', title, body, fireAt });
    }
  }

  if (settings.shoppingReminderEnabled && pendingShoppingItems > 0) {
    const dow = (now.getDay() + 6) % 7;
    let delta = (settings.shoppingWeekday - dow + 7) % 7;
    let fireAt = at(addDays(today, delta), settings.hour);
    if (fireAt.getTime() <= now.getTime()) {
      delta += 7;
      fireAt = at(addDays(today, delta), settings.hour);
    }
    out.push({
      key: 'shopping:weekly',
      kind: 'shopping',
      title: 'Recordatorio de compra',
      body: `Tienes ${pendingShoppingItems} ${pluralize(pendingShoppingItems, 'producto')} ${pluralize(pendingShoppingItems, 'pendiente')} en tu lista.`,
      fireAt,
    });
  }

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, MAX_NOTIFICATIONS);
}

/** Mensajes inmediatos al cambiar existencias. */
export function stockAlertMessage(productName: string, quantity: number, minQuantity: number | null): { title: string; body: string } | null {
  if (quantity <= 0) {
    return { title: `Te has quedado sin ${productName.toLowerCase()}`, body: 'Añádelo a tu próxima compra.' };
  }
  if (minQuantity != null && minQuantity > 0 && quantity <= minQuantity) {
    const q = formatQty(quantity);
    return {
      title: `Solo ${quantity === 1 ? 'queda' : 'quedan'} ${q} de ${productName.toLowerCase()}`,
      body: '¿Lo añadimos a la lista de la compra?',
    };
  }
  return null;
}
