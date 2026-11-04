import { normalizeText } from '@/domain/text';

/**
 * Registro de cadenas. Cada una declara qué integración tiene realmente.
 * Ninguna de las cadenas prioritarias ofrece hoy una API pública autorizada de catálogo o precios;
 * por eso sus conectores están "no disponibles" y los datos vienen de tickets, del hogar y de Open Prices.
 */
export type ConnectorStatus = 'available' | 'bundled' | 'no_public_api' | 'planned';

export interface StoreChainInfo {
  id: string;
  name: string;
  color: string;
  priority: number;
  connector: ConnectorStatus;
  connectorNote: string;
  /** Alias para reconocer la cadena en tickets y en OpenStreetMap. */
  aliases: string[];
}

const NOTE =
  'Sin API pública ni acuerdo de datos. No se hace scraping. Precios desde tus tickets, tu hogar y Open Prices. El conector se activará si la cadena publica una fuente autorizada.';

export const STORE_CHAINS: StoreChainInfo[] = [
  { id: 'mercadona', name: 'Mercadona', color: '#1E8A4C', priority: 1, connector: 'bundled', connectorNote: 'Catálogo incluido en la app (nombre, formato y precio de su web, con fecha). Sin conexión y sin cuenta.', aliases: ['mercadona'] },
  { id: 'consum', name: 'Consum', color: '#F28C00', priority: 2, connector: 'bundled', connectorNote: 'Catálogo incluido en la app (páginas públicas de su tienda online, con fecha).', aliases: ['consum', 'charter'] },
  { id: 'lidl', name: 'Lidl', color: '#0050AA', priority: 3, connector: 'no_public_api', connectorNote: NOTE, aliases: ['lidl'] },
  { id: 'carrefour', name: 'Carrefour', color: '#1E5BC6', priority: 4, connector: 'no_public_api', connectorNote: NOTE, aliases: ['carrefour', 'carrefour market', 'carrefour express'] },
  { id: 'alcampo', name: 'Alcampo', color: '#E3001B', priority: 5, connector: 'no_public_api', connectorNote: NOTE, aliases: ['alcampo', 'auchan', 'mi alcampo'] },
  { id: 'dia', name: 'DIA', color: '#E30613', priority: 6, connector: 'bundled', connectorNote: 'Catálogo parcial incluido en la app (básicos de su web pública, con fecha).', aliases: ['dia', 'dia&go', 'la plaza de dia'] },
  { id: 'aldi', name: 'Aldi', color: '#00005F', priority: 7, connector: 'planned', connectorNote: NOTE, aliases: ['aldi'] },
  { id: 'eroski', name: 'Eroski', color: '#D7001D', priority: 8, connector: 'planned', connectorNote: NOTE, aliases: ['eroski', 'caprabo'] },
  { id: 'hipercor', name: 'El Corte Inglés / Hipercor', color: '#00733C', priority: 9, connector: 'planned', connectorNote: NOTE, aliases: ['hipercor', 'el corte ingles', 'supercor'] },
  { id: 'ahorramas', name: 'Ahorramas', color: '#E2001A', priority: 10, connector: 'planned', connectorNote: NOTE, aliases: ['ahorramas'] },
  { id: 'bonpreu', name: 'Bonpreu', color: '#E30613', priority: 11, connector: 'planned', connectorNote: NOTE, aliases: ['bonpreu', 'bon preu', 'esclat'] },
  { id: 'gadis', name: 'Gadis', color: '#E30613', priority: 12, connector: 'planned', connectorNote: NOTE, aliases: ['gadis'] },
];

const byId = new Map(STORE_CHAINS.map((s) => [s.id, s]));

/** Normaliza el nombre de una tienda a una clave de cadena conocida, o a un nombre limpio si no se conoce. */
export function storeKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalizeText(name);
  if (!n) return null;
  for (const s of STORE_CHAINS) {
    if (s.aliases.some((a) => n === a || n.startsWith(`${a} `) || n.endsWith(` ${a}`) || n.includes(` ${a} `))) return s.id;
  }
  return n;
}

export function storeName(key: string | null | undefined): string {
  if (!key) return 'Sin tienda';
  const s = byId.get(key);
  if (s) return s.name;
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function storeColor(key: string | null | undefined): string {
  return (key && byId.get(key)?.color) || '#6B7F74';
}

export function chainInfo(key: string): StoreChainInfo | undefined {
  return byId.get(key);
}
