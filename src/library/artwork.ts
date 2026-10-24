/** Thumbnail sizes requested from native, so nearby display sizes share one cached file. */
export const ARTWORK_BUCKETS = [128, 256, 512, 1024] as const;
const LARGEST_BUCKET = 1024;

export function artworkBucket(px: number): number {
  return ARTWORK_BUCKETS.find((b) => b >= px) ?? LARGEST_BUCKET;
}

/** What to load artwork for: a cache identity plus one playable file of it. */
export interface ArtworkSource {
  key: string;
  contentUri: string;
}

/** Artwork is read through the MediaStore, so only content:// files have it (not downloads). */
function hasMediaStoreArtwork(uri: string | null): uri is string {
  return uri !== null && uri.startsWith('content://');
}

/** Tracks of one album share artwork; a track without an album stands alone. */
export function trackArtworkSource(track: {
  albumKey: string | null;
  localPath: string | null;
}): ArtworkSource | null {
  if (!hasMediaStoreArtwork(track.localPath)) return null;
  const key = track.albumKey ? `album:${track.albumKey}` : `track:${track.localPath}`;
  return { key, contentUri: track.localPath };
}

export function albumArtworkSource(album: {
  key: string;
  samplePath: string | null;
}): ArtworkSource | null {
  if (!hasMediaStoreArtwork(album.samplePath)) return null;
  return { key: `album:${album.key}`, contentUri: album.samplePath };
}

export type ArtworkLoader = (contentUri: string, sizePx: number) => Promise<string | null>;

export interface ArtworkCache {
  /** Resolved value if already known: a URI, null for "no artwork", undefined when not loaded. */
  peek(source: ArtworkSource, sizePx: number): string | null | undefined;
  /** Loads once per key and size; concurrent callers share one native call. */
  get(source: ArtworkSource, sizePx: number): Promise<string | null>;
  clear(): void;
}

/**
 * In-memory LRU in front of the native disk cache. Failed loads are not remembered, so a later
 * call retries; "no artwork" is remembered like a hit.
 */
export function createArtworkCache(load: ArtworkLoader, maxEntries = 400): ArtworkCache {
  const resolved = new Map<string, string | null>();
  const pending = new Map<string, Promise<string | null>>();

  const cacheKey = (source: ArtworkSource, sizePx: number) =>
    `${source.key}|${artworkBucket(sizePx)}`;

  const remember = (key: string, value: string | null) => {
    resolved.delete(key);
    resolved.set(key, value);
    while (resolved.size > maxEntries) {
      const oldest = resolved.keys().next();
      if (oldest.done) break;
      resolved.delete(oldest.value);
    }
  };

  return {
    peek(source, sizePx) {
      const key = cacheKey(source, sizePx);
      if (!resolved.has(key)) return undefined;
      const value = resolved.get(key) ?? null;
      remember(key, value);
      return value;
    },
    get(source, sizePx) {
      const key = cacheKey(source, sizePx);
      if (resolved.has(key)) {
        const value = resolved.get(key) ?? null;
        remember(key, value);
        return Promise.resolve(value);
      }
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;
      const request = load(source.contentUri, artworkBucket(sizePx))
        .then((uri) => {
          remember(key, uri);
          return uri;
        })
        .catch(() => null)
        .finally(() => pending.delete(key));
      pending.set(key, request);
      return request;
    },
    clear() {
      resolved.clear();
      pending.clear();
    },
  };
}
