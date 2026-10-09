/* One in a Swarm — the presentation layer. Game rules live in core.js, the world in scene.js.
   This file moves the camera, runs the round pacing, and keeps the DOM in step. */
(function () {
  'use strict';

  const C = window.SwarmCore;
  const Sfx = window.SwarmSfx;
  const Scene = window.SwarmScene;
  const FACTS = window.SwarmFacts;
  const $ = (id) => document.getElementById(id);

  // Storage keys are stable; the payloads carry their own version (C.SAVE_VERSION).
  const K_DAILY = 'swarm.daily';
  const K_BEST = 'swarm.infinite.best';
  const K_SEEN = 'swarm.seenHowTo';
  const K_SOUND = 'swarm.sound';
  const K_SCAN = 'swarm.scanlines';
  const K_STATS = 'swarm.stats';
  const TICK_MS = 100;
  const NEXT_GUARD_MS = 600; // stops a double-tapped Enter from skipping the reveal card
  const LIFTOFF_MS = 2000;
  const WRONG_LOCK_MS = 400;
  const GLIDE_MS = 900; // the short climb used in infinite mode
  const HOVER = 2.5; // on the title screen the bee idles this many points above the lawn
  const BEE_DOWN = 0.6; // how far down the screen the bee rides
  const LINE_NAMES = { common: 'COMMON', clever: 'CLEVER', solid: 'SOLID', rare: 'RARE', deep: 'DEEP CUT', swarm: 'SWARM' };

  // Small 8x8 marks, one per tier, so a tier is never told apart by colour alone.
  const MARKS = {
    common: ['........', '..####..', '.######.', '.######.', '.######.', '.######.', '..####..', '........'],
    clever: ['........', '........', '.##..##.', '#..##..#', '#..##..#', '.##..##.', '........', '........'],
    solid: ['........', '...##...', '...##...', '........', '.##..##.', '.##..##.', '........', '........'],
    rare: ['...##...', '...##...', '..####..', '########', '########', '..####..', '...##...', '...##...'],
    deep: ['........', '.######.', '########', '.######.', '..####..', '...##...', '........', '........'],
    swarm: ['.#....#.', '..#..#..', '.######.', '##.##.##', '########', '.######.', '..####..', '........'],
    miss: ['........', '..####..', '.#....#.', '.#....#.', '.#....#.', '.#....#.', '..####..', '........'],
  };

  // localStorage can throw (private mode, blocked site data, quota). The game must run without it.
  const store = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        try {
          return JSON.parse(raw);
        } catch (e) {
          window.localStorage.removeItem(key); // unreadable: clear it so it cannot linger
          return fallback;
        }
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* play on without persistence */
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        /* nothing to clean up */
      }
    },
  };

  let prompts = [];
  let byId = {};
  const knownIds = new Set();
  let daily = null;
  let stale = false; // true while `daily` is yesterday's unfinished run
  let inf = null;
  let bestAtStart = null;
  let mode = null; // 'daily' | 'infinite' while a clock is live
  let view = 'loading';
  let loop = null;
  let monoAt = 0;
  let lastTick = 0;
  let lastSavedSecond = -1;
  let lastAnnounced = 0;
  let lastTickSecond = 0;
  let revealShownAt = 0;
  let introTimer = 0;
  let lockUntil = 0;

  let scene = null;
  let cam = 0; // the score the camera sits on
  let anim = null; // { from, to, start, ms, done, lines }
  let anchor = 0.78;
  let anchorTarget = 0.78;
  let shownAlt = '';
  let tierColors = {};
  let winTop = 0;
  let countFrom = null; // while a daily climb runs, the score the HUD counts up from
  let frames = 0;

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function setPhase(name) {
    document.body.dataset.phase = name;
    aimCamera();
  }

  function show(name, focusTarget) {
    view = name;
    document.querySelectorAll('[data-view]').forEach((s) => {
      s.hidden = s.getAttribute('data-view') !== name;
    });
    document.body.classList.toggle('playing', name === 'play' || name === 'between');
    $('hud').hidden = !(name === 'play' || name === 'between');
    if (name !== 'play' && name !== 'between') window.scrollTo(0, 0);
    aimCamera();
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function today() {
    return C.utcDateKey(new Date());
  }

  function prettyDate(key) {
    return new Date(key + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function feet(score) {
    return C.altitudeText(score);
  }

  function tierLabel(tier) {
    return tier ? C.TIERS[tier].label : 'Missed';
  }

  function pipIcon(tier) {
    const key = tier || 'miss';
    const c = el('canvas', 'pip-icon');
    c.width = 8;
    c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = tierColors[key];
    g.fillRect(0, 0, 8, 8);
    Scene.stamp(g, MARKS[key], 0, 0, { '#': key === 'miss' ? '#ffffff' : '#00213d' });
    return c;
  }

  function badge(tier) {
    const b = el('span', 'badge tier-' + (tier || 'miss'));
    b.appendChild(pipIcon(tier));
    b.appendChild(el('span', '', tierLabel(tier)));
    return b;
  }

  // The larger artwork on the reveal card: one bee, a studious bee, a small swarm, and so on.
  function drawTierArt(canvas, tier) {
    const g = canvas.getContext('2d');
    const bee = { b: '#d9b84a', k: '#00213d', w: '#f4f9ff', e: '#ffffff' };
    const gold = { b: '#ffd23f', k: '#3a2f00', w: '#fff7d1', e: '#ffffff' };
    const box = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    };
    g.clearRect(0, 0, 24, 20);
    if (!tier) {
      Scene.stamp(g, MARKS.miss.map((r) => r.replace(/#/g, 'm')), 8, 6, { m: '#8c96a3' });
      return;
    }
    if (tier === 'swarm') {
      box(0, 0, 24, 20, 'rgba(255, 210, 63, 0.28)');
      [[9, 6], [7, 10], [6, 12], [6, 12], [7, 10], [9, 6]].forEach((row, i) => {
        box(row[0], 3 + i * 2, row[1], 2, '#ffd23f');
        box(row[0], 4 + i * 2, row[1], 1, '#c98f00');
      });
      box(11, 12, 2, 3, '#3a2f00');
      Scene.stamp(g, Scene.MINI, 0, 2, gold);
      Scene.stamp(g, Scene.MINI, 19, 5, gold);
      Scene.stamp(g, Scene.MINI, 2, 14, gold);
      return;
    }
    if (tier === 'solid') {
      [[1, 3], [10, 1], [17, 7], [6, 11], [14, 14]].forEach((p) => Scene.stamp(g, Scene.MINI, p[0], p[1], bee));
      return;
    }
    Scene.stamp(g, Scene.BEE, 4, 6, bee);
    if (tier === 'clever') { // spectacles
      box(11, 9, 4, 1, '#ffffff'); box(11, 12, 4, 1, '#ffffff'); box(11, 9, 1, 4, '#ffffff'); box(14, 9, 1, 4, '#ffffff');
      box(16, 9, 4, 1, '#ffffff'); box(16, 12, 4, 1, '#ffffff'); box(16, 9, 1, 4, '#ffffff'); box(19, 9, 1, 4, '#ffffff');
      box(15, 10, 1, 1, '#ffffff');
    } else if (tier === 'rare') { // a star overhead
      box(19, 0, 1, 5, '#ffd23f'); box(17, 2, 5, 1, '#ffd23f'); box(18, 1, 3, 3, '#fff7d1');
    } else if (tier === 'deep') { // carrying a gem
      box(17, 14, 5, 1, '#d68ac0'); box(16, 15, 7, 1, '#e9b3da'); box(17, 16, 5, 1, '#d68ac0'); box(18, 17, 3, 1, '#b2639b'); box(19, 18, 1, 1, '#b2639b');
    }
  }

  function setFeedback(text, kind) {
    const f = $('feedback');
    f.className = 'feedback' + (kind ? ' ' + kind : '');
    f.textContent = text;
  }

  function announce(text) {
    $('announce').textContent = text;
  }

  function shake() {
    const e = $('entry');
    e.classList.remove('shake');
    void e.offsetWidth; // restart the animation
    e.classList.add('shake');
  }

  function saveDaily() {
    if (daily) store.set(K_DAILY, daily);
  }

  function getBest() {
    return C.reviveBest(store.get(K_BEST, null));
  }

  function startLoop() {
    stopLoop();
    lastTick = performance.now();
    loop = window.setInterval(tick, TICK_MS);
  }

  function stopLoop() {
    if (loop) window.clearInterval(loop);
    loop = null;
  }

  // Charges elapsed time to the live daily round. Wall-clock time covers reloads and device
  // sleep; the monotonic delta covers a device clock that was changed mid-round.
  function tickDaily() {
    const now = performance.now();
    const mono = now - monoAt;
    monoAt = now;
    return C.dailyTick(daily, Date.now(), mono);
  }

  function renderClock(ms, fullMs, paused) {
    const secs = Math.ceil(ms / 1000);
    const frac = Math.max(0, Math.min(1, ms / fullMs));
    const low = ms <= 5000;
    $('clockNum').textContent = String(secs);
    $('ring').classList.toggle('low', low);
    $('ring').classList.toggle('paused', !!paused);
    $('ringFill').style.strokeDashoffset = (125.66 * (1 - frac)).toFixed(2);
    $('barFill').parentNode.classList.toggle('low', low);
    $('barFill').style.transform = 'scaleX(' + frac.toFixed(4) + ')';
    if (mode === 'daily' && secs <= 5 && secs > 0 && secs !== lastTickSecond) {
      lastTickSecond = secs;
      Sfx.tick();
    }
    // Screen readers get the clock at 10 and 5 seconds, not every tick.
    if ((secs === 10 || secs === 5) && lastAnnounced !== secs) {
      lastAnnounced = secs;
      $('clockLive').textContent = secs + ' seconds left';
    }
  }

  /* ---------- the world: camera, facts, tier lines, the answer tag ---------- */

  // Where the bee sits on screen (0 = top, 1 = bottom) depends on what is covering the view.
  function aimCamera() {
    if (!scene) return;
    const h = window.innerHeight;
    const root = document.documentElement.style;
    if (!$('hud').hidden) root.setProperty('--hud-h', $('hud').offsetHeight + 'px');
    // The clear band of screen that facts and tier lines may be drawn in.
    const phase = document.body.dataset.phase;
    let top = $('hud').hidden ? 0 : $('hud').getBoundingClientRect().bottom + 4;
    let bottom = h;
    if (view === 'play' && phase !== 'climb') {
      top = $('promptCard').getBoundingClientRect().bottom + 4;
      bottom = $('dock').getBoundingClientRect().top - 4;
    } else if (view === 'between') {
      bottom = $('reveal').getBoundingClientRect().top - 4;
    }
    winTop = Math.max(0, Math.round(top));
    root.setProperty('--win-top', winTop + 'px');
    root.setProperty('--win-bottom', Math.max(0, Math.round(h - bottom)) + 'px');
    if (view === 'play') {
      // The bee rides about 60% of the way down the visible screen, so the sky ahead is in view.
      // With a keyboard up it is kept inside the gap between the prompt and the answer bar.
      const visible = h - (parseFloat(root.getPropertyValue('--kb')) || 0);
      const want = BEE_DOWN * visible;
      const floor = phase === 'climb' ? visible - 40 : $('dock').getBoundingClientRect().top - 34;
      const ceiling = phase === 'climb' ? 60 : $('promptCard').getBoundingClientRect().bottom + 34;
      anchorTarget = Math.max(ceiling, Math.min(floor, want)) / h;
    } else if (view === 'between') {
      anchorTarget = Math.max(0.16, ($('reveal').getBoundingClientRect().top / h) * 0.6);
    } else if (view === 'home') {
      anchorTarget = BEE_DOWN; // with the bee hovering HOVER points up, the lawn fills about the bottom quarter
    } else {
      anchorTarget = 0.4;
    }
    if (reducedMotion()) anchor = anchorTarget;
  }

  function layoutWorld() {
    const per = scene.cssPerPoint();
    document.documentElement.style.setProperty('--ruler', scene.rulerWidth() + 'px');
    document.querySelectorAll('#worldLayer [data-score]').forEach((node) => {
      node.style.top = -Number(node.dataset.score) * per + 'px';
    });
  }

  function buildFacts() {
    const layer = $('worldLayer');
    FACTS.forEach((f) => {
      const node = el('p', 'fact', f.text);
      node.dataset.score = String(C.scoreForFeet(f.feet));
      layer.appendChild(node);
    });
    layoutWorld();
  }

  function clearClimb() {
    document.querySelectorAll('#worldLayer .tier-line').forEach((n) => n.remove());
    $('tag').hidden = true;
    scene.setDim(0);
    scene.setMood('idle');
  }

  // The tier lines above where this round began. Each appears as the answer passes it.
  function buildTierLines(base, points) {
    const lines = [];
    C.TIER_ORDER.forEach((t) => {
      const tier = C.TIERS[t];
      if (tier.points > points) return;
      const node = el('div', 'tier-line');
      node.style.setProperty('--line', tierColors[t]);
      node.dataset.score = String(base + tier.points);
      node.appendChild(el('span', '', LINE_NAMES[t] + ' · ' + tier.points));
      $('worldLayer').appendChild(node);
      lines.push({ node, score: base + tier.points });
    });
    layoutWorld();
    return lines;
  }

  function moveCamera(to, ms, done, lines) {
    if (reducedMotion() || ms <= 0 || to === cam) {
      anim = null;
      cam = to;
      if (lines) lines.forEach((l) => l.node.classList.add('on'));
      if (done) done();
      return;
    }
    anim = { from: cam, to, start: performance.now(), ms, done, lines };
  }

  function frame(now) {
    if (anim) {
      const t = (now - anim.start) / anim.ms;
      if (t >= 1) {
        const finished = anim;
        cam = finished.to;
        anim = null;
        if (finished.lines) finished.lines.forEach((l) => l.node.classList.add('on'));
        if (finished.done) finished.done();
      } else {
        cam = anim.from + (anim.to - anim.from) * (1 - Math.pow(1 - t, 3)); // fast start, slow settle
        if (anim.lines) anim.lines.forEach((l) => l.node.classList.toggle('on', cam >= l.score - 0.2));
      }
    }
    anchor += (anchorTarget - anchor) * 0.14;
    scene.setAnchor(anchor);
    scene.setCamera(cam);
    scene.draw(now);
    $('worldLayer').style.transform = 'translateY(' + (scene.cssY(0) - winTop) + 'px)';
    const tag = $('tag');
    if (!tag.hidden) tag.style.top = scene.cssY(cam) - tag.offsetHeight - 26 + 'px';
    if (countFrom !== null) $('hudScore').textContent = C.formatNumber(Math.round(cam)); // counts up with the climb
    if (++frames % 4 === 0) dodgeTag();
    const alt = C.altitudeParts(cam);
    if (alt.value !== shownAlt) {
      shownAlt = alt.value;
      $('hudAlt').textContent = alt.value;
      $('hudUnit').textContent = ' ' + alt.unit.toUpperCase();
    }
    window.requestAnimationFrame(frame);
  }

  // A fact that would sit under the answer tag steps aside while the tag is there.
  function dodgeTag() {
    const tag = $('tag');
    const box = tag.hidden ? null : tag.getBoundingClientRect();
    document.querySelectorAll('#worldLayer .fact').forEach((node) => {
      let hit = false;
      if (box) {
        const r = node.getBoundingClientRect();
        hit = r.bottom > box.top - 6 && r.top < box.bottom + 6 && r.right > box.left - 6 && r.left < box.right + 6;
      }
      node.classList.toggle('yield', hit);
    });
  }

  /* ---------- title screen ---------- */

  function resolveDaily() {
    const r = C.resolveDaily(daily, today());
    daily = r.run;
    stale = r.stale;
  }

  function loadDaily() {
    const raw = store.get(K_DAILY, undefined);
    daily = C.reviveDaily(raw, knownIds);
    if (raw !== undefined && !daily) store.remove(K_DAILY); // corrupted or from an older version: start clean
    resolveDaily();
    monoAt = performance.now();
    // A round that ran out while the tab was closed counts as a miss.
    if (daily && tickDaily()) saveDaily();
  }

  function renderHome() {
    resolveDaily();
    const flight = C.flightNumber(today());
    $('flightNo').textContent = 'FLIGHT #' + (stale ? flight - 1 : flight);
    $('todayLabel').textContent = prettyDate(today());
    const btn = $('dailyBtn');
    const status = $('dailyStatus');
    $('skipStaleBtn').hidden = !stale;
    if (!daily || (!stale && !daily.round && !daily.results.length)) {
      btn.textContent = 'BEGIN ASCENT ▲';
      status.textContent = 'The same seven for every Yellow Jacket, once a day.';
    } else if (daily.finished) {
      const score = C.totalScore(daily.results);
      btn.textContent = "SEE TODAY'S FLIGHT";
      status.textContent = 'Flown: ' + C.formatNumber(score) + ' pts, ' + feet(score) + '. A new seven tomorrow.';
    } else {
      const which = stale ? "yesterday's flight" : "today's flight";
      if (daily.round) {
        btn.textContent = 'BACK TO ROUND ' + (daily.round.index + 1) + ' ▲';
        status.textContent = 'A round is in progress in ' + which + ', and its clock is running.';
      } else {
        btn.textContent = (stale ? "FINISH YESTERDAY'S: ROUND " : 'RESUME AT ROUND ') + (daily.results.length + 1) + ' ▲';
        status.textContent = C.formatNumber(C.totalScore(daily.results)) + ' pts so far' + (stale ? ". Today's seven unlock when you land." : '.');
      }
    }
    const best = getBest();
    $('bestLabel').textContent = best && best.score
      ? 'Best run: ' + C.formatNumber(best.score) + ' pts across ' + best.answered + (best.answered === 1 ? ' prompt.' : ' prompts.')
      : 'No best run yet.';
  }

  function goHome() {
    if (mode === 'infinite' && inf && !inf.over) return endInfinite();
    window.clearTimeout(introTimer);
    stopLoop();
    mode = null;
    clearClimb();
    renderHome();
    setPhase('home');
    show('home', $('homeTitle'));
    const done = daily && !stale ? daily.results : [];
    scene.setFollowers(done.filter((r) => r.points).length);
    moveCamera(C.totalScore(done) || HOVER, 0);
    aimCamera();
    anchor = anchorTarget;
  }

  /* ---------- daily: pacing ---------- */

  function dailyEnter() {
    if (!daily) {
      daily = C.newDaily(today(), C.dailyPromptIds(prompts, today()));
      saveDaily();
    }
    if (daily.finished) return showResults();
    if (daily.round) return enterRound(false);
    if (daily.results.length) return showReveal(false);
    startIntro();
  }

  function startToday() {
    daily = null;
    stale = false;
    dailyEnter();
  }

  function renderPips() {
    const pips = $('pips');
    pips.textContent = '';
    const current = daily.round ? daily.round.index : daily.results.length;
    for (let i = 0; i < C.ROUNDS; i++) {
      const li = el('li');
      const r = daily.results[i];
      if (r) {
        li.className = 'done';
        li.dataset.tier = r.tier || 'miss'; // the mark inside carries the tier, not just the colour
        li.appendChild(pipIcon(r.tier));
      } else if (i === current) {
        li.className = 'now';
      }
      pips.appendChild(li);
    }
  }

  function renderTried(items) {
    const list = $('tried');
    list.textContent = '';
    items.forEach((t) => list.appendChild(el('li', '', t)));
  }

  function renderDailyHud(index) {
    const score = C.totalScore(daily.results);
    $('pips').hidden = false;
    $('infActions').hidden = true;
    $('hudText').textContent = 'Round ' + (index + 1) + ' of ' + C.ROUNDS;
    $('hudScore').textContent = C.formatNumber(score);
    const p = byId[daily.promptIds[index]];
    $('cat').textContent = p.category;
    $('promptText').textContent = p.text;
    renderPips();
    scene.setFollowers(daily.results.filter((r) => r.points).length);
    moveCamera(score, 0);
  }

  // Prompt slides in, two seconds of "lifting off", then the clock starts.
  function startIntro() {
    const index = daily.results.length;
    mode = null;
    clearClimb();
    renderDailyHud(index);
    renderTried([]);
    setFeedback('', '');
    $('guess').value = '';
    $('clockLive').textContent = '';
    renderClock(C.ROUND_MS, C.ROUND_MS, true);
    setPhase('intro');
    show('play', $('guess'));
    const card = $('promptCard');
    card.classList.remove('slide');
    void card.offsetWidth;
    card.classList.add('slide');
    const lift = $('liftoff');
    lift.hidden = false;
    let left = LIFTOFF_MS / 1000;
    const step = () => {
      if (left <= 0) {
        lift.hidden = true;
        C.startRound(daily, Date.now());
        monoAt = performance.now();
        saveDaily();
        Sfx.start();
        enterRound(true);
        return;
      }
      lift.textContent = 'lifting off · the clock starts in ' + left;
      left -= 1;
      introTimer = window.setTimeout(step, 1000);
    };
    step();
    aimCamera();
  }

  function enterRound(fromIntro) {
    mode = 'daily';
    lastAnnounced = 0;
    lastSavedSecond = -1;
    lastTickSecond = 0;
    if (!fromIntro) {
      clearClimb();
      renderDailyHud(daily.round.index);
      $('guess').value = '';
        $('clockLive').textContent = '';
      setFeedback('', '');
      $('liftoff').hidden = true;
    }
    renderPips();
    renderTried(daily.round.tried.map((t) => t.text));
    renderClock(C.remainingMs(daily, Date.now()), C.ROUND_MS, false);
    setPhase('guess');
    show('play', $('guess'));
    startLoop();
  }

  function lockInput() {
    const g = $('guess');
    // Typing is never blocked. Only submitting again is, briefly, so a double tap cannot cost
    // two penalties. The wrong text stays selected, so the next keystroke replaces it.
    lockUntil = performance.now() + WRONG_LOCK_MS;
    g.dataset.locked = '1';
    g.focus();
    g.select();
    window.setTimeout(() => {
      delete g.dataset.locked;
    }, WRONG_LOCK_MS);
  }

  function onWrong(text) {
    setFeedback('no buzz. try again. −3s', 'bad');
    shake();
    lockInput();
    Sfx.wrong();
    return text;
  }

  function onNear(typed, suggestion) {
    setFeedback("'" + typed.trim().slice(0, 30) + "' → '" + suggestion + "'. submit again to confirm", 'good');
    $('guess').select();
  }

  function dailySubmit(text) {
    const p = byId[daily.promptIds[daily.round.index]];
    const base = C.totalScore(daily.results);
    const mono = performance.now() - monoAt;
    monoAt = performance.now();
    const r = C.dailyGuess(daily, p, text, Date.now(), mono);
    if (r.status === 'empty') return;
    if (r.status === 'duplicate') {
      setFeedback('already tried that. no time lost.', 'bad');
      $('guess').select();
      return;
    }
    if (r.status === 'near') {
      saveDaily();
      return onNear(text, r.suggestion);
    }
    if (r.status === 'wrong') {
      saveDaily();
      renderTried(daily.round.tried.map((t) => t.text));
      onWrong(text);
      return;
    }
    stopLoop();
    mode = null;
    saveDaily();
    if (r.status === 'correct') climb(r.result, base);
    else missed();
  }

  /* ---------- daily: the climb and the reveal ---------- */

  function climb(result, base) {
    const tier = C.TIERS[result.tier];
    $('guess').blur();
    setPhase('climb');
    countFrom = base;
    const tag = $('tag');
    tag.textContent = result.answer;
    tag.hidden = false;
    scene.setMood('happy');
    const lines = buildTierLines(base, result.points);
    const ms = reducedMotion() ? 0 : tier.climbMs;
    if (ms) Sfx.rise(ms / 1000);
    moveCamera(base + result.points, ms, () => {
      countFrom = null;
      $('hudScore').textContent = C.formatNumber(base + result.points);
      scene.setFollowers(daily.results.filter((x) => x.points).length);
      if (result.tier === 'swarm') {
        scene.setMood('gold');
        if (!reducedMotion()) {
          scene.burst(performance.now());
          const flash = $('flash');
          flash.classList.remove('go');
          void flash.offsetWidth;
          flash.classList.add('go');
        }
      } else {
        scene.setMood('idle');
      }
      Sfx.correct(C.TIER_ORDER.indexOf(result.tier));
      // The top answer gets a beat to itself before the card comes up.
      if (result.tier === 'swarm' && !reducedMotion()) window.setTimeout(() => showReveal(true), 750);
      else showReveal(true);
    }, lines);
  }

  function missed() {
    $('guess').blur();
    clearClimb();
    scene.setMood('sad');
    scene.setDim(0.45);
    if (!reducedMotion()) {
      document.body.classList.remove('shake');
      void document.body.offsetWidth;
      document.body.classList.add('shake');
    }
    Sfx.timeout();
    showReveal(true);
  }

  // The card for the round just finished. `fresh` is false after a reload, when nothing replays.
  function showReveal(fresh) {
    stopLoop();
    mode = null;
    const done = daily.results.length;
    const last = daily.results[done - 1];
    const score = C.totalScore(daily.results);
    const p = byId[last.promptId];
    const card = $('reveal');
    card.className = 'panel reveal' + (last.tier === 'swarm' ? ' is-swarm' : '') + (last.tier ? '' : ' is-miss');
    card.style.setProperty('--tier', last.tier ? tierColors[last.tier] : '#c3ccd6');
    drawTierArt($('lastIcon'), last.tier);
    $('lastRoundLabel').textContent = 'Round ' + done + ' of ' + C.ROUNDS;
    $('lastBadge').textContent = last.tier ? C.TIERS[last.tier].label.toUpperCase() : 'NOTHING LANDED';
    $('lastAnswer').textContent = last.tier ? last.answer : 'the clock beat you.';
    $('lastPoints').textContent = last.tier ? '+' + last.points + ' PTS · now at ' + feet(score) : '+0 PTS · holding at ' + feet(score);
    const bits = [];
    if (last.tier) bits.push(C.TIERS[last.tier].quip);
    if (last.note) bits.push(last.note);
    if (last.wrong) bits.push(last.wrong + (last.wrong === 1 ? ' wrong guess first.' : ' wrong guesses first.'));
    $('lastNote').textContent = bits.join(' ');
    $('lastPrompt').textContent = p.text;
    const btn = $('nextBtn');
    if (daily.finished) {
      btn.textContent = 'LAND ▼';
      $('nextLabel').textContent = 'Flight complete.';
    } else {
      btn.textContent = 'CLIMB ▲';
      $('nextLabel').textContent = 'Next: round ' + (done + 1) + ' of ' + C.ROUNDS + ' · ' + byId[daily.promptIds[done]].category;
    }
    $('runningScore').textContent = C.formatNumber(score) + ' pts · ' + feet(score) + ' so far';
    announce(last.tier
      ? 'Round ' + done + ': ' + C.TIERS[last.tier].label + ', ' + last.answer + ', plus ' + last.points + ' points. Total ' + score + ' points, ' + feet(score) + '.'
      : "Round " + done + ": time's up. No points. Total " + score + ' points.');
    if (!fresh) {
      clearClimb();
      renderDailyHud(Math.min(done, C.ROUNDS - 1));
      if (last.tier === 'swarm') scene.setMood('gold');
    }
    renderPips();
    $('hudScore').textContent = C.formatNumber(score);
    revealShownAt = Date.now();
    setPhase('reveal');
    show('between', btn);
  }

  function onNext() {
    if (Date.now() - revealShownAt < NEXT_GUARD_MS) return;
    if (daily.finished) return showResults();
    startIntro();
  }

  /* ---------- results ---------- */

  function resultRow(index, promptText, answerText, tier, points) {
    const li = el('li');
    li.appendChild(el('span', 'q', index + '. ' + promptText));
    const a = el('span', 'a');
    a.appendChild(el('span', 'ans', answerText));
    const meta = el('span', 'meta');
    meta.appendChild(badge(tier));
    if (points !== null) meta.appendChild(el('span', '', '+' + points));
    a.appendChild(meta);
    li.appendChild(a);
    return li;
  }

  function showResults() {
    stopLoop();
    window.clearTimeout(introTimer);
    mode = null;
    clearClimb();
    const score = C.totalScore(daily.results);
    const band = C.bandFor(score);
    $('resFlight').textContent = String(C.flightNumber(daily.date));
    $('resDate').textContent = prettyDate(daily.date);
    $('resBand').textContent = band.name.toUpperCase();
    $('resBlurb').textContent = band.blurb;
    $('resScore').textContent = C.formatNumber(score) + ' pts';
    $('resAlt').textContent = feet(score);

    // Flight log: each round's mark at the height its tier earned, on a stem from the ground.
    const log = $('flightLog');
    log.textContent = '';
    daily.results.forEach((r, i) => {
      const li = el('li');
      li.setAttribute('aria-label', 'Round ' + (i + 1) + ': ' + tierLabel(r.tier) + ', ' + r.points + ' points');
      li.appendChild(pipIcon(r.tier));
      const stem = el('span', 'stem');
      stem.style.height = (r.points / C.TIERS.swarm.points) * 130 + 'px';
      li.appendChild(stem);
      li.appendChild(el('span', 'round', String(i + 1)));
      log.appendChild(li);
    });

    const ladder = $('ladder');
    ladder.textContent = '';
    C.BANDS.forEach((b) => ladder.appendChild(el('li', b === band ? 'on' : '', b.min + '+ pts · ' + b.name)));

    const list = $('breakdown');
    const spoilers = $('spoilerList');
    list.textContent = '';
    spoilers.textContent = '';
    daily.results.forEach((r, i) => {
      const p = byId[r.promptId];
      list.appendChild(resultRow(i + 1, p.text, r.answer || 'No answer', r.tier, r.points));
      spoilers.appendChild(resultRow(i + 1, p.text, p.answers.filter((a) => a.tier === 'swarm')[0].name, 'swarm', null));
    });

    const here = window.location;
    const url = /^https?:$/.test(here.protocol) ? here.origin + here.pathname.replace(/index\.html$/, '') : '';
    $('shareBox').value = C.shareText(daily.date, daily.results, url);
    $('copyStatus').textContent = '';

    // Lifetime record. Recording the same date twice changes nothing.
    const stats = C.recordFlight(C.reviveStats(store.get(K_STATS, null)), daily.date, score);
    store.set(K_STATS, stats);
    $('statStreak').textContent = String(C.currentStreak(stats, today()));
    $('statPlayed').textContent = String(stats.played);
    $('statAvg').textContent = String(Math.round(stats.total / stats.played));
    $('statBest').textContent = String(stats.best);

    // After finishing yesterday's run past midnight UTC, today's is already open.
    const todayOpen = daily.date !== today();
    $('resNext').hidden = todayOpen;
    $('resTodayBtn').hidden = !todayOpen;
    announce('Final score ' + score + ' points, ' + feet(score) + ' up. ' + band.name + '.');
    setPhase('results');
    show('results', $('resBand'));
    scene.setFollowers(daily.results.filter((r) => r.points).length);
    moveCamera(score, 0);
    const box = $('shareBox'); // grow the box to its text so no line is cut off on narrow screens
    box.style.height = 'auto';
    box.style.height = box.scrollHeight + 6 + 'px';
    Sfx.fanfare(C.BANDS.indexOf(band));
  }

  function copyShare() {
    const box = $('shareBox');
    const status = $('copyStatus');
    const done = () => {
      status.className = 'feedback good';
      status.textContent = 'Copied!';
    };
    const fallback = () => {
      box.focus();
      box.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      if (ok) done();
      else {
        status.className = 'feedback bad';
        status.textContent = 'Could not copy automatically. The text is selected, so copy it by hand.';
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, fallback);
    else fallback();
  }

  /* ---------- infinite ---------- */

  function infPrompt() {
    return byId[inf.order[inf.pos]];
  }

  function renderInfinite() {
    const p = infPrompt();
    $('hudText').textContent = 'Prompt ' + (inf.answered + 1);
    $('hudScore').textContent = C.formatNumber(inf.score);
    $('cat').textContent = p.category;
    $('promptText').textContent = p.text;
    renderTried([]);
  }

  function startInfinite() {
    window.clearTimeout(introTimer);
    inf = C.newInfinite(C.shuffle(prompts.map((p) => p.id), Math.random));
    bestAtStart = getBest();
    mode = 'infinite';
    lastAnnounced = 0;
    clearClimb();
    $('pips').hidden = true;
    $('infActions').hidden = false;
    $('liftoff').hidden = true;
    $('guess').value = '';
    $('clockLive').textContent = '';
    setFeedback('', '');
    renderInfinite();
    renderClock(inf.clockMs, C.INFINITE_START_MS, false);
    scene.setFollowers(0);
    moveCamera(0, 0);
    setPhase('guess');
    show('play', $('guess'));
    Sfx.start();
    startLoop();
  }

  function infInputState() {
    const g = $('guess');
    return { focused: document.activeElement === g && document.hasFocus(), hasText: g.value.length > 0 };
  }

  function infSubmit(text) {
    const r = C.infiniteGuess(inf, infPrompt() || {}, text);
    if (r.status === 'empty' || r.status === 'idle') return;
    if (r.status === 'duplicate') {
      setFeedback('already tried that. no time lost.', 'bad');
      $('guess').select();
      return;
    }
    if (r.status === 'near') return onNear(text, r.suggestion);
    if (r.status === 'wrong') {
      onWrong(text);
      if (inf.over) endInfinite();
      return;
    }
    $('guess').value = '';
    lastAnnounced = 0;
    setFeedback(r.answer.name + ': ' + C.TIERS[r.answer.tier].label + ', +' + r.points + ' pts, +' + r.bonusMs / 1000 + 's', 'good');
    Sfx.correct(C.TIER_ORDER.indexOf(r.answer.tier));
    scene.setFollowers(inf.answered);
    moveCamera(inf.score, GLIDE_MS);
    saveBest();
    if (inf.over) return endInfinite();
    renderInfinite();
  }

  function saveBest() {
    const best = getBest();
    if (!best || inf.score > best.score) store.set(K_BEST, { v: C.SAVE_VERSION, score: inf.score, answered: inf.answered });
  }

  function endInfinite() {
    stopLoop();
    inf.over = true;
    mode = null;
    const best = bestAtStart;
    saveBest();
    const isBest = inf.score > 0 && (!best || inf.score > best.score);
    $('infTitle').textContent = inf.cleared ? 'YOU EMPTIED THE HIVE' : isBest ? 'NEW BEST RUN' : 'OUT OF AIR';
    $('infScore').textContent = C.formatNumber(inf.score) + ' pts';
    $('infAlt').textContent = feet(inf.score);
    $('infCount').textContent = String(inf.answered);
    $('infBest').textContent = C.formatNumber(Math.max(best ? best.score : 0, inf.score)) + ' pts';
    announce('Run over. ' + inf.score + ' points across ' + inf.answered + ' prompts.');
    const list = $('infLog');
    list.textContent = '';
    inf.log.forEach((r, i) => list.appendChild(resultRow(i + 1, byId[r.promptId].text, r.answer, r.tier, r.points)));
    $('infLogCard').hidden = inf.log.length === 0;
    setPhase('infover');
    show('infover', $('infTitle'));
    moveCamera(inf.score, 0);
    if (inf.cleared) Sfx.fanfare(4);
    else Sfx.timeout();
  }

  /* ---------- clocks ---------- */

  function tick() {
    if (mode === 'daily') {
      if (tickDaily()) {
        stopLoop();
        mode = null;
        saveDaily();
        missed();
        return;
      }
      const left = daily.round.leftMs;
      const second = Math.ceil(left / 1000);
      if (second !== lastSavedSecond) {
        lastSavedSecond = second;
        saveDaily(); // once a second, so a reload or a killed tab resumes within a second of the truth
      }
      renderClock(left, C.ROUND_MS, false);
    } else if (mode === 'infinite') {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      const draining = C.infiniteTick(inf, dt, infInputState());
      renderClock(inf.clockMs, Math.max(C.INFINITE_START_MS, inf.clockMs), !draining);
      if (!draining && !inf.over && !$('feedback').textContent) setFeedback('clock paused. it runs while the answer box is active.', '');
      if (inf.over) endInfinite();
    }
  }

  function everySecond() {
    const s = Math.floor(C.msUntilNextUtcDay(Date.now()) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const text = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    document.querySelectorAll('.js-countdown').forEach((n) => {
      n.textContent = text;
    });
    if (view === 'home') {
      // Catch a round timing out, or the UTC day rolling over, while the player sits on the title screen.
      if (daily && tickDaily()) saveDaily();
      renderHome();
    }
  }

  /* ---------- settings ---------- */

  function applySound(on) {
    Sfx.setEnabled(on);
    const btn = $('soundBtn');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Sound is on. Turn sound off' : 'Sound is off. Turn sound on');
  }

  function applyScan(on) {
    document.body.classList.toggle('no-scan', !on);
    const btn = $('scanBtn');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Scanlines are on. Turn scanlines off' : 'Scanlines are off. Turn scanlines on');
  }

  // Keeps the answer bar above the on-screen keyboard where the browser does not resize the page.
  function trackKeyboard() {
    const vv = window.visualViewport;
    const update = () => {
      const hidden = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      document.documentElement.style.setProperty('--kb', Math.round(hidden) + 'px');
      document.body.classList.toggle('tight', (vv ? vv.height : window.innerHeight) < 440);
      aimCamera();
    };
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }
    window.addEventListener('resize', () => {
      scene.resize();
      layoutWorld();
      update();
    });
    update();
  }

  /* ---------- wiring ---------- */

  function wire() {
    $('homeBtn').addEventListener('click', goHome);
    $('dailyBtn').addEventListener('click', dailyEnter);
    $('nextBtn').addEventListener('click', onNext);
    $('infBtn').addEventListener('click', startInfinite);
    $('resInfBtn').addEventListener('click', startInfinite);
    $('infAgainBtn').addEventListener('click', startInfinite);
    $('resHomeBtn').addEventListener('click', goHome);
    $('infHomeBtn').addEventListener('click', goHome);
    $('copyBtn').addEventListener('click', copyShare);
    $('endBtn').addEventListener('click', endInfinite);
    $('retryBtn').addEventListener('click', () => window.location.reload());
    $('skipStaleBtn').addEventListener('click', startToday);
    $('resTodayBtn').addEventListener('click', startToday);
    $('soundBtn').addEventListener('click', () => {
      const on = !Sfx.isEnabled();
      applySound(on);
      store.set(K_SOUND, { v: C.SAVE_VERSION, on });
      if (on) Sfx.start();
    });
    $('scanBtn').addEventListener('click', () => {
      const on = document.body.classList.contains('no-scan');
      applyScan(on);
      store.set(K_SCAN, { v: C.SAVE_VERSION, on });
    });
    $('skipBtn').addEventListener('click', () => {
      C.infiniteSkip(inf);
      $('guess').value = '';
      setFeedback('skipped. −5s', 'bad');
      Sfx.skip();
      if (inf.over) return endInfinite();
      renderInfinite();
      $('guess').focus();
    });
    $('guessForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = $('guess').value;
      if (document.body.dataset.phase === 'intro') {
        setFeedback('hold on. still lifting off.', '');
      } else if (performance.now() < lockUntil) {
        return;
      } else if (mode === 'daily' && daily && daily.round) {
        dailySubmit(text);
      } else if (mode === 'infinite' && inf) {
        infSubmit(text);
      }
      if (view === 'play' && document.body.dataset.phase !== 'climb') $('guess').focus();
    });
    // Bank the clock before the page is hidden or unloaded.
    const bank = () => {
      if (daily && daily.round) {
        const ended = tickDaily();
        saveDaily();
        if (ended && mode === 'daily') {
          stopLoop();
          mode = null;
          missed();
        }
      }
    };
    document.addEventListener('visibilitychange', bank);
    window.addEventListener('pagehide', bank);
  }

  function boot() {
    const css = window.getComputedStyle(document.documentElement);
    C.TIER_ORDER.concat('miss').forEach((t) => {
      tierColors[t] = css.getPropertyValue('--t-' + t).trim();
    });
    scene = Scene.create($('world'), { altitudeFeet: C.altitudeFeet, reducedMotion });
    wire();
    const sound = store.get(K_SOUND, null);
    applySound(!!(sound && sound.on === true)); // off until the player turns it on
    const scan = store.get(K_SCAN, null);
    applyScan(!(scan && scan.on === false));
    buildFacts();
    trackKeyboard();
    window.requestAnimationFrame(frame);
    window.__swarm = { scene, camera: () => cam }; // read-only handle for the browser tests

    fetch('data/prompts.json')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((data) => {
        const problems = C.validatePrompts(data);
        if (problems.length) throw new Error('Prompt bank failed validation: ' + problems[0]);
        prompts = data.prompts;
        prompts.forEach((p) => {
          byId[p.id] = p;
          knownIds.add(p.id);
        });
        loadDaily();
        everySecond();
        window.setInterval(everySecond, 1000);
        // A refresh mid-run lands back where the player was.
        if (daily && daily.round) enterRound(false);
        else if (daily && !daily.finished && daily.results.length) showReveal(false);
        else if (daily && daily.finished) showResults();
        else {
          goHome();
          if (!store.get(K_SEEN, null)) {
            store.set(K_SEEN, { v: C.SAVE_VERSION });
            $('howDlg').open = true; // rules open on a first visit only
          }
        }
      })
      .catch((err) => {
        $('errorText').textContent = window.location.protocol === 'file:'
          ? 'This page was opened straight from a file, and browsers block the game data that way. Serve the folder over HTTP instead (for example: npx serve .).'
          : 'The game data did not load. Check your connection and try again.';
        $('errorDetail').textContent = 'Details: ' + (err && err.message ? err.message : 'unknown error');
        setPhase('error');
        show('error', $('retryBtn'));
      });
  }

  boot();
})();
