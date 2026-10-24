import type { Db } from '@/db/types';
import { LOCAL_PROVIDER } from '@/library/providers';
import { NotFoundError } from '@/net/errors';
import { searchLibrary } from '@/search/search';

import type { SourceProvider } from './types';

/**
 * The device library as a provider, so the Search tab runs one code path for every source.
 * Everything is already in the tracks table; streams are the local files themselves.
 */
export function createLocalProvider(db: Db): SourceProvider {
  return {
    id: LOCAL_PROVIDER,
    capabilities: ['search', 'stream', 'albums', 'artists'],

    async search(query, { types, limit }) {
      const results = await searchLibrary(db, query, limit);
      return {
        tracks: types.includes('tracks') ? results.songs : [],
        albums: types.includes('albums') ? results.albums : [],
        artists: types.includes('artists') ? results.artists : [],
        playlists: types.includes('playlists') ? results.playlists : [],
      };
    },

    async resolveStream(ref) {
      const row = await db.getFirst<{ localPath: string | null }>(
        'SELECT local_path AS localPath FROM tracks WHERE provider = ? AND provider_ref = ?',
        [LOCAL_PROVIDER, ref],
      );
      if (!row?.localPath) throw new NotFoundError('Track not in the library');
      return { url: row.localPath, mime: 'audio/*' };
    },
  };
}
