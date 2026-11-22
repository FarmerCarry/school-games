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

test('nine tracks in three worlds, built the same way every time', () => {
  assert.equal(ER.TRACK_COUNT, 9);
  assert.equal(ER.WORLDS.length, 3);
  for (let i = 0; i < 9; i++) {
    const t = ER.track(i);
    assert.equal(t.id, ER.trackId(i));
    assert.equal(t.world, Math.floor(i / 3));
    assert.ok(t.len >= 300 && t.len <= 700, 'track length ' + t.len);
    assert.ok(t.items.length > 4, 'track ' + i + ' has obstacles');
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
  assert.ok(kinds.size >= 3, 'mixed obstacles late on');
});

test('countdown first, then the race starts and the runner jogs forward', () => {
  const r = race();
  ER.step(r, DT, [{ up: true }]);
  assert.equal(r.phase, 'count');
  run(r, 1.5, { up: true });
  assert.equal(r.runners[0].s, 0, 'no running during the countdown');
  toRace(r);
  assert.equal(r.phase, 'race');
  assert.ok(r.ev.some((e) => e.t === 'count' && e.n === 0), 'GO event');
  run(r, 2);
  assert.ok(r.runners[0].s > 10, 'jogging by itself');
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

test('egg past the rim splats, then respawns at the checkpoint with a fresh egg', () => {
  const r = toRace(race());
  run(r, 1);
  const me = r.runners[0];
  me.e = 1.2; me.ev = 3;
  run(r, DT);
  assert.equal(me.state, 'splat');
  assert.equal(me.drops, 1);
  assert.ok(r.ev.some((e) => e.t === 'drop' && e.human));
  r.ev.length = 0;
  run(r, 2);
  assert.equal(me.state, 'run');
  assert.equal(me.s > 0 && me.s < 30, true, 'back near the last checkpoint');
  assert.equal(me.e, me.e); // finite
  assert.ok(Math.abs(me.e) < 0.5, 'fresh egg');
});

test('jumping clears the first-track hurdle; running into it drops the egg', () => {
  const tr = ER.track(0);
  const h = tr.items.find((it) => it.k === 'hurdle' && it.full);
  assert.ok(h, 'track 1 teaches a full-width hurdle');
  // Jump right before it.
  const a = toRace(race());
  const me = a.runners[0];
  me.s = h.s - 3; me.x = 0;
  let jumped = false;
  for (let k = 0; k < 120; k++) {
    const jump = !jumped && me.s > h.s - 1.6;
    if (jump) jumped = true;
    ER.step(a, DT, [{ jump }]);
  }
  assert.equal(me.drops, 0);
  assert.equal(me.hits, 0);
  assert.ok(me.cleared >= 1, 'counted as cleared');
  assert.ok(me.s > h.s);
  // No jump.
  const b = toRace(race());
  const you = b.runners[0];
  you.s = h.s - 3; you.x = 0;
  run(b, 1);
  assert.equal(you.drops, 1, 'tripping on a hurdle drops the egg');
  assert.ok(b.ev.some((e) => e.t === 'hit' && e.k === 'hurdle'));
});

test('after two trips on the same hurdle the runner hops it alone (nobody gets stuck)', () => {
  const r = toRace(race());
  const me = r.runners[0];
  const h = r.track.items.find((it) => it.k === 'hurdle' && it.full);
  me.s = h.s - 8;
  me.cp = 0;
  let guard = 0;
  while (me.s < h.s + 2 && guard++ < 60 * 60) ER.step(r, DT, [{}]);
  assert.ok(me.s > h.s, 'passed the hurdle without pressing anything');
  assert.ok(me.drops <= 2);
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
