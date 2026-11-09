/* Lucky Lake drawing, all in canvas code. Fish, junk and plants are drawn once into
 * offscreen sprites and then only blitted; each place's still scene (sky, far shore, the
 * water's depth layers, the lake bed, the dock) is rendered once per pixel scale. Per frame
 * there are only blits and a few plain paths (waves, lines, the fisher). */
(function () {
  'use strict';
  var LL = window.LL, W = LL.W, H = LL.H, TAU = Math.PI * 2, INK = '#1c2250';
  var A = LL.art = {};
  var SS = 2; // sprites are drawn at twice their logical size
  A.INK = INK;
  A.P1 = '#ff9a1f'; A.P2 = '#e05cff';
  A.GREEN = '#5be38f';

  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function ink(g, lw, c) { g.lineWidth = lw || 4; g.strokeStyle = c || INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(hex, a) { return 'rgb(' + rgb(hex).map(function (v) { return Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)); }).join(',') + ')'; }
  function alpha(hex, a) { return 'rgba(' + rgb(hex).join(',') + ',' + a + ')'; }
  function starPath(g, x, y, R, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  function vgrad(g, stops, y0, y1) {
    var gr = g.createLinearGradient(0, y0, 0, y1);
    stops.forEach(function (s, i) { gr.addColorStop(Array.isArray(s) ? s[0] : i / (stops.length - 1), Array.isArray(s) ? s[1] : s); });
    return gr;
  }
  // A tiny seeded generator for decoration, so a scene looks the same every time.
  function seeded(n) { return function () { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }
  A.circle = circle; A.rr = rr; A.ell = ell; A.starPath = starPath; A.shade = shade; A.alpha = alpha;

  var cache = {};
  function sprite(key, w, h, draw) {
    if (cache[key]) return cache[key];
    var c = cv(w * SS, h * SS), g = c.getContext('2d');
    g.scale(SS, SS); draw(g, w, h);
    c.lw = w; c.lh = h;
    return (cache[key] = c);
  }
  A.reset = function () { cache = {}; bgs = {}; };

  /* ---------------------------------------------------------------- text */
  // Chunky outlined text. Arabic is drawn in one call, right to left, never letter by letter.
  A.text = function (g, s, x, y, size, color, o) {
    o = o || {};
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
    g.direction = /[؀-ۿ]/.test(s) ? 'rtl' : 'ltr';
    if (o.stroke !== false) { g.lineJoin = 'round'; g.lineWidth = o.lw || Math.max(4, size * 0.2); g.strokeStyle = o.stroke || INK; g.strokeText(s, x, y); }
    g.fillStyle = color || '#fff'; g.fillText(s, x, y);
    g.direction = 'ltr';
  };

  /* ---------------------------------------------------------------- fish */
  var HR = { fish: 0.44, long: 0.27, round: 0.66, flat: 0.6, whisker: 0.36, sail: 0.38, eel: 0.2, puffer: 0.78, angler: 0.7 };
  function bodyPath(g, L, h, kind) {
    var t = kind === 'eel' ? 0.32 : kind === 'round' || kind === 'flat' ? 0.3 : 0.36;
    g.beginPath();
    g.moveTo(-0.42 * L, -h * t);
    g.quadraticCurveTo(-0.26 * L, -h * 0.98, 0.02 * L, -h);
    g.bezierCurveTo(0.3 * L, -h * 1.02, 0.5 * L, -h * 0.55, 0.5 * L, h * 0.02);
    g.bezierCurveTo(0.5 * L, h * 0.6, 0.28 * L, h, 0, h);
    g.quadraticCurveTo(-0.26 * L, h * 0.96, -0.42 * L, h * t);
    g.closePath();
  }
  function pattern(g, s, L, h) {
    var c = s.c, i, r = seeded(s.i * 31 + 7);
    g.lineWidth = 2;
    switch (s.pat) {
      case 'stripes':
        g.fillStyle = alpha(c[2], 0.45);
        for (i = 0; i < 3; i++) { g.beginPath(); g.ellipse(-0.18 * L + i * 0.17 * L, 0, L * 0.045, h * 1.1, 0, 0, TAU); g.fill(); }
        break;
      case 'spots':
        g.fillStyle = s.id === 'char' ? 'rgba(255,240,220,0.9)' : alpha(c[2], 0.75);
        for (i = 0; i < 9; i++) { circle(g, (-0.32 + r() * 0.6) * L, (-0.7 + r() * 0.9) * h, L * (0.022 + r() * 0.025)); g.fill(); }
        break;
      case 'band':
        g.fillStyle = alpha(c[2], 0.8);
        g.beginPath(); g.moveTo(-0.45 * L, -h * 0.05); g.quadraticCurveTo(0.1 * L, -h * 0.3, 0.45 * L, -h * 0.12);
        g.lineTo(0.45 * L, h * 0.02); g.quadraticCurveTo(0.1 * L, -h * 0.08, -0.45 * L, h * 0.12); g.fill();
        break;
      case 'scales':
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        for (var row = -2; row <= 2; row++) for (i = 0; i < 6; i++) { g.beginPath(); g.arc((-0.3 + i * 0.11 + (row & 1) * 0.055) * L, row * h * 0.3, L * 0.05, -1.2, 1.2); g.stroke(); }
        break;
      case 'koi':
        g.fillStyle = '#ff6a3d';
        ell(g, 0.18 * L, -h * 0.5, L * 0.16, h * 0.5, 0.3); g.fill();
        ell(g, -0.18 * L, -h * 0.2, L * 0.13, h * 0.45, -0.2); g.fill();
        g.fillStyle = '#2b2b3a';
        circle(g, 0.02 * L, -h * 0.55, L * 0.04); g.fill(); circle(g, -0.28 * L, h * 0.1, L * 0.03); g.fill();
        break;
      case 'trout':
        g.fillStyle = 'rgba(255,110,150,0.65)';
        g.beginPath(); g.moveTo(-0.45 * L, -h * 0.02); g.quadraticCurveTo(0.1 * L, -h * 0.4, 0.42 * L, -h * 0.05); g.quadraticCurveTo(0.1 * L, h * 0.2, -0.45 * L, h * 0.18); g.fill();
        g.fillStyle = 'rgba(40,40,60,0.7)';
        for (i = 0; i < 12; i++) { circle(g, (-0.34 + r() * 0.66) * L, (-0.85 + r() * 0.6) * h, L * 0.013); g.fill(); }
        break;
      case 'clown':
        for (i = 0; i < 3; i++) {
          var bx = (0.2 - i * 0.26) * L;
          g.beginPath(); g.ellipse(bx, 0, L * (i === 2 ? 0.04 : 0.065), h * 1.05, 0, 0, TAU);
          g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
        }
        break;
      case 'plates':
        g.fillStyle = '#f4f7ff';
        for (i = 0; i < 6; i++) { var px = (-0.32 + i * 0.12) * L; g.beginPath(); g.moveTo(px, -h * 0.82); g.lineTo(px + L * 0.035, -h * 0.62); g.lineTo(px, -h * 0.42); g.lineTo(px - L * 0.035, -h * 0.62); g.closePath(); g.fill(); g.strokeStyle = alpha(INK, 0.6); g.lineWidth = 1.5; g.stroke(); }
        break;
      case 'gems':
        for (i = 0; i < 7; i++) {
          var gx = (-0.3 + i * 0.1) * L, up = i % 2;
          g.beginPath(); g.moveTo(gx - L * 0.06, up ? h * 0.4 : -h * 0.4); g.lineTo(gx, up ? -h * 0.5 : h * 0.5); g.lineTo(gx + L * 0.06, up ? h * 0.4 : -h * 0.4); g.closePath();
          g.fillStyle = up ? 'rgba(255,255,255,0.35)' : 'rgba(90,40,200,0.3)'; g.fill();
        }
        break;
      case 'rainbow':
        ['#ff5d6c', '#ff9f43', '#ffd23f', '#5be38f', '#4fd1ff', '#b48cff'].forEach(function (col, k) {
          g.fillStyle = col; g.fillRect(-0.5 * L, -h + k * h / 3, L, h / 3 + 0.5);
        });
        break;
    }
  }
  function eye(g, x, y, r, look) {
    circle(g, x, y, r); fill(g, '#fff'); ink(g, Math.max(1.6, r * 0.28));
    circle(g, x + r * 0.22 * (look || 1), y + r * 0.08, r * 0.58); fill(g, INK);
    circle(g, x + r * 0.05, y - r * 0.22, r * 0.24); fill(g, '#fff');
  }
  function smile(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0.25, Math.PI - 0.6); ink(g, Math.max(1.8, r * 0.38)); }
  function cheek(g, x, y, r) { ell(g, x, y, r, r * 0.6); fill(g, 'rgba(255,110,150,0.45)'); }
  function finShape(g, pts, color, lw) {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 4) g.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    g.closePath(); fill(g, color); ink(g, lw);
  }
  // A generic fish body facing right, centred on the origin, without its tail.
  function drawBody(g, s, L) {
    var kind = s.kind, h = L * HR[kind] / 2, c = s.c, lw = Math.max(2.4, L * 0.04);
    // Fins behind the body.
    if (kind === 'sail') finShape(g, [-0.3 * L, -h * 0.7, -0.25 * L, -h * 3.2, 0.1 * L, -h * 2.4, 0.2 * L, -h * 1.4, 0.18 * L, -h * 0.8], c[2], lw);
    else if (kind === 'eel') finShape(g, [-0.42 * L, -h * 0.4, -0.1 * L, -h * 1.9, 0.25 * L, -h * 0.8], c[2], lw);
    else finShape(g, [-0.2 * L, -h * 0.85, -0.12 * L, -h * (kind === 'flat' ? 1.7 : 1.55), 0.12 * L, -h * 0.9], c[2], lw);
    finShape(g, [-0.24 * L, h * 0.8, -0.2 * L, h * 1.45, -0.04 * L, h * 0.9], c[2], lw);
    bodyPath(g, L, h, kind);
    fill(g, c[0]);
    g.save(); bodyPath(g, L, h, kind); g.clip();
    // The belly, then the species' own pattern, then a soft top light.
    g.fillStyle = c[1]; ell(g, 0.05 * L, h * 0.95, L * 0.52, h * 0.75); g.fill();
    pattern(g, s, L, h);
    g.fillStyle = 'rgba(255,255,255,0.28)'; ell(g, 0.05 * L, -h * 0.72, L * 0.36, h * 0.3); g.fill();
    g.fillStyle = 'rgba(0,0,30,0.12)'; ell(g, -0.05 * L, h * 1.15, L * 0.6, h * 0.35); g.fill();
    g.restore();
    bodyPath(g, L, h, kind); ink(g, lw);
    // Gill line, pectoral fin, face.
    g.beginPath(); g.arc(0.24 * L, 0, h * 0.62, -1.1, 1.1); ink(g, lw * 0.55, alpha(INK, 0.5));
    finShape(g, [0.1 * L, h * 0.2, 0.0 * L, h * 0.45, -0.1 * L, h * 0.55, -0.02 * L, h * 0.15, 0.1 * L, h * 0.2], shade(c[2], 0.15), lw * 0.8);
    var er = Math.max(4.5, L * (kind === 'long' || kind === 'eel' ? 0.07 : 0.085));
    eye(g, 0.3 * L, -h * 0.22, er, 1);
    cheek(g, 0.3 * L, h * 0.3, er * 0.8);
    smile(g, 0.43 * L, h * 0.18, Math.max(2.4, L * 0.04));
    if (kind === 'whisker') {
      g.beginPath(); g.moveTo(0.46 * L, h * 0.05); g.quadraticCurveTo(0.62 * L, h * 0.3, 0.58 * L, h * 0.9);
      g.moveTo(0.44 * L, h * 0.22); g.quadraticCurveTo(0.52 * L, h * 0.7, 0.4 * L, h * 1.1);
      g.moveTo(0.47 * L, -h * 0.05); g.quadraticCurveTo(0.66 * L, -h * 0.1, 0.7 * L, h * 0.35); ink(g, lw * 0.7);
    }
    if (s.legend) {
      // The legendary golden fish wears a tiny crown.
      var cx = 0.16 * L, cy = -h * 1.02, cw = L * 0.11;
      g.beginPath(); g.moveTo(cx - cw, cy); g.lineTo(cx - cw, cy - cw * 1.1); g.lineTo(cx - cw * 0.5, cy - cw * 0.55); g.lineTo(cx, cy - cw * 1.35);
      g.lineTo(cx + cw * 0.5, cy - cw * 0.55); g.lineTo(cx + cw, cy - cw * 1.1); g.lineTo(cx + cw, cy); g.closePath();
      fill(g, '#ffe14d'); ink(g, lw * 0.7); circle(g, cx, cy - cw * 0.45, cw * 0.22); fill(g, '#ff5d6c');
    }
  }
  function drawTail(g, s, L) {
    var h = L * HR[s.kind] / 2, lw = Math.max(2.4, L * 0.04), t = s.kind === 'eel' ? 0.32 : s.kind === 'round' || s.kind === 'flat' ? 0.3 : 0.36;
    var len = L * (s.kind === 'eel' ? 0.14 : s.kind === 'long' ? 0.22 : 0.24), spread = s.kind === 'eel' ? h * 1.6 : s.kind === 'long' ? h * 1.6 : h * 1.15;
    g.beginPath();
    g.moveTo(len * 0.12, -h * t);
    g.quadraticCurveTo(-len * 0.5, -spread * 0.6, -len, -spread);
    g.quadraticCurveTo(-len * 0.62, 0, -len, spread);
    g.quadraticCurveTo(-len * 0.5, spread * 0.6, len * 0.12, h * t);
    g.closePath();
    fill(g, s.c[2]); ink(g, lw);
    g.beginPath(); g.moveTo(-len * 0.2, 0); g.lineTo(-len * 0.7, -spread * 0.5); g.moveTo(-len * 0.2, 0); g.lineTo(-len * 0.7, spread * 0.5);
    ink(g, lw * 0.5, 'rgba(255,255,255,0.5)');
  }
  // Special shapes are one sprite each, facing right.
  function drawSpecial(g, s, L) {
    var c = s.c, lw = Math.max(2.6, L * 0.045), i;
    if (s.kind === 'crab') {
      for (i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(-L * 0.16, L * 0.04 + i * L * 0.06); g.quadraticCurveTo(-L * 0.36, L * 0.02 + i * L * 0.08, -L * 0.4, L * 0.2 + i * L * 0.05); ink(g, lw * 1.6); ink(g, lw * 0.8, c[2]);
        g.beginPath(); g.moveTo(L * 0.16, L * 0.04 + i * L * 0.06); g.quadraticCurveTo(L * 0.36, L * 0.02 + i * L * 0.08, L * 0.4, L * 0.2 + i * L * 0.05); ink(g, lw * 1.6); ink(g, lw * 0.8, c[2]);
      }
      [-1, 1].forEach(function (d) {
        g.beginPath(); g.moveTo(d * L * 0.2, -L * 0.02); g.quadraticCurveTo(d * L * 0.34, -L * 0.12, d * L * 0.36, -L * 0.24); ink(g, lw * 1.6); ink(g, lw * 0.8, c[0]);
        circle(g, d * L * 0.38, -L * 0.3, L * 0.11); fill(g, c[0]); ink(g, lw);
        g.beginPath(); g.moveTo(d * L * 0.38, -L * 0.3); g.lineTo(d * L * 0.5, -L * 0.42); g.lineTo(d * L * 0.3, -L * 0.44); g.closePath(); fill(g, '#9fe6ff'); ink(g, lw * 0.8);
      });
      ell(g, 0, L * 0.04, L * 0.27, L * 0.18); fill(g, c[0]); ink(g, lw);
      ell(g, 0, L * 0.1, L * 0.18, L * 0.08); fill(g, c[1]);
      [-1, 1].forEach(function (d) {
        g.beginPath(); g.moveTo(d * L * 0.08, -L * 0.1); g.lineTo(d * L * 0.1, -L * 0.22); ink(g, lw);
        eye(g, d * L * 0.1, -L * 0.25, L * 0.07, d);
      });
      smile(g, 0, L * 0.02, L * 0.06);
      cheek(g, -L * 0.15, L * 0.06, L * 0.04); cheek(g, L * 0.15, L * 0.06, L * 0.04);
    } else if (s.kind === 'turtle') {
      ell(g, -L * 0.32, L * 0.12, L * 0.1, L * 0.05, -0.5); fill(g, '#a8e07a'); ink(g, lw);
      ell(g, L * 0.18, L * 0.2, L * 0.17, L * 0.06, 0.6); fill(g, '#a8e07a'); ink(g, lw);
      ell(g, -L * 0.18, L * 0.18, L * 0.13, L * 0.05, -0.4); fill(g, '#a8e07a'); ink(g, lw);
      circle(g, L * 0.38, -L * 0.02, L * 0.12); fill(g, '#a8e07a'); ink(g, lw);
      eye(g, L * 0.42, -L * 0.06, L * 0.05, 1); smile(g, L * 0.45, L * 0.02, L * 0.03); cheek(g, L * 0.38, L * 0.05, L * 0.03);
      g.beginPath(); g.moveTo(-L * 0.36, L * 0.1); g.quadraticCurveTo(-L * 0.36, -L * 0.3, 0, -L * 0.3); g.quadraticCurveTo(L * 0.34, -L * 0.3, L * 0.32, L * 0.1); g.closePath();
      fill(g, c[0]); g.save(); g.clip();
      g.fillStyle = c[2];
      [[-0.18, -0.08], [0.02, -0.14], [0.2, -0.06], [-0.05, 0.03], [0.14, 0.04], [-0.24, 0.05]].forEach(function (q) {
        g.beginPath();
        for (var k = 0; k < 6; k++) { var a = k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](q[0] * L + Math.cos(a) * L * 0.07, q[1] * L + Math.sin(a) * L * 0.07); }
        g.closePath(); g.fill();
      });
      g.fillStyle = 'rgba(255,255,255,0.3)'; ell(g, -L * 0.05, -L * 0.24, L * 0.2, L * 0.05); g.fill();
      g.restore();
      g.beginPath(); g.moveTo(-L * 0.36, L * 0.1); g.quadraticCurveTo(-L * 0.36, -L * 0.3, 0, -L * 0.3); g.quadraticCurveTo(L * 0.34, -L * 0.3, L * 0.32, L * 0.1); g.closePath(); ink(g, lw);
      rr(g, -L * 0.38, L * 0.06, L * 0.72, L * 0.08, L * 0.04); fill(g, '#ffe9a0'); ink(g, lw);
    } else if (s.kind === 'jelly') {
      for (i = 0; i < 5; i++) {
        var tx = (-0.24 + i * 0.12) * L;
        g.beginPath(); g.moveTo(tx, L * 0.05); g.bezierCurveTo(tx + L * 0.08, L * 0.2, tx - L * 0.08, L * 0.32, tx + L * 0.03, L * 0.48); ink(g, lw * 1.4); ink(g, lw * 0.7, c[2]);
      }
      g.beginPath(); g.moveTo(-L * 0.34, L * 0.08); g.quadraticCurveTo(-L * 0.36, -L * 0.42, 0, -L * 0.42); g.quadraticCurveTo(L * 0.36, -L * 0.42, L * 0.34, L * 0.08);
      g.quadraticCurveTo(L * 0.17, L * 0.16, 0, L * 0.08); g.quadraticCurveTo(-L * 0.17, L * 0.16, -L * 0.34, L * 0.08); g.closePath();
      fill(g, alpha(c[0], 0.9)); ink(g, lw);
      ell(g, -L * 0.1, -L * 0.28, L * 0.12, L * 0.06, -0.3); fill(g, 'rgba(255,255,255,0.6)');
      eye(g, -L * 0.1, -L * 0.1, L * 0.06, 1); eye(g, L * 0.1, -L * 0.1, L * 0.06, 1);
      smile(g, 0, -L * 0.04, L * 0.05); cheek(g, -L * 0.2, -L * 0.02, L * 0.04); cheek(g, L * 0.2, -L * 0.02, L * 0.04);
    } else if (s.kind === 'star') {
      g.beginPath();
      for (i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? L * 0.2 : L * 0.46; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d); }
      g.closePath(); fill(g, c[0]); g.lineJoin = 'round'; ink(g, lw);
      g.fillStyle = c[2];
      for (i = 0; i < 5; i++) { var b = -Math.PI / 2 + i * TAU / 5; circle(g, Math.cos(b) * L * 0.3, Math.sin(b) * L * 0.3, L * 0.03); g.fill(); }
      eye(g, -L * 0.08, -L * 0.04, L * 0.06, 1); eye(g, L * 0.08, -L * 0.04, L * 0.06, 1); smile(g, 0, L * 0.04, L * 0.05);
    } else if (s.kind === 'puffer') {
      var R = L * 0.38;
      finShape(g, [-R * 0.9, -R * 0.2, -R * 1.5, -R * 0.6, -R * 1.45, 0, -R * 1.5, R * 0.6, -R * 0.9, R * 0.2], c[2], lw);
      for (i = 0; i < 16; i++) {
        var sa = i * TAU / 16;
        g.beginPath(); g.moveTo(Math.cos(sa - 0.12) * R, Math.sin(sa - 0.12) * R); g.lineTo(Math.cos(sa) * R * 1.22, Math.sin(sa) * R * 1.22); g.lineTo(Math.cos(sa + 0.12) * R, Math.sin(sa + 0.12) * R);
        fill(g, '#fff3c4'); ink(g, lw * 0.6);
      }
      circle(g, 0, 0, R); fill(g, c[0]);
      g.save(); circle(g, 0, 0, R); g.clip(); g.fillStyle = c[1]; ell(g, 0, R * 0.8, R * 1.1, R * 0.6); g.fill();
      g.fillStyle = alpha(c[2], 0.7); for (i = 0; i < 7; i++) { circle(g, -R * 0.5 + (i % 4) * R * 0.3, -R * 0.55 + Math.floor(i / 4) * R * 0.35, R * 0.07); g.fill(); }
      g.restore(); circle(g, 0, 0, R); ink(g, lw);
      eye(g, R * 0.35, -R * 0.25, R * 0.26, 1); cheek(g, R * 0.25, R * 0.25, R * 0.14);
      circle(g, R * 0.82, R * 0.12, R * 0.1); fill(g, '#ff7a9c'); ink(g, lw * 0.6);
      finShape(g, [0, R * 0.2, -R * 0.2, R * 0.6, -R * 0.4, R * 0.4], c[2], lw * 0.8);
    } else if (s.kind === 'angler') {
      var Q = L * 0.36;
      finShape(g, [-Q * 0.9, -Q * 0.3, -Q * 1.55, -Q * 0.8, -Q * 1.5, 0, -Q * 1.55, Q * 0.8, -Q * 0.9, Q * 0.3], c[1], lw);
      g.beginPath(); g.moveTo(Q * 0.1, -Q * 0.9); g.quadraticCurveTo(Q * 0.6, -Q * 1.8, Q * 1.3, -Q * 1.2); ink(g, lw);
      circle(g, Q * 1.32, -Q * 1.08, Q * 0.22); fill(g, '#ffe14d'); ink(g, lw);
      circle(g, Q * 1.26, -Q * 1.14, Q * 0.08); fill(g, '#fff');
      ell(g, 0, 0, Q * 1.05, Q * 0.92); fill(g, c[0]);
      g.save(); ell(g, 0, 0, Q * 1.05, Q * 0.92); g.clip(); g.fillStyle = c[1]; ell(g, 0, Q * 0.9, Q * 1.2, Q * 0.5); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.2)'; for (i = 0; i < 6; i++) { circle(g, -Q * 0.5 + (i % 3) * Q * 0.35, -Q * 0.5 + Math.floor(i / 3) * Q * 0.35, Q * 0.06); g.fill(); }
      g.restore(); ell(g, 0, 0, Q * 1.05, Q * 0.92); ink(g, lw);
      g.beginPath(); g.moveTo(Q * 0.25, Q * 0.25); g.quadraticCurveTo(Q * 0.7, Q * 0.62, Q * 1.02, Q * 0.18); g.quadraticCurveTo(Q * 0.7, Q * 0.38, Q * 0.25, Q * 0.25);
      fill(g, '#ff7a9c'); ink(g, lw * 0.8);
      g.beginPath(); g.moveTo(Q * 0.55, Q * 0.38); g.lineTo(Q * 0.6, Q * 0.25); g.lineTo(Q * 0.66, Q * 0.37); g.moveTo(Q * 0.8, Q * 0.34); g.lineTo(Q * 0.84, Q * 0.22); g.lineTo(Q * 0.89, Q * 0.31);
      fill(g, '#fff'); ink(g, lw * 0.5);
      eye(g, Q * 0.45, -Q * 0.3, Q * 0.24, 1); cheek(g, Q * 0.1, Q * 0.05, Q * 0.12);
      finShape(g, [-Q * 0.1, Q * 0.3, -Q * 0.35, Q * 0.65, -Q * 0.55, Q * 0.35], c[2], lw * 0.8);
    }
  }
  var SPECIAL = { crab: 1, turtle: 1, jelly: 1, star: 1, puffer: 1, angler: 1 };
  A.isSpecial = function (s) { return !!SPECIAL[s.kind]; };
  // Sprites: body (with the face) and tail apart, so the tail can wag.
  function fishSprites(s) {
    var L = s.len, h = L * (HR[s.kind] || 0.6), w = L * 1.5, hh = Math.max(h * 3.4, L * 1.05);
    var body = sprite('fb' + s.i, w, hh, function (g) { g.translate(w * 0.45, hh / 2); if (SPECIAL[s.kind]) drawSpecial(g, s, L); else drawBody(g, s, L); });
    var tail = SPECIAL[s.kind] ? null : sprite('ft' + s.i, L * 0.4, hh, function (g) { g.translate(L * 0.3, hh / 2); drawTail(g, s, L); });
    return { body: body, tail: tail, w: w, hh: hh, L: L };
  }
  // A dark silhouette for a species not caught yet.
  function silhouette(s) {
    var sp = fishSprites(s), key = 'sil' + s.i;
    if (cache[key]) return cache[key];
    var c = cv(sp.body.width, sp.body.height), g = c.getContext('2d');
    g.drawImage(sp.body, 0, 0);
    if (sp.tail) g.drawImage(sp.tail, (sp.w * 0.45 - s.len * 0.42 - s.len * 0.3) * SS, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#28305e'; g.fillRect(0, 0, c.width, c.height);
    return (cache[key] = c);
  }
  // The glow behind rare and magic fish.
  function glowSprite(col) {
    return sprite('glow' + col, 128, 128, function (g) {
      var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, alpha(col, 0.75)); gr.addColorStop(0.4, alpha(col, 0.28)); gr.addColorStop(1, alpha(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
  }
  A.glow = glowSprite;
  // Draws species s at (x, y), facing dir, scale k. o: { time, still, wag, sil, phase, alpha }
  A.species = function (g, s, x, y, dir, k, o) {
    o = o || {};
    var sp = fishSprites(s), t = o.time || 0, ph = o.phase || 0, L = s.len;
    g.save(); g.translate(x, y); g.scale((dir < 0 ? -1 : 1) * k, k);
    if (o.rot) g.rotate(o.rot);
    if (o.sil) { g.drawImage(silhouette(s), -sp.w * 0.45, -sp.hh / 2, sp.w, sp.hh); g.restore(); return; }
    var still = o.still, wag = still ? 0 : (o.wag == null ? 1 : o.wag);
    if (SPECIAL[s.kind]) {
      var sq = still ? 0 : Math.sin(t * (s.kind === 'jelly' ? 3 : 6) + ph) * (s.kind === 'jelly' ? 0.08 : 0.03) * wag;
      g.scale(1 - sq * 0.5, 1 + sq);
      if (s.kind === 'crab' && !still) g.rotate(Math.sin(t * 9 + ph) * 0.05 * wag);
      g.drawImage(sp.body, -sp.w * 0.45, -sp.hh / 2, sp.w, sp.hh);
    } else {
      var a = Math.sin(t * (7 + (o.fast || 0) * 8) + ph) * 0.32 * wag;
      g.save(); g.translate(-L * 0.42, 0); g.rotate(a);
      g.drawImage(sp.tail, -L * 0.3, -sp.hh / 2, L * 0.4, sp.hh);
      g.restore();
      g.rotate(-a * 0.12);
      g.drawImage(sp.body, -sp.w * 0.45, -sp.hh / 2, sp.w, sp.hh);
    }
    g.restore();
  };
  // A live fish in the lake.
  A.fish = function (g, f, s, time, still, night) {
    var k = f.size, fast = f.state === 'flee' || f.state === 'hooked' ? 1 : f.state === 'approach' ? 0.5 : 0;
    if (s.glow || s.rarity === 3) {
      var col = s.glow || '#ffffff', pulse = still ? 0.8 : 0.65 + 0.35 * Math.sin(time * 3 + f.ph);
      g.globalAlpha = (night ? 0.75 : 0.5) * pulse;
      var gs = s.len * k * 1.7;
      g.drawImage(glowSprite(col), f.x - gs / 2, f.y - gs / 2, gs, gs);
      g.globalAlpha = 1;
    }
    var rot = f.state === 'hooked' ? Math.sin(time * 14) * 0.25 : f.wig ? Math.sin(time * 22) * 0.2 * f.wig : 0;
    A.species(g, s, f.x, f.y, f.dir, k, { time: time, still: still, phase: f.ph, fast: fast, rot: rot });
    if (s.rarity === 3 && !still) {
      // Rare fish shimmer: little stars twinkle around them.
      for (var i = 0; i < 3; i++) {
        var tw = Math.sin(time * 4 + f.ph + i * 2.1);
        if (tw < 0.2) continue;
        var ax = f.x + Math.cos(f.ph + i * 2.1 + time * 0.6) * s.len * k * 0.55, ay = f.y + Math.sin(f.ph * 2 + i * 1.7 + time * 0.8) * s.len * k * 0.35;
        A.sparkle(g, ax, ay, 4 + tw * 5, s.legend ? '#ffe14d' : '#ffffff');
      }
    }
  };
  A.sparkle = function (g, x, y, r, col) {
    g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r);
    g.fillStyle = col; g.fill();
  };

  /* ---------------------------------------------------------------- junk */
  function junkSprite(kind) {
    return sprite('j' + kind, 110, 90, function (g) {
      g.translate(55, 50);
      if (kind === 'boot') {
        g.beginPath(); g.moveTo(-26, -34); g.lineTo(4, -34); g.lineTo(6, 2); g.quadraticCurveTo(36, 2, 40, 18); g.lineTo(40, 26); g.lineTo(-28, 26); g.closePath();
        fill(g, '#9a6234'); ink(g, 4);
        rr(g, -30, 20, 72, 10, 5); fill(g, '#5a3a20'); ink(g, 4);
        g.beginPath(); g.moveTo(-18, -20); g.lineTo(0, -16); g.moveTo(-18, -10); g.lineTo(0, -6); g.moveTo(-18, 0); g.lineTo(0, 4); ink(g, 3, '#f4e4c0');
        rr(g, -30, -40, 38, 9, 4); fill(g, '#b5793f'); ink(g, 4);
        circle(g, 20, 12, 4); fill(g, '#4a2c14');
        g.beginPath(); g.moveTo(-6, -40); g.quadraticCurveTo(-2, -54, 10, -48); ink(g, 3, '#3fbf5a');
      } else if (kind === 'duck') {
        ell(g, 0, 10, 34, 20); fill(g, '#ffd23f'); ink(g, 4);
        g.beginPath(); g.moveTo(-34, 4); g.quadraticCurveTo(-44, -6, -40, 12); fill(g, '#ffd23f'); ink(g, 4);
        circle(g, 16, -16, 18); fill(g, '#ffd23f'); ink(g, 4);
        g.beginPath(); g.moveTo(30, -18); g.quadraticCurveTo(46, -14, 30, -8); g.closePath(); fill(g, '#ff8a1f'); ink(g, 3.5);
        eye(g, 20, -22, 6, 1); cheek(g, 14, -10, 5);
        g.beginPath(); g.moveTo(-14, 8); g.quadraticCurveTo(0, 22, 12, 6); ink(g, 3.5, '#e0a800');
        ell(g, -4, -2, 12, 5, -0.3); fill(g, 'rgba(255,255,255,0.6)');
      } else if (kind === 'teapot') {
        g.beginPath(); g.moveTo(26, -4); g.quadraticCurveTo(44, -10, 46, -26); g.lineTo(40, -26); g.quadraticCurveTo(36, -14, 22, -12); ink(g, 9); ink(g, 5, '#5aa9ff');
        g.beginPath(); g.arc(-30, 0, 14, Math.PI * 0.5, Math.PI * 1.5); ink(g, 9); ink(g, 5, '#5aa9ff');
        ell(g, 0, 2, 32, 26); fill(g, '#5aa9ff'); ink(g, 4);
        g.save(); ell(g, 0, 2, 32, 26); g.clip(); g.fillStyle = '#ffffff'; for (var i = 0; i < 5; i++) { circle(g, -20 + i * 10, 6 + (i % 2) * 6, 4); g.fill(); } g.restore();
        rr(g, -16, -30, 32, 8, 4); fill(g, '#3d86e0'); ink(g, 3.5);
        circle(g, 0, -34, 5); fill(g, '#ffd23f'); ink(g, 3);
        ell(g, -12, -10, 9, 5, -0.4); fill(g, 'rgba(255,255,255,0.55)');
      } else {
        // A treasure chest, its lid open, gold inside.
        g.beginPath(); g.moveTo(-36, -8); g.lineTo(-30, -38); g.lineTo(30, -38); g.lineTo(36, -8); g.closePath(); fill(g, '#a8672d'); ink(g, 4);
        for (var j = 0; j < 6; j++) { circle(g, -24 + j * 9.6, -12 - (j % 2) * 5, 7); fill(g, '#ffd23f'); ink(g, 2.5); }
        A.sparkle(g, 18, -28, 8, '#ffffff');
        rr(g, -38, -10, 76, 40, 6); fill(g, '#b9763a'); ink(g, 4);
        g.fillStyle = '#ffd23f'; g.fillRect(-38, -2, 76, 6); g.fillRect(-26, -10, 6, 40); g.fillRect(20, -10, 6, 40);
        rr(g, -38, -10, 76, 40, 6); ink(g, 4);
        rr(g, -8, -2, 16, 16, 4); fill(g, '#ffd23f'); ink(g, 3); circle(g, 0, 6, 2.5); fill(g, INK);
      }
    });
  }
  A.junkIcon = function (g, kind, x, y, k) { var s = junkSprite(kind); g.drawImage(s, x - 55 * k, y - 50 * k, 110 * k, 90 * k); };
  A.junk = function (g, j, time, still) {
    if (!j.kind || j.taken) return;
    var bob = still ? 0 : Math.sin(time * 2 + j.x) * (j.float ? 4 : 1.5);
    var k = j.float ? 0.62 : 0.72;
    if (j.kind === 'chest' && !still) {
      g.globalAlpha = 0.35 + 0.25 * Math.sin(time * 3);
      g.drawImage(glowSprite('#ffe14d'), j.x - 70, j.y - 80, 140, 140); g.globalAlpha = 1;
    }
    A.junkIcon(g, j.kind, j.x, j.y - (j.float ? 8 : 18) + bob, k);
  };

  /* --------------------------------------------------------------- scenes */
  // Per place: sky, water (surface, middle, deep), floor, plant and dock colours.
  var SCENE = [
    { sky: ['#5ec8ff', '#bfeeff', '#e9fbff'], water: ['#62dcd6', '#2aa8c0', '#16627f'], floor: '#d1aa6c', floor2: '#b58e55', plant: '#3fbf5a', plant2: '#2e9a49', far: '#8fd46a', far2: '#6cc04f' },
    { sky: ['#62c3ff', '#c8f0ff', '#effcff'], water: ['#6fd0f6', '#2f8fd0', '#174f88'], floor: '#9aa3ad', floor2: '#7c8590', plant: '#4cc36b', plant2: '#2f9a55', far: '#7ccf73', far2: '#4fae5c' },
    { sky: ['#3fb6ff', '#a8e6ff', '#e2f8ff'], water: ['#45d6ff', '#1596dc', '#0b4f9e'], floor: '#f4d690', floor2: '#ddb96c', plant: '#3fd08a', plant2: '#22a06a', far: '#2f8fe0', far2: '#f6dd9a' },
    { sky: ['#8fd2ff', '#d3efff', '#f4fbff'], water: ['#86d8f2', '#3a8fc4', '#1b4a7c'], floor: '#8a96a8', floor2: '#6c788c', plant: '#58b8a8', plant2: '#3d8f88', far: '#e8f4ff', far2: '#c6dcf2' },
    { sky: ['#140f45', '#2c2378', '#4a3a9a'], water: ['#4646b8', '#25218a', '#0f0b46'], floor: '#3a2c74', floor2: '#2a1f5c', plant: '#3df5c8', plant2: '#20b49a', far: '#2a2068', far2: '#3a2c84' }
  ];
  A.SCENE = SCENE;
  var bgs = {};
  // The still scene for place i at pixel scale ps.
  A.bg = function (i, ps) {
    var key = i + ':' + ps;
    if (bgs[key]) return bgs[key];
    var c = cv(W * ps, H * ps), g = c.getContext('2d');
    g.scale(ps, ps);
    paintScene(g, i);
    return (bgs[key] = c);
  };
  function hill(g, y0, amp, n, seed, color, outline) {
    var r = seeded(seed);
    g.beginPath(); g.moveTo(0, H);
    g.lineTo(0, y0);
    for (var x = 0; x <= W; x += W / n) g.quadraticCurveTo(x + W / n / 2, y0 - amp * (0.5 + r()), x + W / n, y0 - amp * 0.3 * r());
    g.lineTo(W, H); g.closePath(); fill(g, color);
    if (outline) ink(g, 4, alpha(INK, 0.35));
  }
  function tree(g, x, y, s, color, snow) {
    g.fillStyle = '#8a5a2b'; g.fillRect(x - 4 * s, y - 14 * s, 8 * s, 16 * s);
    for (var k = 0; k < 3; k++) {
      g.beginPath(); g.moveTo(x, y - (60 - k * 14) * s); g.lineTo(x + (22 - k * 3) * s, y - (16 + k * 12) * s); g.lineTo(x - (22 - k * 3) * s, y - (16 + k * 12) * s); g.closePath();
      fill(g, color); ink(g, 3 * s, alpha(INK, 0.4));
      if (snow) { g.beginPath(); g.moveTo(x, y - (60 - k * 14) * s); g.lineTo(x + 8 * s, y - (46 - k * 14) * s); g.lineTo(x - 8 * s, y - (46 - k * 14) * s); g.closePath(); fill(g, '#ffffff'); }
    }
  }
  function roundTree(g, x, y, s, color) {
    g.fillStyle = '#8a5a2b'; g.fillRect(x - 5 * s, y - 24 * s, 10 * s, 26 * s);
    circle(g, x, y - 40 * s, 24 * s); fill(g, color); ink(g, 3 * s, alpha(INK, 0.4));
    circle(g, x - 8 * s, y - 46 * s, 8 * s); fill(g, 'rgba(255,255,255,0.25)');
  }
  function cloudShape(g, x, y, s) {
    g.beginPath();
    g.arc(x, y, 22 * s, Math.PI * 0.5, Math.PI * 1.5); g.arc(x + 26 * s, y - 16 * s, 26 * s, Math.PI, Math.PI * 1.85);
    g.arc(x + 58 * s, y - 8 * s, 22 * s, Math.PI * 1.3, Math.PI * 0.2); g.arc(x + 70 * s, y + 6 * s, 16 * s, Math.PI * 1.5, Math.PI * 0.5);
    g.closePath();
  }
  function cloudSprite(night) {
    return sprite('cloud' + (night ? 'n' : ''), 140, 80, function (g) {
      cloudShape(g, 34, 46, 1); fill(g, night ? 'rgba(120,110,200,0.55)' : '#ffffff'); ink(g, 4, night ? 'rgba(20,15,69,0.4)' : alpha(INK, 0.25));
      if (!night) { cloudShape(g, 38, 52, 0.7); fill(g, 'rgba(200,230,255,0.5)'); }
    });
  }
  function weed(g, x, y, h, col, lw, bend) {
    g.beginPath(); g.moveTo(x, y);
    g.bezierCurveTo(x + bend, y - h * 0.35, x - bend, y - h * 0.65, x + bend * 0.5, y - h);
    ink(g, lw + 6); ink(g, lw, col);
  }
  function rock(g, x, y, rx, ry, col) {
    ell(g, x, y, rx, ry); fill(g, col); ink(g, 4);
    ell(g, x - rx * 0.3, y - ry * 0.4, rx * 0.35, ry * 0.22, -0.2); fill(g, 'rgba(255,255,255,0.3)');
  }
  function paintScene(g, i) {
    var S = SCENE[i], P = LL.PLACES[i], top = P.surface, bed = P.bed, r = seeded(17 + i * 101), k;
    // Sky.
    g.fillStyle = vgrad(g, S.sky, 0, top); g.fillRect(0, 0, W, top + 4);
    if (P.night) {
      for (k = 0; k < 70; k++) { var sx = r() * W, sy = r() * (top - 40); circle(g, sx, sy, r() < 0.15 ? 2.4 : 1.3); fill(g, 'rgba(255,255,255,' + (0.5 + r() * 0.5) + ')'); }
      var mg = g.createRadialGradient(1010, 78, 20, 1010, 78, 120); mg.addColorStop(0, 'rgba(255,250,210,0.55)'); mg.addColorStop(1, 'rgba(255,250,210,0)');
      g.fillStyle = mg; g.fillRect(860, 0, 300, 220);
      circle(g, 1010, 78, 44); fill(g, '#fff6c8'); ink(g, 4, 'rgba(20,15,69,0.5)');
      circle(g, 994, 66, 9); fill(g, 'rgba(220,210,160,0.6)'); circle(g, 1024, 92, 6); fill(g, 'rgba(220,210,160,0.6)');
    } else {
      var sg = g.createRadialGradient(1060, 70, 20, 1060, 70, 150); sg.addColorStop(0, 'rgba(255,245,170,0.8)'); sg.addColorStop(1, 'rgba(255,245,170,0)');
      g.fillStyle = sg; g.fillRect(900, 0, 320, 230);
      circle(g, 1060, 70, 40); fill(g, '#ffe066'); ink(g, 4, alpha(INK, 0.3));
    }
    // The far shore.
    if (i === 0) {
      hill(g, top - 40, 50, 4, 3, S.far, true); hill(g, top - 10, 26, 6, 5, S.far2, false);
      g.save(); g.translate(760, top - 52);
      rr(g, -30, -36, 60, 40, 4); fill(g, '#fff3d6'); ink(g, 3);
      g.beginPath(); g.moveTo(-38, -34); g.lineTo(0, -64); g.lineTo(38, -34); g.closePath(); fill(g, '#ff6b5a'); ink(g, 3);
      rr(g, -8, -18, 16, 22, 3); fill(g, '#9a6234'); rr(g, 12, -28, 12, 10, 2); fill(g, '#7fd6ff'); ink(g, 2);
      g.restore();
      [[540, 0.9], [610, 0.7], [930, 1], [1180, 0.8]].forEach(function (t) { roundTree(g, t[0], top - 18, t[1], '#4cb84f'); });
    } else if (i === 1) {
      hill(g, top - 60, 60, 3, 9, '#a9d9ff', false);
      hill(g, top - 30, 40, 5, 11, S.far, true);
      for (k = 0; k < 9; k++) tree(g, 420 + k * 100 + r() * 40, top - 12, 0.8 + r() * 0.4, k % 2 ? '#2f9a55' : '#3fae5f');
      hill(g, top - 6, 10, 8, 13, S.far2, false);
    } else if (i === 2) {
      g.fillStyle = '#2f8fe0'; g.fillRect(0, top - 34, W, 40);
      g.fillStyle = 'rgba(255,255,255,0.5)'; for (k = 0; k < 12; k++) g.fillRect(320 + k * 80 + r() * 30, top - 24 + r() * 14, 26, 3);
      g.save(); g.translate(1150, top - 36); g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.lineTo(18, 14); g.lineTo(-18, 14); g.closePath(); fill(g, '#ff6b5a'); ink(g, 3);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -46); ink(g, 3); g.beginPath(); g.moveTo(2, -44); g.lineTo(26, -8); g.lineTo(2, -8); g.closePath(); fill(g, '#ffffff'); ink(g, 3); g.restore();
    } else if (i === 3) {
      g.beginPath(); g.moveTo(300, top - 10);
      [[420, top - 150], [520, top - 70], [640, top - 175], [780, top - 60], [900, top - 140], [1040, top - 50], [1160, top - 120], [1280, top - 60], [1280, top]].forEach(function (p) { g.lineTo(p[0], p[1]); });
      g.lineTo(300, top); g.closePath(); fill(g, '#c6dcf2'); ink(g, 4, alpha(INK, 0.3));
      [[420, top - 150], [640, top - 175], [900, top - 140], [1160, top - 120]].forEach(function (p) {
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + 30, p[1] + 44); g.lineTo(p[0] + 8, p[1] + 34); g.lineTo(p[0] - 10, p[1] + 48); g.lineTo(p[0] - 30, p[1] + 44); g.closePath(); fill(g, '#ffffff');
      });
      for (k = 0; k < 8; k++) tree(g, 360 + k * 120 + r() * 50, top - 10, 0.7 + r() * 0.4, '#3d8f88', true);
    } else {
      hill(g, top - 40, 60, 4, 21, S.far, true);
      for (k = 0; k < 6; k++) { var mx = 420 + k * 150 + r() * 60; mushroom(g, mx, top - 14, 0.7 + r() * 0.5, k % 2 ? '#ff5df0' : '#3df5ff'); }
    }
    // The water: its depth layers from the light surface to the dark deep.
    g.fillStyle = vgrad(g, S.water, top, bed); g.fillRect(0, top, W, H - top);
    for (k = 1; k < 4; k++) { g.fillStyle = 'rgba(0,0,40,0.06)'; g.fillRect(0, top + (bed - top) * k / 4, W, (bed - top) / 4); }
    // Back plants (behind the fish).
    for (k = 0; k < 12; k++) weed(g, 340 + r() * 920, bed + 6, 80 + r() * 120, alpha(S.plant2, 0.55), 7, 18 + r() * 14);
    // The lake floor.
    g.beginPath(); g.moveTo(0, H);
    g.lineTo(0, top + 150);
    g.quadraticCurveTo(150, top + 260, 300, bed - 34);
    for (var x = 300; x <= W; x += 120) g.quadraticCurveTo(x + 60, bed - 14 - r() * 26, x + 120, bed - 20 + r() * 10);
    g.lineTo(W, H); g.closePath();
    fill(g, vgrad(g, [S.floor, S.floor2], bed - 40, H)); ink(g, 5);
    for (k = 0; k < 26; k++) { circle(g, 320 + r() * 950, bed + r() * 30, 2 + r() * 4); fill(g, alpha(INK, 0.15)); }
    for (k = 0; k < 7; k++) rock(g, 360 + r() * 880, bed + 6 + r() * 14, 18 + r() * 26, 12 + r() * 12, i === 4 ? '#5a4aa0' : i === 2 ? '#e6c47e' : '#a3acb8');
    if (i === 2) {
      coral(g, 470, bed + 4, '#ff7aa8'); coral(g, 1010, bed + 8, '#ff9f43'); coral(g, 1180, bed + 2, '#b48cff');
      A.sparkle(g, 700, bed + 10, 1, '#fff');
      for (k = 0; k < 3; k++) { g.save(); g.translate(640 + k * 210, bed + 16); g.rotate(r()); starPath(g, 0, 0, 12, 5); fill(g, '#ff8a5a'); ink(g, 3); g.restore(); }
    }
    if (i === 4) {
      [[480, '#3df5ff'], [880, '#ff5df0'], [1180, '#b48cff']].forEach(function (q) {
        for (var n = 0; n < 3; n++) {
          g.beginPath(); g.moveTo(q[0] - 14 + n * 14, bed + 10); g.lineTo(q[0] - 8 + n * 14, bed - 30 - n * 10); g.lineTo(q[0] - 2 + n * 14, bed + 10); g.closePath(); fill(g, alpha(q[1], 0.85)); ink(g, 3);
        }
      });
    }
    // The near shore and the dock (player 1 always fishes from the left).
    shore(g, i, top);
  }
  function mushroom(g, x, y, s, col) {
    rr(g, x - 5 * s, y - 26 * s, 10 * s, 28 * s, 4 * s); fill(g, '#efe6ff'); ink(g, 3 * s);
    g.beginPath(); g.arc(x, y - 24 * s, 22 * s, Math.PI, 0); g.closePath(); fill(g, col); ink(g, 3 * s);
    circle(g, x - 8 * s, y - 34 * s, 4 * s); fill(g, 'rgba(255,255,255,0.8)'); circle(g, x + 8 * s, y - 30 * s, 3 * s); fill(g, 'rgba(255,255,255,0.8)');
  }
  function coral(g, x, y, col) {
    for (var k = -1; k <= 1; k++) {
      g.beginPath(); g.moveTo(x + k * 6, y); g.quadraticCurveTo(x + k * 22, y - 30, x + k * 26, y - 56 + Math.abs(k) * 14);
      ink(g, 16); ink(g, 10, col);
      circle(g, x + k * 26, y - 56 + Math.abs(k) * 14, 6); fill(g, col);
    }
  }
  function shore(g, i, top) {
    var S = SCENE[i];
    // The bank under the dock.
    g.beginPath(); g.moveTo(0, top - 30);
    if (i === 2) { g.quadraticCurveTo(120, top - 34, 200, top - 6); g.quadraticCurveTo(250, top + 10, 230, top + 60); }
    else { g.quadraticCurveTo(90, top - 40, 140, top - 22); g.quadraticCurveTo(170, top, 160, top + 40); }
    g.quadraticCurveTo(120, top + 200, 0, top + 260); g.closePath();
    var land = i === 2 ? '#f6dc96' : i === 3 ? '#f4fbff' : i === 4 ? '#3c2f86' : '#7bd35c';
    fill(g, land); ink(g, 5);
    if (i === 3) { g.fillStyle = '#d6ecff'; ell(g, 60, top - 6, 70, 14); g.fill(); }
    if (i === 2) {
      // A palm tree on the beach.
      g.beginPath(); g.moveTo(40, top - 30); g.quadraticCurveTo(30, top - 110, 70, top - 180); ink(g, 20); ink(g, 13, '#b5793f');
      for (var p = 0; p < 5; p++) { var a = -2.6 + p * 0.55; g.beginPath(); g.moveTo(70, top - 180); g.quadraticCurveTo(70 + Math.cos(a) * 50, top - 200 + Math.sin(a) * 30, 70 + Math.cos(a) * 90, top - 170 + Math.sin(a + 0.4) * 40); ink(g, 16); ink(g, 9, '#3fbf5a'); }
      circle(g, 64, top - 172, 9); fill(g, '#8a5a2b'); ink(g, 3); circle(g, 80, top - 170, 9); fill(g, '#8a5a2b'); ink(g, 3);
    } else if (i === 0 || i === 1) {
      for (var q = 0; q < 6; q++) { g.beginPath(); g.moveTo(10 + q * 14, top - 26); g.quadraticCurveTo(4 + q * 15, top - 80, 14 + q * 13, top - 110 + q * 6); ink(g, 9); ink(g, 4, '#3f9a4f'); ell(g, 14 + q * 13, top - 110 + q * 6, 4, 12); fill(g, '#9a6234'); }
    } else if (i === 4) {
      mushroom(g, 40, top - 26, 1.3, '#3df5ff'); mushroom(g, 92, top - 30, 0.9, '#ff5df0');
    }
    // The dock: planks over the water on posts down to the floor.
    var dy = top - 30;
    if (i !== 3) {
      [150, 230, 300].forEach(function (x) { rr(g, x - 9, dy, 18, LL.PLACES[i].bed - dy, 6); fill(g, i === 4 ? '#5a4a9a' : '#8a5a2b'); ink(g, 4); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x - 5, dy, 4, LL.PLACES[i].bed - dy); });
      rr(g, 110, dy - 8, 214, 22, 6); fill(g, i === 4 ? '#7a68c0' : '#c98a4a'); ink(g, 5);
      g.strokeStyle = alpha(INK, 0.45); g.lineWidth = 3;
      for (var x = 150; x < 320; x += 40) { g.beginPath(); g.moveTo(x, dy - 6); g.lineTo(x, dy + 12); g.stroke(); }
      if (i === 4) {
        // A lantern on the dock in the magic night.
        var lg = g.createRadialGradient(300, dy - 50, 4, 300, dy - 50, 80); lg.addColorStop(0, 'rgba(255,230,120,0.6)'); lg.addColorStop(1, 'rgba(255,230,120,0)');
        g.fillStyle = lg; g.fillRect(220, dy - 130, 160, 160);
        g.beginPath(); g.moveTo(300, dy - 8); g.lineTo(300, dy - 40); ink(g, 5);
        rr(g, 288, dy - 66, 24, 28, 6); fill(g, '#ffe14d'); ink(g, 4);
      }
    } else {
      // On the ice: a little stool and a bucket.
      rr(g, 160, dy - 2, 70, 12, 5); fill(g, '#c98a4a'); ink(g, 4);
      g.beginPath(); g.moveTo(168, dy + 10); g.lineTo(162, dy + 30); g.moveTo(222, dy + 10); g.lineTo(228, dy + 30); ink(g, 5);
      rr(g, 248, dy + 2, 30, 28, 6); fill(g, '#5aa9ff'); ink(g, 4);
    }
  }
  // The ice slab of the frozen lake, with its holes (drawn over the water line).
  function iceSprite() {
    return sprite('ice', W, 70, function (g) {
      var holes = LL.PLACES[3].holes, y = 24;
      g.beginPath(); g.moveTo(130, y - 12); g.lineTo(W + 10, y - 14); g.lineTo(W + 10, y + 26); g.lineTo(130, y + 22); g.closePath();
      fill(g, vgrad(g, ['#ffffff', '#cfefff', '#9fd8f4'], y - 14, y + 26));
      g.globalCompositeOperation = 'destination-out';
      holes.forEach(function (x) { ell(g, x, y + 4, 52, 16); g.fill(); });
      g.globalCompositeOperation = 'source-over';
      g.beginPath(); g.moveTo(130, y - 12); g.lineTo(W + 10, y - 14); g.lineTo(W + 10, y + 26); g.lineTo(130, y + 22); g.closePath(); ink(g, 4);
      holes.forEach(function (x) { ell(g, x, y + 4, 52, 16); ink(g, 4); ell(g, x, y + 8, 50, 12); ink(g, 3, 'rgba(255,255,255,0.8)'); });
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
      [[200, 400], [620, 700], [900, 980], [1150, 1230]].forEach(function (s) { g.beginPath(); g.moveTo(s[0], y - 4); g.lineTo(s[1], y - 6); g.stroke(); });
    });
  }
  // Plants swaying in front of the fish; one sprite per kind.
  function frontWeed(col, col2, tall, seed) {
    return sprite('fw' + col + tall, 80, tall, function (g) {
      var r = seeded(seed);
      for (var k = 0; k < 3; k++) weed(g, 30 + k * 12, tall - 2, tall * (0.6 + r() * 0.35), k % 2 ? col2 : col, 8, 10 + r() * 8);
    });
  }
  var FRONT = [[450, 120], [690, 90], [940, 140], [1180, 110]];
  // Moving parts of the scene behind the fish: clouds, light rays, the river's streaks.
  A.sceneBack = function (g, i, ps, time, still) {
    var P = LL.PLACES[i], top = P.surface;
    g.drawImage(A.bg(i, ps), 0, 0, W, H);
    var cs = cloudSprite(P.night);
    for (var k = 0; k < 3; k++) {
      var cx = ((still ? 0 : time) * (8 + k * 4) + k * 460 + i * 130) % (W + 300) - 150;
      g.drawImage(cs, cx, 18 + k * 34 + (k === 1 ? 20 : 0), 140 * (1 - k * 0.15), 80 * (1 - k * 0.15));
    }
    // Light rays fall from the surface and slowly breathe.
    g.save();
    for (k = 0; k < 4; k++) {
      var a = still ? 0.07 : 0.05 + 0.04 * Math.sin(time * 0.7 + k * 1.9), x0 = 420 + k * 230;
      g.globalAlpha = P.night ? a * 0.6 : a;
      g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + 60, top); g.lineTo(x0 + 150, P.bed - 40); g.lineTo(x0 + 40, P.bed - 40); g.closePath();
      g.fillStyle = P.night ? '#b8a8ff' : '#ffffff'; g.fill();
    }
    g.restore();
    if (P.current && !still) {
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.lineCap = 'round';
      for (k = 0; k < 9; k++) {
        var sx = (time * (60 + k * 7) + k * 173) % (W + 200) - 100, sy = top + 60 + (k * 53) % (P.bed - top - 100);
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + 30, sy - 5, sx + 60, sy); g.stroke();
      }
    }
  };
  // The parts in front of the fish: swaying plants, the shining water line, the ice.
  A.sceneFront = function (g, i, time, still) {
    var P = LL.PLACES[i], S = SCENE[i], top = P.surface;
    FRONT.forEach(function (f, k) {
      var sp = frontWeed(S.plant, S.plant2, f[1], 40 + k), sway = still ? 0 : Math.sin(time * 1.3 + k * 1.7) * 0.12;
      g.save(); g.translate(f[0], P.bed + 8); g.transform(1, 0, sway, 1, 0, 0);
      g.drawImage(sp, -40, -f[1], 80, f[1]); g.restore();
    });
    // The water line: a bright band of small waves.
    g.beginPath(); g.moveTo(0, top - 2);
    var amp = i === 2 ? 5 : 2.6, sp2 = still ? 0 : time * (i === 2 ? 2.2 : 1.4);
    for (var x = 0; x <= W; x += 32) g.lineTo(x, top + Math.sin(x * 0.03 + sp2) * amp - 1);
    g.lineTo(W, top + 8); g.lineTo(0, top + 8); g.closePath();
    g.fillStyle = P.night ? 'rgba(160,150,255,0.45)' : 'rgba(255,255,255,0.55)'; g.fill();
    g.beginPath();
    for (x = 0; x <= W; x += 32) g[x ? 'lineTo' : 'moveTo'](x, top + Math.sin(x * 0.03 + sp2) * amp - 1);
    ink(g, 3, P.night ? 'rgba(200,190,255,0.9)' : 'rgba(255,255,255,0.95)');
    if (i === 0) {
      // Lily pads float on the pond.
      [[520, 0], [880, 1], [1210, 2]].forEach(function (l) {
        var lx = l[0] + (still ? 0 : Math.sin(time * 0.8 + l[1]) * 4);
        ell(g, lx, top + 2, 34, 9); fill(g, '#45c35a'); ink(g, 3);
        g.beginPath(); g.moveTo(lx, top + 2); g.lineTo(lx + 30, top - 2); g.lineTo(lx + 26, top + 6); g.closePath(); fill(g, SCENE[0].water[0]);
        if (l[1] === 1) { circle(g, lx - 10, top - 4, 7); fill(g, '#ff8fd0'); ink(g, 2.5); circle(g, lx - 10, top - 5, 2.5); fill(g, '#ffe066'); }
      });
    }
    if (P.holes) g.drawImage(iceSprite(), 0, top - 24, W, 70);
  };

  /* --------------------------------------------------------------- fisher */
  // The fisher: a round kid in a bucket hat. P1 on the dock faces right; P2 in the boat
  // faces left. o: { side, hat, shirt, pants, time, still, mood ('', 'bite', 'happy', 'sad'),
  // lean (-1..1), bend (0..1), reelT, look: {x, y}, sit }
  A.fisher = function (g, x, y, o) {
    var d = o.side, t = o.time, still = o.still, mood = o.mood || '';
    var breathe = still ? 0 : Math.sin(t * 2.2) * 1.5, hop = o.hop || 0, lean = (o.lean || 0) * 0.2;
    g.save(); g.translate(x, y - hop);
    // Legs and shoes (hidden in the boat).
    if (!o.sit) {
      rr(g, -16, -30, 13, 30, 6); fill(g, o.pants); ink(g, 4);
      rr(g, 3, -30, 13, 30, 6); fill(g, o.pants); ink(g, 4);
      ell(g, -9 + d * 3, -1, 11, 6); fill(g, '#4a3a5a'); ink(g, 3.5);
      ell(g, 9 + d * 3, -1, 11, 6); fill(g, '#4a3a5a'); ink(g, 3.5);
    }
    g.rotate(lean * d);
    // Body.
    rr(g, -24, -82 + breathe, 48, 56, 18); fill(g, o.shirt); ink(g, 4.5);
    rr(g, -24, -50 + breathe, 48, 24, 10); fill(g, o.pants); ink(g, 4);
    g.beginPath(); g.moveTo(-12, -50 + breathe); g.lineTo(-12, -78 + breathe); g.moveTo(12, -50 + breathe); g.lineTo(12, -78 + breathe); ink(g, 5, o.pants);
    // Head.
    var hy = -112 + breathe * 1.3;
    circle(g, d * 2, hy, 30); fill(g, '#ffd2a8'); ink(g, 4.5);
    var lx = o.look ? Math.max(-1, Math.min(1, (o.look.x - x) / 300)) : d, ly = o.look ? Math.max(-1, Math.min(1, (o.look.y - (y + hy)) / 300)) : 0.2;
    var eo = mood === 'bite' ? 1.35 : 1;
    [-1, 1].forEach(function (k) {
      var ex = d * 2 + k * 11 + d * 6, ey = hy - 2;
      if (mood === 'happy') { g.beginPath(); g.arc(ex, ey + 2, 6, Math.PI * 1.1, Math.PI * 1.9); ink(g, 3.5); return; }
      ell(g, ex, ey, 6.5 * eo, 8 * eo); fill(g, '#fff'); ink(g, 3);
      circle(g, ex + lx * 2.5, ey + ly * 2.5, 3.8 * eo); fill(g, INK);
      circle(g, ex + lx * 2.5 - 1.2, ey + ly * 2.5 - 1.6, 1.4); fill(g, '#fff');
    });
    cheek(g, d * 2 - 17 + d * 6, hy + 10, 6); cheek(g, d * 2 + 17 + d * 6, hy + 10, 6);
    var mx = d * 8, my = hy + 14;
    if (mood === 'bite') { ell(g, mx, my, 5, 6); fill(g, '#7a1f3d'); ink(g, 3); }
    else if (mood === 'happy') { g.beginPath(); g.moveTo(mx - 9, my - 2); g.quadraticCurveTo(mx, my + 12, mx + 9, my - 2); g.closePath(); fill(g, '#7a1f3d'); ink(g, 3); }
    else if (mood === 'sad') { g.beginPath(); g.arc(mx, my + 6, 6, Math.PI * 1.15, Math.PI * 1.85); ink(g, 3.2); }
    else { g.beginPath(); g.arc(mx, my - 2, 7, 0.3, Math.PI - 0.3); ink(g, 3.2); }
    // Freckles.
    g.fillStyle = 'rgba(190,110,60,0.6)';
    [[-5, 6], [-1, 8], [3, 6]].forEach(function (f) { circle(g, d * 2 - 16 + d * 6 + f[0], hy + f[1], 1.3); g.fill(); circle(g, d * 2 + 16 + d * 6 + f[0], hy + f[1], 1.3); g.fill(); });
    // The bucket hat with its little lure pin.
    ell(g, d * 2, hy - 20, 42, 11); fill(g, shade(o.hat, -0.12)); ink(g, 4);
    g.beginPath(); g.moveTo(d * 2 - 27, hy - 20); g.quadraticCurveTo(d * 2 - 26, hy - 50, d * 2, hy - 50); g.quadraticCurveTo(d * 2 + 26, hy - 50, d * 2 + 27, hy - 20); g.closePath();
    fill(g, o.hat); ink(g, 4);
    g.beginPath(); g.moveTo(d * 2 - 27, hy - 26); g.quadraticCurveTo(d * 2, hy - 20, d * 2 + 27, hy - 26); g.lineTo(d * 2 + 27, hy - 20); g.quadraticCurveTo(d * 2, hy - 14, d * 2 - 27, hy - 20); g.closePath(); fill(g, o.band); ink(g, 3);
    ell(g, d * 2 - 8, hy - 42, 10, 4, -0.2); fill(g, 'rgba(255,255,255,0.5)');
    circle(g, d * 2 - d * 16, hy - 30, 5); fill(g, '#ff5d6c'); ink(g, 2.5);
    g.restore();
  };
  // The rod from the hands to its tip, bent by a pull. Returns the tip.
  A.rod = function (g, hx, hy, tx, ty, bend, color) {
    var mx = (hx + tx) / 2, my = (hy + ty) / 2, dx = tx - hx, dy = ty - hy;
    var cx = mx - dy * 0.12 * bend + dx * 0.0, cy = my + Math.abs(dx) * 0.25 * bend;
    g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo(cx, cy, tx, ty); ink(g, 9); ink(g, 4.5, color || '#c98a4a');
    rr(g, hx - 6, hy - 6, 12, 12, 4); fill(g, '#4a3a5a'); ink(g, 3);
    circle(g, tx, ty, 3.5); fill(g, '#ffd23f'); ink(g, 2);
  };
  A.hand = function (g, x, y) { circle(g, x, y, 8); fill(g, '#ffd2a8'); ink(g, 3.5); };
  // A rowboat for player 2.
  A.boat = function (g, x, y, time, still) {
    var b = still ? 0 : Math.sin(time * 1.6) * 3;
    g.save(); g.translate(x, y + b); g.rotate(still ? 0 : Math.sin(time * 1.1) * 0.02);
    g.beginPath(); g.moveTo(-110, -26); g.lineTo(110, -26); g.quadraticCurveTo(100, 20, 60, 24); g.lineTo(-70, 24); g.quadraticCurveTo(-104, 20, -110, -26); g.closePath();
    fill(g, '#ff7a5a'); ink(g, 5);
    g.fillStyle = '#ffffff'; g.fillRect(-104, -16, 210, 7);
    g.beginPath(); g.moveTo(-110, -26); g.lineTo(110, -26); ink(g, 7, '#b8573f'); g.beginPath(); g.moveTo(-110, -26); g.lineTo(110, -26); ink(g, 3);
    g.restore();
    return b;
  };

  /* --------------------------------------------------------- line, bobber */
  A.bobber = function (g, x, y, k) {
    k = k || 1;
    g.beginPath(); g.moveTo(x, y - 12 * k); g.lineTo(x, y - 22 * k); ink(g, 3);
    circle(g, x, y, 10 * k); fill(g, '#ffffff'); ink(g, 3.5);
    g.save(); circle(g, x, y, 10 * k); g.clip(); g.fillStyle = '#ff4d4d'; g.fillRect(x - 12 * k, y - 12 * k, 24 * k, 12 * k); g.restore();
    circle(g, x, y, 10 * k); ink(g, 3.5);
    circle(g, x - 3 * k, y - 4 * k, 2.5 * k); fill(g, 'rgba(255,255,255,0.9)');
  };
  // The hook with a wiggly worm.
  A.hookArt = function (g, x, y, time, still) {
    g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x, y + 4); g.arc(x - 6, y + 4, 6, 0, Math.PI * 0.95); ink(g, 4.5); ink(g, 2.2, '#dfe6f2');
    var w = still ? 0 : Math.sin(time * 6) * 4;
    g.beginPath(); g.moveTo(x - 2, y - 2); g.bezierCurveTo(x + 8 + w, y + 2, x - 8 - w, y + 10, x + 4 + w, y + 16);
    ink(g, 8); ink(g, 5, '#ff8fb0');
  };
  A.line = function (g, x1, y1, x2, y2, sag, taut) {
    g.beginPath(); g.moveTo(x1, y1);
    if (taut) g.lineTo(x2, y2);
    else g.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2);
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineCap = 'round'; g.stroke();
    g.lineWidth = 1; g.strokeStyle = alpha(INK, 0.5); g.stroke();
  };

  /* -------------------------------------------------------------- aiming */
  // The dotted arc from the rod tip to the water and the hook's way down to the target.
  A.aim = function (g, from, to, surface, time, color, label, still, faint) {
    var dx = to.x - from.x, arc = LL.arcHeight(dx), n = 14, k;
    g.save();
    g.globalAlpha = faint ? 0.45 : 1;
    var shift = still ? 0 : (time * 1.6) % 1;
    for (k = 0; k < n; k++) {
      var p = LL.arcPoint(from, { x: to.x }, surface, arc, Math.min(1, (k + shift) / n));
      circle(g, p.x, p.y, 5.5); fill(g, '#ffffff'); ink(g, 3, color);
    }
    for (var y = surface + 14; y < to.y - 20; y += 18) { circle(g, to.x, y, 3); fill(g, alpha('#ffffff', 0.85)); }
    var pr = still ? 0 : Math.sin(time * 5) * 3;
    circle(g, to.x, to.y, 24 + pr); ink(g, 8, alpha(INK, 0.35)); ink(g, 5, color);
    circle(g, to.x, to.y, 7); fill(g, color); ink(g, 2.5);
    g.beginPath(); g.moveTo(to.x - 34 - pr, to.y); g.lineTo(to.x - 16, to.y); g.moveTo(to.x + 16, to.y); g.lineTo(to.x + 34 + pr, to.y);
    g.moveTo(to.x, to.y - 34 - pr); g.lineTo(to.x, to.y - 16); g.moveTo(to.x, to.y + 16); g.lineTo(to.x, to.y + 34 + pr); ink(g, 4.5, color);
    if (label) badge(g, to.x + 30, to.y - 30, label, color, 15);
    g.restore();
  };
  function badge(g, x, y, s, color, r) {
    circle(g, x, y, r); fill(g, color); ink(g, 3.5);
    A.text(g, s, x, y + 1, r * 1.35, '#ffffff', { lw: 4 });
  }
  A.badge = badge;

  /* ------------------------------------------------------------- reel bar */
  // A tall bar beside the water: the catch zone (green) and the fish; beside it the
  // catch meter. bar: { x (centre), y (top), h, w }. o: { color, label, time, still, hint }
  A.reelBar = function (g, bar, r, s, junk, o) {
    var x = bar.x, y = bar.y, h = bar.h, w = bar.w, t = o.time, still = o.still;
    g.save();
    // Frame and water.
    rr(g, x - w / 2 - 8, y - 8, w + 16, h + 16, 22); fill(g, o.color); ink(g, 5);
    rr(g, x - w / 2, y, w, h, 16); fill(g, vgrad(g, ['#7fe3ff', '#2a8fd0', '#163f80'], y, y + h)); ink(g, 4);
    // The catch zone.
    var zy = y + h * (1 - r.z - r.h), zh = h * r.h;
    rr(g, x - w / 2 + 4, zy, w - 8, zh, 12);
    fill(g, r.inZone ? 'rgba(120,255,160,0.95)' : 'rgba(91,227,143,0.75)'); ink(g, 4, r.inZone ? '#ffffff' : INK);
    g.fillStyle = 'rgba(255,255,255,0.35)'; rr(g, x - w / 2 + 10, zy + 6, w - 20, Math.min(10, zh / 4), 5); g.fill();
    if (r.hold && !still) {
      g.globalAlpha = 0.7; g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(x, zy - 18); g.lineTo(x + 12, zy - 6); g.lineTo(x - 12, zy - 6); g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    // The fish (or the junk) in the bar.
    var fy = y + h * (1 - r.f), wob = still ? 0 : Math.sin(t * 16) * 3;
    if (r.inZone && !still) { g.globalAlpha = 0.6; g.drawImage(glowSprite('#ffffff'), x - 46, fy - 46, 92, 92); g.globalAlpha = 1; }
    if (junk) A.junkIcon(g, junk, x + wob, fy + 6, 0.5);
    else { var k = Math.min(0.9, (w + 10) / (s.len * 1.25)); A.species(g, s, x + wob, fy, Math.sin(t * 3) > 0 ? 1 : -1, k, { time: t, still: still, fast: 1 }); }
    // The catch meter beside the bar.
    var mx = x + o.meterSide * (w / 2 + 30), mw = 22;
    rr(g, mx - mw / 2 - 5, y - 5, mw + 10, h + 10, 14); fill(g, '#ffffff'); ink(g, 4.5);
    var mh = (h - 4) * r.meter;
    rr(g, mx - mw / 2, y + 2 + h - 4 - mh, mw, Math.max(6, mh), 9);
    fill(g, r.meter > 0.66 ? '#5be38f' : r.meter > 0.33 ? '#ffd23f' : '#ff7a5a');
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(mx - mw / 2 + 3, y + 4 + h - 4 - mh, 5, Math.max(0, mh - 8));
    // A star at the top: full means caught.
    starPath(g, mx, y - 22, 16, 7); fill(g, r.meter > 0.98 ? '#ffd23f' : '#ffffff'); ink(g, 3.5);
    if (o.label) badge(g, x, y + h + 34, o.label, o.color, 20);
    g.restore();
  };

  /* ------------------------------------------------------------- icons */
  // «؟» and «!» bubbles over a fish or the bobber.
  A.mark = function (g, x, y, ch, k, color) {
    k = k || 1;
    g.save(); g.translate(x, y); g.scale(k, k);
    if (ch === '!') {
      starPath(g, 0, 0, 40, 26, 0.1); fill(g, color || '#ffd23f'); ink(g, 5);
      A.text(g, '!', 0, 3, 50, '#ff4d4d', { lw: 8 });
    } else {
      rr(g, -20, -22, 40, 40, 14); fill(g, '#ffffff'); ink(g, 4);
      g.beginPath(); g.moveTo(-6, 16); g.lineTo(0, 28); g.lineTo(6, 16); fill(g, '#ffffff'); ink(g, 4);
      g.fillStyle = '#fff'; g.fillRect(-7, 12, 14, 6);
      A.text(g, ch, 0, -1, 30, '#4f7bff', { lw: 0, stroke: false });
    }
    g.restore();
  };
  A.coin = function (g, x, y, r) {
    circle(g, x, y, r); fill(g, '#ffd23f'); ink(g, Math.max(2, r * 0.22));
    circle(g, x, y, r * 0.62); ink(g, Math.max(1.5, r * 0.14), '#e0a400');
    g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, x - r * 0.35, y - r * 0.35, r * 0.22, r * 0.14, -0.6); g.fill();
  };
  // The mouse and a key, for the wordless hints.
  A.mouseIcon = function (g, x, y, k, down, color) {
    g.save(); g.translate(x, y); g.scale(k, k);
    rr(g, -18, -26, 36, 52, 18); fill(g, '#ffffff'); ink(g, 4);
    g.beginPath(); g.moveTo(-17, -6); g.lineTo(17, -6); g.moveTo(0, -25); g.lineTo(0, -6); ink(g, 3);
    if (down) { g.beginPath(); g.moveTo(-16, -6); g.lineTo(-16, -14); g.quadraticCurveTo(-15, -24, 0, -25); g.lineTo(0, -6); g.closePath(); fill(g, color || '#ffd23f'); ink(g, 3); }
    g.restore();
  };
  A.keycap = function (g, x, y, label, wide, down, color) {
    var w = wide || 46, h = 44, off = down ? 4 : 0;
    rr(g, x - w / 2, y - h / 2 + 4, w, h, 10); fill(g, '#9aa3c7');
    rr(g, x - w / 2, y - h / 2 + off, w, h - 4, 10); fill(g, down ? (color || '#ffd23f') : '#ffffff'); ink(g, 3.5);
    A.text(g, label, x, y - 2 + off, label.length > 2 ? 20 : 24, INK, { stroke: false });
  };
  A.arrow = function (g, x, y, dir, k, color) {
    g.save(); g.translate(x, y); g.scale(k, dir * k);
    g.beginPath(); g.moveTo(0, -24); g.lineTo(20, 0); g.lineTo(8, 0); g.lineTo(8, 22); g.lineTo(-8, 22); g.lineTo(-8, 0); g.lineTo(-20, 0); g.closePath();
    fill(g, color || '#ffffff'); ink(g, 4);
    g.restore();
  };

  /* -------------------------------------------------------- HUD (canvas) */
  // The three goals of a place, as pictures: n fish, one species, one heavy fish.
  A.goals = function (g, pi, save, time, bump, still) {
    var P = LL.PLACES[pi], G = P.goals, st = save.places[pi], x0 = 640 - 300, s = LL.byId[G.sp];
    for (var k = 0; k < 3; k++) {
      var cx = x0 + (2 - k) * 210 + 90, cy = 44, done = st.g[k], b = bump[k] || 0, sc = 1 + b * 0.25;
      g.save(); g.translate(cx, cy); g.scale(sc, sc);
      rr(g, -92, -30, 184, 60, 30); fill(g, done ? 'rgba(255,246,190,0.95)' : 'rgba(255,255,255,0.9)'); ink(g, 4.5);
      if (k === 0) {
        A.species(g, LL.SPECIES[P.species[0]], 34, 0, -1, 0.85, { still: true });
        A.text(g, Math.min(st.n, G.n) + '/' + G.n, -24, 2, 28, INK, { stroke: false });
      } else if (k === 1) {
        var sc2 = Math.min(1, 92 / (s.len * 1.3));
        A.species(g, s, 10, 0, -1, sc2, { still: true, sil: !save.book[s.id] });
      } else {
        weightIcon(g, 40, 2, 0.9);
        A.text(g, LL.weightText(G.w).replace('.0', '') + ' كغ', -22, 2, 26, INK, { stroke: false });
      }
      starPath(g, -78, -22, 17, 8); fill(g, done ? '#ffd23f' : '#d6dbee'); ink(g, 3.5);
      g.restore();
    }
  };
  function weightIcon(g, x, y, k) {
    g.save(); g.translate(x, y); g.scale(k, k);
    g.beginPath(); g.arc(0, -16, 8, Math.PI, 0); ink(g, 5);
    g.beginPath(); g.moveTo(-16, -12); g.lineTo(16, -12); g.lineTo(22, 18); g.lineTo(-22, 18); g.closePath(); fill(g, '#5d6d86'); ink(g, 4);
    A.text(g, 'kg', 0, 4, 15, '#ffffff', { stroke: false });
    g.restore();
  }
  A.weightIcon = weightIcon;
  A.coinChip = function (g, x, y, n, bump) {
    var s = 1 + (bump || 0) * 0.2, txt = String(n), w = 70 + txt.length * 16;
    g.save(); g.translate(x, y); g.scale(s, s);
    rr(g, -w, -26, w, 52, 26); fill(g, 'rgba(28,34,80,0.82)'); ink(g, 4, '#ffffff');
    A.coin(g, -w + 28, 0, 16);
    A.text(g, txt, -w + 52, 2, 28, '#ffffff', { align: 'left', stroke: false });
    g.restore();
  };

  /* -------------------------------------------------------------- thumbs */
  // A little picture of a place for its card on the map.
  A.placeThumb = function (c, i) {
    var g = c.getContext('2d'), w = c.width, h = c.height, s = Math.max(w / 800, h / 450);
    g.clearRect(0, 0, w, h);
    g.save(); g.scale(s, s); g.translate(-300, -110);
    g.drawImage(A.bg(i, 1), 0, 0);
    A.sceneFront(g, i, 0, true);
    var list = LL.PLACES[i].species;
    [[0, 560, 0.62], [1, 860, 0.5], [2, 700, 0.75]].forEach(function (q) {
      var sp = LL.SPECIES[list[q[0]]];
      A.species(g, sp, q[1], LL.PLACES[i].surface + (LL.PLACES[i].bed - LL.PLACES[i].surface) * q[2], q[0] % 2 ? -1 : 1, 1.1, { still: true });
    });
    g.restore();
  };
  // A species or a junk picture in a DOM canvas (catch card, book).
  A.catchArt = function (c, kind, sp, time, still) {
    var g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.save();
    if (kind === 'junk') { var k = Math.min(w / 120, h / 100); A.junkIcon(g, sp, w / 2, h / 2 + 6 * k, k); }
    else {
      var s = LL.SPECIES[sp], k2 = Math.min(w / (s.len * 1.45), h / (s.len * (A.isSpecial(s) ? 1.05 : 0.95)));
      if (s.glow || s.rarity === 3) { g.globalAlpha = 0.7; g.drawImage(glowSprite(s.glow || '#ffe14d'), w / 2 - w * 0.45, h / 2 - h * 0.6, w * 0.9, h * 1.2); g.globalAlpha = 1; }
      A.species(g, s, w / 2 + (A.isSpecial(s) ? 0 : s.len * k2 * 0.06), h / 2, -1, k2, { time: time, still: still, wag: 0.6 });
    }
    g.restore();
  };
  // Upgrade pictures for the rod tiles.
  A.rodIcon = function (c, kind) {
    var g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.save(); g.scale(w / 120, h / 120);
    if (kind === 'zone') {
      rr(g, 38, 10, 44, 100, 16); fill(g, vgrad(g, ['#7fe3ff', '#2a8fd0'], 10, 110)); ink(g, 4);
      rr(g, 42, 40, 36, 56, 12); fill(g, '#5be38f'); ink(g, 4);
      A.arrow(g, 60, 26, 1, 0.5, '#ffffff'); A.arrow(g, 60, 108, -1, 0.5, '#ffffff');
    } else if (kind === 'reel') {
      circle(g, 60, 62, 40); fill(g, '#c9d6e8'); ink(g, 5);
      circle(g, 60, 62, 26); fill(g, '#ff9a1f'); ink(g, 4);
      for (var k = 0; k < 6; k++) { var a = k * TAU / 6; g.beginPath(); g.moveTo(60 + Math.cos(a) * 8, 62 + Math.sin(a) * 8); g.lineTo(60 + Math.cos(a) * 24, 62 + Math.sin(a) * 24); ink(g, 3); }
      circle(g, 60, 62, 8); fill(g, '#ffffff'); ink(g, 3);
      g.beginPath(); g.moveTo(60, 62); g.lineTo(98, 30); ink(g, 9); ink(g, 4, '#4a3a5a'); circle(g, 100, 28, 9); fill(g, '#ffd23f'); ink(g, 3);
    } else if (kind === 'lure') {
      g.globalAlpha = 0.8; g.drawImage(glowSprite('#ffe14d'), 0, 0, 120, 120); g.globalAlpha = 1;
      g.beginPath(); g.moveTo(60, 4); g.lineTo(60, 26); ink(g, 3);
      ell(g, 60, 58, 22, 32); fill(g, '#ff5d9e'); ink(g, 4);
      g.save(); ell(g, 60, 58, 22, 32); g.clip(); g.fillStyle = '#ffd23f'; g.fillRect(30, 58, 60, 40); g.restore(); ell(g, 60, 58, 22, 32); ink(g, 4);
      eye(g, 60, 44, 7, 1);
      g.beginPath(); g.moveTo(60, 90); g.lineTo(60, 104); g.arc(52, 104, 8, 0, Math.PI); ink(g, 4);
      A.sparkle(g, 92, 30, 10, '#ffffff'); A.sparkle(g, 26, 84, 8, '#ffffff');
    } else {
      // Tasty bait: a happy worm in a tin.
      rr(g, 22, 64, 76, 44, 10); fill(g, '#9aa3c7'); ink(g, 4);
      ell(g, 60, 66, 38, 10); fill(g, '#7a5a3a'); ink(g, 4);
      g.beginPath(); g.moveTo(44, 66); g.bezierCurveTo(30, 20, 80, 50, 70, 20); ink(g, 16); ink(g, 10, '#ff8fb0');
      eye(g, 70, 20, 6, 1); eye(g, 80, 24, 6, 1);
      A.text(g, '♥', 98, 22, 26, '#ff5d6c', { lw: 4 });
    }
    g.restore();
  };

  /* ---------------------------------------------------------------- book */
  // The fish book: one row per place, silhouettes for the species not caught yet.
  A.book = function (g, save, time, still) {
    g.fillStyle = 'rgba(16,20,50,0.55)'; g.fillRect(0, 0, W, H);
    rr(g, 40, 96, 1200, 610, 34); fill(g, '#fff8e8'); ink(g, 6);
    for (var i = 0; i < 6; i++) {
      var y = 150 + i * 92, list = i < 5 ? LL.PLACES[i].species : LL.JUNK_IDS;
      rr(g, 1100, y - 40, 120, 80, 18); fill(g, i < 5 ? SCENE[i].water[1] : '#b9763a'); ink(g, 4);
      if (i < 5) A.text(g, String(i + 1), 1160, y + 2, 40, '#ffffff', { lw: 7 });
      else A.junkIcon(g, 'chest', 1160, y + 4, 0.55);
      for (var k = 0; k < list.length; k++) {
        var x = 1012 - k * 140;
        rr(g, x - 64, y - 42, 128, 84, 16); fill(g, i < 5 ? '#ffffff' : '#fff1d6'); ink(g, 3.5, alpha(INK, 0.45));
        if (i < 5) {
          var s = LL.SPECIES[list[k]], best = save.book[s.id] || 0, sc = Math.min(1, 100 / (s.len * 1.3), 60 / (s.len * (A.isSpecial(s) ? 0.9 : 0.6)));
          A.species(g, s, x + 4, y - 8, -1, sc, { still: true, sil: !best });
          if (best) A.text(g, LL.weightText(best) + ' كغ', x, y + 28, 19, INK, { stroke: false });
          else A.text(g, '؟', x, y + 28, 22, '#9aa3c7', { stroke: false });
          if (s.rarity > 1) for (var r = 0; r < s.rarity; r++) { starPath(g, x + 52 - r * 14, y - 30, 7, 3); fill(g, best ? '#ffd23f' : '#d6dbee'); ink(g, 2); }
        } else {
          var id = list[k], n = save.junk[id] || 0;
          g.globalAlpha = n ? 1 : 0.25; A.junkIcon(g, id, x, y - 4, 0.62); g.globalAlpha = 1;
          A.text(g, n ? '×' + n : '؟', x, y + 28, 20, n ? INK : '#9aa3c7', { stroke: false });
        }
      }
    }
  };
})();
