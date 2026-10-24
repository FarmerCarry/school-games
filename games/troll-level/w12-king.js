/*
 * Sneaky Levels — world 12 (levels 91-100): the Sneaky King.
 * Registers its mechanic with the engine (TrollEngine.mod) and, in the browser,
 * with the drawing (TrollArt), then adds its world with TrollLevels.addWorld.
 *
 * The villain of levels 24 and 30 in person: his words and the game's own screen
 * are solid. A speech bubble is a group of whole tiles, ceil((40 + 15 x letters) / 40)
 * wide and 1 tall (counted, not measured, so Node and the browser agree). Calm
 * bubbles are platforms, shouts kill like spikes, heavy words show their shadow
 * and then fall like bricks, and a liar's words are not solid. A bubble never
 * appears on top of you: it waits until you are out of its tiles. The title
 * card, the death counter, the win panel and the end credits become blocks too.
 * Map: 'U' the King's seat, 'C' a checkpoint flag (touching it saves your place;
 * deaths and R restart there, leaving the level forgets it).
 * Script API:
 *   L.say(text, x, y, { style, life, hold })  a bubble with its left end at tile (x, y);
 *                            style 'say' (calm), 'shout', 'heavy' or 'fake'; life in
 *                            s (0 = stays; it blinks for its last 1.5 s, then pops);
 *                            a heavy word waits `hold` s (0.8) with its shadow, then falls.
 *   L.unsay(p), L.style(p, style, text), L.onWord(p)  pop, restyle, stand on a bubble.
 *   L.throne(ch), L.onBonk(fn)  group ch is the King's throne; fn(n) on the n-th bonk
 *                            from below.
 *   L.card(x, y, w)          the level's title card in the room: its number on row y,
 *                            its name (w wide) on row y + 1.
 *   L.fall(p, delay, crumble) shake for delay s, then fall and land; with crumble,
 *                            every tile left over a hole drops when you stand on it
 *                            (a falling card's light number line just pops).
 *   L.pill(x, y)             the death counter flies out of the HUD to (x, y) and is
 *                            solid once there; 2 tiles long plus 1 per death in this
 *                            visit (up to 6).
 *   L.fakeWin(x, y)          a painted copy of the win screen (10 x 4 tiles, uneven).
 *   L.credits(lines, { cols, speed, every, top, pre })  rising end-credit lines, in
 *                            turn in each column (pre: s already rolled); a line
 *                            given as { text, fake: true } is a liar's line.
 *   L.cp()                   how many checkpoint flags this visit has reached.
 *   L.poof(d)                door d vanishes in a puff.
 */
(function (root) {
  'use strict';
  var E = root.TrollEngine, Art = root.TrollArt, TL = root.TrollLevels;
  var T = E.T, COLS = E.COLS, ROWS = E.ROWS, PH = E.PH, DT = E.DT, TAU = Math.PI * 2;
  var BLINK = 1.5, SAY_LIFE = 6, HOLD = 0.8, COOL = 0.4, CRUMBLE = 0.12;

  // The level's King state for this life. Each reset makes a new groups list, so
  // a state whose list is stale belongs to the life before and is replaced.
  function state(w) {
    var s = w.k12;
    if (s && s.gs === w.groups) return s;
    return (w.k12 = { gs: w.groups, pieces: [], flags: [], king: null, throne: null, bonk: [], bonks: 0, cool: 0, talk: 0, jolt: 0, n: 0, credits: null });
  }

  function wordW(text) { return Math.ceil((40 + 15 * text.length) / 40); }

  // A piece of speech or interface: a group of whole tiles (one group per tile
  // once it crumbles), drawn by the art below from its kind, text and style.
  function piece(w, kind, text, x, y, wd, ht, o) {
    var s = state(w), g = w.newGroup('k' + s.n++), i, j;
    var p = {
      kind: kind, text: text, style: o.style || 'say', x: x, y: y, w: wd, h: ht, g: g, gs: [g],
      life: o.life || 0, age: 0, wait: true, hold: o.hold || 0, falling: false, landed: false,
      crumble: false, split: false, gone: false, grow: 0, land: 0, img: null
    };
    for (j = 0; j < ht; j++) for (i = 0; i < wd; i++) if (!o.mask || o.mask(i, j)) g.tiles.push({ x: x + i, y: y + j });
    g.own = true; g.k12 = p; g.active = false; g.fake = p.style === 'fake';
    s.pieces.push(p);
    return p;
  }

  // Does the player's box, grown by m px, touch the piece? (A waiting piece is
  // tested before it shows.)
  function touching(w, p, m) {
    var q = w.p, k, i, g, tl;
    for (k = 0; k < p.gs.length; k++) {
      g = p.gs[k];
      if (!g.active && !p.wait) continue;
      for (i = 0; i < g.tiles.length; i++) {
        tl = g.tiles[i];
        if (E.overlap(q.x - m, q.y - m, PH.w + 2 * m, PH.h + 2 * m, tl.x * T + g.ox, tl.y * T + g.oy, T, T)) return true;
      }
    }
    return false;
  }

  function show(w, p) {
    p.wait = false; p.g.active = true;
    w.emit('kSay', { p: p });
  }

  function pop(w, p) {
    if (p.gone) return;
    for (var k = 0; k < p.gs.length; k++) p.gs[k].active = false;
    p.gone = true;
    w.emit('kPop', { p: p });
  }

  // A popped piece leaves the world's lists, so the end credits never pile up.
  function remove(w, s, i) {
    var p = s.pieces[i];
    for (var k = 0; k < p.gs.length; k++) {
      var at = w.groups.indexOf(p.gs[k]);
      if (at >= 0) w.groups.splice(at, 1);
      delete w.gmap[p.gs[k].id];
    }
    s.pieces.splice(i, 1);
  }

  // Is cell (x, y) solid: ground, or a tile of a solid group other than skip?
  function solidCell(w, x, y, skip) {
    if (y >= ROWS) return false;
    if (y >= 0 && x >= 0 && x < COLS && w.grid[y * COLS + x]) return true;
    var cx = x * T + T / 2, cy = y * T + T / 2;
    for (var i = 0; i < w.groups.length; i++) {
      var g = w.groups[i];
      if (!g.active || g.fake || g === skip) continue;
      for (var k = 0; k < g.tiles.length; k++) {
        var rx = g.tiles[k].x * T + g.ox, ry = g.tiles[k].y * T + g.oy;
        if (cx > rx && cx < rx + T && cy > ry && cy < ry + T) return true;
      }
    }
    return false;
  }

  // How many rows a heavy word falls before it lands (for its shadow).
  function landRows(w, p) {
    var best = ROWS, g = p.g, k, d, tl;
    for (k = 0; k < g.tiles.length; k++) {
      tl = g.tiles[k];
      for (d = 0; d < best && !solidCell(w, tl.x, tl.y + d + 1, g); d++);
      best = d;
    }
    return best;
  }

  // A landed crumbly piece: each tile with nothing solid under it becomes its
  // own group that drops a moment after you stand on it (like level 6's bridge).
  function split(w, p) {
    var g = p.g, dx = Math.round(g.ox / T), dy = Math.round(g.oy / T), k, tl, sg;
    p.x += dx; p.y += dy;
    for (k = 0; k < g.tiles.length; k++) { g.tiles[k].x += dx; g.tiles[k].y += dy; }
    g.ox = 0; g.oy = 0;
    for (k = g.tiles.length - 1; k >= 0; k--) {
      tl = g.tiles[k];
      if (solidCell(w, tl.x, tl.y + 1, null)) continue;
      sg = w.newGroup(g.id + '~' + k);
      sg.tiles.push(tl); sg.own = true; sg.k12 = p; sg.crumbleDelay = CRUMBLE;
      g.tiles.splice(k, 1); p.gs.push(sg);
    }
    p.split = true;
  }

  function stepPiece(w, p) {
    if (p.wait) {
      if (touching(w, p, 0)) return;
      show(w, p);
    }
    if (p.grow < 1) p.grow = Math.min(1, p.grow + DT * 7);
    if (p.hold > 0) {
      p.land = landRows(w, p);
      p.hold -= DT;
      if (p.hold <= 0) { p.g.drop(0, true); p.falling = true; }
    }
    if (p.falling && !p.g.m) {
      p.falling = false; p.landed = true;
      if (p.crumble) split(w, p);
    }
    if (p.life) {
      p.age += DT;
      if (p.age >= p.life) pop(w, p);
    }
  }

  // The end credits: one line every `every` s, in turn in each column, rising
  // from below the screen until it pops at row `top`. A line `age` s old is
  // already that far up (the roll can start part way through).
  function credit(w, c, age) {
    var ln = c.lines[c.i % c.lines.length], col = c.cols[c.i % c.cols.length], p;
    c.i++;
    p = piece(w, 'credit', ln.text || ln, col[0], ROWS, col[1] - col[0] + 1, 1, { style: ln.fake ? 'fake' : 'say', life: (ROWS - c.top) / c.speed });
    p.age = age; p.g.oy = -c.speed * age * T;
    show(w, p);
    p.g.moveTo(0, c.top - ROWS, c.speed);
  }
  function stepCredits(w, s) {
    var c = s.credits;
    if ((c.t -= DT) > 0) return;
    c.t += c.every;
    credit(w, c, 0);
  }

  // The fake win panel's tiles: three star bumps on top, the panel, and the
  // 'next' button sticking out at its bottom left.
  function winMask(i, j) { return j === 0 ? i === 5 || i === 7 || i === 9 : j === 3 || i >= 2; }

  E.mod({
    chars: 'UC',
    cell: function (w, ch, x, y) {
      var s = state(w);
      if (ch === 'U') s.king = { x: x, y: y };
      else s.flags.push({ x: x, y: y, g: null });
    },
    init: function (w) {
      var s = w.k12, i, f;
      if (s && s.gs !== w.groups) s = w.k12 = null;
      if (!s) return;
      for (i = 0; i < s.flags.length; i++) { f = s.flags[i]; f.g = w.owner[(f.y + 1) * COLS + f.x] || null; }
      // a checkpoint lives on the World: it survives deaths and R, not a new visit
      if (w.cp) { w.p.x = w.cp.x * T + (T - PH.w) / 2; w.p.y = w.cp.y * T + T - PH.h; }
    },
    api: function (L, w) {
      L.say = function (text, x, y, o) {
        o = o || {};
        var st = o.style || 'say', wd = wordW(text);
        var s = state(w), k = s.throne ? s.throne.tiles[0] : s.king, p;
        x = Math.max(1, Math.min(COLS - 1 - wd, x));
        s.talk = 0.6;
        p = piece(w, 'word', text, x, y, wd, 1, {
          style: st, life: o.life != null ? o.life : st === 'heavy' ? 0 : SAY_LIFE,
          hold: st === 'heavy' ? (o.hold || HOLD) : 0
        });
        p.tail = k && k.x > x + wd / 2 ? 1 : -1; // the bubble's tail points at the King
        return p;
      };
      L.unsay = function (p) { if (p) pop(w, p); };
      L.style = function (p, st, text) {
        if (p.style !== st) w.emit('kStyle', { p: p, style: st });
        p.style = st; p.g.fake = st === 'fake';
        if (text) p.text = text;
      };
      L.onWord = function (p) {
        var g = w.p.onGround && w.p.ground;
        return !!g && !!g.k12 && (!p || g.k12 === p);
      };
      L.throne = function (ch) {
        var s = state(w), g = w.gmap[ch];
        g.own = true; s.throne = g;
        g.onHead = function () {
          if (s.cool > 0) return;
          s.cool = COOL; s.jolt = 1; s.bonks++;
          w.emit('kBonk', { g: g });
          for (var i = 0; i < s.bonk.length; i++) s.bonk[i](s.bonks);
        };
        return g;
      };
      L.onBonk = function (fn) { state(w).bonk.push(fn); };
      L.card = function (x, y, wd) {
        var p = piece(w, 'card', w.def.name, x, y + 1, wd, 1, {});
        p.top = piece(w, 'card', 'المرحلة ' + (TL.LEVELS.indexOf(w.def) + 1), x + (wd >> 1) - 3, y, 6, 1, {});
        show(w, p); show(w, p.top);
        return p;
      };
      L.fall = function (p, delay, crumble) {
        p.g.drop(delay, true); p.falling = true; p.crumble = !!crumble;
        if (p.top) pop(w, p.top);
      };
      L.pill = function (x, y) {
        var n = Math.min(6, 2 + w.attempt), p = piece(w, 'pill', String(w.attempt), x, y, n, 1, {}), g = p.g;
        state(w).pillOut = true;
        show(w, p);
        g.ox = 64 - x * T; g.oy = 14 - y * T; // where the HUD draws it
        // it flies through you (its path crosses the floor by the pit)
        g.fake = true;
        g.moveTo(0, 0, 28, 0, function () { g.fake = false; w.pushOut(g); });
        return p;
      };
      L.fakeWin = function (x, y) {
        var p = piece(w, 'win', 'أحسنت!', x, y, 10, 4, { mask: winMask });
        p.lvl = 'المرحلة ' + (TL.LEVELS.indexOf(w.def) + 1);
        show(w, p);
        w.emit('kFakeWin', { x: (x + 5) * T, y: (y + 2) * T });
        return p;
      };
      L.credits = function (lines, o) {
        var c = state(w).credits = { lines: lines, cols: o.cols, speed: o.speed || 2, every: o.every || 1, top: o.top || 3, i: 0, t: 0 };
        for (var age = o.pre || 0; age > 0; age -= c.every) credit(w, c, age);
        c.t = -age;
      };
      L.cp = function () { return w.cp ? w.cp.phase : 0; };
      L.poof = function (d) {
        w.emit('kPoof', { x: d.x + T / 2, y: d.y + 30 });
        d.x = -9 * T;
      };
    },
    step: function (w) {
      var s = w.k12, i;
      if (!s) return;
      if (s.cool > 0) s.cool -= DT;
      if (s.talk > 0) s.talk -= DT;
      if (s.jolt > 0) s.jolt -= DT * 4;
      for (i = 0; i < s.pieces.length; i++) {
        if (s.pieces[i].gone) remove(w, s, i--);
        else stepPiece(w, s.pieces[i]);
      }
      if (s.credits) stepCredits(w, s);
    },
    after: function (w) {
      var s = w.k12, i, p, f, cp;
      if (!s) return;
      for (i = 0; i < s.pieces.length; i++) {
        p = s.pieces[i];
        if (p.style === 'shout' && !p.wait && !p.gone && touching(w, p, 1)) { w.die('shout'); return; }
      }
      for (i = 0; i < s.flags.length; i++) {
        f = s.flags[i]; cp = w.cp;
        if (cp && cp.mask & (1 << i)) continue;
        // the whole column above a flag counts, so you cannot jump over it
        if (!E.overlap(w.p.x, w.p.y, PH.w, PH.h, f.x * T + 8, 0, 24, f.y * T + T)) continue;
        w.cp = { phase: (cp ? cp.phase : 0) + 1, mask: (cp ? cp.mask : 0) | (1 << i), x: f.x, y: f.y };
        w.emit('kFlag', { x: f.x * T + 24, y: f.y * T - 10 });
      }
    }
  });

  /* ================================================================ drawing */
  var PILL_LEVEL = null; // level 97: its death counter sits in the HUD until it flies

  if (Art) {
    var FONT = Art.FONT, M = 10, GOLD = '#ffd23f', ROBE = '#7b3fc4', SKIN = '#ffd9b3', RED = '#d1173a';
    var CONFETTI = ['#ffe14d', '#ff4d6d', '#3fe0c5', '#ffffff', '#8b5cf6'];
    var CHAIN = [7, 4], SOLID = []; // dash patterns made once, not every frame

    Art.GROUND.royal = { top: '#ffd23f', line: '#ffffff', mark: 'ring', stroke: 2.5 };

    // A crooked three-point crown on its base line, centred on x (scenery, emblems).
    var crownPath = function (g, x, y, s, tilt) {
      var c = Math.cos(tilt), n = Math.sin(tilt);
      var pts = [-1, 0, -1, -0.9, -0.5, -0.45, 0, -1.1, 0.5, -0.45, 1, -0.9, 1, 0];
      g.moveTo(x + (pts[0] * c - pts[1] * n) * s, y + (pts[0] * n + pts[1] * c) * s);
      for (var i = 2; i < pts.length; i += 2) g.lineTo(x + (pts[i] * c - pts[i + 1] * n) * s, y + (pts[i] * n + pts[i + 1] * c) * s);
      g.closePath();
    };

    // The throne room: the editor grid of the backstage showing through near the
    // edges, a giant soft crown, pillars to the floor, banners from the top with a
    // crooked-crown emblem, and diamond sparkles.
    Art.SCENERY.royal = function (g, pal, r) {
      var i, x, y, s, grad = g.createRadialGradient(E.W / 2, E.H / 2, 160, E.W / 2, E.H / 2, 760);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,0.3)');
      g.strokeStyle = grad; g.lineWidth = 1; g.beginPath();
      for (x = T; x < E.W; x += T) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, E.H); }
      for (y = T; y < E.H; y += T) { g.moveTo(0, y + 0.5); g.lineTo(E.W, y + 0.5); }
      g.stroke();
      g.fillStyle = grad; g.font = '600 12px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (x = 1; x < COLS - 1; x++) g.fillText(String(x), x * T + T / 2, 3 * T + 10);
      for (y = 4; y < ROWS - 5; y++) g.fillText(String(y), T + 10, y * T + T / 2);
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.13; g.beginPath();
      crownPath(g, E.W / 2, 470, 250, -0.08);
      g.fill();
      g.globalAlpha = 1; g.fillStyle = pal.bg2; g.beginPath();
      for (i = 0; i < 4; i++) {
        x = 150 + i * 327 + r() * 30;
        g.rect(x - 26, 132, 52, E.H); g.rect(x - 36, 118, 72, 18); g.rect(x - 34, 500, 68, 20);
      }
      g.fill();
      g.strokeStyle = pal.bg; g.lineWidth = 4; g.beginPath();
      for (i = 0; i < 4; i++) {
        x = 150 + i * 327;
        for (s = -12; s <= 12; s += 12) { g.moveTo(x + s, 146); g.lineTo(x + s, 492); }
      }
      g.stroke();
      for (i = 0; i < 3; i++) {
        x = 314 + i * 327 + r() * 30; y = 250 + r() * 50;
        g.fillStyle = '#d93a5a'; g.globalAlpha = 0.55; g.beginPath();
        g.moveTo(x - 32, 0); g.lineTo(x + 32, 0); g.lineTo(x + 32, y); g.lineTo(x, y - 26); g.lineTo(x - 32, y); g.closePath();
        g.fill();
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.8; g.beginPath();
        crownPath(g, x, y - 60, 17, 0.2);
        g.fill();
      }
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.5; g.beginPath();
      for (i = 0; i < 18; i++) {
        x = r() * E.W; y = 130 + r() * 360; s = 4 + r() * 6;
        g.moveTo(x, y - s); g.lineTo(x + s * 0.6, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.6, y); g.closePath();
      }
      g.fill();
    };

    // Each piece is painted once into a small canvas (no per-frame Arabic text
    // layout): origin at its top-left tile corner, with an M px margin around.
    var fit = function (g, text, size, w, weight) {
      g.font = (weight || 700) + ' ' + size + 'px ' + FONT;
      while (size > 12 && g.measureText(text).width > w) { size--; g.font = (weight || 700) + ' ' + size + 'px ' + FONT; }
    };
    var label = function (g, text, x, y, size, w, color, stroke, lw) {
      g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fit(g, text, size, w);
      if (stroke) { g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(text, x, y); }
      g.fillStyle = color; g.fillText(text, x, y);
    };
    var zigzag = function (g, w, h) {
      var x, y;
      g.beginPath(); g.moveTo(4, 4);
      for (x = 4; x < w - 4; x += 12) { g.lineTo(x + 6, -3); g.lineTo(Math.min(w - 4, x + 12), 4); }
      for (y = 4; y < h - 4; y += 12) { g.lineTo(w + 4, y + 6); g.lineTo(w - 4, Math.min(h - 4, y + 12)); }
      for (x = w - 4; x > 4; x -= 12) { g.lineTo(x - 6, h + 3); g.lineTo(Math.max(4, x - 12), h - 4); }
      for (y = h - 4; y > 4; y -= 12) { g.lineTo(-4, y - 6); g.lineTo(4, Math.max(4, y - 12)); }
      g.closePath();
    };
    var PAINT = {
      // a speech bubble like the HUD's: calm, shout (jagged, red), heavy (stone) or fake (dashed)
      word: function (g, p, pal) {
        var w = p.w * T, h = T, st = p.style, tx = p.tail > 0 ? w - 26 : 26;
        if (st === 'shout') {
          zigzag(g, w, h);
          g.fillStyle = '#ffb0bd'; g.fill(); g.lineWidth = 3.5; g.lineJoin = 'round'; g.strokeStyle = RED; g.stroke();
          label(g, p.text, w / 2, h / 2 + 1, 24, w - 22, RED, null, 0);
          return;
        }
        Art.rr(g, 2, 2, w - 4, h - 4, st === 'heavy' ? 9 : 18);
        if (st !== 'heavy') { g.moveTo(tx - 7, h - 3); g.lineTo(tx - p.tail * 4, h + 8); g.lineTo(tx + 7, h - 3); }
        g.fillStyle = st === 'heavy' ? '#ddd2ea' : st === 'fake' ? 'rgba(255,255,255,0.45)' : '#ffffff';
        g.fill();
        if (st === 'fake') g.setLineDash([8, 6]);
        g.lineWidth = st === 'heavy' ? 5 : 3.5; g.lineJoin = 'round'; g.strokeStyle = pal.ink; g.stroke();
        g.setLineDash([]);
        if (st === 'heavy') {
          g.fillStyle = 'rgba(42,15,26,0.18)'; g.fillRect(8, h - 11, w - 16, 5);
        }
        g.globalAlpha = st === 'fake' ? 0.7 : 1;
        label(g, p.text, w / 2, h / 2 + 1, 23, w - 24, pal.ink, null, 0);
      },
      // the HUD's title card: the big yellow name (it has the number line on top),
      // or the number line
      card: function (g, p, pal) {
        if (p.top) label(g, p.text, p.w * T / 2, T / 2 + 2, 52, p.w * T - 6, '#ffe14d', pal.ink, 10);
        else label(g, p.text, p.w * T / 2, T / 2 + 1, 32, p.w * T, '#ffffff', pal.ink, 8);
      },
      // the HUD's death counter, darker so it reads as solid
      pill: function (g, p, pal) {
        var w = p.w * T, i, a;
        Art.rr(g, 1, 2, w - 2, T - 4, (T - 4) / 2);
        g.fillStyle = pal.ink; g.globalAlpha = 0.82; g.fill(); g.globalAlpha = 1;
        g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
        g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(20, T / 2, 8, 0, TAU);
        for (i = 0; i < 6; i++) { a = i / 6 * TAU + 0.3; g.moveTo(20 + Math.cos(a) * 10 + 3, T / 2 + Math.sin(a) * 10); g.arc(20 + Math.cos(a) * 10, T / 2 + Math.sin(a) * 10, 3, 0, TAU); }
        g.fill();
        label(g, p.w > 2 ? 'السقطات: ' + p.text : p.text, (w + 34) / 2, T / 2 + 1, 18, w - 44, '#ffffff', null, 0);
      },
      // a painted copy of the win screen: the panel, its stars on top, its 'next' button
      win: function (g, p, pal) {
        var i;
        Art.rr(g, 2 * T + 2, T + 8, 8 * T - 4, 3 * T - 8, 22); g.fillStyle = '#000000'; g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1;
        Art.rr(g, 2 * T + 2, T + 2, 8 * T - 4, 3 * T - 6, 22); g.fillStyle = '#fffaf0'; g.fill();
        g.lineWidth = 5; g.strokeStyle = pal.ink; g.stroke();
        label(g, p.lvl, 6 * T, T + 22, 17, 6 * T, '#54456a', null, 0);
        label(g, p.text, 6 * T, 2.5 * T + 2, 46, 7 * T, '#ffe14d', pal.ink, 9);
        Art.rr(g, 2, 3 * T + 3, 2 * T + 8, T - 6, 14); g.fillStyle = '#ffe14d'; g.fill();
        g.lineWidth = 4; g.strokeStyle = pal.ink; g.stroke();
        label(g, 'التالي', T + 4, 3.5 * T + 1, 19, 2 * T - 8, pal.ink, null, 0);
        for (i = 5; i <= 9; i += 2) Art.star(g, i * T + T / 2, T / 2 + 4, i === 7 ? 23 : 20, '#ffc400', pal.ink, 4);
      },
      // an end-credit line on a dark band (a liar's band is faint and dashed)
      credit: function (g, p, pal) {
        var w = p.w * T, fake = p.style === 'fake';
        Art.rr(g, 1, 1, w - 2, T - 6, 15);
        g.fillStyle = pal.ink; g.globalAlpha = fake ? 0.3 : 0.78; g.fill(); g.globalAlpha = 1;
        if (fake) g.setLineDash([8, 6]);
        g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke(); g.setLineDash([]);
        g.globalAlpha = fake ? 0.85 : 1;
        label(g, p.text, w / 2, T / 2 - 1, 19, w - 20, '#ffffff', null, 0);
      }
    };
    var IMG = {}, nImg = 0;
    var pieceImg = function (p, pal, k) {
      // the piece remembers its image, so no key string is built each frame
      if (p.img && p.imgS === p.style && p.imgT === p.text && p.imgK === k && p.imgP === pal) return p.img;
      p.imgS = p.style; p.imgT = p.text; p.imgK = k; p.imgP = pal;
      var key = p.kind + p.style + p.w + p.text + (p.lvl || '') + pal.ink + k, c = IMG[key], g;
      if (c) return (p.img = c);
      if (++nImg > 60) { IMG = {}; nImg = 1; }
      c = IMG[key] = document.createElement('canvas');
      c.width = Math.ceil((p.w * T + 2 * M) * k); c.height = Math.ceil((p.h * T + 2 * M) * k);
      g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, M * k, M * k);
      PAINT[p.kind](g, p, pal);
      return (p.img = c);
    };

    // One tile of a piece cut into tiles (the margin goes with the outer tiles).
    var slice = function (ctx, c, p, tl, ox, oy, k) {
      var i = tl.x - p.x, j = tl.y - p.y;
      var x0 = i ? i * T : -M, x1 = i === p.w - 1 ? p.w * T + M : (i + 1) * T;
      var y0 = j ? j * T : -M, y1 = j === p.h - 1 ? p.h * T + M : (j + 1) * T;
      ctx.drawImage(c, (x0 + M) * k, (y0 + M) * k, (x1 - x0) * k, (y1 - y0) * k, tl.x * T + ox - i * T + x0, tl.y * T + oy - j * T + y0, x1 - x0, y1 - y0);
    };

    var drawPiece = function (ctx, p, pal, t, k) {
      var g = p.g, c = pieceImg(p, pal, k), a = 1, s, q, i, jx = 0, jy = 0;
      if (p.life && p.life - p.age < BLINK) a = 0.6 + 0.4 * Math.cos(p.age * 20);
      if (p.style === 'heavy' && (p.hold > 0 || p.falling)) {
        // the landing shadow, darker as the word comes down
        q = p.hold > 0 ? 0.25 + 0.15 * Math.sin(t * 14) : 0.4;
        ctx.save(); ctx.globalAlpha = q; ctx.fillStyle = pal.ink; ctx.beginPath();
        ctx.ellipse(p.x * T + p.w * T / 2, (p.y + p.land + 1) * T - 3, p.w * T * 0.48, 7, 0, 0, TAU); ctx.fill();
        ctx.restore();
        if (p.hold > 0) { jx = Math.sin(t * 40) * 2; jy = Math.abs(Math.sin(t * 9)) * -3; }
      }
      if (g.shakeT > 0 || p.style === 'shout') { jx = Math.sin(t * 90) * 2; jy = Math.cos(t * 70) * 1.2; }
      if (p.split) {
        if (a < 1) { ctx.save(); ctx.globalAlpha = a; }
        for (q = 0; q < p.gs.length; q++) {
          var sg = p.gs[q];
          if (!sg.active) continue;
          for (i = 0; i < sg.tiles.length; i++) slice(ctx, c, p, sg.tiles[i], sg.ox + (sg.shakeT > 0 ? Math.sin(t * 90 + q) * 2 : 0), sg.oy, k);
        }
        if (a < 1) ctx.restore();
        return;
      }
      var x = p.x * T + g.ox + jx, y = p.y * T + g.oy + jy;
      if (p.grow >= 1 && a === 1) { ctx.drawImage(c, x - M, y - M, c.width / k, c.height / k); return; }
      // popping in: a quick overshoot around the piece's centre
      s = p.grow < 1 ? 1 + Math.sin(p.grow * Math.PI) * 0.18 - (1 - p.grow) * 0.5 : 1;
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(x + p.w * T / 2, y + p.h * T / 2); ctx.scale(s, s);
      ctx.drawImage(c, -p.w * T / 2 - M, -p.h * T / 2 - M, c.width / k, c.height / k);
      ctx.restore();
    };

    // The King, painted once at 3x facing right with his seat at (0, 0); his
    // mouth is drawn live, so it flaps while he talks.
    var kingImg = null, throneImg = null, headImg = null, crownImg = null;
    var paintKing = function (g, head) {
      g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#2a0f1a';
      if (!head) {
        g.beginPath(); g.moveTo(17, -22); g.lineTo(27, -62); g.stroke();
        g.beginPath(); g.arc(27.5, -64, 5, 0, TAU); g.fillStyle = GOLD; g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-25, 0); g.lineTo(-17, -40); g.quadraticCurveTo(0, -46, 17, -40); g.lineTo(25, 0); g.closePath();
        g.fillStyle = ROBE; g.fill(); g.stroke();
        g.fillStyle = '#ffffff'; g.fillRect(-24, -9, 48, 8); g.strokeRect(-24, -9, 48, 8);
        g.beginPath(); g.ellipse(0, -40, 15, 6, 0, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#2a0f1a';
        g.fillRect(-15, -6, 3, 3); g.fillRect(-2, -6, 3, 3); g.fillRect(11, -6, 3, 3);
        g.beginPath(); g.arc(12, -24, 5, 0, TAU); g.fillStyle = SKIN; g.fill(); g.stroke();
      }
      g.beginPath(); g.arc(0, -57, 16, 0, TAU); g.fillStyle = SKIN; g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,105,140,0.55)'; g.beginPath(); g.ellipse(-9, -51, 4, 2.5, 0, 0, TAU); g.ellipse(12, -51, 4, 2.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#2a0f1a'; g.beginPath(); g.ellipse(-3, -59, 2.2, 3, 0, 0, TAU); g.ellipse(8, -59, 2.2, 3, 0, 0, TAU); g.fill();
      g.lineWidth = 2.2; g.beginPath(); g.moveTo(-8, -66); g.lineTo(-1, -63); g.moveTo(5, -63); g.lineTo(12, -66); g.stroke();
      g.beginPath(); g.arc(4, -53, 4, 0, TAU); g.fillStyle = '#f2a983'; g.fill();
      g.lineWidth = 3; g.beginPath();
      g.moveTo(3, -48); g.bezierCurveTo(-4, -51, -11, -47, -10, -52); g.moveTo(-10, -52); g.arc(-8.5, -52.5, 1.6, Math.PI, TAU * 0.9);
      g.moveTo(5, -48); g.bezierCurveTo(12, -51, 19, -47, 18, -52); g.moveTo(18, -52); g.arc(16.5, -52.5, 1.6, 0, -Math.PI * 1.1, true);
      g.stroke();
      g.save(); g.translate(1, -71); g.rotate(0.28);
      g.beginPath(); crownPath(g, 0, 0, 14, 0); g.fillStyle = GOLD; g.fill(); g.lineWidth = 2.5; g.stroke();
      g.beginPath(); g.arc(0, -5, 3.2, 0, TAU); g.fillStyle = '#ff3355'; g.fill();
      g.restore();
    };
    var bake3 = function (w, h, ox, oy, fn) {
      var c = document.createElement('canvas'), g;
      c.width = w * 3; c.height = h * 3;
      g = c.getContext('2d'); g.setTransform(3, 0, 0, 3, ox * 3, oy * 3);
      fn(g);
      return c;
    };
    var drawKing = function (ctx, x, y, face, s, t) {
      if (!kingImg) kingImg = bake3(70, 100, 35, 96, function (g) { paintKing(g, false); });
      ctx.save(); ctx.translate(x, y); ctx.scale(face, 1);
      ctx.drawImage(kingImg, -35, -96, 70, 100);
      // a smirk, or a flapping mouth while a word grows
      ctx.strokeStyle = '#2a0f1a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
      if (s.talk > 0 && Math.sin(t * 40) > 0) { ctx.fillStyle = '#2a0f1a'; ctx.ellipse(5, -44, 4, 3, 0, 0, TAU); ctx.fill(); }
      else { ctx.moveTo(1, -44); ctx.quadraticCurveTo(7, -43, 10, -46); ctx.stroke(); }
      ctx.restore();
    };
    // His throne: gold frame, red velvet, painted once (2 x 2 tiles).
    var drawThrone = function (ctx, g, s, pal) {
      var tl = g.tiles[0], x = tl.x * T + g.ox, y = tl.y * T + g.oy, up = s.jolt > 0 ? -Math.sin(s.jolt * Math.PI) * 7 : 0, top = tl.y;
      if (!throneImg) {
        throneImg = bake3(84, 84, 2, 2, function (c) {
          c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = '#2a0f1a';
          Art.rr(c, 8, 2, 64, 56, 16); c.fillStyle = GOLD; c.fill(); c.stroke();
          Art.rr(c, 17, 10, 46, 40, 11); c.fillStyle = '#e0284f'; c.fill(); c.stroke();
          Art.rr(c, 2, 46, 76, 16, 7); c.fillStyle = GOLD; c.fill(); c.stroke();
          c.fillStyle = '#2a0f1a'; c.fillRect(10, 62, 8, 16); c.fillRect(62, 62, 8, 16);
          c.beginPath(); c.arc(40, 30, 6, 0, TAU); c.fillStyle = GOLD; c.fill(); c.stroke();
        });
      }
      // chains up to the first solid tile above
      while (top > 0 && !g.w.grid[(top - 1) * COLS + tl.x]) top--;
      ctx.strokeStyle = pal.ink; ctx.lineWidth = 4; ctx.setLineDash(CHAIN); ctx.beginPath();
      ctx.moveTo(x + 14, y + up + 4); ctx.lineTo(x + 14, top * T); ctx.moveTo(x + 66, y + up + 4); ctx.lineTo(x + 66, top * T);
      ctx.stroke(); ctx.setLineDash(SOLID);
      ctx.drawImage(throneImg, x - 2, y + up - 2, 84, 84);
      return up;
    };

    // Checkpoint flags: white until reached, then gold and waving. The pole is
    // taller than you, so the flag still shows when you respawn in front of it.
    var drawFlag = function (ctx, w, f, i, pal, t) {
      var g = f.g, on = w.cp && w.cp.mask & (1 << i), x = f.x * T + 10, y = f.y * T + T, wav = on ? Math.sin(t * 8) * 3 : 0;
      if (g && !g.active) return;
      if (g) { x += g.ox; y += g.oy; }
      ctx.fillStyle = pal.ink; ctx.fillRect(x - 2, y - 62, 4, 62); ctx.fillRect(x - 7, y - 4, 14, 4);
      ctx.beginPath(); ctx.arc(x, y - 64, 4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 2, y - 60); ctx.quadraticCurveTo(x + 14, y - 56 + wav, x + 28, y - 51 + wav); ctx.quadraticCurveTo(x + 14, y - 46 - wav, x + 2, y - 42);
      ctx.closePath(); ctx.fillStyle = on ? GOLD : '#ffffff'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.strokeStyle = pal.ink; ctx.stroke();
    };

    var hostMsg = null, hostW = 0, pillN = -1, pillT = '', pillW = 0; // texts and widths, made once
    Art.mod({
      draw: function (ctx, w, pal, t, k) {
        var s = w.k12, px = w.p.x + PH.w / 2, i, p, x, up;
        if (!s) return;
        for (i = 0; i < s.flags.length; i++) drawFlag(ctx, w, s.flags[i], i, pal, t);
        // the last door wears his crown (drawn before the doors, so it sits on the arch)
        if (w.door && w.door.crown) {
          if (!crownImg) {
            crownImg = bake3(44, 34, 22, 26, function (g) {
              g.rotate(0.22); g.beginPath(); crownPath(g, 0, 0, 15, 0); g.fillStyle = GOLD; g.fill();
              g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = '#2a0f1a'; g.stroke();
              g.beginPath(); g.arc(0, -6, 3.2, 0, TAU); g.fillStyle = '#ff3355'; g.fill();
            });
          }
          ctx.drawImage(crownImg, w.door.x - 2, w.door.y - 27 + Math.sin(t * 3) * 1.5, 44, 34);
        }
        // the King sits on his throne's cushion (47 px down) or on his seat, facing you
        if (s.throne) {
          up = drawThrone(ctx, s.throne, s, pal);
          x = s.throne.tiles[0].x * T + s.throne.ox + T;
          drawKing(ctx, x, s.throne.tiles[0].y * T + s.throne.oy + 47 + up, px < x ? -1 : 1, s, t);
        } else if (s.king) {
          x = s.king.x * T + T / 2;
          drawKing(ctx, x, s.king.y * T + T, px < x ? -1 : 1, s, t);
        }
        for (i = 0; i < s.pieces.length; i++) {
          p = s.pieces[i];
          if (!p.wait && !p.gone && p.y < ROWS + 1) drawPiece(ctx, p, pal, t, k);
        }
      },
      hud: function (ctx, w, pal, t, ui) {
        var gm = ui.game, s = w.k12, msg = gm.msg;
        // level 97's death counter waits in the HUD's own style until it flies
        if (w.def === PILL_LEVEL && !(s && s.pillOut)) {
          if (pillN !== gm.deaths) { pillN = gm.deaths; pillT = 'السقطات: ' + pillN; ctx.font = '700 26px ' + FONT; ctx.direction = 'rtl'; pillW = ctx.measureText(pillT).width + 64; }
          Art.rr(ctx, 64, 12, pillW, 44, 22); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
          ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(90, 34, 11, 0, TAU);
          for (var i = 0; i < 6; i++) { var an = i / 6 * TAU + 0.3; ctx.moveTo(90 + Math.cos(an) * 13 + 4, 34 + Math.sin(an) * 13); ctx.arc(90 + Math.cos(an) * 13, 34 + Math.sin(an) * 13, 4, 0, TAU); }
          ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(84, 29, 3, 3); ctx.fillRect(93, 29, 3, 3);
          ui.txt(pillT, 110, 35, 26, '#ffffff', 'left');
        }
        // the King pops up beside every speech bubble in his world
        if (pal.theme !== 'royal' || !msg || gm.msgT <= 0) return;
        if (msg !== hostMsg) { hostMsg = msg; ctx.font = '700 28px ' + FONT; ctx.direction = 'rtl'; hostW = ctx.measureText(msg).width + 44; }
        if (!headImg) headImg = bake3(64, 64, 32, 92, function (g) { paintKing(g, true); });
        var pop = 1 + Math.max(0, gm.msgT - 1.5) * 0.4;
        ctx.save(); ctx.globalAlpha = Math.min(1, gm.msgT * 4);
        ctx.translate(Math.min(1236, 640 + hostW * pop / 2 + 36), 172); ctx.rotate(Math.sin(t * 5) * 0.08); ctx.scale(pop * 1.1, pop * 1.1);
        ctx.drawImage(headImg, -32, -32, 64, 64);
        ctx.restore();
      }
    });

    var burstPiece = function (p, ui, colors, n) {
      for (var k = 0; k < p.gs.length; k++) {
        p.gs[k].rects(function (rx, ry) { ui.fx.burst(rx + T / 2, ry + T / 2, { count: n, colors: colors, speed: 170, life: 0.45, size: 6, gravity: 200 }); });
      }
    };
    Art.EV.kSay = function (d, ui) {
      var p = d.p;
      if (p.kind === 'word') ui.sfx(p.style === 'heavy' ? 'kHeavy' : p.style === 'shout' ? 'kShout' : 'kBlah');
    };
    Art.EV.kStyle = function (d, ui) {
      if (d.style !== 'shout') return;
      ui.sfx('kShout'); ui.shake.add(4);
      burstPiece(d.p, ui, ['#ff4d6d', '#ffffff'], 2);
    };
    // (the end credits fade out quietly, one a second)
    Art.EV.kPop = function (d, ui) {
      var quiet = d.p.kind === 'credit';
      burstPiece(d.p, ui, ['#ffffff', ui.pal.bg2], quiet ? 1 : 3);
      if (!quiet) ui.sfx('kPop');
    };
    Art.EV.kBonk = function (d, ui) {
      d.g.rects(function (rx, ry) { ui.fx.burst(rx + T / 2, ry + T, { count: 4, colors: [GOLD, '#ffffff'], speed: 200, life: 0.4, size: 6, gravity: 500 }); });
      ui.shake.add(5); ui.sfx('kClang');
    };
    Art.EV.kFlag = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 16, colors: [GOLD, '#ffffff'], speed: 220, life: 0.7, size: 7, gravity: -60 });
      ui.sfx('kFlag');
    };
    Art.EV.kPoof = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 14, colors: ['#ffffff', ui.pal.ink], speed: 180, life: 0.5, size: 8, gravity: -80 });
      ui.sfx('poof');
    };
    Art.EV.kFakeWin = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 40, colors: CONFETTI, speed: 520, life: 1.1, size: 9, gravity: 700 });
      ui.shake.add(4); ui.sfx('win');
    };

    Art.SFX.kBlah = function (A) {
      [330, 392, 262].forEach(function (f, i) { A.tone({ freq: f, to: f * 0.8, type: 'square', dur: 0.07, vol: 0.05, delay: i * 0.08 }); });
      A.tone({ freq: 140, to: 110, type: 'triangle', dur: 0.24, vol: 0.12 });
    };
    Art.SFX.kShout = function (A) {
      A.tone({ freq: 620, to: 240, type: 'sawtooth', dur: 0.4, vol: 0.1 });
      A.noise({ dur: 0.3, vol: 0.12, filter: 2400, to: 700 });
    };
    Art.SFX.kHeavy = function (A) { A.tone({ freq: 160, to: 60, type: 'square', dur: 0.5, vol: 0.1 }); };
    Art.SFX.kPop = function (A) {
      A.tone({ freq: 620, to: 1300, type: 'sine', dur: 0.08, vol: 0.16 });
      A.noise({ dur: 0.06, vol: 0.08, filter: 5000, to: 2000 });
    };
    Art.SFX.kClang = function (A) {
      A.tone({ freq: 880, to: 830, type: 'triangle', dur: 0.4, vol: 0.12 });
      A.tone({ freq: 1320, type: 'sine', dur: 0.25, vol: 0.06 });
      A.noise({ dur: 0.05, vol: 0.12, filter: 6000, to: 3000 });
    };
    Art.SFX.kFlag = function (A) {
      [523, 659, 784, 1047].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.12, delay: i * 0.07 }); });
    };
    Art.CAUSE.shout = ['الكلام جرحك!', 'لا تقف على الصراخ!'];

    // The sneaky King skin (all 300 stars): a crooked crown with a red gem, a
    // purple cape corner behind, a curly moustache and a one-sided smirk.
    Art.SKINS.push({ id: 'sneaky', name: 'الملك الماكر', stars: 300, body: '#ffffff' });
    Art.ACC.sneaky = function (ctx, face, t, ink, top) {
      var wav = Math.sin(t * 10) * 2, ex = face * 4;
      ctx.beginPath(); ctx.moveTo(-face * 13, top + 12); ctx.lineTo(-face * 24, -4 + wav); ctx.lineTo(-face * 13, -6); ctx.closePath();
      ctx.fillStyle = ROBE; ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(ex - 1, -16); ctx.bezierCurveTo(ex - 6, -18, ex - 11, -15, ex - 10, -19);
      ctx.moveTo(ex + 1, -16); ctx.bezierCurveTo(ex + 6, -18, ex + 11, -15, ex + 10, -19);
      ctx.moveTo(ex + face * 2, -11); ctx.lineTo(ex + face * 7, -13);
      ctx.stroke();
      ctx.save(); ctx.translate(face * -2, top - 1); ctx.rotate(-face * 0.32);
      ctx.beginPath(); crownPath(ctx, 0, 0, 10, 0); ctx.fillStyle = GOLD; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -4, 2.6, 0, TAU); ctx.fillStyle = '#ff3355'; ctx.fill();
      ctx.restore();
    };
  }

  /* ================================================================ levels */
  var B = TL.B, room = B.room, pit = B.pit, hole = B.hole;
  var LEVELS = [];

  // 12-1: a spike pit far too wide to jump... but the King's words are solid.
  LEVELS.push({
    name: 'للكلام وزن',
    msg: 'أنا الملك الماكر! لن تعبر حفرتي.',
    hint: 'كلام الملك صلب! اقفز على فقاعة الكلام واعبر بسرعة.',
    map: (function () {
      var b = room();
      pit(b, 9, 20);
      return b.f(26, 8, 30, 8, '#').s(28, 7, 'U').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      // he says it again whenever the last one has popped, until you are across
      var speak = function () {
        if (L.px() > 21) return;
        var p = L.say('لن تعبر أبدًا! أبدًا!', 11, 11);
        L.when(function () { return p.gone; }, function () { L.after(1, speak); });
      };
      L.after(L.attempt ? 1 : 2.4, speak);
      L.when(function () { return L.onWord(); }, function () { L.msg('ماذا؟! لا تمشِ على كلامي!'); });
    },
    sol: 'R50 _100 RJ20 R140'
  });

  // 12-2: a tiny 'no' is no bridge. Bonk his throne and he rants for 12 tiles.
  LEVELS.push({
    name: 'أزعج الملك',
    msg: 'تريد جسرًا؟ اسألني بلطف!',
    hint: 'أزعج الملك! اضرب كرسيه برأسك ليتكلم كثيرًا.',
    map: (function () {
      var b = room();
      pit(b, 10, 23);
      return b.f(6, 9, 7, 10, 'a').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      var no = null, rant = null;
      L.throne('a');
      var nope = function () {
        if (!rant || rant.gone) no = L.say('لا.', 12, 11, { life: 2.5 });
        L.after(4, nope);
      };
      L.after(L.attempt ? 1 : 2.4, nope);
      L.onBonk(function (n) {
        if (rant && !rant.gone) { L.msg('كفى! كفى!'); return; }
        L.unsay(no);
        rant = L.say('توقف عن ضرب كرسيّي يا مزعج!!!', 11, 11);
        if (n === 1) L.msg('آي! كرسيّي!');
      });
    },
    sol: 'R30 _20 J12 R26 RJ20 R140'
  });

  // 12-3: three heavy words fall one after another and stack into stairs. He runs
  // out of breath: each word is a tile shorter and all end at the ledge, so the
  // stairs are solid (no hole under a step to get shut in by the wall).
  LEVELS.push({
    name: 'كلام ثقيل',
    msg: 'الباب فوق؟ اقفز إذن... هاها!',
    hint: 'ابتعد عن ظل الكلمة، وانتظر الكلمات الثلاث، ثم اصعد عليها.',
    map: (function () {
      var b = room();
      return b.f(25, 9, 30, 12, '#').f(1, 7, 4, 7, '#').s(2, 6, 'U').s(2, 12, 'P').s(28, 8, 'D').done();
    })(),
    script: function (L) {
      L.onX(17, function () {
        L.msg('اسقط! اسقط! اسقط!');
        ['اسقطططططط!', 'اسقطططط!', 'اسقط!'].forEach(function (text, k) {
          L.after(k * 1.5, function () { L.say(text, 20 + k, 5, { style: 'heavy' }); });
        });
      });
    },
    sol: 'R120 _300 R10 RJ20 R10 RJ20 R10 RJ20 R10 RJ20 R60'
  });

  // 12-4: three chatty bubbles over a hole. Land on one and the next one shouts.
  LEVELS.push({
    name: 'لا تصرخ!',
    msg: 'بلا بلا بلا... أنا أحب الكلام!',
    hint: 'الفقاعة المدوّرة آمنة، والمسنّنة تؤذي! انتظر حتى يهدأ.',
    map: (function () {
      var b = room();
      hole(b, 8, 24);
      return b.f(27, 7, 30, 7, '#').s(28, 6, 'U').s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      var spots = [9, 14, 19].map(function (x) { return L.say('بلا بلا', x, 11, { life: 0 }); });
      var last = null, from = [0, 0, 0], until = [0, 0, 0];
      L.world.ticks.push(function () {
        var t = L.t(), k, on;
        for (k = 0; k < 3; k++) {
          // landing on a bubble (not hopping in place) makes the next one shout for 1.5 s
          if (L.onWord(spots[k]) && last !== k) {
            last = k;
            if (k < 2) { from[k + 1] = t + 0.2; until[k + 1] = t + 1.7; }
          }
          on = t >= from[k] && t < until[k];
          if (on !== (spots[k].style === 'shout')) L.style(spots[k], on ? 'shout' : 'say', on ? 'آآآآه!' : 'بلا بلا');
        }
        if (L.grounded() && !L.onWord()) last = null;
      });
    },
    sol: 'R46 RJ20 _100 RJ20 R8 _100 RJ20 R8 _60 RJ20 R100'
  });

  // 12-5: the title card stays in the room... then falls across the spike pit
  // (too wide to jump), and the big name crumbles letter by letter under your feet.
  LEVELS.push({
    name: 'العنوان الساقط',
    noIntro: true,
    msg: 'عنوان جميل، أليس كذلك؟',
    hint: 'العنوان سيسقط! ارجع للخلف، ثم اركض فوقه بلا توقف.',
    map: (function () {
      var b = room();
      pit(b, 13, 18);
      return b.f(27, 7, 30, 7, '#').s(29, 6, 'U').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      var card = L.card(12, 7, 8);
      L.onX(6, function () { L.fall(card, 0.6, true); L.msg('أوه! العنوان ثقيل!'); });
      L.when(function () { return L.onWord(card) && card.landed; }, function () { L.msg('انزل عن اسمي!'); });
    },
    sol: 'R40 _80 R16 RJ20 R200'
  });

  // 12-6: for once the hint bar is there from the start... and it lies.
  LEVELS.push({
    name: 'التلميح الكاذب',
    msg: 'اقرأ التلميح يا بطل!',
    fakeHint: 'الباب الأقرب هو الحقيقي',
    hint: 'التلميح الأول كان كذبة! الباب البعيد هو الحقيقي... صدّقني هذه المرة.',
    map: room().f(27, 7, 30, 7, '#').s(29, 6, 'U').s(2, 12, 'P').s(12, 12, 'E').s(26, 12, 'D').done(),
    script: function (L) { if (L.attempt === 1) L.msg('هاها! صدّقت التلميح؟'); },
    sol: 'R64 RJ20 R200'
  });

  // 12-7: the death counter leaves the HUD to be a bridge: 1 tile longer per death.
  LEVELS.push(PILL_LEVEL = {
    name: 'عدّاد السقطات',
    noPill: true,
    msg: 'أين عدّاد سقطاتك؟ هممم...',
    hint: 'كل سقطة تطوّل الجسر! أو اقفز من آخره قفزة كاملة.',
    map: (function () {
      var b = room();
      pit(b, 10, 15);
      return b.f(20, 7, 24, 7, '#').s(22, 6, 'U').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) {
      // in the first life it waits for the title card to go, so the opening line is
      // read and the counter's flight is seen (a sprinter falls in once first)
      L.when(function () { return L.px() >= 3.5 && (L.attempt || L.t() > 2.2); }, function () {
        L.pill(10, 13); L.msg('سقطاتك تبني الجسر!');
      });
    },
    sol: 'R54 _120 R26 RJ20 R100'
  });

  // 12-8: level 1 again (orange, same title)... but its floor remembers you.
  LEVELS.push({
    name: 'المرحلة 1',
    pal: 0, hudName: 'المرحلة 1: مجرد ممر', card: ['المرحلة 1', 'مجرد ممر'],
    msg: 'مرحلة سهلة جدًا... أليس كذلك؟',
    hint: 'لا تقفز فوق الشوكة! انتظرها حتى تختفي ثم امشِ.',
    map: room().f(22, 13, 26, 17, 'a').s(2, 12, 'P').s(21, 12, '1').s(27, 12, 'D').done(),
    script: function (L) {
      var sp = L.sp(1);
      L.onX(18.6, function () {
        sp.pop();
        L.after(1.5, function () { sp.hide(); L.msg('أمزح!'); });
      });
      // the floor past the spike drops as soon as you are over it, but only while
      // the spike is out (so a hop off it cannot escape)
      L.when(function () { return L.px() > 21.5 && sp.isOut(); }, function () { L.g('a').drop(0); L.msg('المرحلة تتذكرك!'); });
    },
    sol: 'R138 _120 R200'
  });

  // 12-9: the fake door plays the win screen... then the heavy panel falls on you.
  // Once it has landed, its button, body and stars are stairs to the real door.
  LEVELS.push({
    name: 'أحسنت! (ليس حقًا)',
    msg: 'الباب قريب جدًا هذه المرة!',
    hint: 'شاشة الفوز مزيفة! ارجع للخلف، ثم اصعد عليها إلى الباب الحقيقي.',
    map: room().f(26, 7, 30, 12, '#').f(1, 7, 4, 7, '#').s(2, 6, 'U').s(2, 12, 'P').s(24, 12, 'E').s(28, 6, 'D').done(),
    script: function (L) {
      var e = L.fakes[0], panel = null;
      e.onTouch = function () {
        if (panel) return;
        e.bit = true; // the fake door shows its silly face
        panel = L.fakeWin(16, 4);
        // the door vanishes as the panel drops, so it is never painted over the panel
        L.after(1.2, function () { L.msg('هاها! صدّقت؟'); L.fall(panel, 0.5); L.poof(e); });
      };
    },
    sol: 'R175 L80 _60 R10 RJ20 R10 RJ20 R14 RJ20 R10 RJ20 R60'
  });

  // 12-10: the King's last stand, in three phases with real checkpoints: his
  // bubbles over the hole, his rants up to the balcony, then the end credits.
  LEVELS.push({
    name: 'النهاية؟',
    msg: 'المرحلة الأخيرة... حقًا هذه المرة!',
    winMsg: 'مستحيل! هزمتني 100 مرة!',
    hint: 'قف على الفقاعات المدوّرة، اضرب الكرسي 3 مرات، ولا تثق بسطر «شكرًا».',
    map: (function () {
      var b = room(2, 13);
      b.f(1, 13, 9, 17, 'b');
      hole(b, 10, 20);
      b.f(21, 11, 23, 12, 'c').f(21, 13, 30, 17, 'c');
      b.f(1, 5, 4, 6, '#').f(25, 5, 30, 6, '#').f(27, 9, 28, 10, 'a');
      return b.s(2, 4, 'C').s(22, 10, 'C').s(7, 12, '1').s(2, 12, 'P').s(26, 4, 'D').done();
    })(),
    script: function (L) {
      var ph = L.cp(), said = [];
      var credits = function () {
        L.credits([
          { text: 'شكرًا لأنك لعبت!', fake: true }, 'المراحل الماكرة', 'فكرة: الملك الماكر', 'الفخاخ: الملك الماكر',
          'الأبواب: الملك الماكر', 'الرسم: الملك الماكر', 'النهاية؟'
        ], { cols: [[6, 11], [13, 18], [20, 24]], speed: 2, every: 1, top: 3, pre: 5 });
      };
      L.throne('a');
      L.door.crown = true;
      if (ph === 0) {
        // (a sprinter in the first life skips the quip: the opening line stays up)
        L.onX(4.6, function () { L.sp(1).pop(); if (L.attempt || L.t() > 3) L.msg('تذكرها؟'); });
        said.push(L.say('بلا بلا', 11, 11, { life: 0 }), L.say('آه', 15, 11, { style: 'shout', life: 0 }), L.say('بلا بلا', 17, 11, { life: 0 }));
        L.when(function () { return L.cp() >= 1; }, function () {
          said.forEach(L.unsay); said.length = 0;
          L.msg('نقطة حفظ حقيقية. أعدك!');
        });
      }
      if (ph < 2) {
        // the heavy word lands at cols 25-27, on or beside you: col 28 under the
        // throne stays free, so from the right any jump there is capped by the
        // throne and steps onto the word (no slot too low to jump into)
        L.onBonk(function (n) {
          if (n === 1) said.push(L.say('توقف! توقف!', 15, 9, { life: 0 }));
          else if (n === 2) said.push(L.say('كفى! كفى!', 10, 7, { life: 0 }), L.say('اسقط!', 25, 11, { style: 'heavy' }));
          else if (n === 3) { said.push(L.say('يا مزعج!!', 5, 5, { life: 0 })); L.msg('حسنًا! حسنًا! اصعد!'); }
          else L.msg('كفى! كرسيّي!');
        });
        // the end: his words pop, the stage falls away and the credits roll
        L.when(function () { return L.cp() >= 2; }, function () {
          said.forEach(L.unsay);
          L.msg('حسنًا... أنت الفائز.');
          L.g('b').drop(0.4); L.g('c').drop(0.4);
          L.after(0.6, credits);
        });
      } else {
        L.g('b').active = false; L.g('c').active = false;
        L.after(0.5, credits);
      }
      // (only in the last phase: a full jump on the first flag's ledge reaches row 8 too)
      L.when(function () { return L.cp() >= 2 && L.px() > 21 && L.py() < 8; }, function () {
        L.doorTo(L.door, 29, 4, 9, 0, function () { L.msg('لا... أنا متعب. ادخل.'); });
      });
    },
    sol: 'R26 RJ20 R4 _10 RJ20 R4 _7 R14 RJ20 R10 _7 R76 _7 J12 _19 J12 _7 L30 _30 RJ12 R26 _7 J8 _7 L14 LJ20 L10 _11 LJ20 L14 _7 L20 LJ20 L10 _7 L20 LJ20 L10 _7 L60 _154 R60 RJ20 R10 _20 R18 RJ20 R16 _40 R10 RJ20 R60'
  });

  root.TrollLevels.addWorld({ name: 'عالم الملك الماكر', n: LEVELS.length, theme: 'royal', bg: '#ff6b7a', bg2: '#ff8892', ink: '#2a0f1a', ink2: '#4b2434', accent: '#ffffff' }, LEVELS);
})(typeof window !== 'undefined' ? window : globalThis);
