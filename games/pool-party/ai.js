/*
 * Pool Party — CPU opponent (original code). Node-compatible.
 * Finds makeable shots with ghost-ball geometry, checks the best ones by actually
 * simulating them, then adds aiming "wobble" that depends on difficulty.
 * Work is split into small tasks so planning never freezes a frame.
 */
(function (root) {
  'use strict';
  var P = root.PoolPhysics || require('./physics.js');
  var Rules = root.PoolRules || require('./rules.js');
  var R = P.R;

  var LEVELS = {
    easy:   { noise: 0.028, speedNoise: 0.14, simTop: 3, spins: [0], powers: [1], place: 10, mistake: 0.25, safety: false, think: 1.0 },
    medium: { noise: 0.011, speedNoise: 0.07, simTop: 6, spins: [0, 0.6], powers: [0.85, 1.2], place: 24, mistake: 0.06, safety: true, think: 0.9 },
    hard:   { noise: 0.0035, speedNoise: 0.03, simTop: 9, spins: [0, 0.7, -0.7], powers: [0.75, 1, 1.4], place: 44, mistake: 0, safety: true, think: 0.8 }
  };
  var AI = { LEVELS: LEVELS };

  function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }

  function aimPoints(pk) {
    var pts = [];
    if (!pk.side) {
      var sx = pk.dirx < 0 ? -1 : 1, sy = pk.diry < 0 ? -1 : 1;
      var cx0 = sx < 0 ? P.TX0 : P.TX1, cy0 = sy < 0 ? P.TY0 : P.TY1;
      var fs = [0, -0.3, 0.3, -0.55, 0.55];
      for (var i = 0; i < fs.length; i++) pts.push([cx0 - sx * 5 + fs[i] * 28 * sx, cy0 - sy * 5 - fs[i] * 28 * sy]);
    } else {
      pts.push([pk.x, pk.ay], [pk.x - 7, pk.ay], [pk.x + 7, pk.ay]);
    }
    return pts;
  }
  AI.aimPoints = aimPoints;

  function inTable(x, y) {
    if (x > P.TX0 + R - 0.5 && x < P.TX1 - R + 0.5 && y > P.TY0 + R - 0.5 && y < P.TY1 - R + 0.5) return true;
    for (var k = 0; k < P.pockets.length; k++) if (Math.hypot(x - P.pockets[k].x, y - P.pockets[k].y) < P.pockets[k].r + 18) return true;
    return false;
  }

  function reqSpeed(d1, d2, cut) {
    var vo = Math.sqrt(2 * 330 * (d2 + 140));
    var vi = vo / Math.max(0.3, cut);
    var v0 = Math.sqrt(vi * vi + 2 * 420 * d1);
    return Math.max(260, Math.min(P.MAX_SPEED, v0));
  }

  // Geometric shot list for a cue ball at (cx, cy). Sorted best first.
  AI.candidates = function (st, cx, cy, targets) {
    var out = [];
    for (var i = 0; i < st.balls.length; i++) {
      var b = st.balls[i];
      if (!b.on || targets.indexOf(b.n) < 0) continue;
      for (var k = 0; k < P.pockets.length; k++) {
        var pk = P.pockets[k], pts = aimPoints(pk), bestForPocket = null;
        for (var a = 0; a < pts.length; a++) {
          var ax = pts[a][0], ay = pts[a][1];
          var dx = ax - b.x, dy = ay - b.y, d2 = Math.sqrt(dx * dx + dy * dy);
          if (d2 < 1) continue;
          dx /= d2; dy /= d2;
          if (pk.side && Math.abs(dy) < 0.42) continue;
          if (!pk.side && (dx * pk.dirx + dy * pk.diry) < 0.6) continue;
          var gx = b.x - dx * 2 * R, gy = b.y - dy * 2 * R;
          if (!inTable(gx, gy)) continue;
          var ux = gx - cx, uy = gy - cy, d1 = Math.sqrt(ux * ux + uy * uy);
          if (d1 < 1) continue;
          var cut = (ux * dx + uy * dy) / d1;
          if (cut < 0.22) continue;
          if (!P.clearPath(st, cx, cy, gx, gy, 0, b.n)) continue;
          if (!P.clearPath(st, b.x, b.y, ax, ay, b.n, 0)) continue;
          var ang = Math.atan2(uy, ux);
          var tr = P.trace(st, cx, cy, ang);
          if (!tr || tr.type !== 'ball' || tr.ball.n !== b.n) continue;
          var score = cut * cut * (1 / (1 + d1 / 700 + d2 / 520)) * (pk.side ? 0.85 : 1);
          if (a > 0) score *= 0.92;
          if (!bestForPocket || score > bestForPocket.score) {
            bestForPocket = { ang: ang, n: b.n, pocket: k, score: score, speed: reqSpeed(d1, d2, cut), cut: cut };
          }
        }
        if (bestForPocket) out.push(bestForPocket);
      }
    }
    out.sort(function (p, q) { return q.score - p.score; });
    return out;
  };

  function bestScore(st, cx, cy, targets) {
    var c = AI.candidates(st, cx, cy, targets);
    return c.length ? c[0].score : 0;
  }

  function simulateShot(st, match, legal, place, ang, speed, sx, sy) {
    var s = P.clone(st);
    var cue = P.ball(s, 0);
    if (place) { cue.x = place.x; cue.y = place.y; cue.on = true; }
    P.shoot(s, ang, speed, sx, sy);
    var shot = P.simulate(s, 25);
    var res = Rules.judge(match, legal, shot);
    return { st: s, shot: shot, res: res };
  }

  function valueOf(sim, match, lv) {
    var r = sim.res;
    if (r.win) return 1000;
    if (r.lose) return -1000;
    if (r.foul) return -120;
    if (!r.keepTurn) return -10;
    var groups = [match.groups[0], match.groups[1]];
    if (r.assign) groups[match.turn] = r.assign;
    var m2 = { groups: groups, turn: match.turn, isBreak: false };
    var cue = P.ball(sim.st, 0);
    var next = Rules.targets(sim.st, m2, match.turn);
    var pos = cue.on ? bestScore(sim.st, cue.x, cue.y, next) : 0;
    return 100 + 120 * pos;
  }

  // Build a planner. opts: { inHand, kitchen, isBreak }. Call planner.step(ms) until planner.done.
  AI.planner = function (st, match, levelName, opts, rand) {
    rand = rand || Math.random;
    var lv = LEVELS[levelName] || LEVELS.medium;
    opts = opts || {};
    var me = { done: false, result: null, thinkTime: lv.think };
    var legal = Rules.targets(st, match, match.turn);
    var tasks = [];
    var place = null;
    var cands = [];
    var best = null;

    function consider(val, ang, speed, sx, sy) {
      if (!best || val > best.val) best = { val: val, ang: ang, speed: speed, sx: sx, sy: sy };
    }

    if (opts.isBreak) {
      tasks.push(function () {
        var y = P.CY + (rand() - 0.5) * 60;
        place = { x: P.HEAD_X - 30 - rand() * 60, y: y };
        var apex = null, i;
        for (i = 0; i < st.balls.length; i++) if (st.balls[i].on && st.balls[i].n !== 0 && (!apex || st.balls[i].x < apex.x)) apex = st.balls[i];
        var ang = Math.atan2(apex.y - place.y, apex.x - place.x) + (rand() - 0.5) * 0.01;
        best = { val: 0, ang: ang, speed: P.MAX_SPEED * (levelName === 'easy' ? 0.85 : 1), sx: 0, sy: -0.2 };
      });
    } else {
      if (opts.inHand) {
        tasks.push(function () {
          // candidate spots: straight-in positions behind ghost balls, plus random ones
          var spots = [], i, k;
          for (i = 0; i < st.balls.length; i++) {
            var b = st.balls[i];
            if (!b.on || legal.indexOf(b.n) < 0) continue;
            for (k = 0; k < P.pockets.length; k++) {
              var pk = P.pockets[k];
              var dx = pk.ax - b.x, dy = pk.ay - b.y, d = Math.sqrt(dx * dx + dy * dy);
              dx /= d; dy /= d;
              var L = 70 + rand() * 140;
              var off = (rand() - 0.5) * 0.5;
              var ca = Math.cos(off), sa = Math.sin(off);
              var ex = dx * ca - dy * sa, ey = dx * sa + dy * ca;
              spots.push([b.x - ex * (2 * R + L), b.y - ey * (2 * R + L)]);
            }
          }
          for (i = 0; i < 12; i++) spots.push([P.TX0 + 40 + rand() * (P.TW - 80), P.TY0 + 40 + rand() * (P.TH - 80)]);
          // shuffle and cap
          for (i = spots.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
          spots.length = Math.min(spots.length, lv.place);
          var bestSpot = null, bestVal = -1;
          var cue = P.ball(st, 0), wasOn = cue.on, ox = cue.x, oy = cue.y;
          cue.on = false;
          for (i = 0; i < spots.length; i++) {
            var sx = spots[i][0], sy = spots[i][1];
            if (!P.canPlace(st, sx, sy, opts.kitchen)) continue;
            var v = bestScore(st, sx, sy, legal);
            if (v > bestVal) { bestVal = v; bestSpot = { x: sx, y: sy }; }
          }
          cue.on = wasOn; cue.x = ox; cue.y = oy;
          place = bestSpot || P.findPlace(st, P.HEAD_X - 60, P.CY, opts.kitchen);
        });
      }
      tasks.push(function () {
        var cue = P.ball(st, 0);
        var cx = place ? place.x : cue.x, cy = place ? place.y : cue.y;
        var wasOn = cue.on, ox = cue.x, oy = cue.y;
        cue.x = cx; cue.y = cy; cue.on = true;
        cands = AI.candidates(st, cx, cy, legal);
        cue.x = ox; cue.y = oy; cue.on = wasOn;
        if (lv.mistake && cands.length > 1 && rand() < lv.mistake) {
          // an easy CPU sometimes goes for a harder shot
          var pickI = Math.floor(rand() * Math.min(cands.length, 4));
          var c = cands.splice(pickI, 1)[0]; cands.unshift(c);
        }
        cands = cands.slice(0, lv.simTop);
        cands.forEach(function (c) {
          lv.powers.forEach(function (pw) {
            lv.spins.forEach(function (sp) {
              tasks.push(function () {
                var speed = Math.min(P.MAX_SPEED, c.speed * pw);
                var sim = simulateShot(st, match, legal, place, c.ang, speed, 0, sp);
                var v = valueOf(sim, match, lv) + c.score * 40;
                if (levelName === 'hard' && v > 90) {
                  // robustness check: does it still go in with a little wobble?
                  var s2 = simulateShot(st, match, legal, place, c.ang + 0.004, speed, 0, sp);
                  var s3 = simulateShot(st, match, legal, place, c.ang - 0.004, speed, 0, sp);
                  if (!s2.res.keepTurn && !s2.res.win) v -= 60;
                  if (!s3.res.keepTurn && !s3.res.win) v -= 60;
                }
                consider(v, c.ang, speed, 0, sp);
              });
            });
          });
        });
        tasks.push(function () {
          if (best && best.val > 50) return;
          // no good pot: make sure we at least hit a legal ball (direct, then off the cushions)
          var cue2 = P.ball(st, 0), cx2 = place ? place.x : cue2.x, cy2 = place ? place.y : cue2.y;
          var directOk = false;
          for (var i = 0; i < st.balls.length; i++) {
            var b = st.balls[i];
            if (!b.on || legal.indexOf(b.n) < 0) continue;
            var d = Math.hypot(b.x - cx2, b.y - cy2), base = Math.atan2(b.y - cy2, b.x - cx2);
            var half = Math.asin(Math.min(1, 2 * R / Math.max(d, 2 * R)));
            [0, 0.45, -0.45, 0.8, -0.8].forEach(function (f) {
              var ang = base + f * half;
              var wasOn = cue2.on, ox = cue2.x, oy = cue2.y;
              cue2.x = cx2; cue2.y = cy2; cue2.on = true;
              var tr = P.trace(st, cx2, cy2, ang);
              cue2.x = ox; cue2.y = oy; cue2.on = wasOn;
              if (!tr || tr.type !== 'ball' || legal.indexOf(tr.ball.n) < 0) return;
              directOk = true;
              tasks.push(function () {
                var sp = 700 + rand() * 500;
                var sim = simulateShot(st, match, legal, place, ang, sp, 0, 0);
                consider(valueOf(sim, match, lv) - 5, ang, sp, 0, 0);
              });
            });
          }
          if (!directOk && lv.safety) {
            for (var a = 0; a < 120; a++) {
              (function (ai) {
                tasks.push(function () {
                  var ang = ai / 120 * Math.PI * 2;
                  var sim = simulateShot(st, match, legal, place, ang, 1300, 0, 0);
                  consider(valueOf(sim, match, lv) - 8, ang, 1300, 0, 0);
                });
              })(a);
            }
          }
          tasks.push(function () {
            if (best) return;
            var nb = null, nd = 1e9;
            for (var j = 0; j < st.balls.length; j++) {
              var q = st.balls[j];
              if (!q.on || legal.indexOf(q.n) < 0) continue;
              var dq = Math.hypot(q.x - cx2, q.y - cy2);
              if (dq < nd) { nd = dq; nb = q; }
            }
            consider(-200, nb ? Math.atan2(nb.y - cy2, nb.x - cx2) : rand() * 6.28, 1100, 0, 0);
          });
        });
      });
    }

    me.step = function (budget) {
      var t0 = now();
      while (tasks.length && now() - t0 < budget) tasks.shift()();
      if (!tasks.length && !me.done) {
        if (!best) best = { ang: 0, speed: 900, sx: 0, sy: 0 };
        var ang = best.ang, speed = best.speed;
        if (!opts.isBreak) {
          ang += gauss(rand) * lv.noise;
          speed *= 1 + gauss(rand) * lv.speedNoise;
        }
        me.result = { angle: ang, speed: Math.max(150, Math.min(P.MAX_SPEED, speed)), spinX: best.sx, spinY: best.sy, place: place };
        me.done = true;
      }
      return me.done;
    };
    return me;
  };

  function gauss(rand) {
    var u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  root.PoolAI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
