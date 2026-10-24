/**
 * @jest-environment node
 */
import { z } from 'zod';

import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { CACHE_TTL_S, cachedJson, createHttpCache } from '../cache';

const schema = z.object({ n: z.number() });

describe('http cache', () => {
  let db: NodeDb;
  let now: number;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    now = 1_000_000;
  });
  afterEach(() => db.close());

  it('serves an entry until its TTL ends', async () => {
    const cache = createHttpCache(db, () => now);
    await cache.set('archive:search:x', { n: 1 }, CACHE_TTL_S.search);
    now += CACHE_TTL_S.search * 1000 - 1;
    expect(await cache.get('archive:search:x', schema)).toEqual({ n: 1 });
    now += 1;
    expect(await cache.get('archive:search:x', schema)).toBeUndefined();
    expect(CACHE_TTL_S).toEqual({ search: 3600, metadata: 86_400 });
  });

  it('treats a stored body that no longer matches the schema as a miss', async () => {
    const cache = createHttpCache(db, () => now);
    await cache.set('k', { n: 'one' }, 60);
    expect(await cache.get('k', schema)).toBeUndefined();
  });

  it('loads once and serves the cached copy afterwards', async () => {
    const cache = createHttpCache(db, () => now);
    const load = jest.fn(async () => ({ n: 7 }));
    expect(await cachedJson(cache, 'k', 60, schema, load)).toEqual({ n: 7 });
    expect(await cachedJson(cache, 'k', 60, schema, load)).toEqual({ n: 7 });
    expect(load).toHaveBeenCalledTimes(1);
    now += 60_000;
    await cachedJson(cache, 'k', 60, schema, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('purges expired entries only', async () => {
    const cache = createHttpCache(db, () => now);
    await cache.set('short', { n: 1 }, 10);
    await cache.set('long', { n: 2 }, 1000);
    now += 10_000;
    expect(await cache.purgeExpired()).toBe(1);
    expect(await db.getAll('SELECT key FROM http_cache')).toEqual([{ key: 'long' }]);
  });
});
