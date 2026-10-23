import type { Db } from '@/db/types';
import type { Track } from '@/library/queries';
import { normalizeNullable, normalizeText } from '@/search/normalize';

import { addToPlaylist, createPlaylist } from './playlists';

export const PLAYLIST_FILE_FORMAT = 'aulos.playlist';
export const PLAYLIST_FILE_VERSION = 1;
/** Imported tracks match a library track whose duration is within this many milliseconds. */
export const DURATION_TOLERANCE_MS = 2000;

export interface PlaylistFileTrack {
  provider: string;
  provider_ref: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
}

export interface PlaylistFile {
  format: typeof PLAYLIST_FILE_FORMAT;
  version: typeof PLAYLIST_FILE_VERSION;
  name: string;
  exportedAt: string;
  tracks: PlaylistFileTrack[];
}

export class PlaylistFileError extends Error {
  override name = 'PlaylistFileError';
}

export function buildPlaylistFile(
  name: string,
  tracks: readonly Track[],
  now = Date.now(),
): PlaylistFile {
  return {
    format: PLAYLIST_FILE_FORMAT,
    version: PLAYLIST_FILE_VERSION,
    name,
    exportedAt: new Date(now).toISOString(),
    tracks: tracks.map((t) => ({
      provider: t.provider,
      provider_ref: t.providerRef,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration_ms: t.durationMs,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const optionalString = (v: unknown): v is string | null => v === null || typeof v === 'string';

function parseTrack(value: unknown, index: number): PlaylistFileTrack {
  if (
    !isRecord(value) ||
    typeof value.provider !== 'string' ||
    typeof value.provider_ref !== 'string' ||
    typeof value.title !== 'string' ||
    !optionalString(value.artist ?? null) ||
    !optionalString(value.album ?? null) ||
    !(value.duration_ms == null || typeof value.duration_ms === 'number')
  ) {
    throw new PlaylistFileError(`Track ${index + 1} is not valid.`);
  }
  return {
    provider: value.provider,
    provider_ref: value.provider_ref,
    title: value.title,
    artist: (value.artist as string | null | undefined) ?? null,
    album: (value.album as string | null | undefined) ?? null,
    duration_ms: (value.duration_ms as number | null | undefined) ?? null,
  };
}

/** Validates a decoded JSON document; throws PlaylistFileError with a readable reason. */
export function parsePlaylistFile(value: unknown): PlaylistFile {
  if (!isRecord(value) || value.format !== PLAYLIST_FILE_FORMAT) {
    throw new PlaylistFileError('This is not an Aulos playlist file.');
  }
  if (value.version !== PLAYLIST_FILE_VERSION) {
    throw new PlaylistFileError(`Unsupported playlist file version: ${String(value.version)}.`);
  }
  if (typeof value.name !== 'string' || !Array.isArray(value.tracks)) {
    throw new PlaylistFileError('The playlist file is incomplete.');
  }
  return {
    format: PLAYLIST_FILE_FORMAT,
    version: PLAYLIST_FILE_VERSION,
    name: value.name,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    tracks: value.tracks.map(parseTrack),
  };
}

/** What the matcher needs to know about each library track. */
export interface MatchCandidate {
  id: number;
  provider: string;
  providerRef: string;
  titleNorm: string;
  artistNorm: string | null;
  durationMs: number | null;
}

export interface MatchResult {
  /** Matched library track ids, in file order. */
  trackIds: number[];
  unmatched: PlaylistFileTrack[];
}

const refKey = (provider: string, ref: string) => `${provider}\u0000${ref}`;
const tagKey = (title: string, artist: string | null) => `${title}\u0000${artist ?? ''}`;

function durationFits(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true;
  return Math.abs(a - b) <= DURATION_TOLERANCE_MS;
}

/**
 * Re-matches file tracks against the library: first by (provider, provider_ref), then by
 * normalised title + artist with the duration within ±2 s (closest duration wins).
 * A ref match also needs the same normalised title, because local refs are MediaStore ids that
 * mean a different file on another phone.
 */
export function matchTracks(
  entries: readonly PlaylistFileTrack[],
  candidates: readonly MatchCandidate[],
): MatchResult {
  const byRef = new Map<string, MatchCandidate>();
  const byTags = new Map<string, MatchCandidate[]>();
  for (const c of candidates) {
    byRef.set(refKey(c.provider, c.providerRef), c);
    const key = tagKey(c.titleNorm, c.artistNorm);
    byTags.set(key, [...(byTags.get(key) ?? []), c]);
  }

  const trackIds: number[] = [];
  const unmatched: PlaylistFileTrack[] = [];
  for (const entry of entries) {
    const title = normalizeText(entry.title);
    const artist = normalizeNullable(entry.artist);
    const byRefHit = byRef.get(refKey(entry.provider, entry.provider_ref));
    if (byRefHit && byRefHit.titleNorm === title) {
      trackIds.push(byRefHit.id);
      continue;
    }
    const best = (byTags.get(tagKey(title, artist)) ?? [])
      .filter((c) => durationFits(c.durationMs, entry.duration_ms))
      .sort(
        (a, b) =>
          Math.abs((a.durationMs ?? 0) - (entry.duration_ms ?? 0)) -
          Math.abs((b.durationMs ?? 0) - (entry.duration_ms ?? 0)),
      )[0];
    if (best) trackIds.push(best.id);
    else unmatched.push(entry);
  }
  return { trackIds, unmatched };
}

export function loadMatchCandidates(db: Db): Promise<MatchCandidate[]> {
  return db.getAll<MatchCandidate>(
    `SELECT id, provider, provider_ref AS providerRef, title_norm AS titleNorm,
            artist_norm AS artistNorm, duration_ms AS durationMs
       FROM tracks`,
  );
}

export interface ImportResult {
  playlistId: number;
  matched: number;
  unmatched: number;
}

/**
 * Creates a new playlist from the file with every track that matched the library.
 * `fallbackName` is used when the file's name is blank.
 */
export async function importPlaylistFile(
  db: Db,
  file: PlaylistFile,
  fallbackName: string,
  now = Date.now(),
): Promise<ImportResult> {
  const { trackIds, unmatched } = matchTracks(file.tracks, await loadMatchCandidates(db));
  return db.transaction(async (tx) => {
    const name = file.name.trim().length > 0 ? file.name : fallbackName;
    const playlistId = await createPlaylist(tx, name, now);
    await addToPlaylist(tx, playlistId, trackIds, now);
    return { playlistId, matched: trackIds.length, unmatched: unmatched.length };
  });
}
