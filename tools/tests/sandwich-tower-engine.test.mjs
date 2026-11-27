// Sandwich Tower's pure engine in Node: drops, perfect snaps, slices, the floor width, growing
// back after perfects, misses and hearts, the bun and the big chomp, stars, saves and eater
// unlocks, every level's difficulty for scripted players, «إلى القمر» and the two-player duel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(repo, 'games/sandwich-tower/engine.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'engine.js' });
const ST = context.window.ST;
const DT = 1 / 60;

// Steps the world until pred is true (or the time runs out) and collects the events.
function stepUntil(w, pred = () => false, seconds = 30) {
  const events = [];
  for (let i = 0; i < seconds * 60; i++) {
    ST.step(w, DT);
    events.push(...w.ev); w.ev.length = 0;
    if (pred(w, events)) break;
  }
  return events;
}
// Waits for the next sliding piece, puts it off from the tower top by off px and drops it.
function dropAt(w, off, i = 0) {
  const t = w.towers[i];
  stepUntil(w, () => t.phase === 'slide' || w.phase !== 'play');
  assert.equal(t.phase, 'slide');
  t.cur.x = t.tx + off;
  assert.equal(ST.drop(w, i), true);
  return stepUntil(w, () => t.phase !== 'fall');
}
// Plays a whole round with a player that decides each frame whether to drop.
function play(opts, player, maxSeconds = 240) {
  const w = ST.create(Object.assign({ mode: 'levels', level: 1, seed: 1 }, opts));
  let rs = (opts.seed || 1) * 99991 + 7;
  const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  const st = {};
  for (let i = 0; i < maxSeconds * 60; i++) {
    const t = w.towers[0];
    if (w.phase === 'play' && t.phase === 'slide' && player(w, t, rnd, st)) ST.drop(w, 0);
    ST.step(w, DT); w.ev.length = 0;
    if (w.phase === 'done') break;
  }
  const t = w.towers[0];
  return { w, won: w.won, done: w.phase === 'done', seconds: w.t, perfects: t.perfects, height: t.height,
    stars: w.won && w.mode === 'levels' ? ST.stars(w.spec.goal, t.perfects) : 0 };
}
const good = (w, t) => Math.abs(t.cur.x - t.tx) <= ST.tolerance(w, t.cur) * 0.5;
const masher = () => true;
const random = (w, t, r) => r() < 0.03;
// The DDA range game.js passes in: easiest and hardest.
const EASY = { speedMul: 0.85, tol: 18 };
const HARD = { speedMul: 1.2, tol: 6 };

test('the engine is pure: no DOM, no Kit, no timers, no Math.random', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random|document\.|Kit\.|setTimeout|setInterval|localStorage|requestAnimationFrame|Date\.now|window\./);
});

test('twelve levels in three worlds that get longer and stricter; levels 1 and 2 cannot be lost', () => {
  assert.equal(ST.COUNT, 12);
  assert.equal(ST.WORLDS.length, 3);
  assert.deepEqual([1, 4, 5, 8, 9, 12].map(ST.worldOf), [0, 0, 1, 1, 2, 2]);
  for (let i = 1; i < ST.COUNT; i++) {
    const a = ST.LEVELS[i - 1], b = ST.LEVELS[i];
    assert.ok(b.goal >= a.goal, 'goal ' + (i + 1));
    // Each world starts a little kinder; within a world the floor and perfect window shrink.
    if (ST.worldOf(i) === ST.worldOf(i + 1)) {
      assert.ok(b.floor <= a.floor, 'floor ' + (i + 1));
      assert.ok(b.tolBonus <= a.tolBonus, 'perfect window ' + (i + 1));
    }
  }
  assert.deepEqual([...ST.LEVELS.map(s => s.move)], ['slide', 'slide', 'slide', 'slide', 'alt', 'alt', 'alt', 'alt', 'swing', 'swing', 'swing', 'swing']);
  for (const L of [0, 1]) {
    const s = ST.LEVELS[L];
    assert.equal(s.hearts, 0, 'misses are free in level ' + (L + 1));
    // The floor is wider than the reach, so even a drop at the very edge overlaps the tower.
    assert.ok(s.floor > s.amp, 'level ' + (L + 1) + ' cannot miss');
  }
  for (let L = 2; L < ST.COUNT; L++) assert.equal(ST.LEVELS[L].hearts, 3);
  for (const k of ST.SILLY.concat(ST.REAL, ['bread', 'bun'])) assert.ok(ST.KINDS[k].h > 0, k);
  for (const s of ST.LEVELS) assert.ok(ST.SILLY.includes(s.feature), s.feature);
});

test('nothing drops without input; a drop only happens while a piece slides', () => {
  const w = ST.create({ level: 3, seed: 5 });
  stepUntil(w, () => false, 10);
  const t = w.towers[0];
  assert.equal(t.drops, 0);
  assert.equal(t.height, 0);
  assert.equal(t.phase, 'slide');
  const x0 = t.cur.x;
  stepUntil(w, () => false, 0.2);
  assert.notEqual(t.cur.x, x0, 'the piece keeps sliding');
  assert.equal(ST.drop(w, 0), true);
  assert.equal(t.drops, 1, 'the drop counts on the press, before it lands');
  assert.equal(ST.drop(w, 0), false, 'a falling piece cannot be dropped again');
  assert.equal(t.drops, 1);
  assert.equal(w.ev.filter(e => e.type === 'drop').length, 1);
  stepUntil(w, () => t.phase !== 'fall');
  assert.equal(t.height, 1);
  assert.equal(ST.drop(w, 0), false, 'nothing to drop while the next piece is on its way');
  assert.equal(ST.drop(w, 5), false, 'an unknown tower is ignored');
});

test('the first piece is bread and each level shows its silly item third; the same seed gives the same sandwich', () => {
  for (let L = 1; L <= ST.COUNT; L++) {
    const w = ST.create({ level: L, seed: 9 });
    const kinds = [w.towers[0].cur.kind];
    for (let k = 0; k < 2; k++) {
      dropAt(w, 0);
      stepUntil(w, () => w.towers[0].phase === 'slide');
      kinds.push(w.towers[0].cur.kind);
    }
    assert.equal(kinds[0], 'bread');
    assert.equal(kinds[2], ST.LEVELS[L - 1].feature, 'level ' + L);
  }
  const seq = seed => { const w = ST.create({ level: 6, seed }); const out = []; for (let k = 0; k < 10; k++) { out.push(w.towers[0].cur.kind); dropAt(w, 0); stepUntil(w, () => w.towers[0].phase === 'slide'); } return out.join(); };
  assert.equal(seq(4), seq(4));
  assert.notEqual(seq(4), seq(5));
});

test('a perfect drop snaps onto the tower and scores 3; an off drop is sliced to the overlap', () => {
  const w = ST.create({ level: 3, seed: 2 });
  const t = w.towers[0];
  const tx = t.tx, w0 = t.tw;
  let ev = dropAt(w, 4);
  let land = ev.find(e => e.type === 'land');
  assert.equal(land.perfect, true);
  assert.equal(t.pieces[0].x, tx, 'snapped to the middle');
  assert.equal(t.tw, w0);
  assert.equal(t.score, 3);
  assert.equal(t.perfects, 1);
  assert.equal(t.combo, 1);
  assert.ok(!ev.some(e => e.type === 'slice'));

  ev = dropAt(w, 100);
  land = ev.find(e => e.type === 'land');
  const slice = ev.find(e => e.type === 'slice');
  assert.equal(land.perfect, false);
  assert.equal(t.tw, w0 - 100, 'only the overlap stays');
  assert.equal(t.tx, tx + 50, 'the kept part sits where it overlapped');
  assert.equal(slice.w, 100);
  assert.equal(slice.side, 1);
  assert.equal(t.score, 4);
  assert.equal(t.combo, 0);
  assert.equal(t.height, 2);
  assert.equal(t.top, ST.KINDS[t.pieces[0].kind].h + ST.KINDS[t.pieces[1].kind].h);

  ev = dropAt(w, -60);
  assert.equal(ev.find(e => e.type === 'slice').side, -1);
  assert.equal(t.tw, w0 - 160);
});

test('the perfect window: base tolerance, the level bonus and a little of the piece speed', () => {
  const w = ST.create({ level: 4, seed: 3, tol: 10 });
  const t = w.towers[0];
  const tol = ST.tolerance(w, t.cur);
  assert.ok(Math.abs(tol - (10 + ST.LEVELS[3].tolBonus + t.cur.v * ST.TOL_TIME)) < 1e-9);
  const strict = ST.create({ level: 4, seed: 3, tol: 0 });
  assert.ok(ST.tolerance(strict, strict.towers[0].cur) < tol);
  assert.ok(dropAt(w, tol - 0.5).find(e => e.type === 'land').perfect);
  stepUntil(w, () => t.phase === 'slide');
  const tol2 = ST.tolerance(w, t.cur);
  assert.ok(!dropAt(w, tol2 + 1).find(e => e.type === 'land').perfect);
});

test('a thin slice is puffed back up to the level floor width', () => {
  const w = ST.create({ level: 3, seed: 2 });
  const t = w.towers[0], spec = ST.LEVELS[2];
  const tx = t.tx, w0 = t.tw;
  const ev = dropAt(w, w0 - 30); // only 30 px overlap
  assert.equal(t.tw, spec.floor);
  assert.equal(t.pieces[0].puff, 1);
  assert.ok(t.tx + spec.floor / 2 <= tx + w0 / 2 + 1e-9, 'still on top of the piece below');
  assert.ok(ev.find(e => e.type === 'slice').w > 0);
});

test('three perfects in a row grow the piece back, never past the start width', () => {
  const w = ST.create({ level: 12, seed: 7 });
  const t = w.towers[0], w0 = t.tw;
  dropAt(w, 90);
  assert.equal(t.tw, w0 - 90);
  let grows = 0;
  for (let k = 1; k <= 6; k++) {
    const ev = dropAt(w, 0);
    const land = ev.find(e => e.type === 'land');
    assert.equal(land.perfect, true);
    if (land.grow) grows++;
    assert.equal(land.grow, k % 3 === 0, 'perfect ' + k);
  }
  assert.equal(grows, 2);
  assert.equal(t.tw, w0 - 90 + 2 * ST.GROW);
  for (let k = 0; k < 6; k++) dropAt(w, 0);
  assert.equal(t.tw, w0, 'grows back to the start width and no further');
  assert.equal(t.bestCombo, 12);
});

test('misses are free in levels 1 and 2; from level 3 each miss costs a heart and three lose', () => {
  const easy = ST.create({ level: 1, seed: 1 });
  dropAt(easy, 0);
  for (let k = 0; k < 4; k++) {
    const ev = dropAt(easy, 900);
    const miss = ev.find(e => e.type === 'miss');
    assert.ok(miss, 'it fell off');
    assert.equal(miss.heart, false);
  }
  assert.equal(easy.phase, 'play');
  assert.equal(easy.towers[0].misses, 4);
  assert.equal(easy.towers[0].height, 1);

  const w = ST.create({ level: 3, seed: 1 });
  const t = w.towers[0];
  dropAt(w, 0);
  for (let k = 1; k <= 3; k++) {
    const ev = dropAt(w, -800);
    const miss = ev.find(e => e.type === 'miss');
    assert.equal(miss.heart, true);
    assert.equal(miss.hearts, 3 - k);
    assert.equal(t.hearts, 3 - k);
    if (k === 3) assert.ok(ev.some(e => e.type === 'lose'));
  }
  assert.equal(w.phase, 'lost');
  assert.equal(w.won, false);
  assert.equal(ST.drop(w, 0), false);
  const ev = stepUntil(w, w => w.phase === 'done', 5);
  assert.deepEqual(ev.filter(e => e.type === 'done').map(e => e.won), [false]);
  assert.ok(w.t > 0 && t.height === 1);
});

test('reaching the goal drops the bun, then the eater chomps everything in a few bites', () => {
  const w = ST.create({ level: 1, seed: 3 });
  const t = w.towers[0], goal = ST.LEVELS[0].goal;
  const ev = [];
  for (let k = 0; k < goal; k++) ev.push(...dropAt(w, 0));
  assert.equal(w.won, true);
  assert.equal(t.height, goal);
  assert.equal(w.phase, 'bun');
  assert.equal(ST.drop(w, 0), false, 'no drops once the goal is reached');
  ev.push(...stepUntil(w, w => w.phase === 'done', 20));
  const types = ev.map(e => e.type).filter(x => x !== 'spawn' && x !== 'drop' && x !== 'land');
  assert.deepEqual(types.slice(0, 3), ['goal', 'bun', 'eat']);
  assert.deepEqual(types.slice(-2), ['burp', 'done']);
  const bites = ev.filter(e => e.type === 'bite');
  assert.ok(bites.length >= 2 && bites.length <= ST.BITES, bites.length + ' bites');
  assert.equal(bites.reduce((n, b) => n + b.count, 0), goal + 1, 'every piece and the bun are eaten');
  assert.equal(bites.at(-1).left, 0);
  assert.equal(t.eaten, t.pieces.length);
  assert.equal(t.pieces.at(-1).kind, 'bun');
  assert.equal(ST.leftTop(t), 0);
  assert.equal(ev.find(e => e.type === 'done').won, true);

  // Tapping during the chomp (game.js sets eatFast) makes it quicker.
  const time = fast => {
    const v = ST.create({ level: 1, seed: 3 });
    for (let k = 0; k < goal; k++) dropAt(v, 0);
    stepUntil(v, v => v.phase === 'eat');
    v.eatFast = fast;
    const t0 = v.t;
    stepUntil(v, v => v.phase === 'done', 20);
    return v.t - t0;
  };
  assert.ok(time(3) < time(1) * 0.6);
});

test('stars: one for finishing, two and three for perfects; the record keeps the best', () => {
  assert.deepEqual([...ST.starNeed(10)], [3, 6]);
  assert.equal(ST.stars(10, 0), 1);
  assert.equal(ST.stars(10, 3), 2);
  assert.equal(ST.stars(10, 6), 3);
  const save = ST.newSave();
  const win = (level, perfects) => {
    const w = ST.create({ level, seed: 1 });
    const goal = w.spec.goal;
    for (let k = 0; k < goal; k++) dropAt(w, k < perfects ? 0 : (k % 2 ? 70 : -70) * (w.towers[0].tw > 150 ? 1 : 0.2));
    stepUntil(w, w => w.phase === 'done', 20);
    return w;
  };
  let w = win(1, 0);
  let r = ST.record(save, w);
  assert.equal(r.stars, 1);
  assert.equal(r.newStars, 1);
  assert.equal(save.stars[0], 1);
  assert.equal(save.best[0], w.towers[0].score);
  assert.equal(r.newBest, true);
  w = win(1, 6);
  r = ST.record(save, w);
  assert.equal(r.stars, 3);
  assert.equal(r.newStars, 2);
  assert.equal(save.stars[0], 3);
  w = win(1, 0);
  r = ST.record(save, w);
  assert.equal(save.stars[0], 3, 'a worse replay keeps the stars');
  assert.equal(r.newStars, 0);
  assert.equal(r.newBest, false);

  const lost = ST.create({ level: 3, seed: 1 });
  for (let k = 0; k < 3; k++) dropAt(lost, 900);
  stepUntil(lost, w => w.phase === 'done', 5);
  r = ST.record(save, lost);
  assert.equal(r.stars, 0);
  assert.equal(save.stars[2], 0);
  assert.equal(save.best[2], 0);
});

test('levels open in order; nextLevel finds the first unbeaten one', () => {
  const save = ST.newSave();
  assert.equal(ST.levelOpen(save, 1), true);
  assert.equal(ST.levelOpen(save, 2), false);
  assert.equal(ST.nextLevel(save), 1);
  save.stars[0] = 1;
  assert.equal(ST.levelOpen(save, 2), true);
  assert.equal(ST.levelOpen(save, 3), false);
  assert.equal(ST.nextLevel(save), 2);
  save.stars.fill(2);
  assert.equal(ST.nextLevel(save), 0, 'everything beaten');
  assert.equal(ST.levelOpen(save, 12), true);
  assert.equal(ST.levelOpen(save, 13), false);
  assert.equal(ST.levelOpen(save, 0), false);
});

test('eaters unlock by total stars (never spent), endless medals count too', () => {
  const needs = ST.EATERS.map(e => e.need);
  assert.equal(needs[0], 0);
  for (let i = 1; i < needs.length; i++) assert.ok(needs[i] > needs[i - 1]);
  assert.ok(needs.at(-1) <= ST.COUNT * 3 + ST.MEDALS.length, 'every eater can be unlocked');
  assert.equal(new Set(ST.EATERS.map(e => e.id)).size, ST.EATERS.length);
  const save = ST.newSave();
  assert.equal(ST.eatersOpen(save), 1);
  save.stars[0] = 3;
  assert.equal(ST.totalStars(save), 3);
  save.endless = 25;
  assert.equal(ST.totalStars(save), 4);
  assert.equal(ST.eaterOpen(save, 1), true);
  assert.equal(ST.eaterOpen(save, 2), false);
  save.endless = 100;
  assert.equal(ST.totalStars(save), 6);

  // A round that crosses a need reports the newly opened eater.
  const s2 = ST.newSave();
  s2.stars[0] = 3;
  const w = ST.create({ level: 2, seed: 4 });
  for (let k = 0; k < w.spec.goal; k++) dropAt(w, 0);
  stepUntil(w, w => w.phase === 'done', 20);
  const r = ST.record(s2, w);
  assert.equal(r.stars, 3);
  assert.deepEqual([...r.eaters], [1], 'six stars open the second eater');
  assert.deepEqual([...ST.record(s2, w).eaters], [], 'reported once');
});

test('loadSave repairs anything odd and keeps good saves', () => {
  const fresh = ST.newSave();
  for (const bad of [null, undefined, 7, 'x', [], { stars: 'lots' }]) assert.deepEqual(JSON.parse(JSON.stringify(ST.loadSave(bad))), JSON.parse(JSON.stringify(fresh)));
  const good = { v: 1, stars: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], best: [20, 30, 31, 0, 0, 0, 0, 0, 0, 0, 0, 0], endless: 44, eater: 1, seen: 2, coach: true, duo: [3, 4] };
  assert.deepEqual(JSON.parse(JSON.stringify(ST.loadSave(good))), good);
  const s = ST.loadSave({ stars: [2, 9, -1, 3, 'x', 1.5], best: [NaN, -5, 1e9], endless: -3, eater: 6, seen: 99, coach: 'yes', duo: [-1, 2] });
  assert.deepEqual([...s.stars], [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'stars after an unbeaten level are dropped');
  assert.deepEqual([...s.best.slice(0, 3)], [0, 0, 0]);
  assert.equal(s.endless, 0);
  assert.equal(s.eater, 0, 'a locked eater falls back to the first');
  assert.equal(s.seen, 1, 'seen cannot pass the open eaters');
  assert.equal(s.coach, false);
  assert.deepEqual([...s.duo], [0, 2]);
});

test('every level is won by a careful player at both ends of the difficulty range', () => {
  for (const dda of [EASY, HARD]) {
    for (let L = 1; L <= ST.COUNT; L++) {
      for (const seed of [1, 2, 3]) {
        const r = play({ level: L, seed, ...dda }, good);
        assert.ok(r.won, `level ${L} seed ${seed} at ${JSON.stringify(dda)}`);
        assert.equal(r.stars, 3);
        assert.ok(r.seconds < 25 + L * 4, `level ${L} took ${r.seconds.toFixed(1)}s`);
      }
    }
  }
});

test('levels 1 and 2 are won by mashing or random tapping, quickly', () => {
  for (const L of [1, 2]) {
    for (const [name, player] of [['masher', masher], ['random', random]]) {
      let won = 0, slow = 0;
      const n = 50;
      for (let seed = 1; seed <= n; seed++) {
        const r = play({ level: L, seed, ...EASY }, player, 90);
        if (r.won) won++;
        if (r.seconds > 40) slow++;
      }
      assert.ok(won / n >= 0.98, `level ${L} ${name} won ${won}/${n}`);
      assert.ok(slow <= 2, `level ${L} ${name}: ${slow} slow rounds`);
    }
  }
});

test('stars take skill: mashing never earns three stars after the first world', () => {
  for (let L = 5; L <= ST.COUNT; L++) {
    let three = 0;
    for (let seed = 1; seed <= 12; seed++) if (play({ level: L, seed, ...HARD }, masher, 120).stars === 3) three++;
    assert.equal(three, 0, 'level ' + L);
  }
});

test('«إلى القمر»: no goal, moves change with the height, it speeds up, and milestones every 25', () => {
  const w = ST.create({ mode: 'endless', seed: 11 });
  const t = w.towers[0];
  assert.equal(w.spec.goal, 0);
  const seen = {};
  const speed = {};
  const ev = [];
  for (let k = 0; k < 80; k++) {
    stepUntil(w, () => t.phase === 'slide');
    const band = t.height < 20 ? 'a' : t.height < 40 ? 'b' : t.height < 60 ? 'c' : 'd';
    (seen[band] = seen[band] || new Set()).add(t.cur.move);
    if (t.cur.move !== 'swing') (speed[band] = speed[band] || []).push(t.cur.speed);
    ev.push(...dropAt(w, 0));
  }
  assert.deepEqual([...seen.a], ['slide']);
  assert.deepEqual([...seen.b], ['alt']);
  assert.deepEqual([...seen.c], ['swing']);
  assert.ok(seen.d.size >= 2, 'mixed above 60');
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(speed.b) > avg(speed.a) * 1.1);
  assert.ok(avg(speed.d) > avg(speed.b));
  assert.deepEqual(ev.filter(e => e.type === 'milestone').map(e => e.height), [25, 50, 75]);
  assert.equal(w.phase, 'play');
  assert.equal(t.height, 80);
});

test('«إلى القمر» ends when the hearts run out: the tower is still eaten and the height is kept', () => {
  const w = ST.create({ mode: 'endless', seed: 2 });
  const t = w.towers[0];
  for (let k = 0; k < 5; k++) dropAt(w, 0);
  const ev = [];
  for (let k = 0; k < 3; k++) ev.push(...dropAt(w, 900));
  assert.equal(ev.find(e => e.type === 'goal').won, false);
  ev.push(...stepUntil(w, w => w.phase === 'done', 20));
  assert.ok(ev.some(e => e.type === 'eat'));
  assert.equal(w.won, false);
  const save = ST.newSave();
  const r = ST.record(save, w);
  assert.equal(r.newBest, true);
  assert.equal(save.endless, 5);
  assert.equal(r.height, 5);
  assert.equal(t.height, 5);
  // With nothing built there is nothing to eat: straight to the result.
  const empty = ST.create({ mode: 'endless', seed: 2 });
  for (let k = 0; k < 3; k++) dropAt(empty, 900);
  assert.equal(empty.phase, 'lost');
});

test('endless towers keep only the newest pieces', () => {
  const w = ST.create({ mode: 'endless', seed: 3, spec: Object.assign({}, ST.ENDLESS, { move: 'slide' }) });
  const t = w.towers[0];
  for (let k = 0; k < ST.MAX_PIECES + 20; k++) {
    stepUntil(w, () => t.phase === 'slide');
    t.cur.x = t.tx; ST.drop(w, 0);
    stepUntil(w, () => t.phase !== 'fall');
  }
  assert.equal(t.height, ST.MAX_PIECES + 20);
  assert.equal(t.pieces.length, ST.MAX_PIECES);
});

test('world 3 swings on a rope: higher at the ends of the swing, fastest in the middle', () => {
  const w = ST.create({ level: 9, seed: 1 });
  const t = w.towers[0];
  let lowY = Infinity, highY = -Infinity, vMid = 0, vEnd = Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 4 * 60; i++) {
    ST.step(w, DT); w.ev.length = 0;
    const c = t.cur, dx = Math.abs(c.x - t.tx);
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    if (dx < 20) { lowY = Math.min(lowY, c.y); vMid = Math.max(vMid, c.v); }
    if (dx > 200) { highY = Math.max(highY, c.y); vEnd = Math.min(vEnd, c.v); }
  }
  assert.ok(highY > lowY + 50, 'the rope lifts the piece at the ends');
  assert.ok(vMid > vEnd * 3);
  assert.ok(maxX - t.tx > 200 && t.tx - minX > 200, 'it swings both ways');
  const before = t.cur.y;
  ST.drop(w, 0);
  const ev = stepUntil(w, () => t.phase !== 'fall');
  assert.ok(ev.some(e => e.type === 'land' || e.type === 'miss'));
  assert.ok(before > t.top);
});

test('the duel: two towers, first to 15 wins, the winner is counted', () => {
  const w = ST.create({ mode: 'duo', seed: 6 });
  assert.equal(w.towers.length, 2);
  assert.deepEqual(w.towers.map(t => t.cx).join(), '320,960');
  assert.equal(w.spec.goal, ST.DUO_GOAL);
  for (let k = 0; k < 10; k++) { dropAt(w, 0, 0); dropAt(w, 40, 1); }
  assert.equal(w.towers[0].height, 10);
  assert.equal(w.towers[1].height, 10);
  for (let k = 0; k < 4; k++) dropAt(w, 0, 1);
  for (let k = 0; k < 5; k++) dropAt(w, 0, 0);
  assert.equal(w.winner, 0);
  assert.equal(w.won, true);
  assert.equal(w.eat.tower, 0);
  assert.equal(ST.drop(w, 1), false, 'the loser stops');
  stepUntil(w, w => w.phase === 'done', 20);
  const save = ST.newSave();
  ST.record(save, w);
  assert.deepEqual([...save.duo], [1, 0]);
});

test('the duel: running out of hearts hands the win to the other player', () => {
  const w = ST.create({ mode: 'duo', seed: 6 });
  dropAt(w, 0, 0);
  for (let k = 0; k < 3; k++) dropAt(w, 700, 0);
  assert.equal(w.towers[0].out, true);
  assert.equal(w.winner, 1);
  assert.equal(w.eat.tower, 1);
  assert.equal(w.phase, 'bun');
  const ev = stepUntil(w, w => w.phase === 'done', 20);
  assert.equal(ev.find(e => e.type === 'done').winner, 1);
});

test('the duel clamps tower tx and sliding pieces away from the 640px center divider', () => {
  const w = ST.create({ mode: 'duo', seed: 12 });
  // Push P1 hard toward the right (divider at 640) and P2 hard toward the left (divider at 640)
  for (let k = 0; k < 12; k++) {
    const t0 = w.towers[0], t1 = w.towers[1];
    dropAt(w, Math.min(t0.tw * 0.45, 90), 0);
    dropAt(w, -Math.min(t1.tw * 0.45, 90), 1);
    stepUntil(w, () => t0.phase === 'slide' && t1.phase === 'slide');
    assert.ok(t0.tx + t0.tw / 2 < 630, `P1 tower edge stays left of 640 divider: tx=${t0.tx}, tw=${t0.tw}`);
    assert.ok(t1.tx - t1.tw / 2 > 650, `P2 tower edge stays right of 640 divider: tx=${t1.tx}, tw=${t1.tw}`);
    assert.ok(t0.cur.cx + t0.cur.amp + t0.cur.w / 2 < 635, `P1 sliding piece stays left of 640 divider`);
    assert.ok(t1.cur.cx - t1.cur.amp - t1.cur.w / 2 > 645, `P2 sliding piece stays right of 640 divider`);
  }
});
