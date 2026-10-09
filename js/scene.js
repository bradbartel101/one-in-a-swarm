/* One in a Swarm — the world. One tall pixel-art scene drawn in code on a low-resolution canvas
   that the browser scales up without smoothing. The camera is a single number: the score
   (0 to 700 and beyond) that sits on the anchor row. Nothing here knows about the game rules. */
(function (root) {
  'use strict';

  // One point of score is a fixed slice of the screen: 6% of its height. A 10-point answer
  // therefore climbs 60% of a screen and a 100-point answer six screens, at any altitude.
  const SCREENS_PER_POINT = 0.06;
  const SKY = [
    [-60, [226, 244, 255]], [0, [184, 228, 255]], [60, [128, 198, 250]], [150, [88, 162, 238]],
    [250, [56, 122, 212]], [330, [34, 84, 168]], [420, [18, 48, 112]], [520, [10, 28, 72]],
    [620, [5, 13, 40]], [700, [2, 5, 18]], [1e9, [2, 5, 18]],
  ];
  // 3x5 digits for the ruler. Each glyph is five rows of three bits.
  const GLYPHS = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    K: '101101110101101', '.': '000000000000010', F: '111100110100100', T: '111010010010010',
  };
  const BEE = [ // b body, k outline and stripes, w wing, h head, e eye
    '....kk....kk....',
    '...kwwk..kwwk...',
    '...kwwwkkwwwk...',
    '....kwwwwwwk....',
    '..kkkkkkkkkkkk..',
    '.kbbkkbbkkbhhhk.',
    'kkbbkkbbkkbhehk.',
    'kkbbkkbbkkbhhhk.',
    '.kbbkkbbkkbhhhk.',
    '..kkkkkkkkkkkk..',
    '....k..k..k.....',
  ];
  const MINI = ['.w.w.', 'kbkbk', 'kbkbk', '.k.k.'];
  const PLANE = ['......w.......', 'ww...www......', 'wwwwwwwwwwwww.', '.wwwwwwwwwwwww', '......ww......'];

  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }

  function skyAt(score) {
    let i = 0;
    while (SKY[i + 1][0] < score) i++;
    const a = SKY[i];
    const b = SKY[i + 1];
    const t = Math.max(0, Math.min(1, (score - a[0]) / (b[0] - a[0])));
    const c = [0, 1, 2].map((k) => Math.round((a[1][k] + (b[1][k] - a[1][k]) * t) / 6) * 6);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function compactFeet(ft) {
    if (ft < 1000) return String(ft < 100 ? ft : Math.round(ft / 10) * 10);
    if (ft < 10000) return (ft / 1000).toFixed(1) + 'K';
    return Math.round(ft / 1000) + 'K';
  }

  function create(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const feetFor = opts.altitudeFeet;
    const still = () => !!opts.reducedMotion();
    let W = 160;
    let H = 200;
    let S = 3;
    let PPP = 16; // art pixels per point, set from the screen height in resize()
    let cam = 0;
    let anchor = 0.6;
    let mood = 'idle';
    let followers = 0;
    let particles = [];
    let dim = 0;

    function resize() {
      const w = root.innerWidth;
      const h = root.innerHeight;
      S = w < 560 ? 3 : w < 1100 ? 4 : 5;
      W = Math.ceil(w / S);
      H = Math.ceil(h / S);
      PPP = (h * SCREENS_PER_POINT) / S;
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = W * S + 'px';
      canvas.style.height = H * S + 'px';
    }

    const anchorRow = () => Math.round(H * anchor);
    const rowOf = (score) => anchorRow() - Math.round((score - cam) * PPP);
    const scoreOf = (row) => cam + (anchorRow() - row) / PPP;

    function px(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }

    function sprite(rows, x, y, palette, flip) {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          const color = palette[row[c]];
          if (color) px(x + (flip ? row.length - 1 - c : c), y + r, 1, 1, color);
        }
      }
    }

    function text(str, right, y, color) {
      let x = right;
      for (let i = str.length - 1; i >= 0; i--) {
        const g = GLYPHS[str[i]];
        x -= 4;
        if (!g) continue;
        for (let b = 0; b < 15; b++) if (g[b] === '1') px(x + (b % 3), y + Math.floor(b / 3), 1, 1, color);
      }
    }

    function drawSky() {
      for (let y = 0; y < H; y += 2) px(0, y, W, 2, skyAt(scoreOf(y)));
    }

    function drawStars(t) {
      const top = scoreOf(0);
      if (top < 330) return;
      const cell = 7;
      const firstRow = Math.floor((cam * PPP - (H - anchorRow())) / cell) - 1;
      const rows = Math.ceil(H / cell) + 2;
      for (let r = firstRow; r < firstRow + rows; r++) {
        for (let c = 0; c < W / cell + 1; c++) {
          const h = hash(r * 4099 + c * 131 + 7);
          if (h > 0.16) continue;
          const worldY = r * cell + Math.floor(hash(r * 31 + c * 977) * cell);
          const score = worldY / PPP;
          const fade = Math.max(0, Math.min(1, (score - 340) / 160));
          const twinkle = still() ? 1 : 0.65 + 0.35 * Math.sin(t / 400 + h * 400);
          const a = fade * twinkle;
          if (a < 0.08) continue;
          const y = anchorRow() - Math.round(worldY - cam * PPP);
          const x = c * cell + Math.floor(hash(r * 17 + c * 53) * cell);
          ctx.globalAlpha = a;
          px(x, y, 1, 1, h < 0.02 ? '#ffe9a8' : '#ffffff');
          if (h < 0.012) {
            px(x - 1, y, 3, 1, '#ffffff');
            px(x, y - 1, 1, 3, '#ffffff');
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawSun() {
      const y = rowOf(56);
      if (y < -20 || y > H + 20) return;
      const x = Math.round(W * 0.2);
      for (let dy = -7; dy <= 7; dy++) {
        const half = Math.round(Math.sqrt(49 - dy * dy));
        px(x - half, y + dy, half * 2 + 1, 1, Math.abs(dy) < 5 ? '#fff4c2' : '#ffe58a');
      }
      [[-12, 0], [12, 0], [0, -12], [0, 12], [-9, -9], [9, -9], [-9, 9], [9, 9]].forEach((d) => px(x + d[0], y + d[1], 2, 2, '#ffe58a'));
    }

    // Distant Atlanta. Heights are in points of score; the tallest spire tops out at 70,
    // which is 1,023 ft on the altitude curve.
    const TOWERS = [
      [0.02, 9, 31, 0], [0.11, 7, 44, 1], [0.19, 10, 27, 0], [0.47, 8, 38, 1], [0.56, 11, 52, 0],
      [0.66, 9, 61, 1], [0.76, 12, 64, 0], [0.88, 8, 41, 1], [0.95, 9, 33, 0],
    ];
    function drawSkyline() {
      if (scoreOf(H) > 75) return;
      const ground = rowOf(0);
      TOWERS.forEach((b, i) => {
        const x = Math.round(b[0] * W);
        const top = rowOf(b[2]);
        const color = b[3] ? '#a3c6e8' : '#b4d3ef';
        px(x, top, b[1], ground - top, color);
        for (let wy = top + 3; wy < ground - 2; wy += 4) {
          for (let wx = x + 1; wx < x + b[1] - 1; wx += 3) if (hash(i * 911 + wy * 13 + wx) < 0.4) px(wx, wy, 1, 2, '#e6f3ff');
        }
        if (i === 6) { // the tall one: stepped crown and a spire
          px(x + 2, top - 6, b[1] - 4, 6, color);
          px(x + 4, top - 11, b[1] - 8, 5, color);
          px(x + 5, rowOf(70), 2, top - 11 - rowOf(70), '#c9a94d');
        }
        if (i === 5) px(x + 1, top - 2, b[1] - 2, 2, '#8fb4da'); // the round hotel's cap
      });
    }

    function drawCampus() {
      const ground = rowOf(0);
      if (ground < -80) return;
      // trees behind
      for (let i = 0; i < W / 9 + 1; i++) {
        const h = 8 + Math.floor(hash(i * 77) * 9);
        const x = i * 9 - 3;
        px(x, ground - h, 9, h, hash(i * 3) < 0.5 ? '#2f7a3b' : '#3a8a46');
        px(x + 1, ground - h - 2, 7, 2, '#3a8a46');
        px(x + 3, ground - h - 4, 3, 2, '#3a8a46');
      }
      // brick halls
      const halls = [[0.02, 24, 15], [0.5, 20, 13], [0.86, 22, 17]];
      halls.forEach((b) => {
        const x = Math.round(b[0] * W);
        px(x, ground - b[2], b[1], b[2], '#8d3f2d');
        px(x - 1, ground - b[2] - 2, b[1] + 2, 2, '#5d2a1f');
        for (let wx = x + 3; wx < x + b[1] - 3; wx += 6) {
          px(wx, ground - b[2] + 4, 3, 4, '#f3ead2');
          if (b[2] > 15) px(wx, ground - 7, 3, 4, '#f3ead2');
        }
      });
      // a brick tower with a pointed roof and a clock: a generic college tower, no lettering
      const tx = Math.round(W * 0.7);
      const body = rowOf(15);
      px(tx, body, 13, ground - body, '#9a4632');
      px(tx + 1, body, 2, ground - body, '#b45a43');
      for (let i = 0; i < 7; i++) px(tx - 1 + i, body - 2 - i * 2, 15 - i * 2, 2, '#4a2118');
      px(tx + 6, body - 18, 1, 4, '#c9a94d');
      px(tx + 4, body + 4, 5, 5, '#f3ead2');
      px(tx + 6, body + 5, 1, 2, '#4a2118');
      px(tx + 6, body + 6, 2, 1, '#4a2118');
      px(tx + 5, ground - 8, 3, 8, '#4a2118');
      // lawn
      px(0, ground, W, H, '#4f9a55');
      px(0, ground, W, 2, '#6fbf6a');
      for (let i = 0; i < W; i += 5) if (hash(i * 19) < 0.5) px(i, ground + 4 + Math.floor(hash(i) * 12), 2, 1, '#3f8748');
      px(Math.round(W * 0.38), ground + 2, 10, H, '#e6d9b8');
    }

    function cloud(x, y, size, shade) {
      const w = 14 + size * 6;
      px(x, y, w, 4, '#ffffff');
      px(x + 3, y - 3, w - 8, 3, '#ffffff');
      px(x + 6, y - 5, Math.max(4, w - 16), 2, '#ffffff');
      px(x + 1, y + 4, w - 2, 1, shade);
      px(x + 3, y + 5, w - 8, 1, shade);
    }

    function drawClouds(t) {
      const lo = scoreOf(H) - 6;
      const hi = scoreOf(0) + 6;
      for (let i = 0; i < 22; i++) {
        const s = 86 + hash(i * 53 + 1) * 70; // the low-cloud band
        if (s < lo || s > hi) continue;
        const drift = still() ? 0 : (t / 1000) * (1.5 + hash(i) * 2.5);
        const span = W + 60;
        const x = ((hash(i * 7) * span + drift) % span) - 40;
        cloud(Math.round(x), rowOf(s), Math.floor(hash(i * 3) * 3), '#cfe4f7');
      }
      for (let i = 0; i < 26; i++) { // cirrus: thin streaks of ice
        const s = 208 + hash(i * 91 + 5) * 92;
        if (s < lo || s > hi) continue;
        const x = Math.round(hash(i * 13) * (W + 30)) - 20;
        const len = 14 + Math.floor(hash(i * 5) * 22);
        const y = rowOf(s);
        ctx.globalAlpha = 0.75;
        for (let k = 0; k < len; k += 1) if ((k + i) % 5 !== 0) px(x + k, y - Math.floor(k / 9), 1, 1, '#e8f4ff');
        px(x + 4, y + 1, Math.floor(len / 2), 1, '#e8f4ff');
        ctx.globalAlpha = 1;
      }
    }

    function drawTraffic(t) {
      const span = W + 60;
      [[283, 9, 0.1, false], [290, 6, 0.6, true]].forEach((p, i) => {
        const y = rowOf(p[0]);
        if (y < -10 || y > H + 10) return;
        const move = still() ? 0 : (t / 1000) * p[1];
        let x = ((p[2] * span + move) % span) - 30;
        if (p[3]) x = W - x;
        sprite(PLANE, Math.round(x), y, { w: '#f4f6f8' }, p[3]);
        ctx.globalAlpha = 0.5;
        px(p[3] ? Math.round(x) + 14 : Math.round(x) - 22, y + 2, 22, 1, '#ffffff'); // contrail
        ctx.globalAlpha = 1;
      });
      const by = rowOf(435); // a weather balloon
      if (by > -20 && by < H + 20) {
        const bx = Math.round(W * 0.24);
        for (let dy = -5; dy <= 5; dy++) {
          const half = Math.round(Math.sqrt(25 - dy * dy));
          px(bx - half, by + dy, half * 2 + 1, 1, '#eef2f6');
        }
        px(bx, by + 6, 1, 7, '#c9d2dc');
        px(bx - 1, by + 13, 3, 2, '#c9a94d');
      }
      const sy = rowOf(662); // a satellite, most of the way to space
      if (sy > -10 && sy < H + 10) {
        const sx = Math.round(((still() ? 0.3 : (t / 9000) % 1) * (W + 40)) - 20);
        px(sx, sy, 4, 3, '#d9dee5');
        px(sx - 6, sy + 1, 5, 1, '#5b8fd6');
        px(sx + 5, sy + 1, 5, 1, '#5b8fd6');
      }
      const edge = rowOf(700); // the edge of space
      if (edge > -4 && edge < H + 4) for (let x = 0; x < W; x += 4) px(x, edge, 2, 1, '#7fb6ff');
    }

    function drawRuler() {
      const x = W - 3;
      px(W - 27, 0, 27, H, '#0b2a4a'); // opaque, so clouds and props never show through
      px(x, 0, 1, H, '#e8f1fb');
      const from = Math.max(0, Math.floor(scoreOf(H) / 10) * 10);
      const to = Math.ceil(scoreOf(0) / 10) * 10;
      for (let s = from; s <= to; s += 10) {
        const y = rowOf(s);
        const major = s % 50 === 0;
        px(x - (major ? 6 : 3), y, major ? 6 : 3, 1, '#e8f1fb');
        if (major) text(compactFeet(feetFor(s)), x - 7, y - 2, '#ffffff');
      }
    }

    function drawBees(t) {
      const gold = mood === 'gold';
      const palette = { b: gold ? '#ffd23f' : '#e0b93a', k: '#00213d', w: gold ? '#fff7d1' : '#dff0ff', h: gold ? '#fff0a8' : '#f6dc7a', e: '#00213d' };
      const bob = still() ? 0 : Math.round(Math.sin(t / 380) * 2);
      const mx = Math.round(W * (W < 150 ? 0.28 : 0.36)); // further left on phones, clear of the tier labels
      const my = anchorRow() - 5 + (mood === 'sad' ? 3 : bob);
      for (let i = 0; i < followers; i++) {
        const ph = still() ? i : t / 500 + i * 1.7;
        const fx = mx - 9 - i * 6 + Math.round(Math.sin(ph) * 2);
        const fy = my + 8 + ((i * 5) % 9) + Math.round(Math.cos(ph * 1.3) * 2);
        sprite(MINI, fx, fy, palette);
      }
      const flap = !still() && Math.floor(t / (mood === 'happy' || gold ? 50 : 90)) % 2 === 0;
      const rows = mood === 'sad' || flap ? BEE.map((r, i) => (i < 4 ? '................' : r)) : BEE;
      if (gold) {
        ctx.globalAlpha = 0.35;
        px(mx - 3, my - 3, 22, 16, '#ffd23f');
        ctx.globalAlpha = 1;
      }
      sprite(rows, mx, my, palette);
      if (mood === 'sad' || flap) { // wings folded low
        px(mx + 2, my + 3, 5, 1, palette.k);
        px(mx + 8, my + 3, 5, 1, palette.k);
        px(mx + 3, my + 2, 3, 1, palette.w);
        px(mx + 9, my + 2, 3, 1, palette.w);
      }
      particles = particles.filter((p) => t - p.born < p.life);
      particles.forEach((p) => {
        const age = (t - p.born) / 1000;
        const x = mx + 8 + p.vx * age;
        const y = my + 4 + p.vy * age + 14 * age * age;
        if (p.bee) sprite(MINI, Math.round(x), Math.round(y), { b: '#ffd23f', k: '#00213d', w: '#fff7d1' });
        else px(x, y, 1, 1, p.color);
      });
    }

    function draw(t) {
      drawSky();
      drawStars(t);
      drawSun();
      drawSkyline();
      drawClouds(t);
      drawTraffic(t);
      drawCampus();
      drawBees(t);
      drawRuler(); // always last: nothing in the world may cover the ruler
      if (dim) {
        ctx.globalAlpha = dim;
        px(0, 0, W, H, '#05080f');
        ctx.globalAlpha = 1;
      }
    }

    resize();
    return {
      resize,
      draw,
      setCamera(score) { cam = score; },
      getCamera() { return cam; },
      setAnchor(frac) { anchor = frac; },
      setMood(m) { mood = m; },
      setFollowers(n) { followers = Math.max(0, Math.min(6, n)); },
      setDim(a) { dim = a; },
      burst(t) {
        for (let i = 0; i < 46; i++) {
          const a = hash(i * 37 + 3) * Math.PI * 2;
          const sp = 18 + hash(i * 11) * 60;
          particles.push({ born: t, life: 900 + hash(i) * 900, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, bee: i % 3 === 0, color: i % 2 ? '#ffd23f' : '#fff7d1' });
        }
      },
      // Where a score sits on screen, in CSS pixels from the top of the viewport.
      cssY(score) { return rowOf(score) * S; },
      cssPerPoint() { return PPP * S; },
      rulerWidth() { return 27 * S; },
      skyColor: skyAt,
      size() { return { W, H, S }; },
    };
  }

  // Draws a sprite into any 2D context. Used for the tier artwork on the reveal card.
  function stamp(ctx, rows, x, y, palette) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const color = palette[rows[r][c]];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x + c, y + r, 1, 1);
        }
      }
    }
  }

  root.SwarmScene = { create, stamp, BEE, MINI, SCREENS_PER_POINT };
})(typeof self !== 'undefined' ? self : this);
