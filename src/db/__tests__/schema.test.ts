/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { assertFts5 } from '../fts';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { albumGroupKey } from '../../library/albumKey';
import { normalizeNullable, normalizeText } from '../../search/normalize';

const insertTrack = (
  db: NodeDb,
  ref: string,
  title: string,
  artist: string | null = null,
  album: string | null = null,
  provider = 'local',
) =>
  db.run(
    `INSERT INTO tracks (provider, provider_ref, title, artist, album, title_norm, artist_norm,
                         album_norm, album_key, local_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      provider,
      ref,
      title,
      artist,
      album,
      normalizeText(title),
      normalizeNullable(artist),
      normalizeNullable(album),
      albumGroupKey({ provider, album, albumArtist: null, albumRef: null, folder: 'Music/' }),
      `content://media/external/audio/media/${ref}`,
    ],
  );

const search = async (db: NodeDb, query: string) =>
  (
    await db.getAll<{ rowid: number }>(
      'SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ? ORDER BY rowid',
      [query],
    )
  ).map((r) => r.rowid);

describe('schema', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
  });
  afterEach(() => db.close());

  it('creates every table and view from SPEC section 6', async () => {
    const objects = await db.getAll<{ name: string; type: string }>(
      `SELECT name, type FROM sqlite_master
        WHERE type IN ('table', 'view') AND name NOT LIKE 'tracks_fts_%' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    );
    expect(objects).toEqual([
      { name: 'albums', type: 'view' },
      { name: 'artists', type: 'view' },
      { name: 'downloads', type: 'table' },
      { name: 'favorites', type: 'table' },
      { name: 'history', type: 'table' },
      { name: 'http_cache', type: 'table' },
      { name: 'kv', type: 'table' },
      { name: 'pairings', type: 'table' },
      { name: 'playlist_items', type: 'table' },
      { name: 'playlists', type: 'table' },
      { name: 'schema_migrations', type: 'table' },
      { name: 'tracks', type: 'table' },
      { name: 'tracks_fts', type: 'table' },
    ]);
  });

  it('has FTS5 available', async () => {
    await expect(assertFts5(db)).resolves.toBeUndefined();
  });

  describe('unique (provider, provider_ref)', () => {
    it('rejects a duplicate pair', async () => {
      await insertTrack(db, '42', 'One');
      await expect(insertTrack(db, '42', 'Two')).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it('allows the same ref under another provider', async () => {
      await insertTrack(db, '42', 'Local');
      await expect(insertTrack(db, '42', 'Archive', null, null, 'archive')).resolves.toMatchObject({
        changes: 1,
      });
    });
  });

  describe('tracks_fts triggers', () => {
    it('indexes inserted tracks', async () => {
      const { lastInsertRowId } = await insertTrack(db, '1', 'Bohemian Rhapsody', 'Queen', 'Opera');
      expect(await search(db, 'rhapsody')).toEqual([lastInsertRowId]);
      expect(await search(db, 'queen')).toEqual([lastInsertRowId]);
      expect(await search(db, 'opera')).toEqual([lastInsertRowId]);
    });

    it('reindexes updated tracks', async () => {
      const { lastInsertRowId } = await insertTrack(db, '1', 'Old Title', 'Artist');
      await db.run('UPDATE tracks SET title = ?, title_norm = ? WHERE id = ?', [
        'New Title',
        'new title',
        lastInsertRowId,
      ]);
      expect(await search(db, 'old')).toEqual([]);
      expect(await search(db, 'new')).toEqual([lastInsertRowId]);
    });

    it('removes deleted tracks from the index', async () => {
      const { lastInsertRowId } = await insertTrack(db, '1', 'Gone Song');
      await db.run('DELETE FROM tracks WHERE id = ?', [lastInsertRowId]);
      expect(await search(db, 'gone')).toEqual([]);
    });

    it('indexes the normalised columns', async () => {
      const { lastInsertRowId } = await insertTrack(db, '1', 'Café Müller', 'Χατζιδάκις');
      expect(await search(db, 'cafe')).toEqual([lastInsertRowId]);
      expect(await search(db, 'muller')).toEqual([lastInsertRowId]);
      expect(await search(db, 'χατζιδακισ')).toEqual([lastInsertRowId]);
    });

    it('passes the FTS5 integrity check after inserts, updates and deletes', async () => {
      await insertTrack(db, '1', 'A');
      await insertTrack(db, '2', 'B');
      await db.run("UPDATE tracks SET artist = 'X', artist_norm = 'x'");
      await db.run("DELETE FROM tracks WHERE provider_ref = '1'");
      await expect(
        db.run("INSERT INTO tracks_fts (tracks_fts, rank) VALUES ('integrity-check', 1)"),
      ).resolves.toBeDefined();
    });
  });

  it('groups albums and artists in views', async () => {
    await insertTrack(db, '1', 'a', 'Artist', 'Album');
    await insertTrack(db, '2', 'b', 'Artist', 'Album');
    await insertTrack(db, '3', 'c', 'Artist', 'Other');
    expect(await db.getAll('SELECT name, artist, track_count FROM albums ORDER BY name')).toEqual([
      { name: 'Album', artist: 'Artist', track_count: 2 },
      { name: 'Other', artist: 'Artist', track_count: 1 },
    ]);
    expect(await db.getAll('SELECT name, track_count, album_count FROM artists')).toEqual([
      { name: 'Artist', track_count: 3, album_count: 2 },
    ]);
  });

  it('cascades track deletes to playlist items', async () => {
    const { lastInsertRowId: trackId } = await insertTrack(db, '1', 'a');
    const { lastInsertRowId: playlistId } = await db.run(
      "INSERT INTO playlists (name, created_at, updated_at) VALUES ('p', 0, 0)",
    );
    await db.run('INSERT INTO playlist_items (playlist_id, position, track_id) VALUES (?, 0, ?)', [
      playlistId,
      trackId,
    ]);
    await db.run('DELETE FROM tracks WHERE id = ?', [trackId]);
    expect(await db.getFirst('SELECT COUNT(*) AS n FROM playlist_items')).toEqual({ n: 0 });
  });

  it('only stores valid JSON in kv', async () => {
    await expect(db.run("INSERT INTO kv (key, value) VALUES ('k', 'not json')")).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });
});
