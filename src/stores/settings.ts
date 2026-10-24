import { create } from 'zustand';

import { getKv, setKv } from '@/db/kv';
import type { Db } from '@/db/types';
import { DEFAULT_DOWNLOAD_SETTINGS, type DownloadSettings } from '@/downloads/manager';
import { DOWNLOAD_FORMATS, type DownloadFormat } from '@/providers/types';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_KEY = 'settings.theme';
export const DISABLED_PROVIDERS_KEY = 'sources.disabled';
export const DOWNLOAD_SETTINGS_KEY = 'downloads.settings';

const MIB = 1024 * 1024;
/** Storage limit choices for downloads, in bytes. */
export const STORAGE_LIMITS = [100, 500, 1024, 2048, 5120, 10240].map((m) => m * MIB);

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((t) => t === value);
}

function isFormat(value: unknown): value is DownloadFormat {
  return DOWNLOAD_FORMATS.some((f) => f === value);
}

/** Stored download settings, field by field, falling back to the defaults. */
export function parseDownloadSettings(value: unknown): DownloadSettings {
  const stored =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const { wifiOnly, limitBytes, format } = stored;
  return {
    wifiOnly: typeof wifiOnly === 'boolean' ? wifiOnly : DEFAULT_DOWNLOAD_SETTINGS.wifiOnly,
    limitBytes:
      typeof limitBytes === 'number' && STORAGE_LIMITS.includes(limitBytes)
        ? limitBytes
        : DEFAULT_DOWNLOAD_SETTINGS.limitBytes,
    format: isFormat(format) ? format : DEFAULT_DOWNLOAD_SETTINGS.format,
  };
}

function parseIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

interface SettingsState {
  theme: ThemePreference;
  /** Providers switched off in Settings → Sources (every provider is on by default). */
  disabledProviders: string[];
  downloads: DownloadSettings;
  loaded: boolean;
  load(db: Db): Promise<void>;
  setTheme(db: Db, theme: ThemePreference): Promise<void>;
  setProviderEnabled(db: Db, id: string, enabled: boolean): Promise<void>;
  setDownloadSettings(db: Db, patch: Partial<DownloadSettings>): Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: 'system',
  disabledProviders: [],
  downloads: DEFAULT_DOWNLOAD_SETTINGS,
  loaded: false,
  async load(db) {
    const [theme, disabled, downloads] = await Promise.all([
      getKv(db, THEME_KEY),
      getKv(db, DISABLED_PROVIDERS_KEY),
      getKv(db, DOWNLOAD_SETTINGS_KEY),
    ]);
    set({
      theme: isThemePreference(theme) ? theme : 'system',
      disabledProviders: parseIds(disabled),
      downloads: parseDownloadSettings(downloads),
      loaded: true,
    });
  },
  async setTheme(db, theme) {
    await setKv(db, THEME_KEY, theme);
    set({ theme });
  },
  async setProviderEnabled(db, id, enabled) {
    const others = get().disabledProviders.filter((p) => p !== id);
    const disabledProviders = enabled ? others : [...others, id];
    await setKv(db, DISABLED_PROVIDERS_KEY, disabledProviders);
    set({ disabledProviders });
  },
  async setDownloadSettings(db, patch) {
    const downloads = parseDownloadSettings({ ...get().downloads, ...patch });
    await setKv(db, DOWNLOAD_SETTINGS_KEY, downloads);
    set({ downloads });
  },
}));
