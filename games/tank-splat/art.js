/* Paint Tanks — all drawing code (tanks, hats, splats, crates, maze, trophy).
   Everything is drawn with canvas paths: no images. Exposes window.TS_ART. */
(function () {
  'use strict';

  var INK = '#1b1640';

  // Tank colour palettes (index = slot).
  var PAL = [
    { id: 'green', main: '#3fd15d', dark: '#1f8f3a', light: '#a4f5b0', paint: '#35c957', name: 'الأخضر' },
    { id: 'red', main: '#ff4f63', dark: '#c02438', light: '#ffb0b8', paint: '#ff3d55', name: 'الأحمر' },
    { id: 'blue', main: '#3b8cff', dark: '#1d55c4', light: '#aecdff', paint: '#2f7dff', name: 'الأزرق' },
    { id: 'yellow', main: '#ffc61f', dark: '#c98600', light: '#ffe79a', paint: '#ffb800', name: 'الأصفر' }
  ];

  // Maze themes: floor tiles, wall colours, outside colour, floor decorations.
  var THEMES = [
    { name: 'ساحة الألعاب', f1: '#d7f5a4', f2: '#c4eb88', dot: '#b4e074', wall: '#7c62ff', wtop: '#d4c6ff', wside: '#3f2aad', bg: '#4d3cc4', bg2: '#6d5ae0', deco: 'grass' },
    { name: 'أرض الحلوى', f1: '#fff1f7', f2: '#ffe3ef', dot: '#ffcfe2', wall: '#ff5fa8', wtop: '#ff9ccb', wside: '#d63584', bg: '#e0458f', bg2: '#ec5a9e', deco: 'candy' },
    { name: 'شاطئ الرمال', f1: '#fff9df', f2: '#fcf0c4', dot: '#f2e2a4', wall: '#15b8b1', wtop: '#6fe0d9', wside: '#0c8b86', bg: '#10a4c8', bg2: '#21b4d6', deco: 'beach' },
    { name: 'مصنع الشوكولاتة', f1: '#fff5ea', f2: '#fbe8d5', dot: '#f2d6bb', wall: '#9a5a36', wtop: '#c98a5f', wside: '#6e3c20', bg: '#7a4527', bg2: '#8a5433', deco: 'choco' },
    { name: 'مختبر العلماء', f1: '#f4f7fd', f2: '#e7edf9', dot: '#d8e1f3', wall: '#4d5c8f', wtop: '#8391c4', wside: '#323e69', bg: '#2e3960', bg2: '#38446e', deco: 'lab' },
    { name: 'غروب البرتقال', f1: '#fffaf0', f2: '#fff0d8', dot: '#ffe0b3', wall: '#ff8a2b', wtop: '#ffb870', wside: '#d4600d', bg: '#e8661a', bg2: '#f27a2c', deco: 'sun' }
  ];

  var HATS = [
    { name: 'بدون', price: 0 },
    { name: 'قبعة الحفلة', price: 30 },
    { name: 'آذان القطة', price: 40 },
    { name: 'فيونكة', price: 40 },
    { name: 'زهرة', price: 50 },
    { name: 'مروحة', price: 70 },
    { name: 'هوائي', price: 80 },
    { name: 'قبعة الطاهي', price: 100 },
    { name: 'خوذة القرون', price: 120 },
    { name: 'قبعة الساحر', price: 150 },
    { name: 'التاج الذهبي', price: 0, stars: 24 }
  ];

  var SPLATS = [
    { name: 'بقعة عادية', price: 0 },
    { name: 'نجمة', price: 60 },
    { name: 'قلب', price: 60 },
    { name: 'زهرة', price: 90 },
    { name: 'قوس قزح', price: 140 }
  ];

  var POWERS = [
    { id: 'laser', name: 'ليزر التصويب!', color: '#ff3d6e' },
    { id: 'triple', name: 'طلقة ثلاثية!', color: '#ff9d00' },
    { id: 'giant', name: 'كرة عملاقة!', color: '#a64dff' },
    { id: 'speed', name: 'سرعة خارقة!', color: '#ffcc00' },
    { id: 'shield', name: 'درع الفقاعة!', color: '#27c4ff' }
  ];

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r > 0 ? r : 0, 0, Math.PI * 2); }
  function artKit() { return window.Kit && Kit.art && Kit.art.sprite ? Kit.art : null; }
  function ink() { var a = artKit(); return a ? a.pal.ink : INK; }
  function seedRand(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------ hats */
  // Hats are drawn upright (not rotated with the tank). (x, y) = top of turret.
  // Reduced motion: the flower, propeller and antenna hold their resting pose.
  function drawHat(c, id, x, y, s, t) {
    if (!id) return;
    t = Kit.motion.reduced() ? 0 : (t || 0);
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round';
    switch (id) {
      case 1: // party hat
        c.beginPath(); c.moveTo(-10, 2); c.lineTo(0, -24); c.lineTo(10, 2); c.closePath();
        c.fillStyle = '#ff5fa8'; c.fill();
        c.save(); c.clip();
        c.fillStyle = '#ffe14d';
        for (var i = -1; i < 3; i++) { c.fillRect(-12, -20 + i * 8, 24, 3.5); }
        c.restore();
        c.stroke();
        circle(c, 0, -25, 4); c.fillStyle = '#5fe0ff'; c.fill(); c.stroke();
        break;
      case 2: // cat ears
        [-1, 1].forEach(function (sd) {
          c.beginPath(); c.moveTo(sd * 3, -2); c.lineTo(sd * 12, -18); c.lineTo(sd * 15, 0); c.closePath();
          c.fillStyle = '#6b5a7e'; c.fill(); c.stroke();
          c.beginPath(); c.moveTo(sd * 6, -3); c.lineTo(sd * 11.5, -12); c.lineTo(sd * 13, -3); c.closePath();
          c.fillStyle = '#ff9cc6'; c.fill();
        });
        break;
      case 3: // bow
        c.fillStyle = '#ff4f9a';
        [-1, 1].forEach(function (sd) {
          c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(sd * 10, -20, sd * 15, -12); c.quadraticCurveTo(sd * 16, -1, 0, -6); c.closePath();
          c.fill(); c.stroke();
        });
        circle(c, 0, -6, 4.5); c.fillStyle = '#ffd0e4'; c.fill(); c.stroke();
        break;
      case 4: // flower
        c.save(); c.translate(6, -8); c.rotate(t * 0.8);
        for (var p = 0; p < 6; p++) {
          c.save(); c.rotate(p * Math.PI / 3);
          c.beginPath(); c.ellipse(0, -7, 4.5, 6.5, 0, 0, Math.PI * 2);
          c.fillStyle = p % 2 ? '#ffffff' : '#fff0f7'; c.fill(); c.stroke();
          c.restore();
        }
        circle(c, 0, 0, 4.5); c.fillStyle = '#ffcf2e'; c.fill(); c.stroke();
        c.restore();
        break;
      case 5: // propeller cap
        c.beginPath(); c.arc(0, 0, 11, Math.PI, 0); c.closePath();
        c.fillStyle = '#3b8cff'; c.fill(); c.stroke();
        c.fillStyle = '#ffe14d';
        c.beginPath(); c.arc(0, 0, 11, Math.PI, Math.PI * 1.33); c.lineTo(0, 0); c.closePath(); c.fill();
        c.beginPath(); c.arc(0, 0, 11, Math.PI * 1.66, Math.PI * 2); c.lineTo(0, 0); c.closePath(); c.fill();
        c.beginPath(); c.arc(0, 0, 11, Math.PI, 0); c.closePath(); c.stroke();
        c.beginPath(); c.moveTo(0, -11); c.lineTo(0, -16); c.stroke();
        var pw = Math.cos(t * 18) * 13;
        c.beginPath(); c.ellipse(0, -17, Math.abs(pw) + 1, 2.6, 0, 0, Math.PI * 2);
        c.fillStyle = '#ff4f63'; c.fill(); c.stroke();
        break;
      case 6: // antenna
        var wob = Math.sin(t * 5) * 3;
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(wob * 0.5, -10, wob, -20); c.stroke();
        circle(c, wob, -22, 5); c.fillStyle = '#ff4f63'; c.fill(); c.stroke();
        circle(c, wob - 1.5, -23.5, 1.6); c.fillStyle = '#fff'; c.fill();
        break;
      case 7: // chef hat
        rr(c, -8, -8, 16, 9, 2); c.fillStyle = '#ffffff'; c.fill(); c.stroke();
        c.beginPath();
        c.arc(-6, -13, 6, 0, Math.PI * 2); c.arc(6, -13, 6, 0, Math.PI * 2); c.arc(0, -18, 7, 0, Math.PI * 2);
        c.fillStyle = '#ffffff'; c.fill();
        c.beginPath(); c.arc(-6, -13, 6, Math.PI * 0.5, Math.PI * 1.6); c.stroke();
        c.beginPath(); c.arc(6, -13, 6, -Math.PI * 0.6, Math.PI * 0.5); c.stroke();
        c.beginPath(); c.arc(0, -18, 7, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
        break;
      case 8: // horned helmet (cartoon)
        [-1, 1].forEach(function (sd) {
          c.beginPath(); c.moveTo(sd * 8, -5); c.quadraticCurveTo(sd * 20, -6, sd * 17, -20); c.quadraticCurveTo(sd * 14, -10, sd * 5, -10); c.closePath();
          c.fillStyle = '#fff8e0'; c.fill(); c.stroke();
        });
        c.beginPath(); c.arc(0, 0, 11, Math.PI, 0); c.closePath();
        c.fillStyle = '#c3c9dc'; c.fill(); c.stroke();
        c.fillStyle = '#e8ecf7'; c.fillRect(-6, -8, 4, 5);
        c.beginPath(); c.moveTo(-11, 0); c.lineTo(11, 0); c.lineWidth = 4; c.strokeStyle = '#ffcc33'; c.stroke();
        break;
      case 9: // wizard hat
        c.beginPath(); c.moveTo(-13, 0); c.quadraticCurveTo(0, 4, 13, 0); c.lineTo(3, -6); c.quadraticCurveTo(4, -22, 12, -28); c.quadraticCurveTo(-4, -26, -4, -6); c.closePath();
        c.fillStyle = '#6a3cff'; c.fill(); c.stroke();
        c.fillStyle = '#ffe14d';
        star(c, 1, -12, 3.6, 1.6); c.fill();
        star(c, -6, -3, 2.4, 1.1); c.fill();
        break;
      case 10: // crown
        c.beginPath(); c.moveTo(-12, 0); c.lineTo(-13, -14); c.lineTo(-6, -7); c.lineTo(0, -18); c.lineTo(6, -7); c.lineTo(13, -14); c.lineTo(12, 0); c.closePath();
        c.fillStyle = '#ffcc1f'; c.fill(); c.stroke();
        c.fillStyle = '#fff3a8'; c.fillRect(-9, -5, 4, 3);
        circle(c, 0, -3, 2.6); c.fillStyle = '#ff3d6e'; c.fill();
        circle(c, -13, -15, 2.2); c.fillStyle = '#5fe0ff'; c.fill();
        circle(c, 13, -15, 2.2); c.fill();
        circle(c, 0, -19, 2.4); c.fillStyle = '#5fe0ff'; c.fill();
        break;
    }
    c.restore();
  }

  function star(c, x, y, R, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
  function heart(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
    c.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    c.closePath();
  }

  /* ------------------------------------------------------------ tanks */
  // Cached body per colour (no barrel, so recoil can slide). Tread stripes scroll on top.
  function paintBody(c, pal) {
    var col = ink();
    c.lineWidth = 3; c.strokeStyle = col; c.lineJoin = 'round';
    for (var sd = -1; sd <= 1; sd += 2) {
      rr(c, -22, sd * 16 - 7, 44, 14, 7);
      c.fillStyle = '#3a3354'; c.fill(); c.stroke();
      rr(c, -18, sd * 16 - 4, 36, 8, 4); c.fillStyle = '#5c5478'; c.fill();
    }
    rr(c, -18, -13, 36, 26, 9);
    c.fillStyle = pal.main; c.fill(); c.stroke();
    c.fillStyle = pal.light; c.globalAlpha = 0.8;
    rr(c, -13, -10, 18, 6, 3); c.fill(); c.globalAlpha = 1;
    c.fillStyle = pal.dark; c.globalAlpha = 0.45;
    rr(c, -13, 6, 26, 4, 2); c.fill(); c.globalAlpha = 1;
    circle(c, -2, 0, 13);
    c.fillStyle = pal.main; c.fill(); c.stroke();
    circle(c, -6, -4.5, 4.4); c.fillStyle = pal.light; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
    for (var e = -1; e <= 1; e += 2) {
      c.save(); c.translate(3, e * 5.4);
      c.beginPath(); c.ellipse(0, 0, 5, 5.4, 0, 0, Math.PI * 2);
      c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2; c.stroke();
      circle(c, 1.8, 0.2, 2.5); c.fillStyle = col; c.fill();
      circle(c, 2.5, -1, 0.9); c.fillStyle = '#fff'; c.fill();
      c.restore();
    }
  }
  function paintBarrel(c, pal) {
    var col = ink();
    c.lineWidth = 3; c.strokeStyle = col; c.lineJoin = 'round';
    rr(c, -14, -5, 22, 10, 4); c.fillStyle = '#f7f4ff'; c.fill(); c.stroke();
    rr(c, 2, -7, 10, 14, 4); c.fillStyle = pal.paint; c.fill(); c.stroke();
    c.fillStyle = pal.light; c.fillRect(-8, -3, 10, 2.4);
  }
  function tankSprite(pal) {
    var a = artKit(); if (!a) return null;
    return a.sprite('ts-body:' + pal.id, 72, 58, function (c, w, h) {
      c.save(); c.translate(w / 2, h / 2); paintBody(c, pal); c.restore();
    });
  }
  function barrelSprite(pal) {
    var a = artKit(); if (!a) return null;
    return a.sprite('ts-barrel:' + pal.id, 34, 22, function (c, w, h) {
      c.save(); c.translate(w / 2, h / 2); paintBarrel(c, pal); c.restore();
    });
  }
  function treadSprite() {
    var a = artKit(); if (!a) return null;
    return a.sprite('ts-tread', 56, 8, function (c, w, h) {
      c.fillStyle = '#9a93b4';
      for (var x = -7; x < w + 7; x += 7) c.fillRect(x, 0, 3.2, h);
    });
  }
  function hatSprite(id) {
    var a = artKit(); if (!a) return null;
    return a.sprite('ts-hat:' + id, 40, 40, function (c, w, h) { drawHat(c, id, w / 2, h - 2, 1, 0); });
  }
  // One cached splat shape per colour, style and 3 variants. Stamped into the decal layer.
  function splatSprite(color, style, variant) {
    var a = artKit(); if (!a) return null;
    variant = ((variant % 3) + 3) % 3;
    style = style || 0;
    return a.sprite('ts-splat:' + color + ':' + style + ':' + variant, 96, 96, function (c) {
      drawSplat(c, 48, 48, 34, color, style, seedRand(variant * 97 + style * 13 + (color.charCodeAt(1) || 1)));
    });
  }

  // o: { x, y, a, pal, hat, sq, recoil, tread, t, blink, dead, paint, blobs, shield, flash, muzzle, scale }
  function drawTank(c, o) {
    var pal = o.pal;
    var sc = o.scale == null ? 1 : o.scale;
    if (sc <= 0.01 || !pal) return;
    if (sc >= 0.95 && sc <= 1.35) sc *= 1.2;
    var a = artKit(), dead = o.dead || 0;
    if (a) a.shadow(c, o.x - 28 * sc, o.y - 6 * sc, 56 * sc, 32 * sc, dead > 0 ? 0.28 : 0.5);
    if (dead > 0.02) { drawDeadTank(c, o, sc, dead); return; }
    var body = tankSprite(pal), barrel = barrelSprite(pal), strip = treadSprite();
    var sq = o.sq || 0, recoil = Math.min(1, o.recoil || 0);
    var sx = 1 - sq * 0.16, sy = 1 + sq * 0.14;
    c.save();
    c.translate(o.x, o.y); c.rotate(o.a || 0); c.scale(sc * sx, sc * sy);
    if (body && body.canvas && a) a.blit(c, body, 0, 0);
    else { paintBody(c, pal); }
    if (strip && strip.canvas) {
      var ph = ((o.tread || 0) % 7 + 7) % 7;
      for (var sd = -1; sd <= 1; sd += 2) {
        c.save(); rr(c, -18, sd * 16 - 4, 36, 8, 4); c.clip();
        c.drawImage(strip.canvas, -28 + ph, sd * 16 - 4, 56, 8);
        c.restore();
      }
    }
    if (barrel && barrel.canvas && a) a.blit(c, barrel, 16 - recoil * 8, 0);
    else { c.save(); c.translate(16 - recoil * 8, 0); paintBarrel(c, pal); c.restore(); }
    if (o.blink) {
      c.fillStyle = pal.main;
      for (var e2 = -1; e2 <= 1; e2 += 2) { rr(c, -1, e2 * 5.4 - 4.2, 10, 8.4, 3); c.fill(); }
    }
    if (o.flash > 0) {
      c.globalAlpha = Math.min(0.85, o.flash);
      rr(c, -24, -22, 50, 44, 12); c.fillStyle = '#fff'; c.fill();
      c.globalAlpha = 1;
    }
    c.restore();
    if (o.muzzle > 0 && a) {
      var reach = (30 - recoil * 6) * sc, gx = o.x + Math.cos(o.a || 0) * reach, gy = o.y + Math.sin(o.a || 0) * reach;
      var glow = a.glow(pal.paint, a.quality.tier === 0 ? 16 : 26);
      a.blit(c, glow, gx, gy, { alpha: Math.min(0.8, o.muzzle), sx: 0.55, sy: 0.55 });
    }
    if (o.hat) {
      var hx = o.x - 2 * Math.cos(o.a || 0) * sc, hy = o.y - 2 * Math.sin(o.a || 0) * sc - 8 * sc;
      var live = o.hat === 4 || o.hat === 5 || o.hat === 6;
      if (live || !a) drawHat(c, o.hat, hx, hy, 0.92 * sc, o.t);
      else {
        var hs = hatSprite(o.hat), s = 0.92 * sc;
        if (hs && hs.canvas) a.blit(c, hs, hx, hy - 14 * s, { sx: s, sy: s });
      }
    }
    if (o.shield > 0) {
      var pulse = Kit.motion.reduced() ? 1 : 1 + Math.sin((o.t || 0) * 8) * 0.04;
      var fade = o.shield < 2 ? (Math.sin((o.t || 0) * 14) > 0 ? 1 : 0.4) : 1;
      c.save(); c.globalAlpha = fade;
      circle(c, o.x, o.y, 30 * pulse * sc);
      c.fillStyle = 'rgba(120,220,255,0.22)'; c.fill();
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.stroke();
      c.beginPath(); c.arc(o.x, o.y, 24 * pulse * sc, -2.6, -1.7); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
      c.restore();
    }
  }
  function drawDeadTank(c, o, sc, dead) {
    var pop = dead < 0.28 ? 1 + dead * 1.35 : 1.38 * (1 - (dead - 0.28) / 0.72);
    if (pop < 0.04) return;
    var s = sc * pop, a = artKit();
    var sp = splatSprite(o.paint || '#fff', 0, 2);
    c.save(); c.globalAlpha = Math.min(1, 0.35 + dead);
    if (sp && sp.canvas && a) a.blit(c, sp, o.x, o.y, { sx: s * 0.85, sy: s * 0.75 });
    c.restore();
    if (o.blobs) {
      c.save(); c.translate(o.x, o.y); c.rotate(o.a || 0); c.scale(s, s);
      c.globalAlpha = Math.min(1, dead * 1.5); c.fillStyle = o.paint || '#fff';
      for (var b = 0; b < o.blobs.length; b += 3) { circle(c, o.blobs[b], o.blobs[b + 1], o.blobs[b + 2]); c.fill(); }
      c.restore();
    }
    if (dead > 0.3) {
      c.save(); c.translate(o.x, o.y); c.rotate(o.a || 0); c.scale(sc, sc);
      c.strokeStyle = ink(); c.lineWidth = 2;
      for (var e = -1; e <= 1; e += 2) {
        c.save(); c.translate(2, e * 5); c.rotate(Kit.motion.reduced() ? 0 : (o.t || 0) * 4 * e);
        c.beginPath();
        for (var q = 0; q < 12; q++) { var aa = q * 0.75, rad = q * 0.32; c.lineTo(Math.cos(aa) * rad, Math.sin(aa) * rad); }
        c.stroke(); c.restore();
      }
      c.restore();
    }
  }

  /* ------------------------------------------------------------ paint splats */
  function splatBlob(c, x, y, s, color, rnd) {
    c.fillStyle = color;
    circle(c, x, y, s * 0.62); c.fill();
    var n = 9;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      var d = s * (0.45 + rnd() * 0.3);
      circle(c, x + Math.cos(a) * d, y + Math.sin(a) * d, s * (0.2 + rnd() * 0.18)); c.fill();
      if (rnd() < 0.6) {
        var d2 = s * (0.95 + rnd() * 0.55);
        circle(c, x + Math.cos(a) * d2, y + Math.sin(a) * d2, s * (0.06 + rnd() * 0.08)); c.fill();
      }
    }
  }

  // Paint splat decal. style: 0 blob, 1 star, 2 heart, 3 flower, 4 rainbow.
  function drawSplat(c, x, y, s, color, style, rnd) {
    rnd = rnd || Math.random;
    c.save();
    c.globalAlpha = 0.92;
    switch (style) {
      case 1:
        c.fillStyle = color;
        c.save(); c.translate(x, y); c.rotate(rnd() * 6.28);
        star(c, 0, 0, s * 1.05, s * 0.5); c.fill();
        c.restore();
        splatDrops(c, x, y, s, color, rnd);
        break;
      case 2:
        c.fillStyle = color;
        heart(c, x, y, s * 0.85); c.fill();
        splatDrops(c, x, y, s, color, rnd);
        break;
      case 3:
        c.fillStyle = color;
        var r0 = rnd() * 6;
        for (var i = 0; i < 6; i++) {
          var a = r0 + i * Math.PI / 3;
          c.beginPath(); c.ellipse(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.42, s * 0.27, a, 0, Math.PI * 2); c.fill();
        }
        circle(c, x, y, s * 0.35); c.fillStyle = '#fff3a8'; c.fill();
        splatDrops(c, x, y, s, color, rnd);
        break;
      case 4:
        var cols = ['#ff4f63', '#ff9d00', '#ffd21f', '#3fd15d', '#3b8cff', '#a64dff'];
        for (var j = 0; j < cols.length; j++) {
          circle(c, x, y, s * (0.95 - j * 0.15)); c.fillStyle = cols[j]; c.fill();
        }
        splatDrops(c, x, y, s, color, rnd);
        break;
      default:
        splatBlob(c, x, y, s, color, rnd);
    }
    c.restore();
  }
  function splatDrops(c, x, y, s, color, rnd) {
    c.fillStyle = color;
    for (var i = 0; i < 7; i++) {
      var a = rnd() * 6.28, d = s * (1.0 + rnd() * 0.6);
      circle(c, x + Math.cos(a) * d, y + Math.sin(a) * d, s * (0.06 + rnd() * 0.08)); c.fill();
    }
  }

  /* ------------------------------------------------------------ paint ball */
  function drawBall(c, x, y, r, color, sq, ang) {
    c.save();
    c.translate(x, y);
    c.rotate(ang || 0);
    c.scale(1 + (sq || 0) * 0.35, 1 - (sq || 0) * 0.3);
    circle(c, 0, 0, r);
    c.fillStyle = color; c.fill();
    c.lineWidth = Math.max(1.8, r * 0.3); c.strokeStyle = INK; c.stroke();
    c.restore();
    circle(c, x - r * 0.35, y - r * 0.38, r * 0.32); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
  }

  /* ------------------------------------------------------------ crates */
  function drawPowerIcon(c, id, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 2; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round';
    switch (id) {
      case 'laser':
        c.strokeStyle = '#ff3d6e'; c.lineWidth = 3; c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(-9, 7); c.lineTo(0, -6); c.lineTo(9, 7); c.stroke();
        c.setLineDash([]);
        circle(c, -9, 7, 3); c.fillStyle = '#ff3d6e'; c.fill();
        c.fillStyle = '#ff3d6e';
        c.beginPath(); c.moveTo(9, 7); c.lineTo(3, 5); c.lineTo(8, 1); c.closePath(); c.fill();
        break;
      case 'triple':
        [-0.55, 0, 0.55].forEach(function (a) {
          var bx = Math.sin(a) * 8, by = -Math.cos(a) * 8 + 4;
          circle(c, bx, by, 4); c.fillStyle = '#ff9d00'; c.fill(); c.stroke();
        });
        circle(c, 0, 9, 3); c.fillStyle = INK; c.fill();
        break;
      case 'giant':
        circle(c, 0, 0, 9.5); c.fillStyle = '#a64dff'; c.fill(); c.stroke();
        circle(c, -3.5, -3.5, 3); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
        break;
      case 'speed':
        c.beginPath(); c.moveTo(2, -11); c.lineTo(-7, 2); c.lineTo(-1, 2); c.lineTo(-3, 11); c.lineTo(7, -3); c.lineTo(1, -3); c.closePath();
        c.fillStyle = '#ffcc00'; c.fill(); c.stroke();
        break;
      case 'shield':
        circle(c, 0, 0, 10); c.fillStyle = 'rgba(120,220,255,0.6)'; c.fill(); c.strokeStyle = '#1b9fd6'; c.lineWidth = 2.4; c.stroke();
        c.beginPath(); c.arc(0, 0, 6.5, -2.6, -1.6); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke();
        break;
    }
    c.restore();
  }

  function drawCrate(c, x, y, pw, t, pop) {
    var bob = Math.sin(t * 4) * 2.5;
    var s = pop;
    c.save();
    c.fillStyle = 'rgba(42,34,64,0.2)';
    c.beginPath(); c.ellipse(x + 2, y + 16, 15 * s, 6 * s, 0, 0, Math.PI * 2); c.fill();
    c.translate(x, y + bob - 3);
    c.scale(s * (1 + Math.sin(t * 8) * 0.03), s * (1 - Math.sin(t * 8) * 0.03));
    c.rotate(Math.sin(t * 2.2) * 0.08);
    rr(c, -17, -17, 34, 34, 9);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
    rr(c, -13, -13, 26, 26, 6);
    c.lineWidth = 3; c.strokeStyle = pw.color; c.stroke();
    c.restore();
    drawPowerIcon(c, pw.id, x, y + bob - 3, 0.95 * s, t);
    // sparkle
    var sp = (t * 1.3) % 2;
    if (sp < 0.5) {
      c.save(); c.globalAlpha = 1 - sp * 2; c.fillStyle = '#fff';
      star(c, x + 14, y - 16 + bob, 5 * s, 1.8 * s); c.fill(); c.restore();
    }
  }

  /* ------------------------------------------------------------ maze */
  // One faint themed floor decoration at (x, y). No dark outlines and nothing
  // shaped like a paint ball, so the balls stay the easiest thing to see.
  var SPRINKLES = ['#ff4f9a', '#3fb8ff', '#ffc61f', '#5fd36a', '#a66bff'];
  function drawDeco(c, kind, x, y, rnd) {
    var v = rnd(), a = rnd() * Math.PI * 2, i, ra;
    c.save(); c.translate(x, y);
    if (kind === 'grass') {
      if (v < 0.6) { // grass tuft
        c.strokeStyle = '#4fae3c'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-5, 5); c.quadraticCurveTo(-5, -1, -9, -6); c.moveTo(0, 5); c.lineTo(0, -8);
        c.moveTo(5, 5); c.quadraticCurveTo(5, -1, 9, -6); c.stroke();
      } else { // little flower
        c.rotate(a); c.fillStyle = '#ff6fae';
        for (i = 0; i < 5; i++) { circle(c, Math.cos(i * 1.2566) * 5, Math.sin(i * 1.2566) * 5, 3.6); c.fill(); }
        circle(c, 0, 0, 2.8); c.fillStyle = '#ffb000'; c.fill();
      }
    } else if (kind === 'candy') { // sprinkles
      c.lineWidth = 4;
      for (i = 0; i < 3; i++) {
        var sx = (rnd() - 0.5) * 24, sy = (rnd() - 0.5) * 24, dx = Math.cos(a + i * 2) * 4.5, dy = Math.sin(a + i * 2) * 4.5;
        c.strokeStyle = SPRINKLES[(rnd() * SPRINKLES.length) | 0];
        c.beginPath(); c.moveTo(sx - dx, sy - dy); c.lineTo(sx + dx, sy + dy); c.stroke();
      }
    } else if (kind === 'beach') {
      if (v < 0.35) { // starfish
        c.rotate(a); c.fillStyle = c.strokeStyle = '#ff7043'; c.lineWidth = 3;
        star(c, 0, 0, 11, 4.5); c.fill(); c.stroke();
      } else if (v < 0.7) { // shell
        c.rotate(a * 0.2 - 0.6); c.fillStyle = '#f08a4b';
        c.beginPath(); c.moveTo(0, 6); c.arc(0, 6, 12, Math.PI * 1.12, Math.PI * 1.88); c.closePath(); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath();
        for (i = 1; i < 5; i++) { ra = Math.PI * (1.12 + i * 0.152); c.moveTo(0, 6); c.lineTo(Math.cos(ra) * 11, 6 + Math.sin(ra) * 11); }
        c.stroke();
      } else { // ripples
        c.strokeStyle = '#1aa9bd'; c.lineWidth = 2.5; c.beginPath();
        c.moveTo(-13, -3); c.quadraticCurveTo(-6.5, -9, 0, -3); c.quadraticCurveTo(6.5, 3, 13, -3);
        c.moveTo(-8, 5); c.quadraticCurveTo(-2, -1, 4, 5); c.quadraticCurveTo(8, 9, 11, 5); c.stroke();
      }
    } else if (kind === 'choco') { // cocoa bean
      c.rotate(a); c.fillStyle = '#8a4a26';
      c.beginPath(); c.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff5ea'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-6, 0); c.quadraticCurveTo(0, 2.5, 6, 0); c.stroke();
    } else if (kind === 'lab') { // atom
      c.rotate(a); c.strokeStyle = '#3d5cc4'; c.lineWidth = 2;
      for (i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, 0, 13, 4.5, i * Math.PI / 3, 0, Math.PI * 2); c.stroke(); }
      circle(c, 0, 0, 2.6); c.fillStyle = '#ff4f9a'; c.fill();
    } else if (kind === 'sun') {
      if (v < 0.6) { // little sun
        c.fillStyle = c.strokeStyle = '#ff8a1f'; c.lineWidth = 2.5;
        circle(c, 0, 0, 6); c.fill(); c.beginPath();
        for (i = 0; i < 8; i++) { ra = a + i * Math.PI / 4; c.moveTo(Math.cos(ra) * 9, Math.sin(ra) * 9); c.lineTo(Math.cos(ra) * 13, Math.sin(ra) * 13); }
        c.stroke();
      } else { // seagull
        c.strokeStyle = '#b8642c'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(-4.5, -6, 0, 0); c.quadraticCurveTo(4.5, -6, 9, 0); c.stroke();
      }
    }
    c.restore();
  }

  // rnd: seeded random, so a resize redraws the same decorations.
  function drawFloor(c, m, th, rnd) {
    var cs = m.cs, a = artKit(), col = ink();
    var sky = a && a.sky('ts-bg:' + th.deco, 32, 180, [a.shade(th.bg, 0.18), th.bg, a.shade(th.bg2, -0.12)]);
    if (sky && sky.canvas) c.drawImage(sky.canvas, 0, 0, 1280, 720);
    else { c.fillStyle = th.bg; c.fillRect(0, 0, 1280, 720); }
    c.save();
    c.globalAlpha = 0.28; c.fillStyle = th.bg2;
    for (var i = -720; i < 1280; i += 64) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 22, 0); c.lineTo(i + 22 + 720, 720); c.lineTo(i + 720, 720); c.closePath(); c.fill();
    }
    c.restore();
    var x0 = m.ox, y0 = m.oy, w = m.cols * cs, h = m.rows * cs;
    if (a) a.shadow(c, x0 - 18, y0 - 8, w + 36, h + 36, 0.5);
    rr(c, x0 - 20, y0 - 16, w + 40, h + 40, 26); c.fillStyle = col; c.fill();
    rr(c, x0 - 14, y0 - 6, w + 28, h + 30, 20); c.fillStyle = a ? a.shade(th.wall, -0.28) : th.wside; c.fill();
    rr(c, x0 - 14, y0 - 14, w + 28, h + 26, 20); c.fillStyle = th.f1; c.fill();
    rr(c, x0 - 8, y0 - 12, w + 16, 10, 6); c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
    var hs = cs / 2;
    c.fillStyle = th.f2;
    for (var ty = 0; ty < m.rows * 2; ty++) {
      for (var tx = 0; tx < m.cols * 2; tx++) {
        if ((tx + ty) % 2) c.fillRect(x0 + tx * hs, y0 + ty * hs, hs, hs);
      }
    }
    c.save();
    c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    c.globalAlpha = 0.22; c.strokeStyle = a ? a.shade(th.f2, -0.2) : th.dot; c.lineWidth = 2;
    c.beginPath();
    for (var gy = 0; gy <= m.rows; gy++) { c.moveTo(x0, y0 + gy * cs); c.lineTo(x0 + w, y0 + gy * cs); }
    for (var gx = 0; gx <= m.cols; gx++) { c.moveTo(x0 + gx * cs, y0); c.lineTo(x0 + gx * cs, y0 + h); }
    c.stroke();
    c.restore();
    c.fillStyle = th.dot;
    for (var cy = 0; cy < m.rows; cy++) {
      for (var cx = 0; cx < m.cols; cx++) {
        circle(c, x0 + cx * cs + cs / 2, y0 + cy * cs + cs / 2, 2.2); c.fill();
      }
    }
    // themed decorations, kept faint (alpha 0.3)
    rnd = rnd || Math.random;
    c.save();
    c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    c.globalAlpha = 0.3; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    if (th.deco === 'choco') { // chocolate-bar grooves
      for (ty = 0; ty < m.rows * 2; ty++) {
        for (tx = 0; tx < m.cols * 2; tx++) {
          var gx = x0 + tx * hs + hs - 5, gy = y0 + ty * hs + hs - 5;
          c.moveTo(gx - hs + 10, gy); c.lineTo(gx, gy); c.lineTo(gx, gy - hs + 10);
        }
      }
      c.strokeStyle = '#a0643c'; c.lineWidth = 2; c.stroke();
    } else if (th.deco === 'lab') { // blueprint grid
      for (var gl = 0; gl <= m.cols * 4; gl++) { c.moveTo(x0 + gl * hs / 2, y0); c.lineTo(x0 + gl * hs / 2, y0 + h); }
      for (gl = 0; gl <= m.rows * 4; gl++) { c.moveTo(x0, y0 + gl * hs / 2); c.lineTo(x0 + w, y0 + gl * hs / 2); }
      c.strokeStyle = '#6f8fdc'; c.lineWidth = 1; c.stroke();
    }
    // 0-2 per cell, in opposite quarters so they never pile up on the centre dot
    for (cy = 0; cy < m.rows; cy++) {
      for (cx = 0; cx < m.cols; cx++) {
        var n = rnd() < 0.3 ? 0 : rnd() < 0.75 ? 1 : 2, q = (rnd() * 4) | 0;
        for (var d = 0; d < n; d++, q = (q + 2) % 4) {
          drawDeco(c, th.deco, x0 + cx * cs + (q % 2 + 0.25 + rnd() * 0.5) * hs, y0 + cy * cs + ((q >> 1) + 0.25 + rnd() * 0.5) * hs, rnd);
        }
      }
    }
    c.restore();
    if (a) a.vignette(c, 1280, 720, 0.32);
  }

  // Visual blocks are thicker than the collision rects (maze.js T stays 10).
  // Length grows by 1px only, so a passable gap stays a gap. The lip hangs
  // down onto the floor, never across the opening.
  function wallBlock(r) {
    var w = r.x2 - r.x1, h = r.y2 - r.y1, horiz = w >= h;
    var x, y, bw, bh;
    if (horiz) {
      x = r.x1 + 1; bw = Math.max(8, w - 2);
      y = (r.y1 + r.y2) / 2 - 11; bh = 20;
    } else {
      y = r.y1 + 1; bh = Math.max(8, h - 2);
      x = (r.x1 + r.x2) / 2 - 11; bw = 22;
    }
    return { x: x, y: y, w: bw, h: bh, horiz: horiz };
  }
  function drawWalls(c, m, th, shadowOnly) {
    var rects = m.rects, i, r, b, a = artKit(), col = ink(), LIP = 10;
    var side = a ? a.shade(th.wside, -0.18) : th.wside;
    if (shadowOnly) {
      for (i = 0; i < rects.length; i++) {
        b = wallBlock(rects[i]);
        if (a) a.shadow(c, b.x, b.y, b.w, b.h + LIP, 0.42);
        else { c.fillStyle = 'rgba(27,22,64,0.16)'; rr(c, b.x + 2, b.y + 8, b.w, b.h, 5); c.fill(); }
      }
      return;
    }
    for (i = 0; i < rects.length; i++) {
      r = rects[i]; b = wallBlock(r);
      rr(c, b.x - 3, b.y - 3, b.w + 6, b.h + LIP + 3, 6); c.fillStyle = col; c.fill();
      rr(c, b.x, b.y + 6, b.w, b.h + LIP - 5, 5); c.fillStyle = side; c.fill();
      rr(c, b.x, b.y, b.w, b.h, 5); c.fillStyle = th.wall; c.fill();
      rr(c, b.x + 2, b.y + 2, b.w - 4, Math.max(4, b.h * 0.42), 4); c.fillStyle = th.wtop; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      if (b.horiz && b.w > 22) { rr(c, b.x + 8, b.y + 3, b.w - 16, 3.5, 2); c.fill(); }
      else if (!b.horiz && b.h > 22) { rr(c, b.x + 3, b.y + 8, 3.5, b.h - 16, 2); c.fill(); }
    }
  }

  // Beginner guide: an arrow at the wall in front of the barrel, pointing back at the tank.
  function drawBounce(c, x, y, ux, uy) {
    c.save(); c.translate(x, y); c.rotate(Math.atan2(uy, ux));
    c.beginPath(); c.moveTo(5, -8); c.lineTo(-4, 0); c.lineTo(5, 8);
    c.lineCap = c.lineJoin = 'round'; c.lineWidth = 8; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
    c.restore();
  }

  /* ------------------------------------------------------------ trophy */
  function drawTrophy(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 6; c.strokeStyle = INK; c.lineJoin = 'round';
    // shine rays
    c.save(); c.rotate(t * 0.3);
    c.fillStyle = 'rgba(255,240,150,0.35)';
    for (var i = 0; i < 12; i++) {
      c.rotate(Math.PI / 6);
      c.beginPath(); c.moveTo(0, -40); c.lineTo(-22, -260); c.lineTo(22, -260); c.closePath(); c.fill();
    }
    c.restore();
    // handles
    c.lineWidth = 14; c.strokeStyle = INK;
    c.beginPath(); c.arc(-62, -40, 32, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(62, -40, 32, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.lineWidth = 7; c.strokeStyle = '#ffcc1f';
    c.beginPath(); c.arc(-62, -40, 32, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(62, -40, 32, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.lineWidth = 6; c.strokeStyle = INK;
    // cup
    c.beginPath(); c.moveTo(-72, -86); c.lineTo(72, -86); c.quadraticCurveTo(70, 10, 0, 22); c.quadraticCurveTo(-70, 10, -72, -86); c.closePath();
    c.fillStyle = '#ffcc1f'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-50, -76); c.quadraticCurveTo(-48, -20, -20, 4); c.lineWidth = 9; c.strokeStyle = '#fff3a8'; c.stroke();
    c.lineWidth = 6; c.strokeStyle = INK;
    // paint spilling over rim
    c.fillStyle = '#ff4f9a';
    c.beginPath(); c.ellipse(0, -86, 72, 12, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(20, -80); c.quadraticCurveTo(26, -55, 30, -58); c.quadraticCurveTo(34, -60, 34, -80); c.fill();
    // stem & base
    rr(c, -14, 18, 28, 36, 6); c.fillStyle = '#f0b000'; c.fill(); c.stroke();
    rr(c, -52, 52, 104, 28, 10); c.fillStyle = '#ffcc1f'; c.fill(); c.stroke();
    rr(c, -64, 76, 128, 22, 10); c.fillStyle = '#8a5aff'; c.fill(); c.stroke();
    c.fillStyle = '#fff';
    star(c, 0, -38, 26, 11); c.fill(); c.stroke();
    c.restore();
  }

  window.TS_ART = {
    INK: INK, PAL: PAL, THEMES: THEMES, HATS: HATS, SPLATS: SPLATS, POWERS: POWERS,
    rr: rr, circle: circle, star: star, heart: heart,
    drawTank: drawTank, drawHat: drawHat, drawSplat: drawSplat, splatSprite: splatSprite, drawBall: drawBall,
    drawCrate: drawCrate, drawPowerIcon: drawPowerIcon, drawFloor: drawFloor, drawWalls: drawWalls,
    drawTrophy: drawTrophy, drawBounce: drawBounce
  };
})();
