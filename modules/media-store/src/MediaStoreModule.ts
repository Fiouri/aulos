import { NativeModule, requireNativeModule } from 'expo';

import type { MediaStoreAudio } from './MediaStore.types';

declare class MediaStoreModule extends NativeModule {
  queryAudio(): Promise<MediaStoreAudio[]>;
}

export default requireNativeModule<MediaStoreModule>('MediaStore');
