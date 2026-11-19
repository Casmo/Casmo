// Clip scenario: Spaceshooter 3 (TypeScript, PixiJS), https://casmo.itch.io/spaceshooter-3
// Recorded from the itch.io HTML build (the iframe source of the itch page). Scripted input like a
// player: click Start, hold the left button to fire, and steer with relative mouse movement.
//   node scripts/record-clip.mjs scripts/clips/spaceshooter.mjs /tmp/clip-frames/spaceshooter
//   XFADE_FRAMES=30 CROP=864:540:48:20 scripts/encode-clip.sh /tmp/clip-frames/spaceshooter images/spaceshooter.webp
//
// The game steers from pointer-lock movementX/Y on window mousemove events. Headless Chromium grants
// the lock, but Playwright's mouse.move gives no useful movement deltas, so steering dispatches
// mousemove events with movementX/Y set. The path is a figure-eight that returns to where it started.

const WARMUP_S = Number(process.env.SS_WARMUP ?? 45); // game seconds played before capture, so a busy wave is on screen
const LOOP = 270; // frames: 4 s Clip + 30 crossfade frames

/** Steering delta (px) for step i of a figure-eight with period `period` steps. */
function delta(i, period, rx = 9, ry = 4) {
  const a = (2 * Math.PI * i) / period;
  return [rx * Math.cos(a), ry * 2 * Math.cos(2 * a)];
}

const steer = (page, dx, dy) =>
  page.evaluate(([dx, dy]) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true })), [dx, dy]);

export default {
  url: 'https://html-classic.itch.zone/html/18045392-1887793/index.html',
  viewport: { width: 960, height: 600 },
  fps: 60,
  frames: LOOP,

  async setup({ page, clock }) {
    await page.waitForSelector('canvas', { timeout: 60000 });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('loader')).display === 'none' || !document.getElementById('loader').offsetParent, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.mouse.click(480, 288); // "Start"
    await page.waitForTimeout(1500);
    await page.mouse.move(480, 400);
    await page.mouse.down(); // hold fire
    // Fast-forward on the virtual clock: step the game frame by frame (no screenshots) while
    // steering, much faster than playing in real time under the software renderer.
    await clock.pause();
    await page.evaluate(([frames, delta]) => {
      const d = new Function('return ' + delta)();
      for (let i = 0; i < frames; i++) {
        const [dx, dy] = d(i, 90);
        window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
        window.__clock.step(1000 / 60);
      }
    }, [WARMUP_S * 60, delta.toString()]);
  },

  async onFrame({ page, frame }) {
    const [dx, dy] = delta(frame, 120, 6, 3); // figure-eights, 2 s each, so the crossfaded 4 s loop ends where it began
    await steer(page, dx, dy);
  },
};
