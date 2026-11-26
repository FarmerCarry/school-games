// Dino 3D engine (games/dino-3d/engine.js) pure unit tests:
// physics (coyote time, jump buffer, variable hop, duck/fast-fall, bouncy mushroom, roar smash),
// all 15 journey levels fairness & finishability, endless world transitions & 4-digit seeds,
// stars/unlocks, and v3 save schema migration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/dino-3d/engine.js'), 'utf8');
const sandbox = { window: {}, Math, Date, Number, Array, Object, String, parseInt, isFinite };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(source, sandbox);
const D = sandbox.window.Dino3D;

const DT = 1 / 60;

test('catalog definitions: 5 worlds, 15 journey levels, 6 colors, 6 hats', () => {
  assert.equal(D.WORLDS.length, 5);
  assert.equal(D.LEVELS.length, 15);
  assert.equal(D.COLORS.length, 6);
  assert.equal(D.HATS.length, 6);
  assert.equal(D.COLORS[0].cost, 0);
  assert.equal(D.HATS[0].cost, 0);
  for (let i = 0; i < D.LEVELS.length; i++) {
    const lv = D.LEVELS[i];
    assert.equal(lv.index, i);
    assert.equal(lv.world, Math.floor(i / 3));
    assert.match(lv.id, /^w[1-5]-[1-3]$/);
    assert.ok(lv.length >= 200 && lv.length <= 500);
  }
});

test('jump physics: variable hop height, jump buffer, coyote time, and fast-fall duck', () => {
  // Compare short tap vs full held jump peak height
  const wShort = D.createWorld({ level: 0, ddaLevel: 0.35 });
  const wLong = D.createWorld({ level: 0, ddaLevel: 0.35 });
  wShort.obs.length = 0; wLong.obs.length = 0;

  let maxShort = 0, maxLong = 0;
  for (let i = 0; i < 90; i++) {
    D.step(wShort, DT, { jumpPressed: i === 0, jump: i === 0 });
    D.step(wLong, DT, { jumpPressed: i === 0, jump: i < 20 });
    if (wShort.p.y > maxShort) maxShort = wShort.p.y;
    if (wLong.p.y > maxLong) maxLong = wLong.p.y;
  }
  assert.ok(maxShort > 1.3 && maxShort < 2.3, 'short hop peak: ' + maxShort);
  assert.ok(maxLong > 2.8 && maxLong < 4.1, 'held jump peak: ' + maxLong);
  assert.ok(maxLong > maxShort + 0.9, 'holding jump goes meaningfully higher than tapping');

  // Jump buffer: pressing jump slightly before landing triggers an immediate next jump
  const wBuf = D.createWorld({ level: 0, ddaLevel: 0.35 });
  wBuf.obs.length = 0;
  D.step(wBuf, DT, { jumpPressed: true, jump: false });
  let buffered = false, secondJumped = false;
  for (let i = 0; i < 80; i++) {
    const fallingNearGround = !wBuf.p.ground && wBuf.p.vy < 0 && wBuf.p.y < 0.7;
    const jp = fallingNearGround && !buffered;
    if (jp) buffered = true;
    D.step(wBuf, DT, { jumpPressed: jp, jump: false });
    if (buffered && wBuf.ev.some(e => e.t === 'jump')) secondJumped = true;
    wBuf.ev.length = 0;
  }
  assert.ok(buffered && secondJumped, 'buffered jump fires immediately on touchdown');

  // Duck on ground lowers hurtbox & fast-fall in air accelerates landing
  const wDuck = D.createWorld({ level: 0, ddaLevel: 0.35 });
  wDuck.obs.length = 0;
  D.step(wDuck, DT, { duck: true });
  assert.equal(wDuck.p.duck, true);
  D.step(wDuck, DT, { duck: false });
  assert.equal(wDuck.p.duck, false);

  const wNorm = D.createWorld({ level: 0, ddaLevel: 0.35 });
  const wFast = D.createWorld({ level: 0, ddaLevel: 0.35 });
  wNorm.obs.length = 0; wFast.obs.length = 0;
  D.step(wNorm, DT, { jumpPressed: true, jump: true });
  D.step(wFast, DT, { jumpPressed: true, jump: true });
  let landNorm = 0, landFast = 0;
  for (let i = 1; i < 120; i++) {
    D.step(wNorm, DT, { jump: i < 12 });
    D.step(wFast, DT, { jump: i < 12, duck: i >= 16 });
    if (!landNorm && wNorm.p.ground) landNorm = i;
    if (!landFast && wFast.p.ground) landFast = i;
  }
  assert.ok(landFast > 0 && landFast < landNorm - 6, `fast-fall lands sooner (${landFast} vs ${landNorm})`);
});

test('bouncy mushroom launches super-bounce high over following tall hazard', () => {
  const w = D.createWorld({ level: 0, ddaLevel: 0.35 });
  const pad = w.obs.find(o => o.kind === 'pad');
  assert.ok(pad, 'level 1-1 includes a bouncy mushroom');
  w.x = pad.x - 1.5;
  w.oi = 0;
  let bounced = false, maxY = 0;
  for (let i = 0; i < 90; i++) {
    D.step(w, DT, {});
    if (w.ev.some(e => e.t === 'bounce')) bounced = true;
    if (w.p.y > maxY) maxY = w.p.y;
    w.ev.length = 0;
  }
  assert.ok(bounced, 'touching mushroom triggers bounce event');
  assert.ok(maxY > 3.8, 'mushroom super-bounce arcs high (' + maxY + ')');
  assert.equal(w.bumps, 0, 'mushroom bounce cleanly sails over the tall obstacle behind it');
});

test('roar smash blasts smashable crate for bonus eggs and recharges over time', () => {
  const w = D.createWorld({ level: 0, ddaLevel: 0.35 });
  const crate = w.obs.find(o => o.kind === 'crate');
  assert.ok(crate, 'level 1-1 has a smashable crate');
  assert.equal(w.p.roar, 1, 'starts with roar ready');
  w.x = crate.x - 2.6;
  w.oi = 0;
  const eggsBefore = w.eggs;
  D.step(w, DT, { roarPressed: true });
  const evs = w.ev.map(e => e.t);
  assert.ok(evs.includes('roar'), 'roar event emitted');
  assert.ok(evs.includes('smash'), 'crate smashed by roar wave');
  assert.equal(crate.smashed, true);
  assert.equal(w.smashed, 1);
  assert.ok(w.eggs >= eggsBefore + 5, 'smashing crate awards +5 bonus eggs');
  assert.equal(w.p.roar, 0, 'roar bar drains upon use');

  // Roar recharges back to 1.0 over time
  w.obs.length = 0;
  for (let i = 0; i < 500; i++) {
    D.step(w, DT, {});
    w.ev.length = 0;
  }
  assert.equal(w.p.roar, 1, 'roar recharges passively to full');
});

test('all 15 journey levels are cleanly solvable at both easy and hard DDA tiers', () => {
  const plans = [
    { jump: 0.08 }, { jump: 0.24 }, { duck: 0.55 }, { duck: 0.85 }, { roar: true }
  ];
  function simulate(w, plan, horizon) {
    const c = D.clone(w);
    for (let t = 0; t < horizon; t += DT) {
      const inp = {
        jumpPressed: !!plan.jump && t === 0,
        jump: !!plan.jump && t < plan.jump,
        duck: !!plan.duck && t < plan.duck,
        roarPressed: !!plan.roar && t === 0
      };
      D.step(c, DT, inp);
      if (c.ev.some(e => e.t === 'bump')) return { hit: true, c };
      c.ev.length = 0;
      if (c.done) return { hit: false, c };
    }
    return { hit: false, c };
  }

  for (const ddaLevel of [0.1, 0.9]) {
    for (let lv = 0; lv < D.LEVEL_COUNT; lv++) {
      const w = D.createWorld({ level: lv, ddaLevel });
      let activePlan = null, planT = 0;
      for (let f = 0; f < 4500 && !w.done && !w.over; f++) {
        if (!activePlan) {
          const look = simulate(w, {}, 0.72);
          if (look.hit) {
            for (const p of plans) {
              if (!simulate(w, p, 1.1).hit) { activePlan = p; planT = 0; break; }
            }
          }
        }
        const inp = activePlan ? {
          jumpPressed: !!activePlan.jump && planT === 0,
          jump: !!activePlan.jump && planT < activePlan.jump,
          duck: !!activePlan.duck && planT < activePlan.duck,
          roarPressed: !!activePlan.roar && planT === 0
        } : {};
        D.step(w, DT, inp);
        w.ev.length = 0;
        if (activePlan) {
          planT += DT;
          const dur = Math.max(activePlan.jump || 0, activePlan.duck || 0, 0.05);
          if (planT >= dur) activePlan = null;
        }
      }
      assert.equal(w.done, true, `level ${lv + 1} (dda=${ddaLevel}) finished cleanly (bumps=${w.bumps})`);
      assert.equal(w.bumps, 0, `level ${lv + 1} (dda=${ddaLevel}) cleared with zero bumps`);
    }
  }
});

test('endless mode transitions seamlessly across worlds and reproduces identically for 4-digit codes', () => {
  assert.equal(D.parseCode('0042'), '0042');
  assert.equal(D.parseCode('abc'), '');
  assert.equal(D.parseCode('42'), '');

  const a = D.createWorld({ endless: true, code: '1234', ddaLevel: 0.4 });
  const b = D.createWorld({ endless: true, code: '1234', ddaLevel: 0.4 });
  const c = D.createWorld({ endless: true, code: '9876', ddaLevel: 0.4 });
  assert.deepEqual(
    a.obs.slice(0, 8).map(o => [o.kind, Math.round(o.x * 100)]),
    b.obs.slice(0, 8).map(o => [o.kind, Math.round(o.x * 100)]),
    'same 4-digit code builds identical obstacle layout'
  );
  assert.notDeepEqual(
    a.obs.slice(0, 8).map(o => [o.kind, Math.round(o.x * 100)]),
    c.obs.slice(0, 8).map(o => [o.kind, Math.round(o.x * 100)]),
    'different codes produce different tracks'
  );

  // World transitions occur every ENDLESS_WORLD_SPAN meters
  a.obs.length = 0;
  let sawChange = false;
  for (let i = 0; i < 1600; i++) {
    D.step(a, DT, {});
    if (a.ev.some(e => e.t === 'worldChange')) sawChange = true;
    a.ev.length = 0;
    if (sawChange) break;
  }
  assert.ok(sawChange && a.worldIndex === 1, 'endless smoothly advances into World 2');
});

test('save schema v3 resets old saves cleanly, validates unlocks, and computes stars', () => {
  // Old v2 save cleanly resets to v3 defaults
  const migrated = D.loadSave({ v: 2, stars: [3, 3, 3], bank: 999, color: 4, hat: 4 });
  assert.equal(migrated.v, 3);
  assert.equal(migrated.bank, 0);
  assert.equal(D.totalStars(migrated), 0);
  assert.equal(migrated.color, 0);
  assert.equal(migrated.hat, 0);

  // Valid v3 save preserves unlocked choices and clamps locked ones
  const valid = D.loadSave({ v: 3, stars: [3, 2, 0], best: [40, 22], bank: 30, far: 185, color: 5, hat: 1, seenBank: 10, coached: true });
  assert.equal(valid.stars[0], 3);
  assert.equal(valid.stars[1], 2);
  assert.equal(valid.bank, 30);
  assert.equal(valid.far, 185);
  assert.equal(valid.color, 0, 'locked color costing 220 clamped back to 0');
  assert.equal(valid.hat, 1, 'unlocked leaf hat (cost 20) kept');
  assert.equal(D.isLevelOpen(valid, 2), true);
  assert.equal(D.isLevelOpen(valid, 3), false);
  assert.equal(D.nextLevel(valid), 2);

  // Unlock diff detection
  const unlocked = D.unlockedBetween(15, 65);
  assert.ok(unlocked.some(u => u.kind === 'hat' && u.index === 1));
  assert.ok(unlocked.some(u => u.kind === 'color' && u.index === 1));
  assert.ok(unlocked.some(u => u.kind === 'color' && u.index === 2));

  // Star computation
  assert.equal(D.computeStars(0, 30, 3, false), 0);
  assert.equal(D.computeStars(5, 30, 2, true), 1);
  assert.equal(D.computeStars(16, 30, 2, true), 2);
  assert.equal(D.computeStars(24, 30, 1, true), 3);
});

test('the first world never ends a run: a child who never presses anything still reaches the nest', () => {
  for (let lv = 0; lv < 3; lv++) {
    const w = D.createWorld({ level: lv, ddaLevel: 0 });
    for (let f = 0; f < 20000 && !w.done && !w.over; f++) { D.step(w, 1 / 60, {}); w.ev.length = 0; }
    assert.equal(w.over, false, `level 1-${lv + 1} never ends early`);
    assert.equal(w.done, true, `level 1-${lv + 1} reaches the nest`);
    assert.ok(w.bumps > 0 && w.p.hp === 1, 'bumps still cost hearts, down to the last one');
  }
  // The second world is a real challenge again.
  const w = D.createWorld({ level: 3, ddaLevel: 0 });
  for (let f = 0; f < 20000 && !w.done && !w.over; f++) { D.step(w, 1 / 60, {}); w.ev.length = 0; }
  assert.equal(w.over, true, 'level 2-1 ends after three bumps');
});
