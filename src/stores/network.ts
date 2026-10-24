import { create } from 'zustand';

import { OFFLINE, type NetworkStatus } from '@/net/network';

interface NetworkState {
  status: NetworkStatus;
  /** Reads the current state, then follows every change. Calling it again re-subscribes. */
  start(
    read: () => Promise<NetworkStatus>,
    subscribe: (listener: (status: NetworkStatus) => void) => () => void,
  ): Promise<void>;
}

let unsubscribe: (() => void) | null = null;

/** Connectivity for the whole app: search, the player's offline skip and the download gate. */
export const useNetworkStore = create<NetworkState>()((set) => ({
  status: OFFLINE,
  async start(read, subscribe) {
    unsubscribe?.();
    unsubscribe = subscribe((status) => set({ status }));
    set({ status: await read() });
  },
}));
