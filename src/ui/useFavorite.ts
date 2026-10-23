import { useCallback, useEffect, useState } from 'react';

import { isFavorite, setFavorite, type FavoriteKind } from '@/collections/favorites';
import { useDb } from '@/db/DbProvider';
import { useCollectionsStore } from '@/stores/collections';

interface Loaded {
  id: string;
  value: boolean;
}

/** Whether `key` is a favorite of `kind`, and a toggle that persists the change. */
export function useFavorite(kind: FavoriteKind, key: string | null): [boolean, () => void] {
  const db = useDb();
  const revision = useCollectionsStore((s) => s.revision);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const id = key === null ? null : `${kind}:${key}`;
  const favorite = id !== null && loaded?.id === id && loaded.value;

  useEffect(() => {
    if (key === null || id === null) return;
    let active = true;
    void isFavorite(db, kind, key).then((value) => {
      if (active) setLoaded({ id, value });
    });
    return () => {
      active = false;
    };
  }, [db, kind, key, id, revision]);

  const toggle = useCallback(() => {
    if (key === null || id === null) return;
    const next = !favorite;
    setLoaded({ id, value: next });
    void setFavorite(db, kind, key, next).then(() => useCollectionsStore.getState().bump());
  }, [db, kind, key, id, favorite]);

  return [favorite, toggle];
}
