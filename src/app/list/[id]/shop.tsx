import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { ListItemRow } from '@/components/ListItemRow';
import { AnimatedNumber, Button, Card, EmptyState, IconButton, ProgressBar, Row, Screen, SectionTitle, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getList, getListItems } from '@/data/lists';
import { formatEuro } from '@/domain/text';
import { storeName } from '@/services/catalog/stores';
import { useTheme } from '@/theme/ThemeProvider';

/** Modo compra: pensado para usarse con una mano en el pasillo del súper. */
export default function ShoppingMode() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reduceMotion } = useTheme();
  const list = useLiveQuery(() => getList(id), ['shopping_lists'], [id]);
  const items = useLiveQuery(() => getListItems(id), ['list_items', 'products'], [id]);

  const all = items.data ?? [];
  const pending = all.filter((i) => !i.checked);
  const done = all.filter((i) => i.checked);
  const cartTotal = done.reduce((s, i) => s + (i.actual_price ?? i.estimated_price ?? 0) * i.quantity, 0);
  const estimateTotal = all.reduce((s, i) => s + (i.estimated_price ?? 0) * i.quantity, 0);
  const priced = all.filter((i) => i.estimated_price != null).length;
  const progress = all.length ? done.length / all.length : 0;

  const layout = reduceMotion ? undefined : LinearTransition.springify().damping(22).stiffness(180);

  return (
    <Screen
      back
      bottomInset="none"
      right={<IconButton icon="barcode-outline" label="Escanear para añadir" onPress={() => router.push(`/scan/barcode?listId=${id}`)} />}
      footer={
        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text variant="caption" color="textMuted">
                En el carro ({done.length})
              </Text>
              <AnimatedNumber value={cartTotal} format={formatEuro} variant="title" />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="caption" color="textMuted">
                Estimado total
              </Text>
              <Text variant="bodyStrong">{priced ? formatEuro(estimateTotal) : '—'}</Text>
            </View>
          </Row>
          <Button title={done.length ? `Finalizar compra (${done.length})` : 'Marca lo que metes en el carro'} size="lg" icon="flag" disabled={!done.length} onPress={() => router.push(`/list/${id}/finish`)} />
        </View>
      }>
      <View style={{ gap: 8 }}>
        <Text variant="title">{list.data?.name ?? 'Compra'}</Text>
        <Text variant="caption" color="textMuted">
          Modo compra{list.data?.store ? ` · ${storeName(list.data.store)}` : ''} · la pantalla no se apagará
        </Text>
        <ProgressBar value={progress} height={10} />
        <Text variant="caption" color="textMuted">
          {done.length} de {all.length} productos
          {priced < all.length && all.length > 0 ? ` · ${all.length - priced} sin precio estimado` : ''}
        </Text>
      </View>

      {all.length === 0 ? <EmptyState icon="cart-outline" title="La lista está vacía" text="Añade productos antes de empezar." actionLabel="Volver a la lista" onAction={() => router.back()} /> : null}

      {pending.length === 0 && all.length > 0 ? (
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.springify()}>
          <Card tone="primary" style={{ alignItems: 'center', gap: 8 }}>
            <Text variant="display">🎉</Text>
            <Text variant="heading">¡Todo en el carro!</Text>
            <Text variant="caption" color="textMuted" align="center">
              Pulsa «Finalizar compra» para pasarlo a tu inventario.
            </Text>
          </Card>
        </Animated.View>
      ) : null}

      {pending.map((it) => (
        <Animated.View key={it.id} layout={layout} exiting={reduceMotion ? undefined : FadeOutUp.duration(200)}>
          <ListItemRow item={it} mode="shop" />
        </Animated.View>
      ))}

      {done.length > 0 ? <SectionTitle title="En el carro" /> : null}
      {done.map((it) => (
        <Animated.View key={it.id} layout={layout} entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}>
          <ListItemRow item={it} mode="shop" />
        </Animated.View>
      ))}
    </Screen>
  );
}
