/*
 * Castle Crash — shots, ammo, forts, damage, duel turns and the CPU aimer.
 * Pure: no DOM and no Kit. Fixed 1/60 s steps on top of CCP.
 */
(function (root) {
  'use strict';

  var CCP = root.CCP;
  var DT = CCP.DT;
  var GROUND = 640;
  var W = 1280;
  // A cleared fort cannot finish before this much time after the shot, and the
  // camera rests this long between forts. 3 shots + 2 pans stay over 20 s.
  var TIME = { watch: 5.4, pan: 2.0, miss: 1.15, duelHold: 4.2, duelCap: 12, duelMin: 20 };

  var MATS = {
    wood: { hp: 5200, fr: 0.72, re: 0.06, density: 0.012, crack: 0.42 },
    ice: { hp: 2100, fr: 0.42, re: 0.04, density: 0.01, crack: 0.34 },
    stone: { hp: 16000, fr: 0.86, re: 0.03, density: 0.02, crack: 0.5 },
    soda: { hp: 2800, fr: 0.55, re: 0.08, density: 0.011, crack: 0.3 }
  };
  var AMMO = {
    ball: { r: 16, m: 9, fr: 0.35, re: 0.42, base: 1100 },
    marble: { r: 13, m: 6, fr: 0.32, re: 0.38, base: 1040 },
    bowl: { r: 22, m: 78, fr: 0.4, re: 0.08, base: 900 },
    boom: { r: 17, m: 12, fr: 0.34, re: 0.16, base: 1000 },
    ice: { r: 16, m: 11, fr: 0.3, re: 0.12, base: 1120 }
  };
  var ORDER = ['ball', 'marble', 'bowl', 'ice', 'boom'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function speedOf(id, power) {
    var a = AMMO[id] || AMMO.ball;
    return a.base * (0.4 + 0.6 * clamp(power, 0, 1));
  }
  function massOf(mat, w, h) {
    var d = (MATS[mat] || MATS.wood).density;
    return Math.max(4, d * w * h);
  }

  function addGround(world) {
    CCP.addBox(world, {
      x: W / 2, y: GROUND + 40, w: 2400, h: 80, type: 'static', m: 0,
      fr: 0.9, re: 0.04, role: 'ground', mat: 'ground', hp: 1e9
    });
  }

  function addBlock(world, spec, ox, oy, flip) {
    var mat = MATS[spec.mat] || MATS.wood;
    var x = ox + (flip ? -spec.x : spec.x);
    var y = oy + spec.y;
    var ang = (spec.a || 0) * (flip ? -1 : 1);
    var m = massOf(spec.mat, spec.w, spec.h);
    var b;
    if (spec.wedge) {
      var hw = spec.w / 2, hh = spec.h / 2;
      b = CCP.addPoly(world, {
        x: x, y: y, a: ang, m: m, fr: mat.fr, re: mat.re, role: 'block', mat: spec.mat, hp: mat.hp,
        verts: [[-hw, hh], [hw, hh], [0, -hh]],
        user: { dmg: 0, crack: 0, fort: spec.fort }
      });
    } else {
      b = CCP.addBox(world, {
        x: x, y: y, a: ang, w: spec.w, h: spec.h, m: m, fr: mat.fr, re: mat.re,
        role: 'block', mat: spec.mat, hp: mat.hp, maxHp: mat.hp,
        user: { dmg: 0, crack: 0, fort: spec.fort, w: spec.w, h: spec.h }
      });
    }
    b.damp = 0.08;
    return b;
  }

  function addGloopy(world, spec, ox, oy, flip, tough) {
    var x = ox + (flip ? -spec.x : spec.x);
    var b = CCP.addCircle(world, {
      x: x, y: oy + spec.y, r: spec.r || 18, m: 6.5, fr: 0.55, re: 0.28,
      role: 'gloopy', mat: 'gloopy', hp: tough, maxHp: tough, damp: 0.06,
      user: { tough: tough, popped: 0, fort: spec.fort, crush: 0 }
    });
    return b;
  }

  function aliveGloopies(world) {
    var n = 0, i, b;
    for (i = 0; i < world.bodies.length; i++) {
      b = world.bodies[i];
      if (b.role === 'gloopy' && !b.dead && !b.user.popped) n++;
    }
    return n;
  }

  function popGloopy(world, b, session) {
    if (!b || b.user.popped) return;
    b.user.popped = 1;
    session.popped++;
    session.popThis++;
    if (session.sidePop && b.user.side != null) session.sidePop[b.user.side]++;
    session.events.push({ t: 'pop', x: b.x, y: b.y });
    var left = 0, i, g;
    for (i = 0; i < world.bodies.length; i++) {
      g = world.bodies[i];
      if (g.role === 'gloopy' && !g.user.popped && g.user.fort === b.user.fort) left++;
    }
    if (left === 0) session.events.push({ t: 'last', x: b.x, y: b.y, fort: b.user.fort });
    CCP.remove(world, b);
  }

  function breakBlock(world, b, session) {
    if (!b || b.dead || b.role !== 'block') return;
    session.broken++;
    session.events.push({ t: 'break', x: b.x, y: b.y, mat: b.mat });
    var soda = b.mat === 'soda';
    var x = b.x, y = b.y;
    CCP.remove(world, b);
    if (soda) blast(world, session, x, y, 168, 11000, 1);
  }

  function blast(world, session, x, y, radius, power, chain) {
    session.events.push({ t: 'blast', x: x, y: y, r: radius });
    var i, b, dx, dy, d, hit;
    CCP.blast(world, x, y, radius, power);
    for (i = world.bodies.length - 1; i >= 0; i--) {
      b = world.bodies[i];
      if (!b || b.dead) continue;
      dx = b.x - x; dy = b.y - y; d = Math.hypot(dx, dy);
      if (d > radius) continue;
      hit = power * (1 - d / radius) * 0.55;
      if (b.role === 'gloopy') popGloopy(world, b, session);
      else if (b.role === 'block') {
        var mul = b.mat === 'ice' ? 1.4 : b.mat === 'stone' ? 0.45 : 1;
        b.user.dmg += hit * mul;
        if (b.user.dmg >= b.hp) {
          if (b.mat === 'soda' && chain) breakBlock(world, b, session);
          else if (b.mat !== 'soda') breakBlock(world, b, session);
          else { b.user.dmg = b.hp; breakBlock(world, b, session); }
        }
      }
    }
  }

  function hurt(world, session, b, j, ammo) {
    if (!b || b.dead) return;
    if (b.role === 'gloopy') {
      var need = b.user.tough;
      if (ammo === 'ice') need *= 0.85;
      if (j >= need) popGloopy(world, b, session);
      return;
    }
    if (b.role !== 'block') return;
    var mul = 1;
    if (ammo === 'ice' && b.mat === 'ice') mul = 2.8;
    else if (ammo === 'ice' && b.mat === 'stone') mul = 0.55;
    else if (ammo === 'bowl') mul = 1.2;
    else if (ammo === 'ball' && b.mat === 'stone') mul = 0.65;
    b.user.dmg += j * mul;
    var mat = MATS[b.mat] || MATS.wood;
    var stage = b.user.dmg > b.hp * 0.72 ? 2 : b.user.dmg > b.hp * mat.crack ? 1 : 0;
    if (stage !== b.user.crack) {
      b.user.crack = stage;
      session.events.push({ t: 'crack', x: b.x, y: b.y, n: stage, mat: b.mat });
    }
    if (b.user.dmg >= b.hp) breakBlock(world, b, session);
  }

  function applyHits(session) {
    var w = session.world, i, h, ammo, shot;
    for (i = 0; i < w.hits.length; i++) {
      h = w.hits[i];
      shot = h.a.role === 'shot' ? h.a : h.b.role === 'shot' ? h.b : null;
      ammo = shot && shot.user ? shot.user.ammo : '';
      if (h.j > 400) session.movedShot++;
      hurt(w, session, h.a, h.j, ammo);
      hurt(w, session, h.b, h.j, ammo);
    }
    for (i = 0; i < w.rests.length; i++) {
      h = w.rests[i];
      crush(session, h.a, h.b, h);
      crush(session, h.b, h.a, h);
    }
  }

  function crush(session, gloopy, other, h) {
    if (!gloopy || gloopy.role !== 'gloopy' || gloopy.user.popped) return;
    if (!other || other.role === 'shot' || other.role === 'gloopy') return;
    // Normal points from A to B. A load sitting on the gloopy pushes it downward.
    var down = (h.a === gloopy ? -h.ny : h.ny) > 0.55;
    if (!down || h.j < gloopy.user.tough * 0.22) { gloopy.user.crush = 0; return; }
    gloopy.user.crush += DT;
    if (gloopy.user.crush > 0.34) popGloopy(session.world, gloopy, session);
  }

  function launch(session, ammo, angle, power) {
    var spec = AMMO[ammo] || AMMO.ball;
    var sp = speedOf(ammo, power);
    var dir = session.dir || 1;
    var b = CCP.addCircle(session.world, {
      x: session.sling.x, y: session.sling.y, r: spec.r, m: spec.m,
      vx: Math.cos(angle) * sp * dir, vy: -Math.sin(angle) * sp,
      fr: spec.fr, re: spec.re, role: 'shot', mat: ammo, hp: 1e9, damp: 0.015,
      user: { ammo: ammo, tapped: 0, age: 0 }
    });
    session.shots.push(b);
    session.used++;
    session.ammoLeft--;
    session.phase = 'fly';
    session.phaseT = 0;
    session.popThis = 0;
    session.movedShot = 0;
    session.tapAt = session.pendingTap;
    session.pendingTap = -1;
    session.events.push({ t: 'fire', ammo: ammo, x: b.x, y: b.y });
    return b;
  }

  function tapShot(session) {
    var i, b, spec, ang, sp, dir, baby;
    if (session.phase !== 'fly') return false;
    var any = false;
    for (i = session.shots.length - 1; i >= 0; i--) {
      b = session.shots[i];
      if (!b || b.dead || b.user.tapped) continue;
      b.user.tapped = 1;
      any = true;
      session.events.push({ t: 'tap', ammo: b.user.ammo, x: b.x, y: b.y });
      if (b.user.ammo === 'marble') {
        spec = AMMO.marble;
        dir = session.dir || 1;
        ang = Math.atan2(-(b.vy), b.vx * dir);
        sp = Math.hypot(b.vx, b.vy);
        CCP.remove(session.world, b);
        session.shots.splice(i, 1);
        [-0.22, 0, 0.22].forEach(function (off, k) {
          baby = CCP.addCircle(session.world, {
            x: b.x + k * 6 * dir, y: b.y - 4, r: 9, m: 4.2,
            vx: Math.cos(ang + off) * sp * 0.96 * dir, vy: -Math.sin(ang + off) * sp * 0.96,
            fr: spec.fr, re: spec.re, role: 'shot', mat: 'marble', hp: 1e9, damp: 0.015,
            user: { ammo: 'marble', tapped: 1, age: b.user.age }
          });
          session.shots.push(baby);
        });
      } else if (b.user.ammo === 'boom') {
        blast(session.world, session, b.x, b.y, 176, 12500, 1);
        CCP.remove(session.world, b);
        session.shots.splice(i, 1);
      } else if (b.user.ammo === 'ice') {
        blast(session.world, session, b.x, b.y, 120, 4200, 0);
      } else if (b.user.ammo === 'bowl') {
        b.vy += 820;
        b.awake = 1;
      } else {
        var v = Math.hypot(b.vx, b.vy) || 1;
        b.vx *= 1.22; b.vy *= 1.22;
        if (Math.hypot(b.vx, b.vy) > 1500) { b.vx *= 1500 / v; b.vy *= 1500 / v; }
        b.awake = 1;
      }
    }
    return any;
  }

  function shotsGone(session) {
    var i;
    for (i = session.shots.length - 1; i >= 0; i--) {
      var b = session.shots[i];
      if (!b || b.dead) { session.shots.splice(i, 1); continue; }
      b.user.age += DT;
      if (b.y > 900 || b.x < -180 || b.x > W + 180 || b.user.age > 5.5) {
        CCP.remove(session.world, b);
        session.shots.splice(i, 1);
      }
    }
    return session.shots.length === 0;
  }

  function fortClear(session) {
    var i, b;
    for (i = 0; i < session.world.bodies.length; i++) {
      b = session.world.bodies[i];
      if (b.role === 'gloopy' && !b.user.popped && b.user.fort === session.fort) return false;
    }
    return true;
  }

  function loadFort(session, index) {
    var fort = session.level.forts[index];
    var world = session.world;
    var i, spec;
    for (i = world.bodies.length - 1; i >= 0; i--) {
      if (world.bodies[i].role !== 'ground') CCP.remove(world, world.bodies[i]);
    }
    session.shots.length = 0;
    var ox = session.originX || 0;
    var oy = session.originY || 0;
    for (i = 0; i < fort.blocks.length; i++) {
      spec = fort.blocks[i];
      spec.fort = index;
      addBlock(world, spec, ox, oy, session.flip);
    }
    for (i = 0; i < fort.gloopies.length; i++) {
      spec = fort.gloopies[i];
      spec.fort = index;
      var g = addGloopy(world, spec, ox, oy, session.flip, session.tough);
      g.user.side = session.side;
    }
    session.fort = index;
    session.phase = 'aim';
    session.phaseT = 0;
    // The same quiet start the solver saw, so a recorded shot meets the same fort.
    for (var qi = 0; qi < 20; qi++) { CCP.step(world); applyHits(session); }
  }

  function starsFor(used, budget, cleared) {
    if (!cleared) return 0;
    var left = budget - used;
    if (left >= 3) return 3;
    if (left >= 1) return 2;
    return 1;
  }

  function finishLevel(session, cleared) {
    session.phase = cleared ? 'win' : 'lose';
    session.stars = starsFor(session.used, session.budget, cleared);
    session.events.push({ t: session.phase, stars: session.stars });
  }

  function advance(session) {
    if (session.movedShot > session.bestCollapse) session.bestCollapse = session.movedShot;
    if (session.fort + 1 >= session.level.forts.length) finishLevel(session, true);
    else {
      session.phase = 'pan';
      session.phaseT = 0;
      session.nextFort = session.fort + 1;
    }
  }

  function stepLevel(session) {
    var calm, clear;
    if (session.phase === 'pan') {
      session.phaseT += DT;
      if (session.phaseT >= TIME.pan) loadFort(session, session.nextFort);
      return;
    }
    if (session.phase === 'aim' || session.phase === 'win' || session.phase === 'lose') return;
    if (session.phase === 'fly') {
      if (session.tapAt >= 0 && session.phaseT + DT >= session.tapAt) tapShot(session);
      session.phaseT += DT;
      shotsGone(session);
      calm = CCP.maxSpeed(session.world) < 6 && session.shots.length === 0;
      clear = fortClear(session);
      var need = clear ? TIME.watch : TIME.miss;
      if ((calm || session.phaseT > 8) && session.phaseT >= need) {
        if (session.movedShot > session.bestCollapse) session.bestCollapse = session.movedShot;
        session.shotDone++;
        session.lastPop = session.popThis;
        if (clear) advance(session);
        else if (session.ammoLeft <= 0) finishLevel(session, false);
        else { session.phase = 'aim'; session.phaseT = 0; }
      }
    }
  }

  function step(session) {
    if (!session || session.phase === 'win' || session.phase === 'lose' || session.phase === 'over') {
      session.time += session && session.phase === 'over' ? 0 : 0;
      return session;
    }
    session.events.length = 0;
    if (session.mode === 'duel') stepDuel(session);
    else {
      if (session.phase !== 'pan') {
        CCP.step(session.world);
        applyHits(session);
      }
      stepLevel(session);
    }
    session.time += DT;
    return session;
  }

  function startLevel(level, opts) {
    opts = opts || {};
    var world = CCP.create(opts.seed == null ? 1 : opts.seed);
    world.wind = 0;
    addGround(world);
    var budget = (level.ammo || 7) + (opts.spare || 0);
    var session = {
      mode: 'level', level: level, world: world, events: [],
      sling: { x: 214, y: 552 }, dir: 1, flip: false, originX: 0, originY: 0,
      fort: 0, phase: 'aim', phaseT: 0, time: 0,
      angle: 0.55, power: 0.72, ammo: (level.allow && level.allow[0]) || 'ball',
      allow: (level.allow || ['ball']).slice(),
      ammoLeft: budget, budget: budget, used: 0,
      shots: [], tapAt: -1, pendingTap: -1,
      tough: 2600 * (opts.tough == null ? 1 : opts.tough),
      preview: opts.preview == null ? 0.4 : opts.preview,
      popped: 0, popThis: 0, lastPop: 0, shotDone: 0,
      broken: 0, movedShot: 0, bestCollapse: 0, stars: 0, side: 0
    };
    loadFort(session, 0);
    // Let the fort go to sleep before the first shot, without charging the clock.
    session.phase = 'rest';
    for (var si = 0; si < 30; si++) { CCP.step(world); applyHits(session); }
    session.phase = 'aim';
    session.time = 0;
    session.events.length = 0;
    session.popped = 0;
    return session;
  }

  function fire(session) {
    if (!session || session.phase !== 'aim') return false;
    if (session.ammoLeft <= 0) return false;
    if (session.allow.indexOf(session.ammo) < 0) session.ammo = session.allow[0];
    launch(session, session.ammo, session.angle, session.power);
    return true;
  }

  function run(session, seconds) {
    var n = Math.round(seconds / DT), i;
    for (i = 0; i < n; i++) step(session);
    return session;
  }

  function replay(level, shots, opts) {
    var session = startLevel(level, opts || { spare: 0, tough: 1, seed: 1 });
    var i = 0, guard = 0, shot;
    while (session.phase !== 'win' && session.phase !== 'lose' && guard++ < 60 * 50) {
      if (session.phase === 'aim') {
        shot = shots[i];
        if (!shot || shot.f !== session.fort) {
          if (session.ammoLeft <= 0) finishLevel(session, false);
          else { session.ammoLeft = 0; finishLevel(session, fortClear(session) && session.fort === level.forts.length - 1); }
        } else {
          session.angle = shot.ang;
          session.power = shot.p;
          session.ammo = shot.a;
          session.pendingTap = shot.tap == null ? -1 : shot.tap;
          fire(session);
          i++;
        }
      }
      step(session);
    }
    return {
      cleared: session.phase === 'win', time: session.time, used: session.used,
      stars: session.stars, popped: session.popped, ammo: session.budget, phase: session.phase
    };
  }

  function restMax(level) {
    var worst = 0, f, session, i;
    for (f = 0; f < level.forts.length; f++) {
      session = startLevel(level, { spare: 0, tough: 1, seed: 1 });
      loadFort(session, f);
      session.phase = 'rest';
      for (i = 0; i < 600; i++) {
        CCP.step(session.world);
        applyHits(session);
      }
      if (aliveGloopies(session.world) !== level.forts[f].gloopies.length) return { ok: false, speed: 99, fort: f, popped: true };
      var sp = CCP.maxSpeed(session.world);
      if (sp > worst) worst = sp;
    }
    return { ok: worst < 2, speed: worst };
  }

  // --- duel -----------------------------------------------------------------
  function duelFort(seed) {
    // Same shape for every seed so the two forts stay mirrors. The seed still
    // feeds the wind. Three pockets, far enough apart that one ball cannot
    // pop every gloopy.
    void seed;
    var blocks = [
      { mat: 'wood', x: 36, y: -24, w: 64, h: 48, a: 0 },
      { mat: 'ice', x: 120, y: -24, w: 64, h: 48, a: 0 },
      { mat: 'stone', x: 204, y: -24, w: 64, h: 48, a: 0 }
    ];
    var gloopies = [
      { x: 36, y: -63, r: 15 },
      { x: 120, y: -63, r: 15 },
      { x: 204, y: -63, r: 15 }
    ];
    return { blocks: blocks, gloopies: gloopies };
  }

  // Place a mirrored pair of forts. Coordinates in the fort are offsets from
  // each player's ground anchor, +x toward the opponent.
  function placeDuelFort(world, fort, anchorX, dir, side, tough) {
    var i, spec, x, b;
    for (i = 0; i < fort.blocks.length; i++) {
      spec = fort.blocks[i];
      x = anchorX + dir * spec.x;
      b = addBlock(world, {
        mat: spec.mat, x: x, y: spec.y + GROUND, w: spec.w, h: spec.h, a: dir < 0 ? -(spec.a || 0) : (spec.a || 0), fort: side
      }, 0, 0, false);
      b.user.side = side;
    }
    for (i = 0; i < fort.gloopies.length; i++) {
      spec = fort.gloopies[i];
      b = addGloopy(world, { x: anchorX + dir * spec.x, y: spec.y + GROUND, r: spec.r || 16, fort: side }, 0, 0, false, tough);
      b.user.side = side;
    }
  }

  function startDuel(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 1 : opts.seed;
    var world = CCP.create(seed);
    addGround(world);
    var fort = duelFort(seed);
    var tough = 2400 * (opts.tough == null ? 1 : opts.tough);
    placeDuelFort(world, fort, 48, 1, 0, tough);
    placeDuelFort(world, fort, W - 48, -1, 1, tough);
    var session = {
      mode: 'duel', world: world, events: [], fortDef: fort, seed: seed,
      level: { forts: [fort, fort], allow: ORDER.slice() },
      phase: 'aim', phaseT: 0, time: 0, turn: 0, turnT: 0,
      dir: 1, flip: false, side: 0,
      sling: { x: 420, y: 552 },
      slings: [{ x: 420, y: 552 }, { x: W - 420, y: 552 }],
      angle: 0.62, power: 0.7, ammo: 'ball', allow: ORDER.slice(),
      ammoLeft: 99, budget: 99, used: 0, shots: [], tapAt: -1, pendingTap: -1,
      tough: tough, preview: opts.preview == null ? 0.4 : opts.preview,
      popped: 0, popThis: 0, lastPop: 0, shotDone: 0, sidePop: [0, 0],
      broken: 0, movedShot: 0, bestCollapse: 0, stars: 0,
      wind: 0, tier: opts.tier || 3, cpu: opts.cpu ? 1 : 0, winner: -1,
      rand: CCP.rng((seed * 97 + 13) >>> 0)
    };
    nextWind(session);
    return session;
  }

  function nextWind(session) {
    var w = (session.rand() * 2 - 1) * CCP.WIND_MAX;
    session.wind = w;
    session.world.wind = w;
  }

  function beginTurn(session, who) {
    session.turn = who;
    session.turnT = 0;
    session.phase = 'aim';
    session.phaseT = 0;
    session.side = who;
    session.dir = who === 0 ? 1 : -1;
    session.sling = session.slings[who];
    session.angle = 0.58;
    session.power = 0.74;
    nextWind(session);
  }

  function duelSideLeft(session, side) {
    var n = 0, i, b;
    for (i = 0; i < session.world.bodies.length; i++) {
      b = session.world.bodies[i];
      if (b.role === 'gloopy' && !b.user.popped && b.user.side === side) n++;
    }
    return n;
  }

  function stepDuel(session) {
    if (session.phase === 'celebrate') {
      session.phaseT += DT;
      if (session.time >= TIME.duelMin && session.phaseT > 0.5) session.phase = 'over';
      return;
    }
    if (session.phase === 'aim') {
      session.turnT += DT;
      if (session.cpu && session.turn === 1 && session.turnT > 0.4 && session.phase === 'aim') {
        var aim = cpuAim(session, session.tier);
        session.angle = aim.angle;
        session.power = aim.power;
        session.ammo = 'ball';
        fire(session);
      }
      if (session.phase === 'aim' && session.turnT >= TIME.duelCap) {
        fire(session);
      }
      return;
    }
    if (session.phase === 'fly') {
      if (session.tapAt >= 0 && session.phaseT + DT >= session.tapAt) tapShot(session);
      CCP.step(session.world);
      applyHits(session);
      session.phaseT += DT;
      session.turnT += DT;
      shotsGone(session);
      var calm = CCP.maxSpeed(session.world) < 8 && session.shots.length === 0;
      if ((calm || session.phaseT > 6.5) && session.phaseT >= TIME.duelHold) {
        session.shotDone++;
        session.lastPop = session.popThis;
        var left0 = duelSideLeft(session, 0), left1 = duelSideLeft(session, 1);
        if (left0 === 0 || left1 === 0) {
          session.winner = left0 === 0 ? 1 : 0;
          session.phase = 'celebrate';
          session.phaseT = 0;
          if (session.time >= TIME.duelMin) {
            /* still wait the half-second so a one-frame win is not instant */
          }
          return;
        }
        beginTurn(session, session.turn === 0 ? 1 : 0);
      }
    }
  }

  function predict(session, angle, power, ammo, frames) {
    var spec = AMMO[ammo] || AMMO.ball;
    var sp = speedOf(ammo, power);
    var dir = session.dir || 1;
    var x = session.sling.x, y = session.sling.y;
    var vx = Math.cos(angle) * sp * dir, vy = -Math.sin(angle) * sp;
    var wind = session.world.wind || 0, i, pts = [];
    for (i = 0; i < frames; i++) {
      vx += wind * DT;
      vy += CCP.G * DT;
      x += vx * DT; y += vy * DT;
      pts.push(x, y);
      if (y > GROUND) break;
    }
    return pts;
  }

  function fortHit(session, pts, side) {
    var bodies = session.world.bodies, i, k, b, x, y, dx, dy;
    for (k = 0; k < pts.length; k += 2) {
      x = pts[k]; y = pts[k + 1];
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        if (b.user && b.user.side === side && (b.role === 'block' || b.role === 'gloopy')) {
          dx = x - b.x; dy = y - b.y;
          if (dx * dx + dy * dy <= (b.rad + 10) * (b.rad + 10)) return true;
        }
      }
    }
    return false;
  }

  var NOISE_A = [0.95, 0.55, 0.28, 0.12, 0.034];
  var NOISE_P = [0.55, 0.32, 0.16, 0.07, 0.028];

  function bestAim(session) {
    var best = { angle: 0.6, power: 0.75, score: 1e9 };
    var enemy = session.turn === 0 ? 1 : 0;
    var tx = 0, ty = 0, n = 0, i, b;
    for (i = 0; i < session.world.bodies.length; i++) {
      b = session.world.bodies[i];
      if (b.user && b.user.side === enemy && b.role === 'gloopy' && !b.user.popped) {
        tx += b.x; ty += b.y; n++;
      }
    }
    if (!n) return best;
    tx /= n; ty /= n;
    var ai, p, ang, pts, dx, dy, k, d, score;
    for (ai = 2; ai <= 16; ai++) {
      ang = 0.08 * ai;
      for (p = 4; p <= 10; p++) {
        pts = predict(session, ang, p / 10, 'ball', 140);
        score = 1e9;
        for (k = 0; k < pts.length; k += 2) {
          dx = pts[k] - tx; dy = pts[k + 1] - ty;
          d = dx * dx + dy * dy;
          if (d < score) score = d;
        }
        if (score < best.score) best = { angle: ang, power: p / 10, score: score };
      }
    }
    return best;
  }

  function cpuAim(session, tier) {
    var t = clamp(tier || 3, 1, 5) - 1;
    var ideal = bestAim(session);
    var rand = session.rand;
    var ang = ideal.angle + (rand() * 2 - 1) * NOISE_A[t];
    var pow = clamp(ideal.power + (rand() * 2 - 1) * NOISE_P[t], 0.15, 1);
    return { angle: ang, power: pow, ammo: 'ball' };
  }

  function cpuHitRate(tier, trials, seed) {
    var hits = 0, i, session, aim, pts;
    for (i = 0; i < trials; i++) {
      session = startDuel({ seed: (seed || 3) + i * 17, tier: tier, cpu: 0 });
      session.turn = 1;
      session.dir = -1;
      session.sling = session.slings[1];
      session.side = 1;
      aim = cpuAim(session, tier);
      pts = predict(session, aim.angle, aim.power, 'ball', 160);
      if (fortHit(session, pts, 0)) hits++;
    }
    return hits / trials;
  }

  function symmetric(session) {
    var left = [], right = [], i, b;
    for (i = 0; i < session.world.bodies.length; i++) {
      b = session.world.bodies[i];
      if (b.role !== 'block' && b.role !== 'gloopy') continue;
      (b.user.side === 0 ? left : right).push(b);
    }
    if (left.length !== right.length || !left.length) return false;
    left.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    right.sort(function (a, b) { return a.y - b.y || (W - a.x) - (W - b.x); });
    for (i = 0; i < left.length; i++) {
      if (Math.abs(left[i].x - (W - right[i].x)) > 1.5) return false;
      if (Math.abs(left[i].y - right[i].y) > 1.5) return false;
      if (left[i].mat !== right[i].mat) return false;
    }
    return true;
  }

  function sandbox() {
    var world = CCP.create(1);
    addGround(world);
    return {
      mode: 'level', world: world, events: [], phase: 'fly', phaseT: 0, time: 0,
      shots: [], sling: { x: 214, y: 552 }, dir: 1, fort: 0, tough: 2600,
      ammoLeft: 5, budget: 5, used: 0, popped: 0, popThis: 0, broken: 0,
      movedShot: 0, bestCollapse: 0, allow: ORDER.slice(), pendingTap: -1, tapAt: -1,
      level: { forts: [{ blocks: [], gloopies: [] }] }
    };
  }

  function practice(level, fortIndex, opts) {
    var session = startLevel(level, opts || { spare: 0, tough: 1, seed: 1 });
    if (fortIndex) {
      loadFort(session, fortIndex);
      for (var si = 0; si < 20; si++) { CCP.step(session.world); applyHits(session); }
      session.phase = 'aim';
      session.time = 0;
      session.popped = 0;
      session.events.length = 0;
    }
    return session;
  }

  root.CC = {
    TIME: TIME, MATS: MATS, AMMO: AMMO, ORDER: ORDER, GROUND: GROUND, W: W,
    startLevel: startLevel, startDuel: startDuel, step: step, run: run, fire: fire,
    tap: tapShot, practice: practice, replay: replay, restMax: restMax, predict: predict,
    cpuAim: cpuAim, cpuHitRate: cpuHitRate, symmetric: symmetric, bestAim: bestAim,
    speedOf: speedOf, starsFor: starsFor, sandbox: sandbox, launch: launch,
    aliveGloopies: aliveGloopies, fortClear: fortClear, duelFort: duelFort,
    addBlock: addBlock, addGloopy: addGloopy
  };
})(typeof window !== 'undefined' ? window : globalThis);
