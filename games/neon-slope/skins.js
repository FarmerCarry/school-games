/*
 * Neon Slope — ball skins and trails.
 * Every pattern is drawn in code on a 256x128 equirectangular canvas that is
 * wrapped around the 3D ball. The shop preview re-projects the same canvas onto
 * a shaded 2D sphere, so previews always match the real ball.
 */
(function () {
  'use strict';
  var W = 256, H = 128, TAU = Math.PI * 2;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function fill(g, c) { g.fillStyle = c; g.fillRect(0, 0, W, H); }
  function dot(g, x, y, r, c) {
    g.fillStyle = c;
    // draw wrapped copies so patterns are seamless around the ball
    for (var k = -1; k <= 1; k++) { g.beginPath(); g.arc(x + k * W, y, r, 0, TAU); g.fill(); }
  }
  function ell(g, x, y, rx, ry, c) {
    g.fillStyle = c;
    for (var k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(x + k * W, y, rx, ry, 0, 0, TAU); g.fill(); }
  }

  var BALLS = [
    { id: 'neon', name: 'قلب النيون', price: 0, glow: '#3ff0ff', draw: function (g) {
      fill(g, '#0b1236');
      g.strokeStyle = '#3ff0ff'; g.lineWidth = 5; g.shadowColor = '#3ff0ff'; g.shadowBlur = 10;
      for (var i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, H); g.stroke(); }
      for (var j = 1; j < 4; j++) { g.beginPath(); g.moveTo(0, j * 32); g.lineTo(W, j * 32); g.stroke(); }
      g.shadowBlur = 0;
    } },
    { id: 'bubblegum', name: 'علكة', price: 25, glow: '#ff5fc8', draw: function (g) {
      fill(g, '#ff4fbf');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 22, W, 14); g.fillRect(0, 57, W, 14); g.fillRect(0, 92, W, 14);
      var r = rng(3);
      for (var i = 0; i < 30; i++) dot(g, r() * W, 40 + (r() < 0.5 ? 0 : 35) + r() * 12, 3, '#ffd1f0');
    } },
    { id: 'cookie', name: 'بسكويتة', price: 40, glow: '#ffb46b', draw: function (g) {
      fill(g, '#dba26a');
      var r = rng(7);
      for (var i = 0; i < 60; i++) dot(g, r() * W, r() * H, 2 + r() * 2, 'rgba(160,100,40,0.5)');
      for (var k = 0; k < 26; k++) ell(g, r() * W, 10 + r() * (H - 20), 6 + r() * 4, 5 + r() * 3, '#4a2812');
    } },
    { id: 'lime', name: 'ليمونة', price: 60, glow: '#7dff3a', draw: function (g) {
      fill(g, '#7dff3a');
      for (var y = 0; y < 4; y++) for (var x = 0; x < 8; x++) dot(g, x * 32 + (y % 2) * 16 + 8, y * 32 + 16, 8, '#2fa014');
    } },
    { id: 'checkers', name: 'شطرنج', price: 80, glow: '#ffffff', draw: function (g) {
      for (var y = 0; y < 4; y++) for (var x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#141414' : '#ffffff'; g.fillRect(x * 32, y * 32, 32, 32);
      }
    } },
    { id: 'tennis', name: 'كرة تنس', price: 100, glow: '#d7ff3d', draw: function (g) {
      fill(g, '#d4f53a');
      g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.beginPath();
      for (var x = 0; x <= W; x += 4) {
        var y = 64 + 34 * Math.sin(x / W * TAU * 2);
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    } },
    { id: 'eight', name: 'رقم الحظ', price: 120, glow: '#b98cff', draw: function (g) {
      fill(g, '#15121f');
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(64, 64, 26, 30, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(192, 64, 26, 30, 0, 0, TAU); g.fill();
      g.fillStyle = '#15121f'; g.font = 'bold 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('8', 64, 66); g.fillText('8', 192, 66);
    } },
    { id: 'melon', name: 'بطيخة', price: 150, glow: '#5fff6a', draw: function (g) {
      fill(g, '#79e36c');
      g.strokeStyle = '#1d7a2a'; g.lineWidth = 11;
      for (var k = 0; k < 8; k++) {
        g.beginPath();
        for (var y = 0; y <= H; y += 4) {
          var x = k * 32 + 6 * Math.sin(y * 0.18 + k);
          if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    } },
    { id: 'smiley', name: 'وجه ضاحك', price: 180, glow: '#ffd93b', draw: function (g) {
      fill(g, '#ffd93b');
      function face(cx, wink) {
        g.fillStyle = '#2b1a00';
        g.beginPath(); g.ellipse(cx - 17, 50, 6, 10, 0, 0, TAU); g.fill();
        if (wink) { g.fillRect(cx + 10, 50, 14, 4); }
        else { g.beginPath(); g.ellipse(cx + 17, 50, 6, 10, 0, 0, TAU); g.fill(); }
        g.strokeStyle = '#2b1a00'; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.arc(cx, 62, 24, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
        g.fillStyle = 'rgba(255,110,90,0.55)';
        g.beginPath(); g.arc(cx - 28, 70, 7, 0, TAU); g.fill();
        g.beginPath(); g.arc(cx + 28, 70, 7, 0, TAU); g.fill();
      }
      face(128, false); face(0, true); face(256, true);
    } },
    { id: 'beach', name: 'كرة الشاطئ', price: 220, glow: '#ffffff', draw: function (g) {
      var cols = ['#ff3b3b', '#ffffff', '#2f7bff', '#ffd93b', '#ffffff', '#2fd35f'];
      for (var i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.fillRect(i * W / 6, 0, W / 6 + 1, H); }
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, 12); g.fillRect(0, H - 12, W, 12);
    } },
    { id: 'pizza', name: 'بيتزا', price: 260, glow: '#ffb13b', draw: function (g) {
      fill(g, '#ffc83d');
      var r = rng(11);
      for (var i = 0; i < 40; i++) dot(g, r() * W, r() * H, 3 + r() * 3, '#ffe27a');
      for (var k = 0; k < 16; k++) {
        var x = r() * W, y = 14 + r() * (H - 28);
        dot(g, x, y, 11, '#d0312a'); dot(g, x - 3, y - 2, 2, '#8e1a14'); dot(g, x + 4, y + 3, 2, '#8e1a14');
      }
      for (var m = 0; m < 12; m++) { g.fillStyle = '#2f9e3a'; g.fillRect(r() * W, r() * H, 7, 3); }
    } },
    { id: 'disco', name: 'ديسكو', price: 320, glow: '#e0e8ff', draw: function (g) {
      fill(g, '#2a2a3a');
      var r = rng(5);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 16; x++) {
        var v = 150 + Math.floor(r() * 105), t = r();
        g.fillStyle = t < 0.12 ? 'rgb(255,' + (v - 60) + ',255)' : t < 0.24 ? 'rgb(' + (v - 60) + ',255,255)' : 'rgb(' + v + ',' + v + ',' + v + ')';
        g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      }
    } },
    { id: 'lava', name: 'صخرة الحمم', price: 380, glow: '#ff6a1a', draw: function (g) {
      fill(g, '#2a0c06');
      var r = rng(9);
      g.strokeStyle = '#ff7a1a'; g.lineWidth = 4; g.shadowColor = '#ffcc33'; g.shadowBlur = 12; g.lineCap = 'round';
      for (var i = 0; i < 16; i++) {
        var x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
        for (var s = 0; s < 5; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 30; g.lineTo(x, y); }
        g.stroke();
      }
      g.shadowBlur = 0;
      for (var k = 0; k < 10; k++) dot(g, r() * W, r() * H, 4, '#ffd23a');
    } },
    { id: 'planet', name: 'كوكب', price: 450, glow: '#4da6ff', draw: function (g) {
      fill(g, '#1a5cff');
      var r = rng(21);
      for (var i = 0; i < 9; i++) {
        var cx = r() * W, cy = 30 + r() * 68;
        for (var k = 0; k < 7; k++) ell(g, cx + (r() - 0.5) * 34, cy + (r() - 0.5) * 20, 10 + r() * 12, 7 + r() * 8, '#3bd35f');
      }
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, 13); g.fillRect(0, H - 13, W, 13);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (var c = 0; c < 8; c++) g.fillRect(r() * W, 20 + r() * 88, 40, 5);
    } },
    { id: 'gold', name: 'ذهب خالص', price: 750, glow: '#ffd21f', draw: function (g) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#fff6b0'); gr.addColorStop(0.45, '#ffc21a'); gr.addColorStop(1, '#a8740a');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (var i = 0; i < 4; i++) { g.save(); g.translate(i * 64 + 20, 0); g.rotate(0.35); g.fillRect(0, -20, 10, 180); g.restore(); }
    } },
    { id: 'comet', name: 'مذنّب', req: 800, glow: '#9ff3ff', draw: function (g) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#e8fdff'); gr.addColorStop(1, '#2a8cff');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      var r = rng(4);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
      for (var i = 0; i < 22; i++) { var x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y + 8); g.stroke(); }
    } },
    { id: 'galaxy', name: 'مجرّة', req: 1500, glow: '#c05bff', draw: function (g) {
      fill(g, '#10002a');
      var r = rng(8), cols = ['rgba(255,60,200,', 'rgba(80,120,255,', 'rgba(160,60,255,'];
      for (var i = 0; i < 14; i++) {
        var x = r() * W, y = r() * H, rad = 20 + r() * 30, c = cols[i % 3];
        for (var k = -1; k <= 1; k++) {
          var gr = g.createRadialGradient(x + k * W, y, 0, x + k * W, y, rad);
          gr.addColorStop(0, c + '0.7)'); gr.addColorStop(1, c + '0)');
          g.fillStyle = gr; g.fillRect(x + k * W - rad, y - rad, rad * 2, rad * 2);
        }
      }
      for (var s = 0; s < 70; s++) dot(g, r() * W, r() * H, r() < 0.15 ? 2 : 1, '#ffffff');
    } },
    { id: 'prism', name: 'ألوان الطيف', req: 2500, glow: '#ffffff', rainbow: true, draw: function (g) {
      for (var x = 0; x < W; x += 2) { g.fillStyle = 'hsl(' + (x / W * 720 % 360) + ',100%,58%)'; g.fillRect(x, 0, 2, H); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 56, W, 16);
    } }
  ];

  // Trails: ribbon colors plus an optional particle effect.
  var TRAILS = [
    { id: 'glow', name: 'توهّج', price: 0, fx: null },
    { id: 'sparkle', name: 'بريق', price: 40, fx: 'sparkle', colors: ['#ffffff', '#bff8ff'] },
    { id: 'fire', name: 'نار', price: 90, fx: 'fire', colors: ['#fff27a', '#ff9a1f', '#ff3b1f'] },
    { id: 'snow', name: 'ثلج', price: 120, fx: 'snow', colors: ['#ffffff', '#dff6ff'] },
    { id: 'confetti', name: 'قصاصات ملونة', price: 150, fx: 'confetti', colors: ['#ff4fbf', '#3ff0ff', '#ffd93b', '#7dff3a', '#a855ff'] },
    { id: 'bubbles', name: 'فقاعات', price: 190, fx: 'bubbles', colors: ['#7fd8ff', '#bff0ff', '#ffffff'] },
    { id: 'rainbow', name: 'قوس قزح', price: 240, fx: null, rainbow: true },
    { id: 'toxic', name: 'هلام أخضر', price: 280, fx: 'toxic', colors: ['#7dff3a', '#b6ff3a', '#2fd35f'] },
    { id: 'stars', name: 'غبار النجوم', price: 340, fx: 'stars', colors: ['#ffe14d', '#ffffff'] },
    { id: 'lightning', name: 'برق', req: 1200, fx: 'zap', colors: ['#bfe8ff', '#6fb6ff', '#ffffff'] },
    { id: 'plasma', name: 'بلازما', req: 2000, fx: 'zap', colors: ['#ff3fd0', '#b46bff', '#ffffff'] }
  ];

  var cache = {};
  function patternCanvas(skin) {
    if (cache[skin.id]) return cache[skin.id];
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d', { willReadFrequently: true });
    skin.draw(g);
    cache[skin.id] = c;
    return c;
  }
  var dataCache = {};
  function patternData(skin) {
    if (!dataCache[skin.id]) dataCache[skin.id] = patternCanvas(skin).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    return dataCache[skin.id];
  }

  // Draw a shaded ball preview of a skin into a canvas (square).
  function previewBall(canvas, skin, spin) {
    var size = canvas.width, g = canvas.getContext('2d', { willReadFrequently: true });
    var sd = patternData(skin);
    var rad = size * 0.4, cx = size / 2, cy = size / 2;
    g.clearRect(0, 0, size, size);
    // outer glow
    var gl = g.createRadialGradient(cx, cy, rad * 0.8, cx, cy, rad * 1.25);
    gl.addColorStop(0, hexA(skin.glow, 0.55)); gl.addColorStop(1, hexA(skin.glow, 0));
    g.fillStyle = gl; g.fillRect(0, 0, size, size);
    var img = g.getImageData(0, 0, size, size), d = img.data;
    var tilt = 0.45, ct = Math.cos(tilt), st = Math.sin(tilt), rot = spin || 0.6;
    var lx = -0.45, ly = -0.55, lz = 0.7;
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var nx = (px + 0.5 - cx) / rad, ny = (py + 0.5 - cy) / rad, rr = nx * nx + ny * ny;
        if (rr > 1) continue;
        var nz = Math.sqrt(1 - rr);
        // rotate around X so we look a bit from above
        var y2 = ny * ct - nz * st, z2 = ny * st + nz * ct;
        var lon = Math.atan2(nx, z2) + rot, lat = Math.asin(Math.max(-1, Math.min(1, -y2)));
        var u = ((lon / TAU + 0.5) % 1 + 1) % 1, v = 0.5 - lat / Math.PI;
        var sx = Math.min(W - 1, Math.floor(u * W)), sy = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
        var si = (sy * W + sx) * 4;
        var diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        var shade = 0.5 + 0.62 * diff;
        var spec = Math.pow(Math.max(0, diff), 24) * 160;
        var edge = rr > 0.9 ? (rr - 0.9) * 4 : 0;
        var o = (py * size + px) * 4;
        var a = rr > 0.96 ? (1 - rr) / 0.04 : 1;
        var r = sd[si] * shade + spec, gg = sd[si + 1] * shade + spec, b = sd[si + 2] * shade + spec;
        r = r * (1 - edge) + edge * 20; gg = gg * (1 - edge) + edge * 10; b = b * (1 - edge) + edge * 40;
        d[o] = Math.min(255, d[o] * (1 - a) + r * a);
        d[o + 1] = Math.min(255, d[o + 1] * (1 - a) + gg * a);
        d[o + 2] = Math.min(255, d[o + 2] * (1 - a) + b * a);
        d[o + 3] = Math.max(d[o + 3], Math.round(255 * a));
      }
    }
    g.putImageData(img, 0, 0);
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // Trail swatch: a glowing streak plus a small dot for the ball.
  function previewTrail(canvas, trail, ballSkin) {
    var size = canvas.width, g = canvas.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, size, size);
    var cols = trail.rainbow ? ['#ff3b3b', '#ffd93b', '#7dff3a', '#3ff0ff', '#a855ff'] :
      (trail.colors || [ballSkin.glow, ballSkin.glow]);
    var gr = g.createLinearGradient(size * 0.1, size * 0.85, size * 0.72, size * 0.3);
    gr.addColorStop(0, hexA(cols[cols.length - 1], 0));
    for (var i = 0; i < cols.length; i++) gr.addColorStop(0.25 + 0.75 * i / Math.max(1, cols.length - 1), hexA(cols[i], 0.95));
    g.strokeStyle = gr; g.lineCap = 'round';
    g.shadowColor = cols[0]; g.shadowBlur = 12;
    g.lineWidth = size * 0.16;
    g.beginPath(); g.moveTo(size * 0.12, size * 0.86);
    g.quadraticCurveTo(size * 0.3, size * 0.4, size * 0.7, size * 0.32); g.stroke();
    g.shadowBlur = 0;
    var r = rng(trail.id.length * 13);
    if (trail.fx) {
      for (var k = 0; k < 10; k++) {
        var t = r(), x = size * (0.15 + t * 0.5), y = size * (0.85 - t * 0.5) + (r() - 0.5) * size * 0.25;
        g.fillStyle = cols[k % cols.length];
        if (trail.fx === 'stars' || trail.fx === 'sparkle') star(g, x, y, size * 0.045);
        else if (trail.fx === 'zap') { g.fillRect(x, y, size * 0.06, size * 0.015); }
        else { g.beginPath(); g.arc(x, y, size * 0.03, 0, TAU); g.fill(); }
      }
    }
    var bc = document.createElement('canvas'); bc.width = bc.height = Math.round(size * 0.55);
    previewBall(bc, ballSkin);
    g.drawImage(bc, size * 0.47, size * 0.05);
  }
  function star(g, x, y, s) {
    g.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4, rr = i % 2 ? s * 0.35 : s;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }

  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }

  window.NS_SKINS = {
    balls: BALLS, trails: TRAILS,
    pattern: patternCanvas, previewBall: previewBall, previewTrail: previewTrail,
    ball: function (id) { return find(BALLS, id); },
    trail: function (id) { return find(TRAILS, id); }
  };
})();
