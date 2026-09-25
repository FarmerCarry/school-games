/* Hoop Heads - drawing: courts, crowd, hoops, players, ball skins, HUD, popups. */
(function () {
  'use strict';
  var HH = window.HH, A = HH.art, INK = HH.INK;
  var W = HH.W, H = HH.H, FLOOR = HH.FLOOR, BR = HH.BALL_R, RIM_Y = HH.RIM_Y;
  var TAU = Math.PI * 2;
  var TEAM = [
    { main: '#2f7bff', dark: '#1a4fc0', light: '#8fc0ff', name: 'أزرق' },
    { main: '#ff4d4d', dark: '#c0262b', light: '#ffb0a8', name: 'أحمر' }
  ];
  HH.TEAM = TEAM;
  var AR = /[؀-ۿ]/;

  /* --------------------------------------------------------------- text */
  function text(c, s, x, y, size, color, align, o) {
    o = o || {};
    c.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    c.direction = AR.test(s) ? 'rtl' : 'ltr';
    c.textAlign = align || 'center';
    c.textBaseline = o.base || 'middle';
    if (o.stroke) {
      c.lineJoin = 'round'; c.lineWidth = o.sw || size * 0.18; c.strokeStyle = o.stroke;
      c.strokeText(s, x, y);
    }
    if (o.shadow) { c.fillStyle = o.shadow; c.fillText(s, x, y + (o.sd || size * 0.08)); }
    c.fillStyle = color; c.fillText(s, x, y);
    c.direction = 'ltr';
  }
  HH.text = text;
  function fitSize(c, s, size, maxW, weight) {
    c.font = (weight || 700) + ' ' + size + 'px Fredoka';
    c.direction = AR.test(s) ? 'rtl' : 'ltr';
    var w = c.measureText(s).width;
    c.direction = 'ltr';
    return w > maxW ? Math.max(10, Math.floor(size * maxW / w)) : size;
  }
  HH.fitSize = fitSize;

  /* ---------------------------------------------------------- ball skins */
  function seams(c, r, col, lw) {
    c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
    c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
    c.beginPath(); c.arc(-r * 1.25, 0, r * 0.95, -0.85, 0.85); c.stroke();
    c.beginPath(); c.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.85, Math.PI + 0.85); c.stroke();
  }
  function drawBall(c, x, y, r, rot, skin) {
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    var g;
    A.circ(c, 0, 0, r);
    switch (skin) {
      case 'neon':
        c.fillStyle = '#16123a'; c.fill();
        c.save(); A.circ(c, 0, 0, r); c.clip();
        seams(c, r, 'rgba(0,240,255,0.35)', r * 0.34); seams(c, r, '#6ff7ff', r * 0.12);
        c.restore();
        A.circ(c, 0, 0, r); c.lineWidth = r * 0.14; c.strokeStyle = '#ff4df0'; c.stroke();
        break;
      case 'beach':
        var cols = ['#ff4d4d', '#fff', '#2f9bff', '#fff', '#ffd23f', '#fff'];
        for (var i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, i * TAU / 6, (i + 1) * TAU / 6); c.closePath(); c.fillStyle = cols[i]; c.fill(); }
        A.circ(c, 0, 0, r * 0.26); c.fillStyle = '#fff'; c.fill();
        break;
      case 'smile':
        g = c.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r); g.addColorStop(0, '#fff27a'); g.addColorStop(1, '#ffb31a');
        c.fillStyle = g; c.fill();
        c.fillStyle = INK;
        A.ell(c, -r * 0.32, -r * 0.2, r * 0.11, r * 0.18); c.fill(); A.ell(c, r * 0.32, -r * 0.2, r * 0.11, r * 0.18); c.fill();
        c.beginPath(); c.arc(0, r * 0.05, r * 0.5, 0.35, Math.PI - 0.35); c.lineWidth = r * 0.12; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke();
        break;
      case 'melon':
        c.fillStyle = '#5fd35a'; c.fill();
        c.save(); A.circ(c, 0, 0, r); c.clip();
        c.strokeStyle = '#1f7a2a'; c.lineWidth = r * 0.22;
        for (var k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(k * r * 0.45, -r); c.quadraticCurveTo(k * r * 0.6, 0, k * r * 0.45, r); c.stroke(); }
        c.restore();
        break;
      case 'rainbow':
        var rc = ['#ff4d4d', '#ff9f1c', '#ffd23f', '#3ddc84', '#2f9bff', '#9b5cff'];
        c.save(); A.circ(c, 0, 0, r); c.clip();
        for (var j = 0; j < 6; j++) { c.fillStyle = rc[j]; c.fillRect(-r, -r + j * r / 3, r * 2, r / 3 + 1); }
        c.restore();
        break;
      case 'galaxy':
        g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); g.addColorStop(0, '#c07aff'); g.addColorStop(0.6, '#4a1f9e'); g.addColorStop(1, '#1a0b45');
        c.fillStyle = g; c.fill();
        c.fillStyle = '#fff';
        [[0.3, -0.4, 0.09], [-0.45, 0.2, 0.07], [0.1, 0.45, 0.06], [-0.2, -0.5, 0.05], [0.55, 0.2, 0.05]].forEach(function (s) { A.star(c, s[0] * r, s[1] * r, s[2] * r * 2.2); c.fill(); });
        break;
      case 'gold':
        g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffc93a'); g.addColorStop(1, '#b07a00');
        c.fillStyle = g; c.fill();
        c.save(); A.circ(c, 0, 0, r); c.clip(); seams(c, r, '#8a5a00', r * 0.1); c.restore();
        break;
      default:
        g = c.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r); g.addColorStop(0, '#ffab5e'); g.addColorStop(1, '#e8611a');
        c.fillStyle = g; c.fill();
        c.save(); A.circ(c, 0, 0, r); c.clip(); seams(c, r, '#3a1a0a', r * 0.1); c.restore();
    }
    A.circ(c, 0, 0, r); c.lineWidth = r * 0.11; c.strokeStyle = INK; c.stroke();
    c.restore();
    // fixed highlight (does not rotate)
    c.globalAlpha = 0.35; c.fillStyle = '#fff';
    A.ell(c, x - r * 0.35, y - r * 0.45, r * 0.3, r * 0.17, -0.5); c.fill();
    c.globalAlpha = 1;
  }
  HH.drawBall = drawBall;

  /* ------------------------------------------------------------- heads */
  function drawHead(c, ch, x, y, r, facing, o, sx, sy) {
    c.save(); c.translate(x, y); c.scale((facing < 0 ? -1 : 1) * (sx || 1), sy || 1);
    c.lineJoin = 'round'; c.lineCap = 'round';
    ch.draw(c, r, o);
    c.restore();
  }
  HH.drawHead = drawHead;

  /* --------------------------------------------------------------- courts */
  var bgCanvas = null, bgKey = '';
  var rng = (function () { var s = 7; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

  function skyGrad(c, stops) {
    var g = c.createLinearGradient(0, 0, 0, FLOOR);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    c.fillStyle = g; c.fillRect(0, 0, W, FLOOR);
  }
  function buildings(c, base, col, win, seed, hmin, hmax) {
    var x = -20;
    var r = seed;
    function rnd() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
    while (x < W + 20) {
      var w = 60 + rnd() * 90, h = hmin + rnd() * (hmax - hmin);
      c.fillStyle = col; c.fillRect(x, base - h, w, h + 2);
      if (rnd() < 0.3) { c.fillRect(x + w * 0.3, base - h - 20, w * 0.15, 20); }
      if (win) {
        c.fillStyle = win;
        for (var wy = base - h + 12; wy < base - 16; wy += 24) for (var wx = x + 10; wx < x + w - 14; wx += 20) if (rnd() < 0.55) c.fillRect(wx, wy, 9, 12);
      }
      x += w + 4;
    }
  }
  function bleachers(c, top, bot, col1, col2) {
    var rows = 3, rh = (bot - top) / rows;
    for (var i = 0; i < rows; i++) {
      c.fillStyle = i % 2 ? col1 : col2;
      c.fillRect(0, top + i * rh, W, rh);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, top + i * rh + rh - 6, W, 6);
    }
  }
  function floorBand(c, cols, lineCol, paint) {
    var g = c.createLinearGradient(0, FLOOR, 0, H);
    g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
    c.fillStyle = g; c.fillRect(0, FLOOR, W, H - FLOOR);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, FLOOR, W, 4);
    if (paint) paint(c);
    // lines: center + three point marks + paint boxes
    c.strokeStyle = lineCol; c.lineWidth = 4;
    c.beginPath(); c.moveTo(640, FLOOR + 2); c.lineTo(640, H); c.stroke();
    c.beginPath(); c.ellipse(640, FLOOR + 44, 90, 26, 0, 0, TAU); c.stroke();
    [HH.THREE, -HH.THREE].forEach(function (d, i) {
      var hx = i === 0 ? 132 : 1148, lx = hx + d;
      c.beginPath(); c.moveTo(lx - 8 * (i ? -1 : 1), FLOOR + 2); c.quadraticCurveTo(lx + 6 * (i ? -1 : 1), FLOOR + 44, lx - 14 * (i ? -1 : 1), H); c.stroke();
      text(c, '3', lx + (i ? 30 : -30), FLOOR + 48, 30, 'rgba(255,255,255,0.55)', 'center');
    });
    // key (paint) boxes
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fillRect(0, FLOOR + 4, 250, H - FLOOR); c.fillRect(W - 250, FLOOR + 4, 250, H - FLOOR);
    c.beginPath(); c.moveTo(250, FLOOR + 2); c.lineTo(250, H); c.moveTo(W - 250, FLOOR + 2); c.lineTo(W - 250, H); c.stroke();
  }

  var COURT_DRAW = {
    street: function (c) {
      skyGrad(c, [[0, '#5b4bd1'], [0.45, '#ff7aa8'], [0.8, '#ffc36b']]);
      A.circ(c, 980, 250, 70); c.fillStyle = '#fff2a8'; c.fill();
      A.circ(c, 980, 250, 92); c.fillStyle = 'rgba(255,242,168,0.25)'; c.fill();
      buildings(c, 420, '#7b4fa8', 'rgba(255,230,140,0.55)', 11, 110, 250);
      buildings(c, 440, '#53307a', 'rgba(255,210,120,0.6)', 29, 60, 170);
      bleachers(c, 430, 580, '#3a2a6a', '#47347e');
      // chain fence
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2;
      for (var x = -80; x < W + 80; x += 22) { c.beginPath(); c.moveTo(x, 575); c.lineTo(x + 57, 632); c.moveTo(x + 57, 575); c.lineTo(x, 632); c.stroke(); }
      c.fillStyle = '#2b1f4f'; c.fillRect(0, 571, W, 6);
      for (var p = 0; p < W; p += 160) c.fillRect(p, 571, 6, 61);
      floorBand(c, ['#e86b3a', '#b8452a'], 'rgba(255,255,255,0.75)');
      // graffiti blobs on the wall behind
      c.globalAlpha = 0.9;
      [['#3ddc84', 300], ['#5fd0ff', 900]].forEach(function (g) {
        c.fillStyle = g[0]; A.star(c, g[1], 600, 14); c.fill();
      });
      c.globalAlpha = 1;
    },
    beach: function (c) {
      skyGrad(c, [[0, '#3fb7ff'], [0.6, '#a8e6ff'], [1, '#fff4c9']]);
      A.circ(c, 220, 130, 60); c.fillStyle = '#fff27a'; c.fill();
      [[380, 110], [760, 80], [1080, 140]].forEach(function (cl) {
        c.fillStyle = 'rgba(255,255,255,0.9)';
        A.circ(c, cl[0], cl[1], 30); c.fill(); A.circ(c, cl[0] + 34, cl[1] - 10, 38); c.fill(); A.circ(c, cl[0] + 72, cl[1], 28); c.fill();
      });
      c.fillStyle = '#1d8fd8'; c.fillRect(0, 390, W, 60);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (var i = 0; i < 16; i++) c.fillRect(i * 90 + (i % 3) * 20, 400 + (i % 4) * 12, 40, 4);
      c.fillStyle = '#ffe3a1'; c.fillRect(0, 450, W, 190);
      // palms
      [60, 1215].forEach(function (px) {
        c.strokeStyle = '#8a5a2b'; c.lineWidth = 16; c.beginPath(); c.moveTo(px, 600); c.quadraticCurveTo(px + 30, 400, px + 5, 300); c.stroke();
        c.fillStyle = '#2fae4a';
        for (var k = 0; k < 6; k++) { c.save(); c.translate(px + 5, 300); c.rotate(k * 1.05); A.ell(c, 55, 0, 60, 14, 0.2); c.fill(); c.restore(); }
      });
      bleachers(c, 470, 590, '#ff8fb1', '#ffb56b');
      c.fillStyle = '#e8c27a'; c.fillRect(0, 588, W, 44);
      floorBand(c, ['#2fb0c8', '#1a7f96'], 'rgba(255,255,255,0.8)');
    },
    roof: function (c) {
      skyGrad(c, [[0, '#070a24'], [0.6, '#1c1f5a'], [1, '#3b2a7a']]);
      for (var i = 0; i < 90; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.3 + rng() * 0.7) + ')'; c.fillRect(rng() * W, rng() * 360, 2, 2); }
      A.circ(c, 1030, 110, 46); c.fillStyle = '#fff6d6'; c.fill();
      A.circ(c, 1050, 98, 42); c.fillStyle = '#1a1d52'; c.fill();
      buildings(c, 470, '#141640', 'rgba(255,220,120,0.7)', 5, 120, 300);
      buildings(c, 480, '#0e1030', 'rgba(120,220,255,0.6)', 77, 60, 180);
      // neon signs
      c.lineWidth = 6; c.strokeStyle = '#ff4df0'; c.beginPath(); c.arc(300, 250, 34, 0, TAU); c.stroke();
      c.strokeStyle = '#3df0ff'; c.strokeRect(820, 210, 90, 44);
      bleachers(c, 470, 590, '#23265e', '#2c2f70');
      c.fillStyle = '#16183f'; c.fillRect(0, 585, W, 47);
      c.fillStyle = '#ff4df0'; c.fillRect(0, 585, W, 4);
      floorBand(c, ['#2a2e6e', '#171a45'], 'rgba(61,240,255,0.85)');
    },
    space: function (c) {
      skyGrad(c, [[0, '#050314'], [0.7, '#1a0f3d'], [1, '#2e1760']]);
      for (var i = 0; i < 140; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.3 + rng() * 0.7) + ')'; var s = rng() < 0.1 ? 3 : 2; c.fillRect(rng() * W, rng() * 460, s, s); }
      var g = c.createRadialGradient(220, 180, 20, 260, 220, 150); g.addColorStop(0, '#ffb86b'); g.addColorStop(1, '#c2410c');
      A.circ(c, 260, 220, 120); c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(255,220,160,0.7)'; c.lineWidth = 8; A.ell(c, 260, 220, 190, 34, -0.3); c.stroke();
      A.circ(c, 1010, 140, 40); c.fillStyle = '#7ad7ff'; c.fill();
      A.circ(c, 995, 128, 12); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fill();
      // station windows
      c.fillStyle = '#3a3f6e'; c.fillRect(0, 440, W, 150);
      c.fillStyle = '#23274a';
      for (var x = 20; x < W; x += 140) { c.fillRect(x, 452, 110, 16); }
      bleachers(c, 470, 590, '#2d3160', '#363b72');
      c.fillStyle = '#4b5190'; c.fillRect(0, 585, W, 47);
      c.fillStyle = '#7dff9a'; for (var l = 20; l < W; l += 80) c.fillRect(l, 604, 30, 6);
      floorBand(c, ['#5a6199', '#363b72'], 'rgba(125,255,154,0.85)');
    }
  };

  function ensureBg(courtId, view) {
    var k = Math.min(2, Math.max(1, view.scale * view.dpr));
    var key = courtId + '@' + k.toFixed(2);
    if (bgKey === key && bgCanvas) return bgCanvas;
    bgCanvas = bgCanvas || document.createElement('canvas');
    bgCanvas.width = Math.round(W * k); bgCanvas.height = Math.round(H * k);
    var c = bgCanvas.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    (COURT_DRAW[courtId] || COURT_DRAW.street)(c);
    bgKey = key;
    return bgCanvas;
  }
  HH.drawCourtPreview = function (c, courtId, w, h) {
    c.save(); c.scale(w / W, h / H); (COURT_DRAW[courtId] || COURT_DRAW.street)(c); c.restore();
  };

  /* -------------------------------------------------------------- crowd */
  var crowd = [];
  (function () {
    var cols = ['#ff4d6d', '#ffd23f', '#3ddc84', '#5fd0ff', '#b18cff', '#ff9f1c', '#ffffff', '#ff7ab8'];
    var skins = ['#f4c7a1', '#d99a6c', '#a86b3c', '#6e4424', '#ffe0c2'];
    for (var row = 0; row < 3; row++) {
      for (var i = 0; i < 24; i++) {
        if (rng() < 0.12) continue;
        crowd.push({ x: i * 54 + (row % 2) * 27 + rng() * 10, row: row, c: cols[Math.floor(rng() * cols.length)], s: skins[Math.floor(rng() * skins.length)], ph: rng() * 6, r: 13 + rng() * 4, team: rng() < 0.5 ? 0 : 1 });
      }
    }
  })();
  function drawCrowd(c, m, t, court) {
    var top = court === 'street' ? 430 : 470, bot = court === 'street' ? 580 : 590, rh = (bot - top) / 3;
    var excite = Math.min(1, m ? m.crowd : 0.2);
    for (var i = 0; i < crowd.length; i++) {
      var p = crowd[i];
      var baseY = top + p.row * rh + rh - 8;
      var jump = Math.max(0, Math.sin(t * (6 + excite * 6) + p.ph)) * (3 + excite * 16);
      var y = baseY - jump;
      c.fillStyle = p.c;
      c.beginPath(); c.ellipse(p.x, y - 6, p.r * 0.95, p.r * 1.1, 0, Math.PI, 0); c.fill();
      A.circ(c, p.x, y - p.r * 1.6, p.r * 0.8); c.fillStyle = p.s; c.fill();
      if (excite > 0.3) {
        c.strokeStyle = p.s; c.lineWidth = 4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x - p.r * 0.7, y - 10); c.lineTo(p.x - p.r * 1.1, y - p.r * 2.4 - jump * 0.3);
        c.moveTo(p.x + p.r * 0.7, y - 10); c.lineTo(p.x + p.r * 1.1, y - p.r * 2.4 - jump * 0.3); c.stroke();
      }
    }
  }

  /* -------------------------------------------------------------- hoops */
  function drawHoopBack(c, h, m) {
    var s = h.s;
    var poleX = h.side ? W - 18 : 18;
    // pole + arm
    c.fillStyle = '#39405e'; c.fillRect(poleX - 9, 250, 18, FLOOR - 250);
    c.fillStyle = '#ff4d6d'; c.fillRect(poleX - 13, 470, 26, 110);
    c.fillStyle = '#39405e';
    c.fillRect(Math.min(poleX, h.bx1), 262, Math.abs(poleX - (h.side ? h.bx1 : h.bx0)), 12);
    // backboard (side view = thin slab) + a face panel for readability
    var bx = h.side ? h.bx0 : h.bx1;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(h.bx0, h.by0, h.bx1 - h.bx0, h.by1 - h.by0);
    c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(h.bx0, h.by0, h.bx1 - h.bx0, h.by1 - h.by0);
    // glowing target square hint on board
    c.fillStyle = h.glow > 0 ? 'rgba(255,210,63,' + (0.4 + h.glow * 0.6) + ')' : 'rgba(255,77,109,0.8)';
    c.fillRect(h.bx0 + 2, RIM_Y - 58, h.bx1 - h.bx0 - 4, 50);
    // bracket
    c.fillStyle = '#39405e'; c.fillRect(Math.min(h.back, bx), RIM_Y - 4, Math.abs(bx - h.back), 8);
    // back half of rim (ellipse top arc)
    var bend = h.bend * 10;
    c.strokeStyle = '#b8410f'; c.lineWidth = 5;
    c.beginPath(); c.ellipse(h.x, RIM_Y + bend * 0.5, 44, 9, s * bend * 0.012, Math.PI, TAU); c.stroke();
    drawNet(c, h, m, true);
  }
  function netPts(h, m) {
    var t = m ? m.clock : 0, n = h.net, sw = Math.sin(t * 16) * h.sway * 6;
    var depth = 62 + n * 26 * Math.sin(Math.min(1, h.netT * 3) * Math.PI) + h.bend * 12;
    var topY = RIM_Y + h.bend * 5;
    var bot = [], top = [];
    for (var i = 0; i <= 4; i++) {
      var u = i / 4;
      top.push(h.x - 44 + 88 * u, topY);
      var squeeze = 26 - n * 8 * Math.sin(h.netT * 20) * (1 - h.netT);
      bot.push(h.x - squeeze + 2 * squeeze * u + sw, topY + depth);
    }
    return { top: top, bot: bot, depth: depth, topY: topY };
  }
  function drawNet(c, h, m, back) {
    var P = netPts(h, m);
    c.strokeStyle = back ? 'rgba(220,225,240,0.6)' : '#ffffff'; c.lineWidth = back ? 2 : 2.5;
    c.beginPath();
    for (var i = 0; i <= 4; i++) {
      var j = back ? 4 - i : i;
      if (back && (i % 2)) continue;
      if (!back && !(i % 2)) { c.moveTo(P.top[j * 2], P.top[j * 2 + 1]); c.lineTo(P.bot[j * 2], P.bot[j * 2 + 1]); continue; }
      if (back) { c.moveTo(P.top[j * 2], P.top[j * 2 + 1]); c.lineTo(P.bot[j * 2], P.bot[j * 2 + 1]); }
    }
    c.stroke();
    if (!back) {
      // diamond mesh
      c.beginPath();
      for (var r = 1; r <= 3; r++) {
        var v = r / 3.2;
        for (var k = 0; k < 4; k++) {
          var x1 = P.top[k * 2] + (P.bot[k * 2] - P.top[k * 2]) * v, y1 = P.topY + P.depth * v;
          var x2 = P.top[k * 2 + 2] + (P.bot[k * 2 + 2] - P.top[k * 2 + 2]) * (v - 0.14), y2 = P.topY + P.depth * (v - 0.14);
          c.moveTo(x1, y1); c.lineTo(x2, y2);
          c.moveTo(x2, y2); c.lineTo(P.top[k * 2 + 2] + (P.bot[k * 2 + 2] - P.top[k * 2 + 2]) * v, y1);
        }
      }
      c.stroke();
      c.beginPath(); c.moveTo(P.bot[0], P.bot[1]); c.lineTo(P.bot[8], P.bot[9]); c.stroke();
    }
  }
  function drawHoopFront(c, h, m) {
    var bend = h.bend * 10;
    drawNet(c, h, m, false);
    c.strokeStyle = INK; c.lineWidth = 9;
    c.beginPath(); c.ellipse(h.x, RIM_Y + bend * 0.5, 44, 9, h.s * bend * 0.012, 0, Math.PI); c.stroke();
    c.strokeStyle = h.glow > 0.3 ? '#ffb347' : '#ff6a1a'; c.lineWidth = 5.5;
    c.beginPath(); c.ellipse(h.x, RIM_Y + bend * 0.5, 44, 9, h.s * bend * 0.012, 0, Math.PI); c.stroke();
  }

  /* ------------------------------------------------------------ players */
  function drawPlayer(c, p, m, t) {
    var team = TEAM[p.idx], ch = p.ch, b = m.ball;
    var f = p.facing, air = !p.onGround || p.dunk || p.hang > 0;
    var hasBall = b.holder === p;
    // shadow
    var hgt = Math.max(0, FLOOR - p.y);
    c.fillStyle = 'rgba(0,0,0,' + (0.28 * Math.max(0.25, 1 - hgt / 300)) + ')';
    A.ell(c, p.x, FLOOR + 3, 34 * Math.max(0.4, 1 - hgt / 400), 8, 0); c.fill();

    c.save();
    c.translate(p.x, p.y);
    c.scale(p.sqx, p.sqy);
    // legs
    var w = p.walkT, moving = Math.abs(p.vx) > 30 && p.onGround;
    var legs = [-1, 1];
    c.lineCap = 'round';
    for (var i = 0; i < 2; i++) {
      var side = legs[i];
      var fx, fy, kx, ky;
      if (air) { fx = side * 8 + f * (side > 0 ? 12 : -4); fy = -14 - (side > 0 ? 10 : 0); kx = f * 10 + side * 6; ky = -30; }
      else if (moving) { var sw = Math.sin(w * 1.0 + (side > 0 ? 0 : Math.PI)); fx = side * 7 + sw * 16; fy = -Math.max(0, Math.cos(w + (side > 0 ? 0 : Math.PI))) * 8; kx = fx * 0.5 + f * 4; ky = -24; }
      else { fx = side * 12; fy = 0; kx = side * 10; ky = -22; }
      c.strokeStyle = INK; c.lineWidth = 13;
      c.beginPath(); c.moveTo(side * 8, -44); c.quadraticCurveTo(kx, ky, fx, fy - 4); c.stroke();
      c.strokeStyle = ch.skin; c.lineWidth = 8;
      c.beginPath(); c.moveTo(side * 8, -44); c.quadraticCurveTo(kx, ky, fx, fy - 4); c.stroke();
      // socks
      c.strokeStyle = '#fff'; c.lineWidth = 8;
      c.beginPath(); c.moveTo(fx - (fx - kx) * 0.25, fy - 4 - (fy - ky) * 0.35); c.lineTo(fx, fy - 4); c.stroke();
      // shoe
      A.rr(c, fx - 11 + f * 3, fy - 10, 24, 12, 6); A.fs(c, ch.shoe, 3);
      c.fillStyle = '#fff'; c.fillRect(fx - 9 + f * 3, fy - 3, 20, 3);
    }
    // shorts
    A.rr(c, -21, -58, 42, 22, 7); A.fs(c, team.dark, 3);
    // torso (jersey)
    A.rr(c, -22, -92, 44, 42, 13); A.fs(c, team.main, 3);
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(-22, -68, 44, 5);
    text(c, String((p.idx ? 23 : 7)), 0, -80, 16, '#fff', 'center', { stroke: team.dark, sw: 3 });
    // arms
    var hy = HH.headY(p) - p.y;
    var bx = b.x - p.x, by = b.y - p.y;
    var shoulders = [-15, 15];
    for (var a = 0; a < 2; a++) {
      var sx = shoulders[a] * (f || 1), sy = -84;
      var hx, hyy;
      if (hasBall && (air || p.charging)) { hx = bx + (a ? 10 : -10); hyy = by + 12; }
      else if (hasBall && a === 1) { hx = bx - f * 4; hyy = Math.min(by - 14, -52); }
      else if (p.mood === 'happy' && !hasBall) { hx = sx * 1.6; hyy = -150 - Math.sin(t * 12 + a * 3) * 8; }
      else if (air) { hx = sx * 1.8; hyy = -140; }
      else { var swa = moving ? Math.sin(w + (a ? 0 : Math.PI)) * 14 : 0; hx = sx * 1.4 + swa; hyy = -48; }
      if (hx * hx + (hyy - sy) * (hyy - sy) > 90 * 90) { var ang = Math.atan2(hyy - sy, hx - sx); hx = sx + Math.cos(ang) * 90; hyy = sy + Math.sin(ang) * 90; }
      c.strokeStyle = INK; c.lineWidth = 12;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hyy); c.stroke();
      c.strokeStyle = ch.skin; c.lineWidth = 7;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hyy); c.stroke();
      A.circ(c, hx, hyy, 7); A.fs(c, ch.skin, 2.5);
    }
    c.restore();

    // head
    var hY = HH.headY(p);
    var bob = p.onGround && !moving ? Math.sin(p.t * 3) * 1.5 : 0;
    if (p.fire) drawFlames(c, p.x, hY, p.headR, t);
    var o = { t: p.t, mood: p.mood, blink: p.blink };
    var lx = (b.x - p.x) * f / 220, ly = (b.y - hY) / 220;
    o.lx = Math.max(-1, Math.min(1, lx)); o.ly = Math.max(-1, Math.min(1, ly));
    if (p.stun > 0) o.mood = 'dizzy';
    drawHead(c, ch, p.x, (hY + bob - p.y) * p.sqy + p.y, p.headR, f, o, 1 / Math.sqrt(p.sqy), p.sqy);
    if (p.stun > 0) {
      for (var s = 0; s < 3; s++) {
        var an = t * 6 + s * TAU / 3;
        c.fillStyle = '#ffd23f'; A.star(c, p.x + Math.cos(an) * p.headR * 0.9, hY - p.headR - 6 + Math.sin(an) * 8, 8); c.fill();
      }
    }
  }
  function drawFlames(c, x, y, r, t) {
    for (var i = 0; i < 7; i++) {
      var a = -Math.PI / 2 + (i - 3) * 0.38;
      var len = r * (0.75 + 0.3 * Math.sin(t * 14 + i * 1.7));
      var bx = x + Math.cos(a) * r * 0.8, by = y + Math.sin(a) * r * 0.8;
      c.fillStyle = i % 2 ? '#ff9f1c' : '#ff4d1a';
      c.beginPath(); c.moveTo(bx - Math.sin(a) * 12, by + Math.cos(a) * 12);
      c.quadraticCurveTo(bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.6 - 6, bx + Math.cos(a) * len, by + Math.sin(a) * len);
      c.quadraticCurveTo(bx + Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.5, bx + Math.sin(a) * 12, by - Math.cos(a) * 12);
      c.fill();
    }
    c.globalAlpha = 0.35; A.circ(c, x, y, r * 1.25); c.fillStyle = '#ffb347'; c.fill(); c.globalAlpha = 1;
  }

  /* ------------------------------------------------------- shot meter */
  function drawMeter(c, p, m) {
    var h = m.hoops[p.idx === 0 ? 1 : 0];
    var zone = HH.zoneFor(p, h), center = HH.SWEET;
    var hY = HH.headY(p);
    var x = p.x - p.facing * (p.headR + 34), y0 = hY + 34, y1 = hY - 80, hgt = y0 - y1;
    A.rr(c, x - 11, y1 - 5, 22, hgt + 10, 11); A.fs(c, 'rgba(20,16,50,0.85)', 3);
    var zlo = Math.max(0, center - zone), zhi = Math.min(1, center + zone);
    c.fillStyle = p.fire ? '#ff9f1c' : '#3ddc84';
    c.fillRect(x - 6, y0 - hgt * zhi, 12, hgt * (zhi - zlo));
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x - 6, y0 - hgt * center - 1, 12, 2);
    var yy = y0 - hgt * p.charge;
    var inZ = p.charge >= zlo && p.charge <= zhi;
    c.fillStyle = inZ ? '#fff' : '#ff5a5f';
    A.rr(c, x - 15, yy - 4, 30, 8, 4); c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    if (Math.abs(p.x - h.x) > HH.THREE) {
      A.circ(c, x, y1 - 20, 14); A.fs(c, '#b18cff', 3);
      text(c, '3', x, y1 - 19, 18, '#fff', 'center');
    }
  }

  /* ---------------------------------------------------------------- HUD */
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    var mm = Math.floor(s / 60), ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function drawHUD(c, m, info) {
    var a = m.players[0], b = m.players[1];
    var cx = 640, y = 12, pw = 620, ph = 82;
    // panel
    A.rr(c, cx - pw / 2, y, pw, ph, 22); A.fs(c, 'rgba(16,14,44,0.86)', 0);
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.stroke();
    // team plates
    [a, b].forEach(function (p, i) {
      var team = TEAM[i];
      var sx = i === 0 ? cx - pw / 2 + 8 : cx + pw / 2 - 8 - 232;
      A.rr(c, sx, y + 8, 232, ph - 16, 16); A.fs(c, team.main, 0);
      c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(sx + 10, y + 12, 212, 4);
      // head icon
      c.save(); A.rr(c, sx, y + 8, 232, ph - 16, 16); c.clip();
      var hx = i === 0 ? sx + 32 : sx + 200;
      drawHead(c, p.ch, hx, y + 50, 26, i === 0 ? 1 : -1, { t: p.t, mood: p.mood, blink: p.blink });
      c.restore();
      // name + tag
      var nameX = i === 0 ? sx + 121 : sx + 111;
      var nm = p.ch.name;
      var tag = info.tags[i];
      text(c, nm, nameX, tag ? y + 34 : y + 45, fitSize(c, nm, 24, 108), '#fff', 'center', { stroke: team.dark, sw: 4 });
      if (tag) text(c, tag, nameX, y + 61, fitSize(c, tag, 15, 110), 'rgba(255,255,255,0.88)', 'center');
      // score
      var scX = i === 0 ? sx + 204 : sx + 28;
      var pop = info.scorePop[i] > 0 ? 1 + info.scorePop[i] * 0.5 : 1;
      c.save(); c.translate(scX, y + 44); c.scale(pop, pop);
      text(c, String(p.score), 0, 0, p.score > 99 ? 32 : 42, '#fff', 'center', { stroke: INK, sw: 6 });
      c.restore();
      // fire pips
      for (var k = 0; k < 2; k++) {
        var px = (i === 0 ? sx + 110 : sx + 100) + (k - 0.5) * 24, py = y + ph + 12;
        var on = p.fire || p.streak > k;
        drawFlameIcon(c, px, py, on ? (p.fire ? 1.2 : 1) : 0.8, on, m.clock);
      }
    });
    // clock
    var tt = m.overtime ? 'سلة ذهبية' : fmtTime(m.time);
    var low = !m.overtime && m.time <= 10 && m.phase === 'play';
    var col = low ? (Math.floor(m.clock * 4) % 2 ? '#ff5a5f' : '#fff') : '#ffd23f';
    text(c, tt, cx, y + 36, fitSize(c, tt, m.overtime ? 26 : 38, 128), col, 'center', { stroke: INK, sw: 5 });
    text(c, info.sub, cx, y + 66, 14, 'rgba(255,255,255,0.75)', 'center');
    if (info.mode) {
      var ms = fitSize(c, info.mode, 18, 300);
      A.rr(c, cx - 130, y + ph + 26, 260, 28, 14); A.fs(c, 'rgba(16,14,44,0.7)', 0);
      text(c, info.mode, cx, y + ph + 41, ms, '#ffd23f', 'center');
    }
  }
  function drawFlameIcon(c, x, y, s, on, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(0, -12); c.quadraticCurveTo(10, -2, 7, 5); c.quadraticCurveTo(0, 12, -7, 5); c.quadraticCurveTo(-9, -3, 0, -12); c.closePath();
    c.fillStyle = on ? '#ff7a1a' : 'rgba(255,255,255,0.18)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,0.3)'; c.stroke();
    if (on) { c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(5, 3, 0, 8); c.quadraticCurveTo(-5, 3, 0, -3); c.fillStyle = '#fff27a'; c.fill(); }
    c.restore();
  }

  /* ------------------------------------------------------------- render */
  HH.render = function (c, view, m, info) {
    info = info || { tags: ['', ''], scorePop: [0, 0], sub: '', hud: true };
    var t = m.clock;
    var court = info.court || 'street';
    c.save();
    c.fillStyle = '#10142b'; c.fillRect(0, 0, W, H);
    c.translate(m.shake.x, m.shake.y);
    c.drawImage(ensureBg(court, view), 0, 0, W, H);
    drawCrowd(c, m, t, court);
    drawHoopBack(c, m.hoops[0], m); drawHoopBack(c, m.hoops[1], m);

    // ball shadow
    var b = m.ball;
    if (!b.hidden) {
      var bh = Math.max(0, FLOOR - b.y);
      c.fillStyle = 'rgba(0,0,0,' + (0.25 * Math.max(0.2, 1 - bh / 400)) + ')';
      A.ell(c, b.x, FLOOR + 2, 16 * Math.max(0.4, 1 - bh / 500), 5, 0); c.fill();
    }
    // players: the ball holder is drawn last so the ball sits on top
    var order = m.players.slice().sort(function (p, q) { return (b.holder === p ? 1 : 0) - (b.holder === q ? 1 : 0); });
    order.forEach(function (p) { drawPlayer(c, p, m, t); });
    // ball trail
    if (b.trail.length > 2) {
      var n = b.trail.length / 2;
      for (var i = 0; i < n; i++) {
        var k = i / n;
        c.globalAlpha = k * (b.fire ? 0.8 : 0.3);
        c.fillStyle = b.fire ? (i % 2 ? '#ffd23f' : '#ff5a1a') : '#fff';
        A.circ(c, b.trail[i * 2], b.trail[i * 2 + 1], BR * (b.fire ? 1.1 : 0.7) * k); c.fill();
      }
      c.globalAlpha = 1;
    }
    if (b.hidden) {
      if (m.phase === 'intro') drawBall(c, 640, 470 + Math.sin(t * 5) * 8, BR, t * 2, info.ball);
    } else {
      if (b.fire) { c.globalAlpha = 0.5; A.circ(c, b.x, b.y, BR * 1.6); c.fillStyle = '#ff9f1c'; c.fill(); c.globalAlpha = 1; }
      drawBall(c, b.x, b.y, BR, b.rot, info.ball);
    }
    drawHoopFront(c, m.hoops[0], m); drawHoopFront(c, m.hoops[1], m);
    m.fx.draw(c);
    // meters
    m.players.forEach(function (p) { if (p.charging) drawMeter(c, p, m); });
    // "you" marker
    if (info.hud && info.youT > 0) {
      m.players.forEach(function (p, i) {
        if (!info.marks[i]) return;
        var hy = HH.headY(p) - p.headR - 34 - Math.sin(t * 8) * 4;
        c.globalAlpha = Math.min(1, info.youT);
        c.fillStyle = TEAM[i].main;
        c.beginPath(); c.moveTo(p.x - 12, hy); c.lineTo(p.x + 12, hy); c.lineTo(p.x, hy + 14); c.closePath(); c.fill();
        c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
        text(c, info.marks[i], p.x, hy - 16, 22, '#fff', 'center', { stroke: TEAM[i].dark, sw: 5 });
        c.globalAlpha = 1;
      });
    }
    // off-screen ball arrow
    if (!b.hidden && b.y < -BR) {
      c.fillStyle = '#ffd23f';
      c.beginPath(); c.moveTo(b.x, 108); c.lineTo(b.x - 12, 128); c.lineTo(b.x + 12, 128); c.closePath(); c.fill();
    }
    // popups
    m.popups.forEach(function (pp) {
      var k = pp.t / pp.life;
      var s = pp.t < 0.15 ? 0.4 + pp.t / 0.15 * 0.8 : (pp.t < 0.25 ? 1.2 - (pp.t - 0.15) * 2 : 1);
      c.globalAlpha = k > 0.75 ? Math.max(0, 1 - (k - 0.75) * 4) : 1;
      c.save(); c.translate(Math.max(150, Math.min(W - 150, pp.x)), Math.max(150, pp.y)); c.scale(s, s); c.rotate(Math.sin(pp.t * 10) * 0.03);
      var sz = fitSize(c, pp.text, pp.size, 560);
      text(c, pp.text, 0, 0, sz, pp.color, 'center', { stroke: INK, sw: sz * 0.2, shadow: 'rgba(0,0,0,0.35)', sd: 5 });
      if (pp.sub) text(c, pp.sub, 0, sz * 0.85, sz * 0.6, '#fff', 'center', { stroke: INK, sw: 6 });
      c.restore();
      c.globalAlpha = 1;
    });
    c.restore();

    if (m.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + (m.flash * 0.6) + ')'; c.fillRect(0, 0, W, H); }
    if (!info.hud) return;
    drawHUD(c, m, info);

    // intro / banners
    if (m.phase === 'intro') {
      var go = m.phaseT <= 0.6;
      var label = go ? 'انطلق!' : (m.overtime ? 'السلة الذهبية!' : 'استعد!');
      var pt = go ? (0.6 - m.phaseT) : (m.phaseT - 0.6);
      var sc = go ? 1 + Math.max(0, 0.3 - pt) * 2 : 1 + Math.sin(t * 6) * 0.04;
      c.save(); c.translate(640, 300); c.scale(sc, sc);
      text(c, label, 0, 0, 96, go ? '#7dff9a' : '#ffd23f', 'center', { stroke: INK, sw: 16, shadow: 'rgba(0,0,0,0.4)', sd: 8 });
      var isub = m.overtime ? 'تعادل! أول من يسجّل يفوز' : info.introSub;
      if (!go && isub) text(c, isub, 0, 76, fitSize(c, isub, 30, 900), '#fff', 'center', { stroke: INK, sw: 7 });
      c.restore();
    }
    if (m.timeUp && m.phase === 'play' && !m.ended) text(c, 'انتهى الوقت!', 640, 230, 64, '#ff5a5f', 'center', { stroke: INK, sw: 12 });
    if (m.phase === 'end') {
      var wn = info.winText || '';
      var k2 = Math.min(1, (2.2 - m.phaseT) * 3);
      c.save(); c.translate(640, 290); c.scale(0.5 + k2 * 0.5, 0.5 + k2 * 0.5);
      text(c, wn, 0, 0, fitSize(c, wn, 88, 1100), '#ffd23f', 'center', { stroke: INK, sw: 15, shadow: 'rgba(0,0,0,0.4)', sd: 8 });
      c.restore();
    }
    // tutorial hint
    if (m.hint) {
      var hs = fitSize(c, m.hint, 26, 820);
      c.font = '700 ' + hs + 'px Fredoka'; c.direction = 'rtl';
      var tw = c.measureText(m.hint).width; c.direction = 'ltr';
      var a2 = Math.min(1, m.tipT * 4);
      c.globalAlpha = a2;
      A.rr(c, 640 - tw / 2 - 28, 660, tw + 56, 48, 24); A.fs(c, 'rgba(16,14,44,0.9)', 0);
      c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke();
      text(c, m.hint, 640, 685, hs, '#fff', 'center');
      c.globalAlpha = 1;
    }
  };
})();
