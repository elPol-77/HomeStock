import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { handleAuthDeepLink, updatePassword, useAuth, validatePassword } from '@/services/auth';
import { toast } from '@/services/toast';

/** Abierta desde el enlace del email de recuperación (homestock://auth/reset) o desde Perfil. */
export default function ResetPassword() {
  const url = Linking.useLinkingURL();
  const session = useAuth((a) => a.session);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (url && (url.includes('code=') || url.includes('access_token'))) {
      handleAuthDeepLink(url).catch((e) => setLinkError(e instanceof Error ? e.message : 'Enlace no válido o caducado'));
    }
  }, [url]);

  const submit = async () => {
    const e = validatePassword(password);
    if (e) {
      setError(e);
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      toast('Contraseña actualizada');
      router.replace('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Nueva contraseña" back bottomInset="safe">
      {linkError ? (
        <Card tone="danger">
          <Text variant="body">{linkError}. Solicita un enlace nuevo.</Text>
        </Card>
      ) : null}
      {!session ? (
        <Card tone="alt">
          <Text variant="body" color="textMuted">
            Abre el enlace que te enviamos por email desde este móvil para poder cambiar la contraseña.
          </Text>
        </Card>
      ) : (
        <>
          <TextField label="Contraseña nueva" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={error} icon="lock-closed-outline" />
          <Button title="Guardar contraseña" size="lg" loading={busy} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
