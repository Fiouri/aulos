import { useTranslation } from 'react-i18next';

import { useDb } from '@/db/DbProvider';
import { LOCAL_PROVIDER } from '@/library/providers';
import { storeTracks } from '@/providers/store';
import { isStoredTrack, type TrackItem } from '@/providers/types';
import { useDownloadsStore } from '@/stores/downloads';
import { usePlayerStore } from '@/stores/player';

import { openAddToPlaylist, openAlbum, openArtist, openRemoteAlbum } from './navigation';
import { showToast } from './toast';

/**
 * Queue, playlist, download and navigation actions shared by every track list. Remote tracks
 * are stored in the tracks table on first use (SPEC §6), so the queue and playlists only ever
 * hold stored tracks.
 */
export function useTrackActions() {
  const { t } = useTranslation();
  const db = useDb();
  const store = (items: readonly TrackItem[]) => storeTracks(db, items);

  return {
    async play(items: readonly TrackItem[], index: number) {
      await usePlayerStore.getState().playTracks(await store(items), index);
    },
    async shuffle(items: readonly TrackItem[]) {
      await usePlayerStore.getState().shuffleTracks(await store(items));
    },
    async playNext(items: readonly TrackItem[]) {
      await usePlayerStore.getState().playNext(await store(items));
      showToast(t('track.queuedNext', { count: items.length }));
    },
    async addToQueue(items: readonly TrackItem[]) {
      await usePlayerStore.getState().addToQueue(await store(items));
      showToast(t('track.queued', { count: items.length }));
    },
    async addToPlaylist(items: readonly TrackItem[]) {
      openAddToPlaylist((await store(items)).map((track) => track.id));
    },
    /** Downloads the remote tracks among `items`; local ones are skipped. */
    async download(items: readonly TrackItem[]) {
      const stored = await store(items.filter((item) => item.provider !== LOCAL_PROVIDER));
      const { added } = await useDownloadsStore.getState().enqueue(stored.map((t) => t.id));
      showToast(
        added > 0 ? t('track.queuedForDownload', { count: added }) : t('track.nothingToDownload'),
      );
    },
    goToAlbum(item: TrackItem) {
      if (isStoredTrack(item) && item.localPath !== null && item.albumKey !== null) {
        openAlbum(item.albumKey);
      } else if (item.albumRef !== null && item.provider !== LOCAL_PROVIDER) {
        openRemoteAlbum(item.provider, item.albumRef);
      }
    },
    goToArtist(item: TrackItem) {
      if (item.artist !== null) openArtist(item.artist);
    },
  };
}
