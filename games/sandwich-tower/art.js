/* Sandwich Tower (برج السندويش): everything drawn in code on one 2D canvas (1280x720
 * logical). Flat fills with chunky outlines, no shadows, no filters and no canvas reads;
 * gradients are made once per theme (endless: once per 25 px sky band) and the star field is
 * one small tile drawn twice. The draw loop reuses its option objects and constant arrays.
 * ST.drawPiece and ST.drawEater also paint the previews on the eater screen.
 */
(function () {
  'use strict';
  var ST = window.ST, M = Math, W = 1280, H = 720, TAU = M.PI * 2;
  var INK = '#3a2216';
  // Constant arrays and reused option objects, so a frame allocates nothing.
  var NO_OPT = {}, DASH5 = [5, 5], DASH10 = [10, 10], NO_DASH = [];
  var SPRINKLE = ['#fff', '#4fd8ff', '#ffe14f', '#7dffb0'], PAD_COL = ['#ff4f6d', '#3ddc84', '#4fd8ff', '#ffe14f'], PAD_DX = [0, 1.6, 0, -1.6], PAD_DY = [-1.4, 0, 1.4, 0];
  var EYES2 = [-0.36, 0.36], EYES3 = [-0.42, 0, 0.42], SPOTS = [-0.6, -0.3, 0.08, 0.55, -0.45, 0.06, 0.7, 0.05, 0.05, -0.75, 0.1, 0.05];
  var LOOK0 = { x: 0, y: 0.6 }, LOOK_EAT = { x: -0.2, y: 0.9 }, PLANETS = ['#ff9a5c', '#7a8cff', '#ffd23f', '#ff7ac8'], CANDY = ['#ff7ac8', '#7dffb0', '#ffe14f', '#4fd8ff'];
  ST.INK = INK;
  ST.PLATE_Y = 612;      // the plate's top on screen while the camera is at 0

  function rrect(ctx, x, y, w, h, r) {
    r = M.max(0, M.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, M.max(0.1, rx), M.max(0.1, ry), rot || 0, 0, TAU); }
  function fs(ctx, fill) { ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  ST.rrect = rrect;
  function googly(ctx, x, y, r, px, py) {
    ell(ctx, x, y, r, r); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = M.max(1.5, r * 0.2); ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, x + px * r * 0.42, y + py * r * 0.42, r * 0.52, r * 0.52); ctx.fillStyle = INK; ctx.fill();
  }
  ST.googly = googly;

  /* ------------------------------------------------------------- pieces */
  // A row of n rounded things across the slab (cucumber slices, falafel, pickles).
  function row(ctx, x0, y0, w, h, per, fill, inner, seed) {
    var n = M.max(1, M.round(w / per)), d = w / n;
    for (var i = 0; i < n; i++) {
      var cx = x0 + d * (i + 0.5);
      ell(ctx, cx, y0 + h / 2, d / 2 + 1, h / 2); fs(ctx, fill);
      if (inner) inner(cx, d, i);
    }
  }
  function face(ctx, x, yc, h, w, style, t) {
    var r = M.max(3.5, M.min(h * 0.24, 9)), gap = M.min(w * 0.16, r * 2.6);
    var px = M.sin(t * 1.7 + x * 0.01) * 0.6, py = 0.3;
    googly(ctx, x - gap, yc - r * 0.3, r, px, py);
    googly(ctx, x + gap, yc - r * 0.4, r * 0.88, px, py);
    ctx.lineWidth = M.max(2, r * 0.35); ctx.strokeStyle = INK;
    ctx.beginPath();
    if (style === 2) { ell(ctx, x, yc + r * 1.05, r * 0.45, r * 0.55); ctx.fillStyle = '#7a1f3d'; ctx.fill(); }
    else {
      ctx.moveTo(x - r * 0.9, yc + r * 0.75); ctx.quadraticCurveTo(x, yc + r * 1.9, x + r * 0.9, yc + r * 0.75); ctx.stroke();
      if (style === 3) { ell(ctx, x + r * 0.2, yc + r * 1.45, r * 0.32, r * 0.42); ctx.fillStyle = '#ff6f8f'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }
  function zzz(ctx, x, y, s, t) {
    ctx.font = '700 ' + M.round(s) + 'px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = '#fff';
    for (var i = 0; i < 3; i++) {
      var k = (t * 0.7 + i / 3) % 1;
      ctx.globalAlpha = M.sin(k * M.PI);
      var zx = x + k * s * 1.4, zy = y - k * s * 2.2, sz = 0.6 + k * 0.6;
      ctx.save(); ctx.translate(zx, zy); ctx.scale(sz, sz); ctx.strokeText('z', 0, 0); ctx.fillText('z', 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Draws one slab with its bottom centre at (x, yb). o: { t, face, zzz }.
  ST.drawPiece = function (ctx, kind, x, yb, w, h, o) {
    o = o || NO_OPT;
    var t = o.t || 0, x0 = x - w / 2, y0 = yb - h, lw = h < 24 ? 2.6 : 3.4, i, n;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
    var showFace = o.face;
    switch (kind) {
      case 'bread':
        rrect(ctx, x0, y0, w, h, h * 0.42); fs(ctx, '#d98a3d');
        rrect(ctx, x0 + 5, y0 + 5, w - 10, h - 10, h * 0.3); ctx.fillStyle = '#ffdf9e'; ctx.fill();
        ctx.fillStyle = '#f2bd6c';
        for (i = 0; i < M.floor(w / 40); i++) { ell(ctx, x0 + 18 + i * 40 + hash(i, 3) * 12, y0 + h * (0.35 + hash(i, 5) * 0.3), 3.5, 2.2); ctx.fill(); }
        break;
      case 'bun':
        ctx.beginPath(); ctx.moveTo(x0 + 6, yb); ctx.quadraticCurveTo(x0 - 2, yb, x0, yb - h * 0.3);
        ctx.bezierCurveTo(x0 + w * 0.04, y0 - 4, x0 + w * 0.3, y0, x, y0);
        ctx.bezierCurveTo(x0 + w * 0.7, y0, x0 + w * 0.96, y0 - 4, x0 + w, yb - h * 0.3);
        ctx.quadraticCurveTo(x0 + w + 2, yb, x0 + w - 6, yb); ctx.closePath(); fs(ctx, '#ee9a3c');
        ell(ctx, x - w * 0.12, y0 + h * 0.32, w * 0.26, h * 0.14, -0.08); ctx.fillStyle = '#ffc274'; ctx.fill();
        ctx.fillStyle = '#fff6dc'; ctx.lineWidth = 1.5;
        n = M.max(3, M.floor(w / 22));
        for (i = 0; i < n; i++) {
          var sx = x0 + w * (0.1 + 0.8 * (i + hash(i, 9) * 0.6) / n), k = (sx - x) / (w / 2);
          ell(ctx, sx, y0 + h * (0.22 + k * k * 0.42) + hash(i, 4) * 5, 4, 2.4, hash(i, 2) - 0.5); ctx.fill(); ctx.stroke();
        }
        break;
      case 'lettuce':
        ctx.beginPath();
        n = M.max(3, M.round(w / 22));
        var lx = x0 - 6, lw2 = w + 12, step = lw2 / n;
        ctx.moveTo(lx, y0 + h * 0.5);
        for (i = 0; i < n; i++) ctx.quadraticCurveTo(lx + step * (i + 0.5), y0 - h * 0.25, lx + step * (i + 1), y0 + h * 0.22);
        ctx.lineTo(lx + lw2, yb - h * 0.3);
        for (i = n - 1; i >= 0; i--) ctx.quadraticCurveTo(lx + step * (i + 0.5), yb + h * 0.3, lx + step * i, yb - h * 0.15);
        ctx.closePath(); fs(ctx, '#6fd34e');
        ctx.strokeStyle = '#b6f28a'; ctx.lineWidth = 2; ctx.beginPath();
        for (i = 0; i < n; i++) { ctx.moveTo(lx + step * (i + 0.5), y0 + h * 0.2); ctx.lineTo(lx + step * (i + 0.5) + 4, yb - h * 0.25); }
        ctx.stroke(); ctx.strokeStyle = INK;
        break;
      case 'tomato':
        rrect(ctx, x0, y0, w, h, h / 2); fs(ctx, '#ff4b3e');
        ctx.fillStyle = '#ff8b76';
        n = M.max(1, M.floor(w / 30));
        for (i = 0; i < n; i++) { ell(ctx, x0 + w * (i + 0.5) / n, y0 + h / 2, M.min(9, w / n / 2 - 3), h * 0.26); ctx.fill(); }
        ctx.fillStyle = '#ffe48a';
        for (i = 0; i < n; i++) { ell(ctx, x0 + w * (i + 0.5) / n - 3, y0 + h / 2, 2, 3); ctx.fill(); ell(ctx, x0 + w * (i + 0.5) / n + 3, y0 + h / 2, 2, 3); ctx.fill(); }
        break;
      case 'cheese':
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w, yb);
        ctx.lineTo(x0 + w - 6, yb + 9); ctx.lineTo(x0 + w - 13, yb);
        if (w > 90) { ctx.lineTo(x + 18, yb); ctx.quadraticCurveTo(x + 10, yb + 14, x + 3, yb); }
        ctx.lineTo(x0 + 16, yb); ctx.lineTo(x0 + 8, yb + 11); ctx.lineTo(x0, yb); ctx.closePath(); fs(ctx, '#ffd23f');
        ctx.fillStyle = '#eeb11a';
        for (i = 0; i < M.floor(w / 34); i++) { ell(ctx, x0 + 20 + i * 34 + hash(i, 7) * 8, y0 + h * (0.35 + hash(i, 1) * 0.3), 4 + hash(i, 8) * 3, 3); ctx.fill(); }
        break;
      case 'cucumber':
        row(ctx, x0, y0, w, h, h * 1.15, '#3f9e3a', function (cx, d) {
          ell(ctx, cx, y0 + h / 2, d / 2 - 3, h / 2 - 3); ctx.fillStyle = '#cdf28f'; ctx.fill();
          ctx.fillStyle = '#86c45a';
          ell(ctx, cx - d * 0.15, y0 + h / 2, 1.8, 3); ctx.fill(); ell(ctx, cx + d * 0.15, y0 + h / 2, 1.8, 3); ctx.fill();
        });
        break;
      case 'egg':
        rrect(ctx, x0, y0 + 2, w, h - 2, h / 2); fs(ctx, '#fffdf3');
        ell(ctx, x, y0 + h * 0.5, M.min(w * 0.24, h * 1.2), h * 0.42); fs(ctx, '#ffc21f');
        ell(ctx, x - M.min(w * 0.08, 10), y0 + h * 0.38, M.min(w * 0.06, 7), h * 0.12); ctx.fillStyle = '#ffe58a'; ctx.fill();
        break;
      case 'patty':
        rrect(ctx, x0, y0, w, h, h * 0.42); fs(ctx, '#8a4a24');
        ctx.strokeStyle = '#5a2c12'; ctx.lineWidth = 3.5; ctx.beginPath();
        for (i = 22; i < w - 14; i += 30) { ctx.moveTo(x0 + i, y0 + h * 0.3); ctx.lineTo(x0 + i + 10, yb - h * 0.3); }
        ctx.stroke(); ctx.strokeStyle = INK;
        rrect(ctx, x0 + 8, y0 + 4, w - 16, 4, 2); ctx.fillStyle = '#b0683c'; ctx.fill();
        break;
      case 'falafel':
        row(ctx, x0, y0, w, h, h, '#b8742f', function (cx, d, j) {
          ctx.fillStyle = '#dca35c';
          ell(ctx, cx - d * 0.15, y0 + h * 0.35, 2.6, 2); ctx.fill(); ell(ctx, cx + d * 0.12, y0 + h * 0.6, 2.2, 1.8); ctx.fill();
          ctx.fillStyle = '#7fb83a'; ell(ctx, cx + d * 0.18, y0 + h * 0.3, 1.8, 1.4); ctx.fill();
        });
        break;
      case 'pickles':
        row(ctx, x0, y0, w, h, h * 1.5, '#7bbf3a', function (cx, d) {
          ell(ctx, cx, y0 + h / 2, d / 2 - 4, h / 2 - 4); ctx.fillStyle = '#c4e889'; ctx.fill();
          ctx.fillStyle = '#5b9a2a';
          ell(ctx, cx - d * 0.2, y0 + h * 0.5, 1.8, 1.8); ctx.fill(); ell(ctx, cx + d * 0.2, y0 + h * 0.5, 1.8, 1.8); ctx.fill(); ell(ctx, cx, y0 + h * 0.3, 1.8, 1.8); ctx.fill();
        });
        break;
      case 'cat': {
        // A long sleeping cat: head on the right, tail curled on the left.
        var hr = M.min(h * 0.56, w * 0.3), hx = x0 + w - hr * 0.9, hy = y0 + h * 0.48;
        ctx.beginPath(); ctx.moveTo(x0 + 8, yb - h * 0.45); ctx.quadraticCurveTo(x0 - 16, y0 - 8, x0 + 6, y0 + 2); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = '#ffa53d'; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = lw;
        rrect(ctx, x0 + 4, y0 + h * 0.12, w - hr - 4, h * 0.88, h * 0.44); fs(ctx, '#ffa53d');
        ctx.strokeStyle = '#d9781c'; ctx.lineWidth = 3.5; ctx.beginPath();
        for (i = x0 + 22; i < x0 + w - hr * 1.8; i += 26) { ctx.moveTo(i, y0 + h * 0.14); ctx.quadraticCurveTo(i + 5, y0 + h * 0.4, i, y0 + h * 0.55); }
        ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = lw;
        ell(ctx, x0 + w * 0.3, yb - 2, M.min(10, w * 0.05), 5); fs(ctx, '#ffd9a8');
        ell(ctx, x0 + w - hr * 2.2, yb - 2, M.min(10, w * 0.05), 5); fs(ctx, '#ffd9a8');
        ctx.beginPath(); ctx.moveTo(hx - hr * 0.85, hy - hr * 0.35); ctx.lineTo(hx - hr * 0.6, hy - hr * 1.25); ctx.lineTo(hx - hr * 0.1, hy - hr * 0.75); ctx.closePath(); fs(ctx, '#ffa53d');
        ctx.beginPath(); ctx.moveTo(hx + hr * 0.85, hy - hr * 0.35); ctx.lineTo(hx + hr * 0.62, hy - hr * 1.25); ctx.lineTo(hx + hr * 0.1, hy - hr * 0.75); ctx.closePath(); fs(ctx, '#ffa53d');
        ell(ctx, hx, hy, hr, hr * 0.86); fs(ctx, '#ffb14f');
        ctx.lineWidth = 2.6; ctx.beginPath();
        ctx.moveTo(hx - hr * 0.55, hy - hr * 0.05); ctx.quadraticCurveTo(hx - hr * 0.35, hy + hr * 0.18, hx - hr * 0.15, hy - hr * 0.05);
        ctx.moveTo(hx + hr * 0.15, hy - hr * 0.05); ctx.quadraticCurveTo(hx + hr * 0.35, hy + hr * 0.18, hx + hr * 0.55, hy - hr * 0.05);
        ctx.moveTo(hx - hr * 1.15, hy + hr * 0.2); ctx.lineTo(hx - hr * 0.55, hy + hr * 0.32);
        ctx.moveTo(hx + hr * 1.15, hy + hr * 0.2); ctx.lineTo(hx + hr * 0.55, hy + hr * 0.32);
        ctx.stroke();
        ell(ctx, hx, hy + hr * 0.25, hr * 0.13, hr * 0.09); ctx.fillStyle = '#ff6f8f'; ctx.fill();
        if (o.zzz) zzz(ctx, hx + hr * 0.4, hy - hr * 1.1, M.max(14, hr * 0.7), t);
        showFace = 0;
        break;
      }
      case 'sneaker': {
        var sole = h * 0.3;
        ctx.beginPath(); ctx.moveTo(x0 + 6, yb - sole);
        ctx.quadraticCurveTo(x0 - 2, yb - h * 0.75, x0 + w * 0.22, y0 + h * 0.3);
        ctx.lineTo(x0 + w * 0.72, y0 + 2); ctx.quadraticCurveTo(x0 + w * 0.8, y0 - 6, x0 + w * 0.9, y0 + 1);
        ctx.lineTo(x0 + w - 2, y0 + h * 0.12); ctx.lineTo(x0 + w, yb - sole); ctx.closePath(); fs(ctx, '#4f8cff');
        ctx.beginPath(); ctx.moveTo(x0 + w * 0.5, yb - sole); ctx.lineTo(x0 + w * 0.62, y0 + h * 0.35); ctx.lineTo(x0 + w * 0.68, yb - sole); ctx.closePath(); ctx.fillStyle = '#ffe14f'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        rrect(ctx, x0, yb - sole, w, sole, sole * 0.5); ctx.lineWidth = lw; fs(ctx, '#fff');
        ctx.fillStyle = '#ff5f8a'; ctx.fillRect(x0 + 8, yb - sole * 0.62, w - 16, sole * 0.26);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
        for (i = 0; i < 3; i++) { var lxs = x0 + w * (0.26 + i * 0.07); ctx.moveTo(lxs, y0 + h * 0.42); ctx.lineTo(lxs + w * 0.07, y0 + h * 0.18); ctx.moveTo(lxs + w * 0.07, y0 + h * 0.42); ctx.lineTo(lxs, y0 + h * 0.18); }
        ctx.stroke(); ctx.strokeStyle = INK;
        break;
      }
      case 'duck': {
        var dr = M.min(h * 0.5, w * 0.22), dhx = x0 + w - dr * 1.15, dhy = y0 + dr * 0.75;
        ctx.beginPath(); ctx.moveTo(x0, y0 + h * 0.25); ctx.quadraticCurveTo(x0 + w * 0.1, yb + 2, x0 + w * 0.45, yb);
        ctx.quadraticCurveTo(x0 + w, yb + 2, x0 + w - dr * 0.4, y0 + h * 0.4); ctx.lineTo(x0 + w * 0.3, y0 + h * 0.35); ctx.closePath(); fs(ctx, '#ffd93d');
        ell(ctx, x0 + w * 0.45, y0 + h * 0.55, w * 0.16, h * 0.2, -0.15); fs(ctx, '#f2c200');
        ell(ctx, dhx, dhy, dr, dr); fs(ctx, '#ffd93d');
        ell(ctx, dhx + dr * 1.0, dhy + dr * 0.2, dr * 0.55, dr * 0.26, 0.1); fs(ctx, '#ff8a2e');
        googly(ctx, dhx + dr * 0.25, dhy - dr * 0.2, dr * 0.32, 0.5, 0.1);
        showFace = 0;
        break;
      }
      case 'pillow':
        ctx.beginPath(); ctx.moveTo(x0 + 8, y0 + 4);
        ctx.quadraticCurveTo(x, y0 + 10, x0 + w - 8, y0 + 4); ctx.quadraticCurveTo(x0 + w - 6, y0 + h / 2, x0 + w - 8, yb - 4);
        ctx.quadraticCurveTo(x, yb - 8, x0 + 8, yb - 4); ctx.quadraticCurveTo(x0 + 6, y0 + h / 2, x0 + 8, y0 + 4); ctx.closePath(); fs(ctx, '#d4c6ff');
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6; ell(ctx, x0 + w * 0.28, y0 + h * 0.36, w * 0.12, h * 0.12); ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = 2; ctx.setLineDash(DASH5); rrect(ctx, x0 + 12, y0 + 8, w - 24, h - 16, 8); ctx.stroke(); ctx.setLineDash(NO_DASH);
        if (!showFace) showFace = 1;
        break;
      case 'donut':
        rrect(ctx, x0, y0, w, h, h / 2); fs(ctx, '#e8a95e');
        ctx.beginPath(); ctx.moveTo(x0 + 2, y0 + h * 0.5);
        ctx.quadraticCurveTo(x0, y0, x0 + h * 0.5, y0);
        ctx.lineTo(x0 + w - h * 0.5, y0); ctx.quadraticCurveTo(x0 + w, y0, x0 + w - 2, y0 + h * 0.5);
        n = M.max(2, M.round(w / 26));
        for (i = n; i > 0; i--) { var dxx = x0 + w * (i - 0.5) / n; ctx.lineTo(dxx + 6, y0 + h * 0.5); ctx.quadraticCurveTo(dxx, y0 + h * (0.75 + hash(i, 11) * 0.2), dxx - 6, y0 + h * 0.5); }
        ctx.closePath(); fs(ctx, '#ff7ac8');
        ctx.lineWidth = 3;
        for (var cc = 0; cc < 4; cc++) {
          ctx.strokeStyle = SPRINKLE[cc]; ctx.beginPath();
          for (i = cc; i < M.floor(w / 10); i += 4) { var spx = x0 + 10 + i * 10 + hash(i, 1) * 5, spy = y0 + 5 + hash(i, 2) * (h * 0.28); ctx.moveTo(spx, spy); ctx.lineTo(spx + 4, spy + 2); }
          ctx.stroke();
        }
        ctx.strokeStyle = INK;
        break;
      case 'melon':
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.bezierCurveTo(x0 + w, yb, x0 + w * 0.75, yb, x, yb); ctx.bezierCurveTo(x0 + w * 0.25, yb, x0, yb, x0, y0); ctx.closePath(); fs(ctx, '#3aa845');
        ctx.beginPath(); ctx.moveTo(x0 + 5, y0); ctx.lineTo(x0 + w - 5, y0); ctx.bezierCurveTo(x0 + w - 5, yb - 6, x0 + w * 0.75, yb - 6, x, yb - 6); ctx.bezierCurveTo(x0 + w * 0.25, yb - 6, x0 + 5, yb - 6, x0 + 5, y0); ctx.fillStyle = '#e4f8b8'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x0 + 9, y0); ctx.lineTo(x0 + w - 9, y0); ctx.bezierCurveTo(x0 + w - 9, yb - 10, x0 + w * 0.75, yb - 10, x, yb - 10); ctx.bezierCurveTo(x0 + w * 0.25, yb - 10, x0 + 9, yb - 10, x0 + 9, y0); ctx.fillStyle = '#ff5a6e'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke();
        ctx.fillStyle = INK;
        for (i = 0; i < M.floor(w / 30); i++) { ell(ctx, x0 + 22 + i * 30, y0 + h * (0.3 + hash(i, 6) * 0.25), 2.2, 3.6, 0.3); ctx.fill(); }
        break;
      case 'pizza':
        rrect(ctx, x0, y0 + h * 0.35, w, h * 0.65, h * 0.3); fs(ctx, '#f0c070');
        ctx.beginPath(); ctx.moveTo(x0 + 4, y0 + h * 0.2); ctx.lineTo(x0 + w - h * 0.6, y0 + h * 0.2);
        for (i = M.floor((w - h) / 24); i > 0; i--) { var px = x0 + i * 24; ctx.lineTo(px + 5, y0 + h * 0.62); ctx.quadraticCurveTo(px, y0 + h * 0.98, px - 5, y0 + h * 0.62); }
        ctx.lineTo(x0 + 2, y0 + h * 0.6); ctx.closePath(); fs(ctx, '#ffd84f');
        rrect(ctx, x0 + w - h * 0.95, y0, h * 0.95, h, h * 0.45); fs(ctx, '#d9903f');
        ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2;
        for (i = 0; i < M.floor((w - h) / 34); i++) {
          var ox = x0 + 18 + i * 34;
          if (i % 2) { ell(ctx, ox, y0 + h * 0.36, 5, 3.4); ctx.fillStyle = INK; ctx.fill(); ell(ctx, ox, y0 + h * 0.36, 1.6, 1.2); ctx.fillStyle = '#ffd84f'; ctx.fill(); }
          else { ctx.beginPath(); ctx.arc(ox, y0 + h * 0.42, 5, M.PI, TAU); ctx.strokeStyle = '#3aa845'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = INK; }
        }
        break;
      case 'gamepad': {
        var gr = h * 0.62;
        ctx.beginPath(); ctx.moveTo(x0 + gr, y0 + 2); ctx.lineTo(x0 + w - gr, y0 + 2);
        ctx.quadraticCurveTo(x0 + w + 2, y0, x0 + w, yb - 2); ctx.quadraticCurveTo(x0 + w - gr * 0.5, yb + 4, x0 + w - gr * 1.7, yb - h * 0.22);
        ctx.lineTo(x0 + gr * 1.7, yb - h * 0.22); ctx.quadraticCurveTo(x0 + gr * 0.5, yb + 4, x0, yb - 2); ctx.quadraticCurveTo(x0 - 2, y0, x0 + gr, y0 + 2);
        ctx.closePath(); fs(ctx, '#7a5cff');
        var dx0 = x0 + M.max(gr * 0.9, w * 0.16), dy0 = y0 + h * 0.45, ds = h * 0.16;
        ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
        rrect(ctx, dx0 - ds * 2.2, dy0 - ds * 0.7, ds * 4.4, ds * 1.4, 2); ctx.fill(); ctx.stroke();
        rrect(ctx, dx0 - ds * 0.7, dy0 - ds * 2.2, ds * 1.4, ds * 4.4, 2); ctx.fill(); ctx.stroke();
        var bx0 = x0 + w - M.max(gr * 0.9, w * 0.16);
        for (i = 0; i < 4; i++) { ell(ctx, bx0 + PAD_DX[i] * ds, dy0 + PAD_DY[i] * ds, ds * 0.8, ds * 0.8); fs(ctx, PAD_COL[i]); }
        if (w > 120) { googly(ctx, x - h * 0.4, y0 + h * 0.42, h * 0.18, 0.3, 0.2); googly(ctx, x + h * 0.4, y0 + h * 0.42, h * 0.18, 0.3, 0.2); }
        showFace = 0;
        break;
      }
      case 'toaster':
        rrect(ctx, x0, y0 + h * 0.16, w, h * 0.84, h * 0.3); fs(ctx, '#cdd8e6');
        ctx.fillStyle = '#f2c27b';
        n = M.max(1, M.min(3, M.floor(w / 80)));
        for (i = 0; i < n; i++) { var tx = x0 + w * (i + 0.5) / n; rrect(ctx, tx - M.min(26, w / n * 0.3), y0 - 2 - M.abs(M.sin(t * 5 + i)) * 4, M.min(52, w / n * 0.6), h * 0.36, 6); fs(ctx, '#f2c27b'); }
        rrect(ctx, x0, y0 + h * 0.16, w, h * 0.84, h * 0.3); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; rrect(ctx, x0 + 8, y0 + h * 0.28, M.max(6, w * 0.06), h * 0.5, 4); ctx.fill();
        rrect(ctx, x0 + w - 4, y0 + h * 0.4, 9, 7, 3); fs(ctx, '#ff4f6d');
        googly(ctx, x - M.min(22, w * 0.12), y0 + h * 0.5, M.min(9, h * 0.22), M.sin(t * 2), 0.2);
        googly(ctx, x + M.min(22, w * 0.12), y0 + h * 0.48, M.min(8, h * 0.2), M.sin(t * 2), 0.2);
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 10, y0 + h * 0.74); ctx.quadraticCurveTo(x, y0 + h * 0.9, x + 10, y0 + h * 0.74); ctx.stroke();
        showFace = 0;
        break;
      case 'cactus': {
        var potTop = y0 + h * 0.45;
        n = M.max(1, M.min(4, M.round(w / 70)));
        for (i = 0; i < n; i++) {
          var cx2 = x0 + w * (i + 0.5) / n, cw = M.min(26, w / n * 0.42), ch = h * (0.62 + hash(i, 3) * 0.3);
          rrect(ctx, cx2 - cw / 2, potTop - ch + 6, cw, ch, cw / 2); ctx.lineWidth = 2.6; fs(ctx, '#5fc04a');
          ctx.beginPath(); ctx.moveTo(cx2 - cw / 2, potTop - ch * 0.4); ctx.lineTo(cx2 - cw / 2 - 5, potTop - ch * 0.5);
          ctx.moveTo(cx2 + cw / 2, potTop - ch * 0.6); ctx.lineTo(cx2 + cw / 2 + 5, potTop - ch * 0.7); ctx.stroke();
          if (i === M.floor(n / 2)) { ell(ctx, cx2, potTop - ch + 6, 6, 5); fs(ctx, '#ff7ac8'); }
        }
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, potTop); ctx.lineTo(x0 + w, potTop); ctx.lineTo(x0 + w - M.min(14, w * 0.08), yb); ctx.lineTo(x0 + M.min(14, w * 0.08), yb); ctx.closePath(); fs(ctx, '#e0784a');
        rrect(ctx, x0 - 3, potTop - 3, w + 6, h * 0.16, 4); fs(ctx, '#f39a66');
        googly(ctx, x - M.min(16, w * 0.1), potTop + h * 0.3, M.min(6.5, h * 0.15), 0.4, 0.2);
        googly(ctx, x + M.min(16, w * 0.1), potTop + h * 0.3, M.min(6, h * 0.14), 0.4, 0.2);
        showFace = 0;
        break;
      }
      default:
        rrect(ctx, x0, y0, w, h, 8); fs(ctx, '#ccc');
    }
    if (showFace && w > 50) face(ctx, x, y0 + h * 0.5, h, w, showFace, t);
  };

  /* ------------------------------------------------------------- eaters */
  var EATER_ART = {
    hippo: { body: '#a66cf0', dark: '#7a45c8', light: '#d6b4ff', shape: 'round', top: 'ears', teeth: 'block', extra: 'nostrils' },
    rex: { body: '#5fcf4a', dark: '#3d9a2f', light: '#c2f59a', shape: 'round', top: 'spikes', teeth: 'zig', extra: 'arms' },
    robot: { body: '#a9bad0', dark: '#6f819b', light: '#dde7f3', shape: 'square', top: 'antenna', teeth: 'bars', eyes: 'led', extra: 'bolts' },
    shark: { body: '#4f9bff', dark: '#2f6fd0', light: '#eef6ff', shape: 'round', top: 'fin', teeth: 'shark', extra: 'gills' },
    fluffy: { body: '#4fc8ff', dark: '#2a98d0', light: '#b4ecff', shape: 'fluffy', top: 'horns', teeth: 'buck', extra: 'cheeks' },
    alien: { body: '#8fe04a', dark: '#5aa82a', light: '#d6f9a8', shape: 'round', top: 'antennae', teeth: 'none', eyes: 3, extra: 'spots' },
    walrus: { body: '#b0825a', dark: '#7d5534', light: '#e4c7a2', shape: 'round', top: 'hair', teeth: 'tusks', extra: 'mustache' }
  };
  function headPath(ctx, a, x, y, r) {
    if (a.shape === 'square') { rrect(ctx, x - r, y - r * 0.85, r * 2, r * 1.6, r * 0.32); return; }
    if (a.shape === 'fluffy') {
      ctx.beginPath();
      var n = 22;
      for (var i = 0; i <= n; i++) {
        var an = i / n * TAU, rr = r * (i % 2 ? 1.06 : 0.96), px = x + M.cos(an) * rr * 1.04, py = y + M.sin(an) * rr * 0.88;
        if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); return;
    }
    ell(ctx, x, y, r * 1.05, r * 0.88);
  }
  // A giant face with its mouth in the lower half. o: { open 0..1, t, look {x,y}, happy }.
  ST.drawEater = function (ctx, id, x, y, r, o) {
    o = o || NO_OPT;
    var a = EATER_ART[id] || EATER_ART.hippo, open = M.max(0, M.min(1, o.open || 0)), t = o.t || 0;
    var lw = M.max(3, r * 0.035), look = o.look || LOOK0;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
    var my = y + r * 0.34, mrx = r * 0.76, mry = r * (0.06 + 0.5 * open), mcy = my + mry * 0.7;
    // things behind the head
    if (a.top === 'fin') { ctx.beginPath(); ctx.moveTo(x - r * 0.35, y - r * 0.7); ctx.quadraticCurveTo(x + r * 0.1, y - r * 1.55, x + r * 0.55, y - r * 1.4); ctx.quadraticCurveTo(x + r * 0.3, y - r * 1.1, x + r * 0.35, y - r * 0.7); ctx.closePath(); fs(ctx, a.dark); }
    if (a.top === 'spikes') { ctx.beginPath(); for (var s = -3; s <= 3; s++) { var sx = x + s * r * 0.24; ctx.moveTo(sx - r * 0.12, y - r * 0.8 + M.abs(s) * r * 0.05); ctx.lineTo(sx, y - r * 1.12 + M.abs(s) * r * 0.08); ctx.lineTo(sx + r * 0.12, y - r * 0.8 + M.abs(s) * r * 0.05); } fs(ctx, a.dark); }
    if (a.top === 'horns') for (var hs = -1; hs <= 1; hs += 2) { ctx.beginPath(); ctx.moveTo(x + hs * r * 0.45, y - r * 0.7); ctx.quadraticCurveTo(x + hs * r * 0.75, y - r * 1.3, x + hs * r * 0.95, y - r * 1.2); ctx.quadraticCurveTo(x + hs * r * 0.75, y - r * 0.95, x + hs * r * 0.7, y - r * 0.6); ctx.closePath(); fs(ctx, '#fff3b0'); }
    if (a.top === 'antenna') { ctx.beginPath(); ctx.moveTo(x, y - r * 0.85); ctx.lineTo(x, y - r * 1.25); ctx.stroke(); ell(ctx, x, y - r * 1.3, r * 0.1, r * 0.1); fs(ctx, M.sin(t * 8) > 0 ? '#ff4f6d' : '#ffe14f'); }
    if (a.top === 'antennae') for (var as = -1; as <= 1; as += 2) { ctx.beginPath(); ctx.moveTo(x + as * r * 0.3, y - r * 0.75); ctx.quadraticCurveTo(x + as * r * 0.4, y - r * 1.2, x + as * r * 0.6 + M.sin(t * 4 + as) * r * 0.05, y - r * 1.3); ctx.stroke(); ell(ctx, x + as * r * 0.6 + M.sin(t * 4 + as) * r * 0.05, y - r * 1.3, r * 0.09, r * 0.09); fs(ctx, '#ff7ac8'); }
    if (a.top === 'ears') for (var es = -1; es <= 1; es += 2) { ell(ctx, x + es * r * 0.72, y - r * 0.68, r * 0.16, r * 0.13, es * 0.5); fs(ctx, a.body); ell(ctx, x + es * r * 0.72, y - r * 0.68, r * 0.08, r * 0.06, es * 0.5); ctx.fillStyle = '#ff9ccf'; ctx.fill(); }
    if (a.extra === 'arms') for (var ar = -1; ar <= 1; ar += 2) { ctx.beginPath(); ctx.moveTo(x + ar * r * 0.7, y + r * 0.6); ctx.quadraticCurveTo(x + ar * r * 1.05, y + r * 0.6 + M.sin(t * 9 + ar) * r * 0.06, x + ar * r * 1.1, y + r * 0.42); ctx.lineWidth = r * 0.12; ctx.stroke(); ctx.lineWidth = r * 0.07; ctx.strokeStyle = a.body; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = lw; }
    // the lower jaw drops as the mouth opens
    var jy = my + r * 0.12 + open * r * 0.62;
    if (a.shape === 'square') { rrect(ctx, x - r * 0.82, jy - r * 0.2, r * 1.64, r * 0.5, r * 0.2); fs(ctx, a.body); }
    else { ell(ctx, x, jy, r * 0.86, r * 0.34); fs(ctx, a.teeth === 'shark' ? a.light : a.body); }
    headPath(ctx, a, x, y, r); fs(ctx, a.body);
    if (a.shape !== 'square') { ell(ctx, x, y + r * 0.28, r * 0.88, r * 0.46); ctx.fillStyle = a.light; ctx.fill(); }
    // the mouth
    if (open > 0.04) {
      ell(ctx, x, mcy, mrx, mry); fs(ctx, '#5a1428');
      ell(ctx, x, mcy + mry * 0.55, mrx * 0.55, mry * 0.38); ctx.fillStyle = '#ff6f8f'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.lineWidth = M.max(2, lw * 0.6);
      var top = mcy - mry, bot = mcy + mry, i, n, tx;
      if (a.teeth === 'block') {
        rrect(ctx, x - r * 0.3, top - 2, r * 0.22, r * 0.2, r * 0.04); fs(ctx, '#fff'); rrect(ctx, x + r * 0.08, top - 2, r * 0.22, r * 0.2, r * 0.04); fs(ctx, '#fff');
        ctx.beginPath(); ctx.moveTo(x - r * 0.55, bot - r * 0.02); ctx.lineTo(x - r * 0.48, bot - r * 0.22); ctx.lineTo(x - r * 0.42, bot - r * 0.02); ctx.closePath(); fs(ctx, '#fff');
        ctx.beginPath(); ctx.moveTo(x + r * 0.42, bot - r * 0.02); ctx.lineTo(x + r * 0.48, bot - r * 0.22); ctx.lineTo(x + r * 0.55, bot - r * 0.02); ctx.closePath(); fs(ctx, '#fff');
      } else if (a.teeth === 'zig' || a.teeth === 'shark') {
        n = a.teeth === 'shark' ? 9 : 7;
        ctx.beginPath();
        for (i = 0; i < n; i++) { tx = x - mrx * 0.8 + mrx * 1.6 * (i + 0.5) / n; var k = 1 - M.abs(tx - x) / mrx, d = r * 0.1 * (0.5 + k); ctx.moveTo(tx - r * 0.07, top + (1 - k) * mry * 0.3); ctx.lineTo(tx, top + d + (1 - k) * mry * 0.3); ctx.lineTo(tx + r * 0.07, top + (1 - k) * mry * 0.3); }
        for (i = 0; i < n - 1; i++) { tx = x - mrx * 0.7 + mrx * 1.4 * (i + 0.5) / (n - 1); var k2 = 1 - M.abs(tx - x) / mrx, d2 = r * 0.09 * (0.5 + k2); ctx.moveTo(tx - r * 0.06, bot - (1 - k2) * mry * 0.3); ctx.lineTo(tx, bot - d2 - (1 - k2) * mry * 0.3); ctx.lineTo(tx + r * 0.06, bot - (1 - k2) * mry * 0.3); }
        fs(ctx, '#fff');
      } else if (a.teeth === 'bars') {
        for (i = -2; i <= 2; i++) { rrect(ctx, x + i * r * 0.2 - r * 0.07, top - 1, r * 0.14, r * 0.14, 3); fs(ctx, '#e6eef8'); }
      } else if (a.teeth === 'buck') {
        rrect(ctx, x - r * 0.17, top - 3, r * 0.16, r * 0.24, r * 0.05); fs(ctx, '#fff'); rrect(ctx, x + r * 0.01, top - 3, r * 0.16, r * 0.24, r * 0.05); fs(ctx, '#fff');
      }
    } else {
      ctx.beginPath(); ctx.moveTo(x - r * 0.55, my); ctx.quadraticCurveTo(x, my + r * 0.3, x + r * 0.55, my); ctx.lineWidth = lw * 1.2; ctx.stroke(); ctx.lineWidth = lw;
    }
    if (a.teeth === 'tusks') for (var ts = -1; ts <= 1; ts += 2) {
      ctx.beginPath(); ctx.moveTo(x + ts * r * 0.36, my - r * 0.02); ctx.quadraticCurveTo(x + ts * r * 0.42, my + r * 0.5, x + ts * r * 0.3, my + r * 0.7);
      ctx.quadraticCurveTo(x + ts * r * 0.3, my + r * 0.3, x + ts * r * 0.22, my); ctx.closePath(); fs(ctx, '#fffbea');
    }
    // the face on the upper head
    if (a.extra === 'nostrils') { ell(ctx, x - r * 0.2, y + r * 0.08, r * 0.07, r * 0.045); ctx.fillStyle = a.dark; ctx.fill(); ell(ctx, x + r * 0.2, y + r * 0.08, r * 0.07, r * 0.045); ctx.fill(); }
    if (a.extra === 'mustache') {
      ctx.beginPath(); ctx.moveTo(x, my - r * 0.18);
      ctx.bezierCurveTo(x - r * 0.25, my - r * 0.34, x - r * 0.7, my - r * 0.2, x - r * 0.62, my + r * 0.02);
      ctx.bezierCurveTo(x - r * 0.4, my - r * 0.06, x - r * 0.2, my - r * 0.02, x, my - r * 0.06);
      ctx.bezierCurveTo(x + r * 0.2, my - r * 0.02, x + r * 0.4, my - r * 0.06, x + r * 0.62, my + r * 0.02);
      ctx.bezierCurveTo(x + r * 0.7, my - r * 0.2, x + r * 0.25, my - r * 0.34, x, my - r * 0.18);
      fs(ctx, '#f4f1ea');
      ell(ctx, x, my - r * 0.26, r * 0.09, r * 0.07); fs(ctx, '#5a3a24');
    }
    if (a.extra === 'gills') { ctx.beginPath(); for (var g = 0; g < 3; g++) { ctx.moveTo(x - r * (0.78 - g * 0.08), y - r * 0.05); ctx.quadraticCurveTo(x - r * (0.86 - g * 0.08), y + r * 0.08, x - r * (0.78 - g * 0.08), y + r * 0.2); ctx.moveTo(x + r * (0.78 - g * 0.08), y - r * 0.05); ctx.quadraticCurveTo(x + r * (0.86 - g * 0.08), y + r * 0.08, x + r * (0.78 - g * 0.08), y + r * 0.2); } ctx.stroke(); }
    if (a.extra === 'spots') { ctx.fillStyle = a.dark; for (var sp = 0; sp < 12; sp += 3) { ell(ctx, x + SPOTS[sp] * r, y + SPOTS[sp + 1] * r, SPOTS[sp + 2] * r, SPOTS[sp + 2] * r); ctx.fill(); } }
    if (a.extra === 'bolts') for (var bs = -1; bs <= 1; bs += 2) { ell(ctx, x + bs * r * 1.04, y, r * 0.1, r * 0.16); fs(ctx, a.dark); }
    if (a.extra === 'cheeks' || a.top === 'ears' || a.top === 'hair') { ctx.fillStyle = 'rgba(255,110,160,0.45)'; ell(ctx, x - r * 0.68, y + r * 0.12, r * 0.13, r * 0.08); ctx.fill(); ell(ctx, x + r * 0.68, y + r * 0.12, r * 0.13, r * 0.08); ctx.fill(); }
    if (a.top === 'hair') { ctx.beginPath(); for (var hh = -1; hh <= 1; hh++) { ctx.moveTo(x + hh * r * 0.12, y - r * 0.86); ctx.quadraticCurveTo(x + hh * r * 0.2 + r * 0.1, y - r * 1.15, x + hh * r * 0.16 - r * 0.04, y - r * 1.05); } ctx.lineWidth = lw * 0.8; ctx.stroke(); ctx.lineWidth = lw; }
    // eyes
    var eyeY = y - r * 0.42, er = r * 0.2, happy = o.happy;
    var eyes = a.eyes === 3 ? EYES3 : EYES2;
    for (var e = 0; e < eyes.length; e++) {
      var ex = x + eyes[e] * r, ey = eyeY - (a.eyes === 3 && e === 1 ? r * 0.12 : 0), err = a.eyes === 3 ? er * 0.82 : er;
      if (a.top === 'ears') { ell(ctx, ex, ey + er * 0.1, err * 1.25, err * 1.15); fs(ctx, a.body); }
      if (happy) {
        ctx.beginPath(); ctx.moveTo(ex - err * 0.7, ey + err * 0.2); ctx.quadraticCurveTo(ex, ey - err * 0.9, ex + err * 0.7, ey + err * 0.2); ctx.lineWidth = lw * 1.3; ctx.stroke(); ctx.lineWidth = lw;
      } else if (a.eyes === 'led') {
        rrect(ctx, ex - err, ey - err * 0.7, err * 2, err * 1.4, err * 0.4); fs(ctx, '#203048');
        rrect(ctx, ex - err * 0.55 + look.x * err * 0.35, ey - err * 0.35 + look.y * err * 0.25, err * 1.1, err * 0.7, err * 0.25); ctx.fillStyle = '#4fe8ff'; ctx.fill();
      } else googly(ctx, ex, ey, err, look.x, look.y);
    }
    if (a.top === 'hair' && !happy) {
      // grandpa's round glasses
      ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.arc(x - r * 0.36, eyeY, er * 1.25, 0, TAU); ctx.moveTo(x + r * 0.36 + er * 1.25, eyeY); ctx.arc(x + r * 0.36, eyeY, er * 1.25, 0, TAU);
      ctx.moveTo(x - r * 0.36 + er * 1.25, eyeY); ctx.lineTo(x + r * 0.36 - er * 1.25, eyeY); ctx.stroke(); ctx.lineWidth = lw;
    }
  };

  /* -------------------------------------------------------------- icons */
  ST.star = function (ctx, x, y, r, fill) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var an = -M.PI / 2 + i * M.PI / 5, rr = i % 2 ? r * 0.48 : r; ctx.lineTo(x + M.cos(an) * rr, y + M.sin(an) * rr); }
    ctx.closePath(); ctx.fillStyle = fill || '#ffd23f'; ctx.fill(); ctx.lineWidth = M.max(2, r * 0.16); ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  };
  ST.heart = function (ctx, x, y, s, fill) {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.42);
    ctx.bezierCurveTo(x - s * 0.9, y - s * 0.1, x - s * 0.45, y - s * 0.75, x, y - s * 0.28);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 0.75, x + s * 0.9, y - s * 0.1, x, y + s * 0.42); ctx.closePath();
    ctx.fillStyle = fill || '#ff4f6d'; ctx.fill(); ctx.lineWidth = M.max(2, s * 0.12); ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  };
  ST.hand = function (ctx, x, y, s) {
    // a white cartoon glove pointing down
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = M.max(3, s * 0.07);
    rrect(ctx, x - s * 0.1, y - s * 0.62, s * 0.2, s * 0.62, s * 0.1); fs(ctx, '#fff');
    rrect(ctx, x - s * 0.36, y - s * 1.08, s * 0.72, s * 0.56, s * 0.22); fs(ctx, '#fff');
    ctx.beginPath(); ctx.moveTo(x - s * 0.18, y - s * 0.75); ctx.lineTo(x - s * 0.18, y - s * 0.56); ctx.moveTo(x + s * 0.18, y - s * 0.75); ctx.lineTo(x + s * 0.18, y - s * 0.56); ctx.stroke();
    rrect(ctx, x - s * 0.42, y - s * 1.26, s * 0.84, s * 0.22, s * 0.08); fs(ctx, '#ff5f8a');
  };

  /* ---------------------------------------------------------- the scene */
  var THEMES = {
    canteen: { sky: ['#8fd8ff', '#dff5ff'], wall: '#ffe2a8', wall2: '#f7cd84', counter: '#ff9a3d', counter2: '#e0702a', counterTop: '#ffc070' },
    clouds: { sky: ['#5fb8ff', '#d4f0ff'], counter: '#ffffff' },
    space: { sky: ['#140d3a', '#3b1f78'], counter: '#9fb2cc', counter2: '#6d7f9c', counterTop: '#dfe8f5', neon: ['#ff4fd8', '#4ff0ff'] }
  };
  ST.THEMES = THEMES;
  // Endless sky colours by altitude: kitchen day sky, high sky, space, the candy galaxy.
  var ALT = [[0, '#8fd8ff', '#dff5ff'], [900, '#5aa8ff', '#bfe6ff'], [1700, '#2a3f9a', '#6a8fe0'], [2400, '#140d3a', '#3b1f78'], [3400, '#4a1470', '#b0409e'], [4600, '#5a1a7a', '#ff7ac8']];
  function mix(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = ((pa >> 16) * (1 - k) + (pb >> 16) * k) | 0, g = (((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k) | 0, bl = ((pa & 255) * (1 - k) + (pb & 255) * k) | 0;
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  var ALT_BANDS = ALT[ALT.length - 1][0] / 25;
  function altSky(A) {
    for (var i = 0; i < ALT.length - 1; i++) if (A < ALT[i + 1][0]) { var k = (A - ALT[i][0]) / (ALT[i + 1][0] - ALT[i][0]); return [mix(ALT[i][1], ALT[i + 1][1], k), mix(ALT[i][2], ALT[i + 1][2], k)]; }
    return [ALT[ALT.length - 1][1], ALT[ALT.length - 1][2]];
  }
  ST.altitudeName = function (A) { return A < 700 ? 0 : A < 1700 ? 1 : A < 3400 ? 2 : 3; };

  ST.createView = function (ctx) {
    var v = { calm: false };
    var grads = {}, starTile = null, altGrads = [], po = { t: 0, face: 0, zzz: false }, eo = { open: 0, t: 0, look: LOOK0, happy: false };
    // The one options object each piece and eater draw call gets (drawPiece/drawEater never keep it).
    function pieceOpt(t, face, zzz) { po.t = t; po.face = face; po.zzz = zzz; return po; }
    function eaterOpt(open, t, look, happy) { eo.open = open; eo.t = t; eo.look = look; eo.happy = happy; return eo; }
    function grad(key, a, b) {
      if (!grads[key]) { var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); grads[key] = g; }
      return grads[key];
    }
    function stars() {
      if (starTile) return starTile;
      var c = document.createElement('canvas'); c.width = 512; c.height = 512;
      var g = c.getContext('2d'), r = ST.rng(77);
      for (var i = 0; i < 70; i++) {
        var s = r() < 0.15 ? 2.6 : 1.4;
        g.fillStyle = r() < 0.3 ? '#ffe9a8' : '#ffffff'; g.globalAlpha = 0.5 + r() * 0.5;
        g.beginPath(); g.arc(r() * 512, r() * 512, s, 0, TAU); g.fill();
      }
      g.globalAlpha = 1; g.fillStyle = '#fff';
      for (var j = 0; j < 6; j++) { var x = r() * 512, y = r() * 512; g.fillRect(x - 6, y - 1, 12, 2); g.fillRect(x - 1, y - 6, 2, 12); }
      return (starTile = c);
    }
    function starField(x0, x1, cam, alpha) {
      var tile = stars(), off = ((cam * 0.15) % 512 + 512) % 512;
      ctx.globalAlpha = alpha;
      for (var y = -512 + off; y < H; y += 512) for (var x = x0 - (x0 % 512); x < x1; x += 512) ctx.drawImage(tile, x, y);
      ctx.globalAlpha = 1;
    }
    function cloud(x, y, s, fill) {
      ctx.beginPath();
      ctx.arc(x - s * 0.9, y + s * 0.15, s * 0.55, 0, TAU); ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.75, 0, TAU);
      ctx.arc(x + s * 0.55, y - s * 0.05, s * 0.6, 0, TAU); ctx.arc(x + s * 1.1, y + s * 0.25, s * 0.42, 0, TAU);
      ctx.rect(x - s * 0.9, y + s * 0.1, s * 2, s * 0.58);
      ctx.fillStyle = fill; ctx.fill();
    }
    function clouds(x0, x1, cam, alpha, t) {
      ctx.globalAlpha = alpha;
      var span = 1100, off = cam * 0.35;
      for (var i = 0; i < 9; i++) {
        var cy = ((hash(i, 1) * span + off) % span + span) % span - 180, cx = x0 + ((hash(i, 2) * (x1 - x0) + t * (8 + hash(i, 3) * 10)) % (x1 - x0 + 300)) - 150;
        cloud(cx, cy, 34 + hash(i, 4) * 40, i % 3 ? '#ffffff' : '#f0f8ff');
      }
      ctx.globalAlpha = 1;
    }
    function planets(x0, x1, cam, candy) {
      var off = cam * 0.22;
      for (var i = 0; i < 4; i++) {
        var py = ((hash(i, 7) * 1200 + off) % 1200) - 200, px = x0 + hash(i, 8) * (x1 - x0), pr = 22 + hash(i, 9) * 34;
        ctx.lineWidth = 3; ctx.strokeStyle = INK;
        if (candy) {
          ell(ctx, px, py, pr, pr); fs(ctx, CANDY[i]);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = pr * 0.25; ctx.beginPath(); ctx.arc(px, py, pr * 0.55, 0, M.PI * 1.4); ctx.stroke();
          ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py + pr); ctx.lineTo(px, py + pr * 2.2); ctx.stroke();
        } else {
          ell(ctx, px, py, pr, pr); fs(ctx, PLANETS[i]);
          if (i % 2 === 0) { ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.4, -0.3, 0.1, M.PI - 0.1); ctx.lineWidth = 4; ctx.strokeStyle = '#ffe9a8'; ctx.stroke(); }
        }
      }
    }
    function canteenWall(x0, x1, cam, th, t) {
      var top = ST.PLATE_Y - 830 + cam * 0.6;
      if (top > H) return;
      ctx.fillStyle = th.wall; ctx.fillRect(x0, top, x1 - x0, H - top);
      // tiles, one path
      ctx.strokeStyle = th.wall2; ctx.lineWidth = 3; ctx.beginPath();
      var ty = top + 300, tyOff = (cam * 0.6) % 64;
      for (var y = M.max(ty, -64 + tyOff); y < H; y += 64) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      for (var x = x0 + 32; x < x1; x += 64) { ctx.moveTo(x, M.max(ty, 0)); ctx.lineTo(x, H); }
      ctx.stroke();
      // a stripe, a window with sky and a menu board
      ctx.fillStyle = '#ff7a59'; ctx.fillRect(x0, ty - 18, x1 - x0, 18);
      ctx.lineWidth = 6; ctx.strokeStyle = INK;
      var wx = x0 + (x1 - x0) * 0.08, wy = top + 330, ww = 250, wh = 190;
      if (x1 - x0 > 900) {
        rrect(ctx, wx, wy, ww, wh, 18); ctx.fillStyle = '#9fe0ff'; ctx.fill();
        ctx.save(); ctx.clip(); cloud(wx + 70 + (t * 6) % 240 - 60, wy + 70, 26, '#fff'); cloud(wx + 190 - (t * 4) % 300 + 60, wy + 130, 20, '#fff'); ctx.restore();
        rrect(ctx, wx, wy, ww, wh, 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
        var bx = x1 - 300, by = top + 310;
        rrect(ctx, bx, by, 230, 170, 14); ctx.fillStyle = '#2f6b4a'; ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(bx + 40, by + 60); ctx.lineTo(bx + 120, by + 60); ctx.moveTo(bx + 40, by + 92); ctx.lineTo(bx + 150, by + 92); ctx.moveTo(bx + 40, by + 124); ctx.lineTo(bx + 100, by + 124); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx + 180, by + 90, 22, M.PI, TAU); ctx.lineTo(bx + 202, by + 100); ctx.lineTo(bx + 158, by + 100); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = 6;
      }
      // the roof edge with an awning (seen in endless as the tower leaves the canteen)
      ctx.fillStyle = '#ff5f6d'; ctx.beginPath(); ctx.moveTo(x0, top + 20);
      for (var ax = x0; ax < x1; ax += 80) { ctx.lineTo(ax + 80, top + 20); ctx.quadraticCurveTo(ax + 40, top + 70, ax, top + 20); }
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (var bx2 = x0 + 40; bx2 < x1; bx2 += 160) { ctx.rect(bx2, top - 4, 40, 26); }
      ctx.fill();
      ctx.fillStyle = '#8a4a24'; ctx.fillRect(x0, top - 8, x1 - x0, 10);
    }
    function sky(x0, x1, theme, cam, t, endless) {
      var A = cam, th = THEMES[theme] || THEMES.canteen;
      if (endless) {
        // one gradient per 25 px band, each made the first time the camera reaches it
        var key = M.max(0, M.min(ALT_BANDS, M.round(A / 25))), ag = altGrads[key];
        if (!ag) { var c = altSky(key * 25); ag = altGrads[key] = ctx.createLinearGradient(0, 0, 0, H); ag.addColorStop(0, c[0]); ag.addColorStop(1, c[1]); }
        ctx.fillStyle = ag; ctx.fillRect(x0, 0, x1 - x0, H);
        var sa = M.max(0, M.min(1, (A - 1500) / 700));
        if (sa > 0) starField(x0, x1, cam, sa);
        if (A > 2200) planets(x0, x1, cam, A > 3400);
        var ca = A < 2000 ? M.min(1, A / 300) * M.max(0, M.min(1, (2000 - A) / 500)) : 0;
        if (ca > 0) clouds(x0, x1, cam, ca, t);
        canteenWall(x0, x1, cam, THEMES.canteen, t);
        return;
      }
      ctx.fillStyle = grad(theme, th.sky[0], th.sky[1]); ctx.fillRect(x0, 0, x1 - x0, H);
      if (theme === 'canteen') canteenWall(x0, x1, cam, th, t);
      else if (theme === 'clouds') clouds(x0, x1, cam + 300, 1, t);
      else { starField(x0, x1, cam, 1); planets(x0, x1, cam, false); }
    }
    // The counter and the plate, which scroll away as the camera climbs.
    function ground(x0, x1, cx, w0, theme, cam, endless) {
      var y = ST.PLATE_Y + cam;
      if (y > H + 40) return;
      var th = THEMES[endless ? 'canteen' : theme] || THEMES.canteen, k = endless ? 'canteen' : theme;
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 5;
      if (k === 'clouds') {
        cloud(cx - 70, y + 70, 120, '#ffffff'); cloud(cx + 150, y + 90, 90, '#f4fbff');
        ctx.beginPath(); ctx.moveTo(cx - 260, y + 22); ctx.lineTo(cx + 260, y + 22); ctx.lineTo(cx + 300, y + 70); ctx.lineTo(cx - 300, y + 70); ctx.closePath(); ctx.fillStyle = '#ff5f6d'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath();
        for (var i = 0; i < 6; i++) { var bx = cx - 260 + i * 87; ctx.moveTo(bx + 20, y + 22); ctx.lineTo(bx + 52, y + 22); ctx.lineTo(bx + 58, y + 70); ctx.lineTo(bx + 24, y + 70); ctx.closePath(); }
        ctx.fill();
      } else {
        ctx.fillStyle = th.counter; ctx.fillRect(x0 - 5, y + 30, x1 - x0 + 10, H - y + 20);
        ctx.fillStyle = th.counter2; ctx.fillRect(x0 - 5, y + 62, x1 - x0 + 10, 10);
        rrect(ctx, x0 - 10, y + 16, x1 - x0 + 20, 26, 10); ctx.fillStyle = th.counterTop; ctx.fill(); ctx.stroke();
        if (k === 'space') {
          ctx.fillStyle = th.neon[0]; ctx.fillRect(x0, y + 82, x1 - x0, 6); ctx.fillStyle = th.neon[1]; ctx.fillRect(x0, y + 96, x1 - x0, 6);
        } else {
          ctx.strokeStyle = th.counter2; ctx.lineWidth = 4; ctx.beginPath();
          for (var px = x0 + 60; px < x1; px += 120) { ctx.moveTo(px, y + 80); ctx.lineTo(px, H); }
          ctx.stroke(); ctx.strokeStyle = INK;
        }
      }
      // the plate
      var pw = w0 + 70;
      ctx.lineWidth = 5; ctx.strokeStyle = INK;
      ell(ctx, cx, y + 14, pw / 2, 15); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ell(ctx, cx, y + 8, pw / 2 - 26, 8); ctx.fillStyle = '#e8f1ff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#7fb0ff'; ell(ctx, cx, y + 14, pw / 2 - 8, 11); ctx.stroke();
    }

    // o: { t, theme, endless, eater, debris, sway[], squash[], hint, x0/x1 override }
    v.render = function (w, o) {
      var t = o.t || 0, n = w.towers.length;
      for (var i = 0; i < n; i++) {
        var tw = w.towers[i], x0 = n > 1 ? i * 640 : 0, x1 = n > 1 ? x0 + 640 : W;
        if (n > 1) { ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, 640, H); ctx.clip(); }
        sky(x0, x1, o.theme, tw.cam, t, o.endless);
        ground(x0, x1, tw.cx, w.spec.w0, o.theme, tw.cam, o.endless);
        drawTower(w, tw, o, t);
        if (n > 1) ctx.restore();
      }
    };
    function sy(tw, y) { return ST.PLATE_Y - y + tw.cam; }
    function drawTower(w, tw, o, t) {
      var ps = tw.pieces, last = ps.length - tw.eaten, sway = (o.sway && o.sway[tw.i]) || 0, top = tw.top || 1;
      var squash = o.squash && o.squash[tw.i];
      for (var j = 0; j < last; j++) {
        var p = ps[j], yb = sy(tw, p.y);
        if (yb < -20) break;
        if (yb - p.h > H + 10) continue;
        var rel = p.y / M.max(200, top), sx = p.x + sway * rel * rel;
        var age = w.t - p.at, sq = 1;
        if (age < 0.5 && !v.calm) sq = 1 - 0.28 * M.exp(-age * 9) * M.cos(age * 24) * (j === last - 1 ? 1 : 0.4);
        if (sq !== 1) { ctx.save(); ctx.translate(sx, yb); ctx.scale(1 / M.sqrt(sq), sq); ST.drawPiece(ctx, p.kind, 0, 0, p.w, p.h, pieceOpt(t, p.face, !v.calm)); ctx.restore(); }
        else ST.drawPiece(ctx, p.kind, sx, yb, p.w, p.h, pieceOpt(t, p.face, !v.calm));
      }
      var c = tw.cur;
      if (c && w.phase !== 'done') {
        var cyb = sy(tw, c.y), topY = sy(tw, tw.top), swayTop = sway;
        if (tw.phase === 'slide') {
          // where it would land: a soft shadow on the tower top
          var l = M.max(c.x - c.w / 2, tw.tx - tw.tw / 2), r = M.min(c.x + c.w / 2, tw.tx + tw.tw / 2);
          if (r > l) { ctx.fillStyle = 'rgba(58,34,22,0.25)'; rrect(ctx, l + swayTop, topY - 7, r - l, 8, 4); ctx.fill(); }
          if (o.guide) {
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.setLineDash(DASH10);
            ctx.beginPath(); ctx.moveTo(tw.tx + swayTop, topY - 6); ctx.lineTo(tw.tx + swayTop, cyb - c.h - 30); ctx.stroke(); ctx.setLineDash(NO_DASH);
          }
        }
        if (c.move === 'swing' && tw.phase === 'slide') {
          var pivY = sy(tw, c.base + ST.ROPE + c.h), hookY = cyb - c.h;
          ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(c.cx, pivY); ctx.lineTo(c.x, hookY - 14); ctx.stroke();
          ctx.save(); ctx.translate(c.x, hookY); ctx.rotate(-c.swing * 0.22);
          ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-c.w * 0.3, 0); ctx.lineTo(0, -16); ctx.lineTo(c.w * 0.3, 0); ctx.stroke();
          ell(ctx, 0, -16, 7, 7); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
          ST.drawPiece(ctx, c.kind, 0, c.h, c.w, c.h, pieceOpt(t, c.face, false));
          ctx.restore();
        } else {
          var wob = c.wob && tw.phase === 'slide' && !v.calm ? M.sin(t * 22) * 0.07 : 0;
          var pop = o.pop && o.pop[tw.i] ? o.pop[tw.i] : 0, s = 1 + pop * 0.25;
          ctx.save(); ctx.translate(c.x, cyb); ctx.scale(s * (1 + wob), s * (1 - wob)); if (tw.phase === 'slide' && !v.calm) ctx.rotate(c.dir * M.min(0.06, c.v / 6000));
          ST.drawPiece(ctx, c.kind, 0, 0, c.w, c.h, pieceOpt(t, c.face, false));
          ctx.restore();
          if (c.wob && tw.phase === 'slide') {
            ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath();
            for (var q = -1; q <= 1; q += 2) { var ex = c.x + q * (c.w / 2 + 10); ctx.moveTo(ex, cyb - c.h * 0.8); ctx.quadraticCurveTo(ex + q * 8, cyb - c.h * 0.5, ex, cyb - c.h * 0.2); }
            ctx.stroke();
          }
        }
      }
      // debris in this tower's world
      var db = o.debris;
      if (db) for (var d = 0; d < db.length; d++) {
        var b = db[d];
        if (b.tower !== tw.i) continue;
        ctx.save(); ctx.translate(b.x, sy(tw, b.y)); ctx.rotate(b.rot);
        ST.drawPiece(ctx, b.kind, 0, b.h / 2, b.w, b.h, pieceOpt(t, b.face, false));
        ctx.restore();
      }
      if (o.eater && w.eat && w.eat.tower === tw.i && (w.phase === 'eat' || w.phase === 'bunwait')) drawEat(w, tw, o, t);
    }
    // Where the eater's head is and how wide its mouth opens through the chomp.
    function drawEat(w, tw, o, t) {
      var e = w.eat, scale = o.eaterScale || 1, r = 205 * scale;
      var leftTop = sy(tw, ST.leftTop(tw)), aimY = leftTop - r * 0.6;
      var hx = tw.tx, hy = aimY - r * 0.35, open = 0.25;
      if (w.phase === 'bunwait' || e.phase === 'in') {
        var k = w.phase === 'bunwait' ? 0 : M.min(1, e.pt / ST.EAT_IN), ease = 1 - M.pow(1 - k, 3);
        var homeX = o.eaterHome ? o.eaterHome.x : (tw.cx > 640 ? -r * 1.3 : W + r * 1.3), homeY = o.eaterHome ? o.eaterHome.y : hy;
        hx = homeX + (hx - homeX) * ease; hy = homeY + (hy - homeY) * ease;
        open = 0.2 + 0.6 * ease;
      } else if (e.phase === 'bite') {
        var b = e.pt / ST.BITE;
        // open wide, lunge, snap shut, chew
        open = b < 0.5 ? 0.35 + b * 1.3 : b < 0.62 ? M.max(0, 1 - (b - 0.5) * 8.3) : 0.08 * M.sin((b - 0.62) * 30);
        hy += b < 0.55 ? b / 0.55 * r * 0.3 : (1 - (b - 0.55) / 0.45) * r * 0.3;
        if (e.closed) hy -= 0;
      } else if (e.phase === 'burp' || e.phase === 'gone') {
        var bp = e.pt / ST.BURP;
        open = bp < 0.5 ? M.sin(bp / 0.5 * M.PI) * 0.75 : 0;
        hy -= bp * 30;
      }
      ST.drawEater(ctx, o.eater, hx, hy, r, eaterOpt(open, t, LOOK_EAT, e.phase === 'burp' && e.pt > ST.BURP * 0.5));
    }
    // The title's idle eater, peeking in from a corner.
    v.peek = function (id, x, y, r, t, look) { ST.drawEater(ctx, id, x, y, r, eaterOpt(0.15 + 0.1 * M.sin(t * 2), t, look, false)); };
    v.cloud = cloud;
    return v;
  };
})();
