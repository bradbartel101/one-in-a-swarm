#!/usr/bin/env node
/* Authoring tool: compiles tools/prompts.src.txt into data/prompts.json and VERIFY.md.
   The site reads the committed JSON directly; run this only after editing the source file.

   Source format:
     @id | Category | Prompt text | strip=word,word | lead=word
     C Answer name | alias | alias :: note shown to the player ?? reason this needs checking
   Tier letters: C common, T too clever, S solid, R rare, D deep cut, X one in a swarm.
   A leading "?" (e.g. "?D Name") marks the answer "verify": true. */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const facts = require('../js/facts.js');

const ROOT = path.join(__dirname, '..');
const TIER = { C: 'common', T: 'clever', S: 'solid', R: 'rare', D: 'deep', X: 'swarm' };

const src = fs.readFileSync(path.join(__dirname, 'prompts.src.txt'), 'utf8');
const prompts = [];
let cur = null;

src.split('\n').forEach((raw, n) => {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return;
  if (line.startsWith('@')) {
    const parts = line.slice(1).split('|').map((s) => s.trim());
    cur = { id: parts[0], category: parts[1], text: parts[2], answers: [] };
    parts.slice(3).forEach((opt) => {
      const m = /^(strip|lead)=(.+)$/.exec(opt);
      if (!m) throw new Error('line ' + (n + 1) + ': bad option "' + opt + '"');
      cur[m[1]] = m[2].split(',').map((s) => s.trim().toLowerCase());
    });
    prompts.push(cur);
    return;
  }
  const m = /^(\?)?([CTSRDX])\s+(.+)$/.exec(line);
  if (!m || !cur) throw new Error('line ' + (n + 1) + ': cannot parse "' + line + '"');
  let body = m[3];
  let reason = '';
  let note = '';
  if (body.includes(' ?? ')) [body, reason] = body.split(' ?? ').map((s) => s.trim());
  if (body.includes(' :: ')) [body, note] = body.split(' :: ').map((s) => s.trim());
  const names = body.split('|').map((s) => s.trim()).filter(Boolean);
  const answer = { name: names[0], tier: TIER[m[2]] };
  const seen = new Set([core.normalize(names[0], cur)]);
  const aliases = names.slice(1).filter((a) => {
    const k = core.normalize(a, cur);
    if (seen.has(k)) return false; // same key as the name or an earlier alias: redundant
    seen.add(k);
    return true;
  });
  if (aliases.length) answer.aliases = aliases;
  if (note) answer.note = note;
  if (m[1]) {
    answer.verify = true;
    if (reason) answer.verifyReason = reason;
  }
  cur.answers.push(answer);
});

const data = { version: 1, prompts };
const errors = core.validatePrompts(data);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

// One answer per line keeps the JSON hand-editable and diffs readable.
const json =
  '{\n  "version": 1,\n  "prompts": [\n' +
  prompts
    .map((p) => {
      const head = ['id', 'category', 'text', 'strip', 'lead']
        .filter((k) => p[k] !== undefined)
        .map((k) => '      ' + JSON.stringify(k) + ': ' + JSON.stringify(p[k]))
        .join(',\n');
      const answers = p.answers.map((a) => '        ' + JSON.stringify(a)).join(',\n');
      return '    {\n' + head + ',\n      "answers": [\n' + answers + '\n      ]\n    }';
    })
    .join(',\n') +
  '\n  ]\n}\n';
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'prompts.json'), json);

const preface = fs.readFileSync(path.join(__dirname, 'verify-preface.md'), 'utf8').trim();
let md = preface + '\n\n## Flagged answers\n';
let flagged = 0;
prompts.forEach((p) => {
  const list = p.answers.filter((a) => a.verify);
  if (!list.length) return;
  md += '\n### ' + p.text + ' (`' + p.id + '`, ' + p.answers.length + ' answers)\n\n';
  list.forEach((a) => {
    flagged += 1;
    md += '- [ ] **' + a.name + '** (' + core.TIERS[a.tier].label + ')' + (a.verifyReason ? ': ' + a.verifyReason : '') + '\n';
  });
});
const flaggedFacts = facts.filter((f) => f.verify);
if (flaggedFacts.length) {
  md += '\n### Altitude facts (`js/facts.js`, ' + facts.length + ' facts)\n\n';
  flaggedFacts.forEach((f) => {
    flagged += 1;
    md += '- [ ] **' + f.text + '** ' + f.verify + '\n';
  });
}
if (!flagged) md += '\nNone. Nothing is currently flagged.\n';
fs.writeFileSync(path.join(ROOT, 'VERIFY.md'), md);

const total = prompts.reduce((s, p) => s + p.answers.length, 0);
console.log(prompts.length + ' prompts, ' + total + ' answers, ' + flagged + ' flagged for verification');
prompts.forEach((p) => console.log('  ' + String(p.answers.length).padStart(3) + '  ' + p.id));
