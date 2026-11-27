// Cloud Hop's pure engine in Node: the boing only when falling onto a top, steering and
// wrapping, trampolines and jelly springs, cookie clouds that crumble and grow back,
// thunder clouds, pigeons (stomp or bonk), UFO beams, power-ups, candies and the candy
// multiplier, rescue bubbles, the castle, stars, saves, every level's course, a bot that
// wins every level at every difficulty and a random player who wins level 1.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(repo, 'games/cloud-hop/engine.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'engine.js' });
const CH = context.window.CH;
const DT = 1 / 60;

// Steps until something happens (or the time runs out); collects the events.
function run(w, { seconds = 10, until = () => false, input = () => ({}) } = {}) {
  const events = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    CH.step(w, DT, input(w));
    events.push(...w.ev); w.ev.length = 0;
    if (until(w, events)) break;
  }
  return events;
}
const types = events => events.map(e => e.type);
const has = type => (w, events) => events.some(e => e.type === type);
// A sky with only the start cloud in it, far from any castle, to try one thing at a time.
function lab(level = 2, diff = 0.35) {
  const w = CH.create({ level, diff, seed: 1 });
  w.plats = w.plats.filter(p => p.kind === 'ground');
  w.items = []; w.foes = []; w.castleY = 1e7;
  return w;
}
let ids = 90000;
function add(w, kind, x, y, wd = 220, extra = {}) {
  const p = Object.assign({ id: ids++, kind, x, x0: x, y, w: wd, amp: 0, sp: 0, ph: 0, broken: false, hitT: -9, face: 0, off: 0, rescue: false }, extra);
  w.plats.push(p);
  return p;
}
function fly(w, y, vy, x = 640) { w.phase = 'play'; w.pt = 0; w.m.x = x; w.m.y = y; w.m.vy = vy; w.m.vx = 0; w.cam = Math.min(w.cam, y - 120); }
// A steering bot (tests only): it aims for the highest platform it can still reach, grabs
// power-ups on the way and leaves a dead end. o.mem (an object the caller keeps) is its
// memory; o.err (0..1) makes it sloppy.
function pilot(w, o = {}) {
  const M = Math, m = w.m, mem = o.mem || {};
  if (w.phase !== 'play' && w.phase !== 'squat') return { dir: 0 };
  const G = CH.G, y = m.y, t0 = w.t, wait = w.phase === 'squat' ? CH.SQUAT - w.pt : 0;
  const vy = w.phase === 'squat' ? CH.BOUNCE : m.power ? CH.POWERS[m.power].vy : m.vy;
  const lift = m.power ? vy * m.pt : 0;  // still to rise under a power-up
  const top = y + lift + (vy > 0 ? vy * vy / (2 * G) : 0);
  // seconds until the feet come down to height h
  const down = h => { const d = vy * vy + 2 * G * (y + lift - h); return d < 0 ? -1 : wait + (m.power ? m.pt : 0) + (vy + M.sqrt(d)) / G; };
  if (m.on && mem.on !== m.land) { mem.on = m.land; mem.n = mem.id === m.on.id ? (mem.n || 0) + 1 : 1; mem.id = m.on.id; }
  // bounced on the same platform again and again: a dead end, so look elsewhere for a while
  if (m.on && mem.n >= 4) { mem.dead = m.on.id; mem.until = t0 + 3; mem.n = 0; }
  const lost = mem.dead && t0 < mem.until, base = m.on && !lost ? m.on.y - 4 : -1e9;
  let best = null, bestScore = -1e9, bestT = 0, bestX = 0;
  for (const p of w.plats) {
    if (p.broken || p.y > top - 8 || p.y < y - 700 || (vy <= 0 && !m.power && p.y > y)) continue;
    if ((lost && mem.dead === p.id) || (vy > 0 && p.y < base)) continue;
    const t = down(p.y);
    if (t < 0) continue;
    if (p.kind === 'thunder' && (CH.charged(p, t0 + t) || CH.charged(p, t0 + t + 0.12))) continue;
    const dx = CH.wrapDx(CH.platX(p, t0 + t) - m.x);
    if (M.abs(dx) - p.w / 2 + 12 > CH.VX * M.max(0, t - 0.12)) continue;
    const spring = (p.kind === 'tramp' || p.kind === 'jelly' || p.kind === 'castle') && p.y > base + 20;
    const score = p.y - M.abs(dx) * 0.1 - (p.kind === 'cookie' ? 30 : 0) + (spring ? 300 : 0);
    if (score > bestScore) { bestScore = score; best = p; bestT = t; bestX = dx; }
  }
  // a power-up on the way up beats a platform
  for (const it of w.items) {
    if (vy <= 0) break;
    if (it.got || it.kind === 'candy') continue;
    const rise = it.y - CH.BH / 2 - y;
    if (rise < 0 || rise > top - y) continue;
    const d2 = vy * vy - 2 * G * M.max(0, rise - lift), tu = m.power ? rise / vy : d2 < 0 ? -1 : wait + (vy - M.sqrt(d2)) / G;
    const idx = CH.wrapDx(it.x - m.x);
    if (tu >= 0 && M.abs(idx) - 40 < CH.VX * M.max(0, tu - 0.1)) { best = it; bestT = M.max(0.1, tu); bestX = idx; break; }
  }
  if (!best) return { dir: 0 };
  const want = M.abs(bestX) < 8 ? 0 : CH.clamp(bestX / M.max(0.1, bestT - 0.05), -CH.VX, CH.VX);
  let dir = want > m.vx + 40 ? 1 : want < m.vx - 40 ? -1 : 0;
  if (o.err && o.rng && o.rng() < o.err * 0.3) dir = o.rng() < 0.5 ? -1 : o.rng() < 0.5 ? 0 : 1;
  return { dir };
}
const bot = (seed = 1, err = 0) => { const rng = CH.rng(seed), mem = {}; return w => pilot(w, { err, rng, mem }); };
function play(level, diff, player, seconds = 300, seed = 5) {
  const w = CH.create({ level, diff, seed });
  run(w, { seconds, input: player, until: w => w.phase === 'over' });
  return w;
}

test('the engine is pure: no DOM, no Kit, no timers, no Math.random', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random|document\.|Kit\.|setTimeout|setInterval|localStorage|requestAnimationFrame|Date\.now|new Date/);
});

test('levels: 12 goals that grow, three worlds, bubbles unlimited in level 1 and fewer later', () => {
  assert.equal(CH.LEVELS, 12);
  for (let n = 2; n <= 12; n++) assert.ok(CH.goal(n) > CH.goal(n - 1), 'goal ' + n);
  assert.equal(CH.bubbles(1, 0.35), -1);
  for (let n = 2; n <= 4; n++) assert.equal(CH.bubbles(n, 0.35), 3);
  for (let n = 5; n <= 12; n++) assert.ok(CH.bubbles(n, 0.35) >= 1 && CH.bubbles(n, 0.35) < 3, 'bubbles ' + n);
  assert.ok(CH.bubbles(5, 0) > CH.bubbles(5, 0.5), 'a PC that struggles gets a spare bubble');
  assert.deepEqual([1, 4, 5, 8, 9, 12].map(CH.worldOf), [0, 0, 1, 1, 2, 2]);
  assert.deepEqual([0, 149, 150, 399, 400, 799, 800, 5000].map(CH.themeAt), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(CH.WORLDS.length, 4);
  for (let i = 1; i < CH.CHARS.length; i++) assert.ok(CH.CHARS[i].cost > CH.CHARS[i - 1].cost, 'char ' + i);
  assert.equal(CH.CHARS[0].cost, 0);
  for (const c of CH.CHARS) assert.match(c.name, /[؀-ۿ]/);
});

test('a try starts with a squish on the start cloud, then the first boing; height starts at 0', () => {
  const w = CH.create({ level: 1, diff: 0.35, seed: 3 });
  assert.equal(w.phase, 'squat'); assert.equal(w.height, 0); assert.equal(w.m.x, 640); assert.equal(w.t, 0);
  let events = run(w, { seconds: CH.SQUAT - 0.05 });
  assert.equal(w.phase, 'squat'); assert.equal(w.height, 0); assert.deepEqual(types(events), []);
  events = run(w, { seconds: 0.1 });
  assert.equal(w.phase, 'play');
  assert.ok(events.some(e => e.type === 'bounce' && e.a === 'ground'));
  run(w, { seconds: 0.4 });
  assert.ok(w.height > 3 && w.m.vy > 0);
  const again = CH.restart(w);
  assert.equal(again.height, 0); assert.equal(again.t, 0); assert.equal(again.phase, 'squat'); assert.equal(again.level, 1);
});

test('without steering Marshy never moves sideways (levels 1 to 4)', () => {
  for (let level = 1; level <= 4; level++) {
    const w = CH.create({ level, diff: 0.35, seed: 2 });
    for (let i = 0; i < 30 * 60; i++) { CH.step(w, DT, {}); w.ev.length = 0; assert.equal(w.m.x, 640, 'level ' + level + ' at ' + i); }
    assert.equal(w.steered, false);
  }
});

test('keys steer with a little drift, wrap around the sides, and say "steer" once', () => {
  const w = lab();
  let events = run(w, { seconds: 0.5, input: () => ({ dir: 1 }) });
  assert.ok(w.m.x > 640 + 100, 'moved right: ' + w.m.x);
  assert.equal(types(events).filter(t => t === 'steer').length, 1);
  const x = w.m.x;
  run(w, { seconds: 0.05 });
  assert.ok(w.m.x > x, 'glides on a little after letting go');
  run(w, { seconds: 1 });
  const still = w.m.x;
  run(w, { seconds: 0.5 });
  assert.equal(w.m.x, still, 'then stops');
  w.m.x = 1270; w.m.vx = 0;
  events = run(w, { seconds: 0.3, input: () => ({ dir: 1 }) });
  assert.ok(w.m.x < 200, 'wrapped to the left side: ' + w.m.x);
  assert.ok(!types(events).includes('steer'));
  run(w, { seconds: 0.5, input: () => ({ dir: -1 }) });
  assert.ok(w.m.x >= 0 && w.m.x < CH.W);
});

test('the mouse eases Marshy to the pointer, straight across (never the wrapped way)', () => {
  const w = lab();
  run(w, { seconds: 1.5, input: () => ({ mouseX: 1000 }) });
  assert.ok(Math.abs(w.m.x - 1000) < 3, 'at the pointer: ' + w.m.x);
  run(w, { seconds: 3, input: () => ({ mouseX: 40 }) });
  assert.ok(Math.abs(w.m.x - 40) < 3, 'crossed the screen: ' + w.m.x);
  assert.equal(w.steered, true);
});

test('the boing happens only when falling onto the top of a platform', () => {
  const w = lab();
  const p = add(w, 'cloud', 640, 150);
  fly(w, 20, 900);
  let events = run(w, { seconds: 0.25 });
  assert.ok(w.m.y > 150 && w.m.vy > 0, 'passed up through the cloud');
  assert.ok(!types(events).includes('bounce'));
  events = run(w, { seconds: 3, until: has('bounce') });
  const b = events.find(e => e.type === 'bounce');
  assert.equal(b.a, 'cloud');
  assert.equal(w.m.y, 150); assert.equal(w.m.vy, CH.BOUNCE); assert.equal(w.m.on, p);
  // off to the side: no boing, it falls past
  const v = lab(); add(v, 'cloud', 200, 150, 120); fly(v, 300, 0, 640);
  events = run(v, { seconds: 0.5 });
  assert.ok(v.m.y < 150 && !types(events).includes('bounce'));
});

test('trampolines and jelly springs launch higher than clouds', () => {
  for (const [kind, power] of [['tramp', CH.TRAMP], ['jelly', CH.JELLY]]) {
    const w = lab();
    add(w, kind, 640, 100);
    fly(w, 160, 0);
    const events = run(w, { seconds: 1, until: has('bounce') });
    assert.equal(events.find(e => e.type === 'bounce').a, kind);
    assert.equal(w.m.vy, power);
    assert.ok(events.find(e => e.type === 'bounce').c > 1.4);
  }
  assert.ok(CH.JELLY > CH.TRAMP && CH.TRAMP > CH.BOUNCE);
});

test('a cookie cloud crumbles under one boing and grows back a few seconds later', () => {
  const w = lab();
  const p = add(w, 'cookie', 640, 100);
  fly(w, 160, 0);
  let events = run(w, { seconds: 1, until: has('crumble') });
  assert.ok(p.broken); assert.equal(w.m.vy, CH.BOUNCE);
  events = run(w, { seconds: 2 });
  assert.ok(!events.some(e => e.type === 'bounce' && e.a === 'cookie'), 'falls through the crumbs');
  events = run(w, { seconds: CH.REGROW, until: has('regrow') });
  assert.ok(types(events).includes('regrow'));
  assert.equal(p.broken, false);
});

test('a crackling thunder cloud zaps Marshy down a little; a quiet one is a normal cloud', () => {
  const w = lab();
  const p = add(w, 'thunder', 640, 100);
  fly(w, 130, 0);
  // charged in the middle of the landing moment
  p.off = ((CH.THUNDER - 0.5 - w.t - 0.2) % CH.THUNDER + CH.THUNDER) % CH.THUNDER;
  let events = run(w, { seconds: 1, until: has('zap') });
  assert.ok(types(events).includes('zap'));
  assert.ok(w.m.vy < 0 && w.m.zap > 0 && w.m.inv > 0);
  assert.equal(w.zaps, 1); assert.equal(w.streak, 0); assert.equal(w.lost, false);
  const q = lab();
  const r = add(q, 'thunder', 640, 100);
  fly(q, 130, 0);
  r.off = ((0.5 - q.t - 0.2) % CH.THUNDER + CH.THUNDER) % CH.THUNDER;
  events = run(q, { seconds: 1, until: has('bounce') });
  assert.equal(events.find(e => e.type === 'bounce').a, 'thunder');
  assert.equal(q.m.vy, CH.BOUNCE);
});

test('pigeons: a stomp on the head is a super bounce and a bonus; a side bump only knocks down', () => {
  const w = lab();
  const f = { kind: 'pigeon', x: 640, y: 300, vx: 0, dead: false, dt: 0, vy: 0, ph: 0, seen: false };
  w.foes.push(f);
  fly(w, 330, -200);
  let events = run(w, { seconds: 0.5, until: has('stomp') });
  assert.ok(types(events).includes('stomp'));
  assert.ok(f.dead); assert.equal(w.m.vy, CH.STOMP); assert.equal(w.candies, 3); assert.equal(w.stomps, 1);

  const v = lab();
  const g = { kind: 'pigeon', x: 680, y: 300, vx: 0, dead: false, dt: 0, vy: 0, ph: 0, seen: false };
  v.foes.push(g);
  fly(v, 220, 600);
  v.cam = 0;
  events = run(v, { seconds: 0.3, until: has('bonk') });
  assert.ok(types(events).includes('bonk'));
  assert.ok(v.m.vy <= -340 && v.m.vx < 0 && v.m.inv > 0);
  assert.equal(v.bonks, 1); assert.ok(g.flee && !g.dead);
  events = run(v, { seconds: 2 });
  assert.equal(v.bonks, 1, 'a pigeon bumps only once, then flies off');
  assert.equal(v.lost, false); assert.notEqual(v.phase, 'over');
});

test('a UFO beam tugs Marshy sideways towards the saucer', () => {
  const w = lab(9);
  w.foes.push({ kind: 'ufo', x: 640, x0: 640, amp: 0, sp: 0, ph: 0, y: 500, dead: false, dt: 0, vy: 0, seen: false, off: 0 });
  fly(w, 300, 0, 600);
  w.m.vy = 0;
  CH.step(w, DT, {});
  assert.ok(w.m.vx > 0, 'pulled right: ' + w.m.vx);
});

test('power-ups lift Marshy at a steady speed for a while, then end', () => {
  for (const kind of ['balloon', 'hat', 'rocket']) {
    const w = lab();
    fly(w, 200, 300);
    w.items.push({ kind, x: 640, y: 232, got: false, ph: 0 });
    let events = run(w, { seconds: 0.05 });
    assert.ok(events.some(e => e.type === 'power' && e.a === kind));
    assert.equal(w.m.power, kind); assert.equal(w.m.vy, CH.POWERS[kind].vy);
    events = run(w, { seconds: CH.POWERS[kind].t + 0.1, until: has('powerEnd') });
    assert.ok(types(events).includes('powerEnd'));
    assert.equal(w.m.power, null);
  }
  assert.ok(CH.POWERS.rocket.vy > CH.POWERS.hat.vy && CH.POWERS.hat.vy > CH.POWERS.balloon.vy);
});

test('a power-up flight that reaches the castle ends with a hop onto it', () => {
  for (const kind of ['balloon', 'hat', 'rocket']) for (const x of [80, 640, 1200]) {
    const w = lab(5);
    w.castleY = 1500;
    add(w, 'castle', 640, 1500, CH.W + 240);
    fly(w, 800, 0, x);
    w.m.power = kind; w.m.pt = CH.POWERS[kind].t; w.m.vy = CH.POWERS[kind].vy;
    let top = 0;
    const events = run(w, { seconds: 4, input: w => { top = Math.max(top, w.m.y); return {}; }, until: (w, ev) => ev.some(e => e.type === 'arrive' || e.type === 'fall') });
    assert.ok(types(events).includes('arrive'), kind + ' at ' + x + ' lands on the castle');
    assert.equal(w.falls, 0);
    assert.ok(top > 1500 && top < 1500 + 120, kind + ': just over the top, not far above it: ' + (top - 1500));
  }
});

test('candies add up, a streak of higher landings doubles then triples them', () => {
  const w = lab();
  w.items.push({ kind: 'candy', x: 640, y: 232, got: false, ph: 0 });
  fly(w, 200, 0);
  let events = run(w, { seconds: 0.05 });
  assert.ok(events.some(e => e.type === 'candy' && e.a === 1));
  assert.equal(w.candies, 1); assert.equal(w.picked, 1);
  // a ladder of clouds, each 150 px above the last
  const v = lab();
  for (let i = 1; i <= 14; i++) add(v, 'cloud', 640, i * 150);
  const all = run(v, { seconds: 12, until: w => w.streak >= 12 });
  assert.ok(v.streak >= 12, 'streak ' + v.streak);
  assert.equal(v.mult, 3);
  assert.deepEqual(all.filter(e => e.type === 'mult').map(e => e.a), [2, 3]);
  const climb = all.filter(e => e.type === 'bounce').map(e => e.b);
  for (let i = 1; i < climb.length; i++) assert.ok(climb[i] >= climb[i - 1], 'the boing climbs with the streak');
  v.items.push({ kind: 'candy', x: 640, y: v.m.y + 32, got: false, ph: 0 });
  events = run(v, { seconds: 0.02 });
  assert.ok(events.some(e => e.type === 'candy' && e.a === 3));
});

test('falling below the view uses a rescue bubble that floats Marshy up to a fresh cloud', () => {
  const w = lab(2);
  assert.equal(w.bubbles, 3);
  w.cam = 600; fly(w, 400, -500); w.cam = 600;
  let events = run(w, { seconds: 0.1, until: has('fall') });
  assert.ok(types(events).includes('fall'));
  assert.equal(w.phase, 'rescue'); assert.equal(w.bubbles, 2); assert.equal(w.falls, 1); assert.equal(w.streak, 0);
  const x = w.m.x;
  events = run(w, { seconds: CH.RESCUE + 0.1, until: has('rescued') });
  assert.ok(types(events).includes('rescued'));
  assert.equal(w.phase, 'play'); assert.equal(w.m.x, x, 'straight up');
  assert.ok(w.m.y > w.cam + 100, 'back in view');
  events = run(w, { seconds: 1.5, until: has('bounce') });
  assert.ok(types(events).includes('bounce'), 'lands on the rescue cloud');
  assert.ok(w.plats.some(p => p.rescue));
  // level 1 never runs out
  const one = lab(1);
  assert.equal(one.bubbles, -1);
  one.cam = 600; fly(one, 400, -500); one.cam = 600;
  run(one, { seconds: 0.1, until: has('fall') });
  assert.equal(one.bubbles, -1); assert.equal(one.falls, 1); assert.equal(one.phase, 'rescue');
});

test('with no bubble left a fall ends the try', () => {
  const w = lab(5);
  w.bubbles = 0;
  w.cam = 600; fly(w, 400, -500); w.cam = 600;
  const events = run(w, { seconds: 3, until: has('lose') });
  assert.deepEqual(types(events).filter(t => t === 'falling' || t === 'lose'), ['falling', 'lose']);
  assert.equal(w.phase, 'over'); assert.equal(w.lost, true); assert.equal(w.won, false);
});

test('the castle ends a level with a celebration and stars', () => {
  const w = lab(3);
  w.castleY = 600;
  add(w, 'castle', 640, 600, CH.W + 240);
  fly(w, 640, 0); w.cam = 300;
  let events = run(w, { seconds: 1, until: has('arrive') });
  const a = events.find(e => e.type === 'arrive');
  assert.ok(a);
  assert.equal(w.won, true); assert.equal(w.phase, 'arrive');
  assert.equal(w.stars, 2, 'the castle and no fall (no candies in this sky)');
  events = run(w, { seconds: CH.ARRIVE + 0.1, until: has('done') });
  assert.ok(types(events).includes('hop'));
  assert.ok(types(events).includes('done'));
  assert.equal(w.phase, 'over');
});

test('stars: one for the castle, one for no fall, one for most of the candies', () => {
  const s = o => CH.starsFor(Object.assign({ won: true, falls: 0, picked: 0, total: 10 }, o));
  assert.equal(s({ won: false }), 0);
  assert.equal(s({ falls: 2, picked: 1 }), 1);
  assert.equal(s({ picked: 5 }), 2);
  assert.equal(s({ falls: 1, picked: 6 }), 2);
  assert.equal(s({ picked: 6 }), 3);
});

test('the camera only goes up and the height never drops', () => {
  const w = CH.create({ level: 6, diff: 0.5, seed: 1 });
  const pilot = bot(4, 0.4);
  let cam = w.cam, height = 0;
  for (let i = 0; i < 90 * 60 && w.phase !== 'over'; i++) {
    CH.step(w, DT, pilot(w)); w.ev.length = 0;
    assert.ok(w.cam >= cam); assert.ok(w.height >= height);
    assert.ok(w.m.x >= 0 && w.m.x < CH.W);
    cam = w.cam; height = w.height;
  }
  assert.ok(w.height > 60);
});

test('every level\'s course: fixed per level, ends at the castle, harder with the difficulty', () => {
  for (let n = 1; n <= 12; n++) {
    const a = CH.create({ level: n, diff: 0.35, seed: 1 }), b = CH.create({ level: n, diff: 0.35, seed: 999 });
    assert.deepEqual(a.plats.map(p => [p.kind, Math.round(p.x0), Math.round(p.y), p.w]), b.plats.map(p => [p.kind, Math.round(p.x0), Math.round(p.y), p.w]), 'level ' + n + ' is the same every time');
    const castle = a.plats.find(p => p.kind === 'castle');
    assert.ok(castle); assert.equal(castle.y, CH.goal(n) * CH.PX);
    assert.ok(a.items.some(i => i.kind === 'star'), 'a golden star');
    assert.ok(a.total > 20, 'candies ' + a.total);
    for (const p of a.plats) {
      if (p.kind === 'ground' || p.kind === 'castle') continue;
      assert.ok(p.y > 0 && p.y < castle.y, 'level ' + n + ' platform below the castle');
      const lo = (p.amp ? p.x0 - p.amp : p.x) - p.w / 2, hi = (p.amp ? p.x0 + p.amp : p.x) + p.w / 2;
      assert.ok(lo >= -1 && hi <= CH.W + 1, 'level ' + n + ' platform on screen: ' + lo + '..' + hi);
    }
    const ys = a.plats.filter(p => p.kind !== 'ground').map(p => p.y).sort((x, y) => x - y);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] < 260, 'level ' + n + ' no gap too tall to bounce: ' + (ys[i] - ys[i - 1]));
    if (n < 5) assert.equal(a.foes.length, 0, 'no pigeons before level 5'); else assert.ok(a.foes.length > 0, 'level ' + n + ' has pigeons');
  }
  const avg = w => { const p = w.plats.filter(q => q.kind !== 'ground' && q.kind !== 'castle' && !q.rescue); return p.reduce((s, q) => s + q.w, 0) / p.length; };
  const easy = CH.create({ level: 7, diff: 0, seed: 1 }), hard = CH.create({ level: 7, diff: 1, seed: 1 });
  assert.ok(avg(hard) < avg(easy) * 0.9, 'narrower clouds when it is going well');
  assert.ok(hard.plats.length < easy.plats.length, 'wider gaps when it is going well');
  assert.ok(hard.foes.length >= easy.foes.length);
});

test('a steering bot wins every level at every difficulty', () => {
  for (const diff of [0, 0.35, 0.7, 1]) {
    for (let n = 1; n <= 12; n++) {
      const w = play(n, diff, bot(n * 13 + diff * 10));
      assert.ok(w.won, `level ${n} at ${diff}: height ${w.height}, falls ${w.falls}, phase ${w.phase}`);
      assert.ok(w.t < 120, `level ${n} at ${diff} took ${Math.round(w.t)} s`);
      assert.ok(w.stars >= 1 && w.stars <= 3);
    }
  }
});

test('level 1 is won by a child pressing arrows at random, and can never be lost', () => {
  let wins = 0;
  for (let s = 1; s <= 40; s++) {
    const r = CH.rng(s * 31);
    let dir = 0, left = 0;
    const random = () => { left -= DT; if (left <= 0) { dir = [-1, 0, 1][Math.floor(r() * 3)]; left = 0.2 + r() * 0.8; } return { dir }; };
    const w = play(1, 0.35, random, 240);
    assert.equal(w.lost, false);
    if (w.won) wins++;
  }
  assert.ok(wins >= 38, 'random wins ' + wins + '/40');
});

test('the first character is affordable after two levels', () => {
  let wallet = 0;
  for (let n = 1; n <= 2; n++) {
    const w = play(n, 0.35, bot(n));
    wallet += w.candies + w.stars * CH.STAR_BONUS;
  }
  assert.ok(wallet >= CH.CHARS[1].cost, 'candies after level 2: ' + wallet);
});

test('the endless sky climbs through the worlds, gets harder and keeps its lists short', () => {
  for (const seed of [11, 22, 33]) {
    const w = CH.create({ level: 0, diff: 0.35, seed });
    assert.equal(w.bubbles, 1); assert.equal(w.castleY, 0);
    const pilot = bot(seed);
    let most = 0;
    for (let i = 0; i < 150 * 60 && w.phase !== 'over'; i++) {
      CH.step(w, DT, pilot(w)); w.ev.length = 0;
      most = Math.max(most, w.plats.length + w.items.length + w.foes.length);
    }
    assert.ok(w.height > 300, 'seed ' + seed + ' reached ' + w.height);
    assert.ok(most < 180, 'objects kept ' + most);
  }
  const a = CH.create({ level: 0, diff: 0.35, seed: 5 }), b = CH.create({ level: 0, diff: 0.35, seed: 6 });
  assert.notDeepEqual(a.plats.map(p => Math.round(p.x)), b.plats.map(p => Math.round(p.x)), 'a new sky each try');
});

test('saves: a fresh one, odd values repaired, levels opened by stars, characters bought and worn', () => {
  const s = CH.newSave();
  assert.equal(s.unlocked, 1); assert.equal(s.played, false); assert.equal(s.candies, 0);
  assert.equal(s.stars.length, 12); assert.equal(s.chars.length, CH.CHARS.length); assert.equal(s.chars[0], true);
  for (const junk of [null, undefined, 'x', 7, [], { stars: 'no' }]) assert.deepEqual(JSON.parse(JSON.stringify(CH.loadSave(junk))), JSON.parse(JSON.stringify(CH.newSave())));
  const odd = CH.loadSave({ unlocked: 99, stars: [3, 9, -1, 'a', 2], candies: -5, best: NaN, chars: [false, true, 'yes'], char: 2, bestAt: [4] });
  assert.equal(odd.unlocked, 6, 'an impossible unlock is dropped; the level after a won one is open');
  assert.deepEqual(Array.from(odd.stars.slice(0, 5)), [3, 0, 0, 0, 2]);
  assert.equal(odd.candies, 0); assert.equal(odd.best, 0);
  assert.equal(odd.chars[0], true); assert.equal(odd.chars[1], true); assert.equal(odd.chars[2], false);
  assert.equal(odd.char, 0, 'cannot wear a character not owned');
  assert.equal(odd.played, true);
  const won = CH.loadSave({ stars: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], unlocked: 1 });
  assert.equal(won.unlocked, 3, 'the level after the last one won is open');
  assert.equal(CH.nextLevel(won), 3);
  assert.equal(CH.nextLevel(CH.loadSave({ stars: [2, 0, 1], unlocked: 4 })), 2, 'continues at the first level not yet won');
  assert.equal(CH.nextLevel(CH.loadSave({ stars: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], unlocked: 12 })), 0, 'all won: endless');
  assert.equal(CH.endlessOpen(won), false);
  assert.equal(CH.endlessOpen(CH.loadSave({ stars: [1, 1, 1, 1] })), true);
  const shop = CH.newSave();
  assert.equal(CH.affordable(shop), false);
  assert.equal(CH.buy(shop, 1), false);
  shop.candies = 50;
  assert.equal(CH.affordable(shop), true);
  assert.equal(CH.buy(shop, 1), true);
  assert.equal(shop.candies, 50 - CH.CHARS[1].cost); assert.equal(shop.char, 1); assert.equal(shop.chars[1], true);
  assert.equal(CH.buy(shop, 0), true); assert.equal(shop.char, 0); assert.equal(shop.candies, 5, 'wearing an owned one is free');
  assert.equal(CH.buy(shop, 99), false);
  const back = CH.loadSave(JSON.parse(JSON.stringify(shop)));
  assert.equal(back.chars[1], true); assert.equal(back.candies, 5);
});
