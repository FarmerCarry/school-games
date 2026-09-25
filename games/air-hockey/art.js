/* Air Hockey — drawing helpers. Everything is drawn in code; static parts are
   cached in offscreen canvases so a frame costs only a handful of drawImage calls. */
(function () {
  'use strict';
  var AH = window.AH = window.AH || {};

  // Table geometry (logical 1280x720).
  var G = AH.G = { W: 1280, H: 720, L: 60, R: 1220, T: 112, B: 700, CR: 70, GOAL: 128, TINY: 66, MR: 44, BIG: 66, PR: 24 };
  G.CX = (G.L + G.R) / 2; G.CY = (G.T + G.B) / 2;

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  AH.rrect = rrect;

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  AH.hexA = hexA;

  var art = AH.art = {};

  /* ------------------------------------------------------------ table */
  // Returns an offscreen canvas of the whole 1280x720 backdrop + rink at res k.
  art.buildTable = function (th, k) {
    var c = mk(G.W * k, G.H * k), x = c.getContext('2d');
    x.scale(k, k);
    // backdrop
    var bg = x.createRadialGradient(G.CX, G.CY, 100, G.CX, G.CY, 820);
    bg.addColorStop(0, th.bg1); bg.addColorStop(1, th.bg2);
    x.fillStyle = bg; x.fillRect(0, 0, G.W, G.H);
    var i, j;
    if (th.stars) {
      for (i = 0; i < 90; i++) {
        x.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.random() * 0.6) + ')';
        var sx = Math.random() * G.W, sy = Math.random() * G.H;
        x.fillRect(sx, sy, 2, 2);
      }
    }
    // stadium light strip at top
    for (i = 0; i < 32; i++) {
      var lx = 30 + i * 39.4;
      var cols = [th.a, th.mid, th.b, th.line];
      x.fillStyle = hexA(cols[i % 4], 0.22);
      x.beginPath(); x.arc(lx, 8, 5, 0, Math.PI * 2); x.fill();
    }
    // rim (outer frame)
    var pad = 16;
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 30; x.shadowOffsetY = 10;
    rrect(x, G.L - pad, G.T - pad, G.R - G.L + pad * 2, G.B - G.T + pad * 2, G.CR + pad);
    var rim = x.createLinearGradient(0, G.T - pad, 0, G.B + pad);
    rim.addColorStop(0, '#2b3160'); rim.addColorStop(1, '#141836');
    x.fillStyle = rim; x.fill();
    x.restore();
    // surface
    x.save();
    rrect(x, G.L, G.T, G.R - G.L, G.B - G.T, G.CR);
    x.clip();
    var sf = x.createRadialGradient(G.CX, G.CY, 40, G.CX, G.CY, 640);
    sf.addColorStop(0, th.s1); sf.addColorStop(1, th.s2);
    x.fillStyle = sf; x.fillRect(G.L, G.T, G.R - G.L, G.B - G.T);
    // side tints
    var ta = x.createLinearGradient(G.L, 0, G.CX, 0);
    ta.addColorStop(0, hexA(th.a, 0.14)); ta.addColorStop(1, hexA(th.a, 0));
    x.fillStyle = ta; x.fillRect(G.L, G.T, G.CX - G.L, G.B - G.T);
    var tb = x.createLinearGradient(G.R, 0, G.CX, 0);
    tb.addColorStop(0, hexA(th.b, 0.14)); tb.addColorStop(1, hexA(th.b, 0));
    x.fillStyle = tb; x.fillRect(G.CX, G.T, G.R - G.CX, G.B - G.T);
    // air holes
    x.fillStyle = th.dot;
    for (i = G.L + 22; i < G.R; i += 29) for (j = G.T + 20; j < G.B; j += 29) { x.beginPath(); x.arc(i, j, 1.6, 0, Math.PI * 2); x.fill(); }
    // markings (glowing)
    x.lineCap = 'round';
    function glowStroke(col, w, blur) {
      x.save(); x.shadowColor = col; x.shadowBlur = blur; x.strokeStyle = col; x.lineWidth = w; x.stroke(); x.restore();
      x.save(); x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = Math.max(1, w * 0.3); x.stroke(); x.restore();
    }
    x.beginPath(); x.moveTo(G.CX, G.T); x.lineTo(G.CX, G.B); glowStroke(th.mid, 6, 18);
    x.beginPath(); x.arc(G.CX, G.CY, 92, 0, Math.PI * 2); glowStroke(th.mid, 5, 16);
    x.beginPath(); x.arc(G.CX, G.CY, 10, 0, Math.PI * 2); x.fillStyle = th.mid; x.fill();
    // goal creases
    x.beginPath(); x.arc(G.L, G.CY, 150, -Math.PI / 2, Math.PI / 2); glowStroke(th.a, 4, 14);
    x.beginPath(); x.arc(G.R, G.CY, 150, Math.PI / 2, Math.PI * 1.5); glowStroke(th.b, 4, 14);
    // faint third lines
    x.globalAlpha = 0.35;
    x.beginPath(); x.moveTo(G.L + 290, G.T); x.lineTo(G.L + 290, G.B); glowStroke(th.a, 3, 8);
    x.beginPath(); x.moveTo(G.R - 290, G.T); x.lineTo(G.R - 290, G.B); glowStroke(th.b, 3, 8);
    x.globalAlpha = 1;
    // inner shading
    var vg = x.createRadialGradient(G.CX, G.CY, 300, G.CX, G.CY, 700);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    x.fillStyle = vg; x.fillRect(G.L, G.T, G.R - G.L, G.B - G.T);
    x.restore();
    // neon wall
    rrect(x, G.L - 4, G.T - 4, G.R - G.L + 8, G.B - G.T + 8, G.CR + 4);
    x.save(); x.shadowColor = th.line; x.shadowBlur = 26; x.strokeStyle = th.line; x.lineWidth = 7; x.stroke(); x.stroke(); x.restore();
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2; x.stroke();
    return c;
  };

  // Goal mouth drawn each frame (its size can change).
  art.goal = function (ctx, side, half, col, flash, t) {
    var x = side < 0 ? G.L : G.R, dir = side < 0 ? -1 : 1;
    var y0 = G.CY - half, h = half * 2;
    ctx.save();
    // pocket
    ctx.fillStyle = '#04050d';
    var px = side < 0 ? x - 34 : x - 6;
    rrect(ctx, px, y0 - 4, 40, h + 8, 10); ctx.fill();
    // net lines
    ctx.strokeStyle = hexA(col, 0.35); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var yy = y0 + 12; yy < y0 + h; yy += 16) { ctx.moveTo(px + 4, yy); ctx.lineTo(px + 36, yy); }
    for (var xx = px + 10; xx < px + 38; xx += 12) { ctx.moveTo(xx, y0); ctx.lineTo(xx, y0 + h); }
    ctx.stroke();
    // glow bar at mouth
    var g = 0.55 + 0.25 * Math.sin(t * 5) + flash;
    ctx.globalCompositeOperation = 'lighter';
    var grd = ctx.createLinearGradient(x, 0, x - dir * 60, 0);
    grd.addColorStop(0, hexA(col, Math.min(1, 0.5 * g)));
    grd.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = grd;
    ctx.fillRect(Math.min(x, x - dir * 60), y0, 60, h);
    ctx.globalCompositeOperation = 'source-over';
    // posts
    ctx.fillStyle = hexA(col, 0.3);
    ctx.beginPath(); ctx.arc(x, y0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y0 + h, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y0 + h, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y0 + h, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ---------------------------------------------------------- mallets */
  var SPR = 2;               // sprite oversampling
  var BASE = 70;             // sprite radius (covers big mallet)
  var malletCache = {};
  function drawMalletBody(x, r, s) {
    var i, a;
    // ring
    var rg = x.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r);
    rg.addColorStop(0, lighten(s.ring, 0.35)); rg.addColorStop(1, s.ring);
    x.fillStyle = rg; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill();
    if (s.kind === 'rainbow') {
      var cols = ['#ff4d6d', '#ffa43d', '#ffe14d', '#7dff6b', '#35c8ff', '#b98cff'];
      for (i = 0; i < 12; i++) {
        x.fillStyle = cols[i % 6];
        x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, r, i * Math.PI / 6, (i + 1) * Math.PI / 6); x.closePath(); x.fill();
      }
    }
    if (s.kind === 'melon') {
      x.strokeStyle = '#8be08f'; x.lineWidth = r * 0.08;
      x.beginPath(); x.arc(0, 0, r * 0.84, 0, Math.PI * 2); x.stroke();
    }
    // bowl
    var inner = r * 0.78;
    var bg = x.createRadialGradient(-inner * 0.3, -inner * 0.3, inner * 0.1, 0, 0, inner);
    if (s.kind === 'gold') { bg.addColorStop(0, '#fff6b0'); bg.addColorStop(0.5, '#ffd84a'); bg.addColorStop(1, '#c48a00'); }
    else if (s.kind === 'diamond') { bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#bff6ff'); bg.addColorStop(1, '#5fc8e6'); }
    else if (s.kind === 'galaxy') { bg.addColorStop(0, '#b59cff'); bg.addColorStop(0.6, '#4a2bb8'); bg.addColorStop(1, '#1a0b52'); }
    else if (s.kind === 'rainbow') { bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#e8e8ff'); }
    else { bg.addColorStop(0, lighten(s.color, 0.45)); bg.addColorStop(0.55, s.color); bg.addColorStop(1, darken(s.color, 0.3)); }
    x.fillStyle = bg; x.beginPath(); x.arc(0, 0, inner, 0, Math.PI * 2); x.fill();
    if (s.kind === 'melon') {
      x.fillStyle = '#2a1414';
      for (i = 0; i < 9; i++) { a = i * 0.7 + 0.3; var d = inner * (0.55 + (i % 3) * 0.12); x.beginPath(); x.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.045, r * 0.08, a, 0, Math.PI * 2); x.fill(); }
    }
    if (s.kind === 'donut') {
      var sp = ['#ffffff', '#6fe8ff', '#ffe14d', '#7dff6b', '#b98cff'];
      x.lineWidth = r * 0.05; x.lineCap = 'round';
      for (i = 0; i < 16; i++) { a = i * 2.4; var dd = inner * (0.6 + (i % 4) * 0.09); var cx = Math.cos(a) * dd, cy = Math.sin(a) * dd; x.strokeStyle = sp[i % 5]; x.beginPath(); x.moveTo(cx - 4, cy); x.lineTo(cx + 4, cy + 3); x.stroke(); }
    }
    if (s.kind === 'galaxy') {
      x.fillStyle = '#fff';
      for (i = 0; i < 14; i++) { a = i * 2.1; var gd = inner * (0.5 + (i * 37 % 45) / 100); x.fillRect(Math.cos(a) * gd, Math.sin(a) * gd, 2, 2); }
    }
    if (s.kind === 'diamond') {
      x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 1.5;
      for (i = 0; i < 8; i++) { a = i * Math.PI / 4; x.beginPath(); x.moveTo(Math.cos(a) * inner * 0.55, Math.sin(a) * inner * 0.55); x.lineTo(Math.cos(a) * inner, Math.sin(a) * inner); x.stroke(); }
    }
    // rim highlight
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = r * 0.05;
    x.beginPath(); x.arc(0, 0, r * 0.92, Math.PI * 1.1, Math.PI * 1.6); x.stroke();
    // knob
    var kr = r * 0.5;
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(r * 0.05, r * 0.08, kr, 0, Math.PI * 2); x.fill();
    var kg = x.createRadialGradient(-kr * 0.35, -kr * 0.4, kr * 0.1, 0, 0, kr);
    var kc = s.kind === 'rainbow' ? '#ffffff' : s.kind === 'diamond' ? '#e8fdff' : s.kind === 'melon' ? '#ff7a88' : s.color;
    kg.addColorStop(0, lighten(kc, 0.6)); kg.addColorStop(1, s.kind === 'gold' ? '#e0a800' : kc);
    x.fillStyle = kg; x.beginPath(); x.arc(0, 0, kr, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; x.stroke();
  }
  art.malletSprite = function (s) {
    var key = s.id;
    if (malletCache[key]) return malletCache[key];
    var size = (BASE + 24) * 2 * SPR;
    var c = mk(size, size), x = c.getContext('2d');
    x.translate(size / 2, size / 2); x.scale(SPR, SPR);
    // glow halo
    var halo = x.createRadialGradient(0, 0, BASE * 0.8, 0, 0, BASE + 22);
    halo.addColorStop(0, hexA(s.kind === 'rainbow' ? '#ffffff' : s.color, 0.45)); halo.addColorStop(1, hexA(s.kind === 'rainbow' ? '#ffffff' : s.color, 0));
    x.fillStyle = halo; x.beginPath(); x.arc(0, 0, BASE + 22, 0, Math.PI * 2); x.fill();
    drawMalletBody(x, BASE, s);
    malletCache[key] = c;
    return c;
  };

  // Draw a mallet with a living face. o: { look:{x,y}, face, mood, blink, sq (squash 0..1), sqAng, frozen, t }
  art.mallet = function (ctx, m, s, o) {
    var r = m.r;
    var spr = art.malletSprite(s);
    var k = r / BASE;
    var size = spr.width / SPR * k;
    ctx.save();
    ctx.translate(m.x, m.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(r * 0.12, r * 0.18, r * 1.02, r * 0.98, 0, 0, Math.PI * 2); ctx.fill();
    var sq = o.sq || 0;
    if (sq > 0) { ctx.rotate(o.sqAng); ctx.scale(1 - sq * 0.22, 1 + sq * 0.16); ctx.rotate(-o.sqAng); }
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    // face on the knob
    drawFace(ctx, r * 0.5, o, s);
    if (o.frozen > 0) {
      ctx.globalAlpha = Math.min(1, o.frozen * 3) * 0.85;
      var ig = ctx.createLinearGradient(-r, -r, r, r);
      ig.addColorStop(0, 'rgba(230,252,255,0.95)'); ig.addColorStop(1, 'rgba(120,210,255,0.8)');
      ctx.fillStyle = ig;
      AH.rrect(ctx, -r * 1.1, -r * 1.1, r * 2.2, r * 2.2, r * 0.35); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.3); ctx.lineTo(-r * 0.2, -r * 0.8); ctx.moveTo(-r * 0.6, r * 0.1); ctx.lineTo(-r * 0.3, -r * 0.2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  function drawFace(ctx, kr, o, s) {
    var face = o.face || 'normal';
    var lx = o.look ? o.look.x : 0, ly = o.look ? o.look.y : 0;
    var ex = kr * 0.38, ey = -kr * 0.08, er = kr * 0.3, pr = er * 0.55;
    var mood = o.mood || '';
    var ink = '#1a1333';
    ctx.lineCap = 'round';
    if (face === 'robot' && mood !== 'joy' && mood !== 'sad') {
      ctx.fillStyle = '#1a1333';
      AH.rrect(ctx, -kr * 0.8, ey - er * 0.9, kr * 1.6, er * 1.8, er * 0.9); ctx.fill();
      var px = lx * er * 0.6;
      ctx.fillStyle = 'rgba(255,42,74,0.35)';
      ctx.beginPath(); ctx.arc(-ex + px, ey + ly * er * 0.25, er * 0.75, 0, Math.PI * 2); ctx.arc(ex + px, ey + ly * er * 0.25, er * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff2a4a';
      ctx.beginPath(); ctx.arc(-ex + px, ey + ly * er * 0.25, er * 0.45, 0, Math.PI * 2); ctx.arc(ex + px, ey + ly * er * 0.25, er * 0.45, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (mood === 'joy') {
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, kr * 0.12);
      ctx.beginPath(); ctx.arc(-ex, ey + er * 0.4, er * 0.7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey + er * 0.4, er * 0.7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, kr * 0.28, kr * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      return;
    }
    // whites
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-ex, ey, er, 0, Math.PI * 2); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    // pupils
    var blink = o.blink || 0;
    ctx.fillStyle = ink;
    var ppx = lx * (er - pr) * 0.9, ppy = ly * (er - pr) * 0.9;
    ctx.beginPath(); ctx.arc(-ex + ppx, ey + ppy, pr, 0, Math.PI * 2); ctx.arc(ex + ppx, ey + ppy, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-ex + ppx - pr * 0.3, ey + ppy - pr * 0.35, pr * 0.3, 0, Math.PI * 2); ctx.arc(ex + ppx - pr * 0.3, ey + ppy - pr * 0.35, pr * 0.3, 0, Math.PI * 2); ctx.fill();
    // lids
    var lid = blink;
    if (face === 'sleepy') lid = Math.max(lid, 0.5);
    if (mood === 'sad') lid = Math.max(lid, 0.35);
    if (lid > 0) {
      var kc = s.kind === 'rainbow' ? '#ffffff' : s.kind === 'melon' ? '#ff7a88' : s.color;
      ctx.fillStyle = kc;
      [-ex, ex].forEach(function (cx) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, ey, er + 1, 0, Math.PI * 2); ctx.clip();
        ctx.fillRect(cx - er - 2, ey - er - 2, er * 2 + 4, (er * 2 + 4) * lid);
        ctx.restore();
      });
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, kr * 0.07);
      [-ex, ex].forEach(function (cx) {
        var yy = ey - er + er * 2 * lid;
        var hw = Math.sqrt(Math.max(0, er * er - (yy - ey) * (yy - ey)));
        ctx.beginPath(); ctx.moveTo(cx - hw, yy); ctx.lineTo(cx + hw, yy); ctx.stroke();
      });
    }
    // brows
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, kr * 0.1);
    if (face === 'angry') {
      ctx.beginPath(); ctx.moveTo(-ex - er, ey - er * 1.25); ctx.lineTo(-ex + er * 0.8, ey - er * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + er, ey - er * 1.25); ctx.lineTo(ex - er * 0.8, ey - er * 0.7); ctx.stroke();
    } else if (mood === 'sad') {
      ctx.beginPath(); ctx.moveTo(-ex - er, ey - er * 0.9); ctx.lineTo(-ex + er * 0.7, ey - er * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + er, ey - er * 0.9); ctx.lineTo(ex - er * 0.7, ey - er * 1.4); ctx.stroke();
    }
    // mouth
    ctx.lineWidth = Math.max(1.5, kr * 0.08);
    if (face === 'sleepy') {
      ctx.beginPath(); ctx.ellipse(0, kr * 0.42, kr * 0.1, kr * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (mood === 'sad') {
      ctx.beginPath(); ctx.arc(0, kr * 0.58, kr * 0.2, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke();
    } else if (face === 'angry') {
      ctx.beginPath(); ctx.moveTo(-kr * 0.2, kr * 0.45); ctx.lineTo(kr * 0.2, kr * 0.4); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, kr * 0.26, kr * 0.22, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
  }

  /* ------------------------------------------------------------- puck */
  var puckCache = {};
  art.puckSprite = function (p) {
    if (puckCache[p.id]) return puckCache[p.id];
    var R = G.PR, size = (R + 16) * 2 * SPR;
    var c = mk(size, size), x = c.getContext('2d');
    x.translate(size / 2, size / 2); x.scale(SPR, SPR);
    var halo = x.createRadialGradient(0, 0, R * 0.7, 0, 0, R + 16);
    halo.addColorStop(0, hexA(p.trail[0], 0.6)); halo.addColorStop(1, hexA(p.trail[0], 0));
    x.fillStyle = halo; x.beginPath(); x.arc(0, 0, R + 16, 0, Math.PI * 2); x.fill();
    var g = x.createRadialGradient(-R * 0.3, -R * 0.35, 2, 0, 0, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, p.color); g.addColorStop(1, darken(p.color, 0.25));
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.fill();
    x.strokeStyle = p.trail[p.trail.length - 1]; x.lineWidth = 4;
    x.beginPath(); x.arc(0, 0, R * 0.62, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
    x.beginPath(); x.arc(0, 0, R - 1, 0, Math.PI * 2); x.stroke();
    if (p.star) { x.fillStyle = p.trail[1]; star(x, 0, 0, R * 0.4, R * 0.18, 5); x.fill(); }
    puckCache[p.id] = c;
    return c;
  };
  function star(x, cx, cy, ro, ri, n) {
    x.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / n;
      x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    x.closePath();
  }
  art.star = star;

  /* --------------------------------------------------------- power-ups */
  art.power = function (ctx, pw, t) {
    var r = 28, pulse = 1 + Math.sin(t * 6 + pw.seed) * 0.08;
    var col = pw.def.color;
    ctx.save();
    ctx.translate(pw.x, pw.y);
    var sc = Math.min(1, pw.age * 4) * pulse;
    ctx.scale(sc, sc);
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.9);
    g.addColorStop(0, hexA(col, 0.55)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(Math.sin(t * 2 + pw.seed) * 0.2);
    ctx.fillStyle = '#1a1333'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    icon(ctx, pw.def.id, col);
    ctx.restore();
  };
  function icon(ctx, id, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (id === 'big') {
      ctx.beginPath(); ctx.arc(3, 3, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(3, 3, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(-16, -16); ctx.lineTo(-8, -16); ctx.stroke();
    } else if (id === 'tiny') {
      ctx.fillRect(-4, -14, 8, 28);
      ctx.beginPath(); ctx.moveTo(-17, -12); ctx.lineTo(-9, -4); ctx.moveTo(-17, 12); ctx.lineTo(-9, 4);
      ctx.moveTo(17, -12); ctx.lineTo(9, -4); ctx.moveTo(17, 12); ctx.lineTo(9, 4); ctx.stroke();
    } else if (id === 'fire') {
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.bezierCurveTo(12, -4, 14, 6, 0, 16); ctx.bezierCurveTo(-14, 6, -10, -4, -3, -8); ctx.bezierCurveTo(-2, -2, 2, -6, 0, -17); ctx.fill();
      ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(0, -2); ctx.bezierCurveTo(6, 4, 6, 10, 0, 13); ctx.bezierCurveTo(-6, 10, -6, 4, 0, -2); ctx.fill();
    } else if (id === 'freeze') {
      for (var i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 16);
        ctx.moveTo(-5, -12); ctx.lineTo(0, -8); ctx.lineTo(5, -12);
        ctx.moveTo(-5, 12); ctx.lineTo(0, 8); ctx.lineTo(5, 12); ctx.stroke();
        ctx.restore();
      }
    } else if (id === 'multi') {
      [[-9, 6], [9, 6], [0, -9]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill(); });
    }
  }

  /* ------------------------------------------------------------ colour */
  function parse(hex) { var h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function toHex(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function lighten(hex, k) { var c = parse(hex); return toHex(c.map(function (v) { return v + (255 - v) * k; })); }
  function darken(hex, k) { var c = parse(hex); return toHex(c.map(function (v) { return v * (1 - k); })); }
  AH.lighten = lighten; AH.darken = darken;

  // Small preview for shop cards / bot cards.
  art.preview = function (cv, kind, item, extra) {
    var x = cv.getContext('2d'), w = cv.width, h = cv.height;
    x.clearRect(0, 0, w, h);
    if (kind === 'mallet' || kind === 'bot') {
      var r = Math.min(w, h) * 0.36;
      var face = kind === 'bot' ? item.face : 'normal';
      var skin = kind === 'bot' ? { id: 'bot_' + item.id, kind: 'solid', color: item.color, ring: item.ring } : item;
      x.save();
      art.mallet(x, { x: w / 2, y: h / 2, r: r }, skin, { face: face, look: { x: -0.4, y: 0.2 }, mood: extra && extra.mood });
      x.restore();
    } else if (kind === 'table') {
      var tb = art.buildTable(item, Math.min(w / G.W, h / G.H) * 1.0);
      x.drawImage(tb, 0, 0, w, h);
    } else if (kind === 'puck') {
      var spr = art.puckSprite(item);
      for (var i = 7; i >= 1; i--) {
        x.globalAlpha = (1 - i / 8) * 0.8;
        x.fillStyle = item.trail[i % item.trail.length];
        x.beginPath(); x.arc(w / 2 - i * 10, h / 2 + i * 3, 16 - i * 1.4, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      var s = 1.4;
      x.drawImage(spr, w / 2 + 12 - spr.width / SPR * s / 2, h / 2 - spr.height / SPR * s / 2, spr.width / SPR * s, spr.height / SPR * s);
    }
  };
})();
