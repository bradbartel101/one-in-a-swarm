'use strict';
/* Release-audit edge cases (SHIP.md section A and B2), at the rules level.
   The same behaviours are exercised in a real browser by tests/e2e/run.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const C = require('../js/core.js');
const data = require('../data/prompts.json');

const dayKey = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const ids = data.prompts.map((p) => p.id);
const known = new Set(ids);
const prompt = data.prompts[0];
const wrongs = ['zzzz not an answer', 'qqqq neither is this', 'xxxx nor this'];

/* ----- A1: UTC everywhere ----- */

test('A1: players in UTC-12, UTC+14 and New York get the same seven for the same UTC date', () => {
  const script = `
    const C = require(${JSON.stringify(path.join(__dirname, '..', 'js', 'core.js'))});
    const data = require(${JSON.stringify(path.join(__dirname, '..', 'data', 'prompts.json'))});
    const now = new Date('2026-10-08T11:30:00Z');
    const key = C.utcDateKey(now);
    process.stdout.write(JSON.stringify({ local: now.getDate(), offset: now.getTimezoneOffset(), key, ids: C.dailyPromptIds(data.prompts, key) }));`;
  const runs = ['Etc/GMT+12', 'Pacific/Kiritimati', 'America/New_York', 'UTC'].map((TZ) =>
    JSON.parse(execFileSync(process.execPath, ['-e', script], { env: Object.assign({}, process.env, { TZ }), encoding: 'utf8' })));
  assert.deepEqual(runs.map((r) => r.offset), [720, -840, 240, 0], 'the child processes really ran in those zones');
  assert.deepEqual(runs.map((r) => r.local), [7, 9, 8, 8], 'local calendar dates differ');
  runs.forEach((r) => {
    assert.equal(r.key, '2026-10-08');
    assert.deepEqual(r.ids, runs[3].ids);
  });
});

/* ----- A2: midnight rollover ----- */

test('A2: a run started at 23:59 UTC is finished as yesterday, then today opens', () => {
  const start = Date.parse('2026-10-08T23:59:00Z');
  const run = C.newDaily(C.utcDateKey(new Date(start)), C.dailyPromptIds(data.prompts, '2026-10-08'));
  assert.equal(run.date, '2026-10-08');
  C.startRound(run, start);
  C.dailyGuess(run, data.prompts.find((p) => p.id === run.promptIds[0]), 'zzzz', start + 1000);

  const after = '2026-10-09';
  let r = C.resolveDaily(run, after);
  assert.equal(r.run, run, 'the unfinished run survives midnight');
  assert.equal(r.stale, true);
  assert.equal(r.run.date, '2026-10-08', 'and it is still yesterday\'s puzzle');

  // finish it after midnight
  let t = start + 120000;
  while (!run.finished) {
    if (!run.round) C.startRound(run, t);
    const p = data.prompts.find((q) => q.id === run.promptIds[run.round.index]);
    C.dailyGuess(run, p, p.answers[0].name, t + 500);
    t += 5000;
  }
  assert.deepEqual(run.promptIds, C.dailyPromptIds(data.prompts, '2026-10-08'));
  r = C.resolveDaily(run, after);
  assert.equal(r.run, null, 'once finished, today\'s puzzle is available');
  assert.notDeepEqual(C.dailyPromptIds(data.prompts, after), run.promptIds);
});

test('A2: which saved runs carry over', () => {
  const fresh = (date) => C.newDaily(date, ids.slice(0, 7));
  const started = (date) => {
    const s = fresh(date);
    C.startRound(s, 0);
    return s;
  };
  assert.equal(C.resolveDaily(null, '2026-10-09').run, null);
  assert.equal(C.resolveDaily(started('2026-10-09'), '2026-10-09').stale, false, 'today is never stale');
  assert.equal(C.resolveDaily(started('2026-10-08'), '2026-10-09').stale, true, 'yesterday, in progress');
  assert.equal(C.resolveDaily(fresh('2026-10-08'), '2026-10-09').run, null, 'yesterday, never started');
  assert.equal(C.resolveDaily(started('2026-10-07'), '2026-10-09').run, null, 'two days old');
  assert.equal(C.resolveDaily(started('2026-10-10'), '2026-10-09').run, null, 'from the future (clock was changed)');
  assert.equal(C.previousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(C.previousDateKey('2028-03-01'), '2028-02-29');
  assert.equal(C.previousDateKey('2027-01-01'), '2026-12-31');
});

/* ----- A3 / A4: finished days and resuming ----- */

test('A3: a finished day stays finished through a save and reload', () => {
  const run = C.newDaily('2026-10-08', ids.slice(0, 7));
  for (let i = 0; i < 7; i++) {
    C.startRound(run, i * 1000);
    C.dailyGuess(run, data.prompts.find((p) => p.id === run.promptIds[i]), data.prompts.find((p) => p.id === run.promptIds[i]).answers[0].name, i * 1000 + 10);
  }
  const back = C.reviveDaily(JSON.parse(JSON.stringify(run)), known);
  assert.equal(back.finished, true);
  assert.equal(C.startRound(back, 999999), false, 'no eighth round');
  assert.equal(C.dailyGuess(back, prompt, prompt.answers[0].name, 999999).status, 'idle');
  assert.equal(C.totalScore(back.results), C.totalScore(run.results));
  assert.equal(C.resolveDaily(back, '2026-10-08').run, back);
});

test('A4: resuming restores round, score and a timer that neither resets nor goes negative', () => {
  const T = 5000000;
  const run = C.newDaily('2026-10-08', ids.slice(0, 7));
  const p0 = data.prompts.find((p) => p.id === run.promptIds[0]);
  const p1 = data.prompts.find((p) => p.id === run.promptIds[1]);
  C.startRound(run, T);
  C.dailyGuess(run, p0, p0.answers.find((a) => a.tier === 'rare').name, T + 1000);
  C.startRound(run, T + 2000);
  C.dailyGuess(run, p1, wrongs[0], T + 6000); // 4s used, 3s penalty: 18s left
  const stored = JSON.stringify(run);

  const soon = C.reviveDaily(JSON.parse(stored), known);
  assert.equal(soon.round.index, 1);
  assert.equal(C.totalScore(soon.results), 60);
  assert.equal(C.remainingMs(soon, T + 8000), 16000, '2s later: 16s, not a fresh 25s');
  assert.equal(soon.round.tried[0].text, wrongs[0]);

  const late = C.reviveDaily(JSON.parse(stored), known);
  assert.equal(C.remainingMs(late, T + 9999999), 0, 'never negative');
  assert.equal(C.dailyTick(late, T + 9999999), true);
  assert.deepEqual([late.results.length, late.results[1].points, late.round], [2, 0, null]);
});

/* ----- A5: the timer cannot be gamed ----- */

test('A5: setting the device clock back never adds time', () => {
  const T = 5000000;
  const run = C.newDaily('2026-10-08', ids.slice(0, 7));
  C.startRound(run, T);
  C.dailyTick(run, T + 5000, 5000);
  assert.equal(run.round.leftMs, 20000);
  // clock jumps back an hour; one second really passes
  assert.equal(C.remainingMs(run, T - 3600000), 20000, 'reading the clock in the past gains nothing');
  C.dailyTick(run, T - 3600000 + 1000, 1000);
  assert.equal(run.round.leftMs, 19000, 'the monotonic second is still charged');
  // reload with the clock set back again (no monotonic history): still no gain
  const back = C.reviveDaily(JSON.parse(JSON.stringify(run)), known);
  C.dailyTick(back, T - 7200000, 0);
  assert.equal(back.round.leftMs, 19000);
  C.dailyTick(back, T - 7200000 + 2500, 2500);
  assert.equal(back.round.leftMs, 16500);
});

test('A5: time passes while the tab is hidden, frozen or asleep', () => {
  const T = 5000000;
  const run = C.newDaily('2026-10-08', ids.slice(0, 7));
  C.startRound(run, T);
  // timers stopped for 10s (background tab): one late tick charges all of it
  C.dailyTick(run, T + 10000, 10000);
  assert.equal(run.round.leftMs, 15000);
  // device slept: the monotonic clock stalled (0ms) but the wall clock moved 8s
  C.dailyTick(run, T + 18000, 0);
  assert.equal(run.round.leftMs, 7000);
  // a clock set far forward just ends the round
  assert.equal(C.dailyTick(run, T + 86400000, 10), true);
  assert.equal(run.results[0].points, 0);
});

test('A5: time left can never exceed the round length, even from a tampered save', () => {
  const run = C.newDaily('2026-10-08', ids.slice(0, 7));
  C.startRound(run, 1000);
  const raw = JSON.parse(JSON.stringify(run));
  raw.round.leftMs = 3600000;
  assert.equal(C.reviveDaily(raw, known), null);
});

/* ----- A6: infinite clock ----- */

test('A6: infinite clock drains only while typing, pauses cleanly, ends exactly at zero', () => {
  const s = C.newInfinite(ids);
  const idle = { focused: false, hasText: false };
  for (let i = 0; i < 600; i++) C.infiniteTick(s, 100, idle); // a minute away from the keyboard
  assert.equal(s.clockMs, 45000);
  for (let i = 0; i < 100; i++) C.infiniteTick(s, 100, { focused: true, hasText: false });
  assert.equal(s.clockMs, 35000);
  C.infiniteTick(s, 7 * 3600000, idle); // laptop lid closed for hours while paused
  assert.equal(s.clockMs, 35000);
  C.infiniteTick(s, 7 * 3600000, { focused: false, hasText: true }); // ...with text left in the box
  assert.equal(s.clockMs, 0, 'clamped at zero');
  assert.equal(s.over, true);
  assert.equal(s.cleared, false);
  assert.equal(C.infiniteSkip(s), false, 'nothing happens after the end');
  assert.equal(C.infiniteGuess(s, prompt, prompt.answers[0].name).status, 'idle');
  assert.equal(s.score, 0);
});

/* ----- A7: rotation ----- */

test('A7: the rotation never runs dry and never repeats a prompt within the days the bank covers', () => {
  const cover = C.rotationCoverDays(data.prompts.length, C.ROUNDS);
  assert.equal(cover, Math.floor(data.prompts.length / 7));
  assert.ok(cover >= 4, 'bank covers ' + cover + ' days');
  const start = C.dayNumber('2026-01-01');
  const days = [];
  for (let d = start; d < start + 3660; d++) {
    const today = C.dailyPromptIds(data.prompts, dayKey(d));
    assert.equal(today.length, 7, dayKey(d) + ' has ' + today.length + ' prompts');
    assert.equal(new Set(today).size, 7);
    days.push(today);
  }
  for (let i = cover - 1; i < days.length; i++) {
    const window = days.slice(i - cover + 1, i + 1).flat();
    assert.equal(new Set(window).size, window.length, 'a prompt repeats within ' + cover + ' days ending ' + dayKey(start + i));
  }
  const counts = {};
  days.flat().forEach((id) => (counts[id] = (counts[id] || 0) + 1));
  assert.equal(Object.keys(counts).length, data.prompts.length, 'every prompt is used');
  const values = Object.values(counts);
  assert.ok(Math.min(...values) > Math.max(...values) * 0.6, 'prompts are used roughly evenly');
});

test('A7: the draw is stable no matter which date is asked for first', () => {
  const a = C.dailyPromptIds(data.prompts.slice(), '2031-05-05');
  const b = C.dailyPromptIds(data.prompts.slice().reverse(), '2026-10-08');
  const fresh = require('child_process').execFileSync(process.execPath, ['-e', `
    const C = require(${JSON.stringify(path.join(__dirname, '..', 'js', 'core.js'))});
    const data = require(${JSON.stringify(path.join(__dirname, '..', 'data', 'prompts.json'))});
    process.stdout.write(JSON.stringify([C.dailyPromptIds(data.prompts, '2026-10-08'), C.dailyPromptIds(data.prompts, '2031-05-05')]));`], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(fresh), [b, a]);
  assert.equal(C.dailyPromptIds(data.prompts, '1999-12-31').length, 7, 'dates before the epoch still work');
});

/* ----- A8: answer matching ----- */

const buildings = data.prompts.find((p) => p.id === 'buildings');
const dining = data.prompts.find((p) => p.id === 'dining');
const nba = data.prompts.find((p) => p.id === 'nba');
const name = (p, s) => {
  const m = C.matchAnswer(p, s);
  return m.answer ? m.answer.name : null;
};

test('A8: matching on the real bank', () => {
  assert.equal(name(buildings, 'CULC'), 'Clough Undergraduate Learning Commons', 'alias');
  assert.equal(name(buildings, '   clough    commons  '), 'Clough Undergraduate Learning Commons', 'extra spaces');
  assert.equal(name(buildings, 'the klaus building'), 'Klaus Advanced Computing Building', '"the" prefix and optional suffix');
  assert.equal(name(buildings, 'THE TECH TOWER'), 'Tech Tower');
  assert.equal(name(dining, 'Junior’s Grill'), "Junior's Grill", 'curly apostrophe');
  assert.equal(name(dining, '“Junior‘s”'), "Junior's Grill", 'curly quotes');
  assert.equal(name(dining, 'chick-fil-a!!!'), 'Chick-fil-A', 'punctuation');
  assert.equal(name(dining, 'Môe’s'), "Moe's Southwest Grill", 'accents');
  assert.equal(name(nba, 'José Alvarado'), 'Jose Alvarado', 'accented input for an unaccented answer');
  assert.equal(name(data.prompts.find((p) => p.id === 'nicknames'), 'tar heel'), 'Tar Heels', 'singular for plural');
  assert.equal(name(data.prompts.find((p) => p.id === 'traditions'), 'rat caps'), 'RAT Cap', 'plural for singular');
});

test('A8: empty, enormous, emoji and markup input are all handled', () => {
  for (const s of ['', '   ', '\t\n', '!!!', '🐝', '🐝🐝 🍯', '​', null, undefined]) {
    assert.deepEqual(C.matchAnswer(buildings, s), { key: '', answer: null, fuzzy: false }, JSON.stringify(s));
  }
  assert.equal(name(buildings, '🐝 Klaus 🐝'), 'Klaus Advanced Computing Building', 'emoji around a real answer');
  const started = Date.now();
  assert.equal(name(buildings, 'k'.repeat(500000)), null);
  assert.equal(name(buildings, 'klaus '.repeat(50000)), null);
  assert.ok(Date.now() - started < 2000, 'huge input is rejected quickly');
  for (const s of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><b>Klaus', "'; DROP TABLE answers;--"]) {
    assert.equal(name(buildings, s), null, s);
  }
  assert.equal(name(buildings, '<b>Klaus</b>'), null, 'tags are not silently stripped into a match');
});

test('A8: a daily guess stores only short plain strings', () => {
  const run = C.newDaily('2026-10-08', [buildings.id].concat(ids.filter((i) => i !== buildings.id).slice(0, 6)));
  C.startRound(run, 0);
  C.dailyGuess(run, buildings, '<script>' + 'x'.repeat(100000), 10);
  assert.equal(run.round.tried[0].text.length, 60);
  assert.equal(run.round.tried[0].key.length, 80);
  assert.ok(JSON.stringify(run).length < 1000);
});

/* ----- A9: duplicates ----- */

test('A9: a repeated wrong guess costs nothing, in either mode, however it is typed', () => {
  const run = C.newDaily('2026-10-08', [buildings.id].concat(ids.filter((i) => i !== buildings.id).slice(0, 6)));
  C.startRound(run, 0);
  assert.equal(C.dailyGuess(run, buildings, 'Hogwarts Tower', 0).status, 'wrong');
  for (const again of ['Hogwarts Tower', 'hogwarts tower', '  HOGWARTS   TOWER!! ', 'the hogwarts tower', 'Hogwarts Towers', 'Hógwarts Tower']) {
    assert.equal(C.dailyGuess(run, buildings, again, 0).status, 'duplicate', again);
  }
  assert.equal(run.round.leftMs, 22000, 'one penalty only');
  assert.equal(run.round.tried.length, 1);

  const inf = C.newInfinite([buildings.id, ids[5]]);
  C.infiniteGuess(inf, buildings, 'Hogwarts Tower');
  assert.equal(C.infiniteGuess(inf, buildings, 'hogwarts towers').status, 'duplicate');
  assert.equal(inf.clockMs, 42000);
});

/* ----- B2: saved data ----- */

test('B2: saves carry a version, and old or broken saves are rejected rather than trusted', () => {
  const good = C.newDaily('2026-10-08', ids.slice(0, 7));
  assert.equal(good.v, C.SAVE_VERSION);
  assert.deepEqual(C.reviveDaily(JSON.parse(JSON.stringify(good)), known), good);
  const mutate = (fn) => {
    const copy = JSON.parse(JSON.stringify(good));
    fn(copy);
    return C.reviveDaily(copy, known);
  };
  const cases = {
    'older version': (s) => { s.v = 1; },
    'no version': (s) => { delete s.v; },
    'newer version': (s) => { s.v = 99; },
    'bad date': (s) => { s.date = '2026-13-45'; },
    'date not a string': (s) => { s.date = 20261008; },
    'too few prompts': (s) => { s.promptIds.pop(); },
    'unknown prompt': (s) => { s.promptIds[2] = 'retired-prompt'; },
    'repeated prompt': (s) => { s.promptIds[1] = s.promptIds[0]; },
    'results not an array': (s) => { s.results = {}; },
    'too many results': (s) => { s.results = Array(8).fill({ promptId: 'x', tier: null, answer: null }); },
    'result for the wrong prompt': (s) => { s.results = [{ promptId: s.promptIds[3], tier: 'solid', answer: 'x' }]; },
    'invented tier': (s) => { s.results = [{ promptId: s.promptIds[0], tier: 'mythic', answer: 'x' }]; },
    'round out of order': (s) => { s.round = { index: 3, leftMs: 1000, seenAt: 0, tried: [] }; },
    'negative time': (s) => { s.round = { index: 0, leftMs: -5, seenAt: 0, tried: [] }; },
    'NaN time': (s) => { s.round = { index: 0, leftMs: null, seenAt: 0, tried: [] }; },
    'tried is not a list': (s) => { s.round = { index: 0, leftMs: 1000, seenAt: 0, tried: 'abc' }; },
    'tried holds junk': (s) => { s.round = { index: 0, leftMs: 1000, seenAt: 0, tried: [null] }; },
    'finished flag disagrees with the results': (s) => { s.finished = true; },
  };
  Object.keys(cases).forEach((label) => assert.equal(mutate(cases[label]), null, label));
  for (const junk of [null, undefined, 0, '', 'text', [], [1, 2], true, { v: 2 }]) assert.equal(C.reviveDaily(junk, known), null);
});

test('B2: a tampered score is recomputed from the tiers, not believed', () => {
  const run = C.newDaily('2026-10-08', ids.slice(0, 7));
  const raw = JSON.parse(JSON.stringify(run));
  raw.results = [{ promptId: raw.promptIds[0], tier: 'common', answer: 'x', points: 100000, wrong: -4 }];
  const back = C.reviveDaily(raw, known);
  assert.equal(back.results[0].points, 10);
  assert.equal(back.results[0].wrong, 0);
});

test('B2: best-run saves are validated too', () => {
  assert.deepEqual(C.reviveBest({ v: C.SAVE_VERSION, score: 250, answered: 6, extra: 'ignored' }), { v: C.SAVE_VERSION, score: 250, answered: 6 });
  for (const bad of [null, 'x', { score: 5, answered: 1 }, { v: 1, score: 5, answered: 1 }, { v: C.SAVE_VERSION, score: -1, answered: 1 }, { v: C.SAVE_VERSION, score: 1.5, answered: 1 }, { v: C.SAVE_VERSION, score: '9', answered: 1 }]) {
    assert.equal(C.reviveBest(bad), null, JSON.stringify(bad));
  }
});
