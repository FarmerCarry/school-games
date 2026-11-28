/* هجوم الروبوتات — Pure game data (arenas, difficulties, pods, enemies, skins). */
(function () {
  'use strict';

  var RSData = {
    W: 1920, H: 1152, PAD: 56, VIEW_W: 1280, VIEW_H: 720, ROUND_SEC: 90, BOSS_AT: 70,

    difficulties: [
      { id: 'easy', name: 'سهل', badge: '6 قلوب · مغناطيس واسع', hearts: 6, botSpeedMul: 0.78, botHpMul: 0.76, spawnMul: 0.78, magnetBase: 265, dashCd: 1.30, bossHpMul: 0.74, bossPhases: 1 },
      { id: 'normal', name: 'متوسط', badge: '4 قلوب · معركة متوازنة', hearts: 4, botSpeedMul: 1.00, botHpMul: 1.00, spawnMul: 1.00, magnetBase: 180, dashCd: 1.70, bossHpMul: 1.00, bossPhases: 1 },
      { id: 'hero', name: 'بطل', badge: '3 قلوب · زعيم مزدوج', hearts: 3, botSpeedMul: 1.18, botHpMul: 1.20, spawnMul: 1.24, magnetBase: 150, dashCd: 1.95, bossHpMul: 1.28, bossPhases: 2 }
    ],

    arenas: [
      {
        id: 'spark', index: 0, name: 'مصنع الشرار', desc: 'أحزمة تسريع وملفات صعق كهربائية',
        bg: '#1c2b48', plate: '#25395e', grid: '#314c7a', border: '#28e7ff', accent: '#ffe14a', icon: '⚡',
        boosts: [{ x: 520, y: 350, w: 270, h: 72, vx: 230, vy: 0 }, { x: 1130, y: 730, w: 270, h: 72, vx: -230, vy: 0 }],
        coils: [{ x: 440, y: 790, r: 28 }, { x: 1490, y: 380, r: 28 }, { x: 440, y: 500, r: 28 }, { x: 1490, y: 760, r: 28 }],
        vents: [], warps: [], bumpers: []
      },
      {
        id: 'magma', index: 1, name: 'حفرة الحمم', desc: 'ينابيع لهب تحرق الروبوتات القريبة',
        bg: '#341a24', plate: '#472332', grid: '#5e3042', border: '#ff7b3a', accent: '#ffd23f', icon: '🔥',
        boosts: [], coils: [],
        vents: [{ x: 480, y: 360, r: 64 }, { x: 1440, y: 360, r: 64 }, { x: 480, y: 820, r: 64 }, { x: 1440, y: 820, r: 64 }, { x: 960, y: 270, r: 64 }, { x: 960, y: 890, r: 64 }],
        warps: [], bumpers: []
      },
      {
        id: 'orbit', index: 2, name: 'محطة الفضاء', desc: 'منصات انتقال فوري وحواجز ليزر مرتدة',
        bg: '#201b4a', plate: '#2b2563', grid: '#3e3685', border: '#ff52b8', accent: '#3df5ff', icon: '✦',
        boosts: [], coils: [], vents: [],
        warps: [{ x: 350, y: 576, r: 44, to: 1 }, { x: 1570, y: 576, r: 44, to: 0 }],
        bumpers: [{ x: 640, y: 340, r: 34 }, { x: 1280, y: 340, r: 34 }, { x: 640, y: 830, r: 34 }, { x: 1280, y: 830, r: 34 }]
      }
    ],

    pods: [
      { kind: 0, id: 'plasma', name: 'مدفع البلازما', popup: 'مدفع البلازما!', evoPopup: 'بلازما خارقة!', color: '#28e7ff', cd: [0.23, 0.20, 0.18, 0.16, 0.14], dmg: [18, 21, 25, 29, 34], shots: [1, 2, 3, 3, 4], pierce: [1, 1, 2, 2, 3] },
      { kind: 1, id: 'saws', name: 'درع المناشير', popup: 'درع المناشير!', evoPopup: 'مناشير عملاقة!', color: '#ffe14a', count: [2, 3, 4, 5, 6], dmg: [19, 24, 30, 37, 45], orbit: 84 },
      { kind: 2, id: 'missiles', name: 'صواريخ ذكية', popup: 'صواريخ ذكية!', evoPopup: 'وابل الصواريخ!', color: '#ff6b35', cd: [1.32, 1.12, 0.95, 0.82, 0.70], dmg: [36, 45, 56, 68, 82], count: [1, 2, 2, 3, 4], blast: 94 },
      { kind: 3, id: 'lightning', name: 'برق عملاق', popup: 'برق عملاق!', evoPopup: 'عاصفة البرق!', color: '#c266ff', cd: [1.42, 1.20, 1.02, 0.88, 0.74], dmg: [30, 38, 48, 60, 74], chains: [2, 3, 4, 5, 6], range: 440 },
      { kind: 4, id: 'magnet', name: 'مغناطيس خارق', popup: 'مغناطيس خارق!', evoPopup: 'جاذبية قصوى!', color: '#3ddc84', pullBonus: [95, 190, 290, 400, 520], speedBonus: [0.08, 0.15, 0.22, 0.28, 0.35] }
    ],

    enemies: [
      { kind: 0, id: 'spider', name: 'عنكبوت آلي', hp: 22, speed: 152, r: 20, xp: 2, bolts: 1, score: 15, shield: 0 },
      { kind: 1, id: 'sparkbug', name: 'شرارة آلية', hp: 13, speed: 196, r: 15, xp: 1, bolts: 1, score: 10, shield: 0 },
      { kind: 2, id: 'ram', name: 'كبش نفاث', hp: 46, speed: 122, chargeSpeed: 440, r: 24, xp: 4, bolts: 2, score: 30, shield: 0 },
      { kind: 3, id: 'drone', name: 'طائرة ليزر', hp: 36, speed: 126, r: 22, xp: 4, bolts: 2, score: 30, shield: 0 },
      { kind: 4, id: 'crusher', name: 'محطّم مدرع', hp: 92, speed: 98, r: 30, xp: 6, bolts: 4, score: 50, shield: 44 },
      { kind: 5, id: 'boss', name: 'الزعيم الآلي', hp: 1550, speed: 116, r: 58, xp: 30, bolts: 30, score: 500, shield: 0 }
    ],

    waves: [
      { id: 1, start: 0, end: 24, title: 'الكشّافة قادمون!', interval: 0.52, weights: [7, 4, 0, 0, 0] },
      { id: 2, start: 24, end: 48, title: 'الكباش والطائرات!', interval: 0.48, weights: [4, 2, 3, 3, 0] },
      { id: 3, start: 48, end: 70, title: 'المحطّمات المدرعة!', interval: 0.42, weights: [3, 2, 3, 3, 3] }
    ],

    skins: [
      { id: 'blue', index: 0, name: 'المدرع الأزرق', cost: 0, body: '#2596ff', dark: '#1254a1', trim: '#70e4ff', visor: '#ffe14a' },
      { id: 'dragon', index: 1, name: 'التنين الناري', cost: 50, body: '#ff4d2e', dark: '#9e1f11', trim: '#ffb627', visor: '#fff275' },
      { id: 'neon', index: 2, name: 'شبح النيون', cost: 110, body: '#8c3bff', dark: '#4a1896', trim: '#2cf5ff', visor: '#ff47b6' },
      { id: 'gold', index: 3, name: 'العملاق الذهبي', cost: 180, body: '#f5b700', dark: '#996900', trim: '#fff099', visor: '#28f0ff' },
      { id: 'shark', index: 4, name: 'قرش الفضاء', cost: 260, body: '#1ec8a5', dark: '#0d6e5b', trim: '#a8fff0', visor: '#ff526f' }
    ]
  };

  globalThis.RSData = RSData;
  if (typeof window !== 'undefined') window.RSData = RSData;
  if (typeof module !== 'undefined' && module.exports) module.exports = RSData;
})();
