/*
 * Splat Strike — bots.js
 * Bots that play like people, not aimbots and not dummies:
 *   perception  field of view + line-of-sight rays + hearing shots/footsteps nearby, every ~0.15 s
 *   reaction    a delay before the first shot at a newly seen enemy (difficulty based)
 *   aim         smooth turning toward the target with a wandering error that settles while tracking
 *               and grows when the target strafes; bursts, weapon ranges, sniper patience
 *   movement    A* on the nav grid (walk, drop off ledges, hop onto blocks), string-pulled,
 *               strafing and jumping in fights, cover spots out of the enemy's sight while reloading
 *               or hurt, health/ammo/power pickups, map hot spots so they roam the whole arena
 */
(function () {
  'use strict';
  var SS = window.SS;

  // difficulty presets: easy must be beatable by a 10-year-old, hard should feel sharp.
  //   react/settle  s before the first shot / until the aim error has settled
  //   track         how much a strafing target throws the aim off; read = how fast (1/s) the bot reads a
  //                 target's movement (slow = dodging by changing direction makes it miss)
  //   scope/slop    sniper: seconds scoped in (the glint shows) before the first shot / extra aim tolerance;
  //   jerk          sniper trigger jerk (radians, per shot): how often a settled scoped shot still misses
  //   dmg           damage multiplier (easy bots feel alive but hurt little); bvb = extra factor bot vs bot
  SS.BOT_DIFF = [
    { react: 0.7, err: 0.13, settle: 1.15, errMin: 0.5, turn: 3.4, maxTurn: 2.8, burst: [0.2, 0.4], pause: [0.55, 1.1], head: 0.02, lead: 0.1,
      strafe: 0.5, jump: 0.15, nade: 0.1, playerBias: 8, dmg: 0.45, bvb: 0.85, view: 30, fov: 0.5, track: 1.8, read: 2.5, scope: 1.5, slop: 0.03, jerk: 0.058, sniperOdds: 0.08 },
    { react: 0.55, err: 0.085, settle: 1.1, errMin: 0.42, turn: 5.8, maxTurn: 5.2, burst: [0.3, 0.65], pause: [0.32, 0.6], head: 0.1, lead: 0.45,
      strafe: 0.85, jump: 0.3, nade: 0.35, playerBias: 3, dmg: 0.82, bvb: 0.6, view: 40, fov: 0.35, track: 1.4, read: 3.5, scope: 1.1, slop: 0.014, jerk: 0.048, sniperOdds: 0.12 },
    { react: 0.32, err: 0.055, settle: 0.8, errMin: 0.34, turn: 9.0, maxTurn: 8.5, burst: [0.5, 1.0], pause: [0.15, 0.32], head: 0.25, lead: 0.8,
      strafe: 1, jump: 0.5, nade: 0.6, playerBias: 0, dmg: 1, bvb: 0.45, view: 48, fov: 0.25, track: 1.3, read: 4.5, scope: 0.9, slop: 0.006, jerk: 0.036, sniperOdds: 0.15 }
  ];
  var RANGES = [[6, 18], [1.5, 7], [15, 34]];

  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }

  function Bot(e, diff) {
    this.e = e;
    this.D = SS.BOT_DIFF[diff];
    this.path = new Int32Array(400); this.plen = 0; this.pi = 0; this.goal = -1; this.goalKind = '';
    this.repathT = 0; this.goalT = 0; this.lookT = 0;
    this.percT = Math.random() * 0.2; this.decideT = Math.random() * 0.3;
    this.target = null; this.seeT = -99; this.acquireT = 0; this.reactUntil = 0; this.visible = false;
    this.lkx = 0; this.lky = 0; this.lkz = 0; this.lkT = -99;
    this.eyaw = 0; this.epit = 0; this.eyawT = 0; this.epitT = 0; this.errT = 0;
    this.strafe = 1; this.strafeT = 0; this.jumpT = rnd(0.5, 2);
    this.burstT = 0; this.pauseT = 0;
    this.mode = 'roam'; this.coverT = 0; this.coverNode = -1; this.nextCover = 0;
    this.stuckT = 0; this.sx = 0; this.sz = 0; this.stuck = 0;
    this.pathT = 0; this.pushT = 0; this.ppx = 0; this.ppz = 0; this.lwx = 0; this.lwz = 0; this.lw = 0; this.escT = 0; this.escX = 0; this.escZ = 0; this.escW = false;
    this.hurtBy = null; this.hurtT = -99;
    this.nadeT = rnd(4, 10); this.nadeAim = false; this.ny = 0; this.np = 0;
    this.recent = [];
    this.aggr = Math.random();
    this.follow = false; // team wingman
    this.tyawVel = 0; this.tvx = 0; this.tvz = 0; this.latS = 0; this.zoomT = 0; this.probeT = 0;
    this.side = 0; this.sidez = 0; this.idealYaw = 0; this.idealPit = 0; this.tdist = 0; this.headAim = false; this.nadeGiveUp = 0;
    this.frozen = false; this._tick = null;
  }
  var B = Bot.prototype;

  B.reset = function (G) {
    this.plen = 0; this.pi = 0; this.goal = -1; this.target = null; this.visible = false; this.mode = 'roam';
    this.seeT = -99; this.lkT = -99; this.hurtBy = null; this.stuck = 0; this.stuckT = 0; this.nadeAim = false; this.zoomT = 0; this.e.zoom = false;
    this.pathT = 0; this.pushT = 0; this.lw = 0; this.escT = 0; this.escW = false; this.ppx = this.e.x; this.ppz = this.e.z;
    this.sx = this.e.x; this.sz = this.e.z;
  };
  B.hurt = function (G, src) {
    if (!src || src === this.e) return;
    this.hurtBy = src; this.hurtT = G.t;
    this.lkx = src.x; this.lky = src.y; this.lkz = src.z; this.lkT = G.t;
    // being hit makes you notice faster
    if (this.target !== src) this.percT = Math.min(this.percT, 0.05);
  };

  B.tick = function (G, dt) {
    var e = this.e;
    e.mx = 0; e.mz = 0; e.sprint = false; e.jumpReq = false; e.fire = false; e.fireP = false; e.wantReload = false; e.wantThrow = false;
    if (!e.alive || G.frozen) return;
    this.percT -= dt;
    if (this.percT <= 0) { this.percT = 0.13 + Math.random() * 0.07; this.perceive(G); }
    this.decideT -= dt;
    if (this.decideT <= 0) { this.decideT = 0.3 + Math.random() * 0.2; this.decide(G); }
    this.move(G, dt);
    this.aim(G, dt);
    this.scope(G, dt);
    this.shoot(G, dt);
  };

  /* ------------------------------------------------------------- perception */
  B.perceive = function (G) {
    var e = this.e, D = this.D, W = G.W, ents = G.ents;
    var ex = e.x, ey = e.y + SS.EYE_H, ez = e.z;
    var fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    var best = null, bs = 1e9;
    for (var i = 0; i < ents.length; i++) {
      var o = ents[i];
      if (o === e || !o.alive || !G.enemy(e, o)) continue;
      var dx = o.x - ex, dz = o.z - ez, dy = o.y + 1 - ey, dh = Math.sqrt(dx * dx + dz * dz), d = Math.sqrt(dh * dh + dy * dy);
      var hurt = this.hurtBy === o && G.t - this.hurtT < 2;
      var heard = hurt || d < 4.5 || (G.t - o.lastFireT < 0.5 && d < 24) || (o.moving && d < 9);
      if (d > (hurt ? D.view + 15 : D.view)) continue;
      var dot = dh > 0.01 ? (dx * fx + dz * fz) / dh : 1;
      if (dot < D.fov && !heard && o !== this.target) continue;
      if (!W.los(ex, ey, ez, o.x, o.y + 1.0, o.z) && !W.los(ex, ey, ez, o.x, o.y + 1.5, o.z)) continue;
      // prefer targets that aren't freshly back in the game (shielded, or the player's first seconds)
      var s = d - (o === this.target ? 6 : 0) + (o.isPlayer ? D.playerBias + (G.t - o.spawnT < 3.5 ? 8 : 0) : 0) + (o.shield > 0 ? 12 : 0) - (hurt ? 6 : 0) + (dot < 0 ? 5 : 0);
      if (s < bs) { bs = s; best = o; }
    }
    if (best) {
      if (best !== this.target || G.t - this.seeT > 1.2) {
        // new contact: react after a human delay, aim starts off
        var behind = ((best.x - ex) * fx + (best.z - ez) * fz) < 0;
        this.reactUntil = G.t + D.react * rnd(0.8, 1.3) * (behind ? 1.35 : 1);
        this.acquireT = G.t;
        this.errT = 0;
        this.eyaw = gauss() * D.err * 1.6; this.epit = gauss() * D.err * 0.8;
        this.tvx = 0; this.tvz = 0; this.latS = 0;
        if (best !== this.target) { this.burstT = 0; this.pauseT = rnd(0, 0.2); }
      }
      this.target = best; this.visible = true; this.seeT = G.t;
      this.lkx = best.x; this.lky = best.y; this.lkz = best.z; this.lkT = G.t;
    } else {
      this.visible = false;
      if (this.target && (!this.target.alive || G.t - this.seeT > 0.45)) this.target = null;
    }
  };

  /* --------------------------------------------------------------- decisions */
  B.decide = function (G) {
    var e = this.e, nav = G.nav, D = this.D;
    var t = this.target;
    // low on paint: grab health if it's close and not in a point-blank fight
    if (e.hp < 45 && (!t || this.dist(t) > 9)) {
      var hp = this.nearestPickup(G, 'hp', 26);
      if (hp) { this.setGoal(G, hp.node, 'hp'); this.mode = 'pickup'; return; }
    }
    if (t && t.alive) {
      // reloading or hurt: duck behind something
      if ((e.reloadT > 0 || e.hp < 35 || (e.ammo[e.wpn] === 0)) && G.t > this.nextCover && this.dist(t) < 22) {
        var c = this.findCover(G, t);
        this.nextCover = G.t + 3;
        if (c >= 0) { this.coverNode = c; this.coverT = G.t + rnd(1.4, 2.4); this.mode = 'cover'; this.setGoal(G, c, 'cover'); return; }
      }
      if (this.mode === 'cover' && G.t < this.coverT) return;
      this.mode = 'fight';
      return;
    }
    if (this.mode === 'cover' && G.t < this.coverT) return;
    // hunt where we last saw or heard someone
    if (G.t - this.lkT < 5 && this.aggr > 0.2) {
      var n = nav.nearest(this.lkx, this.lky, this.lkz);
      if (n >= 0 && (this.goalKind !== 'hunt' || this.goal !== n)) { this.setGoal(G, n, 'hunt'); }
      this.mode = 'hunt';
      if (this.dist2(this.lkx, this.lkz) > 2.5) return;
      this.lkT = -99;
    }
    // shopping trip: ammo or the power star
    var tot = 0; for (var w = 0; w < 3; w++) tot += e.res[w];
    if (tot < 20 || e.balloons === 0) { var am = this.nearestPickup(G, 'ammo', 30); if (am) { this.setGoal(G, am.node, 'ammo'); this.mode = 'pickup'; return; } }
    var pw = this.nearestPickup(G, 'power', 22);
    if (pw && Math.random() < 0.6) { this.setGoal(G, pw.node, 'power'); this.mode = 'pickup'; return; }
    // roam
    this.mode = 'roam';
    if (this.goal < 0 || this.pi >= this.plen || G.t > this.goalT) this.pickRoam(G);
  };
  B.dist = function (o) { var dx = o.x - this.e.x, dz = o.z - this.e.z, dy = o.y - this.e.y; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
  B.dist2 = function (x, z) { var dx = x - this.e.x, dz = z - this.e.z; return Math.sqrt(dx * dx + dz * dz); };
  B.nearestPickup = function (G, type, maxD) {
    var best = null, bd = maxD;
    for (var i = 0; i < G.pickups.length; i++) {
      var p = G.pickups[i];
      if (p.type !== type || !p.active || p.node < 0) continue;
      var d = this.dist2(p.x, p.z) + Math.abs(p.y - this.e.y) * 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  B.pickRoam = function (G) {
    var nav = G.nav, e = this.e, hot = G.hotNodes, n = -1;
    // team wingman: stay near the player
    if (this.follow && G.player && G.player.alive && Math.random() < 0.7) {
      var P = G.player;
      if (this.dist(P) > 7) n = nav.nearest(P.x + rnd(-3, 3), P.y, P.z + rnd(-3, 3));
    }
    if (n < 0 && hot.length && Math.random() < 0.75) {
      // a hot spot we haven't visited lately, not too close
      for (var tries = 0; tries < 8; tries++) {
        var h = hot[(Math.random() * hot.length) | 0];
        var d = Math.sqrt((nav.x[h] - e.x) * (nav.x[h] - e.x) + (nav.z[h] - e.z) * (nav.z[h] - e.z));
        if (d < 6 || this.recent.indexOf(h) >= 0) continue;
        // teams push towards the enemy half, but never camp the other team's spawn area
        if (G.mode === 'team' && e.team) {
          if (Math.random() < 0.5) { var side = e.team === 1 ? 1 : -1; if (nav.z[h] * side < -8) continue; }
          if (this.nearFoeSpawn(G, nav.x[h], nav.z[h], 7)) continue;
        }
        n = h; break;
      }
    }
    if (n < 0) n = nav.goodList[(Math.random() * nav.goodList.length) | 0];
    this.recent.push(n); if (this.recent.length > 4) this.recent.shift();
    this.setGoal(G, n, 'roam');
    this.goalT = G.t + rnd(10, 18);
  };
  B.nearFoeSpawn = function (G, x, z, r) {
    var sp = G.spawns, t = this.e.team;
    for (var i = 0; i < sp.length; i++) { var s = sp[i]; if (s.team && s.team !== t && (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z) < r * r) return true; }
    return false;
  };
  B.setGoal = function (G, node, kind) {
    if (node < 0) return;
    var e = this.e, nav = G.nav;
    var s = nav.nearest(e.x, e.y, e.z);
    this.goal = node; this.goalKind = kind;
    this.plen = nav.path(s, node, this.path);
    this.pi = this.plen > 1 ? 1 : 0;
    this.repathT = G.t + rnd(1.6, 2.6);
    if (!this.plen) { this.goal = -1; }
  };
  // a reachable spot close by that the enemy can't see
  B.findCover = function (G, t) {
    var nav = G.nav, W = G.W, e = this.e, n = nav.n, MAXL = nav.MAXL;
    var ci = Math.floor(e.x - nav.o), cj = Math.floor(e.z - nav.o);
    var best = -1, bd = 1e9, tx = t.x, ty = t.y + SS.EYE_H, tz = t.z, checks = 0;
    for (var k = 0; k < 60 && checks < 26; k++) {
      var i = ci + ((Math.random() * 13) | 0) - 6, j = cj + ((Math.random() * 13) | 0) - 6;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      for (var s = 0; s < MAXL; s++) {
        var id = nav.cellNodes[(j * n + i) * MAXL + s];
        if (id < 0 || !nav.good[id]) continue;
        if (Math.abs(nav.y[id] - e.y) > 1.2) continue;
        var dx = nav.x[id] - e.x, dz = nav.z[id] - e.z, d = dx * dx + dz * dz;
        // don't run towards the enemy for cover
        var tdx = tx - e.x, tdz = tz - e.z;
        if (dx * tdx + dz * tdz > 0 && d > 4) continue;
        if (d >= bd) continue;
        checks++;
        if (!W.los(tx, ty, tz, nav.x[id], nav.y[id] + 1.2, nav.z[id])) { bd = d; best = id; }
      }
    }
    return best;
  };

  /* ---------------------------------------------------------------- movement */
  B.move = function (G, dt) {
    var e = this.e, nav = G.nav, D = this.D, t = this.target;
    var wantX = 0, wantZ = 0, followPath = true;
    // a scoped sniper settles and holds still (and is easier to hit back)
    if (e.zoom && this.mode === 'fight') { e.mx = e.mz = 0; this.stuckT = 0; this.pathT = 0; this.pushT = 0; this.sx = this.ppx = e.x; this.sz = this.ppz = e.z; return; }
    // stuck detection. Pushing into something (a wall, a corner, a rail) shows as wanting to go somewhere
    // but not moving that way; going round in circles on a path shows as no ground covered in 0.75 s.
    // Either one: hop, side-step round it for a moment, then work out a fresh path from wherever we are.
    var pdx = e.x - this.ppx, pdz = e.z - this.ppz;
    this.ppx = e.x; this.ppz = e.z;
    if (this.lw > 0.5 && pdx * this.lwx + pdz * this.lwz < dt * this.lw * this.lw) this.pushT += dt; else this.pushT = 0;
    this.stuckT += dt;
    if (this.stuckT > 0.75 || this.pushT > 0.6) {
      var moved = Math.abs(e.x - this.sx) + Math.abs(e.z - this.sz);
      if (this.escW) this.escW = false;         // the stretch with the side-step in it counts neither way
      else if (this.pushT > 0.6 || (moved < 0.3 && this.pathT > 0.5)) {
        this.stuck++;
        e.jumpReq = true;
        this.strafe = -this.strafe;
        this.escape(G);
        if (this.stuck >= 3) { this.stuck = 0; this.pickRoam(G); }
      } else if (moved > 2) this.stuck = 0;
      this.stuckT = 0; this.pathT = 0; this.pushT = 0; this.sx = e.x; this.sz = e.z;
    }
    if (this.escT > 0) {
      this.escT -= dt; this.pushT = 0;
      if (this.escT > 0) { e.mx = this.escX; e.mz = this.escZ; this.lw = 0; return; }
      if (this.goal >= 0) this.setGoal(G, this.goal, this.goalKind);
      this.lookT = 0.5;
    }
    if (this.mode === 'fight' && t) {
      var dx = t.x - e.x, dz = t.z - e.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= d; dz /= d;
      var R = RANGES[e.wpn];
      var px = -dz, pz = dx;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rnd(0.45, 1.4); if (Math.random() < 0.7) this.strafe = -this.strafe; }
      var st = Math.random() < D.strafe ? 1 : 0.35;
      if (d > R[1] || !this.visible) {
        // close in along the nav path, strafing a little
        if (this.goalKind !== 'chase' || G.t > this.repathT) this.setGoal(G, nav.nearest(t.x, t.y, t.z), 'chase');
        followPath = true;
        this.side = px * this.strafe * 0.35 * st; this.sidez = pz * this.strafe * 0.35 * st;
      } else {
        followPath = false;
        var fwd = d < R[0] ? -0.7 : (d > (R[0] + R[1]) / 2 ? 0.35 : 0);
        wantX = px * this.strafe * st + dx * fwd;
        wantZ = pz * this.strafe * st + dz * fwd;
        // don't strafe off ledges or into walls: probe the nav grid ahead (10 times a second is plenty)
        this.probeT -= dt;
        if (this.probeT <= 0) {
          this.probeT = 0.1;
          var l = Math.sqrt(wantX * wantX + wantZ * wantZ) || 1;
          var ax = e.x + wantX / l * 1.1, az = e.z + wantZ / l * 1.1;
          var probe = nav.nearest(ax, e.y, az, true), W = G.W;
          W.sa = ax - 0.36; W.sb = e.y + 0.6; W.sc = az - 0.36; W.sd = ax + 0.36; W.se = e.y + 1.7; W.sf = az + 0.36;
          if (probe < 0 || Math.abs(nav.y[probe] - e.y) > 0.6 || Math.abs(nav.x[probe] - ax) + Math.abs(nav.z[probe] - az) > 1.4 || W._solid()) {
            // blocked: turn round this frame and check the other side on the next one (and don't back
            // into a wall meanwhile)
            this.strafe = -this.strafe; this.probeT = 0;
            if (fwd < 0) { var bx = e.x - dx * 0.9, bz = e.z - dz * 0.9; if (W.solid(bx - 0.36, e.y + 0.6, bz - 0.36, bx + 0.36, e.y + 1.7, bz + 0.36)) fwd = 0; }
            wantX = dx * fwd; wantZ = dz * fwd;
          }
        }
        this.jumpT -= dt;
        if (this.jumpT <= 0) { this.jumpT = rnd(0.8, 2.2); if (Math.random() < D.jump) e.jumpReq = true; }
      }
    } else {
      this.side = 0; this.sidez = 0;
      if (this.plen && G.t > this.repathT && this.goal >= 0) this.setGoal(G, this.goal, this.goalKind);
    }
    if (followPath && this.plen) {
      // advance along the path; skip ahead when a later node is in plain walking reach
      var X = nav.x, Y = nav.y, Z = nav.z, P = this.path;
      while (this.pi < this.plen) {
        var nx = X[P[this.pi]], nz = Z[P[this.pi]], ny = Y[P[this.pi]];
        var ddx = nx - e.x, ddz = nz - e.z;
        if (ddx * ddx + ddz * ddz < 0.45 && Math.abs(ny - e.y) < 1.0) this.pi++; else break;
      }
      if (this.pi >= this.plen) { this.plen = 0; if (this.mode === 'roam' || this.mode === 'pickup') this.goalT = 0; }
      else {
        this.lookT -= dt;
        if (this.lookT <= 0) {
          this.lookT = 0.25;
          for (var k = Math.min(this.plen - 1, this.pi + 3); k > this.pi; k--) {
            if (Math.abs(Y[P[k]] - e.y) > 0.3 || Math.abs(Y[P[k - 1]] - Y[P[k]]) > 0.3) continue;
            if (this.clearWalk(G, e.x, e.y, e.z, X[P[k]], Z[P[k]])) { this.pi = k; break; }
          }
        }
        var tx = X[P[this.pi]], tz = Z[P[this.pi]], ty = Y[P[this.pi]];
        wantX = tx - e.x; wantZ = tz - e.z;
        var dd = Math.sqrt(wantX * wantX + wantZ * wantZ) || 1;
        wantX /= dd; wantZ /= dd;
        // hop onto a higher block
        if (ty > e.y + 0.5 && dd < 1.4 && e.grounded) e.jumpReq = true;
        if (this.side) { wantX += this.side; wantZ += this.sidez; }
        if (!t && dd > 3 && this.mode !== 'cover') e.sprint = this.plen - this.pi > 4;
      }
    }
    var l2 = Math.sqrt(wantX * wantX + wantZ * wantZ);
    if (l2 > 1) { wantX /= l2; wantZ /= l2; }
    e.mx = wantX; e.mz = wantZ;
    this.lwx = wantX; this.lwz = wantZ; this.lw = Math.min(l2, 1);
    if (l2 > 0.5 && followPath && this.plen) this.pathT += dt;
  };
  // side-step out of a stall: sideways from the way we were pushing (to the side the next path node is on,
  // e.g. back in line with a doorway), the other side if that is blocked too, else straight back
  B.escape = function (G) {
    var e = this.e, W = G.W, wx = this.lwx, wz = this.lwz, l = Math.sqrt(wx * wx + wz * wz);
    if (l < 0.1) return;
    wx /= l; wz /= l;
    var s = this.stuck & 1 ? 1 : -1;
    if (this.plen && this.pi < this.plen) {
      var n = this.path[this.pi], c = (G.nav.z[n] - e.z) * wx - (G.nav.x[n] - e.x) * wz;
      if (c > 0.2) s = 1; else if (c < -0.2) s = -1;
    }
    var dx = -wx, dz = -wz;
    for (var k = 0; k < 2; k++) {
      var sx = -wz * s - wx * 0.3, sz = wx * s - wz * 0.3, sl = Math.sqrt(sx * sx + sz * sz);
      sx /= sl; sz /= sl;
      var qx = e.x + sx * 0.8, qz = e.z + sz * 0.8;
      if (!W.solid(qx - 0.36, e.y + 0.6, qz - 0.36, qx + 0.36, e.y + 1.7, qz + 0.36) && e.y - W.ground(qx, qz, 0.2, e.y + 0.6) < 1.2) { dx = sx; dz = sz; break; }
      s = -s;
    }
    this.escX = dx; this.escZ = dz; this.escT = 0.3; this.escW = true;
  };
  B.clearWalk = function (G, x0, y, z0, x1, z1) {
    var dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz), n = Math.ceil(L / 0.45), W = G.W, nav = G.nav;
    for (var i = 1; i <= n; i++) {
      var x = x0 + dx * i / n, z = z0 + dz * i / n;
      if (W.solid(x - 0.4, y + 0.5, z - 0.4, x + 0.4, y + 1.7, z + 0.4)) return false;
      var g = W.ground(x, z, 0.3, y + 0.5);
      if (y - g > 0.45) return false;
      var nd = nav.nearest(x, y, z, true);
      if (nd < 0 || Math.abs(nav.y[nd] - y) > 0.5) return false;
    }
    return true;
  };

  /* --------------------------------------------------------------------- aim */
  B.aim = function (G, dt) {
    var e = this.e, D = this.D, t = this.target;
    var goalYaw = e.yaw, goalPit = 0, rate = 3;
    if (this.nadeAim) {
      goalYaw = this.ny; goalPit = this.np; rate = D.turn;
    } else if (t && t.alive && (this.visible || G.t - this.seeT < 0.4)) {
      var W = SS.WEAPONS[e.wpn];
      var ex = e.x, ey = e.y + SS.EYE_H, ez = e.z;
      var ah = Math.random() < D.head * 0.1 ? 1.4 : (this.headAim ? 1.38 : 0.95);
      var dx = t.x - ex, dz = t.z - ez, dh = Math.sqrt(dx * dx + dz * dz);
      // the bot reads the target's movement with a delay, so a change of direction wrong-foots it
      var kr = Math.min(1, dt * D.read);
      this.tvx += (t.vx - this.tvx) * kr; this.tvz += (t.vz - this.tvz) * kr;
      var lat = dh > 0.01 ? (t.vx * dz - t.vz * dx) / dh : 0;
      if (lat * this.latS < 0 && Math.abs(this.latS) > 2.5 && Math.abs(lat) > 1) {
        // the target just reversed a strafe: aim overshoots the old way for a moment
        this.eyaw += (this.latS > 0 ? 1 : -1) * Math.min(0.14, 0.5 * D.track / Math.max(4, dh)); this.errT = Math.min(this.errT, 0.1);
        this.latS = lat;
      } else this.latS += (lat - this.latS) * Math.min(1, dt * 8);
      var tt = dh / W.speed * D.lead;
      var ax = t.x + this.tvx * tt - ex, az = t.z + this.tvz * tt - ez, ay = t.y + ah - ey;
      var tyaw = Math.atan2(-ax, -az), tpit = Math.atan2(ay, Math.sqrt(ax * ax + az * az));
      // how fast the TARGET moves across our view (a strafing target is harder to track; our own
      // movement is already paid for by the blaster's moving spread)
      this.tyawVel += (Math.abs(lat) / Math.max(dh, 2) - this.tyawVel) * Math.min(1, dt * 6);
      // wandering error that settles while we track
      this.errT -= dt;
      var settle = Math.max(D.errMin, 1 - (G.t - this.acquireT) / D.settle * (1 - D.errMin));
      var mag = D.err * settle * (1 + this.tyawVel * D.track) * (e.grounded ? 1 : 1.4) * (dh < 4 ? 0.6 : 1) * (e.zoom ? 0.8 : 1);
      if (this.errT <= 0) {
        this.errT = rnd(0.25, 0.55);
        this.eyawT = gauss() * mag; this.epitT = gauss() * mag * 0.55;
        this.headAim = Math.random() < D.head;
      }
      var k = Math.min(1, dt * 5);
      this.eyaw += (this.eyawT - this.eyaw) * k; this.epit += (this.epitT - this.epit) * k;
      goalYaw = tyaw + this.eyaw; goalPit = tpit + this.epit; rate = D.turn;
      this.idealYaw = tyaw; this.idealPit = tpit; this.tdist = Math.sqrt(dh * dh + ay * ay);
    } else {
      // look where we're going, or towards the last noise
      if (G.t - this.lkT < 3 && G.t - this.hurtT < 3) {
        goalYaw = Math.atan2(-(this.lkx - e.x), -(this.lkz - e.z)); rate = D.turn * 0.8;
      } else if (Math.abs(e.mx) + Math.abs(e.mz) > 0.1) {
        goalYaw = Math.atan2(-e.mx, -e.mz) + Math.sin(G.t * 0.9 + this.aggr * 9) * 0.35;
      } else goalYaw = e.yaw + Math.sin(G.t * 0.6 + this.aggr * 5) * 0.6;
      goalPit = -0.05;
    }
    var dyw = goalYaw - e.yaw, dpt = goalPit - e.pitch;
    while (dyw > Math.PI) dyw -= 6.283185307; while (dyw < -Math.PI) dyw += 6.283185307;
    var mt = D.maxTurn * dt;
    var sy = dyw * Math.min(1, rate * dt), sp = dpt * Math.min(1, rate * dt);
    if (sy > mt) sy = mt; else if (sy < -mt) sy = -mt;
    var ny = e.yaw + sy;
    if (ny > Math.PI) ny -= 6.283185307; else if (ny < -Math.PI) ny += 6.283185307;
    e.yaw = ny;
    e.pitch = Math.max(-1.3, Math.min(1.3, e.pitch + sp));
  };

  /* ------------------------------------------------------------------- scope */
  // sniper bots scope in on a visible target beyond ~12 m (slower, precise, and a glint gives them away)
  B.scope = function (G, dt) {
    var e = this.e, t = this.target;
    var z = !!(e.wpn === 2 && !this.nadeAim && t && t.alive && (this.visible || G.t - this.seeT < 0.6) && e.reloadT <= 0 && e.swapT <= 0 &&
      this.dist(t) > 11.5 && e.ammo[2] > 0);
    if (z !== e.zoom) { e.zoom = z; if (G.ui.botScope && !G.headless && z) G.ui.botScope(e); }
    this.zoomT = z ? this.zoomT + dt : 0;
  };

  /* ------------------------------------------------------------------- shoot */
  B.shoot = function (G, dt) {
    var e = this.e, D = this.D, t = this.target;
    if (e.ammo[e.wpn] === 0) { e.wantReload = true; this.burstT = 0; }
    // balloon throw in progress
    if (this.nadeAim) {
      if (Math.abs(wrap(this.ny - e.yaw)) < 0.08 && Math.abs(this.np - e.pitch) < 0.08) { e.wantThrow = true; this.nadeAim = false; this.nadeT = G.t + rnd(9, 16); }
      else if (G.t > this.nadeGiveUp) this.nadeAim = false;
      return;
    }
    if (!t || !t.alive) {
      this.burstT = 0;
      if (e.ammo[e.wpn] < SS.WEAPONS[e.wpn].mag * 0.4 && e.res[e.wpn] > 0) e.wantReload = true;
      // lob a balloon where we last saw someone hiding
      if (e.balloons > 0 && G.t > this.nadeT && G.t - this.lkT < 2.5 && Math.random() < D.nade * 0.5) {
        var d = this.dist2(this.lkx, this.lkz);
        if (d > 7 && d < 21) this.planThrow(G, this.lkx, this.lky + 0.3, this.lkz);
        else this.nadeT = G.t + 2;
      }
      return;
    }
    if (!this.visible || G.t < this.reactUntil) return;
    var dist = this.tdist || this.dist(t);
    // weapon choice by range (snipers pull out the auto up close)
    if (e.wpn === 2 && dist < 9 && e.swapT <= 0) { e.wantSwap = 0; return; }
    if (e.wpn === 0 && e.prefW === 2 && dist > 18 && e.swapT <= 0 && e.ammo[2] + e.res[2] > 0) { e.wantSwap = 2; return; }
    var eyaw = Math.abs(wrap(this.idealYaw - e.yaw)), epit = Math.abs(this.idealPit - e.pitch);
    var tol = Math.atan2(0.62, dist) + 0.02;
    var on = eyaw < tol && epit < tol * 1.4;
    if (e.wpn === 0) {
      if (this.burstT > 0) { this.burstT -= dt; e.fire = true; if (this.burstT <= 0) this.pauseT = rnd(D.pause[0], D.pause[1]); }
      else if (this.pauseT > 0) this.pauseT -= dt;
      else if (on) { this.burstT = rnd(D.burst[0], D.burst[1]); e.fire = true; }
    } else if (e.wpn === 1) {
      if (on && dist < 15) e.fireP = true;
    } else if (e.zoom) {
      // scoped: wait for the charge (glint) and for the crosshair to really sit on the target
      var tolS = Math.atan2(0.3, dist) + D.slop;
      if (this.zoomT > D.scope && eyaw < tolS && epit < tolS * 1.3 && e.fireT <= 0) {
        e.fireP = true;
        var jk = t.bot && !t.autopilot ? D.jerk * 1.4 : D.jerk;       // snipers duelling other bots miss a bit more
        e.ry += gauss() * jk; e.rp += gauss() * jk * 0.7;              // applied to this shot by aimDir()
        this.zoomT = 0;                                             // the glint charges up again before the next shot
      }
    } else {
      if (on && G.t - this.acquireT > D.settle * 0.5) e.fireP = true;
    }
    // occasionally lob a balloon at a visible enemy at mid range
    if (e.balloons > 0 && G.t > this.nadeT && dist > 8 && dist < 18 && Math.random() < D.nade * dt * 0.6) this.planThrow(G, t.x, t.y + 0.3, t.z);
  };
  B.planThrow = function (G, x, y, z) {
    var sol = G.solveThrow(this.e, x, y, z);
    if (!sol) { this.nadeT = G.t + 3; return; }
    this.ny = sol.yaw; this.np = sol.pitch; this.nadeAim = true; this.nadeGiveUp = G.t + 1.2;
  };
  SS.Bot = Bot;

  SS.BOT_NAMES = ['كعكة', 'بطاطس', 'فقاعة', 'صاروخ', 'نمنم', 'كوكي', 'مشمش', 'دبدوب', 'بسكوت', 'فلفل', 'بندق', 'زنجبيل', 'ليمونة', 'حلزون', 'توتة', 'قرفة', 'فشار', 'سمسم', 'شطّور', 'بالون'];
})();
