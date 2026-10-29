import '@/i18n';

import { act, render, screen, userEvent } from '@testing-library/react-native';
import { reloadAppAsync } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { Text } from 'react-native';

import { ErrorBoundary } from '../ErrorBoundary';

jest.mock('expo', () => ({ reloadAppAsync: jest.fn(async () => undefined) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0-rc.1' } }));

function Broken(): never {
  throw new TypeError('Cannot read property "title" of undefined');
}

describe('<ErrorBoundary />', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders its children while nothing fails', async () => {
    await render(
      <ErrorBoundary>
        <Text>Library</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Library')).toBeOnTheScreen();
  });

  it('shows the error screen, copies the details and restarts', async () => {
    const user = userEvent.setup();
    await render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();

    await user.press(screen.getByTestId('crash-copy'));
    const details = jest.mocked(Clipboard.setStringAsync).mock.calls[0]?.[0] ?? '';
    expect(details).toContain('App version: 1.0.0-rc.1');
    expect(details).toContain('TypeError: Cannot read property "title" of undefined');
    expect(details).toContain('Component stack:');
    expect(screen.getByText('Copied')).toBeOnTheScreen();

    await user.press(screen.getByTestId('crash-restart'));
    expect(reloadAppAsync).toHaveBeenCalled();
  });

  it('turns fatal global errors into the error screen and passes others on', async () => {
    const previous = jest.fn();
    ErrorUtils.setGlobalHandler(previous);
    const view = await render(
      <ErrorBoundary>
        <Text>Library</Text>
      </ErrorBoundary>,
    );
    const handler = ErrorUtils.getGlobalHandler();

    await act(() => handler(new Error('minor'), false));
    expect(previous).toHaveBeenCalledWith(new Error('minor'), false);
    expect(screen.getByText('Library')).toBeOnTheScreen();

    await act(() => handler(new Error('fatal'), true));
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();

    await view.unmount();
    expect(ErrorUtils.getGlobalHandler()).toBe(previous);
  });
});
