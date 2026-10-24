import type { Db } from '@/db/types';
import { albumGroupKey } from '@/library/albumKey';
import { getTracks, type Track } from '@/library/queries';
import { normalizeNullable, normalizeText } from '@/search/normalize';

import { isStoredTrack, type RemoteTrack, type TrackItem } from './types';

/**
 * Stores remote tracks the user acts on (queue, playlist, favourite, download) and returns
 * every item as a stored Track, in order. A track already stored keeps its id, local file and
 * history; its tags are refreshed from the provider.
 */
export async function storeTracks(
  db: Db,
  items: readonly TrackItem[],
  now: number = Date.now(),
): Promise<Track[]> {
  const remote = items.filter((i): i is RemoteTrack => !isStoredTrack(i));
  const ids = new Map<string, number>();
  if (remote.length > 0) {
    await db.transaction(async (tx) => {
      for (const t of remote) {
        const albumKey = albumGroupKey({
          provider: t.provider,
          album: t.album,
          albumArtist: t.albumArtist,
          albumRef: t.albumRef,
          folder: null,
        });
        await tx.run(
          `INSERT INTO tracks (provider, provider_ref, title, artist, album, album_artist, track_no,
                               disc_no, duration_ms, album_ref, album_key, license_url, attribution,
                               added_at, title_norm, artist_norm, album_norm, album_artist_norm)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (provider, provider_ref) DO UPDATE SET
             title = excluded.title, artist = excluded.artist, album = excluded.album,
             album_artist = excluded.album_artist, track_no = excluded.track_no,
             disc_no = excluded.disc_no, duration_ms = excluded.duration_ms,
             album_ref = excluded.album_ref, album_key = excluded.album_key,
             license_url = excluded.license_url, attribution = excluded.attribution,
             title_norm = excluded.title_norm, artist_norm = excluded.artist_norm,
             album_norm = excluded.album_norm, album_artist_norm = excluded.album_artist_norm`,
          [
            t.provider,
            t.providerRef,
            t.title,
            t.artist,
            t.album,
            t.albumArtist,
            t.trackNo,
            t.discNo,
            t.durationMs,
            t.albumRef,
            albumKey,
            t.licenseUrl,
            t.attribution,
            now,
            normalizeText(t.title),
            normalizeNullable(t.artist),
            normalizeNullable(t.album),
            normalizeNullable(t.albumArtist),
          ],
        );
        const row = await tx.getFirst<{ id: number }>(
          'SELECT id FROM tracks WHERE provider = ? AND provider_ref = ?',
          [t.provider, t.providerRef],
        );
        if (row) ids.set(`${t.provider}\u0000${t.providerRef}`, row.id);
      }
    });
  }
  const order = items.flatMap((item) => {
    if (isStoredTrack(item)) return [item.id];
    const id = ids.get(`${item.provider}\u0000${item.providerRef}`);
    return id === undefined ? [] : [id];
  });
  return getTracks(db, order);
}

/** The stored copy of a remote track, if the user has used it before. */
export async function findStoredTrack(db: Db, item: TrackItem): Promise<Track | null> {
  if (isStoredTrack(item)) return item;
  const row = await db.getFirst<{ id: number }>(
    'SELECT id FROM tracks WHERE provider = ? AND provider_ref = ?',
    [item.provider, item.providerRef],
  );
  if (!row) return null;
  const [track] = await getTracks(db, [row.id]);
  return track ?? null;
}
