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

  var DRAW = [64, 80, 56, 88, 72, 68, 44, 108, 146];

  function paintBot(type, frame) {
    var king = type === 8, boss = type === 7;
    var S = king ? 180 : boss ? 128 : 96;
    var c = canvas(S, S), g = c.getContext('2d');
    var cx = S / 2, cy = S / 2 + (king ? 8 : 4);
    var body = palette[type] || '#3ec6ff';
    var bob = frame ? 3 : -2;
    g.fillStyle = 'rgba(40,24,60,0.18)';
    g.beginPath(); g.ellipse(cx, S - 14, S * 0.28, 8, 0, 0, 6.28); g.fill();
    if (type === 2 || type === 3 || type === 4 || type === 6) {
      g.fillStyle = body;
      g.lineWidth = 4;
      g.strokeStyle = '#1c1030';
      if (type === 2) {
        g.beginPath(); g.ellipse(cx, cy + 8, 40, 18, 0, 0, 6.28); g.fill(); g.stroke();
        g.strokeStyle = '#fff6c8'; g.lineWidth = 3;
        g.beginPath(); g.ellipse(cx, cy + 8, 24, 10, 0, 0, 6.28); g.stroke();
      } else if (type === 3) {
        g.fillStyle = '#2f7a32';
        rr(g, cx - 40, cy + 8, 80, 22, 6); g.fill(); g.stroke();
        g.fillStyle = body;
        rr(g, cx - 28, cy - 16, 56, 28, 8); g.fill(); g.stroke();
        g.fillStyle = '#dff6ff';
        rr(g, cx + 18, cy - 6, 22, 10, 4); g.fill();
      } else if (type === 4) {
        g.beginPath(); g.arc(cx - 14, cy, 18, 0, 6.28); g.arc(cx + 14, cy + 2, 16, 0, 6.28); g.fill(); g.stroke();
      } else {
        g.beginPath(); g.arc(cx, cy, 16, 0, 6.28); g.fill(); g.stroke();
      }
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(cx - 6, cy - 2, 4, 0, 6.28); g.arc(cx + 7, cy - 2, 4, 0, 6.28); g.fill();
      g.fillStyle = '#24304a';
      g.beginPath(); g.arc(cx - 5, cy - 1, 1.8, 0, 6.28); g.arc(cx + 8, cy - 1, 1.8, 0, 6.28); g.fill();
      return c;
    }
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
      g.lineWidth = 5; g.strokeStyle = '#1c1030'; g.stroke();
      g.fillStyle = '#ffd2b8';
      g.beginPath(); g.arc(64, 52 + bob, 18, 0, 6.28); g.fill();
      g.lineWidth = 4; g.stroke();
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

  function paintBlock(g, x, y, w, h, top, side) {
    g.fillStyle = side;
    g.fillRect(x + 10, y + 12, w, h);
    g.fillStyle = top;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(x + 8, y + 8, Math.max(12, w * 0.28), 8);
    g.strokeStyle = '#2b1848';
    g.lineWidth = 4;
    g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }

  function paintGround(map) {
    var c = canvas(D.W, D.H), g = c.getContext('2d', { alpha: false });
    var tile = 80, edge = 64;
    var wood = map === 2 ? '#5c6c94' : map === 1 ? '#e6c4a2' : '#c9843c';
    var wood2 = map === 2 ? '#516284' : map === 1 ? '#f3d4b6' : '#b87330';
    for (var py = 0; py < D.H; py += 48) {
      g.fillStyle = ((py / 48) & 1) ? wood2 : wood;
      g.fillRect(0, py, D.W, 48);
    }
    var a = map === 2 ? '#9aadd8' : map === 1 ? '#fff6e8' : '#f8dc92';
    var b = map === 2 ? '#7d92c4' : map === 1 ? '#f0cfae' : '#e7b45a';
    for (var y = edge; y < D.H - edge; y += tile) {
      for (var x = edge; x < D.W - edge; x += tile) {
        g.fillStyle = (((x / tile) + (y / tile)) & 1) ? b : a;
        g.fillRect(x, y, Math.min(tile, D.W - edge - x), Math.min(tile, D.H - edge - y));
      }
    }
    g.strokeStyle = map === 2 ? '#e8eeff' : map === 1 ? '#ff7a62' : '#22b4c4';
    g.lineWidth = 18;
    g.strokeRect(edge, edge, D.W - edge * 2, D.H - edge * 2);
    g.strokeStyle = '#fff6d4';
    g.lineWidth = 6;
    g.strokeRect(edge + 16, edge + 16, D.W - (edge + 16) * 2, D.H - (edge + 16) * 2);
    var blocks = (D.blocks && D.blocks[map]) || [];
    var tops = ['#ff5a7a', '#3ec6ff', '#5dcc4a', '#ffe14a', '#c06bff', '#ff8a24'];
    var sides = ['#c43458', '#1f8fbf', '#3a9a32', '#d4b423', '#8a45c4', '#d46512'];
    for (var i = 0; i < blocks.length; i++) {
      var bl = blocks[i];
      paintBlock(g, bl[0], bl[1], bl[2], bl[3], tops[i % 6], sides[i % 6]);
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
        if (!reduced) burst(e.x, e.y, 5, '#f4f7ff', 1, 180);
        if (e.a >= 7) flash = Math.min(0.28, flash + 0.12);
      } else if (e.k === 5 || e.k === 12) {
        R.float(e.x, e.y - 16, String(e.a | 0), e.k === 5 ? '#ffe14a' : '#fff');
      } else if (e.k === 6 && !reduced) {
        flash = Math.min(0.2, flash + 0.14);
        burst(e.x, e.y, 14, '#ffe14a', 1, 200);
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
      var s = 20 * cam.z;
      ctx.drawImage(boltSprite, bs.x - s / 2, bs.y - s / 2, s, s);
    }

    for (var ri = 0; ri < run.rAlive.length; ri++) {
      if (!run.rAlive[ri]) continue;
      var rs = worldToScreen(run.rx[ri], run.ry[ri]);
      var type = run.rType[ri];
      var size = ((DRAW[type] || 72) * cam.z + 0.5) | 0;
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
      var lift = kind === 2 ? -Math.sin(Math.min(1, run.pAge[pi] / 0.55) * Math.PI) * 36 * cam.z : 0;
      if (kind === 0 || kind === 3) {
        ctx.save();
        ctx.translate(ps.x, ps.y);
        ctx.rotate(Math.atan2(run.pvy[pi], run.pvx[pi]));
        ctx.fillStyle = kind === 0 ? '#ffd36a' : '#ffb0d4';
        ctx.globalAlpha = 0.55;
        ctx.fillRect(-28 * cam.z, -3 * cam.z, 14 * cam.z, 6 * cam.z);
        ctx.globalAlpha = 1;
        ctx.fillStyle = kind === 0 ? '#ff8a24' : '#ff5a9a';
        ctx.fillRect(-4 * cam.z, -5 * cam.z, 22 * cam.z, 10 * cam.z);
        ctx.fillStyle = '#fff';
        ctx.fillRect(12 * cam.z, -3 * cam.z, 7 * cam.z, 6 * cam.z);
        ctx.restore();
      } else {
        var sx = kind === 1 ? 32 : kind === 2 ? 64 : 0;
        var dw = 22 * cam.z;
        ctx.drawImage(shots, sx, 0, 32, 32, ps.x - dw / 2, ps.y - dw / 2 + lift, dw, dw);
      }
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

    if (run.kingAlive && run.kingId >= 0 && run.rAlive[run.kingId]) {
      var ks = worldToScreen(run.rx[run.kingId], run.ry[run.kingId]);
      if (ks.x < 40 || ks.y < 56 || ks.x > VW - 40 || ks.y > VH - 40) {
        var ax = Math.max(52, Math.min(VW - 52, ks.x));
        var ay = Math.max(70, Math.min(VH - 46, ks.y));
        ctx.fillStyle = '#ff5a4a';
        ctx.beginPath(); ctx.arc(ax, ay, 16, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#ffe14a';
        ctx.font = '700 16px Fredoka';
        ctx.textAlign = 'center';
        ctx.fillText('ملك', ax, ay + 5);
      }
    }
    if (flash > 0 && !reduced) {
      ctx.fillStyle = 'rgba(255,255,255,' + flash + ')';
      ctx.fillRect(-40, -40, VW + 80, VH + 80);
    }
    ctx.fillStyle = 'rgba(28,12,24,0.28)';
    ctx.fillRect(0, 0, VW, 48);
    ctx.fillRect(0, VH - 56, VW, 56);
    ctx.fillRect(0, 0, 36, VH);
    ctx.fillRect(VW - 36, 0, 36, VH);
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
    var size = 186 * cam.z;
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
