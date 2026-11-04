import { Text as RNText, TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ColorName, type as typeScale, TypeVariant } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: ColorName;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return <RNText {...rest} maxFontSizeMultiplier={1.6} style={[typeScale[variant], { color: colors[color], textAlign: align }, style]} />;
}
