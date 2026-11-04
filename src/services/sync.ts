import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { all, getSetting, householdId, run, setSetting } from '@/db/client';
import { emitChange, subscribe } from '@/db/events';
import { SYNC_TABLES, SyncTable } from '@/db/schema';
import { getHousehold } from '@/data/household';
import { recomputeAllBatches } from '@/data/stock';

import { useAuth } from './auth';
import { notifyNow } from './notifications';
import { supabase } from './supabase';

/**
 * Sincronización offline-first:
 *  - Todo se escribe primero en SQLite (la app funciona sin conexión).
 *  - push: sube las filas marcadas `dirty` (upsert por id, sin duplicados).
 *  - pull: descarga lo cambiado en el servidor desde el último cursor (`server_updated_at`).
 *  - Conflictos: gana la última edición (updated_at). Las existencias no tienen conflictos porque
 *    se calculan como suma de movimientos, que solo se insertan.
 */
export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'error' | 'offline';

export const useSync = create<{ status: SyncStatus; lastSync: string | null; error: string | null }>(() => ({ status: 'disabled', lastSync: null, error: null }));

const LOCAL_ONLY = new Set(['dirty', 'quantity_cache']);
let running = false;
let again = false;
let channel: RealtimeChannel | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function columnsFor(row: Record<string, unknown>, table: SyncTable) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (LOCAL_ONLY.has(k)) continue;
    if (table === 'batches' && k === 'quantity') continue; // se calcula desde movimientos
    out[k] = v;
  }
  return out;
}

async function canSync(): Promise<boolean> {
  if (!supabase || !useAuth.getState().session) return false;
  const h = await getHousehold();
  return !!h?.remote;
}

async function push(): Promise<number> {
  let pushed = 0;
  for (const table of SYNC_TABLES) {
    const rows = await all<Record<string, unknown>>(`SELECT * FROM ${table} WHERE dirty = 1 AND household_id = ? LIMIT 500`, [householdId()]);
    if (rows.length === 0) continue;
    const payload = rows.map((r) => {
      const c = columnsFor(r, table);
      if ('deleted' in c) c.deleted = !!c.deleted;
      if ('checked' in c) c.checked = !!c.checked;
      if ('is_offer' in c) c.is_offer = !!c.is_offer;
      if ('verified' in c) c.verified = !!c.verified;
      return c;
    });
    const { error } = await supabase!.from(table).upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of rows) {
      await run(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at = ?`, [r.id as string, r.updated_at as string]);
    }
    pushed += rows.length;
  }
  return pushed;
}

async function pull(): Promise<{ total: number; newListItems: number }> {
  let total = 0;
  let newListItems = 0;
  const myId = useAuth.getState().session?.user.id;
  for (const table of SYNC_TABLES) {
    const cursorKey = `sync:cursor:${table}`;
    let cursor = await getSetting<string>(cursorKey, '1970-01-01T00:00:00Z');
    for (;;) {
      const { data, error } = await supabase!
        .from(table)
        .select('*')
        .eq('household_id', householdId())
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(500);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const remote of data as Record<string, unknown>[]) {
        const local = (await all<{ updated_at: string; dirty: number }>(`SELECT updated_at, dirty FROM ${table} WHERE id = ?`, [remote.id as string]))[0];
        if (local && local.dirty === 1 && local.updated_at > (remote.updated_at as string)) continue; // gana el cambio local
        if (!local && table === 'list_items' && remote.created_by && remote.created_by !== myId && !remote.deleted) newListItems++;
        const row: Record<string, unknown> = { ...remote, dirty: 0 };
        delete row.server_updated_at;
        delete row.created_by;
        for (const k of Object.keys(row)) if (typeof row[k] === 'boolean') row[k] = row[k] ? 1 : 0;
        if (table === 'batches') row.quantity = 0;
        const keys = Object.keys(row);
        await run(
          `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})
           ON CONFLICT(id) DO UPDATE SET ${keys.filter((k) => k !== 'id' && !(table === 'batches' && k === 'quantity')).map((k) => `${k} = excluded.${k}`).join(', ')}`,
          keys.map((k) => (row[k] as string | number | null) ?? null),
        );
      }
      cursor = (data[data.length - 1] as { server_updated_at: string }).server_updated_at;
      await setSetting(cursorKey, cursor);
      total += data.length;
      if (data.length < 500) break;
    }
  }
  if (total > 0) {
    await recomputeAllBatches();
    emitChange([...SYNC_TABLES]);
  }
  return { total, newListItems };
}

export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  if (!(await canSync())) {
    useSync.setState({ status: 'disabled' });
    return;
  }
  running = true;
  useSync.setState({ status: 'syncing', error: null });
  try {
    await push();
    const { newListItems } = await pull();
    useSync.setState({ status: 'idle', lastSync: new Date().toISOString() });
    if (newListItems > 0) {
      notifyNow('Lista de la compra actualizada', `Tu familia ha añadido ${newListItems} ${newListItems === 1 ? 'producto' : 'productos'} a la lista.`, '/shop', 'household').catch(() => {});
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useSync.setState({ status: /network|fetch/i.test(msg) ? 'offline' : 'error', error: msg });
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(() => syncNow(), 300);
    }
  }
}

async function subscribeRealtime() {
  if (!supabase || channel) return;
  if (!(await canSync())) return;
  const hid = householdId();
  channel = supabase.channel(`household:${hid}`);
  for (const table of SYNC_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${hid}` }, () => schedulePush(800));
  }
  channel.subscribe();
}

export function resetRealtime() {
  if (channel && supabase) supabase.removeChannel(channel);
  channel = null;
  subscribeRealtime().catch(() => {});
}

function schedulePush(delay = 2500) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(), delay);
}

let started = false;
export function startSync() {
  if (started || !supabase) return;
  started = true;
  // Cambios locales → subir en segundo plano.
  subscribe((tables) => {
    if ([...tables].some((t) => (SYNC_TABLES as readonly string[]).includes(t))) schedulePush();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') syncNow();
  });
  useAuth.subscribe((state, prev) => {
    if (state.session?.user.id !== prev.session?.user.id) {
      resetRealtime();
      syncNow();
    }
  });
  syncNow();
  subscribeRealtime().catch(() => {});
}
