// Math Gates engine (games/math-gates/engine.js): gate maths, the seeded row and question
// generator, every level played by a perfect scripted player at every tier, careless
// players, obstacles, the number battle, the staircase, stars and saves. Node only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/math-gates/engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const MG = sandbox.window.MG;
const DT = 1 / 60;
const MINUS = MG.MINUS;
const plain = v => JSON.parse(JSON.stringify(v));
const g = (op, n, op2, n2) => (op2 ? { op, n, op2, n2 } : { op, n });

// The best lane for a perfect player: the strictly best gate (or the right answer),
// leaving it only to dodge an obstacle just ahead.
function perfect(run) {
  const row = run.rows[run.next];
  let want = run.lane;
  if (row && row.shown) want = MG.bestLane(row, run.count);
  const obs = run.obs.find(o => !o.passed && o.d > run.d && o.d - run.d < 6);
  if (obs && obs.lanes.includes(want)) want = [0, 1, 2].find(l => !obs.lanes.includes(l));
  return { lane: want };
}
// Plays a run to the end; input(run, rng) gives each step's input; onEvent sees every event.
function play(run, input, onEvent, rng = MG.rng(5)) {
  for (let i = 0; i < 60 * 400 && run.phase !== 'done'; i++) {
    MG.step(run, DT, input(run, rng));
    for (const e of run.ev) if (onEvent) onEvent(e, run);
    run.ev.length = 0;
  }
  assert.equal(run.phase, 'done', 'the run ends');
  return run.result;
}
// A careless player: picks a lane at random for each row, never dodges on purpose.
function careless(run, rng) {
  const row = run.rows[run.next];
  if (row && row.shown && row._pick === undefined) row._pick = Math.floor(rng() * 3);
  return { lane: row && row._pick !== undefined ? row._pick : run.lane };
}
function arrivalsOf(run, row) {
  const A = [row.made];
  for (let k = 0; k < run.segs[row.i].obs; k++) { const a = A[A.length - 1], b = Math.max(1, a - MG.loss(run.tier, a)); if (b !== a) A.push(b); }
  return A;
}
// Every gate row must have exactly one best gate for the number the crowd really
// brings, beating both decoys by the tier's margin, with whole results of at least one.
function checkGateRow(run, e) {
  const row = run.rows[e.row], c = e.before;
  assert.ok(arrivalsOf(run, row).includes(c), `row ${e.row} reached with ${c}, made for ${arrivalsOf(run, row)}`);
  const results = row.gates.map(gate => MG.apply(gate, c));
  const labels = row.gates.map(MG.gateText);
  assert.equal(new Set(labels).size, 3, 'three different gates: ' + labels);
  row.gates.forEach((gate, l) => {
    assert.ok(MG.exact(gate, c), `${labels[l]} on ${c} needs no rounding`);
    assert.ok(Number.isInteger(results[l]) && results[l] >= 1, `${labels[l]} on ${c} = ${results[l]}`);
    if (gate.op === '÷') assert.equal(c % gate.n, 0, 'division gates divide exactly');
  });
  const best = MG.bestLane(row, c);
  assert.ok(best >= 0, 'one best gate: ' + labels.map((t, l) => t + '=' + results[l]));
  assert.equal(best, row.best, 'the best gate is the planned one');
  for (let l = 0; l < 3; l++) if (l !== best) assert.ok(results[best] - results[l] >= MG.need(run.tier, c, results[best]), `margin ${labels} at ${c}`);
}

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(MG && MG.TUNE && MG.step && MG.create, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|THREE/);
});

test('every tuning knob moves one way from tier 1 to tier 5, in the direction that makes it harder', () => {
  for (const [key, row] of Object.entries(MG.TUNE)) {
    const dir = MG.HARDER[key];
    assert.ok(dir === 1 || dir === -1, key + ' has a direction');
    assert.equal(row.length, MG.TIERS, key);
    for (let i = 1; i < row.length; i++) assert.ok((row[i] - row[i - 1]) * dir >= 0, `${key} tier ${i + 1}`);
    assert.notEqual(row[0], row[row.length - 1], key + ' changes');
  }
  // Tier 1 is gentle for a six-year-old: slow, few questions, decoys a third worse.
  assert.ok(MG.TUNE.speed[0] <= 5 && MG.TUNE.gap[0] / MG.TUNE.speed[0] >= 6, 'six seconds or more to read each row');
  assert.ok(MG.TUNE.margin[0] >= 0.3 && MG.TUNE.marginMin[0] >= 3);
  assert.ok(MG.TUNE.quiz[0] === 1 && MG.TUNE.rocks[0] === 0);
});

test('gate maths: + − × ÷ and two steps give whole numbers; ÷ rounds down and says so; never below one runner', () => {
  assert.equal(MG.apply(g('+', 10), 4), 14);
  assert.equal(MG.apply(g('×', 2), 4), 8);
  assert.equal(MG.apply(g('+', 10), 30), 40);
  assert.equal(MG.apply(g('×', 2), 30), 60);
  assert.equal(MG.apply(g(MINUS, 3), 10), 7);
  assert.equal(MG.apply(g('÷', 3), 18), 6);
  assert.equal(MG.apply(g('×', 2, '+', 3), 5), 13);
  assert.equal(MG.apply(g('+', 4, '×', 3), 2), 18);
  assert.equal(MG.apply(g('÷', 2, MINUS, 3), 20), 7);
  assert.equal(MG.apply(g('÷', 4), 10), 2, 'rounds down');
  assert.equal(MG.exact(g('÷', 4), 10), false);
  assert.equal(MG.exact(g('÷', 5), 10), true);
  assert.equal(MG.exact(g('+', 3, '÷', 2), 5), true);
  assert.equal(MG.exact(g('+', 2, '÷', 2), 5), false);
  assert.equal(MG.pass(g(MINUS, 9), 4), 1, 'never below one runner');
  assert.equal(MG.pass(g('÷', 10), 3), 1);
  assert.deepEqual(plain(MG.labels(g('×', 2, '+', 5))), ['×2', '+5']);
  assert.equal(MG.label(g(MINUS, 7)), MINUS + '7');
  assert.equal(MINUS, '−', 'a real minus sign');
});

test('a perfect player wins every level at every tier with three stars; the rival is always beatable', () => {
  for (let level = 0; level < MG.LEVELS_N; level++) {
    for (let tier = 1; tier <= MG.TIERS; tier++) {
      for (const seed of [1, 77, 4242]) {
        const run = MG.create({ level, tier, seed });
        assert.ok(run.rival >= 1 && run.rival < run.par, `L${level} t${tier}: rival ${run.rival} < par ${run.par}`);
        const res = play(run, perfect, (e, r) => { if (e.t === 'gate') checkGateRow(r, e); });
        assert.equal(res.won, true, `L${level} t${tier} s${seed} won`);
        assert.equal(res.count, run.par, `L${level} t${tier} s${seed}: the perfect run is the par`);
        assert.equal(res.stars, 3, `L${level} t${tier} s${seed}: three stars`);
        assert.equal(res.hits, 0); assert.equal(res.right, res.asked); assert.ok(res.asked >= 1, 'every level asks a question');
        assert.equal(res.bestPicks, res.picks);
        assert.equal(res.mult, MG.STEPS, 'a perfect run climbs the whole staircase');
      }
    }
  }
});

test('careless players: every row they meet still has exactly one best gate, results stay whole, the crowd never drops below one', () => {
  let runs = 0, rows = 0, quizzes = 0, divisions = 0, twoStep = 0, cuts = 0, hits = 0, lost = 0;
  for (let level = 0; level < MG.LEVELS_N; level++) {
    for (let tier = 1; tier <= MG.TIERS; tier++) {
      for (let seed = 1; seed <= 4; seed++) {
        const run = MG.create({ level, tier, seed: seed * 101 + level });
        const res = play(run, careless, (e, r) => {
          if (e.t === 'gate') {
            checkGateRow(r, e); rows++;
            const row = r.rows[e.row];
            if (row.gates.some(x => x.op === '÷' || x.op2 === '÷')) divisions++;
            if (row.gates.some(x => x.op2)) twoStep++;
            if (row.style === 'cut') cuts++;
          }
          if (e.t === 'quiz') quizzes++;
          if (e.t === 'hit') { hits++; assert.ok(e.count >= 1); }
          if (e.t === 'gate' || e.t === 'quiz' || e.t === 'hit') assert.ok(r.count >= MG.FLOOR, 'never below one runner');
        }, MG.rng(seed * 13 + level));
        runs++;
        if (!res.won) lost++;
        assert.ok(res.count >= 1);
      }
    }
  }
  assert.ok(rows > 2000 && quizzes > 300 && divisions > 100 && twoStep > 50 && cuts > 200 && hits > 100, JSON.stringify({ rows, quizzes, divisions, twoStep, cuts, hits }));
  assert.ok(lost > runs * 0.4, `a careless player loses often (${lost} of ${runs})`);
});

test('gate rows teach: decoys tempt (a bigger number or the other kind of operation), and the best gate moves between lanes', () => {
  let tempting = 0, rows = 0, mixed = 0;
  for (let level = 12; level < 18; level++) {
    for (let seed = 1; seed <= 20; seed++) {
      const run = MG.create({ level, tier: 3, seed });
      const lanes = [];
      play(run, perfect, (e, r) => {
        if (e.t === 'quiz') lanes.push(r.rows[e.row].best);
        if (e.t !== 'gate') return;
        const row = r.rows[e.row], B = row.gates[row.best], others = row.gates.filter((x, l) => l !== row.best);
        rows++;
        if (others.some(x => (x.op2 ? Math.max(x.n, x.n2) : x.n) > B.n || (x.op === '+') !== (B.op === '+'))) tempting++;
        if (row.gates.some(x => x.op === '×') && row.gates.some(x => x.op === '+')) mixed++;
        lanes.push(row.best);
      });
      for (let i = 2; i < lanes.length; i++) assert.ok(!(lanes[i] === lanes[i - 1] && lanes[i] === lanes[i - 2]), 'never the same best lane three rows running');
    }
  }
  assert.ok(tempting / rows > 0.85, `tempting decoys in ${tempting} of ${rows} rows`);
  assert.ok(mixed / rows > 0.3, `+ and × side by side in ${mixed} of ${rows} rows`);
  // "+10 against ×2": which is best depends on the crowd.
  assert.equal(MG.pass(g('+', 10), 4) > MG.pass(g('×', 2), 4), true);
  assert.equal(MG.pass(g('+', 10), 30) < MG.pass(g('×', 2), 30), true);
});

test('questions: exactly one right answer among three, all different and positive, sized for the world and tier', () => {
  const ev = q => {
    const [a, op, b, op2, c] = q.text.replace(' = ?', '').split(' ').map(t => /^\d+$/.test(t) ? Number(t) : t);
    const one = (x, o, y) => o === '+' ? x + y : o === MINUS ? x - y : o === '×' ? x * y : x / y;
    let v = one(a, op, b);
    if (op2) v = one(v, op2, c);
    return v;
  };
  for (let world = 0; world < 5; world++) {
    for (let tier = 1; tier <= 5; tier++) {
      for (let n = 0; n < 6; n++) {
        for (let seed = 1; seed <= 60; seed++) {
          const q = MG.question({ world, n, tier, seed: seed * 31 + n });
          const answers = [q.ans, ...q.wrong];
          assert.equal(ev(q), q.ans, q.text);
          assert.ok(Number.isInteger(q.ans) && q.ans >= 1, q.text + ' has a whole answer');
          assert.equal(new Set(answers).size, 3, q.text + ' three different answers ' + answers);
          assert.ok(answers.every(v => Number.isInteger(v) && v >= 1), q.text + ' ' + answers);
          assert.equal(answers.filter(v => v === ev(q)).length, 1, 'exactly one right answer');
          q.wrong.forEach(v => assert.ok(Math.abs(v - q.ans) >= MG.knob(tier, 'quizNear'), `${q.text}: ${v} is not too close for tier ${tier}`));
          assert.match(q.text, /^[0-9 +×÷=?−]+$/, 'Western digits and signs only');
          const nums = q.text.match(/\d+/g).map(Number);
          if (world === 0) assert.ok(nums.every(v => v <= 20) && q.ans <= 20, 'world 1 stays within 20: ' + q.text);
          if (world === 0 && tier === 1) assert.ok(q.ans <= 10 && nums.every(v => v <= 10), 'tier 1 sums stay within 10: ' + q.text);
          if (world === 1) assert.ok(nums.every(v => v <= 100) && q.ans <= 100, 'world 2 stays within 100: ' + q.text);
          if (world === 2) {
            assert.equal(q.op, '×');
            if (n < 3 && tier === 1) assert.ok([2, 3, 10].includes(q.b) || [2, 3, 10].includes(q.a), 'tier 1 starts with ×2 ×3 ×10: ' + q.text);
            if (n < 3) assert.ok([2, 3, 5, 10].some(t => q.a === t || q.b === t), 'the first tables: ' + q.text);
          }
          if (world === 3) { assert.equal(q.op, '÷'); assert.equal(q.a % q.b, 0, 'exact division: ' + q.text); }
        }
      }
    }
  }
  // Every question row in a level: one right lane, the planned one.
  const run = MG.create({ level: 13, tier: 4, seed: 9 });
  play(run, perfect, (e, r) => {
    if (e.t !== 'quiz') return;
    const row = r.rows[e.row];
    assert.equal(row.answers.filter(v => v === row.q.ans).length, 1);
    assert.equal(row.answers[row.best], row.q.ans);
    assert.equal(e.right, true);
  });
});

test('number pools: each world uses its operations, tier 1 uses small numbers, the first multiplication levels use ×2 ×3 ×5 ×10', () => {
  const P = (w, n, t) => plain(MG.pools(w, n, t));
  assert.equal(P(0, 0, 1).cap, 20);
  assert.ok(Math.max(...P(0, 3, 1).add) <= 5 && Math.max(...P(0, 3, 5).add) <= 9);
  assert.deepEqual([P(0, 3, 1).mul, P(0, 3, 1).div], [[], []], 'world 1: only + and −');
  assert.equal(P(1, 2, 3).cap, 100);
  assert.deepEqual([P(1, 2, 3).mul, P(1, 2, 3).div], [[], []], 'world 2: only + and −');
  assert.deepEqual(P(2, 0, 1).mul, [2, 3, 5]);
  assert.deepEqual(P(2, 1, 3).mul, [2, 3, 5, 10]);
  assert.ok(P(2, 4, 4).mul.includes(7), 'later levels use every table');
  assert.ok(P(3, 0, 2).div.length && P(3, 0, 2).div.every(n => [2, 5, 10].includes(n)));
  assert.equal(P(4, 0, 3).two, false); assert.equal(P(4, 2, 3).two, true);
  for (let w = 0; w < 5; w++) for (let n = 0; n < 6; n++) {
    assert.ok(P(w, n, 1).cap <= P(w, n, 5).cap, 'bigger numbers at higher tiers');
    assert.ok(Math.max(...P(w, n, 1).add) <= Math.max(...P(w, n, 5).add));
  }
  // The crowd in world 1 stays countable: a perfect run ends near 20, never far past it.
  for (let seed = 1; seed <= 30; seed++) {
    const run = MG.create({ level: seed % 6, tier: 1 + seed % 5, seed });
    let top = 0;
    play(run, perfect, (e, r) => { top = Math.max(top, r.count); });
    assert.ok(top <= 30, `world 1 peak ${top}`);
  }
  // Tier 1 is slow; a tier-5 run moves faster.
  assert.ok(MG.create({ level: 0, tier: 1, seed: 1 }).speed < MG.create({ level: 0, tier: 5, seed: 1 }).speed);
});

test('lanes: a key moves one lane, the mouse picks a lane, the crowd slides there; never off the track', () => {
  const run = MG.create({ level: 0, tier: 1, seed: 3 });
  assert.equal(run.lane, 1);
  MG.step(run, DT, { move: -1 });
  assert.equal(run.lane, 0);
  MG.step(run, DT, { move: -1 });
  assert.equal(run.lane, 0, 'never off the track');
  MG.step(run, DT, { lane: 2 });
  assert.equal(run.lane, 2);
  assert.deepEqual(plain(run.ev.filter(e => e.t === 'lane').map(e => [e.from, e.to])), [[1, 0], [0, 2]]);
  for (let i = 0; i < 30; i++) MG.step(run, DT, {});
  assert.ok(Math.abs(run.x - MG.laneX(2)) < 0.05, 'the crowd slid into the lane');
  MG.step(run, DT, { move: 1 });
  assert.equal(run.lane, 2);
});

test('passing a gate applies its operation to the crowd; a question gives a bonus or takes a few and shows the answer', () => {
  const run = MG.create({ level: 12, tier: 2, seed: 5 });
  const row = run.rows[0], before = run.count;
  const lane = (row.best + 1) % 3, gate = row.gates[lane];
  const events = [];
  play(run, r => ({ lane: r.next === 0 ? lane : perfect(r).lane }), e => events.push(e));
  const ev = events.find(e => e.t === 'gate' && e.row === 0);
  assert.equal(ev.before, before); assert.equal(ev.after, MG.pass(gate, before)); assert.equal(ev.best, false); assert.equal(ev.bestLane, row.best);
  assert.ok(events.find(e => e.t === 'reveal' && e.row === 1), 'the next row is made when a row is passed');
  // Questions: the right answer adds a burst, a wrong one takes a few (never below one).
  const q1 = MG.create({ level: 0, tier: 3, seed: 8 }), qi = q1.rows.findIndex(r => r.kind === 'quiz');
  assert.ok(qi > 0);
  let got = null;
  play(q1, r => ({ lane: r.next === qi && r.rows[qi].shown ? (r.rows[qi].best + 1) % 3 : perfect(r).lane }), e => { if (e.t === 'quiz' && e.row === qi) got = e; });
  assert.equal(got.right, false);
  assert.equal(got.after, Math.max(1, got.before - MG.quizLoss(got.before)));
  assert.ok(got.after < got.before || got.before === 1);
  assert.equal(got.ans, q1.rows[qi].q.ans, 'the event carries the right answer to show');
  assert.equal(q1.result.allRight, false); assert.ok(q1.result.stars <= 2);
  assert.equal(MG.quizBonus(4), 3); assert.equal(MG.quizBonus(100), 20); assert.equal(MG.quizLoss(1), 0); assert.equal(MG.quizLoss(3), 2);
});

test('soft obstacles knock off a few runners in their lanes; a lane change dodges them', () => {
  const run = MG.create({ level: 5, tier: 5, seed: 12 });
  assert.ok(run.obs.length >= 2);
  run.obs.forEach(o => { assert.ok(o.lanes.length >= 1 && o.lanes.length <= 2, 'never all three lanes'); assert.ok(o.seg >= 2); });
  const hitsSeen = [];
  play(run, r => {
    const o = r.obs.find(x => !x.passed && x.d > r.d);
    return { lane: o ? o.lanes[0] : r.lane };
  }, e => { if (e.t === 'hit') hitsSeen.push(e); });
  assert.equal(hitsSeen.length, run.obs.length, 'standing in the lane hits every obstacle');
  hitsSeen.forEach(e => assert.ok(e.lost >= 1 && e.count >= 1));
  // Coins never sit beside an obstacle in its lane.
  for (let level = 6; level < 30; level++) {
    const r = MG.create({ level, tier: 5, seed: level });
    r.coins.forEach(c => r.obs.forEach(o => assert.ok(!(o.lanes.includes(c.lane) && Math.abs(o.d - c.d) < 2.4), `coin ${c.d} by obstacle ${o.d}`)));
  }
});

test('the number battle: both crowds shrink together, the bigger one wins, a tie is not a win; the staircase pays coins', () => {
  const run = MG.create({ level: 0, tier: 1, seed: 2 });
  const clashes = [];
  const res = play(run, perfect, e => { if (e.t === 'clash') clashes.push(e); });
  assert.ok(clashes.length >= 3, 'the battle takes a moment');
  clashes.forEach(e => assert.equal(run.finishCount - e.ours, run.rival - e.theirs, 'both lose the same number'));
  assert.equal(res.left, run.par - run.rival);
  assert.equal(res.coins, (res.runCoins + MG.FINISH_COINS) * res.mult, 'a win pays the finish coins plus the track coins, times the staircase');
  // A crowd exactly as big as the rival: both are gone, no win.
  const tie = MG.create({ level: 0, tier: 1, seed: 2 });
  tie.rival = 6;
  tie.count = 6; tie.d = tie.battleD - 0.01; tie.next = tie.R; tie.rows.forEach(r => { r.passed = true; });
  const tr = play(tie, () => ({}));
  assert.equal(tr.won, false); assert.equal(tr.stars, 0); assert.equal(tr.mult, 0); assert.equal(tr.coins, tr.runCoins);
  // Steps climbed: a perfect leftover reaches ×10; less climbs fewer steps.
  assert.equal(MG.stepsFor(100, 200, 100), 10);
  assert.equal(MG.stepsFor(35, 200, 100), 4);
  assert.equal(MG.stepsFor(9, 20, 11), 10, 'a small perfect leftover still reaches ×10');
  assert.equal(MG.stepsFor(5, 20, 11), 6);
  assert.equal(MG.stepsFor(1, 200, 100), 1);
  assert.equal(MG.stepsFor(0, 200, 100), 0);
  assert.equal(MG.stepsFor(3, 12, 6), 5);
});

test('stars: one for winning, one for a big crowd, one for every question right; the difficulty outcome follows', () => {
  const R = o => Object.assign({ won: true, count: 100, rival: 60, par: 100, stars: 3 }, o);
  assert.equal(MG.outcome(R({ stars: 3 })), 1);
  assert.equal(MG.outcome(R({ stars: 2 })), 0.8);
  assert.equal(MG.outcome(R({ stars: 1 })), 0.6);
  assert.ok(MG.outcome(R({ won: false, stars: 0, count: 30 })) <= 0.25);
  assert.equal(MG.outcome(R({ won: false, stars: 0, count: 0 })), 0);
  // A win with a small crowd and a wrong answer: one star.
  const run = MG.create({ level: 7, tier: 1, seed: 21 });
  const qi = run.rows.findIndex(r => r.kind === 'quiz');
  const res = play(run, r => {
    const row = r.rows[r.next];
    if (row && row.shown && row.i === qi) return { lane: (row.best + 1) % 3 };
    if (row && row.shown && row.kind === 'gate' && row.i === 0) return { lane: [0, 1, 2].find(l => l !== row.best && MG.pass(row.gates[l], r.count) >= r.count) ?? row.best };
    return perfect(r);
  });
  assert.equal(res.allRight, false);
  if (res.won) assert.equal(res.stars, 1 + (res.big ? 1 : 0));
  assert.equal(MG.BIG, 0.8);
});

test('the same level and seed always unfold the same way; another seed gives other numbers', () => {
  const a = MG.create({ level: 20, tier: 3, seed: 99 }), b = MG.create({ level: 20, tier: 3, seed: 99 }), c = MG.create({ level: 20, tier: 3, seed: 100 });
  const la = [], lb = [], lc = [];
  play(a, perfect, e => { if (e.t === 'reveal') la.push(JSON.stringify(a.rows[e.row].gates || a.rows[e.row].answers)); });
  play(b, perfect, e => { if (e.t === 'reveal') lb.push(JSON.stringify(b.rows[e.row].gates || b.rows[e.row].answers)); });
  play(c, perfect, e => { if (e.t === 'reveal') lc.push(JSON.stringify(c.rows[e.row].gates || c.rows[e.row].answers)); });
  assert.deepEqual(la, lb);
  assert.notDeepEqual(la, lc);
  assert.equal(a.par, b.par);
});

test('saves: fresh, loaded back, and old or damaged saves load as a playable save', () => {
  const fresh = plain(MG.freshSave());
  assert.equal(fresh.v, 1); assert.equal(fresh.stars.length, 30); assert.equal(fresh.coins, 0);
  for (const raw of [null, undefined, 'broken{', [1, 2], 42, { v: 2, coins: 50 }, { coins: 9 }, { v: 1, stars: 'x', best: { a: 1 }, coins: -5 }]) {
    assert.deepEqual(plain(MG.loadSave(raw)), fresh, JSON.stringify(raw));
  }
  const odd = plain(MG.loadSave({ v: 1, coins: 130.5, stars: [3, 9, -1, 2.5, '2', 1], best: [40, -3, 'x', 1e12], color: 99, hat: 7, seen: 9e9, coach: 'yes', music: true }));
  assert.equal(odd.coins, 0); assert.deepEqual(odd.stars.slice(0, 6), [3, 0, 0, 0, 0, 1]); assert.deepEqual(odd.best.slice(0, 4), [40, 0, 0, 0]);
  assert.equal(odd.color, 0); assert.equal(odd.hat, 0, 'a hat the coins do not unlock is taken off'); assert.equal(odd.coach, false); assert.equal('music' in odd, false);
  const good = plain(MG.loadSave({ v: 1, coins: 500, stars: [3, 2, 1], best: [20, 18, 15], color: 5, hat: 4, seen: 400, coach: true }));
  assert.equal(good.coins, 500); assert.equal(good.color, 5); assert.equal(good.hat, 4); assert.equal(good.seen, 400); assert.equal(good.coach, true);
  assert.deepEqual(plain(MG.loadSave(JSON.parse(JSON.stringify(good)))), good, 'a save survives a round trip');
});

test('progress: levels open one by one, a world opens after the third level of the one before it, results are recorded', () => {
  const s = MG.freshSave();
  assert.equal(MG.isOpen(s, 0), true); assert.equal(MG.isOpen(s, 1), false); assert.equal(MG.worldOpen(s, 1), false);
  assert.equal(MG.nextLevel(s), 0);
  const win = (stars, count, coins) => ({ won: stars > 0, stars, count, coins, rival: 5, par: count });
  let out = MG.applyResult(s, 0, win(2, 18, 30));
  assert.deepEqual(plain(out.opened), [1]); assert.equal(out.best, false); assert.equal(s.stars[0], 2); assert.equal(s.best[0], 18); assert.equal(s.coach, true);
  assert.deepEqual(plain(out.unlocked), [], 'no item at 30 coins');
  out = MG.applyResult(s, 0, win(1, 20, 20));
  assert.equal(s.stars[0], 2, 'stars never go down'); assert.equal(s.best[0], 20); assert.equal(out.best, true, 'a bigger crowd is a new best');
  assert.deepEqual(plain(out.unlocked), [{ type: 'hat', i: 1 }], 'the party hat at 40 coins');
  out = MG.applyResult(s, 1, win(0, 3, 4));
  assert.equal(s.stars[1], 0); assert.deepEqual(plain(out.opened), []); assert.equal(s.coins, 54, 'coins from a lost level are kept');
  MG.applyResult(s, 1, win(3, 25, 0)); MG.applyResult(s, 2, win(1, 25, 0));
  assert.equal(MG.worldOpen(s, 1), true); assert.equal(MG.isOpen(s, 6), true); assert.equal(MG.isOpen(s, 7), false);
  assert.equal(MG.isOpen(s, 3), true); assert.equal(MG.nextLevel(s), 3);
  assert.equal(MG.isOpen(s, 30), false); assert.equal(MG.isOpen(s, -1), false);
  assert.equal(MG.unlocks(0, 1200).length, 12, 'everything but the last hat by 1200 coins');
  assert.equal(MG.unlocks(0, 1500).length, MG.COLORS.length + MG.HATS.length - 3, 'the free colours and no-hat are never "new"');
  assert.equal(MG.totalStars(s), 6);
});
