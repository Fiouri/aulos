import Database from 'better-sqlite3';

import type { Db, RunResult, SqlParams, SqlValue } from '@/db/types';

type BindValue = string | number | null | Buffer;

function toBind(params: SqlParams): BindValue[] {
  return params.map((v: SqlValue) => (v instanceof Uint8Array ? Buffer.from(v) : v));
}

export interface NodeDb extends Db {
  close(): void;
}

/** better-sqlite3 implementation of Db, used only by Jest. Same pragmas as the device. */
export function openNodeDb(filename = ':memory:'): NodeDb {
  const conn = new Database(filename);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  let inTransaction = false;

  const db: NodeDb = {
    async exec(sql) {
      conn.exec(sql);
    },
    async run(sql, params = []): Promise<RunResult> {
      const r = conn.prepare(sql).run(...toBind(params));
      return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAll<T>(sql: string, params: SqlParams = []) {
      return conn.prepare<BindValue[], T>(sql).all(...toBind(params));
    },
    async getFirst<T>(sql: string, params: SqlParams = []) {
      return conn.prepare<BindValue[], T>(sql).get(...toBind(params)) ?? null;
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      if (inTransaction) return fn(db);
      conn.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      try {
        const result = await fn(db);
        conn.exec('COMMIT');
        return result;
      } catch (error) {
        conn.exec('ROLLBACK');
        throw error;
      } finally {
        inTransaction = false;
      }
    },
    close() {
      conn.close();
    },
  };
  return db;
}
