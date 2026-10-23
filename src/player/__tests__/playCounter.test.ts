import { countThresholdMs, PlayCounter, type PlaySample } from '../playCounter';

const sample = (positionMs: number, overrides: Partial<PlaySample> = {}): PlaySample => ({
  key: 1,
  trackId: 7,
  positionMs,
  durationMs: 240_000,
  playing: true,
  ...overrides,
});

/** Feeds samples every 500 ms from `from` to `to` and collects events. */
function play(counter: PlayCounter, from: number, to: number, overrides: Partial<PlaySample> = {}) {
  const events = [];
  for (let t = from; t <= to; t += 500) events.push(...counter.update(sample(t, overrides)));
  return events;
}

describe('PlayCounter', () => {
  it('uses 30 s, or half the track when shorter', () => {
    expect(countThresholdMs(240_000)).toBe(30_000);
    expect(countThresholdMs(40_000)).toBe(20_000);
    expect(countThresholdMs(0)).toBe(30_000);
  });

  it('counts once after 30 s of listening', () => {
    const counter = new PlayCounter();
    const events = play(counter, 0, 60_000);
    expect(events).toEqual([{ type: 'count', trackId: 7, msPlayed: 30_000 }]);
  });

  it('counts a short track at half its length', () => {
    const counter = new PlayCounter();
    const events = play(counter, 0, 10_000, { durationMs: 10_000 });
    expect(events).toEqual([{ type: 'count', trackId: 7, msPlayed: 5000 }]);
  });

  it('does not count paused time or seeks', () => {
    const counter = new PlayCounter();
    play(counter, 0, 10_000);
    expect(play(counter, 10_000, 40_000, { playing: false })).toEqual([]);
    counter.update(sample(200_000));
    expect(play(counter, 200_000, 219_000)).toEqual([]);
    expect(play(counter, 219_500, 221_000)).toEqual([
      { type: 'count', trackId: 7, msPlayed: 30_000 },
    ]);
  });

  it('starts a new play on another entry and reports the end of a counted one', () => {
    const counter = new PlayCounter();
    play(counter, 0, 45_000);
    const events = counter.update(sample(0, { key: 2, trackId: 8 }));
    expect(events).toEqual([{ type: 'end', trackId: 7, msPlayed: 45_000 }]);
    expect(play(counter, 500, 31_000, { key: 2, trackId: 8 })).toEqual([
      { type: 'count', trackId: 8, msPlayed: 30_000 },
    ]);
  });

  it('counts a repeat-one loop or a restart as a new play', () => {
    const counter = new PlayCounter();
    play(counter, 0, 239_500);
    const restart = counter.update(sample(200));
    expect(restart).toEqual([{ type: 'end', trackId: 7, msPlayed: 239_500 }]);
    expect(play(counter, 700, 31_000)).toEqual([{ type: 'count', trackId: 7, msPlayed: 30_000 }]);
  });

  it('reports nothing for a skipped track', () => {
    const counter = new PlayCounter();
    play(counter, 0, 10_000);
    expect(counter.update(sample(0, { key: 2 }))).toEqual([]);
    expect(counter.finish()).toEqual([]);
  });
});
