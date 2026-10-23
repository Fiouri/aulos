import type { MediaStoreAudio } from '../../modules/media-store';

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
] as const satisfies readonly (keyof LocalTrackFields)[];

export function toTrackFields(audio: MediaStoreAudio): LocalTrackFields {
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
