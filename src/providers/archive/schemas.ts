import { z } from 'zod';

/**
 * Shapes of the Internet Archive responses this provider reads, from recorded responses
 * (test/fixtures/archive). Metadata values are strings in practice but some fields hold lists
 * (creator, title, subject) and search returns numbers for year, so text fields accept all
 * three and are normalised by `text()` in mapping.ts. Unknown keys are kept and ignored.
 */
export const textValue = z.union([
  z.string(),
  z.number(),
  z.array(z.union([z.string(), z.number()])),
]);
export type TextValue = z.infer<typeof textValue>;

export const searchDocSchema = z.looseObject({
  identifier: z.string(),
  title: textValue.optional(),
  creator: textValue.optional(),
  year: textValue.optional(),
  licenseurl: textValue.optional(),
});
export type SearchDoc = z.infer<typeof searchDocSchema>;

/** advancedsearch.php with output=json. */
export const searchResponseSchema = z.looseObject({
  response: z.looseObject({
    numFound: z.number(),
    docs: z.array(searchDocSchema),
  }),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const fileSchema = z.looseObject({
  name: z.string(),
  source: z.string().optional(),
  format: z.string().optional(),
  original: z.string().optional(),
  size: textValue.optional(),
  md5: z.string().optional(),
  length: textValue.optional(),
  title: textValue.optional(),
  track: textValue.optional(),
  artist: textValue.optional(),
  creator: textValue.optional(),
  album: textValue.optional(),
});
export type ArchiveFile = z.infer<typeof fileSchema>;

export const itemMetadataSchema = z.looseObject({
  identifier: textValue.optional(),
  title: textValue.optional(),
  creator: textValue.optional(),
  date: textValue.optional(),
  year: textValue.optional(),
  licenseurl: textValue.optional(),
});

/**
 * The metadata API. A missing item answers `{}` (recorded) or `[]` (documented), so both
 * `metadata` and `files` are optional here and their absence means "not found".
 */
export const metadataResponseSchema = z.union([
  z.looseObject({
    metadata: itemMetadataSchema.optional(),
    files: z.array(fileSchema).optional(),
  }),
  z.array(z.unknown()).length(0),
]);
export type MetadataResponse = z.infer<typeof metadataResponseSchema>;

export interface ItemMetadata {
  identifier: string;
  metadata: z.infer<typeof itemMetadataSchema>;
  files: ArchiveFile[];
}
