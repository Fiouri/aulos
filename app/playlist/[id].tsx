import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';

import {
  deletePlaylist,
  getPlaylist,
  movePlaylistItem,
  playlistItems,
  removeFromPlaylist,
  renamePlaylist,
  type PlaylistItem,
} from '@/collections/playlists';
import { exportPlaylist } from '@/collections/playlistTransfer';
import { useDb } from '@/db/DbProvider';
import type { Db } from '@/db/types';
import { useDbQuery } from '@/db/useDbQuery';
import type { Track } from '@/library/queries';
import { currentEntry } from '@/player/queue';
import { useCollectionsStore } from '@/stores/collections';
import { usePlayerStore } from '@/stores/player';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DetailHeader } from '@/ui/DetailHeader';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { DetailScreen } from '@/ui/Layouts';
import { MenuSheet } from '@/ui/MenuSheet';
import { ReorderableList } from '@/ui/ReorderableList';
import { TextPrompt } from '@/ui/TextPrompt';
import { Spacing, useColors } from '@/ui/theme';
import { showToast } from '@/ui/toast';
import { TrackMenu } from '@/ui/TrackMenu';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/ui/TrackRow';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function PlaylistScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const db = useDb();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const load = useCallback(
    async (d: Db) => ({ playlist: await getPlaylist(d, id), items: await playlistItems(d, id) }),
    [id],
  );
  const data = useDbQuery(load);
  const currentTrackId = usePlayerStore((s) => currentEntry(s.queue)?.trackId ?? null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState<{ track: Track; index: number } | null>(null);
  // Optimistic order after a drop, until the reloaded rows (a new `data`) replace it.
  const [pending, setPending] = useState<{ base: typeof data; items: PlaylistItem[] } | null>(null);

  const playlist = data?.playlist ?? null;
  const items = (pending && pending.base === data ? pending.items : data?.items) ?? [];
  const tracks = items.map((i) => i.track);
  const changed = () => useCollectionsStore.getState().bump();

  const move = async (from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setPending({ base: data, items: next });
    await movePlaylistItem(db, id, from, to);
    changed();
  };

  const remove = async (index: number) => {
    await removeFromPlaylist(db, id, [index]);
    changed();
  };

  const rename = async (name: string) => {
    setRenaming(false);
    await renamePlaylist(db, id, name);
    changed();
  };

  const confirmDelete = () => {
    if (!playlist) return;
    Alert.alert(t('playlists.deleteTitle', { name: playlist.name }), t('playlists.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            await deletePlaylist(db, id);
            changed();
            router.back();
          })(),
      },
    ]);
  };

  const share = async () => {
    if (!playlist) return;
    try {
      await exportPlaylist(db, playlist);
    } catch (e) {
      showToast(t('playlists.exportFailed', { message: errorMessage(e) }));
    }
  };

  return (
    <DetailScreen>
      <Stack.Screen options={{ title: playlist?.name ?? '' }} />
      <ReorderableList
        data={items}
        rowHeight={TRACK_ROW_HEIGHT}
        keyOf={(item) => `${item.position}:${item.track.id}`}
        onMove={(from, to) => void move(from, to)}
        handleTestID={(index) => `playlist-handle-${index}`}
        header={
          <DetailHeader
            artwork={<Icon name="queue_music" size={96} color={colors.textSecondary} />}
            title={playlist?.name ?? ''}
            lines={[playlist ? t('common.tracks', { count: playlist.trackCount }) : null]}
            actions={
              <>
                <Button
                  testID="playlist-play"
                  label={t('common.play')}
                  disabled={tracks.length === 0}
                  onPress={() => void usePlayerStore.getState().playTracks(tracks, 0)}
                />
                <Button
                  testID="playlist-shuffle"
                  variant="secondary"
                  label={t('common.shuffle')}
                  disabled={tracks.length === 0}
                  onPress={() => void usePlayerStore.getState().shuffleTracks(tracks)}
                />
                <IconButton
                  testID="playlist-more"
                  icon="more_vert"
                  label={t('common.more')}
                  onPress={() => setMoreOpen(true)}
                />
              </>
            }
          />
        }
        empty={
          data ? (
            <AppText variant="secondary" style={styles.empty} testID="playlist-empty">
              {t('playlists.emptyPlaylist')}
            </AppText>
          ) : null
        }
        renderRow={(item, index, handle) => (
          <TrackRow
            track={item.track}
            leading={handle}
            testID={`playlist-item-${index}`}
            current={item.track.id === currentTrackId}
            onPress={() => void usePlayerStore.getState().playTracks(tracks, index)}
            onMore={() => setMenu({ track: item.track, index })}
          />
        )}
      />
      <TrackMenu
        track={menu?.track ?? null}
        onClose={() => setMenu(null)}
        extraItems={
          menu
            ? [
                ...(menu.index > 0
                  ? [
                      {
                        label: t('player.moveUp'),
                        icon: 'arrow_upward' as const,
                        testID: 'menu-move-up',
                        onPress: () => void move(menu.index, menu.index - 1),
                      },
                    ]
                  : []),
                ...(menu.index < items.length - 1
                  ? [
                      {
                        label: t('player.moveDown'),
                        icon: 'arrow_downward' as const,
                        testID: 'menu-move-down',
                        onPress: () => void move(menu.index, menu.index + 1),
                      },
                    ]
                  : []),
                {
                  label: t('track.removeFromPlaylist'),
                  icon: 'remove_circle_outline',
                  testID: 'menu-remove-from-playlist',
                  onPress: () => void remove(menu.index),
                },
              ]
            : []
        }
      />
      <MenuSheet
        visible={moreOpen}
        title={playlist?.name}
        onClose={() => setMoreOpen(false)}
        items={[
          {
            label: t('playlists.rename'),
            icon: 'edit',
            testID: 'playlist-rename',
            onPress: () => setRenaming(true),
          },
          {
            label: t('playlists.export'),
            icon: 'file_upload',
            testID: 'playlist-export',
            onPress: () => void share(),
          },
          {
            label: t('playlists.delete'),
            icon: 'delete',
            testID: 'playlist-delete',
            onPress: confirmDelete,
          },
        ]}
      />
      <TextPrompt
        visible={renaming}
        title={t('playlists.renameTitle')}
        initialValue={playlist?.name ?? ''}
        placeholder={t('playlists.namePlaceholder')}
        confirmLabel={t('common.save')}
        onConfirm={(name) => void rename(name)}
        onCancel={() => setRenaming(false)}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  empty: { padding: Spacing.lg, textAlign: 'center' },
});
