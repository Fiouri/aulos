import {
  addToQueue,
  EMPTY_QUEUE,
  moveEntry,
  playNext,
  playNow,
  removeEntry,
  setRepeat,
  setShuffle,
  skipTo,
  type QueueState,
} from '../queue';
import {
  applyOps,
  desiredWindow,
  nativeLoopMode,
  planWindowSync,
  type PlayerWindow,
} from '../window';

const keysOf = (q: QueueState, positions: number[]) =>
  positions.map((p) => q.entries[p]?.key ?? -1);

describe('desiredWindow', () => {
  const q = playNow(EMPTY_QUEUE, [10, 11, 12, 13, 14, 15], 3);

  it('holds a few entries behind and ahead of the current one', () => {
    expect(desiredWindow(q, { ahead: 2, behind: 2 })).toEqual({
      keys: keysOf(q, [1, 2, 3, 4, 5]),
      current: 2,
    });
  });

  it('stops at the queue edges with repeat off and wraps with repeat on', () => {
    const last = skipTo(q, 5);
    expect(desiredWindow(last, { ahead: 2, behind: 1 })).toEqual({
      keys: keysOf(q, [4, 5]),
      current: 1,
    });
    expect(desiredWindow(setRepeat(last, 'all'), { ahead: 2, behind: 1 })).toEqual({
      keys: keysOf(q, [4, 5, 0, 1]),
      current: 1,
    });
    const first = skipTo(setRepeat(q, 'all'), 0);
    expect(desiredWindow(first, { ahead: 1, behind: 2 })?.keys).toEqual(keysOf(q, [4, 5, 0, 1]));
  });

  it('loads a repeating queue that fits once, in order, and loops it natively', () => {
    const short = setRepeat(playNow(EMPTY_QUEUE, [20, 21, 22], 1), 'all');
    expect(desiredWindow(short, { ahead: 2, behind: 1 })).toEqual({
      keys: keysOf(short, [0, 1, 2]),
      current: 1,
    });
    expect(nativeLoopMode(short, { ahead: 2, behind: 1 })).toBe('all');
    expect(desiredWindow(short, { ahead: 2, behind: 1, stopAfterCurrent: true })?.keys).toEqual(
      keysOf(short, [0, 1]),
    );
    expect(nativeLoopMode(short, { ahead: 2, behind: 1, stopAfterCurrent: true })).toBe('none');
    // Longer than the window: wrapped in the window, no native loop.
    expect(nativeLoopMode(setRepeat(q, 'all'), { ahead: 2, behind: 1 })).toBe('none');
    expect(nativeLoopMode(setRepeat(q, 'one'))).toBe('single');
    expect(nativeLoopMode(q)).toBe('none');
  });

  it('loads nothing after the current entry for the end-of-track sleep timer', () => {
    expect(desiredWindow(q, { ahead: 2, behind: 1, stopAfterCurrent: true })).toEqual({
      keys: keysOf(q, [2, 3]),
      current: 1,
    });
  });

  it('is null for an empty queue', () => {
    expect(desiredWindow(EMPTY_QUEUE)).toBeNull();
  });
});

describe('planWindowSync', () => {
  const sync = (native: PlayerWindow, desired: PlayerWindow) => {
    const ops = planWindowSync(native, desired);
    return { ops, result: applyOps(native, ops) };
  };

  it('loads an empty player and skips to the current entry', () => {
    const { result } = sync({ keys: [], current: 0 }, { keys: [1, 2, 3], current: 1 });
    expect(result).toEqual({ keys: [1, 2, 3], current: 1 });
  });

  it('only tops up and trims after a natural advance', () => {
    const { ops, result } = sync(
      // ExoPlayer moved on from key 3 to key 4 by itself.
      { keys: [1, 2, 3, 4], current: 3 },
      { keys: [2, 3, 4, 5], current: 2 },
    );
    expect(ops).toEqual([
      { type: 'add', key: 5 },
      { type: 'remove', index: 0 },
    ]);
    expect(result).toEqual({ keys: [2, 3, 4, 5], current: 2 });
  });

  it('skips to an already loaded entry instead of reloading', () => {
    const { ops, result } = sync({ keys: [1, 2, 3], current: 0 }, { keys: [1, 2, 3], current: 1 });
    expect(ops).toEqual([{ type: 'skipTo', index: 1 }]);
    expect(result).toEqual({ keys: [1, 2, 3], current: 1 });
  });

  it('jumps to an entry outside the window without removing the playing item first', () => {
    const native = { keys: [1, 2, 3], current: 1 };
    const { ops, result } = sync(native, { keys: [8, 9, 10], current: 1 });
    expect(result).toEqual({ keys: [8, 9, 10], current: 1 });
    const firstSkip = ops.findIndex((op) => op.type === 'skipTo');
    const removalsBeforeSkip = applyOps(native, ops.slice(0, firstSkip));
    expect(removalsBeforeSkip.keys[removalsBeforeSkip.current]).toBe(2);
  });

  it('never removes the playing item when it stays current', () => {
    const native = { keys: [1, 2, 3, 4, 5], current: 2 };
    const desired = { keys: [7, 3, 6], current: 1 };
    const { ops, result } = sync(native, desired);
    expect(result).toEqual(desired);
    let model = native;
    for (const op of ops) {
      model = applyOps(model, [op]);
      expect(model.keys[model.current]).toBe(3);
    }
  });

  it('converges for random queue edits', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const pick = (n: number) => Math.floor(random() * n);
    let queue = playNow(
      EMPTY_QUEUE,
      Array.from({ length: 30 }, (_, i) => i),
      0,
    );
    let native: PlayerWindow = { keys: [], current: 0 };

    for (let round = 0; round < 500; round += 1) {
      const n = queue.entries.length;
      switch (pick(9)) {
        case 0:
          queue = skipTo(queue, pick(n));
          break;
        case 1:
          queue = moveEntry(queue, pick(n), pick(n));
          break;
        case 2:
          queue = removeEntry(queue, queue.entries[pick(n)]?.key ?? -1);
          break;
        case 3:
          queue = playNext(queue, [100 + round]);
          break;
        case 4:
          queue = addToQueue(queue, [200 + round]);
          break;
        case 5:
          queue = setShuffle(queue, queue.original === null, random);
          break;
        case 6:
          queue = setRepeat(queue, (['off', 'all', 'one'] as const)[pick(3)] ?? 'off');
          break;
        default:
          queue = skipTo(queue, Math.min(queue.index + 1, n - 1));
      }
      if (queue.entries.length < 3) queue = addToQueue(queue, [300 + round, 301 + round]);
      const desired = desiredWindow(queue, { ahead: 4, behind: 2 });
      if (!desired) throw new Error('empty queue');
      native = applyOps(native, planWindowSync(native, desired));
      expect(native).toEqual(desired);
    }
  });
});
