/**
 * Node-only side of the licence report (scripts/generate-licences.ts and its test): reads
 * package-lock.json and the installed packages. Never imported by the app.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { isLicenceFileName, type LockPackage, type PackageFiles } from './licenceReport.ts';

export function readLockPackages(root: string): Record<string, LockPackage> {
  const lock: { packages?: Record<string, LockPackage> } = JSON.parse(
    readFileSync(join(root, 'package-lock.json'), 'utf8'),
  );
  if (!lock.packages) throw new Error('package-lock.json has no "packages" map (lockfile v2+).');
  return lock.packages;
}

export function nodePackageFiles(root: string): PackageFiles {
  return {
    manifest(path) {
      try {
        return JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8'));
      } catch {
        return null;
      }
    },
    licenceTexts(path) {
      const dir = join(root, path);
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        throw new Error(`${path} is in package-lock.json but not installed; run npm ci.`);
      }
      return names
        .filter((name) => isLicenceFileName(name) && statSync(join(dir, name)).isFile())
        .sort()
        .map((name) => readFileSync(join(dir, name), 'utf8'));
    },
  };
}
