/* Ball Storm (عاصفة الكرات): everything drawn in code on one 2D canvas (1280x720 logical).
 * The backdrops and every brick and capsule are drawn once into small offscreen canvases
 * (sprites) and then only copied; all the balls of one skin go into one path per layer, so
 * hundreds of balls stay cheap. No shadows, no filters, no canvas reads.
 * BS.drawPaddle and BS.drawBallIcon also paint the previews in the shop.
 */
(function () {
  'use strict';
  var BS = window.BS, M = Math, F = BS.F, T = BS.T;
  var W = 1280, H = 720, INK = '#2a1d4e', TAU = M.PI * 2;
  var CW = F.CW, CH = F.CH, COLS = F.COLS, ROWS = F.ROWS, RAD = F.RAD;
  // brick colours: the 11 letters of the level pictures, then 3-hit, steel, gem
  var PAL = ['#ff4f6d', '#ff9a2e', '#ffd93d', '#4fdc6a', '#3fd8f0', '#4f8cff', '#b36bff', '#ff6fc4', '#f4f1ff', '#5a4aa8', '#c07a45', '#8a4dff', '#b9c2e0', '#8ff7ff'];
  BS.PAL = PAL;
  var CAPS = {
    x3: { fill: '#ff4fb8', text: '×3' }, plus: { fill: '#3ddc84', text: '+10' }, big: { fill: '#ffb627' },
    fire: { fill: '#ff5a3d' }, slow: { fill: '#9d8bff' }, sticky: { fill: '#c6e94f' }, shield: { fill: '#4fd8ff' }
  };
  BS.CAP_ART = CAPS;

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function rrect(c, x, y, w, h, r) {
    r = M.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  BS.rrect = rrect;
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function googly(c, x, y, r, px, py) {
    circle(c, x, y, r); c.fillStyle = '#fff'; c.fill(); c.lineWidth = M.max(1.5, r * 0.22); c.strokeStyle = INK; c.stroke();
    circle(c, x + px * r * 0.42, y + py * r * 0.42, r * 0.52); c.fillStyle = INK; c.fill();
  }
  BS.googly = googly;
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = M.max(1, M.ceil(w)); c.height = M.max(1, M.ceil(h)); return c; }
  // Text with a thick ink outline (canvas). rtl for Arabic.
  function label(c, str, x, y, size, color, align, rtl, weight) {
    c.font = (weight || 700) + ' ' + size + 'px Fredoka'; c.textAlign = align || 'center'; c.textBaseline = 'middle';
    c.direction = rtl ? 'rtl' : 'ltr';
    c.lineJoin = 'round'; c.lineWidth = M.max(3, size * 0.18); c.strokeStyle = INK;
    c.strokeText(str, x, y); c.fillStyle = color; c.fillText(str, x, y);
    c.direction = 'ltr';
  }
  BS.label = label;

  /* ------------------------------------------------------------- icons */
  function heart(c, x, y, s, fill) {
    c.beginPath();
    c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s * 0.6, y - s * 0.05, x - s * 0.45, y - s * 0.6, x, y - s * 0.28);
    c.bezierCurveTo(x + s * 0.45, y - s * 0.6, x + s * 0.6, y - s * 0.05, x, y + s * 0.35);
    c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
  }
  BS.heart = heart;
  function flame(c, x, y, s, outer, inner) {
    c.beginPath();
    c.moveTo(x, y - s * 0.55);
    c.bezierCurveTo(x + s * 0.5, y - s * 0.1, x + s * 0.42, y + s * 0.45, x, y + s * 0.45);
    c.bezierCurveTo(x - s * 0.42, y + s * 0.45, x - s * 0.5, y - s * 0.05, x - s * 0.12, y - s * 0.22);
    c.quadraticCurveTo(x - s * 0.05, y - s * 0.35, x, y - s * 0.55); c.closePath();
    c.fillStyle = outer; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.ellipse(x, y + s * 0.18, s * 0.17, s * 0.22, 0, 0, TAU); c.fillStyle = inner; c.fill();
  }
  // The little picture on a capsule or a power timer, centred at (x, y), about s wide.
  function powerIcon(c, kind, x, y, s) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    switch (kind) {
      case 'x3': case 'plus': label(c, CAPS[kind].text, x, y + 1, s * 0.62, '#fff'); break;
      case 'big':
        rrect(c, x - s * 0.36, y - s * 0.1, s * 0.72, s * 0.2, s * 0.1); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.moveTo(x - s * 0.62, y); c.lineTo(x - s * 0.42, y - s * 0.17); c.lineTo(x - s * 0.42, y + s * 0.17); c.closePath();
        c.moveTo(x + s * 0.62, y); c.lineTo(x + s * 0.42, y - s * 0.17); c.lineTo(x + s * 0.42, y + s * 0.17); c.closePath();
        c.fillStyle = '#fff'; c.fill(); c.stroke(); break;
      case 'fire': flame(c, x, y + 1, s * 0.8, '#ffd93d', '#fff6c8'); break;
      case 'slow': // a snail
        c.beginPath(); c.ellipse(x - s * 0.05, y + s * 0.2, s * 0.42, s * 0.12, 0, 0, TAU); c.fillStyle = '#ffe0b0'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = INK; c.stroke();
        circle(c, x + s * 0.05, y - s * 0.02, s * 0.25); c.fillStyle = '#ff9a2e'; c.fill(); c.stroke();
        c.beginPath(); c.arc(x + s * 0.05, y - s * 0.02, s * 0.12, 0, M.PI * 1.5); c.stroke();
        c.beginPath(); c.moveTo(x - s * 0.36, y + s * 0.12); c.lineTo(x - s * 0.42, y - s * 0.16); c.stroke();
        circle(c, x - s * 0.42, y - s * 0.2, s * 0.06); c.fillStyle = INK; c.fill(); break;
      case 'sticky': // a honey drop
        c.beginPath(); c.moveTo(x, y - s * 0.42);
        c.bezierCurveTo(x + s * 0.1, y - s * 0.2, x + s * 0.32, y, x + s * 0.32, y + s * 0.16);
        c.arc(x, y + s * 0.16, s * 0.32, 0, M.PI);
        c.bezierCurveTo(x - s * 0.32, y, x - s * 0.1, y - s * 0.2, x, y - s * 0.42); c.closePath();
        c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
        circle(c, x - s * 0.1, y + s * 0.1, s * 0.08); c.fillStyle = '#fff'; c.fill(); break;
      case 'shield':
        circle(c, x, y, s * 0.38); c.fillStyle = 'rgba(200,250,255,0.7)'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.arc(x, y, s * 0.26, M.PI * 1.1, M.PI * 1.5); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); break;
    }
  }
  BS.powerIcon = powerIcon;

  /* ------------------------------------------------------------- balls */
  // Skins: a base fill and outline, then detail layers; every layer is one path for all balls.
  var BALL = {
    candy: { fill: '#ff5fa2', trail: '#ff9fd0' },
    tennis: { fill: '#d8ff3f', trail: '#efffaa' },
    eye: { fill: '#ffffff', trail: '#c8e8ff' },
    planet: { fill: '#4f8cff', trail: '#9fc4ff' },
    donut: { fill: '#e0a060', trail: '#ffc0e0' },
    bubble: { fill: 'rgba(170,240,255,0.5)', trail: '#bff6ff', line: '#e8fdff' },
    pea: { fill: '#6bd34a', trail: '#b9f59a' },
    fire: { fill: '#ff6a2e', trail: '#ffd93d' }
  };
  // Draws n balls given by the arrays (x, y, dx, dy) with skin id. o: { r, still }.
  var NOOPT = {};
  function drawBalls(c, id, n, X, Y, DX, DY, o) {
    if (!n) return;
    o = o || NOOPT;
    var sk = BALL[id] || BALL.candy, r = o.r || RAD, i, x, y;
    // motion streaks
    var len = n > 120 ? 10 : n > 30 ? 16 : 24;
    if (!o.still) {
      c.beginPath();
      for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x, y); c.lineTo(x - DX[i] * len, y - DY[i] * len); }
      c.lineCap = 'round'; c.lineWidth = r * 1.5; c.strokeStyle = sk.trail; c.globalAlpha = id === 'fire' ? 0.7 : 0.35; c.stroke(); c.globalAlpha = 1;
      if (id === 'fire') { c.lineWidth = r * 0.8; c.strokeStyle = '#fff2a0'; c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1; }
    }
    c.beginPath();
    for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    c.fillStyle = sk.fill; c.fill(); c.lineWidth = n > 200 ? 1.5 : 2.2; c.strokeStyle = sk.line || INK; c.stroke();
    var j;
    switch (id) {
      case 'candy': case 'fire':
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i] - r * 0.35; y = Y[i] - r * 0.35; c.moveTo(x + r * 0.3, y); c.arc(x, y, r * 0.3, 0, TAU); }
        c.fillStyle = id === 'fire' ? '#fff2a0' : 'rgba(255,255,255,0.85)'; c.fill(); break;
      case 'tennis':
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x - r * 0.45 + r * 0.8 * M.cos(-0.95), y + r * 0.8 * M.sin(-0.95)); c.arc(x - r * 1.25, y, r * 0.95, -0.75, 0.75); c.moveTo(x + r * 1.25 + r * 0.95 * M.cos(M.PI - 0.75), y + r * 0.95 * M.sin(M.PI - 0.75)); c.arc(x + r * 1.25, y, r * 0.95, M.PI - 0.75, M.PI + 0.75); }
        c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); break;
      case 'eye':
        for (j = 0; j < 2; j++) {
          c.beginPath();
          var rr = j ? r * 0.28 : r * 0.56, off = j ? r * 0.5 : r * 0.36;
          for (i = 0; i < n; i++) { x = X[i] + DX[i] * off; y = Y[i] + DY[i] * off; c.moveTo(x + rr, y); c.arc(x, y, rr, 0, TAU); }
          c.fillStyle = j ? INK : '#3fa8ff'; c.fill();
        }
        break;
      case 'planet':
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x - r * 0.1, y - r * 0.2); c.ellipse(x - r * 0.3, y - r * 0.2, r * 0.32, r * 0.22, 0.4, 0, TAU); c.moveTo(x + r * 0.6, y + r * 0.35); c.ellipse(x + r * 0.35, y + r * 0.35, r * 0.25, r * 0.18, 0, 0, TAU); }
        c.fillStyle = '#5fe36a'; c.fill();
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x + r * 1.65 * M.cos(-0.35), y + r * 1.65 * M.sin(-0.35)); c.ellipse(x, y, r * 1.65, r * 0.42, -0.35, 0, TAU); }
        c.lineWidth = 2.4; c.strokeStyle = '#ffd93d'; c.stroke(); break;
      case 'donut':
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x + r * 0.78, y); c.arc(x, y, r * 0.78, 0, TAU); }
        c.fillStyle = '#ff6fc4'; c.fill();
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x + r * 0.3, y); c.arc(x, y, r * 0.3, 0, TAU); }
        c.fillStyle = INK; c.fill(); break;
      case 'bubble':
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i]; y = Y[i]; c.moveTo(x - r * 0.6 * M.cos(0.6), y - r * 0.6 * M.sin(0.6)); c.arc(x, y, r * 0.6, M.PI + 0.6, M.PI * 1.45); }
        c.lineWidth = 2.2; c.strokeStyle = '#fff'; c.stroke(); break;
      case 'pea':
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i]; y = Y[i] - r * 0.15; c.moveTo(x - r * 0.05, y); c.arc(x - r * 0.4, y, r * 0.36, 0, TAU); c.moveTo(x + r * 0.76, y); c.arc(x + r * 0.4, y, r * 0.36, 0, TAU); }
        c.fillStyle = '#fff'; c.fill();
        c.beginPath();
        for (i = 0; i < n; i++) { x = X[i] + DX[i] * r * 0.15; y = Y[i] - r * 0.15 + DY[i] * r * 0.15; c.moveTo(x - r * 0.24, y); c.arc(x - r * 0.4, y, r * 0.16, 0, TAU); c.moveTo(x + r * 0.56, y); c.arc(x + r * 0.4, y, r * 0.16, 0, TAU); }
        c.fillStyle = INK; c.fill(); break;
    }
  }
  BS.drawBalls = drawBalls;
  // One big ball for the shop (no streak), looking a little down and to the side.
  BS.drawBallIcon = function (c, id, x, y, r) {
    c.save(); c.translate(x, y); c.scale(r / RAD, r / RAD);
    drawBalls(c, id, 1, [0], [0], [0.45], [0.55], { still: true });
    c.restore();
  };

  /* ------------------------------------------------------------ paddles */
  // (x, y) = the paddle's top centre, w its width. o: { t, sq (squash 0..1), lx, ly (where
  // the eyes look), sticky }.
  BS.drawPaddle = function (c, id, x, y, w, o) {
    o = o || {};
    var sq = o.sq || 0, h = F.PH * (1 - 0.28 * sq), ww = w * (1 + 0.06 * sq), top = y + F.PH - h, half = ww / 2;
    c.lineJoin = 'round'; c.lineCap = 'round';
    var eyeY = top - 2, ex = [x - M.min(28, half * 0.3), x + M.min(28, half * 0.3)], er = 11;
    switch (id) {
      case 'banana':
        c.beginPath();
        c.moveTo(x - half, top + h * 0.2);
        c.quadraticCurveTo(x, top + h * 2.1, x + half, top + h * 0.2);
        c.quadraticCurveTo(x + half - 6, top - 2, x + half - 14, top + h * 0.35);
        c.quadraticCurveTo(x, top + h * 1.15, x - half + 14, top + h * 0.35);
        c.quadraticCurveTo(x - half + 6, top - 2, x - half, top + h * 0.2); c.closePath();
        c.fillStyle = '#ffe14f'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.moveTo(x - half * 0.7, top + h * 0.75); c.quadraticCurveTo(x, top + h * 1.45, x + half * 0.7, top + h * 0.75);
        c.lineWidth = 3; c.strokeStyle = '#e0b400'; c.stroke();
        circle(c, x - half + 3, top + h * 0.2, 4); circle(c, x + half - 3, top + h * 0.2, 4);
        c.beginPath(); c.arc(x - half + 3, top + h * 0.2, 4.5, 0, TAU); c.moveTo(x + half - 3 + 4.5, top + h * 0.2); c.arc(x + half - 3, top + h * 0.2, 4.5, 0, TAU);
        c.fillStyle = '#6b4a1f'; c.fill();
        eyeY = top + 2; break;
      case 'skate':
        circle(c, x - half * 0.62, top + h + 2, 7); c.fillStyle = '#ffe14f'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
        circle(c, x + half * 0.62, top + h + 2, 7); c.fill(); c.stroke();
        rrect(c, x - half, top, ww, h * 0.75, h * 0.37); c.fillStyle = '#ff7a3d'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
        rrect(c, x - half + 8, top + 3, ww - 16, h * 0.22, 3); c.fillStyle = '#4a3a8e'; c.fill();
        c.beginPath(); for (var f = -2; f <= 2; f++) { c.moveTo(x + f * half * 0.3 - 6, top + h * 0.6); c.lineTo(x + f * half * 0.3 + 6, top + h * 0.35); }
        c.lineWidth = 3; c.strokeStyle = '#ffd93d'; c.stroke();
        break;
      case 'surf':
        c.beginPath(); c.moveTo(x - half, top + h * 0.5);
        c.quadraticCurveTo(x - half * 0.7, top - 1, x, top); c.quadraticCurveTo(x + half * 0.7, top - 1, x + half + 6, top + h * 0.45);
        c.quadraticCurveTo(x + half * 0.7, top + h + 1, x, top + h); c.quadraticCurveTo(x - half * 0.7, top + h + 1, x - half, top + h * 0.5); c.closePath();
        c.fillStyle = '#f4fbff'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.moveTo(x - half * 0.8, top + h * 0.5); c.lineTo(x + half * 0.85, top + h * 0.5);
        c.lineWidth = 6; c.strokeStyle = '#2ec4d6'; c.stroke();
        c.lineWidth = 2.5; c.strokeStyle = '#ff6fc4'; c.stroke();
        break;
      case 'cat':
        // a very long orange cat: tail on the left, head on the right
        c.beginPath(); c.moveTo(x - half + 8, top + h * 0.5); c.quadraticCurveTo(x - half - 18, top + h * 0.4, x - half - 12, top - 14);
        c.lineWidth = 9; c.strokeStyle = INK; c.stroke(); c.lineWidth = 5; c.strokeStyle = '#ff9a2e'; c.stroke();
        rrect(c, x - half, top + 2, ww - 18, h - 2, (h - 2) / 2); c.fillStyle = '#ff9a2e'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
        c.beginPath(); for (var st = 1; st < 6; st++) { var sx = x - half + (ww - 30) * st / 6; c.moveTo(sx, top + 5); c.lineTo(sx + 4, top + h * 0.55); }
        c.lineWidth = 3; c.strokeStyle = '#d9661a'; c.stroke();
        var hx = x + half - 14, hy = top + h * 0.35;
        c.beginPath(); c.moveTo(hx - 16, hy - 8); c.lineTo(hx - 12, hy - 26); c.lineTo(hx - 3, hy - 13); c.lineTo(hx + 5, hy - 13); c.lineTo(hx + 14, hy - 26); c.lineTo(hx + 18, hy - 8); c.closePath();
        c.fillStyle = '#ff9a2e'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
        circle(c, hx + 1, hy, 19); c.fillStyle = '#ff9a2e'; c.fill(); c.lineWidth = 3.5; c.stroke();
        c.beginPath(); c.moveTo(hx - 24, hy + 4); c.lineTo(hx - 12, hy + 5); c.moveTo(hx + 26, hy + 4); c.lineTo(hx + 14, hy + 5);
        c.lineWidth = 2; c.stroke();
        c.beginPath(); c.moveTo(hx - 4, hy + 9); c.quadraticCurveTo(hx + 1, hy + 13, hx + 1, hy + 8); c.quadraticCurveTo(hx + 1, hy + 13, hx + 6, hy + 9); c.lineWidth = 2.2; c.stroke();
        ex = [hx - 7, hx + 9]; eyeY = hy - 3; er = 7;
        break;
      default: // jelly
        rrect(c, x - half, top, ww, h, h / 2); c.fillStyle = '#5fe3a1'; c.fill();
        c.save(); rrect(c, x - half, top, ww, h, h / 2); c.clip(); c.fillStyle = '#2fbf7a'; c.fillRect(x - half, top + h * 0.62, ww, h); c.restore();
        rrect(c, x - half + 12, top + 5, ww * 0.3, 6, 3); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
        circle(c, x + half - 18, top + 8, 3); c.fill();
        rrect(c, x - half, top, ww, h, h / 2); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.arc(x, top + h * 0.42, 8, 0.2, M.PI - 0.2); c.lineWidth = 3; c.stroke();
        c.beginPath(); c.ellipse(x - M.min(52, half * 0.55), top + h * 0.55, 7, 4, 0, 0, TAU); c.ellipse(x + M.min(52, half * 0.55), top + h * 0.55, 7, 4, 0, 0, TAU);
        c.fillStyle = 'rgba(255,111,196,0.55)'; c.fill();
    }
    if (o.sticky) {
      c.beginPath();
      for (var d = 0; d < 5; d++) { var gx = x - half * 0.8 + d * half * 0.4, gl = 6 + 5 * M.sin((o.t || 0) * 3 + d); c.moveTo(gx - 5, top + 2); c.quadraticCurveTo(gx, top + 2 + gl * 2, gx + 5, top + 2); }
      c.fillStyle = 'rgba(198,233,79,0.85)'; c.fill();
    }
    // googly eyes that watch the closest ball
    for (var e = 0; e < 2; e++) {
      var lx = (o.lx == null ? ex[e] : o.lx) - ex[e], ly = (o.ly == null ? eyeY - 40 : o.ly) - eyeY, l = M.sqrt(lx * lx + ly * ly) || 1;
      googly(c, ex[e], eyeY, er, lx / l, ly / l);
    }
  };

  /* ------------------------------------------------------------ the view */
  BS.createView = function (ctx) {
    var v = { pr: 1, calm: false, world: -1, bg: null, strip: null, sprites: {}, ghosts: [], booms: [], gemT: 0 };
    var PAD = 5;
    // Pixel ratio of the offscreen pictures: the canvas scale times the device ratio.
    v.setRatio = function (pr) {
      pr = M.max(0.5, M.min(2, pr || 1));
      if (M.abs(pr - v.pr) < 0.01 && v.bg) return;
      v.pr = pr; v.sprites = {}; v.bg = null; v.world = -1;
    };
    // Drops every cached picture (new fonts, a restored GPU context): redrawn when next used.
    v.flush = function () { v.sprites = {}; v.bg = null; };

    /* ----- backdrops ----- */
    function backdrop(world) {
      var pr = v.pr, cv = canvas(W * pr, H * pr), c = cv.getContext('2d');
      c.scale(pr, pr);
      var g = c.createLinearGradient(0, 0, 0, H), i, x, y;
      if (world === 0) { g.addColorStop(0, '#2b0f5e'); g.addColorStop(0.6, '#5a1a86'); g.addColorStop(1, '#9a2a8e'); }
      else if (world === 1) { g.addColorStop(0, '#060a2a'); g.addColorStop(0.6, '#1a1458'); g.addColorStop(1, '#3a1670'); }
      else { g.addColorStop(0, '#0a4a7a'); g.addColorStop(0.55, '#0a2f63'); g.addColorStop(1, '#06173f'); }
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (world === 0) {
        // big soft lollipops and gumdrops, then sprinkles
        for (i = 0; i < 6; i++) {
          x = 120 + i * 210 + hash(i, 1) * 60; y = 170 + hash(i, 2) * 380; var rr = 50 + hash(i, 3) * 40;
          c.globalAlpha = 0.13;
          c.beginPath(); c.moveTo(x, y + rr); c.lineTo(x, y + rr + 120); c.lineWidth = 10; c.strokeStyle = '#fff'; c.stroke();
          circle(c, x, y, rr); c.fillStyle = PAL[(i * 3) % 8]; c.fill();
          c.beginPath(); for (var a = 0; a < 18; a += 0.3) c.lineTo(x + M.cos(a) * a * rr / 18, y + M.sin(a) * a * rr / 18);
          c.lineWidth = 7; c.strokeStyle = '#fff'; c.stroke();
        }
        c.globalAlpha = 0.5;
        for (i = 0; i < 140; i++) {
          x = hash(i, 5) * W; y = 100 + hash(i, 6) * (H - 100);
          c.save(); c.translate(x, y); c.rotate(hash(i, 7) * 6); c.fillStyle = PAL[i % 9]; c.fillRect(-5, -1.6, 10, 3.2); c.restore();
        }
        c.globalAlpha = 0.25;
        for (i = 0; i < 9; i++) { x = 60 + i * 145; c.beginPath(); c.ellipse(x, H + 10, 70, 46, 0, 0, TAU); c.fillStyle = PAL[(i * 5) % 8]; c.fill(); }
      } else if (world === 1) {
        for (i = 0; i < 4; i++) {
          var ng = c.createRadialGradient(0, 0, 0, 0, 0, 260);
          ng.addColorStop(0, ['rgba(255,80,200,0.22)', 'rgba(80,160,255,0.2)', 'rgba(160,80,255,0.22)', 'rgba(80,255,200,0.12)'][i]); ng.addColorStop(1, 'rgba(0,0,0,0)');
          c.save(); c.translate(150 + i * 330, 250 + hash(i, 4) * 300); c.scale(1.6, 1); c.fillStyle = ng; c.fillRect(-260, -260, 520, 520); c.restore();
        }
        for (i = 0; i < 220; i++) {
          x = hash(i, 8) * W; y = hash(i, 9) * H; var s = 1 + hash(i, 10) * 2.4;
          c.globalAlpha = 0.4 + hash(i, 11) * 0.6; c.fillStyle = i % 11 ? '#fff' : '#ffe14f'; c.fillRect(x, y, s, s);
        }
        c.globalAlpha = 0.3;
        circle(c, 1080, 600, 90); c.fillStyle = '#ff9a2e'; c.fill();
        c.beginPath(); c.ellipse(1080, 600, 160, 34, -0.25, 0, TAU); c.lineWidth = 12; c.strokeStyle = '#ffd93d'; c.stroke();
        circle(c, 190, 560, 46); c.fillStyle = '#3fd8f0'; c.fill();
      } else {
        c.globalAlpha = 0.07; c.fillStyle = '#fff';
        for (i = 0; i < 6; i++) { x = 100 + i * 230; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 90, 0); c.lineTo(x + 260, H); c.lineTo(x + 120, H); c.closePath(); c.fill(); }
        c.globalAlpha = 0.25;
        for (i = 0; i < 46; i++) { x = hash(i, 12) * W; y = 120 + hash(i, 13) * (H - 120); circle(c, x, y, 3 + hash(i, 14) * 9); c.lineWidth = 2; c.strokeStyle = '#bff6ff'; c.stroke(); }
        c.globalAlpha = 0.35;
        for (i = 0; i < 12; i++) {
          x = i < 6 ? 50 + i * 26 : W - 50 - (i - 6) * 26; var hh = 90 + hash(i, 15) * 130;
          c.beginPath(); c.moveTo(x, H);
          for (var q = 1; q <= 6; q++) c.lineTo(x + M.sin(q * 1.3 + i) * 12, H - hh * q / 6);
          c.lineWidth = 10; c.strokeStyle = i % 2 ? '#2fbf7a' : '#1f9a64'; c.stroke();
        }
        c.globalAlpha = 0.5;
        c.beginPath(); c.moveTo(0, H); for (x = 0; x <= W; x += 40) c.lineTo(x, H - 18 - 8 * M.sin(x * 0.02)); c.lineTo(W, H); c.closePath(); c.fillStyle = '#e8c27a'; c.fill();
      }
      c.globalAlpha = 1;
      // side walls
      walls(c, world);
      return cv;
    }
    function walls(c, world) {
      var col = ['#ff6fc4', '#9aa3c7', '#ff7a6b'][world], dark = ['#c23a8e', '#5c6488', '#b8443a'][world];
      for (var side = 0; side < 2; side++) {
        var x0 = side ? F.R : 0;
        c.fillStyle = col; c.fillRect(x0, 0, F.L, H);
        if (world === 0) {
          c.save(); c.beginPath(); c.rect(x0, 0, F.L, H); c.clip();
          c.beginPath(); for (var y = -60; y < H + 60; y += 44) { c.moveTo(x0, y); c.lineTo(x0 + F.L, y + 30); c.lineTo(x0 + F.L, y + 52); c.lineTo(x0, y + 22); c.closePath(); }
          c.fillStyle = '#fff'; c.fill(); c.restore();
        } else if (world === 1) {
          c.fillStyle = dark; for (var b = 120; b < H; b += 80) { circle(c, x0 + 20, b, 5); c.fill(); }
        } else {
          c.fillStyle = dark; for (var k = 0; k < 14; k++) { circle(c, x0 + 8 + hash(k, side) * 24, 110 + k * 46, 6 + hash(k, 3) * 6); c.fill(); }
        }
        c.fillStyle = INK; c.fillRect(side ? F.R : F.L - 4, F.TOP, 4, H);
      }
    }
    // The HUD band over the top wall, drawn after the bricks so endless rows slide out from under it.
    function strip(world) {
      var pr = v.pr, cv = canvas(W * pr, F.TOP * pr), c = cv.getContext('2d');
      c.scale(pr, pr);
      var g = c.createLinearGradient(0, 0, 0, F.TOP);
      var tone = [['#3a1670', '#250c4e'], ['#1a1d50', '#0c0e30'], ['#0e3a6e', '#082650']][world];
      g.addColorStop(0, tone[0]); g.addColorStop(1, tone[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, F.TOP);
      c.fillStyle = ['#ff6fc4', '#9aa3c7', '#ff7a6b'][world]; c.fillRect(0, F.TOP - 8, W, 8);
      if (world === 0) { c.fillStyle = '#fff'; for (var x = 0; x < W; x += 36) c.fillRect(x, F.TOP - 8, 18, 8); }
      c.fillStyle = INK; c.fillRect(F.L - 4, F.TOP - 4, F.R - F.L + 8, 4);
      return cv;
    }
    function useWorld(world) {
      if (world === v.world && v.bg) return;
      v.world = world; v.bg = backdrop(world); v.strip = strip(world);
    }
    v.useWorld = useWorld;

    /* ----- brick sprites ----- */
    function brickSprite(t, col, hp, max, gem, face) {
      // a number, not a string per brick per frame (col < 16, hp and max < 8, gem < 3)
      var key = ((((t * 16 + col) * 8 + hp) * 8 + max) * 3 + gem) * 2 + face, s = v.sprites[key];
      if (s) return s;
      var pr = v.pr, cv = canvas((CW + PAD * 2) * pr, (CH + PAD * 2) * pr), c = cv.getContext('2d');
      c.scale(pr, pr); c.translate(PAD, PAD);
      drawBrick(c, t, col, hp, max, gem, face);
      return (v.sprites[key] = cv);
    }
    function drawBrick(c, t, col, hp, max, gem, face) {
      var base = t === T.TNT ? '#ff3d4f' : t === T.STEEL ? PAL[12] : t === T.GEM ? PAL[13] : PAL[col];
      var x = 2, y = 2, w = CW - 4, h = CH - 4, r = 11;
      c.lineJoin = 'round'; c.lineCap = 'round';
      rrect(c, x, y, w, h, r); c.fillStyle = base; c.fill();
      c.save(); rrect(c, x, y, w, h, r); c.clip();
      c.fillStyle = shade(base.charAt(0) === '#' ? base : '#ffffff', -0.22); c.fillRect(x, y + h * 0.66, w, h);
      if (t === T.STEEL) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(x + 8, y); c.lineTo(x + 22, y); c.lineTo(x + 2, y + h); c.lineTo(x - 12, y + h); c.fill(); }
      if (t === T.TNT) { c.fillStyle = '#ffd93d'; for (var sx = -10; sx < w; sx += 16) { c.beginPath(); c.moveTo(x + sx, y + h); c.lineTo(x + sx + 8, y + h); c.lineTo(x + sx + 16, y + h * 0.66); c.lineTo(x + sx + 8, y + h * 0.66); c.fill(); } }
      c.restore();
      rrect(c, x + 6, y + 4, w * 0.38, 7, 3.5); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
      circle(c, x + w * 0.5 + 6, y + 7.5, 2.6); c.fill();
      rrect(c, x, y, w, h, r); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      var cx = CW / 2, ey = 17, hit = face === 1;
      if (t === T.STEEL) {
        c.fillStyle = '#7d86a8'; [[9, 9], [w - 5, 9], [9, h - 5], [w - 5, h - 5]].forEach(function (p) { circle(c, p[0], p[1], 2.6); c.fill(); });
        googly(c, cx - 9, ey + 3, 5.5, 0, hit ? -0.4 : 0.6); googly(c, cx + 9, ey + 3, 5.5, 0, hit ? -0.4 : 0.6);
        c.beginPath(); c.moveTo(cx - 16, ey - 5); c.lineTo(cx - 4, ey - 1); c.moveTo(cx + 16, ey - 5); c.lineTo(cx + 4, ey - 1);
        c.moveTo(cx - 7, 33); c.lineTo(cx + 7, 33); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
        return;
      }
      if (t === T.TNT) {
        circle(c, cx, 26, 11); c.fillStyle = INK; c.fill();
        c.beginPath(); c.moveTo(cx + 7, 17); c.quadraticCurveTo(cx + 14, 8, cx + 19, 10); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
        star(c, cx + 20, 9, 6, '#ffe14f');
        circle(c, cx - 4, 24, 2.6); c.fillStyle = '#fff'; c.fill(); circle(c, cx + 4, 24, 2.6); c.fill();
        c.beginPath(); c.moveTo(cx - 8, 19); c.lineTo(cx - 2, 21.5); c.moveTo(cx + 8, 19); c.lineTo(cx + 2, 21.5); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
        return;
      }
      if (t === T.GEM) {
        c.beginPath(); c.moveTo(cx, 8); c.lineTo(cx + 13, 18); c.lineTo(cx, 36); c.lineTo(cx - 13, 18); c.closePath();
        c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.moveTo(cx - 13, 18); c.lineTo(cx + 13, 18); c.moveTo(cx, 8); c.lineTo(cx - 4, 18); c.lineTo(cx, 36); c.lineTo(cx + 4, 18); c.closePath();
        c.lineWidth = 1.5; c.stroke();
        if (gem) { var tx = BS.GEMS[gem] === 'x3' ? '×3' : '+10'; rrect(c, cx - 17, 28, 34, 16, 8); c.fillStyle = BS.GEMS[gem] === 'x3' ? '#ff4fb8' : '#3ddc84'; c.fill(); c.lineWidth = 2; c.stroke(); label(c, tx, cx, 36.5, 14, '#fff'); }
        return;
      }
      var dark = col === 9 || col === 11, pupil = hit ? 0.75 : 0.55;
      googly(c, cx - 10, ey, hit ? 7.5 : 6.5, 0, pupil); googly(c, cx + 10, ey, hit ? 7.5 : 6.5, 0, pupil);
      c.strokeStyle = INK; c.lineWidth = 2.6;
      if (max > 1) {
        label(c, String(hp), cx, 33, 19, '#fff');
        if (hp < max) { c.beginPath(); c.moveTo(8, 8); c.lineTo(15, 16); c.lineTo(11, 22); c.moveTo(w - 4, h - 6); c.lineTo(w - 12, h - 14); c.lineTo(w - 6, h - 20); c.lineWidth = 2; c.strokeStyle = dark ? '#fff' : INK; c.stroke(); }
      } else if (hit) { c.beginPath(); c.ellipse(cx, 33, 4, 5, 0, 0, TAU); c.fillStyle = INK; c.fill(); }
      else { c.beginPath(); c.arc(cx, 29, 6, 0.3, M.PI - 0.3); c.strokeStyle = dark ? '#fff' : INK; c.stroke(); }
    }
    function star(c, x, y, r, fill) {
      c.beginPath();
      for (var i = 0; i < 8; i++) { var a = i * M.PI / 4 - M.PI / 2, rr = i % 2 ? r * 0.42 : r; c.lineTo(x + M.cos(a) * rr, y + M.sin(a) * rr); }
      c.closePath(); c.fillStyle = fill; c.fill();
    }
    BS.drawBrick = function (c, t, col, hp, max, gem) { drawBrick(c, t, col, hp, max, gem, 0); };
    function capSprite(kind) {
      var key = kind, s = v.sprites[key];
      if (s) return s;
      var pr = v.pr, cv = canvas(76 * pr, 44 * pr), c = cv.getContext('2d');
      c.scale(pr, pr);
      var a = CAPS[kind] || CAPS.x3;
      rrect(c, 4, 4, 68, 36, 18); c.fillStyle = a.fill; c.fill();
      c.save(); rrect(c, 4, 4, 68, 36, 18); c.clip(); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(4, 28, 68, 14); c.restore();
      rrect(c, 12, 8, 30, 6, 3); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
      rrect(c, 4, 4, 68, 36, 18); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
      powerIcon(c, kind, 38, 22, 34);
      return (v.sprites[key] = cv);
    }
    v.capSprite = capSprite;

    /* ----- per frame ----- */
    v.addGhost = function (e, w) {
      if (v.calm) return;
      if (v.ghosts.length > 40) v.ghosts.shift();
      v.ghosts.push({ x: e.x, y: e.y, s: brickSprite(e.t, e.col, 1, 1, 0, 1), t: 0 });
    };
    v.addBoom = function (x, y) {
      if (v.calm) return;
      if (v.booms.length > 8) v.booms.shift();
      v.booms.push({ x: x, y: y, t: 0 });
    };
    v.update = function (dt) {
      v.gemT += dt;
      for (var i = v.ghosts.length - 1; i >= 0; i--) if ((v.ghosts[i].t += dt) > 0.22) v.ghosts.splice(i, 1);
      for (var j = v.booms.length - 1; j >= 0; j--) if ((v.booms[j].t += dt) > 0.45) v.booms.splice(j, 1);
    };
    function bricks(w) {
      var pr = CW + PAD * 2, ph = CH + PAD * 2, oy = w.oy, t = w.t, calm = v.calm;
      for (var k = 0; k < COLS * ROWS; k++) {
        var ty = w.type[k];
        if (!ty) continue;
        var x = F.GX + (k % COLS) * CW, y = oy + M.floor(k / COLS) * CH;
        if (y + CH < F.TOP - 2) continue;
        var age = t - w.hitAt[k], hit = age >= 0 && age < 0.35 ? 1 : 0;
        var s = brickSprite(ty, w.col[k], w.hp[k], w.max[k], w.gem[k], hit);
        if (hit && !calm) {
          // the wobble squashes the picture about the brick's centre (no transform to read back)
          var wob = M.sin(age * 34) * M.exp(-age * 9) * 0.2, sx = pr * (1 + wob), sy = ph * (1 - wob);
          ctx.drawImage(s, x + CW / 2 - sx / 2, y + CH / 2 - sy / 2, sx, sy);
        } else ctx.drawImage(s, x - PAD, y - PAD, pr, ph);
      }
      // gem sparkles
      if (!calm) {
        for (var g = 0; g < COLS * ROWS; g++) if (w.type[g] === T.GEM) {
          var ph2 = (v.gemT * 1.6 + hash(g, 1)) % 1;
          if (ph2 < 0.5) star(ctx, F.GX + (g % COLS) * CW + 8 + hash(g, 2) * 44, oy + M.floor(g / COLS) * CH + 6 + hash(g, 3) * 30, 7 * M.sin(ph2 * M.PI * 2), '#fff');
        }
      }
    }
    function rings(w) {
      for (var j = 0; j < w.rings.length; j++) {
        var g = w.rings[j], on = g.life > 0, pulse = v.calm ? 1 : 1 + (on ? 0.08 : 0.04) * M.sin(w.t * (on ? 14 : 4) + j);
        if (g.y < F.TOP - 10) continue;
        ctx.save(); ctx.translate(g.x, g.y); ctx.scale(pulse, pulse);
        circle(ctx, 0, 0, F.RING_R); ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 8; ctx.strokeStyle = on ? (M.floor(w.t * 8) % 2 ? '#ff4fb8' : '#ffe14f') : '#ffd93d'; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, F.RING_R, M.PI * 1.1, M.PI * 1.45); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        if (on) { ctx.beginPath(); ctx.arc(0, 0, F.RING_R + 12, -M.PI / 2, -M.PI / 2 + TAU * g.life / F.RING_LIFE); ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        label(ctx, '×2', 0, 1, 26, on ? '#ffe14f' : '#fff');
        ctx.restore();
      }
    }
    function caps(w) {
      for (var i = 0; i < w.caps.length; i++) {
        var cp = w.caps[i], s = capSprite(cp.kind), rot = v.calm ? 0 : M.sin(cp.t * 7) * 0.12;
        ctx.save(); ctx.translate(cp.x, cp.y); ctx.rotate(rot);
        ctx.drawImage(s, -38, -22, 76, 44);
        ctx.restore();
      }
    }
    function floor(w) {
      var on = w.floorPerm || w.floorHits > 0 || w.pow.shield > 0;
      if (!on && w.phase !== 'clear') return;
      var blink = !w.floorPerm && w.floorHits <= 0 && w.pow.shield > 0 && w.pow.shield < 2 && M.floor(w.t * 8) % 2;
      if (blink) return;
      var y = F.FLOOR, t = v.calm ? 0 : w.t;
      ctx.beginPath(); ctx.moveTo(F.L, H);
      for (var x = F.L; x <= F.R; x += 40) ctx.lineTo(x, y + M.sin(x * 0.03 + t * 3) * 3);
      ctx.lineTo(F.R, H); ctx.closePath();
      ctx.fillStyle = 'rgba(120,230,255,0.28)'; ctx.fill();
      ctx.beginPath();
      for (var x2 = F.L; x2 <= F.R; x2 += 40) ctx.lineTo(x2, y + M.sin(x2 * 0.03 + t * 3) * 3);
      ctx.lineWidth = 4; ctx.strokeStyle = '#bff6ff'; ctx.stroke();
      ctx.beginPath();
      for (var b = 0; b < 14; b++) { var bx = F.L + 30 + b * 86, by = y + 9 + (b % 3) * 4; ctx.moveTo(bx + 4, by); ctx.arc(bx, by, 3 + (b % 2) * 2, 0, TAU); }
      ctx.lineWidth = 2; ctx.stroke();
      if (!w.floorPerm && w.floorHits > 0 && w.pow.shield <= 0) {
        for (var h = 0; h < w.floorHits; h++) { circle(ctx, F.R - 26 - h * 24, y - 14, 8); ctx.fillStyle = 'rgba(190,246,255,0.8)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
      }
    }
    function dangerLine(w) {
      if (!w.endless) return;
      var near = 0;
      for (var k = COLS * ROWS - 1; k >= 0; k--) if (w.type[k]) { near = (w.oy + (M.floor(k / COLS) + 1) * CH) / F.DANGER; break; }
      ctx.save();
      ctx.setLineDash([18, 14]); ctx.lineDashOffset = v.calm ? 0 : -w.t * 40;
      ctx.beginPath(); ctx.moveTo(F.L, F.DANGER); ctx.lineTo(F.R, F.DANGER);
      ctx.lineWidth = 4; ctx.strokeStyle = near > 0.85 && M.floor(w.t * 6) % 2 ? '#ff4f6d' : 'rgba(255,255,255,0.35)'; ctx.stroke();
      ctx.restore();
    }
    function booms() {
      for (var i = 0; i < v.booms.length; i++) {
        var b = v.booms[i], k = b.t / 0.45;
        ctx.globalAlpha = 1 - k;
        circle(ctx, b.x, b.y, 20 + k * 110); ctx.lineWidth = 16 * (1 - k) + 2; ctx.strokeStyle = '#ffe14f'; ctx.stroke();
        if (k < 0.3) { circle(ctx, b.x, b.y, 60 * (1 - k)); ctx.fillStyle = '#fff6c8'; ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
    function ghosts() {
      for (var i = 0; i < v.ghosts.length; i++) {
        var g = v.ghosts[i], k = g.t / 0.22, s = 1 + k * 0.5;
        ctx.globalAlpha = 1 - k;
        ctx.drawImage(g.s, g.x - (CW / 2 + PAD) * s, g.y - (CH / 2 + PAD) * s, (CW + PAD * 2) * s, (CH + PAD * 2) * s);
      }
      ctx.globalAlpha = 1;
    }
    var padO = { t: 0, sq: 0, lx: null, ly: null, sticky: false };
    // o: { ball, paddle (skin ids), sq, endlessWorld }
    v.render = function (w, o) {
      useWorld(w.spec ? w.spec.world : (w.level === 0 ? (o.endlessWorld || 0) : 0));
      ctx.drawImage(v.bg, 0, 0, W, H);
      dangerLine(w);
      bricks(w);
      ghosts();
      rings(w);
      floor(w);
      caps(w);
      // the paddle watches the lowest falling ball
      var look = -1, ly = -1;
      for (var i = 0; i < w.n; i++) if (w.y[i] > ly && (w.dy[i] > 0 || !w.launched)) { ly = w.y[i]; look = i; }
      padO.t = w.t; padO.sq = o.sq; padO.lx = look >= 0 ? w.x[look] : null; padO.ly = look >= 0 ? w.y[look] : null; padO.sticky = w.pow.sticky > 0;
      BS.drawPaddle(ctx, o.paddle, w.px, F.PY, w.pw, padO);
      drawBalls(ctx, w.pow.fire > 0 ? 'fire' : o.ball, w.n, w.x, w.y, w.dx, w.dy);
      booms();
      ctx.drawImage(v.strip, 0, 0, W, F.TOP);
    };
    return v;
  };
})();
