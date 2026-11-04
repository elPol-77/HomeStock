import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductThumb } from '@/components/ProductThumb';
import { Button, EmptyState, IconButton, Screen, Text, TextField } from '@/components/ui';
import { addListItem } from '@/data/lists';
import { lastPaidPrice } from '@/data/prices';
import { findProductByBarcode, getProductWithStock } from '@/data/products';
import type { ProductWithStock } from '@/data/types';
import { isValidEan } from '@/domain/recognition';
import { bundledByBarcode, bundledToCatalogProduct } from '@/services/catalog/bundled';
import { lookupBarcode } from '@/services/catalog/openFoodFacts';
import { storeName } from '@/services/catalog/stores';
import { draftFromCatalog, useDrafts } from '@/services/drafts';
import { haptic } from '@/services/haptics';
import { incrementProduct } from '@/services/inventoryActions';
import { toast } from '@/services/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export default function BarcodeScanner() {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { listId } = useLocalSearchParams<{ listId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<ProductWithStock | null>(null);
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const setDraft = useDrafts((s) => s.setProduct);

  const handleCode = async (code: string) => {
    const now = Date.now();
    if (busy || existing) return;
    if (lastCode.current && lastCode.current.code === code && now - lastCode.current.at < 2500) return;
    lastCode.current = { code, at: now };
    setBusy(true);
    haptic.success();
    try {
      const local = await findProductByBarcode(code);
      if (listId) {
        // Escaneo desde una lista de la compra: añadir a la lista.
        let name = local?.name;
        let category = local?.category ?? null;
        if (!local) {
          const fromStore = bundledByBarcode(code);
          const remote = fromStore ? null : await lookupBarcode(code).catch(() => null);
          name = fromStore ? fromStore.name : remote ? [remote.name, remote.brand].filter(Boolean).join(' ') : `Producto ${code}`;
          category = fromStore?.category ?? remote?.category ?? null;
        }
        await addListItem(listId, { productId: local?.id ?? null, name: name!, category, estimatedPrice: local ? await lastPaidPrice(local.id) : null });
        toast(`${name} añadido a la lista`);
        setBusy(false);
        return;
      }
      if (local) {
        setExisting(await getProductWithStock(local.id));
        setBusy(false);
        return;
      }
      let offline = false;
      const remote = await lookupBarcode(code).catch(() => {
        offline = true;
        return null;
      });
      const fromStore = bundledByBarcode(code);
      if (!remote && !fromStore && offline) throw new Error('offline');
      if (remote) {
        // Open Food Facts da los datos del envase; si el súper lo tiene en su catálogo, su categoría es más fiable.
        setDraft(draftFromCatalog({ ...remote, category: fromStore?.category ?? remote.category }, 'barcode'));
      } else if (fromStore) {
        setDraft(draftFromCatalog(bundledToCatalogProduct(fromStore), 'barcode', `Encontrado en el catálogo de ${storeName(fromStore.store)}. Revisa los datos y añade la caducidad.`));
      } else {
        setDraft({
          name: '', brand: null, barcode: code, imageUrl: null, category: null, pkg: null, packaging: null, sourceLabel: null, sourceUrl: null, origin: 'barcode',
          notice: 'Este código no está en los catálogos abiertos. Complétalo una vez y lo recordaremos para la próxima.',
        });
      }
      router.replace('/product/edit?draft=1');
    } catch {
      haptic.error();
      setDraft({
        name: '', brand: null, barcode: code, imageUrl: null, category: null, pkg: null, packaging: null, sourceLabel: null, sourceUrl: null, origin: 'barcode',
        notice: 'Sin conexión con el catálogo. Puedes crear el producto ahora y completar los datos más tarde.',
      });
      router.replace('/product/edit?draft=1');
    }
  };

  const onScanned = (r: BarcodeScanningResult) => {
    const code = r.data?.trim();
    if (code && /^\d{6,14}$/.test(code)) handleCode(code);
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <Screen back bottomInset="safe">
        <EmptyState
          icon="camera-outline"
          title="Necesitamos la cámara"
          text="La usamos solo para leer códigos de barras. Las imágenes no salen de tu móvil."
          actionLabel={permission.canAskAgain ? 'Permitir cámara' : 'Introducir código a mano'}
          onAction={permission.canAskAgain ? requestPermission : () => setShowManual(true)}
        />
        {showManual || !permission.canAskAgain ? (
          <ManualEntry value={manual} onChange={setManual} onSubmit={() => isValidEan(manual) && handleCode(manual)} />
        ) : null}
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        onBarcodeScanned={busy || existing ? undefined : onScanned}
      />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <View style={{ width: '78%', aspectRatio: 1.7, borderRadius: radius.lg, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' }} />
        <Text variant="bodyStrong" style={{ color: '#fff', marginTop: 18 }}>
          {busy ? 'Buscando producto…' : listId ? 'Escanea para añadir a la lista' : 'Enfoca el código de barras'}
        </Text>
        {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 12 }} /> : null}
      </View>
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton icon="close" label="Cerrar escáner" onPress={() => router.back()} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="keypad-outline" label="Introducir código a mano" onPress={() => setShowManual((v) => !v)} />
          <IconButton icon={torch ? 'flash' : 'flash-outline'} label={torch ? 'Apagar linterna' : 'Encender linterna'} onPress={() => setTorch((t) => !t)} />
        </View>
      </View>

      {showManual ? (
        <View style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 64, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface }}>
          <ManualEntry value={manual} onChange={setManual} onSubmit={() => isValidEan(manual) && handleCode(manual)} />
        </View>
      ) : null}

      {existing ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.springify().damping(18)}
          exiting={reduceMotion ? undefined : FadeOut}
          style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12, padding: 18, gap: 14, borderRadius: radius.xl, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <ProductThumb uri={existing.image_url} category={existing.category} size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="primary">
                Ya está en tu inventario
              </Text>
              <Text variant="heading" numberOfLines={2}>
                {existing.name}
              </Text>
              <Text variant="caption" color="textMuted">
                Tienes {existing.quantity} ud
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="+1 y seguir"
              icon="add"
              style={{ flex: 1 }}
              onPress={async () => {
                await incrementProduct(existing.id, 1);
                toast(`${existing.name}: ahora tienes ${existing.quantity + 1}`);
                setExisting(null);
              }}
            />
            <Button title="Ver ficha" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace(`/product/${existing.id}`)} />
          </View>
          <Button title="Seguir escaneando" variant="ghost" onPress={() => setExisting(null)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function ManualEntry({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const invalid = value.length >= 8 && !isValidEan(value);
  return (
    <View style={{ gap: 10 }}>
      <TextField
        label="Código de barras"
        placeholder="8480000105424"
        keyboardType="number-pad"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
        maxLength={13}
        error={invalid ? 'El dígito de control no cuadra. Revisa el número.' : null}
        onSubmitEditing={onSubmit}
        icon="barcode-outline"
      />
      <Button title="Buscar" icon="search" onPress={onSubmit} disabled={!isValidEan(value)} />
    </View>
  );
}
