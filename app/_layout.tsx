import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Appearance, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DbProvider } from '@/db/DbProvider';
import type { Db } from '@/db/types';
import { useOpenDb } from '@/db/useOpenDb';
import { expoFileOps } from '@/downloads/transfer';
import { useLibraryLifecycle } from '@/library/useLibraryLifecycle';
import { getNetworkStatus, onNetworkChange } from '@/net/network';
import {
  downloadsDir,
  enabledProvider,
  initProviders,
  resolveTrackStream,
} from '@/providers/appProviders';
import { useDownloadsStore } from '@/stores/downloads';
import { useNetworkStore } from '@/stores/network';
import { usePcStore } from '@/stores/pc';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { AppText } from '@/ui/AppText';
import { Spacing, useColors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

/**
 * Runs before the splash hides: settings, providers, downloads, then the saved queue (restored
 * paused). Downloads and the player must not keep the library from opening, so their failures
 * are logged and the app starts without them.
 */
const onDbReady = async (db: Db) => {
  await useSettingsStore.getState().load(db);
  const registry = initProviders(db);
  for (const id of useSettingsStore.getState().disabledProviders) registry.setEnabled(id, false);
  await useNetworkStore.getState().start(getNetworkStatus, onNetworkChange);
  usePcStore.getState().init(db);
  try {
    await useDownloadsStore.getState().init(db, {
      provider: enabledProvider,
      files: expoFileOps,
      dir: downloadsDir(),
    });
  } catch (error) {
    console.error('Downloads start failed', error);
  }
  try {
    await usePlayerStore.getState().init(db, {
      resolveStream: resolveTrackStream,
      isOnline: async () => useNetworkStore.getState().status.online,
    });
  } catch (error) {
    console.error('Player restore failed', error);
  }
};

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

function AppStack() {
  const { t } = useTranslation();
  const colors = useColors();
  useLibraryLifecycle();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="album" options={{ title: '' }} />
      <Stack.Screen name="artist" options={{ title: '' }} />
      <Stack.Screen name="playlist/[id]" options={{ title: '' }} />
      <Stack.Screen name="folders" options={{ title: t('settings.folders') }} />
      <Stack.Screen name="sources" options={{ title: t('sources.title') }} />
      <Stack.Screen name="downloads" options={{ title: t('downloads.title') }} />
      <Stack.Screen name="import-shared" options={{ title: t('playlists.import') }} />
      <Stack.Screen name="pc-search" options={{ title: t('pc.search') }} />
      <Stack.Screen
        name="send-to-pc"
        options={{ title: t('pc.candidatesTitle'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="add-to-playlist"
        options={{ title: t('playlists.chooseTitle'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="now-playing"
        options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="queue" options={{ title: t('player.queue'), presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const state = useOpenDb(onDbReady);
  const theme = useSettingsStore((s) => s.theme);
  const scheme = useColorScheme();

  useEffect(() => {
    Appearance.setColorScheme(theme === 'system' ? 'auto' : theme);
  }, [theme]);

  useEffect(() => {
    if (state.status !== 'opening') void SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === 'opening') return null;
  if (state.status === 'failed') return <StartupError message={state.error} />;

  return (
    <GestureHandlerRootView style={styles.fill}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <DbProvider db={state.db}>
          <AppStack />
        </DbProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
});
