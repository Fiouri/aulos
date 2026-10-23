import {
  addToQueue,
  clearQueue,
  currentEntry,
  EMPTY_QUEUE,
  moveEntry,
  nextIndex,
  playNext,
  playNow,
  previousAction,
  previousIndex,
  removeEntry,
  setRepeat,
  setShuffle,
  skipTo,
  type QueueState,
} from '../queue';

const ids = (s: QueueState) => s.entries.map((e) => e.trackId);
const current = (s: QueueState) => currentEntry(s)?.trackId;
/** Deterministic "random": Fisher-Yates always swaps with slot 0, which reorders the list. */
const fixedRandom = () => 0;

describe('queue', () => {
  it('plays a list from the chosen track', () => {
    const q = playNow(EMPTY_QUEUE, [1, 2, 3], 1);
    expect(ids(q)).toEqual([1, 2, 3]);
    expect(current(q)).toBe(2);
    expect(new Set(q.entries.map((e) => e.key)).size).toBe(3);
  });

  it('inserts "play next" after the current track and appends "add to queue"', () => {
    let q = playNow(EMPTY_QUEUE, [1, 2, 3], 0);
    q = playNext(q, [7, 8]);
    q = addToQueue(q, [9]);
    expect(ids(q)).toEqual([1, 7, 8, 2, 3, 9]);
    expect(current(q)).toBe(1);
  });

  it('starts playing when adding to an empty queue', () => {
    expect(ids(addToQueue(EMPTY_QUEUE, [4, 5]))).toEqual([4, 5]);
    expect(ids(playNext(EMPTY_QUEUE, [6]))).toEqual([6]);
  });

  it('allows the same track twice as separate entries', () => {
    const q = addToQueue(playNow(EMPTY_QUEUE, [1], 0), [1]);
    expect(ids(q)).toEqual([1, 1]);
    const [a, b] = q.entries;
    expect(a?.key).not.toBe(b?.key);
    expect(ids(removeEntry(q, b?.key ?? -1))).toEqual([1]);
  });

  describe('remove and move', () => {
    const base = () => skipTo(playNow(EMPTY_QUEUE, [1, 2, 3, 4], 0), 2);
    const keyOf = (q: QueueState, trackId: number) =>
      q.entries.find((e) => e.trackId === trackId)?.key ?? -1;

    it('keeps the current track when removing others', () => {
      const q = base();
      expect(current(removeEntry(q, keyOf(q, 1)))).toBe(3);
      expect(current(removeEntry(q, keyOf(q, 4)))).toBe(3);
    });

    it('makes the next track current when removing the current one', () => {
      const q = base();
      const removed = removeEntry(q, keyOf(q, 3));
      expect(ids(removed)).toEqual([1, 2, 4]);
      expect(current(removed)).toBe(4);
      const last = skipTo(q, 3);
      expect(current(removeEntry(last, keyOf(last, 4)))).toBe(3);
    });

    it('moves entries and follows the current one', () => {
      const q = base();
      const moved = moveEntry(q, 2, 0);
      expect(ids(moved)).toEqual([3, 1, 2, 4]);
      expect(current(moved)).toBe(3);
      const other = moveEntry(q, 0, 3);
      expect(ids(other)).toEqual([2, 3, 4, 1]);
      expect(current(other)).toBe(3);
      expect(moveEntry(q, 0, 9)).toBe(q);
    });

    it('clears everything', () => {
      expect(clearQueue(base())).toMatchObject({ entries: [], index: 0 });
    });
  });

  describe('shuffle', () => {
    it('puts the current track first and shuffles the rest', () => {
      const q = setShuffle(skipTo(playNow(EMPTY_QUEUE, [1, 2, 3, 4, 5], 0), 2), true, fixedRandom);
      expect(current(q)).toBe(3);
      expect(q.index).toBe(0);
      expect(ids(q).slice().sort()).toEqual([1, 2, 3, 4, 5]);
      expect(ids(q)).not.toEqual([3, 1, 2, 4, 5]);
    });

    it('restores the original order on unshuffle with the current track still current', () => {
      let q = playNow(EMPTY_QUEUE, [1, 2, 3, 4, 5], 0);
      q = setShuffle(q, true, fixedRandom);
      q = skipTo(q, 3);
      const playing = current(q);
      q = setShuffle(q, false);
      expect(ids(q)).toEqual([1, 2, 3, 4, 5]);
      expect(current(q)).toBe(playing);
      expect(q.original).toBeNull();
    });

    it('keeps additions and removals made while shuffled when unshuffling', () => {
      let q = playNow(EMPTY_QUEUE, [1, 2, 3], 0);
      q = setShuffle(q, true, fixedRandom);
      q = playNext(q, [8]);
      q = addToQueue(q, [9]);
      const two = q.entries.find((e) => e.trackId === 2)?.key ?? -1;
      q = removeEntry(q, two);
      q = setShuffle(q, false);
      expect(ids(q)).toEqual([1, 8, 3, 9]);
      expect(current(q)).toBe(1);
    });

    it('shuffles a new list when shuffle is already on', () => {
      const on = setShuffle(EMPTY_QUEUE, true);
      const q = playNow(on, [1, 2, 3, 4], 2, fixedRandom);
      expect(current(q)).toBe(3);
      expect(q.index).toBe(0);
      expect(ids(setShuffle(q, false))).toEqual([1, 2, 3, 4]);
    });
  });

  describe('repeat and navigation', () => {
    const q = playNow(EMPTY_QUEUE, [1, 2, 3], 0);

    it('stops at the end with repeat off and wraps otherwise', () => {
      const last = skipTo(q, 2);
      expect(nextIndex(last)).toBeNull();
      expect(nextIndex(setRepeat(last, 'all'))).toBe(0);
      expect(nextIndex(setRepeat(last, 'one'))).toBe(0);
      expect(previousIndex(q)).toBeNull();
      expect(previousIndex(setRepeat(q, 'all'))).toBe(2);
    });

    it('restarts on previous after 3 s, otherwise goes back', () => {
      const second = skipTo(q, 1);
      expect(previousAction(second, 3.5)).toEqual({ type: 'restart' });
      expect(previousAction(second, 2.9)).toEqual({ type: 'skip', index: 0 });
      expect(previousAction(q, 1)).toEqual({ type: 'restart' });
      expect(previousAction(setRepeat(q, 'all'), 1)).toEqual({ type: 'skip', index: 2 });
    });
  });
});
