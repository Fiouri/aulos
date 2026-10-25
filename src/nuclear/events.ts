import {
  playbackSchema,
  queueSchema,
  settingsSchema,
  type JamPlayback,
  type JamQueue,
  type JamSettings,
} from './schemas';
import type { SseEvent } from './sse';

export type JamEvent =
  | { type: 'queue'; queue: JamQueue }
  | { type: 'playback'; playback: JamPlayback }
  | { type: 'settings'; settings: JamSettings };

/** A Jam `/api/events` frame as typed state; null for unknown events or a malformed body. */
export function parseJamEvent(event: SseEvent): JamEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return null;
  }
  switch (event.type) {
    case 'queue': {
      const parsed = queueSchema.safeParse(data);
      return parsed.success ? { type: 'queue', queue: parsed.data } : null;
    }
    case 'playback': {
      const parsed = playbackSchema.safeParse(data);
      return parsed.success ? { type: 'playback', playback: parsed.data } : null;
    }
    case 'settings': {
      const parsed = settingsSchema.safeParse(data);
      return parsed.success ? { type: 'settings', settings: parsed.data } : null;
    }
    default:
      return null;
  }
}

export type PcConnection = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export const NEXT_REPEAT = { off: 'all', all: 'one', one: 'off' } as const;
