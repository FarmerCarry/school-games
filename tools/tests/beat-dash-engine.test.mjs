// Beat Dash's pure engine and levels in Node: level 1 is a fair first level for the youngest
// players (a long run-up, every jump on the beat with time to press, pads that need no ring),
// a scripted child who presses on the beat with a realistic timing error clears it in a few
// tries, and the difficulty's slower, more forgiving tries keep the course exactly the same.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BD, HOLD, LEVELS, beatPlayer, context, level1, ms, plain, triesToClear } from './beat-dash-player.mjs';

test('the engine and levels are pure: they load with no DOM, no Kit and no timers', () => {
  assert.equal(typeof BD.tick, 'function');
  assert.equal(LEVELS.length, 5);
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
  for (const def of LEVELS.slice(1)) {
    assert.equal(BD.forgivingAt(0, def.slowest).rate, 0.8, def.id);
    assert.equal(BD.forgivingAt(1, def.slowest).rate, 1, def.id);
    assert.equal(BD.forgivingAt(0, def.slowest).haz, easy.haz, `${def.id} still gets the forgiving hitbox`);
  }
  assert.equal(LEVELS[0].slowest, undefined, 'the first level can slow down the most');
  // The same press positions work at every speed: a slower try only gives more time.
  for (const col of LEVELS[0].tutorial.map(t => t.x)) {
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
