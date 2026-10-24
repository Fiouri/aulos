import {
  addNetworkStateListener,
  getNetworkStateAsync,
  NetworkStateType,
  type NetworkState,
} from 'expo-network';

export interface NetworkStatus {
  /** A network is connected and not known to lack internet access. */
  online: boolean;
  /** The connection is not metered mobile data: Wi-Fi or Ethernet. */
  unmetered: boolean;
}

export const OFFLINE: NetworkStatus = { online: false, unmetered: false };

export function toNetworkStatus(state: NetworkState): NetworkStatus {
  const online = state.isConnected === true && state.isInternetReachable !== false;
  const unmetered =
    state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET;
  return { online, unmetered: online && unmetered };
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  try {
    return toNetworkStatus(await getNetworkStateAsync());
  } catch {
    return OFFLINE;
  }
}

/** Calls `listener` on every connectivity change; returns the unsubscribe function. */
export function onNetworkChange(listener: (status: NetworkStatus) => void): () => void {
  const subscription = addNetworkStateListener((state) => listener(toNetworkStatus(state)));
  return () => subscription.remove();
}
