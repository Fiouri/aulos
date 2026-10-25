import { getKv, setKv } from '@/db/kv';
import type { Db } from '@/db/types';

export interface Pairing {
  id: number;
  name: string;
  baseUrl: string;
  /** Last successful connection; the most recent one reconnects when the PC tab opens. */
  lastSeenAt: number | null;
}

const COLUMNS = 'id, name, base_url AS baseUrl, last_seen_at AS lastSeenAt';
export const SECURITY_NOTICE_KEY = 'nuclear.securityNoticeSeen';

export function listPairings(db: Db): Promise<Pairing[]> {
  return db.getAll<Pairing>(
    `SELECT ${COLUMNS} FROM pairings ORDER BY last_seen_at IS NULL, last_seen_at DESC, name`,
  );
}

export function lastUsedPairing(db: Db): Promise<Pairing | null> {
  return db.getFirst<Pairing>(
    `SELECT ${COLUMNS} FROM pairings WHERE last_seen_at IS NOT NULL
      ORDER BY last_seen_at DESC LIMIT 1`,
  );
}

/** Saves a PC (or refreshes the one with this URL) and marks it as just used. */
export async function savePairing(
  db: Db,
  name: string,
  baseUrl: string,
  now: number = Date.now(),
): Promise<Pairing> {
  await db.run(
    `INSERT INTO pairings (name, base_url, last_seen_at) VALUES (?, ?, ?)
     ON CONFLICT (base_url) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    [name.trim() || baseUrl, baseUrl, now],
  );
  const saved = await db.getFirst<Pairing>(`SELECT ${COLUMNS} FROM pairings WHERE base_url = ?`, [
    baseUrl,
  ]);
  if (!saved) throw new Error('Pairing was not saved');
  return saved;
}

export async function markPairingUsed(db: Db, id: number, now: number = Date.now()) {
  await db.run('UPDATE pairings SET last_seen_at = ? WHERE id = ?', [now, id]);
}

export async function renamePairing(db: Db, id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed === '') return;
  await db.run('UPDATE pairings SET name = ? WHERE id = ?', [trimmed, id]);
}

export async function forgetPairing(db: Db, id: number): Promise<void> {
  await db.run('DELETE FROM pairings WHERE id = ?', [id]);
}

export async function securityNoticeSeen(db: Db): Promise<boolean> {
  return (await getKv(db, SECURITY_NOTICE_KEY)) === true;
}

export async function markSecurityNoticeSeen(db: Db): Promise<void> {
  await setKv(db, SECURITY_NOTICE_KEY, true);
}
