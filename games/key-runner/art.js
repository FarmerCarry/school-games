/* Key Runner drawing: the seven worlds' parallax backgrounds, the keycap stones, the runner
 * (Zuzu) with colours and hats, the on-screen keyboard printed like the school's Dell Arabic
 * keyboard, the HUD pieces and the menu pictures. Static layers and sprites are drawn once
 * into offscreen canvases and then only blitted; per frame there are blits and a few plain
 * paths. No image files, no getImageData. */
(function () {
  'use strict';
  var KR = window.KR, W = KR.W, TAU = Math.PI * 2, INK = '#1c2250';
  var A = KR.art = {};
  A.INK = INK;
  var SS = 2;
  var cache = {}, layerKeys = [];
  A.reset = function () { cache = {}; layerKeys = []; };

  /* ------------------------------------------------------------- helpers */
  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function ink(g, lw, color) { g.lineWidth = lw || 5; g.strokeStyle = color || INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
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
  var AR = /[؀-ۿ]/;
  // Text in the shared Fredoka family (Arabic letters come from its rounded Arabic face).
  function text(g, s, x, y, size, color, o) {
    o = o || {};
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    g.direction = AR.test(s) ? 'rtl' : 'ltr';
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.stroke; g.strokeStyle = o.ink || INK; g.strokeText(s, x, y); }
    g.fillStyle = color;
    g.fillText(s, x, y);
  }
  A.text = text; A.rr = rr; A.circle = circle; A.shade = shade; A.alpha = alpha; A.starPath = starPath; A.ink = ink;
  function sprite(key, w, h, draw) {
    if (cache[key]) return cache[key];
    var c = cv(w * SS, h * SS), g = c.getContext('2d');
    g.scale(SS, SS); draw(g, w, h);
    return (cache[key] = c);
  }

  /* -------------------------------------------------------------- worlds */
  // sky top/bottom, far and mid hills, water (the gap between stones), keycap underglow, stems.
  A.SCENES = [
    { sky: ['#4fc0ff', '#d2f4ff'], sun: '#fff27a', far: '#a3e86f', far2: '#86d85a', mid: '#57bd4b', water: '#35b2f5', deep: '#1d84d8', foam: '#ffffff', glow: '#ff9f43', stem: '#c7834a', stem2: '#93592c', deco: 'tree' },
    { sky: ['#ff8cc6', '#ffe6f3'], sun: '#fff4b8', far: '#ffc6e5', far2: '#ffaed8', mid: '#ff86c0', water: '#ff62ab', deep: '#d83f8c', foam: '#ffd8ec', glow: '#35e0d0', stem: '#ffffff', stem2: '#ff4d6d', deco: 'candy' },
    { sky: ['#56dcb4', '#e6ffd6'], sun: '#fff27a', far: '#62c98d', far2: '#47b277', mid: '#2c9c57', water: '#23c4b9', deep: '#118c93', foam: '#d4fff6', glow: '#ffd23f', stem: '#8f5d2c', stem2: '#62401e', deco: 'palm' },
    { sky: ['#3f86ff', '#cfe5ff'], sun: '#ffffff', far: '#eef5ff', far2: '#dce9ff', mid: '#ffffff', water: '#ffffff', deep: '#e6eeff', foam: '#ffffff', glow: '#b48cff', stem: '#ffffff', stem2: '#c8d7ff', deco: 'sky' },
    { sky: ['#ff8758', '#ffe3a3'], sun: '#fff1a8', far: '#ffb07a', far2: '#f59a60', mid: '#f4c46c', water: '#21c1d9', deep: '#118eb2', foam: '#ffffff', glow: '#ff5d6c', stem: '#dc9d58', stem2: '#a6703a', deco: 'beach' },
    { sky: ['#131a52', '#5b3aa8'], sun: '#fff7c2', far: '#2c2d7c', far2: '#383494', mid: '#211d66', water: '#3c26ba', deep: '#21147a', foam: '#8ff0ff', glow: '#2ee5ff', stem: '#7a6cf0', stem2: '#4a36c6', deco: 'city' },
    { sky: ['#7acdff', '#fff1cf'], sun: '#fff27a', far: '#cdbaff', far2: '#b9a3ff', mid: '#ffb1d6', water: '#8a6bff', deep: '#6646e6', foam: '#ffe4ff', glow: '#ffd23f', stem: '#ff80b8', stem2: '#d84f92', deco: 'castle' }
  ];
  A.RAINBOW = ['#ff5d6c', '#ff9f43', '#ffd23f', '#5be38f', '#4fd1ff', '#b48cff'];
  // Smooth tileable hills: a sum of sines with whole periods across the width.
  function hills(g, w, y0, amp, color, seed, top) {
    var r = seeded(seed), k1 = 1 + Math.floor(r() * 3), k2 = 3 + Math.floor(r() * 3), p1 = r() * TAU, p2 = r() * TAU;
    g.beginPath(); g.moveTo(0, top);
    for (var x = 0; x <= w; x += 8) {
      var y = y0 - amp * (0.55 + 0.3 * Math.sin(TAU * k1 * x / w + p1) + 0.15 * Math.sin(TAU * k2 * x / w + p2));
      g.lineTo(x, y);
    }
    g.lineTo(w, top); g.closePath();
    fill(g, color);
  }
  function hillY(w, x, y0, amp, seed) {
    var r = seeded(seed), k1 = 1 + Math.floor(r() * 3), k2 = 3 + Math.floor(r() * 3), p1 = r() * TAU, p2 = r() * TAU;
    return y0 - amp * (0.55 + 0.3 * Math.sin(TAU * k1 * x / w + p1) + 0.15 * Math.sin(TAU * k2 * x / w + p2));
  }
  // Decorations stand on the mid hills; each is drawn twice near the edges so the tile wraps.
  function wrapDraw(w, x, r, fn) { fn(x); if (x < r) fn(x + w); if (x > w - r) fn(x - w); }
  function tree(g, x, y, s, S) {
    rr(g, x - 7 * s, y - 40 * s, 14 * s, 44 * s, 5 * s); fill(g, '#9a5d2e'); ink(g, 4 * s);
    circle(g, x - 18 * s, y - 52 * s, 24 * s); fill(g, S.mid); ink(g, 4 * s);
    circle(g, x + 18 * s, y - 54 * s, 22 * s); fill(g, S.mid); ink(g, 4 * s);
    circle(g, x, y - 76 * s, 28 * s); fill(g, shade(S.mid, 0.12)); ink(g, 4 * s);
    circle(g, x - 8 * s, y - 86 * s, 8 * s); fill(g, 'rgba(255,255,255,0.35)');
    circle(g, x + 14 * s, y - 60 * s, 4 * s); fill(g, '#ff5d6c'); circle(g, x - 22 * s, y - 48 * s, 4 * s); fill(g, '#ff5d6c');
  }
  function lolly(g, x, y, s, c) {
    rr(g, x - 4 * s, y - 70 * s, 8 * s, 74 * s, 4 * s); fill(g, '#ffffff'); ink(g, 3.5 * s);
    circle(g, x, y - 92 * s, 30 * s); fill(g, c); ink(g, 4.5 * s);
    g.beginPath();
    for (var a = 0; a < 5.6 * Math.PI; a += 0.2) { var rad = a * 1.6 * s; g[a ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y - 92 * s + Math.sin(a) * rad); }
    ink(g, 5 * s, '#ffffff');
  }
  function gumdrop(g, x, y, s, c) {
    g.beginPath(); g.moveTo(x - 22 * s, y); g.quadraticCurveTo(x - 24 * s, y - 40 * s, x, y - 42 * s); g.quadraticCurveTo(x + 24 * s, y - 40 * s, x + 22 * s, y); g.closePath();
    fill(g, c); ink(g, 4 * s);
    circle(g, x - 7 * s, y - 28 * s, 5 * s); fill(g, 'rgba(255,255,255,0.6)');
  }
  function palm(g, x, y, s, S) {
    g.beginPath(); g.moveTo(x - 6 * s, y); g.quadraticCurveTo(x + 4 * s, y - 60 * s, x + 18 * s, y - 112 * s); g.lineTo(x + 30 * s, y - 110 * s);
    g.quadraticCurveTo(x + 16 * s, y - 60 * s, x + 8 * s, y); g.closePath(); fill(g, '#a8693a'); ink(g, 4 * s);
    var tx = x + 24 * s, ty = y - 112 * s;
    [[-1, -0.3], [-0.8, 0.5], [0.9, 0.4], [1, -0.35], [0.1, -1]].forEach(function (d) {
      g.beginPath(); g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + d[0] * 40 * s, ty + d[1] * 40 * s - 20 * s, tx + d[0] * 70 * s, ty + d[1] * 50 * s + 10 * s);
      g.quadraticCurveTo(tx + d[0] * 36 * s, ty + d[1] * 34 * s, tx, ty);
      fill(g, d[1] < -0.5 ? '#4cc96a' : '#33a852'); ink(g, 3.5 * s);
    });
    circle(g, tx - 4 * s, ty + 6 * s, 7 * s); fill(g, '#7a4a24'); ink(g, 3 * s);
  }
  function cloudShape(g, x, y, s, c, lw) {
    g.beginPath();
    g.arc(x - 34 * s, y, 22 * s, Math.PI * 0.5, Math.PI * 1.5);
    g.arc(x - 12 * s, y - 18 * s, 24 * s, Math.PI, Math.PI * 1.9);
    g.arc(x + 18 * s, y - 14 * s, 22 * s, Math.PI * 1.2, Math.PI * 2);
    g.arc(x + 36 * s, y + 2 * s, 18 * s, Math.PI * 1.5, Math.PI * 0.5);
    g.closePath();
    fill(g, c); if (lw) ink(g, lw);
  }
  function building(g, x, y, w, h, c, r) {
    rr(g, x, y - h, w, h + 10, 6); fill(g, c); ink(g, 4);
    for (var wy = y - h + 14; wy < y - 14; wy += 22) for (var wx = x + 10; wx < x + w - 14; wx += 20) {
      rr(g, wx, wy, 10, 12, 2); fill(g, r() < 0.55 ? '#ffe36b' : 'rgba(255,255,255,0.12)');
    }
  }
  function tower(g, x, y, w, h, c, flag) {
    rr(g, x, y - h, w, h + 10, 4); fill(g, c); ink(g, 4);
    for (var i = 0; i < 3; i++) { rr(g, x + i * w / 3 + 2, y - h - 12, w / 3 - 4, 14, 3); fill(g, c); ink(g, 3.5); }
    g.beginPath(); g.moveTo(x + w / 2, y - h - 12); g.lineTo(x + w / 2, y - h - 46); ink(g, 3);
    g.beginPath(); g.moveTo(x + w / 2, y - h - 46); g.lineTo(x + w / 2 + 22, y - h - 39); g.lineTo(x + w / 2, y - h - 32); g.closePath(); fill(g, flag); ink(g, 3);
    rr(g, x + w / 2 - 8, y - 30, 16, 30, 8); fill(g, shade(c, -0.35));
  }
  function balloon(g, x, y, s, c) {
    g.beginPath(); g.moveTo(x, y + 30 * s); g.lineTo(x - 10 * s, y + 52 * s); g.moveTo(x, y + 30 * s); g.lineTo(x + 10 * s, y + 52 * s); ink(g, 2.5 * s);
    rr(g, x - 11 * s, y + 50 * s, 22 * s, 14 * s, 3 * s); fill(g, '#c7834a'); ink(g, 3 * s);
    ell(g, x, y, 26 * s, 30 * s); fill(g, c); ink(g, 4 * s);
    ell(g, x, y, 9 * s, 30 * s); ink(g, 2.5 * s, 'rgba(28,34,80,0.45)');
    circle(g, x - 10 * s, y - 12 * s, 5 * s); fill(g, 'rgba(255,255,255,0.6)');
  }

  // A lane: its height and the y of the stones' tops (the water is 100 px lower).
  function layers(si, geo) {
    var key = 'L' + si + '_' + geo.h + '_' + geo.base + '_' + geo.ps;
    if (cache[key]) return cache[key];
    // At most two lanes' layers are kept (the world being played and a menu's).
    layerKeys.push(key);
    while (layerKeys.length > 2) delete cache[layerKeys.shift()];
    var S = A.SCENES[si], ps = geo.ps, b = geo.base, R = seeded(si * 977 + 13);
    // The sky is soft: it is drawn at most at its logical size.
    var sp = Math.min(ps, 1), sky = cv(W * sp, geo.h * sp), g = sky.getContext('2d');
    g.scale(sp, sp);
    var gr = g.createLinearGradient(0, 0, 0, b + 100);
    gr.addColorStop(0, S.sky[0]); gr.addColorStop(1, S.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, geo.h);
    if (S.deco === 'city') {
      for (var i = 0; i < 90; i++) { var sx = R() * W, sy = R() * (b - 40), sr = 1 + R() * 2.4; circle(g, sx, sy, sr); fill(g, 'rgba(255,255,255,' + (0.4 + R() * 0.6).toFixed(2) + ')'); }
      circle(g, 1010, b * 0.32, 46); fill(g, S.sun); ink(g, 5);
      circle(g, 992, b * 0.32 - 12, 10); fill(g, 'rgba(28,34,80,0.12)'); circle(g, 1026, b * 0.32 + 14, 7); fill(g, 'rgba(28,34,80,0.12)');
    } else if (S.deco === 'beach') {
      circle(g, 900, b - 30, 120); fill(g, alpha(S.sun, 0.35)); circle(g, 900, b - 30, 86); fill(g, S.sun); ink(g, 5);
    } else {
      circle(g, 1050, b * 0.3, 70); fill(g, alpha(S.sun, 0.35)); circle(g, 1050, b * 0.3, 48); fill(g, S.sun); ink(g, 5);
    }
    if (S.deco === 'castle') {
      A.RAINBOW.forEach(function (c, i) { g.beginPath(); g.arc(380, b + 60, 330 - i * 16, Math.PI, TAU); g.lineWidth = 16; g.strokeStyle = alpha(c, 0.75); g.stroke(); });
    }
    // Far layer: soft hills (or clouds, or a skyline) behind everything.
    var far = cv(W * ps, 260 * ps), f = far.getContext('2d'), fy = 230; // far tile covers b-230 .. b+30
    f.scale(ps, ps);
    if (S.deco === 'sky') {
      for (var c = 0; c < 9; c++) cloudShape(f, (c + 0.3) * W / 9, fy - 30 - (c % 3) * 34, 1.3 + (c % 2) * 0.5, c % 2 ? S.far : S.far2, 0);
      hills(f, W, fy + 20, 40, S.far2, 7 + si, 260);
    } else if (S.deco === 'city') {
      var rc = seeded(77);
      for (var bx = 0; bx < W; bx += 70) building(f, bx, fy + 20, 60, 60 + rc() * 120, S.far2, rc);
    } else {
      hills(f, W, fy - 40, 110, S.far, 3 + si, 260);
      hills(f, W, fy + 10, 70, S.far2, 11 + si, 260);
    }
    // Mid layer: closer hills with trees, lollipops, palms, balloons, buildings or towers.
    var mid = cv(W * ps, 240 * ps), m = mid.getContext('2d'), my = 200; // mid tile covers b-200 .. b+40
    m.scale(ps, ps);
    var midSeed = 31 + si, rm = seeded(si * 31 + 5);
    if (S.deco !== 'sky' && S.deco !== 'city') hills(m, W, my + 40, 46, S.mid, midSeed, 240);
    for (var d = 0; d < 6; d++) {
      var dx = (d + 0.2 + rm() * 0.6) * W / 6, dy = S.deco !== 'sky' && S.deco !== 'city' ? hillY(W, dx, my + 40, 46, midSeed) + 6 : my + 30, s = 0.8 + rm() * 0.5;
      (function (dx, dy, s, d) {
        wrapDraw(W, dx, 120, function (x) {
          if (S.deco === 'tree') tree(m, x, dy, s, S);
          else if (S.deco === 'candy') { if (d % 2) lolly(m, x, dy, s, ['#ff4d6d', '#ffd23f', '#3ee0d0'][d % 3]); else gumdrop(m, x, dy, s * 1.2, ['#7ee05b', '#b48cff', '#ff9f43'][d % 3]); }
          else if (S.deco === 'palm' || S.deco === 'beach') palm(m, x, dy, s * (S.deco === 'beach' ? 0.9 : 1.1), S);
          else if (S.deco === 'sky') balloon(m, x, dy - 120 - (d % 3) * 30, s * 0.9, A.RAINBOW[d % 6]);
          else if (S.deco === 'city') building(m, x - 40, dy + 10, 80, 90 + (d % 3) * 40, S.mid, rm);
          else tower(m, x - 30, dy + 4, 60, 70 + (d % 3) * 36, d % 2 ? '#ffffff' : '#ffe8f4', A.RAINBOW[d % 6]);
        });
      })(dx, dy, s, d);
    }
    // The water's wave strip, scrolled with the stones.
    var foam = cv(W * ps, 40 * ps), fo = foam.getContext('2d');
    fo.scale(ps, ps);
    if (S.deco === 'sky') { for (var q = 0; q < 16; q++) cloudShape(fo, q * W / 16 + 30, 34, 0.75, q % 2 ? '#ffffff' : '#f2f6ff', 0); }
    else {
      fo.beginPath(); fo.moveTo(0, 12);
      for (var x = 0; x <= W; x += 8) fo.lineTo(x, 12 + Math.sin(x / W * TAU * 16) * 5);
      fo.lineTo(W, 40); fo.lineTo(0, 40); fo.closePath(); fill(fo, S.water);
      fo.beginPath();
      for (var x2 = 0; x2 <= W; x2 += 8) fo[x2 ? 'lineTo' : 'moveTo'](x2, 12 + Math.sin(x2 / W * TAU * 16) * 5);
      ink(fo, 5, S.foam);
      for (var p = 0; p < 22; p++) { rr(fo, p * W / 22 + 20, 26 + (p % 2) * 6, 26, 4, 2); fill(fo, alpha(S.foam, 0.55)); }
    }
    return (cache[key] = { sky: sky, far: far, mid: mid, foam: foam, farY: b - fy, midY: b - my });
  }
  function tiled(ctx, img, off, y, h) {
    var x = -(((off % W) + W) % W);
    ctx.drawImage(img, x, y, W, h);
    ctx.drawImage(img, x + W, y, W, h);
  }
  // The world behind a lane: sky, drifting clouds, far and mid hills with parallax.
  A.backdrop = function (ctx, si, geo, cam, time, still) {
    var L = layers(si, geo), S = A.SCENES[si], b = geo.base;
    ctx.drawImage(L.sky, 0, 0, W, geo.h);
    if (S.deco !== 'city') {
      var cl = cloudSprite();
      for (var i = 0; i < 4; i++) {
        var x = ((i * 380 - cam * 0.06 - (still ? 0 : time * (8 + i * 3))) % 1520 + 1520) % 1520 - 160;
        ctx.drawImage(cl, x, b * (0.12 + (i % 3) * 0.13), 150 + (i % 2) * 40, 64 + (i % 2) * 16);
      }
    }
    tiled(ctx, L.far, cam * 0.15, L.farY, 260);
    tiled(ctx, L.mid, cam * 0.4, L.midY, 240);
  };
  // The water (or cloud sea) between the stones, drawn after the stones' posts.
  A.water = function (ctx, si, geo, cam, time, still) {
    var L = layers(si, geo), S = A.SCENES[si], wy = geo.base + 100;
    ctx.fillStyle = S.water; ctx.fillRect(0, wy + 18, W, geo.h - wy - 18);
    ctx.fillStyle = alpha(S.deep, 0.5); ctx.fillRect(0, wy + 52, W, geo.h - wy - 52);
    tiled(ctx, L.foam, cam + (still ? 0 : time * 18), wy - 6, 40);
  };
  function cloudSprite() {
    return sprite('cloud', 150, 64, function (g) { cloudShape(g, 75, 44, 1.25, 'rgba(255,255,255,0.92)', 0); });
  }

  /* -------------------------------------------------------------- stones */
  A.CAP_H = KR.CAP_H;
  var CAP = { idle: ['#3a4168', '#252a46'], target: ['#ffe14d', '#e2a400'], typed: ['#7ef0a2', '#2fae62'], miss: ['#ff8a8a', '#d9454d'] };
  // A keycap stone's body, by world, width and state (the legends are drawn on top).
  function capSprite(si, w, state) {
    return sprite('c' + si + '_' + w + state, w + 12, KR.CAP_H + 16, function (g) {
      var S = A.SCENES[si], c = CAP[state], h = KR.CAP_H, x = 6, y = 4;
      // The world's coloured underglow, like a keyboard's light strip.
      rr(g, x + 4, y + h - 14, w - 8, 22, 11); fill(g, alpha(S.glow, 0.85));
      rr(g, x, y, w, h, 18); fill(g, c[1]); ink(g, 5);
      rr(g, x + 7, y + 4, w - 14, h - 20, 14); fill(g, c[0]);
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.beginPath(); g.moveTo(x + 22, y + 9); g.lineTo(x + w - 22, y + 9); g.stroke();
      g.beginPath(); g.moveTo(x + 9, y + h - 15); g.lineTo(x + w - 9, y + h - 15); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
    });
  }
  function glowSprite(color) {
    return sprite('glow' + color, 220, 220, function (g) {
      var gr = g.createRadialGradient(110, 110, 10, 110, 110, 108);
      gr.addColorStop(0, alpha(color, 0.9)); gr.addColorStop(0.5, alpha(color, 0.45)); gr.addColorStop(1, alpha(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 220, 220);
    });
  }
  A.glow = function (ctx, x, y, rx, ry, color, a) {
    if (a <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(glowSprite(color || '#ffe14d'), x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
  };
  function arrowShape(g, x, y, s, dir) {
    g.save(); g.translate(x, y); g.rotate(dir === 'ArrowUp' ? -Math.PI / 2 : dir === 'ArrowDown' ? Math.PI / 2 : dir === 'ArrowLeft' ? Math.PI : 0);
    g.beginPath(); g.moveTo(-14 * s, -6 * s); g.lineTo(2 * s, -6 * s); g.lineTo(2 * s, -15 * s); g.lineTo(17 * s, 0); g.lineTo(2 * s, 15 * s); g.lineTo(2 * s, 6 * s); g.lineTo(-14 * s, 6 * s); g.closePath();
    g.restore();
  }
  A.arrowShape = arrowShape;
  // Legends placed like the real keys: a letter big top-left with its Arabic letter
  // bottom-right; a digit or sign bottom-left with the Shift sign top-left; the label mode
  // ('both', 'ar', 'en') only changes which of the two is drawn big.
  function legends(g, k, x, y, w, h, s, mode, color, dim) {
    var lat = k.lat, ar = k.ar, pad = 0.15 * h;
    g.globalAlpha = dim ? 0.45 : 1;
    if (k.code === 'Space') {
      text(g, mode === 'en' ? 'Space' : 'مسافة', x + w / 2, y + h * 0.5, h * 0.4 * s, color);
    } else if (k.finger === 9) {
      arrowShape(g, x + w / 2, y + h * 0.5, h / 44, k.code); fill(g, color);
    } else if (k.letter) {
      var bigL = mode !== 'ar', bigA = mode !== 'en';
      text(g, lat, x + pad, y + pad * 0.7, h * s * (bigL ? (mode === 'en' ? 0.58 : 0.46) : 0.26), color, { align: 'left', base: 'top' });
      text(g, ar, x + w - pad, y + h - pad * 0.55, h * s * (bigA ? (mode === 'ar' ? 0.66 : 0.5) : 0.3), color, { align: 'right', base: 'bottom' });
    } else {
      if (k.sym) text(g, k.sym, x + pad, y + pad * 0.6, h * 0.24 * s, color, { align: 'left', base: 'top', weight: 500 });
      var digit = /^Digit/.test(k.code);
      text(g, lat, x + pad, y + h - pad * 0.55, h * s * (digit ? 0.48 : 0.44), color, { align: 'left', base: 'bottom' });
      if (ar) text(g, ar, x + w - pad, y + h - pad * 0.55, h * s * (digit ? 0.38 : (mode === 'en' ? 0.32 : 0.46)), color, { align: 'right', base: 'bottom' });
    }
    g.globalAlpha = 1;
  }
  A.legends = legends;
  // One stone: o = { state: 'idle'|'target'|'typed'|'miss', dip (px), shake (px), hidden, dim, mode }.
  A.stone = function (ctx, si, s, x, y, o) {
    var w = s.x1 - s.x0, k = KR.KEY[s.code], st = o.state || 'idle';
    x += o.shake || 0; y += o.dip || 0;
    ctx.drawImage(capSprite(si, w, st), x - 6, y - 4, w + 12, KR.CAP_H + 16);
    if (o.hidden || !k) {
      circle(ctx, x + w / 2, y + 34, 6); fill(ctx, 'rgba(255,255,255,0.18)');
      return;
    }
    legends(ctx, k, x + 7, y + 4, w - 14, KR.CAP_H - 20, 1.18, o.mode || 'both', st === 'idle' ? '#ffffff' : INK, o.dim);
    // F and J carry the little bump, under the Latin letter.
    if (s.code === 'KeyF' || s.code === 'KeyJ') { rr(ctx, x + w * 0.4, y + KR.CAP_H - 23, w * 0.2, 4, 2); fill(ctx, st === 'idle' ? 'rgba(255,255,255,0.5)' : 'rgba(28,34,80,0.45)'); }
  };
  // The post under a stone, down into the water.
  A.post = function (ctx, si, x, y, w, bottom) {
    var S = A.SCENES[si], cx = x + w / 2;
    if (S.deco === 'sky') { cloudShape(ctx, cx, y + KR.CAP_H + 12, 0.9, '#ffffff', 4); return; }
    rr(ctx, cx - 17, y + KR.CAP_H - 10, 34, bottom - y - KR.CAP_H + 20, 6); fill(ctx, S.stem); ink(ctx, 4.5);
    if (S.deco === 'candy') {
      ctx.save(); rr(ctx, cx - 17, y + KR.CAP_H - 10, 34, bottom - y - KR.CAP_H + 20, 6); ctx.clip();
      for (var sy = y + KR.CAP_H - 10; sy < bottom + 20; sy += 26) { ctx.beginPath(); ctx.moveTo(cx - 20, sy); ctx.lineTo(cx + 20, sy - 14); ctx.lineTo(cx + 20, sy - 4); ctx.lineTo(cx - 20, sy + 10); ctx.closePath(); fill(ctx, S.stem2); }
      ctx.restore(); rr(ctx, cx - 17, y + KR.CAP_H - 10, 34, bottom - y - KR.CAP_H + 20, 6); ink(ctx, 4.5);
    } else { rr(ctx, cx + 4, y + KR.CAP_H - 6, 9, bottom - y - KR.CAP_H + 14, 4); fill(ctx, S.stem2); }
  };
  // The low candy bar the runner slides under (↓).
  A.bar = function (ctx, x, top, time) {
    var y = top - 58;
    rr(ctx, x - 40, y - 4, 14, 60, 6); fill(ctx, '#ffffff'); ink(ctx, 4);
    rr(ctx, x + 46, y - 4, 14, 60, 6); fill(ctx, '#ffffff'); ink(ctx, 4);
    ctx.save(); rr(ctx, x - 52, y - 14, 124, 24, 12); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 52, y - 14, 124, 24);
    for (var i = -1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(x - 52 + i * 16, y + 10); ctx.lineTo(x - 44 + i * 16, y - 14); ctx.lineTo(x - 36 + i * 16, y - 14); ctx.lineTo(x - 44 + i * 16, y + 10); ctx.closePath(); fill(ctx, '#ff4d6d'); }
    ctx.restore(); rr(ctx, x - 52, y - 14, 124, 24, 12); ink(ctx, 4.5);
  };
  // A bouncing arrow over the stone to press.
  A.pointer = function (ctx, x, y, time, still, color) {
    var b = still ? 0 : Math.abs(Math.sin(time * 6)) * 10;
    ctx.beginPath(); ctx.moveTo(x - 18, y - 30 - b); ctx.lineTo(x + 18, y - 30 - b); ctx.lineTo(x, y - 6 - b); ctx.closePath();
    fill(ctx, color || '#ffe14d'); ink(ctx, 4.5);
  };

  /* -------------------------------------------------------------- flag */
  A.flag = function (ctx, x, y, time, still, up) {
    rr(ctx, x - 5, y - 150, 10, 154, 5); fill(ctx, '#ffffff'); ink(ctx, 4);
    circle(ctx, x, y - 154, 10); fill(ctx, '#ffd23f'); ink(ctx, 4);
    var wave = still ? 0 : Math.sin(time * 6) * 6, fy = y - 146 + (1 - (up == null ? 1 : up)) * 90;
    ctx.beginPath(); ctx.moveTo(x + 4, fy);
    ctx.quadraticCurveTo(x + 40, fy - 8 + wave, x + 82, fy + 4); ctx.lineTo(x + 82, fy + 50);
    ctx.quadraticCurveTo(x + 40, fy + 40 - wave, x + 4, fy + 52); ctx.closePath();
    fill(ctx, '#ff5d6c'); ink(ctx, 4.5);
    for (var i = 0; i < 2; i++) for (var j = 0; j < 3; j++) if ((i + j) % 2 === 0) { rr(ctx, x + 12 + j * 22, fy + 8 + i * 20, 18, 16, 3); fill(ctx, 'rgba(255,255,255,0.85)'); }
  };
  A.coin = function (ctx, x, y, r, time, still) {
    var sx = still ? 1 : Math.abs(Math.cos(time * 4));
    ell(ctx, x, y, r * Math.max(0.2, sx), r); fill(ctx, '#ffc93c'); ink(ctx, 4);
    ell(ctx, x, y, r * 0.55 * Math.max(0.2, sx), r * 0.55); ink(ctx, 2.5, '#e09a00');
    if (sx > 0.5) { starPath(ctx, x, y, r * 0.42, r * 0.18); fill(ctx, '#fff3b0'); }
  };
  A.heart = function (ctx, x, y, s, on) {
    ctx.beginPath(); ctx.moveTo(x, y + 14 * s);
    ctx.bezierCurveTo(x - 26 * s, y - 4 * s, x - 14 * s, y - 24 * s, x, y - 10 * s);
    ctx.bezierCurveTo(x + 14 * s, y - 24 * s, x + 26 * s, y - 4 * s, x, y + 14 * s);
    fill(ctx, on ? '#ff5d6c' : 'rgba(255,255,255,0.35)'); ink(ctx, 4 * s);
    if (on) { circle(ctx, x - 8 * s, y - 8 * s, 3.5 * s); fill(ctx, 'rgba(255,255,255,0.7)'); }
  };
  A.star = function (ctx, x, y, r, on) { starPath(ctx, x, y, r, r * 0.45); fill(ctx, on ? '#ffd23f' : 'rgba(255,255,255,0.4)'); ink(ctx, Math.max(3, r * 0.16)); };

  /* -------------------------------------------------------------- runner */
  A.COLOR_OF = function (i) { var c = KR.COLORS[i] ? KR.COLORS[i].c : KR.COLORS[0].c; return c === 'rainbow' ? '#ff6fb5' : c; };
  // Zuzu: a round runner with big eyes and a scarf. (x, y): the feet on the ground.
  // o: { color (index), hat (index), pose: 'run'|'wait'|'hop'|'slide'|'cheer'|'idle'|'sad', t (s),
  //      run (stride phase), squash (-1..1), look (dx, dy), speed (0..1), scale, scarf, flip }
  A.runner = function (ctx, x, y, o) {
    var s = o.scale || 1, t = o.t || 0, still = o.still, pose = o.pose || 'idle', sq = o.squash || 0;
    var ci = o.color | 0, rainbow = KR.COLORS[ci] && KR.COLORS[ci].c === 'rainbow', body = A.COLOR_OF(ci);
    var scarf = o.scarf || (rainbow ? '#4fd1ff' : ci === 6 ? '#ffd23f' : '#ff4d6d');
    if (pose === 'slide') sq = Math.max(sq, 0.55);
    var bob = 0;
    if (!still && pose === 'run') bob = -Math.abs(Math.sin(o.run || 0)) * 6;
    if (!still && pose === 'wait') bob = -Math.abs(Math.sin(t * 7)) * 9;
    if (!still && (pose === 'cheer')) bob = -Math.abs(Math.sin(t * 8)) * 26;
    if (!still && pose === 'idle') bob = Math.sin(t * 2.4) * 2;
    var sx = 1 + sq * 0.28, sy = 1 - sq * 0.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (o.flip ? -1 : 1), s);
    // Shadow on the ground (not in the air).
    if (o.ground !== false) { ell(ctx, 0, 2, 30 * sx, 7); fill(ctx, 'rgba(0,0,0,0.18)'); }
    ctx.translate(0, bob);
    var cy = -38 * sy, rx = 31 * sx, ry = 29 * sy;
    // Scarf tails fly behind, longer when fast.
    var sp = o.speed || 0, len = 22 + sp * 46, wav = still ? 0 : Math.sin(t * 16) * (4 + sp * 6);
    ctx.beginPath(); ctx.moveTo(-10, cy + 8 * sy);
    ctx.quadraticCurveTo(-24 - len * 0.4, cy + wav - 4, -22 - len, cy + 4 + wav * 1.4);
    ctx.lineTo(-20 - len, cy + 18 + wav);
    ctx.quadraticCurveTo(-22 - len * 0.4, cy + 14 + wav * 0.6, -10, cy + 18 * sy);
    ctx.closePath(); fill(ctx, scarf); ink(ctx, 4);
    // Feet.
    var ph = o.run || 0, f1 = 0, f2 = 0, lift1 = 0, lift2 = 0;
    if (!still && pose === 'run') { f1 = Math.cos(ph) * 12; f2 = -f1; lift1 = Math.max(0, Math.sin(ph)) * 8; lift2 = Math.max(0, -Math.sin(ph)) * 8; }
    if (pose === 'hop') { f1 = -8; f2 = 10; lift1 = 6; lift2 = 2; }
    if (!still && pose === 'wait') { lift2 = Math.max(0, Math.sin(t * 14)) * 6; }
    if (pose !== 'slide') {
      ell(ctx, -12 + f1, -5 - lift1 - bob * 0, 11, 7); fill(ctx, shade(body, -0.55)); ink(ctx, 3.5);
      ell(ctx, 12 + f2, -5 - lift2, 11, 7); fill(ctx, shade(body, -0.55)); ink(ctx, 3.5);
    }
    // Body.
    ell(ctx, 0, cy, rx, ry);
    if (rainbow) {
      ctx.save(); ctx.clip();
      A.RAINBOW.forEach(function (c, i) { ctx.fillStyle = c; ctx.fillRect(-rx - 2, cy - ry + i * ry * 2 / 6, rx * 2 + 4, ry * 2 / 6 + 1); });
      ctx.restore(); ell(ctx, 0, cy, rx, ry);
    } else fill(ctx, body);
    ink(ctx, 5);
    ell(ctx, 4, cy + 10 * sy, rx * 0.58, ry * 0.5); fill(ctx, 'rgba(255,255,255,0.32)');
    ell(ctx, -14 * sx, cy - 16 * sy, 8, 5, -0.6); fill(ctx, 'rgba(255,255,255,0.55)');
    // Scarf band around the neck.
    ctx.save(); ell(ctx, 0, cy, rx, ry); ctx.clip();
    rr(ctx, -rx - 2, cy + 6 * sy, rx * 2 + 4, 12 * sy, 4); fill(ctx, scarf);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-rx * 0.96, cy + 6 * sy); ctx.quadraticCurveTo(0, cy + 12 * sy, rx * 0.96, cy + 6 * sy); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(-rx * 0.86, cy + 18 * sy); ctx.quadraticCurveTo(0, cy + 24 * sy, rx * 0.86, cy + 18 * sy); ink(ctx, 3);
    // Face: big eyes that look at the next stone.
    var lk = o.look || { x: 1, y: 0 }, lx = Math.max(-1, Math.min(1, lk.x)) * 4, ly = Math.max(-1, Math.min(1, lk.y)) * 4;
    var ex = 6, eyy = cy - 8 * sy, blink = !still && (t % 3.7) < 0.12;
    [[-ex - 7, 0], [ex + 9, 1]].forEach(function (e) {
      if (blink) { ctx.beginPath(); ctx.moveTo(e[0] - 7, eyy); ctx.lineTo(e[0] + 7, eyy); ink(ctx, 3.5); return; }
      ell(ctx, e[0], eyy, 9, 11.5 * Math.max(0.5, sy)); fill(ctx, '#ffffff'); ink(ctx, 3.5);
      circle(ctx, e[0] + lx, eyy + ly + 1, 5.6); fill(ctx, INK);
      circle(ctx, e[0] + lx + 1.8, eyy + ly - 1.6, 2); fill(ctx, '#ffffff');
    });
    // Cheeks and mouth.
    ell(ctx, -ex - 14, eyy + 13, 6, 3.5); fill(ctx, 'rgba(255,90,140,0.45)');
    ell(ctx, ex + 17, eyy + 13, 6, 3.5); fill(ctx, 'rgba(255,90,140,0.45)');
    var my = eyy + 15;
    if (pose === 'hop' || pose === 'cheer') { ctx.beginPath(); ctx.moveTo(-3, my - 2); ctx.quadraticCurveTo(5, my + 12, 13, my - 2); ctx.closePath(); fill(ctx, '#7a1f3d'); ink(ctx, 3); }
    else if (pose === 'sad') { ctx.beginPath(); ctx.moveTo(-1, my + 5); ctx.quadraticCurveTo(5, my - 1, 11, my + 5); ink(ctx, 3); }
    else if (pose === 'wait' && o.long) { ell(ctx, 5, my + 3, 4, 5); fill(ctx, '#7a1f3d'); ink(ctx, 3); }
    else { ctx.beginPath(); ctx.moveTo(-2, my); ctx.quadraticCurveTo(5, my + 7, 12, my); ink(ctx, 3); }
    // Little arms.
    var arm = pose === 'cheer' ? -1 : pose === 'hop' ? -0.6 : pose === 'run' && !still ? Math.sin(ph) * 0.4 : 0.2;
    [[-rx + 2, -1], [rx - 2, 1]].forEach(function (a, i) {
      var ax = a[0], ay = cy + 6 * sy, ang = (i ? -1 : 1) * arm;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + a[1] * 12, ay + 12 * Math.cos(ang) - 14 * Math.max(0, -arm) * 1.2 + (i ? 1 : -1) * 4 * Math.sin(ang));
      ink(ctx, 7); ink(ctx, 3.5, body);
    });
    hat(ctx, o.hat | 0, 0, cy - ry + 2, sx);
    ctx.restore();
  };
  function hat(g, h, x, y, s) {
    var id = KR.HATS[h] ? KR.HATS[h].id : 'none';
    if (id === 'none') return;
    g.save(); g.translate(x, y);
    if (id === 'cap') {
      g.beginPath(); g.moveTo(-22, 6); g.quadraticCurveTo(-20, -18, 2, -18); g.quadraticCurveTo(24, -18, 24, 6); g.closePath(); fill(g, '#3fa2ff'); ink(g, 4);
      g.beginPath(); g.moveTo(14, 2); g.quadraticCurveTo(36, -2, 42, 6); g.quadraticCurveTo(30, 10, 14, 8); g.closePath(); fill(g, '#2a7fd6'); ink(g, 4);
      circle(g, 2, -18, 4); fill(g, '#ffd23f'); ink(g, 3);
    } else if (id === 'bow') {
      g.beginPath(); g.moveTo(4, -2); g.lineTo(-18, -16); g.lineTo(-18, 10); g.closePath(); fill(g, '#ff6fb5'); ink(g, 4);
      g.beginPath(); g.moveTo(4, -2); g.lineTo(26, -16); g.lineTo(26, 10); g.closePath(); fill(g, '#ff6fb5'); ink(g, 4);
      circle(g, 4, -3, 6); fill(g, '#ff3f95'); ink(g, 3.5);
    } else if (id === 'flower') {
      for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; circle(g, Math.cos(a) * 11, -10 + Math.sin(a) * 11, 8); fill(g, ['#ffffff', '#fff4b8'][i % 2]); ink(g, 3.5); }
      circle(g, 0, -10, 7); fill(g, '#ffd23f'); ink(g, 3.5);
    } else if (id === 'party') {
      g.beginPath(); g.moveTo(-15, 6); g.lineTo(2, -42); g.lineTo(19, 6); g.closePath(); fill(g, '#b48cff'); ink(g, 4);
      g.save(); g.beginPath(); g.moveTo(-15, 6); g.lineTo(2, -42); g.lineTo(19, 6); g.closePath(); g.clip();
      for (var j = 0; j < 4; j++) { rr(g, -20, -36 + j * 12, 44, 5, 2); fill(g, ['#ffd23f', '#5be38f', '#ff5d6c', '#4fd1ff'][j]); }
      g.restore(); circle(g, 2, -44, 6); fill(g, '#ffd23f'); ink(g, 3.5);
    } else if (id === 'crown') {
      g.beginPath(); g.moveTo(-20, 6); g.lineTo(-22, -20); g.lineTo(-10, -8); g.lineTo(0, -26); g.lineTo(10, -8); g.lineTo(22, -20); g.lineTo(20, 6); g.closePath();
      fill(g, '#ffd23f'); ink(g, 4);
      circle(g, 0, -4, 4); fill(g, '#ff5d6c'); circle(g, -12, -2, 3); fill(g, '#4fd1ff'); circle(g, 12, -2, 3); fill(g, '#5be38f');
    } else if (id === 'phones') {
      g.beginPath(); g.arc(0, 14, 30, Math.PI * 1.12, Math.PI * 1.88); ink(g, 11); ink(g, 5, '#ff5d6c');
      rr(g, -36, 2, 14, 24, 6); fill(g, '#ff5d6c'); ink(g, 4); rr(g, 22, 2, 14, 24, 6); fill(g, '#ff5d6c'); ink(g, 4);
    } else if (id === 'wizard') {
      g.beginPath(); g.moveTo(-26, 6); g.lineTo(26, 6); g.lineTo(6, -16); g.quadraticCurveTo(0, -48, 16, -60); g.quadraticCurveTo(-8, -50, -12, -16); g.closePath();
      fill(g, '#5b4bd8'); ink(g, 4);
      starPath(g, 0, -16, 7, 3); fill(g, '#ffd23f'); starPath(g, 8, -36, 5, 2); fill(g, '#ffffff');
    } else if (id === 'helmet') {
      g.beginPath(); g.arc(0, 10, 28, Math.PI, TAU); g.closePath(); fill(g, '#ffffff'); ink(g, 4);
      rr(g, -2, -18, 6, 26, 3); fill(g, '#ff5d6c');
      g.beginPath(); g.moveTo(6, 2); g.quadraticCurveTo(20, -6, 28, 6); g.lineTo(28, 10); g.lineTo(6, 10); g.closePath(); fill(g, '#4fd1ff'); ink(g, 3.5);
    }
    g.restore();
  }

  /* ------------------------------------------------------------ keyboard */
  A.ZONES = ['#38bdf8', '#2ee59d', '#ffcc33', '#ff9431', '#ff9431', '#ffcc33', '#2ee59d', '#38bdf8', '#b48cff', '#b48cff'];
  // One key cap at (x, y) of size w x h; st: 'idle' | 'target' | 'down' | 'miss' | 'ok'.
  function keyCap(g, k, x, y, w, h, st, mode, zone, u) {
    var game = k.finger >= 0, r = Math.max(4, h * 0.16);
    var face = st === 'target' ? '#ffe14d' : st === 'miss' ? '#ff6b6b' : st === 'ok' ? '#7ef0a2' : st === 'down' ? '#4b5383' : '#2c3150';
    var side = st === 'target' ? '#d99a00' : st === 'miss' ? '#c73a46' : st === 'ok' ? '#2fae62' : '#181b30';
    var dip = st === 'down' || st === 'miss' || st === 'ok' ? h * 0.06 : 0;
    rr(g, x, y + dip, w, h - dip, r); fill(g, side);
    rr(g, x + h * 0.06, y + dip + h * 0.04, w - h * 0.12, h - dip - h * 0.18, r * 0.8); fill(g, face);
    if (zone && st === 'idle') { rr(g, x + h * 0.06, y + h * 0.04, w - h * 0.12, h * 0.82, r * 0.8); fill(g, alpha(zone, 0.2)); }
    rr(g, x, y + dip, w, h - dip, r); ink(g, Math.max(2, h * 0.05), '#0d1024');
    if (zone) { rr(g, x + w * 0.22, y + h - h * 0.13, w * 0.56, h * 0.07, 2); fill(g, zone); }
    var dark = st === 'target' || st === 'ok' || st === 'miss', color = dark ? INK : game ? '#ffffff' : 'rgba(255,255,255,0.55)';
    var fy = y + dip, fh = h - dip - h * 0.14;
    if (game || k.lat) {
      if (!game) text(g, k.lat, x + h * 0.14, fy + fh * 0.32, h * 0.22, color, { align: 'left', weight: 500 });
      else legends(g, k, x + h * 0.04, fy + h * 0.02, w - h * 0.08, fh, 1, mode, color, false);
    }
    if (k.code === 'KeyF' || k.code === 'KeyJ') { rr(g, x + w * 0.36, fy + fh - h * 0.06, w * 0.28, h * 0.05, 2); fill(g, dark ? 'rgba(28,34,80,0.5)' : 'rgba(255,255,255,0.6)'); }
  }
  // The keyboard drawn once (per size, label mode, highlighted keys and half) into a canvas.
  function kbBase(u, mode, zoneKeys, half, ps) {
    var key = 'K' + u + mode + zoneKeys.join(',') + '_' + half + '_' + ps;
    if (cache[key]) return cache[key];
    var b = kbBounds(u, half), c = cv(b.w * ps, b.h * ps), g = c.getContext('2d');
    g.scale(ps, ps);
    g.translate(-b.x, -b.y);
    var zones = {};
    zoneKeys.forEach(function (code) { var k = KR.KEY[code]; if (k && k.finger >= 0) zones[code] = A.ZONES[k.finger]; });
    KR.KEYS.forEach(function (k) {
      if (!inHalf(k, half)) return;
      var gap = u * 0.1;
      keyCap(g, k, k.x * u + gap / 2, k.row * u + gap / 2, k.w * u - gap, u - gap, 'idle', mode, zones[k.code], u);
    });
    return (cache[key] = { img: c, b: b });
  }
  // half: '' the whole keyboard, 'L' or 'R' a player's half (the digit to the / rows).
  function inHalf(k, half) {
    if (!half) return true;
    return (half === 'L' ? KR.LEFT : KR.RIGHT).indexOf(k.code) >= 0;
  }
  function kbBounds(u, half) {
    if (!half) return { x: 0, y: 0, w: KR.KB_UNITS * u, h: 5 * u };
    var list = KR.KEYS.filter(function (k) { return inHalf(k, half); });
    var x0 = Math.min.apply(null, list.map(function (k) { return k.x; })), x1 = Math.max.apply(null, list.map(function (k) { return k.x + k.w; }));
    return { x: x0 * u, y: 0, w: (x1 - x0) * u, h: 4 * u };
  }
  A.kbSize = function (u, half) { var b = kbBounds(u, half); return { w: b.w, h: b.h }; };
  // Where a key's centre is on screen for a keyboard drawn at (x, y) with unit u.
  A.keyCenter = function (code, x, y, u, half) {
    var k = KR.KEY[code], b = kbBounds(u, half);
    return k ? { x: x + k.x * u + k.w * u / 2 - b.x, y: y + k.row * u + u / 2 } : null;
  };
  // o: { mode, zone: [codes], target, pulse (0..1), down(code), flash: {code: [state, t]}, half, ps, panel }
  A.keyboard = function (ctx, x, y, u, o) {
    var base = kbBase(u, o.mode || 'both', o.zone || [], o.half || '', o.ps || 1), b = base.b;
    if (o.panel !== false) {
      var pad = u * 0.32;
      rr(ctx, x - pad, y - pad, b.w + pad * 2, b.h + pad * 2, u * 0.4); fill(ctx, '#3b4166'); ink(ctx, 5);
      rr(ctx, x - pad + 6, y - pad + 6, b.w + pad * 2 - 12, b.h + pad * 2 - 12, u * 0.32); fill(ctx, '#11142a');
    }
    ctx.drawImage(base.img, x, y, b.w, b.h);
    var gap = u * 0.1, mode = o.mode || 'both';
    function cap(code, st) {
      var k = KR.KEY[code];
      if (!k || !inHalf(k, o.half || '')) return;
      var kx = x + k.x * u - b.x + gap / 2, ky = y + k.row * u + gap / 2;
      keyCap(ctx, k, kx, ky, k.w * u - gap, u - gap, st, mode, null, u);
    }
    if (o.flash) for (var code in o.flash) { var f = o.flash[code]; if (f[1] > 0 && code !== o.target) cap(code, f[0]); }
    if (o.down) KR.KEYS.forEach(function (k) { if (k.code !== o.target && o.down(k.code) && !(o.flash && o.flash[k.code] && o.flash[k.code][1] > 0)) cap(k.code, 'down'); });
    if (o.target) {
      var k = KR.KEY[o.target];
      if (k && inHalf(k, o.half || '')) {
        var c = A.keyCenter(o.target, x, y, u, o.half);
        A.glow(ctx, c.x, c.y, k.w * u * 0.95 + u * 0.4, u * 1.15, '#ffe14d', 0.55 + 0.45 * (o.pulse == null ? 1 : o.pulse));
        cap(o.target, o.down && o.down(o.target) ? 'ok' : 'target');
        // A thick bright ring that pulses so the key is found at once.
        var kx = x + k.x * u - b.x + gap / 2, ky = y + k.row * u + gap / 2, grow = (o.pulse || 0) * u * 0.08;
        rr(ctx, kx - 3 - grow, ky - 3 - grow, k.w * u - gap + 6 + grow * 2, u - gap + 6 + grow * 2, u * 0.2); ink(ctx, Math.max(3, u * 0.09), '#fff7c2');
      }
    }
  };

  /* --------------------------------------------------------------- HUD */
  // A speedometer: the "+1" steps fill the dial, the number sits in the middle.
  A.gauge = function (ctx, x, y, r, steps, max, bump, time, still) {
    var k = Math.min(1, steps / Math.max(1, max)), s = 1 + (bump || 0) * 0.18;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    circle(ctx, 0, 0, r); fill(ctx, '#ffffff'); ink(ctx, 5);
    var a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    ctx.beginPath(); ctx.arc(0, 0, r - 12, a0, a1); ctx.lineWidth = 12; ctx.strokeStyle = '#e4e8f7'; ctx.lineCap = 'round'; ctx.stroke();
    if (k > 0) {
      ctx.beginPath(); ctx.arc(0, 0, r - 12, a0, a0 + (a1 - a0) * k); ctx.lineWidth = 12;
      ctx.strokeStyle = k < 0.4 ? '#5be38f' : k < 0.75 ? '#ffb020' : '#ff5d6c'; ctx.stroke();
    }
    var na = a0 + (a1 - a0) * k + (still ? 0 : Math.sin(time * 30) * 0.03 * k);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(na) * (r - 20), Math.sin(na) * (r - 20)); ink(ctx, 5, INK);
    circle(ctx, 0, 0, 7); fill(ctx, INK);
    text(ctx, '+' + steps, 0, r * 0.52, r * 0.46, INK);
    ctx.restore();
  };
  A.progress = function (ctx, x, y, w, p, color, hat, others) {
    rr(ctx, x, y - 11, w, 22, 11); fill(ctx, 'rgba(28,34,80,0.55)'); ink(ctx, 4, '#ffffff');
    if (p > 0) { rr(ctx, x + 4, y - 7, Math.max(14, (w - 8) * p), 14, 7); fill(ctx, '#ffd23f'); }
    // The finish flag at the right end.
    rr(ctx, x + w + 6, y - 26, 4, 34, 2); fill(ctx, '#ffffff');
    ctx.beginPath(); ctx.moveTo(x + w + 10, y - 26); ctx.lineTo(x + w + 34, y - 19); ctx.lineTo(x + w + 10, y - 12); ctx.closePath(); fill(ctx, '#ff5d6c'); ink(ctx, 3);
    circle(ctx, x + (w - 8) * p + 4, y, 15); fill(ctx, color); ink(ctx, 4);
    circle(ctx, x + (w - 8) * p + 1, y - 3, 3.4); fill(ctx, INK); circle(ctx, x + (w - 8) * p + 9, y - 3, 3.4); fill(ctx, INK);
  };

  /* ---------------------------------------------------------- menus art */
  // A world card's picture: its sky, hills, water and three of its keys.
  A.card = function (canvas, si, keys, mode, locked) {
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, k = w / 280;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.save(); g.scale(k, k);
    var geo = { h: 400, base: 230, ps: 1 }, L = layers(si, geo);
    g.save(); g.translate(0, -130); g.scale(0.5, 0.5);
    g.drawImage(L.sky, 0, 0, W, 400); g.drawImage(L.far, 0, L.farY, W, 260); g.drawImage(L.mid, -100, L.midY, W, 240);
    g.restore();
    var S = A.SCENES[si];
    g.fillStyle = S.water; g.fillRect(0, 118, 280, 40); g.drawImage(L.foam, 0, 112, 640, 20);
    (keys || []).slice(0, 3).forEach(function (code, i) {
      var sx = 22 + i * 86, sy = 64 + (i % 2) * 8;
      g.save(); g.translate(sx, sy); g.scale(0.56, 0.56);
      A.post(g, si, 0, 0, KR.CAP_W, 120);
      A.stone(g, si, { x0: 0, x1: code === 'Space' ? 160 : KR.CAP_W, code: code }, 0, 0, { mode: mode, state: i === 1 ? 'target' : 'idle' });
      g.restore();
    });
    if (locked) { g.fillStyle = 'rgba(40,46,90,0.55)'; g.fillRect(0, 0, 280, 160); }
    g.restore();
    layersDrop(si, geo);
  };
  function layersDrop(si, geo) {
    var key = 'L' + si + '_' + geo.h + '_' + geo.base + '_' + geo.ps, i = layerKeys.indexOf(key);
    delete cache[key];
    if (i >= 0) layerKeys.splice(i, 1);
  }
  // A wardrobe tile: a colour (the runner in it) or a hat (on a plain runner).
  A.itemIcon = function (canvas, it, save) {
    var g = canvas.getContext('2d'), s = canvas.width / 96;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    g.save(); g.scale(s, s);
    if (it.type === 'color') A.runner(g, 48, 86, { color: it.i, hat: 0, pose: 'idle', still: true, scale: 1.05, ground: false });
    else A.runner(g, 48, 104, { color: save.color, hat: it.i, pose: 'idle', still: true, scale: 1.05, ground: false });
    g.restore();
  };
})();
