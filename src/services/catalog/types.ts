import type { PriceSource } from '@/domain/basket';
import type { ISODate } from '@/domain/dates';
import type { PackageSize } from '@/domain/units';

export type CatalogSource = 'off' | 'obf' | 'opf' | 'opff' | 'local' | 'store' | 'demo' | 'ai';

export const CATALOG_SOURCE_LABEL: Record<CatalogSource, string> = {
  off: 'Open Food Facts',
  obf: 'Open Beauty Facts',
  opf: 'Open Products Facts',
  opff: 'Open Pet Food Facts',
  local: 'Tu hogar',
  store: 'Catálogo del súper',
  demo: 'Demostración',
  ai: 'Reconocido con IA en tu foto',
};

export interface CatalogProduct {
  source: CatalogSource;
  barcode: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  quantityText: string | null;
  pkg: PackageSize | null;
  category: string | null;
  packaging: string | null;
  /** Página pública de la ficha (para verificarla). */
  url: string | null;
  /** Solo en catálogos incluidos de supermercado. */
  bundledId?: string;
  storePrice?: { store: string; price: number; regularPrice: number | null; unitLabel: string; date: string };
}

export interface ExternalPrice {
  barcode: string;
  productName: string | null;
  /** Clave de cadena (mercadona, lidl…) o nombre normalizado de la tienda. */
  store: string;
  storeName: string;
  storeLocation: string | null;
  price: number;
  regularPrice: number | null;
  isOffer: boolean;
  /** Si el precio es por kg (frutas al peso), no por envase. */
  perKg: boolean;
  date: ISODate;
  source: PriceSource;
  sourceRef: string;
  lat: number | null;
  lon: number | null;
}
