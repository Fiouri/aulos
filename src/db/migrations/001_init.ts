import type { Migration } from '../migrate';

export const migration001: Migration = {
  version: 1,
  name: 'init',
  sql: `
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  album_artist TEXT,
  track_no INTEGER,
  disc_no INTEGER,
  duration_ms INTEGER,
  artwork_uri TEXT,
  local_path TEXT,
  file_mtime INTEGER,
  file_size INTEGER
);

CREATE UNIQUE INDEX tracks_provider_ref ON tracks (provider, provider_ref);

CREATE VIRTUAL TABLE tracks_fts USING fts5 (
  title,
  artist,
  album,
  content = 'tracks',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER tracks_fts_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts (rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;

CREATE TRIGGER tracks_fts_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts (tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
END;

CREATE TRIGGER tracks_fts_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts (tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
  INSERT INTO tracks_fts (rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;

CREATE VIEW albums AS
SELECT
  album AS name,
  COALESCE(album_artist, artist) AS artist,
  COUNT(*) AS track_count,
  SUM(duration_ms) AS duration_ms,
  MIN(artwork_uri) AS artwork_uri
FROM tracks
WHERE album IS NOT NULL
GROUP BY album, COALESCE(album_artist, artist);

CREATE VIEW artists AS
SELECT
  artist AS name,
  COUNT(*) AS track_count,
  COUNT(DISTINCT album) AS album_count
FROM tracks
WHERE artist IS NOT NULL
GROUP BY artist;

CREATE TABLE playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  nuclear_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE playlist_items (
  playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  track_id INTEGER NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  PRIMARY KEY (playlist_id, position)
) WITHOUT ROWID;

CREATE INDEX playlist_items_track ON playlist_items (track_id);

CREATE TABLE favorites (
  kind TEXT NOT NULL CHECK (kind IN ('track', 'album', 'artist')),
  key TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
) WITHOUT ROWID;

CREATE TABLE downloads (
  track_id INTEGER PRIMARY KEY REFERENCES tracks (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'downloading', 'paused', 'done', 'failed')),
  bytes_done INTEGER NOT NULL DEFAULT 0,
  bytes_total INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE history (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  played_at INTEGER NOT NULL,
  ms_played INTEGER NOT NULL
);

CREATE INDEX history_played_at ON history (played_at);
CREATE INDEX history_track ON history (track_id);

CREATE TABLE pairings (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL UNIQUE,
  last_seen_at INTEGER
);

CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
) WITHOUT ROWID;
`,
};
