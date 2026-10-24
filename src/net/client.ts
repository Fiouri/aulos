import Constants from 'expo-constants';

import { createHttpJson, sleep, type HttpJson } from './httpJson';

/** `Aulos/<version> (+<repository>)`, from the version and `extra.repositoryUrl` of app.config.ts. */
export function appUserAgent(): string {
  const config = Constants.expoConfig;
  const repository: unknown = config?.extra?.repositoryUrl;
  const version = config?.version ?? '0.0.0';
  return typeof repository === 'string' ? `Aulos/${version} (+${repository})` : `Aulos/${version}`;
}

/** The app's shared JSON client for providers. */
export const httpJson: HttpJson = createHttpJson({
  fetch: (input, init) => fetch(input, init),
  sleep,
  random: Math.random,
  now: Date.now,
  userAgent: appUserAgent(),
});
