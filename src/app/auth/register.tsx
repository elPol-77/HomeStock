import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Screen, SwitchRow, Text, TextField } from '@/components/ui';
import { isCloudConfigured, signUp, validateEmail, validatePassword } from '@/services/auth';
import { haptic } from '@/services/haptics';
import { useSettings } from '@/services/settings';
import { toast } from '@/services/toast';

export default function Register() {
  const userName = useSettings((s) => s.userName);
  const update = useSettings((s) => s.update);
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null; general?: string | null }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(e);
    if (e.email || e.password || !accepted) {
      haptic.error();
      if (!accepted) setErrors({ ...e, general: 'Acepta la política de privacidad para continuar.' });
      return;
    }
    setBusy(true);
    try {
      const r = await signUp(email, password, name || email.split('@')[0]);
      if (name) await update({ userName: name });
      haptic.success();
      if (r.needsConfirmation) setSent(true);
      else {
        toast('Cuenta creada');
        router.replace('/settings/household');
      }
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : 'No se pudo crear la cuenta' });
      haptic.error();
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen title="Revisa tu email" back bottomInset="safe">
        <Card tone="primary" style={{ gap: 8 }}>
          <Text variant="body">Te hemos enviado un enlace a {email}. Ábrelo desde este móvil para confirmar tu cuenta.</Text>
          <Text variant="caption" color="textMuted">
            Si no lo ves, mira en la carpeta de spam.
          </Text>
        </Card>
        <Button title="Ya lo he confirmado: iniciar sesión" onPress={() => router.replace('/auth/login')} />
      </Screen>
    );
  }

  return (
    <Screen title="Crear cuenta" subtitle="Gratis. Solo necesitas un email." back bottomInset="safe">
      <TextField label="Tu nombre" placeholder="Así te verá tu familia" value={name} onChangeText={setName} autoCapitalize="words" icon="person-outline" />
      <TextField label="Email" placeholder="tu@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} icon="mail-outline" />
      <TextField label="Contraseña" placeholder="Mínimo 8 caracteres, con un número" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={errors.password} icon="lock-closed-outline" />
      <SwitchRow label="Acepto la política de privacidad" description="Tus datos se usan solo para sincronizar tu hogar. Puedes exportarlos o borrarlos cuando quieras." value={accepted} onChange={setAccepted} />
      {errors.general ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="assertive">
          {errors.general}
        </Text>
      ) : null}
      <Button title="Crear cuenta" size="lg" loading={busy} disabled={!isCloudConfigured} onPress={submit} />
      <Button title="Ver política de privacidad" variant="ghost" onPress={() => router.push('/settings/privacy')} />
    </Screen>
  );
}
