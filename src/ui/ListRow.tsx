import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Spacing, useColors } from './theme';

export const LIST_ROW_HEIGHT = 64;

interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
}

/** One-line title with an optional subtitle, leading artwork and trailing control. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  onLongPress,
  testID,
}: ListRowProps) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.selected }]}>
      {leading}
      <View style={styles.text}>
        <AppText numberOfLines={1}>{title}</AppText>
        {subtitle ? (
          <AppText variant="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: LIST_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  text: { flex: 1, gap: 2 },
});
