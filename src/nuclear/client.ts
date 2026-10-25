import { z } from 'zod';

import { abortError } from '@/net/errors';
import { assertRequestAllowed } from '@/net/guard';

import {
  errorBodySchema,
  healthSchema,
  lyricsSchema,
  playbackSchema,
  playlistIdSchema,
  queueSchema,
  searchResultsSchema,
  settingsSchema,
  volumeSchema,
  type JamPlayback,
  type JamProviderRef,
  type JamQueue,
  type JamRepeat,
  type JamSearchCategory,
  type JamSearchResults,
  type JamSettings,
  type JamTrack,
} from './schemas';

/** Actions and state reads give up after this long; the event stream has no timeout. */
export const JAM_TIMEOUT_MS = 3000;

export type JamErrorKind = 'unreachable' | 'timeout' | 'http' | 'invalidResponse';

/**
 * A failed Jam request. For an HTTP error the `{ error }` body Nuclear sends is surfaced as
 * `serverMessage` (for example "Playback.toggle failed: no track in queue").
 */
export class JamError extends Error {
  override name = 'JamError';
  constructor(
    readonly kind: JamErrorKind,
    readonly status: number | null = null,
    readonly serverMessage: string | null = null,
  ) {
    super(serverMessage ?? `Nuclear request failed (${kind}${status ? ` ${status}` : ''})`);
  }
}

/** `http://host:port` for a Jam server; IPv6 hosts are bracketed. */
export function jamBaseUrl(host: string, port: number): string {
  const bare = host.replace(/^\[(.*)\]$/, '$1');
  return `http://${bare.includes(':') ? `[${bare}]` : bare}:${port}`;
}

export interface JamClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Typed client for every endpoint of Nuclear's HTTP API (packages/docs/integrations/http-api.md). */
export function createJamClient({
  baseUrl,
  fetch: doFetch = fetch,
  timeoutMs = JAM_TIMEOUT_MS,
}: JamClientOptions) {
  const request = async (
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<Response> => {
    const url = `${baseUrl}/api${path}`;
    assertRequestAllowed(url);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      let response: Response;
      try {
        response = await doFetch(url, {
          method,
          headers:
            body === undefined
              ? { Accept: 'application/json' }
              : { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch {
        if (options.signal?.aborted) throw abortError();
        throw new JamError(timedOut ? 'timeout' : 'unreachable');
      }
      if (!response.ok) {
        let message: string | null = null;
        try {
          const parsed = errorBodySchema.safeParse(await response.json());
          if (parsed.success) message = parsed.data.error;
        } catch {
          message = null;
        }
        throw new JamError('http', response.status, message);
      }
      return response;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  };

  const json = async <T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> => {
    const response = await request(method, path, body, options);
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new JamError('invalidResponse', response.status);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new JamError('invalidResponse', response.status);
    return parsed.data;
  };

  const action = async (path: string, body?: unknown, options?: RequestOptions): Promise<void> => {
    await request('POST', path, body, options);
  };

  return {
    baseUrl,
    eventsUrl: `${baseUrl}/api/events`,

    health: (options?: RequestOptions) => json('GET', '/health', healthSchema, undefined, options),
    queue: (options?: RequestOptions): Promise<JamQueue> =>
      json('GET', '/queue', queueSchema, undefined, options),
    playback: (options?: RequestOptions): Promise<JamPlayback> =>
      json('GET', '/playback', playbackSchema, undefined, options),
    volume: async (options?: RequestOptions): Promise<number> =>
      (await json('GET', '/playback/volume', volumeSchema, undefined, options)).volume,
    settings: (options?: RequestOptions): Promise<JamSettings> =>
      json('GET', '/settings', settingsSchema, undefined, options),
    setting: (id: string, options?: RequestOptions): Promise<unknown> =>
      json('GET', `/settings/${encodeURIComponent(id)}`, z.unknown(), undefined, options),
    setSetting: (id: string, value: unknown, options?: RequestOptions) =>
      action(`/settings/${encodeURIComponent(id)}`, value, options),
    currentLyrics: (options?: RequestOptions) =>
      json('GET', '/lyrics/current', lyricsSchema, undefined, options),

    play: (options?: RequestOptions) => action('/playback/play', undefined, options),
    pause: (options?: RequestOptions) => action('/playback/pause', undefined, options),
    toggle: (options?: RequestOptions) => action('/playback/toggle', undefined, options),
    next: (options?: RequestOptions) => action('/playback/next', undefined, options),
    previous: (options?: RequestOptions) => action('/playback/previous', undefined, options),
    seek: (seconds: number, options?: RequestOptions) =>
      action('/playback/seek', { seconds }, options),
    setShuffle: (enabled: boolean, options?: RequestOptions) =>
      action('/playback/shuffle', { enabled }, options),
    setRepeat: (mode: JamRepeat, options?: RequestOptions) =>
      action('/playback/repeat', { mode }, options),
    setVolume: (volume: number, options?: RequestOptions) =>
      action('/playback/volume', { volume: Math.min(1, Math.max(0, volume)) }, options),

    addToQueue: (tracks: readonly JamTrack[], options?: RequestOptions) =>
      action('/queue/add', { tracks }, options),
    removeFromQueue: (ids: readonly string[], options?: RequestOptions) =>
      action('/queue/remove', { ids }, options),
    goTo: (index: number, options?: RequestOptions) => action('/queue/go-to', { index }, options),
    clearQueue: (options?: RequestOptions) => action('/queue/clear', undefined, options),

    addFavorite: (track: JamTrack, options?: RequestOptions) =>
      action('/favorites/tracks/add', { track }, options),
    removeFavorite: (source: JamProviderRef, options?: RequestOptions) =>
      action('/favorites/tracks/remove', { source }, options),
    saveQueueAsPlaylist: async (name: string, options?: RequestOptions): Promise<string> =>
      (await json('POST', '/playlists/from-queue', playlistIdSchema, { name }, options)).id,

    search: (
      query: string,
      params: { types?: readonly JamSearchCategory[]; limit?: number } = {},
      options?: RequestOptions,
    ): Promise<JamSearchResults> =>
      json('POST', '/search', searchResultsSchema, { query, ...params }, options),
  };
}

export type JamClient = ReturnType<typeof createJamClient>;
