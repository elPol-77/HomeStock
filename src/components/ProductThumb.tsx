import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { View } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { CATEGORIES } from '@/data/types';
import { BUNDLED_IMAGES } from '@/services/catalog/bundledImages';
import { packImageUri, usePackImages } from '@/services/catalog/imagePack';
import { useTheme } from '@/theme/ThemeProvider';


export function categoryIcon(category: string | null | undefined): string {
  return CATEGORIES.find((c) => c.name === category)?.icon ?? 'mci:package-variant-closed';
}

export function categoryTint(category: string | null | undefined): string {
  return CATEGORIES.find((c) => c.name === category)?.tint ?? '#7D8B84';
}

/** Icono de categoría en un círculo de su color. */
export function CategoryBadge({ category, size = 40 }: { category: string | null | undefined; size?: number }) {
  const tint = categoryTint(category);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center' }}>
      <AppIcon name={categoryIcon(category)} size={size * 0.55} color={tint} />
    </View>
  );
}

/** Resuelve una imagen guardada como texto: URL normal o foto incluida en la app ("bundled:<id>"). */
/**
 * Origen de la foto: las incluidas en la app («bundled:<id>») salen al instante.
 * Para las de Open Food Facts en miniatura pedimos la versión de 200 px (la de 400 pesa el doble
 * y su servidor es lento); en tamaños grandes se mantiene la de 400.
 */
export function imageSource(uri: string | null | undefined, size = 52): number | { uri: string } | null {
  if (!uri) return null;
  if (uri.startsWith('bundled:')) {
    const id = uri.slice(8);
    const local = BUNDLED_IMAGES[id];
    if (local) return local;
    const packed = packImageUri(id);
    return packed ? { uri: packed } : null;
  }
  if (size <= 80 && uri.includes('images.openfoodfacts.org')) return { uri: uri.replace(/\.(400|full)\.jpg$/, '.200.jpg') };
  return { uri };
}

/** Foto del producto con respaldo de icono de categoría si no hay imagen o falla la carga. */
/**
 * Foto del producto con el icono de su categoría debajo: mientras la foto llega (o si no hay / falla)
 * se ve el icono, nunca un hueco en blanco. Las fotos incluidas en la app salen al instante;
 * las de internet se guardan en memoria y disco para que la segunda vez también sean instantáneas.
 */
export const ProductThumb = memo(function ProductThumb({ uri, category, size = 52 }: { uri?: string | null; category?: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const r = size * 0.27;
  // Se vuelve a pintar cuando terminan de extraerse las fotos empaquetadas (primer arranque).
  usePackImages((s) => s.ready);
  const source = failed ? null : imageSource(uri, size);
  const local = typeof source === 'number' || (!!source && source.uri.startsWith('file:'));
  const tint = categoryTint(category);
  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', backgroundColor: source ? '#FFFFFF' : `${tint}1F`, borderWidth: source ? 1 : 0, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      {!local ? <AppIcon name={categoryIcon(category)} size={size * 0.5} color={tint} /> : null}
      {source ? (
        <Image
          source={source}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="contain"
          transition={local ? 0 : 120}
          cachePolicy="memory-disk"
          priority="high"
          recyclingKey={uri ?? undefined}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
});
