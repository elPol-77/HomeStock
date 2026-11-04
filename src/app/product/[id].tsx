import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { DateField, ExpiryKindPicker } from '@/components/Pickers';
import { ProductThumb } from '@/components/ProductThumb';
import { AnimatedNumber, Badge, Button, Card, Chip, Divider, EmptyState, IconButton, Row, Screen, SectionTitle, SkeletonList, Stepper, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { deleteProduct, getProductWithStock, listLocations, packageOf } from '@/data/products';
import { addStock, getBatches, getMovements, markOpened, removeBatch, setBatchQuantity, updateBatch } from '@/data/stock';
import type { Batch, Location, MovementReason } from '@/data/types';
import { formatDate, relativeDays, todayISO } from '@/domain/dates';
import { EXPIRY_KIND_LABEL, expiryLabel, expiryStatus, ExpiryKind } from '@/domain/expiry';
import { stockLevel } from '@/domain/inventory';
import { formatEuro } from '@/domain/text';
import { formatPackage, UNIT_SHORT } from '@/domain/units';
import { storeName } from '@/services/catalog/stores';
import { useDrafts } from '@/services/drafts';
import { addProductToList, decrementProduct, incrementProduct } from '@/services/inventoryActions';
import { useSettings } from '@/services/settings';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';

const REASON: Record<MovementReason, { label: string; icon: 'cart' | 'restaurant' | 'trash' | 'alarm' | 'create' }> = {
  purchase: { label: 'Compra', icon: 'cart' },
  consume: { label: 'Consumido', icon: 'restaurant' },
  discard: { label: 'Desechado', icon: 'trash' },
  expired: { label: 'Caducado', icon: 'alarm' },
  adjust: { label: 'Ajuste', icon: 'create' },
};

function BatchCard({ batch, locations, warnDays }: { batch: Batch & { location_name: string | null }; locations: Location[]; warnDays: number }) {
  const [open, setOpen] = useState(false);
  const requestExpiry = useDrafts((s) => s.requestExpiry);
  const takeExpiry = useDrafts((s) => s.takeExpiry);
  const st = expiryStatus(batch.expiry_date, batch.expiry_kind, warnDays);

  useFocusEffect(
    useCallback(() => {
      const r = takeExpiry(`batch:${batch.id}`);
      if (r) updateBatch(batch.id, { expiry_date: r.date, expiry_kind: r.kind ?? batch.expiry_kind ?? 'use_by' });
    }, [takeExpiry, batch.id, batch.expiry_kind]),
  );

  const tone = st === 'expired' ? 'danger' : st === 'past_best_before' || st === 'soon' || st === 'today' ? 'warning' : 'neutral';
  return (
    <Card style={{ gap: 12 }}>
      <Row>
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap={8}>
            <Text variant="heading">{batch.quantity} ud</Text>
            {batch.opened_at ? <Badge label="Abierto" tone="info" /> : null}
          </Row>
          <Badge label={expiryLabel(batch.expiry_date, batch.expiry_kind)} tone={tone} icon="alarm-outline" />
          <Text variant="caption" color="textMuted">
            {[batch.location_name, batch.expiry_date ? `${EXPIRY_KIND_LABEL[batch.expiry_kind ?? 'use_by']}: ${formatDate(batch.expiry_date)}` : null, batch.price_paid ? `${formatEuro(batch.price_paid)}/ud` : null, batch.store ? storeName(batch.store) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <IconButton icon={open ? 'chevron-up' : 'ellipsis-horizontal'} label={open ? 'Cerrar opciones del lote' : 'Opciones del lote'} onPress={() => setOpen((o) => !o)} />
      </Row>
      {st === 'past_best_before' ? (
        <Text variant="caption" color="textMuted">
          Ha pasado su consumo preferente: revisa olor, aspecto y envase. No significa necesariamente que no se pueda consumir.
        </Text>
      ) : null}
      {open ? (
        <Animated.View entering={FadeIn} style={{ gap: 14 }}>
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">Cantidad del lote</Text>
            <Stepper value={batch.quantity} onChange={(v) => setBatchQuantity(batch.id, v)} size="sm" label="cantidad del lote" />
          </Row>
          <DateField label="Fecha" value={batch.expiry_date} onChange={(d) => updateBatch(batch.id, { expiry_date: d, expiry_kind: d ? batch.expiry_kind ?? 'use_by' : null })} />
          <Button
            title="Leer fecha con la cámara"
            size="sm"
            variant="secondary"
            icon="scan-outline"
            onPress={() => {
              requestExpiry(`batch:${batch.id}`);
              router.push(`/scan/expiry?target=batch:${batch.id}`);
            }}
          />
          {batch.expiry_date ? <ExpiryKindPicker value={batch.expiry_kind} onChange={(k: ExpiryKind) => updateBatch(batch.id, { expiry_kind: k })} /> : null}
          <Text variant="caption" color="textMuted">
            Ubicación
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {locations.map((l) => (
              <Chip key={l.id} label={l.name} selected={batch.location_id === l.id} onPress={() => updateBatch(batch.id, { location_id: l.id })} />
            ))}
          </View>
          <Row style={{ flexWrap: 'wrap' }} gap={8}>
            <Button title={batch.opened_at ? 'Marcar sin abrir' : 'Marcar abierto'} size="sm" variant="secondary" icon="cube-outline" onPress={() => markOpened(batch.id, !batch.opened_at)} />
            <Button title="Consumido" size="sm" variant="secondary" icon="restaurant-outline" onPress={() => removeBatch(batch.id, 'consume').then(() => toast('Lote marcado como consumido'))} />
            <Button
              title={st === 'expired' ? 'Tirar (caducado)' : 'Tirar'}
              size="sm"
              variant="danger"
              icon="trash-outline"
              onPress={() =>
                Alert.alert('¿Tirar este lote?', 'Quedará registrado en tus estadísticas de desperdicio.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Tirar', style: 'destructive', onPress: () => removeBatch(batch.id, st === 'expired' || st === 'past_best_before' ? 'expired' : 'discard') },
                ])
              }
            />
          </Row>
          <Text variant="caption" color="textFaint">
            Comprado {batch.purchased_at ? relativeDays(batch.purchased_at) : '—'}
          </Text>
        </Animated.View>
      ) : null}
    </Card>
  );
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, reduceMotion } = useTheme();
  const warnDays = useSettings((s) => s.warnDays);
  const product = useLiveQuery(() => getProductWithStock(id), ['products', 'batches', 'stock_movements', 'price_observations'], [id]);
  const batches = useLiveQuery(() => getBatches(id), ['batches', 'stock_movements', 'locations'], [id]);
  const movements = useLiveQuery(() => getMovements(id), ['stock_movements'], [id]);
  const locations = useLiveQuery(listLocations, ['locations']);
  const [adding, setAdding] = useState(false);
  const [newQty, setNewQty] = useState(1);
  const [newExpiry, setNewExpiry] = useState<string | null>(null);

  const p = product.data;
  if (product.loading && !p) {
    return (
      <Screen back bottomInset="safe">
        <SkeletonList rows={4} />
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen back bottomInset="safe">
        <EmptyState icon="help-circle-outline" title="Producto no encontrado" text="Puede que se haya eliminado desde otro dispositivo." actionLabel="Volver" onAction={() => router.back()} />
      </Screen>
    );
  }
  const level = stockLevel(p.quantity, p.min_quantity);
  const pkg = formatPackage(packageOf(p));

  return (
    <Screen
      back
      bottomInset="safe"
      right={
        <>
          <IconButton icon="create-outline" label="Editar producto" onPress={() => router.push(`/product/edit?id=${p.id}`)} />
          <IconButton
            icon="trash-outline"
            label="Eliminar producto"
            tone="danger"
            onPress={() =>
              Alert.alert('¿Eliminar producto?', `Se borrará «${p.name}» y sus lotes de tu inventario.`, [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteProduct(p.id);
                    toast('Producto eliminado');
                    router.back();
                  },
                },
              ])
            }
          />
        </>
      }>
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)} style={{ alignItems: 'center', gap: 10 }}>
        <ProductThumb uri={p.image_url} category={p.category} size={120} />
        <Text variant="title" align="center">
          {p.name}
        </Text>
        <Text variant="body" color="textMuted" align="center">
          {[p.brand, pkg, p.category].filter(Boolean).join(' · ')}
        </Text>
        {p.barcode ? (
          <Row gap={6}>
            <Ionicons name="barcode-outline" size={16} color={colors.textFaint} />
            <Text variant="caption" color="textFaint">
              {p.barcode}
            </Text>
          </Row>
        ) : null}
      </Animated.View>

      <Card elevated style={{ alignItems: 'center', gap: 12 }}>
        <Text variant="caption" color="textMuted">
          En casa
        </Text>
        <Row gap={20}>
          <AnimatedNumber value={p.quantity} variant="display" format={(n) => (Number.isInteger(p.quantity) ? String(Math.round(n)) : n.toFixed(1).replace('.', ','))} />
          <Text variant="heading" color="textMuted">
            {UNIT_SHORT[p.unit]}
          </Text>
        </Row>
        <Stepper
          hideValue
          value={p.quantity}
          label={p.name}
          onChange={(v) => {
            if (v > p.quantity) incrementProduct(p.id, v - p.quantity);
            else decrementProduct(p.id, p.quantity - v);
          }}
        />
        <Row gap={8}>
          {level === 'out' ? <Badge label="Agotado" tone="danger" /> : level === 'low' ? <Badge label="Por debajo del mínimo" tone="warning" /> : <Badge label="Bien de existencias" tone="success" />}
          {p.min_quantity ? <Badge label={`Mínimo ${p.min_quantity}`} /> : null}
        </Row>
      </Card>

      <Row>
        <Button title="A la lista" icon="cart-outline" variant="secondary" style={{ flex: 1 }} onPress={() => addProductToList(p.id, Math.max(1, (p.usual_quantity ?? (p.min_quantity ?? 0) + 1) - p.quantity))} />
        <Button title="Precios" icon="pricetags-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/prices/product', params: { productId: p.id } })} />
      </Row>
      {p.last_price != null ? (
        <Text variant="caption" color="textMuted" align="center">
          Último precio pagado: {formatEuro(p.last_price)}
        </Text>
      ) : null}

      <SectionTitle title={`Lotes (${batches.data?.length ?? 0})`} action={adding ? 'Cancelar' : 'Añadir lote'} onAction={() => setAdding((a) => !a)} />
      {adding ? (
        <Card tone="primary" style={{ gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">Unidades</Text>
            <Stepper value={newQty} onChange={setNewQty} min={1} size="sm" label="unidades del nuevo lote" />
          </Row>
          <DateField label="Fecha de caducidad" value={newExpiry} onChange={setNewExpiry} />
          <Button
            title="Añadir lote"
            icon="add"
            onPress={async () => {
              await addStock({ productId: p.id, quantity: newQty, expiryDate: newExpiry, expiryKind: newExpiry ? 'use_by' : null, reason: 'adjust' });
              setAdding(false);
              setNewQty(1);
              setNewExpiry(null);
              toast('Lote añadido');
            }}
          />
        </Card>
      ) : null}
      {(batches.data ?? []).length === 0 && !adding ? (
        <Card tone="alt">
          <Text variant="body" color="textMuted">
            No queda nada de este producto en casa.
          </Text>
        </Card>
      ) : null}
      {(batches.data ?? []).map((b) => (
        <Animated.View key={b.id} layout={reduceMotion ? undefined : LinearTransition}>
          <BatchCard batch={b} locations={locations.data ?? []} warnDays={warnDays} />
        </Animated.View>
      ))}

      <SectionTitle title="Historial" />
      <Card style={{ gap: 0 }}>
        {(movements.data ?? []).length === 0 ? (
          <Text variant="body" color="textMuted">
            Sin movimientos todavía.
          </Text>
        ) : (
          (movements.data ?? []).map((m, i) => (
            <View key={m.id}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ paddingVertical: 10 }}>
                <Ionicons name={`${REASON[m.reason].icon}-outline` as never} size={18} color={m.delta > 0 ? colors.success : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text variant="body">{REASON[m.reason].label}</Text>
                  <Text variant="caption" color="textFaint">
                    {relativeDays(m.created_at.slice(0, 10), todayISO())}
                    {m.store ? ` · ${storeName(m.store)}` : ''}
                    {m.unit_price ? ` · ${formatEuro(m.unit_price)}` : ''}
                  </Text>
                </View>
                <Text variant="bodyStrong" color={m.delta > 0 ? 'success' : 'textMuted'}>
                  {m.delta > 0 ? '+' : ''}
                  {Number.isInteger(m.delta) ? m.delta : m.delta.toFixed(2)}
                </Text>
              </Row>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
