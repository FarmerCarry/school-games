/* Paint Tanks — all drawing code (tanks, hats, splats, crates, maze, trophy).
   Everything is drawn with canvas paths: no images. Exposes window.TS_ART. */
(function () {
  'use strict';

  var INK = '#2a2240';

  // Tank colour palettes (index = slot).
  var PAL = [
    { id: 'green', main: '#3fd15d', dark: '#1f8f3a', light: '#a4f5b0', paint: '#35c957', name: 'الأخضر' },
    { id: 'red', main: '#ff4f63', dark: '#c02438', light: '#ffb0b8', paint: '#ff3d55', name: 'الأحمر' },
    { id: 'blue', main: '#3b8cff', dark: '#1d55c4', light: '#aecdff', paint: '#2f7dff', name: 'الأزرق' },
    { id: 'yellow', main: '#ffc61f', dark: '#c98600', light: '#ffe79a', paint: '#ffb800', name: 'الأصفر' }
  ];

  // Maze themes: floor tiles, wall colours, outside colour.
  var THEMES = [
    { name: 'ساحة الألعاب', f1: '#fff7e6', f2: '#fcefd2', dot: '#f3dfb8', wall: '#7c62ff', wtop: '#a894ff', wside: '#5238cf', bg: '#5a45d8', bg2: '#6a55e6' },
    { name: 'أرض الحلوى', f1: '#fff1f7', f2: '#ffe3ef', dot: '#ffcfe2', wall: '#ff5fa8', wtop: '#ff9ccb', wside: '#d63584', bg: '#e0458f', bg2: '#ec5a9e' },
    { name: 'شاطئ الرمال', f1: '#fff9df', f2: '#fcf0c4', dot: '#f2e2a4', wall: '#15b8b1', wtop: '#6fe0d9', wside: '#0c8b86', bg: '#10a4c8', bg2: '#21b4d6' },
    { name: 'مصنع الشوكولاتة', f1: '#fff5ea', f2: '#fbe8d5', dot: '#f2d6bb', wall: '#9a5a36', wtop: '#c98a5f', wside: '#6e3c20', bg: '#7a4527', bg2: '#8a5433' },
    { name: 'مختبر العلماء', f1: '#f4f7fd', f2: '#e7edf9', dot: '#d8e1f3', wall: '#4d5c8f', wtop: '#8391c4', wside: '#323e69', bg: '#2e3960', bg2: '#38446e' },
    { name: 'غروب البرتقال', f1: '#fffaf0', f2: '#fff0d8', dot: '#ffe0b3', wall: '#ff8a2b', wtop: '#ffb870', wside: '#d4600d', bg: '#e8661a', bg2: '#f27a2c' }
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
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }

  /* ------------------------------------------------------------ hats */
  // Hats are drawn upright (not rotated with the tank). (x, y) = top of turret.
  function drawHat(c, id, x, y, s, t) {
    if (!id) return;
    t = t || 0;
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
  // o: { x, y, a, pal, hat, sq (squash 0..1), recoil (0..1), tread, t, blink,
  //      dead (0..1), paint (killer colour), blobs, shield (s left), boost, flash, scale }
  function drawTank(c, o) {
    var pal = o.pal;
    var sc = o.scale == null ? 1 : o.scale;
    if (sc <= 0.01) return;
    c.save();
    c.translate(o.x, o.y);
    // shadow
    c.fillStyle = 'rgba(42,34,64,0.22)';
    c.beginPath(); c.ellipse(3, 7, 24 * sc, 19 * sc, 0, 0, Math.PI * 2); c.fill();
    c.scale(sc, sc);
    c.rotate(o.a);
    var sq = o.sq || 0;
    var dead = o.dead || 0;
    var sx = 1 - sq * 0.16 + dead * 0.1, sy = 1 + sq * 0.14 - dead * 0.12;
    c.scale(sx, sy);
    c.lineWidth = 3; c.strokeStyle = INK; c.lineJoin = 'round';

    // treads
    for (var sd = -1; sd <= 1; sd += 2) {
      rr(c, -21, sd * 15 - 6.5, 42, 13, 6);
      c.fillStyle = '#453d5e'; c.fill(); c.stroke();
      c.save();
      rr(c, -19, sd * 15 - 4.5, 38, 9, 4); c.clip();
      c.fillStyle = '#7b7398';
      var ph = ((o.tread || 0) % 7 + 7) % 7;
      for (var k = -1; k < 7; k++) { c.fillRect(-19 + k * 7 + ph, sd * 15 - 5, 3, 10); }
      c.restore();
    }
    // body
    rr(c, -18, -12.5, 36, 25, 8);
    c.fillStyle = pal.main; c.fill(); c.stroke();
    c.fillStyle = pal.light;
    c.globalAlpha = 0.75; rr(c, -14, -9.5, 20, 5, 2.5); c.fill(); c.globalAlpha = 1;
    c.fillStyle = pal.dark; c.globalAlpha = 0.5; rr(c, -14, 5.5, 28, 4, 2); c.fill(); c.globalAlpha = 1;

    // barrel (paint cannon)
    var bx = 4 - (o.recoil || 0) * 7;
    rr(c, bx, -5, 22, 10, 4);
    c.fillStyle = '#f4f1fb'; c.fill(); c.stroke();
    rr(c, bx + 15, -6.5, 9, 13, 3.5);
    c.fillStyle = pal.paint; c.fill(); c.stroke();
    c.fillStyle = pal.light; c.fillRect(bx + 4, -3, 9, 2);

    // turret
    circle(c, -2, 0, 12.5);
    c.fillStyle = pal.main; c.fill(); c.stroke();
    circle(c, -5.5, -4, 4.2); c.fillStyle = pal.light; c.globalAlpha = 0.8; c.fill(); c.globalAlpha = 1;

    // paint blobs when splatted
    if (dead > 0 && o.blobs) {
      c.fillStyle = o.paint;
      c.globalAlpha = Math.min(1, dead * 1.6);
      for (var b = 0; b < o.blobs.length; b += 3) { circle(c, o.blobs[b], o.blobs[b + 1], o.blobs[b + 2]); c.fill(); }
      c.globalAlpha = 1;
    }

    // eyes
    if (dead > 0.3) {
      c.strokeStyle = INK; c.lineWidth = 2;
      for (var e = -1; e <= 1; e += 2) {
        c.save(); c.translate(2, e * 5); c.rotate((o.t || 0) * 6 * e);
        c.beginPath();
        for (var q = 0; q < 14; q++) { var aa = q * 0.7, rad = q * 0.3; c.lineTo(Math.cos(aa) * rad, Math.sin(aa) * rad); }
        c.stroke(); c.restore();
      }
    } else {
      var bl = o.blink ? 0.2 : 1;
      for (var e2 = -1; e2 <= 1; e2 += 2) {
        c.save(); c.translate(2.5, e2 * 5.2); c.scale(bl, 1);
        c.beginPath(); c.ellipse(0, 0, 4.4, 4.8, 0, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.8; c.stroke();
        circle(c, 1.7, 0, 2.3); c.fillStyle = INK; c.fill();
        circle(c, 2.3, -1, 0.8); c.fillStyle = '#fff'; c.fill();
        c.restore();
      }
    }
    if (o.flash > 0) {
      c.globalAlpha = Math.min(1, o.flash);
      rr(c, -21, -21, 47, 42, 12); c.fillStyle = '#fff'; c.fill();
      c.globalAlpha = 1;
    }
    c.restore();

    // hat (upright)
    if (o.hat && dead < 0.5) drawHat(c, o.hat, o.x - 2 * Math.cos(o.a) * sc, o.y - 2 * Math.sin(o.a) * sc - 7 * sc, 0.9 * sc, o.t);

    // shield bubble
    if (o.shield > 0) {
      var pulse = 1 + Math.sin((o.t || 0) * 8) * 0.04;
      var fade = o.shield < 2 ? (Math.sin((o.t || 0) * 20) > 0 ? 1 : 0.35) : 1;
      c.save(); c.globalAlpha = fade;
      circle(c, o.x, o.y, 30 * pulse * sc);
      c.fillStyle = 'rgba(120,220,255,0.22)'; c.fill();
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.stroke();
      c.beginPath(); c.arc(o.x, o.y, 24 * pulse * sc, -2.6, -1.7); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
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
  function drawFloor(c, m, th) {
    var cs = m.cs;
    c.fillStyle = th.bg; c.fillRect(0, 0, 1280, 720);
    // diagonal stripes on the outside
    c.save();
    c.fillStyle = th.bg2;
    for (var i = -720; i < 1280; i += 48) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 24, 0); c.lineTo(i + 24 + 720, 720); c.lineTo(i + 720, 720); c.closePath(); c.fill();
    }
    c.restore();
    var x0 = m.ox, y0 = m.oy, w = m.cols * cs, h = m.rows * cs;
    // frame shadow
    rr(c, x0 - 12, y0 - 8, w + 24, h + 24, 18); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill();
    rr(c, x0 - 12, y0 - 12, w + 24, h + 24, 18); c.fillStyle = th.f1; c.fill();
    // tiles
    var hs = cs / 2;
    c.fillStyle = th.f2;
    for (var ty = 0; ty < m.rows * 2; ty++) {
      for (var tx = 0; tx < m.cols * 2; tx++) {
        if ((tx + ty) % 2) c.fillRect(x0 + tx * hs, y0 + ty * hs, hs, hs);
      }
    }
    c.fillStyle = th.dot;
    for (var cy = 0; cy < m.rows; cy++) {
      for (var cx = 0; cx < m.cols; cx++) {
        circle(c, x0 + cx * cs + cs / 2, y0 + cy * cs + cs / 2, 2.5); c.fill();
      }
    }
  }

  function drawWalls(c, m, th, shadowOnly) {
    var rects = m.rects, i, r;
    if (shadowOnly) {
      c.fillStyle = 'rgba(42,34,64,0.16)';
      for (i = 0; i < rects.length; i++) { r = rects[i]; rr(c, r.x1 + 3, r.y1 + 7, r.x2 - r.x1, r.y2 - r.y1, 5); c.fill(); }
      return;
    }
    // outline pass
    c.fillStyle = INK;
    for (i = 0; i < rects.length; i++) { r = rects[i]; rr(c, r.x1 - 2.5, r.y1 - 2.5, r.x2 - r.x1 + 5, r.y2 - r.y1 + 9, 7); c.fill(); }
    // side (3D) pass
    c.fillStyle = th.wside;
    for (i = 0; i < rects.length; i++) { r = rects[i]; rr(c, r.x1, r.y1 + 3, r.x2 - r.x1, r.y2 - r.y1 + 3, 5); c.fill(); }
    // top pass
    c.fillStyle = th.wall;
    for (i = 0; i < rects.length; i++) { r = rects[i]; rr(c, r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1, 5); c.fill(); }
    // highlight
    c.fillStyle = th.wtop;
    for (i = 0; i < rects.length; i++) {
      r = rects[i];
      var w = r.x2 - r.x1, h = r.y2 - r.y1;
      if (w > h) rr(c, r.x1 + 4, r.y1 + 2, w - 8, 3.5, 2);
      else rr(c, r.x1 + 2, r.y1 + 4, 3.5, h - 8, 2);
      c.fill();
    }
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
    drawTank: drawTank, drawHat: drawHat, drawSplat: drawSplat, drawBall: drawBall,
    drawCrate: drawCrate, drawPowerIcon: drawPowerIcon, drawFloor: drawFloor, drawWalls: drawWalls,
    drawTrophy: drawTrophy
  };
})();
