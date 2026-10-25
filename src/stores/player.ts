import { create } from 'zustand';

import { checkFiles } from '../../modules/media-store';
import { recordPlay, updatePlayDuration } from '@/collections/history';
import { getKv, setKv } from '@/db/kv';
import type { Db } from '@/db/types';
import { i18n } from '@/i18n';
import { trackArtworkSource } from '@/library/artwork';
import { artworkCache } from '@/library/artworkCache';
import { LOCAL_PROVIDER } from '@/library/providers';
import { getTracks, type Track } from '@/library/queries';
import {
  createSaveThrottle,
  parsePersistedQueue,
  QUEUE_KV_KEY,
  restoreQueue,
  serializeQueue,
} from '@/player/persistence';
import { PlayCounter, type PlayEvent } from '@/player/playCounter';
import {
  PlayerService,
  type NowPlayingInfo,
  type PlayerBackend,
  type PlayerStatus,
} from '@/player/PlayerService';
import {
  addToQueue,
  clearQueue,
  currentEntry,
  EMPTY_QUEUE,
  isShuffled,
  moveEntry,
  nextIndex,
  playNext,
  playNow,
  previousAction,
  removeEntry,
  setRepeat,
  setShuffle,
  skipTo,
  type QueueState,
  type Random,
  type RepeatMode,
} from '@/player/queue';
import { SLEEP_OFF, sleepDecision, type SleepTimer } from '@/player/sleep';
import { desiredWindow, nativeLoopMode } from '@/player/window';
import { showToast } from '@/ui/toast';

/** Size of the artwork handed to the media notification and lock screen. */
const NOW_PLAYING_ARTWORK_PX = 512;
const SLEEP_CHECK_INTERVAL_MS = 1000;
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

interface Skip {
  key: number;
  reason: 'missing' | 'offline' | 'unplayable';
}

const SKIP_MESSAGES = {
  missing: 'player.skippedMissing',
  offline: 'player.notAvailableOffline',
  unplayable: 'player.skippedUnplayable',
} as const;

export interface PlayerDeps {
  backend: PlayerBackend;
  checkFiles: (contentUris: string[]) => Promise<boolean[]>;
  /** Stream URL of a track without a file on the device, from its provider. */
  resolveStream: (track: Track) => Promise<string>;
  isOnline: () => Promise<boolean>;
  artworkFor: (track: Track) => Promise<string | null>;
  toast: (message: string) => void;
  now: () => number;
  random: Random;
}

async function nowPlayingArtwork(track: Track): Promise<string | null> {
  const source = trackArtworkSource(track);
  return source ? artworkCache.get(source, NOW_PLAYING_ARTWORK_PX) : null;
}

/** Stream resolution and connectivity come from the app (providers), everything else has a default. */
export type PlayerInitDeps = Partial<PlayerDeps> & Pick<PlayerDeps, 'resolveStream' | 'isOnline'>;

function withDefaults(deps: PlayerInitDeps): PlayerDeps {
  return {
    backend: deps.backend ?? new PlayerService(),
    checkFiles: deps.checkFiles ?? checkFiles,
    resolveStream: deps.resolveStream,
    isOnline: deps.isOnline,
    artworkFor: deps.artworkFor ?? nowPlayingArtwork,
    toast: deps.toast ?? showToast,
    now: deps.now ?? Date.now,
    random: deps.random ?? Math.random,
  };
}

/** Non-reactive player plumbing that lives next to the store. */
interface Runtime {
  db: Db;
  deps: PlayerDeps;
  counter: PlayCounter;
  saveThrottle: ReturnType<typeof createSaveThrottle>;
  /** Serialises window syncs: each one awaits file checks before touching the player. */
  syncChain: Promise<void>;
  /** Serialises history writes so an 'end' always sees the row its 'count' inserted. */
  historyChain: Promise<void>;
  historyId: number | null;
  /** What the native player plays for an entry key: a readable file or a resolved stream. */
  resolved: Map<number, string>;
  sleepInterval: ReturnType<typeof setInterval> | null;
}

let runtime: Runtime | null = null;

export interface PlayerState {
  queue: QueueState;
  /** Tracks referenced by the queue, by id. */
  tracks: Record<number, Track>;
  playing: boolean;
  buffering: boolean;
  positionSec: number;
  durationSec: number;
  sleep: SleepTimer;
  /** The saved queue has been restored (or there was none). */
  ready: boolean;

  init(db: Db, deps: PlayerInitDeps): Promise<void>;
  playTracks(tracks: readonly Track[], startIndex: number): Promise<void>;
  /** Turns shuffle on and plays the list from a random track. */
  shuffleTracks(tracks: readonly Track[]): Promise<void>;
  playNext(tracks: readonly Track[]): Promise<void>;
  addToQueue(tracks: readonly Track[]): Promise<void>;
  play(): void;
  pause(): void;
  togglePlay(): void;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(seconds: number): Promise<void>;
  skipToIndex(index: number): Promise<void>;
  removeAt(index: number): Promise<void>;
  move(from: number, to: number): Promise<void>;
  clear(): Promise<void>;
  toggleShuffle(): Promise<void>;
  cycleRepeat(): Promise<void>;
  setSleep(timer: SleepTimer): Promise<void>;
  /** Saves the queue now (on pause and when the app goes to the background). */
  persist(): Promise<void>;
}

export function currentTrack(state: Pick<PlayerState, 'queue' | 'tracks'>): Track | null {
  const entry = currentEntry(state.queue);
  return entry ? (state.tracks[entry.trackId] ?? null) : null;
}

export const usePlayerStore = create<PlayerState>()((set, get) => {
  const rt = (): Runtime => {
    if (!runtime) throw new Error('Player used before init()');
    return runtime;
  };

  const trackOf = (key: number): Track | null => {
    const entry = get().queue.entries.find((e) => e.key === key);
    return entry ? (get().tracks[entry.trackId] ?? null) : null;
  };

  const nowPlaying = (track: Track, artworkUri: string | null = null): NowPlayingInfo => ({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artworkUri,
  });

  /** Lock-screen metadata follows the current track; artwork arrives when it is loaded. */
  const refreshNowPlaying = () => {
    const track = currentTrack(get());
    if (!track) return;
    const r = rt();
    r.deps.backend.updateNowPlaying(nowPlaying(track));
    void r.deps.artworkFor(track).then((uri) => {
      if (uri && currentTrack(get())?.id === track.id) {
        r.deps.backend.updateNowPlaying(nowPlaying(track, uri));
      }
    });
  };

  const persist = async () => {
    const r = runtime;
    if (!r) return;
    const { queue, positionSec } = get();
    await setKv(r.db, QUEUE_KV_KEY, serializeQueue(queue, positionSec * 1000));
  };

  const registerTracks = (tracks: readonly Track[]) => {
    set((s) => ({
      tracks: { ...s.tracks, ...Object.fromEntries(tracks.map((t) => [t.id, t])) },
    }));
  };

  /**
   * What to play for entries entering the window, stored in the runtime: a file on the device
   * when it is readable (local files and downloads), otherwise the provider's stream resolved
   * now. Returns the entries that cannot play: a local file that is gone, a streaming-only
   * track while offline, or a stream the provider cannot resolve.
   */
  const resolveSources = async (r: Runtime, keys: readonly number[]): Promise<Skip[]> => {
    const skipped: Skip[] = [];
    const withFile = keys.filter((k) => trackOf(k)?.localPath);
    const readable =
      withFile.length > 0
        ? await r.deps.checkFiles(withFile.map((k) => trackOf(k)?.localPath ?? ''))
        : [];
    withFile.forEach((k, i) => {
      if (readable[i]) r.resolved.set(k, trackOf(k)?.localPath ?? '');
    });
    let online: boolean | null = null;
    for (const key of keys) {
      if (r.resolved.has(key)) continue;
      const track = trackOf(key);
      if (!track || track.provider === LOCAL_PROVIDER) {
        skipped.push({ key, reason: 'missing' });
        continue;
      }
      online ??= await r.deps.isOnline();
      if (!online) {
        skipped.push({ key, reason: 'offline' });
        continue;
      }
      try {
        const url = await r.deps.resolveStream(track);
        if (r.deps.backend.acceptsSource(url)) r.resolved.set(key, url);
        else skipped.push({ key, reason: 'unplayable' });
      } catch {
        skipped.push({ key, reason: 'unplayable' });
      }
    }
    return skipped;
  };

  /**
   * Brings the native playlist in line with the queue. Entries entering the window are
   * resolved first; those that cannot play are skipped with a toast and dropped from the queue.
   */
  const syncWindow = (options: { reload?: boolean; positionSec?: number } = {}) => {
    const r = rt();
    const run = async () => {
      for (;;) {
        const { queue, sleep } = get();
        const windowOptions = { stopAfterCurrent: sleep.mode === 'endOfTrack' };
        const desired = desiredWindow(queue, windowOptions);
        if (!desired) {
          r.deps.backend.unload();
          set({ playing: false, buffering: false, positionSec: 0, durationSec: 0 });
          return;
        }
        const unresolved = desired.keys.filter((k) => !r.resolved.has(k));
        const skipped = await resolveSources(r, unresolved);
        if (get().queue !== queue) continue;
        if (skipped.length > 0) {
          let next = queue;
          for (const { key, reason } of skipped) {
            const track = trackOf(key);
            if (track) r.deps.toast(i18n.t(SKIP_MESSAGES[reason], { title: track.title }));
            next = removeEntry(next, key);
          }
          set({ queue: next });
          continue;
        }
        const uris = new Map(desired.keys.map((k) => [k, r.resolved.get(k) ?? '']));
        r.deps.backend.setLoop(nativeLoopMode(queue, windowOptions));
        if (options.reload) r.deps.backend.load(desired, uris, options.positionSec ?? 0);
        else r.deps.backend.sync(desired, uris);
        return;
      }
    };
    r.syncChain = r.syncChain.then(run, run);
    return r.syncChain;
  };

  const startPlayback = () => {
    const track = currentTrack(get());
    if (!track) return;
    rt().deps.backend.play(nowPlaying(track));
    refreshNowPlaying();
  };

  const handleHistory = (events: readonly PlayEvent[]) => {
    const r = rt();
    for (const event of events) {
      r.historyChain = r.historyChain.then(async () => {
        if (event.type === 'count') {
          r.historyId = await recordPlay(r.db, event.trackId, r.deps.now(), event.msPlayed);
        } else if (r.historyId !== null) {
          await updatePlayDuration(r.db, r.historyId, event.msPlayed);
          r.historyId = null;
        }
      });
    }
  };

  const stopSleepInterval = () => {
    const r = runtime;
    if (r?.sleepInterval) clearInterval(r.sleepInterval);
    if (r) r.sleepInterval = null;
  };

  const checkSleep = () => {
    const r = runtime;
    if (!r) return;
    const decision = sleepDecision(get().sleep, r.deps.now());
    if (decision.action === 'fade') {
      r.deps.backend.setVolume(decision.volume);
    } else if (decision.action === 'pause') {
      stopSleepInterval();
      r.deps.backend.pause();
      r.deps.backend.setVolume(1);
      set({ sleep: SLEEP_OFF, playing: false });
      void persist();
    }
  };

  const handleEnded = async () => {
    const r = rt();
    const { queue, sleep } = get();
    handleHistory(r.counter.finish());
    r.deps.backend.pause();
    if (sleep.mode === 'endOfTrack') {
      set({ sleep: SLEEP_OFF, queue: skipTo(queue, nextIndex(queue) ?? 0), playing: false });
      await syncWindow();
      refreshNowPlaying();
      await persist();
      return;
    }
    const next = nextIndex(queue);
    if (next === null) {
      // End of the queue: back to the first track, paused.
      set({ queue: skipTo(queue, 0), playing: false, positionSec: 0 });
      await syncWindow();
      await r.deps.backend.seekTo(0);
      refreshNowPlaying();
      await persist();
      return;
    }
    // The native window ran dry before it was topped up: carry on.
    set({ queue: skipTo(queue, next) });
    await syncWindow();
    startPlayback();
  };

  const handleError = async (key: number | null) => {
    const r = rt();
    const track = key === null ? null : trackOf(key);
    if (key === null || !track) return;
    r.deps.toast(i18n.t('player.skippedUnplayable', { title: track.title }));
    r.resolved.delete(key);
    const wasPlaying = get().playing;
    set({ queue: removeEntry(get().queue, key) });
    await syncWindow({ reload: true });
    if (wasPlaying || get().queue.entries.length > 0) startPlayback();
  };

  const onStatus = (status: PlayerStatus) => {
    const r = runtime;
    if (!r) return;
    set({
      playing: status.playing,
      buffering: status.buffering,
      positionSec: status.positionSec,
      durationSec: status.durationSec,
    });
    if (status.error) {
      void handleError(status.key);
      return;
    }
    if (status.ended && !status.playing) {
      void handleEnded();
      return;
    }
    const entry = status.key === null ? null : trackOf(status.key);
    if (status.key !== null && entry) {
      handleHistory(
        r.counter.update({
          key: status.key,
          trackId: entry.id,
          positionMs: status.positionSec * 1000,
          durationMs: status.durationSec * 1000,
          playing: status.playing,
        }),
      );
    }
    checkSleep();
    if (status.playing && r.saveThrottle.shouldSave(r.deps.now())) void persist();
  };

  const onEntryChanged = (key: number | null) => {
    if (key === null) return;
    // The previous entry's play is over, whether it ended or was skipped.
    handleHistory(rt().counter.finish());
    const { queue } = get();
    const index = queue.entries.findIndex((e) => e.key === key);
    if (index < 0) return;
    if (index !== queue.index) set({ queue: skipTo(queue, index) });
    refreshNowPlaying();
    void syncWindow();
    void persist();
  };

  /** Applies a queue change, syncs the player and saves the queue. */
  const commit = async (queue: QueueState) => {
    set({ queue });
    await syncWindow();
    await persist();
  };

  return {
    queue: EMPTY_QUEUE,
    tracks: {},
    playing: false,
    buffering: false,
    positionSec: 0,
    durationSec: 0,
    sleep: SLEEP_OFF,
    ready: false,

    async init(db, deps) {
      stopSleepInterval();
      runtime?.deps.backend.setListener(null);
      runtime = {
        db,
        deps: withDefaults(deps),
        counter: new PlayCounter(),
        saveThrottle: createSaveThrottle(),
        syncChain: Promise.resolve(),
        historyChain: Promise.resolve(),
        historyId: null,
        resolved: new Map(),
        sleepInterval: null,
      };
      const r = runtime;
      r.deps.backend.setListener({ onStatus, onEntryChanged });
      await r.deps.backend.configure();

      const saved = parsePersistedQueue(await getKv(db, QUEUE_KV_KEY));
      if (saved) {
        const tracks = await getTracks(db, saved.trackIds);
        const { queue, positionMs } = restoreQueue(saved, new Set(tracks.map((t) => t.id)));
        registerTracks(tracks);
        const track = currentTrack({ queue, tracks: get().tracks });
        set({
          queue,
          positionSec: positionMs / 1000,
          durationSec: (track?.durationMs ?? 0) / 1000,
        });
        // Restored paused: the player is loaded at the saved position but does not start.
        if (queue.entries.length > 0) {
          await syncWindow({ reload: true, positionSec: positionMs / 1000 });
        }
      }
      set({ ready: true });
    },

    async playTracks(tracks, startIndex) {
      if (tracks.length === 0) return;
      registerTracks(tracks);
      const queue = playNow(
        get().queue,
        tracks.map((t) => t.id),
        startIndex,
        rt().deps.random,
      );
      await commit(queue);
      startPlayback();
    },

    async shuffleTracks(tracks) {
      if (tracks.length === 0) return;
      const r = rt();
      registerTracks(tracks);
      const { queue } = get();
      const shuffledQueue = isShuffled(queue) ? queue : setShuffle(queue, true, r.deps.random);
      const start = Math.floor(r.deps.random() * tracks.length);
      await commit(
        playNow(
          shuffledQueue,
          tracks.map((t) => t.id),
          start,
          r.deps.random,
        ),
      );
      startPlayback();
    },

    async playNext(tracks) {
      if (tracks.length === 0) return;
      const wasEmpty = get().queue.entries.length === 0;
      registerTracks(tracks);
      await commit(
        playNext(
          get().queue,
          tracks.map((t) => t.id),
        ),
      );
      if (wasEmpty) startPlayback();
    },

    async addToQueue(tracks) {
      if (tracks.length === 0) return;
      const wasEmpty = get().queue.entries.length === 0;
      registerTracks(tracks);
      await commit(
        addToQueue(
          get().queue,
          tracks.map((t) => t.id),
        ),
      );
      if (wasEmpty) startPlayback();
    },

    play() {
      startPlayback();
    },

    pause() {
      rt().deps.backend.pause();
      set({ playing: false });
      void persist();
    },

    togglePlay() {
      if (get().playing) get().pause();
      else get().play();
    },

    async next() {
      const index = nextIndex(get().queue);
      if (index === null) return;
      await commit(skipTo(get().queue, index));
      refreshNowPlaying();
    },

    async previous() {
      const r = rt();
      const action = previousAction(get().queue, r.deps.backend.positionSec());
      if (action.type === 'restart') {
        await get().seek(0);
        return;
      }
      await commit(skipTo(get().queue, action.index));
      refreshNowPlaying();
    },

    async seek(seconds) {
      await rt().deps.backend.seekTo(seconds);
      set({ positionSec: seconds });
    },

    async skipToIndex(index) {
      await commit(skipTo(get().queue, index));
      startPlayback();
    },

    async removeAt(index) {
      const entry = get().queue.entries[index];
      if (!entry) return;
      const wasCurrent = index === get().queue.index;
      await commit(removeEntry(get().queue, entry.key));
      if (wasCurrent) refreshNowPlaying();
    },

    async move(from, to) {
      await commit(moveEntry(get().queue, from, to));
    },

    async clear() {
      handleHistory(rt().counter.finish());
      await commit(clearQueue(get().queue));
    },

    async toggleShuffle() {
      const { queue } = get();
      await commit(setShuffle(queue, queue.original === null, rt().deps.random));
    },

    async cycleRepeat() {
      const repeat = NEXT_REPEAT[get().queue.repeat];
      await commit(setRepeat(get().queue, repeat));
    },

    async setSleep(timer) {
      const r = rt();
      const previous = get().sleep;
      stopSleepInterval();
      r.deps.backend.setVolume(1);
      set({ sleep: timer });
      if (timer.mode === 'deadline') {
        r.sleepInterval = setInterval(checkSleep, SLEEP_CHECK_INTERVAL_MS);
      }
      // "End of track" changes what is loaded after the current track.
      if (previous.mode === 'endOfTrack' || timer.mode === 'endOfTrack') await syncWindow();
    },

    persist,
  };
});
