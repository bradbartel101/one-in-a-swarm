#!/usr/bin/env node
/* Content validator for data/prompts.json. Run: npm run validate
   Checks the shipped JSON itself (not the authoring source), so hand edits are caught too. */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'prompts.json'), 'utf8'));
const errors = core.validatePrompts(data);
// Themed sets (data/themed/*.json) wait to be scheduled; they are held to the same rules.
const themedDir = path.join(ROOT, 'data', 'themed');
const themed = fs.existsSync(themedDir) ? fs.readdirSync(themedDir).filter((f) => f.endsWith('.json')).map((f) => ({ name: f, data: JSON.parse(fs.readFileSync(path.join(themedDir, f), 'utf8')) })) : [];
themed.forEach((t) => core.validatePrompts(t.data).forEach((e) => errors.push('themed/' + t.name + ': ' + e)));
const TIERS = Object.keys(core.TIERS);
const blank = (s) => typeof s !== 'string' || s.trim() === '' || s !== s.trim();

if ((data.prompts || []).length < 30) errors.push('only ' + (data.prompts || []).length + ' prompts (need 30)');
(data.prompts || []).concat([].concat.apply([], themed.map((t) => t.data.prompts || []))).forEach((p) => {
  ['id', 'category', 'text'].forEach((k) => {
    if (blank(p[k])) errors.push(p.id + ': "' + k + '" is empty or has stray whitespace');
  });
  if (typeof p.text === 'string' && p.text.length > 90) errors.push(p.id + ': prompt text is ' + p.text.length + ' characters (limit 90, so it fits above a phone keyboard)');
  (p.answers || []).forEach((a) => {
    if (blank(a.name)) errors.push(p.id + ': an answer name is empty or has stray whitespace');
    (a.aliases || []).forEach((s) => {
      if (blank(s)) errors.push(p.id + ': "' + a.name + '" has an empty alias');
    });
    if (a.note !== undefined && blank(a.note)) errors.push(p.id + ': "' + a.name + '" has an empty note');
    if (!TIERS.includes(a.tier)) errors.push(p.id + ': "' + a.name + '" has tier ' + a.tier);
    if (a.tier === 'swarm' && a.verify) errors.push(p.id + ': the 100-point answer "' + a.name + '" is unverified');
  });
  if (!(p.answers || []).some((a) => a.tier === 'common')) errors.push(p.id + ': no Common answer');
});

const total = (data.prompts || []).reduce((n, p) => n + (p.answers || []).length, 0);
const flagged = (data.prompts || []).reduce((n, p) => n + (p.answers || []).filter((a) => a.verify).length, 0);
if (errors.length) {
  console.error('Content validation FAILED:\n  ' + errors.join('\n  '));
  process.exit(1);
}
if (themed.length) console.log('Themed sets OK: ' + themed.map((t) => t.name + ' (' + t.data.prompts.length + ' prompts)').join(', ') + '.');
console.log('Content OK: ' + data.prompts.length + ' prompts, ' + total + ' answers, exactly one 100-point answer each, ' + flagged + ' still flagged "verify".');
