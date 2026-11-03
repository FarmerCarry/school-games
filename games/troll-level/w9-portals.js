/*
 * Sneaky Levels — world 9 (levels 61-70): portals.
 * Registers its mechanic with the engine (TrollEngine.mod) and, in the browser,
 * with the drawing (TrollArt), then adds its world with TrollLevels.addWorld.
 *
 * '(' with ')' is the yellow pair and '{' with '}' the pink pair; the tiles of one
 * character form one portal. A portal tile is empty, and its face points away
 * from the fixed ground next to it: a floor portal faces up, a wall portal
 * sideways, a ceiling portal down; with no ground around it, it floats and keeps
 * your direction.
 * When your centre enters a portal you come out just outside its partner's face,
 * at its centre, at max(the speed you had into the entry face, 300 px/s) out of
 * the exit face; the sideways speed stays only when both faces lie on one axis.
 * So the further you fall into a floor portal, the higher it throws you. But
 * falling back into the portal you just flew out of never throws you faster than
 * it did: a bounce gains a little each time and would grow into a fling by itself.
 * Script API:
 *   L.portal(ch)          { moveTo(x, y, speed), hop(list, every, onLand), open(), close() }
 *                         moves the portal (its top-left tile to tile x, y at speed
 *                         tiles/s), or hops it at once to list[0], list[1]... every
 *                         `every` s (onLand(i) after each hop), or shuts it.
 *   L.relink(a, b)        portals a and b swap partners, and the partners swap colours.
 *   L.onWarp(fn)          fn(entry, exit, speed) after each warp of the player.
 *   L.fallDoor(d)         door d falls with gravity and travels through portals.
 *   L.zoop(x, y)          the player pops away to stand on tile (x, y).
 */
(function (root) {
  'use strict';
  var E = root.TrollEngine, Art = root.TrollArt;
  var T = E.T, PH = E.PH, DT = E.DT, COLS = E.COLS, ROWS = E.ROWS;
  var PAIR = { '(': ')', ')': '(', '{': '}', '}': '{' };
  var NORM = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  // A warp never comes out slower than MIN; a door falls no faster than DOOR_MAX.
  var MIN = 300, DOOR_MAX = 700, FLING_ACC = 900;

  // Portal tiles met while the current map was parsed (x, y, ch triples),
  // turned into the world's portals by init right after.
  var pending = [];

  // The exit velocity and normal of the last exitRule call (reused, no garbage).
  var OUT = { vx: 0, vy: 0, nx: 0, ny: 0 };
  function exitRule(a, b, vx, vy, cap) {
    var n = NORM[a.face], nx, ny;
    if (n) { nx = n[0]; ny = n[1]; }
    // a floating entry meets you head-on, along the way you mostly move
    else if (Math.abs(vy) >= Math.abs(vx)) { nx = 0; ny = vy >= 0 ? -1 : 1; }
    else { nx = vx > 0 ? -1 : 1; ny = 0; }
    var into = -(vx * nx + vy * ny), sp = Math.max(Math.min(into, cap), MIN);
    var m = NORM[b.face], ex = m ? m[0] : -nx, ey = m ? m[1] : -ny;
    var keep = (ex === 0) === (nx === 0);
    OUT.vx = ex * sp + (keep ? vx + into * nx : 0);
    OUT.vy = ey * sp + (keep ? vy + into * ny : 0);
    OUT.nx = ex; OUT.ny = ey;
  }

  // Top-left of a bw x bh body just outside portal b's face (OUT.nx, OUT.ny).
  var AT = { x: 0, y: 0 };
  function place(b, bw, bh) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (OUT.ny) { AT.x = cx - bw / 2; AT.y = OUT.ny < 0 ? b.y - bh : b.y + b.h; }
    else { AT.y = cy - bh / 2; AT.x = OUT.nx < 0 ? b.x - bw : b.x + b.w; }
  }

  function inside(q, x, y) { return x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h; }

  // The open portal (with an open partner) whose mouth holds point (x, y).
  function hit(s, x, y) {
    for (var i = 0; i < s.list.length; i++) {
      var q = s.list[i];
      if (q.open && q.pair && q.pair.open && inside(q, x, y)) return q;
    }
    return null;
  }

  // Fixed ground only: a shy floor over a portal does not turn it.
  function ground(w, x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS && !!w.grid[y * COLS + x]; }

  // Which way the portal faces: away from ground on one side, else up off a
  // floor or down from a ceiling; null = floating.
  function faceOf(w, q) {
    var x0 = q.x / T, y0 = q.y / T, x1 = x0 + q.w / T - 1, y1 = y0 + q.h / T - 1;
    var l = true, r = true, u = true, d = true, i;
    for (i = y0; i <= y1; i++) { l = l && ground(w, x0 - 1, i); r = r && ground(w, x1 + 1, i); }
    for (i = x0; i <= x1; i++) { u = u && ground(w, i, y0 - 1); d = d && ground(w, i, y1 + 1); }
    if (l !== r) return l ? 'r' : 'l';
    if (u !== d) return d ? 'u' : 'd';
    return null;
  }

  function warpPlayer(w, s, a) {
    var p = w.p, b = a.pair, x0 = p.x + PH.w / 2, y0 = p.y + PH.h / 2;
    exitRule(a, b, p.vx, p.vy, a === p.wq ? p.wsp : Infinity);
    place(b, PH.w, PH.h);
    p.x = AT.x; p.y = AT.y; p.vx = OUT.vx; p.vy = OUT.vy;
    // no jump cut (it would clip a fling) and no late coyote jump
    p.onGround = false; p.ground = null; p.jumping = false; p.coy = 0;
    p.pcool = b;
    w.emit('warp', { x0: x0, y0: y0, x1: p.x + PH.w / 2, y1: p.y + PH.h / 2, col: b.col, nx: OUT.nx, door: false });
    var sp = Math.abs(OUT.nx ? OUT.vx : OUT.vy);
    // the mouth you flew out of and how fast, until you land (see exitRule's cap)
    p.wq = b; p.wsp = sp;
    for (var i = 0; i < s.hooks.length; i++) s.hooks[i](a, b, sp);
  }

  // A door flagged portal falls with gravity, passing through everything but portals.
  function doorStep(w, s, d) {
    d.vy = Math.min(d.vy + PH.g * w.gk * DT, DOOR_MAX);
    d.x += d.vx * DT; d.y += d.vy * DT;
    var cx = d.x + 20, cy = d.y + 30;
    if (d.pcool) { if (inside(d.pcool, cx, cy)) return; d.pcool = null; }
    var a = hit(s, cx, cy);
    if (!a) return;
    exitRule(a, a.pair, d.vx, d.vy, DOOR_MAX);
    place(a.pair, 40, 60);
    d.x = AT.x; d.y = AT.y; d.vx = OUT.vx; d.vy = OUT.vy; d.pcool = a.pair;
    w.emit('warp', { x0: cx, y0: cy, x1: d.x + 20, y1: d.y + 30, col: a.pair.col, nx: OUT.nx, door: true });
  }

  function glide(q) {
    var m = q.m, dx = m.x - q.x, dy = m.y - q.y, dist = Math.sqrt(dx * dx + dy * dy), st = m.v * DT;
    if (dist <= st) { q.x = m.x; q.y = m.y; q.m = null; }
    else { q.x += dx / dist * st; q.y += dy / dist * st; }
  }

  E.mod({
    chars: '(){}',
    cell: function (w, ch, x, y) { pending.push(x, y, ch); },
    init: function (w) {
      w.portals = null;
      if (!pending.length) return;
      var s = { list: [], by: {}, hooks: [], doors: [] }, i, q;
      for (i = 0; i < pending.length; i += 3) {
        var x = pending[i] * T, y = pending[i + 1] * T, ch = pending[i + 2];
        q = s.by[ch];
        if (!q) {
          q = s.by[ch] = { ch: ch, x: x, y: y, w: T, h: T, face: null, pair: null, col: ch === '(' || ch === ')' ? 0 : 1, open: true, m: null, at: -9 };
          s.list.push(q);
        }
        // the portal is the box around all its tiles
        var x1 = Math.max(q.x + q.w, x + T), y1 = Math.max(q.y + q.h, y + T);
        q.x = Math.min(q.x, x); q.y = Math.min(q.y, y); q.w = x1 - q.x; q.h = y1 - q.y;
      }
      pending.length = 0;
      for (i = 0; i < s.list.length; i++) { q = s.list[i]; q.face = faceOf(w, q); q.pair = s.by[PAIR[q.ch]] || null; }
      w.portals = s;
    },
    api: function (L, w) {
      var s = w.portals;
      if (!s) return;
      L.portal = function (ch) {
        var q = s.by[ch];
        var hopTo = function (x, y) {
          var x0 = q.x + q.w / 2, y0 = q.y + q.h / 2;
          q.x = x * T; q.y = y * T; q.m = null; q.at = w.t;
          w.emit('portalHop', { x0: x0, y0: y0, x1: q.x + q.w / 2, y1: q.y + q.h / 2, col: q.col });
        };
        return {
          moveTo: function (x, y, speed) { q.m = { x: x * T, y: y * T, v: speed * T }; },
          hop: function (list, every, onLand) {
            var i = 0;
            var go = function () {
              hopTo(list[i][0], list[i][1]);
              if (onLand) onLand(i);
              i = (i + 1) % list.length;
            };
            go(); L.every(every, go);
          },
          open: function () { if (!q.open) { q.open = true; q.at = w.t; } },
          close: function () { if (q.open) { q.open = false; q.at = w.t; } }
        };
      };
      L.relink = function (a, b) {
        var P = s.by[a], Q = s.by[b], pa = P.pair, qb = Q.pair, c = pa.col;
        P.pair = qb; qb.pair = P; Q.pair = pa; pa.pair = Q;
        pa.col = qb.col; qb.col = c; pa.at = qb.at = w.t;
        w.emit('relink', { a: pa, b: qb });
      };
      L.onWarp = function (fn) { s.hooks.push(fn); };
      L.fallDoor = function (d) {
        if (d.g) { d.x += d.g.ox; d.y += d.g.oy; d.g = null; }
        d.m = null; d.vx = 0; d.vy = 0; d.pcool = null;
        s.doors.push(d);
      };
      L.zoop = function (x, y) {
        var p = w.p, x0 = p.x + PH.w / 2, y0 = p.y + PH.h / 2;
        p.x = x * T + (T - PH.w) / 2; p.y = y * T + T - PH.h; p.vx = p.vy = 0;
        p.onGround = false; p.jumping = false;
        w.emit('warp', { x0: x0, y0: y0, x1: p.x + PH.w / 2, y1: p.y + PH.h / 2, col: 1, nx: 0, door: false });
      };
    },
    step: function (w) {
      var s = w.portals, i;
      if (!s) return;
      for (i = 0; i < s.list.length; i++) if (s.list[i].m) glide(s.list[i]);
      for (i = 0; i < s.doors.length; i++) doorStep(w, s, s.doors[i]);
    },
    // a fling fades in the air instead of being cancelled by the arrows
    phys: function (w, p, P) {
      if (w.portals && !p.onGround && Math.abs(p.vx) > P.run) P.accA = FLING_ACC;
    },
    after: function (w) {
      var s = w.portals, p = w.p;
      if (!s) return;
      var cx = p.x + PH.w / 2, cy = p.y + PH.h / 2;
      if (p.onGround) p.wq = null;
      if (p.pcool) { if (inside(p.pcool, cx, cy)) return; p.pcool = null; }
      var a = hit(s, cx, cy);
      if (a) warpPlayer(w, s, a);
    }
  });

  /* ================================================================ drawing */
  if (Art) {
    var TAU = Math.PI * 2, PCOL = ['#ffe14d', '#ff6fb5'], PDEEP = ['#f29a14', '#c92f7d'];

    Art.GROUND.tower = { top: '#cfe0ff', line: '#ffffff', mark: 'pebble' };

    // A four-point sparkle (added to the current path).
    var spark = function (g, x, y, s) {
      g.moveTo(x, y - s); g.lineTo(x + s / 4, y - s / 4); g.lineTo(x + s, y); g.lineTo(x + s / 4, y + s / 4);
      g.lineTo(x, y + s); g.lineTo(x - s / 4, y + s / 4); g.lineTo(x - s, y); g.lineTo(x - s / 4, y - s / 4); g.closePath();
    };

    var at = []; // x, y (and size) of each window and book, for their lines
    // The wizard's tower: tall arched windows down to the floor, big thin spiral
    // swirls, floating open books and round potions, and scattered sparkles.
    Art.SCENERY.tower = function (g, pal, r) {
      var i, k, x, y, s, a;
      g.fillStyle = pal.bg2; g.beginPath();
      for (i = 0; i < 4; i++) {
        x = 70 + i * 320 + r() * 120; s = 96 + r() * 24; y = 150 + r() * 50;
        g.moveTo(x, E.H); g.lineTo(x, y + s / 2); g.arc(x + s / 2, y + s / 2, s / 2, Math.PI, 0); g.lineTo(x + s, E.H); g.closePath();
        at[i * 3] = x; at[i * 3 + 1] = y; at[i * 3 + 2] = s;
      }
      g.fill();
      // the window panes
      g.strokeStyle = pal.bg; g.lineWidth = 7; g.globalAlpha = 0.55; g.beginPath();
      for (i = 0; i < 4; i++) {
        x = at[i * 3]; y = at[i * 3 + 1]; s = at[i * 3 + 2];
        g.moveTo(x + s / 2, y + 8); g.lineTo(x + s / 2, E.H); g.moveTo(x, y + s * 1.1); g.lineTo(x + s, y + s * 1.1);
      }
      g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.globalAlpha = 0.18; g.lineCap = 'round'; g.beginPath();
      for (i = 0; i < 3; i++) {
        x = 230 + i * 420 + r() * 100; y = 220 + r() * 160; s = 60 + r() * 30; a = r() * TAU;
        g.moveTo(x, y);
        for (k = 1; k <= 40; k++) g.lineTo(x + Math.cos(a + k * 0.32) * s * k / 40, y + Math.sin(a + k * 0.32) * s * k / 40);
      }
      g.stroke();
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.3; g.beginPath();
      for (i = 0; i < 6; i++) {
        x = 90 + i * 215 + r() * 100; y = 150 + r() * 250; s = 20 + r() * 8;
        at[i * 3] = x; at[i * 3 + 1] = y; at[i * 3 + 2] = s;
        if (i % 2) {
          // an open book: two tall pages, a little lower at the spine
          g.moveTo(x, y + s * 0.1); g.quadraticCurveTo(x - s * 0.45, y - s * 0.12, x - s, y); g.lineTo(x - s, y + s * 0.8);
          g.quadraticCurveTo(x - s * 0.45, y + s * 0.68, x, y + s * 0.9); g.quadraticCurveTo(x + s * 0.45, y + s * 0.68, x + s, y + s * 0.8);
          g.lineTo(x + s, y); g.quadraticCurveTo(x + s * 0.45, y - s * 0.12, x, y + s * 0.1); g.closePath();
        } else {
          // a round potion with a neck and a cork
          g.moveTo(x + s * 0.7, y); g.arc(x, y, s * 0.7, 0, TAU);
          g.rect(x - s * 0.2, y - s * 1.15, s * 0.4, s * 0.6); g.rect(x - s * 0.3, y - s * 1.4, s * 0.6, s * 0.3);
        }
      }
      g.fill();
      // the lines of writing on the books' pages
      g.strokeStyle = pal.bg; g.lineWidth = 2; g.globalAlpha = 0.7; g.beginPath();
      for (i = 1; i < 6; i += 2) {
        x = at[i * 3]; y = at[i * 3 + 1]; s = at[i * 3 + 2];
        for (k = 0; k < 3; k++) {
          a = y + s * (0.22 + k * 0.17);
          g.moveTo(x - s * 0.8, a); g.lineTo(x - s * 0.2, a + s * 0.06); g.moveTo(x + s * 0.2, a + s * 0.06); g.lineTo(x + s * 0.8, a);
        }
      }
      g.stroke();
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.55; g.beginPath();
      for (i = 0; i < 26; i++) spark(g, r() * E.W, 130 + r() * 380, 3 + r() * 5);
      g.fill();
    };

    // A portal's spinning middle: a dark disk with two bright arms spiralling
    // in, drawn once per colour (3x, so it stays sharp when stretched).
    var SR = 24, disks = [];
    var disk = function (c) {
      var cv = document.createElement('canvas'), g, i, k, a;
      cv.width = cv.height = SR * 6;
      g = cv.getContext('2d');
      g.setTransform(3, 0, 0, 3, SR * 3, SR * 3);
      g.fillStyle = PDEEP[c]; g.beginPath(); g.arc(0, 0, SR, 0, TAU); g.fill();
      g.strokeStyle = PCOL[c]; g.lineWidth = 3.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      for (i = 0; i < 2; i++) {
        g.moveTo(0, 0);
        for (k = 1; k <= 14; k++) { a = i * Math.PI + k * 0.4; g.lineTo(Math.cos(a) * SR * k / 15, Math.sin(a) * SR * k / 15); }
      }
      g.stroke();
      return cv;
    };

    // A portal: a soft glow, the spinning disk, an ink rim and six dots going
    // round. Floor and ceiling portals lie flat, like a disk seen from the side.
    var drawPortal = function (ctx, q, t, ink) {
      var cx = q.x + q.w / 2, cy = q.y + q.h / 2, rx, ry, k, i, a, c = q.col;
      if (q.face === 'u' || q.face === 'd') { rx = q.w / 2 - 1; ry = 10; }
      else if (q.face) { rx = 10; ry = q.h / 2 + 5; }
      else { rx = q.w / 2 - 2; ry = q.h / 2 - 2; }
      // it pops in after a hop or a swap, and shrinks to a spark when shut
      k = Math.min(1, (t - q.at) * 6);
      k = q.open ? k + Math.sin(k * Math.PI) * 0.25 : 1 - k * 0.8;
      rx *= k; ry *= k;
      ctx.globalAlpha = q.open ? 0.35 : 0.15; ctx.fillStyle = PCOL[c];
      ctx.beginPath(); ctx.ellipse(cx, cy, rx + 7, ry + 7, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      if (!disks[c]) disks[c] = disk(c);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(rx / SR, ry / SR); ctx.rotate(t * 4);
      ctx.drawImage(disks[c], -SR, -SR, SR * 2, SR * 2);
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();
      if (!q.open) return;
      ctx.fillStyle = '#ffffff';
      for (i = 0; i < 6; i++) {
        a = t * 2.2 + i * Math.PI / 3;
        ctx.fillRect(cx + Math.cos(a) * (rx + 5) - 2.5, cy + Math.sin(a) * (ry + 5) - 2.5, 5, 5);
      }
    };

    // Sahsouh, the host: a round face in a big white beard under a blue star
    // hat with a bent tip, drawn once into a small canvas (3x, sharp when popped).
    var head = null;
    var sahsouh = function () {
      var ctx, ink = '#0f1a40';
      head = document.createElement('canvas');
      head.width = head.height = 192;
      ctx = head.getContext('2d');
      ctx.setTransform(3, 0, 0, 3, 96, 110);
      ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fillStyle = '#ffd9b8'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-19, 2);
      ctx.quadraticCurveTo(-24, 24, -8, 30); ctx.quadraticCurveTo(0, 38, 8, 30); ctx.quadraticCurveTo(24, 24, 19, 2);
      ctx.quadraticCurveTo(10, 12, 0, 8); ctx.quadraticCurveTo(-10, 12, -19, 2); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.ellipse(-7, -3, 2.6, 3.6, 0, 0, TAU); ctx.ellipse(7, -3, 2.6, 3.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.arc(0, 4, 3.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-22, -12); ctx.lineTo(22, -12); ctx.lineTo(-12, -48); ctx.closePath();
      ctx.fillStyle = '#3d5bd9'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -12, 26, 6, 0, 0, TAU); ctx.fillStyle = '#3d5bd9'; ctx.fill(); ctx.stroke();
      Art.star(ctx, -2, -26, 5, '#ffe14d'); Art.star(ctx, 8, -18, 3.5, '#ffe14d');
    };
    var hostMsg = null, hostW = 0, gm = null;

    Art.mod({
      draw: function (ctx, w, pal) {
        var s = w.portals;
        if (!s) return;
        ctx.save();
        for (var i = 0; i < s.list.length; i++) drawPortal(ctx, s.list[i], w.t, pal.ink);
        ctx.restore();
      },
      // Sahsouh pops up beside every speech bubble in his world.
      hud: function (ctx, w, pal, t, ui) {
        gm = ui.game;
        if (pal.theme !== 'tower' || !gm.msg || gm.msgT <= 0) return;
        if (gm.msg !== hostMsg) { hostMsg = gm.msg; ctx.font = '700 28px ' + Art.FONT; hostW = ctx.measureText(hostMsg).width + 44; }
        var pop = 1 + Math.max(0, gm.msgT - 1.5) * 0.4, k = pop / 3;
        if (!head) sahsouh();
        ctx.save();
        ctx.globalAlpha = Math.min(1, gm.msgT * 4);
        ctx.translate(Math.min(1240, 640 + hostW * pop / 2 + 36), 168); ctx.rotate(Math.sin(t * 5) * 0.08);
        ctx.drawImage(head, -96 * k, -110 * k, 192 * k, 192 * k);
        ctx.restore();
      }
    });

    // A pop of sparkles at both ends; the player stretches the way it flies out.
    var SPARKS = [[PCOL[0], '#ffffff'], [PCOL[1], '#ffffff']], WHITE = ['#ffffff'], BOTH = [PCOL[0], PCOL[1], '#ffffff'];
    Art.EV.warp = function (d, ui) {
      var cs = SPARKS[d.col];
      ui.fx.burst(d.x0, d.y0, { count: 10, colors: cs, speed: 200, life: 0.4, size: 6, gravity: 0 });
      ui.fx.burst(d.x1, d.y1, { count: 14, colors: cs, speed: 260, life: 0.5, size: 7, gravity: 0 });
      if (d.door) return;
      if (gm) { gm.vis.sx = d.nx ? 1.35 : 0.7; gm.vis.sy = d.nx ? 0.72 : 1.35; }
      ui.sfx('zwip');
    };
    Art.EV.portalHop = function (d, ui) {
      ui.fx.burst(d.x0, d.y0, { count: 8, colors: WHITE, speed: 150, life: 0.35, size: 5, gravity: 0 });
      ui.fx.burst(d.x1, d.y1, { count: 10, colors: SPARKS[d.col], speed: 180, life: 0.4, size: 6, gravity: 0 });
      ui.sfx('blip');
    };
    Art.EV.relink = function (d, ui) {
      [d.a, d.b].forEach(function (q) {
        ui.fx.burst(q.x + q.w / 2, q.y + q.h / 2, { count: 16, colors: BOTH, speed: 240, life: 0.6, size: 8, gravity: -60 });
      });
      ui.shake.add(4);
      ui.sfx('sparkle'); ui.sfx('poof');
    };

    // A rising then falling sine.
    Art.SFX.zwip = function (A) {
      A.tone({ freq: 320, to: 1500, type: 'sine', dur: 0.09, vol: 0.16 });
      A.tone({ freq: 1500, to: 420, type: 'sine', dur: 0.13, vol: 0.13, delay: 0.09 });
    };
    Art.SFX.blip = function (A) { A.tone({ freq: 520, to: 980, type: 'sine', dur: 0.08, vol: 0.12 }); };
    Art.SFX.ding = function (A) {
      A.tone({ freq: 1568, type: 'sine', dur: 0.6, vol: 0.18 });
      A.tone({ freq: 3136, type: 'sine', dur: 0.3, vol: 0.05 });
    };

    // The wizard skin: a white beard over the mouth, a tall blue hat bent back
    // at the tip, a wide brim and two yellow sparkles.
    Art.SKINS.push({ id: 'wizard', name: 'الساحر', stars: 190, body: '#ffffff' });
    Art.ACC.wizard = function (ctx, face, t, ink, top) {
      var ex = face * 4;
      // the beard: a wavy triangle from cheek to cheek, with a moustache curl on top
      ctx.beginPath(); ctx.moveTo(ex - 12, -17);
      ctx.quadraticCurveTo(ex - 11, -8, ex - 6, -7); ctx.quadraticCurveTo(ex - 6, -1, ex + face * 2, 2);
      ctx.quadraticCurveTo(ex + 6, -1, ex + 6, -7); ctx.quadraticCurveTo(ex + 11, -8, ex + 12, -17); ctx.closePath();
      ctx.fillStyle = '#eef3ff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - 8, -13); ctx.quadraticCurveTo(ex - 3, -17, ex, -14); ctx.quadraticCurveTo(ex + 3, -17, ex + 8, -13); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-13, top + 2); ctx.lineTo(13, top + 2); ctx.lineTo(-face * 14, top - 26); ctx.closePath();
      ctx.fillStyle = '#3d5bd9'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, top + 2, 19, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      Art.star(ctx, -face * 2, top - 8, 3.5 + Math.sin(t * 6) * 0.6, '#ffe14d');
      Art.star(ctx, -face * 8, top - 17, 2.6, '#ffe14d');
    };
  }

  /* ================================================================ levels */
  var B = root.TrollLevels.B, room = B.room, pit = B.pit;
  var LEVELS = [];

  // 9-1: the door is locked in a box; a floating portal leads inside.
  LEVELS.push({
    name: 'الباب في السجن',
    msg: 'أنا سحسوح العظيم! حبست الباب!',
    hint: 'البوابة المعلّقة توصلك إلى داخل الصندوق. اقفز إليها!',
    map: (function () {
      var b = room();
      b.f(21, 4, 28, 4, '#').f(21, 9, 28, 9, '#').f(21, 4, 21, 9, '#').f(28, 4, 28, 9, '#');
      b.f(20, 12, 30, 12, '^');
      return b.f(12, 11, 13, 11, '(').s(22, 8, ')').s(26, 8, 'D').s(2, 12, 'P').done();
    })(),
    sol: 'R80 RJ20 R60'
  });

  // 9-2: holding right after the wall portal sends you straight back in.
  LEVELS.push({
    name: 'الحلقة السحرية',
    msg: 'جدار؟ عندي بوابة توصلك للباب!',
    hint: 'بعد الخروج من البوابة لا تضغط يمينًا! الباب خلفك.',
    map: room().f(16, 3, 16, 12, '#').s(15, 12, '(').s(30, 12, ')').s(25, 12, '1').s(21, 12, 'D').s(2, 12, 'P').done(),
    script: function (L) {
      var n = 0;
      L.onWarp(function () { if (++n === 4) L.msg('هاها! أنت في حلقة سحرية!'); });
      L.when(L.zone(17, 0, 28, 20), function () { L.sp(1).pop(); });
    },
    sol: 'R103 L15 LJ20 L80'
  });

  // 9-3: the shy floor drops you into a portal; you fall into the box between
  // the door and the spikes.
  LEVELS.push({
    name: 'الحفرة السحرية',
    msg: 'مستحيل الدخول!',
    hint: 'الحفرة هي الطريق! اترك زر اليمين وأنت تسقط فيها.',
    map: (function () {
      var b = room();
      b.f(21, 4, 29, 5, '#').f(21, 6, 21, 12, '#').f(29, 6, 29, 12, '#').s(24, 5, '}').f(27, 12, 28, 12, '^');
      return b.f(10, 13, 12, 13, 'a').f(10, 14, 12, 14, '{').s(22, 12, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      var a = L.g('a');
      L.when(function () { return L.on('a'); }, function () { a.drop(0.05); });
      // the portal swallows the floor
      L.when(function () { return a.oy >= L.T; }, function () { a.hide(); });
    },
    sol: 'R80 L60'
  });

  // 9-4: a floor hole and a ceiling portal make an endless fall past two ledges,
  // right of the speech bubble so Sahsouh never hides where you come out.
  LEVELS.push({
    name: 'سقوط لا ينتهي',
    msg: 'حفرة صغيرة... ماذا تخبّئ؟',
    hint: 'وأنت تسقط اضغط يسارًا لتهبط على رف الباب.',
    map: (function () {
      var b = room();
      b.f(21, 9, 24, 9, '#').f(26, 9, 29, 9, '#').f(26, 8, 29, 8, '^');
      return b.s(25, 13, '(').s(25, 3, ')').s(22, 8, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      var n = 0;
      L.onWarp(function () { if (++n === 3) L.msg('وييييي! إلى الأبد!'); });
    },
    sol: 'R190 L40'
  });

  // 9-5: walk into the well and the portal only hops you; fall in from high up
  // and it throws you onto the ledge.
  LEVELS.push({
    name: 'الرمي العظيم',
    msg: 'بوابتي ترميك إلى الباب!',
    hint: 'اصعد البرج ثم اسقط في البوابة! كلما سقطت من أعلى طرت أعلى.',
    map: (function () {
      var b = room();
      b.f(5, 11, 6, 11, '#').f(8, 9, 9, 9, '#').f(11, 7, 13, 7, '#');
      b.f(14, 13, 16, 13, ' ').f(14, 14, 16, 14, '(').f(17, 3, 17, 11, '#').f(19, 12, 20, 12, '^');
      return b.s(22, 13, ')').s(23, 12, '^').f(24, 9, 30, 12, '#').s(28, 8, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      var weak = false, strong = false;
      L.onWarp(function (a, b, v) {
        if (b.ch !== ')') return;
        if (v < 800 && !weak) { weak = true; L.msg('ضعيف!'); }
        if (v >= 800 && !strong) { strong = true; L.msg('كلما سقطت من أعلى طرت أعلى!'); }
      });
    },
    sol: 'R10 RJ20 R4 _20 RJ20 R4 _20 RJ20 R4 _20 R160'
  });

  // 9-6: after the title card the exit hops between the door ledge and the spikes.
  LEVELS.push({
    name: 'البوابة القافزة',
    msg: 'بوابة واحدة... إلى أين توصل؟',
    hint: 'انتظر وراقب البوابة! ادخل الحفرة عندما تكون عند الباب.',
    map: (function () {
      var b = room();
      b.f(14, 12, 21, 12, '^').f(23, 9, 30, 12, '#');
      return b.s(12, 13, '(').s(18, 6, ')').s(28, 8, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      L.when(function () { return L.t() > 2.2; }, function () {
        L.msg('أين سأفتحها الآن؟');
        L.portal(')').hop([[26, 6], [18, 6]], 1.2, function (i) { if (!i) L.sfx('ding'); });
      });
    },
    sol: 'R60 _100 R100'
  });

  // 9-7: the wizard swaps the two pairs once, as you come near.
  LEVELS.push({
    name: 'تبديل الألوان',
    msg: 'الأصفر يوصلك إلى الباب. سهل!',
    // the wizard swaps 0.65 s in, so no title card hides it
    noIntro: true,
    hint: 'الساحر يبدّل البوابات مرة واحدة. دعه يبدّلها ثم ادخل الوردية.',
    map: (function () {
      var b = room();
      pit(b, 17, 22);
      b.f(24, 9, 30, 12, '#');
      return b.s(9, 13, '(').s(14, 13, '{').s(26, 6, ')').s(19, 6, '}').s(28, 8, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      L.onX(7, function () { L.relink('(', '{'); L.msg('أبرا كادابرا!'); });
    },
    sol: 'R40 RJ20 R100'
  });

  // 9-8: the door is fenced off; the side walls' portals wrap the room. A saw
  // drops in once you move after the title card.
  LEVELS.push({
    name: 'نفق الهروب',
    msg: 'الباب محروس بالشوك!',
    hint: 'اهرب إلى اليمين واقفز فوق الشوكة، وادخل بوابة الجدار!',
    map: (function () {
      var b = room();
      b.f(4, 3, 5, 12, '#').f(6, 3, 6, 12, '>');
      return b.s(1, 12, '(').s(30, 12, ')').s(2, 12, 'D').s(27, 12, '^').s(9, 12, 'P').done();
    })(),
    script: function (L) {
      var s = L.saw({ x: 9.5, y: -1, mode: 'chase', speed: 5.4, active: false });
      L.when(function () { return L.t() > 2.2 && Math.abs(L.px() - 9.5) > 0.2; }, function () { L.wake(s); L.msg('المنشار جائع!'); });
    },
    sol: 'R130 RJ20 R100'
  });

  // 9-9: the door runs into a pit portal and loops down column 24 for ever.
  LEVELS.push({
    name: 'الباب الدوّار',
    msg: 'الباب قريب جدًا اليوم!',
    hint: 'لا تلحق بالباب! قف في وسط المنصة تحت بوابة السقف وانتظره.',
    map: (function () {
      var b = room();
      pit(b, 21, 25);
      return b.s(24, 16, '(').s(24, 3, ')').f(23, 12, 25, 12, '#').s(14, 12, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      var d = L.door;
      L.onX(10, function () {
        L.msg('حاول أن تمسكني!');
        L.doorTo(d, 24, 11, 12, 0, function () { L.fallDoor(d); });
      });
    },
    sol: 'R140 RJ20 R14 _100'
  });

  // 9-10: the ping-pong, the fling, and a fake door that sends you home.
  LEVELS.push({
    name: 'برج الساحر',
    msg: 'آخر مرحلة في عالمي! أهلًا بك في برجي!',
    winMsg: 'هزمت سحسوح! أنت سيّد البوابات!',
    hint: 'بعد البوابة الأولى لا تضغط يمينًا، واسقط من البرج في البوابة الوردية.',
    map: (function () {
      var b = room();
      b.f(8, 3, 8, 12, '#').s(7, 12, '(').s(30, 12, ')');
      b.f(27, 11, 27, 12, '#').f(26, 9, 26, 12, '#').f(21, 7, 25, 12, '#');
      b.f(18, 13, 20, 13, ' ').f(18, 14, 20, 14, '{').f(17, 3, 17, 12, '#');
      // the pink exit fills the floor below the plateau: a fling that misses it
      // falls back in and is thrown again
      b.f(13, 11, 16, 12, '#').f(13, 10, 16, 10, '}').f(9, 6, 12, 12, '#');
      return b.s(10, 5, 'E').s(4, 12, 'D').s(2, 12, 'P').done();
    })(),
    script: function (L) {
      var d = L.door, f = L.fakes[0], home = false;
      d.y = -3 * L.T; // waiting above the screen
      // the fake door sends you home and shuts the way back; the real door comes
      f.onTouch = function () {
        if (home) return;
        home = true; f.bit = true;
        L.zoop(2, 12);
        L.portal('(').close();
        L.msg('شكرًا لزيارتك!');
        L.after(0.3, function () { B.slide(L, d, 4, 12, 30); });
        L.after(1.6, function () { L.msg('لحظة... هذا الباب حقيقي؟'); });
      };
    },
    sol: 'R40 _20 L10 LJ20 L5 _10 LJ20 L5 _10 LJ20 L5 _10 L100 _80 R40'
  });

  root.TrollLevels.addWorld({ name: 'عالم البوابات', n: LEVELS.length, theme: 'tower', bg: '#5aa2ff', bg2: '#74b2ff', ink: '#0f1a40', ink2: '#2a3c78', accent: '#ffffff' }, LEVELS);
})(typeof window !== 'undefined' ? window : globalThis);
