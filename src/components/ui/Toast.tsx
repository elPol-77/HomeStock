import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, shadow } from '@/theme/tokens';

import { ScalePressable } from './Pressable';
import { Text } from './Text';

export function ToastHost() {
  const current = useToast((s) => s.current);
  const hide = useToast((s) => s.hide);
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  if (!current) return null;
  const icon = { success: 'checkmark-circle', info: 'information-circle', warning: 'alert-circle', danger: 'close-circle' }[current.tone] as 'checkmark-circle';
  const tint = { success: colors.success, info: colors.info, warning: colors.warning, danger: colors.danger }[current.tone];
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96 }}>
      <Animated.View
        key={current.id}
        entering={reduceMotion ? undefined : FadeInDown.springify().damping(16)}
        exiting={reduceMotion ? undefined : FadeOutDown.duration(180)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.text, ...shadow(colors, 3) }}>
        <Ionicons name={icon} size={22} color={tint} />
        <Text variant="bodyStrong" style={{ color: colors.background, flex: 1 }}>
          {current.text}
        </Text>
        {current.action ? (
          <ScalePressable
            accessibilityRole="button"
            onPress={() => {
              current.action?.onPress();
              hide();
            }}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.primary }}>
            <Text variant="caption" style={{ color: colors.onPrimary }}>
              {current.action.label}
            </Text>
          </ScalePressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
