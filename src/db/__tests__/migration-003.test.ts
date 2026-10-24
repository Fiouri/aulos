/**
 * @jest-environment node
 */
import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { favoriteAlbums } from '../../collections/favorites';
import { listAlbums } from '../../library/queries';
import { scanLibrary } from '../../library/scan';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

const V2 = MIGRATIONS.filter((m) => m.version <= 2);

const TRACK_STATE = 'SELECT id, provider_ref, album_ref, album_key FROM tracks ORDER BY id';
const FAVORITE_STATE = 'SELECT kind, key, added_at FROM favorites ORDER BY kind, key';

const RESCAN = [
  mediaAudio('1', { title: 'One', artist: 'X', album: 'Tape', albumId: '31' }),
  mediaAudio('2', { title: 'Two', artist: 'X feat. Y', album: 'Tape', albumId: '31' }),
  mediaAudio('3', { title: 'Three', artist: 'Z', album: 'Hits', albumArtist: 'Zed' }),
  mediaAudio('4', { title: 'Loose', artist: 'Z', album: null }),
];

describe('migration 003 (album grouping)', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, V2);
    await db.run(
      `INSERT INTO tracks (provider, provider_ref, title, artist, album, album_artist,
                           title_norm, artist_norm, album_norm, album_artist_norm)
       VALUES ('local', '1', 'One', 'X', 'Tape', NULL, 'one', 'x', 'tape', NULL),
              ('local', '2', 'Two', 'X feat. Y', 'Tape', NULL, 'two', 'x feat. y', 'tape', NULL),
              ('local', '3', 'Three', 'Z', 'Hits', 'Zed', 'three', 'z', 'hits', 'zed'),
              ('local', '4', 'Loose', 'Z', NULL, NULL, 'loose', 'z', NULL, NULL)`,
    );
    await db.run(
      `INSERT INTO favorites (kind, key, added_at)
       VALUES ('album', '["Tape","X feat. Y"]', 1), ('album', '["Hits","Zed"]', 2),
              ('album', '["Gone",null]', 3), ('artist', 'X', 4)`,
    );
    await db.run(`INSERT INTO kv (key, value) VALUES ('library.mediaVersion', '"v2:9"')`);
  });
  afterEach(() => db.close());

  it('keys existing tracks, merges the split album and converts legacy album favorites', async () => {
    expect(await migrate(db, MIGRATIONS)).toEqual([3]);
    expect(await db.getAll(TRACK_STATE)).toEqual([
      { id: 1, provider_ref: '1', album_ref: null, album_key: '["folder","tape",null]' },
      { id: 2, provider_ref: '2', album_ref: null, album_key: '["folder","tape",null]' },
      { id: 3, provider_ref: '3', album_ref: null, album_key: '["artist","zed","hits"]' },
      { id: 4, provider_ref: '4', album_ref: null, album_key: null },
    ]);
    expect((await listAlbums(db, 'name')).map((a) => [a.name, a.artist, a.trackCount])).toEqual([
      ['Hits', 'Zed', 1],
      ['Tape', 'X', 2],
    ]);
    expect(await db.getAll(FAVORITE_STATE)).toEqual([
      { kind: 'album', key: '["Gone",null]', added_at: 3 },
      { kind: 'album', key: '["artist","zed","hits"]', added_at: 2 },
      { kind: 'album', key: '["folder","tape",null]', added_at: 1 },
      { kind: 'artist', key: 'X', added_at: 4 },
    ]);
    expect(await db.getFirst(`SELECT value FROM kv WHERE key = 'library.mediaVersion'`)).toBeNull();
  });

  it('is a no-op when run again', async () => {
    await migrate(db, MIGRATIONS);
    const tracks = await db.getAll(TRACK_STATE);
    const favorites = await db.getAll(FAVORITE_STATE);

    expect(await migrate(db, MIGRATIONS)).toEqual([]);
    const backfill = MIGRATIONS.find((m) => m.version === 3)?.up;
    if (!backfill) throw new Error('migration 003 has a backfill');
    await db.transaction(backfill);
    expect(await db.getAll(TRACK_STATE)).toEqual(tracks);
    expect(await db.getAll(FAVORITE_STATE)).toEqual(favorites);
  });

  it('backfills the MediaStore album id on the next scan and keeps the favorite', async () => {
    await migrate(db, MIGRATIONS);
    expect(await scanLibrary(db, { query: async () => RESCAN })).toMatchObject({
      added: 0,
      updated: 4,
      removed: 0,
    });
    expect(await db.getAll('SELECT album_ref, album_key FROM tracks WHERE id IN (1, 2)')).toEqual([
      { album_ref: '31', album_key: '["local","31"]' },
      { album_ref: '31', album_key: '["local","31"]' },
    ]);
    expect((await favoriteAlbums(db)).map((a) => a.name)).toEqual(['Hits', 'Tape']);
    expect(await scanLibrary(db, { query: async () => RESCAN })).toMatchObject({
      added: 0,
      updated: 0,
      removed: 0,
    });
  });
});
