import type { PriceSource } from '@/domain/basket';
import type { ISODate } from '@/domain/dates';
import type { ExpiryKind } from '@/domain/expiry';
import type { Unit } from '@/domain/units';

export interface Location {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
}

export type ProductSource = 'manual' | 'off' | 'receipt' | 'photo' | 'list' | 'catalog';

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  image_url: string | null;
  category: string | null;
  subcategory: string | null;
  unit: Unit;
  package_count: number | null;
  package_amount: number | null;
  package_unit: Unit | null;
  packaging: string | null;
  default_location_id: string | null;
  min_quantity: number | null;
  usual_quantity: number | null;
  preferred_store: string | null;
  notes: string | null;
  source: ProductSource;
  created_at: string;
  updated_at: string;
}

/** Producto con existencias agregadas. */
export interface ProductWithStock extends Product {
  quantity: number;
  next_expiry: ISODate | null;
  next_expiry_kind: ExpiryKind | null;
  location_names: string | null;
  batch_count: number;
  last_price: number | null;
}

export interface Batch {
  id: string;
  product_id: string;
  location_id: string | null;
  quantity: number;
  expiry_date: ISODate | null;
  expiry_kind: ExpiryKind | null;
  opened_at: ISODate | null;
  purchased_at: ISODate | null;
  price_paid: number | null;
  store: string | null;
  created_at: string;
}

export type MovementReason = 'purchase' | 'consume' | 'discard' | 'expired' | 'adjust';

export interface Movement {
  id: string;
  product_id: string;
  batch_id: string | null;
  delta: number;
  reason: MovementReason;
  unit_price: number | null;
  store: string | null;
  author: string | null;
  created_at: string;
}

export type ListKind = 'weekly' | 'monthly' | 'cleaning' | 'party' | 'custom';

export interface ShoppingList {
  id: string;
  name: string;
  kind: ListKind;
  status: 'active' | 'archived';
  store: string | null;
  emoji: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListWithCounts extends ShoppingList {
  total_items: number;
  checked_items: number;
  estimated_total: number | null;
}

export interface ListItem {
  id: string;
  list_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit: Unit;
  category: string | null;
  estimated_price: number | null;
  checked: number;
  checked_at: string | null;
  actual_price: number | null;
  sort_order: number;
  note: string | null;
  image_url?: string | null;
  brand?: string | null;
}

export interface Purchase {
  id: string;
  list_id: string | null;
  store: string | null;
  total: number;
  purchased_at: ISODate;
  source: 'list' | 'receipt' | 'manual';
  item_count: number;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  discount: number;
}

export interface PriceObservation {
  id: string;
  product_id: string | null;
  barcode: string | null;
  product_name: string;
  brand: string | null;
  store: string;
  store_location: string | null;
  price: number;
  regular_price: number | null;
  is_offer: number;
  package_count: number | null;
  package_amount: number | null;
  package_unit: Unit | null;
  observed_at: ISODate;
  source: PriceSource;
  source_ref: string | null;
}

export const CATEGORIES: { name: string; icon: string; subcategories: string[] }[] = [
  { name: 'Lácteos y huevos', icon: 'egg-outline', subcategories: ['Leche', 'Yogures', 'Quesos', 'Huevos', 'Mantequilla'] },
  { name: 'Frutas y verduras', icon: 'leaf-outline', subcategories: ['Fruta', 'Verdura', 'Hortalizas'] },
  { name: 'Carne y pescado', icon: 'fish-outline', subcategories: ['Carne', 'Pescado', 'Embutido'] },
  { name: 'Despensa', icon: 'basket-outline', subcategories: ['Arroz y pasta', 'Legumbres', 'Aceite y vinagre', 'Conservas', 'Harinas', 'Especias', 'Salsas'] },
  { name: 'Panadería y desayuno', icon: 'cafe-outline', subcategories: ['Pan', 'Cereales', 'Galletas', 'Café e infusiones', 'Cacao'] },
  { name: 'Congelados', icon: 'snow-outline', subcategories: ['Verduras', 'Pescado', 'Pizzas', 'Helados'] },
  { name: 'Bebidas', icon: 'wine-outline', subcategories: ['Agua', 'Refrescos', 'Zumos', 'Cerveza', 'Vino'] },
  { name: 'Limpieza', icon: 'sparkles-outline', subcategories: ['Lejía', 'Multiusos', 'Lavavajillas', 'Fregasuelos', 'Bayetas'] },
  { name: 'Lavandería', icon: 'shirt-outline', subcategories: ['Detergente', 'Suavizante', 'Quitamanchas'] },
  { name: 'Higiene personal', icon: 'water-outline', subcategories: ['Gel', 'Champú', 'Dental', 'Desodorante', 'Papel higiénico'] },
  { name: 'Bebé', icon: 'happy-outline', subcategories: ['Alimentación infantil', 'Pañales', 'Higiene bebé', 'Biberones'] },
  { name: 'Mascotas', icon: 'paw-outline', subcategories: ['Pienso', 'Comida húmeda', 'Arena', 'Snacks'] },
  { name: 'Otros', icon: 'cube-outline', subcategories: [] },
];

export const DEFAULT_LOCATIONS: { name: string; icon: string }[] = [
  { name: 'Nevera', icon: 'thermometer-outline' },
  { name: 'Congelador', icon: 'snow-outline' },
  { name: 'Despensa', icon: 'file-tray-stacked-outline' },
  { name: 'Armario de limpieza', icon: 'sparkles-outline' },
  { name: 'Baño', icon: 'water-outline' },
];
