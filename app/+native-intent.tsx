/**
 * Files shared to Aulos arrive as `aulos://expo-sharing` (expo-sharing); everything else keeps
 * its path. Never throws: a bad URL falls back to the library.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return path.includes('expo-sharing') ? '/import-shared' : path;
  } catch {
    return '/';
  }
}
