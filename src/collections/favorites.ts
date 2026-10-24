import type { Db } from '@/db/types';
import {
  getAlbum,
  getArtist,
  TRACK_COLUMNS,
  type Album,
  type Artist,
  type Track,
} from '@/library/queries';

export type FavoriteKind = 'track' | 'album' | 'artist';

export function trackFavoriteKey(trackId: number): string {
  return String(trackId);
}

export async function isFavorite(db: Db, kind: FavoriteKind, key: string): Promise<boolean> {
  const row = await db.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM favorites WHERE kind = ? AND key = ?',
    [kind, key],
  );
  return (row?.n ?? 0) > 0;
}

export async function setFavorite(
  db: Db,
  kind: FavoriteKind,
  key: string,
  favorite: boolean,
  now = Date.now(),
): Promise<void> {
  if (favorite) {
    await db.run(
      'INSERT INTO favorites (kind, key, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
      [kind, key, now],
    );
  } else {
    await db.run('DELETE FROM favorites WHERE kind = ? AND key = ?', [kind, key]);
  }
}

async function favoriteKeys(db: Db, kind: FavoriteKind): Promise<string[]> {
  const rows = await db.getAll<{ key: string }>(
    'SELECT key FROM favorites WHERE kind = ? ORDER BY added_at DESC, key',
    [kind],
  );
  return rows.map((r) => r.key);
}

/** Newest favorite first. */
export function favoriteTracks(db: Db): Promise<Track[]> {
  return db.getAll<Track>(
    `SELECT ${TRACK_COLUMNS} FROM favorites f JOIN tracks t ON f.key = CAST(t.id AS TEXT)
      WHERE f.kind = 'track' ORDER BY f.added_at DESC, t.id`,
  );
}

/** Albums and artists that left the library are skipped, not deleted: they return on rescan. */
export async function favoriteAlbums(db: Db): Promise<Album[]> {
  const albums: Album[] = [];
  for (const key of await favoriteKeys(db, 'album')) {
    const album = await getAlbum(db, key);
    if (album) albums.push(album);
  }
  return albums;
}

export async function favoriteArtists(db: Db): Promise<Artist[]> {
  const artists: Artist[] = [];
  for (const key of await favoriteKeys(db, 'artist')) {
    const artist = await getArtist(db, key);
    if (artist) artists.push(artist);
  }
  return artists;
}

export interface AlbumKeyMove {
  from: string;
  to: string;
}

/**
 * Keeps album favorites attached when a rescan re-keys an album (new tags, or its album id
 * stored for the first time). A favorite follows the key most of the album's tracks moved to,
 * and only once no track holds the old key any more.
 */
export async function moveAlbumFavorites(db: Db, moves: readonly AlbumKeyMove[]): Promise<void> {
  const targets = new Map<string, Map<string, number>>();
  for (const { from, to } of moves) {
    const counts = targets.get(from) ?? new Map<string, number>();
    counts.set(to, (counts.get(to) ?? 0) + 1);
    targets.set(from, counts);
  }
  for (const [from, counts] of targets) {
    const favorite = await db.getFirst<{ added_at: number }>(
      `SELECT added_at FROM favorites WHERE kind = 'album' AND key = ?`,
      [from],
    );
    if (!favorite) continue;
    const remaining = await db.getFirst<{ n: number }>(
      'SELECT COUNT(*) AS n FROM tracks WHERE album_key = ?',
      [from],
    );
    if ((remaining?.n ?? 0) > 0) continue;
    const [to] = [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    await db.run(
      `INSERT INTO favorites (kind, key, added_at) VALUES ('album', ?, ?) ON CONFLICT DO NOTHING`,
      [to, favorite.added_at],
    );
    await db.run(`DELETE FROM favorites WHERE kind = 'album' AND key = ?`, [from]);
  }
}
