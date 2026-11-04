import { router } from 'expo-router';
import { memo } from 'react';
import { View } from 'react-native';

import type { ProductWithStock } from '@/data/types';
import { todayISO } from '@/domain/dates';
import { expiryLabel, expiryStatus } from '@/domain/expiry';
import { stockLevel } from '@/domain/inventory';
import { formatPackage, UNIT_SHORT } from '@/domain/units';
import { packageOf } from '@/data/products';
import { decrementProduct, incrementProduct } from '@/services/inventoryActions';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { ProductThumb } from './ProductThumb';
import { Badge, ScalePressable, Stepper, Text } from './ui';

export const ProductRow = memo(function ProductRow({ product, warnDays }: { product: ProductWithStock; warnDays: number }) {
  const { colors } = useTheme();
  const level = stockLevel(product.quantity, product.min_quantity);
  const st = expiryStatus(product.next_expiry, product.next_expiry_kind, warnDays, todayISO());
  const pkg = formatPackage(packageOf(product));
  const meta = [product.brand, pkg, product.location_names].filter(Boolean).join(' · ');
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${product.quantity} ${UNIT_SHORT[product.unit]}`}
      accessibilityHint="Abre la ficha del producto"
      onPress={() => router.push(`/product/${product.id}`)}
      scaleTo={0.985}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <ProductThumb uri={product.image_url} category={product.category} size={54} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {product.name}
        </Text>
        {meta ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {level === 'out' ? <Badge label="Agotado" tone="danger" /> : level === 'low' ? <Badge label="Quedan pocos" tone="warning" /> : null}
          {st !== 'none' && st !== 'ok' && product.quantity > 0 ? (
            <Badge label={expiryLabel(product.next_expiry, product.next_expiry_kind)} tone={st === 'expired' ? 'danger' : 'warning'} icon="alarm-outline" />
          ) : null}
        </View>
      </View>
      <Stepper
        size="sm"
        value={product.quantity}
        label={product.name}
        onChange={(v) => {
          if (v > product.quantity) incrementProduct(product.id, v - product.quantity);
          else decrementProduct(product.id, product.quantity - v);
        }}
      />
    </ScalePressable>
  );
});
