import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CaptureCamera } from '@/components/CaptureCamera';
import { CategoryBadge, ProductThumb } from '@/components/ProductThumb';
import { Badge, Button, Card, Chip, ErrorState, Row, Screen, SectionTitle, SkeletonList, Stepper, Text } from '@/components/ui';
import { Checkbox } from '@/components/ListItemRow';
import { productFromBundled } from '@/data/catalogProducts';
import { createProduct, listLocations, matchExistingProduct } from '@/data/products';
import { addStockRaw } from '@/data/stock';
import type { Location, Product } from '@/data/types';
import { transaction } from '@/db/client';
import { suggestZone } from '@/domain/categorize';
import { formatEuro } from '@/domain/text';
import { parsePackageSize } from '@/domain/units';
import { BundledItem, matchBundled } from '@/services/catalog/bundled';
import { storeName } from '@/services/catalog/stores';
import { haptic } from '@/services/haptics';
import { toast } from '@/services/toast';
import { Confidence, DetectedItem, detectProductsInPhoto, VisionError } from '@/services/vision';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/theme/ThemeProvider';

const CONF: Record<Confidence, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  alta: { label: 'Seguro', tone: 'success' },
  media: { label: 'Probable', tone: 'warning' },
  baja: { label: 'Dudoso', tone: 'danger' },
};

interface Row {
  key: string;
  item: DetectedItem;
  selected: boolean;
  count: number;
  existing: Product | null;
  catalog: BundledItem | null;
}

function LoginGate() {
  const { colors } = useTheme();
  return (
    <Screen title="Foto de la nevera" subtitle="Reconoce varios productos de una sola foto" back bottomInset="safe">
      <Card tone="primary" style={{ gap: 12, alignItems: 'center', paddingVertical: 24 }}>
        <Ionicons name="sparkles" size={40} color={colors.primary} />
        <Text variant="heading" align="center">
          Inicia sesión y listo
        </Text>
        <Text variant="body" color="textMuted" align="center">
          El reconocimiento con IA es gratis y automático: no tienes que configurar nada. Solo necesitamos saber que eres tú para repartir el cupo diario.
        </Text>
        <Button title="Iniciar sesión o crear cuenta" icon="log-in-outline" onPress={() => router.push('/auth/login')} style={{ alignSelf: 'stretch' }} />
      </Card>
    </Screen>
  );
}

export default function FridgePhoto() {
  const { colors, reduceMotion } = useTheme();
  const session = useAuth((a) => a.session);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<VisionError | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [zones, setZones] = useState<Location[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    listLocations().then((l) => {
      setZones(l);
      setZoneId(suggestZone({ name: 'refrigerado', category: 'Lácteos y huevos' }, l)?.id ?? l[0]?.id ?? null);
    });
    return () => abort.current?.abort();
  }, []);

  const analyze = async (uri: string) => {
    setPhoto(uri);
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const items = await detectProductsInPhoto(uri, { signal: abort.current.signal });
      const out: Row[] = [];
      for (const [i, item] of items.entries()) {
        const fullName = [item.name, item.brand && !item.name.toLowerCase().includes(item.brand.toLowerCase()) ? item.brand : null].filter(Boolean).join(' ');
        const pkg = parsePackageSize(item.size) ?? parsePackageSize(item.name);
        const existing = await matchExistingProduct({ name: fullName, brand: item.brand, pkg });
        const cat = existing ? null : (matchBundled({ name: fullName, brand: item.brand, pkg }, 0).find((m) => m.kind === 'identical')?.item ?? null);
        out.push({ key: String(i), item, selected: item.confidence !== 'baja', count: item.count, existing, catalog: cat });
      }
      setRows(out);
      if (out.length) haptic.success();
      else haptic.warning();
    } catch (e) {
      haptic.error();
      setError(e instanceof VisionError ? e : new VisionError('unknown', 'No se pudo analizar la foto.'));

    } finally {
      setBusy(false);
    }
  };

  const selected = useMemo(() => (rows ?? []).filter((r) => r.selected), [rows]);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => (rs ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!zoneId || selected.length === 0) return;
    setSaving(true);
    try {
      await transaction(['products', 'batches', 'stock_movements'], async () => {
        for (const r of selected) {
          let productId = r.existing?.id;
          if (!productId && r.catalog) productId = await productFromBundled(r.catalog);
          if (!productId) {
            const pkg = parsePackageSize(r.item.size) ?? parsePackageSize(r.item.name);
            productId = await createProduct(
              {
                name: r.item.name,
                brand: r.item.brand,
                category: r.item.category,
                package_count: pkg?.count ?? null,
                package_amount: pkg?.amount ?? null,
                package_unit: pkg?.unit ?? null,
                default_location_id: zoneId,
                source: 'photo',
              },
              { emit: false },
            );
          }
          await addStockRaw({ productId, quantity: r.count, locationId: zoneId, reason: 'adjust' });
        }
      });
      haptic.success();
      toast(`${selected.length} ${selected.length === 1 ? 'producto añadido' : 'productos añadidos'} a ${zones.find((z) => z.id === zoneId)?.name ?? 'casa'}`);
      router.replace('/inventory');
    } catch (e) {
      haptic.error();
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (!session) return <LoginGate />;

  if (!photo) {
    return (
      <CaptureCamera
        title="Foto de la nevera"
        hint="Abre bien la puerta y saca todo en una foto con buena luz. Sirve también para la despensa o la compra sobre la mesa."
        frame="tall"
        busy={busy}
        onCapture={analyze}
        privacyText="Haremos una foto y la enviaremos a Google Gemini para reconocer los productos. Nada más sale del móvil."
      />
    );
  }

  return (
    <Screen
      title="Productos encontrados"
      subtitle={busy ? 'Analizando la foto con IA…' : rows ? `${rows.length} detectados · revisa y confirma` : undefined}
      back
      bottomInset="none"
      footer={
        rows && rows.length > 0 ? (
          <Button title={`Añadir ${selected.length} a ${zones.find((z) => z.id === zoneId)?.name ?? 'casa'}`} icon="checkmark" loading={saving} disabled={selected.length === 0} onPress={save} />
        ) : undefined
      }>
      {busy ? (
        <>
          <Card tone="primary" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
            <Text variant="body" style={{ flex: 1 }}>
              Gemini está mirando tu foto. Suele tardar entre 5 y 20 segundos.
            </Text>
          </Card>
          <SkeletonList rows={6} />
        </>
      ) : null}

      {error ? (
        <ErrorState
          message={error.message}
          onRetry={() => {
            if (error.code === 'login') router.push('/auth/login');
            else if (photo) analyze(photo);
          }}
        />
      ) : null}
      {error ? <Button title="Hacer otra foto" variant="secondary" icon="camera-outline" onPress={() => { setPhoto(null); setError(null); }} /> : null}

      {rows && rows.length === 0 ? (
        <Card tone="alt" style={{ gap: 10 }}>
          <Text variant="body">No se ha reconocido ningún producto. Prueba con más luz o más cerca.</Text>
          <Button title="Hacer otra foto" variant="secondary" icon="camera-outline" onPress={() => { setPhoto(null); setRows(null); }} />
        </Card>
      ) : null}

      {rows && rows.length > 0 ? (
        <>
          <SectionTitle title="¿Dónde los guardo?" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {zones.map((z) => (
              <Chip key={z.id} label={z.name} icon={z.icon as never} selected={zoneId === z.id} onPress={() => setZoneId(z.id)} />
            ))}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="caption" color="textMuted">
              {selected.length} de {rows.length} marcados
            </Text>
            <Row gap={6}>
              <Chip label="Todos" onPress={() => setRows((rs) => (rs ?? []).map((r) => ({ ...r, selected: true })))} />
              <Chip label="Ninguno" onPress={() => setRows((rs) => (rs ?? []).map((r) => ({ ...r, selected: false })))} />
            </Row>
          </Row>
          {rows.map((r, i) => (
            <Animated.View key={r.key} entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(i, 10) * 40)}>
              <Card style={{ gap: 8, opacity: r.selected ? 1 : 0.6 }}>
                <Row gap={10} style={{ alignItems: 'flex-start' }}>
                  <Checkbox checked={r.selected} onToggle={() => update(r.key, { selected: !r.selected })} label={`Añadir ${r.item.name}`} />
                  {r.existing?.image_url || r.catalog?.imageUrl ? (
                    <ProductThumb uri={r.existing?.image_url ?? r.catalog?.imageUrl} category={r.item.category} size={48} />
                  ) : (
                    <CategoryBadge category={r.item.category} size={48} />
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {r.item.name}
                    </Text>
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {[r.item.brand, r.item.size, r.item.category].filter(Boolean).join(' · ')}
                    </Text>
                    <Row gap={6} style={{ flexWrap: 'wrap' }}>
                      <Badge label={CONF[r.item.confidence].label} tone={CONF[r.item.confidence].tone} />
                      {r.existing ? <Badge label="Ya en casa: suma" tone="primary" icon="home-outline" /> : null}
                      {!r.existing && r.catalog ? <Badge label={`${storeName(r.catalog.store)} ${formatEuro(r.catalog.price)}`} tone="info" icon="storefront-outline" /> : null}
                    </Row>
                  </View>
                </Row>
                {r.item.evidence ? (
                  <Text variant="caption" color="textFaint" numberOfLines={2}>
                    {r.item.evidence}
                  </Text>
                ) : null}
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="caption" color="textMuted">
                    Unidades
                  </Text>
                  <Stepper size="sm" value={r.count} min={1} label={`unidades de ${r.item.name}`} onChange={(v) => update(r.key, { count: v })} />
                </Row>
              </Card>
            </Animated.View>
          ))}
          <Text variant="caption" color="textFaint" style={{ textAlign: 'center' }}>
            Reconocido con Gemini (Google). Revisa la lista: la IA puede equivocarse con productos tapados o envases parecidos.
          </Text>
          <Button title="Hacer otra foto" variant="ghost" icon="camera-outline" onPress={() => { setPhoto(null); setRows(null); }} />
        </>
      ) : null}
    </Screen>
  );
}
