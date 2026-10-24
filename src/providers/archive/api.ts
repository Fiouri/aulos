import { CACHE_TTL_S, cachedJson, type HttpCache } from '@/net/cache';
import { NotFoundError } from '@/net/errors';
import type { HttpJson } from '@/net/httpJson';
import { normalizeText } from '@/search/normalize';

import { ARCHIVE_ORIGIN, metadataUrl } from './mapping';
import {
  metadataResponseSchema,
  searchResponseSchema,
  type ItemMetadata,
  type SearchResponse,
} from './schemas';

const SEARCH_FIELDS = ['identifier', 'title', 'creator', 'year', 'licenseurl'] as const;

/** Lucene special characters, escaped so a user query is always taken literally. */
const LUCENE_SPECIAL = /([+\-!(){}[\]^"~*?:\\/&|])/g;

/**
 * Search query: every word must match, items must be audio and carry an MP3 (so they have
 * something to stream). Null for a query without words.
 */
export function searchQuery(text: string): string | null {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '')
    .map((w) => w.replace(LUCENE_SPECIAL, '\\$1'));
  if (words.length === 0) return null;
  return `(${words.join(' AND ')}) AND mediatype:(audio) AND format:("VBR MP3" OR "MP3")`;
}

/** advancedsearch.php, relevance order, first page. Same request as scripts/record-fixtures.ps1. */
export function searchUrl(query: string, rows: number): string {
  const params = [
    `q=${encodeURIComponent(query)}`,
    ...SEARCH_FIELDS.map((f) => `fl%5B%5D=${f}`),
    `rows=${rows}`,
    'page=1',
    'output=json',
  ];
  return `${ARCHIVE_ORIGIN}/advancedsearch.php?${params.join('&')}`;
}

export interface ArchiveApi {
  search(text: string, rows: number, signal?: AbortSignal): Promise<SearchResponse>;
  /** Rejects with NotFoundError for an item that does not exist. */
  item(identifier: string, signal?: AbortSignal): Promise<ItemMetadata>;
}

/** archive.org search and metadata through the shared JSON client and the TTL cache. */
export function createArchiveApi(httpJson: HttpJson, cache: HttpCache): ArchiveApi {
  return {
    async search(text, rows, signal) {
      const query = searchQuery(text);
      if (query === null) return { response: { numFound: 0, docs: [] } };
      return cachedJson(
        cache,
        `archive:search:${rows}:${normalizeText(text)}`,
        CACHE_TTL_S.search,
        searchResponseSchema,
        () => httpJson(searchUrl(query, rows), searchResponseSchema, { signal }),
      );
    },
    async item(identifier, signal) {
      const response = await cachedJson(
        cache,
        `archive:metadata:${identifier}`,
        CACHE_TTL_S.metadata,
        metadataResponseSchema,
        () => httpJson(metadataUrl(identifier), metadataResponseSchema, { signal }),
      );
      if (Array.isArray(response) || !response.metadata || !response.files) {
        throw new NotFoundError('Item not found');
      }
      return { identifier, metadata: response.metadata, files: response.files };
    },
  };
}
