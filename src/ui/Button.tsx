import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { Spacing, useColors } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  testID,
}: ButtonProps) {
  const colors = useColors();
  const primary = variant === 'primary';
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.accent }
          : { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
        (pressed || inactive) && styles.dimmed,
      ]}>
      {busy && <ActivityIndicator color={primary ? colors.onAccent : colors.text} />}
      <AppText style={[styles.label, { color: primary ? colors.onAccent : colors.text }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: 24,
  },
  label: { fontWeight: '600' },
  dimmed: { opacity: 0.6 },
});
