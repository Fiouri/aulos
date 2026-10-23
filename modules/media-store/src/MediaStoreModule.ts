import { NativeModule, requireNativeModule } from 'expo';

import type { MediaStoreAudio, MediaStoreVersion } from './MediaStore.types';

declare class MediaStoreModule extends NativeModule {
  queryAudio(): Promise<MediaStoreAudio[]>;
  getVersion(): Promise<MediaStoreVersion>;
  loadArtwork(contentUri: string, sizePx: number): Promise<string | null>;
  checkFiles(contentUris: string[]): Promise<boolean[]>;
}

export default requireNativeModule<MediaStoreModule>('MediaStore');
