import { Directory, DownloadTask, File } from 'expo-file-system';

import {
  abortError,
  InvalidResponseError,
  isAbortError,
  NetworkError,
  NotFoundError,
} from '@/net/errors';
import { assertRequestAllowed } from '@/net/guard';

export interface TransferRequest {
  url: string;
  /** file:// URI of the destination. */
  fileUri: string;
  /** Continue after the bytes already in the destination instead of starting over. */
  resume: boolean;
  headers: Record<string, string>;
  signal?: AbortSignal;
  onProgress: (bytesDone: number, bytesTotal: number | null) => void;
}

/** Streams a URL into a file; rejects with the typed errors of src/net/errors.ts. */
export type Transfer = (request: TransferRequest) => Promise<void>;

export interface FileOps {
  /** Size in bytes, or null when the file does not exist. */
  size(uri: string): number | null;
  remove(uri: string): void;
  md5(uri: string): Promise<string>;
  /** Creates the directory (and parents) when missing. */
  ensureDir(uri: string): void;
}

export const expoFileOps: FileOps = {
  size(uri) {
    const file = new File(uri);
    return file.exists ? file.size : null;
  },
  remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  md5(uri) {
    return new File(uri).digest('MD5');
  },
  ensureDir(uri) {
    const dir = new Directory(uri);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  },
};

/** Native download errors carry the HTTP status in their message ("HTTP 404"). */
function toTypedError(error: unknown, signal: AbortSignal | undefined): Error {
  if (signal?.aborted || isAbortError(error)) return abortError();
  const message = error instanceof Error ? error.message : '';
  const status = Number(/HTTP (\d{3})/.exec(message)?.[1] ?? NaN);
  if (status === 404 || status === 410) return new NotFoundError();
  if (status >= 500) return new NetworkError('Service unavailable', status);
  if (status >= 400) return new InvalidResponseError('Unexpected HTTP status', status);
  return new NetworkError('Download interrupted');
}

/**
 * expo-file-system (SDK 58) download task. A resume restores a paused task from the bytes
 * already on disk: on Android the task's resume data is that byte offset, and the native side
 * sends `Range: bytes=<offset>-` (starting over if the server ignores it), so a download stopped
 * by a lost network or a killed app continues where its file ends.
 */
export const expoTransfer: Transfer = async (request) => {
  const { url, fileUri, resume, headers, signal, onProgress } = request;
  assertRequestAllowed(url);
  const options = {
    headers,
    signal,
    onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) =>
      onProgress(bytesWritten, totalBytes >= 0 ? totalBytes : null),
  };
  const existing = expoFileOps.size(fileUri) ?? 0;
  const task =
    resume && existing > 0
      ? DownloadTask.fromSavable(
          { url, fileUri, isDirectory: false, headers, resumeData: String(existing) },
          options,
        )
      : File.createDownloadTask(url, new File(fileUri), options);
  let result: File | null;
  try {
    result = resume && existing > 0 ? await task.resumeAsync() : await task.downloadAsync();
  } catch (error) {
    throw toTypedError(error, signal);
  } finally {
    task.release();
  }
  if (result === null) throw new NetworkError('Download interrupted');
};
