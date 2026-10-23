import {
  SLEEP_FADE_MS,
  SLEEP_OFF,
  sleepAfterMinutes,
  sleepDecision,
  sleepRemainingMs,
} from '../sleep';

describe('sleep timer', () => {
  const timer = sleepAfterMinutes(15, 1_000_000);

  it('stores a deadline timestamp', () => {
    expect(timer).toEqual({ mode: 'deadline', deadline: 1_000_000 + 15 * 60_000 });
    expect(sleepRemainingMs(timer, 1_000_000)).toBe(900_000);
    expect(sleepRemainingMs(timer, 9_999_999)).toBe(0);
    expect(sleepRemainingMs(SLEEP_OFF, 0)).toBeNull();
  });

  it('does nothing before the deadline', () => {
    expect(sleepDecision(timer, timer.mode === 'deadline' ? timer.deadline - 1 : 0)).toEqual({
      action: 'none',
    });
  });

  it('fades out over 5 s from the deadline, then pauses', () => {
    if (timer.mode !== 'deadline') throw new Error('fixture');
    const { deadline } = timer;
    expect(sleepDecision(timer, deadline)).toEqual({ action: 'fade', volume: 1 });
    expect(sleepDecision(timer, deadline + SLEEP_FADE_MS / 2)).toEqual({
      action: 'fade',
      volume: 0.5,
    });
    expect(sleepDecision(timer, deadline + SLEEP_FADE_MS)).toEqual({ action: 'pause' });
    // A late check (JS was suspended with the screen off) pauses straight away.
    expect(sleepDecision(timer, deadline + 60_000)).toEqual({ action: 'pause' });
  });

  it('leaves "end of track" and "off" to the player', () => {
    expect(sleepDecision({ mode: 'endOfTrack' }, Number.MAX_SAFE_INTEGER)).toEqual({
      action: 'none',
    });
    expect(sleepDecision(SLEEP_OFF, Number.MAX_SAFE_INTEGER)).toEqual({ action: 'none' });
  });
});
