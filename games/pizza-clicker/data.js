/* Pizza Empire (إمبراطورية البيتزا) — game data: buildings, upgrades,
   achievements, skins, news lines and number formatting.
   Plain script: defines window.PZ (also works under node for balance sims). */
(function (root) {
  'use strict';

  var PZ = {};

  /* ------------------------------------------------------------ numbers */
  var WORDS = [
    [1e33, 'ديسليون'], [1e30, 'نونليون'], [1e27, 'أوكتليون'], [1e24, 'سبتليون'],
    [1e21, 'سكستليون'], [1e18, 'كوينتليون'], [1e15, 'كوادريليون'], [1e12, 'تريليون'],
    [1e9, 'مليار'], [1e6, 'مليون']
  ];
  function commas(n) {
    var s = String(Math.floor(n));
    var out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return s + out;
  }
  function trim3(v) {
    // 3 significant digits, no trailing zeros: 1.20 -> 1.2, 12.0 -> 12
    var s = v >= 100 ? String(Math.floor(v)) : v >= 10 ? (Math.floor(v * 10) / 10).toFixed(1) : (Math.floor(v * 100) / 100).toFixed(2);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  // Whole numbers (pizza counts, costs).
  PZ.fmt = function (n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + PZ.fmt(-n);
    if (n < 1e6) return commas(n);
    for (var i = 0; i < WORDS.length; i++) {
      if (n >= WORDS[i][0]) {
        if (i === 0 && n >= 1e36) return (n / 1e33).toExponential(2).replace('e+', 'e') + ' ' + WORDS[0][1];
        return trim3(n / WORDS[i][0]) + ' ' + WORDS[i][1];
      }
    }
    return commas(n);
  };
  // Rates (can be fractional below 100).
  PZ.fmtRate = function (n) {
    if (n <= 0) return '0';
    if (n < 10) return (Math.round(n * 10) / 10).toString();
    if (n < 100) return (Math.round(n * 10) / 10).toString();
    return PZ.fmt(n);
  };

  /* ---------------------------------------------------------- buildings */
  // cost = base * 1.15^owned
  PZ.COST_SCALE = 1.15;
  PZ.BUILDINGS = [
    { name: 'طاهي البيتزا', cost: 15, pps: 0.2, desc: 'يعجن العجين ويغنّي بصوت عالٍ.' },
    { name: 'فرن الحطب', cost: 100, pps: 1.4, desc: 'ساخن جدًا! يخبز البيتزا في لمح البصر.' },
    { name: 'سكوتر التوصيل', cost: 900, pps: 9, desc: 'يوصل البيتزا ساخنة قبل أن تبرد!' },
    { name: 'شاحنة الطعام', cost: 7000, pps: 55, desc: 'مطبخ على عجلات يبيع البيتزا في كل شارع.' },
    { name: 'مطعم البيتزا', cost: 55000, pps: 340, desc: 'طاولات مربّعة وجبنة ممطوطة في كل مكان!' },
    { name: 'مصنع البيتزا', cost: 450000, pps: 2100, desc: 'آلات عملاقة تصنع البيتزا ليلًا ونهارًا.' },
    { name: 'منطاد البيتزا', cost: 3.8e6, pps: 13000, desc: 'يُسقط البيتزا بالمظلات من السماء!' },
    { name: 'قاعدة القمر', cost: 33e6, pps: 85000, desc: 'البيتزا هنا تطفو... أمسكها قبل أن تطير!' },
    { name: 'بوابة البيتزا', cost: 300e6, pps: 580000, desc: 'تجلب البيتزا من عالم آخر كله جبنة!' },
    { name: 'مجرة البيتزا', cost: 2.8e9, pps: 4e6, desc: 'نجوم من الببروني وكواكب من الجبن!' }
  ];
  PZ.buildCost = function (i, owned, n) {
    var b = PZ.BUILDINGS[i].cost, r = PZ.COST_SCALE;
    n = n || 1;
    // geometric series: b*r^owned*(r^n - 1)/(r - 1)
    return Math.ceil(b * Math.pow(r, owned) * (Math.pow(r, n) - 1) / (r - 1));
  };

  /* ----------------------------------------------------------- upgrades */
  var TIER_AT = [1, 10, 25, 50, 100];
  var TIER_COST = [10, 50, 500, 50000, 5e6];
  var TIER_NAMES = [
    ['قبعة الطاهي الطويلة', 'عصا العجين السحرية', 'مريلة الأبطال', 'حذاء الطاهي الصاروخي', 'طهاة بأربع أيادٍ'],
    ['حطب الزيتون', 'فرن بفتحتين', 'النار الزرقاء', 'فرن بحجم بيت', 'فرن التنين اللطيف'],
    ['خوذة لامعة', 'عجلات سريعة', 'صندوق حراري', 'سكوتر نفّاث', 'سكوتر طائر'],
    ['بوق موسيقي', 'مكيّف بارد', 'شاحنة بطابقين', 'محرك توربو', 'شاحنة عملاقة'],
    ['مفارش مربّعة', 'لافتة مضيئة', 'ملعب للأطفال', 'مطعم بحديقة', 'ناطحة سحاب البيتزا'],
    ['سير متحرك', 'ذراع آلية', 'روبوت الصلصة', 'مصنع ذكي', 'مصنع بحجم مدينة'],
    ['مظلات ملوّنة', 'مراوح إضافية', 'منطاد مزدوج', 'أسطول المناطيد', 'منطاد بحجم غيمة'],
    ['جبنة القمر', 'صواريخ التوصيل', 'بدلات فضاء', 'مزرعة طماطم فضائية', 'مدينة على القمر'],
    ['بوابة ملوّنة', 'مفتاح الأبعاد', 'دوّامة الجبن', 'بوابات كثيرة', 'بوابة لا نهائية'],
    ['نجم الببروني', 'كوكب الجبن', 'ثقب الصلصة', 'مجرة ثانية', 'كون البيتزا']
  ];

  var U = [];
  PZ.BUILDINGS.forEach(function (b, i) {
    TIER_AT.forEach(function (at, t) {
      U.push({
        id: 'b' + i + '_' + t, kind: 'b', b: i, tier: t,
        name: TIER_NAMES[i][t],
        desc: 'ضِعف إنتاج «' + b.name + '»!',
        cost: b.cost * TIER_COST[t],
        cond: function (S) { return S.owned[i] >= at; }
      });
    });
  });
  // clicking
  U.push({ id: 'c0', kind: 'click', val: 2, tier: 0, name: 'أصابع سريعة', desc: 'ضِعف قوة النقرة!', cost: 100, cond: function (S) { return S.clicks >= 15; } });
  U.push({ id: 'c1', kind: 'click', val: 2, tier: 1, name: 'قفازات العجين', desc: 'ضِعف قوة النقرة!', cost: 800, cond: function (S) { return S.handBaked >= 300; } });
  U.push({ id: 'c2', kind: 'click', val: 2, tier: 2, name: 'يدان ذهبيتان', desc: 'ضِعف قوة النقرة!', cost: 12000, cond: function (S) { return S.handBaked >= 4000; } });
  U.push({ id: 'c3', kind: 'pct', val: 0.01, tier: 3, name: 'لمسة الشيف', desc: 'كل نقرة تعطي أيضًا 1% من إنتاجك في الثانية', cost: 60000, cond: function (S) { return S.handBaked >= 20000; } });
  U.push({ id: 'c4', kind: 'pct', val: 0.01, tier: 4, name: 'نقرة الصاروخ', desc: 'كل نقرة تعطي 1% إضافية من إنتاجك في الثانية', cost: 5e6, cond: function (S) { return S.handBaked >= 1e6; } });
  U.push({ id: 'c5', kind: 'pct', val: 0.01, tier: 5, name: 'نقرة النيزك', desc: 'كل نقرة تعطي 1% إضافية من إنتاجك في الثانية', cost: 5e8, cond: function (S) { return S.handBaked >= 1e8; } });
  U.push({ id: 'c6', kind: 'pct', val: 0.01, tier: 6, name: 'نقرة المجرة', desc: 'كل نقرة تعطي 1% إضافية من إنتاجك في الثانية', cost: 5e10, cond: function (S) { return S.handBaked >= 1e10; } });
  // flavours: global multipliers
  var FLAV = [
    ['صلصة الطماطم السرية', 0.10, 3000, 1000],
    ['جبنة ممطوطة', 0.10, 40000, 15000],
    ['زيت الزيتون الذهبي', 0.15, 5e5, 1.5e5],
    ['ريحان سحري', 0.15, 6e6, 2e6],
    ['فلفل ناري', 0.20, 8e7, 2.5e7],
    ['عجينة القمر', 0.20, 1e9, 3e8],
    ['جبنة النجوم', 0.25, 1.5e10, 5e9],
    ['صلصة المجرة', 0.25, 2e11, 6e10],
    ['توابل الكون', 0.30, 3e12, 1e12]
  ];
  FLAV.forEach(function (f, i) {
    U.push({
      id: 'f' + i, kind: 'flav', tier: i, val: f[1], name: f[0],
      desc: 'كل الإنتاج <bdi dir="ltr">+' + Math.round(f[1] * 100) + '%</bdi>', cost: f[2],
      cond: function (S) { return S.runBaked >= f[3]; }
    });
  });
  U.push({ id: 'g0', kind: 'gold', tier: 0, name: 'أوريغانو الحظ', desc: 'البيتزا الذهبية تظهر أسرع مرتين', cost: 7777, cond: function (S) { return S.golden >= 2; } });
  U.push({ id: 'g1', kind: 'gold', tier: 1, name: 'بريق طويل', desc: 'مفعول البيتزا الذهبية يدوم ضعف الوقت', cost: 77777, cond: function (S) { return S.golden >= 5; } });
  U.push({ id: 'g2', kind: 'gold', tier: 2, name: 'بيتزا كسولة', desc: 'البيتزا الذهبية تبقى على الشاشة ضعف الوقت', cost: 777777, cond: function (S) { return S.golden >= 10; } });
  U.push({ id: 'a0', kind: 'ach', tier: 0, name: 'رف الكؤوس', desc: 'كل كأس تعطي <bdi dir="ltr">+1%</bdi> إنتاج إضافي', cost: 50000, cond: function (S) { return S.achCount >= 10; } });
  U.push({ id: 'a1', kind: 'ach', tier: 1, name: 'خزانة الجوائز', desc: 'كل كأس تعطي <bdi dir="ltr">+1%</bdi> إنتاج إضافي', cost: 5e7, cond: function (S) { return S.achCount >= 25; } });
  U.push({ id: 'a2', kind: 'ach', tier: 2, name: 'متحف الجوائز', desc: 'كل كأس تعطي <bdi dir="ltr">+1%</bdi> إنتاج إضافي', cost: 5e10, cond: function (S) { return S.achCount >= 45; } });
  PZ.UPGRADES = U;
  PZ.UPG = {};
  U.forEach(function (u) { PZ.UPG[u.id] = u; });

  /* ------------------------------------------------------ achievements */
  var A = [];
  function ach(id, name, desc, cond, prog, goal) { A.push({ id: id, name: name, desc: desc, cond: cond, prog: prog || null, goal: !!goal }); }
  var BAKED = [
    [1, 'أول بيتزا'], [100, 'جائع قليلًا'], [1000, 'مطبخ مشغول'], [1e4, 'رائحة لذيذة'], [1e5, 'حيّ البيتزا'],
    [1e6, 'مليونير البيتزا'], [1e7, 'مدينة البيتزا'], [1e8, 'دولة البيتزا'], [1e9, 'قارة البيتزا'],
    [1e10, 'كوكب البيتزا'], [1e11, 'نجم البيتزا'], [1e12, 'أسطورة الكون'], [1e13, 'ما بعد الكون!']
  ];
  BAKED.forEach(function (b) {
    ach('bk' + b[0], b[1], b[0] === 1 ? 'اصنع أول بيتزا لك' : 'اصنع ' + PZ.fmt(b[0]).replace(/^1 /, '') + ' بيتزا', function (S) { return S.lifetime >= b[0]; },
      function (S) { return S.lifetime / b[0]; }, true);
  });
  var PPS = [
    [1, 'بداية الإنتاج'], [10, 'الفرن يعمل'], [100, 'خط الإنتاج'], [1000, 'آلة البيتزا'], [1e4, 'إعصار البيتزا'],
    [1e5, 'طوفان البيتزا'], [1e6, 'بركان الجبن'], [1e7, 'انفجار كوني']
  ];
  PPS.forEach(function (p) {
    ach('ps' + p[0], p[1], p[0] === 1 ? 'اصنع بيتزا واحدة في الثانية' : 'اصنع ' + PZ.fmt(p[0]).replace(/^1 /, '') + ' بيتزا في الثانية', function (S) { return S.ppsBase >= p[0]; },
      function (S) { return S.ppsBase / p[0]; }, true);
  });
  [[100, 'إصبع نشيط'], [1000, 'إصبع حديدي'], [5000, 'إصبع صاروخي'], [15000, 'إصبع أسطوري']].forEach(function (c) {
    ach('cl' + c[0], c[1], 'انقر على البيتزا ' + PZ.fmt(c[0]) + ' مرة', function (S) { return S.clicks >= c[0]; },
      function (S) { return S.clicks / c[0]; }, c[0] <= 1000);
  });
  ach('hand1m', 'يد من ذهب', 'اصنع مليون بيتزا بالنقر وحده', function (S) { return S.handBaked >= 1e6; }, function (S) { return S.handBaked / 1e6; });
  var FIRST = ['مرحبًا يا شيف!', 'النار مشتعلة', 'بيب بيب!', 'على الطريق', 'افتتاح كبير', 'بيتزا بالجملة', 'في السماء', 'خطوة على القمر', 'عبر الأبعاد', 'سيّد المجرات'];
  var FIFTY = ['جيش الطهاة', 'غابة الأفران', 'سرب السكوترات', 'موكب الشاحنات', 'سلسلة مطاعم', 'منطقة صناعية', 'أسطول السماء', 'مستعمرة القمر', 'متاهة البوابات', 'عنقود المجرات'];
  PZ.BUILDINGS.forEach(function (b, i) {
    ach('own1_' + i, FIRST[i], 'اشترِ أول «' + b.name + '»', function (S) { return S.owned[i] >= 1; },
      function (S) { return S.pizzas / PZ.buildCost(i, 0, 1); }, true);
  });
  PZ.BUILDINGS.forEach(function (b, i) {
    ach('own50_' + i, FIFTY[i], 'امتلك 50 من «' + b.name + '»', function (S) { return S.owned[i] >= 50; },
      function (S) { return S.owned[i] / 50; });
  });
  [[10, 'شركة ناشئة'], [50, 'شركة كبيرة'], [100, 'إمبراطورية'], [250, 'إمبراطورية عظمى'], [500, 'ملك البيتزا']].forEach(function (t) {
    ach('tot' + t[0], t[1], 'امتلك ' + t[0] + (t[0] <= 10 ? ' مبانٍ' : ' مبنى'), function (S) { return S.totalOwned >= t[0]; },
      function (S) { return S.totalOwned / t[0]; }, true);
  });
  [[1, 'بريق ذهبي'], [7, 'صيّاد الذهب'], [27, 'مغناطيس الذهب'], [77, 'ملك الحظ']].forEach(function (g) {
    ach('gold' + g[0], g[1], g[0] === 1 ? 'انقر على بيتزا ذهبية' : 'انقر على ' + g[0] + ' بيتزا ذهبية', function (S) { return S.golden >= g[0]; },
      function (S) { return S.golden / g[0]; });
  });
  [[1, 'بداية جديدة'], [3, 'لا يتوقف أبدًا'], [10, 'خالد']].forEach(function (r) {
    ach('reb' + r[0], r[1], r[0] === 1 ? 'قُم بأول انطلاقة ذهبية' : 'قُم بـ ' + r[0] + ' انطلاقات ذهبية', function (S) { return S.rebirths >= r[0]; });
  });
  [[5, 'متطوّر'], [20, 'مخترع'], [50, 'عبقري']].forEach(function (u) {
    ach('up' + u[0], u[1], 'اشترِ ' + u[0] + (u[0] <= 10 ? ' ترقيات' : ' ترقية'), function (S) { return S.upCount >= u[0]; },
      function (S) { return S.upCount / u[0]; }, u[0] <= 20);
  });
  ach('combo50', 'نقر سريع', 'انقر 50 مرة متتالية بسرعة', function (S) { return S.bestCombo >= 50; }, function (S) { return S.bestCombo / 50; });
  ach('combo150', 'إعصار النقر', 'انقر 150 مرة متتالية بسرعة', function (S) { return S.bestCombo >= 150; });
  ach('rain20', 'مطر البيتزا', 'التقط 20 بيتزا من المطر الذهبي', function (S) { return S.rainCaught >= 20; });
  ach('skin', 'ذوق رفيع', 'غيّر شكل البيتزا', function (S) { return S.skinChanged; });
  ach('away', 'نوم عميق', 'اجمع بيتزا صنعها طهاتك أثناء غيابك', function (S) { return S.awayCollected; });
  PZ.ACHIEVEMENTS = A;
  PZ.ACH = {};
  A.forEach(function (a) { PZ.ACH[a.id] = a; });

  /* -------------------------------------------------------------- skins */
  // top: topping style drawn by art.js
  PZ.SKINS = [
    { id: 'classic', name: 'مارغريتا', top: 'basil', sauce: '#e0402a', cheese: '#ffd766', crust: '#e59a3c', parts: ['#e0402a', '#ffd766', '#3aa845', '#fff1b8'], need: 'متاحة من البداية', cond: function () { return true; } },
    { id: 'pepperoni', name: 'ببروني', top: 'pepperoni', sauce: '#e0402a', cheese: '#ffd25e', crust: '#e0923a', parts: ['#c7302a', '#ffd25e', '#a8231d'], need: 'اصنع 1,000 بيتزا', cond: function (S) { return S.lifetime >= 1000; } },
    { id: 'veggie', name: 'خضار', top: 'veggie', sauce: '#e0402a', cheese: '#ffe07a', crust: '#e39a45', parts: ['#3aa845', '#ffcf2e', '#e0402a', '#7b3fa0'], need: 'امتلك 25 مبنى', cond: function (S) { return S.totalOwned >= 25 || S.skins.veggie; } },
    { id: 'pineapple', name: 'أناناس', top: 'pineapple', sauce: '#e0402a', cheese: '#ffe07a', crust: '#e59a3c', parts: ['#ffd43b', '#ff8fa3', '#ffe07a'], need: 'اصنع 100,000 بيتزا', cond: function (S) { return S.lifetime >= 1e5; } },
    { id: 'cheese', name: 'جبنة رباعية', top: 'cheese', sauce: '#f2a33a', cheese: '#ffe066', crust: '#e0923a', parts: ['#ffe066', '#fff4c2', '#ffc93c'], need: 'انقر 1,000 مرة', cond: function (S) { return S.clicks >= 1000; } },
    { id: 'choco', name: 'شوكولاتة', top: 'sprinkles', sauce: '#6b3a1f', cheese: '#8a4b25', crust: '#d99a55', parts: ['#ff5fa2', '#4fc3f7', '#ffd43b', '#7ee081', '#6b3a1f'], need: 'اصنع 10 مليون بيتزا', cond: function (S) { return S.lifetime >= 1e7; } },
    { id: 'rainbow', name: 'قوس قزح', top: 'rainbow', sauce: '#ff5a5f', cheese: '#fff1b8', crust: '#f0a94a', parts: ['#ff5a5f', '#ffb13b', '#ffe14d', '#5fd35f', '#4fa3ff', '#b36bff'], need: 'انقر على 7 بيتزا ذهبية', cond: function (S) { return S.golden >= 7; } },
    { id: 'gold', name: 'ذهبية', top: 'gold', sauce: '#ffb300', cheese: '#ffe680', crust: '#d9a21b', parts: ['#ffd700', '#fff3a0', '#ffb300'], need: 'قُم بأول انطلاقة ذهبية', cond: function (S) { return S.rebirths >= 1; } },
    { id: 'galaxy', name: 'مجرّيّة', top: 'stars', sauce: '#5b2bb5', cheese: '#8a55e6', crust: '#3b2a78', parts: ['#ffffff', '#ffe14d', '#b58cff', '#6fd3ff'], need: 'اشترِ أول مجرة بيتزا', cond: function (S) { return S.owned[9] >= 1 || S.skins.galaxy; } },
    { id: 'melon', name: 'بطيخ', top: 'melon', sauce: '#ff4d6d', cheese: '#ff6b81', crust: '#3cb44b', parts: ['#ff4d6d', '#2b2b2b', '#3cb44b'], need: 'قُم بـ 3 انطلاقات ذهبية', cond: function (S) { return S.rebirths >= 3; } }
  ];
  PZ.SKIN = {};
  PZ.SKINS.forEach(function (s) { PZ.SKIN[s.id] = s; });

  /* --------------------------------------------------------------- news */
  // [min building index owned (-1 = always), text]
  PZ.NEWS = [
    [-1, 'عاجل: طفل يصنع بيتزا بنقرة واحدة! الجيران في حيرة.'],
    [-1, 'قطة الحي تجلس أمام الباب وتنتظر قطعة بيتزا بصبر.'],
    [-1, 'نصيحة: انقر على البيتزا الذهبية بسرعة قبل أن تختفي!'],
    [-1, 'نصيحة: الترقيات تضاعف إنتاج مبانيك. لا تنسَها!'],
    [-1, 'إشاعة: البيتزا الذهبية تجلب الحظ... وأحيانًا تمطر بيتزا!'],
    [0, 'الطهاة يطالبون بقبعات أطول... وأطول!'],
    [0, 'طاهٍ يرمي العجين عاليًا جدًا فيعلق في السقف!'],
    [1, 'فرن الحطب يغنّي من شدة الحرارة: "بيتزا بيتزا!"'],
    [1, 'خبراء يؤكدون: البيتزا الساخنة ألذ من الباردة.'],
    [2, 'سكوتر التوصيل يسبق سيارة سباق في الشارع!'],
    [2, 'زبون مندهش: "وصلت البيتزا قبل أن أطلبها!"'],
    [3, 'شاحنة الطعام تسبب زحامًا طويلًا من الجائعين.'],
    [4, 'مطعم بيتزا جديد يفتح أبوابه كل خمس دقائق!'],
    [5, 'المصنع يصنع بيتزا بحجم ملعب كرة قدم.'],
    [6, 'السماء تمطر بيتزا اليوم! لا تنسَ مظلتك.'],
    [6, 'الطيور مندهشة من المناطيد اللذيذة.'],
    [7, 'رواد الفضاء يطلبون بيتزا بجبنة القمر.'],
    [8, 'كائنات لطيفة من عالم آخر تطلب ببروني إضافيًا.'],
    [9, 'علماء: درب التبانة مصنوع من الجبنة الذائبة!'],
    [9, 'كل النجوم في السماء تريد قطعة من بيتزاك.']
  ];

  /* ------------------------------------------------------------- prestige */
  PZ.REBIRTH_MIN = 1e7;         // pizzas baked this run before a rebirth is allowed
  PZ.CRUST_BONUS = 0.10;        // +10% production per golden crust
  PZ.crustsFor = function (lifetime) { return Math.floor(1.5 * Math.cbrt(Math.max(0, lifetime) / 1e6) + 1e-9); };

  root.PZ = PZ;
})(typeof window !== 'undefined' ? window : globalThis);
