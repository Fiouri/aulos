import { create } from 'zustand';

import { getKv, setKv } from '@/db/kv';
import type { Db } from '@/db/types';
import {
  checkAudioPermission,
  requestAudioPermission,
  type AudioPermission,
} from '@/library/permission';
import { countLocalTracks, scanLibrary, type ScanResult } from '@/library/scan';

export const LAST_SCAN_KEY = 'library.lastScan';

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
  loaded: boolean;
  /** Restores the persisted count and last scan, and reads the permission without prompting. */
  load(db: Db): Promise<void>;
  /** Prompts for audio access; returns true when granted. */
  requestPermission(): Promise<boolean>;
  /** Asks for access if needed, then scans the MediaStore into the database. */
  scan(db: Db): Promise<void>;
  /** First-screen flow: load, ask for access when missing, scan once if never scanned. */
  start(db: Db): Promise<void>;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  permission: 'unknown',
  status: 'idle',
  error: null,
  totalTracks: 0,
  lastScan: null,
  loaded: false,

  async load(db) {
    const [granted, totalTracks, stored] = await Promise.all([
      checkAudioPermission(),
      countLocalTracks(db),
      getKv(db, LAST_SCAN_KEY),
    ]);
    set((s) => ({
      // A revoked grant falls back to 'unknown' so the next start asks again.
      permission: granted ? 'granted' : s.permission === 'granted' ? 'unknown' : s.permission,
      totalTracks,
      lastScan: isLastScan(stored) ? stored : null,
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
      const result = await scanLibrary(db);
      const lastScan: LastScan = { at: Date.now(), result };
      await setKv(db, LAST_SCAN_KEY, lastScan);
      set({ status: 'idle', totalTracks: result.total, lastScan });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },

  async start(db) {
    await get().load(db);
    if (get().permission === 'blocked') return;
    if (get().permission !== 'granted' && !(await get().requestPermission())) return;
    if (!get().lastScan) await get().scan(db);
  },
}));
