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

export const CATEGORIES: { name: string; icon: string; tint: string; subcategories: string[] }[] = [
  { name: 'Lácteos y huevos', icon: 'mci:cheese', tint: '#E9B949', subcategories: ['Leche', 'Yogures', 'Quesos', 'Huevos', 'Mantequilla'] },
  { name: 'Frutas y verduras', icon: 'mci:food-apple-outline', tint: '#5FA35A', subcategories: ['Fruta', 'Verdura', 'Hortalizas'] },
  { name: 'Carne y pescado', icon: 'mci:food-drumstick-outline', tint: '#D9705B', subcategories: ['Carne', 'Pescado', 'Embutido'] },
  { name: 'Despensa', icon: 'mci:pasta', tint: '#C08A4E', subcategories: ['Arroz y pasta', 'Legumbres', 'Aceite y vinagre', 'Conservas', 'Harinas', 'Especias', 'Salsas'] },
  { name: 'Panadería y desayuno', icon: 'mci:baguette', tint: '#B9783F', subcategories: ['Pan', 'Cereales', 'Galletas', 'Café e infusiones', 'Cacao'] },
  { name: 'Congelados', icon: 'mci:snowflake', tint: '#4D9CC7', subcategories: ['Verduras', 'Pescado', 'Pizzas', 'Helados'] },
  { name: 'Bebidas', icon: 'mci:bottle-wine-outline', tint: '#8E5BA8', subcategories: ['Agua', 'Refrescos', 'Zumos', 'Cerveza', 'Vino'] },
  { name: 'Limpieza', icon: 'mci:spray-bottle', tint: '#3FA6A0', subcategories: ['Lejía', 'Multiusos', 'Lavavajillas', 'Fregasuelos', 'Bayetas'] },
  { name: 'Lavandería', icon: 'mci:washing-machine', tint: '#5B7FC7', subcategories: ['Detergente', 'Suavizante', 'Quitamanchas'] },
  { name: 'Higiene personal', icon: 'mci:lotion-outline', tint: '#D46F9C', subcategories: ['Gel', 'Champú', 'Dental', 'Desodorante', 'Papel higiénico'] },
  { name: 'Bebé', icon: 'mci:baby-bottle-outline', tint: '#E58FB1', subcategories: ['Alimentación infantil', 'Pañales', 'Higiene bebé', 'Biberones'] },
  { name: 'Mascotas', icon: 'mci:paw-outline', tint: '#A0785A', subcategories: ['Pienso', 'Comida húmeda', 'Arena', 'Snacks'] },
  { name: 'Otros', icon: 'mci:package-variant-closed', tint: '#7D8B84', subcategories: [] },
];

export const DEFAULT_LOCATIONS: { name: string; icon: string }[] = [
  { name: 'Nevera', icon: 'mci:fridge-outline' },
  { name: 'Congelador', icon: 'mci:snowflake' },
  { name: 'Despensa', icon: 'mci:cupboard-outline' },
  { name: 'Armario de limpieza', icon: 'mci:spray-bottle' },
  { name: 'Baño', icon: 'mci:shower-head' },
];

/** Iconos antiguos de las zonas por defecto → iconos nuevos (migración visual). */
export const LEGACY_ZONE_ICONS: Record<string, string> = {
  'thermometer-outline': 'mci:fridge-outline',
  'snow-outline': 'mci:snowflake',
  'file-tray-stacked-outline': 'mci:cupboard-outline',
  'sparkles-outline': 'mci:spray-bottle',
  'water-outline': 'mci:shower-head',
};

/** Iconos para elegir al crear o editar una zona. */
export const ZONE_ICONS = [
  'mci:fridge-outline', 'mci:snowflake', 'mci:cupboard-outline', 'mci:countertop-outline', 'mci:spray-bottle', 'mci:shower-head',
  'mci:toilet', 'mci:wardrobe-outline', 'mci:archive-outline', 'mci:garage-variant', 'mci:sofa-outline', 'mci:bed-outline',
  'mci:basket-outline', 'mci:glass-wine', 'mci:paw-outline', 'mci:baby-bottle-outline', 'mci:home-variant-outline',
];
