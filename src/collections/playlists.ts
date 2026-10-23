import type { Db } from '@/db/types';
import { TRACK_COLUMNS, type Track } from '@/library/queries';

export interface Playlist {
  id: number;
  name: string;
  trackCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistItem {
  position: number;
  track: Track;
}

export class PlaylistNameError extends Error {
  override name = 'PlaylistNameError';
  constructor() {
    super('A playlist needs a name.');
  }
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new PlaylistNameError();
  return trimmed;
}

const PLAYLIST_COLUMNS = `p.id, p.name, p.created_at AS createdAt, p.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS trackCount`;

export function listPlaylists(db: Db): Promise<Playlist[]> {
  return db.getAll<Playlist>(
    `SELECT ${PLAYLIST_COLUMNS} FROM playlists p ORDER BY p.name COLLATE NOCASE, p.id`,
  );
}

export function getPlaylist(db: Db, id: number): Promise<Playlist | null> {
  return db.getFirst<Playlist>(`SELECT ${PLAYLIST_COLUMNS} FROM playlists p WHERE p.id = ?`, [id]);
}

export async function createPlaylist(db: Db, name: string, now = Date.now()): Promise<number> {
  const { lastInsertRowId } = await db.run(
    'INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)',
    [cleanName(name), now, now],
  );
  return lastInsertRowId;
}

export async function renamePlaylist(
  db: Db,
  id: number,
  name: string,
  now = Date.now(),
): Promise<void> {
  await db.run('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', [
    cleanName(name),
    now,
    id,
  ]);
}

/** Its items go with it (ON DELETE CASCADE). */
export async function deletePlaylist(db: Db, id: number): Promise<void> {
  await db.run('DELETE FROM playlists WHERE id = ?', [id]);
}

export async function playlistItems(db: Db, id: number): Promise<PlaylistItem[]> {
  const rows = await db.getAll<Track & { position: number }>(
    `SELECT i.position, ${TRACK_COLUMNS} FROM playlist_items i JOIN tracks t ON t.id = i.track_id
      WHERE i.playlist_id = ? ORDER BY i.position`,
    [id],
  );
  return rows.map(({ position, ...track }) => ({ position, track }));
}

async function itemTrackIds(tx: Db, id: number): Promise<number[]> {
  const rows = await tx.getAll<{ trackId: number }>(
    'SELECT track_id AS trackId FROM playlist_items WHERE playlist_id = ? ORDER BY position',
    [id],
  );
  return rows.map((r) => r.trackId);
}

/** Rewrites the playlist as positions 0..n-1 in the given order. */
async function writeItems(tx: Db, id: number, trackIds: readonly number[], now: number) {
  await tx.run('DELETE FROM playlist_items WHERE playlist_id = ?', [id]);
  for (const [position, trackId] of trackIds.entries()) {
    await tx.run('INSERT INTO playlist_items (playlist_id, position, track_id) VALUES (?, ?, ?)', [
      id,
      position,
      trackId,
    ]);
  }
  await tx.run('UPDATE playlists SET updated_at = ? WHERE id = ?', [now, id]);
}

/** Appends tracks at the end; a track may appear more than once. */
export async function addToPlaylist(
  db: Db,
  id: number,
  trackIds: readonly number[],
  now = Date.now(),
): Promise<void> {
  if (trackIds.length === 0) return;
  await db.transaction(async (tx) => {
    const current = await itemTrackIds(tx, id);
    await writeItems(tx, id, [...current, ...trackIds], now);
  });
}

/** Removes the items at `positions` and closes the gaps. */
export async function removeFromPlaylist(
  db: Db,
  id: number,
  positions: readonly number[],
  now = Date.now(),
): Promise<void> {
  const drop = new Set(positions);
  await db.transaction(async (tx) => {
    const current = await itemTrackIds(tx, id);
    await writeItems(
      tx,
      id,
      current.filter((_, i) => !drop.has(i)),
      now,
    );
  });
}

/** Moves the item at `from` so it ends up at `to`; out-of-range positions change nothing. */
export async function movePlaylistItem(
  db: Db,
  id: number,
  from: number,
  to: number,
  now = Date.now(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await itemTrackIds(tx, id);
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    await writeItems(tx, id, next, now);
  });
}
