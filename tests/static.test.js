'use strict';
/* Checks on the shipped files themselves: safety, weight, paths, metadata, housekeeping. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SITE = ['index.html', '404.html', 'css/style.css', 'js/core.js', 'js/sfx.js', 'js/app.js', 'data/prompts.json'];
const DISCLAIMER = 'Fan-made game. Not affiliated with or endorsed by the Georgia Institute of Technology.';

test('F2: no HTML-string sinks or dynamic code anywhere in the scripts', () => {
  for (const f of ['js/core.js', 'js/sfx.js', 'js/app.js', 'index.html', '404.html']) {
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
  [...css.matchAll(/url\(\s*["']?([^"')]+)/g)].forEach((m) => assert.ok(m[1].startsWith('data:'), 'css loads ' + m[1]));
  assert.ok(!/@import/.test(css));
  const fetches = [...read('js/app.js').matchAll(/fetch\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['data/prompts.json']);
  assert.ok(!/https?:\/\//.test(read('js/app.js') + read('js/core.js') + read('js/sfx.js')), 'scripts mention no URLs');
  assert.ok(!/\.(mp3|ogg|wav|m4a)\b/.test(read('js/sfx.js') + read('index.html')), 'sound is synthesised, not downloaded');
  assert.ok(!/google|analytics|gtag|sentry|facebook|pixel/i.test(read('index.html') + read('js/app.js')), 'no analytics or tracking');
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
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'assets')), ['og.png']);
});

test('F5: no debug logging, debugger statements or leftover TODOs in shipped files', () => {
  for (const f of SITE.filter((x) => x !== 'data/prompts.json')) {
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
  const users = read('js/app.js') + read('tools/build-prompts.js') + read('tools/validate.js');
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
