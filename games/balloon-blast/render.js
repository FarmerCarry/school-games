/* Balloon Blast — procedural pictures. Static tiles and critters are painted
 * once; the frame only blits them, plus balloons, splashes and a small particle pool. */
(function (BBR) {
  'use strict';
  var BLB = globalThis.BLB, BBD = globalThis.BBD;
  var OX = BBR.OX = 280, OY = BBR.OY = 100;
  var TILE = BLB.TILE;
  var sprites = {}, floors = {}, ready = false, baked = null;
  var parts = [], pMax = 360, pN = 0;
  for (var i = 0; i < pMax; i++) parts.push({ on: 0 });
  var shake = window.Kit ? Kit.shake() : { x: 0, y: 0, add: function () {}, update: function () {} };
  BBR.shake = shake;

  function cvs(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function paintFloor(arena) {
    var cnv = cvs(TILE, TILE), c = cnv.getContext('2d');
    c.fillStyle = arena.floor[0];
    c.fillRect(0, 0, TILE, TILE);
    c.fillStyle = arena.floor[1];
    c.fillRect(0, 0, TILE / 2, TILE / 2);
    c.fillRect(TILE / 2, TILE / 2, TILE / 2, TILE / 2);
    c.globalAlpha = 0.35;
    c.fillStyle = '#fff';
    c.beginPath(); c.ellipse(16, 14, 8, 4, -0.4, 0, 6.28); c.fill();
    return cnv;
  }
  function paintPillar(arena) {
    var cnv = cvs(TILE, TILE), c = cnv.getContext('2d');
    rr(c, 4, 6, TILE - 8, TILE - 10, 10);
    c.fillStyle = arena.pillarDk; c.fill();
    rr(c, 4, 3, TILE - 8, TILE - 12, 10);
    var g = c.createLinearGradient(4, 0, TILE, TILE);
    g.addColorStop(0, arena.pillarHi); g.addColorStop(0.45, arena.pillar); g.addColorStop(1, arena.pillarDk);
    c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.65)';
    rr(c, 10, 8, 14, 8, 4); c.fill();
    return cnv;
  }
  function paintCrate(arena) {
    var cnv = cvs(TILE, TILE), c = cnv.getContext('2d');
    rr(c, 6, 8, TILE - 12, TILE - 14, 6);
    c.fillStyle = arena.crateDk; c.fill();
    rr(c, 6, 5, TILE - 12, TILE - 14, 6);
    c.fillStyle = arena.crate; c.fill();
    c.strokeStyle = arena.nail; c.lineWidth = 3;
    c.beginPath(); c.moveTo(10, 10); c.lineTo(TILE - 12, TILE - 12); c.moveTo(TILE - 12, 10); c.lineTo(10, TILE - 12); c.stroke();
    c.fillStyle = arena.nail;
    [[14, 14], [TILE - 16, 14], [14, TILE - 16], [TILE - 16, TILE - 16]].forEach(function (p) {
      c.beginPath(); c.arc(p[0], p[1], 2.2, 0, 6.28); c.fill();
    });
    return cnv;
  }
  function paintJelly() {
    var cnv = cvs(TILE, TILE), c = cnv.getContext('2d');
    rr(c, 5, 8, TILE - 10, TILE - 12, 12);
    c.fillStyle = '#1a6cb5'; c.fill();
    rr(c, 5, 4, TILE - 10, TILE - 14, 12);
    var g = c.createLinearGradient(0, 0, 0, TILE);
    g.addColorStop(0, '#b9f3ff'); g.addColorStop(0.4, '#3ec6ff'); g.addColorStop(1, '#1478c9');
    c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath(); c.ellipse(18, 16, 8, 5, -0.5, 0, 6.28); c.fill();
    return cnv;
  }

  function eyes(c, x, y, dir, r) {
    var lx = dir === 1 ? 4 : dir === 3 ? -4 : 0;
    var ly = dir === 2 ? 3 : dir === 0 ? -3 : 0;
    [-1, 1].forEach(function (s) {
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(x + s * r * 0.34 + lx * 0.2, y + ly * 0.15, r * 0.28, r * 0.32, 0, 0, 6.28); c.fill();
      c.fillStyle = '#243044';
      c.beginPath(); c.arc(x + s * r * 0.34 + lx, y + ly, r * 0.13, 0, 6.28); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(x + s * r * 0.34 + lx - 2, y + ly - 2, r * 0.045, 0, 6.28); c.fill();
    });
  }
  function hands(c, x, y, r, col) {
    c.fillStyle = col;
    [-1, 1].forEach(function (s) {
      c.beginPath(); c.ellipse(x + s * r * 0.95, y + r * 0.15, r * 0.28, r * 0.18, s * 0.6, 0, 6.28); c.fill();
    });
  }
  function paintCritter(def, dir, frame) {
    var S = 96, cnv = cvs(S, S), c = cnv.getContext('2d');
    var bob = [0, -5, 0, 3][frame];
    var x = 48, y = 50 + bob, r = 28;
    c.fillStyle = 'rgba(20,30,40,0.18)';
    c.beginPath(); c.ellipse(48, 84, 22, 5, 0, 0, 6.28); c.fill();
    if (def.id === 'cat') {
      c.fillStyle = def.extra;
      c.beginPath(); c.moveTo(30, 36); c.lineTo(36, 18); c.lineTo(44, 36); c.fill();
      c.beginPath(); c.moveTo(52, 36); c.lineTo(60, 18); c.lineTo(66, 36); c.fill();
    }
    if (def.id === 'bee') {
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3;
      c.beginPath(); c.ellipse(22, 40, 12, 6, -0.8, 0, 6.28); c.stroke();
      c.beginPath(); c.ellipse(74, 40, 12, 6, 0.8, 0, 6.28); c.stroke();
    }
    c.fillStyle = def.body;
    c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill();
    if (def.id === 'bee') {
      c.fillStyle = def.extra;
      c.fillRect(x - 6, y - r + 4, 5, r * 1.6);
      c.fillRect(x + 4, y - r + 4, 5, r * 1.6);
    }
    if (def.id === 'panda') {
      c.fillStyle = def.extra;
      c.beginPath(); c.ellipse(x - 12, y - 4, 10, 12, 0, 0, 6.28); c.fill();
      c.beginPath(); c.ellipse(x + 12, y - 4, 10, 12, 0, 0, 6.28); c.fill();
    }
    c.fillStyle = def.belly;
    c.beginPath(); c.ellipse(x, y + 6, r * 0.62, r * 0.55, 0, 0, 6.28); c.fill();
    if (def.id === 'penguin') {
      c.fillStyle = def.extra;
      c.beginPath(); c.moveTo(x, y + 16); c.lineTo(x - 7, y + 8); c.lineTo(x + 7, y + 8); c.fill();
    }
    if (def.id === 'camel') {
      c.fillStyle = def.extra;
      c.beginPath(); c.ellipse(x + 6, y - r + 4, 12, 8, 0, 0, 6.28); c.fill();
    }
    if (def.id === 'dino') {
      c.fillStyle = def.extra;
      c.beginPath(); c.moveTo(x - 4, y - r + 2); c.lineTo(x, y - r - 10); c.lineTo(x + 6, y - r + 2); c.fill();
    }
    if (def.id === 'robot') {
      c.fillStyle = def.extra;
      c.fillRect(x - 2, y - r - 8, 4, 10);
      c.beginPath(); c.arc(x, y - r - 10, 4, 0, 6.28); c.fill();
    }
    hands(c, x, y, r, def.belly);
    eyes(c, x, y - 4, dir, r);
    if (def.id === 'frog') {
      c.fillStyle = def.accent;
      c.beginPath(); c.ellipse(x, y + 10, 7, 4, 0, 0, 3.14); c.fill();
    }
    return cnv;
  }

  BBR.boot = function () {
    baked = null;
    sprites = { jelly: paintJelly(), crit: {} };
    floors = {};
    BBD.ARENAS.forEach(function (a) {
      floors[a.id] = { floor: paintFloor(a), pillar: paintPillar(a), crate: paintCrate(a), arena: a };
    });
    BBD.CRITTERS.forEach(function (def) {
      sprites.crit[def.id] = [];
      for (var d = 0; d < 4; d++) {
        sprites.crit[def.id][d] = [];
        for (var f = 0; f < 4; f++) sprites.crit[def.id][d][f] = paintCritter(def, d, f);
      }
    });
    ready = true;
  };

  var rings = [], seen = [];
  function puff(x, y, n, col, kind) {
    if (window.Kit && Kit.motion.reduced()) return;
    for (var i = 0; i < n; i++) {
      var q = parts[pN]; pN = (pN + 1) % pMax;
      var a = Math.random() * 6.28, sp = 70 + Math.random() * (kind === 1 ? 220 : 140);
      q.on = 1; q.x = x; q.y = y; q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp - (kind === 1 ? 180 : 70);
      q.life = q.max = 0.45 + Math.random() * 0.3; q.size = kind === 1 ? 5 + Math.random() * 5 : 2 + Math.random() * 3;
      q.col = col; q.g = kind === 1 ? 700 : 220; q.kind = kind; q.rot = a; q.spin = sp * 0.02;
    }
  }
  BBR.fx = function (kind, x, y) {
    var sx = OX + x, sy = OY + y;
    if (kind === 'spray') { puff(sx, sy, 6, '#f4fdff', 2); puff(sx, sy, 4, '#1aa6ff', 2); }
    else if (kind === 'pop' || kind === 'free') {
      puff(sx, sy, 16, kind === 'pop' ? '#ffd23f' : '#e7f8ff', 2);
      rings.push({ x: sx, y: sy, t: 0.48, col: kind === 'pop' ? '#ffe27a' : '#fff' });
    } else if (kind === 'item') puff(sx, sy, 8, '#fff', 2);
    else if (kind === 'crate') { puff(sx, sy, 8, '#f3d7a1', 1); puff(sx, sy, 7, '#a86a2c', 1); }
    if (rings.length > 12) rings.shift();
  };
  function balloon(c, x, y, fuse, skin, wob) {
    var hot = fuse < 0.9, rate = hot ? 12 + (0.9 - fuse) * 30 : 6;
    var s = 17 * (1 + (2.5 - fuse) * 0.05 + Math.sin(wob * rate) * (hot ? 0.08 : 0.04));
    c.save(); c.translate(x, y);
    c.rotate(Math.sin(wob * rate) * (hot ? 0.18 : 0.07));
    c.scale(1 + Math.sin(wob * 8) * 0.08, 1 - Math.sin(wob * 8) * 0.07);
    var g = c.createRadialGradient(-5, -6, 2, 0, 0, s);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, skin || '#3ec6ff'); g.addColorStop(1, '#1478c9');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, s, 0, 6.28); c.fill();
    if (skin === '#ffd23f') { c.strokeStyle = 'rgba(90,60,0,.4)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(-5, -6, 5, 3, -.6, 0, 6.28); c.fill();
    if (hot && Math.sin(wob * rate) > 0.15) { c.globalAlpha = .7; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, s, 0, 6.28); c.fill(); }
    c.restore();
  }
  function water(ctx, s, time) {
    var cells = s.cells, o = cells[0], a = s.life / s.max;
    if (!s.lit) { s.lit = 1; for (var n = 0; n < cells.length; n++) BBR.fx('spray', (cells[n].c + .5) * TILE, (cells[n].r + .5) * TILE); }
    var ox = OX + (o.c + .5) * TILE, oy = OY + (o.r + .5) * TILE, flash = a > .82;
    ctx.save(); ctx.globalAlpha = a > .18 ? 1 : a / .18; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 1; i < cells.length; i++) { ctx.moveTo(ox, oy); ctx.lineTo(OX + (cells[i].c + .5) * TILE, OY + (cells[i].r + .5) * TILE); }
    ctx.lineWidth = TILE * .96; ctx.strokeStyle = flash ? '#f7fdff' : '#1596f0'; ctx.stroke();
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,.88)'; ctx.stroke();
    ctx.beginPath();
    for (i = 0; i < cells.length; i++) {
      var x = OX + (cells[i].c + .5) * TILE, y = OY + (cells[i].r + .5) * TILE, t = time * 14 + i;
      for (var k = 0; k <= 16; k++) {
        var ang = k * .3927, rr = TILE * .58 + Math.sin(ang * 4 + t) * 3.6;
        if (k) ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); else ctx.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      ctx.closePath();
    }
    ctx.fillStyle = flash ? '#fff' : '#1aa6f6'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  function bubble(c, x, y, t, urgent) {
    var rad = 36 + Math.sin(t * (urgent ? 16 : 6)) * 2;
    c.save(); c.translate(x, y);
    var g = c.createRadialGradient(-12, -14, 3, 0, 0, rad);
    g.addColorStop(0, '#fff'); g.addColorStop(.22, 'rgba(170,230,255,.5)'); g.addColorStop(1, 'rgba(16,130,210,.6)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rad, 0, 6.28); c.fill();
    c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(-11, -13, 7, 4, -.5, 0, 6.28); c.fill();
    c.restore();
  }

  function text(c, str, x, y, size, align, fill) {
    c.direction = 'rtl';
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    c.font = '700 ' + size + 'px Fredoka';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(12,24,48,0.55)';
    c.lineWidth = Math.max(3, size / 7);
    c.strokeText(str, x, y);
    c.fillStyle = fill || '#fff';
    c.fillText(str, x, y);
  }

  function badge(c, x, y, n) {
    c.save();
    c.direction = 'ltr';
    c.fillStyle = n === 1 ? '#1478e6' : '#ff4d88';
    rr(c, x - 16, y - 10, 32, 20, 10); c.fill();
    c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = '#fff';
    c.font = '700 13px Fredoka';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('P' + n, x, y + 1);
    c.restore();
  }
  function hudCard(c, p, x, y, label) {
    var def = BBD.critter(p.critter);
    var spr = sprites.crit[def.id][p.face][0];
    c.fillStyle = 'rgba(255,255,255,.94)';
    rr(c, x, y, 232, 80, 16); c.fill();
    if (spr) c.drawImage(spr, x + 8, y + 14, 50, 50);
    text(c, label, x + 216, y + 24, 16, 'right', '#16324f');
    var row = y + 58, icons = ['🎈', '💧', '👟'], vals = [p.balloons, p.range, p.speed], slot = [86, 140, 194];
    c.save(); c.direction = 'ltr'; c.font = '700 18px Fredoka'; c.textBaseline = 'middle'; c.fillStyle = '#16324f';
    for (var i = 0; i < 3; i++) {
      c.textAlign = 'center'; c.fillText(icons[i], x + slot[i], row);
      c.textAlign = 'left'; c.fillText(vals[i], x + slot[i] + 16, row);
    }
    c.restore();
  }
  function walking(p, time) {
    var s = seen[p.id] || (seen[p.id] = { x: p.x, y: p.y, t: -1 });
    if (s.x !== p.x || s.y !== p.y) { s.t = time; s.x = p.x; s.y = p.y; }
    return time - s.t < 0.16;
  }

  BBR.draw = function (ctx, world, opts) {
    if (!ready) BBR.boot();
    opts = opts || {};
    var W = 1280, H = 720;
    var arena = floors[world.arena] || floors.garden;
    ctx.clearRect(0, 0, W, H);
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, arena.arena.sky[0]);
    sky.addColorStop(1, arena.arena.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Side curtains so the gutters feel like part of the arena, not empty bars.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rr(ctx, 16, 88, 250, 600, 28); ctx.fill();
    rr(ctx, 1014, 88, 250, 600, 28); ctx.fill();

    shake.update(1 / 60);
    if (world.pendingShake) { shake.add(world.pendingShake); world.pendingShake = 0; }
    ctx.save();
    ctx.translate(shake.x, shake.y);

    ctx.save();
    rr(ctx, OX - 10, OY - 10, BLB.COLS * TILE + 20, BLB.ROWS * TILE + 20, 18);
    ctx.fillStyle = arena.arena.edge; ctx.fill();
    var sig = world.arena + ':' + world.grid.join(',');
    if (!baked || baked.sig !== sig) {
      var map = cvs(BLB.COLS * TILE, BLB.ROWS * TILE), mc = map.getContext('2d');
      for (var r = 0; r < BLB.ROWS; r++) for (var col = 0; col < BLB.COLS; col++) {
        var t = world.grid[r * BLB.COLS + col];
        var img = t === BLB.PILLAR ? arena.pillar : t === BLB.CRATE ? arena.crate : t === BLB.JELLY ? sprites.jelly : arena.floor;
        mc.drawImage(img, col * TILE, r * TILE);
      }
      baked = { sig: sig, map: map };
    }
    ctx.drawImage(baked.map, OX, OY);
    if (world.exit) {
      ctx.fillStyle = '#b6ff9a';
      ctx.fillRect(OX + world.exit.c * TILE + 8, OY + world.exit.r * TILE + 8, TILE - 16, TILE - 16);
      text(ctx, 'خروج', OX + (world.exit.c + 0.5) * TILE, OY + (world.exit.r + 0.5) * TILE, 16, 'center', '#145c32');
    }
    if (world.cake) {
      var kx = OX + (world.cake.c + 0.5) * TILE, ky = OY + (world.cake.r + 0.5) * TILE;
      ctx.fillStyle = '#ff8fb8';
      ctx.beginPath(); ctx.arc(kx, ky, 16, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(kx - 2, ky - 22, 4, 10);
    }
    world.drops.forEach(function (d) {
      var icon = d.kind === 'balloon' ? '🎈' : d.kind === 'range' ? '💧' : d.kind === 'speed' ? '👟' : d.kind === 'kick' ? '🧤' : '🐢';
      var age = world.time - (d.born || 0), pop = age >= 0 && age < .48;
      var hop = pop ? Math.sin(age * 6.55) * 20 : 0, sc = pop ? .35 + Math.min(.65, age * 3.6) : 1;
      ctx.save();
      ctx.translate(OX + (d.c + 0.5) * TILE, OY + (d.r + 0.5) * TILE - hop);
      ctx.scale(sc, sc);
      text(ctx, icon, 0, 0, 26, 'center', '#fff');
      ctx.restore();
    });
    world.balloons.forEach(function (b) {
      var skin = b.owner < 0 ? '#ffd23f' : ['#3ec6ff', '#ff6b8a', '#ffd23f', '#7dce6a'][b.owner % 4];
      balloon(ctx, OX + b.x, OY + b.y, b.fuse, skin, world.time + b.id);
    });
    if (world.duck && world.duck.hp > 0) {
      var dx = OX + (world.duck.x || ((world.duck.c + 0.5) * TILE));
      var dy = OY + (world.duck.y || ((world.duck.r + 0.5) * TILE));
      var bob = Math.sin(world.time * 6) * 3;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(dx, dy + bob, 28, 22, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffe58a';
      ctx.beginPath(); ctx.ellipse(dx, dy + 4 + bob, 16, 12, 0, 0, 6.28); ctx.fill();
      eyes(ctx, dx + 6, dy - 2 + bob, 1, 16);
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.moveTo(dx + 22, dy + bob); ctx.lineTo(dx + 34, dy - 4 + bob); ctx.lineTo(dx + 22, dy + 6 + bob); ctx.fill();
      text(ctx, String(world.duck.hp), dx, dy + 28, 16, 'center', '#7a4a00');
    }
    world.players.forEach(function (p) {
      if (p.state === 'out') return;
      var def = BBD.critter(p.critter);
      var moving = walking(p, world.time);
      var hop = moving ? Math.abs(Math.sin(world.time * 12 + p.id)) * 4 : 0;
      var fr = moving ? (Math.floor(world.time * 10 + p.id) % 4) : 0;
      var spr = sprites.crit[def.id] ? sprites.crit[def.id][p.face][fr] : null;
      if (spr) ctx.drawImage(spr, OX + p.x - 35, OY + p.y - 38 - hop, 70, 70);
      if (p.state === 'bubble') bubble(ctx, OX + p.x, OY + p.y - 4 - hop, world.time + p.id, p.bubbleT < 0.7);
      if (!p.cpu) badge(ctx, OX + p.x, OY + p.y - (p.state === 'bubble' ? 50 : 32) - hop, p.id + 1);
    });
    world.splashes.forEach(function (s) { water(ctx, s, world.time); });
    ctx.restore();
    ctx.restore();

    for (var pi = 0; pi < pMax; pi++) {
      var q = parts[pi];
      if (!q.on) continue;
      q.life -= 1 / 60;
      if (q.life <= 0) { q.on = 0; continue; }
      q.vy += q.g / 60; q.x += q.vx / 60; q.y += q.vy / 60; q.rot += q.spin / 60;
      ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.col;
      if (q.kind === 1) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size, -q.size * .35, q.size * 2, q.size * .7); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, 6.28); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    for (var ri = rings.length - 1; ri >= 0; ri--) {
      var rg = rings[ri]; rg.t -= 1 / 60;
      if (rg.t <= 0) { rings.splice(ri, 1); continue; }
      ctx.globalAlpha = Math.min(1, rg.t * 2); ctx.lineWidth = 8; ctx.strokeStyle = rg.col;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, 16 + (1 - rg.t / .48) * 50, 0, 6.28); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (opts.hud && world.players.length) {
      var labels = opts.labels || [];
      world.players.forEach(function (p, i) {
        if (p.robot) return;
        var x = i % 2 === 0 ? 22 : 1026;
        var y = 108 + Math.floor(i / 2) * 92;
        hudCard(ctx, p, x, y, labels[i] || p.name || '');
      });
      var clock = Math.max(0, Math.ceil((world.battle ? 100 : 0) - world.time));
      if (world.battle) text(ctx, window.Kit ? Kit.fmt(clock) : String(clock), 640, 46, 36, 'center', world.sudden ? '#ff5a7a' : '#16324f');
      if (opts.banner) text(ctx, opts.banner, 640, 360, 42, 'center', '#fff');
    }
    if (world.freeze > 0 && opts.hud) {
      text(ctx, window.Kit ? Kit.fmt(Math.ceil(world.freeze)) : String(Math.ceil(world.freeze)), 640, OY + 240, 72, 'center', '#fff');
    }
  };
})(globalThis.BBR = globalThis.BBR || {});
