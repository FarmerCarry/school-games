// Bubble Bop rules (games/bubble-bop/rules.js): tuning, forgiving input, stars, plans,
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

test('every level and party round of the eleven worlds has a plan at every tier', () => {
  assert.equal(BB.N, 11, 'eleven worlds, three levels and a party each');
  for (let w = 0; w < BB.N; w++) for (const l of [0, 1, 2, 'P']) for (let tier = 1; tier <= 5; tier++) {
    const plan = BB.plan(w, l, tier);
    assert.equal(plan.w, w);
    assert.equal(plan.l, l);
    assert.equal(plan.party, l === 'P');
    assert.equal(plan.tier, tier);
    if (l === 'P') assert.equal(plan.duration, BB.PARTY_SECONDS);
    // World 11 has five short parts of at least two targets each (ten or more in all).
    else assert.ok(plan.segments.every(s => s.goal >= (plan.segments.length === 5 ? 2 : 3)), 'every level part has something to do');
  }
  assert.deepEqual(plain(BB.plan(10, 0, 1).segments.map(s => s.mode)), ['drag', 'dbl', 'hold', 'steer', 'keys']);
  assert.deepEqual(plain(BB.plan(4, 0, 1).segments.map(s => s.mode)), ['touch', 'tap', 'jump', 'catch'], 'world 5 is unchanged');
});

test('damaged saves load as playable ones; levels and worlds open in order', () => {
  for (const raw of [null, 'x', 7, [], { stars: 'no' }, { stars: [[9, -1, 2.5]], best: [-4, 'x'], color: 99, hat: -1, grip: 'yes', seenStars: 1e9 }]) {
    const s = BB.loadSave(raw);
    assert.equal(s.stars.length, 11);
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

test('fireflies start away from the frog and come over it, where the Space bar lights up', () => {
  for (let tier = 1; tier <= BB.TIERS; tier++) {
    const world = BB.create(BB.plan(2, 0, tier), 3), over = new Set(), spawned = new Set();
    const reach = BB.knob(world, 'window') * BB.NEAR;
    for (let i = 0; i < 60 * 30; i++) {
      BB.step(world, DT, { px: null, py: null, clicks: [], jump: false, dir: 0 });
      for (const e of world.ev) {
        if (e.t !== 'spawn') continue;
        spawned.add(e.id);
        assert.ok(Math.abs(e.x - world.frog.x) >= reach, `tier ${tier}: a firefly starts away from the frog`);
      }
      world.ev.length = 0;
      for (const f of world.targets) if (!f.dead && Math.abs(f.x - world.frog.x) < reach) {
        assert.ok(spawned.has(f.id), `tier ${tier}: firefly ${f.id} came in`);
        over.add(f.id);
      }
    }
    // A tier-1 firefly waits above the frog; from tier 2 they fly past one after another.
    assert.ok(over.size >= (tier === 1 ? 1 : 3), `tier ${tier}: ${over.size} fireflies came over the frog`);
  }
});

test('nothing pops by itself: a Bop that never moves, a frog that never jumps and a basket that never moves score nothing', () => {
  for (const [w, mode] of [[0, 'touch'], [1, 'tap'], [2, 'jump'], [3, 'catch']]) {
    const world = BB.create(BB.plan(w, 0, 1), 9);
    for (let i = 0; i < 60 * 30; i++) { BB.step(world, DT, { px: null, py: null, clicks: [], jump: false, dir: 0 }); world.ev.length = 0; }
    assert.equal(world.hits, 0, mode);
  }
  // No fruit falls into a resting basket in any level, at any tier: world 4 teaches the arrows.
  for (const w of [3, 4]) for (const l of [0, 1, 2]) for (let tier = 1; tier <= BB.TIERS; tier++) for (const seed of [1, 2, 3]) {
    const world = BB.create(BB.plan(w, l, tier), seed);
    for (let i = 0; i < 60 * 40; i++) {
      // world 5 starts with touch, tap and jump parts: play those, then leave the basket alone
      const input = { px: null, py: null, clicks: [], jump: false, dir: 0 };
      const t = world.targets.find(o => !o.dead);
      if (world.mode !== 'catch' && t) {
        input.px = t.x + (i % 2); input.py = t.y;
        if (world.mode === 'tap') input.clicks.push({ x: t.x, y: t.y });
        if (world.mode === 'jump') input.jump = Math.abs(t.x - world.frog.x) < 40 && i % 20 === 0;
      }
      BB.step(world, DT, input);
      assert.ok(!world.ev.some(e => e.t === 'pop' && e.kind === 'fruit'), `world ${w + 1} level ${l + 1} tier ${tier} seed ${seed}: a fruit fell into the resting basket`);
      world.ev.length = 0;
    }
  }
});

// A first-timer at the arrow keys: notices a fruit late, then holds the arrow towards it
// in hesitant presses (letting go now and then), and stops once the basket is under it.
function firstCatcher(l, seed) {
  const world = BB.create(BB.plan(3, l, 1), seed), rand = BB.rng(seed * 17 + 3);
  let rest = 0;
  while (!world.over && world.t < 90) {
    const input = { px: null, py: null, clicks: [], jump: false, dir: 0 };
    let f = null;
    for (const t of world.targets) if (!t.dead && t.y > 220 && (!f || t.y > f.y)) f = t;
    if (rest > 0) rest -= DT;
    else if (f) {
      const dx = f.x - world.basket.x;
      if (Math.abs(dx) > 40) input.dir = Math.sign(dx);
      if (rand() < DT * 1.5) rest = 0.2 + rand() * 0.4;
    }
    BB.step(world, DT, input);
    world.ev.length = 0;
  }
  return world;
}

test('a hesitant first-timer steering late finishes every tier-1 catch level within 90 s', () => {
  for (const l of [0, 1, 2]) for (const seed of [1, 2, 3, 4, 5]) {
    const world = firstCatcher(l, seed);
    assert.ok(world.over, `level ${l + 1} seed ${seed}: ${world.hits}/${world.goal} after ${world.t.toFixed(1)} s`);
    assert.ok(world.escapes <= 1, `level ${l + 1} seed ${seed}: ${world.escapes} fruit got away`);
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

/* ------------------------------------------------------------ worlds 6-11 */
const W6 = 5, W7 = 6, W8 = 7, W9 = 8, W10 = 9, W11 = 10;
const none = () => ({ px: null, py: null, clicks: [], jump: false, dir: 0, mouse: [], hold: false, dx: 0, dy: 0, keys: [] });
const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Scripted children for the newer worlds. `skill` 0..1: 0 is a slow, hesitant first-timer,
// 1 a brisk ten-year-old. Each returns a function giving the next input for the world.
function dragPlayer(skill, rand) {
  let px = 640, py = 640, wait = 0;
  const speed = 260 + 900 * skill;
  return world => {
    const input = none();
    const move = (x, y) => { const d = hyp(x, y, px, py) || 1, s = Math.min(d, speed * DT); px += (x - px) / d * s; py += (y - py) / d * s; return hyp(x, y, px, py); };
    if (wait > 0) wait -= DT;
    else if (!world.held && !world.carry) {
      let t = null;
      for (const o of world.targets) if (!o.dead && o.state === 'idle' && (!t || hyp(o.x, o.y, px, py) < hyp(t.x, t.y, px, py))) t = o;
      if (t && move(t.x, t.y) < t.r * 0.4) { input.mouse.push({ down: true, x: px, y: py }); wait = 0.25 * (1 - skill); }
    } else {
      const t = world.targets.find(o => o.id === (world.held || world.carry)), p = BB.poolOf(world, t.home);
      if (move(p.x, p.y) < p.r * 0.35) { input.mouse.push({ down: false, x: px, y: py }); wait = 0.3 * (1 - skill) + rand() * 0.2; }
    }
    input.px = px; input.py = py;
    return input;
  };
}
function dblPlayer(skill, rand) {
  let px = 640, py = 600, first = -1, id = 0;
  const speed = 260 + 900 * skill;
  return world => {
    const input = none();
    let t = world.targets.find(o => !o.dead && o.id === id);
    if (!t) { t = null; for (const o of world.targets) if (!o.dead && (!t || hyp(o.x, o.y, px, py) < hyp(t.x, t.y, px, py))) t = o; id = t ? t.id : 0; first = -1; }
    if (t) {
      const d = hyp(t.x, t.y, px, py) || 1, s = Math.min(d, speed * DT);
      px += (t.x - px) / d * s; py += (t.y - py) / d * s;
      // Two clicks with a gap well inside the tier's window, the second a few pixels off.
      const gap = BB.TUNE.dbl.dbl[world.tier - 1] * (0.35 + 0.3 * rand());
      if (hyp(t.x, t.y, px, py) < t.r * 0.5) {
        if (first < 0) { input.clicks.push({ x: px, y: py }); first = world.t; }
        else if (world.t - first >= gap) { input.clicks.push({ x: px + 4, y: py - 3 }); first = -1; id = 0; }
      }
    }
    input.px = px; input.py = py;
    return input;
  };
}
function holdPlayer(skill, rand, useSpace) {
  let holding = false, until = 0, rest = 0;
  return world => {
    const input = none(), t = world.targets.find(o => !o.dead);
    if (rest > 0) rest -= DT;
    else if (t && !holding && t.state === 'ready') { holding = true; until = world.t + BB.holdTime(world.tier, t.ring) * (0.97 + 0.06 * rand()); }
    // A first-timer counts; a brisk child watches the bubble fill the (breathing) ring and lets go.
    else if (holding && t && t.state === 'grow' && (skill >= 0.5 || world.party ? t.inBand && Math.abs(t.br - t.ring) < 5 : world.t >= until)) { holding = false; rest = 0.15 + 0.4 * (1 - skill); }
    else if (holding && (!t || t.state !== 'grow') && world.t > until + 0.1) { holding = false; rest = 0.2; }
    input.hold = holding;
    if (!useSpace) { input.px = 640; input.py = 600; }
    return input;
  };
}
// Steers along a breadth-first path on a 20 px grid that keeps clear of the corals.
function steerPlayer(skill) {
  let path = null, goal = 0, react = 0;
  const G = 20, S = BB.SUB;
  return world => {
    const input = none(), s = world.sub;
    let t = world.targets.find(o => !o.dead && o.id === goal);
    if (!t) { t = null; for (const o of world.targets) if (!o.dead && (!t || hyp(o.x, o.y, s.x, s.y) < hyp(t.x, t.y, s.x, s.y))) t = o; goal = t ? t.id : 0; path = null; react = 0.4 * (1 - skill); }
    if (!t) return input;
    if (react > 0) { react -= DT; return input; }
    if (!path) {
      const free = (x, y) => x >= S.x0 && x <= S.x1 && y >= S.y0 && y <= S.y1 && world.walls.every(wl => !BB.wallHit(x, y, S.r + 6, wl));
      const key = (i, j) => i + ',' + j, start = [Math.round(s.x / G), Math.round(s.y / G)], prev = new Map([[key(...start), null]]), q = [start];
      let end = start;
      while (q.length) {
        const [i, j] = q.shift();
        if (hyp(i * G, j * G, t.x, t.y) < t.r + S.r) { end = [i, j]; break; }
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const n = [i + di, j + dj];
          if (!prev.has(key(...n)) && free(n[0] * G, n[1] * G)) { prev.set(key(...n), [i, j]); q.push(n); }
        }
      }
      path = [];
      for (let c = end; c; c = prev.get(key(...c))) path.unshift({ x: c[0] * G, y: c[1] * G });
      path.push({ x: t.x, y: t.y });
    }
    while (path.length > 1 && hyp(path[0].x, path[0].y, s.x, s.y) < 26) path.shift();
    const p = path[0], vx = p.x - s.x, vy = p.y - s.y;
    input.dx = Math.abs(vx) > 8 ? Math.sign(vx) : 0; input.dy = Math.abs(vy) > 8 ? Math.sign(vy) : 0;
    return input;
  };
}
function keysPlayer(skill, rand) {
  let delay = 0, wrong = 0;
  return world => {
    const input = none(), b = world.targets.find(o => !o.dead);
    if (!b) { delay = 0.3 + (1 - skill) * (0.6 + rand()); return input; }
    if ((delay -= DT) > 0) return input;
    // A first-timer sometimes presses the key beside the right one first.
    if (skill < 0.5 && wrong < 2 && rand() < 0.3) { input.keys.push('KeyG'); wrong++; delay = 0.4; return input; }
    input.keys.push(b.code); delay = 0.2 + (1 - skill) * (0.5 + rand());
    return input;
  };
}
const PLAYERS = { drag: dragPlayer, dbl: dblPlayer, hold: holdPlayer, steer: steerPlayer, keys: keysPlayer };
// Plays a level (or a party) of world w at a tier with the scripted child for each part.
function playNew(w, l, tier, seed, skill, limit = 240) {
  const world = BB.create(BB.plan(w, l, tier), seed), rand = BB.rng(seed * 7 + 1), bots = {};
  while (!world.over && world.t < limit) {
    const bot = bots[world.mode] || (bots[world.mode] = PLAYERS[world.mode](skill, rand));
    BB.step(world, DT, bot(world));
    world.ev.length = 0;
  }
  return world;
}

test('a scripted child finishes every level of worlds 6-11 at tier 1 (slow) and tier 5 (brisk)', () => {
  for (const w of [W6, W7, W8, W9, W10, W11]) for (const l of [0, 1, 2]) for (const [tier, skill] of [[1, 0], [5, 1]]) for (const seed of [1, 2, 3]) {
    const world = playNew(w, l, tier, seed, skill);
    assert.ok(world.over, `world ${w + 1} level ${l + 1} tier ${tier} seed ${seed}: ${world.mode} ${world.segHits}/${world.goal} after ${world.t.toFixed(1)} s`);
    assert.ok(BB.stars(BB.result(world)) >= (tier === 1 ? 1 : 2), `world ${w + 1} level ${l + 1} tier ${tier}: stars`);
    if (tier === 1) assert.equal(world.escapes, 0, `world ${w + 1} level ${l + 1}: nothing gets away at tier 1 (${world.escapes})`);
  }
});

test('the new parties run their minute, switch parts in world 11 and score', () => {
  for (const w of [W6, W7, W8, W9, W10, W11]) for (const tier of [1, 5]) {
    const world = BB.create(BB.plan(w, 'P', tier), 4), rand = BB.rng(9), bots = {}, modes = new Set();
    while (!world.over) {
      const bot = bots[world.mode] || (bots[world.mode] = PLAYERS[world.mode](1, rand));
      modes.add(world.mode);
      BB.step(world, DT, bot(world));
      world.ev.length = 0;
    }
    assert.ok(Math.abs(world.t - BB.PARTY_SECONDS) < 0.05);
    assert.ok(world.hits >= 8, `world ${w + 1} tier ${tier}: ${world.hits} pops in a party`);
    assert.equal(modes.size, w === W11 ? 5 : 1);
    const out = BB.outcome(BB.result(world));
    assert.ok(out > 0.3 && out <= 1, `world ${w + 1} tier ${tier}: outcome ${out}`);
  }
});

test('doing nothing in worlds 6-11 never pops or scores, even with a wandering pointer', () => {
  for (const w of [W6, W7, W8, W9, W10, W11]) for (const l of [0, 1, 2, 'P']) for (const tier of [1, 3, 5]) {
    for (const wander of [false, true]) {
      const world = BB.create(BB.plan(w, l, tier), 5);
      for (let i = 0; i < 60 * 40 && !world.over; i++) {
        const input = none();
        if (wander) { input.px = 640 + Math.cos(i / 40) * 500; input.py = 360 + Math.sin(i / 23) * 300; }
        BB.step(world, DT, input);
        assert.ok(!world.ev.some(e => e.t === 'pop'), `world ${w + 1} level ${l} tier ${tier}: something popped by itself`);
        world.ev.length = 0;
      }
      assert.equal(world.hits, 0); assert.equal(world.score, 0);
    }
  }
});

test('drag: a press on a turtle picks it up, and only letting go at its own pool brings it home', () => {
  for (let tier = 1; tier <= 5; tier++) {
    const world = BB.create(BB.plan(W6, 2, tier), 3);
    let t;
    for (let i = 0; i < 200 && !(t = world.targets.find(o => !o.dead)); i++) BB.step(world, DT, none());
    const grab = BB.TUNE.drag.grab[tier - 1], snap = BB.TUNE.drag.snap[tier - 1];
    const step = input => { BB.step(world, DT, Object.assign(none(), input)); const ev = world.ev.slice(); world.ev.length = 0; return ev; };
    // A press just inside the grab reach (beyond the art) picks it up.
    const gx = t.x + (t.x > 640 ? -1 : 1) * (t.r + grab - 2);
    let ev = step({ px: gx, py: t.y, mouse: [{ down: true, x: gx, y: t.y }] });
    assert.ok(ev.some(e => e.t === 'grab'), `tier ${tier}: grabbed from ${t.r + grab - 2} px`);
    // Carried away and let go on empty sand: it stays there and waits (a slip, nothing lost).
    const others = world.pools.filter(p => p.color !== t.home);
    let spot = null;
    for (const cand of [[200, 640], [1060, 640], [640, 650], [200, 250], [1060, 250]]) {
      if (world.pools.every(p => hyp(cand[0], cand[1], p.x, p.y) > p.r + snap + t.r + 30)) { spot = { x: cand[0], y: cand[1] }; break; }
    }
    for (let i = 0; i < 60; i++) step({ px: spot.x, py: spot.y });
    ev = step({ px: spot.x, py: spot.y, mouse: [{ down: false, x: spot.x, y: spot.y }] });
    assert.ok(ev.some(e => e.t === 'drop') && !ev.some(e => e.t === 'pop'), `tier ${tier}: dropped on the sand ${others.length}`);
    const again = world.targets.find(o => o.id === t.id);
    assert.ok(again && !again.dead && again.state === 'idle' && hyp(again.x, again.y, spot.x, spot.y) < 40, `tier ${tier}: the turtle waits where it was let go`);
    assert.equal(world.escapes, 1);
    // Picked up again and let go just outside its pool (within the snap): it slides in.
    const p = BB.poolOf(world, t.home);
    step({ px: again.x, py: again.y, mouse: [{ down: true, x: again.x, y: again.y }] });
    const side = again.x > p.x ? 1 : -1;
    const ex = () => p.x + side * (p.r + snap * 0.5);
    for (let i = 0; i < 90; i++) step({ px: ex(), py: p.y });
    const held = world.targets.find(o => o.id === t.id);
    assert.ok(hyp(held.x, held.y, p.x, p.y) <= p.r + snap, `tier ${tier}: carried near its pool`);
    ev = step({ px: ex(), py: p.y, mouse: [{ down: false, x: ex(), y: p.y }] });
    assert.ok(ev.some(e => e.t === 'home'), `tier ${tier}: let go outside its pool, within the snap, it slides in`);
    for (let i = 0; i < 30; i++) step({ px: ex(), py: p.y });
    assert.equal(world.hits, 1);
  }
});

test('drag: only tier 1 lets a click pick a turtle up and carry it to its pool', () => {
  for (const tier of [1, 2]) {
    const world = BB.create(BB.plan(W6, 0, tier), 2);
    let t;
    for (let i = 0; i < 200 && !(t = world.targets.find(o => !o.dead)); i++) BB.step(world, DT, none());
    const step = input => { BB.step(world, DT, Object.assign(none(), input)); const ev = world.ev.slice(); world.ev.length = 0; return ev; };
    const x0 = t.x, y0 = t.y;
    step({ px: x0, py: y0, mouse: [{ down: true, x: x0, y: y0 }, { down: false, x: x0, y: y0 }] });
    const p = BB.poolOf(world, t.home);
    for (let i = 0; i < 90; i++) step({ px: p.x + (p.r + 60) * Math.sign(x0 - p.x || 1), py: p.y });
    const now = world.targets.find(o => o.id === t.id);
    if (tier === 1) {
      assert.equal(world.carry, t.id, 'tier 1: the turtle rides on the pointer after a click');
      for (let i = 0; i < 90; i++) step({ px: p.x, py: p.y });
      assert.equal(world.hits, 1, 'and slides into its pool over the water');
    } else {
      assert.equal(world.carry, 0);
      assert.ok(hyp(now.x, now.y, x0, y0) < 2, 'tier 2: a click does not pick it up');
      assert.equal(world.escapes, 0, 'a click without moving is not a slip');
    }
  }
});

test('double click: the allowed gap and drift between the two clicks follow the tier', () => {
  assert.deepEqual(plain(BB.TUNE.dbl.dbl), [1.2, 0.9, 0.7, 0.55, 0.4], 'from very generous to a real double click');
  for (let tier = 1; tier <= 5; tier++) {
    const gap = BB.TUNE.dbl.dbl[tier - 1], slack = BB.TUNE.dbl.slack[tier - 1];
    for (const [delay, dx, opens] of [[gap - 0.05, 0, true], [gap + 0.06, 0, false], [0.1, Math.min(slack - 4, 30), true], [0.1, slack + 10, false]]) {
      if (slack > 200 && dx > 200) continue;
      const world = BB.create(BB.plan(W7, 0, tier), 6);
      let c;
      for (let i = 0; i < 200 && !(c = world.targets.find(o => !o.dead)); i++) BB.step(world, DT, none());
      const x0 = c.x - dx / 2;
      BB.step(world, DT, Object.assign(none(), { px: x0, py: c.y, clicks: [{ x: x0, y: c.y }] }));
      assert.equal(world.ev.filter(e => e.t === 'knock').length, 1, 'the first click knocks: the clam wiggles and one dot fills');
      world.ev.length = 0;
      for (let t = DT; t < delay - 1e-9; t += DT) { BB.step(world, DT, none()); world.ev.length = 0; }
      BB.step(world, DT, Object.assign(none(), { px: x0 + dx, py: c.y, clicks: [{ x: x0 + dx, y: c.y }] }));
      assert.equal(world.hits, opens ? 1 : 0, `tier ${tier}: second click after ${delay.toFixed(2)} s, ${dx} px away`);
    }
  }
  // At tier 1 the second click may land anywhere on the shell.
  const world = BB.create(BB.plan(W7, 0, 1), 8);
  let c;
  for (let i = 0; i < 200 && !(c = world.targets.find(o => !o.dead)); i++) BB.step(world, DT, none());
  BB.step(world, DT, Object.assign(none(), { clicks: [{ x: c.x - c.r, y: c.y }] }));
  BB.step(world, DT, Object.assign(none(), { clicks: [{ x: c.x + c.r, y: c.y }] }));
  assert.equal(world.hits, 1);
});

test('press and hold: letting go inside the ring fills it; too soon poofs, too long boings, per tier', () => {
  for (let tier = 1; tier <= 5; tier++) {
    for (const [k, result] of [[1, 'pop'], [0.35, 'poof'], [null, 'boing']]) {
      const world = BB.create(BB.plan(W8, 0, tier), 2);
      let t;
      for (let i = 0; i < 200 && !(t = world.targets.find(o => !o.dead)); i++) BB.step(world, DT, none());
      const need = BB.holdTime(tier, t.r), seen = [];
      for (let time = 0; k === null ? !seen.includes('boing') && time < 10 : time < need * k; time += DT) {
        BB.step(world, DT, Object.assign(none(), { hold: true }));
        seen.push(...world.ev.map(e => e.t)); world.ev.length = 0;
      }
      BB.step(world, DT, none());
      seen.push(...world.ev.map(e => e.t)); world.ev.length = 0;
      assert.ok(seen.includes(result), `tier ${tier}: held ${k === null ? 'on and on' : (need * k).toFixed(2) + ' s'}: ${seen.join(' ')}`);
      assert.equal(world.hits, result === 'pop' ? 1 : 0);
      if (result === 'poof') assert.equal(world.escapes, 0, 'letting go too soon costs nothing');
      if (result === 'boing') assert.equal(world.escapes, 1);
    }
    // The window to let go in shrinks with the tier, and is never shorter than a fifth of a second.
    const T = BB.TUNE.hold, win = t => 2 * T.tol[t - 1] / (T.grow[t - 1] * T.slow[t - 1]);
    assert.ok(win(tier) >= 0.2, `tier ${tier}: ${win(tier).toFixed(2)} s window`);
    if (tier > 1) assert.ok(win(tier) < win(tier - 1));
  }
  // Space or the button: the rules only see `hold`. A button still held from the last
  // bubble does not start the next one.
  const world = BB.create(BB.plan(W8, 0, 1), 1);
  for (let i = 0; i < 60 * 8; i++) { BB.step(world, DT, Object.assign(none(), { hold: true })); world.ev.length = 0; }
  assert.equal(world.hits, 0);
  assert.ok(world.targets.every(t => t.state === 'ready'), 'after a boing it waits for a new press');
});

test('arrows: the submarine moves in all four directions, bounces softly off coral, and starfish need every arrow', () => {
  const world = BB.create(BB.plan(W9, 2, 5), 3);
  assert.equal(world.walls.length, 4, 'tier 5 level 3 has corals');
  assert.equal(BB.create(BB.plan(W9, 2, 1), 3).walls.length, 0, 'tier 1 has nothing to hit');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const w2 = BB.create(BB.plan(W9, 0, 1), 1), x = w2.sub.x, y = w2.sub.y;
    for (let i = 0; i < 30; i++) BB.step(w2, DT, Object.assign(none(), { dx, dy }));
    assert.ok((w2.sub.x - x) * dx > 40 || (w2.sub.y - y) * dy > 40, `moves ${dx},${dy}`);
  }
  // Driving straight into a wall: it stays out of the coral and comes back a little.
  let bumps = 0;
  for (let i = 0; i < 120; i++) {
    BB.step(world, DT, Object.assign(none(), { dy: -1 }));
    bumps += world.ev.filter(e => e.t === 'bump').length; world.ev.length = 0;
    for (const wl of world.walls) assert.ok(!BB.wallHit(world.sub.x, world.sub.y, BB.SUB.r - 1, wl), 'never inside a coral');
  }
  assert.ok(bumps >= 1, 'a soft bump');
  // The starfish of a level come in every direction from the submarine.
  for (const tier of [1, 5]) {
    const w3 = BB.create(BB.plan(W9, 0, tier), 7), dirs = new Set(), bot = steerPlayer(1);
    while (!w3.over && w3.t < 120) {
      for (const e of w3.ev) if (e.t === 'spawn') { const vx = e.x - w3.sub.x, vy = e.y - w3.sub.y; dirs.add(Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'east' : 'west') : (vy > 0 ? 'down' : 'up')); }
      w3.ev.length = 0;
      BB.step(w3, DT, bot(w3));
    }
    assert.deepEqual([...dirs].sort(), ['down', 'east', 'up', 'west'], `tier ${tier}`);
  }
});

test('letters: only keys from the tier\'s set, never P, M, Esc or Space; tier 1 is F and J; the right key pops', () => {
  const banned = ['KeyP', 'KeyM', 'Escape', 'Space', 'Tab', 'Enter'];
  assert.deepEqual(plain(BB.letters(1, 0)), ['KeyF', 'KeyJ']);
  for (let tier = 1; tier <= 5; tier++) for (const l of [0, 1, 2, 'P']) {
    const set = BB.letters(tier, l);
    for (const code of set) {
      assert.ok(!banned.includes(code), `tier ${tier} level ${l}: ${code}`);
      assert.ok(BB.latin(code) && BB.arabic(code), `${code} has both legends`);
      assert.ok(BB.keyAt(code), `${code} is on the on-screen keyboard`);
    }
    const world = BB.create(BB.plan(W10, l, tier), tier * 10 + 1), bot = keysPlayer(1, BB.rng(2));
    while (!world.over && world.t < 60) {
      for (const t of world.targets) assert.ok(set.includes(t.code), `tier ${tier} level ${l}: a balloon carries ${t.code}`);
      const codes = world.targets.filter(t => !t.dead).map(t => t.code);
      assert.equal(new Set(codes).size, codes.length, 'never two balloons with the same key');
      BB.step(world, DT, bot(world)); world.ev.length = 0;
    }
  }
  // A wrong key costs nothing and pops nothing; the right one pops its balloon.
  const world = BB.create(BB.plan(W10, 0, 1), 1);
  let b;
  for (let i = 0; i < 300 && !(b = world.targets.find(o => !o.dead)); i++) BB.step(world, DT, none());
  world.ev.length = 0;
  BB.step(world, DT, Object.assign(none(), { keys: ['KeyQ', 'Space', b.code === 'KeyF' ? 'KeyJ' : 'KeyF'] }));
  assert.equal(world.hits, 0); assert.equal(world.escapes, 0);
  assert.equal(world.ev.filter(e => e.t === 'wrongKey').length, 3);
  BB.step(world, DT, Object.assign(none(), { keys: [b.code] }));
  assert.equal(world.hits, 1);
  // The labels the school keyboards print (Windows Arabic 101).
  const want = { KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyA: 'ش', KeyS: 'س', KeyD: 'ي',
    KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت', KeyK: 'ن', KeyL: 'م', Semicolon: 'ك', KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا', KeyN: 'ى', Comma: 'و' };
  for (const [code, ar] of Object.entries(want)) assert.equal(BB.arabic(code), ar, code);
});

test('a five-world save loads with its stars, unlocks, colour and hat, and the new worlds empty', () => {
  const old = { v: 1, stars: [[3, 3, 3], [3, 3, 2], [3, 2, 2], [2, 2, 1], [3, 3, 1]], best: [40, 31, 22, 18, 55], grip: true, color: 7, hat: 7, seenStars: 30 };
  const s = BB.loadSave(JSON.parse(JSON.stringify(old)));
  assert.equal(s.stars.length, 11); assert.equal(s.best.length, 11);
  assert.deepEqual(plain(s.stars.slice(0, 5)), old.stars);
  assert.deepEqual(plain(s.best.slice(0, 5)), old.best);
  assert.ok(s.stars.slice(5).every(r => r.join() === '0,0,0') && s.best.slice(5).every(v => v === 0));
  assert.equal(BB.total(s), 36);
  assert.equal(s.color, 7); assert.equal(s.hat, 7); assert.equal(s.grip, true); assert.equal(s.seenStars, 30);
  assert.ok(BB.worldOpen(s, 5) && !BB.worldOpen(s, 6), 'world 6 opens after world 5 level 3');
  assert.deepEqual(plain(BB.nextLevel(s)), { w: 5, l: 0 });
  // Without a star on world 5 level 3, world 6 stays shut.
  assert.ok(!BB.worldOpen(BB.loadSave({ stars: [[3, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 0]] }), 5));
  // Round trip of a full eleven-world save.
  const full = BB.freshSave();
  full.stars = full.stars.map(() => [3, 3, 3]); full.best = full.best.map((_, i) => i * 10); full.color = BB.COLORS.length - 1; full.hat = BB.HATS.length - 1;
  const back = BB.loadSave(JSON.parse(JSON.stringify(full)));
  assert.deepEqual(plain(back), plain(full));
  assert.equal(BB.total(back), BB.MAX_STARS);
  assert.deepEqual(plain(BB.nextLevel(back)), { w: 10, l: 'P' });
  assert.equal(BB.topWorld(back), 10);
});

test('rewards: the old thresholds stay; new colours and hats climb to the new maximum of 99 stars', () => {
  assert.equal(BB.MAX_STARS, 99);
  assert.deepEqual(plain(BB.COLORS.slice(0, 8).map(c => c.need)), [0, 2, 4, 7, 10, 14, 19, 26]);
  assert.deepEqual(plain(BB.HATS.slice(0, 10).map(h => h.need)), [0, 1, 3, 5, 8, 12, 17, 23, 30, 40]);
  assert.deepEqual(plain(BB.COLORS.slice(0, 8).map(c => c.c)), ['#ffd23f', '#ff7eb6', '#4fd1ff', '#5be38f', '#ff9f43', '#b48cff', '#ff5d6c', 'rainbow']);
  assert.deepEqual(plain(BB.HATS.slice(0, 10).map(h => h.id)), ['none', 'bow', 'cap', 'flower', 'party', 'crown', 'phones', 'wizard', 'astro', 'halo']);
  for (const list of [BB.COLORS, BB.HATS]) {
    for (let i = 1; i < list.length; i++) assert.ok(list[i].need > list[i - 1].need, 'thresholds climb');
    assert.ok(list.length >= (list === BB.COLORS ? 12 : 15), 'several new items');
    assert.ok(list[list.length - 1].need > 80 && list[list.length - 1].need <= BB.MAX_STARS);
  }
  assert.equal(BB.HATS[BB.HATS.length - 1].need, BB.MAX_STARS, 'the last hat needs every star');
  assert.ok(BB.unlocks(45, 99).length >= 9);
});

test('targets of the new worlds appear where a child can reach them, never under the on-screen helpers', () => {
  const mouse = BB.KEYS.mouse;
  for (let tier = 1; tier <= 5; tier++) for (const l of [0, 1, 2, 'P']) for (const seed of [1, 2, 3]) {
    // turtles: on the sand, away from the on-screen mouse and Bop, outside every pool's slide-in zone
    let world = BB.create(BB.plan(W6, l, tier), seed), bot = dragPlayer(1, BB.rng(seed));
    for (let i = 0; i < 60 * 30 && !world.over; i++) {
      for (const e of world.ev) if (e.t === 'spawn') {
        const t = world.targets.find(o => o.id === e.id);
        assert.ok(e.y >= 200 && e.y <= 650 && e.x >= 100 && e.x <= 1180, `tier ${tier}: turtle on the sand (${e.x}, ${e.y})`);
        assert.ok(!(e.x > 960 && e.y > 500) && !(e.x < 210 && e.y > 540), `tier ${tier}: turtle clear of the mouse and Bop (${e.x}, ${e.y})`);
        for (const p of world.pools) assert.ok(hyp(e.x, e.y, p.x, p.y) > p.r + BB.knob(world, 'snap') + t.r * 0.5, `tier ${tier}: a new turtle is not already home`);
      }
      world.ev.length = 0;
      BB.step(world, DT, bot(world));
    }
    // keycap balloons: above the keyboard
    world = BB.create(BB.plan(W10, l, tier), seed); bot = keysPlayer(0, BB.rng(seed));
    for (let i = 0; i < 60 * 30 && !world.over; i++) {
      for (const b of world.targets) if (!b.dead && b.arrived) assert.ok(b.y + b.r * 1.4 + 26 + b.cap <= BB.KB.y + 4, `tier ${tier}: keycap above the keyboard`);
      BB.step(world, DT, bot(world)); world.ev.length = 0;
    }
    // starfish: inside the water, clear of the corals and of the arrow keys
    world = BB.create(BB.plan(W9, l, tier), seed); bot = steerPlayer(1);
    for (let i = 0; i < 60 * 30 && !world.over; i++) {
      for (const p of world.targets) if (!p.dead && p.age === 0) {
        assert.ok(p.y < BB.KEYS.up.y - BB.KEYS.up.h / 2 - p.r, 'starfish above the arrow keys');
        for (const wl of world.walls) assert.equal(BB.wallHit(p.x, p.y, p.r, wl), null, 'starfish not in a coral');
      }
      BB.step(world, DT, bot(world)); world.ev.length = 0;
    }
  }
  assert.ok(mouse.y > BB.SUB.y1 + BB.SUB.r, 'the submarine stays above the bottom row of helpers');
});
