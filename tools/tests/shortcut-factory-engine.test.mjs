// Pure Node unit tests for Shortcut Factory 3D (مصنع الاختصارات) engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SF = require(path.join(repo, 'games/shortcut-factory/engine.js'));

function stepSec(w, sec) {
  const n = Math.ceil(sec * 60);
  for (let i = 0; i < n; i++) SF.step(w, 1 / 60);
}

test('Shortcut Factory: 12 levels across 3 halls plus rush mode', () => {
  assert.equal(SF.COUNT, 12);
  assert.equal(SF.HALLS.length, 3);
  assert.ok(SF.RUSH.rush);
  for (const L of SF.LEVELS) {
    const w = SF.create(L, { dda: 0.35, seed: 123 });
    assert.ok(w.boxes.length >= 1, `${L.id} has boxes`);
    assert.ok(w.toys.length >= 1, `${L.id} starts with toys`);
  }
});

test('Shortcut Factory: copy and paste fill an order and finish level 1-1', () => {
  const w = SF.create(SF.LEVELS[0], { dda: 0.35, seed: 7 });
  stepSec(w, 6);
  assert.ok(w.toys.length >= 1);
  SF.select(w, w.toys[0].id);
  assert.equal(SF.act(w, 'copy'), true, 'Ctrl+C copies selected toy');
  assert.equal(w.clip.length, 1);

  assert.equal(SF.act(w, 'paste'), true);
  assert.equal(SF.act(w, 'paste'), true);
  assert.equal(w.counts.copy, 1);
  assert.equal(w.counts.paste, 2);

  stepSec(w, 25);
  assert.equal(w.done, true);
  assert.equal(w.won, true);
  const res = SF.result(w);
  assert.ok(res.stars >= 1 && res.stars <= 3);
});

test('Shortcut Factory: delete removes broken toys, cut lifts to clipboard, undo/redo rewind', () => {
  const w = SF.create(SF.LEVELS[2], { dda: 0.35, seed: 11 });
  const target = w.toys[0];
  SF.select(w, target.id);
  const beforeCount = w.toys.length;
  assert.equal(SF.act(w, 'cut'), true);
  assert.equal(w.toys.length, beforeCount - 1);
  assert.equal(w.clip.length, 1);
  assert.equal(w.clipCut, true);

  const w2 = SF.create(SF.LEVELS[4], { dda: 0.35, seed: 19 });
  const t0 = w2.toys[0];
  SF.select(w2, t0.id);
  const n0 = w2.toys.length;
  assert.equal(SF.act(w2, 'delete'), true);
  assert.equal(w2.toys.length, n0 - 1);
  assert.equal(SF.act(w2, 'undo'), true);
  assert.equal(w2.toys.length, n0, 'undo restores deleted toy');

  const w3 = SF.create(SF.LEVELS[9], { dda: 0.35, seed: 29 });
  SF.select(w3, w3.toys[0].id);
  assert.equal(SF.act(w3, 'copy'), true);
  assert.equal(SF.act(w3, 'paste'), true);
  const afterPaste = w3.toys.length;
  assert.equal(SF.act(w3, 'undo'), true);
  assert.equal(w3.toys.length, afterPaste - 1);
  assert.equal(SF.act(w3, 'redo'), true);
  assert.equal(w3.toys.length, afterPaste, 'redo reapplies undone paste');
});

test('Shortcut Factory: selectAll selects every toy and Ctrl+S seals full boxes in Hall 3', () => {
  const w = SF.create(SF.LEVELS[5], { dda: 0.35, seed: 31 });
  assert.ok(w.toys.length >= 2);
  assert.equal(SF.act(w, 'selectAll'), true);
  assert.equal(w.sel.length, w.toys.length);

  const wSeal = SF.create(SF.LEVELS[8], { dda: 0.35, seed: 5 });
  assert.equal(SF.needsSeal(wSeal), true);
  const box = SF.active(wSeal);
  SF.select(wSeal, wSeal.toys[0].id);
  SF.act(wSeal, 'copy');
  SF.act(wSeal, 'paste');
  SF.act(wSeal, 'paste');
  stepSec(wSeal, 22);
  assert.equal(box.state, 'full', 'full Hall-3 box waits for Ctrl+S seal');
  assert.equal(SF.act(wSeal, 'save'), true, 'Ctrl+S seals full box');
  assert.equal(wSeal.counts.save, 1);
});

test('Shortcut Factory: saves ignore legacy shapes, track unlocks, and buy skins', () => {
  const fresh = SF.loadSave({ legacy: true, stars: [99] });
  assert.equal(fresh.v, 1);
  assert.equal(SF.totalStars(fresh), 0);
  assert.equal(SF.isOpen(fresh, 0), true);
  assert.equal(SF.isOpen(fresh, 1), false);

  const out = SF.apply(fresh, 0, { stars: 3, score: 500, coins: 80 });
  assert.equal(out.opened, true);
  assert.equal(SF.isOpen(fresh, 1), true);
  assert.equal(SF.buy(fresh, 1), 'buy');
  assert.equal(fresh.skin, 1);
  assert.equal(SF.buy(fresh, 5), 'poor');

  const round = SF.loadSave(JSON.parse(JSON.stringify(fresh)));
  assert.equal(round.skin, 1);
  assert.equal(round.stars[0], 3);
});
