import type { Migration } from '../migrate';

/**
 * Sources and downloads (M2).
 * - http_cache: provider responses with a TTL, keyed by provider and normalised request.
 * - tracks: licence URL and attribution of remote tracks.
 * - downloads: rebuilt for the M2 state machine (queued, downloading, paused, completed,
 *   failed) with the chosen format and the app-private file name. Nothing wrote to the M0
 *   table, so it is replaced rather than copied.
 * - albums and artists views: only tracks with a playable file on the device (local files and
 *   completed downloads), so the library works offline; remote tracks that were only queued,
 *   saved or favourited stay out of the browse views.
 */
export const migration005: Migration = {
  version: 5,
  name: 'sources_downloads',
  sql: `
CREATE TABLE http_cache (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL CHECK (json_valid(body)),
  fetched_at INTEGER NOT NULL,
  ttl_s INTEGER NOT NULL
) WITHOUT ROWID;

ALTER TABLE tracks ADD COLUMN license_url TEXT;
ALTER TABLE tracks ADD COLUMN attribution TEXT;

DROP TABLE downloads;
CREATE TABLE downloads (
  track_id INTEGER PRIMARY KEY REFERENCES tracks (id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('queued', 'downloading', 'paused', 'completed', 'failed')),
  format TEXT NOT NULL CHECK (format IN ('mp3', 'flac', 'ogg')),
  file_name TEXT NOT NULL UNIQUE,
  bytes_done INTEGER NOT NULL DEFAULT 0,
  bytes_total INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX downloads_status ON downloads (status, created_at);

DROP VIEW albums;
DROP VIEW artists;

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
  WHERE album_key IS NOT NULL AND local_path IS NOT NULL
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
    WHERE album_key IS NOT NULL AND artist IS NOT NULL AND local_path IS NOT NULL
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
WHERE artist IS NOT NULL AND local_path IS NOT NULL
GROUP BY artist;
`,
};
