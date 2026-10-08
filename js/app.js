/* One in a Swarm — the DOM layer. All game rules live in core.js. */
(function () {
  'use strict';

  const C = window.SwarmCore;
  const Sfx = window.SwarmSfx;
  const $ = (id) => document.getElementById(id);

  // Storage keys are stable; the payloads carry their own version (C.SAVE_VERSION).
  const K_DAILY = 'swarm.daily';
  const K_BEST = 'swarm.infinite.best';
  const K_SEEN = 'swarm.seenHowTo';
  const K_SOUND = 'swarm.sound';
  const PX_PER_FOOT = 0.78; // how far the sky scrolls per foot climbed (matches the marks in index.html)
  const SKY_TOP_FEET = 3050; // the painted sky ends here; the altitude readout keeps counting
  const CLIMB_MS = 1800;
  const TICK_MS = 100;
  const NEXT_GUARD_MS = 600; // stops a double-tapped Enter from starting the next round

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
  let knownIds = new Set();
  let daily = null;
  let stale = false; // true while `daily` is yesterday's unfinished run
  let monoAt = 0;
  let lastSavedSecond = -1;
  let inf = null;
  let bestAtStart = null;
  let mode = null; // 'daily' | 'infinite' while the play view is live
  let loop = null;
  let lastTick = 0;
  let lastAnnounced = 0;
  let betweenShownAt = 0;
  let view = 'loading';
  let sceneFeet = 0;
  let sceneAnim = 0;
  let lastTickSecond = 0;
  let justEnded = false; // a round ended in this page session (as opposed to a reload)

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function show(name, focusTarget) {
    view = name;
    document.querySelectorAll('[data-view]').forEach((s) => {
      s.hidden = s.getAttribute('data-view') !== name;
    });
    document.body.classList.toggle('playing', name === 'play');
    const slot = document.querySelector('[data-view="' + name + '"] .flight-slot');
    if (slot && $('flight').parentNode !== slot) slot.appendChild($('flight'));
    window.scrollTo(0, 0);
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function today() {
    return C.utcDateKey(new Date());
  }

  function prettyDate(key) {
    const d = new Date(key + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function badge(tier) {
    const b = el('span', 'badge tier-' + (tier || 'miss'), tier ? C.TIERS[tier].label : 'Missed');
    return b;
  }

  function setFeedback(text, kind) {
    const f = $('feedback');
    f.className = 'feedback' + (kind ? ' ' + kind : '');
    f.textContent = text;
  }

  function shake() {
    const e = $('entry');
    e.classList.remove('shake');
    void e.offsetWidth; // restart the animation
    e.classList.add('shake');
  }

  /* ---------- the flight scene ---------- */

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function paintScene(feet) {
    $('flightAlt').textContent = C.formatNumber(Math.round(feet));
    $('flightZone').textContent = C.bandFor(feet / C.FEET_PER_POINT).name;
  }

  // Puts the bee at `feet`. With `animate`, the sky scrolls and the readout counts up to it.
  function setScene(feet, animate) {
    const flight = $('flight');
    const world = $('flightWorld');
    const from = sceneFeet;
    const moving = animate && feet !== from && !reducedMotion();
    window.cancelAnimationFrame(sceneAnim);
    sceneFeet = feet;
    world.style.transition = moving ? '' : 'none';
    world.style.transform = 'translateY(' + Math.round(Math.min(feet, SKY_TOP_FEET) * PX_PER_FOOT) + 'px)';
    flight.classList.remove('stalled');
    flight.classList.toggle('climbing', moving);
    if (!moving) {
      paintScene(feet);
      return;
    }
    Sfx.rise(CLIMB_MS / 1000);
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / CLIMB_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      paintScene(from + (feet - from) * eased);
      if (t < 1) sceneAnim = window.requestAnimationFrame(step);
      else flight.classList.remove('climbing');
    };
    sceneAnim = window.requestAnimationFrame(step);
  }

  function stallScene() {
    const flight = $('flight');
    flight.classList.remove('stalled');
    void flight.offsetWidth; // restart the animation
    flight.classList.add('stalled');
  }

  function applySound(on) {
    Sfx.setEnabled(on);
    const btn = $('soundBtn');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Sound is on. Turn sound off' : 'Sound is off. Turn sound on');
  }

  function announce(text) {
    $('announce').textContent = text;
  }

  function saveDaily() {
    if (daily) store.set(K_DAILY, daily);
  }

  function getBest() {
    return C.reviveBest(store.get(K_BEST, null));
  }

  // Charges elapsed time to the live daily round. Wall-clock time covers reloads and device
  // sleep; the monotonic delta covers a device clock that was changed mid-round.
  function tickDaily() {
    const now = performance.now();
    const mono = now - monoAt;
    monoAt = now;
    return C.dailyTick(daily, Date.now(), mono);
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

  function renderClock(ms, fullMs, paused) {
    const secs = Math.ceil(ms / 1000);
    $('clockNum').textContent = String(secs);
    const low = ms <= 5000;
    $('clock').classList.toggle('low', low);
    const bar = $('barFill').parentNode;
    bar.classList.toggle('low', low);
    bar.classList.toggle('paused', !!paused);
    $('barFill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, ms / fullMs)).toFixed(4) + ')';
    // Screen readers get the clock at 10 and 5 seconds, not every tick.
    if (mode === 'daily' && secs <= 5 && secs > 0 && secs !== lastTickSecond) {
      lastTickSecond = secs;
      Sfx.tick();
    }
    if ((secs === 10 || secs === 5) && lastAnnounced !== secs) {
      lastAnnounced = secs;
      $('clockLive').textContent = secs + ' seconds left';
    }
  }

  /* ---------- home ---------- */

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
    $('todayLabel').textContent = prettyDate(today());
    const btn = $('dailyBtn');
    const status = $('dailyStatus');
    $('skipStaleBtn').hidden = !stale;
    if (!daily || (!stale && !daily.round && !daily.results.length)) {
      btn.textContent = "Start today's flight";
      status.textContent = 'The same prompts for every Yellow Jacket, once a day.';
    } else if (daily.finished) {
      const score = C.totalScore(daily.results);
      btn.textContent = "See today's results";
      status.textContent = 'Flown: ' + C.formatNumber(score) + ' pts, ' + C.formatNumber(C.altitudeFeet(score)) + ' ft. Come back tomorrow for a new seven.';
    } else {
      const which = stale ? "yesterday's flight" : "today's flight";
      if (daily.round) {
        btn.textContent = 'Back to round ' + (daily.round.index + 1) + ' (clock is running)';
        status.textContent = 'You have a round in progress in ' + which + '.';
      } else {
        btn.textContent = (stale ? "Finish yesterday's flight: round " : 'Resume at round ') + (daily.results.length + 1) + ' of ' + C.ROUNDS;
        status.textContent = C.formatNumber(C.totalScore(daily.results)) + ' pts so far' + (stale ? ". Today's seven unlock when you finish." : '.');
      }
    }
    const best = getBest();
    $('bestLabel').textContent = best && best.score
      ? 'Best run: ' + C.formatNumber(best.score) + ' pts across ' + best.answered + (best.answered === 1 ? ' prompt.' : ' prompts.')
      : 'No best run yet.';
  }

  function goHome() {
    if (mode === 'infinite' && inf && !inf.over) return endInfinite();
    stopLoop();
    mode = null;
    renderHome();
    show('home', $('homeTitle'));
    setScene(daily && !stale ? C.altitudeFeet(C.totalScore(daily.results)) : 0, false);
  }

  function renderLegend() {
    const list = $('tierLegend');
    C.TIER_ORDER.forEach((t) => {
      const li = el('li');
      li.appendChild(badge(t));
      li.appendChild(el('span', 'pts', C.TIERS[t].points + ' pts'));
      list.appendChild(li);
    });
  }

  /* ---------- daily ---------- */

  function dailyEnter() {
    if (!daily) {
      daily = C.newDaily(today(), C.dailyPromptIds(prompts, today()));
      saveDaily();
    }
    if (daily.finished) return showResults();
    if (daily.round) return enterDailyRound();
    showBetween();
  }

  function startToday() {
    daily = null;
    stale = false;
    dailyEnter();
  }

  function showBetween() {
    stopLoop();
    mode = null;
    const done = daily.results.length;
    const last = daily.results[done - 1];
    const card = $('lastResult');
    card.hidden = !last;
    if (last) {
      const p = byId[last.promptId];
      $('lastRoundLabel').textContent = 'Round ' + done + ' of ' + C.ROUNDS;
      $('lastPrompt').textContent = p.text;
      const b = $('lastBadge');
      b.className = 'badge tier-' + (last.tier || 'miss');
      b.textContent = last.tier ? C.TIERS[last.tier].label : "Time's up";
      announce('Round ' + done + ': ' + b.textContent + ', ' + (last.answer ? last.answer + ', ' : '') + 'plus ' + last.points + ' points. Total ' + C.totalScore(daily.results) + ' points.');
      $('lastPoints').textContent = '+' + last.points + ' pts';
      $('lastAnswer').textContent = last.answer || 'No answer';
      const bits = [];
      if (last.note) bits.push(last.note);
      if (last.fuzzy) bits.push('Close enough on the spelling.');
      if (last.wrong) bits.push(last.wrong + (last.wrong === 1 ? ' wrong guess' : ' wrong guesses') + ' first.');
      $('lastNote').textContent = bits.join(' ');
    }
    const score = C.totalScore(daily.results);
    const btn = $('nextBtn');
    if (daily.finished) {
      $('nextLabel').textContent = 'Flight complete';
      $('nextTitle').textContent = 'All seven flown.';
      $('nextHint').textContent = '';
      btn.textContent = 'See your altitude';
    } else {
      const next = byId[daily.promptIds[done]];
      $('nextLabel').textContent = 'Round ' + (done + 1) + ' of ' + C.ROUNDS;
      $('nextTitle').textContent = 'Next up: ' + next.category;
      $('nextHint').textContent = '25 seconds. A wrong guess costs 3. The clock starts when you press the button.';
      btn.textContent = done === 0 ? 'Start round 1' : 'Start round ' + (done + 1);
    }
    $('runningScore').textContent = done ? C.formatNumber(score) + ' pts · ' + C.formatNumber(C.altitudeFeet(score)) + ' ft so far' : '';
    betweenShownAt = Date.now();
    show('between', btn);
    // Start from where the bee was before this round, then climb to the new total.
    const climbed = justEnded && last ? last.points : 0;
    setScene(C.altitudeFeet(score - climbed), false);
    if (climbed) window.requestAnimationFrame(() => setScene(C.altitudeFeet(score), true));
    else if (justEnded) stallScene();
    justEnded = false;
  }

  function onNext() {
    if (Date.now() - betweenShownAt < NEXT_GUARD_MS) return;
    if (daily.finished) return showResults();
    C.startRound(daily, Date.now());
    monoAt = performance.now();
    saveDaily();
    Sfx.start();
    enterDailyRound();
  }

  function renderPips() {
    const pips = $('pips');
    pips.textContent = '';
    for (let i = 0; i < C.ROUNDS; i++) {
      const li = el('li');
      const r = daily.results[i];
      if (r) {
        li.className = 'tier-' + (r.tier || 'miss');
        li.textContent = String(r.points); // the number, so rarity is not shown by colour alone
      } else if (daily.round && daily.round.index === i) li.className = 'now';
      pips.appendChild(li);
    }
  }

  function renderTried(items) {
    const list = $('tried');
    list.textContent = '';
    items.forEach((t) => list.appendChild(el('li', '', t)));
  }

  function enterDailyRound() {
    mode = 'daily';
    lastAnnounced = 0;
    const p = byId[daily.promptIds[daily.round.index]];
    $('pips').hidden = false;
    $('hud').classList.add('is-daily');
    $('infActions').hidden = true;
    $('pauseNote').hidden = true;
    $('hudText').textContent = 'Round ' + (daily.round.index + 1) + ' of ' + C.ROUNDS;
    $('cat').textContent = p.category;
    $('promptText').textContent = p.text;
    $('guess').value = '';
    $('clockLive').textContent = '';
    setFeedback('', '');
    renderPips();
    renderTried(daily.round.tried.map((t) => t.text));
    lastSavedSecond = -1;
    lastTickSecond = 0;
    renderClock(C.remainingMs(daily, Date.now()), C.ROUND_MS);
    show('play', $('guess'));
    setScene(C.altitudeFeet(C.totalScore(daily.results)), false);
    startLoop();
  }

  function dailySubmit(text) {
    const p = byId[daily.promptIds[daily.round.index]];
    const mono = performance.now() - monoAt;
    monoAt = performance.now();
    const r = C.dailyGuess(daily, p, text, Date.now(), mono);
    if (r.status === 'empty') return;
    if (r.status === 'duplicate') {
      setFeedback('Already tried that one. No time lost.', 'bad');
      $('guess').select();
      return;
    }
    if (r.status === 'wrong') {
      saveDaily();
      setFeedback('Not on the list. −3 seconds.', 'bad');
      renderTried(daily.round.tried.map((t) => t.text));
      $('guess').value = '';
      shake();
      Sfx.wrong();
      return;
    }
    // correct or timeout: the round is over either way
    saveDaily();
    if (r.status === 'correct') Sfx.correct(C.TIER_ORDER.indexOf(r.result.tier));
    else Sfx.timeout();
    justEnded = true;
    showBetween();
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
    mode = null;
    const score = C.totalScore(daily.results);
    const band = C.bandFor(score);
    $('resDate').textContent = prettyDate(daily.date);
    $('resBand').textContent = band.name;
    $('resBlurb').textContent = band.blurb;
    $('resScore').textContent = C.formatNumber(score) + ' pts';
    $('resAlt').textContent = C.formatNumber(C.altitudeFeet(score)) + ' ft';

    const ladder = $('ladder');
    ladder.textContent = '';
    C.BANDS.forEach((b) => {
      ladder.appendChild(el('li', b === band ? 'on' : '', C.formatNumber(C.altitudeFeet(b.min)) + ' ft · ' + b.name));
    });

    const list = $('breakdown');
    const spoilers = $('spoilerList');
    list.textContent = '';
    spoilers.textContent = '';
    daily.results.forEach((r, i) => {
      const p = byId[r.promptId];
      list.appendChild(resultRow(i + 1, p.text, r.answer || 'No answer', r.tier, r.points));
      const top = p.answers.filter((a) => a.tier === 'swarm')[0];
      spoilers.appendChild(resultRow(i + 1, p.text, top.name, 'swarm', null));
    });

    const here = window.location;
    const url = /^https?:$/.test(here.protocol) ? here.origin + here.pathname.replace(/index\.html$/, '') : '';
    $('shareBox').value = C.shareText(daily.date, daily.results, url);
    $('copyStatus').textContent = '';
    // After finishing yesterday's run past midnight UTC, today's is already open.
    const todayOpen = daily.date !== today();
    $('resNext').hidden = todayOpen;
    $('resTodayBtn').hidden = !todayOpen;
    announce('Final score ' + score + ' points, ' + C.altitudeFeet(score) + ' feet above Tech Tower. ' + band.name + '.');
    show('results', $('resBand'));
    const box = $('shareBox'); // grow the box to its text so no line is cut off on narrow screens
    box.style.height = 'auto';
    box.style.height = box.scrollHeight + 4 + 'px';
    // Replay the whole climb from the lawn.
    setScene(0, false);
    if (score) window.requestAnimationFrame(() => setScene(C.altitudeFeet(score), true));
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(box.value).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- infinite ---------- */

  function infPrompt() {
    return byId[inf.order[inf.pos]];
  }

  function renderInfinite() {
    const p = infPrompt();
    $('hudText').textContent = C.formatNumber(inf.score) + ' pts · prompt ' + (inf.answered + 1);
    $('cat').textContent = p.category;
    $('promptText').textContent = p.text;
    renderTried([]);
  }

  function startInfinite() {
    inf = C.newInfinite(C.shuffle(prompts.map((p) => p.id), Math.random));
    bestAtStart = getBest();
    mode = 'infinite';
    lastAnnounced = 0;
    $('pips').hidden = true;
    $('hud').classList.remove('is-daily');
    $('infActions').hidden = false;
    $('guess').value = '';
    $('clockLive').textContent = '';
    setFeedback('', '');
    renderInfinite();
    renderClock(inf.clockMs, C.INFINITE_START_MS, false);
    show('play', $('guess'));
    setScene(0, false);
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
      setFeedback('Already tried that one. No time lost.', 'bad');
      $('guess').select();
      return;
    }
    if (r.status === 'wrong') {
      setFeedback('Not on the list. −3 seconds.', 'bad');
      $('guess').value = '';
      shake();
      Sfx.wrong();
      if (inf.over) endInfinite();
      return;
    }
    Sfx.correct(C.TIER_ORDER.indexOf(r.answer.tier));
    setScene(C.altitudeFeet(inf.score), true);
    $('guess').value = '';
    lastAnnounced = 0;
    setFeedback(r.answer.name + ': ' + C.TIERS[r.answer.tier].label + ', +' + r.points + ' pts, +' + r.bonusMs / 1000 + 's', 'good');
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
    $('infTitle').textContent = inf.cleared ? 'You emptied the hive.' : isBest ? 'New best run.' : 'Out of air.';
    $('infScore').textContent = C.formatNumber(inf.score) + ' pts';
    $('infCount').textContent = String(inf.answered);
    $('infBest').textContent = C.formatNumber(Math.max(best ? best.score : 0, inf.score)) + ' pts';
    announce('Run over. ' + inf.score + ' points across ' + inf.answered + ' prompts.');
    const list = $('infLog');
    list.textContent = '';
    inf.log.forEach((r, i) => list.appendChild(resultRow(i + 1, byId[r.promptId].text, r.answer, r.tier, r.points)));
    $('infLogCard').hidden = inf.log.length === 0;
    show('infover', $('infTitle'));
    setScene(C.altitudeFeet(inf.score), false);
    if (inf.cleared) Sfx.fanfare(4);
    else Sfx.timeout();
  }

  /* ---------- clock ---------- */

  function tick() {
    if (mode === 'daily') {
      if (tickDaily()) {
        saveDaily();
        Sfx.timeout();
        justEnded = true;
        showBetween();
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
      $('pauseNote').hidden = draining || inf.over;
      renderClock(inf.clockMs, Math.max(C.INFINITE_START_MS, inf.clockMs), !draining);
      if (inf.over) endInfinite();
    }
  }

  function everySecond() {
    const ms = C.msUntilNextUtcDay(Date.now());
    const s = Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const text = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    document.querySelectorAll('.js-countdown').forEach((n) => {
      n.textContent = text;
    });
    if (view === 'home') {
      // Catch a round timing out, or the UTC day rolling over, while the player sits on the home screen.
      if (daily && tickDaily()) saveDaily();
      renderHome();
    }
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
    // Bank the clock before the page is hidden or unloaded.
    const bank = () => {
      if (daily && daily.round) {
        const ended = tickDaily();
        saveDaily();
        if (ended && view === 'play') showBetween();
      }
    };
    document.addEventListener('visibilitychange', bank);
    window.addEventListener('pagehide', bank);
    $('skipBtn').addEventListener('click', () => {
      C.infiniteSkip(inf);
      $('guess').value = '';
      setFeedback('Skipped. −5 seconds.', 'bad');
      Sfx.skip();
      if (inf.over) return endInfinite();
      renderInfinite();
      $('guess').focus();
    });
    $('guessForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = $('guess').value;
      if (mode === 'daily' && daily && daily.round) dailySubmit(text);
      else if (mode === 'infinite' && inf) infSubmit(text);
      if (view === 'play') $('guess').focus();
    });
    $('howBtn').addEventListener('click', openHowTo);
    $('soundBtn').addEventListener('click', () => {
      const on = !Sfx.isEnabled();
      applySound(on);
      store.set(K_SOUND, { v: C.SAVE_VERSION, on });
      if (on) Sfx.start();
    });
    $('howClose').addEventListener('click', () => {
      const dlg = $('howDlg');
      if (typeof dlg.close !== 'function') dlg.removeAttribute('open');
    });
  }

  function openHowTo() {
    const dlg = $('howDlg');
    if (dlg.open) return;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function boot() {
    wire();
    renderLegend();
    const sound = store.get(K_SOUND, null);
    applySound(!(sound && sound.on === false));
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
        if (daily && daily.round) enterDailyRound();
        else if (daily && !daily.finished && daily.results.length) showBetween();
        else if (daily && daily.finished) showResults();
        else {
          goHome();
          if (!store.get(K_SEEN, null)) {
            store.set(K_SEEN, { v: C.SAVE_VERSION });
            openHowTo();
          }
        }
      })
      .catch((err) => {
        $('errorText').textContent = window.location.protocol === 'file:'
          ? 'This page was opened straight from a file, and browsers block the game data that way. Serve the folder over HTTP instead (for example: npx serve .).'
          : 'The game data did not load. Check your connection and try again.';
        $('errorDetail').textContent = 'Details: ' + (err && err.message ? err.message : 'unknown error');
        show('error', $('retryBtn'));
      });
  }

  boot();
})();
