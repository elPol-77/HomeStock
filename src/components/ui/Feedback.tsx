import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, useEffect, useState } from 'react';
import { DimensionValue, StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { Button } from './Button';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Estado vacío con ilustración de icono, explicación y acción real. */
export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  style,
}: {
  icon: IconName;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }, style]}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {text ? (
        <Text variant="body" color="textMuted" align="center" style={{ maxWidth: 320 }}>
          {text}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={{ marginTop: 8 }} /> : null}
      {secondaryLabel && onSecondary ? <Button title={secondaryLabel} variant="ghost" onPress={onSecondary} /> : null}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <EmptyState icon="cloud-offline-outline" title="Algo no ha ido bien" text={message} actionLabel={onRetry ? 'Reintentar' : undefined} onAction={onRetry} />;
}

/** Bloque con brillo animado mientras carga. */
export function Skeleton({ width = '100%', height = 16, rounded = radius.sm, style }: { width?: DimensionValue; height?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, reduceMotion } = useTheme();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduceMotion) t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduceMotion, t]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + t.value * 0.45 }));
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.skeleton }, animated, style]} />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Cargando" accessible>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Skeleton width={52} height={52} rounded={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProgressBar({ value, tone = 'primary', height = 8 }: { value: number; tone?: 'primary' | 'warning' | 'danger' | 'accent'; height?: number }) {
  const { colors, reduceMotion } = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    const v = Math.max(0, Math.min(1, value));
    w.value = reduceMotion ? v : withTiming(v, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [value, reduceMotion, w]);
  const animated = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  const fg = { primary: colors.primary, warning: colors.warning, danger: colors.danger, accent: colors.accent }[tone];
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ height, borderRadius: height, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: fg }, animated]} />
    </View>
  );
}

/** Contador animado (cuenta hacia el nuevo valor). */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  variant = 'number',
  color = 'text',
}: {
  value: number;
  format?: (n: number) => string;
  variant?: 'number' | 'title' | 'display' | 'heading' | 'bodyStrong';
  color?: 'text' | 'primary' | 'accent' | 'onPrimary' | 'warning' | 'danger';
}) {
  const { reduceMotion } = useTheme();
  const sv = useSharedValue(value);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduceMotion) {
      sv.value = value;
      setShown(value);
    } else {
      sv.value = withTiming(value, { duration: 700, easing: Easing.out(Easing.cubic) });
    }
  }, [value, reduceMotion, sv]);
  useAnimatedReaction(
    () => sv.value,
    (v) => {
      runOnJS(setShown)(v);
    },
  );
  return (
    <Text variant={variant} color={color} accessibilityLabel={format(value)}>
      {format(shown)}
    </Text>
  );
}
