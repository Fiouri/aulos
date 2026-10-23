/**
 * @jest-environment node
 */
import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { listSongs } from '../../library/queries';
import { scanLibrary } from '../../library/scan';
import {
  buildPlaylistFile,
  importPlaylistFile,
  matchTracks,
  parsePlaylistFile,
  PlaylistFileError,
  type MatchCandidate,
  type PlaylistFileTrack,
} from '../playlistFile';
import { playlistItems } from '../playlists';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

const entry = (overrides: Partial<PlaylistFileTrack> = {}): PlaylistFileTrack => ({
  provider: 'local',
  provider_ref: '1',
  title: 'Αγάπη',
  artist: 'Μάνος Χατζιδάκις',
  album: null,
  duration_ms: 200_000,
  ...overrides,
});

const candidate = (overrides: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id: 10,
  provider: 'local',
  providerRef: '1',
  titleNorm: 'αγαπη',
  artistNorm: 'μανοσ χατζιδακισ',
  durationMs: 200_000,
  ...overrides,
});

describe('matchTracks', () => {
  it('matches by provider and provider_ref first', () => {
    expect(matchTracks([entry()], [candidate()])).toEqual({ trackIds: [10], unmatched: [] });
  });

  it('ignores a ref hit whose title differs (a MediaStore id from another phone)', () => {
    const result = matchTracks([entry()], [candidate({ titleNorm: 'κατι αλλο' })]);
    expect(result.trackIds).toEqual([]);
  });

  it('falls back to normalised title + artist with the duration within ±2 s', () => {
    const library = [
      candidate({ id: 1, providerRef: '900', durationMs: 202_500 }),
      candidate({ id: 2, providerRef: '901', durationMs: 201_900 }),
      candidate({ id: 3, providerRef: '902', durationMs: 198_500 }),
    ];
    const result = matchTracks([entry({ provider_ref: 'x', title: 'ΑΓΑΠΗ' })], library);
    expect(result.trackIds).toEqual([3]);
  });

  it('accepts a title + artist match when either duration is unknown', () => {
    const result = matchTracks(
      [entry({ provider: 'archive', provider_ref: 'x', duration_ms: null })],
      [candidate({ id: 4, providerRef: '7' })],
    );
    expect(result.trackIds).toEqual([4]);
  });

  it('reports tracks it cannot place, keeping file order for the matches', () => {
    const missing = entry({ provider_ref: 'm', title: 'Missing' });
    const far = entry({ provider_ref: 'f', duration_ms: 300_000 });
    const result = matchTracks(
      [entry({ provider_ref: 'b', title: 'B', artist: null }), missing, far, entry()],
      [candidate(), candidate({ id: 20, providerRef: 'b', titleNorm: 'b', artistNorm: null })],
    );
    expect(result).toEqual({ trackIds: [20, 10], unmatched: [missing, far] });
  });
});

describe('playlist files', () => {
  it('rejects files that are not Aulos playlists', () => {
    expect(() => parsePlaylistFile({ hello: 1 })).toThrow(PlaylistFileError);
    expect(() => parsePlaylistFile(null)).toThrow(PlaylistFileError);
    expect(() =>
      parsePlaylistFile({ format: 'aulos.playlist', version: 2, name: 'x', tracks: [] }),
    ).toThrow(/version/);
    expect(() =>
      parsePlaylistFile({ format: 'aulos.playlist', version: 1, name: 'x', tracks: [{}] }),
    ).toThrow(/Track 1/);
  });

  describe('round trip', () => {
    let db: NodeDb;
    beforeEach(async () => {
      db = openNodeDb();
      await migrate(db, MIGRATIONS);
      await scanLibrary(db, {
        query: async () => [
          mediaAudio('1', { title: 'Αγάπη', artist: 'Μάνος Χατζιδάκις', durationMs: 200_000 }),
          mediaAudio('2', { title: 'Halo', artist: 'Beyoncé', durationMs: 261_000 }),
        ],
      });
    });
    afterEach(() => db.close());

    it('exports the versioned format and re-imports it with counts', async () => {
      const tracks = await listSongs(db, 'title');
      const file = buildPlaylistFile('Mix', tracks, Date.UTC(2026, 9, 24));
      expect(file).toMatchObject({
        format: 'aulos.playlist',
        version: 1,
        name: 'Mix',
        exportedAt: '2026-10-24T00:00:00.000Z',
      });
      expect(file.tracks[0]).toEqual({
        provider: 'local',
        provider_ref: '2',
        title: 'Halo',
        artist: 'Beyoncé',
        album: 'Album',
        duration_ms: 261_000,
      });

      const json: unknown = JSON.parse(JSON.stringify(file));
      const parsed = parsePlaylistFile(json);
      parsed.tracks.push(entry({ provider_ref: 'zz', title: 'Unknown song' }));
      const result = await importPlaylistFile(db, parsed, 'Imported');
      expect(result).toMatchObject({ matched: 2, unmatched: 1 });
      expect((await playlistItems(db, result.playlistId)).map((i) => i.track.title)).toEqual([
        'Halo',
        'Αγάπη',
      ]);
    });
  });
});
