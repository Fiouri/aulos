import { normalizeNullable } from '@/search/normalize';

import { LOCAL_PROVIDER } from './providers';

export interface AlbumKeyFields {
  provider: string;
  album: string | null;
  albumArtist: string | null;
  /** The provider's album reference: the MediaStore ALBUM_ID for 'local'. */
  albumRef: string | null;
  /** Folder of the file relative to its volume; only used for local tracks without an album id. */
  folder: string | null;
}

/**
 * Identity of the album a track belongs to, stored as tracks.album_key. Tracks without an album
 * tag have none. With an album artist tag: album artist and album name, so a compilation stays
 * one album whatever its track artists. Without one, a local track groups by MediaStore album id
 * (album name and folder on Android), falling back to album name and folder; other providers use
 * the album name and their own album reference. Featured artists therefore never split an album,
 * and two albums sharing a name in different folders stay apart.
 */
export function albumGroupKey(track: AlbumKeyFields): string | null {
  const album = normalizeNullable(track.album);
  if (album === null) return null;
  const albumArtist = normalizeNullable(track.albumArtist);
  if (albumArtist !== null) return JSON.stringify(['artist', albumArtist, album]);
  if (track.provider !== LOCAL_PROVIDER) {
    return JSON.stringify(['provider', track.provider, album, track.albumRef]);
  }
  if (track.albumRef !== null) return JSON.stringify(['local', track.albumRef]);
  return JSON.stringify(['folder', album, track.folder]);
}

export interface GroupedTrackFields extends AlbumKeyFields {
  discNo: number | null;
  trackNo: number | null;
}

/** Disc and track number of a numbered track; an untagged disc counts as disc 1. */
function trackSlot(track: GroupedTrackFields): string | null {
  return track.trackNo === null ? null : `${track.discNo ?? 1}:${track.trackNo}`;
}

/** True when the tracks carry differing album artist tags but never repeat a disc/track number. */
function isSplitAlbum(tracks: readonly GroupedTrackFields[]): boolean {
  const albumArtists = new Set(tracks.map((t) => normalizeNullable(t.albumArtist)));
  if (albumArtists.size < 2) return false;
  const slots = new Set<string>();
  for (const track of tracks) {
    const slot = trackSlot(track);
    if (slot === null) continue;
    if (slots.has(slot)) return false;
    slots.add(slot);
  }
  return true;
}

/**
 * Album keys for a whole local scan, index for index. Local tracks that share an album name and
 * a folder but carry different album artist tags (featured artists written into the album
 * artist, as some downloaders do) become one album keyed by album name and folder, unless two
 * of them share a disc and track number: then they are separate albums that happen to share a
 * name and a flat folder, and keep albumGroupKey. Tracks without a track number never block
 * the merge.
 */
export function albumGroupKeys(tracks: readonly GroupedTrackFields[]): (string | null)[] {
  const buckets = new Map<string, number[]>();
  tracks.forEach((track, index) => {
    const album = normalizeNullable(track.album);
    if (album === null || track.folder === null || track.provider !== LOCAL_PROVIDER) return;
    const bucket = JSON.stringify([album, track.folder]);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), index]);
  });

  const merged = new Map<number, string>();
  for (const indexes of buckets.values()) {
    const members = indexes.flatMap((i) => tracks[i] ?? []);
    const [first] = members;
    if (!first || !isSplitAlbum(members)) continue;
    const key = JSON.stringify(['folder', normalizeNullable(first.album), first.folder]);
    for (const index of indexes) merged.set(index, key);
  }
  return tracks.map((track, index) => merged.get(index) ?? albumGroupKey(track));
}
