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

  function create(game, options) {
    var spec = config(game);
    if (!spec) throw new RangeError('Unknown board game');
    var variant = options && options.variant ? options.variant : 'classic';
    if (variant !== 'classic' && variant !== 'twist') throw new RangeError('Unknown board variant');
    var base = {
      game: game, board: new Array(spec.rows * spec.cols).fill(0), turn: 1,
      winner: 0, draw: false, moves: 0, last: -1, winning: []
    };
    if (variant === 'classic') return base;
    base.variant = 'twist';
    if (game === 'tic-tac-toe') {
      base.queues = { 1: [], 2: [] };
      base.vanished = -1;
      base.vanishing = -1;
    } else {
      base.powers = { 1: { anvil: 1, zap: 1 }, 2: { anvil: 1, zap: 1 } };
      base.lastPower = null;
      base.affected = -1;
    }
    return base;
  }

  function valid(state) {
    if (!state || typeof state !== 'object') return null;
    var spec = config(state.game);
    var twist = state.variant === 'twist';
    if (state.variant !== undefined && !twist) return null;
    if (!spec || !Array.isArray(state.board) || state.board.length !== spec.rows * spec.cols ||
        (state.turn !== 1 && state.turn !== 2) ||
        (state.winner !== 0 && state.winner !== 1 && state.winner !== 2) ||
        typeof state.draw !== 'boolean' || !Number.isInteger(state.moves) ||
        state.moves < 0 || (!twist && state.moves > state.board.length) ||
        !Number.isInteger(state.last) || state.last < -1 || state.last >= state.board.length) return null;
    var occupied = 0;
    for (var i = 0; i < state.board.length; i++) {
      if (state.board[i] !== 0 && state.board[i] !== 1 && state.board[i] !== 2) return null;
      if (state.board[i]) occupied++;
    }
    if (!twist) return occupied === state.moves ? spec : null;
    if (state.game === 'tic-tac-toe') {
      var q = state.queues;
      if (!q || !Array.isArray(q[1]) || !Array.isArray(q[2]) ||
          q[1].length > 3 || q[2].length > 3 || q[1].length + q[2].length !== occupied) return null;
      for (var p = 1; p <= 2; p++) {
        for (var k = 0; k < q[p].length; k++) {
          var idx = q[p][k];
          if (!Number.isInteger(idx) || idx < 0 || idx >= 9 || state.board[idx] !== p || q[p].indexOf(idx) !== k) return null;
        }
      }
      return spec;
    }
    var pw = state.powers;
    if (!pw || !pw[1] || !pw[2]) return null;
    for (var s = 1; s <= 2; s++) {
      if (!Number.isInteger(pw[s].anvil) || pw[s].anvil < 0 || pw[s].anvil > 1 ||
          !Number.isInteger(pw[s].zap) || pw[s].zap < 0 || pw[s].zap > 1) return null;
    }
    return spec;
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

  function topDisc(board, spec, col) {
    for (var row = 0; row < spec.rows; row++) {
      var index = row * spec.cols + col;
      if (board[index]) return index;
    }
    return -1;
  }

  // Anvil crushes an enemy top disc in place (even in a full column), or lands in an empty/own-topped column.
  function anvilLanding(board, spec, col, player) {
    if (!Number.isInteger(col) || col < 0 || col >= spec.cols) return -1;
    var top = topDisc(board, spec, col);
    if (top === -1) return (spec.rows - 1) * spec.cols + col;
    if (board[top] !== player) return top;
    return top >= spec.cols ? top - spec.cols : -1;
  }

  function legalMoves(state, power) {
    var spec = valid(state);
    if (!spec || state.winner || state.draw) return [];
    var moves = [];
    if (state.variant === 'twist' && state.game === 'connect-four' && power && power !== 'normal') {
      if ((power !== 'anvil' && power !== 'zap') || !state.powers[state.turn][power]) return [];
      for (var c = 0; c < spec.cols; c++) {
        var idx = power === 'anvil' ? anvilLanding(state.board, spec, c, state.turn) : landing(state.board, spec, c);
        if (idx !== -1) moves.push(c);
      }
      return moves;
    }
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

  function mergeWinning(a, b) {
    if (!b.length) return a;
    if (!a.length) return b;
    var out = a.slice();
    for (var i = 0; i < b.length; i++) if (out.indexOf(b[i]) === -1) out.push(b[i]);
    return out;
  }

  function play(state, move, power) {
    if (move && typeof move === 'object') {
      power = move.power;
      move = move.col !== undefined ? move.col : move.move;
    }
    var spec = valid(state);
    if (!spec || state.winner || state.draw) return null;
    if (state.variant !== 'twist') {
      if (power && power !== 'normal') return null;
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
    if (state.game === 'tic-tac-toe') {
      if (power && power !== 'normal') return null;
      var xoLast = landing(state.board, spec, move);
      if (xoLast === -1) return null;
      var xoBoard = state.board.slice();
      var q1 = state.queues[1].slice(), q2 = state.queues[2].slice();
      var activeQ = state.turn === 1 ? q1 : q2;
      var vanished = -1;
      if (activeQ.length >= 3) {
        vanished = activeQ.shift();
        xoBoard[vanished] = 0;
      }
      xoBoard[xoLast] = state.turn;
      activeQ.push(xoLast);
      var xoWin = winningLine(xoBoard, spec, xoLast, state.turn);
      var xoWinner = xoWin.length ? state.turn : 0;
      var xoNextTurn = xoWinner ? state.turn : 3 - state.turn;
      var nextQ = xoNextTurn === 1 ? q1 : q2;
      return {
        game: state.game, variant: 'twist', board: xoBoard, turn: xoNextTurn,
        winner: xoWinner, draw: false, moves: state.moves + 1, last: xoLast, winning: xoWin,
        queues: { 1: q1, 2: q2 }, vanished: vanished,
        vanishing: !xoWinner && nextQ.length >= 3 ? nextQ[0] : -1
      };
    }
    var used = power && power !== 'normal' ? power : null;
    if (used && used !== 'anvil' && used !== 'zap') return null;
    if (used && !state.powers[state.turn][used]) return null;
    var c4Last = used === 'anvil' ? anvilLanding(state.board, spec, move, state.turn) : landing(state.board, spec, move);
    if (c4Last === -1) return null;
    var c4Board = state.board.slice();
    var affected = -1;
    if (used === 'anvil' && state.board[c4Last] !== 0) affected = c4Last;
    c4Board[c4Last] = state.turn;
    if (used === 'zap') {
      var below = c4Last + spec.cols;
      if (below < c4Board.length && c4Board[below] === 3 - state.turn) {
        c4Board[below] = state.turn;
        affected = below;
      }
    }
    var winPrimary = winningLine(c4Board, spec, c4Last, state.turn);
    var winSecondary = used === 'zap' && affected !== -1 ? winningLine(c4Board, spec, affected, state.turn) : [];
    var c4Winning = mergeWinning(winPrimary, winSecondary);
    var c4Winner = c4Winning.length ? state.turn : 0;
    var nextPowers = {
      1: { anvil: state.powers[1].anvil, zap: state.powers[1].zap },
      2: { anvil: state.powers[2].anvil, zap: state.powers[2].zap }
    };
    if (used) nextPowers[state.turn][used]--;
    var c4NextTurn = 3 - state.turn;
    var hasLegal = false;
    for (var col = 0; col < spec.cols; col++) {
      if (c4Board[col] === 0 || (nextPowers[c4NextTurn].anvil > 0 && anvilLanding(c4Board, spec, col, c4NextTurn) !== -1)) {
        hasLegal = true;
        break;
      }
    }
    var c4Draw = !c4Winner && !hasLegal;
    return {
      game: state.game, variant: 'twist', board: c4Board,
      turn: c4Winner || c4Draw ? state.turn : c4NextTurn,
      winner: c4Winner, draw: c4Draw, moves: state.moves + 1, last: c4Last, winning: c4Winning,
      powers: nextPowers, lastPower: used, affected: affected
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

  // The move that wins at once for player, or -1.
  function immediateWin(board, spec, player) {
    for (var i = 0; i < spec.order.length; i++) {
      var last = landing(board, spec, spec.order[i]);
      if (last === -1) continue;
      board[last] = player;
      var won = winningLine(board, spec, last, player).length;
      board[last] = 0;
      if (won) return spec.order[i];
    }
    return -1;
  }

  var xoLines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  function immediateWinTwistXO(state, spec, player) {
    var probe = state.turn === player ? state : {
      game: state.game, variant: 'twist', board: state.board, turn: player,
      winner: 0, draw: false, moves: state.moves, last: state.last, winning: [],
      queues: state.queues, vanished: -1, vanishing: -1
    };
    for (var i = 0; i < spec.order.length; i++) {
      var next = play(probe, spec.order[i]);
      if (next && next.winner === player) return spec.order[i];
    }
    return -1;
  }

  function evaluateTwistXO(state, player) {
    var opp = 3 - player;
    var fadeMe = state.queues[player].length >= 3 ? state.queues[player][0] : -1;
    var fadeOpp = state.queues[opp].length >= 3 ? state.queues[opp][0] : -1;
    var b = state.board, score = 0;
    if (b[4] === player) score += fadeMe === 4 ? 2 : 7;
    else if (b[4] === opp) score -= fadeOpp === 4 ? 2 : 7;
    var corners = [0, 2, 6, 8];
    for (var c = 0; c < 4; c++) {
      var cell = corners[c];
      if (b[cell] === player && fadeMe !== cell) score += 2;
      else if (b[cell] === opp && fadeOpp !== cell) score -= 2;
    }
    for (var l = 0; l < xoLines.length; l++) {
      var line = xoLines[l], mine = 0, myFade = 0, theirs = 0, oppFade = 0;
      for (var k = 0; k < 3; k++) {
        var idx = line[k];
        if (b[idx] === player) { mine++; if (idx === fadeMe) myFade++; }
        else if (b[idx] === opp) { theirs++; if (idx === fadeOpp) oppFade++; }
      }
      if (mine && !theirs) {
        if (mine === 2) score += myFade ? 5 : 42;
        else if (!myFade) score += 4;
      } else if (theirs && !mine) {
        if (theirs === 2) score -= oppFade ? 5 : 52;
        else if (!oppFade) score -= 4;
      }
    }
    return score;
  }

  function searchTwistXO(state, spec, depth, alpha, beta) {
    if (!depth) return evaluateTwistXO(state, state.turn);
    var best = -Infinity;
    for (var i = 0; i < spec.order.length; i++) {
      var next = play(state, spec.order[i]);
      if (!next) continue;
      var score = next.winner ? 100000 + depth : -searchTwistXO(next, spec, depth - 1, -beta, -alpha);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best === -Infinity ? 0 : best;
  }

  function chooseTwistXO(state, spec, skill, level, random) {
    if (skill) {
      var me = state.turn;
      var win = immediateWinTwistXO(state, spec, me);
      var threat = immediateWinTwistXO(state, spec, 3 - me);
      if (win !== -1 && random() < skill.win) return win;
      if (threat !== -1 && random() < skill.block) return threat;
      if (win !== -1 || threat !== -1 || random() < skill.slip) {
        var safe = [], other = [];
        for (var j = 0; j < spec.order.length; j++) {
          var mv = spec.order[j];
          if (state.board[mv] !== 0 || mv === win || mv === threat) continue;
          other.push(mv);
          var after = play(state, mv);
          if (after && immediateWinTwistXO(after, spec, 3 - me) === -1) safe.push(mv);
        }
        var pool = safe.length ? safe : other;
        return pool.length ? pool[Math.floor(random() * pool.length)] : win !== -1 ? win : threat;
      }
    }
    var depth = skill ? (level === 'easy' ? 1 : 3) : 6;
    var slack = skill ? 1 : 0;
    var best = -Infinity, ties = [];
    for (var i = 0; i < spec.order.length; i++) {
      var move = spec.order[i];
      var next = play(state, move);
      if (!next) continue;
      var score = next.winner ? 100000 + depth : -searchTwistXO(next, spec, depth - 1, -Infinity, slack - best);
      if (score > best) { best = score; ties = [move]; }
      else if (score === best) ties.push(move);
    }
    return skill ? ties[Math.floor(random() * ties.length)] : ties[0];
  }

  function chooseTwistConnect(state, spec, skill, level, random) {
    var me = state.turn, opp = 3 - me;
    var normalMoves = legalMoves(state);
    var myPowers = state.powers[me];
    if (!normalMoves.length) {
      var anvils = legalMoves(state, 'anvil');
      if (!anvils.length) return null;
      var bestCol = anvils[0], bestEval = -Infinity;
      for (var a = 0; a < anvils.length; a++) {
        var res = play(state, anvils[a], 'anvil');
        var sc = res.winner === me ? 100000 : evaluate(res.board, spec, me);
        if (sc > bestEval) { bestEval = sc; bestCol = anvils[a]; }
      }
      return { col: bestCol, power: 'anvil' };
    }
    var normalWin = immediateWin(state.board, spec, me);
    if (normalWin !== -1 && !skill) return normalWin;
    if (level !== 'easy') {
      var powerTypes = ['zap', 'anvil'];
      // 1. Use a power disc if it wins immediately when no normal move wins!
      if (normalWin === -1 && (!skill || random() < 0.85)) {
        for (var pt = 0; pt < powerTypes.length; pt++) {
          var pName = powerTypes[pt];
          if (!myPowers[pName]) continue;
          for (var ci = 0; ci < spec.order.length; ci++) {
            var cWin = play(state, spec.order[ci], pName);
            if (cWin && cWin.winner === me) return { col: spec.order[ci], power: pName };
          }
        }
      }
      // 2. Use a power disc to neutralize an unstoppable threat or smash a 3-stack!
      var oppThreat = immediateWin(state.board, spec, opp);
      if (oppThreat !== -1) {
        var normalBlocksAll = false;
        for (var nb = 0; nb < normalMoves.length; nb++) {
          var tried = play(state, normalMoves[nb]);
          if (tried && immediateWin(tried.board, spec, opp) === -1) { normalBlocksAll = true; break; }
        }
        if (!normalBlocksAll) {
          for (var pt2 = 0; pt2 < powerTypes.length; pt2++) {
            var pBlock = powerTypes[pt2];
            if (!myPowers[pBlock]) continue;
            for (var cj = 0; cj < spec.order.length; cj++) {
              var saved = play(state, spec.order[cj], pBlock);
              if (saved && immediateWin(saved.board, spec, opp) === -1) return { col: spec.order[cj], power: pBlock };
            }
          }
        }
      } else if (state.moves >= 6 && (!skill || random() < 0.4)) {
        var baseEval = evaluate(state.board, spec, me);
        for (var pt3 = 0; pt3 < powerTypes.length; pt3++) {
          var pTact = powerTypes[pt3];
          if (!myPowers[pTact]) continue;
          for (var ck = 0; ck < spec.order.length; ck++) {
            var tact = play(state, spec.order[ck], pTact);
            if (tact && immediateWin(tact.board, spec, opp) === -1 && evaluate(tact.board, spec, me) >= baseEval + 105) {
              return { col: spec.order[ck], power: pTact };
            }
          }
        }
      }
    }
    return null;
  }

  // Easier computers notice wins and threats only some of the time and
  // sometimes play a casual move. 'hard' is the full deterministic search.
  // Simulated typical kids win about half of easy games and a quarter of medium ones.
  var levels = {
    easy: { win: 0.65, block: 0.4, slip: 0.7, depth: 1 },
    medium: { win: 0.9, block: 0.75, slip: 0.4, depth: 2 }
  };

  function casualMove(state, spec, skill, random) {
    var board = state.board.slice();
    var me = state.turn;
    var win = immediateWin(board, spec, me);
    var threat = immediateWin(board, spec, 3 - me);
    if (win !== -1 && random() < skill.win) return win;
    if (threat !== -1 && random() < skill.block) return threat;
    if (win === -1 && threat === -1 && random() >= skill.slip) return null;
    // A missed win or block, or a slip: any other move that does not hand
    // over a win at once. Connect 4 prefers the middle columns.
    var safe = [], other = [];
    for (var i = 0; i < spec.order.length; i++) {
      var move = spec.order[i];
      var last = landing(board, spec, move);
      if (last === -1 || move === win || move === threat) continue;
      other.push(move);
      board[last] = me;
      if (immediateWin(board, spec, 3 - me) === -1) {
        for (var w = spec.rows === 3 ? 1 : 4 - Math.abs(move - 3); w > 0; w--) safe.push(move);
      }
      board[last] = 0;
    }
    var pool = safe.length ? safe : other;
    return pool.length ? pool[Math.floor(random() * pool.length)] : win !== -1 ? win : threat;
  }

  // level: 'easy', 'medium' or 'hard' (default). random is injectable for tests.
  function chooseMove(state, level, random) {
    var spec = valid(state);
    if (!spec || state.winner || state.draw) return null;
    var skill = Object.prototype.hasOwnProperty.call(levels, level) ? levels[level] : null;
    random = random || Math.random;
    if (state.variant === 'twist') {
      if (state.game === 'tic-tac-toe') return chooseTwistXO(state, spec, skill, level, random);
      var powerChoice = chooseTwistConnect(state, spec, skill, level, random);
      if (powerChoice !== null) return powerChoice;
    }
    if (skill) {
      var casual = casualMove(state, spec, skill, random);
      if (casual !== null) return casual;
    }
    var board = state.board.slice();
    var occupied = state.variant === 'twist' ? board.reduce(function (sum, cell) { return sum + (cell ? 1 : 0); }, 0) : state.moves;
    var remaining = board.length - occupied;
    // evaluate() only understands Connect 4, so tic-tac-toe always searches to the end.
    var depth = spec.rows === 3 ? remaining : Math.min(skill ? skill.depth : 4, remaining);
    var best = -Infinity;
    // Easier levels need exact scores for equal moves to pick one at random.
    var slack = skill ? 1 : 0;
    var ties = [];
    for (var i = 0; i < spec.order.length; i++) {
      var move = spec.order[i];
      var last = landing(board, spec, move);
      if (last === -1) continue;
      board[last] = state.turn;
      var score = winningLine(board, spec, last, state.turn).length ? 100000 + depth :
        -search(board, spec, 3 - state.turn, remaining - 1, depth - 1, -Infinity, slack - best);
      board[last] = 0;
      if (score > best) {
        best = score;
        ties = [move];
      } else if (score === best) ties.push(move);
    }
    return skill ? ties[Math.floor(random() * ties.length)] : ties[0];
  }

  return { create: create, legalMoves: legalMoves, play: play, chooseMove: chooseMove };
}));

