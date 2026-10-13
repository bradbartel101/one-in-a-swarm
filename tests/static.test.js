'use strict';
/* Checks on the shipped files themselves: safety, weight, paths, metadata, housekeeping. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCRIPTS = ['config.js', 'js/core.js', 'js/facts.js', 'js/sfx.js', 'js/scene.js', 'js/card.js', 'js/app.js'];
const SITE = ['index.html', '404.html', 'css/style.css', 'data/index.json', 'data/schedule.json', 'assets/fonts/press-start-2p.woff2', 'manifest.webmanifest', 'assets/icons/icon-192.png'].concat(SCRIPTS);
const DISCLAIMER = 'Fan-made game. Not affiliated with or endorsed by the Georgia Institute of Technology.';

test('F2: no HTML-string sinks or dynamic code anywhere in the scripts', () => {
  for (const f of SCRIPTS.concat('index.html', '404.html')) {
    const src = read(f);
    for (const bad of [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/, /\bsetTimeout\s*\(\s*['"`]/, /\son\w+\s*=\s*["']/]) {
      assert.ok(!bad.test(src), f + ' contains ' + bad);
    }
  }
  assert.match(read('js/app.js'), /textContent/);
});

test('F3: the whole site is far under 500 KB', () => {
  const pageBytes = SITE.filter((f) => f !== '404.html').reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  assert.ok(pageBytes < 500 * 1024, 'page weight is ' + pageBytes + ' bytes');
  const withImage = pageBytes + fs.statSync(path.join(ROOT, 'assets/og.png')).size + fs.statSync(path.join(ROOT, '404.html')).size;
  assert.ok(withImage < 500 * 1024, 'everything deployed is ' + withImage + ' bytes');
});

test('F4 / G1: nothing is loaded from another origin, and every path is relative', () => {
  for (const f of ['index.html', '404.html']) {
    const html = read(f);
    const refs = [...html.matchAll(/<(?:script|img|link|source|iframe)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    refs.forEach((u) => {
      if (u.startsWith('data:')) return;
      if (/rel="canonical"/.test(html.slice(html.indexOf(u) - 40, html.indexOf(u)))) return; // metadata, not a load
      assert.ok(!/^(https?:)?\/\//.test(u), f + ' loads an external resource: ' + u);
      assert.ok(!u.startsWith('/'), f + ' uses a root-relative path: ' + u);
    });
  }
  const css = read('css/style.css');
  [...css.matchAll(/url\(\s*["']?([^"')]+)/g)].forEach((m) => assert.ok(m[1].startsWith('data:') || m[1] === '../assets/fonts/press-start-2p.woff2', 'css loads ' + m[1]));
  assert.ok(!/@import/.test(css));
  const fetches = [...read('js/app.js').matchAll(/fetch\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(fetches.sort(), ['data/index.json', 'data/p/', 'data/schedule.json'], 'the index, one prompt at a time, and the schedule');
  const scripts = SCRIPTS.map(read).join('');
  // The only addresses in the scripts are the two that make up the optional visit counter,
  // which loads nothing unless the owner sets a site code in config.js.
  const urls = (scripts.match(/https?:\/\/[^\s'"`)]*/g) || []).filter((u) => u !== 'https://gc.zgo.at/count.js' && u !== 'https://');
  assert.deepEqual(urls, [], 'scripts mention no other URLs');
  assert.ok(!/\.(mp3|ogg|wav|m4a|png|jpg|gif|webp)\b/.test(scripts.replace(/\+ '\.png';/, ';') /* the name of the share card the player saves */ + read('index.html').replace(/assets\/og\.png|assets\/icons\/apple-touch-icon\.png/g, '')), 'art and sound are made in code, not downloaded');
  assert.match(read('assets/fonts/OFL.txt'), /SIL Open Font License/, 'the self-hosted font ships with its licence');
  assert.ok(!/google-analytics|googletagmanager|gtag\(|sentry|facebook|fbq\(/i.test(read('index.html') + read('js/app.js')), 'no analytics or tracking');
});

test('E3: title, description, favicon, Open Graph and Twitter tags, and a 1200x630 PNG', () => {
  const html = read('index.html');
  assert.match(html, /<title>[^<]{10,70}<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{50,170}">/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml/);
  for (const p of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) assert.ok(html.includes('property="' + p + '"'), p);
  for (const n of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(html.includes('name="' + n + '"'), n);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  const png = fs.readFileSync(path.join(ROOT, 'assets/og.png'));
  assert.equal(png.slice(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

test('E4 / E5: the disclaimer is on every page, and no image files besides the preview ship', () => {
  assert.ok(read('index.html').includes(DISCLAIMER));
  assert.ok(read('404.html').includes(DISCLAIMER));
  assert.ok(!/<img\b/.test(read('index.html') + read('404.html')), 'no raster or remote images in the pages');
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'assets')).sort(), ['fonts', 'icons', 'og.png']);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'assets', 'icons')).sort(), ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'], 'the home-screen icons, drawn by tools/build-icons.js');
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'assets', 'fonts')).sort(), ['OFL.txt', 'press-start-2p.woff2']);
});

test('F5: no debug logging, debugger statements or leftover TODOs in shipped files', () => {
  for (const f of SITE.filter((x) => !/\.(json|woff2)$/.test(x))) {
    const src = read(f);
    for (const bad of [/console\.\w+\s*\(/, /\bdebugger\b/, /\bTODO\b/, /\bFIXME\b/, /\bXXX\b/]) assert.ok(!bad.test(src), f + ' contains ' + bad);
  }
});

test('F5: every function defined in app.js is used', () => {
  const src = read('js/app.js');
  [...src.matchAll(/^\s*function (\w+)\s*\(/gm)].forEach((m) => {
    const uses = src.split(new RegExp('\\b' + m[1] + '\\b')).length - 1;
    assert.ok(uses >= 2, m[1] + ' is defined but never used');
  });
});

test('F5: every core export is used by the app or the tools', () => {
  const core = require('../js/core.js');
  const users = read('js/app.js') + read('tools/build-icons.js') + read('tools/build-prompts.js') + read('tools/build-schedule.js') + read('tools/validate.js');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2B1B}\u{2B1C}]/u.test(read('index.html') + read('js/app.js') + read('css/style.css')), 'no emoji in the interface, only in the share text');
  const internal = read('js/core.js');
  Object.keys(core).forEach((k) => {
    const usedOutside = new RegExp('\\b(C|core)\\.' + k + '\\b').test(users);
    const usedInside = internal.split(new RegExp('\\b' + k + '\\b')).length - 1 >= 3; // definition, export, and a call
    assert.ok(usedOutside || usedInside, 'core.' + k + ' is exported but unused');
  });
});

test('G2 / G3: deployment files are in place', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '.nojekyll')));
  const readme = read('README.md');
  for (const s of ['npm run test:all', 'npm test', 'npm run validate', 'npm run test:e2e', 'npm run build:data', 'GitHub Pages', 'tools/prompts.src.txt']) assert.ok(readme.includes(s), 'README mentions ' + s);
  const wf = read('.github/workflows/test.yml');
  assert.match(wf, /on:\s*\n\s+push:/);
  assert.ok(wf.includes('npm test') && wf.includes('npm run validate'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:all'], 'npm test && npm run validate && npm run test:e2e');
  assert.ok(!pkg.dependencies && !pkg.devDependencies, 'no dependencies');
});

/* ----- launch essentials ----- */
const C = require('../js/core.js');

// width and height of a PNG, from its header
function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', file + ' is a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('visit counter: nothing is loaded unless a plain GoatCounter site code is set', () => {
  const config = read('config.js');
  assert.match(config, /GOATCOUNTER_CODE: '',/, 'ships switched off');
  assert.match(config, /FEEDBACK_URL: '',/, 'ships switched off');
  for (const off of ['', '   ', null, undefined, 'my site', 'evil.com/x', 'a.b', '-abc', 'abc-', 'https://x', '"><script>']) assert.equal(C.goatCounter(off), null, JSON.stringify(off));
  assert.deepEqual(C.goatCounter('MySwarm '), { src: 'https://gc.zgo.at/count.js', endpoint: 'https://myswarm.goatcounter.com/count' });
  const app = read('js/app.js');
  assert.equal(app.match(/gc\.src|goatCounter\(/g).length >= 2, true);
  assert.doesNotMatch(app, /document\.cookie/, 'the game sets no cookies');
  assert.doesNotMatch(app + read('js/core.js'), /https?:\/\/(?!gc\.zgo\.at|['" ]|\[|x\b)[a-z0-9.-]+\.(com|net|org|io)(?!\/count)/i, 'no other third-party address is built into the scripts');
});

test('feedback link: carries the date and the prompt ids, and only ever points at https or mailto', () => {
  const ids = ['cs', 'nba', 'buildings'];
  assert.equal(C.feedbackLink('', '2026-10-13', ids), '', 'empty means no link');
  assert.equal(C.feedbackLink('https://forms.example/tier', '2026-10-13', ids), 'https://forms.example/tier?date=2026-10-13&prompts=cs%2Cnba%2Cbuildings');
  assert.equal(C.feedbackLink('https://forms.example/tier?src=game#top', '2026-10-13', ids), 'https://forms.example/tier?src=game&date=2026-10-13&prompts=cs%2Cnba%2Cbuildings#top');
  const mail = C.feedbackLink('mailto:owner@example.com', '2026-10-13', ids);
  assert.match(mail, /^mailto:owner@example\.com\?subject=/);
  assert.match(decodeURIComponent(mail), /Date: 2026-10-13\nPrompts: cs,nba,buildings/);
  for (const bad of ['javascript:alert(1)', 'http://plain.example/', 'data:text/html,x', '//example.com', 'ftp://x', 'https://a b', null]) assert.equal(C.feedbackLink(bad, '2026-10-13', ids), '', String(bad));
  assert.equal(C.feedbackLink('https://x.example/', 'not a date', ['ok', 'bad id!', '<b>']), 'https://x.example/?date=&prompts=ok', 'only clean values are passed on');
});

test('link preview and home-screen files: the right sizes, and every address on the site domain', () => {
  const html = read('index.html');
  const SITE_URL = 'https://oneinaswarm.io/';
  // the custom domain GitHub Pages serves is the one in CNAME, and nothing still points at the old address
  assert.equal(read('CNAME').trim(), new URL(SITE_URL).hostname);
  for (const f of ['index.html', '404.html', 'manifest.webmanifest', 'config.js', 'js/app.js', 'js/core.js', 'js/card.js']) assert.ok(!/github\.io\/one-in-a-swarm/.test(read(f)), f + ' still names the old github.io address');
  assert.deepEqual(pngSize('assets/og.png'), [1200, 630]);
  const meta = (key) => { const m = new RegExp('<meta (?:property|name)="' + key + '" content="([^"]*)"').exec(html); assert.ok(m, key + ' is set'); return m[1]; };
  assert.equal(meta('og:url'), SITE_URL);
  assert.equal(meta('og:image'), SITE_URL + 'assets/og.png');
  assert.equal(meta('twitter:image'), SITE_URL + 'assets/og.png');
  assert.equal(meta('og:image:width') + 'x' + meta('og:image:height'), '1200x630');
  assert.equal(meta('og:image:type'), 'image/png');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('og:type'), 'website');
  for (const key of ['og:title', 'og:description', 'og:site_name', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt', 'description']) assert.ok(meta(key).length > 10, key);
  assert.ok(meta('og:description').length <= 200 && meta('description').length <= 160);
  assert.match(html, new RegExp('<link rel="canonical" href="' + SITE_URL + '">'));
  for (const m of html.matchAll(/content="(https?:[^"]+)"/g)) assert.ok(m[1].startsWith(SITE_URL), m[1] + ' is on the site');

  // add to home screen
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon\.png">/);
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.equal(man.name, 'One in a Swarm');
  assert.ok(man.short_name.length <= 12);
  assert.equal(man.display, 'standalone');
  assert.equal(man.start_url, './', 'relative: the domain root on oneinaswarm.io, and still right under a sub-path');
  assert.equal(man.scope, './');
  assert.match(man.theme_color, /^#003057$/i);
  assert.deepEqual(man.icons.map((i) => i.sizes + ' ' + i.purpose).sort(), ['192x192 any', '512x512 any', '512x512 maskable']);
  man.icons.forEach((i) => { assert.ok(!/^\/|^https?:/.test(i.src), 'icon paths are relative'); assert.deepEqual(pngSize(i.src).join('x'), i.sizes); });
  assert.deepEqual(pngSize('assets/icons/apple-touch-icon.png'), [180, 180]);
  // no service worker: nothing can ever serve a stale daily puzzle
  assert.doesNotMatch(read('js/app.js') + html, /serviceWorker/);
});
