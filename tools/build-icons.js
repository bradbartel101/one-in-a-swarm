#!/usr/bin/env node
'use strict';
/* Draws the home-screen icons from the game's own pixel bee and writes them as PNG files.
   No dependencies: the PNG encoder below is a few lines over Node's zlib.
   Run with: npm run build:icons */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { SwarmScene: Scene } = require('../js/scene.js');

const OUT = path.join(__dirname, '..', 'assets', 'icons');
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const NAVY = hex('#003057');
const SKY = hex('#0b3d6b');
const PALETTE = { b: hex('#e0b93a'), k: hex('#00213d'), w: hex('#dff0ff'), h: hex('#f6dc7a'), e: hex('#00213d'), f: hex('#00213d') };

function crc32(buf) {
  let c;
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const c = pixel(x, y);
      raw.set(c, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// The icon is a 24x24 picture: a band of lighter sky, three gold stars, and the bee.
// `inset` shrinks the picture toward the middle, for the "maskable" icon whose corners get cut.
function art(size, inset) {
  const GRID = 24;
  const bee = Scene.BEE;
  const bw = bee[0].length;
  const bx = Math.floor((GRID - bw) / 2);
  const by = 7;
  const stars = [[4, 3], [19, 5], [16, 20]];
  const cell = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return NAVY;
    const row = bee[gy - by];
    const ch = row && row[gx - bx];
    if (ch && PALETTE[ch]) return PALETTE[ch];
    if (stars.some((s) => s[0] === gx && s[1] === gy)) return PALETTE.h;
    return gy >= 14 ? SKY : NAVY;
  };
  const scale = (size * (1 - 2 * inset)) / GRID;
  const offset = size * inset;
  return png(size, (x, y) => cell(Math.floor((x - offset) / scale), Math.floor((y - offset) / scale)));
}

fs.mkdirSync(OUT, { recursive: true });
const files = [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.14], ['apple-touch-icon.png', 180, 0]];
files.forEach(([name, size, inset]) => {
  fs.writeFileSync(path.join(OUT, name), art(size, inset));
  console.log('wrote assets/icons/' + name + ' (' + size + 'x' + size + ')');
});
