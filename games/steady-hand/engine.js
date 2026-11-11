/* Steady Hand (سلك الشرارة) engine: builds a level's wire track from levels.js, moves
 * the spark along the pointer's own path with a swept collision check, and keeps the
 * checkpoints, coins, doors, moving parts, stars and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random, so
 * tools/tests/steady-hand-engine.test.mjs loads it with { window: {} } and plays every
 * level with a bot. game.js reads Kit.dda at every level start and passes the
 * difficulty in as plain numbers (SH.build's P). */
(function () {
  'use strict';
  var SH = window.SH = window.SH || {};
  var W = 1280, H = 720, TAU = Math.PI * 2;
  SH.W = W; SH.H = H;
  SH.RS = 6;          // the spark touches an edge with this radius (its picture is twice as big)
  SH.GRAB = 46;       // a press this close to the spark picks it up
  SH.HOVER = 34;      // without the button, the pointer this close picks it up
  SH.STEP = 8;        // the centre line is sampled every 8 px
  SH.SWEEP = 3;       // every move is checked every 3 px along its way
  SH.MAX_MOVE = 72;   // the most the spark travels in one 1/60 s step
  SH.STUN = 0.6;      // after a touch the spark flies home and cannot be picked up
  SH.GOAL = 14;       // the lamp lights this close to the end of the track
  SH.COIN_R = 18;     // a coin is collected this close
  SH.BAR = 12;        // thickness of sliding and turning bars
  SH.DOOR = 14;       // thickness of a door
  SH.QUEUE = 64;      // pointer points kept waiting at most
  // The difficulty's two ends (Kit.dda level 0 and 1): track width factor, speed of the
  // moving parts, distance between checkpoints and how long a door stays open.
  SH.EASY = { width: 1.3, speed: 0.5, spacing: 220, open: 5 };
  SH.HARD = { width: 0.78, speed: 1.2, spacing: 560, open: 2.6 };
  SH.params = function (k) {
    k = clamp(+k || 0, 0, 1);
    var o = {};
    for (var key in SH.EASY) o[key] = SH.EASY[key] + (SH.HARD[key] - SH.EASY[key]) * k;
    return o;
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function frac(v) { return v - Math.floor(v); }
  function smooth(e0, e1, v) { var t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  // Squared distance from (x, y) to the segment (ax, ay)-(bx, by).
  function segD2(x, y, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy, u = ll ? ((x - ax) * dx + (y - ay) * dy) / ll : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    var px = ax + dx * u - x, py = ay + dy * u - y;
    return px * px + py * py;
  }
  SH.segD2 = segD2;

  /* ------------------------------------------------------------ the track */
  // Centre line through the control points: Catmull-Rom curves, or straight lines.
  function dense(R) {
    var ps = R.p, n = ps.length, out = [];
    for (var i = 0; i < n - 1; i++) {
      var p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[i + 1], p3 = ps[Math.min(n - 1, i + 2)];
      var f1 = p1[2] || 1, f2 = p2[2] || 1;
      var k = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4));
      for (var j = 0; j < k; j++) {
        var t = j / k, t2 = t * t, t3 = t2 * t, x, y;
        if (R.line) { x = p1[0] + (p2[0] - p1[0]) * t; y = p1[1] + (p2[1] - p1[1]) * t; }
        else {
          x = 0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3);
          y = 0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3);
        }
        out.push([x, y, f1 + (f2 - f1) * t]);
      }
    }
    var last = ps[n - 1];
    out.push([last[0], last[1], last[2] || 1]);
    return out;
  }
  // Points every SH.STEP px along the line (the last one at its very end).
  function resample(d) {
    var step = SH.STEP, pts = [{ x: d[0][0], y: d[0][1], f: d[0][2], s: 0 }];
    var px = d[0][0], py = d[0][1], pf = d[0][2], s = 0, need = step;
    for (var i = 1; i < d.length; i++) {
      var qx = d[i][0], qy = d[i][1], qf = d[i][2], l = Math.hypot(qx - px, qy - py);
      while (l >= need) {
        var t = need / l;
        px += (qx - px) * t; py += (qy - py) * t; pf += (qf - pf) * t;
        s += need; l -= need; need = step;
        pts.push({ x: px, y: py, f: pf, s: s });
      }
      need -= l; s += l; px = qx; py = qy; pf = qf;
    }
    if (step - need > 1) pts.push({ x: px, y: py, f: pf, s: s });
    else { var e = pts[pts.length - 1]; e.x = px; e.y = py; }
    return pts;
  }
  // Where the centre line is at arc length s: the point, its direction, its normal
  // (the right-hand side of the way) and the half width there.
  SH.at = function (L, s) {
    var pts = L.pts, n = pts.length;
    s = clamp(s, 0, L.len);
    var i = Math.min(n - 2, Math.floor(s / SH.STEP));
    while (i < n - 2 && pts[i + 1].s < s) i++;
    var a = pts[i], b = pts[i + 1], u = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    var tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, tx: tx / l, ty: ty / l, nx: -ty / l, ny: tx / l, hw: a.hw + (b.hw - a.hw) * u, s: s };
  };
  // The centre-line sample nearest to (x, y), for placing things authored as points.
  function project(L, x, y) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < L.pts.length; i++) { var p = L.pts[i], d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = i; } }
    var c = SH.at(L, L.pts[best].s);
    c.off = (x - c.x) * c.nx + (y - c.y) * c.ny;
    return c;
  }
  SH.project = project;

  var G = 40, COLS = Math.ceil(W / G), ROWS = Math.ceil(H / G);
  // Each grid cell lists the segments near it, so a point is checked against a few.
  function buildGrid(L) {
    var cells = [], k;
    for (k = 0; k < COLS * ROWS; k++) cells.push([]);
    L.segs.forEach(function (sg, j) {
      var r = sg.hw + 44;
      var c0 = Math.max(0, Math.floor((Math.min(sg.ax, sg.bx) - r) / G)), c1 = Math.min(COLS - 1, Math.floor((Math.max(sg.ax, sg.bx) + r) / G));
      var r0 = Math.max(0, Math.floor((Math.min(sg.ay, sg.by) - r) / G)), r1 = Math.min(ROWS - 1, Math.floor((Math.max(sg.ay, sg.by) + r) / G));
      for (var row = r0; row <= r1; row++) for (var col = c0; col <= c1; col++) cells[row * COLS + col].push(j);
    });
    L.grid = cells;
  }
  // How far inside the track the spark's edge is at (x, y) at time t (negative: it touches
  // an edge). Leaves the segment it is on in L.qi and how far along it in L.qu.
  function inside(L, x, y, t) {
    L.qi = -1;
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return -999;
    var list = L.grid[Math.floor(y / G) * COLS + Math.floor(x / G)], best = -999;
    for (var k = 0; k < list.length; k++) {
      var sg = L.segs[list[k]], dx = sg.bx - sg.ax, dy = sg.by - sg.ay;
      var u = ((x - sg.ax) * dx + (y - sg.ay) * dy) / sg.ll;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      var px = sg.ax + dx * u - x, py = sg.ay + dy * u - y;
      var hw = sg.p < 0 ? sg.hw : sg.hw * (1 - sg.amp * pulseAt(L.pulses[sg.p], t));
      var m = hw - SH.RS - Math.sqrt(px * px + py * py);
      if (m > best) { best = m; L.qi = list[k]; L.qu = u; }
    }
    return best;
  }
  SH.inside = inside;
  // Arc length of the point last checked by inside().
  function arcOf(L) { var sg = L.segs[L.qi]; return sg.s + sg.l * L.qu; }
  function pulseAt(pu, t) { return 0.5 - 0.5 * Math.cos(TAU * (t * pu.f + pu.ph)); }
  SH.pulseAt = pulseAt;

  /* --------------------------------------------------------- moving parts */
  // How open a sliding gate is (1 open, 0 shut) at time t.
  function slideOpen(o, t) {
    var u = frac(t * o.f + o.ph), a = o.open;
    if (u < a) return 1;
    if (u < a + 0.1) return 1 - smooth(a, a + 0.1, u);
    if (u < 0.9) return 0;
    return smooth(0.9, 1, u);
  }
  SH.slideOpen = slideOpen;
  // The bar of a sliding gate: its two ends at time t.
  SH.slideBar = function (o, t) {
    var off = o.side * slideOpen(o, t) * o.travel, cx = o.x + o.nx * off, cy = o.y + o.ny * off;
    return [cx - o.nx * o.half, cy - o.ny * o.half, cx + o.nx * o.half, cy + o.ny * o.half];
  };
  SH.spinAngle = function (o, t, arm) { return o.a0 + o.w * t + arm * TAU / o.arms; };
  // Does one moving part touch a spark at (x, y) at time t?
  function hitsOne(o, x, y, t) {
    var dx = x - o.cx, dy = y - o.cy, r = o.th / 2 + SH.RS;
    if (dx * dx + dy * dy > o.r2) return false;
    if (o.k === 'slide') {
      var b = SH.slideBar(o, t);
      return segD2(x, y, b[0], b[1], b[2], b[3]) < r * r;
    }
    for (var a = 0; a < o.arms; a++) {
      var ang = SH.spinAngle(o, t, a);
      if (segD2(x, y, o.px, o.py, o.px + Math.cos(ang) * o.len, o.py + Math.sin(ang) * o.len) < r * r) return true;
    }
    return false;
  }
  SH.hitsOne = hitsOne;
  // The first moving part that touches a spark at (x, y) at time t, or -1.
  SH.moving = function (L, x, y, t) {
    for (var k = 0; k < L.obs.length; k++) if (hitsOne(L.obs[k], x, y, t)) return k;
    return -1;
  };
  // The arc-length stretch of centre line one moving part can reach.
  function reach(L, o) {
    var period = o.k === 'slide' ? 1 / o.f : TAU / (Math.abs(o.w) * o.arms), lo = Infinity, hi = -Infinity, hits = 0;
    for (var i = 0; i < L.pts.length; i++) {
      var p = L.pts[i];
      for (var j = 0; j < 72; j++) {
        if (hitsOne(o, p.x, p.y, j * period / 72)) { lo = Math.min(lo, p.s); hi = Math.max(hi, p.s); hits++; break; }
      }
    }
    // A part that reaches two separate stretches of the track is a level bug (the test checks).
    o.split = hits > 0 && Math.round((hi - lo) / SH.STEP) + 1 > hits + 1;
    return hits ? [lo - 6, hi + 6] : [o.s - 20, o.s + 20];
  }

  /* --------------------------------------------------------------- build */
  // A level ready to play at difficulty P (SH.params): the sampled track, its segments,
  // moving parts, doors, carry stretches, coins, checkpoints, the start and the goal.
  // raw: a track that is not one of SH.LEVELS (the title's wire).
  SH.build = function (i, P, raw) {
    var R = raw || SH.LEVELS[i];
    P = P || SH.params(0.5);
    var pts = resample(dense(R)), n = pts.length, ws = P.width, sp = P.speed;
    var L = { i: i, R: R, P: P, mode: R.mode, world: R.world, pts: pts, len: pts[n - 1].s, segs: [], pulses: [], obs: [], gates: [], carry: [], coins: [], zones: [], cps: [] };
    pts.forEach(function (p, k) {
      p.hw = R.w * 0.5 * p.f * ws;
      var a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
      p.nx = -ty / l; p.ny = tx / l;
    });
    for (var k = 0; k < n - 1; k++) {
      var a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y;
      L.segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, ll: dx * dx + dy * dy || 1e-6, l: Math.hypot(dx, dy), s: a.s, hw: Math.min(a.hw, b.hw), p: -1, amp: 0 });
    }
    var span = function (q) { var s0 = project(L, q[0], q[1]).s, s1 = project(L, q[2], q[3]).s; return s0 < s1 ? [s0, s1] : [s1, s0]; };
    // Breathing walls: they squeeze in to at most `squeeze` of the width, never so far
    // that the centre line stops being safe.
    (R.pulse || []).forEach(function (q, j) {
      var r = span(q), pu = { s0: r[0], s1: r[1], f: sp / q[5], ph: q[6] || 0 };
      L.pulses.push(pu);
      L.segs.forEach(function (sg) {
        var mid = sg.s + sg.l / 2;
        if (mid < r[0] || mid > r[1]) return;
        sg.p = j;
        sg.amp = Math.max(0, Math.min(q[4], 1 - (SH.RS + 7) / sg.hw)) * Math.min(smooth(r[0], r[0] + 40, mid), 1 - smooth(r[1] - 40, r[1], mid));
      });
    });
    buildGrid(L);
    (R.slide || []).forEach(function (q) {
      var c = project(L, q[0], q[1]), half = c.hw + 12, travel = 2 * c.hw + 26;
      var o = { k: 'slide', s: c.s, x: c.x, y: c.y, nx: c.nx, ny: c.ny, side: q[2], f: sp / q[3], open: q[4], ph: q[5] || 0, half: half, travel: travel, th: SH.BAR };
      o.cx = c.x + c.nx * q[2] * travel / 2; o.cy = c.y + c.ny * q[2] * travel / 2;
      o.r2 = Math.pow(travel / 2 + half + SH.BAR / 2 + SH.RS + 2, 2);
      L.obs.push(o);
    });
    (R.spin || []).forEach(function (q) {
      var c = project(L, q[0], q[1]), off = c.hw + 16;
      // A positive speed sweeps the bar across the track the way the spark goes (the
      // spark can follow it through), a negative one sweeps it towards the spark.
      var o = { k: 'spin', s: c.s, x: c.x, y: c.y, px: c.x + c.nx * q[2] * off, py: c.y + c.ny * q[2] * off, side: q[2], arms: q[3], w: q[4] * sp * q[2], a0: q[5] || 0, len: 2 * c.hw + 30, th: SH.BAR };
      o.cx = o.px; o.cy = o.py; o.r2 = Math.pow(o.len + SH.BAR / 2 + SH.RS + 2, 2);
      L.obs.push(o);
    });
    L.obs.forEach(function (o) { o.zone = reach(L, o); L.zones.push(o.zone); });
    (R.gate || []).forEach(function (q) {
      var c = project(L, q[0], q[1]);
      var g = { s: c.s, x: c.x, y: c.y, nx: c.nx, ny: c.ny, tx: c.tx, ty: c.ty, hw: c.hw, half: c.hw + 14, th: SH.DOOR };
      g.zone = [c.s - SH.DOOR / 2 - SH.RS - 10, c.s + SH.DOOR / 2 + SH.RS + 10];
      L.gates.push(g); L.zones.push(g.zone);
    });
    (R.carry || []).forEach(function (q) { L.carry.push(span(q)); });
    (R.coins || []).forEach(function (q) {
      var c = project(L, q[0], q[1]), room = c.hw - SH.RS - 3, base = c.hw / ws - SH.RS - 3;
      var share = clamp(c.off / Math.max(1, base), -0.85, 0.85);
      L.coins.push({ s: c.s, x: c.x + c.nx * share * room, y: c.y + c.ny * share * room, share: share });
    });
    // The start, the goal and the checkpoints between them (never where a moving part,
    // a door or a carry stretch is: a spark sent home there must be safe).
    L.start = SH.at(L, 22);
    L.end = SH.at(L, L.len);
    var keep = L.zones.concat(L.carry).map(function (z) { return [z[0] - 30, z[1] + 30]; });
    var cand = [];
    for (var s = L.start.s + P.spacing; s < L.len - 110; s += P.spacing) cand.push(s);
    if (P.spacing < 400) L.zones.forEach(function (z) { cand.push(z[0] - 30); });
    cand.sort(function (x, y) { return x - y; });
    cand.forEach(function (c) {
      for (var guard = 0, moved = true; moved && guard < 20; guard++) {
        moved = false;
        keep.forEach(function (z) { if (c > z[0] && c < z[1]) { c = z[0] - 1; moved = true; } });
      }
      var last = L.cps.length ? L.cps[L.cps.length - 1].s : L.start.s;
      if (c < L.start.s + 70 || c - last < 80 || c > L.len - 110) return;
      var p = SH.at(L, c);
      L.cps.push({ s: c, x: p.x, y: p.y, nx: p.nx, ny: p.ny, hw: p.hw });
    });
    // Each checkpoint's lantern stands beside the track, on a side with room for it.
    L.cps.forEach(function (cp) {
      var best = null, room = -Infinity;
      [-1, 1].forEach(function (side) {
        var x = cp.x + cp.nx * side * (cp.hw + 24), y = cp.y + cp.ny * side * (cp.hw + 24);
        var m = x > 20 && x < W - 20 && y > 100 && y < H - 16 ? -inside(L, x, y, 0) : -999;
        if (m > room) { room = m; best = { x: x, y: y, side: side }; }
      });
      cp.lx = best.x; cp.ly = best.y; cp.side = best.side;
    });
    // Seconds for the time star: the track's length at a careful pace, plus a little for
    // every moving part, door and carry stretch (the same at every difficulty).
    L.par = Math.ceil(L.len / 125 + 2.5 * L.obs.length + 2 * L.gates.length + 1.5 * L.carry.length + 2);
    return L;
  };

  /* ---------------------------------------------------------------- play */
  // A fresh try at level i. The world keeps the time (moving parts run on it), the
  // spark, the touches, the lit checkpoints, coins, doors and the events of the last step.
  SH.create = function (i, P) {
    var L = SH.build(i, P);
    return {
      L: L, t: 0, clock: 0, started: false, done: false, x: L.start.x, y: L.start.y, held: false, rest: false, ox: 0, oy: 0,
      s: L.start.s, best: L.start.s, arc: L.start.s, hitOb: -1, hitDoor: -1, cp: -1, touches: 0, stun: 0, dragged: 0, grabs: 0,
      coins: L.coins.map(function () { return false; }), got: 0,
      gates: L.gates.map(function () { return { a: 0, left: 0 }; }),
      q: [], ev: []
    };
  };
  function grab(w, x, y) {
    w.held = true; w.rest = false; w.ox = w.x - x; w.oy = w.y - y; w.q.length = 0; w.grabs++;
    if (!w.started) w.started = true;
    w.ev.push({ t: 'grab', x: w.x, y: w.y });
  }
  function drop(w, why) {
    w.held = false; w.q.length = 0;
    w.ev.push({ t: 'drop', why: why, x: w.x, y: w.y });
  }
  // Lets go of the spark where it is (a pause, a lost focus): always safe.
  SH.drop = function (w, why) { if (w.held) drop(w, why || 'out'); w.q.length = 0; };
  function home(w) { return w.cp >= 0 ? w.L.cps[w.cp] : w.L.start; }
  SH.home = home;
  function touch(w, x, y, kind, ob) {
    var h = home(w);
    w.touches++; w.held = false; w.q.length = 0; w.stun = SH.STUN;
    w.ev.push({ t: 'touch', kind: kind, ob: ob, x: w.x, y: w.y, hx: x, hy: y, to: { x: h.x, y: h.y } });
    w.x = h.x; w.y = h.y; w.s = h.s;
  }
  function inCarry(L, s) {
    for (var k = 0; k < L.carry.length; k++) if (s >= L.carry[k][0] && s <= L.carry[k][1]) return true;
    return false;
  }
  SH.inCarry = inCarry;
  // Does a closed (or closing) door stop a spark at (x, y)? Returns the door or -1.
  function doorAt(w, x, y) {
    var L = w.L, r = SH.DOOR / 2 + SH.RS;
    for (var k = 0; k < L.gates.length; k++) {
      var g = L.gates[k], a = w.gates[k].a;
      if (a >= 0.999) continue;
      var e = g.half, m = g.half * a;
      if (segD2(x, y, g.x - g.nx * e, g.y - g.ny * e, g.x - g.nx * m, g.y - g.ny * m) < r * r ||
          segD2(x, y, g.x + g.nx * m, g.y + g.ny * m, g.x + g.nx * e, g.y + g.ny * e) < r * r) return k;
    }
    return -1;
  }
  SH.doorAt = doorAt;
  // What stops the spark at (x, y): 0 nothing, 1 an edge, 2 a moving part, 3 a closed
  // door, 4 a carry stretch without the button. Leaves the track position in L.qi/L.qu.
  function check(w, x, y, down) {
    var L = w.L;
    if (inside(L, x, y, w.t) < 0) return 1;
    var arc = arcOf(L);
    if (L.obs.length && (w.hitOb = SH.moving(L, x, y, w.t)) >= 0) return 2;
    if (L.gates.length && (w.hitDoor = doorAt(w, x, y)) >= 0) return 3;
    if (!down && L.carry.length && inCarry(L, arc)) return 4;
    w.arc = arc;
    return 0;
  }
  // Moves the spark in a straight line to (tx, ty), checking every SH.SWEEP px of the
  // way: a fast flick across a wall touches the wall instead of jumping through it.
  // Returns false when it had to stop.
  function travel(w, tx, ty, down) {
    var ax = w.x, ay = w.y, dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(d / SH.SWEEP));
    for (var k = 1; k <= n; k++) {
      var x = ax + dx * k / n, y = ay + dy * k / n, r = check(w, x, y, down);
      if (r === 1 || r === 2) { touch(w, x, y, r === 1 ? 'edge' : 'part', w.hitOb); return false; }
      if (r === 3 || r === 4) {
        // Stopped by a door or a carry stretch: resting until the pointer moves off or presses.
        w.held = false; w.q.length = 0; w.rest = true;
        w.ev.push({ t: r === 3 ? 'block' : 'stuck', door: w.hitDoor, x: w.x, y: w.y });
        return false;
      }
      w.dragged += Math.hypot(x - w.x, y - w.y);
      w.x = x; w.y = y; w.s = w.arc;
      if (w.arc > w.best) w.best = w.arc;
      arrive(w);
      if (w.done) return false;
    }
    return true;
  }
  // Checkpoints, coins and the goal at the spark's new place.
  function arrive(w) {
    var L = w.L;
    while (w.cp + 1 < L.cps.length && w.best >= L.cps[w.cp + 1].s) { w.cp++; w.ev.push({ t: 'cp', i: w.cp }); }
    for (var k = 0; k < L.coins.length; k++) {
      var c = L.coins[k];
      if (!w.coins[k] && (c.x - w.x) * (c.x - w.x) + (c.y - w.y) * (c.y - w.y) <= SH.COIN_R * SH.COIN_R) {
        w.coins[k] = true; w.got++; w.ev.push({ t: 'coin', i: k, x: c.x, y: c.y });
      }
    }
    if (w.s >= L.len - SH.GOAL) {
      w.done = true; w.held = false; w.q.length = 0;
      w.ev.push({ t: 'goal', x: w.x, y: w.y });
    }
  }
  // Doors: a press opens every door; each stays open `open` seconds, and never closes
  // on the spark.
  function doors(w, dt, press) {
    var L = w.L, opened = false;
    for (var k = 0; k < L.gates.length; k++) {
      var g = L.gates[k], st = w.gates[k];
      if (press) { if (st.left <= 0 && st.a < 0.5) opened = true; st.left = L.P.open; }
      var along = (w.x - g.x) * g.tx + (w.y - g.y) * g.ty, across = (w.x - g.x) * g.nx + (w.y - g.y) * g.ny;
      var near = Math.abs(along) < SH.DOOR / 2 + SH.RS + 8 && Math.abs(across) < g.half;
      var want = st.left > 0 || (near && st.a > 0) ? 1 : 0;
      if (st.left > 0) st.left = Math.max(0, st.left - dt);
      var was = st.a;
      st.a = want ? Math.min(1, st.a + dt * 4) : Math.max(0, st.a - dt * 4);
      if (was > 0 && st.a === 0) w.ev.push({ t: 'shut', i: k });
    }
    // An opened door lets a resting spark be picked up by the pointer again.
    if (opened) { w.rest = false; w.ev.push({ t: 'open' }); }
  }
  // One 1/60 s step. inp: { pts: pointer points since the last step [[x, y], ...] (logical),
  // x, y: where the pointer is now (null when it is not over the game), down: the
  // button is held, press: {x, y} of a new press, door: a press or a key that opens the
  // doors, out: the pointer left the game or the game lost focus (drop the spark). }
  SH.step = function (w, dt, inp) {
    inp = inp || {};
    var L = w.L, down = !!inp.down;
    w.t += dt;
    if (w.stun > 0) w.stun = Math.max(0, w.stun - dt);
    if (w.done) return;
    if (w.started) w.clock += dt;
    if (L.gates.length) doors(w, dt, !!inp.door);
    if (inp.out) { if (w.held) drop(w, 'out'); w.q.length = 0; return; }
    if (w.held && L.mode === 'drag' && !down) drop(w, 'release');
    var fresh = false;
    if (!w.held && w.stun <= 0 && !w.done) {
      var pr = inp.press, near = function (p) { return p && Math.hypot(p.x - w.x, p.y - w.y); };
      var hover = down || (L.mode === 'hover' && !inCarry(L, w.s));
      if (w.rest && inp.x != null && near(inp) > SH.HOVER + 24) w.rest = false;
      if (pr && near(pr) <= SH.GRAB) { grab(w, pr.x, pr.y); fresh = true; }
      else if (hover && !w.rest && inp.x != null && near(inp) <= SH.HOVER) { grab(w, inp.x, inp.y); fresh = true; }
    }
    if (!w.held) return;
    // Points the pointer passed before the spark was picked up are not followed.
    var pts = fresh ? [] : inp.pts || [];
    for (var k = 0; k < pts.length; k++) w.q.push(pts[k]);
    if (w.q.length > SH.QUEUE) w.q.splice(0, w.q.length - SH.QUEUE);
    var budget = SH.MAX_MOVE, moved = w.q.length > 0;
    while (w.q.length && w.held && budget > 0.01) {
      var p = w.q[0], tx = p[0] + w.ox, ty = p[1] + w.oy, dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
      if (d <= budget) w.q.shift();
      else { tx = w.x + dx * budget / d; ty = w.y + dy * budget / d; d = budget; }
      budget -= d;
      if (d > 0.001 && !travel(w, tx, ty, down)) break;
    }
    // The grab offset melts away as the hand moves, but only where that is safe.
    if (w.held && moved && !w.q.length && (w.ox || w.oy)) {
      var o = Math.hypot(w.ox, w.oy), k2 = Math.max(0, o - 3) / o, nx = w.x - w.ox * (1 - k2), ny = w.y - w.oy * (1 - k2);
      if (clear(w, nx, ny, down)) { w.ox *= k2; w.oy *= k2; travel(w, nx, ny, down); if (o <= 3) { w.ox = 0; w.oy = 0; } }
    }
  };
  // Is the straight way from the spark to (x, y) free right now? (No side effects.)
  function clear(w, x, y, down) {
    var ax = w.x, ay = w.y, n = Math.max(1, Math.ceil(Math.hypot(x - ax, y - ay) / SH.SWEEP));
    for (var k = 1; k <= n; k++) if (check(w, ax + (x - ax) * k / n, ay + (y - ay) * k / n, down)) return false;
    return true;
  }
  SH.clear = clear;

  /* ---------------------------------------------------- stars and outcomes */
  // One star for lighting the lamp, one for no touch, one for beating the clock.
  SH.stars = function (L, touches, time) { return 1 + (touches ? 0 : 1) + (time <= L.par ? 1 : 0); };
  // 0..1 for Kit.dda, once per try: a lit lamp with few touches is a success; a try left
  // half way after touches counts less.
  SH.outcome = function (finished, touches) {
    var x = 1 - 0.14 * touches;
    return Math.round((finished ? clamp(x, 0.1, 1) : clamp(x * 0.5, 0, 0.45)) * 1000) / 1000;
  };

  /* ------------------------------------------------------------- the shop */
  SH.COLORS = [
    { name: 'ذهبي', body: '#ffe14d', glow: '#ffb800', price: 0 },
    { name: 'سماوي', body: '#7ff6ff', glow: '#00c8ff', price: 2 },
    { name: 'وردي', body: '#ff9ad8', glow: '#ff3fa8', price: 3 },
    { name: 'أخضر', body: '#a8ff7a', glow: '#2ee86a', price: 5 },
    { name: 'برتقالي', body: '#ffb36b', glow: '#ff6a1a', price: 6 },
    { name: 'بنفسجي', body: '#d5a8ff', glow: '#9a4dff', price: 8 },
    { name: 'ثلجي', body: '#ffffff', glow: '#9fd8ff', price: 10 }
  ];
  SH.TRAILS = [
    { name: 'نقاط', price: 0 }, { name: 'نجوم', price: 4 }, { name: 'قلوب', price: 6 },
    { name: 'برق', price: 8 }, { name: 'قوس قزح', price: 10 }
  ];

  /* ----------------------------------------------------------------- saves */
  // { v: 1, lv: [{ s: stars 0..3, t: best time in tenths of a second (0 none), c: coin
  //   bits }] one per level, coins: to spend, colors / trails: [0|1] owned, color, trail:
  //   the ones worn, coach: the first drag was done }
  SH.freshSave = function () {
    return { v: 1, lv: SH.LEVELS.map(function () { return { s: 0, t: 0, c: 0 }; }), coins: 0,
      colors: SH.COLORS.map(function (c, i) { return i ? 0 : 1; }), trails: SH.TRAILS.map(function (c, i) { return i ? 0 : 1; }),
      color: 0, trail: 0, coach: false };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  // Every field is checked: a damaged, hand-edited or old save loads as a playable one.
  SH.loadSave = function (raw) {
    var s = SH.freshSave(), r = obj(raw);
    if (!r || r.v !== 1) return s;
    var lv = Array.isArray(r.lv) ? r.lv : [];
    s.lv.forEach(function (e, i) {
      var o = obj(lv[i]);
      if (!o) return;
      e.s = int(o.s, 0, 3) ? o.s : 0;
      e.t = e.s && int(o.t, 1, 36000) ? o.t : 0;
      e.c = int(o.c, 0, 255) ? o.c & ((1 << (SH.LEVELS[i].coins || []).length) - 1) : 0;
    });
    s.coins = int(r.coins, 0, 99999) ? r.coins : 0;
    ['colors', 'trails'].forEach(function (k) {
      var a = Array.isArray(r[k]) ? r[k] : [];
      s[k] = s[k].map(function (v, i) { return i === 0 || a[i] === 1 ? 1 : 0; });
    });
    s.color = int(r.color, 0, SH.COLORS.length - 1) && s.colors[r.color] ? r.color : 0;
    s.trail = int(r.trail, 0, SH.TRAILS.length - 1) && s.trails[r.trail] ? r.trail : 0;
    s.coach = r.coach === true;
    return s;
  };
  // A level opens when the one before it has its lamp lit.
  SH.isOpen = function (s, i) { return i === 0 || (i > 0 && i < SH.LEVELS.length && s.lv[i - 1].s > 0); };
  SH.totalStars = function (s) { var n = 0; s.lv.forEach(function (e) { n += e.s; }); return n; };
  // The level to play next: the first open one without its lamp lit, else the last open.
  SH.nextLevel = function (s) {
    var top = 0;
    for (var i = 0; i < SH.LEVELS.length; i++) { if (!SH.isOpen(s, i)) break; top = i; if (!s.lv[i].s) return i; }
    return top;
  };
  function bits(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
  // Records a finished try: stars, time and coins. Returns what is new, for the celebration.
  SH.applyResult = function (s, i, stars, time, got) {
    var e = s.lv[i], out = { first: !e.s, best: false, moreStars: stars > e.s, coins: 0, opened: -1, world: -1 };
    var tenths = clamp(Math.ceil(time * 10), 1, 36000), mask = 0;
    got.forEach(function (g, k) { if (g) mask |= 1 << k; });
    out.best = !!e.s && (stars > e.s || tenths < e.t);
    if (stars > e.s) e.s = stars;
    if (!e.t || tenths < e.t) e.t = tenths;
    out.coins = bits(mask & ~e.c);
    e.c |= mask;
    s.coins = Math.min(99999, s.coins + out.coins);
    if (out.first && i + 1 < SH.LEVELS.length) { out.opened = i + 1; if ((i + 1) % 6 === 0) out.world = (i + 1) / 6; }
    return out;
  };
  // Buys (or puts on) a colour or a trail. Returns 'wear', 'bought' or '' (too few coins).
  SH.buy = function (s, kind, k) {
    var list = kind === 'trail' ? SH.TRAILS : SH.COLORS, own = kind === 'trail' ? s.trails : s.colors, key = kind === 'trail' ? 'trail' : 'color';
    if (!list[k]) return '';
    if (own[k]) { s[key] = k; return 'wear'; }
    if (s.coins < list[k].price) return '';
    s.coins -= list[k].price; own[k] = 1; s[key] = k;
    return 'bought';
  };
})();
