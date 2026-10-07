#!/usr/bin/env node
/*
 * Wacky Soccer — difficulty balance simulator (development tool, not loaded by the game).
 *   node games/wacky-soccer/balance-sim.js [--n 60] [--seed 9000] [--skills 0.2,0.55,0.85]
 *        [--pol idle,mash,kid,timed] [--cup bronze] [--goals 5] [--from 0] [--json]
 * Plays 1-player matches on the real data.js / physics.js / ai.js with a seeded Math.random,
 * re-creating game.js stepMatch: the 1.2 s countdown that holds the ball, the 0.14 s press
 * buffer, WS.cpuPower kicks, CPU.notePress, the stuck-ball hop, roof resets and a fresh
 * surprise modifier after every goal. Prints the human side's win rate against each CPU skill.
 * --cup plays that cup's four rounds (its skills, first to WS.CUP_GOALS) instead of --skills.
 * Simulated humans: idle (never presses), mash (every 0.25-0.6 s), lazy (every 0.8-2 s),
 * kid / timed (press when the ball is about to reach a foot; kid is slower and misses more),
 * smart (timed, plus a hop toward a ball a few steps away) and cpu<skill> (the game's own
 * CPU brain playing for the human side).
 * Match i of a cell always uses the same seed, so two versions of the game (or two policies)
 * are compared on paired matches. Single matches swing a lot: use N of 60 or more.
 * --from/--n pick a slice of the matches (for running a cell in parallel); --json prints totals.
 * Targets, measured numbers and rejected experiments: BALANCE.md.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
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
  return { WS: ctx.WS, R: () => M.random(), reseed: s => { seed = s; } };
}

function policy(env, kind) {
  const { WS, R } = env;
  if (kind === 'idle') return { update: () => false };
  const every = { mash: [0.25, 0.6], lazy: [0.8, 2.0] }[kind];
  if (every) {
    let t = 0, next = every[0] + R() * (every[1] - every[0]);
    return { update(w, dt) { t += dt; if (t < next) return false; next = t + every[0] + R() * (every[1] - every[0]); return true; } };
  }
  if (kind === 'kid' || kind === 'timed' || kind === 'smart') {
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
          // smart = timed, plus a hop toward a ball that is a few steps away (like the CPU's approach)
          const near = w.nearestBall(p.x);
          if (kind === 'smart' && near && p.grounded() && !p.lying() && p.idleT > 0.8) {
            const d = Math.abs(near.x - p.x);
            if (d > 70 && d < 330) { wait = R() * jit; return false; }
          }
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

// One match, first to `goals`. Returns the score and the seconds of open play.
function match(env, human, skill, goals) {
  const { WS, R } = env, W = WS.W, G = WS.G;
  const teams = [WS.TEAMS[0], WS.TEAMS[1]], homes = [[W / 2 - 150, 250], [W / 2 + 150, W - 250]];
  const score = [0, 0], seen = {}, cpu = new WS.CPU(1, skill), dt = 1 / 60;
  let mod = 'normal', lastScorer = -1, play = 0;
  while (score[0] < goals && score[1] < goals && play < 900) {
    seen[mod] = 1;
    const P = WS.makeParams(mod), w = new WS.World(P);
    for (let side = 0; side < 2; side++) for (let i = 0; i < 2; i++) {
      const p = new WS.Player(w, teams[side], side, i, homes[side][i], teams[side].players[i]);
      if (side === 1) p.power = WS.cpuPower(skill);
      w.players.push(p);
    }
    const off = lastScorer === 0 ? 45 : lastScorer === 1 ? -45 : 0;
    if (P.ballCount === 2) { w.addBall(W / 2 - 110 + off, 240); w.addBall(W / 2 + 110 + off, 240); } else w.addBall(W / 2 + off, 240);
    const hold = w.balls.map(b => [b.x, b.y]);
    const press = side => { let any = false; for (const p of w.players) if (p.side === side && p.press()) any = true; return any; };
    cpu.snap = null; cpu.cool = 0.3; cpu.pending = -1;
    for (let k = 0; k < 72; k++) { w.step(dt); w.balls.forEach((b, i) => { b.x = hold[i][0]; b.y = hold[i][1]; b.vx = b.vy = 0; }); w.events.length = 0; }
    for (const b of w.balls) { b.vx = (R() - 0.5) * 120; b.vy = 0; }
    let goal = -1, buf = 0;
    while (goal < 0 && play < 900) {
      if (human.update(w, dt)) { buf = 0.14; cpu.notePress(); }
      if (buf > 0) buf = press(0) ? 0 : buf - dt;
      w.step(dt); w.events.length = 0;
      if (cpu.update(w, dt)) { press(1); if (human.notePress) human.notePress(); }
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

// Plays matches [from, from + n) of one cell. Match i always gets the same seed.
function cell(env, kind, skill, opts) {
  const goals = opts.goals || env.WS.WIN_GOALS, seed0 = opts.seed == null ? 9000 : opts.seed, from = opts.from || 0;
  const out = { kind, skill, goals, n: 0, wins: 0, gf: 0, ga: 0, play: 0, results: [] };
  for (let i = from; i < from + opts.n; i++) {
    env.reseed((seed0 + i) * 7919 + Math.round(skill * 1000));
    const r = match(env, policy(env, kind), skill, goals);
    const win = r.score[0] > r.score[1] ? 1 : 0;
    out.n++; out.wins += win; out.gf += r.score[0]; out.ga += r.score[1]; out.play += r.play; out.results.push(win);
  }
  return out;
}

function main() {
  const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
  const env = load(), WS = env.WS;
  const cup = arg('cup', '') && WS.CUPS.find(c => c.id === arg('cup'));
  if (arg('cup', '') && !cup) throw new Error('unknown cup ' + arg('cup'));
  const opts = { n: +arg('n', 60), seed: +arg('seed', 9000), from: +arg('from', 0), goals: +arg('goals', cup ? WS.CUP_GOALS : WS.WIN_GOALS) };
  const skills = cup ? cup.skills : arg('skills', WS.DIFFS.map(d => d.skill).join(',')).split(',').map(Number);
  const policies = arg('pol', 'idle,mash,kid,timed,smart').split(',');
  const cells = policies.map(kind => skills.map(skill => cell(env, kind, skill, opts)));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(cells)); return; }
  console.log(`${opts.n} matches per cell (first to ${opts.goals}), seed ${opts.seed}. Human win rate (average goals for-against, play seconds):`);
  console.log(['human'.padEnd(9), ...skills.map(s => ('vs CPU ' + s).padEnd(24))].join(' '));
  for (const row of cells) {
    console.log([row[0].kind.padEnd(9), ...row.map(c =>
      `${String(Math.round(100 * c.wins / c.n)).padStart(3)}% ${(c.gf / c.n).toFixed(1)}-${(c.ga / c.n).toFixed(1)} ${Math.round(c.play / c.n)}s`.padEnd(24))].join(' '));
  }
}

if (require.main === module) main();
else module.exports = { load, policy, match, cell };
