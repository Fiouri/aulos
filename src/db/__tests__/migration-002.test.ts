/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { searchSongs } from '../../search/search';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';

const V1 = MIGRATIONS.filter((m) => m.version === 1);
const V2 = MIGRATIONS.filter((m) => m.version <= 2);

describe('migration 002 (search)', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, V1);
    await db.run(
      `INSERT INTO tracks (provider, provider_ref, title, artist, album, album_artist, file_mtime,
                           local_path)
       VALUES ('local', '1', 'Χάρτινο το Φεγγαράκι', 'Μάνος Χατζιδάκις', 'Ο Μεγάλος Ερωτικός',
               NULL, 1600000000000, 'content://media/1'),
              ('local', '2', 'Halo', 'Beyoncé', NULL, 'Beyoncé', NULL, 'content://media/2')`,
    );
  });
  afterEach(() => db.close());

  it('backfills the normalised columns and added_at of existing tracks', async () => {
    expect(await migrate(db, V2, () => 5)).toEqual([2]);
    const rows = await db.getAll(
      `SELECT provider_ref, title_norm, artist_norm, album_norm, album_artist_norm, added_at
         FROM tracks ORDER BY provider_ref`,
    );
    expect(rows).toEqual([
      {
        provider_ref: '1',
        title_norm: 'χαρτινο το φεγγαρακι',
        artist_norm: 'μανοσ χατζιδακισ',
        album_norm: 'ο μεγαλοσ ερωτικοσ',
        album_artist_norm: null,
        added_at: 1_600_000_000_000,
      },
      {
        provider_ref: '2',
        title_norm: 'halo',
        artist_norm: 'beyonce',
        album_norm: null,
        album_artist_norm: 'beyonce',
        added_at: expect.any(Number),
      },
    ]);
  });

  it('rebuilds the FTS index over the backfilled rows', async () => {
    await migrate(db, MIGRATIONS);
    expect((await searchSongs(db, 'χατζιδακις φεγγαρ', 10)).map((t) => t.providerRef)).toEqual([
      '1',
    ]);
    expect((await searchSongs(db, 'BEYONCE', 10)).map((t) => t.providerRef)).toEqual(['2']);
    await expect(
      db.run("INSERT INTO tracks_fts (tracks_fts, rank) VALUES ('integrity-check', 1)"),
    ).resolves.toBeDefined();
  });

  it('keeps the index in sync through the new triggers', async () => {
    await migrate(db, MIGRATIONS);
    await db.run("UPDATE tracks SET title_norm = 'αλλο' WHERE provider_ref = '1'");
    await db.run("DELETE FROM tracks WHERE provider_ref = '2'");
    expect(await searchSongs(db, 'φεγγαρ', 10)).toEqual([]);
    expect((await searchSongs(db, 'αλλο', 10)).map((t) => t.providerRef)).toEqual(['1']);
    expect(await searchSongs(db, 'halo', 10)).toEqual([]);
    await expect(
      db.run("INSERT INTO tracks_fts (tracks_fts, rank) VALUES ('integrity-check', 1)"),
    ).resolves.toBeDefined();
  });

  it('is a no-op when re-run', async () => {
    await migrate(db, MIGRATIONS);
    const before = await db.getAll('SELECT * FROM tracks ORDER BY id');
    expect(await migrate(db, MIGRATIONS)).toEqual([]);
    expect(await db.getAll('SELECT * FROM tracks ORDER BY id')).toEqual(before);
  });

  it('widens the albums and artists views', async () => {
    await migrate(db, MIGRATIONS);
    expect(await db.getAll('SELECT name, artist, name_norm, sample_path FROM albums')).toEqual([
      {
        name: 'Ο Μεγάλος Ερωτικός',
        artist: 'Μάνος Χατζιδάκις',
        name_norm: 'ο μεγαλοσ ερωτικοσ',
        sample_path: 'content://media/1',
      },
    ]);
    expect(await db.getAll('SELECT name, name_norm FROM artists ORDER BY name_norm')).toEqual([
      { name: 'Beyoncé', name_norm: 'beyonce' },
      { name: 'Μάνος Χατζιδάκις', name_norm: 'μανοσ χατζιδακισ' },
    ]);
  });
});
