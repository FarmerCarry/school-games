// Deterministic pure-engine tests for Chaos Island (جزيرة الفوضى).
// Runs in Node with zero browser/DOM/Kit dependencies.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E = require(path.join(repo, 'games/chaos-island/engine.js'));

const IDLE = [{ moveX: 0, jumpPressed: false, jumpDown: false, downPressed: false }];

function stepN(world, n, inputFn) {
  const events = [];
  for (let i = 0; i < n; i++) {
    const inp = typeof inputFn === 'function' ? inputFn(world, i) : inputFn;
    events.push(...E.step(world, 1 / 60, inp));
  }
  return events;
}

test('determinism: identical seeds and inputs produce bit-identical state', () => {
  const runOnce = () => {
    const w = E.create({ seed: 98765, tier: 3 });
    stepN(w, 60 * 14, (_, f) => [{
      moveX: f % 120 < 60 ? 1 : -1,
      jumpPressed: f % 55 === 0,
      jumpDown: f % 55 < 10,
      downPressed: false
    }]);
    return {
      round: w.round,
      phase: w.phase,
      disaster: w.disaster,
      schedule: w.schedule,
      actors: w.actors.map(a => [Math.round(a.x * 1e4), Math.round(a.y * 1e4), a.hearts, a.coins, a.survived])
    };
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('coyote time, jump buffer, platform landing, drop-through, and bouncy drum work', () => {
  const w = E.create({ seed: 101, schedule: ['meteor'] });
  const p = w.actors[0];

  // Jump buffer: press jump slightly before landing still executes jump upon landing
  p.x = -3.6; p.y = 1.2; p.ground = false; p.vy = -8;
  stepN(w, 1, [{ moveX: 0, jumpPressed: true, jumpDown: true, downPressed: false }]);
  stepN(w, 12, [{ moveX: 0, jumpPressed: false, jumpDown: true, downPressed: false }]);
  assert.ok(p.vy > 4 || p.y > 0.9, 'buffered jump fires on landing');

  // Coyote time: walking off a platform still allows jumping within COYOTE_TIME
  p.x = -7.0; p.y = 1.65; p.ground = true; p.platId = 'crate_w1'; p.vy = 0; p.vx = 6.5;
  stepN(w, 4, [{ moveX: 1, jumpPressed: false, jumpDown: false, downPressed: false }]);
  assert.equal(p.ground, false);
  stepN(w, 1, [{ moveX: 1, jumpPressed: true, jumpDown: true, downPressed: false }]);
  assert.ok(p.vy > 10, 'coyote jump fires just after leaving ledge');

  // Drop-through one-way platform via S/ArrowDown
  p.x = -3.0; p.y = 3.0; p.ground = true; p.platId = 'bridge'; p.vy = 0;
  stepN(w, 1, [{ moveX: 0, jumpPressed: false, jumpDown: false, downPressed: true }]);
  stepN(w, 12, IDLE);
  assert.ok(p.y < 2.8, 'down drops through one-way bridge');

  // Bouncy drum launches high onto mid/upper decks
  p.x = E.DRUM.x; p.y = E.GROUND_Y + 0.1; p.vy = -2; p.ground = false;
  const evs = stepN(w, 3, IDLE);
  assert.ok(evs.some(e => e.type === 'bounce'), 'drum emits bounce event');
  assert.ok(p.vy > 13, 'drum launches player strongly upward');
});

test('all 6 disasters threaten idle ground players and respect shelter or high ground', () => {
  // 1) Flood submerges ground (y=0.3) while lighthouse/bridge (y>=3.0) stay completely safe
  {
    const w = E.create({ seed: 11, schedule: ['flood'], tier: 2 });
    const evs = stepN(w, 60 * 8, IDLE);
    assert.ok(evs.some(e => e.type === 'hit' && e.actorId === 'p1' && e.reason === 'flood'), 'flood hurts idle player on ground');

    const wSafe = E.create({ seed: 11, schedule: ['flood'], tier: 2 });
    const ps = wSafe.actors[0];
    ps.x = 0; ps.y = 4.95; ps.platId = 'lighthouse_top';
    stepN(wSafe, 60 * 12, IDLE);
    assert.equal(ps.hearts, 3, 'high ground on lighthouse stays safe above lava');
  }

  // 2) Tornado pulls exposed players while Central Stone Shelter protects inside
  {
    const wOpen = E.create({ seed: 22, schedule: ['tornado'], tier: 3 });
    const pOpen = wOpen.actors[0];
    stepN(wOpen, 60 * 11, IDLE);
    assert.ok(Math.abs(pOpen.x - (-3.6)) > 0.5 || pOpen.hearts < 3, 'tornado pulls or hits exposed player');

    const wShel = E.create({ seed: 22, schedule: ['tornado'], tier: 3 });
    const pShel = wShel.actors[0];
    pShel.x = 0; pShel.y = E.GROUND_Y;
    assert.equal(E.inShelter(pShel), true);
    stepN(wShel, 60 * 11, IDLE);
    assert.equal(pShel.hearts, 3, 'stone shelter protects player from tornado');
  }

  // 3) Meteor, Lightning, Coconuts, Quake each spawn telegraphs & impacts
  for (const id of ['meteor', 'lightning', 'coconuts', 'quake']) {
    const w = E.create({ seed: 44, schedule: [id], tier: 3 });
    const evs = stepN(w, 60 * 10, IDLE);
    assert.ok(evs.some(e => e.type === 'telegraph' && e.kind === id), `${id} emits telegraph`);
    if (id !== 'coconuts') {
      assert.ok(evs.some(e => e.type === 'impact' && e.kind === id), `${id} emits impact`);
    }
  }
});

test('standing still NEVER earns stars or a positive DDA score across 25 seeds', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const w = E.create({ seed: seed * 97, tier: 1 });
    stepN(w, 60 * 80, IDLE);
    assert.equal(w.finished, true, `seed ${seed} finishes match`);
    assert.equal(w.actors[0].walk, 0, 'idle player walk stays 0 despite tornado/bumps');
    assert.equal(w.result.humanMoved, false);
    assert.equal(w.result.stars, 0, `seed ${seed}: standing still earns 0 stars`);
    assert.equal(w.result.won, false, `seed ${seed}: standing still cannot win`);
    assert.equal(w.result.ddaOutcome, 0, `seed ${seed}: standing still reports 0 to DDA`);
  }
});

test('active player using coach AI survives and earns stars, score, and coins', () => {
  const w = E.create({ seed: 777, tier: 2 });
  stepN(w, 60 * 85, world => [E.planCoach(world, world.actors[0], 1.0)]);
  assert.equal(w.finished, true, '5-round match finishes');
  assert.equal(w.result.humanMoved, true);
  assert.ok(w.result.roundsSurvived >= 3, 'active dodging player survives most rounds');
  assert.ok(w.result.stars >= 2, 'active player earns >= 2 stars');
  assert.ok(w.result.coins > 0 && w.result.score > 0, 'active player earns coins and score');
});

test('playful player bumping applies gentle boing without modifying walk counter', () => {
  const w = E.create({ seed: 55, duo: true, schedule: ['meteor'] });
  const p1 = w.actors[0], p2 = w.actors[1];
  p1.x = -5.0; p1.y = E.GROUND_Y; p1.vx = 6.5;
  p2.x = -4.4; p2.y = E.GROUND_Y; p2.vx = -6.5;
  const evs = stepN(w, 2, [IDLE[0], IDLE[0]]);
  assert.ok(evs.some(e => e.type === 'bump'), 'colliding players emit bump event');
  assert.equal(p1.walk, 0, 'external bump never increments walk');
  assert.equal(p2.walk, 0, 'external bump never increments walk');
});

test('endless mode continues past 5 rounds and ends when human loses all hearts', () => {
  const w = E.create({ seed: 303, endless: true, tier: 2 });
  stepN(w, 60 * 90, world => [E.planCoach(world, world.actors[0], 1.0)]);
  assert.ok(w.round >= 5 || w.finished, 'endless progresses across waves');

  const wLose = E.create({ seed: 303, endless: true, tier: 3, schedule: ['flood'] });
  stepN(wLose, 60 * 20, IDLE);
  assert.equal(wLose.finished, true, 'endless ends when idle player loses all hearts in lava');
  assert.equal(wLose.result.endless, true);
});

test('2P mode tracks both human players independently and selects a winner', () => {
  const w = E.create({ seed: 808, duo: true, tier: 2 });
  assert.equal(w.actors.filter(a => a.isHuman).length, 2);
  stepN(w, 60 * 85, world => [
    E.planCoach(world, world.actors[0], 1.0),
    IDLE[0]
  ]);
  assert.equal(w.finished, true);
  assert.equal(w.result.duo, true);
  assert.equal(w.result.winner, 'p1', 'active P1 beats idle P2');
  assert.ok(w.actors[0].walk > 50);
  assert.equal(w.actors[1].walk, 0);
});

test('save validation ignores old/corrupt shapes and buyOrEquip handles purchases', () => {
  const fresh = E.loadSave({ v: 3, coins: 9999, helm: 'old' });
  assert.equal(fresh.v, E.SAVE_VERSION);
  assert.equal(fresh.coins, 0, 'legacy v3 save cleanly resets to v4');

  const valid = E.loadSave({ v: E.SAVE_VERSION, coins: 120, bestScore: 450, bestStars: 3, color: 0, hat: 0 });
  assert.equal(valid.coins, 120);
  assert.equal(valid.bestStars, 3);

  assert.equal(E.buyOrEquip(valid, 'hat', 7), 'poor', 'cannot buy crown (180) with 120 coins');
  assert.equal(E.buyOrEquip(valid, 'hat', 3), 'buy', 'can buy pirate hat (65)');
  assert.equal(valid.coins, 55);
  assert.equal(valid.hat, 3);
  assert.equal(E.buyOrEquip(valid, 'hat', 3), 'equip', 're-selecting owned hat equips for free');
  assert.equal(valid.coins, 55);
});
