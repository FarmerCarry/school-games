import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() {
  const context = vm.createContext({});
  for (const file of ['physics.js', 'levels.js', 'solutions.js', 'engine.js']) {
    vm.runInContext(readFileSync(path.join(repo, 'games/castle-crash', file), 'utf8'), context, { filename: file });
  }
  return context;
}
const { CC, CCL, CCS, CCP } = load();

test('every fort stands still for 10 seconds', () => {
  for (const level of CCL.levels) {
    const rest = CC.restMax(level);
    assert.equal(rest.ok, true, `${level.id} speed ${rest.speed} popped ${rest.popped || ''}`);
    assert.ok(rest.speed < 2, level.id);
  }
});

test('every recorded solution clears its level in at least 20 seconds', () => {
  for (const level of CCL.levels) {
    const shots = CCS[level.id];
    assert.ok(shots && shots.length >= 1, level.id);
    const a = CC.replay(level, shots, { spare: 0, tough: 1, seed: 1 });
    const b = CC.replay(level, shots, { spare: 0, tough: 1, seed: 1 });
    assert.equal(a.cleared, true, level.id);
    assert.ok(a.used <= level.ammo, `${level.id} used ${a.used}`);
    assert.ok(a.time >= 20, `${level.id} time ${a.time}`);
    assert.equal(a.popped, b.popped, level.id);
    assert.equal(a.time, b.time, level.id);
    assert.equal(a.stars, b.stars, level.id);
    assert.ok(a.stars >= 1 && a.stars <= 3, level.id);
  }
});

test('a stack of 8 boxes stays upright for 30 seconds', () => {
  const w = CCP.create(1);
  CCP.addBox(w, { x: 400, y: 680, w: 2000, h: 80, type: 'static', m: 0, fr: 0.9, re: 0.02, role: 'ground' });
  for (let i = 0; i < 8; i++) {
    CCP.addBox(w, { x: 400, y: 616 - i * 48, w: 48, h: 48, m: 28, fr: 0.75, re: 0.04, role: 'block' });
  }
  for (let s = 0; s < 30 * 60; s++) CCP.step(w);
  for (const b of w.bodies) {
    if (b.type !== 'dynamic') continue;
    assert.ok(Math.abs(b.x - 400) < 3, 'x ' + b.x);
    assert.ok(Math.abs(Math.atan2(Math.sin(b.a), Math.cos(b.a))) < 0.08, 'angle ' + b.a);
    assert.ok(CCP.speed(b) < 2, 'speed ' + CCP.speed(b));
  }
});

test('a bowling ball breaks a wood wall', () => {
  const box = CC.sandbox();
  for (let i = 0; i < 3; i++) {
    CC.addBlock(box.world, { mat: 'wood', x: 860, y: 616 - i * 46, w: 46, h: 46, a: 0, fort: 0 }, 0, 0, false);
  }
  box.sling = { x: 280, y: 580 };
  box.phase = 'aim';
  box.angle = 0.05;
  box.power = 1;
  box.ammo = 'bowl';
  box.allow = ['bowl'];
  assert.equal(CC.fire(box), true);
  CC.run(box, 3);
  assert.ok(box.broken >= 1, 'broken ' + box.broken);
});

test('a duel is symmetric and its wind stays bounded', () => {
  for (let i = 0; i < 12; i++) {
    const duel = CC.startDuel({ seed: i + 2 });
    assert.equal(CC.symmetric(duel), true, 'seed ' + (i + 2));
    for (let t = 0; t < 6; t++) {
      assert.ok(Math.abs(duel.wind) <= CCP.WIND_MAX + 1e-9, duel.wind);
      CC.step(duel);
      if (duel.phase === 'aim') duel.turnT = CC.TIME.duelCap;
    }
  }
});

test('the cpu aimer is wild at tier 1 and sharp at tier 5', () => {
  const easy = CC.cpuHitRate(1, 40, 4);
  const hard = CC.cpuHitRate(5, 40, 4);
  assert.ok(easy <= 0.4, 'tier 1 hit ' + easy);
  assert.ok(hard >= 0.7, 'tier 5 hit ' + hard);
});
