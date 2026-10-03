(function (root, factory) {
  'use strict';
  var rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.SGBoardRules = rules;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var games = {
    'connect-four': { rows: 6, cols: 7, target: 4, order: [3, 2, 4, 1, 5, 0, 6] },
    'tic-tac-toe': { rows: 3, cols: 3, target: 3, order: [4, 0, 2, 6, 8, 1, 3, 5, 7] }
  };
  var directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  function config(game) {
    return Object.prototype.hasOwnProperty.call(games, game) ? games[game] : null;
  }

  function create(game) {
    var spec = config(game);
    if (!spec) throw new RangeError('Unknown board game');
    return {
      game: game, board: new Array(spec.rows * spec.cols).fill(0), turn: 1,
      winner: 0, draw: false, moves: 0, last: -1, winning: []
    };
  }

  function valid(state) {
    if (!state || typeof state !== 'object') return null;
    var spec = config(state.game);
    if (!spec || !Array.isArray(state.board) || state.board.length !== spec.rows * spec.cols ||
        (state.turn !== 1 && state.turn !== 2) ||
        (state.winner !== 0 && state.winner !== 1 && state.winner !== 2) ||
        typeof state.draw !== 'boolean' || !Number.isInteger(state.moves) ||
        state.moves < 0 || state.moves > state.board.length ||
        !Number.isInteger(state.last) || state.last < -1 || state.last >= state.board.length) return null;
    var occupied = 0;
    for (var i = 0; i < state.board.length; i++) {
      if (state.board[i] !== 0 && state.board[i] !== 1 && state.board[i] !== 2) return null;
      if (state.board[i]) occupied++;
    }
    return occupied === state.moves ? spec : null;
  }

  // Boards use physical left-to-right columns, independently of the page's text direction.
  function landing(board, spec, move) {
    if (!Number.isInteger(move)) return -1;
    if (spec.rows === 3) return move >= 0 && move < 9 && board[move] === 0 ? move : -1;
    if (move < 0 || move >= spec.cols || board[move] !== 0) return -1;
    for (var row = spec.rows - 1; row >= 0; row--) {
      var index = row * spec.cols + move;
      if (!board[index]) return index;
    }
    return -1;
  }

  function legalMoves(state) {
    var spec = valid(state);
    if (!spec || state.winner || state.draw) return [];
    var moves = [];
    var count = spec.rows === 3 ? 9 : spec.cols;
    for (var move = 0; move < count; move++) {
      if (landing(state.board, spec, move) !== -1) moves.push(move);
    }
    return moves;
  }

  function winningLine(board, spec, last, player) {
    var row = Math.floor(last / spec.cols);
    var col = last % spec.cols;
    for (var d = 0; d < directions.length; d++) {
      var line = [last];
      var dr = directions[d][0];
      var dc = directions[d][1];
      for (var sign = -1; sign <= 1; sign += 2) {
        var r = row + dr * sign;
        var c = col + dc * sign;
        while (r >= 0 && r < spec.rows && c >= 0 && c < spec.cols && board[r * spec.cols + c] === player) {
          if (sign < 0) line.unshift(r * spec.cols + c);
          else line.push(r * spec.cols + c);
          r += dr * sign;
          c += dc * sign;
        }
      }
      if (line.length >= spec.target) return line;
    }
    return [];
  }

  function play(state, move) {
    var spec = valid(state);
    if (!spec || state.winner || state.draw) return null;
    var last = landing(state.board, spec, move);
    if (last === -1) return null;
    var board = state.board.slice();
    board[last] = state.turn;
    var winning = winningLine(board, spec, last, state.turn);
    var winner = winning.length ? state.turn : 0;
    var moves = state.moves + 1;
    var draw = !winner && moves === board.length;
    return {
      game: state.game, board: board, turn: winner || draw ? state.turn : 3 - state.turn,
      winner: winner, draw: draw, moves: moves, last: last, winning: winning
    };
  }

  // Only called at the leaves of the bounded Connect 4 search.
  function evaluate(board, spec, player) {
    var score = 0;
    var weights = [0, 2, 14, 90, 100000];
    for (var row = 0; row < spec.rows; row++) {
      var middle = board[row * spec.cols + 3];
      if (middle) score += middle === player ? 5 : -5;
      for (var col = 0; col < spec.cols; col++) {
        for (var d = 0; d < directions.length; d++) {
          var dr = directions[d][0];
          var dc = directions[d][1];
          var endRow = row + dr * 3;
          var endCol = col + dc * 3;
          if (endRow < 0 || endRow >= spec.rows || endCol < 0 || endCol >= spec.cols) continue;
          var mine = 0;
          var theirs = 0;
          for (var k = 0; k < 4; k++) {
            var token = board[(row + dr * k) * spec.cols + col + dc * k];
            if (token === player) mine++;
            else if (token) theirs++;
          }
          if (!theirs) score += weights[mine];
          else if (!mine) score -= weights[theirs];
        }
      }
    }
    return score;
  }

  function search(board, spec, player, remaining, depth, alpha, beta) {
    if (!remaining) return 0;
    if (!depth) return evaluate(board, spec, player);
    var best = -Infinity;
    for (var i = 0; i < spec.order.length; i++) {
      var last = landing(board, spec, spec.order[i]);
      if (last === -1) continue;
      board[last] = player;
      var score = winningLine(board, spec, last, player).length ? 100000 + depth :
        -search(board, spec, 3 - player, remaining - 1, depth - 1, -beta, -alpha);
      board[last] = 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best === -Infinity ? 0 : best;
  }

  function chooseMove(state) {
    var spec = valid(state);
    if (!spec || state.winner || state.draw) return null;
    var board = state.board.slice();
    var remaining = board.length - state.moves;
    var depth = spec.rows === 3 ? remaining : Math.min(4, remaining);
    var best = -Infinity;
    var chosen = null;
    for (var i = 0; i < spec.order.length; i++) {
      var move = spec.order[i];
      var last = landing(board, spec, move);
      if (last === -1) continue;
      board[last] = state.turn;
      var score = winningLine(board, spec, last, state.turn).length ? 100000 + depth :
        -search(board, spec, 3 - state.turn, remaining - 1, depth - 1, -Infinity, -best);
      board[last] = 0;
      if (score > best) {
        best = score;
        chosen = move;
      }
    }
    return chosen;
  }

  return { create: create, legalMoves: legalMoves, play: play, chooseMove: chooseMove };
}));
