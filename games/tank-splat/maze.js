/* Paint Tanks — maze generation, wall rectangles, collision and ray tracing.
   Exposes window.TS_MAZE. Pure logic, no drawing. */
(function () {
  'use strict';

  var T = 10; // wall thickness (logical px)

  // Build a random maze: a perfect maze (depth-first) with some walls knocked
  // out so there are loops to circle around.
  function generate(cols, rows, cs, ox, oy, loopFrac) {
    var h = [], v = [], r, c;
    for (r = 0; r <= rows; r++) { h.push([]); for (c = 0; c < cols; c++) h[r].push(1); }
    for (r = 0; r < rows; r++) { v.push([]); for (c = 0; c <= cols; c++) v[r].push(1); }
    var seen = new Uint8Array(cols * rows);
    var stack = [Math.floor(Math.random() * cols * rows)];
    seen[stack[0]] = 1;
    var dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var cx = cur % cols, cy = (cur / cols) | 0;
      var opts = [];
      for (var d = 0; d < 4; d++) {
        var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!seen[ny * cols + nx]) opts.push(d);
      }
      if (!opts.length) { stack.pop(); continue; }
      var dd = opts[Math.floor(Math.random() * opts.length)];
      var tx = cx + dirs[dd][0], ty = cy + dirs[dd][1];
      openWall(h, v, cx, cy, dd);
      seen[ty * cols + tx] = 1;
      stack.push(ty * cols + tx);
    }
    // Knock out extra internal walls for loops.
    var internal = [];
    for (r = 1; r < rows; r++) for (c = 0; c < cols; c++) if (h[r][c]) internal.push([0, r, c]);
    for (r = 0; r < rows; r++) for (c = 1; c < cols; c++) if (v[r][c]) internal.push([1, r, c]);
    shuffle(internal);
    var n = Math.round(internal.length * loopFrac);
    for (var i = 0; i < n; i++) {
      var w = internal[i];
      if (w[0] === 0) h[w[1]][w[2]] = 0; else v[w[1]][w[2]] = 0;
    }
    var m = { cols: cols, rows: rows, cs: cs, ox: ox, oy: oy, h: h, v: v, T: T, rects: [] };
    buildRects(m);
    return m;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function openWall(h, v, cx, cy, d) {
    if (d === 0) v[cy][cx + 1] = 0;
    else if (d === 1) h[cy + 1][cx] = 0;
    else if (d === 2) v[cy][cx] = 0;
    else h[cy][cx] = 0;
  }

  // Merge runs of wall segments into as few rectangles as possible.
  function buildRects(m) {
    var rects = [], r, c, c0, h2 = T / 2, cs = m.cs;
    for (r = 0; r <= m.rows; r++) {
      c = 0;
      while (c < m.cols) {
        if (!m.h[r][c]) { c++; continue; }
        c0 = c; while (c < m.cols && m.h[r][c]) c++;
        rects.push({ x1: m.ox + c0 * cs - h2, x2: m.ox + c * cs + h2, y1: m.oy + r * cs - h2, y2: m.oy + r * cs + h2 });
      }
    }
    for (c = 0; c <= m.cols; c++) {
      r = 0;
      while (r < m.rows) {
        if (!m.v[r][c]) { r++; continue; }
        var r0 = r; while (r < m.rows && m.v[r][c]) r++;
        rects.push({ x1: m.ox + c * cs - h2, x2: m.ox + c * cs + h2, y1: m.oy + r0 * cs - h2, y2: m.oy + r * cs + h2 });
      }
    }
    m.rects = rects;
  }

  // Can you walk from cell (cx, cy) in direction d (0 right, 1 down, 2 left, 3 up)?
  function canPass(m, cx, cy, d) {
    if (d === 0) return cx < m.cols - 1 && !m.v[cy][cx + 1];
    if (d === 1) return cy < m.rows - 1 && !m.h[cy + 1][cx];
    if (d === 2) return cx > 0 && !m.v[cy][cx];
    return cy > 0 && !m.h[cy][cx];
  }
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

  function cellOf(m, x, y) {
    var cx = Math.floor((x - m.ox) / m.cs), cy = Math.floor((y - m.oy) / m.cs);
    if (cx < 0) cx = 0; if (cy < 0) cy = 0;
    if (cx >= m.cols) cx = m.cols - 1; if (cy >= m.rows) cy = m.rows - 1;
    return cy * m.cols + cx;
  }
  function cellCenter(m, idx) {
    return { x: m.ox + (idx % m.cols + 0.5) * m.cs, y: m.oy + (((idx / m.cols) | 0) + 0.5) * m.cs };
  }

  // Breadth-first search from one cell. Returns { dist: Int16Array, prev: Int16Array }.
  function bfs(m, from) {
    var N = m.cols * m.rows;
    var dist = new Int16Array(N).fill(-1), prev = new Int16Array(N).fill(-1);
    var q = new Int16Array(N), qh = 0, qt = 0;
    dist[from] = 0; q[qt++] = from;
    while (qh < qt) {
      var cur = q[qh++], cx = cur % m.cols, cy = (cur / m.cols) | 0;
      for (var d = 0; d < 4; d++) {
        if (!canPass(m, cx, cy, d)) continue;
        var nb = (cy + DY[d]) * m.cols + cx + DX[d];
        if (dist[nb] >= 0) continue;
        dist[nb] = dist[cur] + 1; prev[nb] = cur; q[qt++] = nb;
      }
    }
    return { dist: dist, prev: prev };
  }
  // First step on the shortest path from the BFS source to target.
  function firstStep(res, from, target) {
    if (target === from || res.dist[target] < 0) return from;
    var c = target;
    while (res.prev[c] !== from && res.prev[c] >= 0) c = res.prev[c];
    return c;
  }

  // Push a circle out of all walls. Returns the summed contact normal
  // (nx, ny) and hit flag in the reusable `out` object.
  var OUT = { x: 0, y: 0, nx: 0, ny: 0, hit: false };
  function collideCircle(m, x, y, r) {
    var rects = m.rects, nx = 0, ny = 0, hit = false;
    for (var i = 0; i < rects.length; i++) {
      var R = rects[i];
      if (x + r <= R.x1 || x - r >= R.x2 || y + r <= R.y1 || y - r >= R.y2) continue;
      var px = x < R.x1 ? R.x1 : x > R.x2 ? R.x2 : x;
      var py = y < R.y1 ? R.y1 : y > R.y2 ? R.y2 : y;
      var dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      var d, ux, uy, pen;
      if (d2 > 1e-6) {
        d = Math.sqrt(d2); ux = dx / d; uy = dy / d; pen = r - d;
      } else {
        // centre inside the rectangle: push out along the shallowest side
        var l = x - R.x1, rr = R.x2 - x, t = y - R.y1, b = R.y2 - y;
        var mn = Math.min(l, rr, t, b);
        if (mn === l) { ux = -1; uy = 0; } else if (mn === rr) { ux = 1; uy = 0; } else if (mn === t) { ux = 0; uy = -1; } else { ux = 0; uy = 1; }
        pen = mn + r;
      }
      x += ux * pen; y += uy * pen; nx += ux; ny += uy; hit = true;
    }
    OUT.x = x; OUT.y = y; OUT.nx = nx; OUT.ny = ny; OUT.hit = hit;
    return OUT;
  }

  function pointInWall(m, x, y, r) {
    var rects = m.rects;
    for (var i = 0; i < rects.length; i++) {
      var R = rects[i];
      if (x > R.x1 - r && x < R.x2 + r && y > R.y1 - r && y < R.y2 + r) return true;
    }
    return false;
  }

  // Ray vs walls expanded by radius r. Returns nearest hit {t, nx, ny} or null.
  var RAY = { t: 0, nx: 0, ny: 0 };
  function raycast(m, x, y, dx, dy, r, tmax) {
    var rects = m.rects, best = tmax, bnx = 0, bny = 0, found = false;
    var inx = dx !== 0 ? 1 / dx : 1e9, iny = dy !== 0 ? 1 / dy : 1e9;
    for (var i = 0; i < rects.length; i++) {
      var R = rects[i];
      var x1 = R.x1 - r, x2 = R.x2 + r, y1 = R.y1 - r, y2 = R.y2 + r;
      var tx1 = (x1 - x) * inx, tx2 = (x2 - x) * inx;
      var ty1 = (y1 - y) * iny, ty2 = (y2 - y) * iny;
      var txn = Math.min(tx1, tx2), txf = Math.max(tx1, tx2);
      var tyn = Math.min(ty1, ty2), tyf = Math.max(ty1, ty2);
      var tn = Math.max(txn, tyn), tf = Math.min(txf, tyf);
      if (tf < tn || tf <= 0.001 || tn >= best) continue;
      if (tn < 0.001) continue; // starting inside: ignore (ball will be pushed out by physics)
      best = tn; found = true;
      if (txn > tyn) { bnx = dx > 0 ? -1 : 1; bny = 0; } else { bnx = 0; bny = dy > 0 ? -1 : 1; }
    }
    if (!found) return null;
    RAY.t = best; RAY.nx = bnx; RAY.ny = bny;
    return RAY;
  }

  // Follow a paint ball path with bounces. Returns the first tank it would hit
  // (or null). If `pts` is an array it is filled with the path points.
  // opts: { r, bounces, len, tanks, self, selfSkip, hitR }
  function trace(m, x, y, ang, o, pts) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var left = o.len, travelled = 0, bounces = 0, hitR = (o.hitR || 17) + o.r;
    if (pts) { pts.length = 0; pts.push(x, y); }
    while (left > 0) {
      var ray = raycast(m, x, y, dx, dy, o.r, left);
      var segLen = ray ? ray.t : left;
      var nx = ray ? ray.nx : 0, ny = ray ? ray.ny : 0;
      // tank hits along the segment
      if (o.tanks) {
        var bestT = segLen, who = null;
        for (var i = 0; i < o.tanks.length; i++) {
          var tk = o.tanks[i];
          if (!tk.alive) continue;
          if (tk === o.self && travelled < (o.selfSkip || 30) && bounces === 0) continue;
          var ex = tk.x - x, ey = tk.y - y;
          var proj = ex * dx + ey * dy;
          if (proj < 0 || proj > bestT + hitR) continue;
          var perp2 = ex * ex + ey * ey - proj * proj;
          if (perp2 > hitR * hitR) continue;
          var tHit = proj - Math.sqrt(hitR * hitR - perp2);
          if (tHit < 0) tHit = 0;
          if (tk === o.self && bounces === 0 && travelled + tHit < (o.selfSkip || 30)) continue;
          if (tHit < bestT) { bestT = tHit; who = tk; }
        }
        if (who) {
          if (pts) pts.push(x + dx * bestT, y + dy * bestT);
          return who;
        }
      }
      x += dx * segLen; y += dy * segLen; left -= segLen; travelled += segLen;
      if (pts) pts.push(x, y);
      if (!ray) break;
      bounces++;
      if (bounces > o.bounces) break;
      var dot = dx * nx + dy * ny;
      dx -= 2 * dot * nx; dy -= 2 * dot * ny;
      x += nx * 0.01; y += ny * 0.01;
    }
    return null;
  }

  window.TS_MAZE = {
    T: T, generate: generate, canPass: canPass, DX: DX, DY: DY,
    cellOf: cellOf, cellCenter: cellCenter, bfs: bfs, firstStep: firstStep,
    collideCircle: collideCircle, pointInWall: pointInWall, raycast: raycast, trace: trace
  };
})();
