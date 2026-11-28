/* Recess Kitchen — Snack Flip & Bump Party! Pure deterministic simulation engine.
 * Zero DOM, zero Kit, zero Math.random. Runs identically in browser and Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RK = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 1280, H = 720;
  var FLOOR_Y = 594, CEIL_Y = 82;
  var GOAL_W = 110, GOAL_H = 216, GOAL_TOP = FLOOR_Y - GOAL_H;
  var MATCH_TIME = 45, WIN_GOALS = 5;
  var SAVE_VERSION = 4;

  var SNACK_KINDS = ['burger', 'donut', 'pizza'];

  // 8 post-goal Kitchen Chaos Roulette modifiers (+ normal kickoff serve)
  var MODS = [
    { id: 'normal', name: 'وجبة طازجة!', icon: '🍔', color: '#ff9f1c', chaos: false },
    { id: 'giant_donut', name: 'دونات عملاقة 🍩', icon: '🍩', color: '#ff66b2', chaos: true },
    { id: 'butter_floor', name: 'زبدة زلقة 🧈', icon: '🧈', color: '#ffd93b', chaos: true },
    { id: 'double_food', name: 'وجبتين! 🍔🍕', icon: '🍔', color: '#3ddc84', chaos: true },
    { id: 'chili_turbo', name: 'فلفل ناري ⚡', icon: '🌶️', color: '#ff4757', chaos: true },
    { id: 'moon_bounce', name: 'جاذبية القمر 🌙', icon: '🌙', color: '#9c7aff', chaos: true },
    { id: 'tiny_chefs', name: 'شيف صغير 🤏', icon: '🤏', color: '#45d4ff', chaos: true },
    { id: 'trampoline', name: 'صينية نطاطة 🥞', icon: '🥞', color: '#ff8a24', chaos: true },
    { id: 'golden_x2', name: 'نقطة ذهبية ×2 ⭐', icon: '⭐', color: '#ffcb1f', chaos: true }
  ];
  var ROULETTE_MODS = MODS.filter(function (m) { return m.chaos; });

  var HATS = [
    { id: 'toque', name: 'قبعة الشيف', icon: '👨‍🍳', cost: 0 },
    { id: 'burger', name: 'تاج البرغر', icon: '🍔', cost: 25 },
    { id: 'pizza', name: 'بيريه البيتزا', icon: '🍕', cost: 50 },
    { id: 'donut', name: 'هالة الدونات', icon: '🍩', cost: 80 },
    { id: 'pot', name: 'خوذة القِدر', icon: '🍳', cost: 120 },
    { id: 'crown', name: 'التاج الذهبي', icon: '👑', cost: 180 }
  ];

  function modById(id) {
    for (var i = 0; i < MODS.length; i++) if (MODS[i].id === id) return MODS[i];
    return MODS[0];
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Deterministic mulberry32 PRNG
  function nextRng(w) {
    w.rng = (w.rng + 0x6D2B79F5) >>> 0;
    var t = Math.imul(w.rng ^ (w.rng >>> 15), 1 | w.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function modParams(modId) {
    var p = {
      grav: 1460,
      snackGrav: 920,
      jumpVel: 685,
      snackR: 38,
      snackRest: 0.78,
      floorFric: 0.87,
      speedMul: 1,
      chefScale: 1,
      snackCount: 1,
      forceKind: null,
      points: 1,
      golden: false,
      butter: false,
      trampoline: false,
      moon: false,
      chili: false
    };
    if (modId === 'giant_donut') {
      p.snackR = 68;
      p.snackRest = 0.88;
      p.forceKind = 'donut';
    } else if (modId === 'butter_floor') {
      p.floorFric = 0.992;
      p.butter = true;
    } else if (modId === 'double_food') {
      p.snackCount = 2;
    } else if (modId === 'chili_turbo') {
      p.speedMul = 1.35;
      p.jumpVel = 760;
      p.chili = true;
    } else if (modId === 'moon_bounce') {
      p.grav = 690;
      p.snackGrav = 430;
      p.jumpVel = 570;
      p.moon = true;
    } else if (modId === 'tiny_chefs') {
      p.chefScale = 0.68;
      p.jumpVel = 735;
    } else if (modId === 'trampoline') {
      p.snackRest = 1.04;
      p.trampoline = true;
    } else if (modId === 'golden_x2') {
      p.points = 2;
      p.golden = true;
    }
    return p;
  }

  function makeChef(side, hat, scale) {
    var r = 42 * (scale || 1);
    return {
      side: side,
      x: side === 0 ? 330 : W - 330,
      y: FLOOR_Y - r,
      vx: 0,
      vy: 0,
      r: r,
      scale: scale || 1,
      grounded: true,
      coyote: 0,
      lean: 0,
      leanPhase: side === 0 ? 0 : Math.PI,
      spin: 0,
      spinVel: 0,
      spatulaT: 0,
      spatulaDir: side === 0 ? 1 : -1,
      airFlipUsed: false,
      bufT: 0,
      cd: 0,
      squashX: 1,
      squashY: 1,
      hat: hat || 0,
      jumps: 0,
      whacks: 0,
      expr: 'happy',
      exprT: 0
    };
  }

  function makeSnack(w, index, total, params) {
    var kind = params.forceKind || SNACK_KINDS[(w.serveNum + index) % SNACK_KINDS.length];
    var spread = total > 1 ? (index === 0 ? -90 : 90) : 0;
    var r = params.snackR;
    return {
      id: ++w.nextSnackId,
      kind: kind,
      x: W * 0.5 + spread,
      y: 195 - index * 24,
      vx: (nextRng(w) - 0.5) * 140 + (total > 1 ? (index === 0 ? -85 : 85) : 0),
      vy: -90,
      r: r,
      rot: 0,
      vrot: (nextRng(w) - 0.5) * 3,
      hitCd: 0,
      lastHit: -1,
      stallT: 0,
      squashX: 1,
      squashY: 1,
      golden: params.golden || w.suddenDeath,
      trail: []
    };
  }

  function setupServe(w, modId) {
    w.mod = modId;
    w.params = modParams(modId);
    w.serveNum++;
    var sc = w.params.chefScale;
    for (var i = 0; i < 2; i++) {
      var old = w.chefs[i];
      var c = makeChef(i, old ? old.hat : (i === 0 ? w.p1Hat : w.p2Hat), sc);
      if (old) {
        c.jumps = old.jumps;
        c.whacks = old.whacks;
      }
      w.chefs[i] = c;
    }
    w.snacks = [];
    var count = w.suddenDeath ? 1 : w.params.snackCount;
    for (var k = 0; k < count; k++) {
      w.snacks.push(makeSnack(w, k, count, w.params));
    }
    w.botThink = [0.22, 0.32];
  }

  function create(opts) {
    opts = opts || {};
    var seed = (opts.seed != null ? opts.seed : 1337) >>> 0;
    var dda = clamp(opts.dda != null ? opts.dda : 0.28, 0, 1);
    var p1Hat = clamp((opts.hat | 0), 0, HATS.length - 1);
    var p2Hat = opts.p2Hat != null ? clamp(opts.p2Hat | 0, 0, HATS.length - 1) : ((seed % (HATS.length - 1)) + 1);
    var w = {
      seed: seed,
      rng: seed || 1,
      duo: !!opts.duo,
      demo: !!opts.demo,
      dda: dda,
      phase: 'play',
      time: 0,
      timeLeft: MATCH_TIME,
      goals: [0, 0],
      winGoals: opts.winGoals || WIN_GOALS,
      serveNum: 0,
      nextSnackId: 0,
      mod: 'normal',
      nextMod: 'normal',
      rouletteT: 0,
      rouletteIdx: 0,
      goalTimer: 0,
      lastScorer: -1,
      lastGoalPts: 1,
      suddenDeath: false,
      over: false,
      winner: -1,
      rally: 0,
      bestRally: 0,
      humanJumps: 0,
      humanWhacks: 0,
      atStart: true,
      p1Hat: p1Hat,
      p2Hat: p2Hat,
      chefs: [],
      snacks: [],
      params: modParams('normal'),
      lunchChomp: [0, 0],
      botThink: [0.2, 0.3],
      prevPress: [false, false],
      result: null
    };
    setupServe(w, opts.mod || 'normal');
    return w;
  }

  function pickNextMod(w) {
    if (w.suddenDeath) return 'golden_x2';
    var pool = ROULETTE_MODS.filter(function (m) { return m.id !== w.mod; });
    var idx = Math.floor(nextRng(w) * pool.length);
    return pool[idx].id;
  }

  function nearestSnack(w, chef) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < w.snacks.length; i++) {
      var s = w.snacks[i];
      var dx = s.x - chef.x, dy = s.y - chef.y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  function triggerChefFlip(w, chef, evs, isHuman) {
    var p = w.params;
    var target = nearestSnack(w, chef);
    var dirToGoal = chef.side === 0 ? 1 : -1;
    var dxSnack = target ? (target.x - chef.x) : dirToGoal * 140;

    if (chef.grounded || chef.coyote > 0) {
      chef.grounded = false;
      chef.coyote = 0;
      chef.airFlipUsed = false;
      chef.vy = -p.jumpVel;
      // Forgiving horizontal lunge: tracks toward the snack with gentle wobble personality
      var seekVx = clamp(dxSnack * 1.45, -340, 340);
      var leanVx = Math.sin(chef.lean) * 190;
      // Bias slightly forward when near own goal so players naturally clear danger
      var ownSafe = chef.side === 0 ? (chef.x < 250 ? 150 : 0) : (chef.x > W - 250 ? -150 : 0);
      chef.vx = (seekVx * 0.72 + leanVx * 0.28 + ownSafe) * p.speedMul;
      chef.spinVel = (chef.side === 0 ? 7.2 : -7.2) * (0.9 + nextRng(w) * 0.25);
      chef.spatulaT = 0.30;
      chef.cd = 0.14;
      chef.bufT = 0;
      chef.squashX = 0.78;
      chef.squashY = 1.28;
      chef.expr = 'focus';
      chef.exprT = 0.35;
      chef.jumps++;
      if (isHuman) {
        w.humanJumps++;
        w.atStart = false;
      }
      evs.push({ type: 'jump', side: chef.side, x: chef.x, y: chef.y + chef.r });
      return true;
    }

    // Mid-air spatula spike (1 per jump!)
    if (!chef.airFlipUsed && chef.cd <= 0) {
      chef.airFlipUsed = true;
      chef.vy = Math.min(chef.vy, -280);
      chef.vx += clamp(dxSnack * 0.75, -180, 180);
      chef.spatulaT = 0.26;
      chef.spinVel = chef.side === 0 ? 10.5 : -10.5;
      chef.cd = 0.16;
      chef.bufT = 0;
      chef.squashX = 1.2;
      chef.squashY = 0.85;
      chef.jumps++;
      if (isHuman) {
        w.humanJumps++;
        w.atStart = false;
      }
      evs.push({ type: 'airflip', side: chef.side, x: chef.x, y: chef.y });
      return true;
    }
    return false;
  }

  function decideBot(w, side, dt) {
    w.botThink[side] -= dt;
    if (w.botThink[side] > 0) return false;
    var chef = w.chefs[side];
    var snack = nearestSnack(w, chef);
    if (!snack) { w.botThink[side] = 0.25; return false; }

    var skill = w.demo ? 0.58 : w.dda;
    // Rubber-band mercy for solo players: if player trails by 2+, bot relaxes
    if (!w.demo && side === 1) {
      var lead = w.goals[1] - w.goals[0];
      if (lead >= 2) skill = Math.max(0.08, skill - 0.22);
      else if (lead <= -2) skill = Math.min(0.82, skill + 0.14);
    }

    var baseCadence = lerp(0.56, 0.18, skill);
    var dx = Math.abs(snack.x - chef.x);
    var dy = chef.y - snack.y;
    var onMySide = side === 0 ? snack.x < W * 0.62 : snack.x > W * 0.38;
    var headingMyWay = side === 0 ? snack.vx < -30 : snack.vx > 30;
    var closeThreat = side === 0 ? snack.x < 330 : snack.x > W - 330;

    var want = false;
    if (dx < 200 && dy > -35 && dy < 210) {
      want = nextRng(w) < lerp(0.58, 0.94, skill);
    } else if (closeThreat && chef.grounded) {
      want = nextRng(w) < lerp(0.55, 0.95, skill);
    } else if ((onMySide || headingMyWay) && chef.grounded && nextRng(w) < lerp(0.28, 0.58, skill)) {
      want = true;
    } else if (chef.grounded && nextRng(w) < 0.08) {
      // Occasional goofy hop
      want = true;
    }

    w.botThink[side] = baseCadence * (0.72 + nextRng(w) * 0.65);
    return want;
  }

  function stepChef(w, chef, dt, evs) {
    var p = w.params;
    var sp = p.speedMul;
    chef.cd = Math.max(0, chef.cd - dt);
    chef.spatulaT = Math.max(0, chef.spatulaT - dt);
    chef.bufT = Math.max(0, chef.bufT - dt);
    if (chef.exprT > 0) {
      chef.exprT -= dt;
      if (chef.exprT <= 0) chef.expr = 'happy';
    }
    chef.squashX = lerp(chef.squashX, 1, Math.min(1, dt * 11));
    chef.squashY = lerp(chef.squashY, 1, Math.min(1, dt * 11));

    if (chef.grounded) {
      chef.coyote = 0.09;
      chef.leanPhase += dt * (3.8 * sp);
      chef.lean = Math.sin(chef.leanPhase) * 0.32;
      chef.spin = lerp(chef.spin, chef.lean * 0.6, Math.min(1, dt * 12));
      chef.spinVel = 0;
      // Gentle auto-shuffle toward home half center if drifted far away
      var homeX = chef.side === 0 ? 370 : W - 370;
      var target = nearestSnack(w, chef);
      var desiredX = target ? clamp(target.x + (chef.side === 0 ? -95 : 95), GOAL_W + chef.r + 24, W - GOAL_W - chef.r - 24) : homeX;
      var drift = clamp((desiredX - chef.x) * 0.85, -105, 105);
      chef.vx = chef.vx * Math.pow(p.floorFric, dt * 60) + drift * dt * (p.butter ? 0.65 : 2.2);
    } else {
      chef.coyote = Math.max(0, chef.coyote - dt);
      chef.vy += p.grav * dt;
      chef.spin += chef.spinVel * dt;
      chef.spinVel *= Math.pow(0.95, dt * 60);
    }

    chef.x += chef.vx * dt;
    chef.y += chef.vy * dt;

    // Floor contact
    var floorY = FLOOR_Y - chef.r;
    if (chef.y >= floorY) {
      var impact = chef.vy;
      chef.y = floorY;
      if (p.trampoline && impact > 260) {
        chef.vy = -impact * 0.62;
        chef.grounded = false;
        chef.airFlipUsed = false;
        chef.squashX = 1.24;
        chef.squashY = 0.78;
        evs.push({ type: 'bounce', x: chef.x, y: FLOOR_Y });
      } else {
        if (!chef.grounded && impact > 220) {
          chef.squashX = 1.25;
          chef.squashY = 0.78;
          evs.push({ type: 'land', side: chef.side, x: chef.x, y: FLOOR_Y });
        }
        chef.vy = 0;
        chef.grounded = true;
        chef.airFlipUsed = false;
      }
    }

    // Ceiling contact
    if (chef.y < CEIL_Y + chef.r) {
      chef.y = CEIL_Y + chef.r;
      chef.vy = Math.abs(chef.vy) * 0.45;
    }

    // Keep chefs outside the lunchbox interiors so they don't hide inside goals
    var minX = GOAL_W + chef.r + 6;
    var maxX = W - GOAL_W - chef.r - 6;
    if (chef.x < minX) { chef.x = minX; chef.vx = Math.abs(chef.vx) * 0.5; }
    if (chef.x > maxX) { chef.x = maxX; chef.vx = -Math.abs(chef.vx) * 0.5; }

    // Consume buffered jump the instant chef lands!
    if (chef.bufT > 0 && chef.grounded) {
      triggerChefFlip(w, chef, evs, !w.demo && (chef.side === 0 || w.duo));
    }
  }

  function collideChefs(w, evs) {
    var a = w.chefs[0], b = w.chefs[1];
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var minD = a.r + b.r;
    if (d < minD) {
      var nx = dx / d, ny = dy / d;
      var overlap = (minD - d) * 0.5;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      var rel = rvx * nx + rvy * ny;
      if (rel < 0) {
        var imp = -rel * 0.85 + 90;
        a.vx -= nx * imp * 0.5; a.vy -= ny * imp * 0.35;
        b.vx += nx * imp * 0.5; b.vy += ny * imp * 0.35;
        a.squashX = b.squashX = 0.84;
        a.squashY = b.squashY = 1.18;
        evs.push({ type: 'bump', x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
      }
    }
  }

  function stepSnacks(w, dt, evs) {
    var p = w.params;
    var sp = p.speedMul;
    for (var i = 0; i < w.snacks.length; i++) {
      var s = w.snacks[i];
      s.hitCd = Math.max(0, s.hitCd - dt);
      s.squashX = lerp(s.squashX, 1, Math.min(1, dt * 10));
      s.squashY = lerp(s.squashY, 1, Math.min(1, dt * 10));

      s.vy += p.snackGrav * dt;
      // Subtle air drag
      s.vx *= Math.pow(0.996, dt * 60);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vrot * dt;

      // Keep trail (compact fixed length)
      if (s.vx * s.vx + s.vy * s.vy > 90000) {
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 7) s.trail.shift();
      } else if (s.trail.length) {
        s.trail.shift();
      }

      // Floor bounce
      if (s.y + s.r > FLOOR_Y) {
        s.y = FLOOR_Y - s.r;
        if (Math.abs(s.vy) > 95) {
          s.vy = -Math.abs(s.vy) * p.snackRest;
          if (p.trampoline) s.vy = Math.min(s.vy, -580);
          s.vx *= p.butter ? 0.995 : 0.92;
          s.vrot = s.vx * 0.012;
          s.squashX = 1.26; s.squashY = 0.76;
          evs.push({ type: 'sizzle', x: s.x, y: FLOOR_Y, kind: s.kind });
        } else {
          s.vy = p.trampoline ? -520 : 0;
          s.vx *= p.butter ? 0.994 : 0.96;
          s.vrot = s.vx * 0.015;
        }
      }

      // Ceiling bounce
      if (s.y - s.r < CEIL_Y) {
        s.y = CEIL_Y + s.r;
        s.vy = Math.abs(s.vy) * 0.75;
        s.squashX = 1.18; s.squashY = 0.84;
      }

      // Anti-stall griddle sizzle pop! (S++ Law #3)
      var speedSq = s.vx * s.vx + s.vy * s.vy;
      if (speedSq < 5500 && s.y > FLOOR_Y - s.r - 40) {
        s.stallT += dt;
        if (s.stallT >= 2.6) {
          s.stallT = 0;
          s.vy = -520;
          s.vx = (s.x < W * 0.5 ? 1 : -1) * (130 + nextRng(w) * 110);
          s.vrot = (nextRng(w) - 0.5) * 9;
          evs.push({ type: 'pop_stall', x: s.x, y: FLOOR_Y });
        }
      } else {
        s.stallT = 0;
      }

      // Lunchbox roof deflectors (prevent food from resting on top of the goals)
      if (s.y < GOAL_TOP + 6 && (s.x - s.r < GOAL_W + 10 || s.x + s.r > W - GOAL_W - 10)) {
        if (s.y + s.r > GOAL_TOP - 8 && s.y < GOAL_TOP + 12) {
          s.y = GOAL_TOP - s.r - 8;
          s.vy = -Math.max(290, Math.abs(s.vy) * 0.85);
          s.vx = s.x < W * 0.5 ? Math.max(220, Math.abs(s.vx)) : -Math.max(220, Math.abs(s.vx));
          evs.push({ type: 'lid', x: s.x, y: GOAL_TOP });
        }
      }

      // Side walls above the lunchbox opening
      if (s.y - s.r < GOAL_TOP + 8) {
        if (s.x - s.r < 12) { s.x = 12 + s.r; s.vx = Math.abs(s.vx) * 0.82; }
        if (s.x + s.r > W - 12) { s.x = W - 12 - s.r; s.vx = -Math.abs(s.vx) * 0.82; }
      }

      // Chef spatula whack & body collision
      for (var ci = 0; ci < 2; ci++) {
        var c = w.chefs[ci];
        var dx = s.x - c.x, dy = s.y - c.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        var whackReach = c.r * 2.25 + s.r;

        if (c.spatulaT > 0.04 && s.hitCd <= 0 && dist < whackReach) {
          // Generous aim toward rival's hungry lunchbox!
          var goalX = c.side === 0 ? W - 36 : 36;
          var goalY = GOAL_TOP + 85;
          var gx = goalX - s.x, gy = goalY - s.y;
          var gd = Math.sqrt(gx * gx + gy * gy) || 1;
          var ux = gx / gd, uy = gy / gd;
          var relX = dx / dist, relY = dy / dist;
          var dirX = ux * 0.68 + relX * 0.32;
          var dirY = clamp(uy * 0.48 + relY * 0.30 - 0.36, -0.82, -0.18);
          var dl = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
          var power = (780 + Math.min(220, Math.abs(c.vy) * 0.3)) * sp;
          s.vx = (dirX / dl) * power;
          s.vy = (dirY / dl) * power;
          s.vrot = (c.side === 0 ? 1 : -1) * (10 + nextRng(w) * 7);
          s.hitCd = 0.14;
          s.lastHit = c.side;
          s.squashX = 1.34; s.squashY = 0.72;
          c.whacks++;
          c.expr = 'wow'; c.exprT = 0.4;
          w.rally++;
          if (w.rally > w.bestRally) w.bestRally = w.rally;
          if (!w.demo && (c.side === 0 || w.duo)) w.humanWhacks++;
          evs.push({ type: 'whack', side: c.side, x: s.x, y: s.y, power: clamp(power / 1000, 0.4, 1), kind: s.kind, golden: s.golden, rally: w.rally });
          continue;
        }

        // Body bump
        var bodyMin = c.r + s.r;
        if (dist < bodyMin) {
          var nx = dx / dist, ny = dy / dist;
          s.x = c.x + nx * (bodyMin + 1);
          s.y = c.y + ny * (bodyMin + 1);
          var push = Math.max(360, Math.sqrt(c.vx * c.vx + c.vy * c.vy) * 1.1) * sp;
          s.vx = nx * push + c.vx * 0.45 + (c.side === 0 ? 90 : -90);
          s.vy = Math.min(-210, ny * push - 140);
          s.vrot = (c.side === 0 ? 6 : -6);
          s.squashX = 1.2; s.squashY = 0.84;
          if (s.hitCd <= 0) {
            s.hitCd = 0.12;
            s.lastHit = c.side;
            evs.push({ type: 'bump_food', side: c.side, x: s.x, y: s.y });
          }
        }
      }

      // Snack vs snack collision (in Double Food chaos!)
      for (var j = i + 1; j < w.snacks.length; j++) {
        var b = w.snacks[j];
        var sdx = b.x - s.x, sdy = b.y - s.y;
        var sd = Math.sqrt(sdx * sdx + sdy * sdy) || 0.001;
        var sMin = s.r + b.r;
        if (sd < sMin) {
          var snx = sdx / sd, sny = sdy / sd;
          var ov = (sMin - sd) * 0.5;
          s.x -= snx * ov; s.y -= sny * ov;
          b.x += snx * ov; b.y += sny * ov;
          var tvx = s.vx; s.vx = b.vx * 0.9; b.vx = tvx * 0.9;
          var tvy = s.vy; s.vy = b.vy * 0.9; b.vy = tvy * 0.9;
        }
      }

      // Clamp max speed so physics never tunnels
      var maxSp = 1280 * sp;
      var curSp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (curSp > maxSp) {
        s.vx = (s.vx / curSp) * maxSp;
        s.vy = (s.vy / curSp) * maxSp;
      }

      // Check Goal! Right lunchbox = P1 scores (0); Left lunchbox = P2/Bot scores (1)
      var scoredBy = -1;
      if (s.x > W - GOAL_W + s.r * 0.2 && s.y > GOAL_TOP + 10) scoredBy = 0;
      else if (s.x < GOAL_W - s.r * 0.2 && s.y > GOAL_TOP + 10) scoredBy = 1;

      if (scoredBy !== -1) {
        var pts = s.golden ? 2 : p.points;
        if (w.suddenDeath) pts = 1;
        w.goals[scoredBy] += pts;
        w.lastScorer = scoredBy;
        w.lastGoalPts = pts;
        w.lunchChomp[1 - scoredBy] = 1.0;
        w.chefs[scoredBy].expr = 'cheer'; w.chefs[scoredBy].exprT = 1.3;
        w.chefs[1 - scoredBy].expr = 'dizzy'; w.chefs[1 - scoredBy].exprT = 1.3;
        w.rally = 0;

        // Check immediate win (first to winGoals, or sudden death)
        if (!w.demo && (w.suddenDeath || w.goals[0] >= w.winGoals || w.goals[1] >= w.winGoals)) {
          evs.push({ type: 'goal', scorer: scoredBy, points: pts, golden: s.golden, x: s.x, y: s.y, nextMod: w.mod, matchWinning: true });
          finishMatch(w, evs);
          return;
        }

        // Spin Kitchen Chaos Roulette for the next serve!
        w.phase = 'goal';
        w.goalTimer = 1.25;
        w.rouletteT = 0;
        w.nextMod = pickNextMod(w);
        evs.push({ type: 'goal', scorer: scoredBy, points: pts, golden: s.golden, x: s.x, y: s.y, nextMod: w.nextMod });
        return;
      }
    }
  }

  function finishMatch(w, evs) {
    w.phase = 'over';
    w.over = true;
    w.winner = w.goals[0] >= w.goals[1] ? 0 : 1;
    var won = w.winner === 0;
    var coins = 15 + w.goals[0] * 12 + (won ? 25 : 5);
    var score = w.goals[0];
    w.result = {
      won: won,
      winner: w.winner,
      goals: [w.goals[0], w.goals[1]],
      score: score,
      coins: coins,
      whacks: w.chefs[0].whacks,
      bestRally: w.bestRally,
      duo: w.duo
    };
    evs.push({ type: 'matchEnd', result: w.result });
  }

  function step(w, dt, input) {
    dt = clamp(dt || 0, 0, 0.05);
    input = input || {};
    var evs = [];
    if (w.over) return evs;

    w.time += dt;
    w.lunchChomp[0] = Math.max(0, w.lunchChomp[0] - dt * 2.4);
    w.lunchChomp[1] = Math.max(0, w.lunchChomp[1] - dt * 2.4);

    if (w.phase === 'goal') {
      w.goalTimer -= dt;
      w.rouletteT += dt;
      // Cycle visual roulette index rapidly then lock on nextMod
      if (w.goalTimer > 0.38) {
        w.rouletteIdx = Math.floor(w.rouletteT * 18) % ROULETTE_MODS.length;
      } else {
        for (var ri = 0; ri < ROULETTE_MODS.length; ri++) {
          if (ROULETTE_MODS[ri].id === w.nextMod) { w.rouletteIdx = ri; break; }
        }
      }
      // Chefs bounce joyfully during goal break
      for (var ci = 0; ci < 2; ci++) {
        w.chefs[ci].squashX = lerp(w.chefs[ci].squashX, 1, Math.min(1, dt * 8));
        w.chefs[ci].squashY = lerp(w.chefs[ci].squashY, 1, Math.min(1, dt * 8));
      }
      if (w.goalTimer <= 0) {
        w.phase = 'play';
        setupServe(w, w.nextMod);
        evs.push({ type: 'serve', mod: w.mod });
      }
      return evs;
    }

    // Active play countdown (not in demo or sudden death)
    if (!w.demo && !w.suddenDeath) {
      w.timeLeft = Math.max(0, w.timeLeft - dt);
      if (w.timeLeft <= 0) {
        if (w.goals[0] === w.goals[1]) {
          w.suddenDeath = true;
          setupServe(w, 'golden_x2');
          evs.push({ type: 'suddenDeath' });
          return evs;
        } else {
          finishMatch(w, evs);
          return evs;
        }
      }
    }

    // Demo auto-reset so live attract stays fresh forever
    if (w.demo && (w.goals[0] >= 5 || w.goals[1] >= 5)) {
      w.goals[0] = 0; w.goals[1] = 0;
    }

    // Process 1-button inputs (edge-triggered with generous 0.16s buffer)
    var p1Held = !!input.p1;
    var p2Held = !!input.p2;
    var p1Edge = (p1Held && !w.prevPress[0]) || !!input.p1Press;
    var p2Edge = (p2Held && !w.prevPress[1]) || !!input.p2Press;
    w.prevPress[0] = p1Held;
    w.prevPress[1] = p2Held;

    if (w.demo) {
      if (decideBot(w, 0, dt)) triggerChefFlip(w, w.chefs[0], evs, false);
      if (decideBot(w, 1, dt)) triggerChefFlip(w, w.chefs[1], evs, false);
    } else {
      if (p1Edge) {
        w.chefs[0].bufT = 0.16;
        triggerChefFlip(w, w.chefs[0], evs, true);
      }
      if (w.duo) {
        if (p2Edge) {
          w.chefs[1].bufT = 0.16;
          triggerChefFlip(w, w.chefs[1], evs, true);
        }
      } else {
        if (decideBot(w, 1, dt)) triggerChefFlip(w, w.chefs[1], evs, false);
      }
    }

    stepChef(w, w.chefs[0], dt, evs);
    stepChef(w, w.chefs[1], dt, evs);
    collideChefs(w, evs);
    stepSnacks(w, dt, evs);
    return evs;
  }

  function defaultSave() {
    return { v: SAVE_VERSION, coins: 0, hats: [0], hat: 0, wins: 0, matches: 0, bestGoals: 0, duoWins: [0, 0] };
  }

  function loadSave(raw) {
    var d = defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return d;
    d.coins = Math.max(0, raw.coins | 0);
    d.wins = Math.max(0, raw.wins | 0);
    d.matches = Math.max(0, raw.matches | 0);
    d.bestGoals = Math.max(0, raw.bestGoals | 0);
    if (Array.isArray(raw.hats)) {
      var seen = { 0: true };
      var out = [0];
      for (var i = 0; i < raw.hats.length; i++) {
        var id = raw.hats[i] | 0;
        if (id >= 0 && id < HATS.length && !seen[id]) { seen[id] = true; out.push(id); }
      }
      d.hats = out;
    }
    var h = raw.hat | 0;
    d.hat = d.hats.indexOf(h) !== -1 ? h : 0;
    if (Array.isArray(raw.duoWins) && raw.duoWins.length === 2) {
      d.duoWins = [Math.max(0, raw.duoWins[0] | 0), Math.max(0, raw.duoWins[1] | 0)];
    }
    return d;
  }

  function buyHat(save, idx) {
    if (idx < 0 || idx >= HATS.length) return 'invalid';
    if (save.hats.indexOf(idx) !== -1) {
      save.hat = idx;
      return 'equip';
    }
    var cost = HATS[idx].cost;
    if (save.coins < cost) return 'poor';
    save.coins -= cost;
    save.hats.push(idx);
    save.hat = idx;
    return 'buy';
  }

  function applyResult(save, res) {
    save.matches++;
    if (res.duo) {
      save.duoWins[res.winner]++;
      save.coins += 15;
    } else {
      save.coins += res.coins;
      if (res.won) save.wins++;
      if (res.goals[0] > save.bestGoals) save.bestGoals = res.goals[0];
    }
    return save;
  }

  function publicState(w, screen) {
    return {
      screen: screen,
      phase: screen === 'play' || screen === 'pause' ? w.phase : screen,
      paused: screen === 'pause',
      mode: w.duo ? 'duo' : 'solo',
      time: +w.time.toFixed(3),
      timeLeft: +w.timeLeft.toFixed(2),
      goals: [w.goals[0], w.goals[1]],
      score: w.goals[0],
      mod: w.mod,
      nextMod: w.nextMod,
      suddenDeath: w.suddenDeath,
      rally: w.rally,
      jumps: w.humanJumps,
      whacks: w.humanWhacks,
      atStart: w.atStart,
      winner: w.winner,
      chefs: w.chefs.map(function (c) {
        return { x: Math.round(c.x), y: Math.round(c.y), grounded: c.grounded, jumps: c.jumps, whacks: c.whacks };
      }),
      snacks: w.snacks.map(function (s) {
        return { x: Math.round(s.x), y: Math.round(s.y), kind: s.kind, golden: s.golden };
      })
    };
  }

  return {
    W: W, H: H, FLOOR_Y: FLOOR_Y, CEIL_Y: CEIL_Y,
    GOAL_W: GOAL_W, GOAL_H: GOAL_H, GOAL_TOP: GOAL_TOP,
    MATCH_TIME: MATCH_TIME, WIN_GOALS: WIN_GOALS,
    SAVE_VERSION: SAVE_VERSION,
    MODS: MODS, ROULETTE_MODS: ROULETTE_MODS, HATS: HATS,
    modById: modById,
    create: create,
    step: step,
    setupServe: setupServe,
    loadSave: loadSave,
    buyHat: buyHat,
    applyResult: applyResult,
    publicState: publicState
  };
});
