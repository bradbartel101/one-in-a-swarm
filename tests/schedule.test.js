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
