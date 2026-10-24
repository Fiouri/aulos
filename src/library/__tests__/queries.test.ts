/**
 * @jest-environment node
 */
import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import {
  albumTracks,
  artistAlbums,
  artistTracks,
  getTracks,
  hasAlbumYears,
  listAlbums,
  listArtists,
  listSongs,
} from '../queries';
import { scanLibrary } from '../scan';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

const LIBRARY = [
  mediaAudio('1', { title: 'Zeta', artist: 'Άλφα', album: 'Δεύτερο', trackNo: 2, discNo: 1 }),
  mediaAudio('2', { title: 'Alpha', artist: 'Άλφα', album: 'Δεύτερο', trackNo: 1, discNo: 2 }),
  mediaAudio('3', { title: 'Έψιλον', artist: 'Άλφα', album: 'Δεύτερο', trackNo: 1, discNo: 1 }),
  mediaAudio('4', {
    title: 'beta',
    artist: 'Beta Band',
    album: 'Anthology',
    albumArtist: 'Various',
    year: 2001,
    dateAdded: 3,
  }),
  mediaAudio('5', {
    title: 'Gamma',
    artist: 'Άλφα',
    album: 'Anthology',
    albumArtist: 'Various',
    year: 2001,
    dateAdded: 5,
  }),
  mediaAudio('6', { title: 'Loose', artist: null, album: null, trackNo: null, dateAdded: 9 }),
];

describe('library queries', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    await scanLibrary(db, { query: async () => LIBRARY });
  });
  afterEach(() => db.close());

  it('sorts songs by title, artist and date added, accent-insensitively', async () => {
    const byTitle = await listSongs(db, 'title');
    expect(byTitle.map((t) => t.title)).toEqual([
      'Alpha',
      'beta',
      'Gamma',
      'Loose',
      'Zeta',
      'Έψιλον',
    ]);

    const byArtist = await listSongs(db, 'artist');
    expect(byArtist.map((t) => t.title)).toEqual([
      'beta',
      'Gamma',
      'Έψιλον',
      'Zeta',
      'Alpha',
      'Loose',
    ]);

    const byAdded = await listSongs(db, 'added');
    expect(byAdded.slice(3).map((t) => t.title)).toEqual(['Loose', 'Gamma', 'beta']);
  });

  it('lists albums under their album artist and sorts them', async () => {
    const byName = await listAlbums(db, 'name');
    expect(byName.map((a) => [a.name, a.artist, a.trackCount])).toEqual([
      ['Anthology', 'Various', 2],
      ['Δεύτερο', 'Άλφα', 3],
    ]);
    expect((await listAlbums(db, 'year')).map((a) => a.year)).toEqual([2001, null]);
    expect((await listAlbums(db, 'artist')).map((a) => a.artist)).toEqual(['Various', 'Άλφα']);
    expect(await hasAlbumYears(db)).toBe(true);
  });

  it('orders album tracks by disc, then track number', async () => {
    const album = (await listAlbums(db, 'name')).find((a) => a.name === 'Δεύτερο');
    const tracks = await albumTracks(db, album?.key ?? '');
    expect(tracks.map((t) => t.title)).toEqual(['Έψιλον', 'Zeta', 'Alpha']);
  });

  it('shows an artist with their albums, then all of their tracks', async () => {
    expect((await listArtists(db)).map((a) => [a.name, a.trackCount, a.albumCount])).toEqual([
      ['Beta Band', 1, 1],
      ['Άλφα', 4, 2],
    ]);
    expect((await artistAlbums(db, 'Άλφα')).map((a) => a.name)).toEqual(['Anthology', 'Δεύτερο']);
    expect((await artistTracks(db, 'Άλφα')).map((t) => t.title)).toEqual([
      'Gamma',
      'Έψιλον',
      'Zeta',
      'Alpha',
    ]);
  });

  it('loads tracks by id in the requested order and skips unknown ids', async () => {
    const all = await listSongs(db, 'title');
    const [a, b] = all;
    if (!a || !b) throw new Error('fixture');
    expect((await getTracks(db, [b.id, 9999, a.id, b.id])).map((t) => t.id)).toEqual([
      b.id,
      a.id,
      b.id,
    ]);
  });
});
