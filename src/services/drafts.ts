import { create } from 'zustand';

import type { ExpiryKind } from '@/domain/expiry';
import type { ParsedReceipt } from '@/domain/receiptParser';
import type { PackageSize } from '@/domain/units';

import type { CatalogProduct } from './catalog/types';

/** Borrador de producto que pasa del escáner/foto/búsqueda al formulario. */
export interface ProductDraft {
  name: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  category: string | null;
  pkg: PackageSize | null;
  packaging: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  /** Aviso honesto para el usuario (p. ej. "Coincidencia probable, revisa los datos"). */
  notice: string | null;
  origin: 'barcode' | 'photo' | 'search' | 'manual' | 'list';
}

export function draftFromCatalog(p: CatalogProduct, origin: ProductDraft['origin'], notice: string | null = null): ProductDraft {
  return {
    name: p.name,
    brand: p.brand,
    barcode: p.barcode,
    imageUrl: p.imageUrl,
    category: p.category,
    pkg: p.pkg,
    packaging: p.packaging,
    sourceLabel: p.source === 'local' ? 'Tu hogar' : 'Open Food Facts',
    sourceUrl: p.url,
    notice,
    origin,
  };
}

export interface ExpiryResult {
  date: string;
  kind: ExpiryKind | null;
}

interface DraftStore {
  product: ProductDraft | null;
  expiry: ExpiryResult | null;
  /** Para qué se pidió la fecha (id de lote, línea de compra…). */
  expiryTarget: string | null;
  receipt: ParsedReceipt | null;
  setProduct: (d: ProductDraft | null) => void;
  requestExpiry: (target: string) => void;
  setExpiry: (r: ExpiryResult | null) => void;
  takeExpiry: (target: string) => ExpiryResult | null;
  setReceipt: (r: ParsedReceipt | null) => void;
}

export const useDrafts = create<DraftStore>((set, get) => ({
  product: null,
  expiry: null,
  expiryTarget: null,
  receipt: null,
  setProduct: (product) => set({ product }),
  requestExpiry: (target) => set({ expiryTarget: target, expiry: null }),
  setExpiry: (expiry) => set({ expiry }),
  takeExpiry: (target) => {
    const { expiry, expiryTarget } = get();
    if (expiry && expiryTarget === target) {
      set({ expiry: null, expiryTarget: null });
      return expiry;
    }
    return null;
  },
  setReceipt: (receipt) => set({ receipt }),
}));
