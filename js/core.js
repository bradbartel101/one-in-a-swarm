/* One in a Swarm — game rules. Pure functions only: no DOM, no storage, no clock of its own.
   Loaded as a plain script in the browser (window.SwarmCore) and via require() in the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SwarmCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIERS = {
    common: { points: 10, label: 'Common', emoji: '⬜', bonusMs: 8000 },
    clever: { points: 15, label: 'Too Clever', emoji: '🟨', bonusMs: 8000 },
    solid: { points: 30, label: 'Solid', emoji: '🟧', bonusMs: 9000 },
    rare: { points: 60, label: 'Rare', emoji: '🟦', bonusMs: 10000 },
    deep: { points: 85, label: 'Deep Cut', emoji: '🟪', bonusMs: 12000 },
    swarm: { points: 100, label: 'One in a Swarm', emoji: '🐝', bonusMs: 16000 },
  };
  const TIER_ORDER = ['common', 'clever', 'solid', 'rare', 'deep', 'swarm'];
  const MISS_EMOJI = '⬛';

  const ROUNDS = 7;
  const ROUND_MS = 25000;
  const PENALTY_MS = 3000;
  const INFINITE_START_MS = 45000;
  const SKIP_MS = 5000;
  const FEET_PER_POINT = 4;
  const MAX_DAILY_SCORE = ROUNDS * TIERS.swarm.points;
  const MIN_ANSWERS = 25;

  const BANDS = [
    { min: 0, name: 'Still in the Hive', blurb: 'Barely off the ground. Even George P. Burdell got further, and he never existed.' },
    { min: 100, name: 'Skimming Tech Green', blurb: 'Airborne, but low enough to dodge frisbees.' },
    { min: 225, name: 'Clearing the Campanile', blurb: 'Up past the obvious answers. Now we are getting somewhere.' },
    { min: 375, name: 'Over the Midtown Skyline', blurb: 'Rare air. Most of the swarm is below you.' },
    { min: 525, name: 'Helluva Engineer', blurb: 'Nearly every answer a deep cut. You got out.' },
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

  function answerKeys(prompt, answer) {
    return [answer.name].concat(answer.aliases || []).map((s) => normalize(s, prompt));
  }

  function buildIndex(prompt) {
    let idx = indexCache.get(prompt);
    if (idx) return idx;
    const exact = new Map();
    const loose = new Map();
    prompt.answers.forEach((answer, i) => {
      answerKeys(prompt, answer).forEach((k) => {
        if (k && !exact.has(k)) exact.set(k, i);
      });
    });
    exact.forEach((i, k) => {
      variants(k).forEach((v) => {
        if (!exact.has(v) && !loose.has(v)) loose.set(v, i);
      });
    });
    idx = { exact, loose };
    indexCache.set(prompt, idx);
    return idx;
  }

  function fuzzyLimit(key) {
    if (/\d/.test(key) || key.length < 7) return 0;
    return key.length >= 12 ? 2 : 1;
  }

  // Returns { key, answer, fuzzy } where answer is null when nothing matched.
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
      let tie = false;
      idx.exact.forEach((ai, k) => {
        const max = Math.min(fuzzyLimit(k), fuzzyLimit(key));
        if (!max) return;
        const d = editDistance(key, k, max);
        if (d > max) return;
        if (d < best) {
          best = d;
          bestAnswer = ai;
          tie = false;
        } else if (d === best && ai !== bestAnswer) {
          tie = true;
        }
      });
      if (bestAnswer !== -1 && !tie) return { key, answer: prompt.answers[bestAnswer], fuzzy: true };
    }
    return { key, answer: null, fuzzy: false };
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

  // Days are grouped into blocks. Each block is one seeded shuffle of the whole bank, cut into
  // `count`-sized slices, so a prompt never repeats within a block.
  function dailyPromptIds(prompts, dateKey, count) {
    const n = count || ROUNDS;
    const ids = prompts.map((p) => p.id).sort();
    const daysPerBlock = Math.max(1, Math.floor(ids.length / n));
    const day = dayNumber(dateKey);
    const block = Math.floor(day / daysPerBlock);
    const slot = ((day % daysPerBlock) + daysPerBlock) % daysPerBlock;
    const order = shuffle(ids, seededRng('one-in-a-swarm:' + block));
    return order.slice(slot * n, slot * n + n);
  }

  /* ---------- scoring ---------- */

  function tierPoints(tier) {
    return TIERS[tier] ? TIERS[tier].points : 0;
  }

  function totalScore(results) {
    return results.reduce((sum, r) => sum + (r.points || 0), 0);
  }

  function altitudeFeet(score) {
    return score * FEET_PER_POINT;
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
      'One in a Swarm 🐝 ' + dateKey,
      shareGrid(results),
      formatNumber(score) + ' pts · ' + formatNumber(altitudeFeet(score)) + ' ft above Tech Tower',
      bandFor(score).name,
    ];
    if (url) lines.push(url);
    return lines.join('\n');
  }

  /* ---------- daily run (wall-clock deadline per round) ---------- */

  function newDaily(dateKey, promptIds) {
    return { v: 1, date: dateKey, promptIds: promptIds.slice(), results: [], round: null, finished: false };
  }

  function startRound(state, now) {
    if (state.finished || state.round) return false;
    state.round = { index: state.results.length, deadline: now + ROUND_MS, tried: [] };
    return true;
  }

  function remainingMs(state, now) {
    return state.round ? Math.max(0, state.round.deadline - now) : 0;
  }

  function closeRound(state, result) {
    result.promptId = state.promptIds[state.round.index];
    result.wrong = state.round.tried.length;
    state.results.push(result);
    state.round = null;
    if (state.results.length >= state.promptIds.length) state.finished = true;
  }

  // Ends the round with a miss if the deadline has passed. Returns true when it did.
  function dailyTick(state, now) {
    if (!state.round || state.round.deadline > now) return false;
    closeRound(state, { tier: null, answer: null, points: 0 });
    return true;
  }

  function dailyGuess(state, prompt, input, now) {
    if (!state.round) return { status: 'idle' };
    if (dailyTick(state, now)) return { status: 'timeout' };
    const m = matchAnswer(prompt, input);
    if (!m.key) return { status: 'empty' };
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
    state.round.tried.push({ key: m.key, text: String(input).trim().slice(0, 60) });
    state.round.deadline -= PENALTY_MS;
    if (dailyTick(state, now)) return { status: 'timeout', lastWrong: true };
    return { status: 'wrong', remainingMs: remainingMs(state, now) };
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
    ROUNDS, ROUND_MS, PENALTY_MS, INFINITE_START_MS, SKIP_MS, FEET_PER_POINT, MAX_DAILY_SCORE, MIN_ANSWERS,
    tokenize, normalize, variants, editDistance, buildIndex, matchAnswer,
    hashString, seededRng, shuffle, utcDateKey, dayNumber, msUntilNextUtcDay, dailyPromptIds,
    tierPoints, totalScore, altitudeFeet, bandFor, formatNumber, shareGrid, shareText,
    newDaily, startRound, remainingMs, dailyTick, dailyGuess,
    newInfinite, infiniteDrains, infiniteTick, infiniteGuess, infiniteSkip,
    validatePrompts,
  };
});
