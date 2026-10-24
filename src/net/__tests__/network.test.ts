import { toNetworkStatus } from '../network';

jest.mock('expo-network', () => ({
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    CELLULAR: 'CELLULAR',
    WIFI: 'WIFI',
    ETHERNET: 'ETHERNET',
    VPN: 'VPN',
  },
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
}));

describe('toNetworkStatus', () => {
  it('maps Wi-Fi, mobile data and no connection', () => {
    expect(
      toNetworkStatus({ type: 'WIFI' as never, isConnected: true, isInternetReachable: true }),
    ).toEqual({
      online: true,
      unmetered: true,
    });
    expect(
      toNetworkStatus({ type: 'CELLULAR' as never, isConnected: true, isInternetReachable: true }),
    ).toEqual({
      online: true,
      unmetered: false,
    });
    expect(
      toNetworkStatus({ type: 'NONE' as never, isConnected: false, isInternetReachable: false }),
    ).toEqual({
      online: false,
      unmetered: false,
    });
  });

  it('treats unknown reachability as online and a known lack of internet as offline', () => {
    expect(toNetworkStatus({ type: 'WIFI' as never, isConnected: true })).toEqual({
      online: true,
      unmetered: true,
    });
    expect(
      toNetworkStatus({ type: 'WIFI' as never, isConnected: true, isInternetReachable: false }),
    ).toEqual({
      online: false,
      unmetered: false,
    });
  });
});
