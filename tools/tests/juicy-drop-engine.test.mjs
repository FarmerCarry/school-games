// سلة الفواكه (Juicy Drop: Turbo Monster-Fruit Blaster) — Pure Engine Unit Tests
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/juicy-drop/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

const E = require(enginePath);
const DT = 1 / 60;

function step(w, frames = 1, inp = {}) {
  const events = [];
  for (let i = 0; i < frames; i++) {
    w.ev.length = 0;
    E.step(w, DT, i === 0 ? inp : {});
    if (w.ev.length) events.push(...w.ev);
  }
  return events;
}

test('UMD dual export & purity: Node module.exports + browser window.JDEngine, zero Kit/DOM/timers/Math.random', () => {
  assert.ok(E && E.create && E.step && E.useGadget && E.FRUITS.length === 10);
  const sandbox = { window: {} };
  vm.runInNewContext(engineSource, sandbox);
  assert.ok(sandbox.window.JDEngine);
  assert.equal(sandbox.window.JDEngine.FRUITS.length, 10);

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('10 monster-fruit tiers, 3 open modes, and 3 difficulties have Arabic names and ascending radii/scores', () => {
  for (let i = 0; i < E.FRUITS.length; i++) {
    const f = E.FRUITS[i];
    assert.equal(f.tier, i);
    assert.match(f.name, /[\u0600-\u06FF]/);
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
    if (i > 0) {
      assert.ok(f.r > E.FRUITS[i - 1].r, `tier ${i} radius increases`);
      assert.ok(f.score > E.FRUITS[i - 1].score, `tier ${i} score increases`);
    }
  }
  assert.deepEqual(Object.keys(E.MODES), ['classic', 'crates', 'rush']);
  assert.deepEqual(Object.keys(E.DIFFS), ['easy', 'mid', 'hero']);
  for (const m of Object.values(E.MODES)) assert.match(m.name, /[\u0600-\u06FF]/);
  for (const d of Object.values(E.DIFFS)) assert.match(d.name, /[\u0600-\u06FF]/);
});

test('exact-X aiming & dropping: never teleports X randomly on Space or pointer drop', () => {
  const w = E.create({ mode: 'classic', diff: 'mid', seed: 101 });
  assert.equal(w.Jar, undefined);
  assert.equal(w.jar.hw, 260, '520px wide central reactor tank');
  assert.equal(w.cloudX, E.CX);
  assert.equal(w.drops, 0);

  // Move left via keyboard and drop
  step(w, 10, { move: -1 });
  const aimedLeft = w.cloudX;
  assert.ok(aimedLeft < E.CX, 'keyboard move shifts cloudX left');

  step(w, 1, { drop: true });
  assert.equal(w.drops, 1);
  assert.equal(w.fruits.length, 1);
  assert.equal(w.fruits[0].x, aimedLeft, 'dropped fruit spawns at exact cloudX');
  assert.equal(w.cloudX, aimedLeft, 'cloudX stays right where aimed after Space drop');

  // Wait cooldown, aim at explicit pointer X, and drop 3 times without moving
  step(w, 20);
  const exactX = 712;
  step(w, 1, { x: exactX, drop: true });
  assert.equal(w.drops, 2);
  assert.equal(w.fruits[w.fruits.length - 1].x, exactX);

  step(w, 20);
  step(w, 1, { drop: true });
  assert.equal(w.drops, 3);
  assert.equal(w.fruits[w.fruits.length - 1].x, exactX, 'repeated Space drop never randomizes X');
});

test('circle-circle impulse collisions keep non-matching fruits inside tank walls & floor without overlap', () => {
  const w = E.create({ mode: 'classic', diff: 'mid', seed: 202 });
  E.spawnFruit(w, 0, w.jar.left - 40, 220, -650, 500, null);
  E.spawnFruit(w, 2, w.jar.right + 40, 240, 650, 500, null);
  E.spawnFruit(w, 4, E.CX, 260, 0, 420, null);
  E.spawnFruit(w, 6, E.CX + 12, 190, -80, 300, null);
  step(w, 180);

  assert.equal(w.fruits.length, 4);
  for (let i = 0; i < w.fruits.length; i++) {
    const a = w.fruits[i];
    assert.ok(a.x - a.r >= w.jar.left - 0.5 && a.x + a.r <= w.jar.right + 0.5, 'inside walls');
    assert.ok(a.y + a.r <= w.jar.bottom + 0.5, 'above floor');
    for (let j = i + 1; j < w.fruits.length; j++) {
      const b = w.fruits[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 1.5, 'circles resolved without overlap');
    }
  }
});

test('multi-tier chain merges, shockwave impulse, and Tier-9 Super Watermelon mega boom', () => {
  // Chain merge: two Tier-1 cherries merge into a Tier-2 kiwi right next to another Tier-2 kiwi -> Tier-3 lemon!
  const w = E.create({ mode: 'classic', diff: 'easy', seed: 303 });
  const r1 = E.FRUITS[1].r, r2 = E.FRUITS[2].r;
  const bystander = E.spawnFruit(w, 5, E.CX + 150, w.jar.bottom - E.FRUITS[5].r, 0, 0, null);
  E.spawnFruit(w, 1, E.CX - r1 * 0.85, w.jar.bottom - r1, 0, 0, null);
  E.spawnFruit(w, 1, E.CX + r1 * 0.85, w.jar.bottom - r1, 0, 0, null);
  E.spawnFruit(w, 2, E.CX + r1 + r2 * 0.9, w.jar.bottom - r2, 0, 0, null);

  const ev = step(w, 30);
  assert.ok(w.merges >= 2, 'chained two consecutive merges');
  assert.ok(w.combo >= 2, 'built multi-merge combo');
  assert.ok(w.fruits.some(f => f.tier === 3), 'produced Tier-3 Turbo Lemon from chain');
  assert.ok(bystander.x > E.CX + 150, 'merge shockwave nudged neighboring bystander fruit');
  assert.ok(ev.some(e => e.t === 'merge' && e.toTier === 3));

  // Two Tier-9 Super Watermelons trigger mega_boom (+600 pts)
  const w2 = E.create({ mode: 'classic', diff: 'mid', seed: 304 });
  const r9 = E.FRUITS[9].r;
  E.spawnFruit(w2, 9, E.CX - r9 * 0.88, w2.jar.bottom - r9, 0, 0, null);
  E.spawnFruit(w2, 9, E.CX + r9 * 0.88, w2.jar.bottom - r9, 0, 0, null);
  const ev2 = step(w2, 12);
  assert.equal(w2.fruits.length, 0);
  assert.equal(w2.superBooms, 1);
  assert.ok(w2.score >= E.SUPER_BOOM_BONUS);
  assert.ok(ev2.some(e => e.t === 'mega_boom'));
});

test('Fever Gauge launches Fever Mode and free Rainbow Wildcard merges with any fruit tier', () => {
  const w = E.create({ mode: 'classic', diff: 'easy', seed: 404 });
  w.fever = 90;
  const r2 = E.FRUITS[2].r;
  E.spawnFruit(w, 2, 500 - r2 * 0.85, w.jar.bottom - r2, 0, 0, null);
  E.spawnFruit(w, 2, 500 + r2 * 0.85, w.jar.bottom - r2, 0, 0, null);

  const ev = step(w, 10);
  assert.equal(w.feverActive, true, 'Fever activated at 100%');
  assert.equal(w.currentPower, 'rainbow', 'Fever arms free Rainbow Wildcard in dropper');
  assert.ok(ev.some(e => e.t === 'fever_start'));

  // Drop the Rainbow Wildcard directly onto a Tier-6 Knight Pomegranate -> upgrades to Tier-7 Boxing Melon!
  const target = E.spawnFruit(w, 6, 720, w.jar.bottom - E.FRUITS[6].r, 0, 0, null);
  const aim = E.aimInfo({ ...w, cloudX: 720 });
  assert.equal(aim.willMerge, true, 'aimInfo reports merge match for Rainbow Wildcard');

  const evDrop = step(w, 45, { x: target.x, drop: true });
  assert.ok(evDrop.some(e => e.t === 'merge' && e.toTier === 7 && e.rainbow === true), 'Rainbow Wildcard merged Tier 6 -> Tier 7');
  assert.ok(w.fruits.some(f => f.tier === 7));
});

test('Action Gadgets: Juice Bomb blasts 3 small clutter fruits, Tank Shake jolts pairs to merge, Swap changes fruit', () => {
  const w = E.create({ mode: 'classic', diff: 'easy', seed: 505 });
  E.spawnFruit(w, 0, 440, w.jar.bottom - 17, 0, 0, null);
  E.spawnFruit(w, 1, 510, w.jar.bottom - 23, 0, 0, null);
  E.spawnFruit(w, 2, 590, w.jar.bottom - 30, 0, 0, null);
  E.spawnFruit(w, 7, 760, w.jar.bottom - 82, 0, 0, null);

  assert.equal(E.useGadget(w, 'bomb'), true);
  assert.equal(w.fruits.length, 1, 'Juice Bomb cleared the 3 small clutter fruits and kept Tier-7');
  assert.equal(w.fruits[0].tier, 7);

  // Tank Shake nudges separated matching fruits together so they collide and merge
  const wShake = E.create({ mode: 'classic', diff: 'easy', seed: 506 });
  const r3 = E.FRUITS[3].r;
  E.spawnFruit(wShake, 3, E.CX - r3 - 26, wShake.jar.bottom - r3, 0, 0, null);
  E.spawnFruit(wShake, 3, E.CX + r3 + 26, wShake.jar.bottom - r3, 0, 0, null);
  assert.equal(E.useGadget(wShake, 'shake'), true);
  step(wShake, 60);
  assert.equal(wShake.merges, 1, 'Tank Shake jolted matching pair into merging');

  // Swap guarantees a different currentTier
  const beforeTier = w.currentTier;
  assert.equal(E.useGadget(w, 'swap'), true);
  assert.notEqual(w.currentTier, beforeTier, 'Swap switched dropper to a distinct fruit tier');
});

test('fair overflow grace timer: ignores fresh drops, warns first, and triggers overflow only after sustained rim breach', () => {
  const w = E.create({ mode: 'classic', diff: 'hero', seed: 606 });
  // Fresh drop above rim has age < 1.15s -> no warning or instant game-over
  const f = E.spawnFruit(w, 5, E.CX, TOP_Y(w) - 20, 0, 0, null);
  function TOP_Y(world) { return world.jar.top; }
  // Keep fruit suspended above rim to test grace & warning progression
  for (let i = 0; i < 50; i++) {
    f.y = w.jar.top - 20;
    f.vy = 0;
    E.step(w, DT, {});
  }
  assert.equal(w.warning, false, 'no warning during initial 1.15s drop grace');
  assert.equal(w.over, false);

  // Advance past age 1.15s while keeping fruit pinned above rim
  let sawWarn = false;
  for (let i = 0; i < 200 && !w.done; i++) {
    f.y = w.jar.top - 25;
    f.vy = 0;
    E.step(w, DT, {});
    if (w.warning) sawWarn = true;
  }
  assert.equal(sawWarn, true, 'warning blinks before game over');
  assert.equal(w.over, true, 'sustained overflow ends the round fairly');
});

test('Crate Smash & 90s Turbo Rush modes: crate destruction wins, Rush timer evaluates stars & Hero bumper moves', () => {
  // Crate Smash mode
  const wc = E.create({ mode: 'crates', diff: 'easy', seed: 707 });
  assert.equal(wc.crates.length, 5);
  while (wc.crates.length > 0 && !wc.done) {
    const cr = wc.crates[0];
    const r2 = E.FRUITS[2].r;
    E.spawnFruit(wc, 2, cr.x - 12, cr.y - cr.r - r2 + 2, 0, 0, null);
    E.spawnFruit(wc, 2, cr.x + 12, cr.y - cr.r - r2 + 2, 0, 0, null);
    step(wc, 15);
  }
  assert.equal(wc.crates.length, 0);
  assert.equal(wc.done, true);
  assert.equal(wc.won, true);
  assert.ok(wc.stars >= 1);

  // 90s Turbo Rush mode on Hero difficulty (moving bumper + star target check)
  const wr = E.create({ mode: 'rush', diff: 'hero', seed: 808 });
  assert.ok(wr.bumper, 'Hero Rush includes moving bumper');
  const startBumperX = wr.bumper.x;
  step(wr, 20);
  assert.notEqual(wr.bumper.x, startBumperX, 'bumper oscillates horizontally');

  wr.score = wr.targets[2] + 50;
  wr.timeLeft = 0.02;
  const evRush = step(wr, 3);
  assert.equal(wr.done, true);
  assert.equal(wr.won, true);
  assert.equal(wr.stars, 3);
  assert.ok(evRush.some(e => e.t === 'win' && e.stars === 3));

  // Shop purchase & equip
  const save = E.loadSave({ coins: 60 });
  assert.equal(E.buyOrEquip(save, 'dropper', 1), 'bought');
  assert.equal(save.dropper, 1);
  assert.equal(save.coins, 35);
  assert.equal(E.buyOrEquip(save, 'dropper', 0), 'equipped');
  assert.equal(save.dropper, 0);
});
