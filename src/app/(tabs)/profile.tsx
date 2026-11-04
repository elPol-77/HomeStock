import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';

import { Badge, Button, Card, Divider, ListRow, Row, Screen, SectionTitle, Segmented, SwitchRow, Text } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getHousehold } from '@/data/household';
import { signOut, useAuth } from '@/services/auth';
import { isCloudConfigured } from '@/services/supabase';
import { useSettings } from '@/services/settings';
import { syncNow, useSync } from '@/services/sync';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

export default function Profile() {
  const { colors } = useTheme();
  const s = useSettings();
  const session = useAuth((a) => a.session);
  const sync = useSync();
  const household = useLiveQuery(getHousehold, ['households']);
  const initial = (s.userName || session?.user.email || 'H').charAt(0).toUpperCase();

  return (
    <Screen title="Perfil">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="title" style={{ color: colors.onPrimary }}>
            {initial}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading">{s.userName || 'Sin nombre'}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {session ? session.user.email : 'Usando HomeStock sin cuenta (datos solo en este móvil)'}
          </Text>
          <Row gap={6}>
            <Badge label={household.data?.name ?? 'Mi casa'} tone="primary" icon="home-outline" />
            {household.data?.remote ? <Badge label={household.data.role === 'admin' ? 'Administrador' : 'Miembro'} tone="info" /> : null}
          </Row>
        </View>
      </Card>

      <SectionTitle title="Cuenta y sincronización" />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {!isCloudConfigured ? (
          <ListRow icon="cloud-offline-outline" title="Nube no configurada" subtitle="Las cuentas y la sincronización se activan al configurar Supabase (ver README)." />
        ) : session ? (
          <>
            <ListRow
              icon="sync-outline"
              title="Sincronizar ahora"
              subtitle={
                sync.status === 'disabled'
                  ? 'Comparte tu hogar para empezar a sincronizar'
                  : sync.status === 'syncing'
                    ? 'Sincronizando…'
                    : sync.error
                      ? `Último error: ${sync.error}`
                      : sync.lastSync
                        ? `Última sincronización: ${new Date(sync.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Pendiente'
              }
              onPress={() => syncNow()}
            />
            <Divider />
            <ListRow icon="key-outline" title="Cambiar contraseña" onPress={() => router.push('/auth/reset')} />
            <Divider />
            <ListRow icon="log-out-outline" title="Cerrar sesión" tone="danger" onPress={async () => { await signOut(); toast('Sesión cerrada'); }} chevron={false} />
          </>
        ) : (
          <>
            <ListRow icon="log-in-outline" title="Iniciar sesión" subtitle="Sincroniza tus datos entre dispositivos" onPress={() => router.push('/auth/login')} />
            <Divider />
            <ListRow icon="person-add-outline" title="Crear cuenta" subtitle="Gratis, con email y contraseña" onPress={() => router.push('/auth/register')} />
          </>
        )}
      </Card>

      <SectionTitle title="Mi hogar" />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow icon="people-outline" title="Hogar y familia" subtitle="Nombre, miembros e invitaciones" onPress={() => router.push('/settings/household')} />
        <Divider />
        <ListRow icon="file-tray-stacked-outline" title="Zonas de casa" subtitle="Nevera, despensa, baño… (editables)" onPress={() => router.push('/settings/locations')} />
        <Divider />
        <ListRow icon="storefront-outline" title="Tiendas y precios" subtitle="Ubicación, favoritas y fuentes de precios" onPress={() => router.push('/settings/stores')} />
        <Divider />
        <ListRow icon="sparkles-outline" title="IA para fotos" subtitle="Foto de la nevera: automática y gratis" onPress={() => router.push('/settings/vision')} />
        <Divider />
        <ListRow icon="stats-chart-outline" title="Estadísticas" subtitle="Gasto, consumo y ahorro" onPress={() => router.push('/stats')} />
      </Card>

      <SectionTitle title="Avisos" />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow icon="notifications-outline" title="Notificaciones" subtitle={`Caducidad con ${s.warnDays} días de antelación · ${String(s.notifyHour).padStart(2, '0')}:00`} onPress={() => router.push('/settings/notifications')} />
        <Divider />
        <SwitchRow icon="bulb-outline" label="Sugerencias de reposición" description="Te proponemos qué comprar; nunca se añade nada sin tu confirmación." value={s.restockSuggestions} onChange={(v) => s.update({ restockSuggestions: v })} />
      </Card>

      <SectionTitle title="Apariencia y accesibilidad" />
      <Card style={{ gap: 12 }}>
        <Text variant="caption" color="textMuted">
          Tema
        </Text>
        <Segmented
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
          value={s.themeMode}
          onChange={(v) => s.update({ themeMode: v })}
        />
        <Text variant="caption" color="textMuted">
          Reducir movimiento
        </Text>
        <Segmented
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'on', label: 'Sí' },
            { value: 'off', label: 'No' },
          ]}
          value={s.reduceMotion}
          onChange={(v) => s.update({ reduceMotion: v })}
        />
        <SwitchRow label="Vibración al tocar" value={s.haptics} onChange={(v) => s.update({ haptics: v })} icon="phone-portrait-outline" />
      </Card>

      <SectionTitle title="Privacidad" />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow icon="shield-checkmark-outline" title="Privacidad y datos" subtitle="Exportar, borrar y cómo tratamos tus datos" onPress={() => router.push('/settings/privacy')} />
      </Card>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Desarrollado por Pablo Benlloch. Abrir pablobenlloch.es"
        onPress={() => Linking.openURL('https://pablobenlloch.es')}
        hitSlop={8}
        style={({ pressed }) => ({ alignItems: 'center', gap: 2, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
        <Text variant="caption" color="textMuted" align="center">
          Desarrollado por <Text variant="caption" style={{ color: colors.primary, fontFamily: fonts.bold }}>Pablo Benlloch</Text>
        </Text>
        <Text variant="caption" color="primary" align="center">
          pablobenlloch.es
        </Text>
      </Pressable>
      <Text variant="caption" color="textFaint" align="center">
        HomeStock {Constants.expoConfig?.version ?? ''} · Datos de productos: Open Food Facts (ODbL) · Precios comunitarios: Open Prices (ODbL)
      </Text>
      <Button title="Volver a ver la bienvenida" variant="ghost" size="sm" onPress={() => s.update({ onboarded: false })} />
    </Screen>
  );
}
