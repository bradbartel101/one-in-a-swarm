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

test('every tier has its own label, points and quip', () => {
  const tiers = C.TIER_ORDER.map((t) => C.TIERS[t]);
  assert.equal(new Set(tiers.map((t) => t.label)).size, 6);
  assert.equal(new Set(tiers.map((t) => t.quip)).size, 6);
  tiers.forEach((t) => assert.ok(t.quip.length > 15, t.label));
});

test('climb pacing: 2.5 s plus 12 ms a point, clamped, eased out, slower past things worth reading', () => {
  assert.deepEqual([0, 10, 15, 30, 60, 85, 100, 500].map(C.climbMs), [2500, 2620, 2680, 2860, 3220, 3520, 3700, 4500]);
  assert.equal(C.climbMs(-5), 2500);
  const plain = C.climbCurve(100, 160, []);
  assert.equal(plain(0), 0);
  assert.equal(plain(1), 1);
  let prev = 0;
  let prevStep = Infinity;
  for (let i = 1; i <= 100; i++) {
    const p = plain(i / 100);
    assert.ok(p > prev, 'always rising');
    assert.ok(p - prev <= prevStep + 1e-9, 'never speeding up: eased out');
    prevStep = p - prev;
    prev = p;
  }
  // Regression: a low climb used to cover almost all its distance in the first 1.5 seconds.
  const half = C.climbCurve(40, 100, [])(1.5 / (C.climbMs(60) / 1000));
  assert.ok(half < 0.72, 'after 1.5 s a 60-point climb is still well short: ' + half.toFixed(2));
  // but it does start at once: within 200 ms it has moved a visible amount (over a tenth of a point)
  assert.ok(C.climbCurve(0, 10, [])(200 / C.climbMs(10)) * 10 > 0.5);
  // passing a mark: more time is spent within a few points of it than without it
  const timeNear = (curve, from, to, m) => { let n = 0; for (let i = 0; i < 2000; i++) { const at = from + (to - from) * curve(i / 2000); if (Math.abs(at - m) < 3) n++; } return n / 2000; };
  const marked = C.climbCurve(100, 200, [150]);
  assert.ok(timeNear(marked, 100, 200, 150) > timeNear(C.climbCurve(100, 200, []), 100, 200, 150) * 1.5, 'it lingers at the mark');
  assert.equal(marked(1), 1);
  assert.equal(C.climbCurve(100, 200, [50, 400])(0.5), C.climbCurve(100, 200, [])(0.5), 'marks outside the climb change nothing');
});

test('points to feet: the five checkpoints of the one curve', () => {
  // One function, C.altitudeFeet, is the only place points become feet.
  assert.equal(C.altitudeFeet(0), 0);
  assert.ok(Math.abs(C.altitudeFeet(150) - 10000) <= 1, '150 points is about 10,000 ft: ' + C.altitudeFeet(150));
  assert.ok(Math.abs(C.altitudeFeet(350) - 40000) <= 1, '350 points is about 40,000 ft: ' + C.altitudeFeet(350));
  assert.ok(Math.abs(C.altitudeFeet(550) - 330000) < 2000, '550 points is the edge of space: ' + C.altitudeFeet(550));
  assert.equal(C.altitudeText(700), '238,855 mi', '700 points is the Moon');
  // between checkpoints it is still the same function: 60 points is 242 ft, not whatever a half-finished count shows
  assert.equal(C.altitudeFeet(60), 242);
  assert.equal(C.altitudeParts(60).value, '242');
});

test('quips fit the altitude: no thin air below 15,000 ft, no space below the edge of space', () => {
  const lowTop = C.scoreForFeet(C.THIN_AIR_FT);
  const spaceFrom = C.scoreForFeet(328084);
  for (const tier of C.TIER_ORDER) {
    for (let s = 0; s <= 760; s += 1) {
      const q = C.quipFor(tier, s);
      assert.ok(q.length > 15, tier + ' at ' + s);
      if (s < lowTop - 0.5) assert.doesNotMatch(q, /\b(thin|air|space|orbit|stars?|dark|vacuum)\b/i, tier + ' at ' + s + ' points (' + C.altitudeText(s) + '): ' + q);
      if (s < spaceFrom - 0.5) assert.doesNotMatch(q, /\b(space|orbit|no air|dark|vacuum)\b/i, tier + ' at ' + s + ': ' + q);
    }
  }
  // Regression: a Deep Cut at 600 ft used to say the air was getting thin.
  assert.equal(C.quipFor('deep', 95), 'A deep cut. The ground is a long way down.');
  assert.equal(C.quipFor('deep', 320), 'A deep cut. The air is getting thin.');
  assert.equal(C.quipFor('deep', 640), 'A deep cut. No air up here at all.');
  assert.equal(C.quipFor('nonsense', 10), '');
});

test('your flights: the last 30 scores, tier counts and the longest streak are kept, and old saves survive', () => {
  const day = (n) => C.utcDateKey(new Date((C.dayNumber('2026-10-08') + n) * 86400000));
  const rounds = (tiers) => tiers.map((t) => ({ tier: t, points: C.tierPoints(t) }));
  let s = null;
  s = C.recordFlight(s, day(0), 200, rounds(['common', 'rare', null, 'swarm', 'solid', 'clever', 'deep']));
  assert.deepEqual(s.tiers, { common: 1, clever: 1, solid: 1, rare: 1, deep: 1, swarm: 1, miss: 1 });
  assert.deepEqual(s.history, [{ d: day(0), s: 200 }]);
  assert.equal(s.longest, 1);
  s = C.recordFlight(s, day(1), 300, rounds(['swarm', 'swarm', 'rare', null, null, 'nonsense', 'common']));
  s = C.recordFlight(s, day(2), 100, rounds(['common']));
  assert.deepEqual(s.tiers, { common: 3, clever: 1, solid: 1, rare: 2, deep: 1, swarm: 3, miss: 4 }, 'an unknown tier counts as a miss');
  assert.deepEqual([s.streak, s.longest], [3, 3]);
  s = C.recordFlight(s, day(5), 50); // two days missed: the streak restarts, the longest stays
  assert.deepEqual([s.streak, s.longest, C.currentStreak(s, day(5))], [1, 3, 1]);
  assert.deepEqual(s.history.map((h) => h.s), [200, 300, 100, 50]);
  assert.deepEqual(C.recordFlight(s, day(5), 700, rounds(['swarm'])), s, 'the same day twice changes nothing, tier counts included');
  for (let n = 6; n < 46; n++) s = C.recordFlight(s, day(n), n * 10 > 700 ? 700 : n * 10);
  assert.equal(s.history.length, 30, 'only the last 30 flights are kept');
  assert.equal(s.history[29].d, day(45));
  assert.equal(s.history[0].d, day(16));
  assert.deepEqual([s.played, s.streak, s.longest], [44, 41, 41]);
  assert.deepEqual(C.reviveStats(JSON.parse(JSON.stringify(s))), s, 'survives a round trip through storage');

  // a record saved before these fields existed keeps its numbers and gains empty extras
  const old = { v: C.SAVE_VERSION, played: 9, total: 2700, best: 520, streak: 4, lastDate: day(3) };
  const revived = C.reviveStats(old);
  assert.deepEqual(revived, Object.assign({}, old, { longest: 4, history: [], tiers: { common: 0, clever: 0, solid: 0, rare: 0, deep: 0, swarm: 0, miss: 0 } }));
  const next = C.recordFlight(revived, day(4), 300, rounds(['rare']));
  assert.deepEqual([next.played, next.streak, next.longest, next.history.length, next.tiers.rare], [10, 5, 5, 1, 1]);

  // damaged extras are reset one by one; the sound core numbers are kept
  const good = C.reviveStats(JSON.parse(JSON.stringify(next)));
  const damaged = [
    { history: 'x' }, { history: [{ d: 'soon', s: 5 }] }, { history: [{ d: day(4), s: 9999 }] }, { history: [{ d: day(4), s: 1 }, { d: day(2), s: 1 }] },
    { history: new Array(40).fill(0).map((_, i) => ({ d: day(i), s: 10 })) }, { history: [null] },
    { tiers: 'x' }, { tiers: { common: -1 } }, { tiers: { common: 1e9, clever: 0, solid: 0, rare: 0, deep: 0, swarm: 0, miss: 0 } }, { tiers: null },
    { longest: -4 }, { longest: 'many' }, { longest: 99999 }, { longest: 1 },
  ];
  damaged.forEach((d) => {
    const r = C.reviveStats(Object.assign(JSON.parse(JSON.stringify(next)), d));
    assert.ok(r, 'still a usable record: ' + JSON.stringify(d).slice(0, 60));
    assert.deepEqual([r.played, r.total, r.best, r.streak, r.lastDate], [good.played, good.total, good.best, good.streak, good.lastDate]);
    assert.ok(Array.isArray(r.history) && r.history.length <= 30 && r.history.length <= r.played);
    assert.ok(r.longest >= r.streak && r.longest <= r.played);
    assert.ok(Object.values(r.tiers).every((n) => Number.isInteger(n) && n >= 0));
  });
  assert.equal(C.reviveStats(Object.assign({}, next, { played: -1 })), null, 'broken core numbers still reject the whole record');
});
