import { create } from 'zustand';

import { getSetting, setSetting } from '@/db/client';

export interface AppSettings {
  onboarded: boolean;
  hideGettingStarted: boolean;
  userName: string;
  themeMode: 'system' | 'light' | 'dark';
  reduceMotion: 'system' | 'on' | 'off';
  haptics: boolean;
  // Avisos
  notifExpiry: boolean;
  notifLowStock: boolean;
  notifOutOfStock: boolean;
  notifShopping: boolean;
  notifSavings: boolean;
  warnDays: number;
  notifyHour: number;
  shoppingWeekday: number;
  // Reposición
  restockSuggestions: boolean;
  // Precios y tiendas
  postalCode: string;
  geo: { lat: number; lon: number; label: string } | null;
  maxDistanceKm: number;
  favoriteStores: string[];
  extraStopCost: number;
  maxStores: number;
  allowAlternatives: boolean;
  usePublicPrices: boolean;
  demoPrices: boolean;
  priceMaxAgeDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  onboarded: false,
  hideGettingStarted: false,
  userName: '',
  themeMode: 'system',
  reduceMotion: 'system',
  haptics: true,
  notifExpiry: true,
  notifLowStock: true,
  notifOutOfStock: true,
  notifShopping: true,
  notifSavings: true,
  warnDays: 3,
  notifyHour: 9,
  shoppingWeekday: 5,
  restockSuggestions: true,
  postalCode: '',
  geo: null,
  maxDistanceKm: 10,
  favoriteStores: ['mercadona'],
  extraStopCost: 1.5,
  maxStores: 2,
  allowAlternatives: false,
  usePublicPrices: true,
  demoPrices: false,
  priceMaxAgeDays: 120,
};

interface SettingsStore extends AppSettings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

const KEY = 'app_settings';

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const saved = await getSetting<Partial<AppSettings>>(KEY, {});
    set({ ...DEFAULT_SETTINGS, ...saved, loaded: true });
  },
  update: async (patch) => {
    set(patch);
    const { loaded: _l, load: _a, update: _b, ...rest } = { ...get(), ...patch };
    await setSetting(KEY, rest);
  },
}));

export function settings(): AppSettings {
  return useSettings.getState();
}

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
