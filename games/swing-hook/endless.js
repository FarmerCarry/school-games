/*
 * Swing Hook — endless mode generator + simple autopilot (used by the
 * title-screen attract mode). No DOM; also loads in Node for testing.
 */
(function (root) {
  'use strict';
  var Sim = (typeof module !== 'undefined' && module.exports) ? require('./sim.js') : root.SHSim;

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createLevel(seed, gentle) {
    var L = Sim.build({ name: 'بلا نهاية', endless: true, start: [150, 450], finish: 1e9, sea: 900, hooks: [[420, 320]] });
    var g = { x: 420, y: 320, r: rng(seed || 1), n: 0, gentle: !!gentle, last: '' };
    L.gen = g;
    return L;
  }

  function R(g, a, b) { return a + g.r() * (b - a); }

  // Append content until the level reaches toX.
  function extend(L, toX) {
    var g = L.gen;
    while (g.x < toX) {
      var d = g.gentle ? 0 : Math.min(1, g.x / 40000); // difficulty 0..1
      var p = g.r();
      var kind;
      if (g.n < 2 || g.gentle) kind = 'hooks';
      else if (p < 0.30) kind = 'hooks';
      else if (p < 0.43) kind = 'pad';
      else if (p < 0.55) kind = 'ring';
      else if (p < 0.66) kind = 'bumpers';
      else if (p < 0.77) kind = 'moving';
      else if (p < 0.89) kind = 'saws';
      else kind = 'spinner';
      if (kind === g.last && kind !== 'hooks') kind = 'hooks';
      g.last = kind; g.n++;
      chunk(L, g, kind, d);
    }
  }

  function nextHook(L, g, d, opts) {
    opts = opts || {};
    g.x += R(g, 330, 400 + 60 * d) + (opts.extra || 0);
    g.y = Math.max(210, Math.min(420, g.y + R(g, -90, 90)));
    if (opts.y != null) g.y = opts.y;
    return Sim.addHook(L, opts.move ? { x: g.x, y: g.y, mx: opts.move[0], my: opts.move[1], sp: opts.sp || 1.6, ph: R(g, 0, 6) } : [g.x, g.y]);
  }

  function chunk(L, g, kind, d) {
    var i, n;
    if (kind === 'hooks') {
      n = 3 + Math.floor(g.r() * 3);
      for (i = 0; i < n; i++) nextHook(L, g, d);
    } else if (kind === 'pad') {
      // a gap with a springy pad below it
      var px = g.x + 380;
      Sim.addPad(L, [px - 120, 800, px + 130, 770, 1250]);
      g.x = px + 260; g.y = 330;
      Sim.addHook(L, [g.x, g.y]);
      nextHook(L, g, d);
    } else if (kind === 'ring') {
      nextHook(L, g, d, { y: 360 });
      Sim.addRing(L, [g.x + 330, g.y + 60, -22, 1500]);
      g.x += 780; g.y = 280;
      Sim.addHook(L, [g.x, g.y]);
      nextHook(L, g, d);
    } else if (kind === 'bumpers') {
      nextHook(L, g, d);
      var bx = g.x + 260;
      Sim.addBumper(L, [bx, g.y + 330, 44, 1050]);
      Sim.addBumper(L, [bx + 190, g.y + 250, 38, 1000]);
      nextHook(L, g, d, { extra: 80 });
      nextHook(L, g, d);
    } else if (kind === 'moving') {
      n = 2 + Math.floor(g.r() * 2);
      for (i = 0; i < n; i++) nextHook(L, g, d, { move: g.r() < 0.5 ? [0, 60 + 40 * d] : [50 + 30 * d, 0], sp: 1.3 + d });
      nextHook(L, g, d);
    } else if (kind === 'saws') {
      var h1 = nextHook(L, g, d);
      var h2 = nextHook(L, g, d);
      Sim.addSaw(L, { x: (h1.x + h2.x) / 2, y: Math.max(h1.y, h2.y) + 380, r: 42, mx: 90 * d, sp: 1.4 });
      if (d > 0.3) Sim.addSaw(L, [(h1.x + h2.x) / 2 + 40, Math.min(h1.y, h2.y) - 330, 36]);
      nextHook(L, g, d);
    } else if (kind === 'spinner') {
      var a = nextHook(L, g, d, { y: 300 });
      var b = nextHook(L, g, d, { y: 300, extra: 60 });
      Sim.addSpinner(L, { x: (a.x + b.x) / 2, y: 690, len: 110 + 40 * d, sp: 1.4 + d, arms: 2 });
      nextHook(L, g, d);
    }
  }

  // Throw away things far behind the player so arrays stay small.
  function prune(L, beforeX) {
    function keep(list, xf) { var j = 0; for (var i = 0; i < list.length; i++) if (xf(list[i]) >= beforeX) list[j++] = list[i]; list.length = j; }
    keep(L.hooks, function (o) { return o.x + (o.mx || 0) + (o.orb || 0); });
    keep(L.walls, function (o) { return o.x + o.w; });
    keep(L.pads, function (o) { return Math.max(o.x1, o.x2); });
    keep(L.bumpers, function (o) { return o.x + o.r; });
    keep(L.saws, function (o) { return o.x + (o.mx || 0) + o.r; });
    keep(L.spinners, function (o) { return o.x + o.len; });
    keep(L.rings, function (o) { return o.x + o.r; });
  }

  // A simple bot: grab the hook ahead, let go on the up-swing.
  function autopilot(w, m) {
    if (w.st === 'ready') return w.t > 0.8;
    if (w.st !== 'play') return false;
    if (m.rel == null) m.rel = 0.55;
    if (w.hook) {
      var h = w.hook;
      if (w.x < h.cx + 20 || w.vx < 120) return true;
      var a = Math.atan2(-w.vy, w.vx);
      if (a > m.rel) { m.rel = 0.45 + Math.random() * 0.3; return false; }
      return true;
    }
    var t = w.target;
    if (!t || t.cx < w.x + 60) return false;
    var dx = t.cx - w.x, dy = t.cy - w.y;
    return w.vy > -150 || dx * dx + dy * dy < 260 * 260;
  }

  var SHEndless = { createLevel: createLevel, extend: extend, prune: prune, autopilot: autopilot };
  if (typeof module !== 'undefined' && module.exports) module.exports = SHEndless;
  else root.SHEndless = SHEndless;
})(typeof window !== 'undefined' ? window : this);
