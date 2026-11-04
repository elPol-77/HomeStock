import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { AppState, Platform } from 'react-native';

/**
 * Cliente de Supabase. Solo usa la URL y la clave pública "anon" (protegida por RLS).
 * Las claves secretas (service_role) NUNCA van en la app: solo en las Edge Functions.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isCloudConfigured = !!(url && anonKey);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: Storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
