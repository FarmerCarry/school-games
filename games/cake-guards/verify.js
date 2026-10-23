/*
 * Level verifier (developer tool, not loaded by the game).
 *   node games/cake-guards/verify.js          -> every level and endless
 *   node games/cake-guards/verify.js 3 7      -> levels 3 and 7 only
 * Every level must have usable build pads beside (never on) its roads, must be lost
 * when nothing is built, and must be won by a sensible builder bot. A lazy bot that
 * only ever builds popcorn towers is reported too, to show how the difficulty grows.
 * Exit status: 0 all good, 1 a check failed, 2 bad arguments.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { console: console, Math: Math };
ctx.globalThis = ctx;
vm.createContext(ctx);
['data.js', 'engine.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f }));
const CG = ctx.CG;

const picked = process.argv.slice(2).map(Number);
if (picked.some(n => !Number.isInteger(n) || n < 1 || n > CG.LEVELS.length)) {
  console.log('usage: node games/cake-guards/verify.js [level 1-' + CG.LEVELS.length + ' ...]');
  process.exit(2);
}
const levels = picked.length ? picked : CG.LEVELS.map((_, i) => i + 1);

// How much road a short-range tower on each pad would cover (the bot builds there first).
function padOrder(world) {
  const samples = [];
  for (const r of world.roads) for (let d = 0; d < r.len; d += 10) samples.push(CG.pointAt(r, d));
  return world.pads.map((p, i) => ({ i: i, cover: samples.filter(s => Math.hypot(s.x - p.x, s.y - p.y) < 140).length }))
    .sort((a, b) => b.cover - a.cover).map(o => o.i);
}

// Plays a level with a build plan; returns the finished world (or the one still alive).
// The bot builds the plan's towers on the pads covering most road, then alternates
// between building and upgrading its best-placed towers, like a careful child.
function play(def, plan, opts) {
  const world = CG.create(def), order = padOrder(world), cycle = plan.filter(t => def.towers.indexOf(t) >= 0);
  let next = 0, spendT = 0, upgrades = 0;
  const maxT = opts.maxT || 1800;
  function build() {
    const free = order.filter(i => !world.pads[i].tower), type = cycle[next % cycle.length];
    if (!free.length || world.coins < CG.TOWERS[type].lv[0].cost || !CG.build(world, free[0], type)) return false;
    next++;
    return true;
  }
  function upgrade() {
    if (!opts.upgrade) return false;
    for (const i of order) {
      const c = CG.upgradeCost(world, i);
      if (c !== null && world.coins >= c && CG.upgrade(world, i)) { upgrades++; return true; }
    }
    return false;
  }
  function spend() {
    for (let guard = 0; guard < 40; guard++) {
      const built = world.pads.filter(p => p.tower).length;
      // The first towers are worth saving up for; later the bot keeps building and upgrading level.
      if (built < 4) { if (build()) continue; return; }
      if (upgrades >= built) { if (build() || upgrade()) continue; return; }
      if (upgrade() || build()) continue;
      return;
    }
  }
  if (opts.build !== false) spend();
  CG.callWave(world);
  while (world.phase !== 'won' && world.phase !== 'lost' && world.time < maxT) {
    CG.step(world, 1 / 60);
    world.ev.length = 0;
    spendT += 1 / 60;
    if (opts.build !== false && spendT >= 0.5) { spendT = 0; spend(); }
  }
  return world;
}

const PLANS = {
  popcorn: ['pop'],
  mixed: ['pop', 'pop', 'bubble', 'cake', 'pop', 'cane', 'cake', 'cane'],
  splash: ['pop', 'cake', 'cake', 'pop', 'cake', 'bubble'],
  snipe: ['pop', 'cane', 'pop', 'cane', 'cake', 'cane']
};
let failures = 0;
function fail(msg) { failures++; console.log('  FAIL ' + msg); }

for (const n of levels) {
  const def = CG.LEVELS[n - 1], world = CG.create(def);
  const label = 'level ' + String(n).padStart(2);
  // Pads: enough of them, clear of every road and of each other, inside the play area.
  if (world.pads.length < 8) fail(label + ': only ' + world.pads.length + ' build pads');
  for (const p of world.pads) {
    const gap = CG.roadDist(world.roads, p.x, p.y);
    if (gap < CG.ROAD + CG.PAD) fail(label + ': pad at ' + p.x + ',' + p.y + ' touches a road (' + gap.toFixed(1) + ')');
    if (p.y - CG.PAD < CG.TOP || p.y + CG.PAD > CG.BAR || p.x - CG.PAD < 0 || p.x + CG.PAD > CG.W) fail(label + ': pad outside the play area');
  }
  for (const r of world.roads) for (const s of r.segs) {
    const ys = [s.y, s.y + s.dy * s.len];
    if (Math.min(...ys) - CG.ROAD < CG.TOP || Math.max(...ys) + CG.ROAD > CG.BAR) fail(label + ': road crosses the HUD or the tower bar');
  }
  def.waves.forEach(w => CG.parseWave(w));
  const idle = play(def, PLANS.popcorn, { build: false });
  if (idle.phase !== 'lost') fail(label + ': doing nothing does not lose (' + idle.phase + ', ' + idle.hearts + ' hearts)');
  const res = w => w.phase === 'won' ? CG.stars(w) + '★' + String(w.hearts).padStart(3) : 'w' + w.wave + '/' + w.total;
  const runs = Object.keys(PLANS).map(name => [name, play(def, PLANS[name], { upgrade: true })]);
  const lazy = play(def, PLANS.popcorn, { upgrade: false });
  console.log(label + '  pads ' + String(world.pads.length).padStart(2) + '  ' + runs.map(r => r[0] + ' ' + res(r[1]).padEnd(7)).join(' ') + ' | lazy ' + res(lazy));
  if (!runs.some(r => r[1].phase === 'won')) fail(label + ': no builder bot wins');
}
if (!picked.length) {
  const endless = play(CG.ENDLESS, PLANS.mixed, { upgrade: true, maxT: 3600 });
  console.log('endless   smart bot lasted to wave ' + endless.wave);
  if (endless.phase !== 'lost') fail('endless: the bot never loses');
  if (endless.wave < 10) fail('endless: the bot loses before wave 10');
}
console.log(failures ? 'NOT ALL LEVELS WINNABLE (' + failures + ' problems)' : 'ALL LEVELS WINNABLE');
process.exit(failures ? 1 : 0);
