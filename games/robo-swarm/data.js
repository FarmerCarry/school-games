/* هجوم الروبوتات — robots, waves, upgrades, heroes. Plain data, no Kit, no DOM. */
(function (RSD) {
  'use strict';

  RSD.W = 2400;
  RSD.H = 1400;
  RSD.CELL = 64;

  RSD.FOAM = 0;
  RSD.RING = 1;
  RSD.FRISBEE = 2;
  RSD.BALLOON = 3;
  RSD.DUCKS = 4;
  RSD.PAINT = 5;
  RSD.MAGNET = 6;
  RSD.SNEAK = 7;
  RSD.HEART = 8;
  RSD.SHIELD = 9;
  RSD.TORNADO = 10;
  RSD.CANNON = 11;
  RSD.UP_N = 10;

  // Level rows are Lv 1..5. cd seconds, dmg per hit, and the extra fields under each weapon.
  RSD.weapons = [
    { id: 0, name: 'قاذف الرغوة', desc: 'طلقات أسرع وأقوى وتخترق', color: '#ff8a24',
      cd: [0.42, 0.34, 0.28, 0.22, 0.17], dmg: [10, 14, 18, 24, 32], pierce: [1, 1, 2, 3, 4], speed: 740 },
    { id: 1, name: 'حلقة الفقاعات', desc: 'فقاعات تدور حولك وتفقع', color: '#3ec6ff',
      cd: [0.50, 0.46, 0.42, 0.38, 0.34], dmg: [6, 8, 11, 14, 18], n: [1, 2, 2, 3, 4], orbit: 86 },
    { id: 2, name: 'صحن طائر', desc: 'يطير ويعود ويقطع الصف', color: '#ffe14a',
      cd: [1.15, 0.95, 0.80, 0.66, 0.54], dmg: [12, 16, 22, 28, 36], pierce: [6, 6, 7, 8, 8], speed: 460 },
    { id: 3, name: 'بالون الماء', desc: 'ينفجر على أقرب تجمع', color: '#4d7dff',
      cd: [1.45, 1.20, 1.00, 0.82, 0.68], dmg: [18, 26, 36, 48, 62], rad: [78, 92, 108, 124, 142] },
    { id: 4, name: 'بطّ مطاطي', desc: 'بطّ يدور ويصطدم', color: '#ffd23a',
      cd: [0.50, 0.44, 0.40, 0.36, 0.32], dmg: [7, 9, 12, 15, 18], n: [1, 2, 3, 3, 4], orbit: 78 },
    { id: 5, name: 'درب الطلاء', desc: 'يترك بقعة تؤذي من يمشي عليها', color: '#ff4f93',
      cd: [0.34, 0.30, 0.28, 0.26, 0.22], dmg: [12, 18, 26, 36, 48], rad: [30, 36, 42, 48, 56] },
    { id: 6, name: 'مغناطيس', desc: 'يسحب البراغي من بعيد', color: '#c06bff',
      cd: [1, 1, 1, 1, 1], dmg: [0, 0, 0, 0, 0], rad: [96, 150, 210, 270, 340] },
    { id: 7, name: 'حذاء رياضي', desc: 'تجري أسرع', color: '#3ddc84',
      cd: [1, 1, 1, 1, 1], dmg: [0, 0, 0, 0, 0], bonus: [0.08, 0.16, 0.24, 0.34, 0.46] },
    { id: 8, name: 'قلب إضافي', desc: 'قلب جديد وتعبئة واحدة', color: '#ff5a7a',
      cd: [1, 1, 1, 1, 1], dmg: [0, 0, 0, 0, 0] },
    { id: 9, name: 'فقاعة الدرع', desc: 'تصطدم الفقاعة بدلًا عنك', color: '#9af0ff',
      cd: [1, 1, 1, 1, 1], dmg: [0, 0, 0, 0, 0] }
  ];

  RSD.evos = [
    { id: 10, name: 'إعصار البطّ', desc: 'البطّ يسحب الروبوتات ويدور بسرعة', needs: [4, 6], color: '#ffe14a' },
    { id: 11, name: 'مدفع الألوان', desc: 'الرغوة تنفجر طلاءً وتخترق أكثر', needs: [0, 5], color: '#ff4f93' }
  ];

  // type: 0 walker 1 hopper 2 roller 3 tank 4 splitter 5 shooter 6 mini 7 miniboss 8 king
  RSD.bots = [
    { name: 'ماشي', hp: 16, speed: 84, r: 18, xp: 1, bolts: 1 },
    { name: 'قفّاز', hp: 14, speed: 70, r: 16, xp: 1, bolts: 1 },
    { name: 'دوّار', hp: 12, speed: 196, r: 16, xp: 1, bolts: 1 },
    { name: 'دبّابة', hp: 54, speed: 56, r: 26, xp: 3, bolts: 3 },
    { name: 'منقسم', hp: 20, speed: 78, r: 18, xp: 2, bolts: 2 },
    { name: 'فقاعي', hp: 18, speed: 52, r: 18, xp: 2, bolts: 1 },
    { name: 'صغير', hp: 8, speed: 118, r: 11, xp: 1, bolts: 0 },
    { name: 'زعيم صغير', hp: 260, speed: 68, r: 36, xp: 8, bolts: 6 },
    { name: 'ملك الروبوتات', hp: 5200, speed: 60, r: 54, xp: 24, bolts: 12 }
  ];

  // Spawn pressure by schedule-seconds. interval is divided by the tier's spawn rate.
  RSD.spawn = {
    breaks: [0, 22, 45, 80, 120, 160, 200],
    interval: [1.22, 0.96, 0.72, 0.52, 0.38, 0.28, 0.20],
    weights: [
      [8, 0, 0, 0, 0, 0],
      [6, 2, 0, 0, 0, 0],
      [6, 3, 1, 0, 0, 0],
      [4, 3, 2, 1, 2, 0],
      [3, 2, 3, 2, 2, 2],
      [3, 2, 2, 3, 2, 3],
      [2, 2, 2, 3, 3, 3]
    ]
  };

  RSD.maps = [
    { id: 1, name: 'صندوق الألعاب', line: 'سجادة وقطع تركيب', hp: 1, speed: 1, add: [0, 0, 0, 0, 0, 0], floor: '#e7b45a', ink: '#c4843a' },
    { id: 2, name: 'طاولة المطبخ', line: 'بسكويت عملاق وفتات', hp: 1.06, speed: 1.05, add: [0, 1, 1, 0, 0, 0], floor: '#f3d7b0', ink: '#e0b48a' },
    { id: 3, name: 'قاعدة القمر', line: 'فوهات وغبار أزرق', hp: 1.1, speed: 1, add: [0, 0, 0, 1, 0, 1], floor: '#9aa4c4', ink: '#6d789c' }
  ];

  RSD.heroes = [
    { name: 'سامي', line: 'قاذف رغوة', hp: 5, speed: 258, kind: 0, start: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], need: '' },
    { name: 'برق', line: 'حذاء من البداية', hp: 4, speed: 268, kind: 0, start: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0], need: 'pops' },
    { name: 'بطوط', line: 'يبدأ ومعه بطّة', hp: 5, speed: 242, kind: 0, start: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0], need: 'nodash' },
    { name: 'ماجد', line: 'مغناطيس قوي', hp: 5, speed: 238, kind: 0, start: [1, 0, 0, 0, 0, 0, 2, 0, 0, 0], need: 'bolts' },
    { name: 'درع', line: 'قلب وفقّاعة', hp: 6, speed: 228, kind: 0, start: [1, 0, 0, 0, 0, 0, 0, 0, 1, 1], need: 'map2' },
    { name: 'روبو', line: 'حلقة فقاعات', hp: 5, speed: 244, kind: 1, start: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0], need: 'quick' }
  ];

  RSD.meta = [
    { name: 'قلب إضافي', desc: '+1 قلب', cost: [40, 80, 140, 210, 300] },
    { name: 'حذاء خفيف', desc: '+5% سرعة', cost: [40, 80, 140, 210, 300] },
    { name: 'إعادة الاختيار', desc: '+1 تبديل', cost: [30, 70, 120, 180, 260] }
  ];

  RSD.trophies = [
    { name: 'أول فقعة', line: 'افقع روبوتًا' },
    { name: 'مئة فقعة', line: 'افقع 100 روبوت' },
    { name: 'ألف فقعة', line: 'افقع 1000 روبوت' },
    { name: 'بطل', line: 'اهزم ملك الروبوتات' },
    { name: 'بلا اندفاع', line: 'اربح دون اندفاع' },
    { name: 'فسحة قصيرة', line: 'اربح جولة سريعة' },
    { name: 'كل الخرائط', line: 'اهزم الملك في الخرائط الثلاث' },
    { name: 'جامع براغي', line: 'اجمع 500 برغيًا في جولة' },
    { name: 'صديق وفي', line: 'أيقظ زميلك الدائخ' },
    { name: 'الصيّاد', line: 'أصب الملك' }
  ];

  // A mid recess build: foam Lv 4, bubble ring Lv 3, water balloon Lv 3, ducks Lv 3.
  // Single-target expected hits per second. Ducks and the ring sit on a large boss, so
  // their contact uptime is counted at 0.85. Pierce does not add boss damage.
  RSD.midDps = function () {
    const W = RSD.weapons;
    const foam = W[0].dmg[3] / W[0].cd[3];
    const ring = W[1].n[2] * W[1].dmg[2] / W[1].cd[2];
    const balloon = W[3].dmg[2] / W[3].cd[2];
    const ducks = W[4].n[2] * W[4].dmg[2] / W[4].cd[2] * 0.85;
    return foam + ring + balloon + ducks;
  };
})(globalThis.RSD = globalThis.RSD || {});
