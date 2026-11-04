import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ProductThumb } from '@/components/ProductThumb';
import { Badge, Button, Card, Divider, Row, ScalePressable, Screen, SectionTitle, SwitchRow, Text, TextField } from '@/components/ui';
import { all, householdId } from '@/db/client';
import { useLiveQuery } from '@/db/events';
import { listShoppingLists } from '@/data/lists';
import type { PriceObservation } from '@/data/types';
import { PRICE_SOURCE_LABEL } from '@/domain/basket';
import { formatShortDate } from '@/domain/dates';
import { formatEuro } from '@/domain/text';
import { searchCatalog } from '@/services/catalog/openFoodFacts';
import { STORE_CHAINS, storeName } from '@/services/catalog/stores';
import { CatalogProduct } from '@/services/catalog/types';
import { useSettings } from '@/services/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

async function recentPrices() {
  return all<PriceObservation>(`SELECT * FROM price_observations WHERE deleted = 0 AND household_id = ? AND source != 'demo' ORDER BY observed_at DESC, created_at DESC LIMIT 8`, [householdId()]);
}

export default function Prices() {
  const { colors } = useTheme();
  const s = useSettings();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lists = useLiveQuery(() => listShoppingLists('active'), ['shopping_lists', 'list_items']);
  const recent = useLiveQuery(recentPrices, ['price_observations']);

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchCatalog(query));
    } catch {
      setError('No se pudo buscar. Comprueba tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Precios" subtitle="Compara precios verificables entre supermercados">
      {s.demoPrices ? (
        <Card tone="warning" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="flask" size={20} color={colors.warning} />
          <Text variant="caption" style={{ flex: 1 }}>
            Modo demostración activo: verás precios FICTICIOS marcados como «demo». Desactívalo abajo para ver solo datos reales.
          </Text>
        </Card>
      ) : null}

      <TextField
        icon="search"
        placeholder="Ej.: Coca-Cola Zero 2 L"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={search}
        returnKeyType="search"
        right={loading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="arrow-forward-circle" size={26} color={colors.primary} onPress={search} accessibilityLabel="Buscar" />}
      />
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      {results?.length === 0 ? (
        <Text variant="body" color="textMuted">
          Sin resultados para «{query}».
        </Text>
      ) : null}
      {results?.slice(0, 10).map((p) => (
        <ScalePressable
          key={`${p.barcode}-${p.name}`}
          accessibilityRole="button"
          accessibilityLabel={`Ver precios de ${p.name}`}
          onPress={() => router.push({ pathname: '/prices/product', params: { barcode: p.barcode ?? '', name: p.name, brand: p.brand ?? '', qty: p.quantityText ?? '', image: p.imageUrl ?? '' } })}
          style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <ProductThumb uri={p.imageUrl} category={p.category} size={46} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {p.name}
            </Text>
            <Text variant="caption" color="textMuted">
              {[p.brand, p.quantityText].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </ScalePressable>
      ))}

      <SectionTitle title="Compara tu compra completa" />
      {(lists.data ?? []).filter((l) => l.total_items > 0).length === 0 ? (
        <Card tone="alt">
          <Text variant="body" color="textMuted">
            Añade productos a una lista para comparar cuánto te costaría en cada supermercado.
          </Text>
        </Card>
      ) : (
        (lists.data ?? [])
          .filter((l) => l.total_items > 0)
          .map((l) => (
            <Card key={l.id} onPress={() => router.push({ pathname: '/prices/basket', params: { listId: l.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text variant="title">{l.emoji ?? '🛒'}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{l.name}</Text>
                <Text variant="caption" color="textMuted">
                  {l.total_items - l.checked_items} productos · opciones A, B y C
                </Text>
              </View>
              <Ionicons name="git-compare-outline" size={22} color={colors.primary} />
            </Card>
          ))
      )}

      {(recent.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Últimos precios de tu hogar" />
          <Card style={{ gap: 0 }}>
            {(recent.data ?? []).map((o, i) => (
              <View key={o.id}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {o.product_name}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {storeName(o.store)} · {formatShortDate(o.observed_at)} · {PRICE_SOURCE_LABEL[o.source]}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{formatEuro(o.price)}</Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="De dónde salen los precios" />
      <Card style={{ gap: 10 }}>
        <Row gap={10}>
          <Ionicons name="receipt-outline" size={18} color={colors.primary} />
          <Text variant="caption" style={{ flex: 1 }}>
            <Text variant="caption" style={{ fontWeight: '700' }}>Tus tickets y compras</Text>: precios reales que has pagado.
          </Text>
        </Row>
        <Row gap={10}>
          <Ionicons name="people-outline" size={18} color={colors.primary} />
          <Text variant="caption" style={{ flex: 1 }}>
            <Text variant="caption" style={{ fontWeight: '700' }}>Open Prices</Text>: base de datos abierta con precios reales aportados por personas (con ticket o foto como prueba). Cobertura todavía limitada en España.
          </Text>
        </Row>
        <SwitchRow label="Usar Open Prices" description={s.geo ? `Tiendas a menos de ${s.maxDistanceKm} km de ${s.geo.label}` : 'Toda España (configura tu ubicación en Perfil → Tiendas)'} value={s.usePublicPrices} onChange={(v) => s.update({ usePublicPrices: v })} />
        <Divider />
        <Text variant="caption" color="textMuted">
          Conectores de supermercados
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {STORE_CHAINS.slice(0, 8).map((c) => (
            <Badge key={c.id} label={`${c.name}: sin API pública`} tone="neutral" />
          ))}
        </View>
        <Text variant="caption" color="textFaint">
          Ninguna de estas cadenas ofrece hoy una API pública de precios. No hacemos scraping. La arquitectura está lista para activar cada conector en cuanto exista una fuente autorizada.
        </Text>
        <Divider />
        <SwitchRow label="Modo demostración" description="Muestra precios ficticios, siempre etiquetados, para probar el comparador." value={s.demoPrices} onChange={(v) => s.update({ demoPrices: v })} icon="flask-outline" />
        <Button title="Ubicación y tiendas favoritas" variant="secondary" icon="location-outline" onPress={() => router.push('/settings/stores')} />
      </Card>
    </Screen>
  );
}
