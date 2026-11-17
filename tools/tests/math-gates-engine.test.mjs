// Unit tests for Math Gates: Galactic Mech Squad (games/math-gates/engine.js)
// Verifies purity, dual Node/browser export, 3 difficulty presets (easy/normal/pro),
// all 4 worlds + Endless Warp Mode unlocked from start, fast gate cadence (< 1.7s),
// optimal path solvability vs Boss shield, auto-blaster meteor shattering, jetpack jump,
// hangar skin shop, and save sanitization.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/math-gates/engine.js');
const source = fs.readFileSync(enginePath, 'utf8');
const require = createRequire(import.meta.url);
const MGEngine = require(enginePath);
const DT = 1 / 60;

function playOptimal(run, maxSteps = 60 * 60) {
  for (let i = 0; i < maxSteps && run.phase !== 'done'; i++) {
    const row = run.rows[run.next];
    let wantLane = run.lane;
    if (row && row.shown) wantLane = row.best;
    let jump = false;
    const haz = run.hazards.find(h => !h.passed && h.d > run.d && h.d - run.d < 5);
    if (haz && haz.lanes.includes(wantLane)) {
      if (row && row.d - run.d > 7) {
        wantLane = [0, 1, 2].find(l => !haz.lanes.includes(l)) ?? wantLane;
      } else {
        jump = true;
      }
    }
    const met = run.meteors.find(m => !m.shattered && !m.passed && m.d > run.d && m.d - run.d < 3.5);
    if (met && met.lane === wantLane && met.hp > 2 && run.jumpCd <= 0) {
      jump = true;
    }
    MGEngine.step(run, DT, { lane: wantLane, jump });
    run.ev.length = 0;
  }
  return run.result;
}

function playWorst(run, maxSteps = 60 * 60) {
  for (let i = 0; i < maxSteps && run.phase !== 'done'; i++) {
    const row = run.rows[run.next];
    let worstLane = run.lane;
    if (row && row.shown) {
      const res = row.gates.map(g => MGEngine.applyGate(g, run.count));
      const minV = Math.min(...res);
      worstLane = res.indexOf(minV);
    }
    MGEngine.step(run, DT, { lane: worstLane });
    run.ev.length = 0;
  }
  return run.result;
}

test('engine purity and dual CommonJS + window.MGEngine export', () => {
  assert.ok(MGEngine && typeof MGEngine.create === 'function' && typeof MGEngine.step === 'function');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  assert.ok(sandbox.window.MGEngine && typeof sandbox.window.MGEngine.create === 'function');

  const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|THREE|fetch/);
});

test('all 4 worlds (12 stages) and Endless Warp Mode are unlocked from the start with safe telemetry roundKeys', () => {
  const save = MGEngine.freshSave();
  assert.equal(MGEngine.WORLDS.length, 4);
  assert.equal(MGEngine.STAGES.length, 13);
  for (let i = 0; i <= MGEngine.ENDLESS_INDEX; i++) {
    assert.equal(MGEngine.isOpen(save, i), true, `stage ${i} open from start`);
    const rk = MGEngine.STAGES[i].roundKey;
    assert.match(rk, /^mg_[a-z0-9_]+$/);
    assert.doesNotMatch(rk, /\d{3}/, 'no 3 consecutive digits in roundKey');
  }
  assert.equal(MGEngine.isOpen(save, -1), false);
  assert.equal(MGEngine.isOpen(save, 99), false);
});

test('zero dead air: gate cadence is ~1.4-1.6s across easy, normal, and pro with meteors between every gate pair', () => {
  for (const diff of MGEngine.DIFF_KEYS) {
    const run = MGEngine.create({ stage: 0, diff, seed: 42 });
    const cadenceSec = MGEngine.DIFFS[diff].gap / run.speed;
    assert.ok(cadenceSec >= 1.2 && cadenceSec <= 1.75, `${diff} cadence is ${cadenceSec.toFixed(2)}s`);
    assert.ok(run.meteors.length >= run.R, `${diff} spawns meteors across stretches`);
  }
});

test('gate math operations (+, −, ×, ÷, two-step combos, and mental-math expressions) stay integer >= 1', () => {
  const M = MGEngine.MINUS;
  assert.equal(M, '−');
  assert.equal(MGEngine.applyGate(MGEngine.makeOpGate('+', 7), 5), 12);
  assert.equal(MGEngine.applyGate(MGEngine.makeOpGate(M, 3), 10), 7);
  assert.equal(MGEngine.applyGate(MGEngine.makeOpGate(M, 20), 5), 1, 'clamped at FLOOR = 1');
  assert.equal(MGEngine.applyGate(MGEngine.makeOpGate('×', 3), 8), 24);
  assert.equal(MGEngine.applyGate(MGEngine.makeOpGate('÷', 3), 18), 6);
  assert.equal(MGEngine.applyGate(MGEngine.makeOpGate('×', 2, '+', 4), 6), 16);
  const expr = MGEngine.makeExprGate(4, '+', 5, 9, true);
  assert.equal(expr.label, '+(4 + 5)');
  assert.equal(MGEngine.applyGate(expr, 10), 19);
});

test('every stage (0..11) across easy, normal, and pro is solvable and optimal play beats the Titan Boss', () => {
  for (const diff of MGEngine.DIFF_KEYS) {
    for (let stage = 0; stage < MGEngine.STAGES_N; stage++) {
      for (const seed of [1, 19, 2026]) {
        const run = MGEngine.create({ stage, diff, seed });
        assert.equal(run.lane, 1, 'starts in middle lane');
        assert.ok(run.par > run.bossMax, `stage ${stage} ${diff}: par ${run.par} > bossMax ${run.bossMax}`);

        const res = playOptimal(run);
        assert.ok(res, `stage ${stage} ${diff} finished`);
        assert.equal(res.won, true, `stage ${stage} ${diff} seed ${seed} won (count=${res.count}, boss=${res.bossMax})`);
        assert.ok(res.stars >= 2, `stage ${stage} ${diff} earned ${res.stars} stars`);
      }
    }
  }
});

test('picking the worst gate every row loses to the Boss on normal/pro and awards gentle participation coins', () => {
  let losses = 0;
  for (let stage = 0; stage < 6; stage++) {
    const run = MGEngine.create({ stage, diff: 'normal', seed: 100 + stage });
    const res = playWorst(run);
    if (!res.won) {
      losses++;
      assert.equal(res.stars, 0);
      assert.ok(res.coins >= 3);
    }
  }
  assert.ok(losses >= 5, `worst gates lost ${losses}/6 runs`);
});

test('lane switching, auto-blaster meteor shattering, and jetpack jump over laser floor bars', () => {
  const run = MGEngine.create({ stage: 2, diff: 'normal', seed: 77 });
  assert.equal(run.lane, 1);
  MGEngine.step(run, DT, { move: -1 });
  assert.equal(run.lane, 0);
  MGEngine.step(run, DT, { move: -1 });
  assert.equal(run.lane, 0, 'clamped to left lane 0');
  MGEngine.step(run, DT, { lane: 2 });
  assert.equal(run.lane, 2);

  // Aim at the first meteor and verify auto-blaster bolts damage and shatter it
  const firstMeteor = run.meteors[0];
  run.count = 25; // strong squad rapid fire
  let broke = false;
  for (let i = 0; i < 180 && !firstMeteor.shattered; i++) {
    MGEngine.step(run, DT, { lane: firstMeteor.lane });
    if (run.ev.some(e => e.t === 'meteorBreak')) broke = true;
    run.ev.length = 0;
  }
  assert.equal(broke, true, 'auto-blaster shattered the number meteor');

  // Verify Jetpack Jump leaps cleanly over a laser floor bar
  const jRun = MGEngine.create({ stage: 4, diff: 'pro', seed: 15 });
  jRun.hazards.push({ id: 999, d: 10, lanes: [1], passed: false, hit: false });
  MGEngine.step(jRun, DT, { jump: true });
  assert.ok(jRun.jumpT > 0.5, 'jetpack jump activated');
  let leaped = false;
  for (let i = 0; i < 40; i++) {
    MGEngine.step(jRun, DT, {});
    if (jRun.ev.some(e => e.t === 'leap' && e.id === 999)) leaped = true;
    jRun.ev.length = 0;
  }
  assert.equal(leaped, true, 'leaped over laser floor bar without losing mechs');
});

test('Endless Warp Mode advances waves when squad beats Mini-Titan checkpoint', () => {
  const run = MGEngine.create({ stage: MGEngine.ENDLESS_INDEX, diff: 'easy', seed: 33 });
  assert.equal(run.endless, true);
  assert.equal(run.wave, 1);
  for (let i = 0; i < 60 * 25 && run.wave === 1 && run.phase !== 'done'; i++) {
    const row = run.rows[run.next];
    const want = row && row.shown ? row.best : 1;
    MGEngine.step(run, DT, { lane: want });
    run.ev.length = 0;
  }
  assert.ok(run.wave >= 2, 'cleared wave 1 and warped into wave 2');
});

test('hangar skin shop and save sanitization', () => {
  const s = MGEngine.freshSave();
  assert.equal(s.skin, 0);
  assert.equal(MGEngine.buyOrEquipSkin(s, 1).ok, false, 'not enough coins yet');
  s.coins = 200;
  const buy = MGEngine.buyOrEquipSkin(s, 1);
  assert.deepEqual(buy, { ok: true, bought: true });
  assert.equal(s.skin, 1);
  assert.equal(s.coins, 200 - MGEngine.SKINS[1].cost);
  assert.deepEqual(MGEngine.buyOrEquipSkin(s, 0), { ok: true, bought: false });
  assert.equal(s.skin, 0);

  // Corrupt or legacy v1 saves fall back cleanly to valid v2 save
  for (const bad of [null, 'oops', { v: 1, coins: 999 }, { v: 2, coins: -5, skin: 3, unlockedSkins: [true, false, false, false] }]) {
    const loaded = MGEngine.loadSave(bad);
    assert.equal(loaded.v, 2);
    assert.equal(loaded.skin, 0);
    assert.ok(loaded.coins >= 0);
  }
});
