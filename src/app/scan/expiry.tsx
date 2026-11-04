import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CaptureCamera } from '@/components/CaptureCamera';
import { DateField, ExpiryKindPicker } from '@/components/Pickers';
import { Badge, Button, Card, Chip, Screen, Text } from '@/components/ui';
import { formatDate } from '@/domain/dates';
import { ExpiryKind, EXPIRY_KIND_LABEL } from '@/domain/expiry';
import { ExpiryOcrResult, parseExpiryFromText } from '@/domain/expiryOcr';
import { useDrafts } from '@/services/drafts';
import { haptic } from '@/services/haptics';
import { isOcrAvailable, ocrImage, OCR_UNAVAILABLE_MESSAGE } from '@/services/ocr';
import { readExpiryInPhoto, VisionError, visionReady } from '@/services/vision';

export default function ExpiryScan() {
  const { target } = useLocalSearchParams<{ target?: string }>();
  const setExpiry = useDrafts((s) => s.setExpiry);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExpiryOcrResult | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [kind, setKind] = useState<ExpiryKind | null>(null);
  const canRead = isOcrAvailable || visionReady();
  const [error, setError] = useState<string | null>(canRead ? null : 'Inicia sesión para leer la fecha con IA, o escríbela a mano.');
  const [rawText, setRawText] = useState<string>('');

  const show = (r: ExpiryOcrResult, raw: string) => {
    setRawText(raw);
    setResult(r);
    setDate(r.best?.date ?? null);
    setKind(r.best?.kind ?? null);
    if (r.best) haptic.success();
    else haptic.warning();
  };

  const onCapture = async (uri: string) => {
    setBusy(true);
    setError(null);
    let aiProblem: string | null = null;
    try {
      // 1) IA (con sesión): lee fechas en cualquier formato aunque el texto sea pequeño o curvo.
      if (visionReady()) {
        try {
          const r = await readExpiryInPhoto(uri);
          if (r.date) {
            const c = { date: r.date, kind: r.kind, confidence: r.confidence === 'alta' ? 0.95 : r.confidence === 'media' ? 0.7 : 0.4, raw: r.text ?? '', monthOnly: false };
            show({ best: c, candidates: [c], needsConfirmation: r.confidence !== 'alta' }, r.text ?? '');
            return;
          }
          aiProblem = 'La IA no ha encontrado una fecha legible en la foto.';
        } catch (e) {
          aiProblem = e instanceof VisionError ? e.message : 'La IA no ha podido leer la foto.';
        }
      }
      // 2) Respaldo: lector de texto del móvil.
      if (!isOcrAvailable) {
        show({ best: null, candidates: [], needsConfirmation: true }, '');
        setError(aiProblem ?? OCR_UNAVAILABLE_MESSAGE);
        return;
      }
      const ocr = await ocrImage(uri);
      const r = parseExpiryFromText(ocr.lines);
      show(r, ocr.lines.join(' · '));
      if (!r.best && aiProblem) setError(aiProblem);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      show({ best: null, candidates: [], needsConfirmation: true }, '');
      setError(`${aiProblem ? aiProblem + ' ' : ''}No se pudo leer la imagen (${detail}). Repite la foto con más luz o escribe la fecha abajo.`);
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!date || !target) return;
    setExpiry({ date, kind: kind ?? 'use_by' });
    router.back();
  };

  if (!result && !error) {
    return <CaptureCamera title="Fecha de caducidad" hint="Acerca la cámara a la fecha impresa en el envase" frame="wide" busy={busy} onCapture={onCapture} />;
  }

  return (
    <Screen title="Fecha detectada" back bottomInset="none" footer={<Button title="Usar esta fecha" size="lg" icon="checkmark" disabled={!date} onPress={accept} />}>
      {error ? (
        <Card tone="warning">
          <Text variant="body">{error}</Text>
        </Card>
      ) : null}
      {result ? (
        result.best ? (
          <Card tone={result.needsConfirmation ? 'warning' : 'primary'} style={{ gap: 8 }}>
            <Badge label={result.needsConfirmation ? 'Revisa la fecha' : 'Fecha leída con claridad'} tone={result.needsConfirmation ? 'warning' : 'success'} />
            <Text variant="title">{formatDate(result.best.date)}</Text>
            <Text variant="caption" color="textMuted">
              {result.best.kind ? EXPIRY_KIND_LABEL[result.best.kind] : 'No sabemos si es caducidad o consumo preferente: indícalo abajo.'}
              {result.best.monthOnly ? ' · Solo aparecía mes y año: usamos el último día del mes.' : ''}
            </Text>
          </Card>
        ) : (
          <Card tone="warning" style={{ gap: 6 }}>
            <Text variant="bodyStrong">No hemos encontrado una fecha</Text>
            <Text variant="caption" color="textMuted">
              Escríbela abajo o repite la foto enfocando bien los números.
            </Text>
          </Card>
        )
      ) : null}
      {result && result.candidates.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" color="textMuted">
            Otras fechas encontradas
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {result.candidates.map((c) => (
              <Chip key={c.date} label={formatDate(c.date)} selected={date === c.date} onPress={() => { setDate(c.date); if (c.kind) setKind(c.kind); }} />
            ))}
          </View>
        </View>
      ) : null}
      <DateField label="Fecha" value={date} onChange={setDate} allowClear={false} />
      <ExpiryKindPicker value={kind} onChange={setKind} />
      {rawText ? (
        <Text variant="caption" color="textFaint" numberOfLines={4}>
          Texto leído: {rawText}
        </Text>
      ) : null}
      {canRead ? <Button title="Repetir foto" variant="ghost" icon="camera-outline" onPress={() => { setResult(null); setError(null); }} /> : null}
    </Screen>
  );
}
