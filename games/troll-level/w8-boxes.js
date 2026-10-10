/*
 * Sneaky Levels — world 8 (levels 51-60): surprise boxes.
 * Registers its mechanic with the engine (TrollEngine.mod) and, in the browser,
 * with the drawing (TrollArt), then adds its world with TrollLevels.addWorld.
 *
 * Map: '?' is a surprise box, '0' a hidden one (invisible and solid, it only
 * twinkles like '!' until something touches it). Every box is its own group
 * '?x_y' with g.box and g.own (this file draws it). Hit a box's underside with
 * your head (upside down: its top) and it bounces and gives its content; when
 * the head touches two boxes, the one nearest your centre counts.
 * Script API (later worlds may use it too):
 *   L.box(x, y, content, o)  sets up the box at tile (x, y) (made there if the
 *     map has none) and returns its state { g: its group, hits, used }. content is
 *     one of
 *       'coin'   a coin pops out (the default of a box no script sets up)
 *       'door'   the level's door waits off the screen and pops out on top
 *                (put the 'D' on the tile above the box)
 *       'spring' the box poofs and a spring lands on the floor below it
 *       'saw'    a slow saw wakes at the side wall away from the door (o.speed tiles/s)
 *       'fall'   the box shakes for 0.4 s, then drops and lands
 *       'bite'   spikes pop out of its underside
 *       'flip'   gravity flips;  'moon' moon gravity;  'grav' normal gravity
 *       'stairs' the groups named in o.stairs (one letter each, mapped in their
 *                raised place) wait sunk into the floor and rise out of it
 *       a function(box), called on the hit (keys, switches, anything else)
 *     or an array of these, one per hit (a box you can hit several times).
 *     o: { msg: text or one text per hit, repeat: never used up (its last
 *     content again on every hit), size: 2 (a crowned 2x2 King Box made of the
 *     four '?' from (x, y)), shy: n (when you jump within 3 tiles of it, it
 *     slides up to n tiles away from you), speed, stairs }.
 *   L.coins()                 coins collected in this try.
 *   L.fakeSparkle(x0, x1, y)  the '!' tiles of row y, columns x0..x1, twinkle
 *                             but are not solid.
 */
(function (root) {
  'use strict';
  var E = root.TrollEngine, Art = root.TrollArt;
  var T = E.T, COLS = E.COLS, ROWS = E.ROWS, PH = E.PH, DT = E.DT, TAU = Math.PI * 2;
  var SHY_NEAR = 3 * T, SHY_SPEED = 30, STAIRS_SPEED = 7, CARD_T = 2.2;

  // The level's boxes; made only when its map or script has one, so every hook
  // returns at once in all other levels. groups tells a fresh map apart.
  function state(w) {
    if (!w.boxes || w.boxes.groups !== w.groups) {
      w.boxes = { groups: w.groups, list: [], coins: 0, pops: [], drops: [], shy: false, L: null };
    }
    return w.boxes;
  }

  function make(w, x, y, hidden) {
    var g = w.newGroup('?' + x + '_' + y), b;
    g.tiles.push({ x: x, y: y });
    g.own = true; g.invis = hidden;
    w.owner[y * COLS + x] = g;
    b = { g: g, x: x, y: y, size: 1, content: ['coin'], msg: null, hits: 0, used: false, repeat: false, hitT: -9, shy: 0, speed: 3.5, rise: null, door: null, hx: 0, hy: 0 };
    g.box = b;
    state(w).list.push(b);
    return b;
  }

  // Where the box's top-left corner is now, in pixels.
  function bx(b) { return b.x * T + b.g.ox; }
  function by(b) { return b.y * T + b.g.oy; }

  // Can group g sit at (its tiles + ox, oy) without touching anything solid?
  function free(w, g, ox, oy) {
    for (var k = 0; k < g.tiles.length; k++) {
      if (w.collect(g.tiles[k].x * T + ox + 1, g.tiles[k].y * T + oy + 1, T - 2, T - 2, g).length) return false;
    }
    return true;
  }

  var CONTENT = {
    coin: function (w, b) {
      var s = w.boxes;
      s.coins++;
      s.pops.push({ x: bx(b) + b.size * T / 2, y: by(b), t: w.t });
      w.emit('boxcoin', { x: bx(b) + b.size * T / 2, y: by(b), n: s.coins });
    },
    door: function (w, b) {
      var d = b.door;
      // it rises out of the box (drawn in front of it) to stand on top
      d.x = b.hx; d.y = b.hy + 36;
      d.m = { tx: b.hx, ty: b.hy, speed: 5 * T, delay: 0, then: null };
      w.emit('boxdoor', { x: b.hx + T / 2, y: b.hy + 30 });
    },
    spring: function (w, b) {
      var x = Math.round(bx(b) / T), y = Math.round(by(b) / T), fy = y + b.size;
      while (fy < ROWS && !w.solidTile(x, fy)) fy++;
      b.g.active = false;
      w.emit('boxpoof', { x: bx(b) + T / 2, y: by(b) + T / 2 });
      // it falls drawn by this file and joins w.springs once it lands
      w.boxes.drops.push({ s: { x: x * T, y: (fy - 1) * T, hang: false, g: w.owner[fy * COLS + x] || null, anim: 0, bx: x, by: fy }, y: by(b), vy: 0 });
    },
    saw: function (w, b) {
      // from the side wall away from the door, so it chases you towards the
      // door, unless you stand less than 5 tiles from that wall
      var L = w.boxes.L, cx = (w.p.x + PH.w / 2) / T, right = !!w.door && w.door.x < E.W / 2;
      if (right ? COLS - cx < 5 : cx < 5) right = !right;
      var s = L.saw({ x: right ? COLS + 1 : -1, y: 9, mode: 'chase', speed: b.speed, active: false });
      // a hit during the level's title card wakes it when the card is gone
      if (w.t >= CARD_T) L.wake(s);
      else L.when(function () { return w.t >= CARD_T; }, function () { L.wake(s); });
    },
    fall: function (w, b) { b.g.drop(0.4, true); },
    bite: function (w, b) {
      for (var i = 0; i < w.spikes.length; i++) if (w.spikes[i].g === b.g) { w.spikes[i].target = 1; w.spikes[i].speed = 16; }
      w.emit('pop', { x: bx(b) + T / 2, y: by(b) + T * 1.5 });
    },
    flip: function (w) { w.flip(); },
    moon: function (w) { w.gk = 0.4; w.emit('sfx', { name: 'moon' }); },
    grav: function (w) { w.gk = 1; w.emit('sfx', { name: 'wobble' }); },
    stairs: function (w, b) {
      for (var i = 0; i < b.rise.length; i++) {
        var g = b.rise[i];
        g.show(); g.move(0, -g.oy / T, STAIRS_SPEED);
      }
      w.emit('sfx', { name: 'rumble' }); w.emit('shake', { a: 4 });
    }
  };

  function hit(w, b) {
    if (b.used) return;
    var n = b.hits++, c = b.content[Math.min(n, b.content.length - 1)];
    if (!b.repeat && b.hits >= b.content.length) b.used = true;
    b.hitT = w.t;
    w.emit('boxhit', { x: bx(b) + b.size * T / 2, y: by(b) + b.size * T });
    if (b.msg) w.emit('msg', { text: typeof b.msg === 'string' ? b.msg : b.msg[Math.min(n, b.msg.length - 1)] });
    if (typeof c === 'function') c(b); else CONTENT[c](w, b);
  }

  // A shy box slides away from a jump that starts within 3 tiles of it (the way
  // you face when you are right under it), as far as it can, up to b.shy tiles.
  function shy(w, b) {
    var g = b.g, p = w.p, d = bx(b) + b.size * T / 2 - p.x - PH.w / 2, dir, n = 0;
    if (b.used || !g.active || g.m || Math.abs(d) > SHY_NEAR) return;
    dir = Math.abs(d) > 12 ? (d > 0 ? 1 : -1) : p.face;
    while (n < b.shy && free(w, g, g.ox + dir * (n + 1) * T, g.oy)) n++;
    if (!n) return;
    g.move(dir * n, 0, SHY_SPEED);
    w.emit('boxshy', { x: bx(b) + T / 2, y: by(b) + T / 2, dir: dir });
  }

  E.mod({
    chars: ['?', '0'],
    cell: function (w, ch, x, y) { make(w, x, y, ch === '0'); },
    init: function (w) { if (w.boxes && w.boxes.groups !== w.groups) w.boxes = null; },
    api: function (L, w) {
      L.box = function (x, y, content, o) {
        var s = state(w), g = w.owner[y * COLS + x], b = g && g.box ? g.box : make(w, x, y, false), i, k;
        o = o || {};
        s.L = L;
        b.content = typeof content === 'object' && content.length ? content : [content || 'coin'];
        b.msg = o.msg || null; b.repeat = !!o.repeat; b.speed = o.speed || 3.5;
        if (o.shy) { b.shy = o.shy; s.shy = true; }
        if (o.size === 2) {
          // the King Box: the other three '?' join this group
          b.size = 2;
          for (k = 1; k < 4; k++) {
            var tx = x + k % 2, ty = y + (k >> 1), og = w.owner[ty * COLS + tx];
            w.groups.splice(w.groups.indexOf(og), 1); delete w.gmap[og.id];
            s.list.splice(s.list.indexOf(og.box), 1);
            b.g.tiles.push({ x: tx, y: ty }); w.owner[ty * COLS + tx] = b.g;
          }
        }
        for (i = 0; i < b.content.length; i++) {
          if (b.content[i] === 'door') {
            // the door waits off the screen
            b.door = L.door; b.hx = b.door.x; b.hy = b.door.y; b.door.x = -9 * T;
          } else if (b.content[i] === 'bite') {
            w.spikes.push({ x: x * T, y: (y + b.size) * T, dir: 'd', g: b.g, hid: -1, out: 0, target: 0, speed: 16, bx: x, by: y });
          } else if (b.content[i] === 'stairs') {
            b.rise = [];
            for (k = 0; k < o.stairs.length; k++) {
              var sg = w.gmap[o.stairs[k]], top = ROWS, bot = 0;
              for (var q = 0; q < sg.tiles.length; q++) { top = Math.min(top, sg.tiles[q].y); bot = Math.max(bot, sg.tiles[q].y); }
              sg.oy = (bot - top + 1) * T; sg.active = false;
              b.rise.push(sg);
            }
          }
        }
        return b;
      };
      L.coins = function () { return w.boxes ? w.boxes.coins : 0; };
      L.fakeSparkle = function (x0, x1, y) {
        for (var x = x0; x <= x1; x++) { var g = w.owner[y * COLS + x]; if (g && g.invis) g.setFake(); }
      };
    },
    step: function (w) {
      var s = w.boxes;
      if (!s) return;
      if (s.pops.length && w.t - s.pops[0].t > 0.8) s.pops.shift();
      for (var i = 0; i < s.drops.length; i++) {
        var f = s.drops[i];
        f.vy += 2600 * DT; f.y += f.vy * DT;
        if (f.y < f.s.y) continue;
        w.springs.push(f.s);
        w.emit('boxland', { x: f.s.x + T / 2, y: f.s.y + T });
        s.drops.splice(i--, 1);
      }
    },
    jump: function (w) {
      var s = w.boxes;
      if (!s || !s.shy) return;
      for (var i = 0; i < s.list.length; i++) if (s.list[i].shy) shy(w, s.list[i]);
    },
    // w.rects still holds moveY's query: the boxes the head touches
    head: function (w) {
      var s = w.boxes;
      if (!s) return;
      var p = w.p, rs = w.rects, cx = p.x + PH.w / 2, edge = w.gs > 0 ? p.y : p.y + PH.h, best = null, bd = 1e9;
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i], b = r.g && r.g.box;
        if (!b || Math.abs((w.gs > 0 ? r.y + r.h : r.y) - edge) > 1) continue;
        var d = Math.abs(r.x + r.w / 2 - cx);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) hit(w, best);
    }
  });

  /* ================================================================ drawing */
  if (Art) {
    var BOX = ['#3fb6ff', '#9ddcff', '#1f86d6'], USED = ['#9a86b8', '#b9a9d0', '#76649a'], KING = ['#9b5cff', '#c3a0ff', '#7339d6'];
    var GOLD = '#ffcf3f', RED = '#ff5a5a', CROWN = 24;

    Art.GROUND.toys = { top: RED, line: '#ffffff', mark: 'ring', stroke: 2.5 };

    // A toy shelf: lemon stripes and confetti, then on a red-and-white checker
    // strip with a toy-train track: letter blocks, a spinning top and a ring
    // stacker. The shelf runs down to the bottom, so nothing floats over a pit.
    Art.SCENERY.toys = function (g, pal, r) {
      var i, k, x, y, s, top = 470;
      g.fillStyle = pal.bg2; g.globalAlpha = 0.8; g.beginPath();
      for (k = -E.H; k < E.W + E.H; k += 110) { g.moveTo(k, 0); g.lineTo(k + 46, 0); g.lineTo(k + 46 - E.H, E.H); g.lineTo(k - E.H, E.H); g.closePath(); }
      g.fill();
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.5; g.beginPath();
      for (i = 0; i < 36; i++) { x = r() * E.W; y = 120 + r() * 320; s = 3 + r() * 5; g.moveTo(x + s, y); g.arc(x, y, s, 0, TAU); }
      g.fill();
      g.globalAlpha = 0.2; g.fillRect(0, top, E.W, E.H - top);
      g.fillStyle = RED; g.globalAlpha = 0.3; g.beginPath();
      for (x = 0; x < E.W; x += 20) g.rect(x, top + ((x / 20) % 2) * 10, 20, 10);
      g.fill();
      // the train track: a rail and its sleepers
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.55; g.fillRect(0, top - 7, E.W, 3);
      g.beginPath();
      for (x = 6; x < E.W; x += 24) g.rect(x, top - 10, 10, 10);
      g.fill();
      // letter blocks: a stack of two and one beside it
      x = 70 + r() * 120;
      var blocks = [[x, top - 80, 'أ'], [x + 84, top - 80, 'ب'], [x + 42, top - 162, 'ت']];
      g.font = '700 46px ' + Art.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (i = 0; i < 3; i++) {
        var q = blocks[i];
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.42; Art.rr(g, q[0], q[1], 80, 80, 12); g.fill();
        g.strokeStyle = pal.bg; g.globalAlpha = 0.9; g.lineWidth = 4; Art.rr(g, q[0] + 9, q[1] + 9, 62, 62, 8); g.stroke();
        g.fillStyle = pal.bg; g.fillText(q[2], q[0] + 40, q[1] + 42);
      }
      // a spinning top: point on the shelf, a wide body, a handle
      x = 560 + r() * 160; y = top - 14;
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.42; g.beginPath();
      g.moveTo(x, top); g.quadraticCurveTo(x + 70, y - 40, x + 60, y - 70); g.quadraticCurveTo(x, y - 96, x - 60, y - 70);
      g.quadraticCurveTo(x - 70, y - 40, x, top); g.rect(x - 7, y - 124, 14, 40);
      g.fill();
      g.strokeStyle = pal.bg; g.globalAlpha = 0.9; g.lineWidth = 5; g.beginPath();
      g.moveTo(x - 58, y - 62); g.quadraticCurveTo(x, y - 44, x + 58, y - 62); g.stroke();
      // a ring stacker: rings from big to small on a pole, a ball on top
      x = 980 + r() * 160;
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.42; g.beginPath(); g.rect(x - 6, top - 210, 12, 210);
      for (k = 0; k < 4; k++) { s = 58 - k * 11; y = top - 22 - k * 38; g.moveTo(x + s, y); g.ellipse(x, y, s, 20, 0, 0, TAU); }
      g.moveTo(x + 20, top - 196); g.arc(x, top - 196, 20, 0, TAU);
      g.fill();
      g.strokeStyle = pal.bg; g.globalAlpha = 0.9; g.lineWidth = 3; g.beginPath();
      for (k = 0; k < 4; k++) { s = 58 - k * 11; y = top - 22 - k * 38; g.moveTo(x - s * 0.7, y - 8); g.quadraticCurveTo(x, y - 18, x + s * 0.7, y - 8); }
      g.stroke();
    };

    // Box sprites, drawn once at twice the size (a body, a light top, a dark
    // bottom, an ink frame and four rivets); the '?' is its own sprite so it can bob.
    var spr = { ink: null };
    var canvas = function (wd, ht, draw) {
      var c = document.createElement('canvas');
      c.width = wd * 2; c.height = ht * 2;
      var g = c.getContext('2d');
      g.scale(2, 2); g.lineJoin = 'round'; g.lineCap = 'round';
      draw(g);
      return c;
    };
    var body = function (g, s, oy, col, ink) {
      Art.rr(g, 2, oy + 2, s - 4, s - 4, 7); g.fillStyle = col[0]; g.fill();
      g.save(); g.clip();
      g.fillStyle = col[1]; g.fillRect(0, oy, s, 8);
      g.fillStyle = col[2]; g.fillRect(0, oy + s - 10, s, 10);
      g.restore();
      Art.rr(g, 2, oy + 2, s - 4, s - 4, 7); g.lineWidth = 3; g.strokeStyle = ink; g.stroke();
      g.fillStyle = ink; g.globalAlpha = 0.5; g.beginPath();
      for (var k = 0; k < 4; k++) { var rx = k % 2 ? s - 8 : 8, ry = oy + (k > 1 ? s - 8 : 8); g.moveTo(rx + 2.2, ry); g.arc(rx, ry, 2.2, 0, TAU); }
      g.fill(); g.globalAlpha = 1;
    };
    var crown = function (g, s, ink) {
      g.beginPath();
      g.moveTo(10, CROWN + 3); g.lineTo(8, 6); g.lineTo(s * 0.3, 15); g.lineTo(s / 2, 2); g.lineTo(s * 0.7, 15); g.lineTo(s - 8, 6); g.lineTo(s - 10, CROWN + 3);
      g.closePath(); g.fillStyle = GOLD; g.fill(); g.lineWidth = 3; g.strokeStyle = ink; g.stroke();
      g.fillStyle = RED; g.beginPath();
      g.moveTo(s / 2 + 4, 17); g.arc(s / 2, 17, 4, 0, TAU); g.moveTo(s * 0.3 + 3, 20); g.arc(s * 0.3, 20, 3, 0, TAU); g.moveTo(s * 0.7 + 3, 20); g.arc(s * 0.7, 20, 3, 0, TAU);
      g.fill();
    };
    var qmark = function (g, ink) {
      g.beginPath(); g.moveTo(5.5, 10); g.bezierCurveTo(5.5, 2, 18.5, 2, 18.5, 10); g.bezierCurveTo(18.5, 15, 12, 15.5, 12, 20);
      g.lineWidth = 8.5; g.strokeStyle = ink; g.stroke();
      g.lineWidth = 4.5; g.strokeStyle = '#ffffff'; g.stroke();
      g.beginPath(); g.arc(12, 26.5, 4.2, 0, TAU); g.fillStyle = ink; g.fill();
      g.beginPath(); g.arc(12, 26.5, 2.3, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
    };
    var sprites = function (ink) {
      spr.ink = ink;
      spr.box = canvas(T, T, function (g) { body(g, T, 0, BOX, ink); });
      spr.used = canvas(T, T, function (g) { body(g, T, 0, USED, ink); });
      spr.king = canvas(2 * T, 2 * T + CROWN, function (g) { body(g, 2 * T, CROWN, KING, ink); crown(g, 2 * T, ink); });
      spr.kingUsed = canvas(2 * T, 2 * T + CROWN, function (g) { body(g, 2 * T, CROWN, USED, ink); crown(g, 2 * T, ink); });
      spr.q = canvas(24, 32, function (g) { qmark(g, ink); });
    };

    var COIN = '#ffd23f';
    var coin = function (ctx, x, y, wd, ink) {
      ctx.beginPath(); ctx.ellipse(x, y, Math.max(1.5, wd), 11, 0, 0, TAU);
      ctx.fillStyle = COIN; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = ink; ctx.stroke();
      if (wd > 5) { ctx.fillStyle = '#fff3b0'; ctx.fillRect(x - 1.5, y - 6, 3, 12); }
    };
    // a spring still falling from its box, drawn by the core spring routine
    var falling = { springs: [{ x: 0, y: 0, hang: false, g: null, anim: 0 }] };

    // The coin counter (redrawn only when the count changes) and the host
    // Nattoot, a jack-in-the-box drawn once at 3x (64 x 64 logical).
    var tally = { n: -1, ink: null, c: null };
    var host = null, hostMsg = null, hostW = 0;
    var nattoot = function (ink) {
      host = document.createElement('canvas');
      host.width = host.height = 192;
      var g = host.getContext('2d'), k;
      g.scale(3, 3); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 2.5; g.strokeStyle = ink;
      // the box he lives in, with a star
      Art.rr(g, 15, 46, 34, 16, 4); g.fillStyle = RED; g.fill(); g.stroke();
      Art.star(g, 32, 54, 5, GOLD, ink, 1.5);
      // the spring
      g.beginPath(); g.moveTo(32, 46);
      for (k = 0; k < 4; k++) g.lineTo(k % 2 ? 26 : 38, 43 - k * 2.5);
      g.lineTo(32, 33); g.lineWidth = 2.5; g.stroke();
      // the jester hat: two floppy points with bells
      g.fillStyle = '#9b5cff'; g.beginPath(); g.moveTo(32, 12); g.quadraticCurveTo(14, 0, 6, 10); g.quadraticCurveTo(14, 12, 19, 20); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#3fb6ff'; g.beginPath(); g.moveTo(32, 12); g.quadraticCurveTo(50, 0, 58, 10); g.quadraticCurveTo(50, 12, 45, 20); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = GOLD; g.beginPath(); g.moveTo(8, 10); g.arc(5, 10, 3, 0, TAU); g.moveTo(62, 10); g.arc(59, 10, 3, 0, TAU); g.fill(); g.stroke();
      // the face
      g.beginPath(); g.arc(32, 25, 13, 0, TAU); g.fillStyle = '#ffe7c2'; g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,105,140,0.6)'; g.beginPath(); g.ellipse(24.5, 28, 3, 2, 0, 0, TAU); g.ellipse(39.5, 28, 3, 2, 0, 0, TAU); g.fill();
      g.fillStyle = ink; g.beginPath(); g.ellipse(27.5, 22.5, 1.8, 2.6, 0, 0, TAU); g.ellipse(36.5, 22.5, 1.8, 2.6, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(32, 28, 5.5, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(32, 26, 2.8, 0, TAU); g.fillStyle = RED; g.fill();
    };

    Art.mod({
      front: function (ctx, w, pal, t) {
        var s = w.boxes, i, b, g, x, y, k;
        if (!s) return;
        if (spr.ink !== pal.ink) sprites(pal.ink);
        for (i = 0; i < s.list.length; i++) {
          b = s.list[i]; g = b.g;
          if (!g.active || (g.invis && !g.revealed)) continue;
          x = bx(b); y = by(b); k = (w.t - b.hitT) / 0.2;
          if (k < 1) y -= Math.sin(k * Math.PI) * 8;
          if (g.shakeT > 0) { x += Math.sin(t * 90 + i) * 2.5; y += Math.cos(t * 70 + i) * 1.5; }
          if (b.size === 2) ctx.drawImage(b.used ? spr.kingUsed : spr.king, x, y - CROWN, 2 * T, 2 * T + CROWN);
          else ctx.drawImage(b.used ? spr.used : spr.box, x, y, T, T);
          if (!b.used) {
            k = b.size;
            ctx.drawImage(spr.q, x + (k * T - 24 * k * 0.85) / 2, y + (k * T - 32 * k * 0.85) / 2 + Math.sin(t * 4 + b.x) * 1.5, 24 * k * 0.85, 32 * k * 0.85);
          }
        }
        for (i = 0; i < s.drops.length; i++) {
          var f = falling.springs[0];
          f.x = s.drops[i].s.x; f.y = s.drops[i].y; f.anim = 0;
          Art.drawSprings(ctx, falling, pal);
        }
        // a coin rises out of its box, spinning, and fades
        for (i = 0; i < s.pops.length; i++) {
          k = (w.t - s.pops[i].t) / 0.7;
          if (k >= 1) continue;
          ctx.globalAlpha = 1 - k * k;
          coin(ctx, s.pops[i].x, s.pops[i].y - 14 - 56 * (1 - (1 - k) * (1 - k)), Math.abs(Math.cos(k * 14)) * 10, pal.ink);
          ctx.globalAlpha = 1;
        }
      },
      hud: function (ctx, w, pal, t, ui) {
        var gm = ui.game, n = w.boxes ? w.boxes.coins : 0;
        if (n) {
          if (tally.n !== n || tally.ink !== pal.ink) {
            tally.n = n; tally.ink = pal.ink;
            tally.c = canvas(110, 40, function (g) {
              Art.rr(g, 1, 2, 108, 36, 18); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
              coin(g, 22, 20, 10, pal.ink);
              g.font = '700 24px ' + Art.FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.direction = 'ltr';
              g.fillStyle = pal.ink; g.fillText('× ' + n, 40, 21);
            });
          }
          ctx.drawImage(tally.c, 64, 62, 110, 40);
        }
        // Nattoot pops up beside every speech bubble in his world
        if (pal.theme !== 'toys' || !gm.msg || gm.msgT <= 0) return;
        if (gm.msg !== hostMsg) { hostMsg = gm.msg; ctx.font = '700 28px ' + Art.FONT; hostW = ctx.measureText(hostMsg).width + 44; }
        if (!host) nattoot(pal.ink);
        var pop = 1 + Math.max(0, gm.msgT - 1.5) * 0.4, k = pop / 2.6;
        ctx.save();
        ctx.globalAlpha = Math.min(1, gm.msgT * 4);
        ctx.translate(Math.min(1240, 640 + hostW * pop / 2 + 38), 178 + Math.sin(t * 9) * 2); ctx.rotate(Math.sin(t * 5) * 0.1);
        ctx.drawImage(host, -96 * k, -110 * k, 192 * k, 192 * k);
        ctx.restore();
      }
    });

    Art.EV.boxhit = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 7, colors: [GOLD, '#ffffff'], speed: 170, life: 0.35, size: 5, gravity: 300 });
      ui.sfx('boxhit');
    };
    Art.EV.boxcoin = function (d, ui) {
      ui.fx.burst(d.x, d.y - 40, { count: 8, colors: [COIN, '#ffffff'], speed: 120, life: 0.5, size: 5, gravity: -60 });
      ui.sfx('coin');
    };
    Art.EV.boxpoof = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 14, colors: ['#ffffff', BOX[0], BOX[1]], speed: 200, life: 0.5, size: 7, gravity: 200 });
      ui.sfx('poof');
    };
    Art.EV.boxdoor = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 18, colors: [GOLD, '#ffffff', RED, BOX[0]], speed: 260, life: 0.7, size: 6, gravity: 400 });
      ui.sfx('sparkle');
    };
    Art.EV.boxshy = function (d, ui) {
      ui.fx.burst(d.x - d.dir * 22, d.y, { count: 6, color: '#ffffff', speed: 140, life: 0.35, size: 6, gravity: 0, angle: d.dir > 0 ? Math.PI : 0, spread: 1.2 });
      if (!ui.demo) ui.say('هيهي!', 1.2);
      ui.sfx('giggle');
    };
    Art.EV.boxland = function (d, ui) {
      ui.fx.burst(d.x, d.y, { count: 6, color: '#ffffff', speed: 120, life: 0.35, size: 5, gravity: 100, angle: -Math.PI / 2, spread: Math.PI });
      ui.sfx('boxland');
    };

    Art.SFX.boxhit = function (A) {
      A.tone({ freq: 260, to: 130, type: 'square', dur: 0.06, vol: 0.12 });
      A.tone({ freq: 1568, type: 'triangle', dur: 0.16, vol: 0.12, delay: 0.04 });
      A.tone({ freq: 2093, type: 'sine', dur: 0.2, vol: 0.06, delay: 0.04 });
    };
    Art.SFX.coin = function (A) {
      A.tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.08 });
      A.tone({ freq: 1319, type: 'square', dur: 0.22, vol: 0.08, delay: 0.07 });
    };
    Art.SFX.boxland = function (A) {
      A.tone({ freq: 200, to: 80, type: 'triangle', dur: 0.1, vol: 0.2 });
      A.noise({ dur: 0.08, vol: 0.1, filter: 1500, to: 300 });
    };
  }

  /* ================================================================ levels */
  var B = root.TrollLevels.B, room = B.room, pit = B.pit, hole = B.hole;
  var LEVELS = [];

  // 8-1: no door anywhere... it is in the far box.
  LEVELS.push({
    name: 'الهدية',
    msg: 'أنا نطّوط! أين الباب؟',
    hint: 'اضرب الصندوق البعيد برأسك! الباب بداخله.',
    map: room().s(7, 9, '?').s(15, 9, '?').s(15, 8, 'D').f(11, 11, 12, 12, '#').s(2, 12, 'P').done(),
    script: function (L) {
      L.box(7, 9, 'coin', { msg: 'مجرد عملة!' });
      L.box(15, 9, 'door', { msg: 'وجدت الباب!' });
    },
    sol: 'R50 RJ20 R30 _20 J10 _40 L10 LJ20 L10 _10 R15 RJ20 R60'
  });

  // 8-2: the box falls after the hit: bonk it on the run, then use it as a step.
  LEVELS.push({
    name: 'الصندوق الساقط',
    msg: 'الباب عالٍ جدًا... مستحيل!',
    hint: 'الصندوق يسقط بعد الضربة! اضربه وأنت تركض، ثم اصعد عليه.',
    map: room().f(21, 10, 30, 12, '#').s(18, 9, '?').s(27, 9, 'D').s(2, 12, 'P').done(),
    script: function (L) { L.box(18, 9, 'fall', { msg: 'سأنزل!' }); },
    sol: 'R118 RJ20 R60 L4 LJ8 L4 _20 R4 RJ20 R60'
  });

  // 8-3: the sparkles on the floor lie; the one up in the air is a hidden box.
  LEVELS.push({
    name: 'اللمعة الكاذبة',
    msg: 'تذكر الجسر الخفي؟ ثق بالبريق!',
    hint: 'اللمعة على الأرض كاذبة! اقفز إلى الأعلى... هناك صندوق خفي.',
    map: (function () {
      var b = room();
      pit(b, 12, 17);
      return b.f(12, 13, 17, 13, '!').s(13, 11, '0').s(2, 12, 'P').s(27, 12, 'D').done();
    })(),
    script: function (L) { L.fakeSparkle(12, 17, 13); },
    sol: 'R64 RJ20 R6 RJ20 R100'
  });

  // 8-4: the spring box runs away from you: herd it to the ledge.
  LEVELS.push({
    name: 'الصندوق الهارب',
    msg: 'صندوقي خجول... لا تخيفه!',
    hint: 'الصندوق يهرب منك! اقفز على يمينه ليهرب نحو الحافة، ثم اضربه هناك.',
    map: (function () {
      var b = room();
      b.f(1, 8, 4, 12, '#').f(24, 3, 30, 3, '#').f(24, 4, 30, 4, 'v');
      return b.s(13, 10, '?').s(2, 7, 'D').s(8, 12, 'P').done();
    })(),
    script: function (L) { L.box(13, 10, 'spring', { shy: 3 }); },
    sol: 'R60 _10 J10 _30 L20 _5 J10 _30 L35 J10 _30 L30 LJ20 L100 R30'
  });

  // 8-5: three boxes: a saw, a spring and a bite. They sit on row 10, below the
  // title card's text, and the spring bounces you up right of the speech bubble.
  LEVELS.push({
    name: 'الصناديق الثلاثة',
    msg: 'ثلاث هدايا! اختر واحدة...',
    hint: 'صندوق واحد فقط فيه النطّاطة: الأوسط! لا تضرب الآخرين.',
    map: room().f(25, 8, 30, 12, '#').s(16, 10, '?').s(20, 10, '?').s(23, 10, '?').s(28, 7, 'D').s(2, 12, 'P').done(),
    script: function (L) {
      L.box(16, 10, 'saw', { msg: 'منشار! اهرب!' });
      L.box(20, 10, 'spring', { msg: 'نطّاطة!' });
      L.box(23, 10, 'bite', { msg: 'عضّة!' });
    },
    sol: 'R144 _20 J20 _10 R150'
  });

  // 8-6 (stand-in until world 7's keys): the box over the bridge drops the bridge
  // (row 10, so it shows below the title card).
  LEVELS.push({
    name: 'صندوق البوابة',
    msg: 'مفتاح البوابة في الصندوق!',
    hint: 'لا تضرب الصندوق فوق الجسر! اضرب الصندوق القريب من البوابة.',
    map: (function () {
      var b = room();
      pit(b, 12, 17);
      return b.f(12, 13, 17, 13, 'a').f(25, 10, 25, 12, 'b').s(14, 10, '?').s(23, 10, '?').s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      L.box(14, 10, function () { L.g('a').drop(0.05); }, { msg: 'أوبس!' });
      L.box(23, 10, function () { L.g('b').hide(); }, { msg: 'افتح يا صندوق!' });
    },
    sol: 'R166 J20 _30 R100'
  });

  // 8-7: the box flips gravity: walk on the ceiling to the hanging door.
  LEVELS.push({
    name: 'صندوق الجاذبية',
    msg: 'الباب معلّق في السقف؟!',
    hint: 'الصندوق يقلب الجاذبية! امشِ على السقف واقفز فوق الشوك.',
    map: (function () {
      var b = room();
      hole(b, 20, 24);
      return b.f(22, 3, 23, 3, 'v').s(8, 10, '?').s(28, 3, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) { L.box(8, 10, 'flip', { msg: 'انقلاب!' }); },
    sol: 'R45 J20 _60 R102 RJ20 R300'
  });

  // 8-8: the moon box (hit it again for more moon), and ten boxes that end the moon,
  // spiked on top so a moon jump from the moon box cannot land on them and walk across.
  LEVELS.push({
    name: 'صندوق القمر',
    msg: 'صندوق القمر يجعلك تطير!',
    hint: 'اضغط القفز ضغطة متوسطة: الطويلة تضرب الصناديق والقصيرة لا تكفي!',
    map: (function () {
      var b = room().f(14, 12, 18, 12, '^').f(12, 6, 21, 6, '?').f(12, 5, 21, 5, '^');
      return b.s(5, 9, '?').s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) {
      L.box(5, 9, 'moon', { repeat: true, msg: 'أهلًا بك على القمر!' });
      for (var x = 12; x <= 21; x++) L.box(x, 6, 'grav', { msg: 'انتهى القمر!' });
    },
    sol: 'R20 J20 _80 R61 RJ14 R200'
  });

  // 8-9: level 5 again, with boxes overhead that are out of reach anyway.
  LEVELS.push({
    name: 'عادية جدًا أيضًا',
    msg: 'انتبه! كل الصناديق فخاخ!',
    winMsg: 'رأيت؟ الصناديق كانت للزينة فقط!',
    hint: 'لا يوجد فخ حقًا! اقفز قفزات عادية من عمود إلى عمود.',
    map: (function () {
      var b = room();
      pit(b, 10, 21);
      b.f(13, 13, 14, 16, '#').f(18, 13, 19, 16, '#');
      return b.s(13, 8, '?').s(14, 8, '?').s(18, 8, '?').s(19, 8, '?').s(25, 9, '?').s(2, 12, 'P').s(28, 12, 'D').done();
    })(),
    script: function (L) { L.box(25, 9, 'coin', { msg: 'لا يوجد فخ!' }); },
    sol: 'R54 RJ20 R16 RJ20 R16 RJ20 R300'
  });

  // 8-10: the King Box: hit 1 wakes a saw, hit 2 raises the stairs, hit 3 drops the King.
  // The top step is 3 wide to catch a full jump; the spikes are too wide for one
  // jump, so you need the two hidden boxes against the ledge.
  LEVELS.push({
    name: 'ملك الصناديق',
    msg: 'هذا ملك الصناديق! اضربه إن استطعت!',
    winMsg: 'هزمت ملك الصناديق! أنت بطل الألعاب!',
    hint: 'اضرب الصندوق الكبير مرتين فقط، اصعد الدرج، واقفز إلى اللمعة.',
    map: (function () {
      var b = room();
      b.f(9, 9, 10, 10, '?').s(12, 12, 'a').f(13, 11, 13, 12, 'b').f(14, 10, 14, 12, 'c').f(15, 9, 15, 12, 'd').f(16, 8, 18, 12, 'e');
      b.f(19, 12, 24, 12, '^').f(25, 8, 30, 12, '#').f(23, 9, 24, 9, '0');
      return b.s(2, 12, 'P').s(27, 7, 'D').done();
    })(),
    script: function (L) {
      L.box(9, 9, ['saw', 'stairs', 'fall'], { size: 2, speed: 3, stairs: 'abcde', msg: ['آخ! منشاري!', 'درج سحري!', 'غضبت!'] });
    },
    sol: 'R55 J10 _30 J10 _30 R20 RJ20 _10 RJ20 _10 RJ14 _30 R16 RJ20 R24 RJ20 R100'
  });

  root.TrollLevels.addWorld({ name: 'عالم الألعاب', n: LEVELS.length, theme: 'toys', bg: '#ffd84d', bg2: '#ffe47f', ink: '#2e1a52', ink2: '#4a3478', accent: '#ffffff' }, LEVELS);
})(typeof window !== 'undefined' ? window : globalThis);
