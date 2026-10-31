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
    var bob = [0, -3, 0, 2][frame];
    var x = 48, y = 52 + bob, r = 26;
    c.fillStyle = 'rgba(20,30,40,0.18)';
    c.beginPath(); c.ellipse(48, 78, 18, 6, 0, 0, 6.28); c.fill();
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

  function burst(x, y, n, col) {
    if (window.Kit && Kit.motion.reduced()) return;
    for (var i = 0; i < n && i < 24; i++) {
      var q = parts[pN]; pN = (pN + 1) % pMax;
      var a = Math.random() * 6.28, sp = 40 + Math.random() * 160;
      q.on = 1; q.x = x; q.y = y; q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp - 40;
      q.life = 0.35 + Math.random() * 0.35; q.max = q.life;
      q.size = 3 + Math.random() * 4; q.col = col; q.g = 420;
    }
  }
  BBR.fx = function (kind, x, y) {
    var sx = OX + x, sy = OY + y;
    if (kind === 'boom') burst(sx, sy, 16, '#7ad7ff');
    else if (kind === 'pop') burst(sx, sy, 18, '#ffd23f');
    else if (kind === 'item') burst(sx, sy, 10, '#fff');
    else if (kind === 'crate') burst(sx, sy, 8, '#e0a35a');
  };

  function balloon(c, x, y, fuse, skin, wob) {
    var pulse = 1 + Math.sin(wob * 9) * (fuse < 0.6 ? 0.08 : 0.03);
    var s = 16 * pulse;
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(wob * 6) * 0.08);
    c.fillStyle = 'rgba(20,40,60,0.15)';
    c.beginPath(); c.ellipse(0, s * 0.85, s * 0.7, s * 0.28, 0, 0, 6.28); c.fill();
    var g = c.createRadialGradient(-5, -6, 2, 0, 0, s);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, skin || '#3ec6ff');
    g.addColorStop(1, '#1478c9');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, s, 0, 6.28); c.fill();
    if (skin === '#ffd23f') {
      c.strokeStyle = 'rgba(90,60,0,0.35)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.ellipse(-5, -6, 5, 3, -0.6, 0, 6.28); c.fill();
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

  function hudCard(c, p, x, y, label) {
    var def = BBD.critter(p.critter);
    var spr = sprites.crit[def.id][p.face][0];
    c.fillStyle = 'rgba(255,255,255,0.88)';
    rr(c, x, y, 168, 72, 16); c.fill();
    if (spr) c.drawImage(spr, x + 4, y - 6, 64, 64);
    text(c, label, x + 150, y + 18, 16, 'right', '#16324f');
    text(c, 'بالون ' + p.balloons + '   رش ' + p.range + '   سرعة ' + p.speed + (p.kick ? '   ركل' : ''), x + 150, y + 46, 15, 'right', '#16324f');
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
      text(ctx, icon, OX + (d.c + 0.5) * TILE, OY + (d.r + 0.5) * TILE, 22, 'center', '#fff');
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
      var moving = p.bufT > 0 || p.brain === 'march';
      var fr = moving ? (Math.floor(world.time * 8 + p.id) % 4) : 0;
      var spr = sprites.crit[def.id] ? sprites.crit[def.id][p.face][fr] : null;
      if (spr) ctx.drawImage(spr, OX + p.x - 32, OY + p.y - 40, 64, 64);
      if (p.state === 'bubble') {
        var rad = 30 + Math.sin(world.time * 8 + p.id) * 2;
        ctx.beginPath(); ctx.arc(OX + p.x, OY + p.y - 6, rad, 0, 6.28);
        ctx.fillStyle = 'rgba(186,230,255,0.35)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.stroke();
      }
    });
    world.splashes.forEach(function (s) {
      var a = Math.max(0, s.life / s.max);
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#e9fbff';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      s.cells.forEach(function (cell) {
        var x = OX + (cell.c + 0.5) * TILE, y = OY + (cell.r + 0.5) * TILE;
        ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.28); ctx.stroke();
      });
      ctx.strokeStyle = '#3ec6ff';
      ctx.lineWidth = 6;
      s.cells.forEach(function (cell) {
        var x = OX + (cell.c + 0.5) * TILE, y = OY + (cell.r + 0.5) * TILE;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.28); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    ctx.restore();

    for (var pi = 0; pi < pMax; pi++) {
      var q = parts[pi];
      if (!q.on) continue;
      q.life -= 1 / 60;
      if (q.life <= 0) { q.on = 0; continue; }
      q.vy += q.g * (1 / 60);
      q.x += q.vx * (1 / 60); q.y += q.vy * (1 / 60);
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.col;
      ctx.fillRect(q.x, q.y, q.size, q.size);
      ctx.globalAlpha = 1;
    }

    if (opts.hud && world.players.length) {
      var labels = opts.labels || [];
      world.players.forEach(function (p, i) {
        if (p.robot) return;
        var x = i % 2 === 0 ? 24 : 1036;
        var y = 110 + Math.floor(i / 2) * 86;
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
