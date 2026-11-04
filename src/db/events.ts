import { useCallback, useEffect, useRef, useState } from 'react';

import type { Table } from './schema';

type Listener = (tables: Set<string>) => void;
const listeners = new Set<Listener>();

/** Notifica a las pantallas suscritas que han cambiado datos de estas tablas. */
export function emitChange(tables: readonly (Table | string)[]) {
  const set = new Set<string>(tables);
  listeners.forEach((l) => l(set));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Ejecuta una consulta y la vuelve a ejecutar cuando cambian las tablas indicadas.
 * Mantiene los datos anteriores mientras recarga (sin parpadeos).
 */
export function useLiveQuery<T>(query: () => Promise<T>, tables: readonly Table[], deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const queryRef = useRef(query);
  const seq = useRef(0);
  // La consulta más reciente (puede capturar props nuevas) sin re-suscribirse en cada render.
  useEffect(() => {
    queryRef.current = query;
  });

  const load = useCallback(() => {
    const id = ++seq.current;
    queryRef
      .current()
      .then((r) => {
        if (id === seq.current) {
          setData(r);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (id === seq.current) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  const depsKey = deps.map((d) => String(d)).join('|');
  const tablesKey = tables.join(',');
  useEffect(() => {
    queryRef.current = query;
    setLoading(true);
    load();
    const watched = new Set<string>(tablesKey.split(','));
    return subscribe((changed) => {
      for (const t of changed) {
        if (watched.has(t)) {
          load();
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, depsKey, tablesKey]);

  return { data, loading, error, reload: load };
}
