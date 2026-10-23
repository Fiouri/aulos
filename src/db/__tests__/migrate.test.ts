/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate, MigrationError, type Migration } from '../migrate';
import { MIGRATIONS } from '../migrations';

const appliedVersions = async (db: NodeDb) =>
  (
    await db.getAll<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
  ).map((r) => r.version);

describe('migrate', () => {
  let db: NodeDb;
  beforeEach(() => {
    db = openNodeDb();
  });
  afterEach(() => db.close());

  it('applies every migration once and records it with a timestamp', async () => {
    const applied = await migrate(db, MIGRATIONS, () => 1234);
    expect(applied).toEqual(MIGRATIONS.map((m) => m.version));
    const rows = await db.getAll<{ version: number; applied_at: number }>(
      'SELECT version, applied_at FROM schema_migrations',
    );
    expect(rows).toEqual(MIGRATIONS.map((m) => ({ version: m.version, applied_at: 1234 })));
  });

  it('is a no-op when re-run', async () => {
    await migrate(db, MIGRATIONS);
    await db.run(
      "INSERT INTO tracks (provider, provider_ref, title) VALUES ('local', '1', 'Kept')",
    );
    expect(await migrate(db, MIGRATIONS)).toEqual([]);
    expect(await appliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await db.getFirst('SELECT title FROM tracks')).toEqual({ title: 'Kept' });
  });

  it('applies only the pending migrations, in order', async () => {
    const first: Migration = { version: 1, name: 'a', sql: 'CREATE TABLE a (id INTEGER)' };
    const second: Migration = { version: 2, name: 'b', sql: 'CREATE TABLE b (id INTEGER)' };
    expect(await migrate(db, [first])).toEqual([1]);
    expect(await migrate(db, [first, second])).toEqual([2]);
    expect(await appliedVersions(db)).toEqual([1, 2]);
  });

  it('rolls back a failing migration and does not record it', async () => {
    const ok: Migration = { version: 1, name: 'ok', sql: 'CREATE TABLE ok (id INTEGER)' };
    const broken: Migration = {
      version: 2,
      name: 'broken',
      sql: 'CREATE TABLE half (id INTEGER); INSERT INTO missing_table VALUES (1);',
    };
    await expect(migrate(db, [ok, broken])).rejects.toThrow(/missing_table/);
    expect(await appliedVersions(db)).toEqual([1]);
    expect(
      await db.getFirst("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half'"),
    ).toBeNull();
  });

  it('rejects migrations that are not strictly ascending', async () => {
    const m = (version: number): Migration => ({ version, name: `m${version}`, sql: 'SELECT 1' });
    await expect(migrate(db, [m(2), m(1)])).rejects.toThrow(MigrationError);
    await expect(migrate(db, [m(1), m(1)])).rejects.toThrow(MigrationError);
    await expect(migrate(db, [m(0)])).rejects.toThrow(MigrationError);
  });

  it('refuses a database migrated by a newer build', async () => {
    await migrate(db, MIGRATIONS);
    await db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (999, 0)');
    await expect(migrate(db, MIGRATIONS)).rejects.toThrow(/999/);
  });
});
