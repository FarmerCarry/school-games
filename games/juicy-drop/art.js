/* Juicy Drop (سلّة الفواكه) procedural canvas art:
 * 10 expressive botanical fruit sprites (cached offscreen), 5 cute face packs,
 * 5 jar styles, helper cloud, ice cubes, honey bubbles, evolution ring & HUD cards. */
(function () {
  'use strict';
  var JD = window.JD, W = JD.W, H = JD.H, TAU = Math.PI * 2;
  var A = JD.art = {};
  var INK = A.INK = '#1e1538';
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

  A.starPath = function (g, x, y, ro, ri, pts, rot) {
    pts = pts || 5;
    g.beginPath();
    for (var i = 0; i < pts * 2; i++) {
      var a = (rot || 0) - Math.PI / 2 + (i * Math.PI) / pts;
      var rad = i % 2 ? ri : ro;
      if (i === 0) g.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      else g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    g.closePath();
  };

  // Crisp outlined text; Arabic always rendered whole in RTL with Fredoka composite font.
  A.text = function (g, s, x, y, size, color, o) {
    o = o || {};
    var str = String(s);
    g.font = (o.weight || 700) + ' ' + size + 'px Fredoka';
    g.textAlign = o.align || 'center';
    g.textBaseline = o.baseline || 'middle';
    g.direction = o.dir || (/[\u0600-\u06FF]/.test(str) ? 'rtl' : 'ltr');
    if (o.stroke !== false) {
      g.lineJoin = 'round';
      g.lineWidth = o.lw || Math.max(4, size * 0.22);
      g.strokeStyle = o.stroke || INK;
      g.strokeText(str, x, y);
    }
    g.fillStyle = color || '#ffffff';
    g.fillText(str, x, y);
  };

  /* ------------------------------------------------------------- Glows */
  A.glowSprite = function (color) {
    var key = 'gl_' + color;
    if (!cache[key]) {
      var c = makeCanvas(128, 128), g = c.getContext('2d');
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

  /* ---------------------------------------------------- World Backdrop */
  A.backdrop = function (worldIdx, ps) {
    var wi = JD.clamp(worldIdx | 0, 0, JD.WORLDS.length - 1);
    var key = 'bd_' + wi + '_' + ps;
    if (!cache[key]) {
      var wd = JD.WORLDS[wi];
      var c = makeCanvas(W * ps, H * ps), g = c.getContext('2d');
      g.setTransform(ps, 0, 0, ps, 0, 0);

      var sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, wd.bg0);
      sky.addColorStop(0.78, wd.bg1);
      sky.addColorStop(1, '#1a102b');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      // Soft sunbeams from top center
      g.save();
      g.translate(W / 2, -40);
      g.fillStyle = rgba(wd.color, 0.06);
      for (var b = 0; b < 9; b++) {
        var ang = -1.1 + b * 0.275;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(ang - 0.08) * 950, Math.sin(ang - 0.08) * 950);
        g.lineTo(Math.cos(ang + 0.08) * 950, Math.sin(ang + 0.08) * 950);
        g.closePath();
        g.fill();
      }
      g.restore();

      // Decorative orchard/ice/honeycomb bokeh in background
      var rnd = seeded(41 + wi * 97);
      for (var i = 0; i < 36; i++) {
        var bx = rnd() * W, by = rnd() * (H - 90), br = 8 + rnd() * 26;
        if (wi === 1) {
          // Frost crystals
          A.starPath(g, bx, by, br * 0.65, br * 0.25, 6, rnd());
          g.fillStyle = 'rgba(186,230,253,' + (0.05 + rnd() * 0.08).toFixed(2) + ')';
          g.fill();
        } else if (wi === 2) {
          // Honeycomb hexes
          A.starPath(g, bx, by, br * 0.7, br * 0.6, 3, Math.PI / 6);
          g.strokeStyle = 'rgba(251,191,36,' + (0.06 + rnd() * 0.08).toFixed(2) + ')';
          g.lineWidth = 2.5;
          g.stroke();
        } else {
          A.circle(g, bx, by, br);
          g.fillStyle = 'rgba(255,220,160,' + (0.04 + rnd() * 0.07).toFixed(2) + ')';
          g.fill();
        }
      }

      // Cozy kitchen/orchard wooden table shelf along bottom
      var ty = JD.FLOOR_Y + 4;
      g.fillStyle = wd.table;
      g.fillRect(0, ty, W, H - ty);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(0, ty, W, 8);
      g.fillStyle = 'rgba(0,0,0,0.24)';
      g.fillRect(0, ty + 18, W, H - ty - 18);
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(0, ty);
      g.lineTo(W, ty);
      g.stroke();

      // Soft shadow ellipse under the jar
      g.beginPath();
      g.ellipse(W / 2, ty + 12, 245, 13, 0, 0, TAU);
      g.fillStyle = 'rgba(15,10,30,0.42)';
      g.fill();

      cache[key] = c;
    }
    return cache[key];
  };

  /* ---------------------------------------- 10 Cached Fruit Body Sprites */
  function bodySprite(tier) {
    var key = 'fr_' + tier;
    if (cache[key]) return cache[key];
    var spec = JD.FRUITS[tier];
    var r = Math.max(36, spec.r);
    var pad = Math.ceil(r * 0.42);
    var sz = (r + pad) * 2;
    var cx = sz / 2, cy = sz / 2;
    var c = makeCanvas(sz * 2, sz * 2), g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Top stems/crowns behind the sphere for cherries, apples, pomegranates, figs, melons
    if (tier === 1) {
      // Cherry curved stem & leaf
      g.beginPath();
      g.moveTo(cx, cy - r * 0.85);
      g.quadraticCurveTo(cx + r * 0.25, cy - r * 1.32, cx + r * 0.5, cy - r * 1.24);
      g.lineWidth = Math.max(4, r * 0.16);
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = Math.max(2, r * 0.08);
      g.strokeStyle = '#66bb6a';
      g.stroke();
    } else if (tier === 5 || tier === 6) {
      // Orange / Apple stem & leaf
      g.beginPath();
      g.moveTo(cx, cy - r * 0.86);
      g.lineTo(cx + r * 0.06, cy - r * 1.14);
      g.lineWidth = r * 0.13;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = r * 0.07;
      g.strokeStyle = '#795548';
      g.stroke();

      g.save();
      g.translate(cx + r * 0.22, cy - r * 1.02);
      g.rotate(0.45);
      g.beginPath();
      g.ellipse(0, 0, r * 0.24, r * 0.12, 0, 0, TAU);
      g.fillStyle = spec.leaf;
      g.fill();
      g.lineWidth = Math.max(2.5, r * 0.06);
      g.strokeStyle = INK;
      g.stroke();
      g.restore();
    } else if (tier === 7) {
      // Pomegranate royal crown!
      g.beginPath();
      g.moveTo(cx - r * 0.32, cy - r * 0.84);
      g.lineTo(cx - r * 0.24, cy - r * 1.18);
      g.lineTo(cx - r * 0.08, cy - r * 0.96);
      g.lineTo(cx, cy - r * 1.22);
      g.lineTo(cx + r * 0.08, cy - r * 0.96);
      g.lineTo(cx + r * 0.24, cy - r * 1.18);
      g.lineTo(cx + r * 0.32, cy - r * 0.84);
      g.closePath();
      g.fillStyle = spec.color;
      g.fill();
      g.lineWidth = r * 0.07;
      g.strokeStyle = INK;
      g.stroke();
    } else if (tier === 8 || tier === 9) {
      // Melon / Watermelon curly vine stem
      g.beginPath();
      g.moveTo(cx, cy - r * 0.92);
      g.bezierCurveTo(cx - r * 0.1, cy - r * 1.18, cx + r * 0.22, cy - r * 1.18, cx + r * 0.14, cy - r * 1.03);
      g.lineWidth = r * 0.09;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = r * 0.045;
      g.strokeStyle = '#66bb6a';
      g.stroke();
    }

    // Main circular fruit body gradient
    var gr = g.createRadialGradient(cx - r * 0.32, cy - r * 0.34, r * 0.08, cx, cy, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.18, spec.glow);
    gr.addColorStop(0.58, spec.color);
    gr.addColorStop(1, spec.rim);

    A.circle(g, cx, cy, r);
    g.fillStyle = gr;
    g.fill();

    // Clipped interior botanical textures so silhouette collider stays 100% honest!
    g.save();
    A.circle(g, cx, cy, r - 2);
    g.clip();

    if (tier === 0) {
      // Blueberry crown star at top
      A.starPath(g, cx, cy - r * 0.68, r * 0.32, r * 0.14, 5, 0);
      g.fillStyle = '#1a237e';
      g.fill();
    } else if (tier === 2) {
      // Date warm vertical caramel ridges + golden cap
      g.strokeStyle = 'rgba(255,235,180,0.32)';
      g.lineWidth = r * 0.07;
      [-0.38, 0, 0.38].forEach(function (ox) {
        g.beginPath();
        g.arc(cx + ox * r * 1.5, cy, r * 1.1, -0.55, 0.55);
        g.stroke();
      });
      A.circle(g, cx, cy - r * 0.88, r * 0.26);
      g.fillStyle = '#ffd54f';
      g.fill();
    } else if (tier === 3) {
      // Fig soft magenta blush ribs + green neck
      A.circle(g, cx, cy + r * 0.22, r * 0.65);
      g.fillStyle = 'rgba(255,120,210,0.22)';
      g.fill();
      A.circle(g, cx, cy - r * 0.88, r * 0.28);
      g.fillStyle = '#8bc34a';
      g.fill();
    } else if (tier === 4 || tier === 5) {
      // Lemon / Orange citrus peel dimples
      g.fillStyle = tier === 4 ? 'rgba(180,130,0,0.22)' : 'rgba(180,60,0,0.22)';
      [[-0.55, -0.2], [-0.48, 0.35], [0.52, -0.25], [0.58, 0.28], [0.35, 0.55], [-0.3, 0.6]].forEach(function (p) {
        A.circle(g, cx + p[0] * r, cy + p[1] * r, r * 0.045);
        g.fill();
      });
    } else if (tier === 6) {
      // Apple top dimple shadow + warm yellow-pink blush
      g.beginPath();
      g.arc(cx, cy - r * 0.72, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
      g.lineWidth = r * 0.06;
      g.strokeStyle = 'rgba(120,10,25,0.45)';
      g.stroke();
    } else if (tier === 7) {
      // Pomegranate jewel seed sparkles along sides
      g.fillStyle = 'rgba(255,210,225,0.34)';
      [[-0.58, 0.1], [-0.46, 0.44], [0.56, 0.12], [0.44, 0.46]].forEach(function (p) {
        A.circle(g, cx + p[0] * r, cy + p[1] * r, r * 0.06);
        g.fill();
      });
    } else if (tier === 8) {
      // Melon honeydew criss-cross cream netting
      g.strokeStyle = 'rgba(245,255,220,0.42)';
      g.lineWidth = r * 0.045;
      for (var k = -2; k <= 2; k++) {
        g.beginPath();
        g.arc(cx + k * r * 0.45, cy, r * 1.05, 0, TAU);
        g.stroke();
      }
    } else if (tier === 9) {
      // Giant Watermelon iconic wavy dark-green stripes!
      g.strokeStyle = '#115e30';
      g.lineWidth = r * 0.13;
      [-0.66, -0.33, 0, 0.33, 0.66].forEach(function (sx) {
        g.beginPath();
        for (var sy = -r; sy <= r; sy += 10) {
          var wx = cx + sx * r * (1 - (sy * sy) / (r * r * 2.3)) + Math.sin(sy * 0.09) * r * 0.05;
          if (sy === -r) g.moveTo(wx, cy + sy);
          else g.lineTo(wx, cy + sy);
        }
        g.stroke();
      });
    }

    // Crisp glossy top-left highlight bean on every fruit
    g.save();
    g.translate(cx - r * 0.38, cy - r * 0.38);
    g.rotate(-0.65);
    g.beginPath();
    g.ellipse(0, 0, r * 0.24, r * 0.11, 0, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.68)';
    g.fill();
    g.restore();

    g.restore(); // end clip

    // Thick cartoon ink outline around fruit circle
    A.circle(g, cx, cy, r);
    g.lineWidth = Math.max(3, r * 0.075);
    g.strokeStyle = INK;
    g.stroke();

    var entry = { canvas: c, sz: sz, baseR: r };
    cache[key] = entry;
    return entry;
  }

  /* ------------------------------------------- 5 Expressive Face Packs */
  function drawFace(g, r, pack, mood, lx, ly) {
    var fs = Math.max(12, r * 0.44); // face unit scale
    var ex = fs * 0.56, ey = fs * 0.05;
    var px = JD.clamp(lx || 0, -1, 1) * fs * 0.14;
    var py = JD.clamp(ly || 0, -1, 1) * fs * 0.14;

    // Rosy cheeks
    g.fillStyle = 'rgba(255,90,140,0.52)';
    A.circle(g, -ex * 1.38, ey + fs * 0.34, fs * 0.22);
    g.fill();
    A.circle(g, ex * 1.38, ey + fs * 0.34, fs * 0.22);
    g.fill();

    g.lineCap = 'round';
    g.lineJoin = 'round';
    var lw = Math.max(2, fs * 0.14);

    if (mood === 'warn') {
      // Nervous wiggly face + tiny blue sweat drop when near overflow!
      [-ex, ex].forEach(function (x) {
        A.circle(g, x, ey, fs * 0.28);
        g.fillStyle = '#ffffff'; g.fill();
        g.lineWidth = lw * 0.8; g.strokeStyle = INK; g.stroke();
        A.circle(g, x, ey, fs * 0.12);
        g.fillStyle = INK; g.fill();
      });
      g.beginPath();
      g.moveTo(-fs * 0.36, ey + fs * 0.48);
      g.quadraticCurveTo(-fs * 0.18, ey + fs * 0.34, 0, ey + fs * 0.48);
      g.quadraticCurveTo(fs * 0.18, ey + fs * 0.62, fs * 0.36, ey + fs * 0.48);
      g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      // Sweat drop
      g.beginPath();
      g.moveTo(ex * 1.45, ey - fs * 0.55);
      g.quadraticCurveTo(ex * 1.7, ey - fs * 0.15, ex * 1.45, ey - fs * 0.08);
      g.quadraticCurveTo(ex * 1.2, ey - fs * 0.15, ex * 1.45, ey - fs * 0.55);
      g.fillStyle = '#38bdf8'; g.fill();
      return;
    }

    if (pack === 1) {
      // Pack 1: Cool Sunglasses!
      g.fillStyle = INK;
      A.rr(g, -ex - fs * 0.42, ey - fs * 0.28, fs * 0.78, fs * 0.52, fs * 0.14);
      g.fill();
      A.rr(g, ex - fs * 0.36, ey - fs * 0.28, fs * 0.78, fs * 0.52, fs * 0.14);
      g.fill();
      g.beginPath();
      g.moveTo(-fs * 0.15, ey - fs * 0.1);
      g.lineTo(fs * 0.15, ey - fs * 0.1);
      g.lineWidth = lw * 1.2; g.strokeStyle = INK; g.stroke();
      // Shiny lens diagonal reflection
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = lw * 0.85;
      [-ex - fs * 0.18, ex - fs * 0.12].forEach(function (sx) {
        g.beginPath();
        g.moveTo(sx, ey - fs * 0.16);
        g.lineTo(sx + fs * 0.22, ey + fs * 0.12);
        g.stroke();
      });
      // Confident cool grin
      g.beginPath();
      g.arc(0, ey + fs * 0.32, fs * 0.34, 0.12 * Math.PI, 0.82 * Math.PI);
      g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      return;
    }

    if (pack === 4) {
      // Pack 4: Sleepy Whiskers (cozy cat eyes + whiskers + :3 mouth)
      g.strokeStyle = INK;
      g.lineWidth = lw;
      [-ex, ex].forEach(function (x) {
        g.beginPath();
        if (mood === 'excited') g.arc(x, ey, fs * 0.24, Math.PI * 1.1, Math.PI * 1.9);
        else g.arc(x, ey - fs * 0.06, fs * 0.24, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
      });
      // Cute ':3' cat mouth
      g.beginPath();
      g.arc(-fs * 0.15, ey + fs * 0.36, fs * 0.15, 0.05 * Math.PI, 0.95 * Math.PI);
      g.arc(fs * 0.15, ey + fs * 0.36, fs * 0.15, 0.05 * Math.PI, 0.95 * Math.PI);
      g.stroke();
      // Whiskers
      g.lineWidth = Math.max(1.5, lw * 0.7);
      [-1, 1].forEach(function (s) {
        [-0.08, 0.14].forEach(function (wy) {
          g.beginPath();
          g.moveTo(s * ex * 1.35, ey + fs * (0.2 + wy));
          g.lineTo(s * ex * 1.95, ey + fs * (0.14 + wy * 1.5));
          g.stroke();
        });
      });
      return;
    }

    // Standard googly eyes for Pack 0 (Kawaii), Pack 2 (Starry), Pack 3 (Silly)
    [-1, 1].forEach(function (side) {
      var x = side * ex;
      if (pack === 3 && side === 1 && mood !== 'drop') {
        // Playful wink on right eye for Silly pack!
        g.beginPath();
        g.moveTo(x - fs * 0.22, ey - fs * 0.12);
        g.lineTo(x + fs * 0.18, ey + fs * 0.02);
        g.lineTo(x - fs * 0.22, ey + fs * 0.16);
        g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
        return;
      }
      var erx = fs * 0.31, ery = fs * (mood === 'excited' ? 0.38 : 0.35);
      g.beginPath();
      g.ellipse(x, ey, erx, ery, 0, 0, TAU);
      g.fillStyle = '#ffffff'; g.fill();
      g.lineWidth = Math.max(1.8, lw * 0.72); g.strokeStyle = INK; g.stroke();

      A.circle(g, x + px, ey + py, fs * 0.2);
      g.fillStyle = INK; g.fill();

      if (pack === 2) {
        // Twinkling golden star inside pupil!
        A.starPath(g, x + px, ey + py, fs * 0.16, fs * 0.07, 5, 0);
        g.fillStyle = '#ffd60a'; g.fill();
      } else {
        A.circle(g, x + px - fs * 0.06, ey + py - fs * 0.07, fs * 0.075);
        g.fillStyle = '#ffffff'; g.fill();
      }
    });

    // Mouth expression
    if (mood === 'drop') {
      A.circle(g, 0, ey + fs * 0.44, fs * 0.15);
      g.fillStyle = INK; g.fill();
    } else if (pack === 3) {
      // Silly tongue sticking out!
      g.beginPath();
      g.arc(0, ey + fs * 0.32, fs * 0.28, 0.08 * Math.PI, 0.92 * Math.PI);
      g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.beginPath();
      g.arc(fs * 0.06, ey + fs * 0.52, fs * 0.16, 0, Math.PI);
      g.closePath();
      g.fillStyle = '#ff5d8f'; g.fill();
      g.lineWidth = lw * 0.75; g.strokeStyle = INK; g.stroke();
    } else if (mood === 'excited' || mood === 'happy' || pack === 2) {
      g.beginPath();
      g.arc(0, ey + fs * 0.32, fs * 0.3, 0, Math.PI);
      g.closePath();
      g.fillStyle = INK; g.fill();
      g.beginPath();
      g.arc(0, ey + fs * 0.46, fs * 0.15, Math.PI, TAU);
      g.fillStyle = '#ff6b9d'; g.fill();
    } else {
      g.beginPath();
      g.arc(0, ey + fs * 0.28, fs * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
      g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    }
  }

  // Draw a complete expressive fruit at (x, y) with radius r.
  A.fruit = function (g, tier, x, y, r, o) {
    o = o || {};
    var spr = bodySprite(tier);
    var k = (r / spr.baseR) * (o.scale || 1);
    var sqX = o.squashX || 1, sqY = o.squashY || 1;
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    g.scale(sqX, sqY);
    var half = spr.sz * 0.5 * k;
    g.drawImage(spr.canvas, -half, -half, half * 2, half * 2);
    if (o.face !== false) {
      drawFace(g, r * (o.scale || 1), o.facePack || 0, o.mood || 'normal', o.lx || 0, o.ly || 0);
    }
    g.restore();
  };

  /* ---------------------------------------- Ice Cubes & Honey Bubbles */
  A.iceCube = function (g, ic, facePack, t, still) {
    var r = ic.r, fr = Math.min(r - 6, JD.FRUITS[ic.tier].r);
    var jiggle = ic.crackAnim > 0 && !still ? Math.sin(t * 50) * 3 * ic.crackAnim : 0;
    g.save();
    g.translate(ic.x + jiggle, ic.y);
    // Shivering trapped fruit inside
    A.fruit(g, ic.tier, 0, 2, fr, { facePack: facePack, mood: 'warn' });
    // Glossy translucent rounded ice-cube shell
    var side = r * 1.88;
    A.rr(g, -side / 2, -side / 2, side, side, r * 0.48);
    var gr = g.createLinearGradient(-r, -r, r, r);
    gr.addColorStop(0, 'rgba(224, 247, 255, 0.72)');
    gr.addColorStop(0.5, 'rgba(125, 211, 252, 0.46)');
    gr.addColorStop(1, 'rgba(56, 189, 248, 0.65)');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = ic.hp > 1 ? 5 : 3.5;
    g.strokeStyle = '#e0f2fe';
    g.stroke();
    A.rr(g, -side / 2, -side / 2, side, side, r * 0.48);
    g.lineWidth = 2.5;
    g.strokeStyle = INK;
    g.stroke();

    // Diagonal frost shine
    g.beginPath();
    g.moveTo(-r * 0.55, -r * 0.68);
    g.lineTo(-r * 0.15, -r * 0.68);
    g.lineTo(-r * 0.68, -r * 0.15);
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.fill();

    // Cracks if multi-layer ice took a hit (or hp === 1 on maxHp === 2)
    if (ic.hp < ic.maxHp) {
      g.beginPath();
      g.moveTo(-r * 0.4, -r * 0.5);
      g.lineTo(0, -r * 0.05);
      g.lineTo(r * 0.45, -r * 0.35);
      g.moveTo(0, -r * 0.05);
      g.lineTo(-r * 0.25, r * 0.5);
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.stroke();
    } else if (ic.hp > 1) {
      // Extra frost badge for double-thick ice
      A.circle(g, r * 0.58, -r * 0.58, 12);
      g.fillStyle = '#0284c7'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = '#fff'; g.stroke();
      A.text(g, '2', r * 0.58, -r * 0.56, 16, '#fff', { stroke: false });
    }
    g.restore();
  };

  A.honeyBubble = function (g, bu, t, still) {
    var r = bu.r + (still ? 0 : Math.sin(t * 5 + bu.wob) * 1.4);
    A.glow(g, bu.x, bu.y, r * 1.8, '#fbbf24', 0.45);
    var gr = g.createRadialGradient(bu.x - r * 0.3, bu.y - r * 0.3, 2, bu.x, bu.y, r);
    gr.addColorStop(0, 'rgba(255, 251, 235, 0.92)');
    gr.addColorStop(0.55, 'rgba(251, 191, 36, 0.52)');
    gr.addColorStop(1, 'rgba(217, 119, 6, 0.78)');
    A.circle(g, bu.x, bu.y, r);
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 2.8;
    g.strokeStyle = '#fde68a';
    g.stroke();
    A.circle(g, bu.x - r * 0.34, bu.y - r * 0.34, r * 0.22);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fill();
  };

  /* -------------------------------------------- 5 Jar Styles & Cloud */
  function jarPath(g, jar, grow) {
    var g0 = grow || 0;
    var x0 = jar.left - g0, x1 = jar.right + g0, y0 = jar.top - 10, y1 = jar.bottom + g0, cr = 28 + g0;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0, y1 - cr);
    g.arcTo(x0, y1, x0 + cr, y1, cr);
    g.lineTo(x1 - cr, y1);
    g.arcTo(x1, y1, x1, y1 - cr, cr);
    g.lineTo(x1, y0);
  }

  A.jarBack = function (g, jar, styleIdx) {
    var st = JD.JARS[styleIdx] || JD.JARS[0];
    g.save();
    jarPath(g, jar, 0);
    g.closePath();
    g.fillStyle = rgba(st.tint, styleIdx === 1 ? 0.24 : 0.14);
    g.fill();
    g.clip();

    var w = jar.right - jar.left, h = jar.bottom - jar.top;
    if (styleIdx === 1) {
      // Woven basket crosshatch
      g.strokeStyle = 'rgba(188,108,37,0.22)';
      g.lineWidth = 8;
      for (var y = jar.top; y < jar.bottom; y += 34) {
        g.beginPath(); g.moveTo(jar.left, y); g.lineTo(jar.right, y); g.stroke();
      }
      for (var x = jar.left; x < jar.right; x += 42) {
        g.beginPath(); g.moveTo(x, jar.top); g.lineTo(x, jar.bottom); g.stroke();
      }
    } else if (styleIdx === 2) {
      // Royal gold vertical arches
      g.strokeStyle = 'rgba(255,215,0,0.16)';
      g.lineWidth = 4;
      for (var rx = jar.left + 40; rx < jar.right; rx += 64) {
        g.beginPath(); g.moveTo(rx, jar.top); g.lineTo(rx, jar.bottom); g.stroke();
      }
    } else if (styleIdx === 3) {
      // Space tank grid
      g.strokeStyle = 'rgba(100,223,223,0.14)';
      g.lineWidth = 2;
      for (var sy = jar.top + 30; sy < jar.bottom; sy += 48) {
        g.beginPath(); g.moveTo(jar.left, sy); g.lineTo(jar.right, sy); g.stroke();
      }
    } else if (styleIdx === 4) {
      // Candy stripes
      g.strokeStyle = 'rgba(255,112,166,0.16)';
      g.lineWidth = 16;
      for (var cx = jar.left - h; cx < jar.right + h; cx += 56) {
        g.beginPath(); g.moveTo(cx, jar.top); g.lineTo(cx + h * 0.6, jar.bottom); g.stroke();
      }
    }

    // Glossy vertical glass reflection band on left & right inside jar
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.fillRect(jar.left + 12, jar.top, 18, h);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(jar.right - 26, jar.top, 10, h);
    g.restore();
    void w;
  };

  A.jarFront = function (g, jar, styleIdx, warning, overTime, t, still) {
    var st = JD.JARS[styleIdx] || JD.JARS[0];
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Decorative handles for Royal Gold Vase (2) or Space Tank (3)
    if (styleIdx === 2) {
      [-1, 1].forEach(function (s) {
        var hx = s < 0 ? jar.left - 6 : jar.right + 6;
        g.beginPath();
        g.arc(hx, jar.top + 110, 26, s < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, s < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
        g.lineWidth = 16; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 9; g.strokeStyle = '#ffd60a'; g.stroke();
        A.circle(g, hx + s * 24, jar.top + 110, 7);
        g.fillStyle = '#ff2a6d'; g.fill();
      });
    }

    // Dashed top overflow line!
    var pulse = warning && !still ? 0.55 + 0.45 * Math.sin(t * 12) : 1;
    if (warning) {
      g.fillStyle = rgba('#ff3b6b', 0.16 * pulse);
      g.fillRect(jar.left + 4, jar.top - 16, (jar.right - jar.left) - 8, 32);
    }
    g.setLineDash([12, 10]);
    g.beginPath();
    g.moveTo(jar.left + 8, jar.top);
    g.lineTo(jar.right - 8, jar.top);
    g.lineWidth = warning ? 5 : 3;
    g.strokeStyle = warning ? rgba('#ff4d6d', 0.7 + 0.3 * pulse) : 'rgba(255,255,255,0.34)';
    g.stroke();
    g.setLineDash([]);

    if (warning) {
      var leftSec = Math.max(0, 2.8 - overTime).toFixed(1);
      A.text(g, 'انتبه! السلّة ممتلئة ' + leftSec, jar.cx, jar.top - 22, 22, '#ffccd5');
    }

    // Thick 3-pass cartoon U-wall around jar
    jarPath(g, jar, 4);
    g.lineWidth = 22;
    g.strokeStyle = INK;
    g.stroke();

    jarPath(g, jar, 4);
    g.lineWidth = 12;
    g.strokeStyle = st.wall;
    g.stroke();

    jarPath(g, jar, 4);
    g.lineWidth = 4;
    g.strokeStyle = st.rim;
    g.stroke();

    // Cute lip caps on top-left and top-right of the jar rim
    [jar.left - 4, jar.right + 4].forEach(function (rx) {
      A.rr(g, rx - 13, jar.top - 20, 26, 18, 9);
      g.fillStyle = st.rim; g.fill();
      g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    });

    g.restore();
  };

  A.cloud = function (g, w, facePack, t, still) {
    var x = w.cloudX, y = JD.CLOUD_Y + 6 + (still ? 0 : Math.sin(t * 3.2) * 2.2);
    var r = JD.FRUITS[w.currentTier].r;

    // Soft vertical dotted drop guide + landing ring
    if (!w.done) {
      var landY = JD.raycastDrop(w, x);
      g.save();
      g.setLineDash([7, 9]);
      g.beginPath();
      g.moveTo(x, y + 16);
      g.lineTo(x, Math.max(y + 24, landY - r));
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.42)';
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.ellipse(x, landY - 3, Math.min(32, r * 0.85), 5, 0, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.26)';
      g.fill();
      g.restore();
    }

    // Held fruit peeking under the helper cloud when ready
    if (w.dropCd <= 0.06 && !w.done) {
      var pop = w.dropCd > 0 ? 1 - w.dropCd / 0.06 : 1;
      A.fruit(g, w.currentTier, x, y + 14, r, { facePack: facePack, scale: 0.7 + 0.3 * pop, ly: 0.5 });
    }

    // Fluffy marshmallow cloud body
    g.save();
    g.translate(x, y - 12);
    var puffs = [[-28, 4, 17], [28, 4, 17], [-14, -6, 20], [14, -6, 20], [0, -2, 22]];
    [INK, '#ffffff'].forEach(function (col, pass) {
      g.fillStyle = col;
      for (var i = 0; i < puffs.length; i++) {
        var p = puffs[i];
        A.circle(g, p[0], p[1], p[2] + (pass === 0 ? 4 : 0));
        g.fill();
      }
    });
    // Tiny kawaii cloud eyes & smile
    g.fillStyle = INK;
    A.circle(g, -9, -2, 2.6); g.fill();
    A.circle(g, 9, -2, 2.6); g.fill();
    g.fillStyle = 'rgba(255,105,155,0.55)';
    A.circle(g, -16, 2, 3.5); g.fill();
    A.circle(g, 16, 2, 3.5); g.fill();
    g.beginPath();
    g.arc(0, 1, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
    g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
    g.restore();
  };

  /* -------------------------------------- Evolution Ring & Side Cards */
  A.evolutionRing = function (g, seen, facePack, t, still) {
    var cx = 190, cy = 416, ringR = 112;
    A.rr(g, 34, 240, 312, 336, 32);
    g.fillStyle = 'rgba(20, 14, 42, 0.76)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.stroke();

    A.text(g, 'دائرة الدمج', cx, 272, 27, '#ffe169');

    // Circular arrow track
    A.circle(g, cx, cy + 16, ringR);
    g.setLineDash([6, 8]);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.stroke();
    g.setLineDash([]);

    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + (i * TAU) / 10;
      var fx = cx + Math.cos(ang) * ringR;
      var fy = cy + 16 + Math.sin(ang) * ringR;
      var ir = 14 + i * 1.15;
      var lit = !seen || seen[i];
      if (lit && i === 9) A.glow(g, fx, fy, 34, '#2ecc71', still ? 0.5 : 0.5 + 0.2 * Math.sin(t * 4));
      g.save();
      if (!lit) g.globalAlpha = 0.48;
      A.fruit(g, i, fx, fy, ir, { facePack: facePack, mood: i === 9 ? 'happy' : 'normal' });
      g.restore();

      // Tiny arrow toward next fruit
      var midA = ang + TAU / 20;
      var ax = cx + Math.cos(midA) * ringR, ay = cy + 16 + Math.sin(midA) * ringR;
      g.save();
      g.translate(ax, ay);
      g.rotate(midA + Math.PI / 2);
      g.beginPath();
      g.moveTo(-4, -3); g.lineTo(4, 0); g.lineTo(-4, 3);
      g.lineWidth = 2.4;
      g.strokeStyle = 'rgba(255,225,105,0.65)';
      g.stroke();
      g.restore();
    }
    // Center crown icon
    A.text(g, '×2 =', cx, cy + 8, 20, 'rgba(255,255,255,0.75)', { stroke: false });
    A.text(g, 'أكبر!', cx, cy + 30, 22, '#8dff7a', { stroke: false });
  };

  A.rightPanels = function (g, w, bestEndless, facePack, t, still) {
    var px = 936, pw = 310, cx = px + pw / 2;

    // 1. Next Fruit Bubble ("القادمة")
    A.rr(g, px, 136, pw, 132, 28);
    g.fillStyle = 'rgba(20, 14, 42, 0.78)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#ffd166';
    g.stroke();
    A.text(g, 'القادمة', px + pw - 24, 168, 26, '#ffd166', { align: 'right' });
    A.text(g, JD.FRUITS[w.nextTier].name, px + pw - 24, 206, 24, '#ffffff', { align: 'right' });

    var bx = px + 76, by = 202 + (still ? 0 : Math.sin(t * 4) * 3);
    A.circle(g, bx, by, 42);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.stroke();
    A.fruit(g, w.nextTier, bx, by, Math.min(32, JD.FRUITS[w.nextTier].r), { facePack: facePack, mood: 'happy' });

    // 2. Stage Goals OR Endless Best Score Card
    A.rr(g, px, 286, pw, 198, 28);
    g.fillStyle = 'rgba(20, 14, 42, 0.78)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = w.mode === 'endless' ? '#38bdf8' : JD.WORLDS[w.L.world].color;
    g.stroke();

    if (w.mode === 'endless') {
      A.text(g, 'اللعب الحر', cx, 318, 28, '#7dd3fc');
      A.text(g, 'النقاط: ' + w.score, cx, 366, 34, '#ffffff');
      var best = Math.max(bestEndless || 0, w.score);
      A.text(g, 'الأفضل: ' + best, cx, 414, 26, '#ffd166');
      A.text(g, 'البطيخ المدمج: ' + w.watermelonsMerged, cx, 454, 21, '#8dff7a', { stroke: false });
    } else {
      A.text(g, 'أهداف المرحلة', cx, 316, 26, JD.WORLDS[w.L.world].color);
      var goals = w.goals;
      for (var i = 0; i < goals.length; i++) {
        var gl = goals[i];
        var gy = goals.length === 1 ? 392 : 362 + i * 68;
        A.rr(g, px + 18, gy - 28, pw - 36, 56, 18);
        g.fillStyle = gl.done ? 'rgba(46, 204, 113, 0.28)' : 'rgba(255,255,255,0.08)';
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = gl.done ? '#2ecc71' : 'rgba(255,255,255,0.18)';
        g.stroke();

        var ix = px + 54;
        if (gl.kind === 'tier') {
          A.fruit(g, gl.tier, ix, gy, 20, { facePack: facePack });
          A.text(g, JD.FRUITS[gl.tier].name, px + pw - 28, gy, 24, '#ffffff', { align: 'right' });
        } else if (gl.kind === 'melt') {
          A.rr(g, ix - 16, gy - 16, 32, 32, 8);
          g.fillStyle = '#7dd3fc'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
          A.text(g, 'مكعبات الثلج', px + pw - 28, gy, 23, '#bae6fd', { align: 'right' });
        } else if (gl.kind === 'bubbles') {
          A.honeyBubble(g, { x: ix, y: gy, r: 16, wob: 0 }, t, true);
          A.text(g, 'فقاعات العسل', px + pw - 28, gy, 23, '#fde68a', { align: 'right' });
        }
        var progTxt = gl.done ? '✓' : (gl.cur + '/' + gl.target);
        A.text(g, progTxt, px + 114, gy, 26, gl.done ? '#8dff7a' : '#ffd166', { dir: 'ltr' });
      }
    }
  };
})();
