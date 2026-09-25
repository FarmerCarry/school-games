/*
 * Sneaky Levels — deterministic platformer engine (no DOM, no randomness).
 * Runs at a fixed 60 Hz step so recorded solutions replay exactly, both in
 * the browser and in Node (see verify.js).
 *
 * Map legend (32 x 18 tiles, 40 px each):
 *   #  solid            a-z  movable group tiles       =  fake block (looks solid)
 *   !  invisible block (solid, appears when touched)
 *   ^ v < >  spikes     1-9  hidden spike group (pops out of the neighbouring block)
 *   P  player start     D  exit door     E  fake door    J  spring    G  gravity flipper
 */
(function (root) {
  'use strict';

  var T = 40, COLS = 32, ROWS = 18, WW = COLS * T, WH = ROWS * T, DT = 1 / 60;
  var PH = {
    w: 26, h: 34, run: 300, accG: 3400, turnG: 6200, decG: 4200, accA: 2500, decA: 1500,
    g: 2300, jump: 690, cut: 220, maxFall: 1000, coyote: 0.1, buffer: 0.13, spring: 1260
  };
  var DEAD_T = 0.28;

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function approach(v, t, d) { return v < t ? Math.min(t, v + d) : Math.max(t, v - d); }

  /* ------------------------------------------------------------ Group */
  function Group(world, id) {
    this.w = world; this.id = id; this.tiles = [];
    this.ox = 0; this.oy = 0; this.active = true; this.fake = false;
    this.invis = false; this.revealed = false; this.m = null; this.shakeT = 0;
    this.crumbleDelay = -1; this.alpha = 1;
  }
  Group.prototype.drop = function (delay, land) {
    if (this.m && this.m.type === 'drop') return this;
    this.m = { type: 'drop', delay: delay || 0, vy: 0, land: !!land };
    this.shakeT = delay || 0;
    this.w.emit('drop', { g: this, delay: delay || 0 });
    return this;
  };
  // Move by (dx, dy) tiles at `speed` tiles/s after `delay` s, then call `then`.
  Group.prototype.move = function (dx, dy, speed, delay, then) {
    this.m = { type: 'move', delay: delay || 0, tx: this.ox + dx * T, ty: this.oy + dy * T, speed: speed * T, then: then || null, started: false };
    if (delay) this.shakeT = Math.min(delay, 0.35);
    return this;
  };
  Group.prototype.moveTo = function (ox, oy, speed, delay, then) {
    return this.move(ox - this.ox / T, oy - this.oy / T, speed, delay, then);
  };
  Group.prototype.hide = function () { if (this.active) { this.active = false; this.w.emit('poof', { g: this }); } return this; };
  Group.prototype.show = function () { this.active = true; this.w.pushOut(this); return this; };
  Group.prototype.setFake = function (f) { this.fake = f !== false; return this; };
  Group.prototype.shake = function (s) { this.shakeT = s; return this; };
  Group.prototype.crumble = function (delay) {
    var w = this.w, self = this;
    this.tiles.forEach(function (tl, i) {
      var sg = w.newGroup(self.id + '~' + i);
      sg.tiles.push(tl); sg.crumbleDelay = delay == null ? 0.12 : delay;
      w.owner[tl.y * COLS + tl.x] = sg;
      w.reattach(self, sg, tl);
    });
    this.tiles = []; this.active = false;
    return this;
  };
  Group.prototype.rects = function (fn) {
    for (var i = 0; i < this.tiles.length; i++) {
      var tl = this.tiles[i];
      fn(tl.x * T + this.ox, tl.y * T + this.oy);
    }
  };

  /* ------------------------------------------------------------ World */
  function World(def, opts) {
    opts = opts || {};
    this.def = def;
    this.emit = opts.emit || function () {};
    this.attempt = 0;
    this.rects = [];
    this.reset();
  }
  var W = World.prototype;

  W.newGroup = function (id) {
    var g = new Group(this, id);
    this.groups.push(g); this.gmap[id] = g;
    return g;
  };

  W.solidTile = function (x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (this.grid[y * COLS + x]) return true;
    return !!this.owner[y * COLS + x];
  };

  W.reset = function () {
    var map = this.def.map, x, y, c, g;
    this.t = 0; this.state = 'play'; this.stateT = 0;
    this.grid = new Uint8Array(COLS * ROWS);
    this.owner = {};
    this.groups = []; this.gmap = {};
    this.spikes = []; this.doors = []; this.springs = []; this.saws = []; this.gz = [];
    this.triggers = []; this.timers = []; this.ticks = []; this.flipWarn = 0;
    this.gs = 1; this.revT = 0; this.winDoor = null;
    var start = { x: 2, y: 12 };
    for (y = 0; y < ROWS; y++) {
      var row = map[y] || '';
      for (x = 0; x < COLS; x++) {
        c = row[x] || ' ';
        if (c === '#') this.grid[y * COLS + x] = 1;
        else if ((c >= 'a' && c <= 'z' && c !== 'v') || c === '=') {
          g = this.gmap[c] || this.newGroup(c);
          if (c === '=') g.fake = true;
          g.tiles.push({ x: x, y: y });
          this.owner[y * COLS + x] = g;
        } else if (c === '!') {
          g = this.newGroup('!' + x + '_' + y);
          g.invis = true; g.tiles.push({ x: x, y: y });
          this.owner[y * COLS + x] = g;
        } else if (c === 'P') start = { x: x, y: y };
      }
    }
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        c = (map[y] || '')[x] || ' ';
        var dir = null, hid = 0;
        if (c === '^') dir = 'u'; else if (c === 'v') dir = 'd'; else if (c === '<') dir = 'l'; else if (c === '>') dir = 'r';
        else if (c >= '1' && c <= '9') {
          hid = +c;
          if (this.solidTile(x, y + 1)) dir = 'u';
          else if (this.solidTile(x, y - 1)) dir = 'd';
          else if (this.solidTile(x - 1, y)) dir = 'r';
          else dir = 'l';
        }
        if (dir) {
          var bx = dir === 'r' ? x - 1 : dir === 'l' ? x + 1 : x;
          var by = dir === 'u' ? y + 1 : dir === 'd' ? y - 1 : y;
          this.spikes.push({ x: x * T, y: y * T, dir: dir, g: this.owner[by * COLS + bx] || null, hid: hid, out: hid ? 0 : 1, target: hid ? 0 : 1, speed: 16, bx: bx, by: by });
          continue;
        }
        if (c === 'D' || c === 'E') {
          var hang = !this.solidTile(x, y + 1) && this.solidTile(x, y - 1);
          var base = hang ? (y - 1) * COLS + x : (y + 1) * COLS + x;
          this.doors.push({ x: x * T, y: hang ? y * T : y * T + T - 60, w: 40, h: 60, fake: c === 'E', hang: hang, g: this.owner[base] || null, m: null, onTouch: null, bx: x, by: hang ? y - 1 : y + 1, anim: 0 });
        } else if (c === 'J') {
          var jh = !this.solidTile(x, y + 1) && this.solidTile(x, y - 1);
          this.springs.push({ x: x * T, y: y * T, hang: jh, g: this.owner[(jh ? y - 1 : y + 1) * COLS + x] || null, anim: 0, bx: x, by: jh ? y - 1 : y + 1 });
        } else if (c === 'G') {
          this.gz.push({ x: x * T, y: y * T });
        }
      }
    }
    this.p = {
      x: start.x * T + (T - PH.w) / 2, y: start.y * T + T - PH.h, vx: 0, vy: 0,
      onGround: true, ground: null, coy: 0, buf: 0, jumping: false, face: 1, inG: false,
      sx: 1, sy: 1, runT: 0, airT: 0
    };
    this.door = null; this.fakes = [];
    for (var i = 0; i < this.doors.length; i++) {
      if (this.doors[i].fake) this.fakes.push(this.doors[i]); else if (!this.door) this.door = this.doors[i];
    }
    if (this.def.script) this.def.script(this.api());
  };

  // When a group crumbles into sub-groups, move attachments along.
  W.reattach = function (from, to, tl) {
    var lists = [this.spikes, this.doors, this.springs];
    for (var l = 0; l < lists.length; l++) {
      for (var i = 0; i < lists[l].length; i++) {
        var s = lists[l][i];
        if (s.g === from && s.bx === tl.x && s.by === tl.y) s.g = to;
      }
    }
  };

  W.spikeCtl = function (n) {
    var w = this, list = this.spikes.filter(function (s) { return s.hid === n; });
    var ctl = {
      list: list,
      pop: function (delay) {
        if (delay) { w.timers.push({ t: delay, f: function () { ctl.pop(0); } }); return ctl; }
        var any = false;
        list.forEach(function (s) { if (s.target === 0) any = true; s.target = 1; s.speed = 16; });
        if (any && list.length) w.emit('pop', { x: list[0].x + T / 2, y: list[0].y + T / 2 });
        return ctl;
      },
      hide: function (delay) {
        if (delay) { w.timers.push({ t: delay, f: function () { ctl.hide(0); } }); return ctl; }
        list.forEach(function (s) { s.target = 0; s.speed = 5; });
        return ctl;
      },
      isOut: function () { return list.length && list[0].out > 0.5; }
    };
    return ctl;
  };

  W.api = function () {
    var w = this;
    var api = {
      T: T, COLS: COLS, ROWS: ROWS, world: w, attempt: w.attempt,
      px: function () { return (w.p.x + PH.w / 2) / T; },
      py: function () { return (w.p.y + PH.h / 2) / T; },
      grounded: function () { return w.p.onGround; },
      air: function () { return !w.p.onGround; },
      on: function (ch) { return w.p.onGround && w.p.ground === w.gmap[ch]; },
      t: function () { return w.t; },
      when: function (cond, act) { w.triggers.push({ c: cond, a: act, done: false }); },
      onX: function (tx, act) { api.when(function () { return api.px() >= tx; }, act); },
      onXl: function (tx, act) { api.when(function () { return api.px() <= tx; }, act); },
      zone: function (x0, y0, x1, y1) {
        return function () { var x = api.px(), y = api.py(); return x >= x0 && x < x1 && y >= y0 && y < y1; };
      },
      after: function (s, fn) { w.timers.push({ t: s, f: fn }); },
      every: function (s, fn, first) {
        var loop = function () { fn(); w.timers.push({ t: s, f: loop }); };
        w.timers.push({ t: first == null ? s : first, f: loop });
      },
      g: function (ch) { return w.gmap[ch]; },
      sp: function (n) { return w.spikeCtl(n); },
      door: w.door, fakes: w.fakes, doors: w.doors,
      doorTo: function (d, tx, ty, speed, delay, then) {
        d.m = { tx: tx * T, ty: ty * T + (d.hang ? 0 : T - 60), speed: speed * T, delay: delay || 0, then: then || null };
        if (d.g) { d.x += d.g.ox; d.y += d.g.oy; d.g = null; }
        w.emit('doormove', { d: d });
      },
      saw: function (o) {
        var s = {
          x: o.x * T, y: o.y * T, r: o.r || 30, mode: o.mode || 'chase', speed: (o.speed || 4) * T,
          vx: 0, vy: 0, active: o.active !== false, path: (o.path || []).map(function (q) { return [q[0] * T, q[1] * T]; }),
          pi: 0, rot: 0, loop: !!o.loop, dirp: 1
        };
        w.saws.push(s);
        return s;
      },
      wake: function (s) { if (!s.active) { s.active = true; w.emit('saw', { s: s }); } },
      flip: function () { w.flip(); },
      reverse: function (s) { w.revT = s; w.emit('reverse', { t: s }); },
      msg: function (text) { w.emit('msg', { text: text }); },
      shake: function (a) { w.emit('shake', { a: a }); },
      sfx: function (name) { w.emit('sfx', { name: name }); }
    };
    return api;
  };

  W.flip = function () {
    this.gs = -this.gs; this.p.jumping = false; this.p.onGround = false; this.p.coy = 0;
    this.emit('flip', { gs: this.gs });
  };

  /* ---- solid queries (rects reused to avoid garbage) ---- */
  W.collect = function (x, y, w, h, skip) {
    var out = this.rects; out.length = 0;
    var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.001) / T);
    var y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.001) / T);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (tx < 0 || tx >= COLS) { if (ty < ROWS + 2 && ty > -3) out.push({ x: tx * T, y: ty * T, w: T, h: T, g: null }); continue; }
        if (ty < 0 || ty >= ROWS) continue;
        if (this.grid[ty * COLS + tx]) out.push({ x: tx * T, y: ty * T, w: T, h: T, g: null });
      }
    }
    for (var i = 0; i < this.groups.length; i++) {
      var g = this.groups[i];
      if (!g.active || g.fake || g === skip) continue;
      for (var k = 0; k < g.tiles.length; k++) {
        var rx = g.tiles[k].x * T + g.ox, ry = g.tiles[k].y * T + g.oy;
        if (overlap(x, y, w, h, rx, ry, T, T)) out.push({ x: rx, y: ry, w: T, h: T, g: g });
      }
    }
    return out;
  };

  W.moveX = function (dx, skip) {
    var p = this.p;
    if (!dx) return;
    p.x += dx;
    var rs = this.collect(p.x, p.y, PH.w, PH.h, skip);
    if (!rs.length) return;
    var nx = p.x;
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.g && r.g.invis) this.reveal(r.g);
      if (dx > 0) nx = Math.min(nx, r.x - PH.w); else nx = Math.max(nx, r.x + r.w);
    }
    p.x = nx; p.vx = 0;
  };

  W.moveY = function (dy) {
    var p = this.p;
    if (!dy) return;
    p.y += dy;
    var rs = this.collect(p.x, p.y, PH.w, PH.h);
    if (!rs.length) return;
    var ny = p.y, gref = null;
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.g && r.g.invis) this.reveal(r.g);
      if (dy > 0) { if (r.y - PH.h <= ny) { ny = r.y - PH.h; gref = r; } }
      else if (r.y + r.h >= ny) { ny = r.y + r.h; gref = r; }
    }
    p.y = ny;
    var down = dy * this.gs > 0;
    if (down) { p.onGround = true; p.ground = gref ? gref.g : null; }
    else if (Math.abs(p.vy) > 250) this.emit('bonk', { x: p.x + PH.w / 2, y: dy < 0 ? p.y : p.y + PH.h });
    p.vy = 0;
  };

  W.reveal = function (g) {
    if (!g.revealed) { g.revealed = true; this.emit('reveal', { g: g }); }
  };

  W.anySolid = function () {
    var p = this.p;
    return this.collect(p.x + 1, p.y + 1, PH.w - 2, PH.h - 2).length > 0;
  };

  // A group appeared on top of the player: push the player out (or squash).
  W.pushOut = function (g) {
    var p = this.p, hit = false, top = 1e9;
    g.rects(function (rx, ry) { if (overlap(p.x, p.y, PH.w, PH.h, rx, ry, T, T)) { hit = true; top = Math.min(top, ry); } });
    if (hit) { p.y = top - PH.h; if (this.anySolid()) this.die('crush'); }
  };

  W.shiftGroup = function (g, dx, dy) {
    var p = this.p;
    var riding = this.state === 'play' && p.onGround && p.ground === g && dy * this.gs <= 0.0001;
    g.ox += dx; g.oy += dy;
    if (this.state !== 'play') return;
    if (riding) {
      this.moveX(dx, g);
      p.y += dy;
    }
    var hit = false, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    g.rects(function (rx, ry) {
      if (overlap(p.x, p.y, PH.w, PH.h, rx, ry, T, T)) {
        hit = true; minX = Math.min(minX, rx); maxX = Math.max(maxX, rx + T); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry + T);
      }
    });
    if (hit) {
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (dy > 0) { p.y = maxY; if (this.gs < 0) { p.onGround = true; p.ground = g; p.vy = Math.max(p.vy, 0); } else p.vy = Math.max(p.vy, dy / DT); }
        else { p.y = minY - PH.h; if (this.gs > 0) { p.onGround = true; p.ground = g; p.vy = Math.min(p.vy, 0); } else p.vy = Math.min(p.vy, dy / DT); }
      } else {
        if (dx > 0) p.x = maxX; else p.x = minX - PH.w;
      }
    }
    if ((hit || riding) && this.anySolid()) this.die('crush');
  };

  W.die = function (cause) {
    if (this.state !== 'play') return;
    this.state = 'dead'; this.stateT = 0; this.cause = cause;
    var p = this.p;
    this.emit('die', { cause: cause, x: p.x + PH.w / 2, y: p.y + PH.h / 2 });
  };

  /* ------------------------------------------------------------ step */
  W.step = function (inp) {
    var i, p = this.p;
    this.t += DT;
    if (this.state === 'dead') {
      this.stateT += DT;
      if (this.stateT >= DEAD_T) { this.attempt++; this.reset(); this.emit('respawn', {}); }
      return;
    }
    if (this.state === 'win') { this.stateT += DT; return; }

    // timers & triggers (scripted traps)
    for (i = 0; i < this.timers.length; i++) {
      var tm = this.timers[i];
      tm.t -= DT;
      if (tm.t <= 0) { this.timers.splice(i, 1); i--; tm.f(); if (this.state !== 'play') return; }
    }
    for (i = 0; i < this.triggers.length; i++) {
      var tr = this.triggers[i];
      if (!tr.done && tr.c()) { tr.done = true; tr.a(); }
    }
    for (i = 0; i < this.ticks.length; i++) this.ticks[i]();

    this.updateGroups();
    if (this.state !== 'play') return;
    this.updateDoors();
    this.updateSpikes();
    this.updateSaws();
    this.updatePlayer(inp);
    if (this.state !== 'play') return;
    this.checkHazards();
  };

  W.updateGroups = function () {
    for (var i = 0; i < this.groups.length; i++) {
      var g = this.groups[i];
      if (!g.active) continue;
      if (g.shakeT > 0) g.shakeT -= DT;
      if (g.crumbleDelay >= 0 && !g.m && this.p.onGround && this.p.ground === g && this.state === 'play') {
        g.drop(g.crumbleDelay);
        this.emit('crumble', { g: g });
      }
      var m = g.m;
      if (!m) continue;
      if (m.delay > 0) { m.delay -= DT; continue; }
      var dx = 0, dy = 0, done = false;
      if (m.type === 'drop') {
        m.vy = Math.min(m.vy + 2600 * DT, 1300);
        dy = m.vy * DT;
        if (m.land) {
          // stop on anything solid below
          var oy0 = g.oy, self = this, pen = 0;
          g.oy += dy;
          g.rects(function (rx, ry) {
            var rs = self.collect(rx, ry, T, T, g);
            for (var k = 0; k < rs.length; k++) pen = Math.max(pen, ry + T - rs[k].y);
          });
          g.oy = oy0;
          if (pen > 0) { dy -= pen; done = true; }
        }
      } else if (m.type === 'move') {
        if (!m.started) { m.started = true; this.emit('gmove', { g: g }); }
        var rx = m.tx - g.ox, ry = m.ty - g.oy, d = Math.sqrt(rx * rx + ry * ry), st = m.speed * DT;
        if (d <= st) { dx = rx; dy = ry; done = true; } else { dx = rx / d * st; dy = ry / d * st; }
      }
      this.shiftGroup(g, dx, dy);
      if (m.type === 'drop' && !done && g.oy > WH + 60) { g.active = false; g.m = null; }
      if (done) {
        g.m = null;
        if (m.type === 'drop') this.emit('thud', { g: g });
        if (m.then) m.then();
      }
      if (this.state !== 'play') return;
    }
  };

  W.updateDoors = function () {
    for (var i = 0; i < this.doors.length; i++) {
      var d = this.doors[i], m = d.m;
      d.anim += DT;
      if (!m) continue;
      if (m.delay > 0) { m.delay -= DT; continue; }
      var rx = m.tx - d.x, ry = m.ty - d.y, dist = Math.sqrt(rx * rx + ry * ry), st = m.speed * DT;
      if (dist <= st) { d.x = m.tx; d.y = m.ty; d.m = null; if (m.then) m.then(); }
      else { d.x += rx / dist * st; d.y += ry / dist * st; }
    }
  };

  W.updateSpikes = function () {
    for (var i = 0; i < this.spikes.length; i++) {
      var s = this.spikes[i];
      if (s.out !== s.target) s.out = approach(s.out, s.target, s.speed * DT);
    }
  };

  W.updateSaws = function () {
    var p = this.p, cx = p.x + PH.w / 2, cy = p.y + PH.h / 2;
    for (var i = 0; i < this.saws.length; i++) {
      var s = this.saws[i];
      if (!s.active) continue;
      s.rot += DT * 14;
      if (s.mode === 'chase') {
        var dx = cx - s.x, dy = cy - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var k = Math.min(1, 3.2 * DT);
        s.vx += (dx / d * s.speed - s.vx) * k;
        s.vy += (dy / d * s.speed - s.vy) * k;
        s.x += s.vx * DT; s.y += s.vy * DT;
      } else if (s.path.length > 1) {
        var tgt = s.path[s.pi], ex = tgt[0] - s.x, ey = tgt[1] - s.y, dd = Math.sqrt(ex * ex + ey * ey), st = s.speed * DT;
        if (dd <= st) {
          s.x = tgt[0]; s.y = tgt[1];
          if (s.loop) s.pi = (s.pi + 1) % s.path.length;
          else {
            if (s.pi + s.dirp >= s.path.length || s.pi + s.dirp < 0) s.dirp = -s.dirp;
            s.pi += s.dirp;
          }
        } else { s.x += ex / dd * st; s.y += ey / dd * st; }
      }
    }
  };

  W.updatePlayer = function (inp) {
    var p = this.p, gs = this.gs, i;
    var l = !!inp.l, r = !!inp.r;
    if (this.revT > 0) { this.revT -= DT; var tmp = l; l = r; r = tmp; }
    var dir = (r ? 1 : 0) - (l ? 1 : 0);
    if (dir) p.face = dir;
    var ground = p.onGround;
    var acc;
    if (dir) acc = ground ? (p.vx * dir < 0 ? PH.turnG : PH.accG) : PH.accA;
    else acc = ground ? PH.decG : PH.decA;
    p.vx = approach(p.vx, dir * PH.run, acc * DT);

    if (inp.jp) p.buf = PH.buffer; else p.buf -= DT;
    if (ground) p.coy = PH.coyote; else p.coy -= DT;
    if (p.buf > 0 && p.coy > 0) {
      p.vy = -PH.jump * gs; p.buf = 0; p.coy = 0; p.jumping = true;
      p.onGround = false; p.ground = null;
      this.emit('jump', { x: p.x + PH.w / 2, y: gs > 0 ? p.y + PH.h : p.y });
    }
    if (p.jumping && !inp.jh && p.vy * gs < -PH.cut) p.vy = -PH.cut * gs;
    if (p.vy * gs >= 0) p.jumping = false;
    p.vy += PH.g * gs * DT;
    if (p.vy * gs > PH.maxFall) p.vy = PH.maxFall * gs;

    this.moveX(p.vx * DT);
    var wasGround = ground, vyBefore = p.vy;
    p.onGround = false; p.ground = null;
    this.moveY(p.vy * DT);
    if (p.onGround && !wasGround) this.emit('land', { v: Math.abs(vyBefore), x: p.x + PH.w / 2, y: gs > 0 ? p.y + PH.h : p.y });
    if (p.onGround && Math.abs(p.vx) > 40) {
      p.runT += DT;
      if (p.runT > 0.16) { p.runT = 0; this.emit('step', { x: p.x + PH.w / 2, y: gs > 0 ? p.y + PH.h : p.y }); }
    }
    p.airT = p.onGround ? 0 : p.airT + DT;

    // springs
    for (i = 0; i < this.springs.length; i++) {
      var s = this.springs[i];
      if (s.g && !s.g.active) continue;
      var sx = s.x + (s.g ? s.g.ox : 0), sy = s.y + (s.g ? s.g.oy : 0);
      var ry = s.hang ? sy : sy + T - 16;
      var sgs = s.hang ? -1 : 1;
      if (sgs === gs && overlap(p.x, p.y, PH.w, PH.h, sx + 4, ry, 32, 16) && p.vy * gs >= 0) {
        p.vy = -PH.spring * gs; p.jumping = false; p.onGround = false; p.coy = 0; p.buf = 0;
        s.anim = 1;
        this.emit('spring', { x: sx + T / 2, y: ry });
      }
    }
    // gravity flippers
    var cx = p.x + PH.w / 2, cy = p.y + PH.h / 2, inG = false;
    for (i = 0; i < this.gz.length; i++) {
      var z = this.gz[i];
      if (cx >= z.x && cx < z.x + T && cy >= z.y && cy < z.y + T) { inG = true; break; }
    }
    if (inG && !p.inG) this.flip();
    p.inG = inG;
  };

  W.spikeBox = function (s) {
    var ox = s.g ? s.g.ox : 0, oy = s.g ? s.g.oy : 0, sh = (1 - s.out) * T;
    var x = s.x + ox, y = s.y + oy;
    switch (s.dir) {
      case 'u': return [x + 8, y + 18 + sh, 24, 22];
      case 'd': return [x + 8, y - sh, 24, 22];
      case 'l': return [x + sh, y + 8, 22, 24];
      default: return [x + 18 - sh, y + 8, 22, 24];
    }
  };

  W.checkHazards = function () {
    var p = this.p, i;
    for (i = 0; i < this.spikes.length; i++) {
      var s = this.spikes[i];
      if (s.out < 0.5 || (s.g && !s.g.active)) continue;
      var b = this.spikeBox(s);
      if (overlap(p.x, p.y, PH.w, PH.h, b[0], b[1], b[2], b[3])) { this.die('spike'); return; }
    }
    var cx = p.x + PH.w / 2, cy = p.y + PH.h / 2;
    for (i = 0; i < this.saws.length; i++) {
      var sw = this.saws[i];
      if (!sw.active) continue;
      var qx = Math.max(p.x, Math.min(sw.x, p.x + PH.w)), qy = Math.max(p.y, Math.min(sw.y, p.y + PH.h));
      var ddx = sw.x - qx, ddy = sw.y - qy, rr = sw.r * 0.78;
      if (ddx * ddx + ddy * ddy < rr * rr) { this.die('saw'); return; }
    }
    if (p.y > WH + 30 || p.y + PH.h < -30) { this.die('fall'); return; }
    for (i = 0; i < this.doors.length; i++) {
      var d = this.doors[i];
      var dx = d.x + (d.g ? d.g.ox : 0), dy = d.y + (d.g ? d.g.oy : 0);
      if (d.g && !d.g.active) continue;
      if (overlap(p.x, p.y, PH.w, PH.h, dx + 10, dy + 12, 20, 44)) {
        if (d.fake) {
          if (d.onTouch) d.onTouch(); else { d.bit = true; this.emit('fakedoor', { d: d }); this.die('door'); }
          return;
        }
        this.state = 'win'; this.stateT = 0; this.winDoor = d;
        this.emit('win', { d: d });
        return;
      }
    }
  };

  var Engine = { World: World, T: T, COLS: COLS, ROWS: ROWS, W: WW, H: WH, DT: DT, PH: PH, DEAD_T: DEAD_T };

  // Parse a compact input script: "R40 RJ8 _20 L10" = hold keys for N frames.
  Engine.parseInputs = function (str) {
    var out = [];
    str.trim().split(/\s+/).forEach(function (tok) {
      var m = /^([LRJ_]+)(\d+)$/.exec(tok);
      if (!m) throw new Error('bad input token ' + tok);
      for (var i = 0; i < +m[2]; i++) out.push(m[1]);
    });
    return out;
  };
  // Run a solution; returns { result: 'win'|'die'|'timeout', frame, cause, x, y }
  Engine.simulate = function (def, str, opts) {
    opts = opts || {};
    var w = new World(def, { emit: opts.emit });
    if (opts.attempt) { w.attempt = opts.attempt; w.reset(); }
    var inputs = Engine.parseInputs(str), prevJ = false, f;
    var extra = opts.extra == null ? 120 : opts.extra;
    for (f = 0; f < inputs.length + extra; f++) {
      var k = inputs[f] || '_';
      var j = k.indexOf('J') >= 0;
      w.step({ l: k.indexOf('L') >= 0, r: k.indexOf('R') >= 0, jh: j, jp: j && !prevJ });
      prevJ = j;
      if (opts.trace && f % opts.trace === 0) opts.log(f + ' x=' + ((w.p.x + PH.w / 2) / T).toFixed(2) + ' y=' + ((w.p.y + PH.h) / T).toFixed(2) + ' g=' + w.p.onGround + ' st=' + w.state);
      if (w.state === 'dead') return { result: 'die', frame: f, cause: w.cause, x: (w.p.x + PH.w / 2) / T, y: (w.p.y + PH.h / 2) / T };
      if (w.state === 'win') return { result: 'win', frame: f, seconds: +(f / 60).toFixed(2) };
    }
    return { result: 'timeout', frame: f, x: (w.p.x + PH.w / 2) / T, y: (w.p.y + PH.h / 2) / T };
  };

  root.TrollEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
