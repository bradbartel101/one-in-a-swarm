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

test('total score, and an altitude curve that runs from the lawn to the edge of space', () => {
  const results = [{ points: 100 }, { points: 85 }, { points: 0 }, { points: 15 }];
  assert.equal(C.totalScore(results), 200);
  assert.equal(C.TOP_SCORE, 700);
  assert.equal(C.altitudeFeet(0), 0);
  assert.equal(C.altitudeFeet(C.TOP_SCORE), C.TOP_FEET, 'a perfect day reaches the Karman line');
  assert.equal(C.TOP_FEET, 328084);
  for (let s = 1; s <= 1000; s++) assert.ok(C.altitudeFeet(s) >= C.altitudeFeet(s - 1), 'altitude never falls as score rises, at ' + s);
  for (let s = 10; s <= 1000; s += 5) assert.ok(C.altitudeFeet(s) > C.altitudeFeet(s - 5), 'every answer gains altitude, at ' + s);
  assert.ok(C.altitudeFeet(10) < 20, 'one obvious answer barely leaves the lawn');
  const allCommon = C.altitudeFeet(70);
  assert.ok(allCommon > 1023 && allCommon < 1100, 'seven obvious answers just clear the tallest building in Atlanta: ' + allCommon);
  assert.ok(C.altitudeFeet(-5) === 0);
});

test('scoreForFeet is the inverse of altitudeFeet', () => {
  for (const s of [10, 70, 145, 286, 435, 700]) assert.ok(Math.abs(C.scoreForFeet(C.altitudeFeet(s)) - s) < 0.5, 'round trip at ' + s);
  assert.equal(Math.round(C.scoreForFeet(1023)), 70);
  assert.equal(Math.round(C.scoreForFeet(35000)), 286);
});

test('flight numbers count days since launch', () => {
  assert.equal(C.flightNumber(C.LAUNCH_DATE), 1);
  assert.equal(C.flightNumber('2026-10-09'), 2);
  assert.equal(C.flightNumber('2027-10-08'), 366);
});

test('lifetime stats: streaks, averages, and no double counting', () => {
  let s = C.recordFlight(null, '2026-10-08', 300);
  assert.deepEqual([s.played, s.total, s.best, s.streak], [1, 300, 300, 1]);
  assert.deepEqual(C.recordFlight(s, '2026-10-08', 300), s, 'the same day twice changes nothing');
  s = C.recordFlight(s, '2026-10-09', 500);
  assert.deepEqual([s.played, s.total, s.best, s.streak], [2, 800, 500, 2]);
  s = C.recordFlight(s, '2026-10-12', 100); // two days missed
  assert.deepEqual([s.played, s.total, s.best, s.streak], [3, 900, 500, 1]);
  assert.deepEqual(C.recordFlight(s, '2026-10-10', 700), s, 'an older date cannot be added afterwards');
  assert.equal(C.currentStreak(s, '2026-10-12'), 1);
  assert.equal(C.currentStreak(s, '2026-10-13'), 1, 'still alive the next day');
  assert.equal(C.currentStreak(s, '2026-10-14'), 0, 'gone after a missed day');
  assert.deepEqual(C.reviveStats(JSON.parse(JSON.stringify(s))), s);
  for (const bad of [null, 'x', { v: 1 }, Object.assign({}, s, { played: -1 }), Object.assign({}, s, { best: 9999 }), Object.assign({}, s, { streak: 99 }), Object.assign({}, s, { total: 1e7 }), Object.assign({}, s, { lastDate: 'soon' })]) {
    assert.equal(C.reviveStats(bad), null, JSON.stringify(bad));
  }
});

test('there are five bands and each boundary lands in the right one', () => {
  assert.equal(C.BANDS.length, 5);
  assert.equal(C.BANDS[0].min, 0);
  const name = (s) => C.bandFor(s).name;
  assert.equal(name(0), 'Still in the Hive');
  assert.equal(name(99), 'Still in the Hive');
  assert.equal(name(100), 'Clear of the Skyline');
  assert.equal(name(224), 'Clear of the Skyline');
  assert.equal(name(225), 'Above the Weather');
  assert.equal(name(374), 'Above the Weather');
  assert.equal(name(375), 'Stratosphere Bound');
  assert.equal(name(524), 'Stratosphere Bound');
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
  assert.equal(lines[0], 'One in a Swarm 🐝 Flight #1');
  assert.equal(lines[1], '⬜🟩🟧🟦🟪🐝⬛');
  assert.equal(Array.from(lines[1]).length, 7);
  assert.equal(lines[2], '300 pts · ' + C.formatNumber(C.altitudeFeet(300)) + ' ft up');
  assert.equal(lines[3], 'https://example.test/swarm/');
  assert.equal(lines.length, 4);
  assert.ok(!/SECRET/.test(text));
  assert.equal(C.shareText('2026-10-08', results).split('\n').length, 3);
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

test('every tier has its own label, points, quip and climb time', () => {
  const tiers = C.TIER_ORDER.map((t) => C.TIERS[t]);
  assert.equal(new Set(tiers.map((t) => t.label)).size, 6);
  assert.equal(new Set(tiers.map((t) => t.quip)).size, 6);
  tiers.forEach((t) => assert.ok(t.quip.length > 15 && t.climbMs >= 2500 && t.climbMs <= 4000, t.label));
  for (let i = 1; i < tiers.length; i++) assert.ok(tiers[i].climbMs > tiers[i - 1].climbMs, 'rarer answers climb for longer');
});
