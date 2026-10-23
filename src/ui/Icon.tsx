import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useColors } from './theme';

export type IconName = AndroidSymbol;

interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
}

/** Material Symbols glyph from the font bundled with expo-symbols (works offline). */
export function Icon({ name, size = 24, color }: IconProps) {
  const colors = useColors();
  return <SymbolView name={{ android: name }} size={size} tintColor={color ?? colors.text} />;
}
