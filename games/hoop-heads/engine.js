/* Hoop Heads 3D (سلة الرؤوس الكبيرة) — Pure deterministic 2D side-plane physics & rules engine.
 * Zero DOM, zero Kit, zero Math.random(). UMD export for both browser and Node unit tests. */
(function (root) {
  'use strict';

  var COURT_W = 1280;
  var COURT_H = 720;
  var FLOOR_Y = 600;
  var CEIL_Y = 48;
  var WALL_L = 56;
  var WALL_R = 1224;
  var FIXED_DT = 1 / 60;

  var BALL_R = 21;
  var BALL_G = 1480;
  var PLAYER_R = 36;
  var PLAYER_H = 104;
  var PLAYER_G = 1920;
  var JUMP_VY = -790;
  var MAX_SPEED = 450;
  var THREE_PT_DIST = 385;

  var SWEET_MIN = 0.50;
  var SWEET_MAX = 0.80;
  var SWEET_MID = 0.65;
  var CHARGE_RATE = 1.28;
  var MATCH_SECONDS = 60;
  var INTRO_TIME = 1.05;
  var GOAL_TIME = 1.15;

  var HOOPS_SPEC = [
    { side: 0, x: 152, y: 326, rimR: 42, boardX: 96, boardTop: 212, boardBot: 362 },
    { side: 1, x: 1128, y: 326, rimR: 42, boardX: 1184, boardTop: 212, boardBot: 362 }
  ];

  // 5-Opponent CPU Ladder (distinct 3D heads, outfits, arena themes & skill curves)
  var OPPONENTS = [
    {
      id: 'rami', name: 'رامي السريع', title: 'ملعب الحديقة',
      head: 'classic', jersey: 0xe63946, trim: 0xffe066, skin: 0xffcda3,
      skyTop: 0x56c8ff, skyFog: 0x8de0ff, floorTint: 0xe3a857, keyL: 0x2589ff, keyR: 0xff5a5f,
      baseSkill: 0.22, speed: 0.90, jump: 0.94, shoot: 0.92
    },
    {
      id: 'tamer', name: 'تامر الكاب', title: 'ملعب الشاطئ',
      head: 'cap', jersey: 0x10b981, trim: 0xfef08a, skin: 0xf0b286,
      skyTop: 0xff9a5a, skyFog: 0xffc78a, floorTint: 0xe8b468, keyL: 0x0ea5e9, keyR: 0xf97316,
      baseSkill: 0.38, speed: 0.96, jump: 0.98, shoot: 0.96
    },
    {
      id: 'dino', name: 'دينو القافز', title: 'صالة الأبطال',
      head: 'dino', jersey: 0x8b5cf6, trim: 0x6ee7b7, skin: 0x4ade80,
      skyTop: 0x4fd1c5, skyFog: 0x99f6e4, floorTint: 0xdca04c, keyL: 0x3b82f6, keyR: 0x8b5cf6,
      baseSkill: 0.54, speed: 1.00, jump: 1.06, shoot: 0.98
    },
    {
      id: 'robo', name: 'روبوت 3000', title: 'ملعب النيون',
      head: 'robo', jersey: 0xec4899, trim: 0x22d3ee, skin: 0xb8d4f0,
      skyTop: 0x3b3d8f, skyFog: 0x625bb8, floorTint: 0xc98f4a, keyL: 0x06b6d4, keyR: 0xec4899,
      baseSkill: 0.70, speed: 1.04, jump: 1.03, shoot: 1.05
    },
    {
      id: 'king', name: 'الملك الذهبي', title: 'استاد الكأس',
      head: 'crown', jersey: 0xf59e0b, trim: 0xfff3b0, skin: 0xf6be90,
      skyTop: 0x38bdf8, skyFog: 0x7dd3fc, floorTint: 0xe7ad52, keyL: 0x2563eb, keyR: 0xd97706,
      baseSkill: 0.84, speed: 1.07, jump: 1.07, shoot: 1.08
    }
  ];

  // Unlockable 3D Player Heads & Accessories (for P1 customization)
  var HEADS = [
    { id: 'classic', name: 'عصابة النجم', icon: '⚡', cost: 0, skin: 0xffd1a9, jersey: 0x2563eb, trim: 0xffe066 },
    { id: 'cap', name: 'كاب الشارع', icon: '🧢', cost: 30, skin: 0xf5be92, jersey: 0x0284c7, trim: 0x38bdf8 },
    { id: 'dino', name: 'تاج الديناصور', icon: '🦖', cost: 60, skin: 0x6ee7b7, jersey: 0x059669, trim: 0xfde047 },
    { id: 'robo', name: 'خوذة الروبوت', icon: '🤖', cost: 95, skin: 0xcbd5e1, jersey: 0x4f46e5, trim: 0x22d3ee },
    { id: 'wizard', name: 'قبعة الساحر', icon: '🧙', cost: 130, skin: 0xffd1a9, jersey: 0x7c3aed, trim: 0xfacc15 },
    { id: 'crown', name: 'التاج الذهبي', icon: '👑', cost: 180, skin: 0xffcfa4, jersey: 0xe11d48, trim: 0xfde047 }
  ];

  // Unlockable 3D Basketball Skins
  var BALLS = [
    { id: 'classic', name: 'كرة كلاسيكية', icon: '🏀', cost: 0, primary: '#f97316', seam: '#271710', glow: 0xff9f1c },
    { id: 'neon', name: 'كرة النيون', icon: '💠', cost: 35, primary: '#06b6d4', seam: '#f43f5e', glow: 0x22d3ee },
    { id: 'fire', name: 'كرة اللهب', icon: '🔥', cost: 75, primary: '#ef4444', seam: '#fef08a', glow: 0xff6b00 },
    { id: 'galaxy', name: 'كرة المجرة', icon: '🌌', cost: 120, primary: '#4c1d95', seam: '#38bdf8', glow: 0xa855f7 },
    { id: 'gold', name: 'الكرة الذهبية', icon: '🏆', cost: 180, primary: '#f59e0b', seam: '#fffbeb', glow: 0xfde047 }
  ];

  /* --------------------------------------------------------------- Helpers */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function next() {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function headById(id) {
    for (var i = 0; i < HEADS.length; i++) if (HEADS[i].id === id) return HEADS[i];
    return HEADS[0];
  }
  function ballById(id) {
    for (var i = 0; i < BALLS.length; i++) if (BALLS[i].id === id) return BALLS[i];
    return BALLS[0];
  }

  /* --------------------------------------------------------------- Save Schema */
  function defaultSave() {
    return {
      v: 3,
      coins: 0,
      bestScore: 0,
      streak: 0,
      bestStreak: 0,
      unlocked: 0,
      stars: [0, 0, 0, 0, 0],
      head: 'classic',
      ball: 'classic',
      ownedHeads: { classic: true },
      ownedBalls: { classic: true },
      stats: { games: 0, wins: 0, baskets: 0, dunks: 0, swishes: 0 }
    };
  }

  function loadSave(raw) {
    var s = defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== 3) return s;
    if (typeof raw.coins === 'number' && isFinite(raw.coins) && raw.coins >= 0) s.coins = Math.floor(raw.coins);
    if (typeof raw.bestScore === 'number' && isFinite(raw.bestScore) && raw.bestScore >= 0) s.bestScore = Math.floor(raw.bestScore);
    if (typeof raw.streak === 'number' && isFinite(raw.streak) && raw.streak >= 0) s.streak = Math.floor(raw.streak);
    if (typeof raw.bestStreak === 'number' && isFinite(raw.bestStreak) && raw.bestStreak >= 0) s.bestStreak = Math.floor(raw.bestStreak);
    if (typeof raw.unlocked === 'number' && isFinite(raw.unlocked)) s.unlocked = clamp(Math.floor(raw.unlocked), 0, OPPONENTS.length - 1);
    if (Array.isArray(raw.stars)) {
      for (var i = 0; i < OPPONENTS.length; i++) {
        var st = raw.stars[i];
        s.stars[i] = typeof st === 'number' && isFinite(st) ? clamp(Math.floor(st), 0, 3) : 0;
      }
    }
    if (raw.ownedHeads && typeof raw.ownedHeads === 'object') {
      for (var h = 0; h < HEADS.length; h++) if (raw.ownedHeads[HEADS[h].id]) s.ownedHeads[HEADS[h].id] = true;
    }
    if (raw.ownedBalls && typeof raw.ownedBalls === 'object') {
      for (var b = 0; b < BALLS.length; b++) if (raw.ownedBalls[BALLS[b].id]) s.ownedBalls[BALLS[b].id] = true;
    }
    s.head = s.ownedHeads[raw.head] ? raw.head : 'classic';
    s.ball = s.ownedBalls[raw.ball] ? raw.ball : 'classic';
    if (raw.stats && typeof raw.stats === 'object') {
      s.stats.games = Math.max(0, Math.floor(Number(raw.stats.games) || 0));
      s.stats.wins = Math.max(0, Math.floor(Number(raw.stats.wins) || 0));
      s.stats.baskets = Math.max(0, Math.floor(Number(raw.stats.baskets) || 0));
      s.stats.dunks = Math.max(0, Math.floor(Number(raw.stats.dunks) || 0));
      s.stats.swishes = Math.max(0, Math.floor(Number(raw.stats.swishes) || 0));
    }
    return s;
  }

  function totalStars(save) {
    var sum = 0;
    for (var i = 0; i < OPPONENTS.length; i++) sum += (save.stars && save.stars[i]) || 0;
    return sum;
  }

  function buyOrEquipHead(save, id) {
    var item = headById(id);
    if (save.ownedHeads[item.id]) {
      save.head = item.id;
      return { ok: true, bought: false, item: item };
    }
    if (save.coins < item.cost) return { ok: false, bought: false, item: item };
    save.coins -= item.cost;
    save.ownedHeads[item.id] = true;
    save.head = item.id;
    return { ok: true, bought: true, item: item };
  }

  function buyOrEquipBall(save, id) {
    var item = ballById(id);
    if (save.ownedBalls[item.id]) {
      save.ball = item.id;
      return { ok: true, bought: false, item: item };
    }
    if (save.coins < item.cost) return { ok: false, bought: false, item: item };
    save.coins -= item.cost;
    save.ownedBalls[item.id] = true;
    save.ball = item.id;
    return { ok: true, bought: true, item: item };
  }

  function computeRewards(match) {
    var p0 = match.players[0];
    var p1 = match.players[1];
    var won = match.winner === 0;
    var margin = p0.score - p1.score;
    var stars = 0;
    if (won) {
      stars = 1;
      if (margin >= 4 || p0.score >= 10) stars = 2;
      if (margin >= 8 || p0.score >= 16) stars = 3;
    }
    var stage = match.stage || 0;
    var baseCoins = won ? (16 + stage * 6) : 6;
    var coins = baseCoins + p0.score * 2 + p0.st.swishes * 3 + p0.st.dunks * 2;
    return {
      won: won,
      stars: stars,
      coins: coins,
      score: p0.score,
      oppScore: p1.score,
      margin: margin
    };
  }

  function applyMatchResult(save, match) {
    var rew = computeRewards(match);
    var isNewBest = false;
    var unlockedNext = false;
    if (match.mode === 'cpu') {
      save.stats.games++;
      if (rew.won) {
        save.stats.wins++;
        save.streak++;
        if (save.streak > save.bestStreak) save.bestStreak = save.streak;
        if (rew.stars > (save.stars[match.stage] || 0)) save.stars[match.stage] = rew.stars;
        if (match.stage >= save.unlocked && save.unlocked < OPPONENTS.length - 1) {
          save.unlocked = match.stage + 1;
          unlockedNext = true;
        }
        // Defeating the final boss awards the Golden Crown automatically!
        if (match.stage === OPPONENTS.length - 1 && !save.ownedHeads.crown) {
          save.ownedHeads.crown = true;
        }
      } else {
        save.streak = 0;
      }
      save.coins += rew.coins;
      if (rew.score > save.bestScore) {
        save.bestScore = rew.score;
        isNewBest = true;
      }
      save.stats.baskets += match.players[0].st.baskets;
      save.stats.dunks += match.players[0].st.dunks;
      save.stats.swishes += match.players[0].st.swishes;
    }
    rew.isNewBest = isNewBest;
    rew.unlockedNext = unlockedNext;
    return rew;
  }

  /* --------------------------------------------------------------- Match Factory */
  function makePlayer(idx, opts) {
    var dir = idx === 0 ? 1 : -1;
    var startX = idx === 0 ? 410 : 870;
    return {
      id: idx,
      dir: dir,
      facing: dir,
      ctrl: opts.ctrl || 'human',
      aiSkill: opts.aiSkill == null ? 0.35 : clamp(opts.aiSkill, 0.1, 0.98),
      head: opts.head || 'classic',
      jersey: opts.jersey || (idx === 0 ? 0x2563eb : 0xe63946),
      trim: opts.trim || 0xffe066,
      skin: opts.skin || 0xffd1a9,
      name: opts.name || (idx === 0 ? 'اللاعب 1' : 'اللاعب 2'),
      speedMul: opts.speedMul || 1,
      jumpMul: opts.jumpMul || 1,
      shootMul: opts.shootMul || 1,

      x: startX,
      y: FLOOR_Y,
      vx: 0,
      vy: 0,
      onGround: true,
      coyoteT: 0,
      jumpBuf: 0,

      score: 0,
      super: 0,
      charging: false,
      charge: 0,
      chargeDir: 1,
      chargeHoldT: 0,
      shootAnimT: 0,
      stealAnimT: 0,
      stealCd: 0,
      protect: 0,
      stunT: 0,
      squashX: 1,
      squashY: 1,
      runPhase: 0,
      dribblePhase: 0,
      expr: 'normal',
      exprT: 0,

      dunk: null,
      inp: { l: false, r: false, j: false, jPressed: false, s: false, sPressed: false, sReleased: false },
      aiState: {
        thinkT: 0,
        wantX: startX,
        wantCharge: SWEET_MID,
        shootDelay: 0.3,
        jumpCd: 0
      },
      st: { baskets: 0, dunks: 0, swishes: 0, threes: 0, blocks: 0, steals: 0, shots: 0 }
    };
  }

  function createMatch(opts) {
    opts = opts || {};
    var mode = opts.mode || 'cpu'; // 'cpu' | 'duo' | 'demo'
    var stage = clamp(opts.stage | 0, 0, OPPONENTS.length - 1);
    var opp = OPPONENTS[stage];
    var p1Head = headById(opts.head || 'classic');
    var p2Head = opts.p2Head ? headById(opts.p2Head) : null;
    var ballSkin = ballById(opts.ball || 'classic').id;

    // Combine ladder opponent base skill with optional DDA skill parameter (0..1)
    var ddaVal = typeof opts.dda === 'number' && isFinite(opts.dda) ? clamp(opts.dda, 0, 1) : 0.35;
    var aiSkill = typeof opts.aiSkill === 'number'
      ? clamp(opts.aiSkill, 0.1, 0.98)
      : clamp(opp.baseSkill + (ddaVal - 0.35) * 0.28, 0.14, 0.94);

    var p1Ctrl = mode === 'demo' ? 'ai' : 'human';
    var p2Ctrl = mode === 'duo' ? 'human' : 'ai';

    var p0 = makePlayer(0, {
      ctrl: p1Ctrl,
      aiSkill: mode === 'demo' ? 0.62 : 0.5,
      head: p1Head.id,
      jersey: p1Head.jersey,
      trim: p1Head.trim,
      skin: p1Head.skin,
      name: 'اللاعب 1'
    });

    var p1 = makePlayer(1, {
      ctrl: p2Ctrl,
      aiSkill: mode === 'demo' ? 0.60 : aiSkill,
      head: mode === 'duo' ? (p2Head ? p2Head.id : 'cap') : opp.head,
      jersey: mode === 'duo' ? 0xe63946 : opp.jersey,
      trim: mode === 'duo' ? 0xffe066 : opp.trim,
      skin: mode === 'duo' ? 0xf5be92 : opp.skin,
      name: mode === 'duo' ? 'اللاعب 2' : opp.name,
      speedMul: mode === 'cpu' ? opp.speed : 1,
      jumpMul: mode === 'cpu' ? opp.jump : 1,
      shootMul: mode === 'cpu' ? opp.shoot : 1
    });

    var hoops = [
      {
        side: 0, x: HOOPS_SPEC[0].x, y: HOOPS_SPEC[0].y, rimR: HOOPS_SPEC[0].rimR,
        boardX: HOOPS_SPEC[0].boardX, boardTop: HOOPS_SPEC[0].boardTop, boardBot: HOOPS_SPEC[0].boardBot,
        netSway: 0, netVel: 0, rimBend: 0, glowT: 0
      },
      {
        side: 1, x: HOOPS_SPEC[1].x, y: HOOPS_SPEC[1].y, rimR: HOOPS_SPEC[1].rimR,
        boardX: HOOPS_SPEC[1].boardX, boardTop: HOOPS_SPEC[1].boardTop, boardBot: HOOPS_SPEC[1].boardBot,
        netSway: 0, netVel: 0, rimBend: 0, glowT: 0
      }
    ];

    var match = {
      mode: mode,
      stage: stage,
      arena: opp,
      ballSkin: ballSkin,
      target: opts.target > 0 ? opts.target | 0 : 0,
      phase: 'intro', // 'intro' | 'play' | 'goal' | 'done'
      phaseT: INTRO_TIME,
      time: typeof opts.duration === 'number' && opts.duration > 0 ? opts.duration : MATCH_SECONDS,
      elapsed: 0,
      timeUp: false,
      overtime: false,
      ended: false,
      done: false,
      winner: -1,
      lastScorer: -1,
      hitstop: 0,
      flashT: 0,
      flashSide: -1,
      crowdExcite: 0,
      seed: (opts.seed >>> 0) || (1337 + stage * 97),
      rng: makeRng((opts.seed >>> 0) || (1337 + stage * 97)),
      players: [p0, p1],
      hoops: hoops,
      ball: {
        x: COURT_W * 0.5,
        y: 185,
        prevX: COURT_W * 0.5,
        prevY: 185,
        vx: 0,
        vy: 0,
        r: BALL_R,
        spin: 0,
        angle: 0,
        state: 'loose', // 'loose' | 'held' | 'shot' | 'dunk'
        holder: null,
        shooter: null,
        targetSide: 1,
        pts: 2,
        isSuper: false,
        swishAim: false,
        touchedRim: false,
        touchedBoard: false,
        scoredT: 0,
        pickupCd: 0,
        fireT: 0
      },
      events: []
    };

    return match;
  }

  /* --------------------------------------------------------------- Shot Solver */
  function targetHoopOf(match, p) {
    return match.hoops[1 - p.id];
  }

  function releasePointOf(p) {
    return {
      x: p.x + p.dir * 20,
      y: p.y - 76
    };
  }

  function computeShotVelocity(match, p, charge, isQuickTap) {
    var hoop = targetHoopOf(match, p);
    var rel = releasePointOf(p);
    var sx = rel.x;
    var sy = rel.y;
    var distX = Math.abs(hoop.x - sx);

    var inSweet = !isQuickTap && charge >= SWEET_MIN && charge <= SWEET_MAX;
    var aimOffsetX = 0;

    if (inSweet) {
      // Pure dead-center swish trajectory!
      aimOffsetX = (charge - SWEET_MID) * 14;
    } else if (isQuickTap) {
      // Kid-friendly quick-tap release: accurate enough to sink often, slight gentle spread
      var spread = (match.rng() - 0.5) * 44;
      aimOffsetX = spread + p.dir * 6;
    } else if (charge < SWEET_MIN) {
      // Undercharged: falls short toward front rim
      var under = (SWEET_MIN - charge) / SWEET_MIN;
      aimOffsetX = -p.dir * (34 + under * 150);
    } else {
      // Overcharged: flies deep toward backboard (can bank in!)
      var over = (charge - SWEET_MAX) / (1 - SWEET_MAX);
      aimOffsetX = p.dir * (30 + over * 135);
    }

    var tx = hoop.x + aimOffsetX;
    var ty = hoop.y - 8;
    var dx = tx - sx;
    var dy = ty - sy;
    var flightT = clamp(0.68 + distX * 0.00050, 0.62, 1.18);
    if (charge > SWEET_MAX) flightT = clamp(flightT - 0.06, 0.58, 1.14);

    var vx = dx / flightT;
    var vy = (dy - 0.5 * BALL_G * flightT * flightT) / flightT;
    var pts = distX >= THREE_PT_DIST ? 3 : 2;

    return {
      sx: sx,
      sy: sy,
      vx: vx,
      vy: vy,
      flightT: flightT,
      inSweet: inSweet,
      pts: pts
    };
  }

  function computeShotPreview(match, p, steps) {
    var count = steps || 11;
    var sol = computeShotVelocity(match, p, p.charge, false);
    var pts = [];
    var maxT = sol.flightT * 0.92;
    for (var i = 1; i <= count; i++) {
      var t = (maxT * i) / count;
      pts.push({
        x: sol.sx + sol.vx * t,
        y: sol.sy + sol.vy * t + 0.5 * BALL_G * t * t
      });
    }
    return {
      points: pts,
      inSweet: sol.inSweet,
      isThree: sol.pts === 3,
      charge: p.charge
    };
  }

  function canDunk(match, p) {
    if (!p || match.ball.holder !== p || p.dunk || p.stunT > 0) return false;
    var hoop = targetHoopOf(match, p);
    var dx = (hoop.x - p.x) * p.dir;
    if (dx < -40) return false;
    if (p.super >= 100) return dx <= 640;
    if (!p.onGround) return dx <= 275;
    return dx <= 220;
  }

  function startDunk(match, p, isSuper) {
    var hoop = targetHoopOf(match, p);
    var b = match.ball;
    p.charging = false;
    p.charge = 0;
    p.chargeHoldT = 0;
    p.onGround = false;
    p.expr = 'fierce';
    p.exprT = 0.8;
    p.squashX = 0.82;
    p.squashY = 1.24;

    var startX = p.x;
    var startY = p.y;
    var endX = hoop.x - p.dir * 26;
    var endY = hoop.y + 42;
    var dist = Math.abs(endX - startX);
    var dur = isSuper ? clamp(0.46 + dist * 0.00028, 0.48, 0.64) : clamp(0.36 + dist * 0.00025, 0.36, 0.48);
    var peakLift = isSuper ? 195 : 135;

    if (isSuper) {
      p.super = 0;
      b.fireT = 2.4;
      // Blast nearby defender back playfully!
      var opp = match.players[1 - p.id];
      var odx = opp.x - p.x;
      if (Math.abs(odx) < 280) {
        opp.vx = (odx >= 0 ? 1 : -1) * 440;
        opp.vy = -340;
        opp.onGround = false;
        opp.stunT = 0.55;
        opp.expr = 'dizzy';
        opp.exprT = 0.7;
      }
      match.events.push({ type: 'super_dunk', player: p.id, x: p.x, y: p.y - 60 });
    } else {
      match.events.push({ type: 'dunk_launch', player: p.id, x: p.x, y: p.y - 60 });
    }

    p.dunk = {
      t: 0,
      dur: dur,
      sx: startX,
      sy: startY,
      ex: endX,
      ey: endY,
      peak: Math.min(startY, endY) - peakLift,
      isSuper: !!isSuper,
      slammed: false
    };

    b.state = 'dunk';
    b.holder = p;
    b.shooter = p;
    b.targetSide = hoop.side;
    b.isSuper = !!isSuper;
    b.pts = isSuper ? 3 : 2;
    b.touchedRim = false;
    b.touchedBoard = false;
    b.scoredT = 0;
    p.st.shots++;
  }

  function releaseShot(match, p, isQuickTap) {
    var b = match.ball;
    if (b.holder !== p) return;
    var hoop = targetHoopOf(match, p);
    var sol = computeShotVelocity(match, p, p.charge, isQuickTap);

    b.holder = null;
    b.shooter = p;
    b.targetSide = hoop.side;
    b.state = 'shot';
    b.x = sol.sx;
    b.y = sol.sy;
    b.prevX = sol.sx;
    b.prevY = sol.sy;
    b.vx = sol.vx;
    b.vy = sol.vy;
    b.spin = -p.dir * 13;
    b.pts = sol.pts;
    b.swishAim = sol.inSweet;
    b.isSuper = false;
    b.touchedRim = false;
    b.touchedBoard = false;
    b.scoredT = 0;
    b.pickupCd = 0.24;
    if (sol.inSweet) b.fireT = Math.max(b.fireT, 1.3);

    p.charging = false;
    p.charge = 0;
    p.chargeHoldT = 0;
    p.shootAnimT = 0.34;
    p.squashX = 0.86;
    p.squashY = 1.18;
    p.st.shots++;

    // Small crisp hop on standing shot if on ground for great feel
    if (p.onGround) {
      p.vy = -310;
      p.onGround = false;
    }

    match.events.push({
      type: 'shoot',
      player: p.id,
      x: sol.sx,
      y: sol.sy,
      swishAim: sol.inSweet,
      pts: sol.pts
    });
  }

  function attemptSteal(match, p) {
    if (p.stealCd > 0 || p.stunT > 0 || p.dunk) return;
    var b = match.ball;
    var opp = match.players[1 - p.id];
    var towardOpp = opp.x >= p.x ? 1 : -1;
    p.facing = towardOpp;
    p.stealCd = 0.48;
    p.stealAnimT = 0.24;
    p.vx = towardOpp * 420;
    p.squashX = 1.18;
    p.squashY = 0.86;
    match.events.push({ type: 'lunge', player: p.id, x: p.x, y: p.y - 40 });

    if (b.holder === opp && !opp.dunk) {
      var dx = opp.x - p.x;
      var dy = opp.y - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 118 && opp.protect <= 0) {
        b.holder = p;
        b.state = 'held';
        b.pickupCd = 0;
        p.protect = 0.85;
        p.super = Math.min(100, p.super + 18);
        p.st.steals++;
        p.expr = 'happy';
        p.exprT = 0.6;

        opp.charging = false;
        opp.charge = 0;
        opp.stunT = 0.42;
        opp.vx = towardOpp * 240;
        opp.vy = -210;
        opp.onGround = false;
        opp.expr = 'dizzy';
        opp.exprT = 0.65;
        match.hitstop = 0.04;
        match.events.push({ type: 'steal', player: p.id, victim: opp.id, x: (p.x + opp.x) * 0.5, y: p.y - 54 });
      }
    }
  }

  /* --------------------------------------------------------------- AI Controller */
  function updateAI(match, p, dt) {
    var inp = p.inp;
    inp.l = false; inp.r = false; inp.j = false; inp.jPressed = false;
    inp.s = false; inp.sPressed = false; inp.sReleased = false;

    if (match.phase !== 'play' || p.stunT > 0 || p.dunk) return;

    var st = p.aiState;
    var b = match.ball;
    var opp = match.players[1 - p.id];
    var hoop = targetHoopOf(match, p);
    var ownHoop = match.hoops[p.id];
    var skill = p.aiSkill;

    st.jumpCd = Math.max(0, st.jumpCd - dt);
    st.thinkT -= dt;

    if (b.holder === p) {
      // Offense!
      var distToHoop = Math.abs(hoop.x - p.x);

      // If Super Dunk ready and in range -> go for it!
      if (p.super >= 100 && canDunk(match, p) && skill > 0.28) {
        inp.s = true;
        inp.sPressed = true;
        return;
      }

      // Close enough to dunk -> slam it!
      if (canDunk(match, p) && (distToHoop < 195 || (skill > 0.45 && distToHoop < 220))) {
        inp.s = true;
        inp.sPressed = true;
        return;
      }

      // Charging a jump shot
      if (p.charging) {
        inp.s = true;
        // Release when charge reaches chosen aim point
        if (p.charge >= st.wantCharge) {
          inp.s = false;
          inp.sReleased = true;
        }
        return;
      }

      // Advance toward target hoop
      var desiredDist = lerp(330, 175, skill);
      var goalX = hoop.x - p.dir * desiredDist;
      if (p.x < goalX - 24) inp.r = true;
      else if (p.x > goalX + 24) inp.l = true;

      // Occasional hop over defender
      if (st.jumpCd <= 0 && p.onGround && Math.abs(opp.x - p.x) < 110 && match.rng() < 0.04 + skill * 0.05) {
        inp.j = true;
        inp.jPressed = true;
        st.jumpCd = 1.1;
      }

      st.shootDelay -= dt;
      // Decide to pull up and shoot when in good range
      if (st.shootDelay <= 0 && distToHoop < 510 && distToHoop > 155) {
        // Skill controls how tight AI's charge target is around SWEET_MID (0.65)
        var errSpan = lerp(0.36, 0.07, skill);
        st.wantCharge = clamp(SWEET_MID + (match.rng() - 0.5) * errSpan, 0.25, 0.94);
        st.shootDelay = lerp(1.35, 0.52, skill);
        inp.s = true;
        inp.sPressed = true;
      }
      return;
    }

    // Defense or chasing loose ball
    if (b.state === 'shot') {
      // Try to block if shot is approaching our hoop and within reach
      var nearOwn = Math.abs(b.x - ownHoop.x) < 340;
      var targetX = nearOwn ? clamp(b.x, WALL_L + 60, WALL_R - 60) : (b.x + ownHoop.x) * 0.5;
      if (p.x < targetX - 20) inp.r = true;
      else if (p.x > targetX + 20) inp.l = true;

      if (st.jumpCd <= 0 && p.onGround && Math.abs(b.x - p.x) < 88 && b.y < p.y - 40 && b.y > p.y - 230 && match.rng() < 0.05 + skill * 0.14) {
        inp.j = true;
        inp.jPressed = true;
        st.jumpCd = lerp(1.4, 0.55, skill);
      }
      return;
    }

    if (b.state === 'loose') {
      if (p.x < b.x - 16) inp.r = true;
      else if (p.x > b.x + 16) inp.l = true;
      if (st.jumpCd <= 0 && p.onGround && Math.abs(b.x - p.x) < 75 && b.y < p.y - 95) {
        inp.j = true;
        inp.jPressed = true;
        st.jumpCd = 0.7;
      }
      return;
    }

    // Opponent has ball: guard between opponent and own hoop
    if (b.holder === opp) {
      var guardX = clamp(opp.x - p.dir * lerp(95, 58, skill), WALL_L + 70, WALL_R - 70);
      if (p.x < guardX - 18) inp.r = true;
      else if (p.x > guardX + 18) inp.l = true;

      // Attempt steal when close (gentler on easy skill)
      if (p.stealCd <= 0 && opp.protect <= 0 && Math.abs(opp.x - p.x) < 100 && match.rng() < lerp(0.008, 0.06, skill)) {
        inp.s = true;
        inp.sPressed = true;
      }
      // Jump to contest if opponent is charging a shot
      if (st.jumpCd <= 0 && p.onGround && opp.charging && Math.abs(opp.x - p.x) < 150 && match.rng() < 0.02 + skill * 0.08) {
        inp.j = true;
        inp.jPressed = true;
        st.jumpCd = 1.0;
      }
    }
  }

  /* --------------------------------------------------------------- Scoring & Flow */
  function finishMatch(match, winner) {
    if (match.done) return;
    match.ended = true;
    match.done = true;
    match.phase = 'done';
    match.winner = winner;
    match.events.push({
      type: 'end',
      winner: winner,
      scores: [match.players[0].score, match.players[1].score],
      overtime: match.overtime
    });
  }

  function resetAfterGoal(match, scoredBy) {
    var b = match.ball;
    // Give inbound possession to the player who was scored on
    var receiverIdx = 1 - scoredBy;
    var p0 = match.players[0];
    var p1 = match.players[1];

    p0.x = 360; p0.y = FLOOR_Y; p0.vx = 0; p0.vy = 0; p0.onGround = true;
    p0.charging = false; p0.charge = 0; p0.dunk = null; p0.stunT = 0; p0.facing = 1;
    p1.x = 920; p1.y = FLOOR_Y; p1.vx = 0; p1.vy = 0; p1.onGround = true;
    p1.charging = false; p1.charge = 0; p1.dunk = null; p1.stunT = 0; p1.facing = -1;

    var rec = match.players[receiverIdx];
    rec.protect = 0.9;
    b.holder = rec;
    b.state = 'held';
    b.x = rec.x + rec.dir * 32;
    b.y = FLOOR_Y - BALL_R;
    b.prevX = b.x;
    b.prevY = b.y;
    b.vx = 0;
    b.vy = 0;
    b.shooter = null;
    b.isSuper = false;
    b.scoredT = 0;
    b.pickupCd = 0;
    b.fireT = 0;
  }

  function startOvertimeTipOff(match) {
    match.overtime = true;
    match.timeUp = false;
    match.time = 0;
    match.phase = 'play';
    var p0 = match.players[0], p1 = match.players[1];
    p0.x = 420; p0.y = FLOOR_Y; p0.vx = 0; p0.vy = 0; p0.onGround = true; p0.charging = false; p0.dunk = null;
    p1.x = 860; p1.y = FLOOR_Y; p1.vx = 0; p1.vy = 0; p1.onGround = true; p1.charging = false; p1.dunk = null;

    var b = match.ball;
    b.holder = null;
    b.state = 'loose';
    b.x = COURT_W * 0.5;
    b.y = 210;
    b.prevX = b.x;
    b.prevY = b.y;
    b.vx = 0;
    b.vy = -120;
    b.scoredT = 0;
    b.pickupCd = 0;
    match.events.push({ type: 'overtime' });
  }

  function registerBasket(match, hoop, forcedDunk) {
    var b = match.ball;
    var scorerIdx = 1 - hoop.side;
    var scorer = match.players[scorerIdx];
    var pts = b.pts === 3 ? 3 : 2;
    var isDunk = !!forcedDunk || b.state === 'dunk' || (b.shooter === scorer && b.isSuper);
    var isSwish = !isDunk && !b.touchedRim && !b.touchedBoard;

    scorer.score += pts;
    scorer.st.baskets++;
    if (isDunk) scorer.st.dunks++;
    if (isSwish) scorer.st.swishes++;
    if (pts === 3 && !b.isSuper) scorer.st.threes++;

    // Super meter refill (not when this basket itself was a Super Dunk)
    if (!b.isSuper) {
      var gain = isSwish ? 28 : isDunk ? 22 : 18;
      scorer.super = Math.min(100, scorer.super + gain);
    }

    scorer.expr = 'happy';
    scorer.exprT = 1.1;
    match.players[1 - scorerIdx].expr = 'sad';
    match.players[1 - scorerIdx].exprT = 0.8;

    b.scoredT = 0.85;
    b.vx *= 0.32;
    b.vy = Math.max(b.vy * 0.55, 190);
    hoop.netVel = (b.vx >= 0 ? 1 : -1) * 14 + (isSwish ? 9 : 5);
    hoop.glowT = 1.15;
    if (isDunk) hoop.rimBend = b.isSuper ? 1.0 : 0.65;

    match.lastScorer = scorerIdx;
    match.flashT = 0.45;
    match.flashSide = scorerIdx;
    match.crowdExcite = 1.0;
    match.hitstop = b.isSuper ? 0.08 : isDunk ? 0.05 : 0.03;

    match.events.push({
      type: 'score',
      scorer: scorerIdx,
      pts: pts,
      swish: isSwish,
      dunk: isDunk,
      isSuper: !!b.isSuper,
      x: hoop.x,
      y: hoop.y,
      buzzer: !!match.timeUp
    });

    // Check immediate match-ending conditions
    var s0 = match.players[0].score;
    var s1 = match.players[1].score;
    var reachedTarget = match.target > 0 && scorer.score >= match.target;

    if (match.overtime || reachedTarget) {
      match.ended = true;
      match.winner = scorerIdx;
      match.phase = 'goal';
      match.phaseT = GOAL_TIME;
      return;
    }

    if (match.timeUp) {
      if (s0 !== s1) {
        match.ended = true;
        match.winner = s0 > s1 ? 0 : 1;
      }
      // If tied after buzzer beater, stay not-ended -> overtime starts after goal celebration!
      match.phase = 'goal';
      match.phaseT = GOAL_TIME;
      return;
    }

    match.phase = 'goal';
    match.phaseT = GOAL_TIME;
  }

  /* --------------------------------------------------------------- Physics Substep */
  function collideRimPin(b, px, py, pinR, hoop, match) {
    var dx = b.x - px;
    var dy = b.y - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minD = b.r + pinR;
    if (dist < minD && dist > 0.0001) {
      var nx = dx / dist;
      var ny = dy / dist;
      b.x = px + nx * minD;
      b.y = py + ny * minD;
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        var rest = 0.62;
        b.vx -= (1 + rest) * vn * nx;
        b.vy -= (1 + rest) * vn * ny;
        b.vx *= 0.92;
        b.spin = clamp(b.spin + nx * 6, -18, 18);
        b.touchedRim = true;
        hoop.rimBend = Math.max(hoop.rimBend, 0.28);
        match.events.push({ type: 'rim', x: px, y: py, power: clamp(-vn / 600, 0.15, 1) });
      }
    }
  }

  function stepBallSub(match, dt) {
    var b = match.ball;
    if (b.holder) return;

    b.prevX = b.x;
    b.prevY = b.y;
    b.vy += BALL_G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += b.spin * dt;
    b.spin *= Math.pow(0.96, dt * 60);

    // Ceiling & Side Walls
    if (b.y - b.r < CEIL_Y) {
      b.y = CEIL_Y + b.r;
      if (b.vy < 0) b.vy = -b.vy * 0.65;
    }
    if (b.x - b.r < WALL_L) {
      b.x = WALL_L + b.r;
      if (b.vx < 0) b.vx = -b.vx * 0.72;
    } else if (b.x + b.r > WALL_R) {
      b.x = WALL_R - b.r;
      if (b.vx > 0) b.vx = -b.vx * 0.72;
    }

    // Floor bounce
    if (b.y + b.r >= FLOOR_Y) {
      b.y = FLOOR_Y - b.r;
      if (b.vy > 95) {
        match.events.push({ type: 'bounce', x: b.x, y: FLOOR_Y, power: clamp(b.vy / 850, 0.15, 1) });
        b.vy = -b.vy * 0.72;
        b.vx *= 0.88;
        b.spin = b.vx * 0.04;
      } else {
        b.vy = 0;
        b.vx *= 0.92;
      }
      if (b.state === 'shot' && b.scoredT <= 0) {
        var missedBy = b.shooter ? b.shooter.id : -1;
        b.state = 'loose';
        b.fireT = 0;
        if (missedBy >= 0) match.events.push({ type: 'miss', player: missedBy, x: b.x, y: FLOOR_Y });
      }
    }

    // Hoops: Backboards, Rim Pins, and Basket Scoring Plane
    for (var i = 0; i < 2; i++) {
      var h = match.hoops[i];

      // Backboard vertical plate
      if (b.y + b.r > h.boardTop && b.y - b.r < h.boardBot) {
        if (h.side === 0) {
          // Left backboard faces right (+x)
          if (b.x - b.r < h.boardX && b.prevX - b.r >= h.boardX - 18) {
            b.x = h.boardX + b.r;
            if (b.vx < 0) {
              b.vx = -b.vx * 0.72;
              b.vy *= 0.88;
              b.touchedBoard = true;
              match.events.push({ type: 'board', x: h.boardX, y: b.y, power: clamp(Math.abs(b.vx) / 550, 0.2, 1) });
            }
          }
        } else {
          // Right backboard faces left (-x)
          if (b.x + b.r > h.boardX && b.prevX + b.r <= h.boardX + 18) {
            b.x = h.boardX - b.r;
            if (b.vx > 0) {
              b.vx = -b.vx * 0.72;
              b.vy *= 0.88;
              b.touchedBoard = true;
              match.events.push({ type: 'board', x: h.boardX, y: b.y, power: clamp(Math.abs(b.vx) / 550, 0.2, 1) });
            }
          }
        }
      }

      // Left & Right rim pin collisions (skip while ball is cleanly inside scoring funnel post-score)
      if (b.scoredT <= 0) {
        collideRimPin(b, h.x - h.rimR, h.y, 5.5, h, match);
        collideRimPin(b, h.x + h.rimR, h.y, 5.5, h, match);
      }

      // Basket Detection: ball crosses rim plane downward inside rim opening
      if (b.scoredT <= 0 && match.phase === 'play' && b.vy > 0) {
        var scoreY = h.y + 4;
        if (b.prevY <= scoreY && b.y >= scoreY && Math.abs(b.x - h.x) <= h.rimR - 4) {
          registerBasket(match, h);
        }
      }
    }
  }

  /* --------------------------------------------------------------- Player Step */
  function stepPlayer(match, p, dt) {
    var b = match.ball;
    var inp = p.inp;

    p.stealCd = Math.max(0, p.stealCd - dt);
    p.stealAnimT = Math.max(0, p.stealAnimT - dt);
    p.shootAnimT = Math.max(0, p.shootAnimT - dt);
    p.protect = Math.max(0, p.protect - dt);
    p.stunT = Math.max(0, p.stunT - dt);
    p.exprT = Math.max(0, p.exprT - dt);
    if (p.exprT <= 0) p.expr = 'normal';

    // Relax squash & stretch back to (1, 1)
    p.squashX += (1 - p.squashX) * Math.min(1, dt * 14);
    p.squashY += (1 - p.squashY) * Math.min(1, dt * 14);

    // Passive gentle Super Meter trickle during active play
    if (match.phase === 'play' && p.super < 100) {
      p.super = Math.min(100, p.super + 3.2 * dt);
    }

    // Active Flying Slam Dunk animation
    if (p.dunk) {
      var dk = p.dunk;
      dk.t += dt;
      var u = clamp(dk.t / dk.dur, 0, 1);
      // Smooth quad Bezier arc to the rim
      var inv = 1 - u;
      var mx = (dk.sx + dk.ex) * 0.5;
      p.x = inv * inv * dk.sx + 2 * inv * u * mx + u * u * dk.ex;
      p.y = inv * inv * dk.sy + 2 * inv * u * dk.peak + u * u * dk.ey;
      p.vx = (dk.ex - dk.sx) / dk.dur;
      p.vy = 0;
      p.facing = p.dir;

      var hoop = targetHoopOf(match, p);
      if (b.holder === p) {
        b.x = p.x + p.dir * 26;
        b.y = p.y - 84 - Math.sin(u * Math.PI) * 28;
        b.prevX = b.x;
        b.prevY = b.y;
      }

      if (u >= 1 && !dk.slammed) {
        dk.slammed = true;
        b.holder = null;
        b.state = 'shot';
        b.x = hoop.x;
        b.y = hoop.y - 8;
        b.prevX = hoop.x;
        b.prevY = hoop.y - 16;
        b.vx = p.dir * 25;
        b.vy = 540;
        b.isSuper = dk.isSuper;
        b.pts = dk.isSuper ? 3 : 2;
        b.touchedRim = true;
        p.dunk = null;
        p.vx = -p.dir * 120;
        p.vy = -120;
        p.onGround = false;
        p.squashX = 1.24;
        p.squashY = 0.78;
        registerBasket(match, hoop, true);
      }
      return;
    }

    // Horizontal Movement (100% full speed even while charging a shot!)
    var moveDir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (p.stunT > 0) moveDir = 0;

    var maxSpd = MAX_SPEED * p.speedMul;
    if (moveDir !== 0) {
      var accel = p.onGround ? 3200 : 2100;
      p.vx = clamp(p.vx + moveDir * accel * dt, -maxSpd, maxSpd);
      p.facing = moveDir;
      if (p.onGround) p.runPhase += dt * (Math.abs(p.vx) * 0.042);
    } else if (p.stealAnimT <= 0) {
      var drag = p.onGround ? 2600 : 520;
      if (Math.abs(p.vx) <= drag * dt) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * drag * dt;
    }

    // Jump with Coyote Time & Jump Buffer
    if (p.onGround) p.coyoteT = 0.09;
    else p.coyoteT = Math.max(0, p.coyoteT - dt);

    if (inp.jPressed && p.stunT <= 0) p.jumpBuf = 0.10;
    else p.jumpBuf = Math.max(0, p.jumpBuf - dt);

    if (p.jumpBuf > 0 && p.coyoteT > 0 && match.phase === 'play') {
      p.vy = JUMP_VY * p.jumpMul;
      p.onGround = false;
      p.coyoteT = 0;
      p.jumpBuf = 0;
      p.squashX = 0.80;
      p.squashY = 1.24;
      match.events.push({ type: 'jump', player: p.id, x: p.x, y: p.y });
    }

    // Integrate player position
    p.vy += PLAYER_G * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.y >= FLOOR_Y) {
      if (!p.onGround && p.vy > 220) {
        p.squashX = 1.18;
        p.squashY = 0.84;
        match.events.push({ type: 'land', player: p.id, x: p.x, y: FLOOR_Y, power: clamp(p.vy / 900, 0.2, 1) });
      }
      p.y = FLOOR_Y;
      p.vy = 0;
      p.onGround = true;
    }
    p.x = clamp(p.x, WALL_L + PLAYER_R, WALL_R - PLAYER_R);

    // Shooting / Dunking / Stealing actions during active play
    if (match.phase === 'play' && p.stunT <= 0) {
      if (b.holder === p) {
        if (inp.sPressed) {
          // Check instant Super Dunk or Slam Dunk first!
          if (canDunk(match, p)) {
            startDunk(match, p, p.super >= 100);
            return;
          }
          // Otherwise start charging the shooting timing gauge!
          p.charging = true;
          p.charge = 0.04;
          p.chargeDir = 1;
          p.chargeHoldT = 0;
        } else if (p.charging) {
          if (inp.s) {
            p.chargeHoldT += dt;
            p.charge += p.chargeDir * CHARGE_RATE * dt;
            if (p.charge >= 1) { p.charge = 1; p.chargeDir = -1; }
            else if (p.charge <= 0.12) { p.charge = 0.12; p.chargeDir = 1; }
          } else {
            // Released shoot!
            releaseShot(match, p, p.chargeHoldT < 0.14);
          }
        }
      } else {
        p.charging = false;
        p.charge = 0;
        if (inp.sPressed) {
          attemptSteal(match, p);
        }
      }
    } else {
      p.charging = false;
      p.charge = 0;
    }
  }

  /* --------------------------------------------------------------- Interactions */
  function resolvePlayerCollisions(match) {
    var p0 = match.players[0];
    var p1 = match.players[1];
    if (p0.dunk || p1.dunk) return;

    var dx = p1.x - p0.x;
    var dy = (p1.y - 48) - (p0.y - 48);
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minD = PLAYER_R * 2 - 4;
    if (dist < minD && dist > 0.001) {
      var nx = dx / dist;
      var overlap = (minD - dist) * 0.5;
      p0.x = clamp(p0.x - nx * overlap, WALL_L + PLAYER_R, WALL_R - PLAYER_R);
      p1.x = clamp(p1.x + nx * overlap, WALL_L + PLAYER_R, WALL_R - PLAYER_R);
      // Playful bouncy bump in the air
      if (!p0.onGround && !p1.onGround) {
        p0.vx -= nx * 120;
        p1.vx += nx * 120;
      }
    }
  }

  function resolveBallPlayerInteractions(match, dt) {
    var b = match.ball;
    if (b.holder) {
      var p = b.holder;
      if (!p.dunk) {
        // Rhythmic cartoon dribble bounce while holding the ball!
        var prevPhase = p.dribblePhase;
        p.dribblePhase += dt * (p.charging ? 3.5 : 8.5);
        var sinPrev = Math.abs(Math.sin(prevPhase));
        var sinNow = Math.abs(Math.sin(p.dribblePhase));
        var handX = p.x + p.dir * 34;
        var handY = p.y - 54;
        var bounceY = p.charging ? (p.y - 76) : (p.onGround ? lerp(FLOOR_Y - b.r, handY, sinNow) : handY);
        b.prevX = b.x;
        b.prevY = b.y;
        b.x = handX;
        b.y = bounceY;
        b.vx = p.vx;
        b.vy = 0;
        b.angle += p.vx * dt * 0.04;
        if (p.onGround && !p.charging && sinPrev > 0.18 && sinNow <= 0.18) {
          match.events.push({ type: 'dribble', player: p.id, x: b.x, y: FLOOR_Y });
        }
      }
      return;
    }

    // Loose ball pickup or Airborne Shot Block!
    for (var i = 0; i < 2; i++) {
      var pl = match.players[i];
      if (pl.stunT > 0 || pl.dunk) continue;
      var cx = pl.x;
      var cy = pl.y - 54;
      var dx = b.x - cx;
      var dy = b.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Block opponent's shot in mid-air!
      if (b.state === 'shot' && b.shooter && b.shooter !== pl && b.scoredT <= 0) {
        if (!pl.onGround && dist < PLAYER_R + b.r + 14 && b.y < FLOOR_Y - 110) {
          b.vx = pl.dir * 390 + pl.vx * 0.4;
          b.vy = -340;
          b.state = 'loose';
          b.shooter = null;
          b.fireT = 0;
          b.pickupCd = 0.20;
          pl.super = Math.min(100, pl.super + 24);
          pl.st.blocks++;
          pl.expr = 'happy';
          pl.exprT = 0.7;
          match.hitstop = 0.05;
          match.events.push({ type: 'block', player: pl.id, x: b.x, y: b.y });
          return;
        }
      }

      // Pickup loose ball (or rebound after shot hits rim/floor)
      if (b.state === 'loose' && b.pickupCd <= 0 && b.scoredT <= 0 && dist < PLAYER_R + b.r + 10) {
        b.holder = pl;
        b.state = 'held';
        b.fireT = 0;
        pl.protect = 0.55;
        match.events.push({ type: 'pickup', player: pl.id, x: b.x, y: b.y });
        return;
      }
    }
  }

  /* --------------------------------------------------------------- Main Step */
  function stepMatch(match, dt, externalInputs) {
    match.events.length = 0;
    if (match.done) return match.events;

    dt = clamp(dt || FIXED_DT, 0, 0.05);
    match.elapsed += dt;

    // Brief hitstop freeze for juicy impact on dunks/blocks/steals
    if (match.hitstop > 0) {
      match.hitstop = Math.max(0, match.hitstop - dt);
      return match.events;
    }

    // Decay visual effect timers
    match.flashT = Math.max(0, match.flashT - dt);
    match.crowdExcite = Math.max(0, match.crowdExcite - dt * 0.9);
    match.ball.scoredT = Math.max(0, match.ball.scoredT - dt);
    match.ball.pickupCd = Math.max(0, match.ball.pickupCd - dt);
    match.ball.fireT = Math.max(0, match.ball.fireT - dt);

    // Update net sway spring & rim flex on both hoops
    for (var hi = 0; hi < 2; hi++) {
      var hp = match.hoops[hi];
      var acc = -hp.netSway * 55 - hp.netVel * 5.2;
      hp.netVel += acc * dt;
      hp.netSway = clamp(hp.netSway + hp.netVel * dt, -1.6, 1.6);
      hp.rimBend = Math.max(0, hp.rimBend - dt * 3.8);
      hp.glowT = Math.max(0, hp.glowT - dt);
    }

    // Intro tip-off countdown
    if (match.phase === 'intro') {
      match.phaseT -= dt;
      stepBallSub(match, dt * 0.5);
      stepBallSub(match, dt * 0.5);
      if (match.phaseT <= 0) {
        match.phase = 'play';
        match.events.push({ type: 'tipoff' });
      }
      return match.events;
    }

    // Goal celebration phase
    if (match.phase === 'goal') {
      match.phaseT -= dt;
      stepBallSub(match, dt * 0.5);
      stepBallSub(match, dt * 0.5);
      for (var gi = 0; gi < 2; gi++) {
        var gp = match.players[gi];
        gp.inp.l = false; gp.inp.r = false; gp.inp.j = false; gp.inp.jPressed = false;
        gp.inp.s = false; gp.inp.sPressed = false; gp.inp.sReleased = false;
        stepPlayer(match, gp, dt);
      }
      if (match.phaseT <= 0) {
        if (match.ended) {
          finishMatch(match, match.winner);
        } else if (match.timeUp && match.players[0].score === match.players[1].score) {
          startOvertimeTipOff(match);
        } else if (match.timeUp) {
          finishMatch(match, match.players[0].score > match.players[1].score ? 0 : 1);
        } else {
          match.phase = 'play';
          resetAfterGoal(match, match.lastScorer);
        }
      }
      return match.events;
    }

    // Active play phase: apply human / AI inputs
    for (var pi = 0; pi < 2; pi++) {
      var pl = match.players[pi];
      if (pl.ctrl === 'ai') {
        updateAI(match, pl, dt);
      } else if (externalInputs && externalInputs[pi]) {
        var ext = externalInputs[pi];
        pl.inp.l = !!ext.l;
        pl.inp.r = !!ext.r;
        pl.inp.j = !!ext.j;
        pl.inp.jPressed = !!ext.jPressed;
        pl.inp.s = !!ext.s;
        pl.inp.sPressed = !!ext.sPressed;
        pl.inp.sReleased = !!ext.sReleased;
      }
    }

    // Regulation clock & buzzer-beater handling
    if (!match.overtime && !match.timeUp) {
      match.time = Math.max(0, match.time - dt);
      if (match.time <= 0) {
        match.timeUp = true;
        match.events.push({ type: 'buzzer' });
      }
    }

    // Step players & resolve collisions
    stepPlayer(match, match.players[0], dt);
    stepPlayer(match, match.players[1], dt);
    resolvePlayerCollisions(match);

    // Sub-stepped ball physics (2 substeps prevent rim/backboard tunneling!)
    if (!match.ball.holder) {
      stepBallSub(match, dt * 0.5);
      if (match.phase === 'play' && !match.ball.holder) stepBallSub(match, dt * 0.5);
    }
    resolveBallPlayerInteractions(match, dt);

    // Resolve buzzer-beater end once any in-flight shot/dunk finishes!
    if (match.timeUp && match.phase === 'play') {
      var shotInFlight = match.ball.state === 'shot' || !!match.players[0].dunk || !!match.players[1].dunk;
      if (!shotInFlight) {
        var s0 = match.players[0].score;
        var s1 = match.players[1].score;
        if (s0 === s1) {
          startOvertimeTipOff(match);
        } else {
          finishMatch(match, s0 > s1 ? 0 : 1);
        }
      }
    }

    return match.events;
  }

  var api = {
    COURT_W: COURT_W,
    COURT_H: COURT_H,
    FLOOR_Y: FLOOR_Y,
    CEIL_Y: CEIL_Y,
    WALL_L: WALL_L,
    WALL_R: WALL_R,
    FIXED_DT: FIXED_DT,
    BALL_R: BALL_R,
    BALL_G: BALL_G,
    PLAYER_R: PLAYER_R,
    PLAYER_H: PLAYER_H,
    THREE_PT_DIST: THREE_PT_DIST,
    SWEET_MIN: SWEET_MIN,
    SWEET_MAX: SWEET_MAX,
    SWEET_MID: SWEET_MID,
    MATCH_SECONDS: MATCH_SECONDS,
    HOOPS_SPEC: HOOPS_SPEC,
    OPPONENTS: OPPONENTS,
    HEADS: HEADS,
    BALLS: BALLS,
    clamp: clamp,
    lerp: lerp,
    headById: headById,
    ballById: ballById,
    defaultSave: defaultSave,
    loadSave: loadSave,
    totalStars: totalStars,
    buyOrEquipHead: buyOrEquipHead,
    buyOrEquipBall: buyOrEquipBall,
    computeRewards: computeRewards,
    applyMatchResult: applyMatchResult,
    createMatch: createMatch,
    computeShotVelocity: computeShotVelocity,
    computeShotPreview: computeShotPreview,
    canDunk: canDunk,
    stepMatch: stepMatch
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HoopHeadsEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
