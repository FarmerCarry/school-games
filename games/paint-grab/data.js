/* Paint Grab (لوّن الأرض) — static data: arenas, skins, bot names. */
(function () {
  'use strict';
  var PG = window.PG = window.PG || {};

  // Map + match constants
  PG.N = 150;              // grid cells per side
  PG.CS = 16;              // world pixels per cell
  PG.MATCH_TIME = 180;     // seconds
  PG.BASE_SPEED = 8.4;     // cells per second
  PG.PLAYER_TURN = 9.5;    // radians per second

  // Arenas: a real difficulty curve. Stars: [goal1 %, goal2 %, finish #1].
  PG.ARENAS = [
    { name: 'حديقة الحلوى', short: 'الحلوى', goals: [5, 12],
      bot: { speed: 0.80, turn: 5.2, smart: 0.30, opp: 0.10, hunters: 0, huntPlayer: 0.0, notice: 2.2, greed: 0.75 },
      theme: { bg: '#f2fff8', grid: '#e1f7ec', out: '#8fe0bd', out2: '#79d3ab', rim: '#4fbf8f', deco: '#ffffff', card: 'linear-gradient(160deg,#b8f5d9,#6fd8a9)' } },
    { name: 'شاطئ المثلجات', short: 'الشاطئ', goals: [7, 16],
      bot: { speed: 0.86, turn: 5.8, smart: 0.50, opp: 0.25, hunters: 1, huntPlayer: 0.25, notice: 1.6, greed: 0.9 },
      theme: { bg: '#fffaf0', grid: '#fbeed6', out: '#6fd0f5', out2: '#5cc2ea', rim: '#f2b35c', deco: '#ffffff', card: 'linear-gradient(160deg,#ffe9b8,#6fd0f5)' } },
    { name: 'غابة الفطر', short: 'الغابة', goals: [9, 20],
      bot: { speed: 0.92, turn: 6.4, smart: 0.66, opp: 0.40, hunters: 2, huntPlayer: 0.4, notice: 1.2, greed: 1.0 },
      theme: { bg: '#f7fbee', grid: '#eaf3d8', out: '#8cc96a', out2: '#7aba58', rim: '#c9824f', deco: '#ffffff', card: 'linear-gradient(160deg,#d7f5b0,#8cc96a)' } },
    { name: 'جزيرة البالونات', short: 'البالونات', goals: [11, 24],
      bot: { speed: 0.96, turn: 7.0, smart: 0.80, opp: 0.55, hunters: 2, huntPlayer: 0.55, notice: 0.9, greed: 1.1 },
      theme: { bg: '#f3f8ff', grid: '#e2ecfb', out: '#8fb4ff', out2: '#7ca5f7', rim: '#ff8fb8', deco: '#ffffff', card: 'linear-gradient(160deg,#d6e6ff,#ff9ec5)' } },
    { name: 'قلعة الغيوم', short: 'القلعة', goals: [13, 28],
      bot: { speed: 1.0, turn: 7.6, smart: 0.92, opp: 0.70, hunters: 3, huntPlayer: 0.65, notice: 0.6, greed: 1.2 },
      theme: { bg: '#faf5ff', grid: '#efe5fb', out: '#b79cff', out2: '#a88bf5', rim: '#ffd23f', deco: '#ffffff', card: 'linear-gradient(160deg,#eadcff,#b79cff)' } }
  ];

  // Unlock requirement text
  PG.reqText = function (r) {
    if (!r) return '';
    switch (r.t) {
      case 'best': return 'لوّن ' + r.v + '% في جولة واحدة';
      case 'kills': return 'أقصِ ' + r.v + ' روبوتات (المجموع)';
      case 'stars': return 'اجمع ' + r.v + ' نجوم';
      case 'rounds': return 'العب ' + r.v + ' جولات';
      case 'wins': return r.v === 1 ? 'احصل على المركز الأول مرة' : 'احصل على المركز الأول ' + r.v + ' مرات';
    }
    return '';
  };

  // Colors (hex). special: 'rainbow' / 'gold'
  PG.COLORS = [
    { name: 'وردي', hex: '#ff6fae' },
    { name: 'سماوي', hex: '#45c1ff' },
    { name: 'نعناعي', hex: '#34d994' },
    { name: 'ليموني', hex: '#ffcf33' },
    { name: 'عنبي', hex: '#a77bff', req: { t: 'rounds', v: 2 } },
    { name: 'برتقالي', hex: '#ff9444', req: { t: 'best', v: 5 } },
    { name: 'مرجاني', hex: '#ff5b6e', req: { t: 'kills', v: 2 } },
    { name: 'تفاحي', hex: '#8ed63f', req: { t: 'best', v: 8 } },
    { name: 'فيروزي', hex: '#22cfc3', req: { t: 'stars', v: 3 } },
    { name: 'بنفسجي', hex: '#e27bff', req: { t: 'best', v: 12 } },
    { name: 'أزرق', hex: '#5b7cff', req: { t: 'kills', v: 8 } },
    { name: 'كراميل', hex: '#e0a060', req: { t: 'rounds', v: 10 } },
    { name: 'قوس قزح', hex: '#ff6fae', special: 'rainbow', req: { t: 'best', v: 30 } },
    { name: 'ذهبي', hex: '#ffc21a', special: 'gold', req: { t: 'wins', v: 3 } }
  ];
  PG.BOT_COLORS = 12; // bots only use the first 12 plain colors

  PG.FACES = [
    { id: 'classic', name: 'بسيط' },
    { id: 'happy', name: 'سعيد' },
    { id: 'cool', name: 'نظارة', req: { t: 'best', v: 4 } },
    { id: 'cat', name: 'قطة', req: { t: 'kills', v: 1 } },
    { id: 'stars', name: 'نجوم', req: { t: 'stars', v: 2 } },
    { id: 'tongue', name: 'مشاكس', req: { t: 'rounds', v: 3 } },
    { id: 'hearts', name: 'قلوب', req: { t: 'best', v: 10 } },
    { id: 'crown', name: 'ملك', req: { t: 'wins', v: 1 } },
    { id: 'ninja', name: 'نينجا', req: { t: 'kills', v: 10 } },
    { id: 'robot', name: 'روبوت', req: { t: 'best', v: 18 } },
    { id: 'alien', name: 'فضائي', req: { t: 'stars', v: 8 } },
    { id: 'bunny', name: 'أرنب', req: { t: 'rounds', v: 8 } }
  ];

  PG.PATTERNS = [
    { id: 'plain', name: 'سادة' },
    { id: 'checker', name: 'مربعات', req: { t: 'rounds', v: 1 } },
    { id: 'stripes', name: 'خطوط', req: { t: 'best', v: 6 } },
    { id: 'dots', name: 'نقاط', req: { t: 'kills', v: 5 } },
    { id: 'tiles', name: 'بلاط', req: { t: 'stars', v: 5 } },
    { id: 'bricks', name: 'طوب', req: { t: 'best', v: 15 } },
    { id: 'zigzag', name: 'متعرج', req: { t: 'stars', v: 12 } }
  ];

  PG.BOT_NAMES = [
    'بطاطا', 'كعكة', 'زبدة', 'فستق', 'بسبوسة', 'كنافة', 'مشمش', 'فلفول', 'نونو', 'بطبوط',
    'ضفدوع', 'بوبو', 'قرقور', 'سمسم', 'لولو', 'دبدوب', 'كوكي', 'ليمونة', 'فراولة', 'جزرة',
    'قطقوط', 'بطيخة', 'توتة', 'فشفوش', 'زعرور', 'شمشم', 'فقاعة', 'مرشملو', 'بندورة', 'خيارة',
    'فوفو', 'كرنب', 'حلاوة', 'تمورة', 'بقدونس', 'زلابية'
  ];
})();
