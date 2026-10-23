import { create } from 'zustand';

import { getVersion } from '../../modules/media-store';
import { getKv, setKv } from '@/db/kv';
import type { Db } from '@/db/types';
import { parseExcludedFolders } from '@/library/folders';
import {
  checkAudioPermission,
  requestAudioPermission,
  type AudioPermission,
} from '@/library/permission';
import { countLocalTracks, scanLibrary, type ScanResult } from '@/library/scan';

export const LAST_SCAN_KEY = 'library.lastScan';
export const EXCLUDED_FOLDERS_KEY = 'library.excludedFolders';
/** MediaStore version token seen by the last successful scan. */
export const MEDIA_VERSION_KEY = 'library.mediaVersion';

export interface LastScan {
  at: number;
  result: ScanResult;
}

export type PermissionStatus = 'unknown' | AudioPermission;
export type ScanStatus = 'idle' | 'scanning' | 'error';

function isScanResult(value: unknown): value is ScanResult {
  if (typeof value !== 'object' || value === null) return false;
  return (['added', 'updated', 'removed', 'total', 'durationMs'] as const).every(
    (k) => k in value && typeof (value as Record<string, unknown>)[k] === 'number',
  );
}

function isLastScan(value: unknown): value is LastScan {
  if (typeof value !== 'object' || value === null) return false;
  const { at, result } = value as Record<string, unknown>;
  return typeof at === 'number' && isScanResult(result);
}

interface LibraryState {
  permission: PermissionStatus;
  status: ScanStatus;
  error: string | null;
  totalTracks: number;
  lastScan: LastScan | null;
  excludedFolders: string[];
  loaded: boolean;
  /** Bumped after every scan that changed the library, so open lists reload. */
  revision: number;
  /** Restores the persisted count, last scan and exclusions; reads the permission silently. */
  load(db: Db): Promise<void>;
  /** Prompts for audio access; returns true when granted. */
  requestPermission(): Promise<boolean>;
  /** Asks for access if needed, then scans the MediaStore into the database. */
  scan(db: Db): Promise<void>;
  /** Scans only when the MediaStore changed since the last scan (cheap check on resume). */
  refreshIfChanged(db: Db): Promise<void>;
  /** First-screen flow: load, ask for access when missing, scan when never scanned or stale. */
  start(db: Db): Promise<void>;
  setExcludedFolders(db: Db, folders: readonly string[]): Promise<void>;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  permission: 'unknown',
  status: 'idle',
  error: null,
  totalTracks: 0,
  lastScan: null,
  excludedFolders: [],
  loaded: false,
  revision: 0,

  async load(db) {
    const [granted, totalTracks, stored, excluded] = await Promise.all([
      checkAudioPermission(),
      countLocalTracks(db),
      getKv(db, LAST_SCAN_KEY),
      getKv(db, EXCLUDED_FOLDERS_KEY),
    ]);
    set((s) => ({
      // A revoked grant falls back to 'unknown' so the next start asks again.
      permission: granted ? 'granted' : s.permission === 'granted' ? 'unknown' : s.permission,
      totalTracks,
      lastScan: isLastScan(stored) ? stored : null,
      excludedFolders: parseExcludedFolders(excluded),
      loaded: true,
    }));
  },

  async requestPermission() {
    const permission = await requestAudioPermission();
    set({ permission });
    return permission === 'granted';
  },

  async scan(db) {
    if (get().status === 'scanning') return;
    if (get().permission !== 'granted' && !(await get().requestPermission())) return;

    set({ status: 'scanning', error: null });
    try {
      // Read the token first: a change during the scan then triggers one more scan later.
      const { token } = await getVersion();
      const result = await scanLibrary(db, { excludedFolders: get().excludedFolders });
      const lastScan: LastScan = { at: Date.now(), result };
      await setKv(db, LAST_SCAN_KEY, lastScan);
      await setKv(db, MEDIA_VERSION_KEY, token);
      const changed = result.added + result.updated + result.removed > 0;
      set((s) => ({
        status: 'idle',
        totalTracks: result.total,
        lastScan,
        revision: changed ? s.revision + 1 : s.revision,
      }));
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },

  async refreshIfChanged(db) {
    if (get().permission !== 'granted' || get().status === 'scanning') return;
    const [{ token }, seen] = await Promise.all([getVersion(), getKv(db, MEDIA_VERSION_KEY)]);
    if (token !== seen) await get().scan(db);
  },

  async start(db) {
    await get().load(db);
    if (get().permission === 'blocked') return;
    if (get().permission !== 'granted' && !(await get().requestPermission())) return;
    if (!get().lastScan) await get().scan(db);
    else await get().refreshIfChanged(db);
  },

  async setExcludedFolders(db, folders) {
    const excludedFolders = parseExcludedFolders(folders);
    await setKv(db, EXCLUDED_FOLDERS_KEY, excludedFolders);
    set({ excludedFolders });
  },
}));
