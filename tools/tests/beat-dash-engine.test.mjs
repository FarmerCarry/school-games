// Beat Dash's pure engine and levels in Node: level 1 is a fair first level for the youngest
// players (a long run-up, every jump on the beat with time to press, pads that need no ring),
// a scripted child who presses on the beat with a realistic timing error clears it in a few
// tries, and the difficulty's slower, more forgiving tries keep the course exactly the same.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BD, HOLD, LEVELS, beatPlayer, context, firstSong, level1, ms, plain, triesToClear } from './beat-dash-player.mjs';

test('the engine and levels are pure: they load with no DOM, no Kit and no timers', () => {
  assert.equal(typeof BD.tick, 'function');
  assert.equal(LEVELS.length, 6);
  assert.deepEqual(plain(LEVELS.map(d => d.id)), ['first-song', 'neon-steps', 'pulse-road', 'gravity-jam', 'rocket-rave', 'star-storm']);
  assert.equal('Kit' in context, false);
});

test('level 1 gives a long run-up: with no input the first obstacle comes after more than 4.5 s', () => {
  for (const level of [1, 0.35, 0]) {
    const opt = BD.forgivingAt(level), s = BD.newState(level1);
    while (!s.dead && s.tick < 5000) BD.tick(level1, s, false, false, opt);
    assert.ok(s.x > 40, `the first obstacle is 40 blocks in (${s.x.toFixed(1)})`);
    assert.ok(s.tick / 60 > 4.5 / opt.rate - 0.1, `level ${level}: ${(s.tick / 60).toFixed(2)} s to the first spike`);
  }
});

test('every jump in level 1 is from the ground, on the beat, with at least a quarter second to press', () => {
  const { s, jumps, events } = beatPlayer(level1, BD.forgivingAt(1), 0);
  assert.equal(s.won, true, 'pressing exactly on the beat clears level 1 as designed');
  assert.ok(jumps.length >= 14 && jumps.length <= 20, `${jumps.length} jumps`);
  // The two yellow pads lift the cube onto their wall and road by themselves: no ring to tap.
  assert.equal(events.filter(e => e === 'orb').length, 0, 'no ring is needed');
  assert.equal(events.filter(e => e === 'pad').length, 2, 'both pads are used');
  for (const j of jumps) {
    const where = `jump at x ${j.x.toFixed(1)}`;
    assert.ok(ms(j.last - j.first + 1) >= 230, `${where}: ${ms(j.last - j.first + 1).toFixed(0)} ms to press`);
    assert.ok(ms(j.onBeat - j.first) >= 80, `${where}: the beat is ${ms(j.onBeat - j.first).toFixed(0)} ms after the first good moment`);
    assert.ok(ms(j.last - j.onBeat) >= 80, `${where}: the beat is ${ms(j.last - j.onBeat).toFixed(0)} ms before the last good moment`);
  }
});

test('a child pressing on the beat with a realistic timing error clears level 1 after a few tries', () => {
  // A PC with no results yet (difficulty 0.35): a 70 ms timing error (a careful young player).
  const fresh = Array.from({ length: 12 }, (_, i) => triesToClear(level1, BD.forgivingAt(0.35), 70, 11 + i));
  assert.ok(fresh.every(n => n <= 6), `every player clears it within 6 tries (${fresh})`);
  assert.ok(fresh.filter(n => n === 1).length >= 6, `most clear it on the first try (${fresh})`);
  // After a few quick crashes the difficulty is at its easiest: a 100 ms error (a 6-year-old).
  const easiest = Array.from({ length: 12 }, (_, i) => triesToClear(level1, BD.forgivingAt(0), 100, 31 + i));
  assert.ok(easiest.every(n => n <= 15), `every young player gets through (${easiest})`);
  assert.ok(easiest.reduce((a, b) => a + b) / easiest.length <= 4, `in about 3 tries on average (${easiest})`);
  // As designed (difficulty 1), an older child with a 40 ms error usually clears it at once.
  const designed = Array.from({ length: 8 }, (_, i) => triesToClear(level1, BD.forgivingAt(1), 40, 51 + i));
  assert.ok(designed.filter(n => n === 1).length >= 6, `older players (${designed})`);
});

test('easier tries are slower and more forgiving, and the course and its jumps stay the same', () => {
  assert.deepEqual(plain(BD.forgivingAt(1)), { rate: 1, haz: BD.PHYS.HAZ, buf: BD.PHYS.BUF }, 'the hardest is the game as designed');
  assert.deepEqual(plain(BD.forgivingAt(5)), plain(BD.forgivingAt(1)));
  const easy = BD.forgivingAt(0), mid = BD.forgivingAt(0.35);
  assert.ok(easy.rate < mid.rate && mid.rate < 1 && easy.rate >= 0.6, 'slower when easier');
  assert.ok(easy.haz > mid.haz && mid.haz > BD.PHYS.HAZ, 'smaller spike hitbox when easier');
  assert.ok(easy.buf >= mid.buf && mid.buf >= BD.PHYS.BUF, 'presses remembered longer when easier');
  assert.deepEqual(plain(BD.forgiving({ rate: -1, haz: 3, buf: 'x' })), plain(BD.forgivingAt(1)), 'nonsense falls back to the design');
  // The later courses keep most of their speed for the older children: 80% at the slowest.
  for (const def of LEVELS.slice(2)) {
    assert.equal(BD.forgivingAt(0, def.slowest).rate, def.id === 'pulse-road' ? 0.7 : 0.8, def.id);
    assert.equal(BD.forgivingAt(1, def.slowest).rate, 1, def.id);
    assert.equal(BD.forgivingAt(0, def.slowest).haz, easy.haz, `${def.id} still gets the forgiving hitbox`);
  }
  assert.equal(LEVELS[1].slowest, undefined, 'Neon Steps can slow down the most');
  // The first song is always played at 80%, and slows down to 60%.
  const fs = LEVELS[0];
  assert.ok(Math.abs(BD.forgivingAt(1, fs.slowest, fs.pace).rate - 0.8) < 1e-9 && Math.abs(BD.forgivingAt(0, fs.slowest, fs.pace).rate - 0.6) < 1e-9);
  // The same press positions work at every speed: a slower try only gives more time.
  for (const col of LEVELS[1].tutorial.map(t => t.x)) {
    // (to the 0.05-block sampling: smaller time steps resolve a landing a hair differently)
    const slow = BD.takeoff(level1, col, { ...BD.forgivingAt(1), rate: 0.5 }), full = BD.takeoff(level1, col, BD.forgivingAt(1));
    assert.ok(Math.abs(slow.a - full.a) <= 0.051 && Math.abs(slow.b - full.b) <= 0.051, `same spot at ${col}: ${JSON.stringify([slow, full])}`);
    const wide = BD.takeoff(level1, col, easy), narrow = BD.takeoff(level1, col, BD.forgivingAt(1));
    assert.ok(wide.a <= narrow.a + 0.051 && wide.b >= narrow.b - 0.051, `the easiest spot to jump from is at least as wide at ${col}`);
  }
  const { pressX } = beatPlayer(level1, BD.forgivingAt(1), 0);
  for (const opt of [easy, mid]) {
    const s = BD.newState(level1); let k = 0, hold = 0;
    while (!s.dead && !s.won) {
      if (k < pressX.length && s.x >= pressX[k]) { hold = HOLD; k++; }
      const h = hold > 0; BD.tick(level1, s, h, h && hold === HOLD, opt); if (hold) hold--;
    }
    assert.equal(s.won, true, `pressing at the same places wins at rate ${opt.rate}`);
  }
});

test('the beat clock is level time: a slowed try slows its beat with it', () => {
  const s = BD.newState(level1), opt = BD.forgiving({ rate: 0.5 });
  for (let i = 0; i < 120; i++) BD.tick(level1, s, false, false, opt);
  assert.equal(s.tick, 120);
  assert.ok(Math.abs(BD.time(s) - 1) < 1e-9, `one second of level time in two real seconds (${BD.time(s)})`);
  assert.ok(Math.abs(s.x - level1.speed) < 1e-6, 'the cube ran one second of course: the beat stays on the grid');
  assert.equal(BD.time(BD.clone(s)), BD.time(s), 'a checkpoint keeps the beat clock');
  const old = { ...BD.clone(s) }; delete old.t;
  assert.equal(BD.time(old), 2, 'a state without the clock (an old checkpoint) falls back to real time');
});

// The first song came after the play statistics of November 2026: only 21 of 5,767 rounds
// were won, and most tries crashed on the first spikes of Neon Steps.
const songAt = level => BD.forgivingAt(level, LEVELS[0].slowest, LEVELS[0].pace);

test('the first song is slower and gentler than Neon Steps: single spikes, no pads, more time for every press', () => {
  for (const level of [1, 0]) {
    const s = BD.newState(firstSong), opt = songAt(level);
    while (!s.dead && s.tick < 5000) BD.tick(firstSong, s, false, false, opt);
    assert.ok(s.tick / 60 > 7, `a long run-up at difficulty ${level}: ${(s.tick / 60).toFixed(2)} s to the first spike`);
  }
  const { s, jumps, events } = beatPlayer(firstSong, songAt(1), 0);
  assert.equal(s.won, true, 'pressing exactly on the beat clears it');
  assert.equal(s.stars, 7, 'and takes all three stars on the way');
  assert.equal(events.filter(e => e === 'pad' || e === 'orb').length, 0, 'nothing but jumps');
  assert.ok(jumps.length <= 14, `${jumps.length} jumps`);
  for (const j of jumps) {
    assert.ok(ms(j.last - j.first + 1) > 280, `jump at x ${j.x.toFixed(1)}: ${ms(j.last - j.first + 1).toFixed(0)} ms to press`);
  }
  const neon = beatPlayer(level1, BD.forgivingAt(1), 0).jumps, slowest = Math.min(...jumps.map(j => j.last - j.first));
  assert.ok(slowest > Math.min(...neon.map(j => j.last - j.first)), 'its hardest jump is easier than Neon Steps\' hardest');
});

test('young players clear the first song within a few tries, even with a 120 ms timing error', () => {
  const fresh = Array.from({ length: 12 }, (_, i) => triesToClear(firstSong, songAt(0.35), 90, 71 + i));
  assert.ok(fresh.every(n => n <= 8), `a 90 ms error at the starting difficulty (${fresh})`);
  const easiest = Array.from({ length: 12 }, (_, i) => triesToClear(firstSong, songAt(0), 120, 91 + i));
  assert.ok(easiest.every(n => n <= 8), `a 120 ms error at the easiest (${easiest})`);
});

test('Pulse Road opens gently and its pad lifts the cube onto the wall with no press', () => {
  const def = LEVELS.find(d => d.id === 'pulse-road'), L = BD.compile(def);
  const s = BD.newState(L);
  while (!s.dead && s.tick < 5000) BD.tick(L, s, false, false, BD.forgivingAt(1, def.slowest));
  assert.ok(s.x > 40, `the first spike is 40 blocks in (${s.x.toFixed(1)})`);
  const pad = L.objs.find(o => o.t === 'pad' && o.kind === 'Y');
  const t = BD.newState(L); t.x = t.px = pad.x1 - 3; t.ev = [];
  const seen = [];
  while (!t.dead && t.x < pad.x1 + 8) { BD.tick(L, t, false, false); seen.push(...t.ev.map(e => e.t)); t.ev.length = 0; }
  assert.equal(t.dead, false, `the pad's arc clears the wall (${seen})`);
  assert.ok(seen.includes('pad'), 'the pad was used');
});
