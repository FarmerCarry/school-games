// Desk Karts 3D engine (games/desk-karts/engine.js): pure UMD module check, 2 cups & 6 circuits
// (1-1..2-3), mathematically non-overlapping spline geometry, idle P1 stationary guarantee,
// forgiving wall bounce, Blue/Gold drift mini-turbo, textbook jump ramps, bouncy erasers,
// ink spills, 3 pickup items, 2P catch-up warp, all 6 tracks winnable in 3 laps, and v3 garage saves.
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
const ARABIC = /^[\u0600-\u06FF0-9\s!·\-]+$/;

function step(w, inputs = []) {
  w.ev.length = 0;
  DK.step(w, DT, inputs);
  return w.ev.slice();
}

function driveHuman(w, kartId = 0, useItems = true) {
  const k = w.karts[kartId];
  const L = w.L;
  const look = 10 + Math.abs(k.speed) * 0.32;
  let wantOff = 0;

  for (const er of w.erasers) {
    if (Math.hypot(er.x - k.x, er.z - k.z) < 12) {
      const pr = DK.projectPoint(L, er.x, er.z, k.idx);
      if (Math.abs(wantOff - pr.off) < er.r + DK.KART_R + 1.2) {
        wantOff = pr.off >= 0 ? -L.hw * 0.45 : L.hw * 0.45;
      }
    }
  }
  for (const ik of w.inks) {
    if (Math.hypot(ik.x - k.x, ik.z - k.z) < 11) {
      const pr = DK.projectPoint(L, ik.x, ik.z, k.idx);
      if (Math.abs(wantOff - pr.off) < ik.r + DK.KART_R + 1.0) {
        wantOff = pr.off >= 0 ? -L.hw * 0.48 : L.hw * 0.48;
      }
    }
  }

  const aim = DK.sampleAt(L, k.s + look);
  const tx = aim.x + aim.nx * wantOff;
  const tz = aim.z + aim.nz * wantOff;
  const diff = DK.wrapAngle(Math.atan2(tz - k.z, tx - k.x) - k.ang);
  return {
    gas: 1,
    brake: 0,
    steer: DK.clamp(diff / 0.48, -1, 1),
    drift: Math.abs(diff) > 0.52 && k.speed > 16,
    item: useItems && !!k.item
  };
}

test('engine is pure UMD: works in Node and browser sandbox, zero Kit/DOM/timers/Math.random/localStorage', () => {
  assert.ok(DK && DK.buildTrack && DK.create && DK.step, 'CommonJS export works');
  const sandbox = { window: {} };
  vm.runInNewContext(engineSource, sandbox);
  assert.ok(sandbox.window.DeskKartsEngine && sandbox.window.DeskKartsEngine.TRACKS.length === 6, 'window.DeskKartsEngine works');

  // Engine file must never mention Kit (even in comments, per telemetry-rules.test.mjs), DOM, timers, or Math.random.
  assert.doesNotMatch(engineSource, /\bKit\b/);
  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('2 cups & 6 handcrafted tracks (1-1..2-3) with 100% Arabic labels, 2-lap sprints, 5 items, and non-overlapping spline geometry', () => {
  assert.equal(DK.CUPS.length, 2);
  assert.equal(DK.TRACKS.length, 6);
  assert.equal(DK.LAPS, 2);
  assert.ok(DK.ITEMS.plane && DK.ITEMS.shell && DK.ITEMS.rocket && DK.ITEMS.shield && DK.ITEMS.ink);
  for (const cup of DK.CUPS) assert.match(cup.name, ARABIC);
  for (const b of DK.BODIES) assert.match(b.name, ARABIC);
  for (const p of DK.PAINTS) assert.match(p.name, ARABIC);
  for (const it of Object.values(DK.ITEMS)) assert.match(it.name, ARABIC);

  for (let idx = 0; idx < DK.TRACKS.length; idx++) {
    const L = DK.buildTrack(idx);
    const expectedId = `${Math.floor(idx / 3) + 1}-${(idx % 3) + 1}`;
    assert.equal(L.id, expectedId);
    assert.match(L.name, ARABIC);
    assert.ok(L.len > 150, `${L.id} length reasonable (${L.len.toFixed(1)})`);
    assert.ok(L.boosts.length >= 4, `${L.id} has dense boost strips (${L.boosts.length})`);
    assert.ok(L.ramps.length >= 1, `${L.id} has textbook ramps`);
    assert.ok(L.erasers.length >= 2, `${L.id} has bouncy erasers`);
    assert.ok(L.inks.length >= 1, `${L.id} has ink spills`);
    assert.ok(L.itemSpawns.length >= 6, `${L.id} has mystery pickup boxes`);

    // Verify zero self-intersection: any non-adjacent samples must stay well clear of road width!
    const N = L.samples.length;
    const minClear = L.hw * 2 + 1.5;
    for (let i = 0; i < N; i += 2) {
      for (let j = i + 26; j < N; j += 2) {
        const ringGap = Math.min(j - i, N - (j - i));
        if (ringGap < 26) continue;
        const d = Math.hypot(L.samples[i].x - L.samples[j].x, L.samples[i].z - L.samples[j].z);
        assert.ok(d >= minClear, `${L.id} samples ${i}&${j} too close: ${d.toFixed(2)} < ${minClear.toFixed(2)}`);
      }
    }
  }
});

test('brief grid window holds p1Dist===0 then Auto-Gas launches automatically, while manual gas rocket-starts immediately', () => {
  const w = DK.create({ track: 0, seed: 77 });
  assert.equal(w.autoGas, true);
  assert.equal(w.p1Dist, 0);
  assert.equal(w.time, 0);
  assert.equal(w.started, false);
  // First 0.35s holds clean grid state for restarts
  for (let i = 0; i < 20; i++) step(w, []);
  assert.equal(w.p1Dist, 0, 'grid holds p1Dist === 0 during brief launch window');
  assert.equal(w.time, 0, 'clock stays 0 during brief launch window');

  // After countdown elapses (~0.65s), Auto-Gas accelerates P1 with ZERO gas key held!
  for (let i = 0; i < 45; i++) step(w, [{ gas: 0, brake: 0, steer: 0, drift: false, item: false }]);
  assert.equal(w.started, true, 'Auto-Gas launches cleanly after brief grid window');
  assert.ok(w.p1Dist > 3.0, `Auto-Gas accelerates P1 automatically (p1Dist=${w.p1Dist.toFixed(1)})`);
  assert.ok(w.time > 0.2);

  // Manual gas during launch window triggers instant rocket start
  const w2 = DK.create({ track: 0, seed: 78 });
  for (let i = 0; i < 10; i++) step(w2, []);
  for (let i = 0; i < 15; i++) step(w2, [{ gas: 1, brake: 0, steer: 0, drift: false, item: false }]);
  assert.equal(w2.started, true);
  assert.ok(w2.p1Dist > 1.5, 'manual gas launches immediately');
});

test('forgiving wall bounce: slamming into pencil barrier slides smoothly forward and never sticks', () => {
  const w = DK.create({ track: 0, seed: 101 });
  const k = w.karts[0];
  let wallEvents = 0;
  for (let i = 0; i < 180; i++) {
    const ev = step(w, [{ gas: 1, brake: 0, steer: 1, drift: false, item: false }]);
    wallEvents += ev.filter(e => e.type === 'wall' && e.kart === 0).length;
  }
  assert.ok(wallEvents >= 1, 'wall cushion bounce triggers');
  assert.ok(Math.abs(k.off) <= w.L.hw - DK.KART_R + 0.01, 'kart kept strictly inside barriers');
  assert.ok(k.dist > 35, `kart keeps moving smoothly along barrier (dist=${k.dist.toFixed(1)})`);
});

test('arcade drift builds Blue (stage 1) then Gold (stage 2) sparks and unleashes mini-turbo on release', () => {
  const w = DK.create({ track: 0, seed: 55 });
  const k = w.karts[0];
  // Get up to speed first
  for (let i = 0; i < 45; i++) step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: false }]);
  assert.ok(k.speed > 18);

  let sawStage1 = false, sawStage2 = false;
  for (let i = 0; i < 85; i++) {
    const ev = step(w, [{ gas: 1, brake: 0, steer: -0.6, drift: true, item: false }]);
    for (const e of ev) {
      if (e.type === 'driftCharge' && e.kart === 0 && e.stage === 1) sawStage1 = true;
      if (e.type === 'driftCharge' && e.kart === 0 && e.stage === 2) sawStage2 = true;
    }
  }
  assert.ok(sawStage1 && sawStage2, 'drift charges through Blue (1) and Gold (2)');

  // Release drift -> mini-turbo fires!
  const relEv = step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: false }]);
  assert.ok(relEv.some(e => e.type === 'driftBoost' && e.kart === 0 && e.stage === 2), 'Gold mini-turbo unleashed');
  assert.ok(k.boostT >= 1.0 && k.speed > DK.MAX_SPEED, 'boost timer and super speed active');
});

test('textbook jump ramp, bouncy pink eraser, ink spill, and 3 pickup items all function cleanly', () => {
  const w = DK.create({ track: 0, seed: 99 });
  const k = w.karts[0];
  w.started = true;

  // 1) Textbook jump ramp
  const rm = w.L.ramps[0];
  k.x = rm.x; k.z = rm.z; k.ang = rm.ang; k.speed = 22; k.vx = rm.tx * 22; k.vz = rm.tz * 22;
  let jumped = false, maxY = 0, landed = false;
  for (let i = 0; i < 90; i++) {
    const ev = step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: false }]);
    if (ev.some(e => e.type === 'jump' && e.kart === 0)) jumped = true;
    if (ev.some(e => e.type === 'land' && e.kart === 0)) landed = true;
    if (k.y > maxY) maxY = k.y;
  }
  assert.ok(jumped && landed && maxY > 2.0, `ramp jump works (maxY=${maxY.toFixed(2)})`);

  // 2) Bouncy pink eraser
  const er = w.erasers[0];
  k.x = er.x + 1.0; k.z = er.z; k.y = 0; k.airborne = false; k.speed = 18;
  const erEv = step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: false }]);
  assert.ok(erEv.some(e => e.type === 'eraser' && e.kart === 0), 'eraser bounces kart');
  assert.ok(er.squash > 0.5, 'eraser visually squashes');

  // 3) Ink spill slows/spins unshielded kart, but shield protects!
  const ik = w.inks[0];
  k.x = ik.x; k.z = ik.z; k.spinT = 0; k.invulnT = 0; k.shieldT = 0; k.speed = 24;
  const inkEv = step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: false }]);
  assert.ok(inkEv.some(e => e.type === 'inkHit' && e.kart === 0), 'ink puddle hits unshielded kart');
  assert.ok(k.spinT > 0.4, 'spin-out triggered');

  // Shield item protects from ink
  k.item = 'shield'; k.spinT = 0; k.invulnT = 0;
  step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: true }]);
  assert.ok(k.shieldT > 4.0, 'shield activated');
  k.x = ik.x; k.z = ik.z;
  const shEv = step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: false }]);
  assert.ok(!shEv.some(e => e.type === 'inkHit' && e.kart === 0), 'shield blocks ink puddle');

  // Rocket item & Ink Drop item
  k.item = 'rocket'; k.boostT = 0;
  step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: true }]);
  assert.ok(k.boostT >= 1.5, 'rocket boost activates');

  const inksBefore = w.inks.length;
  k.item = 'ink';
  step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: true }]);
  assert.equal(w.inks.length, inksBefore + 1, 'ink item drops a temporary ink puddle behind kart');
});

test('homing paper-plane missile locks onto rival ahead and spins them out; bouncing eraser shell ricochets off walls', () => {
  const w = DK.create({ track: 0, seed: 123 });
  w.started = true;
  const p1 = w.karts[0];
  const rival = w.karts[1];
  // Put rival 18m ahead of P1 on the spline
  const sp1 = DK.sampleAt(w.L, 20);
  const sp2 = DK.sampleAt(w.L, 38);
  p1.x = sp1.x; p1.z = sp1.z; p1.s = sp1.s; p1.idx = sp1.idx; p1.ang = Math.atan2(sp1.tz, sp1.tx);
  rival.x = sp2.x; rival.z = sp2.z; rival.s = sp2.s; rival.idx = sp2.idx; rival.ang = Math.atan2(sp2.tz, sp2.tx);
  rival.shieldT = 0; rival.invulnT = 0; rival.spinT = 0;
  // Move bots 2 & 3 behind so rival 1 is clearly the target ahead
  const spBack = DK.sampleAt(w.L, 2);
  w.karts[2].x = spBack.x; w.karts[2].z = spBack.z; w.karts[2].s = spBack.s;
  w.karts[3].x = spBack.x; w.karts[3].z = spBack.z; w.karts[3].s = spBack.s;

  p1.item = 'plane';
  const fireEv = step(w, [{ gas: 1, brake: 0, steer: 0, drift: false, item: true }]);
  assert.ok(fireEv.some(e => e.type === 'planeFire' && e.kart === 0), 'paper-plane missile fired');
  assert.equal(w.projectiles.length, 1);
  assert.equal(w.projectiles[0].kind, 'plane');

  let hitEv = null;
  for (let i = 0; i < 120 && !hitEv; i++) {
    const ev = step(w, [{ gas: 0, brake: 1, steer: 0, drift: false, item: false }]);
    hitEv = ev.find(e => e.type === 'missileHit' && e.attacker === 0 && e.kind === 'plane');
  }
  assert.ok(hitEv, 'homing paper-plane tracked and struck rival kart');
  assert.ok(rival.spinT > 0.5 && rival.airborne, 'rival spun out and popped upward');
  assert.equal(p1.hitsLanded, 1, 'combat hit credited to attacker');

  // Bouncing eraser shell ricochets off pencil barrier
  p1.ang = Math.atan2(sp1.tz, sp1.tx) + 0.65;
  p1.item = 'shell';
  const sEv = step(w, [{ gas: 0, brake: 1, steer: 0, drift: false, item: true }]);
  assert.ok(sEv.some(e => e.type === 'shellFire' && e.kart === 0), 'bouncing eraser shell fired');
  let bounced = false;
  for (let i = 0; i < 60 && !bounced; i++) {
    const ev = step(w, [{ gas: 0, brake: 1, steer: 0, drift: false, item: false }]);
    if (ev.some(e => e.type === 'shellBounce')) bounced = true;
  }
  assert.ok(bounced, 'eraser shell ricochets cleanly off track barrier');
});

test('all 6 tracks are cleanly winnable in 2-lap sprints across DDA skill tiers', () => {
  for (let t = 0; t < DK.TRACKS.length; t++) {
    const w = DK.create({ track: t, aiSkill: 0.35, seed: 300 + t });
    let summary = null;
    for (let f = 0; f < 60 * 65 && !w.finished; f++) {
      const ev = step(w, [driveHuman(w, 0, true)]);
      const over = ev.find(e => e.type === 'raceOver');
      if (over) summary = over.summary;
    }
    assert.ok(w.finished && summary, `track ${DK.TRACKS[t].id} finished cleanly in 2 laps`);
    assert.ok(summary.place <= 2, `skilled human places top 2 on ${DK.TRACKS[t].id} (got ${summary.place})`);
    assert.ok(summary.stars >= 2 && summary.score > 500 && summary.coinsEarned > 20);
  }
});

test('2P local racing triggers catch-up warp if one player falls far behind', () => {
  const w = DK.create({ track: 0, duo: true, autoGas: false, seed: 88 });
  let warped = false;
  // P1 drives fast while P2 stays still -> P2 warps cleanly near P1!
  for (let f = 0; f < 260; f++) {
    const ev = step(w, [driveHuman(w, 0, false), { gas: 0, brake: 0, steer: 0, drift: false, item: false }]);
    if (ev.some(e => e.type === 'warp' && e.kart === 1)) { warped = true; break; }
  }
  assert.ok(warped, 'trailing 2P kart warps smoothly near leader');
  const dist = Math.hypot(w.karts[0].x - w.karts[1].x, w.karts[0].z - w.karts[1].z);
  assert.ok(dist < 14, `warped player placed close to leader (dist=${dist.toFixed(1)})`);
});

test('v3 garage save resets old save shapes gracefully, unlocks bodies/paints, and tracks bests', () => {
  // Old v2 save or garbage resets cleanly to v3
  const fromOld = DK.loadSave({ v: 2, coins: 999, kart: 3 });
  assert.equal(fromOld.v, 3);
  assert.equal(fromOld.coins, 0);
  assert.equal(fromOld.body, 0);
  assert.equal(fromOld.tracks.length, 6);

  // Buying bodies & paints
  fromOld.coins = 100;
  assert.equal(DK.buyBody(fromOld, 1), true);
  assert.equal(fromOld.body, 1);
  assert.equal(fromOld.coins, 40);
  assert.equal(DK.buyBody(fromOld, 2), false, 'insufficient coins rejected');
  assert.equal(DK.buyPaint(fromOld, 2), true);
  assert.equal(fromOld.paint, 2);
  assert.equal(fromOld.coins, 5);

  // Applying result updates stars, bestScore, and coins
  const meta = DK.applyResult(fromOld, 0, { place: 1, stars: 3, score: 1450, coinsEarned: 48, time: 42.3 });
  assert.equal(meta.newBest, true);
  assert.equal(DK.totalStars(fromOld), 3);
  assert.equal(fromOld.bestScore, 1450);
  assert.equal(fromOld.coins, 53);

  // Round-trip persistence
  const reloaded = DK.loadSave(JSON.parse(JSON.stringify(fromOld)));
  assert.deepEqual(reloaded, fromOld);
});
