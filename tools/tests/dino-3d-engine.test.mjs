// Dino 3D engine (games/dino-3d/engine.js): tuning per tier, the baby dino's physics,
// course generation, scripted players for every journey level, the endless course
// code, stars, difficulty outcomes and saves. Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/dino-3d/engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const D = sandbox.window.Dino3D;
const DT = 1 / 60;
const plain = v => JSON.parse(JSON.stringify(v));

function run(w, seconds, input = {}) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT) && !w.done && !w.over; i++) {
    D.step(w, DT, typeof input === 'function' ? input(i, w) : input);
    events.push(...w.ev.map(e => e.t));
    w.ev.length = 0;
  }
  return events;
}
// A world with nothing on the course: physics only.
function empty(tier = 3, extra = {}) {
  const w = D.create({ level: 0, tier });
  w.obs = []; w.items = []; w.oi = 0; w.ii = 0; w.len = 1e6;
  return Object.assign(w, extra);
}
function obstacle(w, o) {
  const full = { id: 900 + w.obs.length, cued: false, passed: false, dead: false, ...o };
  w.obs.push(full); w.obs.sort((a, b) => a.x - b.x);
  return full;
}

/* ------------------------------------------------- a scripted player */
// It looks ahead with copies of the world (D.clone) and picks the first of a few
// moves (a tap or a held jump, or a duck) that clears the obstacle it would bump,
// and from which the next obstacle can still be cleared. Its input is the same
// { jump, duck } a child gives with the keys.
const PLANS = [{ jump: 0.05 }, { jump: 0.12 }, { jump: 0.2 }, { jump: 0.3 }, { jump: 0.45 }, { duck: 0.4 }, { duck: 0.7 }, { duck: 1 }];
const planInput = (plan, t) => plan ? { jump: !!plan.jump && t < plan.jump, duck: !!plan.duck && t < plan.duck } : {};
const planLength = plan => plan ? Math.max(plan.jump || 0, plan.duck || 0) : 0;
function sim(w, plan, H, until) {
  const c = D.clone(w);
  for (let t = 0; t < H; t += DT) {
    D.step(c, DT, planInput(plan, t));
    for (const e of c.ev) if (e.t === 'bump' || e.t === 'splash') return { hit: e, t, c };
    c.ev.length = 0;
    if (c.done || (until && until(c, t))) return { hit: null, t, c };
  }
  return { hit: null, t: H, c };
}
function threatEnd(w, e) {
  const o = w.obs.find(o => o.id === e.id);
  if (o) return o.x + o.w;
  for (const g of w.obs) if (g.kind === 'gap') for (const s of g.goo) if (w.x >= s[0] - 0.6 && w.x <= s[1] + 0.6) return s[1];
  return w.x + 3;
}
function clears(w, plan, end) {
  const r = sim(w, plan, 2.2, (c, t) => t >= planLength(plan) && c.p.ground && c.x > end + 0.35);
  return r.hit ? null : r.c;
}
function solvable(w) {
  const run = sim(w, null, 0.7);
  if (!run.hit) return true;
  const end = threatEnd(run.c, run.hit);
  return PLANS.some(p => clears(w, p, end));
}
function decide(w) {
  const r = sim(w, null, 1.2);
  if (!r.hit || r.t > 0.62) return null;
  const end = threatEnd(r.c, r.hit);
  for (const p of PLANS) { const after = clears(w, p, end); if (after && (after.done || solvable(after))) return p; }
  return null;
}
function bot(w, maxT = 200) {
  let plan = null, pt = 0;
  while (!w.done && !w.over && w.t < maxT) {
    if (plan && pt >= planLength(plan)) plan = null;
    if (!plan) { const p = decide(w); if (p) { plan = p; pt = 0; } }
    D.step(w, DT, planInput(plan, pt));
    w.ev.length = 0;
    pt += DT;
  }
  return D.result(w);
}

/* ------------------------------------------------------------- tests */
test('the engine is pure: no Kit, no page, no THREE, no timers, no unseeded randomness', () => {
  assert.ok(D && D.create && D.step && D.TUNE, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|\bTHREE\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|Date\.now|performance/);
});

test('every tuning knob has one entry per tier and moves one way, towards harder', () => {
  for (const [key, row] of Object.entries(D.TUNE)) {
    const dir = D.HARDER[key];
    assert.ok(dir === 1 || dir === -1, key + ' has a direction');
    assert.equal(row.length, D.TIERS, key + ' has one entry per tier');
    for (let i = 1; i < row.length; i++) assert.ok((row[i] - row[i - 1]) * dir >= 0, `${key}: ${row}`);
    assert.notEqual(row[0], row[row.length - 1], key + ' changes from tier 1 to tier 5');
  }
  assert.deepEqual(Object.keys(D.HARDER).sort(), Object.keys(D.TUNE).sort());
  // The kind ones: slower, wider spacing, kinder colliders and timing, half a heart per bump.
  assert.ok(D.TUNE.speed[0] < D.TUNE.speed[4] && D.TUNE.space[0] > D.TUNE.space[4]);
  assert.ok(D.TUNE.grace[0] > D.TUNE.grace[4] && D.TUNE.coyote[0] > D.TUNE.coyote[4] && D.TUNE.buffer[0] > D.TUNE.buffer[4]);
  assert.equal(D.TUNE.cost[0], 1); assert.equal(D.TUNE.cost[4], 2);
  assert.equal(D.tune(9).tier, 3, 'anything else is tier 3'); assert.equal(D.tune('x').tier, 3);
});

test('fifteen journey levels: five biomes of three, ids b1L1..b5L3, each 45-75 s long', () => {
  assert.equal(D.LEVEL.length, 15);
  assert.deepEqual(plain(D.LEVEL.map(l => l.id)), ['b1L1', 'b1L2', 'b1L3', 'b2L1', 'b2L2', 'b2L3', 'b3L1', 'b3L2', 'b3L3', 'b4L1', 'b4L2', 'b4L3', 'b5L1', 'b5L2', 'b5L3']);
  for (const id of D.LEVEL.map(l => l.id)) assert.match(id, /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/);
  // Each biome brings one new obstacle, and every biome's first level shows it first.
  assert.deepEqual(plain(D.BIOMES.map(b => b.fresh)), ['block', 'vine', 'roller', 'gap', 'flyer']);
  for (let b = 1; b < 5; b++) {
    for (let i = 0; i < b; i++) assert.ok(!D.BIOMES[i].sets[2].includes(D.BIOMES[b].fresh), `${D.BIOMES[b].fresh} is new in biome ${b + 1}`);
    for (const tier of [1, 5]) {
      const w = D.create({ level: b * 3, tier });
      assert.equal(w.obs.filter(o => o.kind !== 'mud')[0].kind, D.BIOMES[b].fresh, `b${b + 1}L1 starts with its new obstacle`);
    }
  }
  for (const tier of [1, 3, 5]) for (const L of D.LEVEL) {
    const w = D.create({ level: L.i, tier }), secs = w.len / D.speedAt(w, w.len / 2);
    assert.ok(secs >= 42 && secs <= 75, `${L.id} tier ${tier}: ${secs.toFixed(1)} s`);
    assert.ok(w.total >= 10, `${L.id} tier ${tier} has eggs to find (${w.total})`);
    assert.ok(w.items.some(it => it.k === 'fruit'), `${L.id} has fruit for the roar`);
    // Only kinds of this biome so far; the course leaves a clear run-up and a clear finish.
    const kinds = new Set(D.BIOMES[L.biome].sets[L.n]);
    for (const o of w.obs) assert.ok(kinds.has(o.kind), `${L.id}: ${o.kind}`);
    assert.ok(w.obs[0].x >= 2.9 * D.tune(tier).speed, 'a quiet start');
    assert.ok(w.obs.every(o => o.x + o.w < w.len - 2 * D.tune(tier).speed), 'a quiet finish');
  }
  // Tier 1 never meets the harder forms; tier 5 does.
  const forms = tier => new Set(D.LEVEL.flatMap(L => D.create({ level: L.i, tier }).obs.map(o => o.kind + ':' + (o.form || ''))));
  const easy = forms(1), hard = forms(5);
  for (const f of ['block:tall', 'block:wide', 'crate:wall']) { assert.ok(!easy.has(f), 'tier 1: no ' + f); assert.ok(hard.has(f), 'tier 5 has ' + f); }
  assert.ok(D.LEVEL.every(L => D.create({ level: L.i, tier: 1 }).obs.length < D.create({ level: L.i, tier: 5 }).obs.length), 'tier 5 levels hold more obstacles');
});

test('a tap jumps, a held jump goes higher, and a second press in the air does nothing', () => {
  const peak = hold => {
    const w = empty(3); let top = 0, jumps = 0;
    for (let i = 0; i < 70; i++) { D.step(w, DT, { jump: i * DT < hold }); jumps += w.ev.filter(e => e.t === 'jump').length; w.ev.length = 0; top = Math.max(top, w.p.y); }
    return { top, jumps, w };
  };
  const idle = empty(3); run(idle, 0.5);
  assert.equal(idle.p.y, 0, 'no input, no jump');
  const tap = peak(1 / 60), held = peak(0.5);
  assert.equal(tap.jumps, 1); assert.equal(held.jumps, 1, 'holding does not jump again in the air');
  assert.ok(tap.top > 1.1 && tap.top < 1.5, 'a tap: ' + tap.top);
  assert.ok(held.top > tap.top + 0.6, `a held jump goes higher: ${held.top} vs ${tap.top}`);
  assert.ok(held.w.p.ground && tap.w.p.ground, 'both land again');
  // A young child's jump floats longer and higher.
  const t1 = empty(1), t5 = empty(5); let air1 = 0, air5 = 0;
  D.step(t1, DT, { jump: true }); D.step(t5, DT, { jump: true });
  for (let i = 0; i < 90; i++) { D.step(t1, DT, {}); D.step(t5, DT, {}); if (!t1.p.ground) air1++; if (!t5.p.ground) air5++; }
  assert.ok(air1 > air5 + 5, `tier 1 airtime ${air1} > tier 5 ${air5}`);
});

test('a jump pressed just before landing is remembered, and one just after leaving an edge still counts', () => {
  const w = empty(3);
  D.step(w, DT, { jump: true });
  let frames = 0;
  while (w.p.vy > 0 || w.p.y > 0.45) { D.step(w, DT, {}); frames++; }
  w.ev.length = 0;
  D.step(w, DT, { jump: true }); // early press, still in the air
  let again = 0;
  for (let i = 0; i < 20; i++) { D.step(w, DT, { jump: true }); again += w.ev.filter(e => e.t === 'jump').length; w.ev.length = 0; }
  assert.equal(again, 1, 'the buffered press jumps on landing');
  // Coyote time: run off the edge of goo, then press.
  const c = empty(3), x = 4;
  obstacle(c, { kind: 'gap', x, w: 2.6, y0: -2, y1: 0, goo: [[x, x + 2.6]], jelly: false });
  while (D.solid(c, c.x + 0.05)) D.step(c, DT, {});
  D.step(c, DT, {}); D.step(c, DT, {});
  assert.equal(c.p.ground, false, 'off the edge');
  c.ev.length = 0;
  D.step(c, DT, { jump: true });
  assert.ok(c.ev.some(e => e.t === 'jump'), 'a late press over the edge still jumps');
});

test('bumping costs half a heart when young, a whole one later, blinks, and is comical, not final', () => {
  for (const [tier, cost] of [[1, 1], [5, 2]]) {
    const w = empty(tier);
    const o = obstacle(w, { kind: 'block', form: 'small', x: 3, w: 0.85, y0: 0, y1: 0.8 });
    const ev = run(w, 1.6);
    assert.ok(ev.includes('bump'), 'an idle dino bumps the rock');
    assert.equal(w.p.hp, D.HP - cost);
    assert.ok(o.dead && o.hit, 'the rock tumbles away');
    assert.ok(!w.over && w.x > 6, 'and the dino keeps running');
    // A second rock during the blink does no harm.
    const w2 = empty(tier); obstacle(w2, { kind: 'block', x: 3, w: 0.85, y0: 0, y1: 0.8 }); obstacle(w2, { kind: 'block', x: 3 + w2.speed * 0.6, w: 0.85, y0: 0, y1: 0.8 });
    run(w2, 2);
    assert.equal(w2.p.hp, D.HP - cost, 'safe while blinking');
  }
  // Out of hearts is the end of the level.
  const w = empty(5);
  for (let i = 0; i < 3; i++) obstacle(w, { kind: 'block', x: 3 + i * 14, w: 0.85, y0: 0, y1: 0.8 });
  const ev = run(w, 8);
  assert.ok(w.over && ev.includes('over') && w.p.hp === 0);
});

test('ducking passes under a vine, standing bumps it; a held down arrow also falls fast', () => {
  const vine = w => obstacle(w, { kind: 'vine', x: 3, w: 0.55, y0: 1, y1: 4.5 });
  const a = empty(5); vine(a); run(a, 1.5, { duck: true });
  assert.equal(a.bumps, 0); assert.equal(a.cleared, 1);
  const b = empty(5); vine(b); run(b, 1.5);
  assert.equal(b.bumps, 1);
  const c = empty(5); vine(c); run(c, 1.5, { jump: true });
  assert.equal(c.bumps, 1, 'jumping into a hanging vine bumps it');
  const slow = empty(3), fast = empty(3);
  D.step(slow, DT, { jump: true }); D.step(fast, DT, { jump: true });
  let ts = 0, tf = 0;
  for (let i = 0; i < 80; i++) { D.step(slow, DT, {}); D.step(fast, DT, { duck: i > 10 }); if (!slow.p.ground) ts++; if (!fast.p.ground) tf++; }
  assert.ok(tf < ts - 5, `fast fall ${tf} < ${ts}`);
});

test('fruit fills the roar meter; the roar dash smashes what is in front, for bonus eggs', () => {
  const T = D.tune(3), w = empty(3);
  for (let i = 0; i < T.roarNeed; i++) w.items.push({ id: 500 + i, k: 'fruit', x: 2 + i, y: 0.5, got: false });
  const ev = run(w, 1.2);
  assert.equal(ev.filter(e => e === 'fruit').length, T.roarNeed);
  assert.equal(w.p.roar, 1);
  w.ev.length = 0;
  const crate = obstacle(w, { kind: 'crate', form: 'one', x: w.x + 4, w: 1, y0: 0, y1: 1 });
  const rock = obstacle(w, { kind: 'block', form: 'small', x: w.x + 9, w: 0.85, y0: 0, y1: 0.8 });
  const eggs = w.eggs;
  const ev2 = run(w, 1, (i) => ({ dash: i === 0 }));
  assert.ok(ev2.includes('dash'));
  assert.ok(crate.smashed && rock.smashed, 'both smashed');
  assert.equal(w.bumps, 0); assert.equal(w.p.hp, D.HP);
  assert.equal(w.eggs, eggs + 3, 'a crate gives 2 eggs, a rock 1');
  assert.equal(w.p.roar, 0, 'the meter is spent');
  // Without a full meter the key does nothing but say so.
  const n = empty(3); n.p.roar = 0.6;
  const ev3 = run(n, 0.2, i => ({ dash: i === 0 }));
  assert.ok(ev3.includes('noRoar') && !ev3.includes('dash'));
});

test('goo: running in splashes (a heart) and the goo turns to jelly; jumping over is clean', () => {
  const make = () => { const w = empty(3), x = 5; obstacle(w, { kind: 'gap', x, w: 2.8, y0: -2, y1: 0, goo: [[x, x + 2.8]], jelly: false }); return w; };
  const a = make(), ev = run(a, 2.5);
  assert.ok(ev.includes('splash'));
  assert.equal(a.p.hp, D.HP - 2); assert.equal(a.obs[0].jelly, true);
  assert.ok(!a.over && a.p.ground && a.x > 9, 'bounces out and runs on');
  const b = make();
  run(b, 2.5, (i, w) => ({ jump: w.x > 3.6 && w.x < 4.2 }));
  assert.equal(b.splashes, 0); assert.equal(b.cleared, 1);
});

test('mud slows the dino down without hurting it; a snowball rolls towards it', () => {
  const a = empty(3), b = empty(3);
  obstacle(a, { kind: 'mud', x: 3, w: 4, y0: 0, y1: 0 });
  run(a, 1.2); run(b, 1.2);
  assert.ok(a.x < b.x - 1.5, `mud: ${a.x} vs ${b.x}`);
  assert.equal(a.p.hp, D.HP);
  const r = empty(3), o = obstacle(r, { kind: 'roller', x: 30, w: 0.9, y0: 0, y1: 0.9, vx: 2.6, active: false, slot: 30 });
  run(r, 1);
  assert.ok(o.active && o.x < 30, 'it rolls');
});

test('eggs and hearts are picked up by touching them; a high row needs a jump', () => {
  const w = empty(3);
  w.items.push({ id: 1, k: 'egg', x: 3, y: 0.45, got: false }, { id: 2, k: 'egg', x: 5, y: 2.9, got: false }, { id: 3, k: 'heart', x: 7, y: 1.9, got: false });
  w.p.hp = 3;
  run(w, 1.4);
  assert.equal(w.eggs, 1, 'the ground egg, not the high one');
  assert.equal(w.p.hp, 3, 'the floating heart needs a hop');
  const j = empty(3);
  j.items.push({ id: 2, k: 'egg', x: 5, y: 2.9, got: false }, { id: 3, k: 'heart', x: 9, y: 1.9, got: false });
  j.p.hp = 3;
  run(j, 1.8, (i, w) => ({ jump: (w.x > 2.4 && w.x < 4) || (w.x > 7.2 && w.x < 7.6) }));
  assert.equal(j.eggs, 1, 'a held jump reaches the high egg');
  assert.equal(j.p.hp, 5, 'a heart gives one back');
});

test('the same input at 30, 60 and 120 Hz plays the same level', () => {
  const play = hz => {
    const w = D.create({ level: 4, tier: 3 }), dt = 1 / hz;
    for (let i = 0; i < hz * 12; i++) { D.step(w, dt, { jump: Math.floor(i * dt / 0.9) % 2 === 0 }); w.ev.length = 0; }
    return { x: Math.round(w.x * 100), eggs: w.eggs, bumps: w.bumps };
  };
  const a = play(60);
  assert.deepEqual(play(120), a);
  assert.deepEqual(play(30), a);
});

test('a scripted player finishes every level at the easiest and the hardest tier without a bump', () => {
  for (const tier of [1, 5]) for (const L of D.LEVEL) {
    const r = bot(D.create({ level: L.i, tier }));
    assert.ok(r.finished, `${L.id} tier ${tier} is finished`);
    assert.equal(r.bumps, 0, `${L.id} tier ${tier} can be done without a bump`);
    assert.ok(D.stars(r) >= 2, `${L.id} tier ${tier}: ${D.stars(r)} stars, ${r.eggs}/${r.total} eggs`);
    assert.ok(D.outcome(r) >= 0.85, `${L.id} tier ${tier}: outcome ${D.outcome(r)}`);
  }
});

test('doing nothing loses hearts and never finishes a level', () => {
  for (const tier of [1, 3, 5]) for (const L of D.LEVEL) {
    const w = D.create({ level: L.i, tier }), ev = run(w, 120);
    assert.ok(ev.includes('bump') || ev.includes('splash'), `${L.id} tier ${tier}: an idle dino bumps`);
    assert.ok(w.over && !w.done, `${L.id} tier ${tier}: idle runs out of hearts (${w.p.hp})`);
    const r = D.result(w);
    assert.equal(D.stars(r), 0);
    assert.ok(D.outcome(r) < 0.3, 'a failed try eases the difficulty');
  }
});

test('the endless run: biomes cycle, speed builds, a course code gives the same course every time', () => {
  const seed = D.codeSeed('0042');
  assert.equal(seed, D.codeSeed('0042'));
  assert.notEqual(seed, D.codeSeed('0043'));
  assert.equal(D.validCode('0042'), true);
  for (const bad of ['42', '00a2', '12345', '', null, undefined, '٠٠٤٢']) assert.equal(D.validCode(bad), false, String(bad));
  const course = (code, input) => {
    const w = D.create({ endless: true, seed: D.codeSeed(code), tier: 3 }), seen = [];
    w.p.hp = 1e6; // the layout, whatever happens to the dino
    for (let i = 0; i < 60 * 40 && !w.over; i++) {
      D.step(w, DT, input ? input(i) : { jump: i % 50 < 12 });
      for (const o of w.obs) if (!seen.some(s => s.id === o.id)) seen.push({ id: o.id, kind: o.kind, x: Math.round((o.slot || o.x) * 1000), w: o.w });
      w.ev.length = 0;
    }
    return seen;
  };
  const a = course('0042'), b = course('0042', i => ({ jump: i % 37 < 9, duck: i % 91 > 80 }));
  const n = Math.min(a.length, b.length);
  assert.ok(n > 15);
  assert.deepEqual(a.slice(0, n), b.slice(0, n), 'the same code is the same layout whatever the child does');
  assert.notDeepEqual(course('1234').slice(0, 10), a.slice(0, 10), 'another code, another course');
  // A long run with the scripted player: biome changes, faster, bounded memory.
  const w = D.create({ endless: true, seed: D.codeSeed('7777'), tier: 3 }), biomes = new Set([0]);
  let plan = null, pt = 0, maxObs = 0, maxItems = 0;
  const v0 = D.speedAt(w, 0);
  while (!w.over && w.t < 150) {
    if (plan && pt >= planLength(plan)) plan = null;
    if (!plan) { const p = decide(w); if (p) { plan = p; pt = 0; } }
    D.step(w, DT, planInput(plan, pt)); pt += DT;
    for (const e of w.ev) if (e.t === 'biome') biomes.add(e.b);
    w.ev.length = 0;
    maxObs = Math.max(maxObs, w.obs.length); maxItems = Math.max(maxItems, w.items.length);
  }
  assert.ok(!w.over, 'the scripted player keeps going');
  assert.ok(biomes.size >= 4, 'biomes cycle: ' + [...biomes]);
  assert.ok(D.speedAt(w, w.x) > v0 * 1.4, 'speed builds');
  assert.ok(maxObs < 160 && maxItems < 400, `bounded: ${maxObs} obstacles, ${maxItems} items`);
  assert.equal(D.result(w).distance, Math.floor(w.x));
  assert.ok(D.outcome(D.result(w)) === 1, 'a long run is a full success');
});

test('stars: finishing is one, 70% of the eggs two, few bumps three (one heart is fine when young)', () => {
  const r = (o) => ({ finished: true, eggs: 20, total: 20, lost: 0, tier: 3, ...o });
  assert.equal(D.stars(r({ finished: false })), 0);
  assert.equal(D.stars(r({})), 3);
  assert.equal(D.stars(r({ eggs: 14 })), 3, '70% is enough');
  assert.equal(D.stars(r({ eggs: 13 })), 2);
  assert.equal(D.stars(r({ lost: 2 })), 2, 'tier 3: any heart lost costs the star');
  assert.equal(D.stars(r({ lost: 2, tier: 1 })), 3, 'tier 1: one heart is fine');
  assert.equal(D.stars(r({ lost: 3, tier: 2 })), 2);
  assert.equal(D.stars(r({ eggs: 0, lost: 6 })), 1);
  assert.ok(D.outcome(r({})) === 1);
  assert.ok(D.outcome(r({ eggs: 8, lost: 4 })) < 0.72, 'a bumpy finish eases off');
  assert.ok(D.outcome({ finished: false, progress: 0.9 }) <= 0.27);
  assert.equal(D.outcome({ endless: true, distance: 300, tier: 1 }), 1);
  assert.equal(D.outcome({ endless: true, distance: 500, tier: 5 }), 0.5);
});

test('saves: a fresh save, junk and the first Dino 3D save all load as playable saves', () => {
  const fresh = plain(D.freshSave());
  assert.deepEqual(fresh, { v: 2, stars: Array(15).fill(0), best: Array(15).fill(0), bank: 0, far: 0, color: 0, hat: 0, seen: 0, coach: false });
  for (const junk of [null, undefined, 0, 'x', [], [1, 2], { v: 1 }, { best: 900 }, 42, { v: 2, stars: 'no' }]) assert.deepEqual(plain(D.loadSave(junk)), fresh, JSON.stringify(junk));
  const good = { v: 2, stars: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], best: [20, 18, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bank: 80, far: 812, color: 2, hat: 3, seen: 40, coach: true };
  assert.deepEqual(plain(D.loadSave(good)), good);
  const bad = D.loadSave({ v: 2, stars: [5, -1, 2.5, 'a', null, 3], best: [-4, 1e9, 3], bank: -5, far: 'far', color: 7, hat: 99, seen: 9, coach: 'yes' });
  assert.deepEqual(plain(bad.stars), [0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(plain(bad.best.slice(0, 3)), [0, 0, 3]);
  assert.equal(bad.bank, 0); assert.equal(bad.far, 0); assert.equal(bad.color, 0, 'a colour not yet earned'); assert.equal(bad.hat, 0); assert.equal(bad.seen, 0); assert.equal(bad.coach, false);
  // Unlocking: a level opens with one star before it.
  const s = D.loadSave(good);
  assert.equal(D.isOpen(s, 3), true); assert.equal(D.isOpen(s, 4), false);
  assert.equal(D.biomeOpen(s, 1), true); assert.equal(D.biomeOpen(s, 2), false);
  assert.equal(D.nextLevel(s), 3);
  assert.equal(D.totalStars(s), 6);
  assert.equal(D.nextLevel(D.freshSave()), 0);
});

test('the wardrobe opens colours and hats with eggs, cheapest first', () => {
  for (const list of [D.COLORS, D.HATS]) {
    assert.equal(list[0].need, 0);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].need > list[i - 1].need);
  }
  assert.deepEqual(plain(D.unlocks(0, 10)), [{ type: 'hat', i: 1 }]);
  assert.deepEqual(plain(D.unlocks(10, 20)), [{ type: 'color', i: 1 }]);
  assert.deepEqual(plain(D.unlocks(20, 20)), []);
  // Fifteen levels hold enough eggs for most of the wardrobe; the rest is for the endless run.
  const eggs = D.LEVEL.reduce((n, L) => n + D.create({ level: L.i, tier: 3 }).total, 0);
  assert.ok(eggs >= D.COLORS[5].need && eggs < D.HATS[D.HATS.length - 1].need * 2, 'eggs in the journey: ' + eggs);
});
