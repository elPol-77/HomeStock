import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DateField, ExpiryKindPicker, StorePicker } from '@/components/Pickers';
import { ProductThumb } from '@/components/ProductThumb';
import { Badge, Button, Card, Chip, Row, Screen, SectionTitle, Stepper, Text, TextField } from '@/components/ui';
import { transaction } from '@/db/client';
import { addPriceObservation } from '@/data/prices';
import { createProduct, getProduct, listLocations, matchExistingProduct, updateProduct } from '@/data/products';
import { addStockRaw } from '@/data/stock';
import { CATEGORIES, Location } from '@/data/types';
import { ExpiryKind } from '@/domain/expiry';
import { parseDecimal } from '@/domain/text';
import { parsePackageSize, Unit, UNIT_SHORT } from '@/domain/units';
import { useDrafts } from '@/services/drafts';
import { haptic } from '@/services/haptics';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';

const PKG_UNITS: Unit[] = ['ud', 'g', 'kg', 'ml', 'l'];

export default function ProductEdit() {
  const { id, draft: fromDraft } = useLocalSearchParams<{ id?: string; draft?: string }>();
  const draft = useDrafts((s) => s.product);
  const setDraft = useDrafts((s) => s.setProduct);
  const requestExpiry = useDrafts((s) => s.requestExpiry);
  const takeExpiry = useDrafts((s) => s.takeExpiry);
  const isNew = !id;
  const { colors } = useTheme();

  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [pkgAmount, setPkgAmount] = useState('');
  const [pkgUnit, setPkgUnit] = useState<Unit | null>(null);
  const [pkgCount, setPkgCount] = useState(1);
  const [packaging, setPackaging] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [minQty, setMinQty] = useState(1);
  const [usualQty, setUsualQty] = useState(0);
  const [notes, setNotes] = useState('');
  // Existencias iniciales (solo al crear)
  const [qty, setQty] = useState(1);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [expiryKind, setExpiryKind] = useState<ExpiryKind | null>('use_by');
  const [price, setPrice] = useState('');
  const [store, setStore] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    listLocations().then((l) => {
      setLocations(l);
      if (isNew && !locationId) setLocationId(l[0]?.id ?? null);
    });
    if (id) {
      getProduct(id).then((p) => {
        if (!p) return;
        setName(p.name);
        setBrand(p.brand ?? '');
        setBarcode(p.barcode ?? '');
        setImageUrl(p.image_url);
        setCategory(p.category);
        setPkgAmount(p.package_amount ? String(p.package_amount).replace('.', ',') : '');
        setPkgUnit(p.package_unit);
        setPkgCount(p.package_count ?? 1);
        setPackaging(p.packaging ?? '');
        setLocationId(p.default_location_id);
        setMinQty(p.min_quantity ?? 0);
        setUsualQty(p.usual_quantity ?? 0);
        setNotes(p.notes ?? '');
      });
    } else if (fromDraft && draft) {
      setName(draft.name);
      setBrand(draft.brand ?? '');
      setBarcode(draft.barcode ?? '');
      setImageUrl(draft.imageUrl);
      setCategory(draft.category);
      if (draft.pkg) {
        setPkgAmount(String(draft.pkg.amount).replace('.', ','));
        setPkgUnit(draft.pkg.unit);
        setPkgCount(draft.pkg.count);
      }
      setPackaging(draft.packaging ?? '');
      setNotice(draft.notice);
      setSourceUrl(draft.sourceUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Al crear, si ya existe un producto equivalente, avisar para no duplicar.
  useEffect(() => {
    if (!isNew || name.trim().length < 3) {
      setDuplicate(null);
      return;
    }
    const t = setTimeout(async () => {
      const pkg = pkgAmount && pkgUnit ? { count: pkgCount, amount: parseDecimal(pkgAmount), unit: pkgUnit } : parsePackageSize(name);
      const m = await matchExistingProduct({ name, brand, barcode: barcode || null, pkg });
      setDuplicate(m ? { id: m.id, name: m.name } : null);
    }, 400);
    return () => clearTimeout(t);
  }, [isNew, name, brand, barcode, pkgAmount, pkgUnit, pkgCount]);

  useFocusEffect(
    useCallback(() => {
      const r = takeExpiry('new-product');
      if (r) {
        setExpiry(r.date);
        if (r.kind) setExpiryKind(r.kind);
      }
    }, [takeExpiry]),
  );

  const save = async () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Ponle un nombre al producto.';
    const priceNum = price ? parseDecimal(price) : null;
    if (price && (priceNum == null || Number.isNaN(priceNum) || priceNum < 0 || priceNum > 999)) e.price = 'Precio no válido.';
    setErrors(e);
    if (Object.keys(e).length) {
      haptic.error();
      return;
    }
    setSaving(true);
    const amount = pkgAmount ? parseDecimal(pkgAmount) : null;
    const pkgOk = amount != null && !Number.isNaN(amount) && amount > 0 && pkgUnit;
    const input = {
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode.trim() || null,
      image_url: imageUrl,
      category,
      package_amount: pkgOk ? amount : null,
      package_unit: pkgOk ? pkgUnit : null,
      package_count: pkgOk ? pkgCount : null,
      packaging: packaging.trim() || null,
      default_location_id: locationId,
      min_quantity: minQty > 0 ? minQty : null,
      usual_quantity: usualQty > 0 ? usualQty : null,
      notes: notes.trim() || null,
    };
    try {
      if (id) {
        await updateProduct(id, input);
        toast('Producto actualizado');
        router.back();
      } else {
        const newId = await transaction(['products', 'batches', 'stock_movements', 'price_observations'], async () => {
          const pid = await createProduct({ ...input, source: draft?.origin === 'barcode' || draft?.origin === 'search' ? 'off' : draft?.origin === 'photo' ? 'photo' : 'manual' }, { emit: false });
          if (qty > 0) {
            await addStockRaw({
              productId: pid, quantity: qty, expiryDate: expiry, expiryKind: expiry ? expiryKind : null, locationId,
              pricePaid: priceNum, store, reason: priceNum != null ? 'purchase' : 'adjust',
            });
          }
          if (priceNum != null && priceNum > 0 && store) {
            await addPriceObservation(
              { productId: pid, barcode: input.barcode, productName: input.name, brand: input.brand, store, price: priceNum, pkg: pkgOk ? { count: pkgCount, amount: amount!, unit: pkgUnit! } : null, source: 'manual' },
              { emit: false },
            );
          }
          return pid;
        });
        setDraft(null);
        haptic.success();
        toast(`${input.name} añadido a tu casa`);
        router.replace(`/product/${newId}`);
      }
    } catch (err) {
      haptic.error();
      toast(err instanceof Error ? err.message : 'No se pudo guardar', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={isNew ? 'Nuevo producto' : 'Editar producto'}
      back
      bottomInset="none"
      footer={<Button title={isNew ? 'Guardar en mi casa' : 'Guardar cambios'} size="lg" icon="checkmark" loading={saving} onPress={save} />}>
      {notice ? (
        <Card tone="info" style={{ flexDirection: 'row', gap: 10 }}>
          <Ionicons name="information-circle" size={20} color={colors.info} />
          <Text variant="caption" style={{ flex: 1 }}>
            {notice}
          </Text>
        </Card>
      ) : null}

      <Row>
        <ProductThumb uri={imageUrl} category={category} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          {draft?.sourceLabel && isNew ? <Badge label={`Datos: ${draft.sourceLabel}`} tone="info" icon="globe-outline" /> : null}
          {sourceUrl ? <Button title="Ver ficha original" size="sm" variant="ghost" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(sourceUrl)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} /> : null}
          {imageUrl ? <Button title="Quitar foto" size="sm" variant="ghost" onPress={() => setImageUrl(null)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} /> : null}
        </View>
      </Row>

      <TextField label="Nombre *" placeholder="Leche semidesnatada" value={name} onChangeText={setName} error={errors.name} autoCapitalize="sentences" />
      {duplicate ? (
        <Card tone="warning" style={{ gap: 8 }}>
          <Text variant="caption">Ya tienes «{duplicate.name}». ¿Quieres añadir existencias a ese producto en lugar de crear otro?</Text>
          <Button title="Ir a ese producto" size="sm" variant="secondary" onPress={() => router.replace(`/product/${duplicate.id}`)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}
      <Row>
        <TextField label="Marca" placeholder="Hacendado" value={brand} onChangeText={setBrand} containerStyle={{ flex: 1 }} />
        <TextField label="Código de barras" placeholder="EAN" value={barcode} onChangeText={(t) => setBarcode(t.replace(/\D/g, ''))} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
      </Row>

      <SectionTitle title="Categoría" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map((c) => (
          <Chip key={c.name} label={c.name} icon={c.icon as never} selected={category === c.name} onPress={() => setCategory(category === c.name ? null : c.name)} />
        ))}
      </View>

      <SectionTitle title="Formato del envase" />
      <Row>
        <TextField label="Cantidad" placeholder="1" value={pkgAmount} onChangeText={setPkgAmount} keyboardType="decimal-pad" containerStyle={{ width: 100 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'flex-end', paddingTop: 20 }}>
          {PKG_UNITS.map((u) => (
            <Chip key={u} label={UNIT_SHORT[u]} selected={pkgUnit === u} onPress={() => setPkgUnit(u)} />
          ))}
        </ScrollView>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="body">Envases por pack</Text>
        <Stepper value={pkgCount} onChange={setPkgCount} min={1} size="sm" label="envases por pack" />
      </Row>
      <TextField label="Tipo de envase" placeholder="Brik, botella, bolsa…" value={packaging} onChangeText={setPackaging} />

      <SectionTitle title="Dónde se guarda" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {locations.map((l) => (
          <Chip key={l.id} label={l.name} icon={l.icon as never} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
        ))}
      </View>

      <SectionTitle title="Reposición" />
      <Card style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Cantidad mínima</Text>
            <Text variant="caption" color="textMuted">
              Al llegar aquí te propondremos comprar más
            </Text>
          </View>
          <Stepper value={minQty} onChange={setMinQty} size="sm" label="cantidad mínima" />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Cantidad habitual</Text>
            <Text variant="caption" color="textMuted">
              {usualQty === 0 ? 'La aprenderemos de tus compras' : 'Lo que sueles tener en casa'}
            </Text>
          </View>
          <Stepper value={usualQty} onChange={setUsualQty} size="sm" label="cantidad habitual" />
        </Row>
      </Card>

      {isNew ? (
        <>
          <SectionTitle title="¿Cuántos tienes ahora?" />
          <Card style={{ gap: 16 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">Unidades</Text>
              <Stepper value={qty} onChange={setQty} label="unidades" />
            </Row>
            <DateField label="Fecha de caducidad o consumo preferente" value={expiry} onChange={setExpiry} />
            <Button
              title="Leer la fecha con la cámara"
              variant="secondary"
              icon="scan-outline"
              onPress={() => {
                requestExpiry('new-product');
                router.push('/scan/expiry?target=new-product');
              }}
            />
            {expiry ? <ExpiryKindPicker value={expiryKind} onChange={setExpiryKind} /> : null}
            <TextField label="Precio pagado por unidad (opcional)" placeholder="0,89" value={price} onChangeText={setPrice} keyboardType="decimal-pad" error={errors.price} icon="pricetag-outline" />
            {price ? <StorePicker value={store} onChange={setStore} label="¿Dónde lo compraste?" /> : null}
          </Card>
        </>
      ) : null}

      <TextField label="Notas" placeholder="Opcional" value={notes} onChangeText={setNotes} multiline />
      <View style={{ height: 24 }} />
    </Screen>
  );
}

