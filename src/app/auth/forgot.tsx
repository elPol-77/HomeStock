import { useState } from 'react';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { sendPasswordReset, validateEmail } from '@/services/auth';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e = validateEmail(email);
    if (e) {
      setError(e);
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Recuperar contraseña" back bottomInset="safe">
      {sent ? (
        <Card tone="primary">
          <Text variant="body">Si existe una cuenta con {email}, recibirás un enlace para elegir una contraseña nueva. Ábrelo desde este móvil.</Text>
        </Card>
      ) : (
        <>
          <TextField label="Email de tu cuenta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={error} icon="mail-outline" onSubmitEditing={submit} />
          <Button title="Enviar enlace" size="lg" loading={busy} onPress={submit} />
        </>
      )}
    </Screen>
  );
}
