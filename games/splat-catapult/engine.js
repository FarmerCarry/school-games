/* Splat Catapult (مقلاع الألوان) pure simulation engine:
 * 16 solo campaign levels across 4 themed worlds, 5 trick paint balloons with mid-air
 * special powers, 2-player hotseat fort duel, blocks/bots/jelly/fans/TNT/portals physics,
 * DDA scaling, shop items, and save validation.
 * Pure UMD: no DOM, no Kit, no timers, no Math.random. */
(function (root, factory) {
  'use strict';
  var SC = factory();
  if (typeof window !== 'undefined') window.SC = SC;
  if (typeof module !== 'undefined' && module.exports) module.exports = SC;
  if (root && typeof root === 'object') root.SC = SC;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SC = {};
  var W = 1280, H = 720, GROUND = 636;
  SC.W = W; SC.H = H; SC.GROUND = GROUND;
  SC.GRAV = 620;
  SC.MIN_SPEED = 350;
  SC.MAX_SPEED = 890;
  SC.MAX_PULL = 130;
  SC.MIN_PULL = 18;
  SC.MIN_ANGLE = -0.22;
  SC.MAX_ANGLE = 1.35;

  // DDA endpoints: easy gives younger children a longer trajectory guide, bigger splat
  // forgiveness, gentler fans, and softer bot armour; hard tightens all four.
  SC.EASY = { arcDots: 18, hitRadiusBonus: 8, botHpScale: 0.8, windScale: 0.5 };
  SC.HARD = { arcDots: 6, hitRadiusBonus: 0, botHpScale: 1.25, windScale: 1.35 };
  SC.NEUTRAL = { arcDots: 12, hitRadiusBonus: 4, botHpScale: 1.0, windScale: 1.0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  SC.clamp = clamp;

  SC.params = function (k) {
    k = clamp(+k || 0, 0, 1);
    return {
      arcDots: Math.round(SC.EASY.arcDots + (SC.HARD.arcDots - SC.EASY.arcDots) * k),
      hitRadiusBonus: SC.EASY.hitRadiusBonus + (SC.HARD.hitRadiusBonus - SC.EASY.hitRadiusBonus) * k,
      botHpScale: SC.EASY.botHpScale + (SC.HARD.botHpScale - SC.EASY.botHpScale) * k,
      windScale: SC.EASY.windScale + (SC.HARD.windScale - SC.EASY.windScale) * k
    };
  };

  function normParams(P) {
    var d = SC.NEUTRAL;
    if (!P || typeof P !== 'object') return { arcDots: d.arcDots, hitRadiusBonus: d.hitRadiusBonus, botHpScale: d.botHpScale, windScale: d.windScale };
    return {
      arcDots: clamp(Math.round(P.arcDots == null ? d.arcDots : P.arcDots), 3, 28),
      hitRadiusBonus: clamp(P.hitRadiusBonus == null ? d.hitRadiusBonus : +P.hitRadiusBonus, 0, 18),
      botHpScale: clamp(P.botHpScale == null ? d.botHpScale : +P.botHpScale, 0.5, 2),
      windScale: clamp(P.windScale == null ? d.windScale : +P.windScale, 0, 2.5)
    };
  }

  // Deterministic PRNG for decorative splat seeds inside the engine.
  function makeRng(seed) {
    var s = (seed >>> 0) || 1234567;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* --------------------------------------------------- worlds & balloons */
  SC.WORLDS = [
    { id: 0, name: 'حديقة الألوان', color: '#3ddc84', accent: '#ffd23f', sky0: '#35b8ff', sky1: '#c4f5ff', hill0: '#5de38a', hill1: '#28b865', ground: '#229a52', dirt: '#8c532b' },
    { id: 1, name: 'قلعة الهلام', color: '#ff6bb5', accent: '#3df0ff', sky0: '#ff78b4', sky1: '#ffe6f3', hill0: '#ffa8d8', hill1: '#e858a5', ground: '#cf3a88', dirt: '#752258' },
    { id: 2, name: 'وادي المراوح', color: '#ffb82e', accent: '#ff5d7a', sky0: '#ff9238', sky1: '#fff1bd', hill0: '#ffbe55', hill1: '#df8320', ground: '#c46a18', dirt: '#693710' },
    { id: 3, name: 'حصن الفضاء', color: '#a855f7', accent: '#38bdf8', sky0: '#14103c', sky1: '#3c1e78', hill0: '#332673', hill1: '#1f1650', ground: '#2c2068', dirt: '#140e36' }
  ];

  SC.BALLOONS = {
    classic: { id: 'classic', name: 'بالون الطلاء', short: 'طلاء', color: '#ff4d8d', glow: '#ff9ec2', r: 18, mass: 1.0, dmg: 68, splatR: 98, bounces: 0 },
    triple:  { id: 'triple',  name: 'ثلاثي التوت', short: 'ثلاثي', color: '#24c8ff', glow: '#9ee8ff', r: 16, mass: 0.9, dmg: 54, splatR: 78, bounces: 0 },
    heavy:   { id: 'heavy',   name: 'بطيخة ثقيلة', short: 'ثقيلة', color: '#3cd458', glow: '#ff5468', r: 23, mass: 2.1, dmg: 120, splatR: 124, bounces: 0 },
    bouncy:  { id: 'bouncy',  name: 'فقاعة مرتدّة', short: 'مرتدّة', color: '#ffb82e', glow: '#ffe98a', r: 18, mass: 1.0, dmg: 56, splatR: 84, bounces: 4 },
    magnet:  { id: 'magnet',  name: 'مغناطيس الهلام', short: 'مغناطيس', color: '#a855f7', glow: '#e879f9', r: 19, mass: 1.15, dmg: 62, splatR: 94, bounces: 0 }
  };
  SC.BALLOON_KEYS = ['classic', 'triple', 'heavy', 'bouncy', 'magnet'];

  SC.MATS = {
    wood:  { hp: 50, mass: 1.2, color: '#d88c46', hi: '#f2b272', stroke: '#6e3b14', score: 100 },
    ice:   { hp: 28, mass: 0.85, color: '#7ce8ff', hi: '#d9f9ff', stroke: '#18779e', score: 100 },
    stone: { hp: 105, mass: 2.2, color: '#8e86b8', hi: '#bcb6de', stroke: '#3a3461', score: 150 }
  };

  /* ----------------------------------------------------------- shop data */
  SC.SKINS = [
    { name: 'توتي وردي', tint: '#ff4d8d', shine: '#ffc2da', pattern: 'dots', price: 0 },
    { name: 'سماوي لامع', tint: '#22d3ee', shine: '#cffafe', pattern: 'stars', price: 8 },
    { name: 'ليموني مشمس', tint: '#facc15', shine: '#fef9c3', pattern: 'swirl', price: 14 },
    { name: 'تفاحي مرح', tint: '#4ade80', shine: '#dcfce7', pattern: 'stripes', price: 22 },
    { name: 'برتقالي ناري', tint: '#ff7a18', shine: '#ffedd5', pattern: 'bolts', price: 30 },
    { name: 'قوس المجرة', tint: '#c084fc', shine: '#fae8ff', pattern: 'rainbow', price: 42 }
  ];

  SC.FRAMES = [
    { name: 'خشب البلوط', c0: '#c97a3d', c1: '#8c4b1f', band: '#ff4d8d', price: 0 },
    { name: 'حلوى النعناع', c0: '#ff7ab6', c1: '#2dd4bf', band: '#ffd23f', price: 10 },
    { name: 'ذهب البطولة', c0: '#fbbf24', c1: '#b45309', band: '#38bdf8', price: 18 },
    { name: 'كريستال الجليد', c0: '#67e8f9', c1: '#0284c7', band: '#f472b6', price: 28 },
    { name: 'نيون الفضاء', c0: '#6366f1', c1: '#1e1b4b', band: '#4ade80', price: 40 }
  ];

  /* ------------------------------------------------------ level builders */
  var G = GROUND;
  function blk(x, botY, w, h, mat, side) { return { x: x, y: botY - h / 2, w: w, h: h, mat: mat || 'wood', side: side || 2 }; }
  function bot(x, botY, boss, side) { var r = boss ? 28 : 22; return { x: x, y: botY - r, r: r, boss: !!boss, side: side || 2 }; }
  function tnt(x, botY) { return { x: x, y: botY - 24, r: 24 }; }
  function plat(x, botY, w, h) { return { x: x, y: botY - h / 2, w: w, h: h }; }
  function jelly(x, botY, w, h, nx, ny) {
    var l = Math.hypot(nx || 0, ny == null ? -1 : ny) || 1;
    return { x: x, y: botY - (h || 24) / 2, w: w || 108, h: h || 24, nx: (nx || 0) / l, ny: (ny == null ? -1 : ny) / l };
  }
  function fan(x, y, w, h, fx, fy) { return { x: x, y: y, w: w, h: h, fx: fx, fy: fy }; }
  function portal(ax, ay, bx, by, r, color) { return { ax: ax, ay: ay, bx: bx, by: by, r: r || 38, color: color || '#38bdf8' }; }

  // 16 Campaign Levels: 4 worlds x 4 levels.
  SC.LEVELS = [
    // World 1: حديقة الألوان (Meadow Forts)
    {
      id: '1-1', world: 0, name: 'البرج الأول', parLeft: 2,
      queue: ['classic', 'classic', 'triple', 'classic'],
      blocks: [blk(770, G, 28, 92, 'wood'), blk(860, G, 28, 92, 'wood'), blk(815, G - 92, 134, 22, 'wood')],
      bots: [bot(815, G), bot(815, G - 114)]
    },
    {
      id: '1-2', world: 0, name: 'توأم التوت', parLeft: 2,
      queue: ['triple', 'classic', 'triple', 'classic'],
      blocks: [blk(720, G, 34, 78, 'wood'), blk(850, G, 34, 114, 'wood'), blk(980, G, 34, 78, 'wood')],
      bots: [bot(720, G - 78), bot(850, G - 114), bot(980, G - 78)]
    },
    {
      id: '1-3', world: 0, name: 'جسر الخشب', parLeft: 2,
      queue: ['heavy', 'classic', 'triple', 'heavy'],
      blocks: [
        blk(790, G, 28, 98, 'wood'), blk(930, G, 28, 98, 'wood'), blk(860, G - 98, 184, 22, 'wood'),
        blk(815, G - 120, 24, 74, 'wood'), blk(905, G - 120, 24, 74, 'wood'), blk(860, G - 194, 132, 20, 'wood')
      ],
      bots: [bot(860, G), bot(860, G - 120), bot(860, G - 214)]
    },
    {
      id: '1-4', world: 0, name: 'قلعة الحديقة', parLeft: 2,
      queue: ['triple', 'heavy', 'classic', 'triple', 'heavy'],
      blocks: [
        blk(735, G, 32, 84, 'wood'),
        blk(845, G, 28, 108, 'wood'), blk(955, G, 28, 108, 'wood'), blk(900, G - 108, 152, 22, 'wood'),
        blk(1050, G, 32, 126, 'wood')
      ],
      bots: [bot(735, G - 84), bot(900, G), bot(900, G - 130), bot(1050, G - 126)]
    },

    // World 2: قلعة الهلام (Jelly Bouncers)
    {
      id: '2-1', world: 1, name: 'وسادة الهلام', parLeft: 2,
      queue: ['bouncy', 'classic', 'bouncy', 'triple'],
      jellies: [jelly(600, G, 116, 24, 0.14, -0.99)],
      blocks: [
        blk(730, G, 30, 116, 'wood'),
        blk(860, G, 26, 94, 'ice'), blk(960, G, 26, 94, 'ice'), blk(910, G - 94, 138, 20, 'ice')
      ],
      bots: [bot(910, G), bot(910, G - 114)]
    },
    {
      id: '2-2', world: 1, name: 'أبراج الجليد', parLeft: 2,
      queue: ['bouncy', 'triple', 'classic', 'heavy'],
      jellies: [jelly(640, G, 110, 24, 0.18, -0.98), jelly(1135, G - 50, 26, 130, -1, -0.15)],
      blocks: [blk(805, G, 30, 88, 'ice'), blk(915, G, 30, 132, 'ice'), blk(1025, G, 30, 88, 'ice')],
      bots: [bot(805, G - 88), bot(915, G - 132), bot(1025, G - 88)]
    },
    {
      id: '2-3', world: 1, name: 'ارتداد مزدوج', parLeft: 2,
      queue: ['bouncy', 'triple', 'bouncy', 'heavy', 'classic'],
      plats: [plat(790, G - 210, 136, 20)],
      jellies: [jelly(585, G, 114, 24, 0.12, -0.99), jelly(790, G - 230, 114, 22, 0.22, -0.97)],
      blocks: [
        blk(745, G, 26, 86, 'ice'), blk(835, G, 26, 86, 'ice'), blk(790, G - 86, 120, 18, 'ice'),
        blk(955, G, 26, 102, 'ice'), blk(1045, G, 26, 102, 'ice'), blk(1000, G - 102, 126, 20, 'ice')
      ],
      bots: [bot(790, G), bot(1000, G), bot(1000, G - 122)]
    },
    {
      id: '2-4', world: 1, name: 'قصر الحلوى', parLeft: 2,
      queue: ['magnet', 'bouncy', 'triple', 'heavy', 'classic'],
      jellies: [jelly(615, G, 112, 24, 0.14, -0.99)],
      blocks: [
        blk(775, G, 26, 98, 'ice'), blk(855, G, 26, 98, 'ice'), blk(815, G - 98, 114, 20, 'wood'),
        blk(955, G, 26, 98, 'ice'), blk(1035, G, 26, 98, 'ice'), blk(995, G - 98, 114, 20, 'wood')
      ],
      bots: [bot(815, G), bot(815, G - 118), bot(995, G), bot(995, G - 118)]
    },

    // World 3: وادي المراوح (Windmill Valley)
    {
      id: '3-1', world: 2, name: 'برميل قوس قزح', parLeft: 2,
      queue: ['classic', 'triple', 'bouncy', 'heavy'],
      fans: [fan(560, 480, 110, 260, 40, -300)],
      barrels: [tnt(890, G)],
      blocks: [blk(810, G, 28, 104, 'wood'), blk(970, G, 28, 104, 'wood'), blk(890, G - 104, 196, 20, 'ice')],
      bots: [bot(810, G - 124), bot(890, G - 124), bot(970, G - 124)]
    },
    {
      id: '3-2', world: 2, name: 'نسيم المروحة', parLeft: 2,
      queue: ['classic', 'magnet', 'triple', 'heavy', 'bouncy'],
      plats: [plat(680, G, 34, 160)],
      fans: [fan(555, 470, 125, 300, 55, -410)],
      barrels: [tnt(875, G)],
      blocks: [
        blk(820, G, 26, 96, 'wood'), blk(930, G, 26, 96, 'wood'), blk(875, G - 96, 146, 20, 'wood'),
        blk(1035, G, 32, 84, 'ice')
      ],
      bots: [bot(875, G - 116), bot(980, G), bot(1035, G - 84)]
    },
    {
      id: '3-3', world: 2, name: 'سلسلة الألوان', parLeft: 2,
      queue: ['triple', 'bouncy', 'magnet', 'heavy', 'classic'],
      fans: [fan(600, 450, 120, 280, 80, -240)],
      barrels: [tnt(830, G), tnt(995, G - 122)],
      blocks: [
        blk(775, G, 26, 102, 'wood'), blk(885, G, 26, 102, 'wood'), blk(830, G - 102, 144, 20, 'wood'),
        blk(945, G, 26, 102, 'ice'), blk(1045, G, 26, 102, 'ice'), blk(995, G - 102, 134, 20, 'wood')
      ],
      bots: [bot(740, G), bot(830, G - 122), bot(995, G), bot(1080, G)]
    },
    {
      id: '3-4', world: 2, name: 'طاحونة الهواء', parLeft: 2,
      queue: ['magnet', 'heavy', 'triple', 'bouncy', 'classic'],
      plats: [plat(920, G - 165, 220, 22)],
      fans: [fan(555, 470, 115, 280, 20, -370), fan(860, 270, 180, 140, -110, 35)],
      barrels: [tnt(910, G), tnt(920, G - 187)],
      blocks: [
        blk(790, G, 28, 92, 'stone'),
        blk(865, G - 187, 26, 84, 'wood'), blk(975, G - 187, 26, 84, 'wood'), blk(920, G - 271, 144, 20, 'ice')
      ],
      bots: [bot(845, G), bot(975, G), bot(865, G - 291), bot(975, G - 291)]
    },

    // World 4: حصن الفضاء (Space Citadel)
    {
      id: '4-1', world: 3, name: 'بوابة النجوم', parLeft: 2,
      queue: ['classic', 'bouncy', 'triple', 'heavy'],
      plats: [plat(735, G, 38, 225)],
      portals: [portal(555, 415, 900, 255, 40, '#38bdf8')],
      barrels: [tnt(900, G)],
      blocks: [blk(840, G, 28, 100, 'stone'), blk(960, G, 28, 100, 'stone'), blk(900, G - 100, 158, 22, 'ice')],
      bots: [bot(845, G - 122), bot(955, G - 122), bot(1035, G)]
    },
    {
      id: '4-2', world: 3, name: 'قوس الحجر', parLeft: 2,
      queue: ['heavy', 'magnet', 'triple', 'bouncy', 'classic'],
      portals: [portal(540, 470, 880, 225, 40, '#c084fc')],
      barrels: [tnt(880, G - 134)],
      blocks: [
        blk(735, G, 28, 86, 'ice'),
        blk(810, G, 30, 110, 'stone'), blk(950, G, 30, 110, 'stone'), blk(880, G - 110, 176, 24, 'stone'),
        blk(1025, G, 28, 86, 'ice')
      ],
      bots: [bot(735, G - 86), bot(880, G), bot(1025, G - 86)]
    },
    {
      id: '4-3', world: 3, name: 'مدار الهلام', parLeft: 2,
      queue: ['bouncy', 'triple', 'magnet', 'heavy', 'classic'],
      jellies: [jelly(550, G, 112, 24, 0.14, -0.99)],
      portals: [portal(690, 355, 960, 245, 40, '#3ddc84')],
      fans: [fan(820, 480, 110, 240, 75, -250)],
      barrels: [tnt(960, G)],
      blocks: [blk(900, G, 28, 104, 'stone'), blk(1020, G, 28, 104, 'stone'), blk(960, G - 104, 156, 20, 'wood')],
      bots: [bot(830, G), bot(905, G - 124), bot(1015, G - 124), bot(1090, G)]
    },
    {
      id: '4-4', world: 3, name: 'عرش المجرة', parLeft: 2,
      queue: ['triple', 'heavy', 'magnet', 'bouncy', 'classic', 'heavy'],
      jellies: [jelly(615, G, 108, 24, 0.14, -0.99)],
      portals: [portal(525, 405, 910, 210, 42, '#f472b6')],
      barrels: [tnt(815, G), tnt(885, G - 144)],
      blocks: [
        blk(745, G, 28, 90, 'ice'),
        blk(875, G, 32, 120, 'stone'), blk(995, G, 32, 120, 'stone'), blk(935, G - 120, 164, 24, 'stone'),
        blk(1065, G, 28, 72, 'ice'), blk(1135, G, 28, 96, 'ice')
      ],
      bots: [bot(745, G - 90), bot(935, G), bot(955, G - 144, true), bot(1065, G - 72), bot(1135, G - 96)]
    }
  ];

  /* --------------------------------------------------- world instantiation */
  function instantiate(spec, mode, idx, P) {
    var rnd = makeRng(1009 + (idx + 2) * 7919);
    var blocks = (spec.blocks || []).map(function (b, i) {
      var m = SC.MATS[b.mat] || SC.MATS.wood;
      return {
        id: i, x: b.x, y: b.y, w: b.w, h: b.h, vx: 0, vy: 0, rot: 0, vrot: 0,
        mat: b.mat || 'wood', hp: m.hp, maxHp: m.hp, mass: m.mass,
        side: b.side || 2, alive: true, sleeping: true, restT: 0, paint: ''
      };
    });
    var bots = (spec.bots || []).map(function (b, i) {
      var baseHp = b.boss ? 58 : 34;
      var hp = Math.max(10, Math.round(baseHp * P.botHpScale));
      return {
        id: i, x: b.x, y: b.y, r: b.r || 22, vx: 0, vy: 0,
        hp: hp, maxHp: hp, boss: !!b.boss, side: b.side || 2,
        alive: true, sleeping: true, restT: 0, flash: 0, paint: ''
      };
    });
    var barrels = (spec.barrels || []).map(function (b, i) {
      return { id: i, x: b.x, y: b.y, r: b.r || 24, alive: true };
    });
    var jellies = (spec.jellies || []).map(function (j) {
      return { x: j.x, y: j.y, w: j.w, h: j.h, nx: j.nx, ny: j.ny, wobble: 0 };
    });
    var fans = (spec.fans || []).map(function (f) {
      return { x: f.x, y: f.y, w: f.w, h: f.h, fx: f.fx, fy: f.fy, phase: 0 };
    });
    var portals = (spec.portals || []).map(function (p) {
      return { ax: p.ax, ay: p.ay, bx: p.bx, by: p.by, r: p.r, color: p.color, phase: 0 };
    });
    var plats = (spec.plats || []).map(function (p) {
      return { x: p.x, y: p.y, w: p.w, h: p.h };
    });

    return {
      mode: mode,
      level: idx,
      id: spec.id,
      world: spec.world || 0,
      name: spec.name,
      parLeft: spec.parLeft == null ? 2 : spec.parLeft,
      P: P,
      rnd: rnd,
      t: 0,
      phase: 'aim',
      turn: 1,
      winner: 0,
      slings: spec.slings || [{ x: 210, y: 518 }],
      duelAim: [{ angle: 0.48, power: 0.68 }, { angle: 0.48, power: 0.68 }],
      aimAngle: 0.44,
      aimPower: 0.66,
      queue: (spec.queue || ['classic']).slice(),
      queueIndex: 0,
      shots: 0,
      score: 0,
      coinsEarned: 0,
      blocksSmashed: 0,
      botsPopped: 0,
      shotHitAny: false,
      shotBotsPopped: 0,
      settleT: 0,
      blocks: blocks,
      bots: bots,
      barrels: barrels,
      jellies: jellies,
      fans: fans,
      portals: portals,
      plats: plats,
      projectiles: [],
      vortexes: [],
      splats: [],
      ev: []
    };
  }

  SC.createLevel = function (idx, params) {
    if (idx === 'duel') return SC.createDuel();
    var i = clamp(idx | 0, 0, SC.LEVELS.length - 1);
    return instantiate(SC.LEVELS[i], 'solo', i, normParams(params));
  };

  SC.createDuel = function () {
    var spec = {
      id: 'duel', world: 0, name: 'مواجهة اثنين',
      slings: [{ x: 355, y: 522 }, { x: 925, y: 522 }],
      jellies: [jelly(640, G, 112, 24, 0, -1)],
      blocks: [
        // Player 1 fort (left, side 1)
        blk(95, G, 28, 108, 'wood', 1),
        blk(158, G, 26, 78, 'ice', 1), blk(224, G, 26, 78, 'ice', 1), blk(191, G - 78, 104, 20, 'wood', 1),
        // Player 2 fort (right, side 2 — exact mirror x' = 1280 - x)
        blk(1185, G, 28, 108, 'wood', 2),
        blk(1122, G, 26, 78, 'ice', 2), blk(1056, G, 26, 78, 'ice', 2), blk(1089, G - 78, 104, 20, 'wood', 2)
      ],
      bots: [
        bot(95, G - 108, false, 1), bot(191, G, false, 1), bot(191, G - 98, false, 1),
        bot(1185, G - 108, false, 2), bot(1089, G, false, 2), bot(1089, G - 98, false, 2)
      ],
      queue: SC.BALLOON_KEYS.slice()
    };
    var w = instantiate(spec, 'duel', -1, { arcDots: 12, hitRadiusBonus: 4, botHpScale: 1.0, windScale: 1.0 });
    w.aimAngle = 0.48; w.aimPower = 0.68;
    return w;
  };

  /* --------------------------------------------------- aiming & shooting */
  SC.activeSling = function (w) {
    return w.mode === 'duel' ? w.slings[w.turn - 1] : w.slings[0];
  };
  SC.aimDir = function (w) { return w.mode === 'duel' && w.turn === 2 ? -1 : 1; };

  SC.currentBalloon = function (w) {
    if (w.mode === 'duel') return SC.BALLOON_KEYS[Math.floor(w.shots / 2) % SC.BALLOON_KEYS.length];
    return w.queue[w.queueIndex] || null;
  };

  SC.balloonsLeft = function (w) {
    if (w.mode === 'duel') return 99;
    return Math.max(0, w.queue.length - w.queueIndex);
  };

  SC.botsLeft = function (w, side) {
    var n = 0;
    for (var i = 0; i < w.bots.length; i++) {
      var b = w.bots[i];
      if (b.alive && (!side || b.side === side)) n++;
    }
    return n;
  };

  SC.setAim = function (w, angle, power) {
    if (w.phase !== 'aim') return;
    if (angle != null) w.aimAngle = clamp(+angle, SC.MIN_ANGLE, SC.MAX_ANGLE);
    if (power != null) w.aimPower = clamp(+power, 0.2, 1.0);
  };

  // Converts a pointer position (px, py) while dragging the pouch into (aimAngle, aimPower).
  // Returns pull distance in px; below SC.MIN_PULL means cancelling the drag.
  SC.aimFromDrag = function (w, px, py) {
    var sl = SC.activeSling(w), dir = SC.aimDir(w);
    var fx = (sl.x - px) * dir, uy = py - sl.y;
    var dist = Math.hypot(fx, uy);
    if (dist < 2) return 0;
    // Allow forgiving pulls even if child drags slightly past vertical.
    var ang = Math.atan2(uy, Math.max(8, fx));
    w.aimAngle = clamp(ang, SC.MIN_ANGLE, SC.MAX_ANGLE);
    w.aimPower = clamp(dist / SC.MAX_PULL, 0.2, 1.0);
    return dist;
  };

  SC.pouchPos = function (w, pulled) {
    var sl = SC.activeSling(w), dir = SC.aimDir(w);
    if (!pulled) return { x: sl.x, y: sl.y };
    var d = w.aimPower * SC.MAX_PULL;
    return { x: sl.x - Math.cos(w.aimAngle) * d * dir, y: sl.y + Math.sin(w.aimAngle) * d };
  };

  SC.launchVel = function (w) {
    var sp = SC.MIN_SPEED + w.aimPower * (SC.MAX_SPEED - SC.MIN_SPEED), dir = SC.aimDir(w);
    return { vx: Math.cos(w.aimAngle) * sp * dir, vy: -Math.sin(w.aimAngle) * sp };
  };

  // Simulates phantom guide dots with exact gravity and fan wind.
  SC.trajectory = function (w) {
    if (w.phase !== 'aim') return [];
    var sl = SC.activeSling(w), v = SC.launchVel(w);
    var x = sl.x, y = sl.y, vx = v.vx, vy = v.vy, dt = 1 / 60;
    var dots = [], count = w.P.arcDots;
    for (var step = 1; step <= count * 3; step++) {
      vy += SC.GRAV * dt;
      for (var f = 0; f < w.fans.length; f++) {
        var fn = w.fans[f];
        if (Math.abs(x - fn.x) <= fn.w / 2 && Math.abs(y - fn.y) <= fn.h / 2) {
          vx += fn.fx * w.P.windScale * dt;
          vy += fn.fy * w.P.windScale * dt;
        }
      }
      x += vx * dt; y += vy * dt;
      if (y >= GROUND) break;
      if (step % 3 === 0) dots.push({ x: x, y: y });
    }
    return dots;
  };

  function makeProj(type, x, y, vx, vy, side) {
    var spec = SC.BALLOONS[type] || SC.BALLOONS.classic;
    return {
      type: spec.id, x: x, y: y, vx: vx, vy: vy, r: spec.r,
      color: spec.color, glow: spec.glow, dmg: spec.dmg, splatR: spec.splatR,
      bouncesLeft: spec.bounces, maxBounces: spec.bounces,
      side: side, alive: true, flight: 0, rot: 0,
      specialUsed: false, charged: false, slammed: false, mini: false,
      portalCd: 0, jellyCd: 0
    };
  }

  SC.fire = function (w) {
    if (w.phase !== 'aim') return false;
    var type = SC.currentBalloon(w);
    if (!type) return false;
    var sl = SC.activeSling(w), v = SC.launchVel(w);
    if (w.mode === 'solo') w.queueIndex++;
    w.shots++;
    w.phase = 'flight';
    w.shotHitAny = false;
    w.shotBotsPopped = 0;
    var p = makeProj(type, sl.x, sl.y, v.vx, v.vy, w.turn);
    w.projectiles.push(p);
    w.ev.push({ t: 'fire', type: type, x: sl.x, y: sl.y, turn: w.turn });
    return true;
  };

  /* --------------------------------------------------- special abilities */
  SC.activateSpecial = function (w) {
    if (w.phase !== 'flight' || !w.projectiles.length) return false;
    var p = null;
    for (var i = 0; i < w.projectiles.length; i++) {
      if (w.projectiles[i].alive && !w.projectiles[i].specialUsed && !w.projectiles[i].mini) { p = w.projectiles[i]; break; }
    }
    if (!p) return false;
    p.specialUsed = true;
    var sp = Math.hypot(p.vx, p.vy) || 400, ang = Math.atan2(p.vy, p.vx);

    if (p.type === 'classic') {
      // Mega Splat Surge: puffs up, surges forward, emits a mid-air splash wave, and supercharges impact!
      p.charged = true;
      p.r = Math.round(p.r * 1.32);
      p.splatR = Math.round(p.splatR * 1.48);
      p.vx *= 1.25; p.vy *= 1.25;
      damageRadius(w, p.x, p.y, 105, p.dmg * 0.75, p.color, p.side);
      addSplat(w, p.x, p.y, 34, p.color);
    } else if (p.type === 'triple') {
      // Splits into 3 spread berries!
      var boost = Math.max(sp * 1.08, 480);
      p.r = 14; p.vx = Math.cos(ang) * boost; p.vy = Math.sin(ang) * boost;
      var spreads = [-0.23, 0.23];
      for (var k = 0; k < spreads.length; k++) {
        var a2 = ang + spreads[k];
        var child = makeProj('triple', p.x, p.y, Math.cos(a2) * boost, Math.sin(a2) * boost, p.side);
        child.r = 14; child.specialUsed = true; child.mini = true; child.dmg = 46; child.splatR = 72;
        w.projectiles.push(child);
      }
    } else if (p.type === 'heavy') {
      // Meteor Slam: plunges sharply downward to crush stone and wood!
      p.slammed = true;
      p.vx *= 0.24;
      p.vy = Math.max(p.vy + 680, 860);
      p.dmg = Math.round(p.dmg * 1.35);
      p.splatR = Math.round(p.splatR * 1.25);
    } else if (p.type === 'bouncy') {
      // Super Zing Bounce: extra bounces + energetic zip!
      p.bouncesLeft += 2;
      p.charged = true;
      var bsp = Math.max(sp * 1.32, 660);
      p.vx = Math.cos(ang) * bsp;
      p.vy = Math.sin(ang) * bsp + 110;
    } else if (p.type === 'magnet') {
      // Jelly Vortex Pull: creates an inward magnetic field pulling blocks & bots!
      w.vortexes.push({ x: p.x, y: p.y, r: 260, t: 0, dur: 0.65, side: p.side, color: p.color });
      pullTowards(w, p.x, p.y, 260, 520, p.side, p.color);
    }

    w.ev.push({ t: 'special', type: p.type, x: p.x, y: p.y, color: p.color });
    return true;
  };

  /* ---------------------------------------------- collisions & explosions */
  function addSplat(w, x, y, r, color) {
    w.splats.push({ x: x, y: Math.min(y, GROUND - 2), r: r, color: color, seed: (w.rnd() * 1e6) | 0 });
    if (w.splats.length > 64) w.splats.shift();
  }

  function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
    var hw = rw / 2, hh = rh / 2;
    var nx = clamp(cx, rx - hw, rx + hw), ny = clamp(cy, ry - hh, ry + hh);
    var dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
    if (d2 > r * r) return null;
    var d = Math.sqrt(d2);
    if (d > 1e-4) return { nx: dx / d, ny: dy / d, pen: r - d, hx: nx, hy: ny };
    var ox = hw - Math.abs(cx - rx), oy = hh - Math.abs(cy - ry);
    if (ox < oy) return { nx: cx < rx ? -1 : 1, ny: 0, pen: r + ox, hx: cx, hy: cy };
    return { nx: 0, ny: cy < ry ? -1 : 1, pen: r + oy, hx: cx, hy: cy };
  }

  function wakeAll(w) {
    for (var i = 0; i < w.blocks.length; i++) if (w.blocks[i].alive) { w.blocks[i].sleeping = false; w.blocks[i].restT = 0; }
    for (var j = 0; j < w.bots.length; j++) if (w.bots[j].alive) { w.bots[j].sleeping = false; w.bots[j].restT = 0; }
  }

  function damageBlock(w, bl, dmg, color, ix, iy) {
    if (!bl.alive) return;
    w.shotHitAny = true;
    bl.hp -= dmg;
    bl.paint = color || bl.paint;
    bl.sleeping = false; bl.restT = 0;
    if (ix != null) { bl.vx += ix / bl.mass; bl.vy += iy / bl.mass; bl.vrot += (ix * 0.012) / bl.mass; }
    if (bl.hp <= 0) {
      bl.alive = false;
      w.blocksSmashed++;
      w.score += (SC.MATS[bl.mat] ? SC.MATS[bl.mat].score : 100);
      w.coinsEarned += 1;
      addSplat(w, bl.x, bl.y, 26, color || '#ff4d8d');
      w.ev.push({ t: 'blockBreak', mat: bl.mat, x: bl.x, y: bl.y, color: color || '#ff4d8d' });
      wakeAll(w);
    } else {
      w.ev.push({ t: 'blockHit', mat: bl.mat, x: bl.x, y: bl.y });
    }
  }

  function damageBot(w, b, dmg, color) {
    if (!b.alive) return;
    w.shotHitAny = true;
    b.hp -= dmg;
    b.flash = 0.25;
    b.paint = color || b.paint;
    b.sleeping = false; b.restT = 0;
    if (b.hp <= 0) {
      b.alive = false;
      w.botsPopped++;
      w.shotBotsPopped++;
      w.score += b.boss ? 800 : 500;
      w.coinsEarned += b.boss ? 5 : 3;
      addSplat(w, b.x, b.y, b.boss ? 46 : 36, color || '#ff4d8d');
      w.ev.push({ t: 'botPop', x: b.x, y: b.y, boss: b.boss, side: b.side, color: color || '#ff4d8d' });
      wakeAll(w);
    } else {
      w.ev.push({ t: 'botHit', x: b.x, y: b.y, color: color || '#ff4d8d' });
    }
  }

  function isRival(w, entitySide, shooterSide) {
    return w.mode === 'solo' || entitySide !== shooterSide;
  }

  function damageRadius(w, cx, cy, rad, baseDmg, color, shooterSide) {
    var rBonus = rad + w.P.hitRadiusBonus;
    for (var i = 0; i < w.bots.length; i++) {
      var b = w.bots[i];
      if (!b.alive || !isRival(w, b.side, shooterSide)) continue;
      var d = Math.hypot(b.x - cx, b.y - cy);
      if (d <= rBonus + b.r) {
        var f = clamp(1 - d / (rBonus + b.r + 24), 0.35, 1);
        var ang = Math.atan2(b.y - cy, b.x - cx);
        b.vx += Math.cos(ang) * 240 * f;
        b.vy += Math.sin(ang) * 240 * f - 90 * f;
        damageBot(w, b, baseDmg * f, color);
      }
    }
    for (var j = 0; j < w.blocks.length; j++) {
      var bl = w.blocks[j];
      if (!bl.alive || !isRival(w, bl.side, shooterSide)) continue;
      var d2 = Math.hypot(bl.x - cx, bl.y - cy), reach = rad + Math.max(bl.w, bl.h) * 0.5;
      if (d2 <= reach) {
        var f2 = clamp(1 - d2 / (reach + 20), 0.3, 1);
        var a2 = Math.atan2(bl.y - cy, bl.x - cx);
        damageBlock(w, bl, baseDmg * 0.9 * f2, color, Math.cos(a2) * 260 * f2, Math.sin(a2) * 240 * f2 - 80 * f2);
      }
    }
    for (var k = 0; k < w.barrels.length; k++) {
      var ba = w.barrels[k];
      if (ba.alive && Math.hypot(ba.x - cx, ba.y - cy) <= rad + ba.r) {
        detonateBarrel(w, ba, shooterSide);
      }
    }
  }

  function pullTowards(w, cx, cy, rad, strength, shooterSide, color) {
    w.shotHitAny = true;
    wakeAll(w);
    for (var i = 0; i < w.bots.length; i++) {
      var b = w.bots[i];
      if (!b.alive || !isRival(w, b.side, shooterSide)) continue;
      var d = Math.hypot(cx - b.x, cy - b.y);
      if (d > 1 && d <= rad + b.r) {
        var k = clamp(1 - d / (rad + 40), 0.35, 1);
        b.vx += ((cx - b.x) / d) * strength * k;
        b.vy += ((cy - b.y) / d) * strength * k - 80;
        b.paint = color || b.paint;
        damageBot(w, b, 18 * k, color);
      }
    }
    for (var j = 0; j < w.blocks.length; j++) {
      var bl = w.blocks[j];
      if (!bl.alive || !isRival(w, bl.side, shooterSide)) continue;
      var d2 = Math.hypot(cx - bl.x, cy - bl.y);
      if (d2 > 1 && d2 <= rad + 30) {
        var k2 = clamp(1 - d2 / (rad + 50), 0.35, 1);
        damageBlock(w, bl, 16 * k2, color, ((cx - bl.x) / d2) * strength * 0.95 * k2, ((cy - bl.y) / d2) * strength * 0.95 * k2 - 60);
      }
    }
  }

  var RAINBOW = ['#ff4d8d', '#ffb82e', '#3ddc84', '#24c8ff', '#a855f7'];
  function detonateBarrel(w, ba, shooterSide) {
    if (!ba.alive) return;
    ba.alive = false;
    w.shotHitAny = true;
    w.score += 250;
    w.coinsEarned += 2;
    for (var c = 0; c < RAINBOW.length; c++) {
      var a = (c / RAINBOW.length) * Math.PI * 2;
      addSplat(w, ba.x + Math.cos(a) * 28, ba.y + Math.sin(a) * 22, 34, RAINBOW[c]);
    }
    w.ev.push({ t: 'boom', x: ba.x, y: ba.y });
    wakeAll(w);
    damageRadius(w, ba.x, ba.y, 175, 135, '#ff4d8d', shooterSide);
  }

  function impactProjectile(w, p, hx, hy) {
    if (!p.alive) return;
    p.alive = false;
    if (p.type === 'magnet' && !p.specialUsed) {
      pullTowards(w, hx, hy, 200, 380, p.side, p.color);
    }
    addSplat(w, hx, hy, p.charged || p.slammed ? 44 : 32, p.color);
    damageRadius(w, hx, hy, p.splatR, p.dmg * (p.charged ? 1.35 : 1), p.color, p.side);
    w.ev.push({ t: 'splat', type: p.type, x: hx, y: hy, color: p.color, big: !!(p.charged || p.slammed) });
  }

  /* --------------------------------------------------- physics stepping */
  function stepProjectileSub(w, p, sdt) {
    if (!p.alive) return;
    p.vy += SC.GRAV * sdt;
    for (var f = 0; f < w.fans.length; f++) {
      var fn = w.fans[f];
      if (Math.abs(p.x - fn.x) <= fn.w / 2 && Math.abs(p.y - fn.y) <= fn.h / 2) {
        p.vx += fn.fx * w.P.windScale * sdt;
        p.vy += fn.fy * w.P.windScale * sdt;
      }
    }
    p.x += p.vx * sdt;
    p.y += p.vy * sdt;
    p.rot += p.vx * 0.008 * sdt;
    p.flight += sdt;
    if (p.portalCd > 0) p.portalCd -= sdt;
    if (p.jellyCd > 0) p.jellyCd -= sdt;

    // Portals
    if (p.portalCd <= 0) {
      for (var pi = 0; pi < w.portals.length; pi++) {
        var po = w.portals[pi];
        if (Math.hypot(p.x - po.ax, p.y - po.ay) <= po.r + p.r * 0.35) {
          p.x = po.bx; p.y = po.by; p.vx *= 1.06; p.vy *= 1.06; p.portalCd = 0.35;
          w.ev.push({ t: 'portal', x: po.ax, y: po.ay, tx: po.bx, ty: po.by, color: po.color });
          break;
        }
        if (Math.hypot(p.x - po.bx, p.y - po.by) <= po.r + p.r * 0.35) {
          p.x = po.ax; p.y = po.ay; p.vx *= 1.06; p.vy *= 1.06; p.portalCd = 0.35;
          w.ev.push({ t: 'portal', x: po.bx, y: po.by, tx: po.ax, ty: po.ay, color: po.color });
          break;
        }
      }
    }

    // Jelly bounce pads
    if (p.jellyCd <= 0) {
      for (var ji = 0; ji < w.jellies.length; ji++) {
        var je = w.jellies[ji], jhit = circleRectHit(p.x, p.y, p.r, je.x, je.y, je.w, je.h);
        if (jhit) {
          var nx = je.nx, ny = je.ny;
          var dot = p.vx * nx + p.vy * ny;
          if (dot < 0) { p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny; }
          var sp = Math.max(600, Math.hypot(p.vx, p.vy) * 1.14);
          var rAng = Math.atan2(p.vy, p.vx);
          // Blend reflection toward pad normal so flat pads always launch upward nicely
          var outX = Math.cos(rAng) * 0.65 + nx * 0.55, outY = Math.sin(rAng) * 0.65 + ny * 0.55;
          var ol = Math.hypot(outX, outY) || 1;
          p.vx = (outX / ol) * sp; p.vy = (outY / ol) * sp;
          p.x += jhit.nx * (jhit.pen + 2); p.y += jhit.ny * (jhit.pen + 2);
          p.jellyCd = 0.12; je.wobble = 1;
          addSplat(w, je.x, je.y, 22, p.color);
          w.ev.push({ t: 'jelly', x: p.x, y: p.y, color: p.color });
          return;
        }
      }
    }

    // TNT barrels
    for (var bi = 0; bi < w.barrels.length; bi++) {
      var ba = w.barrels[bi];
      if (ba.alive && Math.hypot(p.x - ba.x, p.y - ba.y) <= p.r + ba.r + w.P.hitRadiusBonus * 0.6) {
        detonateBarrel(w, ba, p.side);
        if (p.type === 'heavy' && p.slammed) { p.dmg *= 0.8; }
        else if (p.bouncesLeft > 0) { p.vy = -Math.abs(p.vy) * 0.8; p.bouncesLeft--; }
        else { impactProjectile(w, p, p.x, p.y); return; }
      }
    }

    // Bots
    for (var ti = 0; ti < w.bots.length; ti++) {
      var b = w.bots[ti];
      if (!b.alive || !isRival(w, b.side, p.side)) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) <= p.r + b.r + w.P.hitRadiusBonus) {
        damageBot(w, b, p.dmg * (p.charged ? 1.45 : 1.15), p.color);
        if (p.type === 'heavy' && p.slammed && !b.alive) {
          p.vy *= 0.88;
        } else if (p.bouncesLeft > 0) {
          var ba2 = Math.atan2(p.y - b.y, p.x - b.x), bsp = Math.max(380, Math.hypot(p.vx, p.vy) * 0.84);
          p.vx = Math.cos(ba2) * bsp; p.vy = Math.sin(ba2) * bsp;
          p.bouncesLeft--;
          damageRadius(w, p.x, p.y, p.splatR * 0.7, p.dmg * 0.55, p.color, p.side);
          w.ev.push({ t: 'bounce', x: p.x, y: p.y, color: p.color });
          return;
        } else {
          impactProjectile(w, p, p.x, p.y);
          return;
        }
      }
    }

    // Dynamic blocks
    for (var ki = 0; ki < w.blocks.length; ki++) {
      var bl = w.blocks[ki];
      if (!bl.alive || !isRival(w, bl.side, p.side)) continue;
      var khit = circleRectHit(p.x, p.y, p.r, bl.x, bl.y, bl.w, bl.h);
      if (khit) {
        var bDmg = p.dmg * (p.type === 'heavy' ? 1.5 : 1.0) * (p.charged ? 1.4 : 1.0);
        damageBlock(w, bl, bDmg, p.color, p.vx * 0.42, p.vy * 0.42);
        if (!bl.alive && (p.type === 'heavy' || Math.hypot(p.vx, p.vy) > 520)) {
          p.vx *= 0.72; p.vy *= 0.72; p.dmg *= 0.78;
          continue;
        }
        if (p.bouncesLeft > 0) {
          p.x += khit.nx * (khit.pen + 1); p.y += khit.ny * (khit.pen + 1);
          var kd = p.vx * khit.nx + p.vy * khit.ny;
          if (kd < 0) { p.vx -= 1.84 * kd * khit.nx; p.vy -= 1.84 * kd * khit.ny; }
          p.bouncesLeft--;
          addSplat(w, khit.hx, khit.hy, 24, p.color);
          damageRadius(w, khit.hx, khit.hy, p.splatR * 0.75, p.dmg * 0.6, p.color, p.side);
          w.ev.push({ t: 'bounce', x: khit.hx, y: khit.hy, color: p.color });
          return;
        }
        impactProjectile(w, p, khit.hx, khit.hy);
        return;
      }
    }

    // Static platforms
    for (var si = 0; si < w.plats.length; si++) {
      var pl = w.plats[si], shit = circleRectHit(p.x, p.y, p.r, pl.x, pl.y, pl.w, pl.h);
      if (shit) {
        if (p.bouncesLeft > 0) {
          p.x += shit.nx * (shit.pen + 1); p.y += shit.ny * (shit.pen + 1);
          var sd = p.vx * shit.nx + p.vy * shit.ny;
          if (sd < 0) { p.vx -= 1.84 * sd * shit.nx; p.vy -= 1.84 * sd * shit.ny; }
          p.bouncesLeft--;
          addSplat(w, shit.hx, shit.hy, 22, p.color);
          damageRadius(w, shit.hx, shit.hy, p.splatR * 0.72, p.dmg * 0.6, p.color, p.side);
          w.ev.push({ t: 'bounce', x: shit.hx, y: shit.hy, color: p.color });
          return;
        }
        impactProjectile(w, p, shit.hx, shit.hy);
        return;
      }
    }

    // Ground & bounds
    if (p.y + p.r >= GROUND) {
      p.y = GROUND - p.r;
      if (p.bouncesLeft > 0) {
        p.vy = -Math.max(280, Math.abs(p.vy) * 0.84);
        p.vx *= 0.92;
        p.bouncesLeft--;
        addSplat(w, p.x, GROUND, 24, p.color);
        damageRadius(w, p.x, GROUND, p.splatR * 0.78, p.dmg * 0.65, p.color, p.side);
        w.ev.push({ t: 'bounce', x: p.x, y: GROUND, color: p.color });
        return;
      }
      impactProjectile(w, p, p.x, GROUND);
      return;
    }
    if (p.bouncesLeft > 0 && ((p.x - p.r <= 6 && p.vx < 0) || (p.x + p.r >= W - 6 && p.vx > 0))) {
      p.vx = -p.vx * 0.85;
      p.x = clamp(p.x, p.r + 7, W - p.r - 7);
      p.bouncesLeft--;
      w.ev.push({ t: 'bounce', x: p.x, y: p.y, color: p.color });
      return;
    }
    if (p.x < -90 || p.x > W + 90 || p.y > H + 90) p.alive = false;
  }

  function stepBodies(w, dt) {
    var i, j, bl, b;
    // Blocks
    for (i = 0; i < w.blocks.length; i++) {
      bl = w.blocks[i];
      if (!bl.alive || bl.sleeping) continue;
      bl.vy += SC.GRAV * dt;
      bl.vx *= 0.985;
      bl.x += bl.vx * dt;
      bl.y += bl.vy * dt;
      bl.rot = clamp(bl.rot + bl.vrot * dt, -0.8, 0.8);
      bl.vrot *= 0.92;

      var supported = false;
      if (bl.y + bl.h / 2 >= GROUND) {
        if (bl.vy > 280) damageBlock(w, bl, (bl.vy - 240) * 0.08, bl.paint);
        if (!bl.alive) continue;
        bl.y = GROUND - bl.h / 2;
        bl.vy = 0; bl.vx *= 0.75; bl.rot *= 0.75;
        supported = true;
      }
      for (j = 0; j < w.plats.length; j++) {
        var pl = w.plats[j];
        var ox = (bl.w + pl.w) / 2 - Math.abs(bl.x - pl.x), oy = (bl.h + pl.h) / 2 - Math.abs(bl.y - pl.y);
        if (ox > 0 && oy > 0) {
          if (oy < ox) {
            if (bl.y < pl.y) { bl.y = pl.y - (bl.h + pl.h) / 2; if (bl.vy > 0) bl.vy = 0; bl.vx *= 0.78; supported = true; }
            else { bl.y = pl.y + (bl.h + pl.h) / 2; if (bl.vy < 0) bl.vy = 0; }
          } else {
            bl.x += bl.x < pl.x ? -ox : ox; bl.vx *= -0.3;
          }
        }
      }
      bl.x = clamp(bl.x, bl.w / 2 + 4, W - bl.w / 2 - 4);
      if (supported && Math.hypot(bl.vx, bl.vy) < 16) {
        bl.restT += dt;
        if (bl.restT > 0.3) { bl.vx = 0; bl.vy = 0; bl.vrot = 0; bl.rot = 0; bl.sleeping = true; }
      } else bl.restT = 0;
    }

    // Block-vs-block stacking & knock impulses (2 passes bottom-up)
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < w.blocks.length; i++) {
        var a = w.blocks[i];
        if (!a.alive) continue;
        for (j = i + 1; j < w.blocks.length; j++) {
          var c = w.blocks[j];
          if (!c.alive || (a.sleeping && c.sleeping)) continue;
          var bx = (a.w + c.w) / 2 - Math.abs(a.x - c.x), by = (a.h + c.h) / 2 - Math.abs(a.y - c.y);
          if (bx > 0 && by > 0) {
            a.sleeping = false; c.sleeping = false;
            var rel = Math.hypot(a.vx - c.vx, a.vy - c.vy);
            if (rel > 220) {
              damageBlock(w, a, (rel - 190) * 0.09, c.paint);
              damageBlock(w, c, (rel - 190) * 0.09, a.paint);
              if (!a.alive || !c.alive) continue;
            }
            if (by <= bx) {
              var upper = a.y < c.y ? a : c, lower = a.y < c.y ? c : a;
              upper.y = lower.y - (upper.h + lower.h) / 2;
              if (upper.vy > lower.vy) { lower.vy += upper.vy * 0.25; upper.vy = Math.min(0, lower.vy); }
              upper.vx *= 0.84;
              if (lower.sleeping || Math.hypot(lower.vx, lower.vy) < 16) upper.restT += dt * 0.5;
            } else {
              var push = bx / 2, sgn = a.x < c.x ? -1 : 1;
              a.x += sgn * push; c.x -= sgn * push;
              var avg = (a.vx + c.vx) * 0.5;
              a.vx = avg - 15 * sgn; c.vx = avg + 15 * sgn;
            }
          }
        }
      }
    }

    // Bots
    for (i = 0; i < w.bots.length; i++) {
      b = w.bots[i];
      if (!b.alive) continue;
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      if (b.sleeping) continue;
      b.vy += SC.GRAV * dt;
      b.vx *= 0.98;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      var bSup = false;

      if (b.y + b.r >= GROUND) {
        var impactVy = b.vy;
        b.y = GROUND - b.r;
        b.vy = 0; b.vx *= 0.72;
        bSup = true;
        if (impactVy > 225) damageBot(w, b, (impactVy - 180) * 0.16, b.paint || '#ff4d8d');
        if (!b.alive) continue;
      }
      for (j = 0; j < w.plats.length; j++) {
        var ph = circleRectHit(b.x, b.y, b.r, w.plats[j].x, w.plats[j].y, w.plats[j].w, w.plats[j].h);
        if (ph) {
          if (ph.ny < -0.5 && b.vy > 235) damageBot(w, b, (b.vy - 190) * 0.15, b.paint || '#ff4d8d');
          if (!b.alive) break;
          b.x += ph.nx * ph.pen; b.y += ph.ny * ph.pen;
          if (ph.ny < -0.5) { if (b.vy > 0) b.vy = 0; b.vx *= 0.76; bSup = true; }
          else b.vx *= -0.35;
        }
      }
      if (!b.alive) continue;
      for (j = 0; j < w.blocks.length; j++) {
        bl = w.blocks[j];
        if (!bl.alive) continue;
        var bh = circleRectHit(b.x, b.y, b.r, bl.x, bl.y, bl.w, bl.h);
        if (bh) {
          var rSpd = Math.hypot(b.vx - bl.vx, b.vy - bl.vy);
          b.x += bh.nx * bh.pen; b.y += bh.ny * bh.pen;
          if (bh.ny < -0.5) { if (b.vy > bl.vy) b.vy = Math.max(0, bl.vy); b.vx *= 0.8; bSup = true; }
          else { bl.vx -= bh.nx * 40; b.vx += bh.nx * 60; }
          if (rSpd > 145) damageBot(w, b, (rSpd - 110) * 0.22, bl.paint || '#ff4d8d');
          if (!b.alive) break;
        }
      }
      if (!b.alive) continue;
      for (j = 0; j < w.barrels.length; j++) {
        var br = w.barrels[j];
        if (br.alive && Math.hypot(b.x - br.x, b.y - br.y) < b.r + br.r && Math.hypot(b.vx, b.vy) > 120) {
          detonateBarrel(w, br, w.turn);
        }
      }
      b.x = clamp(b.x, b.r + 6, W - b.r - 6);
      if (bSup && Math.hypot(b.vx, b.vy) < 14) {
        b.restT += dt;
        if (b.restT > 0.3) { b.vx = 0; b.vy = 0; b.sleeping = true; }
      } else b.restT = 0;
    }
  }

  function checkVictory(w) {
    if (w.phase === 'win' || w.phase === 'lose') return true;
    if (w.mode === 'solo') {
      if (SC.botsLeft(w) === 0) {
        var left = SC.balloonsLeft(w);
        w.score += left * 600;
        w.coinsEarned += left * 3;
        w.phase = 'win';
        w.projectiles.length = 0;
        w.vortexes.length = 0;
        w.ev.push({ t: 'win', stars: SC.calcStars(w), score: w.score, coins: w.coinsEarned, left: left });
        return true;
      }
    } else {
      var p1 = SC.botsLeft(w, 1), p2 = SC.botsLeft(w, 2);
      if (p2 === 0 || p1 === 0) {
        w.winner = p2 === 0 ? 1 : 2;
        w.phase = 'win';
        w.projectiles.length = 0;
        w.vortexes.length = 0;
        w.ev.push({ t: 'duelWin', winner: w.winner });
        return true;
      }
    }
    return false;
  }

  SC.step = function (w, dt) {
    w.t += dt;
    var i;
    for (i = 0; i < w.fans.length; i++) w.fans[i].phase += dt * 7;
    for (i = 0; i < w.portals.length; i++) w.portals[i].phase += dt * 3.5;
    for (i = 0; i < w.jellies.length; i++) if (w.jellies[i].wobble > 0) w.jellies[i].wobble = Math.max(0, w.jellies[i].wobble - dt * 3.2);

    if (w.phase === 'win' || w.phase === 'lose') return;

    // Active magnetic vortexes
    for (i = w.vortexes.length - 1; i >= 0; i--) {
      var vx = w.vortexes[i];
      vx.t += dt;
      pullTowards(w, vx.x, vx.y, vx.r, 640 * dt, vx.side, vx.color);
      if (vx.t >= vx.dur) w.vortexes.splice(i, 1);
    }

    // Sub-stepped projectiles
    if (w.projectiles.length) {
      var sub = 3, sdt = dt / sub;
      for (var s = 0; s < sub; s++) {
        for (i = 0; i < w.projectiles.length; i++) stepProjectileSub(w, w.projectiles[i], sdt);
      }
      for (i = w.projectiles.length - 1; i >= 0; i--) {
        if (!w.projectiles[i].alive || w.projectiles[i].flight > 7.5) w.projectiles.splice(i, 1);
      }
    }

    stepBodies(w, dt);
    if (checkVictory(w)) return;

    if (w.phase === 'flight' && w.projectiles.length === 0 && w.vortexes.length === 0) {
      w.phase = 'settle';
      w.settleT = 0;
    }

    if (w.phase === 'settle') {
      w.settleT += dt;
      var calm = w.settleT >= 0.22;
      if (calm) {
        for (i = 0; i < w.blocks.length && calm; i++) {
          var bl = w.blocks[i];
          if (bl.alive && !bl.sleeping && Math.hypot(bl.vx, bl.vy) > 15) calm = false;
        }
        for (i = 0; i < w.bots.length && calm; i++) {
          var bo = w.bots[i];
          if (bo.alive && !bo.sleeping && Math.hypot(bo.vx, bo.vy) > 15) calm = false;
        }
      }
      if (calm || w.settleT >= 2.2) {
        for (i = 0; i < w.blocks.length; i++) if (w.blocks[i].alive) { w.blocks[i].vx = w.blocks[i].vy = w.blocks[i].vrot = 0; w.blocks[i].sleeping = true; }
        for (i = 0; i < w.bots.length; i++) if (w.bots[i].alive) { w.bots[i].vx = w.bots[i].vy = 0; w.bots[i].sleeping = true; }
        w.ev.push({ t: 'shotEnd', hitAny: w.shotHitAny, botsPopped: w.shotBotsPopped });
        if (checkVictory(w)) return;
        if (w.mode === 'solo') {
          if (w.queueIndex >= w.queue.length) {
            w.phase = 'lose';
            w.ev.push({ t: 'lose', score: w.score });
          } else {
            w.phase = 'aim';
          }
        } else {
          w.duelAim[w.turn - 1] = { angle: w.aimAngle, power: w.aimPower };
          w.turn = w.turn === 1 ? 2 : 1;
          w.aimAngle = w.duelAim[w.turn - 1].angle;
          w.aimPower = w.duelAim[w.turn - 1].power;
          w.phase = 'aim';
          w.ev.push({ t: 'turn', turn: w.turn });
        }
      }
    }
  };

  /* --------------------------------------------------- stars, DDA & save */
  SC.calcStars = function (w) {
    if (w.mode !== 'solo' || SC.botsLeft(w) > 0) return 0;
    var left = SC.balloonsLeft(w);
    if (left >= w.parLeft || w.shots === 1) return 3;
    if (left >= 1 || w.score >= 1600) return 2;
    return 1;
  };

  SC.outcome = function (won, stars, shots) {
    if (!won) return clamp(0.25 - 0.03 * (shots || 0), 0, 0.25);
    return stars === 3 ? 1 : stars === 2 ? 0.78 : 0.55;
  };

  SC.freshSave = function () {
    return {
      v: 1,
      lv: SC.LEVELS.map(function () { return { s: 0, best: 0 }; }),
      coins: 0,
      skins: SC.SKINS.map(function (_, i) { return i === 0 ? 1 : 0; }),
      frames: SC.FRAMES.map(function (_, i) { return i === 0 ? 1 : 0; }),
      skin: 0,
      frame: 0,
      coach: false
    };
  };

  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function asObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

  SC.loadSave = function (raw) {
    var s = SC.freshSave();
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { return s; } }
    var r = asObj(raw);
    if (!r || r.v !== 1) return s;
    var lv = Array.isArray(r.lv) ? r.lv : [];
    s.lv.forEach(function (e, i) {
      var o = asObj(lv[i]);
      if (!o) return;
      e.s = isInt(o.s, 0, 3) ? o.s : 0;
      e.best = e.s > 0 && isInt(o.best, 0, 999999) ? o.best : 0;
    });
    s.coins = isInt(r.coins, 0, 99999) ? r.coins : 0;
    var sk = Array.isArray(r.skins) ? r.skins : [];
    s.skins = s.skins.map(function (_, i) { return i === 0 || sk[i] === 1 ? 1 : 0; });
    var fr = Array.isArray(r.frames) ? r.frames : [];
    s.frames = s.frames.map(function (_, i) { return i === 0 || fr[i] === 1 ? 1 : 0; });
    s.skin = isInt(r.skin, 0, SC.SKINS.length - 1) && s.skins[r.skin] ? r.skin : 0;
    s.frame = isInt(r.frame, 0, SC.FRAMES.length - 1) && s.frames[r.frame] ? r.frame : 0;
    s.coach = r.coach === true;
    return s;
  };

  SC.isOpen = function (s, i) { return i === 0 || (i > 0 && i < SC.LEVELS.length && s.lv[i - 1].s > 0); };
  SC.totalStars = function (s) { var n = 0; for (var i = 0; i < s.lv.length; i++) n += s.lv[i].s; return n; };
  SC.nextLevel = function (s) {
    var top = 0;
    for (var i = 0; i < SC.LEVELS.length; i++) {
      if (!SC.isOpen(s, i)) break;
      top = i;
      if (!s.lv[i].s) return i;
    }
    return top;
  };

  SC.applyResult = function (s, idx, stars, score, coinsEarned) {
    var e = s.lv[idx];
    var out = { first: !e.s && stars > 0, best: false, moreStars: stars > e.s, coins: clamp(coinsEarned | 0, 0, 999), opened: -1, world: -1 };
    if (stars > 0) {
      out.best = !!e.s && (stars > e.s || score > e.best);
      if (stars > e.s) e.s = stars;
      if (score > e.best) e.best = Math.min(999999, Math.floor(score));
      if (out.first && idx + 1 < SC.LEVELS.length) {
        out.opened = idx + 1;
        if ((idx + 1) % 4 === 0) out.world = (idx + 1) / 4;
      }
    }
    s.coins = Math.min(99999, s.coins + out.coins);
    return out;
  };

  SC.buy = function (s, kind, k) {
    var isFrame = kind === 'frame';
    var list = isFrame ? SC.FRAMES : SC.SKINS;
    var own = isFrame ? s.frames : s.skins;
    var key = isFrame ? 'frame' : 'skin';
    if (!list[k]) return '';
    if (own[k]) { s[key] = k; return 'wear'; }
    if (s.coins < list[k].price) return '';
    s.coins -= list[k].price;
    own[k] = 1;
    s[key] = k;
    return 'bought';
  };

  return SC;
});
