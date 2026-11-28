// Shortcut Factory (Toy Claw Rush) pure Node engine tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/shortcut-factory/engine.js');
const SF = require(enginePath);

function stepFrames(w, n, input = {}) {
  const all = [];
  for (let i = 0; i < n; i++) all.push(...SF.step(w, 1 / 60, i === 0 ? input : {}));
  return all;
}

test('engine.js stays pure: zero DOM, zero Kit, zero Math.random', () => {
  const src = fs.readFileSync(enginePath, 'utf8');
  assert.doesNotMatch(src, /\bMath\.random\s*\(/);
  assert.doesNotMatch(src, /\bKit\s*\./);
  assert.doesNotMatch(src, /\bdocument\s*\./);
  assert.doesNotMatch(src, /\blocalStorage\b/);
});

test('12 progressive 45-60s stages across 3 factory wings + Endless mode', () => {
  assert.equal(SF.LEVELS.length, 12);
  assert.equal(SF.WINGS.length, 3);
  assert.equal(SF.UPGRADES.length, 4);
  assert.equal(SF.ENDLESS_CFG.endless, true);
  for (const lv of SF.LEVELS) {
    assert.ok(lv.duration >= 45 && lv.duration <= 60, `${lv.id} duration 45-60s`);
    const w = SF.create({ level: lv.idx, seed: 100 + lv.idx });
    assert.ok(w.toys.length >= 8, `${lv.id} starts with toys on all 3 lanes`);
  }
});

test('determinism: identical seed and drop inputs produce identical state', () => {
  const runOnce = () => {
    const w = SF.create({ level: 2, seed: 7777 });
    for (let f = 0; f < 300; f++) {
      SF.step(w, 1 / 60, { dropPress: f === 15 || f === 120 || f === 210 });
    }
    return SF.publicState(w, 'play');
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('1-button drop snatches toy, reels up to hopper, scores points, and chains 3 grabs into 6s Fever Mode', () => {
  const w = SF.create({ level: 0, seed: 55 });
  // Place 3 plushies cleanly directly under claw across 3 drops
  let feverStarted = false;
  for (let grab = 0; grab < 3; grab++) {
    assert.equal(w.claw.state, 'swing');
    w.toys = [{
      id: 900 + grab, kind: 'bear', lane: 0,
      x: w.claw.x, y: SF.LANES[0].y, r: SF.TOYS.bear.r, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0
    }];
    const evs = stepFrames(w, 65, { dropPress: true });
    if (evs.some(e => e.type === 'feverStart')) feverStarted = true;
  }
  assert.equal(w.grabs, 3);
  assert.equal(w.combo, 3);
  assert.ok(w.score > 60);
  assert.equal(feverStarted, true, '3 consecutive grabs ignite 6s Fever Mode!');
  assert.ok(w.fever > 4.5 && w.fever <= SF.FEVER_DUR);
});

test('Magnet Orb pulls adjacent toys simultaneously, Fizz-Crate pops boots, and Rubber Boot tosses without ending run', () => {
  // Magnet Orb test
  const wm = SF.create({ level: 4, seed: 21 });
  const cx = wm.claw.x;
  wm.toys = [
    { id: 1, kind: 'magnet', lane: 0, x: cx, y: SF.LANES[0].y, r: 35, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 },
    { id: 2, kind: 'duck', lane: 0, x: cx + 90, y: SF.LANES[0].y, r: 32, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 },
    { id: 3, kind: 'dino', lane: 1, x: cx - 70, y: SF.LANES[1].y, r: 36, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 },
    { id: 4, kind: 'goldbot', lane: 1, x: cx + 80, y: SF.LANES[1].y, r: 38, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 }
  ];
  const mEvs = stepFrames(wm, 70, { dropPress: true });
  assert.ok(mEvs.some(e => e.type === 'magnet' && e.count === 3), 'Magnet Orb pulls 3 adjacent toys');
  assert.equal(wm.grabs, 4, 'all 4 toys delivered in one mega-haul!');
  assert.ok(wm.fever > 0, '4-toy haul immediately ignites Fever!');

  // Fizz-Crate chain-pop test
  const wf = SF.create({ level: 3, seed: 22 });
  const fx = wf.claw.x;
  wf.toys = [
    { id: 10, kind: 'fizz', lane: 0, x: fx, y: SF.LANES[0].y, r: 35, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 },
    { id: 11, kind: 'boot', lane: 0, x: fx + 100, y: SF.LANES[0].y, r: 31, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 },
    { id: 12, kind: 'boot', lane: 1, x: fx - 60, y: SF.LANES[1].y, r: 31, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 }
  ];
  const fEvs = stepFrames(wf, 65, { dropPress: true });
  assert.equal(fEvs.filter(e => e.type === 'fizzPop').length, 2, 'Fizz-Crate chain-pops both nearby boots into bonus coins');

  // Rubber Boot toss test
  const wb = SF.create({ level: 1, seed: 23 });
  wb.combo = 2;
  wb.toys = [{ id: 20, kind: 'boot', lane: 0, x: wb.claw.x, y: SF.LANES[0].y, r: 31, bobPhase: 0, scale: 1, pulled: false, offX: 0, offY: 0 }];
  const bEvs = stepFrames(wb, 50, { dropPress: true });
  assert.ok(bEvs.some(e => e.type === 'boot'));
  assert.equal(wb.bootsTossed, 1);
  assert.equal(wb.combo, 0);
  assert.equal(wb.over, false, 'boot never kills run');
});

test('save loader migrates legacy saves, unlocks stages on win, and buys all 4 claw upgrades', () => {
  const s = SF.loadSave({ v: 1, legacy: true, stars: [3] });
  assert.equal(s.v, SF.SAVE_VERSION);
  assert.equal(SF.isUnlocked(s, 0), true);
  assert.equal(SF.isUnlocked(s, 1), false);

  SF.applyResult(s, { level: 0, endless: false, won: true, stars: 2, score: 300, coins: 200 });
  assert.equal(SF.isUnlocked(s, 1), true);
  assert.equal(SF.nextLevel(s), 1);

  assert.equal(SF.buyUpgrade(s, 'turbo'), 'buy');
  assert.equal(SF.buyUpgrade(s, 'grip'), 'buy');
  assert.equal(SF.buyUpgrade(s, 'magnet'), 'buy');
  assert.equal(SF.buyUpgrade(s, 'gold'), 'buy');
  assert.deepEqual(s.upg, { turbo: 1, grip: 1, magnet: 1, gold: 1 });
  assert.equal(s.coins, 200 - (30 + 35 + 40 + 45));

  const reloaded = SF.loadSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(reloaded.upg, s.upg);
  assert.equal(reloaded.stars[0], 2);
});
