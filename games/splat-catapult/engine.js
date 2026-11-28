/* مقلاع الألوان (Splat Catapult: Mega Paint-Cannon & Toppling Forts) — Pure 2D Rigid-Body Engine */
(function (root) {
  'use strict';

  var W = 1280, H = 720, DUEL_W = 1920, GROUND_Y = 632, G = GROUND_Y;
  var MIN_ANGLE = -0.15, MAX_ANGLE = 1.35, DEFAULT_ANGLE = 0.48, DEFAULT_POWER = 0.78;
  var PROJ_G = 620, BODY_G = 680, SUBSTEPS = 2, SOLVER_ITERS = 8;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mulberry32(seed) {
    var s = (seed | 0) || 0x51f15e;
    return function () {
      s = s + 0x6d2b79f5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var WORLDS = [
    { id: 0, name: 'تلال الخشب', sub: 'أبراج الدومينو وبراميل الطلاء', theme: 'day', sky: ['#5ec2ff', '#dff6ff'], hill: '#44cf6c', ground: '#279648', trim: '#7be86b' },
    { id: 1, name: 'قلعة الجليد', sub: 'أعمدة الصقيع وكرات الثلج العملاقة', theme: 'day', sky: ['#49a6ff', '#e8fbff'], hill: '#9be4ff', ground: '#4fb8eb', trim: '#d6f6ff' },
    { id: 2, name: 'مصنع الآليين', sub: 'عوارض الفولاذ وبوابات المغناطيس', theme: 'neon', sky: ['#1f295c', '#5268b5'], hill: '#44507a', ground: '#2e3756', trim: '#64dfdf' },
    { id: 3, name: 'جزيرة البركان', sub: 'ينابيع البخار وحصن الزعيم العملاق', theme: 'night', sky: ['#3d1642', '#ff6e40'], hill: '#692b3c', ground: '#3e1a26', trim: '#ff9e2c' }
  ];

  var PROJECTILES = {
    bomb: { id: 'bomb', name: 'قنبلة الألوان', hint: 'موجة صدمة لونية!', r: 19, m: 2.3, dmg: 82, blastR: 132, blastJ: 580, color: '#ff3877', accent: '#ffe033' },
    cluster: { id: 'cluster', name: 'الثلاثي المتفرّع', hint: 'ينقسم لـ 3 صواريخ!', r: 17, m: 1.7, dmg: 56, blastR: 88, blastJ: 390, color: '#00c8ff', accent: '#ffffff' },
    drill: { id: 'drill', name: 'صاروخ الحفر', hint: 'اندفاع يخترق الجدران!', r: 16, m: 2.1, dmg: 76, blastR: 82, blastJ: 430, color: '#ff8c00', accent: '#fff066' },
    melon: { id: 'melon', name: 'البطيخة العملاقة', hint: 'سحق نيزكي للأبراج!', r: 24, m: 3.5, dmg: 112, blastR: 152, blastJ: 700, color: '#34d85c', accent: '#ff3b5c' },
    saw: { id: 'saw', name: 'منشار الارتداد', hint: 'يقطع العوارض ويرتدّ!', r: 18, m: 2.0, dmg: 68, blastR: 88, blastJ: 410, color: '#b44cff', accent: '#52f7ff' }
  };

  var MATERIALS = {
    wood: { id: 'wood', name: 'خشب', density: 0.0014, hp: 68, mu: 0.56, rest: 0.10, color: '#d8893b' },
    ice: { id: 'ice', name: 'جليد', density: 0.0011, hp: 44, mu: 0.28, rest: 0.16, color: '#84e3ff' },
    steel: { id: 'steel', name: 'فولاذ', density: 0.0029, hp: 220, mu: 0.50, rest: 0.06, color: '#7d8da8' },
    boulder: { id: 'boulder', name: 'صخرة', density: 0.0025, hp: 190, mu: 0.34, rest: 0.24, color: '#a8b8d0' },
    tnt: { id: 'tnt', name: 'برميل متفجر', density: 0.0015, hp: 26, mu: 0.54, rest: 0.10, color: '#ff3b5c' }
  };

  var LAUNCHERS = [
    { id: 0, name: 'مقلاع الألوان', desc: 'القاذف الكلاسيكي السريع', price: 0, body: '#c87838', trim: '#ff3877', glow: '#ffe033' },
    { id: 1, name: 'مدفع التنين', desc: 'فوهة نارية بوهج بركاني', price: 15, body: '#e5383b', trim: '#ffb703', glow: '#ff6d00' },
    { id: 2, name: 'مقلاع البرق', desc: 'ملفّات كهربائية زرقاء', price: 30, body: '#0077b6', trim: '#48cae4', glow: '#90e0ef' },
    { id: 3, name: 'قاذف الفضاء', desc: 'تيتانيوم مستقبلي مشعّ', price: 45, body: '#7209b7', trim: '#4cc9f0', glow: '#f72585' },
    { id: 4, name: 'المقلاع الذهبي', desc: 'إصدار الأبطال الملكي', price: 65, body: '#f59e0b', trim: '#fef08a', glow: '#ffffff' }
  ];

  var PALETTES = [
    { id: 0, name: 'نيون المهرجان', price: 0, colors: ['#ff3877', '#00c8ff', '#ffe033', '#34d85c', '#b44cff'] },
    { id: 1, name: 'لهب البركان', price: 12, colors: ['#ff2a54', '#ff7b00', '#ffd000', '#ff5492', '#ff9e00'] },
    { id: 2, name: 'جليد القطب', price: 22, colors: ['#00f5d4', '#00bbf9', '#9b5de5', '#72efdd', '#fee440'] },
    { id: 3, name: 'طيف المجرة', price: 35, colors: ['#f72585', '#7209b7', '#4cc9f0', '#4361ee', '#ffd166'] }
  ];

  var DIFFS = {
    easy: { id: 'easy', name: 'سهل', arcSteps: 54, bonusShots: 2, hpScale: 0.75, blastScale: 1.28, hitBonus: 7, windMax: 0, scoreMult: 1.0 },
    mid: { id: 'mid', name: 'متوسط', arcSteps: 26, bonusShots: 0, hpScale: 1.0, blastScale: 1.0, hitBonus: 2, windMax: 0, scoreMult: 1.15 },
    hero: { id: 'hero', name: 'بطل', arcSteps: 14, bonusShots: 0, hpScale: 1.15, blastScale: 0.96, hitBonus: 0, windMax: 88, scoreMult: 1.35 }
  };

  function params(diffId, ddaLevel) {
    if (typeof diffId === 'number') { ddaLevel = diffId; diffId = 'mid'; }
    var d = DIFFS[diffId] || DIFFS.mid;
    var l = typeof ddaLevel === 'number' && ddaLevel === ddaLevel ? clamp(ddaLevel, 0, 1) : 0.35;
    var shift = (l - 0.35) * 0.16;
    return {
      diff: d.id, arcDots: Math.max(10, Math.round(d.arcSteps * (1 - shift * 0.5))),
      bonusShots: d.bonusShots, hpScale: clamp(d.hpScale * (1 + shift), 0.62, 1.32),
      blastScale: clamp(d.blastScale * (1 - shift * 0.35), 0.88, 1.4),
      hitRadiusBonus: Math.max(0, Math.round(d.hitBonus + (0.5 - l) * 5)),
      windMax: d.windMax ? Math.round(d.windMax * (0.82 + l * 0.36)) : 0, scoreMult: d.scoreMult
    };
  }
  var NEUTRAL = params('mid', 0.35);

  function box(x, baseY, bw, bh, mat) { return { shape: 'box', x: x, y: baseY - bh / 2, bw: bw, bh: bh, mat: mat || 'wood' }; }
  function boulder(x, baseY, r) { return { shape: 'circle', x: x, y: baseY - r, bw: r * 2, bh: r * 2, r: r, mat: 'boulder' }; }
  function tnt(x, baseY) { return { shape: 'box', x: x, y: baseY - 22, bw: 36, bh: 44, mat: 'tnt', isTnt: true }; }
  function gob(x, baseY, boss) { var r = boss ? 34 : 21; return { x: x, y: baseY - r, r: r, boss: !!boss }; }
  function ped(x, topY, bw) { return { x: x, y: (G + topY) / 2, bw: bw, bh: G - topY, topY: topY }; }

  var STAGES = [
    // World 1: تلال الخشب
    { id: '1-1', world: 0, name: 'برج الدومينو', par: 2, queue: ['bomb', 'cluster', 'melon', 'bomb'], build: function () { return {
      blocks: [box(800, G, 22, 140, 'wood'), box(890, G, 22, 140, 'wood'), box(845, G - 140, 126, 20, 'wood'), box(965, G, 22, 130, 'wood'), box(1045, G, 22, 130, 'wood'), box(1005, G - 130, 116, 20, 'wood'), tnt(845, G)],
      goblins: [gob(845, G - 160), gob(1005, G), gob(1005, G - 150)] }; } },
    { id: '1-2', world: 0, name: 'جسر البراميل', par: 2, queue: ['cluster', 'bomb', 'melon', 'saw'], build: function () { return {
      blocks: [box(760, G, 22, 120, 'wood'), box(880, G, 22, 120, 'wood'), box(1000, G, 22, 120, 'wood'), box(820, G - 120, 118, 20, 'wood'), box(940, G - 120, 118, 20, 'wood'), box(845, G - 140, 20, 90, 'wood'), box(915, G - 140, 20, 90, 'wood'), box(880, G - 230, 108, 20, 'wood'), tnt(820, G), tnt(940, G)],
      goblins: [gob(785, G - 140), gob(975, G - 140), gob(880, G - 250)] }; } },
    { id: '1-3', world: 0, name: 'قلعة الدومينو', par: 2, queue: ['melon', 'bomb', 'cluster', 'drill', 'bomb'], build: function () { return {
      blocks: [box(740, G, 20, 150, 'wood'), box(805, G, 20, 150, 'wood'), box(880, G, 22, 140, 'wood'), box(970, G, 22, 140, 'wood'), box(925, G - 140, 126, 20, 'wood'), box(895, G - 160, 20, 96, 'wood'), box(955, G - 160, 20, 96, 'wood'), box(925, G - 256, 98, 20, 'wood'), box(1045, G, 22, 120, 'wood'), tnt(925, G)],
      goblins: [gob(925, G - 160), gob(925, G - 276), gob(1010, G)] }; } },
    { id: '1-4', world: 0, name: 'سلسلة الانفجار', par: 2, queue: ['drill', 'cluster', 'melon', 'saw', 'bomb'], build: function () { return {
      blocks: [box(745, G, 22, 130, 'wood'), box(835, G, 22, 130, 'wood'), box(790, G - 130, 122, 20, 'wood'), box(905, G, 22, 150, 'wood'), box(995, G, 22, 150, 'wood'), box(950, G - 150, 122, 20, 'wood'), box(1055, G, 22, 130, 'wood'), box(1135, G, 22, 130, 'wood'), box(1095, G - 130, 112, 20, 'wood'), tnt(790, G), tnt(950, G), tnt(1095, G)],
      goblins: [gob(790, G - 150), gob(950, G - 170), gob(1095, G - 150), gob(1025, G)] }; } },
    // World 2: قلعة الجليد
    { id: '2-1', world: 1, name: 'أعمدة الصقيع', par: 2, queue: ['drill', 'cluster', 'bomb', 'melon'], build: function () { return {
      blocks: [box(780, G, 20, 150, 'ice'), box(865, G, 20, 150, 'ice'), box(822, G - 150, 120, 20, 'wood'), box(940, G, 20, 150, 'ice'), box(1025, G, 20, 150, 'ice'), box(982, G - 150, 120, 20, 'wood'), box(902, G - 170, 180, 20, 'ice'), tnt(902, G)],
      goblins: [gob(822, G), gob(982, G), gob(902, G - 190)] }; } },
    { id: '2-2', world: 1, name: 'كرة الثلج العملاقة', par: 2, queue: ['bomb', 'drill', 'melon', 'cluster', 'saw'], build: function () { return {
      pedestals: [ped(735, 480, 130)],
      blocks: [box(782, 480, 18, 54, 'ice'), boulder(725, 480, 30), box(875, G, 20, 132, 'ice'), box(965, G, 20, 132, 'ice'), box(920, G - 132, 124, 20, 'ice'), box(1035, G, 20, 120, 'ice'), box(1115, G, 20, 120, 'ice'), box(1075, G - 120, 114, 20, 'wood'), tnt(920, G)],
      goblins: [gob(920, G - 152), gob(1000, G), gob(1075, G - 140)] }; } },
    { id: '2-3', world: 1, name: 'برجا الجليد', par: 2, queue: ['saw', 'drill', 'melon', 'cluster', 'bomb'], build: function () { return {
      blocks: [box(790, G, 20, 146, 'ice'), box(880, G, 20, 146, 'ice'), box(835, G - 146, 124, 20, 'wood'), box(805, G - 166, 18, 96, 'ice'), box(865, G - 166, 18, 96, 'ice'), box(835, G - 262, 96, 18, 'ice'), box(970, G, 20, 146, 'ice'), box(1060, G, 20, 146, 'ice'), box(1015, G - 146, 124, 20, 'wood'), boulder(835, G - 280, 26), tnt(925, G)],
      goblins: [gob(835, G), gob(1015, G), gob(1015, G - 166)] }; } },
    { id: '2-4', world: 1, name: 'قلعة الجليد الكبرى', par: 3, queue: ['drill', 'melon', 'cluster', 'saw', 'bomb'], build: function () { return {
      pedestals: [ped(720, 500, 110)],
      blocks: [box(762, 500, 18, 48, 'ice'), boulder(712, 500, 28), box(845, G, 20, 144, 'ice'), box(935, G, 20, 144, 'ice'), box(890, G - 144, 124, 20, 'wood'), box(1005, G, 20, 144, 'ice'), box(1095, G, 20, 144, 'ice'), box(1050, G - 144, 124, 20, 'wood'), box(970, G - 164, 108, 20, 'ice'), tnt(890, G), tnt(1050, G)],
      goblins: [gob(862, G - 164), gob(1078, G - 164), gob(970, G), gob(970, G - 184)] }; } },
    // World 3: مصنع الآليين
    { id: '3-1', world: 2, name: 'عوارض الفولاذ', par: 2, queue: ['drill', 'bomb', 'melon', 'cluster', 'saw'], build: function () { return {
      blocks: [box(800, G, 20, 140, 'wood'), box(920, G, 20, 140, 'ice'), box(860, G - 140, 158, 24, 'steel'), box(995, G, 20, 140, 'ice'), box(1095, G, 20, 140, 'wood'), box(1045, G - 140, 136, 24, 'steel'), tnt(860, G), tnt(1045, G - 164)],
      goblins: [gob(860, G - 164), gob(958, G), gob(1045, G)] }; } },
    { id: '3-2', world: 2, name: 'بوابة المغناطيس', par: 2, queue: ['bomb', 'cluster', 'drill', 'saw', 'melon'], build: function () { return {
      portals: [{ x1: 560, y1: 390, x2: 960, y2: 250, r: 36, color: '#00f5d4' }],
      blocks: [box(770, G, 28, 220, 'steel'), box(875, G, 22, 136, 'wood'), box(965, G, 22, 136, 'wood'), box(920, G - 136, 124, 20, 'wood'), box(1035, G, 22, 136, 'wood'), box(1125, G, 22, 136, 'wood'), box(1080, G - 136, 124, 20, 'wood'), tnt(960, G - 156), tnt(1000, G)],
      goblins: [gob(920, G), gob(1080, G), gob(1080, G - 156)] }; } },
    { id: '3-3', world: 2, name: 'ممر المناشير', par: 2, queue: ['saw', 'cluster', 'drill', 'melon', 'bomb'], build: function () { return {
      portals: [{ x1: 590, y1: 350, x2: 990, y2: 255, r: 36, color: '#ff3877' }],
      blocks: [box(805, G, 22, 150, 'wood'), box(895, G, 22, 150, 'wood'), box(850, G - 150, 124, 22, 'steel'), box(965, G, 20, 140, 'ice'), box(1065, G, 20, 140, 'ice'), box(1015, G - 140, 134, 20, 'wood'), tnt(850, G), tnt(1015, G - 160)],
      goblins: [gob(850, G - 172), gob(930, G), gob(1015, G)] }; } },
    { id: '3-4', world: 2, name: 'زعيم المصنع الآلي', par: 3, queue: ['melon', 'drill', 'cluster', 'saw', 'bomb', 'bomb'], build: function () { return {
      portals: [{ x1: 545, y1: 365, x2: 955, y2: 225, r: 36, color: '#00c8ff' }],
      blocks: [box(795, G, 22, 148, 'wood'), box(885, G, 22, 148, 'ice'), box(840, G - 148, 116, 22, 'steel'), box(915, G, 22, 148, 'ice'), box(1005, G, 22, 148, 'wood'), box(960, G - 148, 116, 22, 'steel'), box(1045, G, 22, 130, 'wood'), box(1125, G, 22, 130, 'wood'), box(1085, G - 130, 114, 20, 'wood'), tnt(840, G), tnt(960, G), tnt(1085, G)],
      goblins: [gob(955, G - 170, true), gob(840, G - 170), gob(1085, G - 150)] }; } },
    // World 4: جزيرة البركان
    { id: '4-1', world: 3, name: 'ينبوع البخار', par: 2, queue: ['bomb', 'melon', 'cluster', 'drill', 'saw'], build: function () { return {
      geysers: [{ x: 565, y: G, w: 96, boostVy: -820, boostVx: 240 }],
      blocks: [box(720, G, 28, 210, 'steel'), box(840, G, 22, 142, 'wood'), box(936, G, 22, 142, 'wood'), box(888, G - 142, 130, 20, 'wood'), box(1016, G, 22, 132, 'wood'), box(1106, G, 22, 132, 'wood'), box(1061, G - 132, 124, 20, 'wood'), tnt(888, G), tnt(976, G)],
      goblins: [gob(888, G - 162), gob(1061, G), gob(1061, G - 152)] }; } },
    { id: '4-2', world: 3, name: 'صخور البركان', par: 2, queue: ['drill', 'saw', 'melon', 'cluster', 'bomb'], build: function () { return {
      geysers: [{ x: 530, y: G, w: 92, boostVy: -790, boostVx: 230 }], pedestals: [ped(745, 486, 120)],
      blocks: [box(790, 486, 18, 52, 'wood'), boulder(735, 486, 30), box(880, G, 22, 144, 'wood'), box(970, G, 22, 144, 'ice'), box(925, G - 144, 124, 22, 'steel'), box(1055, G, 22, 130, 'wood'), box(1135, G, 22, 130, 'wood'), box(1095, G - 130, 114, 20, 'wood'), tnt(925, G), tnt(1095, G)],
      goblins: [gob(925, G - 166), gob(1012, G), gob(1095, G - 150)] }; } },
    { id: '4-3', world: 3, name: 'بوابة الحمم', par: 2, queue: ['cluster', 'saw', 'drill', 'melon', 'bomb', 'bomb'], build: function () { return {
      geysers: [{ x: 510, y: G, w: 92, boostVy: -800, boostVx: 210 }], portals: [{ x1: 660, y1: 300, x2: 995, y2: 230, r: 36, color: '#ff9e00' }],
      blocks: [box(805, G, 22, 146, 'wood'), box(895, G, 22, 146, 'wood'), box(850, G - 146, 124, 22, 'steel'), box(975, G, 22, 146, 'ice'), box(1065, G, 22, 146, 'ice'), box(1020, G - 146, 124, 20, 'wood'), tnt(850, G), tnt(1020, G), tnt(1020, G - 166)],
      goblins: [gob(850, G - 168), gob(935, G), gob(1115, G)] }; } },
    { id: '4-4', world: 3, name: 'قلعة البركان العملاقة', par: 3, queue: ['melon', 'drill', 'cluster', 'saw', 'bomb', 'melon'], build: function () { return {
      geysers: [{ x: 530, y: G, w: 96, boostVy: -830, boostVx: 245 }], portals: [{ x1: 665, y1: 285, x2: 960, y2: 205, r: 36, color: '#ffe033' }],
      blocks: [box(770, G, 22, 152, 'wood'), box(860, G, 22, 152, 'ice'), box(815, G - 152, 124, 22, 'steel'), box(915, G, 22, 156, 'ice'), box(1005, G, 22, 156, 'ice'), box(960, G - 156, 124, 22, 'steel'), box(1085, G, 22, 142, 'wood'), box(1170, G, 22, 142, 'wood'), box(1127, G - 142, 120, 20, 'wood'), tnt(815, G), tnt(960, G), tnt(1127, G)],
      goblins: [gob(960, G - 178, true), gob(815, G - 174), gob(1127, G - 162), gob(1045, G)] }; } }
  ];

  function makeBlock(spec, id, P, side) {
    var mat = MATERIALS[spec.mat] || MATERIALS.wood, bw = spec.bw || 40, bh = spec.bh || 40, r = spec.r || bw / 2;
    var area = spec.shape === 'circle' ? Math.PI * r * r : bw * bh, m = Math.max(0.7, area * mat.density);
    var inertia = spec.shape === 'circle' ? 0.5 * m * r * r : m * (bw * bw + bh * bh) / 12;
    var maxHp = Math.max(18, Math.round(mat.hp * (spec.isTnt ? 1 : P.hpScale)));
    return {
      id: id, kind: 'block', shape: spec.shape || 'box', mat: mat.id,
      x: spec.x, y: spec.y, vx: 0, vy: 0, rot: spec.rot || 0, w: 0,
      bw: bw, bh: bh, r: r, boundR: spec.shape === 'circle' ? r : Math.hypot(bw, bh) * 0.5,
      m: m, im: 1 / m, iI: 1 / inertia, mu: mat.mu, rest: mat.rest,
      hp: maxHp, maxHp: maxHp, side: side || 2, isTnt: !!spec.isTnt, fuse: -1,
      splatColor: '', alive: true, sleeping: true, restT: 0.5, flash: 0
    };
  }

  function makeGoblin(spec, id, P, side) {
    var r = spec.r || (spec.boss ? 34 : 21), m = spec.boss ? 3.2 : 1.4, inertia = 0.5 * m * r * r;
    var maxHp = Math.max(20, Math.round((spec.boss ? 135 : 38) * P.hpScale));
    return {
      id: id, kind: 'goblin', shape: 'circle', boss: !!spec.boss,
      x: spec.x, y: spec.y, vx: 0, vy: 0, rot: 0, w: 0, bw: r * 2, bh: r * 2, r: r, boundR: r,
      m: m, im: 1 / m, iI: 1 / inertia, mu: 0.48, rest: 0.18,
      hp: maxHp, maxHp: maxHp, side: side || spec.side || 2,
      splatColor: '', alive: true, sleeping: true, restT: 0.5, flash: 0
    };
  }

  function makePedestal(spec, id) {
    return {
      id: id, kind: 'static', shape: 'box', mat: 'steel', x: spec.x, y: spec.y, vx: 0, vy: 0, rot: 0, w: 0,
      bw: spec.bw, bh: spec.bh, r: 0, boundR: Math.hypot(spec.bw, spec.bh) * 0.5,
      m: 0, im: 0, iI: 0, mu: 0.58, rest: 0.08, alive: true, sleeping: true
    };
  }

  function createStage(idx, P) {
    idx = clamp(idx | 0, 0, STAGES.length - 1);
    P = P || NEUTRAL;
    var st = STAGES[idx], rnd = mulberry32(1009 + idx * 7919), built = st.build();
    var q = st.queue.slice(), extras = ['bomb', 'melon', 'cluster', 'drill'];
    for (var b = 0; b < (P.bonusShots || 0); b++) q.push(extras[b % extras.length]);
    var wind = P.windMax ? Math.round((rnd() * 2 - 1) * P.windMax) : 0;
    if (P.windMax && Math.abs(wind) < 28) wind = wind < 0 ? -36 : 36;
    var w = {
      mode: 'solo', stageIndex: idx, id: st.id, world: st.world, name: st.name, par: st.par,
      width: W, height: H, groundY: G, params: P, rnd: rnd, time: 0, phase: 'aim', turn: 1, winner: 0,
      sling1: { x: 190, y: 558 }, sling2: { x: 1090, y: 558 },
      aimAngle: DEFAULT_ANGLE, aimPower: DEFAULT_POWER, wind: wind,
      queue: q, shots: 0, score: 0, combo: 0, shotHitAny: false, shotHitTarget: false, settleT: 0, flightT: 0,
      blocksSmashed: 0, goblinsSplatted: 0, tntBlasted: 0, toppledCount: 0,
      pedestals: (built.pedestals || []).map(function (s, i) { return makePedestal(s, i); }),
      blocks: (built.blocks || []).map(function (s, i) { return makeBlock(s, i, P, 2); }),
      goblins: (built.goblins || []).map(function (s, i) { return makeGoblin(s, i, P, 2); }),
      portals: (built.portals || []).map(function (p) { return Object.assign({}, p); }),
      geysers: (built.geysers || []).map(function (g) { return Object.assign({}, g); }),
      projectiles: [], splats: [], ev: []
    };
    w.bots = w.goblins;
    return w;
  }

  function buildDuelFort(cx, dir, side, P, b0, g0) {
    return {
      blocks: [
        makeBlock(box(cx - dir * 82, G, 22, 144, 'wood'), b0, P, side),
        makeBlock(box(cx, G, 22, 144, 'ice'), b0 + 1, P, side),
        makeBlock(box(cx + dir * 82, G, 22, 144, 'wood'), b0 + 2, P, side),
        makeBlock(box(cx - dir * 41, G - 144, 80, 20, 'wood'), b0 + 3, P, side),
        makeBlock(box(cx + dir * 41, G - 144, 80, 20, 'wood'), b0 + 4, P, side),
        makeBlock(box(cx - dir * 28, G - 164, 20, 92, 'wood'), b0 + 5, P, side),
        makeBlock(box(cx + dir * 28, G - 164, 20, 92, 'wood'), b0 + 6, P, side),
        makeBlock(box(cx, G - 256, 86, 20, 'steel'), b0 + 7, P, side),
        makeBlock(tnt(cx - dir * 41, G), b0 + 8, P, side)
      ],
      goblins: [
        makeGoblin(gob(cx + dir * 41, G), g0, P, side),
        makeGoblin(gob(cx - dir * 41, G - 164), g0 + 1, P, side),
        makeGoblin(gob(cx, G - 276), g0 + 2, P, side)
      ]
    };
  }

  function createDuel(diffId) {
    var P = params(diffId || 'mid', 0.35), rnd = mulberry32(424242);
    var f1 = buildDuelFort(230, 1, 1, P, 0, 0), f2 = buildDuelFort(DUEL_W - 230, -1, 2, P, 20, 10);
    var cycle = ['bomb', 'cluster', 'melon', 'drill', 'saw'];
    var w = {
      mode: 'duel', stageIndex: -1, id: 'duel', world: 0, name: 'مبارزة القلعتين', par: 3,
      width: DUEL_W, height: H, groundY: G, params: P, rnd: rnd, time: 0, phase: 'aim', turn: 1, winner: 0,
      sling1: { x: 455, y: 558 }, sling2: { x: DUEL_W - 455, y: 558 },
      p1Aim: { angle: 0.52, power: 0.80 }, p2Aim: { angle: 0.52, power: 0.80 },
      aimAngle: 0.52, aimPower: 0.80, wind: 0, duelCycle: cycle, duelShotIdx: 0,
      queue: [cycle[0], cycle[1]], shots: 0, score: 0, combo: 0,
      shotHitAny: false, shotHitTarget: false, settleT: 0, flightT: 0,
      blocksSmashed: 0, goblinsSplatted: 0, tntBlasted: 0, toppledCount: 0,
      pedestals: [], blocks: f1.blocks.concat(f2.blocks), goblins: f1.goblins.concat(f2.goblins),
      portals: [], geysers: [{ x: DUEL_W / 2, y: G, w: 110, boostVy: -760, boostVx: 0 }],
      projectiles: [], splats: [], ev: []
    };
    w.bots = w.goblins;
    return w;
  }

  function activeSling(w) { return w.mode === 'duel' && w.turn === 2 ? w.sling2 : w.sling1; }
  function aimDir(w) { return w.mode === 'duel' && w.turn === 2 ? -1 : 1; }
  function goblinsLeft(w, side) {
    var n = 0;
    for (var i = 0; i < w.goblins.length; i++) if (w.goblins[i].alive && (!side || w.goblins[i].side === side)) n++;
    return n;
  }
  function launchSpeed(w, power) { var maxV = w.mode === 'duel' ? 1250 : 1050; return 340 + clamp(power, 0.22, 1) * (maxV - 340); }

  function setAim(w, angle, power) {
    if (!w || w.phase !== 'aim') return;
    if (typeof angle === 'number' && angle === angle) w.aimAngle = clamp(angle, MIN_ANGLE, MAX_ANGLE);
    if (typeof power === 'number' && power === power) w.aimPower = clamp(power, 0.22, 1);
    if (w.mode === 'duel') { var slot = w.turn === 2 ? w.p2Aim : w.p1Aim; slot.angle = w.aimAngle; slot.power = w.aimPower; }
  }

  function swapProjectile(w) {
    if (!w || w.phase !== 'aim' || w.queue.length < 2) return false;
    var tmp = w.queue[0]; w.queue[0] = w.queue[1]; w.queue[1] = tmp;
    w.ev.push({ t: 'swap', id: w.queue[0] });
    return true;
  }

  function trajectory(w) {
    var pts = [];
    if (!w) return pts;
    var sl = activeSling(w), dir = aimDir(w), spd = launchSpeed(w, w.aimPower);
    var x = sl.x, y = sl.y - 12, vx = Math.cos(w.aimAngle) * spd * dir, vy = -Math.sin(w.aimAngle) * spd;
    var dots = (w.params && w.params.arcDots) || 26, dt = 1 / 38;
    for (var i = 0; i < dots; i++) {
      vx += (w.wind || 0) * dt; vy += PROJ_G * dt; x += vx * dt; y += vy * dt;
      if (y > w.groundY) break;
      pts.push({ x: x, y: y });
    }
    return pts;
  }

  function fire(w) {
    if (!w || w.phase !== 'aim' || !w.queue.length) return false;
    var id = w.queue.shift();
    if (w.mode === 'duel') { w.duelShotIdx++; w.queue.push(w.duelCycle[(w.duelShotIdx + 1) % w.duelCycle.length]); }
    var def = PROJECTILES[id] || PROJECTILES.bomb, sl = activeSling(w), dir = aimDir(w), spd = launchSpeed(w, w.aimPower);
    var vx = Math.cos(w.aimAngle) * spd * dir, vy = -Math.sin(w.aimAngle) * spd;
    w.projectiles = [{
      type: def.id, x: sl.x + dir * 14, y: sl.y - 12, vx: vx, vy: vy,
      r: def.r, m: def.m, dmg: def.dmg, blastR: def.blastR * w.params.blastScale, blastJ: def.blastJ * w.params.blastScale,
      color: def.color, accent: def.accent, rot: Math.atan2(vy, vx),
      side: w.turn, dir: dir, alive: true, flight: 0,
      bouncesLeft: def.id === 'melon' ? 1 : 0, pierceLeft: def.id === 'saw' ? 2 : 0,
      specialUsed: false, drilling: 0, boomerang: false, slammed: false, surged: false,
      portalCd: 0, geyserCd: 0, hitIds: {}
    }];
    w.shots++; w.combo = 0; w.shotHitAny = false; w.shotHitTarget = false; w.flightT = 0; w.settleT = 0; w.phase = 'flight';
    w.ev.push({ t: 'launch', x: sl.x, y: sl.y - 12, proj: def.id, power: w.aimPower });
    return true;
  }

  function wakeAll(w, cx, cy, rad) {
    var r2 = rad * rad, i, b, dx, dy;
    for (i = 0; i < w.blocks.length; i++) { b = w.blocks[i]; if (!b.alive) continue; dx = b.x - cx; dy = b.y - cy; if (dx * dx + dy * dy <= r2) { b.sleeping = false; b.restT = 0; } }
    for (i = 0; i < w.goblins.length; i++) { b = w.goblins[i]; if (!b.alive) continue; dx = b.x - cx; dy = b.y - cy; if (dx * dx + dy * dy <= r2) { b.sleeping = false; b.restT = 0; } }
  }

  function addSplat(w, x, y, r, color) {
    if (w.splats.length >= 64) w.splats.shift();
    w.splats.push({ x: x, y: Math.min(y, w.groundY - 2), r: r, color: color, seed: (w.rnd() * 1000) | 0 });
  }

  function damageGoblin(w, g, dmg, color) {
    if (!g.alive) return;
    g.hp -= dmg; g.flash = 0.2; g.sleeping = false; g.restT = 0; g.splatColor = color || '#ff3877';
    w.shotHitAny = true; w.shotHitTarget = true;
    if (g.hp <= 0) {
      g.alive = false; w.goblinsSplatted++; w.combo++;
      var pts = Math.round((g.boss ? 1500 : 550) * (1 + (w.combo - 1) * 0.25) * w.params.scoreMult);
      w.score += pts; addSplat(w, g.x, g.y, g.r * 1.65, g.splatColor);
      w.ev.push({ t: 'goblinPop', x: g.x, y: g.y, boss: g.boss, color: g.splatColor, pts: pts, combo: w.combo });
    } else w.ev.push({ t: 'goblinHit', x: g.x, y: g.y, color: g.splatColor });
  }

  function damageBlock(w, b, dmg, color) {
    if (!b.alive) return;
    if (color) b.splatColor = color;
    b.hp -= dmg; b.flash = 0.14; b.sleeping = false; b.restT = 0; w.shotHitAny = true;
    if (b.hp <= 0) {
      if (b.isTnt) { detonateBarrel(w, b, color || '#ff3877'); return; }
      b.alive = false; w.blocksSmashed++;
      var pts = Math.round((b.mat === 'steel' ? 220 : 95) * w.params.scoreMult);
      w.score += pts; wakeAll(w, b.x, b.y, 190); addSplat(w, b.x, b.y, 26, b.splatColor || '#ffe033');
      w.ev.push({ t: 'smash', x: b.x, y: b.y, mat: b.mat, color: b.splatColor || '#ffe033', pts: pts });
    }
  }

  function applyBlast(w, cx, cy, rad, impulse, dmg, color, ownerSide) {
    wakeAll(w, cx, cy, rad * 1.45); addSplat(w, cx, cy, rad * 0.42, color);
    var i, b, dx, dy, d, falloff, jx, jy;
    for (i = 0; i < w.blocks.length; i++) {
      b = w.blocks[i];
      if (!b.alive || (w.mode === 'duel' && ownerSide && b.side === ownerSide)) continue;
      dx = b.x - cx; dy = b.y - cy; d = Math.hypot(dx, dy);
      if (d > rad + b.boundR) continue;
      falloff = clamp(1 - d / (rad + b.boundR + 10), 0.18, 1);
      var nx = d > 1 ? dx / d : (w.rnd() - 0.5), ny = d > 1 ? dy / d : -0.8;
      jx = nx * impulse * falloff; jy = (ny - 0.32) * impulse * falloff;
      b.vx += b.im * jx; b.vy += b.im * jy;
      var offX = clamp(cx - b.x, -b.bw * 0.45, b.bw * 0.45), offY = clamp(cy - b.y, -b.bh * 0.45, b.bh * 0.45);
      b.w += b.iI * (offX * jy - offY * jx) * 1.35; b.sleeping = false; b.restT = 0;
      if (b.isTnt && b.fuse < 0 && falloff > 0.25) { b.fuse = 0.05; w.shotHitTarget = true; }
      else damageBlock(w, b, dmg * falloff * (b.mat === 'steel' ? 0.55 : b.mat === 'ice' ? 1.3 : 1.0), color);
    }
    for (i = 0; i < w.goblins.length; i++) {
      var g = w.goblins[i];
      if (!g.alive || (w.mode === 'duel' && ownerSide && g.side === ownerSide)) continue;
      dx = g.x - cx; dy = g.y - cy; d = Math.hypot(dx, dy);
      if (d > rad + g.r + (w.params.hitRadiusBonus || 0)) continue;
      falloff = clamp(1 - d / (rad + g.r + 18), 0.25, 1);
      var gnx = d > 1 ? dx / d : 0, gny = d > 1 ? dy / d : -1;
      g.vx += g.im * gnx * impulse * 0.7 * falloff; g.vy += g.im * (gny - 0.45) * impulse * 0.7 * falloff;
      g.w += (gnx * 6) * falloff; damageGoblin(w, g, dmg * 1.15 * falloff, color);
    }
  }

  function detonateBarrel(w, barrel, color) {
    if (!barrel.alive) return;
    barrel.alive = false; w.tntBlasted++; w.shotHitAny = true; w.shotHitTarget = true;
    var c = color || '#ff3877', pts = Math.round(320 * w.params.scoreMult);
    w.score += pts;
    w.ev.push({ t: 'boom', x: barrel.x, y: barrel.y, r: 175 * w.params.blastScale, color: c, pts: pts });
    applyBlast(w, barrel.x, barrel.y, 175 * w.params.blastScale, 760 * w.params.blastScale, 118, c, 0);
  }

  function activateSpecial(w) {
    if (!w || w.phase !== 'flight' || !w.projectiles.length) return false;
    var p = null;
    for (var i = 0; i < w.projectiles.length; i++) if (w.projectiles[i].alive && !w.projectiles[i].specialUsed) { p = w.projectiles[i]; break; }
    if (!p) return false;
    p.specialUsed = true;
    if (p.type === 'bomb') {
      p.surged = true; p.blastR *= 1.48; p.blastJ *= 1.45; p.dmg *= 1.3; p.r = Math.round(p.r * 1.2);
      applyBlast(w, p.x, p.y, 128 * w.params.blastScale, 460 * w.params.blastScale, 42, p.color, p.side);
    } else if (p.type === 'cluster') {
      var baseAng = Math.atan2(p.vy, p.vx), spd = Math.max(580, Math.hypot(p.vx, p.vy) * 1.15);
      var spreads = [-0.21, 0, 0.21], colors = ['#00c8ff', '#ff3877', '#ffe033'];
      p.alive = false;
      for (var k = 0; k < 3; k++) {
        var a = baseAng + spreads[k];
        w.projectiles.push({
          type: 'cluster', x: p.x, y: p.y + (k - 1) * 8, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          r: 14, m: 1.3, dmg: 54, blastR: 88 * w.params.blastScale, blastJ: 390 * w.params.blastScale,
          color: colors[k], accent: '#ffffff', rot: a, side: p.side, dir: p.dir, alive: true, flight: p.flight,
          bouncesLeft: 0, pierceLeft: 0, specialUsed: true, mini: true, drilling: 0, boomerang: false, slammed: false, surged: false,
          portalCd: p.portalCd, geyserCd: p.geyserCd, hitIds: {}
        });
      }
    } else if (p.type === 'drill') {
      var best = null, bestD = 1e9, idx;
      for (idx = 0; idx < w.goblins.length; idx++) {
        var g = w.goblins[idx];
        if (!g.alive || (w.mode === 'duel' && g.side === p.side) || (g.x - p.x) * p.dir < -30) continue;
        var dg = Math.hypot(g.x - p.x, g.y - p.y); if (dg < bestD) { bestD = dg; best = g; }
      }
      for (idx = 0; idx < w.blocks.length; idx++) {
        var tb = w.blocks[idx];
        if (!tb.alive || !tb.isTnt || (w.mode === 'duel' && tb.side === p.side) || (tb.x - p.x) * p.dir < -30) continue;
        var dtb = Math.hypot(tb.x - p.x, tb.y - p.y) * 0.85; if (dtb < bestD) { bestD = dtb; best = tb; }
      }
      var tx = best ? best.x - p.x : p.dir * 400, ty = best ? best.y - p.y : 90, len = Math.max(1, Math.hypot(tx, ty));
      p.vx = (tx / len) * 1120; p.vy = (ty / len) * 1120; p.drilling = 0.55; p.pierceLeft = 3;
    } else if (p.type === 'melon') {
      p.slammed = true; p.vx *= 0.14; p.vy = 1080; p.blastR *= 1.32; p.blastJ *= 1.38; p.dmg *= 1.35; p.bouncesLeft = 0;
    } else if (p.type === 'saw') {
      p.boomerang = true; p.pierceLeft = Math.max(p.pierceLeft, 4); p.vy = Math.min(p.vy, -110);
    } else return false;
    w.ev.push({ t: 'special', kind: p.type, x: p.x, y: p.y, color: p.color });
    return true;
  }

  var GROUND_BODY = { im: 0, iI: 0, x: 640, y: G + 40, vx: 0, vy: 0, w: 0, mu: 0.68, rest: 0.06 };
  function pushContact(list, A, B, cx, cy, nx, ny, depth) {
    var rAx = cx - A.x, rAy = cy - A.y, rBx = cx - B.x, rBy = cy - B.y;
    var dvx = (B.vx - B.w * rBy) - (A.vx - A.w * rAy), dvy = (B.vy + B.w * rBx) - (A.vy + A.w * rAx);
    var rnA = rAx * ny - rAy * nx, rnB = rBx * ny - rBy * nx, kN = A.im + B.im + A.iI * rnA * rnA + B.iI * rnB * rnB;
    var tx = -ny, ty = nx, rtA = rAx * ty - rAy * tx, rtB = rBx * ty - rBy * tx, kT = A.im + B.im + A.iI * rtA * rtA + B.iI * rtB * rtB;
    list.push({
      A: A, B: B, cx: cx, cy: cy, nx: nx, ny: ny, tx: tx, ty: ty, rAx: rAx, rAy: rAy, rBx: rBx, rBy: rBy,
      massN: kN > 0 ? 1 / kN : 0, massT: kT > 0 ? 1 / kT : 0,
      mu: Math.sqrt((A.mu || 0.5) * (B.mu || 0.5)), depth: depth, vn0: dvx * nx + dvy * ny,
      rest: Math.min(A.rest || 0.1, B.rest || 0.1), jn: 0, jt: 0
    });
  }

  function clipSegment(vIn, nx, ny, offset) {
    var out = [], d0 = nx * vIn[0].x + ny * vIn[0].y - offset, d1 = nx * vIn[1].x + ny * vIn[1].y - offset;
    if (d0 <= 0) out.push(vIn[0]);
    if (d1 <= 0) out.push(vIn[1]);
    if (d0 * d1 < 0) { var u = d0 / (d0 - d1); out.push({ x: vIn[0].x + u * (vIn[1].x - vIn[0].x), y: vIn[0].y + u * (vIn[1].y - vIn[0].y) }); }
    return out;
  }

  function collideBoxBox(A, B, contacts) {
    var cA = Math.cos(A.rot), sA = Math.sin(A.rot), cB = Math.cos(B.rot), sB = Math.sin(B.rot);
    var hAx = A.bw * 0.5, hAy = A.bh * 0.5, hBx = B.bw * 0.5, hBy = B.bh * 0.5, dx = B.x - A.x, dy = B.y - A.y;
    var axes = [{ x: cA, y: sA, o: 0, a: 0 }, { x: -sA, y: cA, o: 0, a: 1 }, { x: cB, y: sB, o: 1, a: 0 }, { x: -sB, y: cB, o: 1, a: 1 }];
    var minOv = 1e9, best = -1;
    for (var i = 0; i < 4; i++) {
      var ax = axes[i].x, ay = axes[i].y;
      var pA = Math.abs(cA * ax + sA * ay) * hAx + Math.abs(-sA * ax + cA * ay) * hAy;
      var pB = Math.abs(cB * ax + sB * ay) * hBx + Math.abs(-sB * ax + cB * ay) * hBy;
      var ov = pA + pB - Math.abs(dx * ax + dy * ay);
      if (ov <= 0) return;
      if (ov < minOv * 0.995) { minOv = ov; best = i; }
    }
    var nx = axes[best].x, ny = axes[best].y;
    if (dx * nx + dy * ny < 0) { nx = -nx; ny = -ny; }
    var ref = axes[best].o === 0 ? A : B, inc = axes[best].o === 0 ? B : A;
    var rnx = axes[best].o === 0 ? nx : -nx, rny = axes[best].o === 0 ? ny : -ny;
    var cI = Math.cos(inc.rot), sI = Math.sin(inc.rot), ihx = inc.bw * 0.5, ihy = inc.bh * 0.5;
    var dotX = cI * rnx + sI * rny, dotY = -sI * rnx + cI * rny, v1, v2;
    if (Math.abs(dotX) > Math.abs(dotY)) {
      var sx = dotX > 0 ? -ihx : ihx;
      v1 = { x: inc.x + cI * sx + sI * ihy, y: inc.y + sI * sx - cI * ihy };
      v2 = { x: inc.x + cI * sx - sI * ihy, y: inc.y + sI * sx + cI * ihy };
    } else {
      var sy = dotY > 0 ? -ihy : ihy;
      v1 = { x: inc.x - cI * ihx - sI * sy, y: inc.y - sI * ihx + cI * sy };
      v2 = { x: inc.x + cI * ihx - sI * sy, y: inc.y + sI * ihx + cI * sy };
    }
    var sideX = -rny, sideY = rnx, rhx = ref.bw * 0.5, rhy = ref.bh * 0.5;
    var refExt = axes[best].a === 0 ? rhx : rhy, sideExt = axes[best].a === 0 ? rhy : rhx;
    var refFront = ref.x * rnx + ref.y * rny + refExt, refSide = ref.x * sideX + ref.y * sideY;
    var pts = clipSegment([v1, v2], sideX, sideY, refSide + sideExt);
    if (pts.length < 2) return;
    pts = clipSegment(pts, -sideX, -sideY, -refSide + sideExt);
    var cStart = contacts.length;
    for (var k = 0; k < pts.length; k++) {
      var sep = pts[k].x * rnx + pts[k].y * rny - refFront;
      if (sep <= 0.05) pushContact(contacts, A, B, pts[k].x, pts[k].y, nx, ny, Math.max(0, -sep));
    }
    if (contacts.length === cStart) pushContact(contacts, A, B, (A.x + B.x) * 0.5, (A.y + B.y) * 0.5, nx, ny, minOv);
  }

  function collideBoxCircle(boxB, cir, contacts, flip) {
    var c = Math.cos(boxB.rot), s = Math.sin(boxB.rot), dx = cir.x - boxB.x, dy = cir.y - boxB.y;
    var lx = dx * c + dy * s, ly = -dx * s + dy * c, hx = boxB.bw * 0.5, hy = boxB.bh * 0.5;
    var cxL = clamp(lx, -hx, hx), cyL = clamp(ly, -hy, hy), nlx, nly, depth;
    if (lx !== cxL || ly !== cyL) {
      var ddx = lx - cxL, ddy = ly - cyL, d2 = ddx * ddx + ddy * ddy;
      if (d2 >= cir.r * cir.r) return;
      var d = Math.sqrt(d2); nlx = d > 1e-6 ? ddx / d : 0; nly = d > 1e-6 ? ddy / d : -1; depth = cir.r - d;
    } else {
      var ox = hx - Math.abs(lx), oy = hy - Math.abs(ly);
      if (ox < oy) { nlx = lx < 0 ? -1 : 1; nly = 0; cxL = nlx * hx; depth = cir.r + ox; }
      else { nlx = 0; nly = ly < 0 ? -1 : 1; cyL = nly * hy; depth = cir.r + oy; }
    }
    var nx = nlx * c - nly * s, ny = nlx * s + nly * c, wx = boxB.x + cxL * c - cyL * s, wy = boxB.y + cxL * s + cyL * c;
    if (flip) pushContact(contacts, cir, boxB, wx, wy, -nx, -ny, depth);
    else pushContact(contacts, boxB, cir, wx, wy, nx, ny, depth);
  }

  function collideCircleCircle(A, B, contacts) {
    var dx = B.x - A.x, dy = B.y - A.y, rSum = A.r + B.r, d2 = dx * dx + dy * dy;
    if (d2 >= rSum * rSum) return;
    var d = Math.sqrt(d2), nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
    pushContact(contacts, A, B, A.x + nx * A.r, A.y + ny * A.r, nx, ny, rSum - d);
  }

  function collideGround(b, groundY, contacts) {
    if (b.shape === 'circle') { var pen = b.y + b.r - groundY; if (pen > 0) pushContact(contacts, b, GROUND_BODY, b.x, groundY, 0, 1, pen); return; }
    var c = Math.cos(b.rot), s = Math.sin(b.rot), hx = b.bw * 0.5, hy = b.bh * 0.5;
    var cs = [
      { x: b.x - hx * c + hy * s, y: b.y - hx * s - hy * c }, { x: b.x + hx * c + hy * s, y: b.y + hx * s - hy * c },
      { x: b.x + hx * c - hy * s, y: b.y + hx * s + hy * c }, { x: b.x - hx * c - hy * s, y: b.y - hx * s + hy * c }
    ];
    for (var i = 0; i < 4; i++) if (cs[i].y >= groundY) pushContact(contacts, b, GROUND_BODY, cs[i].x, groundY, 0, 1, cs[i].y - groundY);
  }

  function stepRigidBodies(w, subDt) {
    var dyn = [], i, j, b, anyAwake = false;
    for (i = 0; i < w.blocks.length; i++) if (w.blocks[i].alive) dyn.push(w.blocks[i]);
    for (i = 0; i < w.goblins.length; i++) if (w.goblins[i].alive) dyn.push(w.goblins[i]);

    for (i = 0; i < dyn.length; i++) {
      b = dyn[i];
      if (b.flash > 0) b.flash = Math.max(0, b.flash - subDt);
      if (b.isTnt && b.fuse >= 0) { b.fuse -= subDt; if (b.fuse <= 0) { detonateBarrel(w, b, b.splatColor || '#ff3877'); continue; } }
      if (b.sleeping) continue;
      anyAwake = true; b.vy += BODY_G * subDt; b.vx *= 0.9985; b.vy *= 0.9985; b.w *= b.shape === 'circle' ? 0.996 : 0.992;
    }
    if (!anyAwake) return false;

    var contacts = [];
    for (i = 0; i < dyn.length; i++) {
      b = dyn[i];
      if (!b.alive || b.sleeping) continue;
      if (b.y + b.boundR >= w.groundY - 0.5) collideGround(b, w.groundY, contacts);
      for (j = 0; j < w.pedestals.length; j++) {
        var pd = w.pedestals[j];
        if (Math.abs(b.x - pd.x) > b.boundR + pd.bw * 0.5 || Math.abs(b.y - pd.y) > b.boundR + pd.bh * 0.5) continue;
        if (b.shape === 'circle') collideBoxCircle(pd, b, contacts, true); else collideBoxBox(b, pd, contacts);
      }
    }
    for (i = 0; i < dyn.length; i++) {
      var A = dyn[i]; if (!A.alive) continue;
      for (j = i + 1; j < dyn.length; j++) {
        var B = dyn[j]; if (!B.alive || (A.sleeping && B.sleeping)) continue;
        var dx = B.x - A.x, dy = B.y - A.y, rSum = A.boundR + B.boundR;
        if (dx * dx + dy * dy > rSum * rSum) continue;
        var prev = contacts.length;
        if (A.shape === 'box' && B.shape === 'box') collideBoxBox(A, B, contacts);
        else if (A.shape === 'box' && B.shape === 'circle') collideBoxCircle(A, B, contacts, false);
        else if (A.shape === 'circle' && B.shape === 'box') collideBoxCircle(B, A, contacts, true);
        else collideCircleCircle(A, B, contacts);
        if (contacts.length > prev) {
          if (A.sleeping && (B.vx * B.vx + B.vy * B.vy + B.w * B.w * 200 > 220)) { A.sleeping = false; A.restT = 0; }
          if (B.sleeping && (A.vx * A.vx + A.vy * A.vy + A.w * A.w * 200 > 220)) { B.sleeping = false; B.restT = 0; }
        }
      }
    }

    for (var iter = 0; iter < SOLVER_ITERS; iter++) {
      for (i = 0; i < contacts.length; i++) {
        var c = contacts[i], cA = c.A, cB = c.B;
        var imA = cA.sleeping ? 0 : cA.im, iIA = cA.sleeping ? 0 : cA.iI, imB = cB.sleeping ? 0 : cB.im, iIB = cB.sleeping ? 0 : cB.iI;
        if (imA === 0 && imB === 0) continue;
        var dvx = (cB.vx - cB.w * c.rBy) - (cA.vx - cA.w * c.rAy), dvy = (cB.vy + cB.w * c.rBx) - (cA.vy + cA.w * c.rAx);
        var vn = dvx * c.nx + dvy * c.ny, bias = Math.max(0, c.depth - 0.5) * (0.20 / subDt) + (c.vn0 < -120 ? -c.rest * c.vn0 : 0);
        var djn = (-vn + bias) * c.massN, jnOld = c.jn; c.jn = Math.max(0, jnOld + djn); djn = c.jn - jnOld;
        var Px = djn * c.nx, Py = djn * c.ny;
        cA.vx -= imA * Px; cA.vy -= imA * Py; cA.w -= iIA * (c.rAx * Py - c.rAy * Px);
        cB.vx += imB * Px; cB.vy += imB * Py; cB.w += iIB * (c.rBx * Py - c.rBy * Px);

        dvx = (cB.vx - cB.w * c.rBy) - (cA.vx - cA.w * c.rAy); dvy = (cB.vy + cB.w * c.rBx) - (cA.vy + cA.w * c.rAx);
        var djt = -(dvx * c.tx + dvy * c.ty) * c.massT, maxF = c.mu * c.jn, jtOld = c.jt;
        c.jt = clamp(jtOld + djt, -maxF, maxF); djt = c.jt - jtOld;
        var Fx = djt * c.tx, Fy = djt * c.ty;
        cA.vx -= imA * Fx; cA.vy -= imA * Fy; cA.w -= iIA * (c.rAx * Fy - c.rAy * Fx);
        cB.vx += imB * Fx; cB.vy += imB * Fy; cB.w += iIB * (c.rBx * Fy - c.rBy * Fx);
      }
    }

    for (i = 0; i < contacts.length; i++) {
      var ct = contacts[i], impactV = -ct.vn0;
      if (impactV < 138) continue;
      var hA = ct.B.im === 0 ? 1.0 : clamp(ct.B.m / Math.max(0.8, ct.A.m), 0.5, 2.4);
      var hB = clamp(ct.A.m / Math.max(0.8, ct.B.m), 0.5, 2.4), col = ct.A.splatColor || ct.B.splatColor || '#ffe033';
      if (ct.A.kind === 'goblin' && ct.A.alive) damageGoblin(w, ct.A, (impactV - 125) * 0.28 * hA, col);
      else if (ct.A.kind === 'block' && ct.A.alive && impactV > 185) { if (ct.A.isTnt) detonateBarrel(w, ct.A, col); else damageBlock(w, ct.A, (impactV - 175) * 0.17 * hA, ''); }
      if (ct.B.kind === 'goblin' && ct.B.alive) damageGoblin(w, ct.B, (impactV - 125) * 0.28 * hB, col);
      else if (ct.B.kind === 'block' && ct.B.alive && impactV > 185) { if (ct.B.isTnt) detonateBarrel(w, ct.B, col); else damageBlock(w, ct.B, (impactV - 175) * 0.17 * hB, ''); }
    }

    var moving = false;
    for (i = 0; i < dyn.length; i++) {
      b = dyn[i]; if (!b.alive || b.sleeping) continue;
      var oldRot = b.rot; b.x += b.vx * subDt; b.y += b.vy * subDt; b.rot += b.w * subDt;
      if (b.kind === 'block' && !b.toppled && Math.abs(b.rot) > 0.35 && Math.abs(oldRot) <= 0.35) { b.toppled = true; w.toppledCount++; }
      if (b.x < -80 || b.x > w.width + 80 || b.y > w.groundY + 90) { if (b.kind === 'goblin') damageGoblin(w, b, 999, '#ff3877'); else b.alive = false; continue; }
      if (b.vx * b.vx + b.vy * b.vy < 14 && Math.abs(b.w) < 0.08) {
        b.restT += subDt; if (b.restT >= 0.34) { b.vx = b.vy = b.w = 0; b.sleeping = true; } else moving = true;
      } else { b.restT = 0; moving = true; }
    }
    return moving;
  }

  function stepProjectiles(w, dt) {
    var activeCount = 0;
    for (var i = 0; i < w.projectiles.length; i++) {
      var p = w.projectiles[i]; if (!p.alive) continue;
      p.flight += dt; if (p.portalCd > 0) p.portalCd -= dt; if (p.geyserCd > 0) p.geyserCd -= dt;
      if (p.drilling > 0) p.drilling -= dt;
      else { p.vx += (w.wind || 0) * dt; if (p.boomerang) { p.vx -= p.dir * 1380 * dt; p.vy += PROJ_G * 0.42 * dt; } else p.vy += PROJ_G * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot = p.type === 'saw' ? p.rot + p.dir * 18 * dt : Math.atan2(p.vy, p.vx);

      for (var pi = 0; pi < w.portals.length && p.portalCd <= 0; pi++) {
        var pt = w.portals[pi];
        if (Math.hypot(p.x - pt.x1, p.y - pt.y1) <= pt.r + p.r * 0.6) {
          p.x = pt.x2; p.y = pt.y2; p.vx *= 0.45; p.vy = Math.max(240, Math.abs(p.vy) * 0.65); p.portalCd = 0.45;
          w.ev.push({ t: 'portal', x1: pt.x1, y1: pt.y1, x2: pt.x2, y2: pt.y2, color: pt.color });
        }
      }
      for (var gi = 0; gi < w.geysers.length && p.geyserCd <= 0; gi++) {
        var gy = w.geysers[gi];
        if (Math.abs(p.x - gy.x) <= gy.w * 0.55 && p.y >= gy.y - 160 && p.y <= gy.y + 20) {
          p.vy = gy.boostVy; if (gy.boostVx) p.vx = (p.vx > 0 ? 1 : -1) * Math.max(Math.abs(p.vx), gy.boostVx + 260);
          p.geyserCd = 0.4; w.ev.push({ t: 'geyser', x: gy.x, y: gy.y - 40 });
        }
      }

      var exploded = false, bonusR = w.params.hitRadiusBonus || 0;
      for (var gIdx = 0; gIdx < w.goblins.length; gIdx++) {
        var g = w.goblins[gIdx];
        if (!g.alive || (w.mode === 'duel' && g.side === p.side) || p.hitIds['g' + g.id]) continue;
        if (Math.hypot(p.x - g.x, p.y - g.y) <= p.r + g.r + bonusR) {
          p.hitIds['g' + g.id] = 1; damageGoblin(w, g, p.dmg * 1.25, p.color);
          g.vx += p.vx * 0.35; g.vy += p.vy * 0.35 - 90;
          if (p.pierceLeft > 0) { p.pierceLeft--; w.ev.push({ t: 'slice', x: g.x, y: g.y, color: p.color }); } else { exploded = true; break; }
        }
      }
      if (!exploded) for (var pdIdx = 0; pdIdx < w.pedestals.length; pdIdx++) { var tmpP = []; collideBoxCircle(w.pedestals[pdIdx], p, tmpP, false); if (tmpP.length) { exploded = true; break; } }
      if (!exploded) {
        for (var bIdx = 0; bIdx < w.blocks.length; bIdx++) {
          var b = w.blocks[bIdx];
          if (!b.alive || (w.mode === 'duel' && b.side === p.side) || p.hitIds['b' + b.id]) continue;
          if (Math.hypot(p.x - b.x, p.y - b.y) > p.r + b.boundR + 2) continue;
          var hitList = [];
          if (b.shape === 'circle') collideCircleCircle(b, p, hitList); else collideBoxCircle(b, p, hitList, false);
          if (!hitList.length) continue;
          p.hitIds['b' + b.id] = 1; wakeAll(w, b.x, b.y, 220);
          if (b.isTnt) { detonateBarrel(w, b, p.color); if (p.pierceLeft > 0) p.pierceLeft--; else { exploded = true; break; } continue; }
          var hc = hitList[0], jScale = p.m * 0.82, Jx = p.vx * jScale, Jy = p.vy * jScale, rx = hc.cx - b.x, ry = hc.cy - b.y;
          b.vx += b.im * Jx; b.vy += b.im * Jy; b.w += b.iI * (rx * Jy - ry * Jx) * 1.45; b.sleeping = false; b.restT = 0;
          var canPierce = p.pierceLeft > 0 && b.mat !== 'steel';
          damageBlock(w, b, canPierce ? p.dmg * 1.45 : p.dmg, p.color);
          if (canPierce) { p.pierceLeft--; p.vx *= 0.88; p.vy *= 0.88; w.ev.push({ t: 'slice', x: hc.cx, y: hc.cy, color: p.color }); }
          else { exploded = true; break; }
        }
      }
      if (!exploded && p.y + p.r >= w.groundY) {
        p.y = w.groundY - p.r;
        if (p.bouncesLeft > 0) {
          p.bouncesLeft--; p.vy = -Math.abs(p.vy) * 0.62; p.vx *= 0.82;
          applyBlast(w, p.x, w.groundY, p.blastR * 0.72, p.blastJ * 0.65, p.dmg * 0.55, p.color, p.side);
          w.ev.push({ t: 'bounce', x: p.x, y: w.groundY, color: p.color });
        } else exploded = true;
      }
      if (p.x < -140 || p.x > w.width + 140 || p.y > w.groundY + 100 || p.flight > 5.2) { p.alive = false; continue; }
      if (exploded) {
        p.alive = false; applyBlast(w, p.x, p.y, p.blastR, p.blastJ, p.dmg * 0.72, p.color, p.side);
        w.ev.push({ t: 'impact', x: p.x, y: p.y, r: p.blastR, color: p.color, proj: p.type, slammed: p.slammed || p.surged });
        continue;
      }
      activeCount++;
    }
    return activeCount > 0;
  }

  function finishShot(w) {
    w.projectiles = [];
    w.ev.push({ t: 'shotEnd', hitAny: w.shotHitAny, hitTarget: w.shotHitTarget });
    if (w.mode === 'duel') {
      var p1Left = goblinsLeft(w, 1), p2Left = goblinsLeft(w, 2);
      if (p2Left === 0 || p1Left === 0) { w.phase = 'win'; w.winner = p2Left === 0 ? 1 : 2; w.ev.push({ t: 'win', winner: w.winner }); return; }
      w.turn = w.turn === 1 ? 2 : 1; var slot = w.turn === 2 ? w.p2Aim : w.p1Aim;
      w.aimAngle = slot.angle; w.aimPower = slot.power; w.phase = 'aim'; w.ev.push({ t: 'turn', turn: w.turn }); return;
    }
    if (goblinsLeft(w) === 0) { w.phase = 'win'; w.score += w.queue.length * 600; w.ev.push({ t: 'win', stars: calcStars(w), score: w.score, left: w.queue.length }); return; }
    if (w.queue.length === 0) { w.phase = 'lose'; w.ev.push({ t: 'lose', score: w.score }); return; }
    w.phase = 'aim';
  }

  function step(w, dt) {
    if (!w || w.phase === 'win' || w.phase === 'lose') return;
    dt = clamp(dt || 1 / 60, 0.001, 0.05); w.time += dt;
    var flyActive = false;
    if (w.phase === 'flight') { w.flightT += dt; flyActive = stepProjectiles(w, dt); if (!flyActive) { w.phase = 'settle'; w.settleT = 0; } }
    var subDt = dt / SUBSTEPS, bodiesMoving = false;
    for (var s = 0; s < SUBSTEPS; s++) if (stepRigidBodies(w, subDt)) bodiesMoving = true;
    var cleared = w.mode === 'solo' ? goblinsLeft(w) === 0 : (goblinsLeft(w, 1) === 0 || goblinsLeft(w, 2) === 0);
    if ((w.phase === 'flight' || w.phase === 'settle') && cleared && !flyActive) { w.settleT += dt * 2.2; if (w.settleT >= 0.45) { finishShot(w); return; } }
    if (w.phase === 'settle') { w.settleT += dt; if ((!bodiesMoving && w.settleT >= 0.30) || w.settleT >= 1.8) finishShot(w); }
  }

  function calcStars(w) { if (!w || w.phase !== 'win') return 0; return w.shots <= w.par ? 3 : w.shots <= w.par + 1 ? 2 : 1; }
  function freshSave() {
    var lv = []; for (var i = 0; i < STAGES.length; i++) lv.push({ s: 0, best: 0 });
    return { v: 2, diff: 'easy', coins: 0, launcher: 0, launchers: [1, 0, 0, 0, 0], palette: 0, palettes: [1, 0, 0, 0], lv: lv };
  }
  function loadSave(raw) {
    var base = freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 2) return base;
    if (typeof raw.coins !== 'number' || raw.coins < 0 || !isFinite(raw.coins)) return base;
    if (DIFFS[raw.diff]) base.diff = raw.diff;
    base.coins = Math.min(99999, raw.coins | 0);
    if (Array.isArray(raw.launchers) && raw.launchers.length === LAUNCHERS.length) for (var i = 0; i < LAUNCHERS.length; i++) base.launchers[i] = i === 0 || raw.launchers[i] === 1 ? 1 : 0;
    if (Array.isArray(raw.palettes) && raw.palettes.length === PALETTES.length) for (var j = 0; j < PALETTES.length; j++) base.palettes[j] = j === 0 || raw.palettes[j] === 1 ? 1 : 0;
    var ln = raw.launcher | 0, pl = raw.palette | 0;
    if (ln < 0 || ln >= LAUNCHERS.length || !base.launchers[ln] || pl < 0 || pl >= PALETTES.length || !base.palettes[pl]) return freshSave();
    base.launcher = ln; base.palette = pl;
    if (Array.isArray(raw.lv)) {
      for (var k = 0; k < Math.min(STAGES.length, raw.lv.length); k++) {
        var e = raw.lv[k]; if (!e || typeof e !== 'object') continue;
        var st = e.s | 0, bs = e.best | 0; if (st < 0 || st > 3 || bs < 0) return freshSave();
        base.lv[k] = { s: st, best: bs };
      }
    }
    return base;
  }
  function isOpen(save, idx) { return idx >= 0 && idx < STAGES.length; }
  function totalStars(save) { var sum = 0; if (!save || !Array.isArray(save.lv)) return 0; for (var i = 0; i < save.lv.length; i++) sum += save.lv[i].s | 0; return sum; }
  function applyResult(save, idx, stars, score) {
    idx = clamp(idx | 0, 0, STAGES.length - 1); stars = clamp(stars | 0, 1, 3); score = Math.max(0, Math.round(score || 0));
    var rec = save.lv[idx], prevStars = rec.s, newBest = score > rec.best;
    if (stars > rec.s) rec.s = stars; if (newBest) rec.best = score;
    var earned = 5 + stars * 4 + (stars > prevStars ? (stars - prevStars) * 4 : 0);
    save.coins = Math.min(99999, (save.coins | 0) + earned);
    return { stars: stars, earned: earned, newBest: newBest, improvedStars: stars > prevStars };
  }
  function buyItem(save, kind, idx) {
    var list = kind === 'palette' ? PALETTES : LAUNCHERS, owned = kind === 'palette' ? save.palettes : save.launchers;
    if (!save || idx < 0 || idx >= list.length) return '';
    if (owned[idx]) { if (kind === 'palette') save.palette = idx; else save.launcher = idx; return 'wear'; }
    if (save.coins < list[idx].price) return '';
    save.coins -= list[idx].price; owned[idx] = 1;
    if (kind === 'palette') save.palette = idx; else save.launcher = idx;
    return 'bought';
  }

  var SCEngine = {
    W: W, H: H, DUEL_W: DUEL_W, GROUND_Y: G,
    MIN_ANGLE: MIN_ANGLE, MAX_ANGLE: MAX_ANGLE, DEFAULT_ANGLE: DEFAULT_ANGLE, DEFAULT_POWER: DEFAULT_POWER,
    WORLDS: WORLDS, PROJECTILES: PROJECTILES, MATERIALS: MATERIALS,
    LAUNCHERS: LAUNCHERS, PALETTES: PALETTES, DIFFS: DIFFS, STAGES: STAGES, LEVELS: STAGES,
    NEUTRAL: NEUTRAL, params: params,
    createStage: createStage, createLevel: createStage, createDuel: createDuel,
    activeSling: activeSling, aimDir: aimDir, goblinsLeft: goblinsLeft, botsLeft: goblinsLeft,
    setAim: setAim, swapProjectile: swapProjectile, trajectory: trajectory,
    fire: fire, activateSpecial: activateSpecial, step: step, calcStars: calcStars,
    freshSave: freshSave, loadSave: loadSave, isOpen: isOpen, totalStars: totalStars,
    applyResult: applyResult, buyItem: buyItem
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SCEngine;
  if (root) root.SCEngine = SCEngine;
})(typeof window !== 'undefined' ? window : null);
