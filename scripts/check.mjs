#!/usr/bin/env node
// Check script for the Profile README (see GLOSSARY.md and issue #1, "Testing Decisions").
// The seam under test is the finished README.md plus the images/ folder: what a visitor sees.
//
// Run: node scripts/check.mjs   (needs `gh` logged in for the repository-name check)
//
// Extending: add a new `check('name', () => { ... })` block below. Throw (or call fail())
// with a clear message when the check fails. Use the helpers (readme, section(), images(),
// imageRefs(), sh()) rather than re-parsing the README.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const imagesDir = join(root, 'images');
const IMAGE_URL_PREFIX = 'https://raw.githubusercontent.com/casmo/casmo/master/images/';

// ---------- helpers ----------

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Text of a "## <heading>" section, up to the next "## " heading or the "---" before the Contact footer. */
function section(heading) {
  const start = readme.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`README has no "## ${heading}" section`);
  const rest = readme.slice(start + heading.length + 5);
  const end = rest.search(/\n(## |---\n)/);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Every image source referenced in the README (HTML <img src> and markdown ![](...)). */
function imageRefs() {
  const html = [...readme.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]);
  const md = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]);
  return [...html, ...md];
}

/** Map an image reference to its file name in images/, or null if it does not point there. */
function imageFile(ref) {
  if (ref.startsWith(IMAGE_URL_PREFIX)) return ref.slice(IMAGE_URL_PREFIX.length);
  if (ref.startsWith('images/')) return ref.slice('images/'.length);
  return null;
}

const images = () => (existsSync(imagesDir) ? readdirSync(imagesDir) : []);
const fileSize = (name) => statSync(join(imagesDir, name)).size;
const stripTags = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ---------- runner ----------

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push([true, name]);
  } catch (e) {
    results.push([false, name, e.message]);
  }
}
const fail = (msg) => { throw new Error(msg); };

// ---------- checks: README structure (ticket #2) ----------

check('README has Intro, Games, Web development, Contact footer in that order', () => {
  const marks = [
    ["Intro opener \"Hi, I'm Mathieu, aka Casmo\"", readme.indexOf("Hi, I'm Mathieu, aka Casmo")],
    ['"## Games" heading', readme.indexOf('\n## Games\n')],
    ['"## Web development" heading', readme.indexOf('\n## Web development\n')],
    ['Contact footer', readme.indexOf('Blog: [mathieuderuiter.nl]')],
  ];
  for (const [label, i] of marks) if (i < 0) fail(`missing ${label}`);
  for (let i = 1; i < marks.length; i++)
    if (marks[i][1] < marks[i - 1][1]) fail(`${marks[i][0]} comes before ${marks[i - 1][0]}`);
});

// Independent source of truth: the tile list from the spec (issue #1).
const GAME_TILES = [
  ['https://store.steampowered.com/app/3628790/Kabonk/', 'Kabonk! — Unreal Engine 5, on Steam'],
  ['https://store.steampowered.com/app/5467940', 'Fernweh — Three.js, coming to Steam'],
  ['https://store.steampowered.com/app/5096670', 'Dyneria — custom Rust/wgpu engine, coming to Steam'],
  [null, 'Bonk! — Godot, in development'],
  ['https://mathieuderuiter.nl/tree.js/', 'tree.js — procedural trees, Three.js / WebGPU'],
  ['https://casmo.itch.io/spaceshooter-3', 'Spaceshooter — TypeScript, PixiJS'],
  ['https://couchfriends.com', 'Couchfriends — phone-as-controller party games, open source'],
  ['https://casmo.itch.io/threejs-tower-defense', 'Tower Defense — Three.js'],
];

/** Game tiles: one per <td> in the Games section, with its links, caption text and image refs. */
function gameTiles() {
  return [...section('Games').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => ({
    html: m[1],
    caption: stripTags(m[1]),
    links: [...new Set([...m[1].matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((a) => a[1]))],
    imgs: [...m[1].matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((a) => a[1]),
  }));
}

check('Games section has the 8 Game tiles in spec order with spec links and captions', () => {
  const tiles = gameTiles();
  if (tiles.length !== GAME_TILES.length) fail(`expected ${GAME_TILES.length} tiles, found ${tiles.length}`);
  GAME_TILES.forEach(([link, caption], i) => {
    const t = tiles[i];
    if (t.caption !== caption) fail(`tile ${i + 1}: caption "${t.caption}", expected "${caption}"`);
    const want = link ? [link] : [];
    if (t.links.join() !== want.join()) fail(`tile ${i + 1} (${caption}): links ${JSON.stringify(t.links)}, expected ${JSON.stringify(want)}`);
  });
});

check('Games section rows have 3 tiles (last row may be shorter)', () => {
  const rows = [...section('Games').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => (m[1].match(/<td\b/g) || []).length);
  rows.forEach((n, i) => {
    if (n > 3 || (n < 3 && i !== rows.length - 1)) fail(`row ${i + 1} has ${n} tiles: ${JSON.stringify(rows)}`);
  });
});

check('Web development section has the spec Timeline, open source line and organisations line', () => {
  const text = section('Web development');
  const timeline = [...text.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1].trim());
  const want = [
    'PHP and CakePHP: browser game engine, contributor to CakePHP and its docs.',
    'HTML5 and Node.js: Three.js / PixiJS, WebSocket multiplayer, early TypeScript adopter; founded Couchfriends (open source).',
    'Client platforms: CMS/CRM builds, Angular, tools for a tabletop RPG community (GoblinWorkshop).',
    'Laravel at UX: large Laravel platforms (50M+ requests/month), Vue, React, Tailwind; SaaS products Rocketeers and Cloudoe.',
    'Now: Filament and Backstage CMS (open source), plus AI agent tooling.',
  ];
  if (JSON.stringify(timeline) !== JSON.stringify(want)) fail(`Timeline is ${JSON.stringify(timeline, null, 1)}`);
  if (/\b(19|20)\d\d\b/.test(timeline.join(' '))) fail('Timeline contains a year');
  for (const line of [
    'Open source contributions to: Laravel, CakePHP, Filament, Laravel Scout, Laravel Actions, PixiJS, Mailgun PHP',
    'Organisations: UX, Couchfriends, Spark of Chaos, Backstage, Rocketeers, Cloudoe',
  ]) if (!text.includes(line)) fail(`missing line "${line}"`);
});

check('Contact footer matches the spec', () => {
  const footer =
    'Blog: [mathieuderuiter.nl](https://mathieuderuiter.nl) · ' +
    'LinkedIn: [linkedin.com/in/mathieuderuiter](https://www.linkedin.com/in/mathieuderuiter/) · ' +
    'Spark of Chaos: [sparkofchaos.com](https://sparkofchaos.com)';
  if (readme.trimEnd().split('\n').at(-1) !== footer) fail('last line of README is not the Contact footer');
});

// ---------- checks: media and content rules ----------

check('every image referenced in the README exists in images/', () => {
  const bad = imageRefs().filter((ref) => {
    const f = imageFile(ref);
    return !f || !existsSync(join(imagesDir, f));
  });
  if (bad.length) fail(`missing or not in images/: ${bad.join(', ')}`);
});

check('README contains no emoji', () => {
  const found = readme.match(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu);
  if (found) fail(`emoji found: ${[...new Set(found)].join(' ')}`);
});

// Repository names that are also organisation names, open source project names, technology
// names, websites or plain words. The spec allows these in the Web development section.
const ALLOWED_NAMES = new Set([
  'ux', 'couchfriends', 'rocketeers', 'backstage', 'cloudoe', 'goblinworkshop', 'spark of chaos',
  'laravel', 'cakephp', 'filament', 'scout', 'pixijs', 'php', 'ai', 'docs', 'cms', 'crm', 'api', 'app',
  'agents', 'tools', 'core', 'games', 'controller', 'server', 'social', 'front', 'stats', 'forms',
  'media', 'fields', 'users', 'support', 'shop', 'demo', 'admin', 'explore', 'skills', 'stage',
  'rocket', 'ship', 'ok', 'slim', 'sonar', 'dash', 'teller', 'inbox', 'webmail', 'grip', 'ads',
  'ux.nl', 'backstagephp.com', 'couchfriends.github.io',
]);

check('Web development section contains no repository names', () => {
  const owners = ['Casmo', ...sh('gh', ['api', 'user/orgs', '-q', '.[].login']).split('\n').filter(Boolean)];
  const repos = new Set();
  for (const owner of owners)
    for (const n of sh('gh', ['repo', 'list', owner, '--limit', '2000', '--json', 'name', '-q', '.[].name']).split('\n'))
      if (n) repos.add(n);
  // Visible text only: link targets and image URLs are not text a visitor reads.
  const text = stripTags(section('Web development').replace(/\]\([^)]*\)/g, ']')).toLowerCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [...repos].filter((name) => {
    const n = name.toLowerCase();
    return !ALLOWED_NAMES.has(n) && new RegExp(`(?<![\\w-])${esc(n)}(?![\\w-]|\\.\\w)`).test(text);
  });
  if (hits.length) fail(`repository names found: ${hits.join(', ')} (add to ALLOWED_NAMES only if it is an organisation, open source project or plain word)`);
});

check('old GIFs are gone', () => {
  const old = ['kabonk-game.gif', 'couchfriends-opensource-games.gif', 'vormkracht10.gif'];
  const left = old.filter((f) => existsSync(join(imagesDir, f)) || readme.includes(f));
  if (left.length) fail(`still present or referenced: ${left.join(', ')}`);
});

check('Web development section has 3 linked website screenshots (WebP, ~320px wide, under 200 KB) with captions', () => {
  const sites = [
    ['https://ux.nl', 'ux.webp'],
    ['https://backstagephp.com', 'backstage.webp'],
    ['https://rocketeersapp.com', 'rocketeers.webp'],
  ];
  const cells = section('Web development').match(/<td[\s\S]*?<\/td>/g) || [];
  for (const [url, file] of sites) {
    const cell = cells.find((c) => c.includes(IMAGE_URL_PREFIX + file));
    if (!cell) fail(`no table cell with ${file}`);
    if (!new RegExp(`<a href="${url}/?"><img [^>]*${file}"`).test(cell)) fail(`${file} is not linked to ${url}`);
    if (!stripTags(cell)) fail(`${file} has no caption`);
    if (!images().includes(file)) fail(`images/${file} missing`);
    const buf = readFileSync(join(imagesDir, file));
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') fail(`${file} is not a WebP`);
    if (fileSize(file) >= 200 * 1024) fail(`${file} is ${fileSize(file)} bytes, must be under 200 KB`);
    const width = Number(sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', join(imagesDir, file)]).trim());
    if (width < 300 || width > 340) fail(`${file} is ${width}px wide, expected about 320px`);
  }
});

// ---------- checks: Activity line (ticket #6) ----------

check('Activity line is a valid SVG with 17 one-colour bars (2010-2026), shown in Web development', () => {
  const ref = [...section('Web development').matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
    .find((r) => imageFile(r) === 'activity.svg');
  if (!ref) fail('Web development section does not show images/activity.svg');
  if (!ref.startsWith(IMAGE_URL_PREFIX)) fail(`activity.svg not referenced through ${IMAGE_URL_PREFIX}`);
  const file = join(imagesDir, 'activity.svg');
  if (!existsSync(file)) fail('images/activity.svg missing');
  const svg = readFileSync(file, 'utf8');
  // Well-formedness: one <svg> root in the SVG namespace, every element closed in order.
  if (!/^\s*(<\?xml[^>]*\?>\s*)?<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) fail('root is not <svg xmlns="http://www.w3.org/2000/svg">');
  if (!/<\/svg>\s*$/.test(svg)) fail('does not end with </svg>');
  const stack = [];
  for (const [, close, name, selfClose] of svg.replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([\w:-]+)(?:"[^"]*"|'[^']*'|[^>"'])*?(\/?)>/g)) {
    if (close) { if (stack.pop() !== name) fail(`unbalanced </${name}>`); }
    else if (!selfClose) stack.push(name);
  }
  if (stack.length) fail(`unclosed <${stack.join('>, <')}>`);
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(svg)) fail('unescaped &');
  const bars = [...svg.matchAll(/<rect\b[^>]*\bclass="bar"[^>]*>/g)].map((m) => ({
    year: Number(m[0].match(/data-year="(\d+)"/)?.[1]),
    height: Number(m[0].match(/\bheight="([\d.]+)"/)?.[1]),
    fill: m[0].match(/\bfill="([^"]+)"/)?.[1] ?? svg.match(/\.bar\s*\{[^}]*fill:\s*([^;}\s]+)/)?.[1],
  }));
  if (bars.length !== 17) fail(`expected 17 bars, found ${bars.length}`);
  const years = bars.map((b) => b.year).join();
  if (years !== Array.from({ length: 17 }, (_, i) => 2010 + i).join()) fail(`bar years ${years}`);
  const fills = new Set(bars.map((b) => b.fill));
  if (fills.size !== 1 || !bars[0].fill) fail(`bars must share one colour, found ${[...fills].join(', ')}`);
  if (bars.some((b) => !(b.height >= 0))) fail('bar without a valid height');
  // Spec data: 2026 (6213) is the busiest year, 2011 (0) the quietest.
  const tallest = bars.reduce((a, b) => (b.height > a.height ? b : a));
  const lowest = bars.reduce((a, b) => (b.height < a.height ? b : a));
  if (tallest.year !== 2026 || lowest.year !== 2011) fail(`tallest bar ${tallest.year}, lowest ${lowest.year}; expected 2026 and 2011`);
});

// ---------- report ----------

for (const [ok, name, msg] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${msg}`}`);
const failed = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
