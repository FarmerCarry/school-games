/* Desk Karts (سباق المكاتب) art: procedural 2D tabletop illustrations & micro-karts.
 * Static world tabletops, closed racing circuits, curbs, boosts, puddles and magnets are
 * rendered once into an offscreen canvas (A.track) and blitted each frame for 60 FPS speed.
 * Dynamic glow sprites use cached radial gradients (never shadowBlur). */
(function () {
  'use strict';
  var DK = window.DK, W = DK.W, H = DK.H, TAU = Math.PI * 2;
  var A = DK.art = {};
  var INK = A.INK = '#141a44';
  var cache = {}, tracks = {};

  A.reset = function () { cache = {}; tracks = {}; };

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  A.rgba = rgba;

  function seeded(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  A.rr = function (g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  A.circle = function (g, x, y, r) {
    g.beginPath();
    g.arc(x, y, Math.max(0.1, r), 0, TAU);
  };

  A.star = function (g, x, y, r, ri, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 ? ri : r;
      if (!i) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  };

  // Text with crisp dark outline; Arabic is always drawn right-to-left as one joined string.
  A.text = function (g, s, x, y, size, color, o) {
    o = o || {};
    s = String(s);
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    g.direction = /[\u0600-\u06FF]/.test(s) ? 'rtl' : 'ltr';
    if (o.stroke !== false) {
      g.lineJoin = 'round';
      g.lineWidth = o.lw || Math.max(4, size * 0.22);
      g.strokeStyle = o.stroke || INK;
      g.strokeText(s, x, y);
    }
    g.fillStyle = color || '#ffffff';
    g.fillText(s, x, y);
    g.direction = 'ltr';
  };

  /* --------------------------------------------------- cached soft glows */
  A.glowSprite = function (color) {
    var key = 'glow' + color;
    if (!cache[key]) {
      var c = canvas(128, 128), g = c.getContext('2d');
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, rgba(color, 0.88));
      gr.addColorStop(0.28, rgba(color, 0.42));
      gr.addColorStop(0.65, rgba(color, 0.1));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      cache[key] = c;
    }
    return cache[key];
  };

  A.glow = function (g, x, y, r, color, alpha) {
    var op = g.globalCompositeOperation, ga = g.globalAlpha;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = ga * (alpha == null ? 1 : alpha);
    g.drawImage(A.glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalCompositeOperation = op;
    g.globalAlpha = ga;
  };

  /* --------------------------------------------------- 4 tabletop worlds */
  function drawPencilProp(g, x, y, len, ang, bodyCol) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    // Drop shadow
    A.rr(g, -len / 2 + 3, -9 + 4, len, 18, 5);
    g.fillStyle = 'rgba(20,26,68,0.22)';
    g.fill();
    // Eraser end
    A.rr(g, -len / 2, -9, 26, 18, 6);
    g.fillStyle = '#ff7597';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    // Silver ferrule
    g.fillStyle = '#dce2f0';
    g.fillRect(-len / 2 + 20, -9, 10, 18);
    g.strokeRect(-len / 2 + 20, -9, 10, 18);
    // Wooden shaft
    g.fillStyle = bodyCol || '#ffd166';
    g.fillRect(-len / 2 + 30, -9, len - 54, 18);
    g.strokeRect(-len / 2 + 30, -9, len - 54, 18);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(-len / 2 + 32, -6, len - 58, 5);
    // Sharpened cone + graphite tip
    g.beginPath();
    g.moveTo(len / 2 - 24, -9);
    g.lineTo(len / 2 + 4, 0);
    g.lineTo(len / 2 - 24, 9);
    g.closePath();
    g.fillStyle = '#f3cfa4';
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(len / 2 - 6, -3.2);
    g.lineTo(len / 2 + 4, 0);
    g.lineTo(len / 2 - 6, 3.2);
    g.closePath();
    g.fillStyle = '#2b2d42';
    g.fill();
    g.restore();
  }

  function drawPaperclip(g, x, y, ang, col) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.lineCap = 'round';
    g.lineWidth = 4.5;
    g.strokeStyle = col;
    A.rr(g, -18, -8, 36, 16, 8);
    g.stroke();
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.moveTo(-10, -4);
    g.lineTo(10, -4);
    g.stroke();
    g.restore();
  }

  function background(g, wd, seed) {
    var rnd = seeded(seed), i;
    var gr = g.createLinearGradient(0, 0, W * 0.35, H);
    gr.addColorStop(0, wd.bg0);
    gr.addColorStop(1, wd.bg1);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);

    if (wd.theme === 'desk') {
      // Warm honey-oak wooden planks & subtle grain waves
      for (var py = 0; py < H; py += 90) {
        g.fillStyle = (py / 90) % 2 ? 'rgba(255,235,195,0.06)' : 'rgba(70,35,8,0.06)';
        g.fillRect(0, py, W, 90);
        g.beginPath();
        g.moveTo(0, py);
        g.lineTo(W, py);
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(92,48,14,0.22)';
        g.stroke();
      }
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(110,58,18,0.13)';
      for (i = 0; i < 28; i++) {
        var gx = rnd() * W, gy = rnd() * H, gw = 90 + rnd() * 180;
        g.beginPath();
        g.moveTo(gx, gy);
        g.quadraticCurveTo(gx + gw * 0.5, gy + (rnd() - 0.5) * 14, gx + gw, gy);
        g.stroke();
      }
      // Lined notebook sheet tucked into bottom-right corner
      g.save();
      g.translate(1150, 645);
      g.rotate(-0.14);
      A.rr(g, -135, -95, 250, 180, 12);
      g.fillStyle = '#fffdf7';
      g.fill();
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 1.6;
      g.strokeStyle = '#90caf9';
      for (var ly = -65; ly <= 65; ly += 20) {
        g.beginPath();
        g.moveTo(-125, ly);
        g.lineTo(105, ly);
        g.stroke();
      }
      g.strokeStyle = '#ff6b8b';
      g.beginPath();
      g.moveTo(72, -90);
      g.lineTo(72, 80);
      g.stroke();
      g.restore();

      drawPencilProp(g, 240, 684, 185, 0.04, '#ffd166');
      drawPencilProp(g, 1105, 44, 195, -0.06, '#4cc9f0');
      drawPaperclip(g, 74, 676, 0.4, '#ff5d9e');
      drawPaperclip(g, 118, 690, -0.25, '#ffd166');
    } else if (wd.theme === 'art') {
      // Teal craft cutting mat with crisp grid & paint splashes
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      for (var x = 0; x <= W; x += 40) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
      for (var y = 0; y <= H; y += 40) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 2.5;
      g.strokeRect(18, 18, W - 36, H - 36);
      var cols = ['#ff5d9e', '#ffd23f', '#8dff5a', '#a855f7', '#ff9f1c'];
      for (i = 0; i < 16; i++) {
        var sx = 50 + rnd() * (W - 100), sy = 40 + rnd() * (H - 80), sr = 12 + rnd() * 24;
        var sc = cols[i % cols.length];
        g.fillStyle = rgba(sc, 0.25);
        A.circle(g, sx, sy, sr);
        g.fill();
        for (var d = 0; d < 4; d++) {
          var da = rnd() * TAU, dr = sr + 5 + rnd() * 12;
          A.circle(g, sx + Math.cos(da) * dr, sy + Math.sin(da) * dr, 3 + rnd() * 4);
          g.fill();
        }
      }
      // Mini artist palette in corner
      g.save();
      g.translate(92, 658);
      g.rotate(-0.2);
      A.circle(g, 0, 0, 44);
      g.fillStyle = '#f4d5a6';
      g.fill();
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.stroke();
      A.circle(g, 16, 14, 9);
      g.fillStyle = wd.bg1;
      g.fill();
      g.stroke();
      [[-18, -16, '#ff5d9e'], [4, -22, '#ffd23f'], [-22, 8, '#3df0ff'], [-4, 22, '#8dff5a']].forEach(function (d0) {
        A.circle(g, d0[0], d0[1], 7.5);
        g.fillStyle = d0[2];
        g.fill();
      });
      g.restore();
      drawPencilProp(g, 1125, 44, 185, -0.05, '#ff5d9e');
    } else if (wd.theme === 'cafe') {
      // Molded cafeteria tray rim & recessed compartments
      A.rr(g, 16, 16, W - 32, H - 32, 38);
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(255,240,215,0.32)';
      g.stroke();
      var trays = [[42, 92, 360, 260], [420, 92, 440, 260], [880, 92, 358, 260], [42, 372, 580, 312], [642, 372, 596, 312]];
      trays.forEach(function (t0) {
        A.rr(g, t0[0], t0[1], t0[2], t0[3], 28);
        g.fillStyle = 'rgba(120,48,12,0.1)';
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,235,205,0.2)';
        g.stroke();
      });
      // Checkered diner napkin in corner
      g.save();
      g.translate(92, 658);
      g.rotate(0.18);
      A.rr(g, -60, -50, 120, 100, 10);
      g.fillStyle = '#ffffff';
      g.fill();
      g.clip();
      g.fillStyle = '#ff595e';
      for (var nx = -60; nx < 60; nx += 20) {
        for (var ny = -50; ny < 50; ny += 20) {
          if (((nx + ny) / 20) & 1) g.fillRect(nx, ny, 20, 20);
        }
      }
      g.restore();
      g.save();
      g.translate(92, 658);
      g.rotate(0.18);
      A.rr(g, -60, -50, 120, 100, 10);
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.stroke();
      g.restore();
    } else {
      // Science lab midnight neon blueprint & circuit traces
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(61,240,255,0.1)';
      for (var lx = 0; lx <= W; lx += 40) {
        g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx, H); g.stroke();
      }
      for (var ly2 = 0; ly2 <= H; ly2 += 40) {
        g.beginPath(); g.moveTo(0, ly2); g.lineTo(W, ly2); g.stroke();
      }
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (i = 0; i < 34; i++) {
        var cx = Math.round(rnd() * 30) * 40, cy = Math.round(rnd() * 17) * 40;
        var cl = 40 + Math.round(rnd() * 3) * 40, horiz = rnd() < 0.5;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(horiz ? cx + cl : cx, horiz ? cy : cy + cl);
        g.lineWidth = 3;
        g.strokeStyle = rgba(i % 2 ? '#3df0ff' : '#c77dff', 0.14);
        g.stroke();
        A.circle(g, cx, cy, 4.5);
        g.fillStyle = rgba('#3df0ff', 0.22);
        g.fill();
      }
      for (i = 0; i < 45; i++) {
        A.circle(g, rnd() * W, rnd() * H, 1 + rnd() * 1.8);
        g.fillStyle = 'rgba(255,255,255,' + (0.12 + rnd() * 0.24).toFixed(2) + ')';
        g.fill();
      }
    }

    // Gentle vignette so the central tabletop track pops
    var vig = g.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, W * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(8,12,34,0.32)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
  }

  /* --------------------------------------------------- closed track art */
  function loopPath(g, L) {
    var pts = L.pts;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
  }

  function strokeLoop(g, L, grow) {
    var baseW = L.pts[0].hw * 2;
    loopPath(g, L);
    g.lineWidth = Math.max(2, baseW + grow);
    g.stroke();
  }

  function drawBoostPad(g, bst) {
    g.save();
    g.translate(bst.x, bst.y);
    g.rotate(Math.atan2(bst.ty, bst.tx));
    var len = bst.len, w = bst.w;
    A.rr(g, -len / 2, -w / 2, len, w, 8);
    if (bst.kind === 'ruler') {
      g.fillStyle = '#ffd166';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#9c5700';
      g.stroke();
      // Ruler cm ticks along top edge
      g.beginPath();
      for (var rx = -len / 2 + 8; rx <= len / 2 - 8; rx += 8) {
        g.moveTo(rx, -w / 2);
        g.lineTo(rx, -w / 2 + (rx % 16 === 0 ? 8 : 5));
      }
      g.lineWidth = 2;
      g.strokeStyle = '#7a4100';
      g.stroke();
    } else if (bst.kind === 'rainbow') {
      g.save();
      g.clip();
      var stripes = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#3ddc84', '#3df0ff'];
      var sh = w / stripes.length;
      for (var si = 0; si < stripes.length; si++) {
        g.fillStyle = stripes[si];
        g.fillRect(-len / 2, -w / 2 + si * sh, len, sh + 1);
      }
      g.restore();
      A.rr(g, -len / 2, -w / 2, len, w, 8);
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.stroke();
    } else if (bst.kind === 'waffle') {
      g.fillStyle = '#f4a236';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#8c4a08';
      g.stroke();
      g.fillStyle = '#c97218';
      for (var wx = -len / 2 + 8; wx < len / 2 - 8; wx += 12) {
        for (var wy = -w / 2 + 5; wy < w / 2 - 5; wy += 10) {
          g.fillRect(wx, wy, 7, 6);
        }
      }
    } else {
      g.fillStyle = '#12295e';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#3df0ff';
      g.stroke();
    }
    // Bright forward speed chevrons
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (var cx = -len * 0.28; cx <= len * 0.28; cx += len * 0.28) {
      g.beginPath();
      g.moveTo(cx - 7, -w * 0.26);
      g.lineTo(cx + 6, 0);
      g.lineTo(cx - 7, w * 0.26);
      g.lineWidth = 5.5;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = bst.kind === 'neon' ? '#3df0ff' : '#ffffff';
      g.stroke();
    }
    g.restore();
  }

  function drawHazardPuddle(g, hz) {
    g.save();
    g.translate(hz.x, hz.y);
    var r = hz.r;
    var fill = hz.kind === 'glue' ? '#f6f8ff' : hz.kind === 'paint' ? '#c77dff' : '#ffd23f';
    var rim = hz.kind === 'glue' ? '#b8c4e0' : hz.kind === 'paint' ? '#7b2cbf' : '#d48c00';
    // Organic splat blob using overlapping circles
    var blobs = [[0, 0, r * 0.92], [r * 0.42, -r * 0.22, r * 0.56], [-r * 0.44, r * 0.2, r * 0.58], [r * 0.15, r * 0.44, r * 0.5], [-r * 0.25, -r * 0.4, r * 0.46]];
    g.fillStyle = rim;
    blobs.forEach(function (b) { A.circle(g, b[0], b[1] + 2, b[2] + 2.5); g.fill(); });
    g.fillStyle = fill;
    blobs.forEach(function (b) { A.circle(g, b[0], b[1], b[2]); g.fill(); });
    if (hz.kind === 'butter') {
      // Cute pat of butter square in center
      g.rotate(0.25);
      A.rr(g, -9, -7, 18, 14, 3);
      g.fillStyle = '#fff3b0';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#d48c00';
      g.stroke();
    } else {
      // Glossy wet highlight
      A.circle(g, -r * 0.24, -r * 0.22, r * 0.24);
      g.fillStyle = 'rgba(255,255,255,0.65)';
      g.fill();
    }
    g.restore();
  }

  function drawMagnetProp(g, mg) {
    g.save();
    g.translate(mg.x, mg.y);
    g.rotate(mg.ang);
    // U-shaped red/silver lab magnet pointing toward track
    g.lineCap = 'butt';
    g.beginPath();
    g.arc(0, 0, 15, Math.PI * 0.5, Math.PI * 1.5);
    g.moveTo(0, -15); g.lineTo(14, -15);
    g.moveTo(0, 15); g.lineTo(14, 15);
    g.lineWidth = 13;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = 8;
    g.strokeStyle = '#ff4d6d';
    g.stroke();
    // Silver pole tips
    g.fillStyle = '#e2e8f0';
    g.fillRect(7, -19, 8, 8);
    g.fillRect(7, 11, 8, 8);
    // Faint magnetic wave arcs
    g.lineCap = 'round';
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(61,240,255,0.45)';
    for (var r = 24; r <= 38; r += 7) {
      g.beginPath();
      g.arc(10, 0, r, -0.55, 0.55);
      g.stroke();
    }
    g.restore();
  }

  function drawStartLine(g, L) {
    var st = L.cps[0];
    g.save();
    g.translate(st.x, st.y);
    g.rotate(Math.atan2(st.ty, st.tx));
    var hw = st.hw - 3, sq = 11, rows = Math.floor((hw * 2) / sq);
    var y0 = -rows * sq * 0.5;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < 2; c++) {
        g.fillStyle = (r + c) % 2 ? '#141a44' : '#ffffff';
        g.fillRect(-sq + c * sq, y0 + r * sq, sq, sq);
      }
    }
    g.lineWidth = 2.5;
    g.strokeStyle = INK;
    g.strokeRect(-sq, y0, sq * 2, rows * sq);

    // Clear forward direction arrow just ahead of start line
    g.beginPath();
    g.moveTo(22, -16);
    g.lineTo(40, 0);
    g.lineTo(22, 16);
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,210,63,0.85)';
    g.stroke();
    g.restore();
  }

  function drawTrack(g, L, wd) {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // Tabletop drop shadow + chunky outer ink border + alternating racing curbs
    g.strokeStyle = 'rgba(10,14,38,0.34)';
    strokeLoop(g, L, 32);
    g.strokeStyle = INK;
    strokeLoop(g, L, 18);
    g.strokeStyle = wd.curbB;
    strokeLoop(g, L, 10);
    g.save();
    g.lineCap = 'butt';
    g.setLineDash([22, 22]);
    g.strokeStyle = wd.curbA;
    strokeLoop(g, L, 10);
    g.restore();
    // Inner curb ink seam + high-contrast road asphalt
    g.strokeStyle = INK;
    strokeLoop(g, L, 2);
    g.strokeStyle = wd.road;
    strokeLoop(g, L, 0);
    // Subtle inner racing groove
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    strokeLoop(g, L, -20);
    // Dashed centerline guide
    g.save();
    g.setLineDash([14, 18]);
    g.lineWidth = 3;
    g.strokeStyle = wd.theme === 'lab' ? 'rgba(61,240,255,0.28)' : 'rgba(255,255,255,0.24)';
    loopPath(g, L);
    g.stroke();
    g.restore();

    drawStartLine(g, L);
    L.boosts.forEach(function (b) { drawBoostPad(g, b); });
    L.hazards.forEach(function (h) { drawHazardPuddle(g, h); });
    L.magnets.forEach(function (m) { drawMagnetProp(g, m); });
  }

  A.track = function (L, ps) {
    var key = (L.R && L.R.id ? L.R.id : L.i) + '|' + ps + '|' + L.P.roadWidth.toFixed(3);
    if (!tracks[key]) {
      tracks = {};
      var c = canvas(W * ps, H * ps), g = c.getContext('2d');
      g.setTransform(ps, 0, 0, ps, 0, 0);
      var wd = DK.WORLDS[L.world];
      background(g, wd, 19 + L.i * 137);
      drawTrack(g, L, wd);
      tracks[key] = c;
    }
    return tracks[key];
  };

  A.backdrop = function (worldIdx, ps) {
    var key = 'bd' + worldIdx + '|' + ps;
    if (!cache[key]) {
      var c = canvas(W * ps, H * ps), g = c.getContext('2d');
      g.setTransform(ps, 0, 0, ps, 0, 0);
      background(g, DK.WORLDS[worldIdx % DK.WORLDS.length], 91 + worldIdx * 29);
      cache[key] = c;
    }
    return cache[key];
  };

  /* --------------------------------------------------- dynamic props & items */
  A.portal = function (g, po, t, still) {
    var spin = still ? 0 : t * 4.5;
    [[po.xIn, po.yIn, true], [po.xOut, po.yOut, false]].forEach(function (pt) {
      var x = pt[0], y = pt[1], isIn = pt[2], r = isIn ? po.r : po.r * 0.82;
      A.glow(g, x, y, r * 2.1, po.color, isIn ? 0.85 : 0.55);
      g.save();
      g.translate(x, y);
      g.rotate(isIn ? spin : -spin * 0.7);
      A.circle(g, 0, 0, r);
      g.fillStyle = isIn ? rgba(po.color, 0.32) : 'rgba(15,23,62,0.55)';
      g.fill();
      g.lineWidth = 4.5;
      g.strokeStyle = po.color;
      g.stroke();
      g.setLineDash([8, 6]);
      A.circle(g, 0, 0, r * 0.62);
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.setLineDash([]);
      g.restore();
    });
  };

  A.bumper = function (g, bmp, wobble, t, still) {
    var k = 1 + (wobble || 0) * (still ? 0.12 : Math.sin(t * 28) * 0.24);
    var r = bmp.r;
    g.save();
    g.translate(bmp.x, bmp.y);
    g.scale(k, 2 - k);
    // Ground shadow
    A.circle(g, 2, 4, r + 2);
    g.fillStyle = 'rgba(15,20,50,0.28)';
    g.fill();

    if (bmp.kind === 'eraser') {
      g.rotate(0.35);
      A.rr(g, -r * 1.15, -r * 0.82, r * 2.3, r * 1.64, 7);
      g.fillStyle = '#ff6b9d';
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = '#4cc9f0';
      g.fillRect(r * 0.25, -r, r, r * 2);
      g.restore();
      A.rr(g, -r * 1.15, -r * 0.82, r * 2.3, r * 1.64, 7);
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.stroke();
    } else if (bmp.kind === 'tape') {
      A.circle(g, 0, 0, r);
      g.fillStyle = '#ffd166';
      g.fill();
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.stroke();
      A.circle(g, 0, 0, r * 0.48);
      g.fillStyle = '#2a9d8f';
      g.fill();
      g.stroke();
    } else if (bmp.kind === 'juice') {
      A.rr(g, -r * 0.88, -r * 0.95, r * 1.76, r * 1.9, 6);
      g.fillStyle = '#ff595e';
      g.fill();
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.stroke();
      A.circle(g, 0, 2, r * 0.42);
      g.fillStyle = '#ffd23f';
      g.fill();
      // Cute bent straw
      g.beginPath();
      g.moveTo(4, -r * 0.95);
      g.lineTo(7, -r * 1.38);
      g.lineTo(15, -r * 1.32);
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.strokeStyle = '#ffffff';
      g.stroke();
    } else {
      A.glow(g, 0, 0, r * 1.9, '#3df0ff', 0.65);
      A.circle(g, 0, 0, r);
      g.fillStyle = '#2b3a67';
      g.fill();
      g.lineWidth = 3.5;
      g.strokeStyle = '#3df0ff';
      g.stroke();
      A.circle(g, 0, 0, r * 0.5);
      g.fillStyle = '#72efdd';
      g.fill();
    }
    g.restore();
  };

  A.coin = function (g, x, y, t, still) {
    var bob = still ? 0 : Math.sin(t * 3.4 + x * 0.04) * 2.5;
    var sq = still ? 1 : 0.42 + 0.58 * Math.abs(Math.cos(t * 2.6 + x * 0.03));
    y += bob;
    A.glow(g, x, y, 24, '#ffd23f', 0.65);
    g.save();
    g.translate(x, y);
    g.scale(sq, 1);
    A.circle(g, 0, 0, 12.5);
    g.fillStyle = '#ffd23f';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#9c5700';
    g.stroke();
    A.star(g, 0, 0, 7, 3.3, 0);
    g.fillStyle = '#fff7c2';
    g.fill();
    g.restore();
  };

  A.giftBox = function (g, x, y, cd, t, still) {
    if (cd > 0) {
      A.circle(g, x, y, 13);
      g.lineWidth = 2.5;
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.stroke();
      g.setLineDash([]);
      return;
    }
    var bob = still ? 0 : Math.sin(t * 4 + y * 0.05) * 3;
    var rot = still ? 0.12 : Math.sin(t * 2.5 + x * 0.02) * 0.18;
    A.glow(g, x, y + bob, 30, '#ff70a6', 0.65);
    g.save();
    g.translate(x, y + bob);
    g.rotate(rot);
    A.rr(g, -14, -14, 28, 28, 7);
    var gr = g.createLinearGradient(-14, -14, 14, 14);
    gr.addColorStop(0, '#ff5d9e');
    gr.addColorStop(0.5, '#ffd23f');
    gr.addColorStop(1, '#3df0ff');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 3.2;
    g.strokeStyle = INK;
    g.stroke();
    // White ribbon cross
    g.fillStyle = '#ffffff';
    g.fillRect(-3.5, -13, 7, 26);
    g.fillRect(-13, -3.5, 26, 7);
    A.text(g, '?', 0, 1, 18, INK, { stroke: false });
    g.restore();
  };

  A.itemIcon = function (g, item, x, y, s) {
    if (!item) return;
    g.save();
    g.translate(x, y);
    g.scale(s || 1, s || 1);
    if (item === 'turbo') {
      // Juice box with speedy flame
      A.rr(g, -10, -11, 20, 22, 5);
      g.fillStyle = '#ff9f1c';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.moveTo(0, -5);
      g.quadraticCurveTo(7, 2, 0, 8);
      g.quadraticCurveTo(-7, 2, 0, -5);
      g.fillStyle = '#fff3b0';
      g.fill();
    } else if (item === 'bubble') {
      A.circle(g, 0, 0, 12);
      g.fillStyle = 'rgba(61,240,255,0.45)';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.stroke();
      A.circle(g, -4, -4, 3.5);
      g.fillStyle = '#ffffff';
      g.fill();
    } else if (item === 'spring') {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(-8, -9); g.lineTo(8, -5); g.lineTo(-8, 0); g.lineTo(8, 5); g.lineTo(-8, 9);
      g.lineWidth = 6.5;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 3.5;
      g.strokeStyle = '#8dff5a';
      g.stroke();
    } else if (item === 'splat') {
      g.rotate(-0.45);
      A.rr(g, -11, -6, 18, 12, 4);
      g.fillStyle = '#ff5d9e';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.moveTo(7, -6); g.lineTo(14, 0); g.lineTo(7, 6); g.closePath();
      g.fillStyle = '#ffd23f';
      g.fill();
      g.stroke();
    }
    g.restore();
  };

  A.splatRocket = function (g, sp, t, still) {
    A.glow(g, sp.x, sp.y, 26, '#ff5d9e', 0.8);
    g.save();
    g.translate(sp.x, sp.y);
    g.rotate(still ? 0 : t * 10);
    A.star(g, 0, 0, 13, 6.5, 0);
    g.fillStyle = '#ff5d9e';
    g.fill();
    g.lineWidth = 2.8;
    g.strokeStyle = INK;
    g.stroke();
    A.circle(g, 0, 0, 4.5);
    g.fillStyle = '#ffd23f';
    g.fill();
    g.restore();
  };

  /* --------------------------------------------------- karts & 6 toppers */
  function drawTopper(g, topperId, t, still) {
    if (topperId === 0) {
      // Pencil rocket on spoiler
      A.rr(g, -18, -5, 14, 10, 3);
      g.fillStyle = '#ffd166';
      g.fill();
      g.lineWidth = 2.4;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.moveTo(-4, -5); g.lineTo(2, 0); g.lineTo(-4, 5); g.closePath();
      g.fillStyle = '#ff5d9e';
      g.fill();
      g.stroke();
    } else if (topperId === 1) {
      // Cute yellow rubber ducky on front hood
      A.circle(g, 7, 0, 6.2);
      g.fillStyle = '#ffd23f';
      g.fill();
      g.lineWidth = 2.2;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.ellipse(13, 0, 3.2, 2.2, 0, 0, TAU);
      g.fillStyle = '#fb8500';
      g.fill();
      g.stroke();
      A.circle(g, 8.5, -2.2, 1.1);
      g.fillStyle = INK;
      g.fill();
    } else if (topperId === 2) {
      // Shiny gold crown
      g.beginPath();
      g.moveTo(-6, -6);
      g.lineTo(-1, -8);
      g.lineTo(-3, -3);
      g.lineTo(2, 0);
      g.lineTo(-3, 3);
      g.lineTo(-1, 8);
      g.lineTo(-6, 6);
      g.closePath();
      g.fillStyle = '#ffd23f';
      g.fill();
      g.lineWidth = 2.2;
      g.strokeStyle = INK;
      g.stroke();
    } else if (topperId === 3) {
      // Lime dino spikes along spine
      g.fillStyle = '#8dff5a';
      g.strokeStyle = INK;
      g.lineWidth = 2;
      [-12, -5, 2, 9].forEach(function (sx) {
        A.circle(g, sx, 0, 3.4);
        g.fill();
        g.stroke();
      });
    } else if (topperId === 4) {
      // Twin golden star wings at rear
      g.beginPath();
      g.moveTo(-10, -14);
      g.lineTo(-18, -19);
      g.lineTo(-15, 0);
      g.lineTo(-18, 19);
      g.lineTo(-10, 14);
      g.closePath();
      g.fillStyle = '#ffd23f';
      g.fill();
      g.lineWidth = 2.4;
      g.strokeStyle = INK;
      g.stroke();
    } else if (topperId === 5) {
      // Chrome monster roll-bar
      A.rr(g, -9, -11, 6, 22, 3);
      g.fillStyle = '#e2e8f0';
      g.fill();
      g.lineWidth = 2.4;
      g.strokeStyle = INK;
      g.stroke();
    }
  }

  // Draws one micro-kart. Also used on shop preview canvases with scale ~ 2.1!
  A.kart = function (g, k, o) {
    o = o || {};
    var paint = DK.PAINTS[k.paint || 0] || DK.PAINTS[0];
    var topper = k.topper || 0;
    var z = k.z || 0;
    var scale = (o.scale || 1) * (1 + z * 0.012);
    var t = o.t || 0, still = !!o.still;
    var ang = (k.ang || 0) + (k.spinA || 0);
    var monster = topper === 5;

    // Ground shadow (stays on track surface while kart hops into the air)
    g.save();
    g.translate(k.x + 2, k.y + 4);
    g.rotate(ang);
    var shScale = Math.max(0.55, 1 - z * 0.015) * (o.scale || 1);
    g.scale(shScale, shScale);
    A.rr(g, -18, -13, 36, 26, 9);
    g.fillStyle = 'rgba(10,14,38,0.34)';
    g.fill();
    g.restore();

    // Main kart body lifted by z
    var kx = k.x, ky = k.y - z * 0.9;
    if ((k.turboT > 0 || k.padBoostT > 0) && !still) {
      A.glow(g, kx, ky, 34 * scale, '#ff9f1c', 0.75);
    }

    g.save();
    g.translate(kx, ky);
    g.rotate(ang);
    g.scale(scale, scale);

    // Exhaust boost flame
    if (k.turboT > 0 || k.padBoostT > 0 || k.miniBoostT > 0) {
      var fl = (k.turboT > 0 ? 22 : 15) + (still ? 0 : Math.sin(t * 40) * 4);
      g.beginPath();
      g.moveTo(-16, -6);
      g.lineTo(-16 - fl, 0);
      g.lineTo(-16, 6);
      g.closePath();
      g.fillStyle = k.turboT > 0 ? '#ff5d9e' : '#ff9f1c';
      g.fill();
      g.beginPath();
      g.moveTo(-15, -3.5);
      g.lineTo(-15 - fl * 0.62, 0);
      g.lineTo(-15, 3.5);
      g.closePath();
      g.fillStyle = '#fff3b0';
      g.fill();
    }

    // 4 chunky tires (oversized when monster wheels topper is equipped)
    var tw = monster ? 12 : 9, th = monster ? 7.5 : 5, wy = monster ? 13.5 : 11.5;
    [[-10, -wy], [-10, wy], [9, -wy], [9, wy]].forEach(function (w0) {
      A.rr(g, w0[0] - tw / 2, w0[1] - th / 2, tw, th, 2.5);
      g.fillStyle = '#1d2238';
      g.fill();
      g.lineWidth = 2.2;
      g.strokeStyle = INK;
      g.stroke();
      if (monster) {
        g.fillStyle = '#ffd23f';
        g.fillRect(w0[0] - 2, w0[1] - 1.5, 4, 3);
      }
    });

    // Kart body shell
    A.rr(g, -17, -11, 34, 22, 9);
    g.fillStyle = paint.body;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();

    // Center racing stripe & glossy highlight
    g.fillStyle = paint.trim;
    g.fillRect(-14, -3.2, 28, 6.4);
    A.rr(g, 3, -7.5, 10, 15, 5);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fill();

    // Cute cockpit & helmeted driver head
    A.circle(g, -2, 0, 7.2);
    g.fillStyle = '#1f274f';
    g.fill();
    A.circle(g, -1, 0, 5.8);
    g.fillStyle = k.human ? '#ffffff' : '#ffe5b4';
    g.fill();
    g.lineWidth = 2.2;
    g.strokeStyle = INK;
    g.stroke();
    // Visor facing forward (+x)
    A.rr(g, 1, -4, 4.2, 8, 2);
    g.fillStyle = '#3df0ff';
    g.fill();

    // Equipped silly topper
    drawTopper(g, topper, t, still);

    // Soap bubble shield around kart
    if (k.bubbleT > 0) {
      A.circle(g, 0, 0, 22);
      g.fillStyle = 'rgba(61,240,255,0.24)';
      g.fill();
      g.lineWidth = 2.6;
      g.strokeStyle = 'rgba(255,255,255,0.88)';
      g.stroke();
      A.circle(g, -7, -8, 4);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fill();
    }
    g.restore();

    // Dizzy stars when spun by paint rocket
    if (k.spinT > 0) {
      for (var si = 0; si < 3; si++) {
        var sa = (still ? 0 : t * 7) + (si * TAU) / 3;
        A.star(g, kx + Math.cos(sa) * 16, ky - 20 + Math.sin(sa) * 5, 5.5, 2.5, sa);
        g.fillStyle = '#ffd23f';
        g.fill();
      }
    }

    // Overhead P1 / P2 badge + held item bubble so human players spot their kart instantly
    if (k.human && !o.noBadge) {
      var by = ky - 28;
      var badgeCol = k.playerNum === 1 ? '#ffd23f' : '#8dff5a';
      A.circle(g, kx, by, 10.5);
      g.fillStyle = badgeCol;
      g.fill();
      g.lineWidth = 2.8;
      g.strokeStyle = INK;
      g.stroke();
      A.text(g, String(k.playerNum), kx, by + 0.5, 14, INK, { stroke: false });
      if (k.item) {
        A.circle(g, kx + 22, by, 12);
        g.fillStyle = 'rgba(20,26,68,0.88)';
        g.fill();
        g.lineWidth = 2.4;
        g.strokeStyle = '#ffffff';
        g.stroke();
        A.itemIcon(g, k.item, kx + 22, by, 0.72);
      }
    }
  };
})();
