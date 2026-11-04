import * as ImagePicker from 'expo-image-picker';

import { OcrLineBox, rowsFromBoxes } from '@/domain/receiptParser';

import { isOcrAvailable, recognizeText } from '../../modules/homestock-ocr';

export { isOcrAvailable };

export const OCR_UNAVAILABLE_MESSAGE =
  'El reconocimiento de texto funciona en la app instalada (APK de HomeStock). En Expo Go o en la web no está disponible: introduce los datos a mano.';

export interface OcrOutput {
  /** Líneas en orden de lectura. */
  lines: string[];
  /** Filas reconstruidas por posición (útil para tickets con columnas). */
  rows: string[];
  boxes: OcrLineBox[];
}

export async function ocrImage(uri: string): Promise<OcrOutput> {
  const r = await recognizeText(uri);
  const boxes: OcrLineBox[] = r.lines.map((l) => ({ text: l.text, top: l.top, left: l.left, height: l.height }));
  return { lines: r.lines.map((l) => l.text), rows: rowsFromBoxes(boxes), boxes };
}

/** Elegir una foto de la galería (alternativa a la cámara). */
export async function pickImage(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}
