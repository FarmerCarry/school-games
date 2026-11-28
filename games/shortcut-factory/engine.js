/* Shortcut Factory — Toy Claw Rush! Pure deterministic simulation engine.
 * Zero DOM, zero Kit, zero Math.random. Runs identically in browser and Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SF = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 1280, H = 720;
  var RAIL_Y = 92;
  var CLAW_HOME_Y = 148;
  var FLOOR_Y = 656;
  var X_MIN = 150, X_MAX = 1130;
  var SAVE_VERSION = 2;
  var FEVER_STREAK = 3;
  var FEVER_DUR = 6.0;

  var LANES = [
    { idx: 0, y: 332, dir: 1, speedMul: 0.84, tint: '#4cc9f0' },
    { idx: 1, y: 462, dir: -1, speedMul: 1.08, tint: '#ff9f1c' },
    { idx: 2, y: 592, dir: 1, speedMul: 1.32, tint: '#ff5d8f' }
  ];

  var TOYS = {
    duck:    { id: 'duck',    name: 'بطة مطاطية',   pts: 20, coins: 12, r: 32, color: '#ffd93b' },
    bear:    { id: 'bear',    name: 'دبدوب لطيف',   pts: 28, coins: 16, r: 35, color: '#d4874d' },
    bunny:   { id: 'bunny',   name: 'أرنب قطني',    pts: 34, coins: 20, r: 34, color: '#ff99c8' },
    dino:    { id: 'dino',    name: 'ديناصور صغير', pts: 42, coins: 25, r: 36, color: '#6ad94e' },
    unicorn: { id: 'unicorn', name: 'يونيكورن نجمي', pts: 56, coins: 34, r: 37, color: '#c48bff' },
    capsule: { id: 'capsule', name: 'كبسولة مفاجآت', pts: 70, coins: 45, r: 35, special: 'capsule', color: '#38e8ff' },
    goldbot: { id: 'goldbot', name: 'روبوت ذهبي',   pts: 100, coins: 65, r: 38, special: 'goldbot', color: '#ffd23f' },
    magnet:  { id: 'magnet',  name: 'كرة المغناطيس', pts: 40, coins: 26, r: 35, special: 'magnet', color: '#00d4ff' },
    fizz:    { id: 'fizz',    name: 'صندوق الفوران', pts: 35, coins: 24, r: 35, special: 'fizz', color: '#ff7b24' },
    boot:    { id: 'boot',    name: 'حذاء مطاطي',   pts: 0,  coins: 0,  r: 31, junk: true, color: '#6b8e4e' }
  };

  var WINGS = [
    { id: 0, name: 'ورشة الدمى', bg1: '#e0f7ff', bg2: '#c2ecff', accent: '#2fb6ec' },
    { id: 1, name: 'قاعة المغناطيس', bg1: '#f0e6ff', bg2: '#d8c8ff', accent: '#9b5de5' },
    { id: 2, name: 'المصنع الذهبي', bg1: '#fff4d6', bg2: '#ffe1a1', accent: '#ff9f1c' }
  ];

  // 12 punchy 45-60s stages across 3 factory wings
  var LEVELS = [
    { idx: 0,  id: 'L1',  wing: 0, duration: 45, stars: [150, 280, 440],  beltSpeed: 135, clawSweep: 340, bootRate: 0.08, specialRate: 0.24 },
    { idx: 1,  id: 'L2',  wing: 0, duration: 45, stars: [210, 360, 540],  beltSpeed: 150, clawSweep: 360, bootRate: 0.11, specialRate: 0.26 },
    { idx: 2,  id: 'L3',  wing: 0, duration: 45, stars: [280, 450, 660],  beltSpeed: 165, clawSweep: 380, bootRate: 0.13, specialRate: 0.28 },
    { idx: 3,  id: 'L4',  wing: 0, duration: 45, stars: [350, 560, 800],  beltSpeed: 180, clawSweep: 400, bootRate: 0.15, specialRate: 0.30 },
    { idx: 4,  id: 'L5',  wing: 1, duration: 50, stars: [430, 680, 960],  beltSpeed: 195, clawSweep: 420, bootRate: 0.16, specialRate: 0.33 },
    { idx: 5,  id: 'L6',  wing: 1, duration: 50, stars: [520, 800, 1120], beltSpeed: 210, clawSweep: 440, bootRate: 0.18, specialRate: 0.35 },
    { idx: 6,  id: 'L7',  wing: 1, duration: 50, stars: [610, 940, 1300], beltSpeed: 222, clawSweep: 460, bootRate: 0.19, specialRate: 0.36 },
    { idx: 7,  id: 'L8',  wing: 1, duration: 55, stars: [720, 1100, 1500], beltSpeed: 235, clawSweep: 475, bootRate: 0.20, specialRate: 0.38 },
    { idx: 8,  id: 'L9',  wing: 2, duration: 55, stars: [840, 1260, 1720], beltSpeed: 248, clawSweep: 490, bootRate: 0.21, specialRate: 0.40 },
    { idx: 9,  id: 'L10', wing: 2, duration: 55, stars: [960, 1440, 1960], beltSpeed: 260, clawSweep: 505, bootRate: 0.22, specialRate: 0.42 },
    { idx: 10, id: 'L11', wing: 2, duration: 60, stars: [1100, 1640, 2220], beltSpeed: 272, clawSweep: 520, bootRate: 0.23, specialRate: 0.44 },
    { idx: 11, id: 'L12', wing: 2, duration: 60, stars: [1260, 1860, 2500], beltSpeed: 285, clawSweep: 535, bootRate: 0.24, specialRate: 0.46 }
  ];

  var ENDLESS_CFG = { idx: -1, id: 'endless', wing: 2, duration: 60, stars: [300, 700, 1300], beltSpeed: 185, clawSweep: 400, bootRate: 0.16, specialRate: 0.36, endless: true };

  var UPGRADES = [
    { key: 'turbo',  name: 'مخلب توربو',   icon: '⚡', desc: 'نزول وسحب أسرع',     costs: [30, 65, 110, 170, 250] },
    { key: 'grip',   name: 'قبضة واسعة',   icon: '🦾', desc: 'مساحة التقاط أكبر',  costs: [35, 75, 125, 190, 270] },
    { key: 'magnet', name: 'مغناطيس خارق', icon: '🧲', desc: 'سحب ألعاب إضافية',   costs: [40, 85, 140, 210, 290] },
    { key: 'gold',   name: 'حظ ذهبي',      icon: '🪙', desc: 'روبوتات وعملات أكثر', costs: [45, 95, 155, 230, 320] }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function nextRng(w) {
    w.rng = (w.rng + 0x6D2B79F5) >>> 0;
    var t = Math.imul(w.rng ^ (w.rng >>> 15), 1 | w.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function pickToyKind(w, laneIdx) {
    var cfg = w.cfg;
    var upg = w.upg;
    var r = nextRng(w);
    // Lane 0 is welcoming plushies; Lane 1 mixes specials & boots; Lane 2 is rich gold/specials
    var bootChance = laneIdx === 0 ? cfg.bootRate * 0.35 : (laneIdx === 1 ? cfg.bootRate : cfg.bootRate * 1.15);
    // Forgiving DDA adjustment
    bootChance *= lerp(0.72, 1.12, w.dda);
    if (w.fever > 0) bootChance *= 0.25;
    if (r < bootChance) return 'boot';

    var specChance = cfg.specialRate + upg.magnet * 0.025 + upg.gold * 0.025 + (laneIdx === 2 ? 0.14 : laneIdx === 1 ? 0.06 : -0.05);
    if (nextRng(w) < specChance) {
      var sr = nextRng(w);
      var goldWeight = 0.24 + upg.gold * 0.05 + (laneIdx === 2 ? 0.16 : 0);
      var magWeight = 0.25 + upg.magnet * 0.04;
      var fizzWeight = 0.24;
      if (sr < goldWeight) return 'goldbot';
      if (sr < goldWeight + magWeight) return 'magnet';
      if (sr < goldWeight + magWeight + fizzWeight) return 'fizz';
      return 'capsule';
    }

    // Plushies weighted by lane richness
    var pr = nextRng(w);
    if (laneIdx === 0) return pr < 0.42 ? 'duck' : (pr < 0.78 ? 'bear' : 'bunny');
    if (laneIdx === 1) return pr < 0.28 ? 'bear' : (pr < 0.62 ? 'bunny' : 'dino');
    return pr < 0.35 ? 'dino' : (pr < 0.78 ? 'unicorn' : 'goldbot');
  }

  function spawnToyOnLane(w, laneIdx, xOverride) {
    var lane = LANES[laneIdx];
    var kind = pickToyKind(w, laneIdx);
    var def = TOYS[kind];
    var x = xOverride != null ? xOverride : (lane.dir > 0 ? -48 : W + 48);
    var toy = {
      id: ++w.nextToyId,
      kind: kind,
      lane: laneIdx,
      x: x,
      y: lane.y,
      r: def.r,
      bobPhase: nextRng(w) * Math.PI * 2,
      scale: 1,
      pulled: false,
      offX: 0,
      offY: 0
    };
    w.toys.push(toy);
    return toy;
  }

  function seedConveyors(w) {
    // Populate all 3 belts right away so frame 1 is bursting with colorful toys!
    for (var li = 0; li < LANES.length; li++) {
      var spacing = li === 0 ? 225 : (li === 1 ? 215 : 230);
      for (var x = 140 + li * 45; x < W - 90; x += spacing) {
        var t = spawnToyOnLane(w, li, x + (nextRng(w) - 0.5) * 44);
        // Never put a boot dead-center on frame 1 so the kid's very first grab is guaranteed joyful!
        if (t.kind === 'boot' && Math.abs(t.x - W * 0.5) < 260) {
          t.kind = li === 2 ? 'goldbot' : (li === 1 ? 'magnet' : 'duck');
          t.r = TOYS[t.kind].r;
        }
      }
    }
  }

  function create(opts) {
    opts = opts || {};
    var endless = !!opts.endless;
    var levelIdx = endless ? -1 : clamp((opts.level | 0), 0, LEVELS.length - 1);
    var cfg = endless ? ENDLESS_CFG : LEVELS[levelIdx];
    var seed = (opts.seed != null ? opts.seed : (2027 + levelIdx * 97)) >>> 0;
    var upg = opts.upg || { turbo: 0, grip: 0, magnet: 0, gold: 0 };
    var w = {
      seed: seed,
      rng: seed || 1,
      cfg: cfg,
      level: levelIdx,
      endless: endless,
      demo: !!opts.demo,
      dda: clamp(opts.dda != null ? opts.dda : 0.32, 0, 1),
      upg: {
        turbo: clamp(upg.turbo | 0, 0, 5),
        grip: clamp(upg.grip | 0, 0, 5),
        magnet: clamp(upg.magnet | 0, 0, 5),
        gold: clamp(upg.gold | 0, 0, 5)
      },
      phase: 'play',
      time: 0,
      timeLeft: cfg.duration,
      score: 0,
      coinsEarned: 0,
      target: cfg.stars[0],
      stars: 0,
      combo: 0,
      bestCombo: 0,
      fever: 0,
      feverCount: 0,
      grabs: 0,
      drops: 0,
      misses: 0,
      bootsTossed: 0,
      atStart: true,
      over: false,
      won: false,
      nextToyId: 0,
      beltOffset: [0, 0, 0],
      spawnTimer: [0.6, 0.4, 0.5],
      toys: [],
      tossedBoots: [],
      zaps: [],
      goldRain: [],
      rainCd: 0,
      claw: {
        x: W * 0.5,
        y: CLAW_HOME_Y,
        dir: 1,
        sway: 0,
        state: 'swing', // 'swing' | 'drop' | 'clamp' | 'reel' | 'fling'
        stateT: 0,
        jaw: 1, // 1 = open, 0 = clamped
        bufT: 0,
        caught: [],
        flingBoot: false
      },
      demoThink: 0.7,
      prevPress: false,
      result: null
    };
    seedConveyors(w);
    return w;
  }

  function currentStars(w) {
    var st = w.cfg.stars;
    if (w.score >= st[2]) return 3;
    if (w.score >= st[1]) return 2;
    if (w.score >= st[0]) return 1;
    return 0;
  }

  function dropClaw(w, evs, isHuman) {
    var cl = w.claw;
    if (cl.state === 'swing') {
      cl.state = 'drop';
      cl.stateT = 0;
      cl.sway = 0;
      cl.jaw = 1;
      cl.caught = [];
      cl.flingBoot = false;
      cl.bufT = 0;
      w.drops++;
      if (isHuman) w.atStart = false;
      evs.push({ type: 'drop', x: cl.x, y: cl.y });
      return true;
    }
    // Forgiving buffer near top of reel
    if (cl.state === 'reel' && cl.y < CLAW_HOME_Y + 150) {
      cl.bufT = 0.25;
      if (isHuman) w.atStart = false;
      return true;
    }
    return false;
  }

  function triggerMagnet(w, originToy, evs) {
    var maxPull = 3 + Math.min(3, w.upg.magnet);
    var radius = 350 + w.upg.magnet * 55;
    var candidates = [];
    for (var i = 0; i < w.toys.length; i++) {
      var t = w.toys[i];
      if (t.id === originToy.id || t.pulled) continue;
      if (TOYS[t.kind].junk && w.fever <= 0) continue;
      var dx = t.x - originToy.x, dy = t.y - originToy.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius) candidates.push({ toy: t, d: d });
    }
    candidates.sort(function (a, b) { return a.d - b.d; });
    var count = Math.min(maxPull, candidates.length);
    for (var k = 0; k < count; k++) {
      var pulled = candidates[k].toy;
      pulled.pulled = true;
      var angle = ((k + 1) / (count + 1)) * Math.PI;
      pulled.offX = Math.cos(angle) * 34;
      pulled.offY = 18 + (k % 2) * 20;
      w.claw.caught.push(pulled);
      w.zaps.push({ x1: originToy.x, y1: originToy.y, x2: pulled.x, y2: pulled.y, life: 0.36, max: 0.36 });
    }
    if (count > 0) {
      evs.push({ type: 'magnet', x: originToy.x, y: originToy.y, count: count });
    }
  }

  function triggerFizz(w, originToy, evs) {
    var radius = 290 + w.upg.magnet * 28;
    var popped = 0;
    var queue = [originToy];
    var visited = {};
    visited[originToy.id] = true;
    while (queue.length) {
      var src = queue.shift();
      for (var i = w.toys.length - 1; i >= 0; i--) {
        var t = w.toys[i];
        if (visited[t.id] || t.pulled) continue;
        var dx = t.x - src.x, dy = t.y - src.y;
        if (dx * dx + dy * dy <= radius * radius) {
          var def = TOYS[t.kind];
          if (def.junk || def.special === 'fizz') {
            visited[t.id] = true;
            if (def.special === 'fizz') queue.push(t);
            w.toys.splice(i, 1);
            var mul = w.fever > 0 ? 2 : 1;
            var pts = 28 * mul;
            var coins = Math.round((20 + w.upg.gold * 4) * mul);
            w.score += pts;
            w.coinsEarned += coins;
            popped++;
            evs.push({ type: 'fizzPop', x: t.x, y: t.y, pts: pts, coins: coins });
          }
        }
      }
    }
    if (popped > 0) {
      evs.push({ type: 'fizzBlast', x: originToy.x, y: originToy.y, count: popped });
    }
  }

  function deliverCaught(w, evs) {
    var cl = w.claw;
    if (!cl.caught.length) return;
    var goldMul = 1 + w.upg.gold * 0.14;
    var feverMul = w.fever > 0 ? 2 : 1;
    var totalPts = 0, totalCoins = 0;
    var hadGood = false;

    for (var i = 0; i < cl.caught.length; i++) {
      var t = cl.caught[i];
      var def = TOYS[t.kind];
      // Remove from belt array if still present
      var idx = w.toys.indexOf(t);
      if (idx !== -1) w.toys.splice(idx, 1);

      var pts = def.junk ? 40 : def.pts;
      var coins = def.junk ? 28 : def.coins;
      var comboBonus = Math.min(4, w.combo) * 5;
      pts = Math.round((pts + comboBonus) * feverMul);
      coins = Math.round(coins * goldMul * feverMul);

      // Mystery capsule bonus!
      if (def.special === 'capsule') {
        if (!w.demo && w.timeLeft < w.cfg.duration - 8 && nextRng(w) < 0.45) {
          w.timeLeft = Math.min(w.cfg.duration + 10, w.timeLeft + 5);
          evs.push({ type: 'capsuleTime', x: cl.x, y: CLAW_HOME_Y + 12, sec: 5 });
        } else {
          pts += 35 * feverMul;
          coins += 35;
          evs.push({ type: 'capsuleJackpot', x: cl.x, y: CLAW_HOME_Y + 12, coins: 35 });
        }
      }

      totalPts += pts;
      totalCoins += coins;
      hadGood = true;
      w.grabs++;
      w.combo++;
      if (w.combo > w.bestCombo) w.bestCombo = w.combo;
    }

    w.score += totalPts;
    w.coinsEarned += totalCoins;
    w.stars = currentStars(w);
    cl.caught = [];

    evs.push({
      type: 'deliver',
      x: cl.x,
      y: CLAW_HOME_Y + 10,
      pts: totalPts,
      coins: totalCoins,
      combo: w.combo,
      fever: w.fever > 0
    });

    // Ignite 6s «جنون المصنع! 🔥» Fever Mode on 3-grab chain!
    if (hadGood && w.combo >= FEVER_STREAK && w.fever <= 0) {
      w.fever = FEVER_DUR;
      w.feverCount++;
      if (w.endless) w.timeLeft += 6;
      evs.push({ type: 'feverStart', x: cl.x, y: CLAW_HOME_Y + 30, endlessBonus: w.endless ? 6 : 0 });
    }

    // Early 3-star victory finish on normal stages so skilled kids finish punchy & fast!
    if (!w.demo && !w.endless && w.score >= w.cfg.stars[2]) {
      finishRound(w, evs);
    }
  }

  function finishRound(w, evs) {
    if (w.over) return;
    w.over = true;
    w.phase = 'over';
    w.stars = currentStars(w);
    w.won = w.endless ? true : w.stars >= 1;
    var bonusCoins = w.endless ? 0 : (w.stars * 20);
    var totalCoins = Math.max(10, w.coinsEarned + bonusCoins);
    w.result = {
      level: w.level,
      endless: w.endless,
      won: w.won,
      stars: w.stars,
      score: w.score,
      target: w.target,
      coins: totalCoins,
      grabs: w.grabs,
      bestCombo: w.bestCombo,
      feverCount: w.feverCount
    };
    evs.push({ type: 'roundEnd', result: w.result });
  }

  function stepConveyors(w, dt) {
    var speedRamp = w.endless ? (1 + Math.min(0.65, w.time * 0.008)) : 1;
    var baseSpeed = w.cfg.beltSpeed * lerp(0.84, 1.08, w.dda) * speedRamp;

    for (var li = 0; li < LANES.length; li++) {
      var lane = LANES[li];
      var vx = baseSpeed * lane.speedMul * lane.dir;
      w.beltOffset[li] = (w.beltOffset[li] + vx * dt) % 64;

      w.spawnTimer[li] -= dt;
      if (w.spawnTimer[li] <= 0) {
        // Ensure minimum clear spacing at entry chute before spawning
        var entryX = lane.dir > 0 ? -48 : W + 48;
        var clear = true;
        for (var i = 0; i < w.toys.length; i++) {
          var t = w.toys[i];
          if (!t.pulled && t.lane === li && Math.abs(t.x - entryX) < 128) { clear = false; break; }
        }
        if (clear) {
          spawnToyOnLane(w, li);
          w.spawnTimer[li] = (185 / Math.abs(vx)) * (0.78 + nextRng(w) * 0.42);
        } else {
          w.spawnTimer[li] = 0.2;
        }
      }
    }

    for (var ti = w.toys.length - 1; ti >= 0; ti--) {
      var toy = w.toys[ti];
      if (toy.pulled) continue;
      var ln = LANES[toy.lane];
      var tvx = baseSpeed * ln.speedMul * ln.dir;
      toy.x += tvx * dt;
      toy.bobPhase += dt * 4.2;
      toy.y = ln.y + Math.sin(toy.bobPhase) * 2.5;
      if (toy.x < -90 || toy.x > W + 90) {
        w.toys.splice(ti, 1);
      }
    }
  }

  function stepGoldRain(w, dt, evs) {
    if (w.fever > 0) {
      w.rainCd -= dt;
      if (w.rainCd <= 0) {
        w.rainCd = 0.22;
        w.goldRain.push({
          x: X_MIN + nextRng(w) * (X_MAX - X_MIN),
          y: RAIL_Y + 20,
          vy: 230 + nextRng(w) * 110,
          r: 18
        });
      }
    }
    var cl = w.claw;
    for (var i = w.goldRain.length - 1; i >= 0; i--) {
      var g = w.goldRain[i];
      g.y += g.vy * dt;
      var dx = g.x - cl.x, dy = g.y - (cl.y + 24);
      if (dx * dx + dy * dy < 58 * 58) {
        w.score += 18;
        w.coinsEarned += 12;
        w.stars = currentStars(w);
        evs.push({ type: 'rainCoin', x: g.x, y: g.y });
        w.goldRain.splice(i, 1);
        continue;
      }
      if (g.y > H + 30) w.goldRain.splice(i, 1);
    }
  }

  function stepClaw(w, dt, evs) {
    var cl = w.claw;
    var turboMul = 1 + w.upg.turbo * 0.16;
    var feverMul = w.fever > 0 ? 1.85 : 1;
    var speedMul = turboMul * feverMul;
    cl.bufT = Math.max(0, cl.bufT - dt);

    if (cl.state === 'swing') {
      // Smooth playful sweep along gantry rail (soft ease near ends so edges are easy!)
      var sweepSp = w.cfg.clawSweep * (1 + w.upg.turbo * 0.06) * (w.fever > 0 ? 1.25 : 1);
      var edgeDist = Math.min(cl.x - X_MIN, X_MAX - cl.x);
      var ease = clamp(0.45 + edgeDist / 120, 0.45, 1);
      cl.x += cl.dir * sweepSp * ease * dt;
      if (cl.x >= X_MAX) { cl.x = X_MAX; cl.dir = -1; }
      if (cl.x <= X_MIN) { cl.x = X_MIN; cl.dir = 1; }
      cl.y = CLAW_HOME_Y;
      cl.sway = -cl.dir * 0.14 * ease;
      cl.jaw = lerp(cl.jaw, 1, Math.min(1, dt * 12));
      if (cl.bufT > 0) {
        dropClaw(w, evs, !w.demo);
      }
      return;
    }

    if (cl.state === 'drop') {
      var dropSp = 880 * speedMul;
      cl.y += dropSp * dt;
      cl.sway = 0;

      // Forgiving grab check! Good toys ALWAYS take priority over rubber boots!
      var gripReach = 46 * (1 + w.upg.grip * 0.13);
      var bestGood = null, bestGoodD = 1e9;
      var bestBoot = null, bestBootD = 1e9;
      for (var i = 0; i < w.toys.length; i++) {
        var t = w.toys[i];
        if (t.pulled) continue;
        var dx = Math.abs(t.x - cl.x);
        var dy = Math.abs(t.y - (cl.y + 22));
        var def = TOYS[t.kind];
        if (!def.junk || w.fever > 0) {
          if (dx <= gripReach + t.r * 0.65 && dy <= 34) {
            if (dx < bestGoodD) { bestGoodD = dx; bestGood = t; }
          }
        } else {
          // Tiny forgiving boot hurtbox
          if (dx <= 22 + t.r * 0.42 && dy <= 24) {
            if (dx < bestBootD) { bestBootD = dx; bestBoot = t; }
          }
        }
      }

      if (bestGood) {
        bestGood.pulled = true;
        bestGood.offX = 0;
        bestGood.offY = 26;
        cl.caught = [bestGood];
        cl.state = 'clamp';
        cl.stateT = 0.075;
        cl.jaw = 0.15;
        var bDef = TOYS[bestGood.kind];
        evs.push({ type: 'snatch', x: bestGood.x, y: bestGood.y, kind: bestGood.kind, special: bDef.special || null });
        if (bDef.special === 'magnet') triggerMagnet(w, bestGood, evs);
        else if (bDef.special === 'fizz') triggerFizz(w, bestGood, evs);
        return;
      }

      if (bestBoot) {
        // Silly rubber boot! Fling it comically off-screen, never kills the run!
        var bi = w.toys.indexOf(bestBoot);
        if (bi !== -1) w.toys.splice(bi, 1);
        w.tossedBoots.push({
          x: bestBoot.x, y: bestBoot.y,
          vx: (cl.x < W * 0.5 ? 1 : -1) * 520,
          vy: -560,
          rot: 0, vrot: 14
        });
        w.bootsTossed++;
        w.misses++;
        w.combo = 0;
        cl.state = 'reel';
        cl.flingBoot = true;
        cl.jaw = 0.25;
        evs.push({ type: 'boot', x: bestBoot.x, y: bestBoot.y });
        return;
      }

      if (cl.y >= FLOOR_Y) {
        cl.y = FLOOR_Y;
        cl.state = 'reel';
        cl.jaw = 0.4;
        w.misses++;
        if (w.fever <= 0) w.combo = 0;
        evs.push({ type: 'miss', x: cl.x, y: cl.y });
      }
      return;
    }

    if (cl.state === 'clamp') {
      cl.stateT -= dt;
      cl.jaw = 0.12;
      for (var ci = 0; ci < cl.caught.length; ci++) {
        cl.caught[ci].x = cl.x + cl.caught[ci].offX;
        cl.caught[ci].y = cl.y + cl.caught[ci].offY;
      }
      if (cl.stateT <= 0) {
        cl.state = 'reel';
      }
      return;
    }

    if (cl.state === 'reel') {
      var emptyMul = cl.caught.length ? 1 : 1.35;
      var reelSp = 960 * speedMul * emptyMul;
      cl.y -= reelSp * dt;
      for (var ri = 0; ri < cl.caught.length; ri++) {
        cl.caught[ri].x = cl.x + cl.caught[ri].offX;
        cl.caught[ri].y = cl.y + cl.caught[ri].offY;
      }
      if (cl.y <= CLAW_HOME_Y) {
        cl.y = CLAW_HOME_Y;
        cl.state = 'swing';
        cl.jaw = 1;
        deliverCaught(w, evs);
      }
    }
  }

  function step(w, dt, input) {
    dt = clamp(dt || 0, 0, 0.05);
    input = input || {};
    var evs = [];
    if (w.over) return evs;

    w.time += dt;
    if (w.fever > 0) {
      w.fever = Math.max(0, w.fever - dt);
      if (w.fever <= 0) evs.push({ type: 'feverEnd' });
    }

    // Decay visual lightning zaps & tossed rubber boots
    for (var zi = w.zaps.length - 1; zi >= 0; zi--) {
      w.zaps[zi].life -= dt;
      if (w.zaps[zi].life <= 0) w.zaps.splice(zi, 1);
    }
    for (var bi = w.tossedBoots.length - 1; bi >= 0; bi--) {
      var b = w.tossedBoots[bi];
      b.vy += 1200 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vrot * dt;
      if (b.y > H + 100) w.tossedBoots.splice(bi, 1);
    }

    // Countdown timer
    if (!w.demo) {
      w.timeLeft = Math.max(0, w.timeLeft - dt);
      if (w.timeLeft <= 0) {
        // Wait briefly if claw is carrying a caught toy back up? No, score any carried toy cleanly!
        if (w.claw.caught.length) deliverCaught(w, evs);
        finishRound(w, evs);
        return evs;
      }
    }

    // Input processing (1-button drop!)
    var held = !!input.drop;
    var edge = (held && !w.prevPress) || !!input.dropPress;
    w.prevPress = held;

    if (w.demo) {
      w.demoThink -= dt;
      if (w.demoThink <= 0 && w.claw.state === 'swing') {
        // Drop when over any good toy for lively title attract spectacle!
        var hasTarget = w.toys.some(function (t) {
          return !TOYS[t.kind].junk && Math.abs(t.x - w.claw.x) < 42;
        });
        if (hasTarget) {
          dropClaw(w, evs, false);
          w.demoThink = 0.85;
        }
      }
    } else if (edge) {
      dropClaw(w, evs, true);
    }

    stepConveyors(w, dt);
    stepClaw(w, dt, evs);
    stepGoldRain(w, dt, evs);
    return evs;
  }

  function defaultSave() {
    return {
      v: SAVE_VERSION,
      coins: 0,
      stars: LEVELS.map(function () { return 0; }),
      best: LEVELS.map(function () { return 0; }),
      endlessBest: 0,
      upg: { turbo: 0, grip: 0, magnet: 0, gold: 0 }
    };
  }

  function loadSave(raw) {
    var d = defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return d;
    d.coins = Math.max(0, raw.coins | 0);
    d.endlessBest = Math.max(0, raw.endlessBest | 0);
    if (Array.isArray(raw.stars)) {
      for (var i = 0; i < LEVELS.length; i++) d.stars[i] = clamp(raw.stars[i] | 0, 0, 3);
    }
    if (Array.isArray(raw.best)) {
      for (var j = 0; j < LEVELS.length; j++) d.best[j] = Math.max(0, raw.best[j] | 0);
    }
    if (raw.upg && typeof raw.upg === 'object') {
      for (var k = 0; k < UPGRADES.length; k++) {
        var uk = UPGRADES[k].key;
        d.upg[uk] = clamp(raw.upg[uk] | 0, 0, 5);
      }
    }
    return d;
  }

  function isUnlocked(save, idx) {
    if (idx <= 0) return true;
    if (idx >= LEVELS.length) return false;
    return (save.stars[idx - 1] || 0) >= 1;
  }

  function nextLevel(save) {
    for (var i = 0; i < LEVELS.length; i++) {
      if ((save.stars[i] || 0) === 0) return i;
    }
    return LEVELS.length - 1;
  }

  function totalStars(save) {
    var s = 0;
    for (var i = 0; i < save.stars.length; i++) s += save.stars[i];
    return s;
  }

  function upgradeCost(save, key) {
    var def = null;
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].key === key) { def = UPGRADES[i]; break; }
    if (!def) return -1;
    var lv = save.upg[key] | 0;
    if (lv >= def.costs.length) return -1;
    return def.costs[lv];
  }

  function buyUpgrade(save, key) {
    var cost = upgradeCost(save, key);
    if (cost < 0) return 'max';
    if (save.coins < cost) return 'poor';
    save.coins -= cost;
    save.upg[key] = (save.upg[key] | 0) + 1;
    return 'buy';
  }

  function applyResult(save, res) {
    save.coins += res.coins;
    if (res.endless) {
      if (res.score > save.endlessBest) save.endlessBest = res.score;
    } else if (res.level >= 0 && res.level < LEVELS.length) {
      if (res.stars > save.stars[res.level]) save.stars[res.level] = res.stars;
      if (res.score > save.best[res.level]) save.best[res.level] = res.score;
    }
    return save;
  }

  function publicState(w, screen) {
    return {
      screen: screen,
      phase: screen === 'play' || screen === 'pause' ? w.phase : screen,
      paused: screen === 'pause',
      level: w.level,
      endless: w.endless,
      time: +w.time.toFixed(3),
      timeLeft: +w.timeLeft.toFixed(2),
      score: w.score,
      target: w.target,
      stars: w.stars,
      coins: w.coinsEarned,
      combo: w.combo,
      fever: w.fever > 0,
      feverLeft: +w.fever.toFixed(2),
      grabs: w.grabs,
      drops: w.drops,
      clawState: w.claw.state,
      clawX: Math.round(w.claw.x),
      clawY: Math.round(w.claw.y),
      toys: w.toys.length,
      atStart: w.atStart,
      won: w.won
    };
  }

  return {
    W: W, H: H, RAIL_Y: RAIL_Y, CLAW_HOME_Y: CLAW_HOME_Y, FLOOR_Y: FLOOR_Y,
    X_MIN: X_MIN, X_MAX: X_MAX,
    SAVE_VERSION: SAVE_VERSION, FEVER_STREAK: FEVER_STREAK, FEVER_DUR: FEVER_DUR,
    LANES: LANES, TOYS: TOYS, WINGS: WINGS, LEVELS: LEVELS, ENDLESS_CFG: ENDLESS_CFG, UPGRADES: UPGRADES,
    create: create,
    step: step,
    dropClaw: dropClaw,
    loadSave: loadSave,
    isUnlocked: isUnlocked,
    nextLevel: nextLevel,
    totalStars: totalStars,
    upgradeCost: upgradeCost,
    buyUpgrade: buyUpgrade,
    applyResult: applyResult,
    publicState: publicState
  };
});
