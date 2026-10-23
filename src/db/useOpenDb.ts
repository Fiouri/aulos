import { useEffect, useState } from 'react';

import { openAppDb } from './expo-db';
import type { Db } from './types';

export type OpenDbState =
  { status: 'opening' } | { status: 'ready'; db: Db } | { status: 'failed'; error: string };

/** Opens and migrates the app database once, then runs `onReady` before reporting ready. */
export function useOpenDb(onReady: (db: Db) => Promise<void>): OpenDbState {
  const [state, setState] = useState<OpenDbState>({ status: 'opening' });

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      try {
        const db = await openAppDb();
        await onReady(db);
        if (!cancelled) setState({ status: 'ready', db });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    void open();
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  return state;
}
