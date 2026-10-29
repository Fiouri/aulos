import Constants from 'expo-constants';

import { createHttpJson, sleep, type HttpJson } from './httpJson';

/** The source repository, `extra.repositoryUrl` of app.config.ts. */
export function repositoryUrl(): string | null {
  const repository: unknown = Constants.expoConfig?.extra?.repositoryUrl;
  return typeof repository === 'string' ? repository : null;
}

/** `Aulos/<version> (+<repository>)`, from the version and `extra.repositoryUrl` of app.config.ts. */
export function appUserAgent(): string {
  const repository = repositoryUrl();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  return repository ? `Aulos/${version} (+${repository})` : `Aulos/${version}`;
}

/** The app's shared JSON client for providers. */
export const httpJson: HttpJson = createHttpJson({
  fetch: (input, init) => fetch(input, init),
  sleep,
  random: Math.random,
  now: Date.now,
  userAgent: appUserAgent(),
});
