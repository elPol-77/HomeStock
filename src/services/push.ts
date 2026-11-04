import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useAuth } from './auth';
import { supabase } from './supabase';

/**
 * Registro del token push de Expo para recibir avisos de la familia con la app cerrada.
 * Requiere el projectId de EAS (app.json → extra.eas.projectId), que se crea con `npx eas-cli init`.
 * Sin él, la app sigue funcionando con notificaciones locales y sincronización al abrir.
 */
export async function registerPushToken(): Promise<'registered' | 'no-project' | 'no-permission' | 'skipped'> {
  if (!supabase || Platform.OS === 'web' || !useAuth.getState().session) return 'skipped';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'no-project';
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return 'no-permission';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const userId = useAuth.getState().session!.user.id;
  await supabase.from('push_tokens').upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  pushActive = true;
  return 'registered';
}

export let pushActive = false;
let started = false;
export function startPushRegistration() {
  if (started) return;
  started = true;
  const tryRegister = () => registerPushToken().catch(() => {});
  useAuth.subscribe((s, prev) => {
    if (s.session && s.session.user.id !== prev.session?.user.id) tryRegister();
  });
  tryRegister();
}
