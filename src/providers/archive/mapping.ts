import { InvalidResponseError } from '@/net/errors';

import type {
  DownloadFormat,
  ProviderRef,
  RemoteAlbum,
  RemoteAlbumDetail,
  RemoteTrack,
} from '../types';
import type { ArchiveFile, ItemMetadata, SearchDoc, TextValue } from './schemas';

export const ARCHIVE_PROVIDER = 'archive';
export const ARCHIVE_ORIGIN = 'https://archive.org';

/** Item identifiers are letters, digits, '.', '-' and '_' (never '/' or '..' on their own). */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** Files that are audio a track can come from; everything else (images, spectrograms,
 * playlists, torrents, archives, metadata) is ignored. */
const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'flac',
  'ogg',
  'oga',
  'opus',
  'wav',
  'aif',
  'aiff',
  'm4a',
]);

/** MP3 formats in order of preference for streaming. */
const MP3_FORMATS = ['VBR MP3', 'MP3', '320Kbps MP3', '256Kbps MP3', '128Kbps MP3', '64Kbps MP3'];

/** Download formats: archive.org format names and the only extension accepted for each. */
const DOWNLOAD_FILES: Record<DownloadFormat, { formats: readonly string[]; extension: string }> = {
  mp3: { formats: MP3_FORMATS, extension: 'mp3' },
  flac: { formats: ['Flac', '24bit Flac'], extension: 'flac' },
  ogg: { formats: ['Ogg Vorbis'], extension: 'ogg' },
};

/** Text of a metadata value: lists joined with ", ", blank as null. */
export function text(value: TextValue | undefined): string | null {
  if (value === undefined) return null;
  const joined = Array.isArray(value) ? value.map(String).join(', ') : String(value);
  const trimmed = joined.trim();
  return trimmed === '' ? null : trimmed;
}

/** "200.28" (seconds) or "03:20" / "1:02:03" (clock) to milliseconds. */
export function parseLength(value: TextValue | undefined): number | null {
  const raw = text(value);
  if (raw === null) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const ms = Math.round(Number(raw) * 1000);
    return ms > 0 ? ms : null;
  }
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(raw)) {
    const seconds = raw.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    return seconds > 0 ? Math.round(seconds * 1000) : null;
  }
  return null;
}

/** "01", "3/12" or 7 to a track number. */
export function parseTrackNo(value: TextValue | undefined): number | null {
  const match = text(value)?.match(/^\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return n > 0 ? n : null;
}

export function parseYear(value: TextValue | undefined): number | null {
  const match = text(value)?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number(match[1]) : null;
}

export function parseSize(value: TextValue | undefined): number | null {
  const raw = text(value);
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Lower-case extension of the last path segment, or '' without one. */
export function fileExtension(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function isValidIdentifier(identifier: string): boolean {
  return IDENTIFIER.test(identifier);
}

/** `identifier/filename`; the file name may contain sub-folders. */
export function makeProviderRef(identifier: string, fileName: string): ProviderRef {
  return `${identifier}/${fileName}`;
}

export function parseProviderRef(
  ref: ProviderRef,
): { identifier: string; fileName: string } | null {
  const slash = ref.indexOf('/');
  if (slash <= 0) return null;
  const identifier = ref.slice(0, slash);
  const fileName = ref.slice(slash + 1);
  return isValidIdentifier(identifier) && fileName !== '' ? { identifier, fileName } : null;
}

/**
 * Download URL of a file. File names come from the network, so every path segment is
 * percent-encoded and empty, '.' and '..' segments are refused rather than sent.
 */
export function fileUrl(identifier: string, fileName: string): string {
  if (!isValidIdentifier(identifier)) throw new InvalidResponseError('Invalid item identifier');
  const segments = fileName.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new InvalidResponseError('Invalid file name');
  }
  return `${ARCHIVE_ORIGIN}/download/${encodeURIComponent(identifier)}/${segments
    .map(encodeURIComponent)
    .join('/')}`;
}

export function metadataUrl(identifier: string): string {
  if (!isValidIdentifier(identifier)) throw new InvalidResponseError('Invalid item identifier');
  return `${ARCHIVE_ORIGIN}/metadata/${encodeURIComponent(identifier)}`;
}

function isAudio(file: ArchiveFile): boolean {
  return file.source !== 'metadata' && AUDIO_EXTENSIONS.has(fileExtension(file.name));
}

/** One track: its original file and the audio files derived from it. */
export interface TrackFiles {
  root: ArchiveFile;
  files: ArchiveFile[];
}

/**
 * Groups an item's audio into tracks. A track is an original audio file plus its audio
 * derivatives (archive.org derives VBR MP3, Ogg and FLAC from each upload); a derivative whose
 * original is not audio stands alone.
 */
export function audioTracks(files: readonly ArchiveFile[]): TrackFiles[] {
  const audio = files.filter(isAudio);
  const names = new Set(audio.map((f) => f.name));
  const groups = new Map<string, TrackFiles>();
  for (const file of audio) {
    const owner =
      file.source === 'derivative' && file.original && names.has(file.original)
        ? file.original
        : file.name;
    if (owner !== file.name) continue;
    groups.set(file.name, { root: file, files: [file] });
  }
  for (const file of audio) {
    if (groups.has(file.name)) continue;
    if (file.original) groups.get(file.original)?.files.push(file);
  }
  return [...groups.values()];
}

function pick(
  files: readonly ArchiveFile[],
  formats: readonly string[],
  extension: string,
): ArchiveFile | null {
  for (const format of formats) {
    const match = files.find((f) => f.format === format && fileExtension(f.name) === extension);
    if (match) return match;
  }
  return null;
}

/** The MP3 to stream: VBR MP3 first, then plain MP3. */
export function streamFile(track: TrackFiles): ArchiveFile | null {
  return pick(track.files, MP3_FORMATS, 'mp3');
}

/** The file to download in `format`, falling back to the MP3. */
export function downloadFile(
  track: TrackFiles,
  format: DownloadFormat,
): { file: ArchiveFile; format: DownloadFormat } | null {
  const wanted = DOWNLOAD_FILES[format];
  const preferred = pick(track.files, wanted.formats, wanted.extension);
  if (preferred) return { file: preferred, format };
  const mp3 = streamFile(track);
  return mp3 ? { file: mp3, format: 'mp3' } : null;
}

function baseName(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).replace(/_+/g, ' ').trim();
}

export function docToAlbum(doc: SearchDoc): RemoteAlbum {
  return {
    provider: ARCHIVE_PROVIDER,
    ref: doc.identifier,
    name: text(doc.title) ?? doc.identifier,
    artist: text(doc.creator),
    year: parseYear(doc.year),
    licenseUrl: text(doc.licenseurl),
  };
}

/**
 * An item as an album with its playable tracks (those with an MP3 to stream), in track-number
 * order. Track fields come from the file's tags, then the item: title from the file (or the
 * item title when the item holds a single track, or the file name), artist from the file's
 * artist or creator, then the item creator; album from the file, then the item title.
 */
export function itemToAlbum(item: ItemMetadata): RemoteAlbumDetail {
  const meta = item.metadata;
  const itemTitle = text(meta.title) ?? item.identifier;
  const creator = text(meta.creator);
  const licenseUrl = text(meta.licenseurl);
  const album: RemoteAlbum = {
    provider: ARCHIVE_PROVIDER,
    ref: item.identifier,
    name: itemTitle,
    artist: creator,
    year: parseYear(meta.year) ?? parseYear(meta.date),
    licenseUrl,
  };
  const playable = audioTracks(item.files).filter((t) => streamFile(t) !== null);
  const single = playable.length === 1;
  const tracks: RemoteTrack[] = playable.map(({ root, files }) => {
    const stream = streamFile({ root, files });
    const tagged = (key: 'title' | 'artist' | 'creator' | 'album' | 'track') =>
      text(root[key]) ?? text(stream?.[key]);
    return {
      provider: ARCHIVE_PROVIDER,
      providerRef: makeProviderRef(item.identifier, root.name),
      title: tagged('title') ?? (single ? itemTitle : baseName(root.name)),
      artist: tagged('artist') ?? tagged('creator') ?? creator,
      album: tagged('album') ?? itemTitle,
      albumArtist: creator,
      trackNo: parseTrackNo(root.track) ?? parseTrackNo(stream?.track),
      discNo: null,
      durationMs: parseLength(stream?.length) ?? parseLength(root.length),
      albumRef: item.identifier,
      licenseUrl,
      attribution: creator,
    };
  });
  tracks.sort(
    (a, b) =>
      (a.trackNo ?? Number.MAX_SAFE_INTEGER) - (b.trackNo ?? Number.MAX_SAFE_INTEGER) ||
      a.providerRef.localeCompare(b.providerRef),
  );
  return { album, tracks };
}
