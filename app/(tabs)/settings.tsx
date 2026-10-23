import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDb } from '@/db/DbProvider';
import { useLibraryStore } from '@/stores/library';
import { THEME_PREFERENCES, useSettingsStore, type ThemePreference } from '@/stores/settings';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { MiniPlayer } from '@/ui/MiniPlayer';
import { Screen } from '@/ui/Screen';
import { Spacing, useColors } from '@/ui/theme';

const THEME_LABELS = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
} as const satisfies Record<ThemePreference, string>;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const db = useDb();
  const colors = useColors();
  const theme = useSettingsStore((s) => s.theme);
  const excludedCount = useLibraryStore((s) => s.excludedFolders.length);
  const version = Constants.expoConfig?.version ?? '–';

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Screen title={t('settings.title')}>
        <Card>
          <AppText variant="heading">{t('settings.theme')}</AppText>
          <View style={styles.segments} accessibilityRole="radiogroup">
            {THEME_PREFERENCES.map((option) => {
              const selected = option === theme;
              return (
                <Pressable
                  key={option}
                  testID={`theme-${option}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => void useSettingsStore.getState().setTheme(db, option)}
                  style={[
                    styles.segment,
                    { borderColor: selected ? colors.accent : colors.border },
                    selected && { backgroundColor: colors.accent },
                  ]}>
                  <AppText style={{ color: selected ? colors.onAccent : colors.text }}>
                    {t(THEME_LABELS[option])}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <AppText variant="heading">{t('settings.library')}</AppText>
          <Pressable
            testID="settings-folders"
            accessibilityRole="button"
            onPress={() => router.push('/folders')}
            style={styles.link}>
            <Icon name="folder" color={colors.textSecondary} />
            <View style={styles.fill}>
              <AppText>{t('settings.folders')}</AppText>
              <AppText variant="secondary">
                {excludedCount > 0
                  ? t('settings.foldersSummary', { count: excludedCount })
                  : t('settings.foldersNoneExcluded')}
              </AppText>
            </View>
          </Pressable>
        </Card>

        <Card>
          <AppText variant="heading">{t('settings.about')}</AppText>
          <View style={styles.row}>
            <AppText variant="secondary">{t('settings.version')}</AppText>
            <AppText testID="app-version">{version}</AppText>
          </View>
          <View style={styles.row}>
            <AppText variant="secondary">{t('settings.licence')}</AppText>
            <AppText>{t('settings.licenceId')}</AppText>
          </View>
          <AppText variant="secondary">{t('settings.licenceText')}</AppText>
        </Card>
      </Screen>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fill: { flex: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
});
