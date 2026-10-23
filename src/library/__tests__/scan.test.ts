/**
 * @jest-environment node
 */
import type { MediaStoreAudio } from '../../../modules/media-store';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { countLocalTracks, scanLibrary } from '../scan';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

const audio = (id: string, overrides: Partial<MediaStoreAudio> = {}): MediaStoreAudio => ({
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
  albumId: '1',
  mimeType: 'audio/mpeg',
  ...overrides,
});

const clock = () => {
  let t = 1000;
  return () => (t += 250);
};

describe('scanLibrary', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
  });
  afterEach(() => db.close());

  it('inserts local tracks on the first scan', async () => {
    const result = await scanLibrary(db, async () => [audio('1'), audio('2')], clock());
    expect(result).toEqual({ added: 2, updated: 0, removed: 0, total: 2, durationMs: 250 });
    expect(await countLocalTracks(db)).toBe(2);
    expect(
      await db.getFirst(
        "SELECT provider, provider_ref, local_path FROM tracks WHERE provider_ref = '1'",
      ),
    ).toEqual({
      provider: 'local',
      provider_ref: '1',
      local_path: 'content://media/external/audio/media/1',
    });
  });

  it('is idempotent when nothing changed', async () => {
    await scanLibrary(db, async () => [audio('1')]);
    const result = await scanLibrary(db, async () => [audio('1')]);
    expect(result).toMatchObject({ added: 0, updated: 0, removed: 0, total: 1 });
  });

  it('updates changed rows in place and removes vanished files', async () => {
    await scanLibrary(db, async () => [audio('1'), audio('2')]);
    const before = await db.getFirst<{ id: number }>(
      "SELECT id FROM tracks WHERE provider_ref = '1'",
    );

    const result = await scanLibrary(db, async () => [
      audio('1', { title: 'Renamed' }),
      audio('3'),
    ]);

    expect(result).toMatchObject({ added: 1, updated: 1, removed: 1, total: 2 });
    expect(await db.getFirst("SELECT id, title FROM tracks WHERE provider_ref = '1'")).toEqual({
      id: before?.id,
      title: 'Renamed',
    });
    expect(await db.getFirst("SELECT id FROM tracks WHERE provider_ref = '2'")).toBeNull();
  });

  it('never touches tracks from other providers', async () => {
    await db.run(
      "INSERT INTO tracks (provider, provider_ref, title) VALUES ('archive', 'x', 'Remote')",
    );
    const result = await scanLibrary(db, async () => []);
    expect(result).toMatchObject({ removed: 0, total: 0 });
    expect(await db.getFirst('SELECT COUNT(*) AS n FROM tracks')).toEqual({ n: 1 });
  });

  it('keeps search in sync with the scan', async () => {
    await scanLibrary(db, async () => [audio('1', { title: 'Zorba' })]);
    await scanLibrary(db, async () => [audio('1', { title: 'Sirtaki' })]);
    const hits = await db.getAll("SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH 'zorba'");
    expect(hits).toEqual([]);
    const renamed = await db.getAll(
      "SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH 'sirtaki'",
    );
    expect(renamed).toHaveLength(1);
  });

  it('rolls back the whole scan when a write fails', async () => {
    await scanLibrary(db, async () => [audio('1')]);
    await db.run(
      "CREATE TRIGGER fail_insert BEFORE INSERT ON tracks BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    await expect(scanLibrary(db, async () => [audio('2')])).rejects.toThrow(/boom/);
    expect(await db.getAll('SELECT provider_ref FROM tracks')).toEqual([{ provider_ref: '1' }]);
  });
});
