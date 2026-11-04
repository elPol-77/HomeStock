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
