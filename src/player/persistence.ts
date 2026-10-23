import {
  EMPTY_QUEUE,
  REPEAT_MODES,
  type QueueEntry,
  type QueueState,
  type RepeatMode,
} from './queue';

export const QUEUE_KV_KEY = 'player.queue';
/** While playing, the queue position is saved at most this often. */
export const SAVE_INTERVAL_MS = 5000;

export interface PersistedQueue {
  version: 1;
  trackIds: number[];
  index: number;
  positionMs: number;
  repeat: RepeatMode;
  /** When shuffled: for each slot of the original order, its index in `trackIds`. */
  originalOrder: number[] | null;
}

export function serializeQueue(state: QueueState, positionMs: number): PersistedQueue {
  const slot = new Map(state.entries.map((e, i) => [e.key, i]));
  return {
    version: 1,
    trackIds: state.entries.map((e) => e.trackId),
    index: state.index,
    positionMs: Math.max(0, Math.round(positionMs)),
    repeat: state.repeat,
    originalOrder: state.original
      ? state.original.flatMap((e) => {
          const i = slot.get(e.key);
          return i === undefined ? [] : [i];
        })
      : null,
  };
}

const isIntArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => Number.isInteger(x));

export function parsePersistedQueue(value: unknown): PersistedQueue | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !isIntArray(v.trackIds)) return null;
  if (typeof v.index !== 'number' || typeof v.positionMs !== 'number') return null;
  const repeat = REPEAT_MODES.find((m) => m === v.repeat) ?? 'off';
  const originalOrder = isIntArray(v.originalOrder) ? v.originalOrder : null;
  return {
    version: 1,
    trackIds: v.trackIds,
    index: v.index,
    positionMs: v.positionMs,
    repeat,
    originalOrder,
  };
}

export interface RestoredQueue {
  queue: QueueState;
  positionMs: number;
}

/**
 * Rebuilds the queue from storage, dropping tracks that left the library. When the current track
 * is gone, the next surviving one becomes current from its start.
 */
export function restoreQueue(saved: PersistedQueue, available: ReadonlySet<number>): RestoredQueue {
  const kept: { entry: QueueEntry; slot: number }[] = [];
  saved.trackIds.forEach((trackId, slot) => {
    if (available.has(trackId)) kept.push({ entry: { key: kept.length + 1, trackId }, slot });
  });
  if (kept.length === 0) return { queue: { ...EMPTY_QUEUE, repeat: saved.repeat }, positionMs: 0 };

  const firstAtOrAfter = kept.findIndex((k) => k.slot >= saved.index);
  const currentKept = kept[firstAtOrAfter];
  const index = firstAtOrAfter >= 0 ? firstAtOrAfter : kept.length - 1;
  const positionMs = currentKept && currentKept.slot === saved.index ? saved.positionMs : 0;

  const bySlot = new Map(kept.map((k) => [k.slot, k.entry]));
  const original = saved.originalOrder
    ? saved.originalOrder.flatMap((slot) => {
        const entry = bySlot.get(slot);
        return entry ? [entry] : [];
      })
    : null;

  return {
    queue: {
      entries: kept.map((k) => k.entry),
      index,
      original,
      repeat: saved.repeat,
      nextKey: kept.length + 1,
    },
    positionMs,
  };
}

/** Throttle for position saves: at most once per interval unless forced. */
export function createSaveThrottle(intervalMs = SAVE_INTERVAL_MS) {
  let lastSave = Number.NEGATIVE_INFINITY;
  return {
    shouldSave(now: number, force = false): boolean {
      if (!force && now - lastSave < intervalMs) return false;
      lastSave = now;
      return true;
    },
  };
}
