import { AppState } from 'react-native';
import { create } from 'zustand';

import type { Db } from '@/db/types';
import { createJamClient, JamError, type JamClient } from '@/nuclear/client';
import { NEXT_REPEAT, parseJamEvent, type PcConnection } from '@/nuclear/events';
import { pickMatch, primaryArtistName, primaryCredit, type MatchResult } from '@/nuclear/match';
import { markPairingUsed, type Pairing } from '@/nuclear/pairings';
import type {
  JamPlayback,
  JamQueue,
  JamSearchResults,
  JamSettings,
  JamTrack,
} from '@/nuclear/schemas';
import { platformXhr, SseConnection, type SseHandlers, type SseState } from '@/nuclear/sse';

/** Search results considered for "Send to PC". */
const SEND_SEARCH_LIMIT = 10;

export interface PcDeps {
  createClient: (baseUrl: string) => JamClient;
  /** Opens the event stream; returns a handle to stop it. */
  openEvents: (url: string, handlers: SseHandlers) => { stop(): void };
  now: () => number;
}

const defaultDeps: PcDeps = {
  createClient: (baseUrl) => createJamClient({ baseUrl }),
  openEvents: (url, handlers) => {
    const connection = new SseConnection(url, handlers, {
      createXhr: platformXhr,
      setTimeout: (run, ms) => setTimeout(run, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      appState: {
        current: () => AppState.currentState ?? 'active',
        subscribe: (listener) => {
          const subscription = AppState.addEventListener('change', listener);
          return () => subscription.remove();
        },
      },
    });
    connection.start();
    return connection;
  },
  now: Date.now,
};

const CONNECTION: Record<SseState, PcConnection> = {
  connecting: 'connecting',
  open: 'connected',
  reconnecting: 'reconnecting',
  stopped: 'disconnected',
};

/** Fields of a PC track for the Send-to-PC matcher. */
const jamFields = (track: JamTrack) => ({
  title: track.title,
  artist: primaryCredit(track.artists),
  durationMs: track.durationMs ?? null,
});

interface Runtime {
  db: Db;
  deps: PcDeps;
  client: JamClient | null;
  events: { stop(): void } | null;
}

let runtime: Runtime | null = null;

export interface PcState {
  pairing: Pairing | null;
  connection: PcConnection;
  queue: JamQueue | null;
  playback: JamPlayback | null;
  settings: JamSettings | null;
  volume: number | null;
  /** Message of the last failed action (Nuclear's `{ error }` when it sent one). */
  lastError: string | null;
  /** "Send to PC" found no sure match: the tracks to choose from. */
  candidates: { title: string; tracks: JamTrack[] } | null;

  init(db: Db, deps?: Partial<PcDeps>): void;
  setCandidates(candidates: { title: string; tracks: JamTrack[] } | null): void;
  connect(pairing: Pairing): void;
  disconnect(): void;
  /** Reloads queue, playback, settings and volume (on every stream (re)open). */
  refresh(): Promise<void>;
  togglePlay(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  toggleShuffle(): Promise<void>;
  cycleRepeat(): Promise<void>;
  goTo(index: number): Promise<void>;
  remove(id: string): Promise<void>;
  clearQueue(): Promise<void>;
  favoriteCurrent(): Promise<void>;
  saveQueueAsPlaylist(name: string): Promise<string | null>;
  search(query: string): Promise<JamSearchResults>;
  addToQueue(tracks: readonly JamTrack[]): Promise<boolean>;
  /**
   * Searches the PC for "<artist> <title>" and queues the confident match, or returns the
   * candidates when there is none.
   */
  sendToPc(track: {
    title: string;
    artist: string | null;
    durationMs: number | null;
  }): Promise<MatchResult<JamTrack>>;
}

export const usePcStore = create<PcState>()((set, get) => {
  const rt = (): Runtime => {
    if (!runtime) throw new Error('PC store used before init()');
    return runtime;
  };

  const client = (): JamClient => {
    const c = rt().client;
    if (!c) throw new JamError('unreachable');
    return c;
  };

  /** Runs an action; a failure is kept for the UI instead of thrown. */
  const run = async <T>(action: (c: JamClient) => Promise<T>): Promise<T | null> => {
    try {
      const result = await action(client());
      set({ lastError: null });
      return result;
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };

  return {
    pairing: null,
    connection: 'disconnected',
    queue: null,
    playback: null,
    settings: null,
    volume: null,
    lastError: null,
    candidates: null,

    setCandidates(candidates) {
      set({ candidates });
    },

    init(db, deps = {}) {
      runtime?.events?.stop();
      runtime = { db, deps: { ...defaultDeps, ...deps }, client: null, events: null };
    },

    connect(pairing) {
      const r = rt();
      r.events?.stop();
      const c = r.deps.createClient(pairing.baseUrl);
      r.client = c;
      set({
        pairing,
        connection: 'connecting',
        queue: null,
        playback: null,
        settings: null,
        volume: null,
        lastError: null,
      });
      r.events = r.deps.openEvents(c.eventsUrl, {
        onOpen: () => {
          void get().refresh();
          void markPairingUsed(r.db, pairing.id, r.deps.now());
        },
        onEvent: (frame) => {
          const event = parseJamEvent(frame);
          if (!event || rt().client !== c) return;
          if (event.type === 'queue') set({ queue: event.queue });
          else if (event.type === 'playback') set({ playback: event.playback });
          else set({ settings: event.settings });
        },
        onState: (state) => {
          if (rt().client === c) set({ connection: CONNECTION[state] });
        },
      });
    },

    disconnect() {
      const r = rt();
      r.events?.stop();
      r.events = null;
      r.client = null;
      set({
        pairing: null,
        connection: 'disconnected',
        queue: null,
        playback: null,
        settings: null,
        volume: null,
      });
    },

    async refresh() {
      const c = rt().client;
      if (!c) return;
      try {
        const [queue, playback, settings, volume] = await Promise.all([
          c.queue(),
          c.playback(),
          c.settings(),
          c.volume(),
        ]);
        if (rt().client === c) set({ queue, playback, settings, volume, lastError: null });
      } catch (error) {
        set({ lastError: error instanceof Error ? error.message : String(error) });
      }
    },

    togglePlay: async () => {
      await run((c) => c.toggle());
    },
    next: async () => {
      await run((c) => c.next());
    },
    previous: async () => {
      await run((c) => c.previous());
    },
    seek: async (seconds) => {
      await run((c) => c.seek(seconds));
    },
    async setVolume(volume) {
      set({ volume });
      await run((c) => c.setVolume(volume));
    },
    async toggleShuffle() {
      const enabled = !(get().settings?.shuffle ?? false);
      await run((c) => c.setShuffle(enabled));
    },
    async cycleRepeat() {
      const mode = NEXT_REPEAT[get().settings?.repeat ?? 'off'];
      await run((c) => c.setRepeat(mode));
    },
    goTo: async (index) => {
      await run((c) => c.goTo(index));
    },
    remove: async (id) => {
      await run((c) => c.removeFromQueue([id]));
    },
    clearQueue: async () => {
      await run((c) => c.clearQueue());
    },
    async favoriteCurrent() {
      const queue = get().queue;
      const current = queue?.items[queue.currentIndex]?.track;
      if (current) await run((c) => c.addFavorite(current));
    },
    saveQueueAsPlaylist: (name) => run((c) => c.saveQueueAsPlaylist(name)),
    async search(query) {
      return (await run((c) => c.search(query, { types: ['tracks'] }))) ?? {};
    },
    async addToQueue(tracks) {
      return (await run((c) => c.addToQueue(tracks))) !== null;
    },
    async sendToPc(track) {
      const query = [primaryArtistName(track.artist), track.title].filter(Boolean).join(' ');
      const results = await run((c) =>
        c.search(query, { types: ['tracks'], limit: SEND_SEARCH_LIMIT }),
      );
      const result = pickMatch(track, results?.tracks ?? [], jamFields);
      if ('match' in result && !(await get().addToQueue([result.match]))) {
        return { candidates: results?.tracks ?? [] };
      }
      return result;
    },
  };
});
