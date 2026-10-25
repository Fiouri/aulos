/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { addToPlaylist, playlistItems } from '../../collections/playlists';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { scanLibrary } from '../../library/scan';
import {
  importNuclearPlaylist,
  parseNuclearPlaylist,
  rematchUnavailable,
  UNAVAILABLE_PROVIDER,
  type NuclearPlaylist,
} from '../playlistImport';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../../../test/fixtures/nuclear', name), 'utf8'));

const parsed = (name: string): NuclearPlaylist => {
  const playlist = parseNuclearPlaylist(fixture(name));
  if (!playlist) throw new Error(`fixture ${name} did not parse`);
  return playlist;
};

/** The standard test media (scripts/test-media.ps1), as the phone library sees it. */
const LIBRARY = [
  mediaAudio('1', {
    title: 'Τα Παιδιά του Πειραιά',
    artist: 'Μάνος Χατζιδάκις',
    album: 'Ο Μεγάλος Ερωτικός',
    durationMs: 2050,
  }),
  mediaAudio('2', {
    title: 'Χάρτινο το Φεγγαράκι',
    artist: 'Μάνος Χατζιδάκις',
    album: 'Ο Μεγάλος Ερωτικός',
    durationMs: 3050,
  }),
  mediaAudio('3', { title: 'Café del Mar', artist: 'Mötley Beyoncé', durationMs: 3050 }),
  mediaAudio('4', { title: 'Señorita', artist: 'Mötley Beyoncé', durationMs: 4050 }),
  mediaAudio('5', { title: 'Über Alles', artist: 'Mötley Beyoncé', durationMs: 5050 }),
  mediaAudio('6', { title: 'Gapless part 2', artist: 'Aulos Test', durationMs: 3000 }),
];

const rows = async (db: NodeDb, playlistId: number) =>
  (await playlistItems(db, playlistId)).map(({ track }) =>
    track.provider === UNAVAILABLE_PROVIDER ? `unavailable:${track.title}` : track.title,
  );

describe('Nuclear playlist files', () => {
  it('parses the export format with primary artists and source refs', () => {
    const playlist = parsed('nuclear-mix.nuclear-playlist.json');
    expect(playlist.nuclearId).toBe('8c0f2a64-5d1e-4c7b-9a43-aulos-fixture');
    expect(playlist.name).toBe('Nuclear Mix');
    expect(playlist.items[0]).toEqual({
      title: 'Τα Παιδιά του Πειραιά',
      artist: 'Μάνος Χατζιδάκις',
      album: 'Ο Μεγάλος Ερωτικός',
      durationMs: 2000,
      ref: 'youtube:yt-peiraia',
    });
  });

  it('parses the legacy format: seconds or m:ss durations, uuid or derived refs', () => {
    const playlist = parsed('old-nuclear.legacy-playlist.json');
    expect(playlist.nuclearId).toBe('legacy:Old Nuclear');
    expect(playlist.items).toEqual([
      {
        title: 'Χάρτινο το Φεγγαράκι',
        artist: 'Μάνος Χατζιδάκις',
        album: 'Ο Μεγάλος Ερωτικός',
        durationMs: 3000,
        ref: 'nuclear-legacy:5b0f7d2e-legacy-1',
      },
      {
        title: 'Gone Track',
        artist: 'Lost Artist',
        album: null,
        durationMs: 200_000,
        ref: 'nuclear-legacy:lost artist gone track',
      },
    ]);
  });

  it('rejects files that are not Nuclear playlists', () => {
    expect(parseNuclearPlaylist({ format: 'aulos.playlist', version: 1, tracks: [] })).toBeNull();
    expect(parseNuclearPlaylist({ version: 1, playlist: { name: 'x' } })).toBeNull();
    expect(parseNuclearPlaylist([])).toBeNull();
  });
});

describe('importNuclearPlaylist', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    await scanLibrary(db, { query: async () => LIBRARY });
  });
  afterEach(() => db.close());

  it('keeps every item in order: matched tracks, duplicates and unavailable rows', async () => {
    const result = await importNuclearPlaylist(
      db,
      parsed('nuclear-mix.nuclear-playlist.json'),
      'x',
      1,
    );
    expect(result).toMatchObject({
      name: 'Nuclear Mix',
      matched: 4,
      unmatched: 2,
      added: 6,
      reimport: false,
    });
    expect(await rows(db, result.playlistId)).toEqual([
      'Τα Παιδιά του Πειραιά',
      'Café del Mar',
      'Gapless part 2',
      'unavailable:Unknown Song',
      'Τα Παιδιά του Πειραιά',
      // Same title and artist, but 60 s against 4 s: a different recording.
      'unavailable:Señorita',
    ]);
    const unavailable = await db.getAll(
      'SELECT provider_ref, local_path FROM tracks WHERE provider = ? ORDER BY provider_ref',
      [UNAVAILABLE_PROVIDER],
    );
    expect(unavailable).toEqual([
      { provider_ref: 'youtube:yt-senorita-live', local_path: null },
      { provider_ref: 'youtube:yt-unknown', local_path: null },
    ]);
  });

  it('imports a legacy playlist', async () => {
    const result = await importNuclearPlaylist(
      db,
      parsed('old-nuclear.legacy-playlist.json'),
      'x',
      1,
    );
    expect(result).toMatchObject({ matched: 1, unmatched: 1 });
    expect(await rows(db, result.playlistId)).toEqual([
      'Χάρτινο το Φεγγαράκι',
      'unavailable:Gone Track',
    ]);
  });

  it('re-imports additively: appends new items, keeps phone-only rows, removes nothing', async () => {
    const first = await importNuclearPlaylist(
      db,
      parsed('nuclear-mix.nuclear-playlist.json'),
      'x',
      1,
    );
    // The user adds a phone-only track to the imported playlist.
    const phoneOnly = await db.getFirst<{ id: number }>(
      "SELECT id FROM tracks WHERE title = 'Χάρτινο το Φεγγαράκι'",
    );
    await addToPlaylist(db, first.playlistId, [phoneOnly?.id ?? 0], 2);

    const again = await importNuclearPlaylist(
      db,
      parsed('nuclear-mix-updated.nuclear-playlist.json'),
      'x',
      3,
    );
    expect(again).toMatchObject({
      playlistId: first.playlistId,
      matched: 5,
      unmatched: 3,
      added: 2,
      reimport: true,
    });
    expect(await rows(db, first.playlistId)).toEqual([
      'Τα Παιδιά του Πειραιά',
      'Café del Mar',
      'Gapless part 2',
      'unavailable:Unknown Song',
      'Τα Παιδιά του Πειραιά',
      'unavailable:Señorita',
      'Χάρτινο το Φεγγαράκι',
      'Über Alles',
      'unavailable:Another Missing',
    ]);
    expect(
      await db.getFirst('SELECT COUNT(*) AS n FROM playlists WHERE nuclear_id IS NOT NULL'),
    ).toEqual({ n: 1 });

    // The same file once more changes nothing.
    const third = await importNuclearPlaylist(
      db,
      parsed('nuclear-mix-updated.nuclear-playlist.json'),
      'x',
      4,
    );
    expect(third.added).toBe(0);
    expect(await rows(db, first.playlistId)).toHaveLength(9);
  });

  it('upgrades unavailable rows once the track reaches the phone (rescan or re-import)', async () => {
    const first = await importNuclearPlaylist(
      db,
      parsed('nuclear-mix.nuclear-playlist.json'),
      'x',
      1,
    );
    await scanLibrary(db, {
      query: async () => [
        ...LIBRARY,
        mediaAudio('7', { title: 'Unknown Song', artist: 'Nobody', durationMs: 240_000 }),
      ],
    });
    expect(await rematchUnavailable(db)).toBe(1);
    expect(await rows(db, first.playlistId)).toEqual([
      'Τα Παιδιά του Πειραιά',
      'Café del Mar',
      'Gapless part 2',
      'Unknown Song',
      'Τα Παιδιά του Πειραιά',
      'unavailable:Señorita',
    ]);
    // The upgraded unavailable track is no longer referenced and is gone.
    expect(
      await db.getAll('SELECT provider_ref FROM tracks WHERE provider = ?', [UNAVAILABLE_PROVIDER]),
    ).toEqual([{ provider_ref: 'youtube:yt-senorita-live' }]);
  });
});
