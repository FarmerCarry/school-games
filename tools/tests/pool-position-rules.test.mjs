import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const levels = require('../../games/pool-party/levels.js');
const physics = require('../../games/pool-party/physics.js');

const zone = { x: 500, y: 400, r: 50 };
const puzzle = { targets: [1], shots: 1, cueZone: zone };
const pot = { n: 1, pocket: 3, cush: 1 };
function state(x = 500, y = 400, targetOn = false) {
  return { balls: [{ n: 0, on: true, x, y }, { n: 1, on: targetOn, x: 800, y: 500 }] };
}
function judge(lv = puzzle, st = state(), pots = [pot], shotsUsed = 1) {
  return levels.judge(lv, { shotsUsed }, { pots }, st);
}

test('position requires the stopped cue center inside the circle, including its boundary', () => {
  for (const [x, y] of [[500, 400], [550, 400], [530, 440], [450, 400]]) {
    assert.equal(judge(puzzle, state(x, y)).status, 'win');
  }
  for (const [x, y] of [[550.01, 400], [530, 440.01], [540, 440]]) {
    const result = judge(puzzle, state(x, y));
    assert.equal(result.status, 'fail');
    assert.match(result.reason, /مركز البيضاء خارج الدائرة/);
  }
  assert.equal(judge({ targets: [1], shots: 1 }, state(800, 500)).status, 'win', 'old puzzles have no position restriction');
});

test('the position is checked after the final target, not between shots or instead of potting', () => {
  const lv = { ...puzzle, shots: 2 };
  assert.equal(judge(lv, state(800, 500, true), []).status, 'go');
  assert.equal(judge(lv, state(500, 400, true), [], 2).status, 'fail', 'being in the circle alone is not success');
  assert.equal(judge(lv, state(800, 500)).status, 'fail', 'the final pot must leave position on that shot');
  assert.equal(judge(lv, state()).status, 'win');
});

test('scratch, wrong pocket, forbidden pot, bank and eight-last rules retain priority', () => {
  const scratched = state(); scratched.balls[0].on = false;
  assert.match(judge(puzzle, scratched, [pot, { n: 0 }]).reason, /سقطت الكرة البيضاء/);
  assert.match(judge(puzzle, scratched).reason, /سقطت الكرة البيضاء/);
  assert.match(judge(puzzle, { balls: [{ n: 1, on: false }] }).reason, /سقطت الكرة البيضاء/);
  assert.match(judge({ ...puzzle, pockets: [5] }).reason, /الجيب الخطأ/);
  assert.match(judge({ ...puzzle, avoid: [8] }, state(), [pot, { n: 8 }]).reason, /ليس الكرة 8/);
  assert.match(judge({ ...puzzle, bank: true }, state(), [{ ...pot, cush: 0 }]).reason, /ترتدّ/);
  const lv = { ...puzzle, targets: [1, 8], eightLast: true };
  const st = state(); st.balls.push({ n: 8, on: false });
  assert.match(judge(lv, st, [{ n: 8, t: 1 }, { ...pot, t: 2 }]).reason, /الأخيرة/);
  assert.equal(judge(lv, st, [{ ...pot, t: 1 }, { n: 8, t: 2 }]).status, 'win');
});

test('position judging does not change the level, progress, shot or simulation state', () => {
  const lv = structuredClone(puzzle), st = state(551, 400), prog = { shotsUsed: 1 }, shot = { pots: [pot] };
  const before = structuredClone({ lv, st, prog, shot });
  levels.judge(lv, prog, shot, st);
  assert.deepEqual({ lv, st, prog, shot }, before);
});

test('the original ten puzzle IDs keep their layouts and are not given position rules', () => {
  const cues = [[470, 440], [430, 300], [640, 400], [640, 450], [560, 250], [430, 250], [640, 396], [700, 300], [400, 396], [360, 396]];
  const targets = [[1], [2], [3, 11], [4], [6], [10], [7, 9], [15], [12, 13, 14, 3], [1, 2, 3, 8]];
  levels.slice(0, 10).forEach((lv, i) => {
    assert.deepEqual(lv.cue, cues[i]);
    assert.deepEqual(lv.targets, targets[i]);
    assert.equal(lv.cueZone, undefined);
    const st = levels.makeState(lv, physics);
    st.balls.filter(b => lv.targets.includes(b.n)).forEach(b => { b.on = false; });
    assert.equal(judge(lv, st, lv.targets.map((n, t) => ({ n, t, pocket: (lv.pockets || [0])[0], cush: 1 }))).status, 'win');
  });
});

function playPosition(lv, power, spin, angleOffset = 0) {
  const st = levels.makeState(lv, physics);
  const target = lv.balls[0];
  const angle = Math.atan2(target[2] - lv.cue[1], target[1] - lv.cue[0]) + angleOffset;
  physics.shoot(st, angle, 60 + (physics.MAX_SPEED - 60) * Math.pow(power, 1.5), 0, spin);
  const shot = physics.simulate(st, 10);
  assert.equal(physics.moving(st), false, 'the shot must settle within a short attempt');
  return { shot, st, result: levels.judge(lv, { shotsUsed: 1 }, shot, st) };
}

test('the two appended position puzzles have forgiving power, spin and aim ranges', () => {
  assert.equal(levels.length, 12);
  const samples = [
    { id: 10, powers: [.40, .415, .43, .445, .46], spins: [-1, -.95, -.9] },
    { id: 11, powers: [.37, .385, .40, .415, .43], spins: [.6, .7, .8] }
  ];
  for (const { id, powers, spins } of samples) {
    for (const power of powers) for (const spin of spins) for (const angle of [-.01, -.005, 0, .005, .01]) {
      const { result } = playPosition(levels[id], power, spin, angle);
      assert.equal(result.status, 'win', `puzzle ${id + 1}: power=${power}, spin=${spin}, aim offset=${angle}: ${result.reason || ''}`);
    }
  }
});

test('a successful pot alone does not solve either position lesson', () => {
  for (const [id, power] of [[10, .43], [11, .4]]) {
    const { shot, result } = playPosition(levels[id], power, 0);
    assert.deepEqual(shot.pots.map(p => p.n), levels[id].targets, 'the comparison really pots the object ball without scratching');
    assert.equal(result.status, 'fail');
    assert.match(result.reason, /مركز البيضاء خارج الدائرة/);
  }
  const strong = playPosition(levels[10], .55, -.95);
  assert.deepEqual(strong.shot.pots.map(p => p.n), [1]);
  assert.equal(strong.result.status, 'fail', 'backspin still needs controlled power');
});
