import { albumGroupKey } from '@/library/albumKey';

import type { Migration } from '../migrate';
import type { Db } from '../types';

interface KeyRow {
  id: number;
  provider: string;
  album: string | null;
  album_artist: string | null;
  album_ref: string | null;
}

interface FavoriteRow {
  key: string;
  added_at: number;
}

/** Album favorites written before this migration: JSON `[name, albumArtistOrArtist]`. */
function parseLegacyAlbumKey(key: string): [string, string | null] | null {
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [name, artist] = value as unknown[];
    if (typeof name !== 'string' || (artist !== null && typeof artist !== 'string')) return null;
    return [name, artist];
  } catch {
    return null;
  }
}

/**
 * Keys every album track, then points legacy album favorites at the new key of their tracks.
 * Favorites already holding a current key are left alone, so running it again changes nothing.
 * The folder is not stored, so a local track without album artist gets a provisional key here;
 * the rescan forced by clearing the media version stores its MediaStore album id and final key.
 */
async function backfill(tx: Db): Promise<void> {
  const rows = await tx.getAll<KeyRow>(
    'SELECT id, provider, album, album_artist, album_ref FROM tracks',
  );
  for (const row of rows) {
    const key = albumGroupKey({
      provider: row.provider,
      album: row.album,
      albumArtist: row.album_artist,
      albumRef: row.album_ref,
      folder: null,
    });
    await tx.run('UPDATE tracks SET album_key = ? WHERE id = ?', [key, row.id]);
  }

  const favorites = await tx.getAll<FavoriteRow>(
    `SELECT key, added_at FROM favorites
      WHERE kind = 'album' AND key NOT IN (SELECT album_key FROM tracks WHERE album_key IS NOT NULL)`,
  );
  for (const favorite of favorites) {
    const legacy = parseLegacyAlbumKey(favorite.key);
    if (!legacy) continue;
    const match = await tx.getFirst<{ album_key: string }>(
      `SELECT album_key FROM tracks
        WHERE album = ? AND COALESCE(album_artist, artist) IS ? AND album_key IS NOT NULL
        GROUP BY album_key ORDER BY COUNT(*) DESC, album_key LIMIT 1`,
      legacy,
    );
    if (!match) continue;
    await tx.run(
      `INSERT INTO favorites (kind, key, added_at) VALUES ('album', ?, ?) ON CONFLICT DO NOTHING`,
      [match.album_key, favorite.added_at],
    );
    await tx.run(`DELETE FROM favorites WHERE kind = 'album' AND key = ?`, [favorite.key]);
  }
}

/**
 * Album grouping by a stored album key (see albumGroupKey) instead of album name plus
 * album-artist-or-artist, which split albums with featured artists. Adds the provider's album
 * reference (MediaStore ALBUM_ID for local tracks) and the key, rebuilds the albums and artists
 * views over the key, and clears the stored MediaStore version so the next start rescans and
 * backfills album_ref.
 */
export const migration003: Migration = {
  version: 3,
  name: 'album_grouping',
  sql: `
DROP VIEW albums;
DROP VIEW artists;
DROP INDEX tracks_album;

ALTER TABLE tracks ADD COLUMN album_ref TEXT;
ALTER TABLE tracks ADD COLUMN album_key TEXT;

CREATE INDEX tracks_album_key ON tracks (album_key);

-- An album without album artist shows its most frequent track artist when that artist has at
-- least half of the tracks, and is marked various otherwise.
CREATE VIEW albums AS
SELECT
  g.key,
  g.name,
  g.name_norm,
  CASE
    WHEN g.album_artist IS NOT NULL THEN g.album_artist
    WHEN top.n * 2 >= g.track_count THEN top.artist
  END AS artist,
  CASE
    WHEN g.album_artist IS NOT NULL THEN g.album_artist_norm
    WHEN top.n * 2 >= g.track_count THEN top.artist_norm
  END AS artist_norm,
  g.album_artist IS NULL AND top.n IS NOT NULL AND top.n * 2 < g.track_count AS various,
  g.track_count,
  g.duration_ms,
  g.artwork_uri,
  g.year,
  g.added_at,
  g.sample_path
FROM (
  SELECT
    album_key AS key,
    MIN(album) AS name,
    MIN(album_norm) AS name_norm,
    MIN(album_artist) AS album_artist,
    MIN(album_artist_norm) AS album_artist_norm,
    COUNT(*) AS track_count,
    SUM(duration_ms) AS duration_ms,
    MIN(artwork_uri) AS artwork_uri,
    MAX(year) AS year,
    MAX(added_at) AS added_at,
    MIN(local_path) AS sample_path
  FROM tracks
  WHERE album_key IS NOT NULL
  GROUP BY album_key
) g
LEFT JOIN (
  SELECT album_key, artist, artist_norm, n
  FROM (
    SELECT
      album_key,
      artist,
      MIN(artist_norm) AS artist_norm,
      COUNT(*) AS n,
      ROW_NUMBER() OVER (
        PARTITION BY album_key ORDER BY COUNT(*) DESC, MIN(artist_norm), artist
      ) AS rank
    FROM tracks
    WHERE album_key IS NOT NULL AND artist IS NOT NULL
    GROUP BY album_key, artist
  )
  WHERE rank = 1
) top ON top.album_key = g.key;

CREATE VIEW artists AS
SELECT
  artist AS name,
  MIN(artist_norm) AS name_norm,
  COUNT(*) AS track_count,
  COUNT(DISTINCT album_key) AS album_count,
  MIN(local_path) AS sample_path
FROM tracks
WHERE artist IS NOT NULL
GROUP BY artist;

DELETE FROM kv WHERE key = 'library.mediaVersion';
`,
  up: backfill,
};
