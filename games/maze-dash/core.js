/*
 * Maze Dash — core rules shared by the game (browser) and the level verifier (node).
 * Classic script: defines window.MDCore (or module.exports under node).
 *
 * Contains: tile/item codes, level parsing, deterministic hazard timing
 * (bats, spike traps, puffers, moving blocks) and a BFS planner that the
 * game uses for its autoplay/demo mode and the verifier uses to prove every
 * level can be finished with every dot collected.
 */
(function (root) {
  'use strict';

  var T = { EMPTY: 0, WALL: 1, SPIKE: 2, EXIT: 3, TRAP: 4, CHECK: 5 };
  var I = { NONE: 0, DOT: 1, COIN: 2, SHIELD: 3, MAGNET: 4, FREEZE: 5, DOUBLE: 6 };
  var DIRS = [
    { dx: 0, dy: -1 }, // 0 up
    { dx: 1, dy: 0 },  // 1 right
    { dx: 0, dy: 1 },  // 2 down
    { dx: -1, dy: 0 }  // 3 left
  ];

  // Timing (seconds of "hazard time", which stops while Freeze is active).
  var TIMING = {
    DASH_SPEED: 24,      // tiles per second
    TRAP_CYCLE: 2.8,     // down 1.5, warn 0.5, up 0.8
    TRAP_DOWN: 1.5, TRAP_WARN: 0.5,
    PUFF_CYCLE: 3.4,     // small 1.9, swell 0.5, big 0.8, shrink 0.2
    PUFF_SMALL: 1.9, PUFF_WARN: 0.5, PUFF_BIG: 0.8,
    BLOCK_STEP: 0.42,    // one tile per step
    BAT_SPEED: 2.6,
    BAT_RADIUS: 0.36,    // in tiles (player radius added separately)
    PLAYER_RADIUS: 0.26
  };

  function key(x, y) { return (y + 8192) * 64 + x; }
  function isSolid(t) { return t === T.WALL || t === T.SPIKE; }

  /* ------------------------------------------------------------ parsing */
  // Legend:  # wall   X spike wall   . dot   - empty   o coin   P start   E exit
  //          ^ spike trap   ~ spike trap (offset half a cycle)   C checkpoint
  //          b bat (left-right)   v bat (up-down)   f puffer
  //          = moving block (left-right)   | moving block (up-down)
  //          S shield   M magnet   F freeze   2 coin doubler
  function parseLevel(def) {
    var rows = def.map, h = rows.length, w = 0, x, y;
    for (y = 0; y < h; y++) w = Math.max(w, rows[y].length);
    var L = {
      name: def.name || '', w: w, h: h, par: def.par || 30,
      tiles: new Uint8Array(w * h), items: new Uint8Array(w * h),
      start: { x: 1, y: h - 2 }, exit: { x: 1, y: 1 },
      bats: [], puffers: [], blocks: [], traps: [], checks: [],
      dots: 0, coins: 0, batSpeed: def.batSpeed || TIMING.BAT_SPEED,
      blockStep: def.blockStep || TIMING.BLOCK_STEP
    };
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var c = rows[y].charAt(x) || '#', i = y * w + x, t = T.EMPTY, it = I.NONE;
        switch (c) {
          case '#': t = T.WALL; break;
          case 'X': t = T.SPIKE; break;
          case '.': it = I.DOT; break;
          case 'o': it = I.COIN; break;
          case 'P': L.start = { x: x, y: y }; break;
          case 'E': t = T.EXIT; L.exit = { x: x, y: y }; break;
          case '^': t = T.TRAP; L.traps.push({ x: x, y: y, off: 0 }); break;
          case '~': t = T.TRAP; L.traps.push({ x: x, y: y, off: TIMING.TRAP_CYCLE / 2 }); break;
          case 'C': t = T.CHECK; L.checks.push({ x: x, y: y }); break;
          case 'b': L.bats.push({ x: x, y: y, axis: 0 }); break;
          case 'v': L.bats.push({ x: x, y: y, axis: 1 }); break;
          case 'f': L.puffers.push({ x: x, y: y }); break;
          case '=': L.blocks.push({ x: x, y: y, dx: 1, dy: 0 }); break;
          case '|': L.blocks.push({ x: x, y: y, dx: 0, dy: -1 }); break;
          case 'S': it = I.SHIELD; break;
          case 'M': it = I.MAGNET; break;
          case 'F': it = I.FREEZE; break;
          case '2': it = I.DOUBLE; break;
          default: break;
        }
        L.tiles[i] = t; L.items[i] = it;
        if (it === I.DOT) L.dots++;
        if (it === I.COIN) L.coins++;
      }
    }
    // Bat patrol ranges: along the axis until a wall / exit.
    L.bats.forEach(function (b, n) {
      var ax = b.axis === 0, lo = ax ? b.x : b.y, hi = lo;
      function free(v) {
        var xx = ax ? v : b.x, yy = ax ? b.y : v;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
        var tt = L.tiles[yy * w + xx];
        return !isSolid(tt) && tt !== T.EXIT;
      }
      while (free(lo - 1)) lo--;
      while (free(hi + 1)) hi++;
      b.min = lo; b.max = hi; b.speed = L.batSpeed;
      b.off = (ax ? b.x : b.y) - lo;
      b.id = n;
    });
    L.puffers.forEach(function (p, n) { p.off = (n % 2) * 1.2; });
    return L;
  }

  /* ------------------------------------------------------ hazard timing */
  function batPos(b, t) {
    var span = b.max - b.min;
    if (span <= 0) return b.min;
    var s = (t * b.speed + b.off) % (2 * span);
    if (s < 0) s += 2 * span;
    return s <= span ? b.min + s : b.max - (s - span);
  }
  function batXY(b, t) {
    var p = batPos(b, t);
    return b.axis === 0 ? { x: p, y: b.y } : { x: b.x, y: p };
  }
  // 0 = down (safe), 1 = warning (safe), 2 = up (deadly)
  function trapState(tr, t) {
    var c = (t + tr.off) % TIMING.TRAP_CYCLE;
    if (c < TIMING.TRAP_DOWN) return 0;
    if (c < TIMING.TRAP_DOWN + TIMING.TRAP_WARN) return 1;
    return 2;
  }
  function trapPhase(tr, t) { return ((t + tr.off) % TIMING.TRAP_CYCLE); }
  // 0 = small, 1 = swelling (safe), 2 = big (neighbours deadly), 3 = shrinking (safe)
  function puffState(p, t) {
    var c = (t + p.off) % TIMING.PUFF_CYCLE;
    if (c < TIMING.PUFF_SMALL) return 0;
    if (c < TIMING.PUFF_SMALL + TIMING.PUFF_WARN) return 1;
    if (c < TIMING.PUFF_SMALL + TIMING.PUFF_WARN + TIMING.PUFF_BIG) return 2;
    return 3;
  }
  function puffPhase(p, t) { return (t + p.off) % TIMING.PUFF_CYCLE; }

  /* -------------------------------------------------------------- blocks */
  // G: { tile(x,y) } ; blocks: [{x,y,dx,dy}] mutated in place.
  // occupied(x,y) -> true if the player is there (block waits).
  function stepBlocks(G, blocks, occupied) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i], nx = b.x + b.dx, ny = b.y + b.dy, t = G.tile(nx, ny), hit = isSolid(t) || t === T.EXIT;
      if (!hit) for (var j = 0; j < blocks.length; j++) if (j !== i && blocks[j].x === nx && blocks[j].y === ny) { hit = true; break; }
      if (hit) { b.dx = -b.dx; b.dy = -b.dy; b.moved = false; continue; }
      if (occupied && occupied(nx, ny)) { b.dx = -b.dx; b.dy = -b.dy; b.moved = false; continue; }
      b.px = b.x; b.py = b.y; b.x = nx; b.y = ny; b.moved = true;
    }
  }
  function blockKey(blocks) {
    var s = '';
    for (var i = 0; i < blocks.length; i++) s += blocks[i].x + ',' + blocks[i].y + ',' + blocks[i].dx + ',' + blocks[i].dy + ';';
    return s;
  }
  // Returns { snaps: [Set of keys], next: [index of the next snapshot] }
  function blockSnapshots(G, blocks, occupied) {
    var bl = blocks.map(function (b) { return { x: b.x, y: b.y, dx: b.dx, dy: b.dy }; });
    var seen = {}, snaps = [], next = [];
    for (var n = 0; n < 300; n++) {
      var k = blockKey(bl);
      if (seen[k] != null) { next[n - 1] = seen[k]; return { snaps: snaps, next: next }; }
      seen[k] = n;
      var s = {};
      for (var i = 0; i < bl.length; i++) s[key(bl[i].x, bl[i].y)] = 1;
      snaps.push(s);
      if (n > 0) next[n - 1] = n;
      stepBlocks(G, bl, occupied);
    }
    next[snaps.length - 1] = snaps.length - 1;
    return { snaps: snaps, next: next };
  }

  /* --------------------------------------------------------------- dash */
  // Static dash from (x,y) in direction d. G: { tile(x,y), puffer(x,y) }.
  // extraSolid: key map of block positions.
  // Returns null if no movement, else { x, y, cells:[keys], exit:bool, dead:bool, spike:bool }
  function dash(G, x, y, d, extraSolid) {
    var D = DIRS[d], cx = x, cy = y, cells = [], n = 0;
    for (;;) {
      var nx = cx + D.dx, ny = cy + D.dy, t = G.tile(nx, ny);
      if (isSolid(t) || (extraSolid && extraSolid[key(nx, ny)])) {
        if (n === 0) return null;
        return { x: cx, y: cy, cells: cells, exit: false, dead: t === T.SPIKE, spike: t === T.SPIKE };
      }
      cx = nx; cy = ny; n++;
      cells.push(key(cx, cy));
      if (G.puffer && G.puffer(cx, cy)) return { x: cx, y: cy, cells: cells, exit: false, dead: true };
      if (t === T.EXIT) return { x: cx, y: cy, cells: cells, exit: true, dead: false };
      if (n > 400) return null;
    }
  }

  /* ------------------------------------------------------------ planner */
  // BFS over (x, y, blockPhase). Finds the shortest action list to a move
  // that satisfies goal(move) (e.g. passes a remaining dot, or reaches exit).
  // Actions: 0..3 dash direction, 4 = wait one block step.
  // opts: { snaps, avoid(x,y) -> bool (discouraged rest cells) }
  function plan(G, sx, sy, goal, opts) {
    opts = opts || {};
    var BS = opts.snaps || { snaps: [null], next: [0] };
    var P = BS.snaps.length;
    var visited = {}, queue = [], head = 0;
    function sk(x, y, k) { return key(x, y) * 512 + k; }
    visited[sk(sx, sy, 0)] = 1;
    queue.push({ x: sx, y: sy, k: 0, parent: null, act: -1 });
    var maxNodes = opts.maxNodes || 60000;
    while (head < queue.length && head < maxNodes) {
      var s = queue[head++];
      for (var d = 0; d < 4; d++) {
        var m = dash(G, s.x, s.y, d, BS.snaps[s.k]);
        if (!m || m.dead) continue;
        if (goal(m)) {
          var acts = [d], p = s;
          while (p.parent) { acts.unshift(p.act); p = p.parent; }
          return { actions: acts, end: m };
        }
        if (m.exit) continue;
        if (opts.avoid && opts.avoid(m.x, m.y)) continue;
        var kk = sk(m.x, m.y, s.k);
        if (!visited[kk]) { visited[kk] = 1; queue.push({ x: m.x, y: m.y, k: s.k, parent: s, act: d }); }
      }
      if (P > 1) {
        var nk = BS.next[s.k];
        if (nk !== s.k && !BS.snaps[nk][key(s.x, s.y)]) {
          var wk = sk(s.x, s.y, nk);
          if (!visited[wk]) { visited[wk] = 1; queue.push({ x: s.x, y: s.y, k: nk, parent: s, act: 4 }); }
        }
      }
    }
    return null;
  }

  // Static reachability from (x,y): which cells can still be passed over and
  // whether the exit can be reached. Blocks are ignored (optimistic).
  function reach(G, x, y) {
    var rest = {}, passed = {}, q = [x, y], h = 0, exit = false;
    rest[key(x, y)] = 1;
    while (h < q.length) {
      var cx = q[h++], cy = q[h++];
      for (var d = 0; d < 4; d++) {
        var m = dash(G, cx, cy, d, null);
        if (!m || m.dead) continue;
        for (var i = 0; i < m.cells.length; i++) passed[m.cells[i]] = 1;
        if (m.exit) { exit = true; continue; }
        var k = key(m.x, m.y);
        if (!rest[k]) { rest[k] = 1; q.push(m.x, m.y); }
      }
    }
    return { passed: passed, rest: rest, exit: exit };
  }

  // Goal for "collect remaining items without stranding any": the move must
  // pass a remaining item and afterwards every other remaining item (and the
  // exit) must still be reachable. Falls back to plain nearest if impossible.
  function itemGoal(G, remaining, strict) {
    return function (m) {
      var hit = false, i;
      for (i = 0; i < m.cells.length; i++) if (remaining[m.cells[i]]) { hit = true; break; }
      if (!hit || m.exit) return false;
      if (!strict) return true;
      var R = reach(G, m.x, m.y);
      if (!R.exit) return false;
      var got = {};
      for (i = 0; i < m.cells.length; i++) got[m.cells[i]] = 1;
      for (var k in remaining) if (!got[k] && !R.passed[k]) return false;
      return true;
    };
  }

  // Static grid accessor for a parsed level (items tracked separately).
  function levelGrid(L) {
    var pk = {};
    L.puffers.forEach(function (p) { pk[key(p.x, p.y)] = 1; });
    return {
      w: L.w, h: L.h,
      tile: function (x, y) { if (x < 0 || y < 0 || x >= L.w || y >= L.h) return T.WALL; return L.tiles[y * L.w + x]; },
      puffer: function (x, y) { return !!pk[key(x, y)]; }
    };
  }

  // Whole-level check (static, hazards assumed avoidable by timing).
  // Greedily collects every reachable dot then heads for the exit, like the
  // in-game autoplayer. Returns a report.
  function verifyLevel(def) {
    var L = parseLevel(def), G = levelGrid(L);
    var remaining = {}, left = 0;
    for (var y = 0; y < L.h; y++) for (var x = 0; x < L.w; x++) {
      var it = L.items[y * L.w + x];
      if (it === I.DOT || it === I.COIN) { remaining[key(x, y)] = it; left++; }
    }
    var blocks = L.blocks.map(function (b) { return { x: b.x, y: b.y, dx: b.dx, dy: b.dy }; });
    var px = L.start.x, py = L.start.y, moves = 0, waits = 0, dist = 0, done = false, guard = 0;
    while (!done && guard++ < 400) {
      var BS = blockSnapshots(G, blocks, function (x, y) { return x === px && y === py; });
      var r = null;
      if (left > 0) {
        r = plan(G, px, py, itemGoal(G, remaining, true), { snaps: BS });
        if (!r) r = plan(G, px, py, itemGoal(G, remaining, false), { snaps: BS });
      }
      if (!r) {
        r = plan(G, px, py, function (m) { return m.exit; }, { snaps: BS });
        if (!r) break;
      }
      // execute the whole plan
      for (var a = 0; a < r.actions.length; a++) {
        var act = r.actions[a];
        if (act === 4) { stepBlocks(G, blocks, function (x, y) { return x === px && y === py; }); waits++; continue; }
        var snap = {};
        blocks.forEach(function (b) { snap[key(b.x, b.y)] = 1; });
        var m = dash(G, px, py, act, snap);
        if (!m || m.dead) { guard = 9999; break; }
        moves++; dist += m.cells.length;
        m.cells.forEach(function (c) { if (remaining[c]) { delete remaining[c]; left--; } });
        px = m.x; py = m.y;
        if (m.exit) { done = true; break; }
      }
    }
    var miss = [];
    Object.keys(remaining).forEach(function (k) { k = +k; miss.push({ x: k % 64, y: Math.floor(k / 64) - 8192, item: remaining[k] }); });
    return { ok: done, allItems: done && left === 0, moves: moves, waits: waits, dist: dist, missing: miss, dots: L.dots, coins: L.coins, L: L };
  }

  var MDCore = {
    T: T, I: I, DIRS: DIRS, TIMING: TIMING, key: key, isSolid: isSolid,
    parseLevel: parseLevel, batPos: batPos, batXY: batXY, trapState: trapState, trapPhase: trapPhase,
    puffState: puffState, puffPhase: puffPhase, stepBlocks: stepBlocks, blockSnapshots: blockSnapshots,
    dash: dash, plan: plan, reach: reach, itemGoal: itemGoal, levelGrid: levelGrid, verifyLevel: verifyLevel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MDCore;
  else root.MDCore = MDCore;
})(typeof window !== 'undefined' ? window : this);
