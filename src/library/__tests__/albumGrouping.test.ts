/**
 * @jest-environment node
 */
import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { favoriteAlbums, setFavorite } from '../../collections/favorites';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { albumGroupKey } from '../albumKey';
import { albumTracks, artistAlbums, listAlbums, listArtists } from '../queries';
import { scanLibrary } from '../scan';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

const local = { provider: 'local', albumArtist: null, albumRef: null, folder: 'Music/A/' };

describe('albumGroupKey', () => {
  it('prefers album artist, then the MediaStore album id, then name and folder', () => {
    expect(albumGroupKey({ ...local, album: 'Ála', albumArtist: 'Ä B', albumRef: '9' })).toBe(
      '["artist","a b","ala"]',
    );
    expect(albumGroupKey({ ...local, album: 'Ála', albumRef: '9' })).toBe('["local","9"]');
    expect(albumGroupKey({ ...local, album: 'Ála' })).toBe('["folder","ala","Music/A/"]');
    expect(albumGroupKey({ ...local, album: null, albumArtist: 'X' })).toBeNull();
  });

  it('keys other providers by album name and their album reference', () => {
    expect(albumGroupKey({ ...local, provider: 'nuclear', album: 'Ála', albumRef: 'r1' })).toBe(
      '["provider","nuclear","ala","r1"]',
    );
    expect(albumGroupKey({ ...local, provider: 'nuclear', album: 'Ála', albumArtist: 'X' })).toBe(
      '["artist","x","ala"]',
    );
  });
});

describe('album grouping', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
  });
  afterEach(() => db.close());

  it('keeps an album with featured artists and no album artist as one album', async () => {
    const tape = { album: 'Street Tape 3', albumArtist: null, albumId: '77' };
    await scanLibrary(db, {
      query: async () => [
        mediaAudio('1', { ...tape, title: 'One', artist: 'Kilo Verse', trackNo: 1 }),
        mediaAudio('2', {
          ...tape,
          title: 'Two',
          artist: 'Kilo Verse feat. Dee Nine',
          trackNo: 2,
        }),
        mediaAudio('3', { ...tape, title: 'Three', artist: 'Kilo Verse', trackNo: 3 }),
        mediaAudio('4', { ...tape, title: 'Four', artist: 'Kilo Verse feat. Echo', trackNo: 4 }),
      ],
    });
    const albums = await listAlbums(db, 'name');
    expect(albums.map((a) => [a.name, a.artist, a.various, a.trackCount])).toEqual([
      ['Street Tape 3', 'Kilo Verse', 0, 4],
    ]);
    const [album] = albums;
    expect((await albumTracks(db, album?.key ?? '')).map((t) => t.title)).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
    ]);
    expect((await artistAlbums(db, 'Kilo Verse feat. Echo')).map((a) => a.key)).toEqual([
      album?.key,
    ]);
    expect((await listArtists(db)).every((a) => a.albumCount === 1)).toBe(true);
  });

  it('shows Various Artists when no track artist holds half of the album', async () => {
    const mix = { album: 'Summer Mix', albumArtist: null, albumId: '5' };
    await scanLibrary(db, {
      query: async () => [
        mediaAudio('1', { ...mix, artist: 'A' }),
        mediaAudio('2', { ...mix, artist: 'B' }),
        mediaAudio('3', { ...mix, artist: 'C' }),
        mediaAudio('4', { album: 'Duo', albumId: '6', artist: 'D' }),
        mediaAudio('5', { album: 'Duo', albumId: '6', artist: 'E' }),
      ],
    });
    expect((await listAlbums(db, 'name')).map((a) => [a.name, a.artist, a.various])).toEqual([
      ['Duo', 'D', 0],
      ['Summer Mix', null, 1],
    ]);
  });

  it('keeps two albums with the same name in different folders apart', async () => {
    await scanLibrary(db, {
      query: async () => [
        mediaAudio('1', { album: 'Greatest Hits', artist: 'X', albumId: '1', folder: 'Music/X/' }),
        mediaAudio('2', { album: 'Greatest Hits', artist: 'X', albumId: '1', folder: 'Music/X/' }),
        mediaAudio('3', { album: 'Greatest Hits', artist: 'Y', albumId: '2', folder: 'Music/Y/' }),
        mediaAudio('4', { album: 'Live', artist: 'Z', folder: 'Music/Z1/' }),
        mediaAudio('5', { album: 'Live', artist: 'Z', folder: 'Music/Z2/' }),
      ],
    });
    expect((await listAlbums(db, 'name')).map((a) => [a.name, a.artist, a.trackCount])).toEqual([
      ['Greatest Hits', 'X', 2],
      ['Greatest Hits', 'Y', 1],
      ['Live', 'Z', 1],
      ['Live', 'Z', 1],
    ]);
  });

  it('keeps an album favorite when a rescan re-keys the album', async () => {
    const before = [
      mediaAudio('1', { album: 'Tape', artist: 'X' }),
      mediaAudio('2', { album: 'Tape', artist: 'X feat. Y' }),
    ];
    await scanLibrary(db, { query: async () => before });
    const [album] = await listAlbums(db, 'name');
    await setFavorite(db, 'album', album?.key ?? '', true, 1);

    const result = await scanLibrary(db, {
      query: async () => before.map((a) => ({ ...a, albumId: '31' })),
    });
    expect(result.updated).toBe(2);
    expect((await favoriteAlbums(db)).map((a) => [a.key, a.name])).toEqual([
      ['["local","31"]', 'Tape'],
    ]);
  });
});
