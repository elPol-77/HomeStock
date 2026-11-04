import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { HBarList } from '@/components/charts';
import { StorePicker } from '@/components/Pickers';
import { ProductThumb } from '@/components/ProductThumb';
import { Badge, Button, Card, Divider, ErrorState, Row, Screen, SectionTitle, SkeletonList, SwitchRow, Text, TextField } from '@/components/ui';
import { addListItem, defaultListId } from '@/data/lists';
import { addPriceObservation } from '@/data/prices';
import { getProduct, packageOf } from '@/data/products';
import { PRICE_SOURCE_LABEL } from '@/domain/basket';
import { formatShortDate } from '@/domain/dates';
import { formatEuro, parseDecimal } from '@/domain/text';
import { formatPackage, parsePackageSize, PackageSize } from '@/domain/units';
import { storeColor } from '@/services/catalog/stores';
import { haptic } from '@/services/haptics';
import { pricesForProduct, ProductPriceRow } from '@/services/priceCompare';
import { toast } from '@/services/toast';
import { useDrafts } from '@/services/drafts';
import { useTheme } from '@/theme/ThemeProvider';

interface Target {
  productId: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  pkg: PackageSize | null;
  image: string | null;
  category: string | null;
}

function PriceRow({ r, best }: { r: ProductPriceRow; best: boolean }) {
  const { colors } = useTheme();
  return (
    <Row style={{ paddingVertical: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: storeColor(r.store), marginTop: 6 }} />
      <View style={{ flex: 1, gap: 3 }}>
        <Row gap={6}>
          <Text variant="bodyStrong">{r.storeLabel}</Text>
          {best ? <Badge label="Más barato" tone="success" /> : null}
          {r.isOffer ? <Badge label="Oferta" tone="accent" /> : null}
          {r.source === 'demo' ? <Badge label="DEMO" tone="warning" /> : null}
        </Row>
        <Text variant="caption" color="textMuted">
          {PRICE_SOURCE_LABEL[r.source]} · {formatShortDate(r.date)}
          {r.location ? ` · ${r.location}` : ''}
        </Text>
        {r.match === 'alternative' ? (
          <Text variant="caption" color="textFaint" numberOfLines={2}>
            {r.productName} — {r.matchReason}
          </Text>
        ) : null}
        {r.sourceRef?.startsWith('http') ? (
          <Text variant="caption" color="primary" onPress={() => WebBrowser.openBrowserAsync(r.sourceRef!)}>
            Ver prueba del precio
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="heading" style={{ color: best ? colors.success : colors.text }}>
          {formatEuro(r.price)}
        </Text>
        {r.regularPrice ? (
          <Text variant="caption" color="textFaint" style={{ textDecorationLine: 'line-through' }}>
            {formatEuro(r.regularPrice)}
          </Text>
        ) : null}
        {r.unitPriceText ? (
          <Text variant="caption" color="textMuted">
            {r.unitPriceText}
          </Text>
        ) : null}
      </View>
    </Row>
  );
}

export default function ProductPrices() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ productId?: string; barcode?: string; name?: string; brand?: string; qty?: string; image?: string }>();
  const [target, setTarget] = useState<Target | null>(null);
  const [rows, setRows] = useState<ProductPriceRow[] | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [store, setStore] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [offer, setOffer] = useState(false);

  useEffect(() => {
    (async () => {
      if (params.productId) {
        const p = await getProduct(params.productId);
        if (p) setTarget({ productId: p.id, barcode: p.barcode, name: p.name, brand: p.brand, pkg: packageOf(p) ?? parsePackageSize(p.name), image: p.image_url, category: p.category });
      } else if (params.name) {
        setTarget({ productId: null, barcode: params.barcode || null, name: params.name, brand: params.brand || null, pkg: parsePackageSize(params.qty || params.name), image: params.image || null, category: null });
      }
    })();
  }, [params.productId, params.barcode, params.name, params.brand, params.qty, params.image]);

  const load = useCallback(async () => {
    if (!target) return;
    setError(null);
    try {
      const r = await pricesForProduct(target);
      setRows(r.rows);
      setPublicError(r.publicError);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar precios');
    }
  }, [target]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const n = parseDecimal(price);
    if (!store || Number.isNaN(n) || n <= 0 || !target) {
      haptic.error();
      return;
    }
    await addPriceObservation({ productId: target.productId, barcode: target.barcode, productName: target.name, brand: target.brand, store, price: n, isOffer: offer, pkg: target.pkg, source: 'manual' });
    haptic.success();
    toast('Precio registrado');
    setAdding(false);
    setPrice('');
    load();
  };

  const identical = (rows ?? []).filter((r) => r.match === 'identical');
  const alternatives = (rows ?? []).filter((r) => r.match === 'alternative');
  const bestReal = identical.filter((r) => r.source !== 'demo').reduce<ProductPriceRow | null>((b, r) => (!b || r.price < b.price ? r : b), null);
  const bestAny = identical.reduce<ProductPriceRow | null>((b, r) => (!b || r.price < b.price ? r : b), null);
  const altSorted = [...alternatives].sort((a, b) => (a.unitPriceValue ?? Infinity) - (b.unitPriceValue ?? Infinity));

  return (
    <Screen back bottomInset="safe">
      {target ? (
        <Row>
          <ProductThumb uri={target.image} category={target.category} size={64} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={2}>
              {target.name}
            </Text>
            <Text variant="caption" color="textMuted">
              {[target.brand, formatPackage(target.pkg), target.barcode].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Row>
      ) : null}

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!rows && !error ? <SkeletonList rows={4} /> : null}

      {rows ? (
        <>
          {identical.length >= 2 ? (
            <Card>
              <HBarList
                data={[...identical].sort((a, b) => a.price - b.price).map((r) => ({ key: `${r.store}-${r.source}-${r.date}`, label: `${r.storeLabel}${r.source === 'demo' ? ' (demo)' : ''}`, value: r.price }))}
                format={formatEuro}
                colorFor={(b) => storeColor(identical.find((r) => `${r.store}-${r.source}-${r.date}` === b.key)?.store)}
              />
            </Card>
          ) : null}
          <SectionTitle title="Mismo producto" action="Registrar precio" onAction={() => setAdding((a) => !a)} />
          {adding ? (
            <Card tone="primary" style={{ gap: 12 }}>
              <StorePicker value={store} onChange={setStore} label="Tienda" />
              <TextField label="Precio" placeholder="1,25" value={price} onChangeText={setPrice} keyboardType="decimal-pad" icon="pricetag-outline" />
              <SwitchRow label="Es precio de oferta" value={offer} onChange={setOffer} />
              <Button title="Guardar precio" icon="checkmark" onPress={save} disabled={!store || !price} />
              <Text variant="caption" color="textFaint">
                Solo para tu hogar. Registra precios que hayas visto tú mismo.
              </Text>
            </Card>
          ) : null}
          <Card style={{ gap: 0 }}>
            {identical.length === 0 ? (
              <View style={{ gap: 6 }}>
                <Text variant="body">Todavía no hay precios verificables de este producto.</Text>
                <Text variant="caption" color="textMuted">
                  Escanea tus tickets o registra el precio cuando lo veas: así podrás comparar la próxima vez.
                </Text>
              </View>
            ) : (
              identical.map((r, i) => (
                <View key={`${r.store}-${r.source}-${r.date}-${i}`}>
                  {i > 0 ? <Divider /> : null}
                  <PriceRow r={r} best={r === (bestReal ?? bestAny) && identical.length > 1} />
                </View>
              ))
            )}
          </Card>
          {publicError ? (
            <Text variant="caption" color="warning">
              Open Prices no respondió ({publicError}). Se muestran solo los precios de tu hogar.
            </Text>
          ) : null}

          {altSorted.length > 0 ? (
            <>
              <SectionTitle title="Alternativas comparables" />
              <Text variant="caption" color="textMuted">
                Productos parecidos pero no idénticos (otra marca o tamaño). Compáralos por precio por kg, litro o unidad.
              </Text>
              <Card style={{ gap: 0 }}>
                {altSorted.map((r, i) => (
                  <View key={`${r.store}-${r.productName}-${i}`}>
                    {i > 0 ? <Divider /> : null}
                    <PriceRow r={r} best={false} />
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {target ? (
            <Row>
              <Button
                title="A la lista"
                icon="cart-outline"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={async () => {
                  const listId = await defaultListId();
                  await addListItem(listId, { productId: target.productId, name: target.name, estimatedPrice: bestReal?.price ?? null });
                  toast('Añadido a la lista');
                }}
              />
              {!target.productId ? (
                <Button
                  title="Añadir a casa"
                  icon="add"
                  style={{ flex: 1 }}
                  onPress={() => {
                    useDrafts.getState().setProduct({
                      name: target.name, brand: target.brand, barcode: target.barcode, imageUrl: target.image, category: target.category, pkg: target.pkg,
                      packaging: null, sourceLabel: 'Open Food Facts', sourceUrl: target.barcode ? `https://world.openfoodfacts.org/product/${target.barcode}` : null,
                      notice: 'Datos de Open Food Facts: revisa que coinciden con tu producto.', origin: 'search',
                    });
                    router.push('/product/edit?draft=1');
                  }}
                />
              ) : null}
            </Row>
          ) : null}
          <Row gap={6}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.textFaint} />
            <Text variant="caption" color="textFaint" style={{ flex: 1 }}>
              Nunca mostramos precios inventados como reales. Cada precio indica su fuente y su fecha.
            </Text>
          </Row>
        </>
      ) : null}
    </Screen>
  );
}
