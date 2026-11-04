import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/services/haptics';
import { useTheme } from '@/theme/ThemeProvider';

const APressable = Animated.createAnimatedComponent(Pressable);

export interface ScalePressableProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Escala al pulsar (1 = sin efecto). */
  scaleTo?: number;
  hapticOnPress?: boolean;
}

/** Pulsable con micro-animación de escala y feedback háptico opcional. */
export function ScalePressable({ style, children, scaleTo = 0.97, hapticOnPress, onPressIn, onPressOut, onPress, ...rest }: ScalePressableProps) {
  const { reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        if (!reduceMotion) scale.value = withTiming(scaleTo, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduceMotion) scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticOnPress) haptic.tap();
        onPress?.(e);
      }}
      style={[style, animated]}>
      {children}
    </APressable>
  );
}
