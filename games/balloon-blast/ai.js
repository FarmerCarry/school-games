/* Balloon Blast — smart bot, minion, danger-map, and BFS pathfinding AI. */
(function () {
  'use strict';

  var E = (typeof globalThis !== 'undefined' && globalThis.BBEngine) || (typeof require === 'function' ? require('./engine.js') : null);
  var COLS = E.COLS, ROWS = E.ROWS, N = COLS * ROWS, TILE = E.TILE, DIRS = E.DIRS;
  var DELAY = [0.42, 0.30, 0.20, 0.13, 0.09];
  var GREED = [0.28, 0.45, 0.65, 0.82, 0.94];
  var AGGR = [0.20, 0.38, 0.58, 0.78, 0.92];
  var GOOF = [0.36, 0.20, 0.06, 0.01, 0.0];
  var KICK_CHANCE = [0.0, 0.08, 0.35, 0.68, 0.90];
  var BBAI = {};

  function idx(c, r) { return r * COLS + c; }
  function inside(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
  function tierIdx(p) { return Math.max(1, Math.min(5, p.tier || 3)) - 1; }

  function dangerRay(w, c, r, range) {
    var cells = [{ c: c, r: r }];
    for (var d = 0; d < 4; d++) {
      for (var i = 1; i <= range; i++) {
        var cc = c + DIRS[d][0] * i, rr = r + DIRS[d][1] * i;
        if (!inside(cc, rr)) break;
        var t = E.tile(w, cc, rr);
        if (t === E.PILLAR || t === E.JELLY) break;
        cells.push({ c: cc, r: rr });
      }
    }
    return cells;
  }

  function predictBalloon(w, b) {
    if (b.lob) return { c: b.lob.tc, r: b.lob.tr, fuse: Math.max(0, b.fuse) + Math.max(0, b.lob.dur - b.lob.t), range: b.range };
    if (b.slide < 0) return { c: b.c, r: b.r, fuse: Math.max(0, b.fuse), range: b.range };
    var x = b.x, y = b.y, c = b.c, r = b.r, dc = DIRS[b.slide][0], dr = DIRS[b.slide][1];
    var fuse = Math.max(0, b.fuse), steps = Math.max(1, Math.ceil(fuse / 0.05)), dt = fuse / steps;
    for (var s = 0; s < steps; s++) {
      var nx = x + dc * E.KICK_SPD * dt, ny = y + dr * E.KICK_SPD * dt;
      var nc = Math.floor(nx / TILE), nr = Math.floor(ny / TILE);
      if (!inside(nc, nr) || E.solid(E.tile(w, nc, nr))) break;
      var hit = false;
      for (var i = 0; i < w.balloons.length; i++) {
        var o = w.balloons[i];
        if (o !== b && !o.gone && !o.lob && o.c === nc && o.r === nr) { hit = true; break; }
      }
      if (hit) break;
      x = nx; y = ny; c = nc; r = nr;
    }
    return { c: c, r: r, fuse: fuse, range: b.range };
  }

  BBAI.danger = function (w, extra) {
    var bombs = [];
    for (var i = 0; i < w.balloons.length; i++) if (!w.balloons[i].gone) bombs.push(predictBalloon(w, w.balloons[i]));
    if (extra) bombs.push(extra);
    var when = new Float64Array(bombs.length);
    for (var k = 0; k < bombs.length; k++) when[k] = bombs[k].fuse;
    var map = new Float64Array(N); map.fill(Infinity);
    for (var pass = 0; pass < 5; pass++) {
      var changed = false;
      for (var b = 0; b < bombs.length; b++) {
        var cells = dangerRay(w, bombs[b].c, bombs[b].r, bombs[b].range);
        for (var m = 0; m < cells.length; m++) {
          var cell = cells[m], at = idx(cell.c, cell.r);
          if (when[b] < map[at]) map[at] = when[b];
          for (var j = 0; j < bombs.length; j++) {
            if (j !== b && bombs[j].c === cell.c && bombs[j].r === cell.r && when[b] < when[j] - 1e-4) {
              when[j] = when[b]; changed = true;
            }
          }
        }
      }
      if (!changed && pass > 0) break;
    }
    return map;
  };

  function walkable(w, c, r, startCell) {
    if (!inside(c, r) || E.solid(E.tile(w, c, r))) return false;
    for (var i = 0; i < w.balloons.length; i++) {
      var b = w.balloons[i];
      if (!b.gone && !b.lob && b.c === c && b.r === r) {
        if (startCell && startCell.c === c && startCell.r === r) continue;
        return false;
      }
    }
    return true;
  }
  BBAI.walkable = walkable;

  BBAI.fleeStep = function (w, p, danger, opts) {
    opts = opts || {};
    var forever = !!opts.forever, maxDist = opts.maxDist || 12, margin = opts.margin == null ? 0.22 : opts.margin;
    var start = E.cellOf(p), stepT = TILE / E.speedOf(p), sIdx = idx(start.c, start.r);
    var q = [[start.c, start.r, 0]], seen = new Uint8Array(N), parent = new Int16Array(N);
    parent.fill(-1); seen[sIdx] = 1;
    var found = -1, goalC = -1, goalR = -1, best = -1, bestD = -1;
    while (q.length) {
      var cur = q.shift(), c = cur[0], r = cur[1], dist = cur[2];
      var arrive = dist * stepT, dang = danger[idx(c, r)];
      if (dist > 0 && arrive > dang - margin) continue;
      if (dist > 0 && (dang === Infinity || (!forever && dang > arrive + 0.75))) { found = idx(c, r); goalC = c; goalR = r; break; }
      if (dist > 0 && dang > bestD) { bestD = dang; best = idx(c, r); }
      if (dist >= maxDist) continue;
      for (var d = 0; d < 4; d++) {
        var nc = c + DIRS[d][0], nr = r + DIRS[d][1];
        if (!walkable(w, nc, nr, start)) continue;
        var ni = idx(nc, nr);
        if (seen[ni]) continue;
        seen[ni] = 1; parent[ni] = idx(c, r); q.push([nc, nr, dist + 1]);
      }
    }
    if (found < 0) found = forever ? -1 : best;
    if (found < 0 || found === sIdx) return null;
    var at = found;
    while (parent[at] !== -1 && parent[at] !== sIdx) at = parent[at];
    return { c: at % COLS, r: Math.floor(at / COLS), goalC: goalC, goalR: goalR };
  };

  BBAI.canEscape = function (w, p) {
    var here = E.cellOf(p);
    var danger = BBAI.danger(w, { c: here.c, r: here.r, fuse: w.fuse, range: p.range });
    var step = BBAI.fleeStep(w, p, danger, { forever: true, maxDist: 4, margin: 0.48 });
    if (!step) return null;
    for (var i = 0; i < w.players.length; i++) {
      var o = w.players[i];
      if (o === p || o.state !== 'play') continue;
      var oc = E.cellOf(o);
      if ((oc.c === step.c && oc.r === step.r) || (step.goalC >= 0 && Math.abs(oc.c - step.goalC) + Math.abs(oc.r - step.goalR) <= 1)) return null;
    }
    return step;
  };

  BBAI.pathStep = function (w, sc, sr, gc, gr, danger) {
    if (sc === gc && sr === gr) return null;
    var sIdx = idx(sc, sr), q = [[sc, sr]], seen = new Uint8Array(N), parent = new Int16Array(N);
    parent.fill(-1); seen[sIdx] = 1;
    var startCell = { c: sc, r: sr }, target = -1, best = -1, bestM = Math.abs(gc - sc) + Math.abs(gr - sr);
    while (q.length) {
      var cur = q.shift(), c = cur[0], r = cur[1], ci = idx(c, r);
      if (c === gc && r === gr) { target = ci; break; }
      var md = Math.abs(gc - c) + Math.abs(gr - r);
      if (ci !== sIdx && md < bestM) { bestM = md; best = ci; }
      for (var d = 0; d < 4; d++) {
        var nc = c + DIRS[d][0], nr = r + DIRS[d][1], ni = idx(nc, nr);
        if (!walkable(w, nc, nr, startCell) || seen[ni] || (danger && danger[ni] < 1.15)) continue;
        seen[ni] = 1; parent[ni] = ci; q.push([nc, nr]);
      }
      if (w.pipes && w.pipes.length >= 2 && E.tile(w, c, r) === E.PIPE) {
        for (var pi = 0; pi < w.pipes.length; pi++) {
          if (w.pipes[pi].c === c && w.pipes[pi].r === r) {
            var twin = w.pipes[(pi + 1) % w.pipes.length], ti = idx(twin.c, twin.r);
            if (!seen[ti] && (!danger || danger[ti] >= 1.25)) { seen[ti] = 1; parent[ti] = ci; q.push([twin.c, twin.r]); }
          }
        }
      }
    }
    var pick = target >= 0 ? target : best;
    if (pick < 0 || pick === sIdx) return null;
    var at = pick;
    while (parent[at] !== -1 && parent[at] !== sIdx) at = parent[at];
    return { c: at % COLS, r: Math.floor(at / COLS) };
  };

  function steerTo(p, c, r) {
    var here = E.cellOf(p);
    if (here.c !== c) return { x: Math.sign(c - here.c), y: 0 };
    if (here.r !== r) return { x: 0, y: Math.sign(r - here.r) };
    var cx = E.center(c), cy = E.center(r);
    if (Math.abs(p.x - cx) > 4) return { x: Math.sign(cx - p.x), y: 0 };
    if (Math.abs(p.y - cy) > 4) return { x: 0, y: Math.sign(cy - p.y) };
    return { x: 0, y: 0 };
  }
  BBAI.steerTo = steerTo;

  function nearestFoe(w, p) {
    var here = E.cellOf(p), best = null, bd = 999;
    for (var i = 0; i < w.players.length; i++) {
      var o = w.players[i];
      if (o === p || o.team === p.team || o.state !== 'play') continue;
      var oc = E.cellOf(o), d = Math.abs(oc.c - here.c) + Math.abs(oc.r - here.r);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function thinkMob(w, p, danger) {
    var here = E.cellOf(p);
    if (p.mob !== 'crab' && danger[idx(here.c, here.r)] < w.fuse + 0.1) {
      var esc = BBAI.fleeStep(w, p, danger, { forever: true });
      if (esc) { var sd = steerTo(p, esc.c, esc.r); return { x: sd.x, y: sd.y, drop: false, kick: false }; }
    }
    var foe = nearestFoe(w, p);
    if (foe && w.rand() < (p.mob === 'crab' ? 0.55 : 0.8)) {
      var fc = E.cellOf(foe), step = BBAI.pathStep(w, here.c, here.r, fc.c, fc.r, p.mob === 'crab' ? null : danger);
      if (step) {
        var canBomb = (p.mob === 'bot' || p.mob === 'suds') && Math.abs(fc.c - here.c) + Math.abs(fc.r - here.r) <= 2 && w.rand() < 0.25 && BBAI.canEscape(w, p);
        var mv = steerTo(p, step.c, step.r);
        return { x: mv.x, y: mv.y, drop: !!canBomb, kick: false };
      }
    }
    var opts = [];
    for (var d = 0; d < 4; d++) {
      var nc = here.c + DIRS[d][0], nr = here.r + DIRS[d][1];
      if (walkable(w, nc, nr, here)) opts.push({ c: nc, r: nr });
    }
    if (!opts.length) return { x: 0, y: 0, drop: false, kick: false };
    var pick = opts[Math.floor(w.rand() * opts.length)], st = steerTo(p, pick.c, pick.r);
    return { x: st.x, y: st.y, drop: false, kick: false };
  }

  function thinkBot(w, p, danger) {
    var ti = tierIdx(p), here = E.cellOf(p), hereD = danger[idx(here.c, here.r)];
    p.urgent = hereD < w.fuse + 0.25;
    if (p.urgent) {
      var flee = BBAI.fleeStep(w, p, danger, { forever: true }) || BBAI.fleeStep(w, p, danger, { forever: false });
      if (flee) { var fd = steerTo(p, flee.c, flee.r); return { x: fd.x, y: fd.y, drop: false, kick: false }; }
      return { x: 0, y: 0, drop: false, kick: false };
    }
    var rand = w.rand;
    if (rand() < GOOF[ti]) {
      var dirs = [];
      for (var gd = 0; gd < 4; gd++) {
        var gc = here.c + DIRS[gd][0], gr = here.r + DIRS[gd][1];
        if (walkable(w, gc, gr, here) && danger[idx(gc, gr)] === Infinity) dirs.push({ c: gc, r: gr });
      }
      if (dirs.length) { var gp = dirs[Math.floor(rand() * dirs.length)], gm = steerTo(p, gp.c, gp.r); return { x: gm.x, y: gm.y, drop: false, kick: false }; }
    }
    var goal = null, wantBomb = false;
    if (rand() < GREED[ti]) {
      var bestDrop = null, bDist = 99;
      for (var di = 0; di < w.drops.length; di++) {
        var drp = w.drops[di], dd = Math.abs(drp.c - here.c) + Math.abs(drp.r - here.r);
        if (!drp.dead && dd < bDist && danger[idx(drp.c, drp.r)] === Infinity) { bDist = dd; bestDrop = drp; }
      }
      if (bestDrop && bDist <= 9) goal = { c: bestDrop.c, r: bestDrop.r };
    }
    var foe = nearestFoe(w, p);
    if (!goal && foe && rand() < AGGR[ti]) {
      var fc = E.cellOf(foe);
      if ((fc.c === here.c || fc.r === here.r) && (Math.abs(fc.c - here.c) + Math.abs(fc.r - here.r) <= p.range + 1)) {
        goal = { c: here.c, r: here.r }; wantBomb = true;
      } else goal = { c: fc.c, r: fc.r };
    }
    if (!goal) {
      var bestStand = null, cDist = 999;
      for (var r = 1; r < ROWS - 1; r++) for (var c = 1; c < COLS - 1; c++) {
        if (E.tile(w, c, r) !== E.CRATE) continue;
        for (var sd = 0; sd < 4; sd++) {
          var sc = c + DIRS[sd][0], sr = r + DIRS[sd][1], cd = Math.abs(sc - here.c) + Math.abs(sr - here.r);
          if (walkable(w, sc, sr, here) && danger[idx(sc, sr)] === Infinity && cd < cDist) { cDist = cd; bestStand = { c: sc, r: sr }; }
        }
      }
      if (bestStand) { goal = bestStand; if (here.c === bestStand.c && here.r === bestStand.r) wantBomb = true; }
    }
    if (!goal && foe) { var fc2 = E.cellOf(foe); goal = { c: fc2.c, r: fc2.r }; }
    for (var ad = 0; ad < 4; ad++) {
      if (E.tile(w, here.c + DIRS[ad][0], here.r + DIRS[ad][1]) === E.CRATE && (!goal || (goal.c === here.c && goal.r === here.r))) wantBomb = true;
    }
    var drop = false;
    if (wantBomb) {
      var esc = BBAI.canEscape(w, p);
      if (esc) { drop = true; goal = { c: esc.c, r: esc.r }; }
    }
    var kick = false;
    if (p.kick && rand() < KICK_CHANCE[ti]) {
      var kdc = DIRS[p.face][0], kdr = DIRS[p.face][1];
      for (var bi = 0; bi < w.balloons.length; bi++) {
        var bl = w.balloons[bi];
        if (!bl.gone && bl.slide < 0 && bl.c === here.c + kdc && bl.r === here.r + kdr) kick = true;
      }
    }
    if (!goal) return { x: 0, y: 0, drop: drop, kick: kick };
    var next = (goal.c === here.c && goal.r === here.r) ? goal : (BBAI.pathStep(w, here.c, here.r, goal.c, goal.r, danger) || goal);
    var mv = steerTo(p, next.c, next.r), testC = here.c + mv.x, testR = here.r + mv.y;
    if ((mv.x || mv.y) && inside(testC, testR) && danger[idx(testC, testR)] < 1.15) return { x: 0, y: 0, drop: false, kick: kick };
    return { x: mv.x, y: mv.y, drop: drop, kick: kick };
  }

  BBAI.inputs = function (w) {
    var out = [], danger = BBAI.danger(w);
    for (var i = 0; i < w.players.length; i++) {
      var p = w.players[i];
      if (!p.cpu || p.state !== 'play') { out.push({ x: 0, y: 0, drop: false, kick: false }); continue; }
      var here = E.cellOf(p), urgentNow = danger[idx(here.c, here.r)] < w.fuse + 0.25;
      if (!urgentNow && w.time < (p.nextThink || 0)) { out.push({ x: p.mx || 0, y: p.my || 0, drop: false, kick: false }); continue; }
      var dec = p.mob ? thinkMob(w, p, danger) : thinkBot(w, p, danger);
      p.mx = dec.x; p.my = dec.y;
      p.nextThink = w.time + (urgentNow ? 0 : (p.mob ? 0.24 : DELAY[tierIdx(p)]));
      out.push(dec);
    }
    return out;
  };

  BBAI.mix = function (w, humans) {
    var bots = BBAI.inputs(w);
    for (var i = 0; i < w.players.length; i++) if (humans && humans[i]) bots[i] = humans[i];
    return bots;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BBAI;
  if (typeof window !== 'undefined') window.BBAI = BBAI;
  globalThis.BBAI = BBAI;
})();
