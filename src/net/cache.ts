import type { z } from 'zod';

import type { Db } from '@/db/types';

/** Cache lifetimes in seconds: searches change often, item metadata rarely. */
export const CACHE_TTL_S = { search: 60 * 60, metadata: 24 * 60 * 60 } as const;

export interface HttpCache {
  /** The stored body when it is younger than its TTL and still matches `schema`. */
  get<T>(key: string, schema: z.ZodType<T>): Promise<T | undefined>;
  set(key: string, body: unknown, ttlS: number): Promise<void>;
  /** Drops expired entries; returns how many were removed. */
  purgeExpired(): Promise<number>;
}

interface CacheRow {
  body: string;
  fetched_at: number;
  ttl_s: number;
}

/**
 * Response cache in the http_cache table, keyed by provider and normalised request, so repeat
 * views are instant and archive.org sees fewer requests. Bodies are stored after validation and
 * validated again when read, so a schema change never serves a stale shape.
 */
export function createHttpCache(db: Db, now: () => number = Date.now): HttpCache {
  return {
    async get(key, schema) {
      const row = await db.getFirst<CacheRow>(
        'SELECT body, fetched_at, ttl_s FROM http_cache WHERE key = ?',
        [key],
      );
      if (!row || now() - row.fetched_at >= row.ttl_s * 1000) return undefined;
      const parsed = schema.safeParse(JSON.parse(row.body));
      return parsed.success ? parsed.data : undefined;
    },
    async set(key, body, ttlS) {
      await db.run(
        `INSERT INTO http_cache (key, body, fetched_at, ttl_s) VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at,
                                         ttl_s = excluded.ttl_s`,
        [key, JSON.stringify(body), now(), ttlS],
      );
    },
    async purgeExpired() {
      const result = await db.run('DELETE FROM http_cache WHERE fetched_at + ttl_s * 1000 <= ?', [
        now(),
      ]);
      return result.changes;
    },
  };
}

/** Serves `key` from the cache, or loads, stores and returns it. */
export async function cachedJson<T>(
  cache: HttpCache,
  key: string,
  ttlS: number,
  schema: z.ZodType<T>,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get(key, schema);
  if (hit !== undefined) return hit;
  const body = await load();
  await cache.set(key, body, ttlS);
  return body;
}
