'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const data = require('../data/prompts.json');

const dayKey = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const START = C.dayNumber('2026-10-08');

test('the same UTC date always gives the same seven prompts, in the same order', () => {
  const a = C.dailyPromptIds(data.prompts, '2026-10-08');
  const b = C.dailyPromptIds(data.prompts, '2026-10-08');
  assert.equal(a.length, 7);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 7);
});

test('the draw does not depend on the order of the prompt file', () => {
  const reversed = data.prompts.slice().reverse();
  assert.deepEqual(C.dailyPromptIds(reversed, '2026-10-08'), C.dailyPromptIds(data.prompts, '2026-10-08'));
});

test('every day for two years differs from the day after', () => {
  for (let d = START; d < START + 730; d++) {
    const a = C.dailyPromptIds(data.prompts, dayKey(d));
    const b = C.dailyPromptIds(data.prompts, dayKey(d + 1));
    assert.equal(a.length, 7);
    assert.notDeepEqual(a, b, dayKey(d) + ' repeats on the next day');
  }
});

test('no prompt repeats inside a block of days', () => {
  const perBlock = Math.floor(data.prompts.length / 7);
  const blockStart = START - (START % perBlock);
  const seen = new Set();
  for (let d = blockStart; d < blockStart + perBlock; d++) {
    C.dailyPromptIds(data.prompts, dayKey(d)).forEach((id) => {
      assert.ok(!seen.has(id), id + ' repeated within a block');
      seen.add(id);
    });
  }
});

test('every prompt gets used over a year', () => {
  const seen = new Set();
  for (let d = START; d < START + 365; d++) C.dailyPromptIds(data.prompts, dayKey(d)).forEach((id) => seen.add(id));
  assert.equal(seen.size, data.prompts.length);
});

test('the date key is UTC and rolls over at 00:00 UTC', () => {
  assert.equal(C.utcDateKey(new Date('2026-10-08T23:59:59.999Z')), '2026-10-08');
  assert.equal(C.utcDateKey(new Date('2026-10-09T00:00:00.000Z')), '2026-10-09');
  // 8pm in Atlanta on the 8th is already the 9th in UTC
  assert.equal(C.utcDateKey(new Date('2026-10-08T20:00:00-04:00')), '2026-10-09');
  assert.equal(C.msUntilNextUtcDay(Date.parse('2026-10-08T23:59:00Z')), 60000);
  assert.equal(C.msUntilNextUtcDay(Date.parse('2026-10-08T00:00:00Z')), 86400000);
});

test('the seeded generator is deterministic and the shuffle is a permutation', () => {
  const r1 = C.seededRng('x');
  const r2 = C.seededRng('x');
  for (let i = 0; i < 20; i++) assert.equal(r1(), r2());
  const out = C.shuffle([1, 2, 3, 4, 5, 6, 7, 8], C.seededRng('y'));
  assert.deepEqual(out.slice().sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});
