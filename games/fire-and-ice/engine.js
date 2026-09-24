/*
 * Fire & Ice — game engine (pure logic, no DOM).
 * Deterministic fixed-step simulation so levels can be verified headlessly
 * (see verify-levels.js). Rendering lives in render.js, screens in main.js.
 */
(function (root) {
  'use strict';
  var FI = root.FI || (root.FI = {});
  var T = 32;
  var PH = {
    pw: 22, ph: 38,
    speed: 235, pushSpeed: 135,
    accG: 2800, decG: 3400, accA: 1900, decA: 1200,
    gUp: 2100, gDown: 2500, jumpV: 690, cut: 0.45, maxFall: 900,
    coyote: 0.1, buffer: 0.13,
    fanAcc: 4600, fanUp: 440,
    boxW: 30, boxH: 30
  };
  var E = 0, S = 1, LAVA = 2, WATER = 3, GOO = 4, ONE = 5;
  FI.T = T; FI.PH = PH;
  FI.TILE = { E: E, S: S, LAVA: LAVA, WATER: WATER, GOO: GOO, ONE: ONE };
  var STATIC = { isStatic: true };

  FI.CHAN_COLORS = { a: '#b56cff', b: '#ffd230', c: '#ff6fae', d: '#8cf04a', e: '#f4f4ff', g: '#ff9a3c' };

  /* ------------------------------------------------------------ build */
  function build(def, index) {
    var rows = def.map, H = rows.length, W = 0, x, y;
    for (y = 0; y < H; y++) W = Math.max(W, rows[y].length);
    var w = {
      def: def, index: index || 0, W: W, H: H, tiles: new Uint8Array(W * H), fanTile: new Uint8Array(W * H),
      players: [], fire: null, ice: null, boxes: [], movers: [], buttons: [], levers: [], fans: [],
      portals: [], gems: [], exits: {}, chan: {}, t: 0, frame: 0, events: [], state: 'play',
      winT: 0, deadT: 0, gemsTotal: { fire: 0, ice: 0 }, gemsGot: { fire: 0, ice: 0 }, deadWho: null, deadCause: null
    };
    var objs = def.objs || {}, ext = {};
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var c = rows[y][x] || '.';
        var i = y * W + x;
        switch (c) {
          case '#': w.tiles[i] = S; break;
          case 'L': w.tiles[i] = LAVA; break;
          case 'W': w.tiles[i] = WATER; break;
          case 'G': w.tiles[i] = GOO; break;
          case '-': w.tiles[i] = ONE; break;
          case '.': case ' ': break;
          case 'r': w.gems.push({ kind: 'fire', x: x * T + T / 2, y: y * T + T / 2, got: false, t: Math.random() * 6 }); w.gemsTotal.fire++; break;
          case 'b': w.gems.push({ kind: 'ice', x: x * T + T / 2, y: y * T + T / 2, got: false, t: Math.random() * 6 }); w.gemsTotal.ice++; break;
          case 'F': w.fire = makePlayer('fire', x, y); break;
          case 'I': w.ice = makePlayer('ice', x, y); break;
          case 'f': w.exits.fire = makeExit('fire', x, y); break;
          case 'i': w.exits.ice = makeExit('ice', x, y); break;
          default: {
            var o = objs[c];
            if (!o) throw new Error('Level ' + def.name + ': unknown map char "' + c + '" at ' + x + ',' + y);
            if (o.t === 'box') {
              w.boxes.push({ isBox: true, kind: 'box', x: x * T + 1, y: (y + 1) * T - PH.boxH, w: PH.boxW, h: PH.boxH, vx: 0, vy: 0, rx: 0, ry: 0, grounded: true, pushT: 0 });
            } else if (o.t === 'button') {
              w.buttons.push({ x: x * T, y: y * T, ch: o.ch, down: false, amt: 0 });
            } else if (o.t === 'lever') {
              w.levers.push({ x: x * T, y: y * T, ch: o.ch, on: !!o.on, ang: o.on ? 1 : -1 });
            } else if (o.t === 'portal') {
              w.portals.push({ key: c, to: o.to, x: x * T, y: (y - 1) * T, w: T, h: 2 * T, color: o.color || '#c77dff', spin: 0 });
            } else {
              var e = ext[c];
              if (!e) ext[c] = { x0: x, y0: y, x1: x, y1: y };
              else { e.x0 = Math.min(e.x0, x); e.y0 = Math.min(e.y0, y); e.x1 = Math.max(e.x1, x); e.y1 = Math.max(e.y1, y); }
            }
          }
        }
      }
    }
    Object.keys(ext).forEach(function (c) {
      var o = objs[c], e = ext[c];
      var tw = e.x1 - e.x0 + 1, th = e.y1 - e.y0 + 1;
      if (o.t === 'mover' || o.t === 'gate') {
        var m = {
          style: o.style || (o.t === 'gate' ? 'gate' : 'plat'), ch: o.ch || null, inv: !!o.inv,
          x: e.x0 * T, y: e.y0 * T, w: tw * T, h: th * T,
          ax: e.x0 * T, ay: e.y0 * T, bx: (e.x0 + (o.dx || 0)) * T, by: (e.y0 + (o.dy || 0)) * T,
          speed: o.speed || (o.t === 'gate' ? 170 : 95), pause: o.pause == null ? 0.7 : o.pause,
          goB: true, wait: o.delay || 0, vx: 0, vy: 0, moving: false, fx: 0, fy: 0, key: c
        };
        m.fx = m.x; m.fy = m.y;
        if (o.fill) {
          for (var yy = e.y0; yy <= e.y1; yy++) for (var xx = e.x0; xx <= e.x1; xx++) w.tiles[yy * W + xx] = o.fill === 'L' ? LAVA : o.fill === 'W' ? WATER : o.fill === 'G' ? GOO : S;
        }
        w.movers.push(m);
      } else if (o.t === 'fan') {
        for (var fx = e.x0; fx <= e.x1; fx++) { w.tiles[e.y0 * W + fx] = S; w.fanTile[e.y0 * W + fx] = 1; }
        w.fans.push({ x: e.x0 * T, y: e.y0 * T, w: tw * T, top: (e.y0 - o.h) * T, ch: o.ch || null, inv: !!o.inv, on: true, spin: 0, power: 1 });
      } else {
        throw new Error('bad object type ' + o.t);
      }
    });
    // portals: link
    w.portals.forEach(function (p) {
      p.dest = null;
      w.portals.forEach(function (q) { if (q.key === p.to) p.dest = q; });
    });
    if (!w.fire || !w.ice) throw new Error('Level ' + def.name + ' missing spawn');
    w.players = [w.ice, w.fire];
    // initial channels & mover placement
    computeChannels(w);
    w.movers.forEach(function (m) {
      if (m.ch) {
        var on = !!w.chan[m.ch]; if (m.inv) on = !on;
        if (on) { m.x = m.fx = m.bx; m.y = m.fy = m.by; }
      }
    });
    return w;
  }

  function makePlayer(kind, tx, ty) {
    return {
      isPlayer: true, kind: kind, x: tx * T + (T - PH.pw) / 2, y: (ty + 1) * T - PH.ph, w: PH.pw, h: PH.ph,
      vx: 0, vy: 0, rx: 0, ry: 0, grounded: true, coyote: 0, buffer: 0, jumping: false, jPrev: false,
      face: kind === 'fire' ? 1 : 1, alive: true, pushing: 0, atDoor: false, portalLock: null, inFan: false,
      airT: 0, fallV: 0, onLiquid: 0, baseVx: 0
    };
  }
  function makeExit(kind, tx, ty) {
    return { kind: kind, x: tx * T, y: (ty - 1) * T, w: T, h: 2 * T, open: 0, occupied: false };
  }

  /* -------------------------------------------------------- collision */
  function tile(w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return S;
    return w.tiles[ty * w.W + tx];
  }
  FI.tileAt = tile;

  function tileHit(w, x, y, ew, eh, down, oldBottom) {
    var x0 = Math.floor(x / T), x1 = Math.floor((x + ew - 1) / T);
    var y0 = Math.floor(y / T), y1 = Math.floor((y + eh - 1) / T);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var t = tile(w, tx, ty);
        if (t === E) continue;
        if (t === ONE) { if (down && oldBottom <= ty * T) return true; continue; }
        return true;
      }
    }
    return false;
  }

  function ov(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Returns null (free), STATIC, or the blocking entity.
  function blockerAt(w, e, nx, ny, down, ignM, ignSet) {
    if (tileHit(w, nx, ny, e.w, e.h, down, e.y + e.h)) return STATIC;
    var i;
    for (i = 0; i < w.movers.length; i++) {
      var m = w.movers[i];
      if (m !== ignM && ov(nx, ny, e.w, e.h, m.x, m.y, m.w, m.h)) return STATIC;
    }
    for (i = 0; i < w.boxes.length; i++) {
      var b = w.boxes[i];
      if (b !== e && (!ignSet || ignSet.indexOf(b) < 0) && ov(nx, ny, e.w, e.h, b.x, b.y, b.w, b.h)) return b;
    }
    if (e.isBox) {
      for (i = 0; i < w.players.length; i++) {
        var p = w.players[i];
        if (p.alive && (!ignSet || ignSet.indexOf(p) < 0) && ov(nx, ny, e.w, e.h, p.x, p.y, p.w, p.h)) return p;
      }
    }
    return null;
  }
  FI.blockerAt = blockerAt;

  function ridersOf(w, t) {
    var out = [];
    function chk(e) {
      if (e !== t && (!e.isPlayer || e.alive) && e.y + e.h === t.y && e.x < t.x + t.w && e.x + e.w > t.x) out.push(e);
    }
    w.players.forEach(chk); w.boxes.forEach(chk);
    return out;
  }
  function allRiders(w, m) {
    var list = [], q = [m];
    while (q.length) {
      var t = q.shift(), rs = ridersOf(w, t);
      for (var i = 0; i < rs.length; i++) if (list.indexOf(rs[i]) < 0) { list.push(rs[i]); q.push(rs[i]); }
    }
    return list;
  }

  function pushBox(w, b, s, depth) {
    var blk = blockerAt(w, b, b.x + s, b.y, false);
    if (blk && blk.isBox && depth < 2 && pushBox(w, blk, s, depth + 1)) blk = blockerAt(w, b, b.x + s, b.y, false);
    if (blk) return false;
    var riders = ridersOf(w, b);
    b.x += s;
    for (var i = 0; i < riders.length; i++) {
      var r = riders[i];
      if (!blockerAt(w, r, r.x + s, r.y, false)) r.x += s;
    }
    b.pushT = 0.12;
    return true;
  }

  function moveX(w, e, amt) {
    e.rx += amt;
    var mv = Math.round(e.rx);
    if (!mv) return false;
    e.rx -= mv;
    var s = mv > 0 ? 1 : -1;
    while (mv !== 0) {
      var b = blockerAt(w, e, e.x + s, e.y, false);
      if (!b) { e.x += s; mv -= s; continue; }
      if (e.isPlayer && b.isBox && pushBox(w, b, s, 0)) { e.x += s; mv -= s; e.pushing = s; continue; }
      if (e.isPlayer && b.isBox) e.pushing = s;
      e.rx = 0;
      return true;
    }
    return false;
  }
  function moveY(w, e, amt) {
    e.ry += amt;
    var mv = Math.round(e.ry);
    if (!mv) return false;
    e.ry -= mv;
    var s = mv > 0 ? 1 : -1;
    while (mv !== 0) {
      var b = blockerAt(w, e, e.x, e.y + s, s > 0);
      if (!b) { e.y += s; mv -= s; continue; }
      e.ry = 0;
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------- movers */
  function entities(w) {
    var out = [];
    for (var i = 0; i < w.players.length; i++) if (w.players[i].alive) out.push(w.players[i]);
    for (i = 0; i < w.boxes.length; i++) out.push(w.boxes[i]);
    return out;
  }

  function stepMover(w, m, sx, sy) {
    var riders = allRiders(w, m), i, r, ents;
    if (sy < 0) {
      riders.sort(function (a, b) { return a.y - b.y; });
      var moved = [];
      for (i = 0; i < riders.length; i++) {
        r = riders[i];
        if (blockerAt(w, r, r.x, r.y - 1, false, m, riders)) {
          for (var k = 0; k < moved.length; k++) moved[k].y += 1;
          return false;
        }
        r.y -= 1; moved.push(r);
      }
      m.y -= 1;
      return true;
    }
    if (sy > 0) {
      m.y += 1;
      ents = entities(w);
      var pushed = [];
      for (i = 0; i < ents.length; i++) {
        var e = ents[i];
        if (riders.indexOf(e) >= 0) continue;
        if (ov(e.x, e.y, e.w, e.h, m.x, m.y, m.w, m.h)) {
          if (blockerAt(w, e, e.x, e.y + 1, true, m)) {
            m.y -= 1;
            for (var k2 = 0; k2 < pushed.length; k2++) pushed[k2].y -= 1;
            return false;
          }
          e.y += 1; pushed.push(e);
        }
      }
      riders.sort(function (a, b) { return b.y - a.y; });
      for (i = 0; i < riders.length; i++) {
        r = riders[i];
        if (!blockerAt(w, r, r.x, r.y + 1, true)) r.y += 1;
      }
      return true;
    }
    // horizontal
    m.x += sx;
    ents = entities(w);
    var pushedX = [];
    for (i = 0; i < ents.length; i++) {
      var e2 = ents[i];
      if (riders.indexOf(e2) >= 0) continue;
      if (ov(e2.x, e2.y, e2.w, e2.h, m.x, m.y, m.w, m.h)) {
        if (blockerAt(w, e2, e2.x + sx, e2.y, false, m)) {
          m.x -= sx;
          for (var k3 = 0; k3 < pushedX.length; k3++) pushedX[k3].x -= sx;
          return false;
        }
        e2.x += sx; pushedX.push(e2);
      }
    }
    riders.sort(function (a, b) { return sx > 0 ? b.x - a.x : a.x - b.x; });
    for (i = 0; i < riders.length; i++) {
      r = riders[i];
      if (!blockerAt(w, r, r.x + sx, r.y, false)) r.x += sx;
    }
    return true;
  }

  function updateMover(w, m, dt) {
    var px = m.x, py = m.y;
    updateMover2(w, m, dt);
    m.vx = (m.x - px) / dt; m.vy = (m.y - py) / dt;
  }
  function updateMover2(w, m, dt) {
    var toB;
    if (m.ch) { toB = !!w.chan[m.ch]; if (m.inv) toB = !toB; }
    else {
      if (m.wait > 0) { m.wait -= dt; m.moving = false; return; }
      toB = m.goB;
    }
    var tx = toB ? m.bx : m.ax, ty = toB ? m.by : m.ay;
    var dx = tx - m.fx, dy = ty - m.fy, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) {
      m.fx = m.x = tx; m.fy = m.y = ty;
      if (!m.ch) { m.goB = !m.goB; m.wait = m.pause; }
      if (m.moving) w.events.push({ t: 'moverStop', m: m });
      m.moving = false;
      return;
    }
    var step = Math.min(d, m.speed * dt);
    var nfx = m.fx + dx / d * step, nfy = m.fy + dy / d * step;
    if (d - step < 0.001) { nfx = tx; nfy = ty; }
    var ix = Math.round(nfx) - m.x, iy = Math.round(nfy) - m.y, blocked = false;
    while (ix !== 0) { var sx = ix > 0 ? 1 : -1; if (!stepMover(w, m, sx, 0)) { blocked = true; break; } ix -= sx; }
    while (!blocked && iy !== 0) { var sy = iy > 0 ? 1 : -1; if (!stepMover(w, m, 0, sy)) { blocked = true; break; } iy -= sy; }
    if (blocked) { m.fx = m.x; m.fy = m.y; m.blocked = true; }
    else { m.fx = nfx; m.fy = nfy; m.blocked = false; }
    if (!m.moving && !blocked) w.events.push({ t: 'moverStart', m: m });
    m.moving = !blocked;
  }

  /* ------------------------------------------------------- channels */
  function computeChannels(w) {
    var ch = {}, i, k;
    // levers of one colour work like hallway switches: flipping any of them toggles the colour
    for (i = 0; i < w.levers.length; i++) if (w.levers[i].on) ch[w.levers[i].ch] = !ch[w.levers[i].ch];
    var ents = entities(w), pressed = {};
    for (i = 0; i < w.buttons.length; i++) {
      var b = w.buttons[i], down = false;
      var floorY = b.y + T;
      for (k = 0; k < ents.length; k++) {
        var e = ents[k];
        var bot = e.y + e.h;
        if (bot >= floorY - 10 && bot <= floorY && e.x < b.x + T - 5 && e.x + e.w > b.x + 5) { down = true; break; }
      }
      if (down && !b.down) w.events.push({ t: 'button', on: true, b: b });
      if (!down && b.down) w.events.push({ t: 'button', on: false, b: b });
      b.down = down;
      if (down) pressed[b.ch] = true;
    }
    for (k in pressed) ch[k] = true;
    w.chan = ch;
    for (i = 0; i < w.fans.length; i++) {
      var f = w.fans[i];
      f.on = f.ch ? (!!ch[f.ch] !== f.inv) : true;
    }
  }

  /* --------------------------------------------------------- players */
  function inFan(w, e) {
    for (var i = 0; i < w.fans.length; i++) {
      var f = w.fans[i];
      if (!f.on) continue;
      if (e.x + e.w > f.x + 3 && e.x < f.x + f.w - 3 && e.y < f.y && e.y + e.h > f.top) {
        var s = (e.y + e.h - f.top) / (2.4 * T);
        return s < 0 ? 0 : s > 1 ? 1 : s;
      }
    }
    return -1;
  }

  function moverUnder(w, p) {
    for (var i = 0; i < w.movers.length; i++) {
      var m = w.movers[i];
      if (p.y + p.h === m.y && p.x < m.x + m.w && p.x + p.w > m.x) return m;
    }
    return null;
  }

  function updatePlayer(w, p, inp, dt) {
    var dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    var jp = inp.j && !p.jPrev;
    p.jPrev = !!inp.j;
    if (jp) p.buffer = PH.buffer; else p.buffer -= dt;
    var wasGrounded = p.grounded;
    p.grounded = p.vy >= 0 && !!blockerAt(w, p, p.x, p.y + 1, true);
    if (p.grounded) p.coyote = PH.coyote; else p.coyote -= dt;
    if (p.grounded) { var mu = moverUnder(w, p); p.baseVx = mu ? mu.vx : 0; }
    var maxS = p.pushing ? PH.pushSpeed : PH.speed;
    var acc = p.grounded ? (dir ? PH.accG : PH.decG) : (dir ? PH.accA : PH.decA);
    var target = dir * maxS + (p.grounded ? 0 : p.baseVx);
    if (dir && Math.abs(p.vx) > maxS && Math.sign(p.vx) === dir) target = p.vx; // keep momentum
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);
    if (dir) p.face = dir;

    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -PH.jumpV; p.buffer = 0; p.coyote = 0; p.jumping = true; p.grounded = false;
      w.events.push({ t: 'jump', p: p });
    }
    if (p.jumping && !inp.j && p.vy < 0) { p.vy *= PH.cut; p.jumping = false; }
    if (p.vy >= 0) p.jumping = false;

    var fan = inFan(w, p);
    p.inFan = fan >= 0;
    var g = p.vy < 0 ? PH.gUp : PH.gDown;
    if (fan >= 0) {
      p.vy += (PH.gUp - PH.fanAcc * fan) * dt;
      if (p.vy < -PH.fanUp) p.vy = -PH.fanUp;
      if (p.vy > 260) p.vy -= 3000 * dt;
      p.jumping = false;
    } else if (!p.grounded || p.vy < 0) {
      p.vy += g * dt;
    }
    if (p.vy > PH.maxFall) p.vy = PH.maxFall;

    p.pushing = 0;
    if (moveX(w, p, p.vx * dt) && !p.pushing) p.vx = 0;
    if (p.pushing && Math.abs(p.vx) > PH.pushSpeed) p.vx = PH.pushSpeed * p.pushing;
    var preVy = p.vy;
    if (moveY(w, p, p.vy * dt)) {
      if (p.vy > 0) { p.fallV = preVy; }
      else if (p.vy < 0) w.events.push({ t: 'bonk', p: p });
      p.vy = 0;
    }
    var nowG = p.vy >= 0 && !!blockerAt(w, p, p.x, p.y + 1, true);
    if (nowG && !wasGrounded && p.airT > 0.05) w.events.push({ t: 'land', p: p, v: p.fallV });
    if (!nowG) p.airT += dt; else p.airT = 0;
    if (nowG && p.vy > 0) p.vy = 0;
    p.grounded = nowG;
    if (nowG) p.coyote = PH.coyote;
  }

  function footTile(w, p) {
    if ((p.y + p.h) % T !== 0) return 0;
    var ty = (p.y + p.h) / T;
    var x0 = Math.floor((p.x + 5) / T), x1 = Math.floor((p.x + p.w - 6) / T);
    var res = 0;
    for (var tx = x0; tx <= x1; tx++) {
      var t = tile(w, tx, ty);
      if (t === GOO) return GOO;
      if (t === LAVA || t === WATER) res = res || t;
    }
    return res;
  }
  FI.footTile = footTile;

  function kill(w, p, cause) {
    if (!p.alive || w.state !== 'play') return;
    p.alive = false;
    w.state = 'dead'; w.deadT = 0; w.deadWho = p.kind; w.deadCause = cause;
    w.events.push({ t: 'die', p: p, cause: cause });
  }

  function hazards(w, p) {
    if (!p.alive) return;
    p.onLiquid = 0;
    if (!p.grounded) return;
    var ft = footTile(w, p);
    if (!ft) return;
    if (ft === GOO) return kill(w, p, 'goo');
    if (ft === LAVA && p.kind === 'ice') return kill(w, p, 'lava');
    if (ft === WATER && p.kind === 'fire') return kill(w, p, 'water');
    p.onLiquid = ft;
  }

  function portals(w, e) {
    var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (e.portalLock) {
      var L = e.portalLock;
      if (!(cx > L.x - 6 && cx < L.x + L.w + 6 && cy > L.y - 6 && cy < L.y + L.h + 6)) e.portalLock = null;
      else return;
    }
    for (var i = 0; i < w.portals.length; i++) {
      var P = w.portals[i];
      if (!P.dest) continue;
      if (cx > P.x + 5 && cx < P.x + P.w - 5 && cy > P.y + 4 && cy < P.y + P.h) {
        var D = P.dest;
        var nx = Math.round(D.x + (T - e.w) / 2), ny = D.y + D.h - e.h;
        var old = { x: e.x, y: e.y };
        e.x = nx; e.y = ny;
        if (blockerAt(w, e, e.x, e.y, false)) { e.x = old.x; e.y = old.y; continue; }
        e.rx = 0; e.ry = 0; e.portalLock = D;
        w.events.push({ t: 'portal', e: e, from: P, to: D, ox: old.x, oy: old.y });
        return;
      }
    }
  }

  /* ------------------------------------------------------------ step */
  var NOIN = { l: false, r: false, j: false };
  function step(w, input, dt) {
    dt = dt || 1 / 60;
    w.frame++;
    var playing = w.state === 'play';
    if (playing) w.t += dt;
    var i;
    for (i = 0; i < w.movers.length; i++) updateMover(w, w.movers[i], dt);
    for (i = 0; i < w.players.length; i++) {
      var p = w.players[i];
      if (!p.alive) continue;
      var inp = playing ? (input && input[p.kind]) || NOIN : NOIN;
      if (w.state === 'won') inp = NOIN;
      updatePlayer(w, p, inp, dt);
    }
    for (i = 0; i < w.boxes.length; i++) {
      var b = w.boxes[i];
      var bg = !!blockerAt(w, b, b.x, b.y + 1, true);
      if (!bg) { b.vy = Math.min(PH.maxFall, b.vy + PH.gDown * dt); }
      if (moveY(w, b, b.vy * dt)) { if (b.vy > 300) w.events.push({ t: 'boxLand', b: b, v: b.vy }); b.vy = 0; }
      b.grounded = !!blockerAt(w, b, b.x, b.y + 1, true);
      if (b.pushT > 0) b.pushT -= dt;
      portals(w, b);
    }
    for (i = 0; i < w.players.length; i++) {
      var q = w.players[i];
      if (!q.alive) continue;
      portals(w, q);
      hazards(w, q);
      // gems
      for (var g = 0; g < w.gems.length; g++) {
        var gem = w.gems[g];
        if (gem.got || gem.kind !== q.kind) continue;
        if (Math.abs(q.x + q.w / 2 - gem.x) < 22 && Math.abs(q.y + q.h / 2 - gem.y) < 30) {
          gem.got = true; w.gemsGot[q.kind]++;
          w.events.push({ t: 'gem', gem: gem, p: q });
        }
      }
      // levers: bump into one to flip it (once per visit)
      for (var l = 0; l < w.levers.length; l++) {
        var lv = w.levers[l];
        var cx = q.x + q.w / 2;
        var inL = Math.abs(cx - (lv.x + T / 2)) < 13 && q.y < lv.y + T && q.y + q.h > lv.y + 4;
        var tag = q.kind === 'fire' ? 'inF' : 'inI';
        if (inL && !lv[tag]) {
          lv.on = !lv.on; lv.dir = q.vx >= 0 ? 1 : -1;
          w.events.push({ t: 'lever', lv: lv, on: lv.on });
        }
        lv[tag] = inL;
      }
      // exits
      var ex = w.exits[q.kind];
      var cxp = q.x + q.w / 2, bot = q.y + q.h;
      q.atDoor = !!ex && q.grounded && cxp > ex.x - 4 && cxp < ex.x + T + 4 && bot > ex.y + T && bot <= ex.y + 2 * T + 2;
    }
    for (i = 0; i < w.levers.length; i++) {
      var lvr = w.levers[i];
      lvr.ang += ((lvr.on ? 1 : -1) - lvr.ang) * Math.min(1, dt * 14);
    }
    computeChannels(w);
    for (i = 0; i < w.buttons.length; i++) {
      var bt = w.buttons[i];
      bt.amt += ((bt.down ? 1 : 0) - bt.amt) * Math.min(1, dt * 20);
    }
    ['fire', 'ice'].forEach(function (k) {
      var ex = w.exits[k], p = w[k];
      var o = p.alive && p.atDoor;
      if (o && !ex.occupied) w.events.push({ t: 'door', kind: k });
      ex.occupied = o;
      ex.open += ((o || w.state === 'won' ? 1 : 0) - ex.open) * Math.min(1, dt * 8);
    });
    if (w.state === 'play') {
      if (w.fire.atDoor && w.ice.atDoor) {
        w.winT += dt;
        if (w.winT >= 0.45) { w.state = 'won'; w.events.push({ t: 'win' }); }
      } else w.winT = 0;
    } else if (w.state === 'dead') w.deadT += dt;
  }

  FI.build = build;
  FI.step = step;
  FI.ov = ov;
})(typeof window !== 'undefined' ? window : globalThis);
