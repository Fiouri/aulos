/** A play counts after 30 s of listening, or half the track if that comes first. */
export const PLAY_COUNT_MAX_THRESHOLD_MS = 30_000;
/** Position jumps larger than this between two status updates are seeks, not listening. */
const MAX_STEP_MS = 10_000;
/** Going back to within this of the start begins a new play (restart, repeat one). */
const RESTART_WINDOW_MS = 2_000;

export interface PlaySample {
  /** Queue entry key: playing the same track again from another slot is a new play. */
  key: number;
  trackId: number;
  positionMs: number;
  durationMs: number;
  playing: boolean;
}

export type PlayEvent =
  | { type: 'count'; trackId: number; msPlayed: number }
  | { type: 'end'; trackId: number; msPlayed: number };

interface Play {
  key: number;
  trackId: number;
  msPlayed: number;
  lastPositionMs: number;
  counted: boolean;
}

export function countThresholdMs(durationMs: number): number {
  if (!(durationMs > 0)) return PLAY_COUNT_MAX_THRESHOLD_MS;
  return Math.min(PLAY_COUNT_MAX_THRESHOLD_MS, durationMs / 2);
}

/**
 * Turns playback status samples into history events: one 'count' per play once the listened
 * time reaches the threshold, and an 'end' for counted plays with the final listened time.
 * Listened time is the sum of forward position steps while playing, so seeking does not count.
 */
export class PlayCounter {
  #play: Play | null = null;

  update(sample: PlaySample): PlayEvent[] {
    const events: PlayEvent[] = [];
    const play = this.#play;
    const restarted =
      play !== null &&
      play.key === sample.key &&
      sample.positionMs < RESTART_WINDOW_MS &&
      play.lastPositionMs - sample.positionMs > RESTART_WINDOW_MS;

    if (play === null || play.key !== sample.key || restarted) {
      events.push(...this.finish());
      this.#play = {
        key: sample.key,
        trackId: sample.trackId,
        msPlayed: 0,
        lastPositionMs: sample.positionMs,
        counted: false,
      };
      return events;
    }

    const step = sample.positionMs - play.lastPositionMs;
    if (sample.playing && step > 0 && step <= MAX_STEP_MS) play.msPlayed += step;
    play.lastPositionMs = sample.positionMs;

    if (!play.counted && play.msPlayed >= countThresholdMs(sample.durationMs)) {
      play.counted = true;
      events.push({ type: 'count', trackId: play.trackId, msPlayed: play.msPlayed });
    }
    return events;
  }

  /** Ends the current play (queue cleared, app going away). */
  finish(): PlayEvent[] {
    const play = this.#play;
    this.#play = null;
    if (!play?.counted) return [];
    return [{ type: 'end', trackId: play.trackId, msPlayed: play.msPlayed }];
  }
}
