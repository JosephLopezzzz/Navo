import { useAppState } from '../state/AppStateProvider';
import { useColorScheme } from 'react-native';

export const brand = {
  midnight: '#07182F',
  ocean: '#0D294B',
  sapphire: '#0869A8',
  aqua: '#00D3C5',
  cloud: '#F7FAFF',
} as const;

export const navoGradient = ['#0B3B88', '#0869A8', '#00D3C5'] as const;

const light = {
  ...brand,
  isDark: false,
  background: '#F7FAFF',
  surface: '#FFFFFF',
  raised: '#EDF3F9',
  ink: '#07182F',
  muted: '#41546C',
  quiet: '#566D86',
  line: '#D7E2ED',
  accent: brand.sapphire,
  accentSoft: '#E2F0F9',
  teal: '#007B78',
  success: '#176A4A',
  successSoft: '#E8F4ED',
  warning: '#87590E',
  warningSoft: '#FFF3D9',
  danger: '#A12D36',
  dangerSoft: '#FCEBED',
  onAccent: '#FFFFFF',
};

const dark = {
  ...brand,
  isDark: true,
  background: '#050C17',
  surface: '#0A1626',
  raised: '#0D294B',
  ink: '#F7FAFF',
  muted: '#C1D0E0',
  quiet: '#9BAFC4',
  line: '#263B54',
  accent: '#3F9ED4',
  accentSoft: '#102E49',
  teal: '#00D3C5',
  success: '#8BD8AB',
  successSoft: '#132D29',
  warning: '#F6CE7C',
  warningSoft: '#352A18',
  danger: '#FFB3B8',
  dangerSoft: '#3B2028',
  onAccent: '#07182F',
};

export type NavoColors = Record<Exclude<keyof typeof light, 'isDark'>, string> & { isDark: boolean };

export function useNavoColors(): NavoColors {
  const { settings } = useAppState();
  const systemAppearance = useColorScheme();
  const isDark = settings.appearance === 'system'
    ? systemAppearance === 'dark'
    : settings.appearance === 'dark';
  return isDark ? dark : light;
}

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 44 } as const;
