import { requireOptionalNativeModule } from 'expo-modules-core';

export interface OcrLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  width: number;
  height: number;
}

interface NativeOcr {
  recognizeAsync(uri: string): Promise<OcrResult>;
}

/** null en Expo Go, web o iOS (el módulo nativo solo existe en la build Android de HomeStock). */
const native = requireOptionalNativeModule<NativeOcr>('HomestockOcr');

export const isOcrAvailable = native != null;

export async function recognizeText(uri: string): Promise<OcrResult> {
  if (!native) throw new Error('OCR_UNAVAILABLE');
  return native.recognizeAsync(uri);
}
