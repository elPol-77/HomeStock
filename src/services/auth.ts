import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { create } from 'zustand';

import { isCloudConfigured, supabase } from './supabase';

interface AuthStore {
  session: Session | null;
  ready: boolean;
}

export const useAuth = create<AuthStore>(() => ({ session: null, ready: false }));

export async function initAuth() {
  if (!supabase) {
    useAuth.setState({ ready: true });
    return;
  }
  const { data } = await supabase.auth.getSession();
  useAuth.setState({ session: data.session, ready: true });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session });
  });
}

function requireClient() {
  if (!supabase) throw new Error('La nube no está configurada. Revisa EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (ver README).');
  return supabase;
}

export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu email: te hemos enviado un enlace.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con este email.';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.';
  if (m.includes('network') || m.includes('fetch')) return 'Sin conexión. Inténtalo de nuevo cuando tengas internet.';
  if (m.includes('weak')) return 'La contraseña es demasiado débil.';
  return message;
}

export function validatePassword(p: string): string | null {
  if (p.length < 8) return 'Mínimo 8 caracteres.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Usa letras y al menos un número.';
  return null;
}

export function validateEmail(e: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) ? null : 'Introduce un email válido.';
}

export async function signUp(email: string, password: string, displayName: string) {
  const sb = requireClient();
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName.trim() }, emailRedirectTo: Linking.createURL('/auth/callback') },
  });
  if (error) throw new Error(translateAuthError(error.message));
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const sb = requireClient();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function sendPasswordReset(email: string) {
  const sb = requireClient();
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('/auth/reset') });
  if (error) throw new Error(translateAuthError(error.message));
}

/** Procesa el enlace del email (PKCE ?code= o tokens en #fragment). */
export async function handleAuthDeepLink(url: string): Promise<boolean> {
  const sb = requireClient();
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (typeof code === 'string') {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) throw new Error(translateAuthError(error.message));
    return true;
  }
  const fragment = url.split('#')[1];
  if (fragment) {
    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const { error } = await sb.auth.setSession({ access_token, refresh_token });
      if (error) throw new Error(translateAuthError(error.message));
      return true;
    }
  }
  return false;
}

export async function updatePassword(password: string) {
  const sb = requireClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function deleteAccount() {
  const sb = requireClient();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await sb.auth.signOut();
}

export { isCloudConfigured };
