import { useEffect, useState } from 'react';
import { Linking, ScrollView } from 'react-native';

import { Button, Card, Chip, Divider, Row, Screen, SectionTitle, Stepper, SwitchRow, Text } from '@/components/ui';
import { getPermissionStatus, requestPermission, rescheduleAll, sendTestNotification } from '@/services/notifications';
import { useSettings, WEEKDAYS } from '@/services/settings';
import { toast } from '@/services/toast';

export default function NotificationSettings() {
  const s = useSettings();
  const [perm, setPerm] = useState<string>('undetermined');
  const [scheduled, setScheduled] = useState<number | null>(null);

  useEffect(() => {
    getPermissionStatus().then(setPerm);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => rescheduleAll().then(setScheduled).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [s.notifExpiry, s.notifShopping, s.warnDays, s.notifyHour, s.shoppingWeekday]);

  return (
    <Screen title="Notificaciones" back bottomInset="safe">
      {perm !== 'granted' ? (
        <Card tone="warning" style={{ gap: 10 }}>
          <Text variant="body">
            {perm === 'unsupported' ? 'Las notificaciones solo funcionan en la app instalada en el móvil.' : 'HomeStock no tiene permiso para enviarte avisos.'}
          </Text>
          {perm !== 'unsupported' ? (
            <Button
              title={perm === 'denied' ? 'Abrir ajustes del móvil' : 'Permitir notificaciones'}
              onPress={async () => {
                if (perm === 'denied') Linking.openSettings();
                else setPerm((await requestPermission()) ? 'granted' : 'denied');
              }}
            />
          ) : null}
        </Card>
      ) : (
        <Card tone="primary">
          <Text variant="caption">
            Avisos activos. Se programan en el propio móvil y llegan aunque la app esté cerrada{scheduled != null ? ` (${scheduled} programados ahora mismo)` : ''}.
          </Text>
        </Card>
      )}

      <SectionTitle title="Qué quieres recibir" />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <SwitchRow label="Caducidad próxima" description="«¡Ojo! Tienes 4 yogures que caducan mañana»" value={s.notifExpiry} onChange={(v) => s.update({ notifExpiry: v })} />
        <Divider />
        <SwitchRow label="Existencias bajas" description="«Solo queda una botella de aceite. ¿La añadimos a la lista?»" value={s.notifLowStock} onChange={(v) => s.update({ notifLowStock: v })} />
        <Divider />
        <SwitchRow label="Producto agotado" description="«Te has quedado sin detergente»" value={s.notifOutOfStock} onChange={(v) => s.update({ notifOutOfStock: v })} />
        <Divider />
        <SwitchRow label="Recordatorio de compra" description="«Tienes 8 productos pendientes en tu lista»" value={s.notifShopping} onChange={(v) => s.update({ notifShopping: v })} />
        <Divider />
        <SwitchRow label="Ahorro" description="Cuando una compra registrada te ahorra dinero frente a otros precios reales" value={s.notifSavings} onChange={(v) => s.update({ notifSavings: v })} />
      </Card>
      <Text variant="caption" color="textFaint">
        HomeStock no puede saber cuánto consumes por sí solo: las existencias cambian cuando tú o tu familia usáis los botones − y +, o al registrar compras.
      </Text>

      <SectionTitle title="Cuándo" />
      <Card style={{ gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Avisar con antelación
          </Text>
          <Stepper value={s.warnDays} min={1} onChange={(v) => s.update({ warnDays: Math.min(14, v) })} size="sm" format={(v) => `${v} d`} label="días de antelación" />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Hora de los avisos
          </Text>
          <Stepper value={s.notifyHour} min={6} onChange={(v) => s.update({ notifyHour: Math.min(22, v) })} size="sm" format={(v) => `${String(v).padStart(2, '0')}:00`} label="hora de los avisos" />
        </Row>
        <Text variant="bodyStrong">Día del recordatorio de compra</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {WEEKDAYS.map((d, i) => (
            <Chip key={d} label={d} selected={s.shoppingWeekday === i} onPress={() => s.update({ shoppingWeekday: i })} />
          ))}
        </ScrollView>
      </Card>
      <Button title="Enviar notificación de prueba" variant="secondary" icon="notifications-outline" onPress={async () => toast((await sendTestNotification()) ? 'Recibirás una notificación en 3 segundos' : 'Sin permiso para notificar', 'info')} />
    </Screen>
  );
}
