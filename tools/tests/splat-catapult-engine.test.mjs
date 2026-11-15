// Splat Catapult engine tests (games/splat-catapult/engine.js):
// Pure UMD loading, 4 worlds x 4 levels = 16 levels, physics & gadgets, all 5 trick
// balloon mid-air powers, 2P hotseat fort duel, DDA scaling, shop & save validation,
// and full simulated solvability of all 16 campaign levels!
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/splat-catapult/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

// Verify both UMD CommonJS require and browser { window: {} } VM sandbox!
const SC_CJS = require(enginePath);
const sandbox = { window: {} };
vm.runInNewContext(engineSource, sandbox);
const SC = sandbox.window.SC;

const DT = 1 / 60;
const ARABIC = /[\u0600-\u06FF]/;
const plain = v => JSON.parse(JSON.stringify(v));

// Simulates one complete shot with optional mid-air special activation at specialTime (s).
function fireShot(w, angle, power, specialTime = -1) {
  assert.equal(w.phase, 'aim', 'must be in aim phase to fire');
  SC.setAim(w, angle, power);
  assert.equal(SC.fire(w), true);
  let elapsed = 0, used = false;
  for (let i = 0; i < 600 && w.phase !== 'aim' && w.phase !== 'win' && w.phase !== 'lose'; i++) {
    if (!used && specialTime >= 0 && elapsed >= specialTime && w.phase === 'flight') {
      SC.activateSpecial(w);
      used = true;
    }
    SC.step(w, DT);
    elapsed += DT;
  }
  return w;
}

// Greedy multi-shot solver: tries candidate (angle, power, specialTime) shots on cloned
// world states to verify a human/keyboard/mouse player can clear every bot in the level.
function cloneWorld(w) {
  const c = plain(w);
  let seed = 777 + w.shots * 1337;
  c.rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return c;
}

function solveLevel(idx, params) {
  let w = SC.createLevel(idx, params);
  const angles = [0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.80, 0.92, 1.05];
  const powers = [0.58, 0.74, 0.88, 1.0];
  const specials = [-1, 0.35, 0.55, 0.78, 1.02];
  const plan = [];

  while (w.phase === 'aim') {
    let bestState = null, bestShot = null, bestScore = -Infinity;
    for (const ang of angles) {
      for (const pow of powers) {
        for (const sp of specials) {
          const sim = cloneWorld(w);
          fireShot(sim, ang, pow, sp);
          const botsKilled = SC.botsLeft(w) - SC.botsLeft(sim);
          const hpRemain = sim.bots.reduce((sum, b) => sum + (b.alive ? b.hp : 0), 0);
          const val = (sim.phase === 'win' ? 100000 : 0) + botsKilled * 5000 - hpRemain * 20 + sim.blocksSmashed * 80 + sim.score * 0.1;
          if (val > bestScore) {
            bestScore = val;
            bestState = sim;
            bestShot = { angle: ang, power: pow, specialTime: sp };
          }
          if (sim.phase === 'win' && SC.calcStars(sim) === 3) break;
        }
        if (bestState && bestState.phase === 'win' && SC.calcStars(bestState) === 3) break;
      }
      if (bestState && bestState.phase === 'win' && SC.calcStars(bestState) === 3) break;
    }
    assert.ok(bestShot, `no candidate shot for level ${idx}`);
    plan.push(bestShot);
    fireShot(w, bestShot.angle, bestShot.power, bestShot.specialTime);
  }
  return { won: w.phase === 'win', stars: SC.calcStars(w), shots: w.shots, botsLeft: SC.botsLeft(w), plan };
}

test('engine is pure UMD: works in CJS and browser sandbox, zero DOM/Kit/timers/Math.random', () => {
  assert.ok(SC && SC.createLevel && SC.step && SC.fire && SC.activateSpecial);
  assert.equal(typeof SC_CJS.createLevel, 'function');
  assert.equal(SC.LEVELS.length, SC_CJS.LEVELS.length);
  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bKit\b|\bdocument\b|\blocalStorage\b|setTimeout|setInterval|requestAnimationFrame|Math\.random/);
});

test('4 worlds x 4 levels = 16 campaign levels, valid Arabic titles, stable at rest', () => {
  assert.equal(SC.WORLDS.length, 4);
  assert.equal(SC.LEVELS.length, 16);
  SC.WORLDS.forEach((wd, wi) => {
    assert.equal(wd.id, wi);
    assert.match(wd.name, ARABIC);
  });
  SC.LEVELS.forEach((L, i) => {
    assert.equal(L.id, `${Math.floor(i / 4) + 1}-${(i % 4) + 1}`);
    assert.equal(L.world, Math.floor(i / 4));
    assert.match(L.name, ARABIC);
    assert.ok(L.queue.length >= 4 && L.queue.every(k => SC.BALLOONS[k]));
    // Verify forts sit calmly at rest before firing
    const w = SC.createLevel(i, SC.NEUTRAL);
    const bots0 = SC.botsLeft(w);
    assert.ok(bots0 >= 2, `${L.id} has at least 2 bots`);
    for (let n = 0; n < 60; n++) SC.step(w, DT);
    assert.equal(SC.botsLeft(w), bots0, `${L.id} bots remain unharmed before first shot`);
    assert.equal(w.phase, 'aim');
  });
});

test('all 5 trick balloon mid-air special abilities work cleanly', () => {
  // 1. classic: Mega Splat Surge charges & expands splat radius
  {
    const w = SC.createLevel(0, SC.NEUTRAL);
    w.queue = ['classic'];
    SC.setAim(w, 0.55, 0.8);
    SC.fire(w);
    SC.step(w, DT * 5);
    const rBefore = w.projectiles[0].splatR;
    assert.equal(SC.activateSpecial(w), true);
    assert.equal(w.projectiles[0].charged, true);
    assert.ok(w.projectiles[0].splatR > rBefore);
    assert.equal(SC.activateSpecial(w), false, 'cannot activate twice on same balloon');
  }
  // 2. triple: splits mid-air into 3 spread berry projectiles!
  {
    const w = SC.createLevel(1, SC.NEUTRAL);
    w.queue = ['triple'];
    SC.setAim(w, 0.55, 0.8);
    SC.fire(w);
    SC.step(w, DT * 6);
    assert.equal(w.projectiles.length, 1);
    assert.equal(SC.activateSpecial(w), true);
    assert.equal(w.projectiles.length, 3);
    const vys = w.projectiles.map(p => p.vy);
    assert.notEqual(vys[0], vys[1]);
    assert.notEqual(vys[1], vys[2]);
  }
  // 3. heavy: slams sharply downward mid-air to smash stone/wood!
  {
    const w = SC.createLevel(2, SC.NEUTRAL);
    w.queue = ['heavy'];
    SC.setAim(w, 0.65, 0.85);
    SC.fire(w);
    SC.step(w, DT * 10);
    const vyBefore = w.projectiles[0].vy;
    assert.equal(SC.activateSpecial(w), true);
    assert.equal(w.projectiles[0].slammed, true);
    assert.ok(w.projectiles[0].vy >= 850 && w.projectiles[0].vy > vyBefore + 500);
  }
  // 4. bouncy: bounces 4 times off floor before popping (+2 more with special!)
  {
    const w = SC.createLevel(0, SC.NEUTRAL);
    w.blocks = []; w.bots = [ { id: 0, x: 1220, y: 200, r: 22, vx: 0, vy: 0, hp: 99, maxHp: 99, side: 2, alive: true, sleeping: true, restT: 0, flash: 0 } ];
    w.queue = ['bouncy', 'bouncy'];
    SC.setAim(w, -0.15, 0.45);
    SC.fire(w);
    let bounces = 0;
    for (let i = 0; i < 450 && w.phase === 'flight'; i++) {
      w.ev.length = 0;
      SC.step(w, DT);
      bounces += w.ev.filter(e => e.t === 'bounce').length;
    }
    assert.equal(bounces, 4, 'bouncy balloon bounces 4 times before popping');
  }
  // 5. magnet: pulls nearby blocks & bots inward when activated!
  {
    const w = SC.createLevel(0, SC.NEUTRAL);
    const b0 = w.bots[0].x;
    w.queue = ['magnet'];
    SC.setAim(w, 0.46, 0.78);
    SC.fire(w);
    while (w.projectiles.length && w.projectiles[0].x < b0 - 90) SC.step(w, DT);
    assert.ok(w.projectiles.length > 0);
    const magnetX = w.projectiles[0].x;
    assert.equal(SC.activateSpecial(w), true);
    SC.step(w, DT * 4);
    assert.ok(w.bots[0].vx < 0 || w.bots[0].x < b0, `bot pulled toward magnet at ${magnetX}`);
  }
});

test('world gadgets: jelly pads bounce, fans lift, TNT barrels chain-explode, portals teleport', () => {
  // 1. Default aim on Level 0 (1-1) hits the fort directly for instant keyboard playability
  {
    const w = SC.createLevel(0, SC.NEUTRAL);
    SC.fire(w);
    while (w.phase !== 'aim' && w.phase !== 'win' && w.phase !== 'lose') SC.step(w, DT);
    assert.equal(w.shotHitAny, true, 'default Level 0 shot hits fort');
    assert.ok(w.blocksSmashed > 0 || w.botsPopped > 0, 'default Level 0 shot smashes blocks or bots');
  }
  // 2. Jelly pad (Level 4 = 2-1, pad at x=600, y=624)
  {
    const w = SC.createLevel(4, SC.NEUTRAL);
    w.queue = ['classic'];
    SC.setAim(w, 0.12, 0.42);
    SC.fire(w);
    let bouncedJelly = false;
    for (let i = 0; i < 180 && w.phase === 'flight'; i++) {
      w.ev.length = 0;
      SC.step(w, DT);
      if (w.ev.some(e => e.t === 'jelly')) bouncedJelly = true;
    }
    assert.equal(bouncedJelly, true, 'balloon bounced off jelly pad without popping');
  }
  // 3. Upward fan lifts balloon higher than fanless flight (Level 8 = 3-1)
  {
    const wFan = SC.createLevel(8, SC.NEUTRAL);
    const wNoFan = SC.createLevel(8, SC.NEUTRAL);
    wNoFan.fans = [];
    wFan.blocks = []; wFan.barrels = [];
    wNoFan.blocks = []; wNoFan.barrels = [];
    SC.setAim(wFan, 0.42, 0.55);
    SC.setAim(wNoFan, 0.42, 0.55);
    SC.fire(wFan);
    SC.fire(wNoFan);
    for (let i = 0; i < 56; i++) { SC.step(wFan, DT); SC.step(wNoFan, DT); }
    assert.ok(wFan.projectiles[0].vy < wNoFan.projectiles[0].vy - 30 && wFan.projectiles[0].y < wNoFan.projectiles[0].y - 10, 'fan lifts balloon upward');
  }
  // 4. Portal warp + heavy slam onto TNT barrel (Level 12 = 4-1: portal (555,415) -> (900,255) above TNT (900,612))
  {
    const w = SC.createLevel(12, SC.NEUTRAL);
    w.queue = ['heavy'];
    SC.setAim(w, 0.48, 0.84);
    SC.fire(w);
    let warped = false, boomed = false;
    for (let i = 0; i < 300 && w.phase !== 'aim' && w.phase !== 'win'; i++) {
      w.ev.length = 0;
      SC.step(w, DT);
      if (w.ev.some(e => e.t === 'portal')) {
        warped = true;
        SC.activateSpecial(w); // Slam straight down onto the TNT barrel!
      }
      if (w.ev.some(e => e.t === 'boom')) boomed = true;
    }
    assert.equal(warped, true, 'teleported through space portal');
    assert.equal(boomed, true, 'detonated TNT paint barrel in rainbow splats');
  }
});

test('DDA parameters scale guide dots, hit bonus, bot HP, and fan wind cleanly', () => {
  const easy = SC.params(0), mid = SC.params(0.5), hard = SC.params(1);
  assert.ok(easy.arcDots > mid.arcDots && mid.arcDots > hard.arcDots);
  assert.ok(easy.hitRadiusBonus > mid.hitRadiusBonus && mid.hitRadiusBonus > hard.hitRadiusBonus);
  assert.ok(easy.botHpScale < mid.botHpScale && mid.botHpScale < hard.botHpScale);
  assert.ok(easy.windScale < mid.windScale && mid.windScale < hard.windScale);

  const wEasy = SC.createLevel(8, easy), wHard = SC.createLevel(8, hard);
  assert.ok(SC.trajectory(wEasy).length > SC.trajectory(wHard).length);
  assert.ok(wEasy.bots[0].maxHp < wHard.bots[0].maxHp);
});

test('2-Player Hotseat Duel alternates turns, protects own fort, and crowns winner', () => {
  const w = SC.createDuel();
  assert.equal(w.mode, 'duel');
  assert.equal(w.turn, 1);
  assert.equal(SC.botsLeft(w, 1), 3);
  assert.equal(SC.botsLeft(w, 2), 3);

  // Turn 1: P1 fires a gentle short shot onto empty grass -> becomes Turn 2
  fireShot(w, -0.15, 0.20);
  assert.equal(w.turn, 2);
  assert.equal(SC.aimDir(w), -1, 'Player 2 aims leftward');

  // Turn 2: P2 fires a gentle short shot onto empty grass -> becomes Turn 1, own fort stays safe!
  fireShot(w, -0.15, 0.20);
  assert.equal(w.turn, 1);
  assert.equal(SC.botsLeft(w, 1), 3);
  assert.equal(SC.botsLeft(w, 2), 3);

  // Even firing backward into own fort in duel does zero friendly-fire damage
  {
    const sim = cloneWorld(w);
    // Drop a projectile directly on P1's own fort with side=1
    sim.projectiles.push({
      type: 'heavy', x: 191, y: 580, vx: 0, vy: 500, r: 23,
      color: '#3cd458', glow: '#ff5468', dmg: 120, splatR: 130,
      bouncesLeft: 0, maxBounces: 0, side: 1, alive: true, flight: 0, rot: 0,
      specialUsed: true, charged: false, slammed: true, mini: false, portalCd: 0, jellyCd: 0
    });
    sim.phase = 'flight';
    for (let i = 0; i < 60; i++) SC.step(sim, DT);
    assert.equal(SC.botsLeft(sim, 1), 3, 'own fort protected from friendly fire');
  }

  // Now let P1 knock out all 3 of P2's bots across turns while P2 misses short
  let guard = 0;
  while (w.phase === 'aim' && guard++ < 16) {
    if (w.turn === 1) {
      const target = w.bots.find(b => b.alive && b.side === 2);
      const ang = target.x > 1135 ? 0.53 : 0.48;
      const pow = target.x > 1135 ? 0.83 : 0.74;
      fireShot(w, ang, pow, 0.48);
    } else {
      fireShot(w, -0.18, 0.20);
    }
  }
  assert.equal(w.phase, 'win');
  assert.equal(w.winner, 1);
  assert.equal(SC.botsLeft(w, 2), 0);
});

test('saves, stars, outcomes, and shop (6 balloon skins + 5 slingshot frames)', () => {
  assert.equal(SC.SKINS.length, 6);
  assert.equal(SC.FRAMES.length, 5);
  const fresh = plain(SC.freshSave());
  assert.equal(fresh.lv.length, 16);
  assert.equal(fresh.skins[0], 1);
  assert.equal(fresh.frames[0], 1);

  for (const bad of [null, undefined, 'broken{', 42, [], {}, { v: 2 }, { v: 1, coins: -9, skin: 4, frame: 3, lv: [{ s: 9, best: -5 }] }]) {
    const loaded = plain(SC.loadSave(bad));
    assert.deepEqual(loaded, fresh);
  }

  const s = SC.freshSave();
  assert.equal(SC.isOpen(s, 0), true);
  assert.equal(SC.isOpen(s, 1), false);
  let r = SC.applyResult(s, 0, 3, 2400, 15);
  assert.equal(r.first, true);
  assert.equal(r.opened, 1);
  assert.equal(SC.isOpen(s, 1), true);
  assert.equal(SC.totalStars(s), 3);
  assert.equal(s.coins, 15);

  // Shop purchase & wear
  assert.equal(SC.buy(s, 'skin', 5), '', 'not enough coins for galaxy skin');
  assert.equal(SC.buy(s, 'skin', 1), 'bought');
  assert.equal(s.skin, 1);
  assert.equal(s.coins, 7);
  assert.equal(SC.buy(s, 'skin', 0), 'wear');
  assert.equal(s.skin, 0);

  s.coins = 50;
  assert.equal(SC.buy(s, 'frame', 2), 'bought');
  assert.equal(s.frame, 2);
  assert.equal(s.frames[2], 1);
});

test('ALL 16 campaign levels (0..15) are verified solvable through engine.js across DDA tiers', () => {
  for (let i = 0; i < SC.LEVELS.length; i++) {
    for (const [label, P] of [['easy', SC.params(0)], ['neutral', SC.NEUTRAL], ['hard', SC.params(1)]]) {
      const res = solveLevel(i, P);
      assert.equal(res.won, true, `Level ${i} (${SC.LEVELS[i].id}) must be solvable on ${label}: botsLeft=${res.botsLeft}`);
      assert.equal(res.botsLeft, 0);
      assert.ok(res.stars >= 1 && res.stars <= 3);
    }
  }
});
