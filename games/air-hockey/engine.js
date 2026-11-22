/*
 * Air Hockey engine: pure 2D physics and match rules (no DOM, no Kit), so Node tests can
 * load it. Units are table units: the playing field is 520 wide (x -260..260) and 900 long
 * (y -450..450). Side 0 plays at the bottom (+y) and defends the goal at y = +450; side 1
 * plays at the top and defends y = -450.
 *
 *   var w = AHEngine.create({ target: 7, powerUps: true, seed: 1 });
 *   AHEngine.step(w, 1 / 60, [{ x, y, spd }, { x, y, spd }]);   // mallet targets
 *   w.events  // what happened during that step: hit, wall, post, goal, power, ...
 *
 * Collisions are continuous: every step is cut into sub-steps short enough that neither a
 * puck nor a mallet moves more than 40% of a puck radius, and inside each sub-step the
 * puck-mallet contact is solved as a swept circle pair (time of impact), so even the
 * fastest shot or a mouse flick cannot tunnel through a mallet, a wall or a post.
 */
(function (root) {
  'use strict';

  var T = {
    HW: 260, HL: 450,            // half width, half length of the field
    CORNER: 70,                  // rounded corner radius
    PUCK_R: 24,
    MALLET_R: 40, BIG_R: 60,
    GOAL_HALF: 92, MINI_HALF: 52,
    POST_R: 5,
    MAX_PUCK: 2300,              // puck speed cap (units per second)
    WALL_E: 0.9, MALLET_E: 0.9,  // restitution
    FRICTION: 0.2,               // velocity decay per second (exp)
    LINE_GAP: 4,                 // a mallet's centre may come this close to the centre line
    POWER_T: 8,                  // power-up duration in seconds
    ITEM_R: 30, ITEM_LIFE: 9
  };
  var KINDS = ['multi', 'big', 'mini'];

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
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function makePuck(i) { return { i: i, alive: false, x: 0, y: 0, vx: 0, vy: 0, r: T.PUCK_R, last: -1, hitCd: 0, wallCd: 0 }; }
  function makeMallet(side) {
    return { side: side, x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, vx: 0, vy: 0, r: T.MALLET_R, bigT: 0, maxSpd: 2600 };
  }

  function create(opts) {
    opts = opts || {};
    var w = {
      T: T,
      target: Math.max(1, opts.target | 0 || 7),
      powerUps: !!opts.powerUps,
      rand: mulberry(opts.seed == null ? 1 : opts.seed),
      score: [0, 0],
      phase: 'serve', phaseT: 0, t: 0,
      firstServe: opts.firstServe == null ? 2.1 : opts.firstServe,
      serveDelay: opts.serveDelay == null ? 1.1 : opts.serveDelay,
      goalDelay: opts.goalDelay == null ? 1.3 : opts.goalDelay,
      pucks: [makePuck(0), makePuck(1), makePuck(2)],
      mallets: [makeMallet(0), makeMallet(1)],
      goals: [{ half: T.GOAL_HALF, miniT: 0 }, { half: T.GOAL_HALF, miniT: 0 }],
      item: { alive: false, kind: '', x: 0, y: 0, t: 0 },
      itemClock: opts.firstItem == null ? 7 : opts.firstItem,
      serveSide: opts.serveSide == null ? 0 : opts.serveSide,
      winner: -1,
      lastGoal: -1,
      hits: [0, 0],
      events: []
    };
    resetMallets(w);
    serve(w, w.serveSide, w.firstServe);
    return w;
  }

  function resetMallets(w) {
    for (var s = 0; s < 2; s++) {
      var m = w.mallets[s], sy = s === 0 ? 1 : -1;
      m.x = m.px = m.sx = 0; m.y = m.py = m.sy = sy * (T.HL - 110); m.vx = m.vy = 0; m.bigT = 0; m.r = T.MALLET_R;
    }
  }

  // The puck rests on the half of the side that serves (the one that was scored on).
  function serve(w, side, delay) {
    for (var i = 0; i < w.pucks.length; i++) w.pucks[i].alive = false;
    var p = w.pucks[0], sy = side === 0 ? 1 : -1;
    p.alive = true; p.x = (w.rand() - 0.5) * 80; p.y = sy * T.HL * 0.3; p.vx = p.vy = 0; p.last = -1; p.hitCd = p.wallCd = 0;
    w.item.alive = false;
    w.phase = 'serve'; w.phaseT = delay == null ? w.serveDelay : delay;
    w.serveSide = side;
  }

  function emit(w, type, a, b, c, d) { w.events.push({ type: type, a: a, b: b, c: c, d: d }); }

  function aliveCount(w) { var n = 0; for (var i = 0; i < w.pucks.length; i++) if (w.pucks[i].alive) n++; return n; }

  // Clamp a mallet's wanted position into its half of the rounded field.
  function zone(m, x, y, out) {
    var r = m.r, hw = T.HW - r, hl = T.HL - r, cr = Math.max(0, T.CORNER - r);
    x = clamp(x, -hw, hw);
    if (m.side === 0) y = clamp(y, T.LINE_GAP, hl); else y = clamp(y, -hl, -T.LINE_GAP);
    var ax = Math.abs(x), ay = Math.abs(y);
    if (cr > 0 && ax > hw - cr && ay > hl - cr) {
      var cx = (hw - cr) * (x < 0 ? -1 : 1), cy = (hl - cr) * (y < 0 ? -1 : 1), dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > cr) { x = cx + dx / d * cr; y = cy + dy / d * cr; }
    }
    out.x = x; out.y = y;
    return out;
  }
  var tmp = { x: 0, y: 0 };

  function moveMallets(w, dt, controls) {
    for (var s = 0; s < 2; s++) {
      var m = w.mallets[s], c = controls && controls[s];
      // Big mallet: the radius eases toward its size.
      if (m.bigT > 0) { m.bigT = Math.max(0, m.bigT - dt); if (!m.bigT) emit(w, 'powerEnd', 'big', s); }
      var wantR = m.bigT > 0 ? T.BIG_R : T.MALLET_R;
      m.r += (wantR - m.r) * Math.min(1, dt * 10);
      m.px = m.x; m.py = m.y;
      var tx = c && isFinite(c.x) ? c.x : m.x, ty = c && isFinite(c.y) ? c.y : m.y;
      var spd = c && c.spd > 0 ? Math.min(c.spd, m.maxSpd) : m.maxSpd;
      zone(m, tx, ty, tmp);
      var dx = tmp.x - m.x, dy = tmp.y - m.y, d = Math.sqrt(dx * dx + dy * dy), max = spd * dt;
      if (d > max && d > 0) { dx *= max / d; dy *= max / d; }
      m.x += dx; m.y += dy;
      zone(m, m.x, m.y, tmp); m.x = tmp.x; m.y = tmp.y;
      m.vx = dt > 0 ? (m.x - m.px) / dt : 0; m.vy = dt > 0 ? (m.y - m.py) / dt : 0;
    }
    // Two mallets meeting at the centre line push each other apart.
    var a = w.mallets[0], b = w.mallets[1], ddx = a.x - b.x, ddy = a.y - b.y, dd = Math.sqrt(ddx * ddx + ddy * ddy), rr = a.r + b.r;
    if (dd < rr) {
      var push = (rr - dd) / 2 + 0.01;
      a.y += push; b.y -= push;
      zone(a, a.x, a.y, tmp); a.x = tmp.x; a.y = tmp.y;
      zone(b, b.x, b.y, tmp); b.x = tmp.x; b.y = tmp.y;
    }
  }

  // Puck against one mallet during a sub-step: the mallet goes from (ax, ay) to (bx, by)
  // while the puck goes from (x0, y0) to its current position. Returns true on a hit.
  function sweptMallet(w, p, m, x0, y0, ax, ay, bx, by, h) {
    var R = p.r + m.r;
    var rx0 = x0 - ax, ry0 = y0 - ay;               // relative position at the sub-step start
    var rx1 = p.x - bx, ry1 = p.y - by;             // and at its end
    var dx = rx1 - rx0, dy = ry1 - ry0;
    var t;
    var c0 = rx0 * rx0 + ry0 * ry0 - R * R;
    if (c0 <= 0) t = 0;
    else {
      var A = dx * dx + dy * dy, B = 2 * (rx0 * dx + ry0 * dy);
      if (A < 1e-9) return false;
      var disc = B * B - 4 * A * c0;
      if (disc < 0) return false;
      t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0 || t > 1) return false;
    }
    // Contact point: puck on the mallet's rim at time t.
    var mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
    var nx = rx0 + dx * t, ny = ry0 + dy * t, n = Math.sqrt(nx * nx + ny * ny);
    if (n < 1e-6) { nx = 0; ny = m.side === 0 ? -1 : 1; n = 1; }
    nx /= n; ny /= n;
    var mvx = m.vx, mvy = m.vy;
    var rvx = p.vx - mvx, rvy = p.vy - mvy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      var j = -(1 + T.MALLET_E) * vn;
      p.vx += j * nx; p.vy += j * ny;
      capSpeed(p);
      if (j > 40 && p.hitCd <= 0) { emit(w, 'hit', m.side, j, p.x, p.y); p.hitCd = 0.06; w.hits[m.side]++; }
      p.last = m.side;
    } else if (c0 <= 0) p.last = m.side;
    // Place the puck at the contact and let it travel the rest of the sub-step: after the
    // impact it moves away from the mallet at least as fast as the mallet follows.
    var rest = (1 - t) * h;
    p.x = mx + nx * R + p.vx * rest;
    p.y = my + ny * R + p.vy * rest;
    // Never end a sub-step inside the mallet.
    var ex = p.x - bx, ey = p.y - by, e = Math.sqrt(ex * ex + ey * ey);
    if (e < R) {
      if (e < 1e-6) { ex = nx; ey = ny; e = 1; }
      p.x = bx + ex / e * (R + 0.01); p.y = by + ey / e * (R + 0.01);
    }
    return true;
  }

  function capSpeed(p) {
    var s = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (s > T.MAX_PUCK) { p.vx *= T.MAX_PUCK / s; p.vy *= T.MAX_PUCK / s; }
  }

  function bounce(w, p, nx, ny, kind) {
    var vn = p.vx * nx + p.vy * ny;
    if (vn < 0) {
      p.vx -= (1 + T.WALL_E) * vn * nx; p.vy -= (1 + T.WALL_E) * vn * ny;
      if (-vn > 60 && p.wallCd <= 0) { emit(w, kind, -vn, p.x, p.y); p.wallCd = 0.05; }
    }
  }

  // Walls, rounded corners, goal posts and the goal pockets. Normals point into the field.
  function collideWalls(w, p) {
    var r = p.r, sy = p.y < 0 ? -1 : 1, g = w.goals[sy > 0 ? 0 : 1], half = g.half;
    var ay = Math.abs(p.y);
    if (ay > T.HL) {
      // Inside a goal pocket: its side walls are the posts' lines.
      if (p.x - r < -half) { p.x = -half + r; bounce(w, p, 1, 0, 'post'); }
      if (p.x + r > half) { p.x = half - r; bounce(w, p, -1, 0, 'post'); }
    } else {
      if (p.x - r < -T.HW) { p.x = -T.HW + r; bounce(w, p, 1, 0, 'wall'); }
      if (p.x + r > T.HW) { p.x = T.HW - r; bounce(w, p, -1, 0, 'wall'); }
      if (ay + r > T.HL && Math.abs(p.x) >= half) { p.y = sy * (T.HL - r); bounce(w, p, 0, -sy, 'wall'); }
      var cr = T.CORNER, ax = Math.abs(p.x);
      ay = Math.abs(p.y);
      if (ax > T.HW - cr && ay > T.HL - cr) {
        var cx = (T.HW - cr) * (p.x < 0 ? -1 : 1), cy = (T.HL - cr) * sy, dx = p.x - cx, dy = p.y - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > cr - r && d > 0) {
          var nx = dx / d, ny = dy / d;
          p.x = cx + nx * (cr - r); p.y = cy + ny * (cr - r);
          bounce(w, p, -nx, -ny, 'wall');
        }
      }
    }
    // Posts: the two ends of each goal mouth.
    for (var k = -1; k <= 1; k += 2) {
      var px = k * half, py = sy * T.HL, ex = p.x - px, ey = p.y - py, e = Math.sqrt(ex * ex + ey * ey), R = r + T.POST_R;
      if (e < R && e > 1e-6) {
        p.x = px + ex / e * R; p.y = py + ey / e * R;
        bounce(w, p, ex / e, ey / e, 'post');
      }
    }
  }

  // A mallet may not squeeze the puck into a wall: it is pushed back instead.
  function unsqueeze(p, m) {
    var dx = m.x - p.x, dy = m.y - p.y, d = Math.sqrt(dx * dx + dy * dy), R = p.r + m.r;
    if (d < R) {
      if (d < 1e-6) { dx = 0; dy = m.side === 0 ? 1 : -1; d = 1; }
      m.x = p.x + dx / d * (R + 0.01); m.y = p.y + dy / d * (R + 0.01);
      zone(m, m.x, m.y, tmp); m.x = tmp.x; m.y = tmp.y;
    }
  }

  function scoreGoal(w, p, intoSide) {
    var scorer = 1 - intoSide;
    p.alive = false;
    w.score[scorer]++;
    w.lastGoal = scorer;
    emit(w, 'goal', scorer, p.x, p.y, p.i);
    if (w.score[scorer] >= w.target) {
      w.winner = scorer;
      for (var i = 0; i < w.pucks.length; i++) w.pucks[i].alive = false;
      w.item.alive = false;
      w.phase = 'goal'; w.phaseT = w.goalDelay + 0.6;
    } else if (!aliveCount(w)) {
      w.phase = 'goal'; w.phaseT = w.goalDelay;
      w.serveSide = intoSide;
    }
  }

  function simulatePucks(w, dt) {
    var i, s, p, maxDisp = 0, ms = w.mallets;
    for (i = 0; i < w.pucks.length; i++) {
      p = w.pucks[i];
      if (!p.alive) continue;
      p.hitCd -= dt; p.wallCd -= dt;
      // A puck that creeps into a goal mouth is drawn in rather than left out of reach.
      if (Math.abs(p.y) > T.HL - p.r && Math.abs(p.x) < w.goals[p.y > 0 ? 0 : 1].half) p.vy += (p.y > 0 ? 1 : -1) * 500 * dt;
      maxDisp = Math.max(maxDisp, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * dt);
    }
    for (s = 0; s < 2; s++) maxDisp = Math.max(maxDisp, Math.abs(ms[s].x - ms[s].px) + Math.abs(ms[s].y - ms[s].py));
    var n = clamp(Math.ceil(maxDisp / (T.PUCK_R * 0.4)), 1, 64), h = dt / n;
    for (var k = 1; k <= n; k++) {
      var f0 = (k - 1) / n, f1 = k / n;
      for (i = 0; i < w.pucks.length; i++) {
        p = w.pucks[i];
        if (!p.alive) continue;
        var x0 = p.x, y0 = p.y;
        p.x += p.vx * h; p.y += p.vy * h;
        for (s = 0; s < 2; s++) {
          var m = ms[s];
          sweptMallet(w, p, m, x0, y0, m.px + (m.x - m.px) * f0, m.py + (m.y - m.py) * f0, m.px + (m.x - m.px) * f1, m.py + (m.y - m.py) * f1, h);
        }
        collideWalls(w, p);
        if (Math.abs(p.y) > T.HL + p.r * 0.6) { scoreGoal(w, p, p.y > 0 ? 0 : 1); if (w.winner >= 0) return; }
      }
    }
    for (i = 0; i < w.pucks.length; i++) {
      p = w.pucks[i];
      if (!p.alive) continue;
      var decay = Math.exp(-T.FRICTION * dt);
      p.vx *= decay; p.vy *= decay;
      capSpeed(p);
      for (s = 0; s < 2; s++) unsqueeze(p, ms[s]);
      if (!isFinite(p.x) || !isFinite(p.y) || Math.abs(p.x) > T.HW + 40 || Math.abs(p.y) > T.HL + 80) { p.alive = false; if (!aliveCount(w)) serve(w, w.serveSide); }
    }
  }

  // During the serve the puck waits; mallets that run into it are held off.
  function holdServe(w) {
    var p = w.pucks[0];
    for (var s = 0; s < 2; s++) unsqueeze(p, w.mallets[s]);
  }

  function spawnItem(w) {
    var it = w.item;
    var kinds = aliveCount(w) > 1 ? ['big', 'mini'] : KINDS;
    it.kind = kinds[Math.floor(w.rand() * kinds.length) % kinds.length];
    for (var tries = 0; tries < 8; tries++) {
      it.x = (w.rand() - 0.5) * 320; it.y = (w.rand() - 0.5) * 220;
      var clear = true;
      for (var i = 0; i < w.pucks.length; i++) { var p = w.pucks[i]; if (p.alive && Math.abs(p.x - it.x) + Math.abs(p.y - it.y) < 110) clear = false; }
      if (clear) break;
    }
    it.alive = true; it.t = 0;
    emit(w, 'item', it.kind, it.x, it.y);
  }

  function applyItem(w, side, p) {
    var it = w.item, kind = it.kind;
    it.alive = false;
    if (kind === 'big') w.mallets[side].bigT = T.POWER_T;
    else if (kind === 'mini') { w.goals[side].miniT = T.POWER_T; }
    else if (kind === 'multi') {
      var dir = side === 0 ? -1 : 1, made = 0;
      for (var i = 0; i < w.pucks.length && made < 2; i++) {
        var q = w.pucks[i];
        if (q.alive) continue;
        var ang = (made ? 0.55 : -0.55) + (w.rand() - 0.5) * 0.2, sp = 520;
        q.alive = true; q.x = clamp(it.x + (made ? 40 : -40), -T.HW + 30, T.HW - 30); q.y = it.y;
        q.vx = Math.sin(ang) * sp; q.vy = dir * Math.cos(ang) * sp; q.last = side; q.hitCd = q.wallCd = 0;
        made++;
      }
    }
    emit(w, 'power', kind, side, it.x, it.y);
  }

  function updateItems(w, dt) {
    for (var s = 0; s < 2; s++) {
      var g = w.goals[s];
      if (g.miniT > 0) { g.miniT = Math.max(0, g.miniT - dt); if (!g.miniT) emit(w, 'powerEnd', 'mini', s); }
      var want = g.miniT > 0 ? T.MINI_HALF : T.GOAL_HALF;
      // The goal closes quickly but never over a puck already in its mouth.
      var busy = false;
      for (var i = 0; i < w.pucks.length; i++) { var q = w.pucks[i]; if (q.alive && Math.abs(q.y) > T.HL - q.r - 4 && (q.y > 0) === (s === 0)) busy = true; }
      if (!busy) g.half += (want - g.half) * Math.min(1, dt * 8);
    }
    if (!w.powerUps || w.phase !== 'play') return;
    var it = w.item;
    if (it.alive) {
      it.t += dt;
      if (it.t > T.ITEM_LIFE) { it.alive = false; emit(w, 'itemGone', it.kind, it.x, it.y); return; }
      for (var j = 0; j < w.pucks.length; j++) {
        var p = w.pucks[j];
        if (!p.alive || p.last < 0) continue;
        var dx = p.x - it.x, dy = p.y - it.y, R = p.r + T.ITEM_R;
        if (dx * dx + dy * dy < R * R) { applyItem(w, p.last, p); return; }
      }
    } else {
      w.itemClock -= dt;
      if (w.itemClock <= 0) { spawnItem(w); w.itemClock = 11 + w.rand() * 6; }
    }
  }

  function step(w, dt, controls) {
    w.events.length = 0;
    if (!(dt > 0)) return w;
    dt = Math.min(dt, 0.05);
    w.t += dt;
    moveMallets(w, dt, controls);
    if (w.phase === 'serve') {
      holdServe(w);
      w.phaseT -= dt;
      if (w.phaseT <= 0) { w.phase = 'play'; emit(w, 'go', w.serveSide); }
    } else if (w.phase === 'play') {
      simulatePucks(w, dt);
    } else if (w.phase === 'goal') {
      if (aliveCount(w)) simulatePucks(w, dt);
      w.phaseT -= dt;
      if (w.phaseT <= 0) {
        if (w.winner >= 0) { w.phase = 'over'; emit(w, 'over', w.winner); }
        else serve(w, w.serveSide);
      }
    }
    updateItems(w, dt);
    return w;
  }

  // Seconds until the soonest puck that is heading straight into a goal mouth crosses its
  // line (ignoring bounces), or -1. The UI uses it for slow motion on match point.
  function incoming(w, maxT) {
    var best = -1;
    for (var i = 0; i < w.pucks.length; i++) {
      var p = w.pucks[i];
      if (!p.alive || Math.abs(p.vy) < 1) continue;
      var sy = p.vy > 0 ? 1 : -1, t = (sy * T.HL - p.y) / p.vy;
      if (t < 0 || t > maxT) continue;
      var x = p.x + p.vx * t;
      if (Math.abs(x) < w.goals[sy > 0 ? 0 : 1].half - 4 && (best < 0 || t < best)) best = t;
    }
    return best;
  }

  function matchPoint(w) { return w.score[0] === w.target - 1 || w.score[1] === w.target - 1; }

  var AHEngine = {
    T: T, KINDS: KINDS, create: create, step: step, serve: serve, zone: zone, incoming: incoming,
    matchPoint: matchPoint, aliveCount: aliveCount, mulberry: mulberry, resetMallets: resetMallets
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AHEngine;
  else root.AHEngine = AHEngine;
})(typeof window !== 'undefined' ? window : this);
