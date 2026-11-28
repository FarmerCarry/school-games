// Recess Kitchen (Snack Flip & Bump Party) pure Node engine tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/recess-kitchen/engine.js');
const RK = require(enginePath);

test('engine.js is pure: zero DOM, zero Kit, zero Math.random', () => {
  const src = fs.readFileSync(enginePath, 'utf8');
  assert.doesNotMatch(src, /\bMath\.random\s*\(/);
  assert.doesNotMatch(src, /\bKit\s*\./);
  assert.doesNotMatch(src, /\bdocument\s*\./);
  assert.doesNotMatch(src, /\blocalStorage\b/);
});

test('has all 8 Kitchen Chaos Roulette modifiers and 6 silly chef hats', () => {
  assert.equal(RK.ROULETTE_MODS.length, 8);
  assert.equal(RK.HATS.length, 6);
  assert.equal(RK.HATS[0].cost, 0);
  const ids = RK.ROULETTE_MODS.map(m => m.id);
  for (const id of ['giant_donut', 'butter_floor', 'double_food', 'chili_turbo', 'moon_bounce', 'tiny_chefs', 'trampoline', 'golden_x2']) {
    assert.ok(ids.includes(id), `includes chaos modifier ${id}`);
  }
});

test('determinism: identical seed and 1-button inputs yield identical states', () => {
  const runOnce = () => {
    const w = RK.create({ duo: true, seed: 4242 });
    for (let f = 0; f < 240; f++) {
      RK.step(w, 1 / 60, { p1: f % 28 < 4, p2: (f + 12) % 32 < 4 });
    }
    return RK.publicState(w, 'play');
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('1-button leap + giant spatula whack launches snack toward opponent lunchbox', () => {
  const w = RK.create({ duo: false, seed: 777 });
  const c0 = w.chefs[0];
  const s = w.snacks[0];
  // Position snack right in spatula reach of P1
  s.x = c0.x + 56;
  s.y = c0.y - 26;
  s.vx = 0;
  s.vy = 0;

  let whacked = false;
  for (let i = 0; i < 6; i++) {
    const evs = RK.step(w, 1 / 60, { p1Press: i === 0 });
    if (evs.some(e => e.type === 'whack' && e.side === 0)) whacked = true;
  }
  assert.equal(whacked, true, 'P1 spatula whack hits nearby snack');
  assert.ok(w.humanJumps >= 1);
  assert.equal(w.atStart, false);
  assert.ok(s.vx > 300, `whack drives snack toward right lunchbox (vx=${s.vx})`);
  assert.ok(s.vy < 0, `whack lifts snack upward (vy=${s.vy})`);
});

test('scoring a goal triggers Kitchen Chaos Roulette and next serve applies modifier', () => {
  const w = RK.create({ duo: false, seed: 99, winGoals: 5 });
  const s = w.snacks[0];
  // Launch snack cleanly into right lunchbox (P1 scores!)
  s.x = RK.W - RK.GOAL_W + 25;
  s.y = RK.GOAL_TOP + 90;
  s.vx = 300;
  s.vy = 0;

  const evs = RK.step(w, 1 / 60, {});
  const goalEv = evs.find(e => e.type === 'goal');
  assert.ok(goalEv, 'goal event fires');
  assert.equal(goalEv.scorer, 0);
  assert.equal(w.goals[0], 1);
  assert.equal(w.phase, 'goal');
  assert.ok(RK.ROULETTE_MODS.some(m => m.id === w.nextMod), 'roulette picked a chaos modifier');

  // Advance through 1.25s roulette break to next serve
  let served = null;
  for (let i = 0; i < 95; i++) {
    const stepEvs = RK.step(w, 1 / 60, {});
    served = stepEvs.find(e => e.type === 'serve') || served;
  }
  assert.ok(served, 'serve fires after roulette');
  assert.equal(w.phase, 'play');
  assert.equal(w.mod, served.mod);
});

test('every chaos modifier alters serve physics cleanly (double_food, giant_donut, tiny_chefs, golden_x2)', () => {
  const wDouble = RK.create({ mod: 'double_food', seed: 11 });
  assert.equal(wDouble.snacks.length, 2, 'double_food drops 2 snacks');

  const wDonut = RK.create({ mod: 'giant_donut', seed: 12 });
  assert.equal(wDonut.snacks[0].kind, 'donut');
  assert.ok(wDonut.snacks[0].r > 60, 'giant donut radius is large');

  const wTiny = RK.create({ mod: 'tiny_chefs', seed: 13 });
  assert.ok(wTiny.chefs[0].scale < 0.75, 'tiny chefs scale down');

  const wGold = RK.create({ mod: 'golden_x2', seed: 14, winGoals: 5 });
  assert.equal(wGold.snacks[0].golden, true);
  wGold.snacks[0].x = RK.W - RK.GOAL_W + 30;
  wGold.snacks[0].y = RK.GOAL_TOP + 100;
  RK.step(wGold, 1 / 60, {});
  assert.equal(wGold.goals[0], 2, 'golden_x2 awards 2 points!');
});

test('first-to-5 ends match immediately, and tie at 0s triggers sudden death golden goal', () => {
  const w = RK.create({ duo: false, seed: 55, winGoals: 5 });
  w.goals[0] = 4;
  w.snacks[0].x = RK.W - RK.GOAL_W + 30;
  w.snacks[0].y = RK.GOAL_TOP + 100;
  const evs = RK.step(w, 1 / 60, {});
  assert.equal(w.over, true);
  assert.equal(w.winner, 0);
  const endEv = evs.find(e => e.type === 'matchEnd');
  assert.ok(endEv && endEv.result.won && endEv.result.score === 5);

  // Tie at timeLeft <= 0 enters suddenDeath
  const wt = RK.create({ duo: false, seed: 56 });
  wt.goals = [2, 2];
  wt.timeLeft = 0.01;
  const sdEvs = RK.step(wt, 1 / 60, {});
  assert.ok(sdEvs.some(e => e.type === 'suddenDeath'));
  assert.equal(wt.suddenDeath, true);
  assert.equal(wt.over, false);
  // Next goal wins sudden death immediately
  wt.snacks[0].x = RK.W - RK.GOAL_W + 30;
  wt.snacks[0].y = RK.GOAL_TOP + 100;
  RK.step(wt, 1 / 60, {});
  assert.equal(wt.over, true);
  assert.equal(wt.winner, 0);
});

test('save loader ignores old v3 saves and buys/equips silly chef hats cleanly', () => {
  const migrated = RK.loadSave({ v: 3, coins: 999, levels: [] });
  assert.equal(migrated.v, RK.SAVE_VERSION);
  assert.equal(migrated.coins, 0);
  assert.deepEqual(migrated.hats, [0]);

  migrated.coins = 60;
  assert.equal(RK.buyHat(migrated, 1), 'buy'); // costs 25
  assert.equal(migrated.coins, 35);
  assert.equal(migrated.hat, 1);
  assert.equal(RK.buyHat(migrated, 5), 'poor'); // costs 180
  assert.equal(RK.buyHat(migrated, 0), 'equip');
  assert.equal(migrated.hat, 0);

  const roundtrip = RK.loadSave(JSON.parse(JSON.stringify(migrated)));
  assert.equal(roundtrip.coins, 35);
  assert.ok(roundtrip.hats.includes(1));
});
