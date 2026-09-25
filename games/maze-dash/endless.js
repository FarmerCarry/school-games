/*
 * Maze Dash — endless "Rising Goo" maze generator.
 * window.MDEndless.create(world) -> gen { fill(untilY), height(y) }
 *
 * The maze is built from "hops": from a rest cell (ax, ay) a shaft goes
 * straight up L cells and stops under a wall, then a corridor runs sideways
 * to a new column nx and stops against a wall. Because every shaft and row is
 * carved only once and never crosses older ones, every hop is guaranteed to
 * be dashable (up and back down), so the endless maze is always climbable.
 * The walls that act as stoppers are "locked" so they never become spikes.
 *
 * world needs: ensureRow(y) -> row {t: Uint8Array(13), it: Uint8Array(13), lock: Uint8Array(13)},
 *              addBat(b), addTrap(tr), addPuffer(p).
 */
(function () {
  'use strict';
  var C = window.MDCore, T = C.T, I = C.I;
  var W = 13;

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function chance(p) { return Math.random() < p; }

  function create(world) {
    var gen = { ax: 6, ay: 0, topY: -1, hops: 0, nextPow: ri(6, 9), startY: 0 };
    // Starting cell (a single rest spot with walls around it).
    for (var y = -1; y <= 10; y++) world.ensureRow(y);
    var r0 = world.ensureRow(0);
    r0.t[6] = T.EMPTY;
    r0.lock[6] = 1;
    world.ensureRow(1).lock[6] = 1;

    function diff(y) { return Math.max(0, Math.min(1, (gen.startY - y) / 320)); }

    function carve(x, y, item) {
      var r = world.ensureRow(y);
      r.t[x] = T.EMPTY;
      if (item != null) r.it[x] = item;
    }
    function isOpen(x, y) {
      if (x < 0 || x >= W) return false;
      var r = world.ensureRow(y);
      return r.t[x] !== T.WALL && r.t[x] !== T.SPIKE;
    }
    // lock levels: 1 = keep as a plain wall, 3 = stopper the climb depends on
    // (never turned into spikes or anything else, not even by later hops)
    function lock(x, y, v) { if (x >= 0 && x < W) { var r = world.ensureRow(y); r.lock[x] = Math.max(r.lock[x], v || 1); } }
    // Carve a dead-end side pocket (for a bat) only if it touches nothing but
    // the path cell it hangs off: every cell must be a plain unlocked wall and
    // every other neighbour must stay wall, so no route or stopper changes.
    function pocket(cells, attach) {
      var i, k, inSet = function (x, y) {
        if (x === attach[0] && y === attach[1]) return true;
        for (var j = 0; j < cells.length; j++) if (cells[j][0] === x && cells[j][1] === y) return true;
        return false;
      };
      for (i = 0; i < cells.length; i++) {
        var cx = cells[i][0], cy = cells[i][1];
        if (cx < 1 || cx > W - 2) return false;
        var r = world.ensureRow(cy);
        if (r.t[cx] !== T.WALL || r.lock[cx] || r.it[cx]) return false;
        for (k = 0; k < 4; k++) {
          var nx2 = cx + C.DIRS[k].dx, ny2 = cy + C.DIRS[k].dy;
          if (!inSet(nx2, ny2) && isOpen(nx2, ny2)) return false;
        }
      }
      for (i = 0; i < cells.length; i++) { world.ensureRow(cells[i][1]).t[cells[i][0]] = T.EMPTY; lock(cells[i][0], cells[i][1]); }
      return true;
    }

    function hop() {
      var ax = gen.ax, ay = gen.ay, h = gen.startY - ay, d = diff(ay);
      var L = ri(2, d > 0.45 ? 5 : 4);
      if (gen.hops === 0) L = 3;
      var ny = ay - L, y, x;
      for (y = ay + 1; y >= ny - 2; y--) world.ensureRow(y);
      // shaft
      var shaft = [];
      for (y = ay - 1; y >= ny; y--) { carve(ax, y, I.DOT); shaft.push([ax, y]); }
      // corridor target column
      var nx, tries = 0;
      do {
        nx = ri(1, W - 2);
        if (chance(0.35)) nx = ax < 6 ? ri(8, 11) : ri(1, 4); // favour long runs
        tries++;
      } while ((Math.abs(nx - ax) < 2) && tries < 20);
      if (Math.abs(nx - ax) < 2) nx = ax < 6 ? ax + 3 : ax - 3;
      var s = nx > ax ? 1 : -1, row = [];
      for (x = ax; x !== nx + s; x += s) { carve(x, ny, I.DOT); row.push([x, ny]); }
      // stopper walls
      lock(ax, ny - 1, 3); lock(nx + s, ny, 3); lock(ax - s, ny); lock(nx, ny + 1);

      var rowLen = row.length, interior = row.slice(1, -1);

      // ---- decorations ----
      // coins
      if (chance(0.4)) { var c = row[ri(1, rowLen - 1)]; world.ensureRow(c[1]).it[c[0]] = I.COIN; }
      if (h > 20 && chance(0.08)) row.forEach(function (q, i) { if (i > 0) world.ensureRow(q[1]).it[q[0]] = I.COIN; });
      // power-up
      gen.nextPow--;
      if (gen.nextPow <= 0 && interior.length) {
        var pq = interior[ri(0, interior.length - 1)];
        world.ensureRow(pq[1]).it[pq[0]] = [I.SHIELD, I.MAGNET, I.FREEZE, I.DOUBLE][ri(0, 3)];
        gen.nextPow = ri(9, 15);
      }
      // traps on the corridor / shaft interior
      if (h > 14 && interior.length && chance(0.22 + 0.45 * d)) {
        var tq = interior[ri(0, interior.length - 1)];
        var tr = world.ensureRow(tq[1]);
        if (tr.it[tq[0]] === I.DOT || tr.it[tq[0]] === I.NONE) {
          tr.t[tq[0]] = T.TRAP; tr.it[tq[0]] = I.NONE;
          world.addTrap({ x: tq[0], y: tq[1], off: Math.random() * C.TIMING.TRAP_CYCLE });
        }
      }
      if (h > 60 && shaft.length >= 4 && chance(0.25 * d)) {
        var sq = shaft[ri(1, shaft.length - 2)], sr = world.ensureRow(sq[1]);
        if (sr.it[sq[0]] === I.DOT) {
          sr.t[sq[0]] = T.TRAP; sr.it[sq[0]] = I.NONE;
          world.addTrap({ x: sq[0], y: sq[1], off: Math.random() * C.TIMING.TRAP_CYCLE });
        }
      }
      // Bats fly ACROSS the path from a little side pocket (never along it),
      // so there is always a gap to dash through.
      var batSp = 1.9 + 1.4 * d, batDone = false;
      if (h > 28 && interior.length >= 3 && chance(0.25 + 0.4 * d)) {
        var bq = interior[ri(1, interior.length - 2)], bx = bq[0];
        if (pocket([[bx, ny + 1], [bx, ny + 2]], [bx, ny])) {
          world.addBat({ x: bx, y: ny + 1, axis: 1, min: ny, max: ny + 2, speed: batSp, off: Math.random() * 8 });
          batDone = true;
        }
      }
      if (!batDone && h > 70 && shaft.length >= 4 && chance(0.3 * d)) {
        var rq = shaft[ri(1, shaft.length - 2)], s2 = chance(0.5) ? 1 : -1, ry = rq[1];
        if (pocket([[ax + s2, ry], [ax + 2 * s2, ry]], [ax, ry])) {
          world.addBat({ x: ax + s2, y: ry, axis: 0, min: Math.min(ax, ax + 2 * s2), max: Math.max(ax, ax + 2 * s2), speed: batSp * 0.9, off: Math.random() * 8 });
        }
      }
      // puffer in a wall beside the corridor interior
      if (h > 90 && interior.length >= 3 && chance(0.3 * d)) {
        var pk = interior[ri(1, interior.length - 2)], py = chance(0.5) ? ny - 1 : ny + 1, px = pk[0];
        var pr = world.ensureRow(py);
        if (pr.t[px] === T.WALL && !pr.lock[px] && px > 0 && px < W - 1) {
          var free = 0;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) { if (isOpen(px + dd[0], py + dd[1])) free++; });
          if (free === 1) { pr.t[px] = T.EMPTY; world.addPuffer({ x: px, y: py, off: Math.random() * 2 }); }
        }
      }
      // spike walls along the path (stoppers are locked and stay safe)
      var pS = 0.05 + 0.24 * d;
      var cells = shaft.concat(row);
      for (var i = 0; i < cells.length; i++) {
        for (var k = 0; k < 4; k++) {
          var D = C.DIRS[k], wx = cells[i][0] + D.dx, wy = cells[i][1] + D.dy;
          if (wx <= 0 || wx >= W - 1) continue;
          var wr = world.ensureRow(wy);
          if (wr.t[wx] === T.WALL && !wr.lock[wx] && chance(pS)) wr.t[wx] = T.SPIKE;
        }
      }
      // "don't press down here!" spikes under the corridor end (later on)
      if (h > 120 && chance(0.25 * d)) {
        var er = world.ensureRow(ny + 1);
        if (er.t[nx] === T.WALL && er.lock[nx] < 3) { er.t[nx] = T.SPIKE; er.lock[nx] = 2; }
      }

      gen.ax = nx; gen.ay = ny; gen.topY = ny - 1; gen.hops++;
    }

    gen.fill = function (untilY) { var n = 0; while (gen.topY > untilY && n++ < 200) hop(); };
    gen.height = function (y) { return Math.max(0, gen.startY - y); };
    return gen;
  }

  window.MDEndless = { create: create };
})();
