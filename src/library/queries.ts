import type { Db, SqlParams } from '@/db/types';

/** A playable row of `tracks`, shaped for the UI and the player. */
export interface Track {
  id: number;
  provider: string;
  providerRef: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  trackNo: number | null;
  discNo: number | null;
  durationMs: number | null;
  localPath: string | null;
  year: number | null;
  addedAt: number | null;
  /** Null when the track has no album tag. */
  albumKey: string | null;
}

export interface Album {
  /** tracks.album_key: the album's identity in routes, favorites and the artwork cache. */
  key: string;
  name: string;
  /**
   * Album artist; without that tag, the track artist holding at least half of the tracks.
   * Null when unknown or when the album is various artists.
   */
  artist: string | null;
  /** 1 when no single track artist holds half of an album without album artist. */
  various: 0 | 1;
  trackCount: number;
  durationMs: number | null;
  year: number | null;
  /** One track of the album, used to load its artwork. */
  samplePath: string | null;
}

export interface Artist {
  name: string;
  trackCount: number;
  albumCount: number;
  samplePath: string | null;
}

export const SONG_SORTS = ['title', 'artist', 'added'] as const;
export type SongSort = (typeof SONG_SORTS)[number];

export const ALBUM_SORTS = ['name', 'artist', 'year'] as const;
export type AlbumSort = (typeof ALBUM_SORTS)[number];

export const TRACK_COLUMNS = `t.id, t.provider, t.provider_ref AS providerRef, t.title, t.artist,
  t.album, t.album_artist AS albumArtist, t.track_no AS trackNo, t.disc_no AS discNo,
  t.duration_ms AS durationMs, t.local_path AS localPath, t.year, t.added_at AS addedAt,
  t.album_key AS albumKey`;

export const ALBUM_COLUMNS = `a.key, a.name, a.artist, a.various, a.track_count AS trackCount, a.duration_ms AS durationMs,
  a.year, a.sample_path AS samplePath`;

const ARTIST_COLUMNS = `ar.name, ar.track_count AS trackCount, ar.album_count AS albumCount,
  ar.sample_path AS samplePath`;

/** Disc, then track number; untagged tracks last, by title. */
const ALBUM_ORDER = `COALESCE(t.disc_no, 1), t.track_no IS NULL, t.track_no, t.title_norm`;

const SONG_ORDER: Record<SongSort, string> = {
  title: 't.title_norm, t.artist_norm NULLS LAST, t.id',
  artist: `t.artist_norm NULLS LAST, t.album_norm NULLS LAST, ${ALBUM_ORDER}, t.id`,
  added: 't.added_at DESC NULLS LAST, t.title_norm, t.id',
};

const ALBUM_ORDER_BY: Record<AlbumSort, string> = {
  name: 'a.name_norm, a.artist_norm NULLS LAST',
  artist: 'a.artist_norm NULLS LAST, a.name_norm',
  year: 'a.year DESC NULLS LAST, a.name_norm',
};

export function listSongs(db: Db, sort: SongSort): Promise<Track[]> {
  return db.getAll<Track>(`SELECT ${TRACK_COLUMNS} FROM tracks t ORDER BY ${SONG_ORDER[sort]}`);
}

export function listAlbums(db: Db, sort: AlbumSort): Promise<Album[]> {
  return db.getAll<Album>(`SELECT ${ALBUM_COLUMNS} FROM albums a ORDER BY ${ALBUM_ORDER_BY[sort]}`);
}

/** Year sorting is only offered when at least one album carries a year tag. */
export async function hasAlbumYears(db: Db): Promise<boolean> {
  const row = await db.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM tracks WHERE year IS NOT NULL AND album IS NOT NULL',
  );
  return (row?.n ?? 0) > 0;
}

export function listArtists(db: Db): Promise<Artist[]> {
  return db.getAll<Artist>(`SELECT ${ARTIST_COLUMNS} FROM artists ar ORDER BY ar.name_norm`);
}

export function getAlbum(db: Db, key: string): Promise<Album | null> {
  return db.getFirst<Album>(`SELECT ${ALBUM_COLUMNS} FROM albums a WHERE a.key = ?`, [key]);
}

export function albumTracks(db: Db, key: string): Promise<Track[]> {
  return db.getAll<Track>(
    `SELECT ${TRACK_COLUMNS} FROM tracks t WHERE t.album_key = ? ORDER BY ${ALBUM_ORDER}, t.id`,
    [key],
  );
}

export function getArtist(db: Db, name: string): Promise<Artist | null> {
  return db.getFirst<Artist>(`SELECT ${ARTIST_COLUMNS} FROM artists ar WHERE ar.name = ?`, [name]);
}

/** Albums holding at least one track by the artist, newest first. */
export function artistAlbums(db: Db, artist: string): Promise<Album[]> {
  return db.getAll<Album>(
    `SELECT ${ALBUM_COLUMNS} FROM albums a
      WHERE a.key IN (SELECT album_key FROM tracks WHERE artist = ? AND album_key IS NOT NULL)
      ORDER BY a.year DESC NULLS LAST, a.name_norm`,
    [artist],
  );
}

export function artistTracks(db: Db, artist: string): Promise<Track[]> {
  return db.getAll<Track>(
    `SELECT ${TRACK_COLUMNS} FROM tracks t WHERE t.artist = ?
      ORDER BY t.album_norm NULLS LAST, ${ALBUM_ORDER}, t.id`,
    [artist],
  );
}

/** Tracks by id, in the order of `ids`; ids without a row are skipped. */
export async function getTracks(db: Db, ids: readonly number[]): Promise<Track[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const rows: Track[] = [];
  // Stay well under SQLite's bound-parameter limit.
  for (let i = 0; i < unique.length; i += 500) {
    const chunk: SqlParams = unique.slice(i, i + 500);
    rows.push(
      ...(await db.getAll<Track>(
        `SELECT ${TRACK_COLUMNS} FROM tracks t WHERE t.id IN (${chunk.map(() => '?').join(',')})`,
        chunk,
      )),
    );
  }
  const byId = new Map(rows.map((t) => [t.id, t]));
  return ids.flatMap((id) => {
    const track = byId.get(id);
    return track ? [track] : [];
  });
}
