/* بحيرة الحظ — simulation only. No drawing, no DOM, and no play-stat reports. */
(function (root) {
  'use strict';

  var LL = root.LuckyLake = root.LuckyLake || {};
  var FISH = LL.FISH = [];
  var RARE_PRICE = [12, 28, 70, 160, 420];
  var RARE_SPAN = [[0.4, 1.6], [0.9, 3.2], [1.6, 5.5], [3.2, 12], [8, 36]];

  function addFish(spot, rare, name, beh, body, belly, pat, tail, col, beh2) {
    var span = RARE_SPAN[rare];
    FISH.push({
      id: FISH.length, spot: spot, rare: rare, name: name, beh: beh, beh2: beh2 || '',
      price: RARE_PRICE[rare], body: body, belly: belly, pat: pat, tail: tail, col: col,
      min: span[0], max: span[1], junk: 0, boss: 0
    });
  }

  // 7 spots × 7 fish. Rarity buckets per spot: 2C, 2U, 1R, 1E, 1L.
  // Spawn weights are 3 / 2 / 1 / 0.6 / 0.4 (see LL.odds).
  addFish(0, 0, 'بلطي', 'lazy', '#f0a030', '#ffe2a4', 1, 0, 'gold');
  addFish(0, 0, 'شبّوط', 'float', '#d8b056', '#fff0c4', 0, 2, 'gold');
  addFish(0, 1, 'سلّور', 'lazy', '#6d8a4e', '#dfe8b0', 2, 2, 'green');
  addFish(0, 1, 'فرخ', 'float', '#7ec85a', '#e9ffc4', 1, 0, 'green');
  addFish(0, 2, 'مرقط', 'lazy', '#3e9a4a', '#d8f5a8', 1, 1, 'green');
  addFish(0, 3, 'ملك البركة', 'float', '#2f8f5b', '#f8e38a', 0, 1, 'green');
  addFish(0, 4, 'قمر البركة', 'lazy', '#7d6adf', '#f4e6ff', 2, 0, 'purple', 'float');

  addFish(1, 0, 'سردين', 'dart', '#4aa4e0', '#e7f6ff', 0, 1, 'blue');
  addFish(1, 0, 'بوري', 'lazy', '#8eb4c9', '#f4fbff', 2, 0, 'blue');
  addFish(1, 1, 'قاروص', 'dart', '#3d7eb8', '#d5ecff', 0, 1, 'blue');
  addFish(1, 1, 'كنعد', 'float', '#5c8fbf', '#e7f3ff', 1, 2, 'blue');
  addFish(1, 2, 'تونة', 'dart', '#2a679e', '#cfe6ff', 0, 1, 'blue');
  addFish(1, 3, 'سمكة الشمس', 'dart', '#f2b43a', '#fff1c2', 2, 0, 'gold');
  addFish(1, 4, 'حوت الرصيف', 'dart', '#3d6d99', '#d9ecff', 0, 2, 'blue', 'float');

  addFish(2, 0, 'دامسيل', 'float', '#3ec6c0', '#e7fffb', 1, 0, 'blue');
  addFish(2, 0, 'سمكة المهرج', 'dart', '#ff7a3c', '#fff0dc', 0, 2, 'red');
  addFish(2, 1, 'سمكة ملاك', 'float', '#ffd24a', '#fff8d6', 2, 0, 'gold');
  addFish(2, 1, 'سمكة ببغاء', 'dart', '#3ecf6e', '#e9ffe4', 1, 1, 'green');
  addFish(2, 2, 'سمكة الشعاب', 'float', '#ff5d8f', '#ffe3ee', 1, 0, 'red');
  addFish(2, 3, 'تنين المرجان', 'dart', '#ff4b5c', '#ffe1b0', 0, 1, 'red');
  addFish(2, 4, 'لؤلؤة البحر', 'float', '#f4f7ff', '#dff4ff', 2, 2, 'blue', 'dart');

  addFish(3, 0, 'قدّ', 'lazy', '#9fd0ea', '#f5fbff', 0, 1, 'blue');
  addFish(3, 0, 'رنجة', 'float', '#7eb6d6', '#eef8ff', 1, 0, 'blue');
  addFish(3, 1, 'سلمون', 'sink', '#e07a62', '#ffe0d4', 2, 0, 'red');
  addFish(3, 1, 'سمكة شار', 'sink', '#d45d74', '#ffd8e2', 1, 1, 'red');
  addFish(3, 2, 'سمكة الجليد', 'sink', '#d7f2ff', '#ffffff', 2, 2, 'blue');
  addFish(3, 3, 'نجمة الثلج', 'sink', '#8fd4ff', '#ffffff', 0, 0, 'blue');
  addFish(3, 4, 'حوت الجليد', 'sink', '#b9e4ff', '#f4fbff', 1, 1, 'blue', 'dart');

  addFish(4, 0, 'سمكة الطين', 'sink', '#6d7a45', '#e4e2b0', 2, 2, 'green');
  addFish(4, 0, 'سمكة الضفدع', 'lazy', '#7ea84a', '#e7f5b8', 1, 0, 'green');
  addFish(4, 1, 'بايك', 'dart', '#3f6b46', '#d5e6b4', 0, 1, 'green');
  addFish(4, 1, 'ثعبان الماء', 'sink', '#355e4a', '#cfe0c4', 0, 2, 'dark');
  addFish(4, 2, 'سمكة الضباب', 'dart', '#6e7c88', '#e6eef2', 2, 0, 'dark');
  addFish(4, 3, 'سمكة الفانوس', 'sink', '#e7c25a', '#3d4a38', 1, 0, 'gold');
  addFish(4, 4, 'ظل المستنقع', 'sink', '#2c3a34', '#9fb59a', 2, 2, 'dark', 'dart');

  addFish(5, 0, 'سمكة الجمرة', 'jump', '#e2582a', '#ffd0a4', 1, 0, 'red');
  addFish(5, 0, 'سمكة الحمم', 'float', '#ff7a32', '#ffe0b0', 0, 1, 'red');
  addFish(5, 1, 'سمكة الشرارة', 'jump', '#ffb03a', '#fff1c8', 2, 0, 'gold');
  addFish(5, 1, 'تنين صغير', 'dart', '#d63a2f', '#ffd8b0', 0, 1, 'red');
  addFish(5, 2, 'سمكة النار', 'jump', '#ff4a2a', '#ffd24a', 1, 2, 'red');
  addFish(5, 3, 'سمكة الفينيق', 'jump', '#ff8a1a', '#ffe9a8', 0, 1, 'gold');
  addFish(5, 4, 'حوت البركان', 'jump', '#c4382a', '#ffd27a', 2, 0, 'red', 'float');

  addFish(6, 0, 'سمكة السحاب', 'float', '#f4f7ff', '#d9e6ff', 2, 2, 'blue');
  addFish(6, 0, 'سمكة النسيم', 'lazy', '#c9b6ff', '#f6f1ff', 0, 0, 'purple');
  addFish(6, 1, 'سمكة النجمة', 'jump', '#ffe56a', '#fff8d2', 1, 0, 'gold');
  addFish(6, 1, 'سمكة الريشة', 'float', '#ffffff', '#e7f2ff', 2, 1, 'blue');
  addFish(6, 2, 'سمكة البرق', 'dart', '#7aa2ff', '#fff4b0', 0, 1, 'blue');
  addFish(6, 3, 'سمكة القوس', 'jump', '#ff7ad9', '#fff1a8', 1, 0, 'purple');
  addFish(6, 4, 'حوت القمر', 'jump', '#d9c6ff', '#fff8e6', 2, 2, 'purple', 'float');
  FISH[48].min = 22;
  FISH[48].max = 90;
  FISH[48].price = 520;

  function addJunk(name, price, body, belly, min, max) {
    FISH.push({
      id: FISH.length, spot: -1, rare: 0, name: name, beh: 'lazy', beh2: '', price: price,
      body: body, belly: belly, pat: 0, tail: 2, col: 'dark', min: min, max: max, junk: 1, boss: 0
    });
  }
  addJunk('حذاء قديم', 3, '#6b5344', '#c4a484', 0.4, 1.2);
  addJunk('بطّة مطاط', 8, '#ffd23a', '#fff4b0', 0.2, 0.5);
  addJunk('رسالة في قارورة', 0, '#8fd0ff', '#f4fbff', 0.3, 0.8);
  addJunk('صندوق كنز', 70, '#e2b04a', '#fff0c0', 1.2, 3.4);

  var BOSS_NAME = ['وحش البركة', 'قرش ضحوك', 'ملك المرجان', 'عملاق الجليد', 'ظل عظيم', 'تنين الينبوع', 'حوت الغيوم'];
  var BOSS_COL = ['#2f8f5b', '#3d7eb8', '#ff5d8f', '#9fdfff', '#2c3a34', '#ff4a2a', '#d9c6ff'];
  for (var b = 0; b < 7; b++) {
    FISH.push({
      id: FISH.length, spot: b, rare: 4, name: BOSS_NAME[b], beh: 'boss', beh2: '', price: 880,
      body: BOSS_COL[b], belly: '#fff6d8', pat: b % 3, tail: b % 3, col: 'gold',
      min: 18, max: 70, junk: 0, boss: 1
    });
  }

  LL.RARE_NAME = ['عادي', 'غير مألوف', 'نادر', 'ملحمي', 'أسطوري'];
  LL.RARE_W = [3, 2, 1, 0.6, 0.4];
  LL.HINTS = [
    'الأسماك النادرة تحب الماء البعيد',
    'انتظر علامة ! ولا تضغط قبلها',
    'الطعوم تُقصّر الانتظار',
    'العصا الذهبية تجعل السحب أسهل',
    'أطلق سمكة ليزيد حظّك اللطيف',
    'حوت القمر يسكن بحيرة السماء',
    'أكمل أسماك المكان ليظهر الزعيم'
  ];
  LL.SPOTS = [
    { name: 'بركة القرية', need: 'مفتوحة' },
    { name: 'رصيف البحر', need: 'اصطد سمكة واحدة' },
    { name: 'شعاب المرجان', need: 'اشترِ القارب' },
    { name: 'ثقب الجليد', need: 'اصطد 6 أسماك' },
    { name: 'مستنقع الغروب', need: 'اصطد 12 سمكة' },
    { name: 'بركان الينابيع', need: 'اصطد 18 سمكة' },
    { name: 'بحيرة السماء', need: 'اصطد زعيمًا أو 28 سمكة' }
  ];
  LL.RODS = [
    { name: 'غصن الصفصاف', zone: 0.16, fill: 0.175, luck: 0, cost: 0 },
    { name: 'خيزران', zone: 0.225, fill: 0.19, luck: 0.06, cost: 50 },
    { name: 'نهر', zone: 0.25, fill: 0.20, luck: 0.10, cost: 140 },
    { name: 'بحر', zone: 0.275, fill: 0.215, luck: 0.16, cost: 320 },
    { name: 'مرجان', zone: 0.30, fill: 0.23, luck: 0.22, cost: 700 },
    { name: 'العصا الذهبية', zone: 0.34, fill: 0.26, luck: 0.34, cost: 1600 }
  ];
  LL.BAITS = [
    { name: 'ديدان', cost: 20, wait: 0.55, luck: 0, beh: '', note: 'انتظار أقصر' },
    { name: 'لمعان', cost: 45, wait: 1, luck: 0.12, beh: '', note: 'حظّ أفضل' },
    { name: 'ريش', cost: 40, wait: 0.85, luck: 0.02, beh: 'float', note: 'يجذب الطافي' },
    { name: 'حجر', cost: 40, wait: 0.85, luck: 0.02, beh: 'sink', note: 'يجذب الغاطس' },
    { name: 'طُعم القمر', cost: 80, wait: 0.8, luck: 0.18, beh: '', note: 'حظّ عالٍ' }
  ];
  LL.DECOR = [
    { name: 'نبتة', cost: 30 },
    { name: 'قلعة', cost: 80 },
    { name: 'فقاعات', cost: 40 },
    { name: 'نجم', cost: 60 }
  ];
  LL.EVENTS = {
    rain: { name: 'مطر', odds: 'العضّ أسرع: الانتظار ×0.7' },
    rainbow: { name: 'قوس قزح', odds: 'سمكة قوس كل 1 من 10، وسعرها ×5' },
    night: { name: 'ليل', odds: 'سمكة مضيئة 3 من 10، وسعرها ×1.5' },
    frenzy: { name: 'جنون السمك', odds: 'عضّ فوري لمدة 30 ثانية' },
    calm: { name: 'ماء هادئ', odds: 'الاحتمالات العادية' }
  };
  LL.DERBY_ROD = { name: 'سنارة المسابقة', zone: 0.22, fill: 0.18, luck: 0.04, cost: 0 };
  LL.SWEET = [0.78, 0.93];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seedOf(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0 || 1;
    var h = 2166136261;
    var s = String(seed == null ? 1 : seed);
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0 || 1;
  }
  function rng(seed) {
    var a = seed >>> 0 || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function num(v, d, max) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) return d;
    if (max != null && v > max) v = max;
    return v;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  LL.clamp = clamp;
  LL.rng = rng;
  LL.seedOf = seedOf;

  function blankSave() {
    return {
      v: 1, coins: 0, kindness: 0, caught: 0, perfects: 0, bosses: 0, play: 0,
      rod: 0, rods: [1, 0, 0, 0, 0, 0], bait: [0, 0, 0, 0, 0], baitOn: -1,
      boat: 0, spots: [1, 0, 0, 0, 0, 0, 0], spot: 0,
      book: zeros(60), aqua: [], decor: [0, 0, 0, 0],
      quests: [], qseed: 1, easy: 0, derby: 180, pending: null
    };
  }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  function questText(q) {
    if (!q) return '';
    if (q.k === 'catch') return 'اصطد ' + q.n + (q.n === 1 ? ' سمكة' : ' أسماك');
    if (q.k === 'blue') return 'اصطد ' + q.n + ' أسماك زرقاء';
    if (q.k === 'perfect') return 'رمية ممتازة ' + q.n + (q.n === 1 ? ' مرة' : ' مرات');
    if (q.k === 'rare') return 'اصطد سمكة نادرة';
    if (q.k === 'earn') return 'بِع سمكًا بـ ' + q.n + ' عملة';
    if (q.k === 'release') return 'أطلق ' + q.n + (q.n === 1 ? ' سمكة' : ' أسماك');
    if (q.k === 'weight') return 'اصطد سمكة أثقل من ' + q.n + ' كغ';
    if (q.k === 'junk') return 'اصطد شيئًا غريبًا';
    if (q.k === 'boss') return 'اصطد زعيم البحيرة';
    if (q.k === 'spot') return 'اصطد سمكة من ' + (LL.SPOTS[q.spot] ? LL.SPOTS[q.spot].name : 'مكان جديد');
    return 'اصطد سمكة';
  }
  LL.questText = questText;

  function rollQuest(save, prefer) {
    var pool = [
      { k: 'catch', n: 3, reward: 30 },
      { k: 'blue', n: 3, reward: 40 },
      { k: 'perfect', n: 5, reward: 35 },
      { k: 'rare', n: 1, reward: 50 },
      { k: 'earn', n: 80, reward: 25 },
      { k: 'release', n: 2, reward: 20 },
      { k: 'weight', n: 4, reward: 40 },
      { k: 'junk', n: 1, reward: 25 },
      { k: 'boss', n: 1, reward: 80 },
      { k: 'spot', n: 1, spot: save.boat ? 2 : 1, reward: 40 }
    ];
    var r = rng((save.qseed = (Math.imul(save.qseed || 1, 1103515245) + 12345) >>> 0) || 1);
    var q = pool[prefer != null ? prefer % pool.length : Math.floor(r() * pool.length)];
    q = { k: q.k, n: q.n, have: 0, reward: q.reward, spot: q.spot == null ? -1 : q.spot, unlock: 0 };
    q.text = questText(q);
    return q;
  }

  function freshQuests(save) {
    save.quests = [
      { k: 'catch', n: 1, have: 0, reward: 25, spot: -1, unlock: 1 },
      { k: 'perfect', n: 1, have: 0, reward: 20, spot: -1, unlock: 0 },
      { k: 'earn', n: 15, have: 0, reward: 15, spot: -1, unlock: 0 }
    ];
    for (var i = 0; i < 3; i++) save.quests[i].text = questText(save.quests[i]);
  }

  LL.spotOpen = function (save, i) {
    if (!save || i < 0 || i > 6) return false;
    if (i === 0) return true;
    if (save.spots && save.spots[i]) return true;
    if (i === 1) return save.caught >= 1;
    if (i === 2) return !!save.boat;
    if (i === 3) return save.caught >= 6;
    if (i === 4) return save.caught >= 12;
    if (i === 5) return save.caught >= 18;
    if (i === 6) return save.bosses >= 1 || save.caught >= 28;
    return false;
  };

  function refreshUnlocks(save) {
    for (var i = 0; i < 7; i++) if (LL.spotOpen(save, i)) save.spots[i] = 1;
  }

  LL.normalize = function (raw) {
    var s = blankSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { freshQuests(s); refreshUnlocks(s); return s; }
    s.coins = Math.floor(num(raw.coins, 0, 9999999));
    s.kindness = Math.floor(num(raw.kindness, 0, 999));
    s.caught = Math.floor(num(raw.caught, 0, 999999));
    s.perfects = Math.floor(num(raw.perfects, 0, 999999));
    s.bosses = Math.floor(num(raw.bosses, 0, 999));
    s.play = num(raw.play, 0, 9999999);
    s.rod = Math.floor(num(raw.rod, 0, 5));
    s.boat = raw.boat ? 1 : 0;
    s.easy = raw.easy ? 1 : 0;
    s.derby = raw.derby === 120 || raw.derby === 300 ? raw.derby : 180;
    s.spot = Math.floor(num(raw.spot, 0, 6));
    s.qseed = Math.floor(num(raw.qseed, 1, 4294967295)) || 1;
    s.baitOn = Math.floor(raw.baitOn);
    if (!(s.baitOn >= 0 && s.baitOn <= 4)) s.baitOn = -1;
    if (Array.isArray(raw.rods)) for (var i = 0; i < 6; i++) s.rods[i] = raw.rods[i] ? 1 : 0;
    s.rods[0] = 1;
    if (!s.rods[s.rod]) s.rod = 0;
    if (Array.isArray(raw.bait)) for (var j = 0; j < 5; j++) s.bait[j] = Math.floor(num(raw.bait[j], 0, 99));
    if (s.baitOn >= 0 && s.bait[s.baitOn] <= 0) s.baitOn = -1;
    if (Array.isArray(raw.spots)) for (var k = 0; k < 7; k++) s.spots[k] = raw.spots[k] ? 1 : 0;
    s.spots[0] = 1;
    if (Array.isArray(raw.book)) for (var n = 0; n < 60; n++) s.book[n] = Math.round(num(raw.book[n], 0, 999) * 10) / 10;
    if (Array.isArray(raw.decor)) for (var d = 0; d < 4; d++) s.decor[d] = raw.decor[d] ? 1 : 0;
    if (Array.isArray(raw.aqua)) {
      for (var a = 0; a < raw.aqua.length && s.aqua.length < 24; a++) {
        var fish = raw.aqua[a];
        if (!fish || typeof fish !== 'object') continue;
        var id = Math.floor(num(fish.id, -1, 59));
        if (id < 0 || !FISH[id] || FISH[id].junk) continue;
        s.aqua.push({ id: id, w: Math.round(num(fish.w, FISH[id].min, 999) * 10) / 10, rb: fish.rb ? 1 : 0 });
      }
    }
    if (Array.isArray(raw.quests)) {
      for (var q = 0; q < raw.quests.length && s.quests.length < 3; q++) {
        var src = raw.quests[q];
        if (!src || typeof src.k !== 'string' || !({ catch: 1, blue: 1, perfect: 1, rare: 1, earn: 1, release: 1, weight: 1, junk: 1, boss: 1, spot: 1 })[src.k]) continue;
        var item = {
          k: src.k, n: Math.floor(num(src.n, 1, 99)) || 1, have: Math.floor(num(src.have, 0, 99)),
          reward: Math.floor(num(src.reward, 20, 200)), spot: Math.floor(num(src.spot, -1, 6)),
          unlock: src.unlock ? 1 : 0
        };
        if (item.spot < 0) item.spot = -1;
        item.text = questText(item);
        s.quests.push(item);
      }
    }
    while (s.quests.length < 3) s.quests.push(rollQuest(s));
    if (raw.pending && typeof raw.pending === 'object') {
      var pid = Math.floor(num(raw.pending.id, -1, 59));
      if (pid >= 0 && FISH[pid]) {
        s.pending = {
          id: pid, w: Math.round(num(raw.pending.w, FISH[pid].min, 999) * 10) / 10,
          rb: raw.pending.rb ? 1 : 0, glow: raw.pending.glow ? 1 : 0, day: raw.pending.day ? 1 : 0
        };
      }
    }
    refreshUnlocks(s);
    if (!LL.spotOpen(s, s.spot)) s.spot = 0;
    return s;
  };

  LL.eventAt = function (play) {
    play = num(play, 0);
    var x = play % 720;
    var slot = Math.floor(x / 180);
    var into = x - slot * 180;
    var ids = ['rain', 'rainbow', 'night', 'frenzy'];
    var id = ids[slot];
    var frenzy = slot === 3 && into < 30;
    if (slot === 3 && !frenzy) id = 'calm';
    return { id: id, left: slot === 3 && frenzy ? 30 - into : 180 - into, frenzy: frenzy ? 1 : 0 };
  };

  LL.dayIndex = function (day) {
    var r = rng(seedOf(day || 1));
    return Math.floor(r() * 49);
  };
  LL.moonBoost = function (day) { return ((day || 0) % 7) === 5; };

  function luckWeights(luck, spot, day) {
    var w = LL.RARE_W.slice();
    var shift = clamp(luck, 0, 0.85);
    w[0] = Math.max(0.35, w[0] - shift * 2.2);
    w[1] = Math.max(0.4, w[1] - shift * 0.25);
    w[2] += shift * 0.55;
    w[3] += shift * 0.85;
    w[4] += shift * 1.05;
    if (spot === 6 && LL.moonBoost(day)) w[4] *= 8;
    return w;
  }

  LL.odds = function (opts) {
    opts = opts || {};
    var w = luckWeights(opts.luck || 0, opts.spot || 0, opts.day || 0);
    var sum = 0;
    for (var i = 0; i < 5; i++) sum += w[i];
    var out = [];
    for (var k = 0; k < 5; k++) out.push({ rare: k, name: LL.RARE_NAME[k], pct: Math.round(w[k] / sum * 1000) / 10 });
    var junk = clamp(0.09 - (opts.luck || 0) * 0.05, 0.03, 0.12);
    return { rare: out, junk: Math.round(junk * 1000) / 10, rainbow: opts.event === 'rainbow' ? 10 : 0, glow: opts.event === 'night' ? 30 : 0 };
  };

  function speciesOf(spot, rare) {
    var list = [];
    for (var i = 0; i < 49; i++) if (FISH[i].spot === spot && FISH[i].rare === rare) list.push(FISH[i]);
    return list;
  }

  function spotComplete(book, spot) {
    for (var i = 0; i < 49; i++) if (FISH[i].spot === spot && !(book[i] > 0)) return false;
    return true;
  }
  LL.spotComplete = spotComplete;
  LL.bookCount = function (book) {
    var n = 0;
    for (var i = 0; i < 60; i++) if (book[i] > 0) n++;
    return n;
  };

  function rollCatch(rnd, opts) {
    var spot = opts.spot || 0;
    var luck = opts.luck || 0;
    var junkP = clamp(0.09 - luck * 0.05, 0.03, 0.12);
    if (opts.event === 'frenzy') junkP *= 0.4;
    if (rnd() < junkP) {
      var junk = FISH[49 + Math.floor(rnd() * 4)];
      return instanceOf(junk, rnd, opts);
    }
    if (spotComplete(opts.book || zeros(60), spot) && rnd() < 0.18 + luck * 0.15) {
      return instanceOf(FISH[53 + spot], rnd, opts);
    }
    var baitBeh = opts.baitBeh || '';
    if (baitBeh && rnd() < 0.45) {
      var pool = [];
      for (var i = 0; i < 49; i++) if (FISH[i].spot === spot && (FISH[i].beh === baitBeh || FISH[i].beh2 === baitBeh)) pool.push(FISH[i]);
      if (pool.length) return instanceOf(pool[Math.floor(rnd() * pool.length)], rnd, opts);
    }
    var w = luckWeights(luck, spot, opts.day || 0);
    var sum = 0;
    for (var r = 0; r < 5; r++) sum += w[r];
    var pick = rnd() * sum;
    var rare = 4;
    for (var r2 = 0; r2 < 5; r2++) { pick -= w[r2]; if (pick <= 0) { rare = r2; break; } }
    var list = speciesOf(spot, rare);
    if (!list.length) list = speciesOf(spot, 0);
    return instanceOf(list[Math.floor(rnd() * list.length)], rnd, opts);
  }

  function instanceOf(def, rnd, opts) {
    var w = def.min + rnd() * (def.max - def.min);
    w = Math.round(w * 10) / 10;
    var fish = {
      id: def.id, name: def.name, rare: def.rare, beh: def.beh, beh2: def.beh2, spot: def.spot,
      price: def.price, body: def.body, belly: def.belly, pat: def.pat, tail: def.tail, col: def.col,
      junk: def.junk, boss: def.boss, min: def.min, max: def.max,
      w: w, rb: 0, glow: 0, day: 0, stolen: 0,
      y: 0.64, t: 0, tell: 0, leaping: 0, dartY: 0.66, dartIn: 1, yPhase: -1, behNow: def.beh
    };
    fish.amp = def.junk ? 0.08 : def.boss ? 0.24 : 0.09 + def.rare * 0.038 + Math.max(0, def.spot) * 0.008;
    fish.omega = def.junk ? 0.7 : def.boss ? 1.55 : 0.78 + def.rare * 0.32 + Math.max(0, def.spot) * 0.055;
    if (opts.event === 'rainbow' && !def.junk && rnd() < 0.1) fish.rb = 1;
    if (opts.event === 'night' && !def.junk && rnd() < 0.3) fish.glow = 1;
    if (!def.junk && !def.boss && def.id === opts.dayId) fish.day = 1;
    return fish;
  }

  LL.priceOf = function (fish) {
    if (!fish) return 0;
    var base = FISH[fish.id] ? FISH[fish.id].price : 0;
    var p = base;
    if (fish.rb) p *= 5;
    if (fish.day) p *= 3;
    if (fish.glow) p = Math.round(p * 1.5);
    if (fish.id === 52) p += 40;
    if (fish.stolen) p = 0;
    return Math.round(p);
  };

  function makeAngler(i) {
    return {
      i: i, phase: 'ready', aim: 0, power: 0, chargeT: 0, dist: 0.4, perfect: 0,
      waitT: 0, waitNeed: 1, nibbleAt: [0, 0], nibbles: 0, dip: 0, biteT: 0, bang: 0,
      fish: null, zoneY: 0.5, zoneV: 0, zoneH: 0.2, prog: 0, fill: 0.17, drain: 0.1,
      slip: 0, inside: 0, tension: 0, breather: 0, showT: 0, missT: 0, flightT: 0,
      banner: '', bannerT: 0, reelSpin: 0, weight: 0, best: 0, catches: [], rod: LL.RODS[0]
    };
  }

  function makeShadows() {
    var list = [];
    for (var i = 0; i < 7; i++) {
      list.push({ x: (i * 0.15) % 1, y: 0.22 + (i % 3) * 0.24, s: 0.35 + (i % 5) * 0.13, v: 0.035 + (i % 4) * 0.012, dir: i % 2 ? 1 : -1 });
    }
    return list;
  }

  function rodFor(st, save) {
    if (st.derby) return LL.DERBY_ROD;
    return LL.RODS[save.rod] || LL.RODS[0];
  }

  function zoneHalf(st, rod) {
    var z = rod.zone;
    if (st.spot === 0 && !st.derby) z *= 1.55;
    if (st.easy) z *= 1.3;
    return clamp(z, 0.12, 0.46);
  }

  function equippedBait(save) {
    if (save.baitOn < 0 || save.baitOn > 4) return null;
    if (!(save.bait[save.baitOn] > 0)) return null;
    return LL.BAITS[save.baitOn];
  }

  function castLuck(st, a) {
    var save = st.save;
    var rod = a.rod;
    var bait = equippedBait(save);
    var luck = rod.luck + Math.min(20, save.kindness) * 0.012;
    if (a.perfect) luck += 0.16;
    luck += Math.max(0, a.dist - 0.55) * 0.42;
    luck += Math.max(0, a.aim) * 0.04;
    if (bait) luck += bait.luck;
    var ev = st.event.id;
    if (ev === 'night') luck += 0.04;
    if (ev === 'rainbow') luck += 0.02;
    return luck;
  }

  function beginWait(st, a, ev) {
    var save = st.save;
    var rnd = st.rnd;
    var bait = equippedBait(save);
    var base = 2.05 + rnd() * 5.1;
    if (save.caught === 0 && st.spot === 0 && !st.derby) base = 1.05 + rnd() * 0.3;
    if (bait && bait.wait) base *= bait.wait;
    if (st.event.id === 'rain') base *= 0.7;
    if (st.event.frenzy) base = 0.28 + rnd() * 0.08;
    base = clamp(base, 0.25, 8);
    a.phase = 'wait';
    a.waitT = 0;
    a.waitNeed = base;
    a.nibbles = 0;
    a.dip = 0;
    a.nibbleAt = base < 0.7 ? [base * 0.55, 99] : [base * 0.42, base * 0.72];
    a.fish = null;
    ev.push({ t: 'splash', i: a.i, kind: 'cast' });
  }

  function releaseCast(st, a, ev) {
    a.rod = rodFor(st, st.save);
    var sweet = a.power >= LL.SWEET[0] && a.power <= LL.SWEET[1];
    a.perfect = sweet ? 1 : 0;
    a.dist = 0.2 + a.power * 0.76;
    a.flightT = 0;
    a.phase = 'flight';
    if (sweet) {
      st.save.perfects++;
      bumpQuest(st, 'perfect', 1);
      a.banner = 'perfect';
      a.bannerT = 1.35;
    }
    ev.push({ t: 'cast', i: a.i, perfect: a.perfect });
  }

  function beginBite(st, a, ev) {
    var save = st.save;
    var bait = equippedBait(save);
    if (bait) {
      save.bait[save.baitOn]--;
      if (save.bait[save.baitOn] <= 0) save.baitOn = -1;
    }
    // The very first pond bites are a gentle common, so the first catch is
    // near-guaranteed and teaches the reel before anything surprising shows up.
    if (!st.derby && save.caught === 0 && st.spot === 0) {
      a.fish = instanceOf(FISH[st.rnd() < 0.5 ? 0 : 1], st.rnd, { event: 'calm', dayId: -1 });
    } else a.fish = rollCatch(st.rnd, {
      spot: st.spot, luck: castLuck(st, a), book: save.book, event: st.event.frenzy ? 'frenzy' : st.event.id,
      baitBeh: bait ? bait.beh : '', day: st.day, dayId: st.dayId
    });
    a.phase = 'bite';
    a.biteT = st.easy ? 0.9 : 0.7;
    a.bang = 1;
    ev.push({ t: 'bite', i: a.i });
  }

  function beginReel(st, a, ev) {
    var fish = a.fish;
    fish.t = 0;
    fish.y = 0.64;
    fish.dartY = 0.66;
    fish.dartIn = 0.85 + st.rnd() * 0.4;
    fish.tell = 0;
    fish.yPhase = 0;
    fish.behNow = fish.boss ? 'lazy' : fish.beh;
    a.rod = rodFor(st, st.save);
    a.zoneH = zoneHalf(st, a.rod);
    a.zoneY = 0.64;
    a.zoneV = 0;
    a.prog = 0.3;
    var rareDrag = !fish.boss && fish.rare >= 4 ? 1 : fish.boss ? 0.96 : 1;
    a.fill = a.rod.fill * rareDrag * (st.easy ? 1.12 : 1);
    a.drain = (st.easy ? 0.072 : 0.11) * (!fish.boss && fish.rare >= 4 ? 3.6 : fish.boss ? 1.65 : 1);
    a.slip = st.spot === 3 && !st.derby ? 1 : 0;
    a.breather = 0;
    a.inside = 1;
    if (fish.junk) { a.zoneH = Math.min(0.42, a.zoneH * 1.35); a.fill *= 1.7; a.drain *= 0.6; }
    a.phase = 'reel';
    a.bang = 0;
    ev.push({ t: 'hook', i: a.i });
  }

  function targetOf(fish) {
    var beh = fish.behNow || fish.beh;
    var t = fish.t;
    if (beh === 'lazy') return 0.64 + Math.sin(t * fish.omega) * fish.amp;
    if (beh === 'float') return 0.76 + Math.sin(t * fish.omega * 0.72) * fish.amp * 0.62;
    if (beh === 'sink') return 0.54 + Math.sin(t * fish.omega) * fish.amp * 0.9 - 0.02;
    if (beh === 'jump') {
      var period = fish.rare >= 3 || fish.boss ? 1.7 : 2.5;
      var c = t % period;
      var leap = fish.rare >= 3 || fish.boss ? 0.2 : 0.28;
      fish.leaping = c < leap ? 1 : 0;
      if (c < leap) return 0.97;
      return 0.58 + Math.sin(t * 1.25) * Math.min(0.16, fish.amp);
    }
    if (beh === 'dart') return fish.dartY;
    return 0.64;
  }

  function stepSurge(st, fish, dt, beh) {
    if (!fish.surge) { fish.surge = 'rest'; fish.surgeT = 0.35; fish.goal = fish.y || 0.6; }
    fish.surgeT -= dt;
    fish.tell = fish.surge === 'tell' ? clamp(1 - fish.surgeT / 0.3, 0, 1) : 0;
    fish.leaping = 0;
    if (fish.surgeT <= 0 && fish.surge !== 'run') {
      if (fish.surge === 'tell') {
        fish.surge = 'run';
        fish.surgeT = 0.9;
      } else {
        var dir = st.rnd() < (beh === 'sink' ? 0.72 : beh === 'float' || beh === 'jump' ? 0.28 : 0.5) ? -1 : 1;
        var dist = (fish.boss ? 0.34 : 0.46) + st.rnd() * (fish.boss ? 0.22 : 0.2);
        fish.goal = clamp((fish.y || 0.6) + dir * dist, 0.1, 0.94);
        fish.surge = 'tell';
        fish.surgeT = fish.boss && fish.yPhase < 2 ? 0.34 : 0.26;
        fish.tell = 1;
      }
    }
    if (fish.surge === 'run') {
      var speed = fish.boss ? (fish.yPhase >= 2 ? 2.45 : 2.0) : 2.2;
      var step = speed * dt;
      if (Math.abs(fish.goal - fish.y) <= step) {
        fish.y = fish.goal;
        fish.surge = 'rest';
        fish.surgeT = fish.boss ? 0.22 : 0.34;
        if (beh === 'jump') { fish.leaping = 1; fish.y = Math.min(0.96, fish.y + 0.08); }
      } else fish.y += Math.sign(fish.goal - fish.y) * step;
    }
  }

  function stepFish(st, a, dt) {
    var fish = a.fish;
    if (a.breather > 0) { fish.tell = 0; return; }
    fish.t += dt;
    var beh = fish.beh;
    if (fish.boss) {
      var ph = a.prog < 0.34 ? 0 : a.prog < 0.68 ? 1 : 2;
      if (ph !== fish.yPhase) {
        if (fish.yPhase >= 0 && ph > fish.yPhase) a.breather = Math.max(a.breather, 0.72);
        fish.yPhase = ph;
      }
      beh = ph === 0 ? 'lazy' : ph === 1 ? 'dart' : 'jump';
    } else if (fish.beh2) {
      beh = (Math.floor(fish.t / 1.55) % 2 === 0) ? fish.beh : fish.beh2;
    }
    fish.behNow = beh;
    if ((fish.rare >= 4 && !fish.boss) || (fish.boss && fish.yPhase >= 1)) { stepSurge(st, fish, dt, beh); return; }
    if (beh === 'dart' || (fish.boss && beh === 'dart')) {
      fish.dartIn -= dt;
      fish.tell = fish.dartIn < 0.3 && fish.dartIn > 0 ? (0.3 - fish.dartIn) / 0.3 : 0;
      if (fish.dartIn <= 0) {
        var band = fish.rare >= 3 || fish.boss ? 0.46 : 0.22;
        var base = fish.rare >= 3 || fish.boss ? 0.48 : 0.54;
        fish.dartY = clamp(base + st.rnd() * band, 0.3, 0.96);
        fish.dartIn = (fish.rare >= 4 || fish.boss ? 0.62 : 1.2) + st.rnd() * 0.28;
        fish.y = fish.dartY;
      }
    } else fish.tell = 0;
    var target = clamp(targetOf(fish), 0.08, 0.96);
    if (beh !== 'dart') {
      var k = 7.2;
      fish.y += (target - fish.y) * Math.min(1, k * dt);
    }
  }

  function onCatch(st, a, ev) {
    a.phase = 'show';
    a.showT = 0;
    a.banner = 'catch';
    a.bannerT = 1.1;
    ev.push({ t: 'catch', i: a.i, rare: a.fish.rare, boss: a.fish.boss, rb: a.fish.rb });
  }

  function onEscape(st, a, ev) {
    var id = a.fish ? a.fish.id : -1;
    a.phase = 'miss';
    a.missT = 0.9;
    a.banner = 'escape';
    a.bannerT = 1.05;
    a.fish = null;
    ev.push({ t: 'escape', i: a.i, id: id });
  }

  function stepReel(st, a, dt, inp, ev) {
    var hold = !!inp.down;
    var accel = hold ? 7.2 : -5.6;
    var damp = a.slip ? 0.85 : 5.2;
    a.zoneV += accel * dt;
    a.zoneV = clamp(a.zoneV, -1.25, 1.25);
    a.zoneV *= Math.exp(-damp * dt);
    a.zoneY += a.zoneV * dt;
    var h = a.zoneH;
    if (a.zoneY < h) { a.zoneY = h; if (a.zoneV < 0) a.zoneV = 0; }
    if (a.zoneY > 1 - h) { a.zoneY = 1 - h; if (a.zoneV > 0) a.zoneV = 0; }
    if (hold) a.reelSpin += dt * 7;
    stepFish(st, a, dt);
    a.tension = clamp(Math.abs(a.fish.y - a.zoneY) / 0.5, 0, 1);
    if (a.breather > 0) { a.breather -= dt; a.inside = 0; return; }
    var inside = Math.abs(a.fish.y - a.zoneY) <= h + 0.02;
    a.inside = inside ? 1 : 0;
    var drain = a.drain;
    if (a.fish.boss && a.fish.yPhase >= 2) drain *= 2.1;
    else if (a.fish.boss && a.fish.yPhase === 1) drain *= 1.35;
    if (inside) a.prog += a.fill * dt;
    else a.prog -= drain * dt;
    if (a.prog >= 1) { a.prog = 1; onCatch(st, a, ev); }
    else if (a.prog <= 0) { a.prog = 0; onEscape(st, a, ev); }
  }

  function stepAngler(st, a, dt, inp, ev) {
    if (a.bannerT > 0) a.bannerT -= dt;
    if (a.phase === 'ready') {
      a.power = 0;
      a.chargeT = 0;
      if (inp.left) a.aim -= dt * 0.9;
      if (inp.right) a.aim += dt * 0.9;
      a.aim = clamp(a.aim, -1, 1);
      if (inp.down) a.phase = 'charge';
      return;
    }
    if (a.phase === 'charge') {
      if (inp.left) a.aim -= dt * 0.9;
      if (inp.right) a.aim += dt * 0.9;
      a.aim = clamp(a.aim, -1, 1);
      a.chargeT += dt;
      a.power = 0.5 - 0.5 * Math.cos(a.chargeT * 2.7);
      if (!inp.down) releaseCast(st, a, ev);
      return;
    }
    if (a.phase === 'flight') {
      a.flightT += dt;
      if (a.flightT >= 0.42) beginWait(st, a, ev);
      return;
    }
    if (a.phase === 'wait') {
      a.waitT += dt;
      if (a.dip > 0) a.dip -= dt;
      if (a.nibbles < 2 && a.waitT >= a.nibbleAt[a.nibbles]) {
        a.nibbles++;
        a.dip = 0.26;
        ev.push({ t: 'nibble', i: a.i });
      }
      if (inp.pressed && a.dip > 0 && a.waitT < a.waitNeed - 0.05) {
        a.phase = 'scared';
        a.missT = 0.62;
        a.banner = 'scare';
        a.bannerT = 0.8;
        ev.push({ t: 'scare', i: a.i });
        return;
      }
      if (a.waitT >= a.waitNeed) {
        beginBite(st, a, ev);
        if (inp.pressed && a.phase === 'bite') beginReel(st, a, ev);
      }
      return;
    }
    if (a.phase === 'bite') {
      a.biteT -= dt;
      a.bang = 1;
      if (inp.pressed) beginReel(st, a, ev);
      else if (a.biteT <= 0) {
        a.phase = 'miss';
        a.missT = 0.8;
        a.bang = 0;
        a.banner = 'miss';
        a.bannerT = 0.9;
        a.fish = null;
        ev.push({ t: 'miss', i: a.i });
      }
      return;
    }
    if (a.phase === 'reel') { stepReel(st, a, dt, inp, ev); return; }
    if (a.phase === 'show') {
      a.showT += dt;
      if (a.showT >= 0.85) {
        if (st.derby) bankDerby(st, a, ev);
        else {
          a.phase = 'reveal';
          st.save.pending = packFish(a.fish);
          ev.push({ t: 'reveal', i: a.i });
        }
      }
      return;
    }
    if (a.phase === 'miss' || a.phase === 'scared') {
      a.missT -= dt;
      if (a.missT <= 0) { a.phase = 'ready'; a.banner = ''; }
    }
  }

  function packFish(fish) {
    if (!fish) return null;
    return { id: fish.id, w: fish.w, rb: fish.rb ? 1 : 0, glow: fish.glow ? 1 : 0, day: fish.day ? 1 : 0 };
  }

  function bankDerby(st, a, ev) {
    var fish = a.fish;
    a.weight = Math.round((a.weight + fish.w) * 10) / 10;
    if (fish.w > a.best) a.best = fish.w;
    if (a.catches.length < 40) a.catches.push({ id: fish.id, w: fish.w, rb: fish.rb });
    noteCatch(st, fish, 'sell');
    a.fish = null;
    a.phase = 'ready';
    ev.push({ t: 'banked', i: a.i });
  }

  function bumpQuest(st, key, n, extra) {
    var save = st.save;
    var done = [];
    for (var i = 0; i < save.quests.length; i++) {
      var q = save.quests[i];
      if (!q || q.k !== key || q.have >= q.n) continue;
      if (key === 'spot' && extra != null && q.spot !== extra) continue;
      q.have = Math.min(q.n, q.have + n);
      if (q.have >= q.n) done.push(i);
    }
    for (var d = 0; d < done.length; d++) {
      var quest = save.quests[done[d]];
      save.coins += quest.reward;
      if (quest.unlock) save.spots[1] = 1;
      save.quests[done[d]] = rollQuest(save);
    }
    return done.length;
  }

  function noteCatch(st, fish, choice) {
    var save = st.save;
    var id = fish.id;
    var prev = save.book[id] || 0;
    var isNew = !(prev > 0);
    if (fish.w > prev) save.book[id] = fish.w;
    if (isNew) save.caught++;
    if (fish.boss && isNew) save.bosses++;
    refreshUnlocks(save);
    if (choice === 'sell') {
      var price = LL.priceOf(fish);
      save.coins += price;
      bumpQuest(st, 'earn', price);
    }
    if (choice === 'release') {
      save.kindness = Math.min(999, save.kindness + 1);
      bumpQuest(st, 'release', 1);
    }
    bumpQuest(st, 'catch', 1);
    if (fish.col === 'blue') bumpQuest(st, 'blue', 1);
    if (fish.rare >= 2 && !fish.junk) bumpQuest(st, 'rare', 1);
    if (fish.w >= 4) bumpQuest(st, 'weight', 1);
    if (fish.junk) bumpQuest(st, 'junk', 1);
    if (fish.boss) bumpQuest(st, 'boss', 1);
    if (!fish.junk) bumpQuest(st, 'spot', 1, st.spot);
    return { isNew: isNew ? 1 : 0, price: choice === 'sell' ? LL.priceOf(fish) : 0, best: fish.w > prev && prev > 0 ? 1 : 0 };
  }

  function finishDerby(st, ev) {
    st.left = 0;
    st.over = 1;
    var w0 = st.anglers[0].weight, w1 = st.anglers[1] ? st.anglers[1].weight : 0;
    st.draw = Math.abs(w0 - w1) < 0.05 ? 1 : 0;
    st.winner = st.draw ? -1 : (w0 >= w1 ? 0 : 1);
    var b0 = st.anglers[0].best, b1 = st.anglers[1] ? st.anglers[1].best : 0;
    st.crown = Math.abs(b0 - b1) < 0.05 ? -1 : (b0 > b1 ? 0 : 1);
    ev.push({ t: 'derby', result: st.draw ? 'draw' : 'end', score: Math.round((st.draw ? w0 : Math.max(w0, w1)) * 10) });
  }

  function moveShadows(list, dt) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      s.x += s.dir * s.v * dt;
      if (s.x < -0.08) { s.x = -0.08; s.dir = 1; }
      if (s.x > 1.08) { s.x = 1.08; s.dir = -1; }
    }
  }

  function inputsOf(input, n) {
    input = input || {};
    var list = input.p || [
      { down: input.down, pressed: input.pressed, left: input.left, right: input.right },
      { down: input.p2down, pressed: input.p2pressed, left: input.p2left, right: input.p2right }
    ];
    var out = [];
    for (var i = 0; i < n; i++) {
      var src = list[i] || {};
      out.push({ down: !!src.down, pressed: !!src.pressed, left: !!src.left, right: !!src.right });
    }
    return out;
  }

  LL.createGame = function (opts) {
    opts = opts || {};
    var save = LL.normalize(opts.save);
    var players = opts.players === 2 ? 2 : 1;
    var st = {
      save: save,
      spot: (function () {
        var want = Math.floor(num(opts.spot == null ? save.spot : opts.spot, 0, 6));
        return opts.forceSpot || LL.spotOpen(save, want) ? want : 0;
      })(),
      easy: opts.easy != null ? (opts.easy ? 1 : 0) : save.easy,
      derby: players === 2 ? 1 : 0,
      t: 0, tick: 0,
      left: players === 2 ? (opts.seconds || save.derby || 180) : 0,
      over: 0, winner: -1, draw: 0, crown: -1,
      anglers: [], shadows: makeShadows(),
      event: LL.eventAt(save.play),
      day: opts.day || 1,
      dayId: LL.dayIndex(opts.day || 1)
    };
    st.rnd = rng(seedOf(opts.seed == null ? 1 : opts.seed));
    for (var i = 0; i < players; i++) {
      var a = makeAngler(i);
      a.rod = rodFor(st, save);
      st.anglers.push(a);
    }
    if (save.pending && !st.derby) {
      var pending = hydrate(save.pending);
      if (pending) { st.anglers[0].fish = pending; st.anglers[0].phase = 'reveal'; }
    }

    function step(dt, input) {
      var ev = [];
      if (!(dt > 0) || st.over) return ev;
      dt = Math.min(dt, 0.05);
      var ins = inputsOf(input, st.anglers.length);
      st.t += dt;
      st.tick++;
      if (!st.derby || st.anglers[0].phase !== 'reveal') save.play += dt;
      st.event = LL.eventAt(save.play);
      moveShadows(st.shadows, dt);
      for (var i = 0; i < st.anglers.length; i++) {
        if (st.anglers[i].phase === 'reveal') continue;
        stepAngler(st, st.anglers[i], dt, ins[i], ev);
      }
      if (st.derby) {
        st.left -= dt;
        if (st.left <= 0) finishDerby(st, ev);
      }
      return ev;
    }

    function resolve(i, choice) {
      var a = st.anglers[i];
      if (!a || a.phase !== 'reveal' || !a.fish) return { ok: 0 };
      if (choice !== 'sell' && choice !== 'keep' && choice !== 'release') return { ok: 0 };
      var fish = a.fish;
      if ((fish.id === 49 || fish.id === 50) && st.rnd() < 0.28) fish.stolen = 1;
      if (choice === 'keep') {
        if (fish.junk) choice = 'sell';
        else if (save.aqua.length >= 24) return { ok: 0, full: 1 };
      }
      var info = noteCatch(st, fish, choice);
      if (choice === 'keep') save.aqua.push({ id: fish.id, w: fish.w, rb: fish.rb ? 1 : 0 });
      var hint = '';
      if (fish.id === 51) hint = LL.HINTS[Math.floor(st.rnd() * LL.HINTS.length)];
      save.pending = null;
      a.phase = 'ready';
      a.fish = null;
      refreshUnlocks(save);
      return {
        ok: 1, choice: choice, isNew: info.isNew, best: info.best, price: info.price,
        stolen: fish.stolen, hint: hint, full: 0, id: fish.id, w: fish.w
      };
    }

    function buy(kind, idx) {
      idx = idx | 0;
      if (kind === 'rod') {
        var rod = LL.RODS[idx];
        if (!rod || save.rods[idx] || save.coins < rod.cost) return 0;
        save.coins -= rod.cost;
        save.rods[idx] = 1;
        save.rod = idx;
        return 1;
      }
      if (kind === 'equip') {
        if (!save.rods[idx]) return 0;
        save.rod = idx;
        return 1;
      }
      if (kind === 'bait') {
        var bait = LL.BAITS[idx];
        if (!bait || save.coins < bait.cost || save.bait[idx] > 89) return 0;
        save.coins -= bait.cost;
        save.bait[idx] = Math.min(99, save.bait[idx] + 10);
        save.baitOn = idx;
        return 1;
      }
      if (kind === 'baitOn') {
        if (idx < 0) { save.baitOn = -1; return 1; }
        if (!(save.bait[idx] > 0)) return 0;
        save.baitOn = idx;
        return 1;
      }
      if (kind === 'boat') {
        if (save.boat || save.coins < 100) return 0;
        save.coins -= 100;
        save.boat = 1;
        refreshUnlocks(save);
        return 1;
      }
      if (kind === 'decor') {
        var decor = LL.DECOR[idx];
        if (!decor || save.decor[idx] || save.coins < decor.cost) return 0;
        save.coins -= decor.cost;
        save.decor[idx] = 1;
        return 1;
      }
      return 0;
    }

    function travel(spot) {
      spot = spot | 0;
      if (!LL.spotOpen(save, spot)) return 0;
      if (st.derby) return 0;
      st.spot = spot;
      save.spot = spot;
      var a = st.anglers[0];
      if (a.phase !== 'reveal') {
        a.phase = 'ready';
        a.fish = null;
        a.power = 0;
      }
      return 1;
    }

    function resetCast() {
      for (var i = 0; i < st.anglers.length; i++) {
        var prev = st.anglers[i];
        var fresh = makeAngler(i);
        fresh.weight = prev.weight;
        fresh.best = prev.best;
        fresh.catches = prev.catches;
        fresh.rod = prev.rod;
        st.anglers[i] = fresh;
      }
      save.pending = null;
    }

    function setEasy(v) { st.easy = v ? 1 : 0; save.easy = st.easy ? 1 : 0; }
    function setDerby(sec) { if (sec === 120 || sec === 180 || sec === 300) save.derby = sec; }

    function hookTest(i, id) {
      var a = st.anglers[i];
      var def = FISH[id];
      if (!a || !def) return 0;
      a.fish = instanceOf(def, st.rnd, { event: 'calm', dayId: -1 });
      a.fish.spot = def.spot;
      beginReel(st, a, []);
      return 1;
    }

    function hydrate(p) {
      var def = FISH[p.id];
      if (!def) return null;
      var fish = instanceOf(def, rng(seedOf(p.id + 3)), { event: 'calm', dayId: p.day ? def.id : -1 });
      fish.w = p.w;
      fish.rb = p.rb ? 1 : 0;
      fish.glow = p.glow ? 1 : 0;
      fish.day = p.day ? 1 : 0;
      return fish;
    }

    return {
      state: st,
      step: step,
      resolve: resolve,
      buy: buy,
      travel: travel,
      hookTest: hookTest,
      resetCast: resetCast,
      setEasy: setEasy,
      setDerby: setDerby,
      exportSave: function () { return clone(save); }
    };
  };

  LL.blankSave = blankSave;
})(typeof globalThis !== 'undefined' ? globalThis : this);
