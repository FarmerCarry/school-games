/* Magic Crayon (القلم السحري) art & sketchbook renderer.
 * Paper backdrops and static wooden-ruler platforms are cached per level into an offscreen
 * canvas; moving buddies, textured wax strokes, bouncy pads, pinwheel fans, bubbly slime,
 * swirling portals, golden star cup, and the wordless coach hand draw crisp each frame. */
(function () {
  'use strict';
  var MC = window.MC, W = MC.W, H = MC.H, TAU = Math.PI * 2;
  var A = MC.art = {};
  var INK = A.INK = '#1e1b4b';
  var cache = {}, stages = {};
  A.reset = function () { cache = {}; stages = {}; };

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  A.rgba = rgba;

  function seeded(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  A.rr = function (g, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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

  // Explicit direction & alignment on every canvas text draw; Arabic always rendered whole.
  A.text = function (g, s, x, y, size, color, o) {
    o = o || {};
    var str = String(s);
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = 'middle';
    g.direction = o.dir || (/[\u0600-\u06ff]/.test(str) ? 'rtl' : 'ltr');
    if (o.stroke !== false) {
      g.lineJoin = 'round';
      g.lineWidth = o.lw || Math.max(4, size * 0.22);
      g.strokeStyle = o.stroke || INK;
      g.strokeText(str, x, y);
    }
    g.fillStyle = color || '#fff';
    g.fillText(str, x, y);
  };

  /* ---------------------------------------------------------- soft glows */
  A.glowSprite = function (color) {
    var key = 'g_' + color;
    if (!cache[key]) {
      var c = makeCanvas(96, 96), g = c.getContext('2d');
      var gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      gr.addColorStop(0, rgba(color, 0.72));
      gr.addColorStop(0.45, rgba(color, 0.25));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 96, 96);
      cache[key] = c;
    }
    return cache[key];
  };

  A.glow = function (g, x, y, r, color, alpha) {
    var ga = g.globalAlpha;
    g.globalAlpha = ga * (alpha == null ? 1 : alpha);
    g.drawImage(A.glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = ga;
  };

  /* ------------------------------------------------ sketchbook paper art */
  function drawStarPath(g, cx, cy, rOut, rIn, pts) {
    pts = pts || 5;
    g.beginPath();
    for (var i = 0; i < pts * 2; i++) {
      var r = i % 2 === 0 ? rOut : rIn;
      var a = -Math.PI / 2 + (i * Math.PI) / pts;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }
  A.starPath = drawStarPath;

  function drawPaper(g, wdIdx, seed) {
    var wd = MC.WORLDS[wdIdx] || MC.WORLDS[0];
    var rnd = seeded(seed);
    // Desk mat border around the sketchbook page.
    g.fillStyle = '#2d2863';
    g.fillRect(0, 0, W, H);

    // Page drop shadow & main paper sheet.
    A.rr(g, 14, 10, W - 28, H - 16, 20);
    g.fillStyle = 'rgba(12, 10, 32, 0.35)';
    g.fill();

    var gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, wd.paper);
    gr.addColorStop(1, wd.paper2);
    A.rr(g, 10, 6, W - 20, H - 16, 20);
    g.fillStyle = gr;
    g.fill();

    g.save();
    A.rr(g, 10, 6, W - 20, H - 16, 20);
    g.clip();

    // Soft pastel watercolor splotches in corners.
    for (var k = 0; k < 5; k++) {
      var sx = 120 + rnd() * (W - 240), sy = 130 + rnd() * (H - 220);
      A.circle(g, sx, sy, 75 + rnd() * 65);
      g.fillStyle = rgba(wd.accent, 0.045);
      g.fill();
    }

    // World-themed notebook rulings!
    var x, y;
    if (wdIdx === 0) {
      // Classic school lined paper.
      g.strokeStyle = wd.line;
      g.lineWidth = 2;
      for (y = 112; y < H - 20; y += 36) {
        g.beginPath(); g.moveTo(16, y); g.lineTo(W - 16, y); g.stroke();
      }
    } else if (wdIdx === 1) {
      // Dotted bullet-sketchbook grid.
      g.fillStyle = wd.line;
      for (y = 108; y < H - 20; y += 34) {
        for (x = 34; x < W - 30; x += 34) {
          g.fillRect(x - 2, y - 2, 4, 4);
        }
      }
    } else if (wdIdx === 2) {
      // Breezy sky notebook lines + tiny wind swirls in margins.
      g.strokeStyle = wd.line;
      g.lineWidth = 2;
      for (y = 112; y < H - 20; y += 40) {
        g.beginPath(); g.moveTo(16, y); g.lineTo(W - 16, y); g.stroke();
      }
    } else {
      // Cosmic graph paper.
      g.strokeStyle = wd.line;
      g.lineWidth = 1.5;
      for (y = 104; y < H - 16; y += 36) {
        g.beginPath(); g.moveTo(16, y); g.lineTo(W - 16, y); g.stroke();
      }
      for (x = 40; x < W - 20; x += 36) {
        g.beginPath(); g.moveTo(x, 82); g.lineTo(x, H - 16); g.stroke();
      }
    }

    // RTL coral margin line on the right side of the Arabic notebook!
    g.strokeStyle = 'rgba(255, 89, 100, 0.36)';
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(W - 58, 12); g.lineTo(W - 58, H - 12); g.stroke();
    g.beginPath(); g.moveTo(W - 64, 12); g.lineTo(W - 64, H - 12); g.stroke();

    // Cute faint pencil margin doodles (stars, little clouds, spirals).
    g.strokeStyle = rgba(wd.accent, 0.16);
    g.lineWidth = 2.2;
    for (var d = 0; d < 7; d++) {
      var dx = 65 + rnd() * (W - 160), dy = 115 + rnd() * (H - 180);
      g.save();
      g.translate(dx, dy);
      g.rotate(rnd() * 0.8 - 0.4);
      drawStarPath(g, 0, 0, 11, 5, 5);
      g.stroke();
      g.restore();
    }

    // Top HUD header strip tint.
    g.fillStyle = 'rgba(255, 255, 255, 0.72)';
    g.fillRect(10, 6, W - 20, 76);
    g.strokeStyle = rgba(INK, 0.14);
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(14, 82); g.lineTo(W - 14, 82); g.stroke();

    g.restore();

    // Crisp page outline & spiral binder holes along bottom/right edge.
    A.rr(g, 10, 6, W - 20, H - 16, 20);
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();

    for (var ry = 118; ry < H - 40; ry += 56) {
      A.circle(g, W - 26, ry, 6.5);
      g.fillStyle = '#2d2863';
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = 'rgba(30,27,75,0.45)';
      g.stroke();
    }
  }

  // Wooden centimeter-ruler / craft-plank wall segment.
  function drawWallSeg(g, sg) {
    if (sg.kind === 'floor') {
      // Friendly wooden pencil-tray along the bottom of World 1 & 2 pages.
      g.save();
      A.rr(g, sg.ax - 8, sg.ay - 8, sg.bx - sg.ax + 16, 18, 8);
      g.fillStyle = '#f6bd60';
      g.fill();
      g.lineWidth = 3.5;
      g.strokeStyle = INK;
      g.stroke();
      g.restore();
      return;
    }
    var ang = Math.atan2(sg.dy, sg.dx), len = sg.l, r = sg.r;
    g.save();
    g.translate(sg.ax, sg.ay);
    g.rotate(ang);
    // Paper shadow.
    A.rr(g, -r, -r + 5, len + r * 2, r * 2, r);
    g.fillStyle = 'rgba(30, 27, 75, 0.16)';
    g.fill();
    // Warm wooden ruler body.
    A.rr(g, -r, -r, len + r * 2, r * 2, r);
    var wg = g.createLinearGradient(0, -r, 0, r);
    wg.addColorStop(0, '#ffd166');
    wg.addColorStop(1, '#f4a261');
    g.fillStyle = wg;
    g.fill();
    // Ruler millimeter ticks along the top edge!
    g.strokeStyle = 'rgba(120, 53, 15, 0.45)';
    g.lineWidth = 2;
    for (var x = 10; x < len - 6; x += 16) {
      var th = (x / 16) % 2 === 0 ? r * 0.85 : r * 0.5;
      g.beginPath(); g.moveTo(x, -r + 1); g.lineTo(x, -r + 1 + th); g.stroke();
    }
    A.rr(g, -r, -r, len + r * 2, r * 2, r);
    g.lineWidth = 3.8;
    g.strokeStyle = INK;
    g.stroke();
    g.restore();
  }

  A.backdrop = function (wdIdx, scale) {
    var key = 'bg_' + wdIdx + '_' + scale;
    if (!cache[key]) {
      var c = makeCanvas(W * scale, H * scale), g = c.getContext('2d');
      g.scale(scale, scale);
      drawPaper(g, wdIdx, 901 + wdIdx * 77);
      cache[key] = c;
    }
    return cache[key];
  };

  A.stage = function (L, scale) {
    var key = L.id + '@' + scale;
    if (!stages[key]) {
      var c = makeCanvas(W * scale, H * scale), g = c.getContext('2d');
      g.scale(scale, scale);
      drawPaper(g, L.world, 101 + L.i * 131);
      // Little start flag/coaster markers under each marble's starting spot.
      for (var s = 0; s < L.starts.length; s++) {
        var st = L.starts[s];
        g.save();
        g.strokeStyle = 'rgba(30, 27, 75, 0.25)';
        g.setLineDash([5, 5]);
        g.lineWidth = 2.5;
        A.circle(g, st[0], st[1], MC.BALL_R + 5);
        g.stroke();
        g.restore();
      }
      for (var i = 0; i < L.walls.length; i++) drawWallSeg(g, L.walls[i]);
      stages[key] = c;
    }
    return stages[key];
  };

  /* ---------------------------------------------- interactive mechanics */
  A.guide = function (g, pts, t, still) {
    if (!pts || pts.length < 2) return;
    g.save();
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash([12, 12]);
    g.lineDashOffset = still ? 0 : -t * 28;
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255, 89, 100, 0.34)';
    g.stroke();
    g.restore();
  };

  A.ghostStrokes = function (g, strokes) {
    if (!strokes || !strokes.length) return;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash([8, 10]);
    g.lineWidth = MC.INK_R * 1.6;
    g.strokeStyle = 'rgba(100, 116, 139, 0.26)';
    for (var i = 0; i < strokes.length; i++) {
      var pts = strokes[i];
      if (pts.length < 2) continue;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1]);
      g.stroke();
    }
    g.restore();
  };

  // Textured wax crayon stroke!
  A.stroke = function (g, pts, crayonIdx, t, still) {
    if (!pts || pts.length < 2) return;
    var cr = MC.CRAYONS[crayonIdx] || MC.CRAYONS[0];
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // 1. Chunky sketchbook ink outline.
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineWidth = MC.INK_R * 2 + 5;
    g.strokeStyle = INK;
    g.stroke();

    // 2. Vibrant wax core (per-chunk rainbow if rainbow crayon is equipped).
    if (cr.rainbow) {
      for (var k = 1; k < pts.length; k++) {
        g.beginPath();
        g.moveTo(pts[k - 1][0], pts[k - 1][1]);
        g.lineTo(pts[k][0], pts[k][1]);
        g.lineWidth = MC.INK_R * 2;
        g.strokeStyle = 'hsl(' + ((k * 14) % 360) + ', 92%, 60%)';
        g.stroke();
      }
    } else {
      g.lineWidth = MC.INK_R * 2;
      g.strokeStyle = cr.color;
      g.stroke();
    }

    // 3. Waxy highlight texture dash along the ridge.
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var m = 1; m < pts.length; m++) g.lineTo(pts[m][0], pts[m][1]);
    g.setLineDash([5, 9]);
    g.lineWidth = 3.2;
    g.strokeStyle = cr.galaxy ? 'rgba(233, 213, 255, 0.75)' : 'rgba(255, 255, 255, 0.55)';
    g.stroke();
    g.setLineDash([]);

    // Optional sparkle dots for gold glitter & galaxy crayons.
    if (cr.glitter || cr.galaxy) {
      for (var s = 0; s < pts.length; s += 3) {
        var pulse = still ? 1 : 0.55 + 0.45 * Math.sin(t * 7 + s * 1.7);
        A.circle(g, pts[s][0], pts[s][1] - 1, 2.2 * pulse);
        g.fillStyle = '#ffffff';
        g.fill();
      }
    }
    g.restore();
  };

  // Pink springy trampoline pad.
  A.pad = function (g, pd, boing) {
    var ang = Math.atan2(pd.dy, pd.dx), len = pd.l;
    var sq = boing ? Math.sin(boing * Math.PI * 3) * boing * 6 : 0;
    g.save();
    g.translate(pd.ax, pd.ay);
    g.rotate(ang);

    // Twin silver springs underneath.
    g.strokeStyle = '#64748b';
    g.lineWidth = 3.5;
    [len * 0.24, len * 0.76].forEach(function (sx) {
      g.beginPath();
      g.moveTo(sx - 8, 8 - sq * 0.4);
      g.lineTo(sx + 8, 13 - sq * 0.2);
      g.lineTo(sx - 8, 18);
      g.lineTo(sx + 8, 22);
      g.stroke();
    });
    // Base anchor bar.
    A.rr(g, 8, 20, len - 16, 7, 3.5);
    g.fillStyle = '#475569';
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = INK;
    g.stroke();

    // Bouncy pink cushion!
    var yOff = -pd.r - sq;
    A.rr(g, -pd.r, yOff, len + pd.r * 2, pd.r * 2, pd.r);
    var pg = g.createLinearGradient(0, yOff, 0, yOff + pd.r * 2);
    pg.addColorStop(0, '#ff75b5');
    pg.addColorStop(1, '#f72585');
    g.fillStyle = pg;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();

    // Little white chevron bounce arrows on cushion.
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    [len * 0.32, len * 0.5, len * 0.68].forEach(function (cx) {
      g.beginPath();
      g.moveTo(cx - 6, yOff + pd.r + 2);
      g.lineTo(cx, yOff + pd.r - 4);
      g.lineTo(cx + 6, yOff + pd.r + 2);
      g.stroke();
    });
    g.restore();
  };

  // Breezy pinwheel wind column!
  A.fan = function (g, f, t, still) {
    g.save();
    // Translucent sky wind column.
    A.rr(g, f.x, f.y, f.w, f.h, 22);
    var fg = g.createLinearGradient(f.x, f.y + f.h, f.x + f.dx * 80, f.y);
    fg.addColorStop(0, 'rgba(0, 180, 216, 0.20)');
    fg.addColorStop(1, 'rgba(144, 224, 239, 0.05)');
    g.fillStyle = fg;
    g.fill();
    g.setLineDash([8, 10]);
    g.lineWidth = 2.2;
    g.strokeStyle = 'rgba(0, 180, 216, 0.32)';
    g.stroke();
    g.setLineDash([]);

    // Animated rising/drifting breeze ribbons inside the zone.
    g.strokeStyle = 'rgba(0, 180, 216, 0.48)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (var i = 0; i < 5; i++) {
      var p = still ? (i + 0.5) / 5 : ((t * 0.85 + i * 0.21) % 1);
      var rx, ry;
      if (Math.abs(f.dy) >= Math.abs(f.dx)) {
        rx = f.x + 24 + ((i * 43) % Math.max(24, f.w - 48)) + f.dx * p * 34;
        ry = f.y + f.h - 24 - p * (f.h - 48);
      } else {
        rx = f.x + 20 + p * (f.w - 40);
        ry = f.y + 24 + ((i * 33) % Math.max(24, f.h - 48)) + f.dy * p * 26;
      }
      g.beginPath();
      g.moveTo(rx, ry);
      g.lineTo(rx - f.dx * 22, ry - f.dy * 26);
      g.stroke();
    }

    // Cute spinning paper pinwheel at the base of the breeze!
    var px = Math.abs(f.dy) >= Math.abs(f.dx) ? f.x + f.w / 2 : f.x + 18;
    var py = Math.abs(f.dy) >= Math.abs(f.dx) ? f.y + f.h - 10 : f.y + f.h / 2;
    g.translate(px, py);
    A.rr(g, -22, -10, 44, 20, 10);
    g.fillStyle = '#00b4d8';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = INK;
    g.stroke();

    g.rotate(still ? 0.4 : t * 7);
    var cols = ['#ff5964', '#ffd166', '#00d9f5', '#10b981'];
    for (var b = 0; b < 4; b++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(12, -14, 22, -2);
      g.quadraticCurveTo(10, 6, 0, 0);
      g.fillStyle = cols[b];
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = INK;
      g.stroke();
    }
    A.circle(g, 0, 0, 5.5);
    g.fillStyle = '#fff';
    g.fill();
    g.stroke();
    g.restore();
  };

  // Spring-hinged wooden seesaw gate.
  A.gate = function (g, gt, ang) {
    var ep = MC.gateEndpoints(gt, ang);
    g.save();
    g.beginPath();
    g.moveTo(ep[0], ep[1]);
    g.lineTo(ep[2], ep[3]);
    g.lineCap = 'round';
    g.lineWidth = MC.GATE_R * 2 + 5;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = MC.GATE_R * 2;
    g.strokeStyle = '#ff9f1c';
    g.stroke();

    // Brass thumbtack pivot pin in the middle!
    A.circle(g, gt.x, gt.y, 11);
    g.fillStyle = '#fef08a';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = INK;
    g.stroke();
    A.circle(g, gt.x, gt.y, 4);
    g.fillStyle = INK;
    g.fill();
    g.restore();
  };

  // Ticklish purple slime puddle with giggling bubbles & cute googly eyes!
  A.slime = function (g, sl, t, still) {
    g.save();
    var x = sl.x, y = sl.y, w = sl.w, h = sl.h;
    g.beginPath();
    g.moveTo(x + 12, y + h);
    g.lineTo(x + 6, y + 14);
    var waves = Math.max(4, Math.round(w / 42));
    for (var i = 0; i <= waves; i++) {
      var wx = x + (w * i) / waves;
      var wy = y + 8 + (still ? (i % 2 ? 3 : -3) : Math.sin(t * 4.5 + i * 1.4) * 4.5);
      g.lineTo(wx, wy);
    }
    g.lineTo(x + w - 6, y + 14);
    g.lineTo(x + w - 12, y + h);
    g.closePath();
    var sg = g.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, '#c084fc');
    sg.addColorStop(1, '#7e22ce');
    g.fillStyle = sg;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();

    // Rising giggling bubbles.
    for (var b = 0; b < 4; b++) {
      var p = still ? 0.4 : ((t * 0.9 + b * 0.27) % 1);
      var bx = x + w * (0.2 + b * 0.2), by = y + 22 - p * 18;
      A.circle(g, bx, by, 4 + (1 - p) * 3);
      g.fillStyle = 'rgba(243, 232, 255, 0.78)';
      g.fill();
    }

    // Cute goofy slime eyes in the middle!
    var mx = x + w / 2, my = y + h * 0.56;
    [-11, 11].forEach(function (ox) {
      A.circle(g, mx + ox, my, 7);
      g.fillStyle = '#fff';
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = INK;
      g.stroke();
      A.circle(g, mx + ox + 1, my - 1, 3.2);
      g.fillStyle = INK;
      g.fill();
    });
    g.restore();
  };

  // Gravity-flip pad!
  A.gravPad = function (g, gp, t, still) {
    var col = gp.dir < 0 ? '#a855f7' : '#06b6d4';
    g.save();
    A.rr(g, gp.x, gp.y, gp.w, gp.h, 18);
    g.fillStyle = rgba(col, 0.16);
    g.fill();
    g.lineWidth = 3;
    g.setLineDash([7, 7]);
    g.strokeStyle = rgba(col, 0.55);
    g.stroke();
    g.setLineDash([]);

    // Floating directional chevrons (up for anti-gravity, down for normal gravity).
    g.strokeStyle = col;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (var i = 0; i < 3; i++) {
      var p = still ? (i + 0.5) / 3 : ((t * 0.9 + i / 3) % 1);
      var cy = gp.dir < 0 ? gp.y + gp.h - 20 - p * (gp.h - 40) : gp.y + 20 + p * (gp.h - 40);
      var cx = gp.x + gp.w / 2, d = gp.dir < 0 ? -9 : 9;
      g.globalAlpha = 0.35 + 0.65 * Math.sin(p * Math.PI);
      g.beginPath();
      g.moveTo(cx - 14, cy - d);
      g.lineTo(cx, cy + d);
      g.lineTo(cx + 14, cy - d);
      g.stroke();
    }
    g.restore();
  };

  // Teleport portal pair!
  A.portal = function (g, po, t, still) {
    g.save();
    // Subtle dotted link between ring A and ring B.
    g.beginPath();
    g.moveTo(po.ax, po.ay);
    g.quadraticCurveTo((po.ax + po.bx) / 2, Math.min(po.ay, po.by) - 45, po.bx, po.by);
    g.setLineDash([5, 11]);
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(132, 94, 194, 0.25)';
    g.stroke();
    g.setLineDash([]);

    [[po.ax, po.ay, po.color, 1], [po.bx, po.by, po.color2 || po.color, -1]].forEach(function (ring) {
      var rx = ring[0], ry = ring[1], col = ring[2], dir = ring[3];
      A.glow(g, rx, ry, po.r * 1.5, col, 0.55);
      g.save();
      g.translate(rx, ry);
      g.rotate(still ? 0.3 : t * 3.2 * dir);
      A.circle(g, 0, 0, po.r);
      g.fillStyle = rgba(col, 0.22);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 4;
      g.strokeStyle = col;
      g.stroke();
      for (var k = 0; k < 4; k++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.arc(0, 0, po.r * 0.66, 0, 1.05);
        g.lineWidth = 3.5;
        g.strokeStyle = '#ffffff';
        g.stroke();
      }
      g.restore();
    });
    g.restore();
  };

  // Plump sticker star pickup!
  A.star = function (g, x, y, t, still) {
    var bob = still ? 0 : Math.sin(t * 4 + x * 0.02) * 4;
    var rot = still ? 0 : Math.sin(t * 2.5 + y * 0.02) * 0.1;
    g.save();
    g.translate(x, y + bob);
    g.rotate(rot);
    A.glow(g, 0, 0, 34, '#ffd166', 0.55);
    drawStarPath(g, 0, 0, 21, 9.5, 5);
    g.fillStyle = '#ffd166';
    g.fill();
    g.lineWidth = 4;
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.stroke();
    // Cute tiny eyes on each collectible star!
    A.circle(g, -4.5, -1, 2.2); g.fillStyle = INK; g.fill();
    A.circle(g, 4.5, -1, 2.2); g.fillStyle = INK; g.fill();
    g.restore();
  };

  // Golden Star Cup (الكأس الذهبية)!
  A.cup = function (g, cup, done, t, still) {
    var x = cup.x, y = cup.y, hw = MC.CUP_W / 2, hh = MC.CUP_H / 2;
    g.save();
    A.glow(g, x, y, done ? 76 : 54, '#ffd166', done ? 0.85 : 0.45);
    g.translate(x, y);

    // Side handles.
    g.lineWidth = 5;
    g.strokeStyle = INK;
    [-1, 1].forEach(function (s) {
      g.beginPath();
      g.moveTo(s * (hw + 2), -hh + 10);
      g.bezierCurveTo(s * (hw + 20), -hh + 8, s * (hw + 18), 8, s * (hw - 2), 10);
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.stroke();
      g.strokeStyle = '#f59e0b';
      g.lineWidth = 4;
      g.stroke();
    });

    // Cup interior mouth shadow.
    g.beginPath();
    g.ellipse(0, -hh - 2, hw + 6, 8, 0, 0, TAU);
    g.fillStyle = '#92400e';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = INK;
    g.stroke();

    // Gleaming golden cup body.
    g.beginPath();
    g.moveTo(-hw - 7, -hh - 2);
    g.lineTo(-hw + 5, hh);
    g.lineTo(hw - 5, hh);
    g.lineTo(hw + 7, -hh - 2);
    g.closePath();
    var cg = g.createLinearGradient(-hw, 0, hw, 0);
    cg.addColorStop(0, '#f59e0b');
    cg.addColorStop(0.38, '#fde68a');
    cg.addColorStop(0.75, '#fbbf24');
    cg.addColorStop(1, '#d97706');
    g.fillStyle = cg;
    g.fill();
    g.lineWidth = 4.2;
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.stroke();

    // Pedestal foot.
    A.rr(g, -22, hh - 2, 44, 11, 5.5);
    g.fillStyle = '#d97706';
    g.fill();
    g.stroke();

    // Embossed star emblem on front of cup.
    drawStarPath(g, 0, 2, 13, 6, 5);
    g.fillStyle = '#fffbeb';
    g.fill();
    g.lineWidth = 2.8;
    g.strokeStyle = INK;
    g.stroke();

    // Friendly bobbing arrow above the cup mouth while waiting!
    if (!done) {
      var ay = -hh - 24 + (still ? 0 : Math.sin(t * 5) * 4);
      g.beginPath();
      g.moveTo(-9, ay - 6);
      g.lineTo(0, ay + 4);
      g.lineTo(9, ay - 6);
      g.lineWidth = 4.5;
      g.lineCap = 'round';
      g.strokeStyle = '#f59e0b';
      g.stroke();
    }
    g.restore();
  };

  /* --------------------------------------- Karroum (كرّوم) & 6 skins */
  A.marble = function (g, x, y, o) {
    o = o || {};
    var skinIdx = o.skin || 0, sk = MC.SKINS[skinIdx] || MC.SKINS[0];
    var r = MC.BALL_R * (o.scale || 1), ang = o.ang || 0;
    g.save();
    g.translate(x, y);

    // Cat ears behind/on top of marble for 'cat' skin!
    if (sk.id === 'cat') {
      [-1, 1].forEach(function (s) {
        g.beginPath();
        g.moveTo(s * r * 0.35, -r * 0.78);
        g.lineTo(s * r * 0.88, -r * 1.28);
        g.lineTo(s * r * 0.92, -r * 0.45);
        g.closePath();
        g.fillStyle = sk.body;
        g.fill();
        g.lineWidth = 3.5;
        g.strokeStyle = INK;
        g.stroke();
      });
    }

    // Rotating marble body pattern!
    g.save();
    g.rotate(ang);
    A.circle(g, 0, 0, r);
    var bg = g.createRadialGradient(-r * 0.3, -r * 0.32, r * 0.1, 0, 0, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.28, sk.body);
    bg.addColorStop(1, sk.rim);
    g.fillStyle = bg;
    g.fill();

    g.save();
    A.circle(g, 0, 0, r - 1);
    g.clip();
    if (sk.id === 'soccer') {
      g.fillStyle = '#ffffff';
      g.fillRect(-r, -r, r * 2, r * 2);
      g.fillStyle = '#1e293b';
      [[0, 0, 6.5], [-13, -8, 5.5], [13, -8, 5.5], [-9, 13, 5.5], [9, 13, 5.5]].forEach(function (p) {
        drawStarPath(g, p[0], p[1], p[2], p[2] * 0.82, 5);
        g.fill();
      });
    } else if (sk.id === 'melon') {
      g.fillStyle = '#2ec4b6';
      g.fillRect(-r, -r, r * 2, r * 2);
      A.circle(g, 0, 0, r * 0.72);
      g.fillStyle = '#ff4d6d';
      g.fill();
      g.fillStyle = INK;
      [[-6, -5], [6, -4], [0, 7]].forEach(function (p) { A.circle(g, p[0], p[1], 1.8); g.fill(); });
    } else {
      // Glossy marble swirl stripe so rolling motion is unmistakably visible!
      g.beginPath();
      g.arc(0, 0, r * 0.65, 0.2, 1.5);
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.52)';
      g.stroke();
    }
    g.restore();

    A.circle(g, 0, 0, r);
    g.lineWidth = 3.8;
    g.strokeStyle = INK;
    g.stroke();
    g.restore();

    // Rescue buddy sky-blue bandana ribbon on 2-marble levels!
    if (o.buddy) {
      g.beginPath();
      g.arc(0, 0, r + 1, -2.35, -0.78);
      g.lineWidth = 5;
      g.strokeStyle = '#00bbf9';
      g.stroke();
    }

    // Astronaut glass bubble visor!
    if (sk.id === 'astro') {
      A.circle(g, 0, 0, r + 4);
      g.strokeStyle = '#90e0ef';
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.arc(-4, -4, r * 0.85, -2.4, -1.2);
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 3;
      g.stroke();
    }

    // Royal golden crown hat!
    if (sk.id === 'crown') {
      g.save();
      g.translate(0, -r - 1);
      g.beginPath();
      g.moveTo(-12, 3);
      g.lineTo(-14, -10);
      g.lineTo(-5, -3);
      g.lineTo(0, -13);
      g.lineTo(5, -3);
      g.lineTo(14, -10);
      g.lineTo(12, 3);
      g.closePath();
      g.fillStyle = '#ffd166';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.stroke();
      g.restore();
    }

    // Googly eyes & cheerful expression (upright relative to gravity!).
    if (o.grav === -1) g.scale(1, -1);
    var lx = MC.clamp(o.lx || 0, -1, 1) * 2.2, ly = MC.clamp(o.ly || 0, -1, 1) * 2.2;
    [-6.2, 6.2].forEach(function (ox) {
      A.circle(g, ox, -2.5, 5.2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = 2.2;
      g.strokeStyle = INK;
      g.stroke();
      A.circle(g, ox + lx, -2.5 + ly, 2.5);
      g.fillStyle = INK;
      g.fill();
      A.circle(g, ox + lx - 0.8, -3.5 + ly, 0.9);
      g.fillStyle = '#fff';
      g.fill();
    });
    // Rosy cheeks.
    [-11, 11].forEach(function (cx) {
      A.circle(g, cx, 3.5, 3);
      g.fillStyle = 'rgba(255, 89, 100, 0.48)';
      g.fill();
    });
    // Smile / excited 'O' mouth!
    g.lineWidth = 2.8;
    g.strokeStyle = INK;
    g.lineCap = 'round';
    if (o.face === 'wow') {
      A.circle(g, 0, 6.2, 3.6);
      g.fillStyle = '#ff5964';
      g.fill();
      g.stroke();
    } else {
      g.beginPath();
      g.arc(0, 3.2, 5.8, 0.22, Math.PI - 0.22);
      g.stroke();
    }
    g.restore();
  };

  /* ------------------------------------ Crayon cursor & Wordless coach */
  A.crayonTool = function (g, x, y, crayonIdx, alpha, down) {
    var cr = MC.CRAYONS[crayonIdx] || MC.CRAYONS[0];
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y);
    g.rotate(down ? -0.58 : -0.72);
    // Tip sits right at (0, 0)!
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-8, -16);
    g.lineTo(8, -16);
    g.closePath();
    g.fillStyle = cr.color;
    g.fill();
    g.lineWidth = 3.2;
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.stroke();

    A.rr(g, -8, -54, 16, 40, 4);
    g.fillStyle = cr.color;
    g.fill();
    g.stroke();

    // White paper wrapper stripes on the crayon barrel.
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(-6.5, -46, 13, 5);
    g.fillRect(-6.5, -28, 13, 5);
    g.restore();
  };

  A.coachHand = function (g, pts, ct, crayonIdx, still) {
    if (!pts || pts.length < 2) return;
    // Compute total guide length & interpolate position along guide!
    var lens = [0], tot = 0;
    for (var i = 1; i < pts.length; i++) {
      tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(tot);
    }
    var prog = still ? 0.65 : MC.clamp((ct - 0.25) / 2.1, 0, 1);
    var target = prog * tot, k = 0;
    while (k < lens.length - 2 && lens[k + 1] < target) k++;
    var segL = Math.max(1, lens[k + 1] - lens[k]);
    var u = MC.clamp((target - lens[k]) / segL, 0, 1);
    var hx = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u;
    var hy = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u;
    var alpha = Math.min(1, ct * 3.5, (3.1 - ct) * 3) * 0.85;
    if (alpha <= 0.02) return;

    g.save();
    // Translucent preview trail behind the coach crayon (never real ink!).
    if (prog > 0.03) {
      g.globalAlpha = alpha * 0.52;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var m = 1; m <= k; m++) g.lineTo(pts[m][0], pts[m][1]);
      g.lineTo(hx, hy);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 10;
      g.strokeStyle = '#ff5964';
      g.stroke();
    }
    A.crayonTool(g, hx, hy, crayonIdx, alpha, true);
    // Friendly cartoon glove holding the crayon.
    g.globalAlpha = alpha;
    g.translate(hx + 22, hy - 22);
    A.circle(g, 0, 0, 14);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 3.5;
    g.strokeStyle = INK;
    g.stroke();
    g.restore();
  };
})();
