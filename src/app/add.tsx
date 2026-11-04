import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ComponentProps, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CatalogResultRow } from '@/components/CatalogResultRow';
import { Card, Screen, SectionTitle, Text, TextField } from '@/components/ui';
import { formatShortDate } from '@/domain/dates';
import { bundledToCatalogProduct, searchBundled } from '@/services/catalog/bundled';
import { searchCatalog } from '@/services/catalog/openFoodFacts';
import { storeName } from '@/services/catalog/stores';
import { CatalogProduct } from '@/services/catalog/types';
import { draftFromCatalog, useDrafts } from '@/services/drafts';
import { useTheme } from '@/theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

const OPTIONS: { icon: IconName; title: string; text: string; href: string; tone: 'primary' | 'accent' | 'info' | 'alt' }[] = [
  { icon: 'barcode-outline', title: 'Escanear código de barras', text: 'La forma más rápida y fiable', href: '/scan/barcode', tone: 'primary' },
  { icon: 'sparkles-outline', title: 'Foto de la nevera o despensa', text: 'Reconoce muchos productos de una vez con IA', href: '/scan/fridge', tone: 'primary' },
  { icon: 'camera-outline', title: 'Hacer una foto a un producto', text: 'Reconoce el producto por su envase', href: '/scan/photo', tone: 'accent' },
  { icon: 'receipt-outline', title: 'Escanear un ticket', text: 'Añade toda la compra de golpe', href: '/scan/receipt', tone: 'info' },
  { icon: 'create-outline', title: 'Crear a mano', text: 'Para productos sin código (fruta, a granel…)', href: '/product/edit', tone: 'alt' },
];

export default function AddSheet() {
  const { colors, reduceMotion } = useTheme();
  const setDraft = useDrafts((s) => s.setProduct);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = useMemo(() => (query.trim().length >= 2 ? searchBundled(query, 15).map(bundledToCatalogProduct) : []), [query]);

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchCatalog(query));
    } catch {
      setError('No se pudo buscar en el catálogo. Revisa tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  const pick = (p: CatalogProduct) => {
    const notice =
      p.source === 'store' && p.storePrice
        ? `Datos del catálogo de ${storeName(p.storePrice.store)} (${formatShortDate(p.storePrice.date)}). Revisa el formato y añade la fecha de caducidad.`
        : 'Datos de Open Food Facts: revisa que coinciden con tu producto.';
    setDraft(draftFromCatalog(p, 'search', notice));
    router.replace('/product/edit?draft=1');
  };

  return (
    <Screen title="Añadir producto" back bottomInset="safe">
      <View style={{ gap: 10 }}>
        {OPTIONS.map((o, i) => {
          const bg = { primary: colors.primary, accent: colors.accentSoft, info: colors.infoSoft, alt: colors.surfaceAlt }[o.tone];
          const fg = { primary: colors.onPrimary, accent: colors.accent, info: colors.info, alt: colors.text }[o.tone];
          return (
            <Animated.View key={o.href} entering={reduceMotion ? undefined : FadeInDown.delay(i * 60).springify().damping(18)}>
              <Card
                onPress={() => {
                  if (o.href === '/product/edit') setDraft(null);
                  router.replace(o.href as never);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
                accessibilityLabel={o.title}>
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={o.icon} size={24} color={fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{o.title}</Text>
                  <Text variant="caption" color="textMuted">
                    {o.text}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Card>
            </Animated.View>
          );
        })}
      </View>

      <SectionTitle title="Buscar en el catálogo" />
      <TextField
        icon="search"
        placeholder="Ej.: leche semidesnatada Hacendado"
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setResults(null);
        }}
        onSubmitEditing={search}
        returnKeyType="search"
        hint="Resultados al instante del catálogo del súper. Pulsa buscar para consultar también Open Food Facts."
        right={loading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="arrow-forward-circle" size={26} color={colors.primary} onPress={search} accessibilityLabel="Buscar" />}
      />
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      {local.length > 0 ? <SectionTitle title="Catálogo del supermercado" /> : null}
      {local.map((p) => (
        <CatalogResultRow key={p.bundledId} p={p} onPress={() => pick(p)} />
      ))}
      {results && results.length > 0 ? <SectionTitle title="Open Food Facts" /> : null}
      {results && results.length === 0 && local.length === 0 ? (
        <Card tone="alt">
          <Text variant="body" color="textMuted">
            No encontramos «{query}». Puedes crearlo a mano y quedará guardado para la próxima vez.
          </Text>
        </Card>
      ) : null}
      {results?.map((p) => (
        <CatalogResultRow key={`${p.barcode}-${p.name}`} p={p} onPress={() => pick(p)} />
      ))}
    </Screen>
  );
}
