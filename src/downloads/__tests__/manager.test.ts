/**
 * @jest-environment node
 */
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { getTracks, type Track } from '../../library/queries';
import {
  abortError,
  InvalidResponseError,
  NetworkError,
  NotFoundError,
  RateLimitError,
} from '../../net/errors';
import type { NetworkStatus } from '../../net/network';
import { storeTracks } from '../../providers/store';
import type {
  DownloadOptions,
  DownloadProgress,
  LocalFile,
  RemoteTrack,
  SourceProvider,
} from '../../providers/types';
import { IntegrityError, StorageLimitError } from '../errors';
import { canTransition, InvalidTransitionError, transition } from '../machine';
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  DownloadManager,
  RECONNECT_HOLD_MS,
  type DownloadSettings,
} from '../manager';
import { downloadStem, fnv1a64 } from '../names';
import type { FileOps } from '../transfer';

jest.mock('expo-file-system', () => ({}));

const DIR = 'file:///data/files/downloads/';
const WIFI: NetworkStatus = { online: true, unmetered: true };
const MOBILE: NetworkStatus = { online: true, unmetered: false };
const OFFLINE: NetworkStatus = { online: false, unmetered: false };

const remote = (n: number): RemoteTrack => ({
  provider: 'archive',
  providerRef: `item-${n}/track ${n}.mp3`,
  title: `Track ${n}`,
  artist: 'Artist',
  album: 'Item',
  albumArtist: 'Artist',
  trackNo: n,
  discNo: null,
  durationMs: 60_000,
  albumRef: `item-${n}`,
  licenseUrl: null,
  attribution: 'Artist',
});

interface Call {
  ref: string;
  dest: string;
  options: DownloadOptions;
  progress: (p: DownloadProgress) => void;
  resolve: (file: LocalFile) => void;
  reject: (error: Error) => void;
}

describe('download state machine', () => {
  it('allows queued → downloading → paused → downloading → completed', () => {
    let status = transition('queued', 'start');
    status = transition(status, 'interrupt');
    status = transition(status, 'resume');
    expect(transition(status, 'complete')).toBe('completed');
    expect(transition(transition('downloading', 'fail'), 'retry')).toBe('queued');
  });

  it('refuses transitions the machine does not have', () => {
    expect(() => transition('completed', 'start')).toThrow(InvalidTransitionError);
    expect(() => transition('queued', 'complete')).toThrow(InvalidTransitionError);
    expect(canTransition('paused', 'retry')).toBe(false);
  });
});

describe('download names', () => {
  it('derives a fixed 16-hex-digit stem from provider and ref', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    const stem = downloadStem('archive', 'item/../../etc/passwd Τραγούδι.mp3');
    expect(stem).toMatch(/^[0-9a-f]{16}$/);
    expect(downloadStem('archive', 'item/../../etc/passwd Τραγούδι.mp3')).toBe(stem);
    expect(downloadStem('archive', 'item/other.mp3')).not.toBe(stem);
  });
});

describe('DownloadManager', () => {
  let db: NodeDb;
  let calls: Call[];
  let network: NetworkStatus;
  let settings: DownloadSettings;
  let now: number;
  let removed: string[];
  let scheduled: (() => void)[];
  let tracks: Track[];
  let libraryChanges: number;

  const provider: SourceProvider = {
    id: 'archive',
    capabilities: ['download'],
    search: async () => ({ tracks: [], albums: [], artists: [], playlists: [] }),
    resolveStream: async () => ({ url: 'https://example.org/x.mp3', mime: 'audio/mpeg' }),
    download: (ref, dest, progress, options) =>
      new Promise<LocalFile>((resolve, reject) => {
        calls.push({ ref, dest, options, progress, resolve, reject });
        options.signal?.addEventListener('abort', () => reject(abortError()));
      }),
  };

  const files: FileOps = {
    size: () => null,
    remove: (uri) => {
      removed.push(uri);
    },
    md5: async () => '',
    ensureDir: () => undefined,
  };

  const createManager = () =>
    new DownloadManager({
      db,
      provider: (id) => (id === 'archive' ? provider : undefined),
      files,
      dir: DIR,
      network: async () => network,
      settings: () => settings,
      now: () => now,
      onChange: () => undefined,
      onProgress: () => undefined,
      onLibraryChange: () => {
        libraryChanges += 1;
      },
      schedule: (run) => {
        scheduled.push(run);
      },
    });

  const statuses = async () =>
    (
      await db.getAll<{ track_id: number; status: string }>(
        'SELECT track_id, status FROM downloads ORDER BY track_id',
      )
    ).map((r) => `${r.track_id}:${r.status}`);

  /** Lets pending promise chains (database writes, the next pump) run to completion. */
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };

  const complete = async (call: Call, bytes = 1000) => {
    call.resolve({
      uri: `${call.dest}.mp3`,
      bytes,
      format: 'mp3',
      verified: true,
    });
    await settle();
  };

  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    await db.run(
      `INSERT INTO tracks (provider, provider_ref, title, title_norm, local_path)
       VALUES ('local', '1', 'Local song', 'local song', 'content://media/1')`,
    );
    tracks = await storeTracks(db, [remote(1), remote(2), remote(3)], 1);
    calls = [];
    network = WIFI;
    settings = { ...DEFAULT_DOWNLOAD_SETTINGS };
    now = 1_000;
    removed = [];
    scheduled = [];
    libraryChanges = 0;
  });
  afterEach(() => db.close());

  const ids = () => tracks.map((t) => t.id);

  it('queues remote tracks only and runs two at a time', async () => {
    const manager = createManager();
    const result = await manager.enqueue([1, ...ids()]);
    expect(result).toEqual({ added: 3, skipped: 1 });
    expect(await statuses()).toEqual([
      `${ids()[0]}:downloading`,
      `${ids()[1]}:downloading`,
      `${ids()[2]}:queued`,
    ]);
    expect(calls.map((c) => c.dest)).toEqual([
      `${DIR}${downloadStem('archive', 'item-1/track 1.mp3')}`,
      `${DIR}${downloadStem('archive', 'item-2/track 2.mp3')}`,
    ]);
    expect(calls[0]?.options).toMatchObject({ format: 'mp3', resume: false });
  });

  it('completes: sets the local file, starts the next and refuses a second enqueue', async () => {
    const manager = createManager();
    await manager.enqueue(ids());
    const first = calls[0];
    if (!first) throw new Error('no call');
    await complete(first, 4321);
    const [track] = await getTracks(db, [ids()[0] ?? 0]);
    expect(track?.localPath).toBe(`${first.dest}.mp3`);
    expect(libraryChanges).toBe(1);
    expect(await statuses()).toEqual([
      `${ids()[0]}:completed`,
      `${ids()[1]}:downloading`,
      `${ids()[2]}:downloading`,
    ]);
    expect(await manager.storageUsed()).toBe(4321);
    expect(await manager.enqueue([ids()[0] ?? 0])).toEqual({ added: 0, skipped: 1 });
  });

  it('fails with a code, and retries back through the queue', async () => {
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    calls[0]?.reject(new NotFoundError());
    await settle();
    expect(await db.getAll('SELECT status, error FROM downloads')).toEqual([
      { status: 'failed', error: 'notFound' },
    ]);
    await manager.retry(ids()[0] ?? 0);
    expect(await statuses()).toEqual([`${ids()[0]}:downloading`]);
    expect(calls).toHaveLength(2);
  });

  it('deletes the file and fails on an MD5 mismatch', async () => {
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    calls[0]?.reject(new IntegrityError());
    await settle();
    expect(await db.getAll('SELECT status, error, bytes_done FROM downloads')).toEqual([
      { status: 'failed', error: 'integrity', bytes_done: 0 },
    ]);
    const stem = downloadStem('archive', 'item-1/track 1.mp3');
    expect(removed).toEqual([`${DIR}${stem}.mp3`, `${DIR}${stem}.flac`, `${DIR}${stem}.ogg`]);
  });

  it('waits for Wi-Fi when Wi-Fi only is on, and pauses on mobile data', async () => {
    network = MOBILE;
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    expect(calls).toHaveLength(0);
    expect(await statuses()).toEqual([`${ids()[0]}:queued`]);

    network = WIFI;
    await manager.onNetworkChange(WIFI);
    expect(calls).toHaveLength(1);
    calls[0]?.progress({ bytesDone: 500, bytesTotal: 1000 });

    network = MOBILE;
    await manager.onNetworkChange(MOBILE);
    expect(await db.getAll('SELECT status, bytes_done, bytes_total FROM downloads')).toEqual([
      { status: 'paused', bytes_done: 500, bytes_total: 1000 },
    ]);

    network = WIFI;
    await manager.onNetworkChange(WIFI);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.options.resume).toBe(true);
  });

  it('keeps downloads queued while offline and starts them when the network returns', async () => {
    network = OFFLINE;
    settings = { ...settings, wifiOnly: false };
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    expect(calls).toHaveLength(0);
    network = MOBILE;
    await manager.onNetworkChange(MOBILE);
    expect(calls).toHaveLength(1);
  });

  it('downloads on mobile data when Wi-Fi only is off', async () => {
    network = MOBILE;
    settings = { ...settings, wifiOnly: false };
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    expect(calls).toHaveLength(1);
  });

  it('resumes a download that was running when the app stopped', async () => {
    const before = createManager();
    await before.enqueue([ids()[0] ?? 0]);
    calls[0]?.progress({ bytesDone: 700, bytesTotal: 2000 });
    await settle();
    // The app is killed: the row stays 'downloading' and the old manager is gone.
    calls = [];

    const after = createManager();
    await after.start();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options.resume).toBe(true);
    expect(calls[0]?.dest).toBe(`${DIR}${downloadStem('archive', 'item-1/track 1.mp3')}`);
    const call = calls[0];
    if (!call) throw new Error('no call');
    await complete(call, 2000);
    expect(await statuses()).toEqual([`${ids()[0]}:completed`]);
  });

  it('passes what is left of the storage limit and fails a download that exceeds it', async () => {
    settings = { ...settings, limitBytes: 10_000 };
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    const first = calls[0];
    if (!first) throw new Error('no call');
    await complete(first, 9_000);

    await manager.enqueue([ids()[1] ?? 0]);
    expect(calls[1]?.options.maxBytes).toBe(1_000);
    calls[1]?.reject(new StorageLimitError(5_000, 1_000));
    await settle();
    expect(await db.getAll('SELECT status, error FROM downloads ORDER BY track_id')).toEqual([
      { status: 'completed', error: null },
      { status: 'failed', error: 'storageLimit' },
    ]);
  });

  it('fails before transferring when completed downloads already fill the limit', async () => {
    settings = { ...settings, limitBytes: 1_000 };
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    const first = calls[0];
    if (!first) throw new Error('no call');
    await complete(first, 1_000);
    await manager.enqueue([ids()[1] ?? 0]);
    await settle();
    expect(calls).toHaveLength(1);
    expect(await db.getAll('SELECT error FROM downloads WHERE status = ?', ['failed'])).toEqual([
      { error: 'storageLimit' },
    ]);
  });

  it('pauses on a dropped connection and tries again after the hold or a network change', async () => {
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    calls[0]?.progress({ bytesDone: 100, bytesTotal: 1000 });
    calls[0]?.reject(new NetworkError('Download interrupted'));
    await settle();
    expect(await statuses()).toEqual([`${ids()[0]}:paused`]);
    expect(calls).toHaveLength(1);

    now += RECONNECT_HOLD_MS;
    scheduled.forEach((run) => run());
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.options.resume).toBe(true);
  });

  it('fails after three transient failures in a row (5xx, 429, dropped connection)', async () => {
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    const failures = [
      new NetworkError('Service unavailable', 503),
      new RateLimitError(null),
      new NetworkError('Download interrupted'),
    ];
    for (const [n, error] of failures.entries()) {
      calls[n]?.reject(error);
      await settle();
      if (n < failures.length - 1) {
        expect(await statuses()).toEqual([`${ids()[0]}:paused`]);
        now += RECONNECT_HOLD_MS;
        scheduled.forEach((run) => run());
        await settle();
      }
    }
    expect(calls).toHaveLength(3);
    expect(await db.getAll('SELECT status, error FROM downloads')).toEqual([
      { status: 'failed', error: 'network' },
    ]);
  });

  it('fails at once on an HTTP error that will not go away', async () => {
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    calls[0]?.reject(new InvalidResponseError('Unexpected HTTP status', 403));
    await settle();
    expect(await db.getAll('SELECT status, error FROM downloads')).toEqual([
      { status: 'failed', error: 'invalidResponse' },
    ]);
  });

  it('cancels a running download and deletes its partial file', async () => {
    const manager = createManager();
    await manager.enqueue(ids());
    await manager.cancel(ids()[0] ?? 0);
    expect(await statuses()).toEqual([`${ids()[1]}:downloading`, `${ids()[2]}:downloading`]);
    expect(removed).toHaveLength(3);
    expect(removed[0]).toContain(downloadStem('archive', 'item-1/track 1.mp3'));
  });

  it('removes completed downloads: the file goes and the track streams again', async () => {
    const manager = createManager();
    await manager.enqueue([ids()[0] ?? 0]);
    const first = calls[0];
    if (!first) throw new Error('no call');
    await complete(first);
    await manager.enqueue([ids()[1] ?? 0]);

    await manager.removeAll();
    expect(await statuses()).toEqual([]);
    expect(removed).toContain(`${first.dest}.mp3`);
    const [track] = await getTracks(db, [ids()[0] ?? 0]);
    expect(track?.localPath).toBeNull();
  });
});
