// Clip scenario: Tower Defense (Three.js), https://casmo.itch.io/threejs-tower-defense
// Recorded from the web build on couchfriends.com. Scripted input: real mouse clicks on tiles and
// key presses (1/2/3 build a tower on the selected tile, E spawns an enemy), like a player would.
//   node scripts/record-clip.mjs scripts/clips/tower-defense.mjs /tmp/clip-frames/tower-defense
//   XFADE_FRAMES=30 scripts/encode-clip.sh /tmp/clip-frames/tower-defense images/tower-defense.webp

const SPAWN_EVERY = 24; // frames between enemies (keeps the stream of enemies steady, so the loop is near-seamless)

// [gridX, gridY, towerKey]: the path runs from tile (0,0) to (10,10); towers line it on both sides.
const TOWERS = [
  [3, 1, '1'], [4, 3, '1'], [3, 5, '2'], [6, 5, '1'], [5, 7, '1'],
  [8, 6, '2'], [7, 9, '3'], [9, 8, '1'],
];

/** Screen position (CSS px) of the centre of a grid tile. */
const tileOnScreen = (page, x, y) =>
  page.evaluate(([x, y]) => {
    const td = window.TowerDefense;
    const v = td.grid[x][y].object.position.clone();
    td.projector.projectVector(v, td.camera);
    return { x: ((v.x + 1) / 2) * td.gameWidth, y: ((1 - v.y) / 2) * td.gameHeight };
  }, [x, y]);

export default {
  url: 'https://couchfriends.com/src/games/tower-defense/index.html',
  viewport: { width: 960, height: 600 },
  fps: 60,
  frames: 270, // 4 s loop + 30 frames used for the crossfade

  initScript: () => {
    // The game's Object.observe polyfill adds an enumerable Object.prototype.observe, which leaks
    // into three.js shader #defines and breaks every shader. A no-op Object.observe skips it.
    Object.observe = function () {};
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.navbar-fixed-top, .game-ui, .navbar-fixed-bottom, #loading-container { display: none !important; }';
      document.head.appendChild(style);
    });
  },

  async setup({ page, clock }) {
    await page.click('text=Play');
    await page.click('text=Play level 1');
    await page.waitForFunction(() => window.TowerDefense.currentLevel.waves && window.TowerDefense.camera.position, null, { timeout: 60000 });
    // Frame the board a bit tighter than the game's default camera.
    await page.evaluate(() => {
      const c = window.TowerDefense.camera;
      c.position.set(c.position.x * 0.7, c.position.y * 0.7, c.position.z * 0.7);
      c.lookAt(new c.position.constructor(-12, -4, 0));
    });
    for (const [x, y, key] of TOWERS) {
      const p = await tileOnScreen(page, x, y);
      await page.mouse.click(p.x, p.y);
      await page.keyboard.press(key);
      await page.waitForTimeout(250); // the path-finding worker approves the build
    }
    // Warm up: a steady stream of enemies walking the path under fire.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('e');
      await clock.advance(SPAWN_EVERY * (1000 / 60));
      await page.waitForTimeout(30);
    }
  },

  async onFrame({ page, frame }) {
    if (frame % SPAWN_EVERY === 0) await page.keyboard.press('e');
  },
};
