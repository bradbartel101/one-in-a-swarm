'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

test('tier points match the spec', () => {
  assert.deepEqual(
    C.TIER_ORDER.map((t) => [C.TIERS[t].label, C.TIERS[t].points]),
    [['Common', 10], ['Too Clever', 15], ['Solid', 30], ['Rare', 60], ['Deep Cut', 85], ['One in a Swarm', 100]]
  );
  assert.equal(C.tierPoints('nonsense'), 0);
  assert.equal(C.tierPoints(null), 0);
});

test('infinite-mode time bonuses match the spec', () => {
  const secs = (t) => C.TIERS[t].bonusMs / 1000;
  assert.deepEqual(['swarm', 'deep', 'rare', 'solid', 'clever', 'common'].map(secs), [16, 12, 10, 9, 8, 8]);
});

test('total score and altitude (1 pt = 4 ft)', () => {
  const results = [{ points: 100 }, { points: 85 }, { points: 0 }, { points: 15 }];
  assert.equal(C.totalScore(results), 200);
  assert.equal(C.altitudeFeet(200), 800);
  assert.equal(C.altitudeFeet(0), 0);
  assert.equal(C.MAX_DAILY_SCORE, 700);
  assert.equal(C.altitudeFeet(C.MAX_DAILY_SCORE), 2800);
});

test('there are five bands and each boundary lands in the right one', () => {
  assert.equal(C.BANDS.length, 5);
  assert.equal(C.BANDS[0].min, 0);
  const name = (s) => C.bandFor(s).name;
  assert.equal(name(0), 'Still in the Hive');
  assert.equal(name(99), 'Still in the Hive');
  assert.equal(name(100), 'Skimming Tech Green');
  assert.equal(name(224), 'Skimming Tech Green');
  assert.equal(name(225), 'Clearing the Campanile');
  assert.equal(name(374), 'Clearing the Campanile');
  assert.equal(name(375), 'Over the Midtown Skyline');
  assert.equal(name(524), 'Over the Midtown Skyline');
  assert.equal(name(525), 'Helluva Engineer');
  assert.equal(name(700), 'Helluva Engineer');
  for (let i = 1; i < C.BANDS.length; i++) assert.ok(C.BANDS[i].min > C.BANDS[i - 1].min);
});

test('all-common and all-swarm days land in the bottom and top bands', () => {
  assert.equal(C.bandFor(7 * 10), C.BANDS[0]);
  assert.equal(C.bandFor(7 * 100), C.BANDS[4]);
});

test('share text: one emoji per round, no answers, correct maths', () => {
  const results = [
    { tier: 'common', points: 10, answer: 'SECRET-A' },
    { tier: 'clever', points: 15, answer: 'SECRET-B' },
    { tier: 'solid', points: 30, answer: 'SECRET-C' },
    { tier: 'rare', points: 60, answer: 'SECRET-D' },
    { tier: 'deep', points: 85, answer: 'SECRET-E' },
    { tier: 'swarm', points: 100, answer: 'SECRET-F' },
    { tier: null, points: 0, answer: null },
  ];
  const text = C.shareText('2026-10-08', results, 'https://example.test/swarm/');
  const lines = text.split('\n');
  assert.equal(lines[0], 'One in a Swarm 🐝 2026-10-08');
  assert.equal(lines[1], '⬜🟨🟧🟦🟪🐝⬛');
  assert.equal(Array.from(lines[1]).length, 7);
  assert.equal(lines[2], '300 pts · 1,200 ft above Tech Tower');
  assert.equal(lines[3], 'Clearing the Campanile');
  assert.equal(lines[4], 'https://example.test/swarm/');
  assert.ok(!/SECRET/.test(text));
  assert.equal(C.shareText('2026-10-08', results).split('\n').length, 4);
});

test('every tier has its own emoji', () => {
  const emojis = C.TIER_ORDER.map((t) => C.TIERS[t].emoji).concat(C.MISS_EMOJI);
  assert.equal(new Set(emojis).size, 7);
});

test('number formatting', () => {
  assert.equal(C.formatNumber(0), '0');
  assert.equal(C.formatNumber(999), '999');
  assert.equal(C.formatNumber(2800), '2,800');
  assert.equal(C.formatNumber(1234567), '1,234,567');
});
