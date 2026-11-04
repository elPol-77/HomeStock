import { all, first, getSetting, householdId, insertRow, nowIso, run, setCurrentHousehold, setSetting, uuid } from '@/db/client';
import { emitChange } from '@/db/events';

import { DEFAULT_LOCATIONS, LEGACY_ZONE_ICONS } from './types';

export interface Household {
  id: string;
  name: string;
  remote: number;
  role: 'admin' | 'member';
}

const CURRENT_KEY = 'current_household';
export const HOUSEHOLD_TABLES = ['locations', 'products', 'batches', 'stock_movements', 'shopping_lists', 'list_items', 'purchases', 'purchase_items', 'price_observations', 'savings'] as const;

export interface HouseholdSummary extends Household {
  products: number;
  current: boolean;
}

/** Zonas por defecto y una lista de la compra para una casa recién creada. */
async function seedHousehold(id: string) {
  let i = 0;
  for (const loc of DEFAULT_LOCATIONS) {
    await insertRow('locations', { household_id: id, name: loc.name, icon: loc.icon, sort_order: i++ }, { emit: false });
  }
  await insertRow('shopping_lists', { household_id: id, name: 'Compra semanal', kind: 'weekly', status: 'active', emoji: '🛒' }, { emit: false });
}

/** Garantiza que existe al menos una casa y activa la última que se usó (la app funciona sin cuenta). */
export async function ensureHousehold(): Promise<Household> {
  const savedId = await getSetting<string | null>(CURRENT_KEY, null);
  const existing =
    (savedId ? await first<Household>('SELECT id, name, remote, role FROM households WHERE id = ?', [savedId]) : null) ??
    (await first<Household>('SELECT id, name, remote, role FROM households ORDER BY created_at LIMIT 1'));
  if (existing) {
    setCurrentHousehold(existing.id);
    if (existing.id !== savedId) await setSetting(CURRENT_KEY, existing.id);
    // Iconos nuevos para las zonas por defecto (solo si el usuario no los cambió).
    for (const [oldIcon, newIcon] of Object.entries(LEGACY_ZONE_ICONS)) {
      await run('UPDATE locations SET icon = ?, dirty = 1, updated_at = ? WHERE icon = ?', [newIcon, nowIso(), oldIcon]);
    }
    return existing;
  }
  const id = uuid();
  await run('INSERT INTO households (id, name, remote, role, created_at) VALUES (?, ?, 0, ?, ?)', [id, 'Mi casa', 'admin', nowIso()]);
  setCurrentHousehold(id);
  await setSetting(CURRENT_KEY, id);
  await seedHousehold(id);
  return { id, name: 'Mi casa', remote: 0, role: 'admin' };
}

/** La casa activa (la que se ve en toda la app). */
export async function getHousehold(): Promise<Household | null> {
  return first<Household>('SELECT id, name, remote, role FROM households WHERE id = ?', [householdId()]);
}

/** Todas las casas de este móvil, con cuántos productos tiene cada una. */
export async function listHouseholds(): Promise<HouseholdSummary[]> {
  const rows = await all<Household & { products: number }>(
    `SELECT h.id, h.name, h.remote, h.role,
       (SELECT COUNT(*) FROM products p WHERE p.household_id = h.id AND p.deleted = 0 AND p.source != 'catalog') AS products
     FROM households h ORDER BY h.created_at`,
  );
  const current = householdId();
  return rows.map((r) => ({ ...r, current: r.id === current }));
}

/** Cambia la casa activa. Todo (inventario, listas, estadísticas) pasa a ser el de esa casa. */
export async function activateHousehold(id: string) {
  const h = await first<Household>('SELECT id, name, remote, role FROM households WHERE id = ?', [id]);
  if (!h) throw new Error('Esa casa ya no existe en este móvil.');
  setCurrentHousehold(id);
  await setSetting(CURRENT_KEY, id);
  emitChange(['households', ...HOUSEHOLD_TABLES]);
  return h;
}

/** Crea otra casa (p. ej. la de tus padres) con sus zonas y una lista, y la deja activa. */
export async function createHousehold(name: string): Promise<string> {
  const id = uuid();
  await run('INSERT INTO households (id, name, remote, role, created_at) VALUES (?, ?, 0, ?, ?)', [id, name.trim() || 'Otra casa', 'admin', nowIso()]);
  await seedHousehold(id);
  await activateHousehold(id);
  return id;
}

/** Quita una casa de este móvil con todos sus datos locales. Si era la activa, se activa otra. */
export async function removeHouseholdLocal(id: string) {
  const count = await first<{ n: number }>('SELECT COUNT(*) AS n FROM households');
  if ((count?.n ?? 0) <= 1) throw new Error('Necesitas al menos una casa.');
  for (const t of HOUSEHOLD_TABLES) await run(`DELETE FROM ${t} WHERE household_id = ?`, [id]);
  await run('DELETE FROM households WHERE id = ?', [id]);
  await run('DELETE FROM settings WHERE key LIKE ?', [`sync:cursor:${id}:%`]);
  if (householdId() === id) {
    const next = await first<{ id: string }>('SELECT id FROM households ORDER BY created_at LIMIT 1');
    await activateHousehold(next!.id);
  } else emitChange(['households']);
}

/** Registra en este móvil una casa compartida que ya existe en la nube (sin activarla). */
export async function addRemoteHouseholdLocal(id: string, name: string, role: 'admin' | 'member') {
  await run('INSERT OR IGNORE INTO households (id, name, remote, role, created_at) VALUES (?, ?, 1, ?, ?)', [id, name, role, nowIso()]);
  await run('UPDATE households SET name = ?, role = ?, remote = 1 WHERE id = ?', [name, role, id]);
  emitChange(['households']);
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
 * Al unirse a la casa de un familiar: se añade como una casa más y se activa.
 * Si `mergeLocal` es true, los datos de la casa activa se pasan a la nueva (y la vieja desaparece).
 * Si es false, la casa activa se queda tal cual en este móvil y puedes volver a ella cuando quieras.
 */
export async function switchToHousehold(newId: string, name: string, role: 'admin' | 'member', mergeLocal: boolean) {
  const current = await getHousehold();
  await run('INSERT OR REPLACE INTO households (id, name, remote, role, created_at) VALUES (?, ?, 1, ?, ?)', [newId, name, role, nowIso()]);
  if (current && mergeLocal && current.id !== newId) {
    for (const t of HOUSEHOLD_TABLES) await run(`UPDATE ${t} SET household_id = ?, dirty = 1 WHERE household_id = ?`, [newId, current.id]);
    await run('DELETE FROM households WHERE id = ?', [current.id]);
  }
  await activateHousehold(newId);
}

/** Borra todos los datos locales (derecho de supresión RGPD en el dispositivo). */
export async function wipeLocalData() {
  const tables = await all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const t of tables) await run(`DELETE FROM ${t.name}`);
  emitChange(tables.map((t) => t.name));
}
