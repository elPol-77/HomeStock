import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import { BarChart, DonutChart, HBarList } from '@/components/charts';
import { AnimatedNumber, Card, Divider, EmptyState, Row, Screen, Segmented, SectionTitle, SkeletonList, Text } from '@/components/ui';
import { all, householdId } from '@/db/client';
import { useLiveQuery } from '@/db/events';
import { purchasesSince } from '@/data/purchases';
import { addDays, formatShortDate, startOfMonth, todayISO } from '@/domain/dates';
import { frequentRunOuts, MovementRecord, savingsSummary, spendingByCategory, spendingByMonth, spendingByWeek, topProducts, totalSpent, wasteSummary } from '@/domain/stats';
import { formatEuro } from '@/domain/text';
import { useTheme } from '@/theme/ThemeProvider';

async function loadStats() {
  const since = addDays(todayISO(), -200);
  const purchases = await purchasesSince(since);
  const movements = await all<{ created_at: string; product_id: string; name: string; reason: MovementRecord['reason']; delta: number; unit_price: number | null; batch_qty_after: number }>(
    `SELECT m.created_at, m.product_id, p.name, m.reason, m.delta, m.unit_price, 0 AS batch_qty_after
     FROM stock_movements m JOIN products p ON p.id = m.product_id
     WHERE m.deleted = 0 AND m.household_id = ? AND m.created_at >= ? ORDER BY m.created_at`,
    [householdId(), since],
  );
  const savings = await all<{ date: string; amount: number; verified: number }>('SELECT date, amount, verified FROM savings WHERE deleted = 0 AND household_id = ?', [householdId()]);
  // Agotamientos: cuando la suma acumulada del producto llega a 0 tras un consumo.
  const level = new Map<string, number>();
  const runOuts: { productId: string; productName: string }[] = [];
  const allMovs = await all<{ product_id: string; name: string; delta: number; reason: string }>(
    `SELECT m.product_id, p.name, m.delta, m.reason FROM stock_movements m JOIN products p ON p.id = m.product_id WHERE m.deleted = 0 AND m.household_id = ? ORDER BY m.created_at`,
    [householdId()],
  );
  for (const m of allMovs) {
    const prev = level.get(m.product_id) ?? 0;
    const next = Math.max(0, prev + m.delta);
    level.set(m.product_id, next);
    if (prev > 0 && next <= 0 && m.reason === 'consume') runOuts.push({ productId: m.product_id, productName: m.name });
  }
  const movementRecords: MovementRecord[] = movements.map((m) => ({
    date: m.created_at.slice(0, 10),
    productId: m.product_id,
    productName: m.name,
    reason: m.reason,
    quantity: Math.abs(m.delta),
    value: m.unit_price != null ? Math.round(Math.abs(m.delta) * m.unit_price * 100) / 100 : null,
  }));
  return { purchases, movementRecords, savings: savings.map((s) => ({ date: s.date, amount: s.amount, verified: !!s.verified })), runOuts };
}

export default function Stats() {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const { data, loading } = useLiveQuery(loadStats, ['purchases', 'purchase_items', 'stock_movements', 'savings']);
  const today = todayISO();
  const monthStart = startOfMonth(today);
  const since30 = addDays(today, -30);

  if (loading && !data) {
    return (
      <Screen title="Estadísticas" back bottomInset="safe">
        <SkeletonList rows={5} />
      </Screen>
    );
  }
  if (!data) return null;
  const hasData = data.purchases.length > 0 || data.movementRecords.length > 0;
  const savings = savingsSummary(data.savings, monthStart);
  const waste = wasteSummary(data.movementRecords, since30);

  return (
    <Screen title="Estadísticas" subtitle="Tu gasto, tu consumo y tu ahorro real" back bottomInset="safe">
      {!hasData ? (
        <EmptyState icon="stats-chart-outline" title="Aún no hay datos" text="Las estadísticas aparecen al registrar compras (finalizando una lista o escaneando un ticket) y al consumir productos." />
      ) : (
        <>
          <Row>
            <Card style={{ flex: 1, gap: 4 }} tone="primary">
              <Text variant="caption" color="textMuted">
                Gasto este mes
              </Text>
              <AnimatedNumber value={totalSpent(data.purchases, monthStart)} format={formatEuro} variant="heading" />
            </Card>
            <Card style={{ flex: 1, gap: 4 }} tone="accent">
              <Text variant="caption" color="textMuted">
                Ahorro verificado (mes)
              </Text>
              <AnimatedNumber value={savings.verified} format={formatEuro} variant="heading" />
            </Card>
          </Row>
          <Text variant="caption" color="textFaint">
            El ahorro verificado compara lo que has pagado con precios reales registrados en otras tiendas. Los ahorros estimados del comparador no se suman aquí.
          </Text>

          <SectionTitle title="Evolución del gasto" />
          <Card style={{ gap: 14 }}>
            <Segmented
              options={[
                { value: 'week', label: 'Semanas' },
                { value: 'month', label: 'Meses' },
              ]}
              value={period}
              onChange={setPeriod}
            />
            <BarChart data={period === 'week' ? spendingByWeek(data.purchases, 8, today) : spendingByMonth(data.purchases, 6, today)} format={(n) => `${Math.round(n)} €`} />
          </Card>

          {spendingByCategory(data.purchases, addDays(today, -90)).length > 0 ? (
            <>
              <SectionTitle title="Gasto por categoría (90 días)" />
              <Card>
                <DonutChart data={spendingByCategory(data.purchases, addDays(today, -90))} format={formatEuro} />
              </Card>
            </>
          ) : null}

          {topProducts(data.purchases).length > 0 ? (
            <>
              <SectionTitle title="Lo que más compras" />
              <Card>
                <HBarList data={topProducts(data.purchases, 6)} format={(n) => `${n} ${n === 1 ? 'vez' : 'veces'}`} />
              </Card>
            </>
          ) : null}

          {data.runOuts.length > 0 ? (
            <>
              <SectionTitle title="Lo que más se agota" />
              <Card>
                <HBarList data={frequentRunOuts(data.runOuts)} format={(n) => `${n} ${n === 1 ? 'vez' : 'veces'}`} colorFor={() => colors.warning} />
              </Card>
            </>
          ) : null}

          <SectionTitle title="Desperdicio (30 días)" />
          <Card style={{ gap: 10 }}>
            {waste.count === 0 ? (
              <Row>
                <Ionicons name="leaf" size={20} color={colors.success} />
                <Text variant="body" style={{ flex: 1 }}>
                  No has registrado productos tirados o caducados. ¡Bien!
                </Text>
              </Row>
            ) : (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="body">{waste.count} registros · {waste.units} ud</Text>
                  <Text variant="bodyStrong">
                    {formatEuro(waste.estimatedValue)}
                    {waste.valueIsPartial ? '*' : ''}
                  </Text>
                </Row>
                <Divider />
                {waste.items.slice(-6).reverse().map((w, i) => (
                  <Row key={`${w.productId}-${i}`}>
                    <Ionicons name={w.reason === 'expired' ? 'alarm-outline' : 'trash-outline'} size={16} color={colors.textMuted} />
                    <Text variant="caption" style={{ flex: 1 }}>
                      {w.productName} · {w.quantity} ud
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {formatShortDate(w.date)}
                    </Text>
                  </Row>
                ))}
                {waste.valueIsPartial ? (
                  <Text variant="caption" color="textFaint">
                    * Valor aproximado: algunos lotes no tenían precio registrado.
                  </Text>
                ) : null}
              </>
            )}
          </Card>
          <View style={{ height: 10 }} />
        </>
      )}
    </Screen>
  );
}
