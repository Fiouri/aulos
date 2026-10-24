/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';

const V4 = MIGRATIONS.filter((m) => m.version <= 4);

const columns = async (db: NodeDb, table: string) =>
  (await db.getAll<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);

describe('migration 005 (sources and downloads)', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, V4);
    await db.run(
      `INSERT INTO tracks (provider, provider_ref, title, artist, album, local_path, title_norm,
                           artist_norm, album_norm, album_key)
       VALUES ('local', '1', 'On device', 'A', 'Album', 'content://media/1', 'on device', 'a',
               'album', 'k1'),
              ('archive', 'item/x.mp3', 'Streamed', 'A', 'Item', NULL, 'streamed', 'a', 'item',
               'k2')`,
    );
  });
  afterEach(() => db.close());

  it('adds the cache table, licence columns and the M2 downloads table', async () => {
    expect(await migrate(db, MIGRATIONS)).toEqual([5]);
    expect(await columns(db, 'http_cache')).toEqual(['key', 'body', 'fetched_at', 'ttl_s']);
    expect(await columns(db, 'tracks')).toEqual(
      expect.arrayContaining(['license_url', 'attribution']),
    );
    expect(await columns(db, 'downloads')).toEqual([
      'track_id',
      'status',
      'format',
      'file_name',
      'bytes_done',
      'bytes_total',
      'error',
      'created_at',
      'updated_at',
    ]);
    await db.run(
      `INSERT INTO downloads (track_id, status, format, file_name, created_at, updated_at)
       VALUES (2, 'completed', 'mp3', 'abc', 1, 1)`,
    );
    await expect(
      db.run(
        `INSERT INTO downloads (track_id, status, format, file_name, created_at, updated_at)
         VALUES (1, 'done', 'mp3', 'def', 1, 1)`,
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      db.run(
        "INSERT INTO http_cache (key, body, fetched_at, ttl_s) VALUES ('k', 'not json', 0, 1)",
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('keeps tracks without a file on the device out of the album and artist views', async () => {
    await migrate(db, MIGRATIONS);
    expect(await db.getAll('SELECT key, name, track_count FROM albums')).toEqual([
      { key: 'k1', name: 'Album', track_count: 1 },
    ]);
    expect(await db.getAll('SELECT name, track_count, album_count FROM artists')).toEqual([
      { name: 'A', track_count: 1, album_count: 1 },
    ]);
  });

  it('is a no-op when run again', async () => {
    await migrate(db, MIGRATIONS);
    const before = await db.getAll('SELECT * FROM tracks ORDER BY id');
    expect(await migrate(db, MIGRATIONS)).toEqual([]);
    expect(await db.getAll('SELECT * FROM tracks ORDER BY id')).toEqual(before);
  });
});
