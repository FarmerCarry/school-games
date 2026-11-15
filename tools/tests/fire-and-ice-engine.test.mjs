import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadEngine() {
  const ctx = { console, Math, Object, Array, JSON, Error, Uint8Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const file of ['engine.js', 'levels.js']) {
    vm.runInContext(fs.readFileSync(path.join(repo, 'games/fire-and-ice', file), 'utf8'), ctx, { filename: file });
  }
  return ctx.FI;
}

function stepN(FI, w, inp, n) {
  for (let i = 0; i < n; i++) {
    FI.step(w, inp, 1 / 60);
    w.events.length = 0;
  }
}

test('Fire & Ice grants coyote jump grace at flush liquid edges without allowing pool-walking or pogoing', () => {
  const FI = loadEngine();
  const T = FI.T;
  const def = {
    name: 'coyote-pool',
    map: [
      '########################',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#I.F...................#',
      '##########GG############'
    ]
  };

  // Run right until Fire's feet have fully stepped off stone (col 9) onto goo (col 10), then jump 4 frames later.
  const wJump = FI.build(def, 0);
  let crossed = 0;
  while (crossed < 4 && wJump.state === 'play') {
    stepN(FI, wJump, { fire: { l: false, r: true, j: false }, ice: { l: false, r: false, j: false } }, 1);
    if (wJump.fire.x + 4 >= 10 * T) crossed++;
  }
  assert.equal(wJump.state, 'play', 'stepping just past the stone rim gives a brief coyote window');
  for (let f = 0; f < 45 && wJump.state === 'play'; f++) {
    stepN(FI, wJump, { fire: { l: false, r: true, j: f < 20 }, ice: { l: false, r: false, j: false } }, 1);
    if (wJump.fire.x >= 12.5 * T && wJump.fire.grounded) break;
  }
  assert.equal(wJump.state, 'play', 'late coyote jump rescues the hero from the pool edge');
  assert.ok(wJump.fire.x >= 12 * T && wJump.fire.grounded, 'lands safely on the far stone bank');

  // Safe-edge foothold: overhanging the pool with part of the foot still on stone never kills.
  const wEdge = FI.build(def, 0);
  wEdge.ice.x = 10 * T - wEdge.ice.w + 6; // front 6 px over goo, back 16 px on stone
  stepN(FI, wEdge, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 30);
  assert.equal(wEdge.state, 'play', 'standing on the stone edge with toes overhanging goo is safe');

  // Sprinting straight through a 2-tile pool without jumping still kills inside the pool.
  const wSprint = FI.build(def, 0);
  stepN(FI, wSprint, { fire: { l: false, r: true, j: false }, ice: { l: false, r: false, j: false } }, 90);
  assert.equal(wSprint.state, 'dead', 'cannot run across a 2-tile deadly pool without jumping');

  // Falling from mid-air into goo kills immediately even if jump is mashed.
  const wFall = FI.build(FI.LEVELS[3], 3);
  wFall.fire.x = 12 * T;
  wFall.fire.y = 14 * T;
  wFall.fire.grounded = false;
  for (let f = 0; f < 60 && wFall.state === 'play'; f++) {
    stepN(FI, wFall, { fire: { l: false, r: true, j: f % 2 === 0 }, ice: { l: false, r: false, j: false } }, 1);
  }
  assert.equal(wFall.state, 'dead', 'falling into a goo lake cannot pogo-jump out');
});

test('Fire & Ice buffers early jump presses and makes quick taps clear 3-tile pools', () => {
  const FI = loadEngine();
  const T = FI.T;
  const def = {
    name: 'tap-and-buffer',
    map: [
      '############################',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#I.F.......................#',
      '##########GGG###############'
    ]
  };

  // A 6-frame (100 ms) tap at running speed clears a 3-tile deadly pool, yet stays lower than a held jump.
  const wTap = FI.build(def, 0);
  wTap.fire.x = 8.8 * T;
  wTap.fire.vx = FI.PH.speed;
  const startY = wTap.fire.y;
  let tapApex = startY;
  for (let f = 0; f < 50; f++) {
    stepN(FI, wTap, { fire: { l: false, r: true, j: f < 6 }, ice: { l: false, r: false, j: false } }, 1);
    tapApex = Math.min(tapApex, wTap.fire.y);
  }
  assert.equal(wTap.state, 'play', 'a quick 100 ms tap clears a 3-tile hazard pool');
  assert.ok(wTap.fire.x >= 13 * T, 'landed past the 3-tile pool');

  const wHold = FI.build(def, 0);
  wHold.fire.x = 3 * T;
  let holdApex = startY;
  for (let f = 0; f < 50; f++) {
    stepN(FI, wHold, { fire: { l: false, r: false, j: f < 24 }, ice: { l: false, r: false, j: false } }, 1);
    holdApex = Math.min(holdApex, wHold.fire.y);
  }
  assert.ok(startY - tapApex < startY - holdApex - 15, 'holding jump still rises noticeably higher than tapping');

  // Buffered press ~10 frames (167 ms) before landing launches immediately on touchdown.
  const wBuf = FI.build(def, 0);
  stepN(FI, wBuf, { fire: { l: false, r: false, j: true }, ice: { l: false, r: false, j: false } }, 1);
  stepN(FI, wBuf, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 1);
  while (!(wBuf.fire.vy > 0 && wBuf.fire.y >= startY - 56)) {
    stepN(FI, wBuf, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 1);
  }
  assert.equal(wBuf.fire.grounded, false, 'still airborne when pressing jump early');
  // Tap jump once 9-10 frames above the floor, then release; buffered input should still jump on landing.
  stepN(FI, wBuf, { fire: { l: false, r: false, j: true }, ice: { l: false, r: false, j: false } }, 1);
  let relaunched = false;
  for (let f = 0; f < 14; f++) {
    stepN(FI, wBuf, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 1);
    if (wBuf.fire.vy < -300) relaunched = true;
  }
  assert.equal(relaunched, true, 'early jump press within 200 ms buffer triggers upon landing');
});

test('Fire & Ice forgives grazing platform lips and ceiling corners while preserving 4-tile puzzle walls', () => {
  const FI = loadEngine();
  const T = FI.T;
  const def = {
    name: 'corners',
    map: [
      '##################',
      '#................#',
      '#................#',
      '#...####..####...#',
      '#................#',
      '#.......IF.......#',
      '##################'
    ]
  };

  // Ceiling corner nudge: jumping upward with 4 px of head overlapping col 7's right corner slips up into the gap.
  const wCeil = FI.build(def, 0);
  wCeil.fire.x = 8 * T - 4;
  wCeil.fire.y = 4 * T + 2;
  wCeil.fire.vy = -500;
  wCeil.fire.grounded = false;
  stepN(FI, wCeil, { fire: { l: false, r: false, j: true }, ice: { l: false, r: false, j: false } }, 4);
  assert.ok(wCeil.fire.vy < -300 && wCeil.fire.y < 4 * T, 'nudges past ceiling corner without bonking');

  // Ledge step-up: arriving 5 px below a stone ledge lip steps smoothly onto the top surface.
  const wLedge = FI.build(def, 0);
  wLedge.fire.x = 10 * T - wLedge.fire.w;
  wLedge.fire.y = 3 * T - wLedge.fire.h + 5;
  wLedge.fire.vx = FI.PH.speed;
  wLedge.fire.vy = 120;
  wLedge.fire.grounded = false;
  stepN(FI, wLedge, { fire: { l: false, r: true, j: false }, ice: { l: false, r: false, j: false } }, 4);
  assert.equal(wLedge.fire.y + wLedge.fire.h, 3 * T, 'steps up 5 px onto the ledge top');
  assert.ok(wLedge.fire.x > 10 * T - wLedge.fire.w, 'keeps moving forward onto the platform');

  // Puzzle invariant: Level 5's 4-tile cliff still requires the pushable crate.
  for (let jf = 1; jf <= 45; jf++) {
    const w5 = FI.build(FI.LEVELS[4], 4);
    w5.boxes.length = 0;
    for (let f = 1; f <= 95; f++) {
      stepN(FI, w5, { fire: { l: false, r: true, j: f >= jf && f < jf + 30 }, ice: { l: false, r: false, j: false } }, 1);
      assert.ok(!(w5.fire.y + w5.fire.h <= 12 * T && w5.fire.x >= 10 * T && w5.fire.grounded), '4-tile cliff cannot be climbed without crate');
    }
  }
});
