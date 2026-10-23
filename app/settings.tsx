import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDb } from '@/db/DbProvider';
import { THEME_PREFERENCES, useSettingsStore, type ThemePreference } from '@/stores/settings';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
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
  const version = Constants.expoConfig?.version ?? '–';

  return (
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
});
