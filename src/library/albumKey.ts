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
