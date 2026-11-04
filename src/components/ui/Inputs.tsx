import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, useEffect, useState } from 'react';
import { StyleProp, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/services/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';

import { ScalePressable } from './Pressable';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  containerStyle?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}

export function TextField({ label, hint, error, icon, containerStyle, right, style, ...rest }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? (
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 50,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
        }}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} /> : null}
        <TextInput
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={label ?? rest.placeholder}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.text, paddingVertical: 12 }, style]}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Control − cantidad + con rebote y háptica. */
export function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
  size = 'md',
  label,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  size?: 'sm' | 'md';
  label?: string;
  format?: (v: number) => string;
}) {
  const { colors, reduceMotion } = useTheme();
  const bump = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const btn = size === 'sm' ? 32 : 40;
  const change = (delta: number) => {
    const next = Math.max(min, Math.round((value + delta) * 1000) / 1000);
    if (next === value) {
      haptic.warning();
      return;
    }
    haptic.light();
    if (!reduceMotion) bump.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 10 }));
    onChange(next);
  };
  const shown = format ? format(value) : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace('.', ',');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size === 'sm' ? 8 : 12 }} accessibilityLabel={label}>
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel={`Restar ${label ?? ''}`.trim()}
        onPress={() => change(-step)}
        scaleTo={0.88}
        hitSlop={8}
        style={{ width: btn, height: btn, borderRadius: btn / 2, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: value <= min ? 0.4 : 1 }}>
        <Ionicons name="remove" size={btn * 0.5} color={colors.text} />
      </ScalePressable>
      <Animated.View style={[{ minWidth: size === 'sm' ? 28 : 40, alignItems: 'center' }, anim]}>
        <Text variant={size === 'sm' ? 'bodyStrong' : 'heading'} accessibilityLiveRegion="polite">
          {shown}
        </Text>
      </Animated.View>
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel={`Sumar ${label ?? ''}`.trim()}
        onPress={() => change(step)}
        scaleTo={0.88}
        hitSlop={8}
        style={{ width: btn, height: btn, borderRadius: btn / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="add" size={btn * 0.5} color={colors.onPrimary} />
      </ScalePressable>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 }} accessibilityRole="tablist">
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <ScalePressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            hapticOnPress
            onPress={() => onChange(o.value)}
            style={{ flex: 1, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? colors.surface : 'transparent' }}>
            <Text variant="caption" color={sel ? 'text' : 'textMuted'} numberOfLines={1}>
              {o.label}
            </Text>
          </ScalePressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({
  label,
  description,
  value,
  onChange,
  icon,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
}) {
  const { colors, reduceMotion } = useTheme();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = reduceMotion ? (value ? 1 : 0) : withTiming(value ? 1 : 0, { duration: 180 });
  }, [value, reduceMotion, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  return (
    <ScalePressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={() => {
        haptic.tap();
        onChange(!value);
      }}
      scaleTo={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      {icon ? <Ionicons name={icon} size={20} color={colors.textMuted} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? colors.primary : colors.surfacePressed }}>
        <Animated.View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' }, knob]} />
      </View>
    </ScalePressable>
  );
}
