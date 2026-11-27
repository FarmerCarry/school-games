/* Frog Pinball (بينبول الضفدع): everything drawn in code on one 2D canvas (1280x720 logical).
 * The table sits in the middle (table x 0..560 at screen x 360..920); the side panels hold
 * the HUD. Everything that never moves (the pond, the walls, the slingshot bodies, the
 * panels) is painted once into an offscreen layer at the screen's pixel scale; each frame
 * draws that layer and then only the moving and lit parts. No shadows, no filters and no
 * canvas reads, so it stays smooth on the lab PCs.
 */
(function () {
  'use strict';
  var FP = window.FP, M = Math, T = FP.TABLE;
  var W = 1280, H = 720, X0 = 360, TW = FP.TW, TH = FP.TH, R = FP.R;
  var INK = '#123536', TAU = M.PI * 2;
  FP.X0 = X0; FP.INK = INK;

  // Table colours. day pond, night pond (fireflies), candy pond.
  var THEMES = [
    { water: ['#7debd9', '#36b6c4'], panel: ['#2b8f62', '#124a38'], rail: '#fff3d1', wood: '#b0702f', woodDark: '#6d3f17',
      pad: '#63d062', padDark: '#2f9a45', reed: '#2f8a43', apron: '#7d4c22', apronTop: '#a8693a', sling: '#ff5fa2', glow: '#fff36b', ripple: 'rgba(255,255,255,0.35)', flip: '#ff7a2e' },
    { water: ['#3656a8', '#15256a'], panel: ['#232b66', '#0b0f2c'], rail: '#e4ecff', wood: '#4a3a86', woodDark: '#241a4e',
      pad: '#43b67e', padDark: '#1f6f50', reed: '#1f5a4c', apron: '#2c2258', apronTop: '#45388a', sling: '#c77dff', glow: '#ffe96b', ripple: 'rgba(190,210,255,0.22)', flip: '#ffb02e', flies: true },
    { water: ['#ffc2e3', '#f27cbd'], panel: ['#9a47c0', '#4b1a70'], rail: '#ffffff', wood: '#ff6fa8', woodDark: '#b8326f',
      pad: '#7fe3a4', padDark: '#36a86b', reed: '#ff9ad0', apron: '#b04f8a', apronTop: '#e07ab5', sling: '#4fc3ff', glow: '#fff36b', ripple: 'rgba(255,255,255,0.4)', flip: '#8f5cff', candy: true }
  ];
  FP.THEME_ART = THEMES;

  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  FP.rrect = rrect;
  function inked(c, fill, lw) { c.fillStyle = fill; c.fill(); c.lineWidth = lw || 3; c.strokeStyle = INK; c.stroke(); }
  function poly(c, pts, close) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (close) c.closePath(); }
  // A googly eye: white ball, a pupil that looks along (lx, ly) (unit-ish).
  function googly(c, x, y, r, lx, ly, lw) {
    circle(c, x, y, r); c.fillStyle = '#fff'; c.fill(); c.lineWidth = lw || M.max(1.5, r * 0.16); c.strokeStyle = INK; c.stroke();
    circle(c, x + lx * r * 0.42, y + ly * r * 0.42, r * 0.5); c.fillStyle = INK; c.fill();
    circle(c, x + lx * r * 0.42 - r * 0.16, y + ly * r * 0.42 - r * 0.18, r * 0.14); c.fillStyle = '#fff'; c.fill();
  }
  FP.googly = googly;
  function look(fx, fy, tx, ty) { var dx = tx - fx, dy = ty - fy, d = M.sqrt(dx * dx + dy * dy) || 1; return [dx / d, dy / d]; }
  // An offscreen layer w x h logical pixels at k device pixels per logical pixel.
  function layer(w, h, k, draw) {
    var cv = document.createElement('canvas');
    cv.width = M.max(1, M.ceil(w * k)); cv.height = M.max(1, M.ceil(h * k));
    var c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    c.lineJoin = 'round'; c.lineCap = 'round';
    draw(c);
    return cv;
  }

  /* --------------------------------------------------------------- balls */
  // ctx at the ball centre; r the radius; spin the rolling angle; t the clock.
  FP.drawBall = function (c, id, x, y, r, spin, t) {
    c.save(); c.translate(x, y);
    var lw = M.max(1.5, r * 0.16);
    if (id === 'planet') {
      // the ring behind
      c.save(); c.rotate(-0.35); ell(c, 0, 0, r * 1.75, r * 0.55); c.lineWidth = r * 0.28; c.strokeStyle = '#ffd36b'; c.stroke(); c.restore();
    }
    c.save(); c.rotate(spin || 0);
    circle(c, 0, 0, r);
    switch (id) {
      case 'pearl': c.fillStyle = '#fff4fb'; c.fill(); circle(c, r * 0.25, r * 0.3, r * 0.55); c.fillStyle = 'rgba(255,190,230,0.6)'; c.fill(); circle(c, -r * 0.3, r * 0.1, r * 0.35); c.fillStyle = 'rgba(180,230,255,0.6)'; c.fill(); break;
      case 'eye':
        c.fillStyle = '#ffffff'; c.fill();
        c.strokeStyle = 'rgba(255,80,80,0.6)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.9, -r * 0.2); c.lineTo(-r * 0.5, -r * 0.1); c.moveTo(-r * 0.8, r * 0.4); c.lineTo(-r * 0.45, r * 0.25); c.stroke();
        circle(c, r * 0.3, 0, r * 0.5); c.fillStyle = '#3fa9ff'; c.fill(); circle(c, r * 0.38, 0, r * 0.26); c.fillStyle = INK; c.fill(); break;
      case 'bug':
        c.fillStyle = '#ff3d4a'; c.fill();
        c.save(); c.clip();
        circle(c, r * 0.85, 0, r * 0.55); c.fillStyle = INK; c.fill();
        c.beginPath(); c.moveTo(-r, 0); c.lineTo(r * 0.5, 0); c.lineWidth = r * 0.12; c.strokeStyle = INK; c.stroke();
        c.fillStyle = INK; [[-0.4, -0.45], [-0.4, 0.45], [0.05, -0.55], [0.05, 0.55], [-0.75, 0]].forEach(function (p) { circle(c, p[0] * r, p[1] * r, r * 0.17); c.fill(); });
        c.restore();
        circle(c, r * 0.95, -r * 0.2, r * 0.13); c.fillStyle = '#fff'; c.fill(); circle(c, r * 0.95, r * 0.2, r * 0.13); c.fill();
        circle(c, 0, 0, r); break;
      case 'planet':
        c.fillStyle = '#4fa8ff'; c.fill();
        c.save(); c.clip();
        c.fillStyle = '#5fd068'; ell(c, -r * 0.3, -r * 0.3, r * 0.5, r * 0.32, 0.5); c.fill(); ell(c, r * 0.45, r * 0.4, r * 0.4, r * 0.25, -0.3); c.fill();
        c.restore(); circle(c, 0, 0, r); break;
      case 'donut':
        c.fillStyle = '#d99a52'; c.fill();
        circle(c, 0, 0, r * 0.82); c.fillStyle = '#ff7ac0'; c.fill();
        var cols = ['#fff36b', '#4fd8ff', '#ffffff', '#7dffb0'];
        for (var s = 0; s < 8; s++) { var a = s * 0.79 + 0.3, rr = r * (0.55 + (s % 2) * 0.12); c.save(); c.rotate(a); c.fillStyle = cols[s % 4]; c.fillRect(rr - 1.5, -1, 3.5, 2); c.restore(); }
        circle(c, 0, 0, r * 0.28); c.fillStyle = '#7a4a1a'; c.fill();
        circle(c, 0, 0, r); break;
      case 'fly':
        c.restore(); c.save();
        var flap = M.sin((t || 0) * 40) * 0.35;
        c.fillStyle = 'rgba(220,245,255,0.85)'; c.strokeStyle = INK; c.lineWidth = 1.2;
        ell(c, -r * 0.55, -r * 0.75, r * 0.6, r * 0.35, -0.7 - flap); c.fill(); c.stroke();
        ell(c, r * 0.55, -r * 0.75, r * 0.6, r * 0.35, 0.7 + flap); c.fill(); c.stroke();
        circle(c, 0, 0, r); c.fillStyle = '#3a3f6b'; c.fill();
        c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
        googly(c, -r * 0.38, -r * 0.15, r * 0.42, 0, 0.3, 1.2); googly(c, r * 0.38, -r * 0.15, r * 0.42, 0, 0.3, 1.2);
        c.beginPath(); c.arc(0, r * 0.35, r * 0.25, 0.2, M.PI - 0.2); c.lineWidth = 1.4; c.stroke();
        c.restore(); c.restore();
        return;
      default:
        c.fillStyle = '#c9d4e3'; c.fill();
        circle(c, r * 0.2, r * 0.25, r * 0.72); c.fillStyle = '#9aa8bd'; c.fill();
        circle(c, -r * 0.15, -r * 0.1, r * 0.55); c.fillStyle = '#e8eef7'; c.fill();
        circle(c, 0, 0, r);
    }
    c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
    c.restore();
    // the shine never rolls
    ell(c, -r * 0.35, -r * 0.4, r * 0.32, r * 0.2, -0.6); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    if (id === 'planet') { c.save(); c.rotate(-0.35); c.beginPath(); c.ellipse(0, 0, r * 1.75, r * 0.55, 0, 0, M.PI); c.lineWidth = r * 0.28; c.strokeStyle = '#ffd36b'; c.stroke(); c.restore(); }
    c.restore();
  };

  /* ------------------------------------------------------------- the frog */
  // The table frog's face at (x, y) (the head centre), scale s. o: { look [x, y] of the ball,
  // open 0..1 (the mouth), puff 0..1 (cheeks), burp 0..1, t, happy }.
  FP.drawFrogHead = function (c, x, y, s, o) {
    o = o || {};
    var h = T.head, t = o.t || 0, puff = o.puff || 0, open = o.open || 0, burp = o.burp || 0;
    c.save(); c.translate(x, y); c.scale(s, s);
    var lw = 4;
    // cheeks puff out
    var cr = 26 + puff * 16;
    circle(c, -h.rx * 0.72, 22, cr); inked(c, '#58c84e', lw);
    circle(c, h.rx * 0.72, 22, cr); inked(c, '#58c84e', lw);
    // the head
    ell(c, 0, 0, h.rx, h.ry); inked(c, '#63d35a', lw);
    ell(c, 0, 26, h.rx * 0.74, h.ry * 0.48); c.fillStyle = '#c9f59a'; c.fill();
    // spots
    c.fillStyle = '#4fb848';
    circle(c, -50, -16, 9); c.fill(); circle(c, 44, -26, 7); c.fill(); circle(c, 62, 4, 5); c.fill(); circle(c, -66, 8, 5); c.fill();
    // blush
    c.fillStyle = 'rgba(255,110,150,0.55)'; ell(c, -h.rx * 0.62, 30, 16 + puff * 8, 9 + puff * 5); c.fill(); ell(c, h.rx * 0.62, 30, 16 + puff * 8, 9 + puff * 5); c.fill();
    // the lily crown between the eyes
    var py = T.peak[1] - T.head.y;
    c.fillStyle = '#ff8cc6'; c.strokeStyle = INK; c.lineWidth = 3;
    for (var k = -1; k <= 1; k++) { c.save(); c.translate(0, py + 18); c.rotate(k * 0.55); ell(c, 0, -10, 8, 15); c.fill(); c.stroke(); c.restore(); }
    circle(c, 0, py + 16, 6); c.fillStyle = '#fff36b'; c.fill(); c.stroke();
    // the eyes (domes on top), pupils follow the ball
    for (var e = 0; e < 2; e++) {
      var ex = T.eyes[e][0] - T.head.x, ey = T.eyes[e][1] - T.head.y, lk = o.look ? look(x + ex * s, y + ey * s, o.look[0], o.look[1]) : [0, 0.4];
      circle(c, ex, ey, T.eyeR); inked(c, '#63d35a', lw);
      var squint = puff > 0.3 || o.happy;
      if (squint) {
        c.beginPath(); c.arc(ex, ey + 4, 14, M.PI * 1.1, M.PI * 1.9); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
      } else {
        circle(c, ex, ey + 2, 19); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
        var spinEye = burp > 0 && o.multi;
        var px = spinEye ? M.cos(t * 14 + e * 3) : lk[0], pyy = spinEye ? M.sin(t * 14 + e * 3) : lk[1];
        circle(c, ex + px * 8, ey + 2 + pyy * 8, 9 + open * 2); c.fillStyle = INK; c.fill();
        circle(c, ex + px * 8 - 3, ey + 2 + pyy * 8 - 3, 3); c.fillStyle = '#fff'; c.fill();
      }
    }
    // the mouth: a big grin, open wide when a ball comes, an O for the burp
    var my = h.ry - 14;
    if (burp > 0) {
      var br = 14 + 10 * M.sin(M.min(1, burp) * M.PI);
      ell(c, 0, my - 4, br * 1.3, br); inked(c, '#7a1f3d', 3);
      ell(c, 0, my + br * 0.45 - 4, br * 0.7, br * 0.35); c.fillStyle = '#ff6f91'; c.fill();
    } else if (open > 0.05) {
      var oh = 8 + open * 22;
      c.beginPath(); c.moveTo(-46, my - 10); c.quadraticCurveTo(0, my - 10 + oh * 2.1, 46, my - 10); c.quadraticCurveTo(0, my - 2, -46, my - 10); c.closePath();
      inked(c, '#7a1f3d', 3);
      ell(c, 0, my - 4 + oh * 0.7, 18, 6 + open * 3); c.fillStyle = '#ff6f91'; c.fill();
    } else {
      c.beginPath(); c.moveTo(-50, my - 12); c.quadraticCurveTo(0, my + 10 - puff * 6, 50, my - 12);
      c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.moveTo(-50, my - 12); c.lineTo(-56, my - 17); c.moveTo(50, my - 12); c.lineTo(56, my - 17); c.lineWidth = 4; c.stroke();
    }
    c.restore();
  };

  // The big mascot frog in the right panel: sits on a lily pad, mood 'idle' | 'laugh' | 'gulp' |
  // 'cheer' | 'sad' | 'wow'; k 0..1 how far into the mood; s scale (1 = about 240 px tall).
  FP.drawMascot = function (c, x, y, s, mood, k, t, calm) {
    c.save(); c.translate(x, y); c.scale(s, s);
    var bob = calm ? 0 : M.sin(t * 2.2) * 3, jump = 0, shake = 0;
    if (!calm) {
      if (mood === 'cheer') jump = -M.abs(M.sin(t * 9)) * 22;
      if (mood === 'laugh') shake = M.sin(t * 30) * 3;
      if (mood === 'wow') jump = -M.max(0, M.sin(k * M.PI)) * 16;
    }
    // lily pad
    ell(c, 0, 92, 128, 30); inked(c, '#4fbf5a', 4);
    c.beginPath(); c.moveTo(0, 92); c.lineTo(40, 66); c.lineTo(62, 70); c.closePath(); c.fillStyle = THEMES[0].water[1]; c.fill();
    c.translate(shake, bob + jump);
    // legs
    c.fillStyle = '#58c84e'; c.strokeStyle = INK; c.lineWidth = 4;
    ell(c, -70, 68, 44, 24, -0.2); c.fill(); c.stroke(); ell(c, 70, 68, 44, 24, 0.2); c.fill(); c.stroke();
    for (var side = -1; side <= 1; side += 2) for (var f = 0; f < 3; f++) { circle(c, side * (96 + f * 6) - side * 6, 82 + f * 2 - 4, 7); c.fill(); c.stroke(); }
    // body
    ell(c, 0, 30, 80, 66); inked(c, '#63d35a', 4);
    ell(c, 0, 44, 52, 44); c.fillStyle = '#d6f7a8'; c.fill();
    // arms
    var up = mood === 'cheer' ? 1 : mood === 'wow' ? 0.6 : 0;
    for (var a = -1; a <= 1; a += 2) {
      c.beginPath(); c.moveTo(a * 58, 10); c.quadraticCurveTo(a * (86 + up * 10), 20 - up * 60, a * (70 + up * 20), 40 - up * 100);
      c.lineWidth = 16; c.strokeStyle = INK; c.stroke(); c.lineWidth = 10; c.strokeStyle = '#58c84e'; c.stroke();
      circle(c, a * (70 + up * 20), 40 - up * 100, 10); inked(c, '#58c84e', 3);
    }
    // head
    ell(c, 0, -52, 92, 58); inked(c, '#63d35a', 4);
    c.fillStyle = 'rgba(255,110,150,0.55)'; ell(c, -58, -30, 16, 9); c.fill(); ell(c, 58, -30, 16, 9); c.fill();
    // eyes
    for (var e = -1; e <= 1; e += 2) {
      var ex = e * 44, ey = -100;
      circle(c, ex, ey, 30); inked(c, '#63d35a', 4);
      if (mood === 'laugh' || mood === 'cheer') {
        c.beginPath(); c.arc(ex, ey + 6, 15, M.PI * 1.1, M.PI * 1.9); c.lineWidth = 6; c.strokeStyle = INK; c.stroke();
      } else if (mood === 'gulp') {
        c.beginPath(); c.moveTo(ex - 14, ey - 4); c.lineTo(ex + 14, ey + 2); c.moveTo(ex - 14, ey + 6); c.lineTo(ex + 14, ey + 2); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
      } else {
        var big = mood === 'wow' ? 1.15 : 1, sad = mood === 'sad';
        circle(c, ex, ey + 2, 22 * big); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
        var lx = calm ? 0 : M.sin(t * 0.9 + e) * 0.5, ly = sad ? 0.7 : 0.2;
        circle(c, ex + lx * 9, ey + 2 + ly * 9, 10 * big); c.fillStyle = INK; c.fill();
        circle(c, ex + lx * 9 - 3, ey + ly * 9 - 2, 3.5); c.fillStyle = '#fff'; c.fill();
        if (sad) { c.beginPath(); c.moveTo(ex - 22, ey - 22 + e * 6); c.lineTo(ex + 18, ey - 26 - e * 6); c.lineWidth = 5; c.strokeStyle = INK; c.stroke(); }
        // blink
        var blink = !calm && (t % 4.3) < 0.12 && mood === 'idle';
        if (blink) { circle(c, ex, ey + 2, 23); c.fillStyle = '#63d35a'; c.fill(); c.beginPath(); c.moveTo(ex - 18, ey + 4); c.lineTo(ex + 18, ey + 4); c.lineWidth = 4; c.strokeStyle = INK; c.stroke(); }
      }
    }
    // mouth
    c.strokeStyle = INK; c.lineWidth = 5;
    if (mood === 'laugh' || mood === 'cheer') {
      c.beginPath(); c.moveTo(-48, -40); c.quadraticCurveTo(0, 14, 48, -40); c.quadraticCurveTo(0, -24, -48, -40); c.closePath(); inked(c, '#7a1f3d', 4);
      ell(c, 0, -12, 18, 8); c.fillStyle = '#ff6f91'; c.fill();
    } else if (mood === 'gulp') {
      ell(c, -64, -30, 22 * (1 - M.abs(k - 0.5)) + 10, 18); inked(c, '#58c84e', 4);
      ell(c, 64, -30, 22 * (1 - M.abs(k - 0.5)) + 10, 18); inked(c, '#58c84e', 4);
      c.beginPath(); c.moveTo(-30, -30); c.quadraticCurveTo(0, -22, 30, -30); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
    } else if (mood === 'wow') {
      ell(c, 0, -28, 16, 20); inked(c, '#7a1f3d', 4);
    } else if (mood === 'sad') {
      c.beginPath(); c.moveTo(-36, -20); c.quadraticCurveTo(0, -46, 36, -20); c.stroke();
    } else {
      c.beginPath(); c.moveTo(-52, -38); c.quadraticCurveTo(0, -8, 52, -38); c.stroke();
    }
    c.restore();
  };

  /* -------------------------------------------------------------- the view */
  FP.createView = function (ctx) {
    var v = { calm: false, theme: -1, k: 1, bg: null, bumper: null, bumperLit: null, duck: null, flies: [] };
    var th = THEMES[0];
    v.setTheme = function (i, k) {
      i = THEMES[i] ? i : 0;
      if (i === v.theme && (k == null || k === v.k) && v.bg) return;
      v.theme = i; th = THEMES[i];
      if (k != null) v.k = k;
      v.bg = layer(W, H, v.k, drawStatic);
      v.bumper = layer(60, 60, v.k, function (c) { bumperBody(c, 30, 30, false); });
      v.bumperLit = layer(60, 60, v.k, function (c) { bumperBody(c, 30, 30, true); });
      v.duck = layer(60, 60, v.k, function (c) { duckBody(c, 30, 34); });
      v.flies = [];
      for (var f = 0; f < 14; f++) v.flies.push([30 + hash(f, 3) * 480, 40 + hash(f, 5) * 560, hash(f, 7) * 6]);
    };
    v.resize = function (k) { v.setTheme(v.theme < 0 ? 0 : v.theme, k); };

    /* ---- static layer */
    function rail(c, pts, w2, color) {
      poly(c, pts);
      c.lineWidth = w2 * 2 + 4; c.strokeStyle = INK; c.stroke();
      c.lineWidth = w2 * 2; c.strokeStyle = color || th.rail; c.stroke();
    }
    function waterShape(c) {
      var a = FP.archPoints(48);
      c.beginPath(); c.moveTo(20, TH);
      for (var i = 0; i < a.length; i++) c.lineTo(a[i][0], a[i][1]);
      c.lineTo(540, TH); c.closePath();
    }
    function drawPanels(c) {
      var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.panel[0]); g.addColorStop(1, th.panel[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // big soft lily pads and bubbles in the panels
      for (var i = 0; i < 18; i++) {
        var side = i % 2, x = side ? 930 + hash(i, 1) * 340 : hash(i, 1) * 350, y = 40 + hash(i, 2) * 660, r = 14 + hash(i, 3) * 40;
        c.globalAlpha = 0.14; c.fillStyle = '#ffffff';
        if (i % 3) { circle(c, x, y, r * 0.4); c.fill(); }
        else { c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, 0.4, TAU - 0.1); c.closePath(); c.fill(); }
      }
      c.globalAlpha = 1;
      // reeds along the bottom of each panel
      for (var s = 0; s < 2; s++) for (var j = 0; j < 9; j++) {
        var rx = (s ? 932 : 8) + j * 40 + hash(j, s + 9) * 18, rh = 70 + hash(j, s + 4) * 90;
        c.beginPath(); c.moveTo(rx, H + 4); c.quadraticCurveTo(rx + 8, H - rh * 0.5, rx + 4 + hash(j, 2) * 10, H - rh);
        c.lineWidth = 7; c.strokeStyle = th.reed; c.globalAlpha = 0.55; c.stroke();
        ell(c, rx + 4 + hash(j, 2) * 10, H - rh - 10, 5, 16); c.fillStyle = '#8a5a2b'; c.fill();
      }
      c.globalAlpha = 1;
    }
    function drawStatic(c) {
      drawPanels(c);
      c.save(); c.translate(X0, 0);
      // the wooden frame
      rrect(c, -6, -6, TW + 12, TH + 12, 26); c.fillStyle = th.woodDark; c.fill();
      rrect(c, 0, 0, TW, TH + 10, 22); c.fillStyle = th.wood; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 3;
      for (var gr = 0; gr < 6; gr++) { c.beginPath(); c.moveTo(4, 60 + gr * 110); c.quadraticCurveTo(10, 90 + gr * 110, 6, 130 + gr * 110); c.stroke(); c.beginPath(); c.moveTo(552, 40 + gr * 112); c.quadraticCurveTo(546, 80 + gr * 112, 553, 120 + gr * 112); c.stroke(); }
      // the pond
      waterShape(c);
      var g = c.createLinearGradient(0, 0, 0, TH); g.addColorStop(0, th.water[0]); g.addColorStop(1, th.water[1]);
      c.fillStyle = g; c.fill();
      c.save(); waterShape(c); c.clip();
      // ripples and decorative lily pads
      c.strokeStyle = th.ripple; c.lineWidth = 2.5;
      for (var i = 0; i < 16; i++) {
        var rx = 40 + hash(i, 11) * 440, ry = 120 + hash(i, 12) * 520, rr = 10 + hash(i, 13) * 22;
        c.beginPath(); c.ellipse(rx, ry, rr, rr * 0.45, 0, 0, TAU); c.stroke();
      }
      var pads = [[86, 440, 16], [436, 420, 14], [250, 410, 12], [40, 140, 0], [300, 560, 10], [205, 560, 9], [470, 150, 0]];
      pads.forEach(function (p, j) {
        if (!p[2]) return;
        c.beginPath(); c.moveTo(p[0], p[1]); c.arc(p[0], p[1], p[2], j + 0.3, j + 0.3 + TAU - 0.6); c.closePath();
        c.fillStyle = th.pad; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
      });
      if (th.candy) {
        c.fillStyle = 'rgba(255,255,255,0.35)';
        for (var cd = 0; cd < 26; cd++) { circle(c, 30 + hash(cd, 21) * 460, 100 + hash(cd, 22) * 560, 2 + hash(cd, 23) * 3); c.fill(); }
      }
      if (th.flies) {
        // the moon's reflection
        ell(c, 400, 470, 44, 12); c.fillStyle = 'rgba(255,250,200,0.18)'; c.fill();
        ell(c, 400, 470, 26, 6); c.fillStyle = 'rgba(255,250,200,0.25)'; c.fill();
      }
      // the orbit: a dotted path over the frog
      c.setLineDash([2, 14]); c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,0.45)';
      var ap = FP.archPoints(40); c.beginPath();
      for (var q = 3; q < ap.length - 6; q++) { var ax = ap[q][0] + (T.arch.x - ap[q][0]) * 0.09, ay = ap[q][1] + (T.arch.y - ap[q][1]) * 0.12; if (q === 3) c.moveTo(ax, ay); else c.lineTo(ax, ay); }
      c.stroke(); c.setLineDash([]);
      // lane chevrons pointing up the side lanes
      c.fillStyle = 'rgba(255,255,255,0.4)';
      [[42, 300], [42, 280], [480, 280], [480, 260]].forEach(function (p) { c.beginPath(); c.moveTo(p[0] - 10, p[1] + 6); c.lineTo(p[0], p[1] - 4); c.lineTo(p[0] + 10, p[1] + 6); c.lineTo(p[0] + 10, p[1] + 12); c.lineTo(p[0], p[1] + 2); c.lineTo(p[0] - 10, p[1] + 12); c.closePath(); c.fill(); });
      // the apron: a mud bank under the flippers, with the drain between them
      c.fillStyle = th.apron;
      poly(c, [[58, 550], [164, 600], [176, 640], [214, 690], [214, 730], [24, 730], [24, 690], [56, 690]], true); c.fill();
      poly(c, [[464, 550], [358, 600], [346, 640], [308, 690], [308, 730], [498, 730], [498, 690], [466, 690]], true); c.fill();
      c.fillStyle = th.apronTop;
      poly(c, [[58, 556], [160, 604], [168, 628], [60, 580]], true); c.fill();
      poly(c, [[464, 556], [362, 604], [354, 628], [462, 580]], true); c.fill();
      // reeds and pebbles on the apron
      for (var rd = 0; rd < 7; rd++) {
        var bx = rd < 4 ? 70 + rd * 32 : 330 + (rd - 4) * 46, by = 712;
        c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + 6, by - 30, bx + 2, by - 50); c.lineWidth = 5; c.strokeStyle = th.reed; c.stroke();
        ell(c, bx + 2, by - 56, 4, 12); c.fillStyle = '#8a5a2b'; c.fill();
      }
      c.restore();
      // the outer boundary line and the frame's lip
      waterShape(c); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
      // walls
      T.walls.forEach(function (wl) {
        if (wl.look === 'rail') rail(c, FP.wallPoints(wl), wl.th);
        else if (wl.look === 'gate') { rail(c, FP.wallPoints(wl), wl.th, '#ffe14f'); }
      });
      // plunger lane floor marks
      c.fillStyle = 'rgba(255,255,255,0.25)';
      for (var pm = 0; pm < 5; pm++) { c.fillRect(T.plunger.x - 11, 420 + pm * 50, 22, 4); }
      // slingshot bodies
      T.slings.forEach(function (tri) {
        poly(c, tri, true); c.lineWidth = 10; c.strokeStyle = INK; c.stroke(); c.fillStyle = th.pad; c.fill();
        c.lineWidth = 6; c.strokeStyle = '#ffffff'; c.stroke();
        poly(c, [tri[0], tri[2]]); c.lineWidth = 6; c.strokeStyle = th.sling; c.stroke();
        var cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        circle(c, cx, cy, 6); c.fillStyle = th.padDark; c.fill();
      });
      // flipper pivot plates
      T.flippers.forEach(function (f) { circle(c, f.x, f.y, 18); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill(); });
      c.restore();
    }
    function bumperBody(c, x, y, lit) {
      var r = T.bumperR;
      // lily pad donut: a green ring with a notch, a pink flower cap in the hole
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, -1.25, TAU - 1.65); c.closePath();
      c.fillStyle = lit ? '#d8ff6b' : th.pad; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      circle(c, x, y, r * 0.78); c.lineWidth = 2; c.strokeStyle = lit ? '#8fd14f' : th.padDark; c.stroke();
      for (var v2 = 0; v2 < 6; v2++) { var a = v2 * 1.05 + 0.5; c.beginPath(); c.moveTo(x + M.cos(a) * r * 0.5, y + M.sin(a) * r * 0.5); c.lineTo(x + M.cos(a) * r * 0.85, y + M.sin(a) * r * 0.85); c.stroke(); }
      circle(c, x, y, r * 0.46); c.fillStyle = lit ? '#ffffff' : '#ff8cc6'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      circle(c, x, y, r * 0.2); c.fillStyle = '#fff36b'; c.fill();
      if (lit) { circle(c, x, y, r + 3); c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke(); }
    }
    function duckBody(c, x, y) {
      // a rubber duck facing down-left, at (x, y) its middle
      c.lineWidth = 3; c.strokeStyle = INK;
      ell(c, x + 2, y + 2, 17, 12, -0.15); c.fillStyle = '#ffd93d'; c.fill(); c.stroke();
      ell(c, x + 12, y - 2, 7, 4, -0.6); c.fillStyle = '#ffc400'; c.fill();
      circle(c, x - 8, y - 12, 10); c.fillStyle = '#ffd93d'; c.fill(); c.stroke();
      ell(c, x - 18, y - 7, 7, 4, 0.5); c.fillStyle = '#ff8a2e'; c.fill(); c.stroke();
      googly(c, x - 10, y - 15, 4.5, -0.5, 0.4, 1.5);
    }

    /* ---- per frame */
    function lights(c, w, t) {
      var blink = v.calm ? 1 : 0.5 + 0.5 * M.sin(t * 8);
      // multiplier pads ×2..×5
      for (var i = 0; i < 4; i++) {
        var x = 195 + i * 44, y = 500, on = w.mult >= i + 2;
        circle(c, x, y, 16); c.fillStyle = on ? th.glow : 'rgba(0,0,0,0.22)'; c.fill(); c.lineWidth = 3; c.strokeStyle = on ? INK : 'rgba(255,255,255,0.55)'; c.stroke();
        c.font = '700 15px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
        c.fillStyle = on ? INK : 'rgba(255,255,255,0.75)'; c.fillText('×' + (i + 2), x, y + 1);
      }
      // the flies the frog has eaten towards the ball rain
      var feeds = w.frog.feeds + (w.frog.multi ? 3 : 0);
      for (var f = 0; f < 3; f++) {
        var fx = 225 + f * 36, fy = 282 + M.abs(f - 1) * -8, lit = f < feeds;
        c.globalAlpha = lit ? 1 : 0.5;
        ell(c, fx - 6, fy - 6, 7, 4, -0.6); c.fillStyle = lit ? '#e8fbff' : 'rgba(255,255,255,0.5)'; c.fill();
        ell(c, fx + 6, fy - 6, 7, 4, 0.6); c.fill();
        circle(c, fx, fy, 7); c.fillStyle = lit ? '#3a3f6b' : 'rgba(0,0,0,0.25)'; c.fill();
        if (lit) { circle(c, fx - 3, fy - 2, 2.4); c.fillStyle = '#fff'; c.fill(); circle(c, fx + 3, fy - 2, 2.4); c.fill(); }
        c.globalAlpha = 1;
      }
      // kickback arrows in the outlanes
      for (var s = 0; s < 2; s++) {
        var kx = s ? 483 : 39, on2 = w.kick[s], ky = 612, hot = w.kickLit[s] > 0;
        c.beginPath(); c.moveTo(kx, ky - 16); c.lineTo(kx + 12, ky); c.lineTo(kx + 5, ky); c.lineTo(kx + 5, ky + 14); c.lineTo(kx - 5, ky + 14); c.lineTo(kx - 5, ky); c.lineTo(kx - 12, ky); c.closePath();
        c.fillStyle = hot ? '#ffffff' : on2 ? (blink > 0.3 ? th.glow : '#ffd000') : 'rgba(0,0,0,0.25)'; c.fill();
        c.lineWidth = 2.5; c.strokeStyle = on2 ? INK : 'rgba(255,255,255,0.45)'; c.stroke();
      }
      // the lane springs flash when they fling a ball up
      for (var bl = 0; bl < 2; bl++) {
        var lk = w.boostLit[bl] / 0.5;
        if (lk <= 0) continue;
        c.globalAlpha = lk; c.fillStyle = th.glow; c.strokeStyle = INK; c.lineWidth = 2;
        (bl ? [[480, 280], [480, 260]] : [[42, 300], [42, 280]]).forEach(function (p) {
          c.beginPath(); c.moveTo(p[0] - 10, p[1] + 6); c.lineTo(p[0], p[1] - 4); c.lineTo(p[0] + 10, p[1] + 6); c.lineTo(p[0] + 10, p[1] + 12); c.lineTo(p[0], p[1] + 2); c.lineTo(p[0] - 10, p[1] + 12); c.closePath(); c.fill(); c.stroke();
        });
        c.globalAlpha = 1;
      }
      // ball save: a bubble between the flippers
      var save = w.saveT > 0 && !w.over;
      var sx = 261, sy = 700;
      circle(c, sx, sy, 13); c.fillStyle = save ? 'rgba(255,255,255,' + (0.55 + 0.35 * blink) + ')' : 'rgba(255,255,255,0.14)'; c.fill();
      c.lineWidth = 2.5; c.strokeStyle = save ? INK : 'rgba(255,255,255,0.3)'; c.stroke();
      if (save) { circle(c, sx - 4, sy - 4, 3.5); c.fillStyle = '#fff'; c.fill(); }
    }
    function slingsLit(c, w) {
      for (var i = 0; i < 2; i++) {
        var sl = w.slings[i];
        if (sl.lit <= 0) continue;
        var tri = T.slings[i], k = sl.lit / 0.2;
        poly(c, tri, true); c.fillStyle = 'rgba(255,255,255,' + (0.6 * k) + ')'; c.fill();
        // the rubber band bows out
        var mx = (tri[0][0] + tri[2][0]) / 2, my = (tri[0][1] + tri[2][1]) / 2, out = i ? -1 : 1;
        c.beginPath(); c.moveTo(tri[0][0], tri[0][1]); c.quadraticCurveTo(mx + out * 9 * k, my - 4 * k, tri[2][0], tri[2][1]); c.lineWidth = 7; c.strokeStyle = '#ffffff'; c.stroke();
      }
    }
    function ducks(c, w, t) {
      for (var i = 0; i < 3; i++) {
        var d = T.ducks[i], dk = w.ducks[i];
        if (dk.up) {
          var wob = v.calm ? 0 : M.sin(t * 3 + i) * 0.06;
          c.save(); c.translate(d[0], d[1]); c.rotate(wob + 0.42); c.drawImage(v.duck, -30, -34, 60, 60); c.restore();
        } else {
          // dunked: ripples and a beak bubble
          var k = M.min(1, dk.t * 3);
          c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,0.7)';
          ell(c, d[0], d[1], 10 + k * 8, 4 + k * 3, 0.42); c.stroke();
          if (dk.t < 0.35 && !v.calm) { c.save(); c.translate(d[0], d[1] + dk.t * 30); c.rotate(0.42 + dk.t * 4); c.globalAlpha = 1 - dk.t / 0.35; c.drawImage(v.duck, -30, -34, 60, 60); c.restore(); c.globalAlpha = 1; }
          circle(c, d[0] - 6, d[1] - 4, 2.5); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
        }
      }
    }
    function bumpers(c, w, t, ball) {
      for (var i = 0; i < 3; i++) {
        var b = T.bumpers[i], bp = w.bumpers[i], lit = bp.lit > 0, sq = lit && !v.calm ? 1 + 0.18 * (bp.lit / 0.3) : 1;
        c.save(); c.translate(b[0], b[1]); c.scale(sq, 2 - sq);
        c.drawImage(lit ? v.bumperLit : v.bumper, -30, -30, 60, 60);
        var lk = ball ? look(b[0], b[1], ball.x, ball.y) : [0, 0.5];
        googly(c, -8, -12, 7.5, lk[0], lk[1], 2); googly(c, 8, -13, 6.5, lk[0], lk[1], 2);
        if (lit) { c.beginPath(); c.arc(0, 4, 6, 0.1, M.PI - 0.1); c.fillStyle = '#7a1f3d'; c.fill(); }
        c.restore();
      }
    }
    function spinner(c, w) {
      var sp = w.spin, x = (T.lanes[0][0] + T.lanes[0][1]) / 2 + 2, y = T.spinY, ca = M.cos(sp.a);
      // the axle across the lane
      c.beginPath(); c.moveTo(T.lanes[0][0] + 1, y); c.lineTo(T.lanes[0][1] - 4, y); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      // a dragonfly: wings show their face as it turns
      var hgt = 12 * ca;
      c.fillStyle = sp.w > 2 ? 'rgba(200,255,255,0.95)' : 'rgba(180,240,255,0.85)'; c.strokeStyle = INK; c.lineWidth = 1.8;
      ell(c, x - 9, y - hgt * 0.5, 9, M.abs(hgt * 0.5) + 1); c.fill(); c.stroke();
      ell(c, x + 9, y - hgt * 0.5, 9, M.abs(hgt * 0.5) + 1); c.fill(); c.stroke();
      ell(c, x, y, 13, 3.5); c.fillStyle = '#3fd0ff'; c.fill(); c.stroke();
      circle(c, x - 14, y, 4.5); c.fillStyle = '#3fd0ff'; c.fill(); c.stroke();
      circle(c, x - 15, y - 1.5, 1.8); c.fillStyle = INK; c.fill();
    }
    function flipper(c, f, color) {
      var d = FP.flipDir(f), L = T.flipLen, r0 = T.flipR0, r1 = T.flipR1;
      var tx = f.x + d[0] * L, ty = f.y + d[1] * L, nx = -d[1], ny = d[0];
      var sinA = (r0 - r1) / L, cosA = M.sqrt(1 - sinA * sinA);
      // tangent lines between the two end circles
      var a1x = nx * cosA + d[0] * sinA, a1y = ny * cosA + d[1] * sinA, a2x = -nx * cosA + d[0] * sinA, a2y = -ny * cosA + d[1] * sinA;
      c.beginPath();
      c.moveTo(f.x + a1x * r0, f.y + a1y * r0); c.lineTo(tx + a1x * r1, ty + a1y * r1);
      var ang1 = M.atan2(a1y, a1x), ang2 = M.atan2(a2y, a2x);
      c.arc(tx, ty, r1, ang1, ang2, f.side < 0);
      c.lineTo(f.x + a2x * r0, f.y + a2y * r0);
      c.arc(f.x, f.y, r0, ang2, ang1, f.side < 0);
      c.closePath();
      inked(c, color, 3.5);
      // frog toes at the tip, a shine and the pivot bolt
      c.fillStyle = color;
      for (var k = -1; k <= 1; k++) { circle(c, tx + d[0] * 3 + nx * k * 5, ty + d[1] * 3 + ny * k * 5, 3.6); c.fill(); c.lineWidth = 2; c.stroke(); }
      c.beginPath(); c.moveTo(f.x + d[0] * 8 - nx * f.side * 6, f.y + d[1] * 8 - ny * f.side * 6); c.lineTo(tx - d[0] * 12 - nx * f.side * 2.5, ty - d[1] * 12 - ny * f.side * 2.5);
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke();
      circle(c, f.x, f.y, 4.5); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    }
    function plunger(c, w) {
      var p = T.plunger, pull = w.pull, top = p.y + pull * p.pull;
      // spring
      c.beginPath();
      var coils = 7, bottom = TH - 2;
      for (var i = 0; i <= coils * 2; i++) { var yy = top + 10 + (bottom - top - 10) * i / (coils * 2); c.lineTo(p.x + (i % 2 ? 8 : -8), yy); }
      c.lineWidth = 3; c.strokeStyle = '#d6dbe6'; c.stroke();
      rrect(c, p.x - 12, top, 24, 12, 5); inked(c, '#ff4f6d', 3);
      // power meter on the frame
      var mh = 150, mx = 547, my = TH - 10 - mh;
      rrect(c, mx, my, 9, mh, 4); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      if (pull > 0.01) { var fh = mh * pull; rrect(c, mx, my + mh - fh, 9, fh, 4); c.fillStyle = pull > 0.8 ? '#ff4f6d' : pull > 0.45 ? '#ffe14f' : '#3ddc84'; c.fill(); }
    }
    function post(c, w, t) {
      if (w.L.pit) rail(c, T.pit, 2, '#ffe14f');
      if (!w.L.post) return;
      var p = T.post, bob = v.calm ? 0 : M.sin(t * 3) * 0.6;
      circle(c, p[0], p[1], p[2] + 1); inked(c, '#ff8cc6', 3);
      circle(c, p[0], p[1] + bob, 3.5); c.fillStyle = '#fff36b'; c.fill();
    }
    function fireflies(c, t) {
      if (!th.flies) return;
      for (var i = 0; i < v.flies.length; i++) {
        var f = v.flies[i], k = v.calm ? 0.5 : 0.5 + 0.5 * M.sin(t * 2 + f[2]);
        var x = f[0] + (v.calm ? 0 : M.sin(t * 0.6 + f[2]) * 16), y = f[1] + (v.calm ? 0 : M.cos(t * 0.5 + f[2]) * 10);
        c.globalAlpha = 0.25 * k; circle(c, x, y, 7); c.fillStyle = th.glow; c.fill();
        c.globalAlpha = 0.6 + 0.4 * k; circle(c, x, y, 2.2); c.fill();
      }
      c.globalAlpha = 1;
    }
    // o: { t, skin, frog: { puff, burp, multi }, tongue: { x, y, k } }
    v.render = function (w, o) {
      var c = ctx, t = o.t || 0;
      c.drawImage(v.bg, 0, 0, W, H);
      if (!w) return;
      c.save(); c.translate(X0, 0);
      var main = FP.mainBall(w);
      var target = main && main.st !== 'mouth' ? main : null;
      lights(c, w, t);
      slingsLit(c, w);
      ducks(c, w, t);
      bumpers(c, w, t, target);
      // the frog: the mouth opens as a ball comes near
      var fr = w.frog, open = fr.ball ? 0 : 0;
      if (target && !fr.ball && fr.cool <= 0) {
        var dx = target.x - T.mouth[0], dy = target.y - T.mouth[1], d = M.sqrt(dx * dx + dy * dy);
        open = M.max(0, M.min(1, (150 - d) / 110));
      }
      var fo = o.frog || {};
      FP.drawFrogHead(c, T.head.x, T.head.y, 1, { look: target ? [X0 + target.x, target.y] : null, open: open, puff: fr.ball ? 1 : fo.puff || 0, burp: fo.burp || 0, multi: fo.multi, t: t });
      if (o.tongue && o.tongue.k > 0) {
        var tg = o.tongue, mx = T.mouth[0], my = T.mouth[1] - 8, ex = mx + (tg.x - mx) * tg.k, ey = my + (tg.y - my) * tg.k;
        c.beginPath(); c.moveTo(mx, my); c.lineTo(ex, ey); c.lineWidth = 11; c.strokeStyle = INK; c.stroke(); c.lineWidth = 7; c.strokeStyle = '#ff6f91'; c.stroke();
        circle(c, ex, ey, 8); inked(c, '#ff6f91', 2.5);
      }
      spinner(c, w);
      post(c, w, t);
      plunger(c, w);
      var fc = o.flip || th.flip;
      flipper(c, w.flippers[0], fc); flipper(c, w.flippers[1], fc);
      for (var i = 0; i < w.balls.length; i++) {
        var b = w.balls[i];
        if (b.st === 'mouth') continue;
        FP.drawBall(c, o.skin, b.x, b.y, R, b.spin || 0, t);
      }
      fireflies(c, t);
      c.restore();
    };
    v.panelsOnly = function () { ctx.drawImage(v.bg, 0, 0, W, H); };
    return v;
  };
})();
