#!/usr/bin/env node
'use strict';
/* Plays three flights in headless Chrome at phone and desktop size and saves screenshots into
   screenshots/v3/: one of about 150 points, one of about 350, and a perfect 700, plus every
   zone, some easter eggs, a secret answer, the One in a Swarm moment and the results screen.
   Tiers are forced by looking answers up by tier in the prompt bank. Run with: npm run screens */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp.js');
const C = require('../../js/core.js');
const data = require('../../data/prompts.json');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'screenshots', 'v3');
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

const day = C.utcDateKey(new Date());
const order = ['majors', 'nba', 'marta', 'nfl', 'cs', 'codes', 'qbs']; // prompts where no secret answer is a real one
const answer = (id, tier) => data.prompts.find((p) => p.id === id).answers.find((a) => a.tier === tier);

// A saved run with these tiers already played, so a flight can be picked up near its end.
function seed(tiers) {
  const state = C.newDaily(day, order);
  tiers.forEach((tier, i) => {
    const a = tier ? answer(order[i], tier) : null;
    state.results.push({ tier: tier || null, answer: a ? a.name : null, points: C.tierPoints(tier), promptId: order[i], wrong: 0, fuzzy: false, note: '' });
  });
  state.finished = state.results.length === 7;
  return state;
}

async function run(browser, base, name, width, height, mobile) {
  const page = await browser.newPage({ width, height, mobile });
  const shot = async (label) => {
    const file = path.join(OUT, name + '-' + label + '.png');
    for (let attempt = 1; ; attempt++) {
      const ok = await Promise.race([page.screenshot(file).then(() => true), sleep(8000).then(() => false)]);
      if (ok) break;
      if (attempt === 3) throw new Error('screenshot timed out: ' + label);
    }
    process.stdout.write(label + ' ');
  };
  const phase = (p, ms) => page.waitFor('document.body.dataset.phase === "' + p + '"', ms || 12000, 'phase ' + p);
  const load = async (state) => {
    await page.eval(state ? 'localStorage.setItem("swarm.daily", ' + JSON.stringify(JSON.stringify(state)) + ')' : 'localStorage.removeItem("swarm.daily")');
    await page.goto(base);
    await page.waitFor('document.body.dataset.phase !== "loading"', 12000, 'boot');
    await page.eval('document.fonts.ready');
    await sleep(900);
  };
  const submit = async (text) => {
    await page.waitFor('!document.getElementById("guess").dataset.locked', 3000, 'lock');
    await page.eval('(() => { const g = document.getElementById("guess"); g.focus(); g.value = ' + JSON.stringify(text) + '; document.getElementById("guessForm").requestSubmit(); })()');
  };
  const play = async (tier) => {
    await phase('guess');
    const id = await page.eval('JSON.parse(localStorage.getItem("swarm.daily")).promptIds[JSON.parse(localStorage.getItem("swarm.daily")).round.index]');
    await submit(answer(id, tier).name);
  };
  const next = async () => {
    await sleep(700);
    await page.eval('document.getElementById("nextBtn").click()');
  };
  const tap = async (what) => {
    const b = await page.eval('window.__swarm.scene.box("' + what + '")');
    if (b) await page.click(b.x + b.w / 2, b.y + b.h / 2);
    return !!b;
  };

  await page.goto(base);
  await load(null);
  await shot('01-start-campus');
  for (let i = 0; i < 5; i++) await tap('tower');
  await sleep(500);
  await shot('02-egg-tower-chime');

  // every zone, at rest on the reveal card
  const stops = [['midtown', ['rare', 'clever']], ['clouds', ['swarm', 'solid', 'common', 'common']], ['weather', ['swarm', 'swarm', 'rare']],
    ['highsky', ['swarm', 'swarm', 'swarm', 'rare']], ['stratosphere', ['swarm', 'swarm', 'swarm', 'swarm', 'deep']], ['space', ['swarm', 'swarm', 'swarm', 'swarm', 'swarm', 'deep']]];
  let n = 3;
  for (const [zone, tiers] of stops) {
    await load(seed(tiers));
    await shot(String(n++).padStart(2, '0') + '-zone-' + zone);
  }

  // flight one: about 150 points. A secret answer, a real climb, and where it ends up.
  await load(seed(['rare', 'solid', 'clever', 'common']));
  await next();
  await phase('guess');
  await submit('Buzz');
  await sleep(250);
  await shot('09-secret-answer-buzz');
  await submit('UGA');
  await sleep(200);
  await shot('10-secret-answer-wrong-school');
  await play('solid');
  await phase('climb');
  await sleep(1100);
  await shot('11-flight150-mid-climb');
  await phase('reveal');
  await sleep(900);
  await shot('12-flight150-ends-here');
  if (await tap('balloon')) {
    await sleep(350);
    await shot('13-egg-balloon-popped');
  }
  await load(seed(['rare', 'solid', 'clever', 'common', 'solid', null, null]));
  await shot('14-flight150-results');

  // flight two: about 350 points
  await load(seed(['swarm', 'deep', 'rare', 'solid', 'clever']));
  await next();
  await play('rare');
  await phase('climb');
  await sleep(1400);
  await shot('15-flight350-mid-climb');
  await phase('reveal');
  await sleep(900);
  await shot('16-flight350-ends-here');

  // flight three: a perfect 700
  await load(seed(['swarm', 'swarm', 'swarm', 'swarm', 'swarm']));
  await next();
  await play('swarm');
  await page.waitFor('document.getElementById("flash").classList.contains("go")', 9000, 'the gold flash');
  await sleep(140);
  await shot('17-one-in-a-swarm-moment');
  await phase('reveal');
  await sleep(900);
  await shot('18-egg-astronaut-in-space');
  await next();
  await play('swarm');
  await phase('climb');
  await sleep(2600);
  await shot('19-moon-approach');
  await phase('reveal');
  await sleep(1200);
  await shot('20-zone-moon-landed-with-flag');
  await next();
  await phase('results');
  await sleep(500);
  await shot('21-flight700-results');
  await page.eval('document.querySelector("#resSightGrid").scrollIntoView({ block: "center" })');
  await sleep(300);
  await shot('22-results-sightings-panel');
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
    console.log('\nsaved ' + name + ' screenshots');
  }
  // The link-preview image is the real title screen, without the corner buttons.
  const og = await browser.newPage({ width: 1200, height: 630 });
  await og.goto(base);
  await og.waitFor('document.body.dataset.phase === "home"', 12000, 'title screen');
  await og.eval('document.fonts.ready');
  await og.eval('document.getElementById("tools").hidden = true; document.getElementById("footText").hidden = true;');
  await sleep(600);
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
