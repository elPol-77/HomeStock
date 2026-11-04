import type { PriceSource } from '@/domain/basket';
import type { ISODate } from '@/domain/dates';
import type { PackageSize } from '@/domain/units';

export type CatalogSource = 'off' | 'obf' | 'opf' | 'opff' | 'local' | 'demo';

export const CATALOG_SOURCE_LABEL: Record<CatalogSource, string> = {
  off: 'Open Food Facts',
  obf: 'Open Beauty Facts',
  opf: 'Open Products Facts',
  opff: 'Open Pet Food Facts',
  local: 'Tu hogar',
  demo: 'Demostración',
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
