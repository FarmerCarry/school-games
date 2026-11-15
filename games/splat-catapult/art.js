/* Splat Catapult (مقلاع الألوان) procedural cartoon art:
 * Cached offscreen backdrops for all 4 worlds, 5 slingshot frames, 5 trick balloon types
 * with 6 shop skins, wood/ice/stone fort blocks, expressive silly paint-bots, jelly pads,
 * fans, rainbow TNT barrels, cosmic portals, splats, and wordless coach icons. */
(function () {
  'use strict';
  var SC = window.SC, W = SC.W, H = SC.H, G = SC.GROUND, TAU = Math.PI * 2;
  var A = SC.art = {};
  var INK = A.INK = '#18163a';
  var cache = {};
  A.reset = function () { cache = {}; };

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function seeded(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function rgba(hex, a) {
    var n = parseInt((hex || '#ffffff').slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  A.rgba = rgba;

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
  A.circle = function (g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };
  A.star = function (g, x, y, r, ri, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : r;
      if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  };

  // Arabic-safe canvas text: always explicit direction and textAlign, Western digits, whole string.
  A.text = function (g, s, x, y, size, color, o) {
    o = o || {};
    var str = String(s);
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    g.direction = o.dir || (/[\u0600-\u06FF]/.test(str) ? 'rtl' : 'ltr');
    if (o.stroke !== false) {
      g.lineJoin = 'round';
      g.lineWidth = o.lw || Math.max(4, size * 0.22);
      g.strokeStyle = o.stroke || INK;
      g.strokeText(str, x, y);
    }
    g.fillStyle = color || '#ffffff';
    g.fillText(str, x, y);
    g.direction = 'rtl';
  };

  /* -------------------------------------------------------------- glows */
  A.glowSprite = function (color) {
    var key = 'gl' + color;
    if (!cache[key]) {
      var c = mkCanvas(128, 128), g = c.getContext('2d');
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, rgba(color, 0.85));
      gr.addColorStop(0.35, rgba(color, 0.35));
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

  /* ------------------------------------------------- 4 world backdrops */
  function drawCloud(g, x, y, s, col) {
    g.fillStyle = col || 'rgba(255,255,255,0.88)';
    g.beginPath();
    g.arc(x, y, 28 * s, 0, TAU);
    g.arc(x + 26 * s, y - 8 * s, 24 * s, 0, TAU);
    g.arc(x + 52 * s, y + 2 * s, 20 * s, 0, TAU);
    g.arc(x - 24 * s, y + 4 * s, 19 * s, 0, TAU);
    g.fill();
  }

  function paintWorld(g, wi) {
    var wd = SC.WORLDS[wi] || SC.WORLDS[0], rnd = seeded(401 + wi * 97), i;
    var sky = g.createLinearGradient(0, 0, 0, G);
    sky.addColorStop(0, wd.sky0);
    sky.addColorStop(1, wd.sky1);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    if (wi === 3) {
      // Space Citadel: stars, ringed planet, glowing nebula
      for (i = 0; i < 90; i++) {
        A.circle(g, rnd() * W, rnd() * (G - 60), 1 + rnd() * 2.2);
        g.fillStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.65).toFixed(2) + ')';
        g.fill();
      }
      A.glow(g, 980, 170, 130, '#a855f7', 0.55);
      g.save();
      g.translate(980, 170);
      g.rotate(-0.28);
      A.circle(g, 0, 0, 48);
      g.fillStyle = '#38bdf8'; g.fill();
      g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.ellipse(0, 4, 88, 18, 0, -0.2, Math.PI + 0.2);
      g.lineWidth = 9; g.strokeStyle = '#f472b6'; g.stroke();
      g.restore();
    } else {
      // Sun / Candy moon & fluffy clouds
      var sunX = wi === 1 ? 1040 : 220, sunY = 130;
      A.glow(g, sunX, sunY, 120, '#fff4a3', 0.7);
      A.circle(g, sunX, sunY, 46);
      g.fillStyle = wi === 1 ? '#fff0f8' : '#ffe45e';
      g.fill();
      var clCol = wi === 1 ? 'rgba(255,255,255,0.78)' : wi === 2 ? 'rgba(255,248,230,0.82)' : 'rgba(255,255,255,0.88)';
      drawCloud(g, 170, 155, 1.05, clCol);
      drawCloud(g, 540, 110, 1.25, clCol);
      drawCloud(g, 920, 165, 0.95, clCol);
      drawCloud(g, 1160, 118, 0.8, clCol);
    }

    // Far hills
    g.beginPath();
    g.moveTo(0, G);
    g.quadraticCurveTo(220, G - 185, 470, G - 95);
    g.quadraticCurveTo(760, G - 10, 1020, G - 165);
    g.quadraticCurveTo(1170, G - 210, W, G - 110);
    g.lineTo(W, G);
    g.closePath();
    g.fillStyle = wd.hill0;
    g.fill();

    // World silhouette details on mid hills
    if (wi === 1) {
      // Jelly domes
      [[340, G - 95, 58, '#3df0ff'], [1040, G - 118, 70, '#ffd23f']].forEach(function (d) {
        g.beginPath(); g.arc(d[0], d[1], d[2], Math.PI, 0); g.closePath();
        g.fillStyle = rgba(d[3], 0.55); g.fill();
        g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.65)'; g.stroke();
      });
    } else if (wi === 2) {
      // Distant windmills
      [330, 1060].forEach(function (wx) {
        g.fillStyle = '#a35214';
        g.beginPath(); g.moveTo(wx - 22, G - 40); g.lineTo(wx - 12, G - 150); g.lineTo(wx + 12, G - 150); g.lineTo(wx + 22, G - 40); g.closePath(); g.fill();
        g.strokeStyle = '#fff5d6'; g.lineWidth = 5;
        for (var k = 0; k < 4; k++) {
          var a = 0.4 + k * Math.PI / 2;
          g.beginPath(); g.moveTo(wx, G - 138); g.lineTo(wx + Math.cos(a) * 46, G - 138 + Math.sin(a) * 46); g.stroke();
        }
      });
    }

    // Near hills
    g.beginPath();
    g.moveTo(0, G);
    g.quadraticCurveTo(180, G - 75, 390, G - 36);
    g.quadraticCurveTo(660, G + 10, 910, G - 72);
    g.quadraticCurveTo(1110, G - 110, W, G - 42);
    g.lineTo(W, G);
    g.closePath();
    g.fillStyle = wd.hill1;
    g.fill();

    // Soil & turf strip
    g.fillStyle = wd.dirt;
    g.fillRect(0, G, W, H - G);
    g.fillStyle = wd.ground;
    g.fillRect(0, G, W, 24);
    for (i = 0; i < 28; i++) {
      var gx = i * 48 + (i % 2) * 14;
      A.circle(g, gx, G + 22, 14);
      g.fillStyle = wd.ground;
      g.fill();
    }
    g.beginPath(); g.moveTo(0, G); g.lineTo(W, G);
    g.lineWidth = 5; g.strokeStyle = INK; g.stroke();

    // Decorative pebbles & grass blades
    for (i = 0; i < 22; i++) {
      A.rr(g, 30 + rnd() * (W - 60), G + 34 + rnd() * 34, 18 + rnd() * 20, 9, 4.5);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fill();
    }
  }

  A.backdrop = function (worldIdx, ps) {
    var key = 'bg|' + worldIdx + '|' + ps;
    if (!cache[key]) {
      var c = mkCanvas(W * ps, H * ps), g = c.getContext('2d');
      g.setTransform(ps, 0, 0, ps, 0, 0);
      paintWorld(g, worldIdx);
      cache[key] = c;
    }
    return cache[key];
  };

  /* ----------------------------------------------- gadgets & fort parts */
  A.splat = function (g, sp) {
    var rnd = seeded(sp.seed || 11), r = sp.r;
    g.save();
    g.translate(sp.x, sp.y);
    g.fillStyle = rgba(sp.color, 0.82);
    A.circle(g, 0, 0, r * 0.62);
    g.fill();
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * TAU + rnd() * 0.7, d = r * (0.42 + rnd() * 0.36);
      A.circle(g, Math.cos(a) * d, Math.sin(a) * d * 0.65, r * (0.16 + rnd() * 0.18));
      g.fill();
    }
    g.restore();
  };

  A.plat = function (g, pl) {
    var x = pl.x - pl.w / 2, y = pl.y - pl.h / 2;
    A.rr(g, x, y, pl.w, pl.h, 8);
    g.fillStyle = '#5c5887'; g.fill();
    g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    A.rr(g, x + 5, y + 4, Math.max(8, pl.w - 10), Math.max(4, pl.h * 0.32), 4);
    g.fillStyle = '#8b86b8'; g.fill();
  };

  A.jelly = function (g, je, t, still) {
    var wob = still ? 0 : Math.sin(t * 22) * je.wobble * 0.22;
    g.save();
    g.translate(je.x, je.y);
    g.scale(1 + wob, 1 - wob * 0.85);
    A.rr(g, -je.w / 2, -je.h / 2, je.w, je.h, 12);
    g.fillStyle = '#ff5db1'; g.fill();
    g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    A.rr(g, -je.w / 2 + 8, -je.h / 2 + 4, Math.max(10, je.w - 16), Math.max(5, je.h * 0.35), 6);
    g.fillStyle = 'rgba(255,255,255,0.62)'; g.fill();
    // Little bounce arrow chevron
    g.beginPath();
    var ax = je.nx * 7, ay = je.ny * 7;
    g.moveTo(-8 - ay, -ax); g.lineTo(ax, ay); g.lineTo(8 + ay, -ax);
    g.lineWidth = 3.5; g.lineCap = 'round'; g.strokeStyle = '#ffd23f'; g.stroke();
    g.restore();
  };

  A.fan = function (g, fn, windScale, t, still) {
    var x0 = fn.x - fn.w / 2, y0 = fn.y - fn.h / 2;
    g.save();
    A.rr(g, x0, y0, fn.w, fn.h, 18);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
    g.setLineDash([8, 10]);
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
    g.setLineDash([]);

    // Animated wind streamlines
    var ang = Math.atan2(fn.fy, fn.fx), len = 34;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3; g.lineCap = 'round';
    for (var i = 0; i < 5; i++) {
      var u = ((still ? 0.4 : t * 0.9 * Math.max(0.4, windScale)) + i * 0.21) % 1;
      var lx = x0 + fn.w * (0.2 + ((i * 37) % 60) / 100) + Math.cos(ang) * (u - 0.5) * (fn.w * 0.55);
      var ly = y0 + fn.h * (1 - u);
      if (Math.abs(fn.fx) > Math.abs(fn.fy)) {
        lx = x0 + fn.w * (fn.fx > 0 ? u : 1 - u);
        ly = y0 + fn.h * (0.2 + i * 0.15);
      }
      g.beginPath();
      g.moveTo(lx, ly);
      g.lineTo(lx + Math.cos(ang) * len, ly + Math.sin(ang) * len);
      g.stroke();
    }

    // Propeller base at upstream edge
    var bx = Math.abs(fn.fx) > Math.abs(fn.fy) ? (fn.fx > 0 ? x0 + 14 : x0 + fn.w - 14) : fn.x;
    var by = Math.abs(fn.fx) > Math.abs(fn.fy) ? fn.y : y0 + fn.h - 14;
    g.translate(bx, by);
    A.rr(g, -24, -12, 48, 24, 9);
    g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    g.rotate(still ? 0.5 : fn.phase);
    for (var b = 0; b < 3; b++) {
      g.rotate(TAU / 3);
      A.rr(g, 2, -5, 19, 10, 5);
      g.fillStyle = '#38bdf8'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    }
    A.circle(g, 0, 0, 6); g.fillStyle = '#ff4d8d'; g.fill(); g.stroke();
    g.restore();
  };

  A.portal = function (g, po, t, still) {
    // Faint connecting star-thread
    g.save();
    g.setLineDash([6, 12]);
    g.beginPath(); g.moveTo(po.ax, po.ay); g.lineTo(po.bx, po.by);
    g.lineWidth = 3; g.strokeStyle = rgba(po.color, 0.35); g.stroke();
    g.setLineDash([]);
    g.restore();

    [[po.ax, po.ay, 1], [po.bx, po.by, -1]].forEach(function (pt) {
      var x = pt[0], y = pt[1], dir = pt[2], r = po.r;
      A.glow(g, x, y, r * 1.7, po.color, 0.65);
      g.save();
      g.translate(x, y);
      g.rotate((still ? 0.3 : po.phase) * dir);
      A.circle(g, 0, 0, r);
      g.fillStyle = '#140e38'; g.fill();
      g.lineWidth = 6; g.strokeStyle = po.color; g.stroke();
      for (var k = 0; k < 4; k++) {
        var a = (k / 4) * TAU;
        g.beginPath();
        g.arc(0, 0, r * 0.68, a, a + 0.9);
        g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke();
      }
      A.circle(g, 0, 0, r * 0.32);
      g.fillStyle = po.color; g.fill();
      g.restore();
    });
  };

  A.barrel = function (g, ba, t, still) {
    if (!ba.alive) return;
    var r = ba.r, pulse = still ? 1 : 1 + Math.sin(t * 6) * 0.03;
    g.save();
    g.translate(ba.x, ba.y);
    g.scale(pulse, 2 - pulse);
    A.rr(g, -r * 0.88, -r, r * 1.76, r * 2, 10);
    g.fillStyle = '#ff4757'; g.fill();
    g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    // Rainbow bands
    ['#ffd23f', '#3ddc84', '#24c8ff'].forEach(function (c, i) {
      g.fillStyle = c;
      g.fillRect(-r * 0.78, -r * 0.55 + i * r * 0.42, r * 1.56, r * 0.24);
    });
    A.rr(g, -r * 0.88, -r, r * 1.76, r * 2, 10);
    g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    A.star(g, 0, 0, 11, 5, 0);
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    g.restore();
  };

  A.block = function (g, bl) {
    if (!bl.alive) return;
    var m = SC.MATS[bl.mat] || SC.MATS.wood, w = bl.w, h = bl.h;
    g.save();
    g.translate(bl.x, bl.y);
    g.rotate(bl.rot || 0);
    A.rr(g, -w / 2, -h / 2, w, h, 6);
    g.fillStyle = m.color; g.fill();
    // Highlight strip
    A.rr(g, -w / 2 + 4, -h / 2 + 4, Math.max(4, w - 8), Math.max(4, Math.min(10, h * 0.28)), 4);
    g.fillStyle = m.hi; g.fill();
    if (bl.paint) {
      A.circle(g, w * 0.14, 0, Math.min(w, h) * 0.34);
      g.fillStyle = rgba(bl.paint, 0.55); g.fill();
    }
    // Damage cracks
    if (bl.hp < bl.maxHp * 0.85) {
      g.beginPath();
      g.moveTo(-w * 0.2, -h * 0.25); g.lineTo(2, 0); g.lineTo(-w * 0.1, h * 0.26);
      if (bl.hp < bl.maxHp * 0.48) { g.moveTo(2, 0); g.lineTo(w * 0.24, -h * 0.12); }
      g.lineWidth = 2.5; g.strokeStyle = m.stroke; g.stroke();
    }
    A.rr(g, -w / 2, -h / 2, w, h, 6);
    g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
    g.restore();
  };

  A.bot = function (g, b, t, still, threat, isDuel) {
    if (!b.alive) return;
    var r = b.r, sq = still ? 0 : Math.sin(t * 4.5 + b.id * 1.7) * 0.04;
    var bodyCol = isDuel ? (b.side === 1 ? '#ff7ab6' : '#67e8f9') : (b.boss ? '#ffd23f' : '#7ef29d');
    var rimCol = isDuel ? (b.side === 1 ? '#e11d74' : '#0284c7') : (b.boss ? '#f59e0b' : '#16a34a');
    g.save();
    g.translate(b.x, b.y);
    g.scale(1 + sq, 1 - sq);

    // Antenna or Boss Crown
    if (b.boss) {
      g.beginPath();
      g.moveTo(-16, -r + 4); g.lineTo(-19, -r - 15); g.lineTo(-7, -r - 6);
      g.lineTo(0, -r - 18); g.lineTo(7, -r - 6); g.lineTo(19, -r - 15); g.lineTo(16, -r + 4);
      g.closePath();
      g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
    } else {
      g.beginPath(); g.moveTo(0, -r); g.lineTo(0, -r - 11);
      g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      A.circle(g, 0, -r - 14, 5.5);
      g.fillStyle = rimCol; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    }

    // Ears/bolts
    A.rr(g, -r - 5, -6, 6, 12, 3); g.fillStyle = rimCol; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    A.rr(g, r - 1, -6, 6, 12, 3); g.fillStyle = rimCol; g.fill(); g.stroke();

    // Round body
    A.circle(g, 0, 0, r);
    g.fillStyle = b.flash > 0 ? '#ffffff' : bodyCol;
    g.fill();
    g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    if (b.paint && b.flash <= 0) {
      A.circle(g, r * 0.3, r * 0.25, r * 0.36);
      g.fillStyle = rgba(b.paint, 0.65); g.fill();
    }
    // Gloss
    A.circle(g, -r * 0.34, -r * 0.36, r * 0.22);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();

    // Expressive eyes & mouth
    var scared = threat && Math.hypot(threat.x - b.x, threat.y - b.y) < 230;
    var lx = threat ? SC.clamp((threat.x - b.x) / 140, -1, 1) * 2.2 : 0;
    var ly = threat ? SC.clamp((threat.y - b.y) / 140, -1, 1) * 2.2 : 0;
    if (b.flash > 0) {
      g.lineWidth = 3; g.strokeStyle = INK;
      [-7, 7].forEach(function (ex) {
        g.beginPath(); g.moveTo(ex - 4, -6); g.lineTo(ex + 4, 2); g.moveTo(ex + 4, -6); g.lineTo(ex - 4, 2); g.stroke();
      });
    } else {
      [-7.5, 7.5].forEach(function (ex) {
        A.circle(g, ex, -3, 5.5); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
        A.circle(g, ex + lx, -3 + ly, 2.6); g.fillStyle = INK; g.fill();
      });
    }
    if (scared || b.flash > 0) {
      A.circle(g, 0, 9, 5); g.fillStyle = INK; g.fill();
    } else {
      A.rr(g, -8, 6, 16, 7, 3.5); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    }
    g.restore();
  };

  /* ------------------------------------------- slingshot & 5 balloons */
  A.slingBack = function (g, sl, pouch, frameIdx, dir) {
    var fr = SC.FRAMES[frameIdx] || SC.FRAMES[0];
    var bx = sl.x + 15 * dir, by = sl.y - 10;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    // Back fork prong
    g.beginPath(); g.moveTo(sl.x, sl.y + 34); g.lineTo(bx, by);
    g.lineWidth = 18; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 11; g.strokeStyle = fr.c1; g.stroke();
    // Back elastic band
    if (pouch) {
      g.beginPath(); g.moveTo(bx, by); g.lineTo(pouch.x, pouch.y);
      g.lineWidth = 9; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 5; g.strokeStyle = fr.band; g.stroke();
    }
    g.restore();
  };

  A.slingFront = function (g, sl, pouch, frameIdx, dir) {
    var fr = SC.FRAMES[frameIdx] || SC.FRAMES[0];
    var fx = sl.x - 14 * dir, fy = sl.y - 6;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (pouch) {
      // Leather pouch cup behind front band
      A.circle(g, pouch.x - 4 * dir, pouch.y + 2, 12);
      g.fillStyle = '#5c2d16'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.moveTo(pouch.x, pouch.y); g.lineTo(fx, fy);
      g.lineWidth = 9; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 5; g.strokeStyle = fr.band; g.stroke();
    }
    // Base pedestal + main stem + front fork prong
    A.rr(g, sl.x - 28, G - 18, 56, 20, 9);
    g.fillStyle = fr.c1; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    g.beginPath();
    g.moveTo(sl.x, G - 14); g.lineTo(sl.x, sl.y + 30); g.lineTo(fx, fy);
    g.lineWidth = 20; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 12; g.strokeStyle = fr.c0; g.stroke();
    g.restore();
  };

  A.balloon = function (g, type, x, y, r, skinIdx, o) {
    o = o || {};
    var sk = SC.SKINS[skinIdx] || SC.SKINS[0];
    var spec = SC.BALLOONS[type] || SC.BALLOONS.classic;
    var baseCol = type === 'classic' ? sk.tint : spec.color;
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);

    if (o.charged || o.slammed) A.glow(g, 0, 0, r * 2.1, spec.glow, 0.75);

    // Balloon knot at bottom
    g.beginPath();
    g.moveTo(-4, r - 1); g.lineTo(4, r - 1); g.lineTo(7, r + 6); g.lineTo(-7, r + 6); g.closePath();
    g.fillStyle = baseCol; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();

    // Main body
    A.circle(g, 0, 0, r);
    g.fillStyle = baseCol; g.fill();

    // Skin / Type markings clipped inside circle
    g.save();
    A.circle(g, 0, 0, r - 1);
    g.clip();
    if (type === 'heavy') {
      g.strokeStyle = '#15803d'; g.lineWidth = 5;
      [-r * 0.55, 0, r * 0.55].forEach(function (sx) {
        g.beginPath(); g.moveTo(sx, -r); g.quadraticCurveTo(sx * 1.35, 0, sx, r); g.stroke();
      });
    } else if (type === 'triple') {
      [-7, 0, 7].forEach(function (bx, i) {
        A.circle(g, bx, -r * 0.45 + (i === 1 ? -3 : 2), 4.5);
        g.fillStyle = '#bae6fd'; g.fill();
      });
    } else if (type === 'bouncy') {
      A.circle(g, 0, 0, r * 0.68);
      g.lineWidth = 3; g.strokeStyle = '#fef08a'; g.stroke();
    } else if (type === 'magnet') {
      g.strokeStyle = '#f5d0fe'; g.lineWidth = 4;
      g.beginPath(); g.arc(0, 2, r * 0.52, Math.PI * 0.85, Math.PI * 0.15, true); g.stroke();
    } else {
      // Shop skin pattern on classic balloon (and subtle accent)
      g.fillStyle = 'rgba(255,255,255,0.34)';
      if (sk.pattern === 'dots') { A.circle(g, 7, 6, 4); g.fill(); A.circle(g, -8, 8, 3); g.fill(); }
      else if (sk.pattern === 'stars') { A.star(g, 7, 7, 6, 3, 0.2); g.fill(); }
      else if (sk.pattern === 'stripes') { g.fillRect(-r, -3, r * 2, 6); }
      else if (sk.pattern === 'rainbow') {
        ['#ff4d8d', '#ffd23f', '#3ddc84', '#24c8ff'].forEach(function (rc, idx) {
          g.fillStyle = rgba(rc, 0.5); g.fillRect(-r, -r + idx * (r * 0.5), r * 2, r * 0.5);
        });
      }
    }
    g.restore();

    // Outline & shine
    A.circle(g, 0, 0, r);
    g.lineWidth = 3.8; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.ellipse(-r * 0.34, -r * 0.34, r * 0.2, r * 0.3, -0.5, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.68)'; g.fill();

    // Cute tiny eyes
    if (!o.noFace) {
      [-4.8, 4.8].forEach(function (ex) {
        A.circle(g, ex, -1, 2.5); g.fillStyle = INK; g.fill();
      });
      if (type === 'heavy') {
        g.beginPath(); g.moveTo(-8, -5); g.lineTo(-2, -3); g.moveTo(8, -5); g.lineTo(2, -3);
        g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
      } else {
        g.beginPath(); g.arc(0, 2, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
        g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
      }
    }
    g.restore();
  };

  A.vortex = function (g, vx) {
    var k = 1 - vx.t / vx.dur;
    g.save();
    g.translate(vx.x, vx.y);
    for (var i = 1; i <= 3; i++) {
      A.circle(g, 0, 0, vx.r * (i / 3) * k);
      g.lineWidth = 4;
      g.strokeStyle = rgba(vx.color || '#a855f7', 0.55 * k);
      g.stroke();
    }
    g.restore();
  };

  A.arc = function (g, dots, color) {
    for (var i = 0; i < dots.length; i++) {
      var k = 1 - i / (dots.length + 3), r = 3.2 + k * 4.5;
      A.circle(g, dots[i].x, dots[i].y, r);
      g.fillStyle = '#ffffff'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = color || INK; g.stroke();
    }
  };

  /* --------------------------------------------------- coach & keycaps */
  A.hand = function (g, x, y, press, alpha) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x - 20, y - 4 + (press || 0) * 6);
    g.scale(0.76, 0.76);
    var parts = [[22, 5, 17, 52, 8.5], [37, 34, 15, 30, 7.5], [50, 38, 14, 28, 7], [14, 44, 52, 46, 18]];
    g.lineWidth = 9; g.lineJoin = 'round';
    [INK, '#ffffff'].forEach(function (c, pass) {
      g.fillStyle = c; g.strokeStyle = c;
      parts.forEach(function (p) { A.rr(g, p[0], p[1], p[2], p[3], p[4]); g.fill(); if (!pass) g.stroke(); });
    });
    g.restore();
  };

  A.keycap = function (g, x, y, label, w, lit) {
    w = w || 72;
    A.rr(g, x - w / 2, y - 20, w, 44, 10); g.fillStyle = '#9aa3c7'; g.fill();
    A.rr(g, x - w / 2, y - 24, w, 42, 10); g.fillStyle = lit ? '#ffd23f' : '#ffffff'; g.fill();
    g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    A.text(g, label, x, y - 3, label.length > 3 ? 20 : 24, INK, { stroke: false, dir: 'ltr' });
  };
})();
