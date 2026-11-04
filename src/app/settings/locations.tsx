import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { Button, Card, Chip, IconButton, Row, Screen, Text, TextField } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { createLocation, deleteLocation, listLocations, locationCounts, updateLocation } from '@/data/products';
import { useTheme } from '@/theme/ThemeProvider';

const ICONS = ['thermometer-outline', 'snow-outline', 'file-tray-stacked-outline', 'sparkles-outline', 'water-outline', 'cube-outline', 'paw-outline', 'wine-outline', 'car-outline', 'basket-outline'];

export default function Locations() {
  const { colors } = useTheme();
  const locations = useLiveQuery(listLocations, ['locations']);
  const counts = useLiveQuery(locationCounts, ['batches']);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[5]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <Screen title="Ubicaciones" subtitle="Dónde guardas las cosas en casa" back bottomInset="safe">
      <Card tone="primary" style={{ gap: 12 }}>
        <TextField label="Nueva ubicación" placeholder="Trastero, mueble del salón…" value={name} onChangeText={setName} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {ICONS.map((i) => (
            <Chip key={i} label="" icon={i as never} selected={icon === i} onPress={() => setIcon(i)} />
          ))}
        </ScrollView>
        <Button
          title="Añadir ubicación"
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
              <Ionicons name={l.icon as never} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{l.name}</Text>
              <Text variant="caption" color="textMuted">
                {counts.data?.[l.id] ?? 0} {(counts.data?.[l.id] ?? 0) === 1 ? 'producto' : 'productos'}
              </Text>
            </View>
            <IconButton icon="create-outline" label={`Renombrar ${l.name}`} onPress={() => { setEditing(l.id); setEditName(l.name); }} />
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
            <Row>
              <TextField value={editName} onChangeText={setEditName} containerStyle={{ flex: 1 }} />
              <Button title="Guardar" size="sm" onPress={async () => { await updateLocation(l.id, editName || l.name, l.icon); setEditing(null); }} />
            </Row>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
