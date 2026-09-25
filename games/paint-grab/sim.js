/* Paint Grab — simulation: grid territory, movement, trails, capture and bot AI.
   Pure logic (no DOM) so it can also run headless for balancing. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var PG = root.PG = root.PG || {};

  var TAU = Math.PI * 2;
  var SELF_GRACE = 4;          // own trail cells right behind the head are ignored
  function angDiff(a, b) { var d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  PG.angDiff = angDiff;

  function World(N, params) {
    this.N = N;
    this.NN = N * N;
    this.P = params;               // bot difficulty params
    this.owner = new Uint8Array(this.NN);
    this.trail = new Uint8Array(this.NN);
    this.comp = new Int32Array(this.NN);
    this.queue = new Int32Array(this.NN);
    this.agents = [null];          // index = id (1..)
    this.time = 0;
    this.events = [];
    this.pending = [];
    this.allowRespawn = true;
    this.onRespawn = null;         // function(agent) to set a new name/skin
    this.baseSpeed = PG.BASE_SPEED;
  }
  PG.World = World;

  World.prototype.addAgent = function (def) {
    var id = this.agents.length;
    var a = {
      id: id, isPlayer: !!def.isPlayer, name: def.name || '', skin: def.skin || null,
      x: 0, y: 0, ang: 0, target: 0, speed: this.baseSpeed * (def.speedMul || 1), turn: def.turn || 8,
      alive: false, home: true, trail: [], pts: [], cx: 0, cy: 0, cells: 0, sumX: 0, sumY: 0,
      kills: 0, respawnT: 0, trailStart: 0, personality: def.personality || 'greedy',
      brain: null, maxCells: 0, deaths: 0, spawnTime: 0
    };
    this.agents.push(a);
    return a;
  };

  World.prototype.setOwner = function (c, id) {
    var old = this.owner[c];
    if (old === id) return;
    var N = this.N, x = c % N, y = (c / N) | 0, a;
    if (old) { a = this.agents[old]; a.cells--; a.sumX -= x; a.sumY -= y; }
    this.owner[c] = id;
    if (id) { a = this.agents[id]; a.cells++; a.sumX += x; a.sumY += y; if (a.cells > a.maxCells) a.maxCells = a.cells; }
  };

  World.prototype.spawn = function (a, cx, cy, r) {
    var N = this.N, cells = [];
    r = r || 3.3;
    var ri = Math.ceil(r);
    for (var dy = -ri; dy <= ri; dy++) for (var dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      var x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      var c = y * N + x;
      var old = this.owner[c];
      this.setOwner(c, a.id);
      cells.push(c);
      if (old && old !== a.id && this.agents[old].alive && this.agents[old].cells === 0) this.pending.push({ v: old, k: a.id, r: 'swallow' });
    }
    a.x = cx + 0.5; a.y = cy + 0.5; a.cx = cx; a.cy = cy;
    a.ang = Math.random() * TAU; a.target = a.ang;
    a.alive = true; a.home = true; a.trail.length = 0; a.pts.length = 0;
    a.spawnTime = this.time; a.maxCells = a.cells;
    a.brain = PG.newBrain(this, a);
    this.events.push({ type: 'spawn', id: a.id, cells: cells, x: a.x, y: a.y });
  };

  // Find a nice open spot to (re)spawn.
  World.prototype.findSpawn = function (margin) {
    var N = this.N, best = null, bestS = -1e9;
    margin = margin || 8;
    for (var i = 0; i < 40; i++) {
      var x = Math.floor(rnd(margin, N - margin)), y = Math.floor(rnd(margin, N - margin));
      var s = 0;
      for (var dy = -5; dy <= 5; dy += 2) for (var dx = -5; dx <= 5; dx += 2) {
        var c = (y + dy) * N + (x + dx);
        if (this.owner[c] === 0) s += 1;
        if (this.trail[c]) s -= 6;
      }
      var md = 1e9;
      for (var k = 1; k < this.agents.length; k++) {
        var o = this.agents[k];
        if (!o.alive) continue;
        var d = Math.hypot(o.x - x, o.y - y);
        if (d < md) md = d;
      }
      s += Math.min(md, 30) * 0.8;
      if (s > bestS) { bestS = s; best = { x: x, y: y }; }
    }
    return best;
  };

  World.prototype.cellOf = function (a) { return a.cy * this.N + a.cx; };

  World.prototype.step = function (dt) {
    this.time += dt;
    var ags = this.agents, i, a;
    for (i = 1; i < ags.length; i++) {
      a = ags[i];
      if (a.alive) {
        if (!a.isPlayer) PG.think(this, a, dt);
        this.move(a, dt);
      }
    }
    this.resolve();
    // respawns
    for (i = 1; i < ags.length; i++) {
      a = ags[i];
      if (!a.alive && !a.isPlayer && a.respawnT > 0 && this.allowRespawn) {
        a.respawnT -= dt;
        if (a.respawnT <= 0) {
          var sp = this.findSpawn(8);
          if (this.onRespawn) this.onRespawn(a);
          this.spawn(a, sp.x, sp.y);
          this.resolve();
        }
      }
    }
  };

  World.prototype.resolve = function () {
    var p = this.pending;
    if (!p.length) return;
    for (var i = 0; i < p.length; i++) {
      var v = this.agents[p[i].v];
      if (v && v.alive) this.kill(v, p[i].k ? this.agents[p[i].k] : null, p[i].r);
    }
    p.length = 0;
  };

  World.prototype.move = function (a, dt) {
    var N = this.N;
    var d = angDiff(a.target, a.ang), mt = a.turn * dt;
    a.ang += d > mt ? mt : d < -mt ? -mt : d;
    if (a.ang > Math.PI) a.ang -= TAU; else if (a.ang < -Math.PI) a.ang += TAU;
    var dist = a.speed * dt;
    var n = Math.ceil(dist / 0.4);
    var sx = Math.cos(a.ang) * dist / n, sy = Math.sin(a.ang) * dist / n;
    for (var i = 0; i < n; i++) {
      var nx = a.x + sx, ny = a.y + sy, hx = false, hy = false;
      if (nx < 0.5) { nx = 0.5; hx = true; } else if (nx > N - 0.5) { nx = N - 0.5; hx = true; }
      if (ny < 0.5) { ny = 0.5; hy = true; } else if (ny > N - 0.5) { ny = N - 0.5; hy = true; }
      if (hx || hy) {
        // slide along the wall instead of getting stuck
        var step = dist / n, sgn;
        if (hx && !hy) {
          sgn = Math.abs(Math.sin(a.ang)) > 0.25 ? (Math.sin(a.ang) > 0 ? 1 : -1) : (a.y < N / 2 ? 1 : -1);
          a.ang = sgn * Math.PI / 2; ny = Math.max(0.5, Math.min(N - 0.5, a.y + sgn * step));
        } else if (hy && !hx) {
          sgn = Math.abs(Math.cos(a.ang)) > 0.25 ? (Math.cos(a.ang) > 0 ? 1 : -1) : (a.x < N / 2 ? 1 : -1);
          a.ang = sgn > 0 ? 0 : Math.PI; nx = Math.max(0.5, Math.min(N - 0.5, a.x + sgn * step));
        } else {
          // corner: turn toward the map centre
          a.ang = Math.atan2(N / 2 - a.y, N / 2 - a.x);
        }
        sx = Math.cos(a.ang) * step; sy = Math.sin(a.ang) * step;
      }
      a.x = nx; a.y = ny;
      var cx = nx | 0, cy = ny | 0;
      if (cx !== a.cx || cy !== a.cy) {
        if (cx !== a.cx && cy !== a.cy) {
          // keep trails 4-connected: step through an orthogonal neighbour first
          var fx = nx - cx, fy = ny - cy; // fractional position: pick the corner we crossed first
          var viaX = (cx > a.cx ? fx : 1 - fx) > (cy > a.cy ? fy : 1 - fy);
          if (viaX) this.enter(a, cx, a.cy); else this.enter(a, a.cx, cy);
        }
        this.enter(a, cx, cy);
      }
    }
  };

  World.prototype.enter = function (a, cx, cy) {
    var N = this.N;
    var pcx = a.cx, pcy = a.cy;
    a.cx = cx; a.cy = cy;
    var c = cy * N + cx;
    var t = this.trail[c];
    if (t) {
      if (t === a.id) {
        var L = a.trail.length, recent = false;
        for (var k = L - 1; k >= 0 && k >= L - SELF_GRACE; k--) if (a.trail[k] === c) { recent = true; break; }
        if (!recent && this.owner[c] !== a.id) this.pending.push({ v: a.id, k: a.id, r: 'self' });
        return;
      }
      this.pending.push({ v: t, k: a.id, r: 'cut' });
    }
    if (this.owner[c] === a.id) {
      if (a.trail.length) this.capture(a);
      a.home = true;
    } else {
      if (a.home) {
        a.home = false;
        a.trailStart = this.time;
        a.pts.length = 0;
        a.pts.push(pcx + 0.5, pcy + 0.5);
        this.events.push({ type: 'leave', id: a.id });
      }
      this.trail[c] = a.id;
      a.trail.push(c);
      a.pts.push(cx + 0.5, cy + 0.5);
    }
  };

  World.prototype.capture = function (a) {
    var id = a.id, N = this.N, NN = this.NN, owner = this.owner, trail = this.trail;
    var changed = [], i, c, before = a.cells;
    var tr = a.trail;
    for (i = 0; i < tr.length; i++) {
      c = tr[i];
      if (trail[c] === id) trail[c] = 0;
      if (owner[c] !== id) { this.setOwner(c, id); changed.push(c); }
    }
    var trailLen = tr.length;
    tr.length = 0; a.pts.length = 0;
    // label 4-connected components of cells not owned by `id`; keep the biggest, fill the rest
    var comp = this.comp, q = this.queue;
    comp.fill(0);
    var ncomp = 0, best = 0, bestSize = 0;
    for (var s = 0; s < NN; s++) {
      if (owner[s] === id || comp[s] !== 0) continue;
      ncomp++;
      var head = 0, tail = 0;
      comp[s] = ncomp; q[tail++] = s;
      while (head < tail) {
        c = q[head++];
        var x = c % N;
        var nb;
        if (x > 0) { nb = c - 1; if (comp[nb] === 0 && owner[nb] !== id) { comp[nb] = ncomp; q[tail++] = nb; } }
        if (x < N - 1) { nb = c + 1; if (comp[nb] === 0 && owner[nb] !== id) { comp[nb] = ncomp; q[tail++] = nb; } }
        if (c >= N) { nb = c - N; if (comp[nb] === 0 && owner[nb] !== id) { comp[nb] = ncomp; q[tail++] = nb; } }
        if (c < NN - N) { nb = c + N; if (comp[nb] === 0 && owner[nb] !== id) { comp[nb] = ncomp; q[tail++] = nb; } }
      }
      if (tail > bestSize) { bestSize = tail; best = ncomp; }
    }
    var victims = {};
    if (ncomp > 1) {
      for (s = 0; s < NN; s++) {
        if (comp[s] && comp[s] !== best) {
          var o = owner[s];
          if (o) victims[o] = 1;
          this.setOwner(s, id); changed.push(s);
        }
      }
    } else {
      for (i = 0; i < changed.length; i++) { /* trail cells may still have taken land */ }
    }
    // anyone swallowed completely?
    for (i = 1; i < this.agents.length; i++) {
      var o2 = this.agents[i];
      if (i !== id && o2.alive && o2.cells === 0) this.pending.push({ v: i, k: id, r: 'swallow' });
    }
    this.events.push({ type: 'capture', id: id, cells: changed, gained: a.cells - before, x: a.x, y: a.y, trailLen: trailLen });
  };

  World.prototype.kill = function (a, killer, reason) {
    a.alive = false;
    a.deaths++;
    var trail = this.trail, owner = this.owner, i, c;
    for (i = 0; i < a.trail.length; i++) { c = a.trail[i]; if (trail[c] === a.id) trail[c] = 0; }
    var cells = [];
    for (c = 0; c < this.NN; c++) if (owner[c] === a.id) { this.setOwner(c, 0); cells.push(c); }
    var trailPts = a.pts.slice();
    a.trail.length = 0; a.pts.length = 0;
    if (killer && killer !== a) killer.kills++;
    if (!a.isPlayer) a.respawnT = rnd(2.2, 3.8);
    this.events.push({ type: 'die', id: a.id, killer: killer ? killer.id : 0, reason: reason, x: a.x, y: a.y, cells: cells, pts: trailPts });
  };

  World.prototype.pct = function (a) { return a.cells * 100 / this.NN; };

  // Minimum distance from any enemy head to any of `a`'s trail cells (in cells).
  World.prototype.threatTo = function (a, onlyPlayerRelevant) {
    var N = this.N, tr = a.trail, best = 1e9, bestId = 0;
    if (!tr.length) return { d: 1e9, id: 0 };
    for (var i = 1; i < this.agents.length; i++) {
      var e = this.agents[i];
      if (e === a || !e.alive) continue;
      var step = tr.length > 60 ? 2 : 1;
      for (var k = 0; k < tr.length; k += step) {
        var c = tr[k], dx = (c % N) + 0.5 - e.x, dy = ((c / N) | 0) + 0.5 - e.y;
        var d = dx * dx + dy * dy;
        if (d < best) { best = d; bestId = i; }
      }
    }
    return { d: Math.sqrt(best), id: bestId };
  };

  /* ================================================================ bots */

  PG.newBrain = function (w, a) {
    var P = w.P, pers = a.personality;
    var b = { mode: 'home', t: Math.random() * 0.1, plan: null, wps: null, wi: 0, homeC: -1, huntC: -1, huntId: 0, modeT: 0, wait: 0 };
    var g = P.greed;
    if (pers === 'greedy') { b.leg = [7 * g, 15 * g]; b.maxTrail = 90 * g; b.caution = 0.7; b.huntR = 5 * P.opp; }
    else if (pers === 'cautious') { b.leg = [3, 7 * g]; b.maxTrail = 34; b.caution = 1.5; b.huntR = 3 * P.opp; }
    else { b.leg = [5, 10 * g]; b.maxTrail = 55; b.caution = 1.0; b.huntR = 9 + 9 * P.smart; }
    b.targetsPlayer = pers === 'hunter' ? Math.random() < P.huntPlayer : Math.random() < P.opp * 0.5;
    return b;
  };

  function nearestOwn(w, a, maxR) {
    var N = w.N, id = a.id, owner = w.owner, cx = a.cx, cy = a.cy;
    if (owner[cy * N + cx] === id) return cy * N + cx;
    for (var r = 1; r <= maxR; r++) {
      var best = -1, bd = 1e9;
      for (var k = -r; k <= r; k++) {
        // four sides of the ring
        var pts = [cx + k, cy - r, cx + k, cy + r, cx - r, cy + k, cx + r, cy + k];
        for (var j = 0; j < 8; j += 2) {
          var x = pts[j], y = pts[j + 1];
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          var c = y * N + x;
          if (owner[c] === id && !w.trail[c]) {
            var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
            if (d < bd) { bd = d; best = c; }
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  PG.nearestOwn = nearestOwn;

  function isRecent(a, c) {
    var L = a.trail.length;
    for (var k = L - 1; k >= 0 && k >= L - SELF_GRACE - 1; k--) if (a.trail[k] === c) return true;
    return false;
  }

  function blockedAt(w, a, px, py) {
    var N = w.N;
    if (px < 0.6 || py < 0.6 || px > N - 0.6 || py > N - 0.6) return true;
    var c = (py | 0) * N + (px | 0);
    return w.trail[c] === a.id && !isRecent(a, c);
  }
  function ownAt(w, a, px, py) {
    var c = (py | 0) * w.N + (px | 0);
    return w.owner[c] === a.id && !w.trail[c];
  }

  // How many half-cell steps (up to L cells) can we go along `ang` safely? Checks a lane ~1 cell wide.
  function probe(w, a, ang, L) {
    var cs = Math.cos(ang), sn = Math.sin(ang), ox = -sn * 0.42, oy = cs * 0.42;
    for (var k = 1; k <= L * 2; k++) {
      var px = a.x + cs * k * 0.5, py = a.y + sn * k * 0.5;
      if (ownAt(w, a, px, py)) return L;
      if (blockedAt(w, a, px, py) || blockedAt(w, a, px + ox, py + oy) || blockedAt(w, a, px - ox, py - oy)) return (k - 1) / 2;
    }
    return L;
  }

  // Is the straight path from the head to (tx,ty) free of our own trail?
  function pathClear(w, a, tx, ty) {
    var dx = tx - a.x, dy = ty - a.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) return true;
    var n = Math.ceil(d / 0.5), ox = -dy / d * 0.45, oy = dx / d * 0.45;
    for (var k = 1; k <= n; k++) {
      var px = a.x + dx * k / n, py = a.y + dy * k / n;
      if (ownAt(w, a, px, py)) return true;
      if (blockedAt(w, a, px, py) || blockedAt(w, a, px + ox, py + oy) || blockedAt(w, a, px - ox, py - oy)) return false;
    }
    return true;
  }

  // Best cell to head home to: nearest own cell with a clear straight path.
  function homeTarget(w, a) {
    var N = w.N, id = a.id, owner = w.owner, cx = a.cx, cy = a.cy, first = -1, firstR = 0, tested = 0;
    for (var r = 1; r <= 90; r++) {
      if (first >= 0 && r > firstR + 25) break;
      for (var k = -r; k <= r; k += (r > 12 ? 2 : 1)) {
        for (var j = 0; j < 4; j++) {
          var x = j === 0 ? cx + k : j === 1 ? cx + k : j === 2 ? cx - r : cx + r;
          var y = j === 0 ? cy - r : j === 1 ? cy + r : j === 2 ? cy + k : cy + k;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          var c = y * N + x;
          if (owner[c] !== id || w.trail[c]) continue;
          if (first < 0) { first = c; firstR = r; }
          if (tested < 40) {
            tested++;
            if (pathClear(w, a, x + 0.5, y + 0.5)) return c;
          }
        }
      }
    }
    return first;
  }

  var OFFS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1, 2.6, -2.6, 3.1];
  function safeAngle(w, a, desired, L) {
    var best = desired, bs = -1;
    // prefer turning to the side we're already turning toward
    var sgn = angDiff(desired, a.ang) >= 0 ? 1 : -1;
    for (var i = 0; i < OFFS.length; i++) {
      var ang = desired + OFFS[i] * sgn;
      var s = probe(w, a, ang, L);
      if (s >= L) return ang;
      if (s > bs) { bs = s; best = ang; }
    }
    return best;
  }

  function cellX(w, c) { return (c % w.N) + 0.5; }
  function cellY(w, c) { return ((c / w.N) | 0) + 0.5; }

  // pick a direction to head out of our territory
  function planExit(w, a, b) {
    var N = w.N, best = null, bestS = -1e9;
    for (var i = 0; i < 10; i++) {
      var ang = Math.random() * TAU;
      var cs = Math.cos(ang), sn = Math.sin(ang);
      var inside = 0, space = 0, s = 0;
      for (var k = 1; k <= 30; k++) {
        var px = a.x + cs * k, py = a.y + sn * k;
        if (px < 2 || py < 2 || px > N - 2 || py > N - 2) { s -= (30 - k) * 1.5; break; }
        var c = (py | 0) * N + (px | 0);
        if (w.owner[c] === a.id) { if (!space) inside++; }
        else { space++; if (w.owner[c] === 0) s += 0.3; }
      }
      s += space - inside * 0.6 + Math.random() * 6;
      if (s > bestS) { bestS = s; best = ang; }
    }
    // snap loosely to 8 directions for tidy rectangles
    var snap = Math.round(best / (Math.PI / 4)) * (Math.PI / 4);
    if (Math.random() < 0.7) best = snap;
    b.plan = { ang: best };
  }

  function makeWaypoints(w, a, b) {
    var N = w.N, ang = b.plan ? b.plan.ang : a.ang;
    var l1 = rnd(b.leg[0], b.leg[1]), l2 = rnd(b.leg[0], b.leg[1]) * rnd(0.8, 1.4);
    var x0 = a.x, y0 = a.y;
    var x1 = x0 + Math.cos(ang) * l1, y1 = y0 + Math.sin(ang) * l1;
    // choose perpendicular side with more room
    var sideA = ang + Math.PI / 2, sideB = ang - Math.PI / 2;
    function room(sa) {
      var px = x1 + Math.cos(sa) * l2, py = y1 + Math.sin(sa) * l2;
      var r = Math.min(px, py, N - px, N - py);
      return r + Math.random() * 8;
    }
    var side = room(sideA) > room(sideB) ? sideA : sideB;
    var x2 = x1 + Math.cos(side) * l2, y2 = y1 + Math.sin(side) * l2;
    function cl(v) { return Math.max(2, Math.min(N - 2, v)); }
    b.wps = [cl(x1), cl(y1), cl(x2), cl(y2)];
    b.wi = 0;
  }

  function findTrailTarget(w, a, b, R) {
    var N = w.N, best = -1, bd = R * R, bid = 0;
    for (var i = 1; i < w.agents.length; i++) {
      var e = w.agents[i];
      if (e === a || !e.alive || e.trail.length < 2) continue;
      if (e.isPlayer) {
        if (!b.targetsPlayer) continue;
        if (w.time - e.trailStart < w.P.notice) continue;
      }
      var tr = e.trail;
      for (var k = 0; k < tr.length - 2; k++) {
        var c = tr[k];
        if (w.owner[c] === a.id) continue;
        var dx = cellX(w, c) - a.x, dy = cellY(w, c) - a.y;
        var d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = c; bid = i; }
      }
    }
    if (best >= 0) { b.huntC = best; b.huntId = bid; return true; }
    return false;
  }

  PG.think = function (w, a, dt) {
    var b = a.brain, P = w.P;
    b.modeT += dt;
    b.t -= dt;
    if (b.t > 0) return;
    b.t = 0.07 + Math.random() * 0.05;
    var N = w.N;
    var desired = a.ang;
    var atHome = w.owner[a.cy * N + a.cx] === a.id && !a.trail.length;

    if (atHome && b.mode !== 'home' && b.mode !== 'hunt') { b.mode = 'home'; b.plan = null; b.modeT = 0; b.wait = rnd(0.1, a.personality === 'cautious' ? 1.2 : 0.5); }
    if (atHome && b.mode === 'hunt' && w.trail[b.huntC] !== b.huntId) { b.mode = 'home'; b.plan = null; b.modeT = 0; }

    // hunting / opportunistic trail cuts
    if (b.mode !== 'hunt' && b.mode !== 'return') {
      var R = b.huntR;
      if (a.trail.length > b.maxTrail * 0.5) R *= 0.4;
      if (R > 1.5 && findTrailTarget(w, a, b, R)) { b.mode = 'hunt'; b.modeT = 0; }
    }

    // danger: someone near our trail -> go home
    if (a.trail.length) {
      var hc = homeTarget(w, a);
      b.homeC = hc;
      var hd = hc >= 0 ? Math.hypot(cellX(w, hc) - a.x, cellY(w, hc) - a.y) : 99;
      var th = w.threatTo(a);
      var margin = 2 + 4 * b.caution * P.smart;
      if (th.d < hd * 0.9 + margin && Math.random() < P.smart && b.mode !== 'return') {
        if (!(b.mode === 'hunt' && Math.random() < 0.5)) { b.mode = 'return'; b.modeT = 0; }
      }
      if (a.trail.length > b.maxTrail && b.mode !== 'return') { b.mode = 'return'; b.modeT = 0; }
    }

    if (b.mode === 'home') {
      if (b.wait > 0) { b.wait -= 0.1; desired = a.ang + rnd(-0.6, 0.6); }
      else {
        if (!b.plan) planExit(w, a, b);
        desired = b.plan.ang;
      }
      if (a.trail.length) { b.mode = 'out'; b.modeT = 0; makeWaypoints(w, a, b); }
    }
    if (b.mode === 'out') {
      if (!b.wps) makeWaypoints(w, a, b);
      var tx = b.wps[b.wi * 2], ty = b.wps[b.wi * 2 + 1];
      if (Math.hypot(tx - a.x, ty - a.y) < 1.2 || b.modeT > 7) {
        b.wi++; b.modeT = 0;
        if (b.wi * 2 >= b.wps.length) { b.mode = 'return'; b.wps = null; }
      }
      if (b.mode === 'out') {
        tx = b.wps[b.wi * 2]; ty = b.wps[b.wi * 2 + 1];
        desired = Math.atan2(ty - a.y, tx - a.x);
      }
    }
    if (b.mode === 'hunt') {
      if (w.trail[b.huntC] !== b.huntId || b.modeT > 5) {
        b.mode = a.trail.length ? 'return' : 'home'; b.plan = null; b.modeT = 0;
      } else {
        desired = Math.atan2(cellY(w, b.huntC) - a.y, cellX(w, b.huntC) - a.x);
      }
    }
    if (b.mode === 'return') {
      if (!a.trail.length) { b.mode = 'home'; b.plan = null; b.modeT = 0; }
      else {
        if (b.homeC < 0) b.homeC = homeTarget(w, a);
        if (b.homeC >= 0) desired = Math.atan2(cellY(w, b.homeC) - a.y, cellX(w, b.homeC) - a.x);
      }
    }
    a.target = safeAngle(w, a, desired, 3.5);
  };
})();
