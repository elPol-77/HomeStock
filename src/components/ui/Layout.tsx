import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ComponentProps, ReactNode } from 'react';
import { RefreshControl, ScrollView, ScrollViewProps, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { IconButton } from './Button';
import { ScalePressable } from './Pressable';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const TAB_BAR_SPACE = 110;

/** Pantalla con cabecera grande, desplazable y respetando las zonas seguras. */
export function Screen({
  title,
  subtitle,
  back,
  right,
  children,
  scroll = true,
  contentStyle,
  refreshing,
  onRefresh,
  bottomInset = 'tab',
  footer,
  scrollProps,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: 'tab' | 'none' | 'safe';
  footer?: ReactNode;
  scrollProps?: ScrollViewProps;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = bottomInset === 'tab' ? TAB_BAR_SPACE + insets.bottom : bottomInset === 'safe' ? insets.bottom + 24 : 0;
  const header = title || back || right ? <Header title={title} subtitle={subtitle} back={back} right={right} /> : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {scroll ? (
        <ScrollView
          {...scrollProps}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: bottom + (footer ? 90 : 0), gap: 16 }, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingHorizontal: 20, gap: 16 }, contentStyle]}>
          {header}
          {children}
        </View>
      )}
      {footer ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function Header({ title, subtitle, back, right }: { title?: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={{ paddingTop: 8, gap: 4 }}>
      {back || right ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          {back ? <IconButton icon="chevron-back" label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : <View />}
          <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View>
        </View>
      ) : null}
      {title ? (
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="body" color="textMuted">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {action && onAction ? (
        <ScalePressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text variant="caption" color="primary">
            {action}
          </Text>
        </ScalePressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  tone = 'default',
  chevron = true,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'danger' | 'primary';
  chevron?: boolean;
}) {
  const { colors } = useTheme();
  const fg = tone === 'danger' ? colors.danger : tone === 'primary' ? colors.primary : colors.text;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: radius.sm, backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={19} color={fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" style={{ color: fg }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <ScalePressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress} scaleTo={0.99}>
      {content}
    </ScalePressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

export function Row({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}
