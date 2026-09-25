/*
 * Block Burst — pure game logic (no DOM). Used by game.js in the browser and by
 * verify-levels.js in Node. Classic script: exposes window.BBCore (or module.exports).
 *
 * Board: 8x8. A "mask" is an array of 8 row bitmasks (bit c = column c filled).
 * Pieces are shapes from SHAPES with {id, fam, tier, w, h, cells:[[r,c]..], rows:[bitmask..]}.
 */
(function (root) {
  'use strict';
  var N = 8, FULL = 255;

  /* ------------------------------------------------------------ shapes */
  // family: [tier, weight, [rotations as row strings]]
  var FAMS = {
    dot:   [0, 0.55, [['#']]],
    two:   [0, 1.0, [['##'], ['#', '#']]],
    three: [0, 1.0, [['###'], ['#', '#', '#']]],
    corner:[0, 1.0, [['##', '#.'], ['##', '.#'], ['#.', '##'], ['.#', '##']]],
    four:  [1, 0.9, [['####'], ['#', '#', '#', '#']]],
    sq2:   [1, 1.0, [['##', '##']]],
    ell:   [1, 1.1, [['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
                     ['###', '#..'], ['###', '..#'], ['#..', '###'], ['..#', '###']]],
    tee:   [1, 0.9, [['###', '.#.'], ['.#.', '###'], ['#.', '##', '#.'], ['.#', '##', '.#']]],
    zig:   [1, 0.7, [['.##', '##.'], ['##.', '.##'], ['#.', '##', '.#'], ['.#', '##', '#.']]],
    five:  [2, 0.9, [['#####'], ['#', '#', '#', '#', '#']]],
    sq3:   [2, 0.8, [['###', '###', '###']]],
    bigL:  [2, 1.0, [['###', '#..', '#..'], ['###', '..#', '..#'], ['#..', '#..', '###'], ['..#', '..#', '###']]],
    rect:  [2, 0.9, [['###', '###'], ['##', '##', '##']]]
  };
  var SHAPES = [], BY_ID = {}, FAM_LIST = [];
  Object.keys(FAMS).forEach(function (fam) {
    var f = FAMS[fam], rots = f[2], ids = [];
    rots.forEach(function (rows, k) {
      var cells = [], masks = [];
      for (var r = 0; r < rows.length; r++) {
        var m = 0;
        for (var c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') { cells.push([r, c]); m |= 1 << c; }
        masks.push(m);
      }
      var s = { id: fam + k, fam: fam, tier: f[0], w: rows[0].length, h: rows.length, cells: cells, rows: masks, n: cells.length };
      SHAPES.push(s); BY_ID[s.id] = s; ids.push(s.id);
    });
    FAM_LIST.push({ fam: fam, tier: f[0], weight: f[1], ids: ids });
  });

  /* -------------------------------------------------------------- rng */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------ masks */
  function maskFromBoard(board) {
    var m = [0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 64; i++) if (board[i]) m[i >> 3] |= 1 << (i & 7);
    return m;
  }
  function fits(mask, s, r, c) {
    if (r < 0 || c < 0 || r + s.h > N || c + s.w > N) return false;
    for (var i = 0; i < s.h; i++) if (mask[r + i] & (s.rows[i] << c)) return false;
    return true;
  }
  function anyFit(mask, s) {
    for (var r = 0; r <= N - s.h; r++) for (var c = 0; c <= N - s.w; c++) if (fits(mask, s, r, c)) return true;
    return false;
  }
  function countFits(mask, s) {
    var n = 0;
    for (var r = 0; r <= N - s.h; r++) for (var c = 0; c <= N - s.w; c++) if (fits(mask, s, r, c)) n++;
    return n;
  }
  // Returns new mask after placing + clearing, and sets out.lines
  function placeMask(mask, s, r, c, out) {
    var m = mask.slice();
    for (var i = 0; i < s.h; i++) m[r + i] |= s.rows[i] << c;
    var colFull = FULL;
    for (i = 0; i < N; i++) colFull &= m[i];
    var lines = 0;
    for (i = 0; i < N; i++) if (m[i] === FULL) { m[i] = 0; lines++; }
    if (colFull) {
      for (var b = colFull; b; b &= b - 1) lines++;
      for (i = 0; i < N; i++) m[i] &= ~colFull;
    }
    if (out) out.lines = lines;
    return m;
  }
  function linesIfPlaced(mask, s, r, c) {
    var o = {}; placeMask(mask, s, r, c, o); return o.lines;
  }
  // Which rows/cols would be completed (for hover preview)
  function previewLines(mask, s, r, c) {
    var m = mask.slice();
    for (var i = 0; i < s.h; i++) m[r + i] |= s.rows[i] << c;
    var rows = [], cols = [], colFull = FULL;
    for (i = 0; i < N; i++) { colFull &= m[i]; if (m[i] === FULL) rows.push(i); }
    for (i = 0; i < N; i++) if (colFull & (1 << i)) cols.push(i);
    return { rows: rows, cols: cols };
  }
  function popcount8(x) { var n = 0; while (x) { x &= x - 1; n++; } return n; }
  function filled(mask) { var n = 0; for (var i = 0; i < N; i++) n += popcount8(mask[i]); return n; }

  // Can all pieces be placed (in some order, with line clears)? budget bounds the search.
  function canPlaceAll(mask, shapes, budget) {
    var st = { left: budget || 30000 };
    function rec(m, list) {
      if (!list.length) return true;
      for (var k = 0; k < list.length; k++) {
        var s = list[k], rest = list.slice(0, k).concat(list.slice(k + 1));
        for (var r = 0; r <= N - s.h; r++) for (var c = 0; c <= N - s.w; c++) {
          if (!fits(m, s, r, c)) continue;
          if (--st.left < 0) return true; // out of budget: assume OK
          if (rec(placeMask(m, s, r, c), rest)) return true;
        }
      }
      return false;
    }
    return rec(mask, shapes);
  }

  /* --------------------------------------------------------- generator */
  function tierWeights(d) {
    // d: difficulty 0..1
    return [0.46 - 0.26 * d, 0.44 + 0.02 * d, 0.10 + 0.24 * d];
  }
  function randomShape(rng, d) {
    var tw = tierWeights(d), tot = 0, i;
    for (i = 0; i < FAM_LIST.length; i++) tot += tw[FAM_LIST[i].tier] * FAM_LIST[i].weight;
    var x = rng() * tot;
    for (i = 0; i < FAM_LIST.length; i++) {
      x -= tw[FAM_LIST[i].tier] * FAM_LIST[i].weight;
      if (x <= 0) break;
    }
    var f = FAM_LIST[Math.min(i, FAM_LIST.length - 1)];
    return BY_ID[f.ids[Math.floor(rng() * f.ids.length)]];
  }
  // A shape that completes at least one line somewhere right now (weighted by lines).
  function helperShape(rng, mask, d, hot) {
    var cands = [], tot = 0;
    for (var k = 0; k < SHAPES.length; k++) {
      var s = SHAPES[k], best = 0;
      if (s.fam === 'dot' && rng() < 0.7) continue;
      if (s.tier === 2 && d < 0.2) continue;
      for (var r = 0; r <= N - s.h; r++) for (var c = 0; c <= N - s.w; c++) {
        if (!fits(mask, s, r, c)) continue;
        var l;
        if (hot) {
          var pv = previewLines(mask, s, r, c);
          l = pv.rows.length + pv.cols.length;
          for (var q = 0; q < pv.rows.length; q++) if (hot.rows & (1 << pv.rows[q])) l += 2;
          for (q = 0; q < pv.cols.length; q++) if (hot.cols & (1 << pv.cols[q])) l += 2;
        } else l = linesIfPlaced(mask, s, r, c);
        if (l > best) best = l;
      }
      if (best > 0) { var w = best * best * (s.n >= 3 ? 1.4 : 1); cands.push([s, w]); tot += w; }
    }
    if (!cands.length) return null;
    var x = rng() * tot;
    for (k = 0; k < cands.length; k++) { x -= cands[k][1]; if (x <= 0) return cands[k][0]; }
    return cands[cands.length - 1][0];
  }

  /*
   * generateSet(mask, opts) -> [shape, shape, shape]
   * opts: { rng, difficulty 0..1, help 0..1 (chance of a line-completing piece) }
   * Tries hard to hand out a set that can all be placed. Falls back gracefully.
   */
  function generateSet(mask, opts) {
    var rng = opts.rng || Math.random, d = opts.difficulty || 0, help = opts.help == null ? 0.4 : opts.help;
    var fillRatio = filled(mask) / 64;
    var bestSet = null, bestScore = -1;
    for (var attempt = 0; attempt < 40; attempt++) {
      // soften difficulty on later attempts
      var dd = attempt > 20 ? d * 0.4 : d;
      var set = [];
      if (rng() < help + (fillRatio > 0.5 ? 0.2 : 0)) {
        var hs = helperShape(rng, mask, dd, opts.hot);
        if (hs) set.push(hs);
      }
      while (set.length < 3) {
        var s = randomShape(rng, dd);
        // avoid triple duplicates of the same family
        var same = 0;
        for (var j = 0; j < set.length; j++) if (set[j].fam === s.fam) same++;
        if (same >= 1 && rng() < 0.75) continue;
        set.push(s);
      }
      // shuffle
      for (var i = set.length - 1; i > 0; i--) { var q = Math.floor(rng() * (i + 1)); var t = set[i]; set[i] = set[q]; set[q] = t; }
      if (canPlaceAll(mask, set, 25000)) return set;
      var sc = 0;
      for (i = 0; i < 3; i++) if (anyFit(mask, set[i])) sc++;
      if (sc > bestScore) { bestScore = sc; bestSet = set; }
    }
    if (bestScore > 0) return bestSet;
    // desperate: small pieces
    return [BY_ID.dot0, BY_ID.two0, BY_ID.two1];
  }

  /* ---------------------------------------------------------- scoring */
  var LINE_PTS = [0, 20, 60, 120, 200, 300, 420, 560, 720, 900, 1100, 1320, 1560, 1820, 2100, 2400, 2720];
  function clearPoints(lines, streak) {
    if (!lines) return 0;
    var mult = Math.min(8, Math.max(1, streak));
    return LINE_PTS[Math.min(lines, LINE_PTS.length - 1)] * mult;
  }
  var PERFECT_BONUS = 600;

  /* ------------------------------------------------------ full board op */
  /*
   * Board state: { cells: Uint8Array(64) colour 0..n, gems: Uint8Array(64) kind 0..4 }
   * placePiece(state, piece{shape, color, gemCell, gemKind}, r, c)
   *  -> { lines, rows:[], cols:[], cleared:[{i,color,gem}], gems:{kind:count}, perfect }
   */
  function placePiece(st, piece, r, c) {
    var s = piece.shape, k, i;
    for (k = 0; k < s.cells.length; k++) {
      i = (r + s.cells[k][0]) * N + (c + s.cells[k][1]);
      st.cells[i] = piece.color;
      st.gems[i] = (piece.gemCell === k) ? piece.gemKind : 0;
    }
    var rows = [], cols = [];
    for (var y = 0; y < N; y++) {
      var full = true;
      for (var x = 0; x < N; x++) if (!st.cells[y * N + x]) { full = false; break; }
      if (full) rows.push(y);
    }
    for (x = 0; x < N; x++) {
      full = true;
      for (y = 0; y < N; y++) if (!st.cells[y * N + x]) { full = false; break; }
      if (full) cols.push(x);
    }
    var mark = {}, cleared = [], gems = {};
    rows.forEach(function (y) { for (var x = 0; x < N; x++) mark[y * N + x] = 1; });
    cols.forEach(function (x) { for (var y = 0; y < N; y++) mark[y * N + x] = 1; });
    Object.keys(mark).forEach(function (key) {
      var j = +key;
      cleared.push({ i: j, color: st.cells[j], gem: st.gems[j] });
      if (st.gems[j]) gems[st.gems[j]] = (gems[st.gems[j]] || 0) + 1;
      st.cells[j] = 0; st.gems[j] = 0;
    });
    var perfect = false;
    if (rows.length + cols.length > 0) {
      perfect = true;
      for (i = 0; i < 64; i++) if (st.cells[i]) { perfect = false; break; }
    }
    return { lines: rows.length + cols.length, rows: rows, cols: cols, cleared: cleared, gems: gems, perfect: perfect };
  }

  // Parse a level board (8 strings). '.' empty, a-h colour 1-8, R/B/G/Y gem kinds 1-4 (on a block).
  var GEM_CHARS = { R: 1, B: 2, G: 3, Y: 4 };
  var GEM_BLOCK_COLOR = { 1: 8, 2: 5, 3: 7, 4: 2 }; // block colour under preset gems
  function parseBoard(rows) {
    var cells = new Uint8Array(64), gems = new Uint8Array(64);
    if (!rows) return { cells: cells, gems: gems };
    for (var r = 0; r < N; r++) {
      var line = rows[r] || '';
      for (var c = 0; c < N; c++) {
        var ch = line[c] || '.', i = r * N + c;
        if (ch === '.') continue;
        if (GEM_CHARS[ch]) { gems[i] = GEM_CHARS[ch]; cells[i] = GEM_BLOCK_COLOR[gems[i]]; }
        else cells[i] = Math.max(1, Math.min(8, ch.charCodeAt(0) - 96));
      }
    }
    return { cells: cells, gems: gems };
  }

  var api = {
    N: N, SHAPES: SHAPES, BY_ID: BY_ID, FAM_LIST: FAM_LIST,
    mulberry: mulberry, maskFromBoard: maskFromBoard, fits: fits, anyFit: anyFit, countFits: countFits,
    placeMask: placeMask, linesIfPlaced: linesIfPlaced, previewLines: previewLines, filled: filled,
    canPlaceAll: canPlaceAll, generateSet: generateSet, randomShape: randomShape, helperShape: helperShape,
    clearPoints: clearPoints, PERFECT_BONUS: PERFECT_BONUS, placePiece: placePiece, parseBoard: parseBoard
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BBCore = api;
})(typeof window !== 'undefined' ? window : this);
