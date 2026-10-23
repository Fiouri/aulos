import { useColorScheme } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#5B6168',
    background: '#FFFFFF',
    surface: '#F1F3F5',
    border: '#DDE1E5',
    accent: '#1F6FEB',
    onAccent: '#FFFFFF',
    danger: '#C62828',
    selected: '#E3EDFD',
    scrim: 'rgba(0, 0, 0, 0.4)',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#A4AAB0',
    background: '#0E1012',
    surface: '#1B1E21',
    border: '#2C3034',
    accent: '#6EA8FE',
    onAccent: '#0E1012',
    danger: '#FF8A80',
    selected: '#1D2A3D',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type Palette = (typeof Colors)[keyof typeof Colors];

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? Colors.dark : Colors.light;
}
