/**
 * @jest-environment node
 */
import type { MediaStoreAudio } from '../../../modules/media-store';
import { queryAudio } from '../../../modules/media-store';
import { openNodeDb, type NodeDb } from '../../../test/node-db';
import { getKv } from '../../db/kv';
import { migrate } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { checkAudioPermission, requestAudioPermission } from '../../library/permission';
import { LAST_SCAN_KEY, useLibraryStore } from '../library';

jest.mock('../../../modules/media-store', () => ({ queryAudio: jest.fn() }));
jest.mock('../../library/permission', () => ({
  checkAudioPermission: jest.fn(),
  requestAudioPermission: jest.fn(),
}));

const mockQuery = jest.mocked(queryAudio);
const mockCheck = jest.mocked(checkAudioPermission);
const mockRequest = jest.mocked(requestAudioPermission);

const audio = (id: string): MediaStoreAudio => ({
  id,
  contentUri: `content://media/external/audio/media/${id}`,
  title: `Song ${id}`,
  artist: null,
  album: null,
  albumArtist: null,
  trackNo: null,
  discNo: null,
  durationMs: 1000,
  sizeBytes: 1,
  dateModified: 1,
  albumId: null,
  mimeType: 'audio/mpeg',
});

describe('library store', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    useLibraryStore.setState(useLibraryStore.getInitialState(), true);
    [mockQuery, mockCheck, mockRequest].forEach((m) => m.mockReset());
    mockQuery.mockResolvedValue([audio('1'), audio('2'), audio('3')]);
  });
  afterEach(() => db.close());

  it('asks for access on first start, scans and persists the result', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('granted');

    await useLibraryStore.getState().start(db);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const state = useLibraryStore.getState();
    expect(state).toMatchObject({ permission: 'granted', status: 'idle', totalTracks: 3 });
    expect(state.lastScan?.result).toMatchObject({ added: 3, removed: 0, total: 3 });
    expect(await getKv(db, LAST_SCAN_KEY)).toEqual(state.lastScan);
  });

  it('restores the count after a restart without rescanning', async () => {
    mockCheck.mockResolvedValue(true);
    await useLibraryStore.getState().start(db);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    useLibraryStore.setState(useLibraryStore.getInitialState(), true);
    await useLibraryStore.getState().start(db);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(useLibraryStore.getState()).toMatchObject({ totalTracks: 3, loaded: true });
    expect(useLibraryStore.getState().lastScan?.result.total).toBe(3);
  });

  it('does not scan when access is denied', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('denied');

    await useLibraryStore.getState().start(db);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(useLibraryStore.getState()).toMatchObject({ permission: 'denied', totalTracks: 0 });
  });

  it('does not prompt again once access is blocked', async () => {
    mockCheck.mockResolvedValue(false);
    useLibraryStore.setState({ permission: 'blocked' });

    await useLibraryStore.getState().start(db);

    expect(mockRequest).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().permission).toBe('blocked');
  });

  it('reports a failed scan and keeps the previous count', async () => {
    mockCheck.mockResolvedValue(true);
    await useLibraryStore.getState().start(db);
    mockQuery.mockRejectedValueOnce(new Error('MediaStore unavailable'));

    await useLibraryStore.getState().scan(db);

    expect(useLibraryStore.getState()).toMatchObject({
      status: 'error',
      error: 'MediaStore unavailable',
      totalTracks: 3,
    });
  });

  it('falls back to unknown when a grant was revoked', async () => {
    useLibraryStore.setState({ permission: 'granted' });
    mockCheck.mockResolvedValue(false);
    await useLibraryStore.getState().load(db);
    expect(useLibraryStore.getState().permission).toBe('unknown');
  });
});
