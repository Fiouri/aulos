const COMBINING_MARKS = /\p{M}/gu;
const WHITESPACE = /\s+/gu;
/** Same separators as the FTS5 unicode61 tokenizer: anything that is not a letter or digit. */
const TOKEN_SEPARATORS = /[^\p{L}\p{N}]+/u;

/**
 * Folds text for accent- and case-insensitive search in every script: NFD, strip all combining
 * marks (Greek tonos and dialytika included), lowercase, final sigma as sigma, collapse whitespace.
 * Used both when writing the *_norm columns and when building queries, so the two always agree.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replaceAll('ς', 'σ')
    .replace(WHITESPACE, ' ')
    .trim();
}

export function normalizeNullable(text: string | null): string | null {
  return text === null ? null : normalizeText(text);
}

/** Normalised search tokens of a user query; empty when it has no letters or digits. */
export function searchTokens(query: string): string[] {
  return normalizeText(query)
    .split(TOKEN_SEPARATORS)
    .filter((token) => token.length > 0);
}

/**
 * FTS5 MATCH expression with prefix matching per token, all tokens required:
 * `"χατζ"* "μαν"*`. Null when nothing is left to match.
 */
export function ftsQuery(query: string): string | null {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(' ');
}
