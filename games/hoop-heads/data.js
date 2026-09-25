/* Hoop Heads - static data: balls, courts, cups, AI levels, save file. */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  HH.BALLS = [
    { id: 'classic', name: 'الكلاسيكية', price: 0 },
    { id: 'neon', name: 'نيون', price: 80 },
    { id: 'beach', name: 'كرة الشاطئ', price: 120 },
    { id: 'smile', name: 'المبتسمة', price: 160 },
    { id: 'melon', name: 'البطيخة', price: 200 },
    { id: 'rainbow', name: 'قوس قزح', price: 260 },
    { id: 'galaxy', name: 'المجرّة', price: 320 },
    { id: 'gold', name: 'الذهبية', price: 450 }
  ];

  HH.COURTS = [
    { id: 'street', name: 'ملعب الحي', price: 0 },
    { id: 'beach', name: 'الشاطئ', price: 150 },
    { id: 'roof', name: 'سطح الليل', price: 250 },
    { id: 'space', name: 'محطة الفضاء', price: 400 }
  ];

  // Tournament cups. lv = AI level of each of the 5 opponents; boss = last opponent.
  HH.CUPS = [
    { id: 'b', name: 'الكأس البرونزية', short: 'البرونزية', color: '#e08a4a', lv: [0, 0.35, 0.7, 1.0, 1.3], boss: 'melon', reward: 120, need: null },
    { id: 's', name: 'الكأس الفضية', short: 'الفضية', color: '#c9d3e6', lv: [1.0, 1.35, 1.7, 2.0, 2.3], boss: 'blaze', reward: 250, need: 'b' },
    { id: 'g', name: 'الكأس الذهبية', short: 'الذهبية', color: '#ffc93a', lv: [2.0, 2.3, 2.6, 2.9, 3.2], boss: 'legend', reward: 500, need: 's' }
  ];

  // AI tuning at integer levels 0..3; fractional levels interpolate.
  var AI = [
    { react: 0.55, aimErr: 2.2, spd: 0.68, block: 0.06, steal: 0.12, dunk: 0.15, jumpShot: 0.1, dunkSkill: 0.4 },
    { react: 0.32, aimErr: 1.25, spd: 0.84, block: 0.25, steal: 0.35, dunk: 0.32, jumpShot: 0.2, dunkSkill: 0.7 },
    { react: 0.2, aimErr: 0.8, spd: 0.95, block: 0.45, steal: 0.6, dunk: 0.45, jumpShot: 0.35, dunkSkill: 0.85 },
    { react: 0.12, aimErr: 0.5, spd: 1.02, block: 0.65, steal: 0.8, dunk: 0.55, jumpShot: 0.45, dunkSkill: 0.95 }
  ];
  HH.aiParams = function (lv) {
    lv = Math.max(0, Math.min(3.4, lv));
    var i = Math.min(2, Math.floor(lv)), t = Math.min(1.4, lv - i), a = AI[i], b = AI[i + 1], o = {};
    for (var k in a) o[k] = a[k] + (b[k] - a[k]) * t;
    o.aimErr = Math.max(0.3, o.aimErr);
    o.react = Math.max(0.07, o.react);
    return o;
  };
  HH.DIFF_NAMES = ['سهل', 'عادي', 'صعب'];

  /* ---------------------------------------------------------- save file */
  var store = Kit.store('hoop-heads');
  HH.store = store;
  var DEF = {
    coins: 0,
    cups: { b: false, s: false, g: false },
    stats: { games: 0, wins: 0, points: 0, dunks: 0, threes: 0, blocks: 0, steals: 0 },
    ownBalls: ['classic'], ownCourts: ['street'],
    ball: 'classic', court: 'street',
    p1: 'robo', p2: 'alien', diff: 0, len: 120,
    seen: [], tips: {}, streak: 0, bestStreak: 0
  };
  function load() {
    var s = store.get('save', null);
    if (!s || typeof s !== 'object') s = {};
    var o = JSON.parse(JSON.stringify(DEF));
    for (var k in o) {
      if (s[k] === undefined) continue;
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) { for (var j in s[k]) o[k][j] = s[k][j]; }
      else o[k] = s[k];
    }
    if (!Array.isArray(o.ownBalls)) o.ownBalls = ['classic'];
    if (!Array.isArray(o.ownCourts)) o.ownCourts = ['street'];
    if (!Array.isArray(o.seen)) o.seen = [];
    o.coins = Math.max(0, Math.floor(+o.coins || 0));
    return o;
  }
  HH.save = load();
  HH.persist = function () { store.set('save', HH.save); };

  HH.charById = function (id) {
    for (var i = 0; i < HH.CHARS.length; i++) if (HH.CHARS[i].id === id) return HH.CHARS[i];
    return HH.CHARS[0];
  };
  HH.isUnlocked = function (ch) {
    if (!ch.secret) return true;
    var u = ch.unlock, s = HH.save;
    if (u.type === 'cup') return !!s.cups[u.cup];
    if (u.type === 'dunks') return s.stats.dunks >= u.n;
    if (u.type === 'threes') return s.stats.threes >= u.n;
    return false;
  };
  HH.unlockProgress = function (ch) {
    var u = ch.unlock, s = HH.save;
    if (!u) return '';
    if (u.type === 'dunks') return Math.min(u.n, s.stats.dunks) + '/' + u.n;
    if (u.type === 'threes') return Math.min(u.n, s.stats.threes) + '/' + u.n;
    return '';
  };
  HH.findById = function (list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  };
})();
