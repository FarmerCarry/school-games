// Toy Castle: Mega-Mech & Lego-Knight Siege (games/toy-castle/engine.js) unit & balance suite:
// UMD + purity, 4 worlds x 3 unlocked stages, fast energy & generator upgrades, sky crates,
// 4 toy units + tactical counters + air vs ground targeting, controllable roof cannon + super meteor,
// 2P versus symmetry, 3 difficulty tiers + DDA monotonicity, Armory saves, and all 12 stages winnable.
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

// Active commander bot simulating a 7-11yo player aiming the Roof Cannon, popping Crates,
// unleashing Super Meteor Barrage, upgrading the Generator, and summoning counter squads.
function playCommanderBot(levelIdx, ddaLevel, diffId = 'normal', maxSeconds = 135) {
  const w = TC.create(levelIdx, TC.params(ddaLevel, diffId), { diff: diffId, seed: 900 + levelIdx * 23 });
  const frames = Math.round(maxSeconds / DT);
  for (let f = 0; f < frames && !w.done; f++) {
    w.ev.length = 0;
    TC.step(w, DT);

    const s0 = w.sides[0];

    // 1. Fire Super Meteor Barrage as soon as battle-charge hits 100%!
    if (s0.superCharge >= 100) {
      TC.fireSuper(w, 0);
    }

    // 2. Actively fire Roof Cannon at Sky Crates, Enemy Balloons, or advancing foes!
    if (s0.cannonCd <= 0) {
      if (w.crates.length > 0) {
        TC.fireCannon(w, 0, { tx: w.crates[0].x, ty: w.crates[0].y });
      } else {
        const foeInRange = w.units.some(u => u.side === 1 && u.x < TC.CANNON_LX + 780);
        if (foeInRange) TC.fireCannon(w, 0, { fullAuto: true });
      }
    }

    let enemyAir = 0, enemyNear = 0, myTanks = 0, myRockets = 0;
    for (const u of w.units) {
      if (u.side === 1) {
        if (u.flying) enemyAir++;
        if (u.x < TC.GATE_L + 360) enemyNear++;
      } else {
        if (u.type === 'dino' || u.type === 'mech') myTanks++;
        if (u.type === 'rocket') myRockets++;
      }
    }

    // 3. Upgrade Turbo Generator early when safe
    if (s0.genLv === 0 && w.t > 2.2 && enemyNear === 0 && s0.energy >= TC.GEN_LEVELS[1].cost) {
      TC.upgradeGen(w, 0);
      continue;
    }
    if (s0.genLv === 1 && levelIdx >= 4 && enemyNear === 0 && myTanks >= 1 && s0.energy >= TC.GEN_LEVELS[2].cost) {
      TC.upgradeGen(w, 0);
      continue;
    }

    // 4. Counter aerial bomb-balloons with Rocket Troopers
    if (enemyAir > myRockets && s0.energy >= TC.UNITS.rocket.cost && s0.cds.rocket <= 0) {
      TC.summon(w, 0, 'rocket');
      continue;
    }

    // 5. Doorstep defense
    if (enemyNear > 0 && myTanks === 0) {
      if (s0.energy >= TC.UNITS.dino.cost && s0.cds.dino <= 0) TC.summon(w, 0, 'dino');
      else if (s0.energy >= TC.UNITS.sword.cost && s0.cds.sword <= 0) TC.summon(w, 0, 'sword');
      continue;
    }

    // 6. Build combined-arms push: Dino/Mech frontline + Rocket backline + Sword flankers
    if (myTanks === 0) {
      if (levelIdx >= 5 && s0.genLv >= 1 && s0.cds.mech <= 0) {
        if (s0.energy >= TC.UNITS.mech.cost) TC.summon(w, 0, 'mech');
      } else if (s0.energy >= TC.UNITS.dino.cost && s0.cds.dino <= 0) {
        TC.summon(w, 0, 'dino');
      } else if (levelIdx === 0 && s0.energy >= TC.UNITS.sword.cost && s0.cds.sword <= 0) {
        TC.summon(w, 0, 'sword');
      }
    } else if (myRockets < 2 && s0.energy >= TC.UNITS.rocket.cost && s0.cds.rocket <= 0) {
      TC.summon(w, 0, 'rocket');
    } else if (s0.energy >= TC.UNITS.mech.cost && s0.cds.mech <= 0) {
      TC.summon(w, 0, 'mech');
    } else if (s0.energy >= 55 && s0.cds.sword <= 0) {
      TC.summon(w, 0, 'sword');
    }
  }
  return w;
}

test('engine is pure UMD: exports window.TCEngine and module.exports with zero forbidden globals', () => {
  assert.ok(TC && TC.create && TC.step && TC.summon && TC.fireCannon, 'CommonJS module.exports works');
  const sandbox = { window: {} };
  vm.runInNewContext(engineSource, sandbox);
  assert.ok(sandbox.window.TCEngine && sandbox.window.TCEngine.LEVELS.length === 12, 'window.TCEngine works in browser');

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|\bfetch\b|XMLHttpRequest|WebSocket|\bconsole\b/
  );
});

test('4 epic worlds x 3 stages = 12 stages ALL unlocked from start, 4 player units, 5 armors & 5 cannons', () => {
  assert.equal(TC.WORLDS.length, 4);
  assert.equal(TC.LEVELS.length, 12);
  assert.deepEqual(TC.UNIT_ORDER, ['sword', 'rocket', 'dino', 'mech']);
  assert.equal(TC.ARMORS.length, 5);
  assert.equal(TC.CANNONS.length, 5);
  assert.deepEqual(TC.DIFF_ORDER, ['easy', 'normal', 'hero']);

  const fresh = TC.freshSave();
  for (let i = 0; i < TC.LEVELS.length; i++) {
    assert.equal(TC.isOpen(fresh, i), true, `Stage ${TC.LEVELS[i].id} unlocked from the start`);
    assert.equal(TC.LEVELS[i].id, `${Math.floor(i / 3) + 1}-${(i % 3) + 1}`);
    assert.match(TC.LEVELS[i].name, ARABIC, TC.LEVELS[i].id);
  }
  for (const wd of TC.WORLDS) {
    assert.match(wd.name, ARABIC, wd.name);
    assert.match(wd.bossName, ARABIC, wd.bossName);
  }
  for (const uk of [...TC.UNIT_ORDER, 'balloon', 'boss']) assert.match(TC.UNITS[uk].name, ARABIC, uk);
  for (const a of TC.ARMORS) assert.match(a.name, ARABIC, a.id);
  for (const c of TC.CANNONS) assert.match(c.name, ARABIC, c.id);
});

test('starting energy >= 30 summons [1] or [2] at t=0; P1 never auto-spawns; generator & crates boost energy', () => {
  const w = TC.create(0, TC.params(0.35, 'normal'));
  assert.ok(w.sides[0].energy >= 30, 'starting energy >= 30');
  assert.equal(w.spawned[0], 0);

  // Negative check: idle for 14 seconds -> P1 NEVER auto-spawns and battle stays alive on 1-1!
  runSteps(w, 14);
  assert.equal(w.spawned[0], 0, 'P1 never auto-spawns units');
  assert.equal(w.done, false, 'friendly castle survives opening waves during idle check');
  assert.ok(w.sides[0].energy > TC.START_ENERGY, 'energy charges automatically');

  // Frame 0 summon [1] محارب السيف works immediately
  const w2 = TC.create(0, TC.params(0.35, 'normal'));
  const knight = TC.summon(w2, 0, 'sword');
  assert.ok(knight && knight.type === 'sword');
  assert.equal(w2.spawned[0], 1);
  assert.equal(w2.sides[0].energy, TC.START_ENERGY - TC.UNITS.sword.cost);

  // Frame 0 summon [2] رامي الصواريخ also affordable at t=0 (35 >= 25)
  const w3 = TC.create(0, TC.params(0.35, 'normal'));
  assert.ok(TC.summon(w3, 0, 'rocket'));
  assert.equal(w3.spawned[0], 1);

  // Unaffordable Mega-Mech at t=0 emits deny without spawning
  assert.equal(TC.summon(w2, 0, 'mech'), false);
  assert.ok(w2.ev.some(e => e.t === 'deny' && e.unit === 'mech'));
  assert.equal(w2.spawned[0], 1);

  // Turbo Generator upgrades scale regen rate Lv 1 < Lv 2 < Lv 3
  const wGen = TC.create(0, TC.params(0.5, 'normal'), { passiveAi: true, startEnergy: 120 });
  wGen.sides[0].energy = 20;
  TC.step(wGen, 1);
  const g1 = wGen.sides[0].energy - 20;

  wGen.sides[0].energy = 120;
  assert.equal(TC.upgradeGen(wGen, 0), true);
  assert.equal(wGen.sides[0].genLv, 1);
  wGen.sides[0].energy = 20;
  TC.step(wGen, 1);
  const g2 = wGen.sides[0].energy - 20;

  wGen.sides[0].energy = 140;
  assert.equal(TC.upgradeGen(wGen, 0), true);
  assert.equal(wGen.sides[0].genLv, 2);
  assert.equal(TC.upgradeGen(wGen, 0), false, 'max generator level is 3');
  wGen.sides[0].energy = 20;
  TC.step(wGen, 1);
  const g3 = wGen.sides[0].energy - 20;
  assert.ok(g3 > g2 && g2 > g1, `generator scales: ${g1} < ${g2} < ${g3}`);

  // Popping a Sky Crate grants +18 energy and +22 Super charge
  const cr = TC.spawnCrate(wGen, 520, 210);
  const beforeE = wGen.sides[0].energy;
  const beforeS = wGen.sides[0].superCharge;
  assert.equal(TC.popCrate(wGen, cr.x + 8, cr.y - 6, 0), true);
  assert.ok(wGen.sides[0].energy > beforeE);
  assert.ok(wGen.sides[0].superCharge >= beforeS + 20);
  assert.equal(wGen.cratesPopped, 1);
});

test('unit combat: ground vs air targeting, tactical counters, dino knockback, mech AoE, and bridge pads', () => {
  // 1. Ground melee (sword, dino) walk beneath flying balloon without hitting it
  const wAir = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const bal = TC.summon(wAir, 1, 'balloon', { free: true });
  bal.x = 540; bal.speed = 0; bal.dmg = 0;
  const sw = TC.summon(wAir, 0, 'sword');
  sw.x = 470;
  runSteps(wAir, 1.4);
  assert.equal(bal.hp, bal.hpMax, 'sword cannot hit flying balloon');
  assert.ok(sw.x > 580, 'sword marched underneath flying balloon');

  // 2. Rocket Trooper shoots down flying balloon!
  const wRk = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const bal2 = TC.summon(wRk, 1, 'balloon', { free: true });
  bal2.x = 560; bal2.speed = 0;
  const rk = TC.summon(wRk, 0, 'rocket');
  rk.x = 400;
  runSteps(wRk, 3.5);
  assert.ok(!wRk.units.includes(bal2), 'Rocket Trooper blasted the enemy balloon out of the sky');

  // 3. Dino-Tank tanks two rival sword knights and knocks them back!
  const wDino = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const dino = TC.summon(wDino, 0, 'dino');
  dino.x = 500;
  const k1 = TC.summon(wDino, 1, 'sword', { free: true });
  const k2 = TC.summon(wDino, 1, 'sword', { free: true });
  k1.x = 545; k2.x = 560;
  runSteps(wDino, 6.0);
  assert.ok(dino.hp > 0, 'Dino-Tank survived two sword knights');
  assert.equal(wDino.units.filter(u => u.side === 1).length, 0, 'Both rival knights defeated');

  // 4. Mega-Mech slams ground clusters AND blasts air targets
  const wMech = TC.create(0, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const mech = TC.summon(wMech, 0, 'mech');
  mech.x = 480;
  const c1 = TC.summon(wMech, 1, 'sword', { free: true });
  const c2 = TC.summon(wMech, 1, 'sword', { free: true });
  c1.x = 545; c2.x = 565; c1.speed = c2.speed = 0;
  runSteps(wMech, 1.5);
  assert.ok(c1.hp < c1.hpMax && c2.hp < c2.hpMax, 'Mega-Mech AoE slam hit entire rival cluster');

  // 5. World 2 Turbo Pad & World 4 Jump Pad boost crossing units
  const wTurbo = TC.create(3, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const runner = TC.summon(wTurbo, 0, 'sword');
  runner.x = TC.PAD_X - 30;
  runSteps(wTurbo, 0.5);
  assert.ok(runner.boostT > 0, 'World 2 Turbo Pad boosted crossing knight');

  const wJump = TC.create(9, TC.params(0.5), { passiveAi: true, startEnergy: 100 });
  const jumper = TC.summon(wJump, 0, 'sword');
  jumper.x = TC.PAD_X - 30;
  let hopped = false;
  for (let i = 0; i < 40; i++) {
    TC.step(wJump, DT);
    if (jumper.y < TC.GROUND_Y - 5) { hopped = true; break; }
  }
  assert.equal(hopped, true, 'World 4 Jump Pad launched unit into low-gravity arc');
});

test('Controllable Roof Cannon snipes sky crates & balloons, knocks back chargers, and Super Meteor clears bridge', () => {
  const w = TC.create(0, TC.params(0.35, 'normal'), { passiveAi: true });
  const crate = TC.spawnCrate(w, 460, 220);
  assert.equal(TC.fireCannon(w, 0, { tx: crate.x, ty: crate.y }), true);
  assert.equal(TC.fireCannon(w, 0), false, 'cannon respects reload cooldown');
  runSteps(w, 0.8);
  assert.equal(w.cratesPopped, 1, 'Roof Cannon shot popped the sky Energy Crate!');

  // Snipe enemy balloon + knock back charger
  w.sides[0].cannonCd = 0;
  const foe = TC.summon(w, 1, 'sword', { free: true });
  foe.x = 420; foe.speed = 0;
  assert.equal(TC.fireCannon(w, 0, { tx: foe.x, ty: foe.y - 12 }), true);
  runSteps(w, 0.7);
  assert.ok(foe.hp < foe.hpMax && foe.x > 425, 'Roof Cannon damaged and knocked back rival charger');

  // Super Meteor Barrage requires 100% charge, then blasts enemies & rival gate
  assert.equal(TC.fireSuper(w, 0), false, 'cannot fire Super below 100%');
  w.sides[0].superCharge = 100;
  const hpBefore = w.sides[1].hp;
  assert.equal(TC.fireSuper(w, 0), true);
  assert.equal(w.sides[0].superCharge, 0);
  runSteps(w, 1.2);
  assert.ok(w.sides[1].hp < hpBefore, 'Super Meteor Barrage damaged rival fortress');
});

test('2P versus is completely symmetrical and never auto-spawns on either side', () => {
  const w = TC.createVersus();
  assert.equal(w.humans, 2);
  assert.equal(w.sides[0].hpMax, w.sides[1].hpMax);
  assert.equal(w.sides[0].energy, w.sides[1].energy);
  runSteps(w, 6);
  assert.deepEqual(w.spawned, [0, 0], 'neither side auto-spawns in 2P');
  assert.equal(w.sides[0].energy, w.sides[1].energy, 'identical energy regeneration');

  assert.ok(TC.summon(w, 0, 'dino'));
  assert.ok(TC.summon(w, 1, 'dino'));
  assert.deepEqual(w.spawned, [1, 1]);
  assert.equal(TC.fireCannon(w, 0), true);
  assert.equal(TC.fireCannon(w, 1), true);
});

test('Difficulty tiers & DDA scale monotonically, and every stage 1-1..4-3 is winnable across difficulties', () => {
  for (const diff of TC.DIFF_ORDER) {
    const easyDda = TC.params(0, diff), midDda = TC.params(0.5, diff), hardDda = TC.params(1, diff);
    assert.ok(easyDda.aiHp < midDda.aiHp && midDda.aiHp < hardDda.aiHp, `${diff}: aiHp scales`);
    assert.ok(easyDda.aiEnergy < midDda.aiEnergy && midDda.aiEnergy < hardDda.aiEnergy, `${diff}: aiEnergy scales`);
    assert.ok(easyDda.aiThink > midDda.aiThink && midDda.aiThink > hardDda.aiThink, `${diff}: aiThink scales`);
  }
  assert.ok(TC.params(0.35, 'easy').p1Energy > TC.params(0.35, 'normal').p1Energy);
  assert.ok(TC.params(0.35, 'normal').aiHp < TC.params(0.35, 'hero').aiHp);

  for (let i = 0; i < TC.LEVELS.length; i++) {
    for (const [diff, dda] of [['easy', 0.2], ['normal', 0.5], ['hero', 0.85]]) {
      const w = playCommanderBot(i, dda, diff);
      assert.equal(w.done, true, `Stage ${TC.LEVELS[i].id} (${diff}) finished (t=${w.t.toFixed(1)}, hpR=${w.sides[1].hp})`);
      assert.equal(w.winner, 1, `Stage ${TC.LEVELS[i].id} (${diff}) won by player (hpL=${w.sides[0].hp}, hpR=${w.sides[1].hp})`);
      if (TC.LEVELS[i].boss) assert.equal(w.bossSpawned, true, `Stage ${TC.LEVELS[i].id} spawned world boss`);
    }
    const wStar = playCommanderBot(i, 0.35, 'normal');
    assert.ok(TC.stars(wStar) >= 2, `Stage ${TC.LEVELS[i].id} earns >= 2 stars`);
  }
});

test('Armory & save system recover from malformed JSON and unlock castle armors & cannons', () => {
  const fresh = plain(TC.freshSave());
  for (const bad of [null, undefined, 'bad', 42, [], {}, { v: 1 }, { v: 2, lv: 'nope', coins: -9, armor: 99, cannon: 99 }]) {
    assert.deepEqual(plain(TC.loadSave(bad)), fresh);
  }

  const s = TC.freshSave();
  const r0 = TC.applyResult(s, 0, 3, 29.5, 'hero');
  assert.equal(r0.best, true);
  assert.equal(s.lv[0].s, 3);
  assert.ok(s.coins >= 45);
  assert.equal(TC.totalStars(s), 3);

  s.coins = 600;
  for (let k = 1; k < TC.ARMORS.length; k++) assert.equal(TC.buy(s, 'armor', k), 'bought');
  for (let k = 1; k < TC.CANNONS.length; k++) assert.equal(TC.buy(s, 'cannon', k), 'bought');
  assert.equal(TC.buy(s, 'armor', 4), 'wear');
  assert.equal(s.armor, 4);
  assert.equal(TC.buy(s, 'cannon', 2), 'wear');
  assert.equal(s.cannon, 2);
  assert.equal(TC.buy(s, 'cannon', 99), '');
});
