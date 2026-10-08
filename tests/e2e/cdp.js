'use strict';
/* A minimal Chrome DevTools Protocol client: launches headless Chrome and drives pages.
   No dependencies; uses the WebSocket built into Node 22+. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium binary.');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-e2e-'));
  const proc = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + buf.slice(-400))), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', (code) => reject(new Error('Chrome exited early with code ' + code)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('Could not connect to Chrome')));
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Map(); // sessionId -> [fn]
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(p.method + ': ' + msg.error.message));
      else p.resolve(msg.result);
    } else if (msg.sessionId && listeners.has(msg.sessionId)) {
      listeners.get(msg.sessionId).forEach((fn) => fn(msg.method, msg.params));
    }
  });

  function send(method, params, sessionId) {
    const id = nextId++;
    const payload = { id, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify(payload));
    });
  }

  async function newPage(opts) {
    const o = Object.assign({ width: 1280, height: 800, mobile: false }, opts);
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);

    const page = { problems: [], requests: [], bytes: 0, sessionId, send: s };
    listeners.set(sessionId, [(method, p) => {
      if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning' || p.type === 'assert')) {
        page.problems.push('console.' + p.type + ': ' + p.args.map((a) => a.value || a.description || '').join(' '));
      } else if (method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails;
        page.problems.push('exception: ' + ((d.exception && d.exception.description) || d.text));
      } else if (method === 'Log.entryAdded' && (p.entry.level === 'error' || p.entry.level === 'warning')) {
        page.problems.push('log.' + p.entry.level + ': ' + p.entry.text + (p.entry.url ? ' (' + p.entry.url + ')' : ''));
      } else if (method === 'Network.requestWillBeSent') {
        page.requests.push(p.request.url);
      } else if (method === 'Network.loadingFinished') {
        page.bytes += p.encodedDataLength;
      }
    }]);

    await s('Page.enable');
    await s('Runtime.enable');
    await s('Log.enable');
    await s('Network.enable');
    await s('Emulation.setFocusEmulationEnabled', { enabled: true });
    await s('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: o.mobile ? 2 : 1, mobile: o.mobile });
    if (o.mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true });
    if (o.timezone) await s('Emulation.setTimezoneOverride', { timezoneId: o.timezone });
    const features = [];
    if (o.colorScheme) features.push({ name: 'prefers-color-scheme', value: o.colorScheme });
    if (o.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
    if (features.length) await s('Emulation.setEmulatedMedia', { features });
    await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], browserContextId }).catch(() => {});
    if (o.initScript) await s('Page.addScriptToEvaluateOnNewDocument', { source: o.initScript });

    page.eval = async (expression) => {
      const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) + '\n  in: ' + expression.slice(0, 200));
      return r.result.value;
    };
    page.waitFor = async (expression, timeoutMs, label) => {
      const end = Date.now() + (timeoutMs || 8000);
      for (;;) {
        if (await page.eval('!!(' + expression + ')')) return;
        if (Date.now() > end) throw new Error('timed out waiting for ' + (label || expression));
        await sleep(40);
      }
    };
    page.goto = async (url) => {
      await s('Page.navigate', { url });
      await page.waitFor('document.readyState === "complete"', 30000, 'page load');
    };
    page.reload = async () => {
      await s('Page.reload', { ignoreCache: true });
      await sleep(60);
      await page.waitFor('document.readyState === "complete"', 30000, 'page reload');
    };
    page.key = async (key, code, vk, text) => {
      const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      await s('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, base, text ? { text } : {}));
      await s('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
    };
    page.enter = () => page.key('Enter', 'Enter', 13, '\r');
    page.tab = () => page.key('Tab', 'Tab', 9);
    page.type = (text) => s('Input.insertText', { text });
    page.resize = (width, height, mobile) => s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
    page.screenshot = async (file) => {
      const r = await s('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    };
    page.close = async () => {
      listeners.delete(sessionId);
      await send('Target.closeTarget', { targetId }).catch(() => {});
      await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    };
    return page;
  }

  async function close() {
    try {
      ws.close();
    } catch (e) { /* already closed */ }
    proc.kill();
    await sleep(150);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }

  return { newPage, close, send };
}

module.exports = { launch, sleep };
