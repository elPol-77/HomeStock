import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';

import { router } from 'expo-router';

import { Badge, Button, Card, Screen, SectionTitle, Text, TextField } from '@/components/ui';
import { useAuth } from '@/services/auth';
import { haptic } from '@/services/haptics';
import { toast } from '@/services/toast';
import { DEFAULT_VISION_MODEL, GEMINI_KEY_URL, getVisionKey, getVisionModel, setVisionKey, setVisionModel, testVisionKey } from '@/services/vision';

export default function VisionSettings() {
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useAuth((a) => a.session);

  useEffect(() => {
    getVisionKey().then((k) => setHasKey(!!k));
    getVisionModel().then(setModel);
  }, []);

  return (
    <Screen title="IA para fotos" subtitle="Reconocer varios productos de una foto (nevera, despensa, compra)" back bottomInset="safe">
      <Card tone="primary" style={{ gap: 8 }}>
        <Text variant="bodyStrong">Automático (recomendado)</Text>
        <Text variant="caption" color="textMuted">
          No tienes que configurar nada: con la sesión iniciada, HomeStock analiza la foto con la IA gratuita de Google (Gemini) desde su servidor. Hasta 20 fotos al día por persona.
        </Text>
        {hasKey ? (
          <Badge label="Desactivado: estás usando tu propia clave" tone="neutral" />
        ) : session ? (
          <Badge label="Activo" tone="success" icon="checkmark-circle" />
        ) : (
          <Button title="Iniciar sesión para activarlo" size="sm" icon="log-in-outline" onPress={() => router.push('/auth/login')} style={{ alignSelf: 'flex-start' }} />
        )}
        <Text variant="caption" color="textFaint">
          Las fotos se envían a Google para analizarlas; en el plan gratuito Google puede usarlas para mejorar sus productos. Haz fotos solo de comida, sin personas ni documentos.
        </Text>
      </Card>

      <SectionTitle title="Avanzado: tu propia clave" />
      <Card style={{ gap: 6 }}>
        <Text variant="bodyStrong">{hasKey ? 'Clave propia guardada en este móvil' : 'Opcional'}</Text>
        <Text variant="caption" color="textMuted">
          Solo si quieres más fotos al día o usar la IA sin cuenta. La clave se guarda cifrada en el móvil y no se comparte con tu hogar.
        </Text>
        <Button title="Obtener clave en Google AI Studio" variant="ghost" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(GEMINI_KEY_URL)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </Card>
      <TextField label={hasKey ? 'Nueva clave (opcional)' : 'Clave de Gemini'} placeholder="AIza…" value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry />
      <TextField label="Modelo" value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} hint={`Por defecto ${DEFAULT_VISION_MODEL}. Cámbialo solo si Google retira ese modelo.`} />
      {msg ? (
        <Text variant="caption" color={msg.startsWith('Clave correcta') ? 'success' : 'danger'}>
          {msg}
        </Text>
      ) : null}
      <Button
        title="Comprobar y guardar"
        icon="checkmark"
        loading={busy}
        disabled={!key.trim() && !hasKey}
        onPress={async () => {
          setBusy(true);
          const k = key.trim() || (await getVisionKey()) || '';
          const r = await testVisionKey(k, model);
          setMsg(r.message);
          setBusy(false);
          if (r.ok) {
            if (key.trim()) await setVisionKey(key);
            await setVisionModel(model === DEFAULT_VISION_MODEL ? null : model);
            setHasKey(true);
            setKey('');
            haptic.success();
          } else haptic.error();
        }}
      />
      {hasKey ? (
        <Button
          title="Borrar mi clave y volver al modo automático"
          variant="danger"
          icon="trash-outline"
          onPress={async () => {
            await setVisionKey(null);
            setHasKey(false);
            toast('Clave borrada');
          }}
        />
      ) : null}
    </Screen>
  );
}
