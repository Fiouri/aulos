import { StyleSheet, Text, type TextProps } from 'react-native';

import { useColors } from './theme';

type Variant = 'body' | 'secondary' | 'title' | 'heading' | 'display' | 'error';

interface AppTextProps extends TextProps {
  variant?: Variant;
}

export function AppText({ variant = 'body', style, ...rest }: AppTextProps) {
  const colors = useColors();
  const color =
    variant === 'secondary'
      ? colors.textSecondary
      : variant === 'error'
        ? colors.danger
        : colors.text;
  return <Text style={[styles[variant], { color }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 24 },
  secondary: { fontSize: 14, lineHeight: 20 },
  error: { fontSize: 14, lineHeight: 20 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  display: { fontSize: 56, lineHeight: 64, fontWeight: '700' },
});
