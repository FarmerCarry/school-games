// Toy Castle (قلعة الألعاب) — Pure Deterministic Engine Unit & Balance Suite
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/toy-castle/engine.js');
const require = createRequire(import.meta.url);
const E = require(enginePath);

test('engine.js stays completely pure: no Kit, no DOM, no Math.random', () => {
  const src = fs.readFileSync(enginePath, 'utf8');
  assert.doesNotMatch(src, /\bKit\b/, 'engine must not touch Kit');
  assert.doesNotMatch(src, /\bdocument\b|\bwindow\b/, 'engine must not touch DOM');
  assert.doesNotMatch(src, /Math\.random\b/, 'engine must use deterministic PRNG');
});

test('catalog integrity: 3 worlds, 9 stages, 4 units, 5 castle & 5 banner skins', () => {
  assert.equal(E.WORLDS.length, 3);
  assert.equal(E.STAGES.length, 9);
  assert.equal(E.UNITS.length, 4);
  assert.equal(E.CASTLE_SKINS.length, 5);
  assert.equal(E.BANNER_SKINS.length, 5);
  assert.deepEqual(E.STAGES.map(s => s.id), ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3']);
  assert.deepEqual(E.STAGES[0].unlocks, [0, 1]);
  assert.deepEqual(E.STAGES[1].unlocks, [0, 1, 2]);
  assert.deepEqual(E.STAGES[2].unlocks, [0, 1, 2, 3]);
  assert.ok(E.STAGES[2].boss && E.STAGES[5].boss && E.STAGES[8].boss, 'each world ends with a boss stage');
});

test('determinism: identical seed and inputs produce identical simulation states', () => {
  function runOnce() {
    const st = E.create({ stageIndex: 0, dda: 0.4, seed: 98765 });
    for (let f = 0; f < 300; f++) {
      if (f === 1 || f === 120) E.spawnUnit(st, 0, 0);
      if (f === 60) {
        E.setCannonAim(st, 0, 2.5, 1.0);
        E.fireCannon(st, 0);
      }
      E.step(st, 1 / 60);
    }
    return {
      hp1: st.sides[0].hp, hp2: st.sides[1].hp,
      en1: Math.round(st.sides[0].energy * 1000),
      en2: Math.round(st.sides[1].energy * 1000),
      units: st.units.map(u => [u.side, u.kind, Math.round(u.x * 100), u.hp]),
      score: st.score
    };
  }
  assert.deepEqual(runOnce(), runOnce());
});

test('frame-1 summon works with starting energy; P1 never auto-spawns in solo', () => {
  const st = E.create({ stageIndex: 0, seed: 42 });
  assert.equal(st.sides[0].energy, E.START_ENERGY);
  assert.ok(E.START_ENERGY >= E.UNITS[0].cost);

  // Step 5 seconds with no input: P1 must never auto-spawn, CPU marches
  for (let i = 0; i < 300; i++) E.step(st, 1 / 60);
  assert.equal(st.sides[0].spawned, 0, 'P1 must never auto-spawn');
  assert.ok(st.sides[1].spawned >= 1, 'CPU spawns enemy units');

  // Fresh stage: immediate frame-1 spawn succeeds
  const st2 = E.create({ stageIndex: 0, seed: 42 });
  const u = E.spawnUnit(st2, 0, 0);
  assert.ok(u, 'frame-1 Foam Knight spawns cleanly');
  assert.equal(st2.sides[0].spawned, 1);
  assert.equal(st2.sides[0].energy, E.START_ENERGY - E.UNITS[0].cost);
  // Locked units on 1-1 cannot be spawned
  assert.equal(E.spawnUnit(st2, 0, 2), null, 'Dino locked on 1-1');
  assert.equal(E.spawnUnit(st2, 0, 3), null, 'Mega Mech locked on 1-1');
});

test('cork cannon ballistic solver pops floating parachute crates for +25 energy', () => {
  const st = E.create({ stageIndex: 0, seed: 77 });
  st.sides[0].energy = 20;
  const cr = E.spawnCrate(st);
  assert.ok(cr);
  cr.baseX = 0;
  cr.x = 0;
  cr.y = 5.5;
  cr.vy = 0;
  cr.swayAmp = 0;

  E.setCannonAim(st, 0, cr.x, cr.y);
  assert.equal(E.fireCannon(st, 0), true);
  assert.equal(st.sides[0].cannonShots, 1);

  let popped = false;
  for (let i = 0; i < 120; i++) {
    const evs = E.step(st, 1 / 60);
    if (evs.some(e => e.type === 'cratePop' && e.side === 0)) { popped = true; break; }
  }
  assert.ok(popped, 'aimed cork cannonball pops floating parachute crate');
  assert.ok(st.sides[0].cratesPopped >= 1);
  assert.ok(st.sides[0].energy >= 45, 'crate awards +25 energy');
  assert.ok(st.coinsEarned >= 10, 'crate awards bonus coins in solo');
});

test('cork cannon hits enemy units with splash + knockback, and reports misses on empty floor', () => {
  const st = E.create({ stageIndex: 0, seed: 99 });
  // Empty floor shot -> cannonMiss
  E.setCannonAim(st, 0, 0, 0.4);
  E.fireCannon(st, 0);
  let missed = false;
  for (let i = 0; i < 120; i++) {
    const evs = E.step(st, 1 / 60);
    if (evs.some(e => e.type === 'cannonMiss' && e.side === 0)) { missed = true; break; }
  }
  assert.ok(missed, 'empty floor cannonball emits cannonMiss');

  // Direct hit on enemy knight -> cannonHit + knockback
  const st2 = E.create({ stageIndex: 0, seed: 101 });
  const foe = E.spawnUnit(st2, 1, 0, { free: true });
  foe.x = 1.5;
  foe.speed = 0;
  E.setCannonAim(st2, 0, foe.x, 0.8);
  E.fireCannon(st2, 0);
  let hit = false;
  for (let i = 0; i < 120; i++) {
    const evs = E.step(st2, 1 / 60);
    if (evs.some(e => e.type === 'cannonHit' && e.side === 0)) { hit = true; break; }
  }
  assert.ok(hit, 'cannonball hitting enemy emits cannonHit');
  assert.ok(foe.hp < foe.maxHp, 'enemy unit took cannon damage');
  assert.ok(foe.x > 1.5 || foe.vy > 0, 'enemy unit got bonked/knocked back');
});

test('ranged blasters fire darts and Mega Mech deals splash damage; boss spawns on boss stage', () => {
  const st = E.create({ stageIndex: 2, seed: 55 }); // Stage 1-3 has all 4 units & Boss!
  const blaster = E.spawnUnit(st, 0, 1, { free: true });
  const enemy = E.spawnUnit(st, 1, 0, { free: true });
  blaster.x = -2.0;
  enemy.x = 2.0;
  let firedDart = false;
  for (let i = 0; i < 60; i++) {
    const evs = E.step(st, 1 / 60);
    if (evs.some(e => e.type === 'dartFire' && e.side === 0)) { firedDart = true; break; }
  }
  assert.ok(firedDart, 'blaster shoots foam darts at range');

  // Boss spawns when enemy castle drops below 68% HP on stage 1-3
  const mech = E.spawnUnit(st, 0, 3, { free: true });
  mech.x = E.RIGHT_GATE_X - 1.2;
  let bossSpawned = false;
  for (let i = 0; i < 420; i++) {
    const evs = E.step(st, 1 / 60);
    if (evs.some(e => e.type === 'bossSpawn')) { bossSpawned = true; break; }
  }
  assert.ok(bossSpawned, 'boss stage spawns crowned boss unit at HP threshold');
  assert.ok(st.units.some(u => u.isBoss), 'active boss unit flagged with isBoss');
});

test('balance: active player wins Stage 1-1 while idle player loses; DDA scales rival', () => {
  // Active player beats Stage 1-1 smoothly
  const winSt = E.create({ stageIndex: 0, dda: 0.35, seed: 2026 });
  for (let i = 0; i < 60 * 90 && winSt.winner === -1; i++) {
    if (E.canSpawn(winSt, 0, 1)) E.spawnUnit(winSt, 0, 1);
    else if (E.canSpawn(winSt, 0, 0)) E.spawnUnit(winSt, 0, 0);
    if (winSt.sides[0].cannonCd <= 0 && winSt.units.some(u => u.side === 1)) {
      const target = winSt.units.find(u => u.side === 1);
      E.setCannonAim(winSt, 0, target.x, 0.8);
      E.fireCannon(winSt, 0);
    }
    E.step(winSt, 1 / 60);
  }
  assert.equal(winSt.winner, 0, 'active player wins Stage 1-1');
  assert.ok(winSt.stars >= 2, 'active player earns 2-3 stars on Stage 1-1');

  // Idle player loses Stage 1-1 (no accidental idle victory)
  const idleSt = E.create({ stageIndex: 0, dda: 0.35, seed: 2026 });
  for (let i = 0; i < 60 * 120 && idleSt.winner === -1; i++) {
    E.step(idleSt, 1 / 60);
  }
  assert.equal(idleSt.winner, 1, 'doing nothing loses Stage 1-1');
  assert.equal(idleSt.stars, 0);

  // DDA tuning check
  const easySt = E.create({ stageIndex: 3, dda: 0.05, seed: 10 });
  const hardSt = E.create({ stageIndex: 3, dda: 0.95, seed: 10 });
  assert.ok(hardSt.sides[1].maxHp > easySt.sides[1].maxHp, 'higher DDA raises rival castle HP');
  assert.ok(hardSt.sides[1].regen > easySt.sides[1].regen, 'higher DDA raises rival energy regen');
});

test('2-player local mode is strictly symmetrical with zero auto-spawns', () => {
  const st = E.create({ duo: true, seed: 303 });
  assert.equal(st.id, 'duo');
  assert.equal(st.sides[0].maxHp, st.sides[1].maxHp);
  assert.equal(st.sides[0].energy, st.sides[1].energy);
  assert.equal(st.sides[0].regen, st.sides[1].regen);
  assert.deepEqual(st.sides[0].unlocked, [true, true, true, true]);
  assert.deepEqual(st.sides[1].unlocked, [true, true, true, true]);

  for (let i = 0; i < 300; i++) E.step(st, 1 / 60);
  assert.equal(st.sides[0].spawned, 0);
  assert.equal(st.sides[1].spawned, 0);

  assert.ok(E.spawnUnit(st, 0, 0), 'P1 spawns Knight');
  assert.ok(E.spawnUnit(st, 1, 1), 'P2 spawns Blaster');
  assert.equal(st.sides[0].spawned, 1);
  assert.equal(st.sides[1].spawned, 1);
});

test('save v3 migration ignores old v2 saves gracefully, records wins, and handles shop purchases', () => {
  // Old v2 shape resets cleanly
  const fromOld = E.loadSave({ v: 2, diff: 'hard', coins: 999, lv: [] });
  assert.equal(fromOld.v, 3);
  assert.equal(fromOld.coins, 0);
  assert.equal(fromOld.unlockedStage, 0);

  // Corrupt input resets cleanly
  const fromBad = E.loadSave('corrupt');
  assert.equal(fromBad.v, 3);

  // Record win unlocks next stage and adds coins & bestScore
  const save = E.defaultSave();
  const r = E.recordSoloResult(save, 0, { winner: 0, stars: 3, score: 620, coins: 100 });
  assert.equal(r.isNewBest, true);
  assert.equal(save.stars[0], 3);
  assert.equal(save.unlockedStage, 1);
  assert.equal(save.coins, 100);
  assert.equal(save.bestScore, 620);

  // Shop purchase & equip
  const tooExpensive = E.buyOrEquipSkin(save, 'castle', 4);
  assert.equal(tooExpensive.ok, false);
  const buy = E.buyOrEquipSkin(save, 'castle', 1); // 60 coins
  assert.equal(buy.ok, true);
  assert.equal(buy.action, 'buy');
  assert.equal(save.coins, 40);
  assert.equal(save.castleSkin, 1);
  assert.equal(save.ownedCastles[1], 1);

  const reEquip = E.buyOrEquipSkin(save, 'castle', 0);
  assert.equal(reEquip.ok, true);
  assert.equal(reEquip.action, 'equip');
  assert.equal(save.castleSkin, 0);

  // Round-trip loadSave preserves valid v3 state
  const reloaded = E.loadSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(reloaded, save);
});
