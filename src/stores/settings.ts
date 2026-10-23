import { create } from 'zustand';

import { getKv, setKv } from '@/db/kv';
import type { Db } from '@/db/types';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_KEY = 'settings.theme';

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((t) => t === value);
}

interface SettingsState {
  theme: ThemePreference;
  loaded: boolean;
  load(db: Db): Promise<void>;
  setTheme(db: Db, theme: ThemePreference): Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  theme: 'system',
  loaded: false,
  async load(db) {
    const stored = await getKv(db, THEME_KEY);
    set({ theme: isThemePreference(stored) ? stored : 'system', loaded: true });
  },
  async setTheme(db, theme) {
    await setKv(db, THEME_KEY, theme);
    set({ theme });
  },
}));
