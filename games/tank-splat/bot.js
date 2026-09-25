/* Paint Tanks — computer tank brain. Pathfinds through the maze with BFS,
   searches for direct and bank shots with ray tracing, and dodges paint balls.
   window.TS_BOT.create(diff), .reset(bot), .think(bot, tank, game, dt) -> input */
(function () {
  'use strict';
  var M = window.TS_MAZE;

  var PARAMS = {
    easy: { think: 0.45, bounces: 0, samples: 0, aimErr: 0.13, react: 0.45, dodge: 0.2, maxBalls: 2, crates: false, turn: 0.7, speed: 0.78, range: 460, fireGap: 1.0, validate: 0.4 },
    medium: { think: 0.25, bounces: 1, samples: 40, aimErr: 0.055, react: 0.26, dodge: 0.5, maxBalls: 3, crates: true, turn: 0.88, speed: 0.95, range: 700, fireGap: 0.55, validate: 0.85 },
    hard: { think: 0.14, bounces: 2, samples: 60, aimErr: 0.025, react: 0.14, dodge: 0.8, maxBalls: 4, crates: true, turn: 1, speed: 1, range: 900, fireGap: 0.32, validate: 1 }
  };

  var OUT = { fwd: 0, turn: 0, fire: false };
  var ACTIONS = [[1, 0], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1], [0, 0], [0, 1], [0, -1]];

  function create(diff) {
    var b = { diff: diff, p: PARAMS[diff] || PARAMS.medium };
    reset(b);
    return b;
  }
  function reset(b) {
    b.thinkT = 0.2 + Math.random() * 0.3; b.aim = null; b.aimT = 0; b.reactT = 0; b.fireGapT = 0.6 + Math.random() * 0.6;
    b.wp = -1; b.targetCell = -1; b.stuckT = 0; b.unstuckT = 0; b.unstuckTurn = 1;
    b.dodgeT = 0; b.dF = 0; b.dT = 0; b.lastX = 0; b.lastY = 0;
  }

  function clamp(v, a, c) { return v < a ? a : v > c ? c : v; }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  function think(b, t, G, dt) {
    var p = b.p, m = G.maze;
    OUT.fwd = 0; OUT.turn = 0; OUT.fire = false;
    b.thinkT -= dt; b.reactT -= dt; b.fireGapT -= dt;

    var movedPx = Math.hypot(t.x - b.lastX, t.y - b.lastY);
    b.lastX = t.x; b.lastY = t.y;

    // ---- 1. dodge incoming paint
    if (b.dodgeT > 0) {
      b.dodgeT -= dt; OUT.fwd = b.dF; OUT.turn = b.dT; return OUT;
    }
    var threat = findThreat(t, G);
    if (threat) {
      var key = 'd' + t.id;
      if (threat[key] === undefined) threat[key] = Math.random() < p.dodge;
      if (threat[key]) {
        chooseDodge(b, t, G);
        b.dodgeT = 0.28; b.aim = null;
        OUT.fwd = b.dF; OUT.turn = b.dT; return OUT;
      }
    }

    // ---- 2. unstick
    if (b.unstuckT > 0) {
      b.unstuckT -= dt; OUT.fwd = -0.8; OUT.turn = b.unstuckTurn; return OUT;
    }

    // ---- 3. think: look for shots and pick a target
    if (b.thinkT <= 0) {
      b.thinkT = p.think * (0.8 + Math.random() * 0.4);
      if (b.aim === null && t.active < p.maxBalls && b.fireGapT <= 0) {
        var sol = findShot(b, t, G);
        if (sol !== null) {
          b.aim = sol + (Math.random() - 0.5) * 2 * p.aimErr;
          b.aimT = 1.0; b.reactT = p.react;
        }
      }
      pickTarget(b, t, G);
    }

    // ---- 4. aim and fire
    if (b.aim !== null) {
      var d = angDiff(t.a, b.aim);
      OUT.turn = clamp(d * 7, -1, 1) * p.turn;
      b.aimT -= dt;
      if (Math.abs(d) < 0.045 && b.reactT <= 0) {
        var ok = true;
        if (Math.random() < p.validate) {
          var hit = M.trace(m, t.x, t.y, t.a,
            { r: 7, bounces: p.bounces + 1, len: p.range + 200, tanks: G.tanks, self: t, selfSkip: 30 }, null);
          if (hit === t) ok = false;
        }
        if (ok) OUT.fire = true;
        b.aim = null; b.fireGapT = p.fireGap * (0.7 + Math.random() * 0.6);
      } else if (b.aimT <= 0) b.aim = null;
      return OUT;
    }

    // ---- 5. drive along the path
    var my = M.cellOf(m, t.x, t.y);
    if (b.targetCell < 0) pickTarget(b, t, G);
    var wpc = b.wp >= 0 ? M.cellCenter(m, b.wp) : null;
    var reached = wpc && Math.hypot(wpc.x - t.x, wpc.y - t.y) < 13;
    if (b.wp < 0 || reached || (b.wp !== my && !adjacent(m, my, b.wp))) {
      if (b.targetCell === my || b.targetCell < 0) b.wp = my;
      else b.wp = M.firstStep(M.bfs(m, my), my, b.targetCell);
      wpc = M.cellCenter(m, b.wp);
    }
    var dist = Math.hypot(wpc.x - t.x, wpc.y - t.y);
    if (b.wp === my && dist < 13) { // parked at the target: slowly look around
      OUT.turn = 0.4 * p.turn; return OUT;
    }
    var want = Math.atan2(wpc.y - t.y, wpc.x - t.x);
    var dd = angDiff(t.a, want);
    if (Math.abs(dd) > 2.5 && dist < 110) {
      // target is behind: back up to it
      var back = angDiff(t.a, want + Math.PI);
      OUT.turn = clamp(back * 4, -1, 1) * p.turn;
      OUT.fwd = Math.abs(back) < 0.5 ? -0.8 * p.speed : 0;
    } else {
      OUT.turn = clamp(dd * 4, -1, 1) * p.turn;
      OUT.fwd = Math.abs(dd) < 0.45 ? p.speed : (Math.abs(dd) < 1.1 ? 0.25 : 0);
      if (dist < 24) OUT.fwd *= 0.6;
    }
    // stuck detection
    if (Math.abs(OUT.fwd) > 0.2 && movedPx < 0.25) {
      b.stuckT += dt;
      if (b.stuckT > 0.55) { b.stuckT = 0; b.unstuckT = 0.35; b.unstuckTurn = Math.random() < 0.5 ? -1 : 1; b.wp = -1; }
    } else b.stuckT = Math.max(0, b.stuckT - dt);
    return OUT;
  }

  function adjacent(m, a, b) {
    var ax = a % m.cols, ay = (a / m.cols) | 0;
    for (var d = 0; d < 4; d++) {
      if (!M.canPass(m, ax, ay, d)) continue;
      if ((ay + M.DY[d]) * m.cols + ax + M.DX[d] === b) return true;
    }
    return false;
  }

  function pickTarget(b, t, G) {
    var m = G.maze, my = M.cellOf(m, t.x, t.y), res = M.bfs(m, my);
    var best = -1, bd = 1e9, i;
    for (i = 0; i < G.tanks.length; i++) {
      var e = G.tanks[i];
      if (e === t || !e.alive) continue;
      var c = M.cellOf(m, e.x, e.y), d = res.dist[c];
      if (d >= 0 && d < bd) { bd = d; best = c; }
    }
    if (b.p.crates) {
      for (i = 0; i < G.crates.length; i++) {
        var k = G.crates[i], kc = M.cellOf(m, k.x, k.y), kd = res.dist[kc];
        if (kd >= 0 && kd <= bd + 1) { bd = kd; best = kc; }
      }
    }
    if (best !== b.targetCell) { b.targetCell = best; b.wp = -1; }
  }

  var PTS = [];
  function findShot(b, t, G) {
    var p = b.p, m = G.maze, i;
    var bounces = p.bounces + (t.laser > 0 ? 1 : 0);
    // direct line of sight first
    var bestA = null, bestD = 1e9;
    for (i = 0; i < G.tanks.length; i++) {
      var e = G.tanks[i];
      if (e === t || !e.alive) continue;
      var dx = e.x - t.x, dy = e.y - t.y, dist = Math.hypot(dx, dy);
      if (dist > p.range) continue;
      var a = Math.atan2(dy, dx);
      var hit = M.trace(m, t.x, t.y, a, { r: 7, bounces: 0, len: p.range, tanks: G.tanks, self: t, selfSkip: 30 }, null);
      if (hit === e) {
        var ad = Math.abs(angDiff(t.a, a));
        if (ad < bestD) { bestD = ad; bestA = a; }
      }
    }
    if (bestA !== null) return bestA;
    if (!p.samples) return null;
    var n = p.samples, off = Math.random() * Math.PI * 2 / n;
    for (i = 0; i < n; i++) {
      var ang = off + i / n * Math.PI * 2;
      var h = M.trace(m, t.x, t.y, ang,
        { r: 7, bounces: bounces, len: p.range, tanks: G.tanks, self: t, selfSkip: 30 }, null);
      if (h && h !== t) {
        var ad2 = Math.abs(angDiff(t.a, ang));
        if (ad2 < bestD) { bestD = ad2; bestA = ang; }
      }
    }
    return bestA;
  }

  function findThreat(t, G) {
    var m = G.maze, best = null, bestD = 1e9;
    for (var i = 0; i < G.balls.length; i++) {
      var bl = G.balls[i];
      if (bl.owner === t && bl.safe) continue;
      var dx = t.x - bl.x, dy = t.y - bl.y, d = Math.hypot(dx, dy);
      if (d > 300) continue;
      var sp = Math.hypot(bl.vx, bl.vy);
      var hit = M.trace(m, bl.x, bl.y, Math.atan2(bl.vy, bl.vx), { r: bl.r, bounces: 1, len: sp * 0.85, tanks: [t], hitR: 25 }, null);
      if (hit === t && d < bestD) { bestD = d; best = bl; }
    }
    return best;
  }

  // Try a few moves for ~0.45 s and pick the one that stays farthest from the paint.
  function chooseDodge(b, t, G) {
    var m = G.maze, bestS = -1, bf = 0, bt = 0;
    var near = [];
    for (var i = 0; i < G.balls.length; i++) {
      var bl = G.balls[i];
      if (bl.owner === t && bl.safe) continue;
      if (Math.hypot(t.x - bl.x, t.y - bl.y) < 360) near.push(bl);
    }
    var spd = 165 * (t.speed > 0 ? 1.55 : 1), rot = 3.4;
    for (var k = 0; k < ACTIONS.length; k++) {
      var f = ACTIONS[k][0], tr = ACTIONS[k][1];
      var x = t.x, y = t.y, a = t.a, minD = 1e9;
      for (var s = 1; s <= 6; s++) {
        var st = 0.075;
        a += tr * rot * st;
        x += Math.cos(a) * f * spd * (f < 0 ? 0.72 : 1) * st; y += Math.sin(a) * f * spd * (f < 0 ? 0.72 : 1) * st;
        var o = M.collideCircle(m, x, y, 18); x = o.x; y = o.y;
        var time = s * st;
        for (var j = 0; j < near.length; j++) {
          var bl2 = near[j];
          var bx = bl2.x + bl2.vx * time, by = bl2.y + bl2.vy * time;
          var dd = Math.hypot(bx - x, by - y) - bl2.r;
          if (dd < minD) minD = dd;
        }
      }
      var score = minD + (f > 0 ? 3 : 0) + Math.random() * 2;
      if (score > bestS) { bestS = score; bf = f; bt = tr; }
    }
    b.dF = bf * b.p.speed; b.dT = bt;
  }

  window.TS_BOT = { create: create, reset: reset, think: think, PARAMS: PARAMS };
})();
