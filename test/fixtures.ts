import type { MediaStoreAudio } from '../modules/media-store';

/** A MediaStore row for tests; every field can be overridden. */
export const mediaAudio = (
  id: string,
  overrides: Partial<MediaStoreAudio> = {},
): MediaStoreAudio => ({
  id,
  contentUri: `content://media/external/audio/media/${id}`,
  title: `Song ${id}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: null,
  trackNo: 1,
  discNo: null,
  durationMs: 180_000,
  sizeBytes: 4_000_000,
  dateModified: 1_700_000_000_000,
  dateAdded: 1_700_000_000_000,
  year: null,
  albumId: null,
  mimeType: 'audio/mpeg',
  folder: 'Music/',
  ...overrides,
});
