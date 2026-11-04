import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { ComponentProps, useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScalePressable, Text } from '@/components/ui';
import { haptic } from '@/services/haptics';
import { useSettings } from '@/services/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, shadow } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Inicio', icon: 'home-outline', active: 'home' },
  inventory: { label: 'Inventario', icon: 'file-tray-stacked-outline', active: 'file-tray-stacked' },
  shop: { label: 'Listas', icon: 'cart-outline', active: 'cart' },
  catalog: { label: 'Súper', icon: 'storefront-outline', active: 'storefront' },
  prices: { label: 'Precios', icon: 'pricetags-outline', active: 'pricetags' },
  profile: { label: 'Perfil', icon: 'person-circle-outline', active: 'person-circle' },
};

function TabButton({ focused, label, icon, onPress }: { focused: boolean; label: string; icon: IconName; onPress: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const v = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    v.value = reduceMotion ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [focused, reduceMotion, v]);
  const pill = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scaleX: 0.6 + v.value * 0.4 }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -v.value * 1.5 }] }));
  return (
    <ScalePressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.92}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 3 }}>
      <View style={{ width: 48, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: 48, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft }, pill]} />
        <Animated.View style={iconStyle}>
          <Ionicons name={icon} size={22} color={focused ? colors.primary : colors.textMuted} />
        </Animated.View>
      </View>
      <Text variant="label" style={{ color: focused ? colors.primary : colors.textMuted, letterSpacing: 0 }} numberOfLines={1}>
        {label}
      </Text>
    </ScalePressable>
  );
}

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: Math.max(insets.bottom, 10),
        flexDirection: 'row',
        backgroundColor: colors.tabBar,
        borderRadius: radius.xl,
        paddingHorizontal: 6,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadow(colors, 3),
      }}
      accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const cfg = TABS[route.name];
        if (!cfg) return null;
        const focused = state.index === index;
        return (
          <TabButton
            key={route.key}
            focused={focused}
            label={cfg.label}
            icon={focused ? cfg.active : cfg.icon}
            onPress={() => {
              if (!focused) {
                haptic.tap();
                navigateToTab(route.key);
              }
            }}
          />
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const onboarded = useSettings((s) => s.onboarded);
  const { colors } = useTheme();
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="inventory" />
      <Tabs.Screen name="shop" />
      <Tabs.Screen name="catalog" />
      <Tabs.Screen name="prices" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
