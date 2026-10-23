import '@/i18n';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Appearance, StyleSheet, useColorScheme, View } from 'react-native';

import { DbProvider } from '@/db/DbProvider';
import type { Db } from '@/db/types';
import { useOpenDb } from '@/db/useOpenDb';
import { useSettingsStore } from '@/stores/settings';
import { AppText } from '@/ui/AppText';
import { Spacing, useColors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

const loadSettings = (db: Db) => useSettingsStore.getState().load(db);

function StartupError({ message }: { message: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View style={[styles.error, { backgroundColor: colors.background }]}>
      <AppText variant="heading">{t('app.startupFailed')}</AppText>
      <AppText variant="error" selectable>
        {message}
      </AppText>
    </View>
  );
}

export default function RootLayout() {
  const { t } = useTranslation();
  const state = useOpenDb(loadSettings);
  const theme = useSettingsStore((s) => s.theme);
  const scheme = useColorScheme();
  const colors = useColors();

  useEffect(() => {
    Appearance.setColorScheme(theme === 'system' ? 'auto' : theme);
  }, [theme]);

  useEffect(() => {
    if (state.status !== 'opening') void SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === 'opening') return null;
  if (state.status === 'failed') return <StartupError message={state.error} />;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <DbProvider db={state.db}>
        <NativeTabs
          backgroundColor={colors.background}
          indicatorColor={colors.surface}
          labelStyle={{ selected: { color: colors.text } }}>
          <NativeTabs.Trigger name="index">
            <NativeTabs.Trigger.Label>{t('tabs.library')}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon md="library_music" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="settings">
            <NativeTabs.Trigger.Label>{t('tabs.settings')}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon md="settings" />
          </NativeTabs.Trigger>
        </NativeTabs>
      </DbProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
});
