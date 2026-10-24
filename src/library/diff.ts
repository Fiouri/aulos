import type { MediaStoreAudio } from '../../modules/media-store';
import type { GroupedTrackFields } from './albumKey';
import { LOCAL_PROVIDER } from './providers';

/** Columns of a `tracks` row that a local scan owns. */
export interface LocalTrackFields {
  providerRef: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  trackNo: number | null;
  discNo: number | null;
  durationMs: number | null;
  localPath: string;
  fileMtime: number | null;
  fileSize: number | null;
  year: number | null;
  /** MediaStore ALBUM_ID. */
  albumRef: string | null;
  /** Derived from the tags, album id and folder of the whole scan by albumGroupKeys. */
  albumKey: string | null;
  /** Only written on insert: when the file first entered the library. */
  addedAt: number | null;
}

export interface StoredLocalTrack extends LocalTrackFields {
  id: number;
}

export interface ScanDiff {
  toInsert: LocalTrackFields[];
  toUpdate: StoredLocalTrack[];
  toDelete: number[];
  unchanged: number;
  total: number;
}

const COMPARED_FIELDS = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'trackNo',
  'discNo',
  'durationMs',
  'localPath',
  'fileMtime',
  'fileSize',
  'year',
  'albumRef',
  'albumKey',
] as const satisfies readonly (keyof LocalTrackFields)[];

/** What album grouping needs to know about a MediaStore row. */
export function toGroupedFields(audio: MediaStoreAudio): GroupedTrackFields {
  return {
    provider: LOCAL_PROVIDER,
    album: audio.album,
    albumArtist: audio.albumArtist,
    albumRef: audio.albumId,
    folder: audio.folder,
    discNo: audio.discNo,
    trackNo: audio.trackNo,
  };
}

export function toTrackFields(audio: MediaStoreAudio, albumKey: string | null): LocalTrackFields {
  return {
    providerRef: audio.id,
    title: audio.title,
    artist: audio.artist,
    album: audio.album,
    albumArtist: audio.albumArtist,
    trackNo: audio.trackNo,
    discNo: audio.discNo,
    durationMs: audio.durationMs,
    localPath: audio.contentUri,
    fileMtime: audio.dateModified,
    fileSize: audio.sizeBytes,
    year: audio.year,
    albumRef: audio.albumId,
    albumKey,
    addedAt: audio.dateAdded,
  };
}

function differs(a: LocalTrackFields, b: LocalTrackFields): boolean {
  return COMPARED_FIELDS.some((field) => a[field] !== b[field]);
}

/**
 * Compares the stored 'local' tracks with a fresh MediaStore scan, keyed by provider_ref.
 * Duplicate refs in the scan keep their first occurrence.
 */
export function diffLocalTracks(
  stored: readonly StoredLocalTrack[],
  scanned: readonly LocalTrackFields[],
): ScanDiff {
  const storedByRef = new Map(stored.map((t) => [t.providerRef, t]));
  const seen = new Set<string>();
  const toInsert: LocalTrackFields[] = [];
  const toUpdate: StoredLocalTrack[] = [];
  let unchanged = 0;

  for (const track of scanned) {
    if (seen.has(track.providerRef)) continue;
    seen.add(track.providerRef);
    const existing = storedByRef.get(track.providerRef);
    if (!existing) {
      toInsert.push(track);
    } else if (differs(existing, track)) {
      toUpdate.push({ ...track, id: existing.id });
    } else {
      unchanged += 1;
    }
  }

  const toDelete = stored.filter((t) => !seen.has(t.providerRef)).map((t) => t.id);
  return { toInsert, toUpdate, toDelete, unchanged, total: seen.size };
}
