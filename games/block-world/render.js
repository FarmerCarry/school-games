/* Block World — rendering: cached chunk canvases, parallax sky, smooth light overlay, sprites. */
(function () {
  'use strict';
  var BW = window.BW;
  var B = BW.B, BLOCKS = BW.BLOCKS, TEX = BW.TEX, W = BW.W, H = BW.H;
  var TS = 32, CS = 16, CPX = CS * 16; // tile px (logical), chunk tiles, chunk texture px
  var CW = Math.ceil(W / CS), CH = Math.ceil(H / CS);
  BW.TS = TS;

  function Renderer(world) {
    this.world = world;
    this.cache = {};        // ci -> canvas
    this.lru = [];
    this.dirty = new Uint8Array(CW * CH).fill(1);
    this.maxCache = 44;
    this.pool = [];
    this.doorOpen = null;   // fn(x,y) -> bool
    var self = this;
    world.onChange = function (x, y) { self.markTile(x, y); };
    this.lm = document.createElement('canvas');
    this.lmCtx = this.lm.getContext('2d');
    this.lmData = null;
  }
  BW.Renderer = Renderer;
  var R = Renderer.prototype;
  R.setWorld = function (world) {
    var self = this;
    this.world = world;
    world.onChange = function (x, y) { self.markTile(x, y); };
    this.dirty.fill(1);
  };
  R.markTile = function (x, y) {
    var cx = Math.floor(x / CS), cy = Math.floor(y / CS);
    this.markChunk(cx, cy);
    var lx = x % CS, ly = y % CS;
    if (lx === 0) this.markChunk(cx - 1, cy);
    if (lx === CS - 1) this.markChunk(cx + 1, cy);
    if (ly === 0) this.markChunk(cx, cy - 1);
    if (ly === CS - 1) this.markChunk(cx, cy + 1);
  };
  R.markChunk = function (cx, cy) { if (cx >= 0 && cy >= 0 && cx < CW && cy < CH) this.dirty[cy * CW + cx] = 1; };

  R.getChunk = function (cx, cy, budget) {
    var ci = cy * CW + cx, c = this.cache[ci];
    if (c && !this.dirty[ci]) return c;
    if (c && budget.n <= 0) return c; // stale but fine for a frame
    if (!c) {
      c = this.pool.pop() || (function () { var k = document.createElement('canvas'); k.width = k.height = CPX; return k; })();
      this.cache[ci] = c;
      this.lru.push(ci);
      if (this.lru.length > this.maxCache) {
        var old = this.lru.shift();
        if (old !== ci && this.cache[old]) { this.pool.push(this.cache[old]); delete this.cache[old]; this.dirty[old] = 1; }
      }
    } else {
      var li = this.lru.indexOf(ci); if (li >= 0) { this.lru.splice(li, 1); this.lru.push(ci); }
    }
    this.renderChunk(c, cx, cy);
    this.dirty[ci] = 0;
    budget.n--;
    return c;
  };

  R.renderChunk = function (c, cx, cy) {
    var g = c.getContext('2d'), wd = this.world, t = wd.tiles, wl = wd.walls;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, CPX, CPX);
    var x0 = cx * CS, y0 = cy * CS;
    for (var ly = 0; ly < CS; ly++) {
      var y = y0 + ly; if (y >= H) break;
      for (var lx = 0; lx < CS; lx++) {
        var x = x0 + lx; if (x >= W) break;
        var i = y * W + x, id = t[i], d = BLOCKS[id], wid = wl[i], px = lx * 16, py = ly * 16;
        if (wid && !(d.opaque && d.solid)) {
          g.drawImage(BW.WALL_TEX[wid], px, py);
          // soft occlusion from neighbouring solid tiles
          g.fillStyle = 'rgba(0,0,0,0.28)';
          if (solidOp(wd, x, y - 1)) g.fillRect(px, py, 16, 3);
          if (solidOp(wd, x - 1, y)) g.fillRect(px, py, 3, 16);
          if (solidOp(wd, x + 1, y)) g.fillRect(px + 13, py, 3, 16);
        }
        if (!id) continue;
        if (id === B.WATER) {
          var above = wd.get(x, y - 1);
          if (above !== B.WATER) {
            g.fillStyle = 'rgba(48,130,230,0.62)'; g.fillRect(px, py + 3, 16, 13);
            g.fillStyle = 'rgba(190,235,255,0.8)'; g.fillRect(px, py + 3, 16, 1);
            g.fillStyle = 'rgba(120,190,255,0.5)'; g.fillRect(px, py + 4, 16, 1);
          } else g.drawImage(TEX[id], px, py);
          continue;
        }
        if ((id === B.DOOR_B || id === B.DOOR_T) && this.doorOpen && this.doorOpen(x, id === B.DOOR_B ? y : y + 1)) {
          g.fillStyle = '#6a4526'; g.fillRect(px + 1, py, 3, 16);
          g.fillStyle = '#b98549'; g.fillRect(px + 2, py, 2, 16);
          continue;
        }
        g.drawImage(TEX[id], px, py);
        if (d.solid && d.opaque && !d.noEdge) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          if (!solidOp(wd, x, y - 1)) { if (id === B.GRASS || id === B.SNOW_GRASS) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(px, py, 16, 1); g.fillStyle = 'rgba(0,0,0,0.35)'; } else g.fillRect(px, py, 16, 1); }
          if (!solidOp(wd, x, y + 1)) g.fillRect(px, py + 15, 16, 1);
          if (!solidOp(wd, x - 1, y)) g.fillRect(px, py, 1, 16);
          if (!solidOp(wd, x + 1, y)) g.fillRect(px + 15, py, 1, 16);
        }
      }
    }
  };
  function solidOp(wd, x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return true;
    var d = BLOCKS[wd.tiles[y * W + x]]; return d.solid && d.opaque;
  }

  // Draw visible chunks directly in device pixels (no seams).
  R.drawChunks = function (ctx, camX, camY, vw, vh, S, budget) {
    var x0 = Math.floor(camX / CS), x1 = Math.floor((camX + vw) / CS), y0 = Math.floor(camY / CS), y1 = Math.floor((camY + vh) / CS);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var cpx = CS * TS * S, ox = camX * TS * S, oy = camY * TS * S;
    for (var cy = Math.max(0, y0); cy <= Math.min(CH - 1, y1); cy++) {
      for (var cx = Math.max(0, x0); cx <= Math.min(CW - 1, x1); cx++) {
        var c = this.getChunk(cx, cy, budget);
        var dx0 = Math.round(cx * cpx - ox), dx1 = Math.round((cx + 1) * cpx - ox);
        var dy0 = Math.round(cy * cpx - oy), dy1 = Math.round((cy + 1) * cpx - oy);
        ctx.drawImage(c, dx0, dy0, dx1 - dx0, dy1 - dy0);
      }
    }
    ctx.restore();
  };
  // Pre-render chunks around a point (after loading) so the first frames are smooth.
  R.warm = function (camX, camY, vw, vh) {
    var budget = { n: 999 };
    var x0 = Math.floor(camX / CS), x1 = Math.floor((camX + vw) / CS), y0 = Math.floor(camY / CS), y1 = Math.floor((camY + vh) / CS);
    for (var cy = Math.max(0, y0); cy <= Math.min(CH - 1, y1); cy++) for (var cx = Math.max(0, x0); cx <= Math.min(CW - 1, x1); cx++) this.getChunk(cx, cy, budget);
  };

  // ----------------------------------------------------------- light map
  // Returns nothing; draws a smooth darkness/tint overlay over what is already on ctx (source-atop).
  R.drawLight = function (ctx, camX, camY, vw, vh, env, S) {
    var wd = this.world, x0 = Math.floor(camX) - 1, y0 = Math.floor(camY) - 1;
    var nw = Math.ceil(vw) + 3, nh = Math.ceil(vh) + 3;
    if (this.lm.width !== nw || this.lm.height !== nh) { this.lm.width = nw; this.lm.height = nh; this.lmData = this.lmCtx.createImageData(nw, nh); }
    var data = this.lmData.data, sky = wd.sky, blk = wd.blk;
    var day = env.day, dc = env.darkCol, tc = env.tintCol, ta = env.tintA, amb = env.ambient;
    var pxC = env.px, pyC = env.py, pr = env.pglow;
    for (var ly = 0; ly < nh; ly++) {
      var y = y0 + ly;
      for (var lx = 0; lx < nw; lx++) {
        var x = x0 + lx, o = (ly * nw + lx) * 4, s, b;
        if (x < 0 || x >= W || y >= H) { s = 0; b = 0; }
        else if (y < 0) { s = 15; b = 0; }
        else { var i = y * W + x; s = sky[i]; b = blk[i]; }
        var sl = (s / 15) * day, bl = b / 15;
        bl = bl * bl * 0.35 + bl * 0.65;
        var dx = x + 0.5 - pxC, dy = y + 0.5 - pyC, pg = pr * (1 - Math.sqrt(dx * dx + dy * dy) / 5.5);
        var light = sl > bl ? sl : bl;
        if (pg > light) light = pg;
        if (amb > light) light = amb;
        var dark = 1 - light;
        var r, g, bb, a;
        if (bl > sl && bl > 0.25) {
          // warm torch light
          var k = Math.min(1, dark * 1.8);
          r = 255 * (1 - k) + 12 * k; g = 150 * (1 - k) + 8 * k; bb = 50 * (1 - k) + 4 * k;
          a = Math.max(dark, 0.13 * bl);
        } else if (dark >= ta * (s / 15)) { r = dc[0]; g = dc[1]; bb = dc[2]; a = dark; }
        else { r = tc[0]; g = tc[1]; bb = tc[2]; a = ta * (s / 15); }
        data[o] = r; data[o + 1] = g; data[o + 2] = bb; data[o + 3] = a * 255;
      }
    }
    this.lmCtx.putImageData(this.lmData, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lm, (x0 - camX) * TS, (y0 - camY) * TS, nw * TS, nh * TS);
    ctx.restore();
  };

  // ---------------------------------------------------------------- sky
  var KEYS = [
    // tod, top, bottom
    [0.00, [74, 150, 245], [190, 232, 255]],
    [0.44, [74, 150, 245], [190, 232, 255]],
    [0.52, [72, 84, 176], [255, 150, 96]],
    [0.57, [36, 38, 100], [214, 96, 110]],
    [0.63, [10, 16, 48], [30, 40, 88]],
    [0.90, [10, 16, 48], [30, 40, 88]],
    [0.95, [90, 110, 200], [255, 180, 150]],
    [1.00, [74, 150, 245], [190, 232, 255]]
  ];
  function lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c, a) { return a == null ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')' : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  BW.rgb = rgb; BW.lerpC = lerpC;
  BW.skyAt = function (tod) {
    for (var i = 0; i < KEYS.length - 1; i++) {
      if (tod >= KEYS[i][0] && tod <= KEYS[i + 1][0]) {
        var t = (tod - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]);
        return { top: lerpC(KEYS[i][1], KEYS[i + 1][1], t), bot: lerpC(KEYS[i][2], KEYS[i + 1][2], t) };
      }
    }
    return { top: KEYS[0][1], bot: KEYS[0][2] };
  };
  // Environment light values for a time of day.
  BW.envAt = function (tod) {
    var day;
    if (tod < 0.47) day = 1;
    else if (tod < 0.62) day = 1 - (tod - 0.47) / 0.15 * 0.78;
    else if (tod < 0.9) day = 0.22;
    else day = 0.22 + (tod - 0.9) / 0.1 * 0.78;
    var sunset = 0;
    if (tod > 0.45 && tod < 0.62) sunset = Math.sin((tod - 0.45) / 0.17 * Math.PI);
    if (tod > 0.9) sunset = Math.sin((tod - 0.9) / 0.1 * Math.PI) * 0.7;
    var night = 1 - (day - 0.22) / 0.78;
    return {
      day: day, night: night, sunset: sunset,
      darkCol: lerpC([6, 4, 20], [8, 14, 48], night),
      tintCol: [255, 110, 60], tintA: 0.2 * sunset
    };
  };

  // Pre-rendered pieces
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var clouds = [];
  (function () {
    var rnd = BW.mulberry(77);
    for (var k = 0; k < 5; k++) {
      var c = mkCanvas(260, 110), g = c.getContext('2d');
      var puffs = 5 + Math.floor(rnd() * 4);
      var pts = [];
      for (var i = 0; i < puffs; i++) pts.push([40 + i * (170 / puffs) + rnd() * 20, 70 - Math.sin(i / (puffs - 1) * Math.PI) * 25 - rnd() * 8, 22 + rnd() * 18 + Math.sin(i / (puffs - 1) * Math.PI) * 10]);
      g.fillStyle = '#c8d8ee';
      pts.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1] + 6, p[2], 0, Math.PI * 2); g.fill(); });
      g.fillStyle = '#ffffff';
      pts.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], p[2], 0, Math.PI * 2); g.fill(); });
      g.fillRect(40, 70, 170, 22);
      g.fillStyle = '#c8d8ee'; g.fillRect(30, 88, 190, 8);
      g.clearRect(0, 96, 260, 20);
      clouds.push(c);
    }
  })();
  var stars = [];
  (function () { var rnd = BW.mulberry(99); for (var i = 0; i < 140; i++) stars.push([rnd() * 1280, rnd() * 520, rnd() * 1.8 + 0.6, rnd() * 6]); })();
  function ridge(seed, n, amp, freq) {
    var pts = [], rnd = BW.mulberry(seed);
    var ph = [rnd() * 10, rnd() * 10, rnd() * 10];
    for (var i = 0; i <= n; i++) {
      var x = i / n;
      pts.push(amp * (0.5 + 0.3 * Math.sin(x * freq * 6.28 + ph[0]) + 0.15 * Math.sin(x * freq * 15 + ph[1]) + 0.05 * Math.sin(x * freq * 40 + ph[2])));
    }
    return pts;
  }
  var farRidge = ridge(5, 200, 190, 3), nearRidge = ridge(9, 200, 120, 5);
  var glowWarm = (function () { var c = mkCanvas(128, 128), g = c.getContext('2d'); var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,190,90,0.9)'); gr.addColorStop(0.4, 'rgba(255,140,40,0.35)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; })();
  var glowCyan = (function () { var c = mkCanvas(128, 128), g = c.getContext('2d'); var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(120,255,255,0.8)'); gr.addColorStop(0.4, 'rgba(60,220,255,0.3)'); gr.addColorStop(1, 'rgba(40,200,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; })();
  BW.glowWarm = glowWarm; BW.glowCyan = glowCyan;

  R.drawSky = function (ctx, camX, camY, vw, vh, tod, time) {
    var sk = BW.skyAt(tod), env = BW.envAt(tod);
    var VW = vw * TS, VH = vh * TS;
    var gr = ctx.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, rgb(sk.top)); gr.addColorStop(1, rgb(sk.bot));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
    // horizon position on screen (world y ~ 60)
    var hy = (58 - camY) * TS * 0.55 + VH * 0.3;
    // stars
    if (env.night > 0.05) {
      ctx.fillStyle = '#fff';
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        var tw = 0.6 + 0.4 * Math.sin(time * 2 + st[3]);
        ctx.globalAlpha = env.night * tw;
        var sx = ((st[0] - camX * 2) % VW + VW) % VW, sy = st[1] - (camY - 40) * 1.5;
        if (sy < hy + 40) ctx.fillRect(sx, sy, st[2], st[2]);
      }
      ctx.globalAlpha = 1;
    }
    // sun & moon on an arc
    var sunA = (tod / 0.58) * Math.PI; // 0..PI during day
    if (tod < 0.6) this.drawSun(ctx, VW * 0.5 - Math.cos(sunA) * VW * 0.42, hy + 40 - Math.sin(sunA) * (hy + 10) * 0.95, env);
    var mt = (tod - 0.56) / 0.44;
    if (mt > 0 && mt < 1) {
      var ma = mt * Math.PI;
      this.drawMoon(ctx, VW * 0.5 - Math.cos(ma) * VW * 0.42, hy + 40 - Math.sin(ma) * (hy + 10) * 0.9);
    }
    // clouds
    var cloudA = 0.95 - env.night * 0.55;
    for (var c = 0; c < 9; c++) {
      var img = clouds[c % clouds.length];
      var span = VW + 400;
      var cx = ((c * 347 + time * (6 + c % 3 * 3) - camX * TS * 0.18) % span + span) % span - 300;
      var cy = 30 + (c * 71) % 150 - (camY - 50) * TS * 0.12;
      var sc = 0.6 + (c % 4) * 0.18;
      ctx.globalAlpha = cloudA;
      ctx.drawImage(img, cx, cy, 260 * sc, 110 * sc);
    }
    ctx.globalAlpha = 1;
    if (env.sunset > 0.02) { ctx.fillStyle = 'rgba(255,140,90,' + (env.sunset * 0.25) + ')'; ctx.fillRect(0, 0, VW, VH); }
    // parallax ridges
    var farCol = lerpC(lerpC(sk.bot, [120, 150, 200], 0.45), [20, 26, 60], env.night * 0.6);
    var nearCol = lerpC(lerpC(sk.bot, [70, 140, 90], 0.65), [14, 26, 40], env.night * 0.7);
    this.drawRidge(ctx, farRidge, camX * TS * 0.08, hy - 10, VW, VH, rgb(farCol), 1400);
    this.drawRidge(ctx, nearRidge, camX * TS * 0.2, hy + 70, VW, VH, rgb(nearCol), 1100);
  };
  R.drawRidge = function (ctx, pts, off, base, VW, VH, col, period) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, VH + 10);
    var n = pts.length - 1;
    for (var sx = -10; sx <= VW + 20; sx += 16) {
      var u = (((sx + off) % period) + period) % period / period * n;
      var i = Math.floor(u), f = u - i;
      var v = pts[i] + (pts[Math.min(n, i + 1)] - pts[i]) * f;
      ctx.lineTo(sx, base - v);
    }
    ctx.lineTo(VW + 20, VH + 10);
    ctx.closePath();
    ctx.fill();
  };
  R.drawSun = function (ctx, x, y, env) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glowWarm, x - 110, y - 110, 220, 220);
    ctx.restore();
    ctx.fillStyle = env.sunset > 0.3 ? '#ffb347' : '#ffe45c';
    ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.fillStyle = env.sunset > 0.3 ? '#ffd27a' : '#fff4a8';
    ctx.fillRect(x - 22, y - 22, 44, 44);
  };
  R.drawMoon = function (ctx, x, y) {
    ctx.save(); ctx.globalAlpha = 0.25; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowCyan, x - 80, y - 80, 160, 160); ctx.restore();
    ctx.fillStyle = '#eef2ff'; ctx.fillRect(x - 24, y - 24, 48, 48);
    ctx.fillStyle = '#c8d0ea'; ctx.fillRect(x - 12, y - 14, 12, 12); ctx.fillRect(x + 6, y + 4, 10, 10); ctx.fillRect(x - 16, y + 8, 7, 7);
  };

  // ------------------------------------------------------------ sprites
  function rr(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
  // Player: feet at (0,0), facing right; logical px. p: {walk, swing, look, skin, held, blink}
  BW.drawPlayer = function (ctx, p) {
    var s = p.skin;
    var legA = Math.sin(p.walk) * 0.6 * p.walkAmt, armA = -Math.sin(p.walk) * 0.5 * p.walkAmt;
    // back leg
    ctx.save(); ctx.translate(-2, -22); ctx.rotate(-legA); rr(ctx, -4, 0, 8, 17, shadeHex(s.pants, 0.8)); rr(ctx, -4, 16, 9, 6, shadeHex(s.shoes, 0.8)); ctx.restore();
    // back arm
    ctx.save(); ctx.translate(-1, -40); ctx.rotate(-armA * 0.8); rr(ctx, -3, 0, 6, 16, shadeHex(s.shirt, 0.75)); rr(ctx, -3, 14, 6, 4, shadeHex(s.skin, 0.85)); ctx.restore();
    // body
    rr(ctx, -9, -42, 18, 21, s.shirt);
    rr(ctx, -9, -42, 18, 3, shadeHex(s.shirt, 1.15));
    rr(ctx, -9, -24, 18, 3, shadeHex(s.pants, 0.9));
    if (s.gold) { rr(ctx, -2, -38, 4, 4, '#fff08a'); }
    if (s.robot) { rr(ctx, -5, -37, 10, 6, '#39424e'); rr(ctx, -4, -36, 3, 2, '#ff5a5f'); rr(ctx, 0, -36, 3, 2, '#3ddc84'); }
    // front leg
    ctx.save(); ctx.translate(2, -22); ctx.rotate(legA); rr(ctx, -4, 0, 8, 17, s.pants); rr(ctx, -4, 16, 9, 6, s.shoes); ctx.restore();
    // head
    var hy = -62;
    ctx.save(); ctx.translate(0, hy + 20); ctx.rotate(p.look * 0.15); ctx.translate(0, -20);
    if (s.robot) {
      rr(ctx, -10, 0, 20, 20, s.skin); rr(ctx, -10, 0, 20, 3, '#ffffff'); rr(ctx, -2, 7, 12, 7, '#1f2a3a'); rr(ctx, 1, 9, 3, 3, p.blink ? '#1f2a3a' : '#4ff0ff'); rr(ctx, 6, 9, 3, 3, p.blink ? '#1f2a3a' : '#4ff0ff');
      rr(ctx, -1, -6, 2, 6, '#6b7888'); rr(ctx, -3, -9, 6, 4, '#ff5a5f');
    } else {
      rr(ctx, -10, 0, 20, 20, s.skin);
      if (s.frog) {
        rr(ctx, -11, -2, 22, 9, s.hair); rr(ctx, -9, -8, 8, 8, s.hair); rr(ctx, 2, -8, 8, 8, s.hair);
        rr(ctx, -7, -6, 4, 4, '#fff'); rr(ctx, 4, -6, 4, 4, '#fff'); rr(ctx, -5, -5, 2, 2, '#1d2340'); rr(ctx, 6, -5, 2, 2, '#1d2340');
      } else {
        rr(ctx, -11, -2, 22, 7, s.hair); rr(ctx, -11, -2, 6, 13, s.hair); rr(ctx, 4, 4, 5, 2, s.hair);
      }
      if (s.gold) { rr(ctx, -9, -8, 18, 6, '#ffd23a'); rr(ctx, -9, -11, 3, 4, '#ffd23a'); rr(ctx, -2, -12, 4, 5, '#ffd23a'); rr(ctx, 6, -11, 3, 4, '#ffd23a'); rr(ctx, -1, -7, 2, 2, '#ff5a5f'); }
      // eye
      if (p.blink) rr(ctx, 3, 10, 6, 2, '#1d2340');
      else { rr(ctx, 3, 7, 6, 6, '#ffffff'); rr(ctx, 5 + (p.lookX || 0), 8 + (p.lookY || 0), 3, 4, '#1d2340'); }
      rr(ctx, 1, 14, 5, 2, 'rgba(255,120,120,0.45)');
      rr(ctx, 7, 16, 3, 1, 'rgba(90,40,30,0.6)');
    }
    ctx.restore();
    // front arm + held item
    ctx.save(); ctx.translate(1, -40); ctx.rotate(armA + p.swing);
    if (p.held && TEX[p.held]) {
      ctx.save(); ctx.translate(2, 16); ctx.rotate(-0.6);
      ctx.drawImage(TEX[p.held], -4, -18, 20, 20);
      ctx.restore();
    }
    rr(ctx, -3, 0, 6, 16, shadeHex(s.shirt, 0.92)); rr(ctx, -3, 14, 6, 5, s.skin);
    ctx.restore();
  };
  var shadeCache = {};
  function shadeHex(h, f) { var k = h + f; return shadeCache[k] || (shadeCache[k] = BW.shade(h, f)); }

  // Animals: feet at (0,0), facing right.
  BW.drawAnimal = function (ctx, a, time) {
    var leg = Math.sin(a.walk) * 3 * a.walkAmt;
    if (a.type === 'pig') {
      rr(ctx, -12, -8, 5, 8 + leg * 0.3, '#e0899c'); rr(ctx, 6, -8, 5, 8 - leg * 0.3, '#e0899c');
      rr(ctx, -9, -8, 5, 8 - leg * 0.3, '#f09aae'); rr(ctx, 9, -8, 5, 8 + leg * 0.3, '#f09aae');
      rr(ctx, -15, -24, 28, 17, '#f7a8ba'); rr(ctx, -15, -24, 28, 3, '#ffc4d2');
      rr(ctx, -18, -22, 3, 2, '#e0899c'); rr(ctx, -19, -24, 2, 3, '#e0899c');
      var hb = a.headDown ? 4 : 0;
      rr(ctx, 9, -30 + hb, 14, 14, '#f7a8ba'); rr(ctx, 10, -33 + hb, 4, 4, '#e0899c');
      rr(ctx, 19, -23 + hb, 7, 6, '#ee7f98'); rr(ctx, 21, -21 + hb, 1, 2, '#8a3a4a'); rr(ctx, 24, -21 + hb, 1, 2, '#8a3a4a');
      rr(ctx, 17, -27 + hb, 3, 3, a.blink ? '#f7a8ba' : '#1d2340');
    } else if (a.type === 'sheep') {
      var wool = a.sheared ? '#f2dccc' : '#fbfbff', woolD = a.sheared ? '#dcc2b0' : '#dde2ee';
      rr(ctx, -12, -9, 5, 9 + leg * 0.3, '#44444c'); rr(ctx, 7, -9, 5, 9 - leg * 0.3, '#44444c');
      rr(ctx, -9, -9, 5, 9 - leg * 0.3, '#55555e'); rr(ctx, 10, -9, 5, 9 + leg * 0.3, '#55555e');
      if (a.sheared) { rr(ctx, -13, -24, 26, 16, wool); rr(ctx, -13, -12, 26, 3, woolD); }
      else {
        rr(ctx, -16, -28, 32, 21, wool); rr(ctx, -14, -31, 10, 5, wool); rr(ctx, -2, -32, 12, 6, wool);
        rr(ctx, -16, -10, 32, 3, woolD); rr(ctx, -18, -24, 3, 12, wool); rr(ctx, -10, -22, 4, 3, woolD); rr(ctx, 2, -18, 4, 3, woolD);
      }
      var sb = a.headDown ? 6 : 0;
      rr(ctx, 11, -30 + sb, 12, 13, '#5a5a62'); rr(ctx, 9, -31 + sb, 5, 5, a.sheared ? wool : '#fbfbff');
      rr(ctx, 17, -26 + sb, 3, 3, a.blink ? '#5a5a62' : '#ffffff'); rr(ctx, 18, -25 + sb, 2, 2, a.blink ? '#5a5a62' : '#1d2340');
      rr(ctx, 8, -27 + sb, 4, 3, '#44444c');
    } else {
      // chicken
      var flap = a.onGround ? 0 : Math.sin(time * 30) * 4;
      rr(ctx, -3, -6, 2, 6 + leg * 0.3, '#ff9f1a'); rr(ctx, 2, -6, 2, 6 - leg * 0.3, '#ff9f1a');
      rr(ctx, -9, -17, 16, 11, '#ffffff'); rr(ctx, -11, -19, 4, 6, '#f0f0f0');
      rr(ctx, -5, -15 - flap, 9, 6, '#e8e8f0');
      var cb = a.headDown ? 5 : 0;
      rr(ctx, 3, -26 + cb, 9, 10, '#ffffff'); rr(ctx, 5, -29 + cb, 5, 3, '#ff4a4a'); rr(ctx, 12, -22 + cb, 4, 3, '#ffb020'); rr(ctx, 8, -19 + cb, 3, 3, '#ff4a4a');
      rr(ctx, 8, -24 + cb, 2, 2, a.blink ? '#fff' : '#1d2340');
    }
  };

  BW.CS = CS; BW.CW = CW; BW.CH = CH;
})();
