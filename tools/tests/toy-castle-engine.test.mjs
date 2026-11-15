// Toy Castle Clash engine (games/toy-castle/engine.js) unit & balance suite:
// UMD + purity, energy & Wind-Up Key upgrades, sky star-bubbles, all 5 unit types,
// ground vs air targeting, bouncy drum pad, castle confetti cannon, 2P versus,
// DDA scaling, shop & saves, and simulated strategy winning all 12 campaign levels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/toy-castle/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

const require = createRequire(import.meta.url);
const TC = require(enginePath);
const DT = 1 / 60;
const ARABIC = /^[\u0600-\u06FF\s\u0640-\u0652]+$/;
const plain = v => JSON.parse(JSON.stringify(v));

function runSteps(w, seconds) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames && !w.done; i++) TC.step(w, DT);
}

// Smart child strategy bot for campaign verification across all 12 levels & DDA tiers.
function playCampaignBot(levelIdx, ddaLevel, maxSeconds = 130) {
  const w = TC.create(levelIdx, TC.params(ddaLevel), { seed: 700 + levelIdx * 19 });
  const frames = Math.round(maxSeconds / DT);
  for (let f = 0; f < frames && !w.done; f++) {
    w.ev.length = 0;
    TC.step(w, DT);

    // Pop any sky star-bubble as soon as it floats in!
    if (w.bubbles.length) {
      const b = w.bubbles[0];
      TC.popBubble(w, b.x, b.y, 0);
    }

    const s0 = w.sides[0];
    let enemyAir = 0, enemyNearDoor = 0, myTanks = 0, myFrogs = 0;
    for (const u of w.units) {
      if (u.side === 1) {
        if (u.flying) enemyAir++;
        if (u.x < TC.GATE_L + 360) enemyNearDoor++;
      } else {
        if (u.type === 'bear' || u.type === 'train') myTanks++;
        if (u.type === 'frog') myFrogs++;
      }
    }

    // Fire Castle Confetti Cannon when enemies approach doorstep or cluster up
    if (s0.cannonCd <= 0 && (enemyNearDoor >= 2 || (enemyAir >= 1 && enemyNearDoor >= 1))) {
      TC.fireCannon(w, 0);
    }

    // Upgrade Wind-Up Key early when safe for snowballing energy!
    if (s0.keyLv === 0 && w.t > 2.5 && enemyNearDoor === 0 && s0.energy >= TC.KEY_LEVELS[1].cost) {
      TC.upgradeKey(w, 0);
      continue;
    }
    if (s0.keyLv === 1 && levelIdx >= 5 && enemyNearDoor === 0 && myTanks >= 1 && s0.energy >= TC.KEY_LEVELS[2].cost) {
      TC.upgradeKey(w, 0);
      continue;
    }

    // Counter flying paper gliders with Paint Frogs
    if (enemyAir > myFrogs && s0.energy >= TC.UNITS.frog.cost && s0.cds.frog <= 0) {
      TC.summon(w, 0, 'frog');
      continue;
    }

    // Emergency defense at doorstep
    if (enemyNearDoor > 0 && myTanks === 0) {
      if (s0.energy >= TC.UNITS.bear.cost && s0.cds.bear <= 0) TC.summon(w, 0, 'bear');
      else if (s0.energy >= TC.UNITS.duck.cost && s0.cds.duck <= 0) TC.summon(w, 0, 'duck');
      continue;
    }

    // Build balanced push: Bear shield -> Frogs & Gliders -> Block Train!
    if (myTanks === 0) {
      if (levelIdx >= 6 && s0.keyLv >= 1 && s0.cds.train <= 0) {
        if (s0.energy >= TC.UNITS.train.cost) TC.summon(w, 0, 'train');
      } else if (s0.energy >= TC.UNITS.bear.cost && s0.cds.bear <= 0) {
        TC.summon(w, 0, 'bear');
      } else if (levelIdx === 0 && s0.energy >= TC.UNITS.duck.cost && s0.cds.duck <= 0) {
        TC.summon(w, 0, 'duck');
      }
    } else if (myFrogs < 2 && s0.energy >= TC.UNITS.frog.cost && s0.cds.frog <= 0) {
      TC.summon(w, 0, 'frog');
    } else if (s0.energy >= TC.UNITS.train.cost && s0.cds.train <= 0) {
      TC.summon(w, 0, 'train');
    } else if (levelIdx >= 3 && s0.energy >= TC.UNITS.plane.cost + 15 && s0.cds.plane <= 0) {
      TC.summon(w, 0, 'plane');
    } else if (s0.energy >= 65 && s0.cds.duck <= 0) {
      TC.summon(w, 0, 'duck');
    }
  }
  return w;
}

test('engine is pure UMD: exports window.TC and module.exports with zero forbidden globals', () => {
  assert.ok(TC && TC.create && TC.step && TC.summon, 'CommonJS module.exports works');
  const sandbox = { window: {} };
  vm.runInNewContext(engineSource, sandbox);
  assert.ok(sandbox.window.TC && sandbox.window.TC.LEVELS.length === 12, 'window.TC works in browser context');

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|\bfetch\b|XMLHttpRequest|WebSocket|\bconsole\b/
  );
});

test('4 playroom worlds x 3 levels = 12 levels, 5 toy units, 6 themes and 5 rooftop toppers', () => {
  assert.equal(TC.WORLDS.length, 4);
  assert.equal(TC.LEVELS.length, 12);
  assert.deepEqual(TC.UNIT_ORDER, ['duck', 'frog', 'bear', 'plane', 'train']);
  assert.equal(TC.THEMES.length, 6);
  assert.equal(TC.TOPPERS.length, 5);
  assert.deepEqual(TC.TOPPERS.map(t => t.id), ['crown', 'dragon', 'rocket', 'windmill', 'duck']);

  for (const wd of TC.WORLDS) assert.match(wd.name, ARABIC, wd.name);
  for (const uk of [...TC.UNIT_ORDER, 'boss']) assert.match(TC.UNITS[uk].name, ARABIC, uk);
  TC.LEVELS.forEach((L, i) => {
    assert.equal(L.id, `${Math.floor(i / 3) + 1}-${(i % 3) + 1}`);
    assert.equal(L.world, Math.floor(i / 3));
    assert.match(L.name, ARABIC, L.id);
    assert.ok(L.hpR >= 350 && L.par >= 40);
  });
  // World mechanics progression
  assert.ok(TC.LEVELS.slice(3, 6).every(L => L.drum === true), 'World 2 introduces bouncy drum pad');
  assert.ok(TC.LEVELS.slice(6, 9).every(L => L.armoredBears === true), 'World 3 has armored rival bears');
  assert.equal(TC.LEVELS[11].bossWave, true, 'Level 4-3 has Toy King boss wave');
});

test('starting energy >= 25 spawns duck immediately; P1 never auto-summons; key upgrades & sky bubbles boost energy', () => {
  const w = TC.create(0, TC.params(0.3));
  assert.ok(w.sides[0].energy >= 25, 'starting energy >= 25');
  assert.equal(w.spawned[0], 0);

  // Idle for 15 seconds: P1 never auto-summons!
  runSteps(w, 15);
  assert.equal(w.spawned[0], 0, 'P1 never auto-summons units');
  assert.ok(w.sides[0].energy > TC.START_ENERGY, 'energy charges automatically');

  // Fresh match: frame 1 summon duck works immediately
  const w2 = TC.create(0, TC.params(0.3));
  const duck = TC.summon(w2, 0, 'duck');
  assert.ok(duck && duck.type === 'duck');
  assert.equal(w2.spawned[0], 1);
  assert.equal(w2.sides[0].energy, TC.START_ENERGY - TC.UNITS.duck.cost);

  // Unaffordable summon emits deny and does not spawn
  const denied = TC.summon(w2, 0, 'train');
  assert.equal(denied, false);
  assert.ok(w2.ev.some(e => e.t === 'deny' && e.unit === 'train'));
  assert.equal(w2.spawned[0], 1);

  // Key upgrade increases regen rate up to Lv 3 (index 2)
  const wUp = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const e0 = wUp.sides[0].energy = 20;
  TC.step(wUp, 1);
  const gainLv1 = wUp.sides[0].energy - e0;

  wUp.sides[0].energy = 100;
  assert.equal(TC.upgradeKey(wUp, 0), true);
  assert.equal(wUp.sides[0].keyLv, 1);
  const e1 = wUp.sides[0].energy = 20;
  TC.step(wUp, 1);
  const gainLv2 = wUp.sides[0].energy - e1;

  wUp.sides[0].energy = 100;
  assert.equal(TC.upgradeKey(wUp, 0), true);
  assert.equal(wUp.sides[0].keyLv, 2);
  assert.equal(TC.upgradeKey(wUp, 0), false, 'cannot upgrade past Lv 3');
  const e2 = wUp.sides[0].energy = 20;
  TC.step(wUp, 1);
  const gainLv3 = wUp.sides[0].energy - e2;

  assert.ok(gainLv3 > gainLv2 && gainLv2 > gainLv1, `regen scales: ${gainLv1} < ${gainLv2} < ${gainLv3}`);

  // Clicking a floating sky star-bubble grants bonus energy
  const b = TC.spawnBubble(wUp, 500, 190);
  const beforePop = wUp.sides[0].energy;
  assert.equal(TC.popBubble(wUp, b.x + 10, b.y - 8, 0), true);
  assert.ok(wUp.sides[0].energy > beforePop);
  assert.equal(wUp.bubblesPopped, 1);
});

test('all 5 unit types: ground vs air targeting, bear tanking, train charge knockback, and drum bounce', () => {
  // 1. Ground melee units (duck, bear, train) CANNOT target flying paper gliders
  const wAir = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 180 });
  wAir.sides[0].energyMax = 200;
  wAir.sides[0].energy = 200;
  const enemyPlane = TC.summon(wAir, 1, 'plane', { free: true });
  enemyPlane.x = 560;
  enemyPlane.speed = 0; // hold plane steady in air to verify ground units march right under it!
  const duck = TC.summon(wAir, 0, 'duck');
  duck.x = 480;
  runSteps(wAir, 1.5);
  assert.equal(enemyPlane.hp, enemyPlane.hpMax, 'duck cannot hit flying paper plane');
  assert.ok(duck.x > 600, 'duck marched right underneath the flying plane');

  // 2. Paint Frog (hitsAir: true) targets and defeats flying paper glider!
  const wFrog = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const plane2 = TC.summon(wFrog, 1, 'plane', { free: true });
  plane2.x = 560;
  plane2.speed = 0;
  const frog = TC.summon(wFrog, 0, 'frog');
  frog.x = 400;
  runSteps(wFrog, 5.5);
  assert.ok(!wFrog.units.includes(plane2), 'Paint Frog shot down the flying paper glider!');

  // 3. Paper Glider bombs ground toys from the sky safely!
  const wGlider = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const rivalBear = TC.summon(wGlider, 1, 'bear', { free: true });
  rivalBear.x = 600;
  rivalBear.speed = 0;
  const myPlane = TC.summon(wGlider, 0, 'plane');
  myPlane.x = 470;
  runSteps(wGlider, 4.0);
  assert.ok(rivalBear.hp < rivalBear.hpMax, 'Paper Glider bombed ground bear from overhead');
  assert.equal(myPlane.hp, myPlane.hpMax, 'Ground bear could not hit the flying glider back');

  // 4. Pillow Bear tanks two rival ducks and wins!
  const wBear = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const myBear = TC.summon(wBear, 0, 'bear');
  myBear.x = 500;
  const d1 = TC.summon(wBear, 1, 'duck', { free: true });
  const d2 = TC.summon(wBear, 1, 'duck', { free: true });
  d1.x = 560; d2.x = 575;
  runSteps(wBear, 8.0);
  assert.ok(myBear.hp > 0, 'Pillow Bear survived two ducks');
  assert.equal(wBear.units.filter(u => u.side === 1).length, 0, 'Both rival ducks defeated');

  // 5. Block Train charges and delivers multi-bonk splash + knockback!
  const wTrain = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const train = TC.summon(wTrain, 0, 'train');
  train.x = 300;
  const cluster = [0, 1, 2].map(k => {
    const e = TC.summon(wTrain, 1, 'duck', { free: true });
    e.x = 540 + k * 18;
    e.speed = 0;
    return e;
  });
  let sawCharge = false;
  for (let i = 0; i < 180; i++) {
    wTrain.ev.length = 0;
    TC.step(wTrain, DT);
    if (wTrain.ev.some(e => e.t === 'chargeHit')) { sawCharge = true; break; }
  }
  assert.equal(sawCharge, true, 'Block Train triggered charge slam');
  assert.ok(cluster.every(e => e.hp < e.hpMax && e.x > 555), 'Multi-bonk damaged and knocked back the whole cluster');

  // 6. Bouncy drum pad in World 2 hops ground toys upward with speed boost
  const wDrum = TC.create(3, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  assert.equal(wDrum.drum.on, true);
  const hopper = TC.summon(wDrum, 0, 'duck');
  hopper.x = TC.DRUM_X - 40;
  let bounced = false;
  for (let i = 0; i < 60; i++) {
    wDrum.ev.length = 0;
    TC.step(wDrum, DT);
    if (wDrum.ev.some(e => e.t === 'drum')) { bounced = true; break; }
  }
  assert.equal(bounced, true, 'Drum pad bounced marching duck');
  assert.ok(hopper.vy < 0 && hopper.boostT > 0);
});

test('castle confetti cannon clears doorstep ground and air swarms and respects cooldown', () => {
  const w = TC.create(0, TC.params(0.5), { passiveAi: true });
  const g1 = TC.summon(w, 1, 'duck', { free: true });
  const g2 = TC.summon(w, 1, 'frog', { free: true });
  const air = TC.summon(w, 1, 'plane', { free: true });
  g1.x = TC.GATE_L + 110;
  g2.x = TC.GATE_L + 230;
  air.x = TC.GATE_L + 300;
  g1.speed = g2.speed = air.speed = 0;

  assert.equal(TC.fireCannon(w, 0), true);
  assert.equal(TC.fireCannon(w, 0), false, 'immediately on cooldown');
  runSteps(w, 0.8);
  assert.ok(g1.hp <= 0 || g1.hp < g1.hpMax, 'ground duck hit by confetti volley');
  assert.ok(air.hp <= 0 || air.hp < air.hpMax, 'flying plane also hit by confetti volley');
});

test('2P versus is completely symmetrical and allows full controls for both castles', () => {
  const w = TC.createVersus();
  assert.equal(w.humans, 2);
  assert.equal(w.sides[0].hpMax, w.sides[1].hpMax);
  assert.equal(w.sides[0].energy, w.sides[1].energy);
  runSteps(w, 5);
  assert.deepEqual(w.spawned, [0, 0], 'neither side auto-spawns in 2P versus');
  assert.equal(w.sides[0].energy, w.sides[1].energy, 'identical energy regeneration');

  assert.ok(TC.summon(w, 0, 'bear'));
  assert.ok(TC.summon(w, 1, 'bear'));
  assert.deepEqual(w.spawned, [1, 1]);
  assert.equal(TC.fireCannon(w, 0), true);
  assert.equal(TC.fireCannon(w, 1), true);
});

test('DDA scaling is monotonic and simulated strategy wins all 12 campaign levels across difficulties', () => {
  const easy = TC.params(0), mid = TC.params(0.5), hard = TC.params(1);
  assert.ok(easy.aiHp < mid.aiHp && mid.aiHp < hard.aiHp);
  assert.ok(easy.aiEnergy < mid.aiEnergy && mid.aiEnergy < hard.aiEnergy);
  assert.ok(easy.aiThink > mid.aiThink && mid.aiThink > hard.aiThink);
  assert.ok(easy.p1Energy >= mid.p1Energy && mid.p1Energy >= hard.p1Energy);

  for (let i = 0; i < TC.LEVELS.length; i++) {
    for (const k of [0, 0.5, 1]) {
      const w = playCampaignBot(i, k);
      assert.equal(w.done, true, `Level ${TC.LEVELS[i].id} finished at DDA ${k} (t=${w.t.toFixed(1)}, hpR=${w.sides[1].hp})`);
      assert.equal(w.winner, 1, `Level ${TC.LEVELS[i].id} won by player at DDA ${k} (hpL=${w.sides[0].hp}, hpR=${w.sides[1].hp})`);
      if (i === 11) assert.equal(w.bossSpawned, true, 'Level 4-3 spawned and defeated Toy King boss');
    }
    const wMid = playCampaignBot(i, 0.35);
    assert.ok(TC.stars(wMid) >= 2, `Level ${TC.LEVELS[i].id} achieves high star rating (${TC.stars(wMid)})`);
  }
});

test('saves, progression and shop validate corrupted data and unlock themes & rooftop toppers', () => {
  const fresh = plain(TC.freshSave());
  assert.equal(fresh.lv.length, 12);
  for (const bad of [null, undefined, 'bad', 42, [], {}, { v: 2 }, { v: 1, lv: 'nope', coins: -9, theme: 99, topper: 99 }]) {
    assert.deepEqual(plain(TC.loadSave(bad)), fresh);
  }

  const s = TC.freshSave();
  assert.equal(TC.isOpen(s, 0), true);
  assert.equal(TC.isOpen(s, 1), false);
  const r0 = TC.applyResult(s, 0, 3, 32.4, 4);
  assert.equal(r0.first, true);
  assert.equal(r0.opened, 1);
  assert.equal(s.lv[0].s, 3);
  assert.ok(s.coins >= 40);
  assert.equal(TC.isOpen(s, 1), true);
  assert.equal(TC.nextLevel(s), 1);

  // Completing World 1 opens World 2
  TC.applyResult(s, 1, 3, 38.0, 2);
  const r2 = TC.applyResult(s, 2, 3, 41.0, 2);
  assert.equal(r2.world, 1);

  // Shop purchases & equipping
  s.coins = 500;
  for (let k = 1; k < TC.THEMES.length; k++) assert.equal(TC.buy(s, 'theme', k), 'bought');
  for (let k = 1; k < TC.TOPPERS.length; k++) assert.equal(TC.buy(s, 'topper', k), 'bought');
  assert.equal(TC.buy(s, 'theme', 0), 'wear');
  assert.equal(s.theme, 0);
  assert.equal(TC.buy(s, 'topper', 2), 'wear');
  assert.equal(s.topper, 2);
  assert.equal(TC.buy(s, 'topper', 99), '');
});
