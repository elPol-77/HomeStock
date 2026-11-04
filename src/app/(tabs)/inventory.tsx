import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductRow } from '@/components/ProductRow';
import { Chip, EmptyState, ErrorState, IconButton, Segmented, SkeletonList, TAB_BAR_SPACE, Text, TextField } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { InventoryFilter, listLocations, listProductsWithStock, locationCounts } from '@/data/products';
import { useSettings } from '@/services/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { shadow } from '@/theme/tokens';

const FILTERS: { value: InventoryFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'expiring', label: 'Caducan' },
  { value: 'low', label: 'Pocos' },
  { value: 'out', label: 'Agotados' },
];

export default function Inventory() {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ filter?: InventoryFilter }>();
  const warnDays = useSettings((s) => s.warnDays);
  const [filter, setFilter] = useState<InventoryFilter>(params.filter ?? 'all');
  const [location, setLocation] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (params.filter) setFilter(params.filter);
  }, [params.filter]);

  const locations = useLiveQuery(listLocations, ['locations']);
  const counts = useLiveQuery(locationCounts, ['batches', 'stock_movements']);
  const products = useLiveQuery(
    () => listProductsWithStock({ filter, locationId: location, search, warnDays }),
    ['products', 'batches', 'stock_movements', 'locations'],
    [filter, location, search, warnDays],
  );
  const total = useMemo(() => products.data?.length ?? 0, [products.data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title" accessibilityRole="header">
            Inventario
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton icon="options-outline" label="Gestionar ubicaciones" onPress={() => router.push('/settings/locations')} />
            <IconButton icon="barcode-outline" label="Escanear producto" tone="primary" onPress={() => router.push('/scan/barcode')} />
          </View>
        </View>
        <TextField icon="search" placeholder="Buscar en casa" value={search} onChangeText={setSearch} returnKeyType="search" clearButtonMode="while-editing" accessibilityLabel="Buscar productos" />
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20, flexGrow: 0 }}>
          <Chip label="Todas" selected={location === null} onPress={() => setLocation(null)} icon="home-outline" />
          {(locations.data ?? []).map((l) => (
            <Chip key={l.id} label={l.name} icon={l.icon as never} count={counts.data?.[l.id] ?? 0} selected={location === l.id} onPress={() => setLocation(location === l.id ? null : l.id)} />
          ))}
        </ScrollView>
      </View>

      {products.error ? (
        <ErrorState message={products.error.message} onRetry={products.reload} />
      ) : products.loading && !products.data ? (
        <View style={{ padding: 20 }}>
          <SkeletonList rows={6} />
        </View>
      ) : (
        <FlatList
          data={products.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom + 70, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            total > 0 ? (
              <Text variant="caption" color="textMuted">
                {total} {total === 1 ? 'producto' : 'productos'}
              </Text>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(220)} layout={reduceMotion ? undefined : LinearTransition.springify().damping(20)}>
              <ProductRow product={item} warnDays={warnDays} />
            </Animated.View>
          )}
          ListEmptyComponent={
            search || filter !== 'all' || location ? (
              <EmptyState icon="search-outline" title="Sin resultados" text="No hay productos que coincidan con estos filtros." actionLabel="Quitar filtros" onAction={() => { setSearch(''); setFilter('all'); setLocation(null); }} />
            ) : (
              <EmptyState icon="file-tray-outline" title="Aún no hay productos" text="Añade lo que tienes en casa escaneando su código de barras, con una foto o desde el ticket." actionLabel="Añadir producto" onAction={() => router.push('/add')} />
            )
          }
        />
      )}

      <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(200)} style={{ position: 'absolute', right: 20, bottom: TAB_BAR_SPACE + insets.bottom - 6 }}>
        <IconButton icon="add" label="Añadir producto" tone="primary" size={58} onPress={() => router.push('/add')} style={shadow(colors, 3)} />
      </Animated.View>
    </View>
  );
}
