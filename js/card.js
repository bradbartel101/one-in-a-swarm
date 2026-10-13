/* One in a Swarm — the share card. Draws a finished flight as a 1080x1350 picture on a canvas:
   title, flight number, date, score, final altitude, band, the flight log chart and the
   address. It never draws an answer. Everything is placed in card pixels, so the picture is
   the same whatever the size of the screen it was made on. */
(function (root) {
  'use strict';

  const W = 1080;
  const H = 1350;
  const PIXEL = '"Press Start 2P", ui-monospace, Menlo, Consolas, monospace';
  const INK = '#f4f1e6';
  const GOLD = '#ffd23f';
  const NAVY = '#00213d';
  const PANEL = '#0b2a4a';
  const MUTED = '#9fb4c9';

  // data: { flight, date, score, altitude, band, top, rounds: [{ tier, reached }], url }
  // look: { zones: [{ label, from, to, color }], art: (tier) => a 24x20 canvas of that tier's mark }
  function draw(canvas, data, look) {
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    const text = (str, x, y, size, color, align) => {
      g.font = size + 'px ' + PIXEL;
      g.textAlign = align || 'center';
      g.textBaseline = 'alphabetic';
      g.fillStyle = NAVY;
      g.fillText(str, x + Math.max(2, Math.round(size / 12)), y + Math.max(2, Math.round(size / 12))); // a hard pixel shadow
      g.fillStyle = color;
      g.fillText(str, x, y);
    };
    const fit = (str, size, max) => { // the largest size, in steps of 2, at which the text fits
      let s = size;
      g.font = s + 'px ' + PIXEL;
      while (s > 12 && g.measureText(str).width > max) {
        s -= 2;
        g.font = s + 'px ' + PIXEL;
      }
      return s;
    };

    // frame
    g.fillStyle = NAVY;
    g.fillRect(0, 0, W, H);
    g.fillStyle = INK;
    g.fillRect(24, 24, W - 48, H - 48);
    g.fillStyle = PANEL;
    g.fillRect(32, 32, W - 64, H - 64);

    // title: ONE IN A in white, SWARM in gold, as one centred line
    g.font = '54px ' + PIXEL;
    const a = 'ONE IN A ';
    const b = 'SWARM';
    const left = Math.round((W - g.measureText(a + b).width) / 2);
    text(a, left, 150, 54, INK, 'left');
    g.font = '54px ' + PIXEL;
    text(b, left + Math.round(g.measureText(a).width), 150, 54, GOLD, 'left');
    text('FLIGHT #' + data.flight + ' · ' + String(data.date).toUpperCase(), W / 2, 205, 22, GOLD);

    // the numbers
    const score = data.score + ' PTS';
    text(score, W / 2, 330, fit(score, 84, 900), INK);
    const alt = String(data.altitude).toUpperCase() + ' UP';
    text(alt, W / 2, 392, fit(alt, 30, 900), GOLD);
    const band = String(data.band).toUpperCase();
    text(band, W / 2, 462, fit(band, 36, 920), INK);

    // the flight log: zones as bands, one column per round, each mark at the altitude reached
    const cx = 80;
    const cy = 510;
    const cw = W - 160;
    const ch = 640;
    const yOf = (points) => cy + ch - Math.round((Math.max(0, Math.min(data.top, points)) / data.top) * ch);
    look.zones.forEach((z) => {
      const top = yOf(z.to);
      g.fillStyle = z.color;
      g.fillRect(cx, top, cw, yOf(z.from) - top);
    });
    look.zones.forEach((z) => {
      const tall = yOf(z.from) - yOf(z.to);
      if (tall >= 26) text(z.label.toUpperCase(), cx + 12, yOf(z.to) + 24, 14, INK, 'left');
    });
    g.fillStyle = INK;
    g.fillRect(cx, cy + ch, cw, 6); // the ground
    const n = data.rounds.length;
    data.rounds.forEach((r, i) => {
      const x = Math.round(cx + 200 + ((cw - 260) * (n > 1 ? i / (n - 1) : 0.5))); // clear of the zone names and the right edge
      const markH = 60;
      const y = Math.max(cy + 4, Math.min(cy + ch - markH - 4, yOf(r.reached) - markH / 2));
      g.fillStyle = INK;
      g.fillRect(x - 3, y + markH, 6, Math.max(0, cy + ch - (y + markH)));
      g.fillStyle = NAVY;
      g.fillRect(x - 40, y - 4, 80, markH + 8);
      g.fillStyle = r.color || MUTED;
      g.fillRect(x - 36, y, 72, markH);
      g.fillStyle = NAVY;
      g.fillRect(x - 32, y + 4, 64, markH - 8);
      g.drawImage(look.art(r.tier), 0, 0, 24, 20, x - 30, y + 5, 60, 50);
      text(String(i + 1), x, cy + ch + 44, 22, INK);
    });

    // the address
    if (data.url) text(String(data.url).replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, 1262, fit(String(data.url).replace(/^https?:\/\//, '').replace(/\/$/, ''), 22, 940), INK);
    text('A GEORGIA TECH WORD GAME · FAN-MADE', W / 2, 1300, 14, MUTED);
    return canvas;
  }

  root.SwarmCard = { draw, WIDTH: W, HEIGHT: H };
})(typeof self !== 'undefined' ? self : this);
