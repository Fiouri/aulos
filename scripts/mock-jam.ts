/**
 * Mock of Nuclear Jam's HTTP API (packages/docs/integrations/http-api.md) for the M3 Maestro
 * flows on the emulator, which reaches this machine's loopback at 10.0.2.2.
 *
 *   node scripts/mock-jam.ts [--port 4125] [--host 127.0.0.1]
 *
 * Serves health, playback, queue, settings, search, favourites, playlists/from-queue, lyrics
 * and the /api/events stream (named queue / playback / settings events, ": connected" first,
 * keep-alive comments every 15 s like axum's default). Playback advances one second per
 * second while playing. The state lives in memory and resets on restart; POST /mock/reset
 * resets it too. Request bodies, search terms and queue contents are never logged.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

interface Artist {
  name: string;
  roles: string[];
}

interface Track {
  title: string;
  artists: Artist[];
  durationMs: number;
  source: { provider: string; id: string };
}

interface QueueItem {
  id: string;
  track: Track;
  status: 'idle' | 'loading' | 'success' | 'error';
  addedAtIso: string;
}

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? (args[index + 1] as string) : fallback;
};
const PORT = Number(option('port', '4125'));
const HOST = option('host', '127.0.0.1');
const KEEP_ALIVE_MS = 15_000;

const track = (title: string, artist: string, seconds: number, id: string): Track => ({
  title,
  artists: [{ name: artist, roles: ['main'] }],
  durationMs: seconds * 1000,
  source: { provider: 'mock', id },
});

/** What /api/search can find. */
const CATALOG: Track[] = [
  track('Rainy Sunday', 'Vassilis Tsitsanis', 192, 'tsitsanis-1'),
  track('Island Road', 'Mara Quill', 185, 'quill-1'),
  track('Gapless part 2', 'Aulos Test', 3, 'gapless-2'),
  track('Café del Mar', 'Mötley Beyoncé', 3, 'cafe'),
  track('Τα Παιδιά του Πειραιά', 'Μάνος Χατζιδάκις', 2, 'peiraia'),
  track('Ta Paidia tou Peiraia (Live)', 'Μάνος Χατζιδάκις', 250, 'peiraia-live'),
];

let nextItem = 1;
const item = (t: Track): QueueItem => ({
  id: `item-${nextItem++}`,
  track: t,
  status: 'success',
  addedAtIso: new Date().toISOString(),
});

interface State {
  items: QueueItem[];
  currentIndex: number;
  status: 'playing' | 'paused' | 'stopped';
  seek: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  favorites: Track[];
  playlists: { id: string; name: string; tracks: Track[] }[];
  settings: Record<string, unknown>;
}

const initialState = (): State => ({
  items: CATALOG.slice(0, 3).map(item),
  currentIndex: 0,
  status: 'paused',
  seek: 0,
  volume: 0.5,
  shuffle: false,
  repeat: 'off',
  favorites: [],
  playlists: [],
  settings: {},
});

let state = initialState();
const clients = new Set<ServerResponse>();

const queueSnapshot = () => ({ items: state.items, currentIndex: state.currentIndex });
const playbackSnapshot = () => ({
  status: state.status,
  seek: state.seek,
  duration: (state.items[state.currentIndex]?.track.durationMs ?? 0) / 1000,
});
const settingsSnapshot = () => ({
  shuffle: state.shuffle,
  repeat: state.repeat,
  discovery: false,
  language: 'en_US',
  dark: true,
  themeId: 'default',
  lyricsTextSize: 1,
});

function emit(event: 'queue' | 'playback' | 'settings') {
  const data =
    event === 'queue'
      ? queueSnapshot()
      : event === 'playback'
        ? playbackSnapshot()
        : settingsSnapshot();
  for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function goTo(index: number) {
  state.currentIndex = Math.max(0, Math.min(index, state.items.length - 1));
  state.seek = 0;
  emit('queue');
  emit('playback');
}

setInterval(() => {
  if (state.status !== 'playing') return;
  state.seek += 1;
  const { duration } = playbackSnapshot();
  if (state.seek < duration) {
    emit('playback');
    return;
  }
  if (state.repeat === 'one') {
    state.seek = 0;
    emit('playback');
  } else if (state.currentIndex + 1 < state.items.length) {
    goTo(state.currentIndex + 1);
  } else if (state.repeat === 'all') {
    goTo(0);
  } else {
    state.status = 'stopped';
    state.seek = 0;
    emit('playback');
  }
}, 1000);

setInterval(() => {
  for (const client of clients) client.write(':\n\n');
}, KEEP_ALIVE_MS);

class BridgeError extends Error {}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? undefined : JSON.parse(text);
}

const field = <T>(body: unknown, name: string): T | undefined =>
  typeof body === 'object' && body !== null
    ? ((body as Record<string, unknown>)[name] as T)
    : undefined;

function requireQueue(action: string) {
  if (state.items.length === 0) throw new BridgeError(`${action} failed: no track in queue`);
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (method === 'GET') {
    if (path === '/api/health') return send(res, 200, { status: 'ok' });
    if (path === '/api/queue') return send(res, 200, queueSnapshot());
    if (path === '/api/playback') return send(res, 200, playbackSnapshot());
    if (path === '/api/playback/volume') return send(res, 200, { volume: state.volume });
    if (path === '/api/settings') return send(res, 200, settingsSnapshot());
    if (path === '/api/lyrics/current') {
      return state.items.length === 0
        ? send(res, 404, { error: 'No track playing' })
        : send(res, 200, []);
    }
    if (path.startsWith('/api/settings/')) {
      const id = decodeURIComponent(path.slice('/api/settings/'.length));
      return send(res, 200, state.settings[id] ?? null);
    }
    return send(res, 404, { error: 'Not found' });
  }

  if (method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const body = await readJson(req);

  switch (path) {
    case '/mock/reset':
      state = initialState();
      emit('queue');
      emit('playback');
      emit('settings');
      return send(res, 200);
    case '/api/playback/play':
      requireQueue('Playback.play');
      state.status = 'playing';
      emit('playback');
      return send(res, 200);
    case '/api/playback/pause':
      state.status = 'paused';
      emit('playback');
      return send(res, 200);
    case '/api/playback/toggle':
      requireQueue('Playback.toggle');
      state.status = state.status === 'playing' ? 'paused' : 'playing';
      emit('playback');
      return send(res, 200);
    case '/api/playback/next':
      requireQueue('Queue.goToNext');
      goTo(state.currentIndex + 1 < state.items.length ? state.currentIndex + 1 : 0);
      return send(res, 200);
    case '/api/playback/previous':
      requireQueue('Queue.goToPrevious');
      goTo(Math.max(0, state.currentIndex - 1));
      return send(res, 200);
    case '/api/playback/seek':
      state.seek = Math.max(0, Number(field<number>(body, 'seconds') ?? 0));
      emit('playback');
      return send(res, 200);
    case '/api/playback/shuffle':
      state.shuffle = field<boolean>(body, 'enabled') === true;
      emit('settings');
      return send(res, 200);
    case '/api/playback/repeat': {
      const mode = field<string>(body, 'mode');
      if (mode !== 'off' && mode !== 'all' && mode !== 'one') {
        throw new BridgeError('Playback.setRepeatMode failed: invalid mode');
      }
      state.repeat = mode;
      emit('settings');
      return send(res, 200);
    }
    case '/api/playback/volume':
      state.volume = Math.max(0, Math.min(1, Number(field<number>(body, 'volume') ?? 0)));
      return send(res, 200);
    case '/api/queue/add':
      state.items.push(...(field<Track[]>(body, 'tracks') ?? []).map(item));
      emit('queue');
      return send(res, 200);
    case '/api/queue/remove': {
      const ids = new Set(field<string[]>(body, 'ids') ?? []);
      const current = state.items[state.currentIndex]?.id;
      state.items = state.items.filter((i) => !ids.has(i.id));
      const kept = state.items.findIndex((i) => i.id === current);
      state.currentIndex =
        kept >= 0 ? kept : Math.min(state.currentIndex, Math.max(0, state.items.length - 1));
      emit('queue');
      return send(res, 200);
    }
    case '/api/queue/go-to':
      requireQueue('Queue.goToIndex');
      goTo(Number(field<number>(body, 'index') ?? 0));
      return send(res, 200);
    case '/api/queue/clear':
      state.items = [];
      state.currentIndex = 0;
      state.status = 'stopped';
      state.seek = 0;
      emit('queue');
      emit('playback');
      return send(res, 200);
    case '/api/favorites/tracks/add': {
      const t = field<Track>(body, 'track');
      if (t) state.favorites.push(t);
      return send(res, 200);
    }
    case '/api/favorites/tracks/remove': {
      const source = field<{ id: string }>(body, 'source');
      state.favorites = state.favorites.filter((f) => f.source.id !== source?.id);
      return send(res, 200);
    }
    case '/api/playlists/from-queue': {
      const id = `playlist-${state.playlists.length + 1}`;
      state.playlists.push({
        id,
        name: field<string>(body, 'name') ?? 'Queue',
        tracks: state.items.map((i) => i.track),
      });
      return send(res, 200, { id });
    }
    case '/api/search': {
      const words = String(field<string>(body, 'query') ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .split(/\s+/)
        .filter(Boolean);
      const limit = Number(field<number>(body, 'limit') ?? 20);
      const text = (t: Track) =>
        `${t.title} ${t.artists.map((a) => a.name).join(' ')}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{M}/gu, '');
      const tracks = CATALOG.filter((t) => words.every((w) => text(t).includes(w))).slice(0, limit);
      return send(res, 200, { tracks, artists: [], albums: [], playlists: [] });
    }
    default:
      if (path.startsWith('/api/settings/')) {
        state.settings[decodeURIComponent(path.slice('/api/settings/'.length))] = body;
        return send(res, 200);
      }
      return send(res, 404, { error: 'Not found' });
  }
}

createServer((req, res) => {
  console.log(`${req.method ?? '?'} ${(req.url ?? '').split('?')[0]}`);
  route(req, res).catch((error: unknown) => {
    if (error instanceof BridgeError) send(res, 500, { error: error.message });
    else send(res, 400, { error: 'Bad request' });
  });
}).listen(PORT, HOST, () => {
  console.log(`mock Nuclear Jam on http://${HOST}:${PORT}/api (emulator: http://10.0.2.2:${PORT})`);
});
