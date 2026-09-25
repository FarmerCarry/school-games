/*
 * Block Burst — run rules (scoring, combos, dealing, goals). No DOM.
 * Shared by game.js and verify-levels.js. Exposes window.BBRules / module.exports.
 */
(function (root) {
  'use strict';
  var Core = root.BBCore || (typeof require !== 'undefined' ? require('./core.js') : null);

  var STREAK_GRACE = 3; // placements without a clear before the combo streak breaks
  var GIFT_EVERY = 1500; // classic: a free power-up every N points
  var MAX_POWER = 3;

  function classicDifficulty(score) {
    var d = Math.min(1, score / 4500);
    return Math.pow(d, 0.85);
  }

  function makePiece(shape, color) { return { shape: shape, color: color, gemCell: -1, gemKind: 0 }; }

  function newRun(mode, level, rng) {
    var b = Core.parseBoard(level && level.board);
    var run = {
      mode: mode, level: level || null, rng: rng || Math.random,
      cells: b.cells, gems: b.gems, tray: [null, null, null],
      score: 0, streak: 0, miss: 0, moves: 0, sets: 0, bestStreak: 0, linesTotal: 0,
      goalGems: null, goalScore: 0, movesLimit: 0, result: null,
      bombs: 1, shuffles: 1, nextGift: GIFT_EVERY
    };
    if (level) {
      if (level.gems) { run.goalGems = {}; for (var k in level.gems) run.goalGems[k] = level.gems[k]; }
      if (level.score) run.goalScore = level.score;
      if (level.moves) run.movesLimit = level.moves;
    }
    deal(run);
    return run;
  }

  function gemsInPlay(run) {
    var have = {}, i;
    for (i = 0; i < 64; i++) if (run.gems[i]) have[run.gems[i]] = (have[run.gems[i]] || 0) + 1;
    for (i = 0; i < 3; i++) { var p = run.tray[i]; if (p && p.gemKind) have[p.gemKind] = (have[p.gemKind] || 0) + 1; }
    return have;
  }

  function deal(run) {
    var rng = run.rng, mask = Core.maskFromBoard(run.cells), d, help;
    if (run.level) { d = run.level.diff || 0; help = run.level.help == null ? 0.45 : run.level.help; }
    else { d = classicDifficulty(run.score); help = 0.7 - 0.4 * d; if (run.sets === 0) { d = 0; help = 0; } }
    var hot = null;
    if (run.goalGems) {
      hot = { rows: 0, cols: 0 };
      for (var g = 0; g < 64; g++) if (run.gems[g]) { hot.rows |= 1 << (g >> 3); hot.cols |= 1 << (g & 7); }
      if (!hot.rows) hot = null;
    }
    var shapes = Core.generateSet(mask, { rng: rng, difficulty: d, help: help, hot: hot });
    // distinct colours
    var cols = [1, 2, 3, 4, 5, 6, 7, 8];
    for (var i = cols.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
    for (i = 0; i < 3; i++) run.tray[i] = makePiece(shapes[i], cols[i]);
    run.sets++;
    // adventure: some pieces carry gems that are still needed
    if (run.goalGems) {
      var have = gemsInPlay(run), rate = run.level.gemRate || 0;
      for (i = 0; i < 3; i++) {
        var need = [];
        for (var k in run.goalGems) {
          var n = run.goalGems[k] - (have[k] || 0);
          for (var q = 0; q < n; q++) need.push(+k);
        }
        if (!need.length) break;
        var boardHasGem = false;
        for (var z = 0; z < 64; z++) if (run.gems[z]) { boardHasGem = true; break; }
        var chance = boardHasGem ? rate : Math.max(rate, 0.7);
        if (rng() < chance) {
          var p = run.tray[i];
          p.gemCell = Math.floor(rng() * p.shape.n);
          p.gemKind = need[Math.floor(rng() * need.length)];
          have[p.gemKind] = (have[p.gemKind] || 0) + 1;
        }
      }
    }
    return run.tray;
  }

  function trayFits(run) {
    var mask = Core.maskFromBoard(run.cells), any = false, fl = [];
    for (var i = 0; i < 3; i++) {
      var p = run.tray[i];
      fl[i] = !!(p && Core.anyFit(mask, p.shape));
      if (fl[i]) any = true;
    }
    return { any: any, each: fl };
  }

  function goalDone(run) {
    if (!run.level) return false;
    if (run.goalGems) { for (var k in run.goalGems) if (run.goalGems[k] > 0) return false; }
    if (run.goalScore && run.score < run.goalScore) return false;
    return true;
  }

  /*
   * place(run, slot, r, c) — assumes the fit was already checked.
   * Returns an event object describing everything that happened (for effects).
   */
  function place(run, slot, r, c) {
    var piece = run.tray[slot];
    run.tray[slot] = null;
    run.moves++;
    var res = Core.placePiece(run, piece, r, c);
    var ev = { piece: piece, r: r, c: c, lines: res.lines, rows: res.rows, cols: res.cols, cleared: res.cleared,
      gems: res.gems, perfect: res.perfect, placePts: piece.shape.n, clearPts: 0, bonus: 0,
      streak: 0, refilled: false, over: false, win: false, fail: null };
    if (res.lines) {
      run.streak++; run.miss = 0;
      run.linesTotal += res.lines;
      if (run.streak > run.bestStreak) run.bestStreak = run.streak;
      ev.clearPts = Core.clearPoints(res.lines, run.streak);
      if (res.perfect) ev.bonus = Core.PERFECT_BONUS;
    } else {
      run.miss++;
      if (run.miss >= STREAK_GRACE) run.streak = 0;
    }
    ev.streak = run.streak;
    run.score += ev.placePts + ev.clearPts + ev.bonus;
    if (run.goalGems) {
      for (var k in res.gems) if (run.goalGems[k] != null) run.goalGems[k] = Math.max(0, run.goalGems[k] - res.gems[k]);
    }
    if (goalDone(run)) { ev.win = true; run.result = 'win'; return ev; }
    if (!run.tray[0] && !run.tray[1] && !run.tray[2]) { deal(run); ev.refilled = true; }
    if (run.movesLimit && run.moves >= run.movesLimit) { ev.over = true; ev.fail = 'moves'; run.result = 'fail'; return ev; }
    giftCheck(run, ev);
    if (!trayFits(run).any) {
      if (run.bombs > 0 || run.shuffles > 0) ev.stuck = true;
      else { ev.over = true; ev.fail = 'space'; run.result = run.level ? 'fail' : 'over'; }
    }
    return ev;
  }

  function giftCheck(run, ev) {
    if (run.level) return;
    while (run.score >= run.nextGift) {
      run.nextGift += GIFT_EVERY;
      var kind = run.bombs <= run.shuffles ? 'bomb' : 'shuffle';
      if (kind === 'bomb' && run.bombs < MAX_POWER) run.bombs++;
      else if (run.shuffles < MAX_POWER) { run.shuffles++; kind = 'shuffle'; }
      else if (run.bombs < MAX_POWER) { run.bombs++; kind = 'bomb'; }
      else kind = null;
      if (kind && ev) ev.gift = kind;
    }
  }

  // 3x3 area of a bomb dropped with its centre on (r, c), clamped to the board.
  function bombArea(r, c) {
    r = Math.max(1, Math.min(6, r)); c = Math.max(1, Math.min(6, c));
    return { r: r - 1, c: c - 1 };
  }
  function useBomb(run, r, c) {
    if (run.bombs <= 0) return null;
    run.bombs--;
    var a = bombArea(r, c), cleared = [], gems = {};
    for (var y = a.r; y < a.r + 3; y++) for (var x = a.c; x < a.c + 3; x++) {
      var i = y * 8 + x;
      if (!run.cells[i]) continue;
      cleared.push({ i: i, color: run.cells[i], gem: run.gems[i] });
      if (run.gems[i]) gems[run.gems[i]] = (gems[run.gems[i]] || 0) + 1;
      run.cells[i] = 0; run.gems[i] = 0;
    }
    var ev = { bomb: true, r: a.r, c: a.c, cleared: cleared, gems: gems, points: cleared.length * 5, win: false, over: false };
    run.score += ev.points;
    if (run.goalGems) for (var k in gems) if (run.goalGems[k] != null) run.goalGems[k] = Math.max(0, run.goalGems[k] - gems[k]);
    if (goalDone(run)) { ev.win = true; run.result = 'win'; return ev; }
    giftCheck(run, ev);
    afterPower(run, ev);
    return ev;
  }
  function useShuffle(run) {
    if (run.shuffles <= 0) return null;
    run.shuffles--;
    deal(run);
    var ev = { shuffle: true, win: false, over: false };
    afterPower(run, ev);
    return ev;
  }
  function afterPower(run, ev) {
    if (!trayFits(run).any) {
      if (run.bombs > 0 || run.shuffles > 0) ev.stuck = true;
      else { ev.over = true; ev.fail = 'space'; run.result = run.level ? 'fail' : 'over'; }
    }
  }

  function stars(level, moves) {
    if (moves <= level.stars[0]) return 3;
    if (moves <= level.stars[1]) return 2;
    return 1;
  }

  // Serialise / restore a run (for saving an in-progress game)
  function save(run) {
    return {
      mode: run.mode, lvl: run.level ? run.level.idx : -1,
      cells: Array.prototype.slice.call(run.cells), gems: Array.prototype.slice.call(run.gems),
      tray: run.tray.map(function (p) { return p ? [p.shape.id, p.color, p.gemCell, p.gemKind] : null; }),
      score: run.score, streak: run.streak, miss: run.miss, moves: run.moves, sets: run.sets,
      bestStreak: run.bestStreak, linesTotal: run.linesTotal, goalGems: run.goalGems,
      bombs: run.bombs, shuffles: run.shuffles, nextGift: run.nextGift
    };
  }
  function load(data, level) {
    try {
      if (!data || !data.cells || data.cells.length !== 64) return null;
      var run = newRun(data.mode, level, Math.random);
      for (var i = 0; i < 64; i++) { run.cells[i] = data.cells[i] | 0; run.gems[i] = (data.gems && data.gems[i]) | 0; }
      for (i = 0; i < 3; i++) {
        var t = data.tray[i];
        if (t && Core.BY_ID[t[0]]) run.tray[i] = { shape: Core.BY_ID[t[0]], color: t[1] | 0 || 1, gemCell: t[2] == null ? -1 : t[2], gemKind: t[3] | 0 };
        else run.tray[i] = null;
      }
      if (!run.tray[0] && !run.tray[1] && !run.tray[2]) deal(run);
      run.score = data.score | 0; run.streak = data.streak | 0; run.miss = data.miss | 0; run.moves = data.moves | 0;
      run.sets = data.sets | 0; run.bestStreak = data.bestStreak | 0; run.linesTotal = data.linesTotal | 0;
      if (data.goalGems && run.goalGems) for (var k in run.goalGems) if (data.goalGems[k] != null) run.goalGems[k] = data.goalGems[k] | 0;
      if (data.bombs != null) run.bombs = Math.max(0, Math.min(MAX_POWER, data.bombs | 0));
      if (data.shuffles != null) run.shuffles = Math.max(0, Math.min(MAX_POWER, data.shuffles | 0));
      if (data.nextGift) run.nextGift = data.nextGift | 0;
      if (!trayFits(run).any && !run.bombs && !run.shuffles) return null;
      return run;
    } catch (e) { return null; }
  }

  var api = { newRun: newRun, deal: deal, place: place, useBomb: useBomb, useShuffle: useShuffle, bombArea: bombArea, MAX_POWER: MAX_POWER, GIFT_EVERY: GIFT_EVERY, trayFits: trayFits, goalDone: goalDone, stars: stars,
    save: save, load: load, classicDifficulty: classicDifficulty, STREAK_GRACE: STREAK_GRACE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BBRules = api;
})(typeof window !== 'undefined' ? window : this);
