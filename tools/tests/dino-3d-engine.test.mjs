import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const context = vm.createContext({});
for (const file of ['data.js', 'engine.js']) {
  vm.runInContext(readFileSync(path.join(repo, 'games/dino-3d', file), 'utf8'), context, { filename: file });
}
const { createEngine, config: C } = context.Dino3D;
const json = value => JSON.parse(JSON.stringify(value));
const obstacle = (extra = {}) => ({ id: 99, type: 'cactus', z: -5, width: 0.8, depth: 0.72, height: 1.3, bottom: 0, variant: 0, ...extra });

function advance(engine, seconds, input = {}, harmless = false, hz = 60) {
  const events = [];
  for (let i = 0; i < Math.round(seconds * hz); i++) {
    // Move only obstacle colliders out of the lane vertically; movement, spawning,
    // random selection, removal, scoring, and the player are still simulated.
    if (harmless) for (const o of engine.state.obstacles) o.bottom = 1000;
    events.push(...engine.step(1 / hz, typeof input === 'function' ? input(i, engine.state) : input));
  }
  return events;
}

test('jump input causes lift, release changes height, and no second jump starts in the air', () => {
  const idle = createEngine(1), held = createEngine(1), tapped = createEngine(1);
  advance(idle, 0.3);
  assert.equal(idle.state.player.y, 0);
  let heldPeak = 0, tapPeak = 0, jumpEvents = 0;
  for (let i = 0; i < 42; i++) {
    jumpEvents += held.step(1 / 60, { jump: true }).filter(e => e === 'jump').length;
    tapped.step(1 / 60, { jump: i < 5 });
    heldPeak = Math.max(heldPeak, held.state.player.y);
    tapPeak = Math.max(tapPeak, tapped.state.player.y);
  }
  assert.equal(jumpEvents, 1, 'holding jump cannot reset upward velocity in midair');
  assert.ok(heldPeak > tapPeak + 0.7, `${heldPeak} should exceed ${tapPeak}`);
  assert.ok(heldPeak > 3 && heldPeak < 3.5);
  assert.equal(tapped.state.player.y, 0, 'a released short jump has landed');
  assert.ok(held.state.player.y > 0, 'a held jump remains airborne longer');
});

test('holding jump repeats after landing, while duck wins over a held jump', () => {
  const engine = createEngine(2);
  const events = advance(engine, 1.3, { jump: true });
  assert.equal(events.filter(e => e === 'jump').length, 2);
  assert.equal(events.filter(e => e === 'land').length, 1);
  advance(engine, 0.5, { jump: true, duck: true });
  assert.equal(engine.state.player.y, 0);
  assert.equal(engine.state.player.duck, true);
  assert.deepEqual(json(advance(engine, 0.3, { jump: true, duck: true })), []);
});

test('duck in midair accelerates descent and clears its pose when released', () => {
  const normal = createEngine(2), fast = createEngine(2);
  advance(normal, 0.25, { jump: true }); advance(fast, 0.25, { jump: true });
  advance(normal, 0.2, { jump: true }); advance(fast, 0.2, { jump: true, duck: true });
  assert.ok(fast.state.player.y < normal.state.player.y - 1);
  assert.ok(fast.state.player.vy < normal.state.player.vy - 15);
  fast.step(1 / 60, {});
  assert.equal(fast.state.player.duck, false);
});

test('ground cactus crashes exactly once, freezes score, and reset restores the same seeded course', () => {
  const engine = createEngine('classroom');
  const initial = json(engine.state);
  const events = advance(engine, 4);
  assert.equal(engine.state.alive, false);
  assert.equal(events.filter(e => e === 'crash').length, 1);
  const crashed = json(engine.state);
  assert.deepEqual(json(advance(engine, 10, { jump: true })), []);
  assert.deepEqual(json(engine.state), crashed, 'game-over simulation must stay frozen');
  assert.notEqual(engine.reset(), crashed);
  assert.deepEqual(json(engine.state), initial);
});

test('bird heights require the corresponding action and duck cannot pass through a cactus', () => {
  for (const [bottom, duck, alive] of [[0.65, true, false], [1.55, false, false], [1.55, true, true], [3.4, false, true]]) {
    const engine = createEngine(3);
    engine.state.obstacles = [obstacle({ type: 'bird', depth: 1.35, height: 0.62, bottom, z: -2 })];
    advance(engine, 0.4, { duck });
    assert.equal(engine.state.alive, alive, `bird bottom=${bottom}, duck=${duck}`);
  }
  const cactus = createEngine(3);
  cactus.state.obstacles = [obstacle({ z: -2 })];
  advance(cactus, 0.4, { duck: true });
  assert.equal(cactus.state.alive, false);
});

test('a timed held jump clears every cactus shape', () => {
  for (const [height, depth] of [[1.3, 0.72], [1.65, 0.9], [1.45, 1.7], [2, 0.85]]) {
    for (const score of [0, 500, 2000]) {
      const engine = createEngine(3);
      engine.state.score = engine.state.points = score;
      engine.state.speed = Math.min(35, 15 + Math.floor(score / 100));
      engine.state.obstacles = [obstacle({ height, depth, z: -engine.state.speed * 0.38 })];
      advance(engine, 0.8, { jump: true });
      assert.equal(engine.state.alive, true, `height=${height}, depth=${depth}, speed=${engine.state.speed}`);
    }
  }
});

test('swept collision catches an obstacle crossing the whole player between supplied frames', () => {
  const engine = createEngine(4);
  engine.state.score = engine.state.points = 2000;
  engine.state.speed = 35;
  engine.state.obstacles = [obstacle({ z: -3, depth: 0.05 })];
  const events = engine.step(0.2, {});
  assert.equal(engine.state.alive, false);
  assert.equal(events.filter(e => e === 'crash').length, 1);
  assert.ok(Math.abs(engine.state.obstacles[0].z + 0.505) < 1e-7, 'stop at impact, not behind the dinosaur');
  assert.ok(Math.abs(engine.state.elapsed - 2.495 / 35) < 1e-7);
});

test('swept vertical collision allows genuine clearance but catches the descending body', () => {
  const clear = createEngine(5), falling = createEngine(5);
  for (const engine of [clear, falling]) engine.state.obstacles = [obstacle({ z: -0.9 })];
  Object.assign(clear.state.player, { y: 3, vy: 0, jumpAge: 0.3 });
  Object.assign(falling.state.player, { y: 1.08, vy: -18, jumpAge: 0.6 });
  clear.step(0.1, { jump: true }); falling.step(0.1, {});
  assert.equal(clear.state.alive, true);
  assert.equal(falling.state.alive, false);
});

test('score milestones fire once and speed/score-rate tiers stop at their defined maximum', () => {
  const engine = createEngine(6);
  const events = advance(engine, 10, {}, true);
  assert.equal(engine.state.score, 100);
  assert.equal(engine.state.speed, 16);
  assert.equal(events.filter(e => e === 'milestone').length, 1);
  advance(engine, 90, {}, true);
  assert.equal(engine.state.score, 1000);
  advance(engine, 10, {}, true);
  assert.equal(engine.state.score, 1200);
  advance(engine, 90, {}, true);
  assert.equal(engine.state.score, 3000);
  advance(engine, 10, {}, true);
  assert.equal(engine.state.score, 3400);
  assert.equal(engine.state.speed, C.maxSpeed);
});

test('seeded course and input replay are deterministic, including reset to a new seed', () => {
  const a = createEngine(888), b = createEngine(888), different = createEngine(889);
  assert.notDeepEqual(json(a.state), json(different.state));
  for (let i = 0; i < 15000; i++) {
    const input = { jump: i % 78 < 45, duck: i % 109 > 104 };
    for (const engine of [a, b]) {
      for (const o of engine.state.obstacles) o.bottom = 1000;
      engine.step(1 / 60, input);
    }
  }
  assert.deepEqual(json(a.state), json(b.state));
  a.reset(889);
  assert.deepEqual(json(a.state), json(different.state));
});

test('30, 60 and 120 Hz produce the same jump and score progression', () => {
  const states = [30, 60, 120].map(hz => {
    const engine = createEngine(22);
    advance(engine, 2, { jump: true }, true, hz);
    return engine.state;
  });
  for (const actual of states.slice(1)) {
    for (const key of ['elapsed', 'distance', 'score', 'speed']) assert.ok(Math.abs(actual[key] - states[0][key]) < 1e-7, key);
    assert.ok(Math.abs(actual.player.y - states[0].player.y) < 1e-7);
    assert.ok(Math.abs(actual.player.vy - states[0].player.vy) < 1e-7);
  }
});

test('long runs have bounded obstacles, safe recovery gaps, birds only after their threshold, and a night cycle', () => {
  const engine = createEngine(79);
  const seen = new Set();
  let birdCount = 0, maxCount = 0, hadNight = false;
  for (let i = 0; i < 60 * 600; i++) {
    const { obstacles, speed, score } = engine.state;
    maxCount = Math.max(maxCount, obstacles.length);
    hadNight ||= engine.state.night > 0.99;
    for (let j = 0; j < obstacles.length; j++) {
      const o = obstacles[j];
      if (!seen.has(o.id)) {
        seen.add(o.id);
        if (o.type === 'bird') { birdCount++; assert.ok(score >= C.birdScore); }
      }
      if (j) {
        const previous = obstacles[j - 1];
        const freeDistance = previous.z - o.z - (previous.depth + o.depth) / 2 - C.playerHalfDepth * 2;
        assert.ok(freeDistance / speed >= C.recoveryTime - 0.04, 'minimum recovery remains available as speed rises');
      }
      o.bottom = 1000;
    }
    engine.step(1 / 60, {});
  }
  assert.ok(seen.size > 200, 'exercise repeated spawn/recycle cycles');
  assert.ok(birdCount > 30, 'exercise flying obstacle selection');
  assert.ok(maxCount <= C.maxObstacles && maxCount <= 5, `bounded active pool: ${maxCount}`);
  assert.equal(hadNight, true);
  assert.equal(engine.state.alive, true);
});

test('generated mixed courses remain playable from the initial pace through maximum speed', () => {
  // A simple reaction policy uses only the next visible obstacle. Unlike the
  // long-run pool test, collisions stay enabled throughout these actual runs.
  for (const seed of [11, 29, 53, 101, 277, 2026]) {
    const engine = createEngine(seed);
    for (let frame = 0; frame < 60 * 300 && engine.state.alive; frame++) {
      const s = engine.state, p = s.player;
      const next = s.obstacles.find(o => o.z < o.depth / 2 + C.playerHalfDepth);
      const until = next ? -next.z / s.speed : 9;
      const airborne = p.y > 0;
      let jump = airborne && !(p.vy < 0 && p.y < 0.8), duck = false;
      if (!airborne && next && until < 0.38) {
        if (next.type === 'cactus' || next.bottom < C.duckTop) jump = true;
        else if (next.bottom < C.playerTop) duck = true;
      }
      engine.step(1 / 60, { jump, duck });
    }
    assert.equal(engine.state.alive, true, `reaction policy should clear seed ${seed} (score ${engine.state.score})`);
    assert.equal(engine.state.speed, C.maxSpeed);
    assert.ok(engine.state.score >= 6900);
  }
});
