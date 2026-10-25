/**
 * @jest-environment node
 */
import { CleartextBlockedError } from '../../net/guard';
import { createJamClient, jamBaseUrl, JamError } from '../client';
import type { JamTrack } from '../schemas';

/** A track as Nuclear's model shapes it (packages/model/src/index.ts). */
const TRACK: JamTrack = {
  title: 'Rainy Sunday',
  artists: [{ name: 'Vassilis Tsitsanis', roles: ['main'] }],
  album: { title: 'Rebetiko', source: { provider: 'musicbrainz', id: 'rel-1' } },
  durationMs: 192_000,
  artwork: { items: [{ url: 'https://example.org/cover.jpg', purpose: 'cover' }] },
  source: { provider: 'youtube', id: 'abc123', url: 'https://example.org/v/abc123' },
  streamCandidates: [],
};

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function setup(respond: (call: Call, signal?: AbortSignal) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    const call = {
      url: String(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call, init?.signal ?? undefined);
  });
  const client = createJamClient({
    baseUrl: 'http://192.168.1.5:4120',
    fetch: fetch as unknown as typeof globalThis.fetch,
    timeoutMs: 50,
  });
  return { client, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Jam client', () => {
  it('builds base URLs for IPv4, names and IPv6', () => {
    expect(jamBaseUrl('192.168.1.5', 4120)).toBe('http://192.168.1.5:4120');
    expect(jamBaseUrl('pc.tail1.ts.net', 4121)).toBe('http://pc.tail1.ts.net:4121');
    expect(jamBaseUrl('fe80::1', 4120)).toBe('http://[fe80::1]:4120');
    expect(jamBaseUrl('[fd00::2]', 4120)).toBe('http://[fd00::2]:4120');
  });

  it('reads and validates state', async () => {
    const queue = {
      items: [
        { id: 'q1', track: TRACK, status: 'success', addedAtIso: '2026-10-25T10:00:00.000Z' },
      ],
      currentIndex: 0,
    };
    const { client, calls } = setup(({ url }) => {
      if (url.endsWith('/api/health')) return json({ status: 'ok' });
      if (url.endsWith('/api/queue')) return json(queue);
      if (url.endsWith('/api/playback'))
        return json({ status: 'playing', seek: 12.5, duration: 192 });
      if (url.endsWith('/api/playback/volume')) return json({ volume: 0.4 });
      if (url.endsWith('/api/settings')) {
        return json({
          shuffle: false,
          repeat: 'all',
          discovery: false,
          language: 'en_US',
          dark: true,
          themeId: 'default',
          lyricsTextSize: 1,
        });
      }
      return json(true);
    });
    await expect(client.health()).resolves.toEqual({ status: 'ok' });
    expect((await client.queue()).items[0]?.track.artists[0]?.name).toBe('Vassilis Tsitsanis');
    // Unknown track fields (streamCandidates) survive, so tracks can be sent back as they are.
    expect((await client.queue()).items[0]?.track).toMatchObject({ streamCandidates: [] });
    await expect(client.playback()).resolves.toEqual({
      status: 'playing',
      seek: 12.5,
      duration: 192,
    });
    await expect(client.volume()).resolves.toBe(0.4);
    await expect(client.settings()).resolves.toMatchObject({ shuffle: false, repeat: 'all' });
    await expect(client.setting('core.playback.shuffle')).resolves.toBe(true);
    expect(calls.at(-1)?.url).toBe('http://192.168.1.5:4120/api/settings/core.playback.shuffle');
  });

  it('sends every action with Nuclear’s body shapes', async () => {
    const { client, calls } = setup(({ url }) =>
      url.endsWith('/from-queue') ? json({ id: 'pl-9' }) : new Response(null, { status: 200 }),
    );
    await client.play();
    await client.pause();
    await client.toggle();
    await client.next();
    await client.previous();
    await client.seek(42.5);
    await client.setShuffle(true);
    await client.setRepeat('one');
    await client.setVolume(1.4);
    await client.addToQueue([TRACK]);
    await client.removeFromQueue(['q1']);
    await client.goTo(3);
    await client.clearQueue();
    await client.addFavorite(TRACK);
    await client.removeFavorite(TRACK.source);
    await expect(client.saveQueueAsPlaylist('Phone mix')).resolves.toBe('pl-9');
    await client.setSetting('plugin.x.mailbox', { request: 1 });
    expect(
      calls.map((c) => [c.method, c.url.replace('http://192.168.1.5:4120', ''), c.body]),
    ).toEqual([
      ['POST', '/api/playback/play', undefined],
      ['POST', '/api/playback/pause', undefined],
      ['POST', '/api/playback/toggle', undefined],
      ['POST', '/api/playback/next', undefined],
      ['POST', '/api/playback/previous', undefined],
      ['POST', '/api/playback/seek', { seconds: 42.5 }],
      ['POST', '/api/playback/shuffle', { enabled: true }],
      ['POST', '/api/playback/repeat', { mode: 'one' }],
      ['POST', '/api/playback/volume', { volume: 1 }],
      ['POST', '/api/queue/add', { tracks: [TRACK] }],
      ['POST', '/api/queue/remove', { ids: ['q1'] }],
      ['POST', '/api/queue/go-to', { index: 3 }],
      ['POST', '/api/queue/clear', undefined],
      ['POST', '/api/favorites/tracks/add', { track: TRACK }],
      ['POST', '/api/favorites/tracks/remove', { source: TRACK.source }],
      ['POST', '/api/playlists/from-queue', { name: 'Phone mix' }],
      ['POST', '/api/settings/plugin.x.mailbox', { request: 1 }],
    ]);
  });

  it('searches with categories and a limit', async () => {
    const { client, calls } = setup(() => json({ tracks: [TRACK], artists: [] }));
    const results = await client.search('tsitsanis', { types: ['tracks'], limit: 10 });
    expect(results.tracks?.[0]?.title).toBe('Rainy Sunday');
    expect(calls[0]?.body).toEqual({ query: 'tsitsanis', types: ['tracks'], limit: 10 });
  });

  it('surfaces the { error } body of a failed request', async () => {
    const { client } = setup(() =>
      json({ error: 'Playback.toggle failed: no track in queue' }, 500),
    );
    const error = (await client.toggle().catch((e: unknown) => e)) as JamError;
    expect(error).toBeInstanceOf(JamError);
    expect(error.kind).toBe('http');
    expect(error.status).toBe(500);
    expect(error.serverMessage).toBe('Playback.toggle failed: no track in queue');
    expect(error.message).toBe('Playback.toggle failed: no track in queue');
  });

  it('reports timeouts, unreachable hosts and invalid shapes as typed errors', async () => {
    // Never answers; the client's own timeout aborts it.
    const hanging = setup(
      (_call, signal) =>
        new Promise<Response>((_, reject) =>
          signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    await expect(hanging.client.health()).rejects.toMatchObject({ kind: 'timeout' });

    const refused = setup(() => {
      throw new TypeError('Network request failed');
    });
    await expect(refused.client.next()).rejects.toMatchObject({ kind: 'unreachable' });

    const odd = setup(() => json({ items: 'nope' }));
    await expect(odd.client.queue()).rejects.toMatchObject({ kind: 'invalidResponse' });
  });

  it('refuses a Jam server on a public host', async () => {
    const client = createJamClient({ baseUrl: 'http://203.0.113.7:4120' });
    await expect(client.health()).rejects.toBeInstanceOf(CleartextBlockedError);
  });
});
