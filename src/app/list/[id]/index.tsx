import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ListItemRow } from '@/components/ListItemRow';
import { StorePicker } from '@/components/Pickers';
import { Button, Card, Chip, EmptyState, IconButton, Row, ScalePressable, Screen, SectionTitle, SkeletonList, Text, TextField } from '@/components/ui';
import { addBundledToList } from '@/data/catalogProducts';
import { useLiveQuery } from '@/db/events';
import { addListItem, deleteList, getList, getListItems, renameList, setListStatus } from '@/data/lists';
import { lastPaidPrice } from '@/data/prices';
import { allProducts } from '@/data/products';
import { getSuggestions } from '@/data/summary';
import type { ListItem, Product } from '@/data/types';
import { formatEuro, normalizeText } from '@/domain/text';
import { BundledItem, priceUnitLabel, searchBundled } from '@/services/catalog/bundled';
import { storeColor, storeName } from '@/services/catalog/stores';
import { haptic } from '@/services/haptics';
import { addProductToList } from '@/services/inventoryActions';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

function groupByCategory(items: ListItem[]) {
  const groups = new Map<string, ListItem[]>();
  for (const it of items) {
    const k = it.category ?? 'Otros';
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, reduceMotion } = useTheme();
  const list = useLiveQuery(() => getList(id), ['shopping_lists'], [id]);
  const items = useLiveQuery(() => getListItems(id), ['list_items', 'products'], [id]);
  const products = useLiveQuery(allProducts, ['products']);
  const suggestions = useLiveQuery(getSuggestions, ['products', 'batches', 'stock_movements', 'list_items']);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const matches = useMemo(() => {
    const q = normalizeText(text);
    if (q.length < 2) return [];
    return (products.data ?? []).filter((p: Product) => normalizeText(`${p.name} ${p.brand ?? ''}`).includes(q)).slice(0, 5);
  }, [text, products.data]);
  const catalogMatches = useMemo(() => {
    if (text.trim().length < 2) return [];
    const own = new Set(matches.map((p) => normalizeText(p.name)));
    return searchBundled(text, 8).filter((b) => !own.has(normalizeText(b.name))).slice(0, 6);
  }, [text, matches]);

  const pending = (items.data ?? []).filter((i) => !i.checked);
  const done = (items.data ?? []).filter((i) => i.checked);
  const estimate = pending.reduce((s, i) => s + (i.estimated_price ?? 0) * i.quantity, 0);

  const addFree = async () => {
    const t = text.trim();
    if (!t) return;
    const exact = (products.data ?? []).find((p) => normalizeText(p.name) === normalizeText(t));
    if (exact) await addProduct(exact);
    else {
      await addListItem(id, { name: t });
      haptic.light();
    }
    setText('');
  };
  const addCatalog = async (b: BundledItem) => {
    await addBundledToList(id, b);
    haptic.light();
    setText('');
  };
  const addProduct = async (p: Product) => {
    await addListItem(id, { productId: p.id, name: p.name, category: p.category, estimatedPrice: await lastPaidPrice(p.id) });
    haptic.light();
    setText('');
  };

  if (list.loading && !list.data) {
    return (
      <Screen back bottomInset="safe">
        <SkeletonList />
      </Screen>
    );
  }
  if (!list.data) {
    return (
      <Screen back bottomInset="safe">
        <EmptyState icon="help-circle-outline" title="Lista no encontrada" actionLabel="Volver" onAction={() => router.back()} />
      </Screen>
    );
  }
  const l = list.data;
  const archived = l.status === 'archived';

  return (
    <Screen
      back
      bottomInset="none"
      right={
        <>
          <IconButton icon="barcode-outline" label="Escanear para añadir a la lista" onPress={() => router.push(`/scan/barcode?listId=${id}`)} />
          <IconButton
            icon="ellipsis-horizontal"
            label="Opciones de la lista"
            onPress={() =>
              Alert.alert(l.name, undefined, [
                { text: 'Renombrar / tienda', onPress: () => { setName(l.name); setEditing(true); } },
                { text: archived ? 'Reactivar lista' : 'Archivar lista', onPress: () => setListStatus(id, archived ? 'active' : 'archived') },
                {
                  text: 'Eliminar lista',
                  style: 'destructive',
                  onPress: () =>
                    Alert.alert('¿Eliminar la lista?', 'Esta acción no se puede deshacer.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteList(id); router.back(); } },
                    ]),
                },
                { text: 'Cancelar', style: 'cancel' },
              ])
            }
          />
        </>
      }
      footer={
        pending.length + done.length > 0 && !archived ? (
          <Row>
            <Button title="Comparar precios" variant="secondary" icon="pricetags-outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/prices/basket', params: { listId: id } })} />
            <Button title="Ir a comprar" icon="cart" style={{ flex: 1 }} onPress={() => router.push(`/list/${id}/shop`)} />
          </Row>
        ) : undefined
      }>
      <View style={{ gap: 4 }}>
        <Text variant="title">
          {l.emoji ?? '📝'} {l.name}
        </Text>
        <Text variant="caption" color="textMuted">
          {pending.length} pendientes{estimate > 0 ? ` · estimado ${formatEuro(estimate)}` : ''}
          {archived ? ' · archivada' : ''}
        </Text>
      </View>

      {editing ? (
        <Card tone="primary" style={{ gap: 12 }}>
          <TextField label="Nombre" value={name} onChangeText={setName} />
          <StorePicker value={l.store} onChange={(s) => renameList(id, name || l.name, s)} label="Tienda prevista (opcional)" />
          <Button title="Hecho" onPress={async () => { await renameList(id, name || l.name, l.store); setEditing(false); }} />
        </Card>
      ) : null}

      {!archived ? (
        <View style={{ gap: 8 }}>
          <TextField
            icon="add-circle-outline"
            placeholder="Añadir: leche, arroz, detergente…"
            value={text}
            onChangeText={setText}
            onSubmitEditing={addFree}
            returnKeyType="done"
            blurOnSubmit={false}
            accessibilityLabel="Añadir producto a la lista"
          />
          {matches.length + catalogMatches.length > 0 ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              {matches.map((p) => (
                <ScalePressable key={p.id} accessibilityRole="button" accessibilityLabel={`Añadir ${p.name}`} onPress={() => addProduct(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                  <Ionicons name="home-outline" size={18} color={colors.primary} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {p.name}
                    {p.brand ? <Text variant="caption" color="textMuted">{`  ${p.brand}`}</Text> : null}
                  </Text>
                  <Ionicons name="add" size={20} color={colors.primary} />
                </ScalePressable>
              ))}
              {catalogMatches.map((b) => (
                <ScalePressable
                  key={b.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Añadir ${b.name}, ${b.format ?? ''}, ${formatEuro(b.price)} en ${storeName(b.store)}`}
                  onPress={() => addCatalog(b)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, marginHorizontal: 5, backgroundColor: storeColor(b.store) }} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {[b.format, `${formatEuro(b.price)}${b.priceUnit === 'ud' ? '' : ` ${priceUnitLabel(b)}`} en ${storeName(b.store)}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="add" size={20} color={colors.primary} />
                </ScalePressable>
              ))}
            </Animated.View>
          ) : null}
          {(suggestions.data ?? []).length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(suggestions.data ?? []).slice(0, 10).map((s) => (
                <Chip key={s.productId} label={`+ ${s.name} (${s.suggestedQuantity})`} icon={s.reason === 'out' ? 'alert-circle-outline' : 'trending-down-outline'} onPress={() => addProductToList(s.productId, s.suggestedQuantity, id)} />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : (
        <Button title="Reactivar lista" variant="secondary" onPress={() => setListStatus(id, 'active').then(() => toast('Lista reactivada'))} />
      )}

      {items.data && items.data.length === 0 ? (
        <EmptyState icon="list-outline" title="Lista vacía" text="Escribe arriba lo que necesitas, escanea un código o toca una sugerencia." />
      ) : null}

      {groupByCategory(pending).map(([cat, its]) => (
        <View key={cat} style={{ gap: 8 }}>
          <Text variant="label" color="textMuted">
            {cat.toUpperCase()}
          </Text>
          {its.map((it) => (
            <Animated.View key={it.id} entering={reduceMotion ? undefined : FadeIn} exiting={reduceMotion ? undefined : FadeOut} layout={reduceMotion ? undefined : LinearTransition.springify().damping(20)}>
              <ListItemRow item={it} mode="edit" />
            </Animated.View>
          ))}
        </View>
      ))}

      {done.length > 0 ? (
        <>
          <SectionTitle title={`En el carro (${done.length})`} />
          {done.map((it) => (
            <Animated.View key={it.id} entering={reduceMotion ? undefined : FadeIn} layout={reduceMotion ? undefined : LinearTransition}>
              <ListItemRow item={it} mode="edit" />
            </Animated.View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
