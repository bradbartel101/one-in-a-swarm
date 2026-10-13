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
const prompts = require('../data/prompts.json').prompts;
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
const redraw = process.argv[2] === '--redraw-future';
if (redraw && existing) {
  Object.keys(existing.days).forEach((k) => { if (k > today) delete existing.days[k]; });
}
const span = core.dayNumber(today) - core.dayNumber(core.LAUNCH_DATE) + 366;
// The first time, the file is filled with exactly what the game was already serving, so nothing
// changes for anyone on the day this ships. After that, new days are drawn fresh and appended.
const firstFill = existing ? null : (key) => core.dailyPromptIds(prompts, key);
const next = core.extendSchedule(existing, ids, core.LAUNCH_DATE, span, firstFill);
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
