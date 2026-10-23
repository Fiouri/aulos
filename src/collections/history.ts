import type { Db } from '@/db/types';
import { TRACK_COLUMNS, type Track } from '@/library/queries';

/** Inserts one counted play; returns its row id so the final duration can be filled in. */
export async function recordPlay(
  db: Db,
  trackId: number,
  playedAt: number,
  msPlayed: number,
): Promise<number> {
  const { lastInsertRowId } = await db.run(
    'INSERT INTO history (track_id, played_at, ms_played) VALUES (?, ?, ?)',
    [trackId, playedAt, Math.round(msPlayed)],
  );
  return lastInsertRowId;
}

export async function updatePlayDuration(
  db: Db,
  historyId: number,
  msPlayed: number,
): Promise<void> {
  await db.run('UPDATE history SET ms_played = MAX(ms_played, ?) WHERE id = ?', [
    Math.round(msPlayed),
    historyId,
  ]);
}

export interface RecentTrack extends Track {
  lastPlayedAt: number;
}

/** Distinct tracks, most recently played first. */
export function recentlyPlayed(db: Db, limit = 100): Promise<RecentTrack[]> {
  return db.getAll<RecentTrack>(
    `SELECT ${TRACK_COLUMNS}, r.last_played_at AS lastPlayedAt
       FROM (SELECT track_id, MAX(played_at) AS last_played_at FROM history GROUP BY track_id) r
       JOIN tracks t ON t.id = r.track_id
      ORDER BY r.last_played_at DESC, t.id
      LIMIT ?`,
    [limit],
  );
}
