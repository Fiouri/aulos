/**
 * @jest-environment node
 */
import { mediaAudio } from '../../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { listAlbums, listSongs } from '../../library/queries';
import { scanLibrary } from '../../library/scan';
import {
  favoriteAlbums,
  favoriteArtists,
  favoriteTracks,
  isFavorite,
  setFavorite,
  trackFavoriteKey,
} from '../favorites';
import { recentlyPlayed, recordPlay, updatePlayDuration } from '../history';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

describe('favorites and history', () => {
  let db: NodeDb;
  let ids: number[];
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    await scanLibrary(db, {
      query: async () => [
        mediaAudio('1', { title: 'A', artist: 'X', album: 'One' }),
        mediaAudio('2', { title: 'B', artist: 'Y', album: 'Two' }),
      ],
    });
    ids = (await listSongs(db, 'title')).map((t) => t.id);
  });
  afterEach(() => db.close());

  it('toggles track favorites idempotently, newest first', async () => {
    await setFavorite(db, 'track', trackFavoriteKey(ids[0]!), true, 1);
    await setFavorite(db, 'track', trackFavoriteKey(ids[1]!), true, 2);
    await setFavorite(db, 'track', trackFavoriteKey(ids[1]!), true, 3);
    expect((await favoriteTracks(db)).map((t) => t.title)).toEqual(['B', 'A']);
    await setFavorite(db, 'track', trackFavoriteKey(ids[1]!), false);
    expect(await isFavorite(db, 'track', trackFavoriteKey(ids[1]!))).toBe(false);
    expect((await favoriteTracks(db)).map((t) => t.title)).toEqual(['A']);
  });

  it('keeps album and artist favorites and skips the ones no longer in the library', async () => {
    const one = (await listAlbums(db, 'name')).find((a) => a.name === 'One');
    await setFavorite(db, 'album', one?.key ?? '', true, 1);
    await setFavorite(db, 'album', '["local","404"]', true, 2);
    await setFavorite(db, 'artist', 'Y', true, 1);
    await setFavorite(db, 'artist', 'Nobody', true, 2);
    expect((await favoriteAlbums(db)).map((a) => a.name)).toEqual(['One']);
    expect((await favoriteArtists(db)).map((a) => a.name)).toEqual(['Y']);
  });

  it('lists recently played tracks once each, latest play first', async () => {
    const first = await recordPlay(db, ids[0]!, 100, 30_000);
    await recordPlay(db, ids[1]!, 200, 30_000);
    await recordPlay(db, ids[0]!, 300, 30_000);
    await updatePlayDuration(db, first, 180_000);
    await updatePlayDuration(db, first, 10);
    const recent = await recentlyPlayed(db);
    expect(recent.map((t) => [t.title, t.lastPlayedAt])).toEqual([
      ['A', 300],
      ['B', 200],
    ]);
    expect(await db.getFirst('SELECT ms_played FROM history WHERE id = ?', [first])).toEqual({
      ms_played: 180_000,
    });
  });
});
