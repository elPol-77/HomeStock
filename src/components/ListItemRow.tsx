import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import type { ListItem } from '@/data/types';
import { formatEuro } from '@/domain/text';
import { removeListItem, setItemChecked, updateListItem } from '@/data/lists';
import { haptic } from '@/services/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { ProductThumb } from './ProductThumb';
import { IconButton, ScalePressable, Stepper, Text } from './ui';

export function Checkbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  const { colors, reduceMotion } = useTheme();
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : withSpring(checked ? 1 : 0.6, { damping: 12 }) }],
    opacity: reduceMotion ? (checked ? 1 : 0) : withTiming(checked ? 1 : 0, { duration: 150 }),
  }));
  return (
    <ScalePressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => {
        if (checked) haptic.tap();
        else haptic.success();
        onToggle();
      }}
      hitSlop={10}
      scaleTo={0.85}
      style={{ width: 30, height: 30, borderRadius: 10, borderWidth: 2, borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={anim}>
        <Ionicons name="checkmark" size={20} color={colors.onPrimary} />
      </Animated.View>
    </ScalePressable>
  );
}

export const ListItemRow = memo(function ListItemRow({ item, mode }: { item: ListItem; mode: 'edit' | 'shop' }) {
  const { colors } = useTheme();
  const checked = item.checked === 1;
  const price = item.actual_price ?? item.estimated_price;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: mode === 'shop' ? 14 : 10,
        borderRadius: radius.lg,
        backgroundColor: checked ? colors.surfaceAlt : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: checked ? 0.75 : 1,
      }}>
      <Checkbox checked={checked} onToggle={() => setItemChecked(item.id, !checked)} label={`${item.name}${checked ? ', en el carro' : ''}`} />
      <ProductThumb uri={item.image_url} category={item.category} size={mode === 'shop' ? 56 : 40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={mode === 'shop' ? 'subheading' : 'bodyStrong'} numberOfLines={2} style={checked ? { textDecorationLine: 'line-through' } : undefined}>
          {item.name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {[item.brand, item.category, price != null ? `~${formatEuro(price * item.quantity)}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {mode === 'edit' || !checked ? (
        <Stepper size="sm" value={item.quantity} min={1} label={item.name} onChange={(v) => updateListItem(item.id, { quantity: v })} />
      ) : (
        <Text variant="bodyStrong">×{item.quantity}</Text>
      )}
      {mode === 'edit' ? <IconButton icon="close" size={32} tone="plain" label={`Quitar ${item.name}`} onPress={() => removeListItem(item.id)} /> : null}
    </View>
  );
});
