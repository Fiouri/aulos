/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';

const V3 = MIGRATIONS.filter((m) => m.version <= 3);

describe('migration 004 (merged album artist)', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, V3);
    await db.run(
      `INSERT INTO tracks (provider, provider_ref, title, artist, album, album_artist, title_norm,
                           artist_norm, album_norm, album_artist_norm, album_key)
       VALUES ('local', '1', 'One', 'X', 'Tape', 'X', 'one', 'x', 'tape', 'x', 'k1'),
              ('local', '2', 'Two', 'X, Y', 'Tape', 'X, Y', 'two', 'x, y', 'tape', 'x, y', 'k1'),
              ('local', '3', 'Three', 'X', 'Tape', 'X, Z', 'three', 'x', 'tape', 'x, z', 'k1'),
              ('local', '4', 'Hit', 'Q', 'Hits', 'Queen', 'hit', 'q', 'hits', 'queen', 'k2')`,
    );
    await db.run(`INSERT INTO kv (key, value) VALUES ('library.mediaVersion', '"v2:9"')`);
  });
  afterEach(() => db.close());

  it('shows the album artist only when every track shares it, and forces a rescan', async () => {
    const tracksBefore = await db.getAll('SELECT * FROM tracks ORDER BY id');
    expect(
      await migrate(
        db,
        MIGRATIONS.filter((m) => m.version <= 4),
      ),
    ).toEqual([4]);
    expect(await db.getAll('SELECT key, artist, various FROM albums ORDER BY key')).toEqual([
      { key: 'k1', artist: 'X', various: 0 },
      { key: 'k2', artist: 'Queen', various: 0 },
    ]);
    expect(await db.getAll('SELECT * FROM tracks ORDER BY id')).toEqual(tracksBefore);
    expect(await db.getFirst(`SELECT value FROM kv WHERE key = 'library.mediaVersion'`)).toBeNull();
  });

  it('is a no-op when run again', async () => {
    await migrate(db, MIGRATIONS);
    const albums = await db.getAll('SELECT * FROM albums ORDER BY key');
    expect(await migrate(db, MIGRATIONS)).toEqual([]);
    expect(await db.getAll('SELECT * FROM albums ORDER BY key')).toEqual(albums);
  });
});
