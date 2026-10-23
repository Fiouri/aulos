/**
 * @jest-environment node
 */
import { FakePlayer } from '../../../test/fakePlayer';
import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { recentlyPlayed } from '../../collections/history';
import { getKv } from '../../db/kv';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { listSongs, type Track } from '../../library/queries';
import { scanLibrary } from '../../library/scan';
import { parsePersistedQueue, QUEUE_KV_KEY } from '../../player/persistence';
import { currentEntry } from '../../player/queue';
import { currentTrack, usePlayerStore, type PlayerDeps } from '../player';

jest.mock('expo-audio', () => ({}));
jest.mock('../../../modules/media-store', () => ({
  queryAudio: jest.fn(),
  checkFiles: jest.fn(),
  loadArtwork: jest.fn(),
}));

const player = () => usePlayerStore.getState();
const title = () => currentTrack(player())?.title;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('player store', () => {
  let db: NodeDb;
  let tracks: Track[];
  let fake: FakePlayer;
  let clock: number;
  let toasts: string[];
  let missing: Set<string>;

  const deps = (): Partial<PlayerDeps> => ({
    backend: fake,
    checkFiles: async (uris) => uris.map((u) => !missing.has(u)),
    artworkFor: async () => null,
    toast: (m) => toasts.push(m),
    now: () => clock,
    random: () => 0,
  });

  /** Plays `seconds`, moving the clock with the status updates. */
  const listen = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.5) {
      clock += 500;
      fake.advance(0.5);
    }
  };

  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    await scanLibrary(db, {
      query: async () =>
        ['A', 'B', 'C', 'D', 'E'].map((t, i) =>
          mediaAudio(String(i + 1), { title: t, durationMs: 240_000 }),
        ),
    });
    tracks = await listSongs(db, 'title');
    fake = new FakePlayer();
    clock = 1_000_000;
    toasts = [];
    missing = new Set();
    usePlayerStore.setState(usePlayerStore.getInitialState(), true);
    await player().init(db, deps());
  });
  afterEach(() => db.close());

  it('plays a list from the tapped track and loads a window around it', async () => {
    await player().playTracks(tracks, 1);
    expect(title()).toBe('B');
    expect(fake.playing).toBe(true);
    expect(fake.nowPlaying?.title).toBe('B');
    expect(fake.window.keys).toHaveLength(5);
    expect(fake.currentKey()).toBe(currentEntry(player().queue)?.key);
  });

  it('follows the native player when a track ends by itself', async () => {
    await player().playTracks(tracks, 0);
    fake.autoAdvance();
    await flush();
    expect(title()).toBe('B');
    expect(fake.nowPlaying?.title).toBe('B');
  });

  it('saves the queue on pause and restores it paused after a restart', async () => {
    await player().playTracks(tracks, 2);
    listen(12);
    player().pause();
    await flush();
    const saved = parsePersistedQueue(await getKv(db, QUEUE_KV_KEY));
    expect(saved).toMatchObject({ index: 2, positionMs: 12_000 });

    fake = new FakePlayer();
    usePlayerStore.setState(usePlayerStore.getInitialState(), true);
    await player().init(db, deps());

    expect(title()).toBe('C');
    expect(player().positionSec).toBe(12);
    expect(fake.loads).toEqual([{ window: fake.window, positionSec: 12 }]);
    expect(fake.playing).toBe(false);
  });

  it('saves the position at most every 5 s while playing', async () => {
    await player().playTracks(tracks, 0);
    listen(12);
    await flush();
    const saved = parsePersistedQueue(await getKv(db, QUEUE_KV_KEY));
    expect(saved?.positionMs).toBe(10_500);
  });

  it('records one history entry per play after 30 s and fills in the listened time', async () => {
    await player().playTracks(tracks, 0);
    listen(29);
    await flush();
    expect(await recentlyPlayed(db)).toEqual([]);
    listen(16);
    fake.autoAdvance();
    await flush();
    const rows = await db.getAll<{ ms_played: number }>('SELECT ms_played FROM history');
    // The first status update starts the play, so its half second is not counted.
    expect(rows).toEqual([{ ms_played: 44_500 }]);
    expect((await recentlyPlayed(db)).map((t) => t.title)).toEqual(['A']);
  });

  it('skips a missing file with a toast and drops it from the queue', async () => {
    missing.add(tracks[1]?.localPath ?? '');
    await player().playTracks(tracks, 0);
    expect(toasts).toEqual(['Skipped “B”: the file is missing.']);
    expect(player().queue.entries.map((e) => e.trackId)).not.toContain(tracks[1]?.id);
    fake.autoAdvance();
    await flush();
    expect(title()).toBe('C');
  });

  it('skips an unplayable file reported by the player', async () => {
    await player().playTracks(tracks, 0);
    fake.emit({ error: 'Source error' });
    await flush();
    expect(toasts).toEqual(['Skipped “A”: it could not be played.']);
    expect(title()).toBe('B');
    expect(fake.loads).toHaveLength(1);
    expect(fake.playing).toBe(true);
  });

  it('stops at the end of the queue on the first track, paused', async () => {
    await player().playTracks(tracks.slice(0, 2), 1);
    fake.autoAdvance();
    await flush();
    expect(title()).toBe('A');
    expect(fake.playing).toBe(false);
    expect(player().playing).toBe(false);
  });

  it('restarts on previous after 3 s and goes back before that', async () => {
    await player().playTracks(tracks, 2);
    listen(5);
    await player().previous();
    expect(title()).toBe('C');
    expect(fake.position).toBe(0);
    await player().previous();
    expect(title()).toBe('B');
  });

  it('fades out at the sleep deadline, pauses and restores the volume', async () => {
    await player().playTracks(tracks, 0);
    await player().setSleep({ mode: 'deadline', deadline: clock + 10_000 });
    listen(10);
    expect(fake.volume).toBe(1);
    listen(2.5);
    expect(fake.volume).toBeLessThan(1);
    expect(fake.volume).toBeGreaterThan(0);
    listen(3);
    expect(fake.playing).toBe(false);
    expect(fake.volume).toBe(1);
    expect(player().sleep).toEqual({ mode: 'off' });
  });

  it('pauses at the end of the track for the end-of-track sleep timer', async () => {
    await player().playTracks(tracks, 0);
    await player().setSleep({ mode: 'endOfTrack' });
    expect(fake.window.keys.at(-1)).toBe(fake.currentKey());
    fake.autoAdvance();
    await flush();
    expect(fake.playing).toBe(false);
    expect(title()).toBe('B');
    expect(player().sleep).toEqual({ mode: 'off' });
  });

  it('keeps shuffle, repeat and queue edits in sync with the native window', async () => {
    await player().playTracks(tracks, 0);
    await player().toggleShuffle();
    expect(title()).toBe('A');
    expect(player().queue.original).not.toBeNull();
    await player().cycleRepeat();
    await player().cycleRepeat();
    expect(fake.loop).toBe('single');
    await player().move(0, 3);
    expect(title()).toBe('A');
    await player().removeAt(1);
    expect(fake.window.keys).toContain(fake.currentKey());
    expect(fake.currentKey()).toBe(currentEntry(player().queue)?.key);
  });
  it('shuffles a whole list with shuffle turned on and every track queued once', async () => {
    await player().shuffleTracks(tracks);
    expect(player().queue.original?.map((e) => e.trackId)).toEqual(tracks.map((t) => t.id));
    expect([...player().queue.entries.map((e) => e.trackId)].sort()).toEqual(
      tracks.map((t) => t.id).sort(),
    );
    expect(fake.playing).toBe(true);
  });
});
