// Desk Karts engine (games/desk-karts/engine.js): pure UMD module check, 4 worlds & 8 tracks
// geometry, closed-loop boundaries & non-overlap, kart steering/drifting, anti-cheat sector
// checkpoints & lap counting, all 4 toy power-ups, world gimmicks (boosts, glue/butter/paint,
// bumpers, portals, magnets), 1P & 2P modes, AI bot 3-lap completion, DDA scaling, and saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/desk-karts/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');
const require = createRequire(import.meta.url);
const DK = require(enginePath);

const DT = 1 / 60;
const EASY = DK.params(0), MID = DK.params(0.5), HARD = DK.params(1);
const ARABIC = /^[\u0600-\u06FF\s]+$/;
const plain = v => JSON.parse(JSON.stringify(v));

function step(w, inputs = []) {
  w.ev.length = 0;
  DK.step(w, DT, inputs);
  return w.ev.slice();
}

// A careful human driver steering along the centerline (dodging hazards/bumpers).
function driveHuman(w, kartId = 0, useItems = true) {
  const k = w.karts[kartId], L = w.L;
  const look = 88 + k.speed * 0.2;
  const targetS = DK.wrapS(L.len, k.s + look);
  let wantOff = 0;
  for (const hz of L.hazards) {
    const ds = DK.wrapS(L.len, hz.s - k.s);
    if (ds > 0 && ds < 160 && Math.abs(wantOff - hz.off) < hz.r + DK.KART_R + 10) {
      wantOff = hz.off >= 0 ? -L.R.w * 0.28 : L.R.w * 0.28;
    }
  }
  for (const bm of L.bumpers) {
    const ds = DK.wrapS(L.len, bm.s - k.s);
    if (ds > 0 && ds < 175) {
      wantOff = bm.off >= 0 ? -L.R.w * 0.34 : L.R.w * 0.34;
    }
  }
  const aim = DK.at(L, targetS);
  const tx = aim.x + aim.nx * wantOff, ty = aim.y + aim.ny * wantOff;
  const diff = DK.wrapAngle(Math.atan2(ty - k.y, tx - k.x) - k.ang);
  return {
    gas: 1,
    brake: 0,
    steer: DK.clamp(diff / 0.5, -1, 1),
    item: useItems && !!k.item,
    active: true
  };
}

test('engine is pure UMD: works in Node and browser sandbox, zero Kit/DOM/timers/Math.random/localStorage', () => {
  assert.ok(DK && DK.build && DK.create && DK.step, 'CommonJS export works');
  const sandbox = { window: {} };
  vm.runInNewContext(engineSource, sandbox);
  assert.ok(sandbox.window.DK && sandbox.window.DK.TRACKS.length === 8, 'window.DK global works');

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('4 worlds of 2 tracks each (8 tracks total), pure Arabic names, and all 4 world themes', () => {
  assert.equal(DK.WORLDS.length, 4);
  assert.equal(DK.TRACKS.length, 8);
  assert.equal(DK.LAPS, 3);
  assert.deepEqual(DK.WORLDS.map(w => w.name), [
    'مكتب الدراسة', 'طاولة الرسم', 'صينية المقصف', 'مختبر العلوم'
  ]);
  const ids = new Set();
  DK.TRACKS.forEach((R, i) => {
    assert.equal(R.id, `${Math.floor(i / 2) + 1}-${(i % 2) + 1}`);
    ids.add(R.id);
    assert.equal(R.world, Math.floor(i / 2));
    assert.match(R.name, ARABIC, R.id + ' name');
    assert.ok(R.w >= 100 && R.w <= 125, R.id + ' width');
    assert.ok(R.coins.length >= 5 && R.boxes.length >= 4, R.id + ' pickups');
  });
  assert.equal(ids.size, 8);
  // World 4 has science lab portals & magnets.
  assert.ok(DK.TRACKS[6].portals.length >= 1 && DK.TRACKS[6].magnets.length >= 1);
  assert.ok(DK.TRACKS[7].portals.length >= 2 && DK.TRACKS[7].magnets.length >= 1);
});

test('every track stays inside the 1280x720 frame below the HUD and never overlaps another leg', () => {
  DK.TRACKS.forEach((R, i) => {
    const L = DK.build(i, EASY);
    assert.equal(L.cps.length, 4);
    for (const p of L.pts) {
      assert.ok(
        p.x - p.hw >= 28 && p.x + p.hw <= 1252 && p.y - p.hw >= 88 && p.y + p.hw <= 708,
        `${R.id} leaves safe canvas frame at ${p.x | 0},${p.y | 0} (hw=${p.hw | 0})`
      );
    }
    for (let a = 0; a < L.pts.length; a++) {
      for (let b = a + 1; b < L.pts.length; b++) {
        const p = L.pts[a], q = L.pts[b];
        const ds = Math.min(q.s - p.s, L.len - (q.s - p.s));
        if (ds <= 3.6 * (p.hw + q.hw) + 20) continue;
        assert.ok(
          Math.hypot(p.x - q.x, p.y - q.y) >= p.hw + q.hw + 12,
          `${R.id}: non-adjacent road legs touch near ${p.x | 0},${p.y | 0}`
        );
      }
    }
  });
});

test('idle P1 stays completely stationary (p1Dist === 0, gasTime === 0) while AI bots complete 3 laps on all 8 tracks', () => {
  DK.TRACKS.forEach((R, i) => {
    const w = DK.create(i, { humans: 1, params: MID, seed: 42 + i });
    const p1 = w.karts[0];
    const startX = p1.x, startY = p1.y;
    let maxSteps = 60 * 55;
    while (maxSteps-- > 0 && w.karts.slice(1).some(b => !b.finished)) {
      step(w, [{}]);
    }
    assert.equal(p1.dist, 0, `${R.id}: idle P1 never moves`);
    assert.equal(p1.gasTime, 0, `${R.id}: idle P1 gasTime stays 0`);
    assert.equal(p1.inputs, 0, `${R.id}: idle P1 inputs stays 0`);
    assert.equal(p1.x, startX);
    assert.equal(p1.y, startY);
    for (let b = 1; b <= 3; b++) {
      assert.equal(w.karts[b].finished, true, `${R.id}: AI bot ${b} completed all 3 laps`);
      assert.equal(w.karts[b].lap, 3);
    }
  });
});

test('kart steering, drifting mini-boost, and forgiving wall bounce work smoothly', () => {
  const w = DK.create(0, { humans: 1, params: MID });
  const p1 = w.karts[0];
  // Accelerate straight with gas.
  for (let n = 0; n < 25; n++) step(w, [{ gas: 1, steer: 0 }]);
  assert.ok(p1.speed > 140 && p1.dist > 25 && p1.gasTime > 0.35 && p1.inputs === 25);

  // Steer right continuously to build drift charge, then straighten out to trigger drift mini-boost.
  const ang0 = p1.ang;
  let gotDrift = false;
  for (let n = 0; n < 45; n++) step(w, [{ gas: 1, steer: 1 }]);
  assert.ok(DK.wrapAngle(p1.ang - ang0) > 0.5, 'steering turns the kart clockwise');
  assert.ok(p1.driftT >= 0.55, 'sustained high-speed turn charges drift');
  for (let n = 0; n < 5; n++) {
    for (const e of step(w, [{ gas: 1, steer: 0 }])) if (e.t === 'driftBoost') gotDrift = true;
  }
  assert.equal(gotDrift, true, 'releasing a charged drift grants a mini-boost');
  assert.ok(p1.miniBoostT > 0);
});

test('anti-cheat checkpoints: reversing across finish or skipping sectors never counts a lap', () => {
  const w = DK.create(0, { humans: 1, params: MID });
  const p1 = w.karts[0], L = w.L;
  // Reverse across s = 0 from the starting grid.
  for (let n = 0; n < 90; n++) step(w, [{ brake: 1, steer: 0 }]);
  assert.ok(p1.s > L.len * 0.85, 'kart backed behind finish line');
  assert.equal(p1.lap, 0, 'backing over the line does not count a lap');
  // Drive forward across s = 0 again without completing sectors 1..3.
  for (let n = 0; n < 90; n++) step(w, [{ gas: 1, steer: 0 }]);
  assert.equal(p1.lap, 0, 'crossing forward without sectors 1..3 does not count a lap');

  // Teleporting to sector 3 without hitting sectors 1 and 2 also rejects lap cheat.
  const c3 = DK.at(L, L.len * 0.85);
  p1.x = c3.x; p1.y = c3.y; p1.s = c3.s; p1.ang = Math.atan2(c3.ty, c3.tx);
  for (let n = 0; n < 90; n++) step(w, [driveHuman(w, 0, false)]);
  assert.equal(p1.lap, 0, 'skipping sectors 1 & 2 never increments lap');
});

test('1P race: careful human wins 3 laps across tracks, earns 3 stars, and DDA scales AI speeds', () => {
  assert.ok(EASY.botSpeed < MID.botSpeed && MID.botSpeed < HARD.botSpeed);
  assert.ok(EASY.mercy > MID.mercy && MID.mercy > HARD.mercy);
  assert.ok(EASY.roadWidth > HARD.roadWidth);

  for (let i = 0; i < DK.TRACKS.length; i++) {
    const w = DK.create(i, { humans: 1, params: EASY, seed: 7 + i });
    let steps = 0;
    while (!w.done && steps++ < 60 * 45) {
      step(w, [driveHuman(w, 0, true)]);
    }
    assert.equal(w.done, true, `Track ${DK.TRACKS[i].id} finished`);
    assert.equal(w.karts[0].finished, true);
    assert.equal(w.karts[0].lap, 3);
    assert.equal(w.karts[0].rank, 1, `Human won 1st on ${DK.TRACKS[i].id} at EASY`);
    assert.equal(DK.starsForRank(w.karts[0].rank), 3);
  }
});

test('2P shared-screen mode: P1 and P2 race together with 2 AI bots and finish cleanly', () => {
  const w = DK.create(2, { humans: 2, params: MID, seed: 99 });
  assert.equal(w.humans, 2);
  assert.equal(w.karts[0].human, true);
  assert.equal(w.karts[1].human, true);
  assert.equal(w.karts[2].human, false);
  assert.equal(w.karts[3].human, false);

  let steps = 0;
  while (!w.done && steps++ < 60 * 50) {
    step(w, [driveHuman(w, 0, true), driveHuman(w, 1, true)]);
  }
  assert.equal(w.done, true);
  assert.ok(w.karts[0].dist > 3000 && w.karts[1].dist > 3000);
  assert.ok(w.karts[0].finished || w.karts[1].finished);
  assert.ok(w.winner >= 0 && w.winner <= 3);
});

test('all 4 toy power-ups work: turbo flame, bubble shield, spring hop over glue, and splat rocket', () => {
  const w = DK.create(0, { humans: 1, params: MID, seed: 12 });
  const p1 = w.karts[0], bot = w.karts[1], L = w.L;
  step(w, [{ gas: 1 }]); // mark P1 started

  // 1. Turbo boosts speed well past normal top speed.
  p1.item = 'turbo';
  assert.equal(DK.useItem(w, 0), true);
  assert.equal(p1.item, '');
  assert.ok(p1.turboT > 1.5);
  for (let n = 0; n < 25; n++) step(w, [{ gas: 1 }]);
  assert.ok(p1.speed > DK.TOP_SPEED * 1.15, `turbo speed=${p1.speed}`);

  // 2. Spring hops into the air (z > 0) right over a glue hazard without slowing down.
  const hz = L.hazards[0];
  const beforeHz = DK.at(L, hz.s - 35);
  p1.turboT = 0;
  p1.x = beforeHz.x + beforeHz.nx * hz.off;
  p1.y = beforeHz.y + beforeHz.ny * hz.off;
  p1.s = beforeHz.s;
  p1.ang = Math.atan2(beforeHz.ty, beforeHz.tx);
  p1.speed = 260; p1.vx = beforeHz.tx * 260; p1.vy = beforeHz.ty * 260;
  p1.item = 'spring';
  DK.useItem(w, 0);
  let glueEvents = 0, maxZ = 0;
  for (let n = 0; n < 24; n++) {
    for (const e of step(w, [{ gas: 1 }])) if (e.t === 'hazard' && e.kart === 0) glueEvents++;
    if (p1.z > maxZ) maxZ = p1.z;
  }
  assert.ok(maxZ > 18, 'spring lifts kart high into the air');
  assert.equal(glueEvents, 0, 'airborne kart hops cleanly over glue puddle');

  // 3. Splat homes onto the kart ahead and spins it out; Bubble shield absorbs a splat harmlessly!
  const sBase = 300;
  const c0 = DK.at(L, sBase), c1 = DK.at(L, sBase + 95);
  p1.hopT = 0; p1.z = 0; p1.x = c0.x; p1.y = c0.y; p1.s = sBase; p1.off = 0; p1.ang = Math.atan2(c0.ty, c0.tx);
  bot.aiDelay = 99; bot.x = c1.x; bot.y = c1.y; bot.s = sBase + 95; bot.off = 0; bot.speed = 0; bot.vx = 0; bot.vy = 0;
  // First with bubble shield on bot:
  bot.bubbleT = 5.0;
  p1.item = 'splat';
  DK.useItem(w, 0);
  assert.equal(w.splats.length, 1);
  let poppedShield = false;
  for (let n = 0; n < 40 && w.splats.length; n++) {
    for (const e of step(w, [{}])) if (e.t === 'shieldPop' && e.kart === 1) poppedShield = true;
  }
  assert.equal(poppedShield, true, 'bubble shield absorbs splat rocket');
  assert.equal(bot.spinT, 0, 'shielded kart does not spin out');

  // Now without bubble shield: splat spins the target!
  p1.item = 'splat';
  DK.useItem(w, 0);
  let splatted = false;
  for (let n = 0; n < 40 && w.splats.length; n++) {
    for (const e of step(w, [{}])) if (e.t === 'splat' && e.kart === 1) splatted = true;
  }
  assert.equal(splatted, true, 'unshielded kart gets splatted');
  assert.ok(bot.spinT > 0.4, 'splatted kart spins briefly');
});

test('Science Lab warp portals teleport karts forward and advance sectors cleanly', () => {
  const w = DK.create(6, { humans: 1, params: MID });
  const p1 = w.karts[0], po = w.L.portals[0];
  p1.started = true;
  p1.x = po.xIn; p1.y = po.yIn; p1.s = po.sIn; p1.sector = 1;
  const ev = step(w, [{ gas: 1 }]);
  assert.ok(ev.some(e => e.t === 'portal' && e.kart === 0), 'portal event triggered');
  assert.ok(Math.hypot(p1.x - po.xOut, p1.y - po.yOut) < 20, 'teleported to portal exit');
  assert.equal(p1.sector, 2, 'sector progressed across portal');
});

test('saves, track unlocking, stars, coins and 6x2 shop items validate and round-trip', () => {
  assert.equal(DK.PAINTS.length, 6);
  assert.equal(DK.TOPPERS.length, 6);
  const fresh = plain(DK.freshSave());
  for (const bad of [null, undefined, 'bad', 42, [], {}, { v: 2 }, { v: 1, tracks: 'nope', coins: -9, paint: 5, topper: 99 }]) {
    assert.deepEqual(plain(DK.loadSave(bad)), fresh);
  }

  const s = DK.freshSave();
  assert.equal(DK.isOpen(s, 0), true);
  assert.equal(DK.isOpen(s, 1), false);
  let r = DK.applyResult(s, 0, 1, 21.4, [true, true, false, false, false, false]);
  assert.equal(r.stars, 3);
  assert.equal(r.opened, 1);
  assert.equal(DK.isOpen(s, 1), true);
  assert.equal(s.tracks[0].s, 3);
  assert.equal(s.coins, 2 + 3 * DK.STAR_COINS);

  // Unlock World 2 by clearing Track 1 (1-2).
  r = DK.applyResult(s, 1, 2, 24.0, []);
  assert.equal(r.opened, 2);
  assert.equal(r.world, 1, 'clearing 1-2 opens World 2');

  // Shop purchase & equip.
  s.coins = 10;
  assert.equal(DK.buy(s, 'paint', 5), '', 'not enough coins for 11-coin paint');
  assert.equal(DK.buy(s, 'paint', 2), 'bought');
  assert.equal(s.paint, 2);
  assert.equal(s.coins, 5);
  assert.equal(DK.buy(s, 'topper', 1), 'bought');
  assert.equal(s.topper, 1);
  assert.equal(s.coins, 1);
  assert.equal(DK.buy(s, 'paint', 0), 'wear');
  assert.equal(s.paint, 0);

  // Verify economy: 1st-place clears + all track coins across 8 tracks exceed total shop prices.
  const totalTrackCoins = DK.TRACKS.reduce((sum, t) => sum + t.coins.length + 3 * DK.STAR_COINS, 0);
  const totalShopCost = DK.PAINTS.concat(DK.TOPPERS).reduce((sum, it) => sum + it.price, 0);
  assert.ok(totalShopCost <= totalTrackCoins, `shop cost ${totalShopCost} <= ${totalTrackCoins} earnable first-clear coins`);

  // Round-trip valid save.
  assert.deepEqual(plain(DK.loadSave(plain(s))), plain(s));
});
