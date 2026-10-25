/* Kinematic keycap parkour. No rendering, no DOM, no Kit. Fixed 120 Hz. */
(function (KR) {
  'use strict';
  var C = KR.C;
  var EPS = 1e-4;

  function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function topOf(p) { return p.y + p.hh; }
  function standable(p) {
    if (!p || !p.stand) return false;
    if (p.t === 'caps' && p.gone) return false;
    return true;
  }
  function solid(p, speed) {
    if (!p || p.sensor) return false;
    if (p.t === 'gum' || p.t === 'pop' || p.t === 'fan' || p.t === 'sweep' || p.t === 'flag' || p.t === 'chev') return false;
    if (p.t === 'caps' && p.gone) return false;
    if (p.t === 'gate' && speed >= p.n) return false;
    return p.t !== 'portal' && p.t !== 'shop' && p.t !== 'tower';
  }
  function overlapXZ(pl, p, pad) {
    var m = pad || 0;
    return Math.abs(pl.x - p.x) <= p.hw + C.HX + m && Math.abs(pl.z - p.z) <= p.hd + C.HZ + m;
  }
  function overlap(pl, p) {
    if (!overlapXZ(pl, p, 0)) return false;
    var top = pl.y + C.H, bot = pl.y;
    return top > p.y - p.hh && bot < p.y + p.hh;
  }
  function clonePiece(p) {
    var c = {};
    for (var k in p) c[k] = p[k];
    if (c.baseX == null) c.baseX = c.x;
    if (c.baseZ == null) c.baseZ = c.z;
    c.baseY = c.y;
    c.phase = (c.id % 7) * 0.4;
    c.sink = 0;
    c.gone = 0;
    c.warm = 0;
    c.cool = 0;
    c.cd = 0;
    return c;
  }

  function makePlayer(o, i) {
    o = o || {};
    var p = {
      i: i | 0, x: o.x || 0, y: o.y || 0, z: o.z || 0,
      vx: 0, vy: 0, vz: 0, face: 0, cam: 0,
      speed: Math.max(0, o.speed || 0), stepAcc: 0,
      onGround: true, coyote: 0, buffer: 0, held: false, hop: false, boost: false,
      ground: 0, ice: false, usedDouble: false,
      falling: 0, falls: 0, stageFalls: 0, stage: 0, stageTime: 0,
      wordAt: 0, maxY: o.y || 0, cd: 0, gateCd: 0, touchCd: 0,
      squash: 1, stretch: 1, alive: true, finished: false,
      shoe: o.shoe || 1, rebirths: o.rebirths || 0, charm: !!o.charm
    };
    p.cp = { x: p.x, y: p.y, z: p.z, stage: 0 };
    return p;
  }

  KR.createEngine = function (options) {
    var opt = options || {};
    var autoDouble = !!opt.autoDouble;
    var state = {
      mode: opt.mode || 'plaza',
      world: opt.world | 0,
      time: 0,
      pieces: [],
      players: [],
      flood: null,
      floodY: -8,
      over: null,
      seed: opt.seed || 1,
      built: {}
    };
    var worlds = KR.worlds();
    var count = Math.max(1, Math.min(2, opt.players || 1));
    for (var i = 0; i < count; i++) {
      state.players.push(makePlayer({
        x: opt.x, y: opt.y, z: opt.z, speed: opt.speed,
        shoe: opt.shoe, rebirths: opt.rebirths, charm: opt.charm
      }, i));
    }

    function templates(stage) {
      if (state.mode === 'plaza') return stage === -1 ? KR.plaza() : [];
      if (state.mode === 'tower') return stage === 0 ? state.tower.pieces : [];
      var w = worlds[state.world];
      if (!w || !w.stages[stage]) return [];
      return w.stages[stage].pieces;
    }
    function ensure(stage) {
      if (state.built[stage]) return;
      var list = templates(stage);
      for (var i = 0; i < list.length; i++) state.pieces.push(clonePiece(list[i]));
      state.built[stage] = 1;
    }
    function drop(stage) {
      if (!state.built[stage]) return;
      state.pieces = state.pieces.filter(function (p) { return p.stage !== stage; });
      delete state.built[stage];
    }
    function sync() {
      var need = {};
      if (state.mode === 'plaza') need[-1] = 1;
      else if (state.mode === 'tower') need[0] = 1;
      else {
        for (var i = 0; i < state.players.length; i++) {
          var s = state.players[i].stage;
          need[s] = 1;
          if (s + 1 < 6) need[s + 1] = 1;
        }
      }
      Object.keys(state.built).forEach(function (k) { if (!need[k]) drop(+k); });
      Object.keys(need).forEach(function (k) { ensure(+k); });
      if (state.mode === 'world' || state.mode === 'race') {
        var st = worlds[state.world].stages[state.players[0].stage];
        var nextFlood = st && st.flood ? st.flood : null;
        if (nextFlood !== state.flood) state.floodY = nextFlood ? nextFlood.from : -8;
        state.flood = nextFlood;
      } else state.flood = null;
    }
    function reset(next) {
      if (next) opt = Object.assign({}, opt, next);
      state.mode = opt.mode || 'plaza';
      state.world = opt.world | 0;
      state.time = 0;
      state.over = null;
      state.pieces = [];
      state.built = {};
      state.flood = null;
      state.floodY = -8;
      state.seed = opt.seed || state.seed;
      if (state.mode === 'tower') state.tower = KR.tower(opt.seed || 1);
      var spawn = { x: 0, y: 0, z: 1.1 };
      if (state.mode === 'world' || state.mode === 'race') spawn = { x: worlds[state.world].stages[0].spawn.x, y: 0, z: worlds[state.world].stages[0].spawn.z };
      if (state.mode === 'tower') spawn = { x: 0, y: 0, z: 0.8 };
      if (opt.pieces) {
        state.mode = 'custom';
        state.pieces = opt.pieces.map(clonePiece);
        state.built[0] = 1;
        spawn = { x: opt.x || 0, y: opt.y || 0, z: opt.z || 0 };
      }
      state.players = [];
      var n = Math.max(1, Math.min(2, opt.players || 1));
      for (var i = 0; i < n; i++) {
        var pl = makePlayer({
          x: spawn.x + (i ? 1.1 : 0), y: spawn.y, z: spawn.z,
          speed: opt.speed || 0, shoe: opt.shoe || 1, rebirths: opt.rebirths || 0, charm: opt.charm
        }, i);
        if (opt.pieces && opt.y != null) pl.y = opt.y;
        state.players.push(pl);
      }
      if (state.mode !== 'custom') sync();
      if ((state.mode === 'world' || state.mode === 'race') && state.flood) state.floodY = state.flood.from;
      return state;
    }

    function pieceById(id) {
      for (var i = 0; i < state.pieces.length; i++) if (state.pieces[i].id === id) return state.pieces[i];
      return null;
    }
    function support(pl) {
      var best = null;
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (!standable(p) || !overlapXZ(pl, p, -0.02)) continue;
        var top = topOf(p);
        if (pl.y >= top - 0.08 && pl.y <= top + 0.12) {
          if (!best || top > topOf(best)) best = p;
        }
      }
      return best;
    }
    function blockedAt(pl, ignore) {
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (p === ignore || !solid(p, pl.speed)) continue;
        if (overlap(pl, p)) return true;
      }
      return false;
    }
    function tryStep(pl, p) {
      if (!standable(p)) return false;
      var top = topOf(p);
      var rise = top - pl.y;
      if (rise <= 0.001 || rise > C.CORNER) return false;
      var old = pl.y;
      pl.y = top;
      if (blockedAt(pl, p)) { pl.y = old; return false; }
      pl.vy = Math.max(0, pl.vy);
      pl.onGround = true;
      pl.ground = p.id;
      pl.usedDouble = false;
      return true;
    }
    function doJump(pl, events) {
      pl.vy = C.JUMP;
      pl.onGround = false;
      pl.coyote = 0;
      pl.buffer = 0;
      pl.hop = true;
      pl.boost = false;
      pl.ground = 0;
      pl.stretch = 1.28;
      events.push({ e: 'jump', p: pl.i });
    }
    function onLand(pl, p, events) {
      var impact = pl.vy;
      var fromAir = !pl.onGround;
      pl.y = topOf(p);
      pl.vy = 0;
      pl.onGround = true;
      pl.ground = p.id;
      pl.coyote = 0;
      pl.hop = false;
      pl.usedDouble = false;
      pl.ice = p.t === 'ice';
      if (!fromAir) return;
      pl.squash = 0.72;
      if (p.t === 'tramp') {
        pl.vy = C.TRAMP;
        pl.onGround = false;
        pl.hop = true;
        pl.boost = true;
        pl.ground = 0;
        events.push({ e: 'bounce', p: pl.i });
      } else if (p.t === 'launch') {
        pl.vy = C.LAUNCH_V;
        pl.vx += Math.sin(pl.face) * C.LAUNCH_Z;
        pl.vz += Math.cos(pl.face) * C.LAUNCH_Z;
        var capH = Math.hypot(pl.vx, pl.vz);
        if (capH > 16) { pl.vx *= 16 / capH; pl.vz *= 16 / capH; }
        pl.onGround = false;
        pl.hop = true;
        pl.boost = true;
        pl.ground = 0;
        events.push({ e: 'launch', p: pl.i });
      } else if (p.t === 'jelly' && impact < -8) {
        pl.vy = 5.4;
        pl.onGround = false;
        pl.hop = true;
        pl.boost = true;
        pl.ground = 0;
        events.push({ e: 'bounce', p: pl.i });
      } else {
        pl.boost = false;
        events.push({ e: 'land', p: pl.i, t: p.t, row: Math.abs(Math.round(p.z)) % 8 });
      }
    }
    function feet(pl, events) {
      if (!pl.onGround || pl.finished) return;
      var p = pieceById(pl.ground);
      if (!p) return;
      if (p.t === 'tramp' && pl.ride !== p.id) {
        pl.ride = p.id;
        pl.vy = C.TRAMP;
        pl.onGround = false;
        pl.hop = true;
        pl.boost = true;
        pl.ground = 0;
        events.push({ e: 'bounce', p: pl.i });
        return;
      }
      if (p.t === 'launch' && pl.ride !== p.id) {
        pl.ride = p.id;
        pl.vy = C.LAUNCH_V;
        pl.vx += Math.sin(pl.face) * C.LAUNCH_Z;
        pl.vz += Math.cos(pl.face) * C.LAUNCH_Z;
        var capH = Math.hypot(pl.vx, pl.vz);
        if (capH > 16) { pl.vx *= 16 / capH; pl.vz *= 16 / capH; }
        pl.onGround = false;
        pl.hop = true;
        pl.boost = true;
        pl.ground = 0;
        events.push({ e: 'launch', p: pl.i });
        return;
      }
      pl.ride = p.id;
      if (p.ch && pl.wordId !== p.id && (state.mode === 'world' || state.mode === 'race')) {
        pl.wordId = p.id;
        var word = worlds[state.world].word;
        if (p.ch === word.charAt(pl.wordAt)) {
          pl.wordAt++;
          events.push({ e: 'word', p: pl.i, n: pl.wordAt, ch: p.ch });
        }
      }
      if (p.mark && !p.marked && p.stage === pl.stage && (state.mode === 'world' || state.mode === 'race')) {
        p.marked = 1;
        pl.cp = { x: pl.x, y: pl.y, z: pl.z, stage: pl.stage };
        events.push({ e: 'checkpoint', p: pl.i });
      }
      if (p.flag && p.stage === pl.stage && state.mode !== 'plaza' && state.mode !== 'tower') finishStage(pl, events);
    }
    function finishStage(pl, events) {
      var stage = worlds[state.world].stages[pl.stage];
      var time = pl.stageTime;
      var medal = time <= stage.gold ? 'gold' : time <= stage.silver ? 'silver' : time <= stage.bronze ? 'bronze' : '';
      var pad = pieceById(pl.ground);
      events.push({
        e: 'stage', p: pl.i, world: state.world, stage: pl.stage, time: time,
        falls: pl.stageFalls, medal: medal, noFall: pl.stageFalls === 0 ? 1 : 0,
        word: stage.word && pl.wordAt >= stage.word.length ? 1 : 0
      });
      pl.stage++;
      if (pad) { pad.flag = 0; pad.stage = pl.stage; }
      pl.stageTime = 0;
      pl.stageFalls = 0;
      pl.wordAt = 0;
      pl.cp = { x: pl.x, y: pl.y, z: pl.z, stage: pl.stage };
      if (pl.stage >= 6) {
        pl.finished = true;
        events.push({ e: 'world', p: pl.i, world: state.world });
        if (state.mode === 'race') {
          var done = state.players.every(function (q) { return q.finished; });
          var winner = state.players.filter(function (q) { return q.finished; }).length === 1 ? pl.i : -1;
          if (!state.over) state.over = { type: done && winner < 0 ? 'draw' : 'end', winner: winner };
        }
      }
      sync();
    }
    function respawn(pl, events) {
      pl.x = pl.cp.x; pl.y = pl.cp.y + 0.05; pl.z = pl.cp.z;
      pl.vx = pl.vy = pl.vz = 0;
      pl.onGround = true;
      pl.falling = 0;
      pl.hop = false;
      pl.usedDouble = false;
      pl.squash = 0.6;
      pl.stretch = 1.2;
      if (state.mode === 'world' || state.mode === 'race') pl.stage = pl.cp.stage;
      if (state.flood && pl.z < state.flood.z0 - 0.4) state.floodY = state.flood.from;
      events.push({ e: 'respawn', p: pl.i });
    }
    function startFall(pl, events, why) {
      if (pl.falling > 0 || pl.finished) return;
      if (state.mode === 'tower') {
        pl.finished = true;
        state.over = { type: 'end', height: pl.maxY };
        events.push({ e: 'towerEnd', p: pl.i, height: pl.maxY, why: why });
        return;
      }
      pl.falling = C.FALL_T;
      pl.falls++;
      pl.stageFalls++;
      pl.vx = pl.vz = 0;
      events.push({ e: 'fall', p: pl.i, why: why });
    }

    function updatePieces(dt) {
      var grounded = {};
      for (var i = 0; i < state.players.length; i++) {
        var g = state.players[i].ground;
        if (g) grounded[g] = 1;
      }
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        p.px = p.x; p.py = p.y; p.pz = p.z;
        if (p.cd > 0) p.cd -= dt;
        if (p.t === 'sink') {
          var target = grounded[p.id] ? 0.2 : 0;
          var step = 1.7 * dt;
          if (p.sink < target) p.sink = Math.min(target, p.sink + step);
          else p.sink = Math.max(target, p.sink - step);
          p.y = p.baseY - p.sink;
        } else if (p.t === 'move') {
          p.phase += dt * (p.freq || 1.15);
          p.x = p.baseX + Math.sin(p.phase) * (p.amp || 0.8);
        } else if (p.t === 'caps') {
          if (grounded[p.id]) p.warm += dt;
          else p.warm = Math.max(0, p.warm - dt * 0.35);
          if (!p.gone && p.warm >= 1.5) { p.gone = 1; p.cool = 1.6; }
          if (p.gone) { p.cool -= dt; if (p.cool <= 0) { p.gone = 0; p.warm = 0; } }
        } else if (p.t === 'gum') {
          p.phase += dt * (p.speed || 1.4);
          p.x = p.baseX + Math.sin(p.phase) * (p.range || 1);
          p.spin = (p.spin || 0) + dt * 3;
        } else if (p.t === 'pop') {
          p.phase += dt * 1.25;
          var ang = Math.sin(p.phase) * 0.95;
          p.x = p.baseX + Math.sin(ang) * p.len;
          p.y = (p.pivot || 2) - Math.cos(ang) * p.len - p.hh;
        } else if (p.t === 'sweep') {
          p.phase += dt * (p.speed || 1.5);
          p.x = p.baseX + Math.cos(p.phase) * (p.amp || 1.4);
          p.z = p.baseZ + Math.sin(p.phase) * (p.amp || 1.4) * 0.25;
        }
      }
    }

    function carry(pl) {
      if (!pl.ground) return;
      var p = pieceById(pl.ground);
      if (!p || !standable(p)) { pl.ground = 0; return; }
      if (p.px != null) {
        pl.x += p.x - p.px;
        pl.z += p.z - p.pz;
        pl.y += (p.y - p.py);
      }
    }

    function control(pl, input, dt) {
      var top = KR.topSpeed(pl.speed);
      var ix = input.x || 0, iz = input.z || 0;
      var mag = Math.hypot(ix, iz);
      if (mag > 1) { ix /= mag; iz /= mag; mag = 1; }
      var wish = mag > 0.08;
      var hsp = Math.hypot(pl.vx, pl.vz);
      var air = pl.onGround ? 1 : 0.7;
      var accel = (top / 0.25) * air;
      var ice = pl.onGround && pl.ice;
      if (!wish) {
        var fr = (pl.onGround ? (ice ? 6.5 : 54) : 7) * dt;
        hsp = Math.max(0, hsp - fr);
        if (hsp === 0) pl.vx = pl.vz = 0;
        else {
          var a = Math.atan2(pl.vx, pl.vz);
          pl.vx = Math.sin(a) * hsp;
          pl.vz = Math.cos(a) * hsp;
        }
        return;
      }
      var wishAng = Math.atan2(ix, iz);
      var moving = hsp > 0.45;
      hsp = Math.min(top, hsp + accel * dt * (ice ? 0.45 : 1));
      var ang = moving ? Math.atan2(pl.vx, pl.vz) : wishAng;
      var diff = wrap(wishAng - ang);
      var yawRate = (2.15 + hsp * 0.28) * air * (ice ? 0.55 : 1);
      ang += clamp(diff, -yawRate * dt, yawRate * dt);
      pl.vx = Math.sin(ang) * hsp;
      pl.vz = Math.cos(ang) * hsp;
      pl.face = ang;
    }

    function moveAxis(pl, axis, delta) {
      if (!delta) return;
      pl[axis] += delta;
      for (var guard = 0; guard < 4; guard++) {
        var hit = false;
        for (var i = 0; i < state.pieces.length; i++) {
          var p = state.pieces[i];
          if (!solid(p, pl.speed) || !overlap(pl, p)) continue;
          if (axis !== 'y' && tryStep(pl, p)) continue;
          if (axis !== 'y' && standable(p) && pl.y >= topOf(p) - 0.22) continue;
          hit = true;
          if (axis === 'x') pl.x = delta > 0 ? p.x - p.hw - C.HX - EPS : p.x + p.hw + C.HX + EPS;
          else if (axis === 'z') pl.z = delta > 0 ? p.z - p.hd - C.HZ - EPS : p.z + p.hd + C.HZ + EPS;
          else pl.y = delta > 0 ? (p.y - p.hh) - C.H - EPS : topOf(p);
          if (axis === 'x') pl.vx = 0;
          else if (axis === 'z') pl.vz = 0;
          else if (delta > 0) pl.vy = Math.min(0, pl.vy);
        }
        if (!hit) break;
      }
    }
    function moveY(pl, dy, events) {
      var prev = pl.y;
      pl.y += dy;
      if (dy <= 0) {
        var land = null;
        for (var i = 0; i < state.pieces.length; i++) {
          var p = state.pieces[i];
          if (!standable(p) || !overlapXZ(pl, p, 0)) continue;
          var top = topOf(p);
          if (prev >= top - 0.03 && pl.y <= top + 0.02) {
            if (!land || top > topOf(land)) land = p;
          }
        }
        if (land) { onLand(pl, land, events); return; }
        pl.onGround = false;
        pl.ground = 0;
      } else {
        for (var i = 0; i < state.pieces.length; i++) {
          var p = state.pieces[i];
          if (!solid(p, pl.speed) || !overlap(pl, p)) continue;
          var bottom = p.y - p.hh;
          if (prev + C.H <= bottom + 0.04) {
            pl.y = bottom - C.H - EPS;
            pl.vy = 0;
            pl.hop = false;
          }
        }
      }
    }

    function hazards(pl, dt, events) {
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (p.t === 'gum' || p.t === 'pop' || p.t === 'sweep') {
          var dx = pl.x - p.x, dy = (pl.y + 0.45) - (p.y + (p.r || p.hh)), dz = pl.z - p.z;
          var r = (p.r || 0.34) + 0.34;
          if (dx * dx + dy * dy + dz * dz < r * r && p.cd <= 0) {
            var s = dx === 0 ? 1 : Math.sign(dx);
            pl.vx += s * 8;
            p.cd = 0.45;
            events.push({ e: 'push', p: pl.i });
          }
        } else if (p.t === 'fan' && overlap(pl, p)) {
          pl.vx += (p.fx || 0) * dt;
          pl.vz += (p.fz || 0) * dt;
        } else if (p.t === 'gate' && pl.speed < p.n && overlap(pl, p) && pl.gateCd <= 0) {
          pl.gateCd = 0.7;
          events.push({ e: 'gate', p: pl.i, n: p.n });
        }
      }
    }

    function sensors(pl, events) {
      if (pl.touchCd > 0 || state.mode !== 'plaza') return;
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (!overlapXZ(pl, p, 0.08)) continue;
        var top = topOf(p);
        if (pl.y < top - 0.35 || pl.y > top + 3.4) continue;
        if (p.t === 'portal') { pl.touchCd = 0.45; events.push({ e: 'portal', p: pl.i, world: p.portal }); return; }
        if (p.shop) { pl.touchCd = 0.45; events.push({ e: 'shop', p: pl.i }); return; }
        if (p.tower) { pl.touchCd = 0.45; events.push({ e: 'towerDoor', p: pl.i }); return; }
      }
    }

    function tickPlayer(pl, input, dt, events) {
      input = input || {};
      if (pl.finished && state.mode === 'race') return;
      if (pl.falling > 0) {
        pl.falling -= dt;
        pl.stageTime += dt;
        pl.squash += (0.55 - pl.squash) * Math.min(1, dt * 8);
        if (pl.falling <= 0) respawn(pl, events);
        return;
      }
      if (pl.cd > 0) pl.cd -= dt;
      if (pl.gateCd > 0) pl.gateCd -= dt;
      if (pl.touchCd > 0) pl.touchCd -= dt;
      var px = pl.x, pz = pl.z;
      carry(pl);
      control(pl, input, dt);
      var ground = pl.ground ? pieceById(pl.ground) : null;
      var extraX = 0, extraZ = 0;
      if (pl.onGround && ground) {
        extraX = (ground.cvx || 0) * dt;
        extraZ = (ground.cvz || 0) * dt;
      }
      var edge = !!input.jump && !pl.held;
      pl.held = !!input.jump;
      var can = pl.onGround || pl.coyote > 0;
      if (edge && can) doJump(pl, events);
      else if (!edge && pl.onGround && input.jump && !pl.hop) doJump(pl, events);
      else if (edge && !can && pl.charm && !pl.usedDouble) {
        doJump(pl, events);
        pl.usedDouble = true;
        events.push({ e: 'double', p: pl.i });
      } else if (edge) pl.buffer = C.BUFFER;
      else if (autoDouble && input.jump && pl.charm && !pl.usedDouble && !pl.onGround && pl.vy < 0) {
        doJump(pl, events);
        pl.usedDouble = true;
        events.push({ e: 'double', p: pl.i });
      }
      if (input.respawn && pl.cd <= 0 && state.mode !== 'tower') {
        pl.cd = 0.35;
        startFall(pl, events, 'respawn');
        return;
      }
      if (input.cam && !pl.camHeld) pl.cam = wrap(pl.cam + input.cam * Math.PI / 4);
      pl.camHeld = input.cam || 0;

      var g = C.GRAV;
      if (pl.hop && pl.vy > 0 && !input.jump && !pl.boost) g = C.CUT;
      pl.vy -= g * dt;
      if (pl.vy < -34) pl.vy = -34;
      if (pl.vy <= 0) pl.hop = false;

      var was = pl.onGround;
      moveAxis(pl, 'x', pl.vx * dt + extraX);
      moveAxis(pl, 'z', pl.vz * dt + extraZ);
      moveY(pl, pl.vy * dt, events);
      if (was && !pl.onGround && !pl.hop) pl.coyote = C.COYOTE;
      if (!pl.onGround) pl.coyote -= dt;
      else pl.coyote = 0;
      if (pl.buffer > 0) {
        pl.buffer -= dt;
        if ((pl.onGround || pl.coyote > 0) && pl.buffer > 0) doJump(pl, events);
      }
      if (pl.onGround) {
        var sup = support(pl);
        if (!sup) {
          pl.onGround = false;
          pl.ground = 0;
          pl.ice = false;
          if (!pl.hop) pl.coyote = C.COYOTE;
        } else {
          pl.ground = sup.id;
          pl.ice = sup.t === 'ice';
          if (pl.y > topOf(sup) + 0.02) { /* carried */ }
        }
      }
      hazards(pl, dt, events);
      var hsp = Math.hypot(pl.vx, pl.vz);
      if (hsp > 30) { pl.vx *= 30 / hsp; pl.vz *= 30 / hsp; }

      var tread = pl.onGround && ground && ground.tread && (input.z || 0) > 0.2;
      if (tread) {
        pl.stepAcc += KR.topSpeed(pl.speed) * dt;
        pl.z = ground.z;
        pl.vz = 0;
      } else if (pl.onGround) {
        pl.stepAcc += Math.hypot(pl.x - px, pl.z - pz);
      }
      var gain = KR.stepGain(pl.shoe, pl.rebirths);
      while (pl.stepAcc >= C.STEP) {
        pl.stepAcc -= C.STEP;
        pl.speed += gain;
        events.push({ e: 'step', p: pl.i, n: gain, speed: pl.speed });
      }
      sensors(pl, events);
      feet(pl, events);
      if (pl.y < C.FALL_Y) startFall(pl, events, 'void');
      if (state.flood && pl.z >= state.flood.z0 && pl.z <= state.flood.z1 && pl.y < state.floodY) startFall(pl, events, 'flood');
      if (pl.y > pl.maxY) pl.maxY = pl.y;
      pl.stageTime += dt;
      pl.squash += (1 - pl.squash) * Math.min(1, dt * 8);
      pl.stretch += (1 - pl.stretch) * Math.min(1, dt * 8);
      if (state.mode === 'tower' && state.time >= 360 && !pl.finished) {
        pl.finished = true;
        state.over = { type: 'end', height: pl.maxY };
        events.push({ e: 'towerEnd', p: pl.i, height: pl.maxY, why: 'time' });
      }
    }

    function tick(dt, inputs, events) {
      if (state.over && state.mode !== 'world') return;
      updatePieces(dt);
      if (state.flood) {
        var chase = false;
        for (var fi = 0; fi < state.players.length; fi++) {
          var fq = state.players[fi];
          if (fq.falling <= 0 && fq.z >= state.flood.z0 - 4 && fq.z <= state.flood.z1 + 1) chase = true;
        }
        if (chase) {
          state.floodY += state.flood.rate * dt;
          if (state.floodY > 80) state.floodY = 80;
        }
      }
      for (var i = 0; i < state.players.length; i++) tickPlayer(state.players[i], inputs[i] || inputs[0] || {}, dt, events);
      state.time += dt;
    }

    function step(dt, input) {
      var events = [];
      if (!Number.isFinite(dt) || dt <= 0 || (state.over && (state.mode === 'tower' || state.mode === 'race'))) return events;
      var inputs = Array.isArray(input) ? input : [input || {}];
      var left = Math.min(0.25, dt);
      while (left > 1e-6) {
        var h = Math.min(C.TICK, left);
        tick(h, inputs, events);
        left -= h;
        if (state.over && state.mode === 'tower') break;
      }
      return events;
    }

    function ray(a, b, solidsOnly) {
      var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      var best = null;
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (solidsOnly && !solid(p, 1e9) && p.t !== 'gate') continue;
        if (!solidsOnly && (p.t === 'fan' || p.t === 'gum' || p.t === 'pop')) continue;
        var minx = p.x - p.hw, maxx = p.x + p.hw;
        var miny = p.y - p.hh, maxy = p.y + p.hh;
        var minz = p.z - p.hd, maxz = p.z + p.hd;
        var t0 = 0, t1 = 1;
        var slabs = [[dx, a.x, minx, maxx], [dy, a.y, miny, maxy], [dz, a.z, minz, maxz]];
        var miss = false;
        for (var s = 0; s < 3; s++) {
          var d = slabs[s][0], o = slabs[s][1], mn = slabs[s][2], mx = slabs[s][3];
          if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) { miss = true; break; } continue; }
          var ta = (mn - o) / d, tb = (mx - o) / d;
          if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) { miss = true; break; }
        }
        if (!miss && t0 > 0.02 && t0 < 0.98 && (best == null || t0 < best)) best = t0;
      }
      return best;
    }
    function inside(pt) {
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (!solid(p, 1e9) && p.t !== 'gate') continue;
        if (Math.abs(pt.x - p.x) < p.hw - 0.05 && Math.abs(pt.y - p.y) < p.hh - 0.05 && Math.abs(pt.z - p.z) < p.hd - 0.05) return true;
      }
      return false;
    }
    function escapeCam(cam, head) {
      if (!inside(cam)) return cam;
      for (var i = 1; i <= 8; i++) {
        var k = i / 8;
        var q = {
          x: cam.x + (head.x - cam.x) * k,
          y: cam.y + (head.y + 1.2 - cam.y) * k,
          z: cam.z + (head.z - cam.z) * k
        };
        if (!inside(q)) return q;
      }
      return { x: head.x, y: head.y + 1.6, z: head.z };
    }
    function cameraPose(index) {
      var pl = state.players[index || 0];
      var yaw = pl.face + pl.cam;
      var head = { x: pl.x, y: pl.y + 0.9, z: pl.z };
      var look = {
        x: pl.x + Math.sin(pl.face) * C.CAM_AHEAD,
        y: pl.y + 1.05,
        z: pl.z + Math.cos(pl.face) * C.CAM_AHEAD
      };
      var cam = {
        x: pl.x - Math.sin(yaw) * C.CAM_BACK,
        y: pl.y + C.CAM_UP,
        z: pl.z - Math.cos(yaw) * C.CAM_BACK
      };
      var hit = ray(head, cam, true);
      if (hit != null) {
        var k = Math.max(0.18, hit - 0.08);
        cam = { x: head.x + (cam.x - head.x) * k, y: head.y + (cam.y - head.y) * k, z: head.z + (cam.z - head.z) * k };
      }
      if (inside(cam)) {
        cam = { x: head.x + (cam.x - head.x) * 0.25, y: head.y + 0.4, z: head.z + (cam.z - head.z) * 0.25 };
      }
      if (inside(cam)) cam = escapeCam(cam, head);
      var body = { x: pl.x, y: pl.y + 0.72, z: pl.z };
      var see = ray(cam, body, true);
      for (var pull = 0; pull < 4 && see != null; pull++) {
        cam = {
          x: cam.x + (body.x - cam.x) * 0.55,
          y: Math.max(body.y + 0.35, cam.y + (body.y - cam.y) * 0.35),
          z: cam.z + (body.z - cam.z) * 0.55
        };
        if (inside(cam)) cam = escapeCam(cam, head);
        see = ray(cam, body, true);
      }
      if (inside(cam)) cam = escapeCam(cam, head);
      return { x: cam.x, y: cam.y, z: cam.z, lx: look.x, ly: look.y, lz: look.z, fov: 60, hidden: see != null, inside: inside(cam) };
    }
    function predictLanding(index) {
      var pl = state.players[index || 0];
      if (pl.onGround) return null;
      var x = pl.x, y = pl.y, z = pl.z, vy = pl.vy, vx = pl.vx, vz = pl.vz;
      var g = pl.hop && vy > 0 && (pl.held || pl.boost) ? C.GRAV : (vy > 0 ? C.CUT : C.GRAV);
      for (var n = 0; n < 70; n++) {
        vy -= g * (1 / 40);
        x += vx / 40; y += vy / 40; z += vz / 40;
        if (vy > 0) continue;
        var hit = null;
        for (var i = 0; i < state.pieces.length; i++) {
          var p = state.pieces[i];
          if (!standable(p)) continue;
          var top = topOf(p);
          if (Math.abs(x - p.x) > p.hw + C.HX || Math.abs(z - p.z) > p.hd + C.HZ) continue;
          if (y <= top && y >= top - 0.55) { if (!hit || top > topOf(hit)) hit = p; }
        }
        if (hit) return { x: x, y: topOf(hit), z: z, miss: false };
        if (y < C.FALL_Y) return { x: x, y: C.FALL_Y, z: z, miss: true };
      }
      return { x: x, y: y, z: z, miss: true };
    }
    function shadowPoint(index) {
      var pl = state.players[index || 0];
      var best = null;
      for (var i = 0; i < state.pieces.length; i++) {
        var p = state.pieces[i];
        if (!standable(p) || !overlapXZ(pl, p, 0.15)) continue;
        var top = topOf(p);
        if (top <= pl.y + 0.05 && (!best || top > best.y)) best = { x: pl.x, y: top + 0.03, z: pl.z };
      }
      if (best) return best;
      return { x: pl.x, y: Math.min(pl.y, C.FALL_Y), z: pl.z, miss: true };
    }

    reset(opt);
    return {
      state: state, step: step, reset: reset, sync: sync,
      cameraPose: cameraPose, predictLanding: predictLanding, shadowPoint: shadowPoint
    };
  };

  function nearestPad(state, pl) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (!standable(p)) continue;
      var edge = p.z - p.hd;
      if (edge < pl.z - 0.15) continue;
      var d = edge - pl.z + Math.abs(p.x - pl.x) * 0.8 + Math.max(0, (p.y + p.hh) - pl.y) * 0.5;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
  function groundedAhead(state, pl, dist) {
    var z = pl.z + dist;
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (!standable(p)) continue;
      var top = topOf(p);
      if (top < pl.y - 0.35 || top > pl.y + 0.45) continue;
      if (Math.abs(pl.x - p.x) > p.hw + 0.15) continue;
      if (z >= p.z - p.hd - 0.05 && z <= p.z + p.hd + 0.2) return true;
    }
    return false;
  }
  function lipLeft(state, pl) {
    var best = 0;
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (!standable(p)) continue;
      var top = topOf(p);
      if (top < pl.y - 0.25 || top > pl.y + 0.2) continue;
      if (Math.abs(pl.x - p.x) > p.hw + 0.05) continue;
      if (pl.z < p.z - p.hd - 0.15) continue;
      var end = p.z + p.hd - pl.z;
      if (end > best) best = end;
    }
    return best;
  }
  KR.suggest = function (state, index, memory) {
    var pl = state.players[index || 0];
    memory = memory || {};
    var next = nearestPad(state, pl);
    var x = 0, jump = false;
    if (next) {
      x = clamp((next.x - pl.x) / 1.1, -1, 1);
      var rise = topOf(next) - pl.y;
      var dist = (next.z - next.hd) - pl.z;
      var hole = !groundedAhead(state, pl, 0.48);
      var lip = lipLeft(state, pl);
      var big = dist > 3.6 || next.need || next.charm || rise > 1.15;
      if (pl.onGround && hole && !next.charm && dist < (big ? 6.4 : 4.8) && dist > 0.05) jump = true;
      if (pl.onGround && rise > 0.35 && dist < 1.05 && dist > -0.02) jump = true;
      if (pl.onGround && rise > 1.05 && lip < 1.1 && lip > 0) memory.hold = 36;
      if (pl.onGround && big && !next.charm && hole && lip < 1.3 && lip > 0) memory.hold = 58;
      if (pl.onGround && next.charm && lip < 0.9 && lip > 0.02) memory.hold = 96;
      if (!pl.onGround && pl.charm && pl.vy < 0 && next.charm && dist > 1.6) jump = true;
    } else x = clamp(-pl.x / 2, -1, 1);
    memory.t = (memory.t || 0) + 1;
    if (memory.t % 30 === 0) {
      if (memory.mark != null && pl.z < memory.mark + 0.35 && pl.y < (memory.markY || 0) + 0.4) memory.stuck = (memory.stuck || 0) + 1;
      else memory.stuck = 0;
      memory.mark = pl.z;
      memory.markY = pl.y;
    }
    if ((memory.stuck || 0) >= 4 && pl.onGround) jump = true;
    if ((memory.hold || 0) > 0) { jump = true; memory.hold--; }
    return { x: x, z: pl.finished ? 0 : 1, jump: jump, respawn: false, cam: 0 };
  };
})(globalThis.KeyRunner = globalThis.KeyRunner || {});
