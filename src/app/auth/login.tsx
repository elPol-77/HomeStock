import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { isCloudConfigured, signIn, validateEmail } from '@/services/auth';
import { haptic } from '@/services/haptics';
import { toast } from '@/services/toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e = validateEmail(email);
    if (e || !password) {
      setError(e ?? 'Introduce tu contraseña.');
      haptic.error();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      haptic.success();
      toast('Sesión iniciada');
      router.replace('/settings/household');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      haptic.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Iniciar sesión" subtitle="Sincroniza tu casa entre dispositivos y con tu familia." back bottomInset="safe">
      {!isCloudConfigured ? (
        <Card tone="warning">
          <Text variant="body">La nube aún no está configurada en esta versión de la app. Puedes seguir usando HomeStock sin cuenta.</Text>
        </Card>
      ) : null}
      <TextField label="Email" placeholder="tu@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" icon="mail-outline" />
      <TextField label="Contraseña" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" icon="lock-closed-outline" onSubmitEditing={submit} />
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <Button title="Entrar" size="lg" loading={busy} disabled={!isCloudConfigured} onPress={submit} />
      <Button title="He olvidado mi contraseña" variant="ghost" onPress={() => router.push('/auth/forgot')} />
      <Button title="¿No tienes cuenta? Crear una" variant="secondary" onPress={() => router.replace('/auth/register')} />
    </Screen>
  );
}
