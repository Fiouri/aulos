export const SLEEP_PRESETS_MIN = [15, 30, 45, 60] as const;
export const SLEEP_FADE_MS = 5000;

export type SleepTimer =
  { mode: 'off' } | { mode: 'deadline'; deadline: number } | { mode: 'endOfTrack' };

export const SLEEP_OFF: SleepTimer = { mode: 'off' };

export type SleepDecision =
  { action: 'none' } | { action: 'fade'; volume: number } | { action: 'pause' };

export function sleepAfterMinutes(minutes: number, now: number): SleepTimer {
  return { mode: 'deadline', deadline: now + minutes * 60_000 };
}

/**
 * What the player must do now. At the deadline the volume fades linearly to zero over 5 s, then
 * playback pauses. Checked on every status update and by a timer, so whichever runs first after
 * the deadline acts, including with the screen off. "End of track" is enforced by the player
 * itself (nothing is loaded after the current track).
 */
export function sleepDecision(timer: SleepTimer, now: number): SleepDecision {
  if (timer.mode !== 'deadline' || now < timer.deadline) return { action: 'none' };
  const elapsed = now - timer.deadline;
  if (elapsed >= SLEEP_FADE_MS) return { action: 'pause' };
  return { action: 'fade', volume: Math.max(0, 1 - elapsed / SLEEP_FADE_MS) };
}

/** Milliseconds until the fade starts; null when no deadline is set. */
export function sleepRemainingMs(timer: SleepTimer, now: number): number | null {
  return timer.mode === 'deadline' ? Math.max(0, timer.deadline - now) : null;
}
