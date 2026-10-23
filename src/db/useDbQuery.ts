import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useCollectionsStore } from '@/stores/collections';
import { useLibraryStore } from '@/stores/library';

import { useDb } from './DbProvider';
import type { Db } from './types';

/**
 * Loads data for a screen while it is focused, and again whenever the library is rescanned or a
 * playlist or favorite changes. `load` must be stable (wrap it in useCallback).
 */
export function useDbQuery<T>(load: (db: Db) => Promise<T>): T | undefined {
  const db = useDb();
  const libraryRevision = useLibraryStore((s) => s.revision);
  const collectionsRevision = useCollectionsStore((s) => s.revision);
  const [data, setData] = useState<T>();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(db).then((value) => {
        if (active) setData(value);
      });
      return () => {
        active = false;
      };
      // The revisions are triggers: a change means the same query returns new rows.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, load, libraryRevision, collectionsRevision]),
  );

  return data;
}
