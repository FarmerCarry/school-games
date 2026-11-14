// Beat Dash test helper (not a test file): the pure engine and levels loaded in Node, and a
// scripted child who sees where a jump is needed and presses on the nearest beat with a
// Gaussian timing error. Used by beat-dash-engine.test.mjs and beat-dash.test.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const context = { window: {} };
vm.createContext(context);
for (const file of ['engine.js', 'levels.js', 'beat.js']) {
  vm.runInContext(readFileSync(path.join(repo, 'games/beat-dash', file), 'utf8'), context, { filename: file });
}
export const BD = context.window.BD, LEVELS = context.window.BD_LEVELS;
export const level1 = BD.compile(LEVELS[0]);
export const HOLD = 6, LOOK = 50; // a child's press lasts about 0.1 s; look 50 ticks ahead
export const ms = ticks => ticks * 1000 / 60;
export const plain = value => JSON.parse(JSON.stringify(value)); // objects from the engine's own realm

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

// Runs a copy of s for n ticks with one press at tick `press` (-1: none); stops past `until`.
function run(L, s, opt, n, press = -1, until = Infinity) {
  const t = BD.clone(s); t.ev = null;
  for (let i = 0; i < n && !t.dead && !t.won; i++) {
    const h = press >= 0 && i >= press && i < press + HOLD;
    BD.tick(L, t, h, h && i === press, opt);
    if (i > press + HOLD && t.x > until) break;
  }
  return t;
}
function savable(L, s, opt, presses) {
  const a = run(L, s, opt, LOOK);
  if (!a.dead) return true;
  if (!presses) return false;
  for (let p = 0; p < a.tick - s.tick; p += 2) {
    const b = run(L, s, opt, p + 12, p);
    if (!b.dead && (b.won || savable(L, b, opt, presses - 1))) return true;
  }
  return false;
}
// The ticks (from now) at which one press clears whatever kills a run with no input, nearest
// to it (where a child looks), or null when nothing needs (or nothing can save) a press now.
function jumpWindow(L, s, opt) {
  const a = run(L, s, opt, LOOK);
  if (!a.dead) return null;
  const ok = [];
  for (let p = 0; p < a.tick - s.tick; p++) {
    const b = run(L, s, opt, 240, p, a.x + 1.2);
    if (!b.dead && (b.won || savable(L, b, opt, 2))) ok.push(p);
  }
  if (!ok.length) return null; // too late: the cube is already falling onto a spike
  const w = [ok.at(-1), ok.at(-1)];
  for (let i = ok.length - 2; i >= 0 && ok[i] === w[0] - 1; i--) w[0] = ok[i];
  return w;
}

// A child who sees where a jump is needed and presses on the nearest beat, off by a
// Gaussian error of sigma ms (0: exactly on the beat). Returns the final state and every jump.
export function beatPlayer(L, opt, sigma, random) {
  const s = BD.newState(L), jumps = [], events = [], pressX = [];
  s.ev = [];
  let press = -1, busy = -1;
  while (!s.dead && !s.won && s.tick < 30000) {
    if (s.tick >= busy) {
      const w = jumpWindow(L, s, opt);
      if (w) {
        const centre = s.tick + (w[0] + w[1]) / 2;
        const beat = Math.round((BD.time(s) + (centre - s.tick) * opt.rate / 60) * L.bpm / 60);
        const onBeat = s.tick + (beat * 60 / L.bpm - BD.time(s)) * 60 / opt.rate;
        jumps.push({ x: s.x, first: s.tick + w[0], last: s.tick + w[1], onBeat });
        press = Math.max(s.tick, Math.round(onBeat + (sigma ? gauss(random) * sigma * 60 / 1000 : 0)));
        busy = press + HOLD;
      }
    }
    const h = s.tick >= press && s.tick < press + HOLD;
    if (s.tick === press) pressX.push(s.x);
    BD.tick(L, s, h, h && s.tick === press, opt);
    events.push(...s.ev.map(e => e.t)); s.ev.length = 0;
  }
  return { s, jumps, events, pressX };
}
export function triesToClear(L, opt, sigma, seed, max = 40) {
  const random = rng(seed);
  for (let tries = 1; tries <= max; tries++) if (beatPlayer(L, opt, sigma, random).s.won) return tries;
  return Infinity;
}
