import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Db } from '@/db/types';

import {
  buildPlaylistFile,
  importPlaylistFile,
  parsePlaylistFile,
  PlaylistFileError,
  type ImportResult,
} from './playlistFile';
import { playlistItems, type Playlist } from './playlists';

const MIME = 'application/json';

/** File name safe on every file system, e.g. "Road trip.aulos-playlist.json". */
export function exportFileName(name: string): string {
  const safe = name.replace(/[\/:*?"<>|\u0000-\u001f]+/gu, ' ').trim() || 'playlist';
  return `${safe.slice(0, 80)}.aulos-playlist.json`;
}

/** Writes the playlist file to the cache and opens the Android share sheet for it. */
export async function exportPlaylist(db: Db, playlist: Playlist): Promise<void> {
  const items = await playlistItems(db, playlist.id);
  const content = JSON.stringify(
    buildPlaylistFile(
      playlist.name,
      items.map((i) => i.track),
    ),
    null,
    2,
  );
  const file = new File(Paths.cache, exportFileName(playlist.name));
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: playlist.name });
}

export interface PickedImport extends ImportResult {
  name: string;
}

/** Lets the user pick a playlist file and imports it; null when the picker was cancelled. */
export async function importPlaylistFromPicker(
  db: Db,
  fallbackName: string,
): Promise<PickedImport | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [MIME, 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset) return null;
  let json: unknown;
  try {
    json = JSON.parse(await new File(asset.uri).text());
  } catch {
    throw new PlaylistFileError('The file is not valid JSON.');
  }
  const file = parsePlaylistFile(json);
  const result = await importPlaylistFile(db, file, fallbackName);
  return { ...result, name: file.name.trim() || fallbackName };
}
