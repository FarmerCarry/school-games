/*
 * Swing Hook — deterministic physics simulation.
 * Pure logic, no DOM. Works in the browser (window.SHSim) and in Node
 * (module.exports) so a solver bot can verify every level is completable.
 *
 * The player is a single point mass (radius PR). The ragdoll limbs are purely
 * visual and live in game.js. The rope is an inextensible "max length"
 * constraint to a hook, which gives classic pendulum swinging.
 */
(function (root) {
  'use strict';

  var G = 1650;          // gravity px/s^2
  var MAXV = 2300;       // speed cap
  var RANGE = 480;       // hook reach
  var PR = 17;           // player collision radius
  var SUB = 3;           // physics substeps per step
  var ASSIST = 360;      // swing "pump" acceleration
  var RELEASE_BOOST = 1.07;
  var MINLEN = 70;
  var CATCH_KEEP = 0.9;
  var TAU = Math.PI * 2;

  var uid = 1;

  function num(v, d) { return v == null ? d : v; }

  // Build runtime level objects from compact level data.
  function build(def) {
    var L = {
      name: def.name || '', def: def,
      hooks: [], walls: [], pads: [], bumpers: [], saws: [], spinners: [], rings: [], stars: [],
      finish: def.finish, sea: num(def.sea, 900),
      start: { x: def.start[0], y: def.start[1] },
      launch: { vx: def.launch ? def.launch[0] : 520, vy: def.launch ? def.launch[1] : -380 },
      minX: 0, maxX: def.finish + 400, endless: !!def.endless
    };
    (def.hooks || []).forEach(function (h) { addHook(L, h); });
    (def.walls || []).forEach(function (a) { addWall(L, a); });
    (def.pads || []).forEach(function (a) { addPad(L, a); });
    (def.bumpers || []).forEach(function (a) { addBumper(L, a); });
    (def.saws || []).forEach(function (a) { addSaw(L, a); });
    (def.spinners || []).forEach(function (a) { addSpinner(L, a); });
    (def.rings || []).forEach(function (a) { addRing(L, a); });
    updateMovers(L, 0);
    return L;
  }

  function addHook(L, h) {
    var o = Array.isArray(h) ? { x: h[0], y: h[1] } : { x: h.x, y: h.y, mx: h.mx || 0, my: h.my || 0, orb: h.orb || 0, sp: num(h.sp, 1.5), ph: h.ph || 0 };
    o.id = uid++; o.cx = o.x; o.cy = o.y; o.hitT = -9;
    o.moving = !!(o.mx || o.my || o.orb);
    L.hooks.push(o); return o;
  }
  function addWall(L, a) { var o = { id: uid++, x: a[0], y: a[1], w: a[2], h: a[3] }; L.walls.push(o); return o; }
  function addPad(L, a) { var o = { id: uid++, x1: a[0], y1: a[1], x2: a[2], y2: a[3], pow: num(a[4], 1150), r: 13, hitT: -9 }; L.pads.push(o); return o; }
  function addBumper(L, a) { var o = { id: uid++, x: a[0], y: a[1], r: a[2], pow: num(a[3], 1000), hitT: -9 }; L.bumpers.push(o); return o; }
  function addSaw(L, a) {
    var o = Array.isArray(a) ? { x: a[0], y: a[1], r: a[2] || 40 } : { x: a.x, y: a.y, r: a.r || 40, mx: a.mx || 0, my: a.my || 0, orb: a.orb || 0, sp: num(a.sp, 1.5), ph: a.ph || 0 };
    o.id = uid++; o.cx = o.x; o.cy = o.y; o.moving = !!(o.mx || o.my || o.orb);
    L.saws.push(o); return o;
  }
  function addSpinner(L, a) {
    var o = Array.isArray(a) ? { x: a[0], y: a[1], len: a[2], sp: num(a[3], 1.6), arms: a[4] || 2 } : { x: a.x, y: a.y, len: a.len, sp: num(a.sp, 1.6), arms: a.arms || 2, ph: a.ph || 0 };
    o.id = uid++; o.ph = o.ph || 0; o.ang = o.ph;
    L.spinners.push(o); return o;
  }
  function addRing(L, a) {
    var ang = (a[2] || 0) * Math.PI / 180;
    var o = { id: uid++, x: a[0], y: a[1], ang: ang, dx: Math.cos(ang), dy: Math.sin(ang), pow: num(a[3], 1500), r: 62, hitT: -9 };
    L.rings.push(o); return o;
  }

  function updateMovers(L, t) {
    var i, o, s, a;
    for (i = 0; i < L.hooks.length; i++) {
      o = L.hooks[i];
      if (!o.moving) continue;
      s = Math.sin(t * o.sp + o.ph);
      o.cx = o.x + o.mx * s; o.cy = o.y + o.my * s;
      if (o.orb) { a = t * o.sp + o.ph; o.cx = o.x + Math.cos(a) * o.orb; o.cy = o.y + Math.sin(a) * o.orb; }
    }
    for (i = 0; i < L.saws.length; i++) {
      o = L.saws[i];
      if (!o.moving) continue;
      s = Math.sin(t * o.sp + o.ph);
      o.cx = o.x + o.mx * s; o.cy = o.y + o.my * s;
      if (o.orb) { a = t * o.sp + o.ph; o.cx = o.x + Math.cos(a) * o.orb; o.cy = o.y + Math.sin(a) * o.orb; }
    }
    for (i = 0; i < L.spinners.length; i++) { o = L.spinners[i]; o.ang = o.ph + t * o.sp; }
  }

  function create(L) {
    return {
      L: L, t: 0, st: 'ready',
      x: L.start.x, y: L.start.y, vx: 0, vy: 0, ang: 0, av: 0,
      hook: null, len: 0, target: null, slack: false,
      timer: 0, flips: 0, spin: 0, combo: 0, maxX: L.start.x,
      rh: {}, lastBounce: -9, lastThud: -9, grounded: 0, deadKind: '',
      ev: []
    };
  }

  function clone(w) {
    var c = {}, k;
    for (k in w) c[k] = w[k];
    c.rh = {};
    for (k in w.rh) c.rh[k] = w.rh[k];
    c.ev = [];
    return c;
  }

  function wrapA(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

  function findTarget(w) {
    var L = w.L, best = null, bs = 1e9, R2 = RANGE * RANGE;
    for (var i = 0; i < L.hooks.length; i++) {
      var h = L.hooks[i];
      var dx = h.cx - w.x, dy = h.cy - w.y;
      var d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      var d = Math.sqrt(d2);
      var s = d - dx * 0.55;
      if (dx < -30) s += 350;
      if (dy > 60) s += 120; // hooks below you are less useful
      if (s < bs) { bs = s; best = h; }
    }
    return best;
  }

  function speed(w) { return Math.sqrt(w.vx * w.vx + w.vy * w.vy); }

  function attach(w, h) {
    var dx = w.x - h.cx, dy = w.y - h.cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    w.hook = h; w.len = Math.max(MINLEN, d); w.combo = 0; w.slack = true;
    h.hitT = w.t;
    w.ev.push({ type: 'grab', x: h.cx, y: h.cy, h: h, sp: speed(w) });
  }

  function release(w) {
    var h = w.hook;
    w.hook = null;
    var sp = speed(w);
    if (sp > 1) {
      var ns = Math.min(MAXV, sp * RELEASE_BOOST);
      w.vx *= ns / sp; w.vy *= ns / sp;
    }
    w.av *= 1.35;
    w.ev.push({ type: 'release', x: w.x, y: w.y, sp: sp, h: h });
  }

  function die(w, kind) {
    if (w.st !== 'play') return;
    w.st = 'dead'; w.deadKind = kind; w.hook = null;
    w.ev.push({ type: 'die', kind: kind, x: w.x, y: w.y, vx: w.vx, vy: w.vy });
  }

  // Advance by dt seconds. hold = button held this step.
  function step(w, dt, hold) {
    var L = w.L;
    if (w.st === 'ready') {
      w.t += dt;
      updateMovers(L, w.t);
      w.target = findTarget(w);
      if (hold) {
        w.st = 'play';
        w.vx = L.launch.vx; w.vy = L.launch.vy;
        w.av = 0;
        w.ev.push({ type: 'launch', x: w.x, y: w.y });
      } else return;
    }
    if (w.st === 'dead') { w.t += dt; updateMovers(L, w.t); return; }

    // Rope input (once per step, responsive and deterministic).
    updateMovers(L, w.t);
    if (w.st === 'play') {
      if (!w.hook) w.target = findTarget(w);
      if (hold && !w.hook && w.target) attach(w, w.target);
      else if (!hold && w.hook) release(w);
    } else if (w.hook) { w.hook = null; }

    var h = dt / SUB;
    for (var s = 0; s < SUB; s++) {
      w.t += h;
      if (w.st === 'play') w.timer += h;
      updateMovers(L, w.t);
      substep(w, h);
      if (w.st === 'dead') break;
    }
    if (w.x > w.maxX) w.maxX = w.x;
  }

  function substep(w, h) {
    var L = w.L, i, o, dx, dy, d, nx, ny, vn;
    var playing = w.st === 'play';

    // --- forces
    w.vy += G * h;
    var hk = w.hook;
    if (hk) {
      dx = w.x - hk.cx; dy = w.y - hk.cy;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      var tx = -dy / d, ty = dx / d;
      var vt = w.vx * tx + w.vy * ty;
      if (dy > -0.35 * d && Math.abs(vt) > 20) {
        var sg = vt > 0 ? 1 : -1;
        w.vx += tx * ASSIST * sg * h; w.vy += ty * ASSIST * sg * h;
      }
    }
    var sp = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
    if (sp > MAXV) { w.vx *= MAXV / sp; w.vy *= MAXV / sp; }

    // --- integrate
    w.x += w.vx * h; w.y += w.vy * h;

    // --- rope constraint
    if (hk) {
      dx = w.x - hk.cx; dy = w.y - hk.cy;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = dx / d; ny = dy / d;
      if (d > w.len) {
        w.x = hk.cx + nx * w.len; w.y = hk.cy + ny * w.len;
        vn = w.vx * nx + w.vy * ny;
        if (vn > 0) {
          var before = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
          w.vx -= nx * vn; w.vy -= ny * vn;
          if (w.slack) {
            // rope snaps taut: keep most of the speed as swing (feels powerful)
            var tv = Math.sqrt(w.vx * w.vx + w.vy * w.vy), want = before * CATCH_KEEP;
            if (tv > 1 && want > tv) { w.vx *= want / tv; w.vy *= want / tv; }
            else if (tv <= 1 && want > 1) { var qx = -ny, qy = nx; if (qx < 0) { qx = -qx; qy = -qy; } w.vx = qx * want; w.vy = qy * want; }
            w.ev.push({ type: 'taut', x: w.x, y: w.y });
          }
        }
        w.slack = false;
      } else if (d < w.len - 4) w.slack = true;
      // body faces the hook; spin follows the swing
      var omega = (dx * w.vy - dy * w.vx) / (d * d);
      var targ = Math.atan2(-dx, dy);
      w.av = omega + wrapA(targ - w.ang) * 12;
    } else {
      w.av *= Math.exp(-0.35 * h);
    }

    // --- solids
    w.grounded = Math.max(0, w.grounded - h);
    for (i = 0; i < L.walls.length; i++) {
      o = L.walls[i];
      if (w.x < o.x - PR || w.x > o.x + o.w + PR || w.y < o.y - PR || w.y > o.y + o.h + PR) continue;
      var cx = w.x < o.x ? o.x : w.x > o.x + o.w ? o.x + o.w : w.x;
      var cy = w.y < o.y ? o.y : w.y > o.y + o.h ? o.y + o.h : w.y;
      dx = w.x - cx; dy = w.y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 >= PR * PR) continue;
      if (d2 < 1e-6) {
        // centre inside: push out along the smallest axis
        var pl = w.x - o.x, pr = o.x + o.w - w.x, pt = w.y - o.y, pb = o.y + o.h - w.y;
        var m = Math.min(pl, pr, pt, pb);
        if (m === pt) { nx = 0; ny = -1; cx = w.x; cy = o.y; }
        else if (m === pb) { nx = 0; ny = 1; cx = w.x; cy = o.y + o.h; }
        else if (m === pl) { nx = -1; ny = 0; cx = o.x; cy = w.y; }
        else { nx = 1; ny = 0; cx = o.x + o.w; cy = w.y; }
      } else { d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
      w.x = cx + nx * PR; w.y = cy + ny * PR;
      vn = w.vx * nx + w.vy * ny;
      if (vn < 0) {
        var rest = 0.35;
        w.vx -= (1 + rest) * vn * nx; w.vy -= (1 + rest) * vn * ny;
        // friction on the tangent
        var tvx = w.vx - (w.vx * nx + w.vy * ny) * nx, tvy = w.vy - (w.vx * nx + w.vy * ny) * ny;
        w.vx -= tvx * 0.06; w.vy -= tvy * 0.06;
        if (ny < -0.6) {
          w.grounded = 0.1;
          if (-vn < 120) { var vr = w.vx * nx + w.vy * ny; w.vx -= vr * nx; w.vy -= vr * ny; }
        }
        w.av = w.av * -0.4 + (nx !== 0 ? w.vy * -nx : w.vx * ny) / PR * 0.2;
        if (-vn > 180 && w.t - w.lastThud > 0.12) { w.lastThud = w.t; w.ev.push({ type: 'thud', x: cx, y: cy, v: -vn, nx: nx, ny: ny }); }
      }
    }
    if (w.grounded > 0 && !w.hook) {
      // standing on a ledge: friction and get back on your feet
      w.vx *= Math.exp(-5 * h);
      w.av += wrapA(0 - w.ang) * 18 * h * 10;
      w.av *= Math.exp(-8 * h);
    }

    // --- bouncy pads (capsules)
    for (i = 0; i < L.pads.length; i++) {
      o = L.pads[i];
      var ex = o.x2 - o.x1, ey = o.y2 - o.y1;
      var ll = ex * ex + ey * ey;
      var u = ((w.x - o.x1) * ex + (w.y - o.y1) * ey) / ll;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      var px = o.x1 + ex * u, py = o.y1 + ey * u;
      dx = w.x - px; dy = w.y - py;
      var rr = o.r + PR;
      d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      d = Math.sqrt(d2) || 0.001; nx = dx / d; ny = dy / d;
      bounce(w, o, px + nx * rr, py + ny * rr, nx, ny, o.pow, 'pad');
    }
    for (i = 0; i < L.bumpers.length; i++) {
      o = L.bumpers[i];
      dx = w.x - o.x; dy = w.y - o.y;
      rr = o.r + PR;
      d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      d = Math.sqrt(d2) || 0.001; nx = dx / d; ny = dy / d;
      bounce(w, o, o.x + nx * rr, o.y + ny * rr, nx, ny, o.pow, 'bumper');
    }

    // --- spin & flips
    w.ang += w.av * h;
    if (w.ang > Math.PI * 64 || w.ang < -Math.PI * 64) w.ang = wrapA(w.ang);
    if (playing) {
      w.spin += w.av * h;
      if (w.spin >= TAU || w.spin <= -TAU) {
        w.spin -= w.spin > 0 ? TAU : -TAU;
        w.flips++; w.combo++;
        w.ev.push({ type: 'flip', x: w.x, y: w.y, combo: w.combo, loop: !!w.hook });
      }
    }

    if (!playing) {
      return;
    }

    // --- hazards (forgiving hitboxes)
    for (i = 0; i < L.saws.length; i++) {
      o = L.saws[i];
      dx = w.x - o.cx; dy = w.y - o.cy;
      rr = o.r * 0.78 + PR * 0.55;
      if (dx * dx + dy * dy < rr * rr) { die(w, 'poof'); return; }
    }
    for (i = 0; i < L.spinners.length; i++) {
      o = L.spinners[i];
      for (var k = 0; k < o.arms; k++) {
        var a = o.ang + k * TAU / o.arms;
        var ax = Math.cos(a), ay = Math.sin(a);
        var along = (w.x - o.x) * ax + (w.y - o.y) * ay;
        if (along < 0) along = 0; else if (along > o.len) along = o.len;
        dx = w.x - (o.x + ax * along); dy = w.y - (o.y + ay * along);
        rr = 9 + PR * 0.6;
        if (dx * dx + dy * dy < rr * rr) { die(w, 'poof'); return; }
      }
      dx = w.x - o.x; dy = w.y - o.y;
      if (dx * dx + dy * dy < 22 * 22) { die(w, 'poof'); return; }
    }

    // --- speed rings (with a gentle magnet so kids hit them)
    for (i = 0; i < L.rings.length; i++) {
      o = L.rings[i];
      dx = w.x - o.x; dy = w.y - o.y;
      d2 = dx * dx + dy * dy;
      if (d2 > o.r * o.r) {
        var mr = o.r * 2.6;
        if (d2 < mr * mr && !w.hook && !(w.rh[o.id] != null && w.t - w.rh[o.id] < 0.6)) {
          d = Math.sqrt(d2);
          var pull = 5200 * (1 - d / mr) * h / d;
          w.vx -= dx * pull; w.vy -= dy * pull;
        }
        continue;
      }
      if (w.rh[o.id] != null && w.t - w.rh[o.id] < 0.6) continue;
      w.rh[o.id] = w.t; o.hitT = w.t;
      sp = Math.sqrt(w.vx * w.vx + w.vy * w.vy) || 1;
      var bx = 0.25 * w.vx / sp + 0.75 * o.dx, by = 0.25 * w.vy / sp + 0.75 * o.dy;
      var bl = Math.sqrt(bx * bx + by * by) || 1;
      var ns = Math.min(MAXV, Math.max(sp * 1.2, o.pow));
      w.vx = bx / bl * ns; w.vy = by / bl * ns;
      if (w.hook) { w.hook = null; }
      w.ev.push({ type: 'ring', x: o.x, y: o.y, r: o });
    }

    // --- finish / fall
    if (!L.endless && w.x >= L.finish) {
      w.st = 'won'; w.hook = null;
      w.ev.push({ type: 'win', x: w.x, y: w.y, time: w.timer, flips: w.flips });
      return;
    }
    if (w.y > L.sea) die(w, 'splash');
  }

  function bounce(w, o, px, py, nx, ny, pow, kind) {
    w.x = px; w.y = py;
    var vn = w.vx * nx + w.vy * ny;
    if (vn >= 0) return;
    var out = Math.max(-vn * 0.95, pow);
    w.vx += (out - vn) * nx; w.vy += (out - vn) * ny;
    var sp = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
    if (sp > MAXV) { w.vx *= MAXV / sp; w.vy *= MAXV / sp; }
    if (w.hook) { w.hook = null; }
    // tumbling spin makes bounces flashy (and flips possible)
    var sg = (w.vx >= 0 ? 1 : -1);
    w.av = sg * 7.5;
    o.hitT = w.t;
    if (w.t - w.lastBounce > 0.08) {
      w.lastBounce = w.t;
      w.ev.push({ type: 'bounce', kind: kind, x: px - nx * PR, y: py - ny * PR, nx: nx, ny: ny, o: o, v: out });
    }
  }

  var SHSim = {
    G: G, RANGE: RANGE, PR: PR, MAXV: MAXV,
    build: build, create: create, clone: clone, step: step, speed: speed,
    findTarget: findTarget, updateMovers: updateMovers,
    addHook: addHook, addWall: addWall, addPad: addPad, addBumper: addBumper,
    addSaw: addSaw, addSpinner: addSpinner, addRing: addRing
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SHSim;
  else root.SHSim = SHSim;
})(typeof window !== 'undefined' ? window : this);
