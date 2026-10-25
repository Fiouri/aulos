import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { importPlaylistFromUri } from '@/collections/playlistTransfer';
import { useDb } from '@/db/DbProvider';
import { useCollectionsStore } from '@/stores/collections';
import { AppText } from '@/ui/AppText';
import { openPlaylist } from '@/ui/navigation';
import { Spacing, useColors } from '@/ui/theme';

/** A playlist file shared to Aulos: imported, then its playlist opens in place of this screen. */
export default function ImportSharedScreen() {
  const { t } = useTranslation();
  const db = useDb();
  const colors = useColors();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payloads = await Sharing.getResolvedSharedPayloadsAsync();
        Sharing.clearSharedPayloads();
        const file = payloads.find((p) => p.contentUri !== null && p.contentType !== 'text');
        if (!file?.contentUri) throw new Error(t('playlists.nothingShared'));
        const result = await importPlaylistFromUri(
          db,
          file.contentUri,
          t('playlists.importedFallbackName'),
        );
        useCollectionsStore.getState().bump();
        if (!active) return;
        router.replace('/');
        openPlaylist(result.playlistId, result);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [db, t]);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {error === null ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : (
        <AppText variant="error" style={styles.message} testID="import-shared-error">
          {t('playlists.importFailed', { message: error })}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { marginTop: Spacing.xl },
  message: { padding: Spacing.lg },
});
