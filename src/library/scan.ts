import { queryAudio, type MediaStoreAudio } from '../../modules/media-store';
import type { Db } from '@/db/types';
import { normalizeNullable, normalizeText } from '@/search/normalize';
import {
  diffLocalTracks,
  toTrackFields,
  type LocalTrackFields,
  type StoredLocalTrack,
} from './diff';
import { isFolderExcluded } from './folders';

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
  durationMs: number;
}

export interface ScanOptions {
  query?: () => Promise<MediaStoreAudio[]>;
  now?: () => number;
  /** Folders (and their subfolders) left out of the library. */
  excludedFolders?: readonly string[];
}

export const LOCAL_PROVIDER = 'local';

async function getStoredLocalTracks(db: Db): Promise<StoredLocalTrack[]> {
  return db.getAll<StoredLocalTrack>(
    `SELECT id, provider_ref AS providerRef, title, artist, album, album_artist AS albumArtist,
            track_no AS trackNo, disc_no AS discNo, duration_ms AS durationMs,
            local_path AS localPath, file_mtime AS fileMtime, file_size AS fileSize, year,
            added_at AS addedAt
       FROM tracks WHERE provider = ?`,
    [LOCAL_PROVIDER],
  );
}

/** The searchable, normalised copies of the tag columns. */
function normColumns(t: LocalTrackFields) {
  return [
    normalizeText(t.title),
    normalizeNullable(t.artist),
    normalizeNullable(t.album),
    normalizeNullable(t.albumArtist),
  ] as const;
}

/**
 * Syncs the 'local' rows of `tracks` with the MediaStore in one transaction:
 * inserts new files, updates changed ones and deletes rows whose file is gone or whose folder
 * is excluded. The caller must hold the audio read permission.
 */
export async function scanLibrary(db: Db, options: ScanOptions = {}): Promise<ScanResult> {
  const { query = queryAudio, now = Date.now, excludedFolders = [] } = options;
  const started = now();
  const scanned = (await query())
    .filter((a) => !isFolderExcluded(a.folder, excludedFolders))
    .map(toTrackFields);
  const scannedAt = now();

  const diff = await db.transaction(async (tx) => {
    const result = diffLocalTracks(await getStoredLocalTracks(tx), scanned);
    for (const t of result.toInsert) {
      await tx.run(
        `INSERT INTO tracks (provider, provider_ref, title, artist, album, album_artist, track_no,
                             disc_no, duration_ms, local_path, file_mtime, file_size, year, added_at,
                             title_norm, artist_norm, album_norm, album_artist_norm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          LOCAL_PROVIDER,
          t.providerRef,
          t.title,
          t.artist,
          t.album,
          t.albumArtist,
          t.trackNo,
          t.discNo,
          t.durationMs,
          t.localPath,
          t.fileMtime,
          t.fileSize,
          t.year,
          t.addedAt ?? scannedAt,
          ...normColumns(t),
        ],
      );
    }
    for (const t of result.toUpdate) {
      await tx.run(
        `UPDATE tracks SET title = ?, artist = ?, album = ?, album_artist = ?, track_no = ?,
                           disc_no = ?, duration_ms = ?, local_path = ?, file_mtime = ?,
                           file_size = ?, year = ?, title_norm = ?, artist_norm = ?,
                           album_norm = ?, album_artist_norm = ?
          WHERE id = ?`,
        [
          t.title,
          t.artist,
          t.album,
          t.albumArtist,
          t.trackNo,
          t.discNo,
          t.durationMs,
          t.localPath,
          t.fileMtime,
          t.fileSize,
          t.year,
          ...normColumns(t),
          t.id,
        ],
      );
    }
    for (const id of result.toDelete) {
      await tx.run('DELETE FROM tracks WHERE id = ?', [id]);
    }
    return result;
  });

  return {
    added: diff.toInsert.length,
    updated: diff.toUpdate.length,
    removed: diff.toDelete.length,
    total: diff.total,
    durationMs: now() - started,
  };
}

export async function countLocalTracks(db: Db): Promise<number> {
  const row = await db.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM tracks WHERE provider = ?',
    [LOCAL_PROVIDER],
  );
  return row?.n ?? 0;
}
