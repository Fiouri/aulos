export const DOWNLOAD_STATUSES = [
  'queued',
  'downloading',
  'paused',
  'completed',
  'failed',
] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

/**
 * start: a queued download begins; resume: a paused one continues from its partial file;
 * interrupt: the transfer stopped without failing (network lost, Wi-Fi-only gate closed, app
 * stopped); complete / fail: it ended; retry: a failed one goes back in the queue.
 */
export type DownloadEvent = 'start' | 'resume' | 'interrupt' | 'complete' | 'fail' | 'retry';

const TRANSITIONS: Record<DownloadStatus, Partial<Record<DownloadEvent, DownloadStatus>>> = {
  queued: { start: 'downloading' },
  downloading: { interrupt: 'paused', complete: 'completed', fail: 'failed' },
  paused: { resume: 'downloading' },
  failed: { retry: 'queued' },
  completed: {},
};

export class InvalidTransitionError extends Error {
  override name = 'InvalidTransitionError';
  constructor(status: DownloadStatus, event: DownloadEvent) {
    super(`Download cannot ${event} while ${status}`);
  }
}

/** queued → downloading → paused → completed | failed, as a pure function. */
export function transition(status: DownloadStatus, event: DownloadEvent): DownloadStatus {
  const next = TRANSITIONS[status][event];
  if (!next) throw new InvalidTransitionError(status, event);
  return next;
}

export function canTransition(status: DownloadStatus, event: DownloadEvent): boolean {
  return TRANSITIONS[status][event] !== undefined;
}

export function isDownloadStatus(value: string): value is DownloadStatus {
  return DOWNLOAD_STATUSES.some((s) => s === value);
}
