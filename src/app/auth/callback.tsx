import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Card, Screen, SkeletonList, Text } from '@/components/ui';
import { handleAuthDeepLink } from '@/services/auth';
import { toast } from '@/services/toast';

/** Destino del enlace de confirmación de email (homestock://auth/callback). */
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    handleAuthDeepLink(url)
      .then((ok) => {
        if (ok) {
          toast('Email confirmado. ¡Bienvenido!');
          router.replace('/settings/household');
        } else setError('El enlace no contiene una sesión válida.');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Enlace no válido'));
  }, [url]);

  return (
    <Screen title="Confirmando…" bottomInset="safe">
      {error ? (
        <Card tone="danger" style={{ gap: 10 }}>
          <Text variant="body">{error}</Text>
          <Button title="Iniciar sesión" onPress={() => router.replace('/auth/login')} />
        </Card>
      ) : (
        <SkeletonList rows={2} />
      )}
    </Screen>
  );
}
