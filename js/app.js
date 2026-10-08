/* One in a Swarm — the DOM layer. All game rules live in core.js. */
(function () {
  'use strict';

  const C = window.SwarmCore;
  const $ = (id) => document.getElementById(id);

  const K_DAILY = 'swarm.daily.v1';
  const K_BEST = 'swarm.infinite.best.v1';
  const TICK_MS = 100;
  const NEXT_GUARD_MS = 600; // stops a double-tapped Enter from starting the next round

  // localStorage can throw (private mode, blocked site data, quota). The game must run without it.
  const store = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
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
  };

  let prompts = [];
  let byId = {};
  let daily = null;
  let inf = null;
  let mode = null; // 'daily' | 'infinite' while the play view is live
  let loop = null;
  let lastTick = 0;
  let lastAnnounced = 0;
  let betweenShownAt = 0;
  let view = 'loading';

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

  function saveDaily() {
    if (daily) store.set(K_DAILY, daily);
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
    if ((secs === 10 || secs === 5) && lastAnnounced !== secs) {
      lastAnnounced = secs;
      $('clockLive').textContent = secs + ' seconds left';
    }
  }

  /* ---------- home ---------- */

  function loadDaily() {
    const saved = store.get(K_DAILY, null);
    const ok =
      saved && saved.v === 1 && saved.date === today() &&
      Array.isArray(saved.promptIds) && saved.promptIds.length === C.ROUNDS &&
      saved.promptIds.every((id) => byId[id]) && Array.isArray(saved.results);
    daily = ok ? saved : null;
    // A round whose deadline passed while the tab was closed counts as a miss.
    if (daily && C.dailyTick(daily, Date.now())) saveDaily();
  }

  function renderHome() {
    if (daily && daily.date !== today()) daily = null;
    $('todayLabel').textContent = prettyDate(today());
    const btn = $('dailyBtn');
    const status = $('dailyStatus');
    if (!daily) {
      btn.textContent = "Start today's flight";
      status.textContent = 'The same prompts for every Yellow Jacket, once a day.';
    } else if (daily.finished) {
      const score = C.totalScore(daily.results);
      btn.textContent = "See today's results";
      status.textContent = 'Flown: ' + C.formatNumber(score) + ' pts, ' + C.formatNumber(C.altitudeFeet(score)) + ' ft. Come back tomorrow for a new seven.';
    } else if (daily.round) {
      btn.textContent = 'Back to round ' + (daily.round.index + 1) + ' (clock is running)';
      status.textContent = 'You have a round in progress.';
    } else {
      btn.textContent = 'Resume at round ' + (daily.results.length + 1) + ' of ' + C.ROUNDS;
      status.textContent = C.formatNumber(C.totalScore(daily.results)) + ' pts so far.';
    }
    const best = store.get(K_BEST, null);
    $('bestLabel').textContent = best && best.score
      ? 'Best run: ' + C.formatNumber(best.score) + ' pts across ' + best.answered + ' prompts.'
      : 'No best run yet.';
  }

  function goHome() {
    if (mode === 'infinite' && inf && !inf.over) return endInfinite();
    stopLoop();
    mode = null;
    renderHome();
    show('home', $('homeTitle'));
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
  }

  function onNext() {
    if (Date.now() - betweenShownAt < NEXT_GUARD_MS) return;
    if (daily.finished) return showResults();
    C.startRound(daily, Date.now());
    saveDaily();
    enterDailyRound();
  }

  function renderPips() {
    const pips = $('pips');
    pips.textContent = '';
    for (let i = 0; i < C.ROUNDS; i++) {
      const li = el('li');
      const r = daily.results[i];
      if (r) li.className = 'tier-' + (r.tier || 'miss');
      else if (daily.round && daily.round.index === i) li.className = 'now';
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
    renderClock(C.remainingMs(daily, Date.now()), C.ROUND_MS);
    show('play', $('guess'));
    startLoop();
  }

  function dailySubmit(text) {
    const p = byId[daily.promptIds[daily.round.index]];
    const r = C.dailyGuess(daily, p, text, Date.now());
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
      return;
    }
    // correct or timeout: the round is over either way
    saveDaily();
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

    const pct = Math.min(100, (score / C.MAX_DAILY_SCORE) * 100);
    $('altFill').style.height = pct + '%';
    $('altBee').style.bottom = pct + '%';
    const ticks = $('altTicks');
    ticks.textContent = '';
    C.BANDS.forEach((b) => {
      const li = el('li', b === band ? 'on' : '', C.formatNumber(C.altitudeFeet(b.min)) + ' ft · ' + b.name);
      li.style.bottom = (b.min / C.MAX_DAILY_SCORE) * 100 + '%';
      ticks.appendChild(li);
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
    const url = /^https?:$/.test(here.protocol) && !/^(localhost|127\.|\[::1\])/.test(here.host) ? here.origin + here.pathname : '';
    $('shareBox').value = C.shareText(daily.date, daily.results, url);
    $('copyStatus').textContent = '';
    show('results', $('resBand'));
  }

  function copyShare() {
    const box = $('shareBox');
    const status = $('copyStatus');
    const done = () => {
      status.className = 'feedback good';
      status.textContent = 'Copied. Go brag.';
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
    mode = 'infinite';
    lastAnnounced = 0;
    $('pips').hidden = true;
    $('infActions').hidden = false;
    $('guess').value = '';
    $('clockLive').textContent = '';
    setFeedback('', '');
    renderInfinite();
    renderClock(inf.clockMs, C.INFINITE_START_MS, false);
    show('play', $('guess'));
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
      if (inf.over) endInfinite();
      return;
    }
    $('guess').value = '';
    lastAnnounced = 0;
    setFeedback(r.answer.name + ': ' + C.TIERS[r.answer.tier].label + ', +' + r.points + ' pts, +' + r.bonusMs / 1000 + 's', 'good');
    saveBest();
    if (inf.over) return endInfinite();
    renderInfinite();
  }

  function saveBest() {
    const best = store.get(K_BEST, null);
    if (!best || inf.score > best.score) store.set(K_BEST, { score: inf.score, answered: inf.answered, date: today() });
  }

  function endInfinite() {
    stopLoop();
    inf.over = true;
    mode = null;
    const before = store.get(K_BEST, null);
    saveBest();
    const best = store.get(K_BEST, null) || { score: inf.score, answered: inf.answered };
    const isBest = inf.score > 0 && (!before || inf.score >= before.score);
    $('infTitle').textContent = inf.cleared ? 'You emptied the hive.' : isBest ? 'New best run.' : 'Out of air.';
    $('infScore').textContent = C.formatNumber(inf.score) + ' pts';
    $('infCount').textContent = String(inf.answered);
    $('infBest').textContent = C.formatNumber(Math.max(best.score, inf.score)) + ' pts';
    const list = $('infLog');
    list.textContent = '';
    inf.log.forEach((r, i) => list.appendChild(resultRow(i + 1, byId[r.promptId].text, r.answer, r.tier, r.points)));
    $('infLogCard').hidden = inf.log.length === 0;
    show('infover', $('infTitle'));
  }

  /* ---------- clock ---------- */

  function tick() {
    if (mode === 'daily') {
      const now = Date.now();
      if (C.dailyTick(daily, now)) {
        saveDaily();
        showBetween();
        return;
      }
      renderClock(C.remainingMs(daily, now), C.ROUND_MS, false);
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
      if (daily && C.dailyTick(daily, Date.now())) saveDaily();
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
    $('skipBtn').addEventListener('click', () => {
      C.infiniteSkip(inf);
      $('guess').value = '';
      setFeedback('Skipped. −5 seconds.', 'bad');
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
    const dlg = $('howDlg');
    $('howBtn').addEventListener('click', () => {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
    $('howClose').addEventListener('click', () => {
      if (typeof dlg.close !== 'function') dlg.removeAttribute('open');
    });
  }

  function boot() {
    wire();
    renderLegend();
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
        });
        loadDaily();
        everySecond();
        window.setInterval(everySecond, 1000);
        // A refresh mid-run lands back where the player was.
        if (daily && daily.round) enterDailyRound();
        else if (daily && !daily.finished && daily.results.length) showBetween();
        else goHome();
      })
      .catch((err) => {
        $('errorText').textContent = 'The prompt bank could not be loaded (' + err.message + ').';
        show('error');
      });
  }

  boot();
})();
