import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { emitChange } from './events';
import { MIGRATIONS, SyncTable, Table } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('homestock.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
    });
    await db.execAsync(`PRAGMA user_version = ${v + 1}`);
  }
  return db;
}

export function uuid(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

type Value = string | number | null;
export type Row = Record<string, Value | boolean | undefined>;

function normalize(v: Value | boolean | undefined): Value {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export async function all<T>(sql: string, params: Value[] = []): Promise<T[]> {
  const db = await getDb();
  return db.getAllAsync<T>(sql, params);
}

export async function first<T>(sql: string, params: Value[] = []): Promise<T | null> {
  const db = await getDb();
  return (await db.getFirstAsync<T>(sql, params)) ?? null;
}

export async function run(sql: string, params: Value[] = []): Promise<void> {
  const db = await getDb();
  await db.runAsync(sql, params);
}

/** Ejecuta varias escrituras de forma atómica y notifica los cambios al terminar. */
export async function transaction<T>(tables: Table[], fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  let result: T;
  await db.withTransactionAsync(async () => {
    result = await fn();
  });
  emitChange(tables);
  return result!;
}

let currentHouseholdId: string | null = null;
export function setCurrentHousehold(id: string) {
  currentHouseholdId = id;
}
export function householdId(): string {
  if (!currentHouseholdId) throw new Error('Hogar no inicializado');
  return currentHouseholdId;
}

/** Inserta una fila en una tabla sincronizable rellenando las columnas comunes. */
export async function insertRow(table: SyncTable, data: Row, opts: { emit?: boolean } = {}): Promise<string> {
  const now = nowIso();
  const row: Row = { id: uuid(), household_id: householdId(), created_at: now, updated_at: now, deleted: 0, dirty: 1, ...data };
  const keys = Object.keys(row);
  await run(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => normalize(row[k])),
  );
  if (opts.emit !== false) emitChange([table]);
  return row.id as string;
}

export async function updateRow(table: SyncTable, id: string, data: Row, opts: { emit?: boolean } = {}): Promise<void> {
  const row: Row = { ...data, updated_at: nowIso(), dirty: 1 };
  const keys = Object.keys(row);
  await run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => normalize(row[k])), id]);
  if (opts.emit !== false) emitChange([table]);
}

export async function softDelete(table: SyncTable, id: string, opts: { emit?: boolean } = {}): Promise<void> {
  await run(`UPDATE ${table} SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?`, [nowIso(), id]);
  if (opts.emit !== false) emitChange([table]);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!r || r.value == null) return fallback;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
  emitChange(['settings']);
}
