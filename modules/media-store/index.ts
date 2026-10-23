import MediaStoreModule from './src/MediaStoreModule';
import type { MediaStoreAudio, MediaStoreVersion } from './src/MediaStore.types';

export type { MediaStoreAudio, MediaStoreVersion };

/** Reads every music file in the device MediaStore. Requires the audio read permission. */
export function queryAudio(): Promise<MediaStoreAudio[]> {
  return MediaStoreModule.queryAudio();
}

/** Cheap change detector for the audio library, compared between app resumes. */
export function getVersion(): Promise<MediaStoreVersion> {
  return MediaStoreModule.getVersion();
}

/**
 * Album artwork of a track as a square-ish thumbnail of at most `sizePx`, cached on disk per
 * album and size. Resolves to a file:// URI, or null when the track has no artwork.
 */
export function loadArtwork(contentUri: string, sizePx: number): Promise<string | null> {
  return MediaStoreModule.loadArtwork(contentUri, sizePx);
}

/**
 * Whether each content URI can still be opened for reading. Missing files are also handed to the
 * media scanner so MediaStore drops their stale rows before the next library scan.
 */
export function checkFiles(contentUris: string[]): Promise<boolean[]> {
  return MediaStoreModule.checkFiles(contentUris);
}
