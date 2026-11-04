import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, ProgressBar, Row, ScalePressable, Text } from '@/components/ui';
import { all, householdId } from '@/db/client';
import { useLiveQuery } from '@/db/events';
import { useSettings } from '@/services/settings';
import { useTheme } from '@/theme/ThemeProvider';

interface Progress {
  products: number;
  listItems: number;
  purchases: number;
  shared: boolean;
}

async function progress(): Promise<Progress> {
  const h = householdId();
  const [p] = await all<{ n: number }>("SELECT COUNT(DISTINCT product_id) AS n FROM batches WHERE deleted = 0 AND household_id = ?", [h]);
  const [l] = await all<{ n: number }>('SELECT COUNT(*) AS n FROM list_items WHERE deleted = 0 AND household_id = ?', [h]);
  const [c] = await all<{ n: number }>('SELECT COUNT(*) AS n FROM purchases WHERE deleted = 0 AND household_id = ?', [h]);
  const [s] = await all<{ remote: number }>('SELECT remote FROM households WHERE id = ?', [h]);
  return { products: p?.n ?? 0, listItems: l?.n ?? 0, purchases: c?.n ?? 0, shared: !!s?.remote };
}

/** Guía de primeros pasos en Inicio: 4 tareas con su botón. Desaparece al completarlas o al cerrarla. */
export function GettingStarted() {
  const { colors } = useTheme();
  const hidden = useSettings((s) => s.hideGettingStarted);
  const update = useSettings((s) => s.update);
  const q = useLiveQuery(progress, ['batches', 'list_items', 'purchases', 'households']);
  if (hidden || !q.data) return null;
  const steps = [
    { done: q.data.products >= 3, icon: 'scan-outline', title: 'Añade lo que tienes en casa', text: 'Escanea códigos, haz una foto de la nevera o búscalo en el súper.', go: () => router.push('/add') },
    { done: q.data.listItems > 0, icon: 'list-outline', title: 'Haz tu lista de la compra', text: 'Escribe lo que necesitas o añádelo desde la pestaña Súper.', go: () => router.push('/shop') },
    { done: q.data.purchases > 0, icon: 'cart-outline', title: 'Ve a comprar con la app', text: 'Marca lo que coges y al terminar se guarda solo en tu inventario.', go: () => router.push('/shop') },
    { done: q.data.shared, icon: 'people-outline', title: 'Comparte la casa con tu familia', text: 'Crea tu cuenta y envía el código de invitación.', go: () => router.push('/settings/household') },
  ] as const;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Primeros pasos</Text>
          <Text variant="caption" color="textMuted">
            {done} de {steps.length} hechos
          </Text>
        </View>
        <Ionicons name="close" size={20} color={colors.textFaint} onPress={() => update({ hideGettingStarted: true })} accessibilityLabel="Ocultar primeros pasos" />
      </Row>
      <ProgressBar value={done / steps.length} />
      {steps.map((s) => (
        <ScalePressable key={s.title} accessibilityRole="button" accessibilityLabel={`${s.title}${s.done ? ', hecho' : ''}`} onPress={s.go} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', opacity: s.done ? 0.55 : 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: s.done ? colors.successSoft : colors.primarySoft }}>
            <Ionicons name={(s.done ? 'checkmark' : s.icon) as never} size={18} color={s.done ? colors.success : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={s.done ? { textDecorationLine: 'line-through' } : undefined}>
              {s.title}
            </Text>
            {!s.done ? (
              <Text variant="caption" color="textMuted">
                {s.text}
              </Text>
            ) : null}
          </View>
          {!s.done ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
        </ScalePressable>
      ))}
    </Card>
  );
}
