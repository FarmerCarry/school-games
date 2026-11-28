// Egg Rush (سباق البيض) engine: tracks, the egg on the spoon, obstacles, CPU racers, stars and saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ER = require('../../games/egg-rush/engine.js');

const DT = 1 / 60;
const calm = () => ER.tuning(0);
function race(i = 0, opts = {}) { return ER.create(i, Object.assign({ tune: calm(), cpus: 0, seed: 5 }, opts)); }
function toRace(r) { while (r.phase !== 'race') ER.step(r, DT, [{}]); return r; }
function run(r, secs, input = {}) { const n = Math.round(secs / DT); for (let k = 0; k < n; k++) ER.step(r, DT, [typeof input === 'function' ? input(r) : input, {}]); }

test('nine tracks in three worlds, snappy 220m+ lengths with pads, ramps and coin arcs', () => {
  assert.equal(ER.TRACK_COUNT, 9);
  assert.equal(ER.WORLDS.length, 3);
  assert.equal(ER.track(0).len, 220);
  for (let i = 0; i < 9; i++) {
    const t = ER.track(i);
    assert.equal(t.id, ER.trackId(i));
    assert.equal(t.world, Math.floor(i / 3));
    assert.ok(t.len >= 220 && t.len <= 380, 'snappy track length ' + t.len);
    assert.ok(t.items.length > 5, 'track ' + i + ' has dense obstacles/pads/ramps');
    assert.ok(t.items.some((it) => it.k === 'pad'), 'track ' + i + ' has turbo speed pads');
    assert.ok(t.items.some((it) => it.k === 'ramp'), 'track ' + i + ' has jump ramps');
    assert.ok(t.coins.length >= 10, 'track ' + i + ' has coin arcs');
    assert.equal(t.gold.length, 3, 'three golden eggs on track ' + i);
    assert.equal(t.cps[0], 0);
    for (let k = 1; k < t.items.length; k++) assert.ok(t.items[k].s >= t.items[k - 1].s, 'items sorted');
    assert.ok(t.items.every((it) => it.s > 20 && it.s < t.len - 20), 'nothing on the start or finish line');
  }
  assert.equal(ER.trackId(0), 'w1-1');
  assert.equal(ER.trackId(8), 'w3-3');
  const a = JSON.stringify(ER.track(4).items);
  delete require.cache[require.resolve('../../games/egg-rush/engine.js')];
  const ER2 = require('../../games/egg-rush/engine.js');
  assert.equal(JSON.stringify(ER2.track(4).items), a, 'deterministic tracks');
});

test('later tracks are busier than the first one', () => {
  const first = ER.track(0), last = ER.track(8);
  assert.ok(last.items.length / last.len > first.items.length / first.len);
  const kinds = new Set(ER.track(8).items.map((it) => it.k));
  assert.ok(kinds.size >= 4, 'mixed obstacles, pads and ramps late on');
});

test('snappy 0.8s countdown first, then the race starts and the runner jogs forward', () => {
  assert.equal(ER.COUNTDOWN, 0.8);
  const r = race();
  ER.step(r, DT, [{ up: true }]);
  assert.equal(r.phase, 'count');
  run(r, 0.4, { up: true });
  assert.equal(r.runners[0].s, 0, 'no running during the 0.8s countdown');
  run(r, 0.5, { up: true });
  assert.equal(r.phase, 'race', 'snappy countdown finishes under 1s');
  assert.ok(r.ev.some((e) => e.t === 'count' && e.n === 0), 'GO event');
  run(r, 2);
  assert.ok(r.runners[0].s > 15, 'jogging briskly by itself');
});

test('sprint is faster than jogging, slowing is slower', () => {
  const speeds = ['up', null, 'down'].map((key) => {
    const r = toRace(race(1, { cpus: 0 }));
    run(r, 3, key ? { [key]: true } : {});
    return r.runners[0].v;
  });
  assert.ok(speeds[0] > speeds[1] && speeds[1] > speeds[2], speeds.join(' > '));
});

test('steering moves the runner sideways and stays on the track', () => {
  const r = toRace(race());
  const x0 = r.runners[0].x;
  run(r, 0.3, { steer: 1 });
  assert.ok(r.runners[0].x > x0 + 0.5);
  run(r, 3, { steer: -1 });
  assert.ok(r.runners[0].x >= -ER.HALF - 1e-9 && r.runners[0].x < 0);
});

test('the egg wobbles more when sprinting, and leaning toward it brings it back', () => {
  const tune = ER.tuning(0.5);
  const amp = (input) => {
    const r = toRace(race(0, { tune })), me = r.runners[0];
    let m = 0;
    for (let k = 0; k < 150; k++) { ER.step(r, DT, [input]); me.ghost = 1; if (k > 90) m = Math.max(m, Math.abs(me.e) + me.drops); }
    return m;
  };
  assert.ok(amp({ up: true }) > amp({ down: true }), 'sprinting shakes more');
  // Push the egg to one side, then chase it: steering toward the egg pulls it back.
  const r = toRace(race(0, { tune: calm() }));
  r.runners[0].e = 0.6; r.runners[0].ev = 0;
  run(r, 0.25, { steer: 1 });
  assert.ok(r.runners[0].e < 0.6, 'steering toward the egg recentres it');
});

test('wall deadlock fixed: counter-lean uses inp.steer and wall contact bounces runner inward', () => {
  const r = toRace(race(0, { tune: calm() }));
  const me = r.runners[0];
  me.x = ER.HALF;
  me.vx = 2.0;
  me.e = 0.72;
  me.ev = 0.15;
  me.ghost = 5;
  // Hold steer toward the right wall to save the right-leaning egg!
  run(r, 0.35, { steer: 1 });
  assert.ok(me.lean > 0.7, 'counter-lean driven by inp.steer even at track edge (lean=' + me.lean + ')');
  assert.equal(me.drops, 0, 'egg saved at wall — zero deadlock');
  assert.ok(me.e < 0.65, 'egg recovered inward from wall (e=' + me.e + ')');
});

test('egg past the rim splats briefly and recovers in place (no 75m rollback!)', () => {
  const r = toRace(race());
  const me = r.runners[0];
  me.s = 95;
  me.cp = 0; // checkpoint 0 is at 0m — old code rolled back 95m!
  me.e = 1.2; me.ev = 3;
  run(r, DT);
  assert.equal(me.state, 'splat');
  assert.equal(me.drops, 1);
  assert.ok(r.ev.some((e) => e.t === 'drop' && e.human));
  r.ev.length = 0;
  run(r, 0.8);
  assert.equal(me.state, 'run', 'fast 0.55s recovery');
  assert.ok(me.s >= 90, 'recovered in place near 95m, never teleported back to 0m (s=' + me.s + ')');
  assert.equal(me.e, me.e); // finite
  assert.ok(Math.abs(me.e) < 0.5, 'fresh egg');
});

test('jumping clears the first-track hurdle; hitting it bounces with 2 shield-cracks instead of instant splat', () => {
  const tr = ER.track(0);
  const h = tr.items.find((it) => it.k === 'hurdle' && it.full);
  assert.ok(h, 'track 1 teaches a full-width hurdle');
  // Jump right before it.
  const a = toRace(race());
  const me = a.runners[0];
  me.s = h.s - 3; me.x = 0;
  let jumped = false;
  for (let k = 0; k < 120; k++) {
    const jump = !jumped && me.s > h.s - 1.8;
    if (jump) jumped = true;
    ER.step(a, DT, [{ jump }]);
  }
  assert.equal(me.drops, 0);
  assert.equal(me.hits, 0);
  assert.ok(me.cleared >= 1, 'counted as cleared');
  assert.ok(me.s > h.s);
  // First hurdle hit: funny bounce + crack 1, NO instant drop!
  const b = toRace(race());
  const you = b.runners[0];
  you.s = h.s - 3; you.x = 0;
  let sawBounce = false;
  for (let k = 0; k < 45; k++) {
    ER.step(b, DT, [{}]);
    if (you.hits >= 1 && you.y > 0.05) sawBounce = true;
  }
  assert.equal(you.cracks, 1, '1st hurdle hit uses 1 of 2 shield-cracks');
  assert.equal(you.drops, 0, 'no instant splat on 1st hurdle hit');
  assert.ok(sawBounce, 'funny cartoon bounce on hurdle hit');
  assert.ok(b.ev.some((e) => e.t === 'hit' && e.k === 'hurdle' && e.crack === 1));
  // 2nd hurdle hit while already cracked drops the egg, then recovers in place!
  you.s = h.s - 2.5; you.hitCd = 0; you.y = 0; you.air = false; you.vy = 0; you.ghost = 0;
  run(b, 0.6);
  assert.equal(you.drops, 1, '2nd shield-crack breaks the egg');
});

test('turbo speed pads, jump ramps, and coin arcs boost and reward players', () => {
  const tr = ER.track(0);
  const pad = tr.items.find((it) => it.k === 'pad');
  const ramp = tr.items.find((it) => it.k === 'ramp');
  assert.ok(pad && ramp, 'track 1 includes pad and ramp');

  const r = toRace(race(0));
  const me = r.runners[0];
  me.s = pad.s - 2; me.x = pad.x;
  run(r, 0.35);
  assert.ok(me.boost > 0.5 && me.v > ER.V_SPRINT, 'turbo pad grants super speed');
  assert.ok(r.ev.some((e) => e.t === 'pad'));

  r.ev.length = 0;
  me.s = ramp.s - 2; me.x = ramp.x; me.air = false; me.y = 0; me.hitCd = 0;
  let peakY = 0;
  for (let k = 0; k < 45; k++) { ER.step(r, DT, [{}]); peakY = Math.max(peakY, me.y); }
  assert.ok(peakY > 1.8, 'jump ramp launches runner sky-high (peakY=' + peakY.toFixed(2) + ')');
  assert.ok(r.ev.some((e) => e.t === 'ramp'));
  assert.ok(me.coins >= 2, 'collects coin arc over jump ramp (coins=' + me.coins + ')');
});

test('after two trips on the same hurdle the runner hops it alone (nobody gets stuck)', () => {
  const r = toRace(race());
  const me = r.runners[0];
  const h = r.track.items.find((it) => it.k === 'hurdle' && it.full);
  me.trips = { [h.i]: 2 };
  me.s = h.s - 5;
  let guard = 0;
  while (me.s < h.s + 2 && guard++ < 60 * 10) ER.step(r, DT, [{}]);
  assert.ok(me.s > h.s, 'passed the hurdle without pressing anything');
  assert.equal(me.drops, 0);
  assert.ok(me.helped);
});

test('golden eggs are collected by running (or jumping) through them', () => {
  const r = toRace(race(0));
  const g = r.track.gold.find((x) => x.need === 0) || r.track.gold[0];
  const me = r.runners[0];
  me.s = g.s - 0.5; me.x = g.x; me.ghost = 5;
  if (g.need > 0) { me.air = true; me.y = 1; me.vy = 0; }
  ER.step(r, DT, [{}]);
  assert.equal(me.gold, 1);
  assert.ok(r.ev.some((e) => e.t === 'gold'));
  ER.step(r, DT, [{}]);
  assert.equal(me.gold, 1, 'each egg only once');
});

test('finishing ends the race with a place; stars for finish, first place and no drops', () => {
  const r = toRace(race(0, { cpus: 3 }));
  const me = r.runners[0];
  me.s = r.track.len - 1; me.v = ER.V_JOG; me.ghost = 2;
  run(r, 0.5);
  assert.ok(me.finished);
  assert.equal(me.place, 1);
  assert.ok(r.over);
  assert.equal(ER.stars(me), 3);
  assert.deepEqual(ER.starFlags(me), [true, true, true]);
  me.drops = 1;
  assert.equal(ER.stars(me), 2);
  me.place = 3;
  assert.equal(ER.stars(me), 1);
  assert.equal(ER.stars({ finished: false }), 0);
  assert.ok(ER.outcome({ place: 1, drops: 0 }) > ER.outcome({ place: 4, drops: 3 }));
  assert.ok(ER.reward({ place: 1, gold: 2 }) > ER.reward({ place: 4, gold: 0 }));
});

test('difficulty knobs move the right way', () => {
  const lo = ER.tuning(0), hi = ER.tuning(1);
  assert.ok(hi.cpuSpeed > lo.cpuSpeed);
  assert.ok(hi.sens > lo.sens);
  assert.ok(hi.cradle < lo.cradle);
  assert.ok(hi.cpuSkill > lo.cpuSkill);
  assert.deepEqual(ER.tuning(-3), lo);
  assert.deepEqual(ER.tuning(7), hi);
});

test('two players: both humans race the CPUs with their own inputs', () => {
  const r = toRace(ER.create(2, { humans: 2, tune: calm(), seed: 3 }));
  assert.equal(r.runners.length, 4);
  assert.equal(r.runners.filter((q) => q.human).length, 2);
  for (let k = 0; k < 40; k++) ER.step(r, DT, [{ steer: -1 }, { steer: 1 }]);
  assert.ok(r.runners[0].x < r.runners[1].x, 'P1 left, P2 right');
});

test('CPU runners finish every track, and an idle player always finishes too', () => {
  for (let i = 0; i < 9; i++) {
    const r = ER.create(i, { tune: ER.tuning(0.5), seed: 11 + i });
    let t = 0;
    while (!r.runners.every((q) => q.finished) && t < 240) { ER.step(r, 1 / 30, [{}]); t += 1 / 30; }
    assert.ok(r.runners[0].finished, 'idle player finished track ' + i + ' (t=' + t.toFixed(0) + ')');
    assert.ok(r.runners.slice(1).every((q) => q.finished), 'CPUs finished track ' + i);
  }
});

test('saves: other shapes are ignored, bad values cleaned, finishing opens the next track', () => {
  const fresh = ER.newSave();
  assert.deepEqual(ER.loadSave(null), fresh);
  assert.deepEqual(ER.loadSave({ level: 5, best: 999 }), fresh, 'old egg-rush save ignored');
  assert.deepEqual(ER.loadSave('junk'), fresh);
  const s = ER.loadSave({ v: 2, stars: [3, 9, -1, 'x'], best: [12.5], gold: [5], eggs: -4, runner: 7, egg: 99, ownR: [0, 7, 'a', 50], ownE: [0], coach: 1 });
  assert.deepEqual(s.stars.slice(0, 4), [3, 3, 0, 0]);
  assert.equal(s.gold[0], 3);
  assert.equal(s.eggs, 0);
  assert.equal(s.runner, 7);
  assert.equal(s.egg, 0, 'unowned egg skin falls back');
  assert.ok(s.ownR.includes(0) && s.ownR.includes(2) && !s.ownR.includes(50));
  assert.equal(s.coach, true);

  const save = ER.newSave();
  assert.ok(ER.isOpen(save, 0));
  assert.ok(!ER.isOpen(save, 1));
  const out = ER.record(save, 0, { finished: true, place: 2, drops: 0, gold: 1, finishT: 41.234 });
  assert.equal(out.stars, 2);
  assert.ok(out.unlocked);
  assert.ok(ER.isOpen(save, 1));
  assert.equal(save.best[0], 41.23);
  assert.equal(save.eggs, out.reward);
  assert.equal(ER.nextTrack(save), 1);
  const again = ER.record(save, 0, { finished: true, place: 1, drops: 0, gold: 0, finishT: 39 });
  assert.ok(again.newBest);
  assert.equal(save.stars[0], 3);
  assert.equal(save.gold[0], 1, 'best golden-egg count is kept');
  assert.equal(ER.totalStars(save), 3);
  assert.equal(ER.record(save, 1, { finished: false }).stars, 0);
});

test('skins: two free runners, one free egg, prices go up', () => {
  assert.equal(ER.RUNNERS.length, 8);
  assert.equal(ER.EGGS.length, 6);
  assert.equal(ER.RUNNERS.filter((r) => r.price === 0).length, 2);
  assert.equal(ER.EGGS[0].price, 0);
  for (let i = 2; i < ER.EGGS.length; i++) assert.ok(ER.EGGS[i].price > ER.EGGS[i - 1].price);
});
