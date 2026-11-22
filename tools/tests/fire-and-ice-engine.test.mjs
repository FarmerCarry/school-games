import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadEngine() {
  const ctx = { console, Math, Object, Array, JSON, Error, Uint8Array, isFinite };
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

  // Run right until Fire's feet have fully stepped off stone (col 9) onto goo (col 10), then jump 3 frames later.
  const wJump = FI.build(def, 0);
  let crossed = 0;
  while (crossed < 3 && wJump.state === 'play') {
    stepN(FI, wJump, { fire: { l: false, r: true, j: false }, ice: { l: false, r: false, j: false } }, 1);
    if (wJump.fire.x + 3 >= 10 * T) crossed++;
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
  wEdge.ice.x = 10 * T - wEdge.ice.w + 6;
  stepN(FI, wEdge, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 30);
  assert.equal(wEdge.state, 'play', 'standing on the stone edge with toes overhanging goo is safe');

  // Sprinting straight through a 2-tile deadly pool without jumping still kills.
  const wSprint = FI.build(def, 0);
  stepN(FI, wSprint, { fire: { l: false, r: true, j: false }, ice: { l: false, r: false, j: false } }, 90);
  assert.equal(wSprint.state, 'dead', 'cannot run across a 2-tile deadly pool without jumping');

  // Falling from mid-air into goo kills immediately even if jump is mashed.
  const wFall = FI.build(def, 0);
  wFall.fire.x = 10.6 * T;
  wFall.fire.y = 4.2 * T;
  wFall.fire.grounded = false;
  wFall.fire.onStone = false;
  wFall.fire.poolGraceT = 0;
  for (let f = 0; f < 60 && wFall.state === 'play'; f++) {
    stepN(FI, wFall, { fire: { l: false, r: false, j: f % 2 === 0 }, ice: { l: false, r: false, j: false } }, 1);
  }
  assert.equal(wFall.state, 'dead', 'falling into a goo lake cannot pogo-jump out');
});

test('Fire & Ice buffers early jump presses and distinguishes quick taps from held jumps', () => {
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

  // A 7-frame quick tap at running speed clears a 3-tile pool while staying lower than a held jump.
  const wTap = FI.build(def, 0);
  wTap.fire.x = 9.0 * T;
  wTap.fire.vx = FI.PH.speed;
  const startY = wTap.fire.y;
  let tapApex = startY;
  for (let f = 0; f < 55; f++) {
    stepN(FI, wTap, { fire: { l: false, r: true, j: f < 7 }, ice: { l: false, r: false, j: false } }, 1);
    tapApex = Math.min(tapApex, wTap.fire.y);
  }
  assert.equal(wTap.state, 'play', 'a quick tap at running speed clears a 3-tile pool');
  assert.ok(wTap.fire.x >= 13 * T, 'landed cleanly past the 3-tile pool');

  const wHold = FI.build(def, 0);
  wHold.fire.x = 3 * T;
  let holdApex = startY;
  for (let f = 0; f < 50; f++) {
    stepN(FI, wHold, { fire: { l: false, r: false, j: f < 24 }, ice: { l: false, r: false, j: false } }, 1);
    holdApex = Math.min(holdApex, wHold.fire.y);
  }
  assert.ok(startY - tapApex < startY - holdApex - 10, 'holding jump rises noticeably higher than a short tap');

  // Buffered press ~8 frames before landing triggers immediately on touchdown.
  const wBuf = FI.build(def, 0);
  stepN(FI, wBuf, { fire: { l: false, r: false, j: true }, ice: { l: false, r: false, j: false } }, 1);
  stepN(FI, wBuf, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 1);
  while (!(wBuf.fire.vy > 0 && wBuf.fire.y >= startY - 40)) {
    stepN(FI, wBuf, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 1);
  }
  assert.equal(wBuf.fire.grounded, false, 'still airborne when pressing jump early');
  stepN(FI, wBuf, { fire: { l: false, r: false, j: true }, ice: { l: false, r: false, j: false } }, 1);
  let relaunched = false;
  for (let f = 0; f < 14; f++) {
    stepN(FI, wBuf, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 1);
    if (wBuf.fire.vy < -300) relaunched = true;
  }
  assert.equal(relaunched, true, 'early buffered jump triggers upon touchdown');
});

test('Fire & Ice forgives ceiling corners and ledge lips while keeping Level 5 crate-cliff puzzle intact', () => {
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

  // Ceiling corner nudge
  const wCeil = FI.build(def, 0);
  wCeil.fire.x = 8 * T - 4;
  wCeil.fire.y = 4 * T + 2;
  wCeil.fire.vy = -440;
  wCeil.fire.grounded = false;
  stepN(FI, wCeil, { fire: { l: false, r: false, j: true }, ice: { l: false, r: false, j: false } }, 4);
  assert.ok(wCeil.fire.vy < -250 && wCeil.fire.y < 4 * T, 'nudges past ceiling corner without bonking');

  // Ledge step-up
  const wLedge = FI.build(def, 0);
  wLedge.fire.x = 10 * T - wLedge.fire.w;
  wLedge.fire.y = 3 * T - wLedge.fire.h + 5;
  wLedge.fire.vx = FI.PH.speed;
  wLedge.fire.vy = 110;
  wLedge.fire.grounded = false;
  stepN(FI, wLedge, { fire: { l: false, r: true, j: false }, ice: { l: false, r: false, j: false } }, 4);
  assert.equal(wLedge.fire.y + wLedge.fire.h, 3 * T, 'steps up 5 px onto ledge top');
  assert.ok(wLedge.fire.x > 10 * T - wLedge.fire.w, 'keeps moving forward onto ledge');

  // Puzzle invariant: Level 5's 3-tile sheer right cliff (row 13..15 cols 22+) cannot be scaled without the crate!
  for (let jf = 1; jf <= 45; jf++) {
    const w5 = FI.build(FI.LEVELS[4], 4);
    w5.boxes.length = 0;
    w5.fire.x = 16 * T;
    for (let f = 1; f <= 85; f++) {
      stepN(FI, w5, { fire: { l: false, r: true, j: f >= jf && f < jf + 26 }, ice: { l: false, r: false, j: false } }, 1);
      assert.ok(!(w5.fire.y + w5.fire.h <= 13 * T && w5.fire.x >= 22 * T && w5.fire.grounded), '3-tile cliff cannot be climbed without crate');
    }
  }
});

test('Fire & Ice channels, levers, crate-weighted buttons, win stars and save v2 helpers work deterministically', () => {
  const FI = loadEngine();
  const T = FI.T;

  // Level 4 paired buttons: standing on button activates channel 0; leaving deactivates it
  const w4 = FI.build(FI.LEVELS[3], 3);
  const bt0 = w4.buttons[0];
  w4.fire.x = bt0.x;
  w4.fire.y = bt0.y + bt0.h - w4.fire.h;
  stepN(FI, w4, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 2);
  assert.equal(w4.channels[0], true, 'button presses activate linked channel');
  w4.fire.x = 2 * T;
  stepN(FI, w4, { fire: { l: false, r: false, j: false }, ice: { l: false, r: false, j: false } }, 2);
  assert.equal(w4.channels[0], false, 'releasing all buttons deactivates linked channel');

  // Stars calculation: 1 clear + 1 all gems + 1 par time
  const w1 = FI.build(FI.LEVELS[0], 0);
  w1.state = 'won';
  w1.t = w1.par + 5;
  assert.equal(FI.starsFor(w1).stars, 1, 'clear alone awards 1 star');
  w1.gemsGot.fire = w1.gemsTotal.fire;
  w1.gemsGot.ice = w1.gemsTotal.ice;
  assert.equal(FI.starsFor(w1).stars, 2, 'clear + all gems awards 2 stars');
  w1.t = w1.par - 3;
  assert.equal(FI.starsFor(w1).stars, 3, 'clear + all gems + par time awards 3 stars');

  // Save v2 sanitization & old-save reset
  const resetOld = FI.sanitizeSave({ v: 1, unlocked: 12, best: { 0: { stars: 3, time: 10 } } });
  assert.equal(resetOld.v, 2);
  assert.equal(resetOld.unlocked, 1, 'old v1 saves cleanly reset to fresh v2 save');
  assert.equal(FI.totalStars(resetOld), 0);

  const valid = FI.sanitizeSave({
    v: 2,
    unlocked: 99,
    solo: true,
    hat: 'crown',
    best: { 0: { stars: 3, time: 11.4 }, 1: { stars: 3, time: 15.2 } }
  });
  assert.equal(valid.unlocked, FI.LEVELS.length, 'unlocked clamped to level count');
  assert.equal(valid.hat, 'crown', 'hat allowed once star requirement (6★) is met');
  assert.equal(FI.sanitizeSave({ v: 2, unlocked: 2, hat: 'star', best: {} }).hat, 'none', 'locked hat rejected');

  // Time formatting edge cases
  assert.equal(FI.formatTime(9.96), '0:10.0');
  assert.equal(FI.formatTime(59.96), '1:00.0');
  assert.equal(FI.formatTime(0), '0:00.0');
});
