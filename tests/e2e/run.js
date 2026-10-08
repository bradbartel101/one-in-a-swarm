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

const ROOT = path.join(__dirname, '..', '..');
const SUBPATH = '/some-user-repo/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
  if (rel === 'data/prompts.json' && server.mode === 'badjson') {
    res.writeHead(200, { 'content-type': TYPES['.json'] });
    return res.end('{"version": 1, "prompts": [');
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
const answerOf = (text, tier) => {
  const p = byText.get(text);
  assert.ok(p, 'unknown prompt on screen: ' + text);
  return p.answers.find((a) => a.tier === tier).name;
};
const view = (page) => page.eval('document.querySelector("[data-view]:not([hidden])").dataset.view');
const text = (page, id) => page.eval('document.getElementById(' + JSON.stringify(id) + ').textContent');
const click = (page, id) => page.eval('document.getElementById(' + JSON.stringify(id) + ').click()');
const saved = (page) => page.eval('JSON.parse(localStorage.getItem("swarm.daily"))');
const barScale = (page) => page.eval('Number(/scaleX\\(([\\d.]+)\\)/.exec(document.getElementById("barFill").style.transform)[1])');
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

async function open(opts, url) {
  const page = await browser.newPage(opts);
  await page.goto(url || base);
  return page;
}

async function ready(page) {
  await page.waitFor('document.querySelector("[data-view=loading]").hidden', 10000, 'app boot');
}

async function fresh(opts) {
  // A page whose first-visit dialog has already been seen.
  const page = await browser.newPage(opts);
  await page.goto(base + '404-probe-for-origin');
  await page.eval(SEEN);
  page.problems.length = 0; // the probe page is a deliberate 404
  await page.goto(base);
  await ready(page);
  return page;
}

async function startNextRound(page) {
  await page.waitFor('!document.querySelector("[data-view=between]").hidden', 5000, 'between view');
  await sleep(650); // the double-Enter guard
  await click(page, 'nextBtn');
  await page.waitFor('!document.querySelector("[data-view=play]").hidden', 5000, 'play view');
}

async function guess(page, value) {
  await page.eval('(() => { const g = document.getElementById("guess"); g.focus(); g.value = ' + JSON.stringify(value) + '; })()');
  await page.eval('document.getElementById("guessForm").requestSubmit()');
}

async function playDaily(page, tiers) {
  for (let i = (await saved(page) || { results: [] }).results.length; i < tiers.length; i++) {
    if ((await view(page)) !== 'play') await startNextRound(page);
    const prompt = await text(page, 'promptText');
    if (tiers[i] === 'miss') await page.eval('window.__shiftClock ? window.__shiftClock(60000) : null');
    else await guess(page, answerOf(prompt, tiers[i]));
    await page.waitFor('!document.querySelector("[data-view=between]").hidden', 5000, 'round ' + (i + 1) + ' to end');
  }
}

async function scenario(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log('✔ ' + name + ' (' + (Date.now() - started) + 'ms)' + (note ? '\n    ' + note : ''));
  } catch (err) {
    results.push({ name, ok: false });
    console.log('✖ ' + name + '\n    ' + String(err && err.stack ? err.stack : err).split('\n').slice(0, 6).join('\n    '));
  }
}

const TIERS7 = ['common', 'clever', 'solid', 'rare', 'deep', 'swarm', 'solid'];

/* ---------- scenarios ---------- */

async function main() {
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + httpServer.address().port + SUBPATH;
  browser = await launch();

  await scenario('first visit: how-to dialog opens once, never again', async () => {
    const page = await open({ width: 1440, height: 900 });
    await ready(page);
    assert.equal(await view(page), 'home');
    assert.equal(await page.eval('document.getElementById("howDlg").open'), true, 'dialog should open on first visit');
    assert.equal(await page.eval('document.activeElement.id'), 'howClose', 'focus starts on the close button');
    await page.enter();
    assert.equal(await page.eval('document.getElementById("howDlg").open'), false);
    await page.reload();
    await ready(page);
    assert.equal(await page.eval('document.getElementById("howDlg").open'), false, 'dialog must not reopen on a second visit');
    await click(page, 'howBtn');
    assert.equal(await page.eval('document.getElementById("howDlg").open'), true, 'still available on demand');
    noProblems(page);
    await page.close();
  });

  await scenario('daily run, keyboard only, desktop: play, share, refresh shows results again', async () => {
    const page = await open({ width: 1440, height: 900 });
    await ready(page);
    const focusRing = () => page.eval('(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + " " + s.outlineWidth; })()');
    await page.enter(); // close the first-visit dialog
    await page.tab();
    assert.equal(await page.eval('document.activeElement.id'), 'dailyBtn', 'first Tab stop after the heading is the daily button');
    assert.equal(await focusRing(), 'solid 3px', 'focus ring on the daily button');
    await page.enter();
    const got = [];
    for (let i = 0; i < 7; i++) {
      await page.waitFor('!document.querySelector("[data-view=between]").hidden', 5000, 'between view');
      assert.equal(await page.eval('document.activeElement.id'), 'nextBtn', 'focus lands on the next-round button');
      assert.equal(await focusRing(), 'solid 3px');
      await sleep(650);
      await page.enter();
      await page.waitFor('!document.querySelector("[data-view=play]").hidden', 5000, 'play view');
      assert.equal(await page.eval('document.activeElement.id'), 'guess', 'focus lands in the answer box');
      assert.equal(await text(page, 'hudText'), 'Round ' + (i + 1) + ' of 7');
      const prompt = await text(page, 'promptText');
      if (i === 0) {
        const before = await barScale(page);
        await page.type('definitely not an answer');
        await page.enter();
        assert.match(await text(page, 'feedback'), /Not on the list/);
        assert.equal(await page.eval('document.activeElement.id'), 'guess', 'focus stays in the box after a wrong guess');
        await sleep(150);
        const afterWrong = await barScale(page);
        assert.ok(before - afterWrong > 0.11 && before - afterWrong < 0.2, 'a wrong guess costs about 3 of 25 seconds, got ' + (before - afterWrong).toFixed(3));
        await page.type('  Definitely NOT an answer!! ');
        await page.enter();
        assert.match(await text(page, 'feedback'), /Already tried/);
        await sleep(150);
        assert.ok(afterWrong - (await barScale(page)) < 0.03, 'a duplicate costs no time');
        await page.eval('document.getElementById("guess").value = ""');
      }
      const answer = answerOf(prompt, TIERS7[i]);
      got.push(answer);
      await page.type(answer);
      await page.enter();
    }
    await page.waitFor('!document.querySelector("[data-view=between]").hidden');
    await sleep(650);
    await page.enter();
    await page.waitFor('!document.querySelector("[data-view=results]").hidden', 5000, 'results view');
    assert.equal(await text(page, 'resScore'), '330 pts');
    assert.equal(await text(page, 'resAlt'), '1,320 ft');
    assert.equal(await text(page, 'resBand'), 'Clearing the Campanile');
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
    assert.equal(lines[1], '⬜🟨🟧🟦🟪🐝🟧');
    assert.equal(lines[4], base, 'share text ends with the game URL');
    got.forEach((a) => assert.ok(!share.includes(a), 'share text leaks the answer ' + a));
    // refresh: the finished day comes straight back as results, and cannot be replayed
    const before = await saved(page);
    await page.reload();
    await ready(page);
    assert.equal(await view(page), 'results', 'refresh returns to the results screen');
    assert.equal(await text(page, 'resScore'), '330 pts');
    await click(page, 'resHomeBtn');
    assert.equal(await text(page, 'dailyBtn'), "See today's results");
    await click(page, 'dailyBtn');
    assert.equal(await view(page), 'results', 'the daily button only reopens results');
    assert.deepEqual(await saved(page), before, 'saved run unchanged');
    noProblems(page);
    assert.deepEqual(server.stray, [], 'every request stayed under the subpath');
    await page.close();
    return 'share text:\n    ' + lines.join('\n    ');
  });

  await scenario('daily run on a phone (375x667, touch): no problems', async () => {
    const page = await fresh({ width: 375, height: 667, mobile: true });
    await click(page, 'dailyBtn');
    await playDaily(page, ['swarm', 'deep', 'rare', 'solid', 'clever', 'common', 'swarm']);
    await sleep(650);
    await click(page, 'nextBtn');
    assert.equal(await view(page), 'results');
    assert.equal(await text(page, 'resScore'), '400 pts');
    assert.equal(await text(page, 'resBand'), 'Over the Midtown Skyline');
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
    assert.equal(await view(page), 'play', 'refresh returns to the live round');
    assert.equal(await text(page, 'hudText'), 'Round 2 of 7');
    const after = (await page.eval('Number(/scaleX\\(([\\d.]+)\\)/.exec(document.getElementById("barFill").style.transform)[1])')) * 25000;
    assert.ok(after < before, 'timer did not reset or gain: ' + before + ' -> ' + after);
    assert.ok(after > 0, 'timer is not negative');
    assert.ok(before - after < elapsed + 1500, 'timer lost only the time that really passed (' + Math.round(before - after) + 'ms over a ' + elapsed + 'ms reload)');
    assert.equal(await page.eval('document.querySelector("#tried li").textContent'), 'a wrong guess <b>bold</b>', 'wrong guesses restored as text');
    assert.equal(await page.eval('document.querySelectorAll("#tried li b").length'), 0);
    assert.equal(await page.eval('document.querySelector("#pips li").textContent'), '60', 'round 1 result restored');
    await guess(page, 'a wrong guess <b>bold</b>');
    assert.match(await text(page, 'feedback'), /Already tried/, 'duplicate memory survives the reload');
    await guess(page, answerOf(await text(page, 'promptText'), 'solid'));
    await page.waitFor('!document.querySelector("[data-view=between]").hidden');
    assert.match(await text(page, 'runningScore'), /^90 pts/);
    noProblems(page);
    await page.close();
    return 'before reload ' + Math.round(before) + 'ms left, after ' + Math.round(after) + 'ms';
  });

  await scenario('timer cannot be gamed: clock set back, clock set forward, frozen tab', async () => {
    const page = await fresh({ width: 1280, height: 800, initScript: fakeClock(new Date().toISOString()) });
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
    // frozen tab (what a phone does to a backgrounded page): timers stop, the clock does not
    await page.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(3000);
    await page.send('Page.setWebLifecycleState', { state: 'active' });
    await sleep(400);
    const d = (await barScale(page)) * 25000;
    assert.ok(c - d > 2800, 'time passed while the tab was frozen is charged: ' + c + ' -> ' + d);
    await page.eval('__shiftClock(3600000 * 5)'); // clock far forward: the round simply ends
    await page.waitFor('!document.querySelector("[data-view=between]").hidden', 3000, 'round to end');
    assert.equal(await text(page, 'lastBadge'), "Time's up");
    assert.equal((await saved(page)).results[0].points, 0);
    noProblems(page);
    await page.close();
    return 'left: ' + [a, b, c, d].map(Math.round).join(' -> ') + ' ms';
  });

  await scenario('midnight UTC rollover mid-run: finish yesterday, then today opens', async () => {
    const page = await fresh({ width: 1280, height: 800, initScript: fakeClock('2026-10-08T23:59:30Z') });
    const day1 = C.dailyPromptIds(data.prompts, '2026-10-08');
    const day2 = C.dailyPromptIds(data.prompts, '2026-10-09');
    await click(page, 'dailyBtn');
    await playDaily(page, ['solid', 'rare']);
    await page.eval('__shiftClock(60000)'); // now 00:00:30 UTC on the 9th
    assert.equal(await page.eval('new Date().toISOString().slice(0, 10)'), '2026-10-09');
    await sleep(1200);
    assert.equal(await view(page), 'between', 'not kicked out at midnight');
    await page.reload();
    await ready(page);
    assert.equal(await view(page), 'between', 'a reload after midnight resumes yesterday');
    assert.equal(await text(page, 'nextLabel'), 'Round 3 of 7');
    let s = await saved(page);
    assert.equal(s.date, '2026-10-08');
    assert.deepEqual(s.promptIds, day1);
    await click(page, 'homeBtn');
    assert.match(await text(page, 'dailyBtn'), /Finish yesterday's flight: round 3 of 7/);
    assert.equal(await page.eval('document.getElementById("skipStaleBtn").hidden'), false);
    await click(page, 'dailyBtn');
    await playDaily(page, ['solid', 'rare', 'common', 'common', 'common', 'common', 'common']);
    await sleep(650);
    await click(page, 'nextBtn');
    assert.equal(await view(page), 'results');
    assert.equal(await text(page, 'resDate'), 'Oct 8, 2026');
    assert.equal(await page.eval('document.getElementById("resTodayBtn").hidden'), false, "today's flight is offered");
    await click(page, 'resTodayBtn');
    assert.equal(await view(page), 'between');
    s = await saved(page);
    assert.equal(s.date, '2026-10-09');
    assert.deepEqual(s.promptIds, day2);
    assert.equal(s.results.length, 0);
    noProblems(page);
    await page.close();
  });

  await scenario('same seven prompts in UTC-12, UTC+14 and New York', async () => {
    const want = C.dailyPromptIds(data.prompts, '2026-10-08');
    const seen = [];
    for (const tz of ['Etc/GMT+12', 'Pacific/Kiritimati', 'America/New_York']) {
      const page = await fresh({ width: 1024, height: 768, timezone: tz, initScript: fakeClock('2026-10-08T11:30:00Z') });
      const local = await page.eval('new Date().toLocaleDateString("en-CA")');
      await click(page, 'dailyBtn');
      const s = await saved(page);
      assert.equal(s.date, '2026-10-08', tz);
      assert.deepEqual(s.promptIds, want, tz);
      assert.equal(await text(page, 'todayLabel'), 'Oct 8, 2026', tz + ' shows the UTC date');
      seen.push(tz + ' (local date ' + local + ')');
      noProblems(page);
      await page.close();
    }
    return seen.join(', ') + ' all drew ' + want.join(' ');
  });

  await scenario('infinite: drains only while typing, pauses on blur, ends cleanly at 0', async () => {
    const page = await fresh({ width: 1280, height: 800 });
    await click(page, 'infBtn');
    assert.equal(await view(page), 'play');
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
    assert.equal(await page.eval('document.getElementById("pauseNote").hidden'), false, 'pause is explained');
    await page.eval('document.getElementById("guess").value = "typing"'); // text left in an unfocused box
    await sleep(1200);
    const d = await barScale(page);
    assert.ok(d < c - 0.015, 'text in the box keeps the clock running: ' + c + ' -> ' + d);
    await page.eval('document.getElementById("guess").value = ""; document.getElementById("guess").focus()');
    await guess(page, answerOf(await text(page, 'promptText'), 'swarm'));
    assert.match(await text(page, 'feedback'), /One in a Swarm, \+100 pts, \+16s/);
    assert.match(await text(page, 'hudText'), /^100 pts · prompt 2/);
    await sleep(200); // the clock face repaints on the next tick
    const e = Number(await text(page, 'clockNum'));
    assert.ok(e >= 55 && e <= 59, 'clock grew by 16s: ' + e);
    await click(page, 'skipBtn');
    await sleep(200);
    const f = Number(await text(page, 'clockNum'));
    assert.ok(e - f >= 4 && e - f <= 6, 'skip costs 5s: ' + e + ' -> ' + f);
    let wrong = 0;
    while ((await view(page)) === 'play') {
      await guess(page, 'wrong guess number ' + wrong++);
      assert.ok(wrong < 40, 'run should end');
    }
    assert.equal(await view(page), 'infover');
    assert.ok(wrong >= 14 && wrong <= 20, 'about 17 wrong guesses drain the clock, took ' + wrong);
    assert.equal(await text(page, 'infScore'), '100 pts');
    assert.equal(await text(page, 'infTitle'), 'New best run.');
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
    assert.equal(await text(page, 'infTitle'), 'You emptied the hive.');
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
      await page.eval('document.getElementById("howDlg").close()');
      await click(page, 'dailyBtn');
      for (let i = 0; i < 7; i++) {
        await startNextRound(page);
        if (i === 0) await guess(page, 'wrong');
        await guess(page, answerOf(await text(page, 'promptText'), 'rare'));
      }
      await page.waitFor('!document.querySelector("[data-view=between]").hidden');
      await sleep(650);
      await click(page, 'nextBtn');
      assert.equal(await view(page), 'results');
      assert.equal(await text(page, 'resScore'), '420 pts');
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
    const ids = C.dailyPromptIds(data.prompts, today);
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
      await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(value) + '); localStorage.setItem("swarm.infinite.best", ' + JSON.stringify(value) + ')');
      await page.reload();
      await ready(page);
      assert.equal(await view(page), 'home', 'boots to home with: ' + value.slice(0, 50));
      assert.equal(await text(page, 'dailyBtn'), "Start today's flight", 'bad save ignored: ' + value.slice(0, 50));
      assert.equal(await text(page, 'bestLabel'), 'No best run yet.');
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
      const page = await browser.newPage({ width: 375, height: 667, mobile: true });
      server.mode = mode;
      if (mode === 'blocked') await page.send('Network.setBlockedURLs', { urls: ['*prompts.json'] });
      await page.goto(base);
      await page.waitFor('!document.querySelector("[data-view=error]").hidden', 5000, 'error view (' + mode + ')');
      assert.equal(await text(page, 'errorText'), 'The game data did not load. Check your connection and try again.');
      assert.equal(await page.eval('document.activeElement.id'), 'retryBtn');
      assert.ok((await page.eval('document.body.innerText')).length > 80, 'not a blank screen');
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
    assert.equal(await view(page), 'play', 'still running after emoji, blank and a 200,000-character guess');
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

  await scenario('layout at 320, 375, 768 and 1440: no sideways scroll, nothing cut off, big tap targets', async () => {
    const longest = data.prompts.slice().sort((a, b) => b.text.length - a.text.length)[0];
    const others = data.prompts.filter((p) => p !== longest).slice(0, 6).map((p) => p.id);
    const audit = `(() => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + vw);
      const scope = document.querySelector('dialog[open]') || document.body;
      scope.querySelectorAll('*').forEach((n) => {
        if (n.closest('.sr-only, .skip, [hidden], script, style') || !n.getClientRects().length) return;
        if (getComputedStyle(n).clip === 'rect(0px, 0px, 0px, 0px)') return; // visually hidden, still read aloud
        if (!document.querySelector('dialog[open]') && n.closest('dialog')) return;
        const r = n.getBoundingClientRect();
        const id = n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && n.className.baseVal === undefined ? '.' + String(n.className).split(' ')[0] : '');
        if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.push(id + ' leaves the viewport: ' + Math.round(r.left) + '..' + Math.round(r.right));
        if (n.matches('button, input, textarea, summary, a[href]')) {
          if (r.height < 44 || r.width < 44) out.push(id + ' tap target ' + Math.round(r.width) + 'x' + Math.round(r.height));
        }
        const card = n.closest('.card, dialog');
        if (card && card !== n && r.width) {
          const c = card.getBoundingClientRect();
          if (r.left < c.left - 0.5 || r.right > c.right + 0.5) out.push(id + ' spills out of its card: ' + Math.round(r.left) + '..' + Math.round(r.right) + ' vs ' + Math.round(c.left) + '..' + Math.round(c.right));
        }
        if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0 && getComputedStyle(n).display !== 'inline' && !n.closest('[aria-hidden=true]')) out.push(id + ' content is wider than its box: ' + n.scrollWidth + ' > ' + n.clientWidth);
        if (n.matches('textarea') && n.scrollHeight > n.clientHeight + 1) out.push(id + ' text is cut off vertically');
        if (n.matches('input, textarea, select') && parseFloat(getComputedStyle(n).fontSize) < 16) out.push(id + ' font below 16px');
      });
      return out;
    })()`;
    const notes = [];
    for (const [w, h, mobile] of [[320, 568, true], [375, 667, true], [768, 1024, true], [1440, 900, false]]) {
      const page = await fresh({ width: w, height: h, mobile });
      const check = async (label) => assert.deepEqual(await page.eval(audit), [], w + 'px ' + label);
      await check('home');
      await click(page, 'howBtn');
      await check('how-to dialog');
      await page.eval('document.getElementById("howDlg").close()');
      // a live round on the longest prompt in the bank, with the worst-case row of wrong guesses
      const state = C.newDaily(C.utcDateKey(new Date()), [longest.id].concat(others));
      state.results = [];
      state.round = { index: 0, leftMs: 25000, seenAt: Date.now(), tried: [{ key: 'a', text: 'W'.repeat(60) }, { key: 'b', text: 'supercalifragilistic expialidocious' }] };
      await page.eval('localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(state)) + ')');
      await page.reload();
      await ready(page);
      assert.equal(await text(page, 'promptText'), longest.text);
      await check('play');
      if (mobile && w < 700) {
        const box = await page.eval('(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { clockTop: r("clock").top, inputBottom: r("guess").bottom, scrollY: window.scrollY }; })()');
        // An on-screen keyboard leaves roughly the top 45% of a small phone visible.
        assert.ok(box.clockTop >= 0, 'clock is on screen');
        assert.ok(box.inputBottom <= h * 0.45, w + 'px: answer box bottom at ' + Math.round(box.inputBottom) + 'px must sit above the keyboard line (' + Math.round(h * 0.45) + 'px)');
        notes.push(w + 'x' + h + ': clock top ' + Math.round(box.clockTop) + 'px, answer box bottom ' + Math.round(box.inputBottom) + 'px');
      }
      await guess(page, longest.answers.find((a) => a.tier === 'swarm').name);
      await page.waitFor('!document.querySelector("[data-view=between]").hidden');
      await check('between rounds');
      await playDaily(page, ['swarm', 'deep', 'rare', 'solid', 'clever', 'common', 'swarm']);
      await sleep(650);
      await click(page, 'nextBtn');
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
    assert.equal(await page.eval('document.getElementById("pips").getAttribute("aria-hidden")'), 'true', 'decorative pips are hidden from the accessibility tree');
    await click(page, 'dailyBtn');
    await startNextRound(page);
    await page.eval('window.__said = []; new MutationObserver(() => window.__said.push(document.getElementById("clockLive").textContent)).observe(document.getElementById("clockLive"), { childList: true, characterData: true, subtree: true })');
    await sleep(1000);
    await guess(page, 'nope nope');
    assert.equal(await text(page, 'feedback'), 'Not on the list. −3 seconds.');
    await page.eval('__shiftClock(10000)');
    await sleep(1200);
    await page.eval('__shiftClock(4000)');
    await sleep(1000);
    assert.deepEqual(await page.eval('window.__said'), ['10 seconds left', '5 seconds left'], 'the clock speaks exactly twice in a round');
    await guess(page, answerOf(await text(page, 'promptText'), 'deep'));
    await page.waitFor('!document.querySelector("[data-view=between]").hidden');
    assert.match(await text(page, 'announce'), /^Round 1: Deep Cut, .+, plus 85 points\. Total 85 points\.$/);
    assert.equal(await text(page, 'lastBadge'), 'Deep Cut', 'tier is written out, not only coloured');
    await startNextRound(page);
    assert.equal(await page.eval('document.querySelector("#pips li").textContent'), '85', 'pips carry the points as text');
    noProblems(page);
    await page.close();
  });

  await scenario('dark mode and reduced motion are honoured', async () => {
    const dark = await fresh({ width: 800, height: 700, colorScheme: 'dark', reducedMotion: true });
    assert.equal(await dark.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(0, 33, 61)');
    assert.equal(await dark.eval('getComputedStyle(document.body).color'), 'rgb(255, 255, 255)');
    await click(dark, 'infBtn');
    await guess(dark, 'wrong');
    assert.equal(await dark.eval('document.getElementById("entry").classList.contains("shake")'), true);
    assert.equal(await dark.eval('getComputedStyle(document.getElementById("entry")).animationName'), 'none', 'no shake with reduced motion');
    assert.equal(await dark.eval('getComputedStyle(document.querySelector(".btn")).transitionDuration'), '0s');
    noProblems(dark);
    await dark.close();
    const light = await fresh({ width: 800, height: 700, colorScheme: 'light' });
    assert.equal(await light.eval('getComputedStyle(document.body).backgroundColor'), 'rgb(255, 255, 255)');
    await click(light, 'infBtn');
    await guess(light, 'wrong');
    assert.equal(await light.eval('getComputedStyle(document.getElementById("entry")).animationName'), 'shake', 'shake plays by default');
    noProblems(light);
    await light.close();
  });

  await scenario('copy falls back when the Clipboard API is missing or refuses', async () => {
    for (const script of ['Object.defineProperty(navigator, "clipboard", { value: undefined });', 'navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));']) {
      const page = await fresh({ width: 375, height: 667, mobile: true, initScript: script + ' window.__copied = null; document.execCommand = (c) => { window.__copied = c === "copy" ? String(window.getSelection()) || document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd) : null; return true; };' });
      await click(page, 'dailyBtn');
      await playDaily(page, TIERS7);
      await sleep(650);
      await click(page, 'nextBtn');
      await click(page, 'copyBtn');
      await page.waitFor('document.getElementById("copyStatus").textContent === "Copied!"', 3000, 'fallback copy confirmation');
      assert.equal(await page.eval('window.__copied'), await page.eval('document.getElementById("shareBox").value'), 'fallback selected the whole share text');
      noProblems(page);
      await page.close();
    }
  });

  await scenario('page weight, slow 3G load, nothing external, share metadata, 404', async () => {
    const page = await browser.newPage({ width: 375, height: 667, mobile: true });
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
    assert.ok(ms < 8000, 'slow 3G load took ' + ms + 'ms');
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
    return Math.round(page.bytes / 1024) + ' KB transferred uncompressed; home screen ready in ' + ms + 'ms on slow 3G (400ms latency, 400 kbps)';
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
