import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() {
  const context = vm.createContext({});
  for (const file of ['data.js', 'engine.js', 'ai.js']) {
    vm.runInContext(readFileSync(path.join(repo, 'games/balloon-blast', file), 'utf8'), context, { filename: file });
  }
  return context;
}
const { BBD, BLB, BBAI } = load();
const idle = { x: 0, y: 0, drop: false, kick: false };
const T = BLB.TILE;

function clearInner(w) {
  for (let r = 1; r < BLB.ROWS - 1; r++) for (let c = 1; c < BLB.COLS - 1; c++) {
    if (BLB.tile(w, c, r) !== BLB.PILLAR) BLB.setTile(w, c, r, BLB.EMPTY);
  }
}

test('a splash is a plus that stops at pillars, breaks the first crate, and deletes power-ups it crosses', () => {
  const w = BLB.newMatch({ seed: 1, intro: 0 });
  clearInner(w);
  BLB.setTile(w, 5, 2, BLB.PILLAR);
  BLB.setTile(w, 2, 5, BLB.CRATE);
  BLB.setTile(w, 8, 5, BLB.CRATE);
  BLB.addDrop(w, 6, 5, 'speed');
  BLB.addBalloon(w, { c: 5, r: 5, fuse: 0, range: 4, owner: 0, id: 1 });
  BLB.step(w, 1 / 60, [idle, idle, idle, idle]);
  const boom = w.events.filter(e => e.t === 'boom');
  assert.equal(boom.length, 1);
  const cells = w.splashes.length ? null : null;
  // The splash is gone from the list only after its life ends; the boom event records its length.
  // Rebuild the same ray against the grid as it was when the crate broke: crate is already empty.
  // Assert the rules on a fresh grid instead, via splashCells, then the world consequences.
  const grid = BLB.newMatch({ seed: 2, intro: 0 });
  clearInner(grid);
  BLB.setTile(grid, 5, 2, BLB.PILLAR);
  BLB.setTile(grid, 2, 5, BLB.CRATE);
  BLB.addDrop(grid, 7, 5, 'speed');
  const ray = BLB.splashCells(grid, 5, 5, 4).map(c => c.c + ',' + c.r);
  assert.ok(ray.includes('5,5'));
  assert.ok(ray.includes('5,3') && !ray.includes('5,2') && !ray.includes('5,1'), 'pillar stops the ray');
  assert.ok(ray.includes('2,5') && !ray.includes('1,5'), 'the first crate is hit and the ray stops');
  assert.ok(ray.includes('7,5') && ray.includes('8,5'), 'a power-up does not stop the ray');
  BLB.addBalloon(grid, { c: 5, r: 5, fuse: 0, range: 4, owner: 0 });
  BLB.step(grid, 1 / 60, [idle, idle, idle, idle]);
  assert.equal(BLB.tile(grid, 2, 5), BLB.EMPTY, 'the crate breaks');
  assert.equal(BLB.tile(grid, 1, 5), BLB.EMPTY);
  assert.equal(grid.drops.some(d => d.c === 7 && d.r === 5), false, 'the power-up is destroyed');
});

test('chains resolve in the same tick, in the order the splashes reach them', () => {
  const w = BLB.newMatch({ seed: 3, intro: 0 });
  clearInner(w);
  // A at (3,3) reaches B south of it; B reaches C to the east. Nothing else is due.
  BLB.addBalloon(w, { c: 3, r: 3, fuse: 0, range: 3, owner: 0, id: 1 });
  BLB.addBalloon(w, { c: 3, r: 5, fuse: 5, range: 3, owner: 1, id: 2 });
  BLB.addBalloon(w, { c: 6, r: 5, fuse: 5, range: 1, owner: 2, id: 3 });
  BLB.step(w, 1 / 60, [idle, idle, idle, idle]);
  assert.equal(w.events.filter(e => e.t === 'boom').map(e => e.id).join(','), '1,2,3');
  assert.equal(w.balloons.length, 0);
});

test('every battle spawn keeps an L of three crate-free cells', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w = BLB.newMatch({ seed, intro: 0 });
    for (const [c, r] of [[1, 1], [13, 1], [1, 9], [13, 9]]) {
      for (const cell of BLB.escapeOf(c, r)) {
        assert.notEqual(BLB.tile(w, cell[0], cell[1]), BLB.CRATE, 'seed ' + seed + ' @ ' + cell);
      }
    }
  }
});

test('power-up caps hold', () => {
  const w = BLB.newMatch({ seed: 4, intro: 0 });
  clearInner(w);
  const p = BLB.put(w, 0, 3, 3, 0, 0);
  for (let i = 0; i < 12; i++) {
    BLB.addDrop(w, 3, 3, 'balloon');
    BLB.addDrop(w, 3, 3, 'range');
    BLB.addDrop(w, 3, 3, 'speed');
    BLB.addDrop(w, 3, 3, 'kick');
    BLB.step(w, 1 / 60, [idle, idle, idle, idle]);
  }
  assert.equal(p.balloons, 6);
  assert.equal(p.range, 7);
  assert.equal(p.speed, 4);
  assert.equal(p.kick, true);
  BLB.addDrop(w, 3, 3, 'slow');
  BLB.step(w, 1 / 60, [idle, idle, idle, idle]);
  assert.ok(p.slowT > 7 && p.slowT <= 8);
  assert.equal(p.balloons, 6);
});

test('sudden death fills the grid deterministically and a round is over by 100s', () => {
  function maskAt(seed, t) {
    const w = BLB.newMatch({ seed, intro: 0, players: [
      { cpu: false, team: 0 }, { cpu: false, team: 1 }, { cpu: false, team: 2 }, { cpu: false, team: 3 }
    ] });
    for (const p of w.players) p.state = 'out';
    w.noEnd = true;
    while (w.time < t && w.phase === 'play') BLB.step(w, 0.25, [idle, idle, idle, idle]);
    let jelly = '';
    for (let i = 0; i < w.grid.length; i++) jelly += w.grid[i] === BLB.JELLY ? '1' : '0';
    return { jelly, phase: w.phase, time: w.time };
  }
  const a = maskAt(7, 90), b = maskAt(7, 90);
  assert.equal(a.jelly, b.jelly);
  assert.ok(a.jelly.includes('1'), 'jelly has arrived by 90s');
  const early = maskAt(7, 70);
  assert.equal(early.jelly.includes('1'), false, 'nothing rolls in before 75s');
  const late = maskAt(7, 99);
  assert.ok(late.jelly.split('1').length - 1 > a.jelly.split('1').length - 1, 'the ring keeps closing');
  const done = BLB.newMatch({ seed: 8, intro: 0 });
  let steps = 0;
  while (done.phase === 'play' && steps++ < 2500) BLB.step(done, 0.1, [idle, idle, idle, idle]);
  assert.equal(done.phase, 'end');
  assert.ok(done.time <= 100, 'ended at ' + done.time);
});

test('holding up 10px past a column slides you into it', () => {
  const w = BLB.newMatch({ seed: 1, intro: 0 });
  clearInner(w);
  // Pillar in the column to the right, one row up: an off-center body cannot pass.
  BLB.setTile(w, 4, 2, BLB.PILLAR);
  BLB.setTile(w, 4, 3, BLB.PILLAR);
  const col = 3, row = 3;
  const ix = (col + 0.5) * T;
  const iy = (row + 0.5) * T;
  const p = BLB.put(w, 0, col, row, 10, 0);
  assert.equal(p.x, ix + 10);
  for (let i = 0; i < 40; i++) BLB.step(w, 1 / 60, [{ x: 0, y: -1, drop: false, kick: false }, idle, idle, idle]);
  assert.ok(Math.abs(p.x - ix) < 2, 'slid into the column, x=' + p.x);
  assert.ok(p.y < iy - T * 0.4, 'and moved up, y=' + p.y);
});

test('the same seed and the same inputs leave the same world', () => {
  function run(seed) {
    const w = BLB.newMatch({ seed, intro: 0 });
    const inputs = [
      { x: 1, y: 0, drop: false, kick: false },
      { x: -1, y: 0, drop: false, kick: false },
      { x: 0, y: 1, drop: false, kick: false },
      { x: 0, y: -1, drop: false, kick: false }
    ];
    for (let i = 0; i < 180; i++) {
      const drop = i === 40 || i === 100;
      BLB.step(w, 1 / 60, inputs.map((inp, k) => ({ x: inp.x, y: inp.y, drop: drop && k === 0, kick: false })));
    }
    return BLB.fingerprint(w);
  }
  assert.equal(run(11), run(11));
  assert.notEqual(run(11), run(12));
});

function replay(stage) {
  const w = BLB.newStage({ stage, seed: 1 });
  const path = stage.path;
  const me = () => w.players[0];
  const cell = () => BLB.cellOf(me());
  function nearest() {
    const c = cell();
    let best = 0, bd = 1e9;
    for (let i = 0; i < path.length; i++) {
      if (path[i][0] === c.c && path[i][1] === c.r) return i;
      const d = Math.abs(path[i][0] - c.c) + Math.abs(path[i][1] - c.r);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function toward(i) {
    const c = cell();
    const cur = nearest();
    const next = cur === i ? i : cur + Math.sign(i - cur);
    const target = path[Math.max(0, Math.min(path.length - 1, next))];
    let x = 0, y = 0;
    if (c.c !== target[0]) x = Math.sign(target[0] - c.c);
    else if (c.r !== target[1]) y = Math.sign(target[1] - c.r);
    return { x, y, drop: false, kick: false };
  }
  function runTo(i) {
    let n = 0;
    while (nearest() !== i && n++ < 800 && w.phase === 'play') BLB.step(w, 1 / 60, [toward(i)]);
  }
  function waitBoom() {
    let n = 0;
    while (n++ < 240 && w.phase === 'play') {
      const live = w.balloons.some(b => b.owner === 0);
      BLB.step(w, 1 / 60, [idle]);
      if (!live && n > 6) break;
    }
  }
  for (const step of stage.plan) {
    if (w.phase !== 'play') break;
    if (step.op === 'bomb' || step.op === 'pop') {
      runTo(Math.max(0, step.at - 1));
      BLB.step(w, 1 / 60, [{ x: 0, y: 0, drop: true, kick: false }]);
      runTo(Math.max(0, step.at - 4));
      waitBoom();
      if (step.op === 'pop') {
        runTo(step.at);
        for (let k = 0; k < 40 && w.phase === 'play'; k++) BLB.step(w, 1 / 60, [idle]);
      }
    } else if (step.op === 'exit') {
      runTo(step.at);
      for (let k = 0; k < 30 && w.phase === 'play'; k++) BLB.step(w, 1 / 60, [toward(step.at)]);
    } else if (step.op === 'boss') {
      for (let hit = 0; hit < 10 && w.phase === 'play' && w.duck && w.duck.hp > 0; hit++) {
        runTo(step.at - 1);
        BLB.step(w, 1 / 60, [{ x: 0, y: 0, drop: true, kick: false }]);
        runTo(Math.max(0, step.at - 5));
        waitBoom();
      }
    } else if (step.op === 'hold') {
      for (let k = 0; k < 20 && w.phase === 'play'; k++) BLB.step(w, 1 / 60, [idle]);
    }
  }
  return w;
}

test('every adventure stage has a scripted clear of at least 20s', () => {
  assert.equal(BBD.STAGES.length, 18);
  for (const stage of BBD.STAGES) {
    assert.equal(stage.grid.length, 11, stage.id);
    assert.ok(stage.grid.every(row => row.length === 15), stage.id);
    const w = replay(stage);
    assert.equal(w.phase, 'won', stage.id + ' phase ' + w.phase + ' t=' + w.time.toFixed(1));
    assert.ok(w.time >= 20, stage.id + ' cleared in ' + w.time.toFixed(2) + 's');
  }
});

function simMatch(seed, tier) {
  const wins = [0, 0, 0, 0];
  let rounds = 0;
  let drops = 0, traps = 0;
  while (rounds < 3 && Math.max(...wins) < 2) {
    const w = BLB.newMatch({
      seed: seed * 17 + rounds, tier, intro: 0,
      players: [0, 1, 2, 3].map(i => ({ cpu: true, team: i, tier, critter: ['frog', 'penguin', 'cat', 'robot'][i] }))
    });
    let steps = 0;
    while (w.phase === 'play' && steps++ < 2200) BLB.step(w, 0.1, BBAI.inputs(w));
    assert.equal(w.phase, 'end', 'tier ' + tier + ' seed ' + seed + ' stuck at ' + w.time.toFixed(1));
    assert.ok(w.time <= 100);
    drops += w.botDrops;
    traps += w.selfTraps;
    if (w.winner >= 0 && w.winner < 4) wins[w.winner]++;
    rounds++;
  }
  return { rounds, drops, traps, wins };
}

test('bots-only matches end, and tier-5 bots rarely trap themselves', () => {
  const t0 = Date.now();
  for (let seed = 1; seed <= 200; seed++) simMatch(seed, 3);
  let drops = 0, traps = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const m = simMatch(seed + 500, 5);
    drops += m.drops;
    traps += m.traps;
  }
  assert.ok(drops > 50, 'tier-5 bots dropped balloons');
  assert.ok(traps / drops < 0.03, 'self-trap rate ' + (traps / drops).toFixed(4) + ' (' + traps + '/' + drops + ')');
  // Keep the suite from quietly becoming a multi-minute hang.
  assert.ok(Date.now() - t0 < 180000, 'bot matches took too long');
});
