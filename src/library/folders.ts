import type { MediaStoreAudio } from '../../modules/media-store';

export interface LibraryFolder {
  /** Volume-relative path with a trailing slash, e.g. "Music/AulosTest/". */
  path: string;
  trackCount: number;
}

function withSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

/** An excluded folder also excludes everything below it. */
export function isFolderExcluded(folder: string | null, excluded: readonly string[]): boolean {
  if (folder === null) return false;
  const path = withSlash(folder);
  return excluded.some((e) => path.startsWith(withSlash(e)));
}

/** Distinct folders that hold music, with their track counts, sorted by path. */
export function listFolders(audio: readonly MediaStoreAudio[]): LibraryFolder[] {
  const counts = new Map<string, number>();
  for (const a of audio) {
    if (a.folder === null) continue;
    const path = withSlash(a.folder);
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts]
    .map(([path, trackCount]) => ({ path, trackCount }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function parseExcludedFolders(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0).map(withSlash);
}
