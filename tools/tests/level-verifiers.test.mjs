import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function verifier(game, args = [], inject = '') {
  const script = path.join(repo, 'games', game, 'verify-levels.js');
  const program = `process.argv = [process.execPath, ${JSON.stringify(script)}, ...${JSON.stringify(args)}];\n${inject}\nrequire(${JSON.stringify(script)});`;
  const result = spawnSync(process.execPath, ['-e', program], {
    cwd: repo, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, ONLY: '1' }
  });
  assert.ifError(result.error);
  return result;
}

test('Swing verification fails when the simulation cannot finish a selected level', () => {
  const result = verifier('swing-hook', ['1'], `require('./games/swing-hook/sim.js').step = w => { w.st = 'dead'; };`);
  assert.match(result.stdout, /NOT SOLVED/);
  assert.equal(result.status, 1);
});

test('Swing verification succeeds when a selected real level is solved and replayed', () => {
  const result = verifier('swing-hook', ['1']);
  assert.match(result.stdout, /ALL LEVELS COMPLETABLE/);
  assert.equal(result.status, 0);
});

test('verifiers reject invalid level or run selections instead of checking nothing', () => {
  assert.equal(verifier('swing-hook', ['999']).status, 2);
  assert.equal(verifier('block-burst', ['0']).status, 2);
});

test('Block verification keeps balance thresholds strict unless report mode is explicitly selected', () => {
  // Keep the strong bot winning while making the weaker model miss its threshold.
  const inject = `const rules = require('./games/block-burst/rules.js');
    const newRun = rules.newRun; let n = 0;
    rules.newRun = (...args) => { const run = newRun(...args); run.result = ++n === 1 ? 'win' : 'fail'; return run; };`;
  const strict = verifier('block-burst', ['1'], inject);
  assert.match(strict.stdout, /BALANCE FAIL/);
  assert.equal(strict.status, 1);
  const report = verifier('block-burst', ['--report-balance', '1'], inject);
  assert.match(report.stdout, /BALANCE WARNING/);
  assert.equal(report.status, 0);
});

test('Block report mode still fails unsolved levels and invalid starting boards', () => {
  const unsolved = verifier('block-burst', ['1', '--report-balance'], `
    const rules = require('./games/block-burst/rules.js'); const newRun = rules.newRun;
    rules.newRun = (...args) => { const run = newRun(...args); run.result = 'fail'; return run; };`);
  assert.match(unsolved.stdout, /FAIL: no smart-bot wins/);
  assert.equal(unsolved.status, 1);
  const invalid = verifier('block-burst', ['1', '--report-balance'], `
    const core = require('./games/block-burst/core.js'); const parseBoard = core.parseBoard;
    core.parseBoard = (...args) => { const board = parseBoard(...args); board.cells.fill(1, 0, 8); return board; };
    const rules = require('./games/block-burst/rules.js'); const newRun = rules.newRun;
    rules.newRun = (...args) => { const run = newRun(...args); run.result = 'win'; return run; };`);
  assert.match(invalid.stdout, /starts with full row/);
  assert.equal(invalid.status, 1);
});

test('Block verification passes an unmodified beginner level', () => {
  const result = verifier('block-burst', ['1']);
  assert.match(result.stdout, /all required checks OK/);
  assert.equal(result.status, 0);
});

// Sneaky Levels replays a recorded solution per level through its engine and
// checks that just holding right never wins (every level has a trap).
test('Sneaky Levels verification wins every level with its recorded solution', () => {
  const result = spawnSync(process.execPath, [path.join(repo, 'games/troll-level/verify.js')], {
    cwd: repo, encoding: 'utf8', timeout: 30000
  });
  assert.ifError(result.error);
  assert.match(result.stdout, /ALL LEVELS BEATABLE/);
  assert.equal(result.status, 0);
});

// Maze Dash's verifier searches every level state: exit reachable, every dot
// collectable (the "all dots" star), no dead ends, no unavoidable timed hazard.
function mazeVerifier(args = []) {
  const result = spawnSync(process.execPath, [path.join(repo, 'games/maze-dash/tools/verify.js'), ...args], {
    cwd: repo, encoding: 'utf8', timeout: 90000
  });
  assert.ifError(result.error);
  return result;
}

test('Maze Dash verification proves every hand-made level can be finished with every dot', () => {
  const result = mazeVerifier();
  assert.match(result.stdout, /all levels OK/);
  assert.equal(result.status, 0);
});

// Fixed seeds keep this check the same on every run; a failure names the seed to replay.
test('Maze Dash verification climbs seeded endless mazes to 600 m', () => {
  const result = mazeVerifier(['--endless', '3', '--seed', '1']);
  assert.match(result.stdout, /\(seeds 1\.\.3\) climbable to 600 m/);
  assert.equal(result.status, 0);
});
