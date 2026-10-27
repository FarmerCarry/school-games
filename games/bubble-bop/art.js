/* Bubble Bop drawing. Sprites (bubbles, balloons, Bop, fireflies, fruit, the basket)
 * are drawn once into offscreen canvases and then only blitted; a scene background is
 * rendered once per scene and pixel scale. Per frame there are only blits and a few
 * plain paths: no shadowBlur and no gradients made while playing. No image files. */
(function () {
  'use strict';
  var BB = window.BB, W = BB.W, H = BB.H, TAU = Math.PI * 2, INK = '#1c2250';
  var A = BB.art = {};
  var SS = 2; // sprites are drawn at twice their logical size
  A.INK = INK;
  A.TINTS = ['#ff8fd0', '#ffd25e', '#a9ef5e', '#c3a0ff', '#ffad66', '#7dffcf'];
  A.BALLOONS = ['#ff4d6d', '#3fa2ff', '#ffd23f', '#35d07f', '#b06bff', '#ff8a1f'];
  A.FRUIT = ['#ff4d4d', '#ff9f1c', '#b5e34d', '#ff3b5c', '#9b5de5'];
  A.RAINBOW = ['#ff5d6c', '#ff9f43', '#ffd23f', '#5be38f', '#4fd1ff', '#b48cff'];
  // Islands on the map, right to left like Arabic reading: world 1 is on the right.
  A.ISLANDS = [{ x: 1086, y: 452 }, { x: 858, y: 236 }, { x: 640, y: 452 }, { x: 422, y: 236 }, { x: 194, y: 452 }];

  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function ink(g, lw) { g.lineWidth = lw || 5; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(hex, a) { return 'rgb(' + rgb(hex).map(function (v) { return Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)); }).join(',') + ')'; }
  function alpha(hex, a) { return 'rgba(' + rgb(hex).join(',') + ',' + a + ')'; }
  function starPath(g, x, y, R, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath();
  }
  function vgrad(g, stops, y0, y1) {
    var gr = g.createLinearGradient(0, y0 || 0, 0, y1 || H);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    return gr;
  }
  // A tiny seeded generator for decoration, so every background looks the same each time.
  function seeded(n) { return function () { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }
  A.circle = circle; A.rr = rr; A.shade = shade; A.starPath = starPath;

  var cache = {};
  function sprite(key, w, h, draw) {
    if (cache[key]) return cache[key];
    var c = cv(w * SS, h * SS), g = c.getContext('2d');
    g.scale(SS, SS); draw(g, w, h);
    return (cache[key] = c);
  }

  /* -------------------------------------------------------------- bubble */
  function bubbleSprite(i, gold) {
    return sprite('b' + i + (gold ? 'g' : ''), 156, 156, function (g) {
      var c = gold ? '#ffc93c' : A.TINTS[i % 6], x = 78, y = 78, R = 72;
      var gr = g.createRadialGradient(x - 22, y - 26, 6, x, y, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, alpha(c, gold ? 0.75 : 0.42)); gr.addColorStop(1, alpha(c, 0.95));
      circle(g, x, y, R); fill(g, gr); ink(g, 6);
      g.lineCap = 'round'; g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.arc(x, y, R - 13, Math.PI * 1.06, Math.PI * 1.4); g.stroke();
      g.beginPath(); g.arc(x, y, R - 13, Math.PI * 1.5, Math.PI * 1.58); g.stroke();
      g.lineWidth = 5; g.strokeStyle = 'rgba(255,110,200,0.8)'; g.beginPath(); g.arc(x, y, R - 8, 0.2, 0.95); g.stroke();
      g.strokeStyle = 'rgba(255,236,90,0.9)'; g.beginPath(); g.arc(x, y, R - 14, 0.3, 0.85); g.stroke();
      circle(g, x - 34, y - 30, 8); fill(g, '#fff');
      if (gold) { starPath(g, x, y + 4, 34, 15); fill(g, '#fff6c2'); ink(g, 5); }
    });
  }
  A.bubble = function (ctx, b, time, still) {
    var s = bubbleSprite(b.color, b.gold), wob = still ? 0 : Math.sin(time * 5 + b.phase) * 0.045;
    var y = b.y + (still ? 0 : Math.sin(time * 2.2 + b.phase) * 3), rx = b.r * (1 + wob) * 78 / 72, ry = b.r * (1 - wob) * 78 / 72;
    ctx.drawImage(s, b.x - rx, y - ry, rx * 2, ry * 2);
  };

  /* ------------------------------------------------------------- balloon */
  function balloonSprite(i, gold) {
    return sprite('l' + i + (gold ? 'g' : ''), 156, 200, function (g) {
      var c = gold ? '#ffc93c' : A.BALLOONS[i % 6], x = 78, y = 90, R = 70, ry = R * 1.18;
      g.beginPath(); g.moveTo(x - 13, y + ry + 16); g.lineTo(x + 13, y + ry + 16); g.lineTo(x, y + ry - 4); g.closePath();
      fill(g, shade(c, -0.2)); ink(g, 5);
      var gr = g.createRadialGradient(x - 24, y - 36, 6, x, y, ry);
      gr.addColorStop(0, shade(c, 0.55)); gr.addColorStop(0.45, c); gr.addColorStop(1, shade(c, -0.22));
      ell(g, x, y, R, ry); fill(g, gr); ink(g, 6);
      ell(g, x - 28, y - 36, 11, 23, -0.45); fill(g, 'rgba(255,255,255,0.85)');
      circle(g, x - 38, y - 2, 5); fill(g, 'rgba(255,255,255,0.85)');
      if (gold) { starPath(g, x, y + 4, 30, 13); fill(g, '#fff6c2'); ink(g, 5); }
    });
  }
  A.balloon = function (ctx, b, time, still) {
    var grow = b.grow == null ? 1 : b.grow, k = b.r / 70 * (0.25 + 0.75 * (1 - Math.pow(1 - grow, 3)));
    if (b.hot) k *= 1.07;
    var tilt = still ? 0 : Math.sin(time * 1.7 + b.phase) * 0.07 + (b.hot ? Math.sin(time * 22) * 0.06 : 0);
    var sy = b.y + 98 * k, sw = still ? 0 : Math.sin(time * 2.4 + b.phase) * 10;
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x, sy); ctx.bezierCurveTo(b.x + sw, sy + 34, b.x - sw, sy + 62, b.x + sw * 0.6, sy + 92); ctx.stroke();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(tilt); ctx.scale(k, k);
    ctx.drawImage(balloonSprite(b.color, b.gold), -78, -90, 156, 200);
    ctx.restore();
  };

  /* ------------------------------------------------------------ firefly */
  function glowSprite(col) {
    return sprite('glow' + col, 128, 128, function (g) {
      var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, alpha(col, 0.85)); gr.addColorStop(0.35, alpha(col, 0.35)); gr.addColorStop(1, alpha(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
  }
  A.glow = glowSprite;
  function flySprite(gold) {
    return sprite('fly' + (gold ? 'g' : ''), 72, 64, function (g) {
      var body = gold ? '#ffb703' : '#6b4fd8';
      circle(g, 18, 36, 13); fill(g, '#fff27a'); ink(g, 4);                      // glowing tail
      circle(g, 18, 36, 6); fill(g, '#ffffff');
      ell(g, 38, 32, 20, 17); fill(g, body); ink(g, 4);
      g.beginPath(); g.moveTo(46, 17); g.quadraticCurveTo(50, 4, 58, 6); g.moveTo(52, 20); g.quadraticCurveTo(62, 12, 66, 18); ink(g, 3);
      circle(g, 58, 6, 3); fill(g, INK); circle(g, 66, 18, 3); fill(g, INK);
      circle(g, 46, 28, 8); fill(g, '#fff'); ink(g, 3); circle(g, 48, 28, 4); fill(g, INK);
      circle(g, 49, 26, 1.5); fill(g, '#fff');
      g.beginPath(); g.arc(46, 38, 5, 0.2, Math.PI - 0.2); ink(g, 2.5);
    });
  }
  A.fly = function (ctx, f, time, still) {
    var s = f.r / 26, pulse = still ? 0.8 : 0.6 + 0.4 * Math.sin(time * 6 + f.phase), dir = f.dir || 1;
    ctx.globalAlpha = 0.45 + 0.4 * pulse;
    ctx.drawImage(glowSprite(f.gold ? '#ffd23f' : '#f4ff7a'), f.x - 70 * s - dir * 18 * s, f.y - 64 * s, 128 * s, 128 * s);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(dir * s, s);
    var flap = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 34 + f.phase);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ell(ctx, -4, -16, 12, 5 + 7 * flap, -0.5); ctx.fill(); ctx.stroke();
    ell(ctx, 8, -18, 11, 4 + 7 * flap, 0.4); ctx.fill(); ctx.stroke();
    ctx.drawImage(flySprite(f.gold), -38, -32, 72, 64);
    ctx.restore();
  };

  /* --------------------------------------------------------------- fruit */
  function fruitSprite(type, gold) {
    return sprite('f' + type + (gold ? 'g' : ''), 84, 92, function (g) {
      var c = gold ? '#ffc93c' : A.FRUIT[type % 5], x = 42, y = 52;
      g.lineJoin = 'round';
      if (type === 2 && !gold) { // pear
        g.beginPath(); g.arc(x, y - 14, 17, Math.PI * 0.9, Math.PI * 2.1); g.arc(x, y + 10, 27, -0.3, Math.PI + 0.3); g.closePath();
      } else if (type === 3 && !gold) { // strawberry
        g.beginPath(); g.moveTo(x, y + 34); g.bezierCurveTo(x - 40, y + 6, x - 36, y - 30, x, y - 22); g.bezierCurveTo(x + 36, y - 30, x + 40, y + 6, x, y + 34);
      } else if (type === 4 && !gold) { // grapes
        [[0, -18], [-14, -6], [14, -6], [0, 6], [-14, 18], [14, 18], [0, 30]].forEach(function (p) { circle(g, x + p[0], y + p[1] - 4, 12); fill(g, c); ink(g, 4); circle(g, x + p[0] - 4, y + p[1] - 8, 3); fill(g, 'rgba(255,255,255,0.7)'); });
        g.beginPath(); g.moveTo(x, y - 28); g.lineTo(x + 4, y - 42); ink(g, 5);
        return;
      } else { // apple, orange, gold apple
        g.beginPath(); g.moveTo(x, y - 20);
        g.bezierCurveTo(x + 18, y - 34, x + 40, y - 18, x + 32, y + 8);
        g.bezierCurveTo(x + 26, y + 30, x + 10, y + 36, x, y + 30);
        g.bezierCurveTo(x - 10, y + 36, x - 26, y + 30, x - 32, y + 8);
        g.bezierCurveTo(x - 40, y - 18, x - 18, y - 34, x, y - 20);
        if (type === 1 && !gold) { g.closePath(); g.beginPath(); circle(g, x, y + 4, 31); }
      }
      fill(g, c); ink(g, 5);
      ell(g, x - 13, y - 6, 6, 11, 0.5); fill(g, 'rgba(255,255,255,0.7)');
      if (type === 3 && !gold) {
        g.fillStyle = '#ffe66d';
        [[-10, 0], [8, -4], [-2, 12], [12, 10], [-14, 14], [0, -10]].forEach(function (p) { ell(g, x + p[0], y + p[1], 2.4, 3.4); g.fill(); });
        g.beginPath(); g.moveTo(x - 20, y - 22); g.lineTo(x - 6, y - 30); g.lineTo(x, y - 40); g.lineTo(x + 6, y - 30); g.lineTo(x + 20, y - 22); g.lineTo(x, y - 18); g.closePath(); fill(g, '#3ecf5a'); ink(g, 4);
      } else {
        g.beginPath(); g.moveTo(x, y - 20); g.quadraticCurveTo(x + 2, y - 34, x + 6, y - 40); ink(g, 6); g.strokeStyle = '#7a4a1e'; g.lineWidth = 3; g.stroke();
        g.beginPath(); g.ellipse(x + 15, y - 34, 11, 6, -0.5, 0, TAU); fill(g, '#3ecf5a'); ink(g, 3.5);
      }
      if (gold) { starPath(g, x, y + 6, 16, 7); fill(g, '#fff6c2'); ink(g, 3); }
    });
  }
  A.fruit = function (ctx, f, time, still) {
    var s = f.r / 34, spin = still ? 0 : Math.sin(time * 3 + f.phase) * 0.18;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(spin); ctx.scale(s, s);
    ctx.drawImage(fruitSprite(f.type || 0, f.gold), -42, -52, 84, 92);
    ctx.restore();
  };
  // Where a fruit will land: a shadow that darkens as it falls.
  A.fruitShadow = function (ctx, f) {
    var k = Math.max(0, Math.min(1, (f.y - 60) / (BB.BASKET.y - 60)));
    ctx.fillStyle = 'rgba(28,34,80,' + (0.12 + 0.25 * k) + ')';
    ell(ctx, f.x, BB.BASKET.ground - 4, 18 + 16 * k, 6 + 3 * k); ctx.fill();
  };

  /* ---------------------------------------------------------------- Bop */
  function colorOf(i) { var c = (BB.COLORS[i] || BB.COLORS[0]).c; return c === 'rainbow' ? '#ff9ad5' : c; }
  A.colorOf = colorOf;
  function bopBody(ci) {
    return sprite('bop' + ci, 120, 120, function (g) {
      var x = 60, y = 60, R = 50, col = BB.COLORS[ci] ? BB.COLORS[ci].c : BB.COLORS[0].c, f;
      if (col === 'rainbow') {
        f = g.createLinearGradient(x - R, y - R, x + R, y + R);
        A.RAINBOW.forEach(function (c, i) { f.addColorStop(i / 5, c); });
      } else {
        f = g.createRadialGradient(x - 18, y - 22, 6, x, y, R);
        f.addColorStop(0, shade(col, 0.55)); f.addColorStop(0.6, col); f.addColorStop(1, shade(col, -0.22));
      }
      circle(g, x, y, R); fill(g, f); ink(g, 6);
      ell(g, x - 32, y + 14, 9, 6); fill(g, 'rgba(255,90,140,0.5)');
      ell(g, x + 32, y + 14, 9, 6); fill(g, 'rgba(255,90,140,0.5)');
      ell(g, x - 22, y - 30, 13, 7, -0.6); fill(g, 'rgba(255,255,255,0.85)');
    });
  }
  // o: { color, hat, time, still, scale, vx, vy, look: {x, y}, happy (0..1), sleepy }
  A.bop = function (ctx, x, y, o) {
    var s = (o.scale || 1) * BB.BOP_R / 50, t = o.time || 0, still = o.still;
    var vx = o.vx || 0, vy = o.vy || 0, sp = Math.sqrt(vx * vx + vy * vy), str = still ? 0 : Math.min(0.2, sp / 3200);
    var bob = still ? 0 : Math.sin(t * 3) * 3 * s, col = colorOf(o.color);
    ctx.globalAlpha = still ? 0.6 : 0.55 + 0.15 * Math.sin(t * 4);
    ctx.drawImage(glowSprite(col), x - 100 * s, y - 100 * s + bob, 200 * s, 200 * s);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(x, y + bob);
    if (str > 0.01) { var a = Math.atan2(vy, vx); ctx.rotate(a); ctx.scale(1 + str, 1 - str * 0.7); ctx.rotate(-a); }
    var happy = o.happy || 0, jig = still ? 0 : happy * Math.sin(t * 18) * 0.08;
    ctx.rotate(jig); ctx.scale(s * (1 + happy * 0.08), s * (1 - happy * 0.04));
    ctx.drawImage(bopBody(o.color || 0), -60, -60, 120, 120);
    // Eyes follow what Bop looks at.
    var lx = 0, ly = 0;
    if (o.look) { var dx = o.look.x - x, dy = o.look.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1; lx = dx / d * 4.5; ly = dy / d * 4.5; }
    var blink = !still && !happy && t % 3.9 < 0.13;
    for (var e = -1; e <= 1; e += 2) {
      var ex = e * 17, ey = -8;
      if (happy > 0.2) { ctx.beginPath(); ctx.arc(ex, ey + 4, 9, Math.PI * 1.15, Math.PI * 1.85); ink(ctx, 4.5); }
      else if (blink || o.sleepy) { ctx.beginPath(); ctx.moveTo(ex - 9, ey + 2); ctx.quadraticCurveTo(ex, ey + 7, ex + 9, ey + 2); ink(ctx, 4); }
      else {
        ell(ctx, ex, ey, 11, 13); fill(ctx, '#fff'); ink(ctx, 3.5);
        circle(ctx, ex + lx, ey + ly + 1, 6.5); fill(ctx, INK);
        circle(ctx, ex + lx + 2, ey + ly - 2, 2.2); fill(ctx, '#fff');
      }
    }
    if (happy > 0.2) {
      ctx.beginPath(); ctx.moveTo(-13, 12); ctx.quadraticCurveTo(0, 34, 13, 12); ctx.closePath(); fill(ctx, '#7a1f3d'); ink(ctx, 4);
      ell(ctx, 0, 20, 6, 4); fill(ctx, '#ff7a9c');
    } else { ctx.beginPath(); ctx.arc(0, 10, 10, 0.2 * Math.PI, 0.8 * Math.PI); ink(ctx, 4.5); }
    if (o.hat) A.hat(ctx, o.hat, t, still);
    ctx.restore();
  };
  // Hats, drawn in Bop's own coordinates (radius 50, head top at y = -50).
  A.hat = function (g, i, t, still) {
    var id = (BB.HATS[i] || BB.HATS[0]).id;
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (id === 'bow') {
      g.save(); g.translate(26, -42); g.rotate(0.3);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-22, -14); g.lineTo(-22, 14); g.closePath(); fill(g, '#ff5d9e'); ink(g, 4);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(22, -14); g.lineTo(22, 14); g.closePath(); fill(g, '#ff5d9e'); ink(g, 4);
      circle(g, 0, 0, 7); fill(g, '#ff8fc0'); ink(g, 4); g.restore();
    } else if (id === 'cap') {
      g.beginPath(); g.arc(0, -36, 36, Math.PI, 0); g.closePath(); fill(g, '#3f7cff'); ink(g, 5);
      g.beginPath(); g.moveTo(30, -38); g.quadraticCurveTo(66, -40, 70, -30); g.lineTo(30, -30); g.closePath(); fill(g, '#2f5fd0'); ink(g, 5);
      circle(g, 0, -72, 5); fill(g, '#ffd23f'); ink(g, 3);
    } else if (id === 'flower') {
      g.beginPath(); g.moveTo(-6, -48); g.quadraticCurveTo(-10, -62, -4, -70); ink(g, 5); g.strokeStyle = '#3ecf5a'; g.lineWidth = 3; g.stroke();
      for (var p = 0; p < 6; p++) { var a = p / 6 * TAU + (still ? 0 : t * 0.6); ell(g, -4 + Math.cos(a) * 13, -82 + Math.sin(a) * 13, 9, 6, a); fill(g, '#fff'); ink(g, 3); }
      circle(g, -4, -82, 8); fill(g, '#ffd23f'); ink(g, 3);
    } else if (id === 'party') {
      g.beginPath(); g.moveTo(-26, -40); g.lineTo(4, -108); g.lineTo(26, -42); g.closePath(); fill(g, '#ff7eb6'); ink(g, 5);
      g.save(); g.clip(); g.strokeStyle = '#ffd23f'; g.lineWidth = 8;
      for (var k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-40, -46 - k * 18); g.lineTo(40, -60 - k * 18); g.stroke(); }
      g.restore(); g.beginPath(); g.moveTo(-26, -40); g.lineTo(4, -108); g.lineTo(26, -42); g.closePath(); ink(g, 5);
      circle(g, 4, -110, 9); fill(g, '#4fd1ff'); ink(g, 4);
    } else if (id === 'crown') {
      g.beginPath(); g.moveTo(-30, -38); g.lineTo(-34, -78); g.lineTo(-16, -60); g.lineTo(0, -86); g.lineTo(16, -60); g.lineTo(34, -78); g.lineTo(30, -38); g.closePath();
      fill(g, '#ffcc00'); ink(g, 5);
      circle(g, 0, -52, 6); fill(g, '#ff5d6c'); ink(g, 3); circle(g, -18, -48, 4); fill(g, '#4fd1ff'); circle(g, 18, -48, 4); fill(g, '#5be38f');
    } else if (id === 'phones') {
      g.beginPath(); g.arc(0, -10, 54, Math.PI * 1.08, Math.PI * 1.92); g.lineWidth = 14; g.strokeStyle = INK; g.stroke(); g.lineWidth = 8; g.strokeStyle = '#ff5d6c'; g.stroke();
      rr(g, -66, -26, 22, 40, 10); fill(g, '#ff5d6c'); ink(g, 5); rr(g, 44, -26, 22, 40, 10); fill(g, '#ff5d6c'); ink(g, 5);
    } else if (id === 'wizard') {
      g.beginPath(); g.moveTo(-46, -38); g.quadraticCurveTo(0, -54, 46, -38); g.quadraticCurveTo(0, -30, -46, -38); fill(g, '#6a3fd0'); ink(g, 5);
      g.beginPath(); g.moveTo(-26, -42); g.quadraticCurveTo(-4, -90, 18, -122); g.quadraticCurveTo(14, -80, 26, -44); g.closePath(); fill(g, '#7b4fe0'); ink(g, 5);
      starPath(g, 0, -70, 10, 4.5); fill(g, '#ffd23f'); ink(g, 2.5); circle(g, 12, -96, 3); fill(g, '#ffd23f');
    } else if (id === 'astro') {
      circle(g, 0, 0, 64); g.fillStyle = 'rgba(200,240,255,0.28)'; g.fill(); ink(g, 5);
      g.beginPath(); g.arc(0, 0, 54, Math.PI * 1.15, Math.PI * 1.45); g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
      g.beginPath(); g.moveTo(26, -58); g.lineTo(36, -84); ink(g, 5); circle(g, 36, -86, 7); fill(g, '#ff5d6c'); ink(g, 3);
    } else if (id === 'halo') {
      ell(g, 0, -74, 34, 10); g.lineWidth = 12; g.strokeStyle = INK; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#ffd23f'; g.stroke();
      for (var q = 0; q < 3; q++) { var b = (still ? q : t * 2 + q * 2.1); starPath(g, Math.cos(b) * 50, -74 + Math.sin(b) * 14, 7, 3); fill(g, '#fff6a0'); ink(g, 2); }
    }
  };
  // Closet and reward tiles: Bop in one colour, or wearing one hat.
  A.itemIcon = function (canvas, item, save) {
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    var color = item.type === 'color' ? item.i : save.color, hat = item.type === 'hat' ? item.i : 0;
    var sc = w / 132 * (hat ? 0.95 : 1.15);
    A.bop(g, w / 2, h / 2 + (hat ? 14 : 6) * w / 132, { color: color, hat: hat, still: true, scale: sc });
  };

  /* --------------------------------------------------------------- frog */
  A.frog = function (ctx, frog, time, still, land, look) {
    var x = frog.x, y = frog.y, st = frog.air ? Math.max(-0.22, Math.min(0.3, -frog.vy / 1500)) : -0.16 * (land || 0);
    var sx = 1 - st * 0.55, sy = 1 + st, e;
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
    for (e = -1; e <= 1; e += 2) {
      if (frog.air) {
        // legs kicked down
        ctx.beginPath(); ctx.moveTo(e * 30, -26); ctx.lineTo(e * 40, 26);
        ctx.lineWidth = 24; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 14; ctx.strokeStyle = '#3cbf52'; ctx.stroke();
        ell(ctx, e * 48, 32, 22, 9, e * 0.3); fill(ctx, '#34a849'); ink(ctx, 4);
      } else {
        // folded haunches and big flat feet
        ell(ctx, e * 64, -4, 24, 9); fill(ctx, '#34a849'); ink(ctx, 4);
        ell(ctx, e * 44, -24, 28, 22, e * 0.5); fill(ctx, '#45c75a'); ink(ctx, 5);
      }
    }
    ell(ctx, 0, -48, 58, 46); fill(ctx, '#4fd165'); ink(ctx, 6);
    ell(ctx, 0, -32, 36, 24); fill(ctx, '#d4f7a6');
    var lx = 0, ly = 0;
    if (look) { var dx = look.x - x, dy = look.y - (y - 88), d = Math.sqrt(dx * dx + dy * dy) || 1; lx = dx / d * 6; ly = dy / d * 6; }
    for (e = -1; e <= 1; e += 2) {
      circle(ctx, e * 27, -88, 22); fill(ctx, '#4fd165'); ink(ctx, 6);
      circle(ctx, e * 27, -90, 15); fill(ctx, '#fff');
      circle(ctx, e * 27 + lx, -90 + ly, 8); fill(ctx, INK);
      circle(ctx, e * 27 + lx + 3, -93 + ly, 2.6); fill(ctx, '#fff');
    }
    ell(ctx, -38, -46, 9, 6); fill(ctx, 'rgba(255,110,150,0.55)'); ell(ctx, 38, -46, 9, 6); fill(ctx, 'rgba(255,110,150,0.55)');
    ctx.beginPath(); ctx.arc(0, -62, 30, 0.18 * Math.PI, 0.82 * Math.PI); ink(ctx, 5);
    ell(ctx, -20, -6, 13, 7); fill(ctx, '#3cbf52'); ink(ctx, 4); ell(ctx, 20, -6, 13, 7); fill(ctx, '#3cbf52'); ink(ctx, 4);
    ctx.restore();
    if (frog.tongue > 0) {
      var mx = x, my = y - 38 * sy, k = Math.min(1, frog.tongue / 0.11);
      var tx = mx + (frog.tx - mx) * k, ty = my + (frog.ty - my) * k;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tx, ty); ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 9; ctx.strokeStyle = '#ff6f91'; ctx.stroke();
      circle(ctx, tx, ty, 11); fill(ctx, '#ff6f91'); ink(ctx, 4);
    }
  };

  /* ------------------------------------------------------------- basket */
  function basketParts() {
    var back = sprite('bk0', 280, 120, function (g) {
      ell(g, 140, 26, 128, 22); fill(g, '#7a4a1e'); ink(g, 5);
    });
    var front = sprite('bk1', 280, 120, function (g) {
      g.beginPath(); g.moveTo(12, 26); g.lineTo(38, 106); g.quadraticCurveTo(140, 118, 242, 106); g.lineTo(268, 26); g.quadraticCurveTo(140, 56, 12, 26); g.closePath();
      fill(g, '#d9893d'); ink(g, 6);
      g.save(); g.clip(); g.strokeStyle = '#b4672a'; g.lineWidth = 5;
      for (var i = 0; i < 9; i++) { g.beginPath(); g.moveTo(28 + i * 28, 40); g.lineTo(44 + i * 24, 112); g.stroke(); }
      for (var j = 0; j < 3; j++) { g.beginPath(); g.moveTo(10, 62 + j * 18); g.quadraticCurveTo(140, 92 + j * 18, 270, 62 + j * 18); g.stroke(); }
      g.restore();
      g.beginPath(); g.moveTo(10, 26); g.quadraticCurveTo(140, 58, 270, 26); g.lineWidth = 16; g.strokeStyle = INK; g.stroke(); g.lineWidth = 9; g.strokeStyle = '#f2b061'; g.stroke();
    });
    return [back, front];
  }
  // inside(ctx) draws what sits in the basket (Bop, the fruit pile) between its back and front.
  A.basket = function (ctx, bk, inside) {
    var parts = basketParts(), k = bk.hw / 125, sq = bk.squash || 0;
    ctx.save(); ctx.translate(bk.x, BB.BASKET.y); ctx.scale(k * (1 + sq * 0.08), 1 - sq * 0.1);
    ctx.drawImage(parts[0], -140, -26, 280, 120);
    ctx.restore();
    if (inside) inside(ctx);
    ctx.save(); ctx.translate(bk.x, BB.BASKET.y); ctx.scale(k * (1 + sq * 0.08), 1 - sq * 0.1);
    ctx.drawImage(parts[1], -140, -26, 280, 120);
    ctx.restore();
  };

  /* ------------------------------------------------------- on-screen keys */
  function keyCap(ctx, k, st, dx) {
    var x = k.x - k.w / 2 + (dx || 0), y = k.y - k.h / 2, d = st.down ? 6 : 0;
    if (st.glow > 0) {
      ctx.globalAlpha = Math.min(1, 0.3 + 0.6 * st.glow);
      rr(ctx, x - 11, y - 11, k.w + 22, k.h + 24, 24); ctx.lineWidth = 9; ctx.strokeStyle = '#ffcc00'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    rr(ctx, x, y + 8, k.w, k.h, 16); fill(ctx, '#8f98c4'); ink(ctx, 5);
    rr(ctx, x, y + d, k.w, k.h - 2, 16); fill(ctx, st.down ? '#ffe066' : '#ffffff'); ink(ctx, 5);
    return d;
  }
  // st: { down, glow 0..1, wiggle 0..1, time, still }
  A.spaceBar = function (ctx, st) {
    var k = BB.KEYS.space, dx = st.wiggle > 0 && !st.still ? Math.sin(st.time * 46) * 10 * st.wiggle : 0;
    var d = keyCap(ctx, k, st, dx);
    ctx.beginPath(); ctx.moveTo(k.x + dx - 64, k.y - 10 + d); ctx.lineTo(k.x + dx - 64, k.y + 6 + d); ctx.lineTo(k.x + dx + 64, k.y + 6 + d); ctx.lineTo(k.x + dx + 64, k.y - 10 + d); ink(ctx, 6);
  };
  A.arrowKey = function (ctx, side, st) {
    var k = BB.KEYS[side], dx = st.wiggle > 0 && !st.still ? Math.sin(st.time * 46) * 8 * st.wiggle : 0, d = keyCap(ctx, k, st, dx), e = side === 'left' ? -1 : 1;
    var cx = k.x + dx, cy = k.y - 4 + d;
    ctx.beginPath(); ctx.moveTo(cx + e * 26, cy); ctx.lineTo(cx - e * 6, cy - 22); ctx.lineTo(cx - e * 6, cy - 9); ctx.lineTo(cx - e * 28, cy - 9);
    ctx.lineTo(cx - e * 28, cy + 9); ctx.lineTo(cx - e * 6, cy + 9); ctx.lineTo(cx - e * 6, cy + 22); ctx.closePath(); fill(ctx, INK);
    ctx.font = '700 17px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillStyle = '#5a6390';
    ctx.fillText(side === 'left' ? 'A' : 'D', cx + e * 40, k.y + 24 + d - 4);
  };
  // st: { move 0..1, click 0..1, hint 0..1, time, still }
  A.mouseIcon = function (ctx, st) {
    var k = BB.KEYS.mouse, x = k.x - k.w / 2 + (st.still ? 0 : Math.sin(st.time * 9) * 6 * st.move), y = k.y - k.h / 2;
    ctx.beginPath(); ctx.moveTo(x + k.w / 2, y); ctx.bezierCurveTo(x + k.w / 2, y - 18, x + k.w / 2 + 24, y - 14, x + k.w / 2 + 18, y - 34); ink(ctx, 4);
    if (st.move > 0.05 && !st.still) {
      ctx.globalAlpha = st.move; ctx.beginPath();
      for (var i = 0; i < 3; i++) { ctx.moveTo(x - 10, y + 30 + i * 18); ctx.lineTo(x - 26, y + 30 + i * 18); }
      ink(ctx, 4); ctx.globalAlpha = 1;
    }
    circle(ctx, k.x, k.y, 70); ctx.fillStyle = 'rgba(28,34,80,0.28)'; ctx.fill();
    rr(ctx, x, y, k.w, k.h, k.w / 2); fill(ctx, '#ffffff'); ink(ctx, 5);
    // The left button: it lights when the child clicks, and pulses when a click is wanted.
    ctx.save(); rr(ctx, x, y, k.w, k.h, k.w / 2); ctx.clip();
    var lit = Math.max(st.click, st.hint * (st.still ? 0.6 : 0.35 + 0.35 * Math.sin(st.time * 7)));
    if (lit > 0.02) { ctx.globalAlpha = Math.min(1, lit); ctx.fillStyle = '#ffcc00'; ctx.fillRect(x, y, k.w / 2, k.h * 0.42); ctx.globalAlpha = 1; }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x + k.w / 2, y + 2); ctx.lineTo(x + k.w / 2, y + k.h * 0.42); ctx.moveTo(x + 2, y + k.h * 0.42); ctx.lineTo(x + k.w - 2, y + k.h * 0.42); ink(ctx, 4);
    rr(ctx, x + k.w / 2 - 6, y + 14, 12, 20, 6); fill(ctx, '#c8cfea'); ink(ctx, 3);
  };

  /* --------------------------------------------------------- HUD bits */
  // The pulsing ring on the next target.
  A.ring = function (ctx, x, y, r, time, still) {
    var p = still ? 0.5 : (Math.sin(time * 6) + 1) / 2, rad = r + 12 + p * 8;
    circle(ctx, x, y, rad); ctx.lineWidth = 11; ctx.strokeStyle = 'rgba(28,34,80,' + (0.25 + 0.2 * p) + ')'; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,204,0,' + (0.65 + 0.35 * p) + ')'; ctx.stroke();
  };
  function pipIcon(ctx, kind, x, y, r, time) {
    var t = { x: x, y: y, r: r, color: 0, phase: 0, type: 0, dir: 1, grow: 1 };
    if (kind === 'touch') A.bubble(ctx, t, time, true);
    else if (kind === 'tap') { var s = r / 70; ctx.drawImage(balloonSprite(0), x - 78 * s, y - 90 * s, 156 * s, 200 * s); }
    else if (kind === 'jump') { t.r = r * 1.1; A.fly(ctx, t, time, true); }
    else A.fruit(ctx, t, time, true);
  }
  // A row of pips for the targets of this level part: filled ones are done.
  A.pips = function (ctx, kind, goal, done, time, still, bump) {
    var gap = goal > 20 ? 30 : goal > 14 ? 36 : 44, r = goal > 20 ? 11 : goal > 14 ? 13 : 16, x0 = W / 2 - (goal - 1) * gap / 2, y = 44;
    rr(ctx, x0 - gap / 2 - 10, y - r - 12, (goal - 1) * gap + gap + 20, r * 2 + 24, r + 12); ctx.fillStyle = 'rgba(28,34,80,0.6)'; ctx.fill();
    // Right to left, like the child reads.
    for (var i = 0; i < goal; i++) {
      var x = x0 + (goal - 1 - i) * gap;
      if (i < done) {
        var k = i === done - 1 && bump > 0 && !still ? 1 + 0.5 * bump : 1;
        pipIcon(ctx, kind, x, y, r * k, time);
      } else { circle(ctx, x, y, r * 0.72); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke(); }
    }
  };
  // Small icons for the four parts of a world-5 level: the current one is big.
  A.parts = function (ctx, modes, current, time) {
    for (var i = 0; i < modes.length; i++) {
      var x = 1150 - i * 46, y = 44, on = i === current;
      circle(ctx, x, y, on ? 20 : 15); ctx.fillStyle = i < current ? 'rgba(61,220,132,0.9)' : on ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)'; ctx.fill(); ink(ctx, 3);
      pipIcon(ctx, modes[i], x, y, on ? 12 : 9, time);
    }
  };
  function outlined(ctx, text, x, y, size, color, rtl) {
    ctx.font = '700 ' + size + 'px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(5, size / 6); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  A.text = outlined;
  // The party HUD: score, combo multiplier, and a clock ring (no reading needed).
  A.partyHud = function (ctx, o) {
    var x = W / 2, y = 50;
    rr(ctx, x - 150, 12, 300, 76, 38); ctx.fillStyle = 'rgba(28,34,80,0.55)'; ctx.fill();
    outlined(ctx, String(o.score), x + 26, y + 2, 46, '#ffffff');
    var cx = x - 104, frac = Math.max(0, Math.min(1, o.left / o.total)), warn = o.left <= 5;
    circle(ctx, cx, y, 28); fill(ctx, '#ffffff'); ink(ctx, 5);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.arc(cx, y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.closePath();
    fill(ctx, warn ? '#ff5d6c' : '#3ddc84');
    if (o.mult > 1) {
      var bx = x + 190, s = 1 + (o.still ? 0 : 0.15 * Math.max(0, o.multBump));
      ctx.save(); ctx.translate(bx, y); ctx.scale(s, s);
      starPath(ctx, 0, 0, 40, 26, 0.1); fill(ctx, '#ffcc00'); ink(ctx, 5);
      outlined(ctx, '×' + o.mult, 0, 3, 28, '#ffffff');
      ctx.restore();
    }
    // four waves: filled dots for the ones reached, right to left like the pips
    for (var i = 0; i < 4; i++) { circle(ctx, x + 26 - i * 22, y + 50, 7); fill(ctx, i < (o.wave || 1) ? '#ffd23f' : 'rgba(255,255,255,0.35)'); ink(ctx, 3); }
    if (o.best > 0) {
      var cx2 = x - 196;
      ctx.beginPath(); ctx.moveTo(cx2 - 40, y - 8); ctx.lineTo(cx2 - 33, y + 12); ctx.lineTo(cx2 - 15, y + 12); ctx.lineTo(cx2 - 8, y - 8); ctx.lineTo(cx2 - 18, y); ctx.lineTo(cx2 - 24, y - 14); ctx.lineTo(cx2 - 30, y); ctx.closePath();
      fill(ctx, '#ffd23f'); ink(ctx, 4);
      outlined(ctx, String(o.best), cx2 + 22, y + 3, 28, '#ffe066');
    }
  };
  // The picture that opens a level part: what to touch, click, catch, and with what.
  A.intro = function (ctx, mode, k, time, still) {
    var a = k < 0.2 ? k / 0.2 : k > 0.75 ? (1 - k) / 0.25 : 1, s = still ? 1 : 0.6 + 0.4 * Math.min(1, k / 0.25);
    ctx.globalAlpha = Math.max(0, a);
    ctx.save(); ctx.translate(W / 2, H / 2 - 20); ctx.scale(s, s);
    circle(ctx, 0, 0, 96); fill(ctx, 'rgba(255,255,255,0.92)'); ink(ctx, 7);
    pipIcon(ctx, mode, 0, 0, 54, time);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------- backgrounds */
  function sand(g, y, color) {
    g.beginPath(); g.moveTo(0, y);
    for (var x = 0; x <= W; x += 160) g.quadraticCurveTo(x + 80, y + (x / 160 % 2 ? 18 : -14), x + 160, y);
    g.lineTo(W, H + 10); g.lineTo(0, H + 10); g.closePath(); fill(g, color); ink(g, 5);
  }
  function cloud(g, x, y, s) {
    g.beginPath(); g.arc(x - 40 * s, y + 4 * s, 26 * s, 0, TAU); g.arc(x, y - 12 * s, 36 * s, 0, TAU); g.arc(x + 42 * s, y + 4 * s, 26 * s, 0, TAU);
    g.rect(x - 40 * s, y + 4 * s, 82 * s, 26 * s); fill(g, '#ffffff');
    g.beginPath(); g.moveTo(x - 66 * s, y + 30 * s); g.lineTo(x + 68 * s, y + 30 * s); g.lineWidth = 3; g.strokeStyle = 'rgba(28,34,80,0.18)'; g.stroke();
  }
  function hill(g, y, h, color, seed) {
    var r = seeded(seed);
    g.beginPath(); g.moveTo(-20, H + 10); g.lineTo(-20, y);
    for (var x = -20; x <= W + 200; x += 220) g.quadraticCurveTo(x + 110, y - h * (0.6 + 0.6 * r()), x + 220, y);
    g.lineTo(W + 20, H + 10); g.closePath(); fill(g, color); ink(g, 5);
  }
  function seaweed(g, x, y, h, color) {
    g.beginPath(); g.moveTo(x, y);
    for (var i = 1; i <= 6; i++) g.quadraticCurveTo(x + (i % 2 ? 22 : -22), y - h * (i - 0.5) / 6, x, y - h * i / 6);
    g.lineWidth = 20; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); g.lineWidth = 12; g.strokeStyle = color; g.stroke();
  }
  function flowers(g, y0, y1, n, seed) {
    var r = seeded(seed), cols = ['#ff7eb6', '#ffd23f', '#ffffff', '#b48cff'];
    for (var i = 0; i < n; i++) {
      var x = r() * W, y = y0 + r() * (y1 - y0), c = cols[i % 4];
      for (var p = 0; p < 5; p++) { circle(g, x + Math.cos(p * 1.256) * 6, y + Math.sin(p * 1.256) * 6, 4.5); fill(g, c); }
      circle(g, x, y, 3.5); fill(g, '#ff9f1c');
    }
  }
  function tree(g, x, y, s) {
    rr(g, x - 16 * s, y - 10 * s, 32 * s, 90 * s, 10 * s); fill(g, '#9b5d2e'); ink(g, 5);
    g.beginPath(); g.arc(x - 44 * s, y - 20 * s, 44 * s, 0, TAU); g.arc(x + 44 * s, y - 20 * s, 44 * s, 0, TAU); g.arc(x, y - 60 * s, 56 * s, 0, TAU);
    fill(g, '#3fb950');
    g.beginPath(); g.arc(x - 44 * s, y - 20 * s, 44 * s, 0.5, Math.PI * 1.25); g.arc(x, y - 60 * s, 56 * s, Math.PI * 1.05, Math.PI * 1.95); g.arc(x + 44 * s, y - 20 * s, 44 * s, Math.PI * 1.75, Math.PI * 2.5); ink(g, 5);
    [[-50, -22], [-10, -70], [30, -40], [52, -6], [-28, -50], [8, -18]].forEach(function (p) { circle(g, x + p[0] * s, y + p[1] * s, 9 * s); fill(g, '#ff4d4d'); ink(g, 3); });
  }
  var SCENES = {
    sea: function (g) {
      g.fillStyle = vgrad(g, [[0, '#8ff3ff'], [0.42, '#33bdf0'], [1, '#0d63b4']]); g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.09)';
      [100, 360, 690, 960, 1170].forEach(function (x, i) { g.beginPath(); g.moveTo(x - 40, 0); g.lineTo(x + 50, 0); g.lineTo(x + 240 + i * 10, H); g.lineTo(x + 70, H); g.closePath(); g.fill(); });
      g.beginPath(); for (var x = 0; x <= W; x += 32) g.lineTo(x, 16 + Math.sin(x / 36) * 6); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.stroke();
      g.beginPath(); g.moveTo(0, 600); g.quadraticCurveTo(200, 520, 380, 590); g.quadraticCurveTo(620, 540, 860, 596); g.quadraticCurveTo(1080, 520, 1280, 580); g.lineTo(1280, 720); g.lineTo(0, 720); g.closePath(); fill(g, '#1f6fbe');
      seaweed(g, 70, 670, 210, '#38c76a'); seaweed(g, 130, 680, 140, '#2fae5b'); seaweed(g, 1180, 676, 230, '#38c76a'); seaweed(g, 1236, 690, 130, '#2fae5b'); seaweed(g, 520, 690, 110, '#2fae5b');
      sand(g, 652, '#ffd98a');
      var r = seeded(7);
      for (var i = 0; i < 46; i++) { circle(g, r() * W, 672 + r() * 44, 2 + r() * 2.5); fill(g, 'rgba(180,120,40,0.35)'); }
      starPath(g, 300, 684, 22, 10, 0.3); fill(g, '#ff7e9e'); ink(g, 4);
      starPath(g, 960, 690, 18, 8, -0.2); fill(g, '#ffb347'); ink(g, 4);
      [[820, 676], [430, 690]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 16, Math.PI, 0); g.closePath(); fill(g, '#ffe8f0'); ink(g, 4); });
      for (i = 0; i < 18; i++) { circle(g, r() * W, 90 + r() * 480, 3 + r() * 6); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke(); }
    },
    sky: function (g) {
      g.fillStyle = vgrad(g, [[0, '#62c8ff'], [0.6, '#bdeeff'], [1, '#eafaff']]); g.fillRect(0, 0, W, H);
      circle(g, 1120, 110, 58); fill(g, '#ffe066'); ink(g, 5);
      g.beginPath(); for (var i = 0; i < 12; i++) { var a = i / 12 * TAU; g.moveTo(1120 + Math.cos(a) * 74, 110 + Math.sin(a) * 74); g.lineTo(1120 + Math.cos(a) * 94, 110 + Math.sin(a) * 94); }
      g.lineWidth = 7; g.strokeStyle = '#ffcc00'; g.lineCap = 'round'; g.stroke();
      cloud(g, 200, 120, 1.1); cloud(g, 560, 80, 0.8); cloud(g, 880, 170, 0.9); cloud(g, 420, 250, 0.6);
      hill(g, 600, 90, '#9be56f', 3); hill(g, 650, 70, '#5cc94c', 11);
      flowers(g, 668, 712, 28, 5);
    },
    pond: function (g) {
      g.fillStyle = vgrad(g, [[0, '#251f5e'], [0.45, '#5a3c9e'], [0.72, '#f08fb0'], [0.78, '#ffc4a0']], 0, 560); g.fillRect(0, 0, W, 560);
      var r = seeded(3);
      for (var i = 0; i < 60; i++) { var x = r() * W, y = r() * 380; circle(g, x, y, 1 + r() * 1.8); fill(g, 'rgba(255,255,255,' + (0.4 + r() * 0.5) + ')'); }
      circle(g, 210, 118, 48); fill(g, '#fff6c8'); ink(g, 4);
      circle(g, 196, 104, 9); fill(g, '#efe2a6'); circle(g, 226, 132, 6); fill(g, '#efe2a6');
      g.beginPath(); g.moveTo(0, 520); for (var x2 = 0; x2 <= W; x2 += 80) g.quadraticCurveTo(x2 + 40, 470 + (x2 / 80 % 3) * 12, x2 + 80, 520); g.lineTo(W, 560); g.lineTo(0, 560); g.closePath(); fill(g, '#3d2a6e');
      g.fillStyle = vgrad(g, [[0, '#2f6db0'], [1, '#163a73']], 540, H); g.fillRect(0, 540, W, H - 540);
      g.beginPath(); g.moveTo(0, 541); g.lineTo(W, 541); ink(g, 5);
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 4;
      for (i = 0; i < 9; i++) { var wx = 60 + r() * 1160, wy = 580 + r() * 120; g.beginPath(); g.moveTo(wx - 40, wy); g.quadraticCurveTo(wx, wy - 8, wx + 40, wy); g.stroke(); }
      [[40, 560, 170], [96, 566, 120], [1196, 560, 180], [1250, 566, 120]].forEach(function (p) {
        g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + 8, p[1] - p[2] / 2, p[0] + 2, p[1] - p[2]); g.lineWidth = 12; g.strokeStyle = INK; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#3aa05a'; g.stroke();
        rr(g, p[0] - 6, p[1] - p[2] - 4, 14, 36, 7); fill(g, '#8a5a2b'); ink(g, 4);
      });
      [[220, 640, 56], [1040, 660, 50], [380, 690, 40]].forEach(function (p) { lily(g, p[0], p[1], p[2]); });
      lily(g, BB.FROG.x, BB.FROG.ground + 12, 132);
      [[250, 628], [1062, 648]].forEach(function (p) { for (var k = 0; k < 6; k++) { ell(g, p[0] + Math.cos(k) * 8, p[1] - 6 + Math.sin(k) * 5, 8, 4, k); fill(g, '#ff9ad5'); } circle(g, p[0], p[1] - 6, 4); fill(g, '#ffd23f'); });
    },
    orchard: function (g) {
      g.fillStyle = vgrad(g, [[0, '#8fe0ff'], [1, '#e6fbff']]); g.fillRect(0, 0, W, H);
      cloud(g, 640, 210, 0.9); cloud(g, 360, 280, 0.6); cloud(g, 930, 300, 0.7);
      hill(g, 610, 70, '#a6e879', 21);
      rr(g, 40, 80, 70, 600, 20); fill(g, '#9b5d2e'); ink(g, 5); rr(g, 1170, 80, 70, 600, 20); fill(g, '#9b5d2e'); ink(g, 5);
      g.beginPath(); g.moveTo(-20, -20); g.lineTo(-20, 96);
      for (var x = -20; x <= W + 40; x += 90) g.quadraticCurveTo(x + 45, 150 + (x / 90 % 2) * 24, x + 90, 100);
      g.lineTo(W + 20, -20); g.closePath(); fill(g, '#3fb950'); ink(g, 6);
      var r = seeded(9);
      // Apples in the leaves, but none behind the pause button, the pips or the mute
      // button: a red dot there reads like a fruit already caught.
      for (var i = 0, n = 0; i < 90 && n < 14; i++) {
        var ax = 30 + r() * 1220, ay = 18 + r() * 80;
        if (ax < 116 || (ax > 300 && ax < 980) || ax > 1196) continue;
        circle(g, ax, ay, 9); fill(g, n++ % 4 ? '#ff4d4d' : '#ffb703'); ink(g, 3);
      }
      g.beginPath(); g.moveTo(0, 662); g.lineTo(W, 662); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); fill(g, '#6ed14f'); ink(g, 5);
      for (i = 0; i < 9; i++) { var fx = 150 + i * 122; rr(g, fx, 618, 16, 50, 6); fill(g, '#f7e3c4'); ink(g, 3.5); }
      g.beginPath(); g.moveTo(140, 634); g.lineTo(1140, 634); g.moveTo(140, 652); g.lineTo(1140, 652); g.lineWidth = 8; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#f7e3c4'; g.stroke();
      flowers(g, 676, 714, 24, 13);
    },
    party: function (g) {
      g.fillStyle = vgrad(g, [[0, '#2c1660'], [0.6, '#6a34b8'], [1, '#a85fd6']]); g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath(); g.moveTo(140, -10); g.lineTo(220, -10); g.lineTo(620, 640); g.lineTo(300, 640); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(1060, -10); g.lineTo(1140, -10); g.lineTo(980, 640); g.lineTo(660, 640); g.closePath(); g.fill();
      var r = seeded(17), cols = ['#ff5d6c', '#ffd23f', '#4fd1ff', '#5be38f', '#ff7eb6', '#b48cff'];
      for (var i = 0; i < 70; i++) { g.save(); g.translate(r() * W, 120 + r() * 480); g.rotate(r() * 3); g.fillStyle = cols[i % 6]; g.globalAlpha = 0.55; g.fillRect(-5, -3, 10, 6); g.restore(); }
      g.globalAlpha = 1;
      g.beginPath(); g.moveTo(-10, 100); g.quadraticCurveTo(W / 2, 160, W + 10, 100); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      for (i = 0; i < 16; i++) {
        var t = (i + 0.5) / 16, x = t * W, y = 100 + 120 * t * (1 - t);
        g.beginPath(); g.moveTo(x - 26, y - 2); g.lineTo(x + 26, y - 2); g.lineTo(x, y + 40); g.closePath(); fill(g, cols[i % 6]); ink(g, 4);
      }
      g.beginPath(); g.moveTo(0, 632); g.lineTo(W, 632); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); fill(g, '#ffb347'); ink(g, 5);
      g.strokeStyle = '#d98a2b'; g.lineWidth = 4;
      for (i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 654 + i * 20); g.lineTo(W, 654 + i * 20); g.stroke(); }
      g.beginPath(); g.moveTo(0, 632); g.lineTo(W, 632); g.lineWidth = 10; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#ffd08a'; g.stroke();
    },
    map: function (g) {
      g.fillStyle = vgrad(g, [[0, '#6fd8ff'], [1, '#2a8fe0']]); g.fillRect(0, 0, W, H);
      var r = seeded(5);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 4; g.lineCap = 'round';
      for (var i = 0; i < 26; i++) { var x = r() * W, y = 110 + r() * 600; g.beginPath(); g.arc(x, y, 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.beginPath(); g.arc(x + 26, y, 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      // the dotted way from island to island
      g.setLineDash([2, 24]); g.lineWidth = 14; g.strokeStyle = INK; g.lineCap = 'round';
      g.beginPath(); A.ISLANDS.forEach(function (p, j) { if (j) { var q = A.ISLANDS[j - 1]; g.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 + 60, p.x, p.y); } else g.moveTo(p.x, p.y); }); g.stroke();
      g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke(); g.setLineDash([]);
      A.ISLANDS.forEach(function (p, j) { island(g, p.x, p.y, j); });
    }
  };
  function lily(g, x, y, s) {
    g.beginPath(); g.ellipse(x, y, s, s * 0.26, 0, 0.18, TAU - 0.18); g.lineTo(x, y); g.closePath(); fill(g, '#3fbf63'); ink(g, 5);
    g.beginPath(); g.moveTo(x - s * 0.6, y - 2); g.lineTo(x + s * 0.2, y + s * 0.12); g.lineWidth = 3; g.strokeStyle = 'rgba(28,34,80,0.3)'; g.stroke();
  }
  function island(g, x, y, j) {
    ell(g, x, y + 30, 132, 46); fill(g, 'rgba(20,70,140,0.35)');
    ell(g, x, y + 16, 126, 54); fill(g, '#ffe39a'); ink(g, 5);
    g.beginPath(); g.ellipse(x, y + 4, 104, 38, 0, 0, TAU); fill(g, '#78d76b'); ink(g, 4);
    var t = { x: 0, y: 0, r: 26, color: 0, phase: 0, type: 0, dir: 1, grow: 1 };
    if (j === 0) {
      [[-40, -30, 28, 0], [10, -56, 34, 1], [48, -22, 22, 2], [-6, -6, 18, 3]].forEach(function (p) { t.x = x + p[0]; t.y = y + p[1]; t.r = p[2]; t.color = p[3]; A.bubble(g, t, 0, true); });
    } else if (j === 1) {
      g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x - 30, y - 50); g.moveTo(x, y + 8); g.lineTo(x + 4, y - 64); g.moveTo(x, y + 8); g.lineTo(x + 36, y - 48); ink(g, 3);
      [[-34, -92, 0], [4, -112, 1], [40, -90, 2]].forEach(function (p) { var s = 30 / 70; g.drawImage(balloonSprite(p[2]), x + p[0] - 78 * s, y + p[1] - 90 * s, 156 * s, 200 * s); });
      rr(g, x - 6, y - 4, 12, 18, 4); fill(g, '#9b5d2e'); ink(g, 3);
    } else if (j === 2) {
      ell(g, x, y + 2, 70, 22); fill(g, '#3b86d6'); ink(g, 4);
      g.save(); g.translate(x, y + 6); g.scale(0.5, 0.5); A.frog(g, { x: 0, y: 0, air: false, vy: 0, tongue: 0 }, 0, true, 0); g.restore();
    } else if (j === 3) {
      tree(g, x + 6, y - 50, 0.62);
      t.x = x - 54; t.y = y - 6; t.r = 16; A.fruit(g, t, 0, true);
    } else {
      g.beginPath(); g.moveTo(x - 70, y + 6); g.lineTo(x, y - 96); g.lineTo(x + 70, y + 6); g.closePath(); fill(g, '#ff7eb6'); ink(g, 5);
      g.save(); g.clip(); for (var k = -3; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 24, y + 10); g.lineTo(x + k * 6, y - 100); g.lineWidth = 9; g.strokeStyle = '#ffffff'; g.stroke(); } g.restore();
      g.beginPath(); g.moveTo(x - 70, y + 6); g.lineTo(x, y - 96); g.lineTo(x + 70, y + 6); g.closePath(); ink(g, 5);
      g.beginPath(); g.moveTo(x, y - 96); g.lineTo(x, y - 130); ink(g, 4); g.beginPath(); g.moveTo(x, y - 130); g.lineTo(x + 30, y - 120); g.lineTo(x, y - 110); fill(g, '#ffd23f'); ink(g, 3);
      starPath(g, x - 66, y - 60, 14, 6); fill(g, '#ffd23f'); ink(g, 3); starPath(g, x + 70, y - 44, 11, 5); fill(g, '#4fd1ff'); ink(g, 3);
    }
  }
  // A locked island is greyed out with a padlock.
  A.lock = function (ctx, x, y) {
    ell(ctx, x, y - 6, 146, 112); ctx.fillStyle = 'rgba(60,70,110,0.6)'; ctx.fill();
    rr(ctx, x - 26, y - 20, 52, 44, 10); fill(ctx, '#ffffff'); ink(ctx, 5);
    ctx.beginPath(); ctx.arc(x, y - 22, 15, Math.PI, 0); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    circle(ctx, x, y + 0, 6); fill(ctx, INK);
  };

  var bgCache = [];
  // The background of a scene at pixel scale k; the two most recent ones stay cached.
  A.bg = function (scene, k) {
    for (var i = 0; i < bgCache.length; i++) if (bgCache[i].scene === scene && bgCache[i].k === k) return bgCache[i].c;
    var c = cv(W * k, H * k), g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    SCENES[scene](g);
    bgCache.unshift({ scene: scene, k: k, c: c });
    if (bgCache.length > 2) bgCache.length = 2;
    return c;
  };
  // A lost or restored canvas context makes every sprite again.
  A.reset = function () { cache = {}; bgCache = []; };
})();
