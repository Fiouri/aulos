import { AppState } from 'react-native';
import { create } from 'zustand';

import { OFFLINE, type NetworkStatus } from '@/net/network';

interface NetworkState {
  status: NetworkStatus;
  /**
   * Reads the current state, then follows every change, and reads it again whenever the app
   * returns to the foreground. Calling it again re-subscribes.
   */
  start(
    read: () => Promise<NetworkStatus>,
    subscribe: (listener: (status: NetworkStatus) => void) => () => void,
  ): Promise<void>;
}

let unsubscribe: (() => void) | null = null;

/**
 * Connectivity for the whole app: search, the player's offline skip and the download gate.
 * Android can block a backgrounded app's network and report it offline; unblocking on return
 * to the foreground sends no network event, so the state is read again then.
 */
export const useNetworkStore = create<NetworkState>()((set, get) => {
  const update = (status: NetworkStatus) => {
    const current = get().status;
    if (current.online !== status.online || current.unmetered !== status.unmetered) {
      set({ status });
    }
  };

  return {
    status: OFFLINE,
    async start(read, subscribe) {
      unsubscribe?.();
      const stopNetwork = subscribe(update);
      const appState = AppState.addEventListener('change', (state) => {
        if (state === 'active') void read().then(update);
      });
      unsubscribe = () => {
        stopNetwork();
        appState.remove();
      };
      update(await read());
    },
  };
});
