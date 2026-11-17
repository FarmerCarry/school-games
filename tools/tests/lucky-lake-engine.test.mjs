// Unit tests for Lucky Lake pure simulation engine (games/lucky-lake/engine.js).
// Node-only, zero browser required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/lucky-lake/engine.js');
const source = fs.readFileSync(enginePath, 'utf8');
const require = createRequire(import.meta.url);
const E = require(enginePath);
const DT = 1 / 60;

test('engine is pure and dual-exports CommonJS + window.LLEngine', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  assert.ok(sandbox.window.LLEngine && sandbox.window.LLEngine.createWorld);
  assert.equal(typeof E.createWorld, 'function');
  assert.equal(typeof E.stepWorld, 'function');

  const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|localStorage|setTimeout|setInterval|requestAnimationFrame|Math\.random/
  );
});

test('5 open waters, 25 Arabic species (5 per water + 1 boss each), boats, upgrades & difficulties', () => {
  assert.equal(E.WATERS.length, 5);
  assert.equal(E.SPECIES.length, 25);
  assert.equal(E.BOATS.length, 4);
  const arab = /[\u0600-\u06FF]/;

  for (let w = 0; w < 5; w++) {
    const water = E.WATERS[w];
    assert.match(water.name, arab);
    assert.ok(water.starsGoal[0] < water.starsGoal[1] && water.starsGoal[1] < water.starsGoal[2]);
    const list = E.speciesForWater(w);
    assert.equal(list.length, 5);
    assert.equal(list.filter(s => s.boss).length, 1);
    assert.equal(list.filter(s => s.kind === 'chest').length, 1);
    for (const sp of list) assert.match(sp.name, arab);
  }

  const gEasy = E.gearStats(E.freshSave(), 'easy', 0.2);
  const gNorm = E.gearStats(E.freshSave(), 'normal', 0.5);
  const gHero = E.gearStats(E.freshSave(), 'hero', 0.8);
  assert.ok(gEasy.magRadius > gNorm.magRadius && gNorm.magRadius > gHero.magRadius);
  assert.ok(gEasy.tugPull < gNorm.tugPull && gNorm.tugPull < gHero.tugPull);
});

test('seeded determinism and negative-input idle swimming', () => {
  const w1 = E.createWorld({ water: 0, mode: 'solo', diff: 'normal', seed: 98765 });
  const w2 = E.createWorld({ water: 0, mode: 'solo', diff: 'normal', seed: 98765 });
  const startFishX = w1.fish.map(f => f.x);

  for (let i = 0; i < 180; i++) {
    E.stepWorld(w1, DT, []);
    E.stepWorld(w2, DT, []);
  }
  assert.deepEqual(JSON.stringify(w1), JSON.stringify(w2));
  assert.equal(w1.players[0].casts, 0, 'casts must remain 0 without player input');
  assert.equal(w1.players[0].state, 'ready');
  assert.equal(w1.trip, 0);
  assert.ok(w1.time > 2.9);
  assert.notDeepEqual(w1.fish.map(f => f.x), startFishX, 'fish swim on their own');
});

test('rocket-hook cast, magnetic capture, combo pearl pierce, and non-blocking haul', () => {
  const w = E.createWorld({ water: 0, mode: 'solo', diff: 'normal', seed: 42, empty: true });
  const p = w.players[0];

  // Place a combo pearl AND a treasure chest directly along straight-down cast path (x = 640)
  E.spawnPearl(w, 640, 290);
  const chestSpec = E.SPECIES_BY_ID.reef_chest;
  E.spawnSpecies(w, chestSpec, 640, 460);

  E.stepWorld(w, DT, [{ castPress: true }]);
  assert.equal(p.casts, 1);
  assert.equal(p.state, 'cast');

  let sawPearl = false;
  let sawCatch = false;
  for (let i = 0; i < 180; i++) {
    E.stepWorld(w, DT, []);
    for (const ev of w.events) {
      if (ev.type === 'pearl') sawPearl = true;
      if (ev.type === 'catch') sawCatch = true;
    }
    w.events.length = 0;
    if (sawCatch && p.state === 'ready') break;
  }

  assert.equal(sawPearl, true, 'hook pierces combo pearl on the way down');
  assert.equal(sawCatch, true, 'hook grabs treasure chest and hauls it into boat');
  assert.equal(p.state, 'ready', 'immediately ready for next cast without blocking');
  assert.equal(w.trip, 2);
  assert.equal(p.streak, 2);
  assert.ok(w.score > chestSpec.score);
});

test('giant boss tug-of-war: active reeling lands boss; ignoring hero boss lets it escape', () => {
  // 1. Active reeling wins Boss
  const wWin = E.createWorld({ water: 4, mode: 'solo', diff: 'normal', seed: 11, empty: true });
  const bossSpec = E.SPECIES_BY_ID.cyber_boss;
  E.spawnSpecies(wWin, bossSpec, 640, 420);

  E.stepWorld(wWin, DT, [{ castPress: true }]);
  let hooked = false;
  let landed = false;
  for (let i = 0; i < 240; i++) {
    const p = wWin.players[0];
    const tap = p.state === 'tug' && i % 6 === 0;
    E.stepWorld(wWin, DT, [{ castPress: tap, castHold: p.state === 'tug' }]);
    for (const ev of wWin.events) {
      if (ev.type === 'bossHooked') hooked = true;
      if (ev.type === 'bossLanded') landed = true;
    }
    wWin.events.length = 0;
    if (landed) break;
  }
  assert.equal(hooked, true);
  assert.equal(landed, true);
  assert.equal(wWin.bossCaught, true);
  assert.equal(wWin.trip, 1);

  // 2. Ignoring Hero Boss lets it escape back into water
  const wEsc = E.createWorld({ water: 4, mode: 'solo', diff: 'hero', ddaLevel: 0.9, seed: 12, empty: true });
  E.spawnSpecies(wEsc, bossSpec, 640, 420);
  E.stepWorld(wEsc, DT, [{ castPress: true }]);
  let escaped = false;
  for (let i = 0; i < 300; i++) {
    E.stepWorld(wEsc, DT, []);
    for (const ev of wEsc.events) {
      if (ev.type === 'bossEscape') escaped = true;
    }
    wEsc.events.length = 0;
    if (escaped) break;
  }
  assert.equal(escaped, true);
  assert.equal(wEsc.bossCaught, false);
  assert.ok(wEsc.fish.some(f => f.boss), 'escaped boss swims back in the water');
});

test('hazards: easy bounces safely, normal stuns, and Shock-Lure zaps into bonus coins', () => {
  // Easy bounce
  const wEasy = E.createWorld({ water: 0, mode: 'solo', diff: 'easy', seed: 5, empty: true });
  wEasy.players[0].streak = 3;
  E.spawnHazard(wEasy, 640, 320);
  E.stepWorld(wEasy, DT, [{ castPress: true }]);
  let evTypes = [];
  for (let i = 0; i < 60; i++) {
    E.stepWorld(wEasy, DT, []);
    evTypes.push(...wEasy.events.map(e => e.type));
    wEasy.events.length = 0;
  }
  assert.ok(evTypes.includes('bounce'));
  assert.equal(wEasy.players[0].streak, 3, 'easy mode preserves streak on hazard bounce');

  // Normal stun without shock upgrade
  const wNorm = E.createWorld({ water: 1, mode: 'solo', diff: 'normal', seed: 5, empty: true });
  wNorm.players[0].streak = 3;
  E.spawnHazard(wNorm, 640, 320);
  E.stepWorld(wNorm, DT, [{ castPress: true }]);
  evTypes = [];
  for (let i = 0; i < 60; i++) {
    E.stepWorld(wNorm, DT, []);
    evTypes.push(...wNorm.events.map(e => e.type));
    wNorm.events.length = 0;
    if (evTypes.includes('hazardHit')) break;
  }
  assert.ok(evTypes.includes('hazardHit'));
  assert.equal(wNorm.players[0].streak, 0);
  assert.ok(wNorm.players[0].stunTimer > 0);

  // Shock-Lure upgrade zaps hazard for coins
  const save = E.freshSave();
  save.upgrades.shock = 2;
  const wShock = E.createWorld({ water: 1, mode: 'solo', diff: 'hero', save, seed: 5, empty: true });
  E.spawnHazard(wShock, 640, 320);
  E.stepWorld(wShock, DT, [{ castPress: true }]);
  evTypes = [];
  for (let i = 0; i < 60; i++) {
    E.stepWorld(wShock, DT, []);
    evTypes.push(...wShock.events.map(e => e.type));
    wShock.events.length = 0;
  }
  assert.ok(evTypes.includes('shockZap'));
  assert.ok(wShock.coins >= 50);
});

test('2P versus winner & coop boss harpoon boost', () => {
  const wCoop = E.createWorld({ water: 2, mode: 'coop', diff: 'normal', seed: 33, empty: true });
  assert.equal(wCoop.players.length, 2);
  const boss = E.SPECIES_BY_ID.magma_boss;
  E.spawnSpecies(wCoop, boss, 420, 340);

  // P1 hooks Boss
  E.stepWorld(wCoop, DT, [{ castPress: true }, {}]);
  for (let i = 0; i < 40 && wCoop.players[0].state !== 'tug'; i++) {
    E.stepWorld(wCoop, DT, [{}, {}]);
    wCoop.events.length = 0;
  }
  assert.equal(wCoop.players[0].state, 'tug');
  const beforeProg = wCoop.players[0].tug.progress;

  // P2 aims directly at P1's hooked Boss and fires assist harpoon!
  const p2 = wCoop.players[1];
  p2.x = 500;
  p2.aimAngle = Math.atan2(wCoop.players[0].hook.y - E.TURRET_Y, wCoop.players[0].hook.x - p2.x);
  E.stepWorld(wCoop, DT, [{}, { castPress: true }]);

  let boosted = false;
  for (let i = 0; i < 40; i++) {
    E.stepWorld(wCoop, DT, [{ castHold: true }, {}]);
    if (wCoop.events.some(e => e.type === 'coopBoost')) boosted = true;
    wCoop.events.length = 0;
    if (boosted) break;
  }
  assert.equal(boosted, true, 'teammate harpoon boosts Boss tug progress');
  assert.ok(
    wCoop.bossCaught || (wCoop.players[0].tug && wCoop.players[0].tug.progress > beforeProg + 0.15)
  );
});

test('save sanitization, harbor shop purchases, and star calculation', () => {
  for (const bad of [null, undefined, 'bad{json', 99, [], { v: 2, coins: 500 }, { v: 3, coins: -90, boat: 99 }]) {
    const loaded = E.loadSave(bad);
    assert.equal(loaded.v, 3);
    assert.ok(loaded.coins >= 0);
    assert.equal(loaded.boat, 0);
    assert.equal(loaded.waters.length, 5);
  }

  const s = E.freshSave();
  assert.equal(E.buyBoat(s, 1), false);
  s.coins = 2000;
  assert.equal(E.buyBoat(s, 3), true);
  assert.equal(s.boat, 3);
  for (let i = 0; i < 3; i++) assert.equal(E.buyUpgrade(s, 'magnet'), true);
  assert.equal(E.buyUpgrade(s, 'magnet'), false, 'capped at level 3');

  E.recordCatch(s, 'turbo_shark', 92, 40);
  E.recordCatch(s, 'turbo_shark', 110, 40);
  assert.deepEqual(s.book.turbo_shark, { count: 2, maxWeight: 110 });
});
