// Captures the Website screenshots for the Web development section.
//
// Usage (from repo root; playwright is installed outside the repo):
//   NODE_PATH=/tmp/pw/node_modules node scripts/capture-websites.mjs
//
// Takes a 1440x900 desktop screenshot of each site with Playwright (dismissing cookie
// banners where present), then downscales it to 320px wide WebP with ffmpeg into images/.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = [
  ['https://ux.nl', 'ux.webp'],
  ['https://backstagephp.com', 'backstage.webp'],
  ['https://rocketeersapp.com', 'rocketeers.webp'],
];
const COOKIE_BUTTONS = /^(accept|accept all|allow all|agree|ok|got it|akkoord|accepteren|alles accepteren|alle cookies accepteren)$/i;

const tmp = mkdtempSync(join(tmpdir(), 'capture-websites-'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const [url, file] of SITES) {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const button = page.getByRole('button', { name: COOKIE_BUTTONS }).first();
  if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
  await page.waitForTimeout(6000); // let entrance animations settle
  const png = join(tmp, file.replace(/\.webp$/, '.png'));
  await page.screenshot({ path: png });
  const out = join(root, 'images', file);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-vf', 'scale=320:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '92', out]);
  console.log(`${file}: ${statSync(out).size} bytes`);
}

await browser.close();
