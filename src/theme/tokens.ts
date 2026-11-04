/**
 * Identidad visual de HomeStock: verde salvia, blancos cálidos y un acento albaricoque.
 * Cercana y doméstica; nada clínica ni corporativa.
 */
export const palette = {
  light: {
    background: '#F7F5EF',
    surface: '#FFFFFF',
    surfaceAlt: '#EFEBE1',
    surfacePressed: '#E8E3D7',
    border: '#E4DFD3',
    text: '#1C2620',
    textMuted: '#66746B',
    textFaint: '#9AA59E',
    primary: '#2E7A55',
    primaryPressed: '#256546',
    primarySoft: '#DDEEE3',
    onPrimary: '#FFFFFF',
    accent: '#F08A5D',
    accentSoft: '#FCE6DB',
    warning: '#D9921E',
    warningSoft: '#FBEFD6',
    danger: '#CF4B43',
    dangerSoft: '#F9DEDB',
    info: '#3F72C4',
    infoSoft: '#DFE8F7',
    success: '#2E9C64',
    successSoft: '#DCF2E5',
    shadow: '#1C2620',
    overlay: 'rgba(20, 28, 23, 0.45)',
    tabBar: 'rgba(255,255,255,0.96)',
    skeleton: '#E9E5DA',
    skeletonHighlight: '#F5F2EA',
  },
  dark: {
    background: '#0E1411',
    surface: '#161F1A',
    surfaceAlt: '#1E2923',
    surfacePressed: '#25322B',
    border: '#26332C',
    text: '#EDF3EF',
    textMuted: '#9BAEA3',
    textFaint: '#6A7C72',
    primary: '#6CCB97',
    primaryPressed: '#5AB584',
    primarySoft: '#1D3628',
    onPrimary: '#0B1A12',
    accent: '#F59E73',
    accentSoft: '#3A2419',
    warning: '#F0B54A',
    warningSoft: '#3A2D14',
    danger: '#F07A70',
    dangerSoft: '#3D1D1A',
    info: '#7FA7EA',
    infoSoft: '#1B2740',
    success: '#62C98F',
    successSoft: '#163223',
    shadow: '#000000',
    overlay: 'rgba(0,0,0,0.6)',
    tabBar: 'rgba(22,31,26,0.97)',
    skeleton: '#1E2923',
    skeletonHighlight: '#26332C',
  },
} as const;

export type ColorName = keyof typeof palette.light;
export type Colors = { [K in ColorName]: string };

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  number: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
} as const;

export type TypeVariant = keyof typeof type;

export function shadow(colors: Colors, level: 1 | 2 | 3 = 1) {
  const map = {
    1: { shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    2: { shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    3: { shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  } as const;
  return { shadowColor: colors.shadow, ...map[level] };
}
