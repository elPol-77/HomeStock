import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CaptureCamera } from '@/components/CaptureCamera';
import { ProductThumb } from '@/components/ProductThumb';
import { Badge, Button, Card, Screen, SectionTitle, SkeletonList, Text } from '@/components/ui';
import { buildRecognitionQuery } from '@/domain/recognition';
import { sentenceCase } from '@/domain/text';
import { CATALOG_SOURCE_LABEL } from '@/services/catalog/types';
import { draftFromCatalog, useDrafts } from '@/services/drafts';
import { haptic } from '@/services/haptics';
import { isOcrAvailable, OCR_UNAVAILABLE_MESSAGE } from '@/services/ocr';
import { recognizeProductPhoto, RecognitionResult } from '@/services/recognize';
import { useTheme } from '@/theme/ThemeProvider';

const CERTAINTY = {
  high: { label: 'Coincidencia probable', tone: 'success' as const },
  medium: { label: 'Posible coincidencia', tone: 'warning' as const },
  low: { label: 'Poco fiable', tone: 'danger' as const },
};

export default function PhotoRecognition() {
  const { colors, reduceMotion } = useTheme();
  const setDraft = useDrafts((s) => s.setProduct);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(isOcrAvailable ? null : OCR_UNAVAILABLE_MESSAGE);

  const onCapture = async (uri: string) => {
    setPhoto(uri);
    setBusy(true);
    try {
      const r = await recognizeProductPhoto(uri);
      setResult(r);
      if (r.candidates[0]?.certainty === 'high') haptic.success();
      else haptic.warning();
    } catch (e) {
      setError(e instanceof Error && e.message === 'OCR_UNAVAILABLE' ? OCR_UNAVAILABLE_MESSAGE : 'No se pudo analizar la foto. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (!photo && !error) {
    return <CaptureCamera title="Reconocer producto" hint="Fotografía la parte delantera, con el nombre y la marca bien visibles" frame="square" busy={busy} onCapture={onCapture} />;
  }

  const createFromText = () => {
    const q = result ? buildRecognitionQuery(result.ocrText.split(/\s{2,}|\n/)) : null;
    setDraft({
      name: sentenceCase(result?.query.replace(q?.brand ?? '', '').trim() || ''),
      brand: q?.brand ?? null,
      barcode: q?.eanCandidates[0] ?? null,
      imageUrl: photo,
      category: null,
      pkg: q?.pkg ?? null,
      packaging: null,
      sourceLabel: 'Texto leído de tu foto',
      sourceUrl: null,
      notice: 'Hemos rellenado lo que pudimos leer. Corrige lo que no esté bien.',
      origin: 'photo',
    });
    router.replace('/product/edit?draft=1');
  };

  return (
    <Screen title="Resultado" back bottomInset="safe">
      {error ? (
        <Card tone="warning" style={{ gap: 10 }}>
          <Text variant="body">{error}</Text>
          <Button title="Escanear el código de barras" icon="barcode-outline" onPress={() => router.replace('/scan/barcode')} />
          <Button title="Crear a mano" variant="secondary" onPress={() => { setDraft(null); router.replace('/product/edit'); }} />
        </Card>
      ) : null}
      {busy ? (
        <View style={{ gap: 12 }}>
          <Text variant="body" color="textMuted">
            Leyendo el envase y buscando coincidencias…
          </Text>
          <SkeletonList rows={3} />
        </View>
      ) : null}
      {result ? (
        <>
          <Card tone={result.candidates[0]?.certainty === 'high' ? 'primary' : 'warning'} style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name={result.candidates[0]?.certainty === 'high' ? 'sparkles' : 'help-circle'} size={22} color={result.candidates[0]?.certainty === 'high' ? colors.primary : colors.warning} />
            <Text variant="body" style={{ flex: 1 }}>
              {result.summary}
            </Text>
          </Card>
          {result.candidates.length > 0 ? <SectionTitle title="¿Es alguno de estos?" /> : null}
          {result.candidates.map((c, i) => (
            <Animated.View key={`${c.product.barcode}-${c.product.name}`} entering={reduceMotion ? undefined : FadeInDown.delay(i * 60).springify().damping(18)}>
              <Card
                onPress={() => {
                  if (c.product.source === 'local') {
                    setDraft(draftFromCatalog(c.product, 'photo', 'Ya tienes este producto: al guardar te propondremos sumar existencias.'));
                  } else {
                    setDraft(draftFromCatalog(c.product, 'photo', c.certainty === 'high' ? 'Coincidencia probable: revisa los datos.' : 'No estamos seguros de que sea tu producto: revisa y corrige.'));
                  }
                  router.replace('/product/edit?draft=1');
                }}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
                accessibilityLabel={`${c.product.name}, ${CERTAINTY[c.certainty].label}, ${Math.round(c.score * 100)}%`}>
                <ProductThumb uri={c.product.imageUrl} category={c.product.category} size={56} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {c.product.name}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {[c.product.brand, c.product.quantityText, CATALOG_SOURCE_LABEL[c.product.source]].filter(Boolean).join(' · ')}
                  </Text>
                  <Badge label={`${CERTAINTY[c.certainty].label} · ${Math.round(c.score * 100)}%`} tone={CERTAINTY[c.certainty].tone} />
                  <Text variant="caption" color="textFaint">
                    {c.reason}
                  </Text>
                </View>
              </Card>
            </Animated.View>
          ))}
          <Button title="Ninguno: crear con el texto leído" variant="secondary" icon="create-outline" onPress={createFromText} />
          <Button title="Escanear el código de barras" variant="ghost" icon="barcode-outline" onPress={() => router.replace('/scan/barcode')} />
          <Button title="Repetir foto" variant="ghost" icon="camera-outline" onPress={() => { setPhoto(null); setResult(null); }} />
          {result.ocrText ? (
            <Text variant="caption" color="textFaint" numberOfLines={5}>
              Texto leído: {result.ocrText}
            </Text>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
