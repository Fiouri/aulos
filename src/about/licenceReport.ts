/** One entry of package-lock.json's `packages` map. */
export interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
  optional?: boolean;
  devOptional?: boolean;
  link?: boolean;
}

/** What a package's own package.json says about its licence. */
export interface PackageManifest {
  license?: unknown;
  licenses?: unknown;
}

/** Reads an installed package by its path in the lockfile (e.g. "node_modules/react"). */
export interface PackageFiles {
  manifest(path: string): PackageManifest | null;
  /** Contents of the package's licence files (LICENSE, COPYING, …), in file-name order. */
  licenceTexts(path: string): string[];
}

export interface LicenceEntry {
  name: string;
  version: string;
  /** SPDX expression from the package, or null when it declares none. */
  licence: string | null;
  /** Index into `texts`, or null when the package ships no licence file. */
  text: number | null;
}

/** Packages sorted by name and version; identical licence texts are stored once. */
export interface LicenceReport {
  packages: LicenceEntry[];
  texts: string[];
}

const LICENCE_FILE = /^(?:licen[cs]e|copying|unlicen[cs]e)(?:[-_.].*)?$/i;

export function isLicenceFileName(name: string): boolean {
  return LICENCE_FILE.test(name);
}

/** The package name from its lockfile path: the part after the last "node_modules/". */
export function packageName(path: string): string {
  const marker = 'node_modules/';
  return path.slice(path.lastIndexOf(marker) + marker.length);
}

function typeOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string') {
    return value.type;
  }
  return null;
}

/** package.json `license` (string or legacy {type}) or the legacy `licenses` array. */
export function declaredLicence(
  manifest: PackageManifest | null,
  lock: LockPackage,
): string | null {
  const own = typeOf(manifest?.license);
  if (own) return own;
  if (Array.isArray(manifest?.licenses)) {
    const types = manifest.licenses.map(typeOf).filter((type): type is string => type !== null);
    if (types.length === 1) return types[0] ?? null;
    if (types.length > 1) return `(${types.join(' OR ')})`;
  }
  return lock.license?.trim() || null;
}

/**
 * The production dependency tree: every installed lockfile package that is neither a dev
 * dependency nor optional (optional ones are platform-specific build tools, absent on other
 * hosts, so leaving them out keeps the report identical on every machine).
 */
export function isProductionPackage(path: string, lock: LockPackage): boolean {
  if (!path.includes('node_modules/') || lock.link) return false;
  return !lock.dev && !lock.optional && !lock.devOptional;
}

export function buildLicenceReport(
  lockPackages: Record<string, LockPackage>,
  files: PackageFiles,
): LicenceReport {
  const seen = new Set<string>();
  const found: { name: string; version: string; licence: string | null; text: string | null }[] =
    [];
  for (const [path, lock] of Object.entries(lockPackages)) {
    if (!isProductionPackage(path, lock)) continue;
    const name = packageName(path);
    const version = lock.version ?? 'unknown';
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const texts = files.licenceTexts(path).map((text) => text.replace(/\r\n?/g, '\n').trim());
    found.push({
      name,
      version,
      licence: declaredLicence(files.manifest(path), lock),
      text: texts.filter(Boolean).join('\n\n') || null,
    });
  }
  found.sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name < b.name ? -1 : 1,
  );

  const texts: string[] = [];
  const indexOf = new Map<string, number>();
  const packages = found.map(({ text, ...entry }) => {
    if (text === null) return { ...entry, text: null };
    let index = indexOf.get(text);
    if (index === undefined) {
      index = texts.length;
      texts.push(text);
      indexOf.set(text, index);
    }
    return { ...entry, text: index };
  });
  return { packages, texts };
}

/** Number of packages per declared licence, most common first. */
export function licenceSummary(report: LicenceReport): [string, number][] {
  const counts = new Map<string, number>();
  for (const { licence } of report.packages) {
    const key = licence ?? 'none declared';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}
