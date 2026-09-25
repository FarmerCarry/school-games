/*
 * Pool Party — all art drawn in code (original).
 * Balls are shaded per pixel from a real 3D orientation so numbers and stripes roll.
 */
(function (root) {
  'use strict';
  var P = root.PoolPhysics;
  var Art = {};

  var BALL_HEX = { 0: '#fbf8ee', 1: '#ffd21f', 2: '#1e6bff', 3: '#ff2d3a', 4: '#8a3cff', 5: '#ff8a00', 6: '#12b84f', 7: '#b3123d', 8: '#1b1b22' };
  for (var i = 9; i <= 15; i++) BALL_HEX[i] = BALL_HEX[i - 8];
  Art.BALL_HEX = BALL_HEX;
  function hexRGB(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  var BALL_RGB = {};
  for (var k in BALL_HEX) BALL_RGB[k] = hexRGB(BALL_HEX[k]);
  Art.hexRGB = hexRGB;

  Art.FELTS = [
    { id: 'green', name: 'أخضر كلاسيكي', price: 0, bed: '#18a060', dark: '#0f7a47', cushion: '#138a50' },
    { id: 'blue', name: 'أزرق المحيط', price: 80, bed: '#1f84e6', dark: '#1561b0', cushion: '#1a70c8' },
    { id: 'purple', name: 'عنب بنفسجي', price: 120, bed: '#8a4dff', dark: '#6232c9', cushion: '#743fe0' },
    { id: 'red', name: 'صلصة حارّة', price: 160, bed: '#e0384f', dark: '#a8233a', cushion: '#c42c44' },
    { id: 'pink', name: 'علكة وردية', price: 200, bed: '#ff5fa8', dark: '#d63f86', cushion: '#ec4f98' },
    { id: 'orange', name: 'غروب الشمس', price: 260, bed: '#ff8a2a', dark: '#d1631a', cushion: '#e87522' },
    { id: 'galaxy', name: 'المجرّة', price: 0, trophy: 'stars', bed: '#2a2266', dark: '#150f3d', cushion: '#221b55', stars: true }
  ];
  Art.CUES = [
    { id: 'classic', name: 'خشب البلّوط', price: 0, shaft: '#f2dcae', butt: '#7a4320', wrap: '#2b1a10', band: '#e9c46a' },
    { id: 'candy', name: 'عصا الحلوى', price: 60, shaft: '#fff4f4', butt: '#ff3b5c', wrap: '#ffffff', band: '#ff3b5c', stripes: '#ff3b5c' },
    { id: 'ocean', name: 'موجة المحيط', price: 120, shaft: '#e6f6ff', butt: '#1e7bff', wrap: '#0b3d91', band: '#5ee7ff' },
    { id: 'lava', name: 'عصا الحمم', price: 180, shaft: '#ffe7c7', butt: '#2b1010', wrap: '#ff4d00', band: '#ffb300', flames: true },
    { id: 'rainbow', name: 'قوس قزح', price: 260, shaft: '#fffdf5', butt: '#ff4d6d', wrap: '#222', band: '#fff', rainbow: true },
    { id: 'neon', name: 'ليزر النيون', price: 340, shaft: '#eaffea', butt: '#101820', wrap: '#39ff88', band: '#39ff88', glow: '#39ff88' },
    { id: 'gold', name: 'القرش الذهبي', price: 0, trophy: 'hard', shaft: '#fff3c4', butt: '#d4a017', wrap: '#7a5a00', band: '#fff1a8', gold: true }
  ];
  Art.felt = function (id) { for (var i = 0; i < Art.FELTS.length; i++) if (Art.FELTS[i].id === id) return Art.FELTS[i]; return Art.FELTS[0]; };
  Art.cue = function (id) { for (var i = 0; i < Art.CUES.length; i++) if (Art.CUES[i].id === id) return Art.CUES[i]; return Art.CUES[0]; };

  /* ------------------------------------------------------------- number decals */
  var TEX = 40, texMasks = {};
  Art.buildNumberTextures = function (font) {
    var c = document.createElement('canvas'); c.width = TEX; c.height = TEX;
    var g = c.getContext('2d', { willReadFrequently: true });
    for (var n = 1; n <= 15; n++) {
      g.clearRect(0, 0, TEX, TEX);
      g.fillStyle = '#000';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 ' + (n > 9 ? 21 : 25) + 'px ' + font;
      g.fillText(String(n), TEX / 2, TEX / 2 + 2);
      var d = g.getImageData(0, 0, TEX, TEX).data, m = new Uint8Array(TEX * TEX);
      for (var p = 0; p < TEX * TEX; p++) m[p] = d[p * 4 + 3];
      texMasks[n] = m;
    }
  };

  /* ------------------------------------------------------------- 3D orientation */
  Art.newOrientation = function () {
    // body z (number spot) roughly facing the viewer, random twist in the table plane
    var a = Math.random() * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    var m = [c, -s, 0, -s, -c, 0, 0, 0, -1];
    // small random tilt so balls don't all look identical
    rotate(m, Math.random() - 0.5, Math.random() - 0.5, 0, 0.25 + Math.random() * 0.35);
    return m;
  };
  // rotate orientation matrix m (row-major, world = m * body) by angle around world axis (ax, ay, az)
  function rotate(m, ax, ay, az, ang) {
    var l = Math.sqrt(ax * ax + ay * ay + az * az);
    if (l < 1e-9 || ang === 0) return;
    ax /= l; ay /= l; az /= l;
    var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    var r0 = t * ax * ax + c, r1 = t * ax * ay - s * az, r2 = t * ax * az + s * ay;
    var r3 = t * ax * ay + s * az, r4 = t * ay * ay + c, r5 = t * ay * az - s * ax;
    var r6 = t * ax * az - s * ay, r7 = t * ay * az + s * ax, r8 = t * az * az + c;
    var m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7], m8 = m[8];
    m[0] = r0 * m0 + r1 * m3 + r2 * m6; m[1] = r0 * m1 + r1 * m4 + r2 * m7; m[2] = r0 * m2 + r1 * m5 + r2 * m8;
    m[3] = r3 * m0 + r4 * m3 + r5 * m6; m[4] = r3 * m1 + r4 * m4 + r5 * m7; m[5] = r3 * m2 + r4 * m5 + r5 * m8;
    m[6] = r6 * m0 + r7 * m3 + r8 * m6; m[7] = r6 * m1 + r7 * m4 + r8 * m7; m[8] = r6 * m2 + r7 * m5 + r8 * m8;
  }
  Art.rotate = rotate;
  Art.orthonormalize = function (m) {
    // columns are body axes in world space
    var x0 = m[0], x1 = m[3], x2 = m[6];
    var l = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2); x0 /= l; x1 /= l; x2 /= l;
    var y0 = m[1], y1 = m[4], y2 = m[7];
    var d = x0 * y0 + x1 * y1 + x2 * y2; y0 -= d * x0; y1 -= d * x1; y2 -= d * x2;
    l = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2); y0 /= l; y1 /= l; y2 /= l;
    m[0] = x0; m[3] = x1; m[6] = x2; m[1] = y0; m[4] = y1; m[7] = y2;
    m[2] = x1 * y2 - x2 * y1; m[5] = x2 * y0 - x0 * y2; m[8] = x0 * y1 - x1 * y0;
  };

  /* ------------------------------------------------------------- ball sprites */
  var L = (function () { var x = -0.42, y = -0.58, z = -0.7, l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; })();
  var Hh = (function () { var x = L[0], y = L[1], z = L[2] - 1, l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; })();

  // sprite = { n, m, canvas, ctx, img, size, rpx, key }
  Art.makeSprite = function (n) {
    var c = document.createElement('canvas');
    return { n: n, m: Art.newOrientation(), canvas: c, ctx: c.getContext('2d'), img: null, size: 0, rpx: 0, dirty: true };
  };

  Art.renderSprite = function (sp, rpx) {
    var size = Math.ceil(rpx * 2) + 2;
    if (sp.size !== size) {
      sp.size = size; sp.canvas.width = size; sp.canvas.height = size;
      sp.img = sp.ctx.createImageData(size, size);
    }
    sp.rpx = rpx;
    var data = sp.img.data, m = sp.m, n = sp.n, c = size / 2;
    var base = BALL_RGB[n], stripe = n > 8, cue = n === 0, mask = texMasks[n];
    var inv = 1 / rpx;
    var m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7], m8 = m[8];
    var idx = 0;
    for (var py = 0; py < size; py++) {
      var ny = (py + 0.5 - c) * inv;
      for (var px = 0; px < size; px++, idx += 4) {
        var nx = (px + 0.5 - c) * inv;
        var d2 = nx * nx + ny * ny;
        if (d2 >= 1.0 + 2.2 * inv) { data[idx + 3] = 0; continue; }
        var dist = Math.sqrt(d2);
        var alpha = (1 - dist) * rpx + 0.5; alpha = alpha > 1 ? 1 : alpha < 0 ? 0 : alpha;
        var cx = nx, cy = ny;
        if (dist > 0.999) { cx = nx / dist * 0.999; cy = ny / dist * 0.999; }
        var nz = -Math.sqrt(Math.max(0, 1 - cx * cx - cy * cy));
        // body coordinates
        var bx = m0 * cx + m3 * cy + m6 * nz;
        var by = m1 * cx + m4 * cy + m7 * nz;
        var bz = m2 * cx + m5 * cy + m8 * nz;
        var r, g, b;
        if (cue) {
          r = base[0]; g = base[1]; b = base[2];
          if (bx > 0.965 || bx < -0.965 || by > 0.965 || by < -0.965 || bz > 0.965 || bz < -0.965) { r = 230; g = 40; b = 60; }
        } else {
          var abz = bz < 0 ? -bz : bz;
          if (abz > 0.8) {
            // number spot
            r = 252; g = 250; b = 240;
            if (mask) {
              var u = (bz > 0 ? bx : -bx) / 0.6, v = by / 0.6;
              var tx = ((u + 1) * 0.5 * (TEX - 1)) | 0, ty = ((v + 1) * 0.5 * (TEX - 1)) | 0;
              if (tx >= 0 && ty >= 0 && tx < TEX && ty < TEX) {
                var a = mask[ty * TEX + tx] / 255;
                if (a > 0) { r = r * (1 - a) + 20 * a; g = g * (1 - a) + 20 * a; b = b * (1 - a) + 30 * a; }
              }
            }
          } else if (stripe && (by > 0.56 || by < -0.56)) { r = 252; g = 250; b = 240; }
          else { r = base[0]; g = base[1]; b = base[2]; }
        }
        // lighting
        var dif = cx * L[0] + cy * L[1] + nz * L[2]; if (dif < 0) dif = 0;
        var sh = 0.34 + 0.78 * dif;
        var spc = cx * Hh[0] + cy * Hh[1] + nz * Hh[2];
        spc = spc > 0 ? Math.pow(spc, 38) * 255 : 0;
        // soft bounce light from the felt at the bottom right
        var rim = (cx * 0.5 + cy * 0.7) * (1 + nz); rim = rim > 0 ? rim * 28 : 0;
        r = r * sh + spc + rim; g = g * sh + spc + rim; b = b * sh + spc + rim;
        data[idx] = r > 255 ? 255 : r; data[idx + 1] = g > 255 ? 255 : g; data[idx + 2] = b > 255 ? 255 : b;
        data[idx + 3] = alpha * 255;
      }
    }
    sp.ctx.putImageData(sp.img, 0, 0);
    sp.dirty = false;
  };

  var shadowCache = null;
  Art.shadow = function () {
    if (shadowCache) return shadowCache;
    var s = 64, c = document.createElement('canvas'); c.width = s; c.height = s;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.5)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    shadowCache = c;
    return c;
  };

  /* ------------------------------------------------------------- helpers */
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  Art.rr = rr;
  function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ------------------------------------------------------------- table layer */
  Art.renderTable = function (canvas, k, feltId) {
    var W = 1280, H = 720;
    canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
    var g = canvas.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    var F = Art.felt(feltId);
    var rnd = seeded(7);
    // party room background
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1b5e'); bg.addColorStop(1, '#130c33');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var spot = g.createRadialGradient(640, 400, 100, 640, 400, 760);
    spot.addColorStop(0, 'rgba(255,220,160,0.18)'); spot.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = spot; g.fillRect(0, 0, W, H);
    var bokeh = ['#ff5fa8', '#ffd21f', '#3ee0ff', '#8a4dff', '#3ddc84', '#ff8a00'];
    for (var i = 0; i < 38; i++) {
      var bx = rnd() * W, by = rnd() * H, br = 10 + rnd() * 40;
      var gr = g.createRadialGradient(bx, by, 0, bx, by, br);
      var col = bokeh[i % bokeh.length];
      gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00');
      g.fillStyle = gr; g.beginPath(); g.arc(bx, by, br, 0, 6.283); g.fill();
    }
    // string lights across the top
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 6);
    for (var x = 0; x <= W; x += 160) g.quadraticCurveTo(x + 80, 40, x + 160, 6);
    g.stroke();
    for (x = 20; x < W; x += 40) {
      var t = ((x % 160) / 160), ly = 6 + 34 * 4 * t * (1 - t) * 0.5 + 2;
      var lc = bokeh[(x / 40 | 0) % bokeh.length];
      var lg = g.createRadialGradient(x, ly + 6, 0, x, ly + 6, 14);
      lg.addColorStop(0, lc + 'cc'); lg.addColorStop(1, lc + '00');
      g.fillStyle = lg; g.beginPath(); g.arc(x, ly + 6, 14, 0, 6.283); g.fill();
      g.fillStyle = lc; g.beginPath(); g.ellipse(x, ly + 6, 4, 5.5, 0, 0, 6.283); g.fill();
    }

    var TX0 = P.TX0, TY0 = P.TY0, TX1 = P.TX1, TY1 = P.TY1;
    var OX0 = TX0 - 46, OY0 = TY0 - 46, OW = P.TW + 92, OH = P.TH + 92;
    // table drop shadow
    g.fillStyle = 'rgba(0,0,0,0.45)';
    rr(g, OX0 + 6, OY0 + 14, OW, OH, 30); g.fill();
    // wood rail
    var wood = g.createLinearGradient(0, OY0, 0, OY0 + OH);
    wood.addColorStop(0, '#b0612a'); wood.addColorStop(0.5, '#8a4519'); wood.addColorStop(1, '#6a3310');
    g.fillStyle = wood; rr(g, OX0, OY0, OW, OH, 30); g.fill();
    // grain
    g.save(); rr(g, OX0, OY0, OW, OH, 30); g.clip();
    g.strokeStyle = 'rgba(60,25,5,0.25)'; g.lineWidth = 1.2;
    for (i = 0; i < 26; i++) {
      var gy = OY0 + rnd() * OH, amp = 2 + rnd() * 4;
      g.beginPath(); g.moveTo(OX0, gy);
      for (x = OX0; x <= OX0 + OW; x += 40) g.quadraticCurveTo(x + 20, gy + (rnd() - 0.5) * amp * 2, x + 40, gy);
      g.stroke();
    }
    g.restore();
    // rail top highlight + bevel
    g.strokeStyle = 'rgba(255,220,170,0.45)'; g.lineWidth = 3;
    rr(g, OX0 + 3, OY0 + 3, OW - 6, OH - 6, 27); g.stroke();
    g.strokeStyle = 'rgba(40,15,0,0.6)'; g.lineWidth = 2;
    rr(g, OX0 + 1, OY0 + 1, OW - 2, OH - 2, 29); g.stroke();

    // leather pocket rims
    P.pockets.forEach(function (pk) {
      g.fillStyle = '#1e140e';
      g.beginPath(); g.arc(pk.x, pk.y, pk.hole + 8, 0, 6.283); g.fill();
      g.strokeStyle = '#e8b04a'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(pk.x, pk.y, pk.hole + 8, 0, 6.283); g.stroke();
    });
    // cloth band behind the cushions (pocket throats)
    g.fillStyle = F.dark;
    g.fillRect(TX0 - 22, TY0 - 22, P.TW + 44, P.TH + 44);
    // bed
    var bed = g.createRadialGradient(P.CX, P.CY, 40, P.CX, P.CY, 560);
    bed.addColorStop(0, shade(F.bed, 1.12)); bed.addColorStop(0.65, F.bed); bed.addColorStop(1, shade(F.bed, 0.8));
    g.fillStyle = bed; g.fillRect(TX0, TY0, P.TW, P.TH);
    // felt fuzz
    for (i = 0; i < 2600; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
      g.fillRect(TX0 + rnd() * P.TW, TY0 + rnd() * P.TH, 1.5, 1.5);
    }
    if (F.stars) {
      for (i = 0; i < 120; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.2 + rnd() * 0.6).toFixed(2) + ')';
        var sr = rnd() * 1.6 + 0.4;
        g.beginPath(); g.arc(TX0 + rnd() * P.TW, TY0 + rnd() * P.TH, sr, 0, 6.283); g.fill();
      }
    }
    // center logo on the felt
    g.save();
    g.globalAlpha = 0.12; g.fillStyle = '#fff';
    g.font = '700 64px ' + Art.font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillText('حفلة البلياردو', P.CX, P.CY);
    g.restore();
    // head string + foot spot
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 2; g.setLineDash([6, 8]);
    g.beginPath(); g.moveTo(P.HEAD_X, TY0 + 4); g.lineTo(P.HEAD_X, TY1 - 4); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.arc(P.FOOT_X, P.CY, 3, 0, 6.283); g.fill();
    g.beginPath(); g.arc(P.HEAD_X, P.CY, 3, 0, 6.283); g.fill();
    // bed inner shadow along cushions
    g.save(); g.beginPath(); g.rect(TX0, TY0, P.TW, P.TH); g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 10;
    g.strokeRect(TX0 - 3, TY0 - 3, P.TW + 6, P.TH + 6);
    g.restore();
    // cushions
    P.cushionPolys.forEach(function (poly) {
      g.fillStyle = F.cushion;
      g.beginPath(); g.moveTo(poly[0][0], poly[0][1]);
      for (var j = 1; j < poly.length; j++) g.lineTo(poly[j][0], poly[j][1]);
      // close back to the wood
      var last = poly[poly.length - 1], first = poly[0];
      if (poly[1][0] === poly[2][0]) { // vertical cushion
        var dx = first[0] < P.CX ? -8 : 8;
        g.lineTo(last[0] + dx, last[1]); g.lineTo(first[0] + dx, first[1]);
      } else {
        var dy = first[1] < P.CY ? -8 : 8;
        g.lineTo(last[0], last[1] + dy); g.lineTo(first[0], first[1] + dy);
      }
      g.closePath(); g.fill();
      // nose highlight
      g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(poly[1][0], poly[1][1]); g.lineTo(poly[2][0], poly[2][1]); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(poly[0][0], poly[0][1]); g.lineTo(poly[1][0], poly[1][1]);
      g.moveTo(poly[2][0], poly[2][1]); g.lineTo(poly[3][0], poly[3][1]); g.stroke();
    });
    // re-cut the wood edge over the cushion backs
    g.strokeStyle = '#5a2c0e'; g.lineWidth = 3;
    g.strokeRect(TX0 - 23.5, TY0 - 23.5, P.TW + 47, P.TH + 47);
    // pocket holes
    P.pockets.forEach(function (pk) {
      var hg = g.createRadialGradient(pk.x - pk.dirx * 6, pk.y - pk.diry * 6, 2, pk.x, pk.y, pk.hole);
      hg.addColorStop(0, '#000'); hg.addColorStop(0.75, '#07060a'); hg.addColorStop(1, '#2a2230');
      g.fillStyle = hg; g.beginPath(); g.arc(pk.x, pk.y, pk.hole, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(pk.x, pk.y, pk.hole, 0, 6.283); g.stroke();
    });
    // diamonds
    g.fillStyle = '#fff2d6';
    var dxs = [1, 2, 3, 5, 6, 7], dys = [1, 2, 3];
    dxs.forEach(function (q) {
      var xx = TX0 + P.TW * q / 8;
      diamond(g, xx, TY0 - 35); diamond(g, xx, TY1 + 35);
    });
    dys.forEach(function (q) {
      var yy = TY0 + P.TH * q / 4;
      diamond(g, TX0 - 35, yy); diamond(g, TX1 + 35, yy);
    });
    // potted-ball tray
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, 424, 668, 432, 40, 20); g.fill();
    var tg = g.createLinearGradient(0, 668, 0, 706);
    tg.addColorStop(0, '#3a2414'); tg.addColorStop(1, '#6a4020');
    g.fillStyle = tg; rr(g, 426, 666, 428, 38, 19); g.fill();
    g.fillStyle = '#140c07'; rr(g, 434, 672, 412, 26, 13); g.fill();
    g.strokeStyle = 'rgba(255,220,170,0.35)'; g.lineWidth = 1.5; rr(g, 426, 666, 428, 38, 19); g.stroke();
  };
  function diamond(g, x, y) {
    g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 3.5, y); g.lineTo(x, y + 5); g.lineTo(x - 3.5, y); g.closePath(); g.fill();
  }
  function shade(hex, f) {
    var c = hexRGB(hex);
    return 'rgb(' + Math.min(255, c[0] * f | 0) + ',' + Math.min(255, c[1] * f | 0) + ',' + Math.min(255, c[2] * f | 0) + ')';
  }
  Art.shade = shade;

  /* ------------------------------------------------------------- cue stick */
  // Draws the cue with its tip at distance `gap` from (x, y), pointing along ang.
  Art.drawCue = function (g, x, y, ang, gap, skinId, alpha) {
    var S = Art.cue(skinId);
    var len = 440;
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y); g.rotate(ang + Math.PI);
    // shadow
    g.save(); g.translate(6, 9); g.globalAlpha *= 0.3; g.fillStyle = '#000';
    g.beginPath(); g.moveTo(gap, -3); g.lineTo(gap + len, -7); g.lineTo(gap + len, 7); g.lineTo(gap, 3); g.closePath(); g.fill();
    g.restore();
    if (S.glow) { g.shadowColor = S.glow; g.shadowBlur = 14; }
    // shaft
    var sg = g.createLinearGradient(0, -6, 0, 6);
    sg.addColorStop(0, S.shaft); sg.addColorStop(0.5, '#ffffff'); sg.addColorStop(1, shade(S.shaft, 0.8));
    g.fillStyle = sg;
    g.beginPath(); g.moveTo(gap + 10, -3.2); g.lineTo(gap + len * 0.55, -4.8); g.lineTo(gap + len * 0.55, 4.8); g.lineTo(gap + 10, 3.2); g.closePath(); g.fill();
    g.shadowBlur = 0;
    if (S.stripes) {
      g.save(); g.beginPath(); g.moveTo(gap + 10, -3.2); g.lineTo(gap + len * 0.55, -4.8); g.lineTo(gap + len * 0.55, 4.8); g.lineTo(gap + 10, 3.2); g.closePath(); g.clip();
      g.fillStyle = S.stripes;
      for (var s = gap + 20; s < gap + len * 0.55; s += 18) { g.beginPath(); g.moveTo(s, -6); g.lineTo(s + 8, -6); g.lineTo(s + 2, 6); g.lineTo(s - 6, 6); g.closePath(); g.fill(); }
      g.restore();
    }
    // butt
    var bx0 = gap + len * 0.55, bx1 = gap + len;
    var bgd = g.createLinearGradient(0, -8, 0, 8);
    if (S.gold) { bgd.addColorStop(0, '#fff1a8'); bgd.addColorStop(0.45, '#d4a017'); bgd.addColorStop(1, '#8a6400'); }
    else { bgd.addColorStop(0, shade(S.butt, 1.35)); bgd.addColorStop(0.5, S.butt); bgd.addColorStop(1, shade(S.butt, 0.6)); }
    g.fillStyle = bgd;
    g.beginPath(); g.moveTo(bx0, -4.8); g.lineTo(bx1, -7.5); g.quadraticCurveTo(bx1 + 4, 0, bx1, 7.5); g.lineTo(bx0, 4.8); g.closePath(); g.fill();
    if (S.rainbow) {
      var cols = ['#ff4d6d', '#ff9f1c', '#ffe14d', '#3ddc84', '#3ec5ff', '#8a4dff'];
      for (var q = 0; q < cols.length; q++) {
        g.fillStyle = cols[q];
        var x0 = bx0 + (bx1 - bx0) * q / cols.length, x1 = bx0 + (bx1 - bx0) * (q + 1) / cols.length;
        var h0 = 4.8 + 2.7 * q / cols.length, h1 = 4.8 + 2.7 * (q + 1) / cols.length;
        g.beginPath(); g.moveTo(x0, -h0); g.lineTo(x1, -h1); g.lineTo(x1, h1); g.lineTo(x0, h0); g.closePath(); g.fill();
      }
    }
    if (S.flames) {
      g.fillStyle = '#ff7a00';
      for (var f = 0; f < 5; f++) {
        var fx = bx0 + 10 + f * 30;
        g.beginPath(); g.moveTo(fx, 5); g.quadraticCurveTo(fx + 10, -2, fx + 6, -7); g.quadraticCurveTo(fx + 18, 0, fx + 22, 6); g.closePath(); g.fill();
      }
    }
    // wrap
    g.fillStyle = S.wrap;
    g.fillRect(bx0 + 40, -5.8, 70, 11.6);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (var w = bx0 + 42; w < bx0 + 110; w += 6) g.fillRect(w, -5.8, 2, 11.6);
    // bands
    g.fillStyle = S.band;
    g.fillRect(bx0 - 2, -5, 5, 10); g.fillRect(bx0 + 36, -5.6, 3, 11.2); g.fillRect(bx0 + 112, -6, 3, 12);
    // ferrule + tip
    g.fillStyle = '#fbfbf5'; g.fillRect(gap + 3, -3.1, 8, 6.2);
    g.fillStyle = '#2f7de0'; g.beginPath(); g.moveTo(gap, -2.9); g.lineTo(gap + 3.5, -3.1); g.lineTo(gap + 3.5, 3.1); g.lineTo(gap, 2.9); g.closePath(); g.fill();
    // shine
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(gap + 12, -1.8); g.lineTo(bx1 - 10, -4); g.stroke();
    g.restore();
  };

  /* ------------------------------------------------------------- avatars */
  // id: you | p2 | rex | coco | finn
  Art.drawAvatar = function (g, x, y, r, id, mood) {
    g.save();
    g.translate(x, y);
    var s = r / 40;
    g.scale(s, s);
    var bgc = { you: '#3ec5ff', p2: '#ff5fa8', rex: '#ffd21f', coco: '#b98cff', finn: '#3ddc84' }[id] || '#ccc';
    g.fillStyle = bgc; g.beginPath(); g.arc(0, 0, 40, 0, 6.283); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, 38, 0, 6.283); g.clip();
    if (id === 'rex') {
      g.fillStyle = '#c98a4b'; g.beginPath(); g.ellipse(0, 10, 26, 28, 0, 0, 6.283); g.fill();
      g.fillStyle = '#7a4a22';
      g.beginPath(); g.ellipse(-24, 2, 9, 20, 0.35, 0, 6.283); g.fill();
      g.beginPath(); g.ellipse(24, 2, 9, 20, -0.35, 0, 6.283); g.fill();
      g.fillStyle = '#f3dcc0'; g.beginPath(); g.ellipse(0, 22, 14, 11, 0, 0, 6.283); g.fill();
      eyes(g, -9, 5, 9, 5); g.fillStyle = '#222'; g.beginPath(); g.ellipse(0, 16, 5, 4, 0, 0, 6.283); g.fill();
      mouth(g, 0, 24, mood);
      g.fillStyle = '#ff3b5c'; g.fillRect(-16, 32, 32, 6);
    } else if (id === 'coco') {
      g.fillStyle = '#6b6f7e';
      g.beginPath(); g.moveTo(-26, -6); g.lineTo(-20, -30); g.lineTo(-6, -16); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(26, -6); g.lineTo(20, -30); g.lineTo(6, -16); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(0, 8, 27, 26, 0, 0, 6.283); g.fill();
      g.fillStyle = '#ffb3c7'; g.beginPath(); g.moveTo(-3, 12); g.lineTo(3, 12); g.lineTo(0, 16); g.closePath(); g.fill();
      // sunglasses
      g.fillStyle = '#111';
      g.beginPath(); g.ellipse(-10, 3, 9, 6.5, 0, 0, 6.283); g.fill();
      g.beginPath(); g.ellipse(10, 3, 9, 6.5, 0, 0, 6.283); g.fill();
      g.fillRect(-3, 1, 6, 2.5);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-14, 0, 4, 2); g.fillRect(6, 0, 4, 2);
      g.strokeStyle = '#ddd'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-14, 16); g.lineTo(-30, 13); g.moveTo(-14, 19); g.lineTo(-30, 21); g.moveTo(14, 16); g.lineTo(30, 13); g.moveTo(14, 19); g.lineTo(30, 21); g.stroke();
      mouth(g, 0, 20, mood);
    } else if (id === 'finn') {
      g.fillStyle = '#5b8fb9';
      g.beginPath(); g.moveTo(-4, -22); g.lineTo(8, -40); g.lineTo(14, -18); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(0, 10, 30, 27, 0, 0, 6.283); g.fill();
      g.fillStyle = '#e8f4ff'; g.beginPath(); g.ellipse(0, 20, 22, 14, 0, 0, 6.283); g.fill();
      eyes(g, -11, 2, 11, 2);
      // grin with friendly teeth
      g.fillStyle = '#fff'; g.strokeStyle = '#2b3a4a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-13, 18); g.quadraticCurveTo(0, 30, 13, 18); g.closePath(); g.fill(); g.stroke();
      g.beginPath();
      for (var t = -9; t <= 9; t += 6) { g.moveTo(t - 2, 19.5); g.lineTo(t, 23); g.lineTo(t + 2, 19.5); }
      g.stroke();
      g.fillStyle = '#3b6f99'; g.beginPath(); g.moveTo(-30, 12); g.lineTo(-38, 4); g.lineTo(-36, 18); g.closePath(); g.fill();
    } else {
      // kid: you (blue cap) or p2 (pink bow)
      g.fillStyle = id === 'p2' ? '#8d5524' : '#f1c27d';
      g.beginPath(); g.ellipse(0, 8, 24, 26, 0, 0, 6.283); g.fill();
      g.fillStyle = id === 'p2' ? '#2b1608' : '#5a3212';
      g.beginPath(); g.ellipse(0, -10, 26, 16, 0, Math.PI, 0); g.fill();
      if (id === 'you') {
        g.fillStyle = '#1e6bff'; g.beginPath(); g.ellipse(0, -12, 27, 15, 0, Math.PI, 0); g.fill();
        g.fillRect(-4, -14, 36, 6);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -18, 4, 0, 6.283); g.fill();
      } else {
        g.fillStyle = '#2b1608';
        g.beginPath(); g.arc(-22, 8, 8, 0, 6.283); g.arc(22, 8, 8, 0, 6.283); g.fill();
        g.fillStyle = '#ff3b8d';
        g.beginPath(); g.moveTo(14, -20); g.lineTo(30, -28); g.lineTo(30, -12); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(14, -20); g.lineTo(-2, -28); g.lineTo(-2, -12); g.closePath(); g.fill();
        g.beginPath(); g.arc(14, -20, 4, 0, 6.283); g.fill();
      }
      eyes(g, -9, 6, 9, 6);
      g.fillStyle = 'rgba(255,120,120,0.45)';
      g.beginPath(); g.arc(-15, 16, 4, 0, 6.283); g.arc(15, 16, 4, 0, 6.283); g.fill();
      mouth(g, 0, 20, mood);
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 39, 0, 6.283); g.stroke();
    g.restore();
  };
  function eyes(g, x1, y1, x2, y2) {
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(x1, y1, 6, 7, 0, 0, 6.283); g.ellipse(x2, y2, 6, 7, 0, 0, 6.283); g.fill();
    g.fillStyle = '#1b1b22';
    g.beginPath(); g.arc(x1 + 1, y1 + 1, 3.5, 0, 6.283); g.arc(x2 + 1, y2 + 1, 3.5, 0, 6.283); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x1 + 2, y1 - 1, 1.3, 0, 6.283); g.arc(x2 + 2, y2 - 1, 1.3, 0, 6.283); g.fill();
  }
  function mouth(g, x, y, mood) {
    g.strokeStyle = '#3a1a10'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath();
    if (mood === 'sad') g.arc(x, y + 6, 6, 1.15 * Math.PI, 1.85 * Math.PI);
    else if (mood === 'wow') {
      g.fillStyle = '#3a1a10'; g.moveTo(x - 9, y - 2); g.quadraticCurveTo(x, y + 16, x + 9, y - 2); g.closePath(); g.fill();
      g.fillStyle = '#ff6b8a'; g.beginPath(); g.ellipse(x, y + 5, 4.5, 2.5, 0, 0, 6.283); g.fill();
      return;
    }
    else g.arc(x, y - 2, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }

  // Small flat ball icon (HUD, tray previews)
  Art.drawMiniBall = function (g, x, y, r, n, alpha) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    var col = BALL_HEX[n];
    g.fillStyle = n > 8 ? '#fbf8ee' : col;
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    if (n > 8) {
      g.save(); g.beginPath(); g.arc(x, y, r, 0, 6.283); g.clip();
      g.fillStyle = col; g.fillRect(x - r, y - r * 0.56, r * 2, r * 1.12); g.restore();
    }
    if (n > 0) {
      g.fillStyle = '#fbf8ee'; g.beginPath(); g.arc(x, y, r * 0.52, 0, 6.283); g.fill();
      g.fillStyle = '#111'; g.font = '700 ' + Math.round(r * (n > 9 ? 0.72 : 0.85)) + 'px ' + Art.font;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), x, y + r * 0.06);
    }
    var hl = g.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x, y, r);
    hl.addColorStop(0, 'rgba(255,255,255,0.55)'); hl.addColorStop(0.35, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = hl; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.restore();
  };

  Art.font = "'Fredoka', 'Segoe UI Rounded', 'Segoe UI', 'Trebuchet MS', sans-serif";
  root.PoolArt = Art;
})(window);
