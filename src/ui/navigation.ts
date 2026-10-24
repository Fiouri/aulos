import { router } from 'expo-router';

/** Album routes carry the album key as a search param: keys may contain slashes. */
export function openAlbum(key: string): void {
  router.push({ pathname: '/album', params: { key } });
}

export function openArtist(name: string): void {
  router.push({ pathname: '/artist', params: { name } });
}

export function openPlaylist(id: number): void {
  router.push({ pathname: '/playlist/[id]', params: { id: String(id) } });
}

export function openAddToPlaylist(trackIds: readonly number[]): void {
  router.push({ pathname: '/add-to-playlist', params: { ids: trackIds.join(',') } });
}
