import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { CaptureCamera } from '@/components/CaptureCamera';
import { DateField, StorePicker } from '@/components/Pickers';
import { Badge, Button, Card, IconButton, Row, Screen, SectionTitle, SkeletonList, SwitchRow, Text, TextField } from '@/components/ui';
import { guessLocation } from '@/data/locationGuess';
import { allProducts, listLocations, matchExistingProduct, packageOf } from '@/data/products';
import { finishPurchase } from '@/data/purchases';
import type { Product } from '@/data/types';
import { todayISO } from '@/domain/dates';
import { ParsedReceipt, parseReceipt } from '@/domain/receiptParser';
import { formatEuro, parseDecimal } from '@/domain/text';
import { parsePackageSize } from '@/domain/units';
import { storeKey } from '@/services/catalog/stores';
import { haptic } from '@/services/haptics';
import { isOcrAvailable, ocrImage, OCR_UNAVAILABLE_MESSAGE } from '@/services/ocr';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';

interface ReviewLine {
  key: string;
  name: string;
  rawName: string;
  quantity: string;
  total: string;
  discount: number;
  include: boolean;
  match: Product | null;
  confidence: number;
}

export default function ReceiptScan() {
  const { colors, reduceMotion } = useTheme();
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [store, setStore] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(todayISO());
  const [total, setTotal] = useState('');
  const [toInventory, setToInventory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(isOcrAvailable ? null : OCR_UNAVAILABLE_MESSAGE);
  const [manual, setManual] = useState(false);

  const buildLines = async (r: ParsedReceipt) => {
    const out: ReviewLine[] = [];
    for (const [i, it] of r.items.entries()) {
      const match = await matchExistingProduct({ name: it.name, pkg: parsePackageSize(it.rawName) });
      out.push({
        key: `${i}-${it.rawName}`,
        name: match?.name ?? it.name,
        rawName: it.rawName,
        quantity: it.weightKg ? '1' : String(it.quantity),
        total: it.totalPrice.toFixed(2).replace('.', ','),
        discount: it.discount,
        include: true,
        match,
        confidence: it.confidence,
      });
    }
    return out;
  };

  const onCapture = async (uri: string) => {
    setBusy(true);
    try {
      const ocr = await ocrImage(uri);
      const r = parseReceipt(ocr.rows);
      setParsed(r);
      setStore(r.store ? storeKey(r.store) : null);
      setDate(r.date ?? todayISO());
      setTotal(r.total != null ? r.total.toFixed(2).replace('.', ',') : '');
      setLines(await buildLines(r));
      if (r.items.length) haptic.success();
      else haptic.warning();
    } catch {
      setError('No se pudo leer el ticket. Prueba con el ticket estirado, buena luz y sin sombras.');
    } finally {
      setBusy(false);
    }
  };

  const patch = (key: string, p: Partial<ReviewLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const addLine = (name = '') => setLines((ls) => [...ls, { key: `m-${Date.now()}`, name, rawName: name, quantity: '1', total: '', discount: 0, include: true, match: null, confidence: 1 }]);

  const included = lines.filter((l) => l.include && l.name.trim());
  const sum = included.reduce((s, l) => {
    const t = parseDecimal(l.total);
    return Number.isNaN(t) ? s : s + t - l.discount;
  }, 0);
  const printed = total ? parseDecimal(total) : null;
  const mismatch = printed != null && !Number.isNaN(printed) && Math.abs(printed - sum) > 0.05;

  const confirm = async () => {
    if (included.length === 0) return;
    setSaving(true);
    try {
      const locations = await listLocations();
      const products = await allProducts();
      const res = await finishPurchase({
        store,
        date: date ?? todayISO(),
        source: 'receipt',
        total: printed != null && !Number.isNaN(printed) ? printed : null,
        lines: included.map((l) => {
          const qty = Math.max(1, Math.round(parseDecimal(l.quantity) || 1));
          const t = parseDecimal(l.total);
          const product = l.match ? products.find((p) => p.id === l.match!.id) ?? null : null;
          return {
            productId: product?.id ?? null,
            name: l.name.trim(),
            category: product?.category ?? null,
            pkg: product ? packageOf(product) : parsePackageSize(l.rawName),
            quantity: qty,
            totalPrice: Number.isNaN(t) ? null : t,
            discount: l.discount,
            locationId: guessLocation(product?.category, locations, product?.default_location_id),
            addToInventory: toInventory,
          };
        }),
      });
      haptic.success();
      router.replace({ pathname: '/purchase/[id]', params: { id: res.purchaseId, celebrate: '1', added: String(res.added), created: String(res.createdProducts), saved: String(res.verifiedSavings) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (!parsed && !error && !manual) {
    return <CaptureCamera title="Escanear ticket" hint="Encuadra el ticket entero, estirado y con buena luz" frame="tall" busy={busy} onCapture={onCapture} />;
  }

  return (
    <Screen
      title="Revisar ticket"
      subtitle="Comprueba lo detectado antes de guardarlo."
      back
      bottomInset="none"
      footer={
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="body" color="textMuted">
              {included.length} artículos
            </Text>
            <Text variant="heading">{formatEuro(sum)}</Text>
          </Row>
          <Button title={toInventory ? 'Guardar y añadir al inventario' : 'Guardar solo el gasto'} size="lg" icon="checkmark-done" loading={saving} disabled={included.length === 0} onPress={confirm} />
        </View>
      }>
      {error ? (
        <Card tone="warning" style={{ gap: 10 }}>
          <Text variant="body">{error}</Text>
          {!manual ? <Button title="Introducir la compra a mano" variant="secondary" onPress={() => { setManual(true); setError(null); addLine(); }} /> : null}
        </Card>
      ) : null}
      {busy ? <SkeletonList rows={5} /> : null}

      <StorePicker value={store} onChange={setStore} />
      <Row>
        <View style={{ flex: 1 }}>
          <DateField label="Fecha" value={date} onChange={setDate} quick={[]} allowClear={false} />
        </View>
        <TextField label="Total del ticket" value={total} onChangeText={setTotal} keyboardType="decimal-pad" containerStyle={{ width: 130 }} />
      </Row>
      {mismatch ? (
        <Card tone="warning" style={{ flexDirection: 'row', gap: 10 }}>
          <Ionicons name="alert-circle" size={20} color={colors.warning} />
          <Text variant="caption" style={{ flex: 1 }}>
            La suma de artículos ({formatEuro(sum)}) no coincide con el total ({formatEuro(printed)}). Puede faltar algún artículo o haber un error de lectura.
          </Text>
        </Card>
      ) : parsed?.totalMatches ? (
        <Badge label="El total cuadra con los artículos" tone="success" icon="checkmark-circle" />
      ) : null}
      <SwitchRow label="Añadir al inventario" description="Desactívalo si solo quieres registrar el gasto." value={toInventory} onChange={setToInventory} />

      <SectionTitle title="Artículos" action="Añadir" onAction={() => addLine()} />
      {lines.map((l) => (
        <Animated.View key={l.key} entering={reduceMotion ? undefined : FadeIn} layout={reduceMotion ? undefined : LinearTransition}>
          <Card style={{ gap: 10, opacity: l.include ? 1 : 0.5 }}>
            <Row>
              <TextField value={l.name} onChangeText={(t) => patch(l.key, { name: t, match: null })} containerStyle={{ flex: 1 }} placeholder="Nombre del producto" />
              <IconButton icon={l.include ? 'close' : 'refresh'} size={34} label={l.include ? 'Excluir artículo' : 'Incluir artículo'} onPress={() => patch(l.key, { include: !l.include })} />
            </Row>
            <Row>
              <TextField label="Uds." value={l.quantity} onChangeText={(t) => patch(l.key, { quantity: t })} keyboardType="number-pad" containerStyle={{ width: 80 }} />
              <TextField label="Importe" value={l.total} onChangeText={(t) => patch(l.key, { total: t })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {l.match ? <Badge label={`Se sumará a «${l.match.name}»`} tone="primary" icon="link-outline" /> : <Badge label="Producto nuevo" tone="info" />}
              {l.discount > 0 ? <Badge label={`Descuento −${formatEuro(l.discount)}`} tone="accent" /> : null}
              {l.confidence < 0.6 ? <Badge label="Lectura dudosa" tone="warning" icon="eye-outline" /> : null}
            </Row>
            {l.rawName && l.rawName !== l.name ? (
              <Text variant="caption" color="textFaint">
                En el ticket: {l.rawName}
              </Text>
            ) : null}
          </Card>
        </Animated.View>
      ))}

      {parsed && parsed.unparsedLines.length > 0 ? (
        <>
          <SectionTitle title="Líneas no reconocidas" />
          <Text variant="caption" color="textMuted">
            Toca una línea para añadirla como artículo.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {parsed.unparsedLines.slice(0, 20).map((u, i) => (
              <Button key={`${i}-${u}`} title={u.slice(0, 32)} size="sm" variant="secondary" onPress={() => addLine(u)} />
            ))}
          </View>
        </>
      ) : null}
      {parsed ? <Button title="Repetir foto" variant="ghost" icon="camera-outline" onPress={() => { setParsed(null); setLines([]); }} /> : null}
    </Screen>
  );
}
