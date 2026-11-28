/* Paint Tanks — all drawing code (tanks, hats, splats, crates, maze, barrels, pads, trophy). Exposes window.TS_ART. */
(function () {
  'use strict';
  var INK = '#1b1640', PI = Math.PI, PI2 = PI * 2;
  var PAL = [
    { id: 'green', main: '#3fd15d', dark: '#1f8f3a', light: '#a4f5b0', paint: '#35c957', name: 'الأخضر' },
    { id: 'red', main: '#ff4f63', dark: '#c02438', light: '#ffb0b8', paint: '#ff3d55', name: 'الأحمر' },
    { id: 'blue', main: '#3b8cff', dark: '#1d55c4', light: '#aecdff', paint: '#2f7dff', name: 'الأزرق' },
    { id: 'yellow', main: '#ffc61f', dark: '#c98600', light: '#ffe79a', paint: '#ffb800', name: 'الأصفر' }
  ];
  var THEMES = [
    { name: 'ساحة الألعاب', f1: '#d7f5a4', f2: '#c4eb88', dot: '#b4e074', wall: '#7c62ff', wtop: '#d4c6ff', wside: '#3f2aad', bg: '#4d3cc4', bg2: '#6d5ae0', deco: 'grass' },
    { name: 'أرض الحلوى', f1: '#fff1f7', f2: '#ffe3ef', dot: '#ffcfe2', wall: '#ff5fa8', wtop: '#ff9ccb', wside: '#d63584', bg: '#e0458f', bg2: '#ec5a9e', deco: 'candy' },
    { name: 'شاطئ الرمال', f1: '#fff9df', f2: '#fcf0c4', dot: '#f2e2a4', wall: '#15b8b1', wtop: '#6fe0d9', wside: '#0c8b86', bg: '#10a4c8', bg2: '#21b4d6', deco: 'beach' },
    { name: 'مصنع الشوكولاتة', f1: '#fff5ea', f2: '#fbe8d5', dot: '#f2d6bb', wall: '#9a5a36', wtop: '#c98a5f', wside: '#6e3c20', bg: '#7a4527', bg2: '#8a5433', deco: 'choco' },
    { name: 'مختبر العلماء', f1: '#f4f7fd', f2: '#e7edf9', dot: '#d8e1f3', wall: '#4d5c8f', wtop: '#8391c4', wside: '#323e69', bg: '#2e3960', bg2: '#38446e', deco: 'lab' },
    { name: 'غروب البرتقال', f1: '#fffaf0', f2: '#fff0d8', dot: '#ffe0b3', wall: '#ff8a2b', wtop: '#ffb870', wside: '#d4600d', bg: '#e8661a', bg2: '#f27a2c', deco: 'sun' }
  ];
  var HATS = [
    { name: 'بدون', price: 0 }, { name: 'قبعة الحفلة', price: 30 }, { name: 'آذان القطة', price: 40 },
    { name: 'فيونكة', price: 40 }, { name: 'زهرة', price: 50 }, { name: 'مروحة', price: 70 },
    { name: 'هوائي', price: 80 }, { name: 'قبعة الطاهي', price: 100 }, { name: 'خوذة القرون', price: 120 },
    { name: 'قبعة الساحر', price: 150 }, { name: 'التاج الذهبي', price: 0, stars: 24 }
  ];
  var SPLATS = [
    { name: 'بقعة عادية', price: 0 }, { name: 'نجمة', price: 60 }, { name: 'قلب', price: 60 },
    { name: 'زهرة', price: 90 }, { name: 'قوس قزح', price: 140 }
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
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r > 0 ? r : 0, 0, PI2); }
  function C(c, x, y, r, fl, st) { circle(c, x, y, r); if (fl) { c.fillStyle = fl; c.fill(); } if (st) c.stroke(); }
  function R(c, x, y, w, h, r, fl, st) { rr(c, x, y, w, h, r); if (fl) { c.fillStyle = fl; c.fill(); } if (st) c.stroke(); }
  function P(c, pts, fl, st, open) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (!open) c.closePath();
    if (fl) { c.fillStyle = fl; c.fill(); }
    if (st) c.stroke();
  }
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
  function star(c, x, y, R0, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) { var a = -PI / 2 + i * PI / 5, rad = i % 2 ? r : R0; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    c.closePath();
  }
  function heart(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
    c.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); c.closePath();
  }

  /* ------------------------------------------------------------ hats */
  function drawHat(c, id, x, y, s, t) {
    if (!id) return;
    t = Kit.motion.reduced() ? 0 : (t || 0);
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round';
    var sd, i;
    switch (id) {
      case 1:
        P(c, [-10, 2, 0, -24, 10, 2], '#ff5fa8', 0);
        c.save(); c.clip(); c.fillStyle = '#ffe14d';
        for (i = -1; i < 3; i++) c.fillRect(-12, -20 + i * 8, 24, 3.5);
        c.restore(); c.stroke(); C(c, 0, -25, 4, '#5fe0ff', 1);
        break;
      case 2:
        for (sd = -1; sd <= 1; sd += 2) {
          P(c, [sd * 3, -2, sd * 12, -18, sd * 15, 0], '#6b5a7e', 1);
          P(c, [sd * 6, -3, sd * 11.5, -12, sd * 13, -3], '#ff9cc6', 0);
        }
        break;
      case 3:
        c.fillStyle = '#ff4f9a';
        for (sd = -1; sd <= 1; sd += 2) {
          c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(sd * 10, -20, sd * 15, -12);
          c.quadraticCurveTo(sd * 16, -1, 0, -6); c.closePath(); c.fill(); c.stroke();
        }
        C(c, 0, -6, 4.5, '#ffd0e4', 1);
        break;
      case 4:
        c.save(); c.translate(6, -8); c.rotate(t * 0.8);
        for (i = 0; i < 6; i++) {
          c.save(); c.rotate(i * PI / 3); c.beginPath(); c.ellipse(0, -7, 4.5, 6.5, 0, 0, PI2);
          c.fillStyle = i % 2 ? '#fff' : '#fff0f7'; c.fill(); c.stroke(); c.restore();
        }
        C(c, 0, 0, 4.5, '#ffcf2e', 1); c.restore();
        break;
      case 5:
        c.beginPath(); c.arc(0, 0, 11, PI, 0); c.closePath(); c.fillStyle = '#3b8cff'; c.fill(); c.stroke();
        c.fillStyle = '#ffe14d';
        c.beginPath(); c.arc(0, 0, 11, PI, PI * 1.33); c.lineTo(0, 0); c.fill();
        c.beginPath(); c.arc(0, 0, 11, PI * 1.66, PI2); c.lineTo(0, 0); c.fill();
        c.beginPath(); c.arc(0, 0, 11, PI, 0); c.closePath(); c.stroke();
        P(c, [0, -11, 0, -16], 0, 1, 1);
        c.beginPath(); c.ellipse(0, -17, Math.abs(Math.cos(t * 18) * 13) + 1, 2.6, 0, 0, PI2);
        c.fillStyle = '#ff4f63'; c.fill(); c.stroke();
        break;
      case 6:
        var wob = Math.sin(t * 5) * 3;
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(wob * 0.5, -10, wob, -20); c.stroke();
        C(c, wob, -22, 5, '#ff4f63', 1); C(c, wob - 1.5, -23.5, 1.6, '#fff', 0);
        break;
      case 7:
        R(c, -8, -8, 16, 9, 2, '#fff', 1);
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(-6, -13, 6, 0, PI2); c.arc(6, -13, 6, 0, PI2); c.arc(0, -18, 7, 0, PI2); c.fill();
        c.beginPath(); c.arc(-6, -13, 6, PI * 0.5, PI * 1.6); c.stroke();
        c.beginPath(); c.arc(6, -13, 6, -PI * 0.6, PI * 0.5); c.stroke();
        c.beginPath(); c.arc(0, -18, 7, PI * 1.1, PI * 1.9); c.stroke();
        break;
      case 8:
        for (sd = -1; sd <= 1; sd += 2) {
          c.beginPath(); c.moveTo(sd * 8, -5); c.quadraticCurveTo(sd * 20, -6, sd * 17, -20);
          c.quadraticCurveTo(sd * 14, -10, sd * 5, -10); c.closePath(); c.fillStyle = '#fff8e0'; c.fill(); c.stroke();
        }
        c.beginPath(); c.arc(0, 0, 11, PI, 0); c.closePath(); c.fillStyle = '#c3c9dc'; c.fill(); c.stroke();
        c.fillStyle = '#e8ecf7'; c.fillRect(-6, -8, 4, 5);
        c.lineWidth = 4; c.strokeStyle = '#ffcc33'; P(c, [-11, 0, 11, 0], 0, 1, 1);
        break;
      case 9:
        c.beginPath(); c.moveTo(-13, 0); c.quadraticCurveTo(0, 4, 13, 0); c.lineTo(3, -6);
        c.quadraticCurveTo(4, -22, 12, -28); c.quadraticCurveTo(-4, -26, -4, -6); c.closePath();
        c.fillStyle = '#6a3cff'; c.fill(); c.stroke();
        c.fillStyle = '#ffe14d'; star(c, 1, -12, 3.6, 1.6); c.fill(); star(c, -6, -3, 2.4, 1.1); c.fill();
        break;
      case 10:
        P(c, [-12, 0, -13, -14, -6, -7, 0, -18, 6, -7, 13, -14, 12, 0], '#ffcc1f', 1);
        c.fillStyle = '#fff3a8'; c.fillRect(-9, -5, 4, 3);
        C(c, 0, -3, 2.6, '#ff3d6e', 0); C(c, -13, -15, 2.2, '#5fe0ff', 0); C(c, 13, -15, 2.2, '#5fe0ff', 0); C(c, 0, -19, 2.4, '#5fe0ff', 0);
        break;
    }
    c.restore();
  }

  /* ------------------------------------------------------------ tanks */
  function paintHull(c, pal) {
    c.lineWidth = 2.8; c.strokeStyle = ink(); c.lineJoin = 'round';
    for (var sd = -1; sd <= 1; sd += 2) {
      R(c, -19, sd * 14 - 6, 38, 12, 6, '#3a3354', 1);
      R(c, -16, sd * 14 - 3.5, 32, 7, 3.5, '#5c5478', 0);
    }
    R(c, -16, -12, 32, 24, 8, pal.main, 1);
    c.globalAlpha = 0.8; R(c, -11, -9, 16, 5.5, 3, pal.light, 0);
    c.globalAlpha = 0.45; R(c, -11, 5, 22, 4, 2, pal.dark, 0); c.globalAlpha = 1;
  }
  function paintTurret(c, pal) {
    var col = ink(); c.lineWidth = 2.8; c.strokeStyle = col; c.lineJoin = 'round';
    C(c, -1, 0, 12, pal.main, 1);
    c.globalAlpha = 0.85; C(c, -5, -4, 4, pal.light, 0); c.globalAlpha = 1;
    for (var e = -1; e <= 1; e += 2) {
      c.save(); c.translate(3.5, e * 5);
      c.beginPath(); c.ellipse(0, 0, 4.6, 5, 0, 0, PI2);
      c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.8; c.stroke();
      C(c, 1.7, 0.2, 2.3, col, 0); C(c, 2.3, -0.9, 0.85, '#fff', 0);
      c.restore();
    }
  }
  function paintBarrel(c, pal) {
    c.lineWidth = 2.8; c.strokeStyle = ink(); c.lineJoin = 'round';
    R(c, -13, -4.5, 20, 9, 4, '#f7f4ff', 1);
    R(c, 2, -6.5, 9, 13, 4, pal.paint, 1);
    c.fillStyle = pal.light; c.fillRect(-7, -2.5, 9, 2.2);
  }
  function spr(k, w, h, fn) { var a = artKit(); return a ? a.sprite(k, w, h, fn) : null; }
  function hullSprite(pal) { return spr('ts-hull:' + pal.id, 60, 52, function (c, w, h) { c.save(); c.translate(w / 2, h / 2); paintHull(c, pal); c.restore(); }); }
  function turretSprite(pal) { return spr('ts-turret:' + pal.id, 36, 36, function (c, w, h) { c.save(); c.translate(w / 2, h / 2); paintTurret(c, pal); c.restore(); }); }
  function barrelSprite(pal) { return spr('ts-barrel:' + pal.id, 32, 20, function (c, w, h) { c.save(); c.translate(w / 2, h / 2); paintBarrel(c, pal); c.restore(); }); }
  function treadSprite() { return spr('ts-tread', 52, 7, function (c, w, h) { c.fillStyle = '#9a93b4'; for (var x = -7; x < w + 7; x += 7) c.fillRect(x, 0, 3, h); }); }
  function hatSprite(id) { return spr('ts-hat:' + id, 40, 40, function (c, w, h) { drawHat(c, id, w / 2, h - 2, 1, 0); }); }
  function splatSprite(color, style, variant) {
    variant = ((variant % 3) + 3) % 3; style = style || 0;
    return spr('ts-splat:' + color + ':' + style + ':' + variant, 96, 96, function (c) {
      drawSplat(c, 48, 48, 34, color, style, seedRand(variant * 97 + style * 13 + (color.charCodeAt(1) || 1)));
    });
  }

  function drawTank(c, o) {
    var pal = o.pal, sc = o.scale == null ? 1 : o.scale;
    if (sc <= 0.01 || !pal) return;
    var a = artKit(), dead = o.dead || 0;
    if (a) a.shadow(c, o.x - 24 * sc, o.y - 5 * sc, 48 * sc, 28 * sc, dead > 0 ? 0.28 : 0.48);
    if (dead > 0.02) { drawDeadTank(c, o, sc, dead); return; }
    var hull = hullSprite(pal), turret = turretSprite(pal), barrel = barrelSprite(pal), strip = treadSprite();
    var sq = o.sq || 0, recoil = Math.min(1, o.recoil || 0), sx = 1 - sq * 0.16, sy = 1 + sq * 0.14;
    var aimA = o.a || 0, bodyA = o.bodyA != null ? o.bodyA : aimA;
    var blinkInv = o.invuln > 0 && Math.floor((o.t || 0) * 18) % 2 === 0;

    c.save(); if (blinkInv) c.globalAlpha = 0.55;
    c.translate(o.x, o.y); c.rotate(bodyA); c.scale(sc * sx, sc * sy);
    if (hull && hull.canvas && a) a.blit(c, hull, 0, 0); else paintHull(c, pal);
    if (strip && strip.canvas) {
      var ph = ((o.tread || 0) % 7 + 7) % 7;
      for (var sd = -1; sd <= 1; sd += 2) {
        c.save(); rr(c, -16, sd * 14 - 3.5, 32, 7, 3.5); c.clip();
        c.drawImage(strip.canvas, -25 + ph, sd * 14 - 3.5, 52, 7); c.restore();
      }
    }
    c.restore();

    c.save(); if (blinkInv) c.globalAlpha = 0.55;
    c.translate(o.x, o.y); c.rotate(aimA); c.scale(sc * sx, sc * sy);
    if (barrel && barrel.canvas && a) a.blit(c, barrel, 15 - recoil * 7, 0);
    else { c.save(); c.translate(15 - recoil * 7, 0); paintBarrel(c, pal); c.restore(); }
    if (turret && turret.canvas && a) a.blit(c, turret, 0, 0); else paintTurret(c, pal);
    if (o.blink) for (var e2 = -1; e2 <= 1; e2 += 2) R(c, -0.5, e2 * 5 - 3.8, 9, 7.6, 3, pal.main, 0);
    if (o.flash > 0) { c.globalAlpha = Math.min(0.85, o.flash); R(c, -21, -19, 44, 38, 11, '#fff', 0); c.globalAlpha = 1; }
    c.restore();

    if (o.muzzle > 0 && a) {
      var reach = (27 - recoil * 6) * sc;
      a.blit(c, a.glow(pal.paint, a.quality.tier === 0 ? 14 : 24), o.x + Math.cos(aimA) * reach, o.y + Math.sin(aimA) * reach, { alpha: Math.min(0.8, o.muzzle), sx: 0.55, sy: 0.55 });
    }
    if (o.hat) {
      var hx = o.x - 1.5 * Math.cos(aimA) * sc, hy = o.y - 1.5 * Math.sin(aimA) * sc - 7 * sc;
      if (o.hat === 4 || o.hat === 5 || o.hat === 6 || !a) drawHat(c, o.hat, hx, hy, 0.88 * sc, o.t);
      else { var hs = hatSprite(o.hat), s = 0.88 * sc; if (hs && hs.canvas) a.blit(c, hs, hx, hy - 14 * s, { sx: s, sy: s }); }
    }
    if (o.hp > 1) {
      c.save();
      var p2 = Kit.motion.reduced() ? 1 : 1 + Math.sin((o.t || 0) * 5) * 0.03, spin = Kit.motion.reduced() ? 0 : (o.t || 0) * 1.4;
      c.lineWidth = 3.2; c.lineCap = 'round'; c.strokeStyle = 'rgba(255,224,90,0.92)';
      for (var sa = 0; sa < 3; sa++) { var a0 = spin + sa * PI2 / 3; c.beginPath(); c.arc(o.x, o.y, 23 * p2 * sc, a0, a0 + 1.15); c.stroke(); }
      c.restore();
    }
    if (o.shield > 0) {
      var pulse = Kit.motion.reduced() ? 1 : 1 + Math.sin((o.t || 0) * 8) * 0.04;
      c.save(); c.globalAlpha = o.shield < 2 ? (Math.sin((o.t || 0) * 14) > 0 ? 1 : 0.4) : 1;
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.95)';
      C(c, o.x, o.y, 28 * pulse * sc, 'rgba(120,220,255,0.22)', 1);
      c.beginPath(); c.arc(o.x, o.y, 22 * pulse * sc, -2.6, -1.7); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
      c.restore();
    }
  }
  function drawDeadTank(c, o, sc, dead) {
    var pop = dead < 0.28 ? 1 + dead * 1.35 : 1.38 * (1 - (dead - 0.28) / 0.72);
    if (pop < 0.04) return;
    var s = sc * pop, a = artKit(), sp = splatSprite(o.paint || '#fff', 0, 2);
    c.save(); c.globalAlpha = Math.min(1, 0.35 + dead);
    if (sp && sp.canvas && a) a.blit(c, sp, o.x, o.y, { sx: s * 0.85, sy: s * 0.75 });
    c.restore();
    if (o.blobs) {
      c.save(); c.translate(o.x, o.y); c.rotate(o.a || 0); c.scale(s, s);
      c.globalAlpha = Math.min(1, dead * 1.5); c.fillStyle = o.paint || '#fff';
      for (var b = 0; b < o.blobs.length; b += 3) C(c, o.blobs[b], o.blobs[b + 1], o.blobs[b + 2], o.paint || '#fff', 0);
      c.restore();
    }
    if (dead > 0.3) {
      c.save(); c.translate(o.x, o.y); c.rotate(o.a || 0); c.scale(sc, sc);
      c.strokeStyle = ink(); c.lineWidth = 2;
      for (var e = -1; e <= 1; e += 2) {
        c.save(); c.translate(2, e * 5); c.rotate(Kit.motion.reduced() ? 0 : (o.t || 0) * 4 * e);
        c.beginPath();
        for (var q = 0; q < 12; q++) c.lineTo(Math.cos(q * 0.75) * q * 0.32, Math.sin(q * 0.75) * q * 0.32);
        c.stroke(); c.restore();
      }
      c.restore();
    }
  }

  /* ------------------------------------------------------------ splats & balls */
  function splatDrops(c, x, y, s, color, rnd) {
    c.fillStyle = color;
    for (var i = 0; i < 7; i++) { var a = rnd() * 6.28, d = s * (1 + rnd() * 0.6); C(c, x + Math.cos(a) * d, y + Math.sin(a) * d, s * (0.06 + rnd() * 0.08), color, 0); }
  }
  function drawSplat(c, x, y, s, color, style, rnd) {
    rnd = rnd || Math.random; c.save(); c.globalAlpha = 0.92; c.fillStyle = color;
    if (style === 1) { c.save(); c.translate(x, y); c.rotate(rnd() * 6.28); star(c, 0, 0, s * 1.05, s * 0.5); c.fill(); c.restore(); splatDrops(c, x, y, s, color, rnd); }
    else if (style === 2) { heart(c, x, y, s * 0.85); c.fill(); splatDrops(c, x, y, s, color, rnd); }
    else if (style === 3) {
      var r0 = rnd() * 6;
      for (var i = 0; i < 6; i++) { var a = r0 + i * PI / 3; c.beginPath(); c.ellipse(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.42, s * 0.27, a, 0, PI2); c.fill(); }
      C(c, x, y, s * 0.35, '#fff3a8', 0); splatDrops(c, x, y, s, color, rnd);
    } else if (style === 4) {
      ['#ff4f63', '#ff9d00', '#ffd21f', '#3fd15d', '#3b8cff', '#a64dff'].forEach(function (col, j) { C(c, x, y, s * (0.95 - j * 0.15), col, 0); });
      splatDrops(c, x, y, s, color, rnd);
    } else {
      C(c, x, y, s * 0.62, color, 0);
      for (var k = 0; k < 9; k++) {
        var aa = (k / 9) * PI2 + rnd() * 0.5, d = s * (0.45 + rnd() * 0.3);
        C(c, x + Math.cos(aa) * d, y + Math.sin(aa) * d, s * (0.2 + rnd() * 0.18), color, 0);
        if (rnd() < 0.6) { var d2 = s * (0.95 + rnd() * 0.55); C(c, x + Math.cos(aa) * d2, y + Math.sin(aa) * d2, s * (0.06 + rnd() * 0.08), color, 0); }
      }
    }
    c.restore();
  }
  function drawBall(c, x, y, r, color, sq, ang) {
    c.save(); c.translate(x, y); c.rotate(ang || 0); c.scale(1 + (sq || 0) * 0.35, 1 - (sq || 0) * 0.3);
    c.lineWidth = Math.max(1.8, r * 0.3); c.strokeStyle = INK; C(c, 0, 0, r, color, 1); c.restore();
    C(c, x - r * 0.35, y - r * 0.38, r * 0.32, 'rgba(255,255,255,0.85)', 0);
  }

  /* ------------------------------------------------------------ crates & power icons */
  function drawPowerIcon(c, id, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 2; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round';
    if (id === 'laser') {
      c.strokeStyle = '#ff3d6e'; c.lineWidth = 3; c.setLineDash([3, 3]); P(c, [-9, 7, 0, -6, 9, 7], 0, 1, 1); c.setLineDash([]);
      C(c, -9, 7, 3, '#ff3d6e', 0); P(c, [9, 7, 3, 5, 8, 1], '#ff3d6e', 0);
    } else if (id === 'triple') {
      [-0.55, 0, 0.55].forEach(function (a) { C(c, Math.sin(a) * 8, -Math.cos(a) * 8 + 4, 4, '#ff9d00', 1); });
      C(c, 0, 9, 3, INK, 0);
    } else if (id === 'giant') {
      C(c, 0, 0, 9.5, '#a64dff', 1); C(c, -3.5, -3.5, 3, 'rgba(255,255,255,0.85)', 0);
    } else if (id === 'speed') {
      P(c, [2, -11, -7, 2, -1, 2, -3, 11, 7, -3, 1, -3], '#ffcc00', 1);
    } else if (id === 'shield') {
      c.strokeStyle = '#1b9fd6'; c.lineWidth = 2.4; C(c, 0, 0, 10, 'rgba(120,220,255,0.6)', 1);
      c.beginPath(); c.arc(0, 0, 6.5, -2.6, -1.6); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke();
    }
    c.restore();
  }
  function drawCrate(c, x, y, pw, t, pop) {
    var bob = Math.sin(t * 4) * 2.5, s = pop;
    c.save(); c.fillStyle = 'rgba(42,34,64,0.2)';
    c.beginPath(); c.ellipse(x + 2, y + 16, 15 * s, 6 * s, 0, 0, PI2); c.fill();
    c.translate(x, y + bob - 3); c.scale(s * (1 + Math.sin(t * 8) * 0.03), s * (1 - Math.sin(t * 8) * 0.03)); c.rotate(Math.sin(t * 2.2) * 0.08);
    c.lineWidth = 3.5; c.strokeStyle = INK; R(c, -17, -17, 34, 34, 9, '#fff', 1);
    c.lineWidth = 3; c.strokeStyle = pw.color; R(c, -13, -13, 26, 26, 6, 0, 1); c.restore();
    drawPowerIcon(c, pw.id, x, y + bob - 3, 0.95 * s);
    var sp = (t * 1.3) % 2;
    if (sp < 0.5) { c.save(); c.globalAlpha = 1 - sp * 2; c.fillStyle = '#fff'; star(c, x + 14, y - 16 + bob, 5 * s, 1.8 * s); c.fill(); c.restore(); }
  }

  /* ------------------------------------------------------------ maze */
  var SPRINKLES = ['#ff4f9a', '#3fb8ff', '#ffc61f', '#5fd36a', '#a66bff'];
  function drawDeco(c, kind, x, y, rnd) {
    var v = rnd(), a = rnd() * PI2, i, ra;
    c.save(); c.translate(x, y);
    if (kind === 'grass') {
      if (v < 0.6) {
        c.strokeStyle = '#4fae3c'; c.lineWidth = 3; c.beginPath();
        c.moveTo(-5, 5); c.quadraticCurveTo(-5, -1, -9, -6); c.moveTo(0, 5); c.lineTo(0, -8); c.moveTo(5, 5); c.quadraticCurveTo(5, -1, 9, -6); c.stroke();
      } else {
        c.rotate(a); for (i = 0; i < 5; i++) C(c, Math.cos(i * 1.2566) * 5, Math.sin(i * 1.2566) * 5, 3.6, '#ff6fae', 0);
        C(c, 0, 0, 2.8, '#ffb000', 0);
      }
    } else if (kind === 'candy') {
      c.lineWidth = 4;
      for (i = 0; i < 3; i++) {
        var sx = (rnd() - 0.5) * 24, sy = (rnd() - 0.5) * 24, dx = Math.cos(a + i * 2) * 4.5, dy = Math.sin(a + i * 2) * 4.5;
        c.strokeStyle = SPRINKLES[(rnd() * 5) | 0]; P(c, [sx - dx, sy - dy, sx + dx, sy + dy], 0, 1, 1);
      }
    } else if (kind === 'beach') {
      if (v < 0.35) { c.rotate(a); c.fillStyle = c.strokeStyle = '#ff7043'; c.lineWidth = 3; star(c, 0, 0, 11, 4.5); c.fill(); c.stroke(); }
      else if (v < 0.7) {
        c.rotate(a * 0.2 - 0.6); c.fillStyle = '#f08a4b'; c.beginPath(); c.moveTo(0, 6); c.arc(0, 6, 12, PI * 1.12, PI * 1.88); c.closePath(); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath();
        for (i = 1; i < 5; i++) { ra = PI * (1.12 + i * 0.152); c.moveTo(0, 6); c.lineTo(Math.cos(ra) * 11, 6 + Math.sin(ra) * 11); }
        c.stroke();
      } else {
        c.strokeStyle = '#1aa9bd'; c.lineWidth = 2.5; c.beginPath();
        c.moveTo(-13, -3); c.quadraticCurveTo(-6.5, -9, 0, -3); c.quadraticCurveTo(6.5, 3, 13, -3);
        c.moveTo(-8, 5); c.quadraticCurveTo(-2, -1, 4, 5); c.quadraticCurveTo(8, 9, 11, 5); c.stroke();
      }
    } else if (kind === 'choco') {
      c.rotate(a); c.fillStyle = '#8a4a26'; c.beginPath(); c.ellipse(0, 0, 9, 5.5, 0, 0, PI2); c.fill();
      c.strokeStyle = '#fff5ea'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-6, 0); c.quadraticCurveTo(0, 2.5, 6, 0); c.stroke();
    } else if (kind === 'lab') {
      c.rotate(a); c.strokeStyle = '#3d5cc4'; c.lineWidth = 2;
      for (i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, 0, 13, 4.5, i * PI / 3, 0, PI2); c.stroke(); }
      C(c, 0, 0, 2.6, '#ff4f9a', 0);
    } else if (kind === 'sun') {
      if (v < 0.6) {
        c.strokeStyle = '#ff8a1f'; c.lineWidth = 2.5; C(c, 0, 0, 6, '#ff8a1f', 0); c.beginPath();
        for (i = 0; i < 8; i++) { ra = a + i * PI / 4; c.moveTo(Math.cos(ra) * 9, Math.sin(ra) * 9); c.lineTo(Math.cos(ra) * 13, Math.sin(ra) * 13); }
        c.stroke();
      } else { c.strokeStyle = '#b8642c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(-4.5, -6, 0, 0); c.quadraticCurveTo(4.5, -6, 9, 0); c.stroke(); }
    }
    c.restore();
  }

  function drawFloor(c, m, th, rnd) {
    var cs = m.cs, a = artKit(), col = ink();
    var sky = a && a.sky('ts-bg:' + th.deco, 32, 180, [a.shade(th.bg, 0.18), th.bg, a.shade(th.bg2, -0.12)]);
    if (sky && sky.canvas) c.drawImage(sky.canvas, 0, 0, 1280, 720); else { c.fillStyle = th.bg; c.fillRect(0, 0, 1280, 720); }
    c.save(); c.globalAlpha = 0.28; c.fillStyle = th.bg2;
    for (var i = -720; i < 1280; i += 64) P(c, [i, 0, i + 22, 0, i + 742, 720, i + 720, 720], th.bg2, 0);
    c.restore();
    var x0 = m.ox, y0 = m.oy, w = m.cols * cs, h = m.rows * cs, hs = cs / 2, tx, ty, cx, cy;
    if (a) a.shadow(c, x0 - 18, y0 - 8, w + 36, h + 36, 0.5);
    R(c, x0 - 20, y0 - 16, w + 40, h + 40, 26, col, 0);
    R(c, x0 - 14, y0 - 6, w + 28, h + 30, 20, a ? a.shade(th.wall, -0.28) : th.wside, 0);
    R(c, x0 - 14, y0 - 14, w + 28, h + 26, 20, th.f1, 0);
    R(c, x0 - 8, y0 - 12, w + 16, 10, 6, 'rgba(255,255,255,0.28)', 0);
    c.fillStyle = th.f2;
    for (ty = 0; ty < m.rows * 2; ty++) for (tx = 0; tx < m.cols * 2; tx++) if ((tx + ty) % 2) c.fillRect(x0 + tx * hs, y0 + ty * hs, hs, hs);
    c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    c.globalAlpha = 0.22; c.strokeStyle = a ? a.shade(th.f2, -0.2) : th.dot; c.lineWidth = 2; c.beginPath();
    for (var gy = 0; gy <= m.rows; gy++) { c.moveTo(x0, y0 + gy * cs); c.lineTo(x0 + w, y0 + gy * cs); }
    for (var gx = 0; gx <= m.cols; gx++) { c.moveTo(x0 + gx * cs, y0); c.lineTo(x0 + gx * cs, y0 + h); }
    c.stroke(); c.restore();
    for (cy = 0; cy < m.rows; cy++) for (cx = 0; cx < m.cols; cx++) C(c, x0 + cx * cs + hs, y0 + cy * cs + hs, 2.2, th.dot, 0);
    rnd = rnd || Math.random; c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    c.globalAlpha = 0.3; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    if (th.deco === 'choco') {
      for (ty = 0; ty < m.rows * 2; ty++) for (tx = 0; tx < m.cols * 2; tx++) {
        var gx2 = x0 + tx * hs + hs - 5, gy2 = y0 + ty * hs + hs - 5;
        c.moveTo(gx2 - hs + 10, gy2); c.lineTo(gx2, gy2); c.lineTo(gx2, gy2 - hs + 10);
      }
      c.strokeStyle = '#a0643c'; c.lineWidth = 2; c.stroke();
    } else if (th.deco === 'lab') {
      for (var gl = 0; gl <= m.cols * 4; gl++) { c.moveTo(x0 + gl * hs / 2, y0); c.lineTo(x0 + gl * hs / 2, y0 + h); }
      for (gl = 0; gl <= m.rows * 4; gl++) { c.moveTo(x0, y0 + gl * hs / 2); c.lineTo(x0 + w, y0 + gl * hs / 2); }
      c.strokeStyle = '#6f8fdc'; c.lineWidth = 1; c.stroke();
    }
    for (cy = 0; cy < m.rows; cy++) for (cx = 0; cx < m.cols; cx++) {
      var n = rnd() < 0.3 ? 0 : rnd() < 0.75 ? 1 : 2, q = (rnd() * 4) | 0;
      for (var d = 0; d < n; d++, q = (q + 2) % 4) drawDeco(c, th.deco, x0 + cx * cs + (q % 2 + 0.25 + rnd() * 0.5) * hs, y0 + cy * cs + ((q >> 1) + 0.25 + rnd() * 0.5) * hs, rnd);
    }
    c.restore(); if (a) a.vignette(c, 1280, 720, 0.32);
  }

  function wallBlock(r) {
    var w = r.x2 - r.x1, h = r.y2 - r.y1;
    return { x: r.x1 + 0.5, y: r.y1 + 0.5, w: Math.max(8, w - 1), h: Math.max(8, h - 1), horiz: w >= h };
  }
  function drawWalls(c, m, th, shadowOnly) {
    var rects = m.rects, i, b, a = artKit(), col = ink(), LIP = 5, side = a ? a.shade(th.wside, -0.18) : th.wside;
    for (i = 0; i < rects.length; i++) {
      b = wallBlock(rects[i]);
      if (shadowOnly) {
        if (a) a.shadow(c, b.x, b.y, b.w, b.h + LIP, 0.38);
        else R(c, b.x + 2, b.y + 5, b.w, b.h, 4, 'rgba(27,22,64,0.16)', 0);
        continue;
      }
      R(c, b.x - 2, b.y - 2, b.w + 4, b.h + LIP + 2, 5, col, 0);
      R(c, b.x, b.y + 4, b.w, b.h + LIP - 4, 4, side, 0);
      R(c, b.x, b.y, b.w, b.h, 4, th.wall, 0);
      R(c, b.x + 2, b.y + 1.5, b.w - 4, Math.max(3, b.h * 0.42), 3, th.wtop, 0);
      if (b.horiz && b.w > 20) R(c, b.x + 7, b.y + 2.5, b.w - 14, 3, 1.5, 'rgba(255,255,255,0.45)', 0);
      else if (!b.horiz && b.h > 20) R(c, b.x + 2.5, b.y + 7, 3, b.h - 14, 1.5, 'rgba(255,255,255,0.45)', 0);
    }
  }

  /* ------------------------------------------------------------ barrels & boost pads */
  function drawBarrel(c, b, t) {
    var pulse = Kit.motion.reduced() ? 1 : 1 + Math.sin(t * 6 + b.x) * 0.035, r = b.r || 16;
    c.save(); c.fillStyle = 'rgba(27,22,64,0.24)';
    c.beginPath(); c.ellipse(b.x + 2, b.y + r * 0.72, r * 0.95, r * 0.46, 0, 0, PI2); c.fill();
    c.translate(b.x, b.y); c.scale(pulse, pulse);
    c.lineWidth = 3; c.strokeStyle = INK; C(c, 0, 0, r, '#ff6b00', 1);
    c.lineWidth = 2; C(c, 0, 0, r * 0.66, '#ffe14d', 1);
    c.fillStyle = '#ff2a55'; star(c, 0, 0, r * 0.48, r * 0.22); c.fill();
    C(c, -r * 0.34, -r * 0.36, r * 0.22, 'rgba(255,255,255,0.75)', 0); c.restore();
  }
  function drawPad(c, pad, t) {
    var ready = pad.cd <= 0, ph = Kit.motion.reduced() ? 0 : (t * 4) % 1;
    c.save(); c.translate(pad.x, pad.y); c.lineWidth = 3; c.strokeStyle = ready ? '#ff9d00' : '#7b7899';
    R(c, -21, -21, 42, 42, 11, ready ? 'rgba(255,212,31,0.32)' : 'rgba(130,130,160,0.22)', 1);
    c.strokeStyle = ready ? '#ffe14d' : '#a7a4bf'; c.lineWidth = 3.5; c.lineCap = 'round'; c.lineJoin = 'round';
    for (var i = 0; i < 2; i++) {
      var off = ready ? (((i * 0.5 + ph) % 1) - 0.5) * 14 : (i - 0.5) * 9;
      P(c, [-8, off + 4, 0, off - 4, 8, off + 4], 0, 1, 1);
    }
    c.restore();
  }
  function drawBounce(c, x, y, ux, uy) {
    c.save(); c.translate(x, y); c.rotate(Math.atan2(uy, ux));
    c.lineCap = c.lineJoin = 'round';
    c.lineWidth = 8; c.strokeStyle = INK; P(c, [5, -8, -4, 0, 5, 8], 0, 1, 1);
    c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke(); c.restore();
  }

  /* ------------------------------------------------------------ trophy */
  function drawTrophy(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s); c.lineWidth = 6; c.strokeStyle = INK; c.lineJoin = 'round';
    c.save(); c.rotate(t * 0.3); c.fillStyle = 'rgba(255,240,150,0.35)';
    for (var i = 0; i < 12; i++) { c.rotate(PI / 6); P(c, [0, -40, -22, -260, 22, -260], 'rgba(255,240,150,0.35)', 0); }
    c.restore();
    [[14, INK], [7, '#ffcc1f']].forEach(function (w) {
      c.lineWidth = w[0]; c.strokeStyle = w[1];
      c.beginPath(); c.arc(-62, -40, 32, PI * 0.5, PI * 1.5); c.stroke();
      c.beginPath(); c.arc(62, -40, 32, -PI * 0.5, PI * 0.5); c.stroke();
    });
    c.lineWidth = 6; c.strokeStyle = INK;
    c.beginPath(); c.moveTo(-72, -86); c.lineTo(72, -86); c.quadraticCurveTo(70, 10, 0, 22); c.quadraticCurveTo(-70, 10, -72, -86); c.closePath();
    c.fillStyle = '#ffcc1f'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-50, -76); c.quadraticCurveTo(-48, -20, -20, 4); c.lineWidth = 9; c.strokeStyle = '#fff3a8'; c.stroke();
    c.lineWidth = 6; c.strokeStyle = INK; c.fillStyle = '#ff4f9a';
    c.beginPath(); c.ellipse(0, -86, 72, 12, 0, 0, PI2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(20, -80); c.quadraticCurveTo(26, -55, 30, -58); c.quadraticCurveTo(34, -60, 34, -80); c.fill();
    R(c, -14, 18, 28, 36, 6, '#f0b000', 1); R(c, -52, 52, 104, 28, 10, '#ffcc1f', 1); R(c, -64, 76, 128, 22, 10, '#8a5aff', 1);
    c.fillStyle = '#fff'; star(c, 0, -38, 26, 11); c.fill(); c.stroke(); c.restore();
  }

  window.TS_ART = {
    INK: INK, PAL: PAL, THEMES: THEMES, HATS: HATS, SPLATS: SPLATS, POWERS: POWERS,
    rr: rr, circle: circle, star: star, heart: heart, seedRand: seedRand,
    drawTank: drawTank, drawHat: drawHat, drawSplat: drawSplat, splatSprite: splatSprite, drawBall: drawBall,
    drawCrate: drawCrate, drawPowerIcon: drawPowerIcon, drawFloor: drawFloor, drawWalls: drawWalls,
    drawBarrel: drawBarrel, drawPad: drawPad, drawTrophy: drawTrophy, drawBounce: drawBounce
  };
})();
