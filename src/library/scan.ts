import { queryAudio, type MediaStoreAudio } from '../../modules/media-store';
import { moveAlbumFavorites } from '@/collections/favorites';
import type { Db } from '@/db/types';
import { normalizeNullable, normalizeText } from '@/search/normalize';
import {
  diffLocalTracks,
  toGroupedFields,
  toTrackFields,
  type LocalTrackFields,
  type StoredLocalTrack,
} from './diff';
import { albumGroupKeys } from './albumKey';
import { isFolderExcluded } from './folders';
import { LOCAL_PROVIDER } from './providers';

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

async function getStoredLocalTracks(db: Db): Promise<StoredLocalTrack[]> {
  return db.getAll<StoredLocalTrack>(
    `SELECT id, provider_ref AS providerRef, title, artist, album, album_artist AS albumArtist,
            track_no AS trackNo, disc_no AS discNo, duration_ms AS durationMs,
            local_path AS localPath, file_mtime AS fileMtime, file_size AS fileSize, year,
            album_ref AS albumRef, album_key AS albumKey, added_at AS addedAt
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
  const audio = (await query()).filter((a) => !isFolderExcluded(a.folder, excludedFolders));
  const albumKeys = albumGroupKeys(audio.map(toGroupedFields));
  const scanned = audio.map((a, i) => toTrackFields(a, albumKeys[i] ?? null));
  const scannedAt = now();

  const diff = await db.transaction(async (tx) => {
    const stored = await getStoredLocalTracks(tx);
    const result = diffLocalTracks(stored, scanned);
    for (const t of result.toInsert) {
      await tx.run(
        `INSERT INTO tracks (provider, provider_ref, title, artist, album, album_artist, track_no,
                             disc_no, duration_ms, local_path, file_mtime, file_size, year, added_at,
                             album_ref, album_key, title_norm, artist_norm, album_norm,
                             album_artist_norm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          t.albumRef,
          t.albumKey,
          ...normColumns(t),
        ],
      );
    }
    for (const t of result.toUpdate) {
      await tx.run(
        `UPDATE tracks SET title = ?, artist = ?, album = ?, album_artist = ?, track_no = ?,
                           disc_no = ?, duration_ms = ?, local_path = ?, file_mtime = ?,
                           file_size = ?, year = ?, album_ref = ?, album_key = ?,
                           title_norm = ?, artist_norm = ?, album_norm = ?, album_artist_norm = ?
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
          t.albumRef,
          t.albumKey,
          ...normColumns(t),
          t.id,
        ],
      );
    }
    for (const id of result.toDelete) {
      await tx.run('DELETE FROM tracks WHERE id = ?', [id]);
    }
    const oldKeys = new Map(stored.map((t) => [t.id, t.albumKey]));
    await moveAlbumFavorites(
      tx,
      result.toUpdate.flatMap((t) => {
        const from = oldKeys.get(t.id);
        return from && t.albumKey && from !== t.albumKey ? [{ from, to: t.albumKey }] : [];
      }),
    );
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
