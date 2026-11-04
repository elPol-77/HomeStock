import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { HBarList } from '@/components/charts';
import { Badge, Button, Card, Divider, ErrorState, Row, Screen, Segmented, SectionTitle, SkeletonList, Stepper, SwitchRow, Text } from '@/components/ui';
import { renameList, getList } from '@/data/lists';
import { PRICE_SOURCE_LABEL, StorePlan } from '@/domain/basket';
import { formatEuro } from '@/domain/text';
import { storeColor, storeName } from '@/services/catalog/stores';
import { BasketRun, compareList } from '@/services/priceCompare';
import { useSettings } from '@/services/settings';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';

type Option = 'A' | 'B' | 'C';

function PlanCard({ plan, title, subtitle, listId }: { plan: StorePlan; title: string; subtitle: string; listId: string }) {
  const { colors } = useTheme();
  const byStore = new Map<string, typeof plan.assignments>();
  for (const a of plan.assignments) byStore.set(a.store, [...(byStore.get(a.store) ?? []), a]);
  return (
    <Card elevated style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text variant="caption" color="textMuted">
          {title}
        </Text>
        <Text variant="display">{formatEuro(plan.total)}</Text>
        <Text variant="caption" color="textMuted">
          {subtitle}
        </Text>
      </View>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {plan.travelCost > 0 ? <Badge label={`Incluye ${formatEuro(plan.travelCost)} por desplazamiento`} tone="info" icon="car-outline" /> : null}
        {plan.usesAlternatives ? <Badge label="Incluye alternativas (no idénticos)" tone="warning" /> : null}
        {plan.usesDemoData ? <Badge label="Usa precios DEMO" tone="danger" icon="flask-outline" /> : null}
      </Row>
      {[...byStore.entries()].map(([store, as]) => (
        <View key={store} style={{ gap: 6 }}>
          <Row gap={8}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: storeColor(store) }} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {storeName(store)}
            </Text>
            <Text variant="bodyStrong">{formatEuro(as.reduce((s, a) => s + a.cost, 0))}</Text>
          </Row>
          {as.map((a) => (
            <Row key={a.itemId} style={{ paddingLeft: 18 }}>
              <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                {a.itemName}
                {a.offer.match === 'alternative' ? ` → ${a.offer.productName}` : ''}
              </Text>
              <Text variant="caption" color="textMuted">
                {formatEuro(a.cost)}
                {a.offer.isOffer ? ' · oferta' : ''}
              </Text>
            </Row>
          ))}
        </View>
      ))}
      {plan.missing.length > 0 ? (
        <>
          <Divider />
          <Row gap={8} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            <Text variant="caption" style={{ flex: 1 }}>
              Fuera de la comparación por falta de precios: {plan.missing.map((m) => m.name).join(', ')}.
            </Text>
          </Row>
        </>
      ) : null}
      {plan.stores.length === 1 ? (
        <Button
          title={`Comprar en ${storeName(plan.stores[0])}`}
          variant="secondary"
          icon="cart-outline"
          onPress={async () => {
            const l = await getList(listId);
            await renameList(listId, l?.name ?? 'Compra', plan.stores[0]);
            toast(`Tienda prevista: ${storeName(plan.stores[0])}`);
            router.push(`/list/${listId}/shop`);
          }}
        />
      ) : null}
    </Card>
  );
}

export default function BasketCompare() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const { colors, reduceMotion } = useTheme();
  const s = useSettings();
  const [run, setRun] = useState<BasketRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [option, setOption] = useState<Option>('A');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRun(await compareList(listId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comparar');
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    load();
  }, [load, s.extraStopCost, s.maxStores, s.allowAlternatives, s.favoriteStores, s.demoPrices, s.usePublicPrices]);

  const c = run?.comparison;
  const bestSingle = c?.singleStore[0];

  return (
    <Screen title="Comparar la compra" subtitle="Precios verificables de tus tickets, tu hogar y Open Prices" back bottomInset="safe">
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading && !run ? <SkeletonList rows={4} /> : null}
      {run && c ? (
        <>
          {run.sourcesUsed.has('demo') ? (
            <Card tone="warning" style={{ flexDirection: 'row', gap: 10 }}>
              <Ionicons name="flask" size={20} color={colors.warning} />
              <Text variant="caption" style={{ flex: 1 }}>
                Hay precios de DEMOSTRACIÓN mezclados. No son reales. Desactiva el modo demo en Precios para ver solo datos verificables.
              </Text>
            </Card>
          ) : null}
          {run.offers.length === 0 ? (
            <Card tone="alt" style={{ gap: 8 }}>
              <Text variant="bodyStrong">Aún no hay precios para comparar esta lista</Text>
              <Text variant="caption" color="textMuted">
                Los precios se acumulan cuando escaneas tickets o registras lo que pagas. Open Prices aporta precios de la comunidad cuando los productos tienen código de barras.
              </Text>
              <Button title="Escanear un ticket" icon="receipt-outline" onPress={() => router.push('/scan/receipt')} />
            </Card>
          ) : (
            <>
              <Segmented
                options={[
                  { value: 'A', label: 'A · Una tienda' },
                  { value: 'B', label: 'B · Varias' },
                  { value: 'C', label: 'C · Favoritas' },
                ]}
                value={option}
                onChange={setOption}
              />
              <Animated.View key={option} entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)} style={{ gap: 12 }}>
                {option === 'A' ? (
                  bestSingle ? (
                    <>
                      <PlanCard plan={bestSingle} listId={listId} title={`Mejor tienda única: ${storeName(bestSingle.stores[0])}`} subtitle={`${bestSingle.assignments.length} de ${run.items.length} productos con precio`} />
                      {c.commonItems && c.commonItems.totals.length > 1 ? (
                        <Card style={{ gap: 12 }}>
                          <Text variant="bodyStrong">Comparación justa ({c.commonItems.items.length} productos con precio en todas)</Text>
                          <HBarList
                            data={c.commonItems.totals.map((t) => ({ key: t.store, label: storeName(t.store), value: t.total }))}
                            format={formatEuro}
                            colorFor={(b) => storeColor(b.key)}
                          />
                          <Text variant="caption" color="textMuted">
                            Diferencia entre la más barata y la más cara: {formatEuro(c.commonItems.totals[c.commonItems.totals.length - 1].total - c.commonItems.totals[0].total)}
                          </Text>
                        </Card>
                      ) : null}
                      <SectionTitle title="Todas las tiendas" />
                      {c.singleStore.map((p) => (
                        <Card key={p.stores[0]} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: storeColor(p.stores[0]) }} />
                          <View style={{ flex: 1 }}>
                            <Text variant="bodyStrong">{storeName(p.stores[0])}</Text>
                            <Text variant="caption" color="textMuted">
                              {p.assignments.length}/{run.items.length} productos{p.usesDemoData ? ' · demo' : ''}
                            </Text>
                          </View>
                          <Text variant="heading">{formatEuro(p.total)}</Text>
                        </Card>
                      ))}
                    </>
                  ) : null
                ) : option === 'B' ? (
                  c.multiStore ? (
                    <>
                      <PlanCard plan={c.multiStore} listId={listId} title={`Mejor combinación (máx. ${s.maxStores} tiendas)`} subtitle={c.multiStore.stores.map(storeName).join(' + ')} />
                      {c.estimatedSavings != null && c.estimatedSavings > 0 ? (
                        <Card tone="primary" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                          <Ionicons name="trending-down" size={22} color={colors.primary} />
                          <Text variant="body" style={{ flex: 1 }}>
                            Ahorro estimado frente a comprar todo en {bestSingle ? storeName(bestSingle.stores[0]) : 'una tienda'}: <Text variant="bodyStrong">{formatEuro(c.estimatedSavings)}</Text> (ya descontado el desplazamiento).
                          </Text>
                        </Card>
                      ) : (
                        <Card tone="alt">
                          <Text variant="body" color="textMuted">
                            Con tu coste de desplazamiento ({formatEuro(s.extraStopCost)} por tienda extra) no compensa ir a varias tiendas.
                          </Text>
                        </Card>
                      )}
                    </>
                  ) : null
                ) : c.favorites ? (
                  <PlanCard plan={c.favorites} listId={listId} title="Con tus tiendas favoritas" subtitle={c.favorites.stores.map(storeName).join(' + ')} />
                ) : (
                  <Card tone="alt" style={{ gap: 10 }}>
                    <Text variant="body" color="textMuted">
                      No hay precios de tus tiendas favoritas ({s.favoriteStores.map(storeName).join(', ') || 'ninguna'}) para esta lista.
                    </Text>
                    <Button title="Elegir tiendas favoritas" variant="secondary" onPress={() => router.push('/settings/stores')} />
                  </Card>
                )}
              </Animated.View>
            </>
          )}

          {c.itemsWithoutPrices.length > 0 && run.offers.length > 0 ? (
            <Card tone="warning" style={{ gap: 4 }}>
              <Text variant="bodyStrong">Sin precios verificables</Text>
              <Text variant="caption">{c.itemsWithoutPrices.map((i) => i.name).join(', ')}</Text>
            </Card>
          ) : null}

          <SectionTitle title="Ajustes de la comparación" />
          <Card style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Coste por tienda extra</Text>
                <Text variant="caption" color="textMuted">
                  Tiempo y transporte de ir a otra tienda
                </Text>
              </View>
              <Stepper value={s.extraStopCost} step={0.5} onChange={(v) => s.update({ extraStopCost: v })} size="sm" format={(v) => formatEuro(v)} label="coste por tienda extra" />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                Máximo de tiendas
              </Text>
              <Stepper value={s.maxStores} min={1} onChange={(v) => s.update({ maxStores: Math.min(4, v) })} size="sm" label="máximo de tiendas" />
            </Row>
            <SwitchRow label="Permitir alternativas" description="Productos parecidos de otra marca o tamaño (se marcan como tales)." value={s.allowAlternatives} onChange={(v) => s.update({ allowAlternatives: v })} />
            <Text variant="caption" color="textFaint">
              Fuentes usadas: {[...run.sourcesUsed].map((x) => PRICE_SOURCE_LABEL[x]).join(', ') || '—'}
              {run.oldestDays != null ? ` · precio más antiguo: hace ${run.oldestDays} días` : ''}
              {run.publicError ? ` · Open Prices no disponible (${run.publicError})` : ''}
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
