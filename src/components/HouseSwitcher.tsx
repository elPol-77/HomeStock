import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, Divider, Text, TextField } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { createHousehold, listHouseholds } from '@/data/household';
import { haptic } from '@/services/haptics';
import { switchHousehold } from '@/services/householdRemote';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/**
 * Nombre de la casa activa (título de Inicio). Al tocarlo se abre un panel para cambiar de casa
 * (la tuya, la de tus padres…) o crear otra.
 */
export function HouseSwitcher() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const houses = useLiveQuery(listHouseholds, ['households', 'products']);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const list = houses.data ?? [];
  const current = list.find((h) => h.current);

  const close = () => {
    setOpen(false);
    setAdding(false);
    setName('');
  };

  return (
    <>
      <Pressable
        onPress={() => {
          haptic.tap();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Casa activa: ${current?.name ?? 'Mi casa'}. Toca para cambiar de casa`}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}>
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1 }}>
          {current?.name ?? 'Mi casa'}
        </Text>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={close} accessibilityLabel="Cerrar" />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            maxHeight: '80%',
            gap: 12,
          }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          <Text variant="heading">Tus casas</Text>
          <Text variant="caption" color="textMuted">
            Cada casa tiene su propio inventario, zonas y listas. Toca una para verla.
          </Text>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 0 }}>
            {list.map((h, i) => (
              <View key={h.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: h.current }}
                  onPress={async () => {
                    try {
                      if (!h.current) {
                        await switchHousehold(h.id);
                        haptic.success();
                        toast(`Ahora estás en «${h.name}»`);
                      }
                    } catch (e) {
                      toast(e instanceof Error ? e.message : 'No se pudo cambiar de casa', 'danger');
                    }
                    close();
                  }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: h.current ? colors.primary : colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Ionicons name={h.remote ? 'people' : 'home'} size={19} color={h.current ? colors.onPrimary : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {h.name}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {h.products} {h.products === 1 ? 'producto' : 'productos'}
                      {h.remote ? ' · compartida' : ''}
                    </Text>
                  </View>
                  {h.current ? <Badge label="Activa" tone="primary" icon="checkmark" /> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
                </Pressable>
              </View>
            ))}
          </ScrollView>

          {adding ? (
            <View style={{ gap: 10 }}>
              <TextField label="Nombre de la casa" placeholder="Ej.: Casa de papá, Apartamento playa" value={name} onChangeText={setName} autoFocus maxLength={40} />
              <Button
                title="Crear y abrir"
                icon="add"
                loading={busy}
                disabled={!name.trim()}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await switchHousehold(await createHousehold(name));
                    haptic.success();
                    toast(`Casa «${name.trim()}» creada`);
                    close();
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'No se pudo crear la casa', 'danger');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          ) : (
            <Button title="Añadir otra casa" icon="add" variant="secondary" onPress={() => setAdding(true)} />
          )}
          <Button
            title="Gestionar casas y familia"
            variant="ghost"
            size="sm"
            onPress={() => {
              close();
              router.push('/settings/household');
            }}
          />
        </View>
      </Modal>
    </>
  );
}
