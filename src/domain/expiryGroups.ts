/** Unas cuantas unidades que caducan el mismo día. */
export interface ExpiryGroup {
  qty: number;
  date: string | null;
}

export const totalUnits = (groups: ExpiryGroup[]) => groups.reduce((s, g) => s + g.qty, 0);

/** Une los grupos con la misma fecha (un lote por fecha) y quita los vacíos. */
export function mergeExpiryGroups(groups: ExpiryGroup[]): ExpiryGroup[] {
  const map = new Map<string, number>();
  for (const g of groups) if (g.qty > 0) map.set(g.date ?? '', (map.get(g.date ?? '') ?? 0) + g.qty);
  return [...map.entries()].map(([date, qty]) => ({ qty, date: date || null }));
}

