/* Wacky Soccer — physics.
 * Players: a rigid torso body (x, y = centre of mass, a = tilt angle, clockwise +)
 * with two spring-driven legs (the "kick" leg swings wildly), verlet noodle arms
 * and googly eyes. The ball is a simple bouncy circle. Everything runs in
 * logical pixels (1280x720) at 2 sub-steps per 60 Hz tick.
 */
(function () {
  'use strict';
  var WS = window.WS = window.WS || {};
  var W = WS.W = 1280, H = WS.H = 720, G = WS.G = 640;
  var GOAL_D = WS.GOAL_D = 96, GOAL_H = WS.GOAL_H = 215;
  var BAR_Y = WS.BAR_Y = G - GOAL_H;   // crossbar height (y)
  var BAR_R = 8;
  WS.MAXV = 1050;
  WS.TUNE = { kickBase: 700, kickFoot: 0.25, anyPart: true, ownDamp: 0.3 };

  WS.baseParams = function () {
    return {
      grav: 1800, jumpMul: 1, ballR: 21, ballMass: 1, ballRest: 0.72, ballGrav: 1, ballDrag: 0.18,
      ballRoll: 0.55, groundFric: 0.9, goalRest: 0.55, wind: false, bouncy: false, ice: false,
      pScale: 1, headMul: 1, legMul: 1, ballCount: 1, ballSkin: null, kickMul: 1, sky: 'day'
    };
  };
  WS.makeParams = function (modId) {
    var P = WS.baseParams();
    WS.modById(modId).apply(P);
    return P;
  };

  /* ---------------------------------------------------------------- Player */
  function Player(world, team, side, idx, homeX, look) {
    this.world = world;
    this.team = team; this.side = side; this.idx = idx; this.look = look;
    this.dir = side === 0 ? 1 : -1;          // attack direction
    this.homeX = homeX;
    this.arms = [{ ex: 0, ey: 0, epx: 0, epy: 0, hx: 0, hy: 0, hpx: 0, hpy: 0 }, { ex: 0, ey: 0, epx: 0, epy: 0, hx: 0, hy: 0, hpx: 0, hpy: 0 }];
    this.eyes = { ox: 0, oy: 0, vx: 0, vy: 0 };
    this.pts = {};   // world points: hip, sh, head, f0, f1 (+ prev)
    this.setScale(world.P);
    this.reset();
  }
  Player.prototype.setScale = function (P) {
    var s = this.s = P.pScale;
    this.headR = 25 * s * P.headMul;
    this.legLen = 78 * s * P.legMul;
    this.torso = 54 * s;
    this.hipOff = 16 * s;             // COM -> hip (down)
    this.m = 3 * s * s;
    this.I = this.m * 1300 * s * s;
    this.footR = 11 * s;
  };
  Player.prototype.reset = function () {
    this.x = this.homeX; this.y = G - this.legLen - this.hipOff - 2;
    this.vx = 0; this.vy = 0; this.a = 0; this.av = 0;
    this.legs = [{ phi: 0.12, w: 0 }, { phi: -0.14, w: 0 }];
    this.kickT = 0; this.kickHit = false; this.cool = 0;
    this.groundT = 1; this.airT = 0; this.lieT = 0; this.headGround = false;
    this.squash = 0; this.mood = 0; this.moodT = 0; this.flail = Math.random() * 6;
    this.idleT = 0;
    this.computePoints(true);
    for (var i = 0; i < 2; i++) {
      var ar = this.arms[i], sh = this.pts.sh;
      ar.ex = ar.epx = sh.x + (i ? -6 : 6); ar.ey = ar.epy = sh.y + 22 * this.s;
      ar.hx = ar.hpx = ar.ex + (i ? -4 : 4); ar.hy = ar.hpy = ar.ey + 20 * this.s;
    }
    this.eyes.ox = this.eyes.oy = this.eyes.vx = this.eyes.vy = 0;
  };
  // local (lx, ly) -> world
  Player.prototype.wx = function (lx, ly) { return this.x + lx * Math.cos(this.a) - ly * Math.sin(this.a); };
  Player.prototype.wy = function (lx, ly) { return this.y + lx * Math.sin(this.a) + ly * Math.cos(this.a); };
  Player.prototype.footLocal = function (i) {
    var L = this.legs[i];
    return { x: this.dir * Math.sin(L.phi) * this.legLen, y: this.hipOff + Math.cos(L.phi) * this.legLen };
  };
  function setPt(p, name, x, y, init) {
    var o = p[name];
    if (!o) o = p[name] = { x: x, y: y, px: x, py: y, vx: 0, vy: 0 };
    if (init) { o.px = x; o.py = y; } else { o.px = o.x; o.py = o.y; }
    o.x = x; o.y = y;
  }
  Player.prototype.computePoints = function (init, h) {
    var p = this.pts;
    setPt(p, 'hip', this.wx(0, this.hipOff), this.wy(0, this.hipOff), init);
    var shy = this.hipOff - this.torso;
    setPt(p, 'sh', this.wx(0, shy), this.wy(0, shy), init);
    var hy = shy - 3 * this.s - this.headR;
    setPt(p, 'head', this.wx(this.dir * 3 * this.s, hy), this.wy(this.dir * 3 * this.s, hy), init);
    for (var i = 0; i < 2; i++) {
      var f = this.footLocal(i);
      setPt(p, 'f' + i, this.wx(f.x, f.y), this.wy(f.x, f.y), init);
    }
    // analytic point velocities (rigid body + leg swing)
    for (var k in p) {
      var o = p[k], rx = o.x - this.x, ry = o.y - this.y;
      o.vx = this.vx - this.av * ry; o.vy = this.vy + this.av * rx;
    }
    var ca = Math.cos(this.a), sa = Math.sin(this.a);
    for (var j = 0; j < 2; j++) {
      var L = this.legs[j], fo = p['f' + j];
      var lx = this.dir * Math.cos(L.phi) * this.legLen * L.w, ly = -Math.sin(L.phi) * this.legLen * L.w;
      fo.vx += lx * ca - ly * sa; fo.vy += lx * sa + ly * ca;
    }
  };
  Player.prototype.grounded = function () { return this.groundT < 0.1; };
  Player.prototype.lying = function () { return Math.abs(wrapAng(this.a)) > 1.05 && this.headGround; };

  // One-button action: jump (if on the ground) and kick.
  Player.prototype.press = function () {
    if (this.cool > 0) return false;
    var P = this.world.P;
    this.cool = 0.2;
    this.kickT = 0.2; this.kickHit = false;
    this.legs[0].w += 12; this.legs[1].w -= 6;
    var a = wrapAng(this.a);
    if (this.lying() || (this.headGround && Math.abs(a) > 0.8)) {
      // flop back up!
      this.vy = -640 * P.jumpMul * Math.sqrt(this.s);
      this.vx += -Math.sign(a) * 120;
      this.av = -Math.sign(a) * 9;
      this.groundT = 1; this.squash = -0.25;
      this.world.emit('flip', this.x, this.y, this);
      return true;
    }
    if (this.grounded()) {
      var jv = 760 * P.jumpMul * (0.85 + 0.15 * this.s) * (0.8 + 0.2 * (this.power || 1));
      var ja = a + (Math.random() - 0.5) * 0.22;
      this.vx = this.vx * 0.3 + Math.sin(ja) * jv + this.dir * 40;
      this.vy = Math.min(this.vy, 0) * 0.3 - Math.cos(ja) * jv;
      this.av += -this.dir * 3.2;           // the big leg swing tips you back
      this.groundT = 1; this.squash = -0.3;
      this.world.emit('jump', this.x, this.pts.hip.y, this);
    } else {
      this.av += -this.dir * 4.5;           // air kick = wild spin
      this.world.emit('airkick', this.x, this.y, this);
    }
    return true;
  };

  Player.prototype.step = function (h, t) {
    var P = this.world.P, s = this.s;
    this.cool -= h; this.kickT -= h; this.groundT += h; this.moodT -= h;
    if (this.moodT <= 0) this.mood = 0;
    this.squash *= Math.pow(0.001, h);

    // legs (springs toward a pose)
    var kicking = this.kickT > 0;
    var air = !this.grounded();
    this.flail += h * (air ? 14 : 3);
    var t0 = kicking ? 2.15 : (air ? 0.35 + Math.sin(this.flail) * 0.35 : 0.12);
    var t1 = kicking ? -0.6 : (air ? -0.35 + Math.sin(this.flail + 2) * 0.3 : -0.14);
    var k0 = kicking ? 420 : 300, c0 = kicking ? 20 : 20;
    var L0 = this.legs[0], L1 = this.legs[1];
    L0.w += (k0 * (t0 - L0.phi) - c0 * L0.w) * h; L0.phi += L0.w * h;
    L1.w += (300 * (t1 - L1.phi) - 20 * L1.w) * h; L1.phi += L1.w * h;
    if (L0.phi > 2.5) { L0.phi = 2.5; if (L0.w > 0) L0.w *= -0.3; }

    // forces
    this.vy += P.grav * h;
    if (P.wind && air) this.vx += this.world.windX * 140 * h;
    var dmp = Math.pow(air ? 0.9 : 0.5, h);
    this.vx *= air ? Math.pow(0.95, h) : 1;
    this.av *= Math.pow(air ? 0.7 : 0.3, h);

    // balance: lean a little toward the ball so jumps hop toward it
    var ball = this.world.nearestBall(this.x);
    var lean = 0;
    if (ball) {
      if (this.idx === 1) lean = clamp((this.homeX - this.x) * 0.0022 + (ball.x - this.x) * 0.0005, -0.3, 0.3);
      else {
        // lean harder when the ball got behind you, so hops bring you back to it
        var bdx = ball.x - this.x;
        lean = clamp(bdx * (bdx * this.dir < 0 ? 0.0026 : 0.0011), -0.3, 0.3);
      }
    }
    this.lean = lean;
    var a = wrapAng(this.a);
    if (!air) {
      var kb = this.headGround ? 22 : 95, cb = this.headGround ? 4 : 12;
      this.av += (-kb * (a - lean) - cb * this.av) * h;
    } else {
      this.av += (-16 * a) * h;
    }
    if (this.av > 18) this.av = 18; else if (this.av < -18) this.av = -18;
    void dmp;

    this.x += this.vx * h; this.y += this.vy * h; this.a += this.av * h;
    this.a = wrapAng(this.a);

    // collisions with the static world
    this.headGround = false;
    this.collideStatic(h);

    // lying detection / auto get-up
    if (this.lying()) {
      this.lieT += h;
      if (this.lieT > 1.6 && !this.world.noAuto) { this.lieT = 0; this.cool = 0; this.press(); }
    } else this.lieT = 0;

    this.computePoints(false, h);
    if (!this.world.sim) { this.stepArms(h, P); this.stepEyes(h); }
    if (!air) this.idleT += h; else this.idleT = 0;
  };

  // Resolve a contact of this rigid body at point (cx, cy) along normal (nx, ny).
  Player.prototype.contact = function (cx, cy, nx, ny, pen, e, mu) {
    var rx = cx - this.x, ry = cy - this.y;
    var vpx = this.vx - this.av * ry, vpy = this.vy + this.av * rx;
    var vn = vpx * nx + vpy * ny;
    this.x += nx * pen; this.y += ny * pen;
    if (vn >= 0) return 0;
    var rn = rx * ny - ry * nx;
    var kn = 1 / this.m + rn * rn / this.I;
    var jn = -(1 + e) * vn / kn;
    this.vx += jn * nx / this.m; this.vy += jn * ny / this.m; this.av += rn * jn / this.I;
    // friction
    var tx = -ny, ty = nx;
    vpx = this.vx - this.av * ry; vpy = this.vy + this.av * rx;
    var vt = vpx * tx + vpy * ty;
    var rt = rx * ty - ry * tx;
    var kt = 1 / this.m + rt * rt / this.I;
    var jt = -vt / kt, lim = mu * jn;
    if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
    this.vx += jt * tx / this.m; this.vy += jt * ty / this.m; this.av += rt * jt / this.I;
    return -vn;
  };
  Player.prototype.applyImpulse = function (cx, cy, jx, jy) {
    var rx = cx - this.x, ry = cy - this.y;
    this.vx += jx / this.m; this.vy += jy / this.m;
    this.av += (rx * jy - ry * jx) / this.I;
  };
  // contact circles in local coords
  Player.prototype.circles = function () {
    var s = this.s, f0 = this.footLocal(0), f1 = this.footLocal(1);
    var shy = this.hipOff - this.torso;
    return [
      [f0.x, f0.y, this.footR, 'f'], [f1.x, f1.y, this.footR, 'f'],
      [0, this.hipOff, 13 * s, 'b'], [0, shy, 15 * s, 'b'],
      [this.dir * 3 * s, shy - 3 * s - this.headR, this.headR, 'h']
    ];
  };
  Player.prototype.collideStatic = function (h) {
    var P = this.world.P;
    var cs = this.circles();
    for (var it = 0; it < 2; it++) {
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        var cx = this.wx(c[0], c[1]), cy = this.wy(c[0], c[1]), r = c[2];
        var isFoot = c[3] === 'f';
        var e = c[3] === 'h' ? 0.35 : 0.02;
        var mu = isFoot ? P.groundFric : P.groundFric * 0.6;
        // ground
        if (cy + r > G) {
          var imp = this.contact(cx, cy + r, 0, -1, cy + r - G, e, mu);
          if (isFoot) {
            if (this.groundT > 0.15 && imp > 350) { this.squash = Math.min(0.35, imp / 2400); this.world.emit('land', cx, G, this, imp); }
            this.groundT = 0;
          } else {
            if (c[3] === 'h') {
              this.headGround = true;
              if (imp > 300) this.world.emit('bonk', cx, G, this, imp);
            }
            else if (imp > 450) this.world.emit('thud', cx, G, this, imp);
            // a flat body on the ground still counts as grounded (so you can flop up)
            this.groundT = Math.min(this.groundT, 0.05);
            if (c[3] === 'b') this.headGround = this.headGround || Math.abs(wrapAng(this.a)) > 1.05;
          }
          cx = this.wx(c[0], c[1]); cy = this.wy(c[0], c[1]);
        }
        // walls & ceiling
        if (cx - r < 0) { this.contact(cx - r, cy, 1, 0, r - cx, 0.3, 0.2); cx = this.wx(c[0], c[1]); }
        if (cx + r > W) { this.contact(cx + r, cy, -1, 0, cx + r - W, 0.3, 0.2); cx = this.wx(c[0], c[1]); }
        if (cy - r < -60) { this.contact(cx, cy - r, 0, 1, -60 - (cy - r), 0.3, 0.2); cy = this.wy(c[0], c[1]); }
        // goal crossbars (players can stand on the goal roofs)
        for (var g = 0; g < 2; g++) {
          var seg = WS.barSeg(g);
          var q = closestOnSeg(cx, cy, seg[0], seg[1], seg[2], seg[3]);
          var dx = cx - q.x, dy = cy - q.y, d2 = dx * dx + dy * dy, rr = r + BAR_R;
          if (d2 < rr * rr) {
            var d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
            var im = this.contact(q.x + nx * BAR_R, q.y + ny * BAR_R, nx, ny, rr - d, P.bouncy ? 1.1 : 0.1, 0.5);
            if (ny < -0.5 && isFoot) this.groundT = 0;
            if (P.bouncy && im > 100) this.world.emit('boing', q.x, q.y, this, im);
            cx = this.wx(c[0], c[1]); cy = this.wy(c[0], c[1]);
          }
        }
      }
    }
  };
  Player.prototype.stepArms = function (h, P) {
    var s = this.s, sh = this.pts.sh, g = P.grav * h * h;
    var up = { x: Math.sin(this.a), y: -Math.cos(this.a) };
    var l1 = 24 * s, l2 = 22 * s;
    for (var i = 0; i < 2; i++) {
      var ar = this.arms[i];
      var side = i === 0 ? 1 : -1;
      // rest pose: hanging down, slightly forward/back
      var restEx = sh.x - up.x * l1 + this.dir * side * 7 * s, restEy = sh.y - up.y * l1;
      var vx = (ar.ex - ar.epx) * 0.93, vy = (ar.ey - ar.epy) * 0.93;
      ar.epx = ar.ex; ar.epy = ar.ey;
      ar.ex += vx + (restEx - ar.ex) * 0.04; ar.ey += vy + g + (restEy - ar.ey) * 0.04;
      var hvx = (ar.hx - ar.hpx) * 0.93, hvy = (ar.hy - ar.hpy) * 0.93;
      ar.hpx = ar.hx; ar.hpy = ar.hy;
      ar.hx += hvx; ar.hy += hvy + g;
      if (this.kickT > 0.12) { ar.hx -= this.dir * side * 3 * s; ar.hy -= 2.5 * s; }
      // constraints
      for (var k = 0; k < 2; k++) {
        var dx = ar.ex - sh.x, dy = ar.ey - sh.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        ar.ex = sh.x + dx / d * l1; ar.ey = sh.y + dy / d * l1;
        dx = ar.hx - ar.ex; dy = ar.hy - ar.ey; d = Math.sqrt(dx * dx + dy * dy) || 1;
        var diff = (d - l2) / d * 0.5;
        ar.hx -= dx * diff; ar.hy -= dy * diff; ar.ex += dx * diff; ar.ey += dy * diff;
      }
      if (ar.hy > G - 4) ar.hy = G - 4;
      if (ar.ey > G - 4) ar.ey = G - 4;
    }
  };
  Player.prototype.stepEyes = function (h) {
    var e = this.eyes, hd = this.pts.head;
    var ax = (hd.vx - (e.lvx || 0)) / h, ay = (hd.vy - (e.lvy || 0)) / h;
    e.lvx = hd.vx; e.lvy = hd.vy;
    var b = this.world.nearestBall(hd.x);
    var tx = 0, ty = 0;
    if (b) { var dx = b.x - hd.x, dy = b.y - hd.y, d = Math.sqrt(dx * dx + dy * dy) || 1; tx = dx / d * 0.45; ty = dy / d * 0.45; }
    e.vx += (-ax * 0.00012 + (tx - e.ox) * 60 - e.vx * 5) * h * 3;
    e.vy += (-ay * 0.00012 + (ty - e.oy) * 60 - e.vy * 5) * h * 3;
    e.ox += e.vx * h; e.oy += e.vy * h;
    var d2 = e.ox * e.ox + e.oy * e.oy;
    if (d2 > 1) { var dd = Math.sqrt(d2); e.ox /= dd; e.oy /= dd; e.vx *= -0.5; e.vy *= -0.5; }
  };
  // shapes for ball collision: [type, ax, ay, bx, by, r, avx, avy, bvx, bvy, part]
  Player.prototype.shapes = function (out) {
    var p = this.pts, s = this.s;
    out.length = 0;
    out.push(['c', p.head.x, p.head.y, 0, 0, this.headR, p.head.vx, p.head.vy, 0, 0, 'head']);
    out.push(['s', p.hip.x, p.hip.y, p.sh.x, p.sh.y, 16 * s, p.hip.vx, p.hip.vy, p.sh.vx, p.sh.vy, 'body']);
    out.push(['s', p.hip.x, p.hip.y, p.f0.x, p.f0.y, 9 * s, p.hip.vx, p.hip.vy, p.f0.vx, p.f0.vy, 'leg0']);
    out.push(['s', p.hip.x, p.hip.y, p.f1.x, p.f1.y, 9 * s, p.hip.vx, p.hip.vy, p.f1.vx, p.f1.vy, 'leg1']);
    out.push(['c', p.f0.x, p.f0.y, 0, 0, this.footR + 2 * s, p.f0.vx, p.f0.vy, 0, 0, 'foot0']);
    out.push(['c', p.f1.x, p.f1.y, 0, 0, this.footR, p.f1.vx, p.f1.vy, 0, 0, 'foot1']);
    return out;
  };

  /* ------------------------------------------------------------------ Ball */
  function Ball(world, x, y) {
    var P = world.P;
    this.world = world;
    this.r = P.ballR; this.m = P.ballMass;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.ang = 0; this.spin = 0; this.lastTeam = -1; this.lastT = 0; this.touchP = null;
    this.stillT = 0; this.roofT = 0; this.hitT = 0; this.trail = []; this.graceP = null; this.graceT = 0;
    this.squash = 0;
  }
  Ball.prototype.step = function (h) {
    var P = this.world.P, r = this.r;
    this.hitT -= h; this.graceT -= h; this.squash *= Math.pow(0.0005, h);
    this.vy += P.grav * P.ballGrav * h;
    if (P.wind) this.vx += this.world.windX * 520 * h / Math.max(0.5, this.m);
    var dr = Math.pow(1 - Math.min(0.95, P.ballDrag), h);
    this.vx *= dr; this.vy *= dr;
    this.x += this.vx * h; this.y += this.vy * h;
    this.ang += this.spin * h;
    var e = P.ballRest;
    // ground
    if (this.y + r > G) {
      this.y = G - r;
      if (this.vy > 0) {
        if (this.vy > 140) { this.world.emit('bounce', this.x, G, this, this.vy); this.squash = Math.min(0.3, this.vy / 3000); }
        this.vy = -this.vy * e;
        if (this.vy > -70) this.vy = 0;
      }
      this.vx -= this.vx * P.ballRoll * h * 2;
      this.spin = this.vx / r;
    }
    if (this.x - r < 0) { this.x = r; if (this.vx < 0) { this.vx = -this.vx * e; this.world.emit('wall', this.x, this.y, this, -this.vx); } }
    if (this.x + r > W) { this.x = W - r; if (this.vx > 0) { this.vx = -this.vx * e; this.world.emit('wall', this.x, this.y, this, this.vx); } }
    if (this.y - r < 0) { this.y = r; if (this.vy < 0) this.vy = -this.vy * e; }
    // crossbars
    for (var g = 0; g < 2; g++) {
      var seg = WS.barSeg(g);
      var q = closestOnSeg(this.x, this.y, seg[0], seg[1], seg[2], seg[3]);
      var dx = this.x - q.x, dy = this.y - q.y, d2 = dx * dx + dy * dy, rr = r + BAR_R;
      if (d2 < rr * rr) {
        var d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
        this.x = q.x + nx * rr; this.y = q.y + ny * rr;
        var vn = this.vx * nx + this.vy * ny;
        if (vn < 0) {
          var ge = P.goalRest;
          this.vx -= (1 + ge) * vn * nx; this.vy -= (1 + ge) * vn * ny;
          if (P.bouncy && ny < -0.3 && this.vy > -520) this.vy = -520 - Math.random() * 200;
          if (-vn > 120) this.world.emit('post', q.x, q.y, this, -vn, g);
          this.spin += (this.vx * -ny + this.vy * nx) / r * 0.2;
        }
        if (ny < -0.5) this.roofT += h;
      }
    }
    var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    var maxV = WS.MAXV;
    if (sp > maxV) { this.vx *= maxV / sp; this.vy *= maxV / sp; }
    if (this.y + r < G - 1) this.spin *= Math.pow(0.8, h);
  };
  Ball.prototype.collidePlayer = function (p, shapes) {
    var P = this.world.P, r = this.r, hit = false;
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i], qx, qy, t = 0, rr;
      if (s[0] === 'c') { qx = s[1]; qy = s[2]; }
      else {
        var q = closestOnSeg(this.x, this.y, s[1], s[2], s[3], s[4]);
        qx = q.x; qy = q.y; t = q.t;
      }
      rr = r + s[5];
      var dx = this.x - qx, dy = this.y - qy, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      var d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
      if (d < 0.01) { nx = 0; ny = -1; }
      // ball pinned under a player: squirt it out sideways instead of crushing it
      var pinned = false;
      if (ny > 0.25 && this.y + r >= G - 2) {
        var sgn = Math.abs(dx) < r * 0.4 ? p.dir : (dx >= 0 ? 1 : -1);
        nx = sgn * 0.95; ny = -0.31; pinned = true;
      }
      var pvx = s[6] + (s[8] - s[6]) * t, pvy = s[7] + (s[9] - s[7]) * t;
      if (s[0] === 'c') { pvx = s[6]; pvy = s[7]; }
      var part = s[10];
      var isLeg = part.charAt(0) === 'l' || part.charAt(0) === 'f';
      var footKick = part === 'leg0' || part === 'foot0';
      // while the button's kick window is open, ANY touch sends the ball forward (weaker than a real foot kick)
      var isKick = p.kickT > 0 && !p.kickHit && (footKick || WS.TUNE.anyPart);
      // push out (ball takes most of it)
      var pen = rr - d;
      this.x += nx * pen; this.y += ny * pen;
      if (this.y + r > G) this.y = G - r;
      var mb = this.m, power;
      if (isKick) {
        // a kick always launches the ball forward; a faster foot = a harder kick
        var fs = Math.sqrt(pvx * pvx + pvy * pvy);
        var km = P.kickMul * (p.power || 1) / Math.sqrt(Math.max(0.5, mb));
        var pw = (WS.TUNE.kickBase + Math.min(fs, 1500) * WS.TUNE.kickFoot) * km * (footKick ? 1 : 0.72);
        var rel = (p.pts.hip.y - this.y) / p.legLen;      // > 0 when the ball is above the hip
        if (rel < -1) rel = -1; else if (rel > 1.5) rel = 1.5;
        var ang = 0.72 - rel * 0.32 + (Math.random() - 0.5) * 0.3;
        if (ang < 0.12) ang = 0.12; else if (ang > 1.15) ang = 1.15;
        this.vx = p.dir * Math.cos(ang) * pw + this.vx * 0.15;
        this.vy = -Math.sin(ang) * pw + Math.min(0, this.vy) * 0.1;
        this.spin = -p.dir * pw / r * 0.4;
        p.kickHit = true;
        p.applyImpulse(qx, qy, -p.dir * pw * mb * 0.35, 0);
        power = pw;
        this.world.emit('kick', qx, qy, p, power, this);
        this.graceP = p; this.graceT = 0.14;
        this.squash = 0.3; this.lastTeam = p.side; this.touchP = p; this.lastT = this.world.time;
        return true;
      } else {
        if (this.graceP === p && this.graceT > 0) continue;
        var rvx = this.vx - pvx, rvy = this.vy - pvy;
        var vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;
        if (vn < -800) vn = -800;
        if (pinned) {
          this.vx = nx * Math.max(Math.abs(this.vx) * 0.5, 220); this.vy = Math.min(this.vy, -120);
          this.lastTeam = p.side; this.touchP = p; this.lastT = this.world.time;
          continue;
        }
        var mp = p.m, e = part === 'head' ? 0.6 : 0.3;
        var jb = -(1 + e) * vn * mp / (mb + mp);
        this.vx += jb * nx; this.vy += jb * ny;
        var tvx = rvx - vn * nx, tvy = rvy - vn * ny;
        this.spin += (tvx * -ny + tvy * nx) / r * 0.3;
        // own-goal guard: a clumsy body bump rarely rockets the ball toward your own goal
        var bv = -this.vx * p.dir;
        if (bv > 160) { bv = 160 + (bv - 160) * WS.TUNE.ownDamp; this.vx = -p.dir * bv; }
        var J = jb * mb * 0.5;
        p.applyImpulse(qx, qy, -J * nx, -J * ny);
        power = -vn;
        if (part === 'head' && power > 220) {
          if (pvy < -150) this.vx += p.dir * 160;           // jumping headers go forward
          this.world.emit('header', qx, qy, p, power, this);
        } else if (power > 160) this.world.emit('touch', qx, qy, p, power, this);
      }
      this.squash = Math.min(0.35, power / 3500);
      var sp2 = this.vx * this.vx + this.vy * this.vy;
      if (sp2 > WS.MAXV * WS.MAXV) { var f = WS.MAXV / Math.sqrt(sp2); this.vx *= f; this.vy *= f; }
      this.lastTeam = p.side; this.touchP = p; this.lastT = this.world.time;
      hit = true;
    }
    return hit;
  };

  /* ----------------------------------------------------------------- World */
  function World(P) {
    this.P = P;
    this.players = []; this.balls = [];
    this.time = 0; this.windX = 0; this.windT = 0; this.windTarget = 0;
    this.events = []; this.noAuto = false; this.sim = false; this.simKicks = 0;
    this._sh = [];
  }
  World.prototype.emit = function (type, x, y, who, power, extra) {
    if (this.sim) { if (type === 'kick') this.simKicks++; return; }
    if (this.events.length < 80) this.events.push({ type: type, x: x, y: y, who: who, power: power || 0, extra: extra });
  };
  World.prototype.nearestBall = function (x) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.balls.length; i++) { var d = Math.abs(this.balls[i].x - x); if (d < bd) { bd = d; best = this.balls[i]; } }
    return best;
  };
  World.prototype.addBall = function (x, y, vx, vy) {
    var b = new Ball(this, x, y); b.vx = vx || 0; b.vy = vy || 0; this.balls.push(b); return b;
  };
  World.prototype.setParams = function (P) {
    this.P = P;
    for (var i = 0; i < this.players.length; i++) this.players[i].setScale(P);
    for (var j = 0; j < this.balls.length; j++) { this.balls[j].r = P.ballR; this.balls[j].m = P.ballMass; }
  };
  World.prototype.step = function (dt) {
    var sub = 2, h = dt / sub;
    for (var n = 0; n < sub; n++) {
      this.time += h;
      if (this.P.wind) {
        this.windT -= h;
        if (this.windT <= 0) { this.windT = 2.5 + Math.random() * 2.5; this.windTarget = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4); }
        this.windX += (this.windTarget - this.windX) * Math.min(1, h * 1.5);
      } else this.windX *= 0.9;
      var i, j, ps = this.players;
      for (i = 0; i < ps.length; i++) ps[i].step(h, this.time);
      this.collidePlayers();
      for (j = 0; j < this.balls.length; j++) {
        var b = this.balls[j];
        b.step(h);
        for (i = 0; i < ps.length; i++) b.collidePlayer(ps[i], ps[i].shapes(this._sh));
      }
      if (this.balls.length === 2) this.collideBalls(this.balls[0], this.balls[1]);
    }
  };
  World.prototype.collidePlayers = function () {
    var ps = this.players;
    for (var i = 0; i < ps.length; i++) {
      for (var j = i + 1; j < ps.length; j++) {
        var A = ps[i], B = ps[j];
        if (Math.abs(A.x - B.x) > 260) continue;
        var ca = A.circles(), cb = B.circles();
        for (var a = 0; a < ca.length; a++) {
          var ax = A.wx(ca[a][0], ca[a][1]), ay = A.wy(ca[a][0], ca[a][1]), ar = ca[a][2] * 0.9;
          for (var b = 0; b < cb.length; b++) {
            var bx = B.wx(cb[b][0], cb[b][1]), by = B.wy(cb[b][0], cb[b][1]), br = cb[b][2] * 0.9;
            var dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy, rr = ar + br;
            if (d2 >= rr * rr) continue;
            var d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, pen = rr - d;
            var wa = B.m / (A.m + B.m), wb = 1 - wa;
            A.x -= nx * pen * wa; A.y -= ny * pen * wa; B.x += nx * pen * wb; B.y += ny * pen * wb;
            var cx = ax + nx * ar, cy = ay + ny * ar;
            var rax = cx - A.x, ray = cy - A.y, rbx = cx - B.x, rby = cy - B.y;
            var vax = A.vx - A.av * ray, vay = A.vy + A.av * rax;
            var vbx = B.vx - B.av * rby, vby = B.vy + B.av * rbx;
            var vn = (vbx - vax) * nx + (vby - vay) * ny;
            if (vn >= 0) continue;
            var rna = rax * ny - ray * nx, rnb = rbx * ny - rby * nx;
            var k = 1 / A.m + 1 / B.m + rna * rna / A.I + rnb * rnb / B.I;
            var jn = -(1 + 0.4) * vn / k;
            A.applyImpulse(cx, cy, -jn * nx, -jn * ny);
            B.applyImpulse(cx, cy, jn * nx, jn * ny);
            if (-vn > 380) this.emit('bump', cx, cy, A, -vn, B);
          }
        }
      }
    }
  };
  World.prototype.collideBalls = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = a.r + b.r;
    if (d2 >= rr * rr) return;
    var d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, pen = rr - d;
    a.x -= nx * pen / 2; a.y -= ny * pen / 2; b.x += nx * pen / 2; b.y += ny * pen / 2;
    var vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn >= 0) return;
    var j = -(1 + 0.8) * vn / 2;
    a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny;
    if (-vn > 150) this.emit('touch', a.x + nx * a.r, a.y + ny * a.r, null, -vn);
  };

  /* ----------------------------------------------- snapshot (for the CPU) */
  var PF = ['x', 'y', 'vx', 'vy', 'a', 'av', 'kickT', 'kickHit', 'cool', 'groundT', 'lieT', 'headGround', 'idleT', 'squash', 'flail'];
  var BF = ['x', 'y', 'vx', 'vy', 'spin', 'ang', 'lastTeam', 'touchP', 'lastT', 'graceP', 'graceT', 'roofT', 'stillT', 'squash', 'r', 'm'];
  World.prototype.snapshot = function (snap) {
    snap = snap || { p: [], b: [], w: [] };
    var i, k, o;
    for (i = 0; i < this.players.length; i++) {
      var pl = this.players[i];
      o = snap.p[i] || (snap.p[i] = {});
      for (k = 0; k < PF.length; k++) o[PF[k]] = pl[PF[k]];
      o.l0 = pl.legs[0].phi; o.w0 = pl.legs[0].w; o.l1 = pl.legs[1].phi; o.w1 = pl.legs[1].w;
    }
    snap.nb = this.balls.length;
    for (i = 0; i < this.balls.length; i++) {
      o = snap.b[i] || (snap.b[i] = {});
      for (k = 0; k < BF.length; k++) o[BF[k]] = this.balls[i][BF[k]];
    }
    snap.w[0] = this.time; snap.w[1] = this.windX; snap.w[2] = this.windT; snap.w[3] = this.windTarget;
    return snap;
  };
  World.prototype.restore = function (snap) {
    var i, k, o;
    for (i = 0; i < this.players.length; i++) {
      var pl = this.players[i];
      o = snap.p[i];
      for (k = 0; k < PF.length; k++) pl[PF[k]] = o[PF[k]];
      pl.legs[0].phi = o.l0; pl.legs[0].w = o.w0; pl.legs[1].phi = o.l1; pl.legs[1].w = o.w1;
      pl.computePoints(true);
    }
    for (i = 0; i < snap.nb; i++) {
      o = snap.b[i];
      for (k = 0; k < BF.length; k++) this.balls[i][BF[k]] = o[BF[k]];
    }
    this.time = snap.w[0]; this.windX = snap.w[1]; this.windT = snap.w[2]; this.windTarget = snap.w[3];
    this.events.length = 0;
  };

  /* --------------------------------------------------------------- helpers */
  // crossbar/roof segment of goal g (0 = left, 1 = right)
  var SEG = [[-10, BAR_Y - 8, GOAL_D, BAR_Y], [W + 10, BAR_Y - 8, W - GOAL_D, BAR_Y]];
  WS.barSeg = function (g) { return SEG[g]; };
  function closestOnSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: ax + dx * t, y: ay + dy * t, t: t };
  }
  function wrapAng(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  WS.wrapAng = wrapAng;
  WS.Player = Player; WS.Ball = Ball; WS.World = World;
})();
