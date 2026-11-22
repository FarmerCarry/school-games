// Unit tests for القلم السحري (Magic Crayon 3D) — games/magic-crayon/engine.js
// Verifies pure deterministic 2D monster-truck physics, crayon mechanics (bridge/boost/bounce),
// ink budget & undo, save schema v3, AND proves EVERY handcrafted level is deterministically
// solvable with its reference solution strokes!
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const MC = require(path.join(repo, 'games/magic-crayon/engine.js'));

function simulate(world, maxSeconds = 12) {
  const frames = Math.ceil(maxSeconds * 60);
  const events = [];
  for (let f = 0; f < frames; f++) {
    MC.step(world, 1 / 60);
    events.push(...MC.consumeEvents(world));
    if (world.won || world.crashed) break;
  }
  return events;
}

test('catalog structure: 21 handcrafted levels across 3 themed worlds & 6 truck skins', () => {
  assert.equal(MC.WORLDS.length, 3);
  assert.equal(MC.LEVELS.length, 21);
  assert.equal(MC.SKINS.length, 6);
  assert.equal(MC.CRAYONS.length, 3);

  const ids = new Set();
  for (let i = 0; i < MC.LEVELS.length; i++) {
    const lv = MC.LEVELS[i];
    assert.ok(!ids.has(lv.id), `duplicate level id ${lv.id}`);
    ids.add(lv.id);
    assert.equal(lv.stars.length, 3, `${lv.id} must have 3 stars`);
    assert.ok(Array.isArray(lv.solution) && lv.solution.length >= 1, `${lv.id} needs reference solution`);
    assert.ok(lv.inkBudget > 0, `${lv.id} needs positive inkBudget`);
  }
});

test('EVERY level is deterministically solvable to the flag with 3 stars within ink budget', () => {
  for (let i = 0; i < MC.LEVELS.length; i++) {
    const lv = MC.LEVELS[i];
    const w = MC.createWorld(i);

    for (const s of lv.solution) {
      const added = MC.addStroke(w, s.type, s.pts);
      assert.ok(added, `${lv.id}: failed to draw reference stroke`);
    }

    assert.ok(w.inkUsed <= w.inkBudget + 1e-6, `${lv.id}: solution used ${w.inkUsed.toFixed(2)} > budget ${w.inkBudget}`);
    assert.equal(MC.launch(w), true, `${lv.id}: launch failed`);

    simulate(w, 12);

    assert.equal(w.crashed, false, `${lv.id} (${lv.name}): truck crashed at (${w.truck.x.toFixed(2)}, ${w.truck.y.toFixed(2)})`);
    assert.equal(w.won, true, `${lv.id} (${lv.name}): truck did not reach flag; ended at (${w.truck.x.toFixed(2)}, ${w.truck.y.toFixed(2)})`);
    assert.equal(w.starsCollected, 3, `${lv.id} (${lv.name}): reference solution collected ${w.starsCollected}/3 stars`);
    assert.equal(MC.starsForWin(w), 3);
  }
});

test('every level also solves cleanly under easy and hard DDA parameters', () => {
  for (const opts of [
    { inkMul: 1.45, gravityScale: 0.92, tractionBonus: 1.1 },
    { inkMul: 0.98, gravityScale: 1.03, tractionBonus: 1.0 }
  ]) {
    for (let i = 0; i < MC.LEVELS.length; i++) {
      const lv = MC.LEVELS[i];
      const w = MC.createWorld(i, opts);
      for (const s of lv.solution) MC.addStroke(w, s.type, s.pts);
      MC.launch(w);
      simulate(w, 12);
      assert.equal(w.won, true, `${lv.id} failed under DDA opts ${JSON.stringify(opts)}: truck at (${w.truck.x.toFixed(2)}, ${w.truck.y.toFixed(2)})`);
    }
  }
});

test('launching with zero strokes does NOT accidentally win any level', () => {
  for (let i = 0; i < MC.LEVELS.length; i++) {
    const w = MC.createWorld(i);
    MC.launch(w);
    simulate(w, 10);
    assert.equal(w.won, false, `${w.id} must require drawing crayon lines to win`);
  }
});

test('boost crayon accelerates truck significantly faster than bridge crayon', () => {
  const wBridge = MC.createWorld(0);
  MC.addStroke(wBridge, MC.CRAYON_BRIDGE, [[6.8, 4.95], [14.5, 4.95]]);
  MC.launch(wBridge);
  for (let f = 0; f < 110; f++) MC.step(wBridge, 1 / 60);

  const wBoost = MC.createWorld(0);
  MC.addStroke(wBoost, MC.CRAYON_BOOST, [[6.8, 4.95], [14.5, 4.95]]);
  MC.launch(wBoost);
  for (let f = 0; f < 110; f++) MC.step(wBoost, 1 / 60);

  assert.ok(wBoost.truck.x > wBridge.truck.x + 2.5, `boost (${wBoost.truck.x.toFixed(2)}) should far outrun bridge (${wBridge.truck.x.toFixed(2)})`);
});

test('bounce crayon launches truck high into the air and emits bounce event', () => {
  const w = MC.createWorld(5); // 1-6 has flat runway leading into bounce
  MC.addStroke(w, MC.CRAYON_BOUNCE, [[6.8, 3.35], [10.0, 3.35]]);
  MC.launch(w);
  let maxY = w.truck.y;
  let bounced = false;
  for (let f = 0; f < 160; f++) {
    MC.step(w, 1 / 60);
    for (const ev of MC.consumeEvents(w)) if (ev.type === 'bounce') bounced = true;
    if (w.truck.y > maxY) maxY = w.truck.y;
  }
  assert.equal(bounced, true, 'must emit bounce event');
  assert.ok(maxY > 7.5, `expected high bounce > 7.5, got ${maxY.toFixed(2)}`);
});

test('ink budget clamps strokes and undo refunds exact ink', () => {
  const w = MC.createWorld(0);
  MC.addStroke(w, MC.CRAYON_BRIDGE, [[6.5, 4.9], [10.5, 4.9]]);
  const used1 = w.inkUsed;
  assert.ok(used1 > 3.5 && used1 < 4.5);

  // Oversized stroke gets clamped cleanly at inkBudget
  MC.addStroke(w, MC.CRAYON_BOOST, [[10.5, 6.0], [23.0, 6.0], [23.0, 12.0]]);
  assert.ok(w.inkUsed <= w.inkBudget + 1e-6);
  assert.equal(w.strokes.length, 2);

  // Undo refunds second stroke
  assert.equal(MC.undoStroke(w), true);
  assert.equal(w.strokes.length, 1);
  assert.ok(Math.abs(w.inkUsed - used1) < 1e-4);

  // Undo refunds first stroke back to 0
  assert.equal(MC.undoStroke(w), true);
  assert.equal(w.strokes.length, 0);
  assert.ok(w.inkUsed < 1e-4);
  assert.equal(MC.undoStroke(w), false);
});

test('simulation is 100% deterministic across repeated runs', () => {
  const runOnce = () => {
    const w = MC.createWorld(10);
    for (const s of MC.LEVELS[10].solution) MC.addStroke(w, s.type, s.pts);
    MC.launch(w);
    simulate(w, 10);
    return { x: w.truck.x, y: w.truck.y, angle: w.truck.angle, won: w.won, stars: w.starsCollected, runTime: w.runTime };
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('crash auto-resets truck after delay while preserving drawn lines', () => {
  const w = MC.createWorld(6); // 1-7 has hazard pit
  MC.addStroke(w, MC.CRAYON_BRIDGE, [[12.0, 9.0], [15.0, 9.0]]); // unhelpful stroke
  MC.launch(w);
  simulate(w, 5);
  assert.equal(w.crashed, true);
  assert.equal(w.strokes.length, 1);

  for (let f = 0; f < 60; f++) MC.step(w, 1 / 60);
  assert.equal(w.crashed, false);
  assert.equal(w.rolling, false);
  assert.equal(w.strokes.length, 1, 'auto-reset keeps drawn lines so player can tweak');
  assert.equal(w.truck.x, MC.LEVELS[6].start[0]);
});

test('save schema v3 migrates/resets old saves gracefully and tracks unlocks', () => {
  const fresh = MC.loadSave(null);
  assert.equal(fresh.v, 3);
  assert.equal(fresh.stars.length, 21);
  assert.equal(MC.totalStars(fresh), 0);
  assert.equal(MC.isLevelOpen(fresh, 0), true);
  assert.equal(MC.isLevelOpen(fresh, 1), false);
  assert.equal(MC.isSkinUnlocked(fresh, 0), true);
  assert.equal(MC.isSkinUnlocked(fresh, 1), false);

  // Old v2 save resets cleanly
  const fromOld = MC.loadSave({ v: 2, coins: 99, lv: [{ s: 3 }] });
  assert.equal(fromOld.v, 3);
  assert.equal(MC.totalStars(fromOld), 0);

  // Earning 5 stars unlocks skin 1 & World 2 stage 1 (index 7)
  fresh.stars[0] = 3;
  fresh.stars[1] = 2;
  const loaded = MC.loadSave(fresh);
  assert.equal(MC.totalStars(loaded), 5);
  assert.equal(MC.isSkinUnlocked(loaded, 1), true);
  assert.equal(MC.isLevelOpen(loaded, 2), true);
  assert.equal(MC.isLevelOpen(loaded, 7), true);
  assert.equal(MC.nextUnfinishedLevel(loaded), 2);
});
