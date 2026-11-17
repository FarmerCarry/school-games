/*
 * Lucky Lake (بحيرة الحظ) — Pure Arcade Monster & Treasure Fishing Simulation
 * Dual export: CommonJS (Node tests) + window.LLEngine (browser).
 * Zero DOM, zero network, zero timers, zero unseeded randomness.
 */
(function (root) {
  'use strict';

  var W = 1280, H = 720, WATER_Y = 175, FLOOR_Y = 678, BOAT_Y = 166, TURRET_Y = 186, TRIP_SECONDS = 75;

  var WATERS = [
    { idx: 0, id: 'reef', name: 'بحيرة القرية', sub: 'شعاب المرجان المشمسة', starsGoal: [300, 650, 1100], sky: ['#4cc9f0', '#caf0f8'], water: ['#15b8eb', '#0962a8', '#042a5c'], floor: '#ebca7e', accent: '#ff9f1c', hazardKind: 'jelly' },
    { idx: 1, id: 'pirate', name: 'خليج القراصنة', sub: 'حطام سفن الدبلون', starsGoal: [360, 780, 1300], sky: ['#ff8c42', '#ffe396'], water: ['#139e9c', '#0a5366', '#042233'], floor: '#cfa363', accent: '#ffd166', hazardKind: 'mine' },
    { idx: 2, id: 'magma', name: 'بركان الأعماق', sub: 'خنادق الحمم المتوهجة', starsGoal: [420, 900, 1500], sky: ['#42163b', '#e85d35'], water: ['#821d30', '#420d26', '#1b0614'], floor: '#45202b', accent: '#ff5722', hazardKind: 'mine' },
    { idx: 3, id: 'arctic', name: 'بحر الجليد', sub: 'كهوف الجليد والكريستال', starsGoal: [460, 1000, 1680], sky: ['#1b3b73', '#80f5ea'], water: ['#1b8fdb', '#0d498a', '#061f47'], floor: '#c4ebff', accent: '#5ce1e6', hazardKind: 'jelly' },
    { idx: 4, id: 'cyber', name: 'خندق الفضاء', sub: 'هاوية النيون الفضائية', starsGoal: [520, 1120, 1880], sky: ['#150830', '#621b9e'], water: ['#291366', '#14083b', '#07031c'], floor: '#2e165c', accent: '#f72585', hazardKind: 'mine' }
  ];

  var SPECIES = [
    // Water 0: Sunny Reef
    { id: 'lightning_fish', water: 0, name: 'سمكة البرق', kind: 'fish', score: 45, coins: 10, weight: 18, speed: 125, r: 22, depth: [0.08, 0.38], rarity: 1, boss: false, color: '#ffbe0b', color2: '#fb5607' },
    { id: 'gold_crab', water: 0, name: 'السلطعون الذهبي', kind: 'crab', score: 75, coins: 18, weight: 28, speed: 68, r: 25, depth: [0.86, 0.94], rarity: 1, boss: false, color: '#ffd166', color2: '#ef476f' },
    { id: 'reef_chest', water: 0, name: 'صندوق الكنز', kind: 'chest', score: 120, coins: 32, weight: 45, speed: 0, r: 28, depth: [0.90, 0.95], rarity: 2, boss: false, color: '#ffb703', color2: '#8d5524' },
    { id: 'turbo_shark', water: 0, name: 'قرش التيربو', kind: 'shark', score: 165, coins: 40, weight: 85, speed: 150, r: 34, depth: [0.40, 0.74], rarity: 2, boss: false, color: '#2ec4b6', color2: '#cbf3f0' },
    { id: 'reef_boss', water: 0, name: 'قرش المرجان العملاق', kind: 'boss_shark', score: 380, coins: 95, weight: 320, speed: 105, r: 50, depth: [0.72, 0.86], rarity: 3, boss: true, color: '#ff4d6d', color2: '#ffd166' },
    // Water 1: Pirate Shipwreck
    { id: 'sword_fish', water: 1, name: 'سمكة السيف', kind: 'sword', score: 55, coins: 12, weight: 32, speed: 145, r: 24, depth: [0.10, 0.42], rarity: 1, boss: false, color: '#38bdf8', color2: '#e0f2fe' },
    { id: 'pirate_chest', water: 1, name: 'صندوق الدبلون', kind: 'chest', score: 140, coins: 38, weight: 52, speed: 0, r: 29, depth: [0.90, 0.95], rarity: 2, boss: false, color: '#f59e0b', color2: '#5c2d16' },
    { id: 'treasure_sub', water: 1, name: 'غواصة الكنز', kind: 'sub', score: 180, coins: 45, weight: 95, speed: 105, r: 32, depth: [0.36, 0.68], rarity: 2, boss: false, color: '#ffd166', color2: '#118ab2' },
    { id: 'hammer_shark', water: 1, name: 'قرش المطرقة', kind: 'shark', score: 200, coins: 50, weight: 110, speed: 155, r: 35, depth: [0.46, 0.78], rarity: 2, boss: false, color: '#4ea8de', color2: '#f8f9fa' },
    { id: 'pirate_boss', water: 1, name: 'أخطبوط السفينة الشبح', kind: 'boss_octo', score: 450, coins: 115, weight: 390, speed: 98, r: 52, depth: [0.70, 0.85], rarity: 3, boss: true, color: '#9b5de5', color2: '#00f5d4' },
    // Water 2: Magma Trench
    { id: 'magma_eel', water: 2, name: 'ثعبان الحمم', kind: 'eel', score: 65, coins: 15, weight: 26, speed: 138, r: 23, depth: [0.12, 0.44], rarity: 1, boss: false, color: '#ff6b35', color2: '#ffe66d' },
    { id: 'ruby_chest', water: 2, name: 'صندوق الياقوت', kind: 'chest', score: 160, coins: 42, weight: 58, speed: 0, r: 29, depth: [0.90, 0.95], rarity: 2, boss: false, color: '#ff2a5f', color2: '#ffd166' },
    { id: 'spark_angler', water: 2, name: 'سمكة الصاعقة', kind: 'fish', score: 185, coins: 46, weight: 74, speed: 120, r: 28, depth: [0.38, 0.68], rarity: 2, boss: false, color: '#f77f00', color2: '#fcbf49' },
    { id: 'armored_whale', water: 2, name: 'الحوت المدرّع', kind: 'whale', score: 235, coins: 58, weight: 180, speed: 96, r: 40, depth: [0.50, 0.78], rarity: 2, boss: false, color: '#e63946', color2: '#ffb703' },
    { id: 'magma_boss', water: 2, name: 'تنين الحمم البركاني', kind: 'boss_dragon', score: 520, coins: 135, weight: 460, speed: 112, r: 54, depth: [0.70, 0.85], rarity: 3, boss: true, color: '#ff4800', color2: '#ffdd00' },
    // Water 3: Arctic Glacier
    { id: 'frost_fish', water: 3, name: 'سمكة الصقيع', kind: 'fish', score: 70, coins: 16, weight: 30, speed: 142, r: 23, depth: [0.10, 0.40], rarity: 1, boss: false, color: '#72efdd', color2: '#ffffff' },
    { id: 'crystal_chest', water: 3, name: 'خزنة الكريستال', kind: 'chest', score: 175, coins: 46, weight: 62, speed: 0, r: 29, depth: [0.90, 0.95], rarity: 2, boss: false, color: '#48cae4', color2: '#caf0f8' },
    { id: 'turbo_narwhal', water: 3, name: 'كركدن البحر التيربو', kind: 'sword', score: 215, coins: 54, weight: 135, speed: 152, r: 34, depth: [0.34, 0.66], rarity: 2, boss: false, color: '#56cfe1', color2: '#ffd166' },
    { id: 'neon_octo', water: 3, name: 'أخطبوط النيون', kind: 'octo', score: 245, coins: 60, weight: 120, speed: 108, r: 33, depth: [0.48, 0.78], rarity: 2, boss: false, color: '#00bbf9', color2: '#f15bb5' },
    { id: 'arctic_boss', water: 3, name: 'الحوت الآلي الجليدي', kind: 'boss_whale', score: 580, coins: 155, weight: 520, speed: 108, r: 55, depth: [0.70, 0.85], rarity: 3, boss: true, color: '#00f5d4', color2: '#fee440' },
    // Water 4: Cyber Abyss
    { id: 'laser_fish', water: 4, name: 'سمكة الليزر', kind: 'fish', score: 80, coins: 18, weight: 34, speed: 155, r: 23, depth: [0.10, 0.40], rarity: 1, boss: false, color: '#f72585', color2: '#4cc9f0' },
    { id: 'plasma_chest', water: 4, name: 'نواة البلازما', kind: 'chest', score: 195, coins: 52, weight: 68, speed: 0, r: 30, depth: [0.90, 0.95], rarity: 2, boss: false, color: '#b5179e', color2: '#4cc9f0' },
    { id: 'cyber_sub', water: 4, name: 'غواصة الليزر', kind: 'sub', score: 240, coins: 60, weight: 115, speed: 122, r: 33, depth: [0.34, 0.65], rarity: 2, boss: false, color: '#4361ee', color2: '#00f5d4' },
    { id: 'robo_shark', water: 4, name: 'قرش النيون الآلي', kind: 'shark', score: 280, coins: 68, weight: 160, speed: 165, r: 36, depth: [0.46, 0.78], rarity: 2, boss: false, color: '#7209b7', color2: '#4cc9f0' },
    { id: 'cyber_boss', water: 4, name: 'التنين البحري', kind: 'boss_dragon', score: 660, coins: 185, weight: 640, speed: 118, r: 56, depth: [0.70, 0.85], rarity: 3, boss: true, color: '#f72585', color2: '#00f5d4' }
  ];

  var SPECIES_BY_ID = {};
  for (var si = 0; si < SPECIES.length; si++) {
    SPECIES[si].idx = si;
    SPECIES_BY_ID[SPECIES[si].id] = SPECIES[si];
  }

  var BOATS = [
    { idx: 0, id: 'starter', name: 'قارب الصياد', desc: 'متوازن وسهل التوجيه', cost: 0, speedMul: 1.0, castMul: 1.0, coinMul: 1.0, tugBonus: 0, magBonus: 0, color: '#00a8e8' },
    { idx: 1, id: 'rocket', name: 'زورق الصاروخ', desc: 'سرعة نفاثة وإطلاق صاروخي +25%', cost: 120, speedMul: 1.32, castMul: 1.25, coinMul: 1.08, tugBonus: 0.03, magBonus: 4, color: '#ff4d6d' },
    { idx: 2, id: 'pirate', name: 'سفينة القرصان', desc: 'غنائم ذهب إضافية +25% ومخلب عريض', cost: 250, speedMul: 1.15, castMul: 1.15, coinMul: 1.25, tugBonus: 0.05, magBonus: 10, color: '#f4a261' },
    { idx: 3, id: 'shark', name: 'غواصة القرش', desc: 'سحب زعماء خارق +35% وذهب مضاعف!', cost: 420, speedMul: 1.38, castMul: 1.32, coinMul: 1.35, tugBonus: 0.09, magBonus: 15, color: '#7209b7' }
  ];

  var UPGRADES = {
    magnet: { id: 'magnet', name: 'مغناطيس الخطاف', desc: 'يجذب الأسماك والكنوز تلقائياً', costs: [60, 140, 250], max: 3 },
    reel: { id: 'reel', name: 'بكرة التيربو', desc: 'سحب صاروخي وقوة ضد الزعماء', costs: [70, 150, 270], max: 3 },
    shock: { id: 'shock', name: 'صاعق الألغام', desc: 'يفجّر القناديل والألغام إلى عملات!', costs: [90, 190, 310], max: 3 }
  };

  var DIFFS = {
    easy: { id: 'easy', name: 'سهل', magBase: 42, hazardCount: 1, hazardSafe: true, speedMul: 0.78, starMul: 0.72, comboStep: 0.15, tugStart: 0.46, tugAuto: 0.24, tugTap: 0.14, tugHold: 0.34, tugPull: 0.08 },
    normal: { id: 'normal', name: 'متوسط', magBase: 24, hazardCount: 2, hazardSafe: false, speedMul: 1.0, starMul: 1.0, comboStep: 0.2, tugStart: 0.36, tugAuto: 0.0, tugTap: 0.13, tugHold: 0.31, tugPull: 0.16 },
    hero: { id: 'hero', name: 'بطل', magBase: 15, hazardCount: 3, hazardSafe: false, speedMul: 1.26, starMul: 1.18, comboStep: 0.3, tugStart: 0.30, tugAuto: 0.0, tugTap: 0.12, tugHold: 0.28, tugPull: 0.22 }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function rand(world) {
    var s = (world.rng + 0x6d2b79f5) | 0;
    world.rng = s >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randRange(world, a, b) { return a + rand(world) * (b - a); }

  function freshSave() {
    var waters = [];
    for (var i = 0; i < WATERS.length; i++) waters.push({ stars: 0, best: 0, boss: false });
    return { v: 3, coins: 0, boat: 0, boats: [true, false, false, false], upgrades: { magnet: 0, reel: 0, shock: 0 }, waters: waters, book: {}, totalCaught: 0 };
  }

  function cleanInt(v, min, max, fallback) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
    return clamp(Math.floor(v), min, max);
  }

  function loadSave(raw) {
    var base = freshSave();
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { return base; }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 3) return base;

    base.coins = cleanInt(raw.coins, 0, 9999999, 0);
    base.totalCaught = cleanInt(raw.totalCaught, 0, 9999999, 0);
    if (Array.isArray(raw.boats)) {
      for (var bi = 1; bi < BOATS.length; bi++) base.boats[bi] = !!raw.boats[bi];
    }
    var selBoat = cleanInt(raw.boat, 0, BOATS.length - 1, 0);
    base.boat = base.boats[selBoat] ? selBoat : 0;

    if (raw.upgrades && typeof raw.upgrades === 'object') {
      base.upgrades.magnet = cleanInt(raw.upgrades.magnet, 0, 3, 0);
      base.upgrades.reel = cleanInt(raw.upgrades.reel, 0, 3, 0);
      base.upgrades.shock = cleanInt(raw.upgrades.shock, 0, 3, 0);
    }
    if (Array.isArray(raw.waters)) {
      for (var wi = 0; wi < WATERS.length; wi++) {
        var rw = raw.waters[wi];
        if (rw && typeof rw === 'object') {
          base.waters[wi].stars = cleanInt(rw.stars, 0, 3, 0);
          base.waters[wi].best = cleanInt(rw.best, 0, 9999999, 0);
          base.waters[wi].boss = !!rw.boss;
        }
      }
    }
    if (raw.book && typeof raw.book === 'object' && !Array.isArray(raw.book)) {
      for (var k = 0; k < SPECIES.length; k++) {
        var id = SPECIES[k].id, entry = raw.book[id];
        if (entry && typeof entry === 'object') {
          var cnt = cleanInt(entry.count, 0, 999999, 0);
          var mw = cleanInt(entry.maxWeight, 0, 999999, 0);
          if (cnt > 0) base.book[id] = { count: cnt, maxWeight: Math.max(1, mw) };
        }
      }
    }
    return base;
  }

  function gearStats(save, diffKey, ddaLevel) {
    var s = save || freshSave();
    var boat = BOATS[s.boat] || BOATS[0];
    var u = s.upgrades || { magnet: 0, reel: 0, shock: 0 };
    var d = DIFFS[diffKey] || DIFFS.normal;
    var dda = typeof ddaLevel === 'number' && Number.isFinite(ddaLevel) ? clamp(ddaLevel, 0, 1) : 0.35;
    var ddaMag = (0.5 - dda) * 14;
    return {
      boatIdx: boat.idx,
      boatSpeed: 390 * boat.speedMul,
      castSpeed: 760 * boat.castMul * (1 + u.reel * 0.18),
      haulSpeed: 640 * boat.castMul * (1 + u.reel * 0.22),
      retractSpeed: 960 * (1 + u.reel * 0.16),
      magRadius: Math.max(10, d.magBase + boat.magBonus + u.magnet * 13 + ddaMag),
      coinMul: boat.coinMul,
      shockLevel: u.shock | 0,
      tugStart: d.tugStart,
      tugAuto: d.tugAuto,
      tugTap: d.tugTap + boat.tugBonus * 0.5 + u.reel * 0.018,
      tugHold: d.tugHold + boat.tugBonus + u.reel * 0.045,
      tugPull: d.tugPull * (0.86 + dda * 0.26)
    };
  }

  function buyBoat(save, boatIdx) {
    var b = BOATS[boatIdx];
    if (!b) return false;
    if (save.boats[boatIdx]) { save.boat = boatIdx; return true; }
    if (save.coins < b.cost) return false;
    save.coins -= b.cost;
    save.boats[boatIdx] = true;
    save.boat = boatIdx;
    return true;
  }

  function buyUpgrade(save, key) {
    var def = UPGRADES[key];
    if (!def) return false;
    var lvl = save.upgrades[key] | 0;
    if (lvl >= def.max || save.coins < def.costs[lvl]) return false;
    save.coins -= def.costs[lvl];
    save.upgrades[key] = lvl + 1;
    return true;
  }

  function recordCatch(save, specId, weight, coins) {
    save.coins = Math.max(0, (save.coins | 0) + (coins | 0));
    save.totalCaught = (save.totalCaught | 0) + 1;
    if (specId && SPECIES_BY_ID[specId]) {
      var prev = save.book[specId];
      if (!prev) save.book[specId] = { count: 1, maxWeight: Math.max(1, weight | 0) };
      else { prev.count += 1; if (weight > prev.maxWeight) prev.maxWeight = weight | 0; }
    }
  }

  function starThresholds(world) {
    var w = WATERS[world.water] || WATERS[0];
    var d = DIFFS[world.diff] || DIFFS.normal;
    var mul = d.starMul * (world.mode === 'coop' ? 1.4 : 1.0);
    return [
      Math.round((w.starsGoal[0] * mul) / 10) * 10,
      Math.round((w.starsGoal[1] * mul) / 10) * 10,
      Math.round((w.starsGoal[2] * mul) / 10) * 10
    ];
  }

  function tripStars(world) {
    var goals = world.goals || starThresholds(world), sc = world.score;
    return sc >= goals[2] ? 3 : sc >= goals[1] ? 2 : sc >= goals[0] ? 1 : 0;
  }

  function versusWinner(world) {
    if (!world.players[1]) return 1;
    var p1 = world.players[0], p2 = world.players[1];
    if (p1.score !== p2.score) return p1.score > p2.score ? 1 : 2;
    if (p1.catches !== p2.catches) return p1.catches > p2.catches ? 1 : 2;
    return 0;
  }

  function recordTripEnd(save, world) {
    var wRec = save.waters[world.water];
    if (!wRec) return 0;
    var st = world.mode === 'versus' ? 0 : tripStars(world);
    if (st > wRec.stars) wRec.stars = st;
    if (world.score > wRec.best) wRec.best = world.score;
    if (world.bossCaught) wRec.boss = true;
    return st;
  }

  function depthY(frac) { return Math.round(WATER_Y + 42 + frac * (FLOOR_Y - WATER_Y - 56)); }

  function speciesForWater(waterIdx) {
    var out = [];
    for (var i = 0; i < SPECIES.length; i++) if (SPECIES[i].water === waterIdx) out.push(SPECIES[i]);
    return out;
  }

  function spawnSpecies(world, spec, customX, customY) {
    var d = DIFFS[world.diff] || DIFFS.normal;
    var dir = rand(world) < 0.5 ? -1 : 1;
    var y = customY != null ? customY : depthY(randRange(world, spec.depth[0], spec.depth[1]));
    var x = customX != null ? customX : randRange(world, 110, W - 110);
    var wVar = Math.max(1, Math.round(spec.weight * randRange(world, 0.85, 1.25)));
    var spd = spec.speed * d.speedMul * randRange(world, 0.9, 1.12);
    var ent = {
      id: ++world.nextId, specId: spec.id, name: spec.name, kind: spec.kind,
      x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, baseY: Math.round(y * 10) / 10,
      vx: dir * spd, vy: 0, dir: dir, r: spec.r, score: spec.score, coins: spec.coins, weight: wVar,
      boss: !!spec.boss, hazard: false, pearl: false, color: spec.color, color2: spec.color2,
      phase: Math.round(rand(world) * 628) / 100
    };
    world.fish.push(ent);
    return ent;
  }

  function spawnPearl(world, customX, customY) {
    var dir = rand(world) < 0.5 ? -1 : 1;
    var y = customY != null ? customY : depthY(randRange(world, 0.16, 0.52));
    var x = customX != null ? customX : randRange(world, 160, W - 160);
    var ent = {
      id: ++world.nextId, specId: 'pearl', name: 'لؤلؤة الكومبو', kind: 'pearl',
      x: x, y: y, baseY: y, vx: dir * 52, vy: 0, dir: dir, r: 20, score: 65, coins: 16, weight: 5,
      boss: false, hazard: false, pearl: true, color: '#fff0f6', color2: '#72efdd',
      phase: Math.round(rand(world) * 628) / 100
    };
    world.fish.push(ent);
    return ent;
  }

  function spawnHazard(world, customX, customY) {
    var w = WATERS[world.water] || WATERS[0], d = DIFFS[world.diff] || DIFFS.normal;
    var isJelly = w.hazardKind === 'jelly', dir = rand(world) < 0.5 ? -1 : 1;
    var y = customY != null ? customY : depthY(randRange(world, 0.30, 0.66));
    var x = customX != null ? customX : randRange(world, 150, W - 150);
    var ent = {
      id: ++world.nextId, specId: isJelly ? 'jelly' : 'mine',
      name: isJelly ? 'قنديل الكهرباء' : 'لغم مائي', kind: isJelly ? 'jelly' : 'mine',
      x: x, y: y, baseY: y, vx: dir * (isJelly ? 68 : 48) * d.speedMul, vy: 0, dir: dir,
      r: 22, score: 0, coins: 0, weight: 0, boss: false, hazard: true, pearl: false,
      color: isJelly ? '#e0aaff' : '#495057', color2: isJelly ? '#48cae4' : '#ff4d6d',
      phase: Math.round(rand(world) * 628) / 100
    };
    world.fish.push(ent);
    return ent;
  }

  function makePlayer(idx, x) {
    return {
      idx: idx, x: x, vx: 0, aimAngle: Math.PI / 2, aimX: x, aimY: 470, state: 'ready',
      casts: 0, catches: 0, score: 0, coins: 0, streak: 0, bestStreak: 0,
      cooldown: 0, stunTimer: 0, hook: { x: x, y: TURRET_Y, vx: 0, vy: 0 }, carrying: null, tug: null
    };
  }

  function populateInitial(world) {
    var list = speciesForWater(world.water), regulars = [], chests = [], bossSpec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].boss) bossSpec = list[i];
      else if (list[i].kind === 'chest') chests.push(list[i]);
      else regulars.push(list[i]);
    }
    for (var k = 0; k < 9; k++) {
      spawnSpecies(world, regulars[k % regulars.length], 120 + ((k + 0.5) / 9) * (W - 240));
    }
    if (chests.length) {
      spawnSpecies(world, chests[0], randRange(world, 220, 520));
      spawnSpecies(world, chests[0], randRange(world, 760, 1060));
    }
    spawnPearl(world, randRange(world, 380, 900));
    var d = DIFFS[world.diff] || DIFFS.normal;
    for (var h = 0; h < d.hazardCount; h++) {
      spawnHazard(world, 240 + ((h + 0.5) / Math.max(1, d.hazardCount)) * (W - 480));
    }
    if (bossSpec) { spawnSpecies(world, bossSpec, 640); world.bossCooldown = 16; }
  }

  function createWorld(opts) {
    opts = opts || {};
    var water = cleanInt(opts.water, 0, WATERS.length - 1, 0);
    var mode = opts.mode === 'versus' || opts.mode === 'coop' ? opts.mode : 'solo';
    var diff = DIFFS[opts.diff] ? opts.diff : 'normal';
    var seed = ((opts.seed != null ? opts.seed : 20261116) >>> 0) || 1;
    var gear = gearStats(opts.save || freshSave(), diff, opts.ddaLevel);
    var players = mode === 'solo' ? [makePlayer(0, 640)] : [makePlayer(0, 420), makePlayer(1, 860)];
    var world = {
      water: water, waterId: WATERS[water].id, mode: mode, diff: diff, freeFish: !!opts.freeFish,
      rng: seed, nextId: 0, time: 0, timeLeft: opts.freeFish ? 9999 : TRIP_SECONDS, duration: TRIP_SECONDS,
      trip: 0, score: 0, coins: 0, bossCaught: false, bossCooldown: 12, spawnTimer: 1.8, over: false,
      gear: gear, goals: [0, 0, 0], players: players, fish: [], events: []
    };
    world.goals = starThresholds(world);
    if (!opts.empty) populateInitial(world);
    return world;
  }

  function awardCatch(world, p, item, x, y, evType) {
    var d = DIFFS[world.diff] || DIFFS.normal;
    p.streak += 1;
    if (p.streak > p.bestStreak) p.bestStreak = p.streak;
    p.catches += 1;
    world.trip += 1;
    var mult = 1 + Math.min(4, p.streak - 1) * d.comboStep;
    var pts = Math.round(item.score * mult);
    var cns = Math.max(1, Math.round(item.coins * world.gear.coinMul * (1 + Math.min(3, p.streak - 1) * 0.1)));
    p.score += pts; p.coins += cns;
    world.score += pts; world.coins += cns;
    if (item.boss) world.bossCaught = true;
    world.events.push({
      type: evType || (item.boss ? 'bossLanded' : 'catch'), player: p.idx,
      specId: item.specId, name: item.name, kind: item.kind, boss: !!item.boss,
      weight: item.weight || 10, score: pts, coins: cns, streak: p.streak, x: x, y: y
    });
  }

  function launchHook(world, p) {
    p.casts += 1;
    p.state = 'cast';
    p.hook.x = p.x; p.hook.y = TURRET_Y;
    p.hook.vx = Math.cos(p.aimAngle) * world.gear.castSpeed;
    p.hook.vy = Math.sin(p.aimAngle) * world.gear.castSpeed;
    world.events.push({ type: 'cast', player: p.idx, x: p.hook.x, y: p.hook.y, angle: p.aimAngle });
  }

  function maintainEcosystem(world, dt) {
    world.spawnTimer -= dt;
    if (world.bossCooldown > 0) world.bossCooldown = Math.max(0, world.bossCooldown - dt);
    if (world.spawnTimer > 0) return;
    world.spawnTimer = 1.6;

    var regularCount = 0, chestCount = 0, pearlCount = 0, hazardCount = 0, hasBoss = false;
    for (var i = 0; i < world.fish.length; i++) {
      var f = world.fish[i];
      if (f.boss) hasBoss = true;
      else if (f.pearl) pearlCount++;
      else if (f.hazard) hazardCount++;
      else if (f.kind === 'chest') chestCount++;
      else regularCount++;
    }
    for (var pi = 0; pi < world.players.length; pi++) {
      if (world.players[pi].carrying && world.players[pi].carrying.boss) hasBoss = true;
    }

    var list = speciesForWater(world.water), regulars = [], chestSpec = null, bossSpec = null;
    for (var j = 0; j < list.length; j++) {
      if (list[j].boss) bossSpec = list[j];
      else if (list[j].kind === 'chest') chestSpec = list[j];
      else regulars.push(list[j]);
    }

    if (regularCount < 9 && regulars.length) {
      var sp = regulars[Math.floor(rand(world) * regulars.length)];
      var fromLeft = rand(world) < 0.5;
      var ent = spawnSpecies(world, sp, fromLeft ? 50 : W - 50);
      ent.dir = fromLeft ? 1 : -1;
      ent.vx = Math.abs(ent.vx) * ent.dir;
    }
    if (chestCount < 2 && chestSpec && rand(world) < 0.55) spawnSpecies(world, chestSpec, randRange(world, 150, W - 150));
    if (pearlCount < 1 && rand(world) < 0.38) spawnPearl(world);
    var d = DIFFS[world.diff] || DIFFS.normal;
    if (hazardCount < d.hazardCount && rand(world) < 0.45) spawnHazard(world);
    if (!hasBoss && bossSpec && world.bossCooldown <= 0) {
      var bLeft = rand(world) < 0.5;
      var bEnt = spawnSpecies(world, bossSpec, bLeft ? 90 : W - 90);
      bEnt.dir = bLeft ? 1 : -1;
      bEnt.vx = Math.abs(bEnt.vx) * bEnt.dir;
      world.bossCooldown = 16;
      world.events.push({ type: 'bossAppear', name: bossSpec.name, x: bEnt.x, y: bEnt.y });
    }
  }

  function stepFish(world, dt) {
    for (var i = 0; i < world.fish.length; i++) {
      var f = world.fish[i];
      f.phase += dt * (f.boss ? 2.6 : 4.0);
      if (f.kind === 'chest') { f.y = f.baseY + Math.sin(f.phase * 0.6) * 2; continue; }
      f.x += f.vx * dt;
      var bobAmp = f.kind === 'crab' ? 1.5 : f.hazard ? 9 : f.boss ? 6 : 11;
      f.y = clamp(f.baseY + Math.sin(f.phase) * bobAmp, WATER_Y + 34, FLOOR_Y - f.r * 0.4);
      var margin = f.boss ? 85 : 52;
      if (f.x < margin && f.vx < 0) { f.x = margin; f.vx = -f.vx; f.dir = 1; }
      else if (f.x > W - margin && f.vx > 0) { f.x = W - margin; f.vx = -f.vx; f.dir = -1; }
    }
  }

  function stepPlayer(world, p, inp, dt) {
    inp = inp || {};
    var g = world.gear, d = DIFFS[world.diff] || DIFFS.normal;
    if (p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.stunTimer > 0) p.stunTimer = Math.max(0, p.stunTimer - dt);

    var moveX = clamp(+inp.moveX || 0, -1, 1);
    var steerFactor = p.state === 'tug' ? 0.25 : p.state === 'cast' ? 0.35 : 1.0;
    if (moveX !== 0) {
      p.vx = moveX * g.boatSpeed * steerFactor;
      p.x = clamp(p.x + p.vx * dt, 95, W - 95);
    } else if (inp.followX != null && p.state === 'ready') {
      var dxBoat = clamp(inp.followX, 95, W - 95) - p.x;
      if (Math.abs(dxBoat) > 6) {
        p.vx = clamp(dxBoat * 5, -g.boatSpeed * 0.75, g.boatSpeed * 0.75);
        p.x = clamp(p.x + p.vx * dt, 95, W - 95);
      } else p.vx = 0;
    } else {
      p.vx *= Math.max(0, 1 - dt * 10);
    }

    if (p.state === 'ready') {
      p.hook.x = p.x; p.hook.y = TURRET_Y;
      var aimTilt = clamp(+inp.aimTilt || 0, -1, 1);
      if (aimTilt !== 0) p.aimAngle = clamp(p.aimAngle + aimTilt * 1.9 * dt, 0.28, Math.PI - 0.28);
      if (inp.pointerAim && inp.pointerAim.y > WATER_Y - 24) {
        p.aimX = inp.pointerAim.x; p.aimY = inp.pointerAim.y;
        p.aimAngle = clamp(Math.atan2(Math.max(28, inp.pointerAim.y - TURRET_Y), inp.pointerAim.x - p.x), 0.22, Math.PI - 0.22);
      } else {
        p.aimX = p.x + Math.cos(p.aimAngle) * 260;
        p.aimY = TURRET_Y + Math.sin(p.aimAngle) * 260;
      }
      if (inp.clickTarget && inp.clickTarget.y > WATER_Y - 30 && p.stunTimer <= 0) {
        p.aimAngle = clamp(Math.atan2(Math.max(28, inp.clickTarget.y - TURRET_Y), inp.clickTarget.x - p.x), 0.22, Math.PI - 0.22);
        p.aimX = inp.clickTarget.x; p.aimY = inp.clickTarget.y;
        launchHook(world, p);
        return;
      }
      if ((inp.castPress || inp.castHold) && p.cooldown <= 0 && p.stunTimer <= 0) launchHook(world, p);
    } else if (p.state === 'cast') {
      p.hook.x += p.hook.vx * dt;
      p.hook.y += p.hook.vy * dt;

      if (world.mode === 'coop' && world.players.length > 1) {
        var mate = world.players[1 - p.idx];
        if (mate && mate.state === 'tug' && mate.tug && Math.hypot(p.hook.x - mate.hook.x, p.hook.y - mate.hook.y) < 64) {
          mate.tug.progress = Math.min(1, mate.tug.progress + 0.26);
          p.state = 'retract';
          world.events.push({ type: 'coopBoost', player: p.idx, x: mate.hook.x, y: mate.hook.y });
          return;
        }
      }

      for (var i = world.fish.length - 1; i >= 0; i--) {
        var f = world.fish[i], dist = Math.hypot(f.x - p.hook.x, f.y - p.hook.y);
        if (f.pearl) {
          if (dist <= f.r + 18 + g.magRadius * 0.55) { world.fish.splice(i, 1); awardCatch(world, p, f, f.x, f.y, 'pearl'); }
          continue;
        }
        if (f.hazard) {
          if (g.shockLevel > 0 && dist < f.r + g.magRadius + 16 && dist > 1) {
            f.x += ((p.hook.x - f.x) / dist) * 210 * dt;
            f.y += ((p.hook.y - f.y) / dist) * 210 * dt;
            dist = Math.hypot(f.x - p.hook.x, f.y - p.hook.y);
          }
          if (dist <= f.r + 13) {
            if (d.hazardSafe) {
              f.vx = -f.vx; f.dir = -f.dir; p.state = 'retract';
              world.events.push({ type: 'bounce', player: p.idx, x: f.x, y: f.y, name: f.name });
              return;
            }
            if (g.shockLevel > 0) {
              world.fish.splice(i, 1);
              awardCatch(world, p, { specId: null, name: f.name, kind: f.kind, boss: false, weight: 0, score: 85 * g.shockLevel, coins: 20 + g.shockLevel * 18 }, f.x, f.y, 'shockZap');
              p.state = 'retract';
              return;
            }
            world.fish.splice(i, 1);
            p.streak = 0; p.stunTimer = 0.45; p.state = 'retract';
            world.events.push({ type: 'hazardHit', player: p.idx, x: f.x, y: f.y, name: f.name });
            return;
          }
          continue;
        }
        if (dist < f.r + g.magRadius + 28 && dist > 1) {
          var pullSpd = f.boss ? 120 : 270;
          f.x += ((p.hook.x - f.x) / dist) * pullSpd * dt;
          f.y += ((p.hook.y - f.y) / dist) * pullSpd * dt;
          dist = Math.hypot(f.x - p.hook.x, f.y - p.hook.y);
        }
        if (dist <= f.r + 16 + g.magRadius * 0.42) {
          world.fish.splice(i, 1);
          p.carrying = { specId: f.specId, name: f.name, kind: f.kind, score: f.score, coins: f.coins, weight: f.weight, r: f.r, boss: f.boss, color: f.color, color2: f.color2, dir: f.dir, baseY: f.baseY };
          p.hook.x = f.x; p.hook.y = f.y;
          if (f.boss) {
            p.state = 'tug';
            p.tug = { progress: g.tugStart, timer: 2.6, maxTimer: 2.6, startY: f.y };
            world.events.push({ type: 'bossHooked', player: p.idx, x: f.x, y: f.y, name: f.name });
          } else {
            p.state = 'haul';
            world.events.push({ type: 'hooked', player: p.idx, x: f.x, y: f.y, name: f.name, kind: f.kind });
          }
          return;
        }
      }

      if (p.hook.x < 34 || p.hook.x > W - 34 || p.hook.y > FLOOR_Y - 6) {
        p.hook.x = clamp(p.hook.x, 34, W - 34);
        p.hook.y = Math.min(p.hook.y, FLOOR_Y - 6);
        p.state = 'retract';
        if (world.diff !== 'easy') p.streak = 0;
        world.events.push({ type: 'emptyCast', player: p.idx, x: p.hook.x, y: p.hook.y });
      }
    } else if (p.state === 'haul') {
      var hdx = p.x - p.hook.x, hdy = TURRET_Y - p.hook.y, hDist = Math.hypot(hdx, hdy);
      var wSlow = p.carrying ? clamp(1 - p.carrying.weight / 520, 0.62, 1.0) : 1.0;
      var stepLen = g.haulSpeed * wSlow * dt;
      if (hDist <= stepLen + 8) {
        var landed = p.carrying;
        p.carrying = null; p.hook.x = p.x; p.hook.y = TURRET_Y; p.state = 'ready'; p.cooldown = 0.14;
        if (landed) awardCatch(world, p, landed, p.x, BOAT_Y - 18);
      } else {
        p.hook.x += (hdx / hDist) * stepLen;
        p.hook.y += (hdy / hDist) * stepLen;
      }
    } else if (p.state === 'tug') {
      var tug = p.tug;
      if (!tug || !p.carrying) { p.state = 'retract'; return; }
      tug.timer -= dt;
      var boost = g.tugAuto * dt + (inp.castPress || inp.clickTarget ? g.tugTap : 0) + (inp.castHold ? g.tugHold * dt : 0);
      tug.progress = clamp(tug.progress + boost - g.tugPull * dt, 0.04, 1.0);
      p.hook.x += (p.x - p.hook.x) * Math.min(1, dt * 4.5);
      p.hook.y = tug.startY + (TURRET_Y + 34 - tug.startY) * tug.progress;

      if (tug.progress >= 1.0) {
        var bossItem = p.carrying;
        p.carrying = null; p.tug = null; p.hook.x = p.x; p.hook.y = TURRET_Y; p.state = 'ready'; p.cooldown = 0.22;
        awardCatch(world, p, bossItem, p.x, BOAT_Y - 26, 'bossLanded');
      } else if (tug.timer <= 0) {
        var esc = p.carrying, spec = SPECIES_BY_ID[esc.specId];
        if (spec) spawnSpecies(world, spec, clamp(p.hook.x, 120, W - 120), esc.baseY || depthY(0.78));
        p.carrying = null; p.tug = null; p.streak = 0; p.state = 'retract';
        world.events.push({ type: 'bossEscape', player: p.idx, x: p.hook.x, y: p.hook.y, name: esc.name });
      }
    } else if (p.state === 'retract') {
      var rx = p.x - p.hook.x, ry = TURRET_Y - p.hook.y, rDist = Math.hypot(rx, ry);
      var rStep = (p.stunTimer > 0 ? g.retractSpeed * 0.62 : g.retractSpeed) * dt;
      if (rDist <= rStep + 8) {
        p.hook.x = p.x; p.hook.y = TURRET_Y; p.state = 'ready'; p.cooldown = 0.12;
      } else {
        p.hook.x += (rx / rDist) * rStep;
        p.hook.y += (ry / rDist) * rStep;
      }
    }
  }

  function stepWorld(world, dt, inputs) {
    if (!world || world.over || !(dt > 0)) return world;
    dt = Math.min(dt, 0.1);
    inputs = inputs || [];
    world.time += dt;
    if (!world.freeFish) world.timeLeft = Math.max(0, world.duration - world.time);
    stepFish(world, dt);
    maintainEcosystem(world, dt);
    for (var i = 0; i < world.players.length; i++) stepPlayer(world, world.players[i], inputs[i], dt);
    if (!world.freeFish && world.timeLeft <= 0 && !world.over) {
      world.over = true;
      world.events.push({ type: 'tripEnd', stars: tripStars(world), winner: world.mode === 'versus' ? versusWinner(world) : 0, score: world.score, coins: world.coins });
    }
    return world;
  }

  var LLEngine = {
    W: W, H: H, WATER_Y: WATER_Y, FLOOR_Y: FLOOR_Y, BOAT_Y: BOAT_Y, TURRET_Y: TURRET_Y, TRIP_SECONDS: TRIP_SECONDS,
    WATERS: WATERS, SPECIES: SPECIES, SPECIES_BY_ID: SPECIES_BY_ID, BOATS: BOATS, UPGRADES: UPGRADES, DIFFS: DIFFS,
    freshSave: freshSave, loadSave: loadSave, gearStats: gearStats, buyBoat: buyBoat, buyUpgrade: buyUpgrade,
    recordCatch: recordCatch, recordTripEnd: recordTripEnd, starThresholds: starThresholds, tripStars: tripStars,
    versusWinner: versusWinner, speciesForWater: speciesForWater, spawnSpecies: spawnSpecies,
    spawnPearl: spawnPearl, spawnHazard: spawnHazard, createWorld: createWorld, stepWorld: stepWorld
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LLEngine;
  if (root) root.LLEngine = LLEngine;
})(typeof window !== 'undefined' ? window : null);
