#!/usr/bin/env node
'use strict';
/* Browser tests in headless Chrome. Run with: npm run test:e2e
   The site is served from a subpath, the way GitHub Pages serves a project site. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { launch, sleep } = require('./cdp.js');
const C = require('../../js/core.js');
const data = require('../../data/prompts.json');
const schedule = require('../../data/schedule.json');

const ROOT = path.join(__dirname, '..', '..');
const SUBPATH = '/some-user-repo/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const only = process.argv[2];

const server = { mode: 'ok', stray: [] };
const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const notFound = () => {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(fs.readFileSync(path.join(ROOT, '404.html')));
  };
  if (!url.pathname.startsWith(SUBPATH)) {
    server.stray.push(url.pathname);
    return notFound();
  }
  let rel = decodeURIComponent(url.pathname.slice(SUBPATH.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return notFound();
  if (rel === 'config.js' && server.config) { // the owner's settings, filled in
    res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
    return res.end('window.SwarmConfig = ' + JSON.stringify(server.config) + ';');
  }
  if (rel === 'data/prompts.json' && server.mode === 'badjson') {
    res.writeHead(200, { 'content-type': TYPES['.json'] });
    return res.end('{"version": 1, "prompts": [');
  }
  if (rel === 'data/prompts.json' && server.mode === 'changed') { // two new prompts in front, order reversed
    const copy = JSON.parse(fs.readFileSync(file, 'utf8'));
    const extra = (id) => Object.assign({}, copy.prompts[0], { id });
    copy.prompts = [extra('brand-new-one'), extra('another-new-one')].concat(copy.prompts.reverse());
    res.writeHead(200, { 'content-type': TYPES['.json'] });
    return res.end(JSON.stringify(copy));
  }
  if (rel === 'data/prompts.json' && server.mode === '500') {
    res.writeHead(500);
    return res.end('nope');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
});

let base = '';
let browser = null;
const results = [];

/* ---------- helpers ---------- */

const byText = new Map(data.prompts.map((p) => [p.text, p]));
const promptOf = (text) => {
  const p = byText.get(text);
  assert.ok(p, 'unknown prompt on screen: ' + text);
  return p;
};
const answerOf = (text, tier) => promptOf(text).answers.find((a) => a.tier === tier).name;
const view = (page) => page.eval('document.querySelector("[data-view]:not([hidden])").dataset.view');
const phase = (page) => page.eval('document.body.dataset.phase');
const text = (page, id) => page.eval('document.getElementById(' + JSON.stringify(id) + ').textContent');
const click = (page, id) => page.eval('document.getElementById(' + JSON.stringify(id) + ').click()');
const saved = (page) => page.eval('JSON.parse(localStorage.getItem("swarm.daily"))');
const barScale = (page) => page.eval('Number(/scaleX\\(([\\d.]+)\\)/.exec(document.getElementById("barFill").style.transform)[1])');
const waitPhase = (page, name, ms) => page.waitFor('document.body.dataset.phase === "' + name + '"', ms || 9000, 'phase ' + name);
const feet = (score) => C.altitudeText(score);
const altNum = (score) => C.altitudeParts(score).value;
const noProblems = (page, allow) => {
  const bad = page.problems.filter((p) => !(allow && allow.test(p)));
  assert.deepEqual(bad, [], 'console problems');
};
const SEEN = 'localStorage.setItem("swarm.seenHowTo", "{\\"v\\":2}");';

// A controllable wall clock. performance.now() is left alone, as it is on a real device.
const fakeClock = (iso) => `(() => {
  const R = Date;
  let off = sessionStorage.getItem('__off') === null ? ${Date.parse(iso)} - R.now() : Number(sessionStorage.getItem('__off'));
  sessionStorage.setItem('__off', off);
  class D extends R {
    constructor(...a) { if (a.length) super(...a); else super(R.now() + off); }
    static now() { return R.now() + off; }
  }
  window.Date = D;
  window.__shiftClock = (ms) => { off += ms; sessionStorage.setItem('__off', off); };
})();`;

// Lets a test hide the page the way a browser does: document.hidden turns true, visibilitychange
// fires, and requestAnimationFrame stops delivering frames until the page is shown again.
const hideable = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let hidden = false;
  let waiting = [];
  window.requestAnimationFrame = (cb) => { if (hidden) { waiting.push(cb); return 0; } return raf(cb); };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  window.__setHidden = (v) => { hidden = v; document.dispatchEvent(new Event('visibilitychange')); if (!v) { const w = waiting; waiting = []; w.forEach((cb) => raf(cb)); } };
  window.__stallFrames = () => { hidden = true; }; // frames stop, but the page is never told
})();`;

// Most scenarios run with reduced motion, which skips the long climb and keeps the suite quick.
// The ones that test the animation pass { reducedMotion: false }.
// Pages also believe it is midday unless a test says otherwise, so the small-hours easter egg
// cannot fire just because the suite happens to run at night.
const MIDDAY = 'Date.prototype.getHours = function () { return 12; };';
const calm = (opts) => Object.assign({ reducedMotion: true }, opts, { initScript: (opts && opts.realHours ? '' : MIDDAY) + ((opts && opts.initScript) || '') });
const openPages = [];
const track = (page) => { openPages.push(page); return page; };

async function open(opts, url) {
  const page = track(await browser.newPage(calm(opts)));
  await page.goto(url || base);
  return page;
}

async function ready(page) {
  await page.waitFor('document.body.dataset.phase !== "loading"', 10000, 'app boot');
}

async function fresh(opts) {
  // A page whose first-visit rules have already been seen.
  const page = track(await browser.newPage(calm(opts)));
  await page.goto(base + '404-probe-for-origin');
  await page.eval(SEEN);
  page.problems.length = 0; // the probe page is a deliberate 404
  await page.goto(base);
  await ready(page);
  return page;
}

// From the reveal card (or the liftoff countdown) to a live round.
async function startNextRound(page) {
  if ((await view(page)) === 'between') {
    await sleep(650); // the double-Enter guard
    await click(page, 'nextBtn');
  }
  await waitPhase(page, 'guess');
}

async function guess(page, value) {
  await page.waitFor('!document.getElementById("guess").dataset.locked', 3000, 'the re-submit lock to lift');
  await page.eval('(() => { const g = document.getElementById("guess"); g.focus(); g.value = ' + JSON.stringify(value) + '; })()');
  await page.eval('document.getElementById("guessForm").requestSubmit()');
}

async function playDaily(page, tiers) {
  for (let i = (await saved(page) || { results: [] }).results.length; i < tiers.length; i++) {
    if ((await phase(page)) !== 'guess') await startNextRound(page);
    const prompt = await text(page, 'promptText');
    if (tiers[i] === 'miss') await page.eval('window.__shiftClock(60000)');
    else await guess(page, answerOf(prompt, tiers[i]));
    await waitPhase(page, 'reveal', 12000);
  }
}

async function land(page) {
  await sleep(650);
  await click(page, 'nextBtn');
  await waitPhase(page, 'results');
}

async function scenario(name, fn) {
  if (only && !only.toLowerCase().split('|').some((part) => name.toLowerCase().includes(part))) return;
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log('✔ ' + name + ' (' + (Date.now() - started) + 'ms)' + (note ? '\n    ' + note : ''));
  } catch (err) {
    results.push({ name, ok: false });
    console.log('✖ ' + name + '\n    ' + String(err && err.stack ? err.stack : err).split('\n').slice(0, 6).join('\n    '));
  }
  // A failed scenario must not leave its pages running behind the next one.
  while (openPages.length) await openPages.pop().close().catch(() => {});
}

const TIERS7 = ['common', 'clever', 'solid', 'rare', 'deep', 'swarm', 'solid'];
// The seven prompts the game serves on a date: the frozen schedule first, the draw only as a fallback.
const dayIds = (dateKey) => (schedule.days[dateKey] || C.dailyPromptIds(data.prompts, dateKey)).slice();

/* ---------- scenarios ---------- */

async function main() {
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + httpServer.address().port + SUBPATH;
  browser = await launch();

  await scenario('title screen: rules and sightings are collapsed by default and open on demand', async () => {
    const page = await open({ width: 1440, height: 900 });
    await ready(page);
    assert.equal(await view(page), 'home');
    assert.equal(await page.eval('document.getElementById("howDlg").open'), false, 'rules are collapsed, even on a first visit');
    await page.eval('document.querySelector("#howDlg summary").click()');
    assert.equal(await page.eval('document.getElementById("howDlg").open'), true, 'and open on demand');
    assert.equal(await text(page, 'sightCount'), '0/21');
    assert.equal(await page.eval('document.querySelectorAll("#sightGrid li.unfound").length'), 21, 'unfound sightings are silhouettes');
    assert.match(await text(page, 'flightNo'), /^FLIGHT #\d+$/);
    // the lawn fills about the bottom quarter of the start screen
    const lawn = await page.eval('window.__swarm.scene.cssY(0) / window.innerHeight');
    assert.ok(lawn > 0.7 && lawn < 0.8, 'lawn starts ' + (lawn * 100).toFixed(0) + '% down the screen');
    noProblems(page);
    await page.close();
  });

  await scenario('daily run, keyboard only, desktop: play, share, refresh shows results again', async () => {
    const page = await open({ width: 1440, height: 900 });
    await ready(page);
    const focusRing = () => page.eval('(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + " " + s.outlineWidth; })()');
    assert.equal(await page.eval('document.activeElement.id'), 'homeTitle');
    await page.tab();
    assert.equal(await page.eval('document.activeElement.id'), 'dailyBtn', 'first Tab stop after the title is the begin button');
    assert.equal(await focusRing(), 'solid 3px', 'focus ring on the begin button');
    await page.enter();
    const got = [];
    for (let i = 0; i < 7; i++) {
      await waitPhase(page, 'guess');
      assert.equal(await page.eval('document.activeElement.id'), 'guess', 'focus is in the answer box');
      assert.equal(await text(page, 'hudText'), 'Round ' + (i + 1) + ' of 7');
      const prompt = await text(page, 'promptText');
      if (i === 0) {
        const before = await barScale(page);
        await page.type('definitely not an answer');
        await page.enter();
        assert.match(await text(page, 'feedback'), /no buzz/);
        assert.equal(await page.eval('document.activeElement.id'), 'guess', 'focus stays in the box after a wrong guess');
        await sleep(500);
        const afterWrong = await barScale(page);
        // Regression: a wrong guess used to take 3 of the 25 seconds (0.12 of the bar).
        assert.ok(before - afterWrong < 0.05, 'a wrong guess costs no time: only the half second that passed, got ' + (before - afterWrong).toFixed(3));
        assert.doesNotMatch(await text(page, 'feedback'), /−|-\d|3s/, 'and the message no longer mentions a penalty');
        // the same guess again, typed differently: ignored, with no message and no count
        await page.eval('document.getElementById("feedback").textContent = "(unchanged)"');
        await page.type('  Definitely NOT an answer!! '); // the old text is still selected, so this replaces it
        await page.enter();
        assert.equal(await text(page, 'feedback'), '(unchanged)', 'a duplicate says nothing');
        assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 1, 'and is not counted');
        // the cooldown: a second submit inside 350 ms is ignored, the same submit after it counts
        await sleep(400);
        await page.type('first of two');
        await page.enter();
        await page.type('second of two'); // typing is never blocked
        await page.enter();
        assert.equal(await page.eval('document.getElementById("guess").value'), 'second of two');
        assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 2, 'the submit inside the cooldown did nothing');
        await page.waitFor('!document.getElementById("guess").dataset.locked', 2000, 'the cooldown to end');
        await page.enter();
        assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 3, 'and counts once the cooldown is over');
        await sleep(400);
        assert.ok(before - (await barScale(page)) < 0.12, 'three wrong guesses, a duplicate and a blocked submit: still only real time gone');
        await page.eval('document.getElementById("guess").value = ""');
      }
      const answer = answerOf(prompt, TIERS7[i]);
      got.push(answer);
      await page.type(answer);
      await page.enter();
      await waitPhase(page, 'reveal');
      assert.equal(await page.eval('document.activeElement.id'), 'nextBtn', 'focus lands on the reveal card button');
      assert.equal(await focusRing(), 'solid 3px');
      assert.equal(await text(page, 'nextBtn'), i === 6 ? 'LAND ▼' : 'CLIMB ▲');
      await sleep(650);
      await page.enter();
    }
    await waitPhase(page, 'results');
    assert.equal(await text(page, 'resMisses'), '3', 'wrong guesses are totalled on the results');
    // launch settings ship empty: no counter script, no cookies, no feedback link
    assert.equal(await page.eval('document.getElementById("visitCounter")'), null, 'no visit counter is loaded while the site code is empty');
    assert.equal(await page.eval('document.cookie'), '');
    assert.equal(await page.eval('document.getElementById("feedbackRow").hidden'), true, 'the feedback link is hidden while its address is empty');
    assert.deepEqual(await page.eval('Array.from(document.querySelectorAll("#breakdown .misses")).map((n) => n.textContent)'), ['Round 1 · 3 misses'], 'and shown for the round they happened in');
    assert.doesNotMatch(await page.eval('document.getElementById("shareBox").value'), /miss|wrong/i, 'but never in the share text');
    assert.equal(await page.eval('document.getElementById("caption").getClientRects().length'), 0, 'no caption floats over the results');
    assert.equal(await text(page, 'resScore'), '330 pts');
    assert.equal(await text(page, 'resAlt'), feet(330));
    assert.equal(await text(page, 'resBand'), C.bandFor(330).name.toUpperCase());
    assert.equal(await page.eval('document.activeElement.id'), 'resBand');
    let tabs = 0;
    while ((await page.eval('document.activeElement.id')) !== 'copyBtn') {
      await page.tab();
      assert.ok(++tabs < 6, 'copy button reachable by Tab');
    }
    await page.enter();
    await page.waitFor('document.getElementById("copyStatus").textContent === "Copied!"', 3000, 'copy confirmation');
    const share = await page.eval('document.getElementById("shareBox").value');
    assert.equal(await page.eval('navigator.clipboard.readText()'), share, 'clipboard holds the share text');
    const lines = share.split('\n');
    assert.match(lines[0], /^One in a Swarm 🐝 Flight #\d+$/);
    assert.equal(lines[1], '⬜🟩🟧🟦🟪🐝🟧');
    assert.equal(lines[2], '330 pts · ' + feet(330) + ' up');
    assert.equal(lines[3], base, 'share text ends with the game URL');
    got.forEach((a) => assert.ok(!share.includes(a), 'share text leaks the answer ' + a));
    assert.deepEqual(await page.eval('["statStreak","statPlayed","statAvg","statBest"].map((id) => document.getElementById(id).textContent)'), ['1', '1', '330', '330']);
    // refresh: the finished day comes straight back as results, and cannot be replayed
    const before = await saved(page);
    await page.reload();
    await ready(page);
    assert.equal(await view(page), 'results', 'refresh returns to the results screen');
    assert.equal(await text(page, 'resScore'), '330 pts');
    assert.equal(await text(page, 'statPlayed'), '1', 'a refresh does not count the flight twice');
    await click(page, 'resHomeBtn');
    assert.equal(await text(page, 'dailyBtn'), "SEE TODAY'S FLIGHT");
    await click(page, 'dailyBtn');
    assert.equal(await view(page), 'results', 'the begin button only reopens results');
    assert.deepEqual(await saved(page), before, 'saved run unchanged');
    noProblems(page);
    assert.deepEqual(server.stray, [], 'every request stayed under the subpath');
    await page.close();
    return 'share text:\n    ' + lines.join('\n    ');
  });

  await scenario('the climb: world never resets, tag stops on its tier line, sky changes, reveal card', async () => {
    const page = await fresh({ width: 375, height: 812, mobile: true, reducedMotion: false });
    const hud = () => page.eval('({ alt: document.getElementById("hudAlt").textContent, score: document.getElementById("hudScore").textContent })');
    // Copy one pixel of the sky into a scratch canvas and read it there.
    // (Six samples along the top row, keeping the darkest, so a star or a cloud cannot fool it.)
    const skyTop = () => page.eval('(() => { const t = document.createElement("canvas"); t.width = 6; t.height = 1; const g = t.getContext("2d"); const w = document.getElementById("world"); for (let i = 0; i < 6; i++) g.drawImage(w, 3 + i * 11, 1, 1, 1, i, 0, 1, 1); const d = g.getImageData(0, 0, 6, 1).data; let best = null; for (let i = 0; i < 24; i += 4) { const px = [d[i], d[i + 1], d[i + 2]]; if (!best || px[0] + px[1] + px[2] < best[0] + best[1] + best[2]) best = px; } return best.join(","); })()');
    const groundSky = await skyTop();
    assert.equal(await page.eval('getComputedStyle(document.getElementById("world")).imageRendering'), 'pixelated');
    await page.eval('document.fonts.ready');
    assert.equal(await page.eval('document.fonts.check("12px \\"Press Start 2P\\"")'), true, 'the pixel font loaded');
    await click(page, 'dailyBtn');
    await waitPhase(page, 'intro', 2000);
    assert.match(await text(page, 'liftoff'), /^lifting off · the clock starts in [12]$/);
    assert.equal((await saved(page)).round, null, 'the clock is not running during liftoff');
    const t0 = Date.now();
    await waitPhase(page, 'guess');
    assert.ok(Date.now() - t0 > 1200, 'liftoff lasts about two seconds');
    assert.ok((await saved(page)).round.leftMs > 24000, 'the round starts with a full clock');
    assert.deepEqual(await hud(), { alt: '0', score: '0' });

    // round 1: a rare answer. Watch the climb.
    const answer = answerOf(await text(page, 'promptText'), 'rare');
    // Regression: the climb starts at once. Timed inside the page: from the submit to the first
    // frame in which the answer is a tag and the camera has moved.
    await page.eval(`window.__start = null; (function watch() { const s = window.__swarm; if (window.__t0 && !window.__start && s.camera() > 0.05 && !document.getElementById('tag').hidden) window.__start = performance.now() - window.__t0; if (!window.__start) setTimeout(watch, 8); })();
      document.getElementById('guessForm').addEventListener('submit', () => { window.__t0 = performance.now(); }, true);`);
    const sent = Date.now();
    await guess(page, answer);
    await waitPhase(page, 'climb', 1000);
    await page.waitFor('window.__start !== null', 1500, 'the climb to start');
    const startedIn = Math.round(await page.eval('window.__start'));
    assert.ok(startedIn <= 200, 'the answer becomes a tag and the world starts moving ' + startedIn + 'ms after the submit');
    await sleep(Math.max(0, 500 - (Date.now() - sent)));
    const mid = await page.eval(`({
      tag: document.getElementById('tag').textContent, tagHidden: document.getElementById('tag').hidden,
      alt: Number(document.getElementById('hudAlt').textContent.replace(/,/g, '')), y0: window.__swarm.scene.cssY(0), vh: window.innerHeight,
      lines: [...document.querySelectorAll('.tier-line')].map((n) => n.textContent + (n.classList.contains('on') ? ' ON' : '')),
      dock: getComputedStyle(document.getElementById('dock')).visibility })`);
    assert.equal(mid.tag, answer, 'the answer rides up as a tag');
    assert.equal(mid.tagHidden, false);
    assert.ok(mid.alt > 0 && mid.alt < C.altitudeFeet(60), 'the altitude counter is counting up mid-climb: ' + mid.alt);
    assert.deepEqual(mid.lines.map((l) => l.replace(' ON', '')), ['COMMON · 10', 'CLEVER · 15', 'SOLID · 30', 'RARE · 60'], 'tier lines up to the one earned');
    assert.ok(mid.lines[0].endsWith('ON'), 'the first line has appeared');
    assert.equal(mid.dock, 'hidden', 'the answer bar steps aside for the climb');
    const midScore = Number(await text(page, 'hudScore'));
    assert.ok(midScore > 0 && midScore < 60, 'regression: the HUD score counts up with the climb instead of jumping (' + midScore + ' at 500ms)');
    await waitPhase(page, 'reveal', 6000);
    const took = Date.now() - sent;
    assert.ok(took > 3000 && took < 4600, 'a rare climb takes about 3.4s, took ' + took + 'ms');
    const end = await page.eval(`(() => { const tag = document.getElementById('tag').getBoundingClientRect(); const lines = [...document.querySelectorAll('.tier-line')];
      const last = lines[lines.length - 1].getBoundingClientRect();
      return { on: lines.filter((n) => n.classList.contains('on')).length, gap: Math.round(last.top - tag.bottom), tagTop: tag.top }; })()`);
    assert.equal(end.on, 4, 'all four lines are showing');
    assert.deepEqual(await page.eval('[...document.querySelectorAll(".tier-line.won")].map((n) => n.textContent + " " + getComputedStyle(n).borderTopStyle)'), ['RARE · 60 solid'], 'the line it stopped on is the one solid, highlighted line');
    // Regression: no fact is ever partly under the HUD, the reveal text or the button. A fact is
    // visible only when all of it is inside the safe area.
    const stray = await page.eval(`(() => { const hud = document.getElementById('hud').getBoundingClientRect().bottom; const floor = document.getElementById('nextBtn').getBoundingClientRect().top;
      return [...document.querySelectorAll('#worldLayer .fact')].filter((n) => getComputedStyle(n).opacity > 0.05).map((n) => n.getBoundingClientRect()).filter((r) => r.top < hud || r.bottom > floor).length; })()`);
    assert.equal(stray, 0, 'no visible fact crosses the HUD or the button');
    // Regression: the answer tag never sits on a fact or a tier label.
    const clash = await page.eval(`(() => { const t = document.getElementById('tag').getBoundingClientRect();
      const hits = (r) => r.bottom > t.top && r.top < t.bottom && r.right > t.left && r.left < t.right;
      return [...document.querySelectorAll('#worldLayer .fact, #worldLayer .tier-line span')].filter((n) => getComputedStyle(n).opacity > 0.1 && hits(n.getBoundingClientRect())).map((n) => n.textContent); })()`);
    assert.deepEqual(clash, [], 'nothing is under the answer tag');
    // Regression: the ruler is the top layer. Its line is one unbroken colour from top to bottom,
    // and there is no dark band behind it any more: the column beside it is sky.
    const ruler = await page.eval(`(() => { const c = document.getElementById('world'); const t = document.createElement('canvas'); t.width = 2; t.height = c.height;
      const g = t.getContext('2d'); g.drawImage(c, c.width - 2, 0, 2, c.height, 0, 0, 2, c.height); const d = g.getImageData(0, 0, 2, c.height).data;
      const line = new Set(); for (let i = 0; i < d.length; i += 8) line.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return { line: [...line], beside: d[4] + ',' + d[5] + ',' + d[6] }; })()`);
    assert.deepEqual(ruler.line, ['244,241,230'], 'nothing is drawn over the ruler line');
    assert.notEqual(ruler.beside, '11,42,74', 'no dark band behind the ruler');
    assert.ok(end.gap >= 0 && end.gap < 60, 'the tag has stopped just above its own tier line (gap ' + end.gap + 'px)');
    const beeAt = await page.eval('(() => { const b = window.__swarm.scene.box("bee"); return (b.y + b.h / 2) / window.innerHeight; })()');
    assert.ok(beeAt > 0.45 && beeAt < 0.68, 'the bee rides about 60% down the screen, with the sky ahead in view: ' + (beeAt * 100).toFixed(0) + '%');
    const overBee = await page.eval('(() => { const r = document.getElementById("reveal").getBoundingClientRect(); const b = window.__swarm.scene.box("bee"); return r.bottom > b.y + 4 && r.top < b.y + b.h; })()');
    assert.equal(overBee, false, 'the reveal text does not cover the bee');
    assert.equal(await page.eval('getComputedStyle(document.getElementById("reveal")).clipPath'), 'none', 'the reveal is not a panel');
    assert.deepEqual(await hud(), { alt: altNum(60), score: '60' });
    assert.equal(await text(page, 'lastBadge'), 'RARE');
    assert.equal(await text(page, 'lastAnswer'), answer);
    assert.equal(await text(page, 'lastPoints'), '+60 PTS · now at ' + feet(60));
    assert.ok((await text(page, 'lastNote')).startsWith(C.TIERS.rare.quip.split('.')[0]));
    assert.ok(await page.eval('Array.from(document.getElementById("lastIcon").getContext("2d").getImageData(0, 0, 24, 20).data).some((v) => v > 0)'), 'the tier artwork is drawn');
    assert.equal(await page.eval('document.querySelector("#pips li").dataset.tier'), 'rare');

    // round 2 starts where round 1 ended
    await startNextRound(page);
    assert.deepEqual(await hud(), { alt: altNum(60), score: '60' }, 'the world did not reset');
    assert.equal(await page.eval('document.querySelectorAll(".tier-line").length'), 0, 'old tier lines are cleared');
    await guess(page, answerOf(await text(page, 'promptText'), 'swarm'));
    await page.waitFor('document.getElementById("flash").classList.contains("go")', 8000, 'the gold flash');
    assert.equal(await phase(page), 'climb', 'the top answer gets a beat to itself before the card');
    await waitPhase(page, 'reveal', 3000);
    assert.equal(await page.eval('document.getElementById("reveal").classList.contains("is-swarm")'), true);
    assert.equal(await text(page, 'lastBadge'), 'ONE IN A SWARM');
    assert.deepEqual(await hud(), { alt: altNum(160), score: '160' });
    // Regression: the same points climb the same distance on screen, wherever you are.
    const perPoint = await page.eval('window.__swarm.scene.cssPerPoint()');
    const vh = await page.eval('window.innerHeight');
    assert.ok(Math.abs(perPoint * 10 - 0.6 * vh) < 2, 'a 10-point answer climbs 60% of a screen: ' + (perPoint * 10).toFixed(1) + 'px of ' + vh);
    const climbed = [];
    for (const tier of ['clever', 'deep', 'clever']) { // 15 points low down, then 15 points 100 points higher
      await startNextRound(page);
      const before = await page.eval('window.__swarm.scene.cssY(0)');
      await guess(page, answerOf(await text(page, 'promptText'), tier));
      await waitPhase(page, 'reveal', 8000);
      await sleep(900); // let the camera settle on the reveal card
      climbed.push({ tier, y: before, after: await page.eval('window.__swarm.camera()') });
    }
    assert.equal(climbed[0].after - 160, 15);
    assert.equal(climbed[2].after - climbed[1].after, 15);
    assert.ok(Math.abs(perPoint * 15 - 0.9 * vh) < 3, '15 points is always ' + (perPoint * 15).toFixed(0) + 'px, 90% of a screen, at 160 points and at 260');
    await playDaily(page, ['', '', '', '', '', 'swarm', 'swarm']);
    const spaceSky = await skyTop();
    assert.notEqual(spaceSky, groundSky, 'the sky at the top is not the sky at the bottom');
    const sum = (rgb) => rgb.split(',').reduce((n, v) => n + Number(v), 0);
    assert.ok(sum(spaceSky) < sum(groundSky) / 3, 'and it is far darker up here: ' + groundSky + ' -> ' + spaceSky);
    assert.equal(await page.eval('window.__swarm.scene.cssY(0) > window.innerHeight * 20'), true, 'the lawn is more than twenty screens below');
    await land(page);
    assert.equal(await text(page, 'resScore'), '475 pts');
    assert.equal(await page.eval('document.querySelectorAll("#flightLog li").length'), 7);
    // the flight log: one column per round at the altitude reached, on eight zone bands
    assert.deepEqual(await page.eval('[...document.querySelectorAll("#flightLog li")].map((n) => Number(n.dataset.reached))'), [60, 160, 175, 260, 275, 375, 475]);
    assert.equal(await page.eval('document.querySelectorAll("#logBands li").length'), 8);
    const heights = await page.eval('[...document.querySelectorAll("#flightLog .pip-icon")].map((n) => Math.round(n.getBoundingClientRect().top))');
    for (let i = 1; i < heights.length; i++) assert.ok(heights[i] < heights[i - 1], 'each round sits higher than the one before: ' + heights.join(', '));
    const body = await page.eval('document.querySelector("[data-view=results]").innerText');
    assert.ok(!/%|players|percentile|better than/i.test(body), 'no invented player statistics on the results screen');
    noProblems(page);
    await page.close();
    return 'climb began ' + startedIn + 'ms after submit; ground sky rgb(' + groundSky + '), top sky rgb(' + spaceSky + '); rare climb took ' + took + 'ms';
  });

  await scenario('wrong guess, near-miss and timeout all behave and look intentional', async () => {
    const page = await fresh({ width: 375, height: 812, mobile: true, reducedMotion: false, initScript: fakeClock(new Date().toISOString()) });
    await click(page, 'dailyBtn');
    await waitPhase(page, 'guess');
    const p = promptOf(await text(page, 'promptText'));
    // wrong
    await guess(page, 'gatorade');
    const wrong = await page.eval(`({ msg: document.getElementById('feedback').textContent, readOnly: document.getElementById('guess').readOnly,
      focused: document.activeElement.id, shaking: getComputedStyle(document.getElementById('entry')).animationName, value: document.getElementById('guess').value,
      selected: document.getElementById('guess').selectionEnd - document.getElementById('guess').selectionStart })`);
    assert.deepEqual(wrong, { msg: "'gatorade': no buzz. try again.", readOnly: false, focused: 'guess', shaking: 'shake', value: 'gatorade', selected: 8 }, 'input shakes, stays focused and typeable, and keeps its text selected');
    // Regression: keys typed during the submit cooldown used to be dropped. They must land.
    await page.type('pow');
    assert.equal(await page.eval('document.getElementById("guess").value'), 'pow', 'typing during the lockout replaces the selected wrong text');
    await page.type('erade');
    await page.enter(); // still inside the lockout: this submit is ignored, at no cost
    assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 1, 're-submitting inside the lockout does nothing');
    assert.equal(await page.eval('document.getElementById("guess").value'), 'powerade', 'and the typed text is kept');
    await page.waitFor('!document.getElementById("guess").dataset.locked', 2000, 'the lock to lift');
    await page.enter();
    assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 2, 'after the cooldown the same Enter goes through');
    // near-miss
    // a one-letter slip that the rules accept as a near miss (some are refused as ambiguous)
    const slip = (a) => a.name.slice(0, 2) + a.name.slice(3);
    const target = p.answers.find((a) => { if (/\d/.test(a.name) || a.name.length < 8) return false; const m = C.matchAnswer(p, slip(a)); return m.fuzzy && m.answer && m.answer.name === a.name; });
    const typo = slip(target);
    await page.waitFor('!document.getElementById("guess").dataset.locked', 3000, 'the lock to lift');
    const before = await barScale(page);
    await guess(page, typo);
    const near = await text(page, 'feedback');
    assert.ok(near.startsWith("'" + typo + "' → '") && near.endsWith("' · submit again to confirm · or edit"), 'near-miss message: ' + near);
    assert.equal(await phase(page), 'guess', 'a near-miss does not end the round');
    await sleep(120);
    assert.ok(before - (await barScale(page)) < 0.03, 'and costs no time');
    assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 2, 'and is not listed as wrong');
    await guess(page, typo);
    await waitPhase(page, 'reveal', 8000);
    assert.equal(await text(page, 'lastAnswer'), target.name, 'confirming it scores the real answer');
    // timeout
    await startNextRound(page);
    await page.eval('__shiftClock(60000)');
    await waitPhase(page, 'reveal', 3000);
    const miss = await page.eval(`({ title: document.getElementById('lastBadge').textContent, line: document.getElementById('lastAnswer').textContent,
      miss: document.getElementById('reveal').classList.contains('is-miss'), shake: document.body.classList.contains('shake'), said: document.getElementById('announce').textContent })`);
    assert.equal(miss.title, 'NOTHING LANDED');
    assert.equal(miss.line, 'the clock beat you.');
    assert.equal(miss.miss, true, 'the card turns gray');
    assert.equal(miss.shake, true, 'the screen shakes');
    assert.match(miss.said, /time's up/, 'and screen readers hear it');
    assert.equal(await page.eval('document.querySelectorAll("#pips li")[1].dataset.tier'), 'miss');
    noProblems(page);
    await page.close();
  });

  await scenario('input leak: nothing typed on a reveal reaches the next round', async () => {
    const page = await fresh({ width: 1280, height: 800 });
    await click(page, 'dailyBtn');
    await playDaily(page, ['solid']);
    assert.equal(await phase(page), 'reveal');
    assert.equal(await page.eval('document.getElementById("guess").disabled'), true, 'the answer box is off while the reveal shows');
    // a player who keeps typing, and a script that writes straight into the hidden box
    await page.type('leaked answer');
    await page.eval('(() => { const g = document.getElementById("guess"); g.focus(); g.value = "leaked answer"; document.getElementById("guessForm").requestSubmit(); })()');
    assert.equal(await phase(page), 'reveal', 'a submit on the reveal does nothing');
    await sleep(650);
    await page.enter(); // Enter on the reveal only continues
    await page.waitFor('document.body.dataset.phase === "intro"', 3000, 'the next round to begin');
    assert.equal(await page.eval('document.getElementById("guess").value'), '', 'the next round starts with an empty box');
    await waitPhase(page, 'guess');
    assert.equal(await text(page, 'hudText'), 'Round 2 of 7');
    assert.equal(await page.eval('document.getElementById("guess").value'), '');
    assert.equal(await page.eval('document.getElementById("guess").disabled'), false);
    assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 0, 'nothing was submitted for the player');
    assert.equal(await text(page, 'feedback'), '');
    await sleep(1000);
    const left = await barScale(page);
    assert.ok(left > 0.9 && left < 0.99, 'the timer runs normally, with no penalty: ' + left);
    assert.equal(await phase(page), 'guess', 'and the prompt is still there to be read');
    assert.equal((await saved(page)).results.length, 1);
    // the same during a climb
    await guess(page, answerOf(await text(page, 'promptText'), 'rare'));
    assert.match(await phase(page), /^(climb|reveal)$/);
    assert.equal(await page.eval('document.getElementById("guess").disabled'), true, 'and it is off from the moment the climb begins');
    noProblems(page);
    await page.close();
  });

  await scenario('daily run on a phone (375x812, touch): no problems', async () => {
    const page = await fresh({ width: 375, height: 812, mobile: true });
    await click(page, 'dailyBtn');
    await playDaily(page, ['swarm', 'deep', 'rare', 'solid', 'clever', 'common', 'swarm']);
    await land(page);
    assert.equal(await text(page, 'resScore'), '400 pts');
    assert.equal(await text(page, 'resBand'), C.bandFor(400).name.toUpperCase());
    noProblems(page);
    await page.close();
  });

  await scenario('resume mid-round: same round, same score, fair timer', async () => {
    const page = await fresh({ width: 1280, height: 800 });
    await click(page, 'dailyBtn');
    await playDaily(page, ['rare']);
    await startNextRound(page);
    await guess(page, 'a wrong guess <b>bold</b>');
    await sleep(1500);
    const before = (await saved(page)).round.leftMs;
    const t0 = Date.now();
    await page.reload();
    await ready(page);
    const elapsed = Date.now() - t0;
    assert.equal(await phase(page), 'guess', 'refresh returns to the live round, with no second liftoff');
    assert.equal(await text(page, 'hudText'), 'Round 2 of 7');
    const after = (await barScale(page)) * 25000;
    assert.ok(after < before, 'timer did not reset or gain: ' + before + ' -> ' + after);
    assert.ok(after > 0, 'timer is not negative');
    assert.ok(before - after < elapsed + 1500, 'timer lost only the time that really passed (' + Math.round(before - after) + 'ms over a ' + elapsed + 'ms reload)');
    assert.equal(await page.eval('document.querySelector("#tried li").textContent'), 'a wrong guess <b>bold</b>', 'wrong guesses restored as text');
    assert.equal(await page.eval('document.querySelectorAll("#tried li b").length'), 0);
    assert.equal(await page.eval('document.querySelector("#pips li").dataset.tier'), 'rare', 'round 1 result restored');
    assert.equal(await text(page, 'hudAlt'), altNum(60), 'and the swarm is still at its altitude');
    await guess(page, 'a wrong guess <b>bold</b>');
    assert.equal(await text(page, 'feedback'), '', 'duplicate memory survives the reload: the repeat is ignored');
    assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 1);
    await guess(page, answerOf(await text(page, 'promptText'), 'solid'));
    await waitPhase(page, 'reveal');
    assert.match(await text(page, 'runningScore'), /^90 pts/);
    // a reload on the reveal card comes back to the card, without replaying the climb
    await page.reload();
    await ready(page);
    assert.equal(await phase(page), 'reveal');
    assert.equal(await text(page, 'lastBadge'), 'SOLID');
    noProblems(page);
    await page.close();
    return 'before reload ' + Math.round(before) + 'ms left, after ' + Math.round(after) + 'ms';
  });

  await scenario('timer: clock set back or forward gains nothing; a hidden page pauses; a closed one does not', async () => {
    const page = await fresh({ width: 1280, height: 800, initScript: fakeClock(new Date().toISOString()) + hideable });
    await click(page, 'dailyBtn');
    await startNextRound(page);
    await sleep(1000);
    const a = (await barScale(page)) * 25000;
    await page.eval('__shiftClock(-3600000)'); // device clock back an hour, mid-round
    await sleep(1000);
    const b = (await barScale(page)) * 25000;
    assert.ok(b < a - 700, 'clock keeps draining after the device clock is set back: ' + a + ' -> ' + b);
    await page.eval('__shiftClock(-3600000)');
    await page.reload(); // set back again, then reload
    await ready(page);
    const c = (await barScale(page)) * 25000;
    assert.ok(c <= b + 50, 'a reload after setting the clock back grants nothing: ' + b + ' -> ' + c);
    // a hidden page pauses the round (v4): three seconds out of sight cost nothing...
    await page.eval('__setHidden(true)');
    await sleep(3000);
    await page.eval('__setHidden(false)');
    await sleep(400);
    const d = (await barScale(page)) * 25000;
    assert.ok(c - d < 1200, 'time spent hidden is not charged: ' + c + ' -> ' + d);
    // ...but closing or reloading is not hiding: that time is charged as before
    await sleep(600);
    const e0 = (await saved(page)).round.leftMs;
    await page.eval('__shiftClock(4000)');
    await page.reload();
    await ready(page);
    const e = (await barScale(page)) * 25000;
    assert.ok(e0 - e > 3500, 'four seconds away with the page closed are charged: ' + e0 + ' -> ' + e);
    await page.eval('__shiftClock(3600000 * 5)'); // clock far forward: the round simply ends
    await waitPhase(page, 'reveal', 3000);
    assert.equal(await text(page, 'lastBadge'), 'NOTHING LANDED');
    assert.equal((await saved(page)).results[0].points, 0);
    noProblems(page);
    await page.close();
    return 'left: ' + [a, b, c, d, e].map(Math.round).join(' -> ') + ' ms';
  });

  await scenario('midnight UTC rollover mid-run: finish yesterday, then today opens', async () => {
    const page = await fresh({ width: 1280, height: 800, initScript: fakeClock('2026-10-08T23:59:30Z') });
    // what the game serves is the frozen schedule, whatever has been added to the bank since
    const day1 = dayIds('2026-10-08');
    const day2 = dayIds('2026-10-09');
    assert.equal(await text(page, 'flightNo'), 'FLIGHT #1');
    await click(page, 'dailyBtn');
    await playDaily(page, ['solid', 'rare']);
    await page.eval('__shiftClock(60000)'); // now 00:00:30 UTC on the 9th
    assert.equal(await page.eval('new Date().toISOString().slice(0, 10)'), '2026-10-09');
    await sleep(1200);
    assert.equal(await phase(page), 'reveal', 'not kicked out at midnight');
    await page.reload();
    await ready(page);
    assert.equal(await phase(page), 'reveal', 'a reload after midnight resumes yesterday');
    assert.match(await text(page, 'nextLabel'), /round 3 of 7/);
    let s = await saved(page);
    assert.equal(s.date, '2026-10-08');
    assert.deepEqual(s.promptIds, day1);
    await click(page, 'homeBtn');
    assert.match(await text(page, 'dailyBtn'), /FINISH YESTERDAY'S: ROUND 3/);
    assert.equal(await text(page, 'flightNo'), 'FLIGHT #1', "still yesterday's flight number");
    assert.equal(await page.eval('document.getElementById("skipStaleBtn").hidden'), false);
    await click(page, 'dailyBtn');
    await playDaily(page, ['solid', 'rare', 'common', 'common', 'common', 'common', 'common']);
    await land(page);
    assert.equal(await text(page, 'resDate'), 'Oct 8, 2026');
    assert.equal(await text(page, 'resFlight'), '1');
    assert.equal(await page.eval('document.getElementById("resTodayBtn").hidden'), false, "today's flight is offered");
    await click(page, 'resTodayBtn');
    await waitPhase(page, 'intro', 2000);
    s = await saved(page);
    assert.equal(s.date, '2026-10-09');
    assert.deepEqual(s.promptIds, day2);
    assert.equal(s.results.length, 0);
    noProblems(page);
    await page.close();
  });

  await scenario('same seven prompts in UTC-12, UTC+14 and New York', async () => {
    const want = dayIds('2026-10-08');
    const seen = [];
    for (const tz of ['Etc/GMT+12', 'Pacific/Kiritimati', 'America/New_York']) {
      const page = await fresh({ width: 1024, height: 768, timezone: tz, initScript: fakeClock('2026-10-08T11:30:00Z') });
      const local = await page.eval('new Date().toLocaleDateString("en-CA")');
      assert.equal(await text(page, 'todayLabel'), 'Oct 8, 2026', tz + ' shows the UTC date');
      await click(page, 'dailyBtn');
      const s = await saved(page);
      assert.equal(s.date, '2026-10-08', tz);
      assert.deepEqual(s.promptIds, want, tz);
      seen.push(tz + ' (local date ' + local + ')');
      noProblems(page);
      await page.close();
    }
    return seen.join(', ') + ' all drew ' + want.join(' ');
  });

  await scenario('infinite: drains only while typing, pauses on blur, ends cleanly at 0', async () => {
    const page = await fresh({ width: 1280, height: 800 });
    await click(page, 'infBtn');
    await waitPhase(page, 'guess');
    assert.equal(await page.eval('document.activeElement.id'), 'guess');
    await sleep(1200);
    const a = await barScale(page);
    assert.ok(a < 0.99 && a > 0.95, 'drains while the box is focused: ' + a);
    await page.eval('document.getElementById("guess").blur()');
    await sleep(300);
    const b = await barScale(page);
    await sleep(1500);
    const c = await barScale(page);
    assert.equal(c, b, 'paused while the box is empty and unfocused');
    assert.match(await text(page, 'feedback'), /clock paused/, 'pause is explained');
    assert.equal(await page.eval('document.getElementById("ring").classList.contains("paused")'), true);
    await page.eval('document.getElementById("guess").value = "typing"'); // text left in an unfocused box
    await sleep(1200);
    const d = await barScale(page);
    assert.ok(d < c - 0.015, 'text in the box keeps the clock running: ' + c + ' -> ' + d);
    await page.eval('document.getElementById("guess").value = ""; document.getElementById("guess").focus()');
    await guess(page, answerOf(await text(page, 'promptText'), 'swarm'));
    assert.match(await text(page, 'feedback'), /One in a Swarm, \+100 pts, \+16s/);
    assert.equal(await text(page, 'hudText'), 'Prompt 2');
    assert.equal(await text(page, 'hudScore'), '100');
    await sleep(200); // the clock face repaints on the next tick
    const e = Number(await text(page, 'clockNum'));
    assert.ok(e >= 55 && e <= 59, 'clock grew by 16s: ' + e);
    assert.equal(await text(page, 'hudAlt'), altNum(100), 'and the swarm climbed');
    await click(page, 'skipBtn');
    await sleep(200);
    const f = Number(await text(page, 'clockNum'));
    assert.ok(e - f >= 4 && e - f <= 6, 'skip costs 5s: ' + e + ' -> ' + f);
    // Regression: wrong guesses used to take 3 seconds each and could end the run.
    for (let i = 0; i < 5; i++) await guess(page, 'wrong guess number ' + i);
    await sleep(200);
    const g = Number(await text(page, 'clockNum'));
    assert.ok(f - g <= 4, 'five wrong guesses cost no time, only the seconds that passed: ' + f + ' -> ' + g);
    assert.equal(await view(page), 'play');
    let skips = 0;
    while ((await view(page)) === 'play') { // the clock is what ends a run: skips spend it
      await click(page, 'skipBtn').catch(() => {});
      assert.ok(++skips < 30, 'run should end');
    }
    assert.equal(await view(page), 'infover');
    assert.equal(await text(page, 'infMisses'), '5', 'wrong guesses are counted on the end screen');
    assert.equal(await text(page, 'infScore'), '100 pts');
    assert.equal(await text(page, 'infAlt'), feet(100));
    assert.equal(await text(page, 'infTitle'), 'NEW BEST RUN');
    // Regression: the four numbers used to wrap ("190" over "pts") on a wide screen.
    assert.deepEqual(await page.eval('Array.from(document.querySelectorAll("[data-view=infover] .numbers dd")).filter((n) => n.offsetHeight > parseFloat(getComputedStyle(n).lineHeight) * 1.5 || n.scrollWidth > n.clientWidth + 1).map((n) => n.id)'), [], 'each number sits on one line and fits its column');
    await sleep(500);
    assert.equal(await view(page), 'infover', 'stays ended');
    await page.reload();
    await ready(page);
    assert.equal(await text(page, 'bestLabel'), 'Best run: 100 pts across 1 prompt.');
    noProblems(page);
    await page.close();
  });

  await scenario('infinite: a full run through every prompt, no repeats', async () => {
    const page = await fresh({ width: 390, height: 844, mobile: true });
    await click(page, 'infBtn');
    const seen = new Set();
    while ((await view(page)) === 'play') {
      const prompt = await text(page, 'promptText');
      assert.ok(!seen.has(prompt), 'prompt repeated: ' + prompt);
      seen.add(prompt);
      await guess(page, answerOf(prompt, 'solid'));
    }
    assert.equal(seen.size, data.prompts.length);
    assert.equal(await text(page, 'infTitle'), 'YOU EMPTIED THE HIVE');
    assert.equal(await text(page, 'infScore'), C.formatNumber(30 * data.prompts.length) + ' pts');
    noProblems(page);
    await page.close();
  });

  for (const [label, script] of [
    ['every localStorage call throws', 'for (const m of ["getItem","setItem","removeItem","clear","key"]) Storage.prototype[m] = function () { throw new DOMException("blocked", "SecurityError"); };'],
    ['reading window.localStorage throws', 'Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });'],
    ['storage is full', 'Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); };'],
  ]) {
    await scenario('storage failure (' + label + '): the game still plays', async () => {
      const page = await open({ width: 1024, height: 768, initScript: script });
      await ready(page);
      assert.equal(await view(page), 'home');
      await click(page, 'dailyBtn');
      for (let i = 0; i < 7; i++) {
        await startNextRound(page);
        if (i === 0) await guess(page, 'wrong');
        await guess(page, answerOf(await text(page, 'promptText'), 'rare'));
        await waitPhase(page, 'reveal');
      }
      await land(page);
      assert.equal(await text(page, 'resScore'), '420 pts');
      assert.equal(await text(page, 'statPlayed'), '1');
      await click(page, 'resInfBtn');
      await guess(page, answerOf(await text(page, 'promptText'), 'deep'));
      await click(page, 'endBtn');
      assert.equal(await view(page), 'infover');
      assert.equal(await text(page, 'infScore'), '85 pts');
      noProblems(page);
      await page.close();
    });
  }

  await scenario('corrupted or old-format saves are reset, not fatal', async () => {
    const page = await fresh({ width: 1024, height: 768 });
    const today = C.utcDateKey(new Date());
    const ids = dayIds(today);
    const good = C.newDaily(today, ids);
    const bad = [
      'not json at all',
      '{"v":1,"date":"' + today + '","promptIds":' + JSON.stringify(ids) + ',"results":[],"round":{"index":0,"deadline":99999999999999,"tried":[]},"finished":false}',
      'null', '[]', '42', '"<script>alert(1)</script>"',
      JSON.stringify(Object.assign({}, good, { promptIds: ids.slice(0, 3) })),
      JSON.stringify(Object.assign({}, good, { promptIds: ids.map(() => 'nope') })),
      JSON.stringify(Object.assign({}, good, { results: [{ promptId: ids[0], tier: 'legendary', answer: 'x', points: 9999 }] })),
      JSON.stringify(Object.assign({}, good, { round: { index: 0, leftMs: 9e9, seenAt: 0, tried: [] } })),
      JSON.stringify(Object.assign({}, good, { round: { index: 5, leftMs: 100, seenAt: 0, tried: 'x' } })),
      JSON.stringify(Object.assign({}, good, { finished: true })),
      '{"v":2,"date":"2026-13-45"}',
      '{"v":2', '\u0000￿',
    ];
    for (const value of bad) {
      await page.eval('for (const k of ["swarm.daily", "swarm.infinite.best", "swarm.stats", "swarm.sound", "swarm.scanlines"]) localStorage.setItem(k, ' + JSON.stringify(value) + ')');
      await page.reload();
      await ready(page);
      assert.equal(await view(page), 'home', 'boots to the title screen with: ' + value.slice(0, 50));
      assert.equal(await text(page, 'dailyBtn'), 'BEGIN ASCENT ▲', 'bad save ignored: ' + value.slice(0, 50));
      assert.equal(await text(page, 'bestLabel'), '');
      assert.equal(await page.eval('localStorage.getItem("swarm.daily")'), null, 'bad save removed: ' + value.slice(0, 50));
    }
    await click(page, 'dailyBtn');
    assert.equal((await saved(page)).v, C.SAVE_VERSION, 'new saves carry the version');
    noProblems(page);
    await page.close();
    return bad.length + ' bad payloads rejected';
  });

  await scenario('prompts.json fails to load: friendly error with retry', async () => {
    const expected = /Failed to load resource|prompts\.json/;
    for (const mode of ['badjson', '500', 'blocked']) {
      const page = track(await browser.newPage(calm({ width: 375, height: 667, mobile: true })));
      server.mode = mode;
      if (mode === 'blocked') await page.send('Network.setBlockedURLs', { urls: ['*prompts.json'] });
      await page.goto(base);
      await page.waitFor('!document.querySelector("[data-view=error]").hidden', 5000, 'error view (' + mode + ')');
      assert.equal(await text(page, 'errorText'), 'The game data did not load. Check your connection and try again.');
      assert.equal(await page.eval('document.activeElement.id'), 'retryBtn');
      assert.ok((await page.eval('document.querySelector("[data-view=error]").innerText')).length > 80, 'not a blank screen');
      noProblems(page, expected);
      server.mode = 'ok';
      if (mode === 'blocked') await page.send('Network.setBlockedURLs', { urls: [] });
      await click(page, 'retryBtn');
      await sleep(300);
      await ready(page);
      assert.equal(await view(page), 'home', 'retry recovers (' + mode + ')');
      await page.close();
    }
    server.mode = 'ok';
  });

  await scenario('hostile input is shown as text and never runs', async () => {
    const page = await fresh({ width: 1024, height: 768 });
    await click(page, 'dailyBtn');
    await startNextRound(page);
    const attacks = ['<img src=x onerror="window.__xss=1">', '<script>window.__xss=1</script>', '"><svg onload=window.__xss=1>', 'javascript:window.__xss=1'];
    await page.eval('document.getElementById("guess").removeAttribute("maxlength")');
    for (const a of attacks) await guess(page, a);
    assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), attacks.length);
    assert.equal(await page.eval('document.querySelector("#tried li").textContent'), attacks[0]);
    assert.equal(await page.eval('document.querySelectorAll("#tried img, #tried script, #tried svg").length'), 0, 'no elements created from input');
    await guess(page, '🐝🐝🐝');
    await guess(page, '   ');
    await guess(page, 'x'.repeat(200000));
    assert.equal(await phase(page), 'guess', 'still running after emoji, blank and a 200,000-character guess');
    assert.ok((await page.eval('document.querySelector("#tried li:last-child").textContent.length')) <= 60, 'long guesses are truncated for display');
    await page.reload();
    await ready(page);
    assert.equal(await page.eval('document.querySelector("#tried li").textContent'), attacks[0], 'restored from storage as text');
    assert.equal(await page.eval('document.querySelectorAll("#tried img, #tried script, #tried svg").length'), 0);
    assert.equal(await page.eval('window.__xss'), undefined, 'no injected code ran');
    assert.equal(await page.eval('document.getElementById("guess").maxLength'), 80);
    noProblems(page);
    await page.close();
  });

  await scenario('layout at 320, 375, 768 and 1440: nothing cut off, big tap targets, keyboard never covers the clock or the answer box', async () => {
    const longest = data.prompts.slice().sort((a, b) => b.text.length - a.text.length)[0];
    const others = data.prompts.filter((p) => p !== longest).slice(0, 6).map((p) => p.id);
    const audit = `(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + vw);
      document.querySelectorAll('main *, #hud, #hud *, #tools *').forEach((n) => {
        if (n.closest('.sr-only, [hidden], script, style') || !n.getClientRects().length) return;
        if (getComputedStyle(n).visibility === 'hidden') return;
        if (n.closest('details:not([open])') && !n.closest('summary')) return; // folded away
        const r = n.getBoundingClientRect();
        const id = n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : '');
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(id + ' leaves the viewport: ' + Math.round(r.left) + '..' + Math.round(r.right));
        if (n.matches('button, input, textarea, summary, a[href]') && (r.height < 44 || r.width < 44)) out.push(id + ' tap target ' + Math.round(r.width) + 'x' + Math.round(r.height));
        const panel = n.closest('.panel');
        if (panel && panel !== n && r.width) {
          const c = panel.getBoundingClientRect();
          if (r.left < c.left - 0.5 || r.right > c.right + 0.5) out.push(id + ' spills out of its panel: ' + Math.round(r.left) + '..' + Math.round(r.right) + ' vs ' + Math.round(c.left) + '..' + Math.round(c.right));
        }
        if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0 && getComputedStyle(n).display !== 'inline' && !n.closest('[aria-hidden=true], .tried')) out.push(id + ' content is wider than its box: ' + n.scrollWidth + ' > ' + n.clientWidth);
        if (n.matches('textarea') && n.scrollHeight > n.clientHeight + 1) out.push(id + ' text is cut off vertically');
        if (n.matches('input, textarea, select') && parseFloat(getComputedStyle(n).fontSize) < 16) out.push(id + ' font below 16px');
      });
      return out;
    })()`;
    // With the keyboard up, the clock, prompt, answer box and FLY button must all be on screen and not overlap.
    const playFit = `(() => {
      const out = [];
      const vh = window.innerHeight;
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      for (const id of ['hud', 'promptCard', 'ring', 'guess', 'flyBtn']) {
        const b = r(id);
        if (b.top < -0.5 || b.bottom > vh + 0.5) out.push(id + ' is off screen: ' + Math.round(b.top) + '..' + Math.round(b.bottom) + ' of ' + vh);
      }
      if (r('hud').bottom > r('promptCard').top + 1) out.push('the HUD overlaps the prompt');
      if (r('promptCard').bottom > r('dock').top + 1) out.push('the prompt overlaps the answer bar: ' + Math.round(r('promptCard').bottom) + ' > ' + Math.round(r('dock').top));
      return out;
    })()`;
    const notes = [];
    for (const [w, h, mobile] of [[320, 568, true], [375, 812, true], [768, 1024, true], [1440, 900, false]]) {
      const page = await fresh({ width: w, height: h, mobile });
      const check = async (label) => assert.deepEqual(await page.eval(audit), [], w + 'px ' + label);
      await check('title screen');
      await page.eval('document.getElementById("howDlg").open = true');
      await check('title screen with the rules open');
      await page.eval('document.getElementById("howDlg").open = false; document.getElementById("sightDlg").open = true');
      await check('title screen with the sightings open');
      // The last round of a near-perfect day: the longest prompt in the bank, the biggest numbers
      // the HUD can show, and a worst-case row of wrong guesses.
      const state = C.newDaily(C.utcDateKey(new Date()), others.concat(longest.id));
      others.forEach((id) => {
        const top = data.prompts.find((p) => p.id === id).answers.find((a) => a.tier === 'swarm');
        state.results.push({ tier: 'swarm', answer: top.name, points: 100, promptId: id, wrong: 0, fuzzy: false, note: '' });
      });
      state.round = { index: 6, leftMs: 25000, seenAt: Date.now(), tried: [{ key: 'a', text: 'W'.repeat(60) }, { key: 'b', text: 'supercalifragilistic expialidocious' }] };
      await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(state)) + ')');
      await page.reload();
      await ready(page);
      assert.equal(await text(page, 'promptText'), longest.text);
      await check('play');
      assert.deepEqual(await page.eval(playFit), [], w + 'px play, no keyboard');
      if (mobile && w < 700) {
        const kb = h - 300; // roughly what a phone keyboard leaves
        await page.resize(w, kb, true);
        await sleep(250);
        assert.deepEqual(await page.eval(playFit), [], w + 'x' + kb + ' play with the keyboard up');
        await guess(page, 'zzzz');
        await sleep(100);
        assert.deepEqual(await page.eval(playFit), [], w + 'x' + kb + ' with a feedback message showing');
        const gap = await page.eval('Math.round(document.getElementById("dock").getBoundingClientRect().top - document.getElementById("promptCard").getBoundingClientRect().bottom)');
        notes.push(w + 'x' + kb + ' (keyboard up): ' + gap + 'px of sky between prompt and answer bar');
        // the same squeeze arriving as a visual-viewport change, the way iOS reports its keyboard
        await page.resize(w, h, true);
        await sleep(200);
        await page.eval('(() => { const vv = window.visualViewport; Object.defineProperty(vv, "height", { configurable: true, get: () => ' + kb + ' }); vv.dispatchEvent(new Event("resize")); })()');
        await sleep(200);
        assert.equal(await page.eval('getComputedStyle(document.documentElement).getPropertyValue("--kb").trim()'), '300px', 'the answer bar is lifted by the keyboard height');
        const dockBottom = await page.eval('Math.round(document.getElementById("dock").getBoundingClientRect().bottom)');
        assert.ok(dockBottom <= kb, 'answer bar sits above an iOS-style keyboard: bottom ' + dockBottom + ' of ' + kb);
        assert.ok((await page.eval('Math.round(document.getElementById("promptCard").getBoundingClientRect().bottom)')) <= dockBottom - 40, 'and the prompt is still above it');
        await page.eval('(() => { const vv = window.visualViewport; delete vv.height; vv.dispatchEvent(new Event("resize")); })()');
        await sleep(200);
      }
      assert.equal(await text(page, 'hudAlt'), altNum(600));
      await guess(page, longest.answers.find((a) => a.tier === 'swarm').name);
      await waitPhase(page, 'reveal');
      await check('reveal card');
      const card = await page.eval('(() => { const r = document.getElementById("reveal").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), window.innerHeight]; })()');
      assert.ok(card[0] >= 0 && card[1] <= card[2], w + 'px reveal card fits on screen: ' + card.join(' '));
      await land(page);
      assert.equal(await text(page, 'resAlt'), feet(700));
      await check('results');
      await page.eval('document.querySelector(".spoilers").open = true');
      await check('results with spoilers open');
      await click(page, 'resInfBtn');
      await check('infinite play');
      await guess(page, answerOf(await text(page, 'promptText'), 'rare'));
      await click(page, 'endBtn');
      await check('infinite over');
      noProblems(page);
      await page.close();
    }
    return notes.join('; ');
  });

  await scenario('screen reader: clock, feedback and score are announced, not every tick', async () => {
    const page = await fresh({ width: 1024, height: 768, initScript: fakeClock(new Date().toISOString()) });
    for (const [id, live] of [['clockLive', 'assertive'], ['feedback', 'polite'], ['announce', 'polite'], ['copyStatus', 'polite']]) {
      assert.equal(await page.eval('document.getElementById("' + id + '").getAttribute("aria-live")'), live, id);
    }
    for (const id of ['pips', 'world', 'worldWindow', 'tag', 'scan', 'flash', 'toast']) {
      assert.equal(await page.eval('document.getElementById("' + id + '").getAttribute("aria-hidden")'), 'true', id + ' is decorative');
    }
    await click(page, 'dailyBtn');
    await startNextRound(page);
    await page.eval('window.__said = []; new MutationObserver(() => window.__said.push(document.getElementById("clockLive").textContent)).observe(document.getElementById("clockLive"), { childList: true, characterData: true, subtree: true })');
    await sleep(1000);
    await guess(page, 'nope nope');
    assert.equal(await text(page, 'feedback'), "'nope nope': no buzz. try again.");
    await page.eval('__shiftClock(13000)'); // the wrong guess took no time, so the clock needs the full 13 seconds
    await sleep(1200);
    await page.eval('__shiftClock(4000)');
    await sleep(1000);
    assert.deepEqual(await page.eval('window.__said'), ['10 seconds left', '5 seconds left'], 'the clock speaks exactly twice in a round');
    await guess(page, answerOf(await text(page, 'promptText'), 'deep'));
    await waitPhase(page, 'reveal');
    assert.match(await text(page, 'announce'), /^Round 1: Deep Cut, .+, plus 85 points\. Total 85 points, [\d,]+ ft\.$/);
    assert.equal(await text(page, 'lastBadge'), 'DEEP CUT', 'tier is written out, not only coloured');
    assert.equal(await page.eval('document.querySelector("#pips li").dataset.tier'), 'deep');
    assert.equal(await page.eval('document.querySelectorAll("#pips li canvas").length'), 1, 'the pip carries a mark as well as a colour');
    noProblems(page);
    await page.close();
  });

  await scenario('tiers: six colours, six marks, six labels, six quips', async () => {
    const page = await fresh({ width: 800, height: 700 });
    const info = await page.eval(`(() => {
      const css = getComputedStyle(document.documentElement);
      return ['common', 'clever', 'solid', 'rare', 'deep', 'swarm'].map((t) => css.getPropertyValue('--t-' + t).trim());
    })()`);
    assert.equal(new Set(info).size, 6, 'six distinct tier colours');
    await click(page, 'dailyBtn');
    const seen = [];
    for (const tier of C.TIER_ORDER) {
      await startNextRound(page);
      await guess(page, answerOf(await text(page, 'promptText'), tier));
      await waitPhase(page, 'reveal');
      seen.push(await page.eval(`({ name: document.getElementById('lastBadge').textContent, quip: document.getElementById('lastNote').textContent,
        art: document.getElementById('lastIcon').toDataURL(), pip: [...document.querySelectorAll('#pips li canvas')].pop().toDataURL() })`));
    }
    assert.deepEqual(seen.map((s) => s.name), C.TIER_ORDER.map((t) => C.TIERS[t].label.toUpperCase()));
    seen.forEach((s, i) => assert.ok(s.quip.startsWith(C.TIERS[C.TIER_ORDER[i]].quip.split('.')[0]), 'quip for ' + s.name + ': ' + s.quip));
    assert.equal(new Set(seen.map((s) => s.art)).size, 6, 'six different reveal-card pictures');
    assert.equal(new Set(seen.map((s) => s.pip)).size, 6, 'six different pip marks');
    noProblems(page);
    await page.close();
  });

  await scenario('reduced motion: no long climb, no shake, no scanlines; and the scanline toggle', async () => {
    const still = await fresh({ width: 800, height: 700, reducedMotion: true });
    assert.equal(await still.eval('getComputedStyle(document.getElementById("scan")).display'), 'none', 'no scanlines with reduced motion');
    await click(still, 'dailyBtn');
    await startNextRound(still);
    await guess(still, 'wrong');
    assert.equal(await still.eval('getComputedStyle(document.getElementById("entry")).animationName'), 'none', 'no input shake');
    const sent = Date.now();
    await guess(still, answerOf(await text(still, 'promptText'), 'swarm'));
    await waitPhase(still, 'reveal', 1500);
    assert.ok(Date.now() - sent < 1200, 'the reveal card comes straight up');
    assert.equal(await still.eval('getComputedStyle(document.getElementById("reveal")).animationName'), 'fade', 'with a short fade');
    assert.equal(await still.eval('document.getElementById("flash").classList.contains("go")'), false, 'no flash');
    await still.waitFor('document.getElementById("hudAlt").textContent === "' + altNum(100) + '"', 2000, 'the altitude to jump to the right place');
    noProblems(still);
    await still.close();

    const moving = await fresh({ width: 800, height: 700, reducedMotion: false });
    assert.equal(await moving.eval('getComputedStyle(document.getElementById("scan")).display'), 'block', 'scanlines on by default');
    await click(moving, 'scanBtn');
    assert.equal(await moving.eval('getComputedStyle(document.getElementById("scan")).display'), 'none', 'the toggle turns them off');
    await moving.reload();
    await ready(moving);
    assert.equal(await moving.eval('document.getElementById("scanBtn").getAttribute("aria-pressed")'), 'false', 'and the choice is remembered');
    noProblems(moving);
    await moving.close();
  });

  await scenario('sound is off by default, plays when switched on, and the choice is remembered', async () => {
    const fakeAudio = `window.__audio = { notes: 0, wind: 0 };
      const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
      window.AudioContext = class {
        constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
        createOscillator() { window.__audio.notes++; return { type: '', frequency: param(), connect() {}, start() {}, stop() {} }; }
        createGain() { return { gain: param(), connect() {} }; }
        createBuffer(c, n) { return { getChannelData() { return new Float32Array(n); } }; }
        createBufferSource() { window.__audio.wind++; return { connect() {}, start() {}, stop() {} }; }
        createBiquadFilter() { return { type: '', frequency: param(), Q: param(), connect() {} }; }
        resume() { return Promise.resolve(); }
        suspend() { return Promise.resolve(); }
      };`;
    const audio = (page) => page.eval('window.__audio');
    const page = await fresh({ width: 1280, height: 800, reducedMotion: false, initScript: fakeAudio });
    assert.equal(await page.eval('document.getElementById("soundBtn").getAttribute("aria-pressed")'), 'false', 'off by default');
    await click(page, 'dailyBtn');
    await startNextRound(page);
    await guess(page, 'not a real answer');
    await guess(page, answerOf(await text(page, 'promptText'), 'common'));
    await waitPhase(page, 'reveal');
    assert.deepEqual(await audio(page), { notes: 0, wind: 0 }, 'silent until the player turns sound on');
    await click(page, 'soundBtn');
    assert.match(await page.eval('document.getElementById("soundBtn").getAttribute("aria-label")'), /Sound is on/);
    const on = (await audio(page)).notes;
    assert.ok(on > 0, 'a blip confirms sound is on');
    await page.reload();
    await ready(page);
    assert.equal(await page.eval('document.getElementById("soundBtn").getAttribute("aria-pressed")'), 'true', 'remembered after a reload');
    await startNextRound(page);
    await guess(page, 'still not an answer');
    assert.equal((await audio(page)).notes, 4, 'round-start chime (2) and wrong-guess buzz (2)');
    await guess(page, answerOf(await text(page, 'promptText'), 'swarm'));
    await waitPhase(page, 'climb', 1000);
    assert.equal((await audio(page)).wind, 1, 'a rising tone and wind during the climb');
    await waitPhase(page, 'reveal', 8000);
    assert.ok((await audio(page)).notes >= 4 + 1 + 7 + 7, 'the One in a Swarm chord');
    noProblems(page);
    await page.close();
  });

  await scenario('easter eggs: taps, the tower, Konami, the balloon, a sighting in flight, and the log', async () => {
    const page = await fresh({ width: 375, height: 812, mobile: true, reducedMotion: false });
    const found = () => page.eval('(JSON.parse(localStorage.getItem("swarm.sightings")) || { found: [] }).found');
    const tapOn = async (name, down) => {
      const b = await page.eval('window.__swarm.scene.box("' + name + '")');
      assert.ok(b, name + ' is on screen');
      const x = b.x + b.w / 2;
      const y = b.y + b.h * (down || 0.5);
      const under = await page.eval('(() => { const e = document.elementFromPoint(' + x + ', ' + y + '); const c = e && e.closest(".panel, button"); return c ? c.tagName + "." + c.className : ""; })()');
      assert.equal(under, '', name + ' is not covered where it is tapped (' + Math.round(x) + ', ' + Math.round(y) + ')');
      await page.click(x, y);
    };
    // the clock tower, five taps
    for (let i = 0; i < 4; i++) await tapOn('tower', 0.3);
    assert.deepEqual(await found(), [], 'four taps do nothing');
    await tapOn('tower', 0.3);
    assert.match(await text(page, 'dailyStatus'), /^The tower chimes\. It is \d{1,2}:\d\d/);
    assert.deepEqual(await found(), ['tower']);
    await page.waitFor('!document.getElementById("toast").hidden', 2000, 'the new-sighting toast');
    assert.equal(await text(page, 'toast'), 'NEW SIGHTING\nThe tower chimes');
    // Regression: the toast has its own spot and never sits on the title or the start panel.
    const clear = (others) => page.eval(`(() => { const t = document.getElementById('toast').getBoundingClientRect();
      return ${JSON.stringify(others)}.filter((sel) => { const n = document.querySelector(sel); if (!n || !n.getClientRects().length) return false; const r = n.getBoundingClientRect(); return r.bottom > t.top && r.top < t.bottom && r.right > t.left && r.left < t.right; }); })()`);
    assert.deepEqual(await clear(['.title-block', '.start-panel', '#tools']), [], 'toast is clear of the title screen panels');
    // the bee
    await sleep(900); // let the camera settle
    await tapOn('bee');
    assert.deepEqual(await found(), ['tower', 'beetap']);
    // the Konami code
    await page.eval('["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"].forEach((key) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })))');
    assert.equal(await text(page, 'dailyStatus'), 'The swarm turns gold for one flight.');
    assert.equal((await found()).includes('konami'), true);
    assert.equal(await text(page, 'sightCount'), '3/21');
    assert.equal(await page.eval('document.querySelectorAll("#sightGrid li.unfound").length'), 18);

    // In flight. Seed a run at 75 points on a prompt where none of the secrets is a real answer.
    const day = C.utcDateKey(new Date());
    const order = ['nba', 'nfl', 'majors', 'marta', 'cs', 'codes', 'qbs'];
    const state = C.newDaily(day, order);
    [['nba', 'rare'], ['nfl', 'clever']].forEach(([id, tier]) => {
      const a = data.prompts.find((p) => p.id === id).answers.find((x) => x.tier === tier);
      state.results.push({ tier, answer: a.name, points: C.TIERS[tier].points, promptId: id, wrong: 0, fuzzy: false, note: '' });
    });
    await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(state)) + '); localStorage.setItem("swarm.sightings", JSON.stringify({ v: 2, found: ["tower"] }))');
    await page.reload();
    await ready(page);
    await startNextRound(page);
    // while the clock runs: taps do nothing, and no toast may appear
    const before = await barScale(page);
    await tapOn('bee');
    assert.deepEqual(await found(), ['tower'], 'tapping the bee during a round does nothing');
    // secret answers: a reaction each, no penalty, not wrong, round still open
    const lines = {};
    for (const [typed, id] of [['George P. Burdell', 'burdell'], ['Buzz', 'buzz'], ['THWG', 'thwg'], ['Helluva Engineer', 'helluva'], ['UGA', 'wrongschool']]) {
      await guess(page, typed);
      lines[id] = await text(page, 'feedback');
      assert.equal(await page.eval('document.getElementById("toast").hidden'), true, 'no toast while the clock runs (' + id + ')');
    }
    assert.equal(lines.burdell, 'George P. Burdell is enrolled in every class. Try again.');
    // Regression: the message is there the instant the secret is submitted, and whatever the
    // player types next is theirs to keep.
    await page.waitFor('!document.getElementById("guess").dataset.locked', 2000, 'the cooldown to end');
    await page.eval('(() => { const g = document.getElementById("guess"); g.focus(); g.value = "George P. Burdell"; document.getElementById("feedback").textContent = ""; document.getElementById("guessForm").requestSubmit(); window.__msgAtOnce = document.getElementById("feedback").textContent; })()');
    assert.equal(await page.eval('window.__msgAtOnce'), 'George P. Burdell is enrolled in every class. Try again.', 'shown in the same tick as the submit');
    assert.equal(await page.eval('(() => { const g = document.getElementById("guess"); return g.value === "George P. Burdell" && g.selectionEnd - g.selectionStart === g.value.length; })()'), true, 'the secret stays in the box, selected');
    await page.type('Kla');
    await sleep(700);
    await page.type('us');
    await sleep(700);
    assert.equal(await page.eval('document.getElementById("guess").value'), 'Klaus', 'typing after a secret is never cleared');
    await page.eval('document.getElementById("guess").value = ""');
    assert.equal(lines.wrongschool, 'Wrong school.');
    assert.equal(await page.eval('document.getElementById("flash").classList.contains("go")'), true, 'THWG flashes gold');
    assert.equal(await page.eval('document.querySelectorAll("#tried li").length'), 0, 'none of them counts as a wrong guess');
    assert.equal(await phase(page), 'guess', 'and the round is still going');
    assert.ok(before - (await barScale(page)) < 0.2, 'only real time has passed (six secrets, each after the submit cooldown)');
    assert.equal(await page.eval('document.activeElement.id'), 'guess', 'the input keeps focus throughout');
    assert.deepEqual((await found()).slice().sort(), ['burdell', 'buzz', 'helluva', 'thwg', 'tower', 'wrongschool'].sort());
    // answer: 75 -> 105 points climbs past the window washer at about 620 ft
    await guess(page, answerOf(await text(page, 'promptText'), 'solid'));
    await page.waitFor('!document.getElementById("toast").hidden', 3000, 'queued toasts appear once the clock stops');
    assert.deepEqual(await clear(['#hud', '#promptCard', '#dock', '#nextBtn', '#reveal']), [], 'toast is clear of the HUD, prompt, input and reveal');
    await waitPhase(page, 'reveal', 8000);
    assert.equal((await found()).includes('washer'), true, 'the window washer was sighted on the way up');
    // the balloon: 115 points puts it just above the bee. Tap it.
    const st2 = C.newDaily(day, order);
    [['nba', 'swarm'], ['nfl', 'clever']].forEach(([id, tier]) => {
      const a = data.prompts.find((p) => p.id === id).answers.find((x) => x.tier === tier);
      st2.results.push({ tier, answer: a.name, points: C.TIERS[tier].points, promptId: id, wrong: 0, fuzzy: false, note: '' });
    });
    await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(st2)) + ')');
    await page.reload();
    await ready(page);
    await sleep(900);
    assert.notEqual(await text(page, 'caption'), 'Sorry, Athens.', 'no caption until it pops');
    await tapOn('balloon');
    await page.waitFor('!document.getElementById("caption").hidden && document.getElementById("caption").textContent === "Sorry, Athens."', 5000, 'the balloon caption');
    assert.equal(await page.eval('window.__swarm.scene.box("balloon")'), null, 'the balloon is gone');
    assert.equal((await found()).includes('balloon'), true);
    noProblems(page);
    await page.close();

    // a night owl: 2am local time
    const night = await fresh({ width: 375, height: 812, mobile: true, timezone: 'UTC', realHours: true, initScript: fakeClock('2026-10-09T02:10:00Z') });
    assert.equal(await night.eval('document.getElementById("nightLine").hidden'), false);
    assert.equal(await text(night, 'nightLine'), 'studying late? classic Tech.');
    assert.deepEqual(await night.eval('JSON.parse(localStorage.getItem("swarm.sightings")).found'), ['night']);
    noProblems(night);
    await night.close();
    const day2 = await fresh({ width: 375, height: 812, mobile: true, timezone: 'UTC', realHours: true, initScript: fakeClock('2026-10-09T14:10:00Z') });
    assert.equal(await day2.eval('document.getElementById("nightLine").hidden'), true, 'not in the afternoon');
    await day2.close();
  });

  await scenario('page hidden mid-climb: the game never freezes, and the reveal always arrives', async () => {
    // 1. Hidden mid-climb, then shown again: straight to the end state.
    let page = await fresh({ width: 375, height: 812, mobile: true, reducedMotion: false, initScript: hideable });
    await click(page, 'dailyBtn');
    await waitPhase(page, 'guess');
    await guess(page, answerOf(await text(page, 'promptText'), 'rare'));
    await waitPhase(page, 'climb', 1000);
    await sleep(700);
    await page.eval('__setHidden(true)');
    const stuck = await page.eval('({ score: document.getElementById("hudScore").textContent, cam: window.__swarm.camera() })');
    assert.ok(stuck.cam > 0 && stuck.cam < 60, 'hidden part-way up: ' + JSON.stringify(stuck));
    await sleep(500);
    await page.eval('__setHidden(false)');
    await waitPhase(page, 'reveal', 600);
    await page.waitFor('document.getElementById("hudAlt").textContent === "' + altNum(60) + '"', 1500, 'the altimeter to show the full 60 points');
    assert.equal(await text(page, 'hudScore'), '60', 'the score is whole, not stuck at 59');
    assert.equal(await page.eval('document.activeElement.id'), 'nextBtn', 'and the button is there');
    assert.equal((await saved(page)).results[0].points, 60);
    noProblems(page);
    await page.close();

    // 2. Hidden and never shown again: a timer still finishes the climb and puts up the reveal.
    page = await fresh({ width: 375, height: 812, mobile: true, reducedMotion: false, initScript: hideable });
    await click(page, 'dailyBtn');
    await waitPhase(page, 'guess');
    await guess(page, answerOf(await text(page, 'promptText'), 'common'));
    await waitPhase(page, 'climb', 1000);
    await sleep(300);
    await page.eval('__setHidden(true)');
    await waitPhase(page, 'reveal', 4500);
    assert.equal(await text(page, 'hudScore'), '10');
    assert.equal(await page.eval('window.__swarm.camera()'), 10);
    await page.close();

    // 3. The frame loop simply dies (no event at all): a frame pump and the timer carry it home.
    page = await fresh({ width: 375, height: 812, mobile: true, reducedMotion: false, initScript: hideable });
    await click(page, 'dailyBtn');
    await waitPhase(page, 'guess');
    await page.eval('__stallFrames(); Object.defineProperty(document, "hidden", { get: () => false })');
    const t0 = Date.now();
    await guess(page, answerOf(await text(page, 'promptText'), 'solid'));
    await sleep(600);
    const moving = await page.eval('window.__swarm.camera()');
    assert.ok(moving > 3 && moving < 30, 'with no animation frames at all the climb still moves: ' + moving);
    await waitPhase(page, 'reveal', 5000);
    assert.ok(Date.now() - t0 < 4200, 'and ends on time');
    assert.equal(await text(page, 'hudScore'), '30');
    await page.close();

    // 4. Hidden during a round: the clock stops, and starts again on return.
    page = await fresh({ width: 375, height: 812, mobile: true, initScript: hideable });
    await click(page, 'dailyBtn');
    await waitPhase(page, 'guess');
    await sleep(500);
    await page.eval('__setHidden(true)');
    const before = (await saved(page)).round.leftMs;
    await sleep(2500);
    await page.eval('__setHidden(false)');
    await sleep(300);
    const after = (await barScale(page)) * 25000;
    assert.ok(before - after < 900, 'the round clock was paused while hidden: ' + before + ' -> ' + after);
    await sleep(1200);
    assert.ok((await barScale(page)) * 25000 < after - 800, 'and is running again');
    noProblems(page);
    await page.close();
  });

  // Regression: facts, captions and toasts used to land on each other, on the reveal text, on
  // the "Flight complete" line, off the edge of the screen, and inside the HUD during the countdown.
  await scenario('floating text: bounding boxes never collide or leave the screen, at 375 and 1440', async () => {
    const WATCH = `window.__bad = {}; window.__seen = { fact: 0, caption: 0, toast: 0 }; window.__checks = 0;
      setInterval(() => {
        const vis = (n) => n && !n.hidden && n.getClientRects().length && !n.classList.contains('yield') && !n.classList.contains('out');
        const box = (n, name) => { const r = n.getBoundingClientRect(); return { name, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const floats = [];
        document.querySelectorAll('#worldLayer .fact').forEach((n) => { if (vis(n)) floats.push(box(n, 'fact "' + n.textContent.slice(0, 24) + '"')); });
        if (vis(document.getElementById('caption'))) floats.push(box(document.getElementById('caption'), 'caption'));
        if (vis(document.getElementById('toast'))) floats.push(box(document.getElementById('toast'), 'toast'));
        const fixed = [];
        ['#hud', '#promptCard', '#dock', '#tools', '#reveal > *', '#revealFoot > *', '#tag', '.title-block', '.start-panel'].forEach((sel) => document.querySelectorAll(sel).forEach((n) => { if (n.getClientRects().length) fixed.push(box(n, sel + (n.id ? ' ' + n.id : ''))); }));
        const hit = (a, b) => a.b > b.t + 1 && a.t < b.b - 1 && a.r > b.l + 1 && a.l < b.r - 1;
        const phase = document.body.dataset.phase;
        floats.forEach((f, i) => {
          window.__seen[f.name.split(' ')[0]]++;
          if (f.l < 0 || f.t < 0 || f.r > window.innerWidth || f.b > window.innerHeight) window.__bad[f.name + ' leaves the screen (' + phase + ')'] = 1;
          fixed.forEach((x) => { if (hit(f, x)) window.__bad[f.name + ' overlaps ' + x.name + ' (' + phase + ')'] = 1; });
          floats.slice(i + 1).forEach((g) => { if (hit(f, g)) window.__bad[f.name + ' overlaps ' + g.name + ' (' + phase + ')'] = 1; });
        });
        // the sun never sits behind the reveal text, the answer tag or a tier label
        const sb = window.__swarm.scene.box('sun');
        if (sb) {
          const sun = { name: 'sun', l: sb.x + 2, t: sb.y + 2, r: sb.x + sb.w - 2, b: sb.y + sb.h - 2 };
          window.__seen.sun = (window.__seen.sun || 0) + 1;
          ['#reveal > *', '#tag', '#worldLayer .tier-line.on span'].forEach((sel) => document.querySelectorAll(sel).forEach((n) => { if (n.getClientRects().length && hit(sun, box(n, sel))) window.__bad['the sun is behind ' + sel + (n.id ? ' ' + n.id : '') + ' (' + phase + ')'] = 1; }));
        }
        // a caption never outlives the thing it describes, and tier labels never change size
        const cap = document.getElementById('caption');
        if (vis(cap) && cap.dataset.sight && cap.dataset.sight !== 'flag' && !window.__swarm.scene.sightingVisible(cap.dataset.sight)) window.__bad['caption for ' + cap.dataset.sight + ' is up after it scrolled away (' + phase + ')'] = 1;
        document.querySelectorAll('#worldLayer .tier-line.on span').forEach((n) => { const r = n.getBoundingClientRect(); if (Math.abs(r.height - n.offsetHeight) > 1 || Math.abs(r.width - n.offsetWidth) > 1) window.__bad['tier label drawn at ' + Math.round(r.height) + 'px instead of ' + n.offsetHeight + 'px'] = 1; });
        window.__checks++;
      }, 50);`;
    const notes = [];
    for (const size of [{ width: 375, height: 812, mobile: true }, { width: 1440, height: 900 }]) {
      const page = await fresh(Object.assign({ reducedMotion: false }, size));
      await page.eval(WATCH);
      // sightings on the title screen: a toast beside the title and the start panel
      await page.eval('(() => { const b = window.__swarm.scene.box("bee"); const o = { bubbles: true, clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 }; document.elementFromPoint(o.clientX, o.clientY).dispatchEvent(new PointerEvent("pointerdown", o)); })()');
      await sleep(600);
      await click(page, 'dailyBtn');
      const tiers = ['swarm', 'deep', 'rare', 'swarm', 'swarm', 'swarm', 'solid'];
      for (let i = 0; i < 7; i++) {
        await page.waitFor('document.body.dataset.phase === "intro" || document.body.dataset.phase === "guess"', 8000, 'the countdown');
        await waitPhase(page, 'guess');
        await guess(page, answerOf(await text(page, 'promptText'), tiers[i]));
        await waitPhase(page, 'reveal', 12000);
        await sleep(900); // the reveal, with whatever caption or toast came with it
        await click(page, 'nextBtn');
      }
      await waitPhase(page, 'results');
      await sleep(300);
      const bad = await page.eval('Object.keys(window.__bad)');
      const seen = await page.eval('window.__seen');
      const checks = await page.eval('window.__checks');
      assert.deepEqual(bad, [], size.width + 'px: ' + bad.join('; '));
      assert.ok(checks > 300, 'the boxes were checked all the way up: ' + checks);
      assert.ok(seen.sun > 20, 'the sun was on screen to be checked: ' + JSON.stringify(seen));
      assert.ok(seen.fact > 20 && seen.caption > 5 && seen.toast > 5, 'facts, captions and toasts were all on screen to be checked: ' + JSON.stringify(seen));
      notes.push(size.width + 'px: ' + checks + ' checks, ' + JSON.stringify(seen));
      noProblems(page);
      await page.close();
    }
    return notes.join('; ');
  });

  await scenario('launch settings: the visit counter and the feedback link switch on from config.js', async () => {
    server.config = { GOATCOUNTER_CODE: 'testswarm', FEEDBACK_URL: 'https://feedback.example/form?src=game' };
    try {
      // GoatCounter itself is never contacted from a test: its address is blocked, and a stand-in records what would be counted.
      const page = await fresh({ width: 1280, height: 800, blockUrls: ['*gc.zgo.at*', '*goatcounter.com*'], initScript: 'window.__gc = []; window.goatcounter = { count: (o) => window.__gc.push(o) };' });
      assert.match(await page.eval('String(window.goatcounter.count)'), /__gc/, 'the real counting script never ran: its address is blocked in tests');
      const tag = await page.eval('(() => { const t = document.getElementById("visitCounter"); return t && { src: t.src, to: t.getAttribute("data-goatcounter"), async: t.async, n: document.querySelectorAll("script[data-goatcounter]").length }; })()');
      assert.deepEqual(tag, { src: 'https://gc.zgo.at/count.js', to: 'https://testswarm.goatcounter.com/count', async: true, n: 1 });
      assert.equal(await page.eval('document.cookie'), '', 'no cookies');
      assert.deepEqual(await page.eval('window.__gc'), [], 'nothing is counted as an event just for opening the page');
      await click(page, 'dailyBtn');
      await playDaily(page, TIERS7);
      assert.deepEqual(await page.eval('window.__gc'), [], 'and nothing during the flight');
      await land(page);
      assert.deepEqual(await page.eval('window.__gc'), [{ path: 'flight-finished', title: 'Daily flight finished', event: true }], 'one event when the flight is finished');
      const run = await saved(page);
      const link = await page.eval('(() => { const a = document.getElementById("feedbackLink"); return { shown: !document.getElementById("feedbackRow").hidden && a.getClientRects().length > 0, href: a.href, text: a.textContent, rel: a.rel, target: a.target }; })()');
      assert.deepEqual(link, { shown: true, href: 'https://feedback.example/form?src=game&date=' + run.date + '&prompts=' + encodeURIComponent(run.promptIds.join(',')), text: 'Wrong tier? Tell us', rel: 'noopener noreferrer', target: '_blank' });
      assert.equal(JSON.stringify(Object.keys(await page.eval('Object.assign({}, localStorage)')).sort()).includes('goat'), false, 'the counter stores nothing on the device');
      await page.reload(); // the results again, after a reload: the flight is not counted twice
      await ready(page);
      await page.eval('document.getElementById("dailyBtn") && document.body.dataset.phase === "home" && document.getElementById("dailyBtn").click()');
      await waitPhase(page, 'results');
      assert.deepEqual(await page.eval('window.__gc'), [], 'reopening the results counts nothing');
      const real = page.problems.filter((p) => !/gc\.zgo\.at|ERR_BLOCKED_BY_CLIENT|ERR_FAILED/.test(p));
      assert.deepEqual(real, [], 'no problems besides the blocked counter script');
      await page.close();
    } finally {
      server.config = null;
    }
  });

  await scenario('share card: the same 1080x1350 picture at 375 and 1440, saved on desktop, shared on phones, no answers in it', async () => {
    const tiers = ['rare', 'solid', 'swarm', 'miss', 'deep', 'common', 'clever'];
    const finished = (ids) => {
      const st = C.newDaily(C.utcDateKey(new Date()), ids);
      tiers.forEach((t, i) => {
        const tier = t === 'miss' ? null : t;
        const a = tier ? data.prompts.find((p) => p.id === ids[i]).answers.find((x) => x.tier === tier) : null;
        st.results.push({ tier, answer: a ? a.name : null, points: C.tierPoints(tier), promptId: ids[i], wrong: 0, fuzzy: false, note: '' });
      });
      st.finished = true;
      return st;
    };
    const ids = (schedule.days[C.utcDateKey(new Date())] || C.dailyPromptIds(data.prompts, C.utcDateKey(new Date()))).slice(0, 7);
    const state = finished(ids);
    // records what the page would hand to the download or to the share sheet
    const spy = `window.__saved = []; window.__shared = [];
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__saved.push({ name: this.download, blob: this.href.slice(0, 5) }); else click.call(this); };`;
    const shareStub = `Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
      Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { window.__shared.push({ n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }); return Promise.resolve(); } });`;
    const cards = [];
    for (const size of [{ width: 375, height: 812, mobile: true, initScript: spy + shareStub }, { width: 1440, height: 900, initScript: spy }]) {
      const page = await fresh(size);
      await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(state)) + ')');
      await page.reload();
      await ready(page);
      await click(page, 'dailyBtn');
      await waitPhase(page, 'results');
      const card = await page.eval('window.__swarm.card()');
      assert.ok(card.startsWith('data:image/png;base64,') && card.length > 40000, 'a real picture: ' + card.length + ' characters');
      const png = Buffer.from(card.split(',')[1], 'base64');
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1350]);
      cards.push(card);
      // what goes on the card: tiers and altitudes, never an answer
      const shown = JSON.stringify(await page.eval('window.__swarm.cardData()'));
      state.results.forEach((r) => { if (r.answer) assert.ok(!shown.includes(r.answer), 'the card data does not hold the answer "' + r.answer + '"'); });
      assert.match(shown, /"flight":\d+/);
      assert.match(shown, /"band":"/);
      assert.equal(JSON.parse(shown).rounds.length, 7);
      assert.equal(await text(page, 'saveBtn'), 'SAVE IMAGE');
      await click(page, 'saveBtn');
      if (size.mobile) {
        await page.waitFor('window.__shared.length === 1', 4000, 'the share sheet');
        const sent = (await page.eval('window.__shared'))[0];
        assert.equal(sent.n, 1);
        assert.match(sent.name, /^one-in-a-swarm-flight-\d+\.png$/);
        assert.equal(sent.type, 'image/png');
        assert.ok(sent.size > 20000);
        assert.deepEqual(await page.eval('window.__saved'), [], 'a phone with a share sheet does not also download');
      } else {
        await page.waitFor('window.__saved.length === 1', 4000, 'the download');
        const got = (await page.eval('window.__saved'))[0];
        assert.match(got.name, /^one-in-a-swarm-flight-\d+\.png$/);
        assert.equal(got.blob, 'blob:');
        assert.equal(await text(page, 'copyStatus'), 'Image saved.');
      }
      assert.equal(await page.eval('document.getElementById("shareBox").value.length > 20'), true, 'the text share is still there');
      noProblems(page);
      await page.close();
    }
    assert.equal(cards[0] === cards[1], true, 'the picture made on a 375px phone and on a 1440px desktop is identical, byte for byte');
    // a phone whose browser has no share sheet falls back to a download
    const page = await fresh({ width: 375, height: 812, mobile: true, initScript: spy });
    await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(state)) + ')');
    await page.reload();
    await ready(page);
    await click(page, 'dailyBtn');
    await waitPhase(page, 'results');
    await page.eval('Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined })');
    await click(page, 'saveBtn');
    await page.waitFor('window.__saved.length === 1', 4000, 'the download on a phone without a share sheet');
    await page.close();
    return 'card is ' + Math.round(Buffer.from(cards[0].split(',')[1], 'base64').length / 1024) + ' KB, identical at both sizes';
  });

  await scenario('your flights: bar chart, tier counts and streaks from saved data, including old and damaged saves', async () => {
    const today = C.utcDateKey(new Date());
    const dayBack = (n) => C.utcDateKey(new Date((C.dayNumber(today) - n) * 86400000));
    const tiers = ['rare', 'solid', 'swarm', null, 'deep', 'common', 'clever']; // 300 points
    const finished = () => {
      const ids = dayIds(today);
      const st = C.newDaily(today, ids);
      tiers.forEach((tier, i) => {
        const a = tier ? data.prompts.find((p) => p.id === ids[i]).answers.find((x) => x.tier === tier) : null;
        st.results.push({ tier, answer: a ? a.name : null, points: C.tierPoints(tier), promptId: ids[i], wrong: 0, fuzzy: false, note: '' });
      });
      st.finished = true;
      return st;
    };
    // a record with 35 earlier flights: only 30 are kept, a 12-day streak is running, the longest was 20
    let rec = null;
    for (let n = 40; n >= 1; n--) if (n <= 12 || n >= 18) rec = C.recordFlight(rec, dayBack(n), 100 + (n * 37) % 500, [{ tier: 'solid' }, { tier: null }]);
    rec.longest = 20;
    const cases = [
      { name: 'a full record', stats: rec, bars: 30, played: rec.played + 1, streak: 13, longest: 20, solid: rec.tiers.solid + 1, miss: rec.tiers.miss + 1 },
      { name: 'a record from before these features', stats: { v: C.SAVE_VERSION, played: 9, total: 2700, best: 520, streak: 4, lastDate: dayBack(1) }, bars: 1, played: 10, streak: 5, longest: 5, solid: 1, miss: 1 },
      { name: 'damaged extras', stats: Object.assign(JSON.parse(JSON.stringify(rec)), { history: 'oops', tiers: { common: -5 }, longest: 'many' }), bars: 1, played: rec.played + 1, streak: 13, longest: 13, solid: 1, miss: 1 },
      { name: 'no record at all', stats: null, bars: 1, played: 1, streak: 1, longest: 1, solid: 1, miss: 1 },
      { name: 'garbage', stats: 'not even an object', bars: 1, played: 1, streak: 1, longest: 1, solid: 1, miss: 1 },
    ];
    for (const size of [{ width: 375, height: 812, mobile: true }, { width: 1440, height: 900 }]) {
      for (const c of cases) {
        const page = await fresh(size);
        await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(finished())) + ')');
        if (c.stats === null) await page.eval('localStorage.removeItem("swarm.stats")');
        else await page.eval('localStorage.setItem("swarm.stats", ' + JSON.stringify(JSON.stringify(c.stats)) + ')');
        await page.reload();
        await ready(page);
        await click(page, 'dailyBtn');
        await waitPhase(page, 'results');
        const got = await page.eval(`({
          bars: document.querySelectorAll('#histBars li').length,
          today: document.querySelectorAll('#histBars li.today').length,
          last: document.querySelector('#histBars li:last-child').getAttribute('aria-label'),
          tallest: Math.max(...Array.from(document.querySelectorAll('#histBars li')).map((n) => n.getBoundingClientRect().height)),
          box: document.getElementById('histBars').getBoundingClientRect().height,
          played: document.getElementById('statPlayed').textContent, streak: document.getElementById('statStreak').textContent,
          longest: document.getElementById('statLongest').textContent, best: Number(document.getElementById('statBest').textContent),
          tiers: Array.from(document.querySelectorAll('#tierCounts li')).map((n) => n.querySelector('span').textContent + '=' + n.querySelector('strong').textContent),
          fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
          inside: Array.from(document.querySelectorAll('#histBars, #tierCounts, #stats')).every((n) => { const r = n.getBoundingClientRect(); const p = n.closest('.panel').getBoundingClientRect(); return r.left >= p.left && r.right <= p.right + 1; }),
        })`);
        const where = c.name + ' at ' + size.width + 'px';
        assert.equal(got.bars, c.bars, where + ': bars');
        assert.equal(got.today, 1, where + ': today is marked');
        assert.match(got.last, /: 300 pts$/, where);
        assert.ok(got.tallest <= got.box + 1 && got.tallest > 2, where + ': bars stay inside the chart');
        assert.equal(got.played, String(c.played), where + ': flights');
        assert.equal(got.streak, String(c.streak), where + ': streak');
        assert.equal(got.longest, String(c.longest), where + ': longest streak');
        assert.ok(got.best >= 300, where + ': best');
        assert.equal(got.tiers.length, 7, where);
        assert.ok(got.tiers.includes('Solid=' + c.solid) && got.tiers.includes('Nothing landed=' + c.miss) && got.tiers.includes('One in a Swarm=1'), where + ': ' + got.tiers.join(', '));
        assert.equal(got.fits && got.inside, true, where + ': nothing spills out of the panel or the page');
        const kept = await page.eval('JSON.parse(localStorage.getItem("swarm.stats"))');
        assert.deepEqual(C.reviveStats(kept), kept, where + ': what is saved back is a clean record');
        noProblems(page);
        await page.close();
      }
    }
  });

  await scenario('captions: one at a time, about three seconds each', async () => {
    const page = await fresh({ width: 375, height: 812, mobile: true });
    await click(page, 'dailyBtn');
    // On the lawn both the jalopy and the squirrel are in view. Watch the caption for nine seconds.
    await page.eval(`window.__caps = []; setInterval(() => { const c = document.getElementById('caption'); window.__caps.push(c.hidden || c.classList.contains('out') ? '' : c.textContent); }, 100)`);
    await sleep(9000);
    const log = await page.eval('window.__caps');
    const runs = [];
    log.forEach((t) => { if (!runs.length || runs[runs.length - 1].text !== t) runs.push({ text: t, n: 1 }); else runs[runs.length - 1].n++; });
    const shown = runs.filter((r) => r.text);
    assert.deepEqual(shown.map((r) => r.text).sort(), ['Campus squirrels remain undefeated.', 'The old gold jalopy, out for a lap.'], 'both captions were shown, one after the other');
    shown.forEach((r) => assert.ok(r.n >= 26 && r.n <= 34, '"' + r.text + '" stayed about three seconds (' + r.n / 10 + 's)'));
    assert.equal(log[log.length - 1], '', 'and then the caption is gone, not left up for the round');
    assert.equal(await page.eval('document.querySelectorAll("#caption, .sight").length'), 1, 'there is only one caption element, so two can never overlap');
    noProblems(page);
    await page.close();
  });

  await scenario('daily schedule is frozen by date, even when the prompt bank changes', async () => {
    for (const date of ['2026-10-12', '2026-12-25', '2027-06-01']) {
      server.mode = 'changed';
      const page = await fresh({ width: 800, height: 700, initScript: fakeClock(date + 'T15:00:00Z') });
      assert.equal(await page.eval('fetch("data/prompts.json").then((r) => r.json()).then((d) => d.prompts[0].id)'), 'brand-new-one', 'the page is running on a changed bank');
      await click(page, 'dailyBtn');
      assert.deepEqual((await saved(page)).promptIds, schedule.days[date], date + ' is exactly what the schedule says');
      noProblems(page);
      await page.close();
    }
    server.mode = 'ok';
    // a date beyond the schedule still gets seven prompts
    const far = await fresh({ width: 800, height: 700, initScript: fakeClock('2031-03-03T15:00:00Z') });
    await click(far, 'dailyBtn');
    assert.equal((await saved(far)).promptIds.length, 7);
    await far.close();
  });

  await scenario('a perfect 700 reaches the Moon and plants the flag; all eight zones on the way', async () => {
    const page = await fresh({ width: 375, height: 812, mobile: true });
    const day = C.utcDateKey(new Date());
    const ids7 = dayIds(day);
    const state = C.newDaily(day, ids7);
    ids7.slice(0, 6).forEach((id) => {
      const a = data.prompts.find((p) => p.id === id).answers.find((x) => x.tier === 'swarm');
      state.results.push({ tier: 'swarm', answer: a.name, points: 100, promptId: id, wrong: 0, fuzzy: false, note: '' });
    });
    await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(state)) + ')');
    await page.reload();
    await ready(page);
    assert.equal(await text(page, 'hudAlt') + (await text(page, 'hudUnit')), '424 MI');
    await startNextRound(page);
    await guess(page, answerOf(await text(page, 'promptText'), 'swarm'));
    await waitPhase(page, 'reveal');
    await page.waitFor('document.getElementById("hudAlt").textContent === "238,855"', 3000, 'the altimeter to read the distance to the Moon');
    assert.equal(await text(page, 'hudScore'), '700');
    await page.waitFor('document.getElementById("caption").textContent.startsWith("Planted")', 8000, 'the flag caption');
    assert.equal((await page.eval('JSON.parse(localStorage.getItem("swarm.sightings")).found')).includes('flag'), true);
    await land(page);
    assert.equal(await text(page, 'resAlt'), '238,855 mi');
    assert.match(await text(page, 'resSightCount'), /^· \d+ \/ 21 found$/);
    assert.equal(await page.eval('document.querySelectorAll("#resSightGrid li").length'), 21);
    assert.deepEqual(Array.from(new Set(Array.from({ length: 71 }, (_, i) => require('../../js/scene.js').SwarmScene.zoneAt(i * 10).id))), ['campus', 'midtown', 'clouds', 'weather', 'highsky', 'stratosphere', 'space', 'moon']);
    noProblems(page);
    await page.close();
  });

  await scenario('frame rate during a climb on a throttled phone', async () => {
    const page = await fresh({ width: 375, height: 812, mobile: true, reducedMotion: false });
    await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await click(page, 'dailyBtn');
    await waitPhase(page, 'guess');
    await page.eval('window.__frames = []; (function tick(t) { window.__frames.push(t); requestAnimationFrame(tick); })(performance.now())');
    await guess(page, answerOf(await text(page, 'promptText'), 'swarm'));
    await waitPhase(page, 'reveal', 9000);
    const stats = await page.eval('(() => { const f = window.__frames; const gaps = []; for (let i = 1; i < f.length; i++) gaps.push(f[i] - f[i - 1]); gaps.sort((a, b) => a - b); return { fps: Math.round((f.length - 1) / ((f[f.length - 1] - f[0]) / 1000)), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]) }; })()');
    assert.ok(stats.fps >= 50, 'average ' + stats.fps + ' fps with the CPU slowed 4x');
    assert.ok(stats.p95 <= 34, '95% of frames within two refreshes: ' + stats.p95 + 'ms');
    noProblems(page);
    await page.close();
    return stats.fps + ' fps average, 95th-percentile frame ' + stats.p95 + 'ms, CPU slowed 4x, during a 4-second climb with the gold burst';
  });

  await scenario('copy falls back when the Clipboard API is missing or refuses', async () => {
    for (const script of ['Object.defineProperty(navigator, "clipboard", { value: undefined });', 'navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));']) {
      const page = await fresh({ width: 375, height: 667, mobile: true, initScript: script + ' window.__copied = null; document.execCommand = (c) => { window.__copied = c === "copy" ? String(window.getSelection()) || document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd) : null; return true; };' });
      await click(page, 'dailyBtn');
      await playDaily(page, TIERS7);
      await land(page);
      await click(page, 'copyBtn');
      await page.waitFor('document.getElementById("copyStatus").textContent === "Copied!"', 3000, 'fallback copy confirmation');
      assert.equal(await page.eval('window.__copied'), await page.eval('document.getElementById("shareBox").value'), 'fallback selected the whole share text');
      noProblems(page);
      await page.close();
    }
  });

  await scenario('page weight, slow 3G load, nothing external, share metadata, 404', async () => {
    const page = track(await browser.newPage(calm({ width: 375, height: 667, mobile: true })));
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000 });
    const t0 = Date.now();
    await page.goto(base);
    await ready(page);
    const ms = Date.now() - t0;
    assert.equal(await view(page), 'home');
    const external = page.requests.filter((u) => !u.startsWith(base) && !u.startsWith('data:'));
    assert.deepEqual(external, [], 'no request leaves the site');
    assert.ok(page.bytes < 500 * 1024, 'page weight ' + page.bytes + ' bytes');
    assert.ok(ms < 9000, 'slow 3G load took ' + ms + 'ms');
    const meta = await page.eval('Object.fromEntries([...document.querySelectorAll("meta[property], meta[name]")].map((m) => [m.getAttribute("property") || m.name, m.content]))');
    for (const k of ['description', 'og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'twitter:card', 'twitter:image', 'og:image:width', 'og:image:height']) assert.ok(meta[k], 'missing meta ' + k);
    assert.equal(meta['og:image:width'] + 'x' + meta['og:image:height'], '1200x630');
    assert.match(meta['og:image'], /^https:\/\/.+\/assets\/og\.png$/);
    assert.ok((await page.eval('document.title')).length > 10);
    assert.ok(await page.eval('!!document.querySelector("link[rel=icon]")'));
    assert.equal(await text(page, 'footText'), 'Fan-made game. Not affiliated with or endorsed by the Georgia Institute of Technology.');
    noProblems(page);
    await page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.goto(base + 'no/such/page');
    assert.match(await page.eval('document.body.innerText'), /Wrong turn/i);
    assert.equal(await page.eval('swarmSiteRoot("someone.github.io", "/some-repo/no/such/page")'), '/some-repo/', 'project site root on GitHub Pages');
    assert.equal(await page.eval('swarmSiteRoot("example.com", "/no/such/page")'), '/', 'domain root elsewhere');
    assert.equal(await page.eval('document.getElementById("homeLink").getAttribute("href")'), '/');
    assert.deepEqual(await page.eval('[...document.querySelectorAll("script[src], link[href], img[src]")].filter((n) => !(n.getAttribute("href") || n.getAttribute("src")).startsWith("data:")).length'), 0, '404 page is self-contained');
    await page.close();
    return Math.round(page.bytes / 1024) + ' KB transferred uncompressed; title screen ready in ' + ms + 'ms on slow 3G (400ms latency, 400 kbps)';
  });

  await browser.close();
  httpServer.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n' + results.length + ' browser scenarios, ' + (results.length - failed) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
});
