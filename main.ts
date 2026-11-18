// news-image-20261118 — "The World in One Image: Wednesday 18 November 2026"
// A deterministic generative newspaper front page, drawn pixel by pixel with
// Node's standard library only. No network, no fonts, no dependencies.
// Every glyph, shape and panel below is drawn by the code in this file.
//
// Stories chosen (all reported on 18 Nov 2026):
//  1. US strikes Iran's Qeshm Island; Iran hits US bases in Bahrain & Kuwait
//  2. Ukraine hits the Kerch Bridge to Crimea; a road span collapses
//  3. Trump arrives in China; three-way summit with Xi & Putin in Shenzhen
//  4. Peltola wins Alaska; Democrats take a 56-44 Senate majority
//  5. US loses measles elimination status after 26 years (5,412 cases)
//  6. Voyager 1 crosses one light-day from Earth (16 billion miles)
//  Ticker: Ebola in DR Congo, Cyclone Xavier, Kemerovo plane crash, Gaza truce

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER = [247, 243, 234, 255];
const INK = [22, 22, 34, 255];
const NAVY = [18, 33, 61, 255];
const NAVY2 = [30, 52, 92, 255];
const RED = [178, 32, 44, 255];
const GOLD = [201, 162, 39, 255];
const TEAL = [18, 110, 110, 255];
const SKY = [168, 205, 225, 255];
const SEA = [52, 110, 150, 255];
const SAND = [226, 205, 160, 255];
const WHITE = [255, 255, 255, 255];
const GREY = [96, 96, 104, 255];
const LIGHT = [232, 226, 212, 255];

// ---------------------------------------------------------------- PNG out
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w: number, h: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- canvas
class Canvas {
  buf: Buffer;
  w: number;
  h: number;
  constructor(w: number, h: number, bg: number[]) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.buf[i * 4] = bg[0];
      this.buf[i * 4 + 1] = bg[1];
      this.buf[i * 4 + 2] = bg[2];
      this.buf[i * 4 + 3] = bg[3];
    }
  }
  px(x: number, y: number, c: number[]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2]; this.buf[i + 3] = c[3];
  }
  rect(x: number, y: number, w: number, h: number, c: number[]) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  frame(x: number, y: number, w: number, h: number, c: number[], t = 2) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number[]) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  thickLine(x0: number, y0: number, x1: number, y1: number, c: number[], t: number) {
    for (let a = -t; a <= t; a++) for (let b = -t; b <= t; b++)
      this.line(x0 + a, y0 + b, x1 + a, y1 + b, c);
  }
  circle(cx: number, cy: number, r: number, c: number[], fill: boolean) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (fill ? d <= r * r : d <= r * r && d >= (r - 1) * (r - 1)) this.px(cx + x, cy + y, c);
    }
  }
  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number[]) {
    const minX = Math.min(x0, x1, x2), maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) this.px(x, y, c);
    }
  }
  // jagged explosion burst
  burst(cx: number, cy: number, r: number, c: number[], seed: number) {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const n = 14;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.45 + rnd() * 0.75);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % n];
      this.triangle(Math.round(cx), Math.round(cy), Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), c);
    }
    this.circle(cx, cy, Math.round(r * 0.45), c, true);
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 bits, '#' = on. Hand-drawn for this entry.
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '*': ['00000', '10101', '01110', '10101', '00000', '00000', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
};

const CHAR_W = 6; // 5 px glyph + 1 px gap
const CHAR_H = 7;

function textWidth(s: string, scale: number): number {
  return s.length * CHAR_W * scale - scale;
}

function drawChar(cv: Canvas, ch: string, x: number, y: number, scale: number, c: number[]) {
  const g = GLYPHS[ch] || GLYPHS['?'];
  for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) {
    if (g[r][col] === '1') cv.rect(x + col * scale, y + r * scale, scale, scale, c);
  }
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: number[]) {
  s = s.toUpperCase();
  for (let i = 0; i < s.length; i++) drawChar(cv, s[i], x + i * CHAR_W * scale, y, scale, c);
}

function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: number[]) {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Greedy word wrap into lines no wider than maxW (in px).
function wrap(s: string, scale: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textWidth(t, scale) <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPara(cv: Canvas, s: string, x: number, y: number, scale: number, maxW: number, c: number[], lh: number): number {
  const lines = wrap(s, scale, maxW);
  lines.forEach((ln, i) => drawText(cv, ln, x, y + i * lh, scale, c));
  return y + lines.length * lh;
}

// Small flag painter: returns nothing, draws a w x h flag at x,y.
function flagUS(cv: Canvas, x: number, y: number, w: number, h: number) {
  for (let i = 0; i < 13; i++) {
    const sh = Math.floor(h / 13);
    cv.rect(x, y + i * sh, w, sh, i % 2 === 0 ? [178, 34, 52, 255] : WHITE);
  }
  const cw = Math.floor(w * 0.4), ch = Math.floor(h * 7 / 13);
  cv.rect(x, y, cw, ch, NAVY);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++)
    cv.rect(x + 3 + c * Math.floor((cw - 6) / 5), y + 3 + r * Math.floor((ch - 6) / 4), 2, 2, WHITE);
}
function flagCN(cv: Canvas, x: number, y: number, w: number, h: number) {
  cv.rect(x, y, w, h, [222, 41, 16, 255]);
  // one big star + four small ones, drawn as bursts
  cv.burst(x + Math.floor(w * 0.22), y + Math.floor(h * 0.28), Math.floor(h * 0.22), [255, 222, 0, 255], 7);
  for (const [fx, fy] of [[0.55, 0.15], [0.7, 0.28], [0.68, 0.5], [0.52, 0.62]])
    cv.burst(x + Math.floor(w * fx), y + Math.floor(h * fy), Math.floor(h * 0.1), [255, 222, 0, 255], 11);
}
function flagRU(cv: Canvas, x: number, y: number, w: number, h: number) {
  const th = Math.floor(h / 3);
  cv.rect(x, y, w, th, WHITE);
  cv.rect(x, y + th, w, th, [0, 57, 166, 255]);
  cv.rect(x, y + 2 * th, w, h - 2 * th, [213, 0, 50, 255]);
}
function flagUA(cv: Canvas, x: number, y: number, w: number, h: number) {
  const th = Math.floor(h / 2);
  cv.rect(x, y, w, th, [0, 87, 184, 255]);
  cv.rect(x, y + th, w, h - th, [255, 215, 0, 255]);
}

// ---------------------------------------------------------------- panels
function kicker(cv: Canvas, x: number, y: number, label: string, c: number[]) {
  cv.rect(x, y, textWidth(label, 2) + 16, 22, c);
  drawText(cv, label, x + 8, y + 4, 2, WHITE);
}

function panel(cv: Canvas, x: number, y: number, w: number, h: number) {
  cv.rect(x, y, w, h, WHITE);
  cv.frame(x, y, w, h, INK, 2);
}

// --- Lead story: the Gulf, drawn as a simple map ------------------------
function drawGulf(cv: Canvas, x: number, y: number, w: number, h: number) {
  panel(cv, x, y, w, h);
  kicker(cv, x + 10, y + 10, 'LEAD STORY - THE GULF', RED);
  drawText(cv, 'US STRIKES IRAN,', x + 12, y + 44, 4, INK);
  drawText(cv, 'IRAN HITS BACK', x + 12, y + 78, 4, INK);
  drawText(cv, 'AT US BASES', x + 12, y + 112, 4, RED);
  drawPara(cv, 'US jets hit a Guard missile site on Qeshm Island. Hours later Iran fired at US bases in Bahrain and Kuwait.', x + 12, y + 148, 2, w - 24, INK, 18);

  // map box
  const mx = x + 12, my = y + 212, mw = w - 24, mh = h - 224;
  cv.rect(mx, my, mw, mh, [198, 226, 232, 255]);
  cv.frame(mx, my, mw, mh, INK, 2);
  // land masses (stylised): Iran top, Arabia bottom, Iraq left
  cv.rect(mx, my, mw, 34, SAND); // Iran
  cv.rect(mx, my + mh - 40, mw, 40, SAND); // Arabia
  cv.rect(mx, my, 70, mh, SAND); // Iraq / west shore
  // the Gulf sea channel
  cv.rect(mx + 70, my + 34, mw - 70, mh - 74, SEA);
  // Strait of Hormuz narrows at right
  cv.rect(mx + mw - 90, my + 34, 90, 26, SEA);
  // Qeshm Island
  cv.rect(mx + mw - 150, my + 46, 66, 16, SAND);
  drawText(cv, 'IRAN', mx + 16, my + 10, 2, INK);
  drawText(cv, 'QESHM IS.', mx + mw - 212, my + 50, 1, WHITE);
  drawText(cv, 'STRAIT OF', mx + mw - 88, my + 38, 1, WHITE);
  drawText(cv, 'HORMUZ', mx + mw - 82, my + 48, 1, WHITE);
  drawText(cv, 'SAUDI', mx + 18, my + mh - 34, 2, INK);
  drawText(cv, 'ARABIA', mx + 18, my + mh - 20, 2, INK);
  // Bahrain + Kuwait markers on the Arab shore
  const bx = mx + 210, by = my + mh - 44;
  const kx = mx + 120, ky = my + mh - 46;
  cv.circle(bx, by, 5, RED, true);
  cv.circle(kx, ky, 5, RED, true);
  drawText(cv, 'BAHRAIN', bx - 8, by + 14, 2, INK);
  drawText(cv, 'KUWAIT', kx - 8, ky + 14, 2, INK);
  // explosions: Qeshm strike + two retaliation bursts
  cv.burst(mx + mw - 116, my + 54, 15, [255, 170, 0, 255], 3);
  cv.burst(mx + mw - 116, my + 54, 8, RED, 5);
  cv.burst(bx, by, 12, [255, 170, 0, 255], 9);
  cv.burst(kx, ky, 12, [255, 170, 0, 255], 13);
  // dashed attack arrows Iran -> Bahrain / Kuwait
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    cv.rect(Math.round(mx + mw - 116 - t * (mx + mw - 116 - bx)), Math.round(my + 58 + t * (by - my - 58)), 4, 4, RED);
  }
  drawText(cv, 'US STRIKE TUE', mx + 78, my + 40, 1, WHITE);
  drawText(cv, 'IRAN RETALIATION WED', mx + mw - 168, my + mh - 12, 1, INK);
}

// --- Kerch Bridge --------------------------------------------------------
function drawBridge(cv: Canvas, x: number, y: number, w: number, h: number) {
  panel(cv, x, y, w, h);
  kicker(cv, x + 10, y + 10, 'UKRAINE - RUSSIA', NAVY);
  drawText(cv, 'KERCH BRIDGE HIT', x + 12, y + 42, 3, INK);
  drawText(cv, 'SPAN FALLS', x + 12, y + 66, 3, RED);
  // sea + bridge scene
  const sx = x + 12, sy = y + 96, sw = w - 24, sh = h - 108;
  cv.rect(sx, sy, sw, sh, SKY);
  cv.rect(sx, sy + Math.floor(sh * 0.55), sw, sh - Math.floor(sh * 0.55), SEA);
  // bridge deck: left intact, right intact, middle collapsed
  const deckY = sy + Math.floor(sh * 0.42);
  cv.rect(sx, deckY, Math.floor(sw * 0.42), 8, INK);
  cv.rect(sx + Math.floor(sw * 0.62), deckY, Math.floor(sw * 0.38), 8, INK);
  // arch over the intact half
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const ax = sx + Math.floor(t * sw * 0.42);
    const ay = deckY - Math.floor(Math.sin(t * Math.PI) * 22);
    cv.rect(ax, ay, 3, 3, INK);
  }
  // collapsed span sinking at an angle
  cv.thickLine(sx + Math.floor(sw * 0.44), deckY + 4, sx + Math.floor(sw * 0.60), deckY + 26, INK, 2);
  cv.burst(sx + Math.floor(sw * 0.52), deckY + 2, 11, [255, 170, 0, 255], 21);
  cv.burst(sx + Math.floor(sw * 0.52), deckY + 2, 6, RED, 23);
  // drone dots above
  cv.circle(sx + Math.floor(sw * 0.30), sy + 10, 3, INK, true);
  cv.circle(sx + Math.floor(sw * 0.70), sy + 16, 3, INK, true);
  drawText(cv, 'UKRAINE', sx + 4, sy + 4, 2, INK);
  drawText(cv, 'CRIMEA', sx + sw - 64, sy + 4, 2, INK);
  drawText(cv, 'SECOND DAY OF STRIKES', sx + 4, sy + sh - 10, 1, WHITE);
}

// --- Shenzhen summit -----------------------------------------------------
function drawSummit(cv: Canvas, x: number, y: number, w: number, h: number) {
  panel(cv, x, y, w, h);
  kicker(cv, x + 10, y + 10, 'DIPLOMACY - CHINA', TEAL);
  drawText(cv, 'TRUMP LANDS IN CHINA', x + 12, y + 42, 3, INK);
  drawText(cv, 'FOR 3-WAY SUMMIT', x + 12, y + 66, 3, TEAL);
  // three flags
  const fw = 92, fh = 36, fy = y + 94;
  flagUS(cv, x + 14, fy, fw, fh);
  flagCN(cv, x + 14 + fw + 12, fy, fw, fh);
  flagRU(cv, x + 14 + 2 * (fw + 12), fy, fw, fh);
  drawText(cv, 'USA', x + 14 + Math.floor((fw - textWidth('USA', 2)) / 2), fy + fh + 6, 2, INK);
  drawText(cv, 'CHINA', x + 14 + fw + 12 + Math.floor((fw - textWidth('CHINA', 2)) / 2), fy + fh + 6, 2, INK);
  drawText(cv, 'RUSSIA', x + 14 + 2 * (fw + 12) + Math.floor((fw - textWidth('RUSSIA', 2)) / 2), fy + fh + 6, 2, INK);
  drawText(cv, 'APEC OPENS IN SHENZHEN. THE THREE MEET THURSDAY.', x + 12, y + 156, 1, INK);
}

// --- Alaska Senate -------------------------------------------------------
function drawAlaska(cv: Canvas, x: number, y: number, w: number, h: number) {
  panel(cv, x, y, w, h);
  kicker(cv, x + 10, y + 10, 'USA - MIDTERMS', NAVY);
  drawText(cv, 'PELTOLA WINS', x + 12, y + 42, 3, INK);
  drawText(cv, 'ALASKA', x + 12, y + 66, 3, INK);
  drawText(cv, 'DEMOCRATS 56-44', x + 12, y + 90, 3, RED);
  // senate bar: 56 blue vs 44 red
  const bx = x + 12, by = y + 128, bw = w - 24, bh = 30;
  const blueW = Math.floor(bw * 0.56);
  cv.rect(bx, by, blueW, bh, [0, 57, 166, 255]);
  cv.rect(bx + blueW, by, bw - blueW, bh, RED);
  drawText(cv, '56 DEM', bx + 8, by + 9, 2, WHITE);
  drawText(cv, '44 REP', bx + blueW + 8, by + 9, 2, WHITE);
  drawText(cv, 'SENATE SEATS', bx + 2, by + bh + 8, 2, INK);
  drawPara(cv, 'Peltola beat Sen. Dan Sullivan. The ninth Democratic flip, and the biggest majority since 2009.', x + 12, y + 190, 2, w - 24, INK, 17);
}

// --- Measles -------------------------------------------------------------
function drawMeasles(cv: Canvas, x: number, y: number, w: number, h: number) {
  panel(cv, x, y, w, h);
  kicker(cv, x + 10, y + 10, 'USA - HEALTH', RED);
  drawText(cv, 'US LOSES', x + 12, y + 42, 3, INK);
  drawText(cv, 'MEASLES-FREE', x + 12, y + 66, 3, INK);
  drawText(cv, 'STATUS', x + 12, y + 90, 3, RED);
  // virus: spiked ball
  const cx = x + Math.floor(w / 2), cy = y + 158;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    cv.thickLine(cx, cy, cx + Math.round(Math.cos(a) * 30), cy + Math.round(Math.sin(a) * 30), RED, 1);
    cv.circle(cx + Math.round(Math.cos(a) * 32), cy + Math.round(Math.sin(a) * 32), 4, RED, true);
  }
  cv.circle(cx, cy, 21, RED, true);
  cv.circle(cx - 6, cy - 6, 6, [255, 120, 120, 255], true);
  drawText(cv, '5,412 CASES IN 2026', x + 12, y + 202, 2, INK);
  drawText(cv, '10 DEATHS - 45 STATES', x + 12, y + 220, 2, INK);
  drawText(cv, 'STATUS HELD SINCE 2000', x + 12, y + 238, 2, INK);
}

// --- Voyager 1 -----------------------------------------------------------
function drawVoyager(cv: Canvas, x: number, y: number, w: number, h: number) {
  panel(cv, x, y, w, h);
  cv.rect(x + 2, y + 2, w - 4, h - 4, [8, 10, 28, 255]);
  cv.frame(x, y, w, h, INK, 2);
  kicker(cv, x + 10, y + 10, 'SPACE', GOLD);
  drawText(cv, 'VOYAGER 1', x + 12, y + 42, 3, WHITE);
  drawText(cv, 'CROSSES ONE', x + 12, y + 66, 3, WHITE);
  drawText(cv, 'LIGHT-DAY', x + 12, y + 90, 3, GOLD);
  // starfield (fixed seed)
  let s = 1234567;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 60; i++) {
    const sx = x + 8 + Math.floor(rnd() * (w - 16));
    const sy = y + 118 + Math.floor(rnd() * (h - 130));
    cv.rect(sx, sy, rnd() > 0.85 ? 2 : 1, rnd() > 0.85 ? 2 : 1, WHITE);
  }
  // Voyager probe: big dish, gold body, long boom
  const px = x + w - 130, py = y + 160;
  cv.thickLine(px + 22, py - 8, px + 46, py - 30, WHITE, 2);
  cv.rect(px + 40, py - 48, 38, 24, WHITE);
  cv.rect(px + 40, py - 48, 38, 4, GOLD);
  cv.rect(px - 6, py - 8, 22, 14, GOLD);
  cv.thickLine(px + 16, py + 2, px + 62, py + 28, GOLD, 2);
  cv.circle(px + 64, py + 30, 3, GOLD, true);
  drawText(cv, '16 BILLION MILES', x + 12, y + 206, 2, GOLD);
  drawText(cv, 'FROM EARTH', x + 12, y + 224, 2, GOLD);
  drawPara(cv, 'Light itself needs a full day to cover it.', x + 12, y + 242, 2, w - 24, WHITE, 16);
}

// --- Ticker: four more stories -------------------------------------------
function drawTicker(cv: Canvas, x: number, y: number, w: number, h: number) {
  panel(cv, x, y, w, h);
  drawText(cv, 'ALSO TODAY', x + 12, y + 10, 2, RED);
  const items = [
    ['EBOLA IN CONGO', 'Outbreak passes 11,000 cases and 5,400 deaths.'],
    ['CYCLONE XAVIER', 'A Category 5 storm slams the Northern Cook Islands.'],
    ['SIBERIA PLANE CRASH', 'Russian military plane crashes in Kemerovo. 19 killed.'],
    ['GAZA TRUCE AT RISK', 'The Board of Peace warns the ceasefire could collapse.'],
  ];
  const cw = Math.floor((w - 24) / 4);
  items.forEach(([head, body], i) => {
    const ix = x + 12 + i * cw;
    if (i > 0) cv.rect(ix - 6, y + 36, 2, h - 48, LIGHT);
    drawText(cv, head, ix, y + 36, 2, INK);
    drawPara(cv, body, ix, y + 60, 2, cw - 16, GREY, 17);
  });
}

// ---------------------------------------------------------------- main
function build(): Buffer {
  const cv = new Canvas(W, H, PAPER);

  // Masthead
  cv.rect(0, 0, W, 112, NAVY);
  cv.rect(0, 108, W, 4, GOLD);
  drawTextCentered(cv, 'THE WORLD TODAY', W / 2, 12, 7, WHITE);
  drawTextCentered(cv, 'WEDNESDAY, 18 NOVEMBER 2026', W / 2, 66, 3, GOLD);
  drawTextCentered(cv, 'ONE DAY OF WORLD NEWS, IN ONE IMAGE', W / 2, 88, 2, [200, 208, 224, 255]);

  drawGulf(cv, 8, 122, 612, 348);
  drawBridge(cv, 628, 122, 388, 174);
  drawSummit(cv, 628, 304, 388, 166);
  drawAlaska(cv, 8, 478, 328, 280);
  drawMeasles(cv, 344, 478, 328, 280);
  drawVoyager(cv, 680, 478, 336, 280);
  drawTicker(cv, 8, 766, 1008, 160);

  // Footer
  cv.rect(0, 934, W, 4, GOLD);
  drawTextCentered(cv, 'REPORTED 18 NOVEMBER 2026 - SOURCES: REUTERS, AP, AL JAZEERA, NASA, PAHO', W / 2, 950, 2, GREY);
  drawTextCentered(cv, '18 NOVEMBER 2026', W / 2, 978, 2, INK);

  return encodePNG(W, H, cv.buf);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), build());
console.log('wrote entry.png');
