/* Bonk Garden (حديقة البونك): everything drawn in code on one 2D canvas (1280x720 logical).
 * The garden, the beach and the moon base are painted once into an offscreen canvas
 * (with the holes); each frame draws that, the critters (clipped to their holes), the
 * effects and the hammer. Flat fills and outlines only: no shadows, filters or canvas
 * reads, so it stays smooth on the lab PCs. BG.drawHammer and BG.drawCritter also paint
 * the previews in the hammer shop and the banners.
 */
(function () {
  'use strict';
  var BG = window.BG, M = Math, W = 1280, H = 720, TAU = M.PI * 2;
  var INK = '#2a1d4e';
  BG.INK = INK;

  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function blob(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function rrect(ctx, x, y, w, h, r) {
    r = M.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function fs(ctx, fill, lw) { ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); } }
  function starPath(ctx, x, y, r, rot, inner) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = rot + i * M.PI / 5 - M.PI / 2, rr = i % 2 ? r * (inner || 0.45) : r;
      if (i) ctx.lineTo(x + M.cos(a) * rr, y + M.sin(a) * rr); else ctx.moveTo(x + M.cos(a) * rr, y + M.sin(a) * rr);
    }
    ctx.closePath();
  }
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
    ctx.closePath();
  }
  function googly(ctx, x, y, r, px, py) {
    blob(ctx, x, y, r, r); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = M.max(2, r * 0.22); ctx.strokeStyle = INK; ctx.stroke();
    blob(ctx, x + px * r * 0.42, y + py * r * 0.42, r * 0.52, r * 0.52); ctx.fillStyle = INK; ctx.fill();
    blob(ctx, x + px * r * 0.42 - r * 0.18, y + py * r * 0.42 - r * 0.2, r * 0.14, r * 0.14); ctx.fillStyle = '#fff'; ctx.fill();
  }
  function xEye(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.7); ctx.lineTo(x + r * 0.7, y + r * 0.7); ctx.moveTo(x + r * 0.7, y - r * 0.7); ctx.lineTo(x - r * 0.7, y + r * 0.7);
    ctx.lineWidth = r * 0.42; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  }
  BG.rrect = rrect; BG.blob = blob; BG.starPath = starPath; BG.heartPath = heartPath;
  BG.star = function (ctx, x, y, r, fill, rot) { starPath(ctx, x, y, r, rot || 0, 0.48); ctx.fillStyle = fill || '#ffd23f'; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = M.max(2, r * 0.16); ctx.strokeStyle = INK; ctx.stroke(); };
  BG.heart = function (ctx, x, y, s, fill) { heartPath(ctx, x, y, s); ctx.fillStyle = fill || '#ff4f6d'; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = M.max(2, s * 0.14); ctx.strokeStyle = INK; ctx.stroke(); };

  /* ------------------------------------------------------------ the worlds */
  var THEMES = [
    { sky: ['#7fd3ff', '#d4f3ff'], ground: '#7cd651', band: '#70c947', mound: '#b77a43', moundDark: '#93592b', hole: '#3a2414', holeIn: '#5a3a22', lip: '#c98d52', key: '#ffffff' },
    { sky: ['#4fc4ff', '#c4efff'], ground: '#f6d98b', band: '#efcd78', mound: '#f2c46c', moundDark: '#d9a24a', hole: '#6b4a24', holeIn: '#8c6635', lip: '#ffd98a', key: '#ffffff' },
    { sky: ['#140b38', '#3a2380'], ground: '#bdb7d2', band: '#aea7c6', mound: '#d3cee3', moundDark: '#9d96b8', hole: '#2a1f4a', holeIn: '#3f3266', lip: '#e2deef', key: '#ffffff' }
  ];
  BG.THEMES = THEMES;
  var HORIZON = 236;

  function paintSky(c, th, i) {
    var g = c.createLinearGradient(0, 0, 0, HORIZON + 20);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, HORIZON + 20);
    if (i === 2) {
      for (var s = 0; s < 90; s++) { c.fillStyle = s % 7 ? '#ffffff' : '#ffe14f'; var r = 1 + hash(s, 3) * 2.4; c.fillRect(hash(s, 1) * W, hash(s, 2) * HORIZON, r, r); }
      // the Earth and a ringed planet
      blob(c, 1092, 92, 50, 50); fs(c, '#3f9bff', 4);
      c.fillStyle = '#5fd068';
      blob(c, 1076, 76, 20, 14); c.fill(); blob(c, 1110, 110, 16, 11); c.fill(); blob(c, 1112, 70, 9, 6); c.fill();
      blob(c, 1072, 74, 30, 8); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
      blob(c, 190, 96, 34, 34); fs(c, '#ff9f5a', 4);
      c.save(); c.translate(190, 96); c.rotate(-0.35); blob(c, 0, 0, 64, 14); c.lineWidth = 7; c.strokeStyle = '#ffd98a'; c.stroke(); c.restore();
      return;
    }
    // sun and clouds
    blob(c, 1120, 78, 56, 56); c.fillStyle = 'rgba(255,247,168,0.55)'; c.fill();
    blob(c, 1120, 78, 40, 40); fs(c, '#fff27a', 4);
    c.fillStyle = '#ffffff';
    [[170, 76, 1], [520, 56, 0.8], [840, 96, 1.1]].forEach(function (k) {
      var x = k[0], y = k[1], s = k[2];
      c.beginPath(); c.ellipse(x, y, 62 * s, 22 * s, 0, 0, TAU); c.ellipse(x + 30 * s, y - 14 * s, 36 * s, 24 * s, 0, 0, TAU); c.ellipse(x - 28 * s, y - 8 * s, 30 * s, 20 * s, 0, 0, TAU);
      c.fill();
    });
    if (i === 1) {
      // birds
      c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round';
      [[640, 120], [672, 104], [960, 150]].forEach(function (b) { c.beginPath(); c.moveTo(b[0] - 12, b[1] - 4); c.quadraticCurveTo(b[0] - 6, b[1] - 10, b[0], b[1]); c.quadraticCurveTo(b[0] + 6, b[1] - 10, b[0] + 12, b[1] - 4); c.stroke(); });
    }
  }
  function paintHorizon(c, th, i) {
    if (i === 0) {
      var hills = [['#a6e87e', 150, 60], ['#8ad964', 190, 46]];
      hills.forEach(function (hl, k) {
        c.beginPath(); c.moveTo(-10, HORIZON + 10);
        for (var x = -10; x <= W + 10; x += 40) c.lineTo(x, hl[1] + M.sin(x * 0.006 + k * 2) * hl[2] * 0.5 + M.sin(x * 0.017 + k) * 10);
        c.lineTo(W + 10, HORIZON + 10); c.closePath(); c.fillStyle = hl[0]; c.fill();
      });
      // a picket fence
      c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 3;
      rrect(c, -10, 214, W + 20, 10, 3); c.fill(); c.stroke();
      for (var p = 8; p < W; p += 34) {
        c.beginPath(); c.moveTo(p, 246); c.lineTo(p, 204); c.lineTo(p + 9, 194); c.lineTo(p + 18, 204); c.lineTo(p + 18, 246); c.closePath(); c.fill(); c.stroke();
      }
    } else if (i === 1) {
      c.fillStyle = '#2fa8e0'; c.fillRect(0, 176, W, 70);
      c.fillStyle = '#5cc6f2'; c.fillRect(0, 176, W, 16);
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.lineCap = 'round';
      for (var r = 0; r < 3; r++) {
        c.beginPath();
        for (var x2 = 0; x2 <= W; x2 += 30) { var y2 = 198 + r * 16 + M.sin(x2 * 0.05 + r) * 3; if (x2) c.lineTo(x2, y2); else c.moveTo(x2, y2); }
        c.stroke();
      }
      // a sailboat
      c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(980, 186); c.lineTo(980, 140); c.lineTo(1012, 180); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(956, 186); c.lineTo(1022, 186); c.lineTo(1012, 198); c.lineTo(966, 198); c.closePath(); c.fillStyle = '#ff5a5a'; c.fill(); c.stroke();
    } else {
      // distant moon hills and the moon base
      c.beginPath(); c.moveTo(-10, HORIZON + 10);
      for (var x3 = -10; x3 <= W + 10; x3 += 40) c.lineTo(x3, 196 + M.sin(x3 * 0.008) * 18 + M.sin(x3 * 0.021) * 8);
      c.lineTo(W + 10, HORIZON + 10); c.closePath(); c.fillStyle = '#8f88ad'; c.fill();
      c.strokeStyle = INK; c.lineWidth = 4;
      c.beginPath(); c.arc(380, 222, 64, M.PI, 0); c.closePath(); c.fillStyle = 'rgba(160,230,255,0.85)'; c.fill(); c.stroke();
      c.beginPath(); c.arc(380, 222, 44, M.PI * 1.15, M.PI * 1.45); c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      rrect(c, 300, 214, 160, 18, 6); fs(c, '#e2deef', 4);
      rrect(c, 470, 196, 70, 36, 10); fs(c, '#e2deef', 4);
      blob(c, 492, 212, 7, 7); fs(c, '#ffe14f', 3); blob(c, 518, 212, 7, 7); fs(c, '#4fd8ff', 3);
      c.beginPath(); c.moveTo(520, 196); c.lineTo(536, 150); c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
      blob(c, 536, 148, 8, 8); fs(c, '#ff5fa2', 3);
      // a little flag
      c.beginPath(); c.moveTo(820, 222); c.lineTo(820, 160); c.stroke();
      rrect(c, 820, 160, 44, 28, 4); fs(c, '#ff5fa2', 3);
      star5(c, 842, 174, 9);
    }
  }
  function star5(c, x, y, r) { starPath(c, x, y, r, 0, 0.45); c.fillStyle = '#ffe14f'; c.fill(); }
  function paintGround(c, th, i, holes) {
    c.fillStyle = th.ground; c.fillRect(0, HORIZON, W, H - HORIZON);
    // mowing stripes / sand ripples / moon dust, wider towards the front
    for (var b = 0, y = HORIZON + 8; y < H; b++) {
      var hgt = 16 + b * 9;
      if (b % 2) { c.fillStyle = th.band; c.fillRect(0, y, W, hgt); }
      y += hgt;
    }
    var k, x, yy;
    if (i === 0) {
      // flowers and grass tufts
      for (k = 0; k < 44; k++) {
        x = hash(k, 11) * W; yy = HORIZON + 24 + hash(k, 12) * (H - HORIZON - 30);
        if (nearHole(holes, x, yy, 1.5)) continue;
        if (k % 3) {
          c.strokeStyle = '#4fae38'; c.lineWidth = 3; c.lineCap = 'round';
          c.beginPath(); c.moveTo(x - 7, yy - 9); c.lineTo(x, yy); c.lineTo(x + 2, yy - 13); c.moveTo(x, yy); c.lineTo(x + 9, yy - 8); c.stroke();
        } else {
          var col = ['#ff5fa2', '#ffffff', '#ffe14f', '#b46bff'][k % 4];
          for (var pt = 0; pt < 5; pt++) { var a = pt * TAU / 5; blob(c, x + M.cos(a) * 7, yy + M.sin(a) * 7, 6, 6); c.fillStyle = col; c.fill(); }
          blob(c, x, yy, 4.5, 4.5); c.fillStyle = '#ff9f2e'; c.fill();
        }
      }
    } else if (i === 1) {
      for (k = 0; k < 30; k++) {
        x = hash(k, 21) * W; yy = HORIZON + 26 + hash(k, 22) * (H - HORIZON - 30);
        if (nearHole(holes, x, yy, 1.5)) continue;
        if (k % 4 === 0) { c.lineWidth = 2.5; c.strokeStyle = INK; starPath(c, x, yy, 12, 0, 0.45); c.fillStyle = '#ff8a5c'; c.fill(); c.stroke(); }
        else if (k % 4 === 1) { c.beginPath(); c.arc(x, yy, 9, M.PI, 0); c.closePath(); c.fillStyle = '#ffb3c6'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(); }
        else { c.strokeStyle = 'rgba(200,150,70,0.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 22, yy); c.quadraticCurveTo(x, yy - 7, x + 22, yy); c.stroke(); }
      }
      // a beach umbrella and a bucket
      c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.moveTo(1196, 420); c.lineTo(1176, 292); c.stroke();
      c.beginPath(); c.moveTo(1106, 318); c.quadraticCurveTo(1170, 226, 1262, 290); c.closePath();
      c.fillStyle = '#ff5a5a'; c.fill(); c.lineWidth = 4; c.stroke();
      c.beginPath(); c.moveTo(1150, 300); c.quadraticCurveTo(1176, 246, 1210, 292); c.fillStyle = '#ffffff'; c.fill();
      c.beginPath(); c.moveTo(104, 636); c.lineTo(158, 636); c.lineTo(150, 690); c.lineTo(112, 690); c.closePath(); fs(c, '#4fa8ff', 4);
      c.beginPath(); c.arc(131, 636, 26, M.PI, 0); c.lineWidth = 3; c.stroke();
    } else {
      for (k = 0; k < 26; k++) {
        x = hash(k, 31) * W; yy = HORIZON + 30 + hash(k, 32) * (H - HORIZON - 34);
        if (nearHole(holes, x, yy, 1.6)) continue;
        var cr = 10 + hash(k, 33) * 20;
        blob(c, x, yy, cr, cr * 0.38); c.fillStyle = '#a49dbe'; c.fill();
        blob(c, x, yy + cr * 0.06, cr * 0.75, cr * 0.26); c.fillStyle = '#958eb0'; c.fill();
      }
    }
  }
  function nearHole(holes, x, y, f) {
    for (var i = 0; i < holes.length; i++) { var h = holes[i]; if (M.abs(x - h.x) < h.rx * f && y > h.y - h.h * 0.9 && y < h.y + h.ry * 3) return true; }
    return false;
  }
  // The hole's mound and dark opening (the front edge is drawn again over the critter).
  function paintHole(c, th, i, h) {
    var mx = h.rx * 1.32, my = h.ry * 1.7, cy = h.y + h.ry * 0.3;
    blob(c, h.x, cy + 6, mx + 4, my + 4); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fill();
    blob(c, h.x, cy, mx, my); fs(c, th.mound, 4);
    blob(c, h.x, cy + my * 0.35, mx * 0.82, my * 0.55); c.fillStyle = th.moundDark; c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
    if (i === 1) {
      // sandcastle towers on the back rim
      for (var k = 0; k < 5; k++) {
        var a = M.PI + (k + 0.5) * M.PI / 5, tx = h.x + M.cos(a) * mx * 0.9, ty = cy + M.sin(a) * my * 0.9;
        rrect(c, tx - 11, ty - 24, 22, 26, 3); fs(c, th.lip, 3);
        c.fillStyle = th.lip; c.fillRect(tx - 11, ty - 30, 6, 7); c.fillRect(tx + 5, ty - 30, 6, 7);
        c.lineWidth = 3; c.strokeStyle = INK; c.strokeRect(tx - 11, ty - 30, 6, 7); c.strokeRect(tx + 5, ty - 30, 6, 7);
      }
    }
    var g = c.createLinearGradient(0, h.y - h.ry, 0, h.y + h.ry);
    g.addColorStop(0, th.holeIn); g.addColorStop(0.45, th.hole); g.addColorStop(1, th.hole);
    blob(c, h.x, h.y, h.rx, h.ry); c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
  }

  /* ------------------------------------------------------------- critters */
  // ctx is at the critter's base (0, 0), 100 units tall (up is negative y).
  // o: { t, px, py: pupils -1..1, hit: true when bonked, wind 0..1, helmet, mood, age }
  function arms(ctx, o, y, spread, col) {
    var t = o.t, wave = o.mood === 2 ? 1 : 0.35;
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    for (var s = -1; s <= 1; s += 2) {
      var ax = s * spread, hx = ax + s * 20, hy = y - 18 - (o.hit ? -18 : wave * 16 * (0.5 + 0.5 * M.sin(t * 9 + s)));
      ctx.beginPath(); ctx.moveTo(ax, y); ctx.lineTo(hx, hy); ctx.stroke();
      blob(ctx, hx, hy, 7, 7); fs(ctx, col || '#ffffff', 3);
    }
  }
  function mouth(ctx, x, y, wd, o) {
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    if (o.hit) {
      // a wobbly mouth with the tongue out
      ctx.beginPath(); ctx.moveTo(x - wd, y); ctx.quadraticCurveTo(x - wd / 2, y - 5, x, y); ctx.quadraticCurveTo(x + wd / 2, y + 5, x + wd, y); ctx.stroke();
      blob(ctx, x + wd * 0.3, y + 7, 7, 8); fs(ctx, '#ff7a9a', 3);
      return;
    }
    var rasp = o.mood === 1 && M.sin(o.t * 3 + o.id) > 0.1;
    ctx.beginPath(); ctx.moveTo(x - wd, y - 3); ctx.quadraticCurveTo(x, y + wd * 0.9, x + wd, y - 3); ctx.closePath();
    fs(ctx, '#7a1f3d', 3.5);
    if (rasp) {
      // blowing a raspberry
      rrect(ctx, x - 8, y, 16, 20 + M.sin(o.t * 30) * 3, 8); fs(ctx, '#ff7a9a', 3);
      ctx.fillStyle = '#a8e6ff';
      for (var d = 0; d < 3; d++) { blob(ctx, x + 18 + d * 8, y + 4 - d * 6 + M.sin(o.t * 20 + d) * 3, 2.5, 2.5); ctx.fill(); }
    } else { blob(ctx, x, y + wd * 0.42, wd * 0.4, wd * 0.16); ctx.fillStyle = '#ff7a9a'; ctx.fill(); }
  }
  function eyes(ctx, list, o) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (o.hit) xEye(ctx, e[0], e[1], e[2]);
      else googly(ctx, e[0], e[1], e[2], o.px + (i ? 0.08 : -0.08), o.py);
    }
  }
  var C = {};
  C.potato = function (ctx, o) {
    ctx.beginPath(); ctx.moveTo(-40, -6);
    ctx.bezierCurveTo(-52, -58, -30, -100, 0, -98);
    ctx.bezierCurveTo(34, -100, 50, -60, 42, -14);
    ctx.bezierCurveTo(40, 12, -36, 14, -40, -6); ctx.closePath();
    fs(ctx, '#d6a062', 4.5);
    ctx.fillStyle = '#ad7740';
    [[-24, -30, 5], [22, -84, 4], [28, -30, 4.5], [-8, -88, 3.5], [-30, -60, 3]].forEach(function (p) { blob(ctx, p[0], p[1], p[2], p[2] * 0.8); ctx.fill(); });
    ctx.fillStyle = '#5fd068'; ctx.lineWidth = 3; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.ellipse(-8, -102, 12, 5, -0.6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(9, -103, 11, 5, 0.6, 0, TAU); ctx.fill(); ctx.stroke();
    arms(ctx, o, -40, 40);
    eyes(ctx, [[-15, -66, 14], [15, -68, 12]], o);
    mouth(ctx, 0, -38, 15, o);
  };
  C.carrot = function (ctx, o) {
    ctx.fillStyle = '#4fbf5a'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    [-0.55, 0, 0.55].forEach(function (a) { ctx.save(); ctx.translate(0, -92); ctx.rotate(a + M.sin(o.t * 8 + a) * 0.08); ctx.beginPath(); ctx.ellipse(0, -16, 8, 18, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); });
    ctx.beginPath(); ctx.moveTo(-34, -84); ctx.quadraticCurveTo(0, -102, 34, -84);
    ctx.quadraticCurveTo(26, -30, 8, 8); ctx.quadraticCurveTo(0, 16, -8, 8); ctx.quadraticCurveTo(-26, -30, -34, -84); ctx.closePath();
    fs(ctx, '#ff8a2e', 4.5);
    ctx.strokeStyle = '#d9661a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-24, -34); ctx.lineTo(-12, -32); ctx.moveTo(14, -20); ctx.lineTo(22, -22); ctx.moveTo(18, -52); ctx.lineTo(28, -54); ctx.stroke();
    arms(ctx, o, -44, 28);
    eyes(ctx, [[-13, -66, 13], [13, -67, 13]], o);
    if (o.hit) mouth(ctx, 0, -42, 10, o);
    else { blob(ctx, 0, -42, 7, 9); fs(ctx, '#7a1f3d', 3); }
  };
  C.helmet = function (ctx, o) {
    rrect(ctx, -27, -64, 54, 68, 20); fs(ctx, '#fff1d6', 4.5);
    arms(ctx, o, -30, 27);
    if (o.helmet) {
      ctx.beginPath(); ctx.arc(0, -68, 46, M.PI, 0); ctx.closePath(); fs(ctx, '#ffd23f', 4.5);
      ctx.beginPath(); ctx.moveTo(0, -112); ctx.lineTo(0, -70); ctx.lineWidth = 4; ctx.strokeStyle = '#e0a800'; ctx.stroke();
      rrect(ctx, -58, -72, 116, 13, 6); fs(ctx, '#ffd23f', 4);
      blob(ctx, 0, -96, 9, 9); fs(ctx, '#fffbe0', 3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; rrect(ctx, -32, -100, 10, 22, 5); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-50, -58); ctx.quadraticCurveTo(-48, -112, 0, -112); ctx.quadraticCurveTo(48, -112, 50, -58); ctx.closePath();
      fs(ctx, '#ff5a5a', 4.5);
      ctx.fillStyle = '#ffffff';
      blob(ctx, -24, -80, 8, 7); ctx.fill(); blob(ctx, 10, -96, 9, 7); ctx.fill(); blob(ctx, 28, -72, 7, 6); ctx.fill();
      // a little bump from the bonk
      blob(ctx, -4, -114, 9, 7); fs(ctx, '#ff8a8a', 3);
    }
    eyes(ctx, [[-12, -42, 11], [12, -43, 10]], o);
    mouth(ctx, 0, -22, 11, o);
  };
  C.disco = function (ctx, o) {
    rrect(ctx, -15, -52, 30, 56, 10); fs(ctx, '#9be06a', 4.5);
    arms(ctx, o, -34, 15, '#ffe14f');
    var flo = [[-32, -62, 20], [32, -62, 20], [-17, -86, 22], [17, -88, 22], [0, -68, 25]];
    for (var i = 0; i < flo.length; i++) { blob(ctx, flo[i][0], flo[i][1], flo[i][2], flo[i][2]); fs(ctx, i % 2 ? '#ffd23f' : '#ffe14f', 4); }
    ctx.fillStyle = '#fff6b0';
    blob(ctx, -22, -92, 5, 4); ctx.fill(); blob(ctx, 8, -76, 4, 3); ctx.fill();
    if (o.hit) eyes(ctx, [[-11, -68, 9], [11, -68, 9]], o);
    else {
      // disco sunglasses
      ctx.fillStyle = INK;
      rrect(ctx, -25, -76, 22, 15, 6); ctx.fill(); rrect(ctx, 3, -76, 22, 15, 6); ctx.fill(); ctx.fillRect(-4, -72, 8, 4);
      ctx.fillStyle = '#ff5fa2'; ctx.fillRect(-21, -73, 6, 4); ctx.fillStyle = '#4fd8ff'; ctx.fillRect(7, -73, 6, 4);
    }
    mouth(ctx, 0, -50, 11, o);
    if (!o.hit) {
      for (var s = 0; s < 4; s++) {
        var a = o.t * 2.5 + s * TAU / 4, r = 62 + M.sin(o.t * 6 + s) * 6;
        BG.star(ctx, M.cos(a) * r, -60 + M.sin(a) * r * 0.7, 7 + 3 * M.sin(o.t * 9 + s * 2), s % 2 ? '#ffffff' : '#ffe14f', o.t * 3);
      }
    }
  };
  C.sock = function (ctx, o) {
    rrect(ctx, -27, -94, 54, 100, 26);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-30, -20, 60, 12); ctx.fillRect(-30, 2, 60, 12);
    ctx.fillStyle = '#4fa8ff'; ctx.fillRect(-30, -96, 60, 14);
    ctx.restore();
    rrect(ctx, -27, -94, 54, 100, 26); ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke();
    // yarn hair
    ctx.strokeStyle = '#ff9f2e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (var k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * 9, -98, 6, M.PI, TAU); ctx.stroke(); }
    eyes(ctx, [[-11, -70, 12], [13, -72, 11]], o);
    var open = o.hit ? 6 : 5 + 7 * M.abs(M.sin(o.t * 10));
    blob(ctx, 0, -44, 20, open); fs(ctx, '#7a1f3d', 3.5);
    if (!o.hit) { blob(ctx, 4, -44 + open * 0.4, 8, open * 0.45); ctx.fillStyle = '#ff7a9a'; ctx.fill(); }
  };
  C.pie = function (ctx, o) {
    var wob = o.wind ? M.sin(o.t * 46) * o.wind * 4 : 0;
    blob(ctx, 0, -44, 42, 42); fs(ctx, '#ff4f4f', 4.5);
    blob(ctx, -16, -64, 9, 6); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    ctx.fillStyle = '#4fbf5a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    starPath(ctx, 0, -86, 15, 0, 0.4); ctx.fill(); ctx.stroke();
    // eyebrows: up to something
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    if (!o.hit) { ctx.beginPath(); ctx.moveTo(-24, -72); ctx.lineTo(-6, -66); ctx.moveTo(24, -73); ctx.lineTo(7, -67); ctx.stroke(); }
    eyes(ctx, [[-14, -56, 11], [14, -57, 10]], o);
    mouth(ctx, 0, -32, 14, o);
    // the arm with the cream pie
    var hx = 52 + wob, hy = -70 - (o.wind || 0) * 24;
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(34, -40); ctx.lineTo(hx, hy); ctx.stroke();
    blob(ctx, hx, hy - 6, 30, 8); fs(ctx, '#e0a458', 3.5);
    ctx.beginPath(); ctx.moveTo(hx - 26, hy - 10); ctx.quadraticCurveTo(hx - 22, hy - 34, hx, hy - 34); ctx.quadraticCurveTo(hx + 22, hy - 34, hx + 26, hy - 10); ctx.closePath();
    fs(ctx, '#fffaf0', 3.5);
    blob(ctx, hx, hy - 38, 6, 6); fs(ctx, '#ff3d5a', 3);
    if (o.wind > 0.3 && !o.hit) {
      ctx.font = '700 34px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
      ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText('!', hx + 26, hy - 60); ctx.fillStyle = '#ffe14f'; ctx.fillText('!', hx + 26, hy - 60);
    }
  };
  C.bunny = function (ctx, o) {
    for (var s = -1; s <= 1; s += 2) {
      ctx.save(); ctx.translate(s * 15, -80); ctx.rotate(s * (0.16 + (o.hit ? 0.5 : M.sin(o.t * 4 + s) * 0.05)));
      ctx.beginPath(); ctx.ellipse(0, -26, 11, 30, 0, 0, TAU); fs(ctx, '#ffffff', 4);
      ctx.beginPath(); ctx.ellipse(0, -24, 5, 21, 0, 0, TAU); ctx.fillStyle = '#ffb3d1'; ctx.fill();
      ctx.restore();
    }
    blob(ctx, 0, -42, 38, 44); fs(ctx, '#ffffff', 4.5);
    blob(ctx, -22, -38, 8, 5); ctx.fillStyle = '#ffc2dc'; ctx.fill(); blob(ctx, 22, -38, 8, 5); ctx.fill();
    if (o.hit) {
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-20, -62); ctx.lineTo(-10, -56); ctx.lineTo(-20, -50); ctx.moveTo(20, -62); ctx.lineTo(10, -56); ctx.lineTo(20, -50); ctx.stroke();
      ctx.fillStyle = '#7fd3ff';
      blob(ctx, -22, -42 + (o.age * 60) % 20, 4, 6); ctx.fill(); blob(ctx, 22, -40 + (o.age * 50) % 20, 4, 6); ctx.fill();
    } else {
      blob(ctx, -14, -56, 8, 9); ctx.fillStyle = INK; ctx.fill(); blob(ctx, 14, -56, 8, 9); ctx.fill();
      ctx.fillStyle = '#ffffff'; blob(ctx, -16, -59, 3, 3); ctx.fill(); blob(ctx, 12, -59, 3, 3); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-5, -44); ctx.lineTo(5, -44); ctx.lineTo(0, -38); ctx.closePath(); ctx.fillStyle = '#ff7aa8'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.quadraticCurveTo(-5, -31, -10, -34); ctx.moveTo(0, -38); ctx.quadraticCurveTo(5, -31, 10, -34); ctx.stroke();
    // the flower it holds
    ctx.strokeStyle = '#3c9a3c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(18, -8); ctx.lineTo(30, -40); ctx.stroke();
    for (var p = 0; p < 5; p++) { var a = p * TAU / 5 + o.t; blob(ctx, 30 + M.cos(a) * 8, -44 + M.sin(a) * 8, 6.5, 6.5); fs(ctx, '#ff8cc6', 2.5); }
    blob(ctx, 30, -44, 5, 5); fs(ctx, '#ffe14f', 2.5);
    blob(ctx, 18, -12, 8, 7); fs(ctx, '#ffffff', 3);
    if (!o.hit) {
      // friendly hearts float up
      for (var k = 0; k < 2; k++) {
        var f = (o.t * 0.6 + k * 0.5) % 1;
        ctx.globalAlpha = 1 - f;
        BG.heart(ctx, -30 + k * 56, -110 - f * 40, 9, '#ff6fa8');
      }
      ctx.globalAlpha = 1;
    }
  };
  C.crab = function (ctx, o) {
    var snap = o.hit ? 0.1 : 0.35 + 0.3 * M.abs(M.sin(o.t * 7));
    ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.moveTo(s * 40, -36); ctx.lineTo(s * 58, -62); ctx.stroke();
      ctx.save(); ctx.translate(s * 62, -76);
      ctx.beginPath(); ctx.arc(0, 0, 17, -M.PI / 2 + snap * s, M.PI * 1.5 - snap * s, s < 0); ctx.lineTo(0, 0); ctx.closePath();
      fs(ctx, '#ff6a4f', 4);
      ctx.restore();
    }
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-14, -56); ctx.lineTo(-18, -82); ctx.moveTo(14, -56); ctx.lineTo(18, -82); ctx.stroke();
    blob(ctx, 0, -34, 50, 32); fs(ctx, '#ff6a4f', 4.5);
    blob(ctx, 0, -24, 30, 14); ctx.fillStyle = '#ffa38c'; ctx.fill();
    eyes(ctx, [[-18, -86, 12], [18, -88, 12]], o);
    mouth(ctx, 0, -38, 12, o);
  };
  C.alien = function (ctx, o) {
    ctx.lineWidth = 4; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(0, -88); ctx.quadraticCurveTo(10, -104, 8, -116); ctx.stroke();
    blob(ctx, 8, -118, 8, 8); fs(ctx, M.sin(o.t * 8) > 0 ? '#ff5fa2' : '#ffb3d6', 3.5);
    ctx.beginPath(); ctx.moveTo(-34, -8); ctx.bezierCurveTo(-40, -70, -26, -94, 0, -94); ctx.bezierCurveTo(26, -94, 40, -70, 34, -8); ctx.closePath();
    fs(ctx, '#8cf06a', 4.5);
    ctx.fillStyle = '#6fcf4f';
    blob(ctx, -18, -28, 5, 4); ctx.fill(); blob(ctx, 20, -20, 4, 3); ctx.fill(); blob(ctx, 22, -76, 4, 3); ctx.fill();
    arms(ctx, o, -36, 32, '#8cf06a');
    eyes(ctx, [[0, -64, 21]], o);
    mouth(ctx, 0, -32, 12, o);
    if (!o.hit) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-3, -32, 7, 6); }
  };
  BG.CRITTER_ART = C;
  // A critter drawn at its base (x, y), size = pixels for its 100 units.
  BG.drawCritter = function (ctx, kind, x, y, size, o) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    (C[kind] || C.potato)(ctx, o);
    ctx.restore();
  };
  // Tiny dizzy stars circling a bonked head.
  function dizzy(ctx, x, y, r, t) {
    for (var k = 0; k < 3; k++) {
      var a = t * 7 + k * TAU / 3;
      BG.star(ctx, x + M.cos(a) * r, y + M.sin(a) * r * 0.35, r * 0.24, '#ffe14f', t * 4);
    }
  }

  /* --------------------------------------------------------------- hammers */
  // Hammer art at its grip (0, 0), the handle going up to the head at (0, -L).
  var L = 108;
  BG.HAMMER_L = L;
  var HM = {};
  function stick(ctx, col, w) { rrect(ctx, -(w || 8), -L + 8, (w || 8) * 2, L, w || 8); fs(ctx, col, 4); }
  HM.squeak = function (ctx, t, gold) {
    stick(ctx, gold ? '#b8742a' : '#ffd23f');
    rrect(ctx, -10, -18, 20, 22, 6); fs(ctx, gold ? '#8a5420' : '#ff8a2e', 3.5);
    rrect(ctx, -44, -L - 25, 88, 50, 22); fs(ctx, gold ? '#ffc928' : '#ff4f6d', 4.5);
    rrect(ctx, -52, -L - 29, 16, 58, 7); fs(ctx, gold ? '#fff1a8' : '#ffd23f', 4);
    rrect(ctx, 36, -L - 29, 16, 58, 7); fs(ctx, gold ? '#fff1a8' : '#ffd23f', 4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; rrect(ctx, -30, -L - 18, 60, 9, 4); ctx.fill();
    if (gold) for (var s = 0; s < 3; s++) BG.star(ctx, -40 + s * 40, -L - 40 - (s % 2) * 14, 7 + 3 * M.sin(t * 8 + s * 2), '#ffffff', t * 2);
  };
  HM.gold = function (ctx, t) { HM.squeak(ctx, t, true); };
  HM.chicken = function (ctx, t) {
    ctx.lineWidth = 5; ctx.strokeStyle = '#ff9f2e'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-10, 16); ctx.moveTo(6, 2); ctx.lineTo(10, 16); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -44, 20, 46, 0, 0, TAU); fs(ctx, '#ffe14f', 4.5);
    ctx.beginPath(); ctx.ellipse(16, -48, 9, 20, 0.3, 0, TAU); fs(ctx, '#ffd23f', 3.5);
    rrect(ctx, -9, -L + 2, 18, 30, 9); fs(ctx, '#ffe14f', 4);
    blob(ctx, 0, -L, 25, 25); fs(ctx, '#ffe14f', 4.5);
    ctx.fillStyle = '#ff4f4f'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    for (var k = -1; k <= 1; k++) { blob(ctx, k * 9, -L - 26 - (k ? 0 : 4), 8, 9); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(20, -L - 6); ctx.lineTo(46, -L + 2); ctx.lineTo(20, -L + 10); ctx.closePath(); fs(ctx, '#ff9f2e', 3.5);
    ctx.beginPath(); ctx.moveTo(22, -L + 2); ctx.lineTo(40, -L + 2); ctx.lineWidth = 2.5; ctx.stroke();
    blob(ctx, 14, -L + 16, 6, 9); fs(ctx, '#ff4f4f', 3);
    googly(ctx, 4, -L - 6, 10, 0.5 * M.sin(t * 7), 0.3);
  };
  HM.bread = function (ctx) {
    rrect(ctx, -17, -L - 36, 34, L + 46, 17); fs(ctx, '#e0a458', 4.5);
    ctx.strokeStyle = '#f8d898'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (var k = 0; k < 5; k++) { var y = -L - 18 + k * 26; ctx.beginPath(); ctx.moveTo(-8, y + 7); ctx.lineTo(8, y - 7); ctx.stroke(); }
    ctx.fillStyle = 'rgba(120,60,20,0.25)'; rrect(ctx, 6, -L - 26, 8, L + 26, 4); ctx.fill();
  };
  HM.spoon = function (ctx) {
    rrect(ctx, -7, -L + 30, 14, L - 22, 7); fs(ctx, '#c9cfe0', 4);
    rrect(ctx, -10, -24, 20, 28, 8); fs(ctx, '#ff5fa2', 3.5);
    blob(ctx, 0, -L - 4, 32, 40); fs(ctx, '#e6ebf5', 4.5);
    blob(ctx, 0, -L - 2, 22, 30); ctx.fillStyle = '#b8c0d6'; ctx.fill();
    blob(ctx, -9, -L - 14, 6, 12); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  };
  HM.pillow = function (ctx) {
    rrect(ctx, -7, -L + 10, 14, L - 2, 7); fs(ctx, '#b86b2a', 4);
    rrect(ctx, -56, -L - 34, 112, 68, 24); fs(ctx, '#ffd1e8', 4.5);
    ctx.setLineDash([7, 6]); ctx.strokeStyle = '#ff6fa8'; ctx.lineWidth = 3;
    rrect(ctx, -46, -L - 25, 92, 50, 16); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ff6fa8';
    [[-56, -L - 34], [56, -L - 34], [-56, -L + 34], [56, -L + 34]].forEach(function (p) { blob(ctx, p[0], p[1], 6, 6); ctx.fill(); });
    blob(ctx, -10, -L - 8, 14, 5); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  };
  HM.fish = function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-22, 14); ctx.lineTo(22, 14); ctx.closePath(); fs(ctx, '#2f8fd6', 4);
    ctx.beginPath(); ctx.ellipse(0, -60, 24, 58, 0, 0, TAU); fs(ctx, '#4fc3ff', 4.5);
    ctx.strokeStyle = 'rgba(42,29,78,0.35)'; ctx.lineWidth = 2.5;
    for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(0, -36 - k * 14, 12, 0.3, M.PI - 0.3); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(22, -62); ctx.lineTo(38, -72); ctx.lineTo(24, -48); ctx.closePath(); fs(ctx, '#2f8fd6', 3);
    blob(ctx, 0, -L - 4, 9, 6); fs(ctx, '#7a1f3d', 3);
    googly(ctx, -8, -L + 12, 9, 0.4 * M.sin(t * 6), -0.2);
    googly(ctx, 10, -L + 14, 8, 0.4 * M.sin(t * 6), -0.2);
  };
  HM.balloon = function (ctx) {
    rrect(ctx, -11, -L + 10, 22, L - 2, 11); fs(ctx, '#4fa8ff', 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; rrect(ctx, -6, -L + 20, 5, L - 30, 3); ctx.fill();
    rrect(ctx, -56, -L - 30, 112, 60, 30); ctx.fillStyle = '#ff6fa8'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ffe14f'; ctx.fillRect(-26, -L - 32, 18, 64); ctx.fillStyle = '#4fd8ff'; ctx.fillRect(8, -L - 32, 18, 64);
    ctx.restore();
    rrect(ctx, -56, -L - 30, 112, 60, 30); ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke();
    blob(ctx, -30, -L - 14, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    rrect(ctx, 52, -L - 6, 10, 12, 3); fs(ctx, '#ffffff', 3);
  };
  BG.HAMMER_ART = HM;
  // x, y: where the hammer strikes; size: 1 normal; lift 0 striking .. 1 raised; squash 0..1.
  BG.drawHammer = function (ctx, id, x, y, size, lift, squash, t) {
    var strike = -0.706, ang = strike + 0.62 * lift;
    var gx = x + 70 * size, gy = y + 82 * size;
    ctx.save();
    ctx.translate(gx, gy); ctx.rotate(ang); ctx.scale(size, size);
    if (squash > 0) { ctx.translate(0, -L); ctx.scale(1 + 0.22 * squash, 1 - 0.18 * squash); ctx.translate(0, L); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    (HM[id] || HM.squeak)(ctx, t || 0);
    ctx.restore();
  };

  /* ------------------------------------------------------------------ the view */
  BG.createView = function (canvas, ctx) {
    var v = { calm: false, world: -1, cols: 0, holes: null, bg: null, bgCtx: null, pw: 0, ph: 0, flying: [], puffs: [], bursts: [], splats: [] };
    var splatSprite = null;
    function makeBg() {
      if (!v.bg) { v.bg = document.createElement('canvas'); v.bgCtx = v.bg.getContext('2d'); }
      var pw = M.max(1, canvas.width), ph = M.max(1, canvas.height);
      v.bg.width = pw; v.bg.height = ph; v.pw = pw; v.ph = ph;
      var c = v.bgCtx, th = THEMES[v.world];
      c.setTransform(pw / W, 0, 0, ph / H, 0, 0);
      c.lineJoin = 'round'; c.lineCap = 'round';
      paintSky(c, th, v.world);
      paintGround(c, th, v.world, v.holes);
      paintHorizon(c, th, v.world);
      for (var i = 0; i < v.holes.length; i++) paintHole(c, th, v.world, v.holes[i]);
    }
    // world: 0 garden, 1 beach, 2 moon; holes from BG.layout.
    v.scene = function (world, holes) {
      if (world === v.world && holes.length === v.cols && v.pw === canvas.width && v.ph === canvas.height) return;
      v.world = world; v.holes = holes; v.cols = holes.length;
      makeBg();
    };
    v.resize = function () { if (v.holes) makeBg(); };
    function makeSplat() {
      var c = document.createElement('canvas'); c.width = 360; c.height = 300;
      var x = c.getContext('2d');
      x.translate(180, 140);
      x.fillStyle = '#fffaf0'; x.strokeStyle = '#e8d8c0'; x.lineWidth = 6;
      x.beginPath();
      for (var k = 0; k <= 24; k++) {
        var a = k / 24 * TAU, r = 96 + (k % 2 ? 26 : -6) + hash(k, 5) * 22;
        var px = M.cos(a) * r, py = M.sin(a) * r * 0.85;
        if (k) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.closePath(); x.fill(); x.stroke();
      for (var d = 0; d < 5; d++) { var dx = -70 + d * 34; rrect(x, dx - 9, 40, 18, 60 + hash(d, 8) * 50, 9); x.fill(); }
      for (var s = 0; s < 8; s++) { var sa = hash(s, 9) * TAU, sr = 135 + hash(s, 10) * 25; blob(x, M.cos(sa) * sr, M.sin(sa) * sr * 0.8, 9 + hash(s, 11) * 8, 8 + hash(s, 12) * 6); x.fill(); }
      x.fillStyle = '#ffe9c9'; blob(x, -26, -20, 44, 26); x.fill();
      x.fillStyle = '#ff3d5a'; blob(x, 20, -36, 16, 16); x.fill();
      return c;
    }
    v.splat = function (x, y) {
      if (!splatSprite) splatSprite = makeSplat();
      if (v.splats.length >= 3) v.splats.shift();
      v.splats.push({ x: x, y: y, t: 0, rot: (hash(v.splats.length, x | 0) - 0.5) * 0.8, s: 0.9 + hash(y | 0, 3) * 0.4 });
    };
    v.puff = function (x, y, n, col, spread) {
      if (v.calm) return;
      for (var i = 0; i < n; i++) {
        if (v.puffs.length >= 48) v.puffs.shift();
        var a = M.PI + (i + 0.5) / n * M.PI;
        v.puffs.push({ x: x + M.cos(a) * spread, y: y, vx: M.cos(a) * 150, vy: -60 - (i % 3) * 30, r: 7 + (i % 3) * 3, t: 0, col: col });
      }
    };
    v.fly = function (x, y, dir, kind) {
      if (v.flying.length >= 6) v.flying.shift();
      v.flying.push({ x: x, y: y, vx: dir * 380, vy: -720, rot: 0, vr: dir * 12, t: 0, kind: kind || 'helmet' });
    };
    v.burst = function (x, y, text, col, big) {
      if (v.bursts.length >= 6) v.bursts.shift();
      v.bursts.push({ x: x, y: y, text: text, col: col || '#ffe14f', t: 0, s: big ? 1.1 : 0.82, rot: (hash(x | 0, y | 0) - 0.5) * 0.4 });
    };
    v.clearFx = function () { v.flying.length = 0; v.puffs.length = 0; v.bursts.length = 0; v.splats.length = 0; };
    v.update = function (dt) {
      var i;
      for (i = v.flying.length - 1; i >= 0; i--) { var f = v.flying[i]; f.t += dt; f.vy += 1800 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; if (f.t > 1.4) v.flying.splice(i, 1); }
      for (i = v.puffs.length - 1; i >= 0; i--) { var p = v.puffs[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; if (p.t > 0.36) v.puffs.splice(i, 1); }
      for (i = v.bursts.length - 1; i >= 0; i--) { v.bursts[i].t += dt; if (v.bursts[i].t > 0.5) v.bursts.splice(i, 1); }
      for (i = v.splats.length - 1; i >= 0; i--) { v.splats[i].t += dt; if (v.splats[i].t > 2.4) v.splats.splice(i, 1); }
    };

    // How far up a critter is (0 in the hole .. 1 all the way out).
    function upness(c) {
      if (c.st === 'rise') return c.t / BG.RISE;
      if (c.st === 'down') return 1 - c.t / BG.SINK;
      if (c.st === 'duck') return 1 - c.t / BG.DUCK;
      if (c.st === 'hit') return c.t < BG.HIT - 0.24 ? 1 : M.max(0, 1 - (c.t - (BG.HIT - 0.24)) / 0.24);
      return 1;
    }
    v.critterTop = function (h) { return h.y - h.h * 0.8; };
    var co = { t: 0, px: 0, py: 0, hit: false, wind: 0, helmet: false, mood: 0, id: 0, age: 0 };
    function drawHoleCritter(h, c, t, look) {
      var p = M.max(0, M.min(1, upness(c))), e = 1 - (1 - p) * (1 - p);
      var hit = c.st === 'hit', age = c.t, size = h.h;
      var base = h.y + h.ry * 0.55 + (1 - e) * size * 1.12;
      var sx = 1, sy = 1, dx = 0, rot = 0;
      if (hit) {
        var k = M.min(1, age / 0.07);
        sx = 1 + 0.32 * k; sy = 1 - 0.46 * k;
      } else if (c.st === 'rise') { sy = 1 + 0.16 * M.sin(p * M.PI); sx = 1 - 0.08 * M.sin(p * M.PI); }
      else if (c.st === 'up' && !v.calm) {
        if (age < 0.3) { var j = M.sin(age * 34) * M.exp(-age * 9); sy = 1 - 0.12 * j; sx = 1 + 0.1 * j; }
        if (c.mood === 0) rot = M.sin(t * 9 + c.id) * 0.07;
        else if (c.mood === 2 || c.kind === 'disco') { rot = M.sin(t * 6 + c.id) * 0.13; base -= M.abs(M.sin(t * 12 + c.id)) * 5; }
        if (c.kind === 'crab') dx = M.sin(t * 8 + c.id) * 5;
        if (c.kind === 'alien') base -= M.abs(M.sin(t * 7 + c.id)) * 14;
      }
      // pupils look at the hammer and jiggle after popping up
      var lx = look ? (look.x - h.x) / 260 : 0, ly = look ? (look.y - (h.y - size * 0.6)) / 260 : 0.2;
      var jig = v.calm ? 0 : c.st === 'rise' ? 0.7 : c.st === 'up' ? M.exp(-c.t * 2.5) * 0.7 : 0;
      co.t = t; co.id = c.id; co.age = age; co.mood = c.mood; co.hit = hit; co.wind = c.wind || 0; co.helmet = c.helmet;
      co.px = M.max(-1, M.min(1, lx + M.sin(t * 17 + c.id) * jig)); co.py = M.max(-1, M.min(1, ly + M.cos(t * 13 + c.id) * jig));
      ctx.save();
      // clip: everything above the hole's middle, and inside the opening below it
      var rxi = h.rx - 2, ryi = h.ry - 2;
      ctx.beginPath();
      ctx.moveTo(h.x + rxi, h.y); ctx.lineTo(h.x + h.rx * 3, h.y); ctx.lineTo(h.x + h.rx * 3, h.y - 420); ctx.lineTo(h.x - h.rx * 3, h.y - 420); ctx.lineTo(h.x - h.rx * 3, h.y); ctx.lineTo(h.x - rxi, h.y);
      ctx.ellipse(h.x, h.y, rxi, ryi, 0, M.PI, 0, true);
      ctx.closePath(); ctx.clip();
      ctx.translate(h.x + dx, base); ctx.rotate(rot); ctx.scale(sx, sy);
      BG.drawCritter(ctx, c.kind, 0, 0, size, co);
      ctx.restore();
      if (hit && p > 0.3) dizzy(ctx, h.x, base - size * (1 - 0.46) - 6, size * 0.36, t);
      // the front edge of the hole over the critter
      ctx.beginPath(); ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, 0, M.PI);
      ctx.lineWidth = 6; ctx.strokeStyle = THEMES[v.world].lip; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    }
    function keycap(h, alpha, lit) {
      var x = h.x, y = h.y + h.ry * 1.62;
      ctx.globalAlpha = alpha;
      rrect(ctx, x - 17, y - 15, 34, 30, 8); ctx.fillStyle = lit ? '#ffe14f' : '#ffffff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = INK; ctx.font = '700 20px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
      ctx.fillText(h.key, x, y + 1);
      ctx.globalAlpha = 1;
    }
    // w: a world (or the title's demo world). o: { t, look: {x, y}, keys: 0..1 alpha, lit: hole index }
    v.render = function (w, o) {
      var t = o.t, i;
      v.scene(w.spec.world, w.holes);
      ctx.drawImage(v.bg, 0, 0, W, H);
      for (i = 0; i < w.holes.length; i++) {
        var h = w.holes[i];
        if (h.c) drawHoleCritter(h, h.c, t, o.look);
        if (o.keys > 0) keycap(h, o.keys, o.lit === i);
      }
    };
    // Effects over the field: dust and flying helmets (the comic bursts and the cream are
    // drawn on their own, over the hammer).
    v.drawFx = function () {
      var i;
      for (i = 0; i < v.puffs.length; i++) {
        var p = v.puffs[i], k = p.t / 0.36;
        ctx.globalAlpha = 0.8 * (1 - k);
        blob(ctx, p.x, p.y, p.r * (1 + k), p.r * (1 + k) * 0.8); ctx.fillStyle = p.col; ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (i = 0; i < v.flying.length; i++) {
        var f = v.flying[i];
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
        if (f.kind === 'helmet') {
          ctx.beginPath(); ctx.arc(0, 0, 40, M.PI, 0); ctx.closePath(); fs(ctx, '#ffd23f', 4);
          rrect(ctx, -50, -4, 100, 12, 6); fs(ctx, '#ffd23f', 4);
          blob(ctx, 0, -24, 8, 8); fs(ctx, '#fffbe0', 3);
        } else if (f.kind === 'feather') {
          ctx.beginPath(); ctx.ellipse(0, 0, 6, 16, 0, 0, TAU); fs(ctx, '#ffffff', 2.5);
        } else if (f.kind === 'pie') {
          blob(ctx, 0, 0, 30, 10); fs(ctx, '#e0a458', 3.5);
          ctx.beginPath(); ctx.arc(0, -4, 26, M.PI, 0); ctx.closePath(); fs(ctx, '#fffaf0', 3.5);
        }
        ctx.restore();
      }
    };
    v.drawBursts = function () {
      for (var i = 0; i < v.bursts.length; i++) {
        var b = v.bursts[i], q = b.t / 0.5, s = (v.calm ? 1 : q < 0.25 ? 0.5 + q * 2.6 : 1.15 - (q - 0.25) * 0.2) * b.s;
        ctx.globalAlpha = q > 0.7 ? M.max(0, (1 - q) / 0.3) : 1;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(s, s);
        ctx.beginPath();
        for (var k2 = 0; k2 < 24; k2++) { var a = k2 / 24 * TAU, r = k2 % 2 ? 44 : 66; ctx.lineTo(M.cos(a) * r * 1.25, M.sin(a) * r * 0.85); }
        ctx.closePath(); fs(ctx, b.col, 5);
        ctx.font = '700 40px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText(b.text, 0, 2);
        ctx.fillStyle = '#ffffff'; ctx.fillText(b.text, 0, 2);
        ctx.direction = 'ltr';
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    v.drawSplats = function () {
      for (var i = 0; i < v.splats.length; i++) {
        var sp = v.splats[i], k = sp.t, s = sp.s * (v.calm ? 1 : k < 0.12 ? 0.3 + k / 0.12 * 0.8 : k < 0.2 ? 1.1 - (k - 0.12) : 1);
        ctx.globalAlpha = k > 1.8 ? M.max(0, (2.4 - k) / 0.6) : 1;
        ctx.save(); ctx.translate(sp.x, sp.y + (k > 0.5 ? (k - 0.5) * 14 : 0)); ctx.rotate(sp.rot); ctx.scale(s * 1.3, s * 1.3);
        ctx.drawImage(splatSprite, -180, -140);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    return v;
  };
})();
