#!/usr/bin/env node
'use strict';
/* Plays one flight in headless Chrome at phone and desktop size and saves screenshots of the
   moments worth looking at: start, a wrong guess, a near-miss, mid-climb, a reveal card, the
   One in a Swarm moment, a timeout, and the results. Run with: npm run screens */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp.js');
const data = require('../../data/prompts.json');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

const fakeClock = `(() => { const R = Date; let off = 0;
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
  window.Date = D; window.__shiftClock = (ms) => { off += ms; }; })();`;

async function run(browser, base, name, width, height, mobile) {
  const page = await browser.newPage({ width, height, mobile, initScript: fakeClock });
  const shot = async (label) => {
    const file = path.join(OUT, name + '-' + label + '.png');
    for (let attempt = 1; ; attempt++) {
      const ok = await Promise.race([page.screenshot(file).then(() => true), sleep(8000).then(() => false)]);
      if (ok) break;
      if (attempt === 3) throw new Error('screenshot timed out: ' + label);
    }
    process.stdout.write(label + ' ');
  };
  const phase = (p) => page.waitFor('document.body.dataset.phase === "' + p + '"', 12000, 'phase ' + p);
  const prompt = async () => data.prompts.find((p) => p.text === document_text);
  let document_text = '';
  const current = async () => {
    document_text = await page.eval('document.getElementById("promptText").textContent');
    return prompt();
  };
  const submit = async (text) => {
    await page.eval('(() => { const g = document.getElementById("guess"); g.focus(); g.value = ' + JSON.stringify(text) + '; document.getElementById("guessForm").requestSubmit(); })()');
  };
  const next = async () => {
    await sleep(700);
    await page.eval('document.getElementById("nextBtn").click()');
  };

  await page.goto(base);
  await page.eval('localStorage.setItem("swarm.seenHowTo", "1")');
  await page.goto(base);
  await phase('home');
  await page.eval('document.fonts.ready');
  await sleep(500);
  await shot('1-start');

  // round 1: a wrong guess, a near-miss, then confirm it and watch the climb
  await page.eval('document.getElementById("dailyBtn").click()');
  await sleep(400);
  await shot('2-liftoff');
  await phase('guess');
  let p = await current();
  await submit('gatorade');
  await sleep(150);
  await shot('3-wrong-guess');
  await sleep(450);
  const target = p.answers.find((a) => a.tier === 'rare' && !/\d/.test(a.name) && a.name.length >= 7) || p.answers.find((a) => !/\d/.test(a.name) && a.name.length >= 7);
  const typo = target.name.slice(0, 2) + target.name.slice(3);
  await submit(typo);
  await sleep(150);
  await shot('4-near-miss');
  await submit(typo);
  await phase('climb');
  await sleep(900);
  await shot('5-mid-climb');
  await phase('reveal');
  await sleep(400);
  await shot('6-reveal-card');

  // round 2: the One in a Swarm answer
  await next();
  await phase('guess');
  p = await current();
  await submit(p.answers.find((a) => a.tier === 'swarm').name);
  await phase('climb');
  await sleep(1500);
  await shot('7-swarm-climb');
  await page.waitFor('document.getElementById("flash").classList.contains("go")', 8000, 'the gold flash');
  await sleep(160);
  await shot('8-swarm-moment');
  await phase('reveal');
  await sleep(700);
  await shot('9-swarm-card');

  // round 3: let the clock run out
  await next();
  await phase('guess');
  await page.eval('__shiftClock(60000)');
  await phase('reveal');
  await sleep(700);
  await shot('10-timeout');

  // rounds 4 to 7, then land
  for (const tier of ['deep', 'rare', 'swarm', 'deep']) {
    await next();
    await phase('guess');
    p = await current();
    await submit(p.answers.find((a) => a.tier === tier).name);
    await phase('reveal');
  }
  await sleep(300);
  await shot('11-high-altitude');
  await next();
  await phase('results');
  await sleep(400);
  await shot('12-results');
  await page.eval('window.scrollTo(0, document.body.scrollHeight)');
  await sleep(200);
  await shot('13-results-lower');
  const problems = page.problems.slice();
  await page.close();
  return problems;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await launch();
  let bad = [];
  for (const [name, w, h, mobile] of [['phone-375', 375, 812, true], ['desktop-1440', 1440, 900, false]]) {
    bad = bad.concat(await run(browser, base, name, w, h, mobile));
    console.log('saved ' + name + ' screenshots');
  }
  // The link-preview image is the real title screen, without the corner buttons.
  const og = await browser.newPage({ width: 1200, height: 630 });
  await og.goto(base);
  await og.eval('localStorage.setItem("swarm.seenHowTo", "1")');
  await og.goto(base);
  await og.waitFor('document.body.dataset.phase === "home"', 12000, 'title screen');
  await og.eval('document.fonts.ready');
  await og.eval('document.getElementById("tools").hidden = true; document.getElementById("footText").hidden = true;');
  await sleep(500);
  await og.screenshot(path.join(ROOT, 'assets', 'og.png'));
  await og.close();
  console.log('saved assets/og.png');

  await browser.close();
  server.close();
  if (bad.length) {
    console.log('console problems:\n  ' + bad.join('\n  '));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
