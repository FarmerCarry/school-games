/*
 * Sneaky Levels — world 10 (levels 71-80): jump-switch blocks.
 * Registers its mechanic with the engine (TrollEngine.mod / .tile) and, in the
 * browser, with the drawing (TrollArt), then adds its world with TrollLevels.addWorld.
 *
 * '[' red blocks start solid, ']' blue blocks start as ghosts (dashed outlines you
 * pass through). Every real jump (from the ground or in coyote time) swaps the two
 * colours; springs, falling and being carried never do. A colour that turns solid
 * while you are inside one of its blocks (or under one of its pistons) waits (it
 * blinks) until you have left, so a ghost layer you jump up through turns solid
 * under your feet. Touching blocks of one colour form one block for that rule.
 * Spikes, springs and doors that stand on a coloured block (or are tinted) exist
 * only while that colour is solid.
 * Script API:
 *   L.tint(what, 'red'|'blue')  a group letter (its blocks swap too, even while it
 *                               moves: pistons), or a door, spring, spike, L.sp(n)
 *                               or a list of them (they exist only with that colour)
 *   L.swap()                    swap the colours now (a scripted beat)
 *   L.tempo(s, first)           the colours swap by themselves every s seconds (the
 *                               first time after `first`, with a beat bar) and jumps
 *                               stop counting; L.tempo(0) stops
 *   L.beats()                   swaps so far
 *   L.onBeat(fn)                fn(solidColour, beats) after every swap
 */
(function (root) {
  'use strict';
  var E = root.TrollEngine, Art = root.TrollArt;
  var T = E.T, COLS = E.COLS, PH = E.PH, DT = E.DT;
  var RED = 'red', BLUE = 'blue';

  // The level's music state, made by the first coloured tile or script call. A new
  // map parse (on every respawn) brings a new w.groups list, and with it a fresh state.
  function state(w) {
    if (!w.mus || w.mus.gl !== w.groups) w.mus = { gl: w.groups, on: RED, groups: [], att: [], fns: [], n: 0, beats: 0, beatT: -1, tempo: 0, left: 0 };
    return w.mus;
  }

  // A piston (g.sweep) also counts the space below it, which it stamps through, so
  // it never turns solid over your head.
  function inside(w, g) {
    var p = w.p, tl = g.tiles, y;
    for (var i = 0; i < tl.length; i++) {
      y = tl[i].y * T + g.oy;
      if (E.overlap(p.x, p.y, PH.w, PH.h, tl[i].x * T + g.ox, y, T, g.sweep ? E.H - y : T)) return true;
    }
    return false;
  }

  // Group b joins group a (two runs of one colour that meet while the map is read).
  function merge(w, m, a, b) {
    for (var i = 0; i < b.tiles.length; i++) { a.tiles.push(b.tiles[i]); w.owner[b.tiles[i].y * COLS + b.tiles[i].x] = a; }
    w.groups.splice(w.groups.indexOf(b), 1); m.groups.splice(m.groups.indexOf(b), 1);
    delete w.gmap[b.id];
  }

  // Makes g a coloured group, solid or ghost by the colour that is solid now.
  function colour(w, m, g, col) {
    if (!g.music) m.groups.push(g);
    g.own = true; g.music = col;
    g.pend = col === m.on && inside(w, g);
    g.fake = col !== m.on || g.pend;
  }

  // Spikes, doors and springs whose colour comes from their block or a tint.
  function scan(w, m) {
    var lists = [w.spikes, w.doors, w.springs], kinds = ['spike', 'door', 'spring'], i, k, o;
    for (k = 0; k < 3; k++) {
      for (i = 0; i < lists[k].length; i++) {
        o = lists[k][i];
        if (!o.mk && (o.mcol || (o.g && o.g.music))) { o.mk = kinds[k]; m.att.push(o); }
      }
    }
  }

  // Parks a door or spring out of its engine list while its colour is a ghost.
  function park(list, o, on) {
    if (!on === !!o.mpark) return;
    o.mpark = !on;
    if (on) list.push(o); else list.splice(list.indexOf(o), 1);
  }

  function sync(w, m) {
    for (var i = 0; i < m.att.length; i++) {
      // a door that L.doorTo took off its block (o.g = null) leaves the colour too
      var o = m.att[i], on = o.mcol ? o.mcol === m.on : !o.g || (o.g.active && !o.g.fake), b;
      if (o.mk === 'spike') {
        // a spike, like a block, never appears inside you: test where it will stand
        if (on && !o.out) { o.out = 1; b = w.spikeBox(o); o.out = 0; on = !E.overlap(w.p.x, w.p.y, PH.w, PH.h, b[0], b[1], b[2], b[3]); }
        if (on) { if (o.target !== 1) { o.target = 1; o.speed = 16; } } else o.out = o.target = 0;
      } else park(o.mk === 'door' ? w.doors : w.springs, o, on);
    }
  }

  function beat(w, m) {
    m.on = m.on === RED ? BLUE : RED;
    for (var i = 0; i < m.groups.length; i++) colour(w, m, m.groups[i], m.groups[i].music);
    m.beats++; m.beatT = w.t;
    sync(w, m);
    w.emit('beat', { n: m.beats, on: m.on, x: w.p.x + PH.w / 2, y: w.p.y + PH.h / 2, tempo: m.tempo > 0 });
    for (i = 0; i < m.fns.length; i++) m.fns[i](m.on, m.beats);
  }

  E.mod({
    chars: '[]',
    // Touching tiles of one colour join one group (left and upper neighbours are read first).
    cell: function (w, ch, x, y) {
      var m = state(w), col = ch === '[' ? RED : BLUE, g = null;
      var l = x > 0 ? w.owner[y * COLS + x - 1] : null, u = y > 0 ? w.owner[(y - 1) * COLS + x] : null;
      if (l && l.music === col) g = l;
      if (u && u.music === col) { if (!g) g = u; else if (u !== g) merge(w, m, g, u); }
      if (!g) { g = w.newGroup(ch + m.n++); colour(w, m, g, col); }
      g.tiles.push({ x: x, y: y });
      w.owner[y * COLS + x] = g;
    },
    init: function (w) {
      var m = w.mus;
      if (!m) return;
      if (m.gl !== w.groups) { w.mus = null; return; }
      scan(w, m); sync(w, m);
    },
    api: function (L, w) {
      L.tint = function (what, col) {
        var m = state(w), i;
        if (typeof what === 'string') colour(w, m, w.gmap[what], col);
        else if (what.list || what.length) for (i = 0; i < (what.list || what).length; i++) L.tint((what.list || what)[i], col);
        else what.mcol = col;
        scan(w, m); sync(w, m);
      };
      L.swap = function () { beat(w, state(w)); };
      L.tempo = function (s, first) { var m = state(w); m.tempo = s; m.left = first || s; };
      L.beats = function () { return w.mus ? w.mus.beats : 0; };
      L.onBeat = function (fn) { state(w).fns.push(fn); };
    },
    step: function (w) {
      var m = w.mus;
      if (!m) return;
      if (m.tempo && (m.left -= DT) <= 0) { m.left += m.tempo; beat(w, m); }
      for (var i = 0; i < m.groups.length; i++) {
        var g = m.groups[i];
        if (g.pend && !inside(w, g)) { g.pend = g.fake = false; w.emit('beatSet', { g: g }); }
      }
      sync(w, m);
    },
    jump: function (w) {
      var m = w.mus;
      if (m && !m.tempo) beat(w, m);
    }
  });

  /* ================================================================ drawing */
  if (Art) {
    var TAU = Math.PI * 2;
    var COL = { red: '#ff4d6d', blue: '#3d7bff' }, LIGHT = { red: '#ffa3b5', blue: '#a5c4ff' }, WORD = { red: 'أحمر', blue: 'أزرق' };
    var WOOD = '#e0915a', WOOD2 = '#b5652f';
    // the little tune the swaps play, one note each (Twinkle Twinkle, in C major)
    var TUNE = [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60], noteN = 0;

    Art.GROUND.music = { top: '#ffffff', mark: 'ring', stroke: 2 };

    // An eighth note with its head at (x, y), or two beamed ones: one path to fill.
    var noteShape = function (g, x, y, s, two) {
      g.moveTo(x + s, y); g.ellipse(x, y, s, s * 0.72, -0.35, 0, TAU);
      g.rect(x + s * 0.7, y - s * 4, s * 0.32, s * 4);
      if (two) {
        g.moveTo(x + s * 4.2, y - s * 0.6); g.ellipse(x + s * 3.2, y - s * 0.6, s, s * 0.72, -0.35, 0, TAU);
        g.rect(x + s * 3.9, y - s * 4.6, s * 0.32, s * 4);
        g.moveTo(x + s * 0.7, y - s * 4); g.lineTo(x + s * 4.22, y - s * 4.6); g.lineTo(x + s * 4.22, y - s * 3.7); g.lineTo(x + s * 0.7, y - s * 3.1); g.closePath();
      } else {
        g.moveTo(x + s, y - s * 4); g.quadraticCurveTo(x + s * 2.8, y - s * 2.8, x + s * 2.1, y - s * 1.2);
        g.quadraticCurveTo(x + s * 2.2, y - s * 2.5, x + s, y - s * 2.9); g.closePath();
      }
    };
    // A treble clef centred on its curl at (x, y), s = one staff gap: one path to stroke.
    var clefShape = function (g, x, y, s) {
      g.moveTo(x + 0.2 * s, y - 0.1 * s);
      g.bezierCurveTo(x - 0.5 * s, y - 0.3 * s, x - 0.6 * s, y + 0.8 * s, x + 0.1 * s, y + 0.8 * s);
      g.bezierCurveTo(x + 1.1 * s, y + 0.8 * s, x + 1.1 * s, y - 0.7 * s, x + 0.1 * s, y - 1.1 * s);
      g.bezierCurveTo(x - 0.9 * s, y - 1.6 * s, x - 0.2 * s, y - 2.4 * s, x + 0.35 * s, y - 3.2 * s);
      g.bezierCurveTo(x + 0.6 * s, y - 2.6 * s, x - 0.2 * s, y - 2.2 * s, x - 0.05 * s, y - 1.2 * s);
      g.lineTo(x + 0.35 * s, y + 1.6 * s);
      g.quadraticCurveTo(x + 0.35 * s, y + 2.2 * s, x - 0.25 * s, y + 2.0 * s);
    };

    // A music box: soft wavy staffs with notes and clefs across the sky, a big
    // speaker on one side, and equalizer bars rising from behind the floor.
    Art.SCENERY.music = function (g, pal, r) {
      var i, k, x, y, y0, ph, side = r() < 0.5, sx = side ? 120 + r() * 60 : 1100 + r() * 60;
      var wave = function (xx, base, p) { return base + Math.sin(xx / 240 + p) * 16; };
      // the speaker
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.16;
      Art.rr(g, sx - 105, 250, 210, 520, 28); g.fill();
      g.fillStyle = pal.bg2; g.globalAlpha = 1; g.beginPath();
      g.arc(sx, 420, 78, 0, TAU); g.moveTo(sx + 30, 300); g.arc(sx, 300, 30, 0, TAU); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.globalAlpha = 0.4; g.beginPath();
      g.arc(sx, 420, 78, 0, TAU); g.moveTo(sx + 46, 420); g.arc(sx, 420, 46, 0, TAU); g.moveTo(sx + 30, 300); g.arc(sx, 300, 30, 0, TAU);
      g.stroke();
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.45; g.beginPath(); g.arc(sx, 420, 18, 0, TAU); g.arc(sx, 300, 9, 0, TAU); g.fill();
      // equalizer bars, tallest in gentle waves
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.2; g.beginPath();
      ph = r() * 6;
      for (x = 8; x < E.W; x += 40) {
        var h = 40 + Math.abs(Math.sin(x / 150 + ph)) * 110 + r() * 26;
        g.moveTo(x + 24, E.H); g.arc(x + 12, 520 - h + 12, 12, 0, Math.PI, true); g.lineTo(x, E.H);
      }
      g.fill();
      // two staffs with a clef and a few notes sitting on their lines
      for (i = 0; i < 2; i++) {
        y0 = 150 + i * 150 + r() * 20; ph = r() * 6;
        g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.globalAlpha = 0.3; g.beginPath();
        for (k = 0; k < 5; k++) {
          g.moveTo(0, wave(0, y0 + k * 18, ph));
          for (x = 32; x <= E.W; x += 32) g.lineTo(x, wave(x, y0 + k * 18, ph));
        }
        g.stroke();
        x = 40 + r() * 200;
        g.lineWidth = 6; g.globalAlpha = 0.42; g.lineCap = 'round'; g.beginPath();
        clefShape(g, x, wave(x, y0 + 54, ph), 18); g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 4, wave(x, y0 + 54, ph) + 34, 6, 0, TAU); g.fill();
        g.globalAlpha = 0.38; g.beginPath();
        for (x += 150 + r() * 80; x < E.W - 60; x += 140 + r() * 120) {
          y = wave(x, y0 + 9 * Math.floor(r() * 9), ph);
          noteShape(g, x, y, 9, r() < 0.5);
        }
        g.fill();
      }
    };

    // Block pictures, drawn once per scale k (device pixels per logical pixel): a solid
    // block and a dashed ghost of each colour, 44 x 44 around the 40 x 40 tile.
    var spr = { k: 0 };
    var canvas = function (w, h, k, fn) {
      var c = document.createElement('canvas');
      c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
      var g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, 0, 0);
      fn(g);
      return c;
    };
    var solidBlock = function (col, ink) {
      return function (g) {
        Art.rr(g, 3.5, 3.5, 37, 37, 8); g.fillStyle = COL[col]; g.fill();
        g.lineWidth = 3; g.strokeStyle = ink; g.stroke();
        Art.rr(g, 8, 7.5, 28, 6, 3); g.fillStyle = LIGHT[col]; g.fill();
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath();
        if (col === RED) noteShape(g, 19, 30, 4.2, false); else noteShape(g, 15, 31, 3.6, true);
        g.fill();
      };
    };
    var ghostBlock = function (col) {
      return function (g) {
        Art.rr(g, 4.5, 4.5, 35, 35, 8); g.fillStyle = COL[col]; g.globalAlpha = 0.14; g.fill();
        g.globalAlpha = 0.85; g.setLineDash([6, 5]); g.lineWidth = 3; g.strokeStyle = COL[col]; g.stroke();
        g.setLineDash([]); g.globalAlpha = 0.45; g.fillStyle = COL[col]; g.beginPath();
        if (col === RED) noteShape(g, 19, 30, 4.2, false); else noteShape(g, 15, 31, 3.6, true);
        g.fill();
      };
    };
    var sprites = function (k, ink) {
      spr.k = k; spr.ink = ink;
      spr.red = canvas(44, 44, k, solidBlock(RED, ink)); spr.blue = canvas(44, 44, k, solidBlock(BLUE, ink));
      spr.gred = canvas(44, 44, k, ghostBlock(RED)); spr.gblue = canvas(44, 44, k, ghostBlock(BLUE));
    };

    var parked = { springs: [] };
    // A spike of a ghost colour: a dashed outline where it will pop up.
    var ghostSpike = function (ctx, s) {
      var x = s.x + (s.g ? s.g.ox : 0), y = s.y + (s.g ? s.g.oy : 0), a;
      for (var k = 0; k < 2; k++) {
        a = k * 20;
        if (s.dir === 'u') { ctx.moveTo(x + a + 1, y + T); ctx.lineTo(x + a + 10, y + 13); ctx.lineTo(x + a + 19, y + T); }
        else if (s.dir === 'd') { ctx.moveTo(x + a + 1, y); ctx.lineTo(x + a + 10, y + T - 13); ctx.lineTo(x + a + 19, y); }
        else if (s.dir === 'l') { ctx.moveTo(x + T, y + a + 1); ctx.lineTo(x + 13, y + a + 10); ctx.lineTo(x + T, y + a + 19); }
        else { ctx.moveTo(x, y + a + 1); ctx.lineTo(x + T - 13, y + a + 10); ctx.lineTo(x, y + a + 19); }
      }
    };

    var drawBlocks = function (ctx, w, m, t) {
      var pop = m.beatT >= 0 ? (w.t - m.beatT) / 0.16 : 1, i, q, g, tl, x, y, jx, jy, im, a, sc;
      for (i = 0; i < m.groups.length; i++) {
        g = m.groups[i];
        if (!g.active) continue;
        jx = jy = 0;
        if (g.shakeT > 0) { jx = Math.sin(t * 90 + i) * 2.5; jy = Math.cos(t * 70 + i) * 1.5; }
        im = g.music === RED ? spr.red : spr.blue;
        // pending: blinks between ghost and solid until you step out of it
        a = 0.45 + 0.4 * Math.sin(t * 26);
        sc = !g.fake && pop < 1 ? 3 * Math.sin(pop * Math.PI) : 0;
        for (q = 0; q < g.tiles.length; q++) {
          tl = g.tiles[q];
          x = tl.x * T + g.ox + jx - 2; y = tl.y * T + g.oy + jy - 2;
          if (g.fake) ctx.drawImage(g.music === RED ? spr.gred : spr.gblue, x, y, 44, 44);
          if (g.pend) { ctx.globalAlpha = a; ctx.drawImage(im, x, y, 44, 44); ctx.globalAlpha = 1; }
          else if (!g.fake) ctx.drawImage(im, x - sc, y - sc, 44 + 2 * sc, 44 + 2 * sc);
        }
      }
    };

    // What stands on a ghost colour: faded doors and springs, dashed spikes. A tinted
    // spike shows its colour as a glow behind it.
    var drawAttached = function (ctx, w, m, pal, t) {
      var i, o, n = 0;
      for (i = 0; i < m.att.length; i++) {
        o = m.att[i];
        if (o.mk !== 'spike' || !o.mcol) continue;
        ctx.beginPath(); ghostSpike(ctx, o);
        if (o.out > 0.5) { ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.strokeStyle = COL[o.mcol]; ctx.stroke(); }
        else {
          ctx.globalAlpha = 0.85; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); ctx.strokeStyle = COL[o.mcol]; ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      }
      ctx.globalAlpha = 0.3;
      for (i = 0; i < m.att.length; i++) {
        o = m.att[i];
        if (!o.mpark) continue;
        if (o.mk === 'door') Art.drawDoor(ctx, o, pal, t, false);
        else parked.springs[n++] = o;
      }
      parked.springs.length = n;
      if (n) Art.drawSprings(ctx, parked, pal);
      ctx.globalAlpha = 1;
      for (i = 0; i < m.att.length; i++) {
        o = m.att[i];
        if (o.mk !== 'spike' || o.mcol || o.out) continue;
        ctx.beginPath(); ghostSpike(ctx, o);
        ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); ctx.strokeStyle = pal.ink; ctx.globalAlpha = 0.5; ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    };

    // HUD pieces, drawn once per level: the chip that says what your next jump
    // brings, and the beat bar's two labels.
    var hudC = { w: null };
    var chip = function (col, ink) {
      return canvas(250, 44, 2, function (g) {
        Art.rr(g, 2, 2, 246, 40, 20); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = ink; g.stroke();
        Art.rr(g, 12, 9, 26, 26, 6); g.fillStyle = COL[col]; g.fill(); g.lineWidth = 2.5; g.stroke();
        g.font = '700 21px ' + Art.FONT; g.textAlign = 'right'; g.textBaseline = 'middle'; g.direction = 'rtl';
        g.fillStyle = ink; g.fillText('القفزة التالية: ' + WORD[col], 234, 23);
      });
    };
    var label = function (text, ink) {
      return canvas(200, 36, 2, function (g) {
        g.font = '700 20px ' + Art.FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.direction = 'rtl';
        g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = ink; g.strokeText(text, 4, 18);
        g.fillStyle = '#ffffff'; g.fillText(text, 4, 18);
      });
    };
    var hudPieces = function (w, pal) {
      hudC.w = w;
      hudC.red = chip(RED, pal.ink); hudC.blue = chip(BLUE, pal.ink);
      hudC.next = label('التبديل القادم', pal.ink); hudC.now = label('تبديل!', pal.ink);
    };

    // The host, Tiktok: a bossy wooden metronome, drawn once at 3x; his arm ticks live.
    var host = null, hostMsg = null, hostW = 0;
    var tiktok = function (ink) {
      host = canvas(64, 80, 3, function (g) {
        g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = ink;
        g.beginPath(); g.moveTo(10, 74); g.lineTo(22, 8); g.quadraticCurveTo(32, 2, 42, 8); g.lineTo(54, 74); g.closePath();
        g.fillStyle = WOOD; g.fill(); g.stroke();
        g.beginPath(); g.moveTo(17, 62); g.lineTo(47, 62); g.lineTo(52, 74); g.lineTo(12, 74); g.closePath();
        g.fillStyle = WOOD2; g.fill(); g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(25, 34, 6, 7, 0, 0, TAU); g.ellipse(39, 34, 6, 7, 0, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = ink; g.beginPath(); g.arc(26, 35, 2.8, 0, TAU); g.arc(38, 35, 2.8, 0, TAU); g.fill();
        g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
        g.moveTo(18, 23); g.lineTo(29, 27); g.moveTo(46, 23); g.lineTo(35, 27);
        g.moveTo(26, 50); g.quadraticCurveTo(32, 46, 38, 50); g.stroke();
        g.fillStyle = 'rgba(255,105,140,0.6)'; g.beginPath(); g.ellipse(19, 45, 3.5, 2.2, 0, 0, TAU); g.ellipse(45, 45, 3.5, 2.2, 0, 0, TAU); g.fill();
      });
    };

    Art.mod({
      // the floor under a coloured block keeps its top, for when the block turns ghost
      bake: function (g, w, pal) {
        var m = w.mus, st = Art.GROUND[pal.theme] || Art.GROUND.music, i, q, x, y;
        if (!m) return;
        for (i = 0; i < m.groups.length; i++) {
          for (q = 0; q < m.groups[i].tiles.length; q++) {
            x = m.groups[i].tiles[q].x; y = m.groups[i].tiles[q].y + 1;
            if (y >= E.ROWS || !w.grid[y * COLS + x]) continue;
            g.fillStyle = st.top; g.fillRect(x * T, y * T, T, 6);
            if (st.line) { g.fillStyle = st.line; g.fillRect(x * T, y * T, T, 2); }
          }
        }
      },
      draw: function (ctx, w, pal, t, k) {
        var m = w.mus;
        if (!m) return;
        if (spr.k !== k || spr.ink !== pal.ink) sprites(k, pal.ink);
        drawBlocks(ctx, w, m, t);
        if (m.att.length) drawAttached(ctx, w, m, pal, t);
      },
      hud: function (ctx, w, pal, t, ui) {
        var m = w.mus, gm = ui.game;
        if (m && m.groups.length) {
          if (hudC.w !== w) hudPieces(w, pal);
          if (!m.tempo) ctx.drawImage(m.on === RED ? hudC.blue : hudC.red, 990, 62, 250, 44);
          else {
            // the beat bar: shrinks until the next swap, in the colour that comes next
            var left = Math.min(m.left, m.tempo), bw = 300, bx = 490, by = 76;
            Art.rr(ctx, bx, by, bw, 22, 11); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
            Art.rr(ctx, bx + 3, by + 3, Math.max(16, (bw - 6) * left / m.tempo), 16, 8);
            ctx.fillStyle = COL[m.on === RED ? BLUE : RED]; ctx.fill();
            ctx.drawImage(left < 0.25 ? hudC.now : hudC.next, bx + bw + 8, by - 7, 200, 36);
          }
        }
        // Tiktok pops up beside every speech bubble in his world
        if (pal.theme !== 'music' || !gm.msg || gm.msgT <= 0) return;
        if (gm.msg !== hostMsg) { hostMsg = gm.msg; ctx.font = '700 28px ' + Art.FONT; hostW = ctx.measureText(hostMsg).width + 44; }
        if (!host) tiktok(pal.ink);
        var pop = 1 + Math.max(0, gm.msgT - 1.5) * 0.4;
        ctx.save();
        ctx.globalAlpha = Math.min(1, gm.msgT * 4);
        ctx.translate(Math.min(1232, 640 + hostW * pop / 2 + 44), 176); ctx.scale(pop, pop);
        // his ticking arm pokes out of the top, behind him
        ctx.save(); ctx.rotate(Math.sin(t * 7) * 0.5);
        ctx.strokeStyle = pal.ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, -64); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(-6, -58, 12, 9); ctx.lineWidth = 2.5; ctx.strokeRect(-6, -58, 12, 9);
        ctx.restore();
        ctx.drawImage(host, -32, -42, 64, 80);
        ctx.restore();
      }
    });

    Art.EV.beat = function (d, ui) {
      noteN = d.n - 1;
      ui.sfx('beatNote');
      if (!d.tempo) ui.fx.burst(d.x, d.y, { count: 6, colors: [COL[d.on], '#ffffff'], speed: 160, life: 0.4, size: 6, gravity: -60 });
    };
    Art.EV.beatSet = function (d, ui) {
      d.g.rects(function (rx, ry) { ui.fx.burst(rx + T / 2, ry + T / 2, { count: 2, colors: [COL[d.g.music], '#ffffff'], speed: 90, life: 0.3, size: 5, gravity: 0 }); });
      ui.sfx('beatSet');
    };

    var mf = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };
    // a music-box pluck: the note, a soft octave and a tiny bell tick
    Art.SFX.beatNote = function (A) {
      var f = mf(TUNE[noteN % TUNE.length] + 12);
      A.tone({ freq: f, type: 'sine', dur: 0.55, vol: 0.2 });
      A.tone({ freq: f * 2, type: 'sine', dur: 0.25, vol: 0.06 });
      A.tone({ freq: f * 4, type: 'triangle', dur: 0.05, vol: 0.04 });
    };
    Art.SFX.beatSet = function (A) { A.tone({ freq: 900, to: 1300, type: 'triangle', dur: 0.06, vol: 0.08 }); };
    Art.SFX.drumroll = function (A) {
      for (var i = 0; i < 16; i++) A.noise({ dur: 0.07, vol: 0.06 + i * 0.012, filter: 1800, to: 500, delay: i * 0.062 });
    };
    Art.SFX.crash = function (A) {
      A.noise({ dur: 0.9, vol: 0.22, filter: 9000, to: 2500 });
      A.tone({ freq: 98, to: 60, type: 'sine', dur: 0.35, vol: 0.3 });
    };
  }

  /* ================================================================ levels */
  var B = root.TrollLevels.B, room = B.room, pit = B.pit;
  var LEVELS = [];

  // A piston that rests on the floor and only pops up for a moment (too short to
  // run under a 3-wide one), first after `first` seconds. Its colour never turns
  // solid while you stand under it (see inside).
  function stamp(L, ch, first) {
    var g = L.g(ch);
    g.sweep = true;
    var go = function () {
      g.move(0, 6, 24, 0.05, function () {
        L.sfx('slam'); L.shake(3);
        g.move(0, -6, 24, 0.8, go);
      });
    };
    L.after(first, go);
  }

  // 10-1: a jump fades the red wall and fills in the blue bridge; the red spike on
  // the bridge fades too. Jump over it and the bridge goes with it.
  LEVELS.push({
    name: 'الشوكة الشبح',
    msg: 'أنا تكتوك! هنا القفز موسيقى!',
    hint: 'كل قفزة تبدّل الألوان! اقفز أمام الجدار، ثم امشِ على الجسر ولا تقفز.',
    map: (function () {
      var b = room();
      pit(b, 12, 21);
      return b.f(9, 11, 9, 12, '[').f(12, 13, 21, 13, ']').s(15, 12, '1').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) { L.tint(L.sp(1), 'red'); },
    sol: 'R50 RJ14 R150'
  });

  // 10-2: two jumps: the first fills in the blue platform, the second the red floor.
  LEVELS.push({
    name: 'قفزتان',
    msg: 'الحفرة عريضة جدًا!',
    hint: 'اقفز مرتين: الأولى إلى المنصة الزرقاء، والثانية إلى الأرض الحمراء.',
    map: (function () {
      var b = room();
      pit(b, 11, 30);
      return b.f(13, 11, 14, 11, ']').f(17, 13, 30, 13, '[').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    sol: 'R60 RJ20 R20 RJ20 R120'
  });

  // 10-3: ghost stairs: jump toward the dashed step and your jump makes it solid. The
  // steps touch and are 3 wide: a standing jump reaches the next one, a runner has time.
  LEVELS.push({
    name: 'الدرج العجيب',
    msg: 'درج سهل... اصعد!',
    hint: 'اقفز نحو الدرجة الباهتة! قفزتك تجعلها صلبة.',
    map: room().s(8, 12, '[').f(9, 11, 11, 12, ']').f(12, 9, 14, 12, '[').f(15, 7, 17, 12, ']').f(18, 5, 30, 12, '#')
      .s(2, 12, 'P').s(27, 4, 'D').done(),
    sol: 'R40 RJ20 R10 RJ20 R14 RJ20 R16 RJ20 R160'
  });

  // 10-4: the spring throws you over the wall, but springs never swap the colours.
  LEVELS.push({
    name: 'النطّاطة الكاذبة',
    msg: 'نطّاطة! هيا اقفز عاليًا!',
    hint: 'النطّاطة لا تبدّل الألوان! اقفز قفزة عادية قبلها.',
    map: (function () {
      var b = room();
      pit(b, 15, 22);
      return b.s(13, 12, 'J').f(14, 8, 14, 12, '[').f(15, 13, 22, 13, ']').s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    sol: 'R50 RJ20 R200'
  });

  // 10-5: stand in a ghost layer and jump straight up: it turns solid under you.
  LEVELS.push({
    name: 'برج النغمات',
    msg: 'الباب فوق البرج. بلا درج!',
    hint: 'قف داخل الطبقة الباهتة واقفز عاليًا: ستصبح صلبة تحت قدميك!',
    map: room().f(14, 11, 16, 12, ']').f(14, 9, 16, 10, '[').f(14, 7, 16, 8, ']').f(14, 5, 16, 6, '[').f(17, 5, 30, 12, '#')
      .s(2, 12, 'P').s(15, 4, 'D').done(),
    sol: 'R104 _20 J24 _30 J24 _30 J24 _30 J24 _40'
  });

  // 10-6: the door stands on a red island: jump to it and it fades. Hop once first.
  LEVELS.push({
    name: 'الباب الراقص',
    msg: 'الباب ينتظرك على الجزيرة.',
    hint: 'اقفز قفزة زائدة قبل الحفرة، فيعود الباب عندما تقفز إليه.',
    map: (function () {
      var b = room();
      pit(b, 12, 20);
      return b.f(15, 12, 16, 12, '[').s(15, 11, 'D').s(2, 12, 'P').done();
    })(),
    sol: 'R20 RJ20 R30 RJ20 R60'
  });

  // 10-7: pistons are coloured blocks too: jump in front of one and it turns into a ghost.
  LEVELS.push({
    name: 'المكبس الشبح',
    msg: 'مكابس؟ تذكّر المرحلة 16!',
    hint: 'لا تنتظر المكبس! اقفز أمامه فيصبح شبحًا.',
    map: room().f(8, 3, 10, 6, 'a').f(15, 3, 17, 6, 'b').f(22, 3, 24, 6, 'c').s(2, 12, 'P').s(28, 12, 'D').done(),
    script: function (L) {
      L.tint('a', 'red'); L.tint('b', 'blue'); L.tint('c', 'red');
      L.when(function () { return L.t() > 2.2 || L.px() > 4; }, function () { stamp(L, 'a', 0); stamp(L, 'b', 0.3); stamp(L, 'c', 0.6); });
    },
    sol: 'R50 RJ20 R30 RJ20 R30 RJ20 R100'
  });

  // 10-8: the metronome plays: the colours swap every 1.5 s and jumps don't count.
  // The bridges are 6 wide, too wide to jump, so you must walk each one in its colour's
  // beat, from a white pillar; the first one is a ghost until the music starts.
  LEVELS.push({
    name: 'المترونوم',
    msg: 'استمع جيدًا...',
    hint: 'هنا الألوان تتبدل وحدها. انتظر على الأبيض، ثم امشِ بعد النغمة.',
    map: (function () {
      var b = room();
      pit(b, 5, 26);
      b.f(5, 13, 10, 13, ']').f(13, 13, 18, 13, '[').f(21, 13, 26, 13, ']');
      b.f(11, 13, 12, 16, '#').f(19, 13, 20, 16, '#');
      return b.s(30, 12, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      // jumps never count here; the first swap comes once the title card has gone.
      // The door stands on white floor and comes with the red notes.
      L.tint(L.door, 'red');
      L.tempo(1.5, 3);
      L.when(function () { return L.t() > 2.2; }, function () { L.msg('تكتوك يعزف الآن!'); });
      L.when(function () { return L.t() > 2.2 && L.world.p.jumping; }, function () { L.msg('قفزك لا يبدّل شيئًا هنا!'); });
    },
    sol: 'R15 _165 R56 _34 R60 _30 R120'
  });

  // 10-9: a saw chases you over red and blue bridges: every jump brings the next one.
  LEVELS.push({
    name: 'سباق الإيقاع',
    msg: 'اركض مع الإيقاع!',
    hint: 'اقفز فور هبوطك على كل قطعة! القفزة من الحافة تطير فوق التالية.',
    map: (function () {
      var b = room();
      pit(b, 6, 29);
      b.f(6, 13, 9, 13, '[').f(10, 13, 13, 13, ']').f(14, 13, 17, 13, '[').f(18, 13, 21, 13, ']').f(22, 13, 25, 13, '[').f(26, 13, 29, 13, ']');
      return b.s(2, 12, 'P').s(30, 12, 'D').done();
    })(),
    script: function (L) {
      var s = L.saw({ x: -1, y: 9, mode: 'chase', speed: 5.2, active: false });
      // it wakes with a buzz, not a message, so the level's message stays up
      L.onX(5, function () { L.wake(s); });
    },
    sol: 'R30 RJ20 R18 RJ20 R18 RJ20 R18 RJ20 R18 RJ20 R18 RJ20 R60'
  });

  // 10-10: ghost stairs, the King's drum roll (a forced swap), pistons, the island door.
  LEVELS.push({
    name: 'حفلة الملك',
    msg: 'حفلتي الأخيرة... استمتع!',
    winMsg: 'برافو! أنت سيد الإيقاع!',
    hint: 'اقفز نحو الباهت، وعند صوت الطبل قف على الأبيض، وعدّ قفزاتك قبل الباب.',
    map: (function () {
      var b = room();
      pit(b, 26, 30);
      b.s(4, 12, '[').f(6, 11, 7, 12, ']').f(9, 9, 10, 12, '[').f(11, 9, 12, 12, '#');
      b.f(14, 3, 16, 6, 'a').f(19, 3, 21, 6, 'b').f(28, 12, 29, 12, '[');
      return b.s(29, 11, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      L.tint('a', 'red'); L.tint('b', 'blue');
      L.when(function () { return L.t() > 2.2 || L.px() > 8; }, function () { stamp(L, 'a', 0); stamp(L, 'b', 0.5); });
      // the drum roll starts on the white landing once the title card has gone (or as
      // you step off it), so the swap never happens behind the card
      L.when(function () { return L.px() >= 11 && (L.t() > 2.2 || L.px() >= 13); }, function () {
        L.msg('الملك أخذ الطبل!'); L.sfx('drumroll');
        for (var i = 0; i < 5; i++) L.after(i * 0.2, function () { L.shake(2); });
        L.after(1, function () { L.swap(); L.sfx('crash'); L.msg('الملك: دوري!'); L.shake(6); });
      });
    },
    sol: 'R11 RJ20 R8 RJ20 R15 _119 R48 RJ20 R16 _20 J10 _30 R28 RJ20 R20'
  });

  root.TrollLevels.addWorld({ name: 'عالم الموسيقى', n: LEVELS.length, theme: 'music', bg: '#6ff0b0', bg2: '#8ff5c4', ink: '#0e3330', ink2: '#23524a', accent: '#ffffff' }, LEVELS);
})(typeof window !== 'undefined' ? window : globalThis);
