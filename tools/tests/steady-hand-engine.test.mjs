// Steady Hand engine (games/steady-hand/levels.js + engine.js): the level data, that every
// track is solvable at every difficulty (a bot walks each centre line with the moving
// parts' timing), the swept collision, checkpoints, doors, carry stretches, stars and saves.
// Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(repo, 'games/steady-hand');
const levelsSource = fs.readFileSync(path.join(dir, 'levels.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(levelsSource + '\n' + engineSource, sandbox);
const SH = sandbox.window.SH;
const DT = 1 / 60;
const EASY = SH.params(0), MID = SH.params(0.5), HARD = SH.params(1);
const plain = v => JSON.parse(JSON.stringify(v));
const ARABIC = /^[؀-ۿ\s]+$/;

// Steps the world with one input; returns the events of that step.
function step(w, inp = {}) {
  w.ev.length = 0;
  SH.step(w, DT, inp);
  return w.ev.slice();
}
// Picks the spark up where it is (a press on it) in a drag level.
function grab(w) { return step(w, { press: { x: w.x, y: w.y }, down: true, x: w.x, y: w.y }); }
// Moves the pointer through pts with the button held; returns every event.
function drag(w, pts, down = true) {
  const ev = [];
  for (const p of pts) ev.push(...step(w, { pts: [p], down, x: p[0], y: p[1] }));
  return ev;
}
// Points along the centre line from arc length a to b, every `gap` px.
function along(L, a, b, gap = 4) {
  const out = [];
  for (let s = a; a < b ? s <= b : s >= b; s += a < b ? gap : -gap) { const p = SH.at(L, s); out.push([p.x, p.y]); }
  return out;
}
const levelIndex = id => SH.LEVELS.findIndex(R => R.id === id);

// A bot that walks the centre line at `speed` px/s like a careful child: it presses on the
// spark, holds the button (except in no-button levels, where it holds it only through carry
// stretches), presses Space before a closed door and waits for it, and before each moving
// part it waits until a whole pass at its speed is free (checked every 2 px, like the engine).
function bot(i, P, speed, maxT = 400) {
  const w = SH.create(i, P), L = w.L, hover = L.mode === 'hover';
  const zones = L.obs.map(o => o.zone);
  const inZone = x => zones.findIndex(z => x > z[0] - 4 && x < z[1] + 4);
  const free = (from, to, t0) => {
    const n = Math.ceil((to - from) / (speed * DT));
    for (let k = 1; k <= n + 2; k++) {
      for (let e = -4; e <= speed * DT + 4; e += 2) {
        const p = SH.at(L, Math.min(L.len, from + (k - 1) * speed * DT + e));
        if (SH.moving(L, p.x, p.y, t0 + k * DT) >= 0) return false;
      }
    }
    return true;
  };
  let s = w.s, committed = -1;
  for (let n = 0; n < maxT * 60; n++) {
    const inp = { pts: [], down: !hover, press: null, x: w.x, y: w.y, door: false };
    if (hover && L.carry.some(c => s > c[0] - 50 && s < c[1] + 50)) inp.down = true;
    if (!w.held) inp.press = { x: w.x, y: w.y };
    else {
      let ns = Math.min(L.len, s + speed * DT);
      const gi = L.gates.findIndex((g, k) => g.s > s && g.s - s < 90 && w.gates[k].a < 1);
      if (gi >= 0) { inp.door = w.gates[gi].left <= 0.2; if (L.gates[gi].zone[0] - 4 < ns) ns = s; }
      const z = inZone(ns);
      if (z >= 0 && committed !== z) { if (free(s, zones[z][1] + 8, w.t)) committed = z; else ns = s; }
      if (z < 0) committed = -1;
      if (ns !== s) { s = ns; const p = SH.at(L, s); inp.pts = [[p.x, p.y]]; inp.x = p.x; inp.y = p.y; }
    }
    for (const e of step(w, inp)) if (e.t === 'touch' || e.t === 'block' || e.t === 'stuck') return { ok: false, why: e.t, at: [e.x | 0, e.y | 0], t: w.t };
    if (w.done) return { ok: true, time: w.clock, touches: w.touches, coins: w.got };
  }
  return { ok: false, why: 'timeout', s: s | 0, len: L.len | 0 };
}

test('the engine is pure: no Kit, no page, no timers, no randomness', () => {
  assert.ok(SH && SH.step && SH.build && SH.create, 'loads with only { window: {} }');
  for (const code of [engineSource, levelsSource].map(c => c.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) {
    assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
  }
});

test('five worlds of six levels, each with an Arabic name and valid parts', () => {
  assert.equal(SH.WORLDS.length, 5);
  assert.equal(SH.LEVELS.length, 30);
  SH.WORLDS.forEach(wd => { assert.match(wd.name, ARABIC); assert.match(wd.color, /^#[0-9a-f]{6}$/); });
  const ids = new Set();
  SH.LEVELS.forEach((R, i) => {
    const where = R.id;
    assert.equal(R.id, `${Math.floor(i / 6) + 1}-${i % 6 + 1}`);
    ids.add(R.id);
    assert.match(R.name, ARABIC, where);
    assert.ok(['drag', 'hover'].includes(R.mode), where);
    assert.ok(R.w >= 70 && R.w <= 130, where + ' width');
    assert.ok(Array.isArray(R.p) && R.p.length >= 3 && R.p.every(p => p.length >= 2 && p.every(Number.isFinite)), where + ' points');
    assert.ok((R.coins || []).length >= 1 && R.coins.length <= 8, where + ' coins');
    for (const q of R.slide || []) assert.ok(q.length >= 5 && Math.abs(q[2]) === 1 && q[3] > 1 && q[4] > 0.2 && q[4] < 0.8, where + ' slide');
    for (const q of R.spin || []) assert.ok(q.length >= 5 && Math.abs(q[2]) === 1 && q[3] >= 1 && q[3] <= 3 && Math.abs(q[4]) > 0.3 && Math.abs(q[4]) < 3, where + ' spin');
    for (const q of R.pulse || []) assert.ok(q.length >= 6 && q[4] > 0 && q[4] < 0.8 && q[5] > 1, where + ' pulse');
    if (R.carry) assert.equal(R.mode, 'hover', where + ': carry stretches belong to no-button levels');
  });
  assert.equal(ids.size, 30);
  // The ramp: world 1 is wide and has no machines; machines start in world 3; doors and
  // carrying in world 4; no-button levels from world 2.
  const W = k => SH.LEVELS.slice(k * 6, k * 6 + 6);
  assert.ok(W(0).every(R => R.mode === 'drag' && !R.slide && !R.spin && !R.pulse && !R.gate && R.w >= 96));
  assert.ok(W(1).some(R => R.mode === 'hover') && W(1).every(R => !R.slide && !R.spin && !R.gate));
  assert.ok(W(2).every(R => R.slide || R.spin || R.pulse));
  assert.ok(W(3).every(R => R.gate || R.carry));
  assert.ok(W(4).filter(R => [R.slide, R.spin, R.pulse, R.gate, R.carry].filter(Boolean).length >= 2).length >= 4, 'the last world mixes everything');
  const mean = k => W(k).reduce((n, R) => n + R.w, 0) / 6;
  assert.ok(mean(0) > mean(1) && mean(1) > mean(4) && mean(4) <= 82, 'tracks get narrower');
});

test('every track stays on screen below the top bar and never runs into itself, even at its widest', () => {
  SH.LEVELS.forEach((R, i) => {
    const L = SH.build(i, EASY);
    for (const p of L.pts) {
      assert.ok(p.x - p.hw >= 10 && p.x + p.hw <= 1270 && p.y - p.hw >= 92 && p.y + p.hw <= 712, `${R.id} leaves the frame at ${p.x | 0},${p.y | 0}`);
    }
    // Two stretches far apart along the track keep a wall between them (no shortcut).
    for (let a = 0; a < L.pts.length; a++) for (let b = a + 1; b < L.pts.length; b++) {
      const p = L.pts[a], q = L.pts[b];
      if (q.s - p.s <= 3 * (p.hw + q.hw) + 14) continue;
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= p.hw + q.hw + 14, `${R.id}: the track touches itself near ${p.x | 0},${p.y | 0}`);
    }
    assert.ok(L.end.x > 60 && L.end.x < 1220 && L.end.y > 140 && L.end.y < 680, `${R.id}: the lamp fits`);
  });
});

test('moving parts work on their own stretch only and stay out of the top bar', () => {
  for (const k of [0, 1]) SH.LEVELS.forEach((R, i) => {
    const L = SH.build(i, SH.params(k));
    L.obs.forEach((o, j) => {
      assert.equal(o.split, false, `${R.id} part ${j} reaches two stretches`);
      const period = o.k === 'slide' ? 1 / o.f : 2 * Math.PI / Math.abs(o.w);
      for (let n = 0; n < 72; n++) {
        const t = n * period / 72;
        const bars = o.k === 'slide' ? [SH.slideBar(o, t)] : Array.from({ length: o.arms }, (_, a) => { const an = SH.spinAngle(o, t, a); return [o.px, o.py, o.px + Math.cos(an) * o.len, o.py + Math.sin(an) * o.len]; });
        for (const b of bars) assert.ok(Math.min(b[1], b[3]) - o.th / 2 >= 84, `${R.id} part ${j} reaches the top bar`);
      }
      for (const p of L.pts) {
        if (p.s > o.zone[0] - 150 && p.s < o.zone[1] + 150) continue;
        for (const f of [-0.9, 0, 0.9]) {
          const x = p.x + p.nx * f * (p.hw - SH.RS), y = p.y + p.ny * f * (p.hw - SH.RS);
          for (let n = 0; n < 72; n++) assert.ok(!SH.hitsOne(o, x, y, n * period / 72), `${R.id} part ${j} reaches the track at ${x | 0},${y | 0}`);
        }
      }
      assert.ok(L.start.s < o.zone[0] - 20, `${R.id}: the start is clear of part ${j}`);
    });
  });
});

test('every level is solvable: a bot on the centre line lights the lamp with no touch, from a slow child to an expert', () => {
  const runs = [[0, 60], [0, 90], [0, 140], [0.5, 140], [0.5, 260], [1, 140], [1, 200], [1, 400]];
  SH.LEVELS.forEach((R, i) => {
    for (const [k, speed] of runs) {
      const r = bot(i, SH.params(k), speed);
      assert.ok(r.ok, `${R.id} at difficulty ${k}, ${speed} px/s: ${JSON.stringify(r)}`);
      assert.equal(r.touches, 0);
    }
  });
});

test('the time star is in reach: a quick, careful hand beats the clock at every difficulty', () => {
  SH.LEVELS.forEach((R, i) => {
    for (const k of [0, 0.5, 1]) {
      const L = SH.build(i, SH.params(k)), r = bot(i, SH.params(k), 230);
      assert.ok(r.ok && r.time <= L.par, `${R.id} at ${k}: ${r.time} s, par ${L.par}`);
      assert.equal(SH.stars(L, 0, r.time), 3);
    }
    // The par does not depend on the difficulty.
    assert.equal(SH.build(i, EASY).par, SH.build(i, HARD).par);
  });
});

test('the difficulty: harder means narrower tracks, faster parts, fewer checkpoints and shorter doors', () => {
  for (const key of ['width', 'open']) assert.ok(EASY[key] > MID[key] && MID[key] > HARD[key], key);
  for (const key of ['speed', 'spacing']) assert.ok(EASY[key] < MID[key] && MID[key] < HARD[key], key);
  let fewer = 0;
  SH.LEVELS.forEach((R, i) => {
    const e = SH.build(i, EASY), h = SH.build(i, HARD);
    assert.ok(e.pts[5].hw > h.pts[5].hw, R.id);
    assert.ok(e.cps.length >= h.cps.length, R.id);
    if (e.cps.length > h.cps.length) fewer++;
    e.obs.forEach((o, j) => assert.ok(o.k === 'slide' ? o.f < h.obs[j].f : Math.abs(o.w) < Math.abs(h.obs[j].w), R.id));
    // Even at its narrowest, the track leaves room around the spark, and breathing walls
    // never close on the centre line.
    for (const sg of h.segs) {
      assert.ok(sg.hw - SH.RS >= 20, `${R.id} too narrow: ${sg.hw}`);
      assert.ok(sg.hw * (1 - sg.amp) - SH.RS >= 6, `${R.id} squeezes too far`);
    }
  });
  assert.ok(fewer >= 20, 'most levels have fewer checkpoints when hard');
});

test('every checkpoint and every coin is a safe spot; coins never sit in a moving part', () => {
  for (const k of [0, 1]) SH.LEVELS.forEach((R, i) => {
    const L = SH.build(i, SH.params(k));
    L.cps.forEach((cp, j) => {
      for (let t = 0; t < 8; t += 0.05) {
        assert.ok(SH.inside(L, cp.x, cp.y, t) >= 0 && SH.moving(L, cp.x, cp.y, t) < 0, `${R.id} checkpoint ${j}`);
      }
      assert.ok(!L.zones.concat(L.carry).some(z => cp.s > z[0] - 20 && cp.s < z[1] + 20), `${R.id} checkpoint ${j} is in a zone`);
    });
    L.coins.forEach((c, j) => {
      let ok = 0, n = 0;
      for (let t = 0; t < 8; t += 0.05, n++) if (SH.inside(L, c.x, c.y, t) >= 0 && SH.moving(L, c.x, c.y, t) < 0) ok++;
      assert.ok(ok / n >= 0.3, `${R.id} coin ${j} is reachable only ${ok}/${n}`);
      assert.ok(SH.inside(L, c.x, c.y, 0) < (L.pts[0].hw - SH.RS) * 0.95 || Math.abs(c.share) < 0.2, `${R.id} coin ${j}`);
    });
  });
});

test('a drag moves the spark along the pointer\'s own path; a fast flick across a wall touches it', () => {
  const i = levelIndex('1-3'), w = SH.create(i, MID), L = w.L;
  assert.equal(L.mode, 'drag');
  assert.equal(grab(w).find(e => e.t === 'grab') ? w.held : false, true);
  drag(w, along(L, w.s, 600));
  assert.equal(w.touches, 0);
  assert.ok(w.best > 590 && w.held);
  const top = { x: w.x, y: w.y };
  // The bottom leg is straight below, across the wall: one single pointer jump there.
  const below = SH.at(L, L.len - 520);
  assert.ok(below.y - top.y > 200, 'the other leg is below');
  const ev = step(w, { pts: [[below.x, below.y]], down: true, x: below.x, y: below.y });
  const t = ev.find(e => e.t === 'touch');
  assert.ok(t, 'the flick touched the wall');
  assert.equal(t.kind, 'edge');
  assert.ok(t.hy > top.y && t.hy < below.y - 40, 'it touched the wall on its way, not the far leg');
  assert.equal(w.touches, 1);
  assert.equal(w.held, false, 'a touch drops the spark');
  assert.ok(w.best < 700, 'no progress was made by the flick');
  const home = SH.home(w);
  assert.deepEqual([w.x, w.y], [home.x, home.y], 'the spark is back at the last lantern');
  assert.ok(home.s <= 600);
});

test('a flick across the gap between two zigzag legs is caught too, and a long flick is checked all the way', () => {
  const i = levelIndex('2-1'), w = SH.create(i, HARD), L = w.L;
  grab(w);
  // From the start straight right to the next leg, across the V.
  const p = SH.at(L, L.len * 0.32);
  const ev = drag(w, [[w.x + 3, w.y], [p.x, p.y], [p.x, p.y], [p.x, p.y], [p.x, p.y], [p.x, p.y], [p.x, p.y], [p.x, p.y]]);
  assert.ok(ev.some(e => e.t === 'touch'), 'touched');
  assert.equal(w.got, 0);
  // A long, straight, legal move is clamped per step but arrives.
  const v = SH.create(levelIndex('1-1'), MID);
  grab(v);
  const far = SH.at(v.L, 260);
  const x0 = v.x;
  step(v, { pts: [[far.x, far.y]], down: true, x: far.x, y: far.y });
  assert.ok(Math.abs(Math.hypot(v.x - x0, v.y - v.L.start.y) - SH.MAX_MOVE) < 1.5 || v.touches === 0, 'one step moves at most MAX_MOVE');
  assert.ok(Math.hypot(v.x - x0, v.y - v.L.start.y) <= SH.MAX_MOVE + 0.5);
  for (let n = 0; n < 10; n++) step(v, { down: true, x: far.x, y: far.y });
  assert.ok(Math.hypot(v.x - far.x, v.y - far.y) < 1, 'and catches up with the pointer');
});

test('letting go, leaving the game and losing focus drop the spark safely where it is', () => {
  const w = SH.create(levelIndex('1-1'), MID), L = w.L;
  // A press far from the spark does not pick it up.
  step(w, { press: { x: w.x + 120, y: w.y }, down: true, x: w.x + 120, y: w.y });
  assert.equal(w.held, false);
  step(w, { down: false });
  grab(w);
  drag(w, along(L, w.s, 200));
  const at = [w.x, w.y];
  // Letting go of the button.
  let ev = step(w, { down: false, x: at[0], y: at[1] });
  assert.ok(ev.some(e => e.t === 'drop' && e.why === 'release'));
  assert.equal(w.held, false);
  assert.deepEqual([w.x, w.y], at);
  // Moving without the button does nothing in a drag level.
  step(w, { pts: [[at[0] + 30, at[1]]], down: false, x: at[0] + 30, y: at[1] });
  assert.deepEqual([w.x, w.y], at);
  // Pressing on it again picks it up (a little off its middle is fine).
  step(w, { press: { x: at[0] + 20, y: at[1] - 10 }, down: true, x: at[0] + 20, y: at[1] - 10 });
  assert.equal(w.held, true);
  // The pointer leaves the game: dropped, no touch, nothing queued moves it later.
  ev = step(w, { pts: [[at[0] + 60, at[1]]], down: true, out: true });
  assert.ok(ev.some(e => e.t === 'drop' && e.why === 'out'));
  assert.equal(w.held, false); assert.equal(w.touches, 0);
  step(w, { down: true });
  assert.equal(w.held, false);
  // A pause or a lost focus (SH.drop) is safe too.
  grab(w);
  assert.equal(w.held, true);
  SH.drop(w, 'pause');
  assert.equal(w.held, false); assert.equal(w.touches, 0); assert.equal(w.q.length, 0);
});

test('no-button levels: the pointer picks the spark up by touching it; a carry stretch needs the button held', () => {
  const i = levelIndex('4-2'), w = SH.create(i, MID), L = w.L;
  assert.equal(L.mode, 'hover');
  // Hovering near (not on) the spark does nothing; on it picks it up.
  step(w, { x: w.x + 80, y: w.y });
  assert.equal(w.held, false);
  step(w, { x: w.x + 10, y: w.y + 5 });
  assert.equal(w.held, true);
  const c = L.carry[0];
  // Moving into the carry stretch without the button stops the spark at its edge.
  let ev = [];
  for (const p of along(L, w.s, c[0] + 60)) { ev = ev.concat(step(w, { pts: [p], x: p[0], y: p[1] })); if (!w.held) break; }
  const stuck = ev.find(e => e.t === 'stuck');
  assert.ok(stuck, 'stopped at the carry stretch');
  assert.equal(w.held, false); assert.equal(w.touches, 0);
  assert.ok(w.s <= c[0] + 1 && w.s > c[0] - 20);
  // Hovering on it does not pick it up again at once (no buzzing loop)...
  const p0 = [w.x, w.y];
  for (let n = 0; n < 30; n++) assert.ok(!step(w, { x: p0[0] + (n % 3), y: p0[1] }).some(e => e.t === 'grab' || e.t === 'stuck'));
  assert.equal(w.held, false);
  // ...until the pointer has moved off it and comes back.
  step(w, { x: p0[0] - 90, y: p0[1] });
  step(w, { x: p0[0], y: p0[1] });
  assert.equal(w.held, true);
  step(w, { pts: [[p0[0] + 30, p0[1]]], x: p0[0] + 30, y: p0[1] });
  assert.equal(w.held, false, 'and it stops again at the carry stretch');
  // A press picks it up, and holding the button carries it through.
  step(w, { press: { x: p0[0], y: p0[1] }, down: true, x: p0[0], y: p0[1] });
  assert.equal(w.held, true);
  ev = drag(w, along(L, w.s, c[1] + 40), true);
  assert.ok(!ev.some(e => e.t === 'stuck' || e.t === 'touch'));
  assert.ok(w.s > c[1]);
  // Past it the button can be let go: the spark still follows the pointer.
  drag(w, along(L, w.s, L.len), false);
  assert.equal(w.done, true);
  assert.equal(w.touches, 0);
});

test('doors stop the spark without a touch; a press opens them and they never close on the spark', () => {
  const i = levelIndex('4-1'), w = SH.create(i, HARD), L = w.L, d = L.gates[0];
  step(w, { x: w.x, y: w.y });
  assert.equal(w.held, true);
  let ev = drag(w, along(L, w.s, d.s + 40), false);
  assert.ok(ev.some(e => e.t === 'block'), 'the closed door stopped it');
  assert.equal(w.touches, 0); assert.equal(w.held, false);
  assert.ok(w.s < d.s);
  // Space (or a click away from the spark) opens it; it opens fully.
  ev = step(w, { door: true });
  assert.ok(ev.some(e => e.t === 'open'));
  for (let n = 0; n < 20; n++) step(w, {});
  assert.equal(w.gates[0].a, 1);
  step(w, { x: w.x, y: w.y });
  assert.equal(w.held, true);
  // The spark waits in the doorway longer than the door stays open: it stays open.
  drag(w, along(L, w.s, d.s, 2), false);
  for (let n = 0; n < 60 * (HARD.open + 2); n++) step(w, { x: w.x, y: w.y });
  assert.equal(w.gates[0].a, 1, 'never closes on the spark');
  drag(w, along(L, w.s, d.s + 120), false);
  assert.equal(w.touches, 0);
  for (let n = 0; n < 60; n++) step(w, { x: w.x, y: w.y });
  assert.equal(w.gates[0].a, 0, 'and closes behind it');
});

test('moving parts and breathing walls touch the spark; checkpoints light in order and the spark goes back to the last one', () => {
  const i = levelIndex('3-1'), w = SH.create(i, MID), L = w.L, o = L.obs[0];
  grab(w);
  // Walk to just before the first gate and wait until it is shut, then walk into it.
  drag(w, along(L, w.s, o.zone[0] - 10));
  const lit = w.cp;
  assert.ok(lit >= 0, 'a lantern was lit on the way');
  let guard = 0;
  while (SH.slideOpen(o, w.t + DT) > 0 && guard++ < 600) step(w, { down: true, x: w.x, y: w.y });
  const ev = drag(w, along(L, w.s, o.s + 30));
  const t = ev.find(e => e.t === 'touch');
  assert.ok(t && t.kind === 'part', 'the shut gate touched the spark');
  assert.equal(w.cp, lit);
  const home = L.cps[lit];
  assert.deepEqual([w.x, w.y], [home.x, home.y]);
  // While it flies home it cannot be picked up.
  grab(w);
  assert.equal(w.held, false);
  for (let n = 0; n < 40; n++) step(w, {});
  grab(w);
  assert.equal(w.held, true);
  // Checkpoints lit along the whole way, in order.
  const v = SH.create(levelIndex('1-4'), EASY), cpEv = [];
  grab(v);
  for (const e of drag(v, along(v.L, v.s, v.L.len))) if (e.t === 'cp') cpEv.push(e.i);
  assert.deepEqual(cpEv, Array.from({ length: v.L.cps.length }, (_, k) => k));
  assert.equal(v.done, true);
  // A breathing wall squeezed in touches a spark that hugs the wall.
  const b = SH.create(levelIndex('3-3'), MID), pu = b.L.pulses[0], seg = b.L.segs.find(sg => sg.p === 0 && sg.amp > 0.4);
  const mid = SH.at(b.L, seg.s), x = mid.x + mid.nx * (mid.hw - SH.RS - 3), y = mid.y + mid.ny * (mid.hw - SH.RS - 3);
  const wide = [], narrow = [];
  for (let t = 0; t < 1 / pu.f; t += 0.05) (SH.pulseAt(pu, t) < 0.1 ? wide : SH.pulseAt(pu, t) > 0.9 ? narrow : []).push(SH.inside(b.L, x, y, t));
  assert.ok(wide.every(m => m >= 0) && narrow.every(m => m < 0));
});

test('collecting coins and lighting the lamp: stars for no touch and for the clock', () => {
  const i = levelIndex('1-1'), w = SH.create(i, MID), L = w.L;
  grab(w);
  const ev = drag(w, along(L, w.s, L.len, 6));
  assert.ok(ev.some(e => e.t === 'coin'));
  assert.equal(w.got, L.coins.length, 'the coin on the centre line was collected');
  assert.ok(ev.some(e => e.t === 'goal'));
  assert.equal(w.done, true); assert.equal(w.held, false);
  assert.ok(w.clock > 0 && w.clock < L.par);
  assert.equal(SH.stars(L, 0, w.clock), 3);
  assert.equal(SH.stars(L, 1, w.clock), 2);
  assert.equal(SH.stars(L, 0, L.par + 1), 2);
  assert.equal(SH.stars(L, 4, L.par + 9), 1);
  // Nothing moves after the lamp is lit.
  const at = [w.x, w.y];
  step(w, { pts: [[at[0] - 50, at[1]]], down: true, press: { x: at[0], y: at[1] } });
  assert.deepEqual([w.x, w.y], at);
  // The clock waits for the first grab.
  const v = SH.create(i, MID);
  for (let n = 0; n < 120; n++) step(v, {});
  assert.equal(v.clock, 0); assert.ok(v.t > 1.9);
  // Difficulty outcomes: 0..1, fewer touches is better, leaving half way counts less.
  assert.equal(SH.outcome(true, 0), 1);
  assert.ok(SH.outcome(true, 2) < SH.outcome(true, 1));
  assert.ok(SH.outcome(true, 9) >= 0.1 && SH.outcome(true, 9) < 0.3);
  assert.ok(SH.outcome(false, 1) < SH.outcome(true, 1));
  assert.ok(SH.outcome(false, 9) >= 0);
});

test('points the pointer passed before the spark was picked up are not followed', () => {
  // A slow frame: the pointer came from outside the track (through the wall) onto the
  // spark. Picking it up must not drag it back along that way into the wall.
  const w = SH.create(levelIndex('2-3'), MID);
  const x = w.x, y = w.y;
  const ev = step(w, { pts: [[x, y + 160], [x, y + 80], [x, y]], x: x, y: y });
  assert.ok(ev.some(e => e.t === 'grab'));
  assert.equal(w.touches, 0); assert.equal(w.held, true);
  assert.deepEqual([w.x, w.y], [x, y]);
  // The same with a press in a drag level.
  const v = SH.create(levelIndex('1-2'), MID), vx = v.x, vy = v.y;
  step(v, { pts: [[vx + 200, vy - 200], [vx, vy]], press: { x: vx, y: vy }, down: true, x: vx, y: vy });
  assert.equal(v.touches, 0); assert.equal(v.held, true);
});

test('the pointer queue is capped, so a wild wiggle never piles up', () => {
  const w = SH.create(levelIndex('1-1'), MID);
  grab(w);
  const pts = [];
  for (let n = 0; n < 500; n++) pts.push([w.x + (n % 2 ? 2 : -2), w.y]);
  step(w, { pts, down: true });
  assert.ok(w.q.length <= SH.QUEUE);
});

test('saves: a fresh save, and old, damaged or hand-edited saves load as playable ones', () => {
  const fresh = plain(SH.freshSave());
  assert.equal(fresh.lv.length, 30);
  assert.deepEqual(fresh.colors[0], 1); assert.equal(fresh.trails[0], 1);
  for (const raw of [null, undefined, 'x', 7, [], {}, { v: 2, coins: 5 }, { v: 1, lv: 'no' }, { v: 1, lv: [null, 4, { s: 'a' }] }]) {
    const s = plain(SH.loadSave(raw));
    assert.deepEqual(s, fresh, JSON.stringify(raw));
  }
  const edited = plain(SH.loadSave({
    v: 1, coins: -3, color: 4, trail: 1, coach: 'yes', colors: [0, 1, 0, 0, 0], trails: [0, 1],
    lv: [{ s: 3, t: 95, c: 255 }, { s: 0, t: 50, c: 1 }, { s: 9, t: 10, c: 0 }, { s: 2, t: 1.5, c: 1 }]
  }));
  assert.deepEqual(edited.lv[0], { s: 3, t: 95, c: (1 << SH.LEVELS[0].coins.length) - 1 }, 'coin bits beyond the level\'s coins are dropped');
  assert.deepEqual(edited.lv[1], { s: 0, t: 0, c: 1 }, 'no time without a lit lamp');
  assert.deepEqual(edited.lv[2], { s: 0, t: 0, c: 0 });
  assert.deepEqual(edited.lv[3], { s: 2, t: 0, c: 1 });
  assert.equal(edited.coins, 0);
  assert.equal(edited.color, 0, 'a colour that is not owned is not worn');
  assert.equal(edited.trail, 1);
  assert.deepEqual(edited.colors.slice(0, 2), [1, 1], 'the first colour is always owned');
  assert.equal(edited.coach, false);
  // A good save round-trips.
  const good = SH.freshSave();
  good.lv[0] = { s: 3, t: 87, c: 1 }; good.coins = 12; good.colors[2] = 1; good.color = 2; good.coach = true;
  assert.deepEqual(plain(SH.loadSave(JSON.parse(JSON.stringify(good)))), plain(good));
});

test('results: stars and best times are kept, new coins count once, the next level and world open; the shop', () => {
  const s = SH.freshSave();
  assert.equal(SH.isOpen(s, 0), true); assert.equal(SH.isOpen(s, 1), false);
  assert.equal(SH.nextLevel(s), 0);
  let r = SH.applyResult(s, 0, 2, 9.31, [true]);
  assert.deepEqual(plain(r), { first: true, best: false, moreStars: true, coins: 1, opened: 1, world: -1 });
  assert.deepEqual(plain(s.lv[0]), { s: 2, t: 94, c: 1 });
  assert.equal(s.coins, 1);
  assert.equal(SH.isOpen(s, 1), true); assert.equal(SH.nextLevel(s), 1);
  r = SH.applyResult(s, 0, 1, 12, [true]);
  assert.equal(r.coins, 0, 'a coin is counted once');
  assert.equal(r.best, false);
  assert.equal(s.lv[0].s, 2, 'stars never go down');
  r = SH.applyResult(s, 0, 3, 8, [false]);
  assert.equal(r.best, true);
  assert.deepEqual(plain(s.lv[0]), { s: 3, t: 80, c: 1 });
  for (let i = 1; i < 5; i++) SH.applyResult(s, i, 1, 20, []);
  r = SH.applyResult(s, 5, 1, 20, []);
  assert.equal(r.opened, 6); assert.equal(r.world, 1, 'the next world opens');
  assert.equal(SH.totalStars(s), 3 + 5);
  // The shop.
  s.coins = 4;
  assert.equal(SH.buy(s, 'color', 3), '', 'too few coins');
  assert.equal(SH.buy(s, 'color', 2), 'bought');
  assert.equal(s.coins, 1); assert.equal(s.color, 2); assert.equal(s.colors[2], 1);
  assert.equal(SH.buy(s, 'color', 0), 'wear'); assert.equal(s.color, 0);
  assert.equal(SH.buy(s, 'trail', 1), '');
  assert.equal(SH.buy(s, 'trail', 99), '');
  const total = SH.LEVELS.reduce((n, R) => n + R.coins.length, 0), prices = SH.COLORS.concat(SH.TRAILS).reduce((n, c) => n + c.price, 0);
  assert.ok(prices <= total, `everything can be bought: ${prices} coins of ${total}`);
});
