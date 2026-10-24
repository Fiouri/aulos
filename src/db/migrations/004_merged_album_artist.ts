import type { Migration } from '../migrate';

/**
 * Album artist display for merged albums. Since this version a scan can merge tracks of one
 * folder whose album artist tags differ (see albumGroupKeys); such an album has no single album
 * artist, so the view shows the album artist only when every track carries the same one and
 * otherwise falls back to the most frequent track artist / various rule. No table changes: the
 * stored MediaStore version is cleared so the next start rescans and re-keys the albums.
 */
export const migration004: Migration = {
  version: 4,
  name: 'merged_album_artist',
  sql: `
DROP VIEW albums;

-- The album artist when every track has the same one; otherwise the most frequent track artist
-- when it has at least half of the tracks, and marked various when none has.
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
    CASE WHEN COUNT(album_artist) = COUNT(*) AND COUNT(DISTINCT album_artist_norm) = 1
      THEN MIN(album_artist) END AS album_artist,
    CASE WHEN COUNT(album_artist) = COUNT(*) AND COUNT(DISTINCT album_artist_norm) = 1
      THEN MIN(album_artist_norm) END AS album_artist_norm,
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

DELETE FROM kv WHERE key = 'library.mediaVersion';
`,
};
