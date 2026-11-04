/**
 * Esquema SQLite local. Las tablas "sincronizables" comparten columnas:
 *   id (uuid), household_id, created_at, updated_at, deleted (borrado lógico), dirty (pendiente de subir).
 * La columna `quantity` de batches es una caché local = SUM(stock_movements.delta) del lote.
 */
export const SYNC_TABLES = [
  'locations',
  'products',
  'batches',
  'stock_movements',
  'shopping_lists',
  'list_items',
  'purchases',
  'purchase_items',
  'price_observations',
  'savings',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];
export type Table = SyncTable | 'settings' | 'catalog_cache' | 'households';

const syncCols = `
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1`;

export const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    remote INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS catalog_cache (
    key TEXT PRIMARY KEY NOT NULL,
    json TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'cube-outline',
    sort_order INTEGER NOT NULL DEFAULT 0,${syncCols}
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    barcode TEXT,
    image_url TEXT,
    category TEXT,
    subcategory TEXT,
    unit TEXT NOT NULL DEFAULT 'ud',
    package_count REAL,
    package_amount REAL,
    package_unit TEXT,
    packaging TEXT,
    default_location_id TEXT,
    min_quantity REAL,
    usual_quantity REAL,
    preferred_store TEXT,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',${syncCols}
  );
  CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    location_id TEXT,
    quantity REAL NOT NULL DEFAULT 0,
    expiry_date TEXT,
    expiry_kind TEXT,
    opened_at TEXT,
    purchased_at TEXT,
    price_paid REAL,
    store TEXT,${syncCols}
  );
  CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
  CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    delta REAL NOT NULL,
    reason TEXT NOT NULL,
    unit_price REAL,
    store TEXT,
    author TEXT,${syncCols}
  );
  CREATE INDEX IF NOT EXISTS idx_movements_batch ON stock_movements(batch_id);
  CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
  CREATE TABLE IF NOT EXISTS shopping_lists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'custom',
    status TEXT NOT NULL DEFAULT 'active',
    store TEXT,
    emoji TEXT,${syncCols}
  );
  CREATE TABLE IF NOT EXISTS list_items (
    id TEXT PRIMARY KEY NOT NULL,
    list_id TEXT NOT NULL,
    product_id TEXT,
    name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'ud',
    category TEXT,
    estimated_price REAL,
    checked INTEGER NOT NULL DEFAULT 0,
    checked_at TEXT,
    actual_price REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT,${syncCols}
  );
  CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY NOT NULL,
    list_id TEXT,
    store TEXT,
    total REAL NOT NULL DEFAULT 0,
    purchased_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'list',
    item_count INTEGER NOT NULL DEFAULT 0,${syncCols}
  );
  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY NOT NULL,
    purchase_id TEXT NOT NULL,
    product_id TEXT,
    name TEXT NOT NULL,
    category TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL,
    total_price REAL,
    discount REAL NOT NULL DEFAULT 0,${syncCols}
  );
  CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
  CREATE TABLE IF NOT EXISTS price_observations (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT,
    barcode TEXT,
    product_name TEXT NOT NULL,
    brand TEXT,
    store TEXT NOT NULL,
    store_location TEXT,
    price REAL NOT NULL,
    regular_price REAL,
    is_offer INTEGER NOT NULL DEFAULT 0,
    package_count REAL,
    package_amount REAL,
    package_unit TEXT,
    observed_at TEXT NOT NULL,
    source TEXT NOT NULL,
    source_ref TEXT,${syncCols}
  );
  CREATE INDEX IF NOT EXISTS idx_prices_product ON price_observations(product_id);
  CREATE INDEX IF NOT EXISTS idx_prices_barcode ON price_observations(barcode);
  CREATE TABLE IF NOT EXISTS savings (
    id TEXT PRIMARY KEY NOT NULL,
    purchase_id TEXT,
    product_id TEXT,
    amount REAL NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    note TEXT,${syncCols}
  );
  `,
];
