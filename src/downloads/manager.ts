import type { Db } from '@/db/types';
import { getTracks } from '@/library/queries';
import { LOCAL_PROVIDER } from '@/library/providers';
import { isAbortError, NetworkError, ProviderError } from '@/net/errors';
import type { NetworkStatus } from '@/net/network';
import type { DownloadFormat, SourceProvider } from '@/providers/types';

import { IntegrityError, StorageLimitError } from './errors';
import { transition, type DownloadStatus } from './machine';
import { downloadStem } from './names';
import type { FileOps } from './transfer';

export const MAX_CONCURRENT_DOWNLOADS = 2;
/** bytes_done is written to the database at most this often while a transfer runs. */
const PROGRESS_WRITE_MS = 2000;
const EXTENSIONS = ['mp3', 'flac', 'ogg'] as const;
/** A download whose connection dropped waits this long before it is tried again, unless the
 * network changes first. */
export const RECONNECT_HOLD_MS = 30_000;

export interface DownloadSettings {
  wifiOnly: boolean;
  limitBytes: number;
  format: DownloadFormat;
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  wifiOnly: true,
  limitBytes: 2 * 1024 ** 3,
  format: 'mp3',
};

/** Why a download failed, stored in downloads.error and shown through t(). */
export type DownloadErrorCode =
  | 'network'
  | 'rateLimit'
  | 'notFound'
  | 'invalidResponse'
  | 'storageLimit'
  | 'integrity'
  | 'unavailable'
  | 'unknown';

export interface DownloadRow {
  trackId: number;
  status: DownloadStatus;
  format: DownloadFormat;
  fileName: string;
  bytesDone: number;
  bytesTotal: number | null;
  error: DownloadErrorCode | null;
  createdAt: number;
  updatedAt: number;
}

export interface DownloadManagerDeps {
  db: Db;
  /** The enabled provider with this id, if any. */
  provider: (id: string) => SourceProvider | undefined;
  files: FileOps;
  /** file:// URI of the downloads directory, ending with '/'. */
  dir: string;
  network: () => Promise<NetworkStatus>;
  settings: () => DownloadSettings;
  now: () => number;
  /** Rows were added, removed or changed state. */
  onChange: () => void;
  onProgress: (trackId: number, bytesDone: number, bytesTotal: number | null) => void;
  /** A track gained or lost its local file. */
  onLibraryChange: () => void;
  /** Schedules `run` after `ms` (setTimeout; tests pass a fake). */
  schedule?: (run: () => void, ms: number) => void;
}

const ROW_COLUMNS = `track_id AS trackId, status, format, file_name AS fileName,
  bytes_done AS bytesDone, bytes_total AS bytesTotal, error, created_at AS createdAt,
  updated_at AS updatedAt`;

export function errorCode(error: unknown): DownloadErrorCode {
  if (error instanceof StorageLimitError) return 'storageLimit';
  if (error instanceof IntegrityError) return 'integrity';
  if (error instanceof ProviderError) return error.kind;
  return 'unknown';
}

/** Downloads may run: online, and on Wi-Fi or Ethernet when Wi-Fi only is on. */
export function gateOpen(status: NetworkStatus, settings: DownloadSettings): boolean {
  return status.online && (!settings.wifiOnly || status.unmetered);
}

export interface EnqueueResult {
  added: number;
  /** Local tracks, providers that cannot download, and tracks already downloaded or queued. */
  skipped: number;
}

/**
 * Persisted download queue: every state lives in the downloads table, so a restart resumes
 * where it stopped. Runs at most two transfers, only while the network gate is open, keeps
 * paused (interrupted) downloads ahead of queued ones, and enforces the storage limit before a
 * transfer starts.
 */
export class DownloadManager {
  readonly #deps: DownloadManagerDeps;
  readonly #active = new Map<number, AbortController>();
  /** Why an active transfer was aborted by the manager. */
  readonly #stopping = new Map<number, 'interrupt' | 'cancel'>();
  readonly #runs = new Map<number, Promise<void>>();
  /** Downloads whose connection dropped: not resumed before this time. */
  readonly #holdUntil = new Map<number, number>();
  #pumpChain: Promise<void> = Promise.resolve();

  constructor(deps: DownloadManagerDeps) {
    this.#deps = deps;
  }

  /** After an app start: transfers that were running when the app stopped become paused. */
  async start(): Promise<void> {
    await this.#deps.db.run(
      `UPDATE downloads SET status = 'paused', updated_at = ? WHERE status = 'downloading'`,
      [this.#deps.now()],
    );
    this.#deps.onChange();
    await this.pump();
  }

  async list(): Promise<DownloadRow[]> {
    return this.#deps.db.getAll<DownloadRow>(
      `SELECT ${ROW_COLUMNS} FROM downloads ORDER BY created_at, track_id`,
    );
  }

  /** Bytes of completed downloads. */
  async storageUsed(): Promise<number> {
    const row = await this.#deps.db.getFirst<{ n: number }>(
      `SELECT COALESCE(SUM(bytes_done), 0) AS n FROM downloads WHERE status = 'completed'`,
    );
    return row?.n ?? 0;
  }

  async enqueue(trackIds: readonly number[]): Promise<EnqueueResult> {
    const { db, now, settings } = this.#deps;
    const tracks = await getTracks(db, trackIds);
    let added = 0;
    for (const track of tracks) {
      const provider = this.#deps.provider(track.provider);
      if (track.provider === LOCAL_PROVIDER || !provider?.download) continue;
      const existing = await this.#row(track.id);
      if (existing?.status === 'failed') {
        await this.#setStatus(existing, transition('failed', 'retry'), { error: null });
        added += 1;
        continue;
      }
      if (existing) continue;
      const time = now();
      await db.run(
        `INSERT INTO downloads (track_id, status, format, file_name, created_at, updated_at)
         VALUES (?, 'queued', ?, ?, ?, ?)`,
        [track.id, settings().format, downloadStem(track.provider, track.providerRef), time, time],
      );
      added += 1;
    }
    if (added > 0) this.#deps.onChange();
    await this.pump();
    return { added, skipped: tracks.length - added + (trackIds.length - tracks.length) };
  }

  async retry(trackId: number): Promise<void> {
    const row = await this.#row(trackId);
    if (row?.status !== 'failed') return;
    await this.#setStatus(row, transition('failed', 'retry'), { error: null });
    this.#deps.onChange();
    await this.pump();
  }

  /** Stops and forgets a download that has not completed, deleting its partial file. */
  async cancel(trackId: number): Promise<void> {
    const row = await this.#row(trackId);
    if (!row) return;
    if (row.status === 'completed') {
      await this.remove(trackId);
      return;
    }
    await this.#stop(trackId, 'cancel');
    this.#deletePartials(row.fileName);
    await this.#deps.db.run('DELETE FROM downloads WHERE track_id = ?', [trackId]);
    this.#deps.onChange();
    await this.pump();
  }

  /** Deletes a download: a completed file is removed and the track streams again. */
  async remove(trackId: number): Promise<void> {
    const row = await this.#row(trackId);
    if (!row) return;
    if (row.status !== 'completed') {
      await this.cancel(trackId);
      return;
    }
    const { db, files } = this.#deps;
    const [track] = await getTracks(db, [trackId]);
    if (track?.localPath?.startsWith(this.#deps.dir)) files.remove(track.localPath);
    await db.transaction(async (tx) => {
      await tx.run('UPDATE tracks SET local_path = NULL, file_size = NULL WHERE id = ?', [trackId]);
      await tx.run('DELETE FROM downloads WHERE track_id = ?', [trackId]);
    });
    this.#deps.onChange();
    this.#deps.onLibraryChange();
  }

  async removeAll(): Promise<void> {
    for (const row of await this.list()) await this.remove(row.trackId);
  }

  /** Connectivity changed: pause transfers the gate no longer allows, start the ones it does. */
  async onNetworkChange(status: NetworkStatus): Promise<void> {
    if (!gateOpen(status, this.#deps.settings())) {
      await Promise.all([...this.#active.keys()].map((id) => this.#stop(id, 'interrupt')));
      return;
    }
    this.#holdUntil.clear();
    await this.pump();
  }

  /** Starts downloads while the gate is open and fewer than two run. Serialised. */
  pump(): Promise<void> {
    const run = async () => {
      if (!gateOpen(await this.#deps.network(), this.#deps.settings())) return;
      const time = this.#deps.now();
      for (const [id, until] of this.#holdUntil) if (until <= time) this.#holdUntil.delete(id);
      while (this.#active.size < MAX_CONCURRENT_DOWNLOADS) {
        const busy = [...this.#active.keys(), ...this.#holdUntil.keys()];
        const skip =
          busy.length > 0 ? `AND track_id NOT IN (${busy.map(() => '?').join(',')})` : '';
        const next = await this.#deps.db.getFirst<DownloadRow>(
          `SELECT ${ROW_COLUMNS} FROM downloads
            WHERE status IN ('paused', 'queued') ${skip}
            ORDER BY status = 'paused' DESC, created_at, track_id
            LIMIT 1`,
          busy,
        );
        if (!next) return;
        const controller = new AbortController();
        this.#active.set(next.trackId, controller);
        let started = () => {};
        const transferStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        const running = this.#run(next, controller, started).finally(() => {
          started();
          this.#runs.delete(next.trackId);
        });
        this.#runs.set(next.trackId, running);
        // Pumping returns once each new transfer has reached its provider.
        await transferStarted;
      }
    };
    this.#pumpChain = this.#pumpChain.then(run, run);
    return this.#pumpChain;
  }

  async #run(row: DownloadRow, controller: AbortController, started: () => void): Promise<void> {
    const { db, now } = this.#deps;
    const id = row.trackId;
    const resuming = row.status === 'paused';
    let current: DownloadRow = {
      ...row,
      status: transition(row.status, resuming ? 'resume' : 'start'),
    };
    await this.#setStatus(row, current.status, { error: null });
    this.#deps.onChange();

    let bytesDone = row.bytesDone;
    let bytesTotal = row.bytesTotal;
    let lastWrite = Number.NEGATIVE_INFINITY;
    const onProgress = (done: number, total: number | null) => {
      bytesDone = done;
      bytesTotal = total;
      this.#deps.onProgress(id, done, total);
      const time = now();
      if (time - lastWrite < PROGRESS_WRITE_MS) return;
      lastWrite = time;
      void db.run('UPDATE downloads SET bytes_done = ?, bytes_total = ? WHERE track_id = ?', [
        done,
        total,
        id,
      ]);
    };

    try {
      const [track] = await getTracks(db, [id]);
      const provider = track ? this.#deps.provider(track.provider) : undefined;
      if (!track || !provider?.download) {
        await this.#finish(current, 'fail', { error: 'unavailable' });
        return;
      }
      const maxBytes = this.#deps.settings().limitBytes - (await this.#committedBytes(id));
      if (maxBytes <= 0) throw new StorageLimitError(1, Math.max(0, maxBytes));
      const transfer = provider.download(
        track.providerRef,
        `${this.#deps.dir}${row.fileName}`,
        (p) => onProgress(p.bytesDone, p.bytesTotal),
        { format: row.format, resume: bytesDone > 0, maxBytes, signal: controller.signal },
      );
      started();
      const file = await transfer;
      await db.transaction(async (tx) => {
        await tx.run('UPDATE tracks SET local_path = ?, file_size = ? WHERE id = ?', [
          file.uri,
          file.bytes,
          id,
        ]);
        await tx.run(
          `UPDATE downloads SET status = ?, format = ?, bytes_done = ?, bytes_total = ?,
                                error = NULL, updated_at = ?
            WHERE track_id = ?`,
          [transition(current.status, 'complete'), file.format, file.bytes, file.bytes, now(), id],
        );
      });
      current = { ...current, status: 'completed' };
      this.#deps.onLibraryChange();
    } catch (error) {
      const stop = this.#stopping.get(id);
      if (stop === 'cancel') return;
      // A dropped connection (no HTTP status) pauses the download; HTTP failures fail it.
      const connectionLost = error instanceof NetworkError && error.status === null;
      if (stop === 'interrupt' || isAbortError(error) || connectionLost) {
        await this.#finish(current, 'interrupt', { bytesDone, bytesTotal });
        if (connectionLost && stop === undefined) this.#hold(id);
      } else {
        if (error instanceof StorageLimitError || error instanceof IntegrityError) {
          this.#deletePartials(row.fileName);
          bytesDone = 0;
        }
        await this.#finish(current, 'fail', { error: errorCode(error), bytesDone, bytesTotal });
      }
    } finally {
      this.#active.delete(id);
      this.#stopping.delete(id);
      this.#deps.onChange();
      void this.pump();
    }
  }

  #hold(trackId: number) {
    this.#holdUntil.set(trackId, this.#deps.now() + RECONNECT_HOLD_MS);
    const schedule = this.#deps.schedule ?? ((run, ms) => setTimeout(run, ms));
    schedule(() => void this.pump(), RECONNECT_HOLD_MS);
  }

  async #finish(
    row: DownloadRow,
    event: 'interrupt' | 'fail',
    fields: { error?: DownloadErrorCode; bytesDone?: number; bytesTotal?: number | null },
  ): Promise<void> {
    await this.#deps.db.run(
      `UPDATE downloads SET status = ?, error = ?, bytes_done = ?, bytes_total = ?, updated_at = ?
        WHERE track_id = ?`,
      [
        transition(row.status, event),
        fields.error ?? null,
        fields.bytesDone ?? row.bytesDone,
        fields.bytesTotal === undefined ? row.bytesTotal : fields.bytesTotal,
        this.#deps.now(),
        row.trackId,
      ],
    );
  }

  async #stop(trackId: number, reason: 'interrupt' | 'cancel'): Promise<void> {
    const controller = this.#active.get(trackId);
    if (!controller) return;
    this.#stopping.set(trackId, reason);
    controller.abort();
    await this.#runs.get(trackId);
  }

  /** Bytes the limit already accounts for, apart from `trackId`: completed files plus the
   * expected size of every other running or paused download. */
  async #committedBytes(trackId: number): Promise<number> {
    const row = await this.#deps.db.getFirst<{ n: number }>(
      `SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN bytes_done
                                ELSE COALESCE(bytes_total, bytes_done) END), 0) AS n
         FROM downloads
        WHERE track_id <> ? AND status IN ('completed', 'downloading', 'paused')`,
      [trackId],
    );
    return row?.n ?? 0;
  }

  #deletePartials(fileName: string) {
    for (const ext of EXTENSIONS) this.#deps.files.remove(`${this.#deps.dir}${fileName}.${ext}`);
  }

  async #row(trackId: number): Promise<DownloadRow | null> {
    return this.#deps.db.getFirst<DownloadRow>(
      `SELECT ${ROW_COLUMNS} FROM downloads WHERE track_id = ?`,
      [trackId],
    );
  }

  async #setStatus(
    row: DownloadRow,
    status: DownloadStatus,
    fields: { error: DownloadErrorCode | null },
  ): Promise<void> {
    await this.#deps.db.run(
      'UPDATE downloads SET status = ?, error = ?, updated_at = ? WHERE track_id = ?',
      [status, fields.error, this.#deps.now(), row.trackId],
    );
  }
}
