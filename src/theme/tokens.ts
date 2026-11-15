/** Gather design tokens. Deep indigo + soft violet + electric blue on off-white / charcoal. */
import type { Category } from '@shared/recommendation.ts';

export const palette = {
  indigo900: '#1E1773',
  indigo700: '#2E24A8',
  indigo600: '#3B2FC9',
  indigo500: '#5145E0',
  indigo400: '#7468FF',
  violet300: '#B9AEFF',
  violet200: '#D9D2FF',
  violet100: '#EEEAFF',
  blue500: '#2F80FF',
  blue400: '#4C9BFF',
  offWhite: '#F7F6FB',
  charcoal: '#121218',
};

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  secondary: string;
  accent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  bubbleMine: [string, string];
  bubbleTheirs: string;
  bubbleTheirsText: string;
  aiGradient: [string, string, string];
  heroGradient: [string, string];
  overlay: string;
  skeleton: string;
  tabBar: string;
}

export const lightColors: ThemeColors = {
  background: palette.offWhite,
  surface: '#FFFFFF',
  surfaceAlt: '#F0EEF8',
  surfaceRaised: '#FFFFFF',
  text: '#15132B',
  textMuted: '#5E5B78',
  textSubtle: '#8B88A3',
  border: '#E4E1F0',
  primary: palette.indigo600,
  primaryPressed: palette.indigo700,
  primarySoft: palette.violet100,
  onPrimary: '#FFFFFF',
  secondary: '#8B7CF6',
  accent: palette.blue500,
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  bubbleMine: [palette.indigo600, palette.indigo500],
  bubbleTheirs: '#FFFFFF',
  bubbleTheirsText: '#15132B',
  aiGradient: ['#3B2FC9', '#7A5CFA', '#2F80FF'],
  heroGradient: ['#3B2FC9', '#6D5DF6'],
  overlay: 'rgba(15, 12, 40, 0.45)',
  skeleton: '#E9E6F3',
  tabBar: 'rgba(255,255,255,0.96)',
};

export const darkColors: ThemeColors = {
  background: palette.charcoal,
  surface: '#1C1B24',
  surfaceAlt: '#24232F',
  surfaceRaised: '#272634',
  text: '#F3F2FA',
  textMuted: '#A9A6C2',
  textSubtle: '#7E7B96',
  border: '#2E2C3B',
  primary: palette.indigo400,
  primaryPressed: palette.indigo500,
  primarySoft: '#2A2550',
  onPrimary: '#FFFFFF',
  secondary: '#A99BFF',
  accent: palette.blue400,
  success: '#4ADE80',
  successSoft: '#163323',
  warning: '#FBBF24',
  warningSoft: '#3A2E10',
  danger: '#F87171',
  dangerSoft: '#3B1717',
  bubbleMine: ['#5145E0', '#6A5CF5'],
  bubbleTheirs: '#24232F',
  bubbleTheirsText: '#F3F2FA',
  aiGradient: ['#4B3FE0', '#8366FF', '#3A8BFF'],
  heroGradient: ['#2E24A8', '#5B4BE8'],
  overlay: 'rgba(0,0,0,0.6)',
  skeleton: '#2A2936',
  tabBar: 'rgba(28,27,36,0.97)',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 } as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const typography = {
  display: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  tiny: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
} as const;
export type TypographyVariant = keyof typeof typography;

export const shadows = {
  card: { shadowColor: '#1E1773', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  raised: { shadowColor: '#1E1773', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
} as const;

/** Category art: gradient + icon used when a place has no photo. */
export const categoryArt: Record<Category, { colors: [string, string]; icon: string; label: string }> = {
  food: { colors: ['#FF8A4C', '#F2536D'], icon: 'restaurant', label: 'Food' },
  cafe: { colors: ['#C08457', '#8B5E3C'], icon: 'cafe', label: 'Cafe' },
  entertainment: { colors: ['#7A5CFA', '#3B2FC9'], icon: 'film', label: 'Entertainment' },
  sports: { colors: ['#22C1A8', '#2F80FF'], icon: 'basketball', label: 'Sports' },
  outdoors: { colors: ['#4CB86A', '#1F8A70'], icon: 'leaf', label: 'Outdoors' },
  shopping: { colors: ['#F25CA2', '#B03FD9'], icon: 'bag-handle', label: 'Shopping' },
  arts: { colors: ['#F7B733', '#FC4A1A'], icon: 'color-palette', label: 'Arts' },
  games: { colors: ['#5B6CFF', '#9F4CFF'], icon: 'game-controller', label: 'Games' },
  nightlife: { colors: ['#3A2A80', '#121218'], icon: 'musical-notes', label: 'Music' },
  free: { colors: ['#2BB673', '#14A3A3'], icon: 'gift', label: 'Free' },
  other: { colors: ['#8B7CF6', '#5145E0'], icon: 'sparkles', label: 'Idea' },
};

export const avatarGradients: [string, string][] = [
  ['#7A5CFA', '#3B2FC9'],
  ['#FF8A4C', '#F2536D'],
  ['#22C1A8', '#2F80FF'],
  ['#F25CA2', '#B03FD9'],
  ['#4CB86A', '#1F8A70'],
  ['#F7B733', '#FC4A1A'],
];
