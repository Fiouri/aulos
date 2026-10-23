/** One row of MediaStore.Audio.Media (IS_MUSIC != 0), as returned by queryAudio(). */
export interface MediaStoreAudio {
  /** MediaStore _ID, stable while the file stays in place. */
  id: string;
  /** content://media/external/audio/media/<id> */
  contentUri: string;
  title: string;
  artist: string | null;
  album: string | null;
  /** Null below Android 11 (API 30), where MediaStore has no public ALBUM_ARTIST column. */
  albumArtist: string | null;
  trackNo: number | null;
  discNo: number | null;
  durationMs: number | null;
  sizeBytes: number | null;
  /** Last modification time in epoch milliseconds. */
  dateModified: number | null;
  /** When MediaStore first saw the file, in epoch milliseconds. */
  dateAdded: number | null;
  year: number | null;
  albumId: string | null;
  mimeType: string | null;
  /**
   * Folder relative to the storage volume, with a trailing slash ("Music/Albums/"):
   * RELATIVE_PATH on API 29+, the parent directory of DATA below.
   */
  folder: string | null;
}

/**
 * Opaque token that changes whenever the audio library may have changed: MediaStore version and
 * generation on API 30+, audio row count and newest modification time below.
 */
export interface MediaStoreVersion {
  token: string;
}
