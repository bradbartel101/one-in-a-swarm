/* One in a Swarm — the world. One very tall pixel-art scene drawn in code on a low-resolution
   canvas that the browser scales up without smoothing. The camera is one number: the score
   that sits on the anchor row. The world is measured in points, never in feet; feet only
   appear on the ruler, through the altitudeFeet() curve passed in from core.js.
   Nothing here knows the game rules. All artwork is original and made of rectangles. */
(function (root) {
  'use strict';

  // One point of score is a fixed slice of the screen: 6% of its height. A 10-point answer
  // climbs 60% of a screen and a 100-point answer six screens, at any altitude.
  const SCREENS_PER_POINT = 0.06;
  // Depth. A layer's factor is how fast it scrolls relative to the camera.
  const LAYERS = { far: 0.3, mid: 0.6, near: 1, front: 1.4 };
  const ZONES = [
    [0, 'campus', 'Campus'], [40, 'midtown', 'Midtown skyline'], [110, 'clouds', 'Low clouds'], [200, 'weather', 'Weather'],
    [300, 'highsky', 'High sky'], [420, 'stratosphere', 'Stratosphere'], [550, 'space', 'Space'], [650, 'moon', 'The Moon'],
  ];
  const SKY = [
    [-20, [208, 238, 255]], [0, [178, 224, 255]], [40, [142, 206, 252]], [110, [112, 186, 246]], [200, [84, 150, 226]],
    [300, [50, 108, 204]], [420, [22, 56, 132]], [500, [10, 26, 70]], [550, [4, 9, 28]], [650, [1, 2, 10]], [1e9, [1, 2, 10]],
  ];
  // 3x5 glyphs for the ruler.
  const GLYPHS = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    K: '101101110101101', '.': '000000000000010', M: '101111111101101', I: '111010010010111',
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
  const MINI = ['.ww.ww.', '.kkkkk.', 'kbkbkhk', 'kbkbkhk', '.kkkkk.'];
  const PLANE = ['......w.......', 'ww...www......', 'wwwwwwwwwwwww.', '.wwwwwwwwwwwww', '......ww......'];
  const CLOUDS = [ // [dx, dy, w, h, shade?]
    [[0, 4, 26, 5], [4, 1, 16, 4], [9, -2, 8, 3], [2, 9, 22, 1, 1]],
    [[0, 3, 40, 4], [6, 0, 18, 3], [22, 1, 12, 2], [3, 7, 34, 1, 1]],
    [[0, 8, 20, 5], [3, 4, 14, 4], [6, 0, 9, 4], [2, 13, 16, 1, 1]],
  ];

  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  function zoneAt(score) {
    let z = ZONES[0];
    ZONES.forEach((c) => { if (score >= c[0]) z = c; });
    return { id: z[1], name: z[2], from: z[0] };
  }

  function skyAt(score) {
    let i = 0;
    while (SKY[i + 1][0] < score) i++;
    const a = SKY[i];
    const b = SKY[i + 1];
    const t = clamp((score - a[0]) / (b[0] - a[0]));
    const c = [0, 1, 2].map((k) => Math.round((a[1][k] + (b[1][k] - a[1][k]) * t) / 4) * 4);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function compact(ft) {
    if (ft < 1000) return String(ft < 100 ? ft : Math.round(ft / 10) * 10);
    if (ft < 10000) return (ft / 1000).toFixed(1) + 'K';
    if (ft < 1000000) return Math.round(ft / 1000) + 'K';
    const mi = ft / 5280;
    if (mi < 1000) return Math.round(mi) + 'MI';
    if (mi < 1000000) return Math.round(mi / 1000) + 'KMI';
    return '';
  }

  function create(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const feetFor = opts.altitudeFeet;
    const at = opts.scoreForFeet;
    const still = () => !!opts.reducedMotion();
    let W = 125;
    let H = 270;
    let S = 3;
    let PPP = 16; // art pixels per point, set from the screen height in resize()
    let cam = 0;
    let anchor = 0.6;
    let mood = 'idle';
    let gold = false;
    let night = false;
    let followers = 0;
    let particles = [];
    let dim = 0;
    let trick = null; // { name, start, ms }
    let popped = false;
    let flagUp = false;
    const boxes = {}; // hit boxes in art pixels, refreshed every frame
    const seen = new Set();

    // The twelve sightings. Each sits at one place in the world, so a flight passes it once.
    // `x` is a fraction of the width; real altitudes go through the same curve as the ruler.
    const SIGHTINGS = [
      { id: 'car', score: 0.4, x: 0.3, caption: 'The old gold jalopy, out for a lap.' },
      { id: 'squirrel', score: 0.6, x: 0.1, caption: 'Campus squirrels remain undefeated.' },
      { id: 'washer', score: at(620), x: 0.7, caption: 'A window washer waves back.' },
      { id: 'balloon', score: at(2400), x: 0.62, caption: 'Sorry, Athens.', hidden: true },
      { id: 'geese', score: at(3500), x: 0.5, caption: 'One of them had other plans.' },
      { id: 'exam', score: at(8000), x: 0.58, caption: 'CS 1331 · 34/100' },
      { id: 'jet', score: at(18000), x: 0.5, caption: "Climbing out of the world's busiest airport." },
      { id: 'cap', score: at(27000), x: 0.64, caption: 'A cap from commencement. It never came down.' },
      { id: 'wballoon', score: at(95000), x: 0.62, caption: 'A weather balloon. The tag says: lost & found.' },
      { id: 'astronaut', score: at(300 * 5280), x: 0.6, caption: 'Tech alumni have flown up here. This one waves.' },
      { id: 'satellite', score: at(22236 * 5280), x: 0.56, caption: 'Somebody insisted on honeycomb solar panels.' },
      { id: 'flag', score: 700, x: 0.5, caption: 'Planted: gold and navy, 238,855 miles from campus.', hidden: true },
    ];

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
      ctx.imageSmoothingEnabled = false;
    }

    const anchorRow = () => Math.round(H * anchor);
    const rowOf = (score, f) => anchorRow() - Math.round((score - cam) * PPP * (f || 1));
    const scoreOf = (row) => cam + (anchorRow() - row) / PPP;
    const onScreen = (y, pad) => y > -(pad || 30) && y < H + (pad || 30);
    const beeX = () => Math.round(W * (W < 150 ? 0.28 : 0.36));

    function px(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
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

    function disc(cx, cy, r, color) {
      for (let dy = -r; dy <= r; dy++) {
        const half = Math.round(Math.sqrt(r * r - dy * dy));
        px(cx - half, cy + dy, half * 2 + 1, 1, color);
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

    /* ----- sky ----- */

    function drawSky() {
      for (let y = 0; y < H; y += 2) {
        if (night) {
          const t = y / H;
          px(0, y, W, 2, 'rgb(' + Math.round(8 + 20 * t) + ',' + Math.round(20 + 44 * t) + ',' + Math.round(58 + 70 * t) + ')');
        } else {
          px(0, y, W, 2, skyAt(scoreOf(y)));
        }
      }
    }

    function drawStars(t) {
      const strength = night ? 0.9 : clamp((cam - 400) / 130);
      if (strength <= 0) return;
      const cell = 9;
      const drift = cam * PPP * 0.12; // the farthest layer of all
      const first = Math.floor(drift / cell) - 1;
      for (let r = first; r < first + H / cell + 3; r++) {
        for (let c = 0; c < W / cell + 1; c++) {
          const h = hash(r * 4099 + c * 131 + 7);
          if (h > 0.22) continue;
          const y = Math.round(H - (r * cell - drift) - hash(r * 31 + c * 977) * cell);
          const x = c * cell + Math.floor(hash(r * 17 + c * 53) * cell);
          const twinkle = still() ? 1 : 0.6 + 0.4 * Math.sin(t / 420 + h * 500);
          ctx.globalAlpha = strength * twinkle;
          px(x, y, 1, 1, h < 0.03 ? '#ffe9a8' : '#ffffff');
          if (h < 0.015) {
            px(x - 1, y, 3, 1, '#ffffff');
            px(x, y - 1, 1, 3, '#ffffff');
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawSun() {
      const x = Math.round(W * (night ? 0.2 : 0.62));
      if (night) { // a crescent over the title screen in the small hours
        disc(x, Math.round(H * 0.2), 8, '#f4f0d8');
        disc(x + 4, Math.round(H * 0.2) - 2, 7, 'rgb(12,30,70)');
        return;
      }
      if (cam > 470) return;
      // The sun sinks toward the horizon as the swarm climbs, and warms as it goes.
      const low = clamp(cam / 420);
      const y = Math.round(lerp(H * 0.16, H * 0.66, low));
      ctx.globalAlpha = 1 - clamp((cam - 430) / 40);
      const core = low > 0.7 ? '#ffd9a0' : '#fff4c2';
      const edge = low > 0.7 ? '#ffb070' : '#ffe58a';
      disc(x, y, 7, edge);
      disc(x, y, 5, core);
      [[-12, 0], [12, 0], [0, -12], [0, 12], [-9, -9], [9, -9], [-9, 9], [9, 9]].forEach((d) => px(x + d[0], y + d[1], 2, 2, edge));
      ctx.globalAlpha = 1;
    }

    /* ----- campus, 0 to 40 ----- */

    function drawCampus(t) {
      const g = rowOf(0);
      if (g < -150) return;
      const gf = rowOf(0, LAYERS.far);
      const gm = rowOf(0, LAYERS.mid);
      // far: a hint of the city on the horizon, then a pale tree line
      for (let i = 0; i < W / 9 + 1; i++) {
        const h = 5 + Math.floor(hash(i * 71 + 3) * 16);
        if (hash(i * 13) < 0.6) px(i * 9, gf - h, 5, h, '#b4d3ef');
      }
      px(0, gf, W, g - gf + 2, '#86c08e');
      for (let i = 0; i < W / 7 + 1; i++) px(i * 7 - 2, gf - 2 - Math.floor(hash(i * 5) * 3), 7, 4, '#86c08e');
      // mid: a row of brick halls among darker trees
      px(0, gm, W, g - gm + 2, '#5aa862');
      for (let i = 0; i < W / 8 + 1; i++) {
        const h = 5 + Math.floor(hash(i * 77) * 7);
        px(i * 8 - 3, gm - h, 8, h + 1, hash(i * 3) < 0.5 ? '#3f8f4c' : '#4a9a56');
      }
      [[0.06, 22, 13], [0.44, 26, 16], [0.8, 20, 12]].forEach((b) => {
        const x = Math.round(b[0] * W);
        px(x, gm - b[2], b[1], b[2] + 1, '#a65a45');
        px(x - 1, gm - b[2] - 2, b[1] + 2, 2, '#6d3527');
        for (let wx = x + 3; wx < x + b[1] - 3; wx += 5) px(wx, gm - b[2] + 4, 2, 3, night ? '#ffe9a8' : '#f3ead2');
      });
      // near: lawn, paths, trees, two halls, the clock tower
      px(0, g, W, H, '#4f9a55');
      px(0, g, W, 2, '#6fbf6a');
      for (let i = 0; i < W; i += 5) if (hash(i * 19) < 0.5) px(i, g + 16 + Math.floor(hash(i) * 30), 2, 1, '#3f8748');
      px(0, g + 8, W, 5, '#e6d9b8'); // the cross path
      px(Math.round(W * 0.46), g + 13, 9, H, '#e6d9b8'); // the path toward you
      [[0.0, 20, 15], [0.52, 16, 12]].forEach((b) => {
        const x = Math.round(b[0] * W);
        px(x, g - b[2], b[1], b[2], '#8d3f2d');
        px(x - 1, g - b[2] - 2, b[1] + 2, 2, '#5d2a1f');
        for (let wx = x + 3; wx < x + b[1] - 3; wx += 6) px(wx, g - b[2] + 4, 3, 4, night ? '#ffe9a8' : '#f3ead2');
      });
      [0.22, 0.36, 0.94].forEach((fx, i) => { // trees
        const x = Math.round(fx * W);
        px(x + 2, g - 6, 2, 6, '#5b3b1d');
        disc(x + 3, g - 11, 6, i % 2 ? '#2f7a3b' : '#3a8a46');
        px(x, g - 13, 3, 2, '#4a9a56');
      });
      // a brick clock tower with a pointed roof: a generic college tower, no lettering
      const tx = Math.round(W * 0.7);
      const top = g - 62;
      px(tx, top, 15, 62, '#9a4632');
      px(tx + 1, top, 2, 62, '#b45a43');
      px(tx + 12, top, 3, 62, '#7d3626');
      for (let i = 0; i < 8; i++) px(tx - 1 + i, top - 2 - i * 2, 17 - i * 2, 2, '#4a2118');
      px(tx + 7, top - 22, 1, 5, '#c9a94d');
      disc(tx + 7, top + 9, 4, '#f3ead2');
      px(tx + 7, top + 6, 1, 4, '#4a2118');
      px(tx + 7, top + 9, 3, 1, '#4a2118');
      for (let wy = top + 20; wy < g - 14; wy += 10) px(tx + 6, wy, 3, 5, night ? '#ffe9a8' : '#4a2118');
      px(tx + 5, g - 9, 5, 9, '#4a2118');
      boxes.tower = { x: tx - 3, y: top - 24, w: 21, h: 86 };
      // people on the path
      for (let i = 0; i < 4; i++) {
        const dir = i % 2 ? 1 : -1;
        const span = W + 20;
        const x = ((hash(i * 91) * span + (still() ? 0 : (t / 1000) * (3 + i) * dir)) % span + span) % span - 10;
        const step = still() ? 0 : Math.floor(t / 220 + i) % 2;
        px(x, g + 3, 2, 2, '#f1c9a0');
        px(x, g + 5, 2, 3, ['#003057', '#b3a369', '#a3231f', '#f4f1e6'][i]);
        px(x + step - (step ? 0 : 0), g + 8, 1, 2, '#2b2f36');
        px(x + 1 - step + (step ? 0 : 0), g + 8, 1, 2, '#2b2f36');
      }
    }

    /* ----- midtown skyline, 40 to 110 ----- */

    const TALL = at(1023); // the tallest spire tops out at its real height
    const TOWERS = [ // x, width, top (points), layer, extra
      [0.1, 8, 70, 'far'], [0.3, 7, 96, 'far'], [0.47, 9, 60, 'far'], [0.6, 7, 84, 'far'], [0.9, 8, 74, 'far'],
      [0.2, 12, 52, 'mid'], [0.4, 14, 90, 'mid'], [0.53, 11, 66, 'mid'], [0.8, 13, 99, 'mid'],
      [0.0, 17, 58, 'near'], [0.66, 20, TALL, 'near', 'spire'], [0.86, 16, 78, 'near', 'crane'],
    ];
    const TOWER_COLORS = { far: ['#bcd8f1', '#d6e8f8'], mid: ['#93b8de', '#cfe3f6'], near: ['#5d8cc0', '#ffe9a8'] };

    function drawTowers(layer, t) {
      if (cam > 125) return;
      // From the lawn the city is only a line on the horizon. It comes up out of the haze as
      // the swarm leaves the treetops, the far towers first.
      const rise = smooth((cam - (layer === 'far' ? 8 : layer === 'mid' ? 14 : 20)) / 16);
      if (rise <= 0) return;
      ctx.globalAlpha = rise;
      TOWERS.forEach((b, i) => {
        if (b[3] !== layer) return;
        const f = LAYERS[layer];
        const x = Math.round(b[0] * W);
        const top = rowOf(b[2], f);
        const bottom = Math.min(H, rowOf(0, f) + 2);
        if (top > H || bottom < 0) return;
        const color = TOWER_COLORS[layer];
        px(x, top, b[1], bottom - top, color[0]);
        if (layer === 'near') px(x + b[1] - 3, top, 3, bottom - top, '#4c79aa');
        const pitch = layer === 'near' ? 6 : 5;
        const first = Math.max(0, Math.ceil((-top - 4) / pitch));
        for (let k = first; top + 4 + k * pitch < bottom - 2; k++) {
          const wy = top + 4 + k * pitch;
          for (let wx = x + 2; wx < x + b[1] - 2; wx += 3) {
            if (hash(i * 911 + k * 13 + wx * 7) < (layer === 'near' ? 0.55 : 0.4)) px(wx, wy, layer === 'far' ? 1 : 2, layer === 'near' ? 3 : 2, color[1]);
          }
        }
        if (b[4] === 'spire') { // a stepped crown and a gold spire
          px(x + 3, top - 7, b[1] - 6, 7, color[0]);
          px(x + 6, top - 13, b[1] - 12, 6, color[0]);
          px(x + 9, top - 30, 2, 17, '#c9a94d');
        }
        if (b[4] === 'crane') { // a tower crane on the roof
          const cx = x + 4;
          px(cx, top - 30, 2, 30, '#e6a23c');
          px(cx - 10, top - 30, 40, 2, '#e6a23c');
          px(cx - 10, top - 28, 5, 4, '#7a7f88');
          const hook = still() ? 16 : 14 + Math.round(Math.sin(t / 1500) * 4);
          px(cx + 24, top - 28, 1, hook, '#2b2f36');
          px(cx + 23, top - 28 + hook, 3, 2, '#2b2f36');
        }
      });
      ctx.globalAlpha = 1;
    }

    function drawTrain(t) {
      const y = rowOf(48);
      if (!onScreen(y, 20)) return;
      px(0, y, W, 2, '#6b7785'); // the viaduct
      for (let x = 6; x < W; x += 28) px(x, y + 2, 2, 12, '#7f8a97');
      const span = W + 90;
      const head = W - (((still() ? 40 : (t / 1000) * 22) % span) - 10);
      for (let c = 0; c < 4; c++) {
        const x = head + c * 16;
        px(x, y - 6, 15, 6, '#e3e9f0');
        px(x, y - 3, 15, 1, '#35c29f');
        for (let wx = x + 2; wx < x + 13; wx += 4) px(wx, y - 5, 2, 2, '#35506e');
      }
    }

    /* ----- clouds and weather, 110 to 300 ----- */

    function cloud(shape, x, y, scale, body, shade) {
      CLOUDS[shape].forEach((r) => px(x + r[0] * scale, y + r[1] * scale, r[2] * scale, Math.max(1, r[3] * scale), r[4] ? shade : body));
    }

    function drawClouds(layer, t) {
      const f = LAYERS[layer];
      const lo = cam - (anchorRow() + 40) / (PPP * f) - 4;
      const hi = cam + (H - anchorRow() + 40) / (PPP * f) + 4;
      const scale = layer === 'far' ? 0.6 : layer === 'mid' ? 1 : 1.5;
      const body = layer === 'far' ? '#d8e9fa' : layer === 'mid' ? '#edf5ff' : '#ffffff';
      const shade = layer === 'far' ? '#c2d8ef' : '#cfe1f4';
      const count = layer === 'far' ? 26 : layer === 'mid' ? 20 : 12;
      const seed = layer.length * 1000;
      for (let i = 0; i < count; i++) {
        const s = 108 + hash(seed + i * 53) * 200; // low clouds thin out into the weather zone
        if (s > 215 && hash(seed + i) < 0.5) continue;
        if (s < lo || s > hi) continue;
        const span = W + 90;
        const drift = still() ? 0 : (t / 1000) * (1 + hash(seed + i * 3) * 2.5) * f;
        const x = ((hash(seed + i * 7) * span + drift) % span) - 60;
        cloud(i % 3, Math.round(x), rowOf(s, f), scale, body, shade);
      }
    }

    function drawThunderheads(t) {
      [[214, 0.04, 0], [246, 0.5, 1], [276, 0.2, 2], [292, 0.62, 3]].forEach((c) => {
        const y = rowOf(c[0], LAYERS.mid);
        if (!onScreen(y, 70)) return;
        const x = Math.round(c[1] * W);
        const period = 2700 + c[2] * 800;
        const flash = !still() && t % period < 150 && hash(Math.floor(t / period) * 7 + c[2]) < 0.7;
        const body = flash ? '#f4f7ff' : '#9aa7ba';
        px(x - 6, y - 40, 60, 5, flash ? '#ffffff' : '#d3dbe7'); // the anvil
        px(x + 2, y - 35, 44, 6, body);
        px(x + 8, y - 29, 32, 8, body);
        px(x + 4, y - 21, 40, 9, body);
        px(x, y - 12, 48, 8, flash ? '#dfe6f2' : '#7d8a9e');
        px(x + 2, y - 4, 44, 4, '#56637a'); // a dark, flat base
        for (let r = 0; r < 9; r++) { // rain
          const rx = x + 5 + r * 4;
          const ry = y + ((still() ? r * 3 : Math.floor(t / 60) + r * 5) % 14);
          px(rx, ry, 1, 2, '#8fb4e0');
        }
        if (flash) [[20, 0], [18, 4], [22, 8], [19, 12], [23, 16], [21, 20]].forEach((p) => px(x + p[0], y + p[1], 2, 4, '#fff7c2'));
      });
    }

    function drawBirds(t) {
      [[128, 0.2, 14], [156, 0.6, -11], [181, 0.35, 9]].forEach((b, n) => {
        const y = rowOf(b[0]);
        if (!onScreen(y)) return;
        const span = W + 60;
        const x0 = (((b[1] * span + (still() ? 0 : (t / 1000) * b[2])) % span) + span) % span - 30;
        for (let i = 0; i < 4; i++) {
          const x = Math.round(x0 + i * 7);
          const yy = y + (i % 2) * 3;
          const up = !still() && Math.floor(t / 180 + i + n) % 2;
          px(x, yy + (up ? 0 : 1), 2, 1, '#2b3b55');
          px(x + 2, yy + (up ? 1 : 0), 1, 1, '#2b3b55');
          px(x + 3, yy + (up ? 0 : 1), 2, 1, '#2b3b55');
        }
      });
    }

    // Things in the far distance below: hills as the city falls away, then a floor of cloud.
    function drawHorizon() {
      const rise = smooth((cam - 98) / 30) - smooth((cam - 185) / 45);
      if (rise > 0.01) {
        const top = H - Math.round(H * 0.2 * rise);
        for (let x = 0; x < W; x += 2) {
          const a = top + Math.round(Math.sin(x / 17 + 1) * 4 + Math.sin(x / 7) * 2);
          const b = top + 7 + Math.round(Math.sin(x / 23 + 4) * 5);
          px(x, a, 2, H - a, '#9dbfe2');
          px(x, b, 2, H - b, '#7ea7d2');
        }
      }
      const deck = smooth((cam - 195) / 40) - smooth((cam - 425) / 50);
      if (deck > 0.01) {
        const top = H - Math.round(H * 0.16 * deck);
        for (let x = 0; x < W; x += 3) {
          const y = top + Math.round(Math.sin(x / 9 + cam / 40) * 2 + Math.sin(x / 4) * 1.5);
          px(x, y, 3, H - y, '#e9f2fc');
          px(x, y + 5, 3, H - y, '#cfdff0');
        }
      }
      const haze = smooth((cam - 300) / 50) - smooth((cam - 430) / 60); // warm light along the horizon
      if (haze > 0.01) {
        for (let i = 0; i < 16; i++) {
          ctx.globalAlpha = haze * (1 - i / 16) * 0.5;
          px(0, H - Math.round(H * 0.16) - 30 + i * 2, W, 2, '#ffb37a');
        }
        ctx.globalAlpha = 1;
      }
    }

    /* ----- high sky, 300 to 420 ----- */

    function drawHighSky(t) {
      const lo = scoreOf(H) - 4;
      const hi = scoreOf(0) + 4;
      for (let i = 0; i < 30; i++) { // cirrus: thin streaks of ice
        const s = 296 + hash(i * 91 + 5) * 130;
        if (s < lo || s > hi) continue;
        const x = Math.round(hash(i * 13) * (W + 30)) - 20;
        const len = 16 + Math.floor(hash(i * 5) * 28);
        const y = rowOf(s);
        ctx.globalAlpha = 0.7;
        for (let k = 0; k < len; k++) if ((k + i) % 6 !== 0) px(x + k, y - Math.floor(k / 8), 1, 1, '#eef6ff');
        px(x + 5, y + 1, Math.floor(len / 2), 1, '#eef6ff');
        ctx.globalAlpha = 1;
      }
      [[at(35000), 9, 0.1, false], [at(38000), 7, 0.7, true], [235, 11, 0.4, false]].forEach((p) => { // airliners and their contrails
        const y = rowOf(p[0]);
        if (!onScreen(y, 12)) return;
        const span = W + 80;
        let x = ((p[2] * span + (still() ? 0 : (t / 1000) * p[1])) % span) - 40;
        if (p[3]) x = W - x;
        sprite(PLANE, Math.round(x), y, { w: '#f4f6f8' }, p[3]);
        ctx.globalAlpha = 0.45;
        px(p[3] ? Math.round(x) + 14 : Math.round(x) - 44, y + 2, 44, 1, '#ffffff');
        ctx.globalAlpha = 1;
      });
    }

    /* ----- the Earth below, 420 upward ----- */

    function drawEarth() {
      if (cam < 400 || cam > 698) return;
      const a = smooth((cam - 400) / 150);
      const b = smooth((cam - 550) / 100);
      const c = smooth((cam - 650) / 45);
      const R = lerp(lerp(lerp(W * 9, W * 2.4, a), W * 0.8, b), W * 0.32, c);
      const vis = lerp(lerp(lerp(3, H * 0.2, a), H * 0.17, b), -R * 2.2, c);
      const cx = W / 2;
      const cy = H + R - vis;
      const top = Math.round(cy - R);
      for (let i = 1; i <= 5; i++) { // a soft glow of air above the limb
        ctx.globalAlpha = 0.1 * (6 - i) * (1 - b * 0.6);
        const yy = top - i;
        const half = Math.sqrt(Math.max(0, R * R - (yy + 6 - cy) * (yy + 6 - cy)));
        px(cx - half, yy, half * 2, 1, '#8fd0ff');
      }
      ctx.globalAlpha = 1;
      for (let y = Math.max(0, top); y < H; y++) {
        const half = Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy)));
        const d = y - top;
        px(cx - half, y, half * 2, 1, d < 1 ? '#d6efff' : d < 3 ? '#5fb4ff' : d % 6 < 3 ? '#17437f' : '#1b4c8c'); // the thin blue line, then ocean
      }
      for (let i = 0; i < 14; i++) { // land and cloud
        const lx = cx + (hash(i * 37) - 0.5) * 1.5 * Math.min(R, W);
        const ly = top + 5 + hash(i * 59) * Math.max(8, vis - 8);
        const half = Math.sqrt(Math.max(0, R * R - (ly - cy) * (ly - cy)));
        if (ly > H || Math.abs(lx - cx) > half - 6) continue;
        px(lx, ly, 8 + hash(i) * 18, 2 + (i % 2), i % 3 === 0 ? '#eef4fb' : '#2f7a55');
      }
    }

    function drawSpace(t) {
      [[575, 0.7, 26], [612, 0.2, -19], [640, 0.5, 15]].forEach((s) => { // satellites
        const y = rowOf(s[0]);
        if (!onScreen(y, 10)) return;
        const span = W + 50;
        const x = Math.round((((s[1] * span + (still() ? 0 : (t / 1000) * s[2] * 0.3)) % span) + span) % span - 25);
        px(x, y, 4, 3, '#d9dee5');
        px(x - 6, y + 1, 5, 1, '#5b8fd6');
        px(x + 5, y + 1, 5, 1, '#5b8fd6');
      });
      const edge = rowOf(550); // the edge of space, drawn as a faint dashed line
      if (onScreen(edge, 4)) {
        ctx.globalAlpha = 0.55;
        for (let x = 0; x < W; x += 6) px(x, edge, 3, 1, '#7fb6ff');
        ctx.globalAlpha = 1;
      }
    }

    /* ----- the Moon, 650 to 700 ----- */

    function drawMoon() {
      if (cam < 640) return;
      const land = clamp((cam - 682) / 18);
      if (land < 0.75) { // overhead, growing
        const u = clamp((cam - 650) / 40);
        const r = Math.round(lerp(4, W * 0.8, u * u));
        const cy = Math.round(lerp(H * 0.13, -r * 0.45, u));
        const cx = Math.round(W * 0.5);
        disc(cx, cy, r, '#d9dbe0');
        for (let i = 0; i < 9; i++) {
          const ang = hash(i * 17) * 6.283;
          const dist = hash(i * 29) * r * 0.75;
          const cr = Math.max(1, Math.round(r * (0.05 + hash(i * 5) * 0.1)));
          disc(Math.round(cx + Math.cos(ang) * dist), Math.round(cy + Math.sin(ang) * dist), cr, '#b9bcc6');
        }
      }
      if (land > 0) { // the ground comes up to meet the swarm
        const top = Math.round(lerp(H + 6, anchorRow() + 7, smooth(land)));
        for (let x = 0; x < W; x += 2) {
          const sag = Math.round(Math.pow((x - W / 2) / (W / 2), 2) * 7);
          px(x, top + sag, 2, H, '#c5c8d0');
          px(x, top + sag, 2, 2, '#eceef2');
        }
        for (let i = 0; i < 8; i++) {
          const x = hash(i * 43) * W;
          const y = top + 12 + hash(i * 61) * 60;
          px(x, y, 8 + hash(i) * 14, 3, '#a9adb8');
          px(x + 1, y + 3, 6 + hash(i) * 12, 1, '#dfe2e8');
        }
        ctx.globalAlpha = smooth((land - 0.2) / 0.5); // and home is a small blue marble
        const ex = Math.round(W * 0.74);
        const ey = Math.round(H * 0.18);
        disc(ex, ey, 7, '#1b4c8c');
        px(ex - 4, ey - 3, 5, 2, '#2f7a55');
        px(ex, ey + 1, 5, 2, '#eef4fb');
        px(ex - 5, ey + 3, 4, 1, '#eef4fb');
        ctx.globalAlpha = 1;
      }
    }

    /* ----- the sightings ----- */

    const X = (frac) => Math.round(frac * (W - 14));

    const ART = {
      car(g, x, y, t) {
        const span = W + 40;
        const cx = Math.round(((still() ? X(g.x) + 20 : (t / 1000) * 7) % span) - 20);
        const cy = rowOf(0) + 5 + (still() ? 0 : Math.floor(t / 160) % 2);
        px(cx, cy, 15, 4, '#c9a94d'); // a little open-top jalopy
        px(cx + 5, cy - 4, 6, 4, '#c9a94d');
        px(cx + 6, cy - 3, 4, 2, '#dff0ff');
        px(cx + 13, cy - 1, 3, 2, '#e9d79a');
        px(cx - 1, cy + 1, 1, 2, '#f4f1e6');
        disc(cx + 3, cy + 4, 2, '#f4f1e6');
        disc(cx + 12, cy + 4, 2, '#f4f1e6');
        px(cx + 3, cy + 4, 1, 1, '#2b2f36');
        px(cx + 12, cy + 4, 1, 1, '#2b2f36');
        if (!still() && Math.floor(t / 300) % 2) px(cx - 4, cy - 1, 2, 2, '#e8eef5');
        return { x: cx, y: cy - 4, w: 17, h: 11 };
      },
      squirrel(g, x) {
        const gy = rowOf(0);
        px(x, gy + 1, 14, 2, '#6b4a22'); // a bench
        px(x + 1, gy + 3, 1, 3, '#6b4a22');
        px(x + 12, gy + 3, 1, 3, '#6b4a22');
        px(x, gy - 3, 14, 1, '#6b4a22');
        px(x + 9, gy - 2, 4, 3, '#f4f1e6'); // an open lunch bag, raided
        px(x + 2, gy - 3, 4, 4, '#9a6a3a'); // the culprit
        px(x + 5, gy - 5, 3, 3, '#9a6a3a');
        px(x + 7, gy - 4, 1, 1, '#2b2f36');
        px(x, gy - 7, 2, 6, '#b98550');
        px(x + 1, gy - 8, 3, 2, '#b98550');
        px(x + 6, gy - 2, 3, 2, '#f1d27a'); // with the sandwich
        return { x, y: gy - 9, w: 15, h: 15 };
      },
      washer(g, x, y, t) {
        px(x - 1, y - 60, 1, 60, '#2b2f36'); // ropes down from the roof
        px(x + 9, y - 60, 1, 60, '#2b2f36');
        px(x - 2, y, 13, 2, '#c9ced6');
        px(x - 2, y - 4, 1, 4, '#c9ced6');
        px(x + 10, y - 4, 1, 4, '#c9ced6');
        px(x + 3, y - 8, 3, 3, '#f1c9a0');
        px(x + 3, y - 5, 3, 5, '#f0a23a');
        const wave = still() ? 0 : Math.floor(t / 250) % 2;
        px(x + 6, y - 6 - wave * 2, 2, 1, '#f1c9a0'); // the wave
        px(x + 7, y - 8 - wave * 2, 1, 2, '#f1c9a0');
        return { x: x - 2, y: y - 10, w: 13, h: 12 };
      },
      balloon(g, x, y, t) {
        if (popped) return null;
        const bx = x + (still() ? 0 : Math.round(Math.sin(t / 1300) * 8));
        const by = y + (still() ? 0 : Math.round(Math.sin(t / 900) * 3));
        disc(bx, by, 6, '#c8102e');
        for (let dy = -6; dy <= 6; dy++) { // black stripes
          const half = Math.round(Math.sqrt(36 - dy * dy));
          if (Math.abs(dy) % 4 < 2) continue;
          px(bx - half, by + dy, half * 2 + 1, 1, '#1c1c1c');
        }
        px(bx - 2, by - 4, 2, 2, '#ff8fa0');
        px(bx, by + 7, 1, 2, '#c8102e');
        for (let i = 0; i < 7; i++) px(bx + (i % 2), by + 9 + i, 1, 1, '#f4f1e6');
        boxes.balloon = { x: bx - 9, y: by - 9, w: 19, h: 26 };
        return boxes.balloon;
      },
      geese(g, x, y, t) {
        const span = W + 70;
        const lead = Math.round((((still() ? X(g.x) + 35 : (t / 1000) * 10) % span) - 35));
        const bird = (bx, by, flip) => {
          const up = !still() && Math.floor(t / 200 + bx) % 2;
          px(bx, by, 4, 2, '#4a4f58');
          px(flip ? bx - 2 : bx + 4, by, 2, 1, '#f4f1e6');
          px(flip ? bx - 3 : bx + 6, by, 1, 1, '#2b2f36');
          px(bx + 1, by + (up ? -2 : 2), 2, 2, '#6b7280');
        };
        bird(lead, y, false);
        for (let i = 1; i <= 3; i++) {
          bird(lead - i * 7, y - i * 4, false);
          if (i < 3) bird(lead - i * 7, y + i * 4, false);
        }
        bird(lead - 21, y + 12, true); // the one with other plans
        return { x: lead - 24, y: y - 14, w: 34, h: 30 };
      },
      exam(g, x, y, t) {
        const px0 = x + (still() ? 0 : Math.round(Math.sin(t / 1700) * 10));
        const py = y + (still() ? 0 : Math.round(Math.sin(t / 1100) * 4));
        px(px0, py, 11, 1, '#f4f1e6'); // a paper dart, folded from a bad day
        px(px0 + 2, py + 1, 8, 1, '#e4e0d2');
        px(px0 + 4, py + 2, 5, 1, '#f4f1e6');
        px(px0 + 6, py + 3, 2, 1, '#e4e0d2');
        px(px0 + 3, py, 3, 1, '#c8102e'); // red ink
        px(px0 + 7, py + 1, 2, 1, '#c8102e');
        return { x: px0, y: py - 1, w: 12, h: 6 };
      },
      jet(g, x, y, t) {
        const span = W + 90;
        const jx = Math.round((((still() ? X(g.x) + 45 : (t / 1000) * 16) % span) - 45));
        const jy = y - Math.round((jx - W / 2) / 6); // climbing
        sprite(PLANE, jx, jy, { w: '#f4f6f8' });
        px(jx + 9, jy + 2, 3, 1, '#35c29f');
        ctx.globalAlpha = 0.45;
        for (let i = 0; i < 40; i += 2) px(jx - 2 - i, jy + 3 + Math.round(i / 6), 2, 1, '#ffffff');
        ctx.globalAlpha = 1;
        return { x: jx, y: jy, w: 14, h: 6 };
      },
      cap(g, x, y, t) {
        const cy = y + (still() ? 0 : Math.round(Math.sin(t / 1000) * 3));
        px(x + 2, cy, 9, 1, '#00213d'); // a mortarboard, still on its way down
        px(x, cy + 1, 13, 1, '#003057');
        px(x + 2, cy + 2, 9, 1, '#00213d');
        px(x + 4, cy + 3, 5, 3, '#003057');
        px(x + 6, cy, 1, 1, '#c9a94d');
        px(x + 11, cy + 2, 1, 5, '#c9a94d'); // tassel
        px(x + 10, cy + 7, 3, 2, '#c9a94d');
        return { x, y: cy, w: 13, h: 9 };
      },
      wballoon(g, x, y, t) {
        const by = y + (still() ? 0 : Math.round(Math.sin(t / 1500) * 2));
        disc(x, by, 9, '#eef2f6');
        px(x - 4, by - 5, 3, 3, '#ffffff');
        px(x, by + 10, 1, 12, '#c9d2dc');
        px(x - 3, by + 22, 7, 5, '#003057'); // a payload in familiar colours
        px(x - 3, by + 24, 7, 1, '#c9a94d');
        px(x + 4, by + 25, 1, 3, '#c9d2dc');
        px(x + 3, by + 28, 4, 3, '#f4f1e6'); // the tag
        return { x: x - 10, y: by - 10, w: 20, h: 42 };
      },
      astronaut(g, x, y, t) {
        const ay = y + (still() ? 0 : Math.round(Math.sin(t / 1400) * 3));
        px(x + 2, ay, 6, 6, '#f4f6f8');
        px(x + 3, ay + 1, 4, 3, '#c9a94d'); // gold visor
        px(x + 1, ay + 6, 8, 7, '#f4f6f8');
        px(x, ay + 7, 1, 5, '#c9d2dc'); // pack
        px(x + 2, ay + 13, 2, 4, '#f4f6f8');
        px(x + 6, ay + 13, 2, 4, '#f4f6f8');
        px(x - 1, ay + 8, 2, 4, '#f4f6f8');
        const wave = still() ? 0 : Math.floor(t / 300) % 2;
        px(x + 9, ay + 6 - wave * 2, 2, 2, '#f4f6f8'); // the wave
        px(x + 10, ay + 3 - wave * 2, 2, 3, '#f4f6f8');
        px(x + 3, ay + 8, 3, 1, '#003057');
        for (let i = 0; i < 10; i++) px(x - 2 - i, ay + 10 + Math.round(Math.sin(i / 2) * 2), 1, 1, '#c9d2dc'); // tether
        return { x: x - 2, y: ay, w: 15, h: 18 };
      },
      satellite(g, x, y, t) {
        const sx = x + (still() ? 0 : Math.round(Math.sin(t / 2600) * 6));
        px(sx, y, 6, 6, '#d9dee5');
        px(sx + 2, y - 3, 2, 3, '#d9dee5');
        px(sx + 1, y - 5, 4, 2, '#f4f6f8');
        const hex = (hx, hy, c) => { px(hx + 1, hy, 3, 1, c); px(hx, hy + 1, 5, 2, c); px(hx + 1, hy + 3, 3, 1, c); };
        [-1, 1].forEach((side) => { // honeycomb panels
          for (let i = 0; i < 3; i++) {
            const hx = side < 0 ? sx - 7 - i * 5 : sx + 8 + i * 5;
            hex(hx, y - 2 + (i % 2) * 2, i % 2 ? '#c9a94d' : '#e0b93a');
            hex(hx, y + 3 + (i % 2) * 2, i % 2 ? '#e0b93a' : '#c9a94d');
          }
        });
        return { x: sx - 18, y: y - 6, w: 42, h: 14 };
      },
      flag(g, x) {
        if (!flagUp) return null;
        const fx = beeX() + 22;
        const fy = anchorRow() + 7;
        px(fx, fy - 15, 1, 16, '#f4f6f8');
        px(fx + 1, fy - 15, 5, 5, '#c9a94d');
        px(fx + 6, fy - 15, 5, 5, '#003057');
        return { x: fx, y: fy - 16, w: 12, h: 17 };
      },
    };

    function drawSightings(t) {
      delete boxes.balloon;
      SIGHTINGS.forEach((g) => {
        const y = rowOf(g.score);
        if (g.id !== 'flag' && !onScreen(y, 70)) return;
        const box = ART[g.id](g, X(g.x), y, t);
        // "Seen" means properly in view: inside the middle of the screen, not just clipping an edge.
        if (box && box.y > H * 0.08 && box.y + box.h < H * 0.92) seen.add(g.id);
      });
    }

    /* ----- the swarm ----- */

    function beePalette(goldNow) {
      return goldNow
        ? { b: '#ffd23f', k: '#3a2f00', w: '#fff7d1', h: '#fff0a8', e: '#3a2f00' }
        : { b: '#e0b93a', k: '#00213d', w: '#dff0ff', h: '#f6dc7a', e: '#00213d' };
    }

    function drawBees(t) {
      const goldNow = gold || mood === 'gold';
      const palette = beePalette(goldNow);
      const bob = still() ? 0 : Math.round(Math.sin(t / 380) * 2);
      let mx = beeX();
      let my = anchorRow() - 6 + (mood === 'sad' ? 3 : bob);
      let angle = 0;
      if (trick) {
        const p = (t - trick.start) / trick.ms;
        if (p >= 1) trick = null;
        else if (trick.name === 'flip') angle = p * Math.PI * 2;
        else { // a loop: once round a small circle, nose leading
          angle = -p * Math.PI * 2;
          mx += Math.round(Math.sin(p * Math.PI * 2) * 11);
          my += Math.round((Math.cos(p * Math.PI * 2) - 1) * 11);
        }
      }
      // The swarm trails behind and below, one more bee for every correct answer.
      for (let i = 0; i < followers; i++) {
        const ph = still() ? i : t / 520 + i * 1.7;
        const fx = mx - 11 - (i % 4) * 9 - Math.floor(i / 4) * 4 + Math.round(Math.sin(ph) * 2);
        const fy = my + 10 + Math.floor(i / 4) * 9 + ((i * 5) % 7) + Math.round(Math.cos(ph * 1.3) * 2);
        const flapM = !still() && Math.floor(t / 70 + i) % 2 === 0;
        sprite(flapM ? MINI.map((r, k) => (k === 0 ? '.......' : r)) : MINI, fx, fy, palette);
      }
      const flap = !still() && Math.floor(t / (mood === 'happy' || goldNow ? 50 : 90)) % 2 === 0;
      const rows = mood === 'sad' || flap ? BEE.map((r, i) => (i < 4 ? '................' : r)) : BEE;
      if (goldNow) { // a few sparks round a golden bee
        const tw = still() ? 0 : Math.floor(t / 160) % 4;
        [[-5, -3], [20, -2], [-3, 12], [19, 11]].forEach((d, i) => {
          if (i === tw) return;
          px(mx + d[0], my + d[1], 1, 3, '#fff7d1');
          px(mx + d[0] - 1, my + d[1] + 1, 3, 1, '#fff7d1');
        });
      }
      if (angle) {
        ctx.save();
        ctx.translate(mx + 8, my + 5);
        ctx.rotate(angle);
        sprite(BEE, -8, -5, palette);
        ctx.restore();
      } else {
        sprite(rows, mx, my, palette);
        if (mood === 'sad' || flap) { // wings folded low
          px(mx + 2, my + 3, 5, 1, palette.k);
          px(mx + 8, my + 3, 5, 1, palette.k);
          px(mx + 3, my + 2, 3, 1, palette.w);
          px(mx + 9, my + 2, 3, 1, palette.w);
        }
      }
      boxes.bee = { x: mx - 4, y: my - 4, w: 24, h: 19 };
      particles = particles.filter((p) => t - p.born < p.life);
      particles.forEach((p) => {
        const age = (t - p.born) / 1000;
        const x = p.x + p.vx * age;
        const y = p.y + p.vy * age + 14 * age * age;
        if (p.bee) sprite(MINI, Math.round(x), Math.round(y), beePalette(true));
        else px(x, y, p.size || 1, p.size || 1, p.color);
      });
    }

    // Wisps that pass in front of everything: the closest layer.
    function drawFront(t) {
      if (cam < 105 || cam > 440) return;
      const f = LAYERS.front;
      for (let i = 0; i < 16; i++) {
        const s = 112 + hash(i * 331) * 320;
        const y = rowOf(s, f);
        if (!onScreen(y, 20)) continue;
        const span = W + 120;
        const x = ((hash(i * 67) * span + (still() ? 0 : (t / 1000) * 9)) % span) - 80;
        ctx.globalAlpha = 0.35;
        px(x, y, 70, 3, '#ffffff');
        px(x + 12, y - 2, 40, 2, '#ffffff');
        px(x + 8, y + 3, 50, 2, '#ffffff');
        ctx.globalAlpha = 1;
      }
    }

    /* ----- the ruler: a thin line, ticks and small labels, nothing behind it ----- */

    function drawRuler() {
      const x = W - 2;
      px(x - 1, 0, 1, H, '#00213d');
      px(x, 0, 1, H, '#f4f1e6');
      const from = Math.max(0, Math.floor(scoreOf(H)));
      const to = Math.ceil(scoreOf(0));
      for (let s = from; s <= to; s++) {
        const y = rowOf(s);
        const len = s % 10 === 0 ? 6 : s % 5 === 0 ? 4 : 2;
        px(x - len, y, len, 1, '#f4f1e6');
        if (s % 10 === 0) {
          px(x - len, y + 1, len, 1, '#00213d'); // a hairline of shadow keeps it readable on any sky
          const label = compact(feetFor(s));
          text(label, x - 7, y - 1, '#00213d');
          text(label, x - 8, y - 2, '#f4f1e6');
        }
      }
    }

    function draw(t) {
      delete boxes.tower;
      drawSky();
      drawStars(t);
      drawSun();
      drawTowers('far', t);
      drawClouds('far', t);
      drawHorizon();
      drawEarth();
      drawTowers('mid', t);
      drawClouds('mid', t);
      drawThunderheads(t);
      drawMoon();
      drawTowers('near', t);
      drawTrain(t);
      drawCampus(t);
      drawClouds('near', t);
      drawBirds(t);
      drawHighSky(t);
      drawSpace(t);
      drawSightings(t);
      drawBees(t);
      drawFront(t);
      if (dim) {
        ctx.globalAlpha = dim;
        px(0, 0, W, H, '#05080f');
        ctx.globalAlpha = 1;
      }
      drawRuler(); // always last: nothing in the world may cover the ruler
    }

    function spray(t, x, y, count, colors, bees) {
      for (let i = 0; i < count; i++) {
        const a = hash(i * 37 + 3 + t) * Math.PI * 2;
        const sp = 18 + hash(i * 11 + t) * 60;
        particles.push({ born: t, life: 800 + hash(i) * 900, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, bee: bees && i % 3 === 0, color: colors[i % colors.length], size: bees ? 1 : 2 });
      }
    }

    resize();
    return {
      resize,
      draw,
      setCamera(score) { cam = score; },
      setAnchor(frac) { anchor = frac; },
      setMood(m) { mood = m; },
      setGold(on) { gold = !!on; },
      setNight(on) { night = !!on; },
      setFollowers(n) { followers = Math.max(0, Math.min(7, n)); },
      setDim(a) { dim = a; },
      burst(t) { spray(t, beeX() + 8, anchorRow() - 1, 46, ['#ffd23f', '#fff7d1'], true); },
      // Tricks: 'flip' turns the bee head over heels, 'loop' flies it once round a small circle.
      trick(name, t) { if (!still()) trick = { name, start: t, ms: name === 'flip' ? 600 : 900 }; },
      // Pops the balloon wherever it is. Returns false if it was already gone.
      pop(t) {
        if (popped) return false;
        const b = boxes.balloon;
        popped = true;
        if (!still()) spray(t, b ? b.x + 9 : beeX() + 40, b ? b.y + 9 : anchorRow() - 30, 26, ['#c8102e', '#1c1c1c', '#ff8fa0'], false);
        return true;
      },
      // A burst of red and black beside the bee, without touching the balloon out in the world.
      puff(t) { if (!still()) spray(t, beeX() + 30, anchorRow() - 22, 26, ['#c8102e', '#1c1c1c', '#ff8fa0'], false); },
      plantFlag() { flagUp = true; },
      newFlight() { popped = false; flagUp = false; particles = []; trick = null; },
      // Which thing, if any, is under a point given in CSS pixels.
      hit(cssX, cssY) {
        const x = cssX / S;
        const y = cssY / S;
        return ['balloon', 'bee', 'tower'].find((k) => boxes[k] && x >= boxes[k].x && x <= boxes[k].x + boxes[k].w && y >= boxes[k].y && y <= boxes[k].y + boxes[k].h) || null;
      },
      box(name) { const b = boxes[name]; return b ? { x: b.x * S, y: b.y * S, w: b.w * S, h: b.h * S } : null; },
      // Sightings that have come properly into view since the last call.
      drainSeen() { const out = Array.from(seen); seen.clear(); return out; },
      sightings: SIGHTINGS.map((g) => ({ id: g.id, score: g.score, side: g.x > 0.5 ? 'left' : 'right', caption: g.caption, hidden: !!g.hidden })),
      cssY(score) { return rowOf(score) * S; },
      cssPerPoint() { return PPP * S; },
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

  root.SwarmScene = { create, stamp, zoneAt, BEE, MINI, LAYERS, ZONES, SCREENS_PER_POINT };
})(typeof self !== 'undefined' ? self : this);
