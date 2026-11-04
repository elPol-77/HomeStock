import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import type { Bucket } from '@/domain/stats';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './ui';

const ACircle = Animated.createAnimatedComponent(Circle);

function Bar({ value, max, i, color, height }: { value: number; max: number; i: number; color: string; height: number }) {
  const { reduceMotion } = useTheme();
  const h = useSharedValue(0);
  useEffect(() => {
    const target = max > 0 ? (value / max) * height : 0;
    h.value = reduceMotion ? target : withDelay(i * 40, withTiming(target, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [value, max, height, i, reduceMotion, h]);
  const style = useAnimatedStyle(() => ({ height: Math.max(2, h.value) }));
  return <Animated.View style={[{ width: '62%', borderRadius: 6, backgroundColor: color }, style]} />;
}

/** Gráfico de barras verticales animado. */
export function BarChart({ data, format, height = 140, highlightLast = true }: { data: Bucket[]; format: (n: number) => string; height?: number; highlightLast?: boolean }) {
  const { colors } = useTheme();
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <View accessible accessibilityLabel={data.map((d) => `${d.label}: ${format(d.value)}`).join(', ')}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 20, gap: 4 }}>
        {data.map((d, i) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            {d.value > 0 && (i === data.length - 1 || d.value === max) ? (
              <Text variant="label" color="textMuted" numberOfLines={1} style={{ fontSize: 10 }}>
                {format(d.value)}
              </Text>
            ) : null}
            <Bar value={d.value} max={max} i={i} height={height} color={highlightLast && i === data.length - 1 ? colors.primary : colors.primarySoft} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
        {data.map((d) => (
          <Text key={d.key} variant="label" color="textFaint" align="center" style={{ flex: 1, fontSize: 10 }} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function HBar({ ratio, color, i }: { ratio: number; color: string; i: number }) {
  const { reduceMotion } = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = reduceMotion ? ratio : withDelay(i * 50, withTiming(ratio, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [ratio, i, reduceMotion, w]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(2, w.value * 100)}%` }));
  return <Animated.View style={[{ height: 10, borderRadius: 5, backgroundColor: color }, style]} />;
}

/** Barras horizontales (ranking / comparación). */
export function HBarList({ data, format, colorFor }: { data: Bucket[]; format: (n: number) => string; colorFor?: (b: Bucket, i: number) => string }) {
  const { colors } = useTheme();
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <View style={{ gap: 12 }}>
      {data.map((d, i) => (
        <View key={d.key} style={{ gap: 6 }} accessible accessibilityLabel={`${d.label}: ${format(d.value)}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              {d.label}
            </Text>
            <Text variant="caption" color="textMuted">
              {format(d.value)}
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt }}>
            <HBar ratio={max ? d.value / max : 0} i={i} color={colorFor ? colorFor(d, i) : colors.primary} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Arc({ cx, r, stroke, color, from, len, i, circumference }: { cx: number; r: number; stroke: number; color: string; from: number; len: number; i: number; circumference: number }) {
  const { reduceMotion } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduceMotion ? 1 : withDelay(i * 80, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [i, reduceMotion, p]);
  const props = useAnimatedProps(() => ({ strokeDasharray: [len * p.value, circumference] as unknown as string, strokeDashoffset: -from }));
  return <ACircle cx={cx} cy={cx} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="butt" animatedProps={props} />;
}

/** Gráfico de anillo por categorías. */
export function DonutChart({ data, size = 160, format }: { data: Bucket[]; size?: number; format: (n: number) => string }) {
  const { colors } = useTheme();
  const palette = [colors.primary, colors.accent, colors.info, colors.warning, colors.success, colors.danger, colors.textMuted];
  const total = data.reduce((s, d) => s + d.value, 0);
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }} accessible accessibilityLabel={data.map((d) => `${d.label}: ${format(d.value)}`).join(', ')}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
          {total > 0
            ? data.map((d, i) => {
                const len = (d.value / total) * c;
                const el = <Arc key={d.key} cx={size / 2} r={r} stroke={stroke} color={palette[i % palette.length]} from={acc} len={Math.max(0, len - 2)} i={i} circumference={c} />;
                acc += len;
                return el;
              })
            : null}
        </G>
      </Svg>
      <View style={{ flex: 1, gap: 6 }}>
        {data.slice(0, 6).map((d, i) => (
          <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette[i % palette.length] }} />
            <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
              {d.label}
            </Text>
            <Text variant="caption" color="textMuted">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
