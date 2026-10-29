/**
 * Writes src/about/third-party-licences.json, the data behind Settings → Third-party licences:
 * name, version, declared licence and licence text of every package in the production
 * dependency tree (package-lock.json without dev and optional packages). Runs before every
 * prebuild (npm run android:prebuild); a test fails when the committed file is out of date.
 *
 *   node scripts/generate-licences.ts [--summary]
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildLicenceReport, licenceSummary } from '../src/about/licenceReport.ts';
import { nodePackageFiles, readLockPackages } from '../src/about/nodePackageFiles.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'src', 'about', 'third-party-licences.json');

const report = buildLicenceReport(readLockPackages(ROOT), nodePackageFiles(ROOT));
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);

const withoutText = report.packages.filter((entry) => entry.text === null);
console.log(
  `${report.packages.length} packages, ${report.texts.length} distinct licence texts, ` +
    `${withoutText.length} without a licence file → ${OUTPUT}`,
);
if (process.argv.includes('--summary')) {
  for (const [licence, count] of licenceSummary(report)) console.log(`${count}\t${licence}`);
  for (const entry of withoutText) {
    console.log(`no licence file: ${entry.name}@${entry.version} (${entry.licence ?? 'none'})`);
  }
}
