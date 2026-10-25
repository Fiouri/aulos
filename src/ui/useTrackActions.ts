import { useTranslation } from 'react-i18next';

import { useDb } from '@/db/DbProvider';
import { LOCAL_PROVIDER, UNAVAILABLE_PROVIDER } from '@/library/providers';
import { storeTracks } from '@/providers/store';
import { isStoredTrack, type TrackItem } from '@/providers/types';
import { useDownloadsStore } from '@/stores/downloads';
import { usePlayerStore } from '@/stores/player';

import { openAddToPlaylist, openAlbum, openArtist, openRemoteAlbum } from './navigation';
import { showToast } from './toast';

export function isAvailable(item: TrackItem): boolean {
  return item.provider !== UNAVAILABLE_PROVIDER;
}

/**
 * Queue, playlist, download and navigation actions shared by every track list. Remote tracks
 * are stored in the tracks table on first use (SPEC §6), so the queue and playlists only ever
 * hold stored tracks.
 */
export function useTrackActions() {
  const { t } = useTranslation();
  const db = useDb();
  const store = (items: readonly TrackItem[]) => storeTracks(db, items);
  /** Imported Nuclear rows that matched nothing are listed but never queued. */
  const playable = (items: readonly TrackItem[]) => items.filter(isAvailable);

  return {
    async play(items: readonly TrackItem[], index: number) {
      const tapped = items[index];
      if (tapped && !isAvailable(tapped)) {
        showToast(t('track.unavailableToast', { title: tapped.title }));
        return;
      }
      const start = playable(items.slice(0, index)).length;
      await usePlayerStore.getState().playTracks(await store(playable(items)), start);
    },
    async shuffle(items: readonly TrackItem[]) {
      await usePlayerStore.getState().shuffleTracks(await store(playable(items)));
    },
    async playNext(items: readonly TrackItem[]) {
      const kept = playable(items);
      await usePlayerStore.getState().playNext(await store(kept));
      showToast(t('track.queuedNext', { count: kept.length }));
    },
    async addToQueue(items: readonly TrackItem[]) {
      const kept = playable(items);
      await usePlayerStore.getState().addToQueue(await store(kept));
      showToast(t('track.queued', { count: kept.length }));
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
