import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { ScalePressable } from './Pressable';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityHint?: string;
}

export function Button({ title, onPress, variant = 'primary', size = 'md', icon, loading, disabled, style, full, accessibilityHint }: ButtonProps) {
  const { colors } = useTheme();
  const bg = {
    primary: colors.primary,
    secondary: colors.primarySoft,
    ghost: 'transparent',
    danger: colors.dangerSoft,
    accent: colors.accent,
  }[variant];
  const fg = {
    primary: colors.onPrimary,
    secondary: colors.primary,
    ghost: colors.primary,
    danger: colors.danger,
    accent: '#FFFFFF',
  }[variant];
  const h = size === 'sm' ? 38 : size === 'lg' ? 56 : 48;
  const inactive = disabled || loading;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hapticOnPress
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: bg, height: h, paddingHorizontal: size === 'sm' ? 14 : 20, opacity: disabled ? 0.45 : 1 },
        full && { alignSelf: 'stretch' },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
          <Text variant={size === 'sm' ? 'caption' : 'bodyStrong'} style={{ color: fg }} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </ScalePressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'default',
  size = 40,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  tone?: 'default' | 'primary' | 'danger' | 'plain';
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.dangerSoft : tone === 'plain' ? 'transparent' : colors.surfaceAlt;
  const fg = tone === 'primary' ? colors.onPrimary : tone === 'danger' ? colors.danger : colors.text;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      hapticOnPress
      onPress={onPress}
      scaleTo={0.9}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={icon} size={size * 0.5} color={fg} />
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
