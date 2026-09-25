/* Wacky Soccer — everything drawn in code. */
(function () {
  'use strict';
  var WS = window.WS = window.WS || {};
  var W = WS.W, H = WS.H, G = WS.G, GOAL_D = WS.GOAL_D, BAR_Y = WS.BAR_Y;
  var OUT = '#1d1a2e';
  var ART = WS.art = {};
  var TAU = Math.PI * 2;
  var AR_RE = /[؀-ۿ]/;

  /* ------------------------------------------------------------ helpers */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  ART.rr = rr;
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }
  ART.circle = circle;
  // text: o = {size, color, align, stroke, sw, weight, base, dir, alpha, shadow}
  ART.text = function (ctx, str, x, y, o) {
    o = o || {};
    str = String(str);
    ctx.font = (o.weight || 700) + ' ' + (o.size || 30) + 'px Fredoka';
    ctx.direction = o.dir || (AR_RE.test(str) ? 'rtl' : 'ltr');
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fillText(str, x, y + (o.size || 30) * 0.09 + (o.sw || 0) * 0.35); }
    if (o.stroke) {
      ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      ctx.lineWidth = o.sw || 6; ctx.strokeStyle = o.stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(str, x, y);
    if (o.alpha != null) ctx.globalAlpha = 1;
    ctx.direction = 'ltr';
  };
  ART.measure = function (ctx, str, size, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px Fredoka';
    ctx.direction = AR_RE.test(str) ? 'rtl' : 'ltr';
    var w = ctx.measureText(str).width; ctx.direction = 'ltr'; return w;
  };
  ART.keycap = function (ctx, label, x, y, h) {
    h = h || 34;
    ctx.font = '700 ' + Math.round(h * 0.55) + 'px Fredoka';
    var w = Math.max(h, ctx.measureText(label).width + h * 0.6);
    rr(ctx, x - w / 2, y - h / 2 + 4, w, h, 8); ctx.fillStyle = '#8f98c2'; ctx.fill();
    rr(ctx, x - w / 2, y - h / 2, w, h, 8); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
    ART.text(ctx, label, x, y + 1, { size: Math.round(h * 0.55), color: '#1d2340', dir: 'ltr' });
    return w;
  };
  ART.coin = function (ctx, x, y, r) {
    circle(ctx, x, y + r * 0.15, r); ctx.fillStyle = '#b8860b'; ctx.fill();
    circle(ctx, x, y, r); ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.strokeStyle = OUT; ctx.stroke();
    circle(ctx, x, y, r * 0.62); ctx.strokeStyle = '#e0a800'; ctx.lineWidth = r * 0.14; ctx.stroke();
    star(ctx, x, y, r * 0.42, r * 0.18, 5); ctx.fillStyle = '#fff6c9'; ctx.fill();
  };
  function star(ctx, x, y, R, r, n, rot) {
    ctx.beginPath();
    rot = rot == null ? -Math.PI / 2 : rot;
    for (var i = 0; i < n * 2; i++) {
      var a = rot + i * Math.PI / n, d = i % 2 ? r : R;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
  }
  ART.star = star;
  function poly(ctx, x, y, r, n, rot) {
    ctx.beginPath();
    for (var i = 0; i < n; i++) { var a = rot + i * TAU / n; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  ART.shade = shade;

  /* --------------------------------------------------------- background */
  var bgCache = {}, bgScale = 1;
  ART.setScale = function (s) { if (s !== bgScale) { bgScale = s; bgCache = {}; } };
  var clouds = [];
  for (var ci = 0; ci < 6; ci++) clouds.push({ x: ci * 240 + Math.random() * 100, y: 30 + Math.random() * 70, s: 0.6 + Math.random() * 0.6, v: 6 + Math.random() * 8 });
  var stars = [];
  for (var si = 0; si < 90; si++) stars.push({ x: Math.random() * W, y: Math.random() * 460, r: 0.6 + Math.random() * 1.8, p: Math.random() * 6 });
  var crowd = [];
  (function () {
    var cols = ['#ff5a5f', '#ffd23f', '#3ddc84', '#4f7cff', '#ff8fb1', '#ffffff', '#9b5de5', '#ff9f1c', '#00c2a8', '#f2f2f2'];
    var skins = ['#f2c08f', '#8d5a3b', '#c98b5e', '#f6d3b0', '#6e4630', '#e8b88f'];
    for (var row = 0; row < 5; row++) {
      var y = 212 + row * 50, n = 40;
      for (var i = 0; i < n; i++) {
        var x = 20 + i * (W - 40) / (n - 1) + (row % 2 ? 14 : 0) + (Math.random() - 0.5) * 8;
        crowd.push({ x: x, y: y, row: row, c: cols[(Math.random() * cols.length) | 0], sk: skins[(Math.random() * skins.length) | 0], ph: Math.random() * TAU, sp: 0.7 + Math.random() * 0.8, arms: Math.random() < 0.5 });
      }
    }
  })();

  function paintBg(ctx, key) {
    var space = key.indexOf('space') >= 0, ice = key.indexOf('ice') >= 0;
    // sky
    var g = ctx.createLinearGradient(0, 0, 0, 470);
    if (space) { g.addColorStop(0, '#0b0730'); g.addColorStop(1, '#3b1f73'); }
    else { g.addColorStop(0, '#39b7ff'); g.addColorStop(1, '#bfeaff'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 480);
    if (space) {
      // a big friendly planet
      circle(ctx, 1080, 90, 70); ctx.fillStyle = '#4f7cff'; ctx.fill();
      ctx.save(); circle(ctx, 1080, 90, 70); ctx.clip();
      ctx.fillStyle = '#3ddc84';
      circle(ctx, 1050, 70, 30); ctx.fill(); circle(ctx, 1110, 115, 26); ctx.fill(); circle(ctx, 1060, 140, 14); ctx.fill();
      circle(ctx, 1110, 70, 90); ctx.fillStyle = 'rgba(0,0,40,0.25)'; ctx.fill();
      ctx.restore();
    } else {
      // sun
      circle(ctx, 1150, 70, 44); ctx.fillStyle = '#fff3a0'; ctx.fill();
      circle(ctx, 1150, 70, 60); ctx.fillStyle = 'rgba(255,243,160,0.3)'; ctx.fill();
    }
    // stadium structure
    ctx.fillStyle = space ? '#2a2358' : '#3b4a8f';
    ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(W, 150); ctx.lineTo(W, 470); ctx.lineTo(0, 470); ctx.fill();
    // roof
    ctx.fillStyle = space ? '#4a3f8a' : '#e8eef9';
    ctx.beginPath(); ctx.moveTo(-10, 150); ctx.lineTo(W + 10, 150); ctx.lineTo(W + 10, 176); ctx.lineTo(-10, 176); ctx.fill();
    ctx.fillStyle = space ? '#6c5fc0' : '#ff5a5f';
    for (var i = 0; i < W; i += 80) { ctx.fillRect(i, 150, 40, 12); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 176, W, 8);
    // floodlights
    for (var L = 0; L < 2; L++) {
      var lx = L ? W - 70 : 70;
      ctx.fillStyle = '#5d6aa8'; ctx.fillRect(lx - 4, 60, 8, 92);
      rr(ctx, lx - 34, 34, 68, 34, 6); ctx.fillStyle = '#e8eef9'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      for (var k = 0; k < 4; k++) { circle(ctx, lx - 22 + k * 15, 51, 6); ctx.fillStyle = '#fff7b0'; ctx.fill(); }
    }
    // stand tiers
    for (var row = 0; row < 5; row++) {
      ctx.fillStyle = row % 2 ? (space ? '#352c6b' : '#4a5aa6') : (space ? '#3d337a' : '#5566b8');
      ctx.fillRect(0, 196 + row * 50, W, 50);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 240 + row * 50, W, 6);
    }
    // boards (fun slogans, not ads)
    var boards = [['#ff5a5f', 'هيا يا أبطال!'], ['#ffd23f', 'كرة مجنونة'], ['#3ddc84', 'اقفز واركل!'], ['#4f7cff', 'هدف هدف هدف'], ['#ff8fb1', 'مرح بلا حدود']];
    var bw = W / 5;
    for (var b = 0; b < 5; b++) {
      ctx.fillStyle = boards[b][0]; ctx.fillRect(b * bw, 448, bw, 40);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(b * bw, 448, bw, 8);
      ART.text(ctx, boards[b][1], b * bw + bw / 2, 469, { size: 22, color: b === 1 ? '#3a2a00' : '#fff', stroke: 'rgba(0,0,0,0.25)', sw: 3 });
    }
    ctx.fillStyle = OUT; ctx.fillRect(0, 486, W, 4);
    // pitch
    var pg = ctx.createLinearGradient(0, 490, 0, H);
    if (ice) { pg.addColorStop(0, '#bfefff'); pg.addColorStop(1, '#7fd6f5'); }
    else if (space) { pg.addColorStop(0, '#3fae55'); pg.addColorStop(1, '#2c8c43'); }
    else { pg.addColorStop(0, '#5fd068'); pg.addColorStop(1, '#3aa84a'); }
    ctx.fillStyle = pg; ctx.fillRect(0, 490, W, H - 490);
    // mowing stripes (perspective)
    ctx.fillStyle = ice ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
    for (var s = 0; s < 16; s += 2) {
      var x0 = s * W / 16, x1 = (s + 1) * W / 16;
      var cx = W / 2;
      ctx.beginPath();
      ctx.moveTo(cx + (x0 - cx) * 0.8, 490); ctx.lineTo(cx + (x1 - cx) * 0.8, 490);
      ctx.lineTo(cx + (x1 - cx) * 1.15, H); ctx.lineTo(cx + (x0 - cx) * 1.15, H); ctx.fill();
    }
    // lines
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 505); ctx.lineTo(W, 505); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, 505); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(W / 2, 598, 150, 52, 0, 0, TAU); ctx.stroke();
    circle(ctx, W / 2, 598, 6); ctx.fillStyle = '#fff'; ctx.fill();
    // penalty boxes
    ctx.beginPath(); ctx.moveTo(0, 525); ctx.lineTo(210, 525); ctx.lineTo(250, 700); ctx.lineTo(0, 700); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W, 525); ctx.lineTo(W - 210, 525); ctx.lineTo(W - 250, 700); ctx.lineTo(W, 700); ctx.stroke();
    if (ice) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
      for (var q = 0; q < 14; q++) {
        var qx = (q * 97) % W + 30, qy = 520 + (q * 53) % 180;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + 26, qy - 8); ctx.stroke();
      }
    }
    // ground shadow band where players stand
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, G - 2, W, 6);
    // goal nets (back parts)
    for (var gi = 0; gi < 2; gi++) drawNet(ctx, gi);
  }
  function drawNet(ctx, g) {
    ctx.save();
    if (g === 1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    // back frame
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(4, BAR_Y - 6); ctx.lineTo(GOAL_D - 4, BAR_Y); ctx.lineTo(GOAL_D - 4, G); ctx.lineTo(4, G + 14); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6;
    for (var i = -300; i < 300; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, BAR_Y - 20); ctx.lineTo(i + 260, G + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + 260, BAR_Y - 20); ctx.lineTo(i, G + 20); ctx.stroke();
    }
    ctx.restore();
    // back post
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(8, BAR_Y - 4); ctx.lineTo(8, G + 10); ctx.stroke();
    ctx.strokeStyle = '#dfe6f5'; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
  }
  ART.drawBg = function (ctx, key) {
    var c = bgCache[key];
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.ceil(W * bgScale); c.height = Math.ceil(H * bgScale);
      var cc = c.getContext('2d');
      cc.setTransform(bgScale, 0, 0, bgScale, 0, 0);
      paintBg(cc, key);
      bgCache[key] = c;
    }
    ctx.drawImage(c, 0, 0, W, H);
  };
  ART.drawSkyFx = function (ctx, t, space) {
    if (space) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i]; if (s.y > 150) continue;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
        ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (var c = 0; c < clouds.length; c++) {
      var cl = clouds[c];
      var x = ((cl.x + t * cl.v) % (W + 300)) - 150;
      var y = cl.y, k = cl.s;
      ctx.beginPath();
      ctx.arc(x, y, 22 * k, 0, TAU); ctx.arc(x + 26 * k, y - 10 * k, 28 * k, 0, TAU);
      ctx.arc(x + 56 * k, y, 22 * k, 0, TAU); ctx.fill();
      ctx.fillRect(x, y, 56 * k, 22 * k);
    }
  };
  // hype 0..1 = how excited the crowd is; flags: team colors to wave
  ART.drawCrowd = function (ctx, t, hype, cols) {
    for (var i = 0; i < crowd.length; i++) {
      var c = crowd[i];
      var jump = Math.max(0, Math.sin(t * (6 + c.sp * 4) + c.ph)) * (2 + hype * 12);
      var y = c.y - jump;
      var col = cols && (i % 3 === 0) ? cols[(i >> 2) % 2] : c.c;
      ctx.fillStyle = col;
      rr(ctx, c.x - 11, y - 4, 22, 26, 8); ctx.fill();
      if (hype > 0.4 && c.arms) {
        ctx.strokeStyle = c.sk; ctx.lineWidth = 5; ctx.lineCap = 'round';
        var wv = Math.sin(t * 12 + c.ph) * 4;
        ctx.beginPath(); ctx.moveTo(c.x - 9, y); ctx.lineTo(c.x - 15 + wv, y - 20);
        ctx.moveTo(c.x + 9, y); ctx.lineTo(c.x + 15 - wv, y - 20); ctx.stroke();
      }
      circle(ctx, c.x, y - 13, 10); ctx.fillStyle = c.sk; ctx.fill();
    }
    // waving team scarves/flags in the crowd
    if (cols) {
      for (var f = 0; f < 8; f++) {
        var fx = 80 + f * 160 + Math.sin(f * 7) * 30, fy = 220 + (f % 3) * 60;
        var wave = Math.sin(t * 5 + f) * 6 * (0.4 + hype);
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(fx, fy + 30); ctx.lineTo(fx, fy - 20 - hype * 10); ctx.stroke();
        ctx.fillStyle = cols[f % 2];
        ctx.beginPath(); ctx.moveTo(fx, fy - 20 - hype * 10);
        ctx.quadraticCurveTo(fx + 18, fy - 26 - hype * 10 + wave, fx + 36, fy - 18 - hype * 10 + wave);
        ctx.lineTo(fx + 36, fy + 2 - hype * 10 + wave); ctx.quadraticCurveTo(fx + 18, fy - 6 - hype * 10 + wave, fx, fy - hype * 10); ctx.fill();
      }
    }
  };

  /* -------------------------------------------------------------- goals */
  // front frame, drawn over the players/ball. wob = jelly wobble for bouncy goals
  ART.drawGoalFront = function (ctx, g, wob, bouncy, col) {
    ctx.save();
    if (g === 1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    var sq = wob || 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // roof net (top)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(-10, BAR_Y - 8 + sq); ctx.lineTo(GOAL_D, BAR_Y + sq); ctx.lineTo(GOAL_D, BAR_Y + 8 + sq); ctx.lineTo(-10, BAR_Y + 2 + sq); ctx.fill();
    // crossbar/roof + post
    var barCol = bouncy ? '#ff5fc8' : '#ffffff';
    ctx.strokeStyle = OUT; ctx.lineWidth = 19;
    ctx.beginPath(); ctx.moveTo(-10, BAR_Y - 8 + sq); ctx.lineTo(GOAL_D, BAR_Y + sq); ctx.lineTo(GOAL_D, G); ctx.stroke();
    ctx.strokeStyle = barCol; ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(GOAL_D + 3, BAR_Y + 6 + sq); ctx.lineTo(GOAL_D + 3, G); ctx.stroke();
    if (bouncy) {
      // spring coils on the bar
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      for (var i = 0; i < 5; i++) { var x = 6 + i * 18; ctx.beginPath(); ctx.arc(x, BAR_Y - 4 + sq + i * 1.5, 5, 0, Math.PI); ctx.stroke(); }
    }
    // corner flag in team color
    ctx.strokeStyle = OUT; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(GOAL_D, BAR_Y + sq); ctx.lineTo(GOAL_D, BAR_Y - 40 + sq); ctx.stroke();
    ctx.fillStyle = col || '#ff5a5f';
    ctx.beginPath(); ctx.moveTo(GOAL_D, BAR_Y - 40 + sq); ctx.lineTo(GOAL_D + 26, BAR_Y - 32 + sq); ctx.lineTo(GOAL_D, BAR_Y - 24 + sq); ctx.fill();
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  };

  /* ------------------------------------------------------------ players */
  function limb(ctx, pts, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
  function lerpPt(ax, ay, bx, by, t) { return [ax + (bx - ax) * t, ay + (by - ay) * t]; }

  function drawLeg(ctx, p, hip, foot, T, look, front) {
    var s = p.s, dir = p.dir;
    var dx = foot.x - hip.x, dy = foot.y - hip.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L;
    // knee bends forward
    var px = dir > 0 ? uy : -uy, py = dir > 0 ? -ux : ux;
    var bend = L * 0.17;
    var kx = hip.x + dx * 0.5 + px * bend, ky = hip.y + dy * 0.5 + py * bend;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var thick = 13 * s;
    // outline
    limb(ctx, [hip.x, hip.y, kx, ky, foot.x, foot.y], thick + 6 * s, OUT);
    limb(ctx, [hip.x, hip.y, kx, ky], thick, look.skin);
    limb(ctx, [kx, ky, foot.x, foot.y], thick * 0.88, look.skin);
    // shorts on thigh
    var sh = lerpPt(hip.x, hip.y, kx, ky, 0.5);
    limb(ctx, [hip.x, hip.y, sh[0], sh[1]], thick + 5 * s, T.shorts);
    // sock
    var sk = lerpPt(kx, ky, foot.x, foot.y, 0.35);
    limb(ctx, [sk[0], sk[1], foot.x, foot.y], thick * 0.95, T.socks);
    var sk2 = lerpPt(kx, ky, foot.x, foot.y, 0.48);
    limb(ctx, [sk[0], sk[1], sk2[0], sk2[1]], thick * 0.95, T.shirt2 === T.socks ? T.shirt : T.shirt2);
    // boot
    var sx = foot.x - kx, sy = foot.y - ky, sl = Math.sqrt(sx * sx + sy * sy) || 1;
    sx /= sl; sy /= sl;
    var tx = dir > 0 ? -sy : sy, ty = dir > 0 ? sx : -sx;
    var ang = Math.atan2(ty, tx);
    ctx.save(); ctx.translate(foot.x + tx * 4 * s + sx * 2 * s, foot.y + ty * 4 * s + sy * 2 * s); ctx.rotate(ang);
    ctx.beginPath(); ctx.ellipse(0, 0, 14 * s, 8 * s, 0, 0, TAU);
    ctx.fillStyle = T.boots; ctx.fill(); ctx.lineWidth = 3 * s; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-8 * s, (dir > 0 ? 5 : -7) * s, 14 * s, 2 * s);
    ctx.restore();
    if (front && p.kickT > 0.05 && p.kickHit === false) {
      // speed swoosh behind the kicking foot
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 5 * s;
      ctx.beginPath(); ctx.arc(hip.x, hip.y, L, Math.atan2(dy, dx) - dir * 0.9, Math.atan2(dy, dx), dir < 0); ctx.stroke();
    }
  }
  function drawArm(ctx, p, ar, T, look) {
    var sh = p.pts.sh, s = p.s;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    limb(ctx, [sh.x, sh.y, ar.ex, ar.ey, ar.hx, ar.hy], 10 * s + 5 * s, OUT);
    limb(ctx, [sh.x, sh.y, ar.ex, ar.ey, ar.hx, ar.hy], 10 * s, look.skin);
    var m = lerpPt(sh.x, sh.y, ar.ex, ar.ey, 0.55);
    limb(ctx, [sh.x, sh.y, m[0], m[1]], 13 * s, T.shirt);
    circle(ctx, ar.hx, ar.hy, 6.5 * s); ctx.fillStyle = look.skin; ctx.fill(); ctx.lineWidth = 2.5 * s; ctx.strokeStyle = OUT; ctx.stroke();
  }
  function drawTorso(ctx, p, T, look) {
    var s = p.s, hip = p.pts.hip, sh = p.pts.sh;
    var mx = (hip.x + sh.x) / 2, my = (hip.y + sh.y) / 2;
    var len = p.torso + 18 * s, w = 36 * s;
    var sq = p.squash || 0;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(p.a);
    ctx.scale(1 + sq * 0.6, 1 - sq);
    // shirt
    rr(ctx, -w / 2, -len / 2, w, len, 14 * s);
    ctx.fillStyle = T.shirt; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = T.shirt2;
    var pt = T.pattern;
    if (pt === 'vstripes') { for (var i = -2; i <= 2; i += 2) ctx.fillRect(i * w / 5 - w / 10, -len, w / 5, len * 2); }
    else if (pt === 'hband') ctx.fillRect(-w, -len * 0.18, w * 2, len * 0.22);
    else if (pt === 'hoops') { for (var j = -3; j < 3; j++) ctx.fillRect(-w, j * len / 5, w * 2, len / 10); }
    else if (pt === 'halves') ctx.fillRect(p.dir > 0 ? 0 : -w, -len, w, len * 2);
    else if (pt === 'sash') { ctx.beginPath(); ctx.moveTo(-w, -len * 0.7); ctx.lineTo(-w * 0.3, -len * 0.7); ctx.lineTo(w, len * 0.5); ctx.lineTo(w * 0.3, len * 0.5); ctx.fill(); }
    // shorts
    ctx.fillStyle = T.shorts; ctx.fillRect(-w, len / 2 - 16 * s, w * 2, 20 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(p.dir > 0 ? -w / 2 : w / 2 - 7 * s, -len, 7 * s, len * 2);
    ctx.restore();
    // number
    ART.text(ctx, look.num, p.dir * -2 * s, -len * 0.08, { size: Math.round(17 * s), color: T.pattern === 'solid' || T.shirt2 === '#fff3d6' ? OUT : '#fff', stroke: 'rgba(0,0,0,0.35)', sw: 3 * s, dir: 'ltr' });
    rr(ctx, -w / 2, -len / 2, w, len, 14 * s);
    ctx.lineWidth = 3.5 * s; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.restore();
  }
  function drawHair(ctx, p, look, R, back) {
    var hc = look.hc, dir = p.dir;
    ctx.fillStyle = hc; ctx.strokeStyle = OUT; ctx.lineWidth = 3 * p.s;
    var st = look.hair;
    if (back) {
      if (st === 'afro') { circle(ctx, -dir * R * 0.15, -R * 0.35, R * 1.12); ctx.fill(); ctx.stroke(); }
      if (st === 'pony') {
        var sw = Math.sin(p.flail * 1.3) * 0.3;
        ctx.save(); ctx.translate(-dir * R * 0.8, -R * 0.4); ctx.rotate(-dir * (0.6 + sw));
        ctx.beginPath(); ctx.ellipse(-dir * R * 0.3, R * 0.2, R * 0.55, R * 0.28, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (st === 'ears') {
        for (var e = -1; e <= 1; e += 2) {
          ctx.beginPath(); ctx.moveTo(e * R * 0.75, -R * 0.45); ctx.lineTo(e * R * 0.62, -R * 1.25); ctx.lineTo(e * R * 0.1, -R * 0.85); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      }
      return;
    }
    if (st === 'spiky') {
      ctx.beginPath(); ctx.moveTo(-R * 0.95, -R * 0.1);
      for (var i = 0; i <= 5; i++) {
        var a = Math.PI + i * Math.PI / 5;
        ctx.lineTo(Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02 + R * 0.05);
        var a2 = a + Math.PI / 10;
        if (i < 5) ctx.lineTo(Math.cos(a2) * R * 1.45, Math.sin(a2) * R * 1.45);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (st === 'bowl' || st === 'pony' || st === 'band' || st === 'ears') {
      ctx.beginPath(); ctx.arc(0, 0, R * 1.04, Math.PI * 1.02, Math.PI * 1.98);
      ctx.quadraticCurveTo(R * 0.5 * dir, -R * 0.25, -R * 0.2 * dir, -R * 0.35);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (st === 'band') {
        ctx.save(); circle(ctx, 0, 0, R); ctx.clip();
        ctx.fillStyle = look.band || '#fff'; ctx.fillRect(-R, -R * 0.62, R * 2, R * 0.26);
        ctx.restore();
        ctx.fillStyle = look.hc;
        ctx.beginPath(); ctx.moveTo(-dir * R * 0.95, -R * 0.5); ctx.lineTo(-dir * R * 1.55, -R * 0.2 + Math.sin(p.flail * 2) * 5); ctx.lineTo(-dir * R * 1.45, -R * 0.65); ctx.fill(); ctx.stroke();
      }
    } else if (st === 'curly') {
      for (var c = 0; c < 7; c++) {
        var ca = Math.PI * 1.05 + c * Math.PI * 0.9 / 6;
        circle(ctx, Math.cos(ca) * R * 0.92, Math.sin(ca) * R * 0.92, R * 0.34); ctx.fill(); ctx.stroke();
      }
    } else if (st === 'mohawk') {
      ctx.beginPath(); ctx.moveTo(-R * 0.45, -R * 0.85);
      for (var m = 0; m < 4; m++) { ctx.lineTo(-R * 0.35 + m * R * 0.28, -R * 1.5 - (m % 2) * R * 0.1); ctx.lineTo(-R * 0.25 + m * R * 0.28, -R * 0.95); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (st === 'afro') {
      // front puff already drawn behind
    } else if (st === 'crown') {
      ART.hat(ctx, 'crown', 0, 0, R, 0);
    }
  }
  function drawHead(ctx, p, T, look, hat) {
    var hd = p.pts.head, R = p.headR, dir = p.dir, s = p.s;
    ctx.save(); ctx.translate(hd.x, hd.y); ctx.rotate(p.a);
    drawHair(ctx, p, look, R, true);
    circle(ctx, 0, 0, R); ctx.fillStyle = look.skin; ctx.fill();
    ctx.lineWidth = 3.5 * s; ctx.strokeStyle = OUT; ctx.stroke();
    // ear
    circle(ctx, -dir * R * 0.3, R * 0.05, R * 0.2); ctx.fillStyle = shade(look.skin, -0.1); ctx.fill(); ctx.lineWidth = 2.5 * s; ctx.stroke();
    // cheek
    circle(ctx, dir * R * 0.45, R * 0.35, R * 0.18); ctx.fillStyle = 'rgba(255,90,120,0.35)'; ctx.fill();
    // nose
    circle(ctx, dir * R * 0.98, R * 0.08, R * 0.16); ctx.fillStyle = shade(look.skin, -0.08); ctx.fill(); ctx.lineWidth = 2.5 * s; ctx.strokeStyle = OUT; ctx.stroke();
    // mouth
    var air = !p.grounded(), mood = p.mood;
    ctx.lineWidth = 3 * s; ctx.strokeStyle = OUT;
    var mx = dir * R * 0.55, my = R * 0.5;
    if (mood > 0) {
      ctx.beginPath(); ctx.moveTo(mx - R * 0.35, my - R * 0.08); ctx.quadraticCurveTo(mx, my + R * 0.55, mx + R * 0.35, my - R * 0.08); ctx.closePath();
      ctx.fillStyle = '#7a1f2b'; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(mx - R * 0.4, my - R * 0.1, R * 0.8, R * 0.13); ctx.restore();
    } else if (mood < 0) {
      ctx.beginPath(); ctx.arc(mx, my + R * 0.25, R * 0.22, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (air || p.kickT > 0) {
      ctx.beginPath(); ctx.ellipse(mx, my, R * 0.14, R * 0.2, 0, 0, TAU); ctx.fillStyle = '#7a1f2b'; ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(mx, my - R * 0.15, R * 0.25, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
    drawHair(ctx, p, look, R, false);
    // googly eyes
    var er = R * 0.36, pr = R * 0.17;
    var e = p.eyes;
    // eye offset in head frame (undo body rotation for the "look" so pupils fall with gravity feel)
    var ca = Math.cos(-p.a), sa = Math.sin(-p.a);
    var ox = (e.ox * ca - e.oy * sa) * (er - pr - 1), oy = (e.ox * sa + e.oy * ca) * (er - pr - 1);
    var eyes = [[dir * R * 0.12, -R * 0.2], [dir * R * 0.62, -R * 0.24]];
    for (var i = 0; i < 2; i++) {
      var ex = eyes[i][0], ey = eyes[i][1], r = i ? er * 0.92 : er;
      circle(ctx, ex, ey, r); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5 * s; ctx.strokeStyle = OUT; ctx.stroke();
      if (mood > 0 && p.moodT > 0) {
        // happy ^ ^ eyes
        ctx.beginPath(); ctx.arc(ex, ey + r * 0.3, r * 0.55, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 3 * s; ctx.stroke();
      } else {
        circle(ctx, ex + ox, ey + oy, pr); ctx.fillStyle = OUT; ctx.fill();
        circle(ctx, ex + ox - pr * 0.35, ey + oy - pr * 0.35, pr * 0.35); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    if (hat && hat !== 'none') ART.hat(ctx, hat, 0, 0, R, p.flail * 6);
    ctx.restore();
  }
  // hat drawn in head frame (head centre at x,y, radius R)
  ART.hat = function (ctx, id, x, y, R, spin) {
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, R * 0.12); ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
    if (id === 'cap') {
      ctx.beginPath(); ctx.arc(0, -R * 0.35, R * 0.85, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#ff5a5f'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(R * 0.9, -R * 0.38, R * 0.55, R * 0.14, 0, 0, TAU); ctx.fillStyle = '#c93a3f'; ctx.fill(); ctx.stroke();
      circle(ctx, 0, -R * 1.2, R * 0.12); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (id === 'party') {
      ctx.beginPath(); ctx.moveTo(-R * 0.6, -R * 0.7); ctx.lineTo(R * 0.1, -R * 2.0); ctx.lineTo(R * 0.6, -R * 0.62); ctx.closePath();
      ctx.fillStyle = '#9b5de5'; ctx.fill(); ctx.save(); ctx.clip();
      ctx.fillStyle = '#ffd23f'; for (var i = 0; i < 4; i++) { circle(ctx, -R * 0.2 + i * R * 0.2, -R * 0.9 - i * R * 0.3, R * 0.12); ctx.fill(); }
      ctx.restore(); ctx.stroke();
      circle(ctx, R * 0.1, -R * 2.05, R * 0.2); ctx.fillStyle = '#ff8fb1'; ctx.fill(); ctx.stroke();
    } else if (id === 'chef') {
      ctx.fillStyle = '#fff';
      rr(ctx, -R * 0.62, -R * 1.2, R * 1.24, R * 0.55, R * 0.1); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-R * 0.4, -R * 1.45, R * 0.4, 0, TAU); ctx.arc(R * 0.05, -R * 1.65, R * 0.45, 0, TAU); ctx.arc(R * 0.45, -R * 1.42, R * 0.4, 0, TAU);
      ctx.fill(); ctx.stroke();
      rr(ctx, -R * 0.6, -R * 1.25, R * 1.2, R * 0.3, R * 0.1); ctx.fill();
    } else if (id === 'propeller') {
      ctx.beginPath(); ctx.arc(0, -R * 0.4, R * 0.82, Math.PI, 0); ctx.closePath();
      ctx.fillStyle = '#4f7cff'; ctx.fill(); ctx.save(); ctx.clip();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-R * 0.25, -R * 1.4, R * 0.5, R); ctx.fillStyle = '#ff5a5f'; ctx.fillRect(R * 0.25, -R * 1.4, R * 0.6, R);
      ctx.restore(); ctx.stroke();
      ctx.fillStyle = OUT; ctx.fillRect(-R * 0.05, -R * 1.5, R * 0.1, R * 0.3);
      var w = Math.cos(spin || 0) * R * 0.8;
      ctx.beginPath(); ctx.ellipse(0, -R * 1.5, Math.abs(w) + 1, R * 0.14, 0, 0, TAU); ctx.fillStyle = '#ff5a5f'; ctx.fill(); ctx.stroke();
    } else if (id === 'viking') {
      ctx.fillStyle = '#fff3d6';
      for (var h = -1; h <= 1; h += 2) {
        ctx.beginPath(); ctx.moveTo(h * R * 0.6, -R * 0.6); ctx.quadraticCurveTo(h * R * 1.5, -R * 0.9, h * R * 1.25, -R * 1.7); ctx.quadraticCurveTo(h * R * 1.05, -R * 1.0, h * R * 0.4, -R * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, -R * 0.3, R * 0.9, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#a7b0c2'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-R * 0.9, -R * 0.42, R * 1.8, R * 0.2); ctx.strokeRect(-R * 0.9, -R * 0.42, R * 1.8, R * 0.2);
    } else if (id === 'tophat') {
      ctx.fillStyle = '#2b2b3a';
      rr(ctx, -R * 0.55, -R * 2.0, R * 1.1, R * 1.3, R * 0.1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5a5f'; ctx.fillRect(-R * 0.55, -R * 1.0, R * 1.1, R * 0.22);
      ctx.beginPath(); ctx.ellipse(0, -R * 0.72, R * 0.95, R * 0.18, 0, 0, TAU); ctx.fillStyle = '#2b2b3a'; ctx.fill(); ctx.stroke();
    } else if (id === 'crown') {
      ctx.beginPath(); ctx.moveTo(-R * 0.7, -R * 0.65); ctx.lineTo(-R * 0.8, -R * 1.5); ctx.lineTo(-R * 0.35, -R * 1.1); ctx.lineTo(0, -R * 1.65);
      ctx.lineTo(R * 0.35, -R * 1.1); ctx.lineTo(R * 0.8, -R * 1.5); ctx.lineTo(R * 0.7, -R * 0.65); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
      circle(ctx, 0, -R * 0.9, R * 0.14); ctx.fillStyle = '#ff5a5f'; ctx.fill();
      circle(ctx, -R * 0.45, -R * 0.85, R * 0.1); ctx.fillStyle = '#4fc3f7'; ctx.fill();
      circle(ctx, R * 0.45, -R * 0.85, R * 0.1); ctx.fillStyle = '#3ddc84'; ctx.fill();
    }
    ctx.restore();
  };

  ART.drawPlayer = function (ctx, p, hat) {
    var T = p.team, look = p.look;
    var f0 = p.pts.f0, f1 = p.pts.f1, hip = p.pts.hip;
    drawLeg(ctx, p, hip, f1, T, look, false);
    drawArm(ctx, p, p.arms[1], T, look);
    drawTorso(ctx, p, T, look);
    drawLeg(ctx, p, hip, f0, T, look, true);
    drawHead(ctx, p, T, look, hat);
    drawArm(ctx, p, p.arms[0], T, look);
  };
  ART.drawShadow = function (ctx, x, h, w) {
    var k = Math.max(0.25, 1 - h / 400);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.22 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(x, G + 3, w * k, w * 0.22 * k, 0, 0, TAU); ctx.fill();
  };

  /* --------------------------------------------------------------- ball */
  ART.drawBall = function (ctx, x, y, r, ang, skin, sq, vx, vy, t) {
    ctx.save(); ctx.translate(x, y);
    if (sq > 0.01) {
      var va = Math.atan2(vy || 0, vx || 1);
      ctx.rotate(va); ctx.scale(1 + sq * 0.5, 1 - sq * 0.6); ctx.rotate(-va);
    }
    ctx.save(); ctx.rotate(ang);
    circle(ctx, 0, 0, r); ctx.save(); ctx.clip();
    ballSkin(ctx, r, skin, t || 0);
    ctx.restore();
    ctx.restore();
    // shading
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    circle(ctx, 0, 0, r); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = OUT; ctx.stroke();
    ctx.restore();
  };
  function ballSkin(ctx, r, skin, t) {
    var i;
    if (skin === 'beach') {
      var cs = ['#ff5a5f', '#fff', '#4f7cff', '#fff', '#ffd23f', '#fff'];
      for (i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 1.1, i * TAU / 6, (i + 1) * TAU / 6); ctx.fillStyle = cs[i]; ctx.fill(); }
      circle(ctx, 0, 0, r * 0.2); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (skin === 'bowling') {
      ctx.fillStyle = '#3b2a7a'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#6a4fc9'; ctx.beginPath(); ctx.ellipse(-r * 0.3, r * 0.2, r * 0.6, r * 0.25, 0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#150d33';
      circle(ctx, r * 0.1, -r * 0.35, r * 0.14); ctx.fill(); circle(ctx, r * 0.42, -r * 0.2, r * 0.14); ctx.fill(); circle(ctx, r * 0.3, r * 0.15, r * 0.16); ctx.fill();
    } else if (skin === 'stripes') {
      ctx.fillStyle = '#fff'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#ff5a5f'; ctx.fillRect(-r, -r * 0.55, r * 2, r * 0.35); ctx.fillStyle = '#4f7cff'; ctx.fillRect(-r, r * 0.2, r * 2, r * 0.35);
    } else if (skin === 'melon') {
      ctx.fillStyle = '#2f9e44'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = '#1b5e2a'; ctx.lineWidth = r * 0.22;
      for (i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.45, -r); ctx.quadraticCurveTo(i * r * 0.45 + r * 0.25, 0, i * r * 0.45, r); ctx.stroke(); }
    } else if (skin === 'smiley') {
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = OUT; circle(ctx, -r * 0.32, -r * 0.2, r * 0.13); ctx.fill(); circle(ctx, r * 0.32, -r * 0.2, r * 0.13); ctx.fill();
      ctx.lineWidth = r * 0.12; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (skin === 'donut') {
      ctx.fillStyle = '#d99a55'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#ff8fb1'; ctx.beginPath();
      for (i = 0; i <= 16; i++) { var a = i * TAU / 16, d = r * (0.78 + (i % 2) * 0.08); ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
      ctx.fill();
      circle(ctx, 0, 0, r * 0.25); ctx.fillStyle = '#b87333'; ctx.fill();
      var sc = ['#fff', '#4f7cff', '#ffd23f', '#3ddc84'];
      for (i = 0; i < 10; i++) { var sa = i * 2.4, sd = r * (0.4 + (i % 3) * 0.12); ctx.fillStyle = sc[i % 4]; ctx.save(); ctx.translate(Math.cos(sa) * sd, Math.sin(sa) * sd); ctx.rotate(sa); ctx.fillRect(-r * 0.09, -r * 0.03, r * 0.18, r * 0.06); ctx.restore(); }
    } else if (skin === 'planet') {
      ctx.fillStyle = '#4f7cff'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#3ddc84'; circle(ctx, -r * 0.35, -r * 0.3, r * 0.4); ctx.fill(); circle(ctx, r * 0.45, r * 0.35, r * 0.35); ctx.fill(); circle(ctx, -r * 0.1, r * 0.6, r * 0.2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-r, -r * 0.05, r * 2, r * 0.1);
    } else if (skin === 'fire') {
      var fg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      fg.addColorStop(0, '#fff3a0'); fg.addColorStop(0.5, '#ffb627'); fg.addColorStop(1, '#ff4b2b');
      ctx.fillStyle = fg; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = 'rgba(255,75,43,0.7)';
      for (i = 0; i < 5; i++) { var fa = i * TAU / 5 + t * 3; ctx.beginPath(); ctx.ellipse(Math.cos(fa) * r * 0.6, Math.sin(fa) * r * 0.6, r * 0.3, r * 0.15, fa, 0, TAU); ctx.fill(); }
    } else if (skin === 'rainbow') {
      var rc = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ddc84', '#4f7cff', '#9b5de5'];
      for (i = 0; i < 6; i++) { ctx.fillStyle = rc[i]; ctx.fillRect(-r, -r + i * r / 3, r * 2, r / 3 + 1); }
    } else {
      // classic
      ctx.fillStyle = '#fff'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#23233a';
      poly(ctx, 0, 0, r * 0.36, 5, -Math.PI / 2); ctx.fill();
      for (i = 0; i < 5; i++) {
        var pa = -Math.PI / 2 + i * TAU / 5 + Math.PI / 5;
        poly(ctx, Math.cos(pa) * r * 0.95, Math.sin(pa) * r * 0.95, r * 0.34, 5, pa + Math.PI);
        ctx.fill();
      }
      ctx.strokeStyle = '#23233a'; ctx.lineWidth = r * 0.07;
      for (i = 0; i < 5; i++) {
        var la = -Math.PI / 2 + i * TAU / 5;
        ctx.beginPath(); ctx.moveTo(Math.cos(la) * r * 0.36, Math.sin(la) * r * 0.36); ctx.lineTo(Math.cos(la) * r * 0.7, Math.sin(la) * r * 0.7); ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------- flags & emblems */
  var flagCache = {};
  function flagCanvas(T) {
    if (flagCache[T.id]) return flagCache[T.id];
    var c = document.createElement('canvas'); c.width = 240; c.height = 160;
    var x = c.getContext('2d');
    var f = T.flag, pt = T.pattern;
    x.fillStyle = f[0]; x.fillRect(0, 0, 240, 160);
    x.fillStyle = f[1];
    if (pt === 'hband' || pt === 'solid') { x.fillRect(0, 55, 240, 50); x.fillStyle = f[2]; x.fillRect(0, 50, 240, 8); x.fillRect(0, 102, 240, 8); }
    else if (pt === 'vstripes') { for (var i = 0; i < 6; i += 2) x.fillRect(i * 40 + 40, 0, 40, 160); }
    else if (pt === 'sash') { x.beginPath(); x.moveTo(0, 130); x.lineTo(200, 0); x.lineTo(240, 0); x.lineTo(240, 30); x.lineTo(40, 160); x.lineTo(0, 160); x.fill(); }
    else if (pt === 'halves') { x.fillRect(120, 0, 120, 160); }
    else if (pt === 'hoops') { for (var j = 0; j < 5; j += 2) x.fillRect(0, j * 32, 240, 32); }
    // emblem disc
    circle(x, 120, 80, 46); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 6; x.strokeStyle = OUT; x.stroke();
    ART.emblem(x, T.emblem, 120, 80, 40, T);
    flagCache[T.id] = c;
    return c;
  }
  // wave 0 = flat
  ART.drawFlag = function (ctx, T, x, y, w, h, t, wave) {
    var c = flagCanvas(T);
    wave = wave || 0;
    var n = wave ? 16 : 1, sw = w / n;
    for (var i = 0; i < n; i++) {
      var off = wave ? Math.sin(t * 5 + i * 0.5) * wave * (i / n) : 0;
      ctx.drawImage(c, i * 240 / n, 0, 240 / n + 0.5, 160, x + i * sw, y + off, sw + 0.8, h);
    }
    ctx.lineWidth = 4; ctx.strokeStyle = OUT;
    if (!wave) { rr(ctx, x, y, w, h, 6); ctx.stroke(); }
    else {
      ctx.beginPath();
      for (var k = 0; k <= n; k++) { var o = Math.sin(t * 5 + k * 0.5) * wave * (k / n); ctx.lineTo(x + k * sw, y + o); }
      for (var k2 = n; k2 >= 0; k2--) { var o2 = Math.sin(t * 5 + k2 * 0.5) * wave * (k2 / n); ctx.lineTo(x + k2 * sw, y + h + o2); }
      ctx.closePath(); ctx.stroke();
    }
  };
  ART.emblem = function (x, e, cx, cy, s, T) {
    x.save(); x.translate(cx, cy);
    x.lineWidth = s * 0.1; x.strokeStyle = OUT; x.lineJoin = 'round'; x.lineCap = 'round';
    var i;
    if (e === 'stack') {
      for (i = 2; i >= 0; i--) { x.beginPath(); x.ellipse(0, s * 0.35 - i * s * 0.28, s * 0.7, s * 0.2, 0, 0, TAU); x.fillStyle = '#f2b35a'; x.fill(); x.stroke(); }
      x.fillStyle = '#8b4a1c'; x.beginPath(); x.ellipse(0, -s * 0.22, s * 0.5, s * 0.12, 0, 0, TAU); x.fill();
      x.fillRect(s * 0.3, -s * 0.2, s * 0.1, s * 0.3);
      x.fillStyle = '#fff6c9'; x.fillRect(-s * 0.12, -s * 0.42, s * 0.24, s * 0.14); x.strokeRect(-s * 0.12, -s * 0.42, s * 0.24, s * 0.14);
    } else if (e === 'melon') {
      x.beginPath(); x.arc(0, -s * 0.15, s * 0.75, 0, Math.PI); x.closePath(); x.fillStyle = '#2fbf4a'; x.fill(); x.stroke();
      x.beginPath(); x.arc(0, -s * 0.15, s * 0.6, 0, Math.PI); x.closePath(); x.fillStyle = '#ff4d6d'; x.fill();
      x.fillStyle = OUT; for (i = 0; i < 5; i++) { x.beginPath(); x.ellipse(-s * 0.36 + i * s * 0.18, s * 0.05 + (i % 2) * s * 0.12, s * 0.04, s * 0.07, 0, 0, TAU); x.fill(); }
    } else if (e === 'flake') {
      x.strokeStyle = '#1f6fe0'; x.lineWidth = s * 0.14;
      for (i = 0; i < 6; i++) {
        var a = i * Math.PI / 3;
        x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * s * 0.75, Math.sin(a) * s * 0.75); x.stroke();
        x.beginPath(); x.moveTo(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45); x.lineTo(Math.cos(a + 0.5) * s * 0.62, Math.sin(a + 0.5) * s * 0.62); x.stroke();
      }
    } else if (e === 'bolt') {
      x.beginPath(); x.moveTo(s * 0.15, -s * 0.8); x.lineTo(-s * 0.45, s * 0.1); x.lineTo(-s * 0.02, s * 0.1); x.lineTo(-s * 0.2, s * 0.8); x.lineTo(s * 0.45, -s * 0.12); x.lineTo(s * 0.02, -s * 0.12); x.closePath();
      x.fillStyle = '#ffe14d'; x.fill(); x.stroke();
    } else if (e === 'spikes') {
      x.beginPath(); x.moveTo(-s * 0.8, s * 0.4);
      for (i = 0; i < 4; i++) { x.lineTo(-s * 0.6 + i * s * 0.4, -s * 0.5 + (i % 2) * s * 0.15); x.lineTo(-s * 0.4 + i * s * 0.4, s * 0.4); }
      x.closePath(); x.fillStyle = '#9b5de5'; x.fill(); x.stroke();
      x.fillStyle = '#b8f25a'; circle(x, -s * 0.2, s * 0.15, s * 0.1); x.fill(); circle(x, s * 0.25, s * 0.2, s * 0.08); x.fill();
    } else if (e === 'slice') {
      x.beginPath(); x.moveTo(-s * 0.7, -s * 0.5); x.lineTo(s * 0.7, -s * 0.5); x.lineTo(0, s * 0.8); x.closePath(); x.fillStyle = '#ffd23f'; x.fill(); x.stroke();
      x.fillStyle = '#e0a060'; x.fillRect(-s * 0.72, -s * 0.66, s * 1.44, s * 0.2); x.strokeRect(-s * 0.72, -s * 0.66, s * 1.44, s * 0.2);
      x.fillStyle = '#ff4b2b'; circle(x, -s * 0.2, -s * 0.2, s * 0.13); x.fill(); circle(x, s * 0.22, -s * 0.15, s * 0.12); x.fill(); circle(x, 0, s * 0.25, s * 0.11); x.fill();
    } else if (e === 'moon') {
      x.beginPath(); x.arc(0, 0, s * 0.7, 0, TAU); x.fillStyle = '#ffe14d'; x.fill(); x.stroke();
      x.beginPath(); x.arc(s * 0.3, -s * 0.15, s * 0.55, 0, TAU); x.fillStyle = '#fff'; x.fill();
      star(x, s * 0.45, -s * 0.1, s * 0.22, s * 0.09, 5); x.fillStyle = '#ff5fc8'; x.fill();
    } else if (e === 'acorn') {
      x.beginPath(); x.ellipse(0, s * 0.2, s * 0.45, s * 0.55, 0, 0, TAU); x.fillStyle = '#c98b3e'; x.fill(); x.stroke();
      x.beginPath(); x.ellipse(0, -s * 0.28, s * 0.62, s * 0.3, 0, 0, TAU); x.fillStyle = '#6b4226'; x.fill(); x.stroke();
      x.beginPath(); x.moveTo(0, -s * 0.55); x.lineTo(s * 0.12, -s * 0.8); x.stroke();
      x.fillStyle = '#ff8a1f'; x.fillRect(-s * 0.46, s * 0.05, s * 0.92, s * 0.12);
    } else {
      star(x, 0, 0, s * 0.8, s * 0.36, 5); x.fillStyle = '#ffd23f'; x.fill(); x.stroke();
    }
    x.restore();
  };

  /* --------------------------------------------------------- mod icons */
  ART.modIcon = function (ctx, icon, x, y, s, t) {
    t = t || 0;
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = s * 0.08; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var i;
    function arrow(ax, ay, ang, len) {
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.moveTo(len, 0); ctx.lineTo(len - s * 0.12, -s * 0.1); ctx.moveTo(len, 0); ctx.lineTo(len - s * 0.12, s * 0.1);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.08; ctx.stroke(); ctx.restore();
    }
    switch (icon) {
      case 'bigball': ART.drawBall(ctx, 0, 0, s * 0.42, t, 'classic', 0); for (i = 0; i < 4; i++) arrow(Math.cos(i * 1.57 + 0.78) * s * 0.4, Math.sin(i * 1.57 + 0.78) * s * 0.4, i * 1.57 + 0.78, s * 0.14); break;
      case 'tinyball': ART.drawBall(ctx, 0, 0, s * 0.16, t, 'classic', 0); for (i = 0; i < 4; i++) arrow(Math.cos(i * 1.57 + 0.78) * s * 0.45, Math.sin(i * 1.57 + 0.78) * s * 0.45, i * 1.57 + 0.78 + Math.PI, s * 0.2); break;
      case 'beach': ART.drawBall(ctx, 0, 0, s * 0.4, t, 'beach', 0); break;
      case 'bowling': ART.drawBall(ctx, 0, 0, s * 0.4, t, 'bowling', 0); break;
      case 'moon':
        ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0.6, Math.PI * 2 - 0.6, false); ctx.arc(s * 0.2, -s * 0.05, s * 0.3, Math.PI * 2 - 1.05, 1.05, true); ctx.closePath();
        ctx.fillStyle = '#fff3a0'; ctx.fill(); ctx.stroke(); break;
      case 'ice':
        rr(ctx, -s * 0.35, -s * 0.35, s * 0.7, s * 0.7, s * 0.12); ctx.fillStyle = '#bff0ff'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-s * 0.22, -s * 0.24, s * 0.12, s * 0.3); break;
      case 'wind':
        ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.09;
        for (i = 0; i < 3; i++) { var yy = -s * 0.25 + i * s * 0.25; ctx.beginPath(); ctx.moveTo(-s * 0.4, yy); ctx.lineTo(s * 0.15 + i * s * 0.05, yy); ctx.arc(s * 0.2 + i * s * 0.05, yy - s * 0.08, s * 0.08, Math.PI / 2, -Math.PI, true); ctx.stroke(); }
        break;
      case 'spring':
        ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.09;
        ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.35);
        for (i = 0; i < 6; i++) ctx.lineTo(i % 2 ? -s * 0.2 : s * 0.2, s * 0.35 - (i + 1) * s * 0.11);
        ctx.stroke(); ART.drawBall(ctx, 0, -s * 0.38, s * 0.14, 0, 'classic', 0); break;
      case 'tinyp': case 'giantp': case 'head': case 'legs':
        var k = icon === 'tinyp' ? 0.55 : icon === 'giantp' ? 1.05 : 0.8;
        var hr = icon === 'head' ? s * 0.28 : s * 0.13 * k;
        var ll = icon === 'legs' ? s * 0.42 : s * 0.22 * k;
        var by = s * 0.42;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.08;
        ctx.beginPath(); ctx.moveTo(-s * 0.06, by); ctx.lineTo(0, by - ll); ctx.lineTo(s * 0.06, by); ctx.moveTo(0, by - ll); ctx.lineTo(0, by - ll - s * 0.2 * k); ctx.stroke();
        circle(ctx, 0, by - ll - s * 0.2 * k - hr, hr); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = s * 0.05; ctx.strokeStyle = OUT; ctx.stroke();
        break;
      case 'two': ART.drawBall(ctx, -s * 0.18, s * 0.08, s * 0.24, t, 'classic', 0); ART.drawBall(ctx, s * 0.2, -s * 0.1, s * 0.24, -t, 'classic', 0); break;
      default: ART.drawBall(ctx, 0, 0, s * 0.35, t, 'classic', 0);
    }
    ctx.restore();
  };

  ART.trophy = function (ctx, x, y, s, col, dark, locked) {
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = s * 0.07; ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
    var c1 = locked ? '#5b6080' : col, c2 = locked ? '#40455f' : dark;
    // handles
    ctx.beginPath(); ctx.arc(-s * 0.42, -s * 0.2, s * 0.2, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(-s * 0.42, -s * 0.2, s * 0.1, Math.PI * 1.5, Math.PI * 0.5, true); ctx.closePath();
    ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.2, s * 0.2, Math.PI * 1.5, Math.PI * 0.5); ctx.arc(s * 0.42, -s * 0.2, s * 0.1, Math.PI * 0.5, Math.PI * 1.5, true); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // cup
    ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.48); ctx.lineTo(s * 0.45, -s * 0.48); ctx.quadraticCurveTo(s * 0.42, s * 0.12, 0, s * 0.18); ctx.quadraticCurveTo(-s * 0.42, s * 0.12, -s * 0.45, -s * 0.48); ctx.closePath();
    ctx.fillStyle = c1; ctx.fill(); ctx.stroke();
    ctx.fillStyle = c2; ctx.fillRect(-s * 0.08, s * 0.16, s * 0.16, s * 0.18); ctx.strokeRect(-s * 0.08, s * 0.16, s * 0.16, s * 0.18);
    rr(ctx, -s * 0.3, s * 0.32, s * 0.6, s * 0.16, s * 0.04); ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
    if (!locked) {
      star(ctx, 0, -s * 0.2, s * 0.17, s * 0.075, 5); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-s * 0.32, -s * 0.42, s * 0.08, s * 0.35);
    } else {
      ART.lock(ctx, 0, -s * 0.12, s * 0.28);
    }
    ctx.restore();
  };
  ART.lock = function (ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.lineWidth = s * 0.16; ctx.strokeStyle = OUT;
    ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.32, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#d5d9e8'; ctx.lineWidth = s * 0.08; ctx.stroke();
    rr(ctx, -s * 0.5, -s * 0.2, s, s * 0.75, s * 0.12); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = s * 0.1; ctx.strokeStyle = OUT; ctx.stroke();
    circle(ctx, 0, s * 0.12, s * 0.1); ctx.fillStyle = OUT; ctx.fill();
    ctx.restore();
  };
  ART.OUT = OUT;
})();
