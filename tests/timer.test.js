'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const prompt = {
  id: 'p1',
  answers: [
    { name: 'Common One', tier: 'common' },
    { name: 'Clever One', tier: 'clever' },
    { name: 'Solid One', tier: 'solid' },
    { name: 'Rare One', tier: 'rare' },
    { name: 'Deep One', tier: 'deep' },
    { name: 'Swarm One', tier: 'swarm', note: 'a note' },
  ],
};
const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
const T0 = 1000000;

/* ----- daily ----- */

test('a round lasts 25 seconds', () => {
  const s = C.newDaily('2026-10-08', ids);
  assert.equal(C.startRound(s, T0), true);
  assert.equal(C.remainingMs(s, T0), 25000);
  assert.equal(C.remainingMs(s, T0 + 10000), 15000);
  assert.equal(C.dailyTick(s, T0 + 24999), false);
  assert.equal(C.dailyTick(s, T0 + 25000), true);
  assert.deepEqual(s.results, [{ tier: null, answer: null, points: 0, promptId: 'p1', wrong: 0 }]);
  assert.equal(s.round, null);
});

test('a wrong guess costs exactly 3 seconds and the round continues', () => {
  const s = C.newDaily('2026-10-08', ids);
  C.startRound(s, T0);
  const r = C.dailyGuess(s, prompt, 'nope', T0 + 5000);
  assert.equal(r.status, 'wrong');
  assert.equal(r.remainingMs, 17000);
  assert.equal(C.remainingMs(s, T0 + 5000), 17000);
  assert.ok(s.round, 'round is still open');
  assert.equal(C.dailyGuess(s, prompt, 'still no', T0 + 5000).remainingMs, 14000);
  assert.equal(s.round.tried.length, 2);
});

test('a correct answer ends the round and scores its tier', () => {
  const s = C.newDaily('2026-10-08', ids);
  C.startRound(s, T0);
  C.dailyGuess(s, prompt, 'nope', T0 + 1000);
  const r = C.dailyGuess(s, prompt, 'swarm one', T0 + 2000);
  assert.equal(r.status, 'correct');
  assert.equal(r.result.points, 100);
  assert.equal(r.result.wrong, 1);
  assert.equal(r.result.note, 'a note');
  assert.equal(s.round, null);
  assert.equal(s.results.length, 1);
  assert.equal(C.dailyGuess(s, prompt, 'rare one', T0 + 3000).status, 'idle');
});

test('a wrong guess that eats the last of the clock ends the round as a miss', () => {
  const s = C.newDaily('2026-10-08', ids);
  C.startRound(s, T0);
  const r = C.dailyGuess(s, prompt, 'nope', T0 + 23000); // 2s left, penalty is 3s
  assert.equal(r.status, 'timeout');
  assert.equal(s.results[0].points, 0);
  assert.equal(s.results[0].wrong, 1);
});

test('a guess submitted after the deadline does not score', () => {
  const s = C.newDaily('2026-10-08', ids);
  C.startRound(s, T0);
  assert.equal(C.dailyGuess(s, prompt, 'swarm one', T0 + 25001).status, 'timeout');
  assert.equal(C.totalScore(s.results), 0);
});

test('empty input costs nothing', () => {
  const s = C.newDaily('2026-10-08', ids);
  C.startRound(s, T0);
  assert.equal(C.dailyGuess(s, prompt, '   ', T0 + 1000).status, 'empty');
  assert.equal(C.remainingMs(s, T0 + 1000), 24000);
});

test('seven rounds finish the day, and a finished day cannot be restarted', () => {
  const s = C.newDaily('2026-10-08', ids);
  for (let i = 0; i < 7; i++) {
    assert.equal(s.finished, false);
    assert.equal(C.startRound(s, T0 + i * 100000), true);
    assert.equal(C.startRound(s, T0 + i * 100000), false, 'cannot start a second round on top of a live one');
    C.dailyGuess(s, prompt, 'solid one', T0 + i * 100000 + 1000);
  }
  assert.equal(s.finished, true);
  assert.equal(C.totalScore(s.results), 210);
  assert.equal(C.startRound(s, T0 + 9999999), false);
  assert.equal(s.results.length, 7);
});

test('state survives a JSON round trip mid-round (the refresh case) and the clock keeps running', () => {
  const s = C.newDaily('2026-10-08', ids);
  C.startRound(s, T0);
  C.dailyGuess(s, prompt, 'solid one', T0 + 1000);
  C.startRound(s, T0 + 50000);
  C.dailyGuess(s, prompt, 'nope', T0 + 52000);
  const revived = JSON.parse(JSON.stringify(s));
  assert.deepEqual(revived, s);
  assert.equal(revived.round.index, 1);
  assert.equal(revived.round.tried[0].text, 'nope');
  // 8 seconds later, in a "new page load": 25 - 2 - 3 - 8 = 12 seconds left
  assert.equal(C.remainingMs(revived, T0 + 60000), 12000);
  assert.equal(C.dailyGuess(revived, prompt, 'nope', T0 + 60000).status, 'duplicate');
  assert.equal(C.dailyGuess(revived, prompt, 'deep one', T0 + 60000).status, 'correct');
  assert.equal(C.totalScore(revived.results), 115);
  // a refresh after the deadline is a miss, not a fresh clock
  const late = JSON.parse(JSON.stringify(s));
  assert.equal(C.dailyTick(late, T0 + 50000 + 30000), true);
  assert.equal(late.results[1].points, 0);
});

/* ----- infinite ----- */

const order = ['p1', 'p2', 'p3'];
const typing = { focused: true, hasText: true };

test('infinite starts with one 45-second clock', () => {
  const s = C.newInfinite(order);
  assert.equal(s.clockMs, 45000);
  assert.equal(s.over, false);
});

test('the clock drains only while the input is focused or has text', () => {
  assert.equal(C.infiniteDrains({ focused: false, hasText: false }), false);
  assert.equal(C.infiniteDrains({ focused: true, hasText: false }), true);
  assert.equal(C.infiniteDrains({ focused: false, hasText: true }), true);
  assert.equal(C.infiniteDrains({ focused: true, hasText: true }), true);
  assert.equal(C.infiniteDrains(undefined), false);

  const s = C.newInfinite(order);
  assert.equal(C.infiniteTick(s, 5000, { focused: false, hasText: false }), false);
  assert.equal(s.clockMs, 45000, 'idle time is free');
  assert.equal(C.infiniteTick(s, 5000, typing), true);
  assert.equal(s.clockMs, 40000);
  C.infiniteTick(s, 60000, { focused: false, hasText: false });
  assert.equal(s.clockMs, 40000);
});

test('the run ends when the clock hits zero, and never goes negative', () => {
  const s = C.newInfinite(order);
  C.infiniteTick(s, 44999, typing);
  assert.equal(s.over, false);
  C.infiniteTick(s, 500, typing);
  assert.equal(s.clockMs, 0);
  assert.equal(s.over, true);
  assert.equal(C.infiniteGuess(s, prompt, 'swarm one').status, 'idle');
  assert.equal(C.infiniteTick(s, 1000, typing), false);
});

test('correct answers add time by tier and move to the next prompt', () => {
  const cases = [['swarm one', 100, 16000], ['deep one', 85, 12000], ['rare one', 60, 10000], ['solid one', 30, 9000], ['clever one', 15, 8000], ['common one', 10, 8000]];
  cases.forEach(([guess, points, bonus]) => {
    const s = C.newInfinite(order);
    const r = C.infiniteGuess(s, prompt, guess);
    assert.equal(r.status, 'correct');
    assert.equal(r.points, points);
    assert.equal(s.clockMs, 45000 + bonus);
    assert.equal(s.score, points);
    assert.equal(s.pos, 1);
    assert.equal(s.answered, 1);
  });
});

test('wrong guesses cost 3 seconds, duplicates cost nothing, and tried guesses reset per prompt', () => {
  const s = C.newInfinite(order);
  assert.equal(C.infiniteGuess(s, prompt, 'nope').status, 'wrong');
  assert.equal(s.clockMs, 42000);
  assert.equal(C.infiniteGuess(s, prompt, 'NOPE!').status, 'duplicate');
  assert.equal(s.clockMs, 42000);
  C.infiniteGuess(s, prompt, 'common one');
  assert.deepEqual(s.tried, []);
  assert.equal(C.infiniteGuess(s, prompt, 'nope').status, 'wrong');
});

test('a wrong guess can end the run', () => {
  const s = C.newInfinite(order);
  C.infiniteTick(s, 43000, typing);
  assert.equal(C.infiniteGuess(s, prompt, 'nope').status, 'wrong');
  assert.equal(s.over, true);
});

test('skip costs 5 seconds and moves on', () => {
  const s = C.newInfinite(order);
  assert.equal(C.infiniteSkip(s), true);
  assert.equal(s.clockMs, 40000);
  assert.equal(s.pos, 1);
  assert.equal(s.answered, 0);
});

test('prompts never repeat in a run, and exhausting the bank ends it as cleared', () => {
  const s = C.newInfinite(order);
  const seen = [];
  while (!s.over) {
    seen.push(s.order[s.pos]);
    C.infiniteGuess(s, prompt, 'common one');
  }
  assert.deepEqual(seen, order);
  assert.equal(s.cleared, true);
  assert.equal(s.score, 30);
});
