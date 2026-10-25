import { router } from 'expo-router';

/** Album routes carry the album key as a search param: keys may contain slashes. */
export function openAlbum(key: string): void {
  router.push({ pathname: '/album', params: { key } });
}

/** A provider's album that is not in the library (an Internet Archive item). */
export function openRemoteAlbum(provider: string, ref: string): void {
  router.push({ pathname: '/album', params: { provider, ref } });
}

export function openDownloads(): void {
  router.push('/downloads');
}

export function openSources(): void {
  router.push('/sources');
}

export function openArtist(name: string): void {
  router.push({ pathname: '/artist', params: { name } });
}

/** Counts shown on the playlist screen right after an import. */
export interface ImportSummary {
  matched: number;
  unmatched: number;
  added: number;
  reimport: boolean;
}

export function openPlaylist(id: number, imported?: ImportSummary): void {
  router.push({
    pathname: '/playlist/[id]',
    params: imported
      ? {
          id: String(id),
          matched: String(imported.matched),
          unmatched: String(imported.unmatched),
          added: String(imported.added),
          reimport: imported.reimport ? '1' : '0',
        }
      : { id: String(id) },
  });
}

export function openAddToPlaylist(trackIds: readonly number[]): void {
  router.push({ pathname: '/add-to-playlist', params: { ids: trackIds.join(',') } });
}
