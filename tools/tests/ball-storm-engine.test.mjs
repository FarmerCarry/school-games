// Ball Storm's pure engine in Node: the level pictures, serving, the paddle, bricks
// (jelly, tough, steel, TNT, gems), capsules (×3, +10, power-ups), ×2 rings, the ball cap,
// bubble floors, lives, winning and losing, the endless wall, save repair and unlocks,
// a scripted good player on every level, a sloppy one on level 1 and a gentle ramp to level 4.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sources = ['levels.js', 'engine.js'].map(f => [f, readFileSync(path.join(repo, 'games/ball-storm', f), 'utf8')]);
const context = { window: {} };
vm.createContext(context);
for (const [f, src] of sources) vm.runInContext(src, context, { filename: f });
const BS = context.window.BS;
const { F, T } = BS;
const DT = 1 / 60;
const MID = { speed: 470, paddle: 175, drop: 0.085, magnet: 0.3 };
const HARD = { speed: 560, paddle: 150, drop: 0.05, magnet: 0 };
const world = (level, extra = {}) => BS.create(Object.assign({ level, seed: 5 }, MID, extra));
const idle = () => ({ dir: 0, target: null, launch: false });

// Steps until something happens (or the time runs out) and collects the events.
function run(w, { seconds = 30, until = () => false, input = idle } = {}) {
  const events = [];
  for (let i = 0; i < seconds * 60; i++) {
    BS.step(w, DT, input(w));
    events.push(...w.ev);
    if (until(w, events)) break;
  }
  return events;
}
// An empty field (nothing to hit) with one ball placed by hand.
function bare(level = 3, extra) {
  const w = world(level, extra);
  w.type.fill(0); w.hp.fill(0); w.left = 0; w.rings.length = 0;
  BS.step(w, DT, { dir: 0, target: null, launch: true });
  return w;
}
function placeBall(w, x, y, dx, dy, i = 0) {
  const l = Math.hypot(dx, dy);
  w.x[i] = x; w.y[i] = y; w.dx[i] = dx / l; w.dy[i] = dy / l; w.combo[i] = 0; w.inRing[i] = -1; w.stuck[i] = 0;
}
function brick(w, c, r, t = T.JELLY, hp = 1) {
  const k = r * F.COLS + c;
  w.type[k] = t; w.hp[k] = hp; w.max[k] = hp; w.col[k] = 2; w.gem[k] = 0;
  if (t !== T.STEEL) w.left++;
  return k;
}
const cellCenter = (w, c, r) => ({ x: F.GX + c * F.CW + F.CW / 2, y: w.oy + r * F.CH + F.CH / 2 });
const count = (events, type) => events.filter(e => e.type === type).length;

// The good player: under the lowest falling ball (where it will land), a capsule when no
// ball is close, and an early launch.
function good(w) {
  let best = -1, by = -1;
  for (let i = 0; i < w.n; i++) if (w.dy[i] > 0 && w.y[i] > by && !w.stuck[i]) { by = w.y[i]; best = i; }
  let target = null;
  if (best >= 0) {
    const t = (F.PY - F.RAD - w.y[best]) / w.dy[best];
    let x = w.x[best] + w.dx[best] * t;
    const lo = F.L + F.RAD, span = F.R - F.RAD - lo;
    x -= lo; x = ((x % (2 * span)) + 2 * span) % (2 * span); if (x > span) x = 2 * span - x; x += lo;
    target = x + (w.t % 4 < 2 ? 0.35 : -0.35) * w.pw / 2;
  }
  const cap = w.caps.filter(c => c.y > 450).sort((a, b) => b.y - a.y)[0];
  if (cap && (best < 0 || by < 420)) target = cap.x;
  return { dir: 0, target: target == null ? w.px : target, launch: !w.launched && w.t > 0.5 };
}
function mulberry(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// The sloppy player mashes random arrow keys and sometimes Space.
function sloppy(seed) {
  const rng = mulberry(seed);
  let dir = 0, until = 0;
  return w => {
    if (w.t > until) { dir = [-1, 0, 1][Math.floor(rng() * 3)]; until = w.t + 0.3 + rng() * 1.5; }
    return { dir, target: null, launch: rng() < 0.01 };
  };
}
// The weak aimer re-aims at the lowest falling ball only every 0.6 s, and misses by up to 80 px.
function weak(seed) {
  const rng = mulberry(seed);
  let target = 640, next = 0;
  return w => {
    if (w.t > next) {
      next = w.t + 0.6;
      let best = -1, by = -1;
      for (let i = 0; i < w.n; i++) if (w.dy[i] > 0 && w.y[i] > by) { by = w.y[i]; best = i; }
      if (best >= 0) target = w.x[best] + (rng() - 0.5) * 160;
    }
    return { dir: 0, target, launch: rng() < 0.01 };
  };
}
function playOut(w, input, seconds = 400) {
  run(w, { seconds, input, until: x => x.phase === 'won' || x.phase === 'lost' });
  return w;
}

test('the engine and the levels are pure: no DOM, no Kit, no timers, no dates, no Math.random', () => {
  for (const [f, src] of sources) {
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /Math\.random|document\.|Kit\.|setTimeout|setInterval|localStorage|requestAnimationFrame|Date\.now|new Date|performance\./, f);
  }
});

test('15 picture levels in 3 worlds: known bricks only, inside the field, rings clear of the walls', () => {
  assert.equal(BS.LEVELS.length, 15);
  assert.equal(BS.WORLDS.length, 3);
  let lastSpeed = 0;
  BS.LEVELS.forEach((spec, i) => {
    const name = 'L' + (i + 1);
    assert.equal(spec.world, Math.floor(i / 5), name);
    assert.ok(typeof spec.name === 'string' && spec.name.length > 1, name);
    assert.ok(spec.rows.length <= 9, name + ' fits above the paddle');
    for (const row of spec.rows) {
      assert.ok(row.length <= F.COLS, name + ' width');
      assert.match(row, /^[.roygcbvpwknROYGCBVPWKN&#t*3+x]+$/, name + ' characters');
    }
    assert.ok(BS.count(spec) >= 30, name + ' has a real picture');
    assert.ok(spec.speed >= lastSpeed, name + ' is not slower than the level before');
    lastSpeed = spec.speed;
    assert.ok(spec.par >= 45 && spec.par <= 240, name + ' par');
    assert.ok(spec.floor === 'perm' || (Number.isInteger(spec.floor) && spec.floor >= 0), name + ' floor');
    assert.ok(spec.first === null || BS.KINDS.includes(spec.first), name + ' first drop');
    const w = world(i + 1);
    assert.equal(w.left, BS.count(spec), name + ' bricks on the grid');
    for (const g of w.rings) {
      assert.ok(g.x - F.RING_R >= F.L && g.x + F.RING_R <= F.R, name + ' ring inside the walls');
      assert.ok(g.y + F.RING_R < F.DANGER, name + ' ring above the line');
    }
  });
  assert.equal(BS.LEVELS[0].floor, 'perm', 'level 1 has a bubble floor that never pops');
  assert.equal(BS.LEVELS[0].first, 'x3', 'the very first brick of the game drops ×3');
});

test('serving: the ball waits on the paddle, Space launches it at the bricks, or it goes by itself', () => {
  const w = world(3);
  assert.equal(w.n, 1);
  assert.equal(w.launched, false);
  run(w, { seconds: 1, input: () => ({ dir: 1, target: null, launch: false }) });
  assert.equal(w.launched, false);
  assert.equal(w.x[0], w.px, 'the ball rides on the paddle');
  const ev = run(w, { seconds: 1 / 60, input: () => ({ dir: 0, target: null, launch: true }) });
  assert.equal(w.launched, true);
  assert.equal(ev.find(e => e.type === 'launch').auto, false);
  assert.ok(w.dy[0] < -0.6, 'up and away');
  // Flies at a brick: the first thing it touches is the picture.
  const hit = run(w, { seconds: 3, until: (x, e) => e.some(v => v.type === 'pop' || v.type === 'hit' || v.type === 'clang') });
  assert.ok(hit.some(v => v.type === 'pop' || v.type === 'hit'), 'the serve hits the picture');

  const auto = world(3);
  const ev2 = run(auto, { seconds: F.SERVE + 0.1, until: x => x.launched });
  assert.equal(auto.launched, true, 'it serves by itself after a few seconds');
  assert.equal(ev2.find(e => e.type === 'launch').auto, true);
});

test('the paddle: keys move it at a steady speed, the mouse pulls it to the pointer, the walls stop it', () => {
  const w = world(3);
  const x0 = w.px;
  run(w, { seconds: 0.25, input: () => ({ dir: 1, target: null, launch: false }) });
  assert.ok(Math.abs(w.px - x0 - 250) < 2, 'keys: 1000 px/s');
  run(w, { seconds: 2, input: () => ({ dir: 1, target: null, launch: false }) });
  assert.equal(w.px, F.R - w.pw / 2, 'the right wall stops it');
  run(w, { seconds: 0.5, input: () => ({ dir: 0, target: 300, launch: false }) });
  assert.equal(w.px, 300, 'the mouse: straight to the pointer');
  run(w, { seconds: 0.5, input: () => ({ dir: 0, target: -500, launch: false }) });
  assert.equal(w.px, F.L + w.pw / 2);
  assert.ok(w.moves > 0);
  assert.ok(world(1).pw > world(3).pw && world(3).pw > world(15).pw, 'level 1 has the widest paddle');
});

test('the paddle bounces balls up, and where it hits sets the angle', () => {
  for (const [off, side] of [[0, 0], [60, 1], [-60, -1]]) {
    const w = bare();
    w.px = 640;
    placeBall(w, 640 + off, F.PY - 40, 0.1, 1);
    const ev = run(w, { seconds: 0.5, until: x => x.dy[0] < 0 });
    assert.ok(w.dy[0] < 0, 'bounced up');
    assert.equal(count(ev, 'pad'), 1);
    if (side) assert.equal(Math.sign(w.dx[0]), side, 'off-centre hits angle out');
    else assert.ok(Math.abs(w.dx[0]) < 0.2, 'the middle sends it nearly straight up');
  }
});

test('bricks: jelly pops, tough takes more hits, steel never breaks, TNT pops its neighbours', () => {
  let w = bare();
  let k = brick(w, 10, 5);
  let c = cellCenter(w, 10, 5);
  placeBall(w, c.x, c.y + 60, 0.05, -1);
  let ev = run(w, { seconds: 1, until: (x, e) => e.some(v => v.type === 'pop') });
  assert.equal(w.type[k], 0, 'jelly pops in one hit');
  assert.equal(w.left, 0);
  assert.ok(w.score >= 100);
  assert.ok(w.dy[0] > 0, 'and the ball bounces off it');

  w = bare();
  k = brick(w, 10, 5, T.TOUGH, 2);
  c = cellCenter(w, 10, 5);
  placeBall(w, c.x, c.y + 60, 0.05, -1);
  ev = run(w, { seconds: 1, until: (x, e) => e.some(v => v.type === 'hit') });
  assert.equal(w.type[k], T.TOUGH);
  assert.equal(w.hp[k], 1, 'tough loses one hit point');
  placeBall(w, c.x, c.y + 60, 0.05, -1);
  run(w, { seconds: 1, until: (x, e) => e.some(v => v.type === 'pop') });
  assert.equal(w.type[k], 0, 'and pops on the second');

  w = bare();
  k = brick(w, 10, 5, T.STEEL);
  c = cellCenter(w, 10, 5);
  assert.equal(w.left, 0, 'steel does not count');
  for (let i = 0; i < 3; i++) {
    placeBall(w, c.x, c.y + 60, 0.05, -1);
    ev = run(w, { seconds: 1, until: (x, e) => e.some(v => v.type === 'clang') });
    assert.equal(count(ev, 'clang'), 1);
  }
  assert.equal(w.type[k], T.STEEL, 'steel never breaks');
  w.pow.fire = 5;
  placeBall(w, c.x, c.y + 60, 0.05, -1);
  run(w, { seconds: 0.5 });
  assert.equal(w.type[k], T.STEEL, 'not even for a fireball');

  w = bare();
  const tnt = brick(w, 10, 5, T.TNT);
  const near = [brick(w, 9, 4), brick(w, 11, 6, T.TOUGH, 3), brick(w, 10, 4)];
  const far = brick(w, 13, 5);
  const steel = brick(w, 9, 6, T.STEEL);
  c = cellCenter(w, 10, 5);
  placeBall(w, c.x, c.y + 60, 0.05, -1);
  ev = run(w, { seconds: 1, until: (x, e) => e.some(v => v.type === 'boom') });
  assert.equal(w.type[tnt], 0);
  for (const n of near) assert.equal(w.type[n], 0, 'neighbours pop, tough ones too');
  assert.equal(w.type[far], T.JELLY, 'only the eight around it');
  assert.equal(w.type[steel], T.STEEL);
});

test('a fireball pops tough bricks at once and flies straight through them', () => {
  const w = bare();
  const ks = [5, 4, 3].map(r => brick(w, 10, r, T.TOUGH, 3));
  const c = cellCenter(w, 10, 5);
  w.pow.fire = 5;
  placeBall(w, c.x, c.y + 60, 0.02, -1);
  run(w, { seconds: 0.4 });
  for (const k of ks) assert.equal(w.type[k], 0);
  assert.ok(w.dy[0] < 0, 'still flying up');
});

test('combos: every brick a ball pops before it gets back to the paddle scores more', () => {
  const w = bare();
  w.pow.fire = 5;
  for (let r = 1; r <= 6; r++) brick(w, 10, r);
  const c = cellCenter(w, 10, 6);
  placeBall(w, c.x, c.y + 60, 0.02, -1);
  const ev = run(w, { seconds: 1 });
  const pops = ev.filter(e => e.type === 'pop');
  assert.equal(pops.length, 6);
  assert.deepEqual(pops.map(p => p.combo), [1, 2, 3, 4, 5, 6]);
  assert.ok(pops[5].pts === 6 * pops[0].pts);
  assert.equal(count(ev, 'combo'), 1, 'a combo cheer at 5');
});

test('capsules: ×3 triples every ball, +10 adds ten, power-ups run for a while', () => {
  const w = bare();
  w.magnet = 0;
  placeBall(w, 300, 300, 0.3, -1);
  const catchIt = kind => { w.caps.push({ x: w.px, y: F.PY - 8, kind, t: 0 }); return run(w, { seconds: 1 / 60 }); };
  let ev = catchIt('x3');
  assert.equal(w.n, 3);
  assert.equal(ev.find(e => e.type === 'power').added, 2);
  catchIt('x3');
  assert.equal(w.n, 9);
  catchIt('plus');
  assert.equal(w.n, 19);
  const narrow = w.pw;
  catchIt('big');
  run(w, { seconds: 1 });
  assert.ok(w.pw > narrow * 1.4, 'big paddle');
  assert.ok(w.pow.big > 10);
  ev = run(w, { seconds: BS.POW.big });
  assert.ok(ev.some(e => e.type === 'expire' && e.kind === 'big'));
  run(w, { seconds: 1 });
  assert.equal(w.pw, w.pwBase, 'back to normal');
  const s0 = w.speed;
  catchIt('slow');
  run(w, { seconds: 1 / 60 });
  assert.ok(w.speed < s0 * 0.7, 'slow motion');
  // A missed capsule just falls away.
  w.caps.push({ x: w.px > 640 ? 100 : 1200, y: 600, kind: 'x3', t: 0 });
  ev = run(w, { seconds: 1.5, until: (x, e) => e.some(v => v.type === 'capMiss') });
  assert.equal(count(ev, 'capMiss'), 1);
});

test('the storm stops at 500 balls', () => {
  const w = bare(1);
  placeBall(w, 640, 300, 0.3, -1);
  for (let i = 0; i < 8; i++) { w.caps.push({ x: w.px, y: F.PY - 8, kind: 'x3', t: 0 }); BS.step(w, DT, idle()); }
  assert.equal(w.n, F.CAP);
  assert.equal(w.maxBalls, F.CAP);
  run(w, { seconds: 2 });
  assert.ok(w.n <= F.CAP);
});

test('a ×2 ring gives every ball that flies into it a twin, then fades after a while', () => {
  const w = bare();
  const at = cellCenter(w, 10, 6);
  w.rings.push({ c: 10, r: 6, x: at.x, y: at.y, life: -1, id: 99 });
  const g = w.rings[0];
  placeBall(w, g.x, g.y + 80, 0.01, -1);
  let ev = run(w, { seconds: 0.4, until: (x, e) => e.some(v => v.type === 'ring') });
  assert.equal(w.n, 2, 'one twin');
  assert.equal(count(ev, 'ringOn'), 1);
  run(w, { seconds: 0.2 });
  assert.equal(w.n, 2, 'only once per pass');
  ev = run(w, { seconds: F.RING_LIFE, until: (x, e) => e.some(v => v.type === 'ringGone') });
  assert.equal(count(ev, 'ringGone'), 1);
  assert.equal(w.rings.length, 0);
});

test('sticky paddle: balls stick and fly again on Space (or by themselves)', () => {
  const w = bare();
  w.pow.sticky = 8;
  w.px = 640;
  placeBall(w, 660, F.PY - 40, 0, 1);
  run(w, { seconds: 0.5, until: x => x.stuckN > 0 });
  assert.equal(w.stuckN, 1);
  run(w, { seconds: 0.5, input: () => ({ dir: -1, target: null, launch: false }) });
  assert.equal(w.stuckN, 1);
  assert.ok(Math.abs(w.x[0] - w.px - 20) < 1, 'rides along');
  run(w, { seconds: 1 / 60, input: () => ({ dir: 0, target: null, launch: true }) });
  assert.equal(w.stuckN, 0);
  assert.ok(w.dy[0] < 0 && w.dx[0] > 0);
  placeBall(w, w.px, F.PY - 40, 0, 1);
  run(w, { seconds: 0.5, until: x => x.stuckN > 0 });
  run(w, { seconds: 2.5 });
  assert.equal(w.stuckN, 0, 'lets go after a moment');
});

test('bubble floors: level 1 never pops, level 2 pops after five bounces, a shield is a floor too', () => {
  const w1 = world(1);
  w1.px = 200;
  const ev = run(w1, { seconds: 120, input: () => ({ dir: 0, target: 200, launch: true }) });
  assert.equal(count(ev, 'life'), 0, 'level 1: no ball is ever lost');
  assert.ok(count(ev, 'floor') > 5);

  const w2 = bare(2);
  w2.floorHits = 5; w2.px = 1100;
  const ev2 = [];
  for (let i = 0; i < 5; i++) { placeBall(w2, 300, 640, 0.2, 1); ev2.push(...run(w2, { seconds: 0.3, input: () => ({ dir: 0, target: 1100, launch: false }), until: (x, e) => e.some(v => v.type === 'floor') })); }
  assert.equal(count(ev2, 'floor'), 5);
  assert.equal(count(ev2, 'floorPop'), 1);
  placeBall(w2, 300, 640, 0.2, 1);
  const ev3 = run(w2, { seconds: 1, input: () => ({ dir: 0, target: 1100, launch: false }), until: (x, e) => e.some(v => v.type === 'life') });
  assert.equal(count(ev3, 'life'), 1, 'now it falls through');

  const w3 = bare();
  w3.pow.shield = 5; w3.px = 1100;
  placeBall(w3, 300, 640, 0.2, 1);
  const ev4 = run(w3, { seconds: 0.5, input: () => ({ dir: 0, target: 1100, launch: false }) });
  assert.equal(count(ev4, 'floor'), 1);
  assert.equal(w3.n, 1);
});

test('lives: the last ball falling costs a life and serves again; no lives left is a loss', () => {
  const w = world(6);
  const away = () => ({ dir: 0, target: w.x[0] < 640 ? 1200 : 80, launch: false });
  let ev = run(w, { seconds: 1 / 60, input: () => ({ dir: 0, target: null, launch: true }) });
  w.caps.length = 0; w.first = null; w.drop = 0;
  ev = run(w, { seconds: 60, input: away, until: (x, e) => e.some(v => v.type === 'life') });
  assert.equal(w.lives, 2);
  assert.ok(ev.some(e => e.type === 'serve'));
  assert.equal(w.launched, false);
  assert.equal(w.n, 1);
  ev = run(w, { seconds: 200, input: away, until: x => x.phase === 'lost' });
  assert.equal(w.phase, 'lost');
  assert.equal(w.lives, 0);
  assert.equal(ev.find(e => e.type === 'over').reason, 'balls');
  assert.equal(ev.find(e => e.type === 'result').won, false);
  const before = JSON.stringify([w.score, w.t]);
  BS.step(w, DT, { dir: 1, target: null, launch: true });
  assert.equal(w.phase, 'lost', 'a finished round stays finished');
  assert.equal(w.score, JSON.parse(before)[0]);
});

test('clearing the picture wins: a moment of celebration, then the result and the stars', () => {
  const w = world(4);
  w.par = 0;
  for (let k = 0; k < w.type.length; k++) if (w.type[k] && w.type[k] !== T.STEEL) { w.type[k] = 0; w.left--; }
  const k = brick(w, 10, 8);
  const c = cellCenter(w, 10, 8);
  BS.step(w, DT, { dir: 0, target: null, launch: true });
  placeBall(w, c.x, c.y + 60, 0.02, -1);
  const ev = run(w, { seconds: 5, until: x => x.phase === 'won' });
  assert.equal(w.type[k], 0);
  assert.ok(ev.some(e => e.type === 'clear'));
  assert.equal(w.phase, 'won');
  assert.equal(ev.find(e => e.type === 'result').won, true);
  assert.equal(BS.stars(w), 3, 'no life lost and fast');
  w.lives = 2;
  assert.equal(BS.stars(w), 2);
  w.clearAt = w.spec.par + 1;
  assert.equal(BS.stars(w), 1, 'a win is always a star');
});

test('the same seed and the same input play the same game', () => {
  const a = playOut(world(7, { seed: 11 }), good, 60);
  const b = playOut(world(7, { seed: 11 }), good, 60);
  assert.deepEqual([a.phase, a.t, a.score, a.lives, a.maxBalls], [b.phase, b.t, b.score, b.lives, b.maxBalls]);
});

test('endless: the wall slides down, an empty field refills fast with a bonus, the line ends it', () => {
  const w = BS.create({ level: 0, seed: 3, speed: 470, paddle: 175, descent: 4 });
  assert.equal(w.endless, true);
  assert.ok(w.left >= 50, 'starts with a full wall');
  const oy = w.oy;
  run(w, { seconds: 2 });
  assert.ok(w.oy > oy, 'sliding down');
  // Everything popped: a wipe bonus (once) and new rows rush in.
  w.type.fill(0); w.left = 0;
  const score = w.score;
  const ev = run(w, { seconds: 3 });
  assert.equal(count(ev, 'wipe'), 1);
  assert.ok(w.score >= score + 1000);
  assert.ok(count(ev, 'row') >= 3, 'rows rush in');
  assert.ok(w.left > 20);
  // Nobody plays: the wall reaches the line above the paddle.
  const ev2 = run(w, { seconds: 600, until: x => x.phase === 'lost' });
  assert.equal(w.phase, 'lost');
  assert.ok(ev2.some(e => e.type === 'over'));
  assert.equal(BS.stars(w), 0);
});

test('endless lasts a while for a good player and the storm thins out again', () => {
  for (const seed of [1, 2, 3]) {
    const w = BS.create({ level: 0, seed, speed: 470, paddle: 175, drop: 0.085, magnet: 0.3, descent: 5 });
    playOut(w, good, 1500);
    assert.equal(w.phase, 'lost', 'it ends');
    assert.ok(w.t > 60, 'seed ' + seed + ' lasted ' + w.t.toFixed(0) + ' s');
  }
});

test('every level is won by a scripted good player, even on the hardest settings', () => {
  for (const params of [MID, HARD]) {
    for (let level = 1; level <= 15; level++) {
      for (const seed of [1, 2]) {
        const w = playOut(BS.create(Object.assign({ level, seed }, params)), good, 400);
        assert.equal(w.phase, 'won', `L${level} seed ${seed} speed ${params.speed}: ${w.left} left after ${w.t.toFixed(0)} s`);
      }
    }
  }
});

test('no cliff after the easy levels: the helpers ease off over levels 1-3 and a weak aimer wins level 3 more often than level 4', () => {
  const pw = [1, 2, 3, 4].map(level => world(level).pwBase);
  assert.ok(pw[0] > pw[1] && pw[1] > pw[2] && pw[2] > pw[3], 'the paddle bonus steps down: ' + pw);
  assert.equal(BS.LEVELS[2].first, 'plus', 'level 3 opens with +10 balls');
  // game.js at a difficulty of 0.4 (a child who has just won level 1): the capsule magnet
  // is 0.9 on levels 1-2, at least 0.6 on level 3, and follows the difficulty after that.
  const at = (level, seed) => BS.create({ level, seed, speed: 452, paddle: 180, drop: 0.092, magnet: [0.9, 0.9, 0.6][level - 1] || 0.36 });
  const wins = level => { let n = 0; for (let s = 1; s <= 40; s++) if (playOut(at(level, s * 104729), weak(s)).phase === 'won') n++; return n; };
  const l2 = wins(2), l3 = wins(3), l4 = wins(4);
  assert.ok(l2 >= l3 && l3 > l4, `wins out of 40: L2 ${l2}, L3 ${l3}, L4 ${l4}`);
  assert.ok(l3 >= 28, 'L3 ' + l3 + '/40');
});

test('level 1 is won by a sloppy random player (and by one who does nothing) in nearly every seed', () => {
  let wins = 0, idleWins = 0;
  for (let seed = 1; seed <= 20; seed++) {
    if (playOut(world(1, { seed }), sloppy(seed), 300).phase === 'won') wins++;
    if (seed <= 6 && playOut(world(1, { seed }), idle, 300).phase === 'won') idleWins++;
  }
  assert.ok(wins >= 19, 'sloppy wins ' + wins + '/20');
  assert.ok(idleWins >= 5, 'idle wins ' + idleWins + '/6');
});

test('saves: a fresh save, and anything broken is repaired field by field', () => {
  const s = BS.newSave();
  assert.deepEqual(Object.keys(s).sort(), ['ball', 'best', 'coach', 'endless', 'paddle', 'seen', 'stars', 'storm', 'v']);
  assert.equal(s.stars.length, 15);
  for (const raw of [null, undefined, 'x', 42, [], [1, 2], true]) assert.equal(JSON.stringify(BS.loadSave(raw)), JSON.stringify(s), String(raw));
  const fixed = BS.loadSave({
    v: 1, stars: [3, 9, -1, 'x', 2.7, null], best: [100, -5, NaN, 1e20], endless: -3, storm: 99999,
    coach: 'yes', seen: 5000, ball: 6, paddle: 'cat', extra: 'junk'
  });
  assert.deepEqual(Array.from(fixed.stars.slice(0, 6)), [3, 0, 0, 0, 2, 0]);
  assert.equal(fixed.stars.length, 15);
  assert.deepEqual(Array.from(fixed.best.slice(0, 4)), [100, 0, 0, 0]);
  assert.equal(fixed.endless, 0);
  assert.equal(fixed.storm, 1);
  assert.equal(fixed.coach, false);
  assert.equal(fixed.seen, 0);
  assert.equal(fixed.ball, 0, 'a ball the stars do not pay for is taken off');
  assert.equal(fixed.paddle, 0);
  assert.equal(fixed.extra, undefined);
  const ok = { v: 1, stars: Array(15).fill(3), best: Array(15).fill(5000), endless: 123456, ball: 6, paddle: 4, coach: true, storm: 500, seen: 10 };
  assert.equal(JSON.stringify(BS.loadSave(JSON.parse(JSON.stringify(ok)))), JSON.stringify(ok), 'a good save loads as it is');
});

test('progress: levels open in order, Play goes to the next one, endless opens after level 5', () => {
  const s = BS.newSave();
  assert.equal(BS.nextLevel(s), 1);
  assert.ok(BS.levelOpen(s, 1));
  assert.ok(!BS.levelOpen(s, 2));
  assert.ok(!BS.endlessOpen(s));
  s.stars[0] = 1;
  assert.equal(BS.nextLevel(s), 2);
  assert.ok(BS.levelOpen(s, 2));
  for (let i = 0; i < 5; i++) s.stars[i] = 2;
  assert.ok(BS.endlessOpen(s));
  s.stars.fill(1);
  assert.equal(BS.nextLevel(s), 0, 'everything won: Play goes to the endless mode');
  assert.ok(!BS.levelOpen(s, 16));
});

test('recording a round: best stars and scores are kept, wins unlock balls and paddles', () => {
  const s = BS.newSave();
  const w = world(1);
  w.won = true; w.lives = 3; w.clearAt = 20; w.score = 9000; w.maxBalls = 81;
  let r = BS.record(s, w);
  assert.equal(r.stars, 3);
  assert.equal(r.first, true);
  assert.equal(r.newBest, false, 'the first score is not a "new best"');
  assert.deepEqual(Array.from(r.unlocked, u => u.kind + u.i), ['ball1'], 'the first unlock comes with level 1 or 2');
  assert.equal(s.stars[0], 3);
  assert.equal(s.best[0], 9000);
  assert.equal(s.storm, 81);
  w.lives = 1; w.score = 12000; w.maxBalls = 20;
  r = BS.record(s, w);
  assert.equal(r.stars, 2);
  assert.equal(s.stars[0], 3, 'stars never go down');
  assert.equal(r.newBest, true);
  assert.equal(s.best[0], 12000);
  assert.equal(s.storm, 81, 'the biggest storm stays');
  w.won = false; w.score = 99999;
  r = BS.record(s, w);
  assert.equal(r.stars, 0);
  assert.equal(s.best[0], 12000, 'a lost round is no best score');
  const e = BS.create({ level: 0, seed: 1 });
  e.score = 5000;
  BS.record(s, e);
  assert.equal(s.endless, 5000);
  e.score = 4000;
  assert.equal(BS.record(s, e).newBest, false);
  assert.equal(s.endless, 5000);
});

test('cosmetics: 6 to 10 unlockable balls and paddles, priced in stars, worn only when unlocked', () => {
  const all = [...BS.BALLS, ...BS.PADDLES];
  const unlockable = all.filter(c => c.stars > 0);
  assert.ok(unlockable.length >= 6 && unlockable.length <= 10, 'unlockables ' + unlockable.length);
  assert.equal(BS.BALLS[0].stars, 0);
  assert.equal(BS.PADDLES[0].stars, 0);
  assert.ok(Math.min(...unlockable.map(c => c.stars)) <= 4, 'the first unlock is quick');
  assert.ok(Math.max(...unlockable.map(c => c.stars)) <= 15 * 3, 'every one can be earned');
  for (const list of [BS.BALLS, BS.PADDLES]) for (let i = 1; i < list.length; i++) assert.ok(list[i].stars > list[i - 1].stars);
  const s = BS.newSave();
  assert.equal(BS.wear(s, 'ball', 1), false);
  assert.equal(s.ball, 0);
  s.stars[0] = 3;
  assert.equal(BS.wear(s, 'ball', 1), true);
  assert.equal(s.ball, 1);
  assert.deepEqual(BS.unlockedBetween(0, 45).length, unlockable.length);
});
