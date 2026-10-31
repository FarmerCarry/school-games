import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

test('classroom courses preserve obstacle order and spacing across controls and frame rates', () => {
  const patterns = [() => ({}), () => ({ jump: true }),
    t => ({ jump: Math.floor(t * 30 + 1e-7) % 23 < 2 }),
    t => { const f = Math.floor(t * 30 + 1e-7); return { jump: f % 37 < 22, duck: f % 55 >= 48 }; }];
  function trace(seed, hz, input) {
    const engine = createEngine(seed), seen = new Map(), samples = [];
    function observe() {
      for (const o of engine.state.obstacles) {
        if (!seen.has(o.id)) {
          const { id, type, variant, width, height, depth, bottom } = o;
          seen.set(id, { id, type, variant, width, height, depth, bottom, position: engine.state.distance - o.z });
        }
        // Record the original collider first, then bypass death only to sample
        // generation beyond the bird/score thresholds under different controls.
        // This does not substitute for the collision-enabled playability test.
        o.bottom = 1000;
      }
    }
    for (let frame = 0; frame < hz * 120; frame++) {
      observe(); engine.step(1 / hz, input(frame / hz));
      if ((frame + 1) % (hz * 10) === 0) {
        const { elapsed, distance, score, speed, points, night } = engine.state;
        samples.push({ elapsed, distance, score, speed, points, night });
      }
    }
    observe();
    assert.equal(engine.state.alive, true);
    return { obstacles: [...seen.values()], samples };
  }
  for (const seed of [1, 11, 2026, 10000]) {
    const expected = trace(seed, 120, patterns[0]);
    assert.ok(expected.obstacles.some(o => o.type === 'bird'), 'compare the late bird selection too');
    for (const hz of [30, 60, 120]) for (const input of patterns) {
      const actual = trace(seed, hz, input);
      assert.deepEqual(actual.samples, expected.samples, `seed ${seed}, ${hz} Hz: score and course clocks`);
      assert.equal(actual.obstacles.length, expected.obstacles.length);
      actual.obstacles.forEach(({ position, ...shape }, i) => {
        const { position: target, ...targetShape } = expected.obstacles[i];
        assert.deepEqual(shape, targetShape, `seed ${seed}, ${hz} Hz: original obstacle ${i}`);
        assert.ok(Math.abs(position - target) < 1e-8, `seed ${seed}, ${hz} Hz: course position ${i}`);
        if (i) assert.ok(Math.abs((position - actual.obstacles[i - 1].position) -
          (target - expected.obstacles[i - 1].position)) < 1e-8, 'same obstacle gap');
      });
    }
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

/* ---------------------------------------------------------- difficulty tiers */
// Kit.dda picks a tier (1..5) for a surprise course; a course code always plays tier 3.
const { tiers: TIERS, tier: tierOf, knobs: KNOBS } = context.Dino3D;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
// The reaction policy of the playability test above, as a function of the state.
function react(s) {
  const p = s.player, next = s.obstacles.find(o => o.z < o.depth / 2 + C.playerHalfDepth);
  const until = next ? -next.z / s.speed : 9, airborne = p.y > 0;
  let jump = airborne && !(p.vy < 0 && p.y < 0.8), duck = false;
  if (!airborne && next && until < 0.38) {
    if (next.type === 'cactus' || next.bottom < C.duckTop) jump = true;
    else if (next.bottom < C.playerTop) duck = true;
  }
  return { jump, duck };
}

test('tier 3 is the original balance and the default for anything else', () => {
  assert.deepEqual(json(tierOf(3)), { tier: 3, startSpeed: 15, maxSpeed: 35, speedEvery: 100, recovery: 1.08, spread: 0.43,
    birdScore: 400, birdChance: 0.29, birds: [0, 1, 2], cacti: [0, 1, 2, 3], grace: 0, par: 600 });
  assert.deepEqual([C.startSpeed, C.maxSpeed, C.birdScore, C.recoveryTime], [15, 35, 400, 1.08], 'the original constants stay');
  for (const odd of [undefined, null, 0, 6, -1, NaN, '3', 'x', {}]) assert.equal(tierOf(odd), TIERS[2], String(odd));
  assert.deepEqual([1, 2, 3, 4, 5].map(n => tierOf(n).tier), [1, 2, 3, 4, 5]);
  assert.ok(Object.isFrozen(TIERS) && TIERS.every(t => Object.isFrozen(t) && Object.isFrozen(t.birds) && Object.isFrozen(t.cacti)));
  const plain = createEngine(2026), third = createEngine(2026, 3);
  assert.equal(plain.state.tier, 3);
  for (let i = 0; i < 60 * 40; i++) { plain.step(1 / 60, react(plain.state)); third.step(1 / 60, react(third.state)); }
  assert.deepEqual(json(third.state), json(plain.state));
});

test('tier 3 replays the courses and a reaction-policy run exactly as the game did before tiers', () => {
  // Hashes recorded from the engine at da6fa54, before the tiers existed: obstacles as
  // first seen and the course clocks over 180 s with harmless colliders, and a
  // collision-enabled reaction-policy run of up to 200 s.
  const before = { 1: ['e6519cda92d83364', 'cf210905dc217e3b'], 43: ['c4f6e9155149b26b', 'ebca6451e6d3f9b1'],
    2027: ['4c178f4691ccf733', '4a67d880bebc6dd7'], 10000: ['bc9f9d18f24cc749', 'd5540c4bdcc3b957'] };
  function course(engine) {
    const seen = new Map(), samples = [];
    for (let frame = 0; frame < 60 * 180; frame++) {
      for (const o of engine.state.obstacles) {
        if (!seen.has(o.id)) seen.set(o.id, [o.id, o.type, o.variant, o.width, o.depth, o.height, o.bottom, engine.state.distance - o.z]);
        o.bottom = 1000;
      }
      engine.step(1 / 60, {});
      if ((frame + 1) % 600 === 0) { const s = engine.state; samples.push([s.elapsed, s.distance, s.score, s.speed, s.points, s.night]); }
    }
    return [...seen.values(), samples];
  }
  function play(engine) {
    for (let frame = 0; frame < 60 * 200 && engine.state.alive; frame++) engine.step(1 / 60, react(engine.state));
    const s = engine.state;
    return [s.alive, s.elapsed, s.distance, s.score, s.speed, s.player, s.obstacles.map(o => [o.id, o.z])];
  }
  for (const [seed, hashes] of Object.entries(before)) {
    for (const tier of [undefined, 3]) {
      assert.deepEqual([sha(course(createEngine(+seed, tier))), sha(play(createEngine(+seed, tier)))], hashes, `seed ${seed}, tier ${tier}`);
    }
  }
});

test('every tier knob moves one way from tier 1 to 5, and tiers 1-2 and 4-5 really differ from 3', () => {
  assert.deepEqual(Object.keys(KNOBS).sort(), Object.keys(TIERS[0]).filter(k => k !== 'tier').sort());
  for (const [knob, way] of Object.entries(KNOBS)) {
    for (let i = 1; i < 5; i++) {
      const a = TIERS[i - 1][knob], b = TIERS[i][knob];
      if (way === 'set') assert.ok(a.every(v => b.includes(v)) && a.length <= b.length, `${knob}: tier ${i + 1} keeps tier ${i}'s kinds`);
      else assert.ok(way > 0 ? b >= a : b <= a, `${knob} ${way > 0 ? 'rises' : 'falls'} from tier ${i} to ${i + 1} (${a} -> ${b})`);
    }
  }
  const [t1, t2, t3, t4, t5] = TIERS;
  // Slower, longer gaps, fewer kinds, later birds and kinder colliders for 6-9 year olds.
  for (const easy of [t1, t2]) {
    assert.ok(easy.startSpeed < t3.startSpeed && easy.maxSpeed < t3.maxSpeed && easy.speedEvery > t3.speedEvery);
    assert.ok(easy.recovery > t3.recovery && easy.birdScore > t3.birdScore && easy.birdChance < t3.birdChance);
    assert.ok(easy.birds.length < t3.birds.length && easy.cacti.length < t3.cacti.length && easy.grace > 0);
  }
  assert.deepEqual(json([t1.birds, t1.cacti]), [[0], [0, 1]], 'tier 1: low birds to jump and the two smallest cacti');
  // Faster, denser and earlier birds for skilled 10-11 year olds, with tier 3's fair colliders.
  for (const hard of [t4, t5]) {
    assert.ok(hard.startSpeed > t3.startSpeed && hard.maxSpeed > t3.maxSpeed && hard.speedEvery < t3.speedEvery);
    assert.ok(hard.recovery < t3.recovery && hard.birdScore < t3.birdScore && hard.birdChance > t3.birdChance && hard.grace === 0);
  }
  // A full held flight lasts under 0.82 s: even tier 5 leaves time to land before the next jump.
  assert.ok(t5.recovery > 0.9);
});

test('every tier keeps its own pace, gaps and obstacle kinds, and reset keeps the tier unless given one', () => {
  for (const T of TIERS) {
    const engine = createEngine(79, T.tier), seen = new Set();
    assert.deepEqual([engine.state.tier, engine.state.speed], [T.tier, T.startSpeed]);
    let birds = 0, cacti = 0;
    for (let i = 0; i < 60 * 400; i++) {
      const { obstacles, speed, score } = engine.state;
      assert.equal(speed, Math.min(T.maxSpeed, T.startSpeed + Math.floor(score / T.speedEvery)));
      for (let j = 0; j < obstacles.length; j++) {
        const o = obstacles[j];
        if (!seen.has(o.id)) {
          seen.add(o.id);
          if (o.type === 'bird') { birds++; assert.ok(score >= T.birdScore && T.birds.includes(o.variant), `tier ${T.tier} bird ${o.variant} at ${score}`); }
          else if (o.id > 1) { cacti++; assert.ok(T.cacti.includes(o.variant), `tier ${T.tier} cactus ${o.variant}`); }
        }
        if (j) {
          const previous = obstacles[j - 1];
          const free = previous.z - o.z - (previous.depth + o.depth) / 2 - C.playerHalfDepth * 2;
          assert.ok(free / speed >= T.recovery - 0.04, `tier ${T.tier}: recovery gap ${free / speed}`);
        }
        o.bottom = 1000;
      }
      engine.step(1 / 60, {});
    }
    assert.equal(engine.state.speed, T.maxSpeed);
    assert.ok(birds > 10 && cacti > 100, `tier ${T.tier}: ${birds} birds, ${cacti} cacti`);
  }
  const engine = createEngine(5, 1);
  engine.reset();
  assert.deepEqual([engine.state.tier, engine.state.seed], [1, 5]);
  engine.reset(9);
  assert.deepEqual([engine.state.tier, engine.state.seed, engine.state.speed], [1, 9, TIERS[0].startSpeed]);
  engine.reset(9, 4);
  assert.deepEqual([engine.state.tier, engine.state.speed], [4, TIERS[3].startSpeed]);
});

test('every tier stays playable from its first pace through its top speed', () => {
  for (const T of TIERS) for (const seed of [11, 53, 2026]) {
    const engine = createEngine(seed, T.tier);
    for (let frame = 0; frame < 60 * 300 && engine.state.alive; frame++) engine.step(1 / 60, react(engine.state));
    assert.equal(engine.state.alive, true, `tier ${T.tier}, seed ${seed} (score ${engine.state.score})`);
    assert.equal(engine.state.speed, T.maxSpeed);
  }
  // A timed held jump clears every cactus the tier uses at every speed it reaches.
  for (const T of TIERS) for (const variant of T.cacti) for (const speed of [T.startSpeed, T.maxSpeed]) {
    const engine = createEngine(3, T.tier), s = engine.state;
    s.score = s.points = (speed - T.startSpeed) * T.speedEvery;
    s.speed = speed;
    s.obstacles = [obstacle({ variant, width: [0.8, 1.25, 1.5, 1.05][variant], depth: [0.72, 0.9, 1.7, 0.85][variant],
      height: [1.3, 1.65, 1.45, 2][variant], z: -speed * 0.38 })];
    advance(engine, 0.8, { jump: true });
    assert.equal(s.alive, true, `tier ${T.tier}, cactus ${variant}, speed ${speed}`);
  }
});

// How long (ms) a child may be early or late with a jump and still clear the smallest
// cactus at a tier's starting speed: the range of press times, before the cactus art
// reaches the dinosaur, that survive a tap (0.1 s) or one full held jump (0.6 s).
function pressWindow(tier, hold) {
  const T = tierOf(tier), reach = 0.72 / 2 + C.playerHalfDepth;
  let clear = 0;
  for (let lead = 0; lead <= 0.8; lead += 0.004) {
    const engine = createEngine(3, tier), s = engine.state;
    s.obstacles = [obstacle({ z: -reach - lead * T.startSpeed })];
    const o = s.obstacles[0];
    for (let f = 0; f < 90 && s.alive && o.z <= reach; f++) engine.step(1 / 60, { jump: f / 60 < hold });
    if (s.alive) clear++;
  }
  return clear * 4;
}

test('tiers 1 and 2 give a wider timing window for each jump than tier 3, not only slower obstacles', () => {
  // A slower world keeps the cactus under the dinosaur for longer, which narrows the
  // window; the kinder colliders must more than make up for it.
  const [tap1, tap2, tap3] = [1, 2, 3].map(tier => pressWindow(tier, 0.1));
  const [held1, held2, held3] = [1, 2, 3].map(tier => pressWindow(tier, 0.6));
  assert.ok(tap1 >= tap3 * 1.15 && tap2 >= tap3 * 1.05, `taps: ${tap1} / ${tap2} / ${tap3} ms`);
  assert.ok(held1 > held2 && held2 > held3, `held jumps: ${held1} / ${held2} / ${held3} ms`);
});

test('tiers 1 and 2 have kinder colliders: a jump that clips a cactus at tier 3 clears it', () => {
  // The dinosaur's feet are at y = 1, still rising, over the smallest cactus (top at 1.3:
  // the feet must pass 1.06 at tier 3, 0.91 at tier 2 and 0.76 at tier 1).
  for (const [tier, alive] of [[1, true], [2, true], [3, false], [5, false]]) {
    const engine = createEngine(3, tier);
    engine.state.obstacles = [obstacle({ z: 0 })];
    Object.assign(engine.state.player, { y: 1, vy: 3, jumpAge: 0 });
    engine.step(0.05, { jump: true });
    assert.equal(engine.state.alive, alive, `tier ${tier}`);
  }
});
