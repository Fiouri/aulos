import type { Db } from './types';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  /** Data step that needs TypeScript (for example a backfill); runs after `sql`, same transaction. */
  up?: (tx: Db) => Promise<void>;
}

export class MigrationError extends Error {
  override name = 'MigrationError';
}

function assertOrdered(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (!Number.isInteger(m.version) || m.version < 1) {
      throw new MigrationError(`Invalid migration version ${m.version} (${m.name})`);
    }
    const prev = migrations[i - 1];
    if (prev && m.version <= prev.version) {
      throw new MigrationError(
        `Migrations must be strictly ascending: ${prev.version} then ${m.version}`,
      );
    }
  });
}

/**
 * Applies pending forward-only migrations in version order. Each migration and its
 * schema_migrations row commit in one transaction, so a failure leaves no partial schema.
 * Returns the versions applied by this call (empty when already up to date).
 */
export async function migrate(
  db: Db,
  migrations: readonly Migration[],
  now: () => number = Date.now,
): Promise<number[]> {
  assertOrdered(migrations);

  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );

  const rows = await db.getAll<{ version: number }>('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(rows.map((r) => r.version));
  const known = new Set(migrations.map((m) => m.version));
  const unknown = [...appliedVersions].filter((v) => !known.has(v));
  if (unknown.length > 0) {
    throw new MigrationError(
      `Database has migrations this build does not know: ${unknown.join(', ')}`,
    );
  }

  const applied: number[] = [];
  for (const m of migrations) {
    if (appliedVersions.has(m.version)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      if (m.up) await m.up(tx);
      await tx.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        m.version,
        now(),
      ]);
    });
    applied.push(m.version);
  }
  return applied;
}
