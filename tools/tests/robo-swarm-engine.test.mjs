import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const RSData = require('../../games/robo-swarm/data.js');
const RSEngine = require('../../games/robo-swarm/engine.js');

test('dual Node module.exports and browser window globals work cleanly with Arabic-only labels', () => {
  assert.ok(RSData && RSEngine);
  assert.equal(RSData.arenas.length, 3);
  assert.equal(RSData.difficulties.length, 3);
  assert.equal(RSData.pods.length, 5);
  assert.equal(RSData.skins.length, 5);

  const browserCtx = { window: {} };
  vm.createContext(browserCtx);
  for (const f of ['data.js', 'engine.js']) {
    const src = readFileSync(path.join(repo, 'games/robo-swarm', f), 'utf8');
    assert.ok(!/\bKit\b/.test(src), `${f} must not reference Kit`);
    assert.ok(!/\bdocument\b|\blocalStorage\b/.test(src), `${f} must not touch DOM/storage`);
    vm.runInContext(src, browserCtx, { filename: f });
  }
  assert.ok(browserCtx.window.RSData);
  assert.ok(browserCtx.window.RSEngine);

  for (const pod of RSData.pods) {
    assert.ok(!/[A-Za-z]/.test(pod.name), `pod name must be Arabic: ${pod.name}`);
    assert.ok(!/[A-Za-z]/.test(pod.popup), `pod popup must be Arabic: ${pod.popup}`);
  }
});

test('keyboard movement and 1P mouse steering work smoothly with keyboard priority', () => {
  const run = RSEngine.createRun({ arena: 'spark', difficulty: 'normal', players: 1, seed: 10 });
  const startX = run.mechs[0].x;
  const startY = run.mechs[0].y;

  // Holding ArrowRight / D moves P1 right well past +8 px
  for (let i = 0; i < 15; i++) {
    RSEngine.step(run, 1 / 60, [{ x: 1, y: 0, dash: 0 }]);
  }
  assert.ok(run.mechs[0].x > startX + 60, `expected px to advance right, got ${run.mechs[0].x - startX}`);
  assert.equal(run.mechs[0].y, startY);

  // Mouse steering glides toward pointer when no keys are held
  const beforeMouseY = run.mechs[0].y;
  for (let i = 0; i < 20; i++) {
    RSEngine.step(run, 1 / 60, [{ x: 0, y: 0, mouse: true, tx: run.mechs[0].x, ty: beforeMouseY - 220 }]);
  }
  assert.ok(run.mechs[0].y < beforeMouseY - 50, 'mech steers smoothly toward active mouse target');

  // Keyboard overrides mouse immediately when pressed
  const xBeforeOverride = run.mechs[0].x;
  for (let i = 0; i < 12; i++) {
    RSEngine.step(run, 1 / 60, [{ x: -1, y: 0, mouse: true, tx: xBeforeOverride + 400, ty: run.mechs[0].y }]);
  }
  assert.ok(run.mechs[0].x < xBeforeOverride - 40, 'keyboard input immediately overrides mouse target');
});

test('Turbo EMP Dash boosts speed, grants invulnerability, triggers cooldown, and bonks nearby bots', () => {
  const run = RSEngine.createRun({ arena: 'spark', difficulty: 'normal', players: 1, seed: 22 });
  const p = run.mechs[0];
  const bot = RSEngine.spawnEnemy(run, 0, p.x + 65, p.y);
  const initialBotHp = bot.hp;
  const x0 = p.x;

  RSEngine.step(run, 1 / 60, [{ x: 1, y: 0, dash: 1 }]);
  assert.ok(p.dashCd > 1.0, 'dash enters cooldown');
  assert.ok(p.invuln > 0.2, 'dash grants brief invulnerability');

  // Even colliding with a heavy bot during dash does not hurt the player
  const crusher = RSEngine.spawnEnemy(run, 4, p.x + 40, p.y);
  for (let i = 0; i < 12; i++) {
    RSEngine.step(run, 1 / 60, [{ x: 1, y: 0, dash: 0 }]);
  }
  assert.equal(p.hp, p.maxHp, 'player takes zero damage while dashing');
  assert.ok(p.x > x0 + 140, 'dash propels player rapidly');
  assert.ok(bot.hp < initialBotHp, 'EMP shockwave/bonk damages nearby bot');
  assert.ok(crusher.shield < crusher.maxShield || crusher.hp < crusher.maxHp, 'dash bonks shielded crusher');
});

test('auto-fire locks onto threats and all 5 Holo Weapon Pods upgrade instantly without pausing', () => {
  const run = RSEngine.createRun({ arena: 'spark', difficulty: 'normal', players: 1, seed: 33 });
  const p = run.mechs[0];
  RSEngine.spawnEnemy(run, 4, p.x + 240, p.y);

  for (let i = 0; i < 20; i++) {
    RSEngine.step(run, 1 / 60, [{ x: 0, y: 0 }]);
  }
  assert.ok(run.shots.length > 0, 'auto-blaster fires plasma bolts at nearby enemy');

  // Test instant walk-over pickup of every Holo Weapon Pod kind (0..4)
  p.hp = p.maxHp - 1;
  for (let kind = 0; kind < 5; kind++) {
    const beforeLv = p.lv[kind];
    const pod = RSEngine.spawnPod(run, kind, p.x + 18, p.y);
    assert.ok(pod);
    run.events.length = 0;
    RSEngine.step(run, 1 / 60, [{ x: 1, y: 0 }]);
    assert.equal(run.state, 'play', 'game never freezes on pod pickup');
    assert.equal(p.lv[kind], beforeLv + 1, `pod kind ${kind} upgraded instantly`);
    const podEv = run.events.find((e) => e.type === 'pod' && e.podKind === kind);
    assert.ok(podEv && podEv.text.endsWith('!'), `Arabic floating popup emitted for pod ${kind}`);
  }
  assert.equal(p.hp, p.maxHp, 'magnet pod also heals +1 heart');

  // Verify upgraded saws, homing missiles, and chain lightning all activate in combat
  RSEngine.spawnEnemy(run, 2, p.x + 190, p.y + 30);
  RSEngine.spawnEnemy(run, 3, p.x - 180, p.y - 20);
  for (let i = 0; i < 90; i++) {
    RSEngine.step(run, 1 / 60, [{ x: 0, y: 0 }]);
  }
  const hasMissileOrZap = run.shots.some((s) => s.kind === 1) || run.kills > 0;
  assert.ok(hasMissileOrZap, 'secondary pod weapons fire and damage enemies');
});

test('wave schedule advances through Waves 1-3 and spawns Mega-Mech Boss at 70s with weak-point crits and victory', () => {
  const run = RSEngine.createRun({ arena: 'magma', difficulty: 'hero', players: 1, seed: 77 });
  assert.equal(run.wave, 1);

  run.t = 23.98;
  RSEngine.step(run, 0.04, [{ x: 0, y: 0 }]);
  assert.equal(run.wave, 2);

  run.t = 47.98;
  RSEngine.step(run, 0.04, [{ x: 0, y: 0 }]);
  assert.equal(run.wave, 3);

  run.t = 69.98;
  RSEngine.step(run, 0.04, [{ x: 0, y: 0 }]);
  assert.equal(run.wave, 4);
  assert.equal(run.bossSpawned, true, 'Mega-Mech Boss spawns at 70s');

  const boss = run.enemies.find((e) => e.kind === 5);
  assert.ok(boss, 'boss entity present');

  // Advance Boss AI until weak point opens after telegraphed attack
  let sawWeak = false;
  for (let i = 0; i < 300; i++) {
    run.mechs[0].invuln = 1;
    RSEngine.step(run, 1 / 60, [{ x: 0, y: 0 }]);
    if (boss.weakOpen) { sawWeak = true; break; }
  }
  assert.equal(sawWeak, true, 'Mega-Mech Boss exposes weak point after telegraphed attack');

  const hpBeforeCrit = boss.hp;
  RSEngine.damageEnemy(run, boss, 50, 0, 0);
  assert.equal(hpBeforeCrit - boss.hp, 100, 'weak point deals 2x critical damage');

  // Hero difficulty triggers Twin-Phase Overdrive at <= 50% HP
  boss.weakOpen = false;
  RSEngine.damageEnemy(run, boss, Math.ceil(boss.hp - boss.maxHp * 0.45), 0, 0);
  assert.equal(boss.phase2, true, 'hero difficulty triggers Boss Phase 2 overdrive');

  // Defeating Mega-Boss wins the arena immediately with 1-3 stars
  RSEngine.damageEnemy(run, boss, boss.hp + 50, 0, 0);
  assert.equal(run.bossDefeated, true);
  assert.equal(run.state, 'win');
  assert.ok(run.stars >= 1 && run.stars <= 3, `expected 1-3 stars, got ${run.stars}`);
});

test('2P co-op hologram ring revives fallen partner in 1.5s and loses only when both mechs fall', () => {
  const run = RSEngine.createRun({ arena: 'orbit', difficulty: 'normal', players: 2, seed: 55 });
  const [p1, p2] = run.mechs;

  // Knock down P2 while P1 stays alive
  while (p2.alive) {
    p2.invuln = 0;
    RSEngine.hurtMech(run, p2);
  }
  assert.equal(p2.alive, false);
  assert.equal(p2.down, true);
  assert.equal(run.state, 'play', 'round continues while P1 is still standing');

  // Move P1 onto P2 hologram ring for ~1.6s
  p1.x = p2.x + 20;
  p1.y = p2.y;
  run.enemies.length = 0;
  for (let i = 0; i < 100; i++) {
    RSEngine.step(run, 1 / 60, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    run.enemies.length = 0;
    if (p2.alive) break;
  }
  assert.equal(p2.alive, true, 'P2 revived after 1.5s in hologram ring');
  assert.equal(run.revives, 1);
  assert.ok(p2.hp >= 2);

  // If both mechs fall simultaneously, state transitions to over
  while (p1.alive) { p1.invuln = 0; RSEngine.hurtMech(run, p1); }
  while (p2.alive) { p2.invuln = 0; RSEngine.hurtMech(run, p2); }
  assert.equal(run.state, 'over');
});

test('difficulty scaling, arena hazards, and 90-second simulation speed meet slow-PC budgets', () => {
  const easy = RSEngine.createRun({ difficulty: 'easy', arena: 'spark' });
  const normal = RSEngine.createRun({ difficulty: 'normal', arena: 'magma' });
  const hero = RSEngine.createRun({ difficulty: 'hero', arena: 'orbit' });

  assert.equal(easy.mechs[0].maxHp, 6);
  assert.equal(normal.mechs[0].maxHp, 4);
  assert.equal(hero.mechs[0].maxHp, 3);

  const eEasy = RSEngine.spawnEnemy(easy, 2, 400, 400);
  const eHero = RSEngine.spawnEnemy(hero, 2, 400, 400);
  assert.ok(eHero.maxHp > eEasy.maxHp, 'hero enemies have more HP than easy');
  assert.ok(eHero.speed > eEasy.speed, 'hero enemies move faster than easy');

  // Orbit warp pad teleports mech to linked pad
  const warp0 = hero.arena.warps[0];
  const warp1 = hero.arena.warps[1];
  hero.mechs[0].x = warp0.x;
  hero.mechs[0].y = warp0.y;
  RSEngine.step(hero, 1 / 60, [{ x: 0, y: 0 }]);
  assert.ok(Math.hypot(hero.mechs[0].x - warp1.x, hero.mechs[0].y - warp1.y) < 30, 'warp pad teleports mech');

  // Full 90s crowded simulation benchmark
  const perfRun = RSEngine.createRun({ difficulty: 'hero', arena: 'spark', players: 2, seed: 99 });
  const t0 = performance.now();
  for (let i = 0; i < 90 * 60; i++) {
    perfRun.mechs[0].invuln = 1;
    perfRun.mechs[1].invuln = 1;
    const ang = i * 0.04;
    RSEngine.step(perfRun, 1 / 60, [
      { x: Math.cos(ang), y: Math.sin(ang), dash: i % 120 === 0 ? 1 : 0 },
      { x: -Math.sin(ang), y: Math.cos(ang), dash: i % 150 === 0 ? 1 : 0 }
    ]);
    if (perfRun.state !== 'play') break;
  }
  const elapsedMs = performance.now() - t0;
  assert.ok(elapsedMs < 800, `90s simulation took ${elapsedMs.toFixed(1)}ms (expected < 800ms)`);
});
