/*
 * Pool Party — billiards physics (original code).
 * Event-driven continuous collision inside fixed sub-steps: every sub-step finds the
 * earliest ball/ball, ball/cushion, ball/jaw-corner or ball/pocket event, advances to it,
 * resolves it and repeats, so fast balls never tunnel and contacts match the aim guide.
 * Sliding vs rolling friction gives real follow / draw; side spin bends cushion rebounds.
 * Plain script; also loads in Node (module.exports) for the offline level solver.
 */
(function (root) {
  'use strict';

  var P = {};
  var R = P.R = 12;
  var TX0 = P.TX0 = 200, TY0 = P.TY0 = 176, TW = P.TW = 880, TH = P.TH = 440;
  var TX1 = P.TX1 = TX0 + TW, TY1 = P.TY1 = TY0 + TH;
  var CX = P.CX = TX0 + TW / 2, CY = P.CY = TY0 + TH / 2;
  P.HEAD_X = TX0 + TW / 4;          // head string (break kitchen is left of it)
  P.FOOT_X = TX0 + TW * 3 / 4;      // foot spot

  var MU_S = 820;      // sliding friction deceleration (px/s^2)
  var MU_R = 120;      // rolling resistance (px/s^2)
  var DRAG = 0.22;     // speed-proportional cloth drag (1/s)
  var E_BALL = 0.95;   // ball-ball restitution
  var E_CUSH = 0.74;   // cushion restitution
  var SPIN_DECAY = 0.9;
  var SUB = 4;         // sub-steps per 1/60 s frame
  P.MAX_SPEED = 2500;

  /* ------------------------------------------------------------ table geometry */
  var pockets = P.pockets = [];
  var segs = P.segs = [];
  var verts = P.verts = [];
  var jawLines = P.jawLines = [];   // for drawing the cushion shapes

  function addSeg(ax, ay, bx, by, rx, ry) {
    var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len;
    var nx = -uy, ny = ux;
    if ((rx - ax) * nx + (ry - ay) * ny < 0) { nx = -nx; ny = -ny; }
    segs.push({ ax: ax, ay: ay, bx: bx, by: by, ux: ux, uy: uy, nx: nx, ny: ny, len: len });
  }
  function addVert(x, y) {
    for (var i = 0; i < verts.length; i++) if (Math.abs(verts[i].x - x) < 0.01 && Math.abs(verts[i].y - y) < 0.01) return;
    verts.push({ x: x, y: y });
  }

  (function build() {
    var C = 40, S = 29, i;
    var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (i = 0; i < 4; i++) {
      var sx = corners[i][0], sy = corners[i][1];
      var cx0 = sx < 0 ? TX0 : TX1, cy0 = sy < 0 ? TY0 : TY1;
      var pk = { x: cx0 + sx * 6, y: cy0 + sy * 6, r: 24, hole: 30, ax: cx0 - sx * 5, ay: cy0 - sy * 5, side: false,
        dirx: sx * Math.SQRT1_2, diry: sy * Math.SQRT1_2 };
      pockets.push(pk);
      // jaw on the horizontal rail
      var Ax = cx0 - sx * C, Ay = cy0, A2x = cx0 - sx * (C - 22), A2y = cy0 + sy * 20;
      addSeg(Ax, Ay, A2x, A2y, pk.x, pk.y); addVert(Ax, Ay); addVert(A2x, A2y);
      // jaw on the vertical rail
      var Bx = cx0, By = cy0 - sy * C, B2x = cx0 + sx * 20, B2y = cy0 - sy * (C - 22);
      addSeg(Bx, By, B2x, B2y, pk.x, pk.y); addVert(Bx, By); addVert(B2x, B2y);
      jawLines.push([A2x, A2y, Ax, Ay], [B2x, B2y, Bx, By]);
    }
    for (i = 0; i < 2; i++) {
      var sy2 = i === 0 ? -1 : 1, cy1 = i === 0 ? TY0 : TY1;
      var sp = { x: CX, y: cy1 + sy2 * 15, r: 20, hole: 25, ax: CX, ay: cy1 + sy2 * 2, side: true, dirx: 0, diry: sy2 };
      pockets.push(sp);
      addSeg(CX - S, cy1, CX - S + 6, cy1 + sy2 * 22, sp.x, sp.y); addVert(CX - S, cy1); addVert(CX - S + 6, cy1 + sy2 * 22);
      addSeg(CX + S, cy1, CX + S - 6, cy1 + sy2 * 22, sp.x, sp.y); addVert(CX + S, cy1); addVert(CX + S - 6, cy1 + sy2 * 22);
      jawLines.push([CX - S + 6, cy1 + sy2 * 22, CX - S, cy1], [CX + S - 6, cy1 + sy2 * 22, CX + S, cy1]);
    }
    // cushion noses
    addSeg(TX0 + C, TY0, CX - S, TY0, CX, CY);
    addSeg(CX + S, TY0, TX1 - C, TY0, CX, CY);
    addSeg(TX0 + C, TY1, CX - S, TY1, CX, CY);
    addSeg(CX + S, TY1, TX1 - C, TY1, CX, CY);
    addSeg(TX0, TY0 + C, TX0, TY1 - C, CX, CY);
    addSeg(TX1, TY0 + C, TX1, TY1 - C, CX, CY);
    P.cushionPolys = [
      // each cushion as polygon (jaw end, nose start, nose end, jaw end) for drawing
      [[TX0 + C - 22, TY0 - 20], [TX0 + C, TY0], [CX - S, TY0], [CX - S + 6, TY0 - 22]],
      [[CX + S - 6, TY0 - 22], [CX + S, TY0], [TX1 - C, TY0], [TX1 - C + 22, TY0 - 20]],
      [[TX0 + C - 22, TY1 + 20], [TX0 + C, TY1], [CX - S, TY1], [CX - S + 6, TY1 + 22]],
      [[CX + S - 6, TY1 + 22], [CX + S, TY1], [TX1 - C, TY1], [TX1 - C + 22, TY1 + 20]],
      [[TX0 - 20, TY0 + C - 22], [TX0, TY0 + C], [TX0, TY1 - C], [TX0 - 20, TY1 - C + 22]],
      [[TX1 + 20, TY0 + C - 22], [TX1, TY0 + C], [TX1, TY1 - C], [TX1 + 20, TY1 - C + 22]]
    ];
  })();

  /* ------------------------------------------------------------------- state */
  P.groupOf = function (n) { return n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe'; };

  function mkBall(n, x, y) {
    return { n: n, x: x, y: y, vx: 0, vy: 0, wx: 0, wy: 0, s: 0, on: true, cush: 0 };
  }
  P.mkBall = mkBall;

  // Standard triangle rack: apex on the foot spot pointing at the head of the table.
  P.rack = function (rand) {
    rand = rand || Math.random;
    var st = { balls: [], t: 0, shot: null, onEvent: null };
    st.balls.push(mkBall(0, P.HEAD_X - 40, CY));
    var solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
    shuffle(solids, rand); shuffle(stripes, rand);
    // slot layout: row r has r+1 balls. index 4 (row 2, middle) = 8, back corners = one solid one stripe
    var slots = [];
    var apex = solids.indexOf(1); solids.splice(apex, 1);
    var order = new Array(15);
    order[0] = 1; order[4] = 8;
    var cornerSolid = rand() < 0.5;
    order[10] = cornerSolid ? solids.pop() : stripes.pop();
    order[14] = cornerSolid ? stripes.pop() : solids.pop();
    var rest = solids.concat(stripes); shuffle(rest, rand);
    for (var k = 0; k < 15; k++) if (order[k] == null) order[k] = rest.pop();
    var dx = Math.sqrt(3) * (R + 0.03), idx = 0;
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c <= r; c++) {
        var x = P.FOOT_X + r * dx, y = CY + (c - r / 2) * (2 * R + 0.06);
        slots.push([x + (rand() - 0.5) * 0.04, y + (rand() - 0.5) * 0.04]);
        st.balls.push(mkBall(order[idx], slots[idx][0], slots[idx][1]));
        idx++;
      }
    }
    return st;
  };

  function shuffle(a, rand) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  P.fromLayout = function (list) {
    var st = { balls: [], t: 0, shot: null, onEvent: null };
    for (var i = 0; i < list.length; i++) st.balls.push(mkBall(list[i].n, list[i].x, list[i].y));
    return st;
  };

  P.clone = function (st) {
    var o = { balls: [], t: st.t, shot: null, onEvent: null };
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      o.balls.push({ n: b.n, x: b.x, y: b.y, vx: b.vx, vy: b.vy, wx: b.wx, wy: b.wy, s: b.s, on: b.on, cush: 0 });
    }
    return o;
  };

  P.ball = function (st, n) {
    for (var i = 0; i < st.balls.length; i++) if (st.balls[i].n === n) return st.balls[i];
    return null;
  };

  P.moving = function (st) {
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (b.on && (b.vx !== 0 || b.vy !== 0 || b.wx !== 0 || b.wy !== 0)) return true;
    }
    return false;
  };

  /* -------------------------------------------------------------------- shot */
  // angle in radians, speed px/s, spinX = side (-1 left .. 1 right), spinY = -1 draw .. 1 follow
  P.shoot = function (st, angle, speed, spinX, spinY, isBreak) {
    st.breakShot = !!isBreak; st.broke = false;
    var cue = P.ball(st, 0);
    var dx = Math.cos(angle), dy = Math.sin(angle);
    cue.vx = dx * speed; cue.vy = dy * speed;
    var k = (spinY || 0) * 1.2;
    cue.wx = cue.vx * k; cue.wy = cue.vy * k;
    cue.s = spinX || 0;
    for (var i = 0; i < st.balls.length; i++) st.balls[i].cush = 0;
    st.shot = { first: -1, pots: [], cushions: 0, cueCushionsBeforeHit: 0, hits: 0, t: 0 };
  };

  function emit(st, type, a, b, v, x, y) { if (st.onEvent) st.onEvent(type, a, b, v, x, y); }

  /* ---------------------------------------------------------------- friction */
  function friction(b, h) {
    var ux = b.vx - b.wx, uy = b.vy - b.wy;
    var u = Math.sqrt(ux * ux + uy * uy);
    if (u > 1.5) {
      var d = MU_S * h;
      if (3.5 * d >= u) {
        b.vx -= ux / 3.5; b.vy -= uy / 3.5; b.wx = b.vx; b.wy = b.vy;
      } else {
        ux /= u; uy /= u;
        b.vx -= ux * d; b.vy -= uy * d;
        b.wx += ux * 2.5 * d; b.wy += uy * 2.5 * d;
      }
      // cloth drag on the sliding ball as well
      var dr = 1 - DRAG * h * 0.5;
      b.vx *= dr; b.vy *= dr;
    } else {
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp < 3) { b.vx = b.vy = b.wx = b.wy = 0; }
      else {
        var ns = sp - MU_R * h - sp * DRAG * h;
        if (ns <= 0) { b.vx = b.vy = b.wx = b.wy = 0; }
        else { var f = ns / sp; b.vx *= f; b.vy *= f; b.wx = b.vx; b.wy = b.vy; }
      }
    }
    if (b.s !== 0) { b.s *= (1 - SPIN_DECAY * h); if (Math.abs(b.s) < 0.01) b.s = 0; }
    if (b.vx === 0 && b.vy === 0 && Math.abs(b.wx) + Math.abs(b.wy) < 1.5) { b.wx = 0; b.wy = 0; }
  }

  /* ------------------------------------------------------- time of impact */
  var INF = 1e9;
  function ballBallTOI(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, dvx = b.vx - a.vx, dvy = b.vy - a.vy;
    var B = dx * dvx + dy * dvy;
    if (B >= 0) return INF;
    var A = dvx * dvx + dvy * dvy;
    if (A < 1e-9) return INF;
    var C = dx * dx + dy * dy - 4 * R * R;
    if (C <= 0) return 0;
    var disc = B * B - A * C;
    if (disc < 0) return INF;
    return (-B - Math.sqrt(disc)) / A;
  }
  function segTOI(b, s) {
    var vn = b.vx * s.nx + b.vy * s.ny;
    if (vn >= 0) return INF;
    var d0 = (b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny;
    if (d0 < R - 2) return INF;
    var t = (d0 - R) / -vn;
    if (t < 0) t = 0;
    var px = b.x + b.vx * t - s.ax, py = b.y + b.vy * t - s.ay;
    var pr = px * s.ux + py * s.uy;
    if (pr < 0 || pr > s.len) return INF;
    return t;
  }
  function pointTOI(b, qx, qy, rad) {
    var dx = b.x - qx, dy = b.y - qy;
    var B = dx * b.vx + dy * b.vy;
    if (B >= 0) return INF;
    var A = b.vx * b.vx + b.vy * b.vy;
    var C = dx * dx + dy * dy - rad * rad;
    if (C <= 0) return 0;
    var disc = B * B - A * C;
    if (disc < 0) return INF;
    return (-B - Math.sqrt(disc)) / A;
  }

  /* ------------------------------------------------------------- responses */
  function hitCushion(st, b, nx, ny) {
    var vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
    var dx = b.vx / sp, dy = b.vy / sp;
    b.vx -= (1 + E_CUSH) * vn * nx; b.vy -= (1 + E_CUSH) * vn * ny;
    if (b.s) {
      var tx = -ny, ty = nx;
      var rx = -dy, ry = dx;
      var k = b.s * 0.55 * -vn * (rx * tx + ry * ty);
      b.vx += tx * k; b.vy += ty * k;
      b.s *= 0.55;
    }
    var wn = b.wx * nx + b.wy * ny;
    b.wx -= 1.2 * wn * nx; b.wy -= 1.2 * wn * ny;
    b.cush++;
    if (st.shot) {
      st.shot.cushions++;
      if (b.n === 0 && st.shot.first < 0) st.shot.cueCushionsBeforeHit++;
    }
    emit(st, 'cushion', b, null, -vn, b.x - nx * R, b.y - ny * R);
  }

  function hitBalls(st, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / d, ny = dy / d;
    var vr = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vr <= 0) return;
    var J = (1 + E_BALL) / 2 * vr;
    a.vx -= J * nx; a.vy -= J * ny; b.vx += J * nx; b.vy += J * ny;
    if (d < 2 * R) { // tiny overlap fix
      var push = (2 * R - d) / 2 + 0.001;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
    if (st.breakShot && !st.broke && (a.n === 0 || b.n === 0)) { st.broke = true; explode(st, vr); }
    if (st.shot) {
      st.shot.hits++;
      if (st.shot.first < 0) {
        if (a.n === 0) st.shot.first = b.n; else if (b.n === 0) st.shot.first = a.n;
      }
    }
    emit(st, 'ball', a, b, vr, a.x + nx * R, a.y + ny * R);
  }

  // Arcade break: when the cue ball first meets the rack, burst the whole pack apart.
  function explode(st, v) {
    var cx = 0, cy = 0, n = 0, i, b, rnd = st.rand || Math.random;
    for (i = 0; i < st.balls.length; i++) { b = st.balls[i]; if (b.on && b.n !== 0) { cx += b.x; cy += b.y; n++; } }
    if (!n) return;
    cx /= n; cy /= n;
    var cue = null;
    for (i = 0; i < st.balls.length; i++) if (st.balls[i].n === 0) cue = st.balls[i];
    var fx = cx - cue.x, fy = cy - cue.y, fl = Math.sqrt(fx * fx + fy * fy) || 1;
    fx /= fl; fy /= fl;
    var ox = cx - fx * 45, oy = cy - fy * 45;
    var k = Math.min(1, v / P.MAX_SPEED);
    for (i = 0; i < st.balls.length; i++) {
      b = st.balls[i];
      if (!b.on || b.n === 0) continue;
      var dx = b.x - ox, dy = b.y - oy, dl = Math.sqrt(dx * dx + dy * dy);
      if (dl > 120) continue;
      dx /= dl; dy /= dl;
      var ang = (rnd() - 0.5) * 0.5, ca = Math.cos(ang), sa = Math.sin(ang);
      var ex = dx * ca - dy * sa, ey = dx * sa + dy * ca;
      var mag = v * (0.2 + 0.3 * rnd()) * (0.5 + 0.5 * k);
      b.vx += ex * mag; b.vy += ey * mag;
    }
  }

  function potBall(st, b, pi) {
    b.on = false;
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (st.shot) st.shot.pots.push({ n: b.n, pocket: pi, cush: b.cush, t: st.t });
    emit(st, 'pot', b, pi, sp, b.x, b.y);
    b.vx = b.vy = b.wx = b.wy = 0; b.s = 0;
  }

  function advance(balls, t) {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on) continue;
      b.x += b.vx * t; b.y += b.vy * t;
    }
  }

  /* ------------------------------------------------------------- main step */
  function substep(st, h) {
    var balls = st.balls, n = balls.length, i, j, k;
    for (i = 0; i < n; i++) if (balls[i].on && (balls[i].vx || balls[i].vy || balls[i].wx || balls[i].wy)) friction(balls[i], h);
    var remain = h, iter = 0;
    while (remain > 1e-9 && iter < 48) {
      iter++;
      var best = remain, type = 0, A = null, B = null, extra = null;
      for (i = 0; i < n; i++) {
        var a = balls[i];
        if (!a.on) continue;
        var am = a.vx !== 0 || a.vy !== 0;
        for (j = i + 1; j < n; j++) {
          var b = balls[j];
          if (!b.on) continue;
          if (!am && b.vx === 0 && b.vy === 0) continue;
          var t = ballBallTOI(a, b);
          if (t < best) { best = t; type = 1; A = a; B = b; }
        }
        if (!am) continue;
        // quick reject: far from every rail and pocket
        var nearEdge = a.x < TX0 + 60 || a.x > TX1 - 60 || a.y < TY0 + 60 || a.y > TY1 - 60 ||
          Math.abs(a.vx) * remain > 30 || Math.abs(a.vy) * remain > 30;
        if (!nearEdge) continue;
        for (k = 0; k < pockets.length; k++) {
          var pk = pockets[k];
          var tp = pointTOI(a, pk.x, pk.y, pk.r);
          if (tp < best) { best = tp; type = 4; A = a; extra = k; }
        }
        for (k = 0; k < segs.length; k++) {
          var ts = segTOI(a, segs[k]);
          if (ts < best) { best = ts; type = 2; A = a; extra = segs[k]; }
        }
        for (k = 0; k < verts.length; k++) {
          var tv = pointTOI(a, verts[k].x, verts[k].y, R);
          if (tv < best) { best = tv; type = 3; A = a; extra = verts[k]; }
        }
      }
      advance(balls, best);
      st.t += best;
      remain -= best;
      if (type === 1) hitBalls(st, A, B);
      else if (type === 2) hitCushion(st, A, extra.nx, extra.ny);
      else if (type === 3) {
        var ddx = A.x - extra.x, ddy = A.y - extra.y, dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        hitCushion(st, A, ddx / dd, ddy / dd);
      } else if (type === 4) potBall(st, A, extra);
    }
    if (remain > 1e-9) { advance(balls, remain); st.t += remain; }
    // safety net: anything that escaped the playfield drops into the nearest pocket
    for (i = 0; i < n; i++) {
      var q = balls[i];
      if (!q.on) continue;
      if (q.x < TX0 - 26 || q.x > TX1 + 26 || q.y < TY0 - 26 || q.y > TY1 + 26 ||
          ((q.x < TX0 + R - 3 || q.x > TX1 - R + 3) && q.y > TY0 + 40 && q.y < TY1 - 40) ||
          ((q.y < TY0 + R - 3 || q.y > TY1 - R + 3) && ((q.x > TX0 + 40 && q.x < CX - 32) || (q.x > CX + 32 && q.x < TX1 - 40)))) {
        var bi = 0, bd = INF;
        for (k = 0; k < pockets.length; k++) {
          var ex = q.x - pockets[k].x, ey = q.y - pockets[k].y, e2 = ex * ex + ey * ey;
          if (e2 < bd) { bd = e2; bi = k; }
        }
        if (bd < 60 * 60) potBall(st, q, bi);
        else { // pushed through a cushion somehow: put it back just inside
          q.x = Math.max(TX0 + R, Math.min(TX1 - R, q.x)); q.y = Math.max(TY0 + R, Math.min(TY1 - R, q.y));
          q.vx *= -0.5; q.vy *= -0.5; q.wx = q.vx; q.wy = q.vy;
        }
      }
    }
  }

  P.step = function (st, dt) {
    var h = dt / SUB;
    for (var s = 0; s < SUB; s++) substep(st, h);
  };

  // Run until everything stops (or maxT seconds). Returns the shot record.
  P.simulate = function (st, maxT) {
    maxT = maxT || 30;
    var t = 0;
    while (P.moving(st) && t < maxT) { P.step(st, 1 / 60); t += 1 / 60; }
    return st.shot;
  };

  /* ------------------------------------------------------------ placement */
  P.canPlace = function (st, x, y, kitchen) {
    if (x < TX0 + R || x > TX1 - R || y < TY0 + R || y > TY1 - R) return false;
    if (kitchen && x > P.HEAD_X) return false;
    for (var k = 0; k < pockets.length; k++) {
      var dx = x - pockets[k].x, dy = y - pockets[k].y;
      if (dx * dx + dy * dy < (pockets[k].r + R + 4) * (pockets[k].r + R + 4)) return false;
    }
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on || b.n === 0) continue;
      var ex = x - b.x, ey = y - b.y;
      if (ex * ex + ey * ey < (2 * R + 0.5) * (2 * R + 0.5)) return false;
    }
    return true;
  };

  // Nearest free legal spot to (x, y)
  P.findPlace = function (st, x, y, kitchen) {
    x = Math.max(TX0 + R, Math.min(kitchen ? P.HEAD_X : TX1 - R, x));
    y = Math.max(TY0 + R, Math.min(TY1 - R, y));
    if (P.canPlace(st, x, y, kitchen)) return { x: x, y: y };
    for (var r = 3; r < 400; r += 3) {
      for (var a = 0; a < 24; a++) {
        var ang = a / 24 * Math.PI * 2;
        var px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r;
        if (P.canPlace(st, px, py, kitchen)) return { x: px, y: py };
      }
    }
    return { x: P.HEAD_X - 40, y: CY };
  };

  /* ------------------------------------------------------------ aim trace */
  // Cast the cue ball (radius R) from (x, y) along angle; returns the first thing it meets.
  P.trace = function (st, x, y, ang, ignoreN) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var best = INF, hit = null, k;
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on || b.n === 0 || b.n === ignoreN) continue;
      var ox = x - b.x, oy = y - b.y;
      var B = ox * dx + oy * dy;
      var C = ox * ox + oy * oy - 4 * R * R;
      var disc = B * B - C;
      if (disc < 0 || B > 0) continue;
      var t = -B - Math.sqrt(disc);
      if (t < 0) t = 0;
      if (t < best) { best = t; hit = { type: 'ball', ball: b }; }
    }
    var probe = { x: x, y: y, vx: dx, vy: dy };
    for (k = 0; k < segs.length; k++) {
      var ts = segTOI(probe, segs[k]);
      if (ts < best) { best = ts; hit = { type: 'cushion', nx: segs[k].nx, ny: segs[k].ny }; }
    }
    for (k = 0; k < verts.length; k++) {
      var tv = pointTOI(probe, verts[k].x, verts[k].y, R);
      if (tv < best) {
        best = tv;
        var hx = x + dx * tv - verts[k].x, hy = y + dy * tv - verts[k].y, hl = Math.sqrt(hx * hx + hy * hy) || 1;
        hit = { type: 'cushion', nx: hx / hl, ny: hy / hl };
      }
    }
    for (k = 0; k < pockets.length; k++) {
      var tp = pointTOI(probe, pockets[k].x, pockets[k].y, pockets[k].r);
      if (tp < best) { best = tp; hit = { type: 'pocket', pocket: k }; }
    }
    if (!hit) return null;
    hit.t = best; hit.x = x + dx * best; hit.y = y + dy * best; hit.dx = dx; hit.dy = dy;
    if (hit.type === 'ball') {
      var nx = hit.ball.x - hit.x, ny = hit.ball.y - hit.y, nl = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nl; ny /= nl;
      hit.ox = nx; hit.oy = ny;                 // object ball direction
      var dot = dx * nx + dy * ny;
      hit.cut = dot;                            // 1 = full hit, 0 = thin
      var tx = dx - dot * nx, ty = dy - dot * ny, tl = Math.sqrt(tx * tx + ty * ty);
      if (tl > 1e-6) { hit.cx = tx / tl; hit.cy = ty / tl; } else { hit.cx = 0; hit.cy = 0; }
      hit.cs = tl;                              // cue ball keeps this share of speed
    } else if (hit.type === 'cushion') {
      var vn = dx * hit.nx + dy * hit.ny;
      hit.rx = dx - 2 * vn * hit.nx; hit.ry = dy - 2 * vn * hit.ny;
    }
    return hit;
  };

  // Is the straight corridor (width 2R) from (x1,y1) to (x2,y2) free of balls (except the listed ones)?
  P.clearPath = function (st, x1, y1, x2, y2, skipA, skipB) {
    var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    if (L2 < 1e-6) return true;
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on || b.n === skipA || b.n === skipB) continue;
      var t = ((b.x - x1) * dx + (b.y - y1) * dy) / L2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var px = x1 + dx * t - b.x, py = y1 + dy * t - b.y;
      if (px * px + py * py < (2 * R - 0.5) * (2 * R - 0.5)) return false;
    }
    return true;
  };

  root.PoolPhysics = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
