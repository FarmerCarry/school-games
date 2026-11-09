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
  // Islands on the map, right to left like Arabic reading: world 1 is on the right. The map
  // has two pages: worlds 1-5 in a zigzag, then worlds 6-11 in two rows (a snake path).
  A.ISLANDS = [{ x: 1086, y: 452 }, { x: 858, y: 236 }, { x: 640, y: 452 }, { x: 422, y: 236 }, { x: 194, y: 452 },
    { x: 1010, y: 214 }, { x: 640, y: 214 }, { x: 270, y: 214 }, { x: 270, y: 516 }, { x: 640, y: 516 }, { x: 1010, y: 516 }];
  A.PAGES = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9, 10]];
  A.pageOf = function (w) { return w >= 5 ? 1 : 0; };

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
  // Pools, coral walls and keycaps are drawn at sizes that follow the tier and the level,
  // so their keys keep changing over a long session. Keep only the most recent few of each
  // (more than any one scene draws at once) instead of every size ever drawn.
  var LIMIT = { pool: 6, co: 12, cap: 32 }, recent = { pool: [], co: [], cap: [] };
  function family(key) {
    return key.lastIndexOf('pool', 0) === 0 ? 'pool' : key.lastIndexOf('co', 0) === 0 ? 'co' : key.lastIndexOf('cap', 0) === 0 ? 'cap' : '';
  }
  function sprite(key, w, h, draw) {
    if (cache[key]) return cache[key];
    var c = cv(w * SS, h * SS), g = c.getContext('2d');
    g.scale(SS, SS); draw(g, w, h);
    var f = family(key);
    if (f) { recent[f].push(key); if (recent[f].length > LIMIT[f]) delete cache[recent[f].shift()]; }
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
  var SPECIAL = { rainbow: '#ff9ad5', galaxy: '#8a6cff', gold: '#ffcf33' };
  function colorOf(i) { var c = (BB.COLORS[i] || BB.COLORS[0]).c; return SPECIAL[c] || c; }
  A.colorOf = colorOf;
  function bopBody(ci) {
    return sprite('bop' + ci, 120, 120, function (g) {
      var x = 60, y = 60, R = 50, col = BB.COLORS[ci] ? BB.COLORS[ci].c : BB.COLORS[0].c, f;
      if (col === 'rainbow') {
        f = g.createLinearGradient(x - R, y - R, x + R, y + R);
        A.RAINBOW.forEach(function (c, i) { f.addColorStop(i / 5, c); });
      } else if (col === 'galaxy') {
        f = g.createRadialGradient(x - 16, y - 20, 4, x, y, R);
        f.addColorStop(0, '#c9a8ff'); f.addColorStop(0.45, '#6a3fd0'); f.addColorStop(1, '#241a6b');
      } else if (col === 'gold') {
        f = g.createLinearGradient(x - R, y - R, x + R, y + R);
        f.addColorStop(0, '#fff3a6'); f.addColorStop(0.35, '#ffcf33'); f.addColorStop(0.6, '#f0a400'); f.addColorStop(0.8, '#ffe066'); f.addColorStop(1, '#c98a00');
      } else {
        f = g.createRadialGradient(x - 18, y - 22, 6, x, y, R);
        f.addColorStop(0, shade(col, 0.55)); f.addColorStop(0.6, col); f.addColorStop(1, shade(col, -0.22));
      }
      circle(g, x, y, R); fill(g, f); ink(g, 6);
      if (col === 'galaxy') {
        var r = seeded(5);
        for (var i = 0; i < 14; i++) { var a = r() * TAU, d = r() * (R - 10); circle(g, x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + r() * 1.8); fill(g, 'rgba(255,255,255,0.9)'); }
        starPath(g, x + 22, y - 26, 6, 2.5); fill(g, '#ffffff');
      } else if (col === 'gold') { starPath(g, x + 26, y - 24, 7, 2.8); fill(g, '#ffffff'); }
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
    } else if (id === 'pirate') {
      g.beginPath(); g.moveTo(-60, -38); g.quadraticCurveTo(-46, -100, 0, -80); g.quadraticCurveTo(46, -100, 60, -38); g.quadraticCurveTo(0, -58, -60, -38); g.closePath(); fill(g, '#2b2f45'); ink(g, 5);
      g.beginPath(); g.moveTo(-52, -44); g.quadraticCurveTo(0, -62, 52, -44); g.lineWidth = 5; g.strokeStyle = '#ffd23f'; g.stroke();
      starPath(g, 0, -72, 11, 5); fill(g, '#ffd23f'); ink(g, 2.5);
      g.beginPath(); g.moveTo(34, -70); g.quadraticCurveTo(62, -96, 70, -120); g.quadraticCurveTo(52, -96, 30, -76); g.closePath(); fill(g, '#ff5d6c'); ink(g, 3);
    } else if (id === 'chef') {
      [[-24, -76, 20], [24, -76, 20], [0, -92, 25]].forEach(function (c) { circle(g, c[0], c[1], c[2]); fill(g, '#ffffff'); ink(g, 4.5); });
      g.fillStyle = '#ffffff'; g.fillRect(-36, -78, 72, 22);
      rr(g, -32, -62, 64, 24, 6); fill(g, '#ffffff'); ink(g, 5);
      g.beginPath(); g.moveTo(-36, -60); g.lineTo(-36, -76); g.moveTo(36, -60); g.lineTo(36, -76); ink(g, 4.5);
      g.beginPath(); g.moveTo(-12, -60); g.lineTo(-12, -42); g.moveTo(12, -60); g.lineTo(12, -42); g.lineWidth = 3; g.strokeStyle = '#c8cfea'; g.stroke();
    } else if (id === 'snorkel') {
      for (var q2 = -1; q2 <= 1; q2 += 2) { g.beginPath(); g.moveTo(q2 * 52, -4); g.lineTo(q2 * 38, -8); g.lineWidth = 8; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#ff7a1f'; g.stroke(); }
      rr(g, -38, -26, 76, 36, 16); g.fillStyle = 'rgba(160,230,255,0.45)'; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#4fd1ff'; g.stroke();
      g.beginPath(); g.moveTo(-28, -18); g.lineTo(-14, -18); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
      g.beginPath(); g.moveTo(48, 6); g.lineTo(56, -76); g.lineWidth = 13; g.strokeStyle = INK; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#ffd23f'; g.stroke();
      rr(g, 48, -92, 18, 20, 6); fill(g, '#ff7a1f'); ink(g, 3.5);
    } else if (id === 'viking') {
      for (var v = -1; v <= 1; v += 2) {
        g.beginPath(); g.moveTo(v * 34, -50); g.quadraticCurveTo(v * 74, -54, v * 70, -100); g.quadraticCurveTo(v * 60, -70, v * 26, -64); g.closePath(); fill(g, '#fff3d6'); ink(g, 4.5);
      }
      g.beginPath(); g.arc(0, -38, 40, Math.PI, 0); g.closePath(); fill(g, '#b8c0e0'); ink(g, 5);
      g.beginPath(); g.arc(0, -38, 30, Math.PI * 1.15, Math.PI * 1.4); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
      rr(g, -44, -44, 88, 13, 6); fill(g, '#ffcc00'); ink(g, 4);
      for (var n = -2; n <= 2; n++) { circle(g, n * 17, -37, 2.6); fill(g, INK); }
    } else if (id === 'unicorn') {
      [[-46, -26, 14, '#ff7eb6'], [-50, -2, 12, '#b48cff'], [-44, 20, 11, '#4fd1ff'], [-36, -46, 13, '#ffd23f']].forEach(function (m) { circle(g, m[0], m[1], m[2]); fill(g, m[3]); ink(g, 3.5); });
      for (var u = -1; u <= 1; u += 2) { g.beginPath(); g.moveTo(u * 14 + 10, -46); g.lineTo(u * 24 + 10, -66); g.lineTo(u * 30 + 10, -42); g.closePath(); fill(g, '#ffffff'); ink(g, 3.5); }
      g.beginPath(); g.moveTo(-2, -48); g.lineTo(12, -116); g.lineTo(24, -48); g.closePath(); fill(g, '#fff3b0'); ink(g, 4.5);
      g.save(); g.clip(); g.lineWidth = 5; g.strokeStyle = '#ff9ad5'; for (var s = 0; s < 4; s++) { g.beginPath(); g.moveTo(-4, -56 - s * 16); g.lineTo(28, -66 - s * 16); g.stroke(); } g.restore();
      g.beginPath(); g.moveTo(-2, -48); g.lineTo(12, -116); g.lineTo(24, -48); g.closePath(); ink(g, 4.5);
    } else if (id === 'champ') {
      g.beginPath(); g.moveTo(-40, -36); g.lineTo(-48, -92); g.lineTo(-24, -66); g.lineTo(-12, -104); g.lineTo(0, -70); g.lineTo(12, -104); g.lineTo(24, -66); g.lineTo(48, -92); g.lineTo(40, -36); g.closePath();
      fill(g, '#ffcc00'); ink(g, 5);
      g.beginPath(); g.moveTo(-36, -52); g.lineTo(-42, -80); g.lineTo(-26, -62); g.closePath(); fill(g, '#fff3a6');
      rr(g, -42, -48, 84, 14, 6); fill(g, '#ff5d6c'); ink(g, 4);
      [[-24, '#4fd1ff'], [0, '#5be38f'], [24, '#b48cff']].forEach(function (j) { circle(g, j[0], -41, 5); fill(g, j[1]); ink(g, 2.5); });
      starPath(g, 0, -116, 13, 6, still ? 0 : t * 1.5); fill(g, '#ffffff'); ink(g, 3);
      for (var c = 0; c < 2; c++) { var p = still ? c * 3 : t * 2.4 + c * 3; starPath(g, Math.cos(p) * 62, -70 + Math.sin(p) * 22, 6, 2.5); fill(g, '#fff6a0'); ink(g, 2); }
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
    var lit = Math.max(st.click, st.held ? 1 : 0, st.hint * (st.still ? 0.6 : 0.35 + 0.35 * Math.sin(st.time * 7)));
    if (lit > 0.02) { ctx.globalAlpha = Math.min(1, lit); ctx.fillStyle = st.held ? '#ff9f1c' : '#ffcc00'; ctx.fillRect(x, y, k.w / 2, k.h * 0.42); ctx.globalAlpha = 1; }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x + k.w / 2, y + 2); ctx.lineTo(x + k.w / 2, y + k.h * 0.42); ctx.moveTo(x + 2, y + k.h * 0.42); ctx.lineTo(x + k.w - 2, y + k.h * 0.42); ink(ctx, 4);
    rr(ctx, x + k.w / 2 - 6, y + 14, 12, 20, 6); fill(ctx, '#c8cfea'); ink(ctx, 3);
    // Two dots beside the mouse for a double click: they light one after the other.
    if (st.two) for (var j = 0; j < 2; j++) { var on = st.still ? st.two > 0.5 : (st.time * 2.2) % 1 > (j ? 0.3 : 0.12) && (st.time * 2.2) % 1 < 0.55; circle(ctx, x - 22, y + 18 + j * 26, 9); fill(ctx, on ? '#ffcc00' : 'rgba(255,255,255,0.7)'); ink(ctx, 3); }
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
    else if (kind === 'catch') A.fruit(ctx, t, time, true);
    else if (kind === 'drag') { t.r = r * 0.8; t.home = 0; t.face = 1; A.turtle(ctx, t, time, true, false); }
    else if (kind === 'dbl') pearl(ctx, x, y, r * 0.8, false);
    else if (kind === 'hold') { A.soap(ctx, x, y, r); A.critter(ctx, 0, x, y + r * 0.08, r / 40); }
    else if (kind === 'steer') { t.r = r * 1.05; t.life = 99; t.age = 0; A.starfish(ctx, t, time, true); }
    else if (kind === 'keys') A.keycap(ctx, 'KeyF', x, y, r * 1.7, 0);
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
      g.beginPath(); A.ISLANDS.slice(0, 5).forEach(function (p, j) { if (j) { var q = A.ISLANDS[j - 1]; g.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 + 60, p.x, p.y); } else g.moveTo(p.x, p.y); }); g.stroke();
      g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke(); g.setLineDash([]);
      A.PAGES[0].forEach(function (j) { var p = A.ISLANDS[j]; island(g, p.x, p.y, j); });
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
    if (j >= 5) islandNew(g, x, y, j);
    else if (j === 0) {
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
  // s: the shade's size (page 2 of the map has its rows closer together).
  A.lock = function (ctx, x, y, s) {
    s = s || 1;
    ell(ctx, x, y - 6, 146 * s, 112 * s); ctx.fillStyle = 'rgba(60,70,110,0.6)'; ctx.fill();
    rr(ctx, x - 26, y - 20, 52, 44, 10); fill(ctx, '#ffffff'); ink(ctx, 5);
    ctx.beginPath(); ctx.arc(x, y - 22, 15, Math.PI, 0); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    circle(ctx, x, y + 0, 6); fill(ctx, INK);
  };


  /* ======================================================== worlds 6-11 */
  // Pool and shell colours with a shape each (heart, bubble, star), so colour is never the only clue.
  A.HOMES = ['#ff6fae', '#3fa2ff', '#ffc21a'];
  A.STARS = ['#ff8a5c', '#ff5d9e', '#b48cff', '#5be38f', '#4fd1ff'];
  function homeMark(g, i, x, y, s, color) {
    if (i === 0) {
      g.beginPath(); g.moveTo(x, y + s * 0.85);
      g.bezierCurveTo(x - s * 1.35, y - s * 0.05, x - s * 0.6, y - s * 1.15, x, y - s * 0.4);
      g.bezierCurveTo(x + s * 0.6, y - s * 1.15, x + s * 1.35, y - s * 0.05, x, y + s * 0.85); g.closePath();
    } else if (i === 1) { circle(g, x, y, s * 0.75); }
    else starPath(g, x, y, s, s * 0.45);
    fill(g, color || '#ffffff'); ink(g, Math.max(2.5, s / 5));
  }
  A.homeMark = homeMark;

  /* ------------------------------------------------------------ turtle */
  // A baby turtle seen from above, facing right, its shell in its pool's colour. Two frames
  // of paddling flippers. Logical size 176 x 130, shell centre at (76, 65), shell radius 50.
  function turtleSprite(home, gold, frame) {
    return sprite('tu' + home + (gold ? 'g' : '') + frame, 176, 130, function (g) {
      var x = 76, y = 65, c = gold ? '#ffc93c' : A.HOMES[home % 3], a = frame ? 0.32 : -0.18;
      g.lineJoin = 'round';
      [[-34, -34, -1, 0.5], [-34, 34, 1, 0.5], [30, -40, -1, 1], [30, 40, 1, 1]].forEach(function (f) {
        g.save(); g.translate(x + f[0], y + f[1]); g.rotate(f[2] * (0.6 + (f[3] > 0.7 ? a : -a))); ell(g, f[3] > 0.7 ? 10 : 4, 0, f[3] > 0.7 ? 24 : 16, 11, 0); fill(g, '#5cc96b'); ink(g, 4); g.restore();
      });
      g.beginPath(); g.moveTo(x - 50, y - 6); g.lineTo(x - 66, y); g.lineTo(x - 50, y + 6); g.closePath(); fill(g, '#5cc96b'); ink(g, 4);
      // head, looking up at the child
      circle(g, x + 70, y - 2, 26); fill(g, '#6fdc7c'); ink(g, 5);
      ell(g, x + 62, y - 10, 7, 8); fill(g, '#fff'); ink(g, 2.5); ell(g, x + 78, y - 10, 7, 8); fill(g, '#fff'); ink(g, 2.5);
      circle(g, x + 64, y - 9, 3.6); fill(g, INK); circle(g, x + 80, y - 9, 3.6); fill(g, INK);
      circle(g, x + 65, y - 11, 1.3); fill(g, '#fff'); circle(g, x + 81, y - 11, 1.3); fill(g, '#fff');
      g.beginPath(); g.arc(x + 71, y + 4, 7, 0.25, Math.PI - 0.25); ink(g, 3);
      ell(g, x + 56, y + 6, 4, 3); fill(g, 'rgba(255,110,150,0.6)'); ell(g, x + 86, y + 6, 4, 3); fill(g, 'rgba(255,110,150,0.6)');
      // shell: a rim, plates and the pool's mark in the middle
      ell(g, x, y, 52, 46); fill(g, shade(c, -0.18)); ink(g, 6);
      ell(g, x, y, 42, 37); fill(g, c);
      g.lineWidth = 3; g.strokeStyle = shade(c, -0.3);
      for (var i = 0; i < 6; i++) { var an = i / 6 * TAU + 0.5; g.beginPath(); g.moveTo(x + Math.cos(an) * 20, y + Math.sin(an) * 18); g.lineTo(x + Math.cos(an) * 42, y + Math.sin(an) * 37); g.stroke(); }
      ell(g, x, y, 21, 19); fill(g, shade(c, 0.35)); g.lineWidth = 3; g.strokeStyle = shade(c, -0.3); g.stroke();
      homeMark(g, home % 3, x, y + 1, 12, gold ? '#fff6c2' : '#ffffff');
      ell(g, x - 18, y - 22, 12, 6, -0.4); fill(g, 'rgba(255,255,255,0.55)');
    });
  }
  // o: { held, hot, time, still }
  A.turtle = function (ctx, t, time, still, held) {
    var s = t.r / 50, face = t.face || 1, lift = held ? 1 : 0, fr = still ? 0 : Math.floor(time * (held ? 9 : 2.2) + t.phase) % 2;
    var bob = still ? 0 : Math.sin(time * 3 + t.phase) * 2;
    ctx.fillStyle = 'rgba(28,34,80,' + (held ? 0.18 : 0.25) + ')';
    ell(ctx, t.x + 4 * s, t.y + 30 * s + lift * 22, 56 * s * (1 - lift * 0.12), 22 * s); ctx.fill();
    ctx.save(); ctx.translate(t.x, t.y - lift * 16 + bob);
    var k = (held ? 1.08 : t.hot ? 1.05 : 1) * s;
    if (t.wig > 0 && !still) ctx.rotate(Math.sin(time * 40) * 0.12 * t.wig);
    ctx.scale(face * k, k);
    ctx.drawImage(turtleSprite(t.home, t.gold, fr), -76, -65, 176, 130);
    ctx.restore();
  };

  /* -------------------------------------------------------------- pool */
  function poolSprite(color, r) {
    var R = Math.round(r), size = R * 2 + 70;
    return sprite('pool' + color + '_' + R, size, size, function (g) {
      var x = size / 2, y = size / 2 + 8, c = A.HOMES[color % 3];
      ell(g, x, y + 10, R + 22, (R + 22) * 0.62); fill(g, 'rgba(120,80,30,0.25)');
      ell(g, x, y, R + 18, (R + 18) * 0.62); fill(g, c); ink(g, 6);
      // pebbles around the rim
      for (var i = 0; i < 14; i++) { var a = i / 14 * TAU; ell(g, x + Math.cos(a) * (R + 9), y + Math.sin(a) * (R + 9) * 0.62, 7, 5); fill(g, i % 2 ? '#ffffff' : shade(c, 0.45)); }
      var gr = g.createLinearGradient(0, y - R * 0.6, 0, y + R * 0.6);
      gr.addColorStop(0, '#9ef0ff'); gr.addColorStop(1, '#2fa6e8');
      ell(g, x, y, R, R * 0.6); fill(g, gr); ink(g, 5);
      g.globalAlpha = 0.35; homeMark(g, color % 3, x, y, R * 0.32, '#ffffff'); g.globalAlpha = 1;
      // a little flag with the pool's mark
      g.beginPath(); g.moveTo(x + R * 0.78, y - R * 0.42); g.lineTo(x + R * 0.78, y - R * 0.42 - 70); ink(g, 5);
      g.beginPath(); g.moveTo(x + R * 0.78, y - R * 0.42 - 70); g.lineTo(x + R * 0.78 + 50, y - R * 0.42 - 56); g.lineTo(x + R * 0.78, y - R * 0.42 - 40); g.closePath(); fill(g, c); ink(g, 4);
      homeMark(g, color % 3, x + R * 0.78 + 18, y - R * 0.42 - 56, 9, '#ffffff');
    });
  }
  // o: { glow 0..1 (the carried turtle is near), pulse 0..1 (the right pool after a wrong one) }
  A.pool = function (ctx, p, time, still, o) {
    var R = Math.round(p.r), size = R * 2 + 70, k = 1 + (o.pulse > 0 && !still ? Math.sin(o.pulse * 12) * 0.05 * o.pulse : 0);
    if (o.glow > 0) {
      ctx.globalAlpha = Math.min(1, o.glow) * (still ? 0.8 : 0.55 + 0.35 * Math.sin(time * 8));
      ell(ctx, p.x, p.y, R + 34, (R + 34) * 0.62); ctx.lineWidth = 10; ctx.strokeStyle = '#ffcc00'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(poolSprite(p.color, R), p.x - size / 2 * k, p.y - (size / 2 + 8) * k, size * k, size * k);
    if (!still) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (var i = 0; i < 2; i++) { var ph = (time * 0.6 + i * 0.5) % 1; ctx.globalAlpha = 1 - ph; ell(ctx, p.x, p.y, R * (0.25 + ph * 0.6), R * (0.25 + ph * 0.6) * 0.6); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  };

  /* -------------------------------------------------------------- clam */
  var CLAMS = ['#c58bff', '#ff8fc0', '#7fd8ff'];
  function clamHalves(ci) {
    var c = CLAMS[ci % 3];
    var base = sprite('clamB' + ci, 160, 90, function (g) {
      var x = 80, y = 20;
      g.beginPath(); g.moveTo(x - 72, y); g.quadraticCurveTo(x - 70, y + 62, x, y + 64); g.quadraticCurveTo(x + 70, y + 62, x + 72, y); g.closePath();
      fill(g, shade(c, -0.15)); ink(g, 5);
      g.lineWidth = 3; g.strokeStyle = shade(c, -0.35);
      for (var i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * 26, y + 6); g.lineTo(x + i * 12, y + 56); g.stroke(); }
    });
    var lid = sprite('clamL' + ci, 160, 100, function (g) {
      var x = 80, y = 84;
      g.beginPath(); g.moveTo(x - 74, y);
      for (var i = 0; i < 7; i++) { var a0 = Math.PI + i / 7 * Math.PI, a1 = Math.PI + (i + 1) / 7 * Math.PI; g.quadraticCurveTo(x + Math.cos((a0 + a1) / 2) * 92, y + Math.sin((a0 + a1) / 2) * 84, x + Math.cos(a1) * 74, y + Math.sin(a1) * 70); }
      g.closePath();
      var gr = g.createLinearGradient(0, y - 70, 0, y);
      gr.addColorStop(0, shade(c, 0.4)); gr.addColorStop(1, c);
      fill(g, gr); ink(g, 5);
      g.lineWidth = 3; g.strokeStyle = shade(c, -0.25);
      for (var j = 1; j < 7; j++) { var a = Math.PI + j / 7 * Math.PI; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + Math.cos(a) * 66, y + Math.sin(a) * 62); g.stroke(); }
      ell(g, x - 34, y - 46, 12, 6, -0.5); fill(g, 'rgba(255,255,255,0.6)');
    });
    return [base, lid];
  }
  function pearl(ctx, x, y, r, gold) {
    circle(ctx, x, y, r); fill(ctx, gold ? '#ffd23f' : '#fff7fb'); ink(ctx, 4);
    circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.3); fill(ctx, '#ffffff');
    ell(ctx, x + r * 0.3, y + r * 0.35, r * 0.35, r * 0.2); fill(ctx, gold ? 'rgba(255,150,0,0.4)' : 'rgba(200,170,255,0.45)');
  }
  A.pearl = pearl;
  // A clam with sleepy eyes on its lid: one click wakes it (a wiggle, one dot), two quick ones open it.
  // o: { open 0..1, rock: draw a stand under it (scenes without the reef's rocks) }
  A.clam = function (ctx, c, time, still, o) {
    var s = c.r / 72, parts = clamHalves(c.color), open = o.open || 0, dig = Math.min(1, (c.dig || 0) / 0.8);
    var wob = still ? 0 : Math.sin(time * 38) * 0.14 * (c.knock || 0), breathe = still ? 0 : Math.sin(time * 2 + c.phase) * 0.02;
    ctx.save(); ctx.translate(c.x, c.y + dig * 50 * s); ctx.rotate(wob); ctx.scale(s, s * (1 + breathe));
    if (dig > 0) ctx.globalAlpha = 1 - dig;
    ctx.fillStyle = 'rgba(28,34,80,0.22)'; ell(ctx, 0, 44, 76, 14); ctx.fill();
    ctx.drawImage(parts[0], -80, -20, 160, 90);
    if (open > 0 && !o.empty) pearl(ctx, 0, -4 - open * 10, 20, c.gold);
    ctx.save(); ctx.translate(0, 0 - open * 30); ctx.scale(1, 1 - open * 0.55);
    ctx.drawImage(parts[1], -80, -84, 160, 100);
    // eyes: closed while it sleeps, open after a knock
    var awake = c.armed || c.hot || open > 0 || (c.knock || 0) > 0.05;
    for (var e = -1; e <= 1; e += 2) {
      if (awake) { circle(ctx, e * 20, -34, 11); fill(ctx, '#fff'); ink(ctx, 3); circle(ctx, e * 20 + 1, -32, 5.5); fill(ctx, INK); circle(ctx, e * 20 + 3, -35, 2); fill(ctx, '#fff'); }
      else { ctx.beginPath(); ctx.arc(e * 20, -36, 8, 0.15 * Math.PI, 0.85 * Math.PI); ink(ctx, 4); }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();
    if (c.big && c.hp > 1) { pearl(ctx, c.x + 60 * s, c.y - 70 * s, 10, false); }
  };
  // A striped circus podium from y0 down to the ground at y1 (clams up high, away from the reef).
  A.podium = function (ctx, x, y0, y1) {
    rr(ctx, x - 44, y0, 88, y1 - y0, 12); fill(ctx, '#ff5d6c'); ink(ctx, 5);
    ctx.save(); rr(ctx, x - 44, y0, 88, y1 - y0, 12); ctx.clip();
    ctx.fillStyle = '#ffffff';
    for (var y = y0 + 14; y < y1; y += 44) ctx.fillRect(x - 44, y, 88, 18);
    ctx.restore();
    rr(ctx, x - 44, y0, 88, y1 - y0, 12); ink(ctx, 5);
    ell(ctx, x, y0 + 2, 52, 12); fill(ctx, '#ffd23f'); ink(ctx, 4);
  };
  // Two dots over a clam: the first fills at the first click; both are the double click.
  A.clamDots = function (ctx, c, armed, time, still) {
    var s = c.r / 72, y = c.y - 92 * s - 14;
    for (var i = 0; i < 2; i++) {
      var x = c.x + (i ? -1 : 1) * 15, on = armed && i === 0;
      circle(ctx, x, y, 10); fill(ctx, on ? '#ffd23f' : 'rgba(255,255,255,0.75)'); ink(ctx, 3.5);
      if (armed && i === 1 && !still) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 16); circle(ctx, x, y, 14); ctx.lineWidth = 3; ctx.strokeStyle = '#ffcc00'; ctx.stroke(); ctx.globalAlpha = 1; }
    }
  };

  /* -------------------------------------------------------- wand, bubble */
  var CRITTERS = 4;
  function critterSprite(i) {
    return sprite('cr' + i, 64, 64, function (g) {
      var x = 32, y = 34;
      if (i === 0) { // ladybug
        circle(g, x, y - 14, 10); fill(g, INK);
        ell(g, x, y + 2, 22, 19); fill(g, '#ff4d4d'); ink(g, 4);
        g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x, y + 20); ink(g, 3);
        [[-10, -2], [10, -2], [-11, 10], [11, 10], [0, 14]].forEach(function (p) { circle(g, x + p[0], y + p[1], 3.6); fill(g, INK); });
        circle(g, x - 4, y - 16, 2.4); fill(g, '#fff'); circle(g, x + 4, y - 16, 2.4); fill(g, '#fff');
      } else if (i === 1) { // chick
        circle(g, x, y, 22); fill(g, '#ffe14d'); ink(g, 4);
        g.beginPath(); g.moveTo(x - 2, y - 22); g.quadraticCurveTo(x + 2, y - 32, x + 6, y - 22); ink(g, 3);
        circle(g, x - 8, y - 4, 3.5); fill(g, INK); circle(g, x + 8, y - 4, 3.5); fill(g, INK);
        g.beginPath(); g.moveTo(x - 6, y + 3); g.lineTo(x + 6, y + 3); g.lineTo(x, y + 10); g.closePath(); fill(g, '#ff9f1c'); ink(g, 2.5);
        ell(g, x - 15, y + 6, 4, 3); fill(g, 'rgba(255,110,150,0.6)'); ell(g, x + 15, y + 6, 4, 3); fill(g, 'rgba(255,110,150,0.6)');
      } else if (i === 2) { // bee
        ell(g, x - 8, y - 16, 9, 12, -0.4); fill(g, 'rgba(255,255,255,0.85)'); ink(g, 3); ell(g, x + 8, y - 16, 9, 12, 0.4); fill(g, 'rgba(255,255,255,0.85)'); ink(g, 3);
        ell(g, x, y + 2, 22, 18); fill(g, '#ffd23f'); ink(g, 4);
        g.save(); ell(g, x, y + 2, 22, 18); g.clip(); g.fillStyle = INK; g.fillRect(x - 2, y - 20, 7, 40); g.fillRect(x + 11, y - 20, 6, 40); g.restore();
        ell(g, x, y + 2, 22, 18); ink(g, 4);
        circle(g, x - 12, y - 1, 3.2); fill(g, INK); circle(g, x - 2, y - 1, 3.2); fill(g, INK);
      } else { // bunny
        ell(g, x - 9, y - 22, 6, 14, -0.2); fill(g, '#ffffff'); ink(g, 3.5); ell(g, x + 9, y - 22, 6, 14, 0.2); fill(g, '#ffffff'); ink(g, 3.5);
        ell(g, x - 9, y - 22, 2.5, 8, -0.2); fill(g, '#ffb3cf'); ell(g, x + 9, y - 22, 2.5, 8, 0.2); fill(g, '#ffb3cf');
        circle(g, x, y + 2, 20); fill(g, '#ffffff'); ink(g, 4);
        circle(g, x - 7, y - 2, 3.4); fill(g, INK); circle(g, x + 7, y - 2, 3.4); fill(g, INK);
        circle(g, x, y + 6, 3); fill(g, '#ff7eb6');
      }
    });
  }
  A.critter = function (ctx, i, x, y, s) { ctx.drawImage(critterSprite(i % CRITTERS), x - 32 * s, y - 34 * s, 64 * s, 64 * s); };
  // A soap bubble of radius r (a rainbow film, no sprite tint), for the wand and its effects.
  function soapSprite() {
    return sprite('soap', 156, 156, function (g) {
      var x = 78, y = 78, R = 72, gr = g.createRadialGradient(x - 24, y - 28, 6, x, y, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(190,240,255,0.18)'); gr.addColorStop(1, 'rgba(160,220,255,0.55)');
      circle(g, x, y, R); fill(g, gr); g.lineWidth = 5; g.strokeStyle = 'rgba(28,34,80,0.75)'; g.stroke();
      g.lineCap = 'round'; g.lineWidth = 6;
      [['rgba(255,120,200,0.8)', 0.1, 0.9], ['rgba(255,236,90,0.85)', 0.95, 1.5], ['rgba(110,230,255,0.85)', 2.2, 2.9]].forEach(function (b) { g.strokeStyle = b[0]; g.beginPath(); g.arc(x, y, R - 8, b[1], b[2]); g.stroke(); });
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7; g.beginPath(); g.arc(x, y, R - 14, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
      circle(g, x - 34, y - 32, 7); fill(g, '#fff');
    });
  }
  A.soap = function (ctx, x, y, r, sx, sy) { ctx.drawImage(soapSprite(), x - r * (sx || 1) * 78 / 72, y - r * (sy || 1) * 78 / 72, r * (sx || 1) * 156 / 72, r * (sy || 1) * 156 / 72); };
  // The wand: a stick from the bottom, a ring at (x, y) with a critter sitting in it, the
  // dashed ring the bubble should fill, and the bubble. o: { tol, ghost (a demo bubble radius) }
  A.wand = function (ctx, t, time, still, o) {
    var x = t.x, y = t.y, tol = o.tol, R = t.ring, band = t.inBand && t.state === 'grow', gone = t.state === 'gone';
    // the band to fill: a soft fill between two dashed circles
    var pul = still ? 0.5 : 0.5 + 0.5 * Math.sin(time * 6);
    if (!gone) {
      ctx.beginPath(); ctx.arc(x, y, R + tol, 0, TAU); ctx.moveTo(x + Math.max(4, R - tol), y); ctx.arc(x, y, Math.max(4, R - tol), 0, TAU, true);
      ctx.fillStyle = band ? 'rgba(120,255,140,' + (0.35 + 0.25 * pul) + ')' : 'rgba(255,255,255,0.22)'; ctx.fill('evenodd');
      ctx.setLineDash([14, 12]); ctx.lineDashOffset = still ? 0 : -time * 30;
      for (var k = -1; k <= 1; k += 2) {
        circle(ctx, x, y, Math.max(4, R + k * tol)); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(28,34,80,0.55)'; ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = band ? '#3ddc84' : '#ffffff'; ctx.stroke();
      }
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // the stick and the ring
    rr(ctx, x - 9, y + 34, 18, 700 - y, 8); fill(ctx, '#ff7eb6'); ink(ctx, 5);
    circle(ctx, x, y, 34); ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    if (!gone) A.critter(ctx, t.critter, x, y + 4 + (still ? 0 : Math.sin(time * 4) * 2), 0.9);
    var br = t.state === 'grow' ? t.br : o.ghost || 0;
    if (br > 0) {
      ctx.globalAlpha = t.state === 'grow' ? 1 : 0.45;
      // A bubble past the band wobbles: about to go «boing».
      var over = t.state === 'grow' && br > R + tol ? Math.min(1, (br - R - tol) / 20) : 0, w = still ? 0 : Math.sin(time * 30) * 0.08 * over + Math.sin(time * 5) * 0.02;
      A.soap(ctx, x, y, br, 1 + w, 1 - w);
      ctx.globalAlpha = 1;
    }
  };

  /* --------------------------------------------------------- submarine */
  function subSprite() {
    return sprite('sub', 200, 150, function (g) {
      var x = 96, y = 84;
      // tower and periscope
      rr(g, x - 26, y - 62, 52, 36, 12); fill(g, '#ffb703'); ink(g, 5);
      g.beginPath(); g.moveTo(x + 8, y - 62); g.lineTo(x + 8, y - 84); g.lineTo(x + 26, y - 84); ink(g, 9); g.lineWidth = 4; g.strokeStyle = '#ffb703'; g.stroke();
      // fins
      g.beginPath(); g.moveTo(x - 70, y - 6); g.lineTo(x - 92, y - 26); g.lineTo(x - 84, y + 2); g.closePath(); fill(g, '#ff7a1f'); ink(g, 4);
      g.beginPath(); g.moveTo(x - 70, y + 6); g.lineTo(x - 92, y + 26); g.lineTo(x - 84, y - 2); g.closePath(); fill(g, '#ff7a1f'); ink(g, 4);
      // body
      var gr = g.createLinearGradient(0, y - 40, 0, y + 40);
      gr.addColorStop(0, '#fff07a'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#f2a516');
      rr(g, x - 80, y - 38, 168, 76, 38); fill(g, gr); ink(g, 6);
      ell(g, x - 34, y - 22, 26, 7, -0.05); fill(g, 'rgba(255,255,255,0.65)');
      [-56, -40].forEach(function (d) { circle(g, x + d, y + 18, 4); fill(g, '#f2a516'); ink(g, 2); });
      // the porthole frame (Bop is drawn inside it every frame)
      circle(g, x + 40, y - 2, 27); fill(g, '#9fe4ff'); g.lineWidth = 10; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#c8cfea'; g.stroke();
    });
  }
  // o: { bop: { color, hat }, time, still, happy }
  A.sub = function (ctx, s, o) {
    var face = s.face || 1, still = o.still, t = o.time, tilt = still ? 0 : Math.max(-0.15, Math.min(0.15, s.vy / 1600)) * face + Math.sin(t * 2) * 0.03;
    ctx.save(); ctx.translate(s.x, s.y + (still ? 0 : Math.sin(t * 2.2) * 3)); ctx.rotate(tilt); ctx.scale(face, 1);
    // propeller
    var sp = still ? 0.6 : Math.abs(Math.sin(t * (Math.abs(s.vx) + Math.abs(s.vy) > 20 ? 30 : 6)));
    ctx.fillStyle = '#c8cfea'; ell(ctx, -94, 0, 6, 26 * sp + 4); ctx.fill(); ink(ctx, 4);
    circle(ctx, -88, 0, 7); fill(ctx, '#8f98c4'); ink(ctx, 3);
    ctx.drawImage(subSprite(), -96, -84, 200, 150);
    // Bop looks out of the porthole (always the right way up).
    ctx.save(); circle(ctx, 40, -2, 22); ctx.clip(); ctx.scale(face, 1);
    A.bop(ctx, 40 * face, 6, { color: o.bop.color, hat: 0, time: t, still: still, scale: 0.5, look: { x: 40 * face + 30, y: 0 }, happy: o.happy });
    ctx.restore();
    ctx.beginPath(); ctx.arc(40, -2, 16, Math.PI * 1.1, Math.PI * 1.45); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    ctx.restore();
  };

  /* ------------------------------------------------- coral and starfish */
  function coralSprite(wl) {
    var key = 'co' + wl.w + 'x' + wl.h;
    return sprite(key, wl.w + 40, wl.h + 40, function (g) {
      var x = 20, y = 20, w = wl.w, h = wl.h, rad = Math.min(w, h) / 2, r = seeded(w * 7 + h);
      rr(g, x, y, w, h, rad); fill(g, '#ff7f9a'); ink(g, 6);
      // knobbly edges and little holes
      for (var i = 0; i < (w + h) / 18; i++) {
        var side = r(), px = x + r() * w, py = y + r() * h;
        if (w > h) py = side < 0.5 ? y + 4 : y + h - 4; else px = side < 0.5 ? x + 4 : x + w - 4;
        circle(g, px, py, 7 + r() * 6); fill(g, '#ff9fb3'); ink(g, 3.5);
      }
      rr(g, x + 6, y + 6, w - 12, h - 12, rad - 6); fill(g, '#ff8fa8');
      for (var j = 0; j < (w + h) / 30; j++) { circle(g, x + 12 + r() * (w - 24), y + 12 + r() * (h - 24), 3 + r() * 3); fill(g, '#d94f74'); }
      ell(g, x + w * 0.3, y + h * 0.25, Math.min(w, h) * 0.18, Math.min(w, h) * 0.09); fill(g, 'rgba(255,255,255,0.45)');
    });
  }
  A.coral = function (ctx, wl, wig, time, still) {
    var k = 1 + (still ? 0 : Math.sin(time * 30) * 0.03 * wig);
    ctx.save(); ctx.translate(wl.x, wl.y); ctx.scale(k, 2 - k);
    ctx.drawImage(coralSprite(wl), -wl.w / 2 - 20, -wl.h / 2 - 20, wl.w + 40, wl.h + 40);
    ctx.restore();
  };
  function starfishSprite(ci, gold) {
    return sprite('sf' + ci + (gold ? 'g' : ''), 96, 96, function (g) {
      var x = 48, y = 50, c = gold ? '#ffcf33' : A.STARS[ci % 5];
      g.beginPath();
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + i * TAU / 5, b = a + TAU / 10;
        var tx = x + Math.cos(a) * 42, ty = y + Math.sin(a) * 42;
        if (i === 0) g.moveTo(tx, ty); else g.quadraticCurveTo(x + Math.cos(a - TAU / 10) * 22, y + Math.sin(a - TAU / 10) * 22, tx, ty);
        if (i === 4) g.quadraticCurveTo(x + Math.cos(b) * 22, y + Math.sin(b) * 22, x + Math.cos(-Math.PI / 2) * 42, y - 42);
      }
      g.closePath(); fill(g, c); ink(g, 5);
      for (var j = 0; j < 5; j++) { var d = -Math.PI / 2 + j * TAU / 5; circle(g, x + Math.cos(d) * 26, y + Math.sin(d) * 26, 3); fill(g, 'rgba(255,255,255,0.75)'); }
      circle(g, x - 7, y - 2, 5); fill(g, '#fff'); ink(g, 2); circle(g, x + 7, y - 2, 5); fill(g, '#fff'); ink(g, 2);
      circle(g, x - 6, y - 1, 2.5); fill(g, INK); circle(g, x + 8, y - 1, 2.5); fill(g, INK);
      g.beginPath(); g.arc(x, y + 5, 5, 0.2, Math.PI - 0.2); ink(g, 2.5);
      if (gold) { circle(g, x + 20, y - 26, 4); fill(g, '#fff'); }
    });
  }
  A.starfish = function (ctx, p, time, still) {
    var s = p.r / 42, left = p.life - p.age, blink = left < 2 && !still ? (Math.sin(time * 18) > 0 ? 0.45 : 1) : 1;
    ctx.globalAlpha = blink;
    ctx.save(); ctx.translate(p.x, p.y + (still ? 0 : Math.sin(time * 2.5 + p.phase) * 4)); ctx.rotate(still ? 0 : Math.sin(time * 1.5 + p.phase) * 0.2 * (p.spin || 1)); ctx.scale(s, s);
    ctx.drawImage(starfishSprite(p.color, p.gold), -48, -50, 96, 96);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------------ keycaps */
  // A keycap like the school's keyboards: dark, the Latin letter large at the top left and the
  // Arabic letter at the bottom right (F and J with their bump). st: 0 normal, 1 target, 2 pressed, 3 wrong.
  var KEYCOL = [['#3a3f5c', '#1d2036', '#ffffff', '#ffffff'], ['#ffe066', '#c98a00', INK, INK], ['#8be3ff', '#2b7fb8', INK, INK], ['#ff9aa8', '#b8405a', INK, INK]];
  function drawCap(g, x, y, s, code, st, lat, ar) {
    var c = KEYCOL[st], d = st === 2 ? s * 0.06 : 0;
    rr(g, x, y + s * 0.08, s, s * 0.94, s * 0.16); fill(g, c[1]); ink(g, Math.max(3, s * 0.05));
    rr(g, x, y + d, s, s * 0.9, s * 0.16); fill(g, c[0]); ink(g, Math.max(3, s * 0.05));
    rr(g, x + s * 0.08, y + d + s * 0.06, s * 0.84, s * 0.7, s * 0.12); g.fillStyle = 'rgba(255,255,255,' + (st ? 0.25 : 0.06) + ')'; g.fill();
    g.textBaseline = 'middle'; g.fillStyle = c[2];
    g.font = '700 ' + Math.round(s * 0.42) + 'px Fredoka'; g.textAlign = 'left'; g.direction = 'ltr';
    g.fillText(lat, x + s * 0.14, y + d + s * 0.28);
    g.font = '700 ' + Math.round(s * 0.37) + 'px Fredoka'; g.textAlign = 'right'; g.direction = 'rtl'; g.fillStyle = c[3];
    g.fillText(ar, x + s * 0.86, y + d + s * 0.56);
    if (code === 'KeyF' || code === 'KeyJ') { g.beginPath(); g.moveTo(x + s * 0.16, y + d + s * 0.72); g.lineTo(x + s * 0.36, y + d + s * 0.72); g.lineWidth = Math.max(2, s * 0.05); g.strokeStyle = c[2]; g.lineCap = 'round'; g.stroke(); }
  }
  function capSprite(code, size, st) {
    return sprite('cap' + code + size + st, size + 8, size + 8, function (g) { drawCap(g, 4, 4, size, code, st, BB.latin(code), BB.arabic(code)); });
  }
  A.keycap = function (ctx, code, x, y, size, st) { ctx.drawImage(capSprite(code, Math.round(size), st || 0), x - size / 2 - 4, y - size / 2 - 4, size + 8, size + 8); };
  // A balloon carrying a keycap on its string; lit: the next one, its keycap outlined.
  A.kballoon = function (ctx, b, time, still, lit) {
    var k = b.r / 70, tilt = still ? 0 : Math.sin(time * 1.7 + b.phase) * 0.06, sw = still ? 0 : Math.sin(time * 2.4 + b.phase) * 6;
    var sy = b.y + 98 * k, cy = sy + 26 + b.cap / 2;
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x, sy); ctx.quadraticCurveTo(b.x + sw, sy + 14, b.x + sw * 0.5, cy - b.cap / 2); ctx.stroke();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(tilt); ctx.scale(k, k);
    ctx.drawImage(balloonSprite(b.color, b.gold), -78, -90, 156, 200);
    ctx.restore();
    ctx.save(); ctx.translate(b.x + sw * 0.5, cy); ctx.rotate(still ? 0 : -sw * 0.006);
    if (lit) { ctx.globalAlpha = still ? 0.9 : 0.6 + 0.4 * Math.sin(time * 8); rr(ctx, -b.cap / 2 - 10, -b.cap / 2 - 10, b.cap + 20, b.cap + 20, 18); ctx.lineWidth = 8; ctx.strokeStyle = '#ffcc00'; ctx.stroke(); ctx.globalAlpha = 1; }
    A.keycap(ctx, b.code, 0, 0, b.cap, 0);
    ctx.restore();
  };
  // A dotted path with an arrowhead from (x0, y0) to (x1, y1), leaving gaps a0 and a1 at the ends.
  A.guide = function (ctx, x0, y0, x1, y1, a0, a1, time, still) {
    var dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy);
    if (d < a0 + a1 + 30) return;
    var ux = dx / d, uy = dy / d, sx = x0 + ux * a0, sy = y0 + uy * a0, ex = x1 - ux * a1, ey = y1 - uy * a1;
    ctx.setLineDash([3, 22]); ctx.lineDashOffset = still ? 0 : -time * 40; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(28,34,80,0.45)'; ctx.stroke();
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.beginPath(); ctx.moveTo(ex + ux * 6, ey + uy * 6); ctx.lineTo(ex - ux * 22 - uy * 16, ey - uy * 22 + ux * 16); ctx.lineTo(ex - ux * 22 + uy * 16, ey - uy * 22 - ux * 16); ctx.closePath();
    fill(ctx, '#ffffff'); ink(ctx, 4);
  };
  // The on-screen keyboard (three letter rows, like the real one), drawn once per pixel scale.
  var kbCache = null;
  function kbBase(k) {
    if (kbCache && kbCache.k === k) return kbCache.c;
    var K = BB.KB, c = cv(W * k, 240 * k), g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, -(K.y - 14) * k);
    rr(g, K.x - 14, K.y - 12, 15 * K.u + 26, 3 * K.u + 40, 22); fill(g, '#262a40'); ink(g, 6);
    BB.KB_ROWS.forEach(function (row, r) {
      var y = K.y + r * K.u + (K.u - K.cap) / 2, x0 = K.x + (K.u - K.cap) / 2;
      // the wide keys at both ends of a row (Tab, Caps Lock, Shift / Backslash, Enter, Shift), blank
      var wl = row.off * K.u - (K.u - K.cap), wr = (15 - row.off - row.codes.length) * K.u - (K.u - K.cap);
      rr(g, x0, y + 4, wl, K.cap * 0.92, 9); fill(g, '#1d2036'); rr(g, x0, y, wl, K.cap * 0.88, 9); fill(g, '#33384f'); ink(g, 3);
      var xr = K.x + (row.off + row.codes.length) * K.u + (K.u - K.cap) / 2;
      rr(g, xr, y + 4, wr, K.cap * 0.92, 9); fill(g, '#1d2036'); rr(g, xr, y, wr, K.cap * 0.88, 9); fill(g, '#33384f'); ink(g, 3);
      row.codes.forEach(function (code, i) { drawCap(g, K.x + (row.off + i) * K.u + (K.u - K.cap) / 2, y, K.cap, code, 0, BB.latin(code), BB.arabic(code)); });
    });
    kbCache = { k: k, c: c };
    return c;
  }
  // st: { glow: {code: 0..1}, down: {code: true}, wrong: {code: 0..1}, time, still, k (pixel scale) }
  A.keyboard = function (ctx, st) {
    var K = BB.KB, base = kbBase(st.k);
    ctx.drawImage(base, 0, K.y - 14, W, 240);
    var pul = st.still ? 0.8 : 0.55 + 0.45 * Math.sin(st.time * 8);
    BB.KB_ROWS.forEach(function (row, r) {
      row.codes.forEach(function (code, i) {
        var g = st.glow[code] || 0, d = st.down[code], wr = st.wrong[code] || 0;
        if (!g && !d && !wr) return;
        var x = K.x + (row.off + i) * K.u + (K.u - K.cap) / 2, y = K.y + r * K.u + (K.u - K.cap) / 2;
        if (g > 0) {
          ctx.globalAlpha = Math.min(1, g) * pul;
          rr(ctx, x - 9, y - 9, K.cap + 18, K.cap + 18, 16); ctx.lineWidth = 8; ctx.strokeStyle = '#ffcc00'; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        drawCap(ctx, x, y, K.cap, code, d ? 2 : wr > 0.05 ? 3 : 1, BB.latin(code), BB.arabic(code));
      });
    });
  };

  // An arrow keycap (dark, like the real keys) for the inverted T. dir: up, down, west, east.
  A.arrowCap = function (ctx, dir, st) {
    var k = BB.KEYS[dir], x = k.x - k.w / 2, y = k.y - k.h / 2, d = st.down ? 6 : 0;
    if (st.glow > 0) {
      ctx.globalAlpha = Math.min(1, 0.3 + 0.6 * st.glow);
      rr(ctx, x - 10, y - 10, k.w + 20, k.h + 22, 22); ctx.lineWidth = 8; ctx.strokeStyle = '#ffcc00'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    rr(ctx, x, y + 8, k.w, k.h, 16); fill(ctx, st.down ? '#c98a00' : '#1d2036'); ink(ctx, 5);
    rr(ctx, x, y + d, k.w, k.h - 2, 16); fill(ctx, st.down ? '#ffe066' : '#3a3f5c'); ink(ctx, 5);
    var a = { east: 0, down: Math.PI / 2, west: Math.PI, up: -Math.PI / 2 }[dir];
    ctx.save(); ctx.translate(k.x, k.y - 2 + d); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(4, -18); ctx.lineTo(4, -7); ctx.lineTo(-22, -7); ctx.lineTo(-22, 7); ctx.lineTo(4, 7); ctx.lineTo(4, 18); ctx.closePath();
    fill(ctx, st.down ? INK : '#ffffff');
    ctx.restore();
    ctx.font = '700 15px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillStyle = st.down ? INK : '#aab2dc';
    ctx.fillText({ up: 'W', down: 'S', west: 'A', east: 'D' }[dir], x + 14, y + k.h - 14 + d);
  };

  /* ------------------------------------------------------------ scenes */
  function palm(g, x, y, h, lean) {
    g.beginPath(); g.moveTo(x - 14, y); g.quadraticCurveTo(x + lean * 0.4, y - h * 0.5, x + lean, y - h); g.lineTo(x + lean + 14, y - h + 4); g.quadraticCurveTo(x + lean * 0.4 + 18, y - h * 0.5, x + 16, y); g.closePath();
    fill(g, '#b5763a'); ink(g, 5);
    for (var i = 1; i < 6; i++) { var ty = y - h * i / 6; g.beginPath(); g.moveTo(x - 12 + lean * i / 6 * 0.9, ty); g.lineTo(x + 14 + lean * i / 6 * 0.9, ty + 4); g.lineWidth = 3; g.strokeStyle = '#8a5526'; g.stroke(); }
    [[-1, -0.3], [1, -0.2], [-0.7, 0.5], [0.8, 0.55], [0, -1]].forEach(function (l) {
      var tx = x + lean + 7, ty = y - h;
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + l[0] * 60, ty + l[1] * 50 - 40, tx + l[0] * 110, ty + l[1] * 70 + 10);
      g.quadraticCurveTo(tx + l[0] * 50, ty + l[1] * 30 - 4, tx, ty); g.closePath(); fill(g, '#3fb950'); ink(g, 4);
    });
    circle(g, x + lean + 2, y - h + 12, 9); fill(g, '#8a5526'); ink(g, 3); circle(g, x + lean + 16, y - h + 14, 9); fill(g, '#8a5526'); ink(g, 3);
  }
  function rays(g, n, alpha, seed) {
    var r = seeded(seed); g.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    for (var i = 0; i < n; i++) { var x = r() * W; g.beginPath(); g.moveTo(x - 30, 0); g.lineTo(x + 40, 0); g.lineTo(x + 200 + r() * 120, H); g.lineTo(x + 60, H); g.closePath(); g.fill(); }
  }
  function kelp(g, x, y, h, color) { seaweed(g, x, y, h, color); }
  function rockPillar(g, x, top, bottom, w) {
    g.beginPath(); g.moveTo(x - w * 0.62, bottom); g.quadraticCurveTo(x - w * 0.6, top + 30, x - w * 0.42, top + 8); g.quadraticCurveTo(x, top - 8, x + w * 0.44, top + 6);
    g.quadraticCurveTo(x + w * 0.62, top + 30, x + w * 0.6, bottom); g.closePath(); fill(g, '#8a7fc0'); ink(g, 5);
    g.beginPath(); g.moveTo(x - w * 0.4, top + 20); g.quadraticCurveTo(x, top + 8, x + w * 0.38, top + 18); g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.3)'; g.stroke();
    circle(g, x - w * 0.25, top + 70, 8); fill(g, 'rgba(60,50,110,0.35)'); circle(g, x + w * 0.2, top + 120, 11); fill(g, 'rgba(60,50,110,0.35)');
    [[-0.55, 60, '#ff7eb6'], [0.55, 110, '#ffb347']].forEach(function (c) { circle(g, x + w * c[0], top + c[1], 13); fill(g, c[2]); ink(g, 3.5); circle(g, x + w * c[0], top + c[1], 5); fill(g, '#fff6c2'); });
  }
  function balloonFar(g, x, y, s, c) {
    ell(g, x, y, 26 * s, 30 * s); fill(g, c); ink(g, 3);
    g.beginPath(); g.moveTo(x - 10 * s, y + 26 * s); g.lineTo(x - 7 * s, y + 44 * s); g.moveTo(x + 10 * s, y + 26 * s); g.lineTo(x + 7 * s, y + 44 * s); ink(g, 2);
    rr(g, x - 9 * s, y + 42 * s, 18 * s, 12 * s, 3 * s); fill(g, '#b5763a'); ink(g, 2);
  }
  SCENES.beach = function (g) {
    g.fillStyle = vgrad(g, [[0, '#8fe3ff'], [1, '#d8f7ff']], 0, 120); g.fillRect(0, 0, W, 130);
    circle(g, 1150, 58, 40); fill(g, '#ffe066'); ink(g, 4);
    cloud(g, 300, 50, 0.6); cloud(g, 760, 40, 0.5);
    g.fillStyle = vgrad(g, [[0, '#33c9e8'], [1, '#17a2d8']], 100, 200); g.fillRect(0, 100, W, 110);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4; g.lineCap = 'round';
    for (var i = 0; i < 12; i++) { var wx = 50 + i * 110 + (i % 2) * 40, wy = 128 + (i % 3) * 22; g.beginPath(); g.moveTo(wx - 24, wy); g.quadraticCurveTo(wx, wy - 8, wx + 24, wy); g.stroke(); }
    g.beginPath(); g.moveTo(0, 196);
    for (var x = 0; x <= W; x += 40) g.quadraticCurveTo(x + 20, 214 + (x / 40 % 2) * 8, x + 40, 198);
    g.lineTo(W, 230); g.lineTo(0, 230); g.closePath(); fill(g, '#ffffff');
    g.fillStyle = vgrad(g, [[0, '#ffe7a8'], [1, '#f6c96d']], 205, H); g.beginPath(); g.moveTo(0, 212);
    for (x = 0; x <= W; x += 80) g.quadraticCurveTo(x + 40, 222 - (x / 80 % 2) * 10, x + 80, 214);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill(); ink(g, 5);
    var r = seeded(23);
    for (i = 0; i < 90; i++) { circle(g, r() * W, 240 + r() * 480, 1.5 + r() * 2.5); fill(g, 'rgba(190,130,50,0.3)'); }
    palm(g, 50, 720, 470, 40); palm(g, 1236, 360, 220, -30);
    [[150, 300, 0.2], [1140, 620, -0.3], [520, 690, 0.5]].forEach(function (p) { starPath(g, p[0], p[1], 15, 7, p[2]); fill(g, '#ff8a5c'); ink(g, 3.5); });
    [[330, 260], [960, 250], [760, 700]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 13, Math.PI, 0); g.closePath(); fill(g, '#ffe8f0'); ink(g, 3.5); });
    // a little sandcastle by the sea
    var cx = 1050, cy = 262;
    rr(g, cx - 40, cy - 20, 80, 40, 6); fill(g, '#f0b956'); ink(g, 4); rr(g, cx - 18, cy - 46, 36, 30, 5); fill(g, '#f0b956'); ink(g, 4);
    g.beginPath(); g.moveTo(cx, cy - 46); g.lineTo(cx, cy - 72); ink(g, 3); g.beginPath(); g.moveTo(cx, cy - 72); g.lineTo(cx + 20, cy - 65); g.lineTo(cx, cy - 58); fill(g, '#ff5d6c'); ink(g, 2.5);
  };
  SCENES.reef = function (g) {
    g.fillStyle = vgrad(g, [[0, '#7fe3ff'], [0.4, '#2fb2e6'], [1, '#105fae']]); g.fillRect(0, 0, W, H);
    rays(g, 6, 0.08, 31);
    g.beginPath(); g.moveTo(0, 16); for (var x = 0; x <= W; x += 32) g.lineTo(x, 16 + Math.sin(x / 36) * 6); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.stroke();
    // far reef
    g.fillStyle = 'rgba(20,80,150,0.45)'; g.beginPath(); g.moveTo(0, 520);
    for (x = 0; x <= W; x += 120) g.quadraticCurveTo(x + 60, 440 + (x / 120 % 3) * 30, x + 120, 520);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    BB.REEF.rocks.forEach(function (p, i) { rockPillar(g, p[0], p[1] + 34, 640, 170 + (i % 2) * 20); });
    kelp(g, 40, 690, 260, '#38c76a'); kelp(g, 1240, 690, 300, '#2fae5b'); kelp(g, 520, 640, 120, '#2fae5b'); kelp(g, 760, 640, 140, '#38c76a');
    sand(g, 600, '#ffd98a');
    var r = seeded(41);
    for (var i = 0; i < 40; i++) { circle(g, r() * W, 620 + r() * 90, 2 + r() * 2.5); fill(g, 'rgba(180,120,40,0.35)'); }
    for (i = 0; i < 22; i++) { circle(g, r() * W, 60 + r() * 360, 3 + r() * 6); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke(); }
    starPath(g, 300, 680, 18, 8, 0.3); fill(g, '#ff8a5c'); ink(g, 3.5); starPath(g, 980, 690, 15, 7, -0.2); fill(g, '#b48cff'); ink(g, 3.5);
  };
  SCENES.garden = function (g) {
    g.fillStyle = vgrad(g, [[0, '#7fd6ff'], [0.7, '#d4f4ff'], [1, '#fff7d6']]); g.fillRect(0, 0, W, H);
    circle(g, 150, 110, 52); fill(g, '#ffe066'); ink(g, 5);
    cloud(g, 420, 90, 0.8); cloud(g, 1000, 130, 1); cloud(g, 770, 60, 0.55);
    hill(g, 560, 80, '#a6e879', 33); hill(g, 610, 60, '#7fd65f', 37);
    // a fence
    for (var i = 0; i < 12; i++) { var fx = 30 + i * 110; if (fx > 470 && fx < 810) continue; g.beginPath(); g.moveTo(fx, 600); g.lineTo(fx, 520); g.lineTo(fx + 16, 504); g.lineTo(fx + 32, 520); g.lineTo(fx + 32, 600); g.closePath(); fill(g, '#ffffff'); ink(g, 4); }
    g.beginPath(); g.moveTo(0, 548); g.lineTo(470, 548); g.moveTo(820, 548); g.lineTo(W, 548); g.lineWidth = 10; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke();
    g.beginPath(); g.moveTo(0, 610); g.lineTo(W, 610); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); fill(g, '#6ed14f'); ink(g, 5);
    flowers(g, 622, 714, 34, 43);
    // a round tree: three leafy balls, outlined once around the outside
    rr(g, 1134, 380, 34, 230, 12); fill(g, '#9b5d2e'); ink(g, 5);
    var leaves = [[1096, 372, 62], [1204, 372, 62], [1150, 306, 76]];
    leaves.forEach(function (c) { circle(g, c[0], c[1], c[2]); fill(g, '#3fb950'); ink(g, 5); });
    leaves.forEach(function (c) { circle(g, c[0], c[1], c[2] - 3); fill(g, '#3fb950'); });
    [[1110, 330, 20], [1180, 290, 16]].forEach(function (c) { circle(g, c[0], c[1], c[2]); fill(g, 'rgba(255,255,255,0.18)'); });
    [[1080, 360], [1130, 280], [1190, 340], [1222, 392], [1160, 236], [1112, 410]].forEach(function (p) { circle(g, p[0], p[1], 9); fill(g, '#ff7eb6'); ink(g, 3); });
    // tulips by the fence
    [[90, '#ff5d6c'], [180, '#ffd23f'], [1010, '#b48cff'], [1080, '#ff7eb6']].forEach(function (f) {
      g.beginPath(); g.moveTo(f[0], 612); g.lineTo(f[0], 560); g.lineWidth = 5; g.strokeStyle = '#2fae5b'; g.stroke();
      g.beginPath(); g.moveTo(f[0] - 14, 556); g.lineTo(f[0] - 14, 536); g.lineTo(f[0] - 6, 544); g.lineTo(f[0], 532); g.lineTo(f[0] + 6, 544); g.lineTo(f[0] + 14, 536); g.lineTo(f[0] + 14, 556); g.quadraticCurveTo(f[0], 568, f[0] - 14, 556); fill(g, f[1]); ink(g, 3.5);
    });
  };
  SCENES.deep = function (g) {
    g.fillStyle = vgrad(g, [[0, '#2fb7e0'], [0.5, '#16729f'], [1, '#0b3a6e']]); g.fillRect(0, 0, W, H);
    rays(g, 5, 0.06, 57);
    var r = seeded(61);
    // fish far away
    for (var i = 0; i < 7; i++) { var fx = 120 + r() * 1040, fy = 120 + r() * 300, s = 0.6 + r() * 0.5; g.fillStyle = 'rgba(10,50,100,0.35)'; ell(g, fx, fy, 22 * s, 10 * s); g.fill(); g.beginPath(); g.moveTo(fx - 20 * s, fy); g.lineTo(fx - 34 * s, fy - 9 * s); g.lineTo(fx - 34 * s, fy + 9 * s); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(8,40,90,0.5)'; g.beginPath(); g.moveTo(0, 600);
    for (var x = 0; x <= W; x += 100) g.quadraticCurveTo(x + 50, 520 + (x / 100 % 3) * 26, x + 100, 600);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    kelp(g, 30, 700, 420, '#2fae5b'); kelp(g, 80, 700, 300, '#38c76a'); kelp(g, 1250, 700, 380, '#2fae5b');
    sand(g, 580, '#e9c47a');
    for (i = 0; i < 40; i++) { circle(g, r() * W, 600 + r() * 110, 2 + r() * 2); fill(g, 'rgba(150,100,30,0.35)'); }
    for (i = 0; i < 26; i++) { circle(g, r() * W, 40 + r() * 520, 2 + r() * 5); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.3)'; g.stroke(); }
    [[260, 640], [520, 660]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 14, Math.PI, 0); g.closePath(); fill(g, '#ffe8f0'); ink(g, 3.5); });
    // a treasure chest on the sand
    rr(g, 720, 612, 90, 54, 8); fill(g, '#b5763a'); ink(g, 4); g.beginPath(); g.moveTo(720, 628); g.quadraticCurveTo(765, 590, 810, 628); g.closePath(); fill(g, '#cf8a45'); ink(g, 4);
    rr(g, 756, 624, 18, 20, 4); fill(g, '#ffd23f'); ink(g, 3);
  };
  SCENES.dusk = function (g) {
    g.fillStyle = vgrad(g, [[0, '#4b3a9e'], [0.45, '#c86ab8'], [0.75, '#ff9a6b'], [1, '#ffd08a']], 0, 470); g.fillRect(0, 0, W, 470);
    var r = seeded(71);
    for (var i = 0; i < 40; i++) { circle(g, r() * W, r() * 170, 1 + r() * 1.6); fill(g, 'rgba(255,255,255,' + (0.4 + r() * 0.5) + ')'); }
    circle(g, 960, 430, 70); fill(g, '#ffe27a'); ink(g, 4);
    balloonFar(g, 210, 130, 0.9, '#ff5d6c'); balloonFar(g, 1120, 90, 0.7, '#4fd1ff'); balloonFar(g, 560, 170, 0.55, '#5be38f');
    g.fillStyle = '#7a4fb0'; g.beginPath(); g.moveTo(0, 470); g.quadraticCurveTo(240, 360, 520, 450); g.quadraticCurveTo(820, 380, 1080, 440); g.quadraticCurveTo(1200, 410, W, 430); g.lineTo(W, 480); g.lineTo(0, 480); g.closePath(); g.fill(); ink(g, 4);
    // a wooden desk for the keyboard
    g.fillStyle = vgrad(g, [[0, '#c98a4b'], [1, '#9a6233']], 466, H); g.fillRect(0, 466, W, H - 466);
    g.beginPath(); g.moveTo(0, 466); g.lineTo(W, 466); ink(g, 6);
    g.strokeStyle = 'rgba(90,50,20,0.35)'; g.lineWidth = 3;
    for (i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 492 + i * 40); g.bezierCurveTo(300, 480 + i * 40, 900, 506 + i * 40, W, 490 + i * 40); g.stroke(); }
  };
  SCENES.carnival = function (g) {
    g.fillStyle = vgrad(g, [[0, '#160f45'], [0.7, '#4a2a8a'], [1, '#7a3fa8']]); g.fillRect(0, 0, W, H);
    var r = seeded(83), cols = ['#ff5d6c', '#ffd23f', '#4fd1ff', '#5be38f', '#ff7eb6', '#b48cff'];
    for (var i = 0; i < 70; i++) { circle(g, r() * W, r() * 420, 1 + r() * 1.8); fill(g, 'rgba(255,255,255,' + (0.4 + r() * 0.6) + ')'); }
    circle(g, 1060, 250, 40); fill(g, '#fff6c8'); ink(g, 4); circle(g, 1044, 238, 8); fill(g, '#efe2a6');
    // a big wheel
    var wx = 230, wy = 330, R = 190;
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.35)';
    circle(g, wx, wy, R); g.stroke(); circle(g, wx, wy, R * 0.55); g.stroke();
    for (i = 0; i < 12; i++) { var a = i / 12 * TAU; g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.cos(a) * R, wy + Math.sin(a) * R); g.stroke(); }
    for (i = 0; i < 12; i++) { var b = i / 12 * TAU; rr(g, wx + Math.cos(b) * R - 14, wy + Math.sin(b) * R - 6, 28, 24, 7); fill(g, cols[i % 6]); ink(g, 3); }
    g.beginPath(); g.moveTo(wx - 110, 640); g.lineTo(wx, wy); g.lineTo(wx + 110, 640); g.lineWidth = 10; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#c8cfea'; g.stroke();
    circle(g, wx, wy, 16); fill(g, '#ffd23f'); ink(g, 4);
    // tents
    [[930, 560, 150, '#ff5d6c'], [1130, 580, 120, '#4fd1ff']].forEach(function (t) {
      g.beginPath(); g.moveTo(t[0] - t[2] / 2, t[1] + 60); g.lineTo(t[0], t[1] - t[2] * 0.55); g.lineTo(t[0] + t[2] / 2, t[1] + 60); g.closePath(); fill(g, t[3]); ink(g, 5);
      g.save(); g.clip(); for (var k = -3; k < 4; k++) { g.beginPath(); g.moveTo(t[0] + k * 22, t[1] + 70); g.lineTo(t[0] + k * 4, t[1] - t[2]); g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.stroke(); } g.restore();
      g.beginPath(); g.moveTo(t[0] - t[2] / 2, t[1] + 60); g.lineTo(t[0], t[1] - t[2] * 0.55); g.lineTo(t[0] + t[2] / 2, t[1] + 60); g.closePath(); ink(g, 5);
    });
    // string lights
    g.beginPath(); g.moveTo(-10, 90); g.quadraticCurveTo(W / 2, 170, W + 10, 90); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    for (i = 0; i < 22; i++) { var tt = (i + 0.5) / 22, lx = tt * W, ly = 90 + 160 * tt * (1 - tt); circle(g, lx, ly + 8, 7); fill(g, cols[i % 6]); ink(g, 2.5); }
    g.beginPath(); g.moveTo(0, 630); g.lineTo(W, 630); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); fill(g, '#3b8a4a'); ink(g, 5);
    for (i = 0; i < 30; i++) { circle(g, r() * W, 650 + r() * 60, 3); fill(g, cols[i % 6]); }
  };
  SCENES.map2 = function (g) {
    g.fillStyle = vgrad(g, [[0, '#7ae0ff'], [1, '#2a7fd6']]); g.fillRect(0, 0, W, H);
    var r = seeded(9);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 4; g.lineCap = 'round';
    for (var i = 0; i < 26; i++) { var x = r() * W, y = 110 + r() * 600; g.beginPath(); g.arc(x, y, 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.beginPath(); g.arc(x + 26, y, 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    // the dotted way: along the top row, down the left, back along the bottom row
    var P = A.ISLANDS.slice(5);
    g.setLineDash([2, 24]); g.lineWidth = 14; g.strokeStyle = INK; g.lineCap = 'round';
    g.beginPath(); g.moveTo(P[0].x, P[0].y); g.lineTo(P[1].x, P[1].y); g.lineTo(P[2].x, P[2].y);
    g.quadraticCurveTo(P[2].x - 170, (P[2].y + P[3].y) / 2, P[3].x, P[3].y); g.lineTo(P[4].x, P[4].y); g.lineTo(P[5].x, P[5].y); g.stroke();
    g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke(); g.setLineDash([]);
    P.forEach(function (p, j) { island(g, p.x, p.y, j + 5); });
  };
  // Map icons for worlds 6-11, drawn on the island at (x, y).
  function islandNew(g, x, y, j) {
    var t;
    if (j === 5) {
      A.pool(g, { x: x + 24, y: y - 6, r: 48, color: 1 }, 0, true, { glow: 0, pulse: 0 });
      t = { x: x - 52, y: y - 30, r: 28, home: 1, face: 1, phase: 0 }; A.turtle(g, t, 0, true, false);
    } else if (j === 6) {
      t = { x: x, y: y - 40, r: 46, color: 0, phase: 0, knock: 0, dig: 0, armed: true }; A.clam(g, t, 0, true, { open: 1 });
    } else if (j === 7) {
      A.soap(g, x + 6, y - 66, 46);
      A.critter(g, 0, x + 6, y - 64, 0.8);
      rr(g, x - 4, y - 22, 12, 34, 5); fill(g, '#ff7eb6'); ink(g, 3.5);
      t = { x: x + 70, y: y - 120, r: 18, color: 3, phase: 0 }; A.soap(g, t.x, t.y, t.r);
    } else if (j === 8) {
      g.save(); g.translate(x, y - 46); g.scale(0.62, 0.62); A.sub(g, { x: 0, y: 0, vx: 0, vy: 0, face: 1 }, { bop: { color: 0 }, time: 0, still: true, happy: 0 }); g.restore();
      starPath(g, x - 74, y - 80, 16, 8, 0.2); fill(g, '#ff8a5c'); ink(g, 3);
    } else if (j === 9) {
      t = { x: x - 2, y: y - 100, r: 30, color: 1, phase: 0, code: 'KeyF', cap: 50 }; A.kballoon(g, t, 0, true);
    } else {
      g.lineWidth = 5; g.strokeStyle = INK; circle(g, x - 10, y - 70, 56); g.stroke();
      for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; g.beginPath(); g.moveTo(x - 10, y - 70); g.lineTo(x - 10 + Math.cos(a) * 56, y - 70 + Math.sin(a) * 56); g.lineWidth = 3; g.stroke(); circle(g, x - 10 + Math.cos(a) * 56, y - 70 + Math.sin(a) * 56, 9); fill(g, A.RAINBOW[i % 6]); ink(g, 3); }
      g.beginPath(); g.moveTo(x - 50, y + 6); g.lineTo(x - 10, y - 70); g.lineTo(x + 30, y + 6); ink(g, 6);
      starPath(g, x + 70, y - 110, 18, 8); fill(g, '#ffd23f'); ink(g, 3); starPath(g, x - 90, y - 120, 12, 5); fill(g, '#ff7eb6'); ink(g, 3);
    }
  }
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
  A.reset = function () { cache = {}; recent = { pool: [], co: [], cap: [] }; bgCache = []; kbCache = null; };
})();
