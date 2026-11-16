import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() {
  const context = vm.createContext({});
  for (const file of ['data.js', 'engine.js']) {
    vm.runInContext(readFileSync(path.join(repo, 'games/robo-swarm', file), 'utf8'), context, { filename: file });
  }
  return { RS: context.RS, RSD: context.RSD };
}
const { RS, RSD } = load();

function rngOf(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circle(t) {
  const ang = t * 0.85;
  return { x: -Math.sin(ang), y: Math.cos(ang), dash: 0 };
}

function clearPools(run) {
  run.rFreeN = RS.CAP_R;
  run.pFreeN = RS.CAP_P;
  for (let i = 0; i < RS.CAP_R; i++) { run.rAlive[i] = 0; run.rFree[i] = RS.CAP_R - 1 - i; }
  for (let i = 0; i < RS.CAP_P; i++) { run.pAlive[i] = 0; run.pFree[i] = RS.CAP_P - 1 - i; }
}

test('the spatial hash matches a brute-force circle check on random scenes', () => {
  const run = RS.newRun({ seed: 1, players: 2 });
  for (let scene = 0; scene < 24; scene++) {
    const rand = rngOf(1000 + scene * 17);
    clearPools(run);
    const robots = 8 + ((rand() * 80) | 0);
    const shots = 5 + ((rand() * 40) | 0);
    for (let i = 0; i < robots; i++) {
      const r = 8 + rand() * 62;
      const id = RS.spawnRobot(run, i % 9, rand() * RSD.W, rand() * RSD.H);
      run.rr[id] = r;
    }
    for (let i = 0; i < shots; i++) {
      const id = run.pFree[--run.pFreeN];
      run.pAlive[id] = 1;
      run.px[id] = rand() * RSD.W;
      run.py[id] = rand() * RSD.H;
      run.pr[id] = 6 + rand() * 28;
      run.pOwner[id] = i % 5 === 0 ? -1 : 0;
      run.pKind[id] = run.pOwner[id] < 0 ? 3 : 0;
    }
    run.x[0] = rand() * RSD.W;
    run.y[0] = rand() * RSD.H;
    run.x[1] = rand() * RSD.W;
    run.y[1] = rand() * RSD.H;
    assert.deepEqual(RS.robotHits(run), RS.robotHitsBrute(run), 'scene ' + scene);
  }
  // A full cap, including a king-sized body on the world edge.
  clearPools(run);
  const rand = rngOf(99);
  for (let i = 0; i < RS.CAP_R; i++) {
    const id = RS.spawnRobot(run, i === 0 ? 8 : i % 6, rand() * RSD.W, rand() * RSD.H);
    if (i === 0) { run.rx[id] = 8; run.ry[id] = 8; run.rr[id] = 70; }
  }
  for (let i = 0; i < RS.CAP_P; i++) {
    const id = run.pFree[--run.pFreeN];
    run.pAlive[id] = 1;
    run.px[id] = rand() * RSD.W;
    run.py[id] = rand() * RSD.H;
    run.pr[id] = 10;
  }
  assert.deepEqual(RS.robotHits(run), RS.robotHitsBrute(run), 'full cap');
});

test('card offers skip maxed and locked upgrades, never repeat, and include a ready evolution', () => {
  const run = RS.newRun({ seed: 2, players: 2 });
  const rand = rngOf(5);
  for (let n = 0; n < 30; n++) {
    run.offerFor = n % 2;
    run.level = 1;
    run.hurtN[run.offerFor] = 0;
    const offer = RS.offerCards(run, rand);
    assert.ok(offer.length >= 1 && offer.length <= 3);
    assert.equal(new Set(offer).size, offer.length, 'no repeats');
    assert.ok(!offer.includes(RSD.SHIELD), 'shield is locked before the first hit');
    assert.ok(!offer.includes(RSD.HEART), 'heart is locked before level 3');
    assert.ok(!offer.includes(RSD.TORNADO) && !offer.includes(RSD.CANNON));
    for (const id of offer) assert.ok(run.lv[run.offerFor][id] < 5);
  }
  run.offerFor = 0;
  run.level = 4;
  run.hurtN[0] = 2;
  run.lv[0][RSD.FOAM] = 5;
  let offer = RS.offerCards(run, rand);
  assert.ok(!offer.includes(RSD.FOAM), 'a maxed weapon stays out');
  run.lv[0][RSD.DUCKS] = 5;
  run.lv[0][RSD.MAGNET] = 5;
  offer = RS.offerCards(run, rand);
  assert.ok(offer.includes(RSD.TORNADO), 'duck + magnet offers the tornado');
  assert.equal(RS.applyCard(run, 0, RSD.TORNADO), true);
  offer = RS.offerCards(run, rand);
  assert.ok(!offer.includes(RSD.TORNADO), 'a taken evolution is not offered again');
  run.lv[0][RSD.PAINT] = 5;
  offer = RS.offerCards(run, rand);
  assert.ok(offer.includes(RSD.CANNON));
  // The second player still has a clean build, so the same roll is not a copy of player 1.
  run.offerFor = 1;
  const other = RS.offerCards(run, rngOf(5));
  assert.ok(!other.includes(RSD.TORNADO) && !other.includes(RSD.CANNON));
});

test('entity counts stay inside the caps while the arena is flooded', () => {
  const run = RS.newRun({ seed: 4, tier: 5, map: 3, cards: false, immortal: true });
  const input = [{ x: 1, y: 0, dash: 1 }];
  for (let i = 0; i < 60 * 40; i++) {
    RS.step(run, 1 / 60, input);
    if (i % 30 === 0) {
      const c = RS.counts(run);
      assert.ok(c.robots <= RS.CAP_R, c.robots);
      assert.ok(c.projectiles <= RS.CAP_P, c.projectiles);
      assert.ok(c.bolts <= RS.CAP_B, c.bolts);
      assert.ok(c.zones <= RS.CAP_Z, c.zones);
    }
  }
  RS.stress(run);
  const full = RS.counts(run);
  assert.equal(full.robots, RS.CAP_R);
  RS.step(run, 1 / 60, input);
  const after = RS.counts(run);
  assert.ok(after.robots <= RS.CAP_R && after.projectiles <= RS.CAP_P && after.bolts <= RS.CAP_B);
});

test('a circling bot that takes the first card lasts 90s at tier 3, and dies before 4:00 at tier 5 with no upgrades', () => {
  const skilled = RS.newRun({ seed: 3, tier: 3, map: 1, players: 1 });
  for (let i = 0; i < 90 * 60; i++) {
    while (skilled.cards) RS.resolveCards(skilled);
    RS.step(skilled, 1 / 60, [circle(i / 60)]);
    assert.notEqual(skilled.over, 'lose', 'tier 3 died at ' + skilled.t.toFixed(1));
  }
  assert.ok(skilled.t >= 90 - 1e-4, skilled.t);

  const bare = RS.newRun({ seed: 3, tier: 5, map: 1, players: 1, cards: false });
  for (let i = 0; i < 240 * 60 && !bare.over; i++) RS.step(bare, 1 / 60, [circle(i / 60)]);
  assert.equal(bare.over, 'lose', 'tier 5 was still up at ' + bare.t.toFixed(1));
  assert.ok(bare.t < 240, bare.t);
});

test('a full 4:30 of a crowded arena steps in under 3 seconds', () => {
  const run = RS.newRun({ seed: 11, tier: 5, map: 2, cards: false, immortal: true });
  const input = [{ x: 0.2, y: 1, dash: 0 }];
  const t0 = performance.now();
  let peak = 0;
  for (let i = 0; i < 270 * 60; i++) {
    RS.step(run, 1 / 60, input);
    if ((i & 63) === 0) {
      const c = RS.counts(run);
      if (c.robots > peak) peak = c.robots;
      assert.ok(c.robots <= RS.CAP_R && c.projectiles <= RS.CAP_P && c.bolts <= RS.CAP_B);
    }
  }
  const ms = performance.now() - t0;
  assert.ok(run.t >= 270, run.t);
  assert.ok(peak > 40, 'the arena actually filled (' + peak + ')');
  assert.ok(ms < 3000, ms.toFixed(0) + ' ms, peak robots ' + peak);
});

test('the king is beatable by a mid build inside a minute, on every tier', () => {
  const dps = RSD.midDps();
  for (let tier = 1; tier <= 5; tier++) {
    const hpMul = 0.8 + (1.3 - 0.8) * ((tier - 1) / 4);
    const hp = Math.round(RSD.bots[8].hp * hpMul);
    assert.ok(hp <= dps * 60, 'tier ' + tier + ' hp ' + hp + ' dps ' + dps.toFixed(1));
  }
  const run = RS.newRun({
    seed: 8, tier: 5, map: 1, cards: false, immortal: true,
    levels: [4, 3, 0, 3, 3, 0, 0, 0, 0, 0]
  });
  run.t = run.bossAt - 0.02;
  const input = [{ x: 0, y: 0, dash: 0 }];
  let killed = false;
  for (let i = 0; i < 60 * 60 && !killed; i++) {
    const id = run.kingId;
    if (id >= 0 && run.rAlive[id]) {
      const dx = run.rx[id] - run.x[0], dy = run.ry[id] - run.y[0];
      const d = Math.hypot(dx, dy) || 1;
      const want = 112;
      input[0].x = (dx / d) * ((d - want) / 40);
      input[0].y = (dy / d) * ((d - want) / 40);
    }
    RS.step(run, 1 / 60, input);
    if (run.bossPopped) killed = true;
  }
  assert.equal(killed, true, 'boss hp left ' + (run.kingId >= 0 ? run.rhp[run.kingId] : 'none'));
});

test('the same seed and the same inputs leave the same world', () => {
  function play(seed) {
    const run = RS.newRun({ seed: seed, tier: 4, map: 2, players: 2 });
    const inputs = [{ x: 0, y: 0, dash: 0 }, { x: 0, y: 0, dash: 0 }];
    for (let i = 0; i < 60 * 25; i++) {
      while (run.cards) RS.resolveCards(run);
      const t = i / 60;
      inputs[0].x = Math.cos(t * 1.3);
      inputs[0].y = Math.sin(t * 0.7);
      inputs[0].dash = i % 97 === 0 ? 1 : 0;
      inputs[1].x = -Math.sin(t);
      inputs[1].y = Math.cos(t * 0.5);
      inputs[1].dash = i % 140 === 0 ? 1 : 0;
      RS.step(run, 1 / 60, inputs);
    }
    while (run.cards) RS.resolveCards(run);
    return RS.fingerprint(run);
  }
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});
