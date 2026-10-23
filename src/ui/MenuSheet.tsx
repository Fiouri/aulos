import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Spacing, useColors } from './theme';

export interface MenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  testID?: string;
  selected?: boolean;
}

interface MenuSheetProps {
  visible: boolean;
  title?: string;
  items: readonly MenuItem[];
  onClose: () => void;
}

/** Bottom sheet of actions; picking one closes the sheet first. */
export function MenuSheet({ visible, title, items, onClose }: MenuSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.scrim, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={title}
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + Spacing.sm },
        ]}>
        {title ? (
          <AppText variant="heading" numberOfLines={2} style={styles.title}>
            {title}
          </AppText>
        ) : null}
        <ScrollView>
          {items.map((item) => (
            <Pressable
              key={item.label}
              testID={item.testID}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: item.selected }}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => [
                styles.item,
                pressed && { backgroundColor: colors.surface },
              ]}>
              <Icon name={item.icon} color={item.selected ? colors.accent : colors.text} />
              <AppText style={item.selected ? { color: colors.accent } : undefined}>
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    maxHeight: '70%',
  },
  title: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
  },
});
