// Splat Catapult engine tests (games/splat-catapult/engine.js):
// Verifies pure UMD export (module.exports + window.SCEngine), genuine 2D rotational
// toppling rigid-body physics (Math.abs(block.rot) > 0.1 on side-pillar hits & single-leg
// collapse), awake resting stability, TNT chain reactions, all 5 mid-air paint projectile
// abilities, boulders/portals/geysers, 2P Fort Duel, workshop saves, and 16-stage solvability!
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

const E_CJS = require(enginePath);
const sandbox = { window: {} };
vm.runInNewContext(engineSource, sandbox);
const E = sandbox.window.SCEngine;

const DT = 1 / 60;
const ARABIC = /[\u0600-\u06FF]/;
const plain = v => JSON.parse(JSON.stringify(v));

function cloneWorld(w) {
  const c = plain(w);
  let seed = 9001 + w.shots * 1337;
  c.rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  c.bots = c.goblins;
  return c;
}

function fireShot(w, angle, power, specialTime = -1) {
  assert.equal(w.phase, 'aim', 'must be in aim phase to fire');
  E.setAim(w, angle, power);
  assert.equal(E.fire(w), true);
  let elapsed = 0, used = false;
  for (let i = 0; i < 480 && (w.phase === 'flight' || w.phase === 'settle'); i++) {
    if (!used && specialTime >= 0 && elapsed >= specialTime && w.phase === 'flight') {
      E.activateSpecial(w);
      used = true;
    }
    E.step(w, DT);
    elapsed += DT;
  }
  return w;
}

function solveStage(idx, P) {
  const w = E.createStage(idx, P);
  const angles = [0.16, 0.30, 0.44, 0.56, 0.70, 0.86];
  const powers = [0.55, 0.76, 0.92, 1.0];
  const specials = [-1, 0.38, 0.62, 0.88];

  let guard = 0;
  while (w.phase === 'aim' && guard++ < 10) {
    let bestShot = null, bestVal = -Infinity;
    for (const ang of angles) {
      for (const pow of powers) {
        for (const sp of specials) {
          const sim = cloneWorld(w);
          fireShot(sim, ang, pow, sp);
          const killed = E.goblinsLeft(w) - E.goblinsLeft(sim);
          const hpRem = sim.goblins.reduce((s, g) => s + (g.alive ? g.hp : 0), 0);
          const val = (sim.phase === 'win' ? 200000 : 0) + killed * 8000 - hpRem * 25 + sim.tntBlasted * 900 + sim.blocksSmashed * 90 + sim.toppledCount * 120;
          if (val > bestVal) {
            bestVal = val;
            bestShot = { angle: ang, power: pow, specialTime: sp };
          }
          if (sim.phase === 'win') break;
        }
        if (bestVal >= 200000) break;
      }
      if (bestVal >= 200000) break;
    }
    assert.ok(bestShot, `candidate shot found for stage ${idx}`);
    fireShot(w, bestShot.angle, bestShot.power, bestShot.specialTime);
  }
  return { won: w.phase === 'win', stars: E.calcStars(w), shots: w.shots, left: E.goblinsLeft(w) };
}

test('pure UMD engine: exports module.exports and window.SCEngine, zero DOM/Kit/timers/Math.random', () => {
  assert.ok(E && E.createStage && E.step && E.fire && E.activateSpecial);
  assert.equal(typeof E_CJS.createStage, 'function');
  assert.equal(E.STAGES.length, 16);
  assert.equal(E_CJS.STAGES.length, 16);
  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bKit\b|\bdocument\b|\blocalStorage\b|setTimeout|setInterval|requestAnimationFrame|Math\.random/);
});

test('real 2D rotational toppling physics: side-struck pillar rotates, domino-topples neighbor, and crushes goblin!', () => {
  const w = E.createStage(0, E.NEUTRAL);
  // Build clean 2-pillar domino + goblin behind second pillar to isolate pure rigid-body rotation & crush
  const G = E.GROUND_Y;
  w.pedestals = [];
  w.blocks = [
    // Tall steel pillar 1 (won't shatter on hit, so it MUST lean and topple!)
    { ...w.blocks[0], id: 0, mat: 'steel', x: 760, y: G - 85, bw: 22, bh: 170, boundR: Math.hypot(22, 170) / 2, hp: 500, maxHp: 500, m: 9, im: 1 / 9, iI: 12 / (9 * (22 * 22 + 170 * 170)), sleeping: false, restT: 0 },
    // Tall wood pillar 2 next to it (domino target!)
    { ...w.blocks[0], id: 1, mat: 'wood', x: 845, y: G - 75, bw: 22, bh: 150, boundR: Math.hypot(22, 150) / 2, hp: 400, maxHp: 400, m: 4.5, im: 1 / 4.5, iI: 12 / (4.5 * (22 * 22 + 150 * 150)), sleeping: false, restT: 0 }
  ];
  w.goblins = [
    { ...w.goblins[0], id: 0, x: 935, y: G - 21, hp: 35, maxHp: 35, alive: true, sleeping: false, restT: 0 }
  ];

  // Give high horizontal side-impact near the top of pillar 1 (like a heavy shot striking its upper flank)
  const p1 = w.blocks[0], p2 = w.blocks[1];
  const hitOffsetY = -70; // near top of pillar 1
  const Jx = 1950, Jy = 0;
  p1.vx += p1.im * Jx;
  p1.w += p1.iI * (0 * Jy - hitOffsetY * Jx);

  let maxRot1 = 0, maxRot2 = 0;
  for (let i = 0; i < 150; i++) {
    E.step(w, DT);
    maxRot1 = Math.max(maxRot1, Math.abs(p1.rot));
    maxRot2 = Math.max(maxRot2, Math.abs(p2.rot));
  }

  assert.ok(maxRot1 > 0.5, `first pillar rotated strongly (${maxRot1.toFixed(2)} rad > 0.5)`);
  assert.ok(maxRot2 > 0.4, `second domino pillar leaned & toppled (${maxRot2.toFixed(2)} rad > 0.4)`);
  assert.equal(w.goblins[0].alive, false, 'domino-toppled pillar crushed the robo-goblin underneath!');
});

test('all 16 stages across 4 open worlds have Arabic names and sit rock-steady at rest (even when woken!)', () => {
  const save = E.freshSave();
  assert.equal(E.WORLDS.length, 4);
  assert.equal(E.STAGES.length, 16);
  E.WORLDS.forEach((wd, i) => {
    assert.equal(wd.id, i);
    assert.match(wd.name, ARABIC);
  });

  E.STAGES.forEach((st, idx) => {
    assert.equal(st.id, `${Math.floor(idx / 4) + 1}-${(idx % 4) + 1}`);
    assert.match(st.name, ARABIC);
    assert.equal(E.isOpen(save, idx), true, `stage ${st.id} is unlocked immediately`);

    const w = E.createStage(idx, E.NEUTRAL);
    const g0 = E.goblinsLeft(w);
    const startX = w.blocks.map(b => b.x);
    assert.ok(g0 >= 3, `${st.id} has >= 3 goblins`);

    // Force every block and goblin AWAKE to prove real 2D contact equilibrium holds without cheating!
    w.blocks.forEach(b => { b.sleeping = false; b.restT = 0; });
    w.goblins.forEach(g => { g.sleeping = false; g.restT = 0; });
    for (let f = 0; f < 90; f++) E.step(w, DT);

    assert.equal(E.goblinsLeft(w), g0, `${st.id}: zero goblins harmed while settling awake`);
    assert.equal(w.tntBlasted, 0, `${st.id}: zero TNT prematurely detonated while settling awake`);
    for (let bi = 0; bi < w.blocks.length; bi++) {
      const b = w.blocks[bi];
      assert.equal(b.alive, true, `${st.id}: block ${b.id} intact at rest`);
      if (b.shape === 'circle') {
        assert.ok(Math.abs(b.x - startX[bi]) < 12, `${st.id}: boulder ${b.id} stays on perch`);
      } else {
        assert.ok(Math.abs(b.rot) < 0.08, `${st.id}: block ${b.id} stays upright (rot=${b.rot.toFixed(3)})`);
      }
    }
  });
});

test('TNT chain reaction detonates neighboring Paint-TNT barrels and splatters blocks', () => {
  const w = E.createStage(0, E.NEUTRAL);
  const G = E.GROUND_Y;
  w.blocks = [
    { ...w.blocks.find(b => b.isTnt), id: 0, x: 800, y: G - 22, alive: true, fuse: -1 },
    { ...w.blocks.find(b => b.isTnt), id: 1, x: 920, y: G - 22, alive: true, fuse: -1 },
    { ...w.blocks[0], id: 2, isTnt: false, x: 990, y: G - 70, alive: true, hp: 300, maxHp: 300 }
  ];
  // Drop bomb directly on first TNT barrel
  w.queue = ['bomb'];
  w.projectiles = [{
    type: 'bomb', x: 800, y: G - 55, vx: 0, vy: 400, r: 19, m: 2.3, dmg: 82,
    blastR: 132, blastJ: 580, color: '#ff3877', accent: '#ffe033', rot: 1.57,
    side: 1, dir: 1, alive: true, flight: 0, bouncesLeft: 0, pierceLeft: 0,
    specialUsed: false, drilling: 0, boomerang: false, slammed: false, surged: false,
    portalCd: 0, geyserCd: 0, hitIds: {}
  }];
  w.phase = 'flight';
  for (let i = 0; i < 45; i++) E.step(w, DT);
  assert.equal(w.tntBlasted, 2, 'both TNT barrels detonated in chain reaction');
  assert.ok(Math.abs(w.blocks[2].rot) > 0.1 || w.blocks[2].vx > 20, 'adjacent pillar blasted & tilted');
  assert.ok(w.splats.length >= 2, 'permanent neon paint splatters recorded');
});

test('all 5 wild paint projectile mid-air abilities work cleanly', () => {
  // 1. قنبلة الألوان (bomb): shockwave surge expands radius & knockback
  {
    const w = E.createStage(0, E.NEUTRAL);
    w.queue = ['bomb'];
    E.setAim(w, 0.5, 0.8);
    E.fire(w);
    E.step(w, DT * 5);
    const r0 = w.projectiles[0].blastR;
    assert.equal(E.activateSpecial(w), true);
    assert.equal(w.projectiles[0].surged, true);
    assert.ok(w.projectiles[0].blastR > r0 * 1.4);
    assert.equal(E.activateSpecial(w), false, 'cannot double-activate');
  }
  // 2. الثلاثي المتفرّع (cluster): splits into 3 whistling mini-rockets
  {
    const w = E.createStage(1, E.NEUTRAL);
    w.queue = ['cluster'];
    E.setAim(w, 0.52, 0.8);
    E.fire(w);
    E.step(w, DT * 6);
    assert.equal(E.activateSpecial(w), true);
    const alive = w.projectiles.filter(p => p.alive);
    assert.equal(alive.length, 3);
    assert.notEqual(alive[0].vy, alive[1].vy);
    assert.notEqual(alive[1].vy, alive[2].vy);
  }
  // 3. صاروخ الحفر (drill): target lock & pierces wood/ice walls
  {
    const w = E.createStage(4, E.NEUTRAL);
    w.queue = ['drill'];
    E.setAim(w, 0.52, 0.82);
    E.fire(w);
    E.step(w, DT * 8);
    assert.equal(E.activateSpecial(w), true);
    assert.ok(w.projectiles[0].drilling > 0);
    assert.equal(w.projectiles[0].pierceLeft, 3);
    assert.ok(Math.hypot(w.projectiles[0].vx, w.projectiles[0].vy) > 1050);
  }
  // 4. البطيخة العملاقة (melon): bounces when untapped, meteor-slams straight down when tapped!
  {
    const w = E.createStage(0, E.NEUTRAL);
    w.blocks = [];
    w.goblins = [{ ...w.goblins[0], x: 1220, hp: 999, maxHp: 999 }];
    w.queue = ['melon', 'melon'];
    E.setAim(w, 0.22, 0.38);
    E.fire(w);
    let bounced = false;
    for (let i = 0; i < 160 && w.phase === 'flight'; i++) {
      w.ev.length = 0;
      E.step(w, DT);
      if (w.ev.some(e => e.t === 'bounce')) bounced = true;
    }
    assert.equal(bounced, true, 'untapped melon bounces heavily off ground');

    // Second melon: tap mid-air for meteor slam!
    for (let i = 0; i < 240 && (w.phase === 'flight' || w.phase === 'settle'); i++) E.step(w, DT);
    assert.equal(w.phase, 'aim');
    E.setAim(w, 0.65, 0.85);
    E.fire(w);
    E.step(w, DT * 10);
    assert.equal(E.activateSpecial(w), true);
    assert.equal(w.projectiles[0].slammed, true);
    assert.ok(w.projectiles[0].vy >= 1050);
  }
  // 5. منشار الارتداد (saw): boomerang curve-back reverses horizontal velocity!
  {
    const w = E.createStage(2, E.NEUTRAL);
    w.blocks = [];
    w.queue = ['saw'];
    E.setAim(w, 0.45, 0.65);
    E.fire(w);
    E.step(w, DT * 8);
    const vxBefore = w.projectiles[0].vx;
    assert.ok(vxBefore > 300);
    assert.equal(E.activateSpecial(w), true);
    for (let i = 0; i < 45; i++) E.step(w, DT);
    assert.ok(w.projectiles[0].vx < 0, `saw curved back leftward (vx=${w.projectiles[0].vx.toFixed(1)})`);
  }
});

test('world gadgets: Magnet Portals warp shots (3-2) and Bouncy Geysers launch shots sky-high (4-1)', () => {
  // Magnet Portal in Stage 3-2 (index 9): (560, 390) -> (960, 250)
  {
    const w = E.createStage(9, E.NEUTRAL);
    w.queue = ['bomb'];
    E.setAim(w, 0.56, 0.78);
    E.fire(w);
    let warped = false;
    for (let i = 0; i < 180 && w.phase === 'flight'; i++) {
      w.ev.length = 0;
      E.step(w, DT);
      if (w.ev.some(e => e.t === 'portal')) warped = true;
    }
    assert.equal(warped, true, 'projectile warped through magnet portal');
  }

  // Bouncy Volcanic Steam Geyser in Stage 4-1 (index 12): x=565
  {
    const w = E.createStage(12, E.NEUTRAL);
    w.queue = ['bomb'];
    E.setAim(w, 0.16, 0.52);
    E.fire(w);
    let boosted = false;
    for (let i = 0; i < 180 && w.phase === 'flight'; i++) {
      w.ev.length = 0;
      E.step(w, DT);
      if (w.ev.some(e => e.t === 'geyser')) boosted = true;
    }
    assert.equal(boosted, true, 'low shot launched sky-high by volcanic geyser');
  }
});

test('difficulty tiers (سهل / متوسط / بطل) + DDA scale arc preview, bonus shots, wind, and HP', () => {
  const easy = E.params('easy', 0.2), mid = E.params('mid', 0.5), hero = E.params('hero', 0.8);
  assert.ok(easy.arcDots > mid.arcDots && mid.arcDots > hero.arcDots);
  assert.equal(easy.bonusShots, 2);
  assert.equal(mid.bonusShots, 0);
  assert.equal(easy.windMax, 0);
  assert.ok(hero.windMax > 50);
  assert.ok(easy.hpScale < mid.hpScale && mid.hpScale < hero.hpScale);

  const wEasy = E.createStage(0, easy), wHero = E.createStage(0, hero);
  assert.equal(wEasy.queue.length, wHero.queue.length + 2);
  assert.equal(wEasy.wind, 0);
  assert.notEqual(wHero.wind, 0);
  assert.ok(E.trajectory(wEasy).length > E.trajectory(wHero).length);
});

test('2P Fort Duel alternates turns, prevents friendly fire, and crowns winner', () => {
  const w = E.createDuel('mid');
  assert.equal(w.mode, 'duel');
  assert.equal(w.width, E.DUEL_W);
  assert.equal(w.turn, 1);
  assert.equal(E.goblinsLeft(w, 1), 3);
  assert.equal(E.goblinsLeft(w, 2), 3);

  fireShot(w, 0.05, 0.24);
  assert.equal(w.turn, 2);
  assert.equal(E.aimDir(w), -1);

  fireShot(w, 0.05, 0.24);
  assert.equal(w.turn, 1);
  assert.equal(E.goblinsLeft(w, 1), 3);
  assert.equal(E.goblinsLeft(w, 2), 3);

  // Friendly-fire immunity check
  const sim = cloneWorld(w);
  sim.projectiles = [{
    type: 'melon', x: 230, y: 340, vx: 0, vy: 800, r: 24, m: 3.5, dmg: 150,
    blastR: 180, blastJ: 700, color: '#34d85c', accent: '#ff3b5c', rot: 1.57,
    side: 1, dir: 1, alive: true, flight: 0, bouncesLeft: 0, pierceLeft: 0,
    specialUsed: true, drilling: 0, boomerang: false, slammed: true, surged: false,
    portalCd: 0, geyserCd: 0, hitIds: {}
  }];
  sim.phase = 'flight';
  for (let i = 0; i < 60; i++) E.step(sim, DT);
  assert.equal(E.goblinsLeft(sim, 1), 3, 'Player 1 fort immune to own projectile');

  // Clear P2's goblins to verify P1 victory
  w.goblins.filter(g => g.side === 2).forEach((g, idx) => { if (idx < 2) g.alive = false; else g.hp = 10; });
  const lastG = w.goblins.find(g => g.side === 2 && g.alive);
  w.projectiles = [{
    type: 'bomb', x: lastG.x, y: lastG.y - 30, vx: 0, vy: 500, r: 19, m: 2.3, dmg: 90,
    blastR: 150, blastJ: 600, color: '#ff3877', accent: '#ffe033', rot: 1.57,
    side: 1, dir: 1, alive: true, flight: 0, bouncesLeft: 0, pierceLeft: 0,
    specialUsed: true, drilling: 0, boomerang: false, slammed: false, surged: true,
    portalCd: 0, geyserCd: 0, hitIds: {}
  }];
  w.phase = 'flight';
  for (let i = 0; i < 80 && w.phase !== 'win'; i++) E.step(w, DT);
  assert.equal(w.phase, 'win');
  assert.equal(w.winner, 1);
});

test('saves & Catapult Workshop (ورشة المقلاع) validate, recover corrupted data, and unlock launchers', () => {
  const fresh = plain(E.freshSave());
  for (const bad of [null, undefined, 'bad{', 99, [], {}, { v: 1 }, { v: 2, coins: -5 }, { v: 2, coins: 10, launcher: 3 }]) {
    assert.deepEqual(plain(E.loadSave(bad)), fresh);
  }
  const s = E.freshSave();
  const res = E.applyResult(s, 0, 3, 2800);
  assert.equal(res.stars, 3);
  assert.ok(s.coins >= 15);
  assert.equal(E.totalStars(s), 3);

  // Buy Dragon Cannon (price 15)
  s.coins = 20;
  assert.equal(E.buyItem(s, 'launcher', 4), '', 'cannot afford golden catapult yet');
  assert.equal(E.buyItem(s, 'launcher', 1), 'bought');
  assert.equal(s.launcher, 1);
  assert.equal(s.coins, 5);
  assert.equal(E.buyItem(s, 'launcher', 0), 'wear');
  assert.equal(s.launcher, 0);
});

test('ALL 16 stages (1-1..4-4) are verified solvable across سهل, متوسط, and بطل!', () => {
  // Default aim on Stage 1-1 hits and smashes fort immediately on single Space press!
  {
    const w0 = E.createStage(0, E.NEUTRAL);
    E.fire(w0);
    while (w0.phase === 'flight' || w0.phase === 'settle') E.step(w0, DT);
    assert.equal(w0.shotHitAny, true, 'Stage 1-1 default aim hits the fort');
    assert.ok(w0.blocksSmashed > 0 || w0.goblinsSplatted > 0 || w0.tntBlasted > 0);
  }

  for (let i = 0; i < E.STAGES.length; i++) {
    for (const [label, P] of [['easy', E.params('easy', 0.2)], ['mid', E.NEUTRAL], ['hero', E.params('hero', 0.75)]]) {
      const r = solveStage(i, P);
      assert.equal(r.won, true, `Stage ${E.STAGES[i].id} solvable on ${label} (left=${r.left})`);
      assert.equal(r.left, 0);
      assert.ok(r.stars >= 1 && r.stars <= 3);
    }
  }
});
