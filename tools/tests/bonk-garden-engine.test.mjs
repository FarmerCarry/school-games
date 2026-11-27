// Bonk Garden's pure engine in Node: bonks, the helmet, the golden broccoli, the bunny
// friend, combos and the FRENZY, the hopping sock, the pie, the endless garden's hearts,
// generous clicks, double clicks, save repair, records and unlocks, and scripted players
// through every level (a good player wins them all; a sloppy or a slow one still wins
// level 1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(repo, 'games/bonk-garden/engine.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'engine.js' });
const BG = context.window.BG;
const DT = 1 / 60;
// Values made inside the vm have its own Array/Object prototypes; compare plain copies.
const plain = v => JSON.parse(JSON.stringify(v));

// Steps the world, collecting its events.
function run(w, seconds, each = () => {}) {
  const events = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    BG.step(w, DT);
    each(w);
    events.push(...w.ev); w.ev.length = 0;
  }
  return events;
}
// A world where nothing pops up on its own, for setting up exact situations.
function still(level = 1, d = 0.35) {
  const w = BG.create({ level, d, seed: 7 });
  w.spec.gap = 1e6; w.spawnT = -1e6;
  return w;
}
// Puts a critter, already up, in hole i.
function put(w, i, kind, extra = {}) {
  const k = BG.KINDS[kind];
  w.holes[i].c = Object.assign({ id: w.nextId++, kind, st: 'up', t: 0, stay: 5, hp: k.hp, helmet: kind === 'helmet', hops: k.hops || 0, free: false, wind: 0, mood: 0, born: w.t }, extra);
  return w.holes[i].c;
}
function swing(w, i) { const ok = BG.swing(w, i); const ev = w.ev.slice(); w.ev.length = 0; return { ok, ev }; }
const live = w => w.holes.filter(h => h.c && h.c.st !== 'hit');

test('the engine is pure: no DOM, no Kit, no timers, no Math.random, no Date', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random|document\.|Kit\.|setTimeout|setInterval|localStorage|requestAnimationFrame|Date\.now|new Date/);
});

test('the twelve levels: three worlds, goals that grow, critters that get quicker', () => {
  assert.equal(BG.LEVELS_N, 12);
  let prev = null;
  for (let n = 1; n <= 12; n++) {
    const s = BG.level(n, 0.35);
    assert.equal(s.n, n);
    assert.ok(s.goals[0] < s.goals[1] && s.goals[1] < s.goals[2], 'goals ' + n);
    assert.equal(s.world, n <= 4 ? 0 : n <= 8 ? 1 : 2, 'world of ' + n);
    assert.equal(s.cols, s.world === 0 ? 3 : 4);
    assert.ok(s.dur >= 30 && s.dur <= 45);
    assert.equal(s.whiffBreaks, n >= 3, 'a miss breaks the combo from level 3 on');
    for (const [kind, wt] of s.kinds) { assert.ok(BG.KINDS[kind], kind); assert.ok(wt > 0); }
    if (prev) {
      assert.ok(s.stay <= prev.stay, 'stay ' + n);
      assert.ok(s.gap <= prev.gap, 'gap ' + n);
      assert.ok(s.goals[0] >= prev.goals[0], 'goal ' + n);
    }
    prev = s;
  }
  // Each new critter is brought in by one level.
  const intros = [];
  for (let n = 1; n <= 12; n++) if (BG.level(n).intro) intros.push(BG.level(n).intro);
  assert.deepEqual(intros, ['helmet', 'disco', 'bunny', 'crab', 'sock', 'pie', 'alien']);
  assert.ok(!BG.level(1).kinds.some(k => k[0] === 'bunny'), 'no bunny to avoid in level 1');
  assert.ok(!BG.level(3).kinds.some(k => k[0] === 'bunny'));
  assert.ok(BG.level(4).kinds.some(k => k[0] === 'bunny'));
});

test('difficulty: d=0 is slower and calmer than d=1, and level 1 is the same gentle garden at any d', () => {
  for (let n = 1; n <= 12; n++) {
    const e = BG.level(n, 0), h = BG.level(n, 1);
    assert.ok(e.stay > h.stay || n === 1, 'stay ' + n);
    assert.ok(e.gap > h.gap || n === 1, 'gap ' + n);
    assert.ok(e.up <= h.up, 'up ' + n);
    const bunny = s => (s.kinds.find(k => k[0] === 'bunny') || [0, 0])[1];
    assert.ok(bunny(e) <= bunny(h), 'bunny ' + n);
    assert.deepEqual(plain(e.goals), plain(h.goals), 'the goals do not move with the difficulty');
  }
  // Level 1 ignores the DDA (one PC is shared by older and younger children).
  for (const d of [0, 0.5, 1, undefined]) {
    const s = BG.level(1, d);
    assert.deepEqual(plain(s), plain(BG.level(1, 0)), 'level 1 at d=' + d);
    assert.ok(s.stay >= 5, 'level 1 critters stay up long');
    assert.ok(s.up <= 2, 'level 1 shows at most two at once');
  }
  // Its carrots stay up as long as its potatoes; later the carrot is the quick one.
  const stays = (level, d) => {
    const w = BG.create({ level, d, seed: 4 }), out = {};
    run(w, 25, v => v.holes.forEach(h => { if (h.c && !out[h.c.id]) out[h.c.id] = [h.c.kind, h.c.stay]; }));
    const by = k => Object.values(out).filter(c => c[0] === k).map(c => c[1]);
    return { potato: Math.min(...by('potato')), carrot: Math.min(...by('carrot')) };
  };
  const one = stays(1, 1);
  assert.ok(one.carrot >= 4.5 && one.potato >= 4.5, 'level 1 at d=1: ' + JSON.stringify(one));
  const two = stays(2, 0.35);
  assert.ok(two.carrot < two.potato * 0.8, 'level 2 carrots are quick: ' + JSON.stringify(two));
  assert.equal(BG.level(99, 0.35).n, 12, 'out-of-range levels are clamped');
  assert.equal(BG.level(-4, 0.35).n, 1);
});

test('the field: 3 by 3, then 4 by 3, keyed like the keyboard and inside the screen', () => {
  const three = BG.layout(3), four = BG.layout(4);
  assert.equal(three.length, 9); assert.equal(four.length, 12);
  assert.deepEqual(three.map(h => h.key).join(''), 'QWEASDZXC');
  assert.deepEqual(four.map(h => h.key).join(''), 'QWERASDFZXCV');
  for (const h of [...three, ...four]) {
    assert.equal(h.code, 'Key' + h.key);
    assert.ok(h.x - h.rx > 120 && h.x + h.rx < 1160, 'clear of the combo jar and the edge');
    assert.ok(h.y - h.h > 160 && h.y + h.ry < 700, 'critters stand below the score panel');
  }
  // Holes do not overlap.
  for (const set of [three, four]) for (const a of set) for (const b of set) {
    if (a !== b && a.row === b.row) assert.ok(Math.abs(a.x - b.x) > a.rx + b.rx, 'row overlap');
  }
  assert.equal(BG.neighbours({ holes: three }, 4).length, 4, 'the middle hole has four neighbours');
  assert.equal(BG.neighbours({ holes: three }, 0).length, 2, 'a corner has two');
  assert.equal(BG.neighbours({ holes: four }, 5).length, 4);
});

test('the same seed plays the same garden; another seed plays another', () => {
  const log = seed => { const w = BG.create({ level: 6, d: 0.5, seed }); return run(w, 25).map(e => e.type + e.hole + (e.kind || '')).join(','); };
  assert.equal(log(11), log(11));
  assert.notEqual(log(11), log(12));
});

test('a bonk scores, grows the combo and squashes the critter; a whiff only counts the swing', () => {
  const w = still(1);
  put(w, 4, 'potato');
  let r = swing(w, 4);
  assert.equal(r.ok, true);
  assert.equal(w.score, 1); assert.equal(w.combo, 1); assert.equal(w.swings, 1); assert.equal(w.hits, 1);
  assert.equal(r.ev[0].type, 'bonk'); assert.equal(r.ev[0].pts, 1); assert.equal(r.ev[0].kind, 'potato');
  assert.equal(w.holes[4].c.st, 'hit');
  r = swing(w, 4);
  assert.equal(r.ok, false, 'a squashed critter cannot be bonked twice');
  assert.equal(w.score, 1); assert.equal(w.swings, 2); assert.equal(w.whiffs, 0, 'nor is it a whiff');
  run(w, BG.HIT + 0.05);
  assert.equal(w.holes[4].c, null, 'the squashed critter is gone after a moment');
  r = swing(w, -1);
  assert.equal(r.ev[0].type, 'whiff'); assert.equal(w.swings, 3); assert.equal(w.whiffs, 1);
  assert.equal(w.combo, 1, 'level 1 forgives misses');
  // The carrot, the crab and the alien are worth 1; the golden broccoli 5; the sock 2.
  for (const [kind, pts] of [['carrot', 1], ['crab', 1], ['alien', 1], ['disco', 5], ['sock', 2], ['pie', 2]]) {
    const v = still(5); put(v, 0, kind); swing(v, 0);
    assert.equal(v.score, pts, kind);
  }
});

test('a critter can be bonked as it rises and early as it sinks, not once it is gone', () => {
  const w = still(1);
  put(w, 0, 'potato', { st: 'rise', t: 0.02 });
  assert.equal(swing(w, 0).ok, true);
  put(w, 1, 'potato', { st: 'down', t: 0.05 });
  assert.equal(swing(w, 1).ok, true);
  put(w, 2, 'potato', { st: 'down', t: BG.SINK * 0.8 });
  assert.equal(swing(w, 2).ok, false);
});

test('the helmet takes two bonks: tink, then bonk', () => {
  const w = still(2);
  const c = put(w, 3, 'helmet');
  let r = swing(w, 3);
  assert.equal(r.ev[0].type, 'clank');
  assert.equal(w.score, 1); assert.equal(c.helmet, false); assert.equal(c.st, 'up', 'still up for the second bonk');
  r = swing(w, 3);
  assert.equal(r.ev[0].type, 'bonk'); assert.equal(r.ev[0].pts, 2);
  assert.equal(w.score, 3); assert.equal(w.combo, 2); assert.equal(w.bonks, 2);
  // Knocking the helmet off late still leaves time for the second bonk.
  const v = still(2); const late = put(v, 0, 'helmet', { t: 4.9, stay: 5 });
  swing(v, 0);
  assert.ok(late.stay - late.t >= 0.9);
});

test('the bunny is a friend: bonking it costs 3 (never below 0) and breaks the combo', () => {
  const w = still(4);
  w.score = 10; w.combo = 6;
  put(w, 2, 'bunny');
  let r = swing(w, 2);
  assert.equal(r.ok, false);
  assert.equal(r.ev[0].type, 'ouch'); assert.equal(r.ev[0].lost, 3);
  assert.equal(w.score, 7); assert.equal(w.combo, 0); assert.equal(w.ouches, 1); assert.equal(w.swings, 1);
  const v = still(4); v.score = 2; put(v, 2, 'bunny');
  r = swing(v, 2);
  assert.equal(v.score, 0); assert.equal(r.ev[0].lost, 2);
  // A bunny that goes back down on its own just waves bye (and costs nothing).
  const u = still(4); put(u, 1, 'bunny', { stay: 0.1 });
  const ev = run(u, 1);
  assert.ok(ev.some(e => e.type === 'bye'));
  assert.ok(!ev.some(e => e.type === 'escape'));
});

test('from level 3 a whiff breaks the combo; levels 1 and 2 forgive it', () => {
  for (const [n, breaks] of [[1, false], [2, false], [3, true], [9, true]]) {
    const w = still(n);
    put(w, 0, BG.WORLDS[w.spec.world].base); swing(w, 0);
    put(w, 1, BG.WORLDS[w.spec.world].base); swing(w, 1);
    const r = swing(w, 5);
    assert.equal(w.combo, breaks ? 0 : 2, 'level ' + n);
    assert.equal(r.ev[0].broke, breaks);
  }
});

test('a double click on a critter just bonked is harmless: no whiff, the combo and the jar stay', () => {
  for (const level of [3, 5, 12]) {
    const w = still(level), base = BG.WORLDS[w.spec.world].base;
    // A front-row critter: its body is nearer the middle-row hole behind it than its own.
    const front = w.holes.findIndex(h => h.row === 2 && h.col === 1), h = w.holes[front];
    const x = h.x, y = h.y - h.h * 0.5;
    w.combo = 4;
    put(w, front, base);
    assert.equal(BG.holeAt(w, x, y), front);
    assert.equal(swing(w, BG.holeAt(w, x, y)).ok, true);
    run(w, 0.1);
    assert.equal(BG.holeAt(w, x, y), front, 'the second click still means the squashed critter');
    for (let k = 0; k < 2; k++) {
      const r = swing(w, BG.holeAt(w, x, y));
      assert.equal(r.ok, false);
      assert.deepEqual(plain(r.ev.map(e => e.type)), ['again'], 'level ' + level);
    }
    assert.deepEqual([w.combo, w.bonks, w.whiffs, w.swings, w.score], [5, 1, 0, 3, 1], 'level ' + level);
    run(w, BG.HIT);
    assert.equal(swing(w, front).ev[0].type, 'whiff', 'once it is gone, the empty hole is a whiff again');
    assert.equal(w.combo, 0);
  }
  // A squashed critter never wins over a live one near the click.
  const w = still(5), mid = w.holes.findIndex(h => h.row === 1 && h.col === 1), back = w.holes.findIndex(h => h.row === 0 && h.col === 1);
  put(w, mid, 'crab', { st: 'hit' }); put(w, back, 'crab');
  assert.equal(BG.holeAt(w, w.holes[back].x, w.holes[back].y - 20), back);
  // A squashed bunny bonked again costs nothing more.
  const v = still(4); v.score = 9; put(v, 0, 'bunny');
  swing(v, 0); swing(v, 0);
  assert.deepEqual([v.score, v.ouches, v.whiffs], [6, 1, 0]);
});

test('ten bonks in a row start the FRENZY: every hole pops, points x2, the giant hammer bonks the neighbours', () => {
  const w = still(3);
  let frenzy = [];
  for (let k = 0; k < BG.COMBO; k++) {
    put(w, 4, 'potato');
    frenzy = swing(w, 4).ev.filter(e => e.type === 'frenzy');
    w.holes[4].c = null; w.holes[4].cool = 0;
    if (k < BG.COMBO - 1) assert.equal(w.frenzy, 0);
  }
  assert.equal(frenzy.length, 1, 'the tenth bonk starts it');
  assert.equal(w.frenzy, BG.FRENZY); assert.equal(w.frenzies, 1);
  assert.equal(w.score, 10);
  let ev = run(w, DT);
  assert.equal(w.holes.filter(h => h.c).length, 9, 'every hole pops');
  assert.ok(ev.filter(e => e.type === 'pop').every(e => e.free));
  assert.ok(w.holes.every(h => h.c.free && h.c.kind !== 'bunny' && h.c.kind !== 'helmet'));
  // A bunny next door is safe from the giant hammer.
  put(w, 1, 'bunny');
  const nb = BG.neighbours(w, 4);
  const expect = [4, ...nb].filter(i => w.holes[i].c.kind !== 'bunny').reduce((s, i) => s + BG.KINDS[w.holes[i].c.kind].pts * 2, 0);
  const before = w.score;
  const r = swing(w, 4);
  assert.equal(w.score - before, expect, 'x2 for the critter and its neighbours');
  assert.equal(r.ev.filter(e => e.type === 'bonk').length, 4);
  assert.ok(r.ev.filter(e => e.type === 'bonk' && e.hole !== 4).every(e => e.extra));
  assert.equal(w.holes[1].c.st, 'up', 'the bunny is untouched'); assert.equal(w.ouches, 0);
  // Misses do not break a frenzy combo.
  const combo = w.combo;
  swing(w, -1);
  assert.equal(w.combo, combo);
  ev = run(w, BG.FRENZY + 0.1);
  assert.ok(ev.some(e => e.type === 'calm'));
  assert.equal(w.frenzy, 0); assert.equal(w.combo, 0, 'the combo starts again after a frenzy');
  assert.ok(live(w).length <= w.spec.up + 9, 'frenzy critters go back down');
});

test('the sneaky sock hops to another hole twice before it goes', () => {
  const w = still(6);
  const c = put(w, 0, 'sock', { stay: 0.3 });
  const ev = run(w, 3);
  const hops = ev.filter(e => e.type === 'hop');
  assert.equal(hops.length, 2);
  assert.ok(hops.every(e => e.id === c.id && e.kind === 'sock'));
  assert.notEqual(hops[0].hole, 0, 'it pops up somewhere else');
  assert.equal(ev.filter(e => e.type === 'escape').length, 1, 'then it gets away once');
  // Bonked while up, it scores 2.
  const v = still(6); put(v, 7, 'sock'); swing(v, 7);
  assert.equal(v.score, 2);
});

test('the pie winds up and splats the screen if it is not bonked in time', () => {
  const w = still(8);
  const c = put(w, 2, 'pie', { stay: 1 });
  run(w, 0.7);
  assert.ok(c.wind > 0.3, 'it warns before it throws');
  const ev = run(w, 0.5);
  assert.ok(ev.some(e => e.type === 'pie' && e.hole === 2));
  assert.equal(w.pies, 1);
  const v = still(8); put(v, 2, 'pie', { stay: 1 }); run(v, 0.5); swing(v, 2);
  assert.ok(!run(v, 2).some(e => e.type === 'pie'), 'a bonked pie never flies');
});

test('a level is a timed round: time, then the end, and no swings after the bell', () => {
  const w = BG.create({ level: 1, d: 0.35, seed: 3 });
  const ev = run(w, 32);
  const types = ev.map(e => e.type);
  assert.ok(types.includes('time') && types.includes('end'));
  assert.ok(types.indexOf('time') < types.indexOf('end'));
  assert.equal(w.t, w.spec.dur); assert.equal(w.phase, 'done');
  const end = ev.find(e => e.type === 'end');
  assert.equal(end.level, 1); assert.equal(end.endless, false); assert.equal(end.score, 0); assert.equal(end.stars, 0);
  assert.equal(w.hearts, 0, 'levels have no hearts');
  assert.equal(BG.swing(w, 0), false); assert.equal(w.swings, 0);
  // Nothing pops after the bell, and the critters that were up go quietly.
  assert.ok(!ev.slice(types.indexOf('time')).some(e => e.type === 'pop' || e.type === 'escape'));
});

test('the endless garden: three hearts, a heart for each critter that gets away, never for frenzy ones', () => {
  const w = still(0);
  assert.equal(w.spec.endless, true); assert.equal(w.hearts, 3); assert.equal(w.holes.length, 12);
  put(w, 0, 'potato', { stay: 0.1 });
  let ev = run(w, 0.5);
  assert.equal(w.hearts, 2);
  assert.ok(ev.some(e => e.type === 'escape' && e.heart && e.hearts === 2));
  put(w, 1, 'potato', { stay: 0.1, free: true });
  put(w, 2, 'bunny', { stay: 0.1 });
  run(w, 0.5);
  assert.equal(w.hearts, 2, 'free critters and the bunny cost nothing');
  put(w, 3, 'carrot', { stay: 0.1 }); put(w, 4, 'crab', { stay: 0.1 });
  ev = run(w, 0.5);
  assert.equal(w.hearts, 0);
  assert.ok(ev.some(e => e.type === 'out'));
  ev = run(w, BG.OVER + 0.1);
  const end = ev.find(e => e.type === 'end');
  assert.ok(end && end.endless); assert.equal(w.phase, 'done');
  // During a frenzy nothing costs a heart.
  const v = still(0); v.frenzy = 3; put(v, 0, 'potato', { stay: 0.1 });
  run(v, 0.5);
  assert.equal(v.hearts, 3);
});

test('the endless garden gets busier every 12 s and moves to the beach and the moon', () => {
  for (let s = 0; s < 20; s++) {
    const a = BG.endless(s, 0.35), b = BG.endless(s + 1, 0.35);
    assert.ok(b.stay <= a.stay && b.gap <= a.gap && b.up >= a.up, 'stage ' + s);
    assert.ok(b.kinds.length >= a.kinds.length || b.world !== a.world);
    assert.ok(b.stay >= 0.5 && b.up <= 6, 'it stays humanly possible');
  }
  assert.equal(BG.endless(0).world, 0); assert.equal(BG.endless(4).world, 1); assert.equal(BG.endless(8).world, 2); assert.equal(BG.endless(12).world, 0);
  const w = BG.create({ level: 0, d: 0.35, seed: 5 });
  w.t = BG.ENDLESS_STAGE * 4 - 0.001;
  const ev = run(w, DT * 2);
  const st = ev.find(e => e.type === 'stage');
  assert.ok(st); assert.equal(st.stage, 4); assert.equal(st.world, 1); assert.equal(st.newWorld, true);
});

test('pops: never a bunny first, one bunny, one broccoli and one pie at a time, never more up than allowed', () => {
  for (let n = 1; n <= 12; n++) for (const d of [0, 1]) for (let seed = 1; seed <= 6; seed++) {
    const w = BG.create({ level: n, d, seed });
    const firsts = new Set(); let pops = 0;
    run(w, w.spec.dur, v => {
      const up = live(v);
      assert.ok(up.length <= v.spec.up, `level ${n}: ${up.length} up`);
      for (const k of ['bunny', 'disco', 'pie']) assert.ok(up.filter(h => h.c.kind === k).length <= 1, k);
      for (const e of v.ev) {
        if (e.type !== 'pop') continue;
        if (pops++ < 2) assert.notEqual(e.kind, 'bunny');
        assert.ok(v.spec.kinds.some(k => k[0] === e.kind), e.kind + ' belongs to level ' + n);
        if (e.first) { assert.ok(!firsts.has(e.kind)); firsts.add(e.kind); }
      }
    });
    assert.ok(pops >= w.spec.dur / 3, 'level ' + n + ' keeps popping: ' + pops);
  }
});

test('clicks are generous: near a critter counts, the grass is -1, a tall critter wins over the hole behind it', () => {
  for (const level of [1, 5]) {
    const w = still(level);
    w.holes.forEach((h, i) => {
      assert.equal(BG.holeAt(w, h.x, h.y), i);
      assert.equal(BG.holeAt(w, h.x + h.rx * 0.9, h.y), i);
      assert.equal(BG.holeAt(w, h.x - h.rx * 0.9, h.y + h.ry * 1.5), i, 'on the front of the mound');
      const last = w.spec.cols - 1;
      if (h.col === 0 || h.col === last) assert.equal(BG.holeAt(w, h.x + (h.col === 0 ? -1 : 1) * h.rx * 1.15, h.y), i, 'just past the outer rim');
    });
    assert.equal(BG.holeAt(w, 40, 700), -1);
    assert.equal(BG.holeAt(w, 640, 60), -1, 'the sky is not a hole');
    const mid = w.holes.findIndex(h => h.row === 1 && h.col === 1);
    const h = w.holes[mid];
    put(w, mid, 'helmet');
    assert.equal(BG.holeAt(w, h.x, h.y - h.h * 0.92), mid, 'its head, over the hole behind');
    assert.equal(BG.holeAt(w, h.x + h.rx * 0.5, h.y - h.h * 0.5), mid);
  }
});

test('saves: a fresh save, and every odd field repaired', () => {
  const fresh = BG.newSave();
  assert.deepEqual(plain(fresh), { v: 1, stars: Array(12).fill(0), best: Array(12).fill(0), endless: 0, hammer: 0, coach: false, keys: false, rounds: 0 });
  for (const junk of [null, undefined, 'x', 42, [], [1, 2], true]) assert.deepEqual(plain(BG.loadSave(junk)), plain(fresh));
  const s = BG.loadSave({ stars: [3, 'x', -1, 9, 2.7, null], best: [1, NaN, 5, 1e12, 1], endless: -3, hammer: 7, coach: 'yes', keys: true, rounds: -5, extra: 'junk' });
  assert.deepEqual(plain(s.stars), [3, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(s.best[0], BG.level(1).goals[2], 'a best below its stars is raised to the goal');
  assert.equal(s.best[1], 0); assert.equal(s.best[2], 5); assert.equal(s.best[3], 0);
  assert.equal(s.best[4], BG.level(5).goals[1]);
  assert.equal(s.hammer, 0, 'a hammer that is not unlocked falls back to the first');
  assert.equal(s.coach, false); assert.equal(s.keys, true); assert.equal(s.rounds, 0); assert.equal(s.endless, 0);
  assert.equal('extra' in s, false);
  const ok = BG.loadSave({ stars: [3, 1], best: [30, 9], hammer: 1, endless: 44, coach: true, rounds: 3 });
  assert.equal(ok.hammer, 1); assert.equal(ok.endless, 44); assert.equal(ok.coach, true); assert.equal(ok.rounds, 3);
  assert.deepEqual(plain(BG.loadSave(plain(ok))), plain(ok), 'a good save loads unchanged');
});

test('records: stars and bests only go up, levels open one by one, hammers and the endless garden unlock', () => {
  const s = BG.newSave();
  assert.equal(BG.next(s), 1);
  assert.equal(BG.unlocked(s, 1), true); assert.equal(BG.unlocked(s, 2), false);
  let r = BG.record(s, 1, 4);
  assert.equal(r.stars, 0); assert.equal(r.opened, 0); assert.equal(s.best[0], 4); assert.equal(BG.next(s), 1);
  r = BG.record(s, 1, 5);
  assert.equal(r.stars, 1); assert.equal(r.gained, 1); assert.equal(r.opened, 2); assert.equal(r.newBest, true);
  assert.equal(BG.next(s), 2); assert.equal(BG.unlocked(s, 3), false);
  r = BG.record(s, 1, 24);
  assert.equal(r.stars, 3); assert.equal(r.gained, 2); assert.deepEqual(plain(r.hammers), [1], 'three stars open the rubber chicken');
  assert.equal(r.opened, 0, 'level 2 was already open');
  r = BG.record(s, 1, 9);
  assert.equal(s.stars[0], 3); assert.equal(s.best[0], 24); assert.equal(r.newBest, false); assert.equal(r.gained, 0);
  BG.record(s, 2, 8); BG.record(s, 3, 10);
  assert.equal(BG.endlessOpen(s), false);
  r = BG.record(s, 4, 10);
  assert.equal(r.endless, true, 'winning level 4 opens the endless garden');
  assert.equal(BG.endlessOpen(s), true);
  assert.equal(BG.next(s), 5);
  for (let n = 1; n <= 12; n++) BG.record(s, n, 999);
  assert.equal(BG.totalStars(s), 36); assert.equal(BG.next(s), 0, 'all won: Play goes to the endless garden');
  for (let h = 0; h < BG.HAMMERS.length; h++) assert.ok(BG.hammerOpen(s, h));
  let e = BG.recordEndless(s, 40);
  assert.equal(e.newBest, true); assert.equal(s.endless, 40);
  e = BG.recordEndless(s, 12);
  assert.equal(e.newBest, false); assert.equal(s.endless, 40); assert.equal(e.stars, 0);
});

test('hammers: the first is free, the second comes within the first levels, all are reachable', () => {
  const H = BG.HAMMERS;
  assert.equal(H[0].stars, 0);
  assert.ok(H[1].stars <= 3);
  for (let i = 1; i < H.length; i++) assert.ok(H[i].stars > H[i - 1].stars);
  assert.ok(H[H.length - 1].stars <= 36);
  assert.equal(new Set(H.map(h => h.id)).size, H.length);
});

/* ------------------------------------------------------------ scripted players */
// react: seconds before a new critter is noticed; travel: seconds per 230 px of hammer
// travel; cadence: rest between swings; bunny: chance to bonk a bunny anyway; whiff:
// chance to hit the wrong hole.
const GOOD = { react: 0.45, travel: 0.25, cadence: 0.22, bunny: 0.02, whiff: 0.05 };
function aimed(level, d, seed, P) {
  const w = BG.create({ level, d, seed }), r = BG.rng(seed * 31 + 7), seen = new Map();
  let busy = 0, target = null, hx = 640, hy = 470;
  while (w.phase !== 'done' && w.t < 400) {
    BG.step(w, DT); w.ev.length = 0;
    const now = w.t + w.pt;
    w.holes.forEach((h, i) => { if (h.c && !seen.has(h.c.id + ':' + i)) seen.set(h.c.id + ':' + i, now); });
    if (now >= busy) {
      let best = -1, bestT = 1e9;
      w.holes.forEach((h, i) => {
        if (!BG.bonkable(h.c) || now - seen.get(h.c.id + ':' + i) < P.react) return;
        if (BG.KINDS[h.c.kind].friend && r() > P.bunny) return;
        const pri = seen.get(h.c.id + ':' + i) - (h.c.kind === 'disco' ? 1 : 0);
        if (pri < bestT) { bestT = pri; best = i; }
      });
      if (best >= 0) {
        const h = w.holes[best], travel = P.travel * Math.min(2, Math.hypot(h.x - hx, h.y - hy) / 230);
        target = { i: best, at: now + travel };
        busy = now + travel + P.cadence * (0.8 + r() * 0.4);
        hx = h.x; hy = h.y;
      }
    }
    if (target && now >= target.at) { BG.swing(w, r() < P.whiff ? (target.i + 1) % w.holes.length : target.i); target = null; }
  }
  return w;
}
// Swings every 0.4..1.3 s; only a third of the swings aim at a critter it noticed
// more than a second ago, the rest go into any hole at all (bunnies included).
function sloppy(level, d, seed) {
  const w = BG.create({ level, d, seed }), r = BG.rng(seed * 97 + 3), seen = new Map();
  let next = 0.5;
  while (w.phase !== 'done' && w.t < 400) {
    BG.step(w, DT); w.ev.length = 0;
    const now = w.t + w.pt;
    w.holes.forEach((h, i) => { if (h.c && !seen.has(h.c.id + ':' + i)) seen.set(h.c.id + ':' + i, now); });
    if (now >= next) {
      next = now + 0.4 + r() * 0.9;
      let i = Math.floor(r() * w.holes.length);
      if (r() < 0.35) w.holes.forEach((h, j) => { if (BG.bonkable(h.c) && now - seen.get(h.c.id + ':' + j) > 1.2) i = j; });
      BG.swing(w, i);
    }
  }
  return w;
}

test('every level is won by a scripted good player at any difficulty, and three stars are within reach', () => {
  for (let n = 1; n <= 12; n++) {
    let three = 0;
    for (const d of [0.35, 1]) for (let seed = 1; seed <= 5; seed++) {
      const w = aimed(n, d, seed, GOOD);
      assert.ok(w.stars >= 1, `level ${n} d=${d} seed ${seed}: ${w.score} < ${w.spec.goals[0]}`);
      if (d === 0.35 && w.stars === 3) three++;
    }
    assert.ok(three >= 3, `level ${n}: three stars in ${three}/5`);
  }
});

// A slow five-year-old: a second and more to notice a critter, a second per 230 px to
// get the hammer there, a rest between swings, and a third of the swings miss.
const SLOW = { react: 1.2, travel: 1.0, cadence: 0.6, bunny: 0, whiff: 0.3 };
const SLOWER = { react: 1.5, travel: 1.2, cadence: 0.6, bunny: 0, whiff: 0.2 };
test('level 1 is won by a slow player in nearly every seed, whatever the DDA says', () => {
  for (const P of [SLOW, SLOWER]) for (const d of [0.35, 1]) {
    let won = 0;
    for (let seed = 1; seed <= 200; seed++) if (aimed(1, d, seed, P).stars >= 1) won++;
    assert.ok(won >= 190, `react ${P.react} s, d=${d}: ${won}/200`);
  }
});

test('level 1 is won by a sloppy, mostly random player in nearly every seed', () => {
  for (const d of [0, 0.35, 1]) {
    let won = 0;
    for (let seed = 1; seed <= 100; seed++) if (sloppy(1, d, seed).stars >= 1) won++;
    assert.ok(won >= 95, `d=${d}: ${won}/100`);
  }
});

test('the endless garden lasts a good while for a good player and ends for a player who does nothing', () => {
  let t = 0;
  for (let seed = 1; seed <= 5; seed++) { const w = aimed(0, 0.35, seed, GOOD); assert.equal(w.phase, 'done'); t += w.t; }
  assert.ok(t / 5 >= 60, 'a good player lasts a minute or more: ' + (t / 5).toFixed(0));
  const idle = BG.create({ level: 0, d: 0.35, seed: 1 });
  const ev = run(idle, 60);
  assert.ok(ev.some(e => e.type === 'end'));
  assert.ok(idle.t < 30, 'three critters get away soon: ' + idle.t.toFixed(1));
});
