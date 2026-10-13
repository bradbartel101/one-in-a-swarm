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

const fs = require('fs');
const path = require('path');

test('there is exactly one sun: it only ever sinks and warms, and once set it never returns', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'scene.js'), 'utf8');
  assert.equal(src.match(/drawSun\(\);/g).length, 1, 'the sun is drawn once per frame');
  assert.equal(src.match(/sunAt\(cam\)/g).length, 1, 'and from one place');
  let prev = Scene.sunAt(0);
  assert.ok(prev.y > 0.05 && prev.y < 0.25, 'high in the sky over campus');
  let set = false;
  for (let s = 1; s <= 3200; s++) {
    const sun = Scene.sunAt(s);
    if (!sun) { set = true; continue; }
    assert.equal(set, false, 'the sun reappeared at ' + s + ' points');
    assert.ok(sun.y > prev.y, 'it sinks as the swarm climbs (' + s + ')');
    assert.ok(sun.y - prev.y < 0.01, 'slowly: far less than the world moves');
    assert.ok(sun.warm >= prev.warm);
    prev = sun;
  }
  assert.ok(set && prev.y > 1, 'it leaves by the bottom edge, at the horizon');
  // the altitudes from the bug report: lower each time, and gone by 62,000 ft
  const at = (feet) => Scene.sunAt(C.scoreForFeet(feet));
  assert.ok(at(500).y < at(9000).y && at(9000).y < at(13000).y && at(13000).y < at(27000).y);
  assert.equal(at(62000), null);
  assert.notEqual(Scene.sunAt(0).core, Scene.sunAt(250).core, 'and it changes colour on the way');
  // it keeps to the left of the sky: the answer tag is in the middle and the tier labels on the right
  for (let p = 0; p < Scene.SUN_SET; p += 5) assert.ok(Scene.sunAt(p).x > 0.08 && Scene.sunAt(p).x < 0.2, 'left of the sky at ' + p);
});

test('the lower sky changes: it deepens every few thousand feet, and there is a cloud deck to fly through', () => {
  const rgb = (feet) => Scene.skyAt(C.scoreForFeet(feet)).match(/\d+/g).map(Number);
  const stops = [0, 1000, 3000, 6000, 9000, 13000, 20000].map(rgb);
  for (let i = 1; i < stops.length; i++) {
    const d = Math.hypot(stops[i][0] - stops[i - 1][0], stops[i][1] - stops[i - 1][1], stops[i][2] - stops[i - 1][2]);
    assert.ok(d >= 14, 'a visible step between stop ' + (i - 1) + ' and ' + i + ': ' + stops[i - 1] + ' -> ' + stops[i]);
    assert.ok(stops[i][0] < stops[i - 1][0] && stops[i][1] < stops[i - 1][1], 'always deeper, never lighter');
  }
  assert.ok(Math.hypot(...stops[0].map((v, k) => v - stops[6][k])) > 180, 'the ground and 20,000 ft look nothing alike');
  // the deck sits where 3,000 to 6,000 ft is, and is drawn on both sides of the swarm
  assert.ok(Scene.CUMULUS.from <= C.scoreForFeet(3000) && Scene.CUMULUS.to >= C.scoreForFeet(6000));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'scene.js'), 'utf8');
  const order = ['drawCumulus(t, false);', 'drawBees(t);', 'drawCumulus(t, true);'].map((call) => src.indexOf(call));
  assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], 'clouds behind the bee, the bee, then clouds in front');
  assert.match(src, /drawMorning\(\);/);
});

test('tier lines glow as the answer passes; nothing about them changes size', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const pulse = css.slice(css.indexOf('@keyframes line-pulse'), css.indexOf('}', css.indexOf('100%', css.indexOf('@keyframes line-pulse'))) + 1);
  assert.match(pulse, /box-shadow/);
  assert.doesNotMatch(pulse, /scale|transform|font-size|zoom/, 'Regression: the pulse used to scale the line, and its label with it');
});

test('sixteen sightings, with something to find in every zone', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'scene.js'), 'utf8');
  const block = src.slice(src.indexOf('const SIGHTINGS = ['), src.indexOf('];', src.indexOf('const SIGHTINGS = [')));
  const found = [...block.matchAll(/\{ id: '(\w+)', score: ([^,]+(?:\([^)]*\))?), x: ([\d.]+), caption: (['"])(.+?)\4/g)].map((m) => {
    const feet = /^at\((.+)\)$/.exec(m[2]);
    const score = feet ? C.scoreForFeet(Function('return ' + feet[1])()) : Number(m[2]);
    return { id: m[1], score, x: Number(m[3]), caption: m[5], zone: Scene.zoneAt(score).id };
  });
  assert.equal(found.length, 16);
  assert.equal(new Set(found.map((g) => g.id)).size, 16);
  const perZone = {};
  found.forEach((g) => { perZone[g.zone] = (perZone[g.zone] || 0) + 1; });
  Scene.ZONES.forEach((z) => assert.ok(perZone[z[1]] >= 1, 'something to find in ' + z[1] + ': ' + JSON.stringify(perZone)));
  // the four added overnight went where there was least: midtown, high sky, stratosphere, space
  const added = { drone: 'midtown', paperplane: 'highsky', jumper: 'stratosphere', teapot: 'space' };
  Object.keys(added).forEach((id) => assert.equal(found.filter((g) => g.id === id)[0].zone, added[id], id));
  found.forEach((g) => {
    assert.ok(g.caption.length >= 10 && g.caption.length <= 60, g.id + ' caption fits one or two lines');
    assert.ok(g.x >= 0 && g.x <= 0.8, g.id + ' keeps clear of the ruler');
    assert.match(src, new RegExp('\\n      ' + g.id + '\\('), g.id + ' has art');
  });
  // every sighting is in the player's log, and the log's total matches
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const eggs = app.slice(app.indexOf('const EGGS = ['), app.indexOf('];', app.indexOf('const EGGS = [')));
  found.forEach((g) => assert.ok(eggs.includes("['" + g.id + "'"), g.id + ' is in the sightings log'));
  assert.equal((eggs.match(/\['\w+', /g) || []).length, 26, '16 sightings, 6 secrets, 4 things to do');
  assert.doesNotMatch(found.map((g) => g.caption).join(' '), /Domino|Pizza Hut|Papa John|DJI|Red Bull|NASA|SpaceX/i, 'no brand names');
});
