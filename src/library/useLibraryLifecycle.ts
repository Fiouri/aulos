import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useDb } from '@/db/DbProvider';
import { useLibraryStore } from '@/stores/library';
import { usePlayerStore } from '@/stores/player';

/**
 * App-wide library lifecycle: first start asks for access and scans; every return to the
 * foreground re-reads the permission (it may have changed in system settings) and rescans only
 * when MediaStore reports a change. Going to the background saves the player queue.
 */
export function useLibraryLifecycle(): void {
  const db = useDb();
  useEffect(() => {
    void useLibraryStore.getState().start(db);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void (async () => {
          await useLibraryStore.getState().load(db);
          await useLibraryStore.getState().refreshIfChanged(db);
        })();
      } else if (next === 'background') {
        void usePlayerStore.getState().persist();
      }
    });
    return () => sub.remove();
  }, [db]);
}
