import { searchTokens } from '@/search/normalize';

/** Durations further apart than this mean a different recording. */
export const DURATION_TOLERANCE_MS = 3000;

/** Accent-, case- and punctuation-blind form of a title or artist. */
export function matchKey(text: string | null | undefined): string {
  return text ? searchTokens(text).join(' ') : '';
}

const ARTIST_SEPARATORS = /\s*(?:,|;|\/|\s(?:feat\.?|ft\.?|featuring|with|&|x|and)\s)\s*/i;

/** The first artist of a tag like "Grey Falcon, Echo" or "A feat. B". */
export function primaryArtistName(artistTag: string | null | undefined): string | null {
  const first = artistTag?.split(ARTIST_SEPARATORS)[0]?.trim();
  return first ? first : null;
}

/** Nuclear credits: the artist with a main/primary role, else the first one. */
export function primaryCredit(artists: readonly { name: string; roles: readonly string[] }[]) {
  const main = artists.find((a) => a.roles.some((r) => r === 'main' || r === 'primary'));
  return (main ?? artists[0])?.name ?? null;
}

export interface MatchFields {
  title: string;
  /** Primary artist, or null when unknown. */
  artist: string | null;
  durationMs: number | null;
}

/**
 * Same normalised title and primary artist, and durations within 3 s when both are known.
 * A target without an artist matches on title only when both durations are known.
 */
export function isConfidentMatch(target: MatchFields, candidate: MatchFields): boolean {
  const title = matchKey(target.title);
  if (title === '' || title !== matchKey(candidate.title)) return false;
  const artist = matchKey(primaryArtistName(target.artist));
  const durationsKnown = target.durationMs !== null && candidate.durationMs !== null;
  if (artist !== '') {
    if (artist !== matchKey(primaryArtistName(candidate.artist))) return false;
  } else if (!durationsKnown) {
    return false;
  }
  return (
    !durationsKnown ||
    Math.abs((target.durationMs ?? 0) - (candidate.durationMs ?? 0)) <= DURATION_TOLERANCE_MS
  );
}

export type MatchResult<T> = { match: T } | { candidates: T[] };

/**
 * The confident match closest in duration (search order breaks ties), or, when none is
 * confident, the candidates for the user to choose from instead of a guess.
 */
export function pickMatch<T>(
  target: MatchFields,
  candidates: readonly T[],
  fields: (candidate: T) => MatchFields,
): MatchResult<T> {
  let best: { candidate: T; distance: number } | null = null;
  for (const candidate of candidates) {
    const f = fields(candidate);
    if (!isConfidentMatch(target, f)) continue;
    const distance =
      target.durationMs !== null && f.durationMs !== null
        ? Math.abs(target.durationMs - f.durationMs)
        : DURATION_TOLERANCE_MS + 1;
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  return best ? { match: best.candidate } : { candidates: [...candidates] };
}
