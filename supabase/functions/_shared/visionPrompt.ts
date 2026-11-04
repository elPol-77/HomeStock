// Petición a Gemini para reconocer productos en una foto.
// Compartido entre la app (clave propia) y la Edge Function «vision» (clave del servidor),
// así el texto del prompt y el esquema de respuesta son siempre los mismos.
// Sin imports: tiene que funcionar igual en React Native y en Deno.

export function visionPrompt(categories: string[]): string {
  return `Eres el asistente de inventario de una casa en España. Analiza la foto (una nevera, despensa, armario o compra sobre la mesa) e identifica TODOS los productos que se vean, uno por línea de producto distinto.
Reglas:
- Nombre en español, concreto y como se diría en una lista de la compra ("Leche entera", "Bebida de almendras sin azúcar", "Tomates", "Jamón cocido en lonchas").
- Marca solo si se lee o es inequívoca por el envase (Hacendado, Consum, Coca-Cola, Navidul…); si no, null.
- count: cuántos envases o piezas iguales se ven (estimación honesta; 1 si no está claro).
- size: tamaño del envase si se lee (ej. "1 L", "125 g"); si no, null.
- category: una de estas exactamente: ${categories.join(', ')}.
- confidence: "alta" si lees la etiqueta o es inconfundible; "media" si lo deduces por forma/color; "baja" si es una suposición.
- evidence: en pocas palabras qué te hace identificarlo (texto leído, forma, color).
- No inventes productos que no se vean. No incluyas el propio electrodoméstico, estantes ni recipientes vacíos. Si un táper o bolsa no deja ver el contenido, inclúyelo como "Táper con comida" o similar con confidence "baja".`;
}

export function visionSchema(categories: string[]) {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            brand: { type: 'string', nullable: true },
            count: { type: 'integer' },
            size: { type: 'string', nullable: true },
            category: { type: 'string', enum: categories },
            confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
            evidence: { type: 'string', nullable: true },
          },
          required: ['name', 'count', 'category', 'confidence'],
        },
      },
    },
    required: ['items'],
  };
}

/** Cuerpo de `generateContent` para una foto JPEG en base64. */
export function visionRequestBody(imageBase64: string, categories: string[]) {
  return {
    contents: [{ role: 'user', parts: [{ text: visionPrompt(categories) }, { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: visionSchema(categories) },
  };
}

/** Modelos ligeros por orden de preferencia (Google los renueva; se prueba el siguiente si uno desaparece). */
export const VISION_MODELS = ['gemini-3.5-flash-lite', 'gemini-3-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

// ── Foto de UN producto (para añadirlo al inventario) ──────────────────────────
export function productPrompt(categories: string[]): string {
  return `Eres el asistente de inventario de una casa en España. La foto muestra UN producto de supermercado (puede verse de frente, de lado o en la mano).
Identifícalo:
- name: nombre en español, concreto y como en una lista de la compra, SIN la marca ("Leche semidesnatada", "Atún claro en aceite de oliva").
- brand: marca si se lee o es inequívoca (Hacendado, Consum, Dia, Coca-Cola, Calvo…); si no, null.
- size: tamaño del envase si se lee ("1 L", "3 x 80 g", "500 g"); si no, null.
- barcode: los dígitos del código de barras SOLO si se leen completos (8 o 13 cifras); si no, null.
- category: una de estas exactamente: ${categories.join(', ')}.
- confidence: "alta" si lees la etiqueta, "media" si lo deduces por forma/color, "baja" si es una suposición.
- evidence: en pocas palabras qué texto o rasgo lo identifica.
Si en la foto no hay ningún producto, devuelve name "" y confidence "baja".`;
}

export function productRequestBody(imageBase64: string, categories: string[]) {
  return {
    contents: [{ role: 'user', parts: [{ text: productPrompt(categories) }, { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: 'string', nullable: true },
          size: { type: 'string', nullable: true },
          barcode: { type: 'string', nullable: true },
          category: { type: 'string', enum: categories },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
          evidence: { type: 'string', nullable: true },
        },
        required: ['name', 'category', 'confidence'],
      },
    },
  };
}

// ── Foto de la fecha de caducidad ─────────────────────────────────────────────
export function expiryPrompt(today: string): string {
  return `Lee la fecha de caducidad o de consumo preferente impresa en el envase de la foto. Hoy es ${today}.
- date: la fecha en formato AAAA-MM-DD. Si solo aparece mes y año (p. ej. "08/2027"), usa el último día de ese mes. Si el año tiene 2 cifras, es 20xx. Ignora fechas de fabricación, lotes (L…) y horas.
- kind: "best_before" si pone "consumir preferentemente", "best before", "BB", "CPA" o similar; "use_by" si pone "fecha de caducidad", "caduca", "use by"; si no se sabe, "best_before" para secos/latas y "use_by" para frescos.
- text: el texto tal cual se lee alrededor de la fecha.
- confidence: "alta" si se lee claramente, "media" si hay dudas en algún dígito, "baja" si no se distingue.
Si no hay ninguna fecha legible, devuelve date null y confidence "baja".`;
}

export function expiryRequestBody(imageBase64: string, today: string) {
  return {
    contents: [{ role: 'user', parts: [{ text: expiryPrompt(today) }, { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', nullable: true },
          kind: { type: 'string', enum: ['use_by', 'best_before'] },
          text: { type: 'string', nullable: true },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['confidence'],
      },
    },
  };
}
