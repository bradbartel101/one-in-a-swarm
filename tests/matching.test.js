'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const prompt = {
  id: 't',
  strip: ['hall', 'building'],
  lead: ['cs'],
  answers: [
    { name: 'Clough Undergraduate Learning Commons', tier: 'common', aliases: ['CULC', 'Clough'] },
    { name: 'José Alvarado', tier: 'solid' },
    { name: "Junior's Grill", tier: 'clever', aliases: ['Juniors'] },
    { name: 'Yellow Jackets', tier: 'solid' },
    { name: 'Tar Heel', tier: 'rare' },
    { name: 'Glenn Hall', tier: 'solid' },
    { name: 'CS 1332', tier: 'common' },
    { name: 'CS 1331', tier: 'common' },
    { name: 'Chick-fil-A', tier: 'solid' },
    { name: 'Floor & Decor', tier: 'deep' },
    { name: 'Sympathetic Vibrations', tier: 'rare' },
    { name: 'Alpha Phi', tier: 'rare' },
    { name: 'Alpha Chi', tier: 'rare' },
    { name: 'Sideways', tier: 'swarm' },
  ],
};
const hit = (s) => {
  const m = C.matchAnswer(prompt, s);
  return m.answer ? m.answer.name : null;
};

test('case and surrounding whitespace are ignored', () => {
  assert.equal(hit('  cLoUgH  '), 'Clough Undergraduate Learning Commons');
  assert.equal(hit('SIDEWAYS'), 'Sideways');
});

test('aliases resolve to their answer', () => {
  assert.equal(hit('CULC'), 'Clough Undergraduate Learning Commons');
  assert.equal(hit('culc'), 'Clough Undergraduate Learning Commons');
});

test('accents are stripped on both sides', () => {
  assert.equal(hit('Jose Alvarado'), 'José Alvarado');
  assert.equal(hit('JOSÉ ALVARADO'), 'José Alvarado');
  assert.equal(hit('Clôugh'), 'Clough Undergraduate Learning Commons');
});

test('punctuation is ignored', () => {
  assert.equal(hit('juniors grill'), "Junior's Grill");
  assert.equal(hit("Junior’s Grill!!"), "Junior's Grill");
  assert.equal(hit('chick fil a'), 'Chick-fil-A');
  assert.equal(hit('chickfila'), 'Chick-fil-A');
  assert.equal(hit('Floor and Decor'), 'Floor & Decor');
  assert.equal(hit('floor & decor.'), 'Floor & Decor');
});

test('plurals match in both directions', () => {
  assert.equal(hit('yellow jacket'), 'Yellow Jackets');
  assert.equal(hit('Yellow Jackets'), 'Yellow Jackets');
  assert.equal(hit('tar heels'), 'Tar Heel');
  assert.equal(hit('sympathetic vibration'), 'Sympathetic Vibrations');
});

test('optional lead and trailing words can be dropped', () => {
  assert.equal(hit('Glenn'), 'Glenn Hall');
  assert.equal(hit('glenn hall'), 'Glenn Hall');
  assert.equal(hit('1332'), 'CS 1332');
  assert.equal(hit('cs1332'), 'CS 1332');
  assert.equal(hit('CS 1332'), 'CS 1332');
});

test('numbers are never fuzzy-matched', () => {
  assert.equal(hit('1333'), null);
  assert.equal(hit('cs 133'), null);
  assert.equal(hit('1331'), 'CS 1331');
});

test('a one-letter slip on a long answer is forgiven and reported as fuzzy', () => {
  const m = C.matchAnswer(prompt, 'sidewyas');
  assert.equal(m.answer.name, 'Sideways');
  assert.equal(m.fuzzy, true);
  assert.equal(C.matchAnswer(prompt, 'sideways').fuzzy, false);
});

test('a typo equally close to two answers matches neither', () => {
  assert.equal(hit('alphashi'), null); // one edit from both Alpha Phi and Alpha Chi
  assert.equal(hit('alpha phi'), 'Alpha Phi');
});

test('short answers get no typo tolerance', () => {
  assert.equal(hit('culk'), null);
  assert.equal(hit('glen'), null);
});

test('wrong and empty input', () => {
  assert.equal(hit('Bobby Dodd Stadium'), null);
  assert.equal(C.matchAnswer(prompt, '   ').key, '');
  assert.equal(C.matchAnswer(prompt, '?!').key, '');
  assert.equal(C.matchAnswer(prompt, null).key, '');
});

test('duplicate wrong guesses are rejected without a second penalty', () => {
  const s = C.newDaily('2026-10-08', ['t']);
  C.startRound(s, 0);
  assert.equal(C.dailyGuess(s, prompt, 'Skiles', 1000).status, 'wrong');
  const afterFirst = C.remainingMs(s, 1000);
  assert.equal(C.dailyGuess(s, prompt, '  SKILES. ', 1000).status, 'duplicate');
  assert.equal(C.dailyGuess(s, prompt, 'skile', 1000).status, 'duplicate'); // singular of a tried guess
  assert.equal(C.remainingMs(s, 1000), afterFirst);
});

test('normalize handles the awkward real cases', () => {
  assert.equal(C.normalize('The Varsity'), 'varsity');
  assert.equal(C.normalize('D.M. Smith Building', { strip: ['building'] }), 'dmsmith');
  assert.equal(C.normalize('University of Georgia', { lead: ['university', 'of'] }), 'georgia');
  assert.equal(C.normalize('u[sic]GA'), 'usicga');
  assert.equal(C.normalize('Brookhaven/Oglethorpe'), 'brookhavenoglethorpe');
  assert.equal(C.normalize('Hall', { strip: ['hall'] }), 'hall'); // never strips down to nothing
  assert.equal(C.normalize('and'), 'and');
});
