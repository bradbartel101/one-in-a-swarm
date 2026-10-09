'use strict';
/* WCAG 2.x contrast, computed from the colour tokens in css/style.css. The game has one theme.
   Text pairs must reach 4.5:1 (AA, normal text). Interface edges must reach 3:1 (AA, non-text). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const root = css.slice(css.indexOf(':root'), css.indexOf('*, *::before'));
const t = {};
for (const m of root.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) t[m[1]] = m[2];

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = [
  ['--ink', '--panel'], ['--ink', '--panel-2'], ['--ink', '--navy'],
  ['--muted', '--panel'], ['--muted', '--panel-2'],
  ['--accent', '--panel'], ['--accent', '--navy'], // pixel headings, eyebrows
  ['--accent-ink', '--accent'], // buttons, the answer tag
  ['--accent-ink', '--ink'], // text typed into the answer box
  ['--bad', '--panel'], ['--good', '--panel'],
  ['--tier-ink', '--t-common'], ['--tier-ink', '--t-clever'], ['--tier-ink', '--t-solid'],
  ['--tier-ink', '--t-rare'], ['--tier-ink', '--t-deep'], ['--tier-ink', '--t-swarm'],
  ['--miss-ink', '--t-miss'],
  ['--t-common', '--panel'], ['--t-clever', '--panel'], ['--t-solid', '--panel'], ['--t-rare', '--panel'], ['--t-deep', '--panel'], // tier names on the reveal card
];
const EDGES = [
  ['--edge', '--panel'], // panel borders
  ['--accent', '--panel'], ['--accent', '--panel-2'], // focus ring, timer ring and bar on their tracks
  ['--accent-ink', '--accent'], // focus ring drawn inside a button
  ['--bad', '--panel-2'], // timer when low
];

test('text pairs meet WCAG AA 4.5:1', () => {
  TEXT.forEach(([fg, bg]) => {
    assert.ok(t[fg] && t[bg], 'missing token ' + fg + ' or ' + bg);
    const r = ratio(t[fg], t[bg]);
    assert.ok(r >= 4.5, fg + ' on ' + bg + ' is ' + r.toFixed(2) + ':1');
  });
});

test('borders, focus rings and the timer meet 3:1', () => {
  EDGES.forEach(([fg, bg]) => {
    const r = ratio(t[fg], t[bg]);
    assert.ok(r >= 3, fg + ' on ' + bg + ' is ' + r.toFixed(2) + ':1');
  });
});

test('Tech Gold and Navy are the exact brand values', () => {
  assert.equal(t['--gold'].toLowerCase(), '#b3a369');
  assert.equal(t['--navy'].toLowerCase(), '#003057');
});

test('the six tier colours stay apart for colour-blind players', () => {
  // Simulate deuteranopia and protanopia and require every pair to stay visibly different.
  // Colour is never the only cue (each tier also has a mark and a name); this guards the palette.
  const lin = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const sims = {
    deuteranopia: [[0.367, 0.861, -0.228], [0.280, 0.673, 0.047], [-0.012, 0.043, 0.969]],
    protanopia: [[0.152, 1.053, -0.205], [0.115, 0.786, 0.099], [-0.004, -0.048, 1.052]],
  };
  const tiers = ['--t-common', '--t-clever', '--t-solid', '--t-rare', '--t-deep', '--t-swarm'];
  Object.keys(sims).forEach((kind) => {
    const seen = tiers.map((k) => {
      const c = lin(t[k]);
      return sims[kind].map((row) => Math.max(0, Math.min(1, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
    });
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const d = Math.hypot(seen[i][0] - seen[j][0], seen[i][1] - seen[j][1], seen[i][2] - seen[j][2]);
        assert.ok(d > 0.07, kind + ': ' + tiers[i] + ' and ' + tiers[j] + ' are too close (' + d.toFixed(3) + ')');
      }
    }
  });
});
