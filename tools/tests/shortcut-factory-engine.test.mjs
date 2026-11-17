import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/shortcut-factory/engine.js');
const source = fs.readFileSync(enginePath, 'utf8');
const require = createRequire(import.meta.url);
const SFEngine = require(enginePath);

function stepSecs(w, secs) {
  const dt = 1 / 60;
  const steps = Math.round(secs / dt);
  for (let i = 0; i < steps && w.phase === 'play'; i++) {
    SFEngine.step(w, dt);
    w.events.length = 0;
  }
}

test('engine purity and dual Node/browser export', () => {
  assert.ok(SFEngine && typeof SFEngine.create === 'function');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  assert.ok(sandbox.window.SFEngine && typeof sandbox.window.SFEngine.create === 'function');

  const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/
  );
});

test('all 12 missions + Endless Rush are unlocked, Arabic-named, and use 2-4 dock keycaps', () => {
  assert.equal(SFEngine.COUNT, 12);
  assert.equal(SFEngine.MISSIONS.length, 13);
  assert.equal(SFEngine.TIERS.length, 3);
  const save = SFEngine.defaultSave();

  for (let i = 0; i < SFEngine.MISSIONS.length; i++) {
    const m = SFEngine.MISSIONS[i];
    assert.equal(SFEngine.isOpen(save, i), true, `mission ${m.id} open from start`);
    assert.match(m.title, /[؀-ۿ]/, `mission ${m.id} has Arabic title`);
    assert.ok(m.dock.length >= 2 && m.dock.length <= 4, `mission ${m.id} dock has 2-4 badges`);
    for (const sc of m.dock) {
      assert.ok(SFEngine.SHORTCUTS[sc], `known shortcut ${sc}`);
      for (const code of SFEngine.SHORTCUTS[sc].codes) {
        assert.doesNotMatch(code, /KeyW|KeyT|KeyN|KeyP|KeyR|F5/);
      }
    }
  }
});

test('Mission 1 (level 0) smoke contract: visible bot on belt[0], click + Ctrl+C + Ctrl+V deploys into boxes[0]', () => {
  const w = SFEngine.create(0, { seed: 42 });
  assert.equal(w.phase, 'play');
  assert.equal(w.timeLimit, 0, 'Tier 0 has zero fail-timer stress');
  const visibleBot = w.belts[0].items.find(it => SFEngine.isVisible(it.x) && !it.virus);
  assert.ok(visibleBot, 'at least one visible hero bot on belt[0] at start');

  assert.equal(SFEngine.act(w, { type: 'click', x: visibleBot.x, y: visibleBot.y }), 'ok');
  assert.deepEqual(w.sel, [visibleBot.id]);
  assert.equal(SFEngine.act(w, { type: 'copy' }), 'ok');
  assert.ok(w.clip && w.clip.items.length === 1 && w.clip.items[0].kind === 'laser');

  const before = w.boxes[0].items.length;
  assert.equal(SFEngine.act(w, { type: 'paste' }), 'ok');
  assert.ok(w.boxes[0].items.length > before, 'boxes[0].items.length increased after Ctrl+V');

  // Complete pod (target = 3)
  assert.equal(SFEngine.act(w, { type: 'paste' }), 'ok');
  assert.equal(SFEngine.act(w, { type: 'paste' }), 'ok');
  assert.equal(w.boxes[0].launched, true);
  stepSecs(w, 1.0);
  assert.equal(w.phase, 'win');
  assert.equal(SFEngine.starsFor(w), 3);
});

test('conveyor belt movement, spawning, and cue events', () => {
  const w = SFEngine.create(1, { seed: 99 });
  const x0 = w.belts[0].items[0].x;
  stepSecs(w, 2.0);
  assert.ok(w.offset > 0, 'belt offset advances');
  assert.ok(w.belts[0].items[0].x < x0, 'belt items roll leftward');
  stepSecs(w, 12.0);
  assert.ok(w.belts[0].items.some(it => SFEngine.isVisible(it.x)), 'spawner keeps belt populated');
});

test('Ctrl+X warp-cut lifts misplaced bot out of pod and Ctrl+V deploys into matching pod', () => {
  const w = SFEngine.create(4, { seed: 7 }); // sf_m5
  // Pod 0 starts with ['laser', 'shark'], wants 'laser'
  const misplaced = w.boxes[0].items.find(it => it.kind === 'shark');
  assert.ok(misplaced, 'Pod 0 starts with misplaced shark bot');

  assert.equal(SFEngine.act(w, { type: 'click', x: misplaced.x, y: misplaced.y }), 'ok');
  assert.equal(SFEngine.act(w, { type: 'cut' }), 'ok');
  assert.equal(w.boxes[0].items.some(it => it.kind === 'shark'), false, 'misplaced bot lifted out');
  assert.equal(w.clip.cut, true);

  assert.equal(SFEngine.act(w, { type: 'paste' }), 'ok');
  assert.equal(w.clip, null, 'cut clipboard consumed after paste');
  assert.equal(w.boxes[1].launched, true, 'Pod 1 (shark) filled and launched');
});

test('Delete blasts virus bombs and Undo/Redo restores full history stack', () => {
  const w = SFEngine.create(2, { seed: 12 }); // sf_m3 has viruses
  const virus = w.belts[0].items.find(it => it.virus);
  assert.ok(virus, 'virus present on belt');

  // Auto-target nearest virus with Delete even without prior selection
  assert.equal(SFEngine.act(w, { type: 'delete' }), 'ok');
  assert.equal(w.zapped, 1);
  assert.equal(w.belts[0].items.some(it => it.id === virus.id), false);

  // Undo brings it back; Redo zaps it again
  assert.equal(SFEngine.act(w, { type: 'undo' }), 'ok');
  assert.equal(w.belts[0].items.some(it => it.id === virus.id), true);
  assert.equal(SFEngine.act(w, { type: 'redo' }), 'ok');
  assert.equal(w.belts[0].items.some(it => it.id === virus.id), false);
});

test('Saboteur Bot attacks pod and Ctrl+Z rewinds sabotage and bonks Saboteur', () => {
  const w = SFEngine.create(6, { seed: 21 }); // sf_m7 starts with preSabotage
  assert.equal(w.boxes[0].items[0].glitched, true);
  assert.equal(w.saboteur.state, 'laugh');

  assert.equal(SFEngine.act(w, { type: 'undo' }), 'ok');
  assert.equal(w.boxes[0].items[0].glitched, false, 'glitched bot restored cleanly');
  assert.equal(w.saboteur.state, 'away', 'saboteur bonked away');
  assert.equal(w.bonks, 1);
});

test('Ctrl+A multi-lock, Shift+Arrow additive select, and Ctrl+S Mega Fleet Launch work cleanly', () => {
  const w = SFEngine.create(10, { seed: 55 }); // sf_m11 has megaSave: true
  assert.equal(SFEngine.act(w, { type: 'select', dir: 1 }), 'ok');
  assert.equal(w.sel.length, 1);
  assert.equal(SFEngine.act(w, { type: 'select', dir: 1, add: true }), 'ok');
  assert.equal(w.sel.length, 2, 'additive select appends next visible bot');

  assert.equal(SFEngine.act(w, { type: 'selectAll' }), 'ok');
  assert.ok(w.sel.length >= 2, 'Ctrl+A selects all visible hero bots');
  for (const id of w.sel) {
    const f = SFEngine.findItem(w, id);
    assert.equal(f.item.virus, false, 'Ctrl+A skips virus bombs');
  }
  assert.equal(SFEngine.act(w, { type: 'copy' }), 'ok');
  assert.equal(SFEngine.act(w, { type: 'paste' }), 'ok');

  // Ensure all 3 pods reach target
  for (const bx of w.boxes) {
    while (bx.items.length < bx.target) {
      w.clip = { cut: false, items: [{ kind: bx.kind }] };
      SFEngine.act(w, { type: 'paste' });
    }
  }
  assert.equal(w.megaReady, true, 'megaReady activates when all pods are filled');
  assert.equal(SFEngine.act(w, { type: 'paste' }), 'pod_full', 'extra paste when full does not count as mistake');
  assert.equal(w.mistakes, 0);
  assert.equal(SFEngine.act(w, { type: 'saveShip' }), 'ok');
  assert.ok(w.boxes.every(bx => bx.launched), 'all pods launch together on Ctrl+S');
  stepSecs(w, 1.0);
  assert.equal(w.phase, 'win');
});

test('automated hint solver completes all 12 campaign missions cleanly', () => {
  for (let mi = 0; mi < 12; mi++) {
    const w = SFEngine.create(mi, { seed: 100 + mi });
    for (let guard = 0; guard < 500 && w.phase === 'play'; guard++) {
      const h = SFEngine.hint(w);
      if (!h) {
        stepSecs(w, 0.35);
        continue;
      }
      if (h.act === 'select' && h.targetId) {
        const f = SFEngine.findItem(w, h.targetId);
        if (f) SFEngine.act(w, { type: 'click', x: f.x, y: f.y });
      } else {
        SFEngine.act(w, { type: h.act });
      }
      stepSecs(w, 0.25);
    }
    assert.equal(w.phase, 'win', `Mission ${w.id} solved to win`);
    assert.ok(SFEngine.starsFor(w) >= 2, `Mission ${w.id} earned high stars`);
  }
});

test('difficulty scaling (DDA) and shop/save helpers clamp and persist properly', () => {
  const easy = SFEngine.create(9, { speedScale: 0.6, virusScale: 0.5, timeScale: 1.4 });
  const hard = SFEngine.create(9, { speedScale: 1.5, virusScale: 1.5, timeScale: 0.75 });
  assert.ok(easy.speed < hard.speed);
  assert.ok(easy.virusRate < hard.virusRate);
  assert.ok(easy.timeLeft > hard.timeLeft);

  const save = SFEngine.loadSave({ coins: 90, stars: [3, 2] });
  assert.equal(SFEngine.buyItem(save, 'theme', 'plasma'), 'bought');
  assert.equal(save.theme, 'plasma');
  assert.equal(save.coins, 65);
  assert.equal(SFEngine.buyItem(save, 'armor', 'nova'), 'poor');
  assert.equal(SFEngine.buyItem(save, 'armor', 'gold'), 'bought');
  assert.equal(save.armor, 'gold');
});
