/* هوكي الهواء — Kit.art sprite baker & Cyber-Mech renderer. */
(function () {
  'use strict';
  var AH = window.AH = window.AH || {};
  var M = Math, TAU = M.PI * 2;

  var G = AH.G = { W: 1280, H: 720, L: 60, R: 1220, T: 112, B: 700, CR: 70, GOAL: 128, TINY: 66, MR: 44, BIG: 66, PR: 24, CX: 640, CY: 406 };
  var gen = 0;

  function rrect(c, x, y, w, h, r) {
    r = M.max(0, M.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function stops(g, a) { for (var i = 0; i < a.length; i += 2) g.addColorStop(a[i], a[i + 1]); return g; }

  function hexA(hex, a) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function shade(hex, k) { return Kit.art && Kit.art.shade ? Kit.art.shade(hex, k) : hex; }
  AH.rrect = rrect;
  AH.hexA = hexA;
  AH.lighten = function (h, k) { return shade(h, k); };
  AH.darken = function (h, k) { return shade(h, -k); };

  function bake(key, w, h, drawFn) {
    return Kit.art.sprite(key + ':g' + gen, w, h, drawFn);
  }

  function laserStroke(c, col, w) {
    c.strokeStyle = hexA(col, 0.22); c.lineWidth = w * 2.8; c.stroke();
    c.strokeStyle = col; c.lineWidth = w; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.72)'; c.lineWidth = M.max(1.2, w * 0.32); c.stroke();
  }

  var art = AH.art = {
    clearCaches: function () {
      gen = (gen + 1) % 8;
      if (Kit.art && Kit.art.clearSprites) Kit.art.clearSprites();
    }
  };

  /* ------------------------------------------------------------ arena */
  art.arena = function (th) {
    return bake('arena:' + th.id, G.W, G.H, function (x) {
      var i, j, pad = 16;
      x.fillStyle = stops(x.createRadialGradient(G.CX, G.CY, 90, G.CX, G.CY, 820), [0, th.bg1, 1, th.bg2]);
      x.fillRect(0, 0, G.W, G.H);

      var cols = [th.a, th.mid, th.b, th.line];
      for (i = 0; i < 28; i++) {
        x.fillStyle = hexA(cols[i % 4], 0.2);
        circ(x, 44 + i * 44, 6, 4);
      }
      if (th.stars) {
        for (i = 0; i < 70; i++) {
          x.fillStyle = 'rgba(255,255,255,' + (0.22 + (i % 5) * 0.12) + ')';
          var s = i % 3 === 0 ? 2.5 : 1.8;
          x.fillRect((i * 197 + 43) % G.W, (i * 131 + 29) % G.H, s, s);
        }
      }

      // Armored mech-table chassis rim
      x.fillStyle = 'rgba(0,0,0,0.55)';
      rrect(x, G.L - pad, G.T - pad + 8, G.R - G.L + pad * 2, G.B - G.T + pad * 2, G.CR + pad);
      x.fill();

      x.fillStyle = stops(x.createLinearGradient(0, G.T - pad, 0, G.B + pad), [0, '#27315e', 0.5, '#182042', 1, '#0e132b']);
      rrect(x, G.L - pad, G.T - pad, G.R - G.L + pad * 2, G.B - G.T + pad * 2, G.CR + pad);
      x.fill();
      x.strokeStyle = hexA(th.line, 0.35); x.lineWidth = 2; x.stroke();

      x.fillStyle = hexA(th.line, 0.55);
      [[G.L + 10, G.T - 8], [G.R - 10, G.T - 8], [G.L + 10, G.B + 8], [G.R - 10, G.B + 8], [G.CX - 140, G.T - 8], [G.CX + 140, G.T - 8], [G.CX - 140, G.B + 8], [G.CX + 140, G.B + 8]].forEach(function (pt) {
        x.fillRect(pt[0] - 8, pt[1] - 2.5, 16, 5);
      });

      x.save();
      rrect(x, G.L, G.T, G.R - G.L, G.B - G.T, G.CR);
      x.clip();

      x.fillStyle = stops(x.createRadialGradient(G.CX, G.CY, 30, G.CX, G.CY, 650), [0, th.s1, 1, th.s2]);
      x.fillRect(G.L, G.T, G.R - G.L, G.B - G.T);

      x.fillStyle = stops(x.createLinearGradient(G.L, 0, G.CX, 0), [0, hexA(th.a, 0.18), 1, hexA(th.a, 0)]);
      x.fillRect(G.L, G.T, G.CX - G.L, G.B - G.T);

      x.fillStyle = stops(x.createLinearGradient(G.R, 0, G.CX, 0), [0, hexA(th.b, 0.18), 1, hexA(th.b, 0)]);
      x.fillRect(G.CX, G.T, G.R - G.CX, G.B - G.T);

      x.strokeStyle = hexA(th.line, 0.08); x.lineWidth = 1.5;
      if (th.grid === 'circuit') {
        for (i = G.L + 80; i < G.R; i += 116) { x.beginPath(); x.moveTo(i, G.T); x.lineTo(i, G.B); x.stroke(); }
        for (j = G.T + 74; j < G.B; j += 110) { x.beginPath(); x.moveTo(G.L, j); x.lineTo(G.R, j); x.stroke(); }
      } else if (th.grid === 'core') {
        [150, 230, 320].forEach(function (rad) { x.beginPath(); x.arc(G.CX, G.CY, rad, 0, TAU); x.stroke(); });
      }

      x.fillStyle = th.dot;
      x.beginPath();
      for (i = G.L + 26; i < G.R; i += 32) {
        for (j = G.T + 24; j < G.B; j += 32) { x.moveTo(i + 1.6, j); x.arc(i, j, 1.6, 0, TAU); }
      }
      x.fill();

      x.globalAlpha = 0.45;
      x.beginPath(); x.moveTo(G.L + 285, G.T); x.lineTo(G.L + 285, G.B); laserStroke(x, th.a, 2.5);
      x.beginPath(); x.moveTo(G.R - 285, G.T); x.lineTo(G.R - 285, G.B); laserStroke(x, th.b, 2.5);
      x.globalAlpha = 1;

      x.beginPath(); x.moveTo(G.CX, G.T); x.lineTo(G.CX, G.B); laserStroke(x, th.mid, 5);
      x.beginPath(); x.arc(G.CX, G.CY, 94, 0, TAU); laserStroke(x, th.mid, 4.5);
      x.beginPath(); x.arc(G.CX, G.CY, 52, 0, TAU);
      x.strokeStyle = hexA(th.mid, 0.35); x.lineWidth = 2; x.stroke();
      x.fillStyle = th.mid; circ(x, G.CX, G.CY, 11);
      x.fillStyle = '#fff'; circ(x, G.CX, G.CY, 4.5);

      x.beginPath(); x.arc(G.L, G.CY, 148, -M.PI / 2, M.PI / 2); laserStroke(x, th.a, 4);
      x.beginPath(); x.arc(G.R, G.CY, 148, M.PI / 2, M.PI * 1.5); laserStroke(x, th.b, 4);

      x.fillStyle = stops(x.createRadialGradient(G.CX, G.CY, 280, G.CX, G.CY, 700), [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.34)']);
      x.fillRect(G.L, G.T, G.R - G.L, G.B - G.T);
      x.restore();

      rrect(x, G.L - 3, G.T - 3, G.R - G.L + 6, G.B - G.T + 6, G.CR + 3);
      laserStroke(x, th.line, 6);
    });
  };

  /* ------------------------------------------------------------ goals */
  art.goal = function (ctx, side, half, col, flash, t) {
    var x = side < 0 ? G.L : G.R, dir = side < 0 ? -1 : 1;
    var y0 = G.CY - half, h = half * 2, px = side < 0 ? x - 34 : x - 6;
    ctx.save();
    ctx.fillStyle = '#030510';
    rrect(ctx, px, y0 - 4, 40, h + 8, 10); ctx.fill();

    ctx.strokeStyle = hexA(col, 0.38); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var yy = y0 + 12; yy < y0 + h; yy += 16) { ctx.moveTo(px + 4, yy); ctx.lineTo(px + 36, yy); }
    for (var xx = px + 10; xx < px + 38; xx += 12) { ctx.moveTo(xx, y0); ctx.lineTo(xx, y0 + h); }
    ctx.stroke();

    if (half < G.GOAL - 6) {
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, G.CY - G.GOAL); ctx.lineTo(x, y0);
      ctx.moveTo(x, y0 + h); ctx.lineTo(x, G.CY + G.GOAL);
      ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }

    var g = 0.55 + 0.25 * M.sin(t * 5.5) + flash;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = stops(ctx.createLinearGradient(x, 0, x - dir * 56, 0), [0, hexA(col, M.min(1, 0.52 * g)), 1, hexA(col, 0)]);
    ctx.fillRect(M.min(x, x - dir * 56), y0, 56, h);
    ctx.globalCompositeOperation = 'source-over';

    [y0, y0 + h].forEach(function (py) {
      ctx.fillStyle = hexA(col, 0.34); circ(ctx, x, py, 14);
      ctx.fillStyle = col; circ(ctx, x, py, 8);
      ctx.fillStyle = '#fff'; circ(ctx, x, py, 3.5);
    });
    ctx.restore();
  };

  /* ---------------------------------------------------------- mallets */
  var BASE = 68, PAD = 20, MSZ = (BASE + PAD) * 2;

  art.malletSprite = function (s) {
    return bake('mallet:' + s.id, MSZ, MSZ, function (x) {
      var i, a, r = BASE, inner = r * 0.8, kr = r * 0.52;
      x.save();
      x.translate(MSZ / 2, MSZ / 2);

      x.fillStyle = stops(x.createRadialGradient(0, 0, r * 0.72, 0, 0, r + PAD - 2), [0, hexA(s.color, 0.45), 1, hexA(s.color, 0)]);
      circ(x, 0, 0, r + PAD - 2);

      x.fillStyle = stops(x.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r), [0, shade(s.ring, 0.38), 1, shade(s.ring, -0.25)]);
      circ(x, 0, 0, r);

      if (s.kind === 'saw') {
        x.fillStyle = '#ffd23f';
        for (i = 0; i < 8; i++) {
          x.save(); x.rotate(i * M.PI / 4);
          x.beginPath(); x.moveTo(r * 0.76, -6); x.lineTo(r * 0.99, 0); x.lineTo(r * 0.76, 6); x.closePath(); x.fill();
          x.restore();
        }
      }

      var bCols = s.kind === 'gold' ? [0, '#fff8bf', 0.5, '#ffd84a', 1, '#b87b00']
        : s.kind === 'diamond' ? [0, '#fff', 0.55, '#baf6ff', 1, '#299bd6']
        : s.kind === 'galaxy' ? [0, '#d29eff', 0.55, '#682bd6', 1, '#1e0b54']
        : [0, shade(s.color, 0.42), 0.55, s.color, 1, shade(s.color, -0.38)];
      x.fillStyle = stops(x.createRadialGradient(-inner * 0.28, -inner * 0.28, inner * 0.1, 0, 0, inner), bCols);
      circ(x, 0, 0, inner);

      if (s.kind === 'cyber' || s.kind === 'matrix' || s.kind === 'diamond') {
        var n = s.kind === 'diamond' ? 8 : 6;
        x.strokeStyle = s.kind === 'diamond' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)';
        x.lineWidth = 2.4;
        for (i = 0; i < n; i++) {
          a = i * TAU / n;
          x.beginPath(); x.moveTo(M.cos(a) * inner * 0.55, M.sin(a) * inner * 0.55);
          x.lineTo(M.cos(a) * inner * 0.94, M.sin(a) * inner * 0.94); x.stroke();
        }
      } else if (s.kind === 'volt') {
        x.strokeStyle = '#fff86b'; x.lineWidth = 3;
        x.beginPath(); x.arc(0, 0, inner * 0.78, 0, TAU); x.stroke();
      } else if (s.kind === 'magma') {
        x.strokeStyle = '#ffe033'; x.lineWidth = 3.5;
        for (i = 0; i < 5; i++) { a = i * M.PI * 0.4; x.beginPath(); x.arc(0, 0, inner * 0.76, a, a + 0.55); x.stroke(); }
      } else if (s.kind === 'galaxy') {
        x.fillStyle = '#fff';
        for (i = 0; i < 12; i++) {
          a = i * 2.2;
          var gd = inner * (0.54 + (i * 29 % 36) / 100);
          x.fillRect(M.cos(a) * gd, M.sin(a) * gd, 2.4, 2.4);
        }
      }

      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = r * 0.05;
      x.beginPath(); x.arc(0, 0, r * 0.91, M.PI * 1.08, M.PI * 1.62); x.stroke();

      x.fillStyle = 'rgba(0,0,0,0.34)'; circ(x, 2, 4, kr);
      x.fillStyle = stops(x.createRadialGradient(-kr * 0.3, -kr * 0.35, kr * 0.1, 0, 0, kr), [0, '#2a3566', 1, '#0e132b']);
      circ(x, 0, 0, kr);
      x.strokeStyle = shade(s.color, 0.35); x.lineWidth = 2.8; x.stroke();
      x.restore();
    });
  };

  art.mallet = function (ctx, m, s, o) {
    var r = m.r, spr = art.malletSprite(s), sz = MSZ * (r / BASE);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.16, r * 1.02, r * 0.96, 0, 0, TAU); ctx.fill();

    if (o.boost > 0) {
      ctx.strokeStyle = '#fff06a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, TAU); ctx.stroke();
    }
    if (o.sq > 0) {
      ctx.rotate(o.sqAng || 0);
      ctx.scale(1 - o.sq * 0.22, 1 + o.sq * 0.16);
      ctx.rotate(-(o.sqAng || 0));
    }
    ctx.drawImage(spr.canvas, -sz / 2, -sz / 2, sz, sz);
    drawVisor(ctx, r * 0.52, s, o);

    if (o.frozen > 0) {
      ctx.globalAlpha = M.min(1, o.frozen * 3) * 0.86;
      ctx.fillStyle = stops(ctx.createLinearGradient(-r, -r, r, r), [0, 'rgba(225,252,255,0.95)', 1, 'rgba(90,205,255,0.78)']);
      rrect(ctx, -r * 1.08, -r * 1.08, r * 2.16, r * 2.16, r * 0.34); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.65, -r * 0.25); ctx.lineTo(-r * 0.18, -r * 0.72);
      ctx.moveTo(-r * 0.55, r * 0.15); ctx.lineTo(-r * 0.22, -r * 0.18);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  function drawVisor(ctx, kr, s, o) {
    var mech = o.face || 'player', lx = o.look ? o.look.x : 0, ly = o.look ? o.look.y : 0;
    var mood = o.mood || '';
    var glow = mech === 'boss' ? '#ff3355' : mech === 'hawk' ? '#ff9433' : mech === 'turbo' ? '#ffe033' : mech === 'scout' ? '#42f58d' : shade(s.color, 0.25);

    if (mech === 'boss') {
      ctx.fillStyle = '#ff3355';
      [-1, 1].forEach(function (sg) {
        ctx.beginPath(); ctx.moveTo(sg * kr * 0.55, -kr * 0.65); ctx.lineTo(sg * kr * 1.15, -kr * 1.28); ctx.lineTo(sg * kr * 0.88, -kr * 0.35); ctx.closePath(); ctx.fill();
      });
    } else if (mech === 'hawk') {
      ctx.fillStyle = '#ff8533';
      ctx.beginPath(); ctx.moveTo(0, -kr * 0.45); ctx.lineTo(-kr * 0.35, -kr * 0.95); ctx.lineTo(0, -kr * 0.72); ctx.lineTo(kr * 0.35, -kr * 0.95); ctx.closePath(); ctx.fill();
    } else if (mech === 'scout') {
      ctx.strokeStyle = '#42f58d'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -kr * 0.75); ctx.lineTo(0, -kr * 1.15); ctx.stroke();
      ctx.fillStyle = '#fff'; circ(ctx, 0, -kr * 1.18, kr * 0.14);
    }

    var ex = kr * 0.36, ey = -kr * 0.04 + ly * kr * 0.12, px = lx * kr * 0.18;
    ctx.lineCap = 'round';
    if (mood === 'joy') {
      ctx.strokeStyle = glow; ctx.lineWidth = M.max(2.4, kr * 0.14);
      [-ex, ex].forEach(function (cx) {
        ctx.beginPath(); ctx.moveTo(cx - kr * 0.2, ey + kr * 0.1); ctx.lineTo(cx, ey - kr * 0.14); ctx.lineTo(cx + kr * 0.2, ey + kr * 0.1); ctx.stroke();
      });
      return;
    }
    if (mood === 'sad') {
      ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = M.max(2, kr * 0.12);
      [-ex, ex].forEach(function (cx) {
        ctx.beginPath(); ctx.moveTo(cx - kr * 0.16, ey - kr * 0.12); ctx.lineTo(cx + kr * 0.16, ey + kr * 0.12);
        ctx.moveTo(cx + kr * 0.16, ey - kr * 0.12); ctx.lineTo(cx - kr * 0.16, ey + kr * 0.12); ctx.stroke();
      });
      return;
    }
    if (o.blink > 0.5) {
      ctx.strokeStyle = glow; ctx.lineWidth = M.max(2, kr * 0.12);
      [-ex, ex].forEach(function (cx) { ctx.beginPath(); ctx.moveTo(cx - kr * 0.2, ey); ctx.lineTo(cx + kr * 0.2, ey); ctx.stroke(); });
      return;
    }

    ctx.fillStyle = glow;
    if (mech === 'boss' || mech === 'hawk') {
      [-1, 1].forEach(function (sg) {
        ctx.beginPath();
        ctx.moveTo(sg * ex + px - sg * kr * 0.24, ey - kr * 0.06);
        ctx.lineTo(sg * ex + px + sg * kr * 0.22, ey - kr * 0.2);
        ctx.lineTo(sg * ex + px + sg * kr * 0.18, ey + kr * 0.14);
        ctx.lineTo(sg * ex + px - sg * kr * 0.2, ey + kr * 0.1);
        ctx.closePath(); ctx.fill();
      });
    } else if (mech === 'turbo') {
      rrect(ctx, -kr * 0.68 + px * 0.6, ey - kr * 0.2, kr * 1.36, kr * 0.38, kr * 0.16); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-kr * 0.45 + px, ey - kr * 0.1, kr * 0.32, kr * 0.12);
      ctx.fillRect(kr * 0.12 + px, ey - kr * 0.1, kr * 0.32, kr * 0.12);
    } else {
      [-ex, ex].forEach(function (cx) {
        ctx.fillStyle = glow;
        rrect(ctx, cx + px - kr * 0.2, ey - kr * 0.24, kr * 0.4, kr * 0.46, kr * 0.14); ctx.fill();
        ctx.fillStyle = '#fff'; circ(ctx, cx + px - kr * 0.05, ey - kr * 0.08, kr * 0.09);
      });
    }
  }

  /* ------------------------------------------------------------- puck */
  var PSZ = (G.PR + 16) * 2;
  art.puckSprite = function (p) {
    return bake('puck:' + p.id, PSZ, PSZ, function (x) {
      var R = G.PR, core = p.core || p.trail[0];
      x.save();
      x.translate(PSZ / 2, PSZ / 2);
      x.fillStyle = stops(x.createRadialGradient(0, 0, R * 0.6, 0, 0, R + 15), [0, hexA(p.trail[0], 0.65), 1, hexA(p.trail[0], 0)]);
      circ(x, 0, 0, R + 15);
      x.fillStyle = stops(x.createRadialGradient(-R * 0.28, -R * 0.3, 2, 0, 0, R), [0, '#fff', 0.68, p.color, 1, shade(core, -0.3)]);
      circ(x, 0, 0, R);
      x.strokeStyle = core; x.lineWidth = 4;
      x.beginPath(); x.arc(0, 0, R * 0.6, 0, TAU); x.stroke();
      x.fillStyle = core;
      if (p.bolt) {
        x.beginPath(); x.moveTo(3, -10); x.lineTo(-6, 1); x.lineTo(0, 1); x.lineTo(-3, 10); x.lineTo(6, -1); x.lineTo(0, -1); x.closePath(); x.fill();
      } else {
        circ(x, 0, 0, R * 0.24);
      }
      x.restore();
    });
  };

  /* --------------------------------------------------------- power-ups */
  function powSprite(def) {
    return bake('pow:' + def.id, 76, 76, function (x) {
      var col = def.color;
      x.save();
      x.translate(38, 38);
      x.fillStyle = '#0e132b'; circ(x, 0, 0, 28);
      x.lineWidth = 5; x.strokeStyle = col; x.stroke();
      x.lineWidth = 1.6; x.strokeStyle = '#fff'; x.stroke();
      x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 3.8; x.lineCap = 'round'; x.lineJoin = 'round';
      if (def.id === 'fire') {
        x.beginPath(); x.moveTo(0, -17); x.bezierCurveTo(13, -4, 14, 7, 0, 16); x.bezierCurveTo(-14, 7, -11, -4, -3, -8); x.bezierCurveTo(-1, -2, 2, -6, 0, -17); x.fill();
        x.fillStyle = '#ffe033';
        x.beginPath(); x.moveTo(0, -2); x.bezierCurveTo(6, 4, 6, 10, 0, 13); x.bezierCurveTo(-6, 10, -6, 4, 0, -2); x.fill();
      } else if (def.id === 'multi') {
        [[-9, 6], [9, 6], [0, -9]].forEach(function (pt) { circ(x, pt[0], pt[1], 6.8); });
      } else if (def.id === 'big') {
        circ(x, 2, 2, 12); x.fillStyle = '#fff'; circ(x, 2, 2, 5);
        x.strokeStyle = '#fff'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(-15, -7); x.lineTo(-15, -15); x.lineTo(-7, -15); x.stroke();
      } else if (def.id === 'tiny') {
        x.fillRect(-3.5, -14, 7, 28);
        x.beginPath(); x.moveTo(-16, -11); x.lineTo(-8, -4); x.moveTo(-16, 11); x.lineTo(-8, 4); x.moveTo(16, -11); x.lineTo(8, -4); x.moveTo(16, 11); x.lineTo(8, 4); x.stroke();
      } else if (def.id === 'freeze') {
        for (var i = 0; i < 3; i++) {
          x.save(); x.rotate(i * M.PI / 3);
          x.beginPath(); x.moveTo(0, -15); x.lineTo(0, 15); x.moveTo(-5, -11); x.lineTo(0, -7); x.lineTo(5, -11); x.moveTo(-5, 11); x.lineTo(0, 7); x.lineTo(5, 11); x.stroke();
          x.restore();
        }
      }
      x.restore();
    });
  }

  art.power = function (ctx, pw, t) {
    var sc = M.min(1, pw.age * 4) * (1 + M.sin(t * 6 + pw.seed) * 0.08);
    var col = pw.def.color, spr = powSprite(pw.def);
    ctx.save();
    ctx.translate(pw.x, pw.y);
    ctx.scale(sc, sc);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = stops(ctx.createRadialGradient(0, 0, 14, 0, 0, 52), [0, hexA(col, 0.52), 1, hexA(col, 0)]);
    circ(ctx, 0, 0, 52);
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(M.sin(t * 2.2 + pw.seed) * 0.16);
    ctx.drawImage(spr.canvas, -38, -38, 76, 76);
    ctx.restore();
  };

  /* --------------------------------------------------------- previews */
  art.preview = function (cv, kind, item) {
    var x = cv.getContext('2d'), w = cv.width, h = cv.height;
    x.clearRect(0, 0, w, h);
    if (kind === 'mallet' || kind === 'bot') {
      var skin = kind === 'bot' ? { id: 'bot_' + item.id, kind: item.mech === 'boss' ? 'saw' : 'cyber', color: item.color, ring: item.ring } : item;
      art.mallet(x, { x: w / 2, y: h * 0.54, r: M.min(w, h) * 0.35 }, skin, { face: kind === 'bot' ? item.mech : 'player', look: { x: -0.35, y: 0.15 } });
    } else if (kind === 'table') {
      x.drawImage(art.arena(item).canvas, 0, 0, w, h);
    } else if (kind === 'puck') {
      var spr = art.puckSprite(item), sz = PSZ * 1.35;
      for (var i = 7; i >= 1; i--) {
        x.globalAlpha = (1 - i / 8) * 0.82;
        x.fillStyle = item.trail[i % item.trail.length];
        circ(x, w / 2 - i * 11, h / 2 + i * 3, 17 - i * 1.4);
      }
      x.globalAlpha = 1;
      x.drawImage(spr.canvas, w / 2 + 14 - sz / 2, h / 2 - sz / 2, sz, sz);
    }
  };
})();
