import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickImage } from '@/services/ocr';
import { haptic } from '@/services/haptics';
import { radius } from '@/theme/tokens';

import { Button, EmptyState, IconButton, ScalePressable, Screen, Text } from './ui';

/** Cámara de captura de foto con encuadre guía y opción de galería. */
export function CaptureCamera({
  title,
  hint,
  frame = 'wide',
  busy,
  onCapture,
}: {
  title: string;
  hint: string;
  frame?: 'wide' | 'tall' | 'square';
  busy?: boolean;
  onCapture: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);

  const shoot = async () => {
    if (!ref.current || busy) return;
    haptic.medium();
    const photo = await ref.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
    if (photo?.uri) onCapture(photo.uri);
  };
  const gallery = async () => {
    const uri = await pickImage();
    if (uri) onCapture(uri);
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <Screen back bottomInset="safe">
        <EmptyState
          icon="camera-outline"
          title="Necesitamos la cámara"
          text="La foto se procesa en tu móvil para leer el texto. No se envía a ningún servidor."
          actionLabel={permission.canAskAgain ? 'Permitir cámara' : undefined}
          onAction={permission.canAskAgain ? requestPermission : undefined}
          secondaryLabel="Elegir de la galería"
          onSecondary={gallery}
        />
      </Screen>
    );
  }
  const aspect = frame === 'tall' ? 0.6 : frame === 'square' ? 1 : 1.6;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={ref} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onCameraReady={() => setReady(true)} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ width: frame === 'tall' ? '70%' : '84%', aspectRatio: aspect, borderRadius: radius.lg, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' }} />
      </View>
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <IconButton icon="close" label="Cerrar" onPress={() => router.back()} />
        <Text variant="bodyStrong" style={{ color: '#fff' }}>
          {title}
        </Text>
        <IconButton icon={torch ? 'flash' : 'flash-outline'} label="Linterna" onPress={() => setTorch((t) => !t)} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 24, alignItems: 'center', gap: 18 }}>
        <Text variant="caption" style={{ color: '#fff', textAlign: 'center', paddingHorizontal: 32 }}>
          {busy ? 'Leyendo…' : hint}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 36 }}>
          <Button title="Galería" variant="secondary" size="sm" icon="images-outline" onPress={gallery} />
          <ScalePressable
            accessibilityRole="button"
            accessibilityLabel="Hacer foto"
            disabled={!ready || busy}
            onPress={shoot}
            scaleTo={0.9}
            style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' }} />}
          </ScalePressable>
          <View style={{ width: 90 }} />
        </View>
      </View>
    </View>
  );
}
