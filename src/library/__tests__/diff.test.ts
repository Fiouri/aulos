import type { MediaStoreAudio } from '../../../modules/media-store';
import {
  diffLocalTracks,
  toTrackFields,
  type LocalTrackFields,
  type StoredLocalTrack,
} from '../diff';

const fields = (ref: string, overrides: Partial<LocalTrackFields> = {}): LocalTrackFields => ({
  providerRef: ref,
  title: `Song ${ref}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: null,
  trackNo: 1,
  discNo: null,
  durationMs: 180_000,
  localPath: `content://media/external/audio/media/${ref}`,
  fileMtime: 1_700_000_000_000,
  fileSize: 4_000_000,
  year: null,
  albumRef: null,
  albumKey: '["folder","album","Music/"]',
  addedAt: 1_600_000_000_000,
  ...overrides,
});

const stored = (id: number, ref: string, overrides: Partial<LocalTrackFields> = {}) =>
  ({ id, ...fields(ref, overrides) }) satisfies StoredLocalTrack;

describe('diffLocalTracks', () => {
  it('inserts everything on the first scan', () => {
    const diff = diffLocalTracks([], [fields('1'), fields('2')]);
    expect(diff.toInsert.map((t) => t.providerRef)).toEqual(['1', '2']);
    expect(diff).toMatchObject({ toUpdate: [], toDelete: [], unchanged: 0, total: 2 });
  });

  it('leaves identical tracks alone', () => {
    const diff = diffLocalTracks([stored(10, '1')], [fields('1')]);
    expect(diff).toEqual({ toInsert: [], toUpdate: [], toDelete: [], unchanged: 1, total: 1 });
  });

  it('updates tracks whose tags or file changed, keeping the row id', () => {
    const diff = diffLocalTracks(
      [stored(10, '1'), stored(11, '2'), stored(12, '3')],
      [fields('1', { title: 'Renamed' }), fields('2', { fileMtime: 1 }), fields('3')],
    );
    expect(diff.toUpdate).toEqual([
      { id: 10, ...fields('1', { title: 'Renamed' }) },
      { id: 11, ...fields('2', { fileMtime: 1 }) },
    ]);
    expect(diff.unchanged).toBe(1);
  });

  it('treats a tag that became null as a change', () => {
    const diff = diffLocalTracks([stored(10, '1')], [fields('1', { artist: null })]);
    expect(diff.toUpdate).toHaveLength(1);
  });

  it('deletes rows whose file is gone', () => {
    const diff = diffLocalTracks([stored(10, '1'), stored(11, '2')], [fields('2')]);
    expect(diff.toDelete).toEqual([10]);
    expect(diff.total).toBe(1);
  });

  it('removes everything when the device has no music', () => {
    const diff = diffLocalTracks([stored(10, '1'), stored(11, '2')], []);
    expect(diff).toEqual({
      toInsert: [],
      toUpdate: [],
      toDelete: [10, 11],
      unchanged: 0,
      total: 0,
    });
  });

  it('handles insert, update, delete and unchanged together', () => {
    const diff = diffLocalTracks(
      [stored(1, 'a'), stored(2, 'b'), stored(3, 'c')],
      [fields('a'), fields('b', { album: 'New' }), fields('d')],
    );
    expect(diff.toInsert.map((t) => t.providerRef)).toEqual(['d']);
    expect(diff.toUpdate.map((t) => t.id)).toEqual([2]);
    expect(diff.toDelete).toEqual([3]);
    expect(diff.unchanged).toBe(1);
    expect(diff.total).toBe(3);
  });

  it('keeps the first occurrence of a duplicated ref', () => {
    const diff = diffLocalTracks(
      [],
      [fields('1', { title: 'First' }), fields('1', { title: 'Dup' })],
    );
    expect(diff.toInsert).toEqual([fields('1', { title: 'First' })]);
    expect(diff.total).toBe(1);
  });
});

describe('toTrackFields', () => {
  it('maps a MediaStore row onto track columns', () => {
    const audio: MediaStoreAudio = {
      id: '77',
      contentUri: 'content://media/external/audio/media/77',
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Album Artist',
      trackNo: 5,
      discNo: 2,
      durationMs: 200_000,
      sizeBytes: 5_000_000,
      dateModified: 1_700_000_000_000,
      dateAdded: 1_600_000_000_000,
      year: 1999,
      albumId: '9',
      mimeType: 'audio/flac',
      folder: 'Music/Album/',
    };
    expect(toTrackFields(audio, '["local","9"]')).toEqual({
      providerRef: '77',
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Album Artist',
      trackNo: 5,
      discNo: 2,
      durationMs: 200_000,
      localPath: 'content://media/external/audio/media/77',
      fileMtime: 1_700_000_000_000,
      fileSize: 5_000_000,
      year: 1999,
      albumRef: '9',
      albumKey: '["local","9"]',
      addedAt: 1_600_000_000_000,
    });
  });
});
