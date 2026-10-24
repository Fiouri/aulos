import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Spacing, useColors } from './theme';

export interface Chip<T extends string> {
  value: T;
  label: string;
}

interface ChipsProps<T extends string> {
  chips: readonly Chip<T>[];
  value: T;
  onChange: (value: T) => void;
  testIDPrefix: string;
}

/** Single-choice segments that wrap onto a second line, so every choice stays visible. */
export function Chips<T extends string>({ chips, value, onChange, testIDPrefix }: ChipsProps<T>) {
  const colors = useColors();
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {chips.map((chip) => {
        const selected = chip.value === value;
        return (
          <Pressable
            key={chip.value}
            testID={`${testIDPrefix}-${chip.value}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(chip.value)}
            style={[
              styles.chip,
              { borderColor: selected ? colors.accent : colors.border },
              selected && { backgroundColor: colors.accent },
            ]}>
            <AppText style={{ color: selected ? colors.onAccent : colors.text }}>
              {chip.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
  },
});
