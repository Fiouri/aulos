import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LicenceEntry, LicenceReport } from '@/about/licenceReport';
import report from '@/about/third-party-licences.json';
import { AppText } from '@/ui/AppText';
import { Spacing, useColors } from '@/ui/theme';

const LICENCES: LicenceReport = report;

function LicenceRow({ entry, index }: { entry: LicenceEntry; index: number }) {
  const { t } = useTranslation();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const licence = entry.licence ?? t('licences.unknown');
  const text = entry.text === null ? null : LICENCES.texts[entry.text];
  return (
    <Pressable
      testID={`licence-${index}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen((value) => !value)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.selected },
      ]}>
      <View style={styles.title}>
        <AppText style={styles.name}>{entry.name}</AppText>
        <AppText variant="secondary">{entry.version}</AppText>
      </View>
      <AppText variant="secondary">{licence}</AppText>
      {open && (
        <AppText selectable variant="secondary" style={styles.text}>
          {text ?? t('licences.noText', { licence })}
        </AppText>
      )}
    </Pressable>
  );
}

export default function LicencesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <FlashList
      testID="licences-list"
      data={LICENCES.packages}
      keyExtractor={(entry) => `${entry.name}@${entry.version}`}
      renderItem={({ item, index }) => <LicenceRow entry={item} index={index} />}
      ListHeaderComponent={
        <AppText variant="secondary" style={styles.intro}>
          {t('licences.intro', { count: LICENCES.packages.length })}
        </AppText>
      }
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
    />
  );
}

const styles = StyleSheet.create({
  intro: { padding: Spacing.md },
  row: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  name: { flexShrink: 1, fontWeight: '600' },
  text: { marginTop: Spacing.sm, fontSize: 12, lineHeight: 16 },
});
