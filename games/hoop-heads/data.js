/* Hoop Heads: Turbo Super-Dunk Brawl — fighters, arenas, cups, power-ups & save data. */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};
  var noop = function () {};
  if (!HH.sfx) {
    HH.sfx = {
      click: noop, move: noop, jump: noop, land: noop, bounce: noop,
      shoot: noop, swish: noop, dunk: noop, superDunk: noop, clank: noop,
      board: noop, steal: noop, block: noop, dash: noop, power: noop,
      ice: noop, whistle: noop, buzzer: noop, tick: noop, win: noop,
      lose: noop, coin: noop, buy: noop, error: noop, fire: noop
    };
  }

  HH.CHARS = [
    {
      id: 'robo', name: 'آلي السلة', spd: 3, jmp: 3, sht: 5, headR: 45,
      skin: '#b8c8de', skinDark: '#788ca8', jersey: '#1f6feb', trim: '#00f2fe',
      shoe: '#00d4ff', band: '#ff477e', num: '07',
      desc: 'تصويب ليزري فائق الدقة!'
    },
    {
      id: 'shark', name: 'قرش الملعب', spd: 4, jmp: 3, sht: 3, headR: 46,
      skin: '#3fa7c4', skinDark: '#236c88', jersey: '#ff542e', trim: '#ffd23f',
      shoe: '#ff9f1c', band: '#ffd23f', num: '99',
      desc: 'اندفاع خطف سريع وفكّ مفترس!'
    },
    {
      id: 'ninja', name: 'نينجا اللهب', spd: 5, jmp: 4, sht: 3, headR: 44,
      skin: '#f6c89f', skinDark: '#d89b6c', jersey: '#231942', trim: '#ff3d00',
      shoe: '#ff3d00', band: '#ff3d00', num: '11',
      desc: 'برق الملعب وعصابة اللهب!'
    },
    {
      id: 'raptor', name: 'رابتور القفز', spd: 4, jmp: 5, sht: 3, headR: 45,
      skin: '#4ad66d', skinDark: '#259644', jersey: '#7b2cbf', trim: '#80ffdb',
      shoe: '#ffd23f', band: '#ff6d00', num: '23',
      desc: 'قفزات صاروخية ودانك مزلزل!'
    },
    {
      id: 'astro', name: 'رائد الفضاء', spd: 3, jmp: 5, sht: 4, headR: 46,
      skin: '#e8effa', skinDark: '#9fb3d1', jersey: '#3a86ff', trim: '#ffbe0b',
      shoe: '#ff006e', band: '#00f5d4', num: '01',
      desc: 'تحليق فضائي وثلاثيات عالية!'
    },
    {
      id: 'titan', name: 'العملاق الذهبي', spd: 4, jmp: 4, sht: 5, headR: 47,
      skin: '#ffd166', skinDark: '#e09119', jersey: '#b5179e', trim: '#ffd23f',
      shoe: '#ffe66d', band: '#ff2a6d', num: '77',
      desc: 'بطل الساحة وملك النيزك!'
    }
  ];

  // All 4 arenas are open immediately!
  HH.COURTS = [
    {
      id: 'recess', name: 'ملعب الفسحة', theme: 'day', price: 0,
      sky: ['#4ea8ff', '#9be2ff', '#ffe9a8'],
      floorA: '#e8984c', floorB: '#cf7930', line: '#fff7e6', keyCol: '#2b7fff', rim: '#ff5420'
    },
    {
      id: 'neon', name: 'سطح النيون', theme: 'neon', price: 0,
      sky: ['#100726', '#2a1057', '#6a1b7a'],
      floorA: '#1d1842', floorB: '#151133', line: '#00f5d4', keyCol: '#ff2a85', rim: '#ffbe0b'
    },
    {
      id: 'volcano', name: 'بركان السلة', theme: 'night', price: 0,
      sky: ['#26080c', '#6e1414', '#e85d04'],
      floorA: '#36262a', floorB: '#281b1e', line: '#ffb703', keyCol: '#d00000', rim: '#ff7b00'
    },
    {
      id: 'space', name: 'محطة الفضاء', theme: 'night', price: 0,
      sky: ['#050816', '#0e1b3d', '#1d3566'],
      floorA: '#23314d', floorB: '#1a253b', line: '#56cfe1', keyCol: '#5e60ce', rim: '#ff4d6d'
    }
  ];

  HH.BALLS = [
    { id: 'classic', name: 'الكلاسيكية', price: 0, c1: '#ff9233', c2: '#d94e14', seam: '#2b1206' },
    { id: 'neon', name: 'كرة النيون', price: 45, c1: '#00f5d4', c2: '#0096c7', seam: '#1b1640' },
    { id: 'shark', name: 'كرة القرش', price: 75, c1: '#48bfe3', c2: '#1d4ed8', seam: '#ffffff' },
    { id: 'lava', name: 'كرة البركان', price: 110, c1: '#ffd23f', c2: '#e63900', seam: '#2b0900' },
    { id: 'galaxy', name: 'كرة المجرّة', price: 150, c1: '#b5179e', c2: '#3a0ca3', seam: '#80ffdb' },
    { id: 'gold', name: 'الكرة الذهبية', price: 220, c1: '#fff38a', c2: '#d98a00', seam: '#5c3800' }
  ];

  HH.TRAILS = [
    { id: 'flame', name: 'شهاب اللهب', price: 0, colors: ['#ff5400', '#ffbd00', '#fff3b0'] },
    { id: 'cyber', name: 'برق النيون', price: 60, colors: ['#00f5d4', '#00bbf9', '#f15bb5'] },
    { id: 'frost', name: 'عاصفة الثلج', price: 95, colors: ['#38bdf8', '#bae6fd', '#ffffff'] },
    { id: 'royal', name: 'تاج الذهب', price: 160, colors: ['#ffd23f', '#ff70a6', '#ffffff'] }
  ];

  // All 3 tournament cups unlocked immediately!
  HH.CUPS = [
    { id: 'b', name: 'كأس البرونز', short: 'البرونز', color: '#e08a4a', lv: [0.05, 0.3, 0.55, 0.85, 1.15], boss: 'shark', reward: 120, need: null, court: 'recess' },
    { id: 's', name: 'كأس الفضة', short: 'الفضة', color: '#cbd5e1', lv: [0.6, 0.85, 1.15, 1.4, 1.7], boss: 'raptor', reward: 220, need: null, court: 'neon' },
    { id: 'g', name: 'كأس الذهب', short: 'الذهب', color: '#ffd23f', lv: [1.15, 1.45, 1.75, 2.05, 2.4], boss: 'titan', reward: 360, need: null, court: 'volcano' }
  ];

  HH.POWERS = [
    { id: 'mega', name: 'كرة عملاقة! +1', icon: '🏀', color: '#ff7b00' },
    { id: 'ice', name: 'تجميد السلة!', icon: '❄️', color: '#38bdf8' },
    { id: 'rocket', name: 'حذاء الصاروخ!', icon: '🚀', color: '#fb7185' },
    { id: 'magnet', name: 'مغناطيس السلة!', icon: '🧲', color: '#c084fc' }
  ];

  HH.DIFF_NAMES = ['سهل', 'متوسط', 'بطل'];

  /* --------------------------------------------------------------- storage */
  var store = Kit.store('hoop-heads');
  HH.store = store;

  var DEF = {
    coins: 0,
    cups: { b: false, s: false, g: false },
    stats: { games: 0, wins: 0, points: 0, dunks: 0, threes: 0, blocks: 0, steals: 0 },
    ownBalls: ['classic'],
    ownTrails: ['flame'],
    ownCourts: ['recess', 'neon', 'volcano', 'space'],
    ball: 'classic',
    trail: 'flame',
    court: 'recess',
    p1: 'robo',
    p2: 'shark',
    diff: 0,
    len: 60,
    seen: [],
    tips: {},
    streak: 0,
    bestStreak: 0
  };

  function validId(list, id, fallback) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return id;
    return fallback;
  }

  HH.loadSave = function (raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var o = JSON.parse(JSON.stringify(DEF));
    for (var k in o) {
      if (s[k] === undefined) continue;
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) {
        if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
          for (var j in o[k]) if (s[k][j] !== undefined) o[k][j] = s[k][j];
        }
      } else o[k] = s[k];
    }
    if (!Array.isArray(o.ownBalls) || o.ownBalls.indexOf('classic') < 0) o.ownBalls = ['classic'];
    if (!Array.isArray(o.ownTrails) || o.ownTrails.indexOf('flame') < 0) o.ownTrails = ['flame'];
    o.ownCourts = ['recess', 'neon', 'volcano', 'space'];
    o.coins = Math.max(0, Math.floor(+o.coins || 0));
    o.diff = o.diff === 1 || o.diff === 2 ? o.diff : 0;
    o.len = 60;
    o.p1 = validId(HH.CHARS, o.p1, 'robo');
    o.p2 = validId(HH.CHARS, o.p2, 'shark');
    o.court = validId(HH.COURTS, o.court, 'recess');
    o.ball = validId(HH.BALLS, o.ball, 'classic');
    o.trail = validId(HH.TRAILS, o.trail, 'flame');
    o.streak = Math.max(0, Math.floor(+o.streak || 0));
    o.bestStreak = Math.max(o.streak, Math.floor(+o.bestStreak || 0));
    return o;
  };

  HH.save = HH.loadSave(store.get('save', null));

  var saveUI = null;
  HH.persist = function () {
    var ok = store.set('save', HH.save);
    if (!ok && !saveUI) saveUI = Kit.saveStatus({ retry: HH.persist });
    if (saveUI) { if (ok) saveUI.saved(); else saveUI.failed(); }
    return ok;
  };

  HH.charById = function (id) {
    for (var i = 0; i < HH.CHARS.length; i++) if (HH.CHARS[i].id === id) return HH.CHARS[i];
    return HH.CHARS[0];
  };
  HH.findById = function (list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  };
  HH.isUnlocked = function () { return true; };
})();
