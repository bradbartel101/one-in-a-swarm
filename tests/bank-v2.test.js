'use strict';
/* Prompt bank v2: the rules every live prompt has to meet. These read the compiled files
   (data/prompts.json, data/index.json, data/review/meta.json) and the sources under tools/. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../js/core.js');

const ROOT = path.join(__dirname, '..');
const bank = require('../data/prompts.json').prompts;
const index = require('../data/index.json').prompts;
const meta = require('../data/review/meta.json').prompts;
const byId = Object.fromEntries(bank.map((p) => [p.id, p]));
const metaById = Object.fromEntries(meta.map((m) => [m.id, m]));
const live = bank.filter((p) => !p.retired);

const OPEN_MIN = 80; // an open list needs this many answers
const CLARIFIER_WORDS = 8;
const GT_TARGET = 60;

const sourceFiles = [path.join(ROOT, 'tools', 'prompts.src.txt')]
  .concat(fs.readdirSync(path.join(ROOT, 'tools', 'bank')).filter((f) => f.endsWith('.src.txt')).sort().map((f) => path.join(ROOT, 'tools', 'bank', f)));

// Held-out answers ("~" lines), read from the sources: prompt id -> every name and alias held.
function heldOut() {
  const held = {};
  let cur = null;
  sourceFiles.forEach((file) => fs.readFileSync(file, 'utf8').split('\n').forEach((raw) => {
    const line = raw.trim();
    if (line.startsWith('@')) { cur = line.slice(1).split('|')[0].trim(); return; }
    const m = /^~[CTSRDX]\s+(.+)$/.exec(line);
    if (m && cur) held[cur] = (held[cur] || []).concat(m[1].split(' ?? ')[0].split(' :: ')[0].split('|').map((s) => s.trim()).filter(Boolean));
  }));
  return held;
}

test('v2: the three compiled files describe the same prompts', () => {
  assert.deepEqual(index.map((p) => p.id), bank.map((p) => p.id));
  assert.deepEqual(meta.map((p) => p.id), bank.map((p) => p.id));
  bank.forEach((p) => {
    const i = index.find((q) => q.id === p.id);
    assert.equal(i.n, p.answers.length, p.id + ': index.json answer count');
    assert.equal(metaById[p.id].answers, p.answers.length, p.id + ': meta.json answer count');
    assert.equal(!!i.retired, !!p.retired, p.id + ': retired flag');
    assert.equal(i.pool, p.pool, p.id + ': pool');
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'p', p.id + '.json'), 'utf8'));
    assert.deepEqual(file, p, p.id + ': data/p file matches the bank');
  });
  const files = fs.readdirSync(path.join(ROOT, 'data', 'p')).sort();
  assert.deepEqual(files, bank.map((p) => p.id + '.json').sort(), 'one data/p file per prompt, no strays');
});

test('v2: every live prompt is in a pool, and only general prompts are easy openers', () => {
  live.forEach((p) => {
    assert.ok(p.pool === 'gt' || p.pool === 'general', p.id + ' has pool ' + p.pool);
    if (p.easy) assert.equal(p.pool, 'general', p.id + ' is easy but not general');
    assert.ok(C.mixPool(p), p.id + ' can be scheduled');
  });
  bank.filter((p) => p.retired).forEach((p) => assert.equal(C.mixPool(p), null, p.id + ' is retired and never scheduled again'));
});

test('v2: the gt pool has 60 prompts and every pool is big enough for the 14-day rule', () => {
  const plan = C.mixPlan(live);
  assert.equal(plan.pools.gt.ids.length, GT_TARGET, 'gt prompts');
  assert.ok(plan.ok, 'a pool is too small: ' + JSON.stringify(Object.fromEntries(Object.keys(plan.pools).map((k) => [k, plan.pools[k].ids.length]))));
  Object.keys(plan.pools).forEach((k) => assert.ok(plan.pools[k].gap >= C.MIX_MIN_GAP, k + ' gap ' + plan.pools[k].gap));
});

test('v2: an open list has at least 80 answers', () => {
  live.forEach((p) => {
    const m = metaById[p.id];
    assert.ok(m.type === 'open' || m.type === 'closed', p.id + ' has no type');
    if (m.type === 'open') assert.ok(p.answers.length >= OPEN_MIN, p.id + ' is an open list with only ' + p.answers.length + ' answers');
  });
});

test('v2: a closed list names its source and has every member', () => {
  live.filter((p) => metaById[p.id].type === 'closed').forEach((p) => {
    const m = metaById[p.id];
    assert.ok(Number.isInteger(m.count) && m.count > 0, p.id + ' is closed but has no count');
    assert.ok(m.source && m.source.length >= 8, p.id + ' is closed but names no source');
    assert.equal(p.answers.length, m.count, p.id + ': ' + p.answers.length + ' answers for a list of ' + m.count);
  });
});

test('v2: clarifiers are eight words or fewer and prompt text fits above a phone keyboard', () => {
  live.forEach((p) => {
    if (p.clarifier !== undefined) {
      const words = p.clarifier.trim().split(/\s+/).length;
      assert.ok(words >= 1 && words <= CLARIFIER_WORDS, p.id + ': clarifier is ' + words + ' words: "' + p.clarifier + '"');
      assert.ok(!/[.!?]$/.test(p.clarifier), p.id + ': clarifier ends with punctuation');
    }
    assert.ok(p.text.length <= 90, p.id + ': prompt text is ' + p.text.length + ' characters');
    assert.equal(p.category, p.category.toUpperCase(), p.id + ': live categories are upper case');
  });
});

test('v2: every live prompt has an answer in each of the six tiers, and exactly one 100-pointer', () => {
  live.forEach((p) => {
    const n = (tier) => p.answers.filter((a) => a.tier === tier).length;
    assert.ok(n('common') >= 1, p.id + ' has no common answer');
    assert.ok(n('clever') >= 1, p.id + ' has no too-clever answer');
    assert.equal(n('swarm'), 1, p.id + ' swarm answers');
    ['solid', 'rare', 'deep'].forEach((tier) => assert.ok(n(tier) >= 1, p.id + ' has no ' + tier + ' answer')); // every score is reachable on every prompt
    assert.ok(n('common') <= p.answers.length / 2, p.id + ': more than half the answers are common');
    assert.ok(p.answers.every((a) => !a.verify), p.id + ' ships an answer still marked for verification');
  });
});

test('v2: a guess on the rejected list is never also an accepted answer', () => {
  bank.forEach((p) => {
    metaById[p.id].rejected.forEach((r) => {
      assert.ok(r.guess && r.reason, p.id + ': a rejected guess needs a reason');
      const key = C.normalize(r.guess, p);
      const idx = C.buildIndex(p);
      assert.ok(!idx.exact.has(key), p.id + ': "' + r.guess + '" is rejected but also accepted as "' + idx.labels.get(key) + '"');
    });
  });
});

test('v2: an answer held out for checking is not accepted by its own prompt, and is listed in VERIFY.md', () => {
  const verify = fs.readFileSync(path.join(ROOT, 'VERIFY.md'), 'utf8');
  const held = heldOut();
  let count = 0;
  Object.keys(held).forEach((id) => {
    const p = byId[id];
    assert.ok(p, 'held answers under an unknown prompt: ' + id);
    const idx = C.buildIndex(p);
    held[id].forEach((name) => {
      count += 1;
      assert.ok(!idx.exact.has(C.normalize(name, p)), id + ': "' + name + '" is held out but still accepted');
    });
    assert.ok(verify.includes('(`' + id + '`)'), 'VERIFY.md has no held-out section for ' + id);
  });
  assert.ok(count > 0, 'the held-out mechanism is in use');
});

test('v2: lists that could not be checked against a source are named in VERIFY.md', () => {
  const verify = fs.readFileSync(path.join(ROOT, 'VERIFY.md'), 'utf8').split('## Lists I could not check against a source')[1] || '';
  meta.filter((m) => m.unverified && !m.retired).forEach((m) => assert.ok(verify.includes('(`' + m.id + '`'), m.id + ' is unverified but missing from VERIFY.md'));
});

test('v2: no two live prompts ask the same question', () => {
  const seen = new Map();
  live.forEach((p) => {
    const key = C.normalize(p.text);
    assert.ok(!seen.has(key), p.id + ' repeats the text of ' + seen.get(key));
    seen.set(key, p.id);
  });
});

/* ----- the schedule after the v2 redraw ----- */
const schedule = require('../data/schedule.json');
const FIRST_MIX_DAY = '2026-10-17';
// The days that were published before the redraw. They may never change again.
const PUBLISHED = {
  '2026-10-08': ['gacolleges', 'traditions', 'systems', 'buildings', 'cs', 'streets', 'proteams'],
  '2026-10-09': ['hangouts', 'nicknames', 'hq', 'beaten', 'dorms', 'coaches', 'olympics'],
  '2026-10-10': ['bowls', 'dining', 'golf', 'orgs', 'corecourses', 'marta', 'nba'],
  '2026-10-11': ['alumni', 'majors', 'diamond', 'neighborhoods', 'conference', 'techs', 'codes'],
  '2026-10-12': ['gacolleges', 'systems', 'proteams', 'cs', 'qbs', 'buildings', 'greek'],
  '2026-10-13': ['olympics', 'nicknames', 'coaches', 'streets', 'nfl', 'beaten', 'landmarks'],
  '2026-10-14': ['films', 'falcons', 'units', 'musicians', 'heisman', 'collegetowns', 'hawks'],
  '2026-10-15': ['languages', 'braves', 'traditions', 'engineering', 'dorms', 'elements', 'hangouts'],
  '2026-10-16': ['marta', 'corecourses', 'dining', 'golf', 'orgs', 'hq', 'nba'],
};

test('v2 schedule: the days published before the redraw are exactly as they were', () => {
  Object.keys(PUBLISHED).forEach((d) => assert.deepEqual(schedule.days[d], PUBLISHED[d], d + ' changed'));
  // retired prompts on those days still exist, so the days still play
  const known = new Set(bank.map((p) => p.id));
  Object.keys(PUBLISHED).forEach((d) => assert.ok(C.scheduledIds(schedule, d, known), d + ' names a prompt that no longer exists'));
});

test('v2 schedule: from the first mix day on, every day is 4 gt + 3 general in order, with no retired prompt', () => {
  const days = Object.keys(schedule.days).filter((d) => d >= FIRST_MIX_DAY);
  assert.ok(days.length >= 360, 'about a year of mix days: ' + days.length);
  const check = C.checkMix(schedule, live, FIRST_MIX_DAY, days.length);
  assert.deepEqual(check.errors, []);
  days.forEach((d) => {
    const day = schedule.days[d].map((id) => byId[id]);
    assert.ok(day.every((p) => p && !p.retired), d + ' uses a retired or missing prompt');
    assert.deepEqual(day.map((p) => p.pool), ['general', 'gt', 'gt', 'general', 'gt', 'general', 'gt'], d);
    assert.equal(day[0].easy, true, d + ' opens with an easy general prompt');
  });
});

test('v2 schedule: no prompt returns within 14 days, and every live prompt is used', () => {
  const days = Object.keys(schedule.days).filter((d) => d >= FIRST_MIX_DAY);
  const { gaps } = C.checkMix(schedule, live, FIRST_MIX_DAY, days.length);
  assert.ok(gaps.gt >= C.MIX_MIN_GAP && gaps.easy >= C.MIX_MIN_GAP && gaps.general >= C.MIX_MIN_GAP, JSON.stringify(gaps));
  const used = new Set(days.flatMap((d) => schedule.days[d]));
  live.forEach((p) => assert.ok(used.has(p.id), p.id + ' is never scheduled'));
  // a prompt scheduled before the redraw does not come straight back after it
  const all = Object.keys(schedule.days);
  const last = {};
  all.forEach((d, i) => schedule.days[d].forEach((id) => {
    if (last[id] !== undefined && d >= FIRST_MIX_DAY) assert.ok(i - last[id] >= C.MIX_MIN_GAP, id + ' returns after ' + (i - last[id]) + ' days on ' + d);
    last[id] = i;
  }));
});
