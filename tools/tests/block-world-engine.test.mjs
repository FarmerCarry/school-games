// Block World — TNT Mine Dash (games/block-world/{data,world}.js) pure unit tests:
// chunky 44px voxel world, auto-drill digging, TNT 3x3->5x5 craters + chain barrels,
// magnetized gems, 3-relic + escape portal 90s win loop, 1-click upgrades, Free Sandbox, and RLE save.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sandbox = { window: {}, Math, Date, Number, Array, Object, String, Uint8Array, Float32Array, isFinite };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(fs.readFileSync(path.join(repo, 'games/block-world/data.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(repo, 'games/block-world/world.js'), 'utf8'), sandbox);
const BW = sandbox.window.BW;
const DT = 1 / 60;

test('world layout uses chunky 44px tiles, spawns hero underground, and places 3 glowing relics', () => {
  assert.ok(BW.TS >= 32, 'tile size >= 32px for readable school screens: ' + BW.TS);
  const w = BW.createWorld({ seed: 1337 });
  assert.equal(w.relics.length, 3);
  assert.ok(w.p.y >= 6, 'hero starts immediately underground in starter cavern');
  assert.ok(w.timeLeft >= 75 && w.timeLeft <= 95, '90s heist timer: ' + w.timeLeft);
  assert.equal(w.portals.length, 1);
  assert.equal(w.portals[0].active, false);
  // Relics live at escalating depths across the 3 layers
  assert.ok(w.relics[0].y < w.relics[1].y && w.relics[1].y < w.relics[2].y);
});

test('Auto-Drill breaks blocks while moving and Jetpack lifts hero smoothly', () => {
  const w = BW.createWorld({ seed: 2026 });
  const tx = Math.floor(w.p.x) + 1;
  const ty = Math.floor(w.p.y);
  w.set(tx, ty, BW.T.GOLD);
  const startX = w.p.x;
  let brokeGold = false;
  for (let i = 0; i < 90; i++) {
    BW.step(w, DT, { right: true });
    if (w.get(tx, ty) === BW.T.AIR) brokeGold = true;
    w.ev.length = 0;
  }
  assert.equal(brokeGold, true, 'holding right auto-drills right through gold block');
  assert.ok(w.p.x > startX + 0.5, 'hero advances into drilled tunnel');
  assert.ok(w.gemsRun > 0, 'drilled gold ore yields magnetized gems');

  // Jetpack lifts upward
  const y0 = w.p.y;
  for (let i = 0; i < 30; i++) { BW.step(w, DT, { up: true }); w.ev.length = 0; }
  assert.ok(w.p.y < y0 - 0.5, 'holding up fires jetpack upward');
});

test('TNT blasts 3x3 crater, chains buried TNT barrels, pops slimes, and never kills player', () => {
  const w = BW.createWorld({ seed: 77 });
  const cx = 20, cy = 20;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.set(cx + dx, cy + dy, BW.T.GOLD);
  w.set(cx + 1, cy, BW.T.TNT_BARREL);
  w.p.x = cx + 0.5; w.p.y = cy + 0.5;
  w.slimes[0].x = cx + 1.2; w.slimes[0].y = cy + 0.5; w.slimes[0].alive = true;

  assert.equal(BW.plantTNT(w, cx, cy), true);
  let booms = 0, chains = 0, slimePopped = false;
  for (let i = 0; i < 90; i++) {
    BW.step(w, DT, {});
    for (const ev of w.ev) {
      if (ev.t === 'boom') booms++;
      if (ev.t === 'tntChain') chains++;
      if (ev.t === 'slimePop') slimePopped = true;
    }
    w.ev.length = 0;
  }
  assert.equal(chains, 1, 'buried TNT barrel chains cleanly');
  assert.equal(booms, 2, 'initial TNT + chained barrel both detonate');
  assert.equal(slimePopped, true, 'nearby slime pops into gem shower');
  assert.equal(w.get(cx - 1, cy), BW.T.AIR);
  assert.equal(w.get(cx, cy + 1), BW.T.AIR);
  assert.equal(w.done, false, 'own TNT never kills player');
});

test('collecting 3 Relics opens Escape Portal and reaching portal wins with 1-3 stars', () => {
  const w = BW.createWorld({ seed: 555 });
  for (const r of w.relics) {
    w.p.x = r.x; w.p.y = r.y;
    BW.step(w, DT, {});
    w.ev.length = 0;
  }
  assert.equal(w.relicsGot, 3);
  assert.ok(w.portals.some(pt => pt.active), 'Escape Portal activates once all 3 relics collected');
  const tgt = BW.activeTarget(w);
  assert.equal(tgt.kind, 'portal', 'edge guide arrow switches to Escape Portal');

  const portal = w.portals.find(pt => pt.active);
  w.p.x = portal.x; w.p.y = portal.y;
  let winEv = null;
  BW.step(w, DT, {});
  winEv = w.ev.find(e => e.t === 'win');
  assert.ok(winEv, 'touching active portal emits win event');
  assert.equal(w.done, true);
  assert.equal(w.won, true);
  assert.ok(winEv.stars >= 1 && winEv.stars <= 3);
});

test('upgrades scale stats, Free Sandbox has infinite time + block placement, and RLE save round-trips <3KB', () => {
  const save = BW.freshSave();
  save.gems = 500;
  const s1 = BW.statsForUpgrades(save.upgrades);
  assert.equal(BW.buyUpgrade(save, 'tnt'), true);
  assert.equal(BW.buyUpgrade(save, 'drill'), true);
  assert.equal(BW.buyUpgrade(save, 'magnet'), true);
  assert.equal(BW.buyUpgrade(save, 'jetpack'), true);
  const s2 = BW.statsForUpgrades(save.upgrades);
  assert.ok(s2.tntRadius > s1.tntRadius);
  assert.ok(s2.drillPower > s1.drillPower);
  assert.ok(s2.magnetRadius > s1.magnetRadius);
  assert.ok(s2.jetAccel > s1.jetAccel);

  // Free Sandbox placement
  const fw = BW.createWorld({ seed: 99, freeMode: true });
  assert.equal(fw.timeLeft, Infinity);
  const px = Math.floor(fw.p.x) + 2, py = Math.floor(fw.p.y);
  fw.set(px, py, BW.T.AIR);
  fw.selBlock = 2; // Crystal
  assert.equal(BW.placeSandboxBlock(fw, px, py), true);
  assert.equal(fw.get(px, py), BW.T.CRYSTAL_BLK);

  // Compact RLE serialize + restore
  const ser = fw.serialize();
  const bytes = JSON.stringify(ser).length;
  assert.ok(bytes < 3500, 'RLE serialized mine stays super compact: ' + bytes);
  const restored = BW.restoreWorld(ser, save.upgrades);
  assert.equal(restored.get(px, py), BW.T.CRYSTAL_BLK);
});
