/*
 * Air Hockey CPU brain: pure (no DOM, no Kit). The UI picks a skill 0..1 per opponent
 * (Kit.dda lives in game.js) and asks for a mallet target every fixed step:
 *
 *   var brain = AHAI.create(1, 0.4, seed);
 *   AHAI.think(brain, world, dt, control);   // fills control.x, control.y, control.spd
 *
 * The brain plays with the same mallet limits as a child: it only chooses where its
 * mallet should go, re-thinking every `react` seconds, and misjudges by `err` units.
 */
(function (root) {
  'use strict';

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Skill 0 is a sleepy beginner a five-year-old can beat; skill 1 is a sharp player.
  function params(s) {
    s = clamp(+s || 0, 0, 1);
    return {
      skill: s,
      spd: lerp(430, 2050, s),           // mallet speed
      react: lerp(0.34, 0.06, s),        // seconds between decisions
      err: lerp(85, 8, s),               // aim and read error
      predict: s >= 0.3,                 // reads wall bounces when defending
      attack: lerp(260, 1150, s),        // goes for pucks slower than this in its half
      strike: lerp(70, 150, s),          // how far through the puck it swings
      homeY: lerp(76, 64, s)             // distance of its guard spot from its goal line
    };
  }

  function create(side, skill, seed) {
    var a = (seed >>> 0) || 7;
    return {
      side: side, p: params(skill), t: 0, tx: 0, ty: 0, mode: 'home', errX: 0, errY: 0, stall: 0,
      rand: function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }
    };
  }

  function setSkill(brain, skill) { brain.p = params(skill); }

  // x where a puck reaches the line local y = lineY, bouncing off the side walls.
  function predictX(T, px, py, vx, vy, lineY, bounces) {
    if (vy <= 0) return px;
    var t = (lineY - py) / vy, x = px + vx * t;
    if (!bounces) return clamp(x, -T.HW + T.PUCK_R, T.HW - T.PUCK_R);
    var lo = -T.HW + T.PUCK_R, span = 2 * (T.HW - T.PUCK_R), u = (x - lo) % (2 * span);
    if (u < 0) u += 2 * span;
    return lo + (u > span ? 2 * span - u : u);
  }

  // Decide in local coordinates: the brain's own goal is at local y = +HL.
  function decide(b, w) {
    var T = w.T, s = b.side === 0 ? 1 : -1, P = b.p, m = w.mallets[b.side];
    var mx = m.x, my = m.y * s, R = m.r + T.PUCK_R;
    var best = null, bestScore = -1e9;
    for (var i = 0; i < w.pucks.length; i++) {
      var q = w.pucks[i];
      if (!q.alive) continue;
      var qy = q.y * s, qvy = q.vy * s;
      var danger = qy + (qvy > 0 ? qvy * 0.4 : 0);
      if (danger > bestScore) { bestScore = danger; best = q; }
    }
    b.errX = (b.rand() - 0.5) * 2 * P.err; b.errY = (b.rand() - 0.5) * P.err;
    var homeY = T.HL - P.homeY;
    if (!best || w.phase !== 'play') {
      var sx = best ? best.x * 0.3 : 0;
      b.mode = 'home'; b.tx = sx; b.ty = homeY; return;
    }
    var px = best.x, py = best.y * s, vx = best.vx, vy = best.vy * s, sp = Math.sqrt(vx * vx + vy * vy);
    if (py > -10 && sp < P.attack && vy < 160 + 140 * P.skill) {
      // Attack: the shot goes from the puck toward a spot in the opponent's goal mouth.
      var aimX = (b.rand() - 0.5) * 2 * Math.min(70, P.err + 30), aimY = -T.HL;
      var lead = 0.12 * (1 - P.skill * 0.5);
      var fx = px + vx * lead, fy = py + vy * lead;
      var dx = fx - aimX, dy = fy - aimY, d = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= d; dy /= d;                                  // from the aim spot through the puck
      var ux = fx - mx, uy = fy - my, ul = Math.sqrt(ux * ux + uy * uy) || 1;
      ux /= ul; uy /= ul;                                // from the mallet to the puck
      var align = -(ux * dx + uy * dy);                  // 1 when a swing now goes at the aim spot
      var stuck = b.stall > 1.1;
      if (!stuck && my < fy + R * 0.4) {
        // The puck is between the mallet and its own goal: go round it, never through it.
        // First step out to the side at the mallet's own depth, then drop in behind.
        var side = mx < fx ? -1 : 1;
        if (fx + side * (R + 30) > T.HW - m.r || fx + side * (R + 30) < -T.HW + m.r) side = -side;
        b.mode = 'round';
        if (Math.abs(mx - fx) < R + 18 && my > fy - R * 1.6) { b.tx = fx + side * (R + 34); b.ty = my - 6; }
        else { b.tx = fx + side * (R + 22); b.ty = fy + R + 24; }
      } else if (!stuck && align < lerp(0.5, 0.92, P.skill) && ul > R + 6) {
        // Line up behind the puck, in line with the aim.
        b.mode = 'setup'; b.tx = fx + dx * (R + 14); b.ty = fy + dy * (R + 14);
      } else {
        // Swing through the puck along the mallet-to-puck line. When stuck behind a wall,
        // never swing toward its own goal: push sideways instead.
        if (stuck && uy > 0.3) { ux = mx < fx ? 1 : -1; uy = 0; }
        b.mode = 'strike'; b.tx = fx + ux * P.strike + b.errX * 0.2; b.ty = fy + uy * P.strike;
      }
    } else if (vy > 0) {
      // Defend: meet the puck on a guard line in front of the goal.
      // Beginner rungs (0–1) guard wider and slightly further out instead of brick-walling center.
      var loose = P.skill < 0.45 ? 1 - P.skill / 0.45 : 0;
      var lineY = Math.min(homeY, Math.max(py + 20, T.HL - 230));
      var x = predictX(T, px, py, vx, vy, lineY, P.predict);
      var guardLim = T.GOAL_HALF + 30 + loose * 95;
      b.mode = 'guard'; b.tx = clamp(x + b.errX * (1 + loose * 0.5), -guardLim, guardLim); b.ty = lineY - loose * 45 + b.errY * 0.3;
    } else {
      var loose2 = P.skill < 0.45 ? 1 - P.skill / 0.45 : 0;
      b.mode = 'home'; b.tx = clamp(px * (0.35 + loose2 * 0.25) + b.errX * (0.3 + loose2 * 0.6), -T.HW + m.r + 12, T.HW - m.r - 12);
      b.ty = homeY - loose2 * 95;
    }
  }

  function think(b, w, dt, out) {
    b.t -= dt;
    b.stall = b.mode === 'round' || b.mode === 'setup' ? b.stall + dt : 0;
    if (b.stall > 1.6) b.stall = 0;
    if (b.t <= 0) { b.t = b.p.react * (0.75 + b.rand() * 0.5); decide(b, w); }
    var s = b.side === 0 ? 1 : -1;
    out.x = b.tx; out.y = b.ty * s;
    out.spd = b.mode === 'strike' ? b.p.spd : b.p.spd * (b.mode === 'home' ? 0.6 : b.mode === 'guard' ? 0.9 : 0.6);
    return out;
  }

  var AHAI = { create: create, think: think, params: params, setSkill: setSkill, predictX: predictX };
  if (typeof module !== 'undefined' && module.exports) module.exports = AHAI;
  else root.AHAI = AHAI;
})(typeof window !== 'undefined' ? window : this);
