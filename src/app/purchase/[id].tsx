import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Celebration } from '@/components/Celebration';
import { AnimatedNumber, Button, Card, Divider, EmptyState, Row, Screen, SectionTitle, SkeletonList, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getPurchase } from '@/data/purchases';
import { formatDate } from '@/domain/dates';
import { formatEuro } from '@/domain/text';
import { storeName } from '@/services/catalog/stores';
import { useTheme } from '@/theme/ThemeProvider';

export default function PurchaseSummary() {
  const { id, celebrate, added, created, saved } = useLocalSearchParams<{ id: string; celebrate?: string; added?: string; created?: string; saved?: string }>();
  const { colors, reduceMotion } = useTheme();
  const data = useLiveQuery(() => getPurchase(id), ['purchases', 'purchase_items'], [id]);

  if (data.loading && !data.data) {
    return (
      <Screen back bottomInset="safe">
        <SkeletonList />
      </Screen>
    );
  }
  if (!data.data) {
    return (
      <Screen back bottomInset="safe">
        <EmptyState icon="receipt-outline" title="Compra no encontrada" actionLabel="Volver" onAction={() => router.back()} />
      </Screen>
    );
  }
  const { purchase, items } = data.data;
  const savedNum = saved ? Number(saved) : 0;

  return (
    <Screen back bottomInset="safe" footer={celebrate ? <Button title="Ver mi inventario" size="lg" icon="file-tray-stacked" onPress={() => router.replace('/inventory')} /> : undefined}>
      {celebrate ? (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
          <Celebration />
          <Animated.View entering={reduceMotion ? undefined : ZoomIn.springify().damping(12)} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={46} color={colors.onPrimary} />
          </Animated.View>
          <Text variant="title" align="center">
            ¡Compra guardada!
          </Text>
          <Text variant="body" color="textMuted" align="center">
            {added ?? 0} productos actualizados en tu inventario{created && Number(created) > 0 ? ` (${created} nuevos)` : ''}.
          </Text>
        </View>
      ) : (
        <Text variant="title">Compra</Text>
      )}

      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="body" color="textMuted">
            {storeName(purchase.store)} · {formatDate(purchase.purchased_at)}
          </Text>
          <Text variant="caption" color="textMuted">
            {purchase.source === 'receipt' ? 'Desde ticket' : purchase.source === 'list' ? 'Desde lista' : 'Manual'}
          </Text>
        </Row>
        <AnimatedNumber value={purchase.total} format={formatEuro} variant="display" />
        {savedNum > 0 ? (
          <Card tone="primary" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="trending-down" size={20} color={colors.primary} />
            <Text variant="caption" style={{ flex: 1 }}>
              Ahorro verificado: {formatEuro(savedNum)} frente a los precios reales que has registrado en otras tiendas en los últimos 30 días.
            </Text>
          </Card>
        ) : null}
      </Card>

      <SectionTitle title={`Artículos (${items.length})`} />
      <Card style={{ gap: 0 }}>
        {items.map((it, i) => (
          <View key={it.id}>
            {i > 0 ? <Divider /> : null}
            <Row style={{ paddingVertical: 10 }}>
              <Text variant="body" style={{ flex: 1 }} onPress={it.product_id ? () => router.push(`/product/${it.product_id}`) : undefined}>
                {it.quantity > 1 ? `${it.quantity} × ` : ''}
                {it.name}
              </Text>
              <Text variant="bodyStrong">{it.total_price != null ? formatEuro(it.total_price - it.discount) : '—'}</Text>
            </Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
