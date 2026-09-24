/*
 * Moto Madness — physics + level builder + autopilot.
 * Plain script: attaches to window.MM (or global.MM under Node for the test sim).
 *
 * World units are pixels, y points DOWN, angles are clockwise-positive (canvas convention).
 * The bike is a rigid chassis (bike + rider) with two wheel particles held on by
 * anisotropic damped springs (soft along the fork, stiff sideways). Terrain is made of
 * ONE-SIDED line segments (solid only from the side their normal points to), which lets
 * loops, kicker ramps and thin planks all live in the same collision world.
 */
(function (root) {
  'use strict';
  var MM = root.MM = root.MM || {};

  var G = 1400;            // gravity px/s^2
  var SUB = 8;             // physics sub-steps per 60 Hz frame
  var DT = 1 / 60;
  var H = DT / SUB;
  var CELL = 128;          // collision grid cell width (x only)
  MM.G = G; MM.DT = DT;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  MM.clamp = clamp;

  // Small deterministic RNG (xorshift) so decor is identical every visit.
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  MM.rng = rng;

  function mkSeg(x1, y1, x2, y2, k) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return null;
    dx /= len; dy /= len;
    return { x1: x1, y1: y1, x2: x2, y2: y2, dx: dx, dy: dy, nx: dy, ny: -dx, len: len, k: k || 'g',
      mark: 0, minX: Math.min(x1, x2), maxX: Math.max(x1, x2), loop: null, half: '', power: 0, ref: null, mover: null };
  }
  function setSeg(s, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    s.x1 = x1; s.y1 = y1; s.x2 = x2; s.y2 = y2; s.dx = dx; s.dy = dy; s.nx = dy; s.ny = -dx; s.len = len;
    s.minX = Math.min(x1, x2); s.maxX = Math.max(x1, x2);
  }

  /* =================================================================== BUILDER */
  // Levels are written as a list of "pieces" drawn by a pen that walks to the right.
  function Builder(def) {
    this.def = def;
    this.x = 0; this.y = 0; this.k = 'g';
    this.chain = [{ x: 0, y: -3000, k: 'g' }, { x: 0, y: 0, k: 'g' }];
    this.extra = [];
    this.shapes = [];
    this.movers = []; this.crateList = []; this.rollers = []; this.triggers = []; this.loops = [];
    this.checkpoints = []; this.signs = []; this.noDecor = []; this.bot = [];
    this.finishX = 0;
    this.start = { x: 150 };
  }
  var B = Builder.prototype;
  B.pt = function (x, y) { this.chain.push({ x: x, y: y, k: this.k }); this.x = x; this.y = y; return this; };
  B.flat = function (len) { return this.pt(this.x + len, this.y); };
  B.slope = function (len, rise) { return this.pt(this.x + len, this.y - rise); };
  B.curve = function (len, fn, step) {
    var n = Math.max(2, Math.ceil(len / (step || 20))), x0 = this.x, y0 = this.y;
    for (var i = 1; i <= n; i++) { var t = i / n; this.pt(x0 + len * t, y0 + fn(t)); }
    return this;
  };
  // smooth bump (h>0 up, h<0 valley)
  B.hill = function (len, h) { return this.curve(len, function (t) { return -h * (1 - Math.cos(2 * Math.PI * t)) / 2; }); };
  // smooth S-curve to a new height (rise>0 goes up)
  B.to = function (len, rise) { return this.curve(len, function (t) { return -rise * (1 - Math.cos(Math.PI * t)) / 2; }); };
  // concave kicker built into the ground: flat start, steep lip at the end
  B.ramp = function (len, h) { return this.curve(len, function (t) { return -h * t * t; }, 14); };
  // convex: steep start, flat top
  B.crest = function (len, h) { return this.curve(len, function (t) { return -h * (1 - (1 - t) * (1 - t)); }); };
  // landing slope going down: steep start then flattening out
  B.landing = function (len, d) { return this.curve(len, function (t) { return d * (1 - (1 - t) * (1 - t)); }); };
  B.bumps = function (n, len, h) { for (var i = 0; i < n; i++) this.hill(len, h); return this; };
  B.drop = function (d) { return this.pt(this.x, this.y + d); };
  B.rise = function (d) { return this.pt(this.x, this.y - d); };
  B.kind = function (k) { this.k = k || 'g'; return this; };
  B.nodecor = function (x1, x2) { this.noDecor.push([x1, x2]); return this; };
  B.ice = function (len) { var pk = this.k; this.k = 'i'; this.flat(len); this.k = pk; return this; };
  B.boost = function (len) {
    var pk = this.k, x0 = this.x; this.k = 'o'; this.flat(len || 200); this.k = pk;
    this.shapes.push({ type: 'boost', x1: x0, x2: this.x, y: this.y });
    return this;
  };
  // spike pit. landRise: how much higher (+) the far side is.
  B.pit = function (len, depth, landRise) {
    depth = depth || 200; landRise = landRise || 0;
    var x0 = this.x, y0 = this.y, pk = this.k;
    this.drop(depth); this.k = 's'; this.flat(len); this.k = pk; this.rise(depth + landRise);
    this.shapes.push({ type: 'pit', x1: x0, x2: x0 + len, y1: y0, y2: y0 - landRise, bottom: y0 + depth });
    this.noDecor.push([x0 - 90, x0 + len + 90]);
    return this;
  };
  B.addExtra = function (pts, k, extra) {
    for (var i = 0; i < pts.length - 1; i++) {
      var s = mkSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], k);
      if (!s) continue;
      if (extra) for (var key in extra) s[key] = extra[key];
      this.extra.push(s);
    }
  };
  // wooden kicker ramp sitting on the ground
  B.kicker = function (len, h) {
    var x0 = this.x, y0 = this.y, pts = [], n = Math.ceil(len / 14);
    for (var i = 0; i <= n; i++) { var t = i / n; pts.push([x0 + len * t, y0 - h * t * t]); }
    pts.push([x0 + len, y0]);
    this.addExtra(pts, 'w');
    this.shapes.push({ type: 'kicker', pts: pts, x1: x0, x2: x0 + len, y: y0, h: h });
    this.noDecor.push([x0 - 40, x0 + len + 40]);
    return this.flat(len);
  };
  // wooden landing ramp (front face is a wall, so jump onto it!)
  B.lander = function (len, h) {
    var x0 = this.x, y0 = this.y, pts = [[x0, y0], [x0, y0 - h]], n = Math.ceil(len / 16);
    for (var i = 1; i <= n; i++) { var t = i / n; pts.push([x0 + len * t, y0 - h * (1 - t) * (1 - t)]); }
    this.addExtra(pts, 'w');
    this.shapes.push({ type: 'lander', pts: pts, x1: x0, x2: x0 + len, y: y0, h: h });
    this.noDecor.push([x0 - 40, x0 + len + 40]);
    return this.flat(len);
  };
  // bouncy mushroom pad
  B.mushroom = function (power) {
    var x0 = this.x, y0 = this.y, cx = x0 + 60, pts = [], sh = { type: 'mushroom', cx: cx, y: y0, t: 9 };
    for (var i = 0; i <= 12; i++) {
      var a = Math.PI + Math.PI * i / 12;
      pts.push([cx + Math.cos(a) * 58, y0 - 6 + Math.sin(a) * 44]);
    }
    this.addExtra(pts, 'b', { power: power || 1150, ref: sh });
    this.shapes.push(sh);
    this.noDecor.push([x0 - 30, x0 + 150]);
    return this.flat(120);
  };
  B.loop = function (R) {
    R = R || 170;
    this.flat(R + 160);
    var cx = this.x, cy = this.y - R;
    var lp = { cx: cx, cy: cy, R: R, st: 0 };
    var n = Math.ceil(2 * Math.PI * R / 20), prev = null;
    for (var i = 0; i <= n; i++) {
      var phi = Math.PI / 2 - 2 * Math.PI * i / n;
      var p = [cx + R * Math.cos(phi), cy + R * Math.sin(phi)];
      if (prev) {
        var s = mkSeg(prev[0], prev[1], p[0], p[1], 'g');
        if (s) { s.loop = lp; s.half = i <= n / 2 ? 'A' : 'B'; this.extra.push(s); }
      }
      prev = p;
    }
    this.loops.push(lp);
    this.shapes.push({ type: 'loop', cx: cx, cy: cy, R: R });
    this.noDecor.push([cx - R - 60, cx + R + 60]);
    this.bot.push({ x0: cx - R - 100, x1: cx + R + 100, lean: 0 });
    return this.flat(R + 260);
  };
  B.seesaw = function (len) {
    len = len || 380;
    var x0 = this.x, y0 = this.y, lift = 38, P = len + 90, tilt = Math.asin(lift / (P / 2));
    this.movers.push({ type: 'seesaw', x: x0 + len / 2, y: y0 - lift, len: P, amin: -tilt, amax: tilt, a: -tilt });
    return this.pit(len, 190);
  };
  B.bridge = function (len, n) {
    n = n || 6;
    var x0 = this.x, y0 = this.y, w = len / n;
    for (var i = 0; i < n; i++) this.movers.push({ type: 'plank', x: x0 + w * (i + 0.5), y: y0, len: w + 2, a: 0 });
    return this.pit(len, 240);
  };
  // platform ferrying across a spike pit (moves between the two rims)
  B.ferry = function (len, pw, period, phase) {
    var x0 = this.x, y0 = this.y, mi = this.movers.length;
    this.movers.push({ type: 'platform', bx: x0 + pw / 2 + 4, by: y0, dx: len - pw - 8, dy: 0, period: period || 5, phase: phase || 0, len: pw, a: 0 });
    this.bot.push({ x0: x0 - 240, x1: x0 - 5, wait: function (w) { var p = w.moverF(mi).p; return !(p > 0.02 && p < 0.2); } });
    this.bot.push({ x0: x0 + 40, x1: x0 + len - pw / 2 + 30, wait: function (w) { var p = w.moverF(mi).p; return !(p > 0.5 && p < 0.76); } });
    this.shapes.push({ type: 'rail', x1: x0, x2: x0 + len, y: y0 });
    return this.pit(len, 240);
  };
  // lift: platform in a shaft that carries you up `rise` px to a ledge
  B.lift = function (pw, rise, period, phase) {
    var x0 = this.x, y0 = this.y, mi = this.movers.length;
    this.movers.push({ type: 'platform', bx: x0 + pw / 2 + 3, by: y0, dx: 0, dy: -rise, period: period || 5, phase: phase || 0, len: pw, a: 0, lift: true });
    this.bot.push({ x0: x0 - 240, x1: x0 - 5, wait: function (w) { var p = w.moverF(mi).p; return !(p > 0.02 && p < 0.2); } });
    this.bot.push({ x0: x0 + 20, x1: x0 + pw, wait: function (w) { var p = w.moverF(mi).p; return !(p > 0.5 && p < 0.76); } });
    this.pit(pw + 6, 60, rise);
    this.shapes[this.shapes.length - 1].shaft = true;
    return this;
  };
  // crates: rows from the bottom, e.g. [3,2,1] is a pyramid
  B.crates = function (rows) {
    if (typeof rows === 'number') rows = [rows];
    var S = 46, x0 = this.x + 20, y0 = this.y, maxN = rows[0];
    for (var r = 0; r < rows.length; r++) {
      for (var i = 0; i < rows[r]; i++) {
        this.crateList.push({ x: x0 + (i + (maxN - rows[r]) / 2) * S + S / 2, y: y0 - S / 2 - r * S, s: S });
      }
    }
    this.noDecor.push([x0 - 30, x0 + maxN * S + 30]);
    return this.flat(maxN * S + 60);
  };
  B.logs = function (n, gap) {
    for (var i = 0; i < n; i++) {
      this.rollers.push({ kind: 'log', x: this.x + 40, y: this.y - 17, r: 17, m: 1.2 });
      this.flat(gap || 120);
    }
    return this;
  };
  // big rolling boulder released behind you when you pass this point
  B.boulder = function (back, speed, r) {
    this.triggers.push({ x: this.x, back: back || 700, v: speed || 500, r: r || 62, stopX: 1e9, done: false });
    return this;
  };
  B.boulderStop = function () {
    for (var i = this.triggers.length - 1; i >= 0; i--) if (this.triggers[i].stopX === 1e9) { this.triggers[i].stopX = this.x; break; }
    this.shapes.push({ type: 'rockpile', x: this.x, y: this.y });
    return this;
  };
  B.checkpoint = function () { this.checkpoints.push({ x: this.x + 40, y: this.y }); return this.flat(100); };
  B.sign = function (text, dx) { this.signs.push({ x: this.x + (dx || 0), y: this.y, text: text }); return this; };
  B.botHint = function (h) { this.bot.push(h); return this; };
  B.finish = function () {
    this.finishX = this.x + 60;
    this.flat(1100);
    this.rise(3000);
    return this;
  };

  B.done = function () {
    var L = {
      def: this.def, chain: this.chain, shapes: this.shapes, moverDefs: this.movers, crateDefs: this.crateList,
      rollerDefs: this.rollers, triggerDefs: this.triggers, loops: this.loops, checkpoints: this.checkpoints,
      signs: this.signs, bot: this.bot, finishX: this.finishX, start: this.start, segs: [], decor: []
    };
    var i, s, c = this.chain;
    for (i = 1; i < c.length; i++) {
      s = mkSeg(c[i - 1].x, c[i - 1].y, c[i].x, c[i].y, c[i].k);
      if (s) { s.chain = true; L.segs.push(s); }
    }
    for (i = 0; i < this.extra.length; i++) L.segs.push(this.extra[i]);
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (i = 1; i < c.length; i++) { minX = Math.min(minX, c[i].x); maxX = Math.max(maxX, c[i].x); minY = Math.min(minY, c[i].y); maxY = Math.max(maxY, c[i].y); }
    L.minX = minX; L.maxX = maxX; L.minY = minY; L.maxY = maxY; L.killY = maxY + 700;
    // grid
    L.cell0 = Math.floor((minX - 400) / CELL);
    var ncell = Math.floor((maxX + 400) / CELL) - L.cell0 + 1;
    L.grid = [];
    for (i = 0; i < ncell; i++) L.grid.push([]);
    for (i = 0; i < L.segs.length; i++) {
      s = L.segs[i];
      var a = Math.floor(s.minX / CELL) - L.cell0, b = Math.floor(s.maxX / CELL) - L.cell0;
      for (var j = Math.max(0, a); j <= Math.min(ncell - 1, b); j++) L.grid[j].push(s);
    }
    // decor spots on gentle ground
    var R = rng((this.def.seed || 7) * 7919 + 13);
    var x = 260;
    while (x < maxX - 200) {
      x += 90 + R() * 240;
      var blocked = x > this.finishX - 200 && x < this.finishX + 200;
      for (i = 0; i < this.noDecor.length; i++) if (x > this.noDecor[i][0] && x < this.noDecor[i][1]) blocked = true;
      for (i = 0; i < this.checkpoints.length; i++) if (Math.abs(x - this.checkpoints[i].x) < 70) blocked = true;
      for (i = 0; i < this.signs.length; i++) if (Math.abs(x - this.signs[i].x - 60) < 110) blocked = true;
      if (blocked) continue;
      var y1 = chainY(c, x - 30), y2 = chainY(c, x + 30);
      if (y1 == null || y2 == null || Math.abs(y2 - y1) > 22) continue;
      L.decor.push({ x: x, y: Math.max(y1, y2) + 4, v: R(), s: 0.75 + R() * 0.5 });
    }
    return L;
  };
  // top-most chain height at x
  function chainY(c, x) {
    var lo = 1, hi = c.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (c[mid].x < x) lo = mid + 1; else hi = mid; }
    var i = lo;
    if (i <= 0 || i >= c.length) return null;
    var a = c[i - 1], b = c[i];
    if (b.x === a.x) return Math.min(a.y, b.y);
    return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  }
  MM.chainY = chainY;

  MM.build = function (def) {
    var b = new Builder(def);
    def.build(b);
    if (!b.finishX) b.finish();
    return b.done();
  };

  /* ===================================================================== WORLD */
  // Bike geometry (local frame, facing right, y down, origin = centre of mass)
  var WHEEL_R = 21;
  var ANCHORS = [
    { ax: -44, ay: 20, ux: 0, uy: 1 },                 // rear (swing arm)
    { ax: 44, ay: 20, ux: 0.34, uy: 0.94 }             // front (fork, raked)
  ];
  var SOLID = [
    { x: -18, y: 24, r: 7 }, { x: 16, y: 22, r: 7 }, { x: -60, y: -6, r: 6 }, { x: -24, y: -16, r: 7 }, { x: 30, y: -30, r: 6 }, { x: 58, y: -6, r: 5 }
  ];
  var CRASH = [
    { x: -2, y: -64, r: 14 }, { x: -22, y: -40, r: 9 }, { x: 30, y: -30, r: 6 }
  ];
  MM.WHEEL_R = WHEEL_R; MM.ANCHORS = ANCHORS; MM.CRASH = CRASH;

  var KA = 320, CA = 20, KP = 26000, CP = 130, KH = 14000, COMP = 20, EXT = 8;
  var VMAX = 960, MOTOR = 15000, BRAKE = 5200;
  var MU = { g: 1.15, w: 1.15, i: 0.16, m: 1.05, o: 1.15, b: 1.0, s: 1.0 };

  function World(level, opts) {
    this.level = level;
    this.opts = opts || {};
    this.events = [];
    this.contacts = [];
    for (var i = 0; i < 12; i++) this.contacts.push({ nx: 0, ny: 0, pen: 0, px: 0, py: 0, seg: null });
    this.stamp = 1;
    this.bike = {
      x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0, M: 3.2, I: 3.2 * 30 * 30,
      wheels: [
        { x: 0, y: 0, vx: 0, vy: 0, s: 0, rot: 0, r: WHEEL_R, m: 1, ms: 0.6, air: 1, comp: 0, impact: 0, kind: 'g' },
        { x: 0, y: 0, vx: 0, vy: 0, s: 0, rot: 0, r: WHEEL_R, m: 1, ms: 0.6, air: 1, comp: 0, impact: 0, kind: 'g' }
      ]
    };
    this.bike.wheels[0].anc = ANCHORS[0]; this.bike.wheels[1].anc = ANCHORS[1];
    this.restart();
  }
  MM.World = World;
  var W = World.prototype;

  W.restart = function () {
    this.time = 0; this.bonus = 0; this.started = false; this.finished = false; this.finalTime = 0;
    this.cp = -1; this.crashes = 0; this.flips = 0; this.smashed = 0; this.simT = 0; this.frame = 0;
    this.bestAir = 0;
    var L = this.level;
    for (var i = 0; i < L.triggerDefs.length; i++) L.triggerDefs[i].done = false;
    this.respawn(true);
  };

  W.respawn = function (first) {
    var L = this.level, i;
    var x = this.cp >= 0 ? L.checkpoints[this.cp].x : L.start.x;
    var gy = this.groundAt(x, -1e9, true);
    var gy2 = this.groundAt(x + 30, -1e9, true), gy1 = this.groundAt(x - 30, -1e9, true);
    var a = Math.atan2(gy2 - gy1, 60);
    this.placeBike(x, gy - 44, a);
    this.crashed = false; this.crashT = 0; this.rider = null;
    this.airT = 0; this.takeoffA = 0; this.pendingFlip = null; this.wheelieT = 0; this.wheelieShown = false;
    this.boostCd = 0; this.bounceCd = 0; this.grounded = true; this.chassisHit = 0;
    this.maxAirH = 0;
    // dynamic stuff back to the start
    this.movers = [];
    for (i = 0; i < L.moverDefs.length; i++) this.movers.push(this.makeMover(L.moverDefs[i]));
    this.crates = [];
    for (i = 0; i < L.crateDefs.length; i++) {
      var cd = L.crateDefs[i];
      this.crates.push({ x: cd.x, y: cd.y, s: cd.s, a: 0, vx: 0, vy: 0, w: 0, st: 0, t: 0, id: i });
    }
    this.rollers = [];
    for (i = 0; i < L.rollerDefs.length; i++) {
      var rd = L.rollerDefs[i];
      this.rollers.push({ kind: rd.kind, x: rd.x, y: rd.y, r: rd.r, m: rd.m, vx: 0, vy: 0, s: 0, rot: 0, air: 1, t: 0, dead: false });
    }
    var cpx = this.cp >= 0 ? L.checkpoints[this.cp].x : -1e9;
    for (i = 0; i < L.triggerDefs.length; i++) if (L.triggerDefs[i].x >= cpx) L.triggerDefs[i].done = false;
    for (i = 0; i < L.loops.length; i++) L.loops[i].st = 0;
    if (!first) this.events.push({ type: 'respawn', x: this.bike.x, y: this.bike.y });
  };

  W.placeBike = function (x, y, a) {
    var b = this.bike, ca = Math.cos(a), sa = Math.sin(a);
    b.x = x; b.y = y; b.a = a; b.vx = 0; b.vy = 0; b.w = 0;
    for (var i = 0; i < 2; i++) {
      var wh = b.wheels[i], an = wh.anc;
      var lx = an.ax + an.ux * 4, ly = an.ay + an.uy * 4;
      wh.x = x + lx * ca - ly * sa; wh.y = y + lx * sa + ly * ca;
      wh.vx = 0; wh.vy = 0; wh.s = 0; wh.air = 0; wh.comp = 0;
    }
  };

  W.makeMover = function (d) {
    var m = { type: d.type, d: d, x: d.x != null ? d.x : d.bx, y: d.y != null ? d.y : d.by, a: d.a || 0, vx: 0, vy: 0, w: 0, st: 0, t: 0, len: d.len, touched: false, gone: false };
    m.seg = mkSeg(-1, 0, 1, 0, d.type === 'plank' ? 'w' : d.type === 'seesaw' ? 'w' : 'm');
    m.seg.mover = m;
    m.I = 3.2 * d.len * d.len / 12;
    this.updateMoverSeg(m);
    return m;
  };
  W.updateMoverSeg = function (m) {
    var hl = m.len / 2, ca = Math.cos(m.a), sa = Math.sin(m.a);
    setSeg(m.seg, m.x - ca * hl, m.y - sa * hl, m.x + ca * hl, m.y + sa * hl);
  };
  W.moveMovers = function (h) {
    for (var i = 0; i < this.movers.length; i++) {
      var m = this.movers[i], d = m.d;
      if (m.gone) continue;
      if (m.type === 'seesaw') {
        m.w *= (1 - 1.2 * h);
        m.a += m.w * h;
        if (m.a < d.amin) { if (m.w < -2.5) this.events.push({ type: 'thunk', x: m.x, y: m.y }); m.a = d.amin; m.w = Math.max(0, -m.w * 0.15); }
        if (m.a > d.amax) { if (m.w > 2.5) this.events.push({ type: 'thunk', x: m.x, y: m.y }); m.a = d.amax; m.w = Math.min(0, -m.w * 0.15); }
      } else if (m.type === 'plank') {
        if (m.st === 1) { m.t += h; if (m.t > 0.3) { m.st = 2; this.events.push({ type: 'plank', x: m.x, y: m.y }); } }
        else if (m.st === 2) {
          m.vy += G * h; m.y += m.vy * h; m.w = (m.x % 2 < 1 ? 1.2 : -1.2); m.a += m.w * h;
          if (m.y > d.y + 500) m.gone = true;
        }
      } else if (m.type === 'platform') {
        var pf = platF(this.simT, d);
        m.x = d.bx + d.dx * pf.f; m.y = d.by + d.dy * pf.f; m.vx = d.dx * pf.fv; m.vy = d.dy * pf.fv;
      }
      this.updateMoverSeg(m);
    }
  };
  // Platform motion: wait at the start, glide over, wait at the end, glide back.
  var PF = { f: 0, fv: 0, p: 0 };
  function platF(t, d) {
    var p = t / d.period + d.phase; p -= Math.floor(p);
    var f, fv;
    if (p < 0.3) { f = 0; fv = 0; }
    else if (p < 0.5) { var u = (p - 0.3) * 5; f = u * u * (3 - 2 * u); fv = 6 * u * (1 - u) * 5 / d.period; }
    else if (p < 0.8) { f = 1; fv = 0; }
    else { var q = (p - 0.8) * 5; f = 1 - q * q * (3 - 2 * q); fv = -6 * q * (1 - q) * 5 / d.period; }
    PF.f = f; PF.fv = fv; PF.p = p;
    return PF;
  }
  // phase info for platform i — handy for the bot
  W.moverF = function (i) { var r = platF(this.simT, this.movers[i].d); return { f: r.f, p: r.p }; };

  function segTest(s, x, y, r, out) {
    var px = x - s.x1, py = y - s.y1;
    var side = px * s.nx + py * s.ny;
    if (side < -1.5 || side > r) return false;
    var t = px * s.dx + py * s.dy, cx, cy;
    if (t <= 0) { cx = s.x1; cy = s.y1; } else if (t >= s.len) { cx = s.x2; cy = s.y2; } else { cx = s.x1 + s.dx * t; cy = s.y1 + s.dy * t; }
    var ex = x - cx, ey = y - cy, d2 = ex * ex + ey * ey;
    if (d2 >= r * r) return false;
    if (t > 0 && t < s.len) { out.nx = s.nx; out.ny = s.ny; out.pen = r - side; }
    else {
      var d = Math.sqrt(d2);
      if (d < 1e-4) return false;
      out.nx = ex / d; out.ny = ey / d; out.pen = r - d;
      if (out.nx * s.nx + out.ny * s.ny < 0.05) return false;
    }
    out.px = cx; out.py = cy; out.seg = s;
    return true;
  }
  function segOff(s) {
    var lp = s.loop;
    return lp && ((s.half === 'A' && lp.st === 2) || (s.half === 'B' && lp.st === 0));
  }

  // Collide a circle with the level. Fills this.contacts, returns count.
  W.collide = function (x, y, r, noMovers) {
    var L = this.level, n = 0, cs = this.contacts, stamp = ++this.stamp, i, s;
    var c0 = Math.floor((x - r) / CELL) - L.cell0, c1 = Math.floor((x + r) / CELL) - L.cell0;
    if (c0 < 0) c0 = 0;
    if (c1 > L.grid.length - 1) c1 = L.grid.length - 1;
    for (var c = c0; c <= c1; c++) {
      var cell = L.grid[c];
      for (i = 0; i < cell.length; i++) {
        s = cell[i];
        if (s.mark === stamp) continue;
        s.mark = stamp;
        if (s.maxX < x - r || s.minX > x + r) continue;
        if (s.loop && segOff(s)) continue;
        if (segTest(s, x, y, r, cs[n])) { n++; if (n >= cs.length) return n; }
      }
    }
    if (!noMovers) {
      for (i = 0; i < this.movers.length; i++) {
        var m = this.movers[i];
        if (m.gone) continue;
        s = m.seg;
        if (s.maxX < x - r || s.minX > x + r) continue;
        if (segTest(s, x, y, r, cs[n])) { n++; if (n >= cs.length) return n; }
      }
    }
    return n;
  };

  // Height of the first upward-facing surface at x at or below yFrom.
  W.groundAt = function (x, yFrom, staticOnly) {
    var L = this.level, best = 1e9, c = Math.floor(x / CELL) - L.cell0, i, s, y;
    if (c >= 0 && c < L.grid.length) {
      var cell = L.grid[c];
      for (i = 0; i < cell.length; i++) {
        s = cell[i];
        if (s.ny > -0.15 || s.loop || x < s.minX || x > s.maxX) continue;
        y = s.y1 + (s.y2 - s.y1) * (x - s.x1) / ((s.x2 - s.x1) || 1e-6);
        if (y >= yFrom && y < best) best = y;
      }
    }
    if (!staticOnly) {
      for (i = 0; i < this.movers.length; i++) {
        s = this.movers[i].seg;
        if (this.movers[i].gone || s.ny > -0.15 || x < s.minX || x > s.maxX) continue;
        y = s.y1 + (s.y2 - s.y1) * (x - s.x1) / ((s.x2 - s.x1) || 1e-6);
        if (y >= yFrom && y < best) best = y;
      }
    }
    return best;
  };

  function surfVel(s, px, py, out) {
    var m = s.mover;
    if (!m) { out[0] = 0; out[1] = 0; return; }
    out[0] = m.vx - m.w * (py - m.y); out[1] = m.vy + m.w * (px - m.x);
  }
  var SV = [0, 0];

  W.crash = function (why) {
    if (this.crashed || this.finished) return;
    var b = this.bike, ca = Math.cos(b.a), sa = Math.sin(b.a);
    this.crashed = true; this.crashT = 0; this.crashes++;
    this.pendingFlip = null;
    var hx = b.x + (-8) * ca - (-44) * sa, hy = b.y + (-8) * sa + (-44) * ca;
    this.rider = { x: hx, y: hy, vx: b.vx * 0.7 - 60, vy: Math.min(b.vy * 0.5, 0) - 420, a: b.a, w: (b.vx >= 0 ? -1 : 1) * (7 + Math.random() * 3), r: 16, ground: 0, t: 0 };
    this.events.push({ type: 'crash', x: hx, y: hy, why: why || 'bonk' });
  };

  function resolveRigid(b, rx, ry, c, e, mu) {
    b.x += c.nx * c.pen; b.y += c.ny * c.pen;
    surfVel(c.seg, c.px, c.py, SV);
    var nx = c.nx, ny = c.ny;
    var vpx = b.vx - b.w * ry - SV[0], vpy = b.vy + b.w * rx - SV[1];
    var vn = vpx * nx + vpy * ny;
    if (vn >= 0) return 0;
    var rn = rx * ny - ry * nx, k = 1 / b.M + rn * rn / b.I;
    var j = -(1 + e) * vn / k;
    b.vx += j * nx / b.M; b.vy += j * ny / b.M; b.w += rn * j / b.I;
    var tx = -ny, ty = nx;
    vpx = b.vx - b.w * ry - SV[0]; vpy = b.vy + b.w * rx - SV[1];
    var vt = vpx * tx + vpy * ty, rt = rx * ty - ry * tx, kt = 1 / b.M + rt * rt / b.I;
    var jt = clamp(-vt / kt, -mu * j, mu * j);
    b.vx += jt * tx / b.M; b.vy += jt * ty / b.M; b.w += rt * jt / b.I;
    return -vn;
  }

  // wheel (or roller) vs terrain
  W.wheelTerrain = function (wh, isBike, drive) {
    var n = this.collide(wh.x, wh.y, wh.r), cs = this.contacts, touched = false;
    for (var i = 0; i < n; i++) {
      var c = cs[i];
      // account for earlier pushes this sub-step
      if (i > 0) {
        c.pen = wh.r - ((wh.x - c.px) * c.nx + (wh.y - c.py) * c.ny);
        if (c.pen <= 0) continue;
      }
      var s = c.seg, nx = c.nx, ny = c.ny;
      wh.x += nx * c.pen; wh.y += ny * c.pen;
      surfVel(s, c.px, c.py, SV);
      var rvx = wh.vx - SV[0], rvy = wh.vy - SV[1];
      var vn = rvx * nx + rvy * ny, jn = 0;
      if (vn < 0) {
        jn = -vn * wh.m;
        wh.vx -= vn * nx; wh.vy -= vn * ny;
        if (-vn > wh.impact) wh.impact = -vn;
      }
      var mu = MU[s.k] || 1;
      var tx = -ny, ty = nx;
      var vt = (wh.vx - SV[0]) * tx + (wh.vy - SV[1]) * ty;
      var slip = vt - wh.s;
      var jt = -slip / (1 / wh.m + 1 / wh.ms), lim = mu * jn + 0.02;
      if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
      wh.vx += jt / wh.m * tx; wh.vy += jt / wh.m * ty; wh.s -= jt / wh.ms;
      wh.air = 0; wh.kind = s.k; wh.nx = nx; wh.ny = ny;
      touched = true;
      var m = s.mover;
      if (m) {
        if (m.type === 'seesaw') {
          var fx = -(jn * nx + jt * tx) * (isBike ? 2.4 : 1), fy = -(jn * ny + jt * ty) * (isBike ? 2.4 : 1);
          m.w += ((c.px - m.x) * fy - (c.py - m.y) * fx) / m.I;
        } else if (m.type === 'plank' && m.st === 0) { m.st = 1; m.t = 0; this.events.push({ type: 'creak', x: m.x, y: m.y }); }
      }
      if (isBike && s.loop && !this.crashed) {
        var sp = Math.sqrt(this.bike.vx * this.bike.vx + this.bike.vy * this.bike.vy);
        if (sp > 300) { var f = G * 1.05 * H; wh.vx -= nx * f; wh.vy -= ny * f; this.loopStick = 0.1; }
      }
      if (isBike) {
        if (s.k === 's') this.crash('spikes');
        else if (s.k === 'b') this.bounce(s);
        else if (s.k === 'o') this.boostHit(tx, ty);
      } else if (s.k === 'b' && wh.vy > -200) { wh.vy = -s.power * 0.8; }
    }
    return touched;
  };

  W.bounce = function (s) {
    if (this.bounceCd > 0 || this.crashed) return;
    this.bounceCd = 0.35;
    var b = this.bike, vy = -s.power, vx = Math.max(b.vx, 320);
    var dvx = vx - b.vx, dvy = vy - b.vy;
    b.vx += dvx; b.vy += dvy; b.w *= 0.3;
    for (var i = 0; i < 2; i++) { b.wheels[i].vx += dvx; b.wheels[i].vy += dvy; }
    if (s.ref) s.ref.t = 0;
    this.events.push({ type: 'bounce', x: (s.x1 + s.x2) / 2, y: s.y1 });
  };
  W.boostHit = function (tx, ty) {
    var b = this.bike, target = 1450;
    var vt = b.vx * tx + b.vy * ty;
    if (vt < target) {
      var dv = Math.min(3600 * H, target - vt);
      b.vx += tx * dv; b.vy += ty * dv;
      for (var i = 0; i < 2; i++) { b.wheels[i].vx += tx * dv; b.wheels[i].vy += ty * dv; b.wheels[i].s = Math.max(b.wheels[i].s, vt + dv); }
    }
    if (this.boostCd <= 0) this.events.push({ type: 'boost', x: b.x, y: b.y });
    this.boostCd = 0.5;
  };

  W.substep = function (inp) {
    var h = H, b = this.bike, i, wh, c, n;
    this.simT += h;
    this.moveMovers(h);
    var ctl = !this.crashed && !this.finished;
    var gas = ctl && inp.gas, brake = ctl && inp.brake, lean = ctl ? (inp.lean || 0) : 0;
    if (this.finished) brake = true;
    if (!this.started && !this.crashed) { gas = false; brake = true; lean = 0; }
    var ca = Math.cos(b.a), sa = Math.sin(b.a);

    // gravity + air drag
    b.vy += G * h;
    var drag = 1 - 0.04 * h;
    b.vx *= drag; b.vy *= drag;
    // suspension springs
    for (i = 0; i < 2; i++) {
      wh = b.wheels[i];
      wh.vy += G * h;
      var an = wh.anc;
      var rx = an.ax * ca - an.ay * sa, ry = an.ax * sa + an.ay * ca;
      var ux = an.ux * ca - an.uy * sa, uy = an.ux * sa + an.uy * ca;
      var px = -uy, py = ux;
      var dx = wh.x - (b.x + rx), dy = wh.y - (b.y + ry);
      var rvx = wh.vx - (b.vx - b.w * ry), rvy = wh.vy - (b.vy + b.w * rx);
      var da = dx * ux + dy * uy, dp = dx * px + dy * py;
      var va = rvx * ux + rvy * uy, vp = rvx * px + rvy * py;
      var fa = -KA * da - CA * va;
      if (da < -COMP) fa += -KH * (da + COMP) - (va < 0 ? 60 * va : 0);
      else if (da > EXT) fa += -KH * 0.5 * (da - EXT);
      var fp = -KP * dp - CP * vp;
      var fx = fa * ux + fp * px, fy = fa * uy + fp * py;
      wh.vx += fx / wh.m * h; wh.vy += fy / wh.m * h;
      b.vx -= fx / b.M * h; b.vy -= fy / b.M * h;
      b.w -= (rx * fy - ry * fx) / b.I * h;
      wh.comp = da;
    }
    // engine / brakes
    var rear = b.wheels[0], front = b.wheels[1];
    var fwd = b.vx * ca + b.vy * sa;
    if (gas) {
      if (rear.s < VMAX) rear.s = Math.min(VMAX, rear.s + MOTOR * h * (1 - Math.max(0, rear.s) / (VMAX * 1.2)));
    }
    if (brake) {
      for (i = 0; i < 2; i++) { wh = b.wheels[i]; wh.s = wh.s > 0 ? Math.max(0, wh.s - BRAKE * h) : Math.min(0, wh.s + BRAKE * h); }
      if (fwd < 40 && this.started) rear.s = Math.max(-280, rear.s - 1800 * h);
    }
    for (i = 0; i < 2; i++) { wh = b.wheels[i]; if (wh.air > 0.1 && !(gas && i === 0)) wh.s *= (1 - 0.6 * h); }
    // lean
    var grounded = this.grounded;
    if (lean) {
      var maxW = grounded ? 2.8 : 8.8, acc = grounded ? 60 : 40;
      if (grounded) {
        // fade the ground lean as the bike pitches away from the slope (easy, controllable wheelies)
        var gw = rear.air < 0.05 ? rear : front;
        var rel = b.a - Math.atan2(gw.nx || 0, -(gw.ny || -1));
        while (rel > Math.PI) rel -= 2 * Math.PI;
        while (rel < -Math.PI) rel += 2 * Math.PI;
        if (rel * lean > 0) acc *= clamp(1 - (Math.abs(rel) - 0.35) / 0.5, 0.3, 1);
        else acc *= 0.8;
      }
      var dw = clamp(lean * maxW - b.w, -acc * h, acc * h);
      if (lean * dw > 0) this.spin(dw);
    } else if (!grounded && !this.crashed) {
      this.spin(-b.w * 0.5 * h);
    }
    // integrate
    b.x += b.vx * h; b.y += b.vy * h; b.a += b.w * h;
    for (i = 0; i < 2; i++) { wh = b.wheels[i]; wh.x += wh.vx * h; wh.y += wh.vy * h; wh.rot += wh.s / wh.r * h; }
    // wheel collisions
    for (i = 0; i < 2; i++) { b.wheels[i].air += h; this.wheelTerrain(b.wheels[i], true); }
    // chassis solid points
    ca = Math.cos(b.a); sa = Math.sin(b.a);
    for (i = 0; i < SOLID.length; i++) {
      var sp = SOLID[i], lx = sp.x * ca - sp.y * sa, ly = sp.x * sa + sp.y * ca;
      n = this.collide(b.x + lx, b.y + ly, sp.r);
      for (var k = 0; k < n; k++) {
        c = this.contacts[k];
        if (c.seg.k === 's' && !this.crashed) this.crash('spikes');
        var imp = resolveRigid(b, lx, ly, c, 0.05, 0.45);
        if (imp > 0) this.chassisHit = 0.08;
      }
    }
    // crash points (rider head/back, handlebars)
    if (!this.crashed) {
      for (i = 0; i < CRASH.length; i++) {
        var cp = CRASH[i], clx = cp.x * ca - cp.y * sa, cly = cp.x * sa + cp.y * ca;
        if (this.collide(b.x + clx, b.y + cly, cp.r) > 0) { this.crash('bonk'); break; }
      }
    }
    // rollers
    for (i = 0; i < this.rollers.length; i++) this.stepRoller(this.rollers[i], h);
    // rider ragdoll
    if (this.rider) this.stepRider(h);
  };

  // rotate the whole bike (chassis + wheels) as one rigid piece
  W.spin = function (dw) {
    var b = this.bike;
    b.w += dw;
    for (var i = 0; i < 2; i++) {
      var wh = b.wheels[i];
      wh.vx += -dw * (wh.y - b.y); wh.vy += dw * (wh.x - b.x);
    }
  };

  W.stepRoller = function (r, h) {
    if (r.dead) return;
    r.t += h;
    r.vy += G * h;
    r.x += r.vx * h; r.y += r.vy * h;
    r.rot += r.s / r.r * h;
    r.ms = r.m * 0.5;
    r.impact = 0;
    var was = r.air;
    if (this.wheelTerrain(r, false)) {
      if (was > 0.2 && r.kind === 'boulder' && r.impact > 250) this.events.push({ type: 'rumble', x: r.x, y: r.y, v: r.impact });
    } else r.air += h;
    r.s *= (1 - (r.kind === 'log' ? 1.2 : 0.05) * h);
    // vs bike wheels
    var b = this.bike;
    for (var i = 0; i < 2; i++) {
      var wh = b.wheels[i];
      var dx = wh.x - r.x, dy = wh.y - r.y, d2 = dx * dx + dy * dy, rr = r.r + wh.r;
      if (d2 < rr * rr && d2 > 1e-6) {
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rr - d;
        var mw = 3, im1 = 1 / mw, im2 = 1 / r.m, it = im1 + im2;
        wh.x += nx * pen * im1 / it; wh.y += ny * pen * im1 / it;
        r.x -= nx * pen * im2 / it; r.y -= ny * pen * im2 / it;
        var vn = (wh.vx - r.vx) * nx + (wh.vy - r.vy) * ny;
        if (vn < 0) {
          var j = -vn * 1.1 / it;
          wh.vx += nx * j * im1; wh.vy += ny * j * im1;
          r.vx -= nx * j * im2; r.vy -= ny * j * im2;
        }
        if (r.kind === 'boulder' && !this.crashed && r.vx > 60) this.crash('boulder');
      }
    }
    if (r.kind === 'boulder' && !this.crashed) {
      var ca = Math.cos(b.a), sa = Math.sin(b.a);
      for (i = 0; i < CRASH.length; i++) {
        var cp = CRASH[i], x = b.x + cp.x * ca - cp.y * sa, y = b.y + cp.x * sa + cp.y * ca;
        var ddx = x - r.x, ddy = y - r.y;
        if (ddx * ddx + ddy * ddy < (r.r + cp.r) * (r.r + cp.r)) { this.crash('boulder'); break; }
      }
      var cdx = b.x - r.x, cdy = b.y - r.y;
      if (cdx * cdx + cdy * cdy < (r.r + 30) * (r.r + 30)) this.crash('boulder');
    }
    if (r.kind === 'log' && !this.crashed) {
      // logs push the chassis bottom a little so you can ride over them
      var dx2 = b.x - r.x, dy2 = b.y + 20 - r.y, dd = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (dd < r.r + 10 && dd > 0.01) { var pn = (r.r + 10 - dd); b.x += dx2 / dd * pn * 0.5; b.y += dy2 / dd * pn * 0.5; r.x -= dx2 / dd * pn * 0.5; }
    }
    if (r.stopX && r.x > r.stopX) { r.dead = true; this.events.push({ type: 'boulderBreak', x: r.x, y: r.y, r: r.r }); }
    if (r.y > this.level.killY || r.t > 30) r.dead = true;
  };

  W.stepRider = function (h) {
    var r = this.rider;
    r.t += h;
    r.vy += G * h;
    r.x += r.vx * h; r.y += r.vy * h; r.a += r.w * h;
    var n = this.collide(r.x, r.y, r.r);
    for (var i = 0; i < n; i++) {
      var c = this.contacts[i];
      r.x += c.nx * c.pen; r.y += c.ny * c.pen;
      var vn = r.vx * c.nx + r.vy * c.ny;
      if (vn < 0) {
        if (vn < -260) this.events.push({ type: 'thud', x: r.x, y: r.y, v: -vn });
        r.vx -= 1.45 * vn * c.nx; r.vy -= 1.45 * vn * c.ny;
        var tx = -c.ny, ty = c.nx, vt = r.vx * tx + r.vy * ty;
        r.vx -= tx * vt * 0.25; r.vy -= ty * vt * 0.25;
        r.w = r.w * 0.8 + (vt / r.r) * 0.2;
      }
      r.ground = 0.2;
    }
    if (r.ground > 0) r.ground -= h;
  };

  W.stepCrates = function () {
    var b = this.bike, i, j, cr;
    for (i = 0; i < this.crates.length; i++) {
      cr = this.crates[i];
      if (cr.st === 0) {
        var hit = false, hs = cr.s / 2;
        for (j = 0; j < 2 && !hit; j++) {
          var wh = b.wheels[j];
          if (Math.abs(wh.x - cr.x) < hs + wh.r && Math.abs(wh.y - cr.y) < hs + wh.r) hit = true;
        }
        if (!hit && Math.abs(b.x - cr.x) < hs + 55 && Math.abs(b.y - cr.y) < hs + 40) hit = true;
        if (!hit && this.rider && Math.abs(this.rider.x - cr.x) < hs + 16 && Math.abs(this.rider.y - cr.y) < hs + 16) hit = true;
        if (hit) this.wakeCrate(cr, Math.max(Math.abs(b.vx), 280) * (b.vx < 0 ? -1 : 1), true);
      } else if (cr.st === 1) {
        cr.t += DT;
        cr.vy += G * DT;
        cr.x += cr.vx * DT; cr.y += cr.vy * DT; cr.a += cr.w * DT;
        var n = this.collide(cr.x, cr.y, cr.s * 0.45);
        if ((n > 0 && cr.t > 0.12) || cr.t > 2.5) {
          cr.st = 2;
          this.events.push({ type: 'crateBreak', x: cr.x, y: cr.y });
        }
      }
    }
  };
  W.wakeCrate = function (cr, v, byBike) {
    cr.st = 1; cr.t = 0;
    cr.vx = v * (1.05 + Math.random() * 0.35);
    cr.vy = -260 - Math.random() * 260;
    cr.w = (Math.random() - 0.5) * 16;
    this.smashed++;
    if (byBike) { var b = this.bike; b.vx *= 0.97; }
    this.events.push({ type: 'crate', x: cr.x, y: cr.y });
    // wake the crates stacked on top
    for (var i = 0; i < this.crates.length; i++) {
      var o = this.crates[i];
      if (o.st === 0 && Math.abs(o.x - cr.x) < cr.s && o.y < cr.y && cr.y - o.y < cr.s * 1.2) this.wakeCrate(o, v * 0.8, false);
    }
  };

  W.step = function (inp) {
    inp = inp || {};
    var b = this.bike, i;
    this.events.length = 0;
    this.frame++;
    if (!this.started && !this.finished && (inp.gas || inp.brake || inp.lean)) { this.started = true; this.events.push({ type: 'start' }); }
    for (i = 0; i < 2; i++) b.wheels[i].impact = 0;
    this.loopStick = 0;
    for (i = 0; i < SUB; i++) this.substep(inp);
    if (this.bounceCd > 0) this.bounceCd -= DT;
    if (this.boostCd > 0) this.boostCd -= DT;
    if (this.chassisHit > 0) this.chassisHit -= DT;
    this.stepCrates();

    // air time, flips, landings
    var rear = b.wheels[0], front = b.wheels[1];
    var wasGround = this.grounded;
    this.grounded = rear.air < 0.05 || front.air < 0.05 || this.chassisHit > 0;
    if (!this.grounded) {
      if (wasGround) { this.takeoffA = b.a; this.airT = 0; this.takeoffY = b.y; }
      this.airT += DT;
      this.maxAirH = Math.max(this.maxAirH, this.takeoffY - b.y);
    } else if (!wasGround) {
      var imp = Math.max(rear.impact, front.impact);
      if (this.airT > 0.3 && !this.crashed) {
        var rot = b.a - this.takeoffA, n = Math.floor((Math.abs(rot) + 1.1) / (2 * Math.PI));
        if (n > 0) this.pendingFlip = { n: n, dir: rot < 0 ? 'back' : 'front', t: 0.18 };
        var both = rear.air < 0.05 && front.air < 0.05;
        this.events.push({ type: 'land', v: imp, air: this.airT, x: b.x, y: b.y, perfect: both && imp < 900 && this.airT > 0.7 });
        if (this.airT > this.bestAir) this.bestAir = this.airT;
      } else if (imp > 350) this.events.push({ type: 'bump', v: imp, x: b.x, y: b.y });
      this.airT = 0;
    }
    if (this.pendingFlip) {
      this.pendingFlip.t -= DT;
      if (this.pendingFlip.t <= 0) {
        var pf = this.pendingFlip; this.pendingFlip = null;
        if (!this.crashed) {
          this.flips += pf.n; this.bonus += pf.n;
          this.events.push({ type: 'flip', n: pf.n, dir: pf.dir, x: b.x, y: b.y });
        }
      }
    }
    // wheelie
    if (!this.crashed && rear.air < 0.05 && front.air > 0.25 && b.vx > 200) {
      this.wheelieT += DT;
      if (this.wheelieT > 1.4 && !this.wheelieShown) { this.wheelieShown = true; this.events.push({ type: 'wheelie', x: b.x, y: b.y }); }
    } else if (front.air < 0.05) { this.wheelieT = 0; this.wheelieShown = false; }

    if (this.started && !this.finished) this.time += DT;
    var L = this.level;
    if (!this.crashed && b.y > L.killY) this.crash('fall');
    if (this.crashed) {
      this.crashT += DT;
      if (this.crashT > 1.35) this.respawn(false);
    } else if (!this.finished) {
      for (i = this.cp + 1; i < L.checkpoints.length; i++) {
        if (b.x > L.checkpoints[i].x) { this.cp = i; this.events.push({ type: 'checkpoint', i: i, x: L.checkpoints[i].x, y: L.checkpoints[i].y }); }
      }
      if (b.x > L.finishX) {
        this.finished = true;
        this.finalTime = Math.max(0, this.time - this.bonus);
        this.events.push({ type: 'finish', x: b.x, y: b.y });
      }
    }
    // boulder triggers
    for (i = 0; i < L.triggerDefs.length; i++) {
      var tg = L.triggerDefs[i];
      if (!tg.done && !this.crashed && b.x > tg.x) {
        tg.done = true;
        var bx = tg.x - tg.back, by = this.groundAt(bx, -1e9, true) - tg.r - 30;
        this.rollers.push({ kind: 'boulder', x: bx, y: by, r: tg.r, m: 30, vx: tg.v, vy: 0, s: tg.v, rot: 0, air: 1, t: 0, dead: false, stopX: tg.stopX });
        this.events.push({ type: 'boulder', x: bx, y: by });
      }
    }
    // loops
    for (i = 0; i < L.loops.length; i++) {
      var lp = L.loops[i], dx = b.x - lp.cx, dy = b.y - lp.cy, inside = dx * dx + dy * dy < lp.R * lp.R;
      if (lp.st === 0) { if (inside && dx > lp.R * 0.3 && dy < lp.R * 0.2) lp.st = 1; }
      else if (lp.st === 1) {
        if (inside && dx < 0 && dy < 0) { lp.st = 2; this.events.push({ type: 'loop', x: lp.cx, y: lp.cy - lp.R }); }
        else if (dy > lp.R * 0.3 && b.vx < -40) lp.st = 0;
      }
      if (lp.st !== 0 && Math.abs(dx) > lp.R + 220) lp.st = 0;
    }
  };

  /* ================================================================= AUTOPILOT */
  // A simple rider used for the title-screen demo and to verify every level can be finished.
  W.slopeAt = function (x, yRef) {
    var y1 = this.groundAt(x - 26, yRef), y2 = this.groundAt(x + 26, yRef);
    if (y1 > 1e8 || y2 > 1e8) return 0;
    return Math.atan2(y2 - y1, 52);
  };
  MM.autopilot = function (w, opts) {
    opts = opts || {};
    var b = w.bike, L = w.level, x = b.x, i;
    var inp = { gas: true, brake: false, lean: 0 };
    var maxV = 1e9, leanOv = null;
    for (i = 0; i < L.bot.length; i++) {
      var hnt = L.bot[i];
      if (x >= hnt.x0 && x <= hnt.x1) {
        if (hnt.v != null) maxV = Math.min(maxV, hnt.v);
        if (hnt.lean != null) leanOv = hnt.lean;
        if (hnt.wait && hnt.wait(w)) { maxV = -1; }
      }
    }
    if (opts.maxV) maxV = Math.min(maxV, opts.maxV);
    var sp = b.vx;
    if (sp > maxV) { inp.gas = false; if (sp > maxV + 100 || maxV < 0) inp.brake = true; }
    var target, yRef = b.y - 30;
    if (w.grounded) target = w.slopeAt(x + 25, yRef);
    else {
      var px = x, py = b.y, t;
      target = 0;
      for (t = 0.04; t < 2.5; t += 0.04) {
        var nx = x + b.vx * t, ny = b.y + b.vy * t + 0.5 * G * t * t;
        var gy = w.groundAt(nx, py - 10);
        if (gy < ny + 50) { target = w.slopeAt(nx, gy - 40); break; }
        px = nx; py = ny;
      }
      if (opts.flips && w.airT > 0.05 && t > 0.75 && !w.crashed) {
        var done = b.a - w.takeoffA;
        if (done > -2 * Math.PI + 0.9 && t > 0.3 + (2 * Math.PI + done) / 8) { inp.lean = -1; return inp; }
      }
    }
    var err = target - b.a;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    var u = err * (w.grounded ? 3.2 : 2.6) - b.w * (w.grounded ? 0.35 : 0.42);
    inp.lean = u > 0.25 ? 1 : u < -0.25 ? -1 : 0;
    if (leanOv != null) inp.lean = leanOv;
    return inp;
  };
})(typeof window !== 'undefined' ? window : globalThis);
