import type { Db } from '@/db/types';
import { expoFileOps, expoTransfer } from '@/downloads/transfer';
import { createHttpCache } from '@/net/cache';
import { appUserAgent, httpJson } from '@/net/client';

import { createArchiveApi } from './archive/api';
import { createArchiveProvider } from './archive/provider';
import { createLocalProvider } from './local';
import { ProviderRegistry } from './registry';

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
