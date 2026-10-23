import type { QueueState } from './queue';

/**
 * The native AudioPlaylist only holds a window of the queue around the current entry: enough
 * ahead for gapless transitions and lock-screen "next", a few behind for "previous". Every queue
 * change is applied as a handful of insert/remove calls instead of rebuilding a 2,000-item list.
 */
export const WINDOW_AHEAD = 8;
export const WINDOW_BEHIND = 4;

/** Entry keys loaded in the native playlist, and the native index of the current one. */
export interface PlayerWindow {
  keys: number[];
  current: number;
}

export interface WindowOptions {
  ahead?: number;
  behind?: number;
  /** Load nothing after the current entry, so playback stops when it ends (sleep timer). */
  stopAfterCurrent?: boolean;
}

/** The window the native playlist should hold for this queue; null for an empty queue. */
export function desiredWindow(state: QueueState, options: WindowOptions = {}): PlayerWindow | null {
  const { ahead = WINDOW_AHEAD, behind = WINDOW_BEHIND, stopAfterCurrent = false } = options;
  const { entries, index } = state;
  const n = entries.length;
  const current = entries[index];
  if (!current) return null;
  const wraps = state.repeat !== 'off';

  const before: number[] = [];
  for (let step = 1; step <= behind; step += 1) {
    const i = index - step;
    if (i < 0 && !wraps) break;
    const entry = entries[(i + n * behind) % n];
    if (!entry) break;
    before.unshift(entry.key);
  }

  const after: number[] = [];
  if (!stopAfterCurrent) {
    for (let step = 1; step <= ahead; step += 1) {
      const i = index + step;
      if (i >= n && !wraps) break;
      const entry = entries[i % n];
      if (!entry) break;
      after.push(entry.key);
    }
  }

  return { keys: [...before, current.key, ...after], current: before.length };
}

export type NativeOp =
  | { type: 'remove'; index: number }
  | { type: 'insert'; index: number; key: number }
  | { type: 'add'; key: number }
  | { type: 'skipTo'; index: number };

function commonPrefix(a: readonly number[], b: readonly number[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffix(a: readonly number[], b: readonly number[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

/**
 * Native calls that turn `native` into `desired`. The current item is never removed while it
 * plays: when the desired current entry is already loaded the plan skips to it, otherwise it is
 * loaded next to the playing one, skipped to, and the old one removed afterwards.
 */
export function planWindowSync(native: PlayerWindow, desired: PlayerWindow): NativeOp[] {
  const ops: NativeOp[] = [];
  const target = desired.keys[desired.current];
  if (target === undefined) return ops;

  if (native.keys.length === 0) {
    for (const key of desired.keys) ops.push({ type: 'add', key });
    if (desired.current > 0) ops.push({ type: 'skipTo', index: desired.current });
    return ops;
  }

  let keys = [...native.keys];
  let current = native.current;

  if (keys[current] !== target) {
    const loaded = keys.indexOf(target);
    if (loaded >= 0) {
      ops.push({ type: 'skipTo', index: loaded });
      current = loaded;
    } else {
      // Keep only the playing item, put the target right after it, jump, then drop the old one.
      for (let i = keys.length - 1; i > current; i -= 1) ops.push({ type: 'remove', index: i });
      for (let i = 0; i < current; i += 1) ops.push({ type: 'remove', index: 0 });
      ops.push(
        { type: 'add', key: target },
        { type: 'skipTo', index: 1 },
        { type: 'remove', index: 0 },
      );
      keys = [target];
      current = 0;
    }
  }

  const nativeAfter = keys.slice(current + 1);
  const desiredAfter = desired.keys.slice(desired.current + 1);
  const keepAfter = commonPrefix(nativeAfter, desiredAfter);
  for (let i = nativeAfter.length - 1; i >= keepAfter; i -= 1) {
    ops.push({ type: 'remove', index: current + 1 + i });
  }
  for (const key of desiredAfter.slice(keepAfter)) ops.push({ type: 'add', key });

  const nativeBefore = keys.slice(0, current);
  const desiredBefore = desired.keys.slice(0, desired.current);
  const keepBefore = commonSuffix(nativeBefore, desiredBefore);
  for (let i = 0; i < nativeBefore.length - keepBefore; i += 1) {
    ops.push({ type: 'remove', index: 0 });
  }
  desiredBefore
    .slice(0, desiredBefore.length - keepBefore)
    .forEach((key, i) => ops.push({ type: 'insert', index: i, key }));

  return ops;
}

/** Applies ops to a window model exactly as ExoPlayer does to its playlist. */
export function applyOps(window: PlayerWindow, ops: readonly NativeOp[]): PlayerWindow {
  const keys = [...window.keys];
  let current = window.current;
  for (const op of ops) {
    switch (op.type) {
      case 'add':
        keys.push(op.key);
        break;
      case 'insert':
        keys.splice(op.index, 0, op.key);
        if (op.index <= current && keys.length > 1) current += 1;
        break;
      case 'remove':
        keys.splice(op.index, 1);
        if (op.index < current) current -= 1;
        else if (op.index === current) current = Math.min(current, keys.length - 1);
        break;
      case 'skipTo':
        current = op.index;
        break;
    }
  }
  return { keys, current: Math.max(0, current) };
}
