/**
 * Typed failures of provider requests. The UI maps each kind to an English message through
 * t() (see src/ui/errors.ts); none of them carries a URL or a response body.
 */
export abstract class ProviderError extends Error {
  abstract readonly kind: 'network' | 'rateLimit' | 'notFound' | 'invalidResponse';
}

/** No connection, a timeout, or the service failed (5xx) after every retry. */
export class NetworkError extends ProviderError {
  override name = 'NetworkError';
  readonly kind = 'network';
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** HTTP 429 after every retry, or a Retry-After longer than the client is willing to wait. */
export class RateLimitError extends ProviderError {
  override name = 'RateLimitError';
  readonly kind = 'rateLimit';
  constructor(readonly retryAfterMs: number | null) {
    super('Rate limited');
  }
}

export class NotFoundError extends ProviderError {
  override name = 'NotFoundError';
  readonly kind = 'notFound';
  constructor(message = 'Not found') {
    super(message);
  }
}

/** Not JSON, not the expected shape, or an unexpected HTTP status. */
export class InvalidResponseError extends ProviderError {
  override name = 'InvalidResponseError';
  readonly kind = 'invalidResponse';
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** True for a request the caller cancelled (AbortController), which is never an error to show. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}
