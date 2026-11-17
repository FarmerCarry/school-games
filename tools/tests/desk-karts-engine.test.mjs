// Desk Karts engine (games/desk-karts/engine.js): pure UMD module check, 4 open cups & 12 tracks
// (1-1..4-3), non-overlapping track geometry, chunky 54x38 karts, idle P1 stationary guarantee,
// smart dual steering + blue/orange hop-drift boost, 5 school-supply power-ups + stunt ramps,
// 1P chase & 2P framing/warp camera, all 12 tracks winnable across tiers, and garage saves.
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
const plain = v => JSON.parse(JSON.stringify(v));

function step(w, inputs = []) {
  w.ev.length = 0;
  DK.step(w, DT, inputs);
  return w.ev.slice();
}

// Skilled human driver steering along the racing line, dodging puddles/coils/chompers & using items.
function driveHuman(w, kartId = 0, useItems = true) {
  const k = w.karts[kartId], L = w.L;
  const look = 135 + k.speed * 0.22;
  const targetS = DK.wrapS(L.len, k.s + look);
  let wantOff = 0;
  for (const hz of L.hazards) {
    const ds = DK.wrapS(L.len, hz.s - k.s);
    if (ds > 0 && ds < 220 && Math.abs(wantOff - hz.off) < hz.r + DK.KART_R + 16) {
      wantOff = hz.off >= 0 ? -L.hw * 0.48 : L.hw * 0.48;
    }
  }
  for (const co of L.coils) {
    const ds = DK.wrapS(L.len, co.s - k.s);
    if (ds > 0 && ds < 220 && Math.abs(wantOff - co.off) < co.r + DK.KART_R + 18) {
      wantOff = co.off >= 0 ? -L.hw * 0.5 : L.hw * 0.5;
    }
  }
  for (const ch of L.chompers) {
    const ds = DK.wrapS(L.len, ch.s - k.s);
    if (ds > 0 && ds < 230 && Math.abs(wantOff - ch.off) < ch.r + DK.KART_R + 18) {
      wantOff = ch.off >= 0 ? -L.hw * 0.52 : L.hw * 0.52;
    }
  }
  const aim = DK.at(L, targetS);
  const tx = aim.x + aim.nx * wantOff, ty = aim.y + aim.ny * wantOff;
  const diff = DK.wrapAngle(Math.atan2(ty - k.y, tx - k.x) - k.ang);
  return {
    gas: 1,
    brake: 0,
    steer: DK.clamp(diff / 0.48, -1, 1),
    drift: Math.abs(diff) > 0.55 && k.speed > 260,
    item: useItems && !!k.item,
    active: true
  };
}

test('engine is pure UMD: works in Node and browser sandbox, zero Kit/DOM/timers/Math.random/localStorage', () => {
  assert.ok(DK && DK.build && DK.create && DK.step, 'CommonJS export works');
  assert.equal(DK.KART_W, 54);
  assert.equal(DK.KART_H, 38);

  const sandbox = { window: {} };
  vm.runInNewContext(engineSource, sandbox);
  assert.ok(sandbox.window.DKEngine && sandbox.window.DKEngine.TRACKS.length === 12, 'window.DKEngine global works');

  // Engine file must never mention Kit (even in comments, per telemetry-rules.test.mjs), DOM, timers, or Math.random.
  assert.doesNotMatch(engineSource, /\bKit\b/);
  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('4 open classroom cups, 12 tracks (1-1..4-3) all unlocked immediately, and 100% Arabic labels', () => {
  assert.equal(DK.CUPS.length, 4);
  assert.equal(DK.TRACKS.length, 12);
  assert.equal(DK.LAPS, 3);
  assert.deepEqual(DK.CUPS.map(c => c.name), [
    'مكتب الرسم', 'مختبر العلوم', 'ورشة الحاسوب', 'كأس الفسحة الكبرى'
  ]);

  const fresh = DK.freshSave();
  const ids = new Set();
  DK.TRACKS.forEach((R, i) => {
    const expectedId = `${Math.floor(i / 3) + 1}-${(i % 3) + 1}`;
    assert.equal(R.id, expectedId);
    ids.add(R.id);
    assert.equal(R.cup, Math.floor(i / 3));
    assert.match(R.name, ARABIC, R.id + ' Arabic name');
    assert.equal(DK.isOpen(fresh, i), true, R.id + ' unlocked immediately');
  });
  assert.equal(ids.size, 12);

  for (const list of [DK.ITEMS, DK.RIVALS, DK.KARTS, DK.FLAMES, Object.values(DK.DIFFS)]) {
    for (const entry of list) assert.match(entry.name, ARABIC, entry.name);
  }
});

test('every track stays inside the 2800x2000 tabletop bounds and never overlaps non-adjacent road legs', () => {
  const easyPrm = DK.params(0.2, 'easy');
  DK.TRACKS.forEach((R, i) => {
    const L = DK.build(i, easyPrm);
    assert.equal(L.cps.length, 4);
    assert.ok(L.ramps.length >= 2 && L.boxes.length >= 6 && L.coins.length >= 10, R.id + ' toys');

    for (const p of L.pts) {
      assert.ok(
        p.x - p.hw >= 140 && p.x + p.hw <= DK.WORLD_W - 140 &&
        p.y - p.hw >= 140 && p.y + p.hw <= DK.WORLD_H - 140,
        `${R.id} leaves safe tabletop bounds at ${p.x | 0},${p.y | 0} (hw=${p.hw | 0})`
      );
    }
    for (let a = 0; a < L.pts.length; a++) {
      for (let b = a + 1; b < L.pts.length; b++) {
        const p = L.pts[a], q = L.pts[b];
        const ds = Math.min(q.s - p.s, L.len - (q.s - p.s));
        if (ds <= 3.6 * (p.hw + q.hw) + 40) continue;
        assert.ok(
          Math.hypot(p.x - q.x, p.y - q.y) >= p.hw + q.hw + 24,
          `${R.id}: non-adjacent road legs touch near ${p.x | 0},${p.y | 0}`
        );
      }
    }
  });
});

test('idle P1 stays parked on grid (p1Dist === 0, time === 0) across all 12 tracks even while AI bots finish 3 laps', () => {
  const mid = DK.params(0.4, 'normal');
  DK.TRACKS.forEach((R, i) => {
    const w = DK.create(i, { humans: 1, params: mid, seed: 42 + i });
    const p1 = w.karts[0];
    const startX = p1.x, startY = p1.y;
    let maxSteps = 60 * 65;
    while (maxSteps-- > 0 && w.karts.slice(1).some(b => !b.finished)) {
      step(w, [{}]);
    }
    assert.equal(p1.dist, 0, `${R.id}: idle P1 never moves or gets bumped`);
    assert.equal(w.time, 0, `${R.id}: P1 race clock stays 0 until first input`);
    assert.ok(w.worldTime > 15, `${R.id}: worldTime advances`);
    assert.equal(p1.gasTime, 0);
    assert.equal(p1.inputs, 0);
    assert.equal(p1.x, startX);
    assert.equal(p1.y, startY);
    for (let b = 1; b <= 3; b++) {
      assert.equal(w.karts[b].finished, true, `${R.id}: AI bot ${b} completed 3 laps`);
      assert.equal(w.karts[b].lap, 3);
    }
  });
});

test('smart dual steering (easy auto-gas after first press) & hop-drift blue -> orange boost sparks', () => {
  // Easy mode: untouched stays at 0; single press of ArrowLeft ignites auto-gas and keeps cruising!
  const wEasy = DK.create(0, { humans: 1, diff: 'easy', dda: 0.2 });
  for (let n = 0; n < 30; n++) step(wEasy, [{}]);
  assert.equal(wEasy.karts[0].dist, 0, 'easy mode waits for first real press');

  step(wEasy, [{ steer: -1, dirX: -1, dirY: 0, active: true }]);
  for (let n = 0; n < 45; n++) step(wEasy, [{}]); // hands off keys!
  assert.ok(wEasy.karts[0].dist > 90, `auto-gas keeps cruising after first press: ${wEasy.karts[0].dist}`);

  // Hop-Drift: hold steer + drift to build Lv1 (blue) -> Lv2 (orange) sparks, then release for flame boost!
  const wPro = DK.create(0, { humans: 1, diff: 'normal', dda: 0.35 });
  const p1 = wPro.karts[0];
  for (let n = 0; n < 30; n++) step(wPro, [{ gas: 1, steer: 0 }]);
  assert.ok(p1.speed > 240);

  let sawHop = false, sawLv1 = false, sawLv2 = false, boostLv = 0;
  for (let n = 0; n < 60; n++) {
    for (const e of step(wPro, [{ gas: 1, steer: 0.9, drift: true }])) {
      if (e.t === 'hop') sawHop = true;
      if (e.t === 'driftBoost') boostLv = e.lv;
    }
    if (p1.driftLv === 1) sawLv1 = true;
    if (p1.driftLv === 2) sawLv2 = true;
  }
  assert.equal(sawHop, true, 'hop triggered on drift entry');
  assert.equal(sawLv1, true, 'blue drift sparks reached');
  assert.equal(sawLv2, true, 'orange super drift sparks reached');

  for (let n = 0; n < 4; n++) {
    for (const e of step(wPro, [{ gas: 1, steer: 0, drift: false }])) {
      if (e.t === 'driftBoost') boostLv = e.lv;
    }
  }
  assert.equal(boostLv, 2, 'releasing Lv2 drift grants orange flame boost');
  assert.ok(p1.miniBoostT >= 1.2);
});

test('anti-cheat checkpoints reject reversing over line or skipping sectors', () => {
  const w = DK.create(0, { humans: 1, diff: 'normal' });
  const p1 = w.karts[0], L = w.L;
  for (let n = 0; n < 90; n++) step(w, [{ brake: 1, steer: 0 }]);
  assert.ok(p1.s > L.len * 0.8);
  assert.equal(p1.lap, 0);
  for (let n = 0; n < 90; n++) step(w, [{ gas: 1, steer: 0 }]);
  assert.equal(p1.lap, 0);

  const c3 = DK.at(L, L.len * 0.85);
  p1.x = c3.x; p1.y = c3.y; p1.s = c3.s; p1.ang = Math.atan2(c3.ty, c3.tx);
  for (let n = 0; n < 90; n++) step(w, [driveHuman(w, 0, false)]);
  assert.equal(p1.lap, 0);
});

test('all 5 battle power-ups & ruler stunt ramps work cleanly', () => {
  const w = DK.create(0, { humans: 1, diff: 'normal', seed: 19 });
  const p1 = w.karts[0], bot = w.karts[1], L = w.L;
  step(w, [{ gas: 1 }]);

  // 1. Eraser Turbo: invincible speed blast + rams rivals aside!
  p1.item = 'eraser_turbo';
  assert.equal(DK.useItem(w, 0), true);
  for (let n = 0; n < 25; n++) step(w, [{ gas: 1 }]);
  assert.ok(p1.speed > DK.TOP_SPEED * 1.25, `mega nitro speed=${p1.speed}`);

  // 2. Paperclip Magnet: pulls forward + vacuums nearby coins!
  p1.turboT = 0;
  const nearCoin = w.coins[0];
  nearCoin.taken = false;
  nearCoin.x = p1.x + 190; nearCoin.y = p1.y + 40;
  p1.item = 'clip_magnet';
  DK.useItem(w, 0);
  for (let n = 0; n < 35; n++) step(w, [{ gas: 1 }]);
  assert.equal(nearCoin.taken, true, 'paperclip magnet vacuumed nearby coin');

  // 3. Ruler Jump: vaults high over paint puddle and lands with trick boost!
  const hz = L.hazards[0];
  const preHz = DK.at(L, hz.s - 45);
  p1.x = preHz.x + preHz.nx * hz.off; p1.y = preHz.y + preHz.ny * hz.off;
  p1.s = preHz.s; p1.ang = Math.atan2(preHz.ty, preHz.tx);
  p1.speed = 380; p1.vx = preHz.tx * 380; p1.vy = preHz.ty * 380;
  p1.item = 'ruler_jump';
  DK.useItem(w, 0);
  let maxZ = 0, trickLanded = false;
  for (let n = 0; n < 55; n++) {
    for (const e of step(w, [{ gas: 1 }])) if (e.t === 'trickLand' && e.kart === 0) trickLanded = true;
    if (p1.z > maxZ) maxZ = p1.z;
  }
  assert.ok(maxZ > 35, `airborne stunt height=${maxZ}`);
  assert.equal(trickLanded, true, 'landed stunt jump with trick boost');

  // 4. Glue Trap: drops sticky glue behind and spins tailgater!
  p1.item = 'glue_trap';
  DK.useItem(w, 0);
  assert.equal(w.traps.length, 1);
  const trap = w.traps[0];
  bot.aiDelay = 99; bot.spinT = 0; bot.turboT = 0; bot.z = 0; bot.vz = 0; bot.vx = 0; bot.vy = 0;
  bot.x = trap.x; bot.y = trap.y; bot.s = p1.s;
  step(w, [{ gas: 1 }]);
  assert.ok(bot.spinT > 0.5, 'tailgating rival spun on sticky glue trap');

  // 5. Homing Ink-Rocket: homes onto nearest rival ahead and splats ink!
  const c0 = DK.at(L, 500), c1 = DK.at(L, 640), cBack = DK.at(L, 200);
  for (const b of [w.karts[2], w.karts[3]]) { b.aiDelay = 99; b.x = cBack.x; b.y = cBack.y; b.s = 200; b.vx = 0; b.vy = 0; }
  p1.x = c0.x; p1.y = c0.y; p1.s = 500; p1.off = 0; p1.ang = Math.atan2(c0.ty, c0.tx);
  bot.spinT = 0; bot.x = c1.x; bot.y = c1.y; bot.s = 640; bot.off = 0; bot.vx = 0; bot.vy = 0;
  p1.item = 'ink_rocket';
  DK.useItem(w, 0);
  assert.equal(w.rockets.length, 1);
  let inked = false;
  for (let n = 0; n < 35 && w.rockets.length; n++) {
    for (const e of step(w, [{}])) if (e.t === 'inkHit' && e.kart === 1) inked = true;
  }
  assert.equal(inked, true, 'homing ink-rocket splatted rival ahead');
  assert.ok(bot.inkedT > 1.5 && bot.spinT > 0.5);
});

test('all 12 tracks across all 4 cups are winnable by a human driver', () => {
  for (let i = 0; i < DK.TRACKS.length; i++) {
    const w = DK.create(i, { humans: 1, diff: 'normal', dda: 0.25, seed: 100 + i });
    let steps = 0;
    while (!w.done && steps++ < 60 * 55) {
      step(w, [driveHuman(w, 0, true)]);
    }
    assert.equal(w.done, true, `Track ${DK.TRACKS[i].id} completed`);
    assert.equal(w.karts[0].finished, true);
    assert.equal(w.karts[0].lap, 3);
    assert.equal(w.karts[0].rank, 1, `Won 1st place on ${DK.TRACKS[i].id}`);
  }
});

test('2P dynamic framing camera & instant catch-up warp drone keep both humans in big view', () => {
  const w = DK.create(0, { humans: 2, diff: 'normal', seed: 77 });
  const p1 = w.karts[0], p2 = w.karts[1];
  step(w, [{ gas: 1 }, { gas: 1 }]);
  assert.equal(p1.started, true);
  assert.equal(p2.started, true);

  // Drive P1 far ahead while P2 sits slow -> warp drone catches P2 right up!
  let warped = false;
  for (let n = 0; n < 180; n++) {
    for (const e of step(w, [driveHuman(w, 0, false), { brake: 0, gas: 0 }])) {
      if (e.t === 'warp' && e.kart === 1) warped = true;
    }
    if (warped) break;
  }
  assert.equal(warped, true, 'catch-up warp drone rescued trailing P2');
  assert.ok(Math.abs(p1.totalDist - p2.totalDist) < 250);
  assert.ok(w.cam.zoom >= 0.64 && w.cam.zoom <= 1.02);
});

test('garage karts & exhaust flames, stars, coins, and save validation round-trip cleanly', () => {
  const fresh = plain(DK.freshSave());
  for (const bad of [null, undefined, 'bad', 42, [], {}, { v: 1 }, { v: 2, tracks: [], coins: -4 }]) {
    assert.deepEqual(plain(DK.loadSave(bad)), fresh);
  }

  const s = DK.freshSave();
  const res = DK.applyResult(s, 0, 1, 27.4, 8, 'hero');
  assert.equal(res.stars, 3);
  assert.ok(res.earned >= 20, 'hero coin multiplier applied');
  assert.equal(DK.totalStars(s), 3);

  assert.equal(DK.buy(s, 'kart', 1), 'bought');
  assert.equal(s.kart, 1);
  assert.equal(DK.buy(s, 'flame', 1), 'bought');
  assert.equal(s.flame, 1);
  assert.equal(DK.buy(s, 'kart', 0), 'wear');
  assert.equal(s.kart, 0);

  assert.deepEqual(plain(DK.loadSave(plain(s))), plain(s));
});
