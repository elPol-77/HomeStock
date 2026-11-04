import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { DateField, ExpiryKindPicker, StorePicker } from '@/components/Pickers';
import { ProductThumb } from '@/components/ProductThumb';
import { Button, Card, Chip, Row, Screen, SectionTitle, SkeletonList, Stepper, SwitchRow, Text, TextField } from '@/components/ui';
import { guessLocation } from '@/data/locationGuess';
import { getList, getListItems } from '@/data/lists';
import { allProducts, listLocations, packageOf } from '@/data/products';
import { finishPurchase } from '@/data/purchases';
import type { ListItem, Location, Product } from '@/data/types';
import { ExpiryKind } from '@/domain/expiry';
import { formatEuro, parseDecimal } from '@/domain/text';
import { useDrafts } from '@/services/drafts';
import { haptic } from '@/services/haptics';
import { useSettings } from '@/services/settings';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';

interface Line {
  item: ListItem;
  product: Product | null;
  quantity: number;
  price: string;
  expiry: string | null;
  kind: ExpiryKind | null;
  locationId: string | null;
  addToInventory: boolean;
  expanded: boolean;
}

/** Confirmación de compra: solo lo marcado y confirmado entra en el inventario. */
export default function FinishPurchase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const favorite = useSettings((s) => s.favoriteStores[0] ?? null);
  const requestExpiry = useDrafts((s) => s.requestExpiry);
  const takeExpiry = useDrafts((s) => s.takeExpiry);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [store, setStore] = useState<string | null>(null);
  const [paidTotal, setPaidTotal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [list, items, products, locs] = await Promise.all([getList(id), getListItems(id), allProducts(), listLocations()]);
      setLocations(locs);
      setStore(list?.store ?? favorite);
      const byId = new Map(products.map((p) => [p.id, p]));
      setLines(
        items
          .filter((i) => i.checked)
          .map((item) => {
            const product = item.product_id ? byId.get(item.product_id) ?? null : null;
            return {
              item,
              product,
              quantity: item.quantity,
              price: item.actual_price ?? item.estimated_price ? String(item.actual_price ?? item.estimated_price).replace('.', ',') : '',
              expiry: null,
              kind: 'use_by',
              locationId: guessLocation(product?.category ?? item.category, locs, product?.default_location_id, product?.name ?? item.name),
              addToInventory: true,
              expanded: false,
            };
          }),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLines((prev) =>
        prev?.map((l) => {
          const r = takeExpiry(`finish:${l.item.id}`);
          return r ? { ...l, expiry: r.date, kind: r.kind ?? l.kind, expanded: true } : l;
        }) ?? prev,
      );
    }, [takeExpiry]),
  );

  const patch = (itemId: string, p: Partial<Line>) => setLines((prev) => prev?.map((l) => (l.item.id === itemId ? { ...l, ...p } : l)) ?? prev);

  const computed = (lines ?? []).reduce((s, l) => {
    const n = l.price ? parseDecimal(l.price) : NaN;
    return Number.isNaN(n) ? s : s + n * l.quantity;
  }, 0);

  const confirm = async () => {
    if (!lines || lines.length === 0) return;
    setSaving(true);
    try {
      const total = paidTotal ? parseDecimal(paidTotal) : null;
      const res = await finishPurchase({
        listId: id,
        store,
        source: 'list',
        total: total != null && !Number.isNaN(total) ? total : null,
        archiveListIfDone: true,
        lines: lines.map((l) => {
          const unit = l.price ? parseDecimal(l.price) : null;
          return {
            listItemId: l.item.id,
            productId: l.product?.id ?? null,
            name: l.product?.name ?? l.item.name,
            brand: l.product?.brand ?? null,
            barcode: l.product?.barcode ?? null,
            category: l.product?.category ?? l.item.category,
            pkg: l.product ? packageOf(l.product) : null,
            quantity: l.quantity,
            unitPrice: unit != null && !Number.isNaN(unit) ? unit : null,
            totalPrice: unit != null && !Number.isNaN(unit) ? Math.round(unit * l.quantity * 100) / 100 : null,
            expiryDate: l.expiry,
            expiryKind: l.expiry ? l.kind : null,
            locationId: l.locationId,
            addToInventory: l.addToInventory,
          };
        }),
      });
      haptic.success();
      router.dismissTo?.('/shop');
      router.push({ pathname: '/purchase/[id]', params: { id: res.purchaseId, celebrate: '1', added: String(res.added), created: String(res.createdProducts), saved: String(res.verifiedSavings) } });
    } catch (e) {
      haptic.error();
      toast(e instanceof Error ? e.message : 'No se pudo guardar la compra', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (!lines) {
    return (
      <Screen back bottomInset="safe">
        <SkeletonList />
      </Screen>
    );
  }

  return (
    <Screen
      title="Finalizar compra"
      subtitle="Revisa lo que has comprado. Solo lo confirmado se añadirá a tu inventario."
      back
      bottomInset="none"
      footer={
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="body" color="textMuted">
              {lines.filter((l) => l.addToInventory).length} al inventario
            </Text>
            <Text variant="heading">{formatEuro(paidTotal ? parseDecimal(paidTotal) : computed)}</Text>
          </Row>
          <Button title="Confirmar compra" size="lg" icon="checkmark-done" loading={saving} disabled={lines.length === 0} onPress={confirm} />
        </View>
      }>
      <StorePicker value={store} onChange={setStore} label="¿Dónde has comprado?" />
      <TextField
        label="Total pagado (opcional)"
        placeholder={computed ? formatEuro(computed) : '0,00 €'}
        value={paidTotal}
        onChangeText={setPaidTotal}
        keyboardType="decimal-pad"
        hint="Si no lo pones, usamos la suma de los precios de cada producto."
        icon="wallet-outline"
      />

      <SectionTitle title={`Productos (${lines.length})`} />
      {lines.map((l) => (
        <Card key={l.item.id} style={{ gap: 12, opacity: l.addToInventory ? 1 : 0.7 }}>
          <Row>
            <ProductThumb uri={l.product?.image_url ?? l.item.image_url} category={l.product?.category ?? l.item.category} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {l.product?.name ?? l.item.name}
              </Text>
              <Text variant="caption" color="textMuted">
                {l.product ? 'Se sumará a tus existencias' : 'Producto nuevo: se creará en tu inventario'}
              </Text>
            </View>
            <Stepper size="sm" value={l.quantity} min={1} onChange={(v) => patch(l.item.id, { quantity: v })} label={l.item.name} />
          </Row>
          <Row>
            <TextField placeholder="Precio/ud" value={l.price} onChangeText={(t) => patch(l.item.id, { price: t })} keyboardType="decimal-pad" icon="pricetag-outline" containerStyle={{ flex: 1 }} />
            <Button title={l.expiry ? 'Fecha ✓' : 'Caducidad'} size="sm" variant="secondary" icon="calendar-outline" onPress={() => patch(l.item.id, { expanded: !l.expanded })} />
          </Row>
          {l.expanded ? (
            <View style={{ gap: 12 }}>
              <DateField label="Caducidad / consumo preferente" value={l.expiry} onChange={(d) => patch(l.item.id, { expiry: d })} />
              <Button
                title="Leer fecha con la cámara"
                size="sm"
                variant="ghost"
                icon="scan-outline"
                onPress={() => {
                  requestExpiry(`finish:${l.item.id}`);
                  router.push(`/scan/expiry?target=finish:${l.item.id}`);
                }}
              />
              {l.expiry ? <ExpiryKindPicker value={l.kind} onChange={(k) => patch(l.item.id, { kind: k })} /> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {locations.map((loc) => (
                  <Chip key={loc.id} label={loc.name} selected={l.locationId === loc.id} onPress={() => patch(l.item.id, { locationId: loc.id })} />
                ))}
              </View>
              <SwitchRow label="Añadir al inventario" description="Desactívalo para registrar solo el gasto (p. ej. algo para consumir ya)." value={l.addToInventory} onChange={(v) => patch(l.item.id, { addToInventory: v })} />
            </View>
          ) : (
            <Row gap={6}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text variant="caption" color="textMuted">
                {locations.find((x) => x.id === l.locationId)?.name ?? 'Sin ubicación'}
              </Text>
            </Row>
          )}
        </Card>
      ))}
      {lines.length === 0 ? (
        <Card tone="warning">
          <Text variant="body">No has marcado ningún producto como comprado. Vuelve al modo compra y marca lo que has metido en el carro.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
