// سلّة الفواكه (Juicy Drop): the pure jar engine. Purity, determinism, a still pile (no
// jitter), no explosions after merges or squeezes, the merge rules, combos and the shake
// charge, the overflow line with its grace time, the jar shake, and the save rules.
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
const source = fs.readFileSync(enginePath, 'utf8');
const E = require(enginePath);
const DT = 1 / 60;

function run(w, seconds) {
  const events = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    E.step(w, DT);
    if (w.ev.length) { events.push(...w.ev); w.ev.length = 0; }
  }
  return events;
}
function maxOverlap(w) {
  let m = 0;
  const fr = w.fruits;
  for (let i = 0; i < fr.length; i++) {
    const a = fr[i];
    m = Math.max(m, a.r - a.y, a.r - a.x, a.x + a.r - E.JW);
    for (let j = i + 1; j < fr.length; j++) {
      const b = fr[j];
      m = Math.max(m, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return m;
}
// A stand-in for a player: drops at spread-out places, with a little seeded variety.
function bot(w, seconds, seed = 1) {
  let s = seed, up = 0, side = 0;
  const events = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && !w.over; i++) {
    if (i % 40 === 0) {
      s = (s * 16807) % 2147483647;
      E.setAim(w, (s / 2147483647) * E.JW);
      E.drop(w);
    }
    E.step(w, DT);
    events.push(...w.ev); w.ev.length = 0;
    for (const f of w.fruits) if (f.landed && f.age > 0.3) { up = Math.max(up, f.vy); side = Math.max(side, Math.abs(f.vx)); }
  }
  return { events, up, side };
}

test('engine is pure: UMD export, no Math.random / Kit / DOM / timers', () => {
  assert.equal(typeof E.create, 'function');
  assert.equal(E.FRUITS.length, 11);
  assert.equal(E.FRUITS[E.TOP].id, 'watermelon');
  for (const bad of [/Math\.random/, /\bKit\b/, /\bdocument\b/, /setTimeout|setInterval|requestAnimationFrame/, /localStorage/]) {
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), bad);
  }
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.JDEngine.step, 'function', 'browser global JDEngine');
  for (let i = 1; i < E.FRUITS.length; i++) assert.ok(E.FRUITS[i].r > E.FRUITS[i - 1].r, 'fruit grow along the chain');
});

test('same seed and same calls give the same jar', () => {
  const a = E.create({ seed: 42, pool: 5 }), b = E.create({ seed: 42, pool: 5 });
  bot(a, 30, 7); bot(b, 30, 7);
  assert.deepEqual(a.fruits.map(f => [f.lv, f.x, f.y]), b.fruits.map(f => [f.lv, f.x, f.y]));
  assert.equal(a.score, b.score);
  const c = E.create({ seed: 43, pool: 5 });
  bot(c, 30, 7);
  assert.notDeepEqual(a.fruits.map(f => f.lv), c.fruits.map(f => f.lv), 'another seed gives other fruit');
});

test('the drop pool only holds the first 3..5 fruits', () => {
  for (const pool of [3, 4, 5]) {
    const w = E.create({ seed: 9, pool });
    const seen = new Set();
    for (let i = 0; i < 300; i++) { seen.add(w.held); w.cool = 0; E.drop(w); w.fruits.length = 0; }
    assert.equal(Math.max(...seen), pool - 1);
    assert.equal(Math.min(...seen), 0);
  }
  assert.equal(E.create({ pool: 99 }).pool, 5);
  assert.equal(E.create({ pool: 0 }).pool, 3);
});

test('a settled pile stays still: no jitter, no creeping, no overlaps', () => {
  const w = E.create({ seed: 5, pool: 5, grace: 8 });
  // Different fruits side by side so nothing merges.
  const lv = [0, 1, 2, 3, 4, 3, 2, 1, 0, 4, 2, 0, 3, 1];
  let x = 0.5;
  lv.forEach((l, i) => {
    E.setAim(w, x); w.held = l; w.cool = 0;
    E.drop(w);
    x = (x + 2.3) % (E.JW - 1) + 0.5;
    run(w, 0.5);
  });
  run(w, 4);
  const before = w.fruits.map(f => [f.x, f.y]);
  run(w, 3);
  const moved = Math.max(...w.fruits.map((f, i) => Math.hypot(f.x - before[i][0], f.y - before[i][1])));
  assert.ok(moved < 0.003, 'the pile moved ' + moved);
  assert.ok(maxOverlap(w) < 0.02, 'overlap ' + maxOverlap(w));
  for (const f of w.fruits) {
    assert.ok(f.x - f.r > -0.01 && f.x + f.r < E.JW + 0.01, 'inside the walls');
    assert.ok(f.y - f.r > -0.01, 'above the floor');
  }
});

test('a fruit dropped dead-centre on another rolls off instead of balancing on it', () => {
  const w = E.create({ seed: 2, grace: 8 });
  E.place(w, 3, E.JW / 2, E.FRUITS[3].r);
  w.held = 2; E.setAim(w, E.JW / 2);
  const f = E.drop(w);
  run(w, 4);
  assert.ok(f.y < 2 * E.FRUITS[3].r, 'it rolled down (y=' + f.y + ')');
  assert.ok(f.zz, 'and went to sleep');
});

test('settled fruit sleep, and wake up when the fruit holding them merges away', () => {
  const w = E.create({ seed: 2, grace: 8 });
  const r2 = E.FRUITS[2].r, r3 = E.FRUITS[3].r;
  E.place(w, 2, 3, r2);
  const right = E.place(w, 2, 3 + 2 * r2 + 0.3, r2);
  const top = E.place(w, 3, 3 + r2 + 0.15, 2.2);
  run(w, 3);
  assert.ok(w.fruits.every(f => f.zz), 'all asleep');
  const y0 = top.y;
  E.place(w, 2, right.x + 2 * r2, r2);
  const ev = run(w, 1 / 60);
  assert.ok(ev.some(e => e.t === 'merge'));
  assert.equal(top.zz, false, 'the fruit on top woke up');
  run(w, 4);
  assert.ok(w.fruits.every(f => f.zz), 'asleep again');
  assert.ok(Math.abs(top.y - y0) > 0.01 || Math.abs(top.x - (3 + r2 + 0.15)) > 0.01, 'it moved to its new place');
  assert.ok(maxOverlap(w) < 0.02);
  assert.ok(r3 > 0);
});

test('no explosions: long random games never throw fruit up or sideways', () => {
  for (const seed of [1, 2, 3, 4]) {
    const w = E.create({ seed, pool: 5, grace: 3 });
    const { up, side, events } = bot(w, 90, seed * 11);
    // Falling is fine; being thrown up or sideways by the pile is an explosion.
    assert.ok(up < 7, 'seed ' + seed + ' upward speed ' + up);
    assert.ok(side < 16, 'seed ' + seed + ' sideways speed ' + side);
    assert.ok(events.some(e => e.t === 'merge'), 'fruit merged');
    assert.ok(maxOverlap(w) < 0.12, 'overlap ' + maxOverlap(w));
    for (const f of w.fruits) assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
  }
});

test('two touching fruits of the same kind merge into the next fruit; different kinds do not', () => {
  const w = E.create({ seed: 3 });
  E.place(w, 2, 2, E.FRUITS[2].r);
  E.place(w, 3, 2 + E.FRUITS[2].r + E.FRUITS[3].r, E.FRUITS[3].r);
  let ev = run(w, 0.5);
  assert.equal(ev.filter(e => e.t === 'merge').length, 0);
  assert.equal(w.fruits.length, 2);

  const m = E.create({ seed: 3 });
  const r = E.FRUITS[4].r;
  E.place(m, 4, 2, r);
  E.place(m, 4, 2 + 2 * r, r);
  ev = run(m, 0.5);
  const merge = ev.find(e => e.t === 'merge');
  assert.ok(merge, 'merged');
  assert.equal(merge.lv, 5);
  assert.equal(m.fruits.length, 1);
  assert.equal(m.fruits[0].lv, 5);
  assert.equal(m.score, E.POINTS[5]);
  assert.equal(m.maxLevel, 5);
  assert.equal(merge.first, true, 'first orange of the run');
  assert.ok(Math.abs(m.fruits[0].r - E.FRUITS[5].r) < 1e-9, 'grown to full size');
  assert.ok(E.maxSpeed(m) < 3, 'the new fruit does not jump');
});

test('a growing merged fruit does not fling its neighbours', () => {
  const w = E.create({ seed: 8, grace: 8 });
  // A row of blueberries, then two oranges merging right next to them.
  for (let i = 0; i < 8; i++) E.place(w, 0, 0.4 + i * 0.75, 0.36);
  run(w, 1);
  const r = E.FRUITS[5].r;
  E.place(w, 5, 3.2, 0.72 + r);
  E.place(w, 5, 3.2 + 2 * r, 0.72 + r);
  let peak = 0;
  for (let i = 0; i < 120; i++) { E.step(w, DT); w.ev.length = 0; peak = Math.max(peak, E.maxSpeed(w)); }
  assert.ok(w.fruits.some(f => f.lv === 6), 'apple made');
  assert.ok(peak < 12, 'peak speed ' + peak);
});

test('two watermelons burst for MELON_POINTS', () => {
  const w = E.create({ seed: 1 });
  const r = E.FRUITS[E.TOP].r;
  E.place(w, E.TOP, r, r);
  E.place(w, E.TOP, 3 * r, r);
  const ev = run(w, 0.3);
  const melon = ev.find(e => e.t === 'melon');
  assert.ok(melon);
  assert.equal(w.fruits.length, 0);
  assert.equal(w.score, E.MELON_POINTS);
  assert.equal(w.melons, 1);
});

test('quick merges chain into combos with growing points and earn shake charges', () => {
  const w = E.create({ seed: 1, charges: 0 });
  const r = E.FRUITS[1].r;
  let pts = 0;
  for (let k = 0; k < 3; k++) {
    E.place(w, 1, 1 + k * 2.6, r);
    E.place(w, 1, 1 + k * 2.6 + 2 * r, r);
    const ev = run(w, 0.2).filter(e => e.t === 'merge');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].combo, k + 1);
    assert.equal(ev[0].points, Math.round(E.POINTS[2] * (1 + 0.5 * k)));
    pts += ev[0].points;
  }
  assert.equal(w.score, pts);
  assert.equal(w.bestCombo, 3);
  assert.equal(w.charges, 1, 'combo x3 gives a jar shake');
  run(w, E.CHAIN_T + 0.1);
  assert.equal(w.combo, 0, 'the chain ends after a pause');
});

test('dropping: cooldown, aim kept inside the jar, next fruit moves up', () => {
  const w = E.create({ seed: 4 });
  const held = w.held, next = w.next;
  E.setAim(w, -50);
  assert.equal(w.aim, E.FRUITS[w.held].r);
  E.setAim(w, 50);
  assert.equal(w.aim, E.JW - E.FRUITS[w.held].r);
  E.setAim(w, 3);
  const f = E.drop(w);
  assert.ok(f);
  assert.equal(f.lv, held);
  assert.equal(f.x, 3);
  assert.equal(w.held, next);
  assert.equal(w.drops, 1);
  assert.equal(E.drop(w), null, 'cooldown');
  run(w, E.COOLDOWN + 0.02);
  assert.ok(E.drop(w), 'after cooldown');
  E.setAim(w, Number.NaN);
  assert.ok(Number.isFinite(w.aim));
});

test('landingY shows where a fruit would rest', () => {
  const w = E.create({ seed: 1 });
  assert.equal(E.landingY(w, 4, 0.5), 0.5);
  E.place(w, 5, 4, 1);
  assert.ok(Math.abs(E.landingY(w, 4, 0.5) - 2.5) < 1e-9);
  assert.equal(E.landingY(w, 0.6, 0.5), 0.5, 'beside the fruit it reaches the floor');
});

test('the jar overflows only after the grace time above the line, and recovers below it', () => {
  const w = E.create({ seed: 1, grace: 2 });
  // A tower of different fruits that pokes over the line.
  const tower = [10, 9, 2];
  let y = 0;
  const made = tower.map(lv => { const r = E.FRUITS[lv].r; const f = E.place(w, lv, E.JW / 2, y + r); y += 2 * r; return f; });
  assert.ok(y > E.LINE && y - 2 * E.FRUITS[2].r < E.LINE);
  // Hold the tower still (as if wedged) so only the line rule is tested.
  const pin = () => { let yy = 0; for (const f of made) { f.x = E.JW / 2; f.y = yy + f.r; f.vx = f.vy = 0; yy += 2 * f.r; } };
  let ev = [];
  for (let i = 0; i < 60; i++) { pin(); E.step(w, DT); ev.push(...w.ev); w.ev.length = 0; }
  assert.ok(ev.some(e => e.t === 'danger'));
  assert.equal(w.over, false, 'not over after 1 s');
  assert.ok(w.danger > 0.4 && w.danger < 0.6);
  // Remove the top fruit: below the line again, the danger drains.
  w.fruits = w.fruits.filter(f => f !== made[2]);
  made.pop();
  ev = [];
  for (let i = 0; i < 90; i++) { pin(); E.step(w, DT); ev.push(...w.ev); w.ev.length = 0; }
  assert.ok(ev.some(e => e.t === 'safe'));
  assert.equal(w.danger, 0);
  // Over the line for the full grace time ends the game.
  const r = E.FRUITS[7].r;
  made.push(E.place(w, 7, E.JW / 2, 20));
  ev = [];
  for (let i = 0; i < 200 && !w.over; i++) { pin(); E.step(w, DT); ev.push(...w.ev); w.ev.length = 0; }
  assert.equal(w.over, true);
  assert.ok(Math.abs(w.t - 1 - 1.5 - 2) < 0.2, 'about 2 s of grace (t=' + w.t + ', r=' + r + ')');
  assert.equal(ev.filter(e => e.t === 'over').length, 1);
  const t = w.t;
  E.step(w, DT);
  assert.equal(w.t, t, 'a finished jar no longer moves');
  assert.equal(E.drop(w), null);
});

test('a falling fruit passing the line does not count', () => {
  const w = E.create({ seed: 2, grace: 0.5 });
  for (let i = 0; i < 30; i++) {
    E.drop(w);
    run(w, 0.15);
    w.fruits.length = 0;
    w.cool = 0;
  }
  assert.equal(w.over, false);
  assert.equal(w.danger, 0);
});

test('the jar shake pops every smallest fruit, costs a charge and calms the danger', () => {
  const w = E.create({ seed: 1, charges: 1 });
  E.place(w, 1, 1, 0.46); E.place(w, 1, 3, 0.46); E.place(w, 3, 5, 0.7); E.place(w, 2, 7, 0.58);
  w.overT = 1; w.grace = 2;
  assert.equal(E.blast(w), true);
  assert.deepEqual(w.fruits.map(f => f.lv).sort(), [2, 3]);
  assert.equal(w.charges, 0);
  assert.equal(w.score, 4);
  assert.equal(w.overT, 0);
  const ev = w.ev.filter(e => e.t === 'pop');
  assert.equal(ev.length, 2);
  assert.equal(E.blast(w), false, 'no charges left');
  run(w, 3);
  assert.ok(E.maxSpeed(w) < 0.5, 'the shoved fruit settle again');
  const empty = E.create({ charges: 2 });
  assert.equal(E.blast(empty), false, 'nothing to pop');
  assert.equal(empty.charges, 2);
  assert.equal(E.create({ charges: 9 }).charges, E.MAX_CHARGES);
});

test('stars, DDA outcome and jar skins', () => {
  assert.deepEqual([3, 4, 5, 6, 7, 8, 10].map(E.starsFor), [0, 1, 1, 2, 2, 3, 3]);
  assert.equal(E.outcome(3), 0);
  assert.equal(E.outcome(8), 1);
  assert.equal(E.outcome(-1), 0);
  assert.equal(E.SKINS[0].need, -1);
  const s = E.loadSave(null);
  assert.equal(E.skinOpen(s, 0), true);
  assert.equal(E.skinOpen(s, 1), false);
  assert.equal(E.skinOpen(s, 99), false);
});

test('loadSave cleans odd or old saves', () => {
  const fresh = E.loadSave(undefined);
  assert.deepEqual(fresh, { v: 3, best: 0, top: -1, skin: 0, coach: false, games: 0, seen: 0 });
  for (const raw of ['x', 7, [], { best: 'lots' }, { best: -5, top: 99, skin: 'gold', coach: 'yes', games: NaN }]) {
    const s = E.loadSave(raw);
    assert.ok(s.best >= 0 && Number.isInteger(s.best));
    assert.ok(s.top >= -1 && s.top <= E.TOP);
    assert.equal(s.skin, 0);
    assert.equal(typeof s.coach, 'boolean');
  }
  assert.equal(E.loadSave({ top: 99 }).top, E.TOP);
  // A skin that is not open yet falls back to the glass jar.
  assert.equal(E.loadSave({ top: 4, skin: 2 }).skin, 0);
  assert.equal(E.loadSave({ top: 7, skin: 2, best: 900.4, coach: true }).skin, 2);
  assert.equal(E.loadSave({ best: 900.4 }).best, 900);
});

test('applyResult keeps the best score and the biggest fruit and opens jars', () => {
  const s = E.loadSave({ best: 100, top: 4 });
  let r = E.applyResult(s, { score: 80, maxLevel: 5 });
  assert.equal(r.best, false);
  assert.equal(s.best, 100);
  assert.equal(r.newFruit, true);
  assert.deepEqual(r.opened, [1]);
  assert.equal(s.top, 5);
  assert.equal(s.games, 1);
  r = E.applyResult(s, { score: 250, maxLevel: 10 });
  assert.equal(r.best, true);
  assert.equal(r.prevBest, 100);
  assert.deepEqual(r.opened, [2, 3]);
  assert.equal(r.stars, 3);
  assert.equal(s.best, 250);
  r = E.applyResult(s, { score: 'x', maxLevel: 2 });
  assert.equal(r.best, false);
  assert.deepEqual(r.opened, []);
  assert.equal(s.top, 10);
  assert.equal(E.applyResult(E.loadSave(null), { score: 0, maxLevel: 0 }).best, false, 'zero is never a best');
});

test('steps are cheap: a full jar steps in well under a millisecond', () => {
  const w = E.create({ seed: 6, grace: 8 });
  bot(w, 40, 3);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) { E.step(w, DT); w.ev.length = 0; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 300;
  assert.ok(ms < 1.5, ms + ' ms per step with ' + w.fruits.length + ' fruit');
});
