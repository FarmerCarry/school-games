/* أصابع البرق drawing: the sky and the little town, word clouds, lightning, rainbows,
 * the school keyboard, the speed animals and the map. Static layers (the scenes, the map,
 * the keyboard with all its legends, cloud bodies) are rendered once per pixel scale into
 * offscreen canvases; per frame there are only blits, a few paths and the words' text.
 * No image files, no getImageData. Arabic text is always drawn whole (never letter by
 * letter), right to left; the typed part is the same word drawn again under a clip. */
(function () {
  'use strict';
  var TT = window.TT, W = TT.W, H = TT.H, TAU = Math.PI * 2, INK = '#1c2250', ZWJ = '‍';
  var A = TT.art = {};
  A.INK = INK;
  A.FONT = 'Fredoka';
  A.RAINBOW = ['#ff5d6c', '#ff9f43', '#ffd23f', '#5be38f', '#4fd1ff', '#b48cff'];
  A.HOUSES = ['#ff7eb6', '#4fd1ff', '#ffd23f', '#5be38f', '#b48cff', '#ff9f43'];
  // Finger zones: little coloured stripes on the keycaps, left pinky to right pinky.
  A.FINGERS = ['#ff7eb6', '#ff9f43', '#ffd23f', '#5be38f', '#4fd1ff', '#7aa5ff', '#b48cff', '#ff6b8b'];
  A.ISLES = [{ x: 1086, y: 420 }, { x: 862, y: 226 }, { x: 640, y: 420 }, { x: 418, y: 226 }, { x: 194, y: 420 }];
  A.ISLE_TINT = ['#ffd6ec', '#fff1b8', '#cff7dc', '#d3efff', '#e6dcff'];

  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function ink(g, lw) { g.lineWidth = lw || 5; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(hex, a) { return 'rgb(' + rgb(hex).map(function (v) { return Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)); }).join(',') + ')'; }
  function alpha(hex, a) { return 'rgba(' + rgb(hex).join(',') + ',' + a + ')'; }
  function starPath(g, x, y, R, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  function seeded(n) { return function () { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }
  A.circle = circle; A.rr = rr; A.starPath = starPath; A.shade = shade; A.alpha = alpha;
  function font(size, weight) { return (weight || 700) + ' ' + size + 'px ' + A.FONT; }
  A.font = font;

  // Text helper: an ink outline under a coloured fill, right to left for Arabic.
  A.text = function (g, s, x, y, size, color, opts) {
    opts = opts || {};
    g.font = font(size, opts.weight);
    g.direction = TT.isArabic(String(s)[0]) || opts.rtl ? 'rtl' : 'ltr';
    g.textAlign = opts.align || 'center';
    g.textBaseline = 'middle';
    if (opts.outline !== 0) { g.lineJoin = 'round'; g.lineWidth = opts.outline || Math.max(4, size * 0.18); g.strokeStyle = opts.ink || INK; g.strokeText(s, x, y); }
    g.fillStyle = color; g.fillText(s, x, y);
  };

  var cache = {};
  A.reset = function () { cache = {}; };
  function layer(key, ps, w, h, draw) {
    var k = key + '@' + ps;
    if (cache[k]) return cache[k];
    var c = cv(w * ps, h * ps), g = c.getContext('2d');
    g.scale(ps, ps); draw(g);
    return (cache[k] = c);
  }

  /* --------------------------------------------------------------- scenes */
  function house(g, x, base, w, h, color, roof, r) {
    var top = base - h;
    rr(g, x, top, w, h + 6, 6); fill(g, color); ink(g, 5);
    g.beginPath();
    if (roof === 0) { g.moveTo(x - 10, top + 4); g.lineTo(x + w / 2, top - w * 0.42); g.lineTo(x + w + 10, top + 4); g.closePath(); }
    else { rr(g, x - 8, top - 22, w + 16, 28, 10); }
    fill(g, roof === 0 ? shade(color, -0.32) : '#ff5d6c'); ink(g, 5);
    // windows with a warm light, a round door
    var ww = Math.min(22, w * 0.26);
    rr(g, x + w * 0.14, top + h * 0.22, ww, ww, 5); fill(g, '#fff6c2'); ink(g, 3.5);
    rr(g, x + w * 0.86 - ww, top + h * 0.22, ww, ww, 5); fill(g, '#fff6c2'); ink(g, 3.5);
    g.beginPath(); g.moveTo(x + w / 2 - 11, base + 6); g.lineTo(x + w / 2 - 11, base - h * 0.32); g.arc(x + w / 2, base - h * 0.32, 11, Math.PI, 0); g.lineTo(x + w / 2 + 11, base + 6);
    fill(g, shade(color, -0.45)); ink(g, 3.5);
    if (r() < 0.5) { rr(g, x + w * 0.62, top - (roof === 0 ? w * 0.36 : 34), 12, 20, 3); fill(g, '#c46a4a'); ink(g, 3.5); }
  }
  function tree(g, x, base, s) {
    rr(g, x - 6 * s, base - 30 * s, 12 * s, 34 * s, 4); fill(g, '#a8693f'); ink(g, 4);
    circle(g, x, base - 46 * s, 26 * s); fill(g, '#46c46a'); ink(g, 5);
    circle(g, x - 10 * s, base - 54 * s, 9 * s); fill(g, '#7be08f');
  }
  function bgCloud(g, x, y, s, a) {
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    [[0, 0, 34], [32, -10, 30], [62, 4, 26], [-30, 6, 24]].forEach(function (p) { circle(g, x + p[0] * s, y + p[1] * s, p[2] * s); g.fill(); });
  }
  // Sky, hills, the town and the garden. horizon: where the houses stand.
  function scene(g, horizon, seed) {
    var r = seeded(seed || 7), sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#46b9ff'); sky.addColorStop(0.65, '#8fdcff'); sky.addColorStop(1, '#d6f6ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // the sun peeking in, soft rays (the title only: in play the HUD has its own suns)
    if (horizon > 500) {
    g.save(); g.translate(1180, horizon * 0.2);
    for (var i = 0; i < 12; i++) { g.rotate(TAU / 12); g.fillStyle = 'rgba(255,240,150,0.28)'; g.beginPath(); g.moveTo(0, -60); g.lineTo(18, -170); g.lineTo(-18, -170); g.closePath(); g.fill(); }
    g.restore();
    circle(g, 1180, horizon * 0.2, 62); fill(g, '#ffe066'); ink(g, 6);
    circle(g, 1180, horizon * 0.2, 46); fill(g, '#fff3a8');
    }
    for (i = 0; i < (horizon > 500 ? 6 : 4); i++) bgCloud(g, 80 + r() * 1100, 60 + r() * (horizon - 220), 0.7 + r() * 0.6, 0.5);
    // hills
    g.beginPath(); g.moveTo(0, horizon - 40);
    for (var x = 0; x <= W; x += 40) g.lineTo(x, horizon - 60 - Math.sin(x / 210) * 40 - Math.sin(x / 90 + 1) * 10);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); fill(g, '#9be27a'); ink(g, 5);
    g.beginPath(); g.moveTo(0, horizon - 10);
    for (x = 0; x <= W; x += 40) g.lineTo(x, horizon - 22 - Math.sin(x / 160 + 2) * 22);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); fill(g, '#78d35f'); ink(g, 5);
    // houses and trees along the street
    var hx = -20;
    while (hx < W) {
      var w = 64 + r() * 40, h = 54 + r() * 34;
      if (r() < 0.28) { tree(g, hx + 24, horizon + 2, 0.8 + r() * 0.3); hx += 52; continue; }
      house(g, hx, horizon, w, h, A.HOUSES[(r() * 6) | 0], r() < 0.75 ? 0 : 1, r);
      hx += w + 14 + r() * 18;
    }
    // the garden
    var gr = g.createLinearGradient(0, horizon, 0, H);
    gr.addColorStop(0, '#5fd36b'); gr.addColorStop(1, '#3fb85a');
    g.beginPath(); g.moveTo(0, horizon + 6); g.lineTo(W, horizon + 6); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = gr; g.fill();
    g.beginPath(); g.moveTo(0, horizon + 6); g.lineTo(W, horizon + 6); ink(g, 5);
    for (i = 0; i < 70; i++) {
      var tx = r() * W, ty = horizon + 26 + r() * (H - horizon - 30);
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - 4, ty - 10); g.moveTo(tx, ty); g.lineTo(tx + 4, ty - 11);
      g.lineWidth = 3; g.strokeStyle = 'rgba(28,110,50,0.45)'; g.lineCap = 'round'; g.stroke();
    }
  }
  A.scene = function (kind, ps) {
    return layer('scene-' + kind, ps, W, H, function (g) { scene(g, kind === 'play' ? 440 : 610, kind === 'play' ? 7 : 11); });
  };
  // Pale clouds that drift by behind everything (a few circles a frame).
  A.driftClouds = function (g, time, still) {
    for (var i = 0; i < 4; i++) {
      var x = ((still ? 0 : time) * (8 + i * 3) + i * 380) % (W + 300) - 150;
      bgCloud(g, x, 110 + i * 62, 0.8 + (i % 2) * 0.3, 0.55);
    }
  };

  /* --------------------------------------------------------------- clouds */
  // A puffy cloud body for a word: outline circles first, then the white fill on top.
  function puffs(w, h) {
    var list = [], n = Math.max(2, Math.round(w / 64)), r = h * 0.42;
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1), x = -w / 2 + r * 0.9 + t * (w - r * 1.8);
      list.push([x, -h * 0.12 - Math.sin(t * Math.PI) * h * 0.16, r * (0.85 + 0.25 * Math.sin(t * Math.PI))]);
    }
    list.push([-w / 2 + r * 0.7, h * 0.12, r * 0.78], [w / 2 - r * 0.7, h * 0.12, r * 0.78]);
    return list;
  }
  // Sprites are (w + 60) x 200 logical px, centred on the cloud.
  var CH = 200;
  function cloudBody(w, storm) {
    var key = 'cl' + Math.round(w / 10) + (storm ? 's' : ''), H2 = 112;
    if (cache[key]) return cache[key];
    var c = cv((w + 60) * 2, CH * 2), g = c.getContext('2d');
    g.scale(2, 2); g.translate((w + 60) / 2, CH / 2);
    var list = puffs(w, H2), base = storm ? '#c9cfe6' : '#ffffff', under = storm ? '#9aa3c7' : '#dfe6ff';
    g.fillStyle = INK;
    list.forEach(function (p) { circle(g, p[0], p[1], p[2] + 5); g.fill(); });
    rr(g, -w / 2 - 5, -4, w + 10, H2 * 0.42 + 9, 26); g.fill();
    g.fillStyle = base;
    list.forEach(function (p) { circle(g, p[0], p[1], p[2]); g.fill(); });
    rr(g, -w / 2, 1, w, H2 * 0.42, 22); g.fill();
    // a soft lavender belly
    g.save(); g.beginPath(); list.forEach(function (p) { g.moveTo(p[0] + p[2], p[1]); g.arc(p[0], p[1], p[2], 0, TAU); }); g.rect(-w / 2, 1, w, H2 * 0.42); g.clip();
    g.fillStyle = under; g.fillRect(-w / 2 - 20, H2 * 0.24, w + 40, 60);
    g.fillStyle = 'rgba(255,255,255,0.9)'; circle(g, list[0][0] + 4, list[0][1] - list[0][2] * 0.45, 9); g.fill();
    g.restore();
    return (cache[key] = c);
  }
  // The glow around the cloud being typed: the same shape, wider, in lightning yellow.
  function cloudGlow(w) {
    var key = 'cg' + Math.round(w / 10), H2 = 112;
    if (cache[key]) return cache[key];
    var c = cv((w + 60) * 2, CH * 2), g = c.getContext('2d');
    g.scale(2, 2); g.translate((w + 60) / 2, CH / 2);
    g.fillStyle = '#ffe14d';
    puffs(w, H2).forEach(function (p) { circle(g, p[0], p[1], p[2] + 16); g.fill(); });
    rr(g, -w / 2 - 16, -14, w + 32, H2 * 0.42 + 30, 34); g.fill();
    return (cache[key] = c);
  }
  A.cloudBody = cloudBody;
  function wordSize(text) { return text.length === 1 ? 64 : text.indexOf(' ') > 0 ? 38 : 46; }
  // Width of a word's first n letters as they appear inside the joined word: a ZWJ keeps
  // the last of them in its joining form.
  function prefixW(g, text, n) { return n <= 0 ? 0 : g.measureText(text.slice(0, n) + (n < text.length ? ZWJ : '')).width; }
  // c: { text, typed, x, y, w, shake, storm (0..1), locked, next: letters the next key types }
  A.cloud = function (g, c, time, still) {
    var sway = still ? 0 : Math.sin(time * 0.9 + c.phase) * 8, bob = still ? 0 : Math.sin(time * 1.7 + c.phase) * 3;
    var shake = c.shake > 0 && !still ? Math.sin(c.shake * 60) * 9 * Math.min(1, c.shake / 0.2) : 0;
    var x = c.x + sway + shake, y = c.y + bob, w = c.w, s = c.scale || 1, ar = c.lang === 'ar';
    g.save(); g.translate(x, y); if (s !== 1) g.scale(s, s);
    var a0 = g.globalAlpha;
    if (c.locked) {
      var pulse = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 7);
      g.globalAlpha = a0 * (0.75 + 0.25 * pulse); g.drawImage(cloudGlow(w), -(w + 60) / 2, -CH / 2, w + 60, CH); g.globalAlpha = a0;
    }
    g.drawImage(cloudBody(w, false), -(w + 60) / 2, -CH / 2, w + 60, CH);
    if (c.storm > 0.02) { g.globalAlpha = a0 * Math.min(1, c.storm); g.drawImage(cloudBody(w, true), -(w + 60) / 2, -CH / 2, w + 60, CH); g.globalAlpha = a0; }
    // a small sleepy face on the top puff: it wakes up when the child types it
    var fx0 = -w / 2 + 34, fy = -30;
    if (c.face !== false && w >= 150) {
      g.lineWidth = 2.6; g.strokeStyle = INK; g.lineCap = 'round';
      if (c.locked) { circle(g, fx0 - 7, fy, 2.6); fill(g, INK); circle(g, fx0 + 7, fy, 2.6); fill(g, INK); }
      else { g.beginPath(); g.arc(fx0 - 7, fy - 1, 3, 0.2, Math.PI - 0.2); g.moveTo(fx0 + 10, fy - 0.4); g.arc(fx0 + 7, fy - 1, 3, 0.2, Math.PI - 0.2); g.stroke(); }
      g.beginPath(); g.arc(fx0, fy + 4, 3.4, 0.3, Math.PI - 0.3); g.stroke();
      g.fillStyle = 'rgba(255,126,182,0.55)'; circle(g, fx0 - 13, fy + 5, 3.6); g.fill(); circle(g, fx0 + 13, fy + 5, 3.6); g.fill();
    }
    // the word: whole, then the typed part again in lightning yellow under a clip
    var size = wordSize(c.text), ty = 6;
    g.font = font(size); g.direction = ar ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
    var full = g.measureText(c.text).width, tw = prefixW(g, c.text, c.typed), edge = ar ? full / 2 : -full / 2, dir = ar ? -1 : 1;
    g.fillStyle = INK; g.fillText(c.text, 0, ty);
    if (c.typed > 0) {
      g.save(); g.beginPath();
      g.rect(ar ? edge - tw - 2 : edge - 6, -50, tw + 8, 110); g.clip();
      g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = INK; g.strokeText(c.text, 0, ty);
      g.fillStyle = '#ffd23f'; g.fillText(c.text, 0, ty);
      g.restore();
    }
    // the next letter: a glowing bar under it (and a soft halo behind it while locked)
    if (c.next && c.typed < c.text.length) {
      var nw = Math.max(14, prefixW(g, c.text, c.typed + c.next) - tw), nx = edge + dir * (tw + nw / 2);
      if (c.text[c.typed] === ' ') nw = Math.max(nw, 24);
      var p = still ? 1 : 0.75 + 0.25 * Math.sin(time * 9);
      rr(g, nx - nw / 2 - 3, ty + size * 0.46, nw + 6, 9, 4.5); g.fillStyle = INK; g.fill();
      rr(g, nx - nw / 2, ty + size * 0.46 + 2, nw, 5, 2.5); g.fillStyle = 'rgba(255,159,28,' + p.toFixed(3) + ')'; g.fill();
      c.letterX = x + nx * s; c.letterY = y + (ty + size * 0.3) * s;
    } else { c.letterX = x; c.letterY = y; }
    g.restore();
  };
  // Rain under a cloud that reached the town (k 0..1 over its rain time).
  A.rain = function (g, x, y, w, k, time) {
    g.save(); g.lineCap = 'round'; g.lineWidth = 4; g.strokeStyle = 'rgba(80,150,230,' + (k < 0.8 ? 0.85 : (1 - k) * 4).toFixed(3) + ')';
    g.beginPath();
    for (var i = 0; i < 9; i++) {
      var dx = -w / 2 + 20 + i * (w - 40) / 8, off = ((time * 380 + i * 37) % 70);
      g.moveTo(x + dx, y + 40 + off); g.lineTo(x + dx - 4, y + 54 + off);
    }
    g.stroke(); g.restore();
  };
  A.rainbow = function (g, x, y, r, a) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.lineCap = 'butt';
    g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.lineWidth = 6 * 8 + 8; g.strokeStyle = 'rgba(28,34,80,0.9)'; g.stroke();
    for (var i = 0; i < 6; i++) { g.beginPath(); g.arc(x, y, r + 20 - i * 8, Math.PI + 0.02, -0.02); g.lineWidth = 8.5; g.strokeStyle = A.RAINBOW[i]; g.stroke(); }
    g.restore();
  };
  // A friendly cartoon bolt from (x1, y1) up to (x2, y2): ink, yellow, white core.
  A.bolt = function (g, x1, y1, x2, y2, seed, k) {
    var r = seeded(seed || 3), pts = [[x1, y1]], n = 7, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (var i = 1; i < n; i++) { var t = i / n, j = (i % 2 ? 1 : -1) * (14 + r() * 16); pts.push([x1 + dx * t + nx * j, y1 + dy * t + ny * j]); }
    pts.push([x2, y2]);
    g.save(); g.globalAlpha = Math.max(0, 1 - k * k); g.lineJoin = 'round'; g.lineCap = 'round';
    [[16, INK], [10, '#ffd23f'], [4, '#ffffff']].forEach(function (p) {
      g.beginPath(); pts.forEach(function (q, i) { g[i ? 'lineTo' : 'moveTo'](q[0], q[1]); }); g.lineWidth = p[0]; g.strokeStyle = p[1]; g.stroke();
    });
    g.restore();
  };
  // A little bolt icon.
  A.boltIcon = function (g, x, y, s, color) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.moveTo(4, -20); g.lineTo(-11, 3); g.lineTo(-1, 3); g.lineTo(-5, 20); g.lineTo(11, -4); g.lineTo(1, -4); g.lineTo(6, -20); g.closePath();
    fill(g, color || '#ffd23f'); ink(g, 3.5 / s);
    g.restore();
  };
  // A puff of the burst cloud.
  A.puff = function (g, x, y, r, a) { g.globalAlpha = a; circle(g, x, y, r); fill(g, '#ffffff'); g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); g.globalAlpha = 1; };

  /* ----------------------------------------------------------- keyboard */
  var KB = TT.KB, KEYS = TT.KEYS;
  A.KB_BOX = { x: KB.x - 14, y: KB.y - 14, w: 15 * KB.unit + 24, h: 5 * KB.unit + 24 };
  function keycap(g, k, top, side, lw) {
    rr(g, k.x, k.y + 3, k.w, k.h, 9); fill(g, side);
    rr(g, k.x, k.y, k.w, k.h - 3, 9); fill(g, top);
    rr(g, k.x, k.y, k.w, k.h + 3, 9); g.lineWidth = lw || 2.5; g.strokeStyle = INK; g.stroke();
  }
  function winLogo(g, x, y, s, color) {
    g.fillStyle = color;
    g.fillRect(x - s, y - s, s - 1.5, s - 1.5); g.fillRect(x + 1.5, y - s, s - 1.5, s - 1.5);
    g.fillRect(x - s, y + 1.5, s - 1.5, s - 1.5); g.fillRect(x + 1.5, y + 1.5, s - 1.5, s - 1.5);
  }
  // Legends where the real keycaps print them: Latin large top-left, Arabic bottom-right,
  // digits bottom-left with the Arabic-Indic digit bottom-right, symbols top-left.
  var SHOW_AR_SHIFT = /^(أ|إ|آ|لأ|لإ|لآ|؟|،|؛)$/;
  function legends(g, k, lang, color, dim) {
    var x = k.x, y = k.y, w = k.w, h = k.h - 3, arOn = lang !== 'en', enOn = lang !== 'ar';
    g.textBaseline = 'middle';
    function put(s, px, py, size, align, rtl, a) {
      g.globalAlpha = a; g.font = font(size); g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = align; g.fillStyle = color; g.fillText(s, px, py);
    }
    if (k.label) {
      g.globalAlpha = 1;
      if (k.label === 'win') { winLogo(g, x + w / 2, y + h / 2, 7, color); return; }
      if (k.label === 'menu') { rr(g, x + w / 2 - 7, y + h / 2 - 9, 14, 18, 3); g.lineWidth = 2; g.strokeStyle = color; g.stroke(); return; }
      var right = k.code === 'Backspace' || k.code === 'Enter' || k.code === 'ShiftRight' || k.code === 'ControlRight';
      put(k.label, right ? x + w - 7 : x + 7, y + 13, 12.5, right ? 'right' : 'left', false, 0.85);
      g.globalAlpha = 1;
      return;
    }
    if (k.code === 'Space') return;
    var letter = /^[a-z]$/.test(k.en);
    if (letter) {
      put(k.enS, x + 6, y + 14, 19, 'left', false, enOn ? 1 : dim);
      put(k.ar, x + w - 6, y + h - 14, k.ar.length > 1 ? 17 : 20, 'right', true, arOn ? 1 : dim);
      if (SHOW_AR_SHIFT.test(k.arS)) put(k.arS, x + w - 6, y + 12, 12, 'right', true, arOn ? 0.75 : dim * 0.75);
    } else {
      put(k.enS, x + 7, y + 13, 13, 'left', false, 0.8);
      put(k.en, x + 7, y + h - 12, 15, 'left', false, enOn ? 1 : dim);
      if (k.ar && k.ar !== k.en) put(k.ar, x + w - 6, y + h - 13, /[0-9٠-٩]/.test(k.ar) ? 14 : 19, 'right', true, arOn ? 1 : dim);
      if (SHOW_AR_SHIFT.test(k.arS)) put(k.arS, x + w - 6, y + 12, 12, 'right', true, arOn ? 0.75 : dim * 0.75);
    }
    g.globalAlpha = 1;
  }
  A.legends = legends;
  function bump(g, k, color) { rr(g, k.x + k.w / 2 - 7, k.y + k.h - 10, 14, 3.5, 2); g.fillStyle = color; g.fill(); }
  // The whole keyboard with its legends, once per language and pixel scale.
  // Cropped to the keyboard's own box (A.KB_CROP), so a frame blits no empty pixels.
  A.KB_CROP = { x: A.KB_BOX.x - 4, y: A.KB_BOX.y - 4, w: A.KB_BOX.w + 8, h: H - A.KB_BOX.y + 4 };
  A.keyboardBase = function (lang, ps, zones) {
    var C = A.KB_CROP;
    return layer('kb-' + lang + (zones ? 'z' : ''), ps, C.w, C.h, function (g) {
      g.translate(-C.x, -C.y);
      var b = A.KB_BOX;
      rr(g, b.x, b.y + 6, b.w, b.h + 30, 26); fill(g, 'rgba(28,34,80,0.35)');
      rr(g, b.x, b.y, b.w, b.h + 30, 26); fill(g, '#2a2f4f'); ink(g, 6);
      rr(g, b.x + 8, b.y + 8, b.w - 16, 8, 4); fill(g, 'rgba(255,255,255,0.08)');
      for (var code in KEYS) {
        var k = KEYS[code];
        keycap(g, k, '#3d4473', '#232848');
        var f = TT.FINGER[code];
        if (zones && f != null) { rr(g, k.x + 6, k.y + k.h - 8, k.w - 12, 3, 1.5); g.fillStyle = alpha(A.FINGERS[f], 0.85); g.fill(); }
        legends(g, k, lang, '#ffffff', 0.38);
        if (code === 'KeyF' || code === 'KeyJ') bump(g, k, 'rgba(255,255,255,0.75)');
      }
    });
  };
  // One key lit: the next key glows yellow; a pressed key flashes (green right, red wrong).
  A.keyLit = function (g, code, lang, kind, power, time, still) {
    var k = KEYS[code];
    if (!k) return;
    var top = kind === 'good' ? '#5be38f' : kind === 'bad' ? '#ff5d6c' : '#ffd23f', side = kind === 'good' ? '#2f9e5a' : kind === 'bad' ? '#b8323f' : '#e0a400';
    if (kind === 'glow') {
      var p = still ? 0.7 : 0.5 + 0.5 * Math.sin(time * 8), grow = 4 + 6 * p * power;
      rr(g, k.x - grow, k.y - grow, k.w + grow * 2, k.h + grow * 2 + 3, 14); g.fillStyle = 'rgba(255,214,61,' + (0.35 + 0.3 * p).toFixed(3) + ')'; g.fill();
    }
    var press = kind === 'good' ? 3 : 0;
    g.save(); g.translate(0, press);
    keycap(g, k, top, side, 3);
    legends(g, k, lang, INK, 0.5);
    if (code === 'KeyF' || code === 'KeyJ') bump(g, k, INK);
    g.restore();
  };
  A.keyCenter = function (code) { var k = KEYS[code]; return k ? { x: k.x + k.w / 2, y: k.y + k.h / 2 } : null; };

  /* -------------------------------------------------------- the animals */
  // Six runners from slow to fast, all facing left (the way the track runs).
  function legs(g, xs, y, len, phase, color, lw) {
    xs.forEach(function (x, i) {
      var a = Math.sin(phase + i * Math.PI * 0.9) * 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * len, y + Math.cos(a) * len);
      g.lineWidth = lw + 5; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
      g.lineWidth = lw; g.strokeStyle = color; g.stroke();
    });
  }
  function eye(g, x, y, r) { circle(g, x, y, r); fill(g, '#fff'); ink(g, 2.5); circle(g, x - r * 0.25, y, r * 0.55); fill(g, INK); circle(g, x - r * 0.45, y - r * 0.3, r * 0.2); fill(g, '#fff'); }
  var DRAW = {
    snail: function (g, ph) {
      var st = Math.sin(ph) * 2;
      g.beginPath(); g.moveTo(-34, 14); g.quadraticCurveTo(-36, -2, -24, -2); g.lineTo(26, 6); g.quadraticCurveTo(34, 14, 26, 18); g.lineTo(-30, 18); g.closePath();
      fill(g, '#ffe27a'); ink(g, 4);
      g.beginPath(); g.moveTo(-28, -2); g.lineTo(-32, -18 + st); g.moveTo(-22, -2); g.lineTo(-20, -18 - st); ink(g, 3);
      circle(g, -32, -20 + st, 4); fill(g, INK); circle(g, -20, -20 - st, 4); fill(g, INK);
      circle(g, 6, -6, 20); fill(g, '#ff8fb8'); ink(g, 4);
      g.beginPath(); for (var a = 0; a < 12; a += 0.3) g[a ? 'lineTo' : 'moveTo'](6 + Math.cos(a) * a * 1.5, -6 + Math.sin(a) * a * 1.5); ink(g, 3);
    },
    turtle: function (g, ph) {
      legs(g, [-16, -6, 10, 20], 8, 12, ph, '#7ad46a', 7);
      ell(g, -30, 2, 11, 9); fill(g, '#7ad46a'); ink(g, 4); eye(g, -33, -1, 4);
      g.beginPath(); g.arc(2, 8, 26, Math.PI, 0); g.closePath(); fill(g, '#2fae62'); ink(g, 4);
      g.beginPath(); g.moveTo(-14, 8); g.lineTo(-8, -6); g.lineTo(8, -6); g.lineTo(14, 8); g.moveTo(-8, -6); g.lineTo(-4, -16); g.moveTo(8, -6); g.lineTo(6, -16); ink(g, 2.5);
    },
    rabbit: function (g, ph) {
      var hop = Math.abs(Math.sin(ph)) * -6;
      g.save(); g.translate(0, hop);
      legs(g, [-12, 14], 12, 12, ph * 1.2, '#f4f4ff', 8);
      ell(g, 2, 2, 24, 16); fill(g, '#f4f4ff'); ink(g, 4);
      circle(g, 26, 0, 7); fill(g, '#ffffff'); ink(g, 3);
      ell(g, -14, -26, 5, 15, -0.3); fill(g, '#f4f4ff'); ink(g, 3.5); ell(g, -6, -28, 5, 15, 0.1); fill(g, '#f4f4ff'); ink(g, 3.5);
      ell(g, -14, -26, 2, 9, -0.3); fill(g, '#ffb3cf');
      circle(g, -20, -6, 13); fill(g, '#f4f4ff'); ink(g, 4); eye(g, -23, -9, 4); circle(g, -32, -3, 3); fill(g, '#ff7eb6');
      g.restore();
    },
    horse: function (g, ph) {
      legs(g, [-16, -6, 12, 22], 10, 18, ph * 1.4, '#c98a52', 7);
      ell(g, 4, 0, 28, 15); fill(g, '#c98a52'); ink(g, 4);
      g.beginPath(); g.moveTo(-18, -4); g.lineTo(-28, -26); g.lineTo(-40, -22); g.lineTo(-40, -12); g.lineTo(-26, -8); g.closePath(); fill(g, '#c98a52'); ink(g, 4);
      eye(g, -30, -21, 3.5);
      g.beginPath(); g.moveTo(-24, -28); g.quadraticCurveTo(-12, -24, -10, -8); g.lineWidth = 8; g.strokeStyle = '#6b3d1f'; g.lineCap = 'round'; g.stroke();
      g.beginPath(); g.moveTo(30, -4); g.quadraticCurveTo(44, -2 + Math.sin(ph * 2) * 4, 40, 14); g.lineWidth = 7; g.stroke();
    },
    cheetah: function (g, ph) {
      var stretch = Math.sin(ph * 1.6) * 3;
      legs(g, [-18, -8, 12, 22], 8, 16, ph * 1.8, '#ffc93c', 6);
      ell(g, 2, 0, 30 + stretch, 12); fill(g, '#ffc93c'); ink(g, 4);
      [[-8, -4], [4, 2], [14, -5], [22, 3], [-14, 4]].forEach(function (p) { circle(g, p[0], p[1], 2.6); fill(g, INK); });
      g.beginPath(); g.moveTo(30, -4); g.quadraticCurveTo(46, -16 + Math.sin(ph * 2) * 5, 52, -8); g.lineWidth = 9; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#ffc93c'; g.stroke();
      circle(g, -30, -8, 12); fill(g, '#ffc93c'); ink(g, 4); eye(g, -34, -11, 3.6);
      g.beginPath(); g.moveTo(-34, -4); g.lineTo(-36, 4); ink(g, 2.5);
      g.beginPath(); g.moveTo(-26, -19); g.lineTo(-22, -26); g.lineTo(-20, -17); fill(g, '#ffc93c'); ink(g, 3);
    },
    rocket: function (g, ph) {
      var fl = 0.8 + 0.3 * Math.sin(ph * 5);
      g.beginPath(); g.moveTo(26, -8); g.lineTo(26 + 26 * fl, 0); g.lineTo(26, 8); g.closePath(); fill(g, '#ff9f43'); ink(g, 3);
      g.beginPath(); g.moveTo(26, -4); g.lineTo(26 + 14 * fl, 0); g.lineTo(26, 4); g.closePath(); fill(g, '#fff27a');
      g.beginPath(); g.moveTo(16, -12); g.lineTo(30, -24); g.lineTo(30, -10); g.closePath(); fill(g, '#ff5d6c'); ink(g, 3.5);
      g.beginPath(); g.moveTo(16, 12); g.lineTo(30, 24); g.lineTo(30, 10); g.closePath(); fill(g, '#ff5d6c'); ink(g, 3.5);
      g.beginPath(); g.moveTo(-34, 0); g.quadraticCurveTo(-20, -16, 26, -12); g.lineTo(26, 12); g.quadraticCurveTo(-20, 16, -34, 0); g.closePath(); fill(g, '#ffffff'); ink(g, 4);
      g.beginPath(); g.moveTo(-34, 0); g.quadraticCurveTo(-26, -9, -16, -11); g.lineTo(-16, 11); g.quadraticCurveTo(-26, 9, -34, 0); g.closePath(); fill(g, '#ff5d6c'); ink(g, 3);
      circle(g, 0, 0, 7); fill(g, '#4fd1ff'); ink(g, 3);
    }
  };
  A.animal = function (g, i, x, y, s, phase, still) {
    g.save(); g.translate(x, y); g.scale(s, s);
    var bounce = still ? 0 : -Math.abs(Math.sin(phase)) * (i === 0 ? 1 : 4);
    g.translate(0, bounce);
    DRAW[TT.ANIMALS[Math.max(0, Math.min(5, i))]](g, still ? 0.6 : phase);
    g.restore();
  };

  /* ------------------------------------------------------------ the HUD */
  A.sun = function (g, x, y, r, lost, time, still) {
    g.save(); g.translate(x, y);
    if (!lost && !still) g.rotate(time * 0.6);
    for (var i = 0; i < 8; i++) { g.rotate(TAU / 8); g.beginPath(); g.moveTo(-r * 0.28, -r * 0.9); g.lineTo(0, -r * 1.42); g.lineTo(r * 0.28, -r * 0.9); g.closePath(); fill(g, lost ? '#b9c0dc' : '#ffb703'); ink(g, 3); }
    g.restore();
    circle(g, x, y, r); fill(g, lost ? '#d7dcef' : '#ffd23f'); ink(g, 3.5);
    if (lost) {
      // a little grey cloud sits on a lost sun
      g.save(); g.translate(x + 4, y + 6);
      [[-8, 0, 9], [4, -4, 11], [14, 2, 8]].forEach(function (p) { circle(g, p[0], p[1], p[2] + 3); fill(g, INK); });
      [[-8, 0, 9], [4, -4, 11], [14, 2, 8]].forEach(function (p) { circle(g, p[0], p[1], p[2]); fill(g, '#c9cfe6'); });
      g.restore();
    } else {
      circle(g, x - r * 0.33, y - r * 0.12, r * 0.12); fill(g, INK); circle(g, x + r * 0.33, y - r * 0.12, r * 0.12); fill(g, INK);
      g.beginPath(); g.arc(x, y + r * 0.08, r * 0.38, 0.25, Math.PI - 0.25); ink(g, 2.5);
    }
  };
  A.cloudIcon = function (g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    var p = [[-12, 3, 10], [0, -4, 13], [13, 3, 10]];
    g.fillStyle = INK; p.forEach(function (q) { circle(g, q[0], q[1], q[2] + 3.5); g.fill(); }); rr(g, -24, 2, 48, 14, 7); g.fill();
    g.fillStyle = '#ffffff'; p.forEach(function (q) { circle(g, q[0], q[1], q[2]); g.fill(); }); rr(g, -20.5, 3, 41, 9.5, 5); g.fill();
    g.restore();
  };
  A.pill = function (g, x, y, w, h, color) {
    rr(g, x, y + 4, w, h, h / 2); fill(g, 'rgba(28,34,80,0.35)');
    rr(g, x, y, w, h, h / 2); fill(g, color || 'rgba(255,255,255,0.92)'); ink(g, 4);
  };
  // The speed track: slow on the right, fast on the left (like reading), the runner on it.
  A.TRACK = { x: 440, y: 14, w: 400, h: 58 };
  A.track = function (g, wpm, shown, phase, time, still, target) {
    var t = A.TRACK;
    A.pill(g, t.x, t.y, t.w, t.h);
    var top = TT.ANIMAL_WPM[TT.ANIMAL_WPM.length - 1] * 1.25;
    function at(v) { return t.x + t.w - 34 - Math.min(1, v / top) * (t.w - 68); }
    // the road fills up behind the runner (right to left)
    rr(g, t.x + 18, t.y + t.h - 14, t.w - 36, 6, 3); fill(g, 'rgba(28,34,80,0.18)');
    var fx = at(shown); rr(g, fx, t.y + t.h - 14, t.x + t.w - 18 - fx, 6, 3); fill(g, '#ffb703');
    for (var i = 1; i < TT.ANIMAL_WPM.length; i++) { var mx = at(TT.ANIMAL_WPM[i]); rr(g, mx - 1.5, t.y + t.h - 18, 3, 14, 1.5); fill(g, 'rgba(28,34,80,0.35)'); }
    // a little star flag where the third star's speed is
    if (target) {
      var sx = at(target);
      g.beginPath(); g.moveTo(sx, t.y + t.h - 8); g.lineTo(sx, t.y + 10); ink(g, 3);
      starPath(g, sx - 9, t.y + 15, 9, 4); fill(g, shown >= target ? '#ffd23f' : '#ffffff'); ink(g, 2.5);
    }
    var a = TT.animal(wpm);
    A.animal(g, a, at(shown), t.y + t.h / 2 - 2, 0.62, phase, still);
  };

  /* -------------------------------------------------------- the garden */
  A.flower = function (g, x, y, kind, k) {
    var s = Math.min(1, k) * (k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1);
    if (s <= 0) return;
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -22); g.lineWidth = 7; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); g.lineWidth = 3.5; g.strokeStyle = '#2f9e44'; g.stroke();
    var c = A.RAINBOW[kind % 6];
    for (var i = 0; i < 5; i++) { var a = i * TAU / 5; circle(g, Math.cos(a) * 8, -26 + Math.sin(a) * 8, 6.5); fill(g, c); ink(g, 2.5); }
    circle(g, 0, -26, 5.5); fill(g, '#fff3a8'); ink(g, 2.5);
    g.restore();
  };

  /* ------------------------------------------------------ the coach hand */
  // A white cartoon hand pointing down with its fingertip at (x, y).
  function handSprite() {
    if (cache.hand) return cache.hand;
    var c = cv(120, 150), g = c.getContext('2d');
    g.scale(1.5, 1.5); g.translate(40, 98);
    function shape() {
      rr(g, -8.5, -54, 17, 54, 8.5); g.fill(); g.stroke();
      rr(g, 7, -60, 15, 30, 7.5); g.fill(); g.stroke();
      rr(g, 20, -58, 14, 26, 7); g.fill(); g.stroke();
      rr(g, -28, -94, 62, 50, 22); g.fill(); g.stroke();
      rr(g, -32, -58, 26, 14, 7); g.fill(); g.stroke();
    }
    g.lineJoin = 'round'; g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = 9; shape();
    g.lineWidth = 0.01; shape();
    g.beginPath(); g.moveTo(14, -40); g.lineTo(14, -50); g.moveTo(27, -40); g.lineTo(27, -48); g.lineWidth = 3; g.strokeStyle = 'rgba(28,34,80,0.4)'; g.stroke();
    return (cache.hand = c);
  }
  A.hand = function (g, x, y, press, a) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a * 0.95; g.translate(x, y - 6 + press * 10);
    g.drawImage(handSprite(), -40, -98, 80, 100);
    g.restore();
  };
  A.handInto = function (c) { var g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(handSprite(), 0, 0, c.width, c.height); };
  // A dotted guide from a cloud's letter down to its key, marching towards the key.
  A.guide = function (g, x1, y1, x2, y2, time, still) {
    g.save(); g.setLineDash([3, 14]); g.lineDashOffset = still ? 0 : -time * 40; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2 + 40, (y1 + y2) / 2, x2, y2);
    g.lineWidth = 11; g.strokeStyle = 'rgba(28,34,80,0.55)'; g.stroke();
    g.lineWidth = 6; g.strokeStyle = '#ffe14d'; g.stroke();
    g.restore();
  };

  /* --------------------------------------------------------------- map */
  function isle(g, p, w, tint, sample, lang) {
    var list = puffs(260, 120);
    g.save(); g.translate(p.x, p.y);
    g.fillStyle = 'rgba(28,34,80,0.25)'; ell(g, 0, 70, 120, 18); g.fill();
    g.fillStyle = INK; list.forEach(function (q) { circle(g, q[0], q[1], q[2] + 6); g.fill(); }); rr(g, -136, -6, 272, 64, 30); g.fill();
    g.fillStyle = tint; list.forEach(function (q) { circle(g, q[0], q[1], q[2]); g.fill(); }); rr(g, -130, 0, 260, 52, 26); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)'; circle(g, list[0][0] + 6, list[0][1] - 18, 10); g.fill();
    // the sign with the world's sample word
    rr(g, -6, -70, 12, 46, 4); fill(g, '#a8693f'); ink(g, 4);
    g.font = font(sample.length > 5 ? 30 : 38); g.direction = lang === 'ar' ? 'rtl' : 'ltr';
    var tw = Math.max(70, g.measureText(sample).width + 34);
    rr(g, -tw / 2, -118, tw, 58, 16); fill(g, '#fff8e6'); ink(g, 5);
    A.text(g, sample, 0, -88, sample.length > 5 ? 30 : 38, INK, { outline: 0, rtl: lang === 'ar' });
    // the world number badge
    circle(g, -tw / 2 - 4, -116, 19); fill(g, '#ff7eb6'); ink(g, 4);
    A.text(g, String(w + 1), -tw / 2 - 4, -114, 24, '#ffffff', { outline: 4 });
    g.restore();
  }
  A.map = function (lang, ps) {
    return layer('map-' + lang, ps, W, H, function (g) {
      var sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#6fc8ff'); sky.addColorStop(1, '#d9f5ff');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      var r = seeded(5);
      for (var i = 0; i < 9; i++) bgCloud(g, r() * W, 80 + r() * 560, 0.8 + r() * 0.8, 0.55);
      // a big soft rainbow behind the path
      A.rainbow(g, 640, 820, 640, 0.35);
      // the dotted path from world to world
      g.save(); g.setLineDash([2, 20]); g.lineCap = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); A.ISLES.forEach(function (p, j) { g[j ? 'lineTo' : 'moveTo'](p.x, p.y + 20); }); g.stroke(); g.restore();
      A.ISLES.forEach(function (p, w) { isle(g, p, w, A.ISLE_TINT[w], TT.WORLD[w].sample[lang], lang); });
    });
  };
  A.lock = function (g, x, y) {
    rr(g, x - 20, y - 6, 40, 32, 8); fill(g, '#ffd23f'); ink(g, 4);
    g.beginPath(); g.arc(x, y - 6, 12, Math.PI, 0); g.lineWidth = 11; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#ffd23f'; g.stroke();
    circle(g, x, y + 9, 4); fill(g, INK);
  };

  /* ------------------------------------------------------ result charts */
  // A small bar chart of recent speeds, right to left like reading (the newest is the
  // furthest left); the best in gold, the newest in blue.
  A.chart = function (canvas, list, best) {
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    var n = 10, bw = (w - 20) / n, top = Math.max(10, best, list.reduce(function (m, v) { return Math.max(m, v); }, 0)) * 1.15;
    g.lineWidth = 2; g.strokeStyle = 'rgba(28,34,80,0.25)'; g.beginPath(); g.moveTo(8, h - 6); g.lineTo(w - 8, h - 6); g.stroke();
    if (best > 0) { var by = h - 6 - (h - 16) * best / top; g.setLineDash([6, 6]); g.strokeStyle = '#ff9f1c'; g.beginPath(); g.moveTo(8, by); g.lineTo(w - 8, by); g.stroke(); g.setLineDash([]); }
    list.slice(-n).forEach(function (v, i, all) {
      var bh = Math.max(4, (h - 16) * v / top), x = w - 10 - (i + 1) * bw + 4;
      rr(g, x, h - 6 - bh, bw - 8, bh, 5); fill(g, v >= best && best > 0 ? '#ffd23f' : i === all.length - 1 ? '#4fd1ff' : '#b8c6f5'); ink(g, 2.5);
    });
  };
  // A speed animal into its own little canvas (result cards).
  A.animalCard = function (canvas, i) {
    var g = canvas.getContext('2d'), s = canvas.width / 120;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    g.scale(s, s);
    circle(g, 60, 52, 48); fill(g, '#fff3a8'); ink(g, 4);
    A.animal(g, i, 62, 56, i === 5 ? 0.95 : 1.1, 0.8, true);
  };
})();
