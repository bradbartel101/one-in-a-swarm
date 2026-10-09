'use strict';
/* The shape of the world: zones, depth layers, scale, and the facts placed in it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const { SwarmScene: Scene } = require('../js/scene.js');
const facts = require('../js/facts.js');

test('eight zones, by points, in the order of the brief', () => {
  assert.deepEqual(Scene.ZONES.map((z) => [z[0], z[1]]), [[0, 'campus'], [40, 'midtown'], [110, 'clouds'], [200, 'weather'], [300, 'highsky'], [420, 'stratosphere'], [550, 'space'], [650, 'moon']]);
  assert.equal(Scene.zoneAt(0).id, 'campus');
  assert.equal(Scene.zoneAt(39.9).id, 'campus');
  assert.equal(Scene.zoneAt(40).id, 'midtown');
  assert.equal(Scene.zoneAt(549).id, 'stratosphere');
  assert.equal(Scene.zoneAt(700).id, 'moon');
});

test('a normal flight passes through three or more zones and ends somewhere new', () => {
  const crossed = (score) => new Set(Array.from({ length: score + 1 }, (_, s) => Scene.zoneAt(s).id)).size;
  assert.equal(crossed(150), 3, 'a 150-point flight: campus, skyline, low clouds');
  assert.equal(crossed(350), 5);
  assert.equal(crossed(700), 8, 'a perfect flight sees all eight');
  assert.notEqual(Scene.zoneAt(150).id, Scene.zoneAt(0).id);
  assert.ok(crossed(70) >= 2, 'even seven obvious answers leave campus');
});

test('at least three depth layers that scroll at different speeds', () => {
  const speeds = Object.values(Scene.LAYERS);
  assert.ok(new Set(speeds).size >= 3, 'layers: ' + speeds.join(', '));
  assert.equal(Scene.LAYERS.near, 1, 'the near layer moves with the camera, so altitudes on it are true');
  assert.ok(Scene.LAYERS.far < Scene.LAYERS.mid && Scene.LAYERS.mid < 1 && Scene.LAYERS.front > 1);
});

test('climb distance depends only on points: 10 points is 60% of a screen, 100 points is six screens', () => {
  assert.equal(Scene.SCREENS_PER_POINT, 0.06);
  assert.ok(Math.abs(Scene.SCREENS_PER_POINT * 10 - 0.6) < 1e-9);
  assert.ok(Math.abs(Scene.SCREENS_PER_POINT * 100 - 6) < 1e-9);
});

test('facts are in altitude order, inside the world, and land in the right zones', () => {
  for (let i = 1; i < facts.length; i++) assert.ok(facts[i].feet > facts[i - 1].feet, facts[i].text);
  facts.forEach((f) => {
    const s = C.scoreForFeet(f.feet);
    assert.ok(s > 0 && s <= 700.01, f.text + ' sits at ' + s.toFixed(1));
    assert.ok(f.text.length <= 100, 'short enough to read on the way past: ' + f.text);
  });
  const zoneOf = (feet) => Scene.zoneAt(C.scoreForFeet(feet)).id;
  assert.equal(zoneOf(1023), 'midtown', 'the tallest tower in Atlanta is in the skyline');
  assert.equal(zoneOf(6500), 'clouds');
  assert.equal(zoneOf(35000), 'highsky');
  assert.equal(zoneOf(100000), 'stratosphere');
  assert.equal(zoneOf(250 * 5280), 'space');
  assert.equal(zoneOf(238855 * 5280), 'moon');
  assert.ok(facts.length >= 28);
  const zones = new Set(facts.map((f) => zoneOf(f.feet)));
  assert.ok(zones.size >= 7, 'facts appear in ' + zones.size + ' of 8 zones');
});
