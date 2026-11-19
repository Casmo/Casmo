#!/usr/bin/env node
// Record a browser game as a 60fps PNG frame sequence, for a Clip (see GLOSSARY.md, ADR 0001).
//
//   node scripts/record-clip.mjs scripts/clips/<scenario>.mjs [frames-dir]
//   scripts/encode-clip.sh <frames-dir> images/<name>.webp
//
// Needs the `playwright` npm package installed OUTSIDE the repo (default /tmp/pw, override with
// PLAYWRIGHT_DIR):  mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright
// Chromium comes from ~/.cache/ms-playwright (`npx playwright install chromium` if missing).
//
// How it gets real 60fps: headless screen recording (recordVideo, CDP screencast) runs at whatever
// speed the software GPU manages, often 15-30fps. Instead, an init script virtualises time in the
// page: performance.now, Date, requestAnimationFrame, setTimeout and setInterval all run on a
// virtual clock. During setup the clock follows real time ("live"), so scripted input plays
// normally. During capture the clock is paused and stepped exactly 1/fps per frame, with one
// screenshot per step. The game sees a perfect 60fps, however slow the capture is.
// Not virtualised: CSS animations/transitions, <video>, Web Workers (their replies just arrive "early").
//
// A scenario module default-exports:
//   { url, viewport: {width, height}, frames, fps = 60, initScript?: () => {}  (arrow function, runs
//     in the page before any page script), setup: async ({ page, clock }) => {}  (load, scripted input, warm-up),
//     onFrame?: async ({ page, clock, frame }) => {}  (optional scripted input during capture) }
// clock: live(), pause(), advance(ms) (stepped, no capture), now().

import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const [scenarioPath, outArg] = process.argv.slice(2);
if (!scenarioPath) {
  console.error('usage: node scripts/record-clip.mjs <scenario.mjs> [frames-dir]');
  process.exit(2);
}
const scenario = (await import(pathToFileURL(resolve(scenarioPath)).href)).default;
const outDir = resolve(outArg || join('/tmp/clip-frames', basename(scenarioPath, '.mjs')));
const fps = scenario.fps || 60;
const frames = Number(process.env.FRAMES) || scenario.frames; // FRAMES=5 for a quick test run

const pwDir = process.env.PLAYWRIGHT_DIR || '/tmp/pw';
const { chromium } = createRequire(join(pwDir, 'package.json'))('playwright');

/** Runs in the page before any page script: replaces the time sources with a virtual clock. */
function installVirtualClock() {
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeNow = performance.now.bind(performance);
  const NativeDate = Date;
  const epochAtZero = NativeDate.now() - nativeNow();
  let vt = nativeNow();
  let nextId = 1;
  const rafs = new Map();
  const timers = new Map();

  function step(dt) {
    const target = vt + dt;
    // Timers due within this step, in due order (intervals re-arm).
    for (;;) {
      let next = null;
      for (const t of timers.values()) if (t.due <= target && (!next || t.due < next.due)) next = t;
      if (!next) break;
      vt = Math.max(vt, next.due);
      if (next.interval != null) next.due += Math.max(next.interval, 1);
      else timers.delete(next.id);
      try { typeof next.fn === 'function' ? next.fn(...next.args) : (0, eval)(next.fn); } catch (e) { console.error(e); }
    }
    vt = target;
    const due = [...rafs.entries()];
    rafs.clear();
    for (const [, cb] of due) try { cb(vt); } catch (e) { console.error(e); }
  }

  let live = false;
  let last = 0;
  function pump() {
    if (!live) return;
    const now = nativeNow();
    step(Math.min(now - last, 100));
    last = now;
    nativeRAF(pump);
  }

  performance.now = () => vt;
  class VDate extends NativeDate {
    constructor(...a) { a.length ? super(...a) : super(epochAtZero + vt); }
    static now() { return Math.floor(epochAtZero + vt); }
  }
  window.Date = VDate;
  window.requestAnimationFrame = (cb) => { const id = nextId++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => rafs.delete(id);
  const addTimer = (interval) => (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { id, fn, args, due: vt + Math.max(+ms || 0, 0), interval: interval ? +ms || 0 : null });
    return id;
  };
  window.setTimeout = addTimer(false);
  window.setInterval = addTimer(true);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);

  window.__clock = {
    step,
    now: () => vt,
    live() { if (!live) { live = true; last = nativeNow(); nativeRAF(pump); } },
    pause() { live = false; },
    advance(ms, dt) { live = false; for (let t = 0; t < ms; t += dt) step(dt); },
  };
  window.__clock.live();
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.addInitScript(installVirtualClock);
  if (scenario.initScript) await page.addInitScript(scenario.initScript);

  const dt = 1000 / fps;
  const clock = {
    live: () => page.evaluate(() => window.__clock.live()),
    pause: () => page.evaluate(() => window.__clock.pause()),
    advance: (ms) => page.evaluate(([ms, dt]) => window.__clock.advance(ms, dt), [ms, dt]),
    now: () => page.evaluate(() => window.__clock.now()),
  };

  if (scenario.url) await page.goto(scenario.url, { waitUntil: 'load' });
  await scenario.setup({ page, clock });
  await clock.pause();

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const t0 = Date.now();
  for (let frame = 0; frame < frames; frame++) {
    if (scenario.onFrame) await scenario.onFrame({ page, clock, frame });
    await page.evaluate((dt) => window.__clock.step(dt), dt);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `frame-${String(frame).padStart(5, '0')}.png`), Buffer.from(data, 'base64'));
  }
  console.log(`${frames} frames at ${fps}fps -> ${outDir} (${((Date.now() - t0) / 1000).toFixed(1)}s wall time)`);
} finally {
  await browser.close();
}
