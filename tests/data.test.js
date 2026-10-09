'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../js/core.js');
const data = require('../data/prompts.json');

const TIERS = ['common', 'clever', 'solid', 'rare', 'deep', 'swarm'];

test('the validator used by the app passes the shipped bank', () => {
  assert.deepEqual(C.validatePrompts(data), []);
});

test('there are at least 30 prompts with unique ids', () => {
  assert.ok(data.prompts.length >= 30, 'only ' + data.prompts.length + ' prompts');
  assert.equal(new Set(data.prompts.map((p) => p.id)).size, data.prompts.length);
});

test('every prompt has 25+ answers, valid tiers, and exactly one One in a Swarm', () => {
  data.prompts.forEach((p) => {
    assert.ok(p.text && p.category, p.id + ' is missing text or category');
    assert.ok(p.answers.length >= 25, p.id + ' has only ' + p.answers.length + ' answers');
    p.answers.forEach((a) => assert.ok(TIERS.includes(a.tier), p.id + ': ' + a.name + ' has tier ' + a.tier));
    assert.equal(p.answers.filter((a) => a.tier === 'swarm').length, 1, p.id + ' swarm count');
  });
});

test('every prompt offers an obvious answer and a too-clever one', () => {
  data.prompts.forEach((p) => {
    assert.ok(p.answers.some((a) => a.tier === 'common'), p.id + ' has no common answer');
    assert.ok(p.answers.some((a) => a.tier === 'clever'), p.id + ' has no too-clever answer');
  });
});

test('no answer or alias duplicates another within a prompt', () => {
  data.prompts.forEach((p) => {
    const owner = new Map();
    p.answers.forEach((a) => {
      [a.name].concat(a.aliases || []).forEach((s) => {
        const key = C.normalize(s, p);
        assert.ok(key, p.id + ': "' + s + '" normalizes to nothing');
        assert.ok(!owner.has(key), p.id + ': "' + s + '" collides with "' + owner.get(key) + '"');
        owner.set(key, s);
      });
    });
  });
});

test('every answer name and alias matches its own answer, exactly', () => {
  data.prompts.forEach((p) => {
    p.answers.forEach((a) => {
      [a.name].concat(a.aliases || []).forEach((s) => {
        const m = C.matchAnswer(p, s);
        assert.ok(m.answer, p.id + ': "' + s + '" does not match anything');
        assert.equal(m.answer.name, a.name, p.id + ': "' + s + '" matched ' + m.answer.name);
        assert.equal(m.fuzzy, false, p.id + ': "' + s + '" only matched fuzzily');
      });
    });
  });
});

test('the validator catches broken data', () => {
  const answers = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Answer ' + String.fromCharCode(65 + i), tier: i === 0 ? 'swarm' : 'solid' }));
  const base = () => ({ prompts: [{ id: 'a', category: 'c', text: 't', answers: answers(25) }] });
  assert.deepEqual(C.validatePrompts(base()), []);

  const tooFew = base();
  tooFew.prompts[0].answers.pop();
  assert.match(C.validatePrompts(tooFew).join(), /only 24 answers/);

  const noSwarm = base();
  noSwarm.prompts[0].answers[0].tier = 'solid';
  assert.match(C.validatePrompts(noSwarm).join(), /has 0 "swarm"/);

  const twoSwarm = base();
  twoSwarm.prompts[0].answers[1].tier = 'swarm';
  assert.match(C.validatePrompts(twoSwarm).join(), /has 2 "swarm"/);

  const badTier = base();
  badTier.prompts[0].answers[3].tier = 'legendary';
  assert.match(C.validatePrompts(badTier).join(), /invalid tier/);

  const dupAlias = base();
  dupAlias.prompts[0].answers[4].aliases = ['answer  B!'];
  assert.match(C.validatePrompts(dupAlias).join(), /duplicates/);

  const dupId = base();
  dupId.prompts.push(dupId.prompts[0]);
  assert.match(C.validatePrompts(dupId).join(), /duplicate id/);
});

test('VERIFY.md lists every answer marked verify, and nothing else', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', 'VERIFY.md'), 'utf8');
  const listed = (md.match(/^- \[ \] \*\*(.+?)\*\*/gm) || []).length;
  const facts = require('../js/facts.js');
  let flagged = 0;
  facts.filter((f) => f.verify).forEach((f) => {
    flagged += 1;
    assert.ok(md.includes('**' + f.text + '**'), 'VERIFY.md is missing the fact: ' + f.text);
  });
  data.prompts.forEach((p) => {
    p.answers.filter((a) => a.verify).forEach((a) => {
      flagged += 1;
      assert.ok(md.includes('`' + p.id + '`'), 'VERIFY.md has no section for ' + p.id);
      assert.ok(md.includes('**' + a.name + '**'), 'VERIFY.md is missing ' + p.id + ': ' + a.name);
    });
  });
  if (!flagged) assert.match(md, /Nothing is currently flagged/);
  assert.equal(listed, flagged, 'VERIFY.md lists ' + listed + ' items but the data flags ' + flagged);
});

test('the One in a Swarm answer is never one that still needs verifying', () => {
  data.prompts.forEach((p) => {
    const top = p.answers.find((a) => a.tier === 'swarm');
    assert.ok(!top.verify, p.id + ': the swarm answer "' + top.name + '" is unverified');
  });
});
