/*
 * Sneaky Levels — world 7 (levels 41-50): keys and locks.
 * Registers its mechanic with the engine (TrollEngine.mod) and, in the
 * browser, with the drawing (TrollArt), then adds its world with TrollLevels.addWorld.
 *
 * Map characters:
 *   K  a key: it bobs in its tile, and touching it picks it up
 *   %  lock blocks: touching '%' tiles form one lock. With empty hands it is
 *      ground; touch it (side, top or head) while holding a key and it poofs,
 *      using up the key. A key that is moving opens a lock it touches by itself.
 *   L  a padlocked exit: it needs `need` keys (default 1). With fewer it rattles
 *      'مقفول!' and you pass in front of it; with enough it uses them and you win.
 * Script API, for levels with at least one K, L or % in their map (keys are
 * numbered in reading order: top row first, left to right):
 *   L.key(i)                              the i-th key of the map
 *   L.keyTo(k, tx, ty, speed, delay, then, arc)   slide a key to tile (tx, ty) at
 *                                         speed tiles/s, hopping arc tiles high
 *   L.keyThrow(k, vx, vy)                 throw a key (tiles/s): it falls, lands and
 *                                         slides on along the floor until a wall stops it
 *   L.keyFake(k)                          the key bites (dies 'key')
 *   L.keyIn(k, ch)                        freeze the key in lettered group ch (an ice
 *                                         cube): it rides it and pops out once the
 *                                         group has fallen more than 2 tiles or is gone,
 *                                         lost if spikes are under it, else floating
 *                                         up at the height it was frozen at ('keypop')
 *   L.onKey(fn)                           fn(k) when you pick up key k
 *   L.held(), L.give(n)                   keys in your hands
 *   L.need(d, n)                          a padlocked door needs n keys; L.need(g, 1)
 *                                         marks lock g as on the way to the exit
 *   L.lock(ch)                            lettered group ch becomes a lock
 * Lock groups carry g.lock, so other plug-ins can tell them apart.
 * A lock under your feet that a key opens drops you at once (no coyote jump).
 * The HUD shows a slot for each key the way to the exit needs (its padlock plus
 * the locks marked on the way). When the keys you hold or can still get fall short
 * of that, the host says so once a life ('nokeys') and points at R.
 * A key given k.back = s seconds comes back home that long after it is lost
 * (used up by a lock while moving, on spikes or off the screen): never into your
 * hands, frozen again if it lived in a group (once that group is back), and the
 * lock it used up closes again.
 */
(function (root) {
  'use strict';
  var E = root.TrollEngine, LV = root.TrollLevels, Art = root.TrollArt;
  var T = E.T, COLS = E.COLS, ROWS = E.ROWS, DT = E.DT, PH = E.PH, overlap = E.overlap;
  var GOLD = '#ffd23f', TAU = Math.PI * 2, NB = [1, 0, -1, 0, 0, 1, 0, -1];
  var NOKEYS = 'المفاتيح لا تكفي! اضغط R';

  /* ================================================================ engine */
  // Keys, locks and padlocks met while a map is parsed; init hands them to the world.
  var found = null;

  function newKey(x, y) {
    return {
      x: x * T, y: y * T, hx: x * T, hy: y * T, taken: false, gone: false, fake: false, bit: false,
      m: null, fly: false, vx: 0, vy: 0, back: 0, bt: 0, inside: null, cube: null, oy0: 0, opened: null
    };
  }

  // The '%' tiles touching (x, y) in the raw map become one lock group.
  function floodLock(w, x, y) {
    var map = w.def.map, g = w.newGroup('%' + w.groups.length), todo = [x, y], cx, cy, nx, ny, i;
    g.lock = true;
    w.owner[y * COLS + x] = g;
    while (todo.length) {
      cy = todo.pop(); cx = todo.pop();
      g.tiles.push({ x: cx, y: cy });
      for (i = 0; i < 8; i += 2) {
        nx = cx + NB[i]; ny = cy + NB[i + 1];
        if ((map[ny] || '')[nx] !== '%' || w.owner[ny * COLS + nx]) continue;
        w.owner[ny * COLS + nx] = g; todo.push(nx, ny);
      }
    }
    return g;
  }

  // A padlocked door is a fake door to the core, so it can never win before
  // the key check; made after the map is parsed, so the ground under it is known.
  function padlock(w, x, y) {
    var d = {
      x: x * T, y: y * T + T - 60, w: 40, h: 60, fake: true, hang: false, g: w.owner[(y + 1) * COLS + x] || null,
      m: null, onTouch: null, bx: x, by: y + 1, anim: 0, pad: true, need: 1, lt: -1
    };
    d.onTouch = function () { touchPad(w, d); };
    return d;
  }

  // Called by the core every frame you overlap a locked padlocked door.
  function touchPad(w, d) {
    if (w.held >= d.need) {
      w.held -= d.need; d.fake = false; // a real door now: the core wins on the next frame
      w.emit('unlock', { d: d });
      return;
    }
    if (w.t - d.lt > 0.1) w.emit('locked', { d: d, out: w.keysOut }); // once per touch
    d.lt = w.t;
  }

  // Keys the way to the exit still needs: its padlock, plus the closed locks marked on the way.
  function needed(w) {
    var n = 0, i, d, g;
    for (i = 0; i < w.doors.length; i++) { d = w.doors[i]; if (d.pad && d.fake && d.need > n) n = d.need; }
    for (i = 0; i < w.locks.length; i++) { g = w.locks[i]; if (g.need && g.active) n += g.need; }
    return n;
  }
  // Keys in your hands, plus the real ones still to pick up (a lost key that comes back counts).
  function keysLeft(w) {
    var n = w.held, i, k;
    for (i = 0; i < w.keys.length; i++) { k = w.keys[i]; if (!k.taken && !k.fake && (!k.gone || k.back)) n++; }
    return n;
  }
  // Called whenever a key is used up: can the level still be won? (after() tells you.)
  function checkKeys(w) {
    if (!w.keysOut && keysLeft(w) < needed(w)) w.keysOut = true;
  }

  // The first closed lock overlapping the box, or null.
  function touchLock(w, x, y, wd, h) {
    for (var i = 0; i < w.locks.length; i++) {
      var g = w.locks[i];
      if (!g.active || g.fake) continue;
      for (var q = 0; q < g.tiles.length; q++) {
        if (overlap(x, y, wd, h, g.tiles[q].x * T + g.ox, g.tiles[q].y * T + g.oy, T, T)) return g;
      }
    }
    return null;
  }
  function open(w, g) { g.hide(); w.emit('unlock', { g: g }); checkKeys(w); }

  function lose(w, k) {
    k.gone = true; k.m = null; k.fly = false; k.bt = k.back;
    w.emit('keylost', { k: k });
    checkKeys(w);
  }
  // A lost key's time is up. It waits while you are within a tile of its spot (or
  // its group is away), so it never lands in your hands.
  function home(w, k) {
    var g = k.cube, p = w.p;
    if (g && (!g.active || g.ox || g.oy) || overlap(p.x, p.y, PH.w, PH.h, k.hx - T, k.hy - T, 3 * T, 3 * T)) { k.bt = DT; return; }
    k.gone = false; k.x = k.hx; k.y = k.hy; k.vx = k.vy = 0;
    if (g) { k.inside = g; k.oy0 = 0; }
    if (k.opened) { k.opened.show(); k.opened = null; }
    w.emit('keyback', { k: k });
  }

  // Moves a key to (tx, ty) px at speed px/s along a straight line, lifted by a
  // parabola `arc` px high at the middle.
  function moveKey(k, tx, ty, speed, delay, then, arc) {
    var dx = tx - k.x, dy = ty - k.y;
    k.fly = false;
    k.m = { x0: k.x, y0: k.y, tx: tx, ty: ty, s: 0, v: speed / (Math.sqrt(dx * dx + dy * dy) || 1), delay: delay || 0, then: then || null, arc: arc || 0 };
  }
  function slide(k) {
    var m = k.m;
    if (m.delay > 0) { m.delay -= DT; return; }
    m.s = Math.min(1, m.s + m.v * DT);
    k.x = m.x0 + (m.tx - m.x0) * m.s;
    k.y = m.y0 + (m.ty - m.y0) * m.s - m.arc * 4 * m.s * (1 - m.s);
    if (m.s === 1) { k.m = null; if (m.then) m.then(); }
  }

  // A key frozen in a group (an ice cube) rides it and can't be taken. Once the group
  // has fallen more than 2 tiles, or is gone, it pops out: onto the spikes under it if
  // there are any (lost), else it hops up, out of the hole, and floats.
  function ride(w, k) {
    var g = k.inside;
    k.x = k.hx + g.ox; k.y = k.hy + g.oy;
    if (g.active && g.oy - k.oy0 <= 2 * T) return;
    k.inside = null;
    if (spikesUnder(w, k)) { lose(w, k); return; }
    moveKey(k, k.x, Math.min(k.y - T, k.hy + k.oy0), 5 * T);
    w.emit('keypop', { k: k });
  }

  // Solid for keys: fixed ground and groups resting in place (an opened lock is not).
  function solidAt(w, x, y) {
    if (x < 0 || x >= COLS) return true;
    if (y < 0 || y >= ROWS) return false;
    var g = w.owner[y * COLS + x];
    return !!w.grid[y * COLS + x] || !!g && g.active && !g.fake && !g.ox && !g.oy;
  }

  // A thrown key (box x+6..x+34, y+4..y+40) falls, lands and slides until a wall stops it.
  function fly(w, k) {
    var c, r, hit;
    k.vy = Math.min(k.vy + PH.g * DT, PH.maxFall);
    if (k.vx) {
      var nx = k.x + k.vx * DT;
      c = Math.floor((k.vx > 0 ? nx + 33.99 : nx + 6) / T);
      for (r = Math.floor((k.y + 4) / T), hit = false; r <= Math.floor((k.y + 39.99) / T); r++) if (solidAt(w, c, r)) hit = true;
      if (hit) { k.x = k.vx > 0 ? c * T - 34 : (c + 1) * T - 6; k.vx = 0; } else k.x = nx;
    }
    var ny = k.y + k.vy * DT;
    r = Math.floor((k.vy > 0 ? ny + 39.99 : ny + 4) / T);
    for (c = Math.floor((k.x + 6) / T), hit = false; c <= Math.floor((k.x + 33.99) / T); c++) if (solidAt(w, c, r)) hit = true;
    if (!hit) { k.y = ny; return; }
    if (k.vy > 0) { k.y = r * T - 40; if (!k.vx) k.fly = false; } else k.y = (r + 1) * T - 4;
    k.vy = 0;
  }

  function onSpikes(w, k) {
    for (var i = 0; i < w.spikes.length; i++) {
      var s = w.spikes[i];
      if (s.out < 0.5 || (s.g && !s.g.active)) continue;
      if (overlap(k.x + 8, k.y + 8, 24, 24, s.x + (s.g ? s.g.ox : 0) + 8, s.y + (s.g ? s.g.oy : 0) + 8, 24, 24)) return true;
    }
    return false;
  }
  // Are spikes the first thing under the key's middle?
  function spikesUnder(w, k) {
    var c = Math.floor((k.x + 20) / T), r, i, s;
    for (r = Math.floor((k.y + 20) / T); r < ROWS && !solidAt(w, c, r); r++) {
      for (i = 0; i < w.spikes.length; i++) {
        s = w.spikes[i];
        if (!s.g && s.out >= 0.5 && s.x === c * T && s.y === r * T) return true;
      }
    }
    return false;
  }

  E.mod({
    chars: ['K', 'L', '%'],
    cell: function (w, ch, x, y) {
      var f = found || (found = { keys: [], locks: [], pads: [] });
      if (ch === 'K') f.keys.push(newKey(x, y));
      else if (ch === 'L') f.pads.push(x, y);
      else if (!w.owner[y * COLS + x]) f.locks.push(floodLock(w, x, y));
    },
    // Fresh state on every (re)start of a level with K, L or % in its map. Other
    // levels keep w.keys undefined, so every hook below returns at once there.
    init: function (w) {
      var f = found;
      if (!f) return;
      found = null;
      w.keys = f.keys; w.locks = f.locks; w.held = 0; w.keyFn = null; w.keysOut = false; w.outT = 0;
      for (var i = 0; i < f.pads.length; i += 2) w.doors.push(padlock(w, f.pads[i], f.pads[i + 1]));
    },
    api: function (L, w) {
      if (!w.keys) return;
      L.key = function (i) { return w.keys[i]; };
      L.keyTo = function (k, tx, ty, speed, delay, then, arc) { moveKey(k, tx * T, ty * T, speed * T, delay, then, (arc || 0) * T); };
      L.keyThrow = function (k, vx, vy) { k.m = null; k.fly = true; k.vx = vx * T; k.vy = (vy || 0) * T; };
      L.keyFake = function (k) { k.fake = true; return k; };
      // the key moves into the first tile of group ch, which becomes its home
      L.keyIn = function (k, ch) {
        var g = w.gmap[ch];
        k.inside = k.cube = g; k.oy0 = g.oy;
        k.x = g.tiles[0].x * T + g.ox; k.y = g.tiles[0].y * T + g.oy; k.hx = k.x - g.ox; k.hy = k.y - g.oy;
      };
      L.onKey = function (fn) { w.keyFn = fn; };
      L.held = function () { return w.held; };
      L.give = function (n) { w.held += n; };
      L.need = function (d, n) { d.need = n; };
      L.lock = function (ch) { var g = w.gmap[ch]; g.lock = true; w.locks.push(g); return g; };
    },
    step: function (w) {
      var ks = w.keys, g;
      if (!ks) return;
      for (var i = 0; i < ks.length; i++) {
        var k = ks[i];
        if (k.taken) continue;
        if (k.gone) { if (k.bt > 0 && (k.bt -= DT) <= 0) home(w, k); continue; }
        if (k.inside) { ride(w, k); continue; }
        if (k.m) slide(k); else if (k.fly) fly(w, k); else continue;
        // a moving key opens the first lock it touches and is used up
        if ((g = touchLock(w, k.x + 5, k.y + 3, 30, 38))) { open(w, g); if (k.back) k.opened = g; lose(w, k); }
        else if (k.y > E.H || onSpikes(w, k)) lose(w, k);
      }
    },
    after: function (w) {
      var ks = w.keys, p = w.p, i, k, g;
      if (!ks) return;
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        if (k.taken || k.gone || k.inside || !overlap(p.x, p.y, PH.w, PH.h, k.x + 8, k.y + 8, 24, 24)) continue;
        if (k.fake) { k.bit = true; w.emit('bite', { k: k }); w.die('key'); return; }
        k.taken = true; k.m = null; k.fly = false; w.held++;
        w.emit('key', { k: k });
        if (w.keyFn) w.keyFn(k);
      }
      // each key in your hands opens one lock you touch (the box grown by 1 px); one
      // under your feet drops you at once, with no coyote jump off it
      while (w.held > 0 && (g = touchLock(w, p.x - 1, p.y - 1, PH.w + 2, PH.h + 2))) {
        w.held--; open(w, g);
        if (p.ground === g) { p.onGround = false; p.ground = null; p.coy = 0; }
      }
      // out of keys: the host says so once you have stood for 0.4 s, so not in the
      // moment before you fall to your death
      if (w.keysOut && w.outT >= 0) {
        w.outT = p.onGround ? w.outT + DT : 0;
        if (w.outT > 0.4) { w.outT = -1; w.emit('nokeys', {}); }
      }
    }
  });

  /* ================================================================ drawing */
  // (Only called in the browser, where TrollArt exists.) Keys, keyholes and padlocks
  // are painted once per ink colour into small sprites and stamped with drawImage,
  // so even the busiest level costs only a few dozen canvas calls a frame.

  var SS = 3, SETS = {}; // sprite pixels per logical pixel; sprite sets by ink colour

  function blob(g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }

  // A key lying flat around (0, 0): the bow (a ring) left, two teeth right. It is
  // stroked thick, then filled, so its parts read as one outlined shape.
  function paintKey(g, fill, ink) {
    g.beginPath();
    g.moveTo(0.5, 0); g.arc(-8, 0, 8.5, 0, TAU);
    g.rect(-1, -3, 18, 6); g.rect(9, 2, 3.5, 6); g.rect(14, 2, 3, 4.5);
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = ink; g.stroke();
    g.fillStyle = fill; g.fill();
    g.beginPath(); g.arc(-8, 0, 3.4, 0, TAU); g.fillStyle = ink; g.fill();
  }
  // An empty HUD slot: a white key with its bow hole cut out.
  function paintGhost(g) {
    paintKey(g, '#ffffff', '#ffffff');
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(-8, 0, 3.4, 0, TAU); g.fill();
  }
  // A white four-point sparkle, 10 px in radius.
  function paintSpark(g) {
    g.beginPath();
    g.moveTo(0, -10); g.quadraticCurveTo(0, 0, 10, 0); g.quadraticCurveTo(0, 0, 0, 10);
    g.quadraticCurveTo(0, 0, -10, 0); g.quadraticCurveTo(0, 0, 0, -10);
    g.fillStyle = '#ffffff'; g.fill();
  }
  // The gold keyhole plate shown on every tile of a closed lock.
  function paintHole(g, ink) {
    g.beginPath(); blob(g, 0, 0, 11); g.fillStyle = GOLD; g.fill();
    g.beginPath(); blob(g, 0, -3, 4);
    g.moveTo(-2, -1); g.lineTo(2, -1); g.lineTo(3, 7); g.lineTo(-3, 7); g.closePath();
    g.fillStyle = ink; g.fill();
  }
  // The padlock on a locked exit, with one keyhole per key it needs.
  function paintPad(g, ink, n) {
    var bw = 12 + n * 10, i, kx;
    g.translate(0, 3);
    g.beginPath(); g.moveTo(-6, -4); g.lineTo(-6, -10); g.arc(0, -10, 6, Math.PI, 0); g.lineTo(6, -4);
    g.lineCap = 'round'; g.lineWidth = 6; g.strokeStyle = ink; g.stroke();
    g.lineWidth = 2.5; g.strokeStyle = '#e9ecf5'; g.stroke();
    Art.rr(g, -bw / 2, -5, bw, 17, 4);
    g.fillStyle = GOLD; g.fill(); g.lineWidth = 3; g.strokeStyle = ink; g.stroke();
    g.beginPath();
    for (i = 0; i < n; i++) { kx = (i - (n - 1) / 2) * 10; blob(g, kx, 1.5, 2.4); g.rect(kx - 1, 2, 2, 5); }
    g.fillStyle = ink; g.fill();
  }
  // قفّول, the host: a grumpy padlock with frowning brows.
  function paintHost(g, ink) {
    g.beginPath(); g.moveTo(-11, -6); g.lineTo(-11, -14); g.arc(0, -14, 11, Math.PI, 0); g.lineTo(11, -6);
    g.lineCap = 'round'; g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
    g.lineWidth = 3.5; g.strokeStyle = '#e9ecf5'; g.stroke();
    Art.rr(g, -20, -8, 40, 32, 9); g.fillStyle = GOLD; g.fill(); g.lineWidth = 4; g.strokeStyle = ink; g.stroke();
    g.beginPath(); g.moveTo(-12, 0); g.lineTo(-4, 3); g.moveTo(12, 0); g.lineTo(4, 3); g.moveTo(-6, 17); g.quadraticCurveTo(0, 11, 6, 17);
    g.lineWidth = 3; g.stroke();
    g.beginPath(); blob(g, -7, 8, 2.6); blob(g, 7, 8, 2.6); g.fillStyle = ink; g.fill();
  }

  // A w x h sprite (in logical px), painted around its centre.
  function makeSprite(w, h, paint, a, b) {
    var c = document.createElement('canvas'), g;
    c.width = w * SS; c.height = h * SS;
    g = c.getContext('2d');
    g.scale(SS, SS); g.translate(w / 2, h / 2);
    paint(g, a, b);
    return c;
  }
  function sprites(ink) {
    return SETS[ink] || (SETS[ink] = {
      key: makeSprite(44, 28, paintKey, GOLD, ink), ghost: makeSprite(44, 28, paintGhost),
      spark: makeSprite(20, 20, paintSpark), hole: makeSprite(24, 24, paintHole, ink),
      host: makeSprite(48, 60, paintHost, ink), pads: [null]
    });
  }
  function padSprite(S, ink, n) { return S.pads[n] || (S.pads[n] = makeSprite(18 + n * 10, 40, paintPad, ink, n)); }

  // Stamps sprite c centred on (x, y), scaled by s and turned by rot.
  function stamp(ctx, c, x, y, s, rot) {
    var w = c.width / SS * s, h = c.height / SS * s;
    if (!rot) { ctx.drawImage(c, x - w / 2, y - h / 2, w, h); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.drawImage(c, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Free keys bob in their tile; a fake one is a little too shiny.
  function drawKeys(ctx, w, S, ink, t) {
    var i, k, cx, cy, s;
    for (i = 0; i < w.keys.length; i++) {
      k = w.keys[i];
      if (k.taken || k.gone) continue;
      cx = k.x + 20; cy = k.y + 20;
      if (k.bit) { drawBite(ctx, S, cx, cy, ink); continue; }
      if (k.m || k.fly) { stamp(ctx, S.key, cx, cy, 1, Math.sin(t * 30) * 0.25); continue; }
      if (k.inside) { drawFrozen(ctx, S, k, t); continue; }
      cy += Math.sin(t * 3 + k.hx * 0.07) * 3;
      stamp(ctx, S.key, cx, cy, 1, 0);
      s = Math.sin(t * (k.fake ? 6 : 3) + k.hx);
      stamp(ctx, S.spark, cx - 12, cy - 11, (k.fake ? 0.6 : 0.4) + s * 0.2, 0);
      if (k.fake) stamp(ctx, S.spark, cx + 13, cy + 8, 0.3 - s * 0.2, 0);
    }
  }
  // A key frozen in an ice cube keeps still: a little smaller and tilted, under a
  // frosty glaze with a shine, so it reads as inside the ice, not on it.
  function drawFrozen(ctx, S, k, t) {
    var x = k.x, y = k.y;
    stamp(ctx, S.key, x + 20, y + 21, 0.8, -0.5);
    Art.rr(ctx, x + 5, y + 5, 30, 30, 6);
    ctx.fillStyle = 'rgba(223,247,255,0.45)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 10, y + 31); ctx.lineTo(x + 20, y + 19); ctx.moveTo(x + 24, y + 31); ctx.lineTo(x + 29, y + 25);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
    stamp(ctx, S.spark, x + 29, y + 11, 0.4 + Math.sin(t * 3 + k.hx) * 0.2, 0);
  }
  // The fake key that bit: big, with a mouthful of teeth and two eyes on its bow.
  function drawBite(ctx, S, cx, cy, ink) {
    var s;
    stamp(ctx, S.key, cx + 4, cy, 1.5, 0);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx - 8, cy - 1, 8, 0.05 * Math.PI, 0.95 * Math.PI); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    for (s = -6; s <= 2; s += 4) { ctx.moveTo(cx - 8 + s, cy); ctx.lineTo(cx - 6 + s, cy + 4); ctx.lineTo(cx - 4 + s, cy); }
    ctx.fill();
    ctx.fillStyle = ink; ctx.beginPath(); blob(ctx, cx - 13, cy - 7, 2.2); blob(ctx, cx - 3, cy - 7, 2.2); ctx.fill();
  }

  // A keyhole plate on every tile of a closed lock (its ground look stays underneath).
  function drawLocks(ctx, w, S) {
    var i, q, g;
    for (i = 0; i < w.locks.length; i++) {
      g = w.locks[i];
      if (!g.active) continue;
      for (q = 0; q < g.tiles.length; q++) ctx.drawImage(S.hole, g.tiles[q].x * T + g.ox + 8, g.tiles[q].y * T + g.oy + 10, 24, 24);
    }
  }

  // The padlock on a locked exit rattles for a moment when touched.
  function drawPadlock(ctx, d, w, S, ink, t) {
    var rat = Math.max(0, 1 - (w.t - d.lt) / 0.45);
    stamp(ctx, padSprite(S, ink, d.need), d.x + (d.g ? d.g.ox : 0) + 20, d.y + (d.g ? d.g.oy : 0) + 31, 1, rat && Math.sin(t * 50) * 0.25 * rat);
  }

  // The keys you hold hang behind you on a string, each following the one before.
  // They ease at the same pace however often frames are drawn (t is in seconds).
  var trail = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], trailW = null, trailT = 0;
  function drawCarried(ctx, w, S, ink, t) {
    var p = w.p, n = Math.min(w.held, 3), i, q, hx, hy, tx, ty, k;
    if (!n || w.state !== 'play') { trailW = null; return; }
    hx = p.x + PH.w / 2 - p.face * 9; hy = p.y + 10;
    k = trailW === w && t - trailT < 0.25 ? 1 - Math.pow(0.7, (t - trailT) * 60) : 1;
    trailW = w; trailT = t;
    ctx.beginPath(); ctx.moveTo(hx, hy);
    for (i = 0, tx = hx, ty = hy; i < n; i++) {
      q = trail[i];
      q.x += (tx - p.face * 20 - q.x) * k; q.y += (ty + 2 + Math.sin(t * 5 + i * 2) * 2 - q.y) * k;
      ctx.lineTo(q.x, q.y);
      tx = q.x; ty = q.y;
    }
    ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
    for (i = 0; i < n; i++) stamp(ctx, S.key, trail[i].x, trail[i].y + 11, 0.7, Math.PI / 2 + Math.sin(t * 5 + i * 2) * 0.2);
  }

  // HUD: a slot for each key the way to the exit needs (or you hold), under the death counter.
  function drawSlots(ctx, w, S, ui) {
    var n = Math.max(1, needed(w), w.held), i;
    ui.rr(ctx, 64, 62, 22 + n * 36, 40, 20); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    for (i = 0; i < n; i++) {
      ctx.globalAlpha = i < w.held ? 1 : 0.35;
      stamp(ctx, i < w.held ? S.key : S.ghost, 92 + i * 36, 82, 0.85, -0.35);
    }
    ctx.globalAlpha = 1;
  }

  // The host, قفّول, pops up beside every message bubble.
  var hostMsg = null, hostW = 0;
  function drawHost(ctx, S, t, ui) {
    var g = ui.game;
    if (!g.msg || g.msgT <= 0) return;
    if (g.msg !== hostMsg) {
      // measured once per message, like game.js measures its bubble
      ctx.save(); ctx.font = '700 28px ' + Art.FONT; ctx.direction = 'rtl';
      hostW = ctx.measureText(g.msg).width + 44; hostMsg = g.msg;
      ctx.restore();
    }
    ctx.globalAlpha = Math.min(1, g.msgT * 4);
    stamp(ctx, S.host, Math.min(1245, 640 + hostW * (1 + Math.max(0, g.msgT - 1.5) * 0.4) / 2 + 32), 168 + Math.sin(t * 6) * 2, 1, Math.sin(t * 4) * 0.08);
    ctx.globalAlpha = 1;
  }

  // Sunset castle, baked once: a big low sun with soft rays, puffy clouds, pale castles
  // with cone roofs and pennants (running to the bottom, so none floats over a pit),
  // a line of bunting and long banners with a key under the ceiling.
  function castle(g, pal, r) {
    var i, j, x, y, s, a, cx = 200 + r() * 880, cy = 430;
    g.fillStyle = pal.bg2; g.globalAlpha = 0.65; g.beginPath();
    for (i = 0; i < 16; i++) { a = i * Math.PI / 8 + 0.1; g.moveTo(cx, cy); g.arc(cx, cy, 1500, a, a + Math.PI / 16); g.closePath(); }
    g.fill();
    g.fillStyle = '#ffe6a8'; g.globalAlpha = 0.35; g.beginPath(); blob(g, cx, cy, 175); g.fill();
    g.globalAlpha = 0.6; g.beginPath(); blob(g, cx, cy, 120); g.fill();
    g.fillStyle = '#ffffff'; g.globalAlpha = 0.3; g.beginPath();
    for (i = 0; i < 4; i++) {
      x = 90 + i * 320 + r() * 150; y = 190 + r() * 90; s = 0.7 + r() * 0.5;
      blob(g, x, y, 32 * s); blob(g, x + 34 * s, y + 9 * s, 23 * s); blob(g, x - 34 * s, y + 11 * s, 21 * s);
    }
    g.fill();
    // castles: a crenellated wall between two towers, each tower with a cone roof and a pennant
    g.globalAlpha = 0.32; g.beginPath();
    for (i = 0; i < 3; i++) {
      x = 40 + i * 430 + r() * 150; s = 150 + r() * 70; y = 420 + r() * 40;
      g.rect(x, y, s, E.H - y);
      for (j = 0; j < s; j += 24) g.rect(x + j, y - 12, 12, 12);
      for (j = 0; j < 2; j++) {
        a = j ? x + s - 22 : x - 22; var top = y - 80 - r() * 50;
        g.rect(a, top, 44, E.H - top);
        g.moveTo(a - 6, top); g.lineTo(a + 22, top - 50); g.lineTo(a + 50, top); g.closePath();
        g.rect(a + 21, top - 72, 2.5, 24);
        g.moveTo(a + 23.5, top - 72); g.lineTo(a + 44, top - 66); g.lineTo(a + 23.5, top - 60); g.closePath();
      }
    }
    g.fill();
    // bunting under the ceiling
    var cols = ['#ffffff', GOLD, '#ff6b8a'];
    g.globalAlpha = 0.55;
    for (j = 0; j < 3; j++) {
      g.fillStyle = cols[j]; g.beginPath();
      for (i = j; i < 40; i += 3) {
        x = i * 33 + 6; y = 136 + Math.sin(x / E.W * Math.PI) * 34;
        g.moveTo(x, y); g.lineTo(x + 22, y + 1); g.lineTo(x + 11, y + 20); g.closePath();
      }
      g.fill();
    }
    // banners with a white key, hanging from the ceiling
    for (i = 0; i < 2; i++) {
      x = 180 + i * 760 + r() * 160;
      g.globalAlpha = 0.4; g.fillStyle = '#d9466b'; g.beginPath();
      g.moveTo(x, 120); g.lineTo(x + 52, 120); g.lineTo(x + 52, 270); g.lineTo(x + 26, 248); g.lineTo(x, 270); g.closePath();
      g.fill();
      g.globalAlpha = 0.75; g.save(); g.translate(x + 26, 186); g.rotate(Math.PI / 2); g.scale(1.4, 1.4);
      paintKey(g, '#ffffff', '#ffffff'); g.restore();
    }
  }

  // The knight skin: a dark visor with a bright slit, two grey rivets and a swaying red plume.
  function knight(ctx, face, t, ink, top) {
    var sw = Math.sin(t * 3) * 3, i;
    ctx.fillStyle = '#3d4258'; ctx.fillRect(-15.5, -28, 31, 11);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(face * 3 - 10, -23.5, 20, 2.5);
    ctx.fillStyle = '#8e97b0'; ctx.beginPath(); blob(ctx, -10, top + 5, 1.7); blob(ctx, 10, top + 5, 1.7); ctx.fill();
    ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath();
    for (i = 0; i < 3; i++) {
      ctx.moveTo(-face * 2, top + 1);
      ctx.quadraticCurveTo(-face * (4 + i * 4) + sw, top - 14 - i * 2, -face * (12 + i * 5) + sw * 1.5, top - 6 + i * 3);
    }
    ctx.stroke();
  }

  if (Art) {
    Art.SCENERY.castle = castle;
    Art.GROUND.castle = { top: '#f3d9cf', bumps: 1, mark: 'pebble' };
    Art.CAUSE.key = ['المفتاح عضّك!', 'مفتاح بأسنان!'];
    Art.SKINS.push({ id: 'knight', name: 'الفارس', stars: 150, body: '#cfd6e6' });
    Art.ACC.knight = knight;
    Art.SFX.jingle = function (A) {
      A.tone({ freq: 1568, type: 'triangle', dur: 0.1, vol: 0.12 });
      A.tone({ freq: 2093, type: 'triangle', dur: 0.1, vol: 0.12, delay: 0.06 });
      A.tone({ freq: 2637, type: 'triangle', dur: 0.18, vol: 0.12, delay: 0.12 });
      A.noise({ dur: 0.2, vol: 0.05, filter: 9000, to: 4000 });
    };
    Art.SFX.unlock = function (A) { // click, clack, poof
      A.tone({ freq: 1800, to: 1100, type: 'square', dur: 0.03, vol: 0.1 });
      A.tone({ freq: 2500, to: 1400, type: 'square', dur: 0.03, vol: 0.09, delay: 0.07 });
      A.noise({ dur: 0.22, vol: 0.16, filter: 1800, to: 300, delay: 0.1 });
    };
    Art.SFX.locked = function (A) { // a rattle
      for (var i = 0; i < 4; i++) A.tone({ freq: i % 2 ? 240 : 320, to: 180, type: 'square', dur: 0.045, vol: 0.08, delay: i * 0.055 });
      A.noise({ dur: 0.22, vol: 0.07, filter: 3000, to: 900 });
    };
    Art.SFX.chomp = function (A) {
      A.tone({ freq: 420, to: 90, type: 'sawtooth', dur: 0.09, vol: 0.16 });
      A.tone({ freq: 400, to: 80, type: 'sawtooth', dur: 0.09, vol: 0.16, delay: 0.11 });
    };
    Art.EV.key = function (d, ui) {
      ui.fx.burst(d.k.x + 20, d.k.y + 20, { count: 14, colors: [GOLD, '#ffffff'], speed: 230, life: 0.5, size: 6, gravity: -80 });
      ui.sfx('jingle');
    };
    Art.EV.unlock = function (d, ui) {
      var burst = function (x, y) { ui.fx.burst(x + 20, y + 20, { count: 6, colors: [GOLD, '#ffffff'], speed: 200, life: 0.5, size: 6, gravity: 200 }); };
      if (d.g) d.g.rects(burst); else burst(d.d.x, d.d.y + 14);
      ui.shake.add(3);
      ui.sfx('unlock');
    };
    Art.EV.locked = function (d, ui) { ui.say(d.out ? NOKEYS : 'مقفول!', d.out ? 2.5 : 1.2); ui.sfx('locked'); };
    Art.EV.nokeys = function (d, ui) { ui.say(NOKEYS, 3); ui.sfx('nope'); };
    Art.EV.bite = function (d, ui) { ui.sfx('chomp'); };
    Art.EV.keylost = function (d, ui) {
      ui.fx.burst(d.k.x + 20, d.k.y + 20, { count: 10, colors: [GOLD, ui.pal.ink], speed: 180, life: 0.5, size: 6, gravity: 300 });
    };
    Art.EV.keyback = function (d, ui) {
      ui.fx.burst(d.k.x + 20, d.k.y + 20, { count: 10, color: '#ffffff', speed: 150, life: 0.45, size: 5, gravity: -100 });
      ui.say('المفتاح عاد!', 1.4); ui.sfx('sparkle');
    };
    // a frozen key breaks out of its ice cube: chips of ice and a twinkle
    Art.EV.keypop = function (d, ui) {
      ui.fx.burst(d.k.x + 20, d.k.y + 20, { count: 12, colors: ['#ffffff', '#bff0ff', GOLD], speed: 220, life: 0.5, size: 6, gravity: 300 });
      ui.shake.add(2);
      ui.sfx('sparkle');
    };
    Art.mod({
      // the sprites are painted while the level is baked, not during its first frame
      bake: function (g, w, pal) { if (w.keys) sprites(pal.ink); },
      draw: function (ctx, w, pal, t) {
        if (!w.keys) return;
        var S = sprites(pal.ink);
        drawLocks(ctx, w, S);
        drawKeys(ctx, w, S, pal.ink, t);
      },
      front: function (ctx, w, pal, t) {
        if (!w.keys) return;
        var S = sprites(pal.ink);
        for (var i = 0; i < w.doors.length; i++) if (w.doors[i].pad && w.doors[i].fake) drawPadlock(ctx, w.doors[i], w, S, pal.ink, t);
        drawCarried(ctx, w, S, pal.ink, t);
      },
      hud: function (ctx, w, pal, t, ui) {
        if (!w.keys) return;
        var S = sprites(pal.ink);
        drawSlots(ctx, w, S, ui);
        drawHost(ctx, S, t, ui);
      }
    });
  }

  /* ================================================================ levels */
  var B = LV.B, room = B.room, pit = B.pit;
  var LEVELS = [];

  // 7-1: the key opens every lock it touches... even the floor under your feet.
  LEVELS.push({
    name: 'مقفول!', msg: 'أنا قفّول! ولن تمرّ بلا مفتاح!',
    hint: 'المفتاح يفتح كل قفل تلمسه... حتى الأرض! خذه واقفز فوق الأرض المقفلة.',
    map: (function () {
      var b = room();
      pit(b, 23, 24).f(23, 13, 24, 13, '%');
      return b.s(2, 12, 'P').s(13, 10, 'K').s(28, 12, 'L').done();
    })(),
    sol: 'R70 RJ20 R66 RJ20 R120'
  });

  // 7-2: the easy key on the floor has teeth.
  LEVELS.push({
    name: 'مفتاح بأسنان', msg: 'مفتاحان! خذ الأسهل طبعًا!',
    hint: 'المفتاح السهل له أسنان! اقفز فوقه وخذ المفتاح العالي.',
    map: room().f(15, 11, 17, 12, '#').s(2, 12, 'P').s(9, 12, 'K').s(16, 10, 'K').s(28, 12, 'L').done(),
    script: function (L) { L.keyFake(L.key(1)); },
    sol: 'R41 RJ20 R40 RJ20 R200'
  });

  // 7-3: the key runs away, over a spike pit, into the far corner. The door is at the start.
  LEVELS.push({
    name: 'المفتاح الهارب',
    hint: 'الحق المفتاح حتى الزاوية، واقفز فوق الحفرة، ثم ارجع إلى الباب.',
    map: (function () {
      var b = room();
      pit(b, 18, 20);
      return b.s(2, 12, 'P').s(4, 12, 'L').s(12, 12, 'K').done();
    })(),
    script: function (L) {
      var k = L.key(0);
      L.onX(9.5, function () {
        L.msg('المفتاح يقول: باي باي!'); L.sfx('giggle');
        L.keyTo(k, 17, 12, 10, 0, function () {
          L.keyTo(k, 21, 12, 10, 0, function () { L.keyTo(k, 30, 12, 10); }, 1.5);
        });
      });
    },
    sol: 'R122 RJ20 R130 L76 LJ20 L300'
  });

  // 7-4: the host says take the key... but the long bridge is a lock.
  LEVELS.push({
    name: 'الطمع', msg: 'خذ المفتاح! ستحتاجه... ثق بي!',
    hint: 'لا تأخذ المفتاح! الجسر المقفل يُفتح إذا مشيت عليه وأنت تحمل مفتاحًا.',
    winMsg: 'لم تأخذ المفتاح؟ يا لك من ذكي!',
    map: (function () {
      var b = room();
      pit(b, 13, 20).f(13, 13, 20, 13, '%');
      return b.s(2, 12, 'P').s(8, 12, 'K').s(28, 12, 'D').done();
    })(),
    sol: 'R33 RJ20 R300'
  });

  // 7-5: the open door bites; its key floats right above it.
  LEVELS.push({
    name: 'الباب المفتوح', msg: 'هذا الباب مفتوح! تفضّل!',
    hint: 'الباب المفتوح مزيف! اقفز فوقه وخذ المفتاح الذي فوقه.',
    map: room().s(2, 12, 'P').s(12, 12, 'E').s(12, 10, 'K').s(28, 12, 'L').done(),
    sol: 'R64 RJ20 R300'
  });

  // 7-6: the lock pillar holds up the ceiling. Open it, step back, climb the slab.
  LEVELS.push({
    name: 'العمود والسقف', msg: 'عمود مقفل... وسقف ثقيل!',
    hint: 'افتح العمود ثم ارجع خطوتين بسرعة! السقف سيصبح درجة تصعد عليها.',
    map: (function () {
      var b = room();
      b.f(18, 3, 23, 4, 'a').f(20, 5, 20, 12, 'b').f(24, 10, 30, 12, '#');
      return b.s(2, 12, 'P').s(6, 12, 'K').s(27, 9, 'D').done();
    })(),
    script: function (L) {
      var a = L.g('a'), b = L.lock('b');
      // it shakes for 0.6 s: time to turn back once you know
      L.when(function () { return !b.active; }, function () { a.drop(0.6, true); });
    },
    sol: 'R140 L30 _60 R10 RJ20 R30 RJ20 R200'
  });

  // 7-7: two keys for two locks, and a lock floor that eats one.
  LEVELS.push({
    name: 'حساب المفاتيح', msg: 'تحتاج مفتاحين!',
    hint: 'تحتاج مفتاحين: واحد للجدار وواحد للباب. اقفز فوق الأرض المقفلة!',
    map: (function () {
      var b = room();
      pit(b, 15, 16).f(15, 13, 16, 13, '%').f(25, 10, 25, 12, 'w');
      return b.s(2, 12, 'P').s(4, 12, 'K').s(10, 10, 'K').s(28, 12, 'L').done();
    })(),
    // the wall is on the way, so the HUD shows two key slots from the start
    script: function (L) { L.need(L.lock('w'), 1); },
    sol: 'R46 RJ20 R28 RJ20 R300'
  });

  // 7-8: the key is frozen in a world 6 ice cube. Kicked right it drops into the
  // spike pit and the key breaks on the spikes (both come back after 1 s); kicked
  // left it falls into the safe dip, and the key hops out and floats over it.
  // The dip has a step (col 5 is 2 deep), so nobody is stuck down there. The K
  // above the cube is only the key's map spot: the script freezes it into the cube.
  LEVELS.push({
    name: 'مفتاح في الثلج', msg: 'المفتاح متجمد! اركله نحو الباب!',
    hint: 'لا تركل المكعب نحو الشوك! اقفز فوقه واركله يسارًا إلى الحفرة.',
    map: (function () {
      var b = room();
      b.f(5, 13, 6, 14, ' ').s(6, 15, ' ');
      pit(b, 15, 17);
      return b.s(2, 12, 'P').s(10, 12, 'a').s(10, 11, 'K').s(28, 12, 'L').done();
    })(),
    script: function (L) {
      var k = L.key(0);
      L.cube('a', { home: true });
      L.keyIn(k, 'a');
      k.back = 1;
      L.when(function () { return k.gone; }, function () { L.msg('هههه! انكسر المفتاح!'); });
      L.when(function () { return !!k.m; }, function () { L.msg('ماذا؟! كيف عرفت؟!'); });
    },
    sol: 'R10 RJ20 R16 RJ20 R14 L40 _30 L40 RJ20 R57 RJ20 R300'
  });

  // 7-9: a gift key... but the steps over the pit are locks. Bump the lock floating
  // over the path to get rid of it (walking under it keeps the gift).
  LEVELS.push({
    name: 'هدية مسمومة', msg: 'هدية لك! مفتاح مجاني!',
    hint: 'الهدية فخ! اقفز تحت القفل الطائر ليأكل مفتاحك، ثم اصعد الدرجات.',
    map: (function () {
      var b = room();
      pit(b, 15, 22).f(17, 12, 18, 12, '%').f(20, 10, 21, 10, '%').f(23, 8, 30, 12, '#');
      return b.s(2, 12, 'P').s(9, 9, '%').s(27, 7, 'D').done();
    })(),
    script: function (L) { L.give(1); },
    sol: 'R40 RJ20 R35 RJ20 R12 RJ20 R10 RJ20 R200'
  });

  // 7-10: the castle finale. Two keys, a fake one, a guard saw, and the door flies home.
  LEVELS.push({
    name: 'مفاتيح الملك', msg: 'الباب يحتاج مفتاحين... هيهي!',
    hint: 'المفتاح السفلي يعض! اقفز فوق الأرض المقفلة، والباب سيعود إلى البداية.',
    winMsg: 'كل المفاتيح لك... هذه المرة!',
    map: (function () {
      var b = room();
      pit(b, 10, 11).f(10, 13, 11, 13, '%').f(18, 11, 19, 12, '#');
      return b.s(2, 12, 'P').s(5, 10, 'K').s(18, 10, 'K').s(5, 12, 'K').s(28, 12, 'L').done();
    })(),
    script: function (L) {
      var d = L.doors[0], k2 = L.key(1);
      L.need(d, 2);
      L.keyFake(L.key(2));
      // the guard drops in from the ceiling, then patrols between the lock floor and the pillar
      var s = L.saw({ x: 16, y: -1, mode: 'path', speed: 14, path: [[14.6, 12.45], [17.4, 12.45]], r: 22, active: false });
      L.when(function () { return s.pi === 1; }, function () { s.speed = 2.5 * L.T; });
      L.onKey(function (k) { if (k === k2) L.wake(s); });
      L.when(function () { return L.held() >= 2 && L.px() >= 25.5; }, function () {
        L.doorTo(d, 28, 5, 22, 0, function () {
          L.doorTo(d, 2, 5, 24, 0, function () { L.doorTo(d, 2, 12, 16); });
        });
        L.msg('نسيت شيئًا؟');
      });
    },
    sol: 'R8 RJ20 R24 RJ20 R44 RJ20 R64 L44 LJ20 L10 LJ20 L22 LJ20 L18 LJ20 L100'
  });

  LV.addWorld({ name: 'عالم المفاتيح', n: 10, theme: 'castle', bg: '#ff9e7a', bg2: '#ffb396', ink: '#3a1636', ink2: '#5a2c52', accent: '#ffffff' }, LEVELS);
})(typeof window !== 'undefined' ? window : globalThis);
