/* Seek and Zoom (ابحث وكبّر) art: every picture is drawn in code with canvas paths.
 *   A.drawScene(g, S, x0, y0, x1, y1)  one place's backdrop and filler inside a world box
 *                                      (game.js caches it in tiles at a few zoom levels)
 *   A.item(g, k, v, x, y, r, t, o)     one thing to find (or a look-alike), live every frame
 *   A.card, A.icon, A.sticker, A.thumb, A.text   the list, hints, stickers and labels
 * Filler things stay inside their boxes in SZ.FB (engine.js), so a tile only draws what
 * touches it. Things to find are bright with thick dark outlines. */
(function () {
  'use strict';
  var SZ = window.SZ, A = SZ.art = {};
  var INK = A.INK = '#2b2452';
  var WH = '#ffffff', YEL = '#ffd23f', DK = '#3b3150', RED = '#ff5d6c';
  var PI = Math.PI, TAU = PI * 2;

  /* ------------------------------------------------------------- helpers */
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
  // Fill, then the dark outline (lw in the current units).
  function fs(g, fill, lw) { g.fillStyle = fill; g.fill(); if (lw !== 0) { st(g, lw || g.lineWidth, INK); } }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function st(g, lw, c) { g.lineWidth = lw; g.strokeStyle = c || INK; g.stroke(); }
  function line(g, x1, y1, x2, y2, c, lw) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = c || INK; g.lineWidth = lw; g.stroke(); }
  function starPath(g, x, y, R, r, n) {
    n = n || 5; g.beginPath();
    for (var i = 0; i < n * 2; i++) { var a = -PI / 2 + i * PI / n, d = i % 2 ? r : R; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  A.circ = circ; A.rr = rr; A.fs = fs; A.st = st; A.fill = fill;
  function eyes(g, x, y, gap, r) { circ(g, x - gap, y, r); fill(g, INK); circ(g, x + gap, y, r); fill(g, INK); }
  function smile(g, x, y, w, lw) { g.beginPath(); g.arc(x, y - w * 0.5, w, 0.25 * PI, 0.75 * PI); g.lineWidth = lw; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    function f(c) { return Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); }
    return '#' + ((1 << 24) | (f(r) << 16) | (f(gg) << 8) | f(b)).toString(16).slice(1);
  }

  var VC = { red: '#ff4d4d', blue: '#3d8bff', green: '#3ddc84', yellow: YEL, white: WH, pink: '#ff8fc7',
    orange: '#ff9a2e', purple: '#a76bff', brown: '#b9773e', gold: '#ffc928', silver: '#cfd8ea', spotted: WH };
  var SKIN = ['#ffd7b5', '#f2b98b', '#c98b5e', '#8d5a3b'], HAIR = ['#3b2a20', '#6b3e1f', '#e8b04a', '#1c1c2e', '#b5462a'];
  var SHIRT = [RED, '#4f7bff', '#3ddc84', YEL, '#b57bff', '#ff9f43', '#2ec4ff', '#ff7eb6', '#7ed957', WH];
  var PANTS = ['#3f4c8a', '#2a3a5a', '#6a4a8a', '#3f7a5a', '#8a5a3a'];
  var BRIGHT = [RED, '#4f7bff', '#3ddc84', YEL, '#b57bff', '#ff9f43', '#2ec4ff', '#ff7eb6'];

  // Arabic needs right-to-left direction and an explicit alignment.
  A.text = function (g, s, x, y, size, color, o) {
    o = o || {};
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
    g.direction = /[؀-ۿ]/.test(s) ? 'rtl' : 'ltr';
    if (o.stroke !== false) { g.lineJoin = 'round'; g.lineWidth = o.lw || Math.max(4, size * 0.2); g.strokeStyle = o.stroke || INK; g.strokeText(s, x, y); }
    g.fillStyle = color || '#fff'; g.fillText(s, x, y);
    g.direction = 'ltr';
  };
  // The largest size (up to max) at which s fits in width w.
  A.fit = function (g, s, w, max, min) {
    var size = max;
    g.direction = /[؀-ۿ]/.test(s) ? 'rtl' : 'ltr';
    for (; size > min; size -= 1) { g.font = '700 ' + size + 'px Fredoka'; if (g.measureText(s).width <= w) break; }
    g.direction = 'ltr';
    return size;
  };

  /* ------------------------------------------------- the things to find */
  // Each is drawn around (0, 0) at size 1 (about -1..1); A.item scales it to r.
  var I = {};
  I.kite = function (g, v, t, o) {
    var c = VC[v];
    g.beginPath(); g.moveTo(0, 0.72);
    for (var i = 1; i <= 6; i++) g.quadraticCurveTo(i % 2 ? 0.22 : -0.22, 0.72 + i * 0.1 - 0.05, 0, 0.72 + i * 0.1);
    st(g, 0.07, INK);
    [[0.14, 0.95], [-0.1, 1.15], [0.1, 1.33]].forEach(function (b, i) {
      poly(g, [b[0] - 0.13, b[1] - 0.09, b[0] + 0.13, b[1] + 0.09, b[0] + 0.13, b[1] - 0.09, b[0] - 0.13, b[1] + 0.09]); fs(g, i % 2 ? YEL : WH, 0.05);
    });
    poly(g, [0, -1, 0.66, -0.18, 0, 0.74, -0.66, -0.18]); fs(g, c, 0.1);
    poly(g, [0, -1, 0.66, -0.18, 0, -0.18]); fill(g, shade(c, 0.35));
    poly(g, [0, 0.74, -0.66, -0.18, 0, -0.18]); fill(g, shade(c, -0.18));
    poly(g, [0, -1, 0.66, -0.18, 0, 0.74, -0.66, -0.18]); st(g, 0.1, INK);
    line(g, 0, -0.95, 0, 0.7, INK, 0.05); line(g, -0.6, -0.18, 0.6, -0.18, INK, 0.05);
  };
  I.duck = function (g, v, t, o) {
    var c = VC[v], bob = o.still ? 0 : Math.sin(t * 2.4 + o.ph) * 0.05;
    ell(g, 0, 0.62, 1.05, 0.2); fill(g, 'rgba(255,255,255,0.45)');
    g.save(); g.translate(0, bob);
    g.beginPath(); g.moveTo(-0.95, 0.05); g.quadraticCurveTo(-1.05, -0.4, -0.7, -0.2); g.quadraticCurveTo(-0.3, 0.6, 0.6, 0.5);
    g.quadraticCurveTo(0.95, 0.4, 0.75, 0); g.lineTo(-0.95, 0.05); g.closePath();
    ell(g, -0.05, 0.22, 0.88, 0.42); fs(g, c, 0.1);
    circ(g, 0.48, -0.4, 0.36); fs(g, c, 0.1);
    poly(g, [0.78, -0.42, 1.12, -0.32, 0.78, -0.24]); fs(g, '#ff9a2e', 0.07);
    circ(g, 0.56, -0.48, 0.07); fill(g, INK);
    g.beginPath(); g.ellipse(-0.15, 0.18, 0.42, 0.22, -0.2, 0, PI); st(g, 0.07, INK);
    g.restore();
  };
  I.cat = function (g, v, t, o) {
    var orange = '#ff9f43', stripe = '#d86e1c';
    if (v === 'sleep') {
      var br = o.still ? 0 : Math.sin(t * 1.6 + o.ph) * 0.03;
      g.beginPath(); g.moveTo(0.7, 0.45); g.quadraticCurveTo(1.2, 0.5, 0.95, -0.1); g.lineWidth = 0.22; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
      st(g, 0.12, orange);
      ell(g, 0.1, 0.25, 0.85, 0.48 + br); fs(g, orange, 0.1);
      [-0.1, 0.2, 0.5].forEach(function (x) { line(g, x, -0.18, x + 0.08, 0.05, stripe, 0.08); });
      circ(g, -0.55, 0.12, 0.4); fs(g, orange, 0.1);
      poly(g, [-0.88, -0.05, -0.85, -0.46, -0.62, -0.22]); fs(g, orange, 0.08);
      poly(g, [-0.45, -0.26, -0.28, -0.5, -0.2, -0.12]); fs(g, orange, 0.08);
      g.lineCap = 'round';
      [-0.72, -0.44].forEach(function (x) { g.beginPath(); g.arc(x, 0.08, 0.08, 0.1 * PI, 0.9 * PI); st(g, 0.06, INK); });
      circ(g, -0.58, 0.24, 0.05); fill(g, '#ff6f91');
      // Z z
      var zz = o.still ? 0 : (t * 0.6 + o.ph) % 1;
      g.globalAlpha *= 1 - zz * 0.6;
      [[0.05, -0.55 - zz * 0.3, 0.16], [0.32, -0.85 - zz * 0.3, 0.11]].forEach(function (z) {
        g.beginPath(); g.moveTo(z[0] - z[2], z[1] - z[2]); g.lineTo(z[0] + z[2], z[1] - z[2]); g.lineTo(z[0] - z[2], z[1] + z[2]); g.lineTo(z[0] + z[2], z[1] + z[2]);
        st(g, 0.13, WH); st(g, 0.06, '#4f7bff');
      });
      g.globalAlpha = 1;
      return;
    }
    g.beginPath(); g.moveTo(0.4, 0.8); g.quadraticCurveTo(1.05, 0.7, 0.85, 0.1); g.lineWidth = 0.22; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
    st(g, 0.12, '#9aa3b8');
    ell(g, 0, 0.42, 0.55, 0.5); fs(g, '#9aa3b8', 0.1);
    circ(g, 0, -0.32, 0.45); fs(g, '#9aa3b8', 0.1);
    poly(g, [-0.42, -0.5, -0.36, -0.95, -0.1, -0.7]); fs(g, '#9aa3b8', 0.08);
    poly(g, [0.42, -0.5, 0.36, -0.95, 0.1, -0.7]); fs(g, '#9aa3b8', 0.08);
    circ(g, -0.17, -0.36, 0.11); fs(g, '#c6ff7a', 0.05); circ(g, 0.17, -0.36, 0.11); fs(g, '#c6ff7a', 0.05);
    circ(g, -0.17, -0.36, 0.05); fill(g, INK); circ(g, 0.17, -0.36, 0.05); fill(g, INK);
    circ(g, 0, -0.18, 0.05); fill(g, '#ff6f91');
  };
  I.balloon = function (g, v, t, o) {
    var c = VC[v], sw = o.still ? 0 : Math.sin(t * 1.5 + o.ph) * 0.08;
    g.beginPath(); g.moveTo(0, 0.55); g.quadraticCurveTo(0.25 + sw, 0.85, 0.05, 1.25); st(g, 0.05, INK);
    ell(g, 0, -0.2, 0.68, 0.8); fs(g, c, 0.1);
    poly(g, [-0.1, 0.66, 0.1, 0.66, 0, 0.56]); fs(g, c, 0.06);
    ell(g, -0.26, -0.48, 0.13, 0.24, 0.4); fill(g, 'rgba(255,255,255,0.7)');
  };
  I.dog = function (g, v, t, o) {
    var c = v === 'brown' ? '#c9874a' : WH, ear = v === 'brown' ? '#8a5328' : DK, wag = o.still ? 0 : Math.sin(t * 9 + o.ph) * 0.25;
    g.save(); g.translate(-0.62, 0.15); g.rotate(-0.7 + wag); rr(g, -0.08, -0.5, 0.16, 0.5, 0.08); fs(g, c, 0.08); g.restore();
    ell(g, -0.1, 0.35, 0.62, 0.5); fs(g, c, 0.1);
    rr(g, -0.5, 0.45, 0.22, 0.45, 0.1); fs(g, c, 0.08); rr(g, 0.12, 0.45, 0.22, 0.45, 0.1); fs(g, c, 0.08);
    if (v === 'spotted') { circ(g, -0.25, 0.25, 0.14); fill(g, DK); circ(g, 0.05, 0.5, 0.1); fill(g, DK); }
    circ(g, 0.38, -0.35, 0.42); fs(g, c, 0.1);
    ell(g, 0.7, -0.22, 0.24, 0.17); fs(g, shade(c, -0.08), 0.08);
    circ(g, 0.9, -0.28, 0.08); fill(g, INK);
    ell(g, 0.12, -0.3, 0.14, 0.32, 0.25); fs(g, ear, 0.07);
    circ(g, 0.48, -0.45, 0.06); fill(g, INK);
    if (v === 'spotted') { circ(g, 0.3, -0.6, 0.09); fill(g, DK); }
    g.beginPath(); g.arc(0.66, -0.12, 0.1, 0.1, PI - 0.4); st(g, 0.05, INK);
  };
  I.icecream = function (g, v, t, o) {
    poly(g, [-0.46, -0.05, 0.46, -0.05, 0, 1.05]); fs(g, '#f2b45a', 0.09);
    g.save(); poly(g, [-0.46, -0.05, 0.46, -0.05, 0, 1.05]); g.clip();
    for (var i = -1; i <= 1; i += 0.3) { line(g, i - 0.6, -0.1, i + 0.4, 1.1, '#c9853a', 0.05); line(g, i + 0.6, -0.1, i - 0.4, 1.1, '#c9853a', 0.05); }
    g.restore();
    var c = v === 'pink' ? '#ff8fc7' : '#8a5a3a';
    circ(g, -0.22, -0.18, 0.36); fs(g, c, 0.09); circ(g, 0.22, -0.18, 0.36); fs(g, c, 0.09);
    circ(g, 0, -0.5, 0.42); fs(g, c, 0.09);
    circ(g, 0.08, -0.95, 0.13); fs(g, '#ff3b4d', 0.06);
    ell(g, -0.14, -0.62, 0.1, 0.14, 0.5); fill(g, 'rgba(255,255,255,0.6)');
  };
  I.butterfly = function (g, v, t, o) {
    var c = v === 'blue' ? '#4fa8ff' : '#ff9a2e', k = o.still ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + o.ph));
    g.save(); g.scale(k, 1);
    ell(g, -0.5, -0.35, 0.5, 0.45, -0.4); fs(g, c, 0.09); ell(g, 0.5, -0.35, 0.5, 0.45, 0.4); fs(g, c, 0.09);
    ell(g, -0.42, 0.35, 0.36, 0.32, 0.4); fs(g, shade(c, 0.3), 0.09); ell(g, 0.42, 0.35, 0.36, 0.32, -0.4); fs(g, shade(c, 0.3), 0.09);
    circ(g, -0.55, -0.4, 0.14); fill(g, WH); circ(g, 0.55, -0.4, 0.14); fill(g, WH);
    g.restore();
    ell(g, 0, 0, 0.1, 0.55); fs(g, INK, 0);
    g.beginPath(); g.moveTo(0, -0.5); g.quadraticCurveTo(-0.15, -0.85, -0.3, -0.9); g.moveTo(0, -0.5); g.quadraticCurveTo(0.15, -0.85, 0.3, -0.9);
    st(g, 0.05, INK);
  };
  I.ball = function (g, v, t, o) {
    circ(g, 0, 0, 0.92); fs(g, WH, 0.1);
    g.save(); circ(g, 0, 0, 0.92); g.clip();
    if (v === 'beach') {
      ['#ff4d4d', YEL, '#3d8bff'].forEach(function (c, i) {
        var a = i * TAU / 3 - PI / 2; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 1, a, a + TAU / 6); g.closePath(); fill(g, c);
      });
      circ(g, 0, 0, 0.22); fs(g, WH, 0.06);
    } else {
      starPath(g, 0, 0, 0.36, 0.3, 5); fill(g, INK);
      for (var i = 0; i < 5; i++) { var a = -PI / 2 + i * TAU / 5; circ(g, Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.3); fill(g, INK); }
    }
    g.restore();
    circ(g, 0, 0, 0.92); st(g, 0.1, INK);
    ell(g, -0.35, -0.42, 0.16, 0.1, -0.6); fill(g, 'rgba(255,255,255,0.75)');
  };
  I.apple = function (g, v, t, o) {
    var c = v === 'red' ? '#ff4d4d' : '#8be04e';
    g.beginPath(); g.moveTo(0, -0.55); g.bezierCurveTo(0.6, -0.95, 1.15, -0.3, 0.8, 0.35); g.bezierCurveTo(0.6, 0.85, 0.25, 0.95, 0, 0.8);
    g.bezierCurveTo(-0.25, 0.95, -0.6, 0.85, -0.8, 0.35); g.bezierCurveTo(-1.15, -0.3, -0.6, -0.95, 0, -0.55); g.closePath(); fs(g, c, 0.1);
    line(g, 0, -0.55, 0.08, -0.95, INK, 0.1);
    g.beginPath(); g.ellipse(0.32, -0.82, 0.24, 0.11, -0.4, 0, TAU); fs(g, '#3ddc84', 0.06);
    ell(g, -0.4, -0.2, 0.12, 0.22, 0.4); fill(g, 'rgba(255,255,255,0.6)');
  };
  I.melon = function (g, v, t, o) {
    ell(g, 0, 0, 1, 0.72); fs(g, '#3fb950', 0.1);
    g.save(); ell(g, 0, 0, 1, 0.72); g.clip();
    for (var i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(i * 0.38, 0, 0.12, 0.8, 0, 0, TAU); fill(g, '#1e7d34'); }
    g.restore();
    ell(g, 0, 0, 1, 0.72); st(g, 0.1, INK);
    ell(g, -0.4, -0.35, 0.25, 0.1, -0.3); fill(g, 'rgba(255,255,255,0.4)');
  };
  I.fish = function (g, v, t, o) {
    var c = v === 'orange' ? '#ff9a2e' : '#4fa8ff', w = o.still ? 0 : Math.sin(t * 6 + o.ph) * 0.08;
    poly(g, [-0.62, 0, -1.05, -0.45 + w, -1.0, 0.45 + w]); fs(g, shade(c, -0.15), 0.08);
    ell(g, 0, 0, 0.75, 0.48); fs(g, c, 0.1);
    poly(g, [-0.1, -0.42, 0.25, -0.7, 0.3, -0.38]); fs(g, shade(c, -0.15), 0.07);
    circ(g, 0.42, -0.1, 0.12); fs(g, WH, 0.05); circ(g, 0.45, -0.1, 0.06); fill(g, INK);
    g.beginPath(); g.arc(-0.05, 0, 0.3, -0.9, 0.9); st(g, 0.06, shade(c, -0.25));
  };
  I.lantern = function (g, v, t, o) {
    var c = v === 'orange' ? '#ffb02e' : '#4fa8ff';
    line(g, 0, -1.1, 0, -0.85, INK, 0.08);
    circ(g, 0, -1.12, 0.12); st(g, 0.06, INK);
    poly(g, [-0.3, -0.85, 0.3, -0.85, 0.48, -0.6, -0.48, -0.6]); fs(g, '#c98a2e', 0.08);
    poly(g, [-0.48, -0.6, 0.48, -0.6, 0.6, 0.35, 0, 0.62, -0.6, 0.35]); fs(g, c, 0.1);
    poly(g, [-0.2, -0.5, 0.2, -0.5, 0.25, 0.32, -0.25, 0.32]); fill(g, '#fff7c2');
    line(g, 0, -0.6, 0, 0.6, INK, 0.06);
    poly(g, [-0.32, 0.5, 0.32, 0.5, 0.18, 0.82, -0.18, 0.82]); fs(g, '#c98a2e', 0.08);
    circ(g, 0, 0.95, 0.09); fs(g, '#c98a2e', 0.05);
  };
  I.hat = function (g, v, t, o) {
    var c = VC[v];
    ell(g, 0, 0.35, 1.05, 0.32); fs(g, c, 0.1);
    g.beginPath(); g.moveTo(-0.6, 0.35); g.bezierCurveTo(-0.6, -0.7, 0.6, -0.7, 0.6, 0.35); g.closePath(); fs(g, c, 0.1);
    g.beginPath(); g.moveTo(-0.6, 0.18); g.quadraticCurveTo(0, 0.3, 0.6, 0.18); g.lineTo(0.6, 0.02); g.quadraticCurveTo(0, 0.14, -0.6, 0.02); g.closePath(); fs(g, WH, 0.06);
    ell(g, -0.25, -0.25, 0.1, 0.2, 0.4); fill(g, 'rgba(255,255,255,0.45)');
  };
  I.key = function (g, v, t, o) {
    var c = VC[v];
    g.save(); g.rotate(-0.35);
    rr(g, -0.15, -0.13, 1.2, 0.26, 0.1); fs(g, c, 0.09);
    rr(g, 0.6, 0.05, 0.16, 0.38, 0.05); fs(g, c, 0.07); rr(g, 0.85, 0.05, 0.16, 0.28, 0.05); fs(g, c, 0.07);
    circ(g, -0.5, 0, 0.45); fs(g, c, 0.1); circ(g, -0.5, 0, 0.18); fs(g, WH, 0.07);
    ell(g, -0.65, -0.22, 0.1, 0.06, -0.5); fill(g, 'rgba(255,255,255,0.7)');
    g.restore();
  };
  I.crab = function (g, v, t, o) {
    var c = VC[v], k = o.still ? 0 : Math.sin(t * 12 + o.ph) * 0.1;
    for (var s = -1; s <= 1; s += 2) {
      for (var i = 0; i < 3; i++) { line(g, s * 0.4, 0.15 + i * 0.12, s * (0.95 + i * 0.05), 0.35 + i * 0.2 + (i % 2 ? k : -k), INK, 0.12); }
      line(g, s * 0.45, -0.1, s * 0.8, -0.45, INK, 0.12);
      ell(g, s * 0.85, -0.62, 0.26, 0.2, s * 0.4); fs(g, c, 0.08);
      poly(g, [s * 0.85, -0.66, s * 1.15, -0.72, s * 1.05, -0.55]); fill(g, WH);
    }
    ell(g, 0, 0.15, 0.62, 0.42); fs(g, c, 0.1);
    line(g, -0.2, -0.2, -0.25, -0.5, INK, 0.07); line(g, 0.2, -0.2, 0.25, -0.5, INK, 0.07);
    circ(g, -0.25, -0.55, 0.12); fs(g, WH, 0.05); circ(g, 0.25, -0.55, 0.12); fs(g, WH, 0.05);
    circ(g, -0.25, -0.55, 0.05); fill(g, INK); circ(g, 0.25, -0.55, 0.05); fill(g, INK);
    smile(g, 0, 0.2, 0.18, 0.06);
  };
  I.shell = function (g, v, t, o) {
    var c = VC[v];
    g.beginPath(); g.moveTo(0, 0.85);
    for (var i = 0; i <= 6; i++) { var a = PI + i * PI / 6; g.lineTo(Math.cos(a) * 0.95, -0.1 + Math.sin(a) * 0.85); }
    g.closePath(); fs(g, c, 0.1);
    for (i = 1; i < 6; i++) { var b = PI + i * PI / 6; line(g, 0, 0.8, Math.cos(b) * 0.85, -0.1 + Math.sin(b) * 0.75, shade(c, -0.25), 0.07); }
    poly(g, [-0.3, 0.65, 0.3, 0.65, 0.18, 0.95, -0.18, 0.95]); fs(g, c, 0.08);
  };
  I.starfish = function (g, v, t, o) {
    var c = VC[v];
    g.lineJoin = 'round'; starPath(g, 0, 0.05, 1, 0.45, 5); fs(g, c, 0.12);
    for (var i = 0; i < 5; i++) { var a = -PI / 2 + i * TAU / 5; circ(g, Math.cos(a) * 0.5, 0.05 + Math.sin(a) * 0.5, 0.08); fill(g, shade(c, 0.45)); }
    eyes(g, 0, -0.02, 0.14, 0.06); smile(g, 0, 0.12, 0.1, 0.05);
  };
  I.gull = function (g, v, t, o) {
    var f = o.still ? 0 : Math.sin(t * 7 + o.ph) * 0.35;
    g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-0.1, -0.05); g.quadraticCurveTo(-0.5, -0.6 - f, -1.05, -0.2 - f * 1.4); g.quadraticCurveTo(-0.6, -0.25, -0.1, 0.12); g.closePath(); fs(g, WH, 0.08);
    g.beginPath(); g.moveTo(0.1, -0.05); g.quadraticCurveTo(0.5, -0.6 - f, 1.05, -0.2 - f * 1.4); g.quadraticCurveTo(0.6, -0.25, 0.1, 0.12); g.closePath(); fs(g, WH, 0.08);
    ell(g, 0, 0.05, 0.42, 0.24); fs(g, WH, 0.08);
    circ(g, 0.38, -0.12, 0.2); fs(g, WH, 0.08);
    poly(g, [0.55, -0.12, 0.85, -0.04, 0.55, 0.0]); fs(g, '#ffb02e', 0.05);
    circ(g, 0.42, -0.16, 0.05); fill(g, INK);
    poly(g, [-0.42, 0.05, -0.7, -0.08, -0.7, 0.2]); fs(g, '#cfd8ea', 0.05);
  };
  I.boat = function (g, v, t, o) {
    var c = VC[v], rock = o.still ? 0 : Math.sin(t * 2 + o.ph) * 0.05;
    g.save(); g.rotate(rock);
    line(g, 0.05, 0.25, 0.05, -1.05, INK, 0.1);
    poly(g, [0.05, -1, 0.05, 0.12, 0.75, 0.12]); fs(g, WH, 0.08);
    poly(g, [0, -0.85, 0, 0.12, -0.55, 0.12]); fs(g, shade(c, 0.6), 0.08);
    poly(g, [0.05, -1.05, 0.4, -0.95, 0.05, -0.85]); fs(g, YEL, 0.05);
    g.beginPath(); g.moveTo(-1, 0.22); g.lineTo(1, 0.22); g.quadraticCurveTo(0.8, 0.7, 0.55, 0.7); g.lineTo(-0.6, 0.7); g.quadraticCurveTo(-0.85, 0.7, -1, 0.22); g.closePath(); fs(g, c, 0.1);
    line(g, -0.85, 0.42, 0.85, 0.42, WH, 0.07);
    g.restore();
    g.beginPath(); g.moveTo(-1.1, 0.78); g.quadraticCurveTo(-0.55, 0.62, 0, 0.78); g.quadraticCurveTo(0.55, 0.92, 1.1, 0.78); st(g, 0.08, WH);
  };
  I.teddy = function (g, v, t, o) {
    var c = v === 'brown' ? '#c98a4a' : '#ff9ccc', m = v === 'brown' ? '#f2d2a2' : '#ffd6ea';
    circ(g, -0.5, 0.75, 0.24); fs(g, c, 0.08); circ(g, 0.5, 0.75, 0.24); fs(g, c, 0.08);
    ell(g, 0, 0.35, 0.55, 0.5); fs(g, c, 0.1); ell(g, 0, 0.42, 0.3, 0.28); fill(g, m);
    circ(g, -0.6, 0.25, 0.2); fs(g, c, 0.08); circ(g, 0.6, 0.25, 0.2); fs(g, c, 0.08);
    circ(g, -0.38, -0.78, 0.2); fs(g, c, 0.08); circ(g, 0.38, -0.78, 0.2); fs(g, c, 0.08);
    circ(g, -0.38, -0.78, 0.09); fill(g, m); circ(g, 0.38, -0.78, 0.09); fill(g, m);
    circ(g, 0, -0.42, 0.5); fs(g, c, 0.1);
    ell(g, 0, -0.28, 0.22, 0.16); fs(g, m, 0.05);
    circ(g, 0, -0.33, 0.07); fill(g, INK);
    eyes(g, 0, -0.55, 0.18, 0.06);
    poly(g, [-0.12, -0.02, 0.12, -0.02, 0, 0.1]); fs(g, RED, 0.04);
  };
  I.car = function (g, v, t, o) {
    var c = VC[v], sp = o.still ? 0 : t * 8 + o.ph;
    g.beginPath(); g.moveTo(-0.95, 0.35); g.lineTo(-0.95, -0.05); g.quadraticCurveTo(-0.9, -0.2, -0.6, -0.22); g.lineTo(-0.38, -0.62);
    g.lineTo(0.3, -0.62); g.lineTo(0.58, -0.22); g.quadraticCurveTo(0.95, -0.2, 1, 0.05); g.lineTo(1, 0.35); g.closePath(); fs(g, c, 0.1);
    poly(g, [-0.3, -0.52, -0.06, -0.52, -0.06, -0.24, -0.5, -0.24]); fs(g, '#bff0ff', 0.06);
    poly(g, [0.04, -0.52, 0.26, -0.52, 0.45, -0.24, 0.04, -0.24]); fs(g, '#bff0ff', 0.06);
    circ(g, 0.86, 0.02, 0.08); fill(g, '#ffe066');
    [-0.52, 0.55].forEach(function (x) {
      circ(g, x, 0.38, 0.27); fs(g, DK, 0.07); circ(g, x, 0.38, 0.11); fill(g, '#cfd8ea');
      line(g, x, 0.38, x + Math.cos(sp) * 0.2, 0.38 + Math.sin(sp) * 0.2, '#cfd8ea', 0.05);
    });
    // The wind-up key.
    line(g, -0.15, -0.62, -0.15, -0.85, INK, 0.07);
    ell(g, -0.15, -0.9, 0.2, 0.08); fs(g, YEL, 0.05);
  };
  I.robot = function (g, v, t, o) {
    var c = v === 'blue' ? '#5fa8ff' : v === 'green' ? '#56d68a' : '#cfd8ea';
    line(g, 0, -0.95, 0, -0.7, INK, 0.07); circ(g, 0, -1, 0.1); fs(g, RED, 0.05);
    rr(g, -0.42, -0.72, 0.84, 0.6, 0.15); fs(g, c, 0.1);
    rr(g, -0.3, -0.58, 0.6, 0.3, 0.1); fill(g, '#2b2452');
    circ(g, -0.13, -0.43, 0.08); fill(g, '#7dfcff'); circ(g, 0.13, -0.43, 0.08); fill(g, '#7dfcff');
    rr(g, -0.62, 0.0, 0.18, 0.5, 0.09); fs(g, c, 0.07); rr(g, 0.44, 0.0, 0.18, 0.5, 0.09); fs(g, c, 0.07);
    rr(g, -0.48, -0.08, 0.96, 0.75, 0.15); fs(g, c, 0.1);
    circ(g, -0.15, 0.25, 0.1); fill(g, YEL); circ(g, 0.15, 0.25, 0.1); fill(g, RED);
    rr(g, -0.36, 0.67, 0.24, 0.3, 0.06); fs(g, shade(c, -0.2), 0.06); rr(g, 0.12, 0.67, 0.24, 0.3, 0.06); fs(g, shade(c, -0.2), 0.06);
  };
  I.rocket = function (g, v, t, o) {
    var c = v === 'red' ? '#ff4d4d' : WH, fin = v === 'red' ? YEL : '#ff4d4d';
    if (!o.still) { var f = 0.85 + Math.sin(t * 20 + o.ph) * 0.15; poly(g, [-0.2, 0.7, 0.2, 0.7, 0, 0.7 + 0.5 * f]); fs(g, '#ffb02e', 0.05); }
    poly(g, [-0.3, 0.2, -0.62, 0.72, -0.25, 0.62]); fs(g, fin, 0.08); poly(g, [0.3, 0.2, 0.62, 0.72, 0.25, 0.62]); fs(g, fin, 0.08);
    g.beginPath(); g.moveTo(0, -1.05); g.bezierCurveTo(0.5, -0.65, 0.42, 0.35, 0.3, 0.7); g.lineTo(-0.3, 0.7); g.bezierCurveTo(-0.42, 0.35, -0.5, -0.65, 0, -1.05); g.closePath(); fs(g, c, 0.1);
    g.beginPath(); g.moveTo(0, -1.05); g.bezierCurveTo(0.22, -0.88, 0.32, -0.72, 0.36, -0.62); g.lineTo(-0.36, -0.62); g.bezierCurveTo(-0.32, -0.72, -0.22, -0.88, 0, -1.05); fs(g, fin, 0.07);
    circ(g, 0, -0.18, 0.2); fs(g, '#7fd8ff', 0.08);
  };
  I.star = function (g, v, t, o) {
    var c = VC[v], k = o.still ? 1 : 1 + Math.sin(t * 3 + o.ph) * 0.04;
    g.save(); g.scale(k, k); g.lineJoin = 'round';
    starPath(g, 0, 0.06, 1, 0.48, 5); fs(g, c, 0.12);
    starPath(g, -0.08, -0.02, 0.5, 0.24, 5); fill(g, shade(c, 0.45));
    eyes(g, 0, 0.05, 0.16, 0.07); smile(g, 0, 0.18, 0.12, 0.05);
    g.restore();
  };
  I.book = function (g, v, t, o) {
    var c = VC[v];
    rr(g, -0.72, -0.86, 1.44, 1.72, 0.1); fs(g, WH, 0.1);
    rr(g, -0.82, -0.92, 1.44, 1.72, 0.12); fs(g, c, 0.1);
    rr(g, -0.82, -0.92, 0.26, 1.72, 0.1); fs(g, shade(c, -0.2), 0.07);
    rr(g, -0.36, -0.55, 0.78, 0.36, 0.08); fs(g, '#fff4c2', 0.06);
    starPath(g, 0.02, 0.35, 0.22, 0.1, 5); fill(g, YEL);
  };
  I.alien = function (g, v, t, o) {
    var c = v === 'green' ? '#7ee05a' : '#b38bff', bob = o.still ? 0 : Math.sin(t * 3 + o.ph) * 0.05;
    g.save(); g.translate(0, bob);
    line(g, -0.25, -0.55, -0.45, -0.95, INK, 0.07); line(g, 0.25, -0.55, 0.45, -0.95, INK, 0.07);
    circ(g, -0.45, -0.98, 0.11); fs(g, YEL, 0.05); circ(g, 0.45, -0.98, 0.11); fs(g, YEL, 0.05);
    g.beginPath(); g.moveTo(-0.7, 0.85); g.bezierCurveTo(-0.85, -0.85, 0.85, -0.85, 0.7, 0.85); g.quadraticCurveTo(0, 0.7, -0.7, 0.85); g.closePath(); fs(g, c, 0.1);
    circ(g, 0, -0.2, 0.32); fs(g, WH, 0.08); circ(g, 0.04, -0.18, 0.16); fill(g, INK); circ(g, 0.1, -0.24, 0.05); fill(g, WH);
    smile(g, 0, 0.32, 0.2, 0.07);
    circ(g, -0.42, 0.15, 0.07); fill(g, shade(c, -0.2)); circ(g, 0.45, 0.4, 0.06); fill(g, shade(c, -0.2));
    g.restore();
  };
  I.astro = function (g, v, t, o) {
    var c = v === 'white' ? WH : '#ff9a2e';
    rr(g, -0.6, -0.25, 0.3, 0.75, 0.1); fs(g, '#cfd8ea', 0.08);
    rr(g, -0.42, -0.25, 0.84, 0.95, 0.25); fs(g, c, 0.1);
    rr(g, -0.36, 0.62, 0.3, 0.38, 0.1); fs(g, c, 0.08); rr(g, 0.06, 0.62, 0.3, 0.38, 0.1); fs(g, c, 0.08);
    g.save(); g.translate(0.42, 0.05); g.rotate(-0.9); rr(g, -0.1, -0.05, 0.2, 0.55, 0.1); fs(g, c, 0.07); g.restore();
    rr(g, -0.18, 0.1, 0.36, 0.22, 0.05); fs(g, '#4fa8ff', 0.05);
    circ(g, 0, -0.55, 0.48); fs(g, c, 0.1);
    ell(g, 0.05, -0.55, 0.34, 0.28); fs(g, '#2b4a8a', 0.07);
    ell(g, -0.06, -0.64, 0.12, 0.07, -0.4); fill(g, 'rgba(255,255,255,0.8)');
  };
  I.sat = function (g, v, t, o) {
    for (var s = -1; s <= 1; s += 2) {
      line(g, s * 0.28, 0, s * 0.42, 0, INK, 0.08);
      rr(g, s > 0 ? 0.42 : -1.05, -0.32, 0.63, 0.64, 0.05); fs(g, '#3d6bff', 0.08);
      line(g, s * 0.73, -0.32, s * 0.73, 0.32, '#9fc0ff', 0.04); line(g, s > 0 ? 0.42 : -1.05, 0, s > 0 ? 1.05 : -0.42, 0, '#9fc0ff', 0.04);
    }
    rr(g, -0.3, -0.4, 0.6, 0.8, 0.08); fs(g, '#ffc928', 0.1);
    line(g, 0, -0.4, 0, -0.62, INK, 0.07);
    g.beginPath(); g.arc(0, -0.75, 0.22, 0.15 * PI, 0.85 * PI); g.closePath(); fs(g, WH, 0.06);
    rr(g, -0.16, -0.18, 0.32, 0.18, 0.04); fill(g, '#2b2452');
  };
  I.ufo = function (g, v, t, o) {
    var c = v === 'pink' ? '#ff7eb6' : '#56d68a';
    ell(g, 0, -0.25, 0.42, 0.45); fs(g, '#bff0ff', 0.08);
    circ(g, 0, -0.32, 0.12); fill(g, '#7ee05a'); circ(g, 0.02, -0.34, 0.04); fill(g, INK);
    ell(g, 0, 0.1, 1, 0.34); fs(g, c, 0.1);
    for (var i = -2; i <= 2; i++) { var on = o.still || Math.floor(t * 6 + i) % 2 === 0; circ(g, i * 0.36, 0.14, 0.08); fill(g, on ? '#ffe066' : WH); }
    if (!o.still) { poly(g, [-0.3, 0.4, 0.3, 0.4, 0.55, 0.95, -0.55, 0.95]); fill(g, 'rgba(255,240,140,0.25)'); }
  };
  I.planet = function (g, v, t, o) {
    var c = v === 'ringed' ? '#ffb84d' : '#7fd1ff';
    if (v === 'ringed') { g.beginPath(); g.ellipse(0, 0, 1.1, 0.32, -0.3, PI, TAU); st(g, 0.22, INK); st(g, 0.12, '#ffe9a8'); }
    circ(g, 0, 0, 0.66); fs(g, c, 0.1);
    g.save(); circ(g, 0, 0, 0.66); g.clip();
    ell(g, 0, -0.25, 0.9, 0.1, -0.3); fill(g, shade(c, -0.18)); ell(g, 0, 0.2, 0.9, 0.12, -0.3); fill(g, shade(c, 0.3));
    g.restore();
    circ(g, 0, 0, 0.66); st(g, 0.1, INK);
    if (v === 'ringed') { g.beginPath(); g.ellipse(0, 0, 1.1, 0.32, -0.3, 0, PI); st(g, 0.22, INK); st(g, 0.12, '#ffe9a8'); }
  };

  // Covers: a toy box whose lid lifts, a space hatch whose doors slide apart. open 0..1.
  var BOXC = [RED, '#4f7bff', '#ffb02e', '#3ddc84'];
  function coverBack(g, cv, open) {
    if (cv.k === 'hatch') { circ(g, 0, 0, 1.45); fs(g, '#1a1446', 0.12); return; }
    rr(g, -1.45, -0.25, 2.9, 1.5, 0.12); fs(g, shade(BOXC[cv.c], -0.45), 0.1);
  }
  function coverFront(g, cv, open, wig) {
    if (cv.k === 'hatch') {
      g.save(); circ(g, 0, 0, 1.3); g.clip();
      var d = open * 1.35;
      [-1, 1].forEach(function (s) {
        g.beginPath(); g.arc(s * d, 0, 1.3, s > 0 ? -PI / 2 : PI / 2, s > 0 ? PI / 2 : PI * 1.5); g.closePath(); fs(g, '#c9d3e6', 0.08);
        line(g, s * (d + 0.5), -0.7, s * (d + 0.5), 0.7, '#9aa6c4', 0.08);
      });
      g.restore();
      circ(g, 0, 0, 1.38); st(g, 0.28, INK); st(g, 0.18, '#7d88aa');
      for (var i = 0; i < 8; i++) { var a = i * TAU / 8 + 0.4; circ(g, Math.cos(a) * 1.38, Math.sin(a) * 1.38, 0.07); fill(g, '#e5ebf7'); }
      if (open < 0.05) { circ(g, 0, 0, 0.22); fs(g, YEL, 0.06); }
      return;
    }
    var c = BOXC[cv.c];
    rr(g, -1.45, -0.25, 2.9, 1.5, 0.12); fs(g, c, 0.1);
    rr(g, -1.45, 0.25, 2.9, 0.2, 0.02); fill(g, shade(c, 0.35));
    starPath(g, 0, 0.75, 0.32, 0.15, 5); fs(g, WH, 0.05);
    g.save(); g.translate(-1.5, -0.25); g.rotate(-open * 1.9 + wig);
    rr(g, 0, -0.38, 3, 0.4, 0.12); fs(g, shade(c, -0.1), 0.1);
    rr(g, 1.25, -0.5, 0.5, 0.16, 0.06); fs(g, YEL, 0.05);
    g.restore();
  }
  // A thing at (x, y), size r. o: { d: facing (1 or -1), still, ph (phase), cv (its cover),
  // open (0..1), wig (the lid's wiggle) }. A cover is drawn at its own size cv.r; inside it
  // the thing rises out of the box (or shows through the hatch) as the cover opens.
  A.item = function (g, k, v, x, y, r, t, o) {
    g.save(); g.translate(x, y);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (o.cv) {
      var open = o.open, cr = o.cv.r || r, s = Math.min(1, r / cr);
      g.scale(cr, cr);
      coverBack(g, o.cv, open);
      if (k && open > 0.02) {
        g.save();
        if (o.cv.k === 'hatch') { circ(g, 0, 0, 1.3); g.clip(); g.translate(0, (1 - open) * 0.3); }
        else { g.beginPath(); g.rect(-1.5, -4, 3, 5.2); g.clip(); g.translate(0, (s + 0.25) * (1 - open) - (0.25 + 0.6 * s) * open); }
        g.scale(s * (o.d < 0 ? -1 : 1), s);
        I[k](g, v, t, o);
        g.restore();
      }
      coverFront(g, o.cv, open, o.wig || 0);
    } else if (k) {
      g.scale(r * (o.d < 0 ? -1 : 1), r);
      I[k](g, v, t, o);
    }
    g.restore();
  };
  // Draws a thing to fit a box of size r around (x, y), still.
  A.icon = function (g, k, v, x, y, r) { A.item(g, k, v, x, y, r, 0, { d: 1, still: true, ph: 0 }); };

  /* ------------------------------------------------------------ filler */
  // Each draws at its anchor (o.x, o.y) scaled by o.s, inside SZ.FB[o.k].
  var F = {};
  function person(g, c, crew) {
    var skin = SKIN[c % 4], hair = HAIR[(c >> 2) % 5], shirt = SHIRT[(c >> 3) % 10], pants = PANTS[(c >> 4) % 5], st = (c >> 6) % 4;
    if (crew) { shirt = ['#ff9f43', '#4f7bff', RED, '#3ddc84', '#b57bff'][c % 5]; pants = shirt; }
    g.lineWidth = 3;
    rr(g, -12, -38, 10, 38, 4); fs(g, pants, 3); rr(g, 2, -38, 10, 38, 4); fs(g, pants, 3);
    ell(g, -8, -2, 9, 5); fs(g, DK, 2.5); ell(g, 8, -2, 9, 5); fs(g, DK, 2.5);
    if (st === 1 && !crew) { poly(g, [-14, -70, 14, -70, 24, -26, -24, -26]); fs(g, shirt, 3); }
    else { poly(g, [-15, -72, 15, -72, 17, -32, -17, -32]); fs(g, shirt, 3); }
    line(g, -15, -66, -22, -40, INK, 9); line(g, -15, -66, -22, -40, shirt, 4.5);
    line(g, 15, -66, 22, -40, INK, 9); line(g, 15, -66, 22, -40, shirt, 4.5);
    circ(g, -22, -38, 4.5); fs(g, skin, 2); circ(g, 22, -38, 4.5); fs(g, skin, 2);
    if (st === 2 && !crew) { ell(g, 0, -80, 21, 26); fs(g, hair, 3); }
    circ(g, 0, -86, 17); fs(g, skin, 3);
    g.beginPath();
    if (crew) { g.arc(0, -88, 18, PI * 1.05, TAU * 0.99); g.closePath(); fs(g, hair, 3); line(g, -16, -86, -16, -76, INK, 4); circ(g, -14, -76, 3); fill(g, INK); }
    else if (st === 3) { for (var i = 0; i < 5; i++) { circ(g, -14 + i * 7, -101 + Math.abs(i - 2) * 2, 7); fill(g, hair); } }
    else { g.arc(0, -88, 18, PI * 1.02, TAU * 0.98); g.quadraticCurveTo(10, -92, 0, -92); g.quadraticCurveTo(-10, -94, -17, -88); g.closePath(); fs(g, hair, 3); }
    if (st === 0 && !crew && c % 3 === 0) { circ(g, 0, -106, 7); fs(g, hair, 2.5); }
    eyes(g, 0, -86, 6, 2.2); smile(g, 0, -80, 5, 2);
  }
  F.person = function (g, o) { person(g, o.c, false); };
  F.crew = function (g, o) { person(g, o.c, true); };
  F.cloud = function (g, o) {
    g.beginPath(); g.arc(-60, -24, 34, PI * 0.5, PI * 1.5); g.arc(-20, -44, 38, PI, PI * 1.9); g.arc(30, -40, 44, PI * 1.15, TAU * 0.98);
    g.arc(78, -20, 28, PI * 1.4, PI * 0.5); g.closePath(); fs(g, WH, 4);
    ell(g, -10, -6, 70, 6); fill(g, 'rgba(160,200,240,0.45)');
  };
  F.tree = function (g, o) {
    var c = ['#3fae49', '#56c35a', '#2f9a52', '#6cc24a'][o.c % 4];
    rr(g, -12, -80, 24, 84, 6); fs(g, '#a0632e', 4);
    g.beginPath(); g.arc(-38, -110, 44, PI * 0.6, PI * 1.6); g.arc(0, -160, 52, PI * 1.05, TAU * 0.95); g.arc(40, -112, 44, PI * 1.4, PI * 0.45);
    g.quadraticCurveTo(0, -60, -38, -70); g.closePath(); fs(g, c, 4);
    if (o.c % 3 === 0) { [[-30, -130], [20, -150], [30, -100], [-10, -100]].forEach(function (p) { circ(g, p[0], p[1], 7); fs(g, RED, 2.5); }); }
    else { g.beginPath(); g.arc(-10, -150, 22, PI * 1.1, PI * 1.6); st(g, 6, shade(c, 0.3)); }
  };
  F.bush = function (g, o) {
    var c = ['#4fbf4f', '#3fae49', '#6cc24a'][o.c % 3];
    g.beginPath(); g.arc(-30, -22, 28, PI * 0.5, PI * 1.5); g.arc(0, -38, 30, PI * 1.1, TAU * 0.95); g.arc(30, -22, 26, PI * 1.5, PI * 0.5); g.closePath(); fs(g, c, 4);
    if (o.c % 2) [[-22, -30], [12, -42], [26, -18]].forEach(function (p) { circ(g, p[0], p[1], 5); fill(g, [WH, YEL, '#ff7eb6'][o.c % 3]); });
  };
  F.flowers = function (g, o) {
    for (var i = 0; i < 5; i++) {
      var x = -26 + i * 13, y = -8 - (i % 2) * 14, c = BRIGHT[(o.c + i) % 8];
      line(g, x, 0, x, y, '#2f8a3a', 3);
      for (var p = 0; p < 5; p++) { var a = p * TAU / 5; circ(g, x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4); fill(g, c); }
      circ(g, x, y, 3); fill(g, '#ffe066');
    }
  };
  F.bench = function (g, o) {
    rr(g, -56, -48, 112, 12, 4); fs(g, '#c9853a', 3); rr(g, -56, -32, 112, 10, 4); fs(g, '#c9853a', 3);
    rr(g, -58, -20, 116, 10, 4); fs(g, '#e09a4a', 3);
    rr(g, -48, -12, 8, 14, 2); fs(g, DK, 2); rr(g, 40, -12, 8, 14, 2); fs(g, DK, 2);
  };
  F.lamp = function (g, o) {
    rr(g, -4, -150, 8, 150, 3); fs(g, DK, 2.5);
    poly(g, [-16, -150, 16, -150, 10, -172, -10, -172]); fs(g, DK, 2.5);
    circ(g, 0, -146, 9); fs(g, '#fff2a8', 2);
    rr(g, -12, -6, 24, 8, 3); fs(g, DK, 2);
  };
  F.blanket = function (g, o) {
    var c = BRIGHT[o.c % 8];
    rr(g, -70, -26, 140, 52, 6); fs(g, WH, 3);
    g.save(); rr(g, -70, -26, 140, 52, 6); g.clip();
    for (var x = -70; x < 70; x += 28) { g.fillStyle = c; g.globalAlpha = 0.75; g.fillRect(x, -26, 14, 52); }
    for (var y = -26; y < 26; y += 26) { g.fillRect(-70, y, 140, 13); }
    g.globalAlpha = 1; g.restore();
    rr(g, -70, -26, 140, 52, 6); st(g, 3, INK);
    circ(g, 30, -2, 9); fs(g, '#ff4d4d', 2); rr(g, -40, -12, 26, 20, 4); fs(g, '#c9853a', 2.5);
  };
  F.swing = function (g, o) {
    line(g, -84, 0, -60, -150, INK, 9); line(g, -84, 0, -60, -150, '#4f7bff', 5);
    line(g, 84, 0, 60, -150, INK, 9); line(g, 84, 0, 60, -150, '#4f7bff', 5);
    line(g, -64, -150, 64, -150, INK, 11); line(g, -64, -150, 64, -150, RED, 7);
    [-30, 30].forEach(function (x) { line(g, x - 12, -148, x - 12, -48, INK, 2.5); line(g, x + 12, -148, x + 12, -48, INK, 2.5); rr(g, x - 16, -50, 32, 8, 3); fs(g, YEL, 2.5); });
  };
  F.slide = function (g, o) {
    line(g, -70, 0, -70, -120, INK, 7); line(g, -40, 0, -40, -120, INK, 7);
    for (var y = -100; y < 0; y += 22) line(g, -70, y, -40, y, INK, 4);
    rr(g, -76, -128, 42, 12, 4); fs(g, RED, 3);
    g.beginPath(); g.moveTo(-40, -124); g.quadraticCurveTo(20, -110, 40, -30); g.quadraticCurveTo(52, -6, 90, -6); g.lineTo(90, 4); g.quadraticCurveTo(44, 6, 26, -24);
    g.quadraticCurveTo(10, -96, -40, -108); g.closePath(); fs(g, YEL, 3);
  };
  F.reed = function (g, o) {
    line(g, -6, 0, -10, -46, '#2f8a3a', 4); line(g, 4, 0, 8, -54, '#2f8a3a', 4); line(g, 0, 0, 0, -40, '#3fae49', 4);
    rr(g, 4, -64, 8, 18, 4); fs(g, '#8a5328', 2);
  };
  F.rock = function (g, o) {
    var c = ['#a7a3c2', '#b9b4cf', '#9a96b8'][o.c % 3];
    g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(-34, -20, -14, -26); g.quadraticCurveTo(6, -32, 22, -20); g.quadraticCurveTo(34, -8, 30, 0); g.closePath(); fs(g, c, 3);
    ell(g, -6, -18, 8, 4, -0.3); fill(g, 'rgba(255,255,255,0.5)');
  };
  F.fence = function (g, o) {
    rr(g, -64, -32, 128, 8, 3); fs(g, WH, 2.5); rr(g, -64, -16, 128, 8, 3); fs(g, WH, 2.5);
    for (var x = -56; x <= 56; x += 28) { poly(g, [x - 6, 0, x - 6, -36, x, -44, x + 6, -36, x + 6, 0]); fs(g, WH, 2.5); }
  };
  F.house = function (g, o) {
    var c = ['#ffe3b8', '#ffd0d6', '#d6ecff', '#e6ffd0', '#fff1a8', '#f0dcff'][o.c % 6];
    rr(g, -146, -340, 292, 344, 6); fs(g, c, 4);
    if (o.c % 2) { g.beginPath(); g.arc(0, -340, 80, PI, TAU); g.closePath(); fs(g, ['#4fbcd6', '#3ddc84', '#ffb02e'][o.c % 3], 4); line(g, 0, -420, 0, -404, INK, 4); }
    else { poly(g, [-150, -340, 0, -404, 150, -340]); fs(g, '#e0714a', 4); }
    for (var i = 0; i < 3; i++) {
      var x = -96 + i * 96;
      g.beginPath(); g.moveTo(x - 24, -250); g.lineTo(x - 24, -290); g.arc(x, -290, 24, PI, TAU); g.lineTo(x + 24, -250); g.closePath(); fs(g, '#5ea8d8', 3);
      line(g, x, -312, x, -250, INK, 2.5);
    }
    g.beginPath(); g.moveTo(-40, 0); g.lineTo(-40, -130); g.arc(0, -130, 40, PI, TAU); g.lineTo(40, 0); g.closePath(); fs(g, '#a0632e', 4);
    for (i = 0; i < 2; i++) { var wx = i ? 100 : -100; rr(g, wx - 26, -190, 52, 70, 4); fs(g, '#5ea8d8', 3); rr(g, wx - 34, -122, 68, 10, 3); fs(g, BRIGHT[(o.c + i) % 8], 2.5); }
  };
  F.garland = function (g, o) {
    g.beginPath(); g.moveTo(-150, 0); g.quadraticCurveTo(0, 60, 150, 0); st(g, 3, INK);
    for (var i = 1; i < 10; i++) {
      var t = i / 10, x = -150 + 300 * t, y = 2 * (1 - t) * t * 60;
      poly(g, [x - 10, y - 1, x + 10, y - 1, x, y + 22]); fs(g, BRIGHT[(o.c + i) % 8], 2);
    }
  };
  var PRODUCE = ['#ff9a2e', YEL, '#a76bff', '#e8c07a', '#ff6f3c', '#c9d64a'];
  F.stall = function (g, o) {
    var c = BRIGHT[o.c % 8];
    rr(g, -134, -170, 10, 170, 3); fs(g, '#a0632e', 2.5); rr(g, 124, -170, 10, 170, 3); fs(g, '#a0632e', 2.5);
    rr(g, -146, -90, 292, 90, 6); fs(g, '#c9853a', 4);
    rr(g, -146, -90, 292, 18, 6); fs(g, '#e09a4a', 3);
    for (var p = 0; p < 4; p++) {
      var px = -105 + p * 70, pc = PRODUCE[(o.c + p) % 6];
      for (var j = 0; j < 6; j++) { var jx = px + (j % 3 - 1) * 14 + (j > 2 ? 7 : 0), jy = -96 - (j > 2 ? 12 : 0); circ(g, jx, jy, 8); fs(g, pc, 2); }
    }
    g.beginPath(); g.moveTo(-150, -230); g.lineTo(150, -230); g.lineTo(150, -168); g.lineTo(-150, -168); g.closePath(); fs(g, WH, 4);
    g.save(); g.beginPath(); g.rect(-150, -230, 300, 62); g.clip();
    for (var x = -150; x < 150; x += 50) { g.fillStyle = c; g.fillRect(x, -230, 25, 62); }
    g.restore();
    g.beginPath(); g.moveTo(-150, -168);
    for (x = -150; x < 150; x += 25) g.arc(x + 12.5, -168, 12.5, PI, 0, true);
    g.lineTo(150, -168); fs(g, c, 3);
    rr(g, -150, -232, 300, 64, 4); st(g, 4, INK);
  };
  F.crate = function (g, o) {
    rr(g, -34, -44, 68, 44, 4); fs(g, '#d99a52', 3);
    line(g, -34, -22, 34, -22, INK, 2.5); line(g, -34, -44, 34, 0, '#a86a2e', 3);
    for (var j = 0; j < 4; j++) { circ(g, -18 + j * 12, -48, 8); fs(g, PRODUCE[(o.c + j) % 6], 2); }
  };
  F.basket = function (g, o) {
    g.beginPath(); g.moveTo(-30, -28); g.lineTo(30, -28); g.lineTo(22, 0); g.lineTo(-22, 0); g.closePath(); fs(g, '#e0a85a', 3);
    for (var y = -20; y < 0; y += 8) line(g, -26, y, 26, y, '#a86a2e', 2);
    ell(g, 0, -30, 26, 6); fs(g, ['#f2d29a', '#ff9a2e', YEL][o.c % 3], 2.5);
  };
  F.sack = function (g, o) {
    g.beginPath(); g.moveTo(-26, 0); g.quadraticCurveTo(-30, -34, -16, -42); g.lineTo(16, -42); g.quadraticCurveTo(30, -34, 26, 0); g.closePath(); fs(g, '#e8d3a6', 3);
    ell(g, 0, -42, 18, 6); fs(g, ['#ffb02e', '#ff6f3c', '#c9d64a', '#8a5a3a'][o.c % 4], 2.5);
  };
  F.pot = function (g, o) {
    var c = ['#d9774a', '#4fbcd6', '#ffb02e'][o.c % 3];
    g.beginPath(); g.moveTo(-14, -40); g.lineTo(14, -40); g.quadraticCurveTo(30, -26, 24, -6); g.quadraticCurveTo(0, 6, -24, -6); g.quadraticCurveTo(-30, -26, -14, -40); g.closePath(); fs(g, c, 3);
    line(g, -20, -20, 20, -20, WH, 3);
  };
  F.cart = function (g, o) {
    rr(g, -64, -70, 128, 46, 6); fs(g, '#4fbcd6', 4);
    for (var j = 0; j < 7; j++) { circ(g, -48 + j * 16, -74, 9); fs(g, PRODUCE[(o.c + j) % 6], 2); }
    circ(g, -40, -14, 14); fs(g, DK, 3); circ(g, 40, -14, 14); fs(g, DK, 3);
    line(g, 64, -50, 76, -80, INK, 5);
  };
  F.plant = function (g, o) {
    var c = ['#d9774a', '#4f7bff', '#ff7eb6'][o.c % 3];
    for (var i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, -36); g.quadraticCurveTo(i * 12, -70, i * 22, -100 + Math.abs(i) * 18); st(g, 8, INK); st(g, 4.5, '#3fae49'); }
    poly(g, [-26, -40, 26, -40, 18, 0, -18, 0]); fs(g, c, 3);
  };
  F.palm = function (g, o) {
    g.beginPath(); g.moveTo(-10, 0); g.quadraticCurveTo(-4, -120, 18, -220); g.lineTo(32, -218); g.quadraticCurveTo(14, -120, 12, 0); g.closePath(); fs(g, '#c98a4a', 4);
    for (var y = -30; y > -200; y -= 26) line(g, -6 + (-y) * 0.1, y, 12 + (-y) * 0.1, y - 4, '#8a5328', 2.5);
    [[-1, -0.4], [-0.6, -1], [0.1, -1.2], [0.7, -0.9], [1, -0.3]].forEach(function (d) {
      g.beginPath(); g.moveTo(24, -220); g.quadraticCurveTo(24 + d[0] * 50, -220 + d[1] * 60 - 30, 24 + d[0] * 90, -220 + d[1] * 30 + 20);
      g.quadraticCurveTo(24 + d[0] * 40, -220 + d[1] * 30, 24, -212); g.closePath(); fs(g, '#3fae49', 3.5);
    });
    circ(g, 18, -212, 9); fs(g, '#8a5328', 2.5); circ(g, 32, -208, 9); fs(g, '#8a5328', 2.5);
  };
  F.umbrella = function (g, o) {
    var c = BRIGHT[o.c % 8];
    line(g, 0, 0, 0, -120, INK, 6); line(g, 0, 0, 0, -120, WH, 3);
    g.beginPath(); g.moveTo(-76, -100); g.quadraticCurveTo(0, -190, 76, -100); g.closePath(); fs(g, WH, 4);
    g.save(); g.clip();
    for (var i = -3; i <= 3; i += 2) { poly(g, [0, -150, i * 26 - 13, -90, i * 26 + 13, -90]); fill(g, c); }
    g.restore();
    g.beginPath(); g.moveTo(-76, -100); g.quadraticCurveTo(0, -190, 76, -100); g.closePath(); st(g, 4, INK);
  };
  F.sunbather = function (g, o) {
    var c = BRIGHT[o.c % 8], skin = SKIN[o.c % 4];
    rr(g, -62, -26, 124, 52, 6); fs(g, c, 3);
    line(g, -62, -8, 62, -8, WH, 5); line(g, -62, 8, 62, 8, WH, 5);
    rr(g, -42, -10, 64, 20, 9); fs(g, SHIRT[(o.c >> 3) % 10], 2.5);
    rr(g, 18, -10, 30, 8, 4); fs(g, skin, 2); rr(g, 18, 2, 30, 8, 4); fs(g, skin, 2);
    circ(g, -48, 0, 12); fs(g, skin, 2.5); circ(g, -48, -4, 12.5); g.save(); g.clip(); g.fillStyle = HAIR[(o.c >> 2) % 5]; g.fillRect(-62, -18, 10, 30); g.restore();
    line(g, -54, -2, -50, -2, INK, 2); line(g, -46, -2, -42, -2, INK, 2);
  };
  F.castle = function (g, o) {
    var c = '#f2c66a';
    rr(g, -44, -40, 88, 40, 3); fs(g, c, 3);
    rr(g, -50, -62, 26, 62, 3); fs(g, c, 3); rr(g, 24, -62, 26, 62, 3); fs(g, c, 3);
    rr(g, -14, -70, 28, 70, 3); fs(g, c, 3);
    poly(g, [0, -70, 0, -88, 16, -82]); fs(g, BRIGHT[o.c % 8], 2);
    g.beginPath(); g.arc(0, -10, 10, PI, TAU); g.lineTo(10, 0); g.lineTo(-10, 0); g.closePath(); fs(g, '#a0632e', 2.5);
  };
  F.bucket = function (g, o) {
    var c = BRIGHT[o.c % 8];
    poly(g, [-18, -28, 18, -28, 13, 0, -13, 0]); fs(g, c, 3);
    g.beginPath(); g.arc(0, -28, 17, PI, TAU); st(g, 2.5, INK);
  };
  F.board = function (g, o) { ell(g, 0, -56, 16, 56); fs(g, BRIGHT[o.c % 8], 3); line(g, 0, -108, 0, -4, WH, 4); };
  F.swimmer = function (g, o) {
    ell(g, 0, 0, 22, 7); fill(g, 'rgba(255,255,255,0.6)');
    circ(g, 0, -10, 12); fs(g, SKIN[o.c % 4], 2.5);
    g.beginPath(); g.arc(0, -11, 13, PI, TAU); g.closePath(); fs(g, BRIGHT[o.c % 8], 2.5);
    eyes(g, 0, -7, 4, 1.8);
  };
  F.buoy = function (g, o) {
    circ(g, 0, -12, 14); fs(g, WH, 3);
    g.save(); circ(g, 0, -12, 14); g.clip(); g.fillStyle = '#ff4d4d'; g.fillRect(-14, -26, 14, 14); g.fillRect(0, -12, 14, 14); g.restore();
    circ(g, 0, -12, 14); st(g, 3, INK); circ(g, 0, -12, 6); fs(g, '#2bb3e6', 2);
  };
  F.books = function (g, o) {
    var x = -60;
    for (var i = 0; i < 6; i++) {
      var w = 14 + ((o.c + i * 7) % 3) * 4, h = 48 + ((o.c + i * 3) % 4) * 6;
      rr(g, x, -h, w, h, 2); fs(g, BRIGHT[(o.c + i) % 8], 2.5); line(g, x + 3, -h + 10, x + w - 3, -h + 10, WH, 2);
      x += w + 2;
    }
    g.save(); g.translate(x + 10, 0); g.rotate(-0.25); rr(g, 0, -50, 16, 50, 2); fs(g, BRIGHT[(o.c + 6) % 8], 2.5); g.restore();
  };
  F.frame = function (g, o) {
    rr(g, -58, -100, 116, 90, 6); fs(g, YEL, 4); rr(g, -46, -88, 92, 66, 3); fs(g, '#bff0ff', 3);
    if (o.c % 2) { circ(g, -18, -60, 10); fill(g, YEL); poly(g, [-46, -22, -10, -60, 20, -22]); fill(g, '#3fae49'); poly(g, [0, -22, 26, -50, 46, -22]); fill(g, '#56c35a'); }
    else { g.beginPath(); g.moveTo(-30, -40); g.quadraticCurveTo(0, -80, 30, -40); st(g, 6, RED); line(g, -30, -40, 30, -40, '#4f7bff', 6); }
  };
  F.blocks = function (g, o) {
    var y = 0;
    for (var i = 0; i < 3; i++) {
      var w = 72 - i * 16, h = 30, c = BRIGHT[(o.c + i) % 8];
      rr(g, -w / 2 + (i % 2 ? 5 : -5), y - h, w, h, 4); fs(g, c, 3);
      circ(g, (i % 2 ? 5 : -5), y - h / 2, 6); fill(g, 'rgba(255,255,255,0.7)');
      y -= h;
    }
  };
  F.train = function (g, o) {
    line(g, -124, 0, 124, 0, '#8a5328', 5);
    for (var k = 0; k < 3; k++) {
      var x = -112 + k * 80, c = BRIGHT[(o.c + k) % 8];
      rr(g, x, -46, 64, 34, 5); fs(g, c, 3);
      if (k === 2) { rr(g, x + 34, -64, 24, 22, 3); fs(g, c, 3); rr(g, x + 6, -60, 12, 16, 2); fs(g, DK, 2); }
      circ(g, x + 16, -10, 9); fs(g, DK, 2.5); circ(g, x + 48, -10, 9); fs(g, DK, 2.5);
    }
  };
  F.drum = function (g, o) {
    var c = BRIGHT[o.c % 8];
    rr(g, -34, -44, 68, 42, 6); fs(g, c, 3);
    for (var x = -28; x < 34; x += 14) line(g, x, -42, x + 7, -4, WH, 2.5);
    ell(g, 0, -44, 34, 10); fs(g, '#fff4dc', 3);
    line(g, -10, -52, 20, -70, INK, 4); circ(g, 20, -70, 4); fill(g, INK);
  };
  F.cushion = function (g, o) {
    var c = BRIGHT[o.c % 8];
    rr(g, -50, -30, 100, 40, 18); fs(g, c, 3);
    circ(g, 0, -10, 5); fill(g, shade(c, -0.3));
  };
  F.xylo = function (g, o) {
    for (var i = 0; i < 6; i++) { rr(g, -50 + i * 17, -26 + i * 2, 14, 24 - i * 2, 3); fs(g, BRIGHT[i % 8], 2); }
    line(g, -54, -10, 54, -4, '#8a5328', 3);
  };
  F.cube = function (g, o) {
    var c = BRIGHT[o.c % 8];
    rr(g, -20, -40, 40, 40, 5); fs(g, c, 3);
    rr(g, -12, -32, 24, 24, 3); fs(g, WH, 2);
    circ(g, 0, -20, 5); fill(g, c);
  };
  F.rug = function (g, o) {
    var c = BRIGHT[o.c % 8];
    ell(g, 0, 0, 266, 112); fs(g, shade(c, 0.45), 4);
    ell(g, 0, 0, 220, 88); st(g, 10, shade(c, 0.15));
    ell(g, 0, 0, 160, 60); st(g, 8, WH);
  };
  F.toylamp = function (g, o) {
    rr(g, -4, -110, 8, 110, 3); fs(g, YEL, 2.5);
    poly(g, [-28, -108, 28, -108, 18, -148, -18, -148]); fs(g, '#ff7eb6', 3);
    ell(g, 0, -2, 22, 6); fs(g, YEL, 2.5);
  };
  F.module = function (g, o) {
    var c = ['#e5ebf7', '#d6e2ff', '#f0e6ff'][o.c % 3];
    rr(g, -170, -200, 340, 196, 50); fs(g, c, 5);
    rr(g, -170, -120, 340, 22, 4); fs(g, ['#ff9f43', '#4f7bff', RED][o.c % 3], 3);
    for (var i = 0; i < 3; i++) {
      var x = -100 + i * 100;
      circ(g, x, -158, 24); fs(g, '#1a1446', 4);
      if ((o.c + i) % 3 === 0) { circ(g, x, -152, 11); fill(g, SKIN[(o.c + i) % 4]); eyes(g, x, -154, 4, 1.8); }
      else if ((o.c + i) % 3 === 1) { line(g, x, -138, x, -160, '#3fae49', 4); circ(g, x - 6, -160, 5); fill(g, '#3fae49'); circ(g, x + 6, -164, 5); fill(g, '#3fae49'); }
      else { circ(g, x + 6, -166, 3); fill(g, WH); }
    }
    for (i = 0; i < 5; i++) { circ(g, -120 + i * 60, -60, 6); fill(g, [RED, '#3ddc84', YEL][(o.c + i) % 3]); }
    rr(g, -40, -90, 80, 86, 10); fs(g, '#c9d3e6', 3); line(g, 0, -90, 0, -4, INK, 2.5);
  };
  F.panel = function (g, o) {
    line(g, -10, 0, 10, 0, INK, 8);
    for (var s = -1; s <= 1; s += 2) {
      var x0 = s > 0 ? 14 : -112;
      rr(g, x0, -46, 98, 92, 6); fs(g, '#3d6bff', 3.5);
      for (var i = 1; i < 4; i++) { line(g, x0 + i * 24.5, -46, x0 + i * 24.5, 46, '#9fc0ff', 2); }
      line(g, x0, 0, x0 + 98, 0, '#9fc0ff', 2);
    }
  };
  F.antenna = function (g, o) {
    line(g, 0, 0, 0, -70, INK, 5);
    g.beginPath(); g.arc(0, -70, 22, 0.15 * PI, 0.85 * PI); g.closePath(); fs(g, '#e5ebf7', 3);
    circ(g, 0, -90, 5); fs(g, RED, 2);
  };
  F.crater = function (g, o) { ell(g, 0, 0, 52, 17); fs(g, '#9a96b8', 3); ell(g, 0, 3, 40, 11); fill(g, '#827ea3'); };
  F.flag = function (g, o) { line(g, 0, 0, 0, -86, INK, 4); poly(g, [2, -86, 44, -76, 2, -64]); fs(g, BRIGHT[o.c % 8], 3); };
  F.mat = function (g, o) {
    for (var i = 0; i < 4; i++) {
      var x = -76 + (i % 2) * 76, y = -46 + Math.floor(i / 2) * 46;
      rr(g, x, y, 74, 44, 5); fs(g, shade(BRIGHT[(o.c + i) % 8], 0.35), 3);
      circ(g, x + (i % 2 ? 2 : 72), y + 22, 8); fill(g, shade(BRIGHT[(o.c + i) % 8], 0.35));
    }
  };
  F.crayons = function (g, o) {
    for (var i = 0; i < 5; i++) { var x = -20 + i * 10; poly(g, [x - 4, -24, x, -36 - (i % 2) * 4, x + 4, -24]); fs(g, BRIGHT[(o.c + i) % 8], 1.5); }
    rr(g, -28, -26, 56, 26, 4); fs(g, YEL, 3); rr(g, -18, -18, 36, 10, 3); fs(g, '#3d8bff', 2);
  };
  F.tent = function (g, o) {
    var c = BRIGHT[o.c % 8];
    poly(g, [-104, 0, 0, -150, 104, 0]); fs(g, c, 4);
    poly(g, [-26, 0, 0, -84, 26, 0]); fs(g, '#2b2452', 3);
    poly(g, [-104, 0, -60, -64, -40, -34, -20, -70, 0, -150, -104, 0]); fill(g, 'rgba(255,255,255,0.25)');
    line(g, 0, -150, 0, -168, INK, 4); poly(g, [0, -168, 26, -160, 0, -152]); fs(g, YEL, 2.5);
  };
  F.rover = function (g, o) {
    rr(g, -60, -48, 120, 30, 10); fs(g, ['#ffb02e', '#e5ebf7', RED][o.c % 3], 3.5);
    rr(g, -30, -64, 50, 18, 6); fs(g, '#8fdcff', 3);
    line(g, 40, -48, 50, -84, INK, 3); circ(g, 50, -86, 6); fs(g, RED, 2);
    [-42, 0, 42].forEach(function (x) { circ(g, x, -12, 14); fs(g, DK, 3); circ(g, x, -12, 5); fill(g, '#9aa6c4'); });
  };
  F.dome = function (g, o) {
    g.beginPath(); g.arc(0, 0, 112, PI, TAU); g.closePath(); fs(g, 'rgba(191,240,255,0.65)', 5);
    rr(g, -116, -14, 232, 18, 6); fs(g, '#9aa6c4', 4);
    line(g, -60, -2, -60, -60, '#3fae49', 5); circ(g, -60, -64, 12); fill(g, '#56c35a'); circ(g, 30, -22, 16); fill(g, '#ff7eb6');
    g.beginPath(); g.arc(-30, -60, 40, PI * 1.2, PI * 1.45); st(g, 6, 'rgba(255,255,255,0.8)');
  };
  F.comet = function (g, o) {
    g.beginPath(); g.moveTo(10, -14); g.lineTo(-86, -2); g.lineTo(10, 14); g.closePath(); fill(g, 'rgba(255,240,180,0.35)');
    circ(g, 10, 0, 16); fs(g, '#fff2a8', 3);
  };

  /* --------------------------------------------------------- backdrops */
  var B = {};
  function band(g, x0, x1, y0, y1, c0, c1) {
    var gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  B.park = function (g, S, x0, y0, x1, y1) {
    if (y0 < 470) band(g, x0, x1, 0, 470, '#6fcfff', '#d8f4ff');
    if (y0 < 230 && x1 > 2200) {
      circ(g, 2380, 120, 66); fs(g, '#ffe066', 5);
      for (var i = 0; i < 10; i++) { var a = i * TAU / 10; line(g, 2380 + Math.cos(a) * 82, 120 + Math.sin(a) * 82, 2380 + Math.cos(a) * 104, 120 + Math.sin(a) * 104, '#ffcf3a', 8); }
    }
    if (y0 < 560 && y1 > 340) {
      g.beginPath(); g.moveTo(0, 470);
      for (var x = 0; x <= S.w; x += 160) g.quadraticCurveTo(x + 80, 380 + (x % 320 ? 20 : -10), x + 160, 450);
      g.lineTo(S.w, 560); g.lineTo(0, 560); g.closePath(); fs(g, '#6cc24a', 4);
    }
    if (y1 > 450) {
      g.fillStyle = '#7ed957'; g.fillRect(x0, Math.max(450, y0), x1 - x0, y1 - Math.max(450, y0));
      g.fillStyle = '#74cf4f';
      for (var sx = Math.floor(x0 / 240) * 240; sx < x1 + 420; sx += 240) { poly(g, [sx, 460, sx + 120, 460, sx - 300, 1440, sx - 420, 1440]); g.fill(); }
    }
    if (x0 < 960 && y1 > 580 && y0 < 940) { rr(g, 300, 600, 640, 320, 60); fs(g, '#f6d98e', 5); }
    if (x1 > 1440 && y1 > 590 && y0 < 1060) {
      ell(g, 1880, 830, 438, 228); fill(g, '#c9a26a');
      ell(g, 1880, 820, 420, 215); fs(g, '#3fb4ef', 5);
      ell(g, 1880, 800, 360, 170); fill(g, '#5fcaf7');
      [[1640, 760], [2110, 900], [1780, 960], [2060, 700]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 22, 0.3, TAU - 0.3); g.lineTo(p[0], p[1]); g.closePath(); fs(g, '#3fae49', 3); });
    }
    if (y1 > 1060 && y0 < 1220) {
      g.beginPath();
      var a0 = Math.max(0, Math.floor(x0 / 40) * 40 - 40), a1 = Math.min(S.w, x1 + 40);
      for (x = a0; x <= a1; x += 40) g.lineTo(x, SZ.parkPath(x) - 60);
      for (x = a1; x >= a0; x -= 40) g.lineTo(x, SZ.parkPath(x) + 60);
      g.closePath(); fs(g, '#f2d49b', 5);
      g.fillStyle = '#e5c283';
      for (x = Math.floor(x0 / 90) * 90; x < x1; x += 90) { circ(g, x + 20, SZ.parkPath(x) + ((x / 90) % 3 - 1) * 26, 5); g.fill(); }
    }
  };
  B.market = function (g, S, x0, y0, x1, y1) {
    if (y0 < 500) band(g, x0, x1, 0, 500, '#ffc98a', '#fff1d6');
    if (y0 < 240) { circ(g, 2900, 110, 56); fs(g, '#fff2a8', 4); }
    if (y0 < 300 && y1 > 60) {
      g.fillStyle = '#ffdcb0';
      for (var x = Math.floor(x0 / 420) * 420; x < x1 + 420; x += 420) {
        g.beginPath(); g.arc(x + 100, 200, 70, PI, TAU); g.fill(); g.fillRect(x + 30, 200, 140, 120);
        g.fillRect(x + 300, 80, 34, 240); g.beginPath(); g.arc(x + 317, 80, 22, PI, TAU); g.fill();
      }
    }
    if (y1 > 480) {
      g.fillStyle = '#efd09c'; g.fillRect(x0, Math.max(480, y0), x1 - x0, y1 - Math.max(480, y0));
      g.strokeStyle = '#e0bb80'; g.lineWidth = 3; g.beginPath();
      for (var gx = Math.floor(x0 / 80) * 80; gx <= x1; gx += 80) { g.moveTo(gx, Math.max(480, y0)); g.lineTo(gx, y1); }
      for (var gy = Math.max(480, Math.floor(y0 / 80) * 80); gy <= y1; gy += 80) { g.moveTo(x0, gy); g.lineTo(x1, gy); }
      g.stroke();
    }
  };
  B.beach = function (g, S, x0, y0, x1, y1) {
    if (y0 < 400) band(g, x0, x1, 0, 400, '#7fd6ff', '#e6f8ff');
    if (y0 < 260 && x0 < 700) { circ(g, 420, 130, 70); fs(g, '#ffe066', 5); }
    if (y1 > 380 && y0 < 860) {
      band(g, x0, x1, 380, 860, '#3ec3f0', '#1a8fd0');
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
      for (var wy = 430; wy < 820; wy += 64) for (var wx = Math.floor(x0 / 180) * 180 + (wy % 128 ? 60 : 0); wx < x1; wx += 180) { g.moveTo(wx, wy); g.quadraticCurveTo(wx + 22, wy - 14, wx + 44, wy); }
      g.stroke();
    }
    if (y1 > 800) {
      g.fillStyle = '#ffe0a3'; g.fillRect(x0, Math.max(860, y0), x1 - x0, y1 - Math.max(860, y0));
      g.beginPath(); g.moveTo(x0 - 40, 830);
      for (var x = Math.floor(x0 / 80) * 80 - 80; x <= x1 + 80; x += 80) g.quadraticCurveTo(x + 40, 812, x + 80, 830);
      g.lineTo(x1 + 80, 930); g.lineTo(x0 - 80, 930); g.closePath(); fill(g, '#efc77d');
      g.beginPath(); g.moveTo(x0 - 80, 830);
      for (x = Math.floor(x0 / 80) * 80 - 80; x <= x1 + 80; x += 80) g.quadraticCurveTo(x + 40, 812, x + 80, 830);
      st(g, 9, WH);
      g.fillStyle = '#e8c27e';
      for (var i = 0; i < S.dots.length; i++) { var d = S.dots[i]; if (d[0] > x0 - 5 && d[0] < x1 + 5 && d[1] > y0 - 5 && d[1] < y1 + 5) { circ(g, d[0], d[1], d[2]); g.fill(); } }
    }
  };
  B.toys = function (g, S, x0, y0, x1, y1) {
    if (y0 < 830) {
      g.fillStyle = '#ffe2ef'; g.fillRect(x0, y0, x1 - x0, Math.min(830, y1) - y0);
      g.fillStyle = '#ffd3e6';
      for (var x = Math.floor(x0 / 120) * 120; x < x1; x += 120) g.fillRect(x, y0, 54, Math.min(830, y1) - y0);
      g.fillStyle = WH;
      for (var px = Math.floor(x0 / 120) * 120 + 87; px < x1 + 120; px += 120) for (var py = 60; py < 800; py += 120) if (py > y0 - 20 && py < y1 + 20) { starPath(g, px, py + (px % 240 ? 60 : 0), 10, 5, 5); g.fill(); }
    }
    if (x1 > 2360 && y0 < 580) {
      rr(g, 2380, 110, 580, 460, 14); fs(g, WH, 6); rr(g, 2404, 134, 532, 412, 6); fs(g, '#8fdcff', 4);
      circ(g, 2560, 260, 46); fill(g, '#ffe066'); line(g, 2670, 134, 2670, 546, WH, 12); line(g, 2404, 340, 2936, 340, WH, 12);
      g.save(); g.translate(2800, 270); g.scale(0.6, 0.6); F.cloud(g, { c: 0 }); g.restore();
      [[2380, -1], [2960, 1]].forEach(function (c) {
        g.beginPath(); g.moveTo(c[0] - c[1] * 20, 90); g.quadraticCurveTo(c[0] + c[1] * 70, 330, c[0] - c[1] * 10, 600); g.lineTo(c[0] - c[1] * 70, 600); g.lineTo(c[0] - c[1] * 70, 90); g.closePath(); fs(g, '#ff7eb6', 5);
      });
      rr(g, 2340, 80, 660, 22, 8); fs(g, '#c98a4a', 4);
    }
    [330, 620].forEach(function (sy) {
      if (y0 < sy + 40 && y1 > sy - 10 && x0 < 2220) { rr(g, 120, sy, 2100, 26, 6); fs(g, '#c98a4a', 4); for (var bx = 200; bx < 2200; bx += 500) { poly(g, [bx, sy + 26, bx + 30, sy + 26, bx, sy + 60]); fs(g, '#a0632e', 3); } }
    });
    if (y1 > 820 && y0 < 870) { g.fillStyle = WH; g.fillRect(x0, 820, x1 - x0, 40); line(g, x0, 820, x1, 820, INK, 4); line(g, x0, 860, x1, 860, INK, 4); }
    if (y1 > 860) {
      g.fillStyle = '#f0b77a'; g.fillRect(x0, Math.max(862, y0), x1 - x0, y1 - Math.max(862, y0));
      g.strokeStyle = '#d99a5a'; g.lineWidth = 4; g.beginPath();
      for (var fy = 950; fy < 1800; fy += 90) {
        if (fy < y0 - 10 || fy > y1 + 10) continue;
        g.moveTo(x0, fy); g.lineTo(x1, fy);
        for (var fx = ((fy / 90) % 2) * 200 + Math.floor(x0 / 400) * 400; fx < x1; fx += 400) { g.moveTo(fx, fy - 90); g.lineTo(fx, fy); }
      }
      g.stroke();
    }
  };
  B.space = function (g, S, x0, y0, x1, y1) {
    var sky = g.createLinearGradient(0, 0, 0, S.h); sky.addColorStop(0, '#1a1248'); sky.addColorStop(1, '#33207a');
    g.fillStyle = sky; g.fillRect(x0, Math.max(0, y0), x1 - x0, Math.min(S.h, y1) - Math.max(0, y0));
    g.globalAlpha = 0.18;
    [[800, 500, 360, '#ff7eb6'], [2300, 900, 420, '#2ec4ff'], [1500, 1300, 300, '#b57bff']].forEach(function (n) { circ(g, n[0], n[1], n[2]); fill(g, n[3]); });
    g.globalAlpha = 1;
    g.fillStyle = WH;
    for (var i = 0; i < S.dots.length; i++) { var d = S.dots[i]; if (d[0] > x0 - 6 && d[0] < x1 + 6 && d[1] > y0 - 6 && d[1] < y1 + 6) { circ(g, d[0], d[1], d[2]); g.fill(); } }
    if (x0 < 720 && y0 < 520) { circ(g, 480, 330, 170); fs(g, '#9b6bff', 6); g.save(); circ(g, 480, 330, 170); g.clip(); [[-60, 40], [10, 26], [80, 30]].forEach(function (b) { ell(g, 480, 330 + b[0], 200, b[1]); fill(g, '#b88cff'); }); g.restore(); circ(g, 480, 330, 170); st(g, 6, INK); }
    if (x1 > 2700 && y0 < 400) { circ(g, 2860, 250, 110); fs(g, '#3fd0c9', 6); circ(g, 2820, 210, 26); fill(g, '#5ee8e0'); circ(g, 2900, 300, 18); fill(g, '#2fb0a9'); }
    [730, 1110].forEach(function (ty) {
      if (y0 < ty + 40 && y1 > ty - 40 && x1 > 180 && x0 < 3020) {
        rr(g, 180, ty - 30, 2840, 60, 30); fs(g, '#9aa6c4', 5);
        g.beginPath(); for (var rx = 260; rx < 3000; rx += 120) { g.moveTo(rx, ty - 28); g.lineTo(rx, ty + 28); } st(g, 5, '#7d88aa');
      }
    });
    if (y1 > 1460) {
      g.beginPath(); g.moveTo(x0 - 50, 1800);
      for (var x = Math.floor(x0 / 200) * 200 - 200; x <= x1 + 200; x += 200) g.lineTo(x, 1500 + ((x / 200) % 2 ? 22 : -10));
      g.lineTo(x1 + 200, 1800); g.closePath(); fs(g, '#c3bfdc', 6);
    }
  };
  // Draws one place inside a world box: the backdrop, then every filler thing that touches it.
  A.drawScene = function (g, S, x0, y0, x1, y1) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    B[S.id](g, S, x0, y0, x1, y1);
    var objs = S.objs, m = 6;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i], b = o.b;
      if (b[2] < x0 - m || b[0] > x1 + m || b[3] < y0 - m || b[1] > y1 + m) continue;
      g.save(); g.translate(o.x, o.y); g.scale(o.s * o.f, o.s);
      F[o.k](g, o);
      g.restore();
    }
  };
  /* ------------------------------------------------------ list, icons */
  // One card of the list: the picture, its word, the count still to find (or a tick).
  A.card = function (g, e, x, y, w, h, bump, done) {
    var k = 1 + bump * 0.18;
    g.save(); g.translate(x + w / 2, y + h / 2); g.scale(k, k); g.translate(-w / 2, -h / 2);
    rr(g, 0, 0, w, h, 18); fs(g, done ? '#d9ffe6' : WH, 4);
    A.icon(g, e.k, e.v, w / 2, 38, 25);
    var label = SZ.label(e.k, e.v), size = A.fit(g, label, w - 12, 19, 15);
    if (size <= 15 && label !== SZ.noun(e.k)) { label = SZ.noun(e.k); size = A.fit(g, label, w - 12, 19, 13); }
    A.text(g, label, w / 2, h - 18, size, INK, { stroke: false });
    if (done) {
      circ(g, w - 12, 12, 17); fs(g, '#3ddc84', 4);
      g.beginPath(); g.moveTo(w - 21, 12); g.lineTo(w - 14, 19); g.lineTo(w - 3, 5); g.lineWidth = 5; g.strokeStyle = WH; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    } else if (e.n > 1) {
      circ(g, 14, 14, 17); fs(g, '#ff5d9e', 4);
      A.text(g, String(e.n - e.got), 14, 15, 22, WH, { stroke: false });
    }
    g.restore();
  };
  // Wordless pictures: the mouse with its wheel, a dragging hand, the magnifying glass.
  A.mouse = function (g, x, y, s, wheel, color) {
    g.save(); g.translate(x, y); g.scale(s, s); g.lineCap = 'round'; g.lineJoin = 'round';
    line(g, 0, -46, 0, -60, INK, 4);
    rr(g, -24, -44, 48, 76, 24); fs(g, WH, 4);
    line(g, -24, -12, 24, -12, INK, 3); line(g, 0, -44, 0, -12, INK, 3);
    rr(g, -6, -36, 12, 20, 6); fs(g, color || YEL, 3);
    if (wheel !== null) {
      var d = wheel || 0;
      poly(g, [0, -78 - d * 6, -12, -64 - d * 6, 12, -64 - d * 6]); fs(g, '#3ddc84', 3);
    }
    g.restore();
  };
  A.hand = function (g, x, y, s, press) {
    g.save(); g.translate(x, y); g.scale(s, s); g.translate(0, press * 4);
    g.lineJoin = 'round';
    [[-6, -40, 12, 34], [6, -18, 11, 22], [16, -14, 10, 20], [-18, -10, 10, 18]].forEach(function (f) { rr(g, f[0], f[1], f[2], f[3], 5); fs(g, WH, 3.5); });
    rr(g, -18, -4, 44, 34, 14); fs(g, WH, 3.5);
    g.restore();
  };
  A.glass = function (g, x, y, s, rot) {
    g.save(); g.translate(x, y); g.scale(s, s); g.rotate(rot || 0); g.lineCap = 'round';
    line(g, 14, 14, 36, 36, INK, 13); line(g, 14, 14, 36, 36, '#c98a4a', 8);
    circ(g, 0, 0, 20); fs(g, 'rgba(200,240,255,0.55)', 0); circ(g, 0, 0, 20); st(g, 9, INK); st(g, 5, YEL);
    g.beginPath(); g.arc(0, 0, 12, PI * 1.1, PI * 1.5); st(g, 3, WH);
    g.restore();
  };
  A.clock = function (g, x, y, r, frac, warn) {
    circ(g, x, y, r); fs(g, warn ? RED : WH, 3);
    if (frac != null) { g.beginPath(); g.moveTo(x, y); g.arc(x, y, r - 4, -PI / 2, -PI / 2 + TAU * frac); g.closePath(); fill(g, warn ? '#ffd0d4' : '#bfe8ff'); }
    line(g, x, y, x, y - r * 0.6, INK, 3); line(g, x, y, x + r * 0.45, y, INK, 3);
  };
  // A sticker: the round's first thing on a round badge in its place's colour.
  A.sticker = function (g, k, v, x, y, R, color, shiny, locked) {
    circ(g, x, y, R); fs(g, locked ? '#e3e6f3' : WH, 4);
    circ(g, x, y, R - 7); fill(g, locked ? '#cfd4e8' : shade(color, 0.55));
    if (locked) {
      g.save(); g.globalAlpha = 0.28; A.icon(g, k, v, x, y + 2, R * 0.55); g.restore();
      return;
    }
    A.icon(g, k, v, x, y + 2, R * 0.58);
    if (shiny) {
      circ(g, x, y, R); st(g, 6, '#ffc928');
      starPath(g, x + R * 0.72, y - R * 0.72, R * 0.3, R * 0.13, 5); fs(g, YEL, 3);
    }
  };
  // A place's thumbnail for the map: the whole scene, small.
  A.thumb = function (c, wi) {
    var S = SZ.scene(wi), g = c.getContext('2d'), k = Math.max(c.width / S.w, c.height / S.h);
    g.save(); g.scale(k, k); A.drawScene(g, S, 0, 0, S.w, S.h); g.restore();
  };
})();
