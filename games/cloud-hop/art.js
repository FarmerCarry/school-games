/* Cloud Hop (نطّة السحاب): everything drawn in code on one 2D canvas (1280x720 logical).
 * Skies, the parallax layer, platforms and candies are drawn once into small offscreen
 * canvases and reused; only faces, eyes, wings and the characters are drawn live. Flat
 * fills, no shadows, no filters and no canvas reads, so it stays smooth on the lab PCs.
 * CH.drawChar also paints the character previews on the characters screen.
 */
(function () {
  'use strict';
  var CH = window.CH, M = Math, TAU = M.PI * 2;
  var W = 1280, H = 720, INK = '#26305e';

  /* --------------------------------------------------------- small shapes */
  function blob(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function rrect(c, x, y, w, h, r) {
    r = M.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  CH.rrect = rrect;
  function googly(c, x, y, r, px, py) {
    blob(c, x, y, r, r); c.fillStyle = '#fff'; c.fill(); c.lineWidth = M.max(1.5, r * 0.2); c.strokeStyle = INK; c.stroke();
    blob(c, x + px * r * 0.42, y + py * r * 0.42, r * 0.52, r * 0.52); c.fillStyle = INK; c.fill();
    blob(c, x + px * r * 0.42 - r * 0.18, y + py * r * 0.42 - r * 0.2, r * 0.14, r * 0.14); c.fillStyle = '#fff'; c.fill();
  }
  function star(c, x, y, r, rot) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = rot - M.PI / 2 + i * M.PI / 5, rr = i % 2 ? r * 0.46 : r;
      if (i) c.lineTo(x + M.cos(a) * rr, y + M.sin(a) * rr); else c.moveTo(x + M.cos(a) * rr, y + M.sin(a) * rr);
    }
    c.closePath();
  }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  // A puffy cloud outline around (x, y) = the middle of its top: one ink outline for the
  // whole shape (all parts stroked first, then all filled).
  function cloudParts(w, h, seed) {
    var parts = [], n = M.max(2, M.round(w / 56));
    parts.push([0, h * 0.18, w / 2, h * 0.5, 'r']);
    for (var i = 0; i < n; i++) {
      var f = (i + 0.5) / n, r = (w / n) * (0.55 + 0.22 * hash(i, seed));
      parts.push([-w / 2 + f * w, -h * 0.02 - r * 0.25 * M.sin(f * M.PI), r * 0.95, r * 0.8, 'e']);
    }
    return parts;
  }
  function drawParts(c, parts, x, y, fill, lw) {
    var i, p;
    c.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        if (p[4] === 'r') rrect(c, x + p[0] - p[2], y + p[1] - p[3], p[2] * 2, p[3] * 2, p[3]);
        else blob(c, x + p[0], y + p[1], p[2], p[3]);
        if (pass === 0) { c.lineWidth = lw * 2; c.strokeStyle = INK; c.stroke(); } else { c.fillStyle = fill; c.fill(); }
      }
    }
  }
  function lighten(c, parts, x, y, color, dy) {
    c.save();
    c.beginPath();
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p[4] === 'r') { c.moveTo(x + p[0] - p[2] + p[3], y + p[1] - p[3]); rrect(c, x + p[0] - p[2], y + p[1] - p[3], p[2] * 2, p[3] * 2, p[3]); }
      else { c.moveTo(x + p[0] + p[2], y + p[1]); c.ellipse(x + p[0], y + p[1], p[2], p[3], 0, 0, TAU); }
    }
    c.clip();
    c.fillStyle = color;
    blob(c, x, y + dy, 2000, 40); c.fill();
    c.restore();
  }

  /* --------------------------------------------------------- the sprites */
  // Offscreen canvases drawn at the screen's pixel scale k (cleared when it changes).
  var cache = {}, cacheN = 0, K = 1;
  function sprite(key, w, h, ax, ay, draw) {
    var s = cache[key];
    if (s) return s;
    if (cacheN > 140) { cache = {}; cacheN = 0; }
    var cv = document.createElement('canvas');
    cv.width = M.max(1, M.ceil(w * K)); cv.height = M.max(1, M.ceil(h * K));
    var c = cv.getContext('2d');
    c.scale(K, K); c.translate(ax, ay);
    draw(c);
    s = cache[key] = { cv: cv, w: w, h: h, ax: ax, ay: ay };
    cacheN++;
    return s;
  }
  function put(c, s, x, y, sx, sy) {
    sx = sx || 1; sy = sy || 1;
    c.drawImage(s.cv, x - s.ax * sx, y - s.ay * sy, s.w * sx, s.h * sy);
  }
  var KINDS = {
    cloud: { fill: '#ffffff', low: '#d8ecff' },
    rescue: { fill: '#fff6fd', low: '#ffd3ef' },
    move: { fill: '#f1efff', low: '#d7d2ff' },
    ground: { fill: '#ffffff', low: '#d8ecff' },
    castle: { fill: '#fff7fb', low: '#ffd9ec' },
    thunder: { fill: '#8290b8', low: '#5f6c95' }
  };
  function platSprite(kind, wd, rescue) {
    var q = M.max(60, M.round(wd / 10) * 10), key = (rescue ? 'rescue' : kind) + q;
    var h = kind === 'ground' || kind === 'castle' ? 70 : 34;
    return sprite(key, q + 30, h + 88, q / 2 + 15, 64, function (c) {
      if (kind === 'cookie') {
        blob(c, 0, 8, q / 2, 19); c.fillStyle = '#d98f3e'; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
        blob(c, 0, 3, q / 2 - 6, 13); c.fillStyle = '#efb262'; c.fill();
        c.fillStyle = '#6b3a1f';
        for (var i = 0; i < M.round(q / 26); i++) { blob(c, -q / 2 + 14 + hash(i, q) * (q - 28), -2 + hash(q, i) * 18, 4.5, 3.6); c.fill(); }
        return;
      }
      if (kind === 'tramp') {
        var tp = cloudParts(q, h, 7); drawParts(c, tp, 0, 4, '#fff', 2.2); lighten(c, tp, 0, 4, '#d8ecff', 34);
        return;
      }
      var k = KINDS[rescue ? 'rescue' : kind] || KINDS.cloud;
      var parts = cloudParts(q, h, q + kind.length);
      drawParts(c, parts, 0, 2, k.fill, 2.2);
      lighten(c, parts, 0, 2, k.low, h * 0.95);
      if (kind !== 'thunder') { c.fillStyle = 'rgba(255,255,255,0.9)'; blob(c, -q * 0.22, -h * 0.25, q * 0.1, h * 0.14); c.fill(); }
    });
  }
  var CANDY = ['#ff5fa2', '#ffd23f', '#4fe0b0', '#ff8a3d', '#a77bff'];
  function candySprite(i) {
    return sprite('candy' + i, 64, 40, 32, 20, function (c) {
      var col = CANDY[i];
      c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = INK;
      c.fillStyle = shade(col, 0.25);
      c.beginPath(); c.moveTo(-12, 0); c.lineTo(-27, -11); c.lineTo(-24, 0); c.lineTo(-27, 11); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(12, 0); c.lineTo(27, -11); c.lineTo(24, 0); c.lineTo(27, 11); c.closePath(); c.fill(); c.stroke();
      blob(c, 0, 0, 15, 14); c.fillStyle = col; c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3.5;
      c.beginPath(); c.moveTo(-8, -9); c.quadraticCurveTo(0, 0, -6, 10); c.stroke();
      c.beginPath(); c.moveTo(3, -12); c.quadraticCurveTo(10, 0, 4, 12); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.9)'; blob(c, -6, -6, 3.5, 2.5); c.fill();
    });
  }
  CH.drawCandy = function (c, x, y, s, i) { put(c, candySprite(((i | 0) % 5 + 5) % 5), x, y, s, s); };

  /* --------------------------------------------------------------- skies */
  var SKIES = [
    { stops: ['#5fb8ff', '#9fd8ff', '#dff5ff'], puff: 'rgba(255,255,255,0.55)' },
    { stops: ['#ff79b0', '#ffae8f', '#ffe2a1'], puff: 'rgba(255,236,246,0.5)' },
    { stops: ['#100b36', '#25186a', '#46309a'], puff: 'rgba(150,120,255,0.16)', stars: 1 },
    { stops: ['#260a48', '#6b2393', '#ff6fb8'], puff: 'rgba(255,150,220,0.2)', stars: 2 }
  ];
  function skySprite(i) {
    return sprite('sky' + i, W, H, 0, 0, function (c) {
      var s = SKIES[i], g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, s.stops[0]); g.addColorStop(0.55, s.stops[1]); g.addColorStop(1, s.stops[2]);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      var k;
      if (s.stars) {
        for (k = 0; k < 120; k++) {
          var sx = hash(k, 3 + i) * W, sy = hash(k, 5 + i) * H * 0.95, sr = 1 + hash(k, 7) * 2.2;
          c.fillStyle = s.stars === 2 ? ['#fff', '#ffe14f', '#7ff5ff', '#ff9ee0'][k % 4] : k % 7 ? '#fff' : '#ffe9a8';
          c.globalAlpha = 0.5 + hash(k, 9) * 0.5;
          if (k % 11 === 0) { star(c, sx, sy, sr * 3, 0); c.fill(); } else c.fillRect(sx, sy, sr, sr);
        }
        c.globalAlpha = 1;
      }
      c.lineWidth = 4; c.strokeStyle = INK; c.lineJoin = 'round';
      if (i === 0) {
        // a smiley sun
        c.fillStyle = 'rgba(255,248,180,0.35)'; blob(c, 1080, 118, 112, 112); c.fill();
        c.fillStyle = 'rgba(255,248,180,0.45)'; blob(c, 1080, 118, 86, 86); c.fill();
        blob(c, 1080, 118, 62, 62); c.fillStyle = '#ffe766'; c.fill(); c.stroke();
        c.lineWidth = 4; c.beginPath(); c.arc(1060, 112, 8, M.PI * 1.1, M.PI * 1.9); c.stroke(); c.beginPath(); c.arc(1100, 112, 8, M.PI * 1.1, M.PI * 1.9); c.stroke();
        c.beginPath(); c.arc(1080, 128, 20, 0.15 * M.PI, 0.85 * M.PI); c.stroke();
        c.fillStyle = '#ffb37a'; blob(c, 1046, 132, 9, 5); c.fill(); blob(c, 1114, 132, 9, 5); c.fill();
      } else if (i === 1) {
        // a big low sun and floating lollipops
        c.fillStyle = 'rgba(255,245,190,0.45)'; blob(c, 260, 560, 190, 190); c.fill();
        blob(c, 260, 560, 130, 130); c.fillStyle = '#fff1a8'; c.fill();
        for (k = 0; k < 3; k++) {
          var lx = [980, 1160, 640][k], ly = [140, 330, 90][k], lr = [34, 24, 18][k];
          c.globalAlpha = 0.75;
          c.fillStyle = '#fff'; c.fillRect(lx - 3, ly, 6, lr * 2.6);
          blob(c, lx, ly, lr, lr); c.fillStyle = ['#ff5fa2', '#7fd8ff', '#ffd23f'][k]; c.fill();
          c.strokeStyle = '#fff'; c.lineWidth = lr * 0.22;
          c.beginPath(); for (var a = 0; a < 14; a += 0.3) { var rr = lr * a / 15; c.lineTo(lx + M.cos(a) * rr, ly + M.sin(a) * rr); } c.stroke();
          c.globalAlpha = 1;
        }
      } else if (i === 2) {
        // a sleepy moon and a ringed planet
        blob(c, 230, 150, 58, 58); c.fillStyle = '#fff3c4'; c.fill(); c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
        c.fillStyle = '#ead9a0'; blob(c, 205, 128, 11, 9); c.fill(); blob(c, 258, 180, 8, 7); c.fill();
        c.beginPath(); c.arc(212, 148, 8, 0.1 * M.PI, 0.9 * M.PI); c.stroke(); c.beginPath(); c.arc(248, 148, 8, 0.1 * M.PI, 0.9 * M.PI); c.stroke();
        c.fillStyle = '#ffb3c8'; blob(c, 230, 172, 7, 4); c.fill();
        c.save(); c.translate(1050, 190); c.rotate(-0.35);
        blob(c, 0, 0, 52, 52); c.fillStyle = '#ff9a5c'; c.fill(); c.stroke();
        c.fillStyle = '#ffc07a'; rrect(c, -50, -12, 100, 14, 7); c.fill();
        c.beginPath(); c.ellipse(0, 0, 92, 20, 0, 0.05 * M.PI, 0.95 * M.PI); c.lineWidth = 9; c.strokeStyle = '#ffe28a'; c.stroke();
        c.restore();
      } else {
        // a donut planet and a candy swirl
        c.save(); c.translate(1010, 180);
        blob(c, 0, 0, 70, 70); c.fillStyle = '#e8a85c'; c.fill(); c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
        c.beginPath(); for (var d = 0; d <= 24; d++) { var da = d / 24 * TAU, dr = 58 + (d % 2) * 8; c.lineTo(M.cos(da) * dr, M.sin(da) * dr); } c.closePath();
        c.fillStyle = '#ff7ec2'; c.fill();
        blob(c, 0, 0, 22, 22); c.fillStyle = SKIES[3].stops[0]; c.fill(); c.stroke();
        for (var sp = 0; sp < 14; sp++) { var sa = sp * 0.9; c.fillStyle = ['#fff', '#7ff5ff', '#ffe14f'][sp % 3]; c.save(); c.translate(M.cos(sa) * 42, M.sin(sa) * 42); c.rotate(sa); c.fillRect(-5, -2, 10, 4); c.restore(); }
        c.restore();
        c.globalAlpha = 0.5; c.strokeStyle = '#ffd1f0'; c.lineWidth = 6;
        c.beginPath(); for (var b = 0; b < 18; b += 0.25) { var br = b * 6; c.lineTo(250 + M.cos(b) * br, 260 + M.sin(b) * br * 0.6); } c.stroke();
        c.globalAlpha = 1;
      }
    });
  }
  // The parallax layer: soft puffs (or nebulas in space) on a tile that repeats upwards.
  var TILE = 1024;
  function puffSprite(i) {
    return sprite('puff' + i, W, TILE, 0, 0, function (c) {
      c.fillStyle = SKIES[i].puff;
      // each puff also drawn one tile up, down, left and right, so the tile wraps seamlessly
      function puff(x, y, s) { for (var r = 0; r < 4; r++) { blob(c, x + (r - 1.5) * s * 0.6, y - (r % 2) * s * 0.3, s * 0.6, s * 0.42); c.fill(); } }
      for (var k = 0; k < 9; k++) {
        var x = hash(k, 21 + i) * W, y = (k + 0.3 * hash(k, 23)) / 9 * TILE, s = 60 + hash(k, 25) * 70;
        for (var dx = -W; dx <= W; dx += W) for (var dy = -TILE; dy <= TILE; dy += TILE) puff(x + dx, y + dy, s);
      }
    });
  }

  /* ---------------------------------------------------------- characters */
  // (x, y) = the middle of the feet; s = body height. o: { t, sq (+ taller, - squashed),
  // eyes [{x,y},{x,y}], mood: 'happy'|'wow'|'ouch'|'zap'|'sleep', arms 0..1, power }
  var CHAR_ART = {
    marshy: { body: '#fffaf3', top: '#ffe3ee', edge: '#f0cfdc', shape: 'marsh' },
    jelly: { body: 'rgba(110,232,150,0.9)', top: 'rgba(180,255,200,0.95)', edge: '#2fa874', shape: 'cube' },
    donut: { body: '#e8a85c', top: '#ff7ec2', edge: '#b8742f', shape: 'donut' },
    duck: { body: '#ffd93d', top: '#ffe98a', edge: '#d9a400', shape: 'duck' },
    pickle: { body: '#74c94e', top: '#9be06e', edge: '#3c7d2a', shape: 'pickle' },
    fatira: { body: '#f3b856', top: '#ffd98a', edge: '#b57724', shape: 'fatira' },
    boba: { body: '#4a2e2a', top: '#6e4740', edge: '#2a1714', shape: 'boba' },
    gold: { body: '#ffd23f', top: '#fff09a', edge: '#c99a00', shape: 'marsh', crown: true }
  };
  CH.drawChar = function (c, id, x, y, s, o) {
    o = o || {};
    var a = CHAR_ART[id] || CHAR_ART.marshy, t = o.t || 0, sq = o.sq || 0;
    var h = s * (1 + sq), w = s * 0.86 / M.sqrt(M.max(0.4, 1 + sq));
    var lw = M.max(2, s * 0.06), top = y - h, arms = o.arms == null ? 0.5 : o.arms;
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK;
    // feet
    c.fillStyle = a.edge; c.lineWidth = lw * 0.8;
    blob(c, x - w * 0.22, y - s * 0.02, s * 0.12, s * 0.07); c.fill(); c.stroke();
    blob(c, x + w * 0.22, y - s * 0.02, s * 0.12, s * 0.07); c.fill(); c.stroke();
    // little arms: up and flailing while rising, out while falling
    c.lineWidth = lw * 1.1;
    for (var sd = -1; sd <= 1; sd += 2) {
      var ax = x + sd * w * 0.47, ay = top + h * 0.58;
      var hx = ax + sd * s * (0.2 - 0.06 * arms), hy = ay - s * (0.02 + 0.3 * arms) + M.sin(t * 18 + sd) * s * 0.05 * arms;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(hx, hy); c.stroke();
      blob(c, hx, hy, s * 0.055, s * 0.055); c.fillStyle = '#fff'; c.fill(); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw * 1.1;
    }
    c.lineWidth = lw;
    var eyeY = top + h * 0.42, er = s * 0.12, mouthY = top + h * 0.66;
    switch (a.shape) {
      case 'cube':
        var wob = M.sin(t * 9) * 0.04 * s;
        rrect(c, x - w / 2 - wob, top + wob, w + wob * 2, h - wob, s * 0.16); c.fillStyle = a.body; c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.55)'; rrect(c, x - w * 0.36, top + h * 0.1, w * 0.16, h * 0.34, s * 0.05); c.fill();
        break;
      case 'donut':
        blob(c, x, top + h * 0.52, w * 0.56, h * 0.52); c.fillStyle = a.body; c.fill(); c.stroke();
        c.beginPath();
        for (var dk = 0; dk <= 16; dk++) { var da = M.PI + dk / 16 * M.PI, dr = 1 - (dk % 2) * 0.08; c.lineTo(x + M.cos(da) * w * 0.53 * dr, top + h * 0.5 + M.sin(da) * h * 0.48 * dr); }
        c.lineTo(x + w * 0.5, top + h * 0.62); c.quadraticCurveTo(x, top + h * 0.72, x - w * 0.5, top + h * 0.62); c.closePath();
        c.fillStyle = a.top; c.fill(); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw;
        for (var sp = 0; sp < 7; sp++) { c.fillStyle = ['#fff', '#7ff5ff', '#ffe14f', '#7dff9a'][sp % 4]; c.save(); c.translate(x + (hash(sp, 2) - 0.5) * w * 0.8, top + h * (0.12 + hash(sp, 4) * 0.3)); c.rotate(sp); c.fillRect(-s * 0.04, -s * 0.012, s * 0.08, s * 0.024); c.restore(); }
        blob(c, x, top + h * 0.8, w * 0.13, h * 0.08); c.fillStyle = '#b8742f'; c.fill(); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw;
        eyeY = top + h * 0.38; mouthY = top + h * 0.6;
        break;
      case 'duck':
        blob(c, x, top + h * 0.62, w * 0.6, h * 0.4); c.fillStyle = a.body; c.fill(); c.stroke();
        blob(c, x - w * 0.02, top + h * 0.3, w * 0.4, h * 0.3); c.fill(); c.stroke();
        c.fillStyle = '#f2c200'; blob(c, x + w * 0.35, top + h * 0.62, w * 0.2, h * 0.12); c.fill(); c.lineWidth = lw * 0.7; c.stroke(); c.lineWidth = lw;
        eyeY = top + h * 0.26; mouthY = top + h * 0.46;
        break;
      case 'pickle':
        rrect(c, x - w * 0.36, top - h * 0.08, w * 0.72, h * 1.08, w * 0.36); c.fillStyle = a.body; c.fill(); c.stroke();
        c.fillStyle = a.edge;
        for (var b = 0; b < 7; b++) { blob(c, x + (hash(b, 3) - 0.5) * w * 0.48, top + h * (0.05 + b * 0.13), s * 0.025, s * 0.025); c.fill(); }
        eyeY = top + h * 0.32;
        break;
      case 'fatira':
        c.beginPath(); c.moveTo(x, top - h * 0.04);
        c.quadraticCurveTo(x + w * 0.1, top, x + w * 0.62, top + h * 0.9);
        c.quadraticCurveTo(x + w * 0.64, top + h, x + w * 0.5, top + h); c.lineTo(x - w * 0.5, top + h);
        c.quadraticCurveTo(x - w * 0.64, top + h, x - w * 0.62, top + h * 0.9);
        c.quadraticCurveTo(x - w * 0.1, top, x, top - h * 0.04); c.closePath();
        c.fillStyle = a.body; c.fill(); c.stroke();
        c.fillStyle = '#fff3d0'; for (var se = 0; se < 6; se++) { blob(c, x + (hash(se, 7) - 0.5) * w * 0.6, top + h * (0.25 + hash(se, 8) * 0.6), s * 0.022, s * 0.014); c.fill(); }
        c.strokeStyle = a.edge; c.beginPath(); c.moveTo(x - w * 0.4, top + h * 0.86); c.lineTo(x + w * 0.4, top + h * 0.86); c.stroke(); c.strokeStyle = INK;
        eyeY = top + h * 0.5; mouthY = top + h * 0.72; er = s * 0.1;
        break;
      case 'boba':
        // a tapioca pearl with its pink straw
        c.save(); c.translate(x + w * 0.2, top + h * 0.1); c.rotate(0.35);
        rrect(c, -s * 0.06, -s * 0.42, s * 0.12, s * 0.5, s * 0.05); c.fillStyle = '#ff8ac0'; c.fill(); c.lineWidth = lw * 0.7; c.stroke();
        c.restore(); c.lineWidth = lw;
        blob(c, x, top + h * 0.52, w * 0.56, h * 0.5); c.fillStyle = a.body; c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.5)'; blob(c, x - w * 0.25, top + h * 0.28, w * 0.14, h * 0.1); c.fill();
        break;
      default:
        // a marshmallow: a soft cylinder with its round top
        rrect(c, x - w / 2, top, w, h, w * 0.3); c.fillStyle = a.body; c.fill(); c.stroke();
        c.fillStyle = a.top; blob(c, x, top + h * 0.13, w * 0.42, h * 0.09); c.fill();
        c.fillStyle = a.edge; rrect(c, x - w / 2 + lw, top + h * 0.8, w - lw * 2, h * 0.14, h * 0.07); c.fill();
        if (a.crown) {
          c.beginPath(); c.moveTo(x - w * 0.28, top + h * 0.02); c.lineTo(x - w * 0.3, top - h * 0.22); c.lineTo(x - w * 0.14, top - h * 0.1);
          c.lineTo(x, top - h * 0.28); c.lineTo(x + w * 0.14, top - h * 0.1); c.lineTo(x + w * 0.3, top - h * 0.22); c.lineTo(x + w * 0.28, top + h * 0.02); c.closePath();
          c.fillStyle = '#ffe14f'; c.fill(); c.lineWidth = lw * 0.8; c.stroke(); c.lineWidth = lw;
          c.fillStyle = '#ff5fa2'; blob(c, x, top - h * 0.1, s * 0.035, s * 0.035); c.fill();
          var glint = (t * 1.3) % 3;
          if (glint < 1) { c.fillStyle = '#fff'; star(c, x + w * 0.3, top + h * (0.3 + glint * 0.3), s * 0.08, t * 3); c.fill(); }
        }
    }
    // face
    var e = o.eyes || [{ x: 0, y: 0 }, { x: 0, y: 0 }], mood = o.mood || 'happy';
    if (mood === 'zap') {
      c.lineWidth = lw * 0.9;
      for (var zx = -1; zx <= 1; zx += 2) { var ex = x + zx * w * 0.2; c.beginPath(); c.moveTo(ex - er * 0.7, eyeY - er * 0.6); c.lineTo(ex + er * 0.7, eyeY + er * 0.6); c.moveTo(ex + er * 0.7, eyeY - er * 0.6); c.lineTo(ex - er * 0.7, eyeY + er * 0.6); c.stroke(); }
    } else if (mood === 'sleep') {
      c.lineWidth = lw * 0.9;
      c.beginPath(); c.arc(x - w * 0.2, eyeY, er * 0.6, 0.15 * M.PI, 0.85 * M.PI); c.stroke();
      c.beginPath(); c.arc(x + w * 0.2, eyeY, er * 0.6, 0.15 * M.PI, 0.85 * M.PI); c.stroke();
    } else {
      googly(c, x - w * 0.2, eyeY, er * 1.08, e[0].x, e[0].y);
      googly(c, x + w * 0.2, eyeY - er * 0.08, er * 0.9, e[1].x, e[1].y);
    }
    if (a.shape !== 'boba') { c.fillStyle = 'rgba(255,120,160,0.45)'; blob(c, x - w * 0.34, mouthY - er * 0.2, w * 0.1, er * 0.4); c.fill(); blob(c, x + w * 0.34, mouthY - er * 0.2, w * 0.1, er * 0.4); c.fill(); }
    c.lineWidth = lw * 0.8;
    if (a.shape === 'duck') {
      c.beginPath(); c.ellipse(x + w * 0.04, mouthY, w * 0.2, er * (mood === 'wow' || mood === 'ouch' ? 0.75 : 0.5), 0, 0, TAU); c.fillStyle = '#ff8a2e'; c.fill(); c.stroke();
    } else if (mood === 'wow' || mood === 'ouch') {
      blob(c, x, mouthY + er * 0.2, w * 0.11, er * (mood === 'ouch' ? 0.45 : 0.7)); c.fillStyle = '#7a1f3d'; c.fill(); c.stroke();
    } else if (mood === 'zap') {
      c.beginPath(); for (var zz = 0; zz <= 6; zz++) c.lineTo(x - w * 0.18 + zz * w * 0.06, mouthY + (zz % 2 ? -1 : 1) * er * 0.25); c.stroke();
    } else {
      c.beginPath(); c.moveTo(x - w * 0.17, mouthY - er * 0.1); c.quadraticCurveTo(x, mouthY + er * 1.1, x + w * 0.17, mouthY - er * 0.1); c.closePath();
      c.fillStyle = '#7a1f3d'; c.fill(); c.stroke();
      c.fillStyle = '#ff7a9a'; blob(c, x, mouthY + er * 0.45, w * 0.06, er * 0.18); c.fill();
    }
  };

  /* ----------------------------------------------------------- the props */
  function pigeon(c, x, y, s, t, dir, dead) {
    c.save(); c.translate(x, y);
    if (dead) c.rotate(t * 12);
    c.scale(dir < 0 ? -1 : 1, 1);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = M.max(2, s * 0.06);
    var flap = M.sin(t * 16);
    // back wing
    c.fillStyle = '#7f8aa3';
    c.save(); c.translate(-s * 0.05, -s * 0.1); c.rotate(-0.6 - flap * 0.7); blob(c, -s * 0.3, 0, s * 0.34, s * 0.14); c.fill(); c.stroke(); c.restore();
    // body, belly, head
    blob(c, 0, 0, s * 0.5, s * 0.34); c.fillStyle = '#a3adc4'; c.fill(); c.stroke();
    c.fillStyle = '#c9d0e0'; blob(c, s * 0.12, s * 0.1, s * 0.28, s * 0.18); c.fill();
    c.fillStyle = '#7fd6c4'; blob(c, s * 0.32, -s * 0.12, s * 0.17, s * 0.15); c.fill();
    blob(c, s * 0.4, -s * 0.26, s * 0.24, s * 0.22); c.fillStyle = '#a3adc4'; c.fill(); c.stroke();
    // beak
    c.beginPath(); c.moveTo(s * 0.6, -s * 0.3); c.lineTo(s * 0.8, -s * 0.22); c.lineTo(s * 0.6, -s * 0.17); c.closePath(); c.fillStyle = '#ffa53d'; c.fill(); c.stroke();
    // grumpy face
    if (dead) {
      c.lineWidth = s * 0.04;
      c.beginPath(); c.moveTo(s * 0.38, -s * 0.36); c.lineTo(s * 0.5, -s * 0.26); c.moveTo(s * 0.5, -s * 0.36); c.lineTo(s * 0.38, -s * 0.26); c.stroke();
    } else {
      googly(c, s * 0.44, -s * 0.3, s * 0.09, 0.4, 0.3);
      c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(s * 0.32, -s * 0.46); c.lineTo(s * 0.56, -s * 0.38); c.stroke();
    }
    // feet
    c.strokeStyle = '#ff8a2e'; c.lineWidth = s * 0.05;
    c.beginPath(); c.moveTo(-s * 0.05, s * 0.3); c.lineTo(-s * 0.08, s * 0.44); c.moveTo(s * 0.1, s * 0.3); c.lineTo(s * 0.12, s * 0.44); c.stroke();
    c.strokeStyle = INK; c.lineWidth = M.max(2, s * 0.06);
    // front wing
    c.fillStyle = '#8f9ab3';
    c.save(); c.translate(-s * 0.02, -s * 0.06); c.rotate(-0.3 + flap * 0.8); blob(c, -s * 0.26, 0, s * 0.3, s * 0.13); c.fill(); c.stroke(); c.restore();
    c.restore();
  }
  function ufo(c, x, y, s, t, dead) {
    c.save(); c.translate(x, y);
    if (dead) c.rotate(t * 9);
    c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = M.max(2, s * 0.05);
    // dome with a little green pilot
    blob(c, 0, -s * 0.12, s * 0.32, s * 0.3); c.fillStyle = 'rgba(190,245,255,0.9)'; c.fill(); c.stroke();
    blob(c, 0, -s * 0.12, s * 0.16, s * 0.16); c.fillStyle = '#7dea6a'; c.fill(); c.lineWidth = s * 0.035; c.stroke();
    googly(c, -s * 0.06, -s * 0.15, s * 0.055, M.sin(t * 2), 0.3); googly(c, s * 0.07, -s * 0.15, s * 0.05, M.sin(t * 2), 0.3);
    c.beginPath(); c.moveTo(0, -s * 0.28); c.lineTo(0, -s * 0.4); c.stroke(); blob(c, 0, -s * 0.42, s * 0.035, s * 0.035); c.fillStyle = '#ff5fa2'; c.fill();
    c.lineWidth = M.max(2, s * 0.05);
    blob(c, 0, s * 0.06, s * 0.66, s * 0.18); c.fillStyle = '#c9d3ea'; c.fill(); c.stroke();
    c.fillStyle = '#9aa6c8'; blob(c, 0, s * 0.14, s * 0.4, s * 0.07); c.fill();
    for (var i = 0; i < 5; i++) { blob(c, (i - 2) * s * 0.24, s * 0.06, s * 0.045, s * 0.045); c.fillStyle = (M.floor(t * 6) + i) % 2 ? '#ffe14f' : '#ff5fa2'; c.fill(); }
    c.restore();
  }
  function power(c, kind, x, y, s, t) {
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 3;
    if (kind === 'balloon') {
      c.beginPath(); c.moveTo(x, y + s * 0.42); c.quadraticCurveTo(x + M.sin(t * 4) * 8, y + s * 0.8, x, y + s * 1.1); c.lineWidth = 2; c.stroke(); c.lineWidth = 3;
      blob(c, x, y, s * 0.36, s * 0.44); c.fillStyle = '#ff4f6d'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 5, y + s * 0.44); c.lineTo(x + 5, y + s * 0.44); c.lineTo(x, y + s * 0.38); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.75)'; blob(c, x - s * 0.13, y - s * 0.16, s * 0.07, s * 0.12); c.fill();
    } else if (kind === 'hat') {
      c.beginPath(); c.arc(x, y + s * 0.15, s * 0.34, M.PI, 0); c.closePath(); c.fillStyle = '#4f8dff'; c.fill(); c.stroke();
      rrect(c, x - s * 0.06, y + s * 0.1, s * 0.5, s * 0.1, s * 0.05); c.fillStyle = '#2f6fe0'; c.fill(); c.stroke();
      c.fillStyle = '#ffe14f'; c.beginPath(); c.arc(x, y - s * 0.07, s * 0.15, M.PI, 0); c.fill();
      c.beginPath(); c.moveTo(x, y - s * 0.2); c.lineTo(x, y - s * 0.34); c.stroke();
      var sp = M.cos(t * 30);
      c.fillStyle = '#ff4f6d'; blob(c, x - s * 0.22 * sp, y - s * 0.36, s * 0.24 * M.abs(sp) + 2, s * 0.06); c.fill(); c.stroke();
      c.fillStyle = '#ffe14f'; blob(c, x + s * 0.22 * sp, y - s * 0.36, s * 0.24 * M.abs(sp) + 2, s * 0.06); c.fill(); c.stroke();
    } else if (kind === 'rocket') {
      for (var k = -1; k <= 1; k += 2) {
        var sx = x + k * s * 0.18;
        c.beginPath(); c.moveTo(sx - s * 0.1, y - s * 0.35); c.lineTo(sx + s * 0.1, y - s * 0.35); c.lineTo(sx + s * 0.1, y + s * 0.05);
        c.quadraticCurveTo(sx + s * 0.1, y + s * 0.2, sx + k * s * 0.2, y + s * 0.2); c.quadraticCurveTo(sx - s * 0.1, y + s * 0.22, sx - s * 0.1, y + s * 0.05); c.closePath();
        c.fillStyle = '#ff4f6d'; c.fill(); c.stroke();
        c.fillStyle = '#fff'; c.fillRect(sx - s * 0.1, y - s * 0.24, s * 0.2, s * 0.07);
        c.fillStyle = M.floor(t * 12) % 2 ? '#ffe14f' : '#ff9a3d';
        c.beginPath(); c.moveTo(sx - s * 0.07, y + s * 0.22); c.lineTo(sx, y + s * (0.45 + 0.08 * M.sin(t * 30 + k))); c.lineTo(sx + s * 0.07, y + s * 0.22); c.closePath(); c.fill();
      }
    }
  }
  function goldStar(c, x, y, s, t) {
    var sc = 1 + M.sin(t * 5) * 0.08;
    star(c, x, y, s * sc, M.sin(t * 2) * 0.3); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)'; blob(c, x - s * 0.22, y - s * 0.2, s * 0.12, s * 0.08); c.fill();
    googly(c, x - s * 0.18, y + s * 0.02, s * 0.13, 0.2, 0.2); googly(c, x + s * 0.18, y + s * 0.02, s * 0.13, 0.2, 0.2);
  }
  function bubble(c, x, y, r, t) {
    var wob = M.sin(t * 7) * 0.04;
    blob(c, x, y, r * (1 + wob), r * (1 - wob)); c.fillStyle = 'rgba(170,230,255,0.28)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
    c.beginPath(); c.arc(x, y, r * 0.78, M.PI * 1.1, M.PI * 1.45); c.lineWidth = 6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)'; blob(c, x + r * 0.45, y - r * 0.45, r * 0.09, r * 0.09); c.fill();
  }
  function castle(c) {
    // The cloud castle, drawn once: towers, roofs, windows and a door (flags are live).
    c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 5;
    var body = '#ffc6e2', dark = '#f49cc8', roof = ['#8f7bff', '#ff6fa8', '#8f7bff'];
    rrect(c, -150, -190, 300, 200, 18); c.fillStyle = body; c.fill(); c.stroke();
    for (var i = 0; i < 3; i++) {
      var tx = [-170, 0, 170][i], th = [250, 310, 250][i], tw = [70, 90, 70][i];
      rrect(c, tx - tw / 2, -th, tw, th + 10, 12); c.fillStyle = i === 1 ? '#ffd8ec' : body; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(tx - tw / 2 - 12, -th + 4); c.quadraticCurveTo(tx, -th - 120, tx + tw / 2 + 12, -th + 4); c.closePath();
      c.fillStyle = roof[i]; c.fill(); c.stroke();
      rrect(c, tx - 13, -th + 40, 26, 36, 13); c.fillStyle = '#7fd8ff'; c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(tx - 8, -th + 46, 5, 14);
    }
    for (var b = 0; b < 6; b++) { c.fillStyle = dark; rrect(c, -140 + b * 50, -206, 30, 22, 6); c.fill(); c.stroke(); }
    c.beginPath(); c.moveTo(-40, 10); c.lineTo(-40, -70); c.quadraticCurveTo(0, -112, 40, -70); c.lineTo(40, 10); c.closePath();
    c.fillStyle = '#b5774a'; c.fill(); c.stroke();
    c.fillStyle = '#ffe14f'; blob(c, 24, -30, 5, 5); c.fill();
    // windows with faces
    for (var k = -1; k <= 1; k += 2) {
      rrect(c, k * 90 - 18, -150, 36, 40, 18); c.fillStyle = '#7fd8ff'; c.fill(); c.stroke();
    }
    c.lineWidth = 4;
    c.beginPath(); c.arc(-90, -128, 7, 0.15 * M.PI, 0.85 * M.PI); c.stroke(); c.beginPath(); c.arc(90, -128, 7, 0.15 * M.PI, 0.85 * M.PI); c.stroke();
  }

  /* ---------------------------------------------------------------- view */
  CH.createView = function (ctx) {
    var v = { calm: false, eyes: [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }], marshyAt: { x: 640, y: 500 }, debris: [] };
    v.setScale = function (k) { k = M.max(0.5, M.min(2, k)); if (M.abs(k - K) > 0.01) { K = k; cache = {}; cacheN = 0; } };
    v.warm = function (themes) {
      for (var i = 0; i < themes.length; i++) { skySprite(themes[i]); puffSprite(themes[i]); }
      for (var j = 0; j < 5; j++) candySprite(j);
    };
    function sky(theme, cam, alpha) {
      ctx.globalAlpha = alpha;
      put(ctx, skySprite(theme), 0, 0);
      var off = ((cam * 0.3) % TILE + TILE) % TILE, pf = puffSprite(theme);
      put(ctx, pf, 0, off - TILE); put(ctx, pf, 0, off);
      ctx.globalAlpha = 1;
    }
    v.sky = sky;
    function springEyes(dt, tx, ty) {
      for (var i = 0; i < 2; i++) {
        var e = v.eyes[i];
        e.vx += ((tx - e.x) * 120 - e.vx * 8) * dt; e.vy += ((ty - e.y) * 120 - e.vy * 8) * dt;
        e.x = M.max(-1, M.min(1, e.x + e.vx * dt)); e.y = M.max(-1, M.min(1, e.y + e.vy * dt));
      }
    }
    // Crumbs from a cookie cloud: a few pieces that tumble down (visual only).
    v.crumble = function (x, y, wd) {
      if (v.calm) return;
      for (var i = 0; i < 5; i++) {
        if (v.debris.length > 30) v.debris.shift();
        v.debris.push({ x: x + (i - 2) * wd * 0.2, y: y, vx: (i - 2) * 60 + (hash(i, y | 0) - 0.5) * 80, vy: 120 + hash(y | 0, i) * 160, r: hash(i, 9) * 6, s: wd * (0.12 + hash(i, 3) * 0.08), life: 1.4 });
      }
    };
    function face(c, x, y, kind, t, mx, my, hit) {
      // eyes that watch Marshy, and a mood for each cloud kind
      var dx = M.max(-1, M.min(1, (mx - x) / 300)), dy = M.max(-1, M.min(1, (my - y) / 300));
      var er = 7.5;
      if (kind === 'thunder') {
        googly(c, x - 15, y, er, dx, dy); googly(c, x + 15, y, er, dx, dy);
        c.lineWidth = 3.5; c.strokeStyle = INK;
        c.beginPath(); c.moveTo(x - 25, y - 13); c.lineTo(x - 8, y - 7); c.moveTo(x + 25, y - 13); c.lineTo(x + 8, y - 7); c.stroke();
        c.beginPath(); c.moveTo(x - 9, y + 15); c.quadraticCurveTo(x, y + 8, x + 9, y + 15); c.stroke();
        return;
      }
      if (hit < 0.35) {
        c.lineWidth = 3; c.strokeStyle = INK;
        c.beginPath(); c.moveTo(x - 20, y - 5); c.lineTo(x - 11, y); c.lineTo(x - 20, y + 5); c.moveTo(x + 20, y - 5); c.lineTo(x + 11, y); c.lineTo(x + 20, y + 5); c.stroke();
        blob(c, x, y + 12, 6, 7); c.fillStyle = '#7a1f3d'; c.fill(); c.stroke();
        return;
      }
      if (kind === 1 || kind === 'cookie') {
        googly(c, x - 14, y, er, dx, dy); googly(c, x + 14, y, er, dx, dy);
      } else {
        c.lineWidth = 3; c.strokeStyle = INK;
        c.beginPath(); c.arc(x - 14, y + 2, 5.5, M.PI * 1.15, M.PI * 1.85); c.stroke(); c.beginPath(); c.arc(x + 14, y + 2, 5.5, M.PI * 1.15, M.PI * 1.85); c.stroke();
      }
      c.fillStyle = 'rgba(255,120,170,0.5)'; blob(c, x - 25, y + 9, 6, 3.5); c.fill(); blob(c, x + 25, y + 9, 6, 3.5); c.fill();
      c.lineWidth = 3; c.strokeStyle = INK;
      if (kind === 'cookie') { c.beginPath(); for (var k = 0; k <= 4; k++) c.lineTo(x - 8 + k * 4, y + 12 + (k % 2 ? -2.5 : 2.5)); c.stroke(); }
      else if (kind === 3) { blob(c, x, y + 12, 4, 4.5); c.fillStyle = '#7a1f3d'; c.fill(); c.stroke(); }
      else { c.beginPath(); c.arc(x, y + 8, 6, 0.15 * M.PI, 0.85 * M.PI); c.stroke(); }
    }
    function platform(p, sx, sy, t, mx, my) {
      var hit = t - p.hitT, dip = 0, sqx = 1, sqy = 1;
      if (hit < 0.45 && !v.calm) { var e = M.exp(-hit * 9); dip = 9 * e * M.cos(hit * 22); sqx = 1 + 0.06 * e; sqy = 1 - 0.12 * e * M.cos(hit * 22); }
      var y = sy + dip;
      if (p.kind === 'cookie' && p.broken) {
        // a dotted ghost where it will grow back
        var gone = t - p.hitT;
        ctx.globalAlpha = M.min(0.45, gone * 0.4);
        ctx.setLineDash([8, 8]); ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
        blob(ctx, sx, sy + 8, p.w / 2, 18); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        return;
      }
      if (p.kind === 'jelly') { jelly(p, sx, sy, t, hit); return; }
      var s = platSprite(p.kind === 'castle' ? 'castle' : p.kind, p.w, p.rescue), q = s.w - 30;
      var grow = p.kind === 'cookie' && hit < 0.35 && p.hitT > 0 && t - p.hitT < 0.35 && p.regrown ? hit / 0.35 : 1;
      put(ctx, s, sx, y, p.w / q * sqx * grow, sqy * grow);
      if (p.kind === 'move' && !v.calm) wings(sx, y, p.w, t);
      else if (p.kind === 'move') wings(sx, y, p.w, 0.2);
      if (p.kind === 'tramp') tramp(p, sx, y, hit);
      if (p.kind === 'thunder') thunder(p, sx, y, t);
      if (p.rescue && hit < 1.2) { ctx.globalAlpha = M.max(0, 1 - hit / 1.2); ctx.fillStyle = '#fff'; for (var k = 0; k < 5; k++) { star(ctx, sx - p.w / 2 + p.w * (k + 0.5) / 5, y - 30 - hit * 40 - (k % 2) * 14, 9, k); ctx.fill(); } ctx.globalAlpha = 1; }
      if (p.face && p.kind !== 'ground') face(ctx, sx + (p.kind === 'cookie' ? 0 : -p.w * 0.06), y + 10, p.kind === 'thunder' || p.kind === 'cookie' ? p.kind : p.face, t, mx, my, hit);
    }
    function wings(x, y, wd, t) {
      var f = M.sin(t * 14) * 0.6;
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.fillStyle = '#fff';
      for (var k = -1; k <= 1; k += 2) {
        ctx.save(); ctx.translate(x + k * (wd / 2 + 4), y + 2); ctx.scale(k, 1); ctx.rotate(-0.5 - f);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(22, -24, 34, -8); ctx.quadraticCurveTo(26, -2, 30, 6); ctx.quadraticCurveTo(14, 6, 0, 0); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    function tramp(p, x, y, hit) {
      var push = hit < 0.4 && !v.calm ? 14 * M.exp(-hit * 8) * M.cos(hit * 24) : 0, hw = p.w * 0.36;
      ctx.lineWidth = 4; ctx.strokeStyle = INK;
      // springs
      for (var k = -1; k <= 1; k += 2) {
        ctx.beginPath(); ctx.moveTo(x + k * hw, y - 18); for (var z = 0; z < 4; z++) ctx.lineTo(x + k * hw + (z % 2 ? 7 : -7), y - 14 + z * 4); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(x - hw - 10, y - 18); ctx.quadraticCurveTo(x, y - 18 + push * 2, x + hw + 10, y - 18);
      ctx.lineTo(x + hw + 10, y - 30); ctx.quadraticCurveTo(x, y - 30 + push * 2, x - hw - 10, y - 30); ctx.closePath();
      ctx.fillStyle = '#ff4f6d'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      for (var s = 0; s < 4; s++) { var sx = x - hw + (s + 0.25) * hw / 2; ctx.fillRect(sx, y - 28 + push * 1.6, hw / 4.5, 8); }
    }
    function jelly(p, x, y, t, hit) {
      var wob = hit < 1.2 && !v.calm ? M.exp(-hit * 3.5) * M.sin(hit * 26) : 0, idle = v.calm ? 0 : M.sin(t * 3 + p.id) * 0.02;
      var w = p.w * (1 + wob * 0.18 + idle), h = 46 * (1 - wob * 0.25 - idle);
      ctx.lineJoin = 'round'; ctx.lineWidth = 4.5; ctx.strokeStyle = INK;
      rrect(ctx, x - w / 2, y - 14 - h * 0.35, w, h, 16); ctx.fillStyle = 'rgba(110,232,150,0.88)'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; rrect(ctx, x - w * 0.42, y - 8 - h * 0.35, w * 0.16, h * 0.4, 6); ctx.fill();
      ctx.fillStyle = 'rgba(40,160,90,0.35)'; rrect(ctx, x - w / 2 + 6, y - 14 + h * 0.4, w - 12, h * 0.22, 8); ctx.fill();
      googly(ctx, x - 14, y - 6, 7, 0, M.sin(t * 4) * 0.5); googly(ctx, x + 14, y - 6, 7, 0, M.sin(t * 4) * 0.5);
      ctx.beginPath(); ctx.arc(x, y + 2, 7, 0.1 * M.PI, 0.9 * M.PI); ctx.lineWidth = 3; ctx.stroke();
    }
    function thunder(p, x, y, t) {
      var ph = CH.thunderPhase(p, t), on = CH.charged(p, t), warn = !on && ph > CH.THUNDER - 1.55;
      if (on) {
        ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.fillStyle = '#ffe14f';
        for (var k = -1; k <= 1; k++) {
          var bx = x + k * p.w * 0.28, f = M.floor(t * 12 + k) % 2;
          ctx.beginPath(); ctx.moveTo(bx, y + 24); ctx.lineTo(bx - 12 + f * 4, y + 50); ctx.lineTo(bx - 2, y + 50); ctx.lineTo(bx - 10, y + 78); ctx.lineTo(bx + 12, y + 44); ctx.lineTo(bx + 1, y + 44); ctx.lineTo(bx + 9, y + 24); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        if (M.floor(t * 14) % 2) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff38a'; blob(ctx, x, y + 2, p.w * 0.6, 34); ctx.fill(); ctx.globalAlpha = 1; }
      } else if (warn && M.floor(t * 10) % 2) {
        ctx.fillStyle = '#ffe14f';
        for (var s = 0; s < 3; s++) { star(ctx, x - p.w * 0.3 + s * p.w * 0.3, y - 26 - (s % 2) * 8, 7, t * 4); ctx.fill(); }
      }
    }
    function castleAt(p, x, y, t, w) {
      var s = sprite('castle', 520, 460, 260, 430, castle);
      put(ctx, s, x, y - 16);
      // waving flags on the towers
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      var tops = [[-170, -386], [0, -446], [170, -386]];
      for (var i = 0; i < 3; i++) {
        var fx = x + tops[i][0], fy = y - 16 + tops[i][1], wave = v.calm ? 0 : M.sin(t * 6 + i) * 6;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 46); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fx, fy - 46); ctx.quadraticCurveTo(fx + 22, fy - 52 + wave, fx + 44, fy - 40 + wave); ctx.lineTo(fx, fy - 28); ctx.closePath();
        ctx.fillStyle = ['#ffe14f', '#4fe0b0', '#ffe14f'][i]; ctx.fill(); ctx.stroke();
      }
      // the sign: قلعة الغيوم (it fades out as the «وصلت!» banner pops up in its place)
      var sy = y - 16 - 250, a = w.won ? 1 - w.pt / 0.2 : 1;
      if (a <= 0) return;
      ctx.globalAlpha = a;
      rrect(ctx, x - 112, sy - 26, 224, 52, 26); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
      ctx.font = '700 30px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      ctx.fillStyle = '#ff4f9a'; ctx.fillText('قلعة الغيوم', x, sy + 2);
      ctx.direction = 'ltr'; ctx.globalAlpha = 1;
    }
    function drawMarshy(w, o, sx, sy, t, dt) {
      var m = w.m, since = w.t - m.land, s = 70;
      var sq = 0;
      if (w.phase === 'squat') sq = -0.32 * M.min(1, w.pt / CH.SQUAT) + (v.calm ? 0 : M.sin(w.pt * 40) * 0.02);
      else if (since < 0.16) sq = -0.3 * (1 - since / 0.16);
      else if (m.vy > 0) sq = M.min(0.28, m.vy / 4200);
      else sq = M.max(-0.06, m.vy / 9000);
      if (v.calm) sq *= 0.4;
      var mood = m.zap > 0 ? 'zap' : m.inv > 0.6 && w.phase === 'play' && w.bonks ? 'ouch' : m.vy < -700 || w.phase === 'fell' ? 'wow' : 'happy';
      var arms = m.power ? 1 : m.vy > 0 ? 0.9 : 0.2;
      springEyes(dt, -m.vx / CH.VX * 0.7, m.vy > 0 ? 0.5 : -0.6);
      var flick = m.inv > 0 && w.phase === 'play' && M.floor(t * 16) % 2 === 0;
      for (var copy = -1; copy <= 1; copy++) {
        var x = sx + copy * W;
        if (x < -100 || x > W + 100) continue;
        // speed lines on big boings
        if (m.vy > 1050 && !v.calm) {
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath();
          for (var k = 0; k < 5; k++) { var lx = x + (k - 2) * 15, len = 30 + (m.vy - 1000) * 0.06 + (k % 2) * 20; ctx.moveTo(lx, sy + 12 + (k % 2) * 10); ctx.lineTo(lx, sy + 12 + len); }
          ctx.stroke();
        }
        if (m.power === 'rocket' && !v.calm) {
          ctx.fillStyle = M.floor(t * 20) % 2 ? '#ffe14f' : '#ff9a3d';
          for (var f2 = -1; f2 <= 1; f2 += 2) { ctx.beginPath(); ctx.moveTo(x + f2 * 16 - 9, sy); ctx.lineTo(x + f2 * 16, sy + 40 + M.sin(t * 40 + f2) * 10); ctx.lineTo(x + f2 * 16 + 9, sy); ctx.closePath(); ctx.fill(); }
        }
        if (m.power === 'balloon') {
          var bx = x + 34, by = sy - s - 70 + M.sin(t * 5) * 4;
          ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 22, sy - s * 0.6); ctx.lineTo(bx, by + 30); ctx.stroke();
          power(ctx, 'balloon', bx, by, 74, t);
        }
        if (flick) ctx.globalAlpha = 0.4;
        CH.drawChar(ctx, o.char, x, sy, s, { t: t, sq: sq, eyes: v.eyes, mood: mood, arms: arms });
        ctx.globalAlpha = 1;
        if (m.power === 'hat') power(ctx, 'hat', x, sy - s * (1 + M.max(0, sq)) - 4, 56, t);
        if (m.power === 'rocket') power(ctx, 'rocket', x, sy - 4, 34, t);
        if (m.zap > 0 && !v.calm) {
          ctx.strokeStyle = '#ffe14f'; ctx.lineWidth = 4;
          for (var z = 0; z < 4; z++) { var za = t * 20 + z * 1.6; ctx.beginPath(); ctx.moveTo(x + M.cos(za) * 40, sy - 36 + M.sin(za) * 40); ctx.lineTo(x + M.cos(za) * 54, sy - 36 + M.sin(za) * 54 + 8); ctx.stroke(); }
        }
        if (m.inv > 0.5 && w.bonks && mood === 'ouch' && !v.calm) {
          for (var d = 0; d < 3; d++) { var da = t * 7 + d * 2.1; ctx.fillStyle = '#ffe14f'; star(ctx, x + M.cos(da) * 30, sy - s - 14 + M.sin(da) * 8, 8, da); ctx.fill(); }
        }
      }
      v.marshyAt.x = sx; v.marshyAt.y = sy - s * 0.6;
    }
    // w: the world; o: { t, dt, char, theme, theme2, mix }
    v.render = function (w, o) {
      var t = w.t, cam = w.cam, m = w.m, dt = o.dt || 0;
      var Y = function (y) { return H - (y - cam); };
      sky(o.theme, cam, 1);
      if (o.mix > 0) sky(o.theme2, cam, o.mix);
      var mx = m.x, my = Y(m.y + 32);
      // UFO beams behind everything
      var i, f;
      for (i = 0; i < w.foes.length; i++) {
        f = w.foes[i];
        if (f.kind !== 'ufo' || f.dead || f.flee || !CH.beamOn(f, t)) continue;
        var uy = Y(f.y);
        if (uy < -60 || uy > H + 300) continue;
        ctx.fillStyle = 'rgba(140,255,110,0.3)';
        ctx.beginPath(); ctx.moveTo(f.x - 30, uy + 14); ctx.lineTo(f.x + 30, uy + 14); ctx.lineTo(f.x + 46 + 280 * 0.36, uy + 280); ctx.lineTo(f.x - 46 - 280 * 0.36, uy + 280); ctx.closePath(); ctx.fill();
      }
      // platforms, the castle building first
      for (i = 0; i < w.plats.length; i++) {
        var p = w.plats[i], sy = Y(p.y);
        if (sy < -80 || sy > H + 60) { if (!(p.kind === 'castle' && sy > -80 && sy < H + 520)) continue; }
        if (p.kind === 'castle') { castleAt(p, p.x, sy, t, w); }
      }
      for (i = 0; i < w.plats.length; i++) {
        var q = w.plats[i], qy = Y(q.y);
        if (qy < -80 || qy > H + 70) continue;
        platform(q, q.kind === 'ground' || q.kind === 'castle' ? W / 2 : q.x, qy, t, mx, my);
      }
      // crumbs
      for (i = v.debris.length - 1; i >= 0; i--) {
        var d = v.debris[i];
        d.life -= dt; d.vy -= 1400 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += dt * 6;
        if (d.life <= 0) { v.debris.splice(i, 1); continue; }
        ctx.save(); ctx.translate(d.x, Y(d.y)); ctx.rotate(d.r);
        blob(ctx, 0, 0, d.s, d.s * 0.7); ctx.fillStyle = '#e6a250'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = '#6b3a1f'; blob(ctx, d.s * 0.2, -d.s * 0.1, 3, 2.5); ctx.fill();
        ctx.restore();
      }
      // candies and power-ups
      for (i = 0; i < w.items.length; i++) {
        var it = w.items[i];
        if (it.got) continue;
        var iy = Y(it.y);
        if (iy < -60 || iy > H + 60) continue;
        var bob = v.calm ? 0 : M.sin(t * 3 + it.ph) * 5;
        if (it.kind === 'candy') {
          ctx.save(); ctx.translate(it.x, iy + bob); ctx.rotate(v.calm ? 0 : M.sin(t * 2 + it.ph) * 0.35);
          put(ctx, candySprite(M.floor(it.ph * 10) % 5), 0, 0, 0.9, 0.9);
          ctx.restore();
        } else if (it.kind === 'star') goldStar(ctx, it.x, iy + bob, 28, t);
        else {
          ctx.fillStyle = 'rgba(255,255,255,0.4)'; blob(ctx, it.x, iy + bob, 40 + (v.calm ? 0 : M.sin(t * 6) * 4), 40); ctx.fill();
          power(ctx, it.kind, it.x, iy + bob - (it.kind === 'balloon' ? 8 : 0), it.kind === 'rocket' ? 50 : 62, t);
        }
      }
      // foes
      for (i = 0; i < w.foes.length; i++) {
        f = w.foes[i];
        var fy = Y(f.y);
        if (fy < -80 || fy > H + 80 || (f.dead && f.dt > 1.6)) continue;
        if (f.flee) ctx.globalAlpha = M.max(0, 1 - f.dt / 1.4);
        for (var c2 = -1; c2 <= 1; c2++) {
          var fx = f.x + c2 * W;
          if (fx < -90 || fx > W + 90) continue;
          if (f.kind === 'pigeon') pigeon(ctx, fx, fy, 76, t + f.ph, f.vx, f.dead);
          else ufo(ctx, fx, fy + (v.calm ? 0 : M.sin(t * 3 + f.ph) * 4), 96, t, f.dead);
        }
        ctx.globalAlpha = 1;
      }
      // Marshy (in a bubble while being rescued)
      var msy = Y(m.y);
      if (w.phase === 'rescue') {
        drawMarshy(w, o, m.x, msy, t, dt);
        bubble(ctx, m.x, msy - 36, 62, t);
      } else drawMarshy(w, o, m.x, msy, t, dt);
    };
    // The title scene: a sky, a few clouds and a big Marshy bouncing on its cloud.
    v.title = function (o) {
      var t = o.t;
      sky(0, t * 40 * (v.calm ? 0 : 1), 1);
      var cs = [[150, 600, 230, 1], [440, 650, 170, 0], [1170, 560, 200, 2], [640, 700, 260, 0]];
      for (var i = 0; i < cs.length; i++) put(ctx, platSprite('cloud', cs[i][2]), cs[i][0], cs[i][1] + (v.calm ? 0 : M.sin(t * 1.3 + i) * 5));
      for (var k = 0; k < cs.length; k++) if (cs[k][3]) face(ctx, cs[k][0] - 12, cs[k][1] + 10 + (v.calm ? 0 : M.sin(t * 1.3 + k) * 5), cs[k][3], t, 900, 300, 9);
      // Marshy's bounce on its own cloud
      var period = 1.05, ph = v.calm ? 0.5 : (t % period) / period, hgt = 4 * ph * (1 - ph) * 210;
      var cx = 905, cy = 520, since = ph * period, sq = since < 0.1 ? -0.3 * (1 - since / 0.1) : ph < 0.5 ? 0.18 * (1 - ph * 2) : -0.04;
      var hit = v.calm ? 9 : since;
      put(ctx, platSprite('cloud', 250), cx, cy + (hit < 0.3 ? 6 * M.exp(-hit * 10) : 0));
      springEyes(o.dt || 0, M.sin(t * 1.7) * 0.6, ph < 0.5 ? 0.5 : -0.5);
      CH.drawChar(ctx, o.char, cx, cy - hgt, 150, { t: t, sq: v.calm ? 0 : sq, eyes: v.eyes, mood: ph > 0.45 && ph < 0.6 ? 'wow' : 'happy', arms: ph < 0.5 ? 0.9 : 0.3 });
      // candies circling for flavour
      for (var c = 0; c < 5; c++) {
        var a = t * (v.calm ? 0 : 1.2) + c * TAU / 5;
        ctx.save(); ctx.translate(cx + M.cos(a) * 150, 300 + M.sin(a) * 40); put(ctx, candySprite(c), 0, 0, 0.9, 0.9); ctx.restore();
      }
    };
    return v;
  };
})();
