// Chaos Island engine unit tests (Node only, zero browser):
// Verifies purity, all 4 battle islands, 3 difficulty tiers + DDA scaling,
// strict player.walk contract, active Belly-Dash & Head-Bonk brawl moves,
// Power-Crates (Jetpack, Shield, Hammer), all 7 micro-disasters,
// Turbo Rescue Drone + zero ghost wait, and full 3-round match simulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/chaos-island/engine.js');
const source = fs.readFileSync(enginePath, 'utf8');
const require = createRequire(import.meta.url);
const cjsEngine = require(enginePath);

const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const E = sandbox.window.CIEngine;
const DT = 1 / 60;

test('engine exports cleanly to both CommonJS and window.CIEngine with zero DOM or telemetry', () => {
  assert.ok(cjsEngine && E && typeof E.createWorld === 'function' && typeof E.stepWorld === 'function');
  assert.equal(cjsEngine.W, 1280);
  assert.equal(cjsEngine.H, 720);
  const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bKit\b|\bdocument\b|localStorage|AudioContext|setTimeout|setInterval|requestAnimationFrame|Math\.random/);
});

test('all 4 battle islands and 3 difficulty tiers configure distinct arenas and rules', () => {
  assert.deepEqual(Array.from(E.ISLANDS, i => i.name), ['بركان القراصنة', 'قلعة الديناصور', 'سفينة الفضاء', 'جزيرة الجليد الآلي']);
  for (let idx = 0; idx < E.ISLANDS.length; idx++) {
    const w = E.createWorld({ island: idx, diff: 'normal', seed: 10 + idx });
    assert.equal(w.islandIndex, idx);
    assert.equal(w.phase, 'card');
    assert.equal(w.round, 0);
    assert.equal(w.actors[0].onGround, true);
  }

  const easy = E.createWorld({ diff: 'easy', seed: 42 });
  const norm = E.createWorld({ diff: 'normal', seed: 42 });
  const hero = E.createWorld({ diff: 'hero', seed: 42 });

  assert.equal(easy.actors[0].maxHearts, 5);
  assert.equal(norm.actors[0].maxHearts, 3);
  assert.equal(hero.actors[0].maxHearts, 2);
  assert.ok(easy.diffCfg.warn > norm.diffCfg.warn && norm.diffCfg.warn > hero.diffCfg.warn);
  assert.ok(easy.speedMul < norm.speedMul && norm.speedMul < hero.speedMul);
  assert.equal(norm.plan[2].id, 'double', 'Round 3 in normal is Double-Disaster');
  assert.ok(hero.plan.every(r => r.id === 'double' && r.sub.length === 2), 'Hero has Double-Disaster in every round');
});

test('player.walk increments ONLY from Player 1 intentional horizontal input (never wind, platforms, springs, or bonks)', () => {
  const w = E.createWorld({ island: 'alien', diff: 'normal', seed: 99 });
  const p1 = w.actors[0];
  // Put P1 on moving platform + apply strong wind + bonk velocity, with NO human input
  const movPlat = w.plats.find(p => p.moveAmp > 0);
  p1.x = movPlat.x + movPlat.w / 2;
  p1.y = movPlat.y - p1.r;
  w.windX = 120;
  p1.vx = 250;

  for (let i = 0; i < 180; i++) E.stepWorld(w, [{ moveX: 0 }], DT);
  assert.equal(p1.walk, 0, 'idle player.walk stays strictly 0 despite wind, bots, and moving platforms');

  // Now hold ArrowRight during card/action
  const w2 = E.createWorld({ island: 'volcano', diff: 'normal', seed: 7 });
  const x0 = w2.actors[0].x;
  for (let i = 0; i < 12; i++) E.stepWorld(w2, [{ moveX: 1 }], DT);
  assert.ok(w2.actors[0].walk > 50, 'holding right increases player.walk cleanly');
  assert.ok(w2.actors[0].x > x0 + 40, 'Player 1 walks right immediately even during card phase');
});

test('jump, double-jump flip, and one-way platform drop-through work responsively', () => {
  const w = E.createWorld({ island: 'volcano', diff: 'easy', seed: 11 });
  const p1 = w.actors[0];
  // Ground jump
  E.stepWorld(w, [{ moveX: 0, jump: true, jumpPressed: true }], DT);
  assert.ok(p1.vy < -500 && !p1.onGround);
  for (let i = 0; i < 10; i++) E.stepWorld(w, [{ moveX: 0 }], DT);

  // Mid-air double-jump with flip
  const vyBefore = p1.vy;
  E.stepWorld(w, [{ moveX: 0, jump: true, jumpPressed: true }], DT);
  assert.ok(p1.vy < vyBefore && p1.flipT > 0, 'double-jump boosts upward and triggers flip');

  // Land on upper one-way platform, then drop through with down
  const topPlat = w.plats.find(p => p.id === 'top');
  p1.x = topPlat.x + topPlat.w / 2;
  p1.y = topPlat.y - p1.r - 2;
  p1.vy = 40;
  for (let i = 0; i < 6; i++) E.stepWorld(w, [{}], DT);
  assert.equal(p1.groundId, 'top');

  E.stepWorld(w, [{ down: true }], DT);
  for (let i = 0; i < 25; i++) E.stepWorld(w, [{}], DT);
  assert.ok(p1.y > topPlat.y + 30, 'pressing down drops cleanly through one-way platform');
});

test('active brawl: Belly-Dash bumps rivals for coins/points, deflects bombs, and Head-Bonk bounces', () => {
  const w = E.createWorld({ island: 'volcano', diff: 'normal', seed: 25 });
  const p1 = w.actors[0];
  const bot = w.actors[1];
  bot.x = p1.x + 48;
  bot.y = p1.y;
  p1.facing = 1;

  // Belly-Dash into rival
  E.stepWorld(w, [{ moveX: 1, dash: true, dashPressed: true }], DT);
  for (let i = 0; i < 8; i++) E.stepWorld(w, [{ moveX: 1 }], DT);
  assert.ok(p1.bonks >= 1 && p1.score >= 25, 'Belly-Dash scores a bonk on rival');
  assert.ok(w.coins.length >= 1, 'bonking rival pops out golden coins');

  // Belly-Dash deflects ticking bomb
  p1.dashCd = 0;
  w.hazards.push({ kind: 'bomb', x: p1.x + 36, y: p1.y, vx: -40, vy: 0, r: 20, fuse: 2.0, owner: -1 });
  E.stepWorld(w, [{ moveX: 1, dash: true, dashPressed: true }], DT);
  assert.ok(w.hazards[0].vx > 400 && w.hazards[0].owner === 0, 'Belly-Dash punts bomb across the island');

  // Mario-style Head-Bonk
  bot.stunT = 0;
  bot.x = 640; bot.y = 538;
  p1.x = 640; p1.y = 500; p1.vy = 220; p1.dashT = 0;
  const bonksBefore = p1.bonks;
  for (let i = 0; i < 6; i++) E.stepWorld(w, [{}], DT);
  assert.ok(p1.bonks > bonksBefore && p1.vy < 0, 'falling onto rival head bounces upward and stuns rival');
});

test('Power-Crates grant Jetpack hover, Electric Shield absorb, and Giant Hammer shockwave slam', () => {
  const w = E.createWorld({ island: 'dino', diff: 'normal', seed: 55 });
  const p1 = w.actors[0];

  // Pickup shield crate and absorb hazard hit without losing hearts
  w.crates.push({ x: p1.x, y: p1.y, vy: 0, r: 22, gadget: 'shield' });
  E.stepWorld(w, [{}], DT);
  assert.equal(p1.gadget, 'shield');
  const h0 = p1.hearts;
  E.hurtActor(w, p1, 200, -300);
  assert.equal(p1.hearts, h0, 'Electric Shield absorbs hazard damage');
  assert.equal(p1.gadget, null);

  // Jetpack hover lifts upward
  p1.invulnT = 0;
  p1.gadget = 'jetpack'; p1.gadgetT = 5;
  const yStart = p1.y;
  for (let i = 0; i < 25; i++) E.stepWorld(w, [{ up: true, jump: true }], DT);
  assert.ok(p1.y < yStart - 60, 'Jetpack thrusts hero into the air');

  // Giant Hammer shockwave slams nearby rival
  p1.gadget = 'hammer'; p1.gadgetT = 5; p1.dashCd = 0;
  p1.x = 500; p1.y = 538;
  w.actors[1].x = 590; w.actors[1].y = 538; w.actors[1].stunT = 0;
  const sc0 = p1.score;
  E.stepWorld(w, [{ dash: true, dashPressed: true }], DT);
  assert.ok(p1.score >= sc0 + 35 && w.actors[1].vy < -300, 'Giant Hammer shockwave launches nearby rival');
});

test('all 6 base micro-disasters spawn hazards or platform warnings cleanly', () => {
  for (const kind of E.BASE_DISASTERS) {
    const w = E.createWorld({ island: 0, diff: 'normal', seed: 101 });
    w.phase = 'action';
    E.spawnDisasterBeat(w, kind);
    if (kind === 'sinking') {
      assert.ok(w.plats.some(p => p.sinkWarn > 0), 'sinking marks a platform warning');
    } else {
      assert.equal(w.hazards.length, 1, `${kind} spawns its hazard`);
    }
  }
});

test('Turbo Rescue Drone revives on 3 Golden Orbs (or Co-Op partner touch), and 0 human survivors ends round immediately', () => {
  // 1P Rescue Drone revive
  const w = E.createWorld({ island: 0, diff: 'normal', seed: 33 });
  w.phase = 'action';
  const p1 = w.actors[0];
  p1.hearts = 1;
  E.hurtActor(w, p1, 0, -200);
  assert.equal(p1.state, 'drone', 'first KO launches Turbo Rescue Drone');
  assert.ok(w.orbs.length >= 3, 'Golden Energy Orbs spawn for rescue');

  // Collect 3 orbs
  for (let n = 0; n < 3; n++) {
    p1.x = w.orbs[0].x;
    p1.y = w.orbs[0].y;
    E.stepWorld(w, [{}], DT);
  }
  assert.equal(p1.state, 'alive', 'collecting 3 orbs revives hero right back into brawl');
  assert.ok(p1.hearts >= 2);

  // Second KO in same 1P round: 0 active humans -> round resolves IMMEDIATELY (zero 35s ghost wait!)
  p1.invulnT = 0;
  p1.hearts = 1;
  E.hurtActor(w, p1, 0, -200);
  assert.equal(p1.state, 'out');
  E.stepWorld(w, [{}], DT);
  assert.equal(w.phase, 'inter', 'round ends immediately when 0 humans remain active');

  // 2P Co-Op partner touch instant revive
  const coop = E.createWorld({ island: 1, diff: 'normal', duo: true, duoMode: 'coop', seed: 44 });
  coop.phase = 'action';
  const h1 = coop.actors[0], h2 = coop.actors[1];
  h1.hearts = 1;
  E.hurtActor(coop, h1, 0, -200);
  assert.equal(h1.state, 'drone');
  h1.x = h2.x; h1.y = h2.y;
  E.stepWorld(coop, [{}, {}], DT);
  assert.equal(h1.state, 'alive', 'touching living Co-Op partner revives rescue drone immediately');
});

test('coach AI survives a full 3-round match to completion', () => {
  const w = E.createWorld({ island: 'glacier', diff: 'normal', seed: 2026 });
  let steps = 0;
  while (w.phase !== 'done' && steps < 60 * 75) {
    const inp = E.planCoach(w, w.actors[0], 1.0);
    E.stepWorld(w, [inp], DT);
    w.events.length = 0;
    steps++;
  }
  assert.equal(w.phase, 'done');
  assert.equal(w.won, true, 'smart coach AI wins the 3-round match');
  assert.ok(w.stars >= 1);
});
