#!/usr/bin/env node
/* Renders the 1200x630 link-preview image (assets/og.png) with headless Chrome.
   Original artwork: hexagons and stripes only. No Georgia Tech marks. Run: node tools/make-og.js */
'use strict';
const path = require('path');
const { launch } = require('../tests/e2e/cdp.js');

const hex = 'clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
const tiers = [['#e3e6ea', '#1f2933', '10'], ['#f7dc6f', '#3d2f00', '15'], ['#f5a65b', '#3b1d00', '30'], ['#1f5fbf', '#fff', '60'], ['#6b3fa0', '#fff', '85'], ['#b3a369', '#003057', '100']];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #003057; color: #fff; font-family: "Helvetica Neue", Arial, sans-serif;
    background-image: linear-gradient(60deg, rgba(179,163,105,.13) 2px, transparent 2px), linear-gradient(-60deg, rgba(179,163,105,.13) 2px, transparent 2px), linear-gradient(0deg, rgba(179,163,105,.13) 2px, transparent 2px);
    background-size: 72px 124px, 72px 124px, 72px 62px; }
  .wrap { position: absolute; inset: 0; padding: 70px 80px; display: flex; flex-direction: column; justify-content: space-between;
    background: radial-gradient(ellipse at 30% 45%, #003057 35%, rgba(0,48,87,.55) 100%); }
  .eyebrow { font-size: 30px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #b3a369; }
  h1 { font-size: 132px; line-height: .95; font-weight: 900; letter-spacing: -.03em; text-transform: uppercase; margin-top: 18px; }
  h1 span { color: #b3a369; }
  p { font-size: 40px; font-weight: 600; margin-top: 26px; color: #dfe6ee; }
  .row { display: flex; gap: 14px; align-items: center; }
  .pip { width: 84px; height: 94px; ${hex}; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; }
  .note { margin-left: auto; font-size: 22px; color: #c5d0db; }
  svg { position: absolute; right: 70px; top: 96px; width: 300px; height: 300px; }
</style></head><body><div class="wrap">
  <div><div class="eyebrow">A daily Georgia Tech word game</div>
  <h1>One in a<br><span>Swarm</span></h1>
  <p>Don't say the obvious thing.</p></div>
  <div class="row">${tiers.map((t) => `<div class="pip" style="background:${t[0]};color:${t[1]}">${t[2]}</div>`).join('')}<div class="note">Fan-made. Not affiliated with Georgia Tech.</div></div>
  <svg viewBox="0 0 48 48"><ellipse cx="13" cy="9" rx="9" ry="5" transform="rotate(-24 13 9)" fill="#fff" stroke="#b3a369" stroke-width="1.5"/><ellipse cx="35" cy="9" rx="9" ry="5" transform="rotate(24 35 9)" fill="#fff" stroke="#b3a369" stroke-width="1.5"/><path d="M24 8l15 8.5v17L24 42 9 33.5v-17z" fill="#b3a369" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><path d="M11 20.5h26M11 29.5h26" stroke="#003057" stroke-width="5"/></svg>
</div></body></html>`;

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ width: 1200, height: 630 });
  await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const out = path.join(__dirname, '..', 'assets', 'og.png');
  await page.screenshot(out);
  await browser.close();
  console.log('wrote ' + out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
