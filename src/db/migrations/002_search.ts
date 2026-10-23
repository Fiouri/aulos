import { normalizeNullable, normalizeText } from '@/search/normalize';

import type { Migration } from '../migrate';
import type { Db } from '../types';

const FTS_COLUMNS = 'title_norm, artist_norm, album_norm, album_artist_norm';
const NEW_FTS_VALUES = 'new.title_norm, new.artist_norm, new.album_norm, new.album_artist_norm';
const OLD_FTS_VALUES = 'old.title_norm, old.artist_norm, old.album_norm, old.album_artist_norm';

/** Created after the backfill so the triggers never see the empty pre-backfill values. */
const CREATE_FTS = `
CREATE VIRTUAL TABLE tracks_fts USING fts5 (
  ${FTS_COLUMNS},
  content = 'tracks',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER tracks_fts_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts (rowid, ${FTS_COLUMNS}) VALUES (new.id, ${NEW_FTS_VALUES});
END;

CREATE TRIGGER tracks_fts_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts (tracks_fts, rowid, ${FTS_COLUMNS})
  VALUES ('delete', old.id, ${OLD_FTS_VALUES});
END;

CREATE TRIGGER tracks_fts_au AFTER UPDATE OF ${FTS_COLUMNS} ON tracks BEGIN
  INSERT INTO tracks_fts (tracks_fts, rowid, ${FTS_COLUMNS})
  VALUES ('delete', old.id, ${OLD_FTS_VALUES});
  INSERT INTO tracks_fts (rowid, ${FTS_COLUMNS}) VALUES (new.id, ${NEW_FTS_VALUES});
END;

INSERT INTO tracks_fts (tracks_fts) VALUES ('rebuild');
`;

interface BackfillRow {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
}

async function backfill(tx: Db): Promise<void> {
  const rows = await tx.getAll<BackfillRow>(
    'SELECT id, title, artist, album, album_artist FROM tracks',
  );
  for (const row of rows) {
    await tx.run(
      `UPDATE tracks SET title_norm = ?, artist_norm = ?, album_norm = ?, album_artist_norm = ?
        WHERE id = ?`,
      [
        normalizeText(row.title),
        normalizeNullable(row.artist),
        normalizeNullable(row.album),
        normalizeNullable(row.album_artist),
        row.id,
      ],
    );
  }
  await tx.exec(CREATE_FTS);
}

/**
 * Accent-insensitive search (Greek tonos, dialytika and final sigma included): normalised
 * columns written by TypeScript, FTS5 rebuilt over them. Also adds year and added_at for
 * browse sorting and widens the albums/artists views for the browse screens.
 */
export const migration002: Migration = {
  version: 2,
  name: 'search',
  sql: `
DROP TRIGGER tracks_fts_ai;
DROP TRIGGER tracks_fts_ad;
DROP TRIGGER tracks_fts_au;
DROP TABLE tracks_fts;
DROP VIEW albums;
DROP VIEW artists;

ALTER TABLE tracks ADD COLUMN title_norm TEXT NOT NULL DEFAULT '';
ALTER TABLE tracks ADD COLUMN artist_norm TEXT;
ALTER TABLE tracks ADD COLUMN album_norm TEXT;
ALTER TABLE tracks ADD COLUMN album_artist_norm TEXT;
ALTER TABLE tracks ADD COLUMN year INTEGER;
ALTER TABLE tracks ADD COLUMN added_at INTEGER;

UPDATE tracks SET added_at = COALESCE(file_mtime, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE INDEX tracks_album ON tracks (album, album_artist);
CREATE INDEX tracks_artist ON tracks (artist);

CREATE VIEW albums AS
SELECT
  album AS name,
  COALESCE(album_artist, artist) AS artist,
  MIN(album_norm) AS name_norm,
  MIN(COALESCE(album_artist_norm, artist_norm)) AS artist_norm,
  COUNT(*) AS track_count,
  SUM(duration_ms) AS duration_ms,
  MIN(artwork_uri) AS artwork_uri,
  MAX(year) AS year,
  MAX(added_at) AS added_at,
  MIN(local_path) AS sample_path
FROM tracks
WHERE album IS NOT NULL
GROUP BY album, COALESCE(album_artist, artist);

CREATE VIEW artists AS
SELECT
  artist AS name,
  MIN(artist_norm) AS name_norm,
  COUNT(*) AS track_count,
  COUNT(DISTINCT album) AS album_count,
  MIN(local_path) AS sample_path
FROM tracks
WHERE artist IS NOT NULL
GROUP BY artist;
`,
  up: backfill,
};
