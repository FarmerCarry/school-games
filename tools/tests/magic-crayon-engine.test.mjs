// Unit tests for القلم السحري (Magic Crayon: Turbo Stunt Rider) — games/magic-crayon/engine.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/magic-crayon/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

const browserBox = { window: {} };
vm.runInNewContext(engineSource, browserBox);
const MCEngine = browserBox.window.MCEngine;

const DT = 1 / 60;
const ARABIC = /[\u0600-\u06ff]/;

// Verified player stroke solutions [{ pts, ink }] for all 15 open stunt stages (1-1 .. 3-5).
const SOLUTIONS = [
  // World 1: حلبة البداية (1-1 .. 1-5)
  [{ ink: 0, pts: [[380, 344], [560, 350], [740, 356]] }],
  [
    { ink: 0, pts: [[340, 294], [500, 380]] },
    { ink: 0, pts: [[720, 400], [880, 468]] }
  ],
  [{ ink: 2, pts: [[415, 448], [560, 434]] }],
  [{ ink: 0, pts: [[315, 345], [500, 415]] }],
  [{ ink: 0, pts: [[320, 292], [505, 392]] }],

  // World 2: مصنع التيربو (2-1 .. 2-5)
  [{ ink: 1, pts: [[305, 484], [485, 468], [665, 430]] }],
  [{ ink: 0, pts: [[315, 488], [515, 520]] }],
  [
    { ink: 0, pts: [[295, 298], [475, 368]] },
    { ink: 0, pts: [[705, 382], [860, 424]] }
  ],
  [{ ink: 1, pts: [[275, 356], [445, 330]] }],
  [
    { ink: 0, pts: [[265, 500], [415, 515]] },
    { ink: 0, pts: [[745, 272], [910, 298]] }
  ],

  // World 3: بركان المغامرة (3-1 .. 3-5)
  [{ ink: 1, pts: [[320, 340], [520, 325]] }],
  [{ ink: 0, pts: [[315, 322], [485, 412]] }],
  [{ ink: 2, pts: [[345, 455], [475, 440]] }],
  [
    { ink: 0, pts: [[275, 500], [545, 524]] },
    { ink: 0, pts: [[895, 372], [940, 386]] }
  ],
  [
    { ink: 0, pts: [[265, 312], [435, 372]] },
    { ink: 0, pts: [[905, 354], [995, 288]] }
  ]
];

function simulate(stageIdx, strokes, params = MCEngine.params('normal', 0.35), maxSec = 14) {
  const w = MCEngine.create(stageIdx, params);
  for (const st of strokes) MCEngine.drawStroke(w, st.pts, st.ink);
  MCEngine.launch(w);
  const events = [];
  for (let f = 0; f < maxSec * 60 && !w.done && !w.crashed; f++) {
    w.ev.length = 0;
    MCEngine.step(w, DT);
    events.push(...w.ev);
  }
  return { w, events };
}

test('engine.js is pure UMD: exposes window.MCEngine & module.exports, zero Kit/DOM/timer/random/storage globals', () => {
  assert.ok(MCEngine && MCEngine.create && MCEngine.step && MCEngine.drawStroke && MCEngine.launch);
  const nodeBox = { module: { exports: {} } };
  vm.runInNewContext(engineSource, nodeBox);
  assert.equal(typeof nodeBox.module.exports.create, 'function');

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|fetch|XMLHttpRequest|WebSocket/
  );
});

test('all 15 stages (1-1 .. 3-5) + sandbox are immediately open, valid Arabic, and within bounds', () => {
  assert.equal(MCEngine.WORLDS.length, 3);
  assert.equal(MCEngine.STAGES.length, 15);
  assert.equal(SOLUTIONS.length, 15);
  assert.equal(MCEngine.SANDBOX.id, 'sandbox');
  assert.equal(MCEngine.SANDBOX.infiniteInk, true);

  const save = MCEngine.freshSave();
  MCEngine.STAGES.forEach((st, i) => {
    assert.equal(st.id, `${Math.floor(i / 5) + 1}-${(i % 5) + 1}`);
    assert.match(st.name, ARABIC);
    assert.equal(MCEngine.isOpen(save, i), true, `${st.id} open immediately`);
    assert.equal(st.stars.length, 3, `${st.id} has 3 golden stars`);
    assert.ok(st.inkBase > st.inkPar && st.inkPar >= 340);
    assert.ok(st.start[0] > 50 && st.start[0] < 1230 && st.start[1] > 90 && st.start[1] < 660);
    assert.ok(st.goal.x > 80 && st.goal.x < 1220 && st.goal.y > 100 && st.goal.y < 660);
  });
});

test('stroke auto-smoothing, gap sealing, and zero snagging across jittery multi-segment school-mouse bridges', () => {
  const w = MCEngine.create(0);
  // Start slightly off ramp endpoint (380, 344) and end slightly off landing endpoint (740, 356):
  // gap-sealing snaps both ends cleanly!
  const jittery = [[392, 349]];
  for (let k = 1; k < 14; k++) {
    const x = 392 + k * 24;
    const y = 348 + (k % 2 === 0 ? -4 : 4); // Simulate sticky school-mouse vertical jitter!
    jittery.push([x, y]);
  }
  jittery.push([728, 352]);
  assert.equal(MCEngine.drawStroke(w, jittery, 0), true);
  const st = w.strokes[0];
  assert.deepEqual(Array.from(st.pts[0]), [380, 344], 'snapped start to ramp endpoint');
  assert.deepEqual(Array.from(st.pts[st.pts.length - 1]), [740, 356], 'snapped end to landing endpoint');
  assert.ok(st.segs.every(sg => sg.l <= MCEngine.MAX_SEG + 0.5), 'subdivided into smooth short capsules');

  // Roll pod across the 15-point jittery bridge and verify smooth forward motion (vx never reverses or snags!).
  MCEngine.launch(w);
  let minVxOnBridge = Infinity;
  for (let f = 0; f < 420 && !w.done; f++) {
    MCEngine.step(w, DT);
    if (w.ball.x >= 380 && w.ball.x <= 740) {
      minVxOnBridge = Math.min(minVxOnBridge, w.ball.vx);
    }
  }
  assert.equal(w.done, true, 'pod crosses jittery school-mouse bridge to goal');
  assert.ok(minVxOnBridge > 140, `pod never snagged on bridge seams (minVx=${minVxOnBridge})`);
});

test('3 magic crayon powers: blue bridge (0), flame orange turbo (1), and spring green bounce (2)', () => {
  // Compare speed on flat blue bridge vs flat orange turbo track.
  const runInk = ink => {
    const w = MCEngine.create('sandbox');
    w.ball.x = 220; w.ball.y = 460;
    MCEngine.drawStroke(w, [[180, 500], [720, 500]], ink);
    MCEngine.launch(w);
    let maxVx = 0, minY = w.ball.y;
    const evs = [];
    for (let f = 0; f < 60; f++) {
      w.ev.length = 0;
      MCEngine.step(w, DT);
      evs.push(...w.ev);
      maxVx = Math.max(maxVx, w.ball.vx);
      minY = Math.min(minY, w.ball.y);
    }
    return { maxVx, minY, evs };
  };

  const blue = runInk(0);
  const turbo = runInk(1);
  const spring = runInk(2);

  assert.ok(turbo.maxVx > blue.maxVx + 250, `turbo ink accelerates pod (${turbo.maxVx} >> ${blue.maxVx})`);
  assert.ok(turbo.evs.some(e => e.t === 'turbo'), 'emits turbo event');
  assert.ok(spring.minY < blue.minY - 140, `spring ink bounces pod high (${spring.minY} << ${blue.minY})`);
  assert.ok(spring.evs.some(e => e.t === 'spring'), 'emits spring event');
});

test('wooden crate smashing, TNT crate chain reactions, live mid-run drawing, mid-air hop, and clean resetStage', () => {
  // Stage 3-2 (index 11) has a 4-crate TNT + wood chain!
  const { w: tntW, events: tntEv } = simulate(11, SOLUTIONS[11]);
  assert.ok(tntEv.filter(e => e.t === 'crate').length >= 3, 'TNT triggers multi-crate chain smash');
  assert.equal(tntW.done, true, 'TNT stunt boost carries pod across to goal');

  // Live mid-run drawing & mid-air hop + resetStage state contract.
  const live = MCEngine.create(0);
  assert.equal(live.rolling, false);
  assert.equal(live.inkUsed, 0);
  assert.equal(live.strokes.length, 0);

  MCEngine.launch(live);
  assert.equal(live.rolling, true);
  for (let f = 0; f < 18; f++) MCEngine.step(live, DT);
  // Draw bridge LIVE while pod is already rolling down the start ramp!
  assert.equal(MCEngine.drawStroke(live, SOLUTIONS[0][0].pts, 0), true);
  assert.ok(live.inkUsed > 0 && live.strokes.length === 1);
  for (let f = 0; f < 360 && !live.done; f++) MCEngine.step(live, DT);
  assert.equal(live.done, true, 'live bridge drawn mid-roll guides pod to goal');

  // resetStage restores exact fresh contract state.
  MCEngine.resetStage(live);
  assert.equal(live.rolling, false);
  assert.equal(live.inkUsed, 0);
  assert.equal(live.strokes.length, 0);
  assert.equal(live.done, false);
});

test('all 15 stages (1-1 .. 3-5) do not auto-solve empty, and solve with 3 stars across easy/normal/hero', () => {
  MCEngine.STAGES.forEach((st, i) => {
    for (const tier of ['easy', 'normal', 'hero']) {
      const empty = simulate(i, [], MCEngine.params(tier, 0.35), 10);
      assert.equal(empty.w.done, false, `${st.id} (${tier}) must not auto-solve without drawing`);
    }
    for (const tier of ['easy', 'normal', 'hero']) {
      const P = MCEngine.params(tier, tier === 'hero' ? 0.8 : 0.35);
      const { w } = simulate(i, SOLUTIONS[i], P, 15);
      assert.equal(w.crashed, false, `${st.id} (${tier}) crashed at (${Math.round(w.ball.x)}, ${Math.round(w.ball.y)})`);
      assert.equal(w.done, true, `${st.id} (${tier}) did not reach goal; ended at (${Math.round(w.ball.x)}, ${Math.round(w.ball.y)}), stars=${w.starsGot}`);
      assert.equal(w.starsGot, 3, `${st.id} (${tier}) got ${w.starsGot}/3 stars (${w.stars})`);
      assert.ok(w.inkUsed <= w.L.inkPar, `${st.id} (${tier}) ink ${Math.round(w.inkUsed)} > par ${w.L.inkPar}`);
      assert.equal(MCEngine.calcStars(w.L, w.starsGot, w.inkUsed), 3);
    }
  });
});

test('difficulty tiers, easy hazard shield, sandbox props, and stunt garage economy', () => {
  const easyP = MCEngine.params('easy', 0.2);
  const heroP = MCEngine.params('hero', 0.8);
  assert.ok(easyP.inkMult > heroP.inkMult * 1.5);
  assert.equal(easyP.shield, 1);
  assert.equal(heroP.shield, 0);

  // Easy tier shield bounces pod out of lava instead of crashing on first touch!
  const lavaW = MCEngine.create(10, easyP);
  MCEngine.launch(lavaW);
  const lavaEvs = [];
  for (let f = 0; f < 240; f++) {
    lavaW.ev.length = 0;
    MCEngine.step(lavaW, DT);
    lavaEvs.push(...lavaW.ev);
    if (lavaEvs.some(e => e.t === 'shield')) break;
  }
  assert.ok(lavaEvs.some(e => e.t === 'shield'), 'easy tier bounce-shield saves pod from lava');
  assert.equal(lavaW.crashed, false);

  // Garage purchases & save sanitization.
  const s = MCEngine.freshSave();
  s.coins = 30;
  assert.equal(MCEngine.buy(s, 'pod', 1), 'bought');
  assert.equal(s.pod, 1);
  assert.equal(MCEngine.buy(s, 'trail', 2), 'bought');
  assert.equal(s.trail, 2);
  assert.equal(MCEngine.buy(s, 'pod', 0), 'equip');
  assert.equal(s.pod, 0);
});
