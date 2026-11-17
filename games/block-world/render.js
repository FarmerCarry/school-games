/* Block World — render: cached 16x16 chunks, zero-ImageData lightmap, sky, hero, animals & cave mobs. */
(function () {
  'use strict';
  var BW = window.BW;
  var B = BW.B, BLOCKS = BW.BLOCKS, TEX = BW.TEX, WALL_TEX = BW.WALL_TEX, TS = BW.TS;
  var CS = 16, CPX = CS * TS; // 16x16 tiles = 256x256 px chunk

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpRGB(c1, c2, t) {
    return 'rgb(' + Math.round(lerp(c1[0], c2[0], t)) + ',' + Math.round(lerp(c1[1], c2[1], t)) + ',' + Math.round(lerp(c1[2], c2[2], t)) + ')';
  }

  // Day/night atmosphere curve (tod in 0..1)
  BW.envAt = function (tod) {
    tod = ((tod % 1) + 1) % 1;
    var sun = 1, dusk = 0;
    if (tod < 0.48) { sun = 1; dusk = 0; }
    else if (tod < 0.60) { var u = (tod - 0.48) / 0.12; sun = 1 - u * 0.82; dusk = Math.sin(u * Math.PI); }
    else if (tod < 0.86) { sun = 0.18; dusk = 0; }
    else { var u2 = (tod - 0.86) / 0.14; sun = 0.18 + u2 * 0.82; dusk = Math.sin(u2 * Math.PI) * 0.85; }
    var night = 1 - (sun - 0.18) / 0.82;
    var dayTop = [74, 168, 255], dayBot = [190, 236, 255];
    var dskTop = [64, 44, 118], dskBot = [255, 138, 76];
    var ngtTop = [11, 14, 38], ngtBot = [28, 36, 78];
    var top = [lerp(dayTop[0], ngtTop[0], night), lerp(dayTop[1], ngtTop[1], night), lerp(dayTop[2], ngtTop[2], night)];
    var bot = [lerp(dayBot[0], ngtBot[0], night), lerp(dayBot[1], ngtBot[1], night), lerp(dayBot[2], ngtBot[2], night)];
    if (dusk > 0.01) {
      top = [lerp(top[0], dskTop[0], dusk), lerp(top[1], dskTop[1], dusk), lerp(top[2], dskTop[2], dusk)];
      bot = [lerp(bot[0], dskBot[0], dusk), lerp(bot[1], dskBot[1], dusk), lerp(bot[2], dskBot[2], dusk)];
    }
    return {
      sun: sun, night: night, dusk: dusk,
      skyTop: lerpRGB(top, top, 0),
      skyBot: lerpRGB(bot, bot, 0)
    };
  };

  // Pre-baked radial glow sprites (bounded static canvases, zero per-frame allocations)
  function bakeRadial(size, stops) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d'), r = size / 2;
    var grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (var i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }
  BW.GLOW_WARM = bakeRadial(64, [[0, 'rgba(255,214,90,0.55)'], [0.45, 'rgba(255,150,40,0.22)'], [1, 'rgba(255,120,20,0)']]);
  BW.GLOW_CYAN = bakeRadial(64, [[0, 'rgba(80,250,245,0.50)'], [0.5, 'rgba(60,180,255,0.18)'], [1, 'rgba(40,120,255,0)']]);
  BW.GLOW_RUBY = bakeRadial(64, [[0, 'rgba(255,60,120,0.55)'], [0.5, 'rgba(255,40,90,0.20)'], [1, 'rgba(255,20,60,0)']]);
  var LIGHT_PUNCH = bakeRadial(64, [[0, 'rgba(0,0,0,0.95)'], [0.5, 'rgba(0,0,0,0.48)'], [1, 'rgba(0,0,0,0)']]);

  // Precomputed destination-out alpha strings for quantized light levels 0..16
  var PUNCH_ALPHA = [];
  for (var qi = 0; qi <= 16; qi++) PUNCH_ALPHA[qi] = 'rgba(0,0,0,' + (qi / 16).toFixed(3) + ')';

  function Renderer(world, openDoors) {
    this.world = world;
    this.openDoors = openDoors || {};
    this.CW = Math.ceil(world.W / CS);
    this.CH = Math.ceil(world.H / CS);
    this.chunks = {};
    this.lru = [];
    this.maxCache = 44;
    this.lightCv = document.createElement('canvas');
    this.lightCtx = this.lightCv.getContext('2d');
  }

  Renderer.prototype.setOpenDoors = function (od) { this.openDoors = od || {}; };

  Renderer.prototype.markTile = function (tx, ty) {
    var cx = (tx / CS) | 0, cy = (ty / CS) | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      if (dx !== 0 && dy !== 0) continue;
      if (dx === -1 && (tx % CS) !== 0) continue;
      if (dx === 1 && (tx % CS) !== CS - 1) continue;
      if (dy === -1 && (ty % CS) !== 0) continue;
      if (dy === 1 && (ty % CS) !== CS - 1) continue;
      var k = (cy + dy) * this.CW + (cx + dx);
      if (this.chunks[k]) this.chunks[k].dirty = true;
    }
  };

  Renderer.prototype.markAll = function () {
    for (var k in this.chunks) if (this.chunks[k]) this.chunks[k].dirty = true;
  };

  Renderer.prototype.buildChunk = function (cx, cy) {
    var k = cy * this.CW + cx, ent = this.chunks[k];
    if (!ent) {
      var cv;
      if (this.lru.length >= this.maxCache) {
        var oldKey = this.lru.shift();
        var old = this.chunks[oldKey];
        delete this.chunks[oldKey];
        cv = old ? old.cv : document.createElement('canvas');
      } else {
        cv = document.createElement('canvas');
        cv.width = cv.height = CPX;
      }
      ent = { cv: cv, ctx: cv.getContext('2d'), dirty: true };
      ent.ctx.imageSmoothingEnabled = false;
      this.chunks[k] = ent;
    }
    var idx = this.lru.indexOf(k);
    if (idx >= 0) this.lru.splice(idx, 1);
    this.lru.push(k);

    var g = ent.ctx, wd = this.world, w = wd.W, h = wd.H;
    var tiles = wd.tiles, walls = wd.walls, od = this.openDoors;
    g.clearRect(0, 0, CPX, CPX);

    var x0 = cx * CS, y0 = cy * CS;
    var x1 = Math.min(w, x0 + CS), y1 = Math.min(h, y0 + CS);
    for (var ty = y0; ty < y1; ty++) {
      var py = (ty - y0) * TS, row = ty * w;
      for (var tx = x0; tx < x1; tx++) {
        var px = (tx - x0) * TS, ti = row + tx;
        var id = tiles[ti], d = BLOCKS[id];
        var wid = walls[ti];
        if (wid && (!d || !d.opaque) && WALL_TEX[wid]) {
          g.drawImage(WALL_TEX[wid], px, py);
          if (ty > 0 && BLOCKS[tiles[ti - w]].solid) {
            g.fillStyle = 'rgba(0,0,0,0.28)';
            g.fillRect(px, py, TS, 3);
          }
        }
        if (!id) continue;
        if ((id === B.DOOR_B || id === B.DOOR_T)) {
          var dk = tx + ',' + (id === B.DOOR_T ? ty + 1 : ty);
          if (od[dk]) {
            g.fillStyle = '#9a6b3b';
            g.fillRect(px, py, 4, TS);
            g.fillStyle = '#6e4720';
            g.fillRect(px + 3, py, 1, TS);
            continue;
          }
        }
        var sp = TEX[id];
        if (sp) g.drawImage(sp, px, py);
        if (d && d.solid && !d.noEdge) {
          if (ty > 0 && !BLOCKS[tiles[ti - w]].solid) {
            g.fillStyle = 'rgba(255,255,255,0.13)';
            g.fillRect(px, py, TS, 1);
          }
          if (ty < h - 1 && !BLOCKS[tiles[ti + w]].solid) {
            g.fillStyle = 'rgba(0,0,0,0.22)';
            g.fillRect(px, py + TS - 1, TS, 1);
          }
        }
      }
    }
    ent.dirty = false;
    return ent;
  };

  Renderer.prototype.warm = function (cx, cy, vw, vh) {
    var c0 = Math.max(0, Math.floor(cx / CS)), c1 = Math.min(this.CW - 1, Math.floor((cx + vw) / CS));
    var r0 = Math.max(0, Math.floor(cy / CS)), r1 = Math.min(this.CH - 1, Math.floor((cy + vh) / CS));
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) this.buildChunk(c, r);
  };

  Renderer.prototype.drawChunks = function (ctx, cx, cy, vw, vh, S, budget) {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var c0 = Math.max(0, Math.floor(cx / CS)), c1 = Math.min(this.CW - 1, Math.floor((cx + vw) / CS));
    var r0 = Math.max(0, Math.floor(cy / CS)), r1 = Math.min(this.CH - 1, Math.floor((cy + vh) / CS));
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var k = r * this.CW + c, ent = this.chunks[k];
        if (!ent) {
          ent = this.buildChunk(c, r);
          if (budget) budget.n--;
        } else if (ent.dirty && (!budget || budget.n > 0)) {
          this.buildChunk(c, r);
          if (budget) budget.n--;
        }
        var dx = (c * CS - cx) * TS, dy = (r * CS - cy) * TS;
        ctx.drawImage(ent.cv, dx, dy, CPX, CPX);
      }
    }
  };

  // Pure 2D canvas composited lightmap (span-batched destination-out punches)
  Renderer.prototype.drawLight = function (ctx, cx, cy, vw, vh, env, S) {
    var LP = 3; // 3px per tile on offscreen lightmap, hardware bilinear-upscaled
    var tx0 = Math.floor(cx) - 1, ty0 = Math.floor(cy) - 1;
    var cols = Math.ceil(vw) + 3, rows = Math.ceil(vh) + 3;
    var lw = cols * LP, lh = rows * LP;
    if (this.lightCv.width !== lw || this.lightCv.height !== lh) {
      this.lightCv.width = lw;
      this.lightCv.height = lh;
    }
    var g = this.lightCtx, wd = this.world, w = wd.W, h = wd.H;
    var sky = wd.sky, blk = wd.blk, sun = env.sun, amb = env.ambient || 0.12;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, lw, lh);
    g.fillStyle = 'rgba(7,9,26,0.92)';
    g.fillRect(0, 0, lw, lh);

    g.globalCompositeOperation = 'destination-out';

    // Fast path: clear pure sky rows above highest terrain column in view in 1 rect!
    var minSurf = h;
    var cStart = Math.max(0, tx0), cEnd = Math.min(w - 1, tx0 + cols);
    for (var sc = cStart; sc <= cEnd; sc++) if (wd.surf[sc] < minSurf) minSurf = wd.surf[sc];
    var skyRows = Math.max(0, Math.min(rows, minSurf - ty0 - 1));
    if (skyRows > 0) {
      var skyQ = Math.min(16, Math.max(0, Math.round(Math.max(sun, amb) * 16)));
      if (skyQ >= 16) g.clearRect(0, 0, lw, skyRows * LP);
      else if (skyQ > 0) { g.fillStyle = PUNCH_ALPHA[skyQ]; g.fillRect(0, 0, lw, skyRows * LP); }
    }

    // Horizontal span batching for remaining rows
    for (var r = skyRows; r < rows; r++) {
      var ty = ty0 + r;
      var py = r * LP;
      if (ty < 0) {
        var qTop = Math.min(16, Math.round(Math.max(sun, amb) * 16));
        if (qTop > 0) { g.fillStyle = PUNCH_ALPHA[qTop]; g.fillRect(0, py, lw, LP); }
        continue;
      }
      if (ty >= h) continue;
      var rowOff = ty * w, spanStart = 0, curQ = -1;
      for (var c = 0; c < cols; c++) {
        var tx = tx0 + c, lv;
        if (tx < 0 || tx >= w) lv = amb;
        else {
          var sLv = sky[rowOff + tx] * sun, bLv = blk[rowOff + tx];
          lv = Math.max(amb, (sLv > bLv ? sLv : bLv) / 15);
        }
        var q = lv >= 0.99 ? 16 : (lv * 16 + 0.5) | 0;
        if (q !== curQ) {
          if (curQ > 0) {
            g.fillStyle = PUNCH_ALPHA[curQ];
            g.fillRect(spanStart * LP, py, (c - spanStart) * LP, LP);
          }
          curQ = q;
          spanStart = c;
        }
      }
      if (curQ > 0) {
        g.fillStyle = PUNCH_ALPHA[curQ];
        g.fillRect(spanStart * LP, py, (cols - spanStart) * LP, LP);
      }
    }

    // Smooth radial punch around player & active TNT fuses
    if (env.pglow > 0) {
      var pr = (env.prad || 5.2) * LP;
      var ppx = (env.px - tx0) * LP, ppy = (env.py - ty0) * LP;
      g.globalAlpha = Math.min(1, env.pglow);
      g.drawImage(LIGHT_PUNCH, ppx - pr, ppy - pr, pr * 2, pr * 2);
      g.globalAlpha = 1;
    }
    if (env.fuses && env.fuses.length) {
      for (var fi = 0; fi < env.fuses.length; fi++) {
        var f = env.fuses[fi], fr = 6.5 * LP;
        g.drawImage(LIGHT_PUNCH, (f.x + 0.5 - tx0) * LP - fr, (f.y + 0.5 - ty0) * LP - fr, fr * 2, fr * 2);
      }
    }

    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightCv, (tx0 - cx) * TS, (ty0 - cy) * TS, cols * TS, rows * TS);
    ctx.restore();
  };

  var fr = BW.fr;
  Renderer.prototype.drawSky = function (ctx, cx, cy, vw, vh, tod, time) {
    var W2 = vw * TS, H2 = vh * TS, env = BW.envAt(tod);
    var grd = ctx.createLinearGradient(0, 0, 0, H2);
    grd.addColorStop(0, env.skyTop); grd.addColorStop(1, env.skyBot);
    fr(ctx, grd, 0, 0, W2, H2);

    if (env.night > 0.2) {
      ctx.globalAlpha = (env.night - 0.2) * 1.1;
      ctx.fillStyle = '#fffbe8';
      for (var si = 0; si < 38; si++) {
        var sz = (si % 3 === 0) ? 3 : 2;
        ctx.fillRect((si * 173 + 29) % 1260, (si * 97 + 13) % 340, sz, sz);
      }
      ctx.globalAlpha = 1;
    }

    var ang = tod * Math.PI * 2, sunX = W2 * 0.5 - Math.cos(ang) * W2 * 0.38, sunY = H2 * 0.58 - Math.sin(ang) * H2 * 0.46;
    if (sunY < H2 + 40) {
      fr(ctx, 'rgba(255,230,110,0.25)', sunX - 30, sunY - 30, 60, 60);
      fr(ctx, '#ffe45e', sunX - 18, sunY - 18, 36, 36);
      fr(ctx, '#fff9c4', sunX - 12, sunY - 12, 24, 24);
    }
    var moonX = W2 * 0.5 + Math.cos(ang) * W2 * 0.38, moonY = H2 * 0.58 + Math.sin(ang) * H2 * 0.46;
    if (moonY < H2 + 40) {
      fr(ctx, 'rgba(190,220,255,0.22)', moonX - 24, moonY - 24, 48, 48);
      fr(ctx, '#eef6ff', moonX - 14, moonY - 14, 28, 28);
      fr(ctx, '#c5d8f0', moonX - 6, moonY - 8, 6, 6, moonX + 3, moonY + 2, 5, 5);
    }

    var baseH = (BW.SEA - cy) * TS + 40;
    ctx.fillStyle = env.night > 0.5 ? 'rgba(24,32,68,0.65)' : 'rgba(92,146,214,0.42)';
    for (var mx = -1; mx < 16; mx++) {
      var mh = 70 + ((mx * 37) & 63);
      ctx.fillRect(mx * 110 - ((cx * 2.2) % 110), baseH - mh, 112, mh + 260);
    }

    ctx.fillStyle = env.night > 0.5 ? 'rgba(180,200,240,0.22)' : 'rgba(255,255,255,0.78)';
    for (var ci = 0; ci < 7; ci++) {
      var clx = (ci * 230 + time * 7 - cx * 4) % (W2 + 180);
      if (clx < -160) clx += W2 + 180;
      var cly = 42 + (ci % 3) * 38;
      fr(ctx, null, clx, cly, 88, 18, clx + 16, cly - 12, 52, 12);
    }
  };

  BW.drawPlayer = function (ctx, o) {
    var sk = o.skin || BW.SKINS[0], w = Math.sin(o.walk || 0) * (o.walkAmt || 0);
    if (o.jet) {
      fr(ctx, '#3a86ff', -7, -20, 3, 9); fr(ctx, '#00f5d4', -7, -17, 2, 4);
      if (o.jetting) {
        fr(ctx, '#ff6d00', -7, -10, 4, 7 + Math.sin((o.walk || 0) * 6) * 2);
        fr(ctx, '#ffe66d', -6, -10, 2, 4);
      }
    }
    ctx.save(); ctx.translate(0, -10); ctx.rotate(-w * 0.65);
    fr(ctx, BW.shade(sk.pants, 0.78), -3, 0, 5, 10);
    if (o.jet) fr(ctx, '#00f5d4', -3, 7, 6, 3);
    ctx.restore();

    ctx.save(); ctx.translate(0, -20); ctx.rotate(w * 0.55);
    fr(ctx, BW.shade(sk.shirt, 0.8), -2, 0, 4, 9);
    fr(ctx, BW.shade(sk.skin, 0.88), -2, 7, 4, 3);
    ctx.restore();

    fr(ctx, sk.shirt, -4, -21, 8, 11);
    fr(ctx, 'rgba(255,255,255,0.18)', -4, -21, 8, 2);

    ctx.save(); ctx.translate(0, -10); ctx.rotate(w * 0.65);
    fr(ctx, sk.pants, -2, 0, 5, 10);
    if (o.jet) { fr(ctx, '#3a86ff', -2, 6, 6, 4); fr(ctx, '#00f5d4', -2, 8, 6, 2); }
    ctx.restore();

    ctx.save(); ctx.translate(0, -21); ctx.rotate(o.look || 0);
    fr(ctx, sk.skin, -5, -10, 10, 10);
    fr(ctx, sk.hair, -5, -11, 10, 3, -5, -9, 3, 5);
    if (sk.hat === 'crown') {
      fr(ctx, '#ffd60a', -5, -13, 10, 3, -5, -15, 2, 2, -1, -15, 2, 2, 3, -15, 2, 2);
      fr(ctx, '#ff2a6d', -1, -12, 2, 2);
    } else if (sk.hat) {
      fr(ctx, sk.hat, -6, -12, 12, 3, -4, -14, 8, 2);
    }
    var lx = o.lookX || 0, ly = o.lookY || 0;
    if (o.blink) fr(ctx, '#2b1e16', 0, -5, 4, 1);
    else { fr(ctx, '#ffffff', 0, -6, 4, 3); fr(ctx, '#1b1640', 1 + Math.max(0, lx), -5 + Math.max(-1, Math.min(1, ly)), 2, 2); }
    ctx.restore();

    ctx.save(); ctx.translate(1, -19); ctx.rotate((o.swing || 0) - w * 0.55);
    fr(ctx, sk.shirt, -2, -1, 4, 8); fr(ctx, sk.skin, -2, 6, 4, 3);
    if (o.held && TEX[o.held]) {
      ctx.save(); ctx.translate(1, 8);
      if (o.held >= 110) { ctx.rotate(0.65); ctx.drawImage(TEX[o.held], -3, -13, 15, 15); }
      else ctx.drawImage(TEX[o.held], -2, -5, 10, 10);
      ctx.restore();
    }
    ctx.restore();
  };

  BW.drawAnimal = function (ctx, a) {
    var leg = Math.sin(a.walk || 0) * 3;
    if (a.type === 'sheep') {
      fr(ctx, '#5a4638', -7, -5, 3, 5 + leg * 0.3, 4, -5, 3, 5 - leg * 0.3);
      fr(ctx, a.sheared ? '#e6ccb2' : '#f7f7fb', -9, -15, 17, 11);
      if (!a.sheared) fr(ctx, '#dfe4f2', -9, -7, 17, 3, -8, -16, 14, 2);
      fr(ctx, '#6d5444', 6, -15, 6, 7); fr(ctx, '#ffffff', 9, -13, 2, 2); fr(ctx, '#1b1640', 10, -13, 1, 2);
    } else if (a.type === 'pig') {
      fr(ctx, '#d97b93', -6, -4, 3, 4 + leg * 0.3, 3, -4, 3, 4 - leg * 0.3);
      fr(ctx, '#ff9ebb', -8, -13, 15, 9, 5, -14, 7, 8);
      fr(ctx, '#ff7aa2', 10, -11, 3, 4); fr(ctx, '#1b1640', 9, -12, 2, 2);
    } else {
      fr(ctx, '#f59e0b', -2, -3, 2, 3 + leg * 0.25, 1, -3, 2, 3 - leg * 0.25);
      fr(ctx, '#ffffff', -5, -10, 9, 7, 1, -14, 5, 6);
      fr(ctx, '#ef4444', 3, -16, 3, 2); fr(ctx, '#fbbf24', 6, -12, 3, 2); fr(ctx, '#1b1640', 4, -13, 1, 2);
    }
  };

  BW.drawMob = function (ctx, m, t) {
    var hurt = m.hurtT > 0;
    if (m.type === 'mole') {
      fr(ctx, hurt ? '#ffffff' : '#3a4466', -9, -14, 18, 12);
      fr(ctx, '#1b1640', -10, -3, 20, 3); fr(ctx, '#ffd60a', -8, -15, 14, 3);
      fr(ctx, '#ff2a6d', 2, -11, 6, 3); fr(ctx, '#ffffff', 5, -11, 2, 1);
      fr(ctx, ((t * 18) | 0) % 2 ? '#dce4ff' : '#94a3b8', 9, -10, 4, 6, 13, -9, 3, 4, 16, -8, 2, 2);
      return;
    }
    var isBoss = m.type === 'boss', sz = isBoss ? 15 : 9;
    var sq = 1 + Math.sin(t * 7 + (m.bob || 0)) * 0.08 + (m.sq || 0);
    ctx.save(); ctx.scale(1 / sq, sq);
    fr(ctx, hurt ? '#ffffff' : (isBoss ? 'rgba(199,125,255,0.88)' : 'rgba(0,245,212,0.85)'), -sz, -sz * 1.6, sz * 2, sz * 1.6);
    fr(ctx, isBoss ? '#ff4d94' : '#3bf6ee', -sz + 2, -sz * 1.6 + 2, sz * 2 - 4, 3);
    fr(ctx, isBoss ? '#ffd60a' : '#7209b7', -3, -sz - 1, 6, 6); fr(ctx, '#ffffff', -2, -sz, 2, 2);
    fr(ctx, '#1b1640', 1, -sz - 2, 3, 4, sz - 4, -sz - 2, 3, 4);
    fr(ctx, '#ffffff', 2, -sz - 2, 1, 2, sz - 3, -sz - 2, 1, 2);
    if (isBoss) {
      fr(ctx, '#ffd60a', -8, -sz * 1.6 - 5, 16, 5, -8, -sz * 1.6 - 8, 3, 3, -1, -sz * 1.6 - 9, 3, 4, 5, -sz * 1.6 - 8, 3, 3);
      fr(ctx, '#ff2a6d', -1, -sz * 1.6 - 4, 3, 2);
    }
    ctx.restore();
    if (isBoss && m.hp < m.maxHp) {
      fr(ctx, 'rgba(16,20,48,0.85)', -18, -34, 36, 5);
      fr(ctx, '#ff2a6d', -17, -33, Math.max(0, 34 * (m.hp / m.maxHp)), 3);
    }
  };

  BW.Renderer = Renderer;
})();
