import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LibraryScreen from '../../app/index';
import { queryAudio } from '../../modules/media-store';
import { mediaAudio } from '../../test/fixtures';
import { openNodeDb, type NodeDb } from '../../test/node-db';
import { DbProvider } from '../db/DbProvider';
import { migrate } from '../db/migrate';
import { MIGRATIONS } from '../db/migrations';
import { checkAudioPermission, requestAudioPermission } from '../library/permission';
import { useLibraryStore } from '../stores/library';

jest.mock('../../modules/media-store', () => ({ queryAudio: jest.fn() }));
jest.mock('../library/permission', () => ({
  checkAudioPermission: jest.fn(),
  requestAudioPermission: jest.fn(),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const mockQuery = jest.mocked(queryAudio);
const mockCheck = jest.mocked(checkAudioPermission);
const mockRequest = jest.mocked(requestAudioPermission);

const audio = (id: string) =>
  mediaAudio(id, { artist: null, album: null, trackNo: null, durationMs: 1000 });

describe('<LibraryScreen />', () => {
  let db: NodeDb;
  beforeEach(async () => {
    db = openNodeDb();
    await migrate(db, MIGRATIONS);
    useLibraryStore.setState(useLibraryStore.getInitialState(), true);
    [mockQuery, mockCheck, mockRequest].forEach((m) => m.mockReset());
  });
  afterEach(() => db.close());

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <DbProvider db={db}>
          <LibraryScreen />
        </DbProvider>
      </SafeAreaProvider>,
    );

  it('scans on first start and shows the track count', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('granted');
    mockQuery.mockResolvedValue([audio('1'), audio('2')]);

    await renderScreen();

    expect(await screen.findByText('2 added · 0 updated · 0 removed')).toBeOnTheScreen();
    expect(screen.getByTestId('track-count')).toHaveTextContent('2');
    expect(screen.getByText('tracks')).toBeOnTheScreen();
  });

  it('shows the denied state and rescans after access is granted', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValueOnce('denied').mockResolvedValue('granted');
    mockQuery.mockResolvedValue([audio('1')]);

    await renderScreen();
    expect(await screen.findByTestId('permission-denied')).toBeOnTheScreen();
    expect(mockQuery).not.toHaveBeenCalled();

    await userEvent.setup().press(screen.getByTestId('scan-button'));

    expect(await screen.findByText('1 added · 0 updated · 0 removed')).toBeOnTheScreen();
    expect(screen.getByTestId('track-count')).toHaveTextContent('1');
    expect(screen.getByText('track')).toBeOnTheScreen();
  });

  it('shows the empty state when the device has no music', async () => {
    mockCheck.mockResolvedValue(true);
    mockQuery.mockResolvedValue([]);

    await renderScreen();

    expect(await screen.findByTestId('library-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('track-count')).toHaveTextContent('0');
  });

  it('offers the system settings when access is blocked', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('blocked');

    await renderScreen();

    expect(await screen.findByTestId('permission-blocked')).toBeOnTheScreen();
    expect(screen.queryByTestId('scan-button')).toBeNull();
  });
});
