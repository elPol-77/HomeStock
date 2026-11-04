import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ProgressBar, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { useAuth } from '@/services/auth';
import { VisionStatus, visionStatus } from '@/services/vision';
import { useTheme } from '@/theme/ThemeProvider';

function Step({ icon, title, text }: { icon: 'camera-outline' | 'sparkles-outline' | 'checkmark-done-outline'; title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textMuted">
          {text}
        </Text>
      </View>
    </Row>
  );
}

export default function VisionSettings() {
  const { colors } = useTheme();
  const session = useAuth((a) => a.session);
  const [status, setStatus] = useState<VisionStatus | null>(null);

  useEffect(() => {
    visionStatus().then(setStatus);
  }, [session]);

  const ready = !!session && status?.ready !== false;
  const used = status?.dailyLimit != null && status.remaining != null ? status.dailyLimit - status.remaining : null;

  return (
    <Screen title="IA para fotos" subtitle="Reconoce todos los productos de una foto de la nevera o la despensa" back bottomInset="safe">
      <Card tone={ready ? 'primary' : 'alt'} style={{ gap: 10 }}>
        <Row gap={10}>
          <Ionicons name={ready ? 'checkmark-circle' : 'log-in-outline'} size={24} color={ready ? colors.success : colors.textMuted} />
          <Text variant="heading" style={{ flex: 1 }}>
            {!session ? 'Inicia sesión para activarla' : status === null ? 'Comprobando…' : status.ready ? 'Activada' : 'No disponible ahora mismo'}
          </Text>
        </Row>
        <Text variant="body" color="textMuted">
          {!session
            ? 'Es gratis y no tienes que configurar nada: solo necesitamos saber que eres tú para repartir las fotos diarias.'
            : status && !status.ready
              ? 'El servicio está en mantenimiento. Prueba más tarde.'
              : 'No tienes que configurar nada. Haz la foto y la app te dice qué hay.'}
        </Text>
        {session && status?.dailyLimit != null && status.remaining != null ? (
          <View style={{ gap: 6 }}>
            <Text variant="caption" color="textMuted">
              Te quedan {status.remaining} de {status.dailyLimit} fotos hoy
            </Text>
            <ProgressBar value={used! / status.dailyLimit} />
          </View>
        ) : null}
        {!session ? (
          <Button title="Iniciar sesión o crear cuenta" icon="log-in-outline" onPress={() => router.push('/auth/login')} />
        ) : (
          <Button title="Hacer una foto ahora" icon="camera-outline" disabled={status?.ready === false} onPress={() => router.push('/scan/fridge')} />
        )}
      </Card>

      <SectionTitle title="Cómo funciona" />
      <Card style={{ gap: 14 }}>
        <Step icon="camera-outline" title="1. Haz una foto" text="Abre la nevera o la despensa y saca todo en una foto con buena luz." />
        <Step icon="sparkles-outline" title="2. La IA lo reconoce" text="En unos segundos te propone cada producto con su cantidad y categoría." />
        <Step icon="checkmark-done-outline" title="3. Tú confirmas" text="Marca lo que quieras guardar y elige la zona. Nada se añade sin tu permiso." />
      </Card>

      <Text variant="caption" color="textFaint">
        Las fotos se analizan con Google Gemini y HomeStock no las guarda; en el plan gratuito Google puede usarlas para mejorar sus servicios. Haz fotos solo de comida y productos, sin personas ni documentos.
      </Text>
    </Screen>
  );
}
