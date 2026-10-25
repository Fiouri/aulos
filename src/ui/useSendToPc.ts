import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDb } from '@/db/DbProvider';
import { lastUsedPairing } from '@/nuclear/pairings';
import type { TrackItem } from '@/providers/types';
import { usePcStore } from '@/stores/pc';

import { showToast } from './toast';

/**
 * "Send to PC": the best match from the PC's search goes to its queue; without a sure match
 * the candidates open for the user to choose. Connects to the last used PC when needed.
 */
export function useSendToPc() {
  const { t } = useTranslation();
  const db = useDb();

  return async (track: TrackItem) => {
    if (usePcStore.getState().pairing === null) {
      const pairing = await lastUsedPairing(db);
      if (!pairing) {
        showToast(t('track.pairFirst'));
        return;
      }
      usePcStore.getState().connect(pairing);
    }
    const result = await usePcStore.getState().sendToPc({
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
    });
    if ('match' in result) {
      showToast(t('track.sentToPc', { title: result.match.title }));
      return;
    }
    const error = usePcStore.getState().lastError;
    if (error !== null && result.candidates.length === 0) {
      showToast(t('track.sendToPcFailed', { message: error }));
      return;
    }
    usePcStore.getState().setCandidates({ title: track.title, tracks: result.candidates });
    router.push('/send-to-pc');
  };
}
