import type { z } from 'zod';

import {
  abortError,
  InvalidResponseError,
  NetworkError,
  NotFoundError,
  RateLimitError,
} from './errors';
import { assertRequestAllowed } from './guard';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8_000;
/** A Retry-After beyond this is reported as a RateLimitError instead of waited out. */
export const MAX_RETRY_AFTER_MS = 30_000;

export interface HttpDeps {
  fetch: typeof fetch;
  /** Resolves after `ms`, or rejects with an AbortError when `signal` aborts first. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
  now: () => number;
  userAgent: string;
}

export interface HttpJsonOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxAttempts?: number;
}

export type HttpJson = <T>(
  url: string,
  schema: z.ZodType<T>,
  options?: HttpJsonOptions,
) => Promise<T>;

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Full jitter: a random delay up to the capped exponential step of this attempt. */
export function backoffMs(attempt: number, random: () => number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
  return Math.round(random() * ceiling);
}

/** Retry-After as delta seconds or an HTTP date; null when absent or unreadable. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null || value.trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

class RetryableFailure {
  constructor(
    readonly error: NetworkError | RateLimitError,
    readonly delayMs: number | null,
  ) {}
}

/**
 * JSON GET over fetch for provider APIs: a timeout per attempt, caller cancellation, up to three
 * attempts with exponential backoff and jitter on network errors, 429 (honouring Retry-After)
 * and 5xx, and zod validation of the body. Failures surface as the typed errors of errors.ts;
 * a caller abort rejects with an AbortError and is never retried. Cleartext to a public host is
 * refused with a CleartextBlockedError before anything is sent.
 */
export function createHttpJson(deps: HttpDeps): HttpJson {
  const attempt = async <T>(
    url: string,
    schema: z.ZodType<T>,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<T> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      let response: Response;
      try {
        response = await deps.fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': deps.userAgent },
          signal: controller.signal,
        });
      } catch {
        if (signal?.aborted) throw abortError();
        throw new RetryableFailure(
          new NetworkError(timedOut ? 'Request timed out' : 'Network request failed'),
          null,
        );
      }
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'), deps.now());
        throw new RetryableFailure(new RateLimitError(retryAfter), retryAfter);
      }
      if (response.status >= 500) {
        throw new RetryableFailure(new NetworkError('Service unavailable', response.status), null);
      }
      if (response.status === 404) throw new NotFoundError();
      if (!response.ok) {
        throw new InvalidResponseError('Unexpected HTTP status', response.status);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        if (signal?.aborted) throw abortError();
        if (timedOut) throw new RetryableFailure(new NetworkError('Request timed out'), null);
        throw new InvalidResponseError('Response is not JSON', response.status);
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const where = parsed.error.issues[0]?.path.join('.') || 'body';
        throw new InvalidResponseError(`Unexpected response shape at ${where}`, response.status);
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };

  return async (url, schema, options = {}) => {
    assertRequestAllowed(url);
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, maxAttempts = MAX_ATTEMPTS } = options;
    for (let n = 1; ; n += 1) {
      if (signal?.aborted) throw abortError();
      try {
        return await attempt(url, schema, timeoutMs, signal);
      } catch (failure) {
        if (!(failure instanceof RetryableFailure)) throw failure;
        const { error, delayMs } = failure;
        if (n >= maxAttempts) throw error;
        if (delayMs !== null && delayMs > MAX_RETRY_AFTER_MS) throw error;
        await deps.sleep(Math.max(delayMs ?? 0, backoffMs(n, deps.random)), signal);
      }
    }
  };
}
