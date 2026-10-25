import { z } from 'zod';

import { addToPlaylist, createPlaylist } from '@/collections/playlists';
import type { Db } from '@/db/types';
import { UNAVAILABLE_PROVIDER } from '@/library/providers';
import { normalizeNullable, normalizeText } from '@/search/normalize';

import { matchKey, pickMatch, primaryCredit } from './match';
import { trackSchema } from './schemas';

export { UNAVAILABLE_PROVIDER };

/** Nuclear's export file: `{ version, playlist }` (packages/model/src/schemas/playlists.ts). */
const nuclearExportSchema = z.looseObject({
  version: z.number(),
  playlist: z.looseObject({
    id: z.string(),
    name: z.string(),
    items: z.array(z.looseObject({ id: z.string(), track: trackSchema })),
  }),
});

/** Nuclear's legacy duration: seconds as a number or "m:ss" / "h:mm:ss". */
function legacySeconds(value: number | string | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === undefined) return null;
  const match = value.match(/^(?:(\d+):)?(\d+):(\d\d)$|^(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const [, hh, mm, ss, plain] = match;
  if (plain !== undefined) return Number(plain);
  if (Number(mm) >= 60 || Number(ss) >= 60) return null;
  return (Number(hh) || 0) * 3600 + Number(mm) * 60 + Number(ss);
}

/** The legacy (pre-1.0) playlist file: `{ name, tracks[] }`. */
const legacyPlaylistSchema = z.looseObject({
  name: z.string(),
  tracks: z.array(
    z.looseObject({
      uuid: z.string().optional(),
      artist: z.string().optional(),
      name: z.string().optional(),
      album: z.string().optional(),
      duration: z.union([z.number(), z.string()]).optional(),
    }),
  ),
});

export interface NuclearItem {
  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  /** `source.provider:source.id`, the identity of an unavailable row. */
  ref: string;
}

export interface NuclearPlaylist {
  /** Nuclear's playlist id, or `legacy:<name>` for legacy files (they carry no id). */
  nuclearId: string;
  name: string;
  items: NuclearItem[];
}

export class NuclearPlaylistError extends Error {
  override name = 'NuclearPlaylistError';
  constructor() {
    super('This is not a Nuclear playlist file.');
  }
}

/** A Nuclear export or legacy playlist; null for anything else (e.g. an Aulos file). */
export function parseNuclearPlaylist(json: unknown): NuclearPlaylist | null {
  const exported = nuclearExportSchema.safeParse(json);
  if (exported.success) {
    const { playlist } = exported.data;
    return {
      nuclearId: playlist.id,
      name: playlist.name,
      items: playlist.items.map(({ track }) => ({
        title: track.title,
        artist: primaryCredit(track.artists),
        album: track.album?.title ?? null,
        durationMs: track.durationMs ?? null,
        ref: `${track.source.provider}:${track.source.id}`,
      })),
    };
  }
  const legacy = legacyPlaylistSchema.safeParse(json);
  if (legacy.success) {
    const { name, tracks } = legacy.data;
    return {
      nuclearId: `legacy:${name}`,
      name,
      items: tracks.map((t) => {
        const title = t.name ?? 'Unknown Track';
        const seconds = legacySeconds(t.duration);
        return {
          title,
          artist: t.artist ?? null,
          album: t.album ?? null,
          durationMs: seconds === null ? null : Math.round(seconds * 1000),
          ref: `nuclear-legacy:${t.uuid ?? matchKey(`${t.artist ?? ''} ${title}`)}`,
        };
      }),
    };
  }
  return null;
}

interface Candidate {
  id: number;
  title: string;
  artist: string | null;
  durationMs: number | null;
}

/** Tracks that play on the phone (local files and downloads), indexed by title key. */
async function libraryIndex(db: Db): Promise<Map<string, Candidate[]>> {
  const rows = await db.getAll<Candidate>(
    `SELECT id, title, artist, duration_ms AS durationMs FROM tracks
      WHERE local_path IS NOT NULL ORDER BY id`,
  );
  const index = new Map<string, Candidate[]>();
  for (const row of rows) {
    const key = matchKey(row.title);
    index.set(key, [...(index.get(key) ?? []), row]);
  }
  return index;
}

function findInLibrary(
  index: Map<string, Candidate[]>,
  item: Pick<NuclearItem, 'title' | 'artist' | 'durationMs'>,
): number | null {
  const candidates = index.get(matchKey(item.title)) ?? [];
  const result = pickMatch(item, candidates, (c) => c);
  return 'match' in result ? result.match.id : null;
}

async function unavailableTrack(tx: Db, item: NuclearItem, now: number): Promise<number> {
  await tx.run(
    `INSERT INTO tracks (provider, provider_ref, title, artist, album, duration_ms, added_at,
                         title_norm, artist_norm, album_norm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, provider_ref) DO UPDATE SET
       title = excluded.title, artist = excluded.artist, album = excluded.album,
       duration_ms = excluded.duration_ms, title_norm = excluded.title_norm,
       artist_norm = excluded.artist_norm, album_norm = excluded.album_norm`,
    [
      UNAVAILABLE_PROVIDER,
      item.ref,
      item.title,
      item.artist,
      item.album,
      item.durationMs,
      now,
      normalizeText(item.title),
      normalizeNullable(item.artist),
      normalizeNullable(item.album),
    ],
  );
  const row = await tx.getFirst<{ id: number }>(
    'SELECT id FROM tracks WHERE provider = ? AND provider_ref = ?',
    [UNAVAILABLE_PROVIDER, item.ref],
  );
  if (!row) throw new Error('Unavailable track was not stored');
  return row.id;
}

/** Points playlist rows of unavailable tracks at library tracks that now match them. */
async function upgradeUnavailable(
  tx: Db,
  index: Map<string, Candidate[]>,
  playlistId: number | null,
): Promise<number> {
  const rows = await tx.getAll<{
    playlistId: number;
    position: number;
    title: string;
    artist: string | null;
    durationMs: number | null;
  }>(
    `SELECT i.playlist_id AS playlistId, i.position, t.title, t.artist,
            t.duration_ms AS durationMs
       FROM playlist_items i JOIN tracks t ON t.id = i.track_id
      WHERE t.provider = ? ${playlistId === null ? '' : 'AND i.playlist_id = ?'}`,
    playlistId === null ? [UNAVAILABLE_PROVIDER] : [UNAVAILABLE_PROVIDER, playlistId],
  );
  let upgraded = 0;
  for (const row of rows) {
    const match = findInLibrary(index, row);
    if (match === null) continue;
    await tx.run('UPDATE playlist_items SET track_id = ? WHERE playlist_id = ? AND position = ?', [
      match,
      row.playlistId,
      row.position,
    ]);
    upgraded += 1;
  }
  return upgraded;
}

/** Unavailable rows no playlist uses any more. */
async function deleteUnusedUnavailable(tx: Db): Promise<void> {
  await tx.run(
    `DELETE FROM tracks WHERE provider = ?
       AND id NOT IN (SELECT track_id FROM playlist_items)`,
    [UNAVAILABLE_PROVIDER],
  );
}

export interface NuclearImportResult {
  playlistId: number;
  name: string;
  matched: number;
  unmatched: number;
  /** Rows appended to an existing playlist on a re-import (all rows on a first import). */
  added: number;
  reimport: boolean;
}

/**
 * Imports a Nuclear playlist. Items that match a playable phone track (normalised title and
 * primary artist, duration within 3 s when known) point at it; the rest stay in place as
 * unavailable rows. Importing a playlist id again updates that playlist additively: rows that
 * now match are upgraded, items it holds fewer times than the file are appended, and nothing
 * is removed (phone-only rows and the user's order stay).
 */
export async function importNuclearPlaylist(
  db: Db,
  playlist: NuclearPlaylist,
  fallbackName: string,
  now: number = Date.now(),
): Promise<NuclearImportResult> {
  const index = await libraryIndex(db);
  return db.transaction(async (tx) => {
    const existing = await tx.getFirst<{ id: number }>(
      'SELECT id FROM playlists WHERE nuclear_id = ?',
      [playlist.nuclearId],
    );
    if (existing) await upgradeUnavailable(tx, index, existing.id);
    let matched = 0;
    const wanted: number[] = [];
    for (const item of playlist.items) {
      const match = findInLibrary(index, item);
      if (match !== null) matched += 1;
      wanted.push(match ?? (await unavailableTrack(tx, item, now)));
    }
    const name = playlist.name.trim() || fallbackName;
    if (!existing) {
      const playlistId = await createPlaylist(tx, name, now);
      await tx.run('UPDATE playlists SET nuclear_id = ? WHERE id = ?', [
        playlist.nuclearId,
        playlistId,
      ]);
      await addToPlaylist(tx, playlistId, wanted, now);
      return {
        playlistId,
        name,
        matched,
        unmatched: wanted.length - matched,
        added: wanted.length,
        reimport: false,
      };
    }
    const held = await tx.getAll<{ trackId: number }>(
      'SELECT track_id AS trackId FROM playlist_items WHERE playlist_id = ?',
      [existing.id],
    );
    const counts = new Map<number, number>();
    for (const { trackId } of held) counts.set(trackId, (counts.get(trackId) ?? 0) + 1);
    const append: number[] = [];
    for (const trackId of wanted) {
      const have = counts.get(trackId) ?? 0;
      if (have > 0) counts.set(trackId, have - 1);
      else append.push(trackId);
    }
    await addToPlaylist(tx, existing.id, append, now);
    await deleteUnusedUnavailable(tx);
    return {
      playlistId: existing.id,
      name,
      matched,
      unmatched: wanted.length - matched,
      added: append.length,
      reimport: true,
    };
  });
}

/** After a library scan or a download: unavailable playlist rows that now match are upgraded. */
export async function rematchUnavailable(db: Db): Promise<number> {
  const index = await libraryIndex(db);
  return db.transaction(async (tx) => {
    const upgraded = await upgradeUnavailable(tx, index, null);
    await deleteUnusedUnavailable(tx);
    return upgraded;
  });
}
