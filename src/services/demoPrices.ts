import type { PriceOffer } from '@/domain/basket';
import { addDays, todayISO } from '@/domain/dates';
import { normalizeText } from '@/domain/text';

/**
 * DATOS DE DEMOSTRACIÓN — NO SON PRECIOS REALES.
 * Solo se generan si el usuario activa "Modo demostración" y siempre se etiquetan como tales en la interfaz.
 * Sirven para enseñar cómo funciona el comparador mientras no haya precios reales suficientes.
 */
const DEMO_STORES = ['mercadona', 'consum', 'lidl', 'carrefour', 'alcampo'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function demoOffersFor(itemName: string, _quantity: number): Omit<PriceOffer, 'itemId'>[] {
  const key = normalizeText(itemName);
  const base = 0.6 + (hash(key) % 450) / 100; // 0,60 € – 5,10 €
  const out: Omit<PriceOffer, 'itemId'>[] = [];
  DEMO_STORES.forEach((store, i) => {
    const h = hash(`${key}|${store}`);
    if (h % 7 === 0) return; // algunas tiendas "sin dato" para mostrar huecos
    const factor = 0.85 + (h % 30) / 100;
    const price = Math.round(base * factor * 100) / 100;
    const isOffer = h % 9 === 0;
    out.push({
      store,
      productName: `${itemName} (demo)`,
      price: isOffer ? Math.round(price * 0.85 * 100) / 100 : price,
      regularPrice: isOffer ? price : null,
      isOffer,
      match: 'identical',
      observedAt: addDays(todayISO(), -(h % 10) - i),
      source: 'demo',
    });
  });
  return out;
}
