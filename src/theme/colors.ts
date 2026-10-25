import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F7F4',
  surface: '#FFFFFF',
  raised: '#F0F2EF',
  ink: '#17211F',
  muted: '#53615E',
  quiet: '#71807D',
  line: '#D9E0DC',
  accent: '#246DD0',
  accentSoft: '#E6F0FF',
  teal: '#087D73',
  success: '#176A4A',
  successSoft: '#E8F4ED',
  warning: '#87590E',
  warningSoft: '#FFF3D9',
  danger: '#A12D36',
  dangerSoft: '#FCEBED',
  onAccent: '#FFFFFF',
};

const dark = {
  background: '#111715',
  surface: '#1B2220',
  raised: '#252E2B',
  ink: '#F1F5F2',
  muted: '#CCD6D1',
  quiet: '#A8B6B0',
  line: '#34423D',
  accent: '#86B7FF',
  accentSoft: '#1D3048',
  teal: '#6FD3C1',
  success: '#A7D9B9',
  successSoft: '#1C3528',
  warning: '#F1C777',
  warningSoft: '#392F1C',
  danger: '#FFB4BA',
  dangerSoft: '#3D2528',
  onAccent: '#10213A',
};

export type NavoColors = typeof light;
export function useNavoColors(): NavoColors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 44 } as const;
