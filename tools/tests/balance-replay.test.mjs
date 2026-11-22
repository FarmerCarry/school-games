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

// Verify rebuilt Air Hockey engine power-ups launch extra pucks toward the opponent and respect MAX_PUCK.
const hockeyEngineSource = readFileSync(new URL('../../games/air-hockey/engine.js', import.meta.url), 'utf8');
const ahMod = { exports: {} };
vm.runInNewContext(hockeyEngineSource, { module: ahMod, exports: ahMod.exports, Math, Object, Array });
const AHEngine = ahMod.exports;

test('Air Hockey multi-puck power-up launches bonus pucks toward the opponent goal for either side', () => {
  for (const side of [0, 1]) {
    const w = AHEngine.create({ target: 7, powerUps: true, seed: 3 });
    w.phase = 'play';
    const p = w.pucks[0];
    p.alive = true; p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.last = side;
    w.item.alive = true; w.item.kind = 'multi'; w.item.x = 0; w.item.y = 0; w.item.t = 0;
    AHEngine.step(w, 1 / 60, [{ x: 0, y: 320, spd: 0 }, { x: 0, y: -320, spd: 0 }]);
    const spawned = w.pucks.filter((q, idx) => idx > 0 && q.alive);
    assert.equal(spawned.length, 2);
    const expectedDir = side === 0 ? -1 : 1;
    for (const q of spawned) assert.equal(Math.sign(q.vy), expectedDir);
  }
});

test('Air Hockey puck speed stays capped at MAX_PUCK after extreme mallet strikes', () => {
  const w = AHEngine.create({ target: 7, powerUps: false, seed: 9 });
  w.phase = 'play';
  const p = w.pucks[0];
  p.alive = true; p.x = 0; p.y = 180; p.vx = 0; p.vy = 1800;
  w.mallets[0].x = 0; w.mallets[0].y = 260; w.mallets[0].px = 0; w.mallets[0].py = 260;
  for (let i = 0; i < 6; i++) {
    AHEngine.step(w, 1 / 60, [{ x: 0, y: 40, spd: 5000 }, { x: 0, y: -320, spd: 0 }]);
    assert.ok(Math.hypot(p.vx, p.vy) <= AHEngine.T.MAX_PUCK + 1e-6);
  }
});

test('Air Hockey engine is deterministic for a fixed seed and freezes on zero dt', () => {
  const run = () => {
    const w = AHEngine.create({ target: 5, powerUps: true, seed: 42 });
    w.phase = 'play';
    w.pucks[0].alive = true; w.pucks[0].vx = 380; w.pucks[0].vy = -510;
    for (let i = 0; i < 60; i++) AHEngine.step(w, 1 / 60, [{ x: 40, y: 300, spd: 900 }, { x: -40, y: -300, spd: 900 }]);
    const frozenT = w.t, frozenX = w.pucks[0].x;
    AHEngine.step(w, 0, [{ x: 200, y: 200, spd: 900 }, { x: 0, y: -200, spd: 900 }]);
    assert.equal(w.t, frozenT);
    assert.equal(w.pucks[0].x, frozenX);
    return [w.t, w.pucks[0].x, w.pucks[0].y, w.score];
  };
  assert.deepEqual(run(), run());
});
