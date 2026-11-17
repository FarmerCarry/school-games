import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../../shared/board-rules.js');

function sequence(game, moves) {
  return moves.reduce((state, move) => {
    const next = rules.play(state, move);
    assert.ok(next, `Move ${move} should be legal`);
    return next;
  }, rules.create(game));
}

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

// A small seeded generator keeps the level checks repeatable.
function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
}

test('easy and medium computers always choose a legal move without changing the state', () => {
  const random = seeded(42);
  for (const game of ['tic-tac-toe', 'connect-four']) {
    for (const level of ['easy', 'medium']) {
      for (let round = 0; round < 40; round++) {
        let state = rules.create(game);
        state.turn = round % 2 ? 2 : 1;
        while (!state.winner && !state.draw) {
          const snapshot = structuredClone(state);
          const move = rules.chooseMove(state, level, random);
          assert.ok(rules.legalMoves(state).includes(move), `${game} ${level} chose ${move}`);
          assert.deepEqual(state, snapshot);
          state = rules.play(state, move);
        }
      }
    }
  }
});

test('kid-style players can beat the easy computer but rarely the hard one', () => {
  const random = seeded(7);
  // Wins and blocks when it can, otherwise a random move (centre columns in Connect 4).
  function kid(state) {
    const legal = rules.legalMoves(state);
    const win = legal.find(move => rules.play(state, move).winner === state.turn);
    if (win !== undefined) return win;
    const block = legal.find(move => rules.play({ ...state, turn: 3 - state.turn }, move).winner === 3 - state.turn);
    if (block !== undefined) return block;
    const pool = state.game === 'connect-four' ? legal.flatMap(move => Array(4 - Math.abs(move - 3)).fill(move)) : legal;
    return pool[Math.floor(random() * pool.length)];
  }
  function kidWins(game, level, rounds) {
    let wins = 0;
    for (let round = 0; round < rounds; round++) {
      let state = rules.create(game);
      state.turn = round % 2 ? 2 : 1;
      while (!state.winner && !state.draw) state = rules.play(state, state.turn === 1 ? kid(state) : rules.chooseMove(state, level, random));
      if (state.winner === 1) wins++;
    }
    return wins / rounds;
  }
  assert.ok(kidWins('connect-four', 'easy', 200) >= 0.25);
  assert.ok(kidWins('connect-four', 'hard', 200) <= 0.05);
  assert.ok(kidWins('tic-tac-toe', 'easy', 200) > 0);
  assert.equal(kidWins('tic-tac-toe', 'hard', 100), 0);
});

test('Vanishing tic-tac-toe caps each player at 3 marks, removes oldest before win check and never draws', () => {
  let state = rules.create('tic-tac-toe', { variant: 'twist' });
  assert.equal(state.variant, 'twist');
  assert.deepEqual(state.queues, { 1: [], 2: [] });

  // P1: 0, P2: 3, P1: 1, P2: 4, P1: 7, P2: 6 -> both have 3 marks, P1's oldest (0) is marked vanishing.
  for (const mv of [0, 3, 1, 4, 7, 6]) state = rules.play(state, mv);
  assert.equal(state.moves, 6);
  assert.deepEqual(state.queues, { 1: [0, 1, 7], 2: [3, 4, 6] });
  assert.equal(state.vanishing, 0);

  // P1 plays 2: cell 0 vanishes FIRST, so [0, 1, 2] is NOT a win!
  state = rules.play(state, 2);
  assert.equal(state.vanished, 0);
  assert.equal(state.board[0], 0);
  assert.equal(state.winner, 0);
  assert.equal(state.draw, false);
  assert.deepEqual(state.queues[1], [1, 7, 2]);
  assert.equal(state.vanishing, 3);

  // Cell 0 is empty again, so P2 can play on 0 (while P2's oldest cell 3 vanishes).
  state = rules.play(state, 0);
  assert.equal(state.vanished, 3);
  assert.equal(state.board[3], 0);
  assert.equal(state.board[0], 2);

  // P1 has [1, 7, 2]; playing 8 shifts 1 out -> [7, 2, 8]; P2 plays 1 (shifts 4 -> [6, 0, 1]);
  // then P1 plays 5 -> shifts 7 out, completing right-column win [2, 5, 8]!
  state = rules.play(state, 8);
  state = rules.play(state, 1);
  state = rules.play(state, 5);
  assert.equal(state.winner, 1);
  assert.deepEqual([...state.winning].sort((a, b) => a - b), [2, 5, 8]);
  assert.equal(state.draw, false);
});

test('Power-Disc Connect 4 supports Anvil top-crush on full columns and Zap flip-below wins', () => {
  // Fill column 0 alternating P1 and P2: bottom..top = 1, 2, 1, 2, 1, 2 (row 0 index 0 is P2).
  let state = rules.create('connect-four', { variant: 'twist' });
  for (let i = 0; i < 6; i++) state = rules.play(state, 0);
  assert.equal(state.board[0], 2);
  // Normal drop in full column 0 is illegal, but Anvil is legal because top disc belongs to P2!
  assert.equal(rules.play(state, 0), null);
  assert.equal(rules.legalMoves(state).includes(0), false);
  assert.equal(rules.legalMoves(state, 'anvil').includes(0), true);

  const crushed = rules.play(state, 0, 'anvil');
  assert.ok(crushed);
  assert.equal(crushed.last, 0);
  assert.equal(crushed.affected, 0);
  assert.equal(crushed.board[0], 1);
  assert.equal(crushed.powers[1].anvil, 0);
  // Second anvil by P1 is rejected once charge is spent.
  const afterP2 = rules.play(crushed, 1);
  assert.equal(rules.play(afterP2, 1, 'anvil'), null);

  // Zap flips opponent disc beneath it and detects a 4-in-a-row created by the flipped disc!
  // Build P1 discs at row 5 cols 1, 2, 3 and a P2 blocker at row 5 col 0 (index 35):
  let zapGame = rules.create('connect-four', { variant: 'twist' });
  for (const mv of [1, 0, 2, 6, 3, 6]) zapGame = rules.play(zapGame, mv);
  assert.equal(zapGame.board[35], 2); // P2 at bottom of col 0
  const zapped = rules.play(zapGame, 0, 'zap');
  assert.ok(zapped);
  assert.equal(zapped.last, 28);      // P1 Zap landed at row 4 col 0
  assert.equal(zapped.affected, 35);  // Flipped P2 at row 5 col 0 to P1!
  assert.equal(zapped.board[35], 1);
  assert.equal(zapped.winner, 1);
  assert.deepEqual([...zapped.winning].sort((a, b) => a - b), [35, 36, 37, 38]);
  assert.equal(zapped.powers[1].zap, 0);
});

test('Twist AI plays legal Vanishing XO and Power-Disc Connect 4 moves without mutating state', () => {
  const random = seeded(99);
  // Hard Connect 4 Twist AI spots an immediate Zap win when both open ends (cols 0 and 4) are blocked by P2!
  let zapWinState = rules.create('connect-four', { variant: 'twist' });
  for (const mv of [1, 0, 2, 4, 3, 6]) zapWinState = rules.play(zapWinState, mv);
  const snap = structuredClone(zapWinState);
  const aiChoice = rules.chooseMove(zapWinState, 'hard', random);
  assert.deepEqual(zapWinState, snap);
  assert.equal(aiChoice.power, 'zap');
  assert.ok(aiChoice.col === 0 || aiChoice.col === 4);
  assert.equal(rules.play(zapWinState, aiChoice).winner, 1);

  // Simulate full Twist rounds across levels for both games.
  for (const game of ['tic-tac-toe', 'connect-four']) {
    for (const level of ['easy', 'medium', 'hard']) {
      let state = rules.create(game, { variant: 'twist' });
      let guard = 0;
      while (!state.winner && !state.draw && guard++ < 80) {
        const before = structuredClone(state);
        const action = rules.chooseMove(state, level, random);
        assert.deepEqual(state, before);
        const next = rules.play(state, action);
        assert.ok(next, `${game} twist ${level} action ${JSON.stringify(action)} should be legal`);
        state = next;
      }
      if (game === 'tic-tac-toe') assert.equal(state.draw, false);
    }
  }
});

