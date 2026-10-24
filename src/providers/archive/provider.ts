import { IntegrityError, StorageLimitError } from '@/downloads/errors';
import type { FileOps, Transfer } from '@/downloads/transfer';
import { isAbortError, NotFoundError } from '@/net/errors';

import {
  EMPTY_SEARCH,
  type DownloadFormat,
  type ProviderRef,
  type RemoteTrack,
  type SourceProvider,
} from '../types';
import type { ArchiveApi } from './api';
import {
  ARCHIVE_PROVIDER,
  audioTracks,
  docToAlbum,
  downloadFile,
  fileUrl,
  itemToAlbum,
  parseProviderRef,
  parseSize,
  streamFile,
  type TrackFiles,
} from './mapping';
import type { ItemMetadata } from './schemas';

/** Search results expanded into tracks: the top items only, to keep requests polite. */
export const EXPANDED_ITEMS = 3;

const EXTENSIONS: Record<DownloadFormat, string> = { mp3: 'mp3', flac: 'flac', ogg: 'ogg' };

export interface ArchiveProviderDeps {
  api: ArchiveApi;
  transfer: Transfer;
  files: FileOps;
  userAgent: string;
}

/**
 * Internet Archive: items are albums, their audio files are tracks. Streams the MP3
 * derivative, downloads MP3 (or FLAC/Ogg when the item has them) and checks the download
 * against the item's published MD5.
 */
export function createArchiveProvider(deps: ArchiveProviderDeps): SourceProvider {
  const { api, transfer, files, userAgent } = deps;

  const trackOf = async (
    ref: ProviderRef,
    signal?: AbortSignal,
  ): Promise<{ item: ItemMetadata; track: TrackFiles; identifier: string }> => {
    const parsed = parseProviderRef(ref);
    if (!parsed) throw new NotFoundError('Unknown track');
    const item = await api.item(parsed.identifier, signal);
    const track = audioTracks(item.files).find((t) => t.root.name === parsed.fileName);
    if (!track) throw new NotFoundError('Track not in item');
    return { item, track, identifier: parsed.identifier };
  };

  return {
    id: ARCHIVE_PROVIDER,
    capabilities: ['search', 'stream', 'download', 'albums'],

    async search(query, { types, limit, signal }) {
      if (!types.includes('albums') && !types.includes('tracks')) return EMPTY_SEARCH;
      const { docs } = (await api.search(query, limit, signal)).response;
      let tracks: RemoteTrack[] = [];
      if (types.includes('tracks')) {
        const expanded = await Promise.all(
          docs.slice(0, EXPANDED_ITEMS).map(async (doc) => {
            try {
              return itemToAlbum(await api.item(doc.identifier, signal)).tracks;
            } catch (error) {
              // One unreadable item must not fail the whole search.
              if (isAbortError(error)) throw error;
              return [];
            }
          }),
        );
        tracks = expanded.flat().slice(0, limit);
      }
      return {
        tracks,
        albums: types.includes('albums') ? docs.map(docToAlbum) : [],
        artists: [],
        playlists: [],
      };
    },

    async resolveStream(ref) {
      const { track, identifier } = await trackOf(ref);
      const file = streamFile(track);
      if (!file) throw new NotFoundError('No MP3 to stream');
      return { url: fileUrl(identifier, file.name), mime: 'audio/mpeg' };
    },

    async album(ref, signal) {
      return itemToAlbum(await api.item(ref, signal));
    },

    async download(ref, dest, onProgress, { format, resume, maxBytes, signal }) {
      const { track, identifier } = await trackOf(ref, signal);
      const chosen = downloadFile(track, format);
      if (!chosen) throw new NotFoundError('No downloadable file');
      const size = parseSize(chosen.file.size);
      if (size !== null && size > maxBytes) throw new StorageLimitError(size, maxBytes);
      const uri = `${dest}.${EXTENSIONS[chosen.format]}`;
      await transfer({
        url: fileUrl(identifier, chosen.file.name),
        fileUri: uri,
        resume,
        headers: { 'User-Agent': userAgent },
        signal,
        onProgress: (bytesDone, bytesTotal) =>
          onProgress({ bytesDone, bytesTotal: size ?? bytesTotal }),
      });
      const expected = chosen.file.md5?.toLowerCase() ?? null;
      if (expected !== null && (await files.md5(uri)).toLowerCase() !== expected) {
        files.remove(uri);
        throw new IntegrityError();
      }
      return {
        uri,
        bytes: files.size(uri) ?? size ?? 0,
        format: chosen.format,
        verified: expected !== null,
      };
    },
  };
}
