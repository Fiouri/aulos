/**
 * @jest-environment node
 */
import { z } from 'zod';

import {
  InvalidResponseError,
  isAbortError,
  NetworkError,
  NotFoundError,
  RateLimitError,
} from '../errors';
import { backoffMs, createHttpJson, MAX_RETRY_AFTER_MS, parseRetryAfter } from '../httpJson';

const schema = z.object({ ok: z.literal(true) });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function setup(responses: ((init?: RequestInit) => Promise<Response>)[]) {
  const calls: RequestInit[] = [];
  const delays: number[] = [];
  const fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
    calls.push(init ?? {});
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next(init);
  });
  const httpJson = createHttpJson({
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep: async (ms) => {
      delays.push(ms);
    },
    random: () => 1,
    now: () => Date.parse('2026-10-24T12:00:00Z'),
    userAgent: 'Aulos/0.1.0 (+https://example.org/aulos)',
  });
  return { httpJson, fetch, calls, delays };
}

/** A fetch that only settles when its signal aborts, like a request that never answers. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

describe('httpJson', () => {
  it('returns the validated body and sends the User-Agent', async () => {
    const { httpJson, calls } = setup([async () => json({ ok: true })]);
    await expect(httpJson('https://archive.org/x', schema)).resolves.toEqual({ ok: true });
    expect(calls[0]?.headers).toMatchObject({
      'User-Agent': 'Aulos/0.1.0 (+https://example.org/aulos)',
    });
  });

  it('times out each attempt and gives up after three with a NetworkError', async () => {
    const { httpJson, fetch, delays } = setup([hang, hang, hang]);
    const error = await httpJson('https://archive.org/x', schema, { timeoutMs: 5 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe('Request timed out');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1000]);
  });

  it('retries network errors and 5xx with exponential backoff', async () => {
    const { httpJson, fetch, delays } = setup([
      async () => {
        throw new TypeError('Network request failed');
      },
      async () => json({ error: 'busy' }, 503),
      async () => json({ ok: true }),
    ]);
    await expect(httpJson('https://archive.org/x', schema)).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1000]);
  });

  it('waits at least Retry-After on 429', async () => {
    const { httpJson, delays } = setup([
      async () => json({}, 429, { 'Retry-After': '2' }),
      async () => json({ ok: true }),
    ]);
    await expect(httpJson('https://archive.org/x', schema)).resolves.toEqual({ ok: true });
    expect(delays).toEqual([2000]);
  });

  it('reports a long Retry-After at once as a RateLimitError', async () => {
    const { httpJson, fetch } = setup([async () => json({}, 429, { 'Retry-After': '120' })]);
    const error = await httpJson('https://archive.org/x', schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(120_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up on repeated 429 with a RateLimitError', async () => {
    const limited = async () => json({}, 429);
    const { httpJson, fetch } = setup([limited, limited, limited]);
    await expect(httpJson('https://archive.org/x', schema)).rejects.toBeInstanceOf(RateLimitError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry 404, other 4xx, non-JSON or an unexpected shape', async () => {
    const cases: [() => Promise<Response>, new (...args: never[]) => Error][] = [
      [async () => json({}, 404), NotFoundError],
      [async () => json({}, 403), InvalidResponseError],
      [async () => new Response('<html>', { status: 200 }), InvalidResponseError],
      [async () => json({ ok: 'yes' }), InvalidResponseError],
    ];
    for (const [response, type] of cases) {
      const { httpJson, fetch } = setup([response]);
      await expect(httpJson('https://archive.org/x', schema)).rejects.toBeInstanceOf(type);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('names the failing field of an invalid shape without the body', async () => {
    const { httpJson } = setup([async () => json({ ok: 'secret-value' })]);
    const error = (await httpJson('https://archive.org/x', schema).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toBe('Unexpected response shape at ok');
    expect(error.message).not.toContain('secret-value');
  });

  it('rejects with an AbortError, without retrying, when the caller cancels', async () => {
    const controller = new AbortController();
    const { httpJson, fetch } = setup([
      (init) => {
        const pending = hang(init);
        controller.abort();
        return pending;
      },
    ]);
    const error = await httpJson('https://archive.org/x', schema, {
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('retry timing', () => {
  it('caps the exponential backoff and applies jitter', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffMs(n, () => 1))).toEqual([
      500, 1000, 2000, 4000, 8000, 8000,
    ]);
    expect(backoffMs(3, () => 0.25)).toBe(500);
  });

  it('reads Retry-After as seconds or an HTTP date', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(parseRetryAfter('3', now)).toBe(3000);
    expect(parseRetryAfter('Sat, 24 Oct 2026 12:00:10 GMT', now)).toBe(10_000);
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(MAX_RETRY_AFTER_MS).toBe(30_000);
  });
});
