/* Juicy Drop (سلّة الفواكه) pure simulation & progression engine.
 * UMD module: exposes window.JD in browsers and module.exports = JD in Node.
 * Pure: zero DOM, zero Kit, zero timers, zero localStorage, zero Math.random. */
(function (root) {
  'use strict';

  var JD = {};
  var W = 1280, H = 720, CX = 640;
  var CLOUD_Y = 94, TOP_Y = 152, FLOOR_Y = 668, BASE_HW = 215;
  var GRAVITY = 980, SUBSTEPS = 4, MAX_V = 900;

  JD.W = W;
  JD.H = H;
  JD.CX = CX;
  JD.CLOUD_Y = CLOUD_Y;
  JD.TOP_Y = TOP_Y;
  JD.FLOOR_Y = FLOOR_Y;
  JD.BASE_HW = BASE_HW;
  JD.WARN_TIME = 1.2;
  JD.OVER_TIME = 2.8;
  JD.DROP_CD = 0.34;
  JD.WATERMELON_BONUS = 500;

  // 10 expressive googly-eyed fruit tiers (0..9).
  JD.FRUITS = [
    { tier: 0, name: 'توت', r: 16, score: 2, color: '#5c6bc0', rim: '#283593', glow: '#9fa8da', leaf: '#66bb6a' },
    { tier: 1, name: 'كرز', r: 22, score: 4, color: '#ff3d6e', rim: '#ad1447', glow: '#ff80ab', leaf: '#43a047' },
    { tier: 2, name: 'تمرة', r: 29, score: 8, color: '#c87636', rim: '#6d3914', glow: '#f5be82', leaf: '#fbc02d' },
    { tier: 3, name: 'تين', r: 37, score: 14, color: '#9c4dcc', rim: '#52187d', glow: '#ce93d8', leaf: '#7cb342' },
    { tier: 4, name: 'ليمونة', r: 46, score: 24, color: '#ffe033', rim: '#c79600', glow: '#fff59d', leaf: '#4caf50' },
    { tier: 5, name: 'برتقالة', r: 56, score: 38, color: '#ff8f1f', rim: '#c45100', glow: '#ffcc80', leaf: '#2e7d32' },
    { tier: 6, name: 'تفاحة', r: 67, score: 56, color: '#ff424e', rim: '#a81323', glow: '#ff8a80', leaf: '#43a047' },
    { tier: 7, name: 'رمانة', r: 79, score: 80, color: '#e62662', rim: '#880e39', glow: '#f48fb1', leaf: '#ffb300' },
    { tier: 8, name: 'شمّام', r: 93, score: 115, color: '#a6e24e', rim: '#4f8a10', glow: '#dcedc8', leaf: '#689f38' },
    { tier: 9, name: 'بطيخة عملاقة', r: 108, score: 160, color: '#2ecc71', rim: '#146c38', glow: '#a5d6a7', leaf: '#1b5e20' }
  ];

  // DDA endpoints: passed into JD.create(modeOrLevel, params).
  JD.EASY = { jarWidthBonus: 36, mergeMagnet: 28, overflowGrace: 0.8, goalScale: 0.8 };
  JD.HARD = { jarWidthBonus: -12, mergeMagnet: 4, overflowGrace: 0, goalScale: 1.2 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  JD.clamp = clamp;

  JD.params = function (k) {
    if (k == null) return { jarWidthBonus: 0, mergeMagnet: 14, overflowGrace: 0, goalScale: 1 };
    k = clamp(+k || 0, 0, 1);
    var out = {};
    for (var key in JD.EASY) out[key] = JD.EASY[key] + (JD.HARD[key] - JD.EASY[key]) * k;
    return out;
  };

  function normParams(P) {
    var base = JD.params(null);
    if (!P || typeof P !== 'object') return base;
    return {
      jarWidthBonus: typeof P.jarWidthBonus === 'number' && isFinite(P.jarWidthBonus) ? clamp(P.jarWidthBonus, -40, 60) : base.jarWidthBonus,
      mergeMagnet: typeof P.mergeMagnet === 'number' && isFinite(P.mergeMagnet) ? clamp(P.mergeMagnet, 0, 48) : base.mergeMagnet,
      overflowGrace: typeof P.overflowGrace === 'number' && isFinite(P.overflowGrace) ? clamp(P.overflowGrace, -0.5, 2) : base.overflowGrace,
      goalScale: typeof P.goalScale === 'number' && isFinite(P.goalScale) ? clamp(P.goalScale, 0.5, 1.6) : base.goalScale
    };
  }

  // Deterministic PRNG (zero Math.random).
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x51f15eed;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------- Worlds & 12 Stages */
  JD.WORLDS = [
    { id: 0, name: 'سلّة الصباح', sub: 'فواكه مشمسة', color: '#ff9f1c', bg0: '#271745', bg1: '#6e2d5c', table: '#8c5322' },
    { id: 1, name: 'مكعبات الثلج', sub: 'ذوّب الجليد بالدمج', color: '#38bdf8', bg0: '#102542', bg1: '#1d5687', table: '#2f6690' },
    { id: 2, name: 'فقاعات العسل', sub: 'فقاعات ذهبية وعمالقة', color: '#fbbf24', bg0: '#2e1a0d', bg1: '#734112', table: '#9a5b1a' }
  ];

  JD.LEVELS = [
    // World 1: سلّة الصباح (Sunny Jar)
    {
      id: '1-1', world: 0, name: 'أول ليمونة', desc: 'ادمج الفواكه لصنع ليمونة!',
      pool: [1, 2, 3], parDrops: 12,
      goals: [{ kind: 'tier', tier: 4, count: 1 }]
    },
    {
      id: '1-2', world: 0, name: 'ثنائي الليمون', desc: 'اصنع ليمونتين في السلّة!',
      pool: [1, 2, 3], parDrops: 18,
      goals: [{ kind: 'tier', tier: 4, count: 2 }]
    },
    {
      id: '1-3', world: 0, name: 'برتقالة الصباح', desc: 'اصنع برتقالة طازجة!',
      pool: [1, 2, 3, 4], parDrops: 18,
      goals: [{ kind: 'tier', tier: 5, count: 1 }]
    },
    {
      id: '1-4', world: 0, name: 'تفاحة البستان', desc: 'اصنع تفاحة حمراء لامعة!',
      pool: [2, 3, 4], parDrops: 22,
      goals: [{ kind: 'tier', tier: 6, count: 1 }]
    },
    // World 2: مكعبات الثلج (Ice Cubes)
    {
      id: '2-1', world: 1, name: 'ذوبان الجليد', desc: 'ادمج قرب الثلج لتذويبه!',
      pool: [1, 2, 3], parDrops: 14,
      ices: [{ ox: -72, tier: 3, hp: 1 }, { ox: 72, tier: 3, hp: 1 }],
      goals: [{ kind: 'melt', count: 2 }, { kind: 'tier', tier: 4, count: 1 }]
    },
    {
      id: '2-2', world: 1, name: 'برتقالة مثلّجة', desc: 'حرّر الليمون واصنع برتقالة!',
      pool: [1, 2, 3, 4], parDrops: 18,
      ices: [{ ox: -86, tier: 4, hp: 1 }, { ox: 0, tier: 3, hp: 1 }, { ox: 86, tier: 4, hp: 1 }],
      goals: [{ kind: 'melt', count: 3 }, { kind: 'tier', tier: 5, count: 1 }]
    },
    {
      id: '2-3', world: 1, name: 'قلعة الصقيع', desc: 'ذوّب المكعبات واصنع تفاحة!',
      pool: [2, 3, 4], parDrops: 22,
      ices: [{ ox: -92, tier: 4, hp: 1 }, { ox: 0, tier: 5, hp: 2 }, { ox: 92, tier: 4, hp: 1 }],
      goals: [{ kind: 'melt', count: 3 }, { kind: 'tier', tier: 6, count: 1 }]
    },
    {
      id: '2-4', world: 1, name: 'ياقوتة الثلج', desc: 'ذوّب الجليد واصنع رمانة!',
      pool: [2, 3, 4], parDrops: 26,
      ices: [{ ox: -96, tier: 5, hp: 1 }, { ox: -24, tier: 6, hp: 2 }, { ox: 48, tier: 5, hp: 1 }, { ox: 108, tier: 4, hp: 1 }],
      goals: [{ kind: 'melt', count: 4 }, { kind: 'tier', tier: 7, count: 1 }]
    },
    // World 3: فقاعات العسل (Honey Bubbles & Giant Melons)
    {
      id: '3-1', world: 2, name: 'فقاعات ذهبية', desc: 'فرقع فقاعات العسل واصنع برتقالتين!',
      pool: [1, 2, 3, 4], parDrops: 20, honeyRate: 2.0,
      goals: [{ kind: 'bubbles', count: 3 }, { kind: 'tier', tier: 5, count: 2 }]
    },
    {
      id: '3-2', world: 2, name: 'تفاح بالعسل', desc: 'فرقع الفقاعات واصنع تفاحتين!',
      pool: [2, 3, 4], parDrops: 24, honeyRate: 1.9,
      goals: [{ kind: 'bubbles', count: 4 }, { kind: 'tier', tier: 6, count: 2 }]
    },
    {
      id: '3-3', world: 2, name: 'تاج الرمان', desc: 'اصنع رمانة ملكية مع فقاعات العسل!',
      pool: [2, 3, 4], parDrops: 26, honeyRate: 1.8,
      ices: [{ ox: 0, tier: 6, hp: 1 }],
      goals: [{ kind: 'bubbles', count: 4 }, { kind: 'tier', tier: 7, count: 1 }]
    },
    {
      id: '3-4', world: 2, name: 'مهرجان البطيخ', desc: 'اصنع شمّامًا عملاقًا في سلّة العسل!',
      pool: [2, 3, 4], parDrops: 30, honeyRate: 1.7,
      ices: [{ ox: -68, tier: 7, hp: 1 }, { ox: 68, tier: 6, hp: 1 }],
      goals: [{ kind: 'bubbles', count: 5 }, { kind: 'tier', tier: 8, count: 1 }]
    }
  ];

  /* ------------------------------------------------------- Shop Catalog */
  JD.JARS = [
    { id: 'glass', name: 'مرطبان زجاجي', price: 0, rim: '#dff6ff', wall: '#7dd3fc', tint: '#bae6fd' },
    { id: 'basket', name: 'سلّة خيزران', price: 6, rim: '#f4a261', wall: '#bc6c25', tint: '#faedcd' },
    { id: 'royal', name: 'إناء ذهبي', price: 14, rim: '#ffe14d', wall: '#e09f00', tint: '#fff3b0' },
    { id: 'space', name: 'خزّان الفضاء', price: 22, rim: '#64dfdf', wall: '#5390d9', tint: '#caf0f8' },
    { id: 'candy', name: 'وعاء الحلوى', price: 30, rim: '#ff70a6', wall: '#ff9770', tint: '#ffd6e0' }
  ];

  JD.FACES = [
    { id: 'kawaii', name: 'وجوه مبتسمة', price: 0 },
    { id: 'cool', name: 'نظارات شمسية', price: 6 },
    { id: 'starry', name: 'عيون النجوم', price: 12 },
    { id: 'silly', name: 'لسان مرح', price: 20 },
    { id: 'whiskers', name: 'قطط نعسانة', price: 28 }
  ];

  /* --------------------------------------------------- World Creation */
  var ENDLESS_SPEC = {
    id: 'endless', world: 0, name: 'اللعب الحر', desc: 'ادمج حتى البطيخة العملاقة!',
    pool: [0, 1, 2, 3, 4], parDrops: 999, goals: []
  };

  function scaleGoal(g, P, maxIces) {
    var count = g.count;
    if (g.kind === 'melt') count = Math.min(maxIces, g.count);
    else if (g.count >= 2) count = Math.max(1, Math.round(g.count * P.goalScale));
    return { kind: g.kind, tier: g.tier != null ? g.tier : -1, target: count, cur: 0, done: false };
  }

  function pickFromPool(w) {
    var pool = w.L.pool;
    return pool[Math.floor(w.rnd() * pool.length) % pool.length];
  }

  JD.create = function (modeOrLevel, params, seed) {
    var endless = modeOrLevel === 'endless';
    var idx = endless ? -1 : clamp(modeOrLevel | 0, 0, JD.LEVELS.length - 1);
    var L = endless ? ENDLESS_SPEC : JD.LEVELS[idx];
    var P = normParams(params);
    var hw = BASE_HW + P.jarWidthBonus;
    var jar = { cx: CX, hw: hw, left: CX - hw, right: CX + hw, top: TOP_Y, bottom: FLOOR_Y };
    var rnd = makeRng(seed != null ? seed : (endless ? 9001 : 1009 + idx * 7919));

    var w = {
      mode: endless ? 'endless' : 'stage',
      level: idx,
      L: L,
      P: P,
      jar: jar,
      rnd: rnd,
      nextId: 1,
      t: 0,
      cloudX: CX,
      dropCd: 0,
      drops: 0,
      merges: 0,
      score: 0,
      combo: 0,
      maxCombo: 0,
      comboTimer: 0,
      shakeCharge: 0,
      shakesUsed: 0,
      shakeAnim: 0,
      melted: 0,
      bubblesPopped: 0,
      watermelonsMerged: 0,
      highestTier: 0,
      made: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      seen: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      overTime: 0,
      warning: false,
      hadWarning: false,
      done: false,
      won: false,
      over: false,
      started: false,
      honeyTimer: L.honeyRate ? L.honeyRate * 0.55 : 0,
      currentTier: 0,
      nextTier: 0,
      fruits: [],
      ices: [],
      bubbles: [],
      goals: [],
      ev: []
    };

    w.currentTier = pickFromPool(w);
    w.nextTier = pickFromPool(w);
    w.seen[w.currentTier] = 1;

    var rawIces = L.ices || [];
    for (var k = 0; k < rawIces.length; k++) {
      var ic = rawIces[k];
      var ir = Math.max(32, JD.FRUITS[ic.tier].r + 6);
      var ix = clamp(CX + ic.ox, jar.left + ir + 4, jar.right - ir - 4);
      w.ices.push({
        id: w.nextId++,
        x: ix,
        y: jar.bottom - ir,
        r: ir,
        tier: ic.tier,
        hp: ic.hp || 1,
        maxHp: ic.hp || 1,
        crackAnim: 0
      });
    }

    for (var g = 0; g < L.goals.length; g++) {
      w.goals.push(scaleGoal(L.goals[g], P, w.ices.length));
    }

    return w;
  };

  JD.cloudBounds = function (w) {
    var r = JD.FRUITS[w.currentTier].r;
    return { min: w.jar.left + r + 5, max: w.jar.right - r - 5, r: r };
  };

  JD.addFruit = function (w, tier, x, y, vx, vy) {
    tier = clamp(tier | 0, 0, JD.FRUITS.length - 1);
    var spec = JD.FRUITS[tier];
    var f = {
      id: w.nextId++,
      tier: tier,
      x: clamp(x, w.jar.left + spec.r, w.jar.right - spec.r),
      y: Math.min(y, w.jar.bottom - spec.r),
      vx: vx || 0,
      vy: vy || 0,
      r: spec.r,
      rot: 0,
      va: 0,
      age: 0,
      popScale: 1,
      landed: false,
      excited: 0,
      removed: false
    };
    w.fruits.push(f);
    w.seen[tier] = 1;
    if (tier > w.highestTier) w.highestTier = tier;
    return f;
  };

  JD.addIce = function (w, tier, x, y, hp) {
    tier = clamp(tier | 0, 0, JD.FRUITS.length - 1);
    var ir = Math.max(32, JD.FRUITS[tier].r + 6);
    var ice = {
      id: w.nextId++,
      x: clamp(x, w.jar.left + ir, w.jar.right - ir),
      y: y != null ? Math.min(y, w.jar.bottom - ir) : w.jar.bottom - ir,
      r: ir,
      tier: tier,
      hp: hp || 1,
      maxHp: hp || 1,
      crackAnim: 0
    };
    w.ices.push(ice);
    return ice;
  };

  JD.addBubble = function (w, x, y) {
    var r = 23;
    var bu = {
      id: w.nextId++,
      x: clamp(x != null ? x : (w.jar.left + r + 20 + w.rnd() * (w.jar.hw * 2 - r * 2 - 40)), w.jar.left + r + 4, w.jar.right - r - 4),
      y: y != null ? y : w.jar.bottom - r - 4,
      r: r,
      vy: -42 - w.rnd() * 14,
      wob: w.rnd() * 6.283
    };
    w.bubbles.push(bu);
    return bu;
  };

  // Raycast straight down from cloudX to show the soft dotted drop guide.
  JD.raycastDrop = function (w, x) {
    var cx = x != null ? x : w.cloudX;
    var bestY = w.jar.bottom, i, o, dx, rad;
    for (i = 0; i < w.fruits.length; i++) {
      o = w.fruits[i];
      dx = cx - o.x;
      rad = o.r + 2;
      if (Math.abs(dx) < rad) {
        var hitY = o.y - Math.sqrt(Math.max(0, rad * rad - dx * dx));
        if (hitY > TOP_Y - 20 && hitY < bestY) bestY = hitY;
      }
    }
    for (i = 0; i < w.ices.length; i++) {
      o = w.ices[i];
      dx = cx - o.x;
      rad = o.r + 2;
      if (Math.abs(dx) < rad) {
        var iy = o.y - Math.sqrt(Math.max(0, rad * rad - dx * dx));
        if (iy < bestY) bestY = iy;
      }
    }
    return bestY;
  };

  /* ------------------------------------------------- Mechanics Helpers */
  var KEY_OFFSETS = [-88, 58, -32, 92, -62, 30, -104, 76];

  function triggerDrop(w, dropX, kind) {
    var b = JD.cloudBounds(w);
    var x = clamp(dropX != null ? dropX : w.cloudX, b.min, b.max);
    var tier = w.currentTier;
    var f = JD.addFruit(w, tier, x, CLOUD_Y + 14, 0, 70);
    f.popScale = 0.85;
    w.drops++;
    w.started = true;
    w.dropCd = JD.DROP_CD;
    w.currentTier = w.nextTier;
    w.nextTier = pickFromPool(w);
    w.seen[w.currentTier] = 1;
    w.ev.push({ t: 'drop', tier: tier, x: f.x, y: f.y, drops: w.drops });

    // One-button keyboard friendliness: if dropped with Space/Enter and no arrow
    // move was held, gently step cloudX across the jar so repeated Space presses
    // spread fruits and create merges naturally.
    var nb = JD.cloudBounds(w);
    if (kind === 'key') {
      var off = KEY_OFFSETS[(w.drops - 1) % KEY_OFFSETS.length];
      w.cloudX = clamp(CX + off, nb.min, nb.max);
    } else {
      w.cloudX = clamp(x, nb.min, nb.max);
    }
  }

  function popBubble(w, idx, why) {
    var bu = w.bubbles[idx];
    w.bubbles.splice(idx, 1);
    w.bubblesPopped++;
    w.score += 15;
    w.shakeCharge = Math.min(100, w.shakeCharge + 22);
    w.ev.push({ t: 'honey_pop', x: bu.x, y: bu.y, why: why || 'touch' });
    // Honey pop gently nudges nearby matching fruit pairs together!
    for (var i = 0; i < w.fruits.length; i++) {
      var a = w.fruits[i];
      if (Math.hypot(a.x - bu.x, a.y - bu.y) < 180) {
        a.vy -= 55;
      }
    }
  }

  function damageIceNear(w, mx, my, reach) {
    for (var i = w.ices.length - 1; i >= 0; i--) {
      var ic = w.ices[i];
      if (Math.hypot(ic.x - mx, ic.y - my) <= ic.r + reach) {
        ic.hp--;
        ic.crackAnim = 1;
        if (ic.hp <= 0) {
          w.ices.splice(i, 1);
          w.melted++;
          var freed = JD.addFruit(w, ic.tier, ic.x, ic.y, 0, -65);
          freed.landed = true;
          freed.age = 1.5;
          freed.popScale = 0.55;
          w.made[ic.tier]++;
          w.score += JD.FRUITS[ic.tier].score;
          w.ev.push({ t: 'melt', tier: ic.tier, x: ic.x, y: ic.y, freed: true, left: 0 });
        } else {
          w.ev.push({ t: 'melt', tier: ic.tier, x: ic.x, y: ic.y, freed: false, left: ic.hp });
        }
      }
    }
  }

  JD.shakeJar = function (w) {
    if (w.done || w.shakeCharge < 100) return false;
    w.shakeCharge = 0;
    w.shakesUsed++;
    w.shakeAnim = 0.55;
    for (var i = 0; i < w.fruits.length; i++) {
      var f = w.fruits[i];
      var toward = (CX - f.x) * 0.85 + ((i % 2 ? 1 : -1) * 55);
      f.vy = Math.min(f.vy, 0) - (235 + (i % 3) * 42);
      f.vx += clamp(toward, -170, 170);
      f.va += (i % 2 ? 2.8 : -2.8);
      // Pull toward nearest same-tier partner!
      var best = null, bd = 260;
      for (var j = 0; j < w.fruits.length; j++) {
        if (i === j || w.fruits[j].tier !== f.tier) continue;
        var o = w.fruits[j], d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best && bd > 1) {
        f.vx += (best.x - f.x) / bd * 145;
        f.vy += (best.y - f.y) / bd * 95;
      }
    }
    w.ev.push({ t: 'shake' });
    return true;
  };

  function mergePair(w, a, b) {
    a.removed = true;
    b.removed = true;
    var mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
    w.combo = w.comboTimer > 0 ? w.combo + 1 : 1;
    w.comboTimer = 1.4;
    if (w.combo > w.maxCombo) w.maxCombo = w.combo;
    w.merges++;
    w.shakeCharge = Math.min(100, w.shakeCharge + 28 + w.combo * 7);

    // Melt nearby frosted cubes & pop nearby honey bubbles!
    damageIceNear(w, mx, my, a.r + 68);
    for (var bi = w.bubbles.length - 1; bi >= 0; bi--) {
      if (Math.hypot(w.bubbles[bi].x - mx, w.bubbles[bi].y - my) <= w.bubbles[bi].r + a.r + 90) {
        popBubble(w, bi, 'merge');
      }
    }

    // Double Giant Watermelon celebration fountain!
    if (a.tier >= JD.FRUITS.length - 1) {
      var bonus = JD.WATERMELON_BONUS;
      w.score += bonus;
      w.watermelonsMerged++;
      w.shakeCharge = 100;
      for (var k = 0; k < w.fruits.length; k++) {
        var fk = w.fruits[k];
        if (fk.removed) continue;
        var dxk = fk.x - mx, dyk = fk.y - my, dk = Math.hypot(dxk, dyk) || 1;
        if (dk < 280) {
          fk.vx += (dxk / dk) * 210;
          fk.vy -= 180;
        }
      }
      w.ev.push({ t: 'watermelon_boom', x: mx, y: my, bonus: bonus, combo: w.combo });
      w.ev.push({ t: 'merge', tier: a.tier, toTier: 10, x: mx, y: my, points: bonus, combo: w.combo });
      return;
    }

    var nextTier = a.tier + 1;
    var spec = JD.FRUITS[nextTier];
    var nx = clamp(mx, w.jar.left + spec.r, w.jar.right - spec.r);
    var ny = Math.min(my, w.jar.bottom - spec.r);
    var nf = JD.addFruit(w, nextTier, nx, ny, (a.vx + b.vx) * 0.32, Math.min(0, (a.vy + b.vy) * 0.28) - 52);
    nf.popScale = 0.42;
    nf.landed = true;
    nf.age = Math.max(a.age, b.age, 1.25);

    var pts = Math.round(spec.score * (1 + (w.combo - 1) * 0.25));
    w.score += pts;
    w.made[nextTier]++;

    // Gentle shockwave jostles neighboring fruits.
    var waveR = spec.r * 2.3;
    for (var m = 0; m < w.fruits.length; m++) {
      var o = w.fruits[m];
      if (o === nf || o.removed) continue;
      var dx = o.x - nx, dy = o.y - ny, d = Math.hypot(dx, dy) || 1;
      if (d < waveR) {
        var push = (1 - d / waveR) * 75;
        o.vx += (dx / d) * push;
        o.vy += (dy / d) * push - 18;
      }
    }

    w.ev.push({ t: 'merge', tier: a.tier, toTier: nextTier, x: nx, y: ny, points: pts, combo: w.combo });
  }

  function updateGoals(w) {
    if (w.mode !== 'stage' || w.done) return;
    var allDone = w.goals.length > 0;
    for (var i = 0; i < w.goals.length; i++) {
      var g = w.goals[i];
      if (g.kind === 'tier') {
        // Count fruits of >= target tier created/freed so merging them further never loses progress!
        var sum = 0;
        for (var t = g.tier; t < w.made.length; t++) sum += w.made[t];
        g.cur = Math.min(g.target, sum);
      } else if (g.kind === 'melt') {
        g.cur = Math.min(g.target, w.melted);
      } else if (g.kind === 'bubbles') {
        g.cur = Math.min(g.target, w.bubblesPopped);
      } else if (g.kind === 'score') {
        g.cur = Math.min(g.target, w.score);
      }
      g.done = g.cur >= g.target;
      if (!g.done) allDone = false;
    }
    if (allDone) {
      w.done = true;
      w.won = true;
      w.warning = false;
      w.ev.push({ t: 'win', level: w.level, score: w.score, drops: w.drops });
    }
  }

  /* --------------------------------------------------- Physics Substep */
  function substep(w, sdt) {
    var jar = w.jar, fruits = w.fruits, ices = w.ices, n = fruits.length, i, j;
    var magnet = w.P.mergeMagnet;
    var merges = [];

    // 1. Integrate gravity & velocities
    for (i = 0; i < n; i++) {
      var f = fruits[i];
      if (f.removed) continue;
      f.vy = clamp(f.vy + GRAVITY * sdt, -MAX_V, MAX_V);
      f.vx = clamp(f.vx * 0.996, -MAX_V, MAX_V);
      f.x += f.vx * sdt;
      f.y += f.vy * sdt;
      f.rot += f.va * sdt;
      f.va *= 0.975;

      // Floor collision
      if (f.y + f.r > jar.bottom) {
        var hitV = f.vy;
        f.y = jar.bottom - f.r;
        if (f.vy > 0) f.vy = f.vy > 55 ? -f.vy * 0.2 : 0;
        f.vx *= 0.90;
        f.va += (f.vx * 0.014 - f.va) * 0.25;
        if (!f.landed) {
          f.landed = true;
          if (hitV > 80) w.ev.push({ t: 'land', tier: f.tier, x: f.x, y: f.y + f.r, power: clamp(hitV / 500, 0.15, 1) });
        }
      }
      // Left & right walls
      if (f.x - f.r < jar.left) {
        f.x = jar.left + f.r;
        if (f.vx < 0) f.vx = -f.vx * 0.28;
      } else if (f.x + f.r > jar.right) {
        f.x = jar.right - f.r;
        if (f.vx > 0) f.vx = -f.vx * 0.28;
      }
    }

    // 2. Collide fruits against static/resting Ice Cubes
    for (i = 0; i < n; i++) {
      var fi = fruits[i];
      if (fi.removed) continue;
      for (j = 0; j < ices.length; j++) {
        var ic = ices[j];
        var idx = fi.x - ic.x, idy = fi.y - ic.y;
        var idist = Math.hypot(idx, idy), imin = fi.r + ic.r;
        if (idist < imin) {
          var inx = idist > 0.001 ? idx / idist : (fi.id % 2 ? 0.25 : -0.25);
          var iny = idist > 0.001 ? idy / idist : -0.97;
          var iover = imin - idist;
          fi.x += inx * iover;
          fi.y += iny * iover;
          var ivn = fi.vx * inx + fi.vy * iny;
          if (ivn < 0) {
            fi.vx -= inx * ivn * 1.24;
            fi.vy -= iny * ivn * 1.24;
            fi.vx += inx * 12;
          }
          if (!fi.landed) {
            fi.landed = true;
            w.ev.push({ t: 'land', tier: fi.tier, x: fi.x, y: fi.y, power: 0.35 });
          }
          fi.x = clamp(fi.x, jar.left + fi.r, jar.right - fi.r);
          if (fi.y + fi.r > jar.bottom) fi.y = jar.bottom - fi.r;
        }
      }
    }

    // 3. Pairwise fruit-fruit collisions & same-tier merge detection
    for (i = 0; i < n; i++) {
      var a = fruits[i];
      if (a.removed) continue;
      for (j = i + 1; j < n; j++) {
        var b = fruits[j];
        if (b.removed) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var dist = Math.hypot(dx, dy), minD = a.r + b.r;

        if (a.tier === b.tier) {
          if (dist < minD + 26) { a.excited = 0.2; b.excited = 0.2; }
          // Merge magnet pulls nearby identical fruits smoothly together!
          if (magnet > 0 && dist > minD && dist < minD + magnet) {
            var pull = (1 - (dist - minD) / magnet) * 240 * sdt;
            var mx = dx / dist, my = dy / dist;
            a.vx += mx * pull; a.vy += my * pull;
            b.vx -= mx * pull; b.vy -= my * pull;
          }
          if (dist <= minD + 1.4) {
            merges.push([a, b]);
            continue;
          }
        }

        if (dist < minD) {
          var nx, ny;
          if (dist > 0.05) {
            nx = dx / dist; ny = dy / dist;
          } else {
            nx = (a.id < b.id ? 0.35 : -0.35); ny = -0.936;
            dist = minD * 0.5;
          }
          // Subtle horizontal roll-off bias prevents unnatural vertical balancing towers
          if (Math.abs(nx) < 0.04 && dy !== 0) {
            nx = ((a.id + b.id) % 2 ? 0.05 : -0.05);
          }
          var overlap = minD - dist;
          var mA = a.r * a.r, mB = b.r * b.r, invSum = 1 / (mA + mB);
          var wA = mB * invSum, wB = mA * invSum;
          a.x -= nx * overlap * wA;
          a.y -= ny * overlap * wA;
          b.x += nx * overlap * wB;
          b.y += ny * overlap * wB;

          var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          var vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            var e = 0.22;
            var jImp = -(1 + e) * vn * invSum;
            a.vx -= nx * jImp * mB;
            a.vy -= ny * jImp * mB;
            b.vx += nx * jImp * mA;
            b.vy += ny * jImp * mA;

            // Tangential rolling spin
            var tx = -ny, ty = nx;
            var vt = rvx * tx + rvy * ty;
            a.va -= clamp(vt * 0.008, -0.4, 0.4);
            b.va += clamp(vt * 0.008, -0.4, 0.4);

            if (!a.landed || !b.landed) {
              var wasNew = !a.landed || !b.landed;
              a.landed = true; b.landed = true;
              if (wasNew && -vn > 75) {
                w.ev.push({ t: 'land', tier: Math.min(a.tier, b.tier), x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, power: clamp(-vn / 520, 0.12, 0.85) });
              }
            }
          } else {
            a.landed = true; b.landed = true;
          }

          // Keep both inside walls/floor after positional separation
          a.x = clamp(a.x, jar.left + a.r, jar.right - a.r);
          b.x = clamp(b.x, jar.left + b.r, jar.right - b.r);
          if (a.y + a.r > jar.bottom) a.y = jar.bottom - a.r;
          if (b.y + b.r > jar.bottom) b.y = jar.bottom - b.r;
        }
      }
    }

    // 4. Execute merges (at most one merge per fruit in this substep)
    for (i = 0; i < merges.length; i++) {
      var ma = merges[i][0], mb = merges[i][1];
      if (!ma.removed && !mb.removed) mergePair(w, ma, mb);
    }
    if (merges.length) {
      for (i = fruits.length - 1; i >= 0; i--) {
        if (fruits[i].removed) fruits.splice(i, 1);
      }
    }
  }

  /* --------------------------------------------------------- Main Step */
  JD.step = function (w, dt, inp) {
    inp = inp || {};
    if (dt <= 0) return w;
    w.t += dt;
    if (w.shakeAnim > 0) w.shakeAnim = Math.max(0, w.shakeAnim - dt);
    if (w.comboTimer > 0) {
      w.comboTimer = Math.max(0, w.comboTimer - dt);
      if (w.comboTimer === 0) w.combo = 0;
    }
    for (var ci = 0; ci < w.ices.length; ci++) {
      if (w.ices[ci].crackAnim > 0) w.ices[ci].crackAnim = Math.max(0, w.ices[ci].crackAnim - dt * 3);
    }
    if (w.done) return w;

    // Cloud aiming (never moves on its own before player input!)
    var bounds = JD.cloudBounds(w);
    if (inp.x != null && isFinite(inp.x)) {
      w.cloudX = clamp(inp.x, bounds.min, bounds.max);
    } else if (inp.move) {
      w.cloudX = clamp(w.cloudX + clamp(inp.move, -1, 1) * 460 * dt, bounds.min, bounds.max);
    } else {
      w.cloudX = clamp(w.cloudX, bounds.min, bounds.max);
    }

    if (w.dropCd > 0) w.dropCd = Math.max(0, w.dropCd - dt);
    if (inp.shake) JD.shakeJar(w);
    if (inp.drop && w.dropCd <= 0) {
      triggerDrop(w, inp.dropKind === 'pointer' && inp.x != null ? inp.x : w.cloudX, inp.dropKind || 'pointer');
    }

    // Honey bubbles in World 3 spawn & float once play has started (drops > 0 or manual addBubble)
    if (w.L.honeyRate && w.drops > 0) {
      w.honeyTimer -= dt;
      if (w.honeyTimer <= 0 && w.bubbles.length < 4) {
        w.honeyTimer = w.L.honeyRate;
        JD.addBubble(w);
      }
    }
    for (var bi = w.bubbles.length - 1; bi >= 0; bi--) {
      var bu = w.bubbles[bi];
      bu.y += bu.vy * dt;
      bu.x = clamp(bu.x + Math.sin(w.t * 2.6 + bu.wob) * 22 * dt, w.jar.left + bu.r + 4, w.jar.right - bu.r - 4);
      var popped = false;
      for (var fk = 0; fk < w.fruits.length; fk++) {
        var fr = w.fruits[fk];
        var dbf = Math.hypot(fr.x - bu.x, fr.y - bu.y);
        if (dbf < fr.r + bu.r * 0.88) {
          fr.vy -= 45;
          popBubble(w, bi, 'fruit');
          popped = true;
          break;
        }
      }
      if (!popped && bu.y - bu.r < w.jar.top + 6) {
        w.bubbles.splice(bi, 1);
      }
    }

    // Substepped 2D circle physics
    var sdt = dt / SUBSTEPS;
    for (var s = 0; s < SUBSTEPS; s++) substep(w, sdt);

    // Fruit ages & squash/stretch animations
    var anyOverflowing = false;
    for (var fi = 0; fi < w.fruits.length; fi++) {
      var f = w.fruits[fi];
      f.age += dt;
      if (f.popScale < 1) f.popScale = Math.min(1, f.popScale + dt * 4.2);
      if (f.excited > 0) f.excited = Math.max(0, f.excited - dt);
      // Only a fruit that has landed or lived past initial fall can count toward overflow
      if ((f.landed || f.age >= 0.75) && f.y - f.r < w.jar.top) {
        anyOverflowing = true;
      }
    }

    updateGoals(w);
    if (w.done) return w;

    // Fair overflow rule:
    // - Warns with pulsing glow only after settled overflow reaches 1.2s
    // - Triggers round end only after 2.8s (+ overflowGrace) continuous overflow
    if (anyOverflowing) {
      var wasWarn = w.warning;
      w.overTime += dt;
      if (w.overTime >= JD.WARN_TIME) {
        w.warning = true;
        w.hadWarning = true;
        if (!wasWarn) w.ev.push({ t: 'warn' });
      }
      var limit = Math.max(JD.WARN_TIME + 0.4, JD.OVER_TIME + w.P.overflowGrace);
      if (w.overTime >= limit) {
        w.done = true;
        w.won = false;
        w.over = true;
        w.ev.push({ t: 'overflow', score: w.score });
      }
    } else {
      w.overTime = 0;
      w.warning = false;
    }

    return w;
  };

  /* ----------------------------------------- Stars, Coins & DDA Outcomes */
  JD.stars = function (w) {
    if (!w || !w.won) return 0;
    return 1 + (w.drops <= w.L.parDrops ? 1 : 0) + (!w.hadWarning ? 1 : 0);
  };

  JD.stageCoins = function (w, stars) {
    if (!w) return 0;
    if (!w.won) return w.drops >= 8 && w.merges >= 3 ? 1 : 0;
    return 3 + stars * 2 + Math.min(6, Math.floor(w.maxCombo / 2)) + w.watermelonsMerged * 10;
  };

  // Like PR #75: endless mode ONLY pays coins when drops >= 5!
  JD.endlessCoins = function (w) {
    if (!w || w.drops < 5) return 0;
    return Math.max(1, Math.floor(w.score / 32) + w.watermelonsMerged * 10);
  };

  JD.outcome = function (w) {
    if (!w) return 0;
    if (w.won) {
      var st = JD.stars(w);
      return [0, 0.62, 0.82, 1][st];
    }
    var prog = 0;
    if (w.goals.length) {
      var sum = 0;
      for (var i = 0; i < w.goals.length; i++) sum += w.goals[i].cur / Math.max(1, w.goals[i].target);
      prog = sum / w.goals.length;
    }
    return Math.round(clamp(prog * 0.35, 0, 0.35) * 1000) / 1000;
  };

  JD.endlessOutcome = function (w) {
    if (!w || w.drops < 8) return null;
    return Math.round(clamp(w.score / 850, 0.15, 1) * 1000) / 1000;
  };

  /* --------------------------------------------------- Save & Shop State */
  JD.freshSave = function () {
    return {
      v: 1,
      lv: JD.LEVELS.map(function () { return { s: 0, hi: 0 }; }),
      bestEndless: 0,
      coins: 0,
      jars: JD.JARS.map(function (_, i) { return i === 0 ? 1 : 0; }),
      faces: JD.FACES.map(function (_, i) { return i === 0 ? 1 : 0; }),
      jar: 0,
      face: 0,
      coach: false
    };
  };

  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function asObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

  JD.loadSave = function (raw) {
    var s = JD.freshSave(), r = asObj(raw);
    if (!r || r.v !== 1) return s;
    var lv = Array.isArray(r.lv) ? r.lv : [];
    for (var i = 0; i < s.lv.length; i++) {
      var o = asObj(lv[i]);
      if (!o) continue;
      s.lv[i].s = isInt(o.s, 0, 3) ? o.s : 0;
      s.lv[i].hi = isInt(o.hi, 0, 9999999) ? o.hi : 0;
    }
    s.bestEndless = isInt(r.bestEndless, 0, 9999999) ? r.bestEndless : 0;
    s.coins = isInt(r.coins, 0, 999999) ? r.coins : 0;
    ['jars', 'faces'].forEach(function (key) {
      var arr = Array.isArray(r[key]) ? r[key] : [];
      s[key] = s[key].map(function (_, idx) { return idx === 0 || arr[idx] === 1 ? 1 : 0; });
    });
    s.jar = isInt(r.jar, 0, JD.JARS.length - 1) && s.jars[r.jar] ? r.jar : 0;
    s.face = isInt(r.face, 0, JD.FACES.length - 1) && s.faces[r.face] ? r.face : 0;
    s.coach = r.coach === true;
    return s;
  };

  JD.isOpen = function (s, i) {
    return i === 0 || (i > 0 && i < JD.LEVELS.length && s.lv[i - 1].s > 0);
  };

  JD.totalStars = function (s) {
    var n = 0;
    for (var i = 0; i < s.lv.length; i++) n += s.lv[i].s;
    return n;
  };

  JD.nextLevel = function (s) {
    var top = 0;
    for (var i = 0; i < JD.LEVELS.length; i++) {
      if (!JD.isOpen(s, i)) break;
      top = i;
      if (!s.lv[i].s) return i;
    }
    return top;
  };

  JD.applyStageResult = function (s, i, stars, score, coins) {
    var e = s.lv[i];
    var out = {
      first: e.s === 0 && stars > 0,
      best: e.hi > 0 && score > e.hi,
      moreStars: stars > e.s,
      coins: Math.max(0, coins | 0),
      opened: -1,
      world: -1
    };
    if (stars > e.s) e.s = stars;
    if (score > e.hi) e.hi = Math.min(9999999, score | 0);
    s.coins = Math.min(999999, s.coins + out.coins);
    if (out.first && i + 1 < JD.LEVELS.length) {
      out.opened = i + 1;
      if ((i + 1) % 4 === 0) out.world = (i + 1) / 4;
    }
    return out;
  };

  JD.applyEndlessResult = function (s, score, drops, coins) {
    var validCoins = drops >= 5 ? Math.max(0, coins | 0) : 0;
    var best = score > s.bestEndless && score > 0;
    if (score > s.bestEndless) s.bestEndless = Math.min(9999999, score | 0);
    s.coins = Math.min(999999, s.coins + validCoins);
    return { best: best, coins: validCoins };
  };

  JD.buy = function (s, kind, k) {
    var list = kind === 'face' ? JD.FACES : JD.JARS;
    var own = kind === 'face' ? s.faces : s.jars;
    var key = kind === 'face' ? 'face' : 'jar';
    if (!list[k]) return '';
    if (own[k]) { s[key] = k; return 'wear'; }
    if (s.coins < list[k].price) return '';
    s.coins -= list[k].price;
    own[k] = 1;
    s[key] = k;
    return 'bought';
  };

  if (typeof window !== 'undefined') window.JD = JD;
  if (typeof module !== 'undefined' && module.exports) module.exports = JD;
  else if (root) root.JD = JD;
})(typeof window !== 'undefined' ? window : this);
