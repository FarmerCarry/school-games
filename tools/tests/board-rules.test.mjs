import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const rules = require('../../shared/board-rules.js');

function sequence(game, moves) {
  return moves.reduce((state, move) => {
    const next = rules.play(state, move);
    assert.ok(next, `Move ${move} should be legal`);
    return next;
  }, rules.create(game));
}

test('classic script and CommonJS expose the same small rules API', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../../shared/board-rules.js', import.meta.url), 'utf8'), context);
  assert.deepEqual(Object.keys(context.window.SGBoardRules), Object.keys(rules));
  assert.equal(context.window.SGBoardRules.create('connect-four').board.length, 42);
});

test('fresh board sizes, legal moves, independent arrays and unknown games', () => {
  const four = rules.create('connect-four');
  const three = rules.create('tic-tac-toe');
  assert.equal(four.board.length, 42);
  assert.equal(three.board.length, 9);
  assert.deepEqual(rules.legalMoves(four), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rules.legalMoves(three), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(four.turn, 1);
  assert.equal(four.last, -1);
  assert.notEqual(rules.create('connect-four').board, four.board);
  assert.throws(() => rules.create('bad-game'), RangeError);
  assert.throws(() => rules.create('__proto__'), RangeError);
});

test('Connect 4 gravity, full columns, boundaries and immutable transitions', () => {
  const start = rules.create('connect-four');
  const snapshot = structuredClone(start);
  const next = rules.play(start, 0);
  assert.deepEqual(start, snapshot);
  assert.equal(next.last, 35);
  assert.equal(next.board[35], 1);
  assert.equal(next.turn, 2);
  const full = sequence('connect-four', [0, 0, 0, 0, 0, 0]);
  assert.equal(rules.play(full, 0), null);
  assert.deepEqual(rules.legalMoves(full), [1, 2, 3, 4, 5, 6]);
  for (const move of [-1, 7, 0.5, '1', null, NaN]) assert.equal(rules.play(start, move), null);
});

test('Connect 4 detects horizontal, vertical and both diagonal wins', () => {
  const examples = [
    { moves: [0, 6, 1, 6, 2, 5, 3], line: [35, 36, 37, 38] },
    { moves: [0, 1, 0, 1, 0, 2, 0], line: [14, 21, 28, 35] },
    { moves: [0, 1, 1, 2, 4, 2, 2, 3, 4, 3, 5, 3, 3], line: [17, 23, 29, 35] },
    { moves: [6, 5, 5, 4, 2, 4, 4, 3, 2, 3, 1, 3, 3], line: [17, 25, 33, 41] }
  ];
  for (const example of examples) {
    const won = sequence('connect-four', example.moves);
    assert.equal(won.winner, 1);
    assert.equal(won.draw, false);
    assert.deepEqual([...won.winning].sort((a, b) => a - b), example.line);
    assert.deepEqual(rules.legalMoves(won), []);
    assert.equal(rules.play(won, 0), null);
    assert.equal(rules.chooseMove(won), null);
  }
});

test('tic-tac-toe detects both players and all line directions', () => {
  for (const [moves, winner, line] of [
    [[0, 3, 1, 4, 2], 1, [0, 1, 2]],
    [[0, 1, 3, 2, 6], 1, [0, 3, 6]],
    [[0, 1, 4, 2, 8], 1, [0, 4, 8]],
    [[2, 0, 4, 1, 6], 1, [2, 4, 6]],
    [[0, 3, 1, 4, 8, 5], 2, [3, 4, 5]]
  ]) {
    const won = sequence('tic-tac-toe', moves);
    assert.equal(won.winner, winner);
    assert.deepEqual(won.winning, line);
    assert.equal(rules.play(won, 7), null);
  }
  assert.equal(rules.play(sequence('tic-tac-toe', [4]), 4), null);
});

test('full boards draw without a winner; a last-cell win takes precedence', () => {
  const draw = sequence('tic-tac-toe', [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(draw.draw, true);
  assert.equal(draw.winner, 0);
  assert.deepEqual(draw.winning, []);
  assert.deepEqual(rules.legalMoves(draw), []);
  assert.equal(rules.chooseMove(draw), null);
  const won = sequence('tic-tac-toe', [0, 1, 2, 3, 4, 5, 7, 6, 8]);
  assert.equal(won.moves, 9);
  assert.equal(won.winner, 1);
  assert.equal(won.draw, false);
  const fourDraw = sequence('connect-four', [
    2, 5, 2, 2, 2, 4, 3, 1, 2, 3, 1, 4, 4, 2, 0, 1, 0, 0, 5, 4, 0,
    6, 3, 5, 5, 5, 6, 0, 0, 6, 5, 4, 4, 6, 1, 1, 1, 6, 6, 3, 3, 3
  ]);
  assert.equal(fourDraw.moves, 42);
  assert.equal(fourDraw.draw, true);
  assert.equal(fourDraw.winner, 0);
  assert.deepEqual(rules.legalMoves(fourDraw), []);
  assert.equal(rules.play(fourDraw, 0), null);
  assert.equal(rules.chooseMove(fourDraw), null);
});

test('AI wins immediately and blocks immediate losses in each game', () => {
  for (const [game, moves, answer] of [
    ['tic-tac-toe', [0, 3, 1, 4], 2],
    ['tic-tac-toe', [0, 4, 1], 2],
    ['connect-four', [0, 6, 1, 6, 2, 5], 3],
    ['connect-four', [0, 6, 1, 6, 2], 3],
    ['connect-four', [0, 1, 0, 1, 0], 0]
  ]) {
    const state = sequence(game, moves);
    const snapshot = structuredClone(state);
    assert.equal(rules.chooseMove(state), answer);
    assert.deepEqual(state, snapshot);
  }
});

test('tic-tac-toe AI cannot lose as either player against every legal opponent move', () => {
  function visit(state, ai) {
    assert.notEqual(state.winner, 3 - ai);
    if (state.winner || state.draw) return;
    if (state.turn === ai) {
      const move = rules.chooseMove(state);
      assert.ok(rules.legalMoves(state).includes(move));
      visit(rules.play(state, move), ai);
    } else {
      for (const move of rules.legalMoves(state)) visit(rules.play(state, move), ai);
    }
  }
  visit(rules.create('tic-tac-toe'), 1);
  visit(rules.create('tic-tac-toe'), 2);
});

test('malformed states are rejected without mutating inputs', () => {
  for (const state of [null, {}, { ...rules.create('connect-four'), board: [] },
    { ...rules.create('tic-tac-toe'), turn: 3 },
    { ...rules.create('tic-tac-toe'), moves: 1 },
    { ...rules.create('tic-tac-toe'), board: [3, 0, 0, 0, 0, 0, 0, 0, 0] }]) {
    assert.deepEqual(rules.legalMoves(state), []);
    assert.equal(rules.play(state, 0), null);
    assert.equal(rules.chooseMove(state), null);
  }
});
