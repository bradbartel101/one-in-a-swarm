/* One in a Swarm — sound effects, synthesised with the Web Audio API. No audio files.
   Nothing plays until the player has interacted with the page, and everything is silent when muted. */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;

  function ready() {
    if (!enabled) return null;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    const activation = root.navigator && root.navigator.userActivation;
    if (activation && !activation.hasBeenActive) return null; // browsers refuse audio before a gesture
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.45;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    } catch (e) {
      return null;
    }
    return ctx;
  }

  // One note with a quick attack and a smooth decay. `slideTo` bends the pitch.
  function tone(freq, at, dur, type, vol, slideTo) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + at;
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  // Filtered noise swept between two frequencies: wind.
  function wind(at, dur, fromHz, toHz, vol) {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const t = ctx.currentTime + at;
    src.buffer = buffer;
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  const semis = (n) => 440 * Math.pow(2, n / 12);
  const SCALE = [0, 4, 7, 12, 16, 19, 24, 28]; // an A major arpeggio, two octaves

  function play(fn) {
    if (!ready()) return;
    try {
      fn();
    } catch (e) {
      /* sound is a nicety; never let it break the game */
    }
  }

  const Sfx = {
    setEnabled(on) {
      enabled = !!on;
      if (!enabled && ctx && ctx.state === 'running') ctx.suspend().catch(function () {});
    },
    isEnabled() {
      return enabled;
    },
    // Rarer answers get a longer, higher run. `tier` is 0 (common) to 5 (one in a swarm).
    correct(tier) {
      play(() => {
        const notes = 2 + tier;
        for (let i = 0; i < notes; i++) tone(semis(SCALE[i]), i * 0.075, 0.28, 'triangle', 0.3);
        if (tier >= 5) {
          for (let i = 0; i < 6; i++) tone(semis(24 + SCALE[i % 4]), 0.55 + i * 0.06, 0.2, 'sine', 0.18);
          tone(110, 0, 0.5, 'sawtooth', 0.08, 220); // a little buzz underneath
        }
      });
    },
    wrong() {
      play(() => {
        tone(160, 0, 0.16, 'square', 0.16, 110);
        tone(120, 0.09, 0.2, 'square', 0.14, 80);
      });
    },
    tick() {
      play(() => tone(1100, 0, 0.05, 'square', 0.1));
    },
    timeout() {
      play(() => {
        tone(semis(7), 0, 0.22, 'triangle', 0.26);
        tone(semis(3), 0.18, 0.22, 'triangle', 0.26);
        tone(semis(-5), 0.36, 0.5, 'triangle', 0.26, semis(-9));
      });
    },
    start() {
      play(() => {
        tone(semis(0), 0, 0.09, 'triangle', 0.22);
        tone(semis(12), 0.08, 0.16, 'triangle', 0.22);
      });
    },
    skip() {
      play(() => tone(500, 0, 0.18, 'sine', 0.2, 200));
    },
    buzz() {
      play(() => {
        tone(180, 0, 0.35, 'sawtooth', 0.14, 240);
        tone(186, 0, 0.35, 'sawtooth', 0.1, 250);
      });
    },
    pop() {
      play(() => {
        wind(0, 0.09, 2600, 500, 0.5);
        tone(700, 0, 0.07, 'square', 0.12, 160);
      });
    },
    // A tower clock: one low struck note with a long tail, then another.
    chime() {
      play(() => {
        [0, 0.7].forEach((at) => {
          tone(semis(-12), at, 1.4, 'sine', 0.3);
          tone(semis(-12) * 2.76, at, 0.9, 'sine', 0.08);
        });
      });
    },
    // A short original flourish. Not a tune anyone owns.
    jingle() {
      play(() => [0, 4, 7, 4, 7, 12].forEach((n, i) => tone(semis(n), i * 0.11, 0.2, 'square', 0.14)));
    },
    // The climb: rising wind plus a rising hum, lasting as long as the animation.
    rise(seconds) {
      play(() => {
        const d = Math.max(0.3, seconds);
        wind(0, d, 300, 2400, 0.22);
        tone(140, 0, d, 'sawtooth', 0.05, 140 + 260 * Math.min(1, d / 2));
      });
    },
    // End of the day: a bigger fanfare for a higher band (0 to 4).
    fanfare(band) {
      play(() => {
        const notes = [0, 4, 7, 12, 16].slice(0, 2 + Math.min(3, band));
        notes.forEach((n, i) => tone(semis(n), i * 0.13, 0.35, 'triangle', 0.3));
        const last = notes[notes.length - 1];
        [last, last + 4, last + 7].forEach((n) => tone(semis(n - 12), notes.length * 0.13, 0.9, 'triangle', 0.2));
      });
    },
  };

  root.SwarmSfx = Sfx;
})(typeof self !== 'undefined' ? self : this);
