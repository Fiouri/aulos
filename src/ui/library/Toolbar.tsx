import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Icon, type IconName } from '../Icon';
import { Spacing, useColors } from '../theme';

/** Row of compact actions under a section's chips. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <View style={styles.toolbar}>{children}</View>;
}

interface ToolbarButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}

export function ToolbarButton({ icon, label, onPress, testID }: ToolbarButtonProps) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.selected },
      ]}>
      <Icon name={icon} size={20} />
      <AppText variant="secondary" style={{ color: colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: 20,
    borderWidth: 1,
  },
});
