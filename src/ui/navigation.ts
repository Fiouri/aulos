import { router } from 'expo-router';

/** Album routes carry name and artist as search params: names may contain slashes. */
export function openAlbum(name: string, artist: string | null): void {
  router.push({ pathname: '/album', params: artist === null ? { name } : { name, artist } });
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
