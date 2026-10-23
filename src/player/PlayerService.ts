import {
  createAudioPlaylist,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioPlaylist,
  type AudioPlaylistStatus,
} from 'expo-audio';

import { applyOps, planWindowSync, type NativeOp, type PlayerWindow } from './window';

/** Status of the native player, mapped onto queue entry keys. */
export interface PlayerStatus {
  /** Key of the entry the native player is on; null when nothing is loaded. */
  key: number | null;
  playing: boolean;
  buffering: boolean;
  positionSec: number;
  durationSec: number;
  /** The native playlist ran out (end of queue, or nothing loaded after the current track). */
  ended: boolean;
  /** Playback error of the current item (missing or unreadable file). */
  error: string | null;
}

export interface NowPlayingInfo {
  title: string;
  artist: string | null;
  album: string | null;
  /** file:// URI of the artwork, or null. */
  artworkUri: string | null;
}

export interface PlayerListener {
  onStatus(status: PlayerStatus): void;
  /** The native player moved to another entry by itself (end of track, lock screen, headset). */
  onEntryChanged(key: number | null): void;
}

export type LoopMode = 'none' | 'single';

/** Everything the player store needs from the audio engine; faked in tests. */
export interface PlayerBackend {
  configure(): Promise<void>;
  setListener(listener: PlayerListener | null): void;
  /** Rebuilds the native playlist from scratch (startup restore, error recovery). */
  load(window: PlayerWindow, uris: ReadonlyMap<number, string>, positionSec: number): void;
  /** Brings the loaded native playlist in line with `window` with minimal changes. */
  sync(window: PlayerWindow, uris: ReadonlyMap<number, string>): void;
  /** Key of the native current item, read from the player right now. */
  currentKey(): number | null;
  positionSec(): number;
  play(nowPlaying: NowPlayingInfo): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  setVolume(volume: number): void;
  setLoop(mode: LoopMode): void;
  updateNowPlaying(nowPlaying: NowPlayingInfo): void;
  /** Stops playback and removes the media notification. */
  unload(): void;
}

const STATUS_INTERVAL_MS = 500;

type StatusWithError = AudioPlaylistStatus & { error?: { message?: string } };

function toMetadata(info: NowPlayingInfo): AudioMetadata {
  return {
    title: info.title,
    artist: info.artist ?? undefined,
    albumTitle: info.album ?? undefined,
    artworkUrl: info.artworkUri ?? undefined,
  };
}

/**
 * The only module that talks to expo-audio. It owns one native AudioPlaylist that holds a window
 * of the queue (see window.ts) and maps native indices back to queue entry keys.
 */
export class PlayerService implements PlayerBackend {
  #playlist: AudioPlaylist | null = null;
  #subscriptions: { remove(): void }[] = [];
  #window: PlayerWindow = { keys: [], current: 0 };
  #listener: PlayerListener | null = null;
  #loop: LoopMode = 'none';
  #lockScreenActive = false;
  #lastKey: number | null = null;

  async configure(): Promise<void> {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }

  setListener(listener: PlayerListener | null): void {
    this.#listener = listener;
  }

  load(window: PlayerWindow, uris: ReadonlyMap<number, string>, positionSec: number): void {
    this.#release();
    const sources = window.keys.map((key) => ({ uri: uris.get(key) ?? '' }));
    const playlist = createAudioPlaylist({
      sources,
      updateInterval: STATUS_INTERVAL_MS,
      loop: this.#loop,
    });
    this.#playlist = playlist;
    this.#window = { keys: [...window.keys], current: 0 };
    this.#subscriptions = [
      playlist.addListener('playlistStatusUpdate', (status) => this.#onStatus(status)),
      playlist.addListener('trackChanged', () => this.#refreshCurrent()),
    ];
    if (window.current > 0) {
      playlist.skipTo(window.current);
      this.#window.current = window.current;
    }
    if (positionSec > 0) void playlist.seekTo(positionSec);
    this.#lastKey = this.currentKey();
  }

  sync(window: PlayerWindow, uris: ReadonlyMap<number, string>): void {
    const playlist = this.#playlist;
    if (!playlist) {
      this.load(window, uris, 0);
      return;
    }
    this.#window.current = this.#nativeIndex();
    const ops = planWindowSync(this.#window, window);
    for (const op of ops) this.#apply(playlist, op, uris);
    this.#window = applyOps(this.#window, ops);
    this.#refreshCurrent();
  }

  currentKey(): number | null {
    if (!this.#playlist) return null;
    return this.#window.keys[this.#nativeIndex()] ?? null;
  }

  positionSec(): number {
    return this.#playlist?.currentTime ?? 0;
  }

  play(nowPlaying: NowPlayingInfo): void {
    const playlist = this.#playlist;
    if (!playlist) return;
    // Lock-screen controls run the media foreground service that keeps playback alive in the
    // background; without it Android stops the audio after about 3 minutes.
    if (!this.#lockScreenActive) {
      playlist.setActiveForLockScreen(true, toMetadata(nowPlaying), {
        showNextTrack: true,
        showPreviousTrack: true,
        showSeekForward: false,
        showSeekBackward: false,
      });
      this.#lockScreenActive = true;
    } else {
      playlist.updateLockScreenMetadata(toMetadata(nowPlaying));
    }
    playlist.play();
  }

  pause(): void {
    this.#playlist?.pause();
  }

  async seekTo(seconds: number): Promise<void> {
    await this.#playlist?.seekTo(Math.max(0, seconds));
  }

  setVolume(volume: number): void {
    if (this.#playlist) this.#playlist.volume = Math.max(0, Math.min(1, volume));
  }

  setLoop(mode: LoopMode): void {
    this.#loop = mode;
    if (this.#playlist) this.#playlist.loop = mode;
  }

  updateNowPlaying(nowPlaying: NowPlayingInfo): void {
    if (this.#lockScreenActive) this.#playlist?.updateLockScreenMetadata(toMetadata(nowPlaying));
  }

  unload(): void {
    this.#release();
    this.#window = { keys: [], current: 0 };
    this.#lastKey = null;
  }

  #nativeIndex(): number {
    return this.#playlist?.currentIndex ?? 0;
  }

  #apply(playlist: AudioPlaylist, op: NativeOp, uris: ReadonlyMap<number, string>) {
    switch (op.type) {
      case 'add':
        playlist.add({ uri: uris.get(op.key) ?? '' });
        break;
      case 'insert':
        playlist.insert({ uri: uris.get(op.key) ?? '' }, op.index);
        break;
      case 'remove':
        playlist.remove(op.index);
        break;
      case 'skipTo':
        playlist.skipTo(op.index);
        break;
    }
  }

  /** Re-reads the native index (events can be stale) and reports a changed entry once. */
  #refreshCurrent() {
    if (!this.#playlist) return;
    this.#window.current = this.#nativeIndex();
    const key = this.currentKey();
    if (key === this.#lastKey) return;
    this.#lastKey = key;
    this.#listener?.onEntryChanged(key);
  }

  #onStatus(status: StatusWithError) {
    this.#refreshCurrent();
    this.#listener?.onStatus({
      key: this.currentKey(),
      playing: status.playing,
      buffering: status.isBuffering,
      positionSec: status.currentTime,
      durationSec: status.duration,
      ended: status.didJustFinish,
      error: status.error ? (status.error.message ?? 'Playback error') : null,
    });
  }

  #release() {
    for (const s of this.#subscriptions) s.remove();
    this.#subscriptions = [];
    const playlist = this.#playlist;
    this.#playlist = null;
    if (!playlist) return;
    if (this.#lockScreenActive) playlist.clearLockScreenControls();
    this.#lockScreenActive = false;
    playlist.destroy();
    playlist.release();
  }
}
