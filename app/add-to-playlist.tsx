import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  addToPlaylist,
  createPlaylist,
  listPlaylists,
  type Playlist,
} from '@/collections/playlists';
import { useDb } from '@/db/DbProvider';
import { useDbQuery } from '@/db/useDbQuery';
import { useCollectionsStore } from '@/stores/collections';
import { AppText } from '@/ui/AppText';
import { Icon } from '@/ui/Icon';
import { ListRow } from '@/ui/ListRow';
import { TextPrompt } from '@/ui/TextPrompt';
import { Spacing, useColors } from '@/ui/theme';
import { showToast } from '@/ui/toast';

function parseIds(value: string | undefined): number[] {
  return (value ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Picks the playlist that the tracks in `ids` are appended to, or creates a new one. */
export default function AddToPlaylistScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const db = useDb();
  const trackIds = parseIds(useLocalSearchParams<{ ids: string }>().ids);
  const playlists = useDbQuery(listPlaylists) ?? [];
  const [creating, setCreating] = useState(false);

  const addTo = async (playlist: Pick<Playlist, 'id' | 'name'>) => {
    await addToPlaylist(db, playlist.id, trackIds);
    useCollectionsStore.getState().bump();
    showToast(t('playlists.added', { count: trackIds.length, name: playlist.name }));
    router.back();
  };

  const createAndAdd = async (name: string) => {
    setCreating(false);
    const id = await createPlaylist(db, name);
    await addTo({ id, name });
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <FlashList
        data={playlists}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={
          <ListRow
            testID="add-to-new-playlist"
            title={t('playlists.new')}
            leading={<Icon name="add" size={32} color={colors.accent} />}
            onPress={() => setCreating(true)}
          />
        }
        ListEmptyComponent={
          <AppText variant="secondary" style={styles.empty}>
            {t('playlists.empty')}
          </AppText>
        }
        renderItem={({ item, index }) => (
          <ListRow
            testID={`add-to-playlist-${index}`}
            title={item.name}
            subtitle={t('common.tracks', { count: item.trackCount })}
            leading={<Icon name="queue_music" size={32} color={colors.textSecondary} />}
            onPress={() => void addTo(item)}
          />
        )}
      />
      <TextPrompt
        visible={creating}
        title={t('playlists.new')}
        placeholder={t('playlists.namePlaceholder')}
        confirmLabel={t('common.save')}
        onConfirm={(name) => void createAndAdd(name)}
        onCancel={() => setCreating(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
