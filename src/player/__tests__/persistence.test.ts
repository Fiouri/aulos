import {
  createSaveThrottle,
  parsePersistedQueue,
  restoreQueue,
  serializeQueue,
} from '../persistence';
import { currentEntry, EMPTY_QUEUE, playNow, setRepeat, setShuffle, skipTo } from '../queue';

const fixedRandom = () => 0;

describe('queue persistence', () => {
  it('round-trips track ids, index, position and repeat through JSON', () => {
    const q = setRepeat(skipTo(playNow(EMPTY_QUEUE, [5, 6, 7], 0), 1), 'all');
    const saved = parsePersistedQueue(JSON.parse(JSON.stringify(serializeQueue(q, 12_345.6))));
    expect(saved).toEqual({
      version: 1,
      trackIds: [5, 6, 7],
      index: 1,
      positionMs: 12_346,
      repeat: 'all',
      originalOrder: null,
    });
    const restored = saved && restoreQueue(saved, new Set([5, 6, 7]));
    expect(restored?.positionMs).toBe(12_346);
    expect(restored?.queue.entries.map((e) => e.trackId)).toEqual([5, 6, 7]);
    expect(restored && currentEntry(restored.queue)?.trackId).toBe(6);
  });

  it('keeps the shuffled order and can still unshuffle after a restart', () => {
    const shuffled = setShuffle(playNow(EMPTY_QUEUE, [1, 2, 3, 4], 1), true, fixedRandom);
    const saved = serializeQueue(shuffled, 0);
    const restored = restoreQueue(saved, new Set([1, 2, 3, 4])).queue;
    expect(restored.entries.map((e) => e.trackId)).toEqual(shuffled.entries.map((e) => e.trackId));
    expect(setShuffle(restored, false).entries.map((e) => e.trackId)).toEqual([1, 2, 3, 4]);
  });

  it('drops tracks that left the library and moves on from a missing current track', () => {
    const q = skipTo(playNow(EMPTY_QUEUE, [1, 2, 3, 4], 0), 1);
    const { queue, positionMs } = restoreQueue(serializeQueue(q, 9000), new Set([1, 3, 4]));
    expect(queue.entries.map((e) => e.trackId)).toEqual([1, 3, 4]);
    expect(currentEntry(queue)?.trackId).toBe(3);
    expect(positionMs).toBe(0);
  });

  it('restores an empty queue when nothing survived', () => {
    const q = playNow(EMPTY_QUEUE, [1], 0);
    expect(restoreQueue(serializeQueue(q, 1), new Set()).queue.entries).toEqual([]);
  });

  it('rejects malformed stored values', () => {
    expect(parsePersistedQueue(null)).toBeNull();
    expect(parsePersistedQueue({ version: 2 })).toBeNull();
    expect(
      parsePersistedQueue({ version: 1, trackIds: ['a'], index: 0, positionMs: 0 }),
    ).toBeNull();
    expect(
      parsePersistedQueue({ version: 1, trackIds: [1], index: 0, positionMs: 0, repeat: 'x' }),
    ).toMatchObject({ repeat: 'off', originalOrder: null });
  });

  it('saves at most once per 5 s unless forced', () => {
    const throttle = createSaveThrottle(5000);
    expect(throttle.shouldSave(0)).toBe(true);
    expect(throttle.shouldSave(4999)).toBe(false);
    expect(throttle.shouldSave(4999, true)).toBe(true);
    expect(throttle.shouldSave(9998)).toBe(false);
    expect(throttle.shouldSave(9999)).toBe(true);
  });
});
