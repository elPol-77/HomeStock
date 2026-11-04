import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, shadow } from '@/theme/tokens';

import { ScalePressable } from './Pressable';

export function Card({
  children,
  onPress,
  style,
  padded = true,
  elevated = false,
  tone = 'surface',
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
  tone?: 'surface' | 'alt' | 'primary' | 'accent' | 'warning' | 'danger' | 'info';
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const bg = {
    surface: colors.surface,
    alt: colors.surfaceAlt,
    primary: colors.primarySoft,
    accent: colors.accentSoft,
    warning: colors.warningSoft,
    danger: colors.dangerSoft,
    info: colors.infoSoft,
  }[tone];
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius.lg,
    padding: padded ? 16 : 0,
    borderWidth: tone === 'surface' ? 1 : 0,
    borderColor: colors.border,
    ...(elevated ? shadow(colors, 2) : {}),
  };
  if (onPress) {
    return (
      <ScalePressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} scaleTo={0.98} style={[base, style]}>
        {children}
      </ScalePressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
