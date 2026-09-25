/*
 * Block Burst — art drawn in code. Block skins, gems, backgrounds, cached sprites.
 * window.BBArt
 */
(function () {
  'use strict';
  var RES = 128; // sprite resolution (drawn scaled down)

  function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function rgbToHex(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var x = hexToRgb(a), y = hexToRgb(b); return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
  function rgba(h, a) { var c = hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function poly(g, pts, fill) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fillStyle = fill; g.fill();
  }

  /* ------------------------------------------------------------ skins */
  var SKINS = [
    { id: 'jewel', name: 'جواهر', style: 'jewel', need: null,
      pal: ['#ff3b5c', '#ff8a1f', '#ffd21f', '#3ddc5a', '#1fd1e8', '#3b7bff', '#a64dff', '#ff5fc8'],
      bg: ['#2a1b6e', '#4a1f8f', '#1a3a9e'], board: '#1a1245', cell: '#2b2166', accent: '#ffd21f' },
    { id: 'candy', name: 'حلوى', style: 'candy', need: { stars: 8 },
      pal: ['#ff6b8b', '#ffa45c', '#ffe066', '#7be08a', '#6fe3f0', '#7aa8ff', '#c792ff', '#ff8fd8'],
      bg: ['#ff8fc0', '#ffb3d9', '#8fd3ff'], board: '#7a2f63', cell: '#9a4a82', accent: '#fff1a8' },
    { id: 'neon', name: 'نيون', style: 'neon', need: { best: 1500 },
      pal: ['#ff2d6f', '#ff8c1a', '#fff01a', '#39ff6a', '#1af0ff', '#2d7bff', '#b43dff', '#ff3de8'],
      bg: ['#05021a', '#1a0438', '#02143a'], board: '#070318', cell: '#140b33', accent: '#1af0ff' },
    { id: 'ice', name: 'جليد', style: 'ice', need: { stars: 24 },
      pal: ['#ff9ab0', '#ffc59a', '#fff0a0', '#a8f5c0', '#a6f4ff', '#a8c8ff', '#d4b8ff', '#ffb8ec'],
      bg: ['#1f6fb8', '#48a8e8', '#b8ecff'], board: '#0f3f73', cell: '#1d5a96', accent: '#e8fbff' },
    { id: 'gold', name: 'ذهب', style: 'metal', need: { best: 4000 },
      pal: ['#e8b923', '#d98a3a', '#f5d76e', '#c9d1d9', '#b8e0e8', '#9fb2c8', '#c79bd6', '#e8a0a8'],
      bg: ['#2b1a05', '#4a2e08', '#1e1207'], board: '#1a1004', cell: '#332207', accent: '#ffd76e' },
    { id: 'galaxy', name: 'مجرة', style: 'galaxy', need: { stars: 45 },
      pal: ['#ff4f8b', '#ff9a4f', '#ffe14f', '#4fff9a', '#4fe8ff', '#4f8bff', '#b04fff', '#ff4fe8'],
      bg: ['#0a0322', '#2a0a55', '#081a4a'], board: '#06021a', cell: '#140a36', accent: '#e0b0ff' }
  ];
  var GREY = '#8d93b0', RED = '#ff2f4a';

  function lighten(c, t) { return mix(c, '#ffffff', t); }
  function darken(c, t) { return mix(c, '#000000', t); }

  function drawJewel(g, s, c) {
    var m = s * 0.035, r = s * 0.14, b = s * 0.17;
    var L = lighten(c, 0.45), LL = lighten(c, 0.7), D = darken(c, 0.25), DD = darken(c, 0.45);
    rr(g, m, m, s - 2 * m, s - 2 * m, r); g.fillStyle = DD; g.fill();
    g.save(); rr(g, m, m, s - 2 * m, s - 2 * m, r); g.clip();
    var a = m, z = s - m;
    poly(g, [[a, a], [z, a], [z - b, a + b], [a + b, a + b]], LL);
    poly(g, [[a, a], [a + b, a + b], [a + b, z - b], [a, z]], L);
    poly(g, [[z, a], [z, z], [z - b, z - b], [z - b, a + b]], D);
    poly(g, [[a, z], [z, z], [z - b, z - b], [a + b, z - b]], DD);
    var gr = g.createLinearGradient(0, a + b, 0, z - b);
    gr.addColorStop(0, lighten(c, 0.18)); gr.addColorStop(1, darken(c, 0.08));
    g.fillStyle = gr; g.fillRect(a + b, a + b, z - a - 2 * b, z - a - 2 * b);
    // gloss
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.beginPath(); g.ellipse(s * 0.42, s * 0.36, s * 0.25, s * 0.12, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(s * 0.27, s * 0.27, s * 0.045, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = s * 0.02;
    rr(g, m, m, s - 2 * m, s - 2 * m, r); g.stroke();
  }
  function drawCandy(g, s, c) {
    var m = s * 0.04, r = s * 0.3;
    rr(g, m, m + s * 0.03, s - 2 * m, s - 2 * m, r); g.fillStyle = darken(c, 0.35); g.fill();
    rr(g, m, m, s - 2 * m, s - 2 * m - s * 0.03, r);
    var gr = g.createLinearGradient(0, m, 0, s - m);
    gr.addColorStop(0, lighten(c, 0.35)); gr.addColorStop(0.6, c); gr.addColorStop(1, darken(c, 0.12));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = s * 0.1;
    for (var k = -s; k < s * 2; k += s * 0.3) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + s, s); g.stroke(); }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    rr(g, s * 0.2, s * 0.13, s * 0.6, s * 0.14, s * 0.07); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(s * 0.76, s * 0.72, s * 0.05, 0, Math.PI * 2); g.fill();
  }
  function drawNeon(g, s, c) {
    var m = s * 0.12, r = s * 0.16;
    g.shadowColor = c; g.shadowBlur = s * 0.16;
    rr(g, m, m, s - 2 * m, s - 2 * m, r);
    g.fillStyle = mix('#08041c', c, 0.22); g.fill();
    g.lineWidth = s * 0.075; g.strokeStyle = c; g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = s * 0.025; g.strokeStyle = lighten(c, 0.7);
    rr(g, m, m, s - 2 * m, s - 2 * m, r); g.stroke();
    g.strokeStyle = rgba(c, 0.55); g.lineWidth = s * 0.03;
    rr(g, s * 0.3, s * 0.3, s * 0.4, s * 0.4, s * 0.08); g.stroke();
  }
  function drawIce(g, s, c) {
    var m = s * 0.04, r = s * 0.12;
    rr(g, m, m, s - 2 * m, s - 2 * m, r);
    var gr = g.createLinearGradient(0, 0, s, s);
    gr.addColorStop(0, lighten(c, 0.65)); gr.addColorStop(0.5, c); gr.addColorStop(1, darken(c, 0.2));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    poly(g, [[0, s * 0.55], [s * 0.55, 0], [s * 0.8, 0], [0, s * 0.8]], 'rgba(255,255,255,0.35)');
    poly(g, [[s * 0.2, s], [s, s * 0.2], [s, s * 0.32], [s * 0.32, s]], 'rgba(255,255,255,0.22)');
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = s * 0.02;
    g.beginPath(); g.moveTo(s * 0.62, s * 0.55); g.lineTo(s * 0.72, s * 0.68); g.lineTo(s * 0.68, s * 0.82); g.moveTo(s * 0.72, s * 0.68); g.lineTo(s * 0.85, s * 0.72); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = s * 0.05;
    rr(g, m + s * 0.02, m + s * 0.02, s - 2 * m - s * 0.04, s - 2 * m - s * 0.04, r); g.stroke();
    g.strokeStyle = darken(c, 0.35); g.lineWidth = s * 0.02;
    rr(g, m, m, s - 2 * m, s - 2 * m, r); g.stroke();
  }
  function drawMetal(g, s, c) {
    var m = s * 0.035, r = s * 0.1, b = s * 0.13;
    rr(g, m, m, s - 2 * m, s - 2 * m, r); g.fillStyle = darken(c, 0.55); g.fill();
    var gr = g.createLinearGradient(0, 0, s, s);
    gr.addColorStop(0, lighten(c, 0.7)); gr.addColorStop(0.35, c); gr.addColorStop(0.5, lighten(c, 0.55));
    gr.addColorStop(0.65, darken(c, 0.15)); gr.addColorStop(1, darken(c, 0.4));
    rr(g, m + s * 0.03, m + s * 0.03, s - 2 * m - s * 0.06, s - 2 * m - s * 0.06, r); g.fillStyle = gr; g.fill();
    var gr2 = g.createLinearGradient(0, s, s, 0);
    gr2.addColorStop(0, darken(c, 0.1)); gr2.addColorStop(0.45, lighten(c, 0.5)); gr2.addColorStop(0.55, c); gr2.addColorStop(1, lighten(c, 0.3));
    g.fillStyle = gr2; g.fillRect(m + b, m + b, s - 2 * m - 2 * b, s - 2 * m - 2 * b);
    g.strokeStyle = rgba(darken(c, 0.4), 0.8); g.lineWidth = s * 0.02;
    g.strokeRect(m + b, m + b, s - 2 * m - 2 * b, s - 2 * m - 2 * b);
    // sparkle star
    g.fillStyle = '#fff';
    star(g, s * 0.3, s * 0.3, s * 0.1, s * 0.025);
  }
  function star(g, x, y, R, r) {
    g.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r : R; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    g.closePath(); g.fill();
  }
  function drawGalaxy(g, s, c) {
    var m = s * 0.04, r = s * 0.16;
    rr(g, m, m, s - 2 * m, s - 2 * m, r);
    var gr = g.createRadialGradient(s * 0.35, s * 0.35, s * 0.05, s * 0.5, s * 0.5, s * 0.7);
    gr.addColorStop(0, lighten(c, 0.35)); gr.addColorStop(0.45, mix(c, '#2a0a60', 0.45)); gr.addColorStop(1, '#0a0322');
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    g.fillStyle = '#fff';
    for (var i = 0; i < 9; i++) { g.globalAlpha = 0.5 + rnd() * 0.5; g.beginPath(); g.arc(rnd() * s, rnd() * s, s * (0.01 + rnd() * 0.02), 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    star(g, s * 0.68, s * 0.3, s * 0.08, s * 0.02);
    g.restore();
    g.strokeStyle = c; g.lineWidth = s * 0.06;
    rr(g, m + s * 0.03, m + s * 0.03, s - 2 * m - s * 0.06, s - 2 * m - s * 0.06, r * 0.8); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = s * 0.015;
    rr(g, m + s * 0.03, m + s * 0.03, s - 2 * m - s * 0.06, s - 2 * m - s * 0.06, r * 0.8); g.stroke();
  }
  var STYLES = { jewel: drawJewel, candy: drawCandy, neon: drawNeon, ice: drawIce, metal: drawMetal, galaxy: drawGalaxy };

  /* ------------------------------------------------------------- gems */
  var GEM_COLS = { 1: '#ff2d55', 2: '#2d7bff', 3: '#18d66b', 4: '#ffc21f' };
  var GEM_NAMES = { 1: 'ياقوت', 2: 'زفير', 3: 'زمرد', 4: 'كهرمان' };
  function drawGem(g, cx, cy, S, kind) {
    var c = GEM_COLS[kind] || '#fff';
    g.save(); g.translate(cx, cy); g.scale(S, S);
    // shape: brilliant cut
    var P = [[-0.5, -0.12], [-0.28, -0.42], [0.28, -0.42], [0.5, -0.12], [0, 0.5]];
    g.beginPath(); g.moveTo(P[0][0], P[0][1]);
    for (var i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
    g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 0.12; g.strokeStyle = '#1b0f3a'; g.stroke();
    g.fillStyle = c; g.fill();
    poly(g, [[-0.28, -0.42], [0.28, -0.42], [0.16, -0.12], [-0.16, -0.12]], lighten(c, 0.55));
    poly(g, [[-0.5, -0.12], [-0.28, -0.42], [-0.16, -0.12]], lighten(c, 0.3));
    poly(g, [[0.5, -0.12], [0.28, -0.42], [0.16, -0.12]], darken(c, 0.1));
    poly(g, [[-0.5, -0.12], [-0.16, -0.12], [0, 0.5]], lighten(c, 0.15));
    poly(g, [[-0.16, -0.12], [0.16, -0.12], [0, 0.5]], c);
    poly(g, [[0.16, -0.12], [0.5, -0.12], [0, 0.5]], darken(c, 0.25));
    g.fillStyle = 'rgba(255,255,255,0.95)';
    star(g, -0.18, -0.26, 0.14, 0.035);
    g.restore();
  }

  /* ------------------------------------------------------------ cache */
  var cache = {};
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // colour: 1..8 palette index, 'grey', 'red', 'white'
  function block(skinIdx, color, gem) {
    var key = skinIdx + ':' + color + ':' + (gem || 0);
    var cv = cache[key];
    if (cv) return cv;
    var sk = SKINS[skinIdx] || SKINS[0];
    var hex = color === 'grey' ? GREY : color === 'red' ? RED : color === 'white' ? '#ffffff' : sk.pal[(color - 1) % 8];
    cv = makeCanvas(RES, RES);
    var g = cv.getContext('2d');
    STYLES[sk.style](g, RES, hex);
    if (gem) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(RES / 2, RES / 2, RES * 0.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(27,15,58,0.35)'; g.lineWidth = RES * 0.03; g.stroke();
      drawGem(g, RES / 2, RES / 2 + RES * 0.02, RES * 0.46, gem);
    }
    cache[key] = cv;
    return cv;
  }
  function gemSprite(kind) {
    var key = 'gem:' + kind;
    if (cache[key]) return cache[key];
    var cv = makeCanvas(RES, RES), g = cv.getContext('2d');
    drawGem(g, RES / 2, RES / 2 + RES * 0.02, RES * 0.86, kind);
    cache[key] = cv; return cv;
  }

  // Background for a skin at logical size (w,h) rendered at scale k.
  function background(skinIdx, w, h, k) {
    var key = 'bg:' + skinIdx + ':' + w + 'x' + h + ':' + k;
    if (cache[key]) return cache[key];
    for (var q in cache) if (q.indexOf('bg:') === 0) delete cache[q];
    var sk = SKINS[skinIdx] || SKINS[0];
    var cv = makeCanvas(Math.round(w * k), Math.round(h * k)), g = cv.getContext('2d');
    g.scale(k, k);
    var gr = g.createLinearGradient(0, 0, w * 0.3, h);
    gr.addColorStop(0, sk.bg[0]); gr.addColorStop(0.55, sk.bg[1]); gr.addColorStop(1, sk.bg[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // soft rays
    g.save(); g.translate(w / 2, h * 0.45);
    for (var i = 0; i < 16; i++) {
      g.rotate(Math.PI / 8);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0)';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-120, -1400); g.lineTo(120, -1400); g.closePath(); g.fill();
    }
    g.restore();
    // bokeh blocks
    var seed = 11 + skinIdx * 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (i = 0; i < 26; i++) {
      var x = rnd() * w, y = rnd() * h, s = 20 + rnd() * 60;
      g.save(); g.translate(x, y); g.rotate(rnd() * 1.5);
      g.fillStyle = rgba(sk.pal[i % 8], 0.07 + rnd() * 0.07);
      rr(g, -s / 2, -s / 2, s, s, s * 0.2); g.fill();
      g.restore();
    }
    // vignette
    var vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    cache[key] = cv;
    return cv;
  }

  // Empty board (frame + cell wells) at logical cell size, rendered at scale k.
  function boardImage(skinIdx, cell, k) {
    var key = 'board:' + skinIdx + ':' + cell + ':' + k;
    if (cache[key]) return cache[key];
    for (var q in cache) if (q.indexOf('board:') === 0) delete cache[q];
    var sk = SKINS[skinIdx] || SKINS[0], pad = 14, S = cell * 8 + pad * 2;
    var cv = makeCanvas(Math.round((S + 20) * k), Math.round((S + 20) * k)), g = cv.getContext('2d');
    g.scale(k, k); g.translate(10, 6);
    rr(g, 0, 8, S, S, 26); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    rr(g, 0, 0, S, S, 26);
    var gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, lighten(sk.board, 0.12)); gr.addColorStop(1, sk.board);
    g.fillStyle = gr; g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.stroke();
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var x = pad + c * cell, y = pad + r * cell;
      rr(g, x + 3, y + 3, cell - 6, cell - 6, cell * 0.16);
      g.fillStyle = sk.cell; g.fill();
      g.fillStyle = 'rgba(0,0,0,0.22)';
      rr(g, x + 3, y + 3, cell - 6, (cell - 6) * 0.25, cell * 0.14); g.fill();
    }
    cache[key] = cv;
    return cv;
  }

  window.BBArt = {
    SKINS: SKINS, GEM_COLS: GEM_COLS, GEM_NAMES: GEM_NAMES, RES: RES,
    block: block, gemSprite: gemSprite, background: background, boardImage: boardImage,
    drawGem: drawGem, rr: rr, star: star, mix: mix, rgba: rgba, lighten: lighten, darken: darken
  };
})();
