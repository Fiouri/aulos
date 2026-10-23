import * as SQLite from 'expo-sqlite';

import { assertFts5 } from './fts';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import type { Db, RunResult, SqlParams } from './types';

export const DATABASE_NAME = 'aulos.db';

class ExpoDb implements Db {
  readonly #conn: SQLite.SQLiteDatabase;
  readonly #inTransaction: boolean;

  constructor(conn: SQLite.SQLiteDatabase, inTransaction: boolean) {
    this.#conn = conn;
    this.#inTransaction = inTransaction;
  }

  async exec(sql: string): Promise<void> {
    await this.#conn.execAsync(sql);
  }

  async run(sql: string, params: SqlParams = []): Promise<RunResult> {
    const result = await this.#conn.runAsync(sql, [...params]);
    return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
  }

  getAll<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.#conn.getAllAsync<T>(sql, [...params]);
  }

  getFirst<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    return this.#conn.getFirstAsync<T>(sql, [...params]);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.#inTransaction) return fn(this);
    const box: { result?: { value: T } } = {};
    await this.#conn.withExclusiveTransactionAsync(async (txn) => {
      box.result = { value: await fn(new ExpoDb(txn, true)) };
    });
    if (!box.result) throw new Error('Transaction finished without a result');
    return box.result.value;
  }
}

/** Opens the app database (WAL, foreign keys on), checks FTS5 and applies migrations. */
export async function openAppDb(): Promise<Db> {
  const conn = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await conn.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const db = new ExpoDb(conn, false);
  await assertFts5(db);
  await migrate(db, MIGRATIONS);
  return db;
}
