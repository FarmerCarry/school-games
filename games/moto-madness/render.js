/*
 * Moto Madness — all the art, drawn in code.
 * MMR.setTheme(level) prepares cached layers / sprites for a level's theme.
 * MMR.drawWorld(ctx, world, cam, t) draws everything in the game world.
 * MMR.drawBike(ctx, pose, skin) draws the bike + rider (also used by the garage preview).
 */
(function () {
  'use strict';
  var MMR = window.MMR = {};
  var MM = window.MM;
  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- themes */
  var THEMES = {
    grass: {
      sky: ['#39a8ff', '#8fd3ff', '#d9f4ff'], far: '#9ccbe8', farTop: '#ffffff', mid: '#5fbf6a', mid2: '#4aa957',
      fill: '#9a5e33', fill2: '#83502a', speck: '#b5784a', top: '#4cc437', top2: '#8be35a', edge: '#6b3f1f',
      dust: ['#c89b6a', '#b58555', '#d9b58c'], track: '#ff6a3d', track2: '#ffd23f', wood: '#c98a4b', wood2: '#99612f', pit: '#3b2414'
    },
    desert: {
      sky: ['#ff8a4c', '#ffb56b', '#ffe6a8'], far: '#e39063', farTop: '#f2a877', mid: '#f0b35f', mid2: '#e39b45',
      fill: '#e8a54c', fill2: '#d48d37', speck: '#f5c070', top: '#ffd77a', top2: '#fff0b8', edge: '#b8742a',
      dust: ['#f3c783', '#e8b066', '#ffe0a8'], track: '#2fb6ff', track2: '#ffffff', wood: '#b9773f', wood2: '#8a5226', pit: '#6b3b17'
    },
    winter: {
      sky: ['#6fbfff', '#a8dcff', '#eef9ff'], far: '#c6dcf2', farTop: '#ffffff', mid: '#4f8ea3', mid2: '#3b7589',
      fill: '#9db7d9', fill2: '#8aa6cc', speck: '#b9cde8', top: '#ffffff', top2: '#e3f3ff', edge: '#7890b5',
      dust: ['#ffffff', '#e6f4ff', '#cfe6ff'], track: '#ff4f8b', track2: '#ffffff', wood: '#b07a4a', wood2: '#80522c', pit: '#3c4f73'
    },
    factory: {
      sky: ['#140b2e', '#2c1657', '#4b2378'], far: '#2a1b4f', farTop: '#3a2766', mid: '#3a2a6e', mid2: '#2f2160',
      fill: '#4a4f6e', fill2: '#3c405c', speck: '#5d6386', top: '#ffcf2e', top2: '#2b2b33', edge: '#23253a',
      dust: ['#ffd84d', '#ffae2e', '#ffffff'], track: '#29e6ff', track2: '#ff4fd8', wood: '#8d95b3', wood2: '#5d6385', pit: '#120c22'
    }
  };
  MMR.THEMES = THEMES;
  var T = THEMES.grass, themeId = 'grass';
  var layers = { far: null, mid: null, pattern: null, sprites: [] };

  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  MMR.rrect = rrect;

  // periodic noise so parallax layers tile seamlessly
  function wave(x, W, seed, parts) {
    var v = 0;
    for (var i = 0; i < parts.length; i++) v += Math.sin((x / W) * TAU * parts[i][0] + seed * (i + 1.7)) * parts[i][1];
    return v;
  }

  var LW = 2048, LH = 420, LS = 1.25; // layer width/height (logical) and resolution scale
  function genFar(id) {
    var c = mkCanvas(LW * LS, LH * LS), g = c.getContext('2d'), i, x, y;
    g.scale(LS, LS);
    if (id === 'factory') {
      // city / factory skyline with lit windows
      var R = MM.rng(99);
      g.fillStyle = T.far;
      for (x = 0; x < LW; x += 60 + Math.floor(R() * 60)) {
        var bw = 50 + R() * 90, bh = 120 + R() * 230;
        g.fillRect(x, LH - bh, bw, bh);
        if (R() < 0.4) { g.fillRect(x + bw * 0.3, LH - bh - 70, 16, 70); }
        g.fillStyle = 'rgba(255,214,90,0.55)';
        for (var wy = LH - bh + 14; wy < LH - 10; wy += 22) for (var wx = x + 8; wx < x + bw - 12; wx += 18) if (R() < 0.33) g.fillRect(wx, wy, 8, 10);
        g.fillStyle = T.far;
      }
      return c;
    }
    g.fillStyle = T.far;
    g.beginPath(); g.moveTo(0, LH);
    var pts = [];
    for (x = 0; x <= LW; x += 8) {
      if (id === 'desert') {
        // mesas: flat tops
        var m = wave(x, LW, 1.3, [[3, 1], [7, 0.4]]);
        y = m > 0.25 ? 150 : m > -0.2 ? 150 + (0.25 - m) * 330 : 300 + wave(x, LW, 2, [[11, 20]]);
        y += wave(x, LW, 4, [[23, 4]]);
      } else {
        y = 200 - wave(x, LW, 0.7, [[2, 60], [5, 45], [11, 25], [23, 8]]) - (id === 'winter' ? 30 : 0);
      }
      pts.push([x, y]); g.lineTo(x, y);
    }
    g.lineTo(LW, LH); g.closePath(); g.fill();
    if (id !== 'desert') {
      // snow caps: a zig-zag snow line, clipped to the mountain shape
      g.save(); g.clip();
      g.fillStyle = T.farTop;
      g.beginPath(); g.moveTo(0, 0);
      for (x = 0; x <= LW; x += 16) g.lineTo(x, 150 + (id === 'winter' ? 40 : 0) + ((x / 16) % 2 ? 10 : -6) + wave(x, LW, 5, [[9, 10]]));
      g.lineTo(LW, 0); g.closePath(); g.fill();
      g.restore();
    } else {
      g.fillStyle = 'rgba(160,70,40,0.25)';
      for (i = 0; i < 14; i++) g.fillRect(0, 170 + i * 16, LW, 3);
    }
    return c;
  }
  function genMid(id) {
    var c = mkCanvas(LW * LS, LH * LS), g = c.getContext('2d'), x, y, R = MM.rng(7);
    g.scale(LS, LS);
    if (id === 'factory') {
      g.fillStyle = T.mid;
      for (x = 0; x < LW; x += 180 + Math.floor(R() * 120)) {
        var h = 90 + R() * 120;
        g.fillRect(x, LH - h, 140, h);
        g.fillRect(x + 20 + R() * 60, LH - h - 110 - R() * 60, 26, 200);    // smokestack
        g.fillStyle = '#ff4f6a'; circle(g, x + 70, LH - h - 6, 4); g.fillStyle = T.mid;
        // pipes
        g.fillRect(x + 140, LH - 70, 60, 12);
      }
      g.fillStyle = T.mid2; g.fillRect(0, LH - 40, LW, 40);
      return c;
    }
    g.fillStyle = T.mid;
    g.beginPath(); g.moveTo(0, LH);
    for (x = 0; x <= LW; x += 8) {
      y = 290 - wave(x, LW, 2.1, [[3, 40], [7, 26], [13, 12]]);
      g.lineTo(x, y);
    }
    g.lineTo(LW, LH); g.closePath(); g.fill();
    // silhouettes on the hills
    var R2 = MM.rng(21);
    for (x = 20; x < LW - 20; x += 40 + R2() * 90) {
      y = 290 - wave(x, LW, 2.1, [[3, 40], [7, 26], [13, 12]]) + 6;
      g.fillStyle = T.mid2;
      if (id === 'grass') { circle(g, x, y - 24, 20 + R2() * 10); g.fillRect(x - 3, y - 10, 6, 14); }
      else if (id === 'winter') { g.beginPath(); g.moveTo(x - 18, y); g.lineTo(x, y - 60 - R2() * 20); g.lineTo(x + 18, y); g.fill(); }
      else if (id === 'desert' && R2() < 0.5) { g.fillRect(x - 4, y - 44, 8, 44); g.fillRect(x - 16, y - 30, 6, 16); g.fillRect(x + 10, y - 36, 6, 18); }
    }
    return c;
  }
  function genPattern(ctx) {
    var c = mkCanvas(160, 160), g = c.getContext('2d'), R = MM.rng(5), i;
    g.fillStyle = T.fill; g.fillRect(0, 0, 160, 160);
    if (themeId === 'factory') {
      g.fillStyle = T.fill2; g.fillRect(0, 0, 160, 3); g.fillRect(0, 80, 160, 3); g.fillRect(0, 0, 3, 80); g.fillRect(80, 80, 3, 80);
      g.fillStyle = T.speck;
      [[10, 10], [70, 10], [10, 70], [70, 70], [90, 90], [150, 90], [90, 150], [150, 150]].forEach(function (p) { circle(g, p[0], p[1], 3); });
    } else {
      for (i = 0; i < 26; i++) {
        g.fillStyle = R() < 0.5 ? T.fill2 : T.speck;
        var x = R() * 160, y = R() * 160, r = 3 + R() * 7;
        g.beginPath(); g.ellipse(x, y, r * 1.4, r, R(), 0, TAU); g.fill();
      }
    }
    return ctx.createPattern(c, 'repeat');
  }

  /* --------------------------------------------------------------- sprites */
  function genSprites(id) {
    var list = [];
    function sp(w, h, fn) { var c = mkCanvas(w * 2, h * 2), g = c.getContext('2d'); g.scale(2, 2); fn(g, w, h); list.push({ c: c, w: w, h: h }); }
    if (id === 'grass') {
      sp(130, 170, function (g) { // round tree
        g.fillStyle = '#7a4a26'; g.fillRect(58, 90, 14, 80);
        g.fillStyle = '#2f9e44'; circle(g, 65, 70, 48); circle(g, 34, 92, 30); circle(g, 96, 92, 30);
        g.fillStyle = '#51c25e'; circle(g, 52, 56, 26); circle(g, 84, 74, 18);
        g.fillStyle = '#ff5a5a'; circle(g, 44, 88, 5); circle(g, 88, 60, 5); circle(g, 70, 96, 5);
      });
      sp(90, 60, function (g) { // bush
        g.fillStyle = '#2f9e44'; circle(g, 26, 40, 22); circle(g, 60, 38, 26); circle(g, 44, 26, 22);
        g.fillStyle = '#5fd06a'; circle(g, 40, 22, 10); circle(g, 64, 28, 9);
      });
      sp(70, 50, function (g) { // flowers
        var cols = ['#ff5ab4', '#ffd23f', '#ffffff', '#ff7a2f'];
        for (var i = 0; i < 5; i++) {
          var x = 8 + i * 13, y = 18 + (i % 2) * 10;
          g.strokeStyle = '#2f9e44'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, 50); g.stroke();
          g.fillStyle = cols[i % 4]; circle(g, x, y, 6); g.fillStyle = '#ffe066'; circle(g, x, y, 2.5);
        }
      });
      sp(110, 190, function (g) { // tall tree
        g.fillStyle = '#6b3f1f'; g.fillRect(49, 100, 12, 90);
        g.fillStyle = '#248a3b'; circle(g, 55, 60, 40); circle(g, 55, 100, 36);
        g.fillStyle = '#3fb350'; circle(g, 44, 50, 22);
      });
    } else if (id === 'desert') {
      sp(90, 160, function (g) { // saguaro
        g.fillStyle = '#3f9e4a'; rrect(g, 35, 10, 22, 150, 11); g.fill();
        rrect(g, 8, 60, 16, 50, 8); g.fill(); g.fillRect(14, 96, 30, 14);
        rrect(g, 66, 40, 16, 56, 8); g.fill(); g.fillRect(50, 82, 26, 14);
        g.fillStyle = '#62c46b'; g.fillRect(40, 16, 4, 140);
        g.fillStyle = '#ff5ab4'; circle(g, 46, 12, 6);
      });
      sp(80, 50, function (g) { // rock
        g.fillStyle = '#b8683a'; g.beginPath(); g.moveTo(4, 50); g.lineTo(14, 18); g.lineTo(40, 6); g.lineTo(66, 16); g.lineTo(78, 50); g.fill();
        g.fillStyle = '#d88a52'; g.beginPath(); g.moveTo(16, 22); g.lineTo(40, 10); g.lineTo(52, 20); g.lineTo(28, 30); g.fill();
      });
      sp(60, 60, function (g) { // small cactus in pot shape
        g.fillStyle = '#4fae55'; rrect(g, 20, 14, 20, 46, 10); g.fill(); rrect(g, 4, 28, 14, 22, 7); g.fill(); rrect(g, 42, 22, 14, 24, 7); g.fill();
        g.fillStyle = '#ffd23f'; circle(g, 30, 14, 5);
      });
      sp(70, 44, function (g) { // tumbleweed
        g.strokeStyle = '#a8753f'; g.lineWidth = 2;
        for (var i = 0; i < 9; i++) { g.beginPath(); g.arc(35, 24, 8 + i * 2, i, i + 4); g.stroke(); }
      });
    } else if (id === 'winter') {
      sp(100, 180, function (g) { // snowy pine
        g.fillStyle = '#6b3f1f'; g.fillRect(44, 150, 12, 30);
        for (var i = 0; i < 3; i++) {
          var y = 20 + i * 44, w = 30 + i * 14;
          g.fillStyle = '#23735a'; g.beginPath(); g.moveTo(50, y - 10); g.lineTo(50 + w, y + 60); g.lineTo(50 - w, y + 60); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(50, y - 10); g.lineTo(50 + w * 0.5, y + 22); g.lineTo(50 + w * 0.2, y + 16); g.lineTo(50, y + 24); g.lineTo(50 - w * 0.25, y + 16); g.lineTo(50 - w * 0.5, y + 22); g.fill();
        }
      });
      sp(70, 110, function (g) { // snowman
        g.fillStyle = '#ffffff'; circle(g, 35, 82, 26); circle(g, 35, 44, 19); circle(g, 35, 16, 14);
        g.fillStyle = '#1d2340'; circle(g, 30, 13, 2.5); circle(g, 40, 13, 2.5); circle(g, 35, 40, 2.5); circle(g, 35, 50, 2.5);
        g.fillStyle = '#ff8a2f'; g.beginPath(); g.moveTo(35, 18); g.lineTo(52, 21); g.lineTo(35, 22); g.fill();
        g.fillStyle = '#ff3b5c'; g.fillRect(21, 28, 28, 6); g.fillRect(40, 28, 7, 18);
      });
      sp(90, 50, function (g) { // snowy rock
        g.fillStyle = '#7d8fb0'; g.beginPath(); g.moveTo(4, 50); g.lineTo(18, 16); g.lineTo(46, 6); g.lineTo(76, 18); g.lineTo(88, 50); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(16, 20); g.lineTo(46, 6); g.lineTo(76, 18); g.lineTo(60, 24); g.lineTo(40, 18); g.lineTo(24, 26); g.fill();
      });
      sp(80, 190, function (g) { // tall pine
        g.fillStyle = '#6b3f1f'; g.fillRect(35, 160, 10, 30);
        g.fillStyle = '#1f6b52'; g.beginPath(); g.moveTo(40, 0); g.lineTo(78, 165); g.lineTo(2, 165); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(40, 0); g.lineTo(54, 50); g.lineTo(40, 42); g.lineTo(26, 50); g.fill();
      });
    } else {
      sp(60, 190, function (g) { // lamp post
        g.fillStyle = '#2b2d44'; g.fillRect(27, 20, 7, 170); g.fillRect(14, 20, 34, 8);
        g.fillStyle = '#fff3b0'; rrect(g, 10, 26, 16, 10, 4); g.fill();
      });
      sp(90, 80, function (g) { // barrels
        g.fillStyle = '#ff5a3c'; rrect(g, 6, 26, 34, 54, 6); g.fill(); g.fillStyle = '#3aa0ff'; rrect(g, 44, 18, 38, 62, 6); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(6, 40, 34, 5); g.fillRect(6, 62, 34, 5); g.fillRect(44, 36, 38, 5); g.fillRect(44, 60, 38, 5);
        g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(63, 42); g.lineTo(72, 56); g.lineTo(54, 56); g.fill();
      });
      sp(110, 120, function (g) { // tank + pipe
        g.fillStyle = '#5b6488'; rrect(g, 10, 20, 60, 100, 18); g.fill();
        g.fillStyle = '#7b86ad'; g.fillRect(18, 30, 8, 80);
        g.fillStyle = '#44496a'; g.fillRect(70, 60, 40, 14); g.fillRect(96, 60, 14, 60);
        g.fillStyle = '#29e6ff'; circle(g, 40, 50, 6);
      });
      sp(70, 90, function (g) { // warning sign
        g.fillStyle = '#2b2d44'; g.fillRect(32, 40, 6, 50);
        g.fillStyle = '#ffcf2e'; g.beginPath(); g.moveTo(35, 2); g.lineTo(68, 52); g.lineTo(2, 52); g.closePath(); g.fill();
        g.fillStyle = '#1d1d24'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('!', 35, 46);
      });
    }
    return list;
  }

  MMR.setTheme = function (ctx, level) {
    themeId = level.def.theme; T = THEMES[themeId];
    layers.far = genFar(themeId);
    layers.mid = genMid(themeId);
    layers.pattern = genPattern(ctx);
    layers.sprites = genSprites(themeId);
    layers.skyGrad = null;
    layers.stars = [];
    var R = MM.rng(3);
    for (var i = 0; i < 90; i++) layers.stars.push([R() * 1280, R() * 420, R() * 1.8 + 0.6, R() * 6]);
    layers.clouds = [];
    for (i = 0; i < 7; i++) layers.clouds.push([R() * 2400, 40 + R() * 200, 0.6 + R() * 0.7]);
    layers.flakes = [];
    for (i = 0; i < 80; i++) layers.flakes.push([R() * 1280, R() * 720, 0.5 + R(), R() * 6]);
  };
  MMR.theme = function () { return T; };
  MMR.themeId = function () { return themeId; };

  /* ------------------------------------------------------------ background */
  function drawBackground(ctx, cam, t) {
    if (!layers.skyGrad) {
      var gr = ctx.createLinearGradient(0, 0, 0, 720);
      gr.addColorStop(0, T.sky[0]); gr.addColorStop(0.55, T.sky[1]); gr.addColorStop(1, T.sky[2]);
      layers.skyGrad = gr;
    }
    ctx.fillStyle = layers.skyGrad; ctx.fillRect(0, 0, 1280, 720);
    var i;
    if (themeId === 'factory') {
      for (i = 0; i < layers.stars.length; i++) {
        var s = layers.stars[i];
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s[3]);
        ctx.fillStyle = '#fff'; ctx.fillRect(((s[0] - cam.x * 0.02) % 1280 + 1280) % 1280, s[1], s[2], s[2]);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff6d6'; circle(ctx, 1030, 120, 46);
      ctx.fillStyle = T.sky[1]; circle(ctx, 1050, 108, 40);
    } else if (themeId === 'desert') {
      ctx.fillStyle = 'rgba(255,240,180,0.35)'; circle(ctx, 980, 170, 120);
      ctx.fillStyle = '#fff3c0'; circle(ctx, 980, 170, 70);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(ctx, 1080, 110, 70);
      ctx.fillStyle = '#fffbe0'; circle(ctx, 1080, 110, 44);
    }
    // clouds
    if (themeId !== 'factory') {
      ctx.fillStyle = themeId === 'desert' ? '#fff1dd' : '#ffffff';
      for (i = 0; i < layers.clouds.length; i++) {
        var c = layers.clouds[i], cx = ((c[0] - cam.x * 0.05 - t * 8 * c[2]) % 2400 + 2400) % 2400 - 300, cy = c[1] - (cam.y * 0.03), k = c[2];
        circle(ctx, cx, cy, 34 * k); circle(ctx, cx + 40 * k, cy - 14 * k, 42 * k); circle(ctx, cx + 84 * k, cy, 32 * k);
        ctx.fillRect(cx, cy, 84 * k, 30 * k);
      }
    }
    // parallax layers
    var yoff = -cam.y;
    drawLayer(ctx, layers.far, cam.x * 0.12, 250 + clampN(yoff * 0.08, -80, 120));
    drawLayer(ctx, layers.mid, cam.x * 0.3, 330 + clampN(yoff * 0.2, -150, 200));
  }
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  function drawLayer(ctx, c, off, y) {
    var x = -(off % LW);
    if (x > 0) x -= LW;
    for (; x < 1280; x += LW) ctx.drawImage(c, x, y, LW, LH);
    // fill below the layer so nothing shows through
    if (y + LH < 720) { ctx.fillStyle = c === layers.far ? T.far : T.mid2; ctx.fillRect(0, y + LH - 1, 1280, 720 - y - LH + 1); }
  }

  /* --------------------------------------------------------------- terrain */
  function chainRange(chain, x0, x1) {
    var lo = 0, hi = chain.length - 1;
    while (lo < hi) { var m = (lo + hi) >> 1; if (chain[m].x < x0) lo = m + 1; else hi = m; }
    var a = Math.max(0, lo - 1);
    lo = a; hi = chain.length - 1;
    while (lo < hi) { var m2 = (lo + hi + 1) >> 1; if (chain[m2].x > x1) hi = m2 - 1; else lo = m2; }
    return [a, Math.min(chain.length - 1, lo + 1)];
  }
  function drawTerrain(ctx, L, x0, x1, yb, t) {
    var ch = L.chain, r = chainRange(ch, x0, x1), i, p, q;
    // ground fill
    ctx.beginPath();
    ctx.moveTo(ch[r[0]].x, yb);
    for (i = r[0]; i <= r[1]; i++) ctx.lineTo(ch[i].x, ch[i].y);
    ctx.lineTo(ch[r[1]].x, yb);
    ctx.closePath();
    ctx.fillStyle = layers.pattern; ctx.fill();
    // darker band just under the surface
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = T.edge; ctx.globalAlpha = 0.35; ctx.lineWidth = 34;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // surface strips (skip steep walls)
    var run = false;
    ctx.beginPath();
    for (i = r[0] + 1; i <= r[1]; i++) {
      p = ch[i - 1]; q = ch[i];
      var steep = Math.abs(q.x - p.x) < Math.abs(q.y - p.y) * 0.5 || q.k === 's';
      if (steep) { run = false; continue; }
      if (!run) { ctx.moveTo(p.x, p.y); run = true; }
      ctx.lineTo(q.x, q.y);
    }
    if (themeId === 'factory') {
      ctx.strokeStyle = '#1d1e2b'; ctx.lineWidth = 16; ctx.stroke();
      ctx.strokeStyle = T.top; ctx.lineWidth = 10; ctx.setLineDash([18, 18]); ctx.lineDashOffset = 0; ctx.lineCap = 'butt'; ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.strokeStyle = T.top; ctx.lineWidth = themeId === 'winter' ? 18 : 14; ctx.stroke();
      ctx.save(); ctx.translate(0, -3);
      ctx.strokeStyle = T.top2; ctx.lineWidth = 5; ctx.stroke();
      ctx.restore();
    }
    // ice, boost and spikes
    for (i = r[0] + 1; i <= r[1]; i++) {
      p = ch[i - 1]; q = ch[i];
      if (q.k === 'i') {
        ctx.strokeStyle = '#a8f0ff'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x + 10, p.y - 3); ctx.lineTo(q.x - 30, q.y - 3); ctx.stroke();
      } else if (q.k === 's') drawSpikes(ctx, p, q);
    }
  }
  function drawSpikes(ctx, p, q) {
    var len = q.x - p.x, n = Math.max(1, Math.round(len / 26)), w = len / n, i;
    ctx.fillStyle = themeId === 'factory' ? '#ff4f6a' : '#dfe5ee';
    ctx.strokeStyle = '#3b3f55'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var x = p.x + i * w;
      ctx.moveTo(x, p.y); ctx.lineTo(x + w / 2, p.y - 34); ctx.lineTo(x + w, p.y);
    }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    for (i = 0; i < n; i++) { var x2 = p.x + i * w; ctx.moveTo(x2 + w / 2, p.y - 30); ctx.lineTo(x2 + w / 2 + 4, p.y - 8); ctx.lineTo(x2 + w / 2 - 2, p.y - 8); }
    ctx.fill();
  }

  function drawShapeBack(ctx, s, t, x0, x1) {
    if (s.type === 'pit') {
      if (s.x2 < x0 || s.x1 > x1) return;
      var top = Math.min(s.y1, s.y2) - 5;
      var gr = ctx.createLinearGradient(0, top, 0, s.bottom);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, T.pit);
      ctx.fillStyle = gr; ctx.fillRect(s.x1, top, s.x2 - s.x1, s.bottom - top);
    } else if (s.type === 'loop') {
      if (s.cx + s.R < x0 - 60 || s.cx - s.R > x1 + 60) return;
      // two support legs
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.moveTo(s.cx - s.R - 30, s.cy + s.R); ctx.lineTo(s.cx - 14, s.cy - s.R * 0.2); ctx.lineTo(s.cx + 14, s.cy - s.R * 0.2); ctx.lineTo(s.cx + s.R + 30, s.cy + s.R); ctx.lineTo(s.cx + s.R + 6, s.cy + s.R); ctx.lineTo(s.cx, s.cy + 10); ctx.lineTo(s.cx - s.R - 6, s.cy + s.R); ctx.closePath(); ctx.fill();
    }
  }
  function drawShapeFront(ctx, s, t, x0, x1, w) {
    var i;
    if (s.type === 'kicker' || s.type === 'lander') {
      if (s.x2 < x0 - 50 || s.x1 > x1 + 50) return;
      var pts = s.pts;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (s.type === 'kicker') ctx.lineTo(s.x2, s.y); else ctx.lineTo(s.x2, s.y);
      ctx.lineTo(s.x1, s.y); ctx.closePath();
      ctx.fillStyle = T.wood2; ctx.fill();
      // struts
      ctx.strokeStyle = T.wood; ctx.lineWidth = 6;
      ctx.beginPath();
      for (var sx = s.x1 + 40; sx < s.x2 - 10; sx += 46) { ctx.moveTo(sx, s.y); ctx.lineTo(sx, s.y - s.h); }
      ctx.moveTo(s.x1 + 10, s.y - 4); ctx.lineTo(s.x2 - 10, s.y - s.h * 0.6);
      ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.restore();
      // top deck
      ctx.beginPath();
      var st = s.type === 'lander' ? 1 : 0;
      ctx.moveTo(pts[st][0], pts[st][1]);
      for (i = st + 1; i < pts.length - (s.type === 'kicker' ? 1 : 0); i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = T.wood; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.stroke();
      // arrow stripe on kickers
      if (s.type === 'kicker') {
        ctx.fillStyle = T.track2;
        var mid = pts[Math.floor(pts.length * 0.7)];
        ctx.save(); ctx.translate(s.x2 - 26, s.y - s.h * 0.45);
        ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(6, 0); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else if (s.type === 'loop') {
      if (s.cx + s.R < x0 - 40 || s.cx - s.R > x1 + 40) return;
      ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(s.cx, s.cy, s.R + 12, 0, TAU); ctx.stroke();
      ctx.lineWidth = 20; ctx.strokeStyle = T.track;
      ctx.beginPath(); ctx.arc(s.cx, s.cy, s.R + 10, 0, TAU); ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = T.track2; ctx.setLineDash([22, 18]); ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.arc(s.cx, s.cy, s.R + 12, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (s.type === 'mushroom') {
      if (s.cx < x0 - 100 || s.cx > x1 + 100) return;
      s.t += 1 / 60;
      var k = s.t < 0.5 ? Math.sin(s.t * 26) * Math.exp(-s.t * 7) : 0;
      ctx.save(); ctx.translate(s.cx, s.y);
      ctx.scale(1 + k * 0.25, 1 - k * 0.35);
      ctx.fillStyle = '#fff0d6'; rrect(ctx, -18, -34, 36, 36, 10); ctx.fill();
      ctx.fillStyle = themeId === 'winter' ? '#3fb7ff' : themeId === 'factory' ? '#ff4fd8' : '#ff3b3b';
      ctx.beginPath(); ctx.ellipse(0, -8, 62, 50, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-60, -12, 120, 6);
      ctx.fillStyle = '#ffffff';
      circle(ctx, -30, -30, 9); circle(ctx, 8, -46, 11); circle(ctx, 36, -24, 8); circle(ctx, -6, -22, 6);
      ctx.restore();
    } else if (s.type === 'boost') {
      if (s.x2 < x0 || s.x1 > x1) return;
      ctx.fillStyle = '#2b2b33'; ctx.fillRect(s.x1, s.y - 6, s.x2 - s.x1, 12);
      ctx.fillStyle = '#ffb21f';
      var off = (t * 300) % 44;
      ctx.save(); ctx.beginPath(); ctx.rect(s.x1, s.y - 10, s.x2 - s.x1, 16); ctx.clip();
      for (var bx = s.x1 - 44 + off; bx < s.x2; bx += 44) {
        ctx.beginPath(); ctx.moveTo(bx, s.y - 6); ctx.lineTo(bx + 14, s.y - 6); ctx.lineTo(bx + 26, s.y); ctx.lineTo(bx + 14, s.y + 6); ctx.lineTo(bx, s.y + 6); ctx.lineTo(bx + 12, s.y); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 10); ctx.fillStyle = '#ffe14d'; ctx.fillRect(s.x1, s.y - 30, s.x2 - s.x1, 24); ctx.globalAlpha = 1;
    } else if (s.type === 'rockpile') {
      if (s.x < x0 - 200 || s.x > x1 + 200) return;
      ctx.fillStyle = themeId === 'winter' ? '#dfe9f5' : themeId === 'factory' ? '#5d6386' : '#8a6a58';
      circle(ctx, s.x + 40, s.y, 40); circle(ctx, s.x + 90, s.y - 10, 50); circle(ctx, s.x + 150, s.y, 36);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; circle(ctx, s.x + 80, s.y - 30, 16);
    } else if (s.type === 'rail') {
      if (s.x2 < x0 || s.x1 > x1) return;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y + 40); ctx.lineTo(s.x2, s.y + 40); ctx.stroke();
    }
  }

  function drawMover(ctx, m, t, L) {
    var hl = m.len / 2;
    if (m.type === 'seesaw') {
      // stand
      ctx.fillStyle = '#6d7389';
      ctx.beginPath(); ctx.moveTo(m.x - 30, m.y + 230); ctx.lineTo(m.x, m.y + 8); ctx.lineTo(m.x + 30, m.y + 230); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
      ctx.fillStyle = T.wood; rrect(ctx, -hl, 0, m.len, 16, 6); ctx.fill();
      ctx.fillStyle = T.wood2; for (var x = -hl + 30; x < hl; x += 50) ctx.fillRect(x, 2, 4, 12);
      ctx.fillStyle = T.track2; rrect(ctx, -hl, 0, 18, 16, 5); ctx.fill(); rrect(ctx, hl - 18, 0, 18, 16, 5); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3b3f55'; circle(ctx, m.x, m.y + 8, 9);
      ctx.fillStyle = '#ffd23f'; circle(ctx, m.x, m.y + 8, 4);
    } else if (m.type === 'plank') {
      if (m.gone) return;
      var shake = m.st === 1 ? Math.sin(t * 90) * 2 : 0;
      ctx.save(); ctx.translate(m.x + shake, m.y); ctx.rotate(m.a);
      ctx.fillStyle = m.st === 1 ? '#e07b3c' : T.wood; rrect(ctx, -hl + 2, 0, m.len - 4, 16, 4); ctx.fill();
      ctx.fillStyle = T.wood2; ctx.fillRect(-hl + 8, 3, 4, 4); ctx.fillRect(hl - 12, 3, 4, 4);
      ctx.restore();
      if (m.st === 0) {
        ctx.strokeStyle = '#6b4b2a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(m.x - hl, m.y + 10); ctx.lineTo(m.x + hl, m.y + 10); ctx.stroke();
      }
    } else if (m.type === 'platform') {
      var d = m.d;
      if (d.lift) {
        // piston rod down to the shaft floor
        ctx.fillStyle = '#8d95b3'; ctx.fillRect(m.x - 16, m.y + 18, 32, d.by + 60 - m.y - 18);
        ctx.fillStyle = '#5d6385'; ctx.fillRect(m.x - 16, m.y + 18, 8, d.by + 60 - m.y - 18);
      }
      ctx.fillStyle = '#3b3f55'; rrect(ctx, m.x - hl, m.y, m.len, 22, 6); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(m.x - hl + 4, m.y + 4, m.len - 8, 14); ctx.clip();
      ctx.fillStyle = '#ffcf2e'; ctx.fillRect(m.x - hl, m.y + 4, m.len, 14);
      ctx.fillStyle = '#23252f';
      for (var sx = m.x - hl - 20; sx < m.x + hl; sx += 28) { ctx.beginPath(); ctx.moveTo(sx, m.y + 18); ctx.lineTo(sx + 14, m.y + 4); ctx.lineTo(sx + 26, m.y + 4); ctx.lineTo(sx + 12, m.y + 18); ctx.fill(); }
      ctx.restore();
      // status light
      ctx.fillStyle = m.st === 0 ? '#3ddc84' : m.st === 2 ? '#3ddc84' : (Math.sin(t * 20) > 0 ? '#ff5a5f' : '#7a2a2c');
      circle(ctx, m.x, m.y + 11, 5);
    }
  }

  function drawCrate(ctx, c) {
    if (c.st === 2) return;
    var h = c.s / 2;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.fillStyle = themeId === 'factory' ? '#6f7aa3' : '#d69a52'; ctx.fillRect(-h, -h, c.s, c.s);
    ctx.strokeStyle = themeId === 'factory' ? '#3b4266' : '#8a5a26'; ctx.lineWidth = 5;
    ctx.strokeRect(-h + 2.5, -h + 2.5, c.s - 5, c.s - 5);
    ctx.beginPath(); ctx.moveTo(-h + 4, -h + 4); ctx.lineTo(h - 4, h - 4); ctx.moveTo(h - 4, -h + 4); ctx.lineTo(-h + 4, h - 4); ctx.stroke();
    ctx.restore();
  }
  function drawRoller(ctx, r) {
    if (r.dead) return;
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot);
    if (r.kind === 'log') {
      ctx.fillStyle = '#8a5a2b'; circle(ctx, 0, 0, r.r);
      ctx.fillStyle = '#d9a86a'; circle(ctx, 0, 0, r.r - 4);
      ctx.strokeStyle = '#a8753f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r.r * 0.5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-1.5, -r.r + 4, 3, r.r - 4);
    } else if (themeId === 'winter') {
      ctx.fillStyle = '#ffffff'; circle(ctx, 0, 0, r.r);
      ctx.fillStyle = '#dbeeff'; circle(ctx, -r.r * 0.3, r.r * 0.2, r.r * 0.55);
      ctx.fillStyle = '#c3dcf5'; circle(ctx, r.r * 0.4, -r.r * 0.3, r.r * 0.25); circle(ctx, -r.r * 0.2, -r.r * 0.55, r.r * 0.18);
    } else if (themeId === 'factory') {
      ctx.fillStyle = '#7b86ad'; circle(ctx, 0, 0, r.r);
      ctx.strokeStyle = '#3b4266'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, r.r - 10, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffcf2e';
      for (var i = 0; i < 6; i++) { var a = i * TAU / 6; circle(ctx, Math.cos(a) * r.r * 0.62, Math.sin(a) * r.r * 0.62, 5); }
      ctx.fillStyle = '#ff5a5f'; circle(ctx, 0, 0, 12);
    } else {
      ctx.fillStyle = '#8e8f9c'; circle(ctx, 0, 0, r.r);
      ctx.fillStyle = '#a9aab6'; circle(ctx, -r.r * 0.25, -r.r * 0.25, r.r * 0.6);
      ctx.strokeStyle = '#5d5e6b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r.r * 0.5, 0); ctx.lineTo(-r.r * 0.1, r.r * 0.2); ctx.lineTo(r.r * 0.3, 0.1); ctx.lineTo(r.r * 0.6, r.r * 0.4); ctx.stroke();
      ctx.fillStyle = '#5d5e6b'; circle(ctx, r.r * 0.35, -r.r * 0.4, 7); circle(ctx, -r.r * 0.4, r.r * 0.45, 5);
    }
    ctx.restore();
  }

  function drawFlag(ctx, x, y, on, t) {
    ctx.fillStyle = '#e8e8f0'; ctx.fillRect(x - 3, y - 150, 6, 150);
    ctx.fillStyle = '#ffd23f'; circle(ctx, x, y - 152, 7);
    var col = on ? '#3ddc84' : '#ff5a5f';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + 3, y - 146);
    for (var i = 0; i <= 8; i++) { var fx = x + 3 + i * 9; ctx.lineTo(fx, y - 146 + Math.sin(t * 7 - i * 0.7) * (3 + i * 0.6)); }
    for (i = 8; i >= 0; i--) { var fx2 = x + 3 + i * 9; ctx.lineTo(fx2, y - 104 + Math.sin(t * 7 - i * 0.7) * (3 + i * 0.6)); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(on ? '✓' : '!', x + 38, y - 117);
  }
  function drawFinish(ctx, x, y, t) {
    var h = 260, w = 200, x0 = x - w / 2;
    ctx.fillStyle = '#3b3f55'; ctx.fillRect(x0 - 10, y - h, 20, h); ctx.fillRect(x0 + w - 10, y - h, 20, h);
    // checkered banner
    var bw = w + 20, rows = 2, cols = 12, cs = bw / cols;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#1d1d24' : '#ffffff';
      ctx.fillRect(x0 - 10 + c * cs, y - h - 20 + r * cs + Math.sin(t * 3 + c * 0.5) * 3, cs + 0.5, cs + 0.5);
    }
    ctx.fillStyle = '#ff3b3b'; rrect(ctx, x0 + 10, y - h + 26, w - 20, 44, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('FINISH', x, y - h + 59);
    // balloons
    var cols2 = ['#ffd23f', '#3fb7ff', '#ff5ab4', '#3ddc84'];
    for (var i = 0; i < 4; i++) {
      var bx = x0 - 30 + (i % 2) * 18 + (i > 1 ? w + 42 : 0), by = y - h - 40 + Math.sin(t * 2 + i) * 6 - (i % 2) * 20;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by + 18); ctx.lineTo(i > 1 ? x0 + w : x0, y - h); ctx.stroke();
      ctx.fillStyle = cols2[i]; ctx.beginPath(); ctx.ellipse(bx, by, 14, 18, 0, 0, TAU); ctx.fill();
    }
  }
  function drawSign(ctx, s) {
    ctx.font = 'bold 22px Fredoka, sans-serif';
    var w = Math.max(160, ctx.measureText(s.text).width + 36), x = s.x + 60, y = s.y;
    ctx.fillStyle = '#6b4b2a'; ctx.fillRect(x - 5, y - 80, 10, 80);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rrect(ctx, x - w / 2 + 4, y - 132, w, 54, 12); ctx.fill();
    ctx.fillStyle = '#fff4d6'; rrect(ctx, x - w / 2, y - 136, w, 54, 12); ctx.fill();
    ctx.strokeStyle = '#ff7a2f'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#2b1d10'; ctx.textAlign = 'center'; ctx.fillText(s.text, x, y - 101);
  }

  /* ------------------------------------------------------------- the bike */
  // pose: { x, y, a, wheels:[{x,y,rot,comp}], lean, crouch, noRider, rider:{x,y,a,t} }
  function drawWheel(ctx, x, y, rot, skin) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#1f2029'; circle(ctx, 0, 0, 21);
    ctx.fillStyle = '#34353f';
    for (var i = 0; i < 12; i++) { var a = i * TAU / 12; ctx.fillRect(Math.cos(a) * 19 - 3, Math.sin(a) * 19 - 3, 6, 6); }
    ctx.fillStyle = skin.rim; circle(ctx, 0, 0, 13);
    ctx.fillStyle = '#1f2029'; circle(ctx, 0, 0, 10);
    ctx.strokeStyle = '#c9cfdf'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < 5; i++) { var b = i * TAU / 5; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b) * 11, Math.sin(b) * 11); }
    ctx.stroke();
    ctx.fillStyle = skin.rim; circle(ctx, 0, 0, 4);
    ctx.restore();
  }
  function toLocal(px, py, x, y, ca, sa) { var dx = px - x, dy = py - y; return [dx * ca + dy * sa, -dx * sa + dy * ca]; }

  MMR.drawBike = function (ctx, P, skin, t) {
    var ca = Math.cos(P.a), sa = Math.sin(P.a);
    var rw = P.wheels[0], fw = P.wheels[1];
    drawWheel(ctx, rw.x, rw.y, rw.rot, skin);
    drawWheel(ctx, fw.x, fw.y, fw.rot, skin);
    var rl = toLocal(rw.x, rw.y, P.x, P.y, ca, sa), fl = toLocal(fw.x, fw.y, P.x, P.y, ca, sa);
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.a);
    if (skin.rainbow) skin.body = 'hsl(' + ((t * 120) % 360) + ',95%,55%)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // swing arm
    ctx.strokeStyle = '#2b2d3a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(rl[0], rl[1]); ctx.stroke();
    // fork
    ctx.strokeStyle = '#c9cfdf'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(fl[0], fl[1]); ctx.stroke();
    ctx.strokeStyle = skin.dark; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(30 + (fl[0] - 30) * 0.45, -26 + (fl[1] + 26) * 0.45); ctx.stroke();
    // exhaust
    ctx.strokeStyle = '#aeb6c8'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(4, 16); ctx.quadraticCurveTo(-26, 16, -52, -2); ctx.stroke();
    ctx.fillStyle = '#2b2d3a'; circle(ctx, -54, -3, 4);
    // engine
    ctx.fillStyle = '#3b3f4f'; rrect(ctx, -16, -4, 34, 26, 7); ctx.fill();
    ctx.fillStyle = '#6a7086'; ctx.fillRect(-10, 2, 22, 3); ctx.fillRect(-10, 9, 22, 3);
    // frame
    ctx.strokeStyle = skin.dark; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(30, -24); ctx.lineTo(2, 4); ctx.lineTo(-24, -10); ctx.stroke();
    // rear fender / tail
    ctx.fillStyle = skin.body;
    ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(-70, -24); ctx.lineTo(-66, -14); ctx.lineTo(-30, -2); ctx.lineTo(-8, -4); ctx.closePath(); ctx.fill();
    // side number plate
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-30, -8, 11, 7, -0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = skin.dark; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(skin.num || '7', -30, -4.5);
    var rider = !P.noRider;
    var L = P.lean || 0, c = P.crouch || 0;
    var hip = [-14 + L * 5, -24 + c * 5];
    var foot = [2, 12], knee = [14 + L * 3, -6 + c * 4];
    var sh = [hip[0] + 6 + L * 17, hip[1] - 26 + Math.abs(L) * 5 + c * 4];
    var hand = [25, -38];
    var head = [sh[0] + 6 + L * 5, sh[1] - 16];
    if (rider) {
      // back leg
      ctx.strokeStyle = skin.suitDark; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(hip[0] - 2, hip[1]); ctx.lineTo(knee[0] - 4, knee[1] + 1); ctx.lineTo(foot[0] - 4, foot[1]); ctx.stroke();
    }
    // seat
    ctx.strokeStyle = '#1f2029'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-40, -20); ctx.lineTo(-2, -17); ctx.stroke();
    // tank
    ctx.fillStyle = skin.body;
    ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(18, -28); ctx.lineTo(32, -22); ctx.lineTo(28, -8); ctx.lineTo(0, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.accent; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(20, -23); ctx.lineTo(24, -19); ctx.lineTo(4, -12); ctx.closePath(); ctx.fill();
    // front fender + number plate
    ctx.fillStyle = skin.body;
    ctx.beginPath(); ctx.moveTo(30, -6); ctx.quadraticCurveTo(50, -14, 70, -4); ctx.lineTo(66, 0); ctx.quadraticCurveTo(50, -8, 34, -1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.accent; rrect(ctx, 30, -36, 12, 18, 4); ctx.fill();
    // handlebar
    ctx.strokeStyle = '#2b2d3a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(30, -28); ctx.lineTo(26, -40); ctx.stroke();
    if (rider) {
      ctx.strokeStyle = '#1f2029'; ctx.lineWidth = 6;
      // boot
      ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(foot[0] + 10, foot[1] + 1); ctx.stroke();
      // front leg
      ctx.strokeStyle = skin.suit; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(foot[0], foot[1] - 2); ctx.stroke();
      // torso
      ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(sh[0], sh[1]); ctx.stroke();
      ctx.strokeStyle = skin.suitAccent; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(hip[0] + 1, hip[1] - 4); ctx.lineTo(sh[0] + 1, sh[1] + 3); ctx.stroke();
      // arm
      var elbow = [(sh[0] + hand[0]) / 2 + 2, (sh[1] + hand[1]) / 2 + 9 - L * 3];
      ctx.strokeStyle = skin.suit; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(elbow[0], elbow[1]); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
      ctx.fillStyle = '#1f2029'; circle(ctx, hand[0], hand[1], 5);
      drawHelmet(ctx, head[0], head[1], 0, skin);
    }
    ctx.restore();
    if (P.rider) drawRagdoll(ctx, P.rider, skin, t);
  };
  function drawHelmet(ctx, x, y, a, skin) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = skin.helmet; circle(ctx, 0, 0, 14);
    ctx.fillStyle = skin.helmet2; ctx.beginPath(); ctx.moveTo(-14, -2); ctx.quadraticCurveTo(0, -18, 14, -4); ctx.lineTo(10, -8); ctx.quadraticCurveTo(0, -14, -12, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1f2a44'; rrect(ctx, 2, -5, 13, 10, 4); ctx.fill();
    ctx.fillStyle = 'rgba(160,230,255,0.9)'; rrect(ctx, 5, -3, 8, 4, 2); ctx.fill();
    ctx.fillStyle = skin.helmet2; ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(22, -10); ctx.lineTo(12, -6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawRagdoll(ctx, r, skin, t) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a);
    ctx.lineCap = 'round';
    var f = Math.sin(r.t * 22) * 0.6;
    ctx.strokeStyle = skin.suit; ctx.lineWidth = 12;
    // legs
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(-12 + f * 8, 30); ctx.lineTo(-6 + f * 12, 44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(12 - f * 8, 30); ctx.lineTo(16 - f * 10, 42); ctx.stroke();
    // body
    ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(0, -10); ctx.stroke();
    // arms flailing
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-16, -18 + f * 16); ctx.lineTo(-24, -30 + f * 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(16, -18 - f * 16); ctx.lineTo(26, -28 - f * 18); ctx.stroke();
    ctx.restore();
    var hx = r.x + Math.sin(r.a) * 24, hy = r.y - Math.cos(r.a) * 24;
    drawHelmet(ctx, hx, hy, r.a, skin);
    // dizzy stars once landed
    if (r.t > 0.35) {
      for (var i = 0; i < 3; i++) {
        var a = t * 5 + i * TAU / 3;
        star(ctx, hx + Math.cos(a) * 24, hy - 22 + Math.sin(a) * 8, 7, '#ffd23f');
      }
    }
  }
  function star(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  MMR.star = star;

  /* ----------------------------------------------------------- whole world */
  MMR.drawWorld = function (ctx, w, cam, t, skin, extra) {
    var L = w.level, i;
    drawBackground(ctx, cam, t);
    var hw = 640 / cam.zoom, hh = 360 / cam.zoom;
    var x0 = cam.x - hw - 60, x1 = cam.x + hw + 60, yb = cam.y + hh + 80;
    ctx.save();
    ctx.translate(640, 360); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
    // decor behind the ground
    var D = L.decor, sps = layers.sprites;
    for (i = 0; i < D.length; i++) {
      var d = D[i];
      if (d.x < x0 - 150 || d.x > x1 + 150) continue;
      var s = sps[Math.floor(d.v * sps.length) % sps.length], sc = d.s;
      ctx.drawImage(s.c, d.x - s.w * sc / 2, d.y - s.h * sc, s.w * sc, s.h * sc);
    }
    for (i = 0; i < L.shapes.length; i++) drawShapeBack(ctx, L.shapes[i], t, x0, x1);
    // flags / signs behind the bike
    for (i = 0; i < L.checkpoints.length; i++) { var c = L.checkpoints[i]; if (c.x > x0 - 100 && c.x < x1 + 100) drawFlag(ctx, c.x, c.y, i <= w.cp, t); }
    for (i = 0; i < L.signs.length; i++) { var sg = L.signs[i]; if (sg.x > x0 - 300 && sg.x < x1 + 100) drawSign(ctx, sg); }
    if (L.finishX > x0 - 200 && L.finishX < x1 + 200) drawFinish(ctx, L.finishX, MM.chainY(L.chain, L.finishX), t);
    for (i = 0; i < w.movers.length; i++) { var m = w.movers[i]; if (m.x > x0 - 400 && m.x < x1 + 400) drawMover(ctx, m, t, L); }
    drawTerrain(ctx, L, x0, x1, yb, t);
    for (i = 0; i < L.shapes.length; i++) drawShapeFront(ctx, L.shapes[i], t, x0, x1, w);
    for (i = 0; i < w.crates.length; i++) { var cr = w.crates[i]; if (cr.x > x0 - 60 && cr.x < x1 + 60) drawCrate(ctx, cr); }
    for (i = 0; i < w.rollers.length; i++) drawRoller(ctx, w.rollers[i]);
    if (extra && extra.beforeBike) extra.beforeBike(ctx);
    var b = w.bike;
    MMR.drawBike(ctx, {
      x: b.x, y: b.y, a: b.a, wheels: b.wheels, lean: extra ? extra.lean : 0, crouch: extra ? extra.crouch : 0,
      noRider: w.crashed, rider: w.rider
    }, skin, t);
    if (extra && extra.afterBike) extra.afterBike(ctx);
    ctx.restore();
    // weather
    if (themeId === 'winter') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (i = 0; i < layers.flakes.length; i++) {
        var f = layers.flakes[i];
        var fx = ((f[0] - cam.x * 0.4 * f[2] + Math.sin(t + f[3]) * 20) % 1280 + 1280) % 1280;
        var fy = ((f[1] + t * 60 * f[2] - cam.y * 0.4 * f[2]) % 720 + 720) % 720;
        ctx.fillRect(fx, fy, 3 * f[2], 3 * f[2]);
      }
    }
  };
})();
