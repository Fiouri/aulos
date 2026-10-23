/**
 * @jest-environment node
 */
import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { createPlaylist } from '../../collections/playlists';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { scanLibrary } from '../../library/scan';
import { searchLibrary, searchSongs } from '../search';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

const LIBRARY = [
  mediaAudio('1', {
    title: 'Τα παιδιά του Πειραιά',
    artist: 'Μάνος Χατζιδάκις',
    album: 'Ο Μεγάλος Ερωτικός',
  }),
  mediaAudio('2', { title: 'Αγάπη', artist: 'Μάνος Χατζιδάκις', album: 'Ο Μεγάλος Ερωτικός' }),
  mediaAudio('3', { title: 'Halo', artist: 'Beyoncé', album: 'I Am... Sasha Fierce' }),
  mediaAudio('4', { title: 'Kickstart My Heart', artist: 'Motley Crue', album: 'Dr. Feelgood' }),
  mediaAudio('5', { title: 'Ρόδι', artist: 'ΜΑΝΟΣ ΛΟΪΖΟΣ', album: 'Τα τραγούδια μας' }),
];

const titles = async (db: NodeDb, q: string) =>
  (await searchSongs(db, q, 50)).map((t) => t.title).sort();

describe('library search', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    await scanLibrary(db, { query: async () => LIBRARY });
  });
  afterEach(() => db.close());

  it('finds Χατζιδάκις when typed without tonos and with a plain sigma', async () => {
    expect(await titles(db, 'χατζιδακις')).toEqual(['Αγάπη', 'Τα παιδιά του Πειραιά']);
    expect(await titles(db, 'ΧΑΤΖΙΔΑΚΙΣ')).toEqual(['Αγάπη', 'Τα παιδιά του Πειραιά']);
  });

  it('finds αγάπη when typed in capitals without tonos', async () => {
    expect(await titles(db, 'ΑΓΑΠΗ')).toEqual(['Αγάπη']);
  });

  it('finds Beyoncé without the accent and Motley with one', async () => {
    expect(await titles(db, 'Beyonce')).toEqual(['Halo']);
    expect(await titles(db, 'Mötley')).toEqual(['Kickstart My Heart']);
  });

  it('matches every token as a prefix', async () => {
    expect(await titles(db, 'χατζ παιδ')).toEqual(['Τα παιδιά του Πειραιά']);
    expect(await titles(db, 'λοιζ')).toEqual(['Ρόδι']);
    expect(await titles(db, 'πειραιας')).toEqual([]);
  });

  it('groups results into songs, albums, artists and playlists', async () => {
    await createPlaylist(db, 'Χατζιδάκις αγαπημένα');
    const results = await searchLibrary(db, 'χατζιδακις');
    expect(results.songs).toHaveLength(2);
    expect(results.albums.map((a) => a.name)).toEqual(['Ο Μεγάλος Ερωτικός']);
    expect(results.artists.map((a) => a.name)).toEqual(['Μάνος Χατζιδάκις']);
    expect(results.playlists.map((p) => p.name)).toEqual(['Χατζιδάκις αγαπημένα']);
  });

  it('returns nothing for a query without letters or digits', async () => {
    expect(await searchLibrary(db, ' *" ')).toEqual({
      songs: [],
      albums: [],
      artists: [],
      playlists: [],
    });
  });

  it('follows tag changes on rescan', async () => {
    const [first, ...rest] = LIBRARY;
    if (!first) throw new Error('fixture');
    await scanLibrary(db, {
      query: async () => [...rest, { ...first, title: 'Χάρτινο το φεγγαράκι' }],
    });
    expect(await titles(db, 'πειραια')).toEqual([]);
    expect(await titles(db, 'φεγγαρακι')).toEqual(['Χάρτινο το φεγγαράκι']);
  });
});
