import type {
  LoopMode,
  NowPlayingInfo,
  PlayerBackend,
  PlayerListener,
  PlayerStatus,
} from '@/player/PlayerService';
import { applyOps, planWindowSync, type PlayerWindow } from '@/player/window';

/**
 * In-memory stand-in for PlayerService: keeps the native window model, records calls and lets a
 * test drive status events the way expo-audio would.
 */
export class FakePlayer implements PlayerBackend {
  window: PlayerWindow = { keys: [], current: 0 };
  uris = new Map<number, string>();
  playing = false;
  position = 0;
  volume = 1;
  loop: LoopMode = 'none';
  loads: { window: PlayerWindow; positionSec: number }[] = [];
  nowPlaying: NowPlayingInfo | null = null;
  listener: PlayerListener | null = null;

  async configure(): Promise<void> {}

  setListener(listener: PlayerListener | null): void {
    this.listener = listener;
  }

  load(window: PlayerWindow, uris: ReadonlyMap<number, string>, positionSec: number): void {
    this.window = { keys: [...window.keys], current: window.current };
    uris.forEach((uri, key) => this.uris.set(key, uri));
    this.position = positionSec;
    this.playing = false;
    this.loads.push({ window: this.window, positionSec });
  }

  sync(window: PlayerWindow, uris: ReadonlyMap<number, string>): void {
    const before = this.currentKey();
    this.window = applyOps(this.window, planWindowSync(this.window, window));
    uris.forEach((uri, key) => this.uris.set(key, uri));
    if (this.currentKey() !== before) this.position = 0;
  }

  currentKey(): number | null {
    return this.window.keys[this.window.current] ?? null;
  }

  positionSec(): number {
    return this.position;
  }

  play(nowPlaying: NowPlayingInfo): void {
    this.nowPlaying = nowPlaying;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  async seekTo(seconds: number): Promise<void> {
    this.position = seconds;
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  setLoop(mode: LoopMode): void {
    this.loop = mode;
  }

  updateNowPlaying(nowPlaying: NowPlayingInfo): void {
    this.nowPlaying = nowPlaying;
  }

  unload(): void {
    this.window = { keys: [], current: 0 };
    this.playing = false;
  }

  /** Emits a status update for the current native item. */
  emit(overrides: Partial<PlayerStatus> = {}): void {
    this.listener?.onStatus({
      key: this.currentKey(),
      playing: this.playing,
      buffering: false,
      positionSec: this.position,
      durationSec: 240,
      ended: false,
      error: null,
      ...overrides,
    });
  }

  /** Plays `seconds` of audio, emitting a status every 0.5 s like expo-audio. */
  advance(seconds: number, durationSec = 240): void {
    for (let t = 0; t < seconds; t += 0.5) {
      this.position += 0.5;
      this.emit({ durationSec });
    }
  }

  /** The current item finished and ExoPlayer moved to the next loaded one by itself. */
  autoAdvance(): void {
    if (this.window.current + 1 < this.window.keys.length) {
      this.window = { ...this.window, current: this.window.current + 1 };
      this.position = 0;
      this.listener?.onEntryChanged(this.currentKey());
    } else {
      this.playing = false;
      this.emit({ ended: true, playing: false });
    }
  }
}
