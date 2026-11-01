import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const context = { console, Math };
context.globalThis = context;
vm.createContext(context);
for (const file of ['data.js', 'engine.js']) {
  vm.runInContext(readFileSync(path.join(repo, 'games/key-runner', file), 'utf8'), context, { filename: file });
}
const KR = context.KeyRunner;
const C = KR.C;

function course(pieces, extra = {}) {
  return KR.createEngine(Object.assign({ pieces, x: 0, y: 0, z: 0, speed: 0 }, extra));
}
function pad(id, z, extra = {}) {
  return Object.assign({ id, t: 'key', stage: 0, x: 0, z, y: -C.HH, hw: 1.4, hh: C.HH, hd: 1.2, stand: true }, extra);
}
function run(engine, seconds, input, hz = 120) {
  const events = [];
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i++) events.push(...engine.step(1 / hz, typeof input === 'function' ? input(i, engine) : input));
  return events;
}
function peak(inputHold) {
  const engine = course([pad(1, 0, { hw: 3, hd: 3 })]);
  let top = 0;
  for (let i = 0; i < 80; i++) {
    engine.step(1 / 120, { jump: i < inputHold });
    top = Math.max(top, engine.state.players[0].y);
  }
  return top;
}

test('variable jump is at least 1.6 times taller when held', () => {
  const tap = peak(2);
  const held = peak(80);
  assert.ok(held / tap >= 1.6, `${held} / ${tap}`);
  assert.ok(tap > 0.7 && tap < KR.holdHeight());
});

test('coyote time accepts a jump at 100ms and rejects one at 150ms', () => {
  function leaveThen(delaySteps) {
    const engine = course([pad(1, 0)]);
    let left = -1;
    for (let i = 0; i < 200; i++) {
      const before = engine.state.players[0].onGround;
      engine.step(1 / 120, { z: 1 });
      if (before && !engine.state.players[0].onGround && left < 0) left = i;
      if (left >= 0 && i === left + delaySteps) {
        engine.step(1 / 120, { z: 1, jump: true });
        return engine.state.players[0].vy;
      }
    }
    return 0;
  }
  assert.ok(leaveThen(12) > 5, '100ms coyote jump');
  assert.ok(leaveThen(18) < 1, '150ms is too late');
});

test('jump buffer at 100ms before landing still jumps', () => {
  const engine = course([pad(1, 0, { hw: 3, hd: 3 })]);
  const pl = engine.state.players[0];
  pl.onGround = false;
  pl.y = 0.55;
  pl.vy = -6;
  engine.step(1 / 120, { jump: true });
  let jumped = false;
  for (let i = 0; i < 40; i++) jumped = jumped || engine.step(1 / 120, {}).some(e => e.e === 'jump');
  assert.equal(jumped, true);
  const late = course([pad(1, 0, { hw: 3, hd: 3 })]);
  const q = late.state.players[0];
  q.onGround = false;
  q.y = 3.2;
  q.vy = -6;
  late.step(1 / 120, { jump: true });
  let lateJump = false;
  for (let i = 0; i < 80; i++) lateJump = lateJump || late.step(1 / 120, {}).some(e => e.e === 'jump');
  assert.equal(lateJump, false);
});

test('a guided climb clears the first stage in a recess and hold-forward falls on the next', () => {
  assert.equal(KR.audit().length, 0);
  assert.equal(KR.worlds()[0].stages.length, 8);
  for (const stage of KR.worlds()[0].stages) {
    const kinds = new Set(stage.pieces.map((p) => p.t));
    assert.ok(kinds.size >= 2, 'stage ' + stage.index + ' needs two piece types');
  }
  const bot = KR.createEngine({ mode: 'world', world: 0, speed: 0 });
  const memory = {};
  let stageOne = 0;
  for (let i = 0; i < 120 * 40 && bot.state.players[0].stage < 1; i++) {
    bot.step(1 / 120, KR.suggest(bot.state, 0, memory));
    if (!stageOne && bot.state.players[0].stage >= 1) stageOne = bot.state.time;
  }
  assert.ok(stageOne >= 20 && stageOne <= 30, `stage 1 took ${stageOne}`);
  assert.equal(bot.state.players[0].falls, 0);
  const hold = KR.createEngine({ mode: 'world', world: 0, speed: 0 });
  let fell = null;
  for (let i = 0; i < 120 * 40 && !fell; i++) {
    const ev = hold.step(1 / 120, { z: 1 });
    const hit = ev.find((e) => e.e === 'fall');
    if (hit) fell = { t: hold.state.time, stage: hold.state.players[0].stage };
  }
  assert.ok(fell && fell.stage >= 1 && fell.stage <= 2, 'hold-forward should fall on stage 2 or 3');
  const side = KR.createEngine({ mode: 'world', world: 0, speed: 0 });
  let sideT = 0;
  for (let i = 0; i < 120 * 10 && !sideT; i++) {
    if (side.step(1 / 120, { x: 1, z: 0.15 }).some((e) => e.e === 'fall')) sideT = side.state.time;
  }
  assert.ok(sideT > 0 && sideT < 10, 'a sidestep can fall within 10s, took ' + sideT);
});

test('sinking keys warn then drop, gates block, and a lip of 0.2 can be stepped onto', () => {
  const sink = course([pad(1, 0, { t: 'sink', hw: 2, hd: 2 })], { z: 0 });
  const base = sink.state.players[0].y;
  run(sink, 0.3, {});
  assert.ok(Math.abs(base - sink.state.players[0].y) < 0.12, 'the first half-second only wobbles');
  run(sink, 0.5, {});
  assert.ok(base - sink.state.players[0].y > 0.35, 'standing on a sink drops the runner');
  const gate = course([
    pad(1, 0, { hw: 2, hd: 2 }),
    { id: 2, t: 'gate', stage: 0, x: 0, z: 1.2, y: 0.4, hw: 2, hh: 1.2, hd: 0.2, stand: false, n: 10 }
  ], { speed: 0, z: 0 });
  run(gate, 0.8, { z: 1 });
  assert.ok(gate.state.players[0].z < 1.3, 'a speed gate stops a slow runner');
  const open = course([
    pad(1, 0, { hw: 3, hd: 3 }),
    { id: 2, t: 'gate', stage: 0, x: 0, z: 0, y: 1, hw: 2, hh: 1, hd: 0.2, stand: false, n: 10 }
  ], { speed: 10, z: -1 });
  run(open, 0.6, { z: 1 });
  assert.ok(open.state.players[0].z > 1, 'enough speed walks through');
  const lip = course([
    pad(1, 0, { hw: 1.2, hd: 1.2 }),
    pad(2, 2.3, { hw: 1.2, hd: 1.2, y: -C.HH + 0.2 })
  ]);
  run(lip, 0.55, { z: 1 });
  assert.ok(lip.state.players[0].y > 0.1, 'corner correction steps onto the lip');
  assert.equal(lip.state.players[0].falls, 0);
});

test('a fall keeps speed and the current stage', () => {
  const engine = course([pad(1, 0, { hw: 2, hd: 2 })], { speed: 40 });
  const pl = engine.state.players[0];
  pl.speed = 40;
  pl.stage = 2;
  pl.cp.stage = 2;
  pl.y = -7;
  run(engine, 0.95, {});
  assert.equal(pl.speed, 40);
  assert.equal(pl.stage, 2);
  assert.ok(pl.y > -0.2);
});

test('shoes and rebirths stack, the daily seed is stable, and the landing ring exists in the air', () => {
  assert.equal(KR.stepGain(1, 0), 1);
  assert.equal(KR.stepGain(2, 0), 2);
  assert.ok(Math.abs(KR.stepGain(2, 2) - 2 * 1.5 * 1.5) < 1e-9);
  assert.equal(KR.dailySeed(new Date(2026, 9, 25)), 20261025);
  const engine = course([pad(1, 0, { hw: 2, hd: 2 })]);
  engine.step(1 / 120, { jump: true });
  run(engine, 0.05, { jump: true });
  const pl = engine.state.players[0];
  assert.equal(pl.onGround, false);
  const land = engine.predictLanding(0);
  const shadow = engine.shadowPoint(0);
  assert.ok(land && shadow);
  assert.equal(land.miss, false);
  assert.ok(shadow.y <= pl.y);
  const cam = engine.cameraPose(0);
  assert.equal(cam.inside, false);
});

test('walking the first stage does not farm a speed stat', () => {
  const world = KR.createEngine({ mode: 'world', world: 0, speed: 40 });
  world.reset({ mode: 'world', world: 0, speed: 40 });
  const z0 = world.state.players[0].z;
  for (let i = 0; i < 60 * 8; i++) world.step(1 / 60, { z: 1 });
  const pl = world.state.players[0];
  assert.ok(pl.z > z0 + 25, 'the opening runway keeps moving, z=' + pl.z);
  assert.equal(pl.speed, 40);
  assert.equal(pl.falling, 0);
  assert.ok(world.state.players[0].z < 1.2 || z0 < 1.2);
});

test('corrupt saves fall back and a real save keeps the career', () => {
  assert.equal(KR.normalizeSave(null).speed, 0);
  assert.equal(KR.normalizeSave({ v: 2, speed: 99 }).wins, 0);
  const raw = KR.defaultSave();
  raw.speed = 120;
  raw.wins = 7;
  raw.rebirths = 2;
  raw.unlocked = 4;
  raw.shoe = 3;
  raw.owned.shoes = [1, 3];
  raw.medals['1-2'] = { time: 12, medal: 'gold', noFall: 1, word: 0 };
  raw.tower['20261025'] = 40;
  raw.quality = 'low';
  const save = KR.normalizeSave(raw);
  assert.equal(save.speed, 120);
  assert.equal(save.shoe, 3);
  assert.equal(save.medals['1-2'].medal, 'gold');
  assert.equal(save.tower['20261025'], 40);
  assert.equal(save.quality, 'low');
  assert.equal(KR.normalizeSave({ v: 1, medals: { 'nope': { medal: 'gold' } } }).medals.nope, undefined);
});
