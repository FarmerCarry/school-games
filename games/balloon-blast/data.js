/* Balloon Blast — pure arena, stage, power-up, difficulty, and hero skin data. */
(function () {
  'use strict';

  var BBData = {
    COLS: 13, ROWS: 9, TILE: 64,
    EMPTY: 0, PILLAR: 1, CRATE: 2, JELLY: 3, PIPE: 4,
    SPAWNS: [[1, 1], [11, 1], [1, 7], [11, 7]],

    DIFFICULTIES: {
      easy: { id: 'easy', name: 'سهل', desc: 'درع فقاعة مجاني وحماية من بالونك', fuse: 2.8, startShield: 1, selfMercy: true, botTier: 1, crateRate: 0.56 },
      normal: { id: 'normal', name: 'متوسط', desc: 'معركة متوازنة وسريعة الإيقاع', fuse: 2.3, startShield: 0, selfMercy: false, botTier: 3, crateRate: 0.65 },
      hero: { id: 'hero', name: 'بطل', desc: 'خصوم محترفون يركلون البالونات ويحاصرونك', fuse: 1.95, startShield: 0, selfMercy: false, botTier: 5, crateRate: 0.72 }
    },

    POWERUPS: [
      { id: 'balloon', icon: '🎈', name: 'بالون إضافي', weight: 26, max: 6 },
      { id: 'range', icon: '💦', name: 'نافورة عملاقة', weight: 24, max: 6 },
      { id: 'speed', icon: '👟', name: 'حذاء التيربو', weight: 18, max: 4 },
      { id: 'kick', icon: '🥊', name: 'قفاز الركل', weight: 12, max: 1 },
      { id: 'shield', icon: '🫧', name: 'درع الفقاعة', weight: 11, max: 1 },
      { id: 'turtle', icon: '🐢', name: 'سلحفاة نفاثة', weight: 9, max: 1 }
    ],

    SKINS: [
      { id: 'ninja', name: 'نينجا الماء', desc: 'عصابة المحيط ورذاذ أزرق نفاث', cost: 0, suit: '#1d8cf8', suitDk: '#0f5cad', visor: '#d8f3ff', band: '#ff3b5c', splash: '#22b8ff', splashHi: '#e6f9ff' },
      { id: 'shark', name: 'قرش الموج', desc: 'خوذة الزعنفة وتيار فيروزي', cost: 25, suit: '#00a896', suitDk: '#026c61', visor: '#d9fff8', band: '#00f5d4', splash: '#00d2b8', splashHi: '#e3fffb' },
      { id: 'neon', name: 'رائد النيون', desc: 'قناع السايبر ورشاش أرجواني مضيء', cost: 50, suit: '#8b3dff', suitDk: '#5218b5', visor: '#b8fff9', band: '#38f987', splash: '#d946ef', splashHi: '#fdf4ff' },
      { id: 'gold', name: 'بطل الذهب', desc: 'تاج الأبطال ونوافير ذهبية لامعة', cost: 80, suit: '#f59e0b', suitDk: '#b45309', visor: '#fffbeb', band: '#ef4444', splash: '#fbbf24', splashHi: '#fffef0' }
    ],

    ARENAS: {
      sand: { id: 'sand', name: 'قلعة الرمل', sky: ['#56ccf2', '#fef08a'], rim: '#9a5b25', rimDk: '#693b14', floor: ['#fde68a', '#fcd34d'], pillar: '#fb7185', pillarHi: '#ffe4e6', pillarDk: '#be123c', crate: '#d97706', crateDk: '#92400e', crateHi: '#fde68a', pipe: '#06b6d4', pipeDk: '#0e7490' },
      soda: { id: 'soda', name: 'مصنع الصودا', sky: ['#38bdf8', '#c084fc'], rim: '#1e3a8a', rimDk: '#0f172a', floor: ['#e0f2fe', '#bae6fd'], pillar: '#64748b', pillarHi: '#f1f5f9', pillarDk: '#334155', crate: '#f97316', crateDk: '#c2410c', crateHi: '#ffedd5', pipe: '#22c55e', pipeDk: '#15803d' },
      soap: { id: 'soap', name: 'بركان الصابون', sky: ['#a855f7', '#fb7185'], rim: '#4c1d95', rimDk: '#2e1065', floor: ['#f3e8ff', '#e9d5ff'], pillar: '#7e22ce', pillarHi: '#f5d0fe', pillarDk: '#4c1d95', crate: '#ec4899', crateDk: '#9d174d', crateHi: '#fce7f3', pipe: '#eab308', pipeDk: '#a16207' }
    },

    WORLDS: [
      { id: 1, key: 'sand', name: 'قلعة الرمل', bossName: 'السلطعون المدرّع' },
      { id: 2, key: 'soda', name: 'مصنع الصودا', bossName: 'أخطبوط المدافع' },
      { id: 3, key: 'soap', name: 'بركان الصابون', bossName: 'إمبراطور الفقاعات' }
    ],

    STAGES: [
      { id: 'w1-s1', roundKey: 'adv-w1-s1', world: 1, stage: 1, arena: 'sand', name: 'ساحل المرجان', par: 45, boss: null,
        grid: ['#############', '#1...CP..C.m#', '#2#C#.#C#.#.#', '#..C.....C..#', '#.#.#C.C#.#.#', '#..C..m..C..#', '#.#.#C#.#C#.#', '#m.C..P..C..#', '#############'] },
      { id: 'w1-s2', roundKey: 'adv-w1-s2', world: 1, stage: 2, arena: 'sand', name: 'مضيق القلعة', par: 50, boss: null,
        grid: ['#############', '#1..C...C..m#', '#2#.#C#C#.#.#', '#..C..m..C..#', '#P.#C...C#.P#', '#..C..s..C..#', '#.#.#C#C#.#.#', '#m..C...C..m#', '#############'] },
      { id: 'w1-s3', roundKey: 'adv-w1-s3', world: 1, stage: 3, arena: 'sand', name: 'السلطعون المدرّع', par: 65,
        boss: { kind: 'crab', name: 'السلطعون المدرّع', hp: 5, speed: 2.3, atkCd: 3.1 },
        grid: ['#############', '#1..C.P.C..m#', '#2#.#...#.#.#', '#..C.....C..#', '#.#...B...#.#', '#..C.....C..#', '#.#.#...#.#.#', '#m..C.P.C...#', '#############'] },
      { id: 'w2-s1', roundKey: 'adv-w2-s1', world: 2, stage: 1, arena: 'soda', name: 'قاعة الفوران', par: 50, boss: null,
        grid: ['#############', '#1..C.P.C..f#', '#2#C#.#.#C#.#', '#..C..f..C..#', '#.#.#...#.#.#', '#..C..m..C..#', '#.#C#.#.#C#.#', '#f..C.P.C..m#', '#############'] },
      { id: 'w2-s2', roundKey: 'adv-w2-s2', world: 2, stage: 2, arena: 'soda', name: 'أنابيب التيربو', par: 55, boss: null,
        grid: ['#############', '#1..C...C..f#', '#2#.#C#C#.#.#', '#C...f.f...C#', '#P#C.....C#P#', '#C....s....C#', '#.#.#C#C#.#.#', '#f..C...C..f#', '#############'] },
      { id: 'w2-s3', roundKey: 'adv-w2-s3', world: 2, stage: 3, arena: 'soda', name: 'أخطبوط المدافع', par: 70,
        boss: { kind: 'octo', name: 'أخطبوط المدافع', hp: 6, speed: 2.6, atkCd: 2.6 },
        grid: ['#############', '#1..C...C..f#', '#2#.#.C.#.#.#', '#..C.....C..#', '#P....B....P#', '#..C.....C..#', '#.#.#.C.#.#.#', '#f..C...C...#', '#############'] },
      { id: 'w3-s1', roundKey: 'adv-w3-s1', world: 3, stage: 1, arena: 'soap', name: 'حمم الرغوة', par: 55, boss: null,
        grid: ['#############', '#1..C.P.C..s#', '#2#C#.#.#C#.#', '#..C.s.f.C..#', '#.#.#C.C#.#.#', '#..C..s..C..#', '#.#C#.#.#C#.#', '#s..C.P.C..f#', '#############'] },
      { id: 'w3-s2', roundKey: 'adv-w3-s2', world: 3, stage: 2, arena: 'soap', name: 'متاهة النوافير', par: 60, boss: null,
        grid: ['#############', '#1..C...C..s#', '#2#.#C#C#.#.#', '#C..f...f..C#', '#P#C..s..C#P#', '#C..s...m..C#', '#.#.#C#C#.#.#', '#f..C...C..s#', '#############'] },
      { id: 'w3-s3', roundKey: 'adv-w3-s3', world: 3, stage: 3, arena: 'soap', name: 'إمبراطور الفقاعات', par: 75,
        boss: { kind: 'king', name: 'إمبراطور الفقاعات', hp: 7, speed: 2.9, atkCd: 2.2 },
        grid: ['#############', '#1..C.P.C..s#', '#2#.#...#.#.#', '#..C.....C..#', '#.#...B...#.#', '#..C.....C..#', '#.#.#...#.#.#', '#f..C.P.C..s#', '#############'] }
    ],

    skinById: function (id) {
      for (var i = 0; i < BBData.SKINS.length; i++) if (BBData.SKINS[i].id === id) return BBData.SKINS[i];
      return BBData.SKINS[0];
    },
    arenaById: function (id) { return BBData.ARENAS[id] || BBData.ARENAS.sand; },
    diffById: function (id) { return BBData.DIFFICULTIES[id] || BBData.DIFFICULTIES.normal; },
    stageById: function (id) {
      for (var i = 0; i < BBData.STAGES.length; i++) if (BBData.STAGES[i].id === id) return BBData.STAGES[i];
      return BBData.STAGES[0];
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BBData;
  if (typeof window !== 'undefined') window.BBData = BBData;
  globalThis.BBData = BBData;
})();
