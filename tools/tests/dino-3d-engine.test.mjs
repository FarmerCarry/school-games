// Dino 3D 3-Lane Stampede engine (games/dino-3d/engine.js) pure unit tests:
// 3-lane steering, jump/duck/fast-fall physics, Magma Boulder chase tension,
// smashable crates/bones -> 5s Golden Rampage Roar, bouncy mushrooms, boost pads,
// zero mandatory Stage-1 duck walls, all 15 levels solvable at easy & hard DDA,
// endless 4-digit seeds & world transitions, and v3 save schema.
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
    assert.ok(lv.length >= 250 && lv.length <= 650);
  }
});

test('3-lane steering snaps crisply across lanes -1, 0, +1 and clamps bounds', () => {
  const w = D.createWorld({ level: 0, ddaLevel: 0.35 });
  w.obs.length = 0;
  assert.equal(w.p.lane, 0);

  D.step(w, DT, { leftPressed: true });
  assert.equal(w.p.lane, -1);
  assert.ok(w.ev.some(e => e.t === 'lane' && e.lane === -1));
  w.ev.length = 0;

  // Pressing left again clamps at -1
  D.step(w, DT, { leftPressed: true });
  assert.equal(w.p.lane, -1);

  for (let i = 0; i < 15; i++) D.step(w, DT, {});
  assert.ok(Math.abs(w.p.lx - (-D.LANE_WIDTH)) < 0.05, 'lx converges smoothly to left lane');

  D.step(w, DT, { rightPressed: true });
  D.step(w, DT, { rightPressed: true });
  assert.equal(w.p.lane, 1);
  for (let i = 0; i < 15; i++) D.step(w, DT, {});
  assert.ok(Math.abs(w.p.lx - D.LANE_WIDTH) < 0.05, 'lx converges smoothly to right lane');

  // Direct targetLane (mouse-X / swipe) works too
  D.step(w, DT, { targetLane: 0 });
  assert.equal(w.p.lane, 0);
});

test('jump physics: variable hop height, jump buffer, coyote time, and fast-fall duck', () => {
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
  assert.ok(maxShort > 1.3 && maxShort < 2.5, 'short hop peak: ' + maxShort);
  assert.ok(maxLong > 2.8 && maxLong < 4.4, 'held jump peak: ' + maxLong);
  assert.ok(maxLong > maxShort + 0.9, 'holding jump goes meaningfully higher than tapping');

  // Jump buffer
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

  // Duck & fast-fall
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
  assert.ok(landFast > 0 && landFast < landNorm - 5, `fast-fall lands sooner (${landFast} vs ${landNorm})`);
});

test('smashing crates/bones charges 5s Golden Rampage that bulldozes hazards for bonus eggs', () => {
  const w = D.createWorld({ level: 3, ddaLevel: 0.35 });
  w.obs.length = 0;
  w.items.length = 0;
  // Place 3 smashable crates/bones in center lane followed by a tall hazard!
  w.obs.push(
    { id: 1, kind: 'crate', x: 8, baseX: 8, lane: 0, lx: 0, w: 1.25, y0: 0, y1: 1.25, hazard: false, smashFree: true, bonus: 3, roarCharge: 0.28, smashed: false, cleared: false, hit: false },
    { id: 2, kind: 'bones', x: 14, baseX: 14, lane: 0, lx: 0, w: 1.35, y0: 0, y1: 1.05, hazard: false, smashFree: true, bonus: 4, roarCharge: 0.32, smashed: false, cleared: false, hit: false },
    { id: 3, kind: 'bones', x: 20, baseX: 20, lane: 0, lx: 0, w: 1.35, y0: 0, y1: 1.05, hazard: false, smashFree: true, bonus: 4, roarCharge: 0.32, smashed: false, cleared: false, hit: false },
    { id: 4, kind: 'tall',  x: 28, baseX: 28, lane: 0, lx: 0, w: 1.2,  y0: 0, y1: 2.35, hazard: true,  smashFree: false, bonus: 5, roarCharge: 0,    smashed: false, cleared: false, hit: false }
  );
  let sawRampage = false, smashedHazard = false;
  for (let i = 0; i < 160; i++) {
    D.step(w, DT, {});
    if (w.ev.some(e => e.t === 'roar' && e.duration === D.RAMPAGE_DURATION)) sawRampage = true;
    if (w.ev.some(e => e.t === 'smash' && e.id === 4 && e.rampage)) smashedHazard = true;
    w.ev.length = 0;
  }
  assert.equal(sawRampage, true, 'smashing crates/bones triggers 5s Golden Rampage');
  assert.equal(smashedHazard, true, 'Golden Rampage bulldozes tall hazard cleanly');
  assert.equal(w.bumps, 0, 'Rampage grants invincibility while smashing hazards');
  assert.ok(w.eggs >= 16, 'crates + bones + smashed hazard award generous egg shower: ' + w.eggs);
});

test('Magma Boulder closes in on stumble and drops back on boost pad or Rampage', () => {
  const w = D.createWorld({ level: 3, ddaLevel: 0.4 });
  w.obs.length = 0;
  w.items.length = 0;
  const distBefore = w.boulderDist;
  w.obs.push(
    { id: 10, kind: 'low', x: 6, baseX: 6, lane: 0, lx: 0, w: 1.1, y0: 0, y1: 1.1, hazard: true, smashFree: false, bonus: 4, smashed: false, cleared: false, hit: false },
    { id: 11, kind: 'boost', x: 24, baseX: 24, lane: 0, lx: 0, w: 2.4, y0: 0, y1: 0.45, hazard: false, boost: true, roarCharge: 0.16, smashed: false, cleared: false, hit: false }
  );
  let afterBump = 1, afterBoost = 0;
  for (let i = 0; i < 140; i++) {
    D.step(w, DT, {});
    if (w.ev.some(e => e.t === 'bump')) afterBump = w.boulderDist;
    if (w.ev.some(e => e.t === 'boost')) afterBoost = w.boulderDist;
    w.ev.length = 0;
  }
  assert.ok(afterBump < distBefore - 0.2, `boulder surges closer on bump (${afterBump} vs ${distBefore})`);
  assert.ok(afterBoost > afterBump + 0.15, `boost pad pushes boulder back (${afterBoost} vs ${afterBump})`);
});

test('Stage 1-1 has zero arches/flyers and every wave leaves a safe lane (no mouse-unfriendly walls)', () => {
  const w1 = D.createWorld({ level: 0, ddaLevel: 0.35 });
  assert.equal(w1.obs.some(o => o.kind === 'arch' || o.kind === 'flyer'), false, 'Stage 1-1 has zero arches/flyers');

  for (let lv = 0; lv < D.LEVEL_COUNT; lv++) {
    const w = D.createWorld({ level: lv, ddaLevel: 0.6 });
    // Group hazards by approximate Z band and verify all 3 lanes are never simultaneously blocked by hazards.
    const hazards = w.obs.filter(o => o.hazard);
    for (const h of hazards) {
      const sameWave = hazards.filter(o => Math.abs(o.x - h.x) < 1.8);
      const blockedLanes = new Set(sameWave.map(o => o.lane));
      assert.ok(blockedLanes.size < 3, `level ${lv + 1} at x=${h.x.toFixed(1)} leaves at least 1 lane clear`);
    }
  }
});

test('all 15 journey levels are cleanly solvable at both easy and hard DDA via pure 3-lane weaving/jumping', () => {
  for (const ddaLevel of [0.1, 0.9]) {
    for (let lv = 0; lv < D.LEVEL_COUNT; lv++) {
      const w = D.createWorld({ level: lv, ddaLevel });
      for (let f = 0; f < 4500 && !w.done && !w.over; f++) {
        // Simple greedy lane-weaver (never even needs to duck!): pick an open lane ahead!
        const ahead = w.obs.filter(o => o.hazard && !o.smashed && o.x > w.x - 0.5 && o.x < w.x + 11);
        let targetLane = w.p.lane;
        const laneBlocked = ln => ahead.some(o => o.lane === ln);
        if (laneBlocked(targetLane)) {
          for (const cand of [0, -1, 1]) {
            if (!laneBlocked(cand)) { targetLane = cand; break; }
          }
        }
        D.step(w, DT, { targetLane });
        w.ev.length = 0;
      }
      assert.equal(w.done, true, `level ${lv + 1} (dda=${ddaLevel}) finished cleanly`);
      assert.equal(w.bumps, 0, `level ${lv + 1} (dda=${ddaLevel}) cleared with zero bumps`);
    }
  }
});

test('endless mode transitions across worlds and reproduces identically for 4-digit codes', () => {
  assert.equal(D.parseCode('0042'), '0042');
  assert.equal(D.parseCode('abc'), '');
  assert.equal(D.parseCode('42'), '');

  const a = D.createWorld({ endless: true, code: '1234', ddaLevel: 0.4 });
  const b = D.createWorld({ endless: true, code: '1234', ddaLevel: 0.4 });
  const c = D.createWorld({ endless: true, code: '9876', ddaLevel: 0.4 });
  assert.deepEqual(
    a.obs.slice(0, 8).map(o => [o.kind, o.lane, Math.round(o.x * 100)]),
    b.obs.slice(0, 8).map(o => [o.kind, o.lane, Math.round(o.x * 100)]),
    'same 4-digit code builds identical 3-lane track'
  );
  assert.notDeepEqual(
    a.obs.slice(0, 8).map(o => [o.kind, o.lane, Math.round(o.x * 100)]),
    c.obs.slice(0, 8).map(o => [o.kind, o.lane, Math.round(o.x * 100)]),
    'different codes produce different tracks'
  );

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

test('save schema v3 validates unlocks, computes stars, and World 1 gentle mode preserves last heart', () => {
  const migrated = D.loadSave({ v: 2, stars: [3, 3, 3], bank: 999, color: 4, hat: 4 });
  assert.equal(migrated.v, 3);
  assert.equal(migrated.bank, 0);

  const valid = D.loadSave({ v: 3, stars: [3, 2, 0], best: [40, 22], bank: 30, far: 185, color: 5, hat: 1, seenBank: 10, coached: true });
  assert.equal(valid.color, 0, 'locked color clamped to 0');
  assert.equal(valid.hat, 1, 'unlocked leaf hat kept');
  assert.equal(D.nextLevel(valid), 2);

  for (let lv = 0; lv < 3; lv++) {
    const w = D.createWorld({ level: lv, ddaLevel: 0 });
    for (let f = 0; f < 10000 && !w.done && !w.over; f++) { D.step(w, DT, {}); w.ev.length = 0; }
    assert.equal(w.over, false, `level 1-${lv + 1} never ends early`);
    assert.equal(w.done, true, `level 1-${lv + 1} reaches the nest`);
  }
});
