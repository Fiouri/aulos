export const REPEAT_MODES = ['off', 'all', 'one'] as const;
export type RepeatMode = (typeof REPEAT_MODES)[number];

/** One slot of the queue. `key` is unique within the queue, so a track may appear twice. */
export interface QueueEntry {
  key: number;
  trackId: number;
}

export interface QueueState {
  /** Play order. */
  entries: QueueEntry[];
  /** Index of the current entry in `entries`; 0 when the queue is empty. */
  index: number;
  /**
   * The order before shuffling, kept in step with additions and removals so turning shuffle off
   * restores it. Null when shuffle is off.
   */
  original: QueueEntry[] | null;
  repeat: RepeatMode;
  nextKey: number;
}

export type Random = () => number;

/** "Previous" restarts the current track once it has played this long. */
export const RESTART_THRESHOLD_SEC = 3;

export const EMPTY_QUEUE: QueueState = {
  entries: [],
  index: 0,
  original: null,
  repeat: 'off',
  nextKey: 1,
};

export function isShuffled(state: QueueState): boolean {
  return state.original !== null;
}

export function currentEntry(state: QueueState): QueueEntry | null {
  return state.entries[state.index] ?? null;
}

function createEntries(state: QueueState, trackIds: readonly number[]) {
  const entries = trackIds.map((trackId, i) => ({ key: state.nextKey + i, trackId }));
  return { entries, nextKey: state.nextKey + trackIds.length };
}

/** Fisher-Yates on a copy. */
function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Current entry first, the rest in random order. */
function shuffleAround(entries: readonly QueueEntry[], current: QueueEntry | null, random: Random) {
  const rest = shuffled(
    entries.filter((e) => e !== current),
    random,
  );
  return current ? [current, ...rest] : rest;
}

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(index, length - 1));

/**
 * Replaces the queue with `trackIds`, starting at `startIndex`. With shuffle on, the chosen track
 * plays first and the rest follow in random order.
 */
export function playNow(
  state: QueueState,
  trackIds: readonly number[],
  startIndex: number,
  random: Random = Math.random,
): QueueState {
  const { entries, nextKey } = createEntries(state, trackIds);
  const index = clampIndex(startIndex, entries.length);
  if (!isShuffled(state)) return { ...state, entries, index, nextKey };
  return {
    ...state,
    entries: shuffleAround(entries, entries[index] ?? null, random),
    index: 0,
    original: entries,
    nextKey,
  };
}

/** Inserts right after the current entry (in both orders when shuffled). */
export function playNext(state: QueueState, trackIds: readonly number[]): QueueState {
  if (state.entries.length === 0) return playNow(state, trackIds, 0);
  const { entries: added, nextKey } = createEntries(state, trackIds);
  const insertAfter = (list: readonly QueueEntry[], position: number) => [
    ...list.slice(0, position + 1),
    ...added,
    ...list.slice(position + 1),
  ];
  const current = currentEntry(state);
  const original =
    state.original && insertAfter(state.original, current ? state.original.indexOf(current) : -1);
  return { ...state, entries: insertAfter(state.entries, state.index), original, nextKey };
}

/** Appends at the end (in both orders when shuffled). */
export function addToQueue(state: QueueState, trackIds: readonly number[]): QueueState {
  if (state.entries.length === 0) return playNow(state, trackIds, 0);
  const { entries: added, nextKey } = createEntries(state, trackIds);
  return {
    ...state,
    entries: [...state.entries, ...added],
    original: state.original && [...state.original, ...added],
    nextKey,
  };
}

/** Removing the current entry makes the following one current (or the new last one). */
export function removeEntry(state: QueueState, key: number): QueueState {
  const at = state.entries.findIndex((e) => e.key === key);
  if (at < 0) return state;
  const entries = state.entries.filter((e) => e.key !== key);
  const index = at < state.index ? state.index - 1 : state.index;
  return {
    ...state,
    entries,
    index: entries.length === 0 ? 0 : clampIndex(index, entries.length),
    original: state.original && state.original.filter((e) => e.key !== key),
  };
}

/** Moves the entry at `from` to `to` in play order; the current entry stays current. */
export function moveEntry(state: QueueState, from: number, to: number): QueueState {
  const n = state.entries.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
  const current = currentEntry(state);
  const entries = [...state.entries];
  const [moved] = entries.splice(from, 1);
  if (!moved) return state;
  entries.splice(to, 0, moved);
  return { ...state, entries, index: current ? entries.indexOf(current) : 0 };
}

export function clearQueue(state: QueueState): QueueState {
  return { ...state, entries: [], index: 0, original: state.original && [] };
}

export function skipTo(state: QueueState, index: number): QueueState {
  if (index < 0 || index >= state.entries.length) return state;
  return { ...state, index };
}

/**
 * Shuffle on: the current entry moves to the front and the rest is shuffled, remembering the old
 * order. Shuffle off: the remembered order comes back with the current entry still current.
 */
export function setShuffle(
  state: QueueState,
  on: boolean,
  random: Random = Math.random,
): QueueState {
  if (on === isShuffled(state)) return state;
  const current = currentEntry(state);
  if (on) {
    return {
      ...state,
      entries: shuffleAround(state.entries, current, random),
      index: 0,
      original: state.entries,
    };
  }
  const entries = state.original ?? state.entries;
  const index = current ? entries.indexOf(current) : 0;
  return { ...state, entries, index: Math.max(0, index), original: null };
}

export function setRepeat(state: QueueState, repeat: RepeatMode): QueueState {
  return { ...state, repeat };
}

/** Where "next" goes; wraps around unless repeat is off. Null at the end of the queue. */
export function nextIndex(state: QueueState): number | null {
  const n = state.entries.length;
  if (n === 0) return null;
  if (state.index + 1 < n) return state.index + 1;
  return state.repeat === 'off' ? null : 0;
}

export function previousIndex(state: QueueState): number | null {
  const n = state.entries.length;
  if (n === 0) return null;
  if (state.index > 0) return state.index - 1;
  return state.repeat === 'off' ? null : n - 1;
}

export type PreviousAction = { type: 'restart' } | { type: 'skip'; index: number };

/** Previous restarts the track after 3 s of play (or when there is nothing before it). */
export function previousAction(state: QueueState, positionSec: number): PreviousAction {
  const previous = previousIndex(state);
  if (positionSec > RESTART_THRESHOLD_SEC || previous === null) return { type: 'restart' };
  return { type: 'skip', index: previous };
}
