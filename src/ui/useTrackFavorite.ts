import { useCallback, useEffect, useState } from 'react';

import { isFavorite, setFavorite, trackFavoriteKey } from '@/collections/favorites';
import { useDb } from '@/db/DbProvider';
import { findStoredTrack, storeTracks } from '@/providers/store';
import type { TrackItem } from '@/providers/types';
import { useCollectionsStore } from '@/stores/collections';

interface Loaded {
  item: TrackItem;
  value: boolean;
}

/**
 * Favorite state of a stored or remote track, and a toggle. A remote track is stored when it is
 * first favourited; one that was never stored is not a favorite.
 */
export function useTrackFavorite(item: TrackItem | null): [boolean, () => void] {
  const db = useDb();
  const revision = useCollectionsStore((s) => s.revision);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const favorite = item !== null && loaded?.item === item && loaded.value;

  useEffect(() => {
    if (item === null) return;
    let active = true;
    void (async () => {
      const stored = await findStoredTrack(db, item);
      const value = stored ? await isFavorite(db, 'track', trackFavoriteKey(stored.id)) : false;
      if (active) setLoaded({ item, value });
    })();
    return () => {
      active = false;
    };
  }, [db, item, revision]);

  const toggle = useCallback(() => {
    if (item === null) return;
    const next = !favorite;
    setLoaded({ item, value: next });
    void (async () => {
      const [stored] = await storeTracks(db, [item]);
      if (!stored) return;
      await setFavorite(db, 'track', trackFavoriteKey(stored.id), next);
      useCollectionsStore.getState().bump();
    })();
  }, [db, item, favorite]);

  return [favorite, toggle];
}
