import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Card, Chip, EmptyState, ProgressBar, Row, Screen, SectionTitle, SkeletonList, Text, TextField } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { createList, LIST_KINDS, listShoppingLists } from '@/data/lists';
import { listPurchases } from '@/data/purchases';
import { getSuggestions } from '@/data/summary';
import type { ListKind } from '@/data/types';
import { formatShortDate } from '@/domain/dates';
import { formatEuro } from '@/domain/text';
import { storeName } from '@/services/catalog/stores';
import { addProductToList } from '@/services/inventoryActions';
import { useSettings } from '@/services/settings';
import { useTheme } from '@/theme/ThemeProvider';

export default function Shop() {
  const { colors, reduceMotion } = useTheme();
  const restockOn = useSettings((s) => s.restockSuggestions);
  const lists = useLiveQuery(() => listShoppingLists('active'), ['shopping_lists', 'list_items']);
  const archived = useLiveQuery(() => listShoppingLists('archived'), ['shopping_lists', 'list_items']);
  const purchases = useLiveQuery(() => listPurchases(5), ['purchases']);
  const suggestions = useLiveQuery(getSuggestions, ['products', 'batches', 'stock_movements', 'list_items']);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('weekly');

  const create = async () => {
    const label = name.trim() || LIST_KINDS.find((k) => k.kind === kind)!.label;
    const id = await createList(label, kind);
    setCreating(false);
    setName('');
    router.push(`/list/${id}`);
  };

  return (
    <Screen title="Listas" subtitle="Tus listas, sugerencias y compras" right={<Button title="Nueva lista" size="sm" icon="add" onPress={() => setCreating((c) => !c)} />}>
      {creating ? (
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}>
          <Card tone="primary" style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LIST_KINDS.map((k) => (
                <Chip key={k.kind} label={`${k.emoji} ${k.label}`} selected={kind === k.kind} onPress={() => setKind(k.kind)} />
              ))}
            </View>
            <TextField placeholder={LIST_KINDS.find((k) => k.kind === kind)!.label} value={name} onChangeText={setName} label="Nombre de la lista" onSubmitEditing={create} returnKeyType="done" />
            <Button title="Crear lista" icon="checkmark" onPress={create} />
          </Card>
        </Animated.View>
      ) : null}

      {lists.loading && !lists.data ? (
        <SkeletonList rows={3} />
      ) : (lists.data ?? []).length === 0 ? (
        <EmptyState icon="cart-outline" title="No tienes listas activas" text="Crea una lista y añade lo que necesitas. Al terminar la compra, los productos pasan solos a tu inventario." actionLabel="Crear lista" onAction={() => setCreating(true)} />
      ) : (
        (lists.data ?? []).map((l, i) => {
          const pending = l.total_items - l.checked_items;
          return (
            <Animated.View key={l.id} entering={reduceMotion ? undefined : FadeInDown.delay(i * 50).springify().damping(20)}>
              <Card onPress={() => router.push(`/list/${l.id}`)} style={{ gap: 12 }} accessibilityLabel={`${l.name}, ${pending} pendientes`}>
                <Row>
                  <Text variant="title">{l.emoji ?? '📝'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="heading">{l.name}</Text>
                    <Text variant="caption" color="textMuted">
                      {l.total_items === 0 ? 'Vacía' : `${pending} pendientes de ${l.total_items}`}
                      {l.estimated_total ? ` · ~${formatEuro(l.estimated_total)}` : ''}
                      {l.store ? ` · ${storeName(l.store)}` : ''}
                    </Text>
                  </View>
                  {pending > 0 ? <Button title="Comprar" size="sm" icon="cart" onPress={() => router.push(`/list/${l.id}/shop`)} /> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
                </Row>
                {l.total_items > 0 ? <ProgressBar value={l.checked_items / l.total_items} /> : null}
              </Card>
            </Animated.View>
          );
        })
      )}

      {restockOn && (suggestions.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Sugerencias de reposición" />
          <Card style={{ gap: 2 }}>
            {(suggestions.data ?? []).slice(0, 8).map((s) => (
              <Row key={s.productId} style={{ paddingVertical: 8 }}>
                <Ionicons name={s.reason === 'out' ? 'alert-circle' : 'trending-down'} size={18} color={s.reason === 'out' ? colors.danger : colors.warning} />
                <Text variant="body" style={{ flex: 1 }}>
                  {s.message}
                </Text>
                <Button title={`+${s.suggestedQuantity}`} size="sm" variant="secondary" onPress={() => addProductToList(s.productId, s.suggestedQuantity, lists.data?.[0]?.id)} />
              </Row>
            ))}
            <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
              Nunca añadimos nada sin tu confirmación. Puedes desactivar las sugerencias en Perfil.
            </Text>
          </Card>
        </>
      ) : null}

      {(purchases.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Últimas compras" action="Estadísticas" onAction={() => router.push('/stats')} />
          <Card style={{ gap: 0 }}>
            {(purchases.data ?? []).map((p) => (
              <Row key={p.id} style={{ paddingVertical: 10 }}>
                <Ionicons name={p.source === 'receipt' ? 'receipt-outline' : 'cart-outline'} size={18} color={colors.textMuted} />
                <Text variant="body" style={{ flex: 1 }} onPress={() => router.push(`/purchase/${p.id}`)}>
                  {storeName(p.store)} · {formatShortDate(p.purchased_at)} · {p.item_count} art.
                </Text>
                <Text variant="bodyStrong">{formatEuro(p.total)}</Text>
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      {(archived.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Listas archivadas" />
          {(archived.data ?? []).slice(0, 5).map((l) => (
            <Card key={l.id} tone="alt" onPress={() => router.push(`/list/${l.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text variant="bodyStrong">{l.emoji ?? '📝'}</Text>
              <Text variant="body" style={{ flex: 1 }}>
                {l.name}
              </Text>
              <Text variant="caption" color="textMuted">
                {formatShortDate(l.updated_at.slice(0, 10))}
              </Text>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
