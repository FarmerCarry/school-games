/* Zooom +1 (زوووم +1): everything drawn in code on one 2D canvas (1280x720 logical).
 * A light pseudo-3D road of keycaps seen from behind the runner: one projection, flat
 * fills, no shadows, no filters and no per-frame canvas reads, so it stays smooth on
 * the lab PCs. ZP.drawRunner also paints the runner previews in the shop.
 */
(function () {
  'use strict';
  var ZP = window.ZP, M = Math;
  var W = 1280, H = 720, HORIZON = 238, F = 560;
  var INK = '#2a1d4e';

  // Themes: sky, jelly sea, hills and keycap colours. One per three stages.
  var THEMES = [
    { name: 'بحر العلكة', sky: ['#ffb8de', '#fff0f8'], sea: ['#ff7ab8', '#e0418f'], hill: '#ff9fd0', hill2: '#ffc6e4', keys: ['#ff5fa2', '#c77dff', '#ff8cc6', '#9d7bff', '#ffb0d6'], pad: '#ffe36e', sun: '#fff7a8' },
    { name: 'ليمون ونعناع', sky: ['#b8f5d8', '#fffbd0'], sea: ['#43d6a4', '#1fae84'], hill: '#7ee6b8', hill2: '#c2f5d9', keys: ['#ffd93d', '#6be38f', '#fff27a', '#3fcf9a', '#b5f56b'], pad: '#ff8ac0', sun: '#ffffff' },
    { name: 'سماء التوت', sky: ['#9fd8ff', '#e8f6ff'], sea: ['#4aa8ff', '#2a74e0'], hill: '#7cc4ff', hill2: '#b9e2ff', keys: ['#4fc3ff', '#7a8cff', '#5cf0e0', '#a98bff', '#8fd8ff'], pad: '#ffd93d', sun: '#ffffff' },
    { name: 'غروب البرتقال', sky: ['#ff9a5c', '#ffd98a'], sea: ['#ff6a3d', '#d9402a'], hill: '#ff8752', hill2: '#ffb57a', keys: ['#ff7a3d', '#ffc93d', '#ff4f6d', '#ffa53d', '#c94fff'], pad: '#6be38f', sun: '#fff1a8' },
    { name: 'مجرّة الحلوى', sky: ['#1c1150', '#5a2ca8'], sea: ['#7d3cff', '#4b1fb0'], hill: '#3a1f8a', hill2: '#5530b0', keys: ['#ff4fd8', '#4ff0ff', '#b44dff', '#ffe14f', '#4fff9a'], pad: '#ff8ac0', sun: '#ffe9ff', stars: true },
    { name: 'قوس قزح', sky: ['#a8e7ff', '#fff2c8'], sea: ['#ff7ab8', '#9d7bff'], hill: '#9be08a', hill2: '#c9f0a8', keys: ['#ff5a5a', '#ffa53d', '#ffe14f', '#5fd068', '#4fa8ff', '#a86bff'], pad: '#ffffff', sun: '#ffffff' }
  ];
  ZP.THEME_ART = THEMES;
  var GLYPHS = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890'.split('').concat('ضصثقفغعهخحجشسيبلاتنمكطذرزوة'.split(''));

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  // Each theme's key colours, lit and dark, worked out once.
  THEMES.forEach(function (t) {
    t.lit = t.keys.map(function (c) { return shade(c, 0.35); });
    t.dark = t.keys.map(function (c) { return shade(c, -0.32); });
    t.padDark = shade(t.pad, -0.3);
  });
  function easeBack(p) { var c = 1.9; p -= 1; return 1 + (c + 1) * p * p * p + c * p * p; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  /* ----------------------------------------------------------- the runners */
  // ctx at the runner's feet (x, y), size = body height in pixels. o: { t, run (0..1),
  // eyes [{x,y}] pupil offsets, squash, air }.
  function blob(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, M.PI * 2); }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  ZP.rrect = rrect;
  function googly(ctx, x, y, r, px, py) {
    blob(ctx, x, y, r, r); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = M.max(1.5, r * 0.18); ctx.strokeStyle = INK; ctx.stroke();
    blob(ctx, x + px * r * 0.45, y + py * r * 0.45, r * 0.5, r * 0.5); ctx.fillStyle = INK; ctx.fill();
  }
  var SKIN_ART = {
    toast: { body: '#f3c27a', edge: '#b5732f', shape: 'square', top: 'butter' },
    potato: { body: '#c9935a', edge: '#8a5a2b', shape: 'potato', top: 'sprout' },
    duck: { body: '#ffd93d', edge: '#d9a400', shape: 'round', top: 'beak' },
    pickle: { body: '#6cc04a', edge: '#3c7d2a', shape: 'tall', top: 'bumps' },
    orange: { body: '#ff9a2e', edge: '#d9661a', shape: 'round', top: 'leaf', shades: true },
    cupcake: { body: '#ff9ecb', edge: '#c9578e', shape: 'cupcake', top: 'cherry' },
    banana: { body: '#ffe14f', edge: '#c9a400', shape: 'banana', top: 'tip' },
    jelly: { body: 'rgba(96,230,160,0.82)', edge: '#2fa874', shape: 'jelly', top: 'shine' },
    toaster: { body: '#ffd23f', edge: '#c98f00', shape: 'toaster', top: 'slices', shades: true }
  };
  ZP.drawRunner = function (ctx, id, x, y, size, o) {
    o = o || {};
    var a = SKIN_ART[id] || SKIN_ART.toast, t = o.t || 0, run = o.run || 0;
    var sq = 1 + (o.squash || 0), w = size * 0.78 / M.sqrt(sq), h = size * sq;
    var swing = M.sin(t * 16) * run, bob = M.abs(M.cos(t * 16)) * run * size * 0.06;
    var lw = M.max(2, size * 0.055);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // legs and shoes
    var legY = y - size * 0.2 - bob;
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 1.3;
    for (var s = -1; s <= 1; s += 2) {
      var fx = x + s * w * 0.22 + swing * s * size * 0.16 * (o.air ? 0.3 : 1), fy = y - (o.air ? size * 0.08 : M.max(0, swing * s) * size * 0.12);
      ctx.beginPath(); ctx.moveTo(x + s * w * 0.18, legY); ctx.lineTo(fx, fy); ctx.stroke();
      blob(ctx, fx + s * size * 0.04, fy, size * 0.1, size * 0.055); ctx.fillStyle = o.shoe || '#ff4f6d'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.stroke(); ctx.lineWidth = lw * 1.3;
    }
    var by = y - size * 0.18 - bob, top = by - h;
    // arms (flailing)
    var flail = o.air ? 1 : run;
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var ax = x + s2 * w * 0.48, ay = top + h * 0.55;
      var hx = ax + s2 * size * 0.2, hy = ay - size * (0.05 + 0.18 * flail * (0.5 + 0.5 * M.sin(t * 13 + s2)));
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
      blob(ctx, hx, hy, size * 0.05, size * 0.05); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke(); ctx.lineWidth = lw * 1.3;
    }
    // body
    ctx.lineWidth = lw; ctx.fillStyle = a.body; ctx.strokeStyle = INK;
    switch (a.shape) {
      case 'square': rrect(ctx, x - w / 2, top, w, h, w * 0.28); break;
      case 'potato': ctx.beginPath(); ctx.moveTo(x - w * 0.45, top + h * 0.5);
        ctx.bezierCurveTo(x - w * 0.55, top - h * 0.05, x + w * 0.4, top - h * 0.08, x + w * 0.5, top + h * 0.4);
        ctx.bezierCurveTo(x + w * 0.6, top + h * 1.05, x - w * 0.4, top + h * 1.08, x - w * 0.45, top + h * 0.5); ctx.closePath(); break;
      case 'tall': rrect(ctx, x - w * 0.36, top - h * 0.12, w * 0.72, h * 1.12, w * 0.36); break;
      case 'cupcake': ctx.beginPath(); ctx.moveTo(x - w * 0.4, top + h * 0.5); ctx.lineTo(x + w * 0.4, top + h * 0.5); ctx.lineTo(x + w * 0.32, top + h); ctx.lineTo(x - w * 0.32, top + h); ctx.closePath();
        ctx.fillStyle = '#c98a4a'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - w * 0.5, top + h * 0.55);
        for (var k = 0; k <= 4; k++) ctx.quadraticCurveTo(x - w * 0.5 + w * (k + 0.5) / 4.6, top - h * 0.05 + (k % 2) * h * 0.08, x - w * 0.5 + w * (k + 1) / 4.6 * 1.0, top + h * 0.5);
        ctx.lineTo(x + w * 0.5, top + h * 0.55); ctx.closePath(); ctx.fillStyle = a.body; break;
      case 'banana': ctx.beginPath(); ctx.moveTo(x - w * 0.15, top - h * 0.05);
        ctx.quadraticCurveTo(x + w * 0.75, top + h * 0.3, x + w * 0.05, top + h);
        ctx.quadraticCurveTo(x - w * 0.6, top + h * 0.9, x - w * 0.42, top + h * 0.35);
        ctx.quadraticCurveTo(x - w * 0.3, top + h * 0.05, x - w * 0.15, top - h * 0.05); ctx.closePath(); break;
      case 'jelly': rrect(ctx, x - w / 2, top, w, h, w * 0.18); break;
      case 'toaster': rrect(ctx, x - w * 0.55, top + h * 0.12, w * 1.1, h * 0.88, w * 0.2); break;
      default: blob(ctx, x, top + h * 0.52, w * 0.52, h * 0.52);
    }
    ctx.fill(); ctx.stroke();
    // details
    if (a.shape === 'square') { rrect(ctx, x - w * 0.36, top + h * 0.14, w * 0.72, h * 0.74, w * 0.2); ctx.fillStyle = '#ffe1a8'; ctx.fill(); }
    if (a.top === 'butter') { rrect(ctx, x - w * 0.16, top - h * 0.06, w * 0.32, h * 0.14, 4); ctx.fillStyle = '#fff27a'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke(); }
    if (a.shape === 'potato') { ctx.fillStyle = a.edge; [[-0.25, 0.75], [0.28, 0.68], [0.05, 0.9], [0.3, 0.28]].forEach(function (p) { blob(ctx, x + p[0] * w, top + p[1] * h, size * 0.03, size * 0.025); ctx.fill(); }); }
    if (a.top === 'sprout') { ctx.fillStyle = '#5fd068'; ctx.beginPath(); ctx.ellipse(x + w * 0.05, top - h * 0.02, size * 0.08, size * 0.035, -0.6, 0, M.PI * 2); ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.stroke(); }
    if (a.top === 'bumps') { ctx.fillStyle = a.edge; for (var b = 0; b < 6; b++) { blob(ctx, x + (hash(b, 3) - 0.5) * w * 0.5, top + h * (0.15 + b * 0.14), size * 0.022, size * 0.022); ctx.fill(); } }
    if (a.top === 'leaf') { ctx.fillStyle = '#4fbf5a'; ctx.beginPath(); ctx.ellipse(x + w * 0.12, top + h * 0.02, size * 0.1, size * 0.045, -0.5, 0, M.PI * 2); ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.stroke(); }
    if (a.top === 'cherry') { blob(ctx, x, top - h * 0.04, size * 0.07, size * 0.07); ctx.fillStyle = '#ff3d5a'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke(); }
    if (a.top === 'tip') { blob(ctx, x - w * 0.15, top - h * 0.03, size * 0.04, size * 0.04); ctx.fillStyle = '#6b4a1f'; ctx.fill(); }
    if (a.top === 'shine') { ctx.fillStyle = 'rgba(255,255,255,0.65)'; rrect(ctx, x - w * 0.36, top + h * 0.1, w * 0.18, h * 0.32, 6); ctx.fill(); }
    if (a.top === 'slices') {
      ctx.lineWidth = lw * 0.8;
      for (var sl = -1; sl <= 1; sl += 2) { rrect(ctx, x + sl * w * 0.25 - w * 0.17, top - h * 0.14 - (sl > 0 ? M.abs(M.sin(t * 6)) * size * 0.06 : 0), w * 0.34, h * 0.36, 6); ctx.fillStyle = '#f3c27a'; ctx.fill(); ctx.stroke(); }
      rrect(ctx, x - w * 0.55, top + h * 0.12, w * 1.1, h * 0.88, w * 0.2); ctx.fillStyle = a.body; ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; rrect(ctx, x - w * 0.45, top + h * 0.2, w * 0.16, h * 0.55, 5); ctx.fill();
    }
    if (a.shape === 'jelly' && a.top === 'shine') { /* the shine above is enough */ }
    // face
    var eyeY = top + h * (a.shape === 'cupcake' ? 0.7 : a.shape === 'toaster' ? 0.5 : 0.4), er = size * 0.13;
    var pe = o.eyes || [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    if (a.shades) {
      ctx.fillStyle = INK;
      rrect(ctx, x - w * 0.42, eyeY - er * 0.7, w * 0.38, er * 1.3, er * 0.5); ctx.fill();
      rrect(ctx, x + w * 0.04, eyeY - er * 0.7, w * 0.38, er * 1.3, er * 0.5); ctx.fill();
      ctx.fillRect(x - w * 0.06, eyeY - er * 0.4, w * 0.12, er * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x - w * 0.34, eyeY - er * 0.45, w * 0.08, er * 0.3); ctx.fillRect(x + w * 0.12, eyeY - er * 0.45, w * 0.08, er * 0.3);
    } else {
      googly(ctx, x - w * 0.2, eyeY, er * 1.05, pe[0].x, pe[0].y);
      googly(ctx, x + w * 0.2, eyeY - er * 0.1, er * 0.85, pe[1].x, pe[1].y);
    }
    if (a.top === 'beak') { ctx.beginPath(); ctx.ellipse(x, eyeY + er * 1.2, w * 0.22, er * 0.55, 0, 0, M.PI * 2); ctx.fillStyle = '#ff8a2e'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.stroke(); }
    else {
      // a big silly open grin
      ctx.beginPath(); ctx.moveTo(x - w * 0.18, eyeY + er * 1.1);
      ctx.quadraticCurveTo(x, eyeY + er * (1.9 + 0.5 * (o.air ? 1 : run)), x + w * 0.18, eyeY + er * 1.1); ctx.closePath();
      ctx.fillStyle = '#7a1f3d'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke();
      ctx.fillStyle = '#ff7a9a'; blob(ctx, x, eyeY + er * 1.55, w * 0.07, er * 0.2); ctx.fill();
    }
  };

  /* ------------------------------------------------------- small sprites */
  function bolt(ctx, x, y, s, fill) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.12, y - s * 0.5); ctx.lineTo(x - s * 0.32, y + s * 0.06); ctx.lineTo(x - s * 0.02, y + s * 0.06);
    ctx.lineTo(x - s * 0.14, y + s * 0.5); ctx.lineTo(x + s * 0.32, y - s * 0.08); ctx.lineTo(x + s * 0.02, y - s * 0.08); ctx.closePath();
    ctx.fillStyle = fill || '#ffe14f'; ctx.fill(); ctx.lineWidth = M.max(2, s * 0.08); ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function trophy(ctx, x, y, s) {
    ctx.lineWidth = M.max(2, s * 0.08); ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.fillStyle = '#ffc928';
    ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.18, s * 0.16, M.PI * 0.5, M.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.18, s * 0.16, -M.PI * 0.5, M.PI * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.32, y - s * 0.42); ctx.lineTo(x + s * 0.32, y - s * 0.42); ctx.quadraticCurveTo(x + s * 0.3, y + s * 0.08, x, y + s * 0.1);
    ctx.quadraticCurveTo(x - s * 0.3, y + s * 0.08, x - s * 0.32, y - s * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - s * 0.07, y + s * 0.08, s * 0.14, s * 0.16); ctx.strokeRect(x - s * 0.07, y + s * 0.08, s * 0.14, s * 0.16);
    rrect(ctx, x - s * 0.24, y + s * 0.24, s * 0.48, s * 0.16, s * 0.05); ctx.fill(); ctx.stroke();
  }
  ZP.bolt = bolt; ZP.trophy = trophy;
  function duck(ctx, x, y, s, t) {
    ctx.lineWidth = M.max(2, s * 0.05); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    var wob = M.sin(t * 5) * 0.06;
    ctx.save(); ctx.translate(x, y); ctx.rotate(wob);
    ctx.fillStyle = '#ffd93d';
    ctx.beginPath(); ctx.ellipse(0, -s * 0.28, s * 0.5, s * 0.28, 0, 0, M.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-s * 0.18, -s * 0.66, s * 0.24, 0, M.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff8a2e'; ctx.beginPath(); ctx.ellipse(-s * 0.4, -s * 0.6, s * 0.14, s * 0.07, 0.2, 0, M.PI * 2); ctx.fill(); ctx.stroke();
    googly(ctx, -s * 0.2, -s * 0.72, s * 0.09, 0.5, 0.2);
    ctx.fillStyle = '#f2c200'; ctx.beginPath(); ctx.ellipse(s * 0.12, -s * 0.3, s * 0.2, s * 0.1, -0.3, 0, M.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function cube(ctx, x, y, s, t, col) {
    var sq = 1 + M.sin(t * 7) * 0.08;
    var w = s * 0.86 / sq, h = s * 0.8 * sq;
    ctx.lineWidth = M.max(2, s * 0.05); ctx.strokeStyle = INK;
    rrect(ctx, x - w / 2, y - h, w, h, s * 0.16); ctx.fillStyle = col; ctx.globalAlpha = 0.88; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; rrect(ctx, x - w * 0.36, y - h * 0.86, w * 0.18, h * 0.4, s * 0.06); ctx.fill();
    googly(ctx, x - w * 0.14, y - h * 0.55, s * 0.09, M.sin(t * 3), 0.2); googly(ctx, x + w * 0.16, y - h * 0.55, s * 0.08, M.sin(t * 3), 0.2);
    ctx.beginPath(); ctx.arc(x, y - h * 0.32, s * 0.08, 0, M.PI); ctx.fillStyle = INK; ctx.fill();
  }
  var FONTS = {};
  function fontOf(px) {
    var q = M.max(12, M.round(px / 4) * 4);
    return FONTS[q] || (FONTS[q] = '700 ' + q + 'px Fredoka');
  }
  // Pre-rendered sprite sheet of all keycap glyphs (8x8 grid of 64x64 cells),
  // avoiding per-frame ctx.font mutations and glyph rasterization on no-GPU PCs.
  var GLYPH_CELL = 64, GLYPH_COLS = 8;
  function buildGlyphAtlas() {
    var cv = document.createElement('canvas');
    cv.width = GLYPH_COLS * GLYPH_CELL;
    cv.height = M.ceil(GLYPHS.length / GLYPH_COLS) * GLYPH_CELL;
    var g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = '700 44px Fredoka';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'ltr';
    for (var i = 0; i < GLYPHS.length; i++) {
      var col = i % GLYPH_COLS, row = (i / GLYPH_COLS) | 0;
      g.fillText(GLYPHS[i], col * GLYPH_CELL + GLYPH_CELL / 2, row * GLYPH_CELL + GLYPH_CELL / 2);
    }
    return cv;
  }
  function goldKey(ctx, x, y, s, t, rainbow) {
    var b = M.sin(t * 4) * s * 0.08, sp = M.cos(t * 3);
    var w = s * 0.7 * (0.35 + 0.65 * M.abs(sp));
    ctx.lineWidth = M.max(2, s * 0.06); ctx.strokeStyle = INK;
    rrect(ctx, x - w / 2, y - s * 0.95 + b, w, s * 0.6, s * 0.12);
    if (rainbow) {
      var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, '#ff5a5a'); g.addColorStop(0.35, '#ffe14f'); g.addColorStop(0.65, '#4fd8ff'); g.addColorStop(1, '#b44dff');
      ctx.fillStyle = g;
    } else ctx.fillStyle = '#ffc928';
    ctx.fill(); ctx.stroke();
    if (M.abs(sp) > 0.5) {
      ctx.fillStyle = rainbow ? '#fff' : '#fff6c2';
      ctx.font = fontOf(s * 0.34); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
      ctx.fillText(rainbow ? '×2' : '+10', x, y - s * 0.65 + b);
    }
  }
  function chest(ctx, x, y, s, t) {
    ctx.lineWidth = M.max(2, s * 0.05); ctx.strokeStyle = INK;
    rrect(ctx, x - s * 0.45, y - s * 0.5, s * 0.9, s * 0.5, s * 0.08); ctx.fillStyle = '#b86b2a'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.5); ctx.quadraticCurveTo(x, y - s * (0.95 + M.sin(t * 6) * 0.04), x + s * 0.45, y - s * 0.5); ctx.closePath(); ctx.fillStyle = '#d98a3a'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffc928'; ctx.fillRect(x - s * 0.08, y - s * 0.58, s * 0.16, s * 0.2); ctx.strokeRect(x - s * 0.08, y - s * 0.58, s * 0.16, s * 0.2);
  }

  /* ---------------------------------------------------------------- view */
  ZP.createView = function (ctx) {
    var v = { calm: false, theme: -1, sky: null, sea: null, hills: [], stars: [], hitAt: {}, eyes: [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }] };
    var cam = { x: 2, z: -8, h: 3.3 };
    var glyphAtlas = buildGlyphAtlas();
    v.rebuildGlyphs = function () { glyphAtlas = buildGlyphAtlas(); };
    // Reused projection output structs (zero per-frame heap allocations).
    var P0 = { x: 0, y: 0, s: 0, dz: 0 }, PA = { x: 0, y: 0, s: 0, dz: 0 }, PB = { x: 0, y: 0, s: 0, dz: 0 };
    var PC = { x: 0, y: 0, s: 0, dz: 0 }, PD = { x: 0, y: 0, s: 0, dz: 0 }, PE = { x: 0, y: 0, s: 0, dz: 0 }, PF = { x: 0, y: 0, s: 0, dz: 0 };
    var runnerPos = { x: 0, y: 0, s: 0 };
    var runnerOpts = { t: 0, run: 0, eyes: v.eyes, squash: 0, air: false, shoe: '' };
    function setTheme(i) {
      if (i === v.theme) return;
      v.theme = i;
      var t = THEMES[i];
      v.sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
      v.sky.addColorStop(0, t.sky[0]); v.sky.addColorStop(1, t.sky[1]);
      v.sea = ctx.createLinearGradient(0, HORIZON, 0, H);
      v.sea.addColorStop(0, t.sea[0]); v.sea.addColorStop(1, t.sea[1]);
      v.hills = [];
      for (var layer = 0; layer < 2; layer++) {
        var pts = [], n = 9 + layer * 3;
        for (var k = 0; k <= n; k++) pts.push([k / n * (W + 200) - 100, HORIZON - (layer ? 24 : 58) - hash(k + i * 31, layer) * (layer ? 40 : 70)]);
        v.hills.push(pts);
      }
      v.stars = [];
      if (t.stars) for (var s = 0; s < 70; s++) v.stars.push([hash(s, 7) * W, hash(s, 9) * HORIZON, 1 + hash(s, 11) * 2.5]);
    }
    v.setTheme = setTheme;
    function proj(X, Y, Z, out) {
      var o = out || P0, dz = Z - cam.z, s = F / dz;
      o.x = W / 2 + (X - cam.x) * s; o.y = HORIZON + (cam.h - Y) * s; o.s = s; o.dz = dz;
      return o;
    }
    v.proj = proj;
    // Quad from four projected points.
    function quad(a, b, c, d, fill) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    }
    function background(t) {
      var th = THEMES[v.theme];
      ctx.fillStyle = v.sky; ctx.fillRect(0, 0, W, HORIZON + 1);
      for (var s = 0; s < v.stars.length; s++) { var st = v.stars[s]; ctx.fillStyle = (s + M.floor(t * 2)) % 9 ? '#fff' : '#ffe14f'; ctx.fillRect(st[0], st[1], st[2], st[2]); }
      ctx.fillStyle = th.sun; ctx.globalAlpha = 0.85; blob(ctx, 980, 92, 54, 54); ctx.fill(); ctx.globalAlpha = 1;
      // clouds drift (still when motion is reduced)
      var drift = v.calm ? 0 : t * 12;
      ctx.fillStyle = th.stars ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)';
      for (var c = 0; c < 4; c++) {
        var cx = ((c * 360 + drift * (1 + c * 0.2)) % (W + 300)) - 150, cy = 50 + c * 34 % 110;
        blob(ctx, cx, cy, 60, 20); ctx.fill(); blob(ctx, cx + 34, cy - 12, 36, 20); ctx.fill(); blob(ctx, cx - 30, cy - 6, 30, 16); ctx.fill();
      }
      var sx = -(cam.x - 2) * 30;
      for (var layer = 0; layer < 2; layer++) {
        var pts = v.hills[layer];
        ctx.beginPath(); ctx.moveTo(pts[0][0] + sx * (layer + 1) * 0.5, HORIZON + 2);
        for (var k = 0; k < pts.length; k++) ctx.lineTo(pts[k][0] + sx * (layer + 1) * 0.5, pts[k][1]);
        ctx.lineTo(pts[pts.length - 1][0] + sx, HORIZON + 2); ctx.closePath();
        ctx.fillStyle = layer ? th.hill : th.hill2; ctx.fill();
      }
      ctx.fillStyle = v.sea; ctx.fillRect(0, HORIZON, W, H - HORIZON);
      // jelly ripples
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 3;
      for (var r = 0; r < 6; r++) {
        var ry = HORIZON + 14 + r * r * 13, ph = v.calm ? 0 : t * (1 + r * 0.3);
        ctx.beginPath();
        for (var xx = 0; xx <= W; xx += 64) { var yy = ry + M.sin(xx * 0.02 + ph + r) * (2 + r); if (xx) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
        ctx.stroke();
      }
      // mini pastel candy islands & bobbing buoys along the left/right sea flanks
      var islands = [[136, 438, 1, 0], [1144, 442, -1, 2]];
      for (var ii = 0; ii < islands.length; ii++) {
        var ix = islands[ii][0] + sx * 0.65, iy = islands[ii][1], sd = islands[ii][2], kc = th.keys[islands[ii][3] % th.keys.length];
        var ib = v.calm ? 0 : M.sin(t * 1.6 + ii * 2.1) * 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
        blob(ctx, ix, iy + 8 + ib, 64, 15); ctx.stroke();
        ctx.fillStyle = th.pad; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(ix, iy + 4 + ib, 52, 16, 0, M.PI, 0, false); ctx.quadraticCurveTo(ix, iy + 14 + ib, ix - 52, iy + 4 + ib); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ix - sd * 10, iy - 6 + ib); ctx.quadraticCurveTo(ix - sd * 2, iy - 34 + ib, ix + sd * 12, iy - 52 + ib); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = INK;
        blob(ctx, ix + sd * 12, iy - 56 + ib, 16, 16); ctx.fillStyle = kc; ctx.fill(); ctx.stroke();
        blob(ctx, ix + sd * 12, iy - 56 + ib, 8, 8); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        blob(ctx, ix - sd * 22, iy - 12 + ib, 10, 10); ctx.fillStyle = th.keys[(islands[ii][3] + 1) % th.keys.length]; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      }
      var buoys = [[234, 540, 0.95, 1], [1046, 546, 0.95, 3], [84, 588, 1.1, 4], [1192, 514, 0.85, 0]];
      for (var bi = 0; bi < buoys.length; bi++) {
        var bx = buoys[bi][0] + sx * 0.9, by = buoys[bi][1], bs = buoys[bi][2], bc = th.keys[buoys[bi][3] % th.keys.length];
        var bb = v.calm ? 0 : M.sin(t * 2.4 + bi * 1.7) * 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 2.5;
        blob(ctx, bx, by + 10 * bs + bb, 26 * bs, 8 * bs); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        blob(ctx, bx, by + bb, 18 * bs, 11 * bs); ctx.fill(); ctx.stroke();
        ctx.fillStyle = bc;
        ctx.beginPath(); ctx.ellipse(bx, by + bb, 18 * bs, 11 * bs, 0, -0.4, 0.55); ctx.lineTo(bx, by + bb); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(bx, by + bb, 18 * bs, 11 * bs, 0, M.PI - 0.55, M.PI + 0.4); ctx.lineTo(bx, by + bb); ctx.closePath(); ctx.fill();
        blob(ctx, bx, by + bb, 7 * bs, 4.5 * bs); ctx.fillStyle = th.sea[0]; ctx.fill(); ctx.stroke();
      }
    }
    // A wide platform (the pads at the start of each stage) with its gate.
    function pad(z0, z1, label, th, t) {
      var a = proj(-0.7, 0.3, z0, PA), b = proj(4.7, 0.3, z0, PB), c = proj(4.7, 0.3, z1, PC), d = proj(-0.7, 0.3, z1, PD);
      if (a.dz < 0.35) { var zc = cam.z + 0.35; a = proj(-0.7, 0.3, zc, PA); b = proj(4.7, 0.3, zc, PB); }
      if (c.dz < 0.35) return;
      var z0c = z0 < cam.z + 0.35 ? cam.z + 0.35 : z0;
      var a0 = proj(-0.7, -0.3, z0c, PE), b0 = proj(4.7, -0.3, z0c, PF);
      quad(a, b, b0, a0, th.padDark);
      quad(a, b, c, d, th.pad);
      // checker stripes
      for (var k = 1; k < 6; k += 2) {
        var zz0 = z0 + (z1 - z0) * k / 6, zz1 = z0 + (z1 - z0) * (k + 1) / 6;
        if (zz0 - cam.z < 0.35) continue;
        quad(proj(-0.7, 0.3, zz0, PA), proj(4.7, 0.3, zz0, PB), proj(4.7, 0.3, zz1, PC), proj(-0.7, 0.3, zz1, PD), 'rgba(255,255,255,0.35)');
      }
      // the gate at the far end of the pad
      var gl = proj(-0.6, 0.3, z1, PA), gr = proj(4.6, 0.3, z1, PB), gt = proj(2, 3.4, z1, PC);
      if (gl.dz < 0.6) return;
      var pw = M.max(3, gl.s * 0.28);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = M.max(2, gl.s * 0.05);
      ctx.fillRect(gl.x - pw / 2, gt.y, pw, gl.y - gt.y); ctx.strokeRect(gl.x - pw / 2, gt.y, pw, gl.y - gt.y);
      ctx.fillRect(gr.x - pw / 2, gt.y, pw, gr.y - gt.y); ctx.strokeRect(gr.x - pw / 2, gt.y, pw, gr.y - gt.y);
      var bh = gl.s * 0.75;
      rrect(ctx, gl.x - pw, gt.y - bh * 0.6, gr.x - gl.x + pw * 2, bh, bh * 0.3); ctx.fillStyle = th.keys[0]; ctx.fill(); ctx.stroke();
      rrect(ctx, gl.x - pw * 0.4, gt.y - bh * 0.48, gr.x - gl.x + pw * 0.8, bh * 0.2, bh * 0.1); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
      if (bh > 12) {
        ctx.fillStyle = '#fff'; ctx.font = fontOf(bh * 0.62); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.fillText(label, (gl.x + gr.x) / 2, gt.y - bh * 0.1);
        ctx.direction = 'ltr';
      }
    }
    function ramp(spec, th, need, speed) {
      var z0 = spec.rows, z1 = spec.rows + ZP.RAMP;
      if (z1 - cam.z < 0.4) return;
      var zs = M.max(z0, cam.z + 0.4);
      var hs = 0.32 + (zs - z0) / ZP.RAMP * 1.1;
      var a = proj(-0.5, hs, zs, PA), b = proj(4.5, hs, zs, PB), c = proj(4.5, 1.42, z1, PC), d = proj(-0.5, 1.42, z1, PD);
      var ok = speed >= need;
      quad(proj(-0.5, -0.2, zs, PE), proj(4.5, -0.2, zs, PF), b, a, '#c9c3e8');
      quad(a, b, c, d, ok ? '#7dffb0' : '#ffffff');
      for (var k = 1; k < 4; k++) {
        var zz = z0 + ZP.RAMP * k / 4; if (zz < zs) continue;
        var hh = 0.32 + (zz - z0) / ZP.RAMP * 1.1, l = proj(-0.5, hh, zz, PE), r = proj(4.5, hh, zz, PF);
        ctx.strokeStyle = ok ? '#3ccf7a' : '#e0dcf5'; ctx.lineWidth = M.max(1, l.s * 0.04); ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      }
      var mid = proj(2, 0.32 + 1.1 * 0.55, z0 + ZP.RAMP * 0.55, PE);
      if (mid.s > 18) {
        ctx.save(); ctx.translate(mid.x, mid.y); ctx.scale(1, 0.55);
        ctx.fillStyle = ok ? '#1f8a4c' : '#9a93c0'; ctx.font = fontOf(mid.s * 0.8); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.fillText('مسافة', 0, 0); ctx.direction = 'ltr';
        ctx.restore();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = M.max(1.5, c.s * 0.05);
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    function keyRow(spec, row, th, pz, build, maxRow, t) {
      var z0 = row + 0.05, z1 = row + 0.95;
      if (z1 - cam.z < 0.4) return;
      if (z0 - cam.z < 0.4) z0 = cam.z + 0.4;
      var near = proj(0, 0, z0, PE), far = near.s < 22;
      var ahead = row - build, pop = ahead > 0 ? 0 : M.min(1, -ahead / 1.6);
      var nk = th.keys.length;
      for (var lane = 0; lane < ZP.LANES; lane++) {
        var x0 = lane - 0.46, x1 = lane + 0.46, ci = (lane + row * 2) % nk;
        if (pop <= 0) {
          // not built yet: a see-through outline
          if (far) continue;
          var ga = proj(x0, 0.08, z0, PA), gb = proj(x1, 0.08, z0, PB), gc = proj(x1, 0.08, z1, PC), gd = proj(x0, 0.08, z1, PD);
          ctx.beginPath(); ctx.moveTo(ga.x, ga.y); ctx.lineTo(gb.x, gb.y); ctx.lineTo(gc.x, gc.y); ctx.lineTo(gd.x, gd.y); ctx.closePath();
          ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
          continue;
        }
        var pressed = row <= maxRow ? M.min(1, M.max(0, (pz - row) / 0.7)) : 0;
        var hgt = (0.34 - 0.2 * pressed) * (v.calm ? (pop > 0 ? 1 : 0) : easeBack(pop));
        var a = proj(x0, hgt, z0, PA), b = proj(x1, hgt, z0, PB), c = proj(x1, hgt, z1, PC), d = proj(x0, hgt, z1, PD);
        if (!far) quad(a, b, proj(x1, -0.1, z0, PE), proj(x0, -0.1, z0, PF), th.dark[ci]);
        quad(a, b, c, d, row <= maxRow ? th.lit[ci] : th.keys[ci]);
        if (!far && a.s > 34) {
          var gi = M.floor(hash(row, lane) * GLYPHS.length);
          var cx = (a.x + b.x + c.x + d.x) * 0.25, cy = (a.y + b.y + c.y + d.y) * 0.25;
          var gw = a.s * 0.61, gh = gw * 0.55;
          ctx.drawImage(glyphAtlas, (gi % GLYPH_COLS) * GLYPH_CELL, ((gi / GLYPH_COLS) | 0) * GLYPH_CELL, GLYPH_CELL, GLYPH_CELL, cx - gw * 0.5, cy - gh * 0.5, gw, gh);
        }
      }
    }
    function obstacle(o, j, w, t) {
      var x = o.kind === 'cube' ? ZP.cubeX(o, w.at) : o.lane, z = o.row + 0.5, y = 0.34;
      if (w.hit[j]) {
        if (v.hitAt[j] === undefined) v.hitAt[j] = t;
        var k = t - v.hitAt[j]; if (k > 1.2) return;
        y += 6 * k - 4 * k * k + 0.5; x += (x < 2 ? -1 : 1) * 4 * k; z += 3 * k;
      } else if (v.hitAt[j] !== undefined) {
        delete v.hitAt[j];
      }
      var p = proj(x, y, z, PA);
      if (p.dz < 0.6) return;
      if (o.kind === 'cube') cube(ctx, p.x, p.y, p.s * 0.95, t + j, THEMES[v.theme].keys[(j + 1) % 5]);
      else duck(ctx, p.x, p.y, p.s * 0.95, t + j);
    }
    function pickup(pk, t) {
      var p = proj(pk.lane, 0.34, pk.row + 0.5, PA);
      if (p.dz < 0.6) return;
      if (pk.kind === 'chest') chest(ctx, p.x, p.y, p.s * 0.9, t);
      else goldKey(ctx, p.x, p.y, p.s, t + pk.row, pk.kind === 'turbo');
    }
    function updateEyes(dt, w) {
      // springy googly pupils: they lag behind the runner's bobbing and sideways moves
      var push = w ? (w.lane - w.x) * 0.6 : 0;
      for (var i = 0; i < 2; i++) {
        var e = v.eyes[i];
        var tx = -push + (w && w.phase === 'fly' ? M.sin(w.t * 20 + i) * 0.6 : 0), ty = w && w.v > 1 ? -0.3 + M.sin(w.t * 16 + i * 2) * 0.5 : 0.3;
        e.vx += ((tx - e.x) * 90 - e.vx * 7) * dt; e.vy += ((ty - e.y) * 90 - e.vy * 7) * dt;
        e.x = M.max(-1, M.min(1, e.x + e.vx * dt)); e.y = M.max(-1, M.min(1, e.y + e.vy * dt));
      }
    }
    v.runnerAt = null;
    // w: the world (or a demo world); o: { skin, shoe, need, speed, dt, t, squash }
    v.render = function (w, o) {
      var t = o.t, spec = w.spec, th;
      setTheme(spec.theme);
      th = THEMES[v.theme];
      // camera follows the runner, a little lazily sideways, higher while flying
      cam.x += (2 + (w.x - 2) * 0.55 - cam.x) * M.min(1, o.dt * 6);
      cam.z = w.z - 5.2;
      cam.h = 3.3 + M.max(0, w.y) * 0.55;
      updateEyes(o.dt, w);
      background(t);
      var build = w.z + 2.5 + w.v * 0.42;
      var zFar = cam.z + 46;
      var nextStart = spec.rows + ZP.RAMP + spec.gap;
      // far to near: next stage's keys, its pad, the ramp, this stage's keys, this pad
      if (nextStart < zFar) {
        var nth = THEMES[ZP.theme(spec.n + 1)];
        for (var nr = M.min(zFar - nextStart - ZP.PAD, 30) | 0; nr >= 0; nr--) keyRow(spec, nextStart + ZP.PAD + nr, nth, -99, 1e9, -1, t);
        pad(nextStart, nextStart + ZP.PAD, 'المرحلة ' + (spec.n + 1), nth, t);
      }
      ramp(spec, th, o.need, o.speed);
      var first = M.max(0, M.floor(cam.z + 0.4)), last = M.min(spec.rows - 1, M.floor(zFar));
      var runnerRow = M.floor(w.z), drawn = false;
      for (var row = last; row >= first; row--) {
        keyRow(spec, row, th, w.z, build, w.maxRow, t);
        // things standing on this row, after its keys
        for (var i = 0; i < spec.picks.length; i++) if (spec.picks[i].row === row && !w.got[i]) pickup(spec.picks[i], t);
        for (var j = 0; j < spec.obs.length; j++) if (spec.obs[j].row === row) obstacle(spec.obs[j], j, w, t);
        if (row === runnerRow && w.phase !== 'fly' && w.phase !== 'fall') { drawRunner(w, o, t); drawn = true; }
      }
      if (cam.z < 0) pad(-ZP.PAD, 0, 'انطلق!', th, t);
      if (!drawn && w.phase !== 'fall') drawRunner(w, o, t);
      if (w.phase === 'fall') drawSplash(w, o, t);
    };
    function drawRunner(w, o, t) {
      var p = proj(w.x, 0.34 + M.max(0, w.y), w.z + 0.5, PA);
      if (p.dz < 0.5) return;
      var size = p.s * 1.05;
      var run = M.min(1, w.v / 8);
      var sq = o.squash || 0;
      runnerPos.x = p.x; runnerPos.y = p.y - size * 0.9; runnerPos.s = size;
      v.runnerAt = runnerPos;
      runnerOpts.t = t; runnerOpts.run = w.phase === 'bonk' ? 0 : run; runnerOpts.squash = sq; runnerOpts.air = w.phase === 'fly'; runnerOpts.shoe = o.shoe;
      ZP.drawRunner(ctx, o.skin, p.x, p.y, size, runnerOpts);
      if (w.phase === 'bonk') {
        // dizzy stars
        for (var k = 0; k < 3; k++) { var a = t * 7 + k * 2.1; ctx.fillStyle = '#ffe14f'; blob(ctx, p.x + M.cos(a) * size * 0.4, p.y - size * 1.25 + M.sin(a) * size * 0.1, size * 0.06, size * 0.06); ctx.fill(); }
      }
    }
    function drawSplash(w, o, t) {
      var p = proj(w.x, -0.6, w.z + 0.5, PA);
      if (p.dz < 0.5) return;
      var k = w.pt, size = p.s * 1.05;
      // only the runner's top and flailing arms poke out of the jelly
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, p.y); ctx.clip();
      runnerOpts.t = t; runnerOpts.run = 1; runnerOpts.squash = 0; runnerOpts.air = true; runnerOpts.shoe = o.shoe;
      ZP.drawRunner(ctx, o.skin, p.x, p.y + size * (0.2 + 0.7 * M.min(1, k * 2)), size, runnerOpts);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
      for (var r = 0; r < 3; r++) { var rr = (k * 1.6 + r * 0.3) % 1; ctx.globalAlpha = 1 - rr; blob(ctx, p.x, p.y, size * (0.4 + rr * 1.4), size * (0.12 + rr * 0.4)); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    return v;
  };
})();
