import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const context = vm.createContext({});
vm.runInContext(readFileSync(path.join(repo, 'games/chaos-island/engine.js'), 'utf8'), context, { filename: 'engine.js' });
const CI = context.CI;

function runUntil(world, phase, cap) {
  let n = 0;
  while (world.phase !== phase && n < cap) { CI.step(world, 1 / 60); n++; }
  return n;
}

test('every island can be climbed above the highest jelly line', () => {
  for (const island of CI.ISLANDS) {
    assert.equal(CI.safeChain(island), true, island.id);
    const tops = island.plats.filter(p => p.spine && !p.solid && !p.ground);
    assert.ok(tops.some(p => p.y <= 300), island.id + ' has a high spine');
  }
});

test('round 1 is an easy disaster and nothing repeats back to back', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const hard of [false, true]) {
      const plan = CI.plan(seed, hard);
      assert.equal(plan.length, 4);
      assert.ok(plan[0].id === 'jelly' || plan[0].id === 'meteor');
      assert.equal(plan[0].power, 1);
      assert.equal(plan[0].id2, null);
      if (hard) assert.ok(plan[1].id2, 'hard combos from round 2');
      else assert.equal(plan[2].id2, null);
      for (let i = 1; i < plan.length; i++) assert.notEqual(plan[i].id, plan[i - 1].id);
      for (const round of plan) {
        assert.ok(round.power >= 1 && round.power <= 5);
        if (round.id2) assert.notEqual(round.id2, round.id);
      }
    }
  }
});

test('an oracle survives every disaster on every island at every intensity', () => {
  const fails = [];
  for (const island of CI.ISLANDS) {
    for (const dis of CI.DISASTERS) {
      for (const power of [1, 2, 3, 4, 5]) {
        const world = CI.create({
          island: island.id, seed: 1000 + power * 17 + dis.id.length * 3,
          players: 1, bots: 0, oracle: true,
          script: [{ id: dis.id, id2: null, power }]
        });
        const hero = world.actors[0];
        runUntil(world, 'stamp', 60 * 70);
        if (hero.mode !== 'run') fails.push(`${island.id}/${dis.id}/p${power} ${hero.why} @${Math.round(hero.dx)},${Math.round(hero.dy)}`);
        assert.ok(world.minTell >= 0.6 - 1e-6, `${dis.id} tell ${world.minTell}`);
      }
    }
  }
  assert.deepEqual(fails, []);
});

test('combo rounds still leave the oracle a way through', () => {
  const pairs = [['jelly', 'meteor'], ['sauce', 'bowl'], ['ice', 'tornado'], ['quake', 'spark'], ['snow', 'gum'], ['beach', 'stomp']];
  const fails = [];
  for (const island of CI.ISLANDS) {
    for (const [a, b] of pairs) {
      const world = CI.create({
        island: island.id, seed: 42, players: 1, bots: 0, oracle: true, hard: true,
        script: [{ id: a, id2: b, power: 5 }]
      });
      const hero = world.actors[0];
      runUntil(world, 'stamp', 60 * 70);
      if (hero.mode !== 'run') fails.push(`${island.id}/${a}+${b} ${hero.why}`);
    }
  }
  assert.deepEqual(fails, []);
});

test('a pop becomes a cloud within a second, sooner with the quick perk', () => {
  const world = CI.create({
    seed: 3, players: 1, bots: 0, perks: [{ quick: false }],
    script: [{ id: 'sauce', power: 1 }]
  });
  runUntil(world, 'danger', 60 * 12);
  const hero = world.actors[0];
  world.hot = true;
  hero.ground = world.plats.find(p => p.ground);
  hero.y = hero.ground.y - hero.h;
  CI.step(world, 1 / 60);
  assert.equal(hero.mode, 'bubble');
  for (let i = 0; i < 30; i++) CI.step(world, 1 / 60);
  assert.equal(hero.mode, 'cloud', 'cloud mode well inside 1s');

  const quick = CI.create({
    seed: 3, players: 1, bots: 0, perks: [{ quick: true }],
    script: [{ id: 'sauce', power: 1 }]
  });
  runUntil(quick, 'danger', 60 * 12);
  const q = quick.actors[0];
  quick.hot = true;
  q.ground = quick.plats.find(p => p.ground);
  q.y = q.ground.y - q.h;
  CI.step(quick, 1 / 60);
  let frames = 0;
  while (q.mode !== 'cloud' && frames < 60) { CI.step(quick, 1 / 60); frames++; }
  assert.ok(frames <= 12, 'quick bubble is faster (' + frames + ')');
});

test('a 1P match of 4 rounds lasts about 4 minutes', () => {
  const world = CI.create({ seed: 7, players: 1, bots: 7, oracle: true });
  let steps = 0;
  while (world.phase !== 'podium' && steps < 60 * 500) { CI.step(world, 1 / 60); steps++; }
  const seconds = steps / 60;
  assert.equal(world.phase, 'podium');
  assert.ok(seconds >= 230 && seconds <= 260, 'match seconds ' + seconds);
  assert.equal(world.round, 4);
  assert.equal(world.pops.length, 4);
});

test('bots keep moving during danger and about 3 to 5 are popped each round', () => {
  const pops = [];
  const whys = new Set();
  let maxStill = 0;
  const seen = new Set();
  for (let match = 0; match < 4; match++) {
    const world = CI.create({ seed: 11 + match * 19, players: 1, bots: 7, oracle: true });
    let steps = 0;
    while (world.phase !== 'podium' && steps < 60 * 500) {
      CI.step(world, 1 / 60);
      steps++;
      if (world.maxStill > maxStill) maxStill = world.maxStill;
    }
    for (const n of world.pops) pops.push(n);
    for (const a of world.actors) if (a.bot && a.why) { whys.add(a.why); seen.add(a.id); }
  }
  const avg = pops.reduce((s, n) => s + n, 0) / pops.length;
  assert.ok(maxStill < 5, 'a bot stood still for ' + maxStill.toFixed(2) + 's');
  assert.ok(avg >= 3 && avg <= 5, 'average pops ' + avg.toFixed(2) + ' from [' + pops.join(',') + ']');
  assert.ok(whys.size >= 3, 'causes ' + [...whys].join(','));
  assert.ok(seen.size >= 4, 'different bots should get popped');
});

test('two players keep separate inputs and coop pays both when one survives', () => {
  const world = CI.create({ seed: 1, players: 2, bots: 0, coop: true, script: [{ id: 'meteor', power: 1 }] });
  runUntil(world, 'danger', 60 * 12);
  CI.setInput(world, 0, { x: 1, y: 0, jump: false, down: false, drop: false, brace: false });
  CI.setInput(world, 1, { x: -1, y: 0, jump: false, down: false, drop: false, brace: false });
  const a = world.actors[0], b = world.actors[1];
  const ax = a.x, bx = b.x;
  for (let i = 0; i < 30; i++) CI.step(world, 1 / 60);
  assert.ok(a.x > ax + 20, 'player 1 moved right');
  assert.ok(b.x < bx - 20, 'player 2 moved left');

  const pay = CI.create({ seed: 2, players: 2, bots: 0, coop: true, script: [{ id: 'sauce', power: 1 }] });
  runUntil(pay, 'danger', 60 * 12);
  const p0 = pay.actors[0], p1 = pay.actors[1];
  const roof = pay.plats.find(p => p.spine && !p.ground);
  p0.ground = roof; p0.x = roof.x + 20; p0.y = roof.y - p0.h; p0.vy = 0;
  pay.hot = true;
  p1.ground = pay.plats.find(p => p.ground);
  p1.y = p1.ground.y - p1.h;
  CI.step(pay, 1 / 60);
  assert.equal(p1.mode, 'bubble');
  assert.equal(p0.mode, 'run');
  runUntil(pay, 'stamp', 60 * 50);
  CI.step(pay, 1 / 60);
  assert.ok(p0.coins > 0 && p1.coins > 0, 'coop coins ' + p0.coins + '/' + p1.coins);
});

function climbWait(a, w) {
  const inp = { x: 0, y: 0, jump: false, down: false, drop: false, brace: false, emote: false };
  if (a.mode !== 'run') return inp;
  let goal = null;
  for (const p of w.plats) {
    if (!p.spine || p.gone || p.solid) continue;
    if (!goal || p.y < goal.y) goal = p;
  }
  if (!goal) return inp;
  const cx = a.x + a.w / 2;
  const on = a.ground === goal && a.y + a.h <= goal.y + 14;
  if (on) {
    const mid = goal.x + goal.w / 2;
    if (Math.abs(cx - mid) > 6) inp.x = Math.sign(mid - cx);
    return inp;
  }
  let next = null;
  for (const p of w.plats) {
    if (!p.spine || p.gone || p.solid || p.y > a.y + a.h - 10 || p.y < goal.y - 2) continue;
    if (cx > p.x - 18 && cx < p.x + p.w + 18 && (!next || p.y > next.y)) next = p;
  }
  if (!next) { inp.x = Math.sign(goal.x + goal.w / 2 - cx) || 1; return inp; }
  const mid = next.x + next.w / 2;
  const overlap = cx > next.x + 6 && cx < next.x + next.w - 6;
  if (!overlap) inp.x = Math.sign(mid - cx);
  else if (a.ground) { inp.jump = true; inp.x = Math.abs(mid - cx) > 22 ? Math.sign(mid - cx) : 0; }
  else inp.x = Math.abs(mid - cx) > 16 ? Math.sign(mid - cx) : 0;
  return inp;
}

test('climbing to the roof and waiting fails meteor and quake', () => {
  const died = [];
  for (const id of ['jelly', 'meteor', 'quake', 'tornado']) {
    const world = CI.create({ island: 'beach', seed: 7, players: 1, bots: 0, script: [{ id, power: 3 }] });
    const hero = world.actors[0];
    let n = 0;
    while (world.phase !== 'stamp' && n < 60 * 70) {
      CI.setInput(world, 0, climbWait(hero, world));
      CI.step(world, 1 / 60);
      n++;
    }
    if (hero.mode !== 'run') died.push(id);
  }
  assert.ok(died.length >= 2, 'climb-only died on ' + died.join(','));
  assert.equal(died.includes('jelly'), false);
  assert.ok(died.includes('meteor') && died.includes('quake'));
});

test('daily mix is a stable date seed', () => {
  const a = CI.daily(20261025), b = CI.daily(20261025), c = CI.daily(20270101);
  assert.deepEqual(a, b);
  assert.notEqual(a.island + a.seed, c.island + ':' + c.seed);
  assert.ok(CI.ISLANDS.some(island => island.id === a.island));
});
