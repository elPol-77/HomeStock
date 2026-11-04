import { all, first, insertRow, nowIso, run, setCurrentHousehold, uuid } from '@/db/client';
import { emitChange } from '@/db/events';

import { DEFAULT_LOCATIONS } from './types';

export interface Household {
  id: string;
  name: string;
  remote: number;
  role: 'admin' | 'member';
}

/** Garantiza que existe un hogar local (la app funciona sin cuenta). */
export async function ensureHousehold(): Promise<Household> {
  const existing = await first<Household>('SELECT id, name, remote, role FROM households ORDER BY created_at LIMIT 1');
  if (existing) {
    setCurrentHousehold(existing.id);
    return existing;
  }
  const id = uuid();
  await run('INSERT INTO households (id, name, remote, role, created_at) VALUES (?, ?, 0, ?, ?)', [id, 'Mi casa', 'admin', nowIso()]);
  setCurrentHousehold(id);
  let i = 0;
  for (const loc of DEFAULT_LOCATIONS) {
    await insertRow('locations', { name: loc.name, icon: loc.icon, sort_order: i++ }, { emit: false });
  }
  await insertRow('shopping_lists', { name: 'Compra semanal', kind: 'weekly', status: 'active', emoji: '🛒' }, { emit: false });
  return { id, name: 'Mi casa', remote: 0, role: 'admin' };
}

export async function getHousehold(): Promise<Household | null> {
  return first<Household>('SELECT id, name, remote, role FROM households ORDER BY created_at LIMIT 1');
}

export async function renameHousehold(id: string, name: string) {
  await run('UPDATE households SET name = ? WHERE id = ?', [name, id]);
  emitChange(['households']);
}

export async function markHouseholdRemote(id: string, role: 'admin' | 'member', name?: string) {
  await run('UPDATE households SET remote = 1, role = ?, name = COALESCE(?, name) WHERE id = ?', [role, name ?? null, id]);
  emitChange(['households']);
}

/**
 * Cambia el hogar local por uno remoto (al unirse a la casa de un familiar).
 * Si `mergeLocal` es true, los datos locales se reasignan al nuevo hogar y se suben.
 */
export async function switchToHousehold(newId: string, name: string, role: 'admin' | 'member', mergeLocal: boolean) {
  const current = await getHousehold();
  const tables = ['locations', 'products', 'batches', 'stock_movements', 'shopping_lists', 'list_items', 'purchases', 'purchase_items', 'price_observations', 'savings'];
  if (current) {
    for (const t of tables) {
      if (mergeLocal) await run(`UPDATE ${t} SET household_id = ?, dirty = 1 WHERE household_id = ?`, [newId, current.id]);
      else await run(`DELETE FROM ${t} WHERE household_id = ?`, [current.id]);
    }
    await run('DELETE FROM households WHERE id = ?', [current.id]);
  }
  await run('INSERT OR REPLACE INTO households (id, name, remote, role, created_at) VALUES (?, ?, 1, ?, ?)', [newId, name, role, nowIso()]);
  await run("DELETE FROM settings WHERE key LIKE 'sync:%'");
  setCurrentHousehold(newId);
  emitChange(['households', ...tables]);
}

/** Borra todos los datos locales (derecho de supresión RGPD en el dispositivo). */
export async function wipeLocalData() {
  const tables = await all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const t of tables) await run(`DELETE FROM ${t.name}`);
  emitChange(tables.map((t) => t.name));
}
