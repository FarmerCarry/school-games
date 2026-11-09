/* Egg Rush drawing. Everything is drawn in canvas code: the yard of each level is
 * rendered once into an offscreen canvas (per pixel scale), obstacles, nests, eggs and
 * babies are cached sprites, and only the kid and the guards (whose eyes, heads and
 * hops change every frame) are drawn as paths. No image files, no shadowBlur, no
 * per-frame gradients. */
(function () {
  'use strict';
  var ER = window.ER, W = ER.W, H = ER.H, TAU = Math.PI * 2;
  var INK = '#2a1d3e';
  var A = ER.art = {};
  var SS = 2;
  A.INK = INK;

  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function ink(g, lw) { g.lineWidth = lw || 4; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function fi(g, c, lw) { g.fillStyle = c; g.fill(); ink(g, lw); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(hex, a) { return 'rgb(' + rgb(hex).map(function (v) { return Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)); }).join(',') + ')'; }
  function alpha(hex, a) { return 'rgba(' + rgb(hex).join(',') + ',' + a + ')'; }
  function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); }
  function starPath(g, x, y, R, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  function eggPath(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r * 1.28);
    g.bezierCurveTo(x + r * 0.95, y - r * 1.25, x + r * 1.05, y + r * 0.95, x, y + r * 0.98);
    g.bezierCurveTo(x - r * 1.05, y + r * 0.95, x - r * 0.95, y - r * 1.25, x, y - r * 1.28);
    g.closePath();
  }
  function seeded(n) { return function () { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }
  A.circle = circle; A.rr = rr; A.ell = ell; A.starPath = starPath; A.eggPath = eggPath; A.shade = shade; A.alpha = alpha;

  var cache = {};
  function sprite(key, w, h, draw) {
    if (cache[key]) return cache[key];
    var c = cv(w * SS, h * SS), g = c.getContext('2d');
    g.scale(SS, SS); draw(g, w, h);
    return (cache[key] = c);
  }
  A.reset = function () { cache = {}; groundC = null; groundKey = ''; };

  // Text: Arabic is drawn right to left in one piece; digits and keycaps left to right.
  A.text = function (ctx, s, x, y, size, color, o) {
    o = o || {};
    ctx.font = (o.weight || 700) + ' ' + size + 'px Fredoka, sans-serif';
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = /[؀-ۿ]/.test(s) ? 'rtl' : 'ltr';
    if (o.stroke !== 0) { ctx.lineWidth = o.stroke || Math.max(4, size * 0.2); ctx.strokeStyle = o.ink || INK; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
    ctx.direction = 'ltr';
  };

  /* ------------------------------------------------------------- biomes */
  var BIOME = {
    farm: { g0: '#a6e870', g1: '#7cca4c', dark: '#5ea83a', light: '#c6f592', tuft: '#5a9e34', flower: ['#ffffff', '#ffe14d', '#ff8fb8', '#b9a4ff'], path: '#ecc98c', pathEdge: '#d2a463' },
    pond: { g0: '#9ae47a', g1: '#6cc25a', dark: '#4fa043', light: '#c2f59c', tuft: '#4c9a3c', flower: ['#ffffff', '#ffe14d', '#8fd8ff'], path: '#e6cf98', pathEdge: '#c8ab6c' },
    snow: { g0: '#fbfeff', g1: '#dcecfa', dark: '#bcd6ee', light: '#ffffff', tuft: '#c9dff2', flower: ['#ffffff', '#cfe8ff'], path: '#e6eef8', pathEdge: '#bcd0e6' },
    desert: { g0: '#ffe7aa', g1: '#f5c66e', dark: '#e2a656', light: '#fff2c8', tuft: '#d79a4e', flower: ['#ff7aa8', '#ffffff', '#ffd23f'], path: '#f9dc9c', pathEdge: '#dcae64' },
    dino: { g0: '#a8dc6a', g1: '#73b44a', dark: '#4f9338', light: '#c8ee8e', tuft: '#46852f', flower: ['#ff9f43', '#ffe14d', '#ff6fb5'], path: '#d9b27a', pathEdge: '#b48850' }
  };
  A.BIOME = BIOME;
  // Eggs and babies by world.
  A.EGG = [
    { base: '#fff6e2', dot: '#e8cfa0' }, { base: '#e2f8ee', dot: '#b5e0cc' }, { base: '#f3f8ff', dot: '#c8d8ee' },
    { base: '#fff0c8', dot: '#e6c88c' }, { base: '#cdf0a4', dot: '#7fc157' }
  ];
  A.COLORS = ER.COLORS.map(function (c) { return c.c; });
  A.P2 = ['#3f8cff', '#ff5a5f'];

  /* ------------------------------------------------------------ sprites */
  // A nest of straw (giant for the big golden egg, home for the kid's own).
  function nestSprite(kind) {
    var big = kind === 'giant' ? 1.45 : kind === 'home' ? 1.9 : 1;
    var w = 92 * big, h = 50 * big;
    return sprite('nest' + kind, w + 12, h + 12, function (g) {
      var x = (w + 12) / 2, y = (h + 12) / 2, rx = w / 2, ry = h / 2;
      ell(g, x, y + 4, rx, ry); fill(g, 'rgba(60,30,10,0.22)');
      ell(g, x, y, rx, ry); fi(g, '#c98a3e', 4);
      ell(g, x, y - 2, rx * 0.66, ry * 0.52); fill(g, '#7a4a1e');
      if (kind === 'home') { ell(g, x, y - 3, rx * 0.6, ry * 0.46); fill(g, '#fff1d8'); ell(g, x - rx * 0.15, y - 6, rx * 0.25, ry * 0.18); fill(g, '#ffffff'); }
      var rnd = seeded(kind.length * 977 + 11);
      g.lineCap = 'round';
      for (var i = 0; i < 40 * big; i++) {
        var a = rnd() * TAU, rr0 = 0.72 + rnd() * 0.28, px = x + Math.cos(a) * rx * rr0, py = y + Math.sin(a) * ry * rr0, l = 8 + rnd() * 10;
        var ta = a + Math.PI / 2 + (rnd() - 0.5) * 0.8;
        g.strokeStyle = ['#f2c66a', '#e0a84c', '#b47a34', '#ffd98a'][i % 4]; g.lineWidth = 2.6;
        line(g, px - Math.cos(ta) * l / 2, py - Math.sin(ta) * l / 2 * 0.6, px + Math.cos(ta) * l / 2, py + Math.sin(ta) * l / 2 * 0.6); g.stroke();
      }
      ell(g, x, y, rx, ry); ink(g, 4);
    });
  }
  A.nest = function (ctx, x, y, kind) {
    var s = nestSprite(kind || 'n'), w = s.width / SS, h = s.height / SS;
    ctx.drawImage(s, x - w / 2, y - h / 2 + 6, w, h);
  };
  function eggSprite(world, gold) {
    var r = gold === 2 ? 24 : 15;
    return sprite('egg' + world + '_' + gold, r * 2.6 + 8, r * 2.8 + 8, function (g, w, h) {
      var x = w / 2, y = h / 2 + r * 0.12;
      var base = gold ? '#ffd23f' : A.EGG[world].base;
      eggPath(g, x, y, r); fi(g, base, gold === 2 ? 5 : 4);
      eggPath(g, x, y, r); g.save(); g.clip();
      ell(g, x + r * 0.45, y + r * 0.35, r * 0.85, r * 1.1); fill(g, gold ? '#f0a820' : shade(base, -0.08));
      if (!gold) {
        var rnd = seeded(world * 31 + 7);
        for (var i = 0; i < 9; i++) { circle(g, x + (rnd() - 0.5) * r * 1.5, y + (rnd() - 0.5) * r * 1.8, 1.2 + rnd() * 2.2); fill(g, A.EGG[world].dot); }
      }
      ell(g, x - r * 0.38, y - r * 0.55, r * 0.26, r * 0.42, -0.4); fill(g, 'rgba(255,255,255,0.85)');
      g.restore();
      if (gold) { starPath(g, x + r * 0.1, y + r * 0.15, r * 0.48, r * 0.22); fi(g, '#fff6c2', 2.5); }
      eggPath(g, x, y, r); ink(g, gold === 2 ? 5 : 4);
    });
  }
  // An egg centred at (x, y); rot wobbles it.
  A.egg = function (ctx, x, y, world, gold, rot, scale) {
    var s = eggSprite(world, gold || 0), w = s.width / SS * (scale || 1), h = s.height / SS * (scale || 1);
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(s, -w / 2, -h / 2, w, h); ctx.restore(); }
    else ctx.drawImage(s, x - w / 2, y - h / 2, w, h);
  };

  /* -------------------------------------------------------------- babies */
  function babySprite(world, gold) {
    return sprite('baby' + world + (gold ? 'g' : ''), 64, 64, function (g) {
      var x = 32, y = 38;
      var body = gold ? '#ffd23f' : ['#ffe14d', '#ffe66a', '#9aa6b8', '#c9a27a', '#8fd86a'][world];
      var belly = gold ? '#fff3b0' : ['#fff3a6', '#fff6b8', '#ffffff', '#ead3b4', '#d8f7b0'][world];
      var beak = ['#ff9a2e', '#ff8a2a', '#ffb02e', '#ff9a6a', '#ff8fb0'][world];
      // feet
      g.fillStyle = beak;
      if (world !== 4) { ell(g, x - 7, y + 15, 5, 3); fi(g, beak, 2.5); ell(g, x + 7, y + 15, 5, 3); fi(g, beak, 2.5); }
      if (world === 3) {
        // a long-legged, long-necked ostrich chick with stripes
        g.lineWidth = 3; g.strokeStyle = INK; line(g, x - 5, y + 6, x - 7, y + 14); g.stroke(); line(g, x + 5, y + 6, x + 7, y + 14); g.stroke();
        ell(g, x, y + 2, 15, 12); fi(g, body, 3.5);
        g.strokeStyle = shade(body, -0.25); g.lineWidth = 3;
        for (var s = -1; s <= 1; s++) { line(g, x + s * 6 - 2, y - 6, x + s * 6 + 2, y + 10); g.stroke(); }
        g.lineWidth = 9; g.strokeStyle = INK; line(g, x + 6, y - 4, x + 10, y - 18); g.stroke();
        g.lineWidth = 5; g.strokeStyle = '#ffd2b8'; line(g, x + 6, y - 4, x + 10, y - 18); g.stroke();
        circle(g, x + 10, y - 22, 8); fi(g, belly, 3);
        g.beginPath(); g.moveTo(x + 16, y - 24); g.lineTo(x + 24, y - 21); g.lineTo(x + 16, y - 18); g.closePath(); fi(g, beak, 2);
        circle(g, x + 12, y - 24, 2.4); fill(g, INK); circle(g, x + 12.8, y - 24.8, 0.9); fill(g, '#fff');
        if (gold) { starPath(g, x - 14, y - 16, 5, 2.2); fill(g, '#fff'); }
        return;
      }
      if (world === 4) {
        // a baby dino: round, with tiny plates and a tail
        g.beginPath(); g.moveTo(x - 10, y + 4); g.quadraticCurveTo(x - 26, y + 6, x - 24, y - 4); g.quadraticCurveTo(x - 16, y + 0, x - 8, y - 4); g.closePath(); fi(g, body, 3);
        for (var p = 0; p < 3; p++) { g.beginPath(); g.moveTo(x - 10 + p * 8, y - 14 + p * 2); g.lineTo(x - 6 + p * 8, y - 22 + p * 2); g.lineTo(x - 2 + p * 8, y - 13 + p * 2); g.closePath(); fi(g, gold ? '#ff9f43' : '#ffb347', 2.5); }
        ell(g, x, y, 16, 15); fi(g, body, 3.5);
        ell(g, x + 3, y + 4, 9, 8); fill(g, belly);
        ell(g, x - 6, y + 15, 5, 3); fi(g, body, 2.5); ell(g, x + 7, y + 15, 5, 3); fi(g, body, 2.5);
        circle(g, x + 6, y - 5, 3.2); fill(g, INK); circle(g, x + 7, y - 6, 1.2); fill(g, '#fff');
        circle(g, x - 4, y - 5, 3.2); fill(g, INK); circle(g, x - 3, y - 6, 1.2); fill(g, '#fff');
        g.beginPath(); g.arc(x + 2, y + 2, 4, 0.2, Math.PI - 0.2); ink(g, 2);
        if (gold) { starPath(g, x + 18, y - 16, 5, 2.2); fill(g, '#fff'); }
        return;
      }
      // chick, duckling, penguin chick
      ell(g, x, y, 17, 16); fi(g, body, 3.5);
      if (world === 2) { ell(g, x, y + 3, 11, 11); fill(g, belly); ell(g, x, y - 5, 10, 7); fill(g, '#ffffff'); }
      else { ell(g, x + 2, y + 5, 10, 8); fill(g, belly); }
      // tuft and wing
      g.beginPath(); g.moveTo(x - 2, y - 15); g.quadraticCurveTo(x, y - 25, x + 4, y - 16); ink(g, 3);
      ell(g, x - 11, y + 2, 6, 8, 0.4); fi(g, shade(body, -0.08), 2.5);
      circle(g, x - 4, y - 4, 3); fill(g, INK); circle(g, x + 7, y - 4, 3); fill(g, INK);
      circle(g, x - 3.2, y - 5, 1.1); fill(g, '#fff'); circle(g, x + 7.8, y - 5, 1.1); fill(g, '#fff');
      if (world === 1) { ell(g, x + 2, y + 2, 7, 3.4); fi(g, beak, 2.5); }
      else { g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + 6, y); g.lineTo(x + 2, y + 6); g.closePath(); fi(g, beak, 2.2); }
      ell(g, x - 10, y + 4, 3.5, 2); fill(g, 'rgba(255,110,140,0.55)'); ell(g, x + 13, y + 4, 3.5, 2); fill(g, 'rgba(255,110,140,0.55)');
      if (gold) { starPath(g, x + 15, y - 15, 5.5, 2.4); fi(g, '#fff', 1.5); }
    });
  }
  // A baby at (x, y) (its feet), facing face (1 right, -1 left), hopping by hop 0..1.
  A.baby = function (ctx, x, y, world, gold, face, hop, scale) {
    var s = babySprite(world, gold), k = (scale || 1), sq = hop ? Math.sin(hop * Math.PI) : 0;
    var w = 64 * k, h = 64 * k;
    ctx.save();
    ctx.translate(x, y);
    ell(ctx, 0, 0, 14 * k * (1 - sq * 0.3), 4.5 * k); fill(ctx, 'rgba(40,20,10,0.18)');
    ctx.translate(0, -sq * 14 * k);
    if (face < 0) ctx.scale(-1, 1);
    ctx.scale(1 - sq * 0.08, 1 + sq * 0.1);
    ctx.drawImage(s, -w / 2, -h * 0.84, w, h);
    ctx.restore();
  };
  A.babyIcon = function (c, world, gold, locked) {
    var g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.save(); g.scale(c.width / 96, c.height / 96);
    if (locked) g.globalAlpha = 0.25;
    A.baby(g, 48, 80, world, gold, 1, 0, 1.25);
    g.restore();
  };

  /* ----------------------------------------------------------- obstacles */
  // Each footprint is drawn with a little height above it (a 3/4 top-down look).
  var TALL = { hay: 0.55, barrel: 0.9, bush: 0.6, fence: 0, reeds: 0.9, log: 0.4, snow: 0.45, iceblock: 0.7, cactus: 1.5, rock: 0.5, palm: 0, fern: 0.6, bones: 0.4, house: 0 };
  function obsSprite(o) {
    var key = o.kind + o.w + 'x' + o.h, k = o.kind;
    var up = k === 'fence' ? (o.w > o.h ? 34 : 22) : k === 'palm' ? 120 : k === 'house' ? 124 : Math.round(Math.min(o.w, o.h) * (TALL[k] || 0.5)) + 8;
    var pad = k === 'palm' ? 60 : k === 'fern' ? 26 : k === 'house' ? 16 : 12;
    var c = sprite(key, o.w + pad * 2, o.h + up + pad * 2, function (g) {
      g.translate(pad, pad + up);
      DRAW[k] ? DRAW[k](g, o.w, o.h, up) : DRAW.rock(g, o.w, o.h, up);
    });
    c.ox = pad; c.oy = pad + up;
    return c;
  }
  A.obstacle = function (ctx, o) {
    var s = obsSprite(o);
    ctx.drawImage(s, o.x - s.ox, o.y - s.oy, s.width / SS, s.height / SS);
  };
  function blob(g, x, y, w, h) { ell(g, x + w / 2 + 3, y + h - 2, w / 2 + 4, h * 0.3 + 4); fill(g, 'rgba(30,20,10,0.2)'); }
  var DRAW = {
    hay: function (g, w, h, up) {
      blob(g, 0, 0, w, h);
      var top = h * 0.72, d = up;
      rr(g, 0, top - d, w, h - top + d, 10); fi(g, '#e8a93a', 4);
      rr(g, 0, -d + 2, w, top, 12); fi(g, '#ffd45e', 4);
      g.strokeStyle = '#d8a13c'; g.lineWidth = 2.5;
      for (var i = 1; i < 7; i++) { line(g, 6, -d + 2 + top * i / 7, w - 6, -d + 2 + top * i / 7 + (i % 2 ? 2 : -2)); g.stroke(); }
      g.strokeStyle = '#c0392b'; g.lineWidth = 5;
      line(g, w * 0.3, -d + 4, w * 0.3, h - 2); g.stroke(); line(g, w * 0.7, -d + 4, w * 0.7, h - 2); g.stroke();
      rr(g, 0, -d + 2, w, top, 12); ink(g, 4);
      rr(g, 0, -d + 2, w, h + d - 4, 12); ink(g, 4);
    },
    barrel: function (g, w, h, up) {
      blob(g, 0, 0, w, h);
      var cx = w / 2, rx = w / 2, ry = h * 0.32;
      g.beginPath(); g.moveTo(0, h * 0.5 - up); g.lineTo(0, h * 0.62); g.ellipse(cx, h * 0.62, rx, ry, 0, Math.PI, 0, true); g.lineTo(w, h * 0.5 - up); g.closePath();
      fi(g, '#b8743a', 4);
      g.strokeStyle = '#5b5f6e'; g.lineWidth = 5;
      g.beginPath(); g.ellipse(cx, h * 0.62 - up * 0.25, rx - 1, ry, 0, 0.1, Math.PI - 0.1); g.stroke();
      g.beginPath(); g.ellipse(cx, h * 0.62 - up * 0.75, rx - 1, ry, 0, 0.1, Math.PI - 0.1); g.stroke();
      ell(g, cx, h * 0.5 - up, rx, ry); fi(g, '#d99a58', 4);
      ell(g, cx, h * 0.5 - up, rx * 0.72, ry * 0.68); g.strokeStyle = '#a8662e'; g.lineWidth = 3; g.stroke();
      line(g, cx - rx * 0.5, h * 0.5 - up, cx + rx * 0.5, h * 0.5 - up); g.stroke();
    },
    bush: function (g, w, h, up) {
      blob(g, 0, 0, w, h);
      var rnd = seeded(w * 7 + h), n = Math.max(3, Math.round(w / 26));
      var pts = [];
      for (var i = 0; i < n; i++) pts.push([w * (0.15 + 0.7 * i / (n - 1)), h * 0.55 - up * (0.4 + rnd() * 0.5), Math.min(w, h) * (0.36 + rnd() * 0.12)]);
      pts.push([w * 0.5, h * 0.62 - up * 0.2, Math.min(w, h) * 0.5]);
      pts.forEach(function (p) { circle(g, p[0], p[1], p[2] + 2); ink(g, 8); });
      pts.forEach(function (p) { circle(g, p[0], p[1], p[2]); fill(g, '#3fae4a'); });
      pts.forEach(function (p) { circle(g, p[0] - p[2] * 0.25, p[1] - p[2] * 0.3, p[2] * 0.55); fill(g, '#62cf5e'); });
      for (var j = 0; j < 5; j++) { circle(g, w * (0.2 + rnd() * 0.6), h * 0.5 - up * rnd() * 0.8, 3.2); fi(g, ['#ff5a7a', '#ffffff', '#ffd23f'][j % 3], 1.8); }
    },
    fence: function (g, w, h, up) {
      var horiz = w > h;
      if (horiz) {
        ell(g, w / 2, h + 2, w / 2, 5); fill(g, 'rgba(30,20,10,0.18)');
        rr(g, 0, h * 0.5 - up * 0.75, w, 8, 3); fi(g, '#e3a55e', 3);
        rr(g, 0, h * 0.5 - up * 0.35, w, 8, 3); fi(g, '#e3a55e', 3);
        for (var x = 0; x <= w - 12; x += Math.max(24, (w - 12) / Math.round((w - 12) / 30))) { rr(g, x, -up + h * 0.5 - 4, 12, up + 8, 4); fi(g, '#c98a46', 3); rr(g, x + 2, -up + h * 0.5 - 4, 8, 4, 2); fill(g, '#f1c27a'); }
        rr(g, w - 12, -up + h * 0.5 - 4, 12, up + 8, 4); fi(g, '#c98a46', 3);
      } else {
        rr(g, w * 0.5 - 6, -up, 12, h + up, 4); fi(g, '#e3a55e', 3);
        for (var y = 0; y <= h - 10; y += Math.max(26, (h - 10) / Math.round((h - 10) / 30))) { rr(g, w * 0.5 - 8, y - up, 16, up + 10, 5); fi(g, '#c98a46', 3); rr(g, w * 0.5 - 6, y - up, 12, 4, 2); fill(g, '#f1c27a'); }
        rr(g, w * 0.5 - 8, h - 10 - up, 16, up + 10, 5); fi(g, '#c98a46', 3);
      }
    },
    reeds: function (g, w, h, up) {
      ell(g, w / 2, h * 0.7, w / 2 + 2, h * 0.3); fill(g, 'rgba(20,60,40,0.25)');
      var rnd = seeded(w * 13 + h * 3);
      for (var i = 0; i < 9; i++) {
        var x = w * (0.1 + 0.8 * i / 8) + (rnd() - 0.5) * 6, top = -up * (0.6 + rnd() * 0.5), bend = (rnd() - 0.5) * 16;
        g.beginPath(); g.moveTo(x, h * 0.8); g.quadraticCurveTo(x + bend * 0.3, (h * 0.8 + top) / 2, x + bend, top); g.lineWidth = 8; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
        g.lineWidth = 4.5; g.strokeStyle = i % 2 ? '#4caf50' : '#6ccf5a'; g.stroke();
        if (i % 3 === 1) { ell(g, x + bend, top + 6, 4.5, 10); fi(g, '#8a5a2e', 2.5); }
      }
    },
    log: function (g, w, h, up) {
      blob(g, 0, 0, w, h);
      rr(g, 0, -up * 0.5, w, h + up * 0.3, h * 0.5); fi(g, '#a86a34', 4);
      g.strokeStyle = '#7d4c22'; g.lineWidth = 2.5;
      for (var i = 1; i < 4; i++) { line(g, w * i / 4 - 8, -up * 0.3 + 6, w * i / 4 + 8, -up * 0.3 + 8); g.stroke(); }
      ell(g, w - h * 0.35, (h - up * 0.2) / 2 - up * 0.1, h * 0.32, h * 0.5); fi(g, '#e8b878', 3);
      ell(g, w - h * 0.35, (h - up * 0.2) / 2 - up * 0.1, h * 0.15, h * 0.24); g.strokeStyle = '#b88048'; g.lineWidth = 2; g.stroke();
    },
    snow: function (g, w, h, up) {
      ell(g, w / 2, h * 0.75, w / 2 + 4, h * 0.32); fill(g, 'rgba(90,130,190,0.25)');
      g.beginPath(); g.moveTo(0, h * 0.75);
      g.bezierCurveTo(w * 0.05, -up * 0.6, w * 0.35, -up * 1.1, w * 0.55, -up * 0.6);
      g.bezierCurveTo(w * 0.7, -up * 1.0, w * 1.0, -up * 0.3, w, h * 0.75);
      g.quadraticCurveTo(w * 0.5, h * 1.05, 0, h * 0.75); g.closePath();
      fi(g, '#ffffff', 4);
      g.beginPath(); g.moveTo(w * 0.15, h * 0.7); g.quadraticCurveTo(w * 0.5, h * 0.95, w * 0.88, h * 0.65); g.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.15, h * 0.7); fill(g, '#d7e8fa');
      circle(g, w * 0.32, -up * 0.45, 4); fill(g, '#eef6ff');
    },
    iceblock: function (g, w, h, up) {
      blob(g, 0, 0, w, h);
      // a big frosty ice cube: front face, top face, shine and a few snow crumbs
      rr(g, 0, h * 0.3 - up, w, h * 0.7 + up, 12); fi(g, '#9fe0fb', 4);
      g.save(); rr(g, 0, h * 0.3 - up, w, h * 0.7 + up, 12); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(w * 0.15, h); g.lineTo(w * 0.45, h * 0.3 - up); g.lineTo(w * 0.62, h * 0.3 - up); g.lineTo(w * 0.32, h); g.closePath(); g.fill();
      g.restore();
      rr(g, 2, -up, w - 4, h * 0.5, 12); fi(g, '#e2f7ff', 4);
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; line(g, w * 0.22, -up + 9, w * 0.55, -up + 9); g.stroke();
      ell(g, w * 0.3, -up + 3, w * 0.24, 6); fill(g, '#ffffff');
      ell(g, w * 0.72, -up + 4, w * 0.16, 5); fill(g, '#ffffff');
      rr(g, 0, h * 0.3 - up, w, h * 0.7 + up, 12); ink(g, 4);
    },
    cactus: function (g, w, h, up) {
      ell(g, w / 2, h * 0.75, w * 0.6, h * 0.25); fill(g, 'rgba(120,60,10,0.22)');
      var cx = w / 2, tw = w * 0.42;
      function arm(dir, y0, len) {
        g.beginPath(); g.moveTo(cx + dir * tw * 0.5, y0); g.lineTo(cx + dir * (tw * 0.5 + 12), y0); g.lineTo(cx + dir * (tw * 0.5 + 12), y0 - len);
        g.lineWidth = 15; g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); g.lineWidth = 8; g.strokeStyle = '#4fbf55'; g.stroke();
      }
      arm(-1, -up * 0.35, up * 0.32); arm(1, -up * 0.55, up * 0.3);
      rr(g, cx - tw / 2, -up, tw, up + h * 0.7, tw / 2); fi(g, '#4fbf55', 4);
      g.strokeStyle = '#3a9a44'; g.lineWidth = 2.5; line(g, cx, -up + 8, cx, h * 0.6); g.stroke();
      circle(g, cx, -up + 2, 5); fi(g, '#ff7aa8', 2.5);
    },
    rock: function (g, w, h, up) {
      blob(g, 0, 0, w, h);
      g.beginPath(); g.moveTo(2, h * 0.8);
      g.quadraticCurveTo(-2, -up * 0.3, w * 0.3, -up * 0.8); g.quadraticCurveTo(w * 0.6, -up * 1.1, w * 0.85, -up * 0.5);
      g.quadraticCurveTo(w + 4, h * 0.2, w - 2, h * 0.8); g.quadraticCurveTo(w / 2, h + 4, 2, h * 0.8); g.closePath();
      fi(g, '#a39aa8', 4);
      g.beginPath(); g.moveTo(w * 0.2, -up * 0.2); g.quadraticCurveTo(w * 0.35, -up * 0.75, w * 0.6, -up * 0.75); g.quadraticCurveTo(w * 0.42, -up * 0.45, w * 0.2, -up * 0.2); fill(g, '#cbc4cf');
      g.beginPath(); g.moveTo(w * 0.55, h * 0.75); g.quadraticCurveTo(w * 0.85, h * 0.6, w * 0.92, h * 0.2); g.lineWidth = 3; g.strokeStyle = '#7c7484'; g.stroke();
    },
    palm: function (g, w, h, up) {
      ell(g, w / 2 + 16, h * 0.7, 48, 16); fill(g, 'rgba(60,40,10,0.2)');
      g.beginPath(); g.moveTo(w * 0.3, h * 0.6); g.quadraticCurveTo(w * 0.1, -up * 0.5, w * 0.6, -up + 10); g.lineTo(w * 0.85, -up + 14); g.quadraticCurveTo(w * 0.45, -up * 0.45, w * 0.75, h * 0.6); g.closePath();
      fi(g, '#b07a44', 4);
      g.strokeStyle = '#8a5a30'; g.lineWidth = 2.5;
      for (var i = 1; i < 6; i++) { var yy = h * 0.6 - (up + h * 0.6) * i / 6; line(g, w * 0.25, yy, w * 0.75, yy - 4); g.stroke(); }
      var cx = w * 0.72, cy = -up + 12;
      [[-1.2, 56], [-0.5, 60], [0.3, 58], [1.0, 54], [2.2, 50], [2.9, 54], [3.8, 46]].forEach(function (f) {
        var a = f[0], l = f[1], ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * l * 0.55 + 10;
        g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + ex) / 2 + Math.sin(a) * 14, (cy + ey) / 2 - 18, ex, ey);
        g.quadraticCurveTo((cx + ex) / 2, (cy + ey) / 2 - 2, cx, cy); fi(g, '#3fae4a', 3.5);
      });
      circle(g, cx - 6, cy + 6, 6); fi(g, '#8a5a2e', 2.5); circle(g, cx + 6, cy + 7, 6); fi(g, '#8a5a2e', 2.5);
    },
    fern: function (g, w, h, up) {
      ell(g, w / 2, h * 0.7, w / 2 + 6, h * 0.32); fill(g, 'rgba(20,50,10,0.25)');
      var cx = w / 2, cy = h * 0.6;
      [[-2.7, 1], [-2.2, 1.1], [-1.6, 1.15], [-1.0, 1.1], [-0.45, 1]].forEach(function (f, i) {
        var a = f[0], l = Math.max(w, h) * 0.62 * f[1], ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * (l * 0.6 + up * 0.8);
        g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + ex) / 2 - Math.sin(a) * 10, (cy + ey) / 2 - 10, ex, ey);
        g.quadraticCurveTo((cx + ex) / 2 + Math.sin(a) * 10, (cy + ey) / 2 + 6, cx, cy);
        fi(g, i % 2 ? '#2f9a46' : '#45b85a', 3.5);
        g.strokeStyle = '#1f7a36'; g.lineWidth = 2; line(g, cx, cy, ex, ey); g.stroke();
      });
    },
    bones: function (g, w, h, up) {
      blob(g, 0, 0, w, h);
      function bone(x0, y0, x1, y1) {
        g.lineCap = 'round';
        g.lineWidth = 16; g.strokeStyle = INK; line(g, x0, y0, x1, y1); g.stroke();
        [[x0, y0], [x1, y1]].forEach(function (p) { circle(g, p[0] - 4, p[1] - 3, 8); ink(g, 8); circle(g, p[0] + 4, p[1] + 3, 8); ink(g, 8); });
        g.lineWidth = 9; g.strokeStyle = '#fff6e0'; line(g, x0, y0, x1, y1); g.stroke();
        [[x0, y0], [x1, y1]].forEach(function (p) { circle(g, p[0] - 4, p[1] - 3, 8); fill(g, '#fff6e0'); circle(g, p[0] + 4, p[1] + 3, 8); fill(g, '#fff6e0'); });
      }
      bone(10, h * 0.6, w - 10, h * 0.25 - up * 0.3);
      bone(14, -up * 0.2, w - 14, h * 0.7);
    },
    house: function (g, w, h, up) {
      // the kid's farmhouse: walls, a red roof and a round door with a heart
      ell(g, w / 2, h + 6, w / 2 + 10, 16); fill(g, 'rgba(40,20,10,0.22)');
      var wall = h + up * 0.25, wy = h - wall;
      rr(g, 6, wy, w - 12, wall, 8); fi(g, '#fff1d6', 4.5);
      g.strokeStyle = '#ead1a6'; g.lineWidth = 2.5;
      for (var i = 1; i < 6; i++) { line(g, 12, wy + wall * i / 6, w - 12, wy + wall * i / 6); g.stroke(); }
      // roof
      g.beginPath(); g.moveTo(-8, wy + 14); g.lineTo(w / 2, wy - up * 0.95); g.lineTo(w + 8, wy + 14); g.closePath(); fi(g, '#e8473f', 5);
      g.save(); g.beginPath(); g.moveTo(-8, wy + 14); g.lineTo(w / 2, wy - up * 0.95); g.lineTo(w + 8, wy + 14); g.closePath(); g.clip();
      g.strokeStyle = '#c23a33'; g.lineWidth = 3;
      for (var r = 0; r < 7; r++) { var yy = wy + 14 - r * (up * 0.95 + 14) / 7; line(g, -10, yy, w + 10, yy); g.stroke(); }
      g.restore();
      g.beginPath(); g.moveTo(-8, wy + 14); g.lineTo(w / 2, wy - up * 0.95); g.lineTo(w + 8, wy + 14); g.closePath(); ink(g, 5);
      rr(g, w * 0.7, wy - up * 0.75, 18, 34, 3); fi(g, '#b8743a', 3.5);
      // round attic window
      circle(g, w / 2, wy - up * 0.35, 13); fi(g, '#8fd8ff', 3.5); line(g, w / 2 - 13, wy - up * 0.35, w / 2 + 13, wy - up * 0.35); ink(g, 2.5);
      // door and windows
      g.beginPath(); g.moveTo(w / 2 - 22, h); g.lineTo(w / 2 - 22, h - 34); g.arc(w / 2, h - 34, 22, Math.PI, 0); g.lineTo(w / 2 + 22, h); g.closePath(); fi(g, '#b8743a', 4);
      g.beginPath(); var hx = w / 2, hy = h - 36;
      g.moveTo(hx, hy + 7); g.bezierCurveTo(hx - 12, hy - 2, hx - 6, hy - 12, hx, hy - 5); g.bezierCurveTo(hx + 6, hy - 12, hx + 12, hy - 2, hx, hy + 7); fi(g, '#ff5a7a', 2.5);
      circle(g, hx + 13, h - 18, 2.5); fill(g, INK);
      [18, w - 52].forEach(function (x) {
        rr(g, x, h - 54, 34, 30, 5); fi(g, '#8fd8ff', 3.5); line(g, x + 17, h - 54, x + 17, h - 24); ink(g, 2.5);
        rr(g, x - 3, h - 26, 40, 9, 3); fi(g, '#a5643a', 3);
        for (var f = 0; f < 3; f++) { circle(g, x + 6 + f * 12, h - 28, 4); fi(g, ['#ff5a7a', '#ffd23f', '#ffffff'][f], 2); }
      });
    }
  };

  /* -------------------------------------------------------------- ground */
  var groundC = null, groundKey = '';
  A.ground = function (plan, scale) {
    var key = plan.biome + ':' + plan.li + ':' + (plan.duo ? 'd' : '') + ':' + scale;
    if (groundC && groundKey === key) return groundC;
    var c = cv(W * scale, H * scale), g = c.getContext('2d');
    g.scale(scale, scale);
    paintGround(g, plan);
    groundC = c; groundKey = key;
    return c;
  };
  function paintGround(g, plan) {
    var B = BIOME[plan.biome] || BIOME.farm, rnd = seeded(97 + (plan.li + 3) * 131 + plan.biome.length * 7);
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, B.g0); gr.addColorStop(1, B.g1);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // soft light and dark patches
    for (var i = 0; i < 30; i++) { ell(g, rnd() * W, 100 + rnd() * (H - 100), 50 + rnd() * 110, 30 + rnd() * 60); fill(g, alpha(i % 2 ? B.light : B.dark, i % 2 ? 0.35 : 0.14)); }
    // mowed stripes
    if (plan.biome !== 'snow' && plan.biome !== 'desert') {
      g.save(); g.globalAlpha = 0.07; g.fillStyle = '#ffffff';
      for (var s = -H; s < W; s += 120) { g.beginPath(); g.moveTo(s, H); g.lineTo(s + 60, H); g.lineTo(s + 60 + H * 0.5, 0); g.lineTo(s + H * 0.5, 0); g.closePath(); g.fill(); }
      g.restore();
    }
    if (plan.biome === 'snow') {
      // soft drifts with a blue shadow under each, and a trail of little footprints
      for (var sd = 0; sd < 16; sd++) {
        var sx = rnd() * W, sy = 120 + rnd() * (H - 140), srx = 40 + rnd() * 60, sry = 10 + rnd() * 8;
        g.beginPath(); g.ellipse(sx, sy + 3, srx, sry, 0, 0, Math.PI); g.lineWidth = 4; g.strokeStyle = 'rgba(150,185,225,0.45)'; g.stroke();
        ell(g, sx, sy, srx, sry); fill(g, '#ffffff');
      }
      for (var fp = 0; fp < 12; fp++) { var fpx = 300 + fp * 70, fpy = 640 + Math.sin(fp) * 18; ell(g, fpx, fpy + (fp % 2) * 10, 5, 3.5, 0.3); fill(g, 'rgba(150,185,225,0.55)'); }
    }
    if (plan.biome === 'desert') {
      g.strokeStyle = alpha(B.dark, 0.35); g.lineWidth = 3;
      for (var d = 0; d < 26; d++) { var dx = rnd() * W, dy = 110 + rnd() * (H - 110), dl = 40 + rnd() * 70; g.beginPath(); g.moveTo(dx, dy); g.quadraticCurveTo(dx + dl / 2, dy - 8, dx + dl, dy); g.stroke(); }
    }
    // a dirt path from home into the yard
    var homes = plan.homes;
    homes.forEach(function (hm, hi) {
      var dir = hm.x < W / 2 ? 1 : -1;
      g.beginPath(); g.moveTo(hm.x, hm.y + 10);
      g.bezierCurveTo(hm.x + dir * 120, hm.y + 40, hm.x + dir * 200, hm.y - 30, hm.x + dir * 330, hm.y + 4);
      g.lineCap = 'round'; g.lineWidth = 66; g.strokeStyle = B.pathEdge; g.stroke();
      g.lineWidth = 54; g.strokeStyle = B.path; g.stroke();
      for (var p = 0; p < 14; p++) { circle(g, hm.x + dir * (40 + rnd() * 280), hm.y - 10 + rnd() * 40, 2 + rnd() * 3); fill(g, alpha(B.pathEdge, 0.7)); }
    });
    // tufts, flowers, sparkles
    for (var t = 0; t < 420; t++) {
      var x = rnd() * W, y = 104 + rnd() * (H - 104);
      if (plan.biome === 'snow') { if (t % 3) continue; g.strokeStyle = alpha('#ffffff', 0.9); g.lineWidth = 2; line(g, x - 3, y, x + 3, y); g.stroke(); line(g, x, y - 3, x, y + 3); g.stroke(); continue; }
      if (plan.biome === 'desert' && t % 2) continue;
      g.strokeStyle = alpha(B.tuft, 0.75); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x - 4, y - 6); g.lineTo(x, y); g.lineTo(x + 1, y - 8); g.moveTo(x, y); g.lineTo(x + 5, y - 5); g.stroke();
    }
    for (var f = 0; f < 46; f++) {
      var fx = rnd() * W, fy = 108 + rnd() * (H - 112), fc = B.flower[f % B.flower.length];
      if (plan.biome === 'desert') { ell(g, fx, fy, 5 + rnd() * 5, 3 + rnd() * 3); fi(g, '#e7b778', 2); continue; }
      if (plan.biome === 'snow') { ell(g, fx, fy, 10 + rnd() * 16, 4 + rnd() * 5); fill(g, alpha('#c4dcf2', 0.6)); continue; }
      for (var k = 0; k < 5; k++) { circle(g, fx + Math.cos(k * 1.256) * 3.6, fy + Math.sin(k * 1.256) * 3.6, 2.8); fill(g, fc); }
      circle(g, fx, fy, 2.2); fill(g, '#ffb52e');
    }
    // water and ice
    plan.zones.forEach(function (z) {
      if (z.kind === 'water') {
        rr(g, z.x - 8, z.y - 8, z.w + 16, z.h + 16, 46); fill(g, plan.biome === 'desert' ? '#e9c27a' : '#c9b27a');
        rr(g, z.x - 3, z.y - 3, z.w + 6, z.h + 6, 40); fill(g, '#2f8fd4');
        var wg = g.createLinearGradient(0, z.y, 0, z.y + z.h); wg.addColorStop(0, '#5fd0ff'); wg.addColorStop(1, '#3aa6ea');
        rr(g, z.x + 3, z.y + 3, z.w - 6, z.h - 6, 36); g.fillStyle = wg; g.fill();
        g.save(); rr(g, z.x + 3, z.y + 3, z.w - 6, z.h - 6, 36); g.clip();
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3;
        for (var wv = 0; wv < z.w * z.h / 5000; wv++) { var wx = z.x + rnd() * z.w, wy = z.y + rnd() * z.h; g.beginPath(); g.arc(wx, wy, 10 + rnd() * 8, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
        g.restore();
        rr(g, z.x - 3, z.y - 3, z.w + 6, z.h + 6, 40); ink(g, 4);
      } else if (z.kind === 'land') {
        rr(g, z.x - 6, z.y - 6, z.w + 12, z.h + 12, 40); fi(g, '#e9cf8e', 4);
        rr(g, z.x + 4, z.y + 4, z.w - 8, z.h - 8, 32); fill(g, B.g0);
        for (var lf = 0; lf < z.w * z.h / 2500; lf++) { var lx = z.x + 16 + rnd() * (z.w - 32), ly = z.y + 16 + rnd() * (z.h - 32); g.strokeStyle = alpha(B.tuft, 0.8); g.lineWidth = 2.4; g.beginPath(); g.moveTo(lx - 4, ly - 6); g.lineTo(lx, ly); g.lineTo(lx + 1, ly - 8); g.stroke(); }
      } else if (z.kind === 'ice') {
        rr(g, z.x - 3, z.y - 3, z.w + 6, z.h + 6, 30); fill(g, '#7cc6ec');
        rr(g, z.x + 2, z.y + 2, z.w - 4, z.h - 4, 26); fill(g, '#bfeaff');
        g.save(); rr(g, z.x + 2, z.y + 2, z.w - 4, z.h - 4, 26); g.clip();
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6;
        for (var st = z.x - z.h; st < z.x + z.w; st += 70) { line(g, st, z.y + z.h, st + z.h * 0.6, z.y); g.stroke(); }
        g.strokeStyle = 'rgba(120,180,220,0.6)'; g.lineWidth = 2;
        for (var cr = 0; cr < 4; cr++) { var cx = z.x + rnd() * z.w, cy = z.y + rnd() * z.h; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 14, cy + 6); g.lineTo(cx + 22, cy - 4); g.moveTo(cx + 14, cy + 6); g.lineTo(cx + 12, cy + 18); g.stroke(); }
        g.restore();
        rr(g, z.x - 3, z.y - 3, z.w + 6, z.h + 6, 30); ink(g, 4);
      }
    });
    plan.pads.forEach(function (p, i) {
      ell(g, p.x + 2, p.y + 4, p.r, p.r * 0.75); fill(g, 'rgba(10,60,90,0.3)');
      g.beginPath(); g.moveTo(p.x, p.y); g.ellipse(p.x, p.y, p.r, p.r * 0.75, 0, 0.35 + i, TAU - 0.35 + i); g.closePath(); fi(g, '#4cb84a', 3.5);
      g.strokeStyle = '#3a963a'; g.lineWidth = 2; line(g, p.x, p.y, p.x - p.r * 0.6, p.y - p.r * 0.2); g.stroke(); line(g, p.x, p.y, p.x - p.r * 0.2, p.y + p.r * 0.5); g.stroke();
      if (i % 2 === 0) { for (var q = 0; q < 5; q++) { ell(g, p.x + 6 + Math.cos(q * 1.256) * 5, p.y - 4 + Math.sin(q * 1.256) * 3.5, 4, 3, q * 1.256); fill(g, '#ffb3d1'); } circle(g, p.x + 6, p.y - 4, 2.4); fill(g, '#ffe14d'); }
    });
    (plan.deco || []).forEach(function (d) {
      if (d[0] === 'bridge') {
        var bx = d[1] - 100, by = d[2] - 30;
        rr(g, bx, by, 200, 60, 8); fi(g, '#c98a46', 4);
        g.strokeStyle = '#9a6430'; g.lineWidth = 3;
        for (var b = 1; b < 8; b++) { line(g, bx + b * 25, by + 4, bx + b * 25, by + 56); g.stroke(); }
        rr(g, bx - 4, by - 6, 208, 10, 4); fi(g, '#e3a55e', 3); rr(g, bx - 4, by + 56, 208, 10, 4); fi(g, '#e3a55e', 3);
      }
    });
    backdrop(g, plan, B, rnd);
  }
  // The edge of the yard: a fence and, behind the HUD, a row of trees (or pines,
  // dunes, ferns and a little volcano).
  function backdrop(g, plan, B, rnd) {
    var bio = plan.biome;
    var sky = { farm: '#6fc4ff', pond: '#6fc4ff', snow: '#a9dcff', desert: '#ffc87a', dino: '#ffb27a' }[bio];
    g.fillStyle = sky; g.fillRect(0, 0, W, 64);
    g.fillStyle = shade(B.g0, -0.1); g.fillRect(0, 54, W, 46);
    if (bio === 'dino') {
      g.beginPath(); g.moveTo(870, 70); g.lineTo(960, 6); g.lineTo(1010, 6); g.lineTo(1100, 70); g.closePath(); fi(g, '#9c6b5a', 4);
      g.beginPath(); g.moveTo(960, 8); g.quadraticCurveTo(985, 22, 1010, 8); g.lineTo(1002, 22); g.lineTo(968, 22); g.closePath(); fill(g, '#ff8a3d');
      circle(g, 985, -6, 12); fill(g, 'rgba(255,255,255,0.7)'); circle(g, 1000, -16, 9); fill(g, 'rgba(255,255,255,0.6)');
    }
    for (var x = -20; x < W + 40; x += 46 + rnd() * 24) {
      var y = 58 + rnd() * 14, r = 26 + rnd() * 16;
      if (bio === 'snow') {
        g.beginPath(); g.moveTo(x, y - r * 1.6); g.lineTo(x + r * 0.8, y + 18); g.lineTo(x - r * 0.8, y + 18); g.closePath(); fi(g, '#2f8f5a', 4);
        g.beginPath(); g.moveTo(x, y - r * 1.6); g.lineTo(x + r * 0.4, y - r * 0.6); g.lineTo(x - r * 0.4, y - r * 0.6); g.closePath(); fill(g, '#ffffff');
      } else if (bio === 'desert') {
        ell(g, x, y + 12, r * 1.6, r * 0.7); fi(g, '#f3c063', 4);
      } else if (bio === 'dino') {
        for (var k = -2; k <= 2; k++) { ell(g, x + k * 10, y - 6, 10, 30, k * 0.35); fi(g, k % 2 ? '#2f9a46' : '#45b85a', 3); }
      } else {
        circle(g, x, y, r + 2); ink(g, 7);
        circle(g, x, y, r); fill(g, bio === 'pond' ? '#3fae5a' : '#45b34e');
        circle(g, x - r * 0.3, y - r * 0.3, r * 0.55); fill(g, bio === 'pond' ? '#6ed07a' : '#6fcf62');
        if (bio === 'farm' && rnd() < 0.5) { circle(g, x + r * 0.3, y + r * 0.1, 4.5); fi(g, '#ff4d4d', 2); }
      }
    }
    // fence along the top of the yard and posts down the sides and bottom
    var fy = 88;
    rr(g, 0, fy - 18, W, 8, 3); fi(g, '#e3a55e', 3); rr(g, 0, fy - 4, W, 8, 3); fi(g, '#e3a55e', 3);
    for (var px = 6; px < W; px += 52) { rr(g, px, fy - 30, 12, 40, 4); fi(g, '#c98a46', 3); rr(g, px + 2, fy - 30, 8, 4, 2); fill(g, '#f1c27a'); }
    [[0, 8], [W - 14, W - 6]].forEach(function (side) {
      for (var py = 120; py < H; py += 56) { rr(g, side[0] + 1, py, 13, 26, 4); fi(g, '#c98a46', 3); }
    });
    rr(g, 0, H - 10, W, 8, 3); fi(g, '#e3a55e', 3);
  }

  /* --------------------------------------------------------- the farm kid */
  // o: { color, hat, face, up, walk, moving, carry: null | { world, gold }, mood, t, scale, squash, alpha, still }
  A.kid = function (ctx, x, y, o) {
    var t = o.t || 0, walk = o.walk || 0, mv = !!o.moving, still = !!o.still, s = o.scale || 1;
    var col = o.color || '#3f8cff';
    ctx.save();
    ctx.translate(x, y);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.scale(s, s);
    ell(ctx, 0, 20, 21, 7); fill(ctx, 'rgba(30,15,10,0.22)');
    var bob = mv && !still ? -Math.abs(Math.sin(walk)) * 4 : still ? 0 : Math.sin(t * 2.2) * 0.8;
    var sq = (o.squash || 0) + (mv && !still ? Math.sin(walk * 2) * 0.035 : 0);
    ctx.translate(0, 20); ctx.scale(1 + sq, 1 - sq); ctx.translate(0, -20 + bob);
    var face = o.face < 0 ? -1 : 1;
    ctx.scale(face, 1);
    var step = mv && !still ? Math.sin(walk) * 4 : 0, up = !!o.up, carry = o.carry, mood = o.mood || '';
    // feet
    ell(ctx, -8 - step * 0.4, 16 + step * 0.6, 7, 5); fi(ctx, '#6b3d1f', 3);
    ell(ctx, 8 + step * 0.4, 16 - step * 0.6, 7, 5); fi(ctx, '#6b3d1f', 3);
    // basket on the back arm (when the hands are free)
    if (!carry && !up) { ctx.save(); ctx.translate(-19, 4 + step * 0.3); rr(ctx, -9, -4, 18, 13, 5); fi(ctx, '#d79a4e', 3); ctx.beginPath(); ctx.arc(0, -4, 7, Math.PI, 0); ink(ctx, 3); ctx.strokeStyle = '#b47a34'; ctx.lineWidth = 1.5; line(ctx, -7, 2, 7, 2); ctx.stroke(); ctx.restore(); }
    // body: shirt and overalls
    rr(ctx, -15, -16, 30, 32, 13); fi(ctx, '#fff2c8', 3.5);
    rr(ctx, -14, -6, 28, 22, 10); fill(ctx, col);
    rr(ctx, -9, -12, 18, 12, 4); fill(ctx, col);
    rr(ctx, -15, -16, 30, 32, 13); ink(ctx, 3.5);
    ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 2;
    line(ctx, -9, -12, -11, -17); ctx.stroke(); line(ctx, 9, -12, 11, -17); ctx.stroke();
    circle(ctx, -6, -7, 1.8); fill(ctx, '#ffd23f'); circle(ctx, 6, -7, 1.8); fill(ctx, '#ffd23f');
    if (!up) { rr(ctx, -5, 2, 10, 7, 2); ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 2; ctx.stroke(); }
    // arms
    var swing = mv && !still ? Math.sin(walk) * 5 : 0;
    if (carry) {
      ctx.lineCap = 'round';
      [[-14, -10, -14, -44], [14, -10, 14, -44]].forEach(function (a) { ctx.lineWidth = 10; ctx.strokeStyle = INK; line(ctx, a[0], a[1], a[2], a[3]); ctx.stroke(); ctx.lineWidth = 5.5; ctx.strokeStyle = '#fff2c8'; line(ctx, a[0], a[1], a[2], a[3] + 6); ctx.stroke(); });
      circle(ctx, -14, -46, 5.5); fi(ctx, '#ffcc9e', 2.5); circle(ctx, 14, -46, 5.5); fi(ctx, '#ffcc9e', 2.5);
    } else if (mood === 'freeze') {
      // statue pose: arms stretched out still
      ctx.lineCap = 'round';
      [[-14, -8, -26, -14], [14, -8, 26, -14]].forEach(function (a) { ctx.lineWidth = 10; ctx.strokeStyle = INK; line(ctx, a[0], a[1], a[2], a[3]); ctx.stroke(); ctx.lineWidth = 5.5; ctx.strokeStyle = '#fff2c8'; line(ctx, a[0], a[1], a[2], a[3]); ctx.stroke(); });
      circle(ctx, -27, -15, 5); fi(ctx, '#ffcc9e', 2.5); circle(ctx, 27, -15, 5); fi(ctx, '#ffcc9e', 2.5);
    } else {
      circle(ctx, -17, 0 + swing, 5); fi(ctx, '#ffcc9e', 2.5); circle(ctx, 17, 0 - swing, 5); fi(ctx, '#ffcc9e', 2.5);
    }
    // head
    var hy = -30;
    circle(ctx, 0, hy, 16); fi(ctx, '#ffcc9e', 3.5);
    if (up) {
      ctx.beginPath(); ctx.arc(0, hy - 2, 15, Math.PI * 0.05, Math.PI * 0.95, true); fill(ctx, '#8a4b25');
    } else {
      // hair fringe
      ctx.beginPath(); ctx.moveTo(-15, hy - 4); ctx.quadraticCurveTo(-8, hy - 10, -2, hy - 6); ctx.quadraticCurveTo(4, hy - 11, 10, hy - 6); ctx.quadraticCurveTo(14, hy - 9, 15, hy - 3); ctx.lineTo(15, hy - 10); ctx.lineTo(-15, hy - 10); ctx.closePath(); fill(ctx, '#8a4b25');
      ell(ctx, -9, hy + 6, 4, 2.6); fill(ctx, mood === 'freeze' ? 'rgba(255,90,120,0.75)' : 'rgba(255,110,130,0.5)');
      ell(ctx, 11, hy + 6, 4, 2.6); fill(ctx, mood === 'freeze' ? 'rgba(255,90,120,0.75)' : 'rgba(255,110,130,0.5)');
      var ex = 3, eyeY = hy + 1;
      if (mood === 'freeze') {
        ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex - 9, eyeY - 3); ctx.lineTo(ex - 5, eyeY); ctx.lineTo(ex - 9, eyeY + 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex + 9, eyeY - 3); ctx.lineTo(ex + 5, eyeY); ctx.lineTo(ex + 9, eyeY + 2); ctx.stroke();
        ell(ctx, ex, hy + 9, 4, 3); fi(ctx, '#ff8fa0', 2);
      } else if (mood === 'spotted') {
        circle(ctx, ex - 6, eyeY, 4); fi(ctx, '#fff', 2); circle(ctx, ex + 6, eyeY, 4); fi(ctx, '#fff', 2);
        circle(ctx, ex - 6, eyeY, 1.7); fill(ctx, INK); circle(ctx, ex + 6, eyeY, 1.7); fill(ctx, INK);
        ell(ctx, ex, hy + 10, 3.5, 4.5); fi(ctx, '#7a1f3d', 2);
      } else if (mood === 'happy') {
        ctx.lineWidth = 2.6; ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.arc(ex - 6, eyeY + 1, 3.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex + 6, eyeY + 1, 3.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex - 6, hy + 7); ctx.quadraticCurveTo(ex, hy + 15, ex + 6, hy + 7); ctx.closePath(); fi(ctx, '#7a1f3d', 2);
      } else {
        ell(ctx, ex - 6, eyeY, 2.6, 3.4); fill(ctx, INK); ell(ctx, ex + 6, eyeY, 2.6, 3.4); fill(ctx, INK);
        circle(ctx, ex - 5.2, eyeY - 1.2, 1); fill(ctx, '#fff'); circle(ctx, ex + 6.8, eyeY - 1.2, 1); fill(ctx, '#fff');
        ctx.beginPath(); ctx.arc(ex, hy + 7, 4.5, 0.25, Math.PI - 0.25); ink(ctx, 2.4);
      }
    }
    A.hat(ctx, o.hat || 0, hy, col, up, t);
    if (carry) A.egg(ctx, 0, hy - 40 + Math.sin(t * 7) * 1.5, carry.world, carry.gold, Math.sin(t * 6.5) * 0.14 * (mv ? 1.4 : 0.6), carry.gold === 2 ? 0.8 : 1);
    ctx.restore();
  };
  // The hats of the wardrobe, on a head at height hy.
  A.hat = function (ctx, i, hy, col, up, t) {
    var id = ER.HATS[i] ? ER.HATS[i].id : 'straw';
    var y = hy - 9;
    if (id === 'straw') {
      ell(ctx, 0, y + 2, 25, 8.5); fi(ctx, '#f6d47a', 3.5);
      ctx.beginPath(); ctx.moveTo(-13, y + 2); ctx.quadraticCurveTo(-13, y - 15, 0, y - 15); ctx.quadraticCurveTo(13, y - 15, 13, y + 2); ctx.closePath(); fi(ctx, '#f2c25e', 3.5);
      rr(ctx, -13, y - 4, 26, 5, 2); fill(ctx, '#e8473f');
      ctx.strokeStyle = '#d9a645'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, y + 2, 19, 5.5, 0, 0.2, Math.PI - 0.2); ctx.stroke();
    } else if (id === 'cap') {
      ctx.beginPath(); ctx.moveTo(-15, y + 4); ctx.quadraticCurveTo(-15, y - 14, 0, y - 14); ctx.quadraticCurveTo(15, y - 14, 15, y + 4); ctx.closePath(); fi(ctx, '#ff5a5f', 3.5);
      if (!up) { ell(ctx, 10, y + 4, 14, 4.5); fi(ctx, '#e04048', 3); }
      circle(ctx, 0, y - 14, 2.5); fi(ctx, '#ff5a5f', 2);
    } else if (id === 'flower') {
      ctx.beginPath(); ctx.ellipse(0, y + 4, 16, 5, 0, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = '#3fae4a'; ctx.stroke();
      for (var f = 0; f < 6; f++) { var a = Math.PI + f * Math.PI / 5; circle(ctx, Math.cos(a) * 15, y + 3 + Math.sin(a) * 6, 4.6); fi(ctx, ['#ff7aa8', '#ffd23f', '#ffffff', '#b9a4ff'][f % 4], 2); circle(ctx, Math.cos(a) * 15, y + 3 + Math.sin(a) * 6, 1.6); fill(ctx, '#ff9a2e'); }
    } else if (id === 'bunny') {
      [-1, 1].forEach(function (s) {
        var wig = Math.sin(t * 3 + s) * 0.08;
        ctx.save(); ctx.translate(s * 7, y - 2); ctx.rotate(s * 0.18 + wig);
        ell(ctx, 0, -14, 6, 15); fi(ctx, '#ffffff', 3); ell(ctx, 0, -13, 3, 10); fill(ctx, '#ffb3c8');
        ctx.restore();
      });
      ctx.beginPath(); ctx.ellipse(0, y + 2, 15, 4, 0, Math.PI, 0); ctx.lineWidth = 4; ctx.strokeStyle = '#ff7aa8'; ctx.stroke();
    } else if (id === 'cowboy') {
      ctx.beginPath(); ctx.moveTo(-28, y - 2); ctx.quadraticCurveTo(-24, y + 8, 0, y + 7); ctx.quadraticCurveTo(24, y + 8, 28, y - 2); ctx.quadraticCurveTo(20, y + 2, 0, y + 1); ctx.quadraticCurveTo(-20, y + 2, -28, y - 2); ctx.closePath(); fi(ctx, '#a0602e', 3.5);
      ctx.beginPath(); ctx.moveTo(-12, y + 2); ctx.quadraticCurveTo(-14, y - 18, -4, y - 16); ctx.quadraticCurveTo(0, y - 12, 4, y - 16); ctx.quadraticCurveTo(14, y - 18, 12, y + 2); ctx.closePath(); fi(ctx, '#b8743a', 3.5);
      rr(ctx, -12, y - 4, 24, 4, 2); fill(ctx, '#5b3416');
    } else if (id === 'party') {
      ctx.beginPath(); ctx.moveTo(-11, y + 3); ctx.lineTo(0, y - 28); ctx.lineTo(11, y + 3); ctx.closePath(); fi(ctx, '#b48cff', 3.5);
      ctx.save(); ctx.beginPath(); ctx.moveTo(-11, y + 3); ctx.lineTo(0, y - 28); ctx.lineTo(11, y + 3); ctx.closePath(); ctx.clip();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; for (var k = 0; k < 4; k++) { line(ctx, -14, y - k * 9, 14, y - 6 - k * 9); ctx.stroke(); }
      ctx.restore();
      circle(ctx, 0, y - 29, 4.5); fi(ctx, '#ff5a7a', 2.5);
    } else if (id === 'beanie') {
      ctx.beginPath(); ctx.moveTo(-16, y + 5); ctx.quadraticCurveTo(-16, y - 17, 0, y - 17); ctx.quadraticCurveTo(16, y - 17, 16, y + 5); ctx.closePath(); fi(ctx, '#19c3c3', 3.5);
      rr(ctx, -17, y, 34, 7, 3); fi(ctx, '#0f9a9a', 3);
      circle(ctx, 0, y - 19, 6); fi(ctx, '#ffffff', 3);
    } else if (id === 'crown') {
      ctx.beginPath(); ctx.moveTo(-13, y + 3); ctx.lineTo(-15, y - 13); ctx.lineTo(-7, y - 5); ctx.lineTo(0, y - 17); ctx.lineTo(7, y - 5); ctx.lineTo(15, y - 13); ctx.lineTo(13, y + 3); ctx.closePath(); fi(ctx, '#ffd23f', 3.5);
      circle(ctx, 0, y - 3, 3); fill(ctx, '#ff5a7a'); circle(ctx, -8, y - 1, 2.2); fill(ctx, '#3fcf6b'); circle(ctx, 8, y - 1, 2.2); fill(ctx, '#4fd1ff');
    }
  };

  /* --------------------------------------------------------------- guards */
  // g: { kind, x, y, dir, look, state, t, dur, air }. The head turns to where it looks.
  A.guard = function (ctx, g, t, still, swim) {
    var st = g.state, dir = st === 'sleep' ? g.look : g.dir;
    var lx = Math.cos(dir), ly = Math.sin(dir), fx = lx >= -0.05 ? 1 : -1;
    var eyes = st === 'sleep' || st === 'walk' ? 'closed' : st === 'stir' ? 'one' : st === 'awake' ? 'open' : st === 'back' ? 'smug' : 'wide';
    var lift = (g.air || 0) * 24, scale = g.kind === 'dino' || g.kind === 'ostrich' ? 1 : 1.18;
    ctx.save();
    ctx.translate(g.x, g.y);
    var sh = g.kind === 'dino' ? 56 : g.kind === 'ostrich' ? 34 : 28;
    if (swim && !lift) {
      // swimming: rings on the water instead of a shadow
      var k = still ? 0.5 : (t * 0.8) % 1;
      ell(ctx, 0, 6, 36, 12); fill(ctx, 'rgba(255,255,255,0.35)');
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)).toFixed(2) + ')'; ell(ctx, 0, 6, 36 + k * 20, 12 + k * 7); ctx.stroke();
    } else { ell(ctx, 0, g.kind === 'dino' ? 30 : 16, sh * (1 - lift / 70), sh * 0.32 * (1 - lift / 70)); fill(ctx, 'rgba(30,15,10,0.22)'); }
    ctx.translate(0, -lift);
    if (st === 'stir' && !still) ctx.rotate(Math.sin(t * 17) * 0.05);
    if (st === 'sleep' && !still) { ctx.translate(0, 16); ctx.scale(1, 1 + Math.sin(t * 2.2) * 0.03); ctx.translate(0, -16); }
    if (st === 'walk' && !still) ctx.translate(0, -Math.abs(Math.sin(t * 6)) * 3);
    ctx.scale(fx * scale, scale);
    // hs: how far forward the head sits (less when it looks up or down the yard).
    var o = { eyes: eyes, ly: ly, hs: 0.3 + 0.7 * Math.abs(lx), t: t, sit: st === 'sleep' || (swim && !lift), walk: st === 'walk' || st === 'hop' || st === 'back', still: still };
    if (o.sit && swim) ctx.translate(0, 8);
    (BODY[g.kind] || BODY.hen)(ctx, o);
    ctx.restore();
  };
  // Eyes on a head at (x, y): closed, one open, open, wide or smug; pupils look along ly.
  function eyesAt(ctx, x, y, r, o, gap) {
    var e = o.eyes, ly = o.ly;
    gap = gap || r * 1.5;
    [x - gap / 2, x + gap / 2].forEach(function (ex, i) {
      var shut = e === 'closed' || e === 'smug' || (e === 'one' && i === 0);
      if (shut) {
        ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.lineCap = 'round';
        ctx.beginPath();
        if (e === 'smug') ctx.arc(ex, y + 1, r * 0.7, Math.PI * 1.15, Math.PI * 1.85); else ctx.arc(ex, y - 1, r * 0.7, 0.2, Math.PI - 0.2);
        ctx.stroke();
      } else {
        var rr0 = e === 'wide' ? r * 1.15 : r;
        circle(ctx, ex, y, rr0); fi(ctx, '#ffffff', 2.2);
        circle(ctx, ex + r * 0.3, y + ly * r * 0.35, rr0 * 0.55); fill(ctx, INK);
        circle(ctx, ex + r * 0.42, y + ly * r * 0.35 - rr0 * 0.25, rr0 * 0.2); fill(ctx, '#ffffff');
        if (e === 'wide') { ctx.lineWidth = 2.4; ctx.strokeStyle = INK; line(ctx, ex - r, y - r * 1.6 + (i ? 1 : -1), ex + r, y - r * 1.6 + (i ? -1 : 1)); ctx.stroke(); }
      }
    });
  }
  var BODY = {
    hen: function (ctx, o) {
      var hy = -34 + o.ly * 5;
      if (!o.sit) { ctx.lineWidth = 3; ctx.strokeStyle = '#ff9a2e'; line(ctx, -6, 6, -8, 16); ctx.stroke(); line(ctx, 6, 6, 6, 16); ctx.stroke(); }
      // tail
      ctx.beginPath(); ctx.moveTo(-18, -16); ctx.quadraticCurveTo(-36, -34, -30, -40); ctx.quadraticCurveTo(-24, -30, -20, -34); ctx.quadraticCurveTo(-18, -24, -10, -20); ctx.closePath(); fi(ctx, '#fff7ee', 3.5);
      ell(ctx, 0, o.sit ? -8 : -12, 28, o.sit ? 19 : 22); fi(ctx, '#ffffff', 4);
      ell(ctx, -4, (o.sit ? -6 : -10), 16, 10, -0.2); fi(ctx, '#f0e6dc', 3);
      // head
      ctx.save(); ctx.translate(-(1 - o.hs) * 16, 0);
      circle(ctx, 16, hy, 14); fi(ctx, '#ffffff', 3.5);
      ctx.beginPath(); ctx.moveTo(10, hy - 12); ctx.arc(13, hy - 15, 4.5, Math.PI, 0); ctx.arc(19, hy - 16, 4.5, Math.PI, 0); ctx.arc(24, hy - 12, 4, Math.PI * 1.2, Math.PI * 0.1); ctx.lineTo(22, hy - 9); ctx.closePath(); fi(ctx, '#ff4d4d', 2.5);
      ctx.beginPath(); ctx.moveTo(27, hy - 1 + o.ly * 2); ctx.lineTo(38, hy + 2 + o.ly * 4); ctx.lineTo(27, hy + 6 + o.ly * 2); ctx.closePath(); fi(ctx, '#ffb52e', 2.5);
      ell(ctx, 27, hy + 10, 3.4, 5); fi(ctx, '#ff4d4d', 2);
      eyesAt(ctx, 19, hy - 1, 4.2, o, 9);
      ell(ctx, 10, hy + 6, 3.2, 2); fill(ctx, 'rgba(255,120,140,0.5)');
      ctx.restore();
    },
    duck: function (ctx, o) {
      var hy = -36 + o.ly * 5;
      if (!o.sit) { ell(ctx, -6, 14, 7, 3.5); fi(ctx, '#ff9a2e', 2.5); ell(ctx, 8, 14, 7, 3.5); fi(ctx, '#ff9a2e', 2.5); }
      ctx.beginPath(); ctx.moveTo(-22, -14); ctx.quadraticCurveTo(-36, -22, -32, -30); ctx.quadraticCurveTo(-26, -22, -16, -22); ctx.closePath(); fi(ctx, '#ffffff', 3.5);
      ell(ctx, 0, o.sit ? -8 : -11, 30, o.sit ? 17 : 19); fi(ctx, '#ffffff', 4);
      ell(ctx, -6, o.sit ? -8 : -11, 15, 9, -0.15); fi(ctx, '#e8f0f6', 3);
      ctx.save(); ctx.translate(-(1 - o.hs) * 16, 0);
      ctx.lineWidth = 15; ctx.strokeStyle = INK; ctx.lineCap = 'round'; line(ctx, 14, -16, 18, hy + 4); ctx.stroke();
      ctx.lineWidth = 9; ctx.strokeStyle = '#ffffff'; line(ctx, 14, -16, 18, hy + 4); ctx.stroke();
      circle(ctx, 19, hy, 13); fi(ctx, '#ffffff', 3.5);
      ell(ctx, 33, hy + 4 + o.ly * 3, 10, 4.6); fi(ctx, '#ff9a2e', 2.5);
      ctx.lineWidth = 1.6; ctx.strokeStyle = INK; line(ctx, 26, hy + 4 + o.ly * 3, 41, hy + 4 + o.ly * 3); ctx.stroke();
      eyesAt(ctx, 21, hy - 3, 4, o, 9);
      ctx.beginPath(); ctx.moveTo(15, hy - 12); ctx.quadraticCurveTo(18, hy - 20, 23, hy - 15); ink(ctx, 2.5);
      ctx.restore();
    },
    penguin: function (ctx, o) {
      var hy = -40 + o.ly * 4, lean = o.sit ? 3 : 0;
      ell(ctx, -7, 14, 8, 4); fi(ctx, '#ff9a2e', 2.5); ell(ctx, 7, 14, 8, 4); fi(ctx, '#ff9a2e', 2.5);
      ell(ctx, 0, -14 + lean, 22, 28); fi(ctx, '#2f3a56', 4);
      ell(ctx, 4, -10 + lean, 15, 22); fill(ctx, '#ffffff');
      ell(ctx, -18, -14 + lean, 6, 16, 0.3); fi(ctx, '#26304a', 3);
      ell(ctx, 18, -12 + lean, 6, 15, -0.3); fi(ctx, '#26304a', 3);
      circle(ctx, 3, hy + lean, 15); fi(ctx, '#2f3a56', 3.5);
      ell(ctx, 7, hy + 2 + lean, 10, 9); fill(ctx, '#ffffff');
      ctx.beginPath(); ctx.moveTo(14, hy + 3 + lean + o.ly * 2); ctx.lineTo(24, hy + 6 + lean + o.ly * 3); ctx.lineTo(14, hy + 9 + lean + o.ly * 2); ctx.closePath(); fi(ctx, '#ffb02e', 2.2);
      eyesAt(ctx, 8, hy - 1 + lean, 3.6, o, 9);
      ell(ctx, 0, hy + 8 + lean, 3, 1.8); fill(ctx, 'rgba(255,120,150,0.55)');
      // a cosy scarf
      ctx.beginPath(); ctx.ellipse(3, hy + 14 + lean, 15, 5, 0, 0, TAU); fi(ctx, '#ff5a7a', 2.5);
      rr(ctx, -12, hy + 15 + lean, 7, 14, 3); fi(ctx, '#ff5a7a', 2.5);
    },
    ostrich: function (ctx, o) {
      var sit = o.sit, hx = sit ? 22 : 4 + 18 * o.hs, hy = sit ? -30 : -76 + o.ly * 6;
      if (!sit) {
        ctx.lineCap = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = INK;
        line(ctx, -8, -10, -10, 14); ctx.stroke(); line(ctx, 8, -10, 10, 14); ctx.stroke();
        ctx.lineWidth = 4.5; ctx.strokeStyle = '#ffb3a0'; line(ctx, -8, -10, -10, 14); ctx.stroke(); line(ctx, 8, -10, 10, 14); ctx.stroke();
      }
      var by = sit ? -8 : -26;
      ell(ctx, -2, by, 32, 22); fi(ctx, '#3a2f3f', 4);
      for (var p = 0; p < 4; p++) { ell(ctx, -28 + p * 4, by - 10 + p * 6, 9, 5, -0.6 + p * 0.3); fi(ctx, '#ffffff', 2.5); }
      ell(ctx, 4, by - 4, 16, 10, 0.2); fill(ctx, '#55485c');
      // neck
      ctx.beginPath(); ctx.moveTo(14, by - 8); ctx.quadraticCurveTo(sit ? 34 : 28, sit ? by - 18 : (by + hy) / 2, hx, hy + 6);
      ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 10; ctx.strokeStyle = '#ffc4b0'; ctx.stroke();
      circle(ctx, hx, hy, 12); fi(ctx, '#ffd2c2', 3.5);
      ctx.beginPath(); ctx.moveTo(hx + 9, hy - 1 + o.ly * 2); ctx.quadraticCurveTo(hx + 24, hy + 2 + o.ly * 3, hx + 9, hy + 6 + o.ly * 2); ctx.closePath(); fi(ctx, '#ffb02e', 2.5);
      eyesAt(ctx, hx + 2, hy - 2, 4.6, o, 10);
      if (o.eyes === 'open' || o.eyes === 'one') { ctx.lineWidth = 1.8; ctx.strokeStyle = INK; line(ctx, hx + 6, hy - 8, hx + 9, hy - 11); ctx.stroke(); line(ctx, hx - 3, hy - 8, hx - 4, hy - 11); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(hx - 4, hy - 11); ctx.quadraticCurveTo(hx - 2, hy - 20, hx + 3, hy - 12); ink(ctx, 2.5);
    },
    dino: function (ctx, o) {
      var hy = -54 + o.ly * 7, sit = o.sit && !o.walk;
      // tail
      ctx.beginPath(); ctx.moveTo(-30, -26); ctx.quadraticCurveTo(-70, -20, -78, 4); ctx.quadraticCurveTo(-56, -6, -26, 0); ctx.closePath(); fi(ctx, '#6fcf54', 4.5);
      // legs
      if (!sit) { rr(ctx, -22, -8, 16, 26, 7); fi(ctx, '#5fbe48', 4); rr(ctx, 10, -8, 16, 26, 7); fi(ctx, '#5fbe48', 4); }
      // plates
      for (var p = 0; p < 4; p++) { ctx.beginPath(); var px = -32 + p * 16, py = -48 + Math.abs(p - 1.5) * 5; ctx.moveTo(px - 8, py + 8); ctx.lineTo(px, py - 12); ctx.lineTo(px + 8, py + 8); ctx.closePath(); fi(ctx, '#ffb347', 3.5); }
      ell(ctx, 0, sit ? -16 : -22, 44, sit ? 30 : 32); fi(ctx, '#7ad85a', 5);
      ell(ctx, 8, sit ? -8 : -14, 26, 18); fill(ctx, '#c9f59a');
      for (var s = 0; s < 4; s++) { circle(ctx, -22 + s * 11, -36 + (s % 2) * 8, 4); fill(ctx, '#5fbe48'); }
      // head
      ctx.save(); ctx.translate(-(1 - o.hs) * 22, 0);
      ell(ctx, 30, hy, 28, 22); fi(ctx, '#7ad85a', 4.5);
      ell(ctx, 44, hy + 8 + o.ly * 2, 16, 11); fi(ctx, '#8be36a', 3.5);
      circle(ctx, 50, hy + 4, 2); fill(ctx, INK);
      ctx.beginPath(); ctx.arc(42, hy + 10 + o.ly * 2, 9, 0.3, Math.PI - 0.6); ink(ctx, 2.6);
      eyesAt(ctx, 28, hy - 6, 6, o, 14);
      ell(ctx, 18, hy + 6, 5, 3); fill(ctx, 'rgba(255,120,150,0.55)');
      ctx.restore();
      // tiny arms
      ell(ctx, 30, -14, 7, 5, 0.6); fi(ctx, '#6fcf54', 3);
    }
  };
  // Above a guard's head: Zzz while it sleeps, «؟» while it stirs, «!» when it spots you.
  A.guardFx = function (ctx, g, t, still) {
    var top = g.kind === 'dino' ? 96 : g.kind === 'ostrich' ? (g.state === 'sleep' ? 58 : 104) : 74;
    var x = g.x + (Math.cos(g.dir) >= -0.05 ? 14 : -14), y = g.y - top - (g.air || 0) * 24;
    if (g.state === 'sleep' || g.state === 'walk') {
      var zs = glyph('Z');
      for (var i = 0; i < 3; i++) {
        var k = still ? i / 3 : ((t * 0.55 + i / 3) % 1), a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85, sz = (16 + k * 14) / 30;
        ctx.globalAlpha = Math.max(0, a) * 0.95;
        ctx.drawImage(zs, x + 8 + k * 26 + Math.sin(k * 6 + i) * 4 - 22 * sz, y + 10 - k * 40 - 22 * sz, 44 * sz, 44 * sz);
      }
      ctx.globalAlpha = 1;
    } else if (g.state === 'stir') {
      var p = 1 - g.t / g.dur, s = Math.min(1, p * 5), wob = still ? 0 : Math.sin(t * 12) * 0.08;
      ctx.save(); ctx.translate(x, y - 6); ctx.rotate(wob); ctx.scale(s * (1 + p * 0.25), s * (1 + p * 0.25));
      ctx.drawImage(glyph('?'), -36, -36, 72, 72);
      ctx.restore();
      // a ring that fills up: the warning running out
      ctx.beginPath(); ctx.arc(x, y - 6, 31, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.lineWidth = 5; ctx.strokeStyle = '#ff7a1a'; ctx.lineCap = 'round'; ctx.stroke();
    } else if (g.state === 'alert' || g.state === 'hop') {
      var q = g.state === 'alert' ? Math.min(1, (0.5 - g.t) * 8) : 1;
      ctx.save(); ctx.translate(x, y - 8); ctx.scale(q, q);
      ctx.drawImage(glyph('!'), -36, -36, 72, 72);
      ctx.restore();
    }
  };
  // The floating Z, and the «؟» and «!» bubbles, drawn once.
  function glyph(c) {
    return sprite('glyph' + c, 72, 72, function (g) {
      g.translate(36, 36);
      if (c === 'Z') { A.text(g, 'Z', 0, 0, 30, '#ffffff', { stroke: 7 }); return; }
      g.translate(0, -6);
      bubble(g, 0, 0, c === '!' ? 25 : 24, c === '!' ? '#ff5a5f' : '#fff6c2');
      A.text(g, c === '!' ? '!' : '؟', 0, 2, c === '!' ? 38 : 36, c === '!' ? '#ffffff' : '#ff7a1a', { stroke: 6 });
    });
  }
  function bubble(ctx, x, y, r, c) {
    ctx.beginPath(); ctx.arc(x, y, r, 0.65 * Math.PI, 0.35 * Math.PI); ctx.lineTo(x - 4, y + r + 12); ctx.closePath(); fi(ctx, c, 4);
  }
  A.bubble = bubble;
  // The vision cone on the ground: soft while it looks, dashed while it is about to,
  // red when it has seen someone.
  A.cone = function (ctx, pts, mode, k) {
    if (!pts || pts.length < 6) return;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (mode === 'stir') {
      ctx.fillStyle = 'rgba(255,240,150,' + (0.08 + 0.12 * k).toFixed(3) + ')'; ctx.fill();
      ctx.setLineDash([10, 10]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,170,40,' + (0.35 + 0.5 * k).toFixed(3) + ')'; ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    ctx.fillStyle = mode === 'alert' ? 'rgba(255,80,80,0.32)' : 'rgba(255,238,110,0.32)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = mode === 'alert' ? 'rgba(255,60,60,0.75)' : 'rgba(255,190,40,0.8)'; ctx.stroke();
    // a brighter core near the eye
    var ex = pts[0], ey = pts[1];
    ctx.beginPath(); ctx.moveTo(ex, ey);
    for (var j = 2; j < pts.length; j += 2) ctx.lineTo(ex + (pts[j] - ex) * 0.55, ey + (pts[j + 1] - ey) * 0.55);
    ctx.closePath();
    ctx.fillStyle = mode === 'alert' ? 'rgba(255,90,90,0.22)' : 'rgba(255,250,200,0.28)'; ctx.fill();
  };

  /* ---------------------------------------------------------------- icons */
  A.keycap = function (ctx, x, y, label, o) {
    o = o || {};
    var w = o.w || 46, h = o.h || 44, down = !!o.down, glow = o.glow || 0;
    if (glow > 0) { rr(ctx, x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, 14); fill(ctx, 'rgba(255,210,63,' + (0.55 * glow).toFixed(2) + ')'); }
    rr(ctx, x - w / 2, y - h / 2 + 5, w, h, 10); fill(ctx, INK);
    rr(ctx, x - w / 2, y - h / 2 + (down ? 4 : 0), w, h, 10); fi(ctx, down ? '#ffd23f' : (o.color || '#ffffff'), 3.5);
    A.text(ctx, label, x, y + (down ? 4 : 0) + 1, o.size || 24, INK, { stroke: 0 });
  };
  // An arrow-key or WASD cluster centred at (x, y); dirs: which keys are lit.
  A.keys = function (ctx, x, y, set, lit, o) {
    o = o || {};
    var L = set === 'wasd' ? ['W', 'A', 'S', 'D'] : ['↑', '←', '↓', '→'], s = o.size || 44, gap = s + 6;
    A.keycap(ctx, x, y - gap / 2 - 2, L[0], { w: s, h: s - 2, down: lit && lit.up, glow: o.glow && o.glow.up, color: o.color });
    A.keycap(ctx, x - gap, y + gap / 2, L[1], { w: s, h: s - 2, down: lit && lit.left, glow: o.glow && o.glow.left, color: o.color });
    A.keycap(ctx, x, y + gap / 2, L[2], { w: s, h: s - 2, down: lit && lit.down, glow: o.glow && o.glow.down, color: o.color });
    A.keycap(ctx, x + gap, y + gap / 2, L[3], { w: s, h: s - 2, down: lit && lit.right, glow: o.glow && o.glow.right, color: o.color });
  };
  A.star = function (ctx, x, y, r, on, rot) {
    starPath(ctx, x, y, r, r * 0.48, rot || 0); fi(ctx, on ? '#ffd23f' : '#d9dbe8', Math.max(2.5, r * 0.16));
    if (on) { starPath(ctx, x - r * 0.12, y - r * 0.15, r * 0.45, r * 0.2, rot || 0); fill(ctx, 'rgba(255,255,255,0.55)'); }
  };
  A.check = function (ctx, x, y, r, ok) {
    circle(ctx, x, y, r); fi(ctx, ok ? '#3ddc84' : '#ff5a5f', 4);
    ctx.lineWidth = r * 0.28; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (ok) { ctx.moveTo(x - r * 0.45, y); ctx.lineTo(x - r * 0.1, y + r * 0.35); ctx.lineTo(x + r * 0.5, y - r * 0.35); }
    else { ctx.moveTo(x - r * 0.38, y - r * 0.38); ctx.lineTo(x + r * 0.38, y + r * 0.38); ctx.moveTo(x + r * 0.38, y - r * 0.38); ctx.lineTo(x - r * 0.38, y + r * 0.38); }
    ctx.stroke();
  };
  // A "stop" hand: freeze!
  A.hand = function (ctx, x, y, r) {
    circle(ctx, x, y, r); fi(ctx, '#ff5a5f', 4);
    ctx.save(); ctx.translate(x, y); ctx.scale(r / 30, r / 30);
    rr(ctx, -13, -6, 26, 24, 9); fill(ctx, '#ffffff');
    [-11, -4, 3, 10].forEach(function (fx, i) { rr(ctx, fx - 3, -20 + (i === 0 || i === 3 ? 4 : 0), 7, 22, 3.5); fill(ctx, '#ffffff'); });
    rr(ctx, 9, 0, 14, 7, 3.5); fill(ctx, '#ffffff');
    ctx.restore();
  };
  // Motion lines behind a moving kid.
  A.zoom = function (ctx, x, y, dir) {
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    for (var i = -1; i <= 1; i++) { line(ctx, x - dir * 26, y + i * 10, x - dir * (40 + Math.abs(i) * -6), y + i * 10); ctx.stroke(); }
  };
  A.heart = function (ctx, x, y, r, c) {
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.9); ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); fi(ctx, c || '#ff5a7a', 3);
  };
  A.clock = function (ctx, x, y, r, k, warn) {
    circle(ctx, x, y, r); fi(ctx, '#ffffff', 3.5);
    if (k > 0) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r - 4, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.closePath(); fill(ctx, warn ? '#ff9f43' : '#7fe08a'); }
    ctx.lineWidth = 3; ctx.strokeStyle = INK; line(ctx, x, y, x, y - r * 0.6); ctx.stroke(); line(ctx, x, y, x + r * 0.45, y); ctx.stroke();
  };
})();
