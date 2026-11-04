import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { CATEGORIES } from '@/data/types';
import { BUNDLED_IMAGES } from '@/services/catalog/bundledImages';
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
export function imageSource(uri: string | null | undefined): number | { uri: string } | null {
  if (!uri) return null;
  if (uri.startsWith('bundled:')) return BUNDLED_IMAGES[uri.slice(8)] ?? null;
  return { uri };
}

/** Foto del producto con respaldo de icono de categoría si no hay imagen o falla la carga. */
export function ProductThumb({ uri, category, size = 52 }: { uri?: string | null; category?: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const r = size * 0.27;
  const source = imageSource(uri);
  if (source && !failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <Image
          source={source}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          transition={180}
          cachePolicy="disk"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: `${categoryTint(category)}1F`, alignItems: 'center', justifyContent: 'center' }}>
      <AppIcon name={categoryIcon(category)} size={size * 0.5} color={categoryTint(category)} />
    </View>
  );
}
