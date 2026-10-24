import { Directory, Paths } from 'expo-file-system';

import type { Db } from '@/db/types';
import { expoFileOps, expoTransfer } from '@/downloads/transfer';
import { createHttpCache } from '@/net/cache';
import { appUserAgent, httpJson } from '@/net/client';

import { createArchiveApi } from './archive/api';
import { createArchiveProvider } from './archive/provider';
import { createLocalProvider } from './local';
import { ProviderRegistry } from './registry';
import type { SourceProvider } from './types';
import type { Track } from '@/library/queries';

let registry: ProviderRegistry | null = null;

/** Registers this build's providers (local, Internet Archive) once the database is open. */
export function initProviders(db: Db): ProviderRegistry {
  if (registry) return registry;
  const next = new ProviderRegistry();
  next.register(createLocalProvider(db));
  next.register(
    createArchiveProvider({
      api: createArchiveApi(httpJson, createHttpCache(db)),
      transfer: expoTransfer,
      files: expoFileOps,
      userAgent: appUserAgent(),
    }),
  );
  registry = next;
  return next;
}

export function providers(): ProviderRegistry {
  if (!registry) throw new Error('Providers used before initProviders()');
  return registry;
}

/** The provider with this id when it is registered and switched on. */
export function enabledProvider(id: string): SourceProvider | undefined {
  const registry = providers();
  return registry.isEnabled(id) ? registry.get(id) : undefined;
}

/** Stream URL of a stored track, through its provider (the player calls this at play time). */
export async function resolveTrackStream(track: Track): Promise<string> {
  const provider = enabledProvider(track.provider);
  if (!provider) throw new Error('Provider not available');
  return (await provider.resolveStream(track.providerRef)).url;
}

/** App-private directory for downloads (documents, so the system never evicts it). */
export function downloadsDir(): string {
  const uri = new Directory(Paths.document, 'downloads').uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
}
