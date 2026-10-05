import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Core = require('../../games/block-burst/core.js');
const Rules = require('../../games/block-burst/rules.js');
const { LEVELS } = require('../../games/block-burst/levels.js');
const Verify = require('../../games/block-burst/verify-levels.js');

function legacyMulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('Block Burst RNG preserves existing seeded deals and forks without consuming live randomness', () => {
  for (const seed of [0, 7, 19007, 0xffffffff]) {
    const current = Core.mulberry(seed), legacy = legacyMulberry(seed);
    for (let i = 0; i < 64; i++) assert.equal(current(), legacy());
    const copy = current.clone();
    const expected = legacy();
    assert.equal(copy(), expected);
    for (let i = 0; i < 20; i++) copy();
    assert.equal(current(), expected, 'advancing a fork must not alter the source');
  }
});

test('Block Burst search branches have identical future deals and independent boards', () => {
  const run = Rules.newRun('adv', LEVELS[19], Core.mulberry(19007));
  const branch = Verify.clone(run), control = Verify.clone(run);
  branch.cells[0] = 0;
  branch.gems[0] = 0;
  branch.goalGems[1] = 0;
  assert.notDeepEqual([...branch.cells], [...run.cells]);
  assert.equal(run.goalGems[1], 4);
  for (let i = 0; i < 4; i++) Rules.deal(branch);
  Rules.deal(run);
  Rules.deal(control);
  assert.deepEqual(Rules.save(run), Rules.save(control));
});

test('Block Burst adventure rescue supplies preserve classic defaults and spent saved inventory', () => {
  assert.equal(Rules.newRun('classic', null, Core.mulberry(7)).bombs, 1);
  assert.equal(Rules.newRun('adv', LEVELS[0], Core.mulberry(7)).bombs, 1);
  const run = Rules.newRun('adv', LEVELS[19], Core.mulberry(19007));
  assert.equal(run.bombs, 3);
  Rules.useBomb(run, 1, 1);
  const restored = Rules.load(Rules.save(run), LEVELS[19]);
  assert.equal(restored.bombs, 2, 'resuming must not grant the starting supplies again');
  assert.equal(Rules.newRun('adv', { ...LEVELS[0], bombs: 99 }, Core.mulberry(7)).bombs, 3);
});

test('Block Burst bot runs are repeatable without global randomness and failures replay by seed', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('unseeded randomness in verifier'); };
  try {
    const level = { ...LEVELS[19], moves: 1 };
    const first = Verify.runLevel(level, 3, [2, 0.4], 19007);
    assert.deepEqual(Verify.runLevel(level, 3, [2, 0.4], 19007), first);
    for (const bot of first) {
      assert.equal(bot.failures.length, 3);
      const failure = bot.failures[1];
      const replay = Verify.runLevel(level, 1, [bot.skill], failure.seed);
      assert.deepEqual(replay[0].failures[0], failure);
      assert.equal(failure.reason, 'moves');
    }
  } finally { Math.random = originalRandom; }
});

// Execute the real power-up handler with only its drawing/audio dependencies stubbed.
// Keeping the whole handler covers side selection and nearest-puck selection too.
const hockey = readFileSync(new URL('../../games/air-hockey/game.js', import.meta.url), 'utf8');
const powerSource = hockey.slice(hockey.indexOf('  function applyPower('), hockey.indexOf('  /* ---------------------------------------------------------- update */'));
const fireCap = Number(hockey.match(/PMAX_FIRE = (\d+)/)[1]);
function fire(vx, vy, side, direct = true) {
  const puck = { x: 500, y: 300, vx, vy, alive: true, scored: false };
  const context = {
    st: { mallets: [{ x: 100, y: 300 }, { x: 900, y: 300 }], pucks: [puck] },
    Kit: { dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) },
    sideIdx: side => side < 0 ? 0 : 1,
    S: { power() {}, fire() {} }, shake: { add() {} },
    emit() {}, ring() {}, popup() {}, PMAX_FIRE: fireCap
  };
  vm.runInNewContext(`${powerSource}; this.applyPower = applyPower;`, context);
  context.applyPower({ x: 500, y: 300, def: { id: 'fire', color: '#fff', name: 'fire' } }, side, direct ? puck : null);
  return puck;
}

test('Air Hockey fire launches a resting puck toward the opposing goal for either player', () => {
  for (const side of [-1, 1]) for (const direct of [false, true]) {
    const puck = fire(0, 0, side, direct);
    assert.equal(puck.vx, -side * 1500);
    assert.equal(puck.vy, 0);
    assert.equal(puck.fire, 5);
  }
});

test('Air Hockey fire preserves moving-puck angles, reverses own-goal shots, and caps speed', () => {
  for (const side of [-1, 1]) {
    const puck = fire(side * 300, 400, side);
    assert.equal(puck.vx, -side * 900);
    assert.equal(puck.vy, 1200);
    assert.equal(Math.hypot(puck.vx, puck.vy), 1500);
    const fast = fire(-side * 2400, 3200, side);
    assert.ok(Math.abs(Math.hypot(fast.vx, fast.vy) - fireCap) < 1e-9);
  }
});

test('Air Hockey pause freezes its clock as well as physics and drains frame inputs', () => {
  const updateSource = hockey.slice(hockey.indexOf('  function update(dt)'), hockey.indexOf('  /* ========================================================== render */'));
  let keyFrames = 0, pointerFrames = 0;
  const state = { paused: true, t: 12, stateT: 2, lastRocket: 11 };
  const context = { st: state, Kit: { keys: { endFrame() { keyFrames++; } } }, ptr: { endFrame() { pointerFrames++; } } };
  vm.runInNewContext(`${updateSource}; this.update = update;`, context);
  for (let i = 0; i < 120; i++) context.update(1 / 60);
  assert.deepEqual(state, { paused: true, t: 12, stateT: 2, lastRocket: 11 });
  assert.equal(keyFrames, 120);
  assert.equal(pointerFrames, 120);
});
