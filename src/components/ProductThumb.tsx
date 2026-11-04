import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ComponentProps, useState } from 'react';
import { View } from 'react-native';

import { CATEGORIES } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function categoryIcon(category: string | null | undefined): IconName {
  return (CATEGORIES.find((c) => c.name === category)?.icon ?? 'cube-outline') as IconName;
}

/** Foto del producto con respaldo de icono de categoría si no hay imagen o falla la carga. */
export function ProductThumb({ uri, category, size = 52 }: { uri?: string | null; category?: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const r = size * 0.27;
  if (uri && !failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <Image
          source={{ uri }}
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
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={categoryIcon(category)} size={size * 0.46} color={colors.primary} />
    </View>
  );
}
