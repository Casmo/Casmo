#!/usr/bin/env node
// Generates images/activity.svg: the Activity line (see GLOSSARY.md), one bar per year of
// GitHub contributions, 2010-2026. Static: run once by hand and commit the SVG.
//
// Run: node scripts/activity-svg.mjs        (uses the numbers below)
//      node scripts/activity-svg.mjs --gh   (re-queries contributionsCollection via `gh api graphql`)

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIRST = 2010;
const LAST = 2026;

// Total contributions per year (issue #1). 2026 is "so far".
let counts = {
  2010: 19, 2011: 0, 2012: 14, 2013: 38, 2014: 347, 2015: 305, 2016: 742, 2017: 823, 2018: 388,
  2019: 1300, 2020: 1755, 2021: 1281, 2022: 1102, 2023: 1315, 2024: 1461, 2025: 2059, 2026: 6213,
};

if (process.argv.includes('--gh')) {
  const fields = [];
  for (let y = FIRST; y <= LAST; y++)
    fields.push(`y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`);
  const query = `{ user(login: "Casmo") { ${fields.join(' ')} } }`;
  const user = JSON.parse(execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`], { encoding: 'utf8' })).data.user;
  counts = Object.fromEntries(Object.entries(user).map(([k, v]) => [k.slice(1), v.contributionCalendar.totalContributions]));
  console.log(counts);
}

// One mid grey-green that reads on both GitHub light (#ffffff) and dark (#0d1117) backgrounds.
const COLOUR = '#5f8f6f';
const W = 800, BAR_AREA = 80, LABEL = 16, H = BAR_AREA + LABEL;
const years = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);
const max = Math.max(...years.map((y) => counts[y]));
const slot = W / years.length;
const barW = Math.round(slot * 0.7 * 10) / 10;
const r1 = (n) => Math.round(n * 10) / 10;

const bars = years.map((y, i) => {
  const c = counts[y];
  const h = c === 0 ? 0 : Math.max(1, r1((c / max) * BAR_AREA));
  const x = r1(i * slot + (slot - barW) / 2);
  return `  <rect class="bar" data-year="${y}" x="${x}" y="${r1(BAR_AREA - h)}" width="${barW}" height="${h}" rx="2" fill="${COLOUR}"><title>${y}: ${c} contributions</title></rect>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub contributions per year, ${FIRST} to ${LAST}">
  <title>GitHub contributions per year, ${FIRST} to ${LAST}</title>
  <g>
${bars.join('\n')}
  </g>
  <g fill="${COLOUR}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="11">
    <text x="${r1(slot / 2)}" y="${H - 3}" text-anchor="middle">${FIRST}</text>
    <text x="${r1(W - slot / 2)}" y="${H - 3}" text-anchor="middle">${LAST}</text>
  </g>
</svg>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'images', 'activity.svg');
writeFileSync(out, svg);
console.log(`wrote ${out}`);
