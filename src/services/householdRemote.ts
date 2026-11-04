import { getHousehold, markHouseholdRemote, switchToHousehold } from '@/data/household';

import { useAuth } from './auth';
import { supabase } from './supabase';
import { resetRealtime, syncNow } from './sync';

export interface Member {
  user_id: string;
  display_name: string | null;
  role: 'admin' | 'member';
  joined_at: string;
}

function client() {
  if (!supabase) throw new Error('La nube no está configurada.');
  if (!useAuth.getState().session) throw new Error('Inicia sesión para compartir tu hogar.');
  return supabase;
}

/** Sube el hogar local a la nube (con el mismo id) y lo convierte en compartible. */
export async function publishHousehold(): Promise<void> {
  const sb = client();
  const h = await getHousehold();
  if (!h) throw new Error('No hay hogar local.');
  const { error } = await sb.rpc('create_household', { p_id: h.id, p_name: h.name });
  if (error) throw new Error(error.message);
  await markHouseholdRemote(h.id, 'admin');
  resetRealtime();
  await syncNow();
}

export async function getInviteCode(): Promise<string> {
  const sb = client();
  const h = await getHousehold();
  const { data, error } = await sb.from('households').select('invite_code').eq('id', h!.id).single();
  if (error) throw new Error(error.message);
  return data.invite_code as string;
}

export async function regenerateInviteCode(): Promise<string> {
  const sb = client();
  const h = await getHousehold();
  const { data, error } = await sb.rpc('regenerate_invite_code', { p_household: h!.id });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function joinHousehold(code: string, mergeLocal: boolean): Promise<string> {
  const sb = client();
  const { data, error } = await sb.rpc('join_household', { p_code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message.includes('invalid') ? 'Código de invitación no válido.' : error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { household_id: string; name: string };
  await switchToHousehold(row.household_id, row.name, 'member', mergeLocal);
  resetRealtime();
  await syncNow();
  return row.name;
}

export async function listMembers(): Promise<Member[]> {
  const sb = client();
  const h = await getHousehold();
  const { data, error } = await sb.from('household_members').select('user_id, display_name, role, joined_at').eq('household_id', h!.id).order('joined_at');
  if (error) throw new Error(error.message);
  return data as Member[];
}

export async function setMemberRole(userId: string, role: 'admin' | 'member') {
  const sb = client();
  const h = await getHousehold();
  const { error } = await sb.rpc('set_member_role', { p_household: h!.id, p_user: userId, p_role: role });
  if (error) throw new Error(error.message);
}

export async function removeMember(userId: string) {
  const sb = client();
  const h = await getHousehold();
  const { error } = await sb.rpc('remove_member', { p_household: h!.id, p_user: userId });
  if (error) throw new Error(error.message);
}

export async function renameRemoteHousehold(name: string) {
  const sb = client();
  const h = await getHousehold();
  const { error } = await sb.from('households').update({ name }).eq('id', h!.id);
  if (error) throw new Error(error.message);
}
