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
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  movePlaylistItem,
  playlistItems,
  PlaylistNameError,
  removeFromPlaylist,
  renamePlaylist,
} from '../playlists';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));

describe('playlists', () => {
  let db: NodeDb;
  let ids: number[];
  const titles = async (id: number) => (await playlistItems(db, id)).map((i) => i.track.title);

  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    await scanLibrary(db, {
      query: async () =>
        ['A', 'B', 'C', 'D'].map((t, i) => mediaAudio(String(i + 1), { title: t })),
    });
    ids = (await listSongs(db, 'title')).map((t) => t.id);
  });
  afterEach(() => db.close());

  it('creates, renames and deletes a playlist', async () => {
    const id = await createPlaylist(db, '  Road trip ', 100);
    expect(await getPlaylist(db, id)).toEqual({
      id,
      name: 'Road trip',
      trackCount: 0,
      createdAt: 100,
      updatedAt: 100,
    });
    await renamePlaylist(db, id, 'Night drive', 200);
    expect(await getPlaylist(db, id)).toMatchObject({ name: 'Night drive', updatedAt: 200 });
    await addToPlaylist(db, id, ids);
    await deletePlaylist(db, id);
    expect(await listPlaylists(db)).toEqual([]);
    expect(await db.getFirst('SELECT COUNT(*) AS n FROM playlist_items')).toEqual({ n: 0 });
  });

  it('rejects blank names', async () => {
    await expect(createPlaylist(db, '   ')).rejects.toThrow(PlaylistNameError);
    const id = await createPlaylist(db, 'Keep');
    await expect(renamePlaylist(db, id, '')).rejects.toThrow(PlaylistNameError);
  });

  it('appends tracks, duplicates allowed, and counts them', async () => {
    const id = await createPlaylist(db, 'Mix');
    await addToPlaylist(db, id, [ids[0]!, ids[1]!]);
    await addToPlaylist(db, id, [ids[0]!]);
    expect(await titles(id)).toEqual(['A', 'B', 'A']);
    expect((await listPlaylists(db))[0]?.trackCount).toBe(3);
  });

  it('removes items and closes the gaps', async () => {
    const id = await createPlaylist(db, 'Mix');
    await addToPlaylist(db, id, ids);
    await removeFromPlaylist(db, id, [0, 2]);
    expect(await titles(id)).toEqual(['B', 'D']);
    expect((await playlistItems(db, id)).map((i) => i.position)).toEqual([0, 1]);
  });

  it('reorders by moving one item', async () => {
    const id = await createPlaylist(db, 'Mix');
    await addToPlaylist(db, id, ids);
    await movePlaylistItem(db, id, 0, 3);
    expect(await titles(id)).toEqual(['B', 'C', 'D', 'A']);
    await movePlaylistItem(db, id, 3, 1);
    expect(await titles(id)).toEqual(['B', 'A', 'C', 'D']);
    await movePlaylistItem(db, id, 1, 9);
    expect(await titles(id)).toEqual(['B', 'A', 'C', 'D']);
  });

  it('drops items whose track left the library', async () => {
    const id = await createPlaylist(db, 'Mix');
    await addToPlaylist(db, id, ids);
    await scanLibrary(db, { query: async () => [mediaAudio('2', { title: 'B' })] });
    expect(await titles(id)).toEqual(['B']);
  });
});
