import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { useDb } from '@/db/DbProvider';
import { repositoryUrl } from '@/net/client';
import { useDownloadsStore } from '@/stores/downloads';
import { useLibraryStore } from '@/stores/library';
import { THEME_PREFERENCES, useSettingsStore, type ThemePreference } from '@/stores/settings';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { formatBytes } from '@/ui/format';
import { Icon } from '@/ui/Icon';
import { MiniPlayer } from '@/ui/MiniPlayer';
import { openDownloads, openSources } from '@/ui/navigation';
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
  const usedBytes = useDownloadsStore((s) => s.usedBytes);
  const limitBytes = useSettingsStore((s) => s.downloads.limitBytes);
  const version = Constants.expoConfig?.version ?? '–';
  const repository = repositoryUrl();

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
          <AppText variant="heading">{t('settings.sources')}</AppText>
          <Pressable
            testID="settings-sources"
            accessibilityRole="button"
            onPress={openSources}
            style={styles.link}>
            <Icon name="public" color={colors.textSecondary} />
            <View style={styles.fill}>
              <AppText>{t('settings.sources')}</AppText>
              <AppText variant="secondary">{t('settings.sourcesSummary')}</AppText>
            </View>
          </Pressable>
          <Pressable
            testID="settings-downloads"
            accessibilityRole="button"
            onPress={openDownloads}
            style={styles.link}>
            <Icon name="download" color={colors.textSecondary} />
            <View style={styles.fill}>
              <AppText>{t('settings.downloads')}</AppText>
              <AppText variant="secondary">
                {t('downloads.storage', {
                  used: formatBytes(usedBytes),
                  limit: formatBytes(limitBytes),
                })}
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
          {repository && (
            <Pressable
              testID="settings-source"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(repository)}
              style={styles.link}>
              <Icon name="code" color={colors.textSecondary} />
              <View style={styles.fill}>
                <AppText>{t('settings.sourceCode')}</AppText>
                <AppText variant="secondary">{repository}</AppText>
              </View>
            </Pressable>
          )}
          <Pressable
            testID="settings-licences"
            accessibilityRole="button"
            onPress={() => router.push('/licences')}
            style={styles.link}>
            <Icon name="description" color={colors.textSecondary} />
            <View style={styles.fill}>
              <AppText>{t('settings.thirdParty')}</AppText>
              <AppText variant="secondary">{t('settings.thirdPartySummary')}</AppText>
            </View>
          </Pressable>
        </Card>

        <Card>
          <AppText variant="heading">{t('settings.privacy')}</AppText>
          <AppText testID="settings-privacy" variant="secondary">
            {t('settings.privacyText')}
          </AppText>
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
