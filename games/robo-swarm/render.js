/* هجوم الروبوتات — baked sprites, one ground bitmap per map, pooled sparks. */
(function (R) {
  'use strict';

  var D = globalThis.RSD;
  var VW = 1280, VH = 720;
  var PMAX = 400, DMAX = 40;
  var bots = [], heroes = [], shots = null, boltSprite = null, grounds = [null, null, null];
  var worldBuf = null, worldCtx = null;
  var icons = [];
  var parts = new Array(PMAX), pCursor = 0, pLive = 0;
  var dmgs = new Array(DMAX), dCursor = 0, dLive = 0;
  var cam = { x: 1200, y: 700, z: 1 };
  var flash = 0;
  var palette = ['#3ec6ff', '#ffe14a', '#ff8a24', '#5dcc4a', '#c06bff', '#ff5a9a', '#9af0ff', '#ffb020', '#ff5a4a'];

  for (var i = 0; i < PMAX; i++) parts[i] = { on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, color: '#fff', kind: 0, rot: 0 };
  for (var j = 0; j < DMAX; j++) dmgs[j] = { on: 0, x: 0, y: 0, life: 0, text: '', color: '#fff' };

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function paintBot(type, frame) {
    var king = type === 8, boss = type === 7;
    var S = king ? 180 : boss ? 128 : 96;
    var c = canvas(S, S), g = c.getContext('2d');
    var cx = S / 2, cy = S / 2 + (king ? 8 : 4);
    var body = palette[type] || '#3ec6ff';
    var bob = frame ? 3 : -2;
    g.fillStyle = 'rgba(40,24,60,0.18)';
    g.beginPath(); g.ellipse(cx, S - 14, S * 0.28, 8, 0, 0, 6.28); g.fill();
    // springy legs
    g.strokeStyle = '#f4f7ff';
    g.lineWidth = king ? 5 : 3;
    g.lineCap = 'round';
    for (var leg = -1; leg <= 1; leg += 2) {
      g.beginPath();
      var lx = cx + leg * (king ? 28 : 16);
      g.moveTo(lx, cy + 8);
      for (var s = 0; s < 4; s++) g.lineTo(lx + (s % 2 ? 7 : -7) * leg, cy + 14 + s * 7 + bob);
      g.stroke();
      g.fillStyle = '#ffe14a';
      g.beginPath(); g.arc(lx + (frame ? 4 : -4) * leg, cy + 44 + bob, king ? 8 : 5, 0, 6.28); g.fill();
    }
    // tin body
    var bw = king ? 78 : boss ? 52 : type === 3 ? 46 : 36;
    var bh = king ? 70 : boss ? 48 : type === 1 ? 40 : 34;
    g.fillStyle = body;
    rr(g, cx - bw / 2, cy - bh / 2 + bob, bw, bh, 14);
    g.fill();
    g.lineWidth = king ? 6 : 4;
    g.strokeStyle = '#2b1848';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    rr(g, cx - bw / 2 + 6, cy - bh / 2 + bob + 4, bw * 0.35, bh * 0.28, 8);
    g.fill();
    if (type === 2) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy + bob, bw * 0.42, 0, 6.28); g.stroke();
    }
    if (type === 5) {
      g.fillStyle = '#dff6ff';
      rr(g, cx + bw / 2 - 6, cy - 6 + bob, 16, 12, 6); g.fill();
    }
    // googly eyes on the body
    var eye = king ? 11 : 7;
    for (var e = -1; e <= 1; e += 2) {
      var ex = cx + e * (king ? 18 : 10);
      var ey = cy - 4 + bob;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ex, ey, eye, 0, 6.28); g.fill();
      g.fillStyle = '#24304a';
      g.beginPath(); g.arc(ex + (frame ? 2.2 : -2.2), ey + 1, eye * 0.45, 0, 6.28); g.fill();
    }
    // smile
    g.strokeStyle = '#24304a';
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy + 6 + bob, king ? 10 : 6, 0.2, Math.PI - 0.2); g.stroke();
    // antenna
    g.strokeStyle = body;
    g.lineWidth = king ? 4 : 3;
    g.beginPath(); g.moveTo(cx, cy - bh / 2 + bob); g.lineTo(cx + (frame ? 6 : -6), cy - bh / 2 - 16 + bob); g.stroke();
    g.fillStyle = '#ffe14a';
    g.beginPath(); g.arc(cx + (frame ? 6 : -6), cy - bh / 2 - 18 + bob, king ? 7 : 5, 0, 6.28); g.fill();
    // wind-up key
    g.save();
    g.translate(cx + bw * 0.15, cy - bh / 2 + bob + 2);
    g.rotate(-0.6);
    g.fillStyle = '#d8deea';
    rr(g, -3, -16, 6, 18, 2); g.fill();
    rr(g, -9, -22, 18, 8, 3); g.fill();
    g.restore();
    if (king) {
      g.fillStyle = '#ffe14a';
      g.beginPath();
      g.moveTo(cx - 34, cy - bh / 2 + bob + 6);
      g.lineTo(cx - 24, cy - bh / 2 - 18 + bob);
      g.lineTo(cx - 10, cy - bh / 2 + bob + 2);
      g.lineTo(cx, cy - bh / 2 - 26 + bob);
      g.lineTo(cx + 10, cy - bh / 2 + bob + 2);
      g.lineTo(cx + 24, cy - bh / 2 - 18 + bob);
      g.lineTo(cx + 34, cy - bh / 2 + bob + 6);
      g.fill();
    }
    return c;
  }

  function paintHero(index, frame) {
    var hero = D.heroes[index];
    var c = canvas(128, 128), g = c.getContext('2d');
    var bob = frame ? 2 : -1;
    var shirt = ['#ff8a24', '#3ddc84', '#ffe14a', '#c06bff', '#ff5a7a', '#3ec6ff'][index];
    g.fillStyle = 'rgba(40,24,60,0.2)';
    g.beginPath(); g.ellipse(64, 112, 28, 7, 0, 0, 6.28); g.fill();
    if (hero.kind === 1) {
      g.fillStyle = '#d7e2f2';
      rr(g, 40, 48 + bob, 48, 46, 16); g.fill();
      g.fillStyle = '#3ec6ff';
      g.fillRect(46, 70 + bob, 36, 8);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(54, 64 + bob, 7, 0, 6.28); g.arc(74, 64 + bob, 7, 0, 6.28); g.fill();
      g.fillStyle = '#24304a';
      g.beginPath(); g.arc(56, 65 + bob, 3, 0, 6.28); g.arc(76, 65 + bob, 3, 0, 6.28); g.fill();
    } else {
      g.fillStyle = shirt;
      rr(g, 42, 62 + bob, 44, 36, 14); g.fill();
      g.fillStyle = '#ffd2b8';
      g.beginPath(); g.arc(64, 52 + bob, 18, 0, 6.28); g.fill();
      g.fillStyle = '#24304a';
      rr(g, 46, 36 + bob, 36, 16, 8); g.fill();
      g.fillStyle = '#9af0ff';
      rr(g, 48, 46 + bob, 32, 10, 5); g.fill();
      g.fillStyle = '#24304a';
      g.beginPath(); g.arc(56, 54 + bob, 2.2, 0, 6.28); g.arc(72, 54 + bob, 2.2, 0, 6.28); g.fill();
      g.strokeStyle = '#c47a58';
      g.lineWidth = 2;
      g.beginPath(); g.arc(64, 58 + bob, 6, 0.2, Math.PI - 0.2); g.stroke();
    }
    // foam blaster: chunky orange and teal with a bubble tank
    g.save();
    g.translate(86, 78 + bob);
    g.fillStyle = '#14b8c8';
    rr(g, 4, -16, 16, 18, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(10, -8, 3, 0, 6.28); g.arc(15, -4, 2.2, 0, 6.28); g.fill();
    g.fillStyle = '#ff8a24';
    rr(g, -8, -8, 34, 14, 6); g.fill();
    g.fillStyle = '#ffd23a';
    g.beginPath(); g.arc(26, -1, 6, 0, 6.28); g.fill();
    g.restore();
    return c;
  }

  function paintShot() {
    var c = canvas(160, 32), g = c.getContext('2d');
    function blob(x, color) {
      g.fillStyle = color;
      g.beginPath(); g.arc(x, 16, 10, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(x - 3, 12, 3, 0, 6.28); g.fill();
    }
    blob(16, '#ffb15a');
    g.fillStyle = '#ffe14a';
    g.beginPath(); g.ellipse(48, 16, 12, 5, 0.4, 0, 6.28); g.fill();
    blob(80, '#4d7dff');
    blob(112, '#ff8ad0');
    g.fillStyle = '#ffe14a';
    g.beginPath(); g.arc(144, 16, 9, 0, 6.28); g.fill();
    g.fillStyle = '#ff8a24';
    g.beginPath(); g.arc(144, 16, 4, 0, 6.28); g.fill();
    return c;
  }

  function paintBolt() {
    var c = canvas(24, 24), g = c.getContext('2d');
    g.fillStyle = '#ffe14a';
    g.beginPath();
    g.moveTo(12, 1); g.lineTo(15, 9); g.lineTo(23, 9); g.lineTo(16, 14); g.lineTo(19, 23); g.lineTo(12, 17); g.lineTo(5, 23); g.lineTo(8, 14); g.lineTo(1, 9); g.lineTo(9, 9);
    g.fill();
    return c;
  }

  function paintIcon(id) {
    var c = canvas(96, 96), g = c.getContext('2d');
    var color = id >= 10 ? D.evos[id - 10].color : D.weapons[id].color;
    g.fillStyle = color;
    g.beginPath(); g.arc(48, 48, 34, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    if (id === 0 || id === 11) { rr(g, 22, 40, 52, 16, 8); g.fill(); g.fillStyle = '#14b8c8'; rr(g, 54, 28, 16, 18, 6); g.fill(); }
    else if (id === 1) { g.beginPath(); g.arc(34, 48, 10, 0, 6.28); g.arc(62, 48, 10, 0, 6.28); g.fill(); }
    else if (id === 2) { g.beginPath(); g.ellipse(48, 48, 26, 10, 0.4, 0, 6.28); g.fill(); }
    else if (id === 3) { g.beginPath(); g.arc(48, 50, 16, 0, 6.28); g.fill(); }
    else if (id === 4 || id === 10) { g.beginPath(); g.arc(48, 46, 16, 0, 6.28); g.fill(); g.fillStyle = '#ff8a24'; g.beginPath(); g.arc(42, 44, 3, 0, 6.28); g.arc(54, 44, 3, 0, 6.28); g.fill(); }
    else if (id === 5) { g.beginPath(); g.ellipse(48, 52, 22, 12, 0, 0, 6.28); g.fill(); }
    else if (id === 6) { rr(g, 40, 22, 16, 28, 6); g.fill(); g.beginPath(); g.arc(48, 62, 16, 0.2, Math.PI - 0.2); g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke(); }
    else if (id === 7) { rr(g, 24, 48, 22, 12, 6); g.fill(); rr(g, 50, 48, 22, 12, 6); g.fill(); }
    else if (id === 8) { g.beginPath(); g.arc(48, 46, 14, 0, 6.28); g.fill(); }
    else { g.globalAlpha = 0.9; g.beginPath(); g.arc(48, 48, 22, 0, 6.28); g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); }
    return c;
  }

  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function paintGround(map) {
    var c = canvas(D.W, D.H), g = c.getContext('2d');
    var m = D.maps[map];
    var rand = lcg(100 + map * 17);
    g.fillStyle = m.floor;
    g.fillRect(0, 0, D.W, D.H);
    if (map === 0) {
      for (var y = 0; y < D.H; y += 80) {
        g.fillStyle = y % 160 === 0 ? '#ffe3a3' : '#f3b24e';
        g.fillRect(0, y, D.W, 80);
      }
      for (var i = 0; i < 46; i++) {
        var x = 40 + rand() * (D.W - 80), yy = 40 + rand() * (D.H - 80);
        g.fillStyle = ['#ff5a7a', '#3ec6ff', '#5dcc4a', '#ffe14a', '#c06bff'][(rand() * 5) | 0];
        rr(g, x, yy, 36 + rand() * 28, 28 + rand() * 18, 6);
        g.fill();
      }
    } else if (map === 1) {
      g.fillStyle = '#f6e2c4';
      g.fillRect(0, 0, D.W, D.H);
      for (var k = 0; k < 28; k++) {
        var cx = 80 + rand() * (D.W - 160), cy = 80 + rand() * (D.H - 160), rad = 34 + rand() * 40;
        g.fillStyle = '#e7b07a';
        g.beginPath(); g.arc(cx, cy, rad, 0, 6.28); g.fill();
        g.fillStyle = '#8a4b2a';
        for (var chip = 0; chip < 5; chip++) {
          g.beginPath();
          g.arc(cx + (rand() - 0.5) * rad, cy + (rand() - 0.5) * rad, 3 + rand() * 3, 0, 6.28);
          g.fill();
        }
      }
    } else {
      g.fillStyle = '#8e99bd';
      g.fillRect(0, 0, D.W, D.H);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 4;
      for (var gx = 0; gx < D.W; gx += 160) { g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, D.H); g.stroke(); }
      for (var gy = 0; gy < D.H; gy += 160) { g.beginPath(); g.moveTo(0, gy); g.lineTo(D.W, gy); g.stroke(); }
      for (var n = 0; n < 22; n++) {
        var qx = 60 + rand() * (D.W - 120), qy = 60 + rand() * (D.H - 120), qr = 24 + rand() * 50;
        g.fillStyle = 'rgba(70,78,110,0.35)';
        g.beginPath(); g.arc(qx, qy, qr, 0, 6.28); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.beginPath(); g.arc(qx - qr * 0.2, qy - qr * 0.2, qr * 0.45, 0, 6.28); g.fill();
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 10;
    g.strokeRect(8, 8, D.W - 16, D.H - 16);
    return c;
  }

  R.boot = function () {
    worldBuf = null;
    bots = [];
    for (var t = 0; t < 9; t++) bots.push([paintBot(t, 0), paintBot(t, 1)]);
    heroes = [];
    for (var h = 0; h < D.heroes.length; h++) heroes.push([paintHero(h, 0), paintHero(h, 1)]);
    shots = paintShot();
    boltSprite = paintBolt();
    icons = [];
    for (var u = 0; u < 12; u++) icons.push(paintIcon(u));
    grounds = [null, null, null];
  };

  R.icon = function (id) { return icons[id] || icons[0]; };
  R.hero = function (i) { return heroes[i] ? heroes[i][0] : heroes[0][0]; };

  R.ground = function (map) {
    if (!grounds[map]) grounds[map] = paintGround(map);
    return grounds[map];
  };

  R.count = function () { return pLive; };
  R.dmgCount = function () { return dLive; };

  function burst(x, y, n, color, kind, speed) {
    for (var i = 0; i < n; i++) {
      var q = parts[pCursor];
      pCursor = (pCursor + 1) % PMAX;
      var a = Math.random() * 6.2831853;
      var sp = speed * (0.4 + Math.random() * 0.7);
      q.on = 1; q.x = x; q.y = y;
      q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp - 40;
      q.life = q.max = 0.45 + Math.random() * 0.35;
      q.size = 4 + Math.random() * 6;
      q.color = color; q.kind = kind; q.rot = Math.random() * 6;
    }
  }

  R.events = function (run, reduced) {
    if (!run) return;
    for (var i = 0; i < run.evN; i++) {
      var e = run.ev[i];
      if (e.k === 1) {
        var n = reduced ? 4 : (e.a === 8 ? 22 : e.a === 3 || e.a === 7 ? 14 : 8);
        burst(e.x, e.y, n, palette[e.a] || '#ffe14a', 0, e.a === 8 ? 280 : 180);
        if (!reduced) burst(e.x, e.y, 4, '#ffe14a', 1, 160);
        if (e.a >= 7) flash = Math.min(0.28, flash + 0.12);
      } else if (e.k === 5) {
        R.float(e.x, e.y - 16, String(e.a | 0), '#fff4b0');
      } else if (e.k === 7) flash = reduced ? 0 : 0.35;
    }
  };

  R.float = function (x, y, text, color) {
    var d = dmgs[dCursor];
    dCursor = (dCursor + 1) % DMAX;
    d.on = 1; d.x = x; d.y = y; d.life = 0.7; d.text = text; d.color = color || '#fff';
  };

  function updateFx(dt) {
    pLive = 0; dLive = 0;
    for (var i = 0; i < PMAX; i++) {
      var q = parts[i];
      if (!q.on) continue;
      q.life -= dt;
      if (q.life <= 0) { q.on = 0; continue; }
      q.vy += 420 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.rot += dt * 6;
      pLive++;
    }
    for (var k = 0; k < DMAX; k++) {
      var d = dmgs[k];
      if (!d.on) continue;
      d.life -= dt;
      if (d.life <= 0) { d.on = 0; continue; }
      d.y -= 28 * dt;
      dLive++;
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 1.4);
  }

  R.cam = function (run, dt) {
    var minX = run.x[0], maxX = run.x[0], minY = run.y[0], maxY = run.y[0];
    for (var p = 0; p < run.players; p++) {
      if (run.x[p] < minX) minX = run.x[p];
      if (run.x[p] > maxX) maxX = run.x[p];
      if (run.y[p] < minY) minY = run.y[p];
      if (run.y[p] > maxY) maxY = run.y[p];
    }
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var need = Math.max(maxX - minX + 640, (maxY - minY + 460) * VW / VH);
    var z = Math.max(0.52, Math.min(1.12, VW / need));
    var a = 1 - Math.pow(0.012, dt * 2.2);
    if (a > 1) a = 1;
    cam.x += (cx - cam.x) * a;
    cam.y += (cy - cam.y) * a;
    cam.z += (z - cam.z) * a;
    var vw = VW / cam.z, vh = VH / cam.z;
    cam.x = Math.max(vw / 2, Math.min(D.W - vw / 2, cam.x));
    cam.y = Math.max(vh / 2, Math.min(D.H - vh / 2, cam.y));
    return cam;
  };

  function worldToScreen(x, y) {
    var vw = VW / cam.z, vh = VH / cam.z;
    return { x: (x - (cam.x - vw / 2)) * cam.z, y: (y - (cam.y - vh / 2)) * cam.z };
  }

  R.draw = function (ctx, run, shake, heroesPick, reduced, dt) {
    if (dt) updateFx(dt);
    if (!worldBuf) {
      worldBuf = canvas(640, 360);
      worldCtx = worldBuf.getContext('2d', { alpha: false });
    }
    var out = ctx;
    ctx = worldCtx;
    ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    var frame = ((run.t * 8) | 0) & 1;
    var map = D.maps[run.map];
    ctx.imageSmoothingEnabled = false;
    ctx.direction = 'ltr';
    ctx.fillStyle = map.ink;
    ctx.fillRect(0, 0, VW, VH);
    ctx.translate(shake.x, shake.y);
    var vw = VW / cam.z, vh = VH / cam.z;
    var left = cam.x - vw / 2, top = cam.y - vh / 2;
    var ground = R.ground(run.map);
    var gx = left | 0, gy = top | 0, gw = vw | 0, gh = vh | 0;
    ctx.drawImage(ground, gx, gy, gw, gh, 0, 0, VW, VH);

    for (var zi = 0; zi < run.zAlive.length; zi++) {
      if (!run.zAlive[zi]) continue;
      var zs = worldToScreen(run.zx[zi], run.zy[zi]);
      var rad = run.zr[zi] * cam.z;
      if (zs.x < -rad || zs.y < -rad || zs.x > VW + rad || zs.y > VH + rad) continue;
      ctx.globalAlpha = Math.max(0.25, Math.min(0.7, run.zlife[zi]));
      ctx.fillStyle = run.zKind[zi] === 1 ? 'rgba(90,150,255,0.55)' : 'rgba(255,79,147,0.55)';
      ctx.beginPath(); ctx.arc(zs.x, zs.y, rad, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (var b = 0; b < run.bAlive.length; b++) {
      if (!run.bAlive[b]) continue;
      var bs = worldToScreen(run.bx[b], run.by[b]);
      if (bs.x < -20 || bs.y < -20 || bs.x > VW + 20 || bs.y > VH + 20) continue;
      var s = 16 * cam.z;
      ctx.drawImage(boltSprite, bs.x - s / 2, bs.y - s / 2, s, s);
    }

    for (var ri = 0; ri < run.rAlive.length; ri++) {
      if (!run.rAlive[ri]) continue;
      var rs = worldToScreen(run.rx[ri], run.ry[ri]);
      var type = run.rType[ri];
      var size = ((type === 8 ? 150 : type === 7 ? 104 : type === 6 ? 48 : 72) * cam.z + 0.5) | 0;
      if (rs.x < -size || rs.y < -size || rs.x > VW + size || rs.y > VH + size) continue;
      if (run.rHurt[ri] > 0) ctx.globalAlpha = 0.65;
      ctx.drawImage(bots[type][frame], (rs.x - size / 2) | 0, (rs.y - size / 2) | 0, size, size);
      if (run.rHurt[ri] > 0) ctx.globalAlpha = 1;
    }

    for (var pi = 0; pi < run.pAlive.length; pi++) {
      if (!run.pAlive[pi]) continue;
      var ps = worldToScreen(run.px[pi], run.py[pi]);
      if (ps.x < -30 || ps.y < -30 || ps.x > VW + 30 || ps.y > VH + 30) continue;
      var kind = run.pKind[pi];
      var sx = kind === 1 ? 32 : kind === 2 ? 64 : kind === 3 ? 96 : 0;
      var lift = kind === 2 ? -Math.sin(Math.min(1, run.pAge[pi] / 0.55) * Math.PI) * 36 * cam.z : 0;
      var dw = 22 * cam.z;
      ctx.drawImage(shots, sx, 0, 32, 32, ps.x - dw / 2, ps.y - dw / 2 + lift, dw, dw);
    }

    for (var p = 0; p < run.players; p++) {
      drawPlayer(ctx, run, p, heroesPick[p] || 0, frame);
    }

    for (var qi = 0; qi < PMAX; qi++) {
      var q = parts[qi];
      if (!q.on) continue;
      var qs = worldToScreen(q.x, q.y);
      var alpha = Math.max(0, q.life / q.max);
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(qs.x, qs.y);
      ctx.rotate(q.rot);
      ctx.fillStyle = q.color;
      if (q.kind === 1) ctx.fillRect(-q.size / 2, -2, q.size, 4);
      else ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '700 22px Fredoka';
    for (var di = 0; di < DMAX; di++) {
      var dn = dmgs[di];
      if (!dn.on || !dn.text) continue;
      var ds = worldToScreen(dn.x, dn.y);
      ctx.globalAlpha = Math.max(0, dn.life * 1.4);
      ctx.fillStyle = dn.color;
      ctx.fillText(dn.text, ds.x, ds.y);
    }
    ctx.globalAlpha = 1;

    if (flash > 0 && !reduced) {
      ctx.fillStyle = 'rgba(255,255,255,' + flash + ')';
      ctx.fillRect(-40, -40, VW + 80, VH + 80);
    }
    out.imageSmoothingEnabled = true;
    out.drawImage(worldBuf, 0, 0, 640, 360, 0, 0, VW, VH);
  };

  function drawPlayer(ctx, run, p, hero, frame) {
    var s = worldToScreen(run.x[p], run.y[p]);
    var ring = run.lv[p][1], ducks = run.lv[p][4], tornado = run.evo[p][0];
    if (ring > 0) {
      var n = D.weapons[1].n[ring - 1];
      for (var i = 0; i < n; i++) {
        var a = run.ang[p] + i * 6.2831853 / n;
        var ox = Math.cos(a) * D.weapons[1].orbit * cam.z;
        var oy = Math.sin(a) * D.weapons[1].orbit * cam.z;
        ctx.drawImage(shots, 0, 0, 32, 32, s.x + ox - 12, s.y + oy - 12, 24, 24);
      }
    }
    if (ducks > 0) {
      var nd = tornado ? 5 : D.weapons[4].n[ducks - 1];
      var orbit = tornado ? 120 : D.weapons[4].orbit;
      for (var k = 0; k < nd; k++) {
        var da = -run.ang[p] + k * 6.2831853 / nd;
        var dx = Math.cos(da) * orbit * cam.z;
        var dy = Math.sin(da) * orbit * cam.z;
        ctx.drawImage(shots, 128, 0, 32, 32, s.x + dx - 14, s.y + dy - 14, 28, 28);
      }
    }
    if (run.shield[p] > 0) {
      ctx.strokeStyle = 'rgba(154,240,255,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, 36 * cam.z, 0, 6.28); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(28, 16, 58, 0.28)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 34 * cam.z, 28 * cam.z, 10 * cam.z, 0, 0, 6.28);
    ctx.fill();
    var spr = heroes[hero][frame];
    var size = 124 * cam.z;
    var face = Math.cos(run.aim[p]) < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(face, 1);
    if (run.inv[p] > 0 && ((run.inv[p] * 12) | 0) % 2 === 0) ctx.globalAlpha = 0.45;
    if (run.hp[p] <= 0) ctx.globalAlpha = 0.55;
    if (run.dashT[p] > 0) ctx.scale(1.18, 0.86);
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    ctx.restore();
    if (run.players === 2) {
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.font = '700 18px Fredoka';
      ctx.fillStyle = p === 0 ? '#ffb15a' : '#9af0ff';
      ctx.fillText(String(p + 1), s.x, s.y - size * 0.55);
    }
    if (run.hp[p] <= 0) {
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.font = '700 20px Fredoka';
      ctx.fillStyle = '#fff';
      ctx.fillText('دائخ', s.x, s.y + size * 0.55);
    }
  }

  R.title = function (ctx, t, map, hero) {
    var ground = R.ground(map);
    ctx.save();
    ctx.drawImage(ground, 600, 280, 1200, 700, 0, 0, VW, VH);
    var frame = ((t * 2) | 0) & 1;
    var spots = [[280, 430], [1000, 390], [860, 560], [420, 560]];
    for (var i = 0; i < spots.length; i++) {
      var bob = Math.sin(t * 3 + i) * 6;
      var size = i === 1 ? 120 : 86;
      ctx.drawImage(bots[i === 1 ? 8 : i][frame], spots[i][0] - size / 2, spots[i][1] - size / 2 + bob, size, size);
    }
    var hx = 640 + Math.sin(t * 1.4) * 18;
    var hy = 400;
    for (var d = 0; d < 4; d++) {
      var a = t * 1.6 + d * 1.57;
      ctx.drawImage(shots, 128, 0, 32, 32, hx + Math.cos(a) * 78 - 16, hy + Math.sin(a) * 78 - 16, 32, 32);
    }
    ctx.drawImage(heroes[hero][frame], hx - 58, hy - 64, 116, 116);
    ctx.restore();
  };

  R.resetCam = function (run) {
    cam.x = run.x[0];
    cam.y = run.y[0];
    cam.z = 1;
    flash = 0;
    for (var i = 0; i < PMAX; i++) parts[i].on = 0;
    for (var k = 0; k < DMAX; k++) dmgs[k].on = 0;
    pLive = 0; dLive = 0;
  };
})(globalThis.RSRender = globalThis.RSRender || {});
