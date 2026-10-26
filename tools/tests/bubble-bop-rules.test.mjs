// Bubble Bop rules (games/bubble-bop/rules.js): tuning, forgiving input, stars, ids,
// saves, and whole levels played with simulated children. Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/bubble-bop/rules.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const BB = sandbox.window.BB;
const DT = 1 / 60;
const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
// Values made in the rules' own context, compared as plain data.
const plain = v => JSON.parse(JSON.stringify(v));

test('the rules are pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(BB && BB.TUNE && BB.step, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('every tuning knob moves one way from tier 1 to tier 5, in the direction that makes it harder', () => {
  for (const [mode, table] of Object.entries(BB.TUNE)) {
    for (const [key, row] of Object.entries(table)) {
      const dir = BB.HARDER[key];
      assert.ok(dir === 1 || dir === -1, `${mode}.${key} has a direction`);
      assert.equal(row.length, BB.TIERS, `${mode}.${key} has one entry per tier`);
      for (let i = 1; i < row.length; i++) assert.ok((row[i] - row[i - 1]) * dir >= 0, `${mode}.${key} tier ${i + 1}: ${row}`);
      assert.notEqual(row[0], row[row.length - 1], `${mode}.${key} changes between tier 1 and tier 5`);
    }
  }
  // The headline knobs: targets shrink, speed up, multiply and get less help.
  assert.ok(BB.TUNE.touch.r[0] > BB.TUNE.touch.r[4] && BB.TUNE.tap.r[0] > BB.TUNE.tap.r[4]);
  assert.ok(BB.TUNE.touch.speed[0] < BB.TUNE.touch.speed[4] && BB.TUNE.catch.fall[0] < BB.TUNE.catch.fall[4]);
  assert.ok(BB.TUNE.touch.live[0] < BB.TUNE.touch.live[4] && BB.TUNE.touch.gap[0] > BB.TUNE.touch.gap[4]);
  assert.ok(BB.TUNE.touch.magnet[0] > BB.TUNE.touch.magnet[4] && BB.TUNE.tap.magnet[0] > BB.TUNE.tap.magnet[4]);
  // Hit areas are always clearly larger than the art.
  for (const mode of ['touch', 'tap']) for (const m of BB.TUNE[mode].margin) assert.ok(m >= 6, `${mode} margin ${m}`);
  // Only the lowest tier lets any key (or a click on the Space bar) jump.
  assert.deepEqual(plain(BB.TUNE.jump.anyKey), [1, 0, 0, 0, 0]);
});

test('the forgiving hit tests accept a pointer within the art radius plus the margin, all around', () => {
  for (let tier = 1; tier <= BB.TIERS; tier++) {
    for (const [mode, hit] of [['touch', BB.touchHit], ['tap', BB.clickHit]]) {
      const r = BB.TUNE[mode].r[tier - 1], margin = BB.TUNE[mode].margin[tier - 1], t = { x: 500, y: 300, r };
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const d = r + margin - 0.5;
        assert.ok(hit(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, t, margin), `${mode} tier ${tier}: a near miss within the margin counts`);
        assert.ok(hit(t.x + Math.cos(a) * r * 0.5, t.y + Math.sin(a) * r * 0.5, t, margin), `${mode} tier ${tier}: inside the art`);
      }
      assert.equal(hit(t.x + r * 1.1 + margin + 30, t.y, t, margin), false, `${mode} tier ${tier}: far away does not count`);
    }
  }
});

test('the magnet never pushes a target away, never jumps it and never pulls it past the stop', () => {
  const rand = BB.rng(42);
  for (let i = 0; i < 4000; i++) {
    const t = { x: rand() * 1280, y: rand() * 720 }, ax = rand() * 1280, ay = rand() * 720;
    const strength = rand() * 400, reach = 50 + rand() * 400, stop = rand() * 80, dt = rand() * 0.05;
    const before = Math.hypot(ax - t.x, ay - t.y), x0 = t.x, y0 = t.y;
    const moved = BB.magnet(t, ax, ay, strength, reach, dt, stop);
    const after = Math.hypot(ax - t.x, ay - t.y), step = Math.hypot(t.x - x0, t.y - y0);
    assert.ok(after <= before + 1e-9, 'never pushed away');
    assert.ok(step <= strength * dt + 1e-9, 'never more than strength * dt in one step');
    assert.ok(Math.abs(step - moved) < 1e-9, 'reports the distance moved');
    if (before > stop) assert.ok(after >= stop - 1e-9, 'never pulled past the stop');
    if (before > reach) assert.equal(step, 0, 'no pull outside reach');
  }
});

test('a finished level always earns one to three stars, and the DDA outcome stays in 0..1', () => {
  const rand = BB.rng(7);
  for (let i = 0; i < 2000; i++) {
    const r = { hits: 1 + Math.floor(rand() * 30), escapes: Math.floor(rand() * 40), missClicks: Math.floor(rand() * 200), time: rand() * 300, par: 10 + rand() * 90, expect: 1 + rand() * 80, party: rand() < 0.3 };
    const stars = BB.stars(r), out = BB.outcome(r);
    assert.ok(Number.isInteger(stars) && stars >= 1 && stars <= 3, `stars ${stars}`);
    assert.ok(out >= 0 && out <= 1, `outcome ${out}`);
  }
  assert.equal(BB.stars({ hits: 8, escapes: 0, missClicks: 99, time: 10, par: 50 }), 3, 'missed clicks never cost a star');
  assert.equal(BB.stars({ hits: 8, escapes: 20, missClicks: 0, time: 200, par: 50 }), 1, 'finishing slowly still earns a star');
});

test('round ids are valid statistics ids, one per level and party round', () => {
  assert.equal(BB.ROUND_IDS.length, 20);
  assert.equal(new Set(BB.ROUND_IDS).size, 20);
  for (const id of BB.ROUND_IDS) {
    assert.match(id, ID);
    assert.doesNotMatch(id, /\d{3}/);
  }
  assert.deepEqual([BB.roundId(0, 0), BB.roundId(4, 2), BB.roundId(2, 'P')], ['w1L1', 'w5L3', 'w3P']);
  for (let w = 0; w < 5; w++) for (const l of [0, 1, 2, 'P']) for (let tier = 1; tier <= 5; tier++) {
    const plan = BB.plan(w, l, tier);
    assert.match(plan.id, ID);
    assert.equal(plan.tier, tier);
    if (l === 'P') assert.equal(plan.duration, BB.PARTY_SECONDS);
    else assert.ok(plan.segments.every(s => s.goal >= 3), 'every level part has something to do');
  }
});

test('damaged saves load as playable ones; levels and worlds open in order', () => {
  for (const raw of [null, 'x', 7, [], { stars: 'no' }, { stars: [[9, -1, 2.5]], best: [-4, 'x'], color: 99, hat: -1, grip: 'yes', seenStars: 1e9 }]) {
    const s = BB.loadSave(raw);
    assert.equal(s.stars.length, 5);
    for (const row of s.stars) for (const v of row) assert.ok([0, 1, 2, 3].includes(v));
    assert.ok(s.best.every(v => Number.isInteger(v) && v >= 0));
    assert.equal(s.color, 0); assert.equal(s.hat, 0); assert.equal(s.grip, false);
    assert.deepEqual(plain(BB.nextLevel(s)), { w: 0, l: 0 });
  }
  const fresh = BB.freshSave();
  assert.ok(BB.isOpen(fresh, 0, 0) && !BB.isOpen(fresh, 0, 1) && !BB.isOpen(fresh, 0, 'P') && !BB.worldOpen(fresh, 1));
  fresh.stars[0] = [1, 2, 3];
  assert.ok(BB.isOpen(fresh, 0, 'P') && BB.worldOpen(fresh, 1) && BB.isOpen(fresh, 1, 0) && !BB.isOpen(fresh, 1, 1));
  assert.deepEqual(plain(BB.nextLevel(fresh)), { w: 1, l: 0 });
  // A colour or hat the star total does not reach falls back to the default.
  const kept = BB.loadSave({ stars: [[3, 3, 3], [3, 0, 0]], color: 4, hat: 5 });
  assert.equal(BB.total(kept), 12);
  assert.equal(kept.color, 4); assert.equal(kept.hat, 5);
  assert.equal(BB.loadSave({ stars: [[1]], color: 7, hat: 9 }).color, 0);
  assert.deepEqual(Array.from(BB.unlocks(0, 3), u => u.type + u.i), ['color1', 'hat1', 'hat2']);
});

// A child who has never held a mouse: slow (about 150 px/s), wobbling, heading for the
// nearest target, and in world 2 clicking only after hovering a while, plus stray clicks.
function firstTimer(w, l, seed) {
  const plan = BB.plan(w, l, 1), world = BB.create(plan, seed), rand = BB.rng(seed * 31 + 7);
  let px = 640, py = 640, wobble = 0, hover = 0;
  const tap = plan.segments[0].mode === 'tap', margin = BB.TUNE.tap.margin[0];
  while (!world.over && world.t < 90) {
    let target = null, best = Infinity;
    for (const t of world.targets) { const d = Math.hypot(t.x - px, t.y - py); if (!t.dead && d < best) { best = d; target = t; } }
    wobble += (rand() - 0.5) * 2;
    const input = { px, py, clicks: [], jump: false, dir: 0 };
    if (target) {
      const dx = target.x - px, dy = target.y - py, d = Math.hypot(dx, dy) || 1, s = Math.min(d, 150 * DT);
      px += dx / d * s + Math.cos(wobble) * 70 * DT; py += dy / d * s + Math.sin(wobble) * 70 * DT;
      if (tap && BB.clickHit(px, py, target, margin * 0.5)) { hover += DT; if (hover > 0.6) { input.clicks.push({ x: px, y: py }); hover = 0; } } else hover = 0;
    }
    if (tap && rand() < DT * 0.4) input.clicks.push({ x: rand() * 1280, y: rand() * 720 });
    input.px = px; input.py = py;
    BB.step(world, DT, input);
    world.ev.length = 0;
  }
  return world;
}

test('a slow, wobbly first-time pointer finishes every tier-1 level of worlds 1 and 2 within 90 s', () => {
  for (const w of [0, 1]) for (const l of [0, 1, 2]) for (const seed of [1, 2, 3, 4, 5]) {
    const world = firstTimer(w, l, seed);
    assert.ok(world.over, `world ${w + 1} level ${l + 1} seed ${seed}: ${world.hits}/${world.goal} after ${world.t.toFixed(1)} s`);
    assert.equal(world.escapes, 0, 'at tier 1 nothing gets away in a level');
    assert.ok(BB.stars(BB.result(world)) >= 2);
  }
});

test('pressing Space at random moments finishes every tier-1 jump level', () => {
  for (const l of [0, 1, 2]) for (const seed of [1, 2, 3, 4, 5]) {
    const plan = BB.plan(2, l, 1), world = BB.create(plan, seed), rand = BB.rng(seed * 13 + 5);
    let next = 0.3 + rand() * 2.7;
    while (!world.over && world.t < 120) {
      const input = { px: null, py: null, clicks: [], jump: false, dir: 0 };
      if (world.t >= next) { input.jump = true; next = world.t + 0.3 + rand() * 2.7; }
      BB.step(world, DT, input);
      world.ev.length = 0;
    }
    assert.ok(world.over, `level ${l + 1} seed ${seed}: ${world.hits}/${world.goal} after ${world.t.toFixed(1)} s`);
    assert.equal(world.escapes, 0, 'a tier-1 firefly waits above the frog');
  }
});

test('nothing pops by itself: a Bop that never moves and a frog that never jumps score nothing', () => {
  for (const [w, mode] of [[0, 'touch'], [1, 'tap'], [2, 'jump']]) {
    const world = BB.create(BB.plan(w, 0, 1), 9);
    for (let i = 0; i < 60 * 30; i++) { BB.step(world, DT, { px: null, py: null, clicks: [], jump: false, dir: 0 }); world.ev.length = 0; }
    assert.equal(world.hits, 0, mode);
  }
});

test('a brisk expert clears tier-5 levels and parties score with combo chains and gold', () => {
  for (const w of [0, 1, 3]) {
    const plan = BB.plan(w, 'P', 5), world = BB.create(plan, 11);
    let px = 640, py = 400, wait = 0;
    let gold = 0, maxMult = 1;
    while (!world.over) {
      let target = null, best = Infinity;
      for (const t of world.targets) { const d = world.mode === 'catch' ? -t.y : Math.hypot(t.x - px, t.y - py); if (!t.dead && d < best) { best = d; target = t; } }
      const input = { px, py, clicks: [], jump: false, dir: 0 };
      if (target && world.mode !== 'catch') {
        const dx = target.x - px, dy = target.y - py, d = Math.hypot(dx, dy) || 1, s = Math.min(d, 900 * DT);
        px += dx / d * s; py += dy / d * s; input.px = px; input.py = py;
        if (world.mode === 'tap' && d < 20) { wait += DT; if (wait > 0.12) { input.clicks.push({ x: px, y: py }); wait = 0; } }
      }
      if (target && world.mode === 'catch') { const dx = target.x - world.basket.x; input.dir = Math.abs(dx) < 20 ? 0 : Math.sign(dx); }
      BB.step(world, DT, input);
      for (const e of world.ev) if (e.t === 'pop') { if (e.gold) gold++; maxMult = Math.max(maxMult, e.mult); }
      world.ev.length = 0;
    }
    assert.ok(world.score > world.hits, `world ${w + 1}: the multiplier adds points (${world.score} for ${world.hits})`);
    assert.ok(maxMult >= 2, `world ${w + 1}: combo chains reach ×2`);
    assert.ok(gold > 0, `world ${w + 1}: gold targets appear`);
    assert.ok(world.wave === 4, 'four faster waves in a minute');
  }
});
