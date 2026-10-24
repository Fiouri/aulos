import { useTranslation } from 'react-i18next';

import type { Track } from '@/library/queries';
import { usePlayerStore } from '@/stores/player';

import { openAddToPlaylist, openAlbum, openArtist } from './navigation';
import { showToast } from './toast';

/** Queue and navigation actions shared by every track list. */
export function useTrackActions() {
  const { t } = useTranslation();

  return {
    async playNext(tracks: readonly Track[]) {
      await usePlayerStore.getState().playNext(tracks);
      showToast(t('track.queuedNext', { count: tracks.length }));
    },
    async addToQueue(tracks: readonly Track[]) {
      await usePlayerStore.getState().addToQueue(tracks);
      showToast(t('track.queued', { count: tracks.length }));
    },
    addToPlaylist(tracks: readonly Track[]) {
      openAddToPlaylist(tracks.map((track) => track.id));
    },
    goToAlbum(track: Track) {
      if (track.albumKey !== null) openAlbum(track.albumKey);
    },
    goToArtist(track: Track) {
      if (track.artist !== null) openArtist(track.artist);
    },
  };
}
