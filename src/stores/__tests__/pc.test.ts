/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createJamClient } from '../../nuclear/client';
import { parseJamEvent } from '../../nuclear/events';
import { listPairings, savePairing, type Pairing } from '../../nuclear/pairings';
import type { JamTrack } from '../../nuclear/schemas';
import type { SseHandlers } from '../../nuclear/sse';
import { usePcStore } from '../pc';

jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
}));

const track = (title: string, artist: string, durationMs?: number): JamTrack => ({
  title,
  artists: [{ name: artist, roles: ['main'] }],
  ...(durationMs === undefined ? {} : { durationMs }),
  source: { provider: 'youtube', id: `yt-${title}` },
});

const QUEUE = {
  items: [
    { id: 'q1', track: track('One', 'A', 200_000), status: 'success', addedAtIso: 'x' },
    { id: 'q2', track: track('Two', 'B', 180_000), status: 'idle', addedAtIso: 'x' },
  ],
  currentIndex: 0,
};

describe('parseJamEvent', () => {
  it('types queue, playback and settings frames and drops the rest', () => {
    expect(parseJamEvent({ type: 'queue', data: JSON.stringify(QUEUE) })).toEqual({
      type: 'queue',
      queue: QUEUE,
    });
    expect(
      parseJamEvent({ type: 'playback', data: '{"status":"paused","seek":3,"duration":200}' }),
    ).toEqual({ type: 'playback', playback: { status: 'paused', seek: 3, duration: 200 } });
    expect(
      parseJamEvent({ type: 'settings', data: '{"shuffle":true,"repeat":"one","dark":false}' }),
    ).toMatchObject({ type: 'settings', settings: { shuffle: true, repeat: 'one' } });
    expect(parseJamEvent({ type: 'lyrics', data: '{}' })).toBeNull();
    expect(parseJamEvent({ type: 'queue', data: 'not json' })).toBeNull();
    expect(parseJamEvent({ type: 'playback', data: '{"status":1}' })).toBeNull();
  });
});

describe('PC store', () => {
  let db: NodeDb;
  let pairing: Pairing;
  let handlers: SseHandlers | null;
  let stopped: number;
  let calls: { url: string; body: unknown }[];
  let searchTracks: JamTrack[];

  const respond = (url: string): unknown => {
    if (url.endsWith('/api/queue')) return QUEUE;
    if (url.endsWith('/api/playback')) return { status: 'playing', seek: 10, duration: 200 };
    if (url.endsWith('/api/settings')) return { shuffle: false, repeat: 'off' };
    if (url.endsWith('/api/playback/volume')) return { volume: 0.5 };
    if (url.endsWith('/api/search')) return { tracks: searchTracks };
    return null;
  };

  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    pairing = await savePairing(db, 'Desk', 'http://192.168.1.40:4120', 1);
    handlers = null;
    stopped = 0;
    calls = [];
    searchTracks = [];
    const fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({
        url: String(url).replace('http://192.168.1.40:4120', ''),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const body = respond(String(url));
      return new Response(body === null ? null : JSON.stringify(body), { status: 200 });
    }) as typeof globalThis.fetch;
    usePcStore.setState(usePcStore.getInitialState(), true);
    usePcStore.getState().init(db, {
      createClient: (baseUrl) => createJamClient({ baseUrl, fetch }),
      openEvents: (_url, h) => {
        handlers = h;
        return {
          stop: () => {
            stopped += 1;
          },
        };
      },
      now: () => 500,
    });
  });
  afterEach(() => db.close());

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('connects, loads the state when the stream opens and follows events', async () => {
    usePcStore.getState().connect(pairing);
    expect(usePcStore.getState().connection).toBe('connecting');
    handlers?.onState('open');
    handlers?.onOpen();
    await flush();
    await flush();
    const state = usePcStore.getState();
    expect(state.connection).toBe('connected');
    expect(state.queue?.items.map((i) => i.id)).toEqual(['q1', 'q2']);
    expect(state.playback).toEqual({ status: 'playing', seek: 10, duration: 200 });
    expect(state.volume).toBe(0.5);
    expect((await listPairings(db))[0]?.lastSeenAt).toBe(500);

    // A skip on the PC arrives as events.
    handlers?.onEvent({
      type: 'queue',
      data: JSON.stringify({ ...QUEUE, currentIndex: 1 }),
    });
    handlers?.onEvent({ type: 'playback', data: '{"status":"playing","seek":0,"duration":180}' });
    expect(usePcStore.getState().queue?.currentIndex).toBe(1);
    expect(usePcStore.getState().playback?.seek).toBe(0);

    handlers?.onState('reconnecting');
    expect(usePcStore.getState().connection).toBe('reconnecting');
  });

  it('sends controls and queue actions to the PC', async () => {
    usePcStore.getState().connect(pairing);
    handlers?.onOpen();
    await flush();
    await flush();
    calls = [];
    const pc = usePcStore.getState();
    await pc.togglePlay();
    await pc.next();
    await pc.previous();
    await pc.seek(42);
    await pc.setVolume(0.8);
    await pc.toggleShuffle();
    await pc.cycleRepeat();
    await pc.goTo(1);
    await pc.remove('q2');
    await pc.favoriteCurrent();
    await pc.clearQueue();
    expect(calls).toEqual([
      { url: '/api/playback/toggle', body: undefined },
      { url: '/api/playback/next', body: undefined },
      { url: '/api/playback/previous', body: undefined },
      { url: '/api/playback/seek', body: { seconds: 42 } },
      { url: '/api/playback/volume', body: { volume: 0.8 } },
      { url: '/api/playback/shuffle', body: { enabled: true } },
      { url: '/api/playback/repeat', body: { mode: 'all' } },
      { url: '/api/queue/go-to', body: { index: 1 } },
      { url: '/api/queue/remove', body: { ids: ['q2'] } },
      { url: '/api/favorites/tracks/add', body: { track: QUEUE.items[0]?.track } },
      { url: '/api/queue/clear', body: undefined },
    ]);
    expect(usePcStore.getState().volume).toBe(0.8);
  });

  it('sends the confident match to the PC queue, or returns the candidates', async () => {
    usePcStore.getState().connect(pairing);
    const live = track('Gerakina (Live)', 'Tsitsanis', 250_000);
    const studio = track('Gerakina', 'Tsitsanis', 201_000);
    searchTracks = [live, studio];
    const sent = await usePcStore
      .getState()
      .sendToPc({ title: 'Gerakina', artist: 'Tsitsanis, Georgakopoulou', durationMs: 200_000 });
    expect(sent).toEqual({ match: studio });
    expect(calls.map((c) => c.url)).toEqual(['/api/search', '/api/queue/add']);
    expect(calls[0]?.body).toEqual({ query: 'Tsitsanis Gerakina', types: ['tracks'], limit: 10 });
    expect(calls[1]?.body).toEqual({ tracks: [studio] });

    calls = [];
    searchTracks = [live];
    const unsure = await usePcStore
      .getState()
      .sendToPc({ title: 'Gerakina', artist: 'Tsitsanis', durationMs: 200_000 });
    expect(unsure).toEqual({ candidates: [live] });
    expect(calls.map((c) => c.url)).toEqual(['/api/search']);
  });

  it('keeps the last error instead of throwing, and disconnects cleanly', async () => {
    await usePcStore.getState().togglePlay();
    expect(usePcStore.getState().lastError).toMatch(/unreachable/);
    usePcStore.getState().connect(pairing);
    const before = stopped;
    usePcStore.getState().disconnect();
    expect(stopped).toBe(before + 1);
    expect(usePcStore.getState()).toMatchObject({ connection: 'disconnected', pairing: null });
  });
});
