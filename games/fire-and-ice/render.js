/*
 * Fire & Ice — renderer. Everything is drawn in code on a 2D canvas.
 * Static art (temple bricks, stone blocks, vines, signs) is pre-rendered
 * once per level into two offscreen layers; only moving things are drawn
 * every frame.
 */
(function () {
  'use strict';
  var FI = window.FI;
  var T = FI.T, TL = FI.TILE;
  var R = FI.R = {};
  var VW = 1280, VH = 720;
  R.VW = VW; R.VH = VH;

  var FONT = "'Fredoka', 'Segoe UI Rounded', 'Segoe UI', 'Trebuchet MS', sans-serif";
  R.FONT = FONT;

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  R.rng = rng;
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  var glows = {};
  function glow(color) {
    if (glows[color]) return glows[color];
    var c = makeCanvas(64, 64), g = c.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glows[color] = c;
    return c;
  }
  R.glow = glow;
  function drawGlow(g, color, x, y, rx, ry) {
    g.drawImage(glow(color), x - rx, y - (ry || rx), rx * 2, (ry || rx) * 2);
  }
  R.drawGlow = drawGlow;
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  R.rr = rr;

  var LIQ = {};
  LIQ[TL.LAVA] = { top: '#ffd34d', mid: '#ff6a00', bot: '#b3170c', line: '#fff1a8', glow: 'rgba(255,120,20,0.55)', bub: '#ffe27a' };
  LIQ[TL.WATER] = { top: '#9ff0ff', mid: '#2aa8ff', bot: '#0b4fb8', line: '#e8fdff', glow: 'rgba(60,170,255,0.45)', bub: '#dff8ff' };
  LIQ[TL.GOO] = { top: '#d8ff5c', mid: '#57d62f', bot: '#1f6e17', line: '#f3ffc2', glow: 'rgba(120,255,60,0.45)', bub: '#eaff9a' };
  R.LIQ = LIQ;

  function isSolid(w, x, y) { var t = FI.tileAt(w, x, y); return t === TL.S; }
  function isAir(w, x, y) { var t = FI.tileAt(w, x, y); return t === TL.E; }

  /* ------------------------------------------------------ level layers */
  R.prepare = function (w, pxScale) {
    var cs = Math.min(VW / (w.W * T), VH / (w.H * T));
    w.cam = { s: cs, ox: Math.round((VW - w.W * T * cs) / 2), oy: Math.round((VH - w.H * T * cs) / 2) };
    if (!w.deco) buildDeco(w);
    var k = cs * pxScale;
    var bw = w.W * T * k, bh = w.H * T * k;
    var bg = makeCanvas(bw, bh), fg = makeCanvas(bw, bh);
    var gb = bg.getContext('2d'), gf = fg.getContext('2d');
    gb.scale(bg.width / (w.W * T), bg.height / (w.H * T));
    gf.scale(fg.width / (w.W * T), fg.height / (w.H * T));
    drawBackground(gb, w);
    drawTiles(gf, w);
    w.layers = { bg: bg, fg: fg };
  };

  function buildDeco(w) {
    var r = rng(1234 + w.index * 977);
    var torches = [], vines = [], glyphs = [];
    var x, y;
    for (y = 1; y < w.H - 2; y++) {
      for (x = 1; x < w.W - 1; x++) {
        if (isAir(w, x, y) && isAir(w, x, y + 1) && isAir(w, x, y - 1) && isSolid(w, x, y + 2) && isAir(w, x - 1, y) && isAir(w, x + 1, y)) {
          var near = torches.some(function (t) { return Math.abs(t.tx - x) < 6 && Math.abs(t.ty - y) < 4; });
          if (!near && r() < 0.22 && !nearThing(w, x, y)) torches.push({ tx: x, ty: y, x: x * T + T / 2, y: y * T + 10, ph: r() * 10 });
        }
        if (isSolid(w, x, y) && isAir(w, x, y + 1) && r() < 0.3) {
          var len = 1 + Math.floor(r() * 2.6);
          for (var k = 1; k <= len; k++) if (!isAir(w, x, y + k)) { len = k - 1; break; }
          if (len > 0) vines.push({ x: x * T + 6 + r() * 20, y: (y + 1) * T, len: len * T * (0.6 + r() * 0.35), seed: r() * 100 });
        }
        if (isAir(w, x, y) && r() < 0.025) glyphs.push({ x: x * T + 16, y: y * T + 16, kind: Math.floor(r() * 4), s: 0.7 + r() * 0.6 });
      }
    }
    if (torches.length > 10) torches.length = 10;
    // liquid runs
    var runs = [];
    for (y = 0; y < w.H; y++) {
      for (x = 0; x < w.W; x++) {
        var t = FI.tileAt(w, x, y);
        if (t === TL.LAVA || t === TL.WATER || t === TL.GOO) {
          var x0 = x;
          while (x + 1 < w.W && FI.tileAt(w, x + 1, y) === t) x++;
          runs.push({ type: t, x: x0 * T, y: y * T, w: (x - x0 + 1) * T, seed: r() * 100 });
        }
      }
    }
    w.deco = { torches: torches, vines: vines, glyphs: glyphs, runs: runs };
  }
  function nearThing(w, x, y) {
    var px = x * T, py = y * T;
    var things = [w.exits.fire, w.exits.ice].concat(w.portals);
    for (var i = 0; i < things.length; i++) {
      var o = things[i];
      if (Math.abs(o.x - px) < 64 && Math.abs(o.y - py) < 80) return true;
    }
    for (i = 0; i < w.fans.length; i++) { var f = w.fans[i]; if (px > f.x - 40 && px < f.x + f.w + 40 && py > f.top - 20 && py < f.y) return true; }
    var signs = w.def.signs || [];
    for (i = 0; i < signs.length; i++) {
      var sx = signs[i][0] * T, sy = signs[i][1] * T, sw = signs[i][2].length * 8.5;
      if (px > sx - 40 && px < sx + sw + 20 && py > sy - 60 && py < sy + 40) return true;
    }
    return false;
  }

  function drawBackground(g, w) {
    var W = w.W * T, H = w.H * T, r = rng(99 + w.index * 31);
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2a1d17'); gr.addColorStop(1, '#3d2a1c');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // big bricks
    for (var y = 0; y < H; y += 20) {
      var off = ((y / 20) % 2) * 22;
      for (var x = -off; x < W; x += 44) {
        var l = 16 + r() * 7;
        g.fillStyle = 'hsl(' + (22 + r() * 10) + ',' + (28 + r() * 10) + '%,' + l + '%)';
        g.fillRect(x + 1.5, y + 1.5, 41, 17);
        g.fillStyle = 'rgba(255,220,170,0.05)';
        g.fillRect(x + 1.5, y + 1.5, 41, 2);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + 1.5, y + 16.5, 41, 2);
      }
    }
    // pillars
    for (var px = 3 * T; px < W - 2 * T; px += 9 * T) {
      var pg = g.createLinearGradient(px, 0, px + 40, 0);
      pg.addColorStop(0, 'rgba(0,0,0,0.18)'); pg.addColorStop(0.3, 'rgba(255,210,150,0.06)'); pg.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = pg; g.fillRect(px, 0, 40, H);
    }
    // carved glyphs
    w.deco.glyphs.forEach(function (gl) {
      g.save(); g.translate(gl.x, gl.y); g.scale(gl.s, gl.s);
      g.strokeStyle = 'rgba(255,214,150,0.13)'; g.lineWidth = 2.5; g.lineCap = 'round';
      g.beginPath();
      if (gl.kind === 0) { g.arc(0, 0, 9, 0, Math.PI * 2); g.moveTo(4, 0); g.arc(0, 0, 4, 0, Math.PI * 2); }
      else if (gl.kind === 1) { for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); g.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); } }
      else if (gl.kind === 2) { g.moveTo(-9, 8); g.lineTo(0, -10); g.lineTo(9, 8); g.closePath(); }
      else { g.moveTo(-10, 0); g.quadraticCurveTo(0, -12, 10, 0); g.quadraticCurveTo(0, 12, -10, 0); g.moveTo(3, 0); g.arc(0, 0, 3, 0, Math.PI * 2); }
      g.stroke(); g.restore();
    });
    // vines
    w.deco.vines.forEach(function (v) { drawVine(g, v); });
    // torch brackets
    w.deco.torches.forEach(function (t) {
      g.fillStyle = '#2b1a10';
      rr(g, t.x - 7, t.y + 14, 14, 8, 3); g.fill();
      g.fillStyle = '#5a3a22';
      g.beginPath(); g.moveTo(t.x - 5, t.y + 2); g.lineTo(t.x + 5, t.y + 2); g.lineTo(t.x + 3, t.y + 16); g.lineTo(t.x - 3, t.y + 16); g.closePath(); g.fill();
      g.fillStyle = '#8a5a30'; g.fillRect(t.x - 7, t.y, 14, 4);
    });
    // signs
    (w.def.signs || []).forEach(function (s) {
      g.font = '600 15px ' + FONT;
      var tw = g.measureText(s[2]).width;
      var sx = s[0] * T, sy = s[1] * T;
      g.fillStyle = 'rgba(20,10,5,0.35)';
      rr(g, sx - 8, sy - 16, tw + 16, 24, 8); g.fill();
      g.fillStyle = 'rgba(255,233,190,0.92)';
      g.fillText(s[2], sx, sy + 1);
    });
    // vignette
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  function drawVine(g, v) {
    var r = rng(Math.floor(v.seed * 1000) + 7);
    g.strokeStyle = '#2f6b25'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(v.x, v.y);
    var segs = Math.max(2, Math.round(v.len / 10));
    var pts = [];
    for (var i = 1; i <= segs; i++) {
      var yy = v.y + v.len * i / segs, xx = v.x + Math.sin(i * 1.3 + v.seed) * 4;
      g.lineTo(xx, yy); pts.push([xx, yy]);
    }
    g.stroke();
    pts.forEach(function (p, i) {
      g.fillStyle = i % 2 ? '#4fa83a' : '#3d8f2c';
      g.beginPath();
      var s = i % 2 ? 1 : -1;
      g.ellipse(p[0] + s * 5, p[1] - 3, 5, 2.6, s * 0.6, 0, Math.PI * 2);
      g.fill();
    });
    if (r() < 0.5) { g.fillStyle = '#ff8fb1'; g.beginPath(); g.arc(pts[pts.length - 1][0], pts[pts.length - 1][1] + 2, 2.6, 0, Math.PI * 2); g.fill(); }
  }

  function drawTiles(g, w) {
    var r = rng(555 + w.index * 17);
    for (var y = 0; y < w.H; y++) {
      for (var x = 0; x < w.W; x++) {
        var t = w.tiles[y * w.W + x];
        var px = x * T, py = y * T;
        if (t === TL.S && w.fanTile[y * w.W + x]) { drawFanBase(g, px, py); continue; }
        if (t === TL.S) drawStone(g, w, x, y, px, py, r);
        else if (t === TL.ONE) drawPlank(g, w, x, y, px, py);
        else if (t === TL.LAVA || t === TL.WATER || t === TL.GOO) {
          // basin walls under the liquid
          g.fillStyle = '#5a3d22'; g.fillRect(px, py + 26, T, 6);
        }
      }
    }
    // grass pass (after all stones so blades overlap neighbours nicely)
    for (y = 0; y < w.H; y++) {
      for (x = 0; x < w.W; x++) {
        if (w.tiles[y * w.W + x] === TL.S && !w.fanTile[y * w.W + x] && isAir(w, x, y - 1) && y > 0) drawGrass(g, x * T, y * T, r);
      }
    }
  }

  function drawStone(g, w, x, y, px, py, r) {
    var up = !isSolid(w, x, y - 1), dn = !isSolid(w, x, y + 1), lf = !isSolid(w, x - 1, y), rt = !isSolid(w, x + 1, y);
    var edge = up || dn || lf || rt;
    var border = x === 0 || y === 0 || x === w.W - 1 || y === w.H - 1;
    var depth = edge ? 0 : 1;
    if (!edge) {
      // one more ring of lighter stone next to edges
      if (!isSolid(w, x, y - 2) || !isSolid(w, x - 1, y - 1) || !isSolid(w, x + 1, y - 1)) depth = 0.5;
    }
    var L = depth === 0 ? 50 : depth === 0.5 ? 42 : 33;
    if (border && !edge) L -= 4;
    var vr = depth === 1 ? 1.5 : 4;
    g.fillStyle = 'hsl(' + (30 + r() * 5) + ',' + (42 + r() * 6) + '%,' + (L + r() * vr) + '%)';
    g.fillRect(px, py, T, T);
    // masonry lines (2 bricks per tile, staggered)
    g.fillStyle = 'rgba(60,32,12,0.35)';
    g.fillRect(px, py + 15, T, 2);
    var vx = (y % 2) ? px + 15 : px;
    g.fillRect(vx, py, 2, 15);
    g.fillRect((y % 2) ? px : px + 15, py + 17, 2, 15);
    // speckles
    g.fillStyle = 'rgba(255,240,210,0.12)';
    for (var i = 0; i < 2; i++) g.fillRect(px + 3 + r() * 24, py + 3 + r() * 24, 2, 2);
    // bevels on exposed sides
    if (up) { g.fillStyle = 'rgba(255,236,190,0.45)'; g.fillRect(px, py, T, 3); }
    if (lf) { g.fillStyle = 'rgba(255,230,180,0.25)'; g.fillRect(px, py, 3, T); }
    if (rt) { g.fillStyle = 'rgba(40,20,5,0.3)'; g.fillRect(px + T - 3, py, 3, T); }
    if (dn) { g.fillStyle = 'rgba(40,20,5,0.4)'; g.fillRect(px, py + T - 4, T, 4); }
    // outline against the background
    g.fillStyle = '#2a170a';
    if (up) g.fillRect(px, py - 1, T, 1.5);
    if (dn) g.fillRect(px, py + T - 0.5, T, 1.5);
    if (lf) g.fillRect(px - 1, py, 1.5, T);
    if (rt) g.fillRect(px + T - 0.5, py, 1.5, T);
  }

  function drawGrass(g, px, py, r) {
    g.fillStyle = '#3f8f25'; g.fillRect(px, py - 1, T, 6);
    g.fillStyle = '#6cc23a'; g.fillRect(px, py - 2, T, 4);
    g.fillStyle = '#8fe052';
    for (var i = 0; i < 4; i++) {
      var bx = px + 2 + r() * 28, h = 3 + r() * 4;
      g.beginPath(); g.moveTo(bx - 2, py); g.lineTo(bx, py - h); g.lineTo(bx + 2, py); g.fill();
    }
    if (r() < 0.12) {
      g.fillStyle = r() < 0.5 ? '#ffd23f' : '#ff8fb1';
      var fx = px + 6 + r() * 20;
      g.beginPath(); g.arc(fx, py - 4, 2.4, 0, Math.PI * 2); g.fill();
    }
  }

  function drawPlank(g, w, x, y, px, py) {
    var lf = FI.tileAt(w, x - 1, y) !== TL.ONE, rt = FI.tileAt(w, x + 1, y) !== TL.ONE;
    g.fillStyle = '#6b4020'; g.fillRect(px, py, T, 10);
    g.fillStyle = '#b0733f'; g.fillRect(px, py, T, 8);
    g.fillStyle = '#d9985a'; g.fillRect(px, py, T, 2.5);
    g.fillStyle = 'rgba(80,40,10,0.5)'; g.fillRect(px + T - 1, py + 1, 1.5, 7);
    g.fillStyle = '#4a2a10';
    g.beginPath(); g.arc(px + 5, py + 4.5, 1.3, 0, 6.3); g.arc(px + T - 6, py + 4.5, 1.3, 0, 6.3); g.fill();
    if (lf) { g.fillStyle = '#5a3418'; g.beginPath(); g.moveTo(px, py + 8); g.lineTo(px + 10, py + 8); g.lineTo(px, py + 18); g.closePath(); g.fill(); }
    if (rt) { g.fillStyle = '#5a3418'; g.beginPath(); g.moveTo(px + T, py + 8); g.lineTo(px + T - 10, py + 8); g.lineTo(px + T, py + 18); g.closePath(); g.fill(); }
  }

  function drawFanBase(g, px, py) {
    g.fillStyle = '#3b4250'; g.fillRect(px, py, T, T);
    g.fillStyle = '#5b6474'; g.fillRect(px, py, T, 6);
    g.fillStyle = '#20252e';
    for (var i = 0; i < 3; i++) g.fillRect(px + 4, py + 10 + i * 7, T - 8, 3);
    g.fillStyle = '#8a95a8'; g.fillRect(px, py, T, 2);
  }

  /* --------------------------------------------------------- per frame */
  R.drawWorld = function (g, w, t, anim, fx, opts) {
    var cam = w.cam;
    g.save();
    g.translate(cam.ox + (opts.shakeX || 0), cam.oy + (opts.shakeY || 0));
    g.scale(cam.s, cam.s);
    var WW = w.W * T, HH = w.H * T;
    g.drawImage(w.layers.bg, 0, 0, WW, HH);
    drawTorches(g, w, t);
    drawFans(g, w, t);
    drawDoor(g, w, w.exits.fire, t);
    drawDoor(g, w, w.exits.ice, t);
    w.portals.forEach(function (p) { drawPortal(g, p, t); });
    w.movers.forEach(function (m) { drawMover(g, m, t); });
    g.drawImage(w.layers.fg, 0, 0, WW, HH);
    drawLiquids(g, w, t);
    w.buttons.forEach(function (b) { drawButton(g, b, t); });
    w.levers.forEach(function (l) { drawLever(g, l, t); });
    w.gems.forEach(function (gm) { if (!gm.got) drawGem(g, gm.x, gm.y + Math.sin(t * 3 + gm.t) * 3, gm.kind, t + gm.t, 1); });
    w.boxes.forEach(function (b) { drawBox(g, b, t); });
    if (fx) fx.drawBack(g);
    if (!opts.noKids) [w.ice, w.fire].forEach(function (p) {
      if (!p.alive) return;
      var a = anim[p.kind];
      drawKid(g, p.kind, p.x + p.w / 2, p.y + p.h + (p.onLiquid ? 5 : 0), a, t, opts.hat, p);
      if (p.onLiquid) drawWade(g, p, t);
    });
    if (opts.soloActive && w.state === 'play') {
      var sp = w[opts.soloActive];
      if (sp.alive) drawArrow(g, sp.x + sp.w / 2, sp.y - 26 + Math.sin(t * 6) * 4, sp.kind);
    }
    if (fx) fx.draw(g);
    g.restore();
  };

  function drawTorches(g, w, t) {
    var ts = w.deco.torches;
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < ts.length; i++) {
      var tc = ts[i], fl = 0.85 + Math.sin(t * 9 + tc.ph) * 0.08 + Math.sin(t * 23 + tc.ph * 2) * 0.05;
      drawGlow(g, 'rgba(255,150,50,0.28)', tc.x, tc.y - 4, 95 * fl);
    }
    g.globalCompositeOperation = 'source-over';
    for (i = 0; i < ts.length; i++) {
      var c = ts[i];
      drawFlame(g, c.x, c.y + 2, 1, t * 1.3 + c.ph);
    }
  }
  function drawFlame(g, x, y, s, t) {
    var sw = Math.sin(t * 7) * 2 * s, h = (15 + Math.sin(t * 11) * 2.5) * s;
    g.fillStyle = '#ff4d1a';
    g.beginPath(); g.moveTo(x - 6 * s, y); g.quadraticCurveTo(x - 7 * s, y - h * 0.5, x + sw, y - h); g.quadraticCurveTo(x + 7 * s, y - h * 0.5, x + 6 * s, y); g.closePath(); g.fill();
    g.fillStyle = '#ffae2b';
    g.beginPath(); g.moveTo(x - 4 * s, y); g.quadraticCurveTo(x - 4 * s, y - h * 0.4, x + sw * 0.7, y - h * 0.72); g.quadraticCurveTo(x + 4 * s, y - h * 0.4, x + 4 * s, y); g.closePath(); g.fill();
    g.fillStyle = '#fff3a0';
    g.beginPath(); g.ellipse(x + sw * 0.3, y - 3 * s, 2.3 * s, 4 * s, 0, 0, Math.PI * 2); g.fill();
  }
  R.drawFlame = drawFlame;

  function drawLiquids(g, w, t) {
    var runs = w.deco.runs;
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i], c = LIQ[r.type];
      var pulse = 0.8 + Math.sin(t * 2.2 + r.seed) * 0.2;
      drawGlow(g, c.glow, r.x + r.w / 2, r.y + 6, r.w / 2 + 34, 40 * pulse);
    }
    g.globalCompositeOperation = 'source-over';
    for (i = 0; i < runs.length; i++) {
      var q = runs[i], cc = LIQ[q.type];
      if (!q.grad) {
        q.grad = g.createLinearGradient(0, q.y + 6, 0, q.y + T);
        q.grad.addColorStop(0, cc.top); q.grad.addColorStop(0.35, cc.mid); q.grad.addColorStop(1, cc.bot);
      }
      var sp = q.type === TL.WATER ? 2.6 : q.type === TL.LAVA ? 1.4 : 1.8;
      g.fillStyle = q.grad;
      g.beginPath();
      g.moveTo(q.x, q.y + T);
      for (var x = 0; x <= q.w; x += 4) {
        var yy = q.y + 8 + Math.sin((q.x + x) * 0.14 + t * sp) * 1.8 + Math.sin((q.x + x) * 0.05 - t * sp * 0.7) * 1.2;
        g.lineTo(q.x + x, yy);
      }
      g.lineTo(q.x + q.w, q.y + T);
      g.closePath(); g.fill();
      // surface highlight
      g.strokeStyle = cc.line; g.lineWidth = 2; g.globalAlpha = 0.8;
      g.beginPath();
      for (x = 0; x <= q.w; x += 4) {
        var y2 = q.y + 8 + Math.sin((q.x + x) * 0.14 + t * sp) * 1.8 + Math.sin((q.x + x) * 0.05 - t * sp * 0.7) * 1.2;
        if (x === 0) g.moveTo(q.x + x, y2); else g.lineTo(q.x + x, y2);
      }
      g.stroke(); g.globalAlpha = 1;
      // bubbles
      var nb = Math.max(2, Math.round(q.w / 26));
      g.fillStyle = cc.bub;
      for (var b = 0; b < nb; b++) {
        var ph = (t * (0.5 + (b % 3) * 0.13) + b * 0.37 + q.seed) % 1;
        var bx = q.x + ((b * 53 + q.seed * 7) % q.w);
        var by = q.y + T - 4 - ph * 20;
        var br = 1.5 + ph * 2.5;
        g.globalAlpha = ph > 0.85 ? (1 - ph) * 6 : 0.85;
        g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
        if (ph > 0.85) { g.strokeStyle = cc.bub; g.lineWidth = 1.2; g.beginPath(); g.arc(bx, q.y + 8, 3 + (ph - 0.85) * 40, Math.PI, Math.PI * 2); g.stroke(); }
      }
      g.globalAlpha = 1;
      if (q.type === TL.GOO) {
        // spooky-cute bubbles only; plus shine dots
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (var s2 = 0; s2 < q.w / 32; s2++) { g.beginPath(); g.arc(q.x + 10 + s2 * 32, q.y + 14, 2, 0, Math.PI * 2); g.fill(); }
      }
    }
  }

  function drawWade(g, p, t) {
    var c = LIQ[p.onLiquid];
    var x = p.x + p.w / 2, y = p.y + p.h + 3;
    g.fillStyle = c.top; g.globalAlpha = 0.85;
    g.beginPath(); g.ellipse(x, y, 16 + Math.sin(t * 8) * 1.5, 4, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }

  function drawFans(g, w, t) {
    for (var i = 0; i < w.fans.length; i++) {
      var f = w.fans[i];
      var flick = f.warn ? (Math.sin(t * 40) > 0 ? 0.35 : 1) : 1;
      var hgt = f.y - f.top;
      if (f.power > 0.02) {
        var gr = g.createLinearGradient(0, f.y, 0, f.top);
        gr.addColorStop(0, 'rgba(200,245,255,' + (0.22 * f.power * flick) + ')');
        gr.addColorStop(1, 'rgba(200,245,255,0)');
        g.fillStyle = gr; g.fillRect(f.x + 2, f.top, f.w - 4, hgt);
        g.strokeStyle = 'rgba(255,255,255,' + (0.55 * f.power * flick) + ')'; g.lineWidth = 2; g.lineCap = 'round';
        var n = Math.round(f.w / 9);
        g.beginPath();
        for (var k = 0; k < n; k++) {
          var sx = f.x + 5 + ((k * 23.7) % (f.w - 10));
          var sy = f.y - ((t * 330 + k * 71) % hgt);
          var len = 10 + (k % 3) * 6;
          var wob = Math.sin(t * 6 + k) * 2;
          g.moveTo(sx + wob, sy); g.lineTo(sx + wob, Math.max(f.top, sy - len));
        }
        g.stroke();
      }
      // blades (drawn above the base)
      var cx = f.x + f.w / 2, cy = f.y + 4;
      g.fillStyle = '#c8d3e6';
      var nbl = 4;
      for (var b = 0; b < nbl; b++) {
        var a = f.spin + b * Math.PI * 2 / nbl;
        var bx = Math.cos(a) * (f.w / 2 - 6);
        g.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(a));
        g.beginPath(); g.ellipse(cx + bx / 2, cy, Math.abs(bx / 2) + 2, 3, 0, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      g.fillStyle = f.ch ? FI.CHAN_COLORS[f.ch] : f.cycle ? (f.on ? (f.warn ? '#ff5a3c' : '#8cf04a') : '#555') : '#ffd23f';
      g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
      if (f.cycle) {
        // countdown ring on timed fans
        g.strokeStyle = f.on ? (f.warn ? '#ff5a3c' : '#8cf04a') : 'rgba(255,255,255,0.4)'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(cx, cy - 14, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (f.on ? 1 - f.ph / f.onFor : (f.ph - f.onFor) / (f.cycle - f.onFor))); g.stroke();
      }
    }
  }

  function drawDoor(g, w, ex, t) {
    var fire = ex.kind === 'fire';
    var x = ex.x + T / 2, top = ex.y, bot = ex.y + 2 * T;
    var dw = 40, dh = 58;
    var col = fire ? '#ff5a1f' : '#2f9bff', light = fire ? '#ffb347' : '#8fe3ff', dark = fire ? '#8a1c05' : '#0b3f8a';
    // glow when occupied
    if (ex.open > 0.05) {
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, fire ? 'rgba(255,120,40,0.6)' : 'rgba(80,180,255,0.6)', x, bot - dh / 2, 60 * ex.open + 20);
      g.globalCompositeOperation = 'source-over';
    }
    // stone arch
    g.fillStyle = '#6d5236';
    rr(g, x - dw / 2 - 6, bot - dh - 8, dw + 12, dh + 8, 18); g.fill();
    g.fillStyle = '#a9824f';
    rr(g, x - dw / 2 - 4, bot - dh - 6, dw + 8, dh + 6, 16); g.fill();
    // inside
    g.fillStyle = '#1a0f08';
    rr(g, x - dw / 2, bot - dh, dw, dh, 14); g.fill();
    // light inside when open
    if (ex.open > 0.05) {
      var ig = g.createLinearGradient(0, bot - dh, 0, bot);
      ig.addColorStop(0, light); ig.addColorStop(1, col);
      g.globalAlpha = ex.open; g.fillStyle = ig; rr(g, x - dw / 2, bot - dh, dw, dh, 14); g.fill(); g.globalAlpha = 1;
    }
    // door panels slide up
    var o = ex.open;
    g.save();
    rr(g, x - dw / 2, bot - dh, dw, dh, 14); g.clip();
    var ph = dh * (1 - o);
    var dg = g.createLinearGradient(x - dw / 2, 0, x + dw / 2, 0);
    dg.addColorStop(0, dark); dg.addColorStop(0.5, col); dg.addColorStop(1, dark);
    g.fillStyle = dg; g.fillRect(x - dw / 2, bot - dh, dw, ph);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (var k = 1; k < 4; k++) g.fillRect(x - dw / 2 + k * dw / 4 - 1, bot - dh, 2, ph);
    // symbol on door
    if (ph > 20) {
      g.save(); g.translate(x, bot - dh + ph - 24);
      if (fire) drawFlame(g, 0, 10, 0.8, t); else drawSnow(g, 0, 0, 9, '#e8fbff');
      g.restore();
    }
    g.restore();
    // keystone emblem
    g.fillStyle = col;
    g.beginPath(); g.arc(x, bot - dh - 3, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2410'; g.lineWidth = 2; g.stroke();
    if (fire) { g.fillStyle = '#ffe27a'; g.beginPath(); g.moveTo(x - 3, bot - dh); g.quadraticCurveTo(x, bot - dh - 12, x + 3, bot - dh); g.fill(); }
    else drawSnow(g, x, bot - dh - 3, 4.5, '#ffffff');
  }
  function drawSnow(g, x, y, r, col) {
    g.strokeStyle = col; g.lineWidth = Math.max(1.5, r / 4); g.lineCap = 'round';
    g.beginPath();
    for (var i = 0; i < 3; i++) {
      var a = i * Math.PI / 3 + Math.PI / 2;
      g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.stroke();
  }
  R.drawSnow = drawSnow;

  function drawPortal(g, p, t) {
    var x = p.x + T / 2, y = p.y + p.h / 2 + 2;
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, hexA(p.color, 0.5), x, y, 42, 52);
    g.globalCompositeOperation = 'source-over';
    g.save(); g.translate(x, y);
    g.fillStyle = '#12061f';
    g.beginPath(); g.ellipse(0, 0, 14, 28, 0, 0, Math.PI * 2); g.fill();
    for (var i = 0; i < 3; i++) {
      g.strokeStyle = i === 0 ? p.color : i === 1 ? '#ffffff' : hexA(p.color, 0.7);
      g.lineWidth = i === 0 ? 4 : 2;
      g.beginPath();
      var a0 = t * (3 + i) + i * 2;
      g.ellipse(0, 0, 14 - i * 4, 28 - i * 7, 0, a0, a0 + Math.PI * 1.3);
      g.stroke();
    }
    g.strokeStyle = p.color; g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, 0, 15, 29, 0, 0, Math.PI * 2); g.stroke();
    if (p.only === 'fire') drawFlame(g, 0, 8, 0.75, t);
    else if (p.only === 'ice') drawSnow(g, 0, 0, 7, '#ffffff');
    g.restore();
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  R.hexA = hexA;

  function drawMover(g, m, t) {
    var col = m.ch ? FI.CHAN_COLORS[m.ch] : '#ffcf4a';
    if (m.style === 'gate') {
      var gg = g.createLinearGradient(m.x, 0, m.x + m.w, 0);
      gg.addColorStop(0, '#2b3038'); gg.addColorStop(0.5, '#5a6372'); gg.addColorStop(1, '#2b3038');
      g.fillStyle = gg; g.fillRect(m.x + 3, m.y, m.w - 6, m.h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (var yy = m.y + 12; yy < m.y + m.h; yy += 24) g.fillRect(m.x + 3, yy, m.w - 6, 3);
      g.fillStyle = col;
      for (var y2 = m.y + 4; y2 < m.y + m.h - 6; y2 += 24) { rr(g, m.x + m.w / 2 - 4, y2 + 2, 8, 8, 3); g.fill(); }
      g.fillStyle = hexA(col, 0.5); g.fillRect(m.x + 3, m.y + m.h - 5, m.w - 6, 5);
      return;
    }
    // platforms / lifts / bridges
    var pg = g.createLinearGradient(0, m.y, 0, m.y + m.h);
    pg.addColorStop(0, '#d8b27a'); pg.addColorStop(1, '#8a6436');
    g.fillStyle = '#3a2410'; rr(g, m.x - 1, m.y - 1, m.w + 2, m.h + 2, 6); g.fill();
    g.fillStyle = pg; rr(g, m.x, m.y, m.w, m.h, 5); g.fill();
    g.fillStyle = 'rgba(255,245,215,0.5)'; g.fillRect(m.x + 4, m.y + 2, m.w - 8, 3);
    // colour stripe
    g.fillStyle = col;
    g.fillRect(m.x + 4, m.y + Math.min(12, m.h - 8), m.w - 8, 5);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (var xx = m.x + 16; xx < m.x + m.w - 8; xx += 32) g.fillRect(xx, m.y + 5, 2, Math.min(m.h - 8, 22));
    // rivets
    g.fillStyle = '#5a3a1c';
    g.beginPath(); g.arc(m.x + 6, m.y + m.h - 6, 2, 0, 6.3); g.arc(m.x + m.w - 6, m.y + m.h - 6, 2, 0, 6.3); g.fill();
    if (m.style === 'lift') {
      // arrow lights
      var on = m.moving ? (Math.sin(t * 14) > 0 ? 1 : 0.5) : 0.35;
      g.fillStyle = hexA(col, on);
      var cx = m.x + m.w / 2;
      g.beginPath(); g.moveTo(cx - 7, m.y + 26); g.lineTo(cx, m.y + 19); g.lineTo(cx + 7, m.y + 26); g.closePath(); g.fill();
    }
  }

  function drawButton(g, b, t) {
    var col = FI.CHAN_COLORS[b.ch] || '#fff';
    var x = b.x + T / 2, fy = b.y + T;
    var press = b.amt;
    if (press > 0.05) {
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, hexA(col, 0.55 * press), x, fy - 4, 34, 18);
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = '#3a2a1c'; rr(g, x - 16, fy - 5, 32, 6, 3); g.fill();
    var h = 7 - press * 5;
    g.fillStyle = col; rr(g, x - 11, fy - 4 - h, 22, h + 2, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x - 8, fy - 3 - h, 16, 2);
  }

  function drawLever(g, l, t) {
    var col = FI.CHAN_COLORS[l.ch] || '#fff';
    var x = l.x + T / 2, fy = l.y + T;
    var ang = l.ang * 0.65;
    g.strokeStyle = '#4a3322'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, fy - 6); g.lineTo(x + Math.sin(ang) * 20, fy - 6 - Math.cos(ang) * 20); g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.arc(x + Math.sin(ang) * 21, fy - 6 - Math.cos(ang) * 21, 5.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.arc(x + Math.sin(ang) * 21 - 1.5, fy - 7.5 - Math.cos(ang) * 21, 1.8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6d5236'; rr(g, x - 12, fy - 9, 24, 9, 4); g.fill();
    g.fillStyle = col; g.fillRect(x - 8, fy - 6, 16, 2.5);
  }

  function drawBox(g, b, t) {
    var wob = b.pushT > 0 ? Math.sin(t * 40) * 0.8 : 0;
    g.save(); g.translate(b.x + b.w / 2 + wob, b.y + b.h / 2);
    var s = b.w / 2;
    g.fillStyle = '#3a2410'; rr(g, -s - 1, -s - 1, b.w + 2, b.h + 2, 4); g.fill();
    g.fillStyle = '#c98d4a'; rr(g, -s, -s, b.w, b.h, 3); g.fill();
    g.fillStyle = '#a86f33';
    g.fillRect(-s + 3, -s + 3, b.w - 6, b.h - 6);
    g.strokeStyle = '#e0ab6a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-s + 4, -s + 4); g.lineTo(s - 4, s - 4); g.stroke();
    g.strokeStyle = '#7a4a1e'; g.lineWidth = 2;
    g.strokeRect(-s + 3, -s + 3, b.w - 6, b.h - 6);
    g.fillStyle = '#ffe0a8'; g.fillRect(-s + 2, -s + 1, b.w - 4, 2);
    g.restore();
  }

  function drawGem(g, x, y, kind, t, sc) {
    sc = sc || 1;
    var fire = kind === 'fire';
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, fire ? 'rgba(255,90,40,0.5)' : 'rgba(60,190,255,0.5)', x, y, 22 * sc);
    g.globalCompositeOperation = 'source-over';
    var sx = Math.cos(t * 2.2) * 0.3 + 0.7;
    g.save(); g.translate(x, y); g.scale(sx * sc, sc);
    var c1 = fire ? '#ff3b2f' : '#1fa2ff', c2 = fire ? '#ff9a6b' : '#9ce8ff', c3 = fire ? '#b3120f' : '#0a5fb8';
    g.fillStyle = '#2a0d05';
    g.beginPath(); g.moveTo(0, -12); g.lineTo(11, -3); g.lineTo(0, 13); g.lineTo(-11, -3); g.closePath(); g.fill();
    g.fillStyle = c1;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(9, -3); g.lineTo(0, 11); g.lineTo(-9, -3); g.closePath(); g.fill();
    g.fillStyle = c2;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(9, -3); g.lineTo(0, -1); g.lineTo(-9, -3); g.closePath(); g.fill();
    g.fillStyle = c3;
    g.beginPath(); g.moveTo(0, -1); g.lineTo(9, -3); g.lineTo(0, 11); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.moveTo(-5, -5); g.lineTo(-2, -8); g.lineTo(-1, -5); g.closePath(); g.fill();
    g.restore();
    // twinkle
    var tw = Math.sin(t * 4.3);
    if (tw > 0.7) {
      g.fillStyle = '#fff';
      var k = (tw - 0.7) * 10;
      g.beginPath(); g.moveTo(x + 7, y - 10 - k); g.lineTo(x + 8, y - 10); g.lineTo(x + 7, y - 10 + k); g.lineTo(x + 6, y - 10); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x + 7 - k, y - 10); g.lineTo(x + 7, y - 9); g.lineTo(x + 7 + k, y - 10); g.lineTo(x + 7, y - 11); g.closePath(); g.fill();
    }
  }
  R.drawGem = drawGem;

  function drawArrow(g, x, y, kind) {
    g.fillStyle = kind === 'fire' ? '#ffb347' : '#8fe3ff';
    g.strokeStyle = '#1a0f08'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x - 8, y - 9); g.lineTo(x + 8, y - 9); g.lineTo(x, y); g.closePath();
    g.fill(); g.stroke();
  }

  /* ------------------------------------------------------------ kids */
  // a: animation state {sx, sy, run, blink, face, air, vy, push, happy}
  function drawKid(g, kind, x, y, a, t, hat, p) {
    var fire = kind === 'fire';
    g.save();
    g.translate(x, y);
    g.scale(a.sx, a.sy);
    var face = a.face;
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(0, 0, 13, 3, 0, 0, Math.PI * 2); g.fill();
    // legs
    var la = a.air ? 0 : Math.sin(a.run) * 5, lb = -la;
    var ly = a.air ? -4 : -3;
    g.fillStyle = fire ? '#b83a0a' : '#1b5fb5';
    g.beginPath(); g.ellipse(-5 + la, ly - Math.max(0, Math.cos(a.run)) * (a.air ? 0 : 2), 5, 4, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(5 + lb, ly - Math.max(0, -Math.cos(a.run)) * (a.air ? 0 : 2), 5, 4, 0, 0, Math.PI * 2); g.fill();
    // body
    var lean = a.lean || 0;
    g.save();
    g.rotate(lean * face);
    var bob = a.air ? 0 : Math.abs(Math.sin(a.run)) * -1.5 + Math.sin(t * 3) * 0.6;
    var by = -36 + bob;
    var bg = g.createLinearGradient(0, by, 0, by + 34);
    if (fire) { bg.addColorStop(0, '#ffa033'); bg.addColorStop(1, '#ff5a14'); }
    else { bg.addColorStop(0, '#7fdcff'); bg.addColorStop(1, '#2f8fff'); }
    g.fillStyle = fire ? '#7a2204' : '#0b3a80';
    rr(g, -14.5, by - 1.5, 29, 35, 13); g.fill();
    g.fillStyle = bg;
    rr(g, -13, by, 26, 32, 12); g.fill();
    // belly
    g.fillStyle = fire ? '#ffd59a' : '#e3f9ff';
    g.beginPath(); g.ellipse(0, by + 23, 8, 7, 0, 0, Math.PI * 2); g.fill();
    // arms
    var sw = a.air ? -0.9 : Math.sin(a.run + Math.PI) * 0.6;
    g.fillStyle = fire ? '#ff7a1f' : '#4fb8ff';
    [-1, 1].forEach(function (s) {
      g.save(); g.translate(s * 12, by + 17); g.rotate(s * (0.3 + (s === face ? sw : -sw) * 0.5) + (a.push ? -face * 1.1 : 0));
      g.beginPath(); g.ellipse(0, 5, 3.6, 6.5, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    });
    // face
    var ex = face * 2.5, eyY = by + 11 + Math.max(-2, Math.min(2, a.vy / 300));
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(ex - 5, eyY, 4.4, 5.4, 0, 0, Math.PI * 2); g.ellipse(ex + 5, eyY, 4.4, 5.4, 0, 0, Math.PI * 2); g.fill();
    if (a.blink > 0 || a.happy) {
      g.strokeStyle = '#1a1030'; g.lineWidth = 2; g.lineCap = 'round';
      g.fillStyle = fire ? '#ff8a30' : '#6cd0ff';
      g.beginPath(); g.ellipse(ex - 5, eyY, 4.6, 5.6, 0, 0, Math.PI * 2); g.ellipse(ex + 5, eyY, 4.6, 5.6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath();
      if (a.happy) { g.arc(ex - 5, eyY + 2, 3, Math.PI * 1.1, Math.PI * 1.9); g.moveTo(ex + 8, eyY + 1); g.arc(ex + 5, eyY + 2, 3, Math.PI * 1.1, Math.PI * 1.9); }
      else { g.moveTo(ex - 8, eyY); g.lineTo(ex - 2, eyY); g.moveTo(ex + 2, eyY); g.lineTo(ex + 8, eyY); }
      g.stroke();
    } else {
      g.fillStyle = '#1a1030';
      var pdx = face * 1.4, pdy = Math.max(-1.5, Math.min(1.5, a.vy / 400));
      g.beginPath(); g.arc(ex - 5 + pdx, eyY + pdy, 2.6, 0, Math.PI * 2); g.arc(ex + 5 + pdx, eyY + pdy, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ex - 4 + pdx, eyY - 1.3 + pdy, 1, 0, Math.PI * 2); g.arc(ex + 6 + pdx, eyY - 1.3 + pdy, 1, 0, Math.PI * 2); g.fill();
    }
    // cheeks + mouth
    g.fillStyle = fire ? 'rgba(255,60,80,0.45)' : 'rgba(255,120,190,0.45)';
    g.beginPath(); g.ellipse(ex - 9, eyY + 6, 2.6, 1.8, 0, 0, Math.PI * 2); g.ellipse(ex + 9, eyY + 6, 2.6, 1.8, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1a1030'; g.lineWidth = 1.8; g.lineCap = 'round';
    g.beginPath();
    if (a.air && a.vy < 0) { g.fillStyle = '#6b1020'; g.ellipse(ex, eyY + 7.5, 2.4, 2.8, 0, 0, Math.PI * 2); g.fill(); }
    else { g.arc(ex, eyY + 5, 3.2, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
    // hair
    if (fire) drawFireHair(g, by, t, face, a);
    else drawIceHair(g, by, t, face, a);
    if (hat) drawHat(g, hat, by, face, fire, t);
    g.restore();
    g.restore();
  }
  R.drawKid = drawKid;

  function drawFireHair(g, by, t, face, a) {
    var base = by + 2;
    var flames = [[-8, 13, 0], [0, 21, 1.3], [8, 14, 2.6], [-3, 16, 3.7], [5, 12, 5]];
    var lay = [['#ff3d00', 1], ['#ff9100', 0.72], ['#ffe066', 0.42]];
    for (var L = 0; L < 3; L++) {
      g.fillStyle = lay[L][0];
      for (var i = 0; i < 3; i++) {
        var f = flames[i];
        var h = f[1] * lay[L][1] * (1 + Math.sin(t * 12 + f[2]) * 0.12) + (a.air ? 3 : 0);
        var sw = Math.sin(t * 8 + f[2]) * 2.5 - face * 2 - (a.vxn || 0) * 3;
        var wd = 7 * (L === 0 ? 1 : L === 1 ? 0.75 : 0.5);
        g.beginPath();
        g.moveTo(f[0] - wd, base + 4);
        g.quadraticCurveTo(f[0] - wd, base - h * 0.5, f[0] + sw, base - h);
        g.quadraticCurveTo(f[0] + wd, base - h * 0.5, f[0] + wd, base + 4);
        g.closePath(); g.fill();
      }
    }
  }
  function drawIceHair(g, by, t, face, a) {
    var base = by + 3;
    var sh = [[-9, -16, -0.45, 7], [-2, -22, -0.1, 8], [6, -18, 0.3, 7], [11, -10, 0.7, 5]];
    var bobv = Math.sin(t * 2.5) * 0.8;
    for (var i = 0; i < sh.length; i++) {
      var s = sh[i];
      var tx = s[0] + Math.sin(s[2]) * -s[1] * 0.4, ty = base + s[1] + bobv;
      g.fillStyle = '#0b3a80';
      g.beginPath(); g.moveTo(s[0] - s[3] - 1, base + 5); g.lineTo(tx, ty - 1.5); g.lineTo(s[0] + s[3] + 1, base + 5); g.closePath(); g.fill();
      g.fillStyle = i % 2 ? '#bff4ff' : '#9fe6ff';
      g.beginPath(); g.moveTo(s[0] - s[3], base + 4); g.lineTo(tx, ty); g.lineTo(s[0] + s[3], base + 4); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.moveTo(s[0] - s[3] * 0.3, base + 2); g.lineTo(tx, ty + 2); g.lineTo(s[0], base + 2); g.closePath(); g.fill();
    }
    // sparkle
    var sp = (t * 0.8) % 3;
    if (sp < 0.4) {
      var k = Math.sin(sp / 0.4 * Math.PI) * 4;
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(-2, base - 26 - k); g.lineTo(-1, base - 26); g.lineTo(-2, base - 26 + k); g.lineTo(-3, base - 26); g.fill();
      g.beginPath(); g.moveTo(-2 - k, base - 26); g.lineTo(-2, base - 25); g.lineTo(-2 + k, base - 26); g.lineTo(-2, base - 27); g.fill();
    }
  }

  /* ------------------------------------------------------------- hats */
  R.HATS = [
    { id: 'none', name: 'No Hat', stars: 0 },
    { id: 'party', name: 'Party Hat', stars: 4 },
    { id: 'shades', name: 'Cool Shades', stars: 8 },
    { id: 'bow', name: 'Big Bow', stars: 12 },
    { id: 'top', name: 'Top Hat', stars: 16 },
    { id: 'viking', name: 'Viking Horns', stars: 20 },
    { id: 'wizard', name: 'Wizard Hat', stars: 25 },
    { id: 'crown', name: 'Royal Crown', stars: 30 },
    { id: 'halo', name: 'Golden Halo', stars: 36 }
  ];
  function drawHat(g, hat, by, face, fire, t) {
    var top = by - 4;
    g.save();
    switch (hat) {
      case 'party':
        g.translate(face * 4, top - 6); g.rotate(face * 0.25);
        g.fillStyle = '#ff4fa3'; g.beginPath(); g.moveTo(-9, 6); g.lineTo(0, -22); g.lineTo(9, 6); g.closePath(); g.fill();
        g.fillStyle = '#ffe14f'; g.fillRect(-6, -4, 12, 3); g.fillRect(-3, -13, 6, 3);
        g.fillStyle = '#5ff0ff'; g.beginPath(); g.arc(0, -23, 4, 0, 6.3); g.fill();
        break;
      case 'shades':
        g.translate(face * 2.5, by + 11);
        g.fillStyle = '#111'; rr(g, -11, -3.5, 9.5, 7, 3); g.fill(); rr(g, 1.5, -3.5, 9.5, 7, 3); g.fill();
        g.fillRect(-2, -2.5, 4, 2);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-9, -2, 3, 1.5); g.fillRect(3.5, -2, 3, 1.5);
        break;
      case 'bow':
        g.translate(-face * 6, top + 2);
        g.fillStyle = '#ff3d7f';
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-12, -12, -13, 3); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(12, -12, 13, 3); g.closePath(); g.fill();
        g.fillStyle = '#ff9bc0'; g.beginPath(); g.arc(0, -1, 3.5, 0, 6.3); g.fill();
        break;
      case 'top':
        g.translate(0, top - 4);
        g.fillStyle = '#1d1d2b'; rr(g, -14, 2, 28, 4, 2); g.fill(); rr(g, -9, -18, 18, 21, 3); g.fill();
        g.fillStyle = '#e8364f'; g.fillRect(-9, -3, 18, 4);
        break;
      case 'viking':
        g.translate(0, top + 1);
        g.fillStyle = '#9aa4b8'; g.beginPath(); g.arc(0, 4, 13, Math.PI, 0); g.fill();
        g.fillStyle = '#6e7890'; g.fillRect(-13, 2, 26, 4);
        g.fillStyle = '#fff4d6';
        g.beginPath(); g.moveTo(-11, -2); g.quadraticCurveTo(-22, -6, -20, -20); g.quadraticCurveTo(-16, -8, -7, -6); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(11, -2); g.quadraticCurveTo(22, -6, 20, -20); g.quadraticCurveTo(16, -8, 7, -6); g.closePath(); g.fill();
        break;
      case 'wizard':
        g.translate(face * 2, top - 2);
        g.fillStyle = '#6a3fd6';
        g.beginPath(); g.moveTo(-15, 5); g.quadraticCurveTo(-4, -10, face * 10, -30); g.quadraticCurveTo(6, -8, 15, 5); g.closePath(); g.fill();
        g.fillStyle = '#4b2aa3'; rr(g, -16, 2, 32, 5, 2); g.fill();
        g.fillStyle = '#ffe14f';
        g.beginPath(); g.arc(-2, -8, 2.2, 0, 6.3); g.arc(4, -16, 1.6, 0, 6.3); g.fill();
        break;
      case 'crown':
        g.translate(0, top - 2);
        g.fillStyle = '#ffcc1a';
        g.beginPath(); g.moveTo(-11, 5); g.lineTo(-12, -9); g.lineTo(-6, -2); g.lineTo(0, -13); g.lineTo(6, -2); g.lineTo(12, -9); g.lineTo(11, 5); g.closePath(); g.fill();
        g.fillStyle = '#e8364f'; g.beginPath(); g.arc(0, 0, 2.6, 0, 6.3); g.fill();
        g.fillStyle = '#3cc8ff'; g.beginPath(); g.arc(-7, 1, 1.8, 0, 6.3); g.arc(7, 1, 1.8, 0, 6.3); g.fill();
        break;
      case 'halo':
        g.translate(0, top - 12 + Math.sin(t * 3) * 1.5);
        g.globalCompositeOperation = 'lighter';
        drawGlow(g, 'rgba(255,220,80,0.6)', 0, 0, 22, 10);
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = '#ffd84a'; g.lineWidth = 3.5;
        g.beginPath(); g.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2); g.stroke();
        break;
    }
    g.restore();
  }
  R.drawHat = drawHat;

  /* -------------------------------------------------------- particles */
  R.particles = function () {
    var MAX = 450, pool = [], live = [];
    for (var i = 0; i < MAX; i++) pool.push({});
    function add(o) {
      var p = pool.length ? pool.pop() : live.shift();
      p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.life = p.max = o.life || 0.6;
      p.size = o.size || 4; p.color = o.color || '#fff'; p.g = o.g == null ? 500 : o.g; p.drag = o.drag || 0;
      p.add = !!o.add; p.shrink = o.shrink !== false; p.back = !!o.back; p.shape = o.shape || 0; p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 12;
      live.push(p);
      return p;
    }
    return {
      add: add,
      burst: function (x, y, o) {
        var n = o.count || 10;
        for (var i = 0; i < n; i++) {
          var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread == null ? Math.PI * 2 : o.spread) : Math.random() * Math.PI * 2;
          var sp = (o.speed || 150) * (0.35 + Math.random() * 0.65);
          add({
            x: x + (Math.random() - 0.5) * (o.jx || 0), y: y + (Math.random() - 0.5) * (o.jy || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: (o.life || 0.6) * (0.6 + Math.random() * 0.5), size: (o.size || 4) * (0.6 + Math.random() * 0.7),
            color: o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : o.color, g: o.g, drag: o.drag, add: o.add, shape: o.shape, back: o.back
          });
        }
      },
      update: function (dt) {
        for (var i = live.length - 1; i >= 0; i--) {
          var p = live[i];
          p.life -= dt;
          if (p.life <= 0) { live.splice(i, 1); pool.push(p); continue; }
          p.vy += p.g * dt;
          if (p.drag) { var d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        }
      },
      drawBack: function (g) { draw(g, true); },
      draw: function (g) { draw(g, false); },
      clear: function () { while (live.length) pool.push(live.pop()); },
      count: function () { return live.length; }
    };
    function draw(g, back) {
      for (var i = 0; i < live.length; i++) {
        var p = live[i];
        if (p.back !== back) continue;
        var k = p.life / p.max;
        var s = p.shrink ? p.size * (0.3 + 0.7 * k) : p.size;
        g.globalAlpha = Math.min(1, k * 1.6);
        if (p.add) g.globalCompositeOperation = 'lighter';
        g.fillStyle = p.color;
        if (p.shape === 1) { // confetti
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-s, -s * 0.5, s * 2, s); g.restore();
        } else if (p.shape === 2) { // star sparkle
          g.beginPath(); g.moveTo(p.x, p.y - s * 1.6); g.lineTo(p.x + s * 0.4, p.y); g.lineTo(p.x, p.y + s * 1.6); g.lineTo(p.x - s * 0.4, p.y); g.closePath();
          g.moveTo(p.x - s * 1.6, p.y); g.lineTo(p.x, p.y + s * 0.4); g.lineTo(p.x + s * 1.6, p.y); g.lineTo(p.x, p.y - s * 0.4); g.closePath(); g.fill();
        } else {
          g.beginPath(); g.arc(p.x, p.y, s, 0, Math.PI * 2); g.fill();
        }
        if (p.add) g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = 1;
    }
  };
})();
