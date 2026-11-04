import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { ScalePressable } from './Pressable';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      hapticOnPress
      onPress={onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          height: 36,
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.text : colors.surface,
          borderWidth: 1,
          borderColor: selected ? colors.text : colors.border,
        },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.background : colors.textMuted} /> : null}
      <Text variant="caption" style={{ color: selected ? colors.background : colors.text }}>
        {label}
      </Text>
      {count != null ? (
        <Text variant="label" style={{ color: selected ? colors.background : colors.textMuted }}>
          {count}
        </Text>
      ) : null}
    </ScalePressable>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'primary' | 'warning' | 'danger' | 'info' | 'accent' | 'success'; icon?: IconName }) {
  const { colors } = useTheme();
  const map = {
    neutral: [colors.surfaceAlt, colors.textMuted],
    primary: [colors.primarySoft, colors.primary],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    info: [colors.infoSoft, colors.info],
    accent: [colors.accentSoft, colors.accent],
    success: [colors.successSoft, colors.success],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text variant="label" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
