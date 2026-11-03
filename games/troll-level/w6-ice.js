/*
 * Sneaky Levels — world 6 (levels 31-40): ice.
 * Registers its mechanic with the engine (TrollEngine.mod / .tile) and, in the
 * browser, with the drawing (TrollArt), then adds its world with TrollLevels.addWorld.
 *
 * '~' is an ice tile. On ice you speed up slowly, glide a long way when you let
 * go, brake firmly with the opposite arrow and run 1.5x as fast; leave the ice
 * that fast and you keep the speed in the air, so a run-up jump flies further.
 * Script API:
 *   L.cube(ch, o)            group ch becomes an ice cube: run into its side to
 *                            kick it (from a standstill, push for 0.1 s); it slides
 *                            until something stops it, drops into the first hole
 *                            it is wholly over and covers the spikes it lands on.
 *                            o.home: when lost (off the screen or onto spikes) it
 *                            comes back after 1 s, once its spot is free; o.dir
 *                            1 or -1: it can only be kicked that way.
 *   L.bus(ch)                group ch is drawn as the penguins' bus.
 *   L.freeze(x0, y0, x1, y1) turns the ground in those tiles to ice, in a wave
 *                            from x0; L.thaw(x0, y0, x1, y1) melts it back.
 *   L.snowball(o)            a L.saw(o) that looks like a giant snowball.
 */
(function (root) {
  'use strict';
  var E = root.TrollEngine, Art = root.TrollArt;
  var T = E.T, COLS = E.COLS, ROWS = E.ROWS, PH = E.PH, DT = E.DT, TAU = Math.PI * 2;
  var ICE = E.tile('~', { ice: 1 });
  // On ice: slow to start, a long glide, a firm opposite-arrow brake, 1.5x top speed.
  var ICE_ACC = 900, ICE_DEC = 700, ICE_TURN = 1800, ICE_RUN = 450;
  var SLIDE = 8 * T, HOME_T = 1;
  // Running into a cube kicks it at once; from a standstill (slower than KICK_V)
  // it takes PUSH_N frames of pushing, so pressing the arrow a moment before
  // jump climbs onto the cube instead of kicking it away.
  var KICK_V = 60, PUSH_N = 6;

  // The level's ice state; made only when its map has ice or its script uses it,
  // so every hook returns at once in all other levels.
  function state(w) {
    return w.ice || (w.ice = { dir: 0, vx0: 0, push: 0, fast: false, skid: 0, cubes: [], waves: [], balls: [], buses: [] });
  }

  function onIce(w, p) {
    if (p.ground) return !!p.ground.ice;
    var x = Math.floor((p.x + PH.w / 2) / T), y = Math.floor((w.gs > 0 ? p.y + PH.h + 1 : p.y - 1) / T);
    var k = x >= 0 && x < COLS && y >= 0 && y < ROWS ? w.grid[y * COLS + x] : 0;
    if (!k && p.gr) k = p.gr.k; // the middle is over a gap: the tile under a foot
    return !!(k && E.TILE[k].ice);
  }

  // How far group g can slide by dx before it meets something solid.
  function free(w, g, dx) {
    for (var k = 0; k < g.tiles.length; k++) {
      var rx = g.tiles[k].x * T + g.ox, ry = g.tiles[k].y * T + g.oy;
      var rs = w.collect(dx > 0 ? rx + T : rx + dx, ry + 1, Math.abs(dx), T - 2, g);
      for (var i = 0; i < rs.length; i++) dx = dx > 0 ? Math.min(dx, rs[i].x - rx - T) : Math.max(dx, rs[i].x + rs[i].w - rx);
    }
    return dx;
  }

  // Would group g, moved to x offset ox, rest on anything?
  function supported(w, g, ox) {
    for (var k = 0; k < g.tiles.length; k++) {
      var tl = g.tiles[k];
      if (w.collect(tl.x * T + ox + 1, tl.y * T + g.oy + T, T - 2, 1, g).length) return true;
    }
    return false;
  }

  function kick(w, s) {
    var p = w.p, d = s.dir, x = d > 0 ? p.x + PH.w : p.x - 1, push = false; // a 1 px strip on the side you push
    for (var i = 0; i < s.cubes.length; i++) {
      var c = s.cubes[i], g = c.g, k;
      // a one-way cube is a wall the other way, so it never ends up out of reach
      if (c.vx || g.m || !g.active || p.ground === g || c.dir === -d) continue;
      for (k = 0; k < g.tiles.length; k++) {
        if (E.overlap(x, p.y, 1, PH.h, g.tiles[k].x * T + g.ox, g.tiles[k].y * T + g.oy, T, T)) break;
      }
      // a cube against a wall stays put (and quiet)
      if (k === g.tiles.length || Math.abs(free(w, g, d)) < 0.5) continue;
      push = true;
      if (Math.abs(s.vx0) < KICK_V && s.push < PUSH_N) continue;
      c.vx = d * SLIDE;
      w.emit('iceKick', { x: d > 0 ? p.x + PH.w : p.x, y: p.y + PH.h / 2, dir: d });
    }
    s.push = push ? s.push + 1 : 0;
  }

  function slide(w, c) {
    var g = c.g, step = c.vx * DT, dx = free(w, g, step), x0 = g.ox;
    // passing a column where the whole cube is over a hole: drop into it
    var a = (step > 0 ? Math.floor((x0 + dx) / T) : Math.ceil((x0 + dx) / T)) * T;
    if ((step > 0 ? a > x0 : a < x0) && !supported(w, g, a)) {
      w.shiftGroup(g, a - x0, 0);
      c.vx = 0; c.fall = true;
      g.drop(0, true);
      return;
    }
    w.shiftGroup(g, dx, 0);
    if (dx !== step) { c.vx = 0; w.emit('iceBump', { g: g }); }
  }

  // A cube came to rest (or fell off the screen): it covers the spikes it sits on.
  function landed(w, c) {
    var g = c.g, sp = w.spikes, hit = false;
    c.fall = false;
    for (var i = 0; g.active && i < sp.length; i++) {
      var s = sp[i];
      if (s.g || s.out <= 0) continue;
      for (var k = 0; k < g.tiles.length; k++) {
        if (Math.abs(g.tiles[k].x * T + g.ox - s.x) < 1 && Math.abs(g.tiles[k].y * T + g.oy - s.y) < 1) {
          s.out = s.target = 0; s.cover = g; hit = true;
        }
      }
    }
    if (c.home && (hit || !g.active)) c.wait = HOME_T;
  }

  function goHome(w, c) {
    var g = c.g, sp = w.spikes;
    for (var i = 0; i < sp.length; i++) if (sp[i].cover === g) { sp[i].cover = null; sp[i].target = 1; }
    g.ox = g.oy = 0; g.m = null; c.vx = 0;
    g.show();
    w.emit('icePuff', { g: g });
  }

  function cubeStep(w, c) {
    if (c.wait > 0) {
      c.wait -= DT;
      // it never comes back onto the player: a tall cube would squash them
      if (c.wait <= 0 && E.overlap(w.p.x, w.p.y, PH.w, PH.h, c.x, c.y, c.w, c.h)) c.wait = DT;
      else if (c.wait <= 0) goHome(w, c);
      return;
    }
    if (c.fall && !c.g.m) landed(w, c);
    if (c.vx) slide(w, c);
  }

  // The freeze wave turns one column every second step.
  function waveStep(w, v) {
    if (v.x > v.x1 || v.t++ % 2) return;
    for (var y = v.y0; y <= v.y1; y++) if (w.grid[y * COLS + v.x] === 1) w.grid[y * COLS + v.x] = ICE.k;
    w.emit('iceFreeze', { x: v.x * T + T / 2, y: v.y0 * T, first: v.x === v.x0 });
    v.x++;
  }

  E.mod({
    init: function (w) {
      var map = w.def.map;
      w.ice = null;
      for (var y = 0; y < ROWS; y++) if (map[y] && map[y].indexOf('~') >= 0) { state(w); return; }
    },
    api: function (L, w) {
      L.cube = function (ch, o) {
        var g = w.gmap[ch], x0 = 99, y0 = 99, x1 = 0, y1 = 0;
        g.own = true; g.ice = true;
        g.tiles.forEach(function (tl) { x0 = Math.min(x0, tl.x); y0 = Math.min(y0, tl.y); x1 = Math.max(x1, tl.x); y1 = Math.max(y1, tl.y); });
        state(w).cubes.push({ g: g, home: !!(o && o.home), dir: o && o.dir || 0, vx: 0, fall: false, wait: 0, x: x0 * T, y: y0 * T, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T });
        return g;
      };
      L.bus = function (ch) {
        var g = w.gmap[ch], x0 = 99, x1 = 0;
        g.own = true;
        g.tiles.forEach(function (tl) { x0 = Math.min(x0, tl.x); x1 = Math.max(x1, tl.x); });
        state(w).buses.push({ g: g, x: x0 * T, y: g.tiles[0].y * T, w: (x1 - x0 + 1) * T });
        return g;
      };
      L.freeze = function (x0, y0, x1, y1) { state(w).waves.push({ x0: x0, y0: y0, x1: x1, y1: y1, x: x0, t: 0 }); };
      L.thaw = function (x0, y0, x1, y1) {
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (frozen(w, x, y)) w.grid[y * COLS + x] = 1;
      };
      L.snowball = function (o) {
        var b = L.saw(o);
        state(w).balls.push(b);
        return b;
      };
    },
    step: function (w) {
      var s = w.ice, i;
      if (!s) return;
      for (i = 0; i < s.waves.length; i++) waveStep(w, s.waves[i]);
      for (i = 0; i < s.cubes.length; i++) cubeStep(w, s.cubes[i]);
    },
    phys: function (w, p, P, dir) {
      var s = w.ice;
      if (!s) return;
      s.dir = dir; s.vx0 = p.vx; // the speed coming in (pushing a cube zeroes p.vx)
      if (!p.onGround) { if (s.fast) P.run = ICE_RUN; return; }
      s.fast = false;
      if (!onIce(w, p)) { s.skid = 0; return; }
      P.accG = ICE_ACC; P.decG = ICE_DEC; P.turnG = ICE_TURN; P.run = ICE_RUN;
      s.fast = Math.abs(p.vx) > PH.run;
      // gliding with no arrow, or braking: a hiss and a spray of ice
      if (Math.abs(p.vx) > 120 && dir * p.vx <= 0) {
        if (s.skid++ % 8 === 0) w.emit('iceSkid', { x: p.x + PH.w / 2, y: p.y + PH.h, first: s.skid === 1, dir: p.vx > 0 ? 1 : -1 });
      } else s.skid = 0;
    },
    after: function (w) {
      var s = w.ice, p = w.p;
      if (!s) return;
      if (s.dir && p.onGround) kick(w, s); else s.push = 0;
      // the snowball's own touch test, so the death says "snow", not "saw"
      for (var i = 0; i < s.balls.length; i++) {
        var b = s.balls[i];
        if (!b.active) continue;
        var dx = b.x - Math.max(p.x, Math.min(b.x, p.x + PH.w)), dy = b.y - Math.max(p.y, Math.min(b.y, p.y + PH.h));
        if (dx * dx + dy * dy < b.r * b.r * 0.6084) { w.die('snow'); return; }
      }
    }
  });

  // A tile that L.freeze turned to ice (the map's own '~' tiles are baked).
  function frozen(w, x, y) {
    return w.grid[y * COLS + x] === ICE.k && w.def.map[y][x] !== '~';
  }

  /* ================================================================ drawing */
  if (Art) {
    var ICE_BODY = '#5cc6f2', ICE_TOP = '#dff7ff', ICE_DEEP = '#2b8fd0', HOOD = '#1d3a6e';
    var SNOW = ['#ffffff', '#bff0ff'];

    Art.GROUND.ice = { top: '#eaf9ff', line: '#ffffff', mark: 'ring', stroke: 2 };

    // A frozen sky: three rounded ice mountains with snow caps, big soft
    // snowflakes, and a snow bank with igloos that runs down behind the floor.
    Art.SCENERY.ice = function (g, pal, r) {
      var i, k, x, y, s, a, c, d, ph = r() * 9;
      for (i = 0; i < 3; i++) {
        x = 170 + i * 460 + r() * 120; s = 170 + r() * 70; y = 250 + r() * 90;
        g.fillStyle = pal.bg2; g.globalAlpha = 1; g.beginPath();
        g.moveTo(x - s * 1.5, E.H);
        g.bezierCurveTo(x - s * 0.75, y + 30, x - s * 0.4, y, x, y);
        g.bezierCurveTo(x + s * 0.4, y, x + s * 0.75, y + 30, x + s * 1.5, E.H);
        g.fill();
        // each cap is clipped to its own mountain, so it never spills onto a neighbour
        g.save(); g.clip();
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.beginPath();
        g.moveTo(x - s * 1.5, y - 20); g.lineTo(x - s * 1.5, y + 46);
        for (k = 0; k < 6; k++) g.quadraticCurveTo(x - s * 1.5 + (k + 0.5) * s / 2, y + 66, x - s * 1.5 + (k + 1) * s / 2, y + 46);
        g.lineTo(x + s * 1.5, y - 20);
        g.fill();
        g.restore();
      }
      g.strokeStyle = '#ffffff'; g.globalAlpha = 0.35; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
      for (i = 0; i < 9; i++) {
        x = 70 + i * 140 + r() * 70; y = 150 + r() * 240; s = 16 + r() * 22; a = r();
        for (k = 0; k < 6; k++) {
          c = a + k * Math.PI / 3;
          d = s * 0.6;
          g.moveTo(x, y); g.lineTo(x + Math.cos(c) * s, y + Math.sin(c) * s);
          g.moveTo(x + Math.cos(c) * d + Math.cos(c + 0.8) * s * 0.3, y + Math.sin(c) * d + Math.sin(c + 0.8) * s * 0.3);
          g.lineTo(x + Math.cos(c) * d, y + Math.sin(c) * d);
          g.lineTo(x + Math.cos(c) * d + Math.cos(c - 0.8) * s * 0.3, y + Math.sin(c) * d + Math.sin(c - 0.8) * s * 0.3);
        }
      }
      g.stroke();
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.3; g.beginPath(); g.moveTo(0, E.H);
      for (x = 0; x <= E.W; x += 32) g.lineTo(x, 482 - Math.sin(x / 160 + ph) * 12 - Math.sin(x / 57) * 4);
      g.lineTo(E.W, E.H); g.fill();
      // igloos: domes of snow blocks sitting on the bank
      for (x = 80 + r() * 120; x < E.W - 40; x += 300 + r() * 200) {
        s = 34 + r() * 14;
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.55; g.beginPath(); g.arc(x, 496, s, Math.PI, 0); g.fill();
        g.strokeStyle = pal.bg; g.globalAlpha = 0.9; g.lineWidth = 2.5; g.beginPath();
        for (k = 1; k < 3; k++) { d = Math.sqrt(s * s - k * k * s * s / 9); g.moveTo(x - d, 496 - k * s / 3); g.lineTo(x + d, 496 - k * s / 3); }
        for (k = -1; k < 2; k++) { g.moveTo(x + k * s * 0.45 + s * 0.2, 496); g.lineTo(x + k * s * 0.45 + s * 0.2, 496 - s / 3); }
        g.stroke();
      }
    };

    // A strip of ice tiles: a glassy body, a frosty top when nothing sits on
    // it, a deeper edge at the bottom and a diagonal shine on each tile.
    var iceRow = function (ctx, x, y, wd, top) {
      var sx;
      ctx.fillStyle = ICE_BODY; ctx.fillRect(x, y, wd, T);
      ctx.fillStyle = ICE_DEEP; ctx.fillRect(x, y + T - 6, wd, 6);
      if (top) { ctx.fillStyle = ICE_TOP; ctx.fillRect(x, y, wd, 8); ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, wd, 3); }
      ctx.beginPath();
      for (sx = x; sx < x + wd; sx += T) { ctx.moveTo(sx + 8, y + T - 9); ctx.lineTo(sx + 20, y + 12); ctx.moveTo(sx + 22, y + T - 9); ctx.lineTo(sx + 27, y + 24); }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    };
    // Does anything but a cube sit on cell (x, y)?
    var covered = function (w, x, y) {
      var o = y > 0 ? w.owner[(y - 1) * COLS + x] : null;
      return y > 0 && (!!w.grid[(y - 1) * COLS + x] || !!(o && !o.own));
    };
    // Draws the runs of cells in row y, columns x0..x1, that test() says are ice.
    var iceRuns = function (ctx, w, y, x0, x1, test) {
      var a = -1, top = false;
      for (var x = x0; x <= x1 + 1; x++) {
        var on = x <= x1 && test(w, x, y), t = on && !covered(w, x, y);
        if (a >= 0 && (!on || t !== top)) { iceRow(ctx, a * T, y * T, (x - a) * T, top); a = -1; }
        if (on && a < 0) { a = x; top = t; }
      }
    };
    var mapIce = function (w, x, y) { return w.def.map[y][x] === '~'; };

    var drawCube = function (ctx, c, pal) {
      var g = c.g, x = c.x + g.ox, y = c.y + g.oy, sx;
      Art.rr(ctx, x + 1.5, y + 1.5, c.w - 3, c.h - 3, 8);
      ctx.fillStyle = ICE_BODY; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = pal.ink; ctx.stroke();
      Art.rr(ctx, x + 6, y + 6, c.w - 12, 7, 3.5);
      ctx.fillStyle = ICE_TOP; ctx.fill();
      ctx.beginPath();
      for (sx = x; sx < x + c.w; sx += T) { ctx.moveTo(sx + 10, y + c.h - 10); ctx.lineTo(sx + 21, y + 18); ctx.moveTo(sx + 24, y + c.h - 10); ctx.lineTo(sx + 28, y + 27); }
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    };

    // The penguins' bus: a yellow coach with snow on its roof and a penguin in
    // each window, looking the way it drives.
    var drawBus = function (ctx, b, pal) {
      var g = b.g, x = b.x + g.ox, y = b.y + g.oy, m = g.m, cx;
      var f = m && m.delay <= 0 ? (m.tx > g.ox ? 2 : -2) : 0;
      Art.rr(ctx, x + 1.5, y + 1.5, b.w - 3, T - 3, 9);
      ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 6, y + 3, b.w - 12, 4);
      ctx.fillStyle = '#ff3b5c'; ctx.fillRect(x + 3, y + 30, b.w - 6, 4);
      ctx.beginPath();
      for (cx = x + T / 2; cx < x + b.w; cx += T) ctx.rect(cx - 12, y + 10, 24, 17);
      ctx.fillStyle = '#dff7ff'; ctx.fill();
      ctx.beginPath();
      for (cx = x + T / 2; cx < x + b.w; cx += T) { ctx.moveTo(cx + 9, y + 27); ctx.arc(cx, y + 27, 9, 0, Math.PI, true); }
      ctx.fillStyle = HOOD; ctx.fill();
      ctx.beginPath();
      for (cx = x + T / 2 + f; cx < x + b.w; cx += T) { ctx.moveTo(cx + 5.5, y + 23.5); ctx.ellipse(cx, y + 23.5, 5.5, 4, 0, 0, TAU); }
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath();
      for (cx = x + T / 2 + f * 1.5; cx < x + b.w; cx += T) { ctx.moveTo(cx - 2, y + 24.5); ctx.lineTo(cx + 2, y + 24.5); ctx.lineTo(cx, y + 27.5); }
      ctx.fillStyle = '#ff9f1c'; ctx.fill();
      ctx.beginPath();
      for (cx = x + T / 2 + f * 1.5; cx < x + b.w; cx += T) {
        ctx.moveTo(cx - 1, y + 22); ctx.arc(cx - 2.3, y + 22, 1.3, 0, TAU);
        ctx.moveTo(cx + 3.6, y + 22); ctx.arc(cx + 2.3, y + 22, 1.3, 0, TAU);
      }
      ctx.fillStyle = pal.ink; ctx.fill();
      ctx.beginPath();
      for (cx = x + T / 2; cx < x + b.w; cx += T) ctx.rect(cx - 12, y + 10, 24, 17);
      ctx.lineWidth = 2.5; ctx.stroke();
    };

    // The giant snowball: shaded, lumps turning as it rolls, and a grumpy face
    // that leans the way it flies.
    var drawBall = function (ctx, b, pal) {
      var r = b.r, f = Math.max(-1, Math.min(1, b.vx / b.speed)) * r * 0.22, k, a;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#b9e3fa'; ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.14, -r * 0.14, r * 0.84, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.fillStyle = '#d8f1ff'; ctx.beginPath();
      for (k = 0; k < 4; k++) {
        a = b.rot * 0.4 + k * 1.6;
        ctx.moveTo(Math.cos(a) * r * 0.6 + r * 0.15, Math.sin(a) * r * 0.6); ctx.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.15, 0, TAU);
      }
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.lineWidth = 3.5; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.fillStyle = pal.ink; ctx.beginPath();
      ctx.ellipse(f - r * 0.27, -r * 0.08, r * 0.1, r * 0.13, 0, 0, TAU); ctx.ellipse(f + r * 0.27, -r * 0.08, r * 0.1, r * 0.13, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(f - r * 0.45, -r * 0.4); ctx.lineTo(f - r * 0.12, -r * 0.24);
      ctx.moveTo(f + r * 0.45, -r * 0.4); ctx.lineTo(f + r * 0.12, -r * 0.24);
      ctx.moveTo(f - r * 0.28, r * 0.36); ctx.quadraticCurveTo(f, r * 0.2, f + r * 0.28, r * 0.36);
      ctx.stroke();
      ctx.restore();
    };

    // The host, Bunqu: a penguin head with a red bobble hat, drawn once into a
    // small canvas (3x, so it stays sharp when the bubble pops).
    var head = null;
    var bunqu = function () {
      var r = 26, ctx;
      head = document.createElement('canvas');
      head.width = head.height = 192;
      ctx = head.getContext('2d');
      ctx.setTransform(3, 0, 0, 3, 96, 105);
      ctx.lineWidth = 3; ctx.strokeStyle = '#0d2b52'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = HOOD; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, r * 0.18, r * 0.72, r * 0.62, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.fillStyle = '#0d2b52';
      ctx.beginPath(); ctx.ellipse(-r * 0.27, r * 0.02, r * 0.1, r * 0.15, 0, 0, TAU); ctx.ellipse(r * 0.27, r * 0.02, r * 0.1, r * 0.15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,105,140,0.6)';
      ctx.beginPath(); ctx.ellipse(-r * 0.45, r * 0.32, r * 0.13, r * 0.08, 0, 0, TAU); ctx.ellipse(r * 0.45, r * 0.32, r * 0.13, r * 0.08, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.2); ctx.lineTo(r * 0.2, r * 0.2); ctx.lineTo(0, r * 0.48); ctx.closePath();
      ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.45); ctx.quadraticCurveTo(0, -r * 1.5, r * 0.85, -r * 0.45); ctx.closePath();
      ctx.fillStyle = '#ff3b5c'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -r * 1.05, r * 0.22, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    };
    var hostMsg = null, hostW = 0;

    Art.mod({
      bake: function (g, w, pal) {
        var s = w.ice, y, x, i, k;
        if (pal.theme === 'ice') {
          // short icicles of mixed lengths under the ceiling
          g.fillStyle = '#e8fbff'; g.globalAlpha = 0.8; g.beginPath();
          for (x = 1; x < COLS - 1; x++) {
            for (y = 0; y < 7 && w.grid[y * COLS + x]; y++);
            if (y < 1 || y > 6 || w.owner[y * COLS + x]) continue;
            for (k = 0; k < 2; k++) {
              var v = (x * 7 + k * 5) % 11, ix = x * T + 5 + k * 18 + v;
              if (v > 8) continue;
              g.moveTo(ix, y * T); g.lineTo(ix + 9, y * T); g.lineTo(ix + 4.5, y * T + 6 + v * 1.6);
            }
          }
          g.fill(); g.globalAlpha = 1;
        }
        if (!s) return;
        // the ground under a cube keeps its snowy top when the cube slides off
        var st = Art.GROUND[pal.theme] || Art.GROUND.ice;
        for (i = 0; i < s.cubes.length; i++) {
          var tl = s.cubes[i].g.tiles;
          for (k = 0; k < tl.length; k++) {
            x = tl[k].x; y = tl[k].y + 1;
            if (y >= ROWS || w.def.map[y][x] !== '#') continue;
            g.fillStyle = pal.ink; g.fillRect(x * T, y * T, T, T);
            g.fillStyle = st.top; g.fillRect(x * T, y * T, T, 6);
            if (st.line) { g.fillStyle = st.line; g.fillRect(x * T, y * T, T, 2); }
          }
        }
        for (y = 0; y < ROWS; y++) if (w.def.map[y].indexOf('~') >= 0) iceRuns(g, w, y, 0, COLS - 1, mapIce);
      },
      draw: function (ctx, w, pal) {
        var s = w.ice, i, y;
        if (!s) return;
        for (i = 0; i < s.waves.length; i++) {
          var v = s.waves[i];
          for (y = v.y0; y <= v.y1; y++) iceRuns(ctx, w, y, v.x0, Math.min(v.x - 1, v.x1), frozen);
        }
        for (i = 0; i < s.cubes.length; i++) if (s.cubes[i].g.active) drawCube(ctx, s.cubes[i], pal);
        for (i = 0; i < s.buses.length; i++) if (s.buses[i].g.active) drawBus(ctx, s.buses[i], pal);
      },
      front: function (ctx, w, pal) {
        var s = w.ice;
        if (!s) return;
        for (var i = 0; i < s.balls.length; i++) if (s.balls[i].active) drawBall(ctx, s.balls[i], pal);
      },
      // Bunqu pops up beside every speech bubble in his world.
      hud: function (ctx, w, pal, t, ui) {
        var gm = ui.game;
        if (pal.theme !== 'ice' || !gm.msg || gm.msgT <= 0) return;
        if (gm.msg !== hostMsg) { hostMsg = gm.msg; ctx.font = '700 28px ' + Art.FONT; hostW = ctx.measureText(hostMsg).width + 44; }
        var pop = 1 + Math.max(0, gm.msgT - 1.5) * 0.4, k = pop / 3;
        if (!head) bunqu();
        ctx.save();
        ctx.globalAlpha = Math.min(1, gm.msgT * 4);
        ctx.translate(Math.min(1240, 640 + hostW * pop / 2 + 34), 172); ctx.rotate(Math.sin(t * 5) * 0.08);
        ctx.drawImage(head, -96 * k, -105 * k, 192 * k, 192 * k);
        ctx.restore();
      }
    });

    Art.EV.iceKick = function (d, ui) {
      ui.fx.burst(d.x + d.dir * 4, d.y, { count: 8, colors: SNOW, speed: 200, life: 0.4, size: 6, gravity: 300, angle: d.dir > 0 ? 0 : Math.PI, spread: 1.6 });
      ui.shake.add(3);
      ui.sfx('iceKick');
    };
    Art.EV.iceBump = function (d, ui) { ui.sfx('iceBump'); };
    Art.EV.iceSkid = function (d, ui) {
      ui.fx.burst(d.x - d.dir * 8, d.y, { count: 3, colors: SNOW, speed: 110, life: 0.35, size: 5, gravity: 400, angle: -Math.PI / 2 - d.dir * 0.6, spread: 0.9 });
      if (d.first) ui.sfx('iceSkid');
    };
    Art.EV.iceFreeze = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 4, colors: SNOW, speed: 150, life: 0.6, size: 6, gravity: -80 });
      if (d.first) { ui.sfx('iceFreeze'); ui.shake.add(4); }
    };
    Art.EV.icePuff = function (d, ui) {
      d.g.rects(function (rx, ry) { ui.fx.burst(rx + T / 2, ry + T / 2, { count: 10, colors: SNOW, speed: 160, life: 0.5, size: 7, gravity: -60 }); });
      ui.sfx('icePuff');
    };

    Art.SFX.iceKick = function (A) {
      A.tone({ freq: 190, to: 90, type: 'square', dur: 0.07, vol: 0.12 });
      A.noise({ dur: 0.35, vol: 0.14, filter: 5000, to: 700 });
    };
    Art.SFX.iceBump = function (A) {
      A.tone({ freq: 240, to: 120, type: 'triangle', dur: 0.1, vol: 0.2 });
      A.noise({ dur: 0.1, vol: 0.12, filter: 2200, to: 300 });
    };
    Art.SFX.iceSkid = function (A) { A.noise({ dur: 0.4, vol: 0.1, filter: 7000, to: 1500 }); };
    Art.SFX.iceFreeze = function (A) {
      [2093, 1760, 2349, 1976, 2637, 3136].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.08, delay: i * 0.06 }); });
      A.noise({ dur: 0.5, vol: 0.08, filter: 9000, to: 4000 });
    };
    Art.SFX.icePuff = function (A) {
      A.tone({ freq: 500, to: 1100, type: 'sine', dur: 0.14, vol: 0.14 });
      A.noise({ dur: 0.2, vol: 0.1, filter: 4000, to: 800 });
    };
    Art.CAUSE.snow = ['صرت رجل ثلج!', 'كرة الثلج أكلتك!', 'برررد!'];

    // The penguin skin: a navy hood around a white face turned the way you
    // look, an orange beak and a red scarf with one tail flapping behind.
    Art.SKINS.push({ id: 'penguin', name: 'البطريق', stars: 110, body: '#ffffff' });
    Art.ACC.penguin = function (ctx, face, t, ink, top) {
      var wav = Math.sin(t * 12) * 3, ex = face * 4;
      Art.rr(ctx, -15, top, 30, 36, 11);
      ctx.moveTo(face * 3 + 13, -17); ctx.ellipse(face * 3, -17, 13, 14, 0, 0, TAU);
      ctx.fillStyle = HOOD; ctx.fill('evenodd');
      Art.rr(ctx, -15, top, 30, 36, 11);
      ctx.lineWidth = 3.5; ctx.strokeStyle = ink; ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex - 4, -17); ctx.lineTo(ex + 4, -17); ctx.lineTo(ex + face * 1.5, -11); ctx.closePath();
      ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff3b5c';
      ctx.beginPath(); ctx.moveTo(-face * 12, -7); ctx.lineTo(-face * 25, -5 + wav); ctx.lineTo(-face * 22, 1 + wav); ctx.closePath(); ctx.fill();
      Art.rr(ctx, -15, -9, 30, 6, 3); ctx.fill();
    };
  }

  /* ================================================================ levels */
  var B = root.TrollLevels.B, room = B.room, pit = B.pit, hole = B.hole;
  var LEVELS = [];

  // 6-1: the floor is ice, a spike pops up, and letting go no longer stops you.
  LEVELS.push({
    name: 'أرض زلقة',
    msg: 'أنا بنقو! الفرامل تعمل... ربما!',
    hint: 'على الجليد تنزلق بعيدًا! لا تحاول التوقف... اقفز فوق الشوكة مبكرًا.',
    map: room().f(4, 13, 26, 13, '~').s(2, 12, 'P').s(21, 12, '1').s(28, 12, 'D').done(),
    script: function (L) { L.onX(17.5, function () { L.sp(1).pop(); }); },
    sol: 'R90 RJ20 R200'
  });

  // 6-2: the door hops back over your head while you slide toward the spikes.
  LEVELS.push({
    name: 'الفرامل',
    msg: 'أسرع! الباب ينتظرك!',
    hint: 'على الجليد اضغط السهم المعاكس لتتوقف بسرعة، ثم ارجع إلى الباب.',
    map: room().f(1, 13, 29, 13, '~').f(30, 3, 30, 12, '#').f(29, 9, 29, 12, '<').s(2, 12, 'P').s(26, 12, 'D').done(),
    script: function (L) {
      L.onX(24, function () {
        var d = L.door;
        L.msg('أبطئ!');
        // up fast, so a jump at the door never catches it mid-hop: only braking wins
        L.doorTo(d, 26, 8, 24, 0, function () { B.slide(L, d, 17, 8, 14, function () { B.slide(L, d, 17, 12, 14); }); });
      });
    },
    sol: 'R138 L200'
  });

  // 6-3: land on the ice island holding right and you slide off; wait for the bus.
  // The island is 6 wide, so pressing LEFT just after landing still stops you.
  LEVELS.push({
    name: 'حافلة البطاريق',
    msg: 'الحافلة تأتي كل 4 ثوانٍ!',
    hint: 'اضغط يسارًا فور هبوطك على الجزيرة لتتوقف، ثم انتظر الحافلة.',
    map: (function () {
      var b = room();
      pit(b, 8, 26);
      b.f(11, 13, 16, 16, '#').f(11, 13, 16, 13, '~').f(17, 13, 19, 13, 'a');
      return b.s(2, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      var a = L.bus('a');
      var go = function () { a.move(7, 0, 7, 1, function () { a.move(-7, 0, 7, 1, go); }); };
      go();
    },
    sol: 'R43 RJ20 R16 L10 _140 R45 _110 R100'
  });

  // 6-4: a 6-wide pit: only an ice run-up jump gets across.
  LEVELS.push({
    name: 'قفزة البطريق',
    msg: 'البطاريق لا تطير!',
    hint: 'ارجع إلى الخلف، ثم اركض على الجليد واقفز من الحافة لتطير أبعد!',
    map: (function () {
      var b = room();
      pit(b, 16, 21);
      return b.f(1, 13, 15, 13, '~').s(15, 12, 'P').s(27, 12, 'D').done();
    })(),
    sol: 'L30 R55 RJ20 R100'
  });

  // 6-5: level 25's patience bridge, on ice: letting go glides you into the pit.
  LEVELS.push({
    name: 'الصبر المتجمد',
    msg: 'لا يوجد طريق... استسلم!',
    hint: 'اضغط يسارًا مبكرًا لتتوقف قبل الحافة، ثم قف بلا حركة وانتظر.',
    map: (function () {
      var b = room();
      pit(b, 8, 24);
      return b.f(8, 13, 24, 13, 'a').f(1, 13, 7, 13, '~').s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      var a = L.g('a'), still = 0;
      a.active = false;
      L.world.ticks.push(function () {
        if (a.active) return;
        still = L.grounded() && Math.abs(L.world.p.vx) < 20 && L.px() > 5 ? still + 1 : 0;
        if (still > 90) { a.show(); L.world.reveal(a); L.msg('حسنًا... جسر للصبورين!'); }
      });
    },
    sol: 'R25 _200 R300'
  });

  // 6-6: kick the slab into the trench, ride it down, jump off its end.
  LEVELS.push({
    name: 'لوح الثلج',
    msg: 'الحفرة عريضة... مستحيل!',
    hint: 'ادفع اللوح ليسقط في الحفرة، انزل عليه، ثم اقفز من آخره إلى الأرض.',
    map: (function () {
      var b = room();
      b.f(12, 13, 17, 14, ' ').f(12, 14, 17, 14, '^').f(5, 12, 7, 12, 'a');
      return b.s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      var a = L.cube('a', { dir: 1 });
      L.when(function () { return a.ox > 0; }, function () { L.msg('وداعًا!'); });
    },
    sol: 'R108 RJ20 R100'
  });

  // 6-7: the door is behind you, too high: kick the cube left to make a step.
  LEVELS.push({
    name: 'درجة الثلج',
    msg: 'إلى الأمام دائمًا!',
    hint: 'الباب خلفك! اقفز فوق المكعب وادفعه نحو اليسار ليصبح درجة.',
    map: (function () {
      var b = room();
      pit(b, 20, 24);
      return b.f(1, 10, 3, 12, '#').s(13, 12, 'a').s(8, 12, 'P').s(2, 9, 'D').done();
    })(),
    script: function (L) { L.cube('a', { home: true }); },
    sol: 'R20 RJ20 R20 L120 LJ20 L30 LJ20 L60'
  });

  // 6-8: after two levels of kicking, the cube carries the door: don't kick it!
  // It is two tiles tall, so a full jump lands on it instead of sailing over the door.
  LEVELS.push({
    name: 'باب على مكعب',
    msg: 'الباب فوق المكعب... لا تركله!',
    hint: 'لا تركل المكعب! اقفز فوقه مباشرة لتلمس الباب.',
    map: (function () {
      var b = room();
      hole(b, 22, 24);
      return b.f(4, 13, 21, 13, '~').f(18, 11, 18, 12, 'a').s(18, 10, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      var a = L.cube('a', { home: true });
      L.when(function () { return a.ox > 0; }, function () { L.msg('وداعًا يا باب!'); });
    },
    sol: 'R76 RJ20 R60'
  });

  // 6-9: the pistons of level 16, until the floor freezes behind the first one:
  // the lazy ones slam when you come near, and on ice you glide right under them.
  LEVELS.push({
    name: 'التجميد المفاجئ',
    msg: 'مكابس؟ سهلة! لا جديد هنا.',
    hint: 'بعد التجميد اضغط يسارًا لتتوقف، ثم اقترب ببطء ومُرّ والمكبس يرتفع.',
    map: room().f(8, 3, 9, 6, 'a').f(15, 3, 16, 6, 'b').f(23, 3, 24, 6, 'c').s(2, 12, 'P').s(29, 12, 'D').done(),
    script: function (L) {
      var a = L.g('a');
      var cyc = function () {
        a.move(0, 6, 16, 0.4, function () {
          L.sfx('slam'); L.shake(5);
          a.move(0, -6, 5, 0.3, function () { L.after(0.9, cyc); });
        });
      };
      L.after(0.1, cyc);
      var lazy = function (ch, x) {
        var g = L.g(ch);
        var arm = function () {
          L.when(L.zone(x - 1.8, 0, x + 3.6, 20), function () {
            g.move(0, 6, 24, 0.04, function () {
              L.sfx('slam'); L.shake(6);
              g.move(0, -6, 3, 0.8, arm);
            });
          });
        };
        arm();
      };
      lazy('b', 15); lazy('c', 23);
      L.onX(10.5, function () { L.freeze(11, 13, 30, 13); L.msg('تجميييد!'); });
    },
    sol: 'R20 _80 R52 L8 _30 R10 _30 R12 _70 R35 _10 L10 _40 R14 _60 R14 _70 R100'
  });

  // 6-10: the snowball chases you over the slab and the long ice jump.
  LEVELS.push({
    name: 'قلعة الجليد',
    msg: 'آخر مرحلة عندي... بسيطة!',
    winMsg: 'هزمت بنقو! الجليد لا يخيفك!',
    hint: 'لا تتوقف: ادفع اللوح واتبعه، ثم اركض على الجليد واقفز من الحافة.',
    map: (function () {
      var b = room();
      // 8 tiles of ice between the trench and the pit: land, speed up, then jump
      b.f(7, 13, 12, 14, ' ').f(7, 14, 12, 14, '^').f(2, 12, 4, 12, 'a');
      pit(b, 21, 26);
      return b.f(13, 13, 20, 13, '~').f(27, 13, 30, 13, '~').s(1, 12, 'P').s(29, 12, 'D').done();
    })(),
    script: function (L) {
      L.cube('a', { dir: 1 });
      var s = L.snowball({ x: -1.5, y: 10, speed: 4, r: 40, active: false });
      L.onX(3, function () { L.wake(s); L.msg('اهرب! هههه'); });
    },
    sol: 'R78 RJ20 R40 RJ20 R100'
  });

  root.TrollLevels.addWorld({ name: 'عالم الجليد', n: LEVELS.length, theme: 'ice', bg: '#8fdcff', bg2: '#a9e6ff', ink: '#0d2b52', ink2: '#2a4a78', accent: '#ffffff' }, LEVELS);
})(typeof window !== 'undefined' ? window : globalThis);
