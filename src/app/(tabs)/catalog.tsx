import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductThumb } from '@/components/ProductThumb';
import { Chip, EmptyState, IconButton, Row, ScalePressable, Segmented, TAB_BAR_SPACE, Text, TextField } from '@/components/ui';
import { addBundledToList } from '@/data/catalogProducts';
import { defaultListId, listShoppingLists } from '@/data/lists';
import { CATEGORIES } from '@/data/types';
import { useLiveQuery } from '@/db/events';
import { all } from '@/db/client';
import { formatShortDate } from '@/domain/dates';
import { formatEuro, normalizeText } from '@/domain/text';
import { formatUnitPrice, unitPrice } from '@/domain/units';
import { BundledItem, bundledCatalogInfo, bundledItems, packagePrice, priceUnitLabel, searchBundled } from '@/services/catalog/bundled';
import { storeColor, storeName } from '@/services/catalog/stores';
import { haptic } from '@/services/haptics';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type Sort = 'relevance' | 'price' | 'unit';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'relevance', label: 'Por sección' },
  { value: 'price', label: 'Precio' },
  { value: 'unit', label: '€/kg·L' },
];
const ROW_HEIGHT = 92;

function unitValue(i: BundledItem): number {
  const total = packagePrice(i);
  const up = total != null ? unitPrice(total, i.pkg) : null;
  return up?.value ?? Number.POSITIVE_INFINITY;
}

async function pendingNamesIn(listId: string | null): Promise<Set<string>> {
  if (!listId) return new Set();
  const rows = await all<{ name: string }>('SELECT name FROM list_items WHERE list_id = ? AND deleted = 0 AND checked = 0', [listId]);
  return new Set(rows.map((r) => normalizeText(r.name)));
}

const CatalogRow = memo(function CatalogRow({ item, inList, onAdd }: { item: BundledItem; inList: boolean; onAdd: (i: BundledItem) => void }) {
  const { colors } = useTheme();
  const total = packagePrice(item);
  const up = total != null ? unitPrice(total, item.pkg) : null;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.format ?? ''}, ${formatEuro(item.price)} en ${storeName(item.store)}. Ver precios`}
      onPress={() => router.push({ pathname: '/prices/product', params: { name: item.name, brand: item.brand ?? '', qty: item.format ?? '', image: item.imageUrl ?? '', barcode: item.barcode ?? '', bundledId: item.id } })}
      scaleTo={0.98}
      style={{ height: ROW_HEIGHT - 8, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <ProductThumb uri={item.imageUrl} category={item.category} size={60} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {item.name}
        </Text>
        <Row gap={6}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: storeColor(item.store) }} />
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
            {storeName(item.store)}
            {item.format ? ` · ${item.format}` : ''}
          </Text>
        </Row>
        <Row gap={6}>
          {item.isOffer && item.regularPrice ? (
            <Text variant="caption" color="textFaint" style={{ textDecorationLine: 'line-through' }}>
              {formatEuro(item.regularPrice)}
            </Text>
          ) : null}
          <Text variant="bodyStrong" style={{ color: item.isOffer ? colors.danger : colors.text }}>
            {formatEuro(item.price)}
            {item.priceUnit === 'ud' ? '' : <Text variant="caption" color="textMuted">{` ${priceUnitLabel(item)}`}</Text>}
          </Text>
          {up ? (
            <Text variant="caption" color="textFaint">
              {formatUnitPrice(up)}
            </Text>
          ) : null}
        </Row>
      </View>
      <IconButton
        icon={inList ? 'checkmark-circle' : 'add-circle'}
        tone={inList ? 'default' : 'primary'}
        label={inList ? `${item.name} ya está en la lista; añadir otra unidad` : `Añadir ${item.name} a la lista`}
        onPress={() => onAdd(item)}
      />
    </ScalePressable>
  );
});

export default function Catalog() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const info = useMemo(() => bundledCatalogInfo(), []);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [store, setStore] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('relevance');
  const [listId, setListId] = useState<string | null>(null);
  const lists = useLiveQuery(() => listShoppingLists('active'), ['shopping_lists']);
  const target = (lists.data ?? []).find((l) => l.id === listId) ?? lists.data?.[0] ?? null;
  const inList = useLiveQuery(() => pendingNamesIn(target?.id ?? null), ['list_items'], [target?.id]);

  const base = useMemo(() => (deferred.trim().length >= 2 ? searchBundled(deferred, 400) : bundledItems()), [deferred]);
  const filtered = useMemo(() => base.filter((i) => (!store || i.store === store) && (!category || i.category === category)), [base, store, category]);
  const items = useMemo(() => {
    if (sort === 'price') return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === 'unit') return [...filtered].sort((a, b) => unitValue(a) - unitValue(b));
    return filtered;
  }, [filtered, sort]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of base) if (!store || i.store === store) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [base, store]);

  const pickList = () => {
    const ls = lists.data ?? [];
    if (ls.length <= 1) {
      router.push('/shop');
      return;
    }
    const names = ls.map((l) => `${l.emoji ?? '📝'} ${l.name}`);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...names, 'Cancelar'], cancelButtonIndex: names.length }, (i) => i < ls.length && setListId(ls[i].id));
    } else {
      Alert.alert('¿A qué lista añado?', undefined, [...ls.slice(0, 3).map((l) => ({ text: l.name, onPress: () => setListId(l.id) })), { text: 'Cancelar', style: 'cancel' as const }]);
    }
  };

  const onAdd = useCallback(
    async (item: BundledItem) => {
      try {
        const ls = target ?? (await listShoppingLists('active'))[0];
        let id = ls?.id;
        if (!id) id = await defaultListId();
        await addBundledToList(id, item);
        haptic.success();
        toast(`Añadido a «${ls?.name ?? 'Compra semanal'}»`);
      } catch (e) {
        haptic.error();
        toast(e instanceof Error ? e.message : 'No se pudo añadir', 'danger');
      }
    },
    [target],
  );

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header">
            Productos
          </Text>
          <Text variant="caption" color="textMuted">
            {items.length.toLocaleString('es-ES')} productos · precios de {info.map((c) => `${storeName(c.store)} ${formatShortDate(c.capturedAt)}`).join(', ')}
          </Text>
        </View>
      </Row>
      <TextField icon="search" placeholder="Buscar: leche, Hacendado, detergente…" value={query} onChangeText={setQuery} returnKeyType="search" clearButtonMode="while-editing" accessibilityLabel="Buscar en el catálogo" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20, flexGrow: 0 }}>
        <Chip label="Todos los súper" icon="storefront-outline" selected={store === null} onPress={() => setStore(null)} />
        {info.map((c) => (
          <Chip key={c.store} label={storeName(c.store)} count={c.count} selected={store === c.store} onPress={() => setStore(store === c.store ? null : c.store)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20, flexGrow: 0 }}>
        <Chip label="Todo" icon="apps-outline" selected={category === null} onPress={() => setCategory(null)} />
        {CATEGORIES.filter((c) => categoryCounts.has(c.name)).map((c) => (
          <Chip key={c.name} label={c.name} icon={c.icon as never} count={categoryCounts.get(c.name)} selected={category === c.name} onPress={() => setCategory(category === c.name ? null : c.name)} />
        ))}
      </ScrollView>
      <Segmented options={deferred.trim().length >= 2 ? [{ value: 'relevance' as Sort, label: 'Relevancia' }, ...SORTS.slice(1)] : SORTS} value={sort} onChange={setSort} />
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel={`Añadiendo a ${target?.name ?? 'Compra semanal'}. Cambiar lista`}
        onPress={pickList}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignSelf: 'flex-start' }}>
        <Ionicons name="cart" size={16} color={colors.primary} />
        <Text variant="caption" color="primary" style={{ fontWeight: '700' }}>
          Añadir a: {target ? `${target.emoji ?? '📝'} ${target.name}` : 'Compra semanal'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.primary} />
      </ScalePressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        renderItem={({ item }) => (
          <View style={{ height: ROW_HEIGHT, paddingBottom: 8 }}>
            <CatalogRow item={item} inList={inList.data?.has(normalizeText(item.name)) ?? false} onAdd={onAdd} />
          </View>
        )}
        initialNumToRender={10}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <EmptyState icon="search-outline" title="Sin resultados" text="Prueba con otra palabra o quita los filtros." actionLabel="Quitar filtros" onAction={() => { setQuery(''); setStore(null); setCategory(null); }} />
        }
        ListFooterComponent={
          items.length > 0 ? (
            <Text variant="caption" color="textFaint" style={{ textAlign: 'center', marginTop: 8 }}>
              Precios tal como aparecían en la web de cada cadena en la fecha indicada. Fotos: Open Food Facts (CC BY-SA).
            </Text>
          ) : undefined
        }
      />
    </View>
  );
}

