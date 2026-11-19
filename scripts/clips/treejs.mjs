// Clip scenario: tree.js (procedural trees, Three.js / WebGPU), https://mathieuderuiter.nl/tree.js/
// The Tree Editor's Season slider runs once around the year (0 -> 1, where 1 looks like 0) while
// the preview wind sways the tree. The editor sidebar is hidden; only the preview shows.
//   node scripts/record-clip.mjs scripts/clips/treejs.mjs /tmp/clip-frames/treejs
//   XFADE_FRAMES=30 CROP=880:550:40:0 QUALITY=92 scripts/encode-clip.sh /tmp/clip-frames/treejs images/treejs.webp
// The wind matters for the encode too: libwebp merges identical frames into one long frame (the
// bare winter tree would become a single 1 s frame), and moving leaves keep every frame distinct.
// The 30 extra frames repeat the start of the year; the crossfade blends them over the first 30, so
// the wind sway loops without a jump too.
//
// Headless Chromium only has SwiftShader, whose WebGPU adapter fails ("Instance dropped"), so
// navigator.gpu is hidden and three.js' WebGPURenderer falls back to its WebGL2 backend.

const YEAR = 240; // frames per season cycle: 4 s at 60fps
const WIND = process.env.TREE_WIND ?? '0.6'; // Preview wind strength, 0-2
const STYLE = process.env.TREE_STYLE || 'Low-poly'; // Low-poly | Stylized | Realistic
const ZOOM_STEPS = Number(process.env.TREE_ZOOM ?? 3); // mouse wheel notches towards the tree
const SPECIES = process.env.TREE_SPECIES || 'Generic broadleaf';

const setRange = (page, id, value) =>
  page.evaluate(([id, value]) => {
    const i = document.getElementById(id);
    i.step = 'any'; // the slider snaps to 0.01; finer steps keep the colour change smooth at 60fps
    i.value = value;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);

export default {
  url: 'https://mathieuderuiter.nl/tree.js/',
  viewport: { width: 960, height: 600 },
  fps: 60,
  frames: YEAR + 30, // + 30 for the loop crossfade

  initScript: () => {
    Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined });
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '#sidebar { display: none !important; } #preview { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; }';
      document.head.appendChild(style);
    });
  },

  async setup({ page }) {
    await page.waitForSelector('#preview canvas', { timeout: 60000 });
    // The sidebar is hidden, so pick the Start from options through the DOM. Each change loads
    // asynchronously (and the species resets the style), so set them one after the other.
    for (const [n, label] of [[0, SPECIES], [1, STYLE]]) {
      await page.evaluate(([n, label]) => {
        const sel = document.querySelectorAll('#sidebar select')[n];
        sel.value = [...sel.options].find((o) => o.text === label).value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, [n, label]);
      await page.waitForTimeout(3000);
    }
    // Zoom the orbit camera in so the tree fills the tile.
    await page.mouse.move(480, 300);
    for (let i = 0; i < ZOOM_STEPS; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(50); }
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await setRange(page, 'season', 0);
    await setRange(page, 'wind-strength', WIND);
    await page.waitForTimeout(4000);
  },

  async onFrame({ page, frame }) {
    await setRange(page, 'season', ((frame % YEAR) / YEAR).toFixed(4));
  },
};
