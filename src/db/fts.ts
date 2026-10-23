import type { Db } from './types';

export class Fts5UnavailableError extends Error {
  override name = 'Fts5UnavailableError';
  constructor() {
    super('This SQLite build has no FTS5 support; offline search cannot work.');
  }
}

/** Fails fast instead of silently running without full-text search. */
export async function assertFts5(db: Db): Promise<void> {
  const row = await db.getFirst<{ fts5: number }>(
    "SELECT sqlite_compileoption_used('ENABLE_FTS5') AS fts5",
  );
  if (row?.fts5 !== 1) throw new Fts5UnavailableError();
}
