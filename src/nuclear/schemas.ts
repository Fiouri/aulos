import { z } from 'zod';

/**
 * Nuclear Jam API shapes, from packages/model/src (index.ts, queue.ts, search.ts) and
 * packages/player/src-tauri/src/http_api at 32f7c56. Objects keep unknown keys (Nuclear adds
 * fields such as album, artwork or streamCandidates that the phone passes back untouched).
 */
export const providerRefSchema = z.looseObject({
  provider: z.string(),
  id: z.string(),
  url: z.string().optional(),
});
export type JamProviderRef = z.infer<typeof providerRefSchema>;

export const artistCreditSchema = z.looseObject({
  name: z.string(),
  roles: z.array(z.string()),
  source: providerRefSchema.optional(),
});

export const artworkSchema = z.looseObject({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  purpose: z.string().optional(),
});

export const artworkSetSchema = z.looseObject({ items: z.array(artworkSchema) });

export const trackSchema = z.looseObject({
  title: z.string(),
  artists: z.array(artistCreditSchema),
  album: z.looseObject({ title: z.string() }).optional(),
  durationMs: z.number().optional(),
  artwork: artworkSetSchema.optional(),
  source: providerRefSchema,
});
export type JamTrack = z.infer<typeof trackSchema>;

export const queueItemSchema = z.looseObject({
  id: z.string(),
  track: trackSchema,
  // Absent while Nuclear is still resolving the item's stream (seen with Nuclear 1.51).
  status: z.string().optional(),
  error: z.string().optional(),
  addedAtIso: z.string(),
});
export type JamQueueItem = z.infer<typeof queueItemSchema>;

export const queueSchema = z.looseObject({
  items: z.array(queueItemSchema),
  currentIndex: z.number(),
});
export type JamQueue = z.infer<typeof queueSchema>;

/** `status` is playing, paused or stopped; seek and duration are in seconds. */
export const playbackSchema = z.looseObject({
  status: z.string(),
  seek: z.number(),
  duration: z.number(),
});
export type JamPlayback = z.infer<typeof playbackSchema>;

export const volumeSchema = z.looseObject({ volume: z.number() });

export const REPEAT_MODES = ['off', 'all', 'one'] as const;
export type JamRepeat = (typeof REPEAT_MODES)[number];

export const settingsSchema = z.looseObject({
  shuffle: z.boolean(),
  repeat: z.enum(REPEAT_MODES),
  discovery: z.boolean().optional(),
  language: z.string().optional(),
  dark: z.boolean().optional(),
  themeId: z.string().optional(),
});
export type JamSettings = z.infer<typeof settingsSchema>;

export const healthSchema = z.looseObject({ status: z.literal('ok') });

const refWithName = z.looseObject({ name: z.string(), source: providerRefSchema });
const albumRefSchema = z.looseObject({ title: z.string(), source: providerRefSchema });

export const searchResultsSchema = z.looseObject({
  tracks: z.array(trackSchema).optional(),
  artists: z.array(refWithName).optional(),
  albums: z.array(albumRefSchema).optional(),
  playlists: z.array(refWithName).optional(),
});
export type JamSearchResults = z.infer<typeof searchResultsSchema>;

export const SEARCH_CATEGORIES = ['artists', 'albums', 'tracks', 'playlists'] as const;
export type JamSearchCategory = (typeof SEARCH_CATEGORIES)[number];

export const playlistIdSchema = z.looseObject({ id: z.string() });

/** AttributedLyrics[]: the phone does not show lyrics, so entries are kept opaque. */
export const lyricsSchema = z.array(z.unknown());

export const errorBodySchema = z.looseObject({ error: z.string() });
