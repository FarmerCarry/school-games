#!/usr/bin/env node
/*
 * Wacky Soccer — difficulty balance simulator (development tool, not loaded by the game).
 *   node games/wacky-soccer/balance-sim.js [--n 40] [--seed 1000] [--skills 0.3,0.55,0.85] [--pol idle,mash,kid,cpu0.55]
 * Plays 1-player matches (first to 5) on the real data.js / physics.js / ai.js with a seeded
 * Math.random, re-creating game.js stepMatch: the 1.2 s countdown that holds the ball, the
 * 0.14 s press buffer, CPU kick power, the stuck-ball hop, roof resets and a fresh surprise
 * modifier after every goal. Prints the human side's win rate against each CPU skill.
 * Simulated humans: idle (never presses), mash (every 0.25-0.6 s), lazy (every 0.8-2 s),
 * kid / timed (press when the ball is about to reach a foot; kid is slower and misses more)
 * and cpu<skill> (the game's own CPU brain playing for the human side).
 * Single matches swing a lot: compare settings with N of 40 or more and the same --seed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const N = +arg('n', 40), SEED = +arg('seed', 1000);
const POLICIES = arg('pol', 'idle,mash,lazy,kid,timed,cpu0.55').split(',');

let seed = 1;
const M = Object.create(Math);
M.random = function () { // mulberry32
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ctx = { Math: M, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data.js', 'physics.js', 'ai.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
const WS = ctx.WS, W = WS.W, G = WS.G, R = () => M.random();
const SKILLS = arg('skills', WS.DIFFS.map(d => d.skill).join(',')).split(',').map(Number);
const cpuPower = skill => 0.75 + 0.3 * skill;   // keep in sync with kickoff() in game.js

function policy(kind) {
  if (kind === 'idle') return { update: () => false };
  const every = { mash: [0.25, 0.6], lazy: [0.8, 2.0] }[kind];
  if (every) {
    let t = 0, next = every[0] + R() * (every[1] - every[0]);
    return { update(w, dt) { t += dt; if (t < next) return false; next = t + every[0] + R() * (every[1] - every[0]); return true; } };
  }
  if (kind === 'kid' || kind === 'timed') {
    const kid = kind === 'kid', lead = kid ? 0.12 : 0.1, miss = kid ? 0.3 : 0.12, jit = kid ? 0.12 : 0.05, rest = kid ? 0.45 : 0.3;
    let wait = -1, cool = 0;
    return {
      update(w, dt) {
        cool -= dt;
        if (wait >= 0) { wait -= dt; if (wait < 0) { cool = rest; return true; } return false; }
        if (cool > 0) return false;
        for (const p of w.players) {
          if (p.side !== 0) continue;
          if (p.lying() && p.lieT > (kid ? 0.6 : 0.25)) { wait = 0.05 + R() * jit; return false; }
          for (const b of w.balls) {
            const fx = b.x + b.vx * lead, fy = b.y + b.vy * lead + 900 * lead * lead;
            const dx = (fx - p.pts.hip.x) * p.dir, dy = fy - p.pts.hip.y;
            if (dx > -15 && dx < p.legLen + b.r + 25 && dy > -140 && dy < p.legLen + 25) {
              if (R() < miss) cool = 0.35; else wait = R() * jit;
              return false;
            }
          }
        }
        return false;
      }
    };
  }
  if (kind.startsWith('cpu')) return new WS.CPU(0, +kind.slice(3));
  throw new Error('unknown policy ' + kind);
}

function match(human, skill) {
  const teams = [WS.TEAMS[0], WS.TEAMS[1]], homes = [[W / 2 - 150, 250], [W / 2 + 150, W - 250]];
  const score = [0, 0], seen = {}, cpu = new WS.CPU(1, skill), dt = 1 / 60;
  let mod = 'normal', lastScorer = -1, play = 0;
  while (score[0] < 5 && score[1] < 5 && play < 900) {
    seen[mod] = 1;
    const P = WS.makeParams(mod), w = new WS.World(P);
    for (let side = 0; side < 2; side++) for (let i = 0; i < 2; i++) {
      const p = new WS.Player(w, teams[side], side, i, homes[side][i], teams[side].players[i]);
      if (side === 1) p.power = cpuPower(skill);
      w.players.push(p);
    }
    const off = lastScorer === 0 ? 45 : lastScorer === 1 ? -45 : 0;
    if (P.ballCount === 2) { w.addBall(W / 2 - 110 + off, 240); w.addBall(W / 2 + 110 + off, 240); } else w.addBall(W / 2 + off, 240);
    const hold = w.balls.map(b => [b.x, b.y]);
    const press = side => { let any = false; for (const p of w.players) if (p.side === side && p.press()) any = true; return any; };
    cpu.cool = 0.3; cpu.pending = -1;
    for (let k = 0; k < 72; k++) { w.step(dt); w.balls.forEach((b, i) => { b.x = hold[i][0]; b.y = hold[i][1]; b.vx = b.vy = 0; }); w.events.length = 0; }
    for (const b of w.balls) { b.vx = (R() - 0.5) * 120; b.vy = 0; }
    let goal = -1, buf = 0;
    while (goal < 0 && play < 900) {
      if (human.update(w, dt)) buf = 0.14;
      if (buf > 0) buf = press(0) ? 0 : buf - dt;
      w.step(dt); w.events.length = 0;
      if (cpu.update(w, dt)) press(1);
      play += dt;
      for (const b of w.balls) {
        if (!isFinite(b.x) || !isFinite(b.y)) { b.x = W / 2; b.y = 240; b.vx = b.vy = 0; }
        const s = WS.goalCheck(b);
        if (s >= 0) { goal = s; break; }
        if (b.roofT > 1.1) { b.x = W / 2; b.y = 220; b.vx = (R() - 0.5) * 100; b.vy = 0; b.roofT = 0; }
        if (Math.abs(b.vx) + Math.abs(b.vy) < 25 && b.y + b.r > G - 3) b.stillT += dt; else b.stillT = 0;
        if (b.stillT > 4.5) { b.stillT = 0; b.vy = -620; b.vx = (W / 2 - b.x) * 0.35 + (R() - 0.5) * 120; }
      }
      for (const p of w.players) if (!isFinite(p.x) || !isFinite(p.y)) p.reset();
    }
    if (goal < 0) break;
    score[goal]++; lastScorer = goal;
    const pool = WS.MODS.filter(x => x.id !== 'normal' && x.id !== mod), fresh = pool.filter(x => !seen[x.id]);
    const from = fresh.length ? fresh : pool;
    mod = from[Math.floor(R() * from.length)].id;
  }
  return { score, play };
}

console.log(`${N} matches per cell, seed ${SEED}. Human win rate (average goals for-against, play seconds):`);
console.log(['human'.padEnd(9), ...SKILLS.map(s => ('vs CPU ' + s).padEnd(24))].join(' '));
for (const kind of POLICIES) {
  const cells = SKILLS.map(skill => {
    let wins = 0, gf = 0, ga = 0, play = 0;
    for (let i = 0; i < N; i++) {
      seed = (SEED + i) * 7919 + Math.round(skill * 1000);
      const r = match(policy(kind), skill);
      if (r.score[0] > r.score[1]) wins++;
      gf += r.score[0]; ga += r.score[1]; play += r.play;
    }
    return `${String(Math.round(100 * wins / N)).padStart(3)}% ${(gf / N).toFixed(1)}-${(ga / N).toFixed(1)} ${Math.round(play / N)}s`.padEnd(24);
  });
  console.log([kind.padEnd(9), ...cells].join(' '));
}
