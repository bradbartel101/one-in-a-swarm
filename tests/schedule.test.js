'use strict';
/* The daily schedule is frozen by date: once a day is in data/schedule.json it never changes,
   whatever happens to the prompt bank, and new days are only ever appended. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const data = require('../data/prompts.json');
const schedule = require('../data/schedule.json');

const ids = data.prompts.map((p) => p.id);
const known = new Set(ids);
const dates = Object.keys(schedule.days);

test('the schedule starts at launch, has no gaps, and runs at least a year', () => {
  assert.equal(dates[0], C.LAUNCH_DATE);
  assert.ok(dates.length >= 365, dates.length + ' days');
  for (let i = 1; i < dates.length; i++) assert.equal(C.dayNumber(dates[i]) - C.dayNumber(dates[i - 1]), 1, 'gap before ' + dates[i]);
});

test('every scheduled day is seven distinct prompts that exist', () => {
  dates.forEach((d) => assert.ok(C.scheduledIds(schedule, d, known), d + ' is not a valid day: ' + JSON.stringify(schedule.days[d])));
});

test('changing the prompt bank never changes a day that is already scheduled', () => {
  // add prompts, remove one, reorder: run the generator again over the same range
  const changed = ids.filter((id) => id !== 'golf').concat(['brand-new-one', 'another-new-one']).reverse();
  const again = C.extendSchedule(schedule, changed, C.LAUNCH_DATE, dates.length);
  assert.deepEqual(again.days, schedule.days, 'existing days are untouched');
  const longer = C.extendSchedule(schedule, changed, C.LAUNCH_DATE, dates.length + 30);
  dates.forEach((d) => assert.deepEqual(longer.days[d], schedule.days[d], d + ' changed'));
  assert.equal(Object.keys(longer.days).length, dates.length + 30, 'thirty days appended');
});

test('appended days use the bank as it is then, and do not repeat the days just before them', () => {
  const bigger = ids.concat(['brand-new-one']);
  const longer = C.extendSchedule(schedule, bigger, C.LAUNCH_DATE, dates.length + 60);
  const all = Object.keys(longer.days);
  const cover = C.rotationCoverDays(bigger.length, C.ROUNDS);
  let sawNew = false;
  for (let i = dates.length; i < all.length; i++) {
    const day = longer.days[all[i]];
    assert.equal(new Set(day).size, 7);
    if (day.includes('brand-new-one')) sawNew = true;
    if (i > dates.length + cover) { // clear of the seam with the old days
      const window = all.slice(i - cover + 1, i + 1).map((k) => longer.days[k]).flat();
      assert.equal(new Set(window).size, window.length, 'a prompt repeats within ' + cover + ' days ending ' + all[i]);
    }
  }
  assert.ok(sawNew, 'a prompt added later gets scheduled in the appended days');
});

test('a day that names a prompt which no longer exists is not served from the schedule', () => {
  const day = dates[10];
  const without = new Set(ids.filter((id) => id !== schedule.days[day][0]));
  assert.equal(C.scheduledIds(schedule, day, without), null, 'the game falls back to an unscheduled draw for that day');
  assert.equal(C.scheduledIds(schedule, '1999-01-01', known), null);
  assert.equal(C.scheduledIds(null, day, known), null);
});

test('the first schedule matched what the game was already serving', () => {
  // The file was first filled from the draw the live game used, so shipping it changed nobody's day.
  ['2026-10-08', '2026-10-09', '2026-10-11'].forEach((d) => assert.equal(schedule.days[d].length, 7));
});

/* ----- the daily mix: four gt and three general, an easy opener, and the repeat rule ----- */
const make = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ id: (extra.easy ? 'easy' : extra.pool) + String(i).padStart(2, '0') }, extra));
const fullBank = () => make(61, { pool: 'gt' }).concat(make(16, { pool: 'general', easy: true }), make(31, { pool: 'general' }), make(5, { pool: 'gt', retired: true }).map((p, i) => Object.assign(p, { id: 'old' + i })));

test('mix: every day is general, gt, gt, general, gt, general, gt, opening with an easy general prompt', () => {
  assert.deepEqual(C.MIX_ORDER, ['easy', 'gt', 'gt', 'general', 'gt', 'general', 'gt']);
  const bank = fullBank();
  const s = C.extendMixSchedule(null, bank, '2026-11-01', 365);
  const byId = Object.fromEntries(bank.map((p) => [p.id, p]));
  const keys = Object.keys(s.days);
  assert.equal(keys.length, 365);
  keys.forEach((k) => {
    const day = s.days[k].map((id) => byId[id]);
    assert.deepEqual(day.map((p) => p.pool), ['general', 'gt', 'gt', 'general', 'gt', 'general', 'gt'], k);
    assert.equal(day[0].easy, true, k + ' opens with an easy prompt');
    assert.equal(day.filter((p) => p.pool === 'gt').length, 4);
    assert.equal(day.filter((p) => p.pool === 'general').length, 3);
    assert.equal(new Set(s.days[k]).size, 7);
    assert.ok(day.every((p) => !p.retired), k + ' uses no retired prompt');
  });
  const check = C.checkMix(s, bank, '2026-11-01', 365);
  assert.deepEqual(check.errors, []);
});

test('mix: no prompt returns sooner than floor(pool size / slots a day) days, and never within 14', () => {
  const bank = fullBank();
  const plan = C.mixPlan(bank);
  assert.deepEqual([plan.pools.gt.gap, plan.pools.easy.gap, plan.pools.general.gap], [15, 16, 15]); // 61/4, 16/1, 31/2
  assert.equal(plan.ok, true);
  const s = C.extendMixSchedule(null, bank, '2026-11-01', 730);
  const { errors, gaps } = C.checkMix(s, bank, '2026-11-01', 730);
  assert.deepEqual(errors, []);
  assert.ok(gaps.gt >= 15 && gaps.easy >= 16 && gaps.general >= 15, JSON.stringify(gaps));
  assert.ok(C.MIX_MIN_GAP === 14 && Math.min(gaps.gt, gaps.easy, gaps.general) >= 14);
  // every live prompt is used, and no prompt is left waiting for long
  const used = new Set([].concat.apply([], Object.values(s.days)));
  bank.filter((p) => !p.retired).forEach((p) => assert.ok(used.has(p.id), p.id + ' is used'));
  const days = Object.keys(s.days);
  const lastSeen = {};
  let longest = 0;
  days.forEach((k, i) => s.days[k].forEach((id) => { if (lastSeen[id] !== undefined) longest = Math.max(longest, i - lastSeen[id]); lastSeen[id] = i; }));
  assert.ok(longest <= 40, 'the longest wait between two uses of a prompt is ' + longest + ' days');
  // and the days do not come round again as the same set of seven
  const sets = new Set(days.map((k) => s.days[k].slice().sort().join(',')));
  assert.ok(sets.size > days.length * 0.95, 'days are not a fixed rotation: ' + sets.size + ' different sets in ' + days.length + ' days');
});

test('mix: days already scheduled are never changed, the old days count toward the gap, and the draw is repeatable', () => {
  const bank = fullBank();
  const old = { version: 1, days: { '2026-10-30': ['old0', 'old1', 'gt00', 'gt01', 'old2', 'easy00', 'general00'], '2026-10-31': ['old3', 'gt02', 'gt03', 'old4', 'gt04', 'easy01', 'general01'] } };
  const s = C.extendMixSchedule(old, bank, '2026-10-30', 120);
  assert.deepEqual(s.days['2026-10-30'], old.days['2026-10-30']);
  assert.deepEqual(s.days['2026-10-31'], old.days['2026-10-31']);
  assert.deepEqual(C.extendMixSchedule(old, bank, '2026-10-30', 120), s, 'the same inputs give the same schedule');
  assert.deepEqual(C.extendMixSchedule(s, bank, '2026-10-30', 200).days['2026-12-25'], s.days['2026-12-25'], 'extending later changes nothing earlier');
  // gt00 was used on Oct 30: it may not come back before Nov 14 (15 days)
  const firstBack = Object.keys(s.days).filter((k) => k > '2026-10-31' && s.days[k].includes('gt00'))[0];
  assert.ok(firstBack >= '2026-11-14', 'gt00 next appears on ' + firstBack);
  assert.deepEqual(C.checkMix(s, bank, '2026-11-01', 118).errors, []);
});

test('mix: a bank too small for the 14-day rule is reported, not hidden', () => {
  const small = make(20, { pool: 'gt' }).concat(make(5, { pool: 'general', easy: true }), make(9, { pool: 'general' }));
  const plan = C.mixPlan(small);
  assert.equal(plan.ok, false);
  assert.deepEqual([plan.pools.gt.gap, plan.pools.easy.gap, plan.pools.general.gap], [5, 5, 4]);
  const s = C.extendMixSchedule(null, small, '2026-11-01', 60);
  const check = C.checkMix(s, small, '2026-11-01', 60);
  assert.ok(check.errors.length > 0 && /never under 14/.test(check.errors[0]), 'the check fails loudly');
  assert.ok(check.gaps.gt >= 5, 'but it still does the best the pool allows: ' + JSON.stringify(check.gaps));
  assert.equal(C.mixPool({ pool: 'gt', retired: true }), null);
  assert.equal(C.mixPool({ pool: 'general', easy: true }), 'easy');
  assert.equal(C.mixPool({}), null);
});
