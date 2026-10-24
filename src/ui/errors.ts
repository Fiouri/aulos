import type { TFunction } from 'i18next';

import type { DownloadErrorCode } from '@/downloads/manager';
import { ProviderError } from '@/net/errors';

/** English message for a failed provider request (search, album). */
export function providerErrorMessage(t: TFunction, error: unknown): string {
  if (!(error instanceof ProviderError)) return t('errors.unknown');
  switch (error.kind) {
    case 'network':
      return t('errors.network');
    case 'rateLimit':
      return t('errors.rateLimit');
    case 'notFound':
      return t('errors.notFound');
    case 'invalidResponse':
      return t('errors.invalidResponse');
  }
}

/** Short reason shown on a failed download. */
export function downloadErrorMessage(t: TFunction, code: DownloadErrorCode | null): string {
  return t(`downloads.errors.${code ?? 'unknown'}`);
}

/** Display name of a provider; an id without a translation is shown as is. */
export function providerName(t: TFunction, id: string): string {
  switch (id) {
    case 'local':
      return t('providers.local');
    case 'archive':
      return t('providers.archive');
    default:
      return id;
  }
}
