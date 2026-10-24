import type { Playlist } from '@/collections/playlists';
import type { Album, Artist, Track } from '@/library/queries';

/** What a provider can do; the UI offers only the actions a provider declares. */
export type Capability = 'search' | 'stream' | 'download' | 'albums' | 'artists';

export type SearchType = 'tracks' | 'albums' | 'artists' | 'playlists';

/** A provider's track id: the MediaStore id for local files, `identifier/filename` for archive. */
export type ProviderRef = string;

/** A track found through a provider that is not stored in the tracks table (yet). */
export interface RemoteTrack {
  provider: string;
  providerRef: ProviderRef;
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  trackNo: number | null;
  discNo: number | null;
  durationMs: number | null;
  albumRef: string | null;
  licenseUrl: string | null;
  attribution: string | null;
}

/** An album of a remote provider (an Internet Archive item). */
export interface RemoteAlbum {
  provider: string;
  ref: string;
  name: string;
  artist: string | null;
  year: number | null;
  licenseUrl: string | null;
}

/** Anything a track list can show: a stored track, or a remote one stored on first use. */
export type TrackItem = Track | RemoteTrack;

export function isStoredTrack(item: TrackItem): item is Track {
  return 'id' in item;
}

export type AlbumItem = Album | RemoteAlbum;

export function isRemoteAlbum(item: AlbumItem): item is RemoteAlbum {
  return 'ref' in item;
}

export interface SearchResult {
  tracks: TrackItem[];
  albums: AlbumItem[];
  artists: Artist[];
  playlists: Playlist[];
}

export const EMPTY_SEARCH: SearchResult = { tracks: [], albums: [], artists: [], playlists: [] };

export interface SearchOptions {
  types: readonly SearchType[];
  limit: number;
  signal?: AbortSignal;
}

export interface StreamSource {
  url: string;
  mime: string;
  expiresAt?: number;
}

export type DownloadFormat = 'mp3' | 'flac' | 'ogg';

export const DOWNLOAD_FORMATS: readonly DownloadFormat[] = ['mp3', 'flac', 'ogg'];

export interface DownloadOptions {
  /** Preferred format; providers fall back to MP3 when the item does not have it. */
  format: DownloadFormat;
  /** Continue from the partial file at the destination instead of starting over. */
  resume: boolean;
  /** Bytes the storage limit still allows; a larger file is refused before it starts. */
  maxBytes: number;
  signal?: AbortSignal;
}

export interface LocalFile {
  /** file:// URI in app-private storage. */
  uri: string;
  bytes: number;
  format: DownloadFormat;
  /** The provider published an MD5 and the file matched it. */
  verified: boolean;
}

export interface DownloadProgress {
  bytesDone: number;
  bytesTotal: number | null;
}

export interface RemoteAlbumDetail {
  album: RemoteAlbum;
  tracks: RemoteTrack[];
}

/**
 * A music source (SPEC §4). `download` takes a destination stem (directory URI plus a name
 * without extension): the provider adds the whitelisted extension of the format it delivers.
 */
export interface SourceProvider {
  id: string;
  capabilities: readonly Capability[];
  search(query: string, options: SearchOptions): Promise<SearchResult>;
  resolveStream(ref: ProviderRef): Promise<StreamSource>;
  download?(
    ref: ProviderRef,
    dest: string,
    onProgress: (progress: DownloadProgress) => void,
    options: DownloadOptions,
  ): Promise<LocalFile>;
  /** Tracks of a remote album; providers with the 'albums' capability. */
  album?(ref: string, signal?: AbortSignal): Promise<RemoteAlbumDetail>;
}
