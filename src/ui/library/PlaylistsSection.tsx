import { FlashList } from '@shopify/flash-list';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { createPlaylist, listPlaylists } from '@/collections/playlists';
import { importPlaylistFromPicker } from '@/collections/playlistTransfer';
import { useDb } from '@/db/DbProvider';
import { useDbQuery } from '@/db/useDbQuery';
import { useCollectionsStore } from '@/stores/collections';

import { AppText } from '../AppText';
import { openPlaylist } from '../navigation';
import { TextPrompt } from '../TextPrompt';
import { Spacing } from '../theme';
import { showToast } from '../toast';
import { PlaylistRow } from './rows';
import { Toolbar, ToolbarButton } from './Toolbar';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PlaylistsSection({ header }: { header: ReactElement }) {
  const { t } = useTranslation();
  const db = useDb();
  const playlists = useDbQuery(listPlaylists) ?? [];
  const [creating, setCreating] = useState(false);

  const create = async (name: string) => {
    setCreating(false);
    const id = await createPlaylist(db, name);
    useCollectionsStore.getState().bump();
    openPlaylist(id);
  };

  const importFile = async () => {
    try {
      const result = await importPlaylistFromPicker(db, t('playlists.importedFallbackName'));
      if (!result) return;
      useCollectionsStore.getState().bump();
      showToast(
        result.reimport
          ? t('playlists.reimported', {
              name: result.name,
              added: result.added,
              unmatched: result.unmatched,
            })
          : t('playlists.imported', {
              name: result.name,
              matched: result.matched,
              unmatched: result.unmatched,
            }),
      );
      openPlaylist(result.playlistId, result);
    } catch (e) {
      showToast(t('playlists.importFailed', { message: errorMessage(e) }));
    }
  };

  return (
    <>
      <FlashList
        data={playlists}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={
          <>
            {header}
            <Toolbar>
              <ToolbarButton
                testID="playlist-new"
                icon="add"
                label={t('playlists.new')}
                onPress={() => setCreating(true)}
              />
              <ToolbarButton
                testID="playlist-import"
                icon="file_download"
                label={t('playlists.import')}
                onPress={() => void importFile()}
              />
            </Toolbar>
          </>
        }
        ListEmptyComponent={
          <AppText variant="secondary" style={styles.empty}>
            {t('playlists.empty')}
          </AppText>
        }
        renderItem={({ item, index }) => (
          <PlaylistRow playlist={item} testID={`playlist-${index}`} />
        )}
      />
      <TextPrompt
        visible={creating}
        title={t('playlists.new')}
        placeholder={t('playlists.namePlaceholder')}
        confirmLabel={t('common.save')}
        onConfirm={(name) => void create(name)}
        onCancel={() => setCreating(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
