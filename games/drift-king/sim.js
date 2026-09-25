/*
 * Drift King — simulation core (road generation + car physics).
 * Pure logic, no drawing. Also loadable in Node for automated tuning tests.
 *
 * World: flat plane (x, y), z up. The road zig-zags between two directions:
 *   dir 0 = "A" = -x (screen up-left)  -> button released
 *   dir 1 = "B" = -y (screen up-right) -> button held
 */
(function (root) {
  'use strict';
  var DK = root.DK || (root.DK = {});

  var TURN_R = 0.9;    // heading turns at speed / TURN_R rad/s (spatial radius)
  var GRIP_L = 0.8;    // velocity direction follows heading over this distance
  var MARGIN = 0.22;   // forgiving: centre may go this far past an edge
  var ZONE_LEN = 260;  // road distance per zone (sky / palette change)
  var ANG = [Math.PI, -Math.PI / 2];
  var DX = [-1, 0], DY = [0, -1];
  var LX = [0, 1], LY = [-1, 0];   // left normal of each direction

  function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // Difficulty as a function of road distance.
  function params(d) {
    var k = 1 - Math.exp(-d / 1000);
    var kw = 1 - Math.exp(-d / 800);
    return {
      speed: 6.8 + 4.6 * k,            // 6.8 -> 11.4 units/s
      width: 3.5 - 1.15 * kw,          // 3.5 -> 2.35
      segMin: 5.2 - 1.9 * k,           // shortest straight
      segMax: 11.5 - 4.5 * k,          // longest straight
      ramp: d > 200 ? Math.min(0.2, 0.07 + d / 9000) : 0,
      quick: d > 120 ? Math.min(0.35, 0.1 + d / 4000) : 0  // chance of a short "flick" straight
    };
  }

  /* ------------------------------------------------------------ road */
  function Road(seed) {
    this.rand = rng(seed || 1);
    this.segs = [];
    this.base = 0;
    this.coins = [];
    this.items = [];     // gates etc.
    this.addSeg();
    this.addSeg();
  }

  Road.prototype.get = function (i) { return this.segs[i - this.base]; };
  Road.prototype.last = function () { return this.segs[this.segs.length - 1]; };

  Road.prototype.addSeg = function () {
    var r = this.rand;
    var prev = this.last();
    var i = prev ? prev.i + 1 : 0;
    var d0 = prev ? prev.d0 + prev.len : 0;
    var p = params(d0);
    var dir = prev ? 1 - prev.dir : 0;
    var w = p.width;
    var len;
    if (i === 0) len = 15;
    else if (i < 4) len = 9 - i * 0.5;
    else if (r() < p.quick) len = p.segMin * (0.72 + r() * 0.1);
    else len = p.segMin + (p.segMax - p.segMin) * r();
    len = Math.max(len, w * 0.5 + (prev ? prev.w * 0.5 : 0) + 1.6);
    var sx = prev ? prev.ex : 0, sy = prev ? prev.ey : 0;
    var seg = {
      i: i, dir: dir, sx: sx, sy: sy, len: len, w: w, d0: d0,
      ext0: prev ? prev.w * 0.5 : 2.5, ext1: w * 0.5,
      gap: null, zone: Math.floor(d0 / ZONE_LEN)
    };
    // Ramp + gap: only on long straights, far enough from both corners.
    if (i > 5 && p.ramp && r() < p.ramp) {
      seg.len = len = Math.max(len, 13.5);
      var a = seg.ext0 + 4.6;
      var g = 2.6 + r() * 0.8;
      seg.gap = { a: a, b: a + g, ramp: 1.5, h: 0.42 };
    }
    seg.ex = sx + DX[dir] * len;
    seg.ey = sy + DY[dir] * len;
    if (prev) prev.ext1 = w * 0.5;
    this.segs.push(seg);
    this.placeCoins(seg, p);
    // zone gate
    var zStart = seg.zone * ZONE_LEN;
    if (seg.zone > 0 && (!prev || prev.zone !== seg.zone)) {
      var s = clamp(zStart - d0, seg.ext0 + 0.8, Math.max(seg.ext0 + 0.8, len - seg.w));
      if (seg.gap && s > seg.gap.a - 2) s = seg.ext0 + 0.8;
      var gp = this.point(seg, s, 0);
      this.items.push({ type: 'gate', seg: i, x: gp.x, y: gp.y, dir: dir, w: w, zone: seg.zone });
    }
    return seg;
  };

  Road.prototype.placeCoins = function (seg, p) {
    var r = this.rand;
    if (seg.i < 2) return;
    var coins = this.coins;
    var self = this;
    function add(s, l, z, kind) {
      var pt = self.point(seg, s, l);
      coins.push({ x: pt.x, y: pt.y, z: z, seg: seg.i, kind: kind || 0, taken: false, t: r() * 6 });
    }
    if (seg.gap) {
      // arc of coins over the gap following the jump path
      var g = seg.gap, D = g.b + 1.6 - g.a;
      for (var k = 1; k <= 5; k++) {
        var f = k / 6;
        add(g.a + D * f, 0, jumpZ(f * D, D, g.h) + 0.35, k === 3 ? 1 : 0);
      }
      return;
    }
    var free0 = seg.ext0 + 1.2, free1 = seg.len - seg.ext1 - 0.6;
    var room = free1 - free0;
    if (room < 2) return;
    var roll = r();
    if (roll < 0.42) {
      var n = Math.min(5, Math.floor(room / 1.1));
      var lat = 0;
      var pat = r();
      if (pat < 0.35) lat = (r() < 0.5 ? -1 : 1) * (seg.w * 0.5 - 0.55);
      var start = free0 + (room - (n - 1) * 1.1) * 0.5;
      for (var j = 0; j < n; j++) add(start + j * 1.1, lat, 0.45, 0);
    } else if (roll < 0.5 && seg.i > 8) {
      // rare gem close to the edge: risky!
      add(free0 + room * (0.3 + r() * 0.4), (r() < 0.5 ? -1 : 1) * (seg.w * 0.5 - 0.45), 0.5, 1);
    }
  };

  // world point at along-distance s and lateral l (left positive)
  Road.prototype.point = function (seg, s, l) {
    return {
      x: seg.sx + DX[seg.dir] * s + LX[seg.dir] * l,
      y: seg.sy + DY[seg.dir] * s + LY[seg.dir] * l
    };
  };
  function along(seg, x, y) { return (x - seg.sx) * DX[seg.dir] + (y - seg.sy) * DY[seg.dir]; }
  function lateral(seg, x, y) { return (x - seg.sx) * LX[seg.dir] + (y - seg.sy) * LY[seg.dir]; }

  function inSeg(seg, x, y, m) {
    var s = along(seg, x, y), l = lateral(seg, x, y);
    if (Math.abs(l) > seg.w * 0.5 + m) return false;
    if (s < -seg.ext0 - m || s > seg.len + seg.ext1 + m) return false;
    if (seg.gap && s > seg.gap.a + 0.05 && s < seg.gap.b - m) return false;
    return true;
  }

  // Keep the road generated ahead of segment index `cur` and trim far behind.
  Road.prototype.ensure = function (cur) {
    while (this.last().i < cur + 30) this.addSeg();
    var keep = cur - 9;
    if (keep > this.base + 8) {
      var cut = keep - this.base;
      this.segs.splice(0, cut);
      this.base = keep;
      var b = this.base;
      this.coins = this.coins.filter(function (c) { return c.seg >= b; });
      this.items = this.items.filter(function (c) { return c.seg >= b; });
    }
  };

  // Road distance -> world point (for the best-score flag etc.)
  Road.prototype.pointAtDist = function (d) {
    for (var k = 0; k < this.segs.length; k++) {
      var sg = this.segs[k];
      if (d >= sg.d0 && d < sg.d0 + sg.len) {
        var s = d - sg.d0;
        if (sg.gap && s > sg.gap.a - 0.3 && s < sg.gap.b + 0.3) s = sg.gap.b + 0.3;
        var pt = this.point(sg, s, 0); pt.seg = sg; pt.s = s; return pt;
      }
    }
    return null;
  };

  // Jump height profile over flight distance s of total D with peak extra height H
  function jumpZ(s, D, h0) {
    var H = 1.35;
    var f = s / D;
    return h0 * (1 - f) + 4 * H * f * (1 - f);
  }

  /* ------------------------------------------------------------- car */
  function Car() { this.reset(); }
  Car.prototype.reset = function () {
    this.x = 0; this.y = 0; this.z = 0;
    this.head = ANG[0]; this.vel = ANG[0];
    this.v = 2.5; this.slip = 0; this.turning = 0;
    this.seg = 0; this.state = 'drive';
    this.air = null; this.rampZ = 0;
    this.progress = 0;
    this.fall = null;
    this.events = [];
    this.corner = null; // pending corner evaluation
  };

  // One fixed physics step. Returns nothing; pushes events into car.events.
  function step(car, road, dt, hold) {
    var ev = car.events;
    if (car.state === 'fall') {
      var f = car.fall;
      f.vz -= 26 * dt;
      car.z += f.vz * dt;
      car.x += f.vx * dt; car.y += f.vy * dt;
      f.vx *= 0.99; f.vy *= 0.99;
      f.pitch += f.vp * dt; f.roll += f.vr * dt; car.head += f.vh * dt;
      return;
    }
    var seg = road.get(car.seg);
    var target = params(seg.d0).speed;
    car.v += (target - car.v) * Math.min(1, dt * (car.v < target - 1 ? 1.6 : 0.8));

    if (!car.air) {
      var tgt = hold ? ANG[1] : ANG[0];
      var dh = wrap(tgt - car.head);
      var w = car.v / TURN_R;
      var st = clamp(dh, -w * dt, w * dt);
      car.head = wrap(car.head + st);
      car.turning = st / dt / w;
      var dv = wrap(car.head - car.vel);
      car.vel = wrap(car.vel + dv * Math.min(1, dt * car.v / GRIP_L));
      car.slip = wrap(car.head - car.vel);
      // gentle centring once straight (helps kids recover from small errors)
      if (Math.abs(car.slip) < 0.05 && Math.abs(wrap(car.head - ANG[seg.dir])) < 0.04) {
        var s0 = along(seg, car.x, car.y);
        if (s0 > seg.ext0 + 0.3) {
          var lat = lateral(seg, car.x, car.y);
          var mv = clamp(-lat * 1.3, -0.55, 0.55) * dt;
          car.x += LX[seg.dir] * mv; car.y += LY[seg.dir] * mv;
        }
      }
    } else {
      car.slip *= 0.96;
      car.turning = 0;
    }

    var mx = Math.cos(car.vel) * car.v * dt, my = Math.sin(car.vel) * car.v * dt;
    car.x += mx; car.y += my;

    // advance current segment
    var nxt = road.get(car.seg + 1);
    if (!car.air && nxt && inSeg(nxt, car.x, car.y, 0)) {
      car.seg++;
      var prevSeg = seg;
      seg = nxt;
      car.corner = { seg: seg.i, from: prevSeg, done: false, minEdge: 9 };
      ev.push({ t: 'corner-enter', seg: seg.i });
    }
    var s = along(seg, car.x, car.y);
    var prog = seg.d0 + clamp(s, 0, seg.len);
    if (prog > car.progress) car.progress = prog;

    // ramps and jumps
    if (car.air) {
      var a = car.air;
      a.s += Math.sqrt(mx * mx + my * my);
      if (a.s >= a.D) {
        car.air = null; car.z = 0;
        if (inSeg(seg, car.x, car.y, MARGIN)) {
          ev.push({ t: 'land' });
        } else { startFall(car, road, seg, -8); return; }
      } else {
        car.z = jumpZ(a.s, a.D, a.h0);
      }
    } else if (seg.gap) {
      var g = seg.gap;
      if (s > g.a - g.ramp && s < g.a) {
        car.z = g.h * (s - (g.a - g.ramp)) / g.ramp;
      } else if (s >= g.a && s < g.b && Math.abs(lateral(seg, car.x, car.y)) < seg.w * 0.5 + MARGIN) {
        car.air = { s: s - g.a, D: g.b + 1.6 - g.a, h0: g.h };
        car.z = g.h;
        ev.push({ t: 'jump' });
      } else car.z = 0;
    } else car.z = 0;

    if (car.air) return;

    // on the road?
    var on = false;
    for (var k = car.seg - 1; k <= car.seg + 2; k++) {
      var sg = road.get(k);
      if (sg && inSeg(sg, car.x, car.y, MARGIN)) { on = true; break; }
    }
    if (!on) { startFall(car, road, seg, 0); return; }

    // distance to nearest edge (for "close call")
    var latNow = lateral(seg, car.x, car.y);
    var edge = seg.w * 0.5 - Math.abs(latNow);

    // corner evaluation ("Perfect!")
    var c = car.corner;
    if (c && !c.done && c.seg === seg.i) {
      if (s > seg.ext0 * 0.4) c.minEdge = Math.min(c.minEdge, edge);
      if (s >= seg.ext0 + 1.0) {
        c.done = true;
        var aligned = Math.abs(wrap(car.head - ANG[seg.dir])) < 0.35;
        var off = Math.abs(latNow);
        var q;
        if (aligned && off < seg.w * 0.11 + 0.08) q = 'perfect';
        else if (c.minEdge < 0.12) q = 'close';
        else q = 'ok';
        ev.push({ t: 'corner', q: q, seg: seg.i, off: off });
      }
    }
  }

  function startFall(car, road, seg, vz) {
    var s = along(seg, car.x, car.y), l = lateral(seg, car.x, car.y);
    // behind the road if it left through a far (-x or -y) side
    var behind;
    if (s > seg.len + seg.ext1 - 0.01) behind = true;          // overshot the corner end
    else if (s < -seg.ext0) behind = false;
    else behind = (seg.dir === 0) ? (l > 0) : (l < 0);          // left of A = -y (far); left of B = +x (near)
    var sp = car.v;
    car.state = 'fall';
    car.air = null;
    car.fall = {
      vx: Math.cos(car.vel) * sp * 0.8, vy: Math.sin(car.vel) * sp * 0.8, vz: vz + 2.2,
      pitch: 0, roll: 0,
      vp: (Math.random() * 2 - 1) * 3 + 4, vr: (l > 0 ? 1 : -1) * (5 + Math.random() * 3), vh: (Math.random() * 2 - 1) * 4,
      behind: behind
    };
    car.events.push({ t: 'fall', behind: behind });
  }

  // Ideal "autopilot" input: switch direction `lead` units before a corner.
  function botHold(car, road, lead) {
    var seg = road.get(car.seg);
    var nxt = road.get(car.seg + 1);
    var s = along(seg, car.x, car.y);
    if (nxt && seg.len - s <= lead) return nxt.dir === 1;
    return seg.dir === 1;
  }

  DK.TURN_R = TURN_R; DK.GRIP_L = GRIP_L; DK.MARGIN = MARGIN; DK.ZONE_LEN = ZONE_LEN;
  DK.ANG = ANG; DK.DX = DX; DK.DY = DY; DK.LX = LX; DK.LY = LY;
  DK.wrap = wrap; DK.rng = rng; DK.params = params;
  DK.Road = Road; DK.Car = Car; DK.step = step; DK.botHold = botHold;
  DK.along = along; DK.lateral = lateral; DK.inSeg = inSeg; DK.jumpZ = jumpZ;
  DK.LEAD = 1.75;   // tuned autopilot lead distance (see tuning test)

  if (typeof module !== 'undefined' && module.exports) module.exports = DK;
})(typeof window !== 'undefined' ? window : globalThis);
