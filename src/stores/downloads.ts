import { create } from 'zustand';

import type { Db } from '@/db/types';
import {
  DownloadManager,
  type DownloadManagerDeps,
  type DownloadRow,
  type EnqueueResult,
} from '@/downloads/manager';
import { getTracks, type Track } from '@/library/queries';

import { useLibraryStore } from './library';
import { useNetworkStore } from './network';
import { useSettingsStore } from './settings';

export interface DownloadItem extends DownloadRow {
  track: Track;
}

export interface DownloadProgressState {
  bytesDone: number;
  bytesTotal: number | null;
}

/** What the store needs from the app: providers and files, faked in tests. */
export type DownloadsInitDeps = Pick<DownloadManagerDeps, 'provider' | 'files' | 'dir'> & {
  now?: () => number;
};

interface DownloadsState {
  items: DownloadItem[];
  progress: Record<number, DownloadProgressState>;
  usedBytes: number;
  ready: boolean;
  /** Creates the manager and resumes what was running when the app stopped. */
  init(db: Db, deps: DownloadsInitDeps): Promise<void>;
  enqueue(trackIds: readonly number[]): Promise<EnqueueResult>;
  cancel(trackId: number): Promise<void>;
  retry(trackId: number): Promise<void>;
  remove(trackId: number): Promise<void>;
  removeAll(): Promise<void>;
  /** Settings changed (Wi-Fi only, limit): re-evaluate what may run. */
  reconsider(): Promise<void>;
}

interface Runtime {
  db: Db;
  manager: DownloadManager;
  unsubscribe: () => void;
  refreshing: Promise<void> | null;
  refreshAgain: boolean;
}

let runtime: Runtime | null = null;

export const useDownloadsStore = create<DownloadsState>()((set) => {
  const rt = (): Runtime => {
    if (!runtime) throw new Error('Downloads used before init()');
    return runtime;
  };

  /** Reloads rows and storage use; overlapping calls collapse into one more reload. */
  const refresh = async (): Promise<void> => {
    const r = runtime;
    if (!r) return;
    if (r.refreshing) {
      r.refreshAgain = true;
      return r.refreshing;
    }
    r.refreshing = (async () => {
      do {
        r.refreshAgain = false;
        const [rows, usedBytes] = await Promise.all([r.manager.list(), r.manager.storageUsed()]);
        const tracks = await getTracks(
          r.db,
          rows.map((row) => row.trackId),
        );
        const byId = new Map(tracks.map((t) => [t.id, t]));
        const items = rows.flatMap((row) => {
          const track = byId.get(row.trackId);
          return track ? [{ ...row, track }] : [];
        });
        set({ items, usedBytes });
      } while (r.refreshAgain);
    })();
    try {
      await r.refreshing;
    } finally {
      r.refreshing = null;
    }
  };

  return {
    items: [],
    progress: {},
    usedBytes: 0,
    ready: false,

    async init(db, deps) {
      runtime?.unsubscribe();
      const manager = new DownloadManager({
        db,
        provider: deps.provider,
        files: deps.files,
        dir: deps.dir,
        network: async () => useNetworkStore.getState().status,
        settings: () => useSettingsStore.getState().downloads,
        now: deps.now ?? Date.now,
        onChange: () => void refresh(),
        onProgress: (trackId, bytesDone, bytesTotal) =>
          set((s) => ({ progress: { ...s.progress, [trackId]: { bytesDone, bytesTotal } } })),
        onLibraryChange: () => useLibraryStore.getState().touch(),
      });
      deps.files.ensureDir(deps.dir);
      const unsubscribe = useNetworkStore.subscribe((state, previous) => {
        if (state.status !== previous.status) void manager.onNetworkChange(state.status);
      });
      runtime = { db, manager, unsubscribe, refreshing: null, refreshAgain: false };
      await refresh();
      set({ ready: true });
      // Resuming may wait on the network; it must not hold up the app start.
      void manager
        .start()
        .catch((error: unknown) => console.error('Download resume failed', error));
    },
    enqueue: (trackIds) => rt().manager.enqueue(trackIds),
    cancel: (trackId) => rt().manager.cancel(trackId),
    retry: (trackId) => rt().manager.retry(trackId),
    remove: (trackId) => rt().manager.remove(trackId),
    removeAll: () => rt().manager.removeAll(),
    reconsider: () => rt().manager.onNetworkChange(useNetworkStore.getState().status),
  };
});
