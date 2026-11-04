import { pluralize } from './text';
import { formatQuantity, Unit } from './units';

export interface RestockInput {
  productId: string;
  name: string;
  quantity: number;
  unit: Unit;
  minQuantity: number | null;
  /** Cantidad que el hogar suele tener (configurada o aprendida del historial). */
  usualQuantity: number | null;
  alreadyInList: boolean;
}

export interface RestockSuggestion {
  productId: string;
  name: string;
  suggestedQuantity: number;
  unit: Unit;
  reason: 'out' | 'low';
  message: string;
}

/**
 * Sugiere reponer productos que han llegado a su mínimo.
 * No añade nada por sí mismo: el usuario decide.
 */
export function restockSuggestions(items: RestockInput[]): RestockSuggestion[] {
  const out: RestockSuggestion[] = [];
  for (const it of items) {
    if (it.alreadyInList) continue;
    const min = it.minQuantity ?? 0;
    const isOut = it.quantity <= 0;
    if (!isOut && !(min > 0 && it.quantity <= min)) continue;
    const target = Math.max(it.usualQuantity ?? 0, min > 0 ? min + 1 : 1);
    const suggested = Math.max(1, Math.ceil(target - Math.max(0, it.quantity)));
    const unitWord = it.unit === 'ud' ? '' : ` ${formatQuantity(1, it.unit).split(' ')[1]}`;
    let message: string;
    if (isOut) {
      message = `Te has quedado sin ${it.name.toLowerCase()}. ¿Añadir ${suggested}${unitWord} a la lista?`;
    } else if (it.usualQuantity && it.usualQuantity > it.quantity) {
      message = `Normalmente tienes ${formatNum(it.usualQuantity)}, pero ahora ${it.quantity === 1 ? 'queda' : 'quedan'} ${formatNum(it.quantity)}. ¿Quieres añadir ${suggested} a tu lista?`;
    } else {
      message = `Solo ${it.quantity === 1 ? 'queda' : 'quedan'} ${formatNum(it.quantity)} ${pluralize(it.quantity, 'unidad', 'unidades')}. ¿Lo añadimos a la lista?`;
    }
    out.push({ productId: it.productId, name: it.name, suggestedQuantity: suggested, unit: it.unit, reason: isOut ? 'out' : 'low', message });
  }
  return out.sort((a, b) => (a.reason === b.reason ? a.name.localeCompare(b.name) : a.reason === 'out' ? -1 : 1));
}

/**
 * "Cantidad habitual" aprendida: mediana de las existencias justo después de cada reposición.
 * `levelsAfterRestock` son las cantidades totales tras cada compra registrada.
 */
export function learnUsualQuantity(levelsAfterRestock: number[]): number | null {
  const v = levelsAfterRestock.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 2) return null;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return Math.round(median);
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
