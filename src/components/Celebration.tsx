import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

const N = 14;

function Piece({ i, color }: { i: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(i * 25, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [i, t]);
  const angle = (i / N) * Math.PI * 2;
  const dist = 90 + (i % 3) * 30;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateX: Math.cos(angle) * dist * t.value }, { translateY: Math.sin(angle) * dist * t.value + 40 * t.value * t.value }, { scale: 1 - t.value * 0.4 }],
  }));
  return <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: i % 2 ? 5 : 2, backgroundColor: color }, style]} />;
}

/** Celebración discreta (se omite si el usuario ha pedido reducir el movimiento). */
export function Celebration() {
  const { colors, reduceMotion } = useTheme();
  if (reduceMotion) return null;
  const palette = [colors.primary, colors.accent, colors.warning, colors.info, colors.success];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {Array.from({ length: N }).map((_, i) => (
        <Piece key={i} i={i} color={palette[i % palette.length]} />
      ))}
    </View>
  );
}
