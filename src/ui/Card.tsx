import { StyleSheet, View, type ViewProps } from 'react-native';

import { Spacing, useColors } from './theme';

export function Card({ style, ...rest }: ViewProps) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
});
