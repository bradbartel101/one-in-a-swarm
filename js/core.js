/* One in a Swarm — game rules. Pure functions only: no DOM, no storage, no clock of its own.
   Loaded as a plain script in the browser (window.SwarmCore) and via require() in the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SwarmCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIERS = {
    common: { points: 10, label: 'Common', emoji: '⬜', bonusMs: 8000, climbMs: 2500, quip: 'Everybody said that one. The bees barely cleared the lawn.' },
    clever: { points: 15, label: 'Too Clever', emoji: '🟩', bonusMs: 8000, climbMs: 2800, quip: 'You and every other clever Jacket.' },
    solid: { points: 30, label: 'Solid', emoji: '🟧', bonusMs: 9000, climbMs: 3100, quip: 'A good answer. The swarm picks up speed.' },
    rare: { points: 60, label: 'Rare', emoji: '🟦', bonusMs: 10000, climbMs: 3400, quip: 'Not many think of that one. Up you go.' },
    deep: { points: 85, label: 'Deep Cut', emoji: '🟪', bonusMs: 12000, climbMs: 3700, quip: 'A deep cut. The air is getting thin.' },
    swarm: { points: 100, label: 'One in a Swarm', emoji: '🐝', bonusMs: 16000, climbMs: 4000, quip: 'The one answer hidden in the hive. Helluva pull.' },
  };
  const TIER_ORDER = ['common', 'clever', 'solid', 'rare', 'deep', 'swarm'];
  const MISS_EMOJI = '⬛';

  const ROUNDS = 7;
  const ROUND_MS = 25000;
  const PENALTY_MS = 3000;
  const INFINITE_START_MS = 45000;
  const SKIP_MS = 5000;
  const MIN_ANSWERS = 25;
  const LAUNCH_DATE = '2026-10-08'; // flight #1

  // Altitude has two halves. How far the swarm climbs on screen depends only on points (the
  // world is measured in points; see scene.js). The feet shown are those points pushed through
  // one curve, altitudeFeet(), pinned to these anchors so that real altitudes land in the
  // right part of the world: skyline, clouds, airliners, the edge of space, the Moon.
  const TOP_SCORE = ROUNDS * TIERS.swarm.points;
  const SPACE_FEET = 328084; // the Karman line, 100 km
  const MOON_MILES = 238855; // average distance to the Moon
  const ALTITUDE_ANCHORS = [[0, 0], [40, 120], [110, 1200], [150, 10000], [350, 40000], [550, SPACE_FEET], [TOP_SCORE, MOON_MILES * 5280]];

  const BANDS = [
    { min: 0, name: 'Still in the Hive', blurb: 'Barely off the ground. Even George P. Burdell got further, and he never existed.' },
    { min: 100, name: 'Clear of the Skyline', blurb: 'Airborne, and level with the tallest roofs in Atlanta.' },
    { min: 225, name: 'Above the Weather', blurb: 'Up past the obvious answers and the clouds with them.' },
    { min: 375, name: 'Stratosphere Bound', blurb: 'Rare air. Above the airliners, and the sky is going dark.' },
    { min: 525, name: 'Helluva Engineer', blurb: 'Nearly every answer a deep cut. You got out, past the edge of space.' },
  ];

  /* ---------- matching ---------- */

  function tokenize(str) {
    return String(str == null ? '' : str)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’‘`.]/g, '')
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
  }

  // Collapses a guess or an answer to a comparison key. `opts.lead` and `opts.strip` are
  // optional words dropped from the front / back ("CS 1332" -> "1332", "Glenn Hall" -> "glenn").
  function normalize(str, opts) {
    const lead = (opts && opts.lead) || [];
    const strip = (opts && opts.strip) || [];
    let t = tokenize(str);
    const noAnd = t.filter((w) => w !== 'and');
    if (noAnd.length) t = noAnd;
    if (t.length > 1 && t[0] === 'the') t.shift();
    while (t.length > 1 && lead.indexOf(t[0]) !== -1) t.shift();
    while (t.length > 1 && strip.indexOf(t[t.length - 1]) !== -1) t.pop();
    return t.join('');
  }

  // The key plus its singular forms, so "Yellow Jackets" and "Yellow Jacket" meet in the middle.
  function variants(key) {
    const out = [key];
    if (key.length >= 4 && !/\d/.test(key)) {
      if (key.endsWith('ies')) out.push(key.slice(0, -3) + 'y');
      if (key.endsWith('es')) out.push(key.slice(0, -2));
      if (key.endsWith('s') && !key.endsWith('ss')) out.push(key.slice(0, -1));
    }
    return out;
  }

  // Edit distance with adjacent transpositions, abandoned once it exceeds `max`.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }

  // "Skiles" then "skile" is the same wrong guess, so duplicates compare singular forms too.
  function sameGuess(a, b) {
    const va = variants(a);
    return variants(b).some((v) => va.indexOf(v) !== -1);
  }

  const indexCache = new WeakMap();

  function buildIndex(prompt) {
    let idx = indexCache.get(prompt);
    if (idx) return idx;
    const exact = new Map();
    const loose = new Map();
    const labels = new Map(); // key -> the text an author wrote, for "did you mean" messages
    prompt.answers.forEach((answer, i) => {
      [answer.name].concat(answer.aliases || []).forEach((text) => {
        const k = normalize(text, prompt);
        if (k && !exact.has(k)) {
          exact.set(k, i);
          labels.set(k, text);
        }
      });
    });
    exact.forEach((i, k) => {
      variants(k).forEach((v) => {
        if (!exact.has(v) && !loose.has(v)) loose.set(v, i);
      });
    });
    idx = { exact, loose, labels };
    indexCache.set(prompt, idx);
    return idx;
  }

  function fuzzyLimit(key) {
    if (/\d/.test(key) || key.length < 5) return 0;
    return key.length >= 12 ? 2 : 1;
  }

  // Returns { key, answer, fuzzy } where answer is null when nothing matched. A fuzzy match is
  // a near-miss: callers ask the player to confirm it rather than accepting it outright, and
  // `label` is the spelling to show them.
  function matchAnswer(prompt, input) {
    const key = normalize(input, prompt);
    if (!key) return { key: '', answer: null, fuzzy: false };
    const idx = buildIndex(prompt);
    const tries = variants(key);
    for (let i = 0; i < tries.length; i++) {
      const hit = idx.exact.has(tries[i]) ? idx.exact.get(tries[i]) : idx.loose.get(tries[i]);
      if (hit !== undefined) return { key, answer: prompt.answers[hit], fuzzy: false };
    }
    // Typo tolerance: only when exactly one answer is the closest.
    if (fuzzyLimit(key) > 0) {
      let best = Infinity;
      let bestAnswer = -1;
      let bestKey = '';
      let tie = false;
      idx.exact.forEach((ai, k) => {
        const max = Math.min(fuzzyLimit(k), fuzzyLimit(key));
        if (!max) return;
        const d = editDistance(key, k, max);
        if (d > max) return;
        if (d < best) {
          best = d;
          bestAnswer = ai;
          bestKey = k;
          tie = false;
        } else if (d === best && ai !== bestAnswer) {
          tie = true;
        }
      });
      if (bestAnswer !== -1 && !tie) return { key, answer: prompt.answers[bestAnswer], fuzzy: true, label: idx.labels.get(bestKey) };
    }
    return { key, answer: null, fuzzy: false };
  }

  /* ---------- secret answers ----------
     Typed in any round, these earn a reaction and nothing else: no points, no penalty, not a
     wrong guess. They only apply where the text is not a real answer to the prompt, so
     "Georgia" still scores on the prompts where Georgia belongs. */
  const SECRETS = {
    georgepburdell: 'burdell', georgeburdell: 'burdell', burdell: 'burdell',
    buzz: 'buzz',
    tohellwithgeorgia: 'thwg', thwg: 'thwg',
    helluvaengineer: 'helluva', ahelluvaengineer: 'helluva',
    uga: 'wrongschool', georgia: 'wrongschool', universityofgeorgia: 'wrongschool',
  };

  function secretFor(input) {
    const id = SECRETS[normalize(input)];
    return id || null;
  }

  /* ---------- seeded randomness and the daily draw ---------- */

  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function seededRng(seed) {
    let a = hashString(String(seed));
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function utcDateKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function dayNumber(dateKey) {
    return Math.floor(Date.parse(dateKey + 'T00:00:00Z') / 86400000);
  }

  function msUntilNextUtcDay(nowMs) {
    return 86400000 - (((nowMs % 86400000) + 86400000) % 86400000);
  }

  // Each day draws `count` prompts that were not used on any of the previous `window` days, so
  // no prompt repeats within the number of days the bank can cover. The chain is computed
  // forward from a fixed epoch, which makes it identical for every player.
  const ROTATION_EPOCH = '2025-01-01';
  const rotationCache = new Map();

  function rotationCoverDays(total, count) {
    return Math.max(1, Math.floor(total / (count || ROUNDS)));
  }

  function dailyPromptIds(prompts, dateKey, count) {
    const n = count || ROUNDS;
    const ids = prompts.map((p) => p.id).sort();
    const target = dayNumber(dateKey) - dayNumber(ROTATION_EPOCH);
    if (!(target >= 0)) return shuffle(ids, seededRng('one-in-a-swarm:pre:' + dateKey)).slice(0, n);
    const signature = n + '|' + ids.join(',');
    let chain = rotationCache.get(signature);
    if (!chain) {
      chain = [];
      rotationCache.set(signature, chain);
    }
    const lookBack = rotationCoverDays(ids.length, n) - 1;
    for (let d = chain.length; d <= target; d++) {
      const recent = new Set();
      for (let k = Math.max(0, d - lookBack); k < d; k++) chain[k].forEach((id) => recent.add(id));
      const pool = ids.filter((id) => !recent.has(id));
      chain.push(shuffle(pool, seededRng('one-in-a-swarm:day:' + d)).slice(0, n));
    }
    return chain[target].slice();
  }

  /* ---------- scoring ---------- */

  function tierPoints(tier) {
    return TIERS[tier] ? TIERS[tier].points : 0;
  }

  function totalScore(results) {
    return results.reduce((sum, r) => sum + (r.points || 0), 0);
  }

  // A monotone cubic through the anchors, worked in log space so that 120 ft and a billion feet
  // can share one smooth curve. This is the only place points become feet.
  const squash = (ft) => Math.log(1 + ft / 100);
  const AX = ALTITUDE_ANCHORS.map((a) => a[0]);
  const AY = ALTITUDE_ANCHORS.map((a) => squash(a[1]));
  const SLOPES = (function () {
    const n = AX.length;
    const secant = [];
    for (let i = 0; i < n - 1; i++) secant.push((AY[i + 1] - AY[i]) / (AX[i + 1] - AX[i]));
    const m = [secant[0]];
    for (let i = 1; i < n - 1; i++) m.push((2 * secant[i - 1] * secant[i]) / (secant[i - 1] + secant[i])); // harmonic mean keeps it monotone
    m.push(secant[n - 2]);
    return m;
  })();

  function altitudeFeet(score) {
    if (!(score > 0)) return 0;
    const n = AX.length;
    let y;
    if (score >= AX[n - 1]) {
      y = AY[n - 1] + SLOPES[n - 1] * (score - AX[n - 1]); // past the Moon, in infinite mode
    } else {
      let i = 0;
      while (AX[i + 1] < score) i++;
      const h = AX[i + 1] - AX[i];
      const t = (score - AX[i]) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * AY[i] + (t3 - 2 * t2 + t) * h * SLOPES[i] + (-2 * t3 + 3 * t2) * AY[i + 1] + (t3 - t2) * h * SLOPES[i + 1];
    }
    return Math.round(100 * (Math.exp(y) - 1));
  }

  // The inverse: where in the world a real altitude sits. Facts and sightings are placed with it.
  function scoreForFeet(feet) {
    let lo = 0;
    let hi = TOP_SCORE * 3;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (altitudeFeet(mid) < feet) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Feet up to a million, then miles, so the number always fits the HUD.
  function altitudeParts(score) {
    const ft = altitudeFeet(score);
    if (ft < 1000000) return { value: formatNumber(ft), unit: 'ft' };
    const miles = ft / 5280;
    if (miles < 1000000) return { value: formatNumber(Math.round(miles)), unit: 'mi' };
    return { value: miles < 999e6 ? (miles / 1e6).toFixed(1) + 'M' : '999M+', unit: 'mi' }; // only reachable in infinite mode
  }

  function altitudeText(score) {
    const a = altitudeParts(score);
    return a.value + ' ' + a.unit;
  }

  function flightNumber(dateKey) {
    return dayNumber(dateKey) - dayNumber(LAUNCH_DATE) + 1;
  }

  function bandFor(score) {
    let band = BANDS[0];
    for (let i = 0; i < BANDS.length; i++) if (score >= BANDS[i].min) band = BANDS[i];
    return band;
  }

  function formatNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function shareGrid(results) {
    return results.map((r) => (r.tier && TIERS[r.tier] ? TIERS[r.tier].emoji : MISS_EMOJI)).join('');
  }

  function shareText(dateKey, results, url) {
    const score = totalScore(results);
    const lines = [
      'One in a Swarm 🐝 Flight #' + flightNumber(dateKey),
      shareGrid(results),
      formatNumber(score) + ' pts · ' + altitudeText(score) + ' up',
    ];
    if (url) lines.push(url);
    return lines.join('\n');
  }

  /* ---------- daily run ----------
     A round stores the time it has left and when that was last measured. Time only ever
     counts down: a device clock moved backwards reads as zero elapsed, never as time gained,
     and the caller may pass a monotonic elapsed time so a clock change mid-round is ignored. */

  const SAVE_VERSION = 2;

  function newDaily(dateKey, promptIds) {
    return { v: SAVE_VERSION, date: dateKey, promptIds: promptIds.slice(), results: [], round: null, finished: false };
  }

  function startRound(state, now) {
    if (state.finished || state.round) return false;
    state.round = { index: state.results.length, leftMs: ROUND_MS, seenAt: now, tried: [] };
    return true;
  }

  function remainingMs(state, now) {
    if (!state.round) return 0;
    return Math.max(0, state.round.leftMs - Math.max(0, now - state.round.seenAt));
  }

  function closeRound(state, result) {
    result.promptId = state.promptIds[state.round.index];
    result.wrong = state.round.tried.length;
    state.results.push(result);
    state.round = null;
    if (state.results.length >= state.promptIds.length) state.finished = true;
  }

  // Charges elapsed time to the live round and ends it with a miss at zero. Returns true when
  // it ended. `monoElapsedMs` is optional time since the previous call on a monotonic clock.
  function dailyTick(state, now, monoElapsedMs) {
    const round = state.round;
    if (!round) return false;
    const elapsed = Math.max(0, now - round.seenAt, monoElapsedMs || 0);
    round.leftMs = Math.max(0, round.leftMs - elapsed);
    round.seenAt = now;
    if (round.leftMs > 0) return false;
    closeRound(state, { tier: null, answer: null, points: 0 });
    return true;
  }

  function dailyGuess(state, prompt, input, now, monoElapsedMs) {
    if (!state.round) return { status: 'idle' };
    if (dailyTick(state, now, monoElapsedMs)) return { status: 'timeout' };
    const m = matchAnswer(prompt, input);
    if (!m.key) return { status: 'empty' };
    if ((!m.answer || m.fuzzy) && secretFor(input)) return { status: 'secret', secret: secretFor(input) };
    if (m.answer && m.fuzzy && state.round.pending !== m.key) {
      state.round.pending = m.key; // typing the same thing again confirms it
      return { status: 'near', suggestion: m.label };
    }
    if (m.answer) {
      const result = {
        tier: m.answer.tier,
        answer: m.answer.name,
        points: tierPoints(m.answer.tier),
        fuzzy: m.fuzzy,
        note: m.answer.note || '',
      };
      closeRound(state, result);
      return { status: 'correct', result };
    }
    if (state.round.tried.some((t) => sameGuess(t.key, m.key))) return { status: 'duplicate' };
    state.round.tried.push({ key: m.key.slice(0, 80), text: String(input).trim().slice(0, 60) });
    state.round.leftMs = Math.max(0, state.round.leftMs - PENALTY_MS);
    if (state.round.leftMs === 0) {
      closeRound(state, { tier: null, answer: null, points: 0 });
      return { status: 'timeout', lastWrong: true };
    }
    return { status: 'wrong', remainingMs: state.round.leftMs };
  }

  /* ---------- saved data ---------- */

  function isCount(n, max) {
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  }

  // Rebuilds a daily run from untrusted storage. Anything malformed, or saved by an older
  // version, returns null so the caller starts clean instead of crashing later.
  function reviveDaily(raw, knownIds) {
    try {
      if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return null;
      if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || isNaN(dayNumber(raw.date))) return null;
      const ids = raw.promptIds;
      if (!Array.isArray(ids) || ids.length !== ROUNDS || new Set(ids).size !== ROUNDS) return null;
      if (!ids.every((id) => typeof id === 'string' && knownIds.has(id))) return null;
      if (!Array.isArray(raw.results) || raw.results.length > ROUNDS) return null;
      const results = [];
      for (let i = 0; i < raw.results.length; i++) {
        const r = raw.results[i];
        if (!r || typeof r !== 'object' || r.promptId !== ids[i]) return null;
        if (r.tier !== null && !TIERS[r.tier]) return null;
        if (r.tier === null ? r.answer !== null : typeof r.answer !== 'string') return null;
        results.push({
          tier: r.tier,
          answer: r.tier === null ? null : r.answer.slice(0, 120),
          points: tierPoints(r.tier),
          promptId: r.promptId,
          wrong: isCount(r.wrong, 1000) ? r.wrong : 0,
          fuzzy: r.fuzzy === true,
          note: typeof r.note === 'string' ? r.note.slice(0, 300) : '',
        });
      }
      const finished = results.length === ROUNDS;
      if (raw.finished !== finished) return null;
      let round = null;
      if (raw.round !== null && raw.round !== undefined) {
        const q = raw.round;
        if (finished || typeof q !== 'object' || q.index !== results.length) return null;
        if (typeof q.leftMs !== 'number' || !(q.leftMs >= 0 && q.leftMs <= ROUND_MS)) return null;
        if (typeof q.seenAt !== 'number' || !isFinite(q.seenAt)) return null;
        if (!Array.isArray(q.tried) || q.tried.length > 200) return null;
        if (!q.tried.every((t) => t && typeof t.key === 'string' && typeof t.text === 'string')) return null;
        round = { index: q.index, leftMs: q.leftMs, seenAt: q.seenAt, tried: q.tried.map((t) => ({ key: t.key.slice(0, 80), text: t.text.slice(0, 60) })) };
        if (typeof q.pending === 'string') round.pending = q.pending.slice(0, 80);
      }
      return { v: SAVE_VERSION, date: raw.date, promptIds: ids.slice(), results, round, finished };
    } catch (e) {
      return null;
    }
  }

  function reviveBest(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return null;
    if (!isCount(raw.score, 1e9) || !isCount(raw.answered, 1e6)) return null;
    return { v: SAVE_VERSION, score: raw.score, answered: raw.answered };
  }

  /* ---------- lifetime stats ---------- */

  function newStats() {
    return { v: SAVE_VERSION, played: 0, total: 0, best: 0, streak: 0, lastDate: '' };
  }

  // Adds a finished flight. Recording the same date twice changes nothing.
  function recordFlight(stats, dateKey, score) {
    const s = stats || newStats();
    if (s.lastDate && dayNumber(dateKey) <= dayNumber(s.lastDate)) return s;
    return {
      v: SAVE_VERSION,
      played: s.played + 1,
      total: s.total + score,
      best: Math.max(s.best, score),
      streak: s.lastDate === previousDateKey(dateKey) ? s.streak + 1 : 1,
      lastDate: dateKey,
    };
  }

  function reviveStats(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return null;
    if (!isCount(raw.played, 1e6) || !isCount(raw.total, 1e9) || !isCount(raw.best, TOP_SCORE) || !isCount(raw.streak, 1e6)) return null;
    if (typeof raw.lastDate !== 'string' || (raw.lastDate && isNaN(dayNumber(raw.lastDate)))) return null;
    if (raw.streak > raw.played || raw.total > raw.played * TOP_SCORE) return null;
    return { v: SAVE_VERSION, played: raw.played, total: raw.total, best: raw.best, streak: raw.streak, lastDate: raw.lastDate };
  }

  // A streak only counts if the last flight was today or yesterday.
  function currentStreak(stats, todayKey) {
    if (!stats || !stats.lastDate) return 0;
    return stats.lastDate === todayKey || stats.lastDate === previousDateKey(todayKey) ? stats.streak : 0;
  }

  function previousDateKey(dateKey) {
    return utcDateKey(new Date((dayNumber(dateKey) - 1) * 86400000));
  }

  // Decides which run the player is in. Today's run always stands. A run begun yesterday and
  // not finished is "stale": the player may finish it before today's. Anything else is gone.
  function resolveDaily(run, todayKey) {
    if (!run) return { run: null, stale: false };
    if (run.date === todayKey) return { run, stale: false };
    const started = run.round !== null || run.results.length > 0;
    if (run.date === previousDateKey(todayKey) && !run.finished && started) return { run, stale: true };
    return { run: null, stale: false };
  }

  /* ---------- infinite run (one clock that drains only while typing) ---------- */

  function newInfinite(shuffledIds) {
    return { order: shuffledIds.slice(), pos: 0, clockMs: INFINITE_START_MS, score: 0, answered: 0, tried: [], log: [], over: false, cleared: false };
  }

  function infiniteDrains(input) {
    return !!(input && (input.focused || input.hasText));
  }

  function infiniteSpend(state, ms) {
    state.clockMs = Math.max(0, state.clockMs - ms);
    if (state.clockMs === 0) state.over = true;
  }

  function infiniteAdvance(state) {
    state.pos += 1;
    state.tried = [];
    state.pending = null;
    if (state.pos >= state.order.length && !state.over) {
      state.over = true;
      state.cleared = true;
    }
  }

  function infiniteTick(state, dtMs, input) {
    if (state.over || !infiniteDrains(input)) return false;
    infiniteSpend(state, dtMs);
    return true;
  }

  function infiniteGuess(state, prompt, input) {
    if (state.over) return { status: 'idle' };
    const m = matchAnswer(prompt, input);
    if (!m.key) return { status: 'empty' };
    if ((!m.answer || m.fuzzy) && secretFor(input)) return { status: 'secret', secret: secretFor(input) };
    if (m.answer && m.fuzzy && state.pending !== m.key) {
      state.pending = m.key;
      return { status: 'near', suggestion: m.label };
    }
    if (m.answer) {
      const tier = TIERS[m.answer.tier];
      state.score += tier.points;
      state.answered += 1;
      state.clockMs += tier.bonusMs;
      state.log.push({ promptId: prompt.id, answer: m.answer.name, tier: m.answer.tier, points: tier.points });
      infiniteAdvance(state);
      return { status: 'correct', answer: m.answer, points: tier.points, bonusMs: tier.bonusMs, fuzzy: m.fuzzy };
    }
    if (state.tried.some((k) => sameGuess(k, m.key))) return { status: 'duplicate' };
    state.tried.push(m.key);
    infiniteSpend(state, PENALTY_MS);
    return { status: 'wrong' };
  }

  function infiniteSkip(state) {
    if (state.over) return false;
    infiniteSpend(state, SKIP_MS);
    if (!state.over) infiniteAdvance(state);
    return true;
  }

  /* ---------- data validation ---------- */

  function validatePrompts(data) {
    const errors = [];
    const prompts = data && data.prompts;
    if (!Array.isArray(prompts)) return ['prompts must be an array'];
    const seenIds = new Set();
    prompts.forEach((p, pi) => {
      const where = 'prompt ' + (p && p.id ? p.id : '#' + pi);
      if (!p || typeof p.id !== 'string' || !p.id) errors.push(where + ': missing id');
      else if (seenIds.has(p.id)) errors.push(where + ': duplicate id');
      else seenIds.add(p.id);
      if (!p.text) errors.push(where + ': missing text');
      if (!p.category) errors.push(where + ': missing category');
      if (!Array.isArray(p.answers)) {
        errors.push(where + ': answers must be an array');
        return;
      }
      if (p.answers.length < MIN_ANSWERS) errors.push(where + ': only ' + p.answers.length + ' answers (need ' + MIN_ANSWERS + ')');
      const swarms = p.answers.filter((a) => a.tier === 'swarm').length;
      if (swarms !== 1) errors.push(where + ': has ' + swarms + ' "swarm" answers (need exactly 1)');
      const owner = new Map();
      p.answers.forEach((a) => {
        if (!a.name) errors.push(where + ': answer with no name');
        if (!TIERS[a.tier]) errors.push(where + ': "' + a.name + '" has invalid tier "' + a.tier + '"');
        [a.name].concat(a.aliases || []).forEach((s) => {
          const k = normalize(s, p);
          if (!k) errors.push(where + ': "' + s + '" normalizes to nothing');
          else if (owner.has(k)) errors.push(where + ': "' + s + '" duplicates "' + owner.get(k) + '"');
          else owner.set(k, s);
        });
      });
    });
    return errors;
  }

  return {
    TIERS, TIER_ORDER, MISS_EMOJI, BANDS,
    ROUNDS, ROUND_MS, PENALTY_MS, INFINITE_START_MS, SKIP_MS, MIN_ANSWERS, LAUNCH_DATE, TOP_SCORE, SPACE_FEET, MOON_MILES, ALTITUDE_ANCHORS,
    tokenize, normalize, variants, editDistance, buildIndex, matchAnswer, secretFor,
    hashString, seededRng, shuffle, utcDateKey, dayNumber, msUntilNextUtcDay, dailyPromptIds, rotationCoverDays,
    tierPoints, totalScore, altitudeFeet, scoreForFeet, altitudeParts, altitudeText, flightNumber, bandFor, formatNumber, shareGrid, shareText,
    SAVE_VERSION, newDaily, startRound, remainingMs, dailyTick, dailyGuess,
    reviveDaily, reviveBest, previousDateKey, resolveDaily,
    newStats, recordFlight, reviveStats, currentStreak,
    newInfinite, infiniteDrains, infiniteTick, infiniteGuess, infiniteSkip,
    validatePrompts,
  };
});
