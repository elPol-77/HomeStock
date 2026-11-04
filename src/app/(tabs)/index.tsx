import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GettingStarted } from '@/components/GettingStarted';
import { HouseSwitcher } from '@/components/HouseSwitcher';
import { ProductThumb } from '@/components/ProductThumb';
import { AnimatedNumber, Badge, Button, Card, EmptyState, ProgressBar, Row, ScalePressable, Screen, SectionTitle, Skeleton, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { homeSummary } from '@/data/summary';
import { formatShortDate, relativeDays, todayISO } from '@/domain/dates';
import { expiryStatus } from '@/domain/expiry';
import { formatEuro } from '@/domain/text';
import { addProductToList } from '@/services/inventoryActions';
import { compareList } from '@/services/priceCompare';
import { useSettings } from '@/services/settings';
import { useSync } from '@/services/sync';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function greeting() {
  const h = new Date().getHours();
  if (h < 13) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function QuickAction({ icon, label, onPress, tone }: { icon: IconName; label: string; onPress: () => void; tone: 'primary' | 'accent' | 'info' | 'alt' }) {
  const { colors } = useTheme();
  const bg = { primary: colors.primary, accent: colors.accentSoft, info: colors.infoSoft, alt: colors.surfaceAlt }[tone];
  const fg = { primary: colors.onPrimary, accent: colors.accent, info: colors.info, alt: colors.text }[tone];
  return (
    <ScalePressable accessibilityRole="button" accessibilityLabel={label} hapticOnPress onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={26} color={fg} />
      </View>
      <Text variant="caption" align="center" numberOfLines={1}>
        {label}
      </Text>
    </ScalePressable>
  );
}

function StatTile({ label, value, icon, tone, onPress }: { label: string; value: number; icon: IconName; tone: 'primary' | 'warning' | 'danger' | 'info'; onPress: () => void }) {
  const { colors } = useTheme();
  const fg = { primary: colors.primary, warning: colors.warning, danger: colors.danger, info: colors.info }[tone];
  const bg = { primary: colors.primarySoft, warning: colors.warningSoft, danger: colors.dangerSoft, info: colors.infoSoft }[tone];
  return (
    <Card onPress={onPress} style={{ flex: 1, gap: 10 }} accessibilityLabel={`${label}: ${value}`}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <AnimatedNumber value={value} variant="title" />
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

export default function Home() {
  const { colors, reduceMotion } = useTheme();
  const userName = useSettings((s) => s.userName);
  const warnDays = useSettings((s) => s.warnDays);
  const restockOn = useSettings((s) => s.restockSuggestions);
  const syncStatus = useSync((s) => s.status);
  const { data, loading, reload } = useLiveQuery(() => homeSummary(warnDays), ['products', 'batches', 'stock_movements', 'list_items', 'shopping_lists', 'purchases', 'savings'], [warnDays]);
  const [potential, setPotential] = useState<number | null>(null);

  const listId = data?.activeList?.id;
  const pendingTotal = data?.pendingTotal ?? 0;
  useEffect(() => {
    let alive = true;
    if (!listId || pendingTotal === 0) {
      setPotential(null);
      return;
    }
    compareList(listId)
      .then((r) => {
        if (!alive) return;
        const best = r.comparison.singleStore[0];
        const worst = r.comparison.singleStore[r.comparison.singleStore.length - 1];
        const diff = r.comparison.estimatedSavings ?? (best && worst && best !== worst && r.comparison.commonItems ? r.comparison.commonItems.totals[r.comparison.commonItems.totals.length - 1].total - r.comparison.commonItems.totals[0].total : null);
        setPotential(diff && diff > 0 && !r.offers.every((o) => o.source === 'demo') ? diff : null);
      })
      .catch(() => alive && setPotential(null));
    return () => {
      alive = false;
    };
  }, [listId, pendingTotal]);

  const enter = (i: number) => (reduceMotion ? undefined : FadeInDown.delay(60 * i).springify().damping(20));
  const today = todayISO();

  return (
    <Screen refreshing={false} onRefresh={reload}>
      <Animated.View entering={enter(0)} style={{ paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textMuted">
            {greeting()}
            {userName ? `, ${userName}` : ''}
          </Text>
          <HouseSwitcher />
        </View>
        {syncStatus !== 'disabled' ? (
          <Badge
            label={syncStatus === 'syncing' ? 'Sincronizando' : syncStatus === 'idle' ? 'Sincronizado' : syncStatus === 'offline' ? 'Sin conexión' : 'Error de sync'}
            tone={syncStatus === 'idle' ? 'success' : syncStatus === 'syncing' ? 'info' : 'warning'}
            icon={syncStatus === 'idle' ? 'cloud-done-outline' : 'cloud-outline'}
          />
        ) : null}
      </Animated.View>

      <GettingStarted />

      <Animated.View entering={enter(1)}>
        <Card elevated style={{ flexDirection: 'row', paddingVertical: 18 }}>
          <QuickAction icon="barcode-outline" label="Escanear" tone="primary" onPress={() => router.push('/scan/barcode')} />
          <QuickAction icon="camera-outline" label="Foto" tone="accent" onPress={() => router.push('/scan/photo')} />
          <QuickAction icon="receipt-outline" label="Ticket" tone="info" onPress={() => router.push('/scan/receipt')} />
          <QuickAction icon="add" label="Añadir" tone="alt" onPress={() => router.push('/add')} />
        </Card>
      </Animated.View>

      {loading && !data ? (
        <View style={{ gap: 12 }}>
          <Row>
            <Skeleton height={110} rounded={20} style={{ flex: 1 }} />
            <Skeleton height={110} rounded={20} style={{ flex: 1 }} />
          </Row>
          <Skeleton height={140} rounded={20} />
        </View>
      ) : data ? (
        <>
          <Animated.View entering={enter(2)} style={{ gap: 12 }}>
            <Row>
              <StatTile label="Productos en casa" value={data.productCount} icon="cube-outline" tone="primary" onPress={() => router.push('/inventory')} />
              <StatTile label="Por caducar" value={data.expiringSoon.filter((b) => expiryStatus(b.expiry_date, b.expiry_kind, warnDays, today) !== 'ok').length} icon="alarm-outline" tone="warning" onPress={() => router.push({ pathname: '/inventory', params: { filter: 'expiring' } })} />
            </Row>
            <Row>
              <StatTile label="Agotados" value={data.missingCount} icon="alert-circle-outline" tone="danger" onPress={() => router.push({ pathname: '/inventory', params: { filter: 'out' } })} />
              <StatTile label="Quedan pocos" value={data.lowCount} icon="trending-down-outline" tone="info" onPress={() => router.push({ pathname: '/inventory', params: { filter: 'low' } })} />
            </Row>
          </Animated.View>

          {data.activeList ? (
            <Animated.View entering={enter(3)}>
              <Card onPress={() => router.push(`/list/${data.activeList!.id}`)} style={{ gap: 12 }} accessibilityLabel={`Lista ${data.activeList.name}`}>
                <Row>
                  <Text variant="title">{data.activeList.emoji ?? '🛒'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{data.activeList.name}</Text>
                    <Text variant="caption" color="textMuted">
                      {data.activeList.total === 0 ? 'Lista vacía' : `${data.activeList.total - data.activeList.checked} ${data.activeList.total - data.activeList.checked === 1 ? 'pendiente' : 'pendientes'} · ${data.activeList.checked} en el carro`}
                    </Text>
                  </View>
                  {data.activeList.total > 0 ? <Button title="Ir a comprar" size="sm" icon="cart" onPress={() => router.push(`/list/${data.activeList!.id}/shop`)} /> : null}
                </Row>
                {data.activeList.total > 0 ? <ProgressBar value={data.activeList.checked / data.activeList.total} /> : null}
              </Card>
            </Animated.View>
          ) : null}

          <Animated.View entering={enter(4)}>
            <Row>
              <Card style={{ flex: 1, gap: 4 }} tone="primary" onPress={() => router.push('/stats')}>
                <Text variant="caption" color="textMuted">
                  Gastado este mes
                </Text>
                <AnimatedNumber value={data.spentThisMonth} format={formatEuro} variant="heading" />
              </Card>
              <Card style={{ flex: 1, gap: 4 }} tone="accent" onPress={() => (potential != null && data.activeList ? router.push({ pathname: '/prices/basket', params: { listId: data.activeList.id } }) : router.push('/stats'))}>
                <Text variant="caption" color="textMuted">
                  {potential != null ? 'Ahorro potencial (estimado)' : 'Ahorro verificado este mes'}
                </Text>
                <AnimatedNumber value={potential ?? data.verifiedSavingsMonth} format={formatEuro} variant="heading" />
              </Card>
            </Row>
          </Animated.View>

          <SectionTitle title="Caducan pronto" action={data.expiringSoon.length ? 'Ver todo' : undefined} onAction={() => router.push({ pathname: '/inventory', params: { filter: 'expiring' } })} />
          {data.expiringSoon.length === 0 ? (
            <Card tone="alt" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text variant="body" color="textMuted" style={{ flex: 1 }}>
                Nada caduca en los próximos días.
              </Text>
            </Card>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
              {data.expiringSoon.slice(0, 12).map((b) => {
                const st = expiryStatus(b.expiry_date, b.expiry_kind, warnDays, today);
                const tone = st === 'expired' ? 'danger' : st === 'past_best_before' ? 'warning' : st === 'ok' ? 'neutral' : 'warning';
                return (
                  <Card key={b.id} onPress={() => router.push(`/product/${b.product_id}`)} style={{ width: 150, gap: 8 }} accessibilityLabel={`${b.product_name}, ${relativeDays(b.expiry_date, today)}`}>
                    <ProductThumb uri={b.image_url} size={44} />
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {b.product_name}
                    </Text>
                    <Badge
                      label={st === 'expired' ? 'Caducado' : st === 'past_best_before' ? 'Revisar' : `${b.expiry_kind === 'best_before' ? 'C. pref.' : 'Caduca'} ${relativeDays(b.expiry_date, today)}`}
                      tone={tone}
                    />
                    <Text variant="caption" color="textMuted">
                      {b.quantity} ud · {formatShortDate(b.expiry_date)}
                      {b.location_name ? ` · ${b.location_name}` : ''}
                    </Text>
                  </Card>
                );
              })}
            </ScrollView>
          )}

          {restockOn && data.suggestions.length > 0 ? (
            <>
              <SectionTitle title="Te falta reponer" />
              <Card style={{ gap: 4 }}>
                {data.suggestions.slice(0, 4).map((s) => (
                  <Row key={s.productId} style={{ paddingVertical: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.reason === 'out' ? colors.danger : colors.warning }} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {s.message}
                    </Text>
                    <Button title={`+${s.suggestedQuantity}`} size="sm" variant="secondary" onPress={() => addProductToList(s.productId, s.suggestedQuantity)} accessibilityHint={`Añadir ${s.suggestedQuantity} de ${s.name} a la lista`} />
                  </Row>
                ))}
              </Card>
            </>
          ) : null}

          {data.productCount === 0 && data.missingCount === 0 ? (
            <EmptyState
              icon="file-tray-outline"
              title="Tu inventario está vacío"
              text="Empieza escaneando lo que tienes en la nevera o el ticket de tu última compra."
              actionLabel="Escanear un producto"
              onAction={() => router.push('/scan/barcode')}
              secondaryLabel="Escanear un ticket"
              onSecondary={() => router.push('/scan/receipt')}
            />
          ) : null}
        </>
      ) : null}
      <View style={{ height: 8, borderRadius: radius.sm }} />
    </Screen>
  );
}
