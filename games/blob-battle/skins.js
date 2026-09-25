/* Blob Battle — skins: textures and faces, all drawn in code. */
(function () {
  'use strict';
  var BB = window.BB = window.BB || {};
  var TAU = Math.PI * 2;
  var TEX = 256; // texture size

  function seeded(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }
  function circle(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function radial(c, inner, outer) {
    var g = c.createRadialGradient(TEX * 0.38, TEX * 0.34, TEX * 0.05, TEX / 2, TEX / 2, TEX * 0.62);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    c.fillStyle = g; c.fillRect(0, 0, TEX, TEX);
  }
  function blobShape(c, x, y, r, rnd, col) {
    c.fillStyle = col; c.beginPath();
    var n = 9, pts = [];
    for (var i = 0; i < n; i++) pts.push(r * (0.65 + rnd() * 0.55));
    for (i = 0; i <= n; i++) {
      var a = i / n * TAU, rr = pts[i % n];
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py); else {
        var am = (i - 0.5) / n * TAU, rm = (pts[i - 1] + rr) / 2 * 1.12;
        c.quadraticCurveTo(x + Math.cos(am) * rm, y + Math.sin(am) * rm, px, py);
      }
    }
    c.fill();
  }
  function star(c, x, y, r1, r2, n, rot) {
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = rot + i / (n * 2) * TAU, r = i % 2 ? r2 : r1;
      if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }
  function poly(c, x, y, r, n, rot) {
    c.beginPath();
    for (var i = 0; i < n; i++) { var a = rot + i / n * TAU; if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath();
  }
  var H = TEX / 2;

  /* ------------------------------------------------ texture painters */
  var P = {
    orange: function (c) {
      radial(c, '#ffc15a', '#ff8a00');
      var r = seeded(7);
      c.fillStyle = 'rgba(200,90,0,0.22)';
      for (var i = 0; i < 90; i++) { c.beginPath(); c.arc(r() * TEX, r() * TEX, 2 + r() * 2, 0, TAU); c.fill(); }
      c.fillStyle = '#3aa845'; c.beginPath(); c.ellipse(H + 18, 18, 26, 11, -0.4, 0, TAU); c.fill();
      circle(c, H, 12, 8, '#6b4a1e');
    },
    lemon: function (c) {
      radial(c, '#fff58a', '#ffd21a');
      var r = seeded(3);
      c.fillStyle = 'rgba(210,160,0,0.22)';
      for (var i = 0; i < 80; i++) { c.beginPath(); c.arc(r() * TEX, r() * TEX, 2 + r() * 2, 0, TAU); c.fill(); }
    },
    soccer: function (c) {
      radial(c, '#ffffff', '#d9dde6');
      c.fillStyle = '#23263a'; c.strokeStyle = '#23263a'; c.lineWidth = 6;
      poly(c, H, H, 40, 5, -Math.PI / 2); c.fill();
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + i / 5 * TAU;
        var x1 = H + Math.cos(a) * 40, y1 = H + Math.sin(a) * 40;
        var x2 = H + Math.cos(a) * 92, y2 = H + Math.sin(a) * 92;
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        poly(c, H + Math.cos(a) * 128, H + Math.sin(a) * 128, 40, 5, a + Math.PI); c.fill();
      }
    },
    basket: function (c) {
      radial(c, '#ffa24d', '#e0620c');
      c.strokeStyle = '#3a1d0a'; c.lineWidth = 7;
      c.beginPath(); c.moveTo(H, 0); c.lineTo(H, TEX); c.moveTo(0, H); c.lineTo(TEX, H); c.stroke();
      c.beginPath(); c.arc(-40, H, 150, -0.9, 0.9); c.stroke();
      c.beginPath(); c.arc(TEX + 40, H, 150, Math.PI - 0.9, Math.PI + 0.9); c.stroke();
      var r = seeded(11); c.fillStyle = 'rgba(80,30,0,0.18)';
      for (var i = 0; i < 160; i++) c.fillRect(r() * TEX, r() * TEX, 3, 3);
    },
    tennis: function (c) {
      radial(c, '#efff7a', '#b9dc12');
      c.strokeStyle = '#ffffff'; c.lineWidth = 11;
      c.beginPath(); c.arc(-60, H, 140, -1, 1); c.stroke();
      c.beginPath(); c.arc(TEX + 60, H, 140, Math.PI - 1, Math.PI + 1); c.stroke();
    },
    beach: function (c) {
      var cols = ['#ff4d5e', '#ffffff', '#2f8cff', '#ffffff', '#ffd000', '#ffffff', '#2ecc71', '#ffffff'];
      for (var i = 0; i < 8; i++) {
        c.fillStyle = cols[i]; c.beginPath(); c.moveTo(H, H);
        c.arc(H, H, TEX, i / 8 * TAU, (i + 1) / 8 * TAU); c.closePath(); c.fill();
      }
      circle(c, H, H, 26, '#ffffff'); circle(c, H, H, 14, '#ff4d5e');
    },
    volley: function (c) {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, TEX, TEX);
      c.lineWidth = 7; c.strokeStyle = '#1e3a8a';
      var cols = ['#ffd000', '#2f6dff', '#ffffff'];
      for (var i = 0; i < 3; i++) {
        var a = i / 3 * TAU - Math.PI / 2;
        c.save(); c.translate(H, H); c.rotate(a);
        c.fillStyle = cols[i];
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(80, -40, 150, -10); c.lineTo(150, 110); c.quadraticCurveTo(60, 60, 0, 0); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(20, 30); c.quadraticCurveTo(90, 50, 150, 40); c.stroke();
        c.restore();
      }
    },
    baseball: function (c) {
      radial(c, '#ffffff', '#e4e0d6');
      c.strokeStyle = '#e22b2b'; c.lineWidth = 5;
      c.beginPath(); c.arc(-50, H, 130, -0.95, 0.95); c.stroke();
      c.beginPath(); c.arc(TEX + 50, H, 130, Math.PI - 0.95, Math.PI + 0.95); c.stroke();
      c.lineWidth = 3;
      for (var k = 0; k < 2; k++) {
        var cx = k ? TEX + 50 : -50, base = k ? Math.PI : 0;
        for (var a = -0.85; a <= 0.86; a += 0.12) {
          var aa = base + a, x = cx + Math.cos(aa) * 130, y = H + Math.sin(aa) * 130;
          var tx = -Math.sin(aa) * 9, ty = Math.cos(aa) * 9, nx = Math.cos(aa) * 9, ny = Math.sin(aa) * 9;
          c.beginPath(); c.moveTo(x - nx + tx * 0.3, y - ny + ty * 0.3); c.lineTo(x + nx - tx * 0.3, y + ny - ty * 0.3); c.stroke();
        }
      }
    },
    earth: function (c) {
      radial(c, '#4fc3ff', '#1565d8');
      var r = seeded(21);
      for (var i = 0; i < 6; i++) blobShape(c, r() * TEX, r() * TEX, 30 + r() * 30, r, i % 2 ? '#3fc15a' : '#56d46a');
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (i = 0; i < 5; i++) { c.beginPath(); c.ellipse(r() * TEX, r() * TEX, 30 + r() * 20, 7, 0, 0, TAU); c.fill(); }
    },
    moon: function (c) {
      radial(c, '#f2f2f7', '#a9adbf');
      var r = seeded(5);
      for (var i = 0; i < 14; i++) {
        var x = r() * TEX, y = r() * TEX, rr = 8 + r() * 22;
        circle(c, x, y, rr, 'rgba(110,115,140,0.35)');
        circle(c, x + rr * 0.15, y + rr * 0.15, rr * 0.75, 'rgba(160,165,185,0.5)');
      }
    },
    mars: function (c) {
      radial(c, '#ff8a5c', '#c2410c');
      var r = seeded(9);
      for (var i = 0; i < 5; i++) blobShape(c, r() * TEX, r() * TEX, 22 + r() * 26, r, 'rgba(140,40,10,0.35)');
      for (i = 0; i < 10; i++) circle(c, r() * TEX, r() * TEX, 5 + r() * 10, 'rgba(255,200,170,0.35)');
      c.fillStyle = '#fff4ee'; c.beginPath(); c.ellipse(H, 6, 60, 22, 0, 0, TAU); c.fill();
    },
    saturn: function (c) {
      radial(c, '#ffe7a8', '#e7a83f');
      c.fillStyle = 'rgba(200,120,40,0.35)';
      for (var y = 20; y < TEX; y += 46) c.fillRect(0, y, TEX, 16);
      c.save(); c.translate(H, H); c.rotate(-0.35);
      c.strokeStyle = '#a0632a'; c.lineWidth = 16; c.beginPath(); c.ellipse(0, 0, 150, 38, 0, 0, TAU); c.stroke();
      c.strokeStyle = '#ffe9c0'; c.lineWidth = 7; c.beginPath(); c.ellipse(0, 0, 150, 38, 0, 0, TAU); c.stroke();
      c.restore();
    },
    jupiter: function (c) {
      var cols = ['#f6d7b0', '#d9955b', '#f3e2c7', '#c7773e', '#f6d7b0', '#e0a472', '#f3e2c7'];
      for (var i = 0; i < cols.length; i++) {
        c.fillStyle = cols[i]; c.beginPath();
        var y0 = i * TEX / cols.length;
        c.moveTo(0, y0);
        for (var x = 0; x <= TEX; x += 16) c.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 5);
        c.lineTo(TEX, TEX); c.lineTo(0, TEX); c.fill();
      }
      c.fillStyle = '#c0392b'; c.beginPath(); c.ellipse(H + 50, H + 40, 28, 16, 0, 0, TAU); c.fill();
      c.fillStyle = '#e8705a'; c.beginPath(); c.ellipse(H + 50, H + 40, 16, 8, 0, 0, TAU); c.fill();
    },
    ice: function (c) {
      radial(c, '#c8f4ff', '#3aa5e0');
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (var y = 30; y < TEX; y += 50) { c.beginPath(); c.ellipse(H, y, 150, 9, 0, 0, TAU); c.fill(); }
    },
    sun: function (c) {
      var g = c.createRadialGradient(H, H, 10, H, H, H * 1.3);
      g.addColorStop(0, '#fff7a0'); g.addColorStop(0.55, '#ffcf1f'); g.addColorStop(1, '#ff7a00');
      c.fillStyle = g; c.fillRect(0, 0, TEX, TEX);
      c.strokeStyle = 'rgba(255,140,0,0.5)'; c.lineWidth = 6;
      for (var i = 0; i < 16; i++) { c.save(); c.translate(H, H); c.rotate(i / 16 * TAU); c.beginPath(); c.moveTo(90, 0); c.quadraticCurveTo(110, 12, 130, 0); c.stroke(); c.restore(); }
    },
    galaxy: function (c) {
      var g = c.createRadialGradient(H, H, 5, H, H, H * 1.4);
      g.addColorStop(0, '#ff9ae8'); g.addColorStop(0.3, '#7b3fe4'); g.addColorStop(1, '#170b4a');
      c.fillStyle = g; c.fillRect(0, 0, TEX, TEX);
      c.strokeStyle = 'rgba(255,220,255,0.35)'; c.lineWidth = 10;
      for (var k = 0; k < 2; k++) {
        c.beginPath();
        for (var t = 0; t < 4; t += 0.05) { var rr = 8 + t * 32, a = t * 1.9 + k * Math.PI; var x = H + Math.cos(a) * rr, y = H + Math.sin(a) * rr; if (t === 0) c.moveTo(x, y); else c.lineTo(x, y); }
        c.stroke();
      }
      var r = seeded(13);
      for (var i = 0; i < 60; i++) circle(c, r() * TEX, r() * TEX, 0.8 + r() * 2.2, '#ffffff');
      c.fillStyle = '#fff6a8'; for (i = 0; i < 5; i++) { star(c, r() * TEX, r() * TEX, 8, 3, 4, 0); c.fill(); }
    },
    rainbow: function (c) {
      var cols = ['#ff4d6d', '#ff9f1c', '#ffe03a', '#3ddc84', '#2fb5ff', '#7b61ff', '#ff5ce1'];
      var h = TEX / cols.length;
      for (var i = 0; i < cols.length; i++) { c.fillStyle = cols[i]; c.fillRect(0, i * h, TEX, h + 1); }
      c.fillStyle = 'rgba(255,255,255,0.25)';
      for (i = 0; i < cols.length; i++) c.fillRect(0, i * h, TEX, h * 0.3);
    },
    golden: function (c) {
      var g = c.createRadialGradient(TEX * 0.35, TEX * 0.3, 5, H, H, H * 1.3);
      g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, '#ffd84d'); g.addColorStop(1, '#c78a00');
      c.fillStyle = g; c.fillRect(0, 0, TEX, TEX);
      var r = seeded(17); c.fillStyle = '#ffffff';
      for (var i = 0; i < 9; i++) { star(c, r() * TEX, r() * TEX, 10 + r() * 8, 3, 4, 0); c.fill(); }
    },
    watermelon: function (c) {
      c.fillStyle = '#5fcf4d'; c.fillRect(0, 0, TEX, TEX);
      c.fillStyle = '#1f7a2e';
      for (var x = -20; x < TEX + 20; x += 42) {
        c.beginPath(); c.moveTo(x, 0);
        for (var y = 0; y <= TEX; y += 16) c.lineTo(x + Math.sin(y * 0.08) * 7, y);
        for (y = TEX; y >= 0; y -= 16) c.lineTo(x + 17 + Math.sin(y * 0.08 + 1) * 7, y);
        c.fill();
      }
    },
    kiwi: function (c) {
      c.fillStyle = '#7a5230'; c.fillRect(0, 0, TEX, TEX);
      circle(c, H, H, 120, '#8fd13b');
      circle(c, H, H, 104, '#76c22a');
      c.strokeStyle = 'rgba(210,245,150,0.6)'; c.lineWidth = 3;
      for (var i = 0; i < 40; i++) { var a = i / 40 * TAU; c.beginPath(); c.moveTo(H + Math.cos(a) * 34, H + Math.sin(a) * 34); c.lineTo(H + Math.cos(a) * 100, H + Math.sin(a) * 100); c.stroke(); }
      circle(c, H, H, 34, '#f2f7c8');
      c.fillStyle = '#1b1b1b';
      for (i = 0; i < 18; i++) { var b = i / 18 * TAU; c.beginPath(); c.ellipse(H + Math.cos(b) * 48, H + Math.sin(b) * 48, 6, 3, b, 0, TAU); c.fill(); }
    },
    strawberry: function (c) {
      radial(c, '#ff6b7a', '#d6192f');
      c.fillStyle = '#ffe36b';
      for (var y = 70; y < TEX; y += 30) for (var x = (y / 30 % 2) * 15; x < TEX; x += 30) { c.beginPath(); c.ellipse(x, y, 3.5, 6, 0, 0, TAU); c.fill(); }
      c.fillStyle = '#2fae3f';
      for (var i = 0; i < 6; i++) { c.save(); c.translate(H, 20); c.rotate(-Math.PI / 2 + (i - 2.5) * 0.45); c.beginPath(); c.ellipse(30, 0, 34, 12, 0, 0, TAU); c.fill(); c.restore(); }
    },
    donut: function (c) {
      c.fillStyle = '#e8a55a'; c.fillRect(0, 0, TEX, TEX);
      c.fillStyle = '#ff8fcf'; c.beginPath();
      for (var i = 0; i <= 40; i++) { var a = i / 40 * TAU, rr = 112 + Math.sin(i * 1.7) * 9; if (i === 0) c.moveTo(H + Math.cos(a) * rr, H + Math.sin(a) * rr); else c.lineTo(H + Math.cos(a) * rr, H + Math.sin(a) * rr); }
      c.fill();
      var r = seeded(29), cols = ['#ffffff', '#ffe03a', '#3ddc84', '#2fb5ff', '#7b61ff'];
      c.lineWidth = 6; c.lineCap = 'round';
      for (i = 0; i < 40; i++) {
        var aa = r() * TAU, d = 45 + r() * 60, x = H + Math.cos(aa) * d, y = H + Math.sin(aa) * d, rot = r() * TAU;
        c.strokeStyle = cols[i % cols.length]; c.beginPath(); c.moveTo(x - Math.cos(rot) * 6, y - Math.sin(rot) * 6); c.lineTo(x + Math.cos(rot) * 6, y + Math.sin(rot) * 6); c.stroke();
      }
      circle(c, H, H, 30, '#b8783a'); circle(c, H, H, 24, '#6a3e17');
    },
    cookie: function (c) {
      radial(c, '#f3c27a', '#c98636');
      var r = seeded(31);
      for (var i = 0; i < 16; i++) blobShape(c, r() * TEX, r() * TEX, 8 + r() * 6, r, '#5a3212');
    },
    polka: function (c) {
      c.fillStyle = '#ff6fb5'; c.fillRect(0, 0, TEX, TEX);
      for (var y = 0; y < TEX + 40; y += 48) for (var x = (y / 48 % 2) * 24; x < TEX + 40; x += 48) circle(c, x, y, 12, '#ffffff');
    },
    candy: function (c) {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, TEX, TEX);
      c.fillStyle = '#ff3b5c';
      for (var k = 0; k < 6; k++) {
        c.beginPath();
        for (var t = 0; t <= 1.001; t += 0.02) { var a = k / 6 * TAU + t * 5, rr = t * 190; c.lineTo(H + Math.cos(a) * rr, H + Math.sin(a) * rr); }
        for (t = 1; t >= 0; t -= 0.02) { var a2 = k / 6 * TAU + t * 5 + 0.5, rr2 = t * 190; c.lineTo(H + Math.cos(a2) * rr2, H + Math.sin(a2) * rr2); }
        c.fill();
      }
    },
    lava: function (c) {
      c.fillStyle = '#5a1a12'; c.fillRect(0, 0, TEX, TEX);
      var r = seeded(41);
      c.strokeStyle = '#ff7a1a'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
      for (var i = 0; i < 9; i++) {
        var x = r() * TEX, y = r() * TEX; c.beginPath(); c.moveTo(x, y);
        for (var j = 0; j < 4; j++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; c.lineTo(x, y); }
        c.stroke();
      }
      c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.stroke();
    },
    cactus: function (c) {
      radial(c, '#7ee06a', '#2f9a3a');
      c.strokeStyle = 'rgba(20,90,30,0.45)'; c.lineWidth = 8;
      for (var x = 20; x < TEX; x += 42) { c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + (x - H) * 0.25, H, x, TEX); c.stroke(); }
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.5;
      var r = seeded(51);
      for (var i = 0; i < 30; i++) { var px = r() * TEX, py = r() * TEX; c.beginPath(); c.moveTo(px - 5, py - 5); c.lineTo(px + 5, py + 5); c.moveTo(px + 5, py - 5); c.lineTo(px - 5, py + 5); c.stroke(); }
      circle(c, H + 60, 20, 16, '#ff6fb5'); circle(c, H + 60, 20, 6, '#ffe03a');
    },
    tabby: function (c) {
      radial(c, '#ffc27a', '#f28a1e');
      c.fillStyle = 'rgba(170,70,0,0.55)';
      for (var i = -2; i < 3; i++) { c.beginPath(); c.ellipse(H + i * 44, 10, 10, 50, i * 0.15, 0, TAU); c.fill(); }
      c.beginPath(); c.ellipse(20, H + 20, 40, 9, 0.2, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(TEX - 20, H + 20, 40, 9, -0.2, 0, TAU); c.fill();
      c.fillStyle = '#fff3e0'; c.beginPath(); c.ellipse(H, H + 70, 70, 50, 0, 0, TAU); c.fill();
    },
    metal: function (c) {
      var g = c.createLinearGradient(0, 0, TEX, TEX); g.addColorStop(0, '#dfe6ef'); g.addColorStop(1, '#8a97a8');
      c.fillStyle = g; c.fillRect(0, 0, TEX, TEX);
      c.strokeStyle = 'rgba(60,70,90,0.35)'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(0, 60); c.lineTo(TEX, 60); c.moveTo(0, 200); c.lineTo(TEX, 200); c.stroke();
      for (var x = 20; x < TEX; x += 50) { circle(c, x, 45, 5, '#6b7688'); circle(c, x, 215, 5, '#6b7688'); }
      circle(c, H, 18, 10, '#ff4d5e');
    },
    alien: function (c) { radial(c, '#b6ff7a', '#3fcf4f'); var r = seeded(61); for (var i = 0; i < 12; i++) circle(c, r() * TEX, r() * TEX, 4 + r() * 8, 'rgba(40,140,50,0.3)'); },
    fuzzy: function (c) {
      radial(c, '#c79bff', '#7b3fe4');
      var r = seeded(71); c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 3;
      for (var i = 0; i < 160; i++) { var x = r() * TEX, y = r() * TEX, a = r() * TAU; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); c.stroke(); }
    },
    panda: function (c) { radial(c, '#ffffff', '#dde2ea'); circle(c, 40, 20, 36, '#26262e'); circle(c, TEX - 40, 20, 36, '#26262e'); },
    checker: function (c) {
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#2fb5ff' : '#ffe03a'; c.fillRect(x * 32, y * 32, 32, 32); }
    }
  };

  /* ------------------------------------------------ skin list
     unlock: {t:'free'} | {t:'mass', v} (best mass in any arena) | {t:'stat', k, v, txt}  */
  BB.SKINS = [
    { id: 'mint', name: 'نعناع', color: '#2ed3b7', face: 'eyes', unlock: { t: 'free' } },
    { id: 'berry', name: 'توتة', color: '#ff5ca8', face: 'eyes', unlock: { t: 'free' } },
    { id: 'sunny', name: 'مبتسم', color: '#ffd23f', face: 'smile', unlock: { t: 'free' } },
    { id: 'sky', name: 'سماء', color: '#3aa0ff', face: 'eyes', unlock: { t: 'free' } },
    { id: 'orange', name: 'برتقالة', color: '#ff9a1a', face: 'eyes', tex: 'orange', unlock: { t: 'mass', v: 60 } },
    { id: 'soccer', name: 'كرة القدم', color: '#e9ecf2', face: 'eyes', tex: 'soccer', roll: 1, unlock: { t: 'mass', v: 100 } },
    { id: 'cool', name: 'نظارة شمسية', color: '#ffc21a', face: 'cool', unlock: { t: 'mass', v: 150 } },
    { id: 'earth', name: 'الأرض', color: '#2a86ea', face: 'eyes', tex: 'earth', roll: 1, unlock: { t: 'mass', v: 200 } },
    { id: 'watermelon', name: 'بطيخة', color: '#43b73a', face: 'eyes', tex: 'watermelon', unlock: { t: 'mass', v: 250 } },
    { id: 'basket', name: 'كرة السلة', color: '#f07a1c', face: 'eyes', tex: 'basket', roll: 1, unlock: { t: 'mass', v: 300 } },
    { id: 'polka', name: 'منقّط', color: '#ff6fb5', face: 'eyes', tex: 'polka', unlock: { t: 'mass', v: 350 } },
    { id: 'tongue', name: 'مشاغب', color: '#ffc21a', face: 'tongue', unlock: { t: 'mass', v: 400 } },
    { id: 'saturn', name: 'زحل', color: '#e7b45a', face: 'eyes', tex: 'saturn', unlock: { t: 'mass', v: 500 } },
    { id: 'kiwi', name: 'كيوي', color: '#7a5230', face: 'none', tex: 'kiwi', roll: 1, unlock: { t: 'mass', v: 600 } },
    { id: 'tennis', name: 'كرة التنس', color: '#c9e82a', face: 'eyes', tex: 'tennis', roll: 1, unlock: { t: 'mass', v: 750 } },
    { id: 'starry', name: 'عيون النجوم', color: '#ffc21a', face: 'star', unlock: { t: 'mass', v: 900 } },
    { id: 'moon', name: 'القمر', color: '#c8ccd8', face: 'sleepy', tex: 'moon', roll: 1, unlock: { t: 'mass', v: 1000 } },
    { id: 'donut', name: 'دونات', color: '#e8a55a', face: 'none', tex: 'donut', roll: 1, unlock: { t: 'mass', v: 1250 } },
    { id: 'beach', name: 'كرة الشاطئ', color: '#ff4d5e', face: 'none', tex: 'beach', roll: 1, unlock: { t: 'mass', v: 1500 } },
    { id: 'robot', name: 'روبوت', color: '#b9c3d0', face: 'robot', tex: 'metal', unlock: { t: 'mass', v: 1750 } },
    { id: 'jupiter', name: 'المشتري', color: '#e0a472', face: 'eyes', tex: 'jupiter', roll: 1, unlock: { t: 'mass', v: 2000 } },
    { id: 'galaxy', name: 'مجرّة', color: '#6a35d8', face: 'star', tex: 'galaxy', roll: 1, unlock: { t: 'mass', v: 2500 } },
    { id: 'sun', name: 'الشمس', color: '#ffb21a', face: 'cool', tex: 'sun', unlock: { t: 'mass', v: 3000 } },
    { id: 'rainbow', name: 'قوس قزح', color: '#ff9f1c', face: 'smile2', tex: 'rainbow', unlock: { t: 'mass', v: 4000 } },
    { id: 'golden', name: 'الذهبي', color: '#f2b705', face: 'cool', tex: 'golden', unlock: { t: 'mass', v: 5000 } },
    { id: 'lemon', name: 'ليمونة', color: '#ffd21a', face: 'eyes', tex: 'lemon', unlock: { t: 'stat', k: 'rounds', v: 3, txt: 'العب 3 جولات' } },
    { id: 'cat', name: 'قطقوط', color: '#f28a1e', face: 'cat', tex: 'tabby', unlock: { t: 'stat', k: 'roundEaten', v: 5, txt: 'التهم 5 كرات في جولة واحدة' } },
    { id: 'cactus', name: 'صبّار', color: '#3fae45', face: 'eyes', tex: 'cactus', unlock: { t: 'stat', k: 'virusPops', v: 1, txt: 'انفجر على شجيرة شائكة' } },
    { id: 'volley', name: 'الكرة الطائرة', color: '#f2f2f2', face: 'eyes', tex: 'volley', roll: 1, unlock: { t: 'stat', k: 'splitEats', v: 1, txt: 'التهم كرة بالانقسام (مسافة)' } },
    { id: 'strawberry', name: 'فراولة', color: '#e8283f', face: 'eyes', tex: 'strawberry', unlock: { t: 'stat', k: 'rounds', v: 10, txt: 'العب 10 جولات' } },
    { id: 'baseball', name: 'البيسبول', color: '#eeeae0', face: 'eyes', tex: 'baseball', roll: 1, unlock: { t: 'stat', k: 'maxTime', v: 180, txt: 'ابقَ حيًّا 3 دقائق' } },
    { id: 'mars', name: 'المريخ', color: '#e2582a', face: 'eyes', tex: 'mars', roll: 1, unlock: { t: 'stat', k: 'kings', v: 1, txt: 'كن الأول في الترتيب' } },
    { id: 'monster', name: 'وحش لطيف', color: '#9b5cf0', face: 'monster', tex: 'fuzzy', unlock: { t: 'stat', k: 'eatenTotal', v: 50, txt: 'التهم 50 كرة (المجموع)' } },
    { id: 'alien', name: 'فضائي', color: '#5ad65a', face: 'alien', tex: 'alien', unlock: { t: 'stat', k: 'virusShots', v: 1, txt: 'أطعم شجيرة حتى تنقسم (W)' } },
    { id: 'cookie', name: 'كعكة', color: '#d9953f', face: 'eyes', tex: 'cookie', unlock: { t: 'stat', k: 'pellets', v: 3000, txt: 'كُل 3000 حبّة (المجموع)' } },
    { id: 'ice', name: 'كوكب الجليد', color: '#58b8ea', face: 'eyes', tex: 'ice', roll: 1, unlock: { t: 'stat', k: 'arena2', v: 1, txt: 'افتح ساحة المحيط' } },
    { id: 'checker', name: 'شطرنج', color: '#2fb5ff', face: 'eyes', tex: 'checker', roll: 1, unlock: { t: 'stat', k: 'maxTime', v: 420, txt: 'ابقَ حيًّا 7 دقائق' } },
    { id: 'lava', name: 'حِمَم', color: '#8a2414', face: 'eyes', tex: 'lava', unlock: { t: 'stat', k: 'arena3', v: 1, txt: 'افتح ساحة البركان' } },
    { id: 'candy', name: 'مصّاصة', color: '#ff3b5c', face: 'eyes', tex: 'candy', roll: 1, unlock: { t: 'stat', k: 'kingTime', v: 60, txt: 'ابقَ الأول لمدة دقيقة' } },
    { id: 'panda', name: 'باندا', color: '#e8ecf2', face: 'panda', tex: 'panda', unlock: { t: 'stat', k: 'bestA3', v: 1000, txt: 'اوصل إلى 1000 في ساحة البركان' } }
  ];
  BB.SKIN_BY_ID = {};
  BB.SKINS.forEach(function (s, i) { s.index = i; BB.SKIN_BY_ID[s.id] = s; });

  // Plain colours for bots.
  BB.BOT_COLORS = ['#2ed3b7', '#ff5ca8', '#3aa0ff', '#ff8a1a', '#8e5cff', '#3ddc84', '#ff4d5e', '#ffc21a', '#12b5cb', '#e056fd', '#6ab04c', '#f368e0'];

  /* ------------------------------------------------ colour helpers */
  function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function shade(h, f) {
    var c = hexToRgb(h);
    for (var i = 0; i < 3; i++) c[i] = Math.round(f < 0 ? c[i] * (1 + f) : c[i] + (255 - c[i]) * f);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  BB.shade = shade;
  var darkCache = {}, lightCache = {};
  BB.dark = function (h) { return darkCache[h] || (darkCache[h] = shade(h, -0.32)); };
  BB.light = function (h) { return lightCache[h] || (lightCache[h] = shade(h, 0.35)); };

  /* ------------------------------------------------ texture cache */
  var texCache = {};
  BB.texture = function (name) {
    if (!name || !P[name]) return null;
    if (texCache[name]) return texCache[name];
    var cv = document.createElement('canvas'); cv.width = cv.height = TEX;
    var c = cv.getContext('2d');
    try { P[name](c); } catch (e) { /* keep blank */ }
    texCache[name] = cv;
    return cv;
  };
  BB.TEX = TEX;

  /* ------------------------------------------------ faces (drawn live)
     ctx at blob centre, unit radius r. lx,ly = look direction (-1..1).
     st = { blink 0..1, mouth 0..1 (open when eating), t } */
  function eyePair(c, r, lx, ly, st, size, sep, yOff, pupil) {
    var ex = r * sep, ey = r * yOff, er = r * size;
    var ox = lx * er * 0.45, oy = ly * er * 0.45;
    for (var s = -1; s <= 1; s += 2) {
      var x = s * ex + lx * r * 0.08, y = ey + ly * r * 0.08;
      if (st.blink > 0.5) {
        c.strokeStyle = '#23263a'; c.lineWidth = Math.max(1.5, r * 0.05); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - er * 0.8, y); c.quadraticCurveTo(x, y + er * 0.6, x + er * 0.8, y); c.stroke();
        continue;
      }
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, y, er, er * 1.1, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(35,38,58,0.9)'; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
      c.fillStyle = '#23263a'; c.beginPath(); c.arc(x + ox, y + oy, er * (pupil || 0.55), 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + ox - er * 0.18, y + oy - er * 0.22, er * 0.18, 0, TAU); c.fill();
    }
  }
  function mouthSmile(c, r, lx, ly, st, w, y0, col) {
    var x = lx * r * 0.08, y = r * y0 + ly * r * 0.06;
    c.lineCap = 'round';
    if (st.mouth > 0.05) {
      c.fillStyle = '#5a1030';
      c.beginPath(); c.ellipse(x, y + r * 0.04, r * w * 0.55, r * (0.06 + 0.16 * st.mouth), 0, 0, TAU); c.fill();
      return;
    }
    c.strokeStyle = col || '#23263a'; c.lineWidth = Math.max(1.5, r * 0.055);
    c.beginPath(); c.arc(x, y - r * w * 0.6, r * w, 0.35 * Math.PI, 0.65 * Math.PI); c.stroke();
  }
  function cheeks(c, r, lx, ly) {
    c.fillStyle = 'rgba(255,90,120,0.35)';
    c.beginPath(); c.ellipse(-r * 0.52 + lx * r * 0.06, r * 0.18, r * 0.13, r * 0.08, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(r * 0.52 + lx * r * 0.06, r * 0.18, r * 0.13, r * 0.08, 0, 0, TAU); c.fill();
  }

  BB.drawFace = function (c, face, r, lx, ly, st) {
    if (face === 'none') return;
    var ox = lx * r * 0.08, oy = ly * r * 0.08;
    switch (face) {
      case 'eyes':
        eyePair(c, r, lx, ly, st, 0.2, 0.3, -0.12);
        mouthSmile(c, r, lx, ly, st, 0.2, 0.28);
        break;
      case 'smile': case 'smile2':
        if (st.blink > 0.5) eyePair(c, r, lx, ly, st, 0.12, 0.3, -0.15);
        else {
          c.fillStyle = '#3a2a10';
          c.beginPath(); c.ellipse(-r * 0.28 + ox, -r * 0.15 + oy, r * 0.08, r * 0.13, 0, 0, TAU); c.fill();
          c.beginPath(); c.ellipse(r * 0.28 + ox, -r * 0.15 + oy, r * 0.08, r * 0.13, 0, 0, TAU); c.fill();
        }
        cheeks(c, r, lx, ly);
        if (st.mouth > 0.05) mouthSmile(c, r, lx, ly, st, 0.3, 0.3);
        else {
          c.fillStyle = '#5a1030'; c.beginPath(); c.arc(ox, r * 0.12 + oy, r * 0.3, 0.1, Math.PI - 0.1); c.closePath(); c.fill();
          c.fillStyle = '#ff6b8a'; c.beginPath(); c.ellipse(ox, r * 0.33 + oy, r * 0.14, r * 0.07, 0, Math.PI, TAU); c.fill();
        }
        break;
      case 'cool':
        c.fillStyle = '#1b1d2e';
        c.fillRect(-r * 0.62 + ox, -r * 0.24 + oy, r * 1.24, r * 0.08);
        c.beginPath(); c.ellipse(-r * 0.3 + ox, -r * 0.12 + oy, r * 0.25, r * 0.17, 0, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(r * 0.3 + ox, -r * 0.12 + oy, r * 0.25, r * 0.17, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.beginPath(); c.ellipse(-r * 0.38 + ox, -r * 0.17 + oy, r * 0.08, r * 0.04, -0.4, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(r * 0.22 + ox, -r * 0.17 + oy, r * 0.08, r * 0.04, -0.4, 0, TAU); c.fill();
        if (st.mouth > 0.05) mouthSmile(c, r, lx, ly, st, 0.25, 0.3);
        else { c.strokeStyle = '#3a2a10'; c.lineWidth = Math.max(1.5, r * 0.06); c.lineCap = 'round'; c.beginPath(); c.arc(ox + r * 0.05, r * 0.1 + oy, r * 0.25, 0.2 * Math.PI, 0.7 * Math.PI); c.stroke(); }
        break;
      case 'tongue':
        c.strokeStyle = '#3a2a10'; c.lineWidth = Math.max(1.5, r * 0.06); c.lineCap = 'round';
        c.beginPath(); c.moveTo(-r * 0.4 + ox, -r * 0.22 + oy); c.lineTo(-r * 0.22 + ox, -r * 0.14 + oy); c.lineTo(-r * 0.4 + ox, -r * 0.06 + oy); c.stroke();
        c.fillStyle = '#3a2a10'; c.beginPath(); c.ellipse(r * 0.28 + ox, -r * 0.14 + oy, r * 0.08, r * 0.13, 0, 0, TAU); c.fill();
        c.fillStyle = '#5a1030'; c.beginPath(); c.arc(ox, r * 0.1 + oy, r * 0.3, 0.05, Math.PI - 0.05); c.closePath(); c.fill();
        c.fillStyle = '#ff5c8a'; c.beginPath(); c.ellipse(ox + r * 0.08, r * 0.38 + oy + st.mouth * r * 0.05, r * 0.14, r * 0.17, 0, 0, TAU); c.fill();
        c.strokeStyle = '#d93a6a'; c.lineWidth = Math.max(1, r * 0.025); c.beginPath(); c.moveTo(ox + r * 0.08, r * 0.3 + oy); c.lineTo(ox + r * 0.08, r * 0.46 + oy); c.stroke();
        cheeks(c, r, lx, ly);
        break;
      case 'star':
        c.fillStyle = '#ffffff';
        star(c, -r * 0.28 + ox, -r * 0.14 + oy, r * 0.2, r * 0.09, 5, -Math.PI / 2); c.fill();
        star(c, r * 0.28 + ox, -r * 0.14 + oy, r * 0.2, r * 0.09, 5, -Math.PI / 2); c.fill();
        c.fillStyle = '#ff9d00';
        star(c, -r * 0.28 + ox, -r * 0.14 + oy, r * 0.14, r * 0.06, 5, -Math.PI / 2); c.fill();
        star(c, r * 0.28 + ox, -r * 0.14 + oy, r * 0.14, r * 0.06, 5, -Math.PI / 2); c.fill();
        if (st.mouth > 0.05) mouthSmile(c, r, lx, ly, st, 0.25, 0.3);
        else { c.fillStyle = '#5a1030'; c.beginPath(); c.arc(ox, r * 0.14 + oy, r * 0.22, 0.05, Math.PI - 0.05); c.closePath(); c.fill(); }
        break;
      case 'sleepy':
        c.strokeStyle = '#3a3f5a'; c.lineWidth = Math.max(1.5, r * 0.05); c.lineCap = 'round';
        c.beginPath(); c.arc(-r * 0.28 + ox, -r * 0.16 + oy, r * 0.12, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        c.beginPath(); c.arc(r * 0.28 + ox, -r * 0.16 + oy, r * 0.12, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        c.fillStyle = '#5a3a5a'; c.beginPath(); c.ellipse(ox, r * 0.2 + oy, r * (0.06 + st.mouth * 0.1), r * (0.07 + st.mouth * 0.12), 0, 0, TAU); c.fill();
        cheeks(c, r, lx, ly);
        break;
      case 'cat':
        if (st.blink > 0.5) eyePair(c, r, lx, ly, st, 0.16, 0.3, -0.14);
        else for (var s = -1; s <= 1; s += 2) {
          var ex = s * r * 0.3 + ox, ey = -r * 0.14 + oy;
          c.fillStyle = '#b6f25a'; c.beginPath(); c.ellipse(ex, ey, r * 0.15, r * 0.17, 0, 0, TAU); c.fill();
          c.strokeStyle = '#23263a'; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
          c.fillStyle = '#23263a'; c.beginPath(); c.ellipse(ex + lx * r * 0.04, ey, r * 0.04, r * 0.13, 0, 0, TAU); c.fill();
        }
        c.fillStyle = '#ff7aa2'; c.beginPath(); c.moveTo(ox - r * 0.07, r * 0.06 + oy); c.lineTo(ox + r * 0.07, r * 0.06 + oy); c.lineTo(ox, r * 0.13 + oy); c.closePath(); c.fill();
        c.strokeStyle = '#6b3a10'; c.lineWidth = Math.max(1, r * 0.03); c.lineCap = 'round';
        c.beginPath(); c.arc(ox - r * 0.07, r * 0.14 + oy, r * 0.07, 0, Math.PI); c.arc(ox + r * 0.07, r * 0.14 + oy, r * 0.07, 0, Math.PI); c.stroke();
        c.beginPath();
        for (s = -1; s <= 1; s += 2) for (var k = -1; k <= 1; k++) { c.moveTo(ox + s * r * 0.2, r * 0.12 + oy + k * r * 0.05); c.lineTo(ox + s * r * 0.5, r * 0.08 + oy + k * r * 0.1); }
        c.stroke();
        break;
      case 'robot':
        c.fillStyle = '#23263a'; c.fillRect(-r * 0.5 + ox, -r * 0.3 + oy, r, r * 0.3);
        c.fillStyle = st.blink > 0.5 ? '#1c6b7a' : '#4dfcff';
        c.fillRect(-r * 0.4 + ox + lx * r * 0.05, -r * 0.24 + oy, r * 0.26, r * 0.18);
        c.fillRect(r * 0.14 + ox + lx * r * 0.05, -r * 0.24 + oy, r * 0.26, r * 0.18);
        c.fillStyle = '#23263a'; c.fillRect(-r * 0.3 + ox, r * 0.14 + oy, r * 0.6, r * (0.14 + st.mouth * 0.12));
        c.fillStyle = '#b9c3d0';
        for (var i = 0; i < 4; i++) c.fillRect(-r * 0.24 + ox + i * r * 0.15, r * 0.14 + oy, r * 0.04, r * (0.14 + st.mouth * 0.12));
        break;
      case 'alien':
        for (s = -1; s <= 1; s += 2) {
          c.fillStyle = '#12141f'; c.beginPath(); c.ellipse(s * r * 0.3 + ox, -r * 0.1 + oy, r * 0.2, r * (st.blink > 0.5 ? 0.04 : 0.28), s * -0.5, 0, TAU); c.fill();
          if (st.blink <= 0.5) { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(s * r * 0.3 + ox - r * 0.06, -r * 0.2 + oy, r * 0.06, 0, TAU); c.fill(); }
        }
        mouthSmile(c, r, lx, ly, st, 0.12, 0.34);
        break;
      case 'monster':
        var er = r * 0.3;
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ox, -r * 0.14 + oy, er, 0, TAU); c.fill();
        c.strokeStyle = '#23263a'; c.lineWidth = Math.max(1, r * 0.04); c.stroke();
        if (st.blink > 0.5) { c.fillStyle = '#7b3fe4'; c.beginPath(); c.arc(ox, -r * 0.14 + oy, er, Math.PI, TAU); c.fill(); }
        else {
          c.fillStyle = '#3ddc84'; c.beginPath(); c.arc(ox + lx * er * 0.4, -r * 0.14 + oy + ly * er * 0.4, er * 0.5, 0, TAU); c.fill();
          c.fillStyle = '#12141f'; c.beginPath(); c.arc(ox + lx * er * 0.45, -r * 0.14 + oy + ly * er * 0.45, er * 0.28, 0, TAU); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(ox + lx * er * 0.4 - er * 0.15, -r * 0.14 + oy + ly * er * 0.4 - er * 0.18, er * 0.1, 0, TAU); c.fill();
        }
        c.fillStyle = '#3a0f4a'; c.beginPath(); c.ellipse(ox, r * 0.35 + oy, r * 0.28, r * (0.08 + st.mouth * 0.12), 0, 0, TAU); c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.moveTo(ox - r * 0.18, r * 0.29 + oy); c.lineTo(ox - r * 0.1, r * 0.29 + oy); c.lineTo(ox - r * 0.14, r * 0.4 + oy); c.fill();
        c.beginPath(); c.moveTo(ox + r * 0.18, r * 0.29 + oy); c.lineTo(ox + r * 0.1, r * 0.29 + oy); c.lineTo(ox + r * 0.14, r * 0.4 + oy); c.fill();
        break;
      case 'panda':
        c.fillStyle = '#26262e';
        c.beginPath(); c.ellipse(-r * 0.3 + ox, -r * 0.1 + oy, r * 0.2, r * 0.25, 0.5, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(r * 0.3 + ox, -r * 0.1 + oy, r * 0.2, r * 0.25, -0.5, 0, TAU); c.fill();
        eyePair(c, r, lx, ly, st, 0.09, 0.3, -0.12, 0.6);
        c.fillStyle = '#26262e'; c.beginPath(); c.ellipse(ox, r * 0.14 + oy, r * 0.09, r * 0.06, 0, 0, TAU); c.fill();
        mouthSmile(c, r, lx, ly, st, 0.12, 0.3);
        break;
    }
  };

  /* ------------------------------------------------ shared blob renderer
     Draws a jiggly blob with skin at (x,y) radius r on ctx (screen space).
     o: { skin, color, t, phase, wob, sx, sy (squash), rot, lx, ly, blink, mouth, pts } */
  BB.blobPath = function (c, x, y, r, o) {
    var n = o.pts || Math.max(14, Math.min(56, Math.round(r / 2.2)));
    var t = o.t, ph = o.phase || 0, w = (o.wob || 0), sa = o.sa || 0, sq = o.sq || 0;
    var ca = Math.cos(sa), sn = Math.sin(sa);
    c.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = i / n * TAU;
      var k = 1 + w * (0.55 * Math.sin(a * 3 + t * 5.3 + ph) + 0.45 * Math.sin(a * 5 - t * 4.1 + ph * 2)) + 0.012 * Math.sin(a * 7 + t * 3 + ph);
      var px = Math.cos(a) * r * k, py = Math.sin(a) * r * k;
      // squash/stretch along direction sa
      var u = px * ca + py * sn, v = -px * sn + py * ca;
      u *= 1 + sq; v *= 1 - sq * 0.6;
      px = u * ca - v * sn; py = u * sn + v * ca;
      if (i === 0) c.moveTo(x + px, y + py); else c.lineTo(x + px, y + py);
    }
    c.closePath();
  };

  BB.drawBlob = function (c, x, y, r, o) {
    var skin = o.skin, col = skin ? skin.color : o.color;
    if (!skin) skin = null;
    if (r < 4) { circle(c, x, y, Math.max(1, r), col); return; }
    BB.blobPath(c, x, y, r, o);
    c.fillStyle = col; c.fill();
    var tex = skin && skin.tex ? BB.texture(skin.tex) : null;
    if (tex && r > 5) {
      c.save(); c.clip();
      c.translate(x, y); if (skin.roll) c.rotate(o.rot || 0);
      var s = r * 1.08; c.drawImage(tex, -s, -s, s * 2, s * 2);
      c.restore();
    }
    // glossy highlight
    if (r > 8) {
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.28, r * 0.16, -0.6, 0, TAU); c.fill();
    }
    // outline
    BB.blobPath(c, x, y, r, o);
    c.lineWidth = Math.max(2, Math.min(9, r * 0.075));
    c.strokeStyle = BB.dark(col); c.stroke();
    // face
    if (r > 11) {
      c.save(); c.translate(x, y);
      BB.drawFace(c, skin ? skin.face : 'eyes', r, o.lx || 0, o.ly || 0, o);
      c.restore();
    }
  };
})();
