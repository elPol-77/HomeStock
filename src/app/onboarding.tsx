import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text, TextField } from '@/components/ui';
import { isCloudConfigured } from '@/services/supabase';
import { requestPermission } from '@/services/notifications';
import { useSettings } from '@/services/settings';
import { useTheme } from '@/theme/ThemeProvider';

const POINTS = [
  { icon: 'scan-outline', title: 'Añade productos en segundos', text: 'Escanea el código de barras, haz una foto o busca en el catálogo.' },
  { icon: 'alarm-outline', title: 'Nada se te caduca', text: 'Avisos antes de que caduquen las cosas de la nevera y la despensa.' },
  { icon: 'cart-outline', title: 'Listas que se hacen solas', text: 'Te sugerimos lo que falta y, al terminar la compra, todo vuelve al inventario.' },
  { icon: 'pricetags-outline', title: 'Compra donde te sale mejor', text: 'Compara precios reales de tus tickets y de la comunidad Open Prices.' },
] as const;

export default function Onboarding() {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const update = useSettings((s) => s.update);
  const [name, setName] = useState('');
  const [step, setStep] = useState<0 | 1>(0);

  const finish = async (goToAccount: boolean) => {
    await update({ onboarded: true, userName: name.trim() });
    await requestPermission().catch(() => false);
    router.replace('/');
    if (goToAccount) setTimeout(() => router.push('/auth/login'), 50);
  };

  const enter = (i: number) => (reduceMotion ? undefined : FadeInDown.delay(120 + i * 90).springify().damping(18));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 18, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(500)} style={{ alignItems: 'flex-start', gap: 14, marginTop: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="home" size={32} color={colors.onPrimary} />
          </View>
          <Text variant="display">HomeStock</Text>
          <Text variant="subheading" color="textMuted">
            Tu casa organizada, tu compra inteligente y tu dinero optimizado, todo desde el móvil.
          </Text>
        </Animated.View>

        {step === 0 ? (
          <>
            {POINTS.map((p, i) => (
              <Animated.View key={p.title} entering={enter(i)}>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={p.icon} size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{p.title}</Text>
                    <Text variant="caption" color="textMuted">
                      {p.text}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            ))}
            <View style={{ flex: 1 }} />
            <Button title="Empezar" size="lg" onPress={() => setStep(1)} />
          </>
        ) : (
          <Animated.View entering={enter(0)} style={{ gap: 16 }}>
            <TextField label="¿Cómo te llamas? (opcional)" placeholder="Tu nombre" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="done" />
            <Card tone="primary">
              <Text variant="bodyStrong">Funciona sin cuenta y sin conexión</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
                Tus datos se guardan en este móvil. Crea una cuenta cuando quieras sincronizar entre dispositivos o compartir la casa con tu familia.
              </Text>
            </Card>
            <Button title="Usar sin cuenta" size="lg" onPress={() => finish(false)} />
            <Button
              title={isCloudConfigured ? 'Crear cuenta o iniciar sesión' : 'Cuentas: pendiente de configurar la nube'}
              variant="secondary"
              disabled={!isCloudConfigured}
              onPress={() => finish(true)}
            />
            <Text variant="caption" color="textFaint" align="center">
              Te pediremos permiso para enviarte avisos de caducidad y de la compra.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}
