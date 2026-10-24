import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { z } from 'zod';

import { NotFoundError } from '../src/net/errors';
import type { HttpJson } from '../src/net/httpJson';

const DIR = join(__dirname, 'fixtures', 'archive');

/** A recorded Internet Archive response (see scripts/record-fixtures.ps1). */
export function archiveFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8'));
}

/** Search fixtures by query text, as recorded. */
const SEARCHES: Record<string, string> = {
  tsitsanis: 'search-tsitsanis.json',
  'cosmic voyager exalot': 'search-cosmic-voyager-exalot.json',
};

/**
 * An httpJson that answers from the recorded fixtures and never touches the network; unknown
 * requests fail like a missing page. Records every URL it was asked for.
 */
export function fixtureHttpJson(): HttpJson & { urls: string[] } {
  const urls: string[] = [];
  const httpJson = async <T>(url: string, schema: z.ZodType<T>): Promise<T> => {
    urls.push(url);
    const parsed = new URL(url);
    let file: string | undefined;
    if (parsed.pathname === '/advancedsearch.php') {
      const q = parsed.searchParams.get('q') ?? '';
      const words = /^\((.*)\) AND mediatype/.exec(q)?.[1]?.split(' AND ').join(' ');
      file = words === undefined ? undefined : SEARCHES[words];
    } else if (parsed.pathname.startsWith('/metadata/')) {
      file = `metadata-${decodeURIComponent(parsed.pathname.slice('/metadata/'.length))}.json`;
    }
    if (!file) throw new NotFoundError();
    return schema.parse(archiveFixture(file));
  };
  return Object.assign(httpJson, { urls });
}
