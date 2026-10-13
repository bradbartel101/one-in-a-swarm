#!/usr/bin/env node
/* Extends data/schedule.json, which pins every date to its seven prompts.
   Days already in the file are never changed; new days are appended, a year ahead of today.
   Run: npm run build:schedule            (extend)
        node tools/build-schedule.js --redraw-future    (keep every day up to and including today,
                                                         draw every later day again from the current
                                                         prompt bank: use after adding prompts)
        node tools/build-schedule.js --check old.json   (fail if a day up to today in old.json changed) */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');

const FILE = path.join(__dirname, '..', 'data', 'schedule.json');
const prompts = require('../data/index.json').prompts; // ids, pools and flags; no answers needed here
const ids = prompts.map((p) => p.id);
const existing = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;

if (process.argv[2] === '--check') {
  // A day that has been played, or is being played, may never change. Days still in the future
  // may be drawn again (when prompts are added), so they are reported but do not fail the check.
  const old = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const now = core.utcDateKey(new Date());
  const differs = Object.keys(old.days || {}).filter((d) => JSON.stringify(old.days[d]) !== JSON.stringify(existing && existing.days[d]));
  const changed = differs.filter((d) => d <= now);
  if (differs.length > changed.length) console.log((differs.length - changed.length) + ' future days were drawn again (allowed: nobody has played them).');
  if (changed.length) {
    console.error('Schedule changed for dates that were already published: ' + changed.slice(0, 5).join(', ') + (changed.length > 5 ? ' and ' + (changed.length - 5) + ' more' : ''));
    process.exit(1);
  }
  console.log('Schedule OK: every day up to today (' + now + ') is unchanged.');
  process.exit(0);
}

const today = core.utcDateKey(new Date());
const arg = (name) => { const hit = process.argv.find((a) => a === name || a.startsWith(name + '=')); return hit === undefined ? null : hit.includes('=') ? hit.split('=')[1] : true; };
const redraw = !!arg('--redraw-future');
// --keep=N also leaves the next N days as they are, so a change merged a few days from now
// cannot alter a day that has become "today" in the meantime.
const keepDays = Number(arg('--keep')) || 0;
const frozenTo = core.utcDateKey(new Date((core.dayNumber(today) + keepDays) * 86400000));
if (redraw && existing) {
  Object.keys(existing.days).forEach((k) => { if (k > frozenTo) delete existing.days[k]; });
}
const span = core.dayNumber(today) - core.dayNumber(core.LAUNCH_DATE) + 366 + keepDays;
const live = prompts.filter((p) => !p.retired);
const mixed = live.some((p) => core.mixPool(p));
let next;
if (mixed) {
  // The daily mix: four gt and three general prompts a day (see core.MIX_ORDER).
  const stray = live.filter((p) => !core.mixPool(p));
  if (stray.length) {
    console.error('These live prompts have no pool: ' + stray.map((p) => p.id).join(', '));
    process.exit(1);
  }
  const plan = core.mixPlan(live);
  Object.keys(plan.pools).forEach((k) => console.log('  pool ' + k.padEnd(8) + plan.pools[k].ids.length + ' prompts, ' + plan.pools[k].slots + ' a day: no repeat within ' + plan.pools[k].gap + ' days'));
  if (!plan.ok && !arg('--allow-short')) {
    console.error('A pool is too small for the ' + core.MIX_MIN_GAP + '-day rule (gt needs ' + core.MIX_MIN_GAP * 4 + ', easy general ' + core.MIX_MIN_GAP + ', other general ' + core.MIX_MIN_GAP * 2 + '). Nothing was written.');
    process.exit(1);
  }
  next = core.extendMixSchedule(existing, live, core.LAUNCH_DATE, span);
  const firstNew = Object.keys(next.days).filter((k) => !(existing && existing.days[k]))[0];
  if (firstNew) {
    const check = core.checkMix(next, live, firstNew, core.dayNumber(Object.keys(next.days).pop()) - core.dayNumber(firstNew) + 1);
    console.log('  first day of the mix: ' + firstNew + ' (order: ' + core.MIX_ORDER.join(', ') + ')');
    console.log('  smallest gap between two uses of a prompt: gt ' + check.gaps.gt + ' days, easy general ' + check.gaps.easy + ' days, other general ' + check.gaps.general + ' days');
    if (check.errors.length && !arg('--allow-short')) {
      console.error('The new days break the mix rules:\n  ' + check.errors.slice(0, 8).join('\n  '));
      process.exit(1);
    }
  }
} else {
  // The first time, the file is filled with exactly what the game was already serving, so nothing
  // changes for anyone on the day this ships. After that, new days are drawn fresh and appended.
  const firstFill = existing ? null : (key) => core.dailyPromptIds(prompts, key);
  next = core.extendSchedule(existing, ids, core.LAUNCH_DATE, span, firstFill);
}
const keys = Object.keys(next.days);
const known = new Set(ids);
const broken = keys.filter((k) => core.dayNumber(k) >= core.dayNumber(today) && !core.scheduledIds(next, k, known));
if (broken.length) {
  console.error('These scheduled days name a prompt that no longer exists: ' + broken.slice(0, 5).join(', ') + '. Restore the prompt id; the game falls back to an unscheduled draw on those days.');
  process.exit(1);
}
fs.writeFileSync(FILE, '{\n  "version": 1,\n  "days": {\n' + keys.map((k) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(next.days[k])).join(',\n') + '\n  }\n}\n');
const added = keys.length - (existing ? Object.keys(existing.days).length : 0);
console.log('Schedule: ' + keys.length + ' days, ' + keys[0] + ' to ' + keys[keys.length - 1] + ' (' + added + ' added, none changed).');
