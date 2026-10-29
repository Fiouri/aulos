/**
 * Renders the Aulos mark (a double pipe, the ancient aulos, drawn as a "Λ") into every icon and
 * splash PNG the app and the store metadata use. The mark is defined once here as SVG on the
 * 108 × 108 adaptive-icon grid; headless Chrome or Edge rasterises it, so no image library is
 * needed. Output is committed; rerun only when the mark or its colours change.
 *
 *   node scripts/render-icons.ts [--browser <path to chrome.exe or msedge.exe>]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const IMAGES = join(ROOT, 'assets', 'images');
const FASTLANE_IMAGES = join(ROOT, 'fastlane', 'metadata', 'android', 'en-US', 'images');

const ICON_BACKGROUND = '#1F5FD6';
const LIGHT_MARK = '#1F6FEB';
const DARK_MARK = '#6EA8FE';
const WHITE = '#FFFFFF';

const PIPE_ANGLE = 17.6;
const PIPE = 'M -2.6 0 L 2.6 0 L 3.3 33 L 5.8 41 L -5.8 41 L -3.3 33 Z';
const HOLES = [12, 19.5, 27];

/** The mark on the 108 × 108 grid, inside the 66-unit safe circle of adaptive icons. */
function mark(color: string): string {
  const holes = HOLES.map((y) => `<circle cx="0" cy="${y}" r="1.55" fill="black"/>`).join('');
  const pipe = (x: number, angle: number) =>
    `<g transform="translate(${x} 39) rotate(${angle})">` +
    `<path d="${PIPE}" fill="white" stroke="white" stroke-width="1" stroke-linejoin="round"/>` +
    `${holes}</g>`;
  return (
    `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="108" height="108">` +
    `<rect x="49.5" y="30" width="9" height="11" rx="3" fill="white"/>` +
    `<rect x="52" y="25.5" width="4" height="6.5" rx="1.6" fill="white"/>` +
    `${pipe(52.4, PIPE_ANGLE)}${pipe(55.6, -PIPE_ANGLE)}</mask></defs>` +
    `<rect width="108" height="108" fill="${color}" mask="url(#m)"/>`
  );
}

type Render = {
  file: string;
  size: number;
  svg: string;
};

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="100%" height="100%">${body}</svg>`;

/** Legacy launcher icon: a circle, so it does not fill every pixel of its square. */
const legacyIcon = svg(
  `<circle cx="54" cy="54" r="52" fill="${ICON_BACKGROUND}"/>` +
    `<g transform="translate(54 54) scale(1.25) translate(-54 -54)">${mark(WHITE)}</g>`,
);

/** Splash images: the mark alone, enlarged to fill most of the square. */
const splash = (color: string) =>
  svg(`<g transform="translate(54 54) scale(1.45) translate(-54 -54)">${mark(color)}</g>`);

const RENDERS: Render[] = [
  { file: join(IMAGES, 'icon.png'), size: 1024, svg: legacyIcon },
  { file: join(IMAGES, 'android-icon-foreground.png'), size: 1024, svg: svg(mark(WHITE)) },
  { file: join(IMAGES, 'android-icon-monochrome.png'), size: 1024, svg: svg(mark(WHITE)) },
  { file: join(IMAGES, 'splash-icon.png'), size: 1024, svg: splash(LIGHT_MARK) },
  { file: join(IMAGES, 'splash-icon-dark.png'), size: 1024, svg: splash(DARK_MARK) },
  { file: join(FASTLANE_IMAGES, 'icon.png'), size: 512, svg: legacyIcon },
];

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findBrowser(): string {
  const flag = process.argv.indexOf('--browser');
  const explicit = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (explicit) return explicit;
  const found = BROWSERS.find((path) => existsSync(path));
  if (!found) throw new Error('No Chrome or Edge found; pass --browser <path>.');
  return found;
}

function main(): void {
  const browser = findBrowser();
  const work = mkdtempSync(join(tmpdir(), 'aulos-icons-'));
  try {
    for (const render of RENDERS) {
      const page = join(work, 'page.html');
      writeFileSync(
        page,
        `<!doctype html><html><body style="margin:0;background:transparent">` +
          `<div style="width:${render.size}px;height:${render.size}px">${render.svg}</div></body></html>`,
      );
      mkdirSync(resolve(render.file, '..'), { recursive: true });
      execFileSync(
        browser,
        [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          '--default-background-color=00000000',
          `--window-size=${render.size},${render.size}`,
          `--user-data-dir=${join(work, 'profile')}`,
          `--screenshot=${render.file}`,
          `file:///${page.replace(/\\/g, '/')}`,
        ],
        { stdio: 'ignore' },
      );
      if (!existsSync(render.file)) throw new Error(`The browser wrote no ${render.file}`);
      console.log(`${render.file} (${render.size} px)`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
