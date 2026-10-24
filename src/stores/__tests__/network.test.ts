import { AppState, type AppStateStatus } from 'react-native';

import type { NetworkStatus } from '../../net/network';
import { useNetworkStore } from '../network';

jest.mock('expo-network', () => ({ NetworkStateType: {} }));

const WIFI: NetworkStatus = { online: true, unmetered: true };
const OFF: NetworkStatus = { online: false, unmetered: false };

describe('network store', () => {
  it('follows changes and reads the state again when the app becomes active', async () => {
    let onAppState: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onAppState = listener;
      return { remove: jest.fn() };
    });
    let emit: (status: NetworkStatus) => void = () => undefined;
    let current = WIFI;
    await useNetworkStore.getState().start(
      async () => current,
      (listener) => {
        emit = listener;
        return () => undefined;
      },
    );
    expect(useNetworkStore.getState().status).toEqual(WIFI);

    // Backgrounded: the system blocks the app's network and reports it offline.
    emit(OFF);
    expect(useNetworkStore.getState().status).toEqual(OFF);

    // Back in front, no network event arrives; the store reads the state itself.
    current = WIFI;
    onAppState?.('active');
    await Promise.resolve();
    await Promise.resolve();
    expect(useNetworkStore.getState().status).toEqual(WIFI);
  });

  it('keeps the same state object when nothing changed', async () => {
    let emit: (status: NetworkStatus) => void = () => undefined;
    await useNetworkStore.getState().start(
      async () => WIFI,
      (listener) => {
        emit = listener;
        return () => undefined;
      },
    );
    const before = useNetworkStore.getState().status;
    emit({ online: true, unmetered: true });
    expect(useNetworkStore.getState().status).toBe(before);
  });
});
