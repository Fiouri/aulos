import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildLicenceReport,
  declaredLicence,
  isLicenceFileName,
  isProductionPackage,
  licenceSummary,
  packageName,
  type PackageFiles,
  type PackageManifest,
} from '../licenceReport';
import { nodePackageFiles, readLockPackages } from '../nodePackageFiles';

function fakeFiles(
  manifests: Record<string, PackageManifest>,
  texts: Record<string, string[]>,
): PackageFiles {
  return {
    manifest: (path) => manifests[path] ?? null,
    licenceTexts: (path) => texts[path] ?? [],
  };
}

describe('licence report', () => {
  it('keeps production packages only', () => {
    expect(isProductionPackage('', {})).toBe(false);
    expect(isProductionPackage('node_modules/a', {})).toBe(true);
    expect(isProductionPackage('node_modules/a', { dev: true })).toBe(false);
    expect(isProductionPackage('node_modules/a', { optional: true })).toBe(false);
    expect(isProductionPackage('node_modules/a', { devOptional: true })).toBe(false);
    expect(isProductionPackage('node_modules/a', { link: true })).toBe(false);
  });

  it('names nested and scoped packages', () => {
    expect(packageName('node_modules/react')).toBe('react');
    expect(packageName('node_modules/@expo/cli')).toBe('@expo/cli');
    expect(packageName('node_modules/a/node_modules/@scope/b')).toBe('@scope/b');
  });

  it.each(['LICENSE', 'license.md', 'LICENCE.txt', 'COPYING', 'LICENSE-MIT', 'UNLICENSE'])(
    'recognises %s as a licence file',
    (name) => expect(isLicenceFileName(name)).toBe(true),
  );

  it.each(['README.md', 'licenses.js', 'package.json'])('ignores %s', (name) => {
    expect(isLicenceFileName(name)).toBe(false);
  });

  it('reads modern, legacy and lockfile licence declarations', () => {
    expect(declaredLicence({ license: 'MIT' }, {})).toBe('MIT');
    expect(declaredLicence({ license: { type: 'ISC' } }, {})).toBe('ISC');
    expect(declaredLicence({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }, {})).toBe(
      '(MIT OR Apache-2.0)',
    );
    expect(declaredLicence({ licenses: [{ type: 'BSD-2-Clause' }] }, {})).toBe('BSD-2-Clause');
    expect(declaredLicence(null, { license: 'BSD-3-Clause' })).toBe('BSD-3-Clause');
    expect(declaredLicence({}, {})).toBeNull();
  });

  it('sorts, de-duplicates packages and stores identical texts once', () => {
    const report = buildLicenceReport(
      {
        '': { version: '1.0.0' },
        'node_modules/zeta': { version: '2.0.0' },
        'node_modules/alpha': { version: '1.0.0' },
        'node_modules/zeta/node_modules/alpha': { version: '1.0.0' },
        'node_modules/beta': { version: '3.0.0', license: 'ISC' },
        'node_modules/tool': { version: '1.0.0', dev: true },
      },
      fakeFiles(
        { 'node_modules/zeta': { license: 'MIT' }, 'node_modules/alpha': { license: 'MIT' } },
        {
          'node_modules/zeta': ['MIT text\r\n'],
          'node_modules/alpha': ['MIT text'],
          'node_modules/zeta/node_modules/alpha': ['MIT text'],
        },
      ),
    );
    expect(report).toEqual({
      packages: [
        { name: 'alpha', version: '1.0.0', licence: 'MIT', text: 0 },
        { name: 'beta', version: '3.0.0', licence: 'ISC', text: null },
        { name: 'zeta', version: '2.0.0', licence: 'MIT', text: 0 },
      ],
      texts: ['MIT text'],
    });
    expect(licenceSummary(report)).toEqual([
      ['MIT', 2],
      ['ISC', 1],
    ]);
  });

  it('joins several licence files of one package', () => {
    const report = buildLicenceReport(
      { 'node_modules/dual': { version: '1.0.0', license: '(MIT OR Apache-2.0)' } },
      fakeFiles({}, { 'node_modules/dual': ['Apache text', '', 'MIT text'] }),
    );
    expect(report.texts).toEqual(['Apache text\n\nMIT text']);
  });

  it('matches the committed src/about/third-party-licences.json (run npm run licences)', () => {
    const root = join(__dirname, '..', '..', '..');
    const committed: unknown = JSON.parse(
      readFileSync(join(root, 'src', 'about', 'third-party-licences.json'), 'utf8'),
    );
    expect(buildLicenceReport(readLockPackages(root), nodePackageFiles(root))).toEqual(committed);
  });
});
