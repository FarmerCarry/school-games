/* Toy Castle Clash (قلعة الألعاب) art: storybook playroom worlds, toy-block castles,
 * spinning golden wind-up keys, rooftop confetti cannons, 5 rooftop toppers, 5 cute toy
 * units + Toy King boss, bouncy drum pad, sky star-bubbles, and projectiles. */
(function () {
  'use strict';
  var TC = window.TC, W = TC.W, H = TC.H, TAU = Math.PI * 2;
  var A = TC.art = {};
  var INK = A.INK = '#1e1b4b';
  var PALETTE = ['#ff5d73', '#ffd23f', '#38bdf8', '#34d399', '#a855f7', '#fb923c'];
  var cache = {};
  A.reset = function () { cache = {}; };

  function makeCanvas(w, h) {
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

  A.starPath = function (g, cx, cy, pts, rOut, rIn, rot) {
    rot = rot || -Math.PI / 2;
    g.beginPath();
    for (var i = 0; i < pts * 2; i++) {
      var r = i % 2 === 0 ? rOut : rIn;
      var a = rot + (i * Math.PI) / pts;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  };

  // Cartoon outlined text. Arabic always uses rtl + Fredoka composite font in one call.
  A.text = function (g, s, x, y, size, color, o) {
    o = o || {};
    s = String(s);
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    g.direction = /[\u0600-\u06FF]/.test(s) ? 'rtl' : 'ltr';
    if (o.stroke !== false) {
      g.lineJoin = 'round';
      g.lineWidth = o.lw || Math.max(4, size * 0.2);
      g.strokeStyle = o.stroke || INK;
      g.strokeText(s, x, y);
    }
    g.fillStyle = color || '#ffffff';
    g.fillText(s, x, y);
    g.direction = 'ltr';
  };

  A.glowSprite = function (color) {
    var key = 'gl_' + color;
    if (!cache[key]) {
      var c = makeCanvas(128, 128), g = c.getContext('2d');
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, rgba(color, 0.85));
      gr.addColorStop(0.35, rgba(color, 0.38));
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

  /* --------------------------------------------------- Playroom Backdrops */
  function drawCloud(g, x, y, s) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = 'rgba(255,255,255,0.88)';
    g.beginPath();
    g.arc(0, 0, 26, 0, TAU);
    g.arc(24, -6, 32, 0, TAU);
    g.arc(54, 0, 24, 0, TAU);
    g.fill();
    g.restore();
  }

  function drawWorldScene(g, worldIdx) {
    var wd = TC.WORLDS[worldIdx] || TC.WORLDS[0];
    var rnd = seeded(41 + worldIdx * 97);
    var gy = TC.GROUND_Y;

    // Warm nursery / playroom sky wall gradient
    var wallGr = g.createLinearGradient(0, 0, 0, gy);
    wallGr.addColorStop(0, wd.bg0);
    wallGr.addColorStop(1, wd.bg1);
    g.fillStyle = wallGr;
    g.fillRect(0, 0, W, gy);

    // Subtle playful wallpaper stars & dots
    for (var i = 0; i < 28; i++) {
      var wx = 40 + rnd() * (W - 80), wy = 50 + rnd() * (gy - 140);
      if (i % 3 === 0) {
        A.starPath(g, wx, wy, 5, 8 + rnd() * 5, 4 + rnd() * 2.5, rnd() * 3);
        g.fillStyle = rgba(wd.color, 0.16);
        g.fill();
      } else {
        A.circle(g, wx, wy, 4 + rnd() * 4);
        g.fillStyle = 'rgba(255,255,255,0.42)';
        g.fill();
      }
    }

    if (worldIdx === 0) {
      // World 0: سجادة الغرفة — Sunny playroom window + toy shelf + cozy stitched rug
      A.rr(g, 515, 86, 250, 172, 22);
      g.fillStyle = '#bae6fd'; g.fill();
      g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
      drawCloud(g, 548, 152, 0.72);
      drawCloud(g, 660, 132, 0.58);
      g.beginPath();
      g.moveTo(640, 86); g.lineTo(640, 258);
      g.moveTo(515, 172); g.lineTo(765, 172);
      g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.stroke();
      A.rr(g, 503, 252, 274, 16, 8);
      g.fillStyle = '#f8fafc'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#cbd5e1'; g.stroke();

      // Distant pastel toy silhouettes on baseboard shelf
      var shelfY = gy - 78;
      A.rr(g, 260, shelfY, 170, 12, 6);
      g.fillStyle = '#fed7aa'; g.fill();
      A.rr(g, 285, shelfY - 34, 34, 34, 6); g.fillStyle = 'rgba(255,93,115,0.35)'; g.fill();
      A.rr(g, 325, shelfY - 48, 32, 48, 6); g.fillStyle = 'rgba(56,189,248,0.35)'; g.fill();
      A.circle(g, 392, shelfY - 22, 22); g.fillStyle = 'rgba(251,191,36,0.4)'; g.fill();

      A.rr(g, 850, shelfY, 170, 12, 6);
      g.fillStyle = '#fed7aa'; g.fill();
      A.rr(g, 882, shelfY - 40, 38, 40, 8); g.fillStyle = 'rgba(52,211,153,0.38)'; g.fill();
      A.starPath(g, 962, shelfY - 24, 5, 24, 11, -Math.PI / 2); g.fillStyle = 'rgba(168,85,247,0.32)'; g.fill();
    } else if (worldIdx === 1) {
      // World 1: رفّ الكتب — Giant colorful storybooks & hanging paper clouds
      var bookCols = ['#fb7185', '#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#2dd4bf'];
      var bx = 210;
      for (var b = 0; b < 13; b++) {
        var bw = 54 + Math.round(rnd() * 26);
        var bh = 150 + Math.round(rnd() * 95);
        var tilt = (b === 4 ? 0.08 : 0);
        g.save();
        g.translate(bx + bw / 2, gy - 26);
        g.rotate(tilt);
        A.rr(g, -bw / 2, -bh, bw - 4, bh, 8);
        g.fillStyle = rgba(bookCols[b % bookCols.length], 0.42);
        g.fill();
        A.rr(g, -bw / 2 + 6, -bh + 18, bw - 16, 14, 4);
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.fill();
        g.restore();
        bx += bw + 8;
        if (bx > 1030) break;
      }
      // Hanging paper clouds
      [340, 640, 940].forEach(function (cx, idx) {
        var cy = 128 + (idx % 2) * 24;
        g.beginPath(); g.moveTo(cx + 26, 0); g.lineTo(cx + 26, cy);
        g.lineWidth = 2.5; g.strokeStyle = 'rgba(180,120,40,0.35)'; g.stroke();
        drawCloud(g, cx, cy, 0.72);
      });
    } else if (worldIdx === 2) {
      // World 2: مملكة المكعبات — Distant studded brick towers & arches
      var tCols = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'];
      for (var ti = 0; ti < 9; ti++) {
        var tx = 210 + ti * 98;
        var th = 120 + ((ti * 47) % 110);
        var tc = tCols[ti % tCols.length];
        for (var s = 0; s < 3; s++) {
          A.rr(g, tx + 8 + s * 24, gy - 26 - th - 12, 16, 14, 4);
          g.fillStyle = rgba(tc, 0.36); g.fill();
        }
        A.rr(g, tx, gy - 26 - th, 82, th, 8);
        g.fillStyle = rgba(tc, 0.32); g.fill();
      }
      drawCloud(g, 330, 130, 0.75);
      drawCloud(g, 870, 118, 0.8);
    } else {
      // World 3: مسرح العرائس — Grand Puppet Stage velvet swags & hanging stars
      [360, 540, 740, 920].forEach(function (sx, idx) {
        var sy = 126 + (idx % 2) * 34;
        g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, sy);
        g.lineWidth = 2.5; g.strokeStyle = 'rgba(219,39,119,0.35)'; g.stroke();
        A.starPath(g, sx, sy, 5, 22, 10, -Math.PI / 2);
        g.fillStyle = '#fde047'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#ca8a04'; g.stroke();
      });
      // Top velvet curtain valance
      g.fillStyle = '#be123c';
      for (var sw = 0; sw < 10; sw++) {
        A.circle(g, 64 + sw * 128, 12, 82);
        g.fill();
      }
      g.strokeStyle = '#fbbf24'; g.lineWidth = 5;
      for (var sw2 = 0; sw2 < 10; sw2++) {
        g.beginPath();
        g.arc(64 + sw2 * 128, 12, 82, 0.15, Math.PI - 0.15);
        g.stroke();
      }
    }

    // Playroom baseboard trim
    g.fillStyle = '#fffbeb';
    g.fillRect(0, gy - 28, W, 28);
    g.fillStyle = '#e2e8f0';
    g.fillRect(0, gy - 28, W, 4);

    // Lower wooden playroom floor (underneath UI cards: y = gy..H)
    var floorGr = g.createLinearGradient(0, gy, 0, H);
    floorGr.addColorStop(0, '#eab376');
    floorGr.addColorStop(0.22, '#d99b56');
    floorGr.addColorStop(1, '#b87638');
    g.fillStyle = floorGr;
    g.fillRect(0, gy, W, H - gy);

    // Wood plank lines
    g.strokeStyle = 'rgba(110, 58, 18, 0.22)';
    g.lineWidth = 2;
    for (var py = gy + 46; py < H; py += 48) {
      g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke();
    }

    // Cozy Playroom Lane Rug / Bridge / Stage Runner at GROUND_Y!
    var rugColors = [
      { fill: '#38bdf8', edge: '#ffd23f', stripe: '#0284c7' },
      { fill: '#fbbf24', edge: '#ef4444', stripe: '#d97706' },
      { fill: '#34d399', edge: '#6366f1', stripe: '#059669' },
      { fill: '#f43f5e', edge: '#fde047', stripe: '#be123c' }
    ][worldIdx] || { fill: '#38bdf8', edge: '#ffd23f', stripe: '#0284c7' };

    A.rr(g, 38, gy - 18, W - 76, 56, 24);
    g.fillStyle = rugColors.edge; g.fill();
    g.lineWidth = 5; g.strokeStyle = INK; g.stroke();

    A.rr(g, 50, gy - 11, W - 100, 42, 18);
    g.fillStyle = rugColors.fill; g.fill();

    // Cheerful lane chevrons / stitches showing battle lane
    g.save();
    g.setLineDash([14, 14]);
    g.beginPath();
    g.moveTo(150, gy + 10);
    g.lineTo(W - 150, gy + 10);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.stroke();
    g.setLineDash([]);
    g.restore();

    // Rug tassels on left and right ends
    g.strokeStyle = '#fffbeb';
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (var ty = gy - 10; ty <= gy + 28; ty += 9) {
      g.beginPath();
      g.moveTo(24, ty); g.lineTo(38, ty);
      g.moveTo(W - 38, ty); g.lineTo(W - 24, ty);
      g.stroke();
    }
  }

  A.backdrop = function (worldIdx, ps) {
    worldIdx = TC.clamp(worldIdx | 0, 0, TC.WORLDS.length - 1);
    var key = 'bd_' + worldIdx + '_' + ps;
    if (!cache[key]) {
      var c = makeCanvas(W * ps, H * ps), g = c.getContext('2d');
      g.setTransform(ps, 0, 0, ps, 0, 0);
      drawWorldScene(g, worldIdx);
      cache[key] = c;
    }
    return cache[key];
  };

  /* --------------------------------------------------- Rooftop Toppers */
  A.drawTopper = function (g, topperId, x, y, dir, t, still) {
    g.save();
    g.translate(x, y);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    var bob = still ? 0 : Math.sin(t * 3.5) * 2.5;

    if (topperId === 'crown') {
      g.translate(0, bob * 0.5);
      g.beginPath();
      g.moveTo(-26, 0);
      g.lineTo(-30, -28);
      g.lineTo(-13, -14);
      g.lineTo(0, -34);
      g.lineTo(13, -14);
      g.lineTo(30, -28);
      g.lineTo(26, 0);
      g.closePath();
      g.fillStyle = '#ffd23f'; g.fill();
      g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      A.circle(g, 0, -14, 5); g.fillStyle = '#ff4d6d'; g.fill();
      A.circle(g, -16, -9, 4); g.fillStyle = '#38bdf8'; g.fill();
      A.circle(g, 16, -9, 4); g.fillStyle = '#34d399'; g.fill();
    } else if (topperId === 'dragon') {
      g.scale(dir, 1);
      g.translate(0, bob);
      // Cute chubby green plush dragon
      A.rr(g, -22, -34, 40, 34, 16);
      g.fillStyle = '#34d399'; g.fill();
      g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      // Belly patch
      A.rr(g, -8, -22, 22, 20, 9);
      g.fillStyle = '#fef08a'; g.fill();
      // Tiny orange wings
      g.beginPath();
      g.moveTo(-14, -22); g.lineTo(-32, -34); g.lineTo(-24, -12); g.closePath();
      g.fillStyle = '#fb923c'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      // Snout & eye
      A.circle(g, 16, -24, 11);
      g.fillStyle = '#34d399'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      A.circle(g, 14, -27, 3.5); g.fillStyle = INK; g.fill();
      A.circle(g, 15, -28, 1.3); g.fillStyle = '#fff'; g.fill();
    } else if (topperId === 'rocket') {
      g.translate(0, bob);
      // Fins
      g.beginPath();
      g.moveTo(-14, -6); g.lineTo(-26, 4); g.lineTo(-10, 0);
      g.moveTo(14, -6); g.lineTo(26, 4); g.lineTo(10, 0);
      g.fillStyle = '#ff5d73'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      // Rocket body
      g.beginPath();
      g.moveTo(0, -50);
      g.quadraticCurveTo(20, -28, 14, 0);
      g.lineTo(-14, 0);
      g.quadraticCurveTo(-20, -28, 0, -50);
      g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      // Nose cone & window
      g.beginPath();
      g.moveTo(0, -50); g.quadraticCurveTo(11, -38, 12, -32); g.lineTo(-12, -32); g.quadraticCurveTo(-11, -38, 0, -50);
      g.fillStyle = '#ff5d73'; g.fill(); g.stroke();
      A.circle(g, 0, -18, 7.5); g.fillStyle = '#38bdf8'; g.fill(); g.lineWidth = 3.5; g.stroke();
    } else if (topperId === 'windmill') {
      // Stick
      A.rr(g, -4, -34, 8, 34, 3);
      g.fillStyle = '#fef08a'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      // Spinning rainbow blades
      g.save();
      g.translate(0, -32);
      g.rotate(still ? 0.4 : t * 2.8 * dir);
      var wCols = ['#ff5d73', '#ffd23f', '#38bdf8', '#34d399'];
      for (var i = 0; i < 4; i++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0); g.lineTo(10, -24); g.lineTo(-6, -22); g.closePath();
        g.fillStyle = wCols[i]; g.fill();
        g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      }
      A.circle(g, 0, 0, 6); g.fillStyle = '#ffffff'; g.fill(); g.stroke();
      g.restore();
    } else if (topperId === 'duck') {
      g.scale(dir, 1);
      g.translate(0, bob);
      A.rr(g, -22, -26, 42, 26, 13);
      g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      A.circle(g, 8, -32, 15);
      g.fillStyle = '#ffd23f'; g.fill(); g.stroke();
      A.rr(g, 18, -34, 13, 9, 4.5);
      g.fillStyle = '#fb923c'; g.fill(); g.lineWidth = 3.5; g.stroke();
      A.circle(g, 12, -35, 3.5); g.fillStyle = INK; g.fill();
      A.circle(g, 13, -36, 1.3); g.fillStyle = '#fff'; g.fill();
    }
    g.restore();
  };

  /* --------------------------------------------------- Toy-Block Castles */
  A.castle = function (g, side, theme, topperId, t, still) {
    var dir = side.dir; // +1 for left castle, -1 for right castle
    var cx = side.idx === 0 ? 86 : W - 86;
    var gy = TC.GROUND_Y + 8;
    var hit = side.hitT > 0 && !still ? Math.sin(side.hitT * 45) * 5 : 0;
    var sq = side.hitT > 0 && !still ? 1 - side.hitT * 0.14 : 1;

    g.save();
    g.translate(cx + hit, gy);
    g.scale(1 + (1 - sq) * 0.4, sq);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    // Golden Wind-Up Key protruding from outer back of castle!
    var kx = -dir * 58, ky = -86;
    g.save();
    g.translate(kx, ky);
    var spinSpeed = (1.6 + side.keyLv * 1.8) * dir;
    var ang = still ? 0 : t * spinSpeed;
    // Key stem
    A.rr(g, dir > 0 ? -24 : 0, -7, 24, 14, 5);
    g.fillStyle = '#f59e0b'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    // Key bow (2 loops that squash with rotation for 3D wind-up illusion!)
    var bowScale = still ? 1 : 0.32 + 0.68 * Math.abs(Math.cos(ang));
    g.save();
    g.translate(-dir * 26, 0);
    g.scale(1, bowScale);
    A.circle(g, 0, -14, 14);
    g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    A.circle(g, 0, -14, 5.5);
    g.fillStyle = '#fef3c7'; g.fill(); g.lineWidth = 3; g.stroke();
    A.circle(g, 0, 14, 14);
    g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    A.circle(g, 0, 14, 5.5);
    g.fillStyle = '#fef3c7'; g.fill(); g.lineWidth = 3; g.stroke();
    g.restore();
    g.restore();

    // Side flanking block towers
    A.rr(g, -64, -146, 40, 146, 10);
    g.fillStyle = theme.wall; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    A.rr(g, 24, -146, 40, 146, 10);
    g.fillStyle = theme.wall; g.fill(); g.stroke();

    // Main central toy-block keep
    A.rr(g, -46, -172, 92, 172, 12);
    g.fillStyle = theme.wall; g.fill(); g.lineWidth = 5.5; g.strokeStyle = INK; g.stroke();

    // Decorative toy brick seams & colorful trim band
    A.rr(g, -48, -118, 96, 18, 7);
    g.fillStyle = theme.trim; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();

    // Battlement blocks across top of keep
    for (var b = -44; b <= 24; b += 32) {
      A.rr(g, b, -192, 24, 24, 6);
      g.fillStyle = theme.trim; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    }

    // Pointed conical toy roofs on flanking towers
    [-44, 44].forEach(function (tx) {
      g.beginPath();
      g.moveTo(tx - 26, -144);
      g.lineTo(tx, -196);
      g.lineTo(tx + 26, -144);
      g.closePath();
      g.fillStyle = theme.roof; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    });

    // Central pitched castle roof
    g.beginPath();
    g.moveTo(-40, -190);
    g.lineTo(0, -234);
    g.lineTo(40, -190);
    g.closePath();
    g.fillStyle = theme.roof; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();

    // Rooftop Topper!
    A.drawTopper(g, topperId || 'crown', 0, -232, dir, t, still);

    // Rooftop Confetti Cannon aimed toward the lane!
    g.save();
    g.translate(dir * 38, -162);
    var recoil = side.cannonAnim > 0 && !still ? -dir * side.cannonAnim * 14 : 0;
    g.translate(recoil, 0);
    g.rotate(dir * -0.38);
    A.rr(g, dir > 0 ? -8 : -28, -11, 36, 22, 8);
    g.fillStyle = '#fde047'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    A.rr(g, dir > 0 ? 20 : -32, -13, 12, 26, 5);
    g.fillStyle = '#ff5d73'; g.fill(); g.stroke();
    A.circle(g, 0, 8, 9);
    g.fillStyle = theme.door; g.fill(); g.stroke();
    g.restore();

    // Cheerful arched window
    A.rr(g, -14, -160, 28, 32, 14);
    g.fillStyle = '#fef9c3'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();

    // Toy Gate facing the lane
    var gx = dir * 18;
    g.beginPath();
    g.moveTo(gx - 24, 0);
    g.lineTo(gx - 24, -46);
    g.arc(gx, -46, 24, Math.PI, 0, false);
    g.lineTo(gx + 24, 0);
    g.closePath();
    g.fillStyle = theme.door; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();

    // Team star emblem above gate
    A.starPath(g, gx, -84, 5, 13, 6, -Math.PI / 2);
    g.fillStyle = side.idx === 0 ? '#38bdf8' : '#fb7185';
    g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();

    // Flash overlay on hit
    if (side.hitT > 0) {
      g.globalAlpha = Math.min(0.45, side.hitT * 1.4);
      A.rr(g, -64, -192, 128, 192, 12);
      g.fillStyle = '#ffffff'; g.fill();
      g.globalAlpha = 1;
    }

    g.restore();
  };

  /* -------------------------------------------- Drum Pad & Star Bubbles */
  A.drum = function (g, drum, t, still) {
    if (!drum || !drum.on) return;
    var x = drum.x, y = drum.y + 8;
    var ring = drum.ring || 0;
    var sq = ring > 0 && !still ? 1 + Math.sin(ring * 24) * 0.16 : 1;

    if (ring > 0 && !still) {
      var rk = 1 - ring / 0.5;
      g.save();
      g.globalAlpha = Math.max(0, 1 - rk);
      A.circle(g, x, y - 16, 28 + rk * 48);
      g.lineWidth = 5; g.strokeStyle = '#ffd23f'; g.stroke();
      g.restore();
    }

    g.save();
    g.translate(x, y);
    g.scale(sq, 2 - sq);
    // Snare drum cylinder
    A.rr(g, -44, -26, 88, 28, 10);
    g.fillStyle = '#ef4444'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    // Gold zigzag cords
    g.beginPath();
    for (var zx = -36; zx <= 28; zx += 16) {
      g.moveTo(zx, -22); g.lineTo(zx + 8, -4); g.lineTo(zx + 16, -22);
    }
    g.lineWidth = 3.5; g.strokeStyle = '#ffd23f'; g.stroke();
    // Bouncy cream drumhead ellipse
    g.beginPath();
    g.ellipse(0, -25, 44, 11, 0, 0, TAU);
    g.fillStyle = '#fffbeb'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
    g.beginPath();
    g.ellipse(0, -25, 26, 6, 0, 0, TAU);
    g.fillStyle = 'rgba(251,191,36,0.35)'; g.fill();
    g.restore();
  };

  A.bubble = function (g, b, t, still) {
    var pulse = still ? 1 : 1 + Math.sin(t * 5 + b.id) * 0.06;
    g.save();
    g.translate(b.x, b.y);
    g.scale(pulse, pulse);
    A.glow(g, 0, 0, 48, '#ffd23f', 0.45);
    // Iridescent soap bubble
    A.circle(g, 0, 0, 32);
    var gr = g.createRadialGradient(-10, -10, 4, 0, 0, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.55, 'rgba(125,211,252,0.38)');
    gr.addColorStop(0.85, 'rgba(244,114,182,0.48)');
    gr.addColorStop(1, 'rgba(253,224,71,0.75)');
    g.fillStyle = gr; g.fill();
    g.lineWidth = 3.5; g.strokeStyle = '#ffffff'; g.stroke();

    // Golden energy star inside
    A.starPath(g, 0, 2, 5, 17, 8, still ? -Math.PI / 2 : -Math.PI / 2 + Math.sin(t * 3 + b.id) * 0.25);
    g.fillStyle = '#ffd23f'; g.fill();
    g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();

    // Specular shine
    A.circle(g, -11, -12, 6);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
    g.restore();
  };

  /* --------------------------------------------------- 5 Toy Units + Boss */
  function drawUnitBody(g, type, side, opts) {
    opts = opts || {};
    var t = opts.t || 0;
    var still = !!opts.still;
    var anim = opts.anim || 0;
    var armored = !!opts.armored;
    var charging = !!opts.charging;
    var teamCol = side === 0 ? '#38bdf8' : '#fb7185';
    var teamDeep = side === 0 ? '#0284c7' : '#e11d48';
    var swing = anim > 0 ? Math.sin((anim / 0.3) * Math.PI) : 0;

    g.lineJoin = 'round';
    g.lineCap = 'round';

    if (type === 'duck') {
      // بطة الزنبرك — Speedy wind-up rubber duck
      // Spinning silver/gold wind-up key on its back!
      g.save();
      g.translate(-14, -26);
      g.rotate(-0.4 + (still ? 0 : Math.sin(t * 14) * 0.18));
      A.rr(g, -12, -3, 12, 6, 2);
      g.fillStyle = '#e2e8f0'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      var kSq = still ? 1 : 0.35 + 0.65 * Math.abs(Math.cos(t * 12));
      g.scale(1, kSq);
      A.circle(g, -14, -7, 6.5); g.fillStyle = '#ffd23f'; g.fill(); g.stroke();
      A.circle(g, -14, 7, 6.5); g.fillStyle = '#ffd23f'; g.fill(); g.stroke();
      g.restore();

      // Little toy wheels
      A.circle(g, -9, -5, 6); g.fillStyle = teamCol; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      A.circle(g, 9, -5, 6); g.fillStyle = teamCol; g.fill(); g.stroke();

      // Plump rubber duck body
      g.save();
      g.rotate(swing * 0.28);
      A.rr(g, -20, -30, 38, 24, 12);
      g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      // Team bandana collar
      A.rr(g, -4, -28, 16, 8, 4);
      g.fillStyle = teamCol; g.fill(); g.lineWidth = 3; g.stroke();
      // Wing
      g.beginPath();
      g.ellipse(-4, -18, 9, 6, -0.2, 0, TAU);
      g.fillStyle = '#f59e0b'; g.fill(); g.lineWidth = 3; g.stroke();
      // Head
      A.circle(g, 10, -36, 13);
      g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.stroke();
      // Orange beak
      A.rr(g, 19, -39, 13 + swing * 5, 8, 4);
      g.fillStyle = '#fb923c'; g.fill(); g.lineWidth = 3.5; g.stroke();
      // Cute eye
      A.circle(g, 13, -39, 3.2); g.fillStyle = INK; g.fill();
      A.circle(g, 14, -40, 1.2); g.fillStyle = '#fff'; g.fill();
      g.restore();
    } else if (type === 'frog') {
      // ضفدع الألوان — Paint-bubble lobber frog
      // Springy hind legs
      A.rr(g, -18, -14, 16, 12, 6);
      g.fillStyle = '#22c55e'; g.fill(); g.lineWidth = 3.8; g.strokeStyle = INK; g.stroke();
      // Plump frog body
      A.rr(g, -16, -34, 34, 28, 14);
      g.fillStyle = '#4ade80'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      // Cream belly
      A.rr(g, -4, -26, 18, 18, 8);
      g.fillStyle = '#dcfce7'; g.fill();
      // Team artist scarf
      A.rr(g, -12, -29, 28, 7, 3.5);
      g.fillStyle = teamCol; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      // Big frog eyes on top
      [-2, 10].forEach(function (ex) {
        A.circle(g, ex, -38, 8);
        g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
        A.circle(g, ex + 2, -38, 3.5); g.fillStyle = INK; g.fill();
      });
      // Cute artist beret in team color
      g.beginPath();
      g.ellipse(-4, -45, 13, 6, -0.22, 0, TAU);
      g.fillStyle = teamCol; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      // Paint bubble wand swinging forward
      g.save();
      g.translate(14, -22);
      g.rotate(-0.3 + swing * 0.85);
      A.rr(g, 0, -3, 18, 6, 3);
      g.fillStyle = '#fb923c'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      A.circle(g, 22, 0, 8);
      g.fillStyle = 'rgba(244,114,182,0.55)'; g.fill();
      g.lineWidth = 3.5; g.strokeStyle = '#ff5d73'; g.stroke();
      g.restore();
    } else if (type === 'bear') {
      // دبّ الوسادة — Chubby plush bear with pillow shield (+ armored block helmet!)
      // Round ears
      A.circle(g, -10, -56, 9); g.fillStyle = '#b45309'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      A.circle(g, 8, -56, 9); g.fillStyle = '#b45309'; g.fill(); g.stroke();
      // Chubby plush body & legs
      A.rr(g, -22, -40, 40, 38, 18);
      g.fillStyle = '#d97706'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      // Stitched cream tummy
      A.circle(g, -2, -21, 12);
      g.fillStyle = '#fde68a'; g.fill();
      // Bear head
      A.circle(g, 0, -44, 17);
      g.fillStyle = '#d97706'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      // Muzzle & button nose
      A.circle(g, 6, -41, 7.5); g.fillStyle = '#fef3c7'; g.fill();
      A.circle(g, 9, -43, 3.2); g.fillStyle = INK; g.fill();
      A.circle(g, 4, -48, 3.2); g.fillStyle = INK; g.fill();

      // Armored rival block-helmet in Worlds 3-4!
      if (armored) {
        A.rr(g, -17, -64, 34, 16, 6);
        g.fillStyle = '#6366f1'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
        A.rr(g, -9, -71, 18, 8, 3);
        g.fillStyle = '#ffd23f'; g.fill(); g.stroke();
      }

      // Big fluffy Pillow Shield held in front!
      g.save();
      g.translate(18 + swing * 8, -24);
      g.rotate(0.08 + swing * 0.2);
      A.rr(g, -11, -22, 24, 42, 10);
      g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      A.rr(g, -6, -16, 14, 30, 6);
      g.fillStyle = rgba(teamCol, 0.45); g.fill();
      A.starPath(g, 1, -1, 5, 7, 3.5, -Math.PI / 2);
      g.fillStyle = teamDeep; g.fill();
      g.restore();
    } else if (type === 'plane') {
      // طائرة الورق — Paper glider flying overhead
      // Fluttering team ribbon tail
      var wave = still ? 0 : Math.sin(t * 14) * 5;
      g.beginPath();
      g.moveTo(-22, -4);
      g.quadraticCurveTo(-34, -10 + wave, -44, -2 - wave * 0.6);
      g.lineWidth = 5; g.strokeStyle = teamCol; g.stroke();

      // Origami paper glider wings
      g.save();
      g.rotate(swing * 0.16);
      g.beginPath();
      g.moveTo(28, -4);
      g.lineTo(-24, -18);
      g.lineTo(-15, -2);
      g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();

      // Underside fold
      g.beginPath();
      g.moveTo(28, -4);
      g.lineTo(-15, -2);
      g.lineTo(-18, 10);
      g.closePath();
      g.fillStyle = '#cbd5e1'; g.fill(); g.lineWidth = 3.8; g.strokeStyle = INK; g.stroke();

      // Top far wing with team stripe
      g.beginPath();
      g.moveTo(28, -4);
      g.lineTo(-20, -24);
      g.lineTo(-12, -13);
      g.closePath();
      g.fillStyle = teamCol; g.fill(); g.lineWidth = 3.8; g.strokeStyle = INK; g.stroke();

      // Cute star sticker on wing
      A.starPath(g, -4, -9, 5, 6, 3, -Math.PI / 2);
      g.fillStyle = '#ffd23f'; g.fill();
      g.restore();
    } else if (type === 'train') {
      // قطار المكعبات — Mighty wooden toy locomotive
      if (charging && !still) {
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 4;
        for (var sl = 0; sl < 3; sl++) {
          var ly = -16 - sl * 14;
          g.beginPath(); g.moveTo(-48, ly); g.lineTo(-32, ly); g.stroke();
        }
      }
      // Cab block
      A.rr(g, -32, -56, 30, 44, 8);
      g.fillStyle = teamCol; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      A.rr(g, -36, -62, 38, 10, 5);
      g.fillStyle = '#ffd23f'; g.fill(); g.stroke();
      // Cab window with smiling conductor bear silhouette
      A.rr(g, -25, -48, 16, 16, 5);
      g.fillStyle = '#fef9c3'; g.fill(); g.lineWidth = 3.5; g.stroke();

      // Boiler block
      A.rr(g, -4, -40, 34, 28, 8);
      g.fillStyle = '#ef4444'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      A.rr(g, 6, -40, 8, 28, 3);
      g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 3; g.stroke();

      // Smokestack
      g.beginPath();
      g.moveTo(12, -40); g.lineTo(8, -58); g.lineTo(24, -58); g.lineTo(20, -40); g.closePath();
      g.fillStyle = '#fb923c'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();

      // Red cowcatcher bumper in front
      g.beginPath();
      g.moveTo(28, -12); g.lineTo(42 + swing * 6, -4); g.lineTo(28, -4); g.closePath();
      g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();

      // Chassis bar
      A.rr(g, -34, -14, 66, 9, 4);
      g.fillStyle = '#1e293b'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();

      // 3 Wooden wheels
      [-22, 0, 20].forEach(function (wx) {
        A.circle(g, wx, -8, 9.5);
        g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
        A.circle(g, wx, -8, 3); g.fillStyle = '#ef4444'; g.fill();
      });
      // Connecting rod
      var rodOff = still ? 0 : Math.cos(t * 14) * 3;
      g.beginPath(); g.moveTo(-22, -8 + rodOff); g.lineTo(20, -8 + rodOff);
      g.lineWidth = 3.5; g.strokeStyle = '#ffffff'; g.stroke();
    } else if (type === 'boss') {
      // ملك الألعاب — Giant Nutcracker / Tin Toy King Boss!
      // Royal cape
      g.beginPath();
      g.moveTo(-18, -74); g.lineTo(-44, -10); g.lineTo(-8, -12); g.closePath();
      g.fillStyle = '#be123c'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();

      // Giant golden wind-up key on back
      g.save();
      g.translate(-26, -54);
      A.circle(g, -12, -10, 10); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      A.circle(g, -12, 10, 10); g.fillStyle = '#ffd23f'; g.fill(); g.stroke();
      g.restore();

      // Boots & royal tunic
      A.rr(g, -22, -20, 18, 20, 6); g.fillStyle = '#312e81'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      A.rr(g, 4, -20, 18, 20, 6); g.fillStyle = '#312e81'; g.fill(); g.stroke();
      A.rr(g, -28, -74, 56, 56, 14);
      g.fillStyle = '#e11d48'; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
      // Gold buttons & belt
      A.rr(g, -28, -36, 56, 10, 4); g.fillStyle = '#1e1b4b'; g.fill();
      A.rr(g, -8, -38, 16, 14, 4); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 3; g.stroke();

      // Toy King Head + Crown
      A.rr(g, -22, -106, 44, 36, 14);
      g.fillStyle = '#fed7aa'; g.fill(); g.lineWidth = 4.5; g.strokeStyle = INK; g.stroke();
      // Eyes & cheerful curly mustache
      A.circle(g, 8, -90, 4); g.fillStyle = INK; g.fill();
      A.circle(g, -4, -90, 4); g.fillStyle = INK; g.fill();
      g.beginPath();
      g.moveTo(2, -80); g.quadraticCurveTo(14, -76, 18, -83);
      g.moveTo(2, -80); g.quadraticCurveTo(-10, -76, -14, -83);
      g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke();

      A.drawTopper(g, 'crown', 0, -104, 1, t, still);

      // Giant Squeaky Toy Hammer!
      g.save();
      g.translate(20, -54);
      g.rotate(-0.45 + swing * 1.25);
      A.rr(g, -4, -44, 8, 48, 4);
      g.fillStyle = '#fde047'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      A.rr(g, -18, -62, 36, 22, 9);
      g.fillStyle = '#8b5cf6'; g.fill(); g.lineWidth = 4.5; g.stroke();
      A.rr(g, 14, -60, 8, 18, 4);
      g.fillStyle = '#ffd23f'; g.fill(); g.stroke();
      g.restore();
    }
  }

  A.unit = function (g, u, t, still) {
    var shadowY = TC.GROUND_Y + 8;
    // Soft ground shadow (even for flying paper gliders!)
    g.save();
    g.fillStyle = u.side === 0 ? 'rgba(14, 116, 144, 0.24)' : 'rgba(159, 18, 57, 0.24)';
    g.beginPath();
    g.ellipse(u.x, shadowY, u.r * (u.flying ? 0.72 : 0.95), u.flying ? 5 : 7, 0, 0, TAU);
    g.fill();
    g.restore();

    var waddle = still || u.flying ? 0 : Math.abs(Math.sin(t * 10 + u.phase)) * 3.5;
    g.save();
    g.translate(u.x, u.y + 8 - waddle);
    g.scale(u.dir, 1);

    if (u.hurtT > 0 && !still) {
      g.scale(0.94, 1.06);
    }

    drawUnitBody(g, u.type, u.side, {
      t: t,
      still: still,
      anim: u.anim,
      armored: u.armored,
      charging: u.charging
    });

    if (u.hurtT > 0) {
      g.globalAlpha = Math.min(0.5, u.hurtT * 2);
      A.circle(g, 0, -24, u.r * 0.9);
      g.fillStyle = '#ffffff'; g.fill();
      g.globalAlpha = 1;
    }
    g.restore();

    // Clean HP bar above wounded units (and always on the Boss!)
    if (u.hp < u.hpMax || u.type === 'boss') {
      var bw = u.type === 'boss' ? 76 : 42;
      var bh = u.type === 'boss' ? 10 : 7;
      var by = u.y - (u.type === 'boss' ? 136 : u.type === 'train' || u.type === 'bear' ? 68 : u.flying ? 32 : 52);
      A.rr(g, u.x - bw / 2, by, bw, bh, bh / 2);
      g.fillStyle = 'rgba(30,27,75,0.82)'; g.fill();
      var pct = TC.clamp(u.hp / u.hpMax, 0, 1);
      if (pct > 0) {
        A.rr(g, u.x - bw / 2 + 1.5, by + 1.5, (bw - 3) * pct, bh - 3, (bh - 3) / 2);
        g.fillStyle = u.side === 0 ? '#38bdf8' : '#fb7185';
        g.fill();
      }
    }
  };

  /* --------------------------------------------------------- Projectiles */
  A.shot = function (g, sh, t, still) {
    var col = PALETTE[(sh.colorIdx || 0) % PALETTE.length];
    g.save();
    g.translate(sh.x, sh.y);
    if (sh.kind === 'paint') {
      A.glow(g, 0, 0, 22, col, 0.5);
      A.circle(g, 0, 0, 10);
      g.fillStyle = col; g.fill();
      g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      A.circle(g, -3, -3, 3.2);
      g.fillStyle = '#ffffff'; g.fill();
    } else if (sh.kind === 'confetti') {
      g.rotate(still ? 0.3 : t * 10);
      A.rr(g, -8, -8, 16, 16, 4);
      g.fillStyle = col; g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    } else {
      // Castle Confetti Cannon party shell!
      A.glow(g, 0, 0, 30, col, 0.7);
      g.rotate(still ? 0 : t * 12);
      A.starPath(g, 0, 0, 5, 15, 7, 0);
      g.fillStyle = col; g.fill();
      g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
    }
    g.restore();
  };

  /* --------------------------------------------------- UI Card Previews */
  A.unitIcon = function (c, type, side) {
    if (!c) return;
    var g = c.getContext('2d');
    var w = c.width, h = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.save();
    var scale = type === 'train' ? 0.92 : type === 'bear' ? 0.96 : 1.12;
    var oy = type === 'plane' ? h * 0.56 : h * 0.84;
    g.translate(w * 0.48, oy);
    g.scale(scale * (side === 1 ? -1 : 1) * (w / 96), scale * (h / 96));
    drawUnitBody(g, type, side || 0, { t: 0, still: true, anim: 0 });
    g.restore();
  };

  A.shopTile = function (c, kind, k, save) {
    if (!c) return;
    var g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 116, 116);
    var theme = TC.THEMES[kind === 'theme' ? k : save.theme];
    var topId = TC.TOPPERS[kind === 'topper' ? k : save.topper].id;

    // Sky pill background
    A.rr(g, 4, 4, 108, 108, 18);
    g.fillStyle = '#e0f2fe'; g.fill();

    if (kind === 'theme') {
      g.save();
      g.translate(62, 104);
      g.scale(0.35, 0.35);
      g.translate(-86, -(TC.GROUND_Y + 8));
      A.castle(g, { idx: 0, dir: 1, keyLv: 1, hitT: 0, cannonAnim: 0 }, theme, topId, 0, true);
      g.restore();
    } else {
      // Zoom in on castle rooftop + topper
      g.save();
      g.translate(58, 96);
      g.scale(1.12, 1.12);
      g.beginPath();
      g.moveTo(-34, 0); g.lineTo(0, -32); g.lineTo(34, 0); g.closePath();
      g.fillStyle = theme.roof; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      A.drawTopper(g, topId, 0, -30, 1, 0, true);
      g.restore();
    }
  };
})();
