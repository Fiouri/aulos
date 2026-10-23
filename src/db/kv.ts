import type { Db } from './types';

/** Reads a JSON value from kv; undefined when the key is absent. */
export async function getKv(db: Db, key: string): Promise<unknown> {
  const row = await db.getFirst<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
  if (!row) return undefined;
  const value: unknown = JSON.parse(row.value);
  return value;
}

export async function setKv(db: Db, key: string, value: unknown): Promise<void> {
  await db.run(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}
