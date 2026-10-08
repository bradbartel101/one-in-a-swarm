'use strict';
/* WCAG 2.x contrast, computed from the colour tokens in css/style.css.
   Text pairs must reach 4.5:1 (AA, normal text). Interface edges must reach 3:1 (AA, non-text). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

function tokens(block) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2];
  return out;
}

const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('@media (prefers-color-scheme: dark)'));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const darkBlock = css.slice(darkStart, css.indexOf('*, *::before', darkStart));
const light = tokens(rootBlock);
const dark = Object.assign({}, light, tokens(darkBlock));

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = [
  ['--ink', '--bg'], ['--ink', '--surface'],
  ['--muted', '--bg'], ['--muted', '--surface'],
  ['--gold-ink', '--bg'], ['--gold-ink', '--surface'],
  ['--bad', '--bg'], ['--bad', '--surface'],
  ['--good', '--bg'], ['--good', '--surface'],
  ['--primary-ink', '--primary-bg'],
  ['--navy', '--gold'], // gold button, swarm badge
  ['--chip-ink', '--navy'], // altitude and zone labels over the sky
  ['--t-common-ink', '--t-common-bg'], ['--t-clever-ink', '--t-clever-bg'], ['--t-solid-ink', '--t-solid-bg'],
  ['--t-rare-ink', '--t-rare-bg'], ['--t-deep-ink', '--t-deep-bg'], ['--t-swarm-ink', '--t-swarm-bg'], ['--t-miss-ink', '--t-miss-bg'],
];
const EDGES = [
  ['--edge', '--bg'], ['--edge', '--surface'], // input and button borders
  ['--focus', '--bg'], ['--focus', '--surface'], // focus ring
  ['--ink', '--line'], // timer bar fill on its track
  ['--bad', '--line'], // timer bar when low
];

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  test(name + ' theme: text pairs meet WCAG AA 4.5:1', () => {
    TEXT.forEach(([fg, bg]) => {
      assert.ok(theme[fg] && theme[bg], 'missing token ' + fg + ' or ' + bg);
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= 4.5, name + ' ' + fg + ' on ' + bg + ' is ' + r.toFixed(2) + ':1');
    });
  });
  test(name + ' theme: borders, focus ring and timer bar meet 3:1', () => {
    EDGES.forEach(([fg, bg]) => {
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= 3, name + ' ' + fg + ' on ' + bg + ' is ' + r.toFixed(2) + ':1');
    });
  });
}

test('Tech Gold and Navy are the exact brand values', () => {
  assert.equal(light['--gold'].toLowerCase(), '#b3a369');
  assert.equal(light['--navy'].toLowerCase(), '#003057');
});

test('raw Tech Gold is not used as a text colour on the light background', () => {
  // Documents why --gold-ink exists: this pair fails AA.
  assert.ok(ratio(light['--gold'], light['--bg']) < 4.5);
});
