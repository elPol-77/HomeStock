import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useSettings } from '@/services/settings';

import { Colors, palette } from './tokens';

interface ThemeValue {
  colors: Colors;
  scheme: 'light' | 'dark';
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeValue>({ colors: palette.light, scheme: 'light', reduceMotion: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const systemReduced = useReducedMotion();
  const mode = useSettings((s) => s.themeMode);
  const reduceSetting = useSettings((s) => s.reduceMotion);
  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const reduceMotion = reduceSetting === 'system' ? systemReduced : reduceSetting === 'on';
  const value = useMemo(() => ({ colors: palette[scheme], scheme, reduceMotion }), [scheme, reduceMotion]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
