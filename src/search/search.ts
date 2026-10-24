import { listPlaylists, type Playlist } from '@/collections/playlists';
import type { Db, SqlParams } from '@/db/types';
import {
  ALBUM_COLUMNS,
  TRACK_COLUMNS,
  type Album,
  type Artist,
  type Track,
} from '@/library/queries';

import { ftsQuery, normalizeText, searchTokens } from './normalize';

export interface SearchResults {
  songs: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

export const EMPTY_RESULTS: SearchResults = { songs: [], albums: [], artists: [], playlists: [] };

/** `instr(column, ?) > 0` for every token: each token must appear somewhere in the column. */
function containsAll(column: string, tokens: readonly string[]): string {
  return tokens.map(() => `instr(${column}, ?) > 0`).join(' AND ');
}

export function searchSongs(db: Db, query: string, limit: number): Promise<Track[]> {
  const match = ftsQuery(query);
  if (match === null) return Promise.resolve([]);
  return db.getAll<Track>(
    `SELECT ${TRACK_COLUMNS} FROM tracks_fts f JOIN tracks t ON t.id = f.rowid
      WHERE tracks_fts MATCH ? ORDER BY f.rank, t.title_norm LIMIT ?`,
    [match, limit],
  );
}

/** Albums whose name or artist contain every token. */
export function searchAlbums(db: Db, query: string, limit: number): Promise<Album[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return Promise.resolve([]);
  const params: SqlParams = [...tokens, limit];
  return db.getAll<Album>(
    `SELECT ${ALBUM_COLUMNS}
       FROM albums a
      WHERE ${containsAll(`(a.name_norm || ' ' || COALESCE(a.artist_norm, ''))`, tokens)}
      ORDER BY a.name_norm LIMIT ?`,
    params,
  );
}

export function searchArtists(db: Db, query: string, limit: number): Promise<Artist[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return Promise.resolve([]);
  const params: SqlParams = [...tokens, limit];
  return db.getAll<Artist>(
    `SELECT ar.name, ar.track_count AS trackCount, ar.album_count AS albumCount,
            ar.sample_path AS samplePath
       FROM artists ar
      WHERE ${containsAll('ar.name_norm', tokens)}
      ORDER BY ar.name_norm LIMIT ?`,
    params,
  );
}

/** Playlists are few and user-named, so they are filtered in memory with the same folding. */
export async function searchPlaylists(db: Db, query: string, limit: number): Promise<Playlist[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const playlists = await listPlaylists(db);
  return playlists
    .filter((p) => {
      const name = normalizeText(p.name);
      return tokens.every((token) => name.includes(token));
    })
    .slice(0, limit);
}

/** Instant offline search over the whole library, grouped by kind. */
export async function searchLibrary(db: Db, query: string, limit = 50): Promise<SearchResults> {
  const [songs, albums, artists, playlists] = await Promise.all([
    searchSongs(db, query, limit),
    searchAlbums(db, query, limit),
    searchArtists(db, query, limit),
    searchPlaylists(db, query, limit),
  ]);
  return { songs, albums, artists, playlists };
}
