/* Toy Castle Clash (قلعة الألعاب) engine: lane simulation, wind-up key energy,
 * five toy units + boss, sky star-bubbles, bouncy drum pad, castle confetti cannon,
 * 12 solo campaign levels across 4 playroom worlds, 2P versus, shop and saves.
 * Pure: no DOM, no Kit, no timers, no Math.random, UMD for browser + Node. */
(function () {
  'use strict';
  var TC = (typeof window !== 'undefined' && window.TC) || {};
  if (typeof window !== 'undefined') window.TC = TC;
  if (typeof module !== 'undefined' && module.exports) module.exports = TC;

  var W = 1280, H = 720;
  TC.W = W; TC.H = H;
  TC.GROUND_Y = 496;
  TC.AIR_Y = 258;
  TC.GATE_L = 152;
  TC.GATE_R = 1128;
  TC.DRUM_X = 640;
  TC.DRUM_R = 52;

  TC.START_ENERGY = 30;
  TC.BUBBLE_BONUS = 15;
  TC.BUBBLE_R = 40;
  TC.CANNON_CD = 12;
  TC.CANNON_RANGE = 490;
  TC.CANNON_DMG = 66;

  TC.KEY_LEVELS = [
    { lv: 1, rate: 9.5, max: 100, cost: 0 },
    { lv: 2, rate: 15.2, max: 150, cost: 35 },
    { lv: 3, rate: 22.0, max: 200, cost: 55 }
  ];

  TC.UNIT_ORDER = ['duck', 'frog', 'bear', 'plane', 'train'];

  TC.UNITS = {
    duck: {
      id: 'duck', name: 'بطة الزنبرك', cost: 15, cd: 0.72,
      hp: 70, dmg: 17, rate: 0.7, range: 40, speed: 132,
      flying: false, hitsAir: false, splash: 0, kb: 16, kbResist: 0, r: 20
    },
    frog: {
      id: 'frog', name: 'ضفدع الألوان', cost: 25, cd: 1.2,
      hp: 62, dmg: 21, airBonus: 8, rate: 0.88, range: 250, speed: 80,
      flying: false, hitsAir: true, proj: 'paint', splash: 28, kb: 8, kbResist: 0, r: 21
    },
    bear: {
      id: 'bear', name: 'دبّ الوسادة', cost: 40, cd: 1.9,
      hp: 275, dmg: 25, rate: 1.05, range: 46, speed: 64,
      flying: false, hitsAir: false, splash: 34, kb: 28, kbResist: 0.35, r: 27
    },
    plane: {
      id: 'plane', name: 'طائرة الورق', cost: 35, cd: 1.7,
      hp: 62, dmg: 23, rate: 0.96, range: 158, speed: 106,
      flying: true, hitsAir: false, proj: 'confetti', splash: 42, kb: 12, kbResist: 0.1, r: 22
    },
    train: {
      id: 'train', name: 'قطار المكعبات', cost: 75, cd: 3.4,
      hp: 365, dmg: 46, rate: 0.92, range: 56, speed: 96, chargeSpeed: 166,
      flying: false, hitsAir: false, splash: 92, kb: 78, kbResist: 0.52, r: 34
    },
    boss: {
      id: 'boss', name: 'ملك الألعاب', cost: 0, cd: 0,
      hp: 780, dmg: 38, rate: 1.35, range: 70, speed: 40,
      flying: false, hitsAir: true, splash: 92, kb: 52, kbResist: 0.82, r: 44
    }
  };

  /* --------------------------------------------------------------- DDA */
  TC.EASY = { aiEnergy: 0.62, aiHp: 0.78, aiThink: 1.38, p1Energy: 1.22 };
  TC.HARD = { aiEnergy: 0.98, aiHp: 1.08, aiThink: 0.82, p1Energy: 1.0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  TC.clamp = clamp;

  TC.params = function (k) {
    k = clamp(+k || 0, 0, 1);
    var o = {};
    for (var key in TC.EASY) o[key] = TC.EASY[key] + (TC.HARD[key] - TC.EASY[key]) * k;
    return o;
  };

  TC.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ----------------------------------------------------- worlds & levels */
  TC.WORLDS = [
    { id: 'rug', name: 'سجادة الغرفة', color: '#38bdf8', deep: '#0284c7', bg0: '#fff6e6', bg1: '#fde2c8' },
    { id: 'shelf', name: 'رفّ الكتب', color: '#fbbf24', deep: '#d97706', bg0: '#fef7dc', bg1: '#fde69e' },
    { id: 'blocks', name: 'مملكة المكعبات', color: '#34d399', deep: '#059669', bg0: '#e6f7ff', bg1: '#c5ebfe' },
    { id: 'stage', name: 'مسرح العرائس', color: '#f472b6', deep: '#db2777', bg0: '#fdf2f8', bg1: '#fbcfe8' }
  ];

  TC.LEVELS = [
    // World 1: سجادة الغرفة (Playroom Rug — ducks, frogs, bears)
    { id: '1-1', world: 0, name: 'موكب البط', hpL: 620, hpR: 360, par: 46, aiRate: 0.55, maxKey: 0,
      pool: ['duck'], waves: [[2.8, 'duck'], [10, 'duck']] },
    { id: '1-2', world: 0, name: 'فقاعات الألوان', hpL: 620, hpR: 420, par: 54, aiRate: 0.64, maxKey: 0,
      pool: ['duck', 'frog'], waves: [[3, 'duck'], [9, 'frog']] },
    { id: '1-3', world: 0, name: 'حارس الوسادة', hpL: 640, hpR: 480, par: 62, aiRate: 0.72, maxKey: 0,
      pool: ['duck', 'frog', 'bear'], waves: [[3.2, 'duck'], [9.5, 'bear']] },

    // World 2: رفّ الكتب (Bookshelf Bridge — paper gliders & bouncy drum pad)
    { id: '2-1', world: 1, name: 'طبلة القفز', hpL: 650, hpR: 520, par: 64, aiRate: 0.75, maxKey: 0, drum: true,
      pool: ['duck', 'plane'], waves: [[3, 'plane'], [10, 'duck']] },
    { id: '2-2', world: 1, name: 'سرب الورق', hpL: 660, hpR: 560, par: 70, aiRate: 0.8, maxKey: 0, drum: true,
      pool: ['duck', 'frog', 'plane'], waves: [[3, 'duck'], [8, 'plane']] },
    { id: '2-3', world: 1, name: 'جسر القصص', hpL: 680, hpR: 610, par: 76, aiRate: 0.84, maxKey: 0, drum: true,
      pool: ['duck', 'frog', 'bear', 'plane'], waves: [[3.2, 'bear'], [9, 'plane']] },

    // World 3: مملكة المكعبات (Block Kingdom — armored rival bears & toy trains)
    { id: '3-1', world: 2, name: 'دروع المكعبات', hpL: 700, hpR: 650, par: 78, aiRate: 0.88, maxKey: 1, armoredBears: true,
      pool: ['duck', 'frog', 'bear'], waves: [[3.2, 'bear'], [10, 'frog']] },
    { id: '3-2', world: 2, name: 'صافرة القطار', hpL: 720, hpR: 700, par: 84, aiRate: 0.92, maxKey: 1, armoredBears: true,
      pool: ['duck', 'frog', 'plane', 'train'], waves: [[3, 'duck'], [11, 'train']] },
    { id: '3-3', world: 2, name: 'قلعة الأبراج', hpL: 740, hpR: 750, par: 90, aiRate: 0.95, maxKey: 1, armoredBears: true, drum: true, cannon: true,
      pool: ['duck', 'frog', 'bear', 'plane', 'train'], waves: [[3, 'bear'], [10, 'plane']] },

    // World 4: مسرح العرائس (Grand Puppet Stage — epic toy king boss wave)
    { id: '4-1', world: 3, name: 'رفع الستار', hpL: 760, hpR: 790, par: 92, aiRate: 0.98, maxKey: 1, armoredBears: true, cannon: true,
      pool: ['duck', 'frog', 'bear', 'plane', 'train'], waves: [[2.8, 'duck'], [9, 'train']] },
    { id: '4-2', world: 3, name: 'إيقاع المسرح', hpL: 780, hpR: 830, par: 96, aiRate: 1.0, maxKey: 1, armoredBears: true, drum: true, cannon: true,
      pool: ['duck', 'frog', 'bear', 'plane', 'train'], waves: [[3, 'plane'], [10, 'bear']] },
    { id: '4-3', world: 3, name: 'ملك الألعاب', hpL: 860, hpR: 900, par: 112, aiRate: 0.96, maxKey: 1, armoredBears: true, bossWave: true, cannon: true,
      pool: ['duck', 'frog', 'bear', 'plane', 'train'], waves: [[3, 'duck'], [8, 'frog']] }
  ];

  /* ------------------------------------------------------------- shop */
  TC.THEMES = [
    { id: 'classic', name: 'مكعبات مرحة', wall: '#4ea8ff', roof: '#ff5d73', trim: '#ffd23f', door: '#6d4aff', price: 0 },
    { id: 'candy', name: 'حلوى القطن', wall: '#ff85c0', roof: '#4dd9ff', trim: '#fff07c', door: '#9d5cff', price: 20 },
    { id: 'emerald', name: 'قلعة الزمرد', wall: '#34d399', roof: '#ffb703', trim: '#a7f3d0', door: '#0d9488', price: 35 },
    { id: 'sunset', name: 'غروب البرتقال', wall: '#ff9248', roof: '#ff4d6d', trim: '#ffe66d', door: '#8b5cf6', price: 50 },
    { id: 'galaxy', name: 'نجوم المجرة', wall: '#8b5cf6', roof: '#38bdf8', trim: '#fde047', door: '#ec4899', price: 70 },
    { id: 'royal', name: 'القلعة الذهبية', wall: '#fbbf24', roof: '#ef4444', trim: '#fef08a', door: '#7c3aed', price: 90 }
  ];

  TC.TOPPERS = [
    { id: 'crown', name: 'تاج الملك', price: 0 },
    { id: 'dragon', name: 'تنين قطني', price: 20 },
    { id: 'rocket', name: 'صاروخ الألعاب', price: 35 },
    { id: 'windmill', name: 'طاحونة ملونة', price: 55 },
    { id: 'duck', name: 'بطة عملاقة', price: 75 }
  ];

  // Rival castle themes per world so each world looks distinct.
  TC.RIVAL_THEMES = [
    { wall: '#ff6b8b', roof: '#8b5cf6', trim: '#ffd23f', door: '#be185d' },
    { wall: '#f97316', roof: '#dc2626', trim: '#fde047', door: '#7c2d12' },
    { wall: '#6366f1', roof: '#ec4899', trim: '#67e8f9', door: '#312e81' },
    { wall: '#e11d48', roof: '#7e22ce', trim: '#fbbf24', door: '#4c0519' }
  ];

  /* ------------------------------------------------------------- saves */
  TC.freshSave = function () {
    return {
      v: 1,
      lv: TC.LEVELS.map(function () { return { s: 0, t: 0 }; }),
      coins: 0,
      themes: TC.THEMES.map(function (_, i) { return i ? 0 : 1; }),
      toppers: TC.TOPPERS.map(function (_, i) { return i ? 0 : 1; }),
      theme: 0,
      topper: 0
    };
  };

  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

  TC.loadSave = function (raw) {
    var s = TC.freshSave(), r = isObj(raw);
    if (!r || r.v !== 1) return s;
    var lv = Array.isArray(r.lv) ? r.lv : [];
    s.lv.forEach(function (e, i) {
      var o = isObj(lv[i]);
      if (!o) return;
      e.s = isInt(o.s, 0, 3) ? o.s : 0;
      e.t = e.s && isInt(o.t, 1, 36000) ? o.t : 0;
    });
    s.coins = isInt(r.coins, 0, 99999) ? r.coins : 0;
    ['themes', 'toppers'].forEach(function (k) {
      var a = Array.isArray(r[k]) ? r[k] : [];
      s[k] = s[k].map(function (_, i) { return i === 0 || a[i] === 1 ? 1 : 0; });
    });
    s.theme = isInt(r.theme, 0, TC.THEMES.length - 1) && s.themes[r.theme] ? r.theme : 0;
    s.topper = isInt(r.topper, 0, TC.TOPPERS.length - 1) && s.toppers[r.topper] ? r.topper : 0;
    return s;
  };

  TC.isOpen = function (s, i) {
    return i === 0 || (i > 0 && i < TC.LEVELS.length && s.lv[i - 1].s > 0);
  };

  TC.totalStars = function (s) {
    var n = 0;
    s.lv.forEach(function (e) { n += e.s; });
    return n;
  };

  TC.nextLevel = function (s) {
    var top = 0;
    for (var i = 0; i < TC.LEVELS.length; i++) {
      if (!TC.isOpen(s, i)) break;
      top = i;
      if (!s.lv[i].s) return i;
    }
    return top;
  };

  TC.stars = function (w) {
    if (!w || w.winner !== 1) return 0;
    var s0 = w.sides[0], hpRatio = s0.hp / s0.hpMax;
    var par = w.L ? w.L.par : 80;
    return 1 + (hpRatio >= 0.6 ? 1 : 0) + (w.t <= par ? 1 : 0);
  };

  TC.outcome = function (w) {
    if (!w) return 0.3;
    if (w.winner === 1) {
      var hpRatio = w.sides[0].hp / w.sides[0].hpMax;
      var fast = w.L ? clamp(1.15 - w.t / (w.L.par * 1.6), 0, 0.35) : 0.15;
      return Math.round(clamp(0.55 + hpRatio * 0.3 + fast, 0.55, 1) * 1000) / 1000;
    }
    var dmgDone = 1 - w.sides[1].hp / w.sides[1].hpMax;
    return Math.round(clamp(dmgDone * 0.4, 0, 0.4) * 1000) / 1000;
  };

  TC.applyResult = function (s, i, stars, time, bonusCoins) {
    var e = s.lv[i];
    var first = !e.s;
    var tenths = clamp(Math.ceil(time * 10), 1, 36000);
    var best = !!e.s && (stars > e.s || tenths < e.t);
    var moreStars = stars > e.s;
    if (stars > e.s) e.s = stars;
    if (!e.t || tenths < e.t) e.t = tenths;
    var earned = (first ? 20 : 10) + stars * 8 + clamp(Math.floor(bonusCoins || 0), 0, 40);
    s.coins = Math.min(99999, s.coins + earned);
    var opened = first && i + 1 < TC.LEVELS.length ? i + 1 : -1;
    var world = opened >= 0 && opened % 3 === 0 ? opened / 3 : -1;
    return { first: first, best: best, moreStars: moreStars, coins: earned, opened: opened, world: world };
  };

  TC.buy = function (s, kind, k) {
    var isTop = kind === 'topper';
    var list = isTop ? TC.TOPPERS : TC.THEMES;
    var own = isTop ? s.toppers : s.themes;
    var key = isTop ? 'topper' : 'theme';
    if (!list[k]) return '';
    if (own[k]) { s[key] = k; return 'wear'; }
    if (s.coins < list[k].price) return '';
    s.coins -= list[k].price;
    own[k] = 1;
    s[key] = k;
    return 'bought';
  };

  /* -------------------------------------------------------- simulation */
  function makeSide(idx, hp, energy) {
    return {
      idx: idx,
      dir: idx === 0 ? 1 : -1,
      gateX: idx === 0 ? TC.GATE_L : TC.GATE_R,
      hp: hp,
      hpMax: hp,
      energy: energy,
      energyMax: TC.KEY_LEVELS[0].max,
      keyLv: 0,
      cds: { duck: 0, frog: 0, bear: 0, plane: 0, train: 0 },
      cannonCd: 0,
      cannonAnim: 0,
      hitT: 0,
      spawned: 0,
      lost: 0,
      kills: 0
    };
  }

  TC.create = function (levelIdx, P, opts) {
    opts = opts || {};
    var humans = opts.humans === 2 ? 2 : 1;
    var seed = opts.seed != null ? opts.seed : (humans === 2 ? 2026 : 101 + (levelIdx | 0) * 37);
    var rand = TC.rng(seed);
    var R;
    if (humans === 2) {
      P = { aiEnergy: 1, aiHp: 1, aiThink: 1, p1Energy: 1 };
      R = {
        id: 'vs', world: opts.world != null ? opts.world : 1, name: 'مواجهة اثنين',
        hpL: 760, hpR: 760, par: 90, aiRate: 1, maxKey: 2,
        drum: opts.drum !== false, pool: TC.UNIT_ORDER.slice(), waves: []
      };
    } else {
      levelIdx = clamp(levelIdx | 0, 0, TC.LEVELS.length - 1);
      P = P || TC.params(0.3);
      R = TC.LEVELS[levelIdx];
    }
    var hpL = R.hpL;
    var hpR = humans === 2 ? R.hpR : Math.round(R.hpR * P.aiHp);
    var s0 = makeSide(0, hpL, opts.startEnergy != null ? opts.startEnergy : TC.START_ENERGY);
    var s1 = makeSide(1, hpR, opts.startEnergy != null ? opts.startEnergy : (humans === 2 ? TC.START_ENERGY : 20));

    return {
      humans: humans,
      level: humans === 2 ? -1 : levelIdx,
      world: R.world,
      L: R,
      P: P,
      rand: rand,
      passiveAi: !!opts.passiveAi,
      t: 0,
      done: false,
      winner: 0,
      nextId: 1,
      sides: [s0, s1],
      spawned: [0, 0],
      units: [],
      shots: [],
      bubbles: [],
      bubbleTimer: opts.firstBubble != null ? opts.firstBubble : 4.2,
      bubblesPopped: 0,
      drum: { on: !!R.drum, x: TC.DRUM_X, y: TC.GROUND_Y, ring: 0 },
      waveIdx: 0,
      aiTimer: humans === 2 ? 1e9 : 2.2 * P.aiThink,
      bossSpawned: false,
      ev: []
    };
  };

  TC.createVersus = function (opts) {
    var o = {};
    if (opts) for (var k in opts) o[k] = opts[k];
    o.humans = 2;
    return TC.create(-1, null, o);
  };

  function spawnEntity(w, sideIdx, type, extra) {
    extra = extra || {};
    var s = w.sides[sideIdx];
    var def = TC.UNITS[type];
    if (!def) return null;
    var hpMul = sideIdx === 1 && w.humans === 1 ? w.P.aiHp : 1;
    var armored = !!(extra.armored || (sideIdx === 1 && w.humans === 1 && w.L.armoredBears && type === 'bear'));
    if (armored) hpMul *= 1.32;
    var hp = Math.round(def.hp * hpMul);
    var jitter = (w.rand() - 0.5) * 8;
    var u = {
      id: w.nextId++,
      type: type,
      side: sideIdx,
      dir: s.dir,
      x: s.gateX + s.dir * 14,
      y: def.flying ? TC.AIR_Y + jitter : TC.GROUND_Y,
      baseY: def.flying ? TC.AIR_Y + jitter : TC.GROUND_Y,
      vx: 0,
      vy: 0,
      hp: hp,
      hpMax: hp,
      dmg: def.dmg,
      rate: def.rate,
      range: def.range,
      speed: def.speed,
      chargeSpeed: def.chargeSpeed || def.speed,
      flying: def.flying,
      hitsAir: def.hitsAir,
      proj: def.proj || '',
      splash: def.splash || 0,
      kb: def.kb || 0,
      kbResist: def.kbResist || 0,
      r: def.r,
      armored: armored,
      atkCd: 0.15,
      anim: 0,
      hurtT: 0,
      runT: 0,
      charging: false,
      drummed: false,
      boostT: 0,
      phase: w.rand() * 6.28
    };
    w.units.push(u);
    return u;
  }

  TC.summon = function (w, sideIdx, type, opts) {
    opts = opts || {};
    if (!w || w.done) return false;
    var s = w.sides[sideIdx];
    var def = TC.UNITS[type];
    if (!s || !def) return false;
    if (!opts.free) {
      if (TC.UNIT_ORDER.indexOf(type) < 0) return false;
      if (s.cds[type] > 0.001) {
        if (!opts.silent) w.ev.push({ t: 'deny', side: sideIdx, unit: type, why: 'cd' });
        return false;
      }
      if (s.energy + 1e-6 < def.cost) {
        if (!opts.silent) w.ev.push({ t: 'deny', side: sideIdx, unit: type, why: 'energy' });
        return false;
      }
      s.energy = Math.max(0, s.energy - def.cost);
      s.cds[type] = def.cd;
    }
    s.spawned++;
    w.spawned[sideIdx] = s.spawned;
    var u = spawnEntity(w, sideIdx, type, opts);
    w.ev.push({ t: 'summon', side: sideIdx, unit: type, x: u.x, y: u.y, id: u.id, free: !!opts.free });
    return u;
  };

  TC.upgradeKey = function (w, sideIdx, opts) {
    opts = opts || {};
    if (!w || w.done) return false;
    var s = w.sides[sideIdx];
    if (!s) return false;
    if (s.keyLv >= TC.KEY_LEVELS.length - 1) {
      if (!opts.silent) w.ev.push({ t: 'deny', side: sideIdx, unit: 'key', why: 'max' });
      return false;
    }
    var next = TC.KEY_LEVELS[s.keyLv + 1];
    if (s.energy + 1e-6 < next.cost) {
      if (!opts.silent) w.ev.push({ t: 'deny', side: sideIdx, unit: 'key', why: 'energy' });
      return false;
    }
    s.energy = Math.max(0, s.energy - next.cost);
    s.keyLv++;
    s.energyMax = next.max;
    w.ev.push({ t: 'upgrade', side: sideIdx, lv: s.keyLv + 1 });
    return true;
  };

  TC.fireCannon = function (w, sideIdx, opts) {
    opts = opts || {};
    if (!w || w.done) return false;
    var s = w.sides[sideIdx];
    if (!s) return false;
    if (s.cannonCd > 0.001) {
      if (!opts.silent) w.ev.push({ t: 'deny', side: sideIdx, unit: 'cannon', why: 'cd' });
      return false;
    }
    s.cannonCd = TC.CANNON_CD;
    s.cannonAnim = 0.55;
    var sx = s.gateX - s.dir * 28, sy = TC.GROUND_Y - 154;
    for (var i = 0; i < 6; i++) {
      var dist = 85 + i * 78;
      var tx = clamp(s.gateX + s.dir * dist, TC.GATE_L + 20, TC.GATE_R - 20);
      var ty = i % 2 === 0 ? TC.GROUND_Y - 14 : (TC.GROUND_Y + TC.AIR_Y) * 0.5;
      w.shots.push({
        id: w.nextId++,
        kind: 'cannon',
        side: sideIdx,
        dir: s.dir,
        sx: sx, sy: sy,
        tx: tx, ty: ty,
        x: sx, y: sy,
        arc: 95 + (i % 3) * 26,
        t: 0,
        dur: 0.28 + i * 0.045,
        dmg: 26,
        splash: 95,
        kb: 92,
        hitsAir: true,
        cannonColumn: true,
        colorIdx: i
      });
    }
    w.ev.push({ t: 'cannon', side: sideIdx, x: sx, y: sy });
    return true;
  };

  TC.spawnBubble = function (w, x, y) {
    var bx = x != null ? x : 300 + w.rand() * 680;
    var by = y != null ? y : 152 + w.rand() * 68;
    var b = {
      id: w.nextId++,
      x: bx,
      y: by,
      baseY: by,
      vx: (w.rand() < 0.5 ? 1 : -1) * (18 + w.rand() * 14),
      life: 11,
      t: 0
    };
    w.bubbles.push(b);
    return b;
  };

  function collectBubble(w, idx, sideIdx) {
    var b = w.bubbles[idx];
    w.bubbles.splice(idx, 1);
    var s = w.sides[sideIdx];
    var before = s.energy;
    s.energy = Math.min(s.energyMax, s.energy + TC.BUBBLE_BONUS);
    var gain = Math.round(s.energy - before);
    if (sideIdx === 0) w.bubblesPopped++;
    w.ev.push({ t: 'bubble', side: sideIdx, x: b.x, y: b.y, gain: gain || TC.BUBBLE_BONUS });
    return true;
  }

  TC.popBubble = function (w, x, y, sideIdx) {
    if (!w || w.done) return false;
    var best = -1, bestD = TC.BUBBLE_R;
    for (var i = 0; i < w.bubbles.length; i++) {
      var b = w.bubbles[i];
      var d = Math.hypot(b.x - x, b.y - y);
      if (d <= bestD) { bestD = d; best = i; }
    }
    if (best < 0) return false;
    if (sideIdx == null) {
      sideIdx = w.humans === 2 ? (x < W * 0.5 ? 0 : 1) : 0;
    }
    return collectBubble(w, best, sideIdx);
  };

  function hurtUnit(u, dmg, kbDir, kbAmt) {
    u.hp -= dmg;
    u.hurtT = 0.22;
    var push = kbAmt * (1 - (u.kbResist || 0));
    if (push > 0) {
      u.x = clamp(u.x + kbDir * push * 0.36, TC.GATE_L + 8, TC.GATE_R - 8);
      u.vx += kbDir * push * 3.4;
      if (!u.flying && push > 30) u.vy = Math.min(u.vy, -110);
    }
  }

  function hurtCastle(w, sideIdx, dmg) {
    var s = w.sides[sideIdx];
    s.hp = Math.max(0, s.hp - dmg);
    s.hitT = 0.28;
    w.ev.push({ t: 'castleHit', side: sideIdx, dmg: dmg, hp: s.hp, x: s.gateX, y: TC.GROUND_Y - 70 });
  }

  function dealArea(w, sideIdx, cx, cy, radius, dmg, kbDir, kbAmt, hitsAir, columnMode, airBonus) {
    var hitCount = 0;
    for (var i = 0; i < w.units.length; i++) {
      var e = w.units[i];
      if (e.side === sideIdx || e.hp <= 0) continue;
      if (e.flying && !hitsAir) continue;
      var d = columnMode ? Math.abs(e.x - cx) : Math.hypot(e.x - cx, (e.y - cy) * 0.55);
      if (d <= radius + e.r * 0.6) {
        hurtUnit(e, dmg + (e.flying && airBonus ? airBonus : 0), kbDir, kbAmt);
        hitCount++;
      }
    }
    return hitCount;
  }

  function stepAi(w, dt) {
    var R = w.L, s1 = w.sides[1];
    while (w.waveIdx < R.waves.length && w.t >= R.waves[w.waveIdx][0]) {
      var wv = R.waves[w.waveIdx++];
      TC.summon(w, 1, wv[1], { free: true, silent: true });
    }
    if (R.bossWave && !w.bossSpawned && (w.t >= 11.5 || s1.hp <= s1.hpMax * 0.72)) {
      w.bossSpawned = true;
      var boss = spawnEntity(w, 1, 'boss', {});
      s1.spawned++;
      w.spawned[1] = s1.spawned;
      w.ev.push({ t: 'boss', side: 1, x: boss.x, y: boss.y, id: boss.id });
    }

    // Rival castle emergency cannon in Worlds 3-4 when swarmed at doorstep.
    if (R.cannon && s1.cannonCd <= 0) {
      var nearDoor = 0;
      for (var i = 0; i < w.units.length; i++) {
        var u = w.units[i];
        if (u.side === 0 && u.x > TC.GATE_R - 230) nearDoor++;
      }
      if (nearDoor >= 4) TC.fireCannon(w, 1, { silent: true });
    }

    w.aiTimer -= dt;
    if (w.aiTimer > 0) return;
    w.aiTimer = (1.55 + w.rand() * 1.15) * w.P.aiThink;

    // Upgrade Wind-Up Key if allowed and rich on energy.
    if (s1.keyLv < (R.maxKey || 0) && s1.energy >= TC.KEY_LEVELS[s1.keyLv + 1].cost + 15 && w.rand() < 0.45) {
      TC.upgradeKey(w, 1, { silent: true });
      return;
    }

    var pool = R.pool;
    if (!pool || !pool.length) return;

    // Smart counter: if player has a flying plane and AI has frog in pool, favor frog!
    var p1Air = false, aiTanks = 0;
    for (var j = 0; j < w.units.length; j++) {
      var m = w.units[j];
      if (m.side === 0 && m.flying) p1Air = true;
      if (m.side === 1 && (m.type === 'bear' || m.type === 'train' || m.type === 'boss')) aiTanks++;
    }

    var pick = pool[Math.floor(w.rand() * pool.length)];
    if (p1Air && pool.indexOf('frog') >= 0 && w.rand() < 0.72) pick = 'frog';
    else if (aiTanks === 0 && pool.indexOf('bear') >= 0 && s1.energy >= 35 && w.rand() < 0.5) pick = 'bear';
    else if (pool.indexOf('train') >= 0 && s1.energy >= 62 && w.rand() < 0.55) pick = 'train';

    var cost = TC.UNITS[pick].cost;
    if (s1.energy >= cost && s1.cds[pick] <= 0) {
      TC.summon(w, 1, pick, { silent: true });
    } else if (s1.energy >= 15 && w.rand() < 0.35 && pool.indexOf('duck') >= 0 && cost > 35 && s1.energy < cost * 0.55) {
      TC.summon(w, 1, 'duck', { silent: true });
    }
  }

  function findTarget(w, u) {
    var best = null, bestScore = 1e9;
    for (var i = 0; i < w.units.length; i++) {
      var e = w.units[i];
      if (e.side === u.side || e.hp <= 0) continue;
      if (e.flying && !u.hitsAir) continue;
      var ahead = (e.x - u.x) * u.dir;
      if (ahead < -22 || ahead > u.range + e.r) continue;
      var score = ahead - (u.type === 'frog' && e.flying ? 35 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  TC.step = function (w, dt) {
    if (!w || w.done || dt <= 0) return;
    w.t += dt;

    // 1. Energy & cooldowns for both castles
    for (var sIdx = 0; sIdx < 2; sIdx++) {
      var s = w.sides[sIdx];
      var baseRate = TC.KEY_LEVELS[s.keyLv].rate;
      var mul = w.humans === 1 ? (sIdx === 0 ? w.P.p1Energy : w.P.aiEnergy * w.L.aiRate) : 1;
      s.energy = Math.min(s.energyMax, s.energy + baseRate * mul * dt);
      for (var k = 0; k < TC.UNIT_ORDER.length; k++) {
        var uk = TC.UNIT_ORDER[k];
        if (s.cds[uk] > 0) s.cds[uk] = Math.max(0, s.cds[uk] - dt);
      }
      if (s.cannonCd > 0) s.cannonCd = Math.max(0, s.cannonCd - dt);
      if (s.cannonAnim > 0) s.cannonAnim = Math.max(0, s.cannonAnim - dt);
      if (s.hitT > 0) s.hitT = Math.max(0, s.hitT - dt);
    }

    if (w.drum.ring > 0) w.drum.ring = Math.max(0, w.drum.ring - dt);

    // 2. Floating sky star-bubbles
    w.bubbleTimer -= dt;
    if (w.bubbleTimer <= 0 && w.bubbles.length < 3) {
      TC.spawnBubble(w);
      w.bubbleTimer = 6.0 + w.rand() * 3.0;
    }
    for (var bi = w.bubbles.length - 1; bi >= 0; bi--) {
      var b = w.bubbles[bi];
      b.t += dt;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y = b.baseY + Math.sin(b.t * 2.4) * 10;
      if (b.x < 220) { b.x = 220; b.vx = Math.abs(b.vx); }
      if (b.x > W - 220) { b.x = W - 220; b.vx = -Math.abs(b.vx); }
      if (b.life <= 0) { w.bubbles.splice(bi, 1); continue; }
      // Paper gliders flying through a star-bubble pop it automatically!
      for (var ui = 0; ui < w.units.length; ui++) {
        var fl = w.units[ui];
        if (fl.flying && fl.hp > 0 && Math.hypot(fl.x - b.x, fl.y - b.y) <= 36) {
          collectBubble(w, bi, fl.side);
          break;
        }
      }
    }

    // 3. Rival AI (1P only)
    if (w.humans === 1 && !w.passiveAi) stepAi(w, dt);

    // 4. Units movement, bouncy drum pad, charging & combat
    for (var i = 0; i < w.units.length; i++) {
      var u = w.units[i];
      if (u.hp <= 0) continue;
      if (u.anim > 0) u.anim = Math.max(0, u.anim - dt);
      if (u.hurtT > 0) u.hurtT = Math.max(0, u.hurtT - dt);
      if (u.boostT > 0) u.boostT = Math.max(0, u.boostT - dt);
      if (u.atkCd > 0) u.atkCd = Math.max(0, u.atkCd - dt);

      // Knockback horizontal velocity
      if (Math.abs(u.vx) > 0.5) {
        u.x += u.vx * dt;
        u.vx *= Math.pow(0.0015, dt);
      } else u.vx = 0;

      // Vertical hop physics (ground units & drum bounce)
      if (!u.flying) {
        if (u.y < u.baseY || u.vy !== 0) {
          u.vy += 980 * dt;
          u.y += u.vy * dt;
          if (u.y >= u.baseY) { u.y = u.baseY; u.vy = 0; }
        }
      } else {
        u.y = u.baseY + Math.sin(w.t * 3.6 + u.phase) * 6;
      }

      // Bouncy drum pad in middle of lane
      if (w.drum.on && !u.flying && u.type !== 'boss' && !u.drummed && Math.abs(u.x - w.drum.x) <= 28) {
        u.drummed = true;
        u.vy = -275;
        u.boostT = 0.78;
        w.drum.ring = 0.5;
        w.ev.push({ t: 'drum', side: u.side, x: w.drum.x, y: w.drum.y });
      }

      var foeSide = 1 - u.side;
      var foeCastle = w.sides[foeSide];
      var target = findTarget(w, u);
      var castleDist = (foeCastle.gateX - u.x) * u.dir;
      var atCastle = !target && castleDist <= u.range + 12;

      if (!target && !atCastle) {
        // March forward
        if (u.type === 'train') {
          u.runT += dt;
          if (u.runT >= 0.8 && !u.charging) {
            u.charging = true;
            w.ev.push({ t: 'whistle', side: u.side, x: u.x, y: u.y });
          }
        }
        var spd = (u.charging ? u.chargeSpeed : u.speed) * (u.boostT > 0 ? 1.62 : 1);
        u.x += u.dir * spd * dt;
      } else {
        // Train multi-bonk charge slam!
        if (u.charging) {
          u.charging = false;
          u.runT = 0;
          u.anim = 0.36;
          u.atkCd = u.rate * 0.85;
          var slamX = target ? target.x : foeCastle.gateX;
          var slamDmg = Math.round(u.dmg * 1.45);
          if (target) {
            dealArea(w, u.side, slamX, TC.GROUND_Y, 96, slamDmg, u.dir, 88, false, true);
          } else {
            hurtCastle(w, foeSide, slamDmg);
          }
          w.ev.push({ t: 'chargeHit', side: u.side, x: slamX, y: TC.GROUND_Y - 24 });
        } else if (u.atkCd <= 0) {
          u.atkCd = u.rate;
          u.anim = 0.3;
          u.runT = 0;
          if (u.proj) {
            var tx = target ? target.x : foeCastle.gateX;
            var ty = target ? target.y - 14 : TC.GROUND_Y - 68;
            var dist = Math.max(40, Math.hypot(tx - u.x, ty - u.y));
            w.shots.push({
              id: w.nextId++,
              kind: u.proj,
              side: u.side,
              dir: u.dir,
              sx: u.x + u.dir * 16,
              sy: u.y - (u.flying ? 4 : 20),
              tx: tx,
              ty: ty,
              x: u.x + u.dir * 16,
              y: u.y - (u.flying ? 4 : 20),
              arc: u.proj === 'paint' ? Math.min(72, dist * 0.22) : 12,
              t: 0,
              dur: clamp(dist / 430, 0.16, 0.58),
              dmg: u.dmg,
              airBonus: TC.UNITS[u.type].airBonus || 0,
              splash: u.splash,
              kb: u.kb,
              hitsAir: u.hitsAir,
              targetRef: target || null,
              targetCastle: !target,
              colorIdx: u.id % 5
            });
            w.ev.push({ t: 'shoot', kind: u.proj, side: u.side, x: u.x, y: u.y });
          } else if (target) {
            if (u.splash > 0) {
              dealArea(w, u.side, target.x, target.y, u.splash, u.dmg, u.dir, u.kb, u.hitsAir, true);
            } else {
              hurtUnit(target, u.dmg, u.dir, u.kb);
            }
            w.ev.push({ t: 'bonk', unit: u.type, side: u.side, x: (u.x + target.x) * 0.5, y: target.y - 18 });
          } else if (atCastle) {
            hurtCastle(w, foeSide, u.dmg);
            w.ev.push({ t: 'bonk', unit: u.type, side: u.side, x: foeCastle.gateX, y: TC.GROUND_Y - 40 });
          }
        }
      }

      u.x = clamp(u.x, TC.GATE_L + 8, TC.GATE_R - 8);
    }

    // 5. Projectiles & Castle Cannon shells
    for (var si = w.shots.length - 1; si >= 0; si--) {
      var sh = w.shots[si];
      if (sh.targetRef && sh.targetRef.hp > 0) {
        sh.tx = sh.targetRef.x;
        sh.ty = sh.targetRef.y - 12;
      }
      sh.t += dt;
      var p = clamp(sh.t / sh.dur, 0, 1);
      sh.x = sh.sx + (sh.tx - sh.sx) * p;
      sh.y = sh.sy + (sh.ty - sh.sy) * p - Math.sin(p * Math.PI) * sh.arc;
      if (p >= 1) {
        w.shots.splice(si, 1);
        if (sh.cannonColumn) {
          dealArea(w, sh.side, sh.tx, sh.ty, sh.splash, sh.dmg, sh.dir, sh.kb, true, true, 0);
        } else if (sh.targetCastle) {
          var fc = 1 - sh.side;
          hurtCastle(w, fc, sh.dmg);
        } else {
          dealArea(w, sh.side, sh.tx, sh.ty, sh.splash, sh.dmg, sh.dir, sh.kb, sh.hitsAir, false, sh.airBonus);
        }
        w.ev.push({ t: 'burst', kind: sh.kind, side: sh.side, x: sh.tx, y: sh.ty, colorIdx: sh.colorIdx });
      }
    }

    // 6. Sweep defeated toys
    for (var di = w.units.length - 1; di >= 0; di--) {
      var dead = w.units[di];
      if (dead.hp <= 0) {
        w.units.splice(di, 1);
        w.sides[dead.side].lost++;
        w.sides[1 - dead.side].kills++;
        w.ev.push({ t: 'defeat', side: dead.side, by: 1 - dead.side, unit: dead.type, x: dead.x, y: dead.y });
      }
    }

    // 7. Check victory
    var c0 = w.sides[0], c1 = w.sides[1];
    if (c0.hp <= 0 || c1.hp <= 0) {
      w.done = true;
      w.winner = c1.hp <= 0 ? 1 : 2;
      var stars = w.humans === 1 && w.winner === 1 ? TC.stars(w) : 0;
      w.ev.push({ t: 'end', winner: w.winner, stars: stars });
    }
  };
})();
