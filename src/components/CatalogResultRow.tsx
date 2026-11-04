import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { View } from 'react-native';

import { ProductThumb } from '@/components/ProductThumb';
import { Row, ScalePressable, Text } from '@/components/ui';
import { formatEuro } from '@/domain/text';
import { storeColor, storeName } from '@/services/catalog/stores';
import type { CatalogProduct } from '@/services/catalog/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Fila de resultado de catálogo (Open Food Facts o catálogo de supermercado con precio fechado). */
export function CatalogResultRow({ p, onPress, icon = 'add-circle', label }: { p: CatalogProduct; onPress: () => void; icon?: IconName; label?: string }) {
  const { colors } = useTheme();
  const sp = p.storePrice;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={label ?? `${p.name} ${p.quantityText ?? ''}${sp ? `, ${formatEuro(sp.price)} en ${storeName(sp.store)}` : ''}`}
      onPress={onPress}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <ProductThumb uri={p.imageUrl} category={p.category} size={46} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {p.name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {[sp ? null : p.brand, p.quantityText, p.barcode].filter(Boolean).join(' · ')}
        </Text>
        {sp ? (
          <Row gap={6}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: storeColor(sp.store) }} />
            <Text variant="caption" color="textMuted">
              {storeName(sp.store)} ·{' '}
            </Text>
            {sp.regularPrice && sp.regularPrice > sp.price ? (
              <Text variant="caption" color="textFaint" style={{ textDecorationLine: 'line-through' }}>
                {formatEuro(sp.regularPrice)}
              </Text>
            ) : null}
            <Text variant="caption" color={sp.regularPrice && sp.regularPrice > sp.price ? 'danger' : 'text'} style={{ fontWeight: '700' }}>
              {formatEuro(sp.price)}
              {sp.unitLabel === '/ud.' ? '' : ` ${sp.unitLabel}`}
            </Text>
          </Row>
        ) : null}
      </View>
      <Ionicons name={icon} size={26} color={colors.primary} />
    </ScalePressable>
  );
}
