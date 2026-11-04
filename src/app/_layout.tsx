import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorState, ToastHost } from '@/components/ui';
import { getDb } from '@/db/client';
import { ensureHousehold } from '@/data/household';
import { preparePackImages } from '@/services/catalog/imagePack';
import { initAuth } from '@/services/auth';
import { initNotifications } from '@/services/notifications';
import { useSettings } from '@/services/settings';
import { startPushRegistration } from '@/services/push';
import { startSync } from '@/services/sync';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { colors, scheme, reduceMotion } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.text, primary: colors.primary, border: colors.border } };
  const animation = reduceMotion ? 'fade' : 'slide_from_right';
  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="add" options={{ presentation: 'modal', animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
        <Stack.Screen name="scan/barcode" options={{ animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
        <Stack.Screen name="scan/photo" options={{ animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
        <Stack.Screen name="scan/expiry" options={{ animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
        <Stack.Screen name="scan/receipt" options={{ animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
      </Stack>
      <ToastHost />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await getDb();
        await useSettings.getState().load();
        await ensureHousehold();
        await initNotifications();
        await initAuth();
        startSync();
        preparePackImages(); // fotos de Consum: se extraen la primera vez, sin bloquear
        startPushRegistration();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if ((fontsLoaded && ready) || error) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, ready, error]);

  if (error) {
    return (
      <ThemeProvider>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState message={`No se pudo abrir la base de datos local: ${error}`} />
        </View>
      </ThemeProvider>
    );
  }
  if (!fontsLoaded || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <Navigator />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
