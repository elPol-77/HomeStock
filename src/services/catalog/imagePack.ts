import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { getSetting, setSetting } from '@/db/client';

/**
 * Fotos de catálogos grandes (Consum: ~8.500) empaquetadas en un único archivo para que el empaquetador
 * de la app no se quede sin memoria. La primera vez que se abre la app (o tras una actualización del
 * paquete) se extraen a la carpeta de documentos; desde entonces se cargan al instante desde el móvil.
 * Mientras tanto, las miniaturas muestran el icono de la categoría.
 */

interface PackIndex {
  v: string;
  items: Record<string, [number, number]>;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const PACKS: { store: string; module: number; index: PackIndex }[] = [
  {
    store: 'consum',
    module: require('../../../assets/catalog/pack/consum.imgpack'),
    index: require('../../../assets/catalog/pack/consum.imgpack.json') as PackIndex,
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

const ROOT = Platform.OS === 'web' ? null : new Directory(Paths.document, 'catalog-img');
const BASE = ROOT ? (ROOT.uri.endsWith('/') ? ROOT.uri : `${ROOT.uri}/`) : '';

export const usePackImages = create<{ ready: Record<string, boolean>; progress: number | null }>(() => ({ ready: {}, progress: null }));

const storeOf = new Map<string, string>();
for (const p of PACKS) for (const id of Object.keys(p.index.items)) storeOf.set(id, p.store);

/** ¿Hay foto empaquetada para este producto del catálogo? */
export function packHas(id: string): boolean {
  return storeOf.has(id);
}

/** URI de la foto ya extraída, o null si aún no está lista (se muestra el icono de categoría). */
export function packImageUri(id: string): string | null {
  const store = storeOf.get(id);
  if (!store || !usePackImages.getState().ready[store]) return null;
  return `${BASE}${id}.webp`;
}

let running = false;

/** Extrae los paquetes que falten o hayan cambiado. Se llama al arrancar, sin bloquear la interfaz. */
export async function preparePackImages(): Promise<void> {
  if (!ROOT || running) return;
  running = true;
  try {
    for (const pack of PACKS) {
      const key = `imgpack:${pack.store}`;
      if ((await getSetting<string | null>(key, null)) === pack.index.v && ROOT.exists) {
        usePackImages.setState((s) => ({ ready: { ...s.ready, [pack.store]: true } }));
        continue;
      }
      ROOT.create({ intermediates: true, idempotent: true });
      const asset = Asset.fromModule(pack.module);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('Paquete de fotos no disponible');
      const bytes = await new File(asset.localUri).bytes();
      const entries = Object.entries(pack.index.items);
      for (let i = 0; i < entries.length; i++) {
        const [id, [off, len]] = entries[i];
        new File(ROOT, `${id}.webp`).writeSync(bytes.subarray(off, off + len));
        if (i % 250 === 0) {
          usePackImages.setState({ progress: i / entries.length });
          await new Promise((r) => setTimeout(r, 0)); // deja respirar a la interfaz
        }
      }
      await setSetting(key, pack.index.v);
      usePackImages.setState((s) => ({ ready: { ...s.ready, [pack.store]: true }, progress: null }));
    }
  } catch (e) {
    console.warn('No se pudieron preparar las fotos del catálogo', e);
    usePackImages.setState({ progress: null });
  } finally {
    running = false;
  }
}
