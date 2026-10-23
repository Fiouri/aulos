import { queryAudio, type MediaStoreAudio } from '../../modules/media-store';
import type { Db } from '@/db/types';
import { diffLocalTracks, toTrackFields, type StoredLocalTrack } from './diff';

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
  durationMs: number;
}

const LOCAL = 'local';

async function getStoredLocalTracks(db: Db): Promise<StoredLocalTrack[]> {
  return db.getAll<StoredLocalTrack>(
    `SELECT id, provider_ref AS providerRef, title, artist, album, album_artist AS albumArtist,
            track_no AS trackNo, disc_no AS discNo, duration_ms AS durationMs,
            local_path AS localPath, file_mtime AS fileMtime, file_size AS fileSize
       FROM tracks WHERE provider = ?`,
    [LOCAL],
  );
}

/**
 * Syncs the 'local' rows of `tracks` with the MediaStore in one transaction:
 * inserts new files, updates changed ones and deletes rows whose file is gone.
 * The caller must hold the audio read permission.
 */
export async function scanLibrary(
  db: Db,
  query: () => Promise<MediaStoreAudio[]> = queryAudio,
  now: () => number = Date.now,
): Promise<ScanResult> {
  const started = now();
  const scanned = (await query()).map(toTrackFields);

  const diff = await db.transaction(async (tx) => {
    const result = diffLocalTracks(await getStoredLocalTracks(tx), scanned);
    for (const t of result.toInsert) {
      await tx.run(
        `INSERT INTO tracks (provider, provider_ref, title, artist, album, album_artist, track_no,
                             disc_no, duration_ms, local_path, file_mtime, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          LOCAL,
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
        ],
      );
    }
    for (const t of result.toUpdate) {
      await tx.run(
        `UPDATE tracks SET title = ?, artist = ?, album = ?, album_artist = ?, track_no = ?,
                           disc_no = ?, duration_ms = ?, local_path = ?, file_mtime = ?, file_size = ?
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
    [LOCAL],
  );
  return row?.n ?? 0;
}
