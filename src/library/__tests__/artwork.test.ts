import {
  albumArtworkSource,
  artworkBucket,
  createArtworkCache,
  trackArtworkSource,
  type ArtworkSource,
} from '../artwork';

const source = (key: string): ArtworkSource => ({ key, contentUri: `content://x/${key}` });

describe('artwork cache', () => {
  it('rounds requested sizes up to a shared bucket', () => {
    expect(artworkBucket(10)).toBe(128);
    expect(artworkBucket(128)).toBe(128);
    expect(artworkBucket(300)).toBe(512);
    expect(artworkBucket(5000)).toBe(1024);
  });

  it('loads once per key and bucket and shares in-flight requests', async () => {
    const load = jest.fn(async (uri: string, size: number) => `file:///${uri}@${size}`);
    const cache = createArtworkCache(load);
    const [a, b] = await Promise.all([
      cache.get(source('album:1'), 100),
      cache.get(source('album:1'), 120),
    ]);
    expect(a).toBe('file:///content://x/album:1@128');
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.peek(source('album:1'), 64)).toBe(a);
    await cache.get(source('album:1'), 400);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('remembers "no artwork" but retries after a failure', async () => {
    const load = jest
      .fn<Promise<string | null>, [string, number]>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('io'))
      .mockResolvedValueOnce('file:///b.jpg');
    const cache = createArtworkCache(load);

    expect(await cache.get(source('none'), 128)).toBeNull();
    expect(cache.peek(source('none'), 128)).toBeNull();
    expect(await cache.get(source('none'), 128)).toBeNull();

    expect(await cache.get(source('b'), 128)).toBeNull();
    expect(cache.peek(source('b'), 128)).toBeUndefined();
    expect(await cache.get(source('b'), 128)).toBe('file:///b.jpg');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('evicts the least recently used entries', async () => {
    const cache = createArtworkCache(async (uri) => uri, 2);
    await cache.get(source('a'), 128);
    await cache.get(source('b'), 128);
    cache.peek(source('a'), 128);
    await cache.get(source('c'), 128);
    expect(cache.peek(source('a'), 128)).toBeDefined();
    expect(cache.peek(source('b'), 128)).toBeUndefined();
    expect(cache.peek(source('c'), 128)).toBeDefined();
  });

  it('keys tracks by album so an album shares one image', () => {
    const base = { artist: 'X', albumArtist: null, localPath: 'content://media/1' };
    expect(trackArtworkSource({ ...base, album: 'A' })).toEqual({
      key: 'album:["A","X"]',
      contentUri: 'content://media/1',
    });
    expect(albumArtworkSource({ name: 'A', artist: 'X', samplePath: 'content://media/9' })).toEqual(
      { key: 'album:["A","X"]', contentUri: 'content://media/9' },
    );
    expect(trackArtworkSource({ ...base, album: null })?.key).toBe('track:content://media/1');
    expect(trackArtworkSource({ ...base, album: 'A', localPath: null })).toBeNull();
    expect(albumArtworkSource({ name: 'A', artist: 'X', samplePath: null })).toBeNull();
  });
});
