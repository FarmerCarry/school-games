/* Toy Castle: Mega-Mech & Lego-Knight Siege (قلعة الألعاب) — Pure Simulation Engine
 * Dual UMD export: window.TCEngine (browser) and module.exports (Node tests).
 * Zero DOM, zero network, zero Math.random, pure deterministic simulation. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TCEngine = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var W = 1280, H = 720, GROUND_Y = 524, AIR_Y = 224;
  var GATE_L = 166, GATE_R = 1114, PAD_X = 640;
  var CANNON_LX = 136, CANNON_RX = 1144, CANNON_Y = 264;
  var AIM_MIN = -0.95, AIM_MAX = 1.18, START_ENERGY = 35;

  var GEN_LEVELS = [
    { lv: 1, cost: 0, rate: 12.4, max: 120 },
    { lv: 2, cost: 40, rate: 18.0, max: 150 },
    { lv: 3, cost: 65, rate: 24.5, max: 180 }
  ];

  var DIFFS = {
    easy: { id: 'easy', name: 'سهل', p1Energy: 1.4, p1Hp: 1.35, aiHp: 0.8, aiEnergy: 0.68, aiThink: 1.3, aimCone: 0.58, cannonMul: 1.25, coinMul: 1.0 },
    normal: { id: 'normal', name: 'متوسط', p1Energy: 1.08, p1Hp: 1.0, aiHp: 0.96, aiEnergy: 0.88, aiThink: 1.02, aimCone: 0.36, cannonMul: 1.05, coinMul: 1.15 },
    hero: { id: 'hero', name: 'بطل', p1Energy: 1.0, p1Hp: 0.96, aiHp: 1.08, aiEnergy: 1.0, aiThink: 0.86, aimCone: 0.24, cannonMul: 1.0, coinMul: 1.35 }
  };
  var DIFF_ORDER = ['easy', 'normal', 'hero'];

  var WORLDS = [
    { id: 'knights', name: 'قلعة الفرسان', bossName: 'حارس الدروع', pad: 'none' },
    { id: 'mechs', name: 'قاعدة الآليين', bossName: 'الزعيم الآلي', pad: 'turbo' },
    { id: 'dinos', name: 'وادي الديناصورات', bossName: 'ملك الديناصورات', pad: 'lava' },
    { id: 'space', name: 'ساحة الصواريخ', bossName: 'مدمّرة المجرة', pad: 'jump' }
  ];

  var LEVELS = [
    { id: '1-1', world: 0, name: 'جسر الفرسان', hpL: 720, hpR: 430, par: 52, pool: ['sword', 'rocket'], airRate: 0, boss: false, reward: 28 },
    { id: '1-2', world: 0, name: 'منجنيق الحصن', hpL: 720, hpR: 490, par: 58, pool: ['sword', 'rocket', 'dino'], airRate: 9.5, boss: false, reward: 32 },
    { id: '1-3', world: 0, name: 'حارس الدروع', hpL: 760, hpR: 580, par: 68, pool: ['sword', 'rocket', 'dino'], airRate: 8.5, boss: true, reward: 42 },
    { id: '2-1', world: 1, name: 'ممر الليزر', hpL: 760, hpR: 550, par: 58, pool: ['sword', 'rocket', 'dino'], airRate: 8.8, boss: false, reward: 35 },
    { id: '2-2', world: 1, name: 'سرب الطائرات', hpL: 780, hpR: 620, par: 64, pool: ['sword', 'rocket', 'dino', 'mech'], airRate: 6.8, boss: false, reward: 40 },
    { id: '2-3', world: 1, name: 'الزعيم الآلي', hpL: 800, hpR: 700, par: 74, pool: ['sword', 'rocket', 'dino', 'mech'], airRate: 7.5, boss: true, reward: 50 },
    { id: '3-1', world: 2, name: 'وادي المخالب', hpL: 800, hpR: 660, par: 64, pool: ['sword', 'rocket', 'dino'], airRate: 8.2, boss: false, reward: 42 },
    { id: '3-2', world: 2, name: 'حمم البركان', hpL: 820, hpR: 730, par: 70, pool: ['sword', 'rocket', 'dino', 'mech'], airRate: 7.0, boss: false, reward: 46 },
    { id: '3-3', world: 2, name: 'ملك الديناصورات', hpL: 840, hpR: 820, par: 80, pool: ['sword', 'rocket', 'dino', 'mech'], airRate: 6.8, boss: true, reward: 58 },
    { id: '4-1', world: 3, name: 'رصيف المدار', hpL: 840, hpR: 760, par: 68, pool: ['sword', 'rocket', 'dino', 'mech'], airRate: 6.4, boss: false, reward: 50 },
    { id: '4-2', world: 3, name: 'أسطول النجوم', hpL: 860, hpR: 850, par: 76, pool: ['sword', 'rocket', 'dino', 'mech'], airRate: 5.8, boss: false, reward: 56 },
    { id: '4-3', world: 3, name: 'مدمّرة المجرة', hpL: 900, hpR: 940, par: 88, pool: ['sword', 'rocket', 'dino', 'mech'], airRate: 6.0, boss: true, reward: 72 }
  ];

  var UNIT_ORDER = ['sword', 'rocket', 'dino', 'mech'];
  var UNITS = {
    sword: { id: 'sword', name: 'محارب السيف', cost: 15, cd: 0.55, hp: 105, dmg: 23, rate: 0.62, range: 46, speed: 128, r: 20, armor: 0, hitsAir: false, flying: false, splash: 0, kb: 8, bounty: 5 },
    rocket: { id: 'rocket', name: 'رامي الصواريخ', cost: 25, cd: 0.95, hp: 84, dmg: 28, rate: 1.0, range: 245, speed: 84, r: 20, armor: 0, hitsAir: true, flying: false, splash: 38, kb: 10, proj: 'missile', bounty: 7 },
    dino: { id: 'dino', name: 'دبابة الديناصور', cost: 45, cd: 1.75, hp: 330, dmg: 35, rate: 0.98, range: 56, speed: 70, r: 28, armor: 0.2, hitsAir: false, flying: false, splash: 38, kb: 44, bounty: 11 },
    mech: { id: 'mech', name: 'العملاق الآلي', cost: 75, cd: 3.0, hp: 590, dmg: 64, rate: 1.2, range: 96, airRange: 215, speed: 58, r: 34, armor: 0.25, hitsAir: true, flying: false, splash: 84, kb: 62, proj: 'laser', bounty: 16 },
    balloon: { id: 'balloon', name: 'منطاد القنابل', cost: 30, cd: 3.0, hp: 82, dmg: 21, rate: 1.35, range: 145, speed: 60, r: 24, armor: 0, hitsAir: false, flying: true, splash: 32, kb: 6, proj: 'bomb', bounty: 10 },
    boss: { id: 'boss', name: 'الزعيم المدرّع', cost: 110, cd: 99, hp: 620, dmg: 50, rate: 1.45, range: 90, airRange: 200, speed: 40, r: 42, armor: 0.2, hitsAir: true, flying: false, splash: 78, kb: 54, proj: 'laser', bounty: 25 }
  };

  var ARMORS = [
    { id: 'cobalt', name: 'فرسان الياقوت', price: 0, main: '#1d4ed8', trim: '#fbbf24', glow: '#38bdf8', goldTrim: false },
    { id: 'cyber', name: 'درع التيتانيوم', price: 30, main: '#0f766e', trim: '#22d3ee', glow: '#67e8f9', goldTrim: false },
    { id: 'magma', name: 'لهب البركان', price: 50, main: '#b91c1c', trim: '#fb923c', glow: '#fde047', goldTrim: false },
    { id: 'emerald', name: 'زمرد الديناصور', price: 75, main: '#15803d', trim: '#a3e635', glow: '#4ade80', goldTrim: false },
    { id: 'golden', name: 'الدرع الذهبي', price: 110, main: '#6d28d9', trim: '#facc15', glow: '#fef08a', goldTrim: true }
  ];

  var CANNONS = [
    { id: 'iron', name: 'مدفع الحصن', price: 0, barrel: '#334155', tip: '#fbbf24', bolt: '#38bdf8' },
    { id: 'plasma', name: 'قاذف البلازما', price: 30, barrel: '#0284c7', tip: '#67e8f9', bolt: '#22d3ee' },
    { id: 'dragon', name: 'فكّ التنين', price: 55, barrel: '#991b1b', tip: '#f97316', bolt: '#fb923c' },
    { id: 'missile', name: 'برج الصواريخ', price: 80, barrel: '#3f6212', tip: '#a3e635', bolt: '#84cc16' },
    { id: 'nova', name: 'مدفع النجوم', price: 120, barrel: '#7e22ce', tip: '#fde047', bolt: '#facc15' }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function params(ddaLevel, diffId) {
    var d = clamp(typeof ddaLevel === 'number' && ddaLevel === ddaLevel ? ddaLevel : 0.35, 0, 1);
    var df = DIFFS[diffId] || DIFFS.normal;
    return {
      dda: d, diff: df.id,
      p1Energy: df.p1Energy * lerp(1.06, 0.96, d), p1Hp: df.p1Hp,
      aiHp: df.aiHp * lerp(0.88, 1.1, d),
      aiEnergy: df.aiEnergy * lerp(0.82, 1.06, d),
      aiThink: df.aiThink * lerp(1.18, 0.86, d),
      aimCone: df.aimCone, cannonMul: df.cannonMul, coinMul: df.coinMul
    };
  }

  function makeSide(side, hpMax, startEnergy, eMul) {
    var cds = { sword: 0, rocket: 0, dino: 0, mech: 0, balloon: 0, boss: 0 };
    return {
      side: side, hp: Math.round(hpMax), hpMax: Math.round(hpMax),
      energy: startEnergy, energyMax: GEN_LEVELS[0].max, genLv: 0, eMul: eMul,
      aim: -0.14, cannonCd: 0, shots: 0, superCharge: 0, supers: 0, cds: cds
    };
  }

  function create(levelIdx, prm, opts) {
    opts = opts || {};
    var idx = clamp(levelIdx | 0, 0, LEVELS.length - 1);
    var stg = LEVELS[idx], p = prm || params(0.35, opts.diff || 'normal');
    var startE = opts.startEnergy != null ? opts.startEnergy : START_ENERGY;
    return {
      uid: 1, humans: 1, level: idx, stage: stg, worldIdx: stg.world,
      padType: WORLDS[stg.world].pad, prm: p, rng: makeRng(opts.seed || (1337 + idx * 97)),
      t: 0, done: false, winner: 0, passiveAi: !!opts.passiveAi,
      sides: [
        makeSide(0, stg.hpL * p.p1Hp, startE, p.p1Energy),
        makeSide(1, stg.hpR * p.aiHp, 20, p.aiEnergy * (0.8 + idx * 0.024))
      ],
      spawned: [0, 0], kills: [0, 0], cratesPopped: 0, bossSpawned: false,
      aiTimer: 2.2 * p.aiThink, airTimer: stg.airRate > 0 ? stg.airRate * 0.8 : 9999,
      crateTimer: 3.6, ventTimer: 4.5, units: [], projs: [], crates: [], ev: []
    };
  }

  function createVersus(opts) {
    opts = opts || {};
    var startE = opts.startEnergy != null ? opts.startEnergy : START_ENERGY;
    var wIdx = clamp(opts.worldIdx | 0, 0, WORLDS.length - 1);
    return {
      uid: 1, humans: 2, level: 0, worldIdx: wIdx, padType: WORLDS[wIdx].pad,
      stage: { id: 'vs', world: wIdx, name: 'مواجهة القلعتين', hpL: 820, hpR: 820, par: 75, pool: UNIT_ORDER, airRate: 0, boss: false, reward: 20 },
      prm: params(0.5, 'normal'), rng: makeRng(opts.seed || 4242),
      t: 0, done: false, winner: 0, passiveAi: true,
      sides: [makeSide(0, 820, startE, 1.15), makeSide(1, 820, startE, 1.15)],
      spawned: [0, 0], kills: [0, 0], cratesPopped: 0, bossSpawned: false,
      aiTimer: 9999, airTimer: 9999, crateTimer: 5.0, ventTimer: 4.5,
      units: [], projs: [], crates: [], ev: []
    };
  }

  function summon(w, side, type, opts) {
    if (!w || w.done) return false;
    opts = opts || {};
    var def = UNITS[type], s = w.sides[side];
    if (!def || !s) return false;
    if (!opts.free) {
      if (s.cds[type] > 0 || s.energy < def.cost) {
        w.ev.push({ t: 'deny', side: side, unit: type });
        return false;
      }
      s.energy -= def.cost;
      s.cds[type] = def.cd;
    }
    var hpScale = type === 'boss' ? 1 + w.worldIdx * 0.2 : (side === 1 && w.humans === 1 ? 0.9 + w.level * 0.028 : 1);
    var dmgScale = type === 'boss' ? 1 + w.worldIdx * 0.1 : (side === 1 && w.humans === 1 ? 0.92 + w.level * 0.022 : 1);
    var hp = Math.round(def.hp * hpScale);
    var u = {
      id: w.uid++, side: side, type: type,
      x: side === 0 ? GATE_L + 10 : GATE_R - 10,
      y: def.flying ? AIR_Y + (w.rng() - 0.5) * 8 : GROUND_Y, vy: 0,
      r: def.r, hp: hp, hpMax: hp, dmg: def.dmg * dmgScale, rate: def.rate,
      range: def.range, airRange: def.airRange || def.range, speed: def.speed,
      armor: def.armor, hitsAir: def.hitsAir, flying: def.flying,
      splash: def.splash, kb: def.kb, proj: def.proj || '', bounty: def.bounty,
      atkCd: 0.15, anim: w.rng() * 6.28, hurtT: 0, atkT: 0, boostT: 0, flameT: 0, padUsed: false
    };
    w.units.push(u);
    w.spawned[side]++;
    w.ev.push({ t: 'summon', side: side, unit: type, x: u.x, y: u.y });
    return u;
  }

  function upgradeGen(w, side) {
    if (!w || w.done) return false;
    var s = w.sides[side];
    if (!s || s.genLv >= GEN_LEVELS.length - 1) return false;
    var next = GEN_LEVELS[s.genLv + 1];
    if (s.energy < next.cost) { w.ev.push({ t: 'deny', side: side, unit: 'gen' }); return false; }
    s.energy -= next.cost;
    s.genLv++;
    s.energyMax = next.max;
    w.ev.push({ t: 'upgrade', side: side, lv: s.genLv + 1 });
    return true;
  }

  function cannonX(side) { return side === 0 ? CANNON_LX : CANNON_RX; }

  function angleToTarget(side, tx, ty) {
    var cx = cannonX(side);
    var dx = side === 0 ? (tx - cx) : (cx - tx);
    if (dx < 40) dx = 40;
    var dy = ty - CANNON_Y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var tFlight = d / 820;
    return clamp(Math.atan2(dy - 0.5 * 230 * tFlight * tFlight, dx), AIM_MIN, AIM_MAX);
  }

  function setAim(w, side, angle) {
    if (!w || !w.sides[side]) return 0;
    return (w.sides[side].aim = clamp(angle, AIM_MIN, AIM_MAX));
  }

  function aimAtPoint(w, side, tx, ty) {
    return (!w || !w.sides[side]) ? 0 : setAim(w, side, angleToTarget(side, tx, ty));
  }

  function bestAutoAim(w, side, cone) {
    var s = w.sides[side], cx = cannonX(side), bestA = null, bestSc = -1e9, i, c, u, dist, a, diff, sc;
    if (side === 0 || w.humans === 2) {
      for (i = 0; i < w.crates.length; i++) {
        c = w.crates[i];
        dist = side === 0 ? (c.x - cx) : (cx - c.x);
        if (dist > 55 && dist < 810) {
          a = angleToTarget(side, c.x, c.y);
          diff = Math.abs(a - s.aim);
          if (diff <= cone && (sc = 280 - diff * 110 - dist * 0.08) > bestSc) { bestSc = sc; bestA = a; }
        }
      }
    }
    for (i = 0; i < w.units.length; i++) {
      u = w.units[i];
      if (u.side === side || u.hp <= 0) continue;
      dist = side === 0 ? (u.x - cx) : (cx - u.x);
      if (dist < 38 || dist > 800) continue;
      a = angleToTarget(side, u.x, u.flying ? u.y : u.y - u.r * 0.5);
      diff = Math.abs(a - s.aim);
      if (diff <= cone && (sc = (u.flying ? 250 : 185) + (800 - dist) * 0.16 - diff * 100) > bestSc) {
        bestSc = sc; bestA = a;
      }
    }
    return bestA;
  }

  function fireCannon(w, side, opts) {
    if (!w || w.done) return false;
    opts = opts || {};
    var s = w.sides[side];
    if (!s || s.cannonCd > 0) return false;
    if (opts.tx != null && opts.ty != null) aimAtPoint(w, side, opts.tx, opts.ty);
    else if (opts.assist !== false) {
      var snapped = bestAutoAim(w, side, opts.fullAuto ? 2.4 : (w.humans === 1 && side === 0 ? w.prm.aimCone : 0.36));
      if (snapped != null) s.aim = snapped;
    }
    s.cannonCd = 0.62;
    s.shots++;
    var dir = side === 0 ? 1 : -1, spd = 820;
    var cx = cannonX(side) + dir * 28, cy = CANNON_Y + Math.sin(s.aim) * 24;
    var mul = (side === 0 && w.humans === 1) ? w.prm.cannonMul : (side === 1 && w.humans === 1 ? 0.65 : 1.0);
    w.projs.push({
      id: w.uid++, kind: 'cannon', side: side, x: cx, y: cy,
      vx: Math.cos(s.aim) * spd * dir, vy: Math.sin(s.aim) * spd, g: 230,
      dmg: 32 * mul, airDmg: 62 * mul, splash: 64, kb: 30, maxDist: 820, traveled: 0, life: 1.4
    });
    w.ev.push({ t: 'cannon', side: side, x: cx, y: cy, aim: s.aim });
    return true;
  }

  function fireSuper(w, side) {
    if (!w || w.done) return false;
    var s = w.sides[side];
    if (!s || s.superCharge < 100) return false;
    s.superCharge = 0;
    s.supers++;
    var dir = side === 0 ? 1 : -1;
    for (var i = 0; i < 6; i++) {
      var tx = side === 0 ? (470 + i * 112) : (810 - i * 112);
      var sx = tx - dir * 180, sy = -30 - i * 48, fl = 0.58 + i * 0.06;
      w.projs.push({
        id: w.uid++, kind: 'meteor', side: side, x: sx, y: sy,
        vx: (tx - sx) / fl, vy: (GROUND_Y - sy) / fl, g: 0,
        dmg: 58, airDmg: 80, castleDmg: 22, splash: 98, kb: 48, maxDist: 2000, traveled: 0, life: fl + 0.25
      });
    }
    w.ev.push({ t: 'super', side: side });
    return true;
  }

  function spawnCrate(w, x, y) {
    var c = {
      id: w.uid++, x: x != null ? x : Math.round(360 + w.rng() * 540),
      y: y != null ? y : 128, vy: 20, phase: w.rng() * 6.28, r: 26, energy: 18, life: 11.5
    };
    w.crates.push(c);
    w.ev.push({ t: 'crateSpawn', x: c.x, y: c.y });
    return c;
  }

  function awardCrate(w, c, side) {
    var s = w.sides[side];
    if (!s) return;
    s.energy = Math.min(s.energyMax, s.energy + c.energy);
    s.superCharge = Math.min(100, s.superCharge + 22);
    if (side === 0) w.cratesPopped++;
    w.ev.push({ t: 'cratePop', side: side, x: c.x, y: c.y, energy: c.energy });
  }

  function popCrate(w, x, y, side) {
    if (!w || w.done) return false;
    side = side || 0;
    for (var i = 0; i < w.crates.length; i++) {
      var c = w.crates[i], dx = x - c.x, dy = y - c.y;
      if (dx * dx + dy * dy <= 52 * 52) {
        w.crates.splice(i, 1);
        awardCrate(w, c, side);
        return true;
      }
    }
    return false;
  }

  function counterMult(attType, defUnit) {
    if (attType === 'sword' && defUnit.type === 'rocket') return 1.35;
    if (attType === 'rocket' && (defUnit.flying || defUnit.type === 'dino' || defUnit.type === 'boss')) return 1.45;
    if (attType === 'dino' && defUnit.type === 'sword') return 1.35;
    return 1.0;
  }

  function hurtUnit(w, target, rawDmg, kbDir, kbDist, attackerSide) {
    if (target.hp <= 0) return;
    var dmg = Math.max(2, rawDmg * (1 - (target.armor || 0)));
    target.hp -= dmg;
    target.hurtT = 0.16;
    if (kbDist > 0) {
      var resist = (target.type === 'boss' || target.type === 'mech') ? 0.35 : (target.type === 'dino' ? 0.55 : 1);
      target.x = clamp(target.x + kbDir * kbDist * resist, GATE_L + 8, GATE_R - 8);
    }
    if (target.hp <= 0) {
      target.hp = 0;
      if (attackerSide === 0 || attackerSide === 1) {
        w.kills[attackerSide]++;
        var s = w.sides[attackerSide];
        s.energy = Math.min(s.energyMax, s.energy + (target.bounty || 5) * 0.65);
        s.superCharge = Math.min(100, s.superCharge + (target.bounty || 6));
      }
      w.ev.push({ t: 'kill', side: attackerSide, victimSide: target.side, unit: target.type, x: target.x, y: target.y });
    }
  }

  function hurtCastle(w, targetSide, dmg) {
    if (w.done) return;
    var s = w.sides[targetSide];
    s.hp = Math.max(0, Math.round(s.hp - dmg));
    w.ev.push({ t: 'castleHit', side: targetSide, dmg: dmg, hp: s.hp });
    if (s.hp <= 0) {
      w.done = true;
      w.winner = targetSide === 1 ? 1 : 2;
      w.ev.push({ t: 'end', winner: w.winner });
    }
  }

  function stepAi(w, dt) {
    if (w.humans !== 1 || w.passiveAi || w.done) return;
    var ai = w.sides[1], stg = w.stage;
    if (stg.boss && !w.bossSpawned && (ai.hp <= ai.hpMax * 0.68 || w.t >= 24)) {
      w.bossSpawned = true;
      summon(w, 1, 'boss', { free: true });
      w.ev.push({ t: 'boss', world: w.worldIdx });
    }
    if (stg.airRate > 0) {
      w.airTimer -= dt;
      if (w.airTimer <= 0) {
        w.airTimer = stg.airRate * (0.85 + w.rng() * 0.35) * w.prm.aiThink;
        summon(w, 1, 'balloon', { free: true });
      }
    }
    if ((w.prm.diff === 'hero' || w.level >= 4) && ai.cannonCd <= 0) {
      var nearR = 0;
      for (var k = 0; k < w.units.length; k++) if (w.units[k].side === 0 && w.units[k].x > GATE_R - 260) nearR++;
      if (nearR >= 2) fireCannon(w, 1, { fullAuto: true });
    }
    w.aiTimer -= dt;
    if (w.aiTimer > 0) return;

    var p1Tank = 0, p1Fast = 0, p1Total = 0;
    for (var i = 0; i < w.units.length; i++) {
      var u = w.units[i];
      if (u.side === 0) {
        p1Total++;
        if (u.type === 'dino' || u.type === 'mech') p1Tank++;
        else if (u.type === 'sword') p1Fast++;
      }
    }
    var pool = stg.pool, pick = pool[Math.floor(w.rng() * pool.length)];
    if (p1Tank > 0 && pool.indexOf('rocket') >= 0 && w.rng() < 0.65) pick = 'rocket';
    else if (p1Fast >= 2 && pool.indexOf('dino') >= 0 && w.rng() < 0.6) pick = 'dino';
    else if (w.prm.diff === 'hero' && pool.indexOf('mech') >= 0 && ai.energy >= 55 && p1Total <= 2) pick = 'mech';

    if (ai.energy >= UNITS[pick].cost && ai.cds[pick] <= 0) {
      summon(w, 1, pick);
      w.aiTimer = (1.65 + w.rng() * 1.1) * w.prm.aiThink;
    } else {
      w.aiTimer = 0.45 * w.prm.aiThink;
    }
  }

  function step(w, dt) {
    if (!w || w.done || !(dt > 0)) return;
    w.t += dt;

    var sIdx, s, k, i, j, u, p, c;
    for (sIdx = 0; sIdx < 2; sIdx++) {
      s = w.sides[sIdx];
      s.energy = Math.min(s.energyMax, s.energy + GEN_LEVELS[s.genLv].rate * s.eMul * dt);
      s.superCharge = Math.min(100, s.superCharge + 2.6 * dt);
      if (s.cannonCd > 0) s.cannonCd = Math.max(0, s.cannonCd - dt);
      for (k in s.cds) if (s.cds[k] > 0) s.cds[k] = Math.max(0, s.cds[k] - dt);
    }

    w.crateTimer -= dt;
    if (w.crateTimer <= 0 && w.crates.length < 2) { w.crateTimer = 6.0 + w.rng() * 1.8; spawnCrate(w); }
    for (i = w.crates.length - 1; i >= 0; i--) {
      c = w.crates[i];
      c.life -= dt; c.phase += dt * 2.4;
      if (c.y < 295) c.y += c.vy * dt;
      c.x += Math.sin(c.phase) * 18 * dt;
      if (c.life <= 0) w.crates.splice(i, 1);
    }

    if (w.padType === 'lava') {
      w.ventTimer -= dt;
      if (w.ventTimer <= 0) {
        w.ventTimer = 4.8;
        w.ev.push({ t: 'vent', x: PAD_X, y: GROUND_Y });
        for (i = 0; i < w.units.length; i++) {
          u = w.units[i];
          if (!u.flying && Math.abs(u.x - PAD_X) < 68) { u.vy = -170; u.flameT = 3.2; }
        }
      }
    }

    stepAi(w, dt);

    for (i = 0; i < w.units.length; i++) {
      u = w.units[i];
      if (u.hp <= 0) continue;
      var dir = u.side === 0 ? 1 : -1, foeGate = u.side === 0 ? GATE_R : GATE_L;
      u.anim += dt * (u.boostT > 0 ? 9 : 6);
      if (u.hurtT > 0) u.hurtT = Math.max(0, u.hurtT - dt);
      if (u.atkT > 0) u.atkT = Math.max(0, u.atkT - dt);
      if (u.boostT > 0) u.boostT = Math.max(0, u.boostT - dt);
      if (u.flameT > 0) u.flameT = Math.max(0, u.flameT - dt);
      if (u.atkCd > 0) u.atkCd = Math.max(0, u.atkCd - dt);

      if (!u.flying) {
        if (u.y < GROUND_Y || u.vy !== 0) {
          u.vy += 680 * dt; u.y += u.vy * dt;
          if (u.y >= GROUND_Y) { u.y = GROUND_Y; u.vy = 0; }
        }
        if (!u.padUsed && Math.abs(u.x - PAD_X) < 28) {
          if (w.padType === 'turbo') { u.padUsed = true; u.boostT = 2.8; w.ev.push({ t: 'pad', kind: 'turbo', x: u.x, y: u.y }); }
          else if (w.padType === 'jump') { u.padUsed = true; u.vy = -265; u.boostT = 2.4; w.ev.push({ t: 'pad', kind: 'jump', x: u.x, y: u.y }); }
        }
      } else {
        u.y = AIR_Y + Math.sin(u.anim * 0.7) * 8;
      }

      var bestFoe = null, bestDist = 1e9;
      for (j = 0; j < w.units.length; j++) {
        var f = w.units[j];
        if (f.side === u.side || f.hp <= 0 || (f.flying && !u.hitsAir)) continue;
        var d = (f.x - u.x) * dir, reach = (f.flying ? u.airRange : u.range) + f.r * 0.6;
        if (d >= -18 && d <= reach && d < bestDist) { bestDist = d; bestFoe = f; }
      }

      var atGate = (foeGate - u.x) * dir <= u.range;
      if (bestFoe || atGate) {
        if (u.atkCd <= 0) {
          var dmgNow = u.dmg * (u.flameT > 0 ? 1.25 : 1);
          u.atkCd = u.rate * (u.boostT > 0 ? 0.72 : 1);
          u.atkT = 0.22;
          if (bestFoe && u.proj) {
            var tx = bestFoe.x, ty = bestFoe.y - (bestFoe.flying ? 0 : bestFoe.r * 0.4);
            var pdx = tx - u.x, pdy = ty - (u.y - u.r * 0.6), plen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
            var pspd = u.proj === 'laser' ? 680 : (u.proj === 'bomb' ? 360 : 520);
            w.projs.push({
              id: w.uid++, kind: u.proj, unitType: u.type, side: u.side,
              x: u.x + dir * 16, y: u.y - u.r * 0.6, vx: (pdx / plen) * pspd, vy: (pdy / plen) * pspd,
              g: u.proj === 'bomb' ? 220 : 0, dmg: dmgNow, airDmg: dmgNow * 1.35,
              splash: u.splash || 28, kb: u.kb, maxDist: 420, traveled: 0, life: 1.1
            });
            w.ev.push({ t: 'shoot', side: u.side, unit: u.type, x: u.x, y: u.y });
          } else if (bestFoe) {
            if (u.splash > 0) {
              for (j = 0; j < w.units.length; j++) {
                var f2 = w.units[j];
                if (f2.side === u.side || f2.hp <= 0 || (f2.flying && !u.hitsAir)) continue;
                if (Math.abs(f2.x - bestFoe.x) <= u.splash) hurtUnit(w, f2, dmgNow * counterMult(u.type, f2), dir, u.kb, u.side);
              }
              w.ev.push({ t: 'slam', side: u.side, unit: u.type, x: bestFoe.x, y: GROUND_Y });
            } else {
              hurtUnit(w, bestFoe, dmgNow * counterMult(u.type, bestFoe), dir, u.kb, u.side);
              w.ev.push({ t: 'clash', side: u.side, x: bestFoe.x, y: bestFoe.y - 18 });
            }
          } else if (atGate) {
            hurtCastle(w, u.side === 0 ? 1 : 0, dmgNow * 1.12);
          }
        }
      } else {
        u.x = clamp(u.x + dir * u.speed * (u.boostT > 0 ? 1.45 : 1) * dt, GATE_L + 6, GATE_R - 6);
      }
    }

    for (i = w.projs.length - 1; i >= 0; i--) {
      p = w.projs[i];
      p.life -= dt; p.vy += p.g * dt;
      var sx = p.vx * dt, sy = p.vy * dt;
      p.x += sx; p.y += sy; p.traveled += Math.sqrt(sx * sx + sy * sy);

      var hit = false;
      if (p.kind === 'cannon' && (p.side === 0 || w.humans === 2)) {
        for (j = w.crates.length - 1; j >= 0; j--) {
          c = w.crates[j];
          if ((p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) <= (c.r + 18) * (c.r + 18)) {
            w.crates.splice(j, 1); awardCrate(w, c, p.side); hit = true; break;
          }
        }
      }
      if (!hit) {
        for (j = 0; j < w.units.length; j++) {
          u = w.units[j];
          if (u.side === p.side || u.hp <= 0 || (p.kind === 'bomb' && u.flying)) continue;
          var uy = u.flying ? u.y : u.y - u.r * 0.65, rad = u.r + (p.kind === 'meteor' ? 24 : 16);
          if ((p.x - u.x) * (p.x - u.x) + (p.y - uy) * (p.y - uy) <= rad * rad) { hit = true; break; }
        }
      }
      if (!hit && (p.y >= GROUND_Y - 4 || p.traveled >= p.maxDist || p.life <= 0)) hit = true;

      if (hit) {
        var kbDir = p.side === 0 ? 1 : -1, hitAny = false;
        for (j = 0; j < w.units.length; j++) {
          u = w.units[j];
          if (u.side === p.side || u.hp <= 0 || (p.kind === 'bomb' && u.flying)) continue;
          var uy2 = u.flying ? u.y : u.y - u.r * 0.65;
          if (Math.sqrt((p.x - u.x) * (p.x - u.x) + (p.y - uy2) * (p.y - uy2)) <= p.splash + u.r * 0.5) {
            var baseD = u.flying ? (p.airDmg || p.dmg) : p.dmg;
            if (p.unitType) baseD *= counterMult(p.unitType, u);
            hurtUnit(w, u, baseD, kbDir, p.kb, p.side);
            hitAny = true;
          }
        }
        if (p.kind === 'cannon' && hitAny) w.sides[p.side].superCharge = Math.min(100, w.sides[p.side].superCharge + 8);
        if (p.kind === 'meteor') {
          var foeSide = p.side === 0 ? 1 : 0;
          if (Math.abs(p.x - (foeSide === 1 ? GATE_R : GATE_L)) <= 135) hurtCastle(w, foeSide, p.castleDmg || 18);
        }
        w.ev.push({ t: 'boom', kind: p.kind, side: p.side, x: p.x, y: Math.min(GROUND_Y, p.y), hit: hitAny });
        w.projs.splice(i, 1);
      }
    }

    for (i = w.units.length - 1; i >= 0; i--) if (w.units[i].hp <= 0) w.units.splice(i, 1);
  }

  function freshSave() {
    var lv = [];
    for (var i = 0; i < LEVELS.length; i++) lv.push({ s: 0, t: 0 });
    return { v: 2, diff: 'normal', coins: 0, lv: lv, armors: [1, 0, 0, 0, 0], cannons: [1, 0, 0, 0, 0], armor: 0, cannon: 0 };
  }

  function loadSave(raw) {
    var base = freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 2) return base;
    if (DIFFS[raw.diff]) base.diff = raw.diff;
    if (typeof raw.coins === 'number' && raw.coins >= 0 && raw.coins < 1e7) base.coins = Math.floor(raw.coins);
    if (Array.isArray(raw.lv) && raw.lv.length === LEVELS.length) {
      for (var i = 0; i < LEVELS.length; i++) {
        var it = raw.lv[i];
        if (it && typeof it === 'object') {
          var st = clamp(it.s | 0, 0, 3);
          var tm = typeof it.t === 'number' && it.t > 0 && it.t < 9999 ? Math.round(it.t * 10) / 10 : 0;
          base.lv[i] = { s: st, t: st > 0 ? tm : 0 };
        }
      }
    }
    if (Array.isArray(raw.armors) && raw.armors.length === ARMORS.length) {
      for (var a = 1; a < ARMORS.length; a++) base.armors[a] = raw.armors[a] ? 1 : 0;
    }
    if (Array.isArray(raw.cannons) && raw.cannons.length === CANNONS.length) {
      for (var c = 1; c < CANNONS.length; c++) base.cannons[c] = raw.cannons[c] ? 1 : 0;
    }
    var ai = raw.armor | 0, ci = raw.cannon | 0;
    if (ai >= 0 && ai < ARMORS.length && base.armors[ai]) base.armor = ai;
    if (ci >= 0 && ci < CANNONS.length && base.cannons[ci]) base.cannon = ci;
    return base;
  }

  function isOpen(save, idx) { return idx >= 0 && idx < LEVELS.length; }

  function totalStars(save) {
    var sum = 0;
    if (!save || !Array.isArray(save.lv)) return 0;
    for (var i = 0; i < save.lv.length; i++) sum += (save.lv[i].s | 0);
    return sum;
  }

  function stars(w) {
    if (!w || !w.done || w.winner !== 1) return 0;
    var s = 1;
    if (w.sides[0].hp / w.sides[0].hpMax >= 0.55) s++;
    if (w.t <= w.stage.par) s++;
    return s;
  }

  function scoreOf(w) {
    if (!w) return 0;
    var st = stars(w);
    var hpB = Math.round((w.sides[0].hp / w.sides[0].hpMax) * 300);
    var killB = w.kills[0] * 25 + w.cratesPopped * 30;
    var timeB = w.winner === 1 ? Math.max(0, Math.round((120 - w.t) * 6)) : 0;
    return st * 400 + hpB + killB + timeB;
  }

  function applyResult(save, idx, st, timeSec, diffId) {
    idx = clamp(idx | 0, 0, LEVELS.length - 1);
    st = clamp(st | 0, 0, 3);
    var rec = save.lv[idx], prev = rec.s, isBest = false;
    if (st > 0) {
      if (st > rec.s) { rec.s = st; isBest = true; }
      if (rec.t === 0 || timeSec < rec.t) { rec.t = Math.round(timeSec * 10) / 10; isBest = true; }
    }
    var df = DIFFS[diffId] || DIFFS.normal;
    var earned = st > 0 ? Math.round((LEVELS[idx].reward + st * 6) * df.coinMul) : 6;
    if (st > prev) earned += (st - prev) * 10;
    save.coins += earned;
    return { earned: earned, best: isBest, nextIdx: idx + 1 < LEVELS.length ? idx + 1 : 0 };
  }

  function buy(save, kind, idx) {
    var list = kind === 'armor' ? ARMORS : kind === 'cannon' ? CANNONS : null;
    var owned = kind === 'armor' ? save.armors : kind === 'cannon' ? save.cannons : null;
    if (!list || !owned || idx < 0 || idx >= list.length) return '';
    if (owned[idx]) { if (kind === 'armor') save.armor = idx; else save.cannon = idx; return 'wear'; }
    if (save.coins < list[idx].price) return 'poor';
    save.coins -= list[idx].price;
    owned[idx] = 1;
    if (kind === 'armor') save.armor = idx; else save.cannon = idx;
    return 'bought';
  }

  return {
    W: W, H: H, GROUND_Y: GROUND_Y, AIR_Y: AIR_Y, GATE_L: GATE_L, GATE_R: GATE_R, PAD_X: PAD_X,
    CANNON_LX: CANNON_LX, CANNON_RX: CANNON_RX, CANNON_Y: CANNON_Y,
    AIM_MIN: AIM_MIN, AIM_MAX: AIM_MAX, START_ENERGY: START_ENERGY,
    GEN_LEVELS: GEN_LEVELS, DIFFS: DIFFS, DIFF_ORDER: DIFF_ORDER,
    WORLDS: WORLDS, LEVELS: LEVELS, UNIT_ORDER: UNIT_ORDER, UNITS: UNITS,
    ARMORS: ARMORS, CANNONS: CANNONS,
    params: params, create: create, createVersus: createVersus,
    summon: summon, upgradeGen: upgradeGen,
    setAim: setAim, aimAtPoint: aimAtPoint, fireCannon: fireCannon,
    fireSuper: fireSuper, spawnCrate: spawnCrate, popCrate: popCrate,
    step: step, freshSave: freshSave, loadSave: loadSave, isOpen: isOpen,
    totalStars: totalStars, stars: stars, scoreOf: scoreOf,
    applyResult: applyResult, buy: buy
  };
});
