import { loadArtwork } from '../../modules/media-store';
import { createArtworkCache } from './artwork';

/** App-wide artwork cache in front of the native thumbnail loader. */
export const artworkCache = createArtworkCache(loadArtwork);
