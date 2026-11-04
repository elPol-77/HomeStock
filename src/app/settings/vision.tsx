import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { haptic } from '@/services/haptics';
import { toast } from '@/services/toast';
import { DEFAULT_VISION_MODEL, GEMINI_KEY_URL, getVisionKey, getVisionModel, setVisionKey, setVisionModel, testVisionKey } from '@/services/vision';

export default function VisionSettings() {
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getVisionKey().then((k) => setHasKey(!!k));
    getVisionModel().then(setModel);
  }, []);

  return (
    <Screen title="IA para fotos" subtitle="Reconocer varios productos de una foto (nevera, despensa, compra)" back bottomInset="safe">
      <Card style={{ gap: 6 }}>
        <Text variant="bodyStrong">{hasKey ? 'Clave guardada en este móvil' : 'Sin clave'}</Text>
        <Text variant="caption" color="textMuted">
          Usa el plan gratuito de Google Gemini con tu clave personal. La clave se guarda cifrada en el móvil y no se comparte con tu hogar. Las fotos se envían a Google para analizarlas; en el plan gratuito Google puede usarlas para mejorar sus productos.
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
          title="Borrar la clave de este móvil"
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
