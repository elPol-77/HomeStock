import * as Location from 'expo-location';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, Chip, Divider, Row, Screen, SectionTitle, Stepper, SwitchRow, Text, TextField } from '@/components/ui';
import { formatDate } from '@/domain/dates';
import { bundledCatalogInfo } from '@/services/catalog/bundled';
import { STORE_CHAINS, storeName } from '@/services/catalog/stores';
import { OFF_USER_AGENT } from '@/services/catalog/openFoodFacts';
import { useSettings } from '@/services/settings';
import { toast } from '@/services/toast';

/** Geocodifica un código postal español con Nominatim (OpenStreetMap). Una sola petición, bajo demanda. */
async function geocodePostalCode(cp: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(cp)}&country=es&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': OFF_USER_AGENT, 'Accept-Language': 'es' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!json[0]) return null;
  return { lat: Number(json[0].lat), lon: Number(json[0].lon), label: `CP ${cp}` };
}

export default function StoresSettings() {
  const s = useSettings();
  const [cp, setCp] = useState(s.postalCode);
  const [busy, setBusy] = useState(false);

  const useGps = async () => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast('Sin permiso de ubicación. Usa el código postal.', 'warning');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // Se redondea a ~1 km: no necesitamos tu ubicación exacta.
      await s.update({ geo: { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100, label: 'tu zona' } });
      toast('Ubicación guardada (aproximada)');
    } catch {
      toast('No se pudo obtener la ubicación', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const usePostal = async () => {
    if (!/^\d{5}$/.test(cp)) {
      toast('El código postal debe tener 5 dígitos', 'warning');
      return;
    }
    setBusy(true);
    try {
      const g = await geocodePostalCode(cp);
      if (!g) {
        toast('No encontramos ese código postal', 'warning');
        return;
      }
      await s.update({ postalCode: cp, geo: g });
      toast(`Ubicación: ${g.label}`);
    } catch {
      toast('Sin conexión para buscar el código postal', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Tiendas y precios" back bottomInset="safe">
      <SectionTitle title="Tu zona" />
      <Card style={{ gap: 12 }}>
        {s.geo ? <Badge label={`Usando ${s.geo.label}`} tone="success" icon="location" /> : <Badge label="Sin ubicación: se usan precios de toda España" tone="neutral" />}
        <Row>
          <TextField placeholder="Código postal" value={cp} onChangeText={(t) => setCp(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" containerStyle={{ flex: 1 }} icon="mail-outline" />
          <Button title="Usar" onPress={usePostal} loading={busy} />
        </Row>
        <Button title="Usar mi ubicación aproximada" variant="secondary" icon="navigate-outline" onPress={useGps} disabled={busy} />
        {s.geo ? <Button title="Quitar ubicación" variant="ghost" onPress={() => s.update({ geo: null, postalCode: '' })} /> : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Distancia máxima
          </Text>
          <Stepper value={s.maxDistanceKm} min={1} step={5} onChange={(v) => s.update({ maxDistanceKm: Math.min(100, v) })} size="sm" format={(v) => `${v} km`} label="distancia máxima" />
        </Row>
        <Text variant="caption" color="textFaint">
          La ubicación solo filtra los precios de Open Prices por cercanía. Se guarda en tu móvil, redondeada.
        </Text>
      </Card>

      <SectionTitle title="Tiendas favoritas" />
      <Text variant="caption" color="textMuted">
        Se usan en la opción C del comparador y como tienda por defecto al finalizar la compra.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {STORE_CHAINS.map((c) => {
          const sel = s.favoriteStores.includes(c.id);
          return (
            <Chip
              key={c.id}
              label={c.name}
              selected={sel}
              icon={sel ? 'star' : 'star-outline'}
              onPress={() => s.update({ favoriteStores: sel ? s.favoriteStores.filter((x) => x !== c.id) : [...s.favoriteStores, c.id] })}
            />
          );
        })}
      </View>

      <SectionTitle title="Catálogos incluidos" />
      <Card style={{ gap: 6 }}>
        {bundledCatalogInfo().map((c) => (
          <View key={c.store} style={{ gap: 2 }}>
            <Text variant="bodyStrong">
              {storeName(c.store)} · {c.count.toLocaleString('es-ES')} productos
            </Text>
            <Text variant="caption" color="textMuted">
              Precios del {formatDate(c.capturedAt)}
              {c.ageDays > s.priceMaxAgeDays ? ' · más antiguos que tu límite: no se usan al comparar' : ''}
            </Text>
          </View>
        ))}
        <Text variant="caption" color="textFaint">
          Sirven para buscar productos sin conexión y como precio de referencia. Siempre se muestran con su fecha; tus tickets y precios manuales tienen prioridad por ser más recientes.
        </Text>
      </Card>

      <SectionTitle title="Antigüedad de los precios" />
      <Card style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Ignorar precios de hace más de
          </Text>
          <Stepper value={s.priceMaxAgeDays} min={15} step={15} onChange={(v) => s.update({ priceMaxAgeDays: Math.min(365, v) })} size="sm" format={(v) => `${v} d`} label="antigüedad máxima" />
        </Row>
        <Text variant="caption" color="textFaint">
          Los precios cambian: mejor comparar con datos recientes.
        </Text>
      </Card>

      <SectionTitle title="Fuentes de precios" />
      <Card style={{ gap: 6, paddingVertical: 8 }}>
        <SwitchRow
          icon="people-outline"
          label="Usar Open Prices"
          description="Precios reales aportados por la comunidad (con ticket o foto). Cobertura todavía limitada en España."
          value={s.usePublicPrices}
          onChange={(v) => s.update({ usePublicPrices: v })}
        />
        <Divider />
        <SwitchRow icon="flask-outline" label="Modo demostración" description="Muestra precios ficticios, siempre etiquetados como «demo», para probar el comparador." value={s.demoPrices} onChange={(v) => s.update({ demoPrices: v })} />
      </Card>
    </Screen>
  );
}
