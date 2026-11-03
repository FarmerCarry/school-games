/* Procedural lake, anglers and fish. Sprites are painted once. */
(function () {
  'use strict';
  var PAL = [
    { sky0: '#7ad4ff', sky1: '#fff3c4', hill: '#67c05a', hill2: '#2f8a48', water: '#1b93d6', deep: '#0b5f9c', sand: '#efd09a', grass: '#3e9a46', ripple: '#e7f8ff', wood: '#8d5a32', accent: '#ff5d7a' },
    { sky0: '#59c4ff', sky1: '#ffe6b0', hill: '#d2b07a', hill2: '#8d7344', water: '#1478c6', deep: '#0a4e88', sand: '#e7c98e', grass: '#d7b56e', ripple: '#e9f7ff', wood: '#7a4b28', accent: '#ffb703' },
    { sky0: '#5ee4ff', sky1: '#fff6d2', hill: '#2aa89a', hill2: '#14756c', water: '#12a3b0', deep: '#085e6c', sand: '#f2dcb8', grass: '#1f9a8c', ripple: '#e6fff8', wood: '#e07a5f', accent: '#ff6b9a' },
    { sky0: '#d5eeff', sky1: '#ffffff', hill: '#eef6ff', hill2: '#c5d9ec', water: '#8ec6e6', deep: '#3d82ac', sand: '#f5fbff', grass: '#e7f3ff', ripple: '#ffffff', wood: '#d5e6f4', accent: '#9fdfff' },
    { sky0: '#ff8a3d', sky1: '#ffe7a8', hill: '#c46a3a', hill2: '#8a3e28', water: '#2f6fbf', deep: '#143a78', sand: '#f0c48a', grass: '#e08a3c', ripple: '#d7ecff', wood: '#a56b3a', accent: '#ffe14a' },
    { sky0: '#ff7a3a', sky1: '#ffd0a6', hill: '#6e3030', hill2: '#3c1818', water: '#d4532a', deep: '#7a2216', sand: '#8a4030', grass: '#5c2820', ripple: '#ffd2a4', wood: '#4a241c', accent: '#ffd24a' },
    { sky0: '#8d7cff', sky1: '#f4e8ff', hill: '#ffffff', hill2: '#e6e0ff', water: '#8ec8ff', deep: '#4a78c4', sand: '#f4f0ff', grass: '#ffffff', ripple: '#ffffff', wood: '#ddd6ff', accent: '#ffe56a' }
  ];
  var cache = {};

  function shade(hex, t) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (12 - r) * t);
    g = Math.round(g + (20 - g) * t);
    b = Math.round(b + (52 - b) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function palette(spot, night) {
    var src = PAL[spot] || PAL[0];
    if (night < 0.08) return src;
    var key = spot + ':' + (night > 0.55 ? 1 : 0);
    if (cache[key]) return cache[key];
    var out = {};
    for (var k in src) out[k] = night > 0.55 ? shade(src[k], 0.55) : src[k];
    if (night > 0.55) { out.ripple = '#9ecfff'; out.accent = '#ffe08a'; }
    cache[key] = out;
    return out;
  }

  // Saturated sticker colors: body, belly, mark. Never the pale data hex.
  var VIVID = [
    ['#ff6a00', '#fff6e8', '#ffffff'],
    ['#1288ff', '#ffe14a', '#ffffff'],
    ['#1eb84a', '#eaffc8', '#0b6a22'],
    ['#ff2d4a', '#ffe0d0', '#ffffff'],
    ['#7a3dff', '#ffe56a', '#ffffff'],
    ['#ffc400', '#fff4c8', '#ff6a00'],
    ['#ff4b8d', '#ffe0ee', '#ffffff'],
    ['#12c2c2', '#e6fffb', '#ffffff'],
    ['#ff7a12', '#5a28e0', '#ffe14a'],
    ['#3a6dff', '#7dff9a', '#ffffff']
  ];
  function famOf(fish) {
    if (!fish || fish.junk) return 0;
    if (fish.boss) return 8;
    return (fish.id || 0) % 10;
  }

  function ink(ctx, s) {
    ctx.strokeStyle = '#16324a';
    ctx.lineWidth = Math.max(2, s * 0.045);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function tone(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * k);
    var g = Math.round(((n >> 8) & 255) * k);
    var b = Math.round((n & 255) * k);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Pond teardrop, ice puffer, pier/volcano pike, reef/sky angel, swamp catfish.
  function shapeOf(fish) {
    var g = fish.spot;
    if (g == null || g < 0) g = (fish.id || 0) % 7;
    return [0, 2, 3, 1, 4, 2, 3][g] || 0;
  }

  function bodyOf(ctx, k, s) {
    ctx.beginPath();
    if (k === 1) ctx.ellipse(0, s * 0.02, s * 0.62, s * 0.56, 0, 0, 6.3);
    else if (k === 2) {
      ctx.moveTo(s * 1.02, s * 0.02);
      ctx.bezierCurveTo(s * 0.72, -s * 0.34, s * 0.05, -s * 0.42, -s * 0.58, -s * 0.28);
      ctx.bezierCurveTo(-s * 1.0, -s * 0.16, -s * 1.12, -s * 0.02, -s * 1.08, s * 0.04);
      ctx.bezierCurveTo(-s * 0.92, s * 0.22, -s * 0.4, s * 0.36, s * 0.08, s * 0.4);
      ctx.bezierCurveTo(s * 0.68, s * 0.34, s * 0.92, s * 0.16, s * 1.02, s * 0.02);
    }     else if (k === 3) ctx.ellipse(s * 0.04, 0, s * 0.5, s * 0.44, 0, 0, 6.3);
    else if (k === 4) {
      ctx.moveTo(s * 0.92, s * 0.08);
      ctx.bezierCurveTo(s * 1.12, -s * 0.55, s * 0.12, -s * 0.6, -s * 0.42, -s * 0.12);
      ctx.bezierCurveTo(-s * 0.82, -s * 0.04, -s * 1.12, s * 0.02, -s * 1.05, s * 0.05);
      ctx.bezierCurveTo(-s * 0.78, s * 0.1, -s * 0.12, s * 0.14, s * 0.22, s * 0.5);
      ctx.bezierCurveTo(s * 0.7, s * 0.68, s * 1.16, s * 0.28, s * 0.92, s * 0.08);
    } else {
      ctx.moveTo(s * 1.05, 0);
      ctx.bezierCurveTo(s * 0.78, -s * 0.5, s * 0.05, -s * 0.62, -s * 0.55, -s * 0.28);
      ctx.bezierCurveTo(-s * 0.9, -s * 0.1, -s * 0.9, s * 0.1, -s * 0.55, s * 0.3);
      ctx.bezierCurveTo(s * 0.05, s * 0.56, s * 0.78, s * 0.46, s * 1.05, 0);
    }
    ctx.closePath();
  }

  function tailOf(ctx, k, s, ext) {
    var base = [0.55, 0.5, 0.92, 0.38, 0.9][k];
    var reach = [1.12, 0.98, 1.08, 0.92, 1.22][k] * ext;
    var lift = [0.42, 0.34, 0.36, 0.36, 0.22][k];
    ctx.beginPath();
    ctx.moveTo(-s * (base - 0.08), -s * 0.1);
    ctx.lineTo(-s * reach, -s * lift);
    ctx.quadraticCurveTo(-s * reach * 0.72, 0, -s * reach, s * lift);
    ctx.lineTo(-s * (base - 0.08), s * 0.1);
    ctx.closePath();
  }

  function finLeaf(ctx, s, x0, y0, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(s * x0, s * y0);
    ctx.quadraticCurveTo(s * x1, s * y1, s * x2, s * y2);
    ctx.quadraticCurveTo(s * ((x0 + x2) * 0.5), s * ((y0 + y2) * 0.5 + (y1 < 0 ? 0.12 : -0.12)), s * x0, s * y0);
    ctx.closePath();
  }

  function tallFin(ctx, s, x0, y0, tx, ty, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(s * x0, s * y0);
    ctx.lineTo(s * tx, s * ty);
    ctx.lineTo(s * x2, s * y2);
    ctx.closePath();
  }

  function dorsalOf(ctx, k, s) {
    if (k === 1) finLeaf(ctx, s, -0.04, -0.5, 0.12, -0.78, 0.28, -0.46);
    else if (k === 2) finLeaf(ctx, s, -0.12, -0.3, 0.14, -0.62, 0.42, -0.24);
    else if (k === 3) tallFin(ctx, s, -0.18, -0.38, -0.04, -1.02, 0.2, -0.4);
    else if (k === 4) finLeaf(ctx, s, 0.15, -0.42, 0.38, -0.78, 0.62, -0.28);
    else finLeaf(ctx, s, -0.12, -0.4, 0.18, -0.78, 0.46, -0.34);
  }

  function drawFish(ctx, fish, x, y, w, h, sil) {
    if (!fish) return;
    if (fish.junk || (fish.id >= 49 && fish.id <= 52)) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      if (fish.id === 49) paintBoot(ctx, w, h, sil);
      else if (fish.id === 50) paintDuck(ctx, w, h, sil);
      else if (fish.id === 51) paintBottle(ctx, w, h, sil);
      else paintChest(ctx, w, h, sil);
      ctx.restore();
      return;
    }
    var k = shapeOf(fish);
    var rare = fish.boss ? 4 : (fish.rare | 0);
    var ext = rare >= 4 ? 1.22 : 1;
    var vivid = VIVID[(fish.boss ? 5 : (fish.id || 0)) % 10];
    var body = sil ? '#08345c' : vivid[0];
    var belly = sil ? '#08345c' : vivid[1];
    var mark = sil ? '#08345c' : vivid[2];
    var fin = sil ? body : tone(body, 0.72);
    var finEdge = sil ? body : tone(body, 0.5);
    var fit = [[2.35, 1.5], [2.05, 1.62], [2.5, 1.22], [1.75, 2.55], [2.85, 1.72]][k];
    var s = Math.min((w * 0.86) / fit[0], (h * 0.84) / (fit[1] * (rare >= 2 ? 1.06 : 1)));
    var eye = [[0.66, -0.06], [0.26, -0.04], [0.58, -0.06], [0.22, -0.02], [0.48, -0.1]][k];
    ctx.save();
    ctx.translate(x + w * 0.5, y + h * 0.52);
    tailOf(ctx, k, s, ext);
    ctx.fillStyle = body;
    ctx.fill();
    if (!sil) ink(ctx, s);
    bodyOf(ctx, k, s);
    ctx.fillStyle = body;
    ctx.fill();
    if (!sil) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = belly;
      var bellyAt = [[0.08, 0.16, 0.38, 0.16], [0.06, 0.14, 0.26, 0.18], [0.08, 0.12, 0.42, 0.12], [0.04, 0.14, 0.2, 0.2], [0.32, 0.16, 0.26, 0.16]][k];
      ctx.beginPath();
      ctx.ellipse(s * bellyAt[0], s * bellyAt[1], s * bellyAt[2], s * bellyAt[3], 0, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = mark;
      var pat = fish.pat | 0;
      var i;
      if (pat === 1) {
        var dots = [[-0.16, -0.04], [0.12, -0.08], [0.22, 0.06], [-0.02, 0.08]];
        for (i = 0; i < dots.length; i++) {
          ctx.beginPath();
          ctx.arc(s * dots[i][0], s * dots[i][1], s * 0.06, 0, 6.3);
          ctx.fill();
        }
      } else if (pat === 2) {
        for (i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(-s * 0.2 + i * s * 0.18, s * 0.02, s * 0.08, Math.PI * 1.05, Math.PI * 1.95);
          ctx.fill();
        }
      } else {
        for (i = 0; i < 3; i++) ctx.fillRect(-s * 0.24 + i * s * 0.16, -s * 0.7, s * 0.055, s * 1.4);
      }
      ctx.restore();
    }
    if (k === 1) {
      for (var sp = 0; sp < 4; sp++) {
        var ang = -2.4 + sp * 0.55;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * s * 0.58, Math.sin(ang) * s * 0.52 + s * 0.02, s * 0.07, ang - 1.2, ang + 1.2);
        ctx.closePath();
        ctx.fillStyle = body;
        ctx.fill();
        if (!sil) ink(ctx, s * 0.55);
      }
    }
    if (k === 3) {
      tallFin(ctx, s, -0.16, 0.36, -0.02, 0.96, 0.2, 0.38);
      ctx.fillStyle = body;
      ctx.fill();
      if (!sil) ink(ctx, s * 0.75);
    }
    dorsalOf(ctx, k, s);
    ctx.fillStyle = body;
    ctx.fill();
    if (!sil) ink(ctx, s * 0.75);
    if (!sil && rare >= 4) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffe56a';
      bodyOf(ctx, k, s);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = Math.max(4, s * 0.065);
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(1.8, s * 0.032);
      ctx.stroke();
      ctx.restore();
    }
    bodyOf(ctx, k, s);
    if (!sil) ink(ctx, s);
    var px = [0.16, 0.18, 0.18, 0.08, 0.28][k];
    var py = [0.2, 0.24, 0.18, 0.26, 0.24][k];
    ctx.beginPath();
    ctx.ellipse(s * px, s * py, Math.max(3.5, s * 0.1), Math.max(2.2, s * 0.062), -0.25, 0, 6.3);
    ctx.fillStyle = fin;
    ctx.fill();
    ctx.strokeStyle = finEdge;
    ctx.lineWidth = Math.max(1.1, s * 0.016);
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (!sil && rare >= 3) {
      var glow = [[-0.08, -0.16], [0.18, -0.06], [-0.22, 0.02]];
      for (var gi = 0; gi < glow.length; gi++) {
        ctx.beginPath();
        ctx.arc(s * glow[gi][0], s * glow[gi][1], s * 0.05, 0, 6.3);
        ctx.fillStyle = '#fff8c4';
        ctx.fill();
        ctx.lineWidth = Math.max(1.1, s * 0.014);
        ctx.strokeStyle = tone(body, 0.55);
        ctx.stroke();
      }
    }
    if (k === 4) {
      ctx.strokeStyle = finEdge;
      ctx.lineWidth = Math.max(1.6, s * 0.028);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.9, s * 0.1);
      ctx.quadraticCurveTo(s * 1.28, s * 0.18, s * 1.18, s * 0.42);
      ctx.moveTo(s * 0.82, s * 0.18);
      ctx.quadraticCurveTo(s * 1.22, s * 0.4, s * 1.02, s * 0.6);
      ctx.moveTo(s * 0.7, s * 0.24);
      ctx.quadraticCurveTo(s * 1.05, s * 0.5, s * 0.78, s * 0.68);
      ctx.stroke();
    }
    if (!sil) {
      var er = Math.max(3.2, s * (k === 4 ? 0.13 : 0.11));
      var ex = s * eye[0], ey = s * eye[1];
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.3); ctx.fill();
      ink(ctx, s * 0.55);
      ctx.fillStyle = '#16324a';
      ctx.beginPath(); ctx.arc(ex + er * 0.16, ey, er * 0.46, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex - er * 0.16, ey - er * 0.28, er * 0.22, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#16324a';
      ctx.lineWidth = Math.max(1.5, s * 0.028);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - er * 0.46, ey + er * 0.82);
      ctx.quadraticCurveTo(ex, ey + er * 1.12, ex + er * 0.46, ey + er * 0.82);
      ctx.stroke();
      if (rare >= 2) {
        var cx0 = k === 3 ? -s * 0.02 : ex;
        var cy0 = k === 3 ? -s * 1.12 : ey - er - s * 0.03;
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(cx0 - s * 0.11, cy0);
        ctx.lineTo(cx0 - s * 0.06, cy0 - s * 0.16);
        ctx.lineTo(cx0, cy0 - s * 0.04);
        ctx.lineTo(cx0 + s * 0.07, cy0 - s * 0.18);
        ctx.lineTo(cx0 + s * 0.12, cy0);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = Math.max(1.15, s * 0.016);
        ctx.strokeStyle = '#16324a';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function paintFish(ctx, fish, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    drawFish(ctx, fish, 0, 0, w, h, sil);
  }
  function paintBoot(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#6b4a34';
    ctx.beginPath();
    ctx.roundRect(w * 0.22, h * 0.28, w * 0.28, h * 0.48, 8);
    ctx.roundRect(w * 0.22, h * 0.55, w * 0.55, h * 0.22, 8);
    ctx.fill();
  }
  function paintDuck(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#ffd23a';
    ctx.beginPath(); ctx.ellipse(w * 0.48, h * 0.58, w * 0.28, h * 0.22, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.68, h * 0.38, h * 0.18, 0, 6.3); ctx.fill();
    if (!sil) {
      ctx.fillStyle = '#ff8a1a';
      ctx.beginPath(); ctx.moveTo(w * 0.78, h * 0.38); ctx.lineTo(w * 0.96, h * 0.42); ctx.lineTo(w * 0.78, h * 0.48); ctx.fill();
      ctx.fillStyle = '#243044';
      ctx.beginPath(); ctx.arc(w * 0.74, h * 0.34, 3, 0, 6.3); ctx.fill();
    }
  }
  function paintBottle(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#8fd4ff';
    ctx.beginPath(); ctx.roundRect(w * 0.38, h * 0.22, w * 0.24, h * 0.58, 8); ctx.fill();
    ctx.fillStyle = sil ? '#1b2436' : '#c48a4a';
    ctx.fillRect(w * 0.42, h * 0.14, w * 0.16, h * 0.12);
  }
  function paintChest(ctx, w, h, sil) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = sil ? '#1b2436' : '#e2b04a';
    ctx.beginPath(); ctx.roundRect(w * 0.18, h * 0.34, w * 0.64, h * 0.4, 8); ctx.fill();
    if (!sil) { ctx.fillStyle = '#fff3c4'; ctx.fillRect(w * 0.46, h * 0.46, w * 0.08, h * 0.14); }
  }

  function sprite(fish, big) {
    var key = (fish.boss ? 'z' : '') + fish.id + 'p' + (fish.pat | 0) + (big ? 'b' : 's');
    var c = cache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = big ? 360 : 96;
    c.height = big ? 200 : 56;
    paintFish(c.getContext('2d'), fish, c.width, c.height, false);
    cache[key] = c;
    return c;
  }
  function silhouette(fish) {
    var key = 'sil' + fish.id;
    var c = cache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = 96; c.height = 56;
    paintFish(c.getContext('2d'), fish, 96, 56, true);
    cache[key] = c;
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function backdrop(ctx, spot, t, night) {
    var pal = palette(spot, night);
    var g = ctx.createLinearGradient(0, 0, 0, 320);
    g.addColorStop(0, pal.sky0);
    g.addColorStop(0.58, pal.sky1);
    g.addColorStop(1, pal.sand);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 300);
    if (night < 0.4) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (var c = 0; c < 3; c++) {
        var cx = ((c * 440 + t * 16) % 1680) - 140;
        var cy = 34 + c * 20;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 56, 16, 0, 0, 6.3);
        ctx.ellipse(cx + 30, cy + 6, 34, 14, 0, 0, 6.3);
        ctx.ellipse(cx - 28, cy + 5, 28, 12, 0, 0, 6.3);
        ctx.fill();
      }
    }
    var sun = night > 0.08 ? 0 : Math.max(0, Math.min(0.38, ((t % 220) / 220) * 0.38));
    if (sun > 0.04) {
      ctx.globalAlpha = sun;
      var warm = ctx.createLinearGradient(0, 80, 0, 300);
      warm.addColorStop(0, 'rgba(255,122,58,0)');
      warm.addColorStop(1, '#ff7a3a');
      ctx.fillStyle = warm;
      ctx.fillRect(0, 80, 1280, 220);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = night > 0.55 ? '#f4f7ff' : (sun > 0.22 ? '#ffb15a' : '#ffe56a');
    ctx.beginPath(); ctx.arc(night > 0.55 ? 180 : 1040 - sun * 420, 78 + sun * 40, night > 0.55 ? 28 : 36, 0, 6.3); ctx.fill();
    ctx.fillStyle = pal.hill2;
    ctx.beginPath(); ctx.moveTo(0, 300);
    for (var x = 0; x <= 1280; x += 48) ctx.lineTo(x, 168 + Math.sin(x * 0.008 + 1) * 26);
    ctx.lineTo(1280, 300); ctx.fill();
    ctx.fillStyle = pal.hill;
    ctx.beginPath(); ctx.moveTo(0, 300);
    for (var x2 = 0; x2 <= 1280; x2 += 48) ctx.lineTo(x2, 210 + Math.sin(x2 * 0.01 + t * 0.05) * 18);
    ctx.lineTo(1280, 300); ctx.fill();
    return pal;
  }

  function water(ctx, pal, y, t, spot) {
    var g = ctx.createLinearGradient(0, y - 8, 0, 720);
    g.addColorStop(0, '#b7ecff');
    g.addColorStop(0.12, pal.water);
    g.addColorStop(0.55, pal.water);
    g.addColorStop(1, pal.deep);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 720);
    ctx.lineTo(0, y + 6);
    for (var wx = 0; wx <= 1280; wx += 32) ctx.lineTo(wx, y + Math.sin(wx * 0.018 + t * 0.9) * 8);
    ctx.lineTo(1280, 720);
    ctx.fill();
    var sheen = ctx.createLinearGradient(0, y, 0, y + 170);
    sheen.addColorStop(0, 'rgba(255,255,255,0.38)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, y, 1280, 170);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#fff6c2';
    for (var ray = 0; ray < 5; ray++) {
      var rx = 140 + ray * 240 + Math.sin(t * 0.25 + ray) * 16;
      ctx.beginPath();
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + 36, y + 4);
      ctx.lineTo(rx + 110, 720);
      ctx.lineTo(rx - 50, 720);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = pal.ripple;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    for (var i = 0; i < 6; i++) {
      ctx.beginPath();
      var yy = y + 28 + i * 58;
      for (var x = 0; x <= 1280; x += 24) {
        var dy = Math.sin(x * 0.02 + t * 1.6 + i) * (4 + i);
        if (x === 0) ctx.moveTo(x, yy + dy); else ctx.lineTo(x, yy + dy);
      }
      ctx.stroke();
    }
    if (spot === 1) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (var c = 0; c < 7; c++) {
        var cx = ((c * 190 + t * 90) % 1500) - 80;
        var cy = y + 70 + (c % 3) * 90;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 70, cy + Math.sin(t * 2 + c) * 4);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (var b = 0; b < 9; b++) {
      var rise = (t * 36 + b * 48) % 300;
      var bx = 80 + b * 130 + Math.sin(t + b) * 18;
      var br = 3 + (b % 3) * 2.2;
      ctx.beginPath();
      ctx.arc(bx, y + 300 - rise, br, 0, 6.3);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(bx - br * 0.3, y + 298 - rise, Math.max(1.2, br * 0.28), 0, 6.3);
      ctx.fill();
      ctx.globalAlpha = 0.65;
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (var fx = 0; fx <= 1280; fx += 20) {
      var fy = y + Math.sin(fx * 0.02 + t * 1.2) * 6;
      if (fx === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
    }
    ctx.stroke();
  }

  function props(ctx, spot, pal, t, y) {
    if (spot === 4) {
      ctx.fillStyle = '#14241e';
      for (var m = 0; m < 4; m++) {
        ctx.beginPath(); ctx.moveTo(980 + m * 40, y); ctx.lineTo(1000 + m * 40, y - 90); ctx.lineTo(1020 + m * 40, y); ctx.fill();
      }
    } else if (spot === 5) {
      ctx.fillStyle = '#3c1818';
      ctx.beginPath(); ctx.moveTo(980, y); ctx.lineTo(1100, 80); ctx.lineTo(1220, y); ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.globalAlpha = 0.8 + Math.sin(t * 4) * 0.2;
      ctx.beginPath(); ctx.moveTo(1060, 120); ctx.lineTo(1100, 70); ctx.lineTo(1140, 130); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (spot === 6) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (var c = 0; c < 4; c++) {
        var cx = 420 + c * 180 + Math.sin(t + c) * 8;
        ctx.beginPath(); ctx.ellipse(cx, y - 30, 50, 18, 0, 0, 6.3); ctx.fill();
      }
    }
  }

  function fishShadow(ctx, x, y, len, face, alpha, fam) {
    var id = (fam == null ? 0 : fam) % 10;
    var w = Math.max(40, Math.min(90, len || 60));
    var h = w * 0.58;
    var a = alpha == null ? 0.32 : alpha;
    if (a < 0.25) a = 0.25;
    if (a > 0.4) a = 0.4;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(face < 0 ? -1 : 1, 1);
    drawFish(ctx, { id: id, junk: 0, boss: 0, pat: 0 }, -w / 2, -h / 2, w, h, true);
    ctx.restore();
  }

  function dock(ctx, pal, y) {
    ctx.fillStyle = pal.wood;
    for (var i = 0; i < 8; i++) ctx.fillRect(100 + i * 145, y + 10, 14, 44);
    ctx.fillStyle = '#6b3e22';
    ctx.fillRect(40, y - 2, 1200, 18);
    ctx.fillStyle = '#c48a4a';
    ctx.fillRect(40, y - 2, 1200, 6);
  }

  function shore(ctx, pal, x, face, y, spot) {
    var right = face < 0;
    ctx.fillStyle = spot === 3 ? '#f7fbff' : pal.grass;
    ctx.beginPath();
    if (right) {
      ctx.moveTo(1280, y + 78); ctx.lineTo(1280, y - 8);
      ctx.quadraticCurveTo(x + 30, y - 34, x - 20, y + 4);
      ctx.lineTo(x - 36, y + 78);
    } else {
      ctx.moveTo(0, y + 78); ctx.lineTo(0, y - 8);
      ctx.quadraticCurveTo(x - 30, y - 34, x + 20, y + 4);
      ctx.lineTo(x + 36, y + 78);
    }
    ctx.closePath();
    ctx.fill();
    if (spot === 3) {
      ctx.fillStyle = '#d7ecf8';
      ctx.beginPath(); ctx.ellipse(x, y + 10, 78, 18, 0, 0, 6.3); ctx.fill();
      return;
    }
    if (spot === 4) {
      ctx.fillStyle = pal.wood;
      for (var p = 0; p < 6; p++) ctx.fillRect((right ? 1040 : 40) + p * 28, y + 8, 22, 16);
      ctx.fillStyle = '#6b3e22';
      ctx.fillRect(right ? 1040 : 40, y + 22, 168, 8);
      return;
    }
    if (spot === 5 || spot === 6) {
      ctx.fillStyle = spot === 6 ? '#f4f0ff' : '#8a6244';
      ctx.beginPath(); ctx.ellipse(x, y + 14, 64, 20, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = spot === 6 ? '#ffffff' : '#6d4a30';
      ctx.beginPath(); ctx.ellipse(x - 8, y + 10, 36, 12, 0, 0, 6.3); ctx.fill();
      return;
    }
    var x0 = right ? x - 78 : x - 24;
    ctx.fillStyle = pal.wood;
    ctx.fillRect(x0 + 16, y + 12, 10, 32);
    ctx.fillRect(x0 + 62, y + 14, 10, 34);
    ctx.fillStyle = '#6b3e22';
    ctx.fillRect(x0, y, 96, 16);
    ctx.fillStyle = '#c48a4a';
    ctx.fillRect(x0, y, 96, 5);
    if (spot === 0) {
      ctx.strokeStyle = '#1c6b30';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      var tuft = right ? [1156, 1196, 1236] : [24, 58, 96];
      for (var i = 0; i < tuft.length; i++) {
        ctx.beginPath();
        ctx.moveTo(tuft[i], y + 6);
        ctx.quadraticCurveTo(tuft[i] + 14, y - 48, tuft[i] - 6, y - 96);
        ctx.stroke();
      }
    }
  }

  function life(ctx, spot, pal, t, y) {
    if (spot === 0) {
      for (var pad = 0; pad < 4; pad++) {
        var px = 460 + pad * 190;
        var py = y + 54 + (pad % 2) * 78 + Math.sin(t * 0.9 + pad) * 9;
        ctx.fillStyle = '#1f8a3a';
        ctx.beginPath();
        ctx.ellipse(px, py, 58, 22, 0.15, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = '#16324a';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#7dff9a';
        ctx.beginPath(); ctx.ellipse(px - 6, py - 2, 22, 8, 0.1, 0, 6.3); ctx.fill();
        ctx.strokeStyle = '#146b28';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 8, py);
        ctx.lineTo(px + 28, py - 2);
        ctx.stroke();
        if (pad % 2 === 0) {
          ctx.fillStyle = '#ff7eb6';
          ctx.beginPath(); ctx.arc(px + 10, py - 8, 7, 0, 6.3); ctx.fill();
          ctx.fillStyle = '#ffe14a';
          ctx.beginPath(); ctx.arc(px + 10, py - 8, 3, 0, 6.3); ctx.fill();
        }
      }
      ctx.strokeStyle = '#1c6b30';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (var reed = 0; reed < 7; reed++) {
        var rx = 430 + reed * 18;
        ctx.beginPath();
        ctx.moveTo(rx, y + 16);
        ctx.quadraticCurveTo(rx + 16, y - 36, rx - 4, y - 92 - (reed % 3) * 16);
        ctx.stroke();
      }
      var hop = (t + 0.2) % 3.2;
      if (hop < 0.55) jumpFish(ctx, 760, y, hop / 0.55);
      var hop2 = (t + 1.7) % 3.6;
      if (hop2 < 0.5) jumpFish(ctx, 980, y + 10, hop2 / 0.5);
    }
    if (spot === 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, y - 6, 1280, 22);
      ctx.fillStyle = pal.deep;
      ctx.beginPath(); ctx.ellipse(760, y + 28, 130, 26, 0, 0, 6.3); ctx.fill();
    }
    if (spot === 0 || spot === 1 || spot === 2) dragonflies(ctx, t);
    if (spot === 0 || spot === 1) {
      ctx.strokeStyle = '#243044';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (var b = 0; b < 2; b++) {
        var bx = ((t * 36 + b * 420) % 1500) - 80;
        var by = 54 + b * 28 + Math.sin(t * 1.6 + b) * 8;
        var flap = Math.sin(t * 7 + b * 2) * 6;
        ctx.beginPath();
        ctx.moveTo(bx - 12, by + flap);
        ctx.quadraticCurveTo(bx - 5, by - 6, bx, by);
        ctx.quadraticCurveTo(bx + 5, by - 6, bx + 12, by + flap);
        ctx.stroke();
      }
    }
  }

  function jumpFish(ctx, x, y, u) {
    ctx.save();
    ctx.translate(x, y + 8 - Math.sin(u * 3.1416) * 64);
    ctx.rotate(-0.9 + u * 1.8);
    ctx.fillStyle = '#f0a030';
    ctx.beginPath();
    ctx.ellipse(8, 0, 16, 7, 0, 0, 6.3);
    ctx.moveTo(-6, 0); ctx.lineTo(-18, -7); ctx.lineTo(-18, 7); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function dragonflies(ctx, t) {
    for (var d = 0; d < 2; d++) {
      var x = 220 + d * 540 + Math.sin(t * 0.6 + d * 2) * 100;
      var y = 78 + Math.sin(t * 1.5 + d * 1.4) * 26;
      var flap = Math.sin(t * 20 + d) * 5;
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(210, 245, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-8, -2, 12, 4 + flap * 0.2, -0.6, 0, 6.3);
      ctx.ellipse(8, -2, 12, 4 - flap * 0.15, 0.6, 0, 6.3);
      ctx.stroke();
      ctx.fillStyle = '#1f6b38';
      ctx.fillRect(-9, -1.5, 18, 3);
      ctx.fillStyle = '#16324a';
      ctx.beginPath(); ctx.arc(9, 0, 2.4, 0, 6.3); ctx.fill();
      ctx.restore();
    }
  }

  function angler(ctx, x, y, face, shirt, t, pose, power, hat, scale) {
    pose = pose || 'idle';
    power = power || 0;
    t = t || 0;
    var lively = pose === 'idle' || pose === 'wait';
    var calm = typeof Kit !== 'undefined' && Kit.motion && Kit.motion.reduced();
    var sway = lively ? Math.sin(t * (pose === 'wait' ? 3.4 : 2.4)) * (pose === 'wait' ? 2.4 : 3) : (pose === 'reel' ? Math.sin(t * 12) * 1.6 : 0);
    var tap = 0;
    if (lively && !calm) {
      var cycle = (t * (pose === 'wait' ? 2.4 : 1.5)) % 1;
      if (cycle < 0.18) tap = Math.sin(cycle / 0.18 * Math.PI) * (pose === 'wait' ? 7 : 4);
    }
    var back = pose === 'cast' ? power : 0;
    var fight = pose === 'reel' ? 0.35 + power * 0.45 : 0;
    var sc = scale == null ? 1.72 : scale;
    ctx.save();
    ctx.translate(x, y + sway);
    ctx.scale((face < 0 ? -1 : 1) * sc, sc);
    ctx.translate(0, -18);
    if (pose === 'cast') ctx.rotate(-0.4 + power * 1.05);
    else if (pose === 'reel') ctx.rotate(0.16);
    else if (pose === 'cheer') ctx.translate(0, -16 - Math.abs(Math.sin(t * 9)) * 8);
    if (lively) ctx.scale(1, 1 + Math.sin(t * 2.2) * 0.04);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var ink = '#16324a';
    ctx.fillStyle = ink;
    roundRect(ctx, -24, 8, 20, 14, 6); ctx.fill();
    ctx.save();
    ctx.translate(0, -tap);
    roundRect(ctx, 4, 8, 20, 14, 6); ctx.fill();
    ctx.fillStyle = '#2a3a52';
    roundRect(ctx, 7, 10, 14, 9, 4); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2a3a52';
    roundRect(ctx, -21, 10, 14, 9, 4); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(-10, -4); ctx.lineTo(-12, 14);
    ctx.moveTo(10, -4); ctx.lineTo(12, 14);
    ctx.stroke();
    ctx.strokeStyle = '#44536e'; ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = ink;
    roundRect(ctx, -28, -58, 56, 56, 18); ctx.fill();
    ctx.fillStyle = shirt;
    roundRect(ctx, -23, -54, 46, 48, 16); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    roundRect(ctx, -16, -48, 16, 20, 8); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(0, -76, 24, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffd2b8';
    ctx.beginPath(); ctx.arc(0, -76, 20, 0, 6.3); ctx.fill();
    var blink = lively && !calm && ((t * 0.31) % 1) > 0.93;
    if (blink) {
      ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, -78); ctx.lineTo(-2, -78);
      ctx.moveTo(4, -78); ctx.lineTo(16, -78);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-8, -78, 7, 0, 6.3); ctx.arc(8, -78, 7, 0, 6.3); ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(-6, -78, 3.4, 0, 6.3); ctx.arc(10, -78, 3.4, 0, 6.3); ctx.fill();
    }
    ctx.strokeStyle = '#e07a62'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(1, -70, 8, 0.15, 1.15); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(0, -94, 28, 8, 0, 0, 6.3); ctx.fill();
    roundRect(ctx, -16, -114, 32, 22, 8); ctx.fill();
    ctx.fillStyle = hat ? '#ff5d7a' : '#ffcc00';
    ctx.beginPath(); ctx.ellipse(0, -94, 24, 6, 0, 0, 6.3); ctx.fill();
    roundRect(ctx, -13, -112, 26, 18, 7); ctx.fill();
    ctx.fillStyle = hat ? '#ffe14a' : shirt;
    ctx.fillRect(-13, -100, 26, 6);
    if (hat) {
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.moveTo(-10, -114); ctx.lineTo(-4, -128); ctx.lineTo(2, -114);
      ctx.moveTo(2, -114); ctx.lineTo(10, -130); ctx.lineTo(16, -112);
      ctx.fill();
    }
    var crank = pose === 'reel' ? t * 14 : 0;
    var handX = 26 + fight * 14 - back * 8 + (pose === 'reel' ? Math.cos(crank) * 9 : 0);
    var handY = -44 - fight * 12 - back * 10 + (pose === 'reel' ? Math.sin(crank) * 9 : 0);
    if (pose === 'cheer') { handX = 6; handY = -118; }
    ctx.strokeStyle = ink; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(10, -40); ctx.lineTo(handX, handY); ctx.stroke();
    ctx.strokeStyle = '#ffd2b8'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(10, -40); ctx.lineTo(handX, handY); ctx.stroke();
    var tipX = handX + 18 + fight * 22 - back * 10;
    var tipY = handY - 48 - back * 34 + fight * 16;
    ctx.strokeStyle = '#6b3e22'; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    var bow = fight * 22 + back * 8;
    ctx.bezierCurveTo(handX + 8, handY - 10 + bow, tipX - 8, (handY + tipY) / 2 + bow, tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(handX + 2, handY + 4, 7, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath(); ctx.arc(handX + 2, handY + 4, 4, 0, 6.3); ctx.fill();
    ctx.restore();
    var px = tipX;
    var py = lively ? tipY * (1 + Math.sin(t * 2.2) * 0.04) : tipY;
    if (pose === 'cheer') py += -16 - Math.abs(Math.sin(t * 9)) * 8;
    if (pose === 'cast' || pose === 'reel') {
      var rot = pose === 'cast' ? (-0.4 + power * 1.05) : 0.16;
      var nx = px * Math.cos(rot) - py * Math.sin(rot);
      var ny = px * Math.sin(rot) + py * Math.cos(rot);
      px = nx;
      py = ny;
    }
    py -= 18;
    return { x: x + px * (face < 0 ? -sc : sc), y: y + sway + py * sc };
  }

  function bobber(ctx, x, y, t, splash) {
    t = t || 0;
    splash = splash || 0;
    ctx.save();
    ctx.strokeStyle = '#f4fbff';
    ctx.lineWidth = 3;
    for (var i = 0; i < 3; i++) {
      var u = (t * 0.75 + i / 3) % 1;
      ctx.globalAlpha = (1 - u) * (0.45 + splash * 0.55);
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 12 + u * (34 + splash * 48), 5 + u * (10 + splash * 16), 0, 0, 6.3);
      ctx.stroke();
    }
    if (splash > 0.15) {
      ctx.globalAlpha = Math.min(1, splash);
      ctx.fillStyle = '#fff';
      for (var d = 0; d < 6; d++) {
        var ang = -2.6 + d * 1.05;
        var drop = 8 + splash * (12 + d * 6);
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * drop, y - Math.abs(Math.sin(ang)) * drop, 2.4 + (d % 2), 0, 6.3);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    var squash = 1 + splash * 0.45;
    ctx.translate(x, y);
    ctx.scale(1 / squash, squash);
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#243044';
    ctx.fillRect(-1.5, -18, 3, 12);
    ctx.restore();
  }

  function line(ctx, x1, y1, x2, y2, wobble, hot) {
    ctx.strokeStyle = hot ? '#ff8a3d' : 'rgba(255,255,255,0.92)';
    ctx.lineWidth = hot ? 4.5 : 2.5;
    var cx = (x1 + x2) / 2;
    var cy = (y1 + y2) / 2 + (hot ? 36 : -10) + (wobble || 0);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + (x2 - x1) * 0.25, y1 + (hot ? 20 : -16), cx, cy, x2, y2);
    ctx.stroke();
  }

  function hand(ctx, x, y, press) {
    ctx.save();
    ctx.translate(x, y + (press ? 8 : 0));
    ctx.fillStyle = '#ffd2b8';
    ctx.strokeStyle = '#16324a';
    ctx.lineWidth = 4;
    roundRect(ctx, -14, -6, 28, 36, 10); ctx.fill(); ctx.stroke();
    roundRect(ctx, -12, -18, 24, 14, 6); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function arcMeter(ctx, x, y, power) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(8, 24, 40, 0.78)';
    ctx.beginPath(); ctx.arc(x, y, 62, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(x, y, 62, Math.PI + 0.78 * Math.PI, Math.PI + 0.93 * Math.PI); ctx.stroke();
    ctx.strokeStyle = '#7ee0ff';
    ctx.lineWidth = 14;
    if (power > 0.02) {
      ctx.beginPath();
      ctx.arc(x, y, 62, Math.PI, Math.PI + Math.max(0.04, power) * Math.PI);
      ctx.stroke();
    }
  }

  function meter(ctx, x, y, power) {
    ctx.fillStyle = 'rgba(8,24,40,0.75)';
    roundRect(ctx, x, y, 26, 150, 10); ctx.fill();
    var sweet0 = y + 150 - 150 * 0.93;
    var sweet1 = y + 150 - 150 * 0.78;
    ctx.fillStyle = 'rgba(255, 210, 60, 0.9)';
    ctx.fillRect(x + 4, sweet0, 18, sweet1 - sweet0);
    ctx.fillStyle = '#7ee0ff';
    var h = 146 * power;
    ctx.fillRect(x + 4, y + 148 - h, 18, h);
  }

  function reel(ctx, x, y, w, a, t) {
    var hot = !!(a.fish && !a.inside);
    t = t || 0;
    var h = 92;
    ctx.fillStyle = 'rgba(4, 16, 32, 0.35)';
    roundRect(ctx, x + 8, y + 8, w, h, 22); ctx.fill();
    ctx.fillStyle = hot ? 'rgba(92, 16, 28, 0.94)' : 'rgba(8, 28, 52, 0.94)';
    roundRect(ctx, x, y, w, h, 22); ctx.fill();
    ctx.lineWidth = hot ? 6 : 4;
    ctx.strokeStyle = hot ? '#ff5d6a' : '#7dffb2';
    roundRect(ctx, x, y, w, h, 22); ctx.stroke();
    var trackX = x + 22, trackW = w - 44, trackY = y + 16, trackH = 58;
    ctx.fillStyle = '#1a8fd4';
    roundRect(ctx, trackX, trackY, trackW, trackH, 14); ctx.fill();
    var zh = Math.max(0.08, a.zoneH || 0.2);
    var zc = a.zoneY || 0.5;
    var zx = trackX + (zc - zh) * trackW;
    var zw = Math.max(16, zh * 2 * trackW);
    if (zx < trackX) { zw -= trackX - zx; zx = trackX; }
    if (zx + zw > trackX + trackW) zw = trackX + trackW - zx;
    ctx.fillStyle = '#3ddc6a';
    roundRect(ctx, zx, trackY + 8, Math.max(8, zw), trackH - 16, 10); ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = hot ? '#ff5d6a' : '#128a3c';
    roundRect(ctx, zx, trackY + 8, Math.max(8, zw), trackH - 16, 10); ctx.stroke();
    var rare = a.fish ? a.fish.rare || 0 : 0;
    var fy = a.fish ? a.fish.y : 0.5;
    var dart = Math.sin(t * (5 + rare * 3.2)) * (3 + rare * 4);
    var fx = trackX + fy * trackW + dart;
    fx = Math.max(trackX + 70, Math.min(trackX + trackW - 70, fx));
    var cy = trackY + trackH / 2;
    var wob = Math.sin(t * 8) * 0.2;
    ctx.strokeStyle = 'rgba(8, 40, 70, 0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(fx, cy, 28, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = a.inside ? '#ffe14a' : '#ff5d6a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(fx, cy, 28, -Math.PI / 2, -Math.PI / 2 + Math.max(0.04, a.prog || 0) * 6.2832);
    ctx.stroke();
    if (a.fish) {
      ctx.save();
      ctx.translate(fx, cy);
      ctx.rotate(wob);
      ctx.drawImage(sprite(a.fish, true), -30, -17, 60, 34);
      ctx.restore();
      if (a.fish.tell) {
        ctx.fillStyle = '#ffcc00';
        ctx.font = '700 28px Fredoka';
        ctx.textAlign = 'center';
        ctx.direction = 'ltr';
        ctx.fillText('!', fx, cy - 30);
      }
    }
    var side = fx > trackX + trackW * 0.72 ? -1 : 1;
    hand(ctx, fx + side * 54, cy + 6, Math.sin(t * 4) > 0.15);
  }

  function blit(ctx, fish, x, y, sc, t) {
    var img = sprite(fish, false);
    var w = img.width * sc, h = img.height * sc;
    var squash = 1;
    if (fish.boss || fish.rare >= 4) squash = 1 + Math.sin(t * 8) * 0.04;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, 1 / squash);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    if (fish.rb) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = ['#ff5d7a', '#ffd24a', '#7dffb2', '#7ec8ff', '#d9a6ff'][Math.floor(t * 6) % 5];
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.34, h * 0.28, 0, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (fish.glow) {
      ctx.globalAlpha = 0.35 + Math.sin(t * 5) * 0.15;
      ctx.fillStyle = '#fff6b0';
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, h * 0.4, 0, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function gull(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-6, -8, 8, 7, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#243044'; ctx.lineWidth = 2;
    var flap = Math.sin(t * 10) * 8;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-22, flap); ctx.moveTo(4, 0); ctx.lineTo(22, -flap); ctx.stroke();
    ctx.fillStyle = '#ff8a1a';
    ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(16, -6); ctx.lineTo(8, -4); ctx.fill();
    ctx.restore();
  }

  function label(ctx, text, x, y, size, color) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '700 ' + size + 'px Fredoka';
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, x, y);
  }

  window.LLArt = {
    palette: palette, backdrop: backdrop, water: water, props: props, life: life,
    shore: shore, dock: dock, fishShadow: fishShadow, angler: angler,
    bobber: bobber, line: line, meter: meter, arcMeter: arcMeter, hand: hand, reel: reel, blit: blit, gull: gull,
    label: label, sprite: sprite, silhouette: silhouette, paintFish: paintFish, drawFish: drawFish, famOf: famOf
  };
})();
