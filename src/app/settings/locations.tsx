import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { AppIcon, Button, Card, Chip, IconButton, Row, Screen, Text, TextField } from '@/components/ui';
import { ZONE_ICONS } from '@/data/types';
import { useLiveQuery } from '@/db/events';
import { createLocation, deleteLocation, listLocations, locationCounts, updateLocation } from '@/data/products';
import { useTheme } from '@/theme/ThemeProvider';

const ICONS = ZONE_ICONS;

export default function Locations() {
  const { colors } = useTheme();
  const locations = useLiveQuery(listLocations, ['locations']);
  const counts = useLiveQuery(locationCounts, ['batches']);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[2]);
  const params = useLocalSearchParams<{ edit?: string }>();
  const [editing, setEditing] = useState<string | null>(params.edit ?? null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState<string | null>(null);
  // Al llegar desde Inventario (pulsación larga en una zona), abrir directamente su edición.
  useEffect(() => {
    const l = params.edit ? locations.data?.find((x) => x.id === params.edit) : undefined;
    if (l && editIcon === null) {
      setEditName(l.name);
      setEditIcon(l.icon);
    }
  }, [params.edit, locations.data, editIcon]);
  const startEdit = (l: { id: string; name: string; icon: string }) => {
    setEditing(l.id);
    setEditName(l.name);
    setEditIcon(l.icon);
  };

  return (
    <Screen title="Zonas de casa" subtitle="Dónde guardas las cosas: nevera, despensa, trastero… Puedes crearlas, renombrarlas, cambiar su icono o borrarlas." back bottomInset="safe">
      <Card tone="primary" style={{ gap: 12 }}>
        <TextField label="Nueva zona" placeholder="Trastero, mueble del salón…" value={name} onChangeText={setName} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {ICONS.map((i) => (
            <Chip key={i} label="" icon={i as never} selected={icon === i} onPress={() => setIcon(i)} />
          ))}
        </ScrollView>
        <Button
          title="Añadir zona"
          icon="add"
          disabled={!name.trim()}
          onPress={async () => {
            await createLocation(name, icon);
            setName('');
          }}
        />
      </Card>
      {(locations.data ?? []).map((l) => (
        <Card key={l.id} style={{ gap: 10 }}>
          <Row>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon name={l.icon} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{l.name}</Text>
              <Text variant="caption" color="textMuted">
                {counts.data?.[l.id] ?? 0} {(counts.data?.[l.id] ?? 0) === 1 ? 'producto' : 'productos'}
              </Text>
            </View>
            <IconButton icon="create-outline" label={`Renombrar ${l.name}`} onPress={() => startEdit(l)} />
            <IconButton
              icon="trash-outline"
              tone="danger"
              label={`Eliminar ${l.name}`}
              onPress={() =>
                Alert.alert(`¿Eliminar «${l.name}»?`, 'Los productos guardados aquí quedarán sin ubicación.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Eliminar', style: 'destructive', onPress: () => deleteLocation(l.id) },
                ])
              }
            />
          </Row>
          {editing === l.id ? (
            <View style={{ gap: 10 }}>
              <TextField label="Nombre" value={editName} onChangeText={setEditName} autoFocus />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {ICONS.map((i) => (
                  <Chip key={i} label="" icon={i as never} selected={(editIcon ?? l.icon) === i} onPress={() => setEditIcon(i)} />
                ))}
              </ScrollView>
              <Row>
                <Button title="Cancelar" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setEditing(null)} />
                <Button
                  title="Guardar"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    await updateLocation(l.id, editName.trim() || l.name, editIcon ?? l.icon);
                    setEditing(null);
                    setEditIcon(null);
                    setEditName('');
                  }}
                />
              </Row>
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
