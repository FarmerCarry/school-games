/* هجوم الروبوتات — Pure arena simulation (1P/2P, auto-aim, EMP dash, weapon pods, waves, Mega-Boss). */
(function () {
  'use strict';

  var D = globalThis.RSData || (typeof require === 'function' ? require('./data.js') : null);
  var MAX_ENEMIES = 88, MAX_SHOTS = 140, MAX_BOLTS = 110, MAX_PODS = 8, MAX_ARCS = 20, MAX_EVENTS = 64;

  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function findByKey(list, key, fallback) {
    if (typeof key === 'number') return list[clamp(key | 0, 0, list.length - 1)];
    for (var i = 0; i < list.length; i++) if (list[i].id === key) return list[i];
    return list[fallback];
  }
  function emit(run, ev) { if (run.events.length < MAX_EVENTS) run.events.push(ev); }
  function pushArc(run, arc) { if (run.arcs.length >= MAX_ARCS) run.arcs.shift(); run.arcs.push(arc); }

  function createMech(idx, players, diff, skinIdx) {
    return {
      id: idx, x: players === 2 ? (idx === 0 ? D.W * 0.5 - 56 : D.W * 0.5 + 56) : D.W * 0.5, y: D.H * 0.5,
      vx: 0, vy: 0, r: 24, hp: diff.hearts, maxHp: diff.hearts, alive: true, down: false, revive: 0,
      aim: idx === 1 ? Math.PI : 0, recoil: 0, muzzleT: 0, dashT: 0, dashCd: 0, dashMaxCd: diff.dashCd,
      dashDx: idx === 1 ? -1 : 1, dashDy: 0, knockVx: 0, knockVy: 0, invuln: 0, hurtFlash: 0, warpCd: 0,
      lv: [1, 0, 0, 0, 0], fireCd: 0.04, missileCd: 0.45, zapCd: 0.55, sawAng: idx * 1.57,
      skin: clamp(skinIdx | 0, 0, D.skins.length - 1)
    };
  }

  function createRun(opts) {
    opts = opts || {};
    var arena = findByKey(D.arenas, opts.arena, 0);
    var diff = findByKey(D.difficulties, opts.difficulty, 1);
    var players = opts.players === 2 ? 2 : 1;
    var skins = Array.isArray(opts.skins) ? opts.skins : [0, 1];
    var ddaMul = typeof opts.ddaMul === 'number' && isFinite(opts.ddaMul) ? clamp(opts.ddaMul, 0.75, 1.3) : 1.0;
    var mechs = [];
    for (var i = 0; i < players; i++) mechs.push(createMech(i, players, diff, skins[i] != null ? skins[i] : i));

    var run = {
      uid: 1, seed: (opts.seed == null ? 2026 : opts.seed) >>> 0, rng: makeRng(opts.seed == null ? 2026 : opts.seed),
      arena: arena, diff: diff, players: players, ddaMul: ddaMul, state: 'play', t: 0, wave: 1, spawnT: 0.25,
      score: 0, kills: 0, bolts: 0, combo: 0, comboT: 0, revives: 0, heartsLost: 0,
      xp: 0, level: 1, xpNext: 12, stars: 0, mechs: mechs, cam: { x: D.W * 0.5, y: D.H * 0.5 },
      enemies: [], shots: [], boltDrops: [], pods: [], arcs: [], events: [],
      coilCycle: [-1, -1, -1, -1], bossSpawned: false, bossDefeated: false, bossId: 0
    };
    if (opts.opening !== false) {
      var openBots = [
        [0, 320, -170], [1, 390, 60], [0, 300, 210], [1, -330, 185],
        [0, -370, -70], [1, 130, -255], [0, -180, 250], [0, 480, -90]
      ];
      for (var k = 0; k < openBots.length; k++) {
        spawnEnemy(run, openBots[k][0], D.W * 0.5 + openBots[k][1], D.H * 0.5 + openBots[k][2]);
      }
      spawnPod(run, 1, D.W * 0.5 - 185, D.H * 0.5 - 115);
      run.events.length = 0;
    }
    return run;
  }

  function nearestMech(run, x, y) {
    var best = null, bestD2 = Infinity;
    for (var i = 0; i < run.mechs.length; i++) {
      var m = run.mechs[i];
      if (!m.alive) continue;
      var d2 = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
      if (d2 < bestD2) { bestD2 = d2; best = m; }
    }
    return best;
  }

  function spawnEnemy(run, kind, x, y) {
    var spec = D.enemies[clamp(kind | 0, 0, D.enemies.length - 1)];
    if (kind !== 5 && run.enemies.length >= MAX_ENEMIES) return null;
    var hpScale = (kind === 5 ? run.diff.bossHpMul : run.diff.botHpMul) * run.ddaMul * (run.players === 2 ? 1.28 : 1.0);
    var hp = Math.max(4, Math.round(spec.hp * hpScale));
    var sh = spec.shield ? Math.round(spec.shield * hpScale) : 0;
    var e = {
      id: run.uid++, kind: spec.kind,
      x: clamp(x, D.PAD + spec.r, D.W - D.PAD - spec.r), y: clamp(y, D.PAD + spec.r, D.H - D.PAD - spec.r),
      vx: 0, vy: 0, r: spec.r, hp: hp, maxHp: hp, shield: sh, maxShield: sh,
      speed: spec.speed * (kind === 5 ? 1 : run.diff.botSpeedMul), flash: 0, sawCd: 0, bonkCd: 0, bumperCd: 0,
      aiState: 0, aiT: kind === 5 ? 1.5 : 0.7 + run.rng() * 0.8, aim: Math.atan2(D.H * 0.5 - y, D.W * 0.5 - x),
      weakOpen: false, phase2: false, nextAttack: 0, beamLen: 740
    };
    run.enemies.push(e);
    if (kind === 5) { run.bossSpawned = true; run.bossId = e.id; emit(run, { type: 'bossSpawn', x: e.x, y: e.y }); }
    return e;
  }

  function spawnWaveBot(run, kind) {
    var ang = run.rng() * Math.PI * 2;
    var dx = D.VIEW_W * 0.52 + 30 + run.rng() * 70, dy = D.VIEW_H * 0.52 + 30 + run.rng() * 55;
    var sx = run.cam.x + Math.cos(ang) * dx, sy = run.cam.y + Math.sin(ang) * dy;
    if (sx < D.PAD + 30 || sx > D.W - D.PAD - 30) sx = run.cam.x - Math.cos(ang) * 410;
    if (sy < D.PAD + 30 || sy > D.H - D.PAD - 30) sy = run.cam.y - Math.sin(ang) * 290;
    return spawnEnemy(run, kind, sx, sy);
  }

  function choosePodKind(run, mech) {
    var onFloor = [0, 0, 0, 0, 0];
    for (var i = 0; i < run.pods.length; i++) onFloor[run.pods[i].kind] = 1;
    var pool = [], weights = [], total = 0;
    for (var k = 0; k < D.pods.length; k++) {
      var lv = mech ? mech.lv[k] : 0;
      if (lv >= 5) continue;
      var w = (lv === 0 ? 5 : 6 - lv) * (onFloor[k] ? 0.25 : 1);
      pool.push(k); weights.push(w); total += w;
    }
    if (!pool.length) return (run.rng() * D.pods.length) | 0;
    var roll = run.rng() * total;
    for (var j = 0; j < pool.length; j++) { roll -= weights[j]; if (roll <= 0) return pool[j]; }
    return pool[pool.length - 1];
  }

  function safePodSpot(run, ox, oy) {
    for (var a = 0; a < 8; a++) {
      var ang = run.rng() * Math.PI * 2, d = 135 + run.rng() * 65;
      var tx = clamp(clamp(ox + Math.cos(ang) * d, D.PAD + 80, D.W - D.PAD - 80), run.cam.x - 480, run.cam.x + 480);
      var ty = clamp(clamp(oy + Math.sin(ang) * d, D.PAD + 80, D.H - D.PAD - 80), run.cam.y - 250, run.cam.y + 250);
      var ok = true, c;
      for (c = 0; c < run.arena.coils.length; c++) if (Math.hypot(tx - run.arena.coils[c].x, ty - run.arena.coils[c].y) < 85) ok = false;
      for (c = 0; c < run.arena.bumpers.length; c++) if (Math.hypot(tx - run.arena.bumpers[c].x, ty - run.arena.bumpers[c].y) < 85) ok = false;
      if (ok) return { x: tx, y: ty };
    }
    return { x: clamp(ox + 120, 140, D.W - 140), y: clamp(oy, 140, D.H - 140) };
  }

  function spawnPod(run, kind, x, y) {
    if (run.pods.length >= MAX_PODS) run.pods.shift();
    var pod = { id: run.uid++, kind: clamp(kind | 0, 0, D.pods.length - 1), x: clamp(x, D.PAD + 48, D.W - D.PAD - 48), y: clamp(y, D.PAD + 48, D.H - D.PAD - 48), r: 28, age: 0 };
    run.pods.push(pod);
    emit(run, { type: 'podSpawn', podKind: pod.kind, x: pod.x, y: pod.y });
    return pod;
  }

  function spawnPodForPlayers(run) {
    for (var i = 0; i < run.mechs.length; i++) {
      var m = run.mechs[i];
      if (!m.alive && run.players === 2) continue;
      var pos = safePodSpot(run, m.x, m.y);
      spawnPod(run, choosePodKind(run, m), pos.x, pos.y);
    }
  }

  function dropBolts(run, x, y, count, xpVal) {
    run.xp += xpVal;
    while (run.xp >= run.xpNext) {
      run.xp -= run.xpNext; run.level++; run.xpNext = Math.round(12 + run.level * 8);
      spawnPodForPlayers(run);
    }
    for (var i = 0; i < count && run.boltDrops.length < MAX_BOLTS; i++) {
      var ang = run.rng() * Math.PI * 2, sp = 8 + run.rng() * 24;
      run.boltDrops.push({ x: clamp(x + Math.cos(ang) * sp, D.PAD + 16, D.W - D.PAD - 16), y: clamp(y + Math.sin(ang) * sp, D.PAD + 16, D.H - D.PAD - 16), val: 1 });
    }
  }

  function computeStars(run) {
    var hp = 0, mx = 0;
    for (var i = 0; i < run.mechs.length; i++) { hp += Math.max(0, run.mechs[i].hp); mx += run.mechs[i].maxHp; }
    var r = mx > 0 ? hp / mx : 0;
    return (r >= 0.5 && run.t <= 98) ? 3 : (r >= 0.34 || run.t <= 95) ? 2 : 1;
  }

  function spawnPlayerShot(run, mech, kind, ang, speed, dmg, pierce, r) {
    if (run.shots.length >= MAX_SHOTS) return;
    run.shots.push({ team: 0, owner: mech.id, kind: kind, x: mech.x + Math.cos(ang) * 26, y: mech.y + Math.sin(ang) * 26, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, ang: ang, speed: speed, dmg: dmg, pierce: pierce, r: r, life: kind === 1 ? 2.2 : 1.05, hitIds: [] });
  }
  function spawnEnemyShot(run, x, y, ang, speed, r) {
    if (run.shots.length >= MAX_SHOTS) return;
    run.shots.push({ team: 1, owner: -1, kind: 2, x: x + Math.cos(ang) * 20, y: y + Math.sin(ang) * 20, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, ang: ang, speed: speed, dmg: 1, pierce: 1, r: r || 10, life: 3.2, hitIds: null });
  }

  function damageEnemy(run, e, dmg, kx, ky) {
    if (e.hp <= 0) return false;
    var crit = e.kind === 5 && e.weakOpen;
    var actual = crit ? Math.round(dmg * 2.0) : dmg;
    if (e.shield > 0) {
      var ab = Math.min(e.shield, actual);
      e.shield -= ab; actual -= ab; e.flash = 0.1;
      if (actual <= 0) { emit(run, { type: 'hit', x: e.x, y: e.y, shield: true, crit: false }); return false; }
    }
    e.hp -= actual; e.flash = 0.12;
    if (kx || ky) {
      var ks = e.kind === 5 ? 0.08 : (e.kind === 4 ? 0.35 : 1.0);
      e.x = clamp(e.x + kx * ks, D.PAD + e.r, D.W - D.PAD - e.r);
      e.y = clamp(e.y + ky * ks, D.PAD + e.r, D.H - D.PAD - e.r);
    }
    emit(run, { type: 'hit', x: e.x, y: e.y, shield: false, crit: crit, dmg: actual });
    if (e.hp <= 0) {
      var spec = D.enemies[e.kind];
      run.kills++; run.combo++; run.comboT = 2.6;
      run.score += spec.score + Math.min(25, run.combo * 2);
      dropBolts(run, e.x, e.y, spec.bolts, spec.xp);
      emit(run, { type: 'kill', x: e.x, y: e.y, enemyKind: e.kind, isBoss: e.kind === 5 });
      pushArc(run, { kind: 'ring', x: e.x, y: e.y, r: e.kind === 5 ? 160 : e.r * 1.9, color: e.kind === 5 ? '#ffe14a' : '#ff7b3a', t: 0.22 });
      if (e.kind === 5) {
        run.bossDefeated = true; run.bolts += 20; run.score += 400; run.stars = computeStars(run);
        run.enemies.length = 0; run.shots.length = 0; run.state = 'win';
        emit(run, { type: 'win', x: e.x, y: e.y });
      }
      return true;
    }
    if (e.kind === 5 && run.diff.bossPhases >= 2 && !e.phase2 && e.hp <= e.maxHp * 0.5) {
      e.phase2 = true; e.aiState = 0; e.aiT = 0.6;
      pushArc(run, { kind: 'ring', x: e.x, y: e.y, r: 190, color: '#ff3ea5', t: 0.32 });
      for (var k = 0; k < 8; k++) spawnEnemyShot(run, e.x, e.y, (Math.PI * 2 * k) / 8, 250, 12);
      emit(run, { type: 'bossPhase2', x: e.x, y: e.y });
    }
    return false;
  }

  function shockwave(run, x, y, radius, dmg, pushDist, color) {
    pushArc(run, { kind: 'ring', x: x, y: y, r: radius, color: color || '#28e7ff', t: 0.22 });
    for (var s = run.shots.length - 1; s >= 0; s--) {
      if (run.shots[s].team === 1 && Math.hypot(run.shots[s].x - x, run.shots[s].y - y) <= radius) run.shots.splice(s, 1);
    }
    for (var i = run.enemies.length - 1; i >= 0; i--) {
      var e = run.enemies[i], dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      if (d <= radius + e.r) {
        var nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0;
        var dead = damageEnemy(run, e, dmg, nx * pushDist, ny * pushDist);
        if (run.state === 'win') return;
        if (dead) run.enemies.splice(i, 1);
      }
    }
  }

  function hurtMech(run, mech) {
    if (!mech.alive || mech.invuln > 0 || mech.dashT > 0) return false;
    mech.hp = Math.max(0, mech.hp - 1); mech.invuln = 1.25; mech.hurtFlash = 0.3;
    run.heartsLost++; run.combo = 0;
    emit(run, { type: 'hurt', player: mech.id, x: mech.x, y: mech.y });
    shockwave(run, mech.x, mech.y, 105, 16, 42, '#ff5a7a');
    if (run.state === 'win') return true;
    if (mech.hp <= 0) {
      mech.alive = false; mech.down = true; mech.revive = 0;
      var any = false;
      for (var i = 0; i < run.mechs.length; i++) if (run.mechs[i].alive) any = true;
      if (!any) { run.state = 'over'; emit(run, { type: 'over' }); }
    }
    return true;
  }

  function applyPod(run, mech, pod) {
    var k = pod.kind, spec = D.pods[k];
    if (mech.lv[k] < 5) mech.lv[k]++;
    else { mech.hp = Math.min(mech.maxHp, mech.hp + 1); run.score += 50; }
    if (k === 4) { if (mech.hp < mech.maxHp) mech.hp++; else mech.invuln = Math.max(mech.invuln, 1.5); }
    run.score += 35;
    emit(run, { type: 'pod', player: mech.id, podKind: k, x: pod.x, y: pod.y, text: mech.lv[k] >= 3 ? spec.evoPopup : spec.popup });
    shockwave(run, mech.x, mech.y, 130, 26, 48, spec.color);
  }

  function updateWeapons(run, mech, dt) {
    var best = null, bestScore = Infinity;
    for (var i = 0; i < run.enemies.length; i++) {
      var e = run.enemies[i], d = Math.hypot(e.x - mech.x, e.y - mech.y);
      if (d > 680) continue;
      var w = e.kind === 5 && e.weakOpen ? d * 0.6 : d;
      if (w < bestScore) { bestScore = w; best = e; }
    }
    if (best) mech.aim = Math.atan2(best.y - mech.y, best.x - mech.x);
    else if (Math.hypot(mech.vx, mech.vy) > 25) mech.aim = Math.atan2(mech.vy, mech.vx);

    mech.fireCd -= dt;
    if (best && mech.fireCd <= 0) {
      var plLv = clamp(mech.lv[0] - 1, 0, 4), pl = D.pods[0], n = pl.shots[plLv];
      mech.fireCd = pl.cd[plLv]; mech.recoil = 6; mech.muzzleT = 0.065;
      for (var s = 0; s < n; s++) {
        spawnPlayerShot(run, mech, 0, mech.aim + (s - (n - 1) * 0.5) * 0.12, 830, pl.dmg[plLv], pl.pierce[plLv], plLv >= 2 ? 10 : 8);
      }
    }

    if (mech.lv[1] > 0) {
      var sawLv = clamp(mech.lv[1] - 1, 0, 4), sawSpec = D.pods[1], sawN = sawSpec.count[sawLv];
      mech.sawAng += dt * 4.8;
      for (var j = 0; j < sawN; j++) {
        var sa = mech.sawAng + (Math.PI * 2 * j) / sawN;
        var sx = mech.x + Math.cos(sa) * sawSpec.orbit, sy = mech.y + Math.sin(sa) * sawSpec.orbit;
        for (var q = run.shots.length - 1; q >= 0; q--) {
          if (run.shots[q].team === 1 && Math.hypot(run.shots[q].x - sx, run.shots[q].y - sy) < 28) run.shots.splice(q, 1);
        }
        for (var ei = run.enemies.length - 1; ei >= 0; ei--) {
          var en = run.enemies[ei];
          if (en.sawCd <= 0 && Math.hypot(en.x - sx, en.y - sy) <= en.r + 18) {
            en.sawCd = 0.25;
            var dead = damageEnemy(run, en, sawSpec.dmg[sawLv], Math.cos(sa) * 18, Math.sin(sa) * 18);
            if (run.state === 'win') return;
            if (dead) run.enemies.splice(ei, 1);
          }
        }
      }
    }

    if (mech.lv[2] > 0) {
      mech.missileCd -= dt;
      if (run.enemies.length > 0 && mech.missileCd <= 0) {
        var mLv = clamp(mech.lv[2] - 1, 0, 4), mSpec = D.pods[2], mc = mSpec.count[mLv];
        mech.missileCd = mSpec.cd[mLv];
        for (var mi = 0; mi < mc; mi++) spawnPlayerShot(run, mech, 1, mech.aim + (mi - (mc - 1) * 0.5) * 0.38, 490, mSpec.dmg[mLv], 1, 11);
      }
    }

    if (mech.lv[3] > 0) {
      mech.zapCd -= dt;
      if (mech.zapCd <= 0 && run.enemies.length > 0) {
        var zLv = clamp(mech.lv[3] - 1, 0, 4), zSpec = D.pods[3], curX = mech.x, curY = mech.y, hitSet = {}, zapped = 0;
        for (var c = 0; c < zSpec.chains[zLv]; c++) {
          var pickIdx = -1, pickD = c === 0 ? zSpec.range : 230;
          for (var zi = 0; zi < run.enemies.length; zi++) {
            var cand = run.enemies[zi];
            if (!hitSet[cand.id]) {
              var zd = Math.hypot(cand.x - curX, cand.y - curY);
              if (zd < pickD) { pickD = zd; pickIdx = zi; }
            }
          }
          if (pickIdx < 0) break;
          var target = run.enemies[pickIdx];
          hitSet[target.id] = 1;
          pushArc(run, { kind: 'zap', x1: curX, y1: curY, x2: target.x, y2: target.y, color: '#d580ff', t: 0.16 });
          curX = target.x; curY = target.y; zapped++;
          var killed = damageEnemy(run, target, zSpec.dmg[zLv], 0, 0);
          if (run.state === 'win') return;
          if (killed) run.enemies.splice(pickIdx, 1);
        }
        mech.zapCd = zapped > 0 ? zSpec.cd[zLv] : 0.25;
      }
    }
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    if (len2 <= 1) return Math.hypot(px - x1, py - y1);
    var u = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
  }

  function updateBoss(run, e, dt, target) {
    var sm = e.phase2 ? 1.25 : 1.0, dx = target.x - e.x, dy = target.y - e.y, dist = Math.hypot(dx, dy) || 1;
    e.aiT -= dt * sm;
    if (e.aiState === 0) {
      e.weakOpen = false;
      e.x += (dx / dist) * e.speed * sm * dt; e.y += (dy / dist) * e.speed * sm * dt; e.aim = Math.atan2(dy, dx);
      if (e.aiT <= 0) {
        e.aiState = e.nextAttack === 0 ? 1 : 4; e.aiT = 0.92; e.aim = Math.atan2(dy, dx); e.nextAttack = 1 - e.nextAttack;
      }
    } else if (e.aiState === 1) {
      e.weakOpen = false; if (e.aiT <= 0) { e.aiState = 2; e.aiT = 0.62; }
    } else if (e.aiState === 2) {
      e.weakOpen = false;
      e.x += Math.cos(e.aim) * 660 * sm * dt; e.y += Math.sin(e.aim) * 660 * sm * dt;
      if (e.aiT <= 0) { e.aiState = 3; e.aiT = 2.2; e.weakOpen = true; }
    } else if (e.aiState === 3) {
      e.weakOpen = true;
      if (e.aiT <= 0) {
        e.weakOpen = false; e.aiState = 0; e.aiT = 1.65;
        for (var k = -1; k <= 1; k++) spawnEnemyShot(run, e.x, e.y, Math.atan2(dy, dx) + k * 0.28, 285, 11);
      }
    } else if (e.aiState === 4) {
      e.weakOpen = false; if (e.aiT <= 0) { e.aiState = 5; e.aiT = 1.1; }
    } else if (e.aiState === 5) {
      e.weakOpen = false; e.aim += 0.55 * dt * sm;
      var beams = e.phase2 ? [-0.26, 0.26] : [0];
      for (var b = 0; b < beams.length; b++) {
        var ba = e.aim + beams[b], bx = e.x + Math.cos(ba) * e.beamLen, by = e.y + Math.sin(ba) * e.beamLen;
        for (var m = 0; m < run.mechs.length; m++) {
          var mech = run.mechs[m];
          if (mech.alive && distToSegment(mech.x, mech.y, e.x, e.y, bx, by) < mech.r + 14) {
            hurtMech(run, mech); if (run.state === 'over') return;
          }
        }
      }
      if (e.aiT <= 0) { e.aiState = 3; e.aiT = 1.6; e.weakOpen = true; }
    }
  }

  function updateArenas(run, dt) {
    var arena = run.arena, i, j, m, e;
    for (i = 0; i < arena.boosts.length; i++) {
      var st = arena.boosts[i];
      for (j = 0; j < run.mechs.length; j++) {
        m = run.mechs[j];
        if (m.alive && m.x >= st.x && m.x <= st.x + st.w && m.y >= st.y && m.y <= st.y + st.h) { m.x += st.vx * dt; m.y += st.vy * dt; }
      }
      for (j = 0; j < run.enemies.length; j++) {
        e = run.enemies[j];
        if (e.kind !== 5 && e.x >= st.x && e.x <= st.x + st.w && e.y >= st.y && e.y <= st.y + st.h) { e.x += st.vx * 0.75 * dt; e.y += st.vy * 0.75 * dt; }
      }
    }
    for (i = 0; i < arena.coils.length; i++) {
      var coil = arena.coils[i], cyc = Math.floor((run.t + i * 0.9) / 3.6), ph = (run.t + i * 0.9) % 3.6;
      for (j = 0; j < run.mechs.length; j++) {
        m = run.mechs[j];
        var cdx = m.x - coil.x, cdy = m.y - coil.y, cd = Math.hypot(cdx, cdy);
        if (cd < m.r + coil.r && cd > 0.01) { m.x = coil.x + (cdx / cd) * (m.r + coil.r); m.y = coil.y + (cdy / cd) * (m.r + coil.r); }
      }
      if (ph >= 3.35 && run.coilCycle[i] !== cyc) {
        run.coilCycle[i] = cyc; shockwave(run, coil.x, coil.y, 146, 46, 36, '#28e7ff');
        if (run.state === 'win') return;
      }
    }
    for (i = 0; i < arena.vents.length; i++) {
      var v = arena.vents[i];
      if (((run.t + i * 0.7) % 4.2) >= 3.25) {
        for (j = run.enemies.length - 1; j >= 0; j--) {
          e = run.enemies[j];
          if (Math.hypot(e.x - v.x, e.y - v.y) <= v.r + e.r * 0.6) {
            var killed = damageEnemy(run, e, 85 * dt, 0, 0);
            if (run.state === 'win') return;
            if (killed) run.enemies.splice(j, 1);
          }
        }
        for (j = 0; j < run.mechs.length; j++) {
          m = run.mechs[j];
          if (m.alive && Math.hypot(m.x - v.x, m.y - v.y) <= v.r - 10) { hurtMech(run, m); if (run.state === 'over') return; }
        }
      }
    }
    for (i = 0; i < arena.warps.length; i++) {
      var wp = arena.warps[i];
      for (j = 0; j < run.mechs.length; j++) {
        m = run.mechs[j];
        if (m.alive && m.warpCd <= 0 && Math.hypot(m.x - wp.x, m.y - wp.y) <= wp.r) {
          var dest = arena.warps[wp.to];
          m.x = dest.x; m.y = dest.y; m.warpCd = 2.4; m.invuln = Math.max(m.invuln, 0.55);
          shockwave(run, dest.x, dest.y, 138, 48, 46, '#3df5ff');
          if (run.state === 'win') return;
        }
      }
    }
    for (i = 0; i < arena.bumpers.length; i++) {
      var bp = arena.bumpers[i];
      for (j = 0; j < run.mechs.length; j++) {
        m = run.mechs[j];
        var bdx = m.x - bp.x, bdy = m.y - bp.y, bd = Math.hypot(bdx, bdy);
        if (bd < m.r + bp.r && bd > 0.01) {
          var bnx = bdx / bd, bny = bdy / bd;
          m.x = bp.x + bnx * (m.r + bp.r + 2); m.y = bp.y + bny * (m.r + bp.r + 2);
          m.knockVx = bnx * 360; m.knockVy = bny * 360;
        }
      }
      for (j = run.enemies.length - 1; j >= 0; j--) {
        e = run.enemies[j];
        var edx = e.x - bp.x, edy = e.y - bp.y, ed = Math.hypot(edx, edy);
        if (ed < e.r + bp.r && ed > 0.01) {
          var enx = edx / ed, eny = edy / ed;
          e.x = bp.x + enx * (e.r + bp.r + 2); e.y = bp.y + eny * (e.r + bp.r + 2);
          if (e.bumperCd <= 0) {
            e.bumperCd = 0.35;
            var bDead = damageEnemy(run, e, 24, enx * 24, eny * 24);
            if (run.state === 'win') return;
            if (bDead) run.enemies.splice(j, 1);
          }
        }
      }
    }
  }

  function coilState(run, index) { var ph = (run.t + index * 0.9) % 3.6; return ph >= 2.45 ? (ph >= 3.32 ? 2 : 1) : 0; }
  function ventState(run, index) { var ph = (run.t + index * 0.7) % 4.2; return ph >= 2.2 ? (ph >= 3.25 ? 2 : 1) : 0; }

  function step(run, dt, inputs) {
    if (!run || run.state !== 'play') return;
    dt = clamp(dt || 0, 0, 0.05);
    if (dt <= 0) return;
    run.t += dt;
    if (run.comboT > 0 && (run.comboT -= dt) <= 0) run.combo = 0;
    for (var a = run.arcs.length - 1; a >= 0; a--) if ((run.arcs[a].t -= dt) <= 0) run.arcs.splice(a, 1);

    var prevWave = run.wave;
    run.wave = run.t < 24 ? 1 : run.t < 48 ? 2 : run.t < D.BOSS_AT ? 3 : 4;
    if (run.wave !== prevWave && (run.wave === 2 || run.wave === 3)) {
      emit(run, { type: 'wave', waveId: run.wave, title: D.waves[run.wave - 1].title });
      spawnPodForPlayers(run);
    }
    if (run.t >= D.BOSS_AT && !run.bossSpawned) {
      var bAng = run.rng() * Math.PI * 2;
      spawnEnemy(run, 5, run.cam.x + Math.cos(bAng) * 340, run.cam.y + Math.sin(bAng) * 220);
    }
    if ((run.spawnT -= dt) <= 0) {
      if (!run.bossSpawned) {
        var wSpec = D.waves[clamp(run.wave - 1, 0, 2)];
        run.spawnT = Math.max(0.2, wSpec.interval / (run.diff.spawnMul * run.ddaMul * (run.players === 2 ? 1.2 : 1.0)));
        var wSum = 0, wi, chosen = 0;
        for (wi = 0; wi < wSpec.weights.length; wi++) wSum += wSpec.weights[wi];
        var wr = run.rng() * wSum;
        for (wi = 0; wi < wSpec.weights.length; wi++) { wr -= wSpec.weights[wi]; if (wr <= 0) { chosen = wi; break; } }
        spawnWaveBot(run, chosen);
      } else {
        run.spawnT = 2.1;
        if (run.enemies.length < 12) spawnWaveBot(run, run.rng() < 0.65 ? 0 : 1);
      }
    }

    inputs = inputs || [];
    for (var p = 0; p < run.mechs.length; p++) {
      var m = run.mechs[p], inp = inputs[p] || {};
      if (m.invuln > 0) m.invuln = Math.max(0, m.invuln - dt);
      if (m.hurtFlash > 0) m.hurtFlash = Math.max(0, m.hurtFlash - dt);
      if (m.dashCd > 0) m.dashCd = Math.max(0, m.dashCd - dt);
      if (m.warpCd > 0) m.warpCd = Math.max(0, m.warpCd - dt);
      if (m.recoil > 0) m.recoil = Math.max(0, m.recoil - dt * 36);
      if (m.muzzleT > 0) m.muzzleT = Math.max(0, m.muzzleT - dt);

      if (!m.alive) {
        if (run.players === 2) {
          var partner = run.mechs[1 - p];
          if (partner && partner.alive && Math.hypot(partner.x - m.x, partner.y - m.y) <= 74) {
            m.revive += dt;
            if (m.revive >= 1.5) {
              m.alive = true; m.down = false; m.revive = 0;
              m.hp = Math.max(2, Math.ceil(m.maxHp * 0.5)); m.invuln = 2.2; run.revives++;
              emit(run, { type: 'revive', player: m.id, x: m.x, y: m.y });
              shockwave(run, m.x, m.y, 155, 36, 55, '#3ddc84');
              if (run.state === 'win') return;
            }
          } else m.revive = Math.max(0, m.revive - dt * 0.35);
        }
        continue;
      }

      var ix = inp.x || 0, iy = inp.y || 0, mag = Math.hypot(ix, iy), steerScale = 1;
      if (mag > 0.01) { ix /= mag; iy /= mag; }
      else if (inp.mouse && typeof inp.tx === 'number' && typeof inp.ty === 'number') {
        var mdx = inp.tx - m.x, mdy = inp.ty - m.y, md = Math.hypot(mdx, mdy);
        if (md > 16) { ix = mdx / md; iy = mdy / md; steerScale = clamp((md - 14) / 38, 0.2, 1); }
        else { ix = 0; iy = 0; }
      }

      if (inp.dash && m.dashCd <= 0 && m.dashT <= 0) {
        if (Math.hypot(ix, iy) > 0.05) { m.dashDx = ix; m.dashDy = iy; }
        else { m.dashDx = Math.cos(m.aim); m.dashDy = Math.sin(m.aim); }
        m.dashT = 0.22; m.dashCd = m.dashMaxCd; m.invuln = Math.max(m.invuln, 0.32);
        emit(run, { type: 'dash', player: m.id, x: m.x, y: m.y });
        shockwave(run, m.x, m.y, 126, 34, 48, '#28e7ff');
        if (run.state === 'win') return;
      }

      var baseSpeed = 338 * (1 + (m.lv[4] > 0 ? D.pods[4].speedBonus[m.lv[4] - 1] : 0));
      if (m.dashT > 0) {
        m.dashT = Math.max(0, m.dashT - dt);
        m.vx = m.dashDx * 880; m.vy = m.dashDy * 880;
        for (var di = run.enemies.length - 1; di >= 0; di--) {
          var de = run.enemies[di];
          if (de.bonkCd <= 0 && Math.hypot(de.x - m.x, de.y - m.y) <= de.r + m.r + 12) {
            de.bonkCd = 0.28;
            var dDead = damageEnemy(run, de, 30, m.dashDx * 44, m.dashDy * 44);
            if (run.state === 'win') return;
            if (dDead) run.enemies.splice(di, 1);
          }
        }
      } else {
        m.vx = ix * baseSpeed * steerScale + m.knockVx;
        m.vy = iy * baseSpeed * steerScale + m.knockVy;
      }
      m.knockVx *= Math.pow(0.02, dt); m.knockVy *= Math.pow(0.02, dt);
      m.x = clamp(m.x + m.vx * dt, D.PAD + m.r, D.W - D.PAD - m.r);
      m.y = clamp(m.y + m.vy * dt, D.PAD + m.r, D.H - D.PAD - m.r);
      updateWeapons(run, m, dt);
      if (run.state !== 'play') return;
    }

    var sumX = 0, sumY = 0, liveN = 0;
    for (p = 0; p < run.mechs.length; p++) if (run.mechs[p].alive) { sumX += run.mechs[p].x; sumY += run.mechs[p].y; liveN++; }
    if (liveN > 0) {
      run.cam.x += (clamp(sumX / liveN, D.VIEW_W * 0.5, D.W - D.VIEW_W * 0.5) - run.cam.x) * Math.min(1, dt * 10);
      run.cam.y += (clamp(sumY / liveN, D.VIEW_H * 0.5, D.H - D.VIEW_H * 0.5) - run.cam.y) * Math.min(1, dt * 10);
    }
    if (run.players === 2) {
      for (p = 0; p < run.mechs.length; p++) {
        run.mechs[p].x = clamp(run.mechs[p].x, run.cam.x - 560, run.cam.x + 560);
        run.mechs[p].y = clamp(run.mechs[p].y, run.cam.y - 300, run.cam.y + 300);
      }
    }

    updateArenas(run, dt);
    if (run.state !== 'play') return;

    for (var s = run.shots.length - 1; s >= 0; s--) {
      var sh = run.shots[s];
      if ((sh.life -= dt) <= 0) { run.shots.splice(s, 1); continue; }
      if (sh.kind === 1 && run.enemies.length > 0) {
        var nearE = null, nearD = 520;
        for (var hi = 0; hi < run.enemies.length; hi++) {
          var hd = Math.hypot(run.enemies[hi].x - sh.x, run.enemies[hi].y - sh.y);
          if (hd < nearD) { nearD = hd; nearE = run.enemies[hi]; }
        }
        if (nearE) {
          var da = Math.atan2(Math.sin(Math.atan2(nearE.y - sh.y, nearE.x - sh.x) - sh.ang), Math.cos(Math.atan2(nearE.y - sh.y, nearE.x - sh.x) - sh.ang));
          sh.ang += clamp(da, -6.2 * dt, 6.2 * dt); sh.vx = Math.cos(sh.ang) * sh.speed; sh.vy = Math.sin(sh.ang) * sh.speed;
        }
      }
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (sh.x < D.PAD || sh.x > D.W - D.PAD || sh.y < D.PAD || sh.y > D.H - D.PAD) { run.shots.splice(s, 1); continue; }
      if (sh.team === 0) {
        var consumed = false;
        for (var ei = run.enemies.length - 1; ei >= 0; ei--) {
          var e = run.enemies[ei];
          if (sh.hitIds.indexOf(e.id) >= 0) continue;
          if (Math.hypot(e.x - sh.x, e.y - sh.y) <= e.r + sh.r) {
            sh.hitIds.push(e.id);
            if (sh.kind === 1) { shockwave(run, sh.x, sh.y, 94, sh.dmg, 26, '#ff6b35'); if (run.state === 'win') return; consumed = true; break; }
            var killed = damageEnemy(run, e, sh.dmg, Math.cos(sh.ang) * 8, Math.sin(sh.ang) * 8);
            if (run.state === 'win') return;
            if (killed) run.enemies.splice(ei, 1);
            if (--sh.pierce <= 0) { consumed = true; break; }
          }
        }
        if (consumed) run.shots.splice(s, 1);
      } else {
        for (p = 0; p < run.mechs.length; p++) {
          var pm = run.mechs[p];
          if (pm.alive && Math.hypot(pm.x - sh.x, pm.y - sh.y) <= pm.r + sh.r - 4) {
            run.shots.splice(s, 1); hurtMech(run, pm); if (run.state === 'over') return; break;
          }
        }
      }
    }

    for (var k = run.enemies.length - 1; k >= 0; k--) {
      var en = run.enemies[k];
      if (en.flash > 0) en.flash = Math.max(0, en.flash - dt);
      if (en.sawCd > 0) en.sawCd = Math.max(0, en.sawCd - dt);
      if (en.bonkCd > 0) en.bonkCd = Math.max(0, en.bonkCd - dt);
      if (en.bumperCd > 0) en.bumperCd = Math.max(0, en.bumperCd - dt);
      var tgt = nearestMech(run, en.x, en.y);
      if (!tgt) continue;
      var tdx = tgt.x - en.x, tdy = tgt.y - en.y, td = Math.hypot(tdx, tdy) || 1;
      if (en.kind === 5) {
        updateBoss(run, en, dt, tgt); if (run.state !== 'play') return;
      } else if (en.kind === 2) {
        en.aiT -= dt;
        if (en.aiState === 0) {
          en.x += (tdx / td) * en.speed * dt; en.y += (tdy / td) * en.speed * dt; en.aim = Math.atan2(tdy, tdx);
          if (td < 380 && en.aiT <= 0) { en.aiState = 1; en.aiT = 0.52; en.aim = Math.atan2(tdy, tdx); }
        } else if (en.aiState === 1) { if (en.aiT <= 0) { en.aiState = 2; en.aiT = 0.62; } }
        else {
          var rs = D.enemies[2].chargeSpeed * run.diff.botSpeedMul;
          en.x += Math.cos(en.aim) * rs * dt; en.y += Math.sin(en.aim) * rs * dt;
          if (en.aiT <= 0) { en.aiState = 0; en.aiT = 1.4; }
        }
      } else if (en.kind === 3) {
        en.aiT -= dt;
        var push = clamp((td - 290) / 90, -0.7, 1), nx = tdx / td, ny = tdy / td;
        en.x += (nx * push - ny * 0.65) * en.speed * dt; en.y += (ny * push + nx * 0.65) * en.speed * dt;
        en.aim = Math.atan2(tdy, tdx);
        if (en.aiT <= 0 && td < 560) { en.aiT = 2.15; spawnEnemyShot(run, en.x, en.y, en.aim, 290 * run.diff.botSpeedMul, 10); }
      } else {
        var ang = Math.atan2(tdy, tdx) + (en.kind === 1 ? Math.sin(run.t * 9 + en.id) * 0.45 : 0);
        en.aim = ang; en.x += Math.cos(ang) * en.speed * dt; en.y += Math.sin(ang) * en.speed * dt;
      }
      en.x = clamp(en.x, D.PAD + en.r, D.W - D.PAD - en.r);
      en.y = clamp(en.y, D.PAD + en.r, D.H - D.PAD - en.r);
      for (var o = k - 1; o >= Math.max(0, k - 8); o--) {
        var other = run.enemies[o], sdx = en.x - other.x, sdy = en.y - other.y, sd = Math.hypot(sdx, sdy), minD = en.r + other.r;
        if (sd > 0.01 && sd < minD) {
          var ov = (minD - sd) * 0.35, snx = sdx / sd, sny = sdy / sd;
          if (en.kind !== 5) { en.x += snx * ov; en.y += sny * ov; }
          if (other.kind !== 5) { other.x -= snx * ov; other.y -= sny * ov; }
        }
      }
      for (p = 0; p < run.mechs.length; p++) {
        if (run.mechs[p].alive && Math.hypot(run.mechs[p].x - en.x, run.mechs[p].y - en.y) <= run.mechs[p].r + en.r - 4) {
          hurtMech(run, run.mechs[p]); if (run.state !== 'play') return;
        }
      }
    }

    for (var b = run.boltDrops.length - 1; b >= 0; b--) {
      var bolt = run.boltDrops[b], puller = null, pullD = Infinity;
      for (p = 0; p < run.mechs.length; p++) {
        var mp = run.mechs[p];
        if (!mp.alive) continue;
        var magR = run.diff.magnetBase + (mp.lv[4] > 0 ? D.pods[4].pullBonus[mp.lv[4] - 1] : 0);
        var bd2 = Math.hypot(mp.x - bolt.x, mp.y - bolt.y);
        if (bd2 < magR && bd2 < pullD) { pullD = bd2; puller = mp; }
      }
      if (puller) {
        if (pullD <= puller.r + 18) { run.bolts += bolt.val; run.score += 5; emit(run, { type: 'bolt', x: bolt.x, y: bolt.y }); run.boltDrops.splice(b, 1); }
        else { bolt.x += ((puller.x - bolt.x) / pullD) * 580 * dt; bolt.y += ((puller.y - bolt.y) / pullD) * 580 * dt; }
      }
    }

    for (var pd = run.pods.length - 1; pd >= 0; pd--) {
      var pod = run.pods[pd]; pod.age += dt;
      for (p = 0; p < run.mechs.length; p++) {
        var col = run.mechs[p];
        if (col.alive && Math.hypot(col.x - pod.x, col.y - pod.y) <= col.r + pod.r + 14) {
          run.pods.splice(pd, 1); applyPod(run, col, pod); if (run.state !== 'play') return; break;
        }
      }
    }
  }

  var RSEngine = {
    MAX_ENEMIES: MAX_ENEMIES, MAX_SHOTS: MAX_SHOTS, MAX_BOLTS: MAX_BOLTS, MAX_PODS: MAX_PODS,
    createRun: createRun, step: step, spawnEnemy: spawnEnemy, spawnPod: spawnPod,
    spawnPodForPlayers: spawnPodForPlayers, damageEnemy: damageEnemy, hurtMech: hurtMech,
    coilState: coilState, ventState: ventState
  };

  globalThis.RSEngine = RSEngine;
  if (typeof window !== 'undefined') window.RSEngine = RSEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = RSEngine;
})();
