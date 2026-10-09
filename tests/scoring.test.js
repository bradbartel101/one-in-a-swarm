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

test('total score, and one altitude curve from the lawn to the Moon', () => {
  const results = [{ points: 100 }, { points: 85 }, { points: 0 }, { points: 15 }];
  assert.equal(C.totalScore(results), 200);
  assert.equal(C.TOP_SCORE, 700);
  // the brief's anchors
  assert.equal(C.altitudeFeet(0), 0);
  assert.equal(C.altitudeFeet(150), 10000);
  assert.equal(C.altitudeFeet(350), 40000);
  assert.equal(C.altitudeFeet(550), 328084, 'the edge of space, 100 km');
  assert.equal(C.altitudeFeet(700), 238855 * 5280, 'the Moon');
  assert.equal(C.altitudeText(700), '238,855 mi');
  assert.equal(C.altitudeFeet(-5), 0);
  // smooth and monotonic: it always rises, and never jumps
  let prev = 0;
  for (let s = 0.5; s <= 1200; s += 0.5) {
    const ft = C.altitudeFeet(s);
    assert.ok(ft > prev, 'altitude rises at ' + s);
    if (s > 20) assert.ok(ft / prev < 1.06, 'no jump at ' + s + ': ' + prev + ' -> ' + ft);
    prev = ft;
  }
  // where the zones begin
  assert.ok(C.altitudeFeet(40) > 100 && C.altitudeFeet(40) < 150, 'treetop height leaving campus');
  assert.ok(C.altitudeFeet(105) > 900 && C.altitudeFeet(110) < 1300, 'the skyline tops out near 1,000 ft');
  assert.ok(C.altitudeFeet(700) < C.altitudeFeet(701), 'infinite mode keeps climbing past the Moon');
});

test('altitude text switches from feet to miles so it always fits the HUD', () => {
  assert.deepEqual(C.altitudeParts(0), { value: '0', unit: 'ft' });
  assert.deepEqual(C.altitudeParts(150), { value: '10,000', unit: 'ft' });
  assert.deepEqual(C.altitudeParts(550), { value: '328,084', unit: 'ft' });
  assert.equal(C.altitudeParts(600).unit, 'mi');
  for (let s = 0; s <= 3100; s += 7) assert.ok(C.altitudeText(s).length <= 10, 'fits at ' + s + ': ' + C.altitudeText(s));
});

test('scoreForFeet is the inverse of altitudeFeet', () => {
  for (const s of [10, 70, 145, 286, 435, 560, 700]) assert.ok(Math.abs(C.scoreForFeet(C.altitudeFeet(s)) - s) < 0.5, 'round trip at ' + s);
  assert.ok(C.scoreForFeet(1023) > 95 && C.scoreForFeet(1023) < 110, 'the tallest building in Atlanta sits in the skyline zone');
  assert.ok(C.scoreForFeet(35000) > 300 && C.scoreForFeet(35000) < 350, 'airliners cruise in the high sky');
  assert.ok(C.scoreForFeet(250 * 5280) > 550 && C.scoreForFeet(250 * 5280) < 650, 'low Earth orbit is in the space zone');
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
  assert.equal(lines[2], '300 pts · ' + C.altitudeText(300) + ' up');
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
