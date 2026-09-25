/* Snake Arena — static data: skins, eyes, names, unlock rules. */
(function () {
  'use strict';
  var SA = window.SA = window.SA || {};

  // Unlock requirement text for each stat (Arabic, numbers stay Western).
  var REQ_TEXT = {
    bestLen: function (v) { return 'اوصل إلى الطول ' + v; },
    totalKills: function (v) { return 'أطِح بـ ' + v + ' ثعابين (مجموع)'; },
    bestKills: function (v) { return 'أطِح بـ ' + v + ' ثعابين في جولة واحدة'; },
    games: function (v) { return 'العب ' + v + ' جولات'; },
    totalFood: function (v) { return 'كُل ' + v + ' حبة طعام (مجموع)'; },
    bestTime: function (v) { return 'اصمد ' + Math.round(v / 60) + ' دقائق في جولة'; },
    bestRank: function () { return 'كن الأول في لوحة المتصدرين'; },
    powerups: function (v) { return 'اجمع ' + v + ' قوى خارقة (مجموع)'; },
    top1Time: function (v) { return 'ابقَ في المركز الأول ' + v + ' ثانية'; }
  };
  SA.reqText = function (req) { return req ? REQ_TEXT[req.stat](req.v) : ''; };

  // Progress (0..1) toward a requirement from a stats object.
  SA.reqProgress = function (req, st) {
    if (!req) return 1;
    if (req.stat === 'bestRank') return st.bestRank === 1 ? 1 : (st.bestRank ? Math.min(0.95, 1 / st.bestRank) : 0);
    return Math.min(1, (st[req.stat] || 0) / req.v);
  };
  SA.reqMet = function (req, st) { return SA.reqProgress(req, st) >= 1; };

  // band = points per colour stripe for a small snake (grows with thickness).
  SA.SKINS = [
    { id: 'lime', name: 'ليموني', colors: ['#8dff3a', '#4fd21a'], band: 4 },
    { id: 'berry', name: 'فراولة', colors: ['#ff3b6b', '#ff9ab5'], band: 4 },
    { id: 'wave', name: 'موجة', colors: ['#1fb3ff', '#8be6ff'], band: 4 },
    { id: 'sunny', name: 'شمسي', colors: ['#ffd23f', '#ff9f1c'], band: 3, req: { stat: 'games', v: 2 } },
    { id: 'grape', name: 'عنب', colors: ['#9b5cff', '#d1b3ff'], band: 3, req: { stat: 'bestLen', v: 100 } },
    { id: 'candy', name: 'حلوى', colors: ['#ff5fb0', '#ffffff'], band: 2, req: { stat: 'bestLen', v: 200 } },
    { id: 'bee', name: 'نحلة', colors: ['#ffd400', '#ffd400', '#2e2a26'], band: 3, req: { stat: 'totalKills', v: 3 } },
    { id: 'melon', name: 'بطيخ', colors: ['#3fdc5a', '#1c8c3a'], band: 5, req: { stat: 'totalFood', v: 800 } },
    { id: 'tiger', name: 'نمر', colors: ['#ff8a00', '#ff8a00', '#ff8a00', '#2a1a10'], band: 2, req: { stat: 'bestKills', v: 3 } },
    { id: 'mint', name: 'نعناع', colors: ['#4dffc3', '#e9fff8'], band: 3, req: { stat: 'games', v: 5 } },
    { id: 'lava', name: 'حمم', colors: ['#ff2e00', '#ff7a00', '#ffd000', '#ff7a00'], band: 3, req: { stat: 'bestLen', v: 400 } },
    { id: 'ice', name: 'ثلجي', colors: ['#e6f8ff', '#8fd6ff', '#bfeaff'], band: 3, sparkle: true, req: { stat: 'bestTime', v: 180 } },
    { id: 'panda', name: 'باندا', colors: ['#ffffff', '#ffffff', '#2b2b33'], band: 3, req: { stat: 'totalKills', v: 10 } },
    { id: 'ladybug', name: 'دعسوقة', colors: ['#ff2a2a'], band: 4, dots: '#1c1010', req: { stat: 'powerups', v: 6 } },
    { id: 'rainbow', name: 'قوس قزح', rainbow: true, band: 2, req: { stat: 'bestLen', v: 700 } },
    { id: 'galaxy', name: 'مجرة', colors: ['#3a1580', '#5b27c2', '#2a0f66'], band: 4, sparkle: true, req: { stat: 'bestRank', v: 1 } },
    { id: 'neon', name: 'نيون', colors: ['#39ff14', '#ff2bd6'], band: 3, glow: true, req: { stat: 'totalFood', v: 4000 } },
    { id: 'gold', name: 'ذهبي', colors: ['#ffd700', '#ffb300', '#fff0a0'], band: 3, sparkle: true, req: { stat: 'bestLen', v: 1200 } },
    { id: 'king', name: 'ملك الساحة', colors: ['#7a1fff', '#7a1fff', '#ffcc00'], band: 3, crown: true, req: { stat: 'top1Time', v: 60 } },
    { id: 'ghost', name: 'شبح لطيف', colors: ['#eef3ff', '#cfdcff'], band: 4, ghost: true, req: { stat: 'totalKills', v: 30 } },
    { id: 'dragon', name: 'تنين', colors: ['#00c26e', '#008a4d', '#ffcf33'], band: 3, glow: true, req: { stat: 'bestLen', v: 2000 } }
  ];

  SA.EYES = [
    { id: 'round', name: 'عادية' },
    { id: 'googly', name: 'مجنونة' },
    { id: 'happy', name: 'سعيدة', req: { stat: 'games', v: 3 } },
    { id: 'angry', name: 'غاضبة', req: { stat: 'totalKills', v: 5 } },
    { id: 'cool', name: 'نظارة', req: { stat: 'bestLen', v: 300 } },
    { id: 'cyclops', name: 'عين واحدة', req: { stat: 'bestKills', v: 5 } },
    { id: 'star', name: 'نجوم', req: { stat: 'bestRank', v: 1 } }
  ];

  // Silly, kid-friendly bot names.
  SA.BOT_NAMES = [
    'ملك المعكرونة', 'سير متلوّي', 'سباغيتي', 'دودة الكعك', 'بسكويت', 'زلزول', 'فطيرة',
    'حلزون سريع', 'مخلل', 'كعكة', 'قرقور', 'شوربة', 'بطاطس', 'نودلز', 'ملفوف', 'فلافل',
    'مربّى', 'لولب', 'زيغ زاغ', 'كنافة', 'بلبول', 'نونو', 'شعيرية', 'الكابتن لفّة', 'دودو',
    'مشمش', 'فستق', 'قطايف', 'جيلي', 'بوبو', 'تفاحة', 'شاورما', 'بقلاوة', 'سوسو', 'ملوخية',
    'فشار', 'زعتر', 'كرواسون', 'مكرونة', 'بطبوط'
  ];
  SA.PLAYER_NAMES = [
    'البطل', 'صاروخ', 'نمنم', 'البرق', 'الزعيم', 'نجمة', 'فهد', 'سهم', 'شهاب', 'دوّامة',
    'النمر الصغير', 'كابتن', 'الإعصار', 'قمر', 'ماسة', 'بطوط الشجاع'
  ];

  // Bright food colours.
  SA.FOOD_COLORS = ['#ff4d6d', '#ffb703', '#8aff3a', '#3ad7ff', '#b06bff', '#ff7ae0', '#ffe14d', '#4dffb8', '#ff8a3d', '#6d8bff'];

  SA.POWERS = [
    { id: 'magnet', name: 'مغناطيس!', color: '#ff4d6d', dur: 12 },
    { id: 'double', name: 'نمو مضاعف!', color: '#ffd23f', dur: 12 },
    { id: 'turbo', name: 'تسريع مجاني!', color: '#3ad7ff', dur: 8 }
  ];
})();
