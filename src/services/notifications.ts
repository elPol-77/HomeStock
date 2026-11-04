import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { subscribe } from '@/db/events';
import { pendingItemsCount } from '@/data/lists';
import { expiringBatches } from '@/data/stock';
import { addDays, todayISO } from '@/domain/dates';
import { planNotifications, stockAlertMessage } from '@/domain/notificationsPlan';

import { settings } from './settings';

/**
 * Notificaciones locales programadas en el propio sistema operativo (Android AlarmManager / iOS UNNotification):
 * se disparan aunque la app esté cerrada. Se reprograman cada vez que cambia el inventario o la configuración.
 * Los avisos entre miembros del hogar (push) se envían desde la Edge Function de Supabase.
 */
const supported = Platform.OS === 'android' || Platform.OS === 'ios';
let initialized = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function initNotifications() {
  if (!supported || initialized) return;
  initialized = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('expiry', { name: 'Caducidades', importance: Notifications.AndroidImportance.HIGH });
    await Notifications.setNotificationChannelAsync('stock', { name: 'Existencias', importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.setNotificationChannelAsync('shopping', { name: 'Recordatorios de compra', importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.setNotificationChannelAsync('household', { name: 'Mi hogar', importance: Notifications.AndroidImportance.DEFAULT });
  }
  Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string') router.push(url as never);
  });
  subscribe((tables) => {
    if (tables.has('batches') || tables.has('list_items') || tables.has('settings') || tables.has('products')) scheduleReschedule();
  });
  scheduleReschedule();
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (!supported) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  return p.status as 'granted' | 'denied' | 'undetermined';
}

export async function requestPermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const r = await Notifications.requestPermissionsAsync();
  if (r.granted) scheduleReschedule();
  return r.granted;
}

function scheduleReschedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    rescheduleAll().catch(() => {});
  }, 1500);
}

export async function rescheduleAll(): Promise<number> {
  if (!supported) return 0;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return 0;
  const s = settings();
  const batches = await expiringBatches(addDays(todayISO(), 50));
  const pending = s.notifShopping ? await pendingItemsCount() : 0;
  const plan = planNotifications(
    batches.map((b) => ({ productName: b.product_name, quantity: b.quantity, expiryDate: b.expiry_date, kind: b.expiry_kind, locationName: b.location_name })),
    { expiryEnabled: s.notifExpiry, warnDays: s.warnDays, hour: s.notifyHour, shoppingReminderEnabled: s.notifShopping, shoppingWeekday: s.shoppingWeekday },
    pending,
  );
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.key,
      content: {
        title: n.title,
        body: n.body,
        data: { url: n.kind === 'shopping' ? '/shop' : '/inventory?filter=expiring' },
        ...(Platform.OS === 'android' ? {} : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: n.kind === 'shopping' ? 'shopping' : 'expiry' },
    });
  }
  return plan.length;
}

/** Aviso inmediato del sistema (usado cuando el cambio llega de otro miembro del hogar). */
export async function notifyNow(title: string, body: string, url?: string, channelId = 'stock') {
  if (!supported) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body, data: url ? { url } : {} }, trigger: Platform.OS === 'android' ? { channelId } : null });
}

export function stockAlert(productName: string, quantity: number, minQuantity: number | null) {
  const s = settings();
  const msg = stockAlertMessage(productName, quantity, minQuantity);
  if (!msg) return null;
  if (quantity <= 0 && !s.notifOutOfStock) return null;
  if (quantity > 0 && !s.notifLowStock) return null;
  return msg;
}

export async function sendTestNotification(): Promise<boolean> {
  const ok = await requestPermission();
  if (!ok) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'HomeStock', body: 'Las notificaciones funcionan correctamente ✅' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: 'household' },
  });
  return true;
}
