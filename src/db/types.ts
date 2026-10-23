export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = readonly SqlValue[];

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * Minimal async database surface shared by the expo-sqlite implementation (device)
 * and the better-sqlite3 implementation (Node tests).
 */
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  getAll<T>(sql: string, params?: SqlParams): Promise<T[]>;
  getFirst<T>(sql: string, params?: SqlParams): Promise<T | null>;
  /**
   * Runs `fn` inside one transaction: commits when it resolves, rolls back when it rejects.
   * All queries inside must go through `tx`. Nested calls on `tx` join the outer transaction.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
