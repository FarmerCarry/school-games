/* Toy Castle (قلعة الألعاب) — Pure deterministic tug-of-war simulation engine.
 * Pure headless UMD simulation (browser global + CommonJS module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ToyCastleEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LANE_MIN = -11.4;
  var LANE_MAX = 11.4;
  var LEFT_CASTLE_X = -12.4;
  var RIGHT_CASTLE_X = 12.4;
  var LEFT_GATE_X = -10.5;
  var RIGHT_GATE_X = 10.5;
  var CANNON_Y = 4.55;
  var GRAVITY = 20.0;
  var MAX_ENERGY = 100;
  var START_ENERGY = 35;
  var MAX_UNITS_PER_SIDE = 12;
  var CANNON_COOLDOWN = 1.45;
  var CANNON_DMG_UNIT = 28;
  var CANNON_DMG_CASTLE = 18;
  var CANNON_SPLASH = 2.25;
  var CRATE_BONUS_ENERGY = 25;
  var CRATE_BONUS_COINS = 10;
  var CRATE_HIT_RADIUS = 1.55;

  var UNITS = [
    {
      id: 'knight', name: 'فارس الفوم', cost: 15, hp: 58, dmg: 13,
      speed: 3.05, range: 1.15, atkCd: 0.65, cd: 0.55, radius: 0.55,
      ranged: false, splash: 0, knockback: 0.35, score: 15, scale: 1.0
    },
    {
      id: 'blaster', name: 'رامي السهام', cost: 25, hp: 44, dmg: 12,
      speed: 2.35, range: 5.8, atkCd: 0.92, cd: 0.85, radius: 0.52,
      ranged: true, projSpeed: 14.5, splash: 0, knockback: 0.15, score: 25, scale: 1.0
    },
    {
      id: 'dino', name: 'ديناصور الدبابة', cost: 45, hp: 155, dmg: 26,
      speed: 1.72, range: 1.38, atkCd: 1.05, cd: 1.4, radius: 0.82,
      ranged: false, splash: 0.9, knockback: 1.45, score: 45, scale: 1.25
    },
    {
      id: 'mech', name: 'العملاق الآلي', cost: 80, hp: 275, dmg: 48,
      speed: 1.28, range: 1.85, atkCd: 1.22, cd: 2.3, radius: 1.08,
      ranged: false, splash: 2.7, knockback: 2.3, score: 85, scale: 1.65
    }
  ];

  var WORLDS = [
    { id: 'carpet', name: 'سجادة اللعب', sky: 0x6fd4ff, fog: 0x9ce3ff, accent: '#2ec4b6' },
    { id: 'blocks', name: 'مملكة المكعبات', sky: 0x76b8ff, fog: 0xb6dbff, accent: '#ff9f1c' },
    { id: 'space', name: 'مكتب الفضاء', sky: 0x3b3578, fog: 0x524b9e, accent: '#9b5de5' }
  ];

  var STAGES = [
    // World 1: Playroom Carpet
    {
      id: '1-1', world: 0, num: 1, name: 'انطلاقة السجادة',
      p1Hp: 220, cpuHp: 155, p1Regen: 9.2, cpuRegen: 5.4,
      unlocks: [0, 1], cpuPool: [0, 0, 1], cpuDelay: 3.1,
      crateInterval: 10.5, boss: null, reward: 30
    },
    {
      id: '1-2', world: 0, num: 2, name: 'زحف الديناصور',
      p1Hp: 230, cpuHp: 205, p1Regen: 9.6, cpuRegen: 6.4,
      unlocks: [0, 1, 2], cpuPool: [0, 1, 2], cpuDelay: 2.6,
      crateInterval: 10.0, boss: null, reward: 40, newUnit: 2
    },
    {
      id: '1-3', world: 0, num: 3, name: 'قبطان المكعبات',
      p1Hp: 250, cpuHp: 265, p1Regen: 10.2, cpuRegen: 7.4,
      unlocks: [0, 1, 2, 3], cpuPool: [0, 1, 2], cpuDelay: 2.2,
      crateInterval: 9.5, boss: { kind: 0, hpMult: 2.4, dmgMult: 1.45, name: 'قبطان المكعبات' }, reward: 60, newUnit: 3
    },
    // World 2: Block Castle
    {
      id: '2-1', world: 1, num: 1, name: 'جسر المكعبات',
      p1Hp: 260, cpuHp: 295, p1Regen: 10.6, cpuRegen: 8.1,
      unlocks: [0, 1, 2, 3], cpuPool: [0, 1, 1, 2], cpuDelay: 2.0,
      crateInterval: 9.0, boss: null, reward: 55
    },
    {
      id: '2-2', world: 1, num: 2, name: 'قافلة الدبابات',
      p1Hp: 270, cpuHp: 335, p1Regen: 11.0, cpuRegen: 8.8,
      unlocks: [0, 1, 2, 3], cpuPool: [0, 2, 2, 1], cpuDelay: 1.85,
      crateInterval: 8.8, boss: null, reward: 65
    },
    {
      id: '2-3', world: 1, num: 3, name: 'ملك الديناصورات',
      p1Hp: 290, cpuHp: 390, p1Regen: 11.4, cpuRegen: 9.5,
      unlocks: [0, 1, 2, 3], cpuPool: [0, 1, 2, 3], cpuDelay: 1.7,
      crateInterval: 8.5, boss: { kind: 2, hpMult: 1.9, dmgMult: 1.35, name: 'ملك الديناصورات' }, reward: 85
    },
    // World 3: Space Desk
    {
      id: '3-1', world: 2, num: 1, name: 'مدار المسطرة',
      p1Hp: 300, cpuHp: 420, p1Regen: 11.8, cpuRegen: 10.1,
      unlocks: [0, 1, 2, 3], cpuPool: [1, 1, 2, 3], cpuDelay: 1.6,
      crateInterval: 8.2, boss: null, reward: 80
    },
    {
      id: '3-2', world: 2, num: 2, name: 'ثورة الآليين',
      p1Hp: 310, cpuHp: 470, p1Regen: 12.2, cpuRegen: 10.8,
      unlocks: [0, 1, 2, 3], cpuPool: [0, 1, 2, 3, 3], cpuDelay: 1.5,
      crateInterval: 8.0, boss: null, reward: 95
    },
    {
      id: '3-3', world: 2, num: 3, name: 'إمبراطور الميكا',
      p1Hp: 340, cpuHp: 540, p1Regen: 12.8, cpuRegen: 11.6,
      unlocks: [0, 1, 2, 3], cpuPool: [0, 1, 2, 3], cpuDelay: 1.35,
      crateInterval: 7.5, boss: { kind: 3, hpMult: 1.75, dmgMult: 1.3, name: 'إمبراطور الميكا' }, reward: 130
    }
  ];

  var CASTLE_SKINS = [
    { id: 'royal', name: 'القلعة الملكية', price: 0, main: 0x3b82f6, trim: 0xffcc00, roof: 0x1d4ed8, accent: '#3b82f6' },
    { id: 'candy', name: 'قلعة الحلوى', price: 60, main: 0xff6b9d, trim: 0x64dfdf, roof: 0xd93870, accent: '#ff6b9d' },
    { id: 'forest', name: 'قلعة الغابة', price: 120, main: 0x2ec4b6, trim: 0xffd166, roof: 0x15988b, accent: '#2ec4b6' },
    { id: 'volcano', name: 'قلعة البركان', price: 200, main: 0xff7b29, trim: 0xffe066, roof: 0xc93b14, accent: '#ff7b29' },
    { id: 'galaxy', name: 'قلعة المجرة', price: 320, main: 0x8b5cf6, trim: 0x38f2ff, roof: 0x4c1d95, accent: '#8b5cf6' }
  ];

  var BANNER_SKINS = [
    { id: 'star', name: 'علم النجمة', price: 0, icon: '⭐', color: 0xffd23f },
    { id: 'crown', name: 'تاج الملك', price: 80, icon: '👑', color: 0xffbe0b },
    { id: 'dino', name: 'قرن الديناصور', price: 150, icon: '🦖', color: 0x4cc9f0 },
    { id: 'rocket', name: 'صاروخ الفضاء', price: 240, icon: '🚀', color: 0xff595e },
    { id: 'trophy', name: 'كأس الأبطال', price: 360, icon: '🏆', color: 0xffd60a }
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function mulberry32(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------------- Save helpers */
  function defaultSave() {
    return {
      v: 3,
      coins: 0,
      bestScore: 0,
      stars: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      unlockedStage: 0,
      castleSkin: 0,
      bannerSkin: 0,
      ownedCastles: [1, 0, 0, 0, 0],
      ownedBanners: [1, 0, 0, 0, 0],
      wins: 0
    };
  }

  function loadSave(raw) {
    var s = defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== 3) return s;
    s.coins = Math.max(0, (raw.coins | 0));
    s.bestScore = Math.max(0, (raw.bestScore | 0));
    s.wins = Math.max(0, (raw.wins | 0));
    if (Array.isArray(raw.stars)) {
      for (var i = 0; i < STAGES.length; i++) {
        s.stars[i] = clamp(raw.stars[i] | 0, 0, 3);
      }
    }
    var derivedUnlocked = 0;
    for (var j = 0; j < STAGES.length; j++) {
      if (s.stars[j] > 0) derivedUnlocked = Math.min(STAGES.length - 1, j + 1);
    }
    s.unlockedStage = clamp(Math.max(raw.unlockedStage | 0, derivedUnlocked), 0, STAGES.length - 1);
    if (Array.isArray(raw.ownedCastles)) {
      for (var c = 0; c < CASTLE_SKINS.length; c++) s.ownedCastles[c] = c === 0 ? 1 : (raw.ownedCastles[c] ? 1 : 0);
    }
    if (Array.isArray(raw.ownedBanners)) {
      for (var b = 0; b < BANNER_SKINS.length; b++) s.ownedBanners[b] = b === 0 ? 1 : (raw.ownedBanners[b] ? 1 : 0);
    }
    var cs = raw.castleSkin | 0;
    s.castleSkin = (cs >= 0 && cs < CASTLE_SKINS.length && s.ownedCastles[cs]) ? cs : 0;
    var bs = raw.bannerSkin | 0;
    s.bannerSkin = (bs >= 0 && bs < BANNER_SKINS.length && s.ownedBanners[bs]) ? bs : 0;
    return s;
  }

  function totalStars(save) {
    var sum = 0;
    for (var i = 0; i < save.stars.length; i++) sum += save.stars[i];
    return sum;
  }

  function buyOrEquipSkin(save, kind, index) {
    var list = kind === 'castle' ? CASTLE_SKINS : BANNER_SKINS;
    var owned = kind === 'castle' ? save.ownedCastles : save.ownedBanners;
    if (index < 0 || index >= list.length) return { ok: false, reason: 'invalid' };
    if (owned[index]) {
      if (kind === 'castle') save.castleSkin = index;
      else save.bannerSkin = index;
      return { ok: true, action: 'equip' };
    }
    var price = list[index].price;
    if (save.coins < price) return { ok: false, reason: 'coins' };
    save.coins -= price;
    owned[index] = 1;
    if (kind === 'castle') save.castleSkin = index;
    else save.bannerSkin = index;
    return { ok: true, action: 'buy', spent: price };
  }

  function recordSoloResult(save, stageIndex, result) {
    var prevBest = save.bestScore;
    var isNewBest = false;
    var coinsEarned = result.coins || 0;
    save.coins += coinsEarned;
    if (result.score > save.bestScore) {
      save.bestScore = result.score;
      isNewBest = result.score > prevBest;
    }
    if (result.winner === 0) {
      save.wins += 1;
      if (result.stars > save.stars[stageIndex]) save.stars[stageIndex] = result.stars;
      if (stageIndex + 1 < STAGES.length && save.unlockedStage < stageIndex + 1) {
        save.unlockedStage = stageIndex + 1;
      }
    }
    return { isNewBest: isNewBest, coinsEarned: coinsEarned };
  }

  /* --------------------------------------------------------------- Ballistics */
  // Computes exact parabolic launch velocity from cannon muzzle to target (tx, ty).
  function solveCannonShot(side, tx, ty) {
    var sx = side === 0 ? LEFT_CASTLE_X + 0.55 : RIGHT_CASTLE_X - 0.55;
    var sy = CANNON_Y;
    var clampedTx = side === 0 ? clamp(tx, -8.5, RIGHT_CASTLE_X + 0.4) : clamp(tx, LEFT_CASTLE_X - 0.4, 8.5);
    var clampedTy = clamp(ty, 0.2, 8.6);
    var dx = clampedTx - sx;
    var dy = clampedTy - sy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var flightT = clamp(dist / 16.5, 0.36, 1.08);
    var vx = dx / flightT;
    var vy = (dy + 0.5 * GRAVITY * flightT * flightT) / flightT;
    var pitch = Math.atan2(vy, Math.abs(vx));
    return { sx: sx, sy: sy, tx: clampedTx, ty: clampedTy, vx: vx, vy: vy, flightT: flightT, pitch: pitch };
  }

  function sampleArc(side, tx, ty, steps) {
    var sol = solveCannonShot(side, tx, ty);
    var pts = [];
    var n = steps || 10;
    for (var i = 1; i <= n; i++) {
      var u = i / n;
      var t = sol.flightT * u;
      var x = sol.sx + sol.vx * t;
      var y = sol.sy + sol.vy * t - 0.5 * GRAVITY * t * t;
      pts.push({ x: x, y: Math.max(0.15, y) });
    }
    return pts;
  }

  /* --------------------------------------------------------------- Simulation */
  function create(opts) {
    opts = opts || {};
    var duo = !!opts.duo;
    var demo = !!opts.demo;
    var stageIndex = clamp(opts.stageIndex | 0, 0, STAGES.length - 1);
    var stage = STAGES[stageIndex];
    var dda = clamp(typeof opts.dda === 'number' ? opts.dda : 0.35, 0, 1);
    var rng = mulberry32(opts.seed || (stageIndex * 7919 + (duo ? 31337 : 1337)));

    // DDA subtly adapts solo enemy power & pacing (0 = gentler, 1 = spicy)
    var cpuRegenMult = (duo || demo) ? 1.0 : (0.78 + dda * 0.44);
    var cpuHpMult = (duo || demo) ? 1.0 : (0.88 + dda * 0.24);
    var cpuDelayMult = (duo || demo) ? 1.0 : (1.28 - dda * 0.45);
    var p1Regen = duo ? 10.5 : (demo ? 10.0 : stage.p1Regen);
    var p2Regen = duo ? 10.5 : (demo ? 10.0 : stage.cpuRegen * cpuRegenMult);
    var p1MaxHp = duo ? 280 : stage.p1Hp;
    var p2MaxHp = duo ? 280 : Math.round(stage.cpuHp * (0.92 + dda * 0.16));

    var unlocked0 = (duo || demo) ? [true, true, true, true] : [false, false, false, false];
    if (!duo && !demo) {
      for (var u = 0; u < stage.unlocks.length; u++) unlocked0[stage.unlocks[u]] = true;
    }

    var state = {
      id: duo ? 'duo' : stage.id,
      stageIndex: stageIndex,
      worldIndex: duo ? (opts.worldIndex != null ? clamp(opts.worldIndex | 0, 0, WORLDS.length - 1) : 1) : stage.world,
      duo: duo,
      demo: demo,
      dda: dda,
      time: 0,
      frames: 0,
      winner: -1, // -1 ongoing, 0 left/P1, 1 right/P2-CPU
      stars: 0,
      score: 0,
      coinsEarned: 0,
      nextUid: 1,
      sides: [
        {
          hp: p1MaxHp, maxHp: p1MaxHp, energy: START_ENERGY, regen: p1Regen,
          spawned: 0, defeats: 0, cannonCd: 0, cannonRecoil: 0,
          aimX: 1.5, aimY: 1.2, aimPitch: 0.48,
          cannonShots: 0, cannonHits: 0, cratesPopped: 0,
          unitCds: [0, 0, 0, 0], unlocked: unlocked0,
          hurtTimer: 0, castleShake: 0
        },
        {
          hp: p2MaxHp, maxHp: p2MaxHp, energy: duo ? START_ENERGY : 18, regen: p2Regen,
          spawned: 0, defeats: 0, cannonCd: 0, cannonRecoil: 0,
          aimX: -1.5, aimY: 1.2, aimPitch: 0.48,
          cannonShots: 0, cannonHits: 0, cratesPopped: 0,
          unitCds: [0, 0, 0, 0], unlocked: [true, true, true, true],
          hurtTimer: 0, castleShake: 0
        }
      ],
      units: [],
      corks: [],
      darts: [],
      crates: [],
      crateTimer: demo ? 5.5 : 4.2,
      crateInterval: duo ? 9.5 : stage.crateInterval,
      cpuTimer: demo ? 1.0 : Math.max(1.1, stage.cpuDelay * cpuDelayMult),
      cpuDelay: stage.cpuDelay * cpuDelayMult,
      cpuHpMult: cpuHpMult,
      cpuCannonTimer: 7.5 - stageIndex * 0.45,
      demoP1Timer: 0.9,
      bossStagesLeft: (!duo && !demo && stage.boss) ? [0.68, 0.28] : [],
      bossSpec: (!duo && !demo) ? stage.boss : null,
      bossSpawnedCount: 0,
      events: [],
      _rng: rng
    };

    // Sync initial cannon pitches
    state.sides[0].aimPitch = solveCannonShot(0, state.sides[0].aimX, state.sides[0].aimY).pitch;
    state.sides[1].aimPitch = solveCannonShot(1, state.sides[1].aimX, state.sides[1].aimY).pitch;

    return state;
  }

  function countSideUnits(st, side) {
    var n = 0;
    for (var i = 0; i < st.units.length; i++) if (st.units[i].side === side) n++;
    return n;
  }

  function canSpawn(st, side, kind) {
    if (st.winner !== -1) return false;
    var s = st.sides[side];
    var def = UNITS[kind];
    if (!s || !def) return false;
    if (!s.unlocked[kind]) return false;
    if (s.energy < def.cost) return false;
    if (s.unitCds[kind] > 0) return false;
    if (countSideUnits(st, side) >= MAX_UNITS_PER_SIDE) return false;
    return true;
  }

  function spawnUnit(st, side, kind, opts) {
    opts = opts || {};
    var free = !!opts.free;
    var isBoss = !!opts.isBoss;
    var s = st.sides[side];
    var def = UNITS[kind];
    if (!s || !def) return null;
    if (!free && !canSpawn(st, side, kind)) return null;

    if (!free) {
      s.energy -= def.cost;
      s.unitCds[kind] = def.cd;
    }
    s.spawned += 1;

    var hpMult = side === 1 && !st.duo && !st.demo ? st.cpuHpMult : 1.0;
    var dmgMult = 1.0;
    var scale = def.scale;
    if (isBoss && st.bossSpec) {
      hpMult *= st.bossSpec.hpMult;
      dmgMult *= st.bossSpec.dmgMult;
      scale *= 1.38;
    }
    var laneZ = (st._rng() - 0.5) * 1.4;
    var startX = side === 0 ? LEFT_GATE_X + 0.35 : RIGHT_GATE_X - 0.35;
    var unit = {
      uid: st.nextUid++,
      side: side,
      kind: kind,
      x: startX,
      y: 0,
      z: laneZ,
      vx: 0,
      vy: 0,
      hp: Math.round(def.hp * hpMult),
      maxHp: Math.round(def.hp * hpMult),
      dmg: Math.round(def.dmg * dmgMult),
      speed: def.speed * (isBoss ? 0.85 : 1.0),
      range: def.range * (isBoss ? 1.2 : 1.0),
      radius: def.radius * (isBoss ? 1.3 : 1.0),
      atkCd: 0,
      atkMaxCd: def.atkCd,
      atkAnim: 0,
      hurtAnim: 0,
      walkPhase: st._rng() * Math.PI * 2,
      scale: scale,
      isBoss: isBoss,
      ranged: def.ranged,
      projSpeed: def.projSpeed || 0,
      splash: def.splash || 0,
      knockback: def.knockback || 0,
      score: def.score * (isBoss ? 3 : 1)
    };
    st.units.push(unit);
    st.events.push({ type: isBoss ? 'bossSpawn' : 'spawn', side: side, kind: kind, x: unit.x, z: unit.z, uid: unit.uid });
    return unit;
  }

  function setCannonAim(st, side, tx, ty) {
    var s = st.sides[side];
    if (!s) return;
    s.aimX = side === 0 ? clamp(tx, -8.5, RIGHT_CASTLE_X + 0.3) : clamp(tx, LEFT_CASTLE_X - 0.3, 8.5);
    s.aimY = clamp(ty, 0.4, 8.5);
    s.aimPitch = solveCannonShot(side, s.aimX, s.aimY).pitch;
  }

  function nudgeCannonAim(st, side, dirX, dt) {
    var s = st.sides[side];
    if (!s || !dirX) return;
    var speed = 13.5;
    var nextX = s.aimX + dirX * speed * dt;
    nextX = side === 0 ? clamp(nextX, -8.2, RIGHT_CASTLE_X) : clamp(nextX, LEFT_CASTLE_X, 8.2);
    // Gentle vertical magnet toward any floating crate near the aimed X column!
    var targetY = 1.05;
    for (var i = 0; i < st.crates.length; i++) {
      var cr = st.crates[i];
      if (Math.abs(cr.x - nextX) < 2.2) {
        targetY = cr.y;
        break;
      }
    }
    setCannonAim(st, side, nextX, targetY);
  }

  function fireCannon(st, side) {
    if (st.winner !== -1) return false;
    var s = st.sides[side];
    if (!s || s.cannonCd > 0) return false;
    var sol = solveCannonShot(side, s.aimX, s.aimY);
    s.cannonCd = CANNON_COOLDOWN;
    s.cannonRecoil = 1.0;
    s.cannonShots += 1;
    s.aimPitch = sol.pitch;
    var cork = {
      uid: st.nextUid++,
      side: side,
      x: sol.sx,
      y: sol.sy,
      z: 0,
      vx: sol.vx,
      vy: sol.vy,
      life: 2.2,
      rot: 0
    };
    st.corks.push(cork);
    st.events.push({ type: 'cannonFire', side: side, x: sol.sx, y: sol.sy, pitch: sol.pitch });
    return true;
  }

  function spawnCrate(st) {
    if (st.crates.length >= 2) return null;
    var x = (st._rng() - 0.5) * 11.5;
    var crate = {
      uid: st.nextUid++,
      baseX: x,
      x: x,
      y: 9.8,
      z: (st._rng() - 0.5) * 0.6,
      vy: -1.15 - st._rng() * 0.3,
      swayPhase: st._rng() * Math.PI * 2,
      swayAmp: 0.7 + st._rng() * 0.45,
      energy: CRATE_BONUS_ENERGY
    };
    st.crates.push(crate);
    st.events.push({ type: 'crateSpawn', x: crate.x, y: crate.y });
    return crate;
  }

  function damageCastle(st, victimSide, dmg, attackerSide) {
    if (st.winner !== -1) return;
    var s = st.sides[victimSide];
    s.hp = Math.max(0, s.hp - dmg);
    s.hurtTimer = 0.25;
    s.castleShake = Math.min(1, s.castleShake + 0.65);
    st.events.push({ type: 'castleHit', side: victimSide, dmg: dmg, hp: s.hp, attacker: attackerSide });

    // Trigger stage boss waves at HP thresholds
    if (victimSide === 1 && st.bossSpec && st.bossStagesLeft.length > 0) {
      var ratio = s.hp / s.maxHp;
      if (ratio <= st.bossStagesLeft[0]) {
        st.bossStagesLeft.shift();
        st.bossSpawnedCount += 1;
        spawnUnit(st, 1, st.bossSpec.kind, { free: true, isBoss: true });
      }
    }

    if (s.hp <= 0) {
      finishMatch(st, attackerSide);
    }
  }

  function finishMatch(st, winnerSide) {
    if (st.winner !== -1) return;
    st.winner = winnerSide;
    var stage = STAGES[st.stageIndex];
    if (!st.duo && !st.demo) {
      if (winnerSide === 0) {
        var hpRatio = st.sides[0].hp / st.sides[0].maxHp;
        var stars = 1;
        if (hpRatio >= 0.80 || (hpRatio >= 0.62 && st.time <= 65)) stars = 3;
        else if (hpRatio >= 0.50) stars = 2;
        st.stars = stars;
        var timeBonus = Math.max(0, Math.round((120 - st.time) * 3));
        var hpBonus = Math.round(hpRatio * 200);
        st.score += 180 + timeBonus + hpBonus + stars * 80;
        st.coinsEarned += stage.reward + stars * 10;
      } else {
        st.stars = 0;
        st.coinsEarned += Math.max(8, Math.round(stage.reward * 0.25));
      }
    } else if (st.duo) {
      st.stars = 3;
      st.score += 200;
    }
    st.events.push({
      type: 'matchEnd',
      winner: winnerSide,
      stars: st.stars,
      score: st.score,
      coins: st.coinsEarned
    });
  }

  function applyUnitDamage(st, target, dmg, attackerSide, knockback, fromCannon) {
    target.hp -= dmg;
    target.hurtAnim = 0.22;
    if (knockback > 0) {
      var pushDir = attackerSide === 0 ? 1 : -1;
      target.vx += pushDir * knockback * 3.0;
      target.vy = Math.max(target.vy, 2.2 + knockback * 1.4);
    }
    st.events.push({
      type: 'unitHit', uid: target.uid, side: target.side,
      x: target.x, y: target.y + 0.8, dmg: dmg, fromCannon: !!fromCannon
    });
    if (target.hp <= 0) {
      st.sides[attackerSide].defeats += 1;
      if (attackerSide === 0 && !st.demo) {
        st.score += target.score;
        st.coinsEarned += target.isBoss ? 15 : 2;
      }
      st.events.push({
        type: 'unitDefeat', uid: target.uid, side: target.side,
        kind: target.kind, x: target.x, y: target.y + 0.6, z: target.z, isBoss: target.isBoss
      });
    }
  }

  function stepAiSide(st, side, dt) {
    var s = st.sides[side];
    if (side === 1 && !st.duo) {
      st.cpuTimer -= dt;
      if (st.cpuTimer <= 0) {
        var stage = STAGES[st.stageIndex];
        var pool = st.demo ? [0, 1, 2] : stage.cpuPool;
        // Pick an affordable unit from pool (preferring stronger units when energy allows)
        var picked = -1;
        var tries = 3;
        while (tries-- > 0) {
          var cand = pool[Math.floor(st._rng() * pool.length)];
          if (canSpawn(st, side, cand)) { picked = cand; break; }
        }
        if (picked === -1 && canSpawn(st, side, 0)) picked = 0;
        if (picked !== -1) {
          spawnUnit(st, side, picked);
          st.cpuTimer = st.demo ? (1.6 + st._rng() * 1.2) : (st.cpuDelay * (0.75 + st._rng() * 0.55));
        } else {
          st.cpuTimer = 0.5;
        }
      }

      // Rival castle occasionally fires its own cork cannon in higher stages (or demo)
      if (st.stageIndex >= 1 || st.demo) {
        st.cpuCannonTimer -= dt;
        if (st.cpuCannonTimer <= 0 && s.cannonCd <= 0) {
          // Aim at the furthest P1 unit or a parachute crate
          var bestTarget = null;
          var bestX = -999;
          for (var i = 0; i < st.units.length; i++) {
            var u = st.units[i];
            if (u.side === 0 && u.x > bestX) { bestX = u.x; bestTarget = u; }
          }
          if (bestTarget && bestX > -7.5) {
            var jitter = (st._rng() - 0.5) * (st.demo ? 2.5 : (2.8 - st.dda * 1.4));
            setCannonAim(st, 1, bestTarget.x + jitter, 0.8);
            fireCannon(st, 1);
            st.cpuCannonTimer = st.demo ? 4.5 : Math.max(3.6, 8.2 - st.stageIndex * 0.5 - st.dda * 1.8);
          } else {
            st.cpuCannonTimer = 1.6;
          }
        }
      }
    } else if (side === 0 && st.demo) {
      // Attract mode on title screen: friendly parade skirmish!
      st.demoP1Timer -= dt;
      if (st.demoP1Timer <= 0) {
        var demoKinds = [0, 1, 2, 0, 1];
        var dk = demoKinds[Math.floor(st._rng() * demoKinds.length)];
        if (canSpawn(st, 0, dk)) spawnUnit(st, 0, dk);
        else if (canSpawn(st, 0, 0)) spawnUnit(st, 0, 0);
        st.demoP1Timer = 1.65 + st._rng() * 1.1;
      }
      if (s.cannonCd <= 0 && st.crates.length > 0 && st._rng() < 0.03) {
        var cr = st.crates[0];
        setCannonAim(st, 0, cr.x, cr.y);
        fireCannon(st, 0);
      }
    }
  }

  function step(st, dt, input) {
    st.events.length = 0;
    if (st.winner !== -1) {
      // Let castle shakes/recoils decay cleanly on result screen
      for (var k = 0; k < 2; k++) {
        st.sides[k].hurtTimer = Math.max(0, st.sides[k].hurtTimer - dt);
        st.sides[k].castleShake = Math.max(0, st.sides[k].castleShake - dt * 2.5);
        st.sides[k].cannonRecoil = Math.max(0, st.sides[k].cannonRecoil - dt * 4.5);
      }
      return st.events;
    }

    st.time += dt;
    st.frames += 1;

    // Input processing (optional per-step keyboard aim nudges)
    if (input) {
      if (input.aimDir1) nudgeCannonAim(st, 0, input.aimDir1, dt);
      if (input.aimDir2) nudgeCannonAim(st, 1, input.aimDir2, dt);
    }

    // Energy regen & cooldowns
    for (var si = 0; si < 2; si++) {
      var side = st.sides[si];
      side.energy = Math.min(MAX_ENERGY, side.energy + side.regen * dt);
      side.cannonCd = Math.max(0, side.cannonCd - dt);
      side.cannonRecoil = Math.max(0, side.cannonRecoil - dt * 5.0);
      side.hurtTimer = Math.max(0, side.hurtTimer - dt);
      side.castleShake = Math.max(0, side.castleShake - dt * 3.0);
      for (var c = 0; c < 4; c++) side.unitCds[c] = Math.max(0, side.unitCds[c] - dt);
    }

    // AI & Demo spawning
    stepAiSide(st, 1, dt);
    if (st.demo) stepAiSide(st, 0, dt);

    // Demo immortality (title diorama never ends)
    if (st.demo) {
      if (st.sides[0].hp < 100) st.sides[0].hp = st.sides[0].maxHp;
      if (st.sides[1].hp < 100) st.sides[1].hp = st.sides[1].maxHp;
    }

    // Floating parachute energy crates
    st.crateTimer -= dt;
    if (st.crateTimer <= 0) {
      spawnCrate(st);
      st.crateTimer = st.crateInterval * (0.85 + st._rng() * 0.35);
    }
    for (var ci = st.crates.length - 1; ci >= 0; ci--) {
      var cr = st.crates[ci];
      cr.swayPhase += dt * 2.2;
      cr.y += cr.vy * dt;
      cr.x = cr.baseX + Math.sin(cr.swayPhase) * cr.swayAmp;
      if (cr.y <= 0.55) {
        // Touches ground: small poof & disappears
        st.events.push({ type: 'crateExpire', x: cr.x, y: 0.55 });
        st.crates.splice(ci, 1);
      }
    }

    // Update cork cannonballs
    for (var pi = st.corks.length - 1; pi >= 0; pi--) {
      var pk = st.corks[pi];
      pk.life -= dt;
      pk.vy -= GRAVITY * dt;
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      pk.rot += dt * 9.0;

      // 1) Check parachute crate pop!
      var hitCrate = false;
      for (var cj = st.crates.length - 1; cj >= 0; cj--) {
        var crate = st.crates[cj];
        var cdx = pk.x - crate.x;
        var cdy = pk.y - crate.y;
        if (cdx * cdx + cdy * cdy <= CRATE_HIT_RADIUS * CRATE_HIT_RADIUS) {
          var owner = st.sides[pk.side];
          owner.energy = Math.min(MAX_ENERGY, owner.energy + crate.energy);
          owner.cannonHits += 1;
          owner.cratesPopped += 1;
          if (pk.side === 0 && !st.demo) {
            st.score += 45;
            st.coinsEarned += CRATE_BONUS_COINS;
          }
          st.events.push({
            type: 'cratePop', side: pk.side, x: crate.x, y: crate.y,
            energy: crate.energy, coins: pk.side === 0 ? CRATE_BONUS_COINS : 0
          });
          st.crates.splice(cj, 1);
          st.corks.splice(pi, 1);
          hitCrate = true;
          break;
        }
      }
      if (hitCrate) continue;

      // 2) Direct mid-air hit on enemy unit
      var enemySide = pk.side === 0 ? 1 : 0;
      var hitUnit = false;
      for (var uj = 0; uj < st.units.length; uj++) {
        var eu = st.units[uj];
        if (eu.side !== enemySide || eu.hp <= 0) continue;
        var udx = pk.x - eu.x;
        var udy = pk.y - (eu.y + 0.85 * eu.scale);
        var hr = eu.radius + 0.65;
        if (udx * udx + udy * udy <= hr * hr) {
          hitUnit = true;
          break;
        }
      }

      // 3) Hit enemy castle directly
      var hitEnemyCastle = (enemySide === 1 && pk.x >= RIGHT_GATE_X - 0.1 && pk.y <= 5.2) ||
                           (enemySide === 0 && pk.x <= LEFT_GATE_X + 0.1 && pk.y <= 5.2);

      // 4) Ground impact or direct unit/castle hit
      if (hitUnit || hitEnemyCastle || pk.y <= 0.32 || pk.life <= 0) {
        var impactX = pk.x;
        var impactY = Math.max(0.32, pk.y);
        var landedHits = 0;
        for (var uk = 0; uk < st.units.length; uk++) {
          var u2 = st.units[uk];
          if (u2.side !== enemySide || u2.hp <= 0) continue;
          if (Math.abs(u2.x - impactX) <= CANNON_SPLASH + u2.radius * 0.5) {
            applyUnitDamage(st, u2, CANNON_DMG_UNIT, pk.side, 1.35, true);
            landedHits++;
          }
        }
        if (hitEnemyCastle || Math.abs(impactX - (enemySide === 1 ? RIGHT_GATE_X : LEFT_GATE_X)) <= 1.3) {
          damageCastle(st, enemySide, CANNON_DMG_CASTLE, pk.side);
          landedHits++;
        }
        if (landedHits > 0) {
          st.sides[pk.side].cannonHits += 1;
          if (pk.side === 0 && !st.demo) st.score += landedHits * 12;
          st.events.push({ type: 'cannonHit', side: pk.side, x: impactX, y: impactY, count: landedHits });
        } else {
          st.events.push({ type: 'cannonMiss', side: pk.side, x: impactX, y: impactY });
        }
        st.corks.splice(pi, 1);
      }
    }

    // Update ranged foam darts
    for (var di = st.darts.length - 1; di >= 0; di--) {
      var dr = st.darts[di];
      dr.life -= dt;
      dr.x += dr.vx * dt;
      var targetSide = dr.side === 0 ? 1 : 0;
      var hit = false;
      for (var du = 0; du < st.units.length; du++) {
        var tu = st.units[du];
        if (tu.side !== targetSide || tu.hp <= 0) continue;
        if (Math.abs(dr.x - tu.x) <= tu.radius + 0.35) {
          applyUnitDamage(st, tu, dr.dmg, dr.side, 0.2, false);
          hit = true;
          break;
        }
      }
      if (!hit) {
        if ((targetSide === 1 && dr.x >= RIGHT_GATE_X) || (targetSide === 0 && dr.x <= LEFT_GATE_X)) {
          damageCastle(st, targetSide, dr.dmg, dr.side);
          hit = true;
        }
      }
      if (hit || dr.life <= 0) st.darts.splice(di, 1);
    }

    // Update units: movement, knockback physics, combat
    for (var ui = 0; ui < st.units.length; ui++) {
      var u = st.units[ui];
      if (u.hp <= 0) continue;
      u.atkCd = Math.max(0, u.atkCd - dt);
      u.atkAnim = Math.max(0, u.atkAnim - dt * 3.8);
      u.hurtAnim = Math.max(0, u.hurtAnim - dt);

      // Knockback velocity + hop decay
      if (Math.abs(u.vx) > 0.05 || u.y > 0 || u.vy > 0) {
        u.x = clamp(u.x + u.vx * dt, LEFT_GATE_X + 0.2, RIGHT_GATE_X - 0.2);
        u.vx *= Math.pow(0.06, dt);
        u.vy -= GRAVITY * 0.9 * dt;
        u.y += u.vy * dt;
        if (u.y <= 0) { u.y = 0; u.vy = 0; }
      }

      // Find nearest enemy unit ahead in range
      var dir = u.side === 0 ? 1 : -1;
      var foeSide = u.side === 0 ? 1 : 0;
      var foe = null;
      var foeDist = 999;
      for (var fi = 0; fi < st.units.length; fi++) {
        var candU = st.units[fi];
        if (candU.side !== foeSide || candU.hp <= 0) continue;
        var ahead = (candU.x - u.x) * dir;
        if (ahead >= -0.45 && ahead < foeDist) {
          foeDist = ahead;
          foe = candU;
        }
      }

      var castleX = u.side === 0 ? RIGHT_GATE_X : LEFT_GATE_X;
      var castleDist = (castleX - u.x) * dir;
      var effectiveRange = u.range + (foe ? foe.radius : 0.35);

      if (foe && foeDist <= effectiveRange) {
        // Attack enemy unit
        if (u.atkCd <= 0) {
          u.atkCd = u.atkMaxCd;
          u.atkAnim = 1.0;
          if (u.ranged) {
            st.darts.push({
              uid: st.nextUid++, side: u.side,
              x: u.x + dir * 0.55, y: 0.95, z: u.z,
              vx: dir * u.projSpeed, dmg: u.dmg, life: 1.2
            });
            st.events.push({ type: 'dartFire', side: u.side, x: u.x, z: u.z });
          } else {
            if (u.splash > 0) {
              for (var si2 = 0; si2 < st.units.length; si2++) {
                var su = st.units[si2];
                if (su.side !== foeSide || su.hp <= 0) continue;
                if (Math.abs(su.x - foe.x) <= u.splash) {
                  applyUnitDamage(st, su, u.dmg, u.side, u.knockback, false);
                }
              }
            } else {
              applyUnitDamage(st, foe, u.dmg, u.side, u.knockback, false);
            }
            st.events.push({ type: 'meleeAttack', side: u.side, kind: u.kind, x: foe.x, z: foe.z });
          }
        }
      } else if (castleDist <= u.range + 0.55) {
        // Attack enemy castle!
        if (u.atkCd <= 0) {
          u.atkCd = u.atkMaxCd;
          u.atkAnim = 1.0;
          if (u.ranged) {
            st.darts.push({
              uid: st.nextUid++, side: u.side,
              x: u.x + dir * 0.55, y: 0.95, z: u.z,
              vx: dir * u.projSpeed, dmg: u.dmg, life: 1.2
            });
            st.events.push({ type: 'dartFire', side: u.side, x: u.x, z: u.z });
          } else {
            damageCastle(st, foeSide, u.dmg, u.side);
          }
        }
      } else if (u.y <= 0.02) {
        // March forward!
        u.x = clamp(u.x + dir * u.speed * dt, LEFT_GATE_X + 0.2, RIGHT_GATE_X - 0.2);
        u.walkPhase += dt * (u.speed * 4.2);
      }
    }

    // Remove defeated units
    for (var ri = st.units.length - 1; ri >= 0; ri--) {
      if (st.units[ri].hp <= 0) st.units.splice(ri, 1);
    }

    return st.events;
  }

  return {
    LANE_MIN: LANE_MIN,
    LANE_MAX: LANE_MAX,
    LEFT_CASTLE_X: LEFT_CASTLE_X,
    RIGHT_CASTLE_X: RIGHT_CASTLE_X,
    LEFT_GATE_X: LEFT_GATE_X,
    RIGHT_GATE_X: RIGHT_GATE_X,
    CANNON_Y: CANNON_Y,
    GRAVITY: GRAVITY,
    MAX_ENERGY: MAX_ENERGY,
    START_ENERGY: START_ENERGY,
    MAX_UNITS_PER_SIDE: MAX_UNITS_PER_SIDE,
    CANNON_COOLDOWN: CANNON_COOLDOWN,
    UNITS: UNITS,
    WORLDS: WORLDS,
    STAGES: STAGES,
    CASTLE_SKINS: CASTLE_SKINS,
    BANNER_SKINS: BANNER_SKINS,
    defaultSave: defaultSave,
    loadSave: loadSave,
    totalStars: totalStars,
    buyOrEquipSkin: buyOrEquipSkin,
    recordSoloResult: recordSoloResult,
    solveCannonShot: solveCannonShot,
    sampleArc: sampleArc,
    create: create,
    canSpawn: canSpawn,
    spawnUnit: spawnUnit,
    setCannonAim: setCannonAim,
    nudgeCannonAim: nudgeCannonAim,
    fireCannon: fireCannon,
    spawnCrate: spawnCrate,
    step: step
  };
});
