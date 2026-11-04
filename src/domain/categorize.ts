import { normalizeText } from './text';

/**
 * Clasifica un producto en una categoría de HomeStock a partir de su nombre (y, si hay, de las
 * categorías de Open Food Facts). Devuelve null si no hay pistas suficientes: mejor preguntar que adivinar mal.
 */
const NAME_RULES: [string, RegExp][] = [
  ['Bebé', /\b(bebes?|panal(es)?|biberon|chupete|potitos?|tarritos?|papillas?|leche de (continuacion|crecimiento|inicio))\b/],
  ['Mascotas', /\b(perros?|gatos?|mascotas?|pienso|arena para gatos?|snacks? (perro|gato))\b/],
  ['Congelados', /\b(congelad[oa]s?|ultracongelad[oa]s?|helados?|hielo|polos?)\b/],
  ['Lavandería', /\b(detergente|suavizante|quitamanchas|lavadora|perlas de olor|blanqueador ropa)\b/],
  ['Limpieza', /\b(lejia|friegasuelos|lavavajillas|limpiador|limpiacristales|multiusos|estropajos?|bayetas?|amoniaco|desengrasante|bolsas de basura|insecticida|ambientador|papel de cocina|rollo de cocina|servilletas|guantes)\b/],
  ['Higiene personal', /\b(champu|acondicionador|gel( de)? (bano|ducha)|jabon( de manos)?|dentifrico|pasta de dientes|cepillo de dientes|colutorio|enjuague bucal|desodorante|compresas?|tampones?|protegeslips?|papel higienico|toallitas|crema (facial|corporal|de manos)|maquinillas?|cuchillas|espuma de afeitar|colonia|perfume|maquillaje|pintalabios|labial|rimel|laca|gomina|protector solar|panuelos)\b/],
  ['Despensa', /\b(chocolate con leche|tableta de chocolate|bombones)\b/],
  ['Lácteos y huevos', /\b(leche|yogur(es)?|queso|quesos|mantequilla|margarina|nata|huevos?|kefir|bifidus|natillas|flan|cuajada|requeson|batido)\b/],
  ['Bebidas', /\b(agua|refresco|coca cola|pepsi|zumo|nectar|cerveza|vino|cava|sidra|tonica|gaseosa|isotonica|bebida energetica|licor|ginebra|ron|whisky|vermut|sangria)\b/],
  ['Panadería y desayuno', /\b(pan|barra|baguette|picos|tostadas|biscotes|galletas?|cereales|muesli|copos de avena|magdalenas|bolleria|croissants?|cafe|capsulas|te|infusion|manzanilla|cacao|colacao|cola cao|nesquik|mermelada|miel|crema de cacao)\b/],
  ['Carne y pescado', /\b(pollo|pavo|cerdo|ternera|vacuno|cordero|conejo|carne|picada|hamburguesas?|salchichas|chorizo|salchichon|jamon|lomo|bacon|mortadela|chopped|fuet|embutido|pescado|merluza|salmon|bacalao|atun fresco|gambas?|langostinos?|calamar|sepia|pulpo|mejillones frescos|dorada|lubina|sardinas frescas|boquerones)\b/],
  ['Frutas y verduras', /\b(manzanas?|platanos?|naranjas?|mandarinas?|limones?|peras?|uvas?|fresas?|melon|sandia|kiwis?|aguacates?|tomates?|lechuga|cebollas?|ajos?|patatas?|zanahorias?|pimientos?|calabacin|berenjenas?|pepinos?|espinacas|brocoli|coliflor|champinones|setas|ensalada|fruta|verdura|hortalizas?)\b/],
  ['Despensa', /\b(arroz|pasta|macarrones|espaguetis|fideos|lentejas|garbanzos|alubias|judias|harina|azucar|sal|aceite|vinagre|tomate frito|salsa|ketchup|mayonesa|mostaza|especias|pimenton|caldo|sopa|conserva|atun|sardinas|mejillones|aceitunas|chocolate|chocolatina|bombones|turron|golosinas|patatas fritas|snacks?|frutos secos|almendras|nueces|pipas|levadura|edulcorante)\b/],
];

/** Etiquetas de Open Food Facts → categoría. Se comprueban etiquetas completas, no fragmentos. */
const TAG_RULES: [string, RegExp][] = [
  ['Congelados', /^en:frozen-/],
  ['Bebé', /^en:baby-(foods|milks)/],
  ['Mascotas', /^en:(pet-food|cat-food|dog-food)/],
  ['Lácteos y huevos', /^en:(dairies|milks|yogurts|cheeses|eggs|butters|creams|dairy-desserts|fermented-milk-products)$/],
  ['Bebidas', /^en:(beverages|waters|sodas|juices|fruit-juices|beers|wines|alcoholic-beverages|carbonated-drinks|plant-based-beverages|energy-drinks)$/],
  ['Carne y pescado', /^en:(meats|fishes|seafood|hams|sausages|poultries|prepared-meats|fish-and-meat-and-eggs)$/],
  ['Frutas y verduras', /^en:(fresh-fruits|fresh-vegetables|fruits|vegetables)$/],
  ['Panadería y desayuno', /^en:(breads|breakfasts|breakfast-cereals|biscuits|biscuits-and-cakes|coffees|teas|cocoa-and-its-products|pastries|viennoiseries|jams|honeys|spreads)$/],
  ['Despensa', /^en:(cereals-and-potatoes|pastas|rices|legumes|canned-foods|condiments|sauces|oils|vinegars|sugars|salts|spices|snacks|sweet-snacks|salty-snacks|chocolates|confectioneries|soups|flours)$/],
];

export function categorizeByName(name: string | null | undefined): string | null {
  const n = ` ${normalizeText(name)} `;
  if (n.trim().length < 3) return null;
  for (const [cat, rx] of NAME_RULES) if (rx.test(n)) return cat;
  return null;
}

export function categorizeByTags(tags: string[] | null | undefined): string | null {
  if (!tags?.length) return null;
  // Congelado, bebé y mascotas mandan aunque aparezcan como etiqueta general.
  for (const [cat, rx] of TAG_RULES.slice(0, 3)) if (tags.some((t) => rx.test(t))) return cat;
  // Open Food Facts ordena las etiquetas de general a específica: gana la más específica reconocida.
  for (let i = tags.length - 1; i >= 0; i--) {
    for (const [cat, rx] of TAG_RULES) if (rx.test(tags[i])) return cat;
  }
  return null;
}

/** Etiquetas de Open Food Facts primero (son del propio producto); si no dicen nada, el nombre. */
export function categorize(name: string | null | undefined, tags?: string[] | null): string | null {
  return categorizeByTags(tags) ?? categorizeByName(name);
}

/** Zonas típicas por categoría (expresiones sobre el nombre de la zona, en orden de preferencia). */
const ZONE_BY_CATEGORY: Record<string, RegExp[]> = {
  'Congelados': [/congel/],
  'Lácteos y huevos': [/nevera|frigo|refri/],
  'Carne y pescado': [/nevera|frigo|refri/],
  'Frutas y verduras': [/frutero|nevera|frigo|refri/],
  'Limpieza': [/limpieza|lavadero|galeria|fregadero|armario/],
  'Lavandería': [/lavadero|galeria|lavanderia|limpieza|armario/],
  'Higiene personal': [/bano|aseo/],
  'Bebé': [/bebe|habitacion|bano/],
  'Mascotas': [/mascota|perro|gato|despensa/],
};

/** Productos de nevera por nombre aunque su categoría sea otra (embutido, platos frescos, zumos refrigerados…). */
const FRIDGE_HINT = /\b(fresc[oa]s?|refrigerad[oa]s?|recien exprimido|yogur|queso|nata|mantequilla|embutido|jamon cocido|pavo|salmon ahumado|hummus|gazpacho|salmorejo|tortilla|ensaladilla|masa fresca|pizza refrigerada)\b/;
const FREEZER_HINT = /\b(congelad[oa]s?|ultracongelad[oa]s?|helados?|hielo)\b/;

export interface ZoneSuggestion {
  id: string;
  reason: string;
}

/** Propone dónde guardar un producto. Nunca obliga: el usuario siempre puede elegir otra zona. */
export function suggestZone(input: { name?: string | null; category?: string | null }, zones: { id: string; name: string }[]): ZoneSuggestion | null {
  if (zones.length === 0) return null;
  const n = ` ${normalizeText(input.name)} `;
  const find = (rx: RegExp) => zones.find((z) => rx.test(normalizeText(z.name)));
  if (FREEZER_HINT.test(n)) {
    const z = find(/congel/);
    if (z) return { id: z.id, reason: 'es congelado' };
  }
  if (FRIDGE_HINT.test(n)) {
    const z = find(/nevera|frigo|refri/);
    if (z) return { id: z.id, reason: 'se conserva en frío' };
  }
  for (const rx of ZONE_BY_CATEGORY[input.category ?? ''] ?? []) {
    const z = find(rx);
    if (z) return { id: z.id, reason: `lo habitual para ${input.category!.toLowerCase()}` };
  }
  const pantry = find(/despensa|alacena|armario de cocina|cocina/);
  if (pantry) return { id: pantry.id, reason: 'producto de despensa' };
  return { id: zones[0].id, reason: 'zona por defecto' };
}
