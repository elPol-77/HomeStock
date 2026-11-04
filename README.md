# HomeStock

Inventario doméstico inteligente para Android: qué tienes en casa, qué caduca, qué falta, dónde comprarlo más barato y cuánto gastas. Hecho con Expo (React Native), funciona **sin conexión** y sincroniza entre los miembros del hogar cuando hay cuenta. Coste de funcionamiento: **0 €** (todo con planes gratuitos y servicios abiertos).

## Qué hace

- **Inventario** por lotes (cantidad, caducidad, ubicación, mínimo), botones + / −, consumo FEFO (primero lo que antes caduca), sin duplicados al volver a comprar.
- **Foto de la nevera o despensa** con IA (Google Gemini, plan gratuito con tu propia clave): reconoce muchos productos de una foto, tú confirmas cuáles guardar, cuántos y en qué zona. La clave se guarda cifrada en el móvil; la foto se envía a Google.
- **Pestaña Súper**: catálogo de los supermercados con foto (Open Food Facts), filtros por cadena y categoría, precio por kg/L y botón para añadir a la lista.
- **Añadir productos** de 5 formas: catálogo del súper (sin conexión), código de barras (Open Food Facts y bases hermanas), foto del envase (OCR en el móvil + catálogo, siempre indicando el grado de certeza), ticket de compra (OCR) o a mano.
- **Fecha de caducidad por OCR**: distingue «consumir antes de» (seguridad) de «consumir preferentemente» (calidad); pasado el consumo preferente **no** se marca como peligroso.
- **Notificaciones locales**: caducidad (agrupadas por día), stock bajo, agotado, recordatorio de compra y ahorro. Canales Android independientes.
- **Listas de la compra** con autocompletado desde tu casa y desde el catálogo del súper, sugerencias según tu consumo, modo compra (pantalla siempre encendida) y **Finalizar compra** que mete lo comprado en el inventario.
- **Varias casas**: la tuya, la de tus padres, un apartamento… Cada una con su inventario, zonas y listas; se cambia tocando el nombre de la casa en Inicio. Los avisos de caducidad cubren todas.
- **Foto de la nevera automática**: con sesión iniciada, la Edge Function `vision` analiza la foto con Gemini usando la clave del proyecto (secreto `GEMINI_API_KEY` en Supabase, nunca en la app). 20 fotos/día por persona (`VISION_DAILY_LIMIT`). Opcionalmente cada persona puede usar su propia clave.
- **Comparador de precios**: por producto (idéntico vs. alternativa, precio por kg/L) y de la compra completa con opciones **A** (una tienda), **B** (varias, con coste de desplazamiento) y **C** (tus favoritas). Cada precio muestra **fuente y fecha**; nunca se inventan precios. Se abre desde un producto (Súper o Inventario) o desde una lista con «Comparar precios»; ya no tiene pestaña propia.
- **Estadísticas**: gasto por semana/mes/categoría, productos más comprados, desperdicio y ahorro (el verificado separado del estimado).
- **Hogar compartido** con roles (propietario, admin, miembro), código de invitación y sincronización en tiempo real (Supabase).
- Diseño: verde salvia, blancos cálidos, modo claro/oscuro, animaciones con «reducir movimiento», vibración opcional, textos accesibles.

## Fuentes de datos (todas gratuitas)

| Fuente | Para qué | Notas |
|---|---|---|
| Catálogos del súper incluidos (`assets/catalog/`) | Buscar productos sin conexión, autocompletar listas, precio de referencia | Mercadona: 4.156 productos con foto (capturas del 04/11/2026). Consum: 8.721 productos (páginas públicas de categoría de su tienda online, leídas en el navegador el 04/11/2026; su robots.txt las permite). DIA: 94 básicos de su web pública (04/11/2026). Nombre, formato y precio, sin imágenes; siempre con su fecha. Alcampo bloquea la lectura automática en su robots.txt y Carrefour la rechaza: para esas cadenas, capturas. |
| Open Food Facts (+ Beauty / Products / Pet Food) | Código de barras y búsqueda | API abierta, con caché local 30 días. |
| Open Prices | Precios públicos por código de barras | Filtro por distancia y antigüedad. |
| Tus tickets y precios manuales | Precios reales de tu zona | La fuente más fiable. |
| Nominatim (OpenStreetMap) | Código postal → coordenadas | Una consulta al guardar el CP. |

Las cadenas (Mercadona, Consum, Lidl, Carrefour, Alcampo, DIA, Aldi, Eroski…) no publican una API abierta de precios; su «conector» aparece como no disponible y la arquitectura (`src/services/catalog/`) permite añadir uno en cuanto exista una fuente autorizada. El modo «Precios de demostración» existe solo para probar y sus precios llevan la etiqueta **DEMO**.

> Aviso: el catálogo incluido reproduce nombres, formatos y precios públicos con fines de comparación personal. Antes de publicar la app en Google Play conviene revisar con un abogado las condiciones de uso de cada web.

## Puesta en marcha

Requisitos: Node 20+, Java 17, Android SDK (o una cuenta gratuita de Expo para compilar en la nube).

```bash
npm install
cp .env.example .env      # rellena las variables (ver abajo)
npx expo start            # desarrollo con un "development build"
```

### Variables de entorno (`.env`)

| Variable | Obligatoria | Valor |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Para cuentas/sincronización | `https://<project-id>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Para cuentas/sincronización | Clave **anon / publishable** (es pública). **Nunca** pongas la `service_role`. |
| `EXPO_PUBLIC_OFF_CONTACT` | Recomendada | Un email o web de contacto para el User-Agent de Open Food Facts. |

Sin Supabase la app funciona completa en modo local (un solo móvil).

### Supabase (plan gratuito)

1. Crea el proyecto y copia URL y clave anon en `.env`.
2. SQL Editor → pega y ejecuta `supabase/migrations/0001_homestock.sql` (tablas, RLS, funciones de hogar e invitaciones). Es idempotente.
3. Authentication → URL Configuration → añade `homestock://auth/callback` y `homestock://auth/reset` a *Redirect URLs*.
4. (Opcional, avisos push entre miembros) despliega `supabase/functions/notify-household` y crea un Database Webhook sobre `list_items` (INSERT) con la cabecera `x-webhook-secret` = `HOMESTOCK_WEBHOOK_SECRET`.

Las políticas RLS están probadas con PGlite: `node supabase/tests/rls.test.mjs`.

## Compilar el APK

**En tu ordenador (gratis, sin cuenta):**

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

**En la nube con EAS (plan gratuito, cola compartida):** `npm i -g eas-cli && eas build -p android --profile preview`.

El OCR usa ML Kit en el propio móvil (módulo local `modules/homestock-ocr`), por eso no funciona en Expo Go: hace falta un *development build* o el APK.

## Pruebas

```bash
npm test             # lógica de dominio y catálogo (Jest)
npm run typecheck    # TypeScript estricto
npx expo lint
node supabase/tests/rls.test.mjs   # seguridad de la base de datos
```

## Actualizar el catálogo del súper

`scripts/catalog/` contiene el proceso: OCR de capturas de la web de la cadena (modelo latino de PaddleOCR en ONNX, conserva tildes) → detección de tarjetas de producto (nombre, formato, precio, precio tachado, €/ud, €/pack, €/kg) → JSON compacto con categoría de HomeStock. Cada catálogo lleva su fecha; el comparador descarta precios más antiguos que el límite fijado en Ajustes.

```bash
pip install rapidocr-onnxruntime
LATIN_REC=…/rec.onnx LATIN_DICT=…/dict.txt python3 scripts/catalog/ocr_latin.py capturas/ ocr.json
python3 scripts/catalog/parse_caps.py ocr.json parsed.json
python3 scripts/catalog/build_catalog.py assets/catalog/mercadona.json parsed.json
```

## Estructura

```
src/app/           pantallas (Expo Router)
src/components/    UI (tema, botones, tarjetas, gráficas…)
src/domain/        lógica pura y probada (unidades, caducidad, OCR, ticket, comparador, estadísticas)
src/data/          acceso a SQLite (inventario, listas, compras, precios)
src/db/            esquema, migraciones y consultas en vivo
src/services/      notificaciones, sincronización, auth, catálogos, OCR, precios
modules/homestock-ocr/  módulo nativo Android (ML Kit)
supabase/          SQL con RLS, Edge Function y test de seguridad
assets/catalog/    catálogos de supermercado incluidos
```

## Privacidad (RGPD)

Los datos viven en el móvil. Con cuenta, se guardan en tu proyecto de Supabase (UE si eliges esa región) protegidos por RLS: cada hogar solo ve lo suyo. Las fotos de tickets y fechas se procesan en el dispositivo y no se suben. Desde Perfil → Privacidad puedes exportar tus datos y borrar la cuenta (borra también los datos del servidor).

## Qué depende de servicios externos

- Sin internet: inventario, listas, catálogo incluido, OCR, notificaciones y estadísticas funcionan.
- Con internet: búsqueda/código de barras en Open Food Facts, Open Prices, geolocalización del CP, cuentas y sincronización.

---

Desarrollado por **Pablo Benlloch** · [pablobenlloch.es](https://pablobenlloch.es)
