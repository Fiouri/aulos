import MediaStoreModule from './src/MediaStoreModule';
import type { MediaStoreAudio } from './src/MediaStore.types';

export type { MediaStoreAudio };

/** Reads every music file in the device MediaStore. Requires the audio read permission. */
export function queryAudio(): Promise<MediaStoreAudio[]> {
  return MediaStoreModule.queryAudio();
}
