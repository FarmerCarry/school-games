/* Snake Arena — drawing: sprites, world, snakes, effects and HUD. */
(function () {
  'use strict';
  var SA = window.SA, W = SA.world;
  var CAP = W.CAP, SPACING = W.SPACING;
  var FONT = 'Fredoka, "Segoe UI", Tahoma, sans-serif';

  var R = SA.render = {
    cam: { x: 0, y: 0, zoom: 0.8, sx: 0, sy: 0 },
    ui: 1, UW: 1280, UH: 720, cssW: 1280, cssH: 720, dpr: 1
  };
  var cv, ctx;

  /* -------------------------------------------------------------- colour */
  function hexRgb(h) {
    if (h.charAt(0) !== '#') return [255, 255, 255];
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(h, amt) {
    var c = hexRgb(h), i;
    for (i = 0; i < 3; i++) c[i] = amt >= 0 ? c[i] + (255 - c[i]) * amt : c[i] * (1 + amt);
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }
  function rgba(h, a) { var c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  R.shade = shade; R.rgba = rgba;

  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* ------------------------------------------------------------- sprites */
  var ballCache = {}, glowCache = {}, foodCache = {};
  function ball(col) {
    var c = ballCache[col];
    if (c) return c;
    c = mk(64, 64); var g = c.getContext('2d');
    g.fillStyle = shade(col, -0.5);
    g.beginPath(); g.arc(32, 32, 31.5, 0, 6.2832); g.fill();
    var grd = g.createRadialGradient(24, 21, 2, 32, 32, 29);
    grd.addColorStop(0, shade(col, 0.6)); grd.addColorStop(0.38, col); grd.addColorStop(1, shade(col, -0.22));
    g.fillStyle = grd;
    g.beginPath(); g.arc(32, 32, 28.5, 0, 6.2832); g.fill();
    ballCache[col] = c;
    return c;
  }
  function glow(col) {
    var c = glowCache[col];
    if (c) return c;
    c = mk(64, 64); var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, rgba(col, 0.9)); grd.addColorStop(0.4, rgba(col, 0.35)); grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    glowCache[col] = c;
    return c;
  }
  // Glowing food dot: core radius 9 in a 48px sprite.
  function foodSpr(col) {
    var c = foodCache[col];
    if (c) return c;
    c = mk(48, 48); var g = c.getContext('2d');
    var grd = g.createRadialGradient(24, 24, 4, 24, 24, 24);
    grd.addColorStop(0, rgba(col, 0.75)); grd.addColorStop(0.45, rgba(col, 0.22)); grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd; g.fillRect(0, 0, 48, 48);
    var g2 = g.createRadialGradient(21.5, 21.5, 1, 24, 24, 9);
    g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.45, shade(col, 0.35)); g2.addColorStop(1, col);
    g.fillStyle = g2; g.beginPath(); g.arc(24, 24, 9, 0, 6.2832); g.fill();
    foodCache[col] = c;
    return c;
  }
  R.foodSpr = foodSpr; R.ball = ball;

  function skinSprites(skin) {
    if (skin._spr) return skin._spr;
    var list = skin.rainbow ? SA.RAINBOW : skin.colors;
    skin._spr = list.map(ball);
    skin._glow = list.map(glow);
    return skin._spr;
  }

  // Hexagon floor pattern.
  var pattern = null;
  function makePattern() {
    var c = mk(180, 104), g = c.getContext('2d');
    g.fillStyle = '#140f33'; g.fillRect(0, 0, 180, 104);
    function hex(cx, cy) {
      var s = 56;
      g.beginPath();
      for (var k = 0; k < 6; k++) {
        var a = k * Math.PI / 3;
        var x = cx + Math.cos(a) * s, y = cy + Math.sin(a) * s * 0.866 / 0.866 * 0.92;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      var grd = g.createLinearGradient(cx, cy - 50, cx, cy + 50);
      grd.addColorStop(0, '#231a57'); grd.addColorStop(1, '#1b1446');
      g.fillStyle = grd; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(120,100,255,0.10)'; g.stroke();
    }
    var pts = [[0, 0], [180, 0], [0, 104], [180, 104], [90, 52], [90, -52], [90, 156], [-90, 52], [270, 52]];
    for (var i = 0; i < pts.length; i++) hex(pts[i][0], pts[i][1]);
    pattern = ctx.createPattern(c, 'repeat');
    try { pattern.setTransform(new DOMMatrix().scale(0.5)); } catch (e) { /* older browsers: pattern stays 2x */ }
  }

  /* ---------------------------------------------------------------- setup */
  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    makePattern();
    R.resize();
    window.addEventListener('resize', R.resize);
  };
  R.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    R.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    R.cssW = w; R.cssH = h;
    cv.width = Math.round(w * R.dpr); cv.height = Math.round(h * R.dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    R.ui = Math.min(w / 1280, h / 720);
    R.UW = w / R.ui; R.UH = h / R.ui;
  };
  // world -> UI units
  R.toUi = function (x, y, out) {
    var c = R.cam;
    out.x = (x - c.x) * c.zoom + R.UW / 2;
    out.y = (y - c.y) * c.zoom + R.UH / 2;
    return out;
  };

  /* ------------------------------------------------------------ particles */
  var parts = [], PMAX = 700;
  var texts = [];
  R.burst = function (x, y, o) {
    var n = o.n || 12;
    for (var i = 0; i < n; i++) {
      if (parts.length >= PMAX) parts.shift();
      var a = Math.random() * 6.2832, sp = (o.speed || 200) * (0.3 + Math.random() * 0.7);
      parts.push({
        x: x + (o.jit ? (Math.random() - 0.5) * o.jit : 0), y: y + (o.jit ? (Math.random() - 0.5) * o.jit : 0),
        vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0),
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.4), max: o.life || 0.6,
        size: (o.size || 6) * (0.6 + Math.random() * 0.7),
        col: o.cols ? o.cols[(Math.random() * o.cols.length) | 0] : (o.col || '#fff'), k: 0, drag: o.drag || 2.5
      });
    }
  };
  R.ring = function (x, y, col, maxR, life) {
    if (parts.length >= PMAX) parts.shift();
    parts.push({ x: x, y: y, vx: 0, vy: 0, life: life || 0.5, max: life || 0.5, size: maxR, col: col, k: 1, drag: 0 });
  };
  R.floatText = function (x, y, txt, col, size) {
    if (texts.length > 24) texts.shift();
    texts.push({ x: x, y: y, txt: txt, col: col || '#fff', life: 1.1, max: 1.1, size: size || 26 });
  };
  R.clearFx = function () { parts.length = 0; texts.length = 0; };
  R.updateFx = function (dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      var dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = texts.length - 1; i >= 0; i--) {
      texts[i].life -= dt;
      if (texts[i].life <= 0) texts.splice(i, 1);
    }
  };

  /* ---------------------------------------------------------------- eyes */
  function star(g, x, y, r, rot) {
    g.beginPath();
    for (var k = 0; k < 10; k++) {
      var a = rot + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
      if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }
  R.star = star;

  // Draws eyes in head-local space (forward = +x). r = head radius.
  function drawEyes(g, style, r, la, blink, t, seed) {
    var er = r * 0.42, ex = r * 0.3, ey = r * 0.5;
    var lx = Math.cos(la), ly = Math.sin(la);
    g.lineCap = 'round';
    if (style === 'cyclops') {
      var cr = r * 0.62;
      g.fillStyle = '#fff'; g.strokeStyle = '#1b1030'; g.lineWidth = r * 0.1;
      g.beginPath(); g.arc(ex, 0, cr, 0, 6.2832); g.fill(); g.stroke();
      if (blink > 0) { g.beginPath(); g.moveTo(ex - cr * 0.8, 0); g.lineTo(ex + cr * 0.8, 0); g.stroke(); return; }
      g.fillStyle = '#2cc0ff'; g.beginPath(); g.arc(ex + lx * cr * 0.35, ly * cr * 0.35, cr * 0.55, 0, 6.2832); g.fill();
      g.fillStyle = '#10081e'; g.beginPath(); g.arc(ex + lx * cr * 0.4, ly * cr * 0.4, cr * 0.3, 0, 6.2832); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + lx * cr * 0.4 - cr * 0.12, ly * cr * 0.4 - cr * 0.14, cr * 0.12, 0, 6.2832); g.fill();
      return;
    }
    if (style === 'cool') {
      // sunglasses bar
      g.fillStyle = '#12101c';
      g.beginPath();
      g.moveTo(ex + er * 0.9, -ey - er * 1.05); g.lineTo(ex + er * 0.9, ey + er * 1.05);
      g.lineTo(ex - er * 0.8, ey + er * 0.9); g.lineTo(ex - er * 0.8, -ey - er * 0.9); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = r * 0.09;
      g.beginPath(); g.moveTo(ex + er * 0.45, -ey - er * 0.6); g.lineTo(ex - er * 0.1, -ey + er * 0.1); g.stroke();
      g.beginPath(); g.moveTo(ex + er * 0.45, ey - er * 0.6 + er * 0.2); g.lineTo(ex - er * 0.1, ey + er * 0.2 + er * 0.1); g.stroke();
      return;
    }
    for (var side = -1; side <= 1; side += 2) {
      var cx = ex, cy = ey * side;
      if (style === 'happy') {
        g.strokeStyle = '#1b1030'; g.lineWidth = r * 0.14;
        g.beginPath(); g.arc(cx - er * 0.35, cy, er * 0.62, -1.15, 1.15); g.stroke();
        g.fillStyle = 'rgba(255,110,160,0.55)';
        g.beginPath(); g.arc(cx - er * 0.9, cy + side * er * 0.55, er * 0.42, 0, 6.2832); g.fill();
        continue;
      }
      var rr = style === 'googly' ? er * 1.12 : er;
      g.fillStyle = '#fff'; g.strokeStyle = '#1b1030'; g.lineWidth = r * 0.08;
      g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832); g.fill(); g.stroke();
      if (blink > 0) {
        g.lineWidth = r * 0.1;
        g.beginPath(); g.moveTo(cx, cy - rr * 0.8); g.lineTo(cx, cy + rr * 0.8); g.stroke();
      } else if (style === 'star') {
        g.fillStyle = '#ffc400';
        star(g, cx + lx * rr * 0.25, cy + ly * rr * 0.25, rr * 0.75, t * 2);
      } else {
        var pr = style === 'googly' ? rr * 0.42 : rr * 0.55, po = rr - pr - rr * 0.08;
        var jx = 0, jy = 0;
        if (style === 'googly') { jx = Math.sin(t * 11 + seed + side) * 0.3; jy = Math.cos(t * 13 + seed * 2) * 0.3; }
        var px = cx + (lx + jx) * po, py = cy + (ly + jy) * po;
        g.fillStyle = '#10081e'; g.beginPath(); g.arc(px, py, pr, 0, 6.2832); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(px - pr * 0.3, py - pr * 0.35, pr * 0.32, 0, 6.2832); g.fill();
      }
      if (style === 'angry') {
        g.strokeStyle = '#1b1030'; g.lineWidth = r * 0.16;
        g.beginPath(); g.moveTo(cx + rr * 1.0, cy + side * rr * 0.95); g.lineTo(cx + rr * 0.55, cy - side * rr * 0.55); g.stroke();
      }
    }
  }

  // Head in world space (or any space). s-like params.
  function drawHead(g, x, y, ang, r, skin, eyes, look, blink, pulse, t, seed, boosting) {
    var spr = skinSprites(skin)[0];
    var hr = r * 1.1;
    g.save();
    g.translate(x, y); g.rotate(ang);
    var sx = 1 + pulse * 0.08 + (boosting ? 0.1 : 0), sy = 1 + pulse * 0.2 - (boosting ? 0.06 : 0);
    g.scale(sx, sy);
    g.drawImage(spr, -hr, -hr, hr * 2, hr * 2);
    drawEyes(g, eyes, r, angWrap(look - ang), blink, t, seed);
    g.restore();
  }
  function angWrap(a) { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; }
  R.drawHead = drawHead;

  /* -------------------------------------------------------------- snakes */
  function drawSnake(g, s, vx0, vy0, vx1, vy1, t) {
    if (s.maxx < vx0 || s.minx > vx1 || s.maxy < vy0 || s.miny > vy1) return false;
    var skin = s.skin, r = s.r, n = s.n, f = s.frac, px = s.px, py = s.py, st = s.s;
    var spr = skinSprites(skin), gl = skin._glow, ns = spr.length;
    var stride = Math.max(1, Math.round(r * 0.3 / SPACING));
    var band = SA.bandPts(skin, r);
    var alpha = skin.ghost ? 0.6 : 1;
    if (s.protect > 0) alpha *= 0.55 + 0.35 * Math.sin(t * 25);
    var m = r * 2.5;
    vx0 -= m; vy0 -= m; vx1 += m; vy1 += m;
    var taper = n * 0.78, bl = s.bulges;
    var i0 = Math.floor((n - 1) / stride) * stride, i, a, b, x, y, bx, by;

    // glow pass (boost / neon skins)
    if (s.boosting || skin.glow) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = s.boosting ? 0.45 + 0.2 * Math.sin(t * 22) : 0.28;
      var gs = stride * 3;
      for (i = Math.floor((n - 1) / gs) * gs; i >= 0; i -= gs) {
        a = st + i; if (a >= CAP) a -= CAP;
        x = px[a]; y = py[a];
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        var gr = r * 2.6;
        g.drawImage(gl[Math.floor(i / band) % ns], x - gr, y - gr, gr * 2, gr * 2);
      }
      g.globalCompositeOperation = 'source-over';
    }

    g.globalAlpha = alpha;
    for (i = i0; i >= 0; i -= stride) {
      a = st + i; if (a >= CAP) a -= CAP;
      x = px[a]; y = py[a];
      if (i === 0) { bx = s.hx; by = s.hy; } else { b = a - 1; if (b < 0) b += CAP; bx = px[b]; by = py[b]; }
      x += (bx - x) * f; y += (by - y) * f;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      var rr = r;
      if (i > taper) rr *= 1 - (i - taper) / (n - taper) * 0.5;
      for (var k = 0; k < bl.length; k++) { var q = (i - bl[k].p) / 5; if (q > -3 && q < 3) rr *= 1 + bl[k].a * Math.exp(-q * q); }
      rr *= 1.08;
      var ci = Math.floor(i / band);
      g.drawImage(spr[ci % ns], x - rr, y - rr, rr * 2, rr * 2);
      if (skin.dots && i % (band * 2) < stride && i > 0) {
        var dx = bx - x, dy = by - y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / dl * rr * 0.42, ny = dx / dl * rr * 0.42;
        g.fillStyle = skin.dots;
        g.beginPath(); g.arc(x + nx, y + ny, rr * 0.22, 0, 6.2832); g.arc(x - nx, y - ny, rr * 0.22, 0, 6.2832); g.fill();
      }
      if (skin.sparkle && i % 17 < stride) {
        var tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 0.7);
        if (tw > 0.35) {
          g.fillStyle = 'rgba(255,255,255,' + (tw * 0.9).toFixed(2) + ')';
          star(g, x + Math.sin(i) * rr * 0.35, y + Math.cos(i * 1.3) * rr * 0.35, rr * 0.3 * tw, t);
        }
      }
    }
    drawHead(g, s.hx, s.hy, s.ang, r, skin, s.eyes, s.look, s.blink, s.headPulse, t, s.idx * 1.7, s.boosting);
    g.globalAlpha = 1;
    return true;
  }
  R.drawSnake = drawSnake;

  /* ------------------------------------------------------------- icons */
  function drawPowerIcon(g, type, x, y, s) {
    g.save(); g.translate(x, y);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 0) { // magnet
      g.lineWidth = s * 0.34; g.strokeStyle = '#ff3355';
      g.beginPath(); g.arc(0, -s * 0.05, s * 0.42, Math.PI, 0, true); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.42, -s * 0.05); g.lineTo(-s * 0.42, -s * 0.45); g.moveTo(s * 0.42, -s * 0.05); g.lineTo(s * 0.42, -s * 0.45); g.stroke();
      g.strokeStyle = '#f2f2ff'; g.lineWidth = s * 0.34;
      g.beginPath(); g.moveTo(-s * 0.42, -s * 0.42); g.lineTo(-s * 0.42, -s * 0.62); g.moveTo(s * 0.42, -s * 0.42); g.lineTo(s * 0.42, -s * 0.62); g.stroke();
    } else if (type === 1) { // x2
      g.fillStyle = '#fff'; g.strokeStyle = '#8a5a00'; g.lineWidth = s * 0.14;
      g.font = '700 ' + Math.round(s * 0.95) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'ltr';
      g.strokeText('x2', 0, s * 0.04); g.fillText('x2', 0, s * 0.04);
    } else { // bolt
      g.fillStyle = '#fff5a0'; g.strokeStyle = '#0b5f8a'; g.lineWidth = s * 0.08;
      g.beginPath();
      g.moveTo(s * 0.12, -s * 0.62); g.lineTo(-s * 0.38, s * 0.08); g.lineTo(-s * 0.02, s * 0.08);
      g.lineTo(-s * 0.16, s * 0.62); g.lineTo(s * 0.38, -s * 0.1); g.lineTo(s * 0.02, -s * 0.1); g.closePath();
      g.fill(); g.stroke();
    }
    g.restore();
  }
  R.drawPowerIcon = drawPowerIcon;

  function drawCrown(g, x, y, s) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#ffd21f'; g.strokeStyle = '#8a5200'; g.lineWidth = s * 0.1; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-s * 0.6, s * 0.35); g.lineTo(-s * 0.7, -s * 0.35); g.lineTo(-s * 0.3, 0); g.lineTo(0, -s * 0.5);
    g.lineTo(s * 0.3, 0); g.lineTo(s * 0.7, -s * 0.35); g.lineTo(s * 0.6, s * 0.35); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#ff3d7f'; g.beginPath(); g.arc(0, s * 0.12, s * 0.12, 0, 6.2832); g.fill();
    g.restore();
  }
  R.drawCrown = drawCrown;

  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  R.rrect = rrect;

  function text(g, s, x, y, size, col, align, weight, rtl, stroke) {
    g.font = (weight || 700) + ' ' + Math.round(size) + 'px ' + FONT;
    g.textAlign = align || 'center';
    g.direction = rtl === false ? 'ltr' : 'rtl';
    if (stroke) { g.lineWidth = stroke; g.strokeStyle = 'rgba(10,6,30,0.85)'; g.lineJoin = 'round'; g.strokeText(s, x, y); }
    g.fillStyle = col || '#fff';
    g.fillText(s, x, y);
  }
  R.text = text;

  /* --------------------------------------------------------------- world */
  var tmp = { x: 0, y: 0 };
  R.drawWorld = function (leader) {
    var t = W.time, cam = R.cam, dpr = R.dpr, ui = R.ui;
    var z = cam.zoom * ui * dpr;
    var cx = cam.x + cam.sx, cy = cam.y + cam.sy;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(z, 0, 0, z, cv.width / 2 - cx * z, cv.height / 2 - cy * z);
    var hw = R.cssW / 2 / (cam.zoom * ui), hh = R.cssH / 2 / (cam.zoom * ui);
    var vx0 = cx - hw, vx1 = cx + hw, vy0 = cy - hh, vy1 = cy + hh;

    ctx.fillStyle = pattern; ctx.fillRect(vx0, vy0, hw * 2, hh * 2);

    // outside the arena
    var AR = W.R, dc = Math.sqrt(cx * cx + cy * cy), diag = Math.sqrt(hw * hw + hh * hh);
    if (dc + diag > AR) {
      ctx.beginPath(); ctx.rect(vx0, vy0, hw * 2, hh * 2); ctx.arc(0, 0, AR, 0, 6.2832, true);
      ctx.fillStyle = 'rgba(40,0,25,0.72)'; ctx.fill();
      var pulse = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.beginPath(); ctx.arc(0, 0, AR, 0, 6.2832);
      ctx.lineWidth = 60; ctx.strokeStyle = 'rgba(255,40,110,' + (0.10 + pulse * 0.08) + ')'; ctx.stroke();
      ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(255,60,130,0.35)'; ctx.stroke();
      ctx.lineWidth = 10; ctx.strokeStyle = '#ff4d8d'; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffd1e3'; ctx.stroke();
    }

    // food
    var F = W.food, fx = F.x, fy = F.y, fr = F.r, fal = F.alive, fb = F.born, fd = F.die, fc = F.col;
    var mx0 = vx0 - 40, mx1 = vx1 + 40, my0 = vy0 - 40, my1 = vy1 + 40;
    for (var i = 0; i < F.max; i++) {
      if (!fal[i]) continue;
      var x = fx[i], y = fy[i];
      if (x < mx0 || x > mx1 || y < my0 || y > my1) continue;
      var age = t - fb[i];
      if (age < 0) continue;
      var sc = age < 0.3 ? 1.35 * Math.sin(age / 0.3 * 2.2) + (age / 0.3) * (1 - 1.35 * Math.sin(2.2)) : 1;
      if (fd[i]) { var left = fd[i] - t; if (left < 3) sc *= Math.max(0, left / 3); }
      var rr = fr[i] * sc * (1 + 0.14 * Math.sin(t * 4 + i * 1.7)) * 2.65;
      if (rr <= 0.5) continue;
      ctx.drawImage(foodSpr(fc[i]), x - rr, y - rr, rr * 2, rr * 2);
    }

    // power-ups
    for (i = 0; i < W.powers.length; i++) {
      var pw = W.powers[i];
      if (pw.x < mx0 - 60 || pw.x > mx1 + 60 || pw.y < my0 - 60 || pw.y > my1 + 60) continue;
      var def = SA.POWERS[pw.type], bob = Math.sin(t * 3 + i) * 5, ps = 30 * Math.min(1, (t - pw.born) * 3 + 0.01);
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 6);
      ctx.drawImage(glow(def.color), pw.x - ps * 2.4, pw.y + bob - ps * 2.4, ps * 4.8, ps * 4.8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(def.color, -0.35);
      ctx.beginPath(); ctx.arc(pw.x, pw.y + bob, ps, 0, 6.2832); ctx.fill();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(pw.x, pw.y + bob - 2, ps * 0.88, 0, 6.2832); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(pw.x, pw.y + bob, ps * 1.25, t * 3, t * 3 + 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(pw.x, pw.y + bob, ps * 1.25, t * 3 + 3.14, t * 3 + 4.54); ctx.stroke();
      drawPowerIcon(ctx, pw.type, pw.x, pw.y + bob - 2, ps * 1.1);
    }

    // snakes (player last so it's always on top)
    var drawn = 0, P = W.player;
    for (i = 0; i < W.snakes.length; i++) {
      var s = W.snakes[i];
      if (!s.alive || s === P) continue;
      if (drawSnake(ctx, s, vx0, vy0, vx1, vy1, t)) drawn++;
    }
    if (P.alive && drawSnake(ctx, P, vx0, vy0, vx1, vy1, t)) drawn++;
    R.drawnSnakes = drawn;

    // magnet aura
    if (P.alive && P.pw.magnet > 0) {
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,90,130,' + (0.25 + 0.15 * Math.sin(t * 8)) + ')';
      ctx.setLineDash([12, 14]); ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.arc(P.hx, P.hy, P.r + 230, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
    }

    // particles
    for (i = 0; i < parts.length; i++) {
      var p = parts[i], lf = p.life / p.max;
      if (p.k === 1) {
        ctx.globalAlpha = lf * 0.9; ctx.lineWidth = 8 * lf + 1; ctx.strokeStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - lf * lf) + 4, 0, 6.2832); ctx.stroke();
      } else {
        ctx.globalAlpha = Math.min(1, lf * 1.5);
        var ps2 = p.size * (0.4 + lf * 0.6) * 2.65;
        ctx.drawImage(foodSpr(p.col), p.x - ps2, p.y - ps2, ps2 * 2, ps2 * 2);
      }
    }
    ctx.globalAlpha = 1;

    // ---- UI-space overlays anchored to the world
    ctx.setTransform(ui * dpr, 0, 0, ui * dpr, 0, 0);
    // names + crown
    for (i = 0; i < W.snakes.length; i++) {
      s = W.snakes[i];
      if (!s.alive) continue;
      if (s.hx < vx0 - 100 || s.hx > vx1 + 100 || s.hy < vy0 - 100 || s.hy > vy1 + 100) continue;
      R.toUi(s.hx, s.hy, tmp);
      var off = s.r * cam.zoom * 1.25 + 14;
      if (s === leader || s.skin.crown) {
        drawCrown(ctx, tmp.x, tmp.y - off - 6 + Math.sin(t * 4) * 2, 26);
        off += 24;
      }
      if (s !== P) {
        ctx.globalAlpha = 0.85;
        text(ctx, s.name, tmp.x, tmp.y - off, 15, '#fff', 'center', 700, true, 4);
        ctx.globalAlpha = 1;
      }
    }
    // floating texts
    for (i = 0; i < texts.length; i++) {
      var tx = texts[i], l2 = tx.life / tx.max;
      R.toUi(tx.x, tx.y, tmp);
      var up = (1 - l2) * 60;
      var scl = l2 > 0.85 ? 1 + (l2 - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, l2 * 2.5);
      text(ctx, tx.txt, tmp.x, tmp.y - up, tx.size * scl, tx.col, 'center', 700, true, 6);
    }
    ctx.globalAlpha = 1;
  };

  /* ----------------------------------------------------------------- HUD */
  R.drawHud = function (h) {
    var ui = R.ui, dpr = R.dpr, UW = R.UW, UH = R.UH, t = W.time, i;
    ctx.setTransform(ui * dpr, 0, 0, ui * dpr, 0, 0);
    ctx.textBaseline = 'middle';

    // --- leaderboard (top right, under the round buttons)
    var lbW = 236, lbX = UW - lbW - 12, lbY = Math.max(64, 62 / ui), rowH = 21;
    var ranked = W.ranked, rows = Math.min(10, ranked.length);
    var P = W.player, prank = h.rank, extra = P.alive && prank > 10 ? 1 : 0;
    ctx.fillStyle = 'rgba(12,8,36,0.55)';
    rrect(ctx, lbX, lbY, lbW, 34 + (rows + extra) * rowH + 8, 14); ctx.fill();
    text(ctx, 'المتصدرون', lbX + lbW / 2, lbY + 18, 18, '#ffd84d', 'center', 700);
    for (i = 0; i < rows; i++) {
      var s = ranked[i], y = lbY + 42 + i * rowH, me = s === P;
      if (me) { ctx.fillStyle = 'rgba(255,216,77,0.22)'; rrect(ctx, lbX + 4, y - rowH / 2, lbW - 8, rowH, 8); ctx.fill(); }
      var col = me ? '#ffe36b' : i === 0 ? '#ffd21f' : 'rgba(255,255,255,0.92)';
      text(ctx, '#' + (i + 1), lbX + lbW - 10, y, 14, col, 'right', 700, false);
      text(ctx, s.name, lbX + lbW - 44, y, 15, col, 'right', me ? 700 : 500, true);
      text(ctx, '' + Math.floor(s.mass), lbX + 10, y, 14, col, 'left', 700, false);
    }
    if (extra) {
      y = lbY + 42 + rows * rowH;
      ctx.fillStyle = 'rgba(255,216,77,0.22)'; rrect(ctx, lbX + 4, y - rowH / 2, lbW - 8, rowH, 8); ctx.fill();
      text(ctx, '#' + prank, lbX + lbW - 10, y, 14, '#ffe36b', 'right', 700, false);
      text(ctx, P.name, lbX + lbW - 44, y, 15, '#ffe36b', 'right', 700, true);
      text(ctx, '' + Math.floor(P.mass), lbX + 10, y, 14, '#ffe36b', 'left', 700, false);
    }

    // --- minimap (bottom right)
    var mr = 70, mcx = UW - mr - 18, mcy = UH - mr - 18, AR = W.R, k = mr / AR;
    ctx.fillStyle = 'rgba(12,8,36,0.6)';
    ctx.beginPath(); ctx.arc(mcx, mcy, mr + 4, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,77,141,0.8)';
    ctx.beginPath(); ctx.arc(mcx, mcy, mr, 0, 6.2832); ctx.stroke();
    for (i = 0; i < W.powers.length; i++) {
      var pw = W.powers[i];
      ctx.fillStyle = SA.POWERS[pw.type].color;
      ctx.beginPath(); ctx.arc(mcx + pw.x * k, mcy + pw.y * k, 2.6, 0, 6.2832); ctx.fill();
    }
    for (i = 0; i < W.snakes.length; i++) {
      s = W.snakes[i];
      if (!s.alive || s === P) continue;
      var ds = 1.6 + Math.min(4, s.r / 12);
      ctx.fillStyle = s === ranked[0] ? '#ffd21f' : 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(mcx + s.hx * k, mcy + s.hy * k, ds, 0, 6.2832); ctx.fill();
    }
    if (P.alive) {
      var pp = 4 + Math.sin(t * 8) * 1.2;
      ctx.fillStyle = '#39ff88'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mcx + P.hx * k, mcy + P.hy * k, pp, 0, 6.2832); ctx.fill(); ctx.stroke();
    }

    // --- length / rank / kills (bottom left)
    var bx = 16, by = UH - 118;
    ctx.fillStyle = 'rgba(12,8,36,0.55)'; rrect(ctx, bx, by, 236, 102, 16); ctx.fill();
    var lenPulse = 1 + h.lenPulse * 0.25;
    text(ctx, 'الطول', bx + 222, by + 26, 20, '#b9f7ff', 'right', 700);
    ctx.save(); ctx.translate(bx + 16, by + 34); ctx.scale(lenPulse, lenPulse);
    text(ctx, '' + Math.floor(P.mass), 0, 0, 38, '#ffffff', 'left', 700, false, 6);
    ctx.restore();
    text(ctx, 'المركز ' + prank + ' من ' + ranked.length, bx + 222, by + 66, 17, '#ffe36b', 'right', 700);
    text(ctx, 'أطحت بـ ' + h.kills, bx + 222, by + 88, 17, '#ff9ec4', 'right', 700);

    // --- power-up timers (bottom centre)
    var act = [];
    for (i = 0; i < 3; i++) { var d = SA.POWERS[i]; if (P.alive && P.pw[d.id] > 0) act.push(i); }
    for (i = 0; i < act.length; i++) {
      var dd = SA.POWERS[act[i]], left = P.pw[dd.id], px = UW / 2 + (i - (act.length - 1) / 2) * 72, py = UH - 52;
      ctx.fillStyle = 'rgba(12,8,36,0.6)'; ctx.beginPath(); ctx.arc(px, py, 30, 0, 6.2832); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = dd.color;
      ctx.beginPath(); ctx.arc(px, py, 27, -Math.PI / 2, -Math.PI / 2 + 6.2832 * left / dd.dur); ctx.stroke();
      if (left > 2 || Math.sin(t * 20) > 0) drawPowerIcon(ctx, act[i], px, py, 30);
    }

    // --- border warning
    if (h.warn > 0) {
      ctx.globalAlpha = h.warn * (0.7 + 0.3 * Math.sin(t * 10));
      text(ctx, 'احذر! حافة الساحة', UW / 2, UH / 2 + 150, 30, '#ff5a8f', 'center', 700, true, 7);
      ctx.globalAlpha = 1;
    }

    // --- hint
    if (h.hint) {
      ctx.globalAlpha = h.hintA;
      ctx.fillStyle = 'rgba(12,8,36,0.7)'; rrect(ctx, UW / 2 - 290, UH - 150, 580, 50, 25); ctx.fill();
      text(ctx, h.hint, UW / 2, UH - 125, 22, '#fff', 'center', 700);
      ctx.globalAlpha = 1;
    }

    // --- kill feed (top left)
    for (i = 0; i < h.feed.length; i++) {
      var fe = h.feed[i];
      ctx.globalAlpha = Math.min(1, fe.life);
      text(ctx, fe.txt, 16, 30 + i * 26, 16, fe.col, 'left', 700, true, 4);
    }
    ctx.globalAlpha = 1;

    // --- toasts (top centre)
    for (i = 0; i < h.toasts.length; i++) {
      var to = h.toasts[i], age = to.age, sc = age < 0.3 ? easeBack(age / 0.3) : 1;
      var fade = Math.min(1, (to.dur - age) / 0.4);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.save(); ctx.translate(UW / 2, 110 + i * 64); ctx.scale(sc, sc);
      text(ctx, to.txt, 0, 0, to.size || 44, to.col || '#fff', 'center', 700, true, 9);
      if (to.sub) text(ctx, to.sub, 0, (to.size || 44) * 0.72, 20, '#fff', 'center', 700, true, 5);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };
  function easeBack(x) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  /* ----------------------------------------------------- preview canvases */
  // Draws a wiggling snake into a small canvas (title card / skin picker).
  R.drawPreview = function (c, skin, eyes, t, opts) {
    opts = opts || {};
    var g = c.getContext('2d'), w = c.width, h = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    var r = opts.r || h * 0.2, n = opts.n || 40, sp = opts.sp || r * 0.42, amp = opts.amp == null ? h * 0.18 : opts.amp;
    var spr = skinSprites(skin), band = SA.bandPts(skin, 14) , ns = spr.length;
    var x0 = w - r * 1.6, y0 = h / 2, i, x, y;
    if (skin.glow) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3;
      for (i = n - 1; i >= 0; i -= 3) {
        x = x0 - i * sp; y = y0 + Math.sin(i * 0.16 - t * 5) * amp * Math.min(1, i / 8);
        g.drawImage(skin._glow[Math.floor(i / band) % ns], x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = skin.ghost ? 0.65 : 1;
    for (i = n - 1; i >= 0; i--) {
      x = x0 - i * sp; y = y0 + Math.sin(i * 0.16 - t * 5) * amp * Math.min(1, i / 8);
      var rr = r * (i > n * 0.75 ? 1 - (i - n * 0.75) / (n * 0.25) * 0.5 : 1) * 1.08;
      g.drawImage(spr[Math.floor(i / band) % ns], x - rr, y - rr, rr * 2, rr * 2);
      if (skin.dots && i % (band * 2) === 0 && i > 0) {
        g.fillStyle = skin.dots;
        g.beginPath(); g.arc(x, y - rr * 0.42, rr * 0.22, 0, 6.2832); g.arc(x, y + rr * 0.42, rr * 0.22, 0, 6.2832); g.fill();
      }
      if (skin.sparkle && i % 9 === 0) {
        var tw = 0.5 + 0.5 * Math.sin(t * 5 + i);
        g.fillStyle = 'rgba(255,255,255,' + (tw * 0.9).toFixed(2) + ')';
        star(g, x, y, rr * 0.3 * tw + 0.5, t);
      }
    }
    var ha = Math.atan2(Math.cos(-t * 5) * amp * 0.16 * 0.5, sp);
    drawHead(g, x0 + sp, y0 + Math.sin(-0.16 - t * 5) * amp * 0, ha * 0.4, r, skin, eyes, ha * 0.4 + Math.sin(t * 1.3) * 0.6, (t % 3.2) < 0.13 ? 1 : 0, 0, t, 1, false);
    if (skin.crown) drawCrown(g, x0 + sp, y0 - r * 1.7, r * 1.1);
    g.globalAlpha = 1;
  };

  // Just a head (for the eye picker).
  R.drawHeadPreview = function (c, skin, eyes, t) {
    var g = c.getContext('2d'), w = c.width, h = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    var r = w * 0.3;
    drawHead(g, w / 2, h / 2, -Math.PI / 2, r, skin, eyes, -Math.PI / 2 + Math.sin(t * 1.5) * 0.8, (t % 3.7) < 0.13 ? 1 : 0, 0, t, 2, false);
  };

  R.clear = function () {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#140f33'; ctx.fillRect(0, 0, cv.width, cv.height);
  };
})();
