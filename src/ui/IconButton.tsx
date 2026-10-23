import { Pressable, StyleSheet, type ColorValue } from 'react-native';

import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  color?: ColorValue;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
}

/** 48 dp touch target around an icon; `label` is the accessibility label. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 24,
  color,
  disabled = false,
  selected,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        { minWidth: Math.max(48, size + 16), minHeight: Math.max(48, size + 16) },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  dimmed: { opacity: 0.5 },
});
