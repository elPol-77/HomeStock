import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';

import { Button, Card, Screen, SectionTitle, Text } from '@/components/ui';
import { all } from '@/db/client';
import { SYNC_TABLES } from '@/db/schema';
import { ensureHousehold, wipeLocalData } from '@/data/household';
import { discoverRemoteHouseholds, resetRealtime, syncNow } from '@/services/sync';
import { deleteAccount, useAuth } from '@/services/auth';
import { useSettings } from '@/services/settings';
import { toast } from '@/services/toast';

export default function Privacy() {
  const session = useAuth((a) => a.session);
  const update = useSettings((s) => s.update);
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    setBusy(true);
    try {
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: 'HomeStock' };
      for (const t of [...SYNC_TABLES, 'households'] as const) out[t] = await all(`SELECT * FROM ${t}`);
      const json = JSON.stringify(out, null, 2);
      if (Platform.OS === 'web') {
        toast('Exportación disponible en la app móvil', 'info');
        return;
      }
      const file = new File(Paths.cache, `homestock-datos-${new Date().toISOString().slice(0, 10)}.json`);
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exportar mis datos de HomeStock' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Privacidad y datos" back bottomInset="safe">
      <Card style={{ gap: 10 }}>
        <Text variant="bodyStrong">Cómo tratamos tus datos</Text>
        <Text variant="caption" color="textMuted">
          • Tu inventario, listas y compras se guardan en este móvil. Si creas una cuenta y compartes el hogar, se copian en la nube (Supabase, servidores en la UE si eliges esa región) y solo los ven los miembros de tu hogar.{'\n'}
          • Las fotos de productos, fechas y tickets se procesan en el propio móvil (OCR sin conexión). No se suben a ningún servidor.{'\n'}
          • Para buscar productos y precios se consultan Open Food Facts y Open Prices enviando solo el texto buscado o el código de barras, nunca datos personales.{'\n'}
          • La ubicación es opcional, se redondea y solo sirve para filtrar precios cercanos.{'\n'}
          • No hay publicidad ni venta de datos.
        </Text>
      </Card>

      <SectionTitle title="Tus derechos" />
      <Button title="Exportar todos mis datos (JSON)" icon="download-outline" variant="secondary" loading={busy} onPress={exportData} />
      <Button
        title="Borrar los datos de este móvil"
        icon="trash-outline"
        variant="danger"
        onPress={() =>
          Alert.alert('¿Borrar todo lo guardado en este móvil?', 'Se eliminarán inventario, listas, compras y ajustes de este dispositivo. Si tu hogar está en la nube, podrás volver a descargarlo iniciando sesión.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Borrar',
              style: 'destructive',
              onPress: async () => {
                await wipeLocalData();
                await ensureHousehold();
                await discoverRemoteHouseholds().catch(() => 0);
                resetRealtime();
                syncNow();
                await update({ onboarded: false });
                router.replace('/onboarding');
              },
            },
          ])
        }
      />
      {session ? (
        <Button
          title="Eliminar mi cuenta"
          icon="person-remove-outline"
          variant="danger"
          onPress={() =>
            Alert.alert('¿Eliminar tu cuenta para siempre?', 'Se borrará tu usuario y los hogares en los que eres el único miembro. Esta acción no se puede deshacer.', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar cuenta',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteAccount();
                    toast('Cuenta eliminada');
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Error', 'danger');
                  }
                },
              },
            ])
          }
        />
      ) : null}
      <Text variant="caption" color="textFaint">
        Responsable del tratamiento y contacto RGPD: completar antes de publicar la app (ver README → Publicación).
      </Text>
    </Screen>
  );
}
