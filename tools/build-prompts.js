#!/usr/bin/env node
/* Authoring tool: compiles the prompt sources into the files the game and the tests read.
   The site reads the committed output directly; run this only after editing a source file.

   Sources: tools/prompts.src.txt, then every tools/bank/*.src.txt (in name order), form the
   main bank. Every tools/themed/NAME.src.txt becomes data/themed/NAME.json (not loaded by the game).

   Source format:
     @id | CATEGORY | Prompt text | option | option ...
     C Answer name | alias | alias :: note shown to the player ?? reason this needs checking
     ! a guess that is NOT accepted :: why (kept for review, never shown to players)
   Tier letters: C common, T too clever, S solid, R rare, D deep cut, X one in a swarm.
   A leading "?" (e.g. "?D Name") marks the answer "verify": true.
   A leading "~" (e.g. "~D Name ?? why") holds the answer OUT of the game: it is not written to
   any game file, only listed in VERIFY.md until the owner approves it.

   Options on the @ line:
     pool=gt | pool=general     which half of the daily mix the prompt belongs to
     easy                       (general only) may open a flight in round 1
     clar=text                  the clarifier shown under the prompt (8 words or fewer)
     type=closed | type=open    closed = a fixed real-world list, and every member must be present
     count=N                    (closed) how many members the list has
     source=text                (closed) where the list was checked
     unverified                 the list could not be checked against a source (listed in VERIFY.md)
     retired                    no longer scheduled, kept only so days already scheduled still play
     strip=word,word  lead=word matching options, as before

   Output:
     data/index.json            what the game loads first: every prompt without its answers
     data/p/ID.json             one prompt with its answers; the game loads only the ones it needs
     data/prompts.json          the whole bank in one file, for the tests and tools (the game does not load it)
     data/review/meta.json      type, source, expected count and the rejected-guess lists, for review
     VERIFY.md                  everything that needs the owner's eye */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const facts = require('../js/facts.js');

const ROOT = path.join(__dirname, '..');
const TIER = { C: 'common', T: 'clever', S: 'solid', R: 'rare', D: 'deep', X: 'swarm' };
const FLAGS = ['easy', 'retired', 'unverified'];
const LISTS = ['strip', 'lead'];
const TEXTS = ['pool', 'clar', 'type', 'count', 'source'];

function parse(src, label) {
  const prompts = [];
  const held = [];
  let cur = null;
  src.split('\n').forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const at = label + ' line ' + (n + 1);
    if (line.startsWith('@')) {
      const parts = line.slice(1).split('|').map((s) => s.trim());
      cur = { id: parts[0], category: parts[1], text: parts[2], answers: [], meta: { rejected: [] } };
      parts.slice(3).forEach((opt) => {
        const m = /^(\w+)(?:=(.+))?$/.exec(opt);
        if (!m) throw new Error(at + ': bad option "' + opt + '"');
        if (FLAGS.includes(m[1]) && m[2] === undefined) cur.meta[m[1]] = true;
        else if (LISTS.includes(m[1]) && m[2]) cur[m[1]] = m[2].split(',').map((s) => s.trim().toLowerCase());
        else if (TEXTS.includes(m[1]) && m[2]) cur.meta[m[1]] = m[2].trim();
        else throw new Error(at + ': bad option "' + opt + '"');
      });
      prompts.push(cur);
      return;
    }
    if (!cur) throw new Error(at + ': an answer before any prompt');
    if (line.startsWith('!')) { // a guess that is deliberately not accepted
      const bits = line.slice(1).split(' :: ').map((s) => s.trim());
      if (!bits[0] || !bits[1]) throw new Error(at + ': a rejected guess needs "! guess :: reason"');
      cur.meta.rejected.push({ guess: bits[0], reason: bits[1] });
      return;
    }
    const h = /^~([CTSRDX])\s+(.+)$/.exec(line);
    if (h) { // held out: recorded for VERIFY.md, never shipped
      const bits = h[2].split(' ?? ').map((x) => x.trim());
      held.push({ prompt: cur, name: bits[0].split('|')[0].split(' :: ')[0].trim(), tier: TIER[h[1]], reason: bits[1] || '' });
      return;
    }
    const m = /^(\?)?([CTSRDX])\s+(.+)$/.exec(line);
    if (!m) throw new Error(at + ': cannot parse "' + line + '"');
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
  // what the game sees of a prompt, and what only reviewers see
  prompts.forEach((p) => {
    const m = p.meta;
    if (m.pool) p.pool = m.pool;
    if (m.clar) p.clarifier = m.clar;
    if (m.easy) p.easy = true;
    if (m.retired) p.retired = true;
    if (m.count !== undefined) m.count = Number(m.count);
  });
  const errors = core.validatePrompts({ version: 1, prompts });
  if (errors.length) {
    console.error(label + ':\n' + errors.join('\n'));
    process.exit(1);
  }
  return { prompts, held };
}

const HEAD = ['id', 'pool', 'category', 'text', 'clarifier', 'easy', 'retired', 'strip', 'lead'];
const head = (p, indent) => HEAD.filter((k) => p[k] !== undefined).map((k) => indent + JSON.stringify(k) + ': ' + JSON.stringify(p[k])).join(',\n');

// One answer per line keeps the JSON hand-readable and diffs small.
function promptJson(p, indent) {
  return indent + '{\n' + head(p, indent + '  ') + ',\n' + indent + '  "answers": [\n' + p.answers.map((a) => JSON.stringify(a)).join(',\n') + '\n' + indent + '  ]\n' + indent + '}';
}
const bankJson = (prompts) => '{\n  "version": 1,\n  "prompts": [\n' + prompts.map((p) => promptJson(p, '    ')).join(',\n') + '\n  ]\n}\n';

/* ----- the main bank ----- */
const bankDir = path.join(__dirname, 'bank');
const files = [path.join(__dirname, 'prompts.src.txt')].concat(fs.existsSync(bankDir) ? fs.readdirSync(bankDir).filter((f) => f.endsWith('.src.txt')).sort().map((f) => path.join(bankDir, f)) : []);
const main = parse(files.map((f) => fs.readFileSync(f, 'utf8')).join('\n'), 'bank');
const prompts = main.prompts;

fs.mkdirSync(path.join(ROOT, 'data', 'p'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'data', 'review'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'prompts.json'), bankJson(prompts.map((p) => { const q = Object.assign({}, p); delete q.meta; return q; })));
fs.writeFileSync(path.join(ROOT, 'data', 'index.json'), '{\n  "version": 1,\n  "prompts": [\n' + prompts.map((p) => '    {' + head(p, '').replace(/,\n/g, ', ') + ', "n": ' + p.answers.length + '}').join(',\n') + '\n  ]\n}\n');
// one file per prompt; files for prompts that no longer exist are removed
const wanted = new Set(prompts.map((p) => p.id + '.json'));
fs.readdirSync(path.join(ROOT, 'data', 'p')).forEach((f) => { if (!wanted.has(f)) fs.unlinkSync(path.join(ROOT, 'data', 'p', f)); });
prompts.forEach((p) => {
  const q = Object.assign({}, p);
  delete q.meta;
  fs.writeFileSync(path.join(ROOT, 'data', 'p', p.id + '.json'), promptJson(q, '') + '\n');
});
fs.writeFileSync(path.join(ROOT, 'data', 'review', 'meta.json'), '{\n  "version": 1,\n  "prompts": [\n' + prompts.map((p) => '    ' + JSON.stringify({
  id: p.id, pool: p.meta.pool || null, type: p.meta.type || null, count: p.meta.count === undefined ? null : p.meta.count, source: p.meta.source || null,
  unverified: !!p.meta.unverified, retired: !!p.meta.retired, answers: p.answers.length, rejected: p.meta.rejected,
})).join(',\n') + '\n  ]\n}\n');

/* ----- themed sets: compiled next to the main bank, never mixed into it ----- */
const themedDir = path.join(__dirname, 'themed');
const themed = fs.existsSync(themedDir) ? fs.readdirSync(themedDir).filter((f) => f.endsWith('.src.txt')).sort() : [];
const sets = themed.map((f) => {
  const name = f.replace(/\.src\.txt$/, '');
  const set = parse(fs.readFileSync(path.join(themedDir, f), 'utf8'), 'themed/' + f);
  const clash = set.prompts.filter((p) => prompts.some((q) => q.id === p.id));
  if (clash.length) throw new Error('themed/' + f + ': these ids are already used by the main bank: ' + clash.map((p) => p.id).join(', '));
  fs.mkdirSync(path.join(ROOT, 'data', 'themed'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'themed', name + '.json'), bankJson(set.prompts.map((p) => { const q = Object.assign({}, p); delete q.meta; return q; })));
  return { name, prompts: set.prompts, held: set.held };
});
const allHeld = main.held.concat([].concat.apply([], sets.map((s) => s.held)));

/* ----- VERIFY.md ----- */
const preface = fs.readFileSync(path.join(__dirname, 'verify-preface.md'), 'utf8').trim();
let md = preface + '\n';
const live = prompts.filter((p) => !p.retired);
const unverified = live.filter((p) => p.meta.unverified);
md += '\n## Flagged answers\n';
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
md += '\n## Held out of the game until approved\n\nThese answers are **not in the game**. Each was left out because I was not confident it is right, or that it fits the prompt. To approve one, delete its leading `~` in the source file under `tools/` and run `npm run build:data`.\n';
if (!allHeld.length) md += '\nNone.\n';
const heldBy = new Map();
allHeld.forEach((h) => heldBy.set(h.prompt, (heldBy.get(h.prompt) || []).concat(h)));
heldBy.forEach((list, p) => {
  md += '\n### ' + p.text + ' (`' + p.id + '`)\n\n';
  list.forEach((h) => { md += '- [ ] **' + h.name + '** (would be ' + core.TIERS[h.tier].label + ')' + (h.reason ? ': ' + h.reason : '') + '\n'; });
});

md += '\n## Lists I could not check against a source\n';
if (!unverified.length) md += '\nNone.\n';
unverified.forEach((p) => { md += '\n- [ ] **' + p.text + '** (`' + p.id + '`, ' + p.answers.length + ' answers' + (p.meta.type === 'closed' ? ', closed list' : '') + ')' + (p.meta.source ? ': ' + p.meta.source : '') + '\n'; });

fs.writeFileSync(path.join(ROOT, 'VERIFY.md'), md);

const total = prompts.reduce((s, p) => s + p.answers.length, 0);
const pools = {};
live.forEach((p) => { const k = (p.pool || 'none') + (p.easy ? ' (easy)' : ''); pools[k] = (pools[k] || 0) + 1; });
console.log(prompts.length + ' prompts (' + live.length + ' live, ' + (prompts.length - live.length) + ' retired), ' + total + ' answers, ' + flagged + ' flagged for verification');
console.log('pools: ' + Object.keys(pools).sort().map((k) => k + ' ' + pools[k]).join(', '));
if (process.argv.includes('--list')) prompts.forEach((p) => console.log('  ' + String(p.answers.length).padStart(4) + '  ' + (p.retired ? 'retired ' : (p.pool || '-').padEnd(8)) + p.id));
sets.forEach((s) => console.log('themed set "' + s.name + '": ' + s.prompts.length + ' prompts, ' + s.prompts.reduce((n, p) => n + p.answers.length, 0) + ' answers (not scheduled)'));
if (allHeld.length) console.log(allHeld.length + ' answers held out of the game (see VERIFY.md)');
