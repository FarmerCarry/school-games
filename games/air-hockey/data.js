/* هوكي الهواء — Cyber-Mech & Laser Power-Puck content data (Arabic). */
(function () {
  'use strict';
  var AH = window.AH = window.AH || {};

  // 4 Cyber-Mech Robot Rivals — all unlocked immediately for shared classroom PCs!
  AH.BOTS = [
    { id: 'easy', name: 'فرفور الآلي', level: 'سهل', lvColor: '#3ddc84', color: '#42f58d', ring: '#128a43', mech: 'scout',
      coins: 15, naive: true, speed: 430, accel: 2450, react: 0.34, err: 148, attackMax: 390, lead: 0.2, bank: 0, depth: 96, hesitate: 0.52, strike: 0.95 },
    { id: 'medium', name: 'برق التيربو', level: 'متوسط', lvColor: '#ffd23f', color: '#ffdd40', ring: '#c78800', mech: 'turbo',
      coins: 25, speed: 720, accel: 4500, react: 0.16, err: 112, attackMax: 710, lead: 0.55, bank: 0.14, depth: 86, hesitate: 0.24, strike: 1.15 },
    { id: 'hard', name: 'صقر الليزر', level: 'بطل', lvColor: '#ff7a2f', color: '#ff8533', ring: '#c93b0b', mech: 'hawk',
      coins: 40, speed: 950, accel: 7100, react: 0.1, err: 90, attackMax: 1100, lead: 0.85, bank: 0.3, depth: 80, hesitate: 0.08, strike: 1.35 },
    { id: 'insane', name: 'التنين المدرّع', level: 'الزعيم', lvColor: '#ff3355', color: '#ff3b5c', ring: '#9e0e2b', mech: 'boss',
      coins: 65, speed: 1230, accel: 10800, react: 0.055, err: 74, attackMax: 1680, lead: 1, bank: 0.44, depth: 76, hesitate: 0, strike: 1.48 }
  ];

  // Cyber Armory: Mech Mallets (all purchasable with coins; gold/diamond also auto-unlock on boss wins!)
  AH.MALLETS = [
    { id: 'blue', name: 'درع السايبر', price: 0, kind: 'cyber', color: '#00d9ff', ring: '#0a5cd6' },
    { id: 'volt', name: 'صاعقة الفولت', price: 25, kind: 'volt', color: '#7cff2b', ring: '#1b943a' },
    { id: 'magma', name: 'قبضة البركان', price: 35, kind: 'magma', color: '#ff6a1a', ring: '#a81c07' },
    { id: 'plasma', name: 'نواة البلازما', price: 45, kind: 'galaxy', color: '#a855ff', ring: '#4b1db3' },
    { id: 'saw', name: 'التوربين القاطع', price: 60, kind: 'saw', color: '#ff3355', ring: '#8c142c' },
    { id: 'matrix', name: 'المخترق الرقمي', price: 75, kind: 'matrix', color: '#00ffa6', ring: '#076b4c' },
    { id: 'gold', name: 'المدرّعة الذهبية', price: 95, unlock: 'hard', kind: 'gold', color: '#ffd84a', ring: '#b88000' },
    { id: 'diamond', name: 'مفاعل الكريستال', price: 120, unlock: 'insane', kind: 'diamond', color: '#baf6ff', ring: '#1f8ec7' }
  ];

  // 4 Unlocked Cyber Arenas (price: 0 — selectable anytime on Title or in Armory).
  AH.TABLES = [
    { id: 'neon', name: 'ساحة الليزر', price: 0, bg1: '#0a1336', bg2: '#050716', s1: '#0f2756', s2: '#081534', line: '#00e5ff', mid: '#ff2f92', a: '#00d9ff', b: '#ff4d6d', dot: 'rgba(90,210,255,0.18)', grid: 'hex' },
    { id: 'lava', name: 'مفاعل الحمم', price: 0, bg1: '#260b08', bg2: '#0c0304', s1: '#3b130c', s2: '#1d0806', line: '#ff7a1f', mid: '#ffd23f', a: '#ff9a2e', b: '#ff3b47', dot: 'rgba(255,150,70,0.18)', grid: 'core' },
    { id: 'cyber', name: 'مصفوفة السايبر', price: 0, bg1: '#052119', bg2: '#020d0a', s1: '#0b3b2c', s2: '#062119', line: '#2bff88', mid: '#00e5ff', a: '#2bff88', b: '#ffb82e', dot: 'rgba(80,255,170,0.16)', grid: 'circuit' },
    { id: 'space', name: 'محطة المجرة', price: 0, bg1: '#140830', bg2: '#050214', s1: '#220e52', s2: '#0f0629', line: '#b86bff', mid: '#3cf2ff', a: '#3cf2ff', b: '#ff52a8', dot: 'rgba(195,150,255,0.16)', stars: true }
  ];

  // Laser Puck Skins & Comet Trails.
  AH.PUCKS = [
    { id: 'classic', name: 'نبض الليزر', price: 0, color: '#ffffff', core: '#00e5ff', trail: ['#00e5ff', '#8cf6ff'] },
    { id: 'fire', name: 'نيزك اللهب', price: 35, color: '#fff3d6', core: '#ff6a00', trail: ['#ffe033', '#ff7a18', '#ff2919'] },
    { id: 'frost', name: 'شظية الجليد', price: 45, color: '#eafcff', core: '#38c8ff', trail: ['#ffffff', '#94f2ff', '#2cb5ff'] },
    { id: 'volt', name: 'برق التيربو', price: 65, color: '#fffde0', core: '#7cff2b', trail: ['#fff36b', '#7cff2b', '#00e5ff'], bolt: true },
    { id: 'omega', name: 'طيف أوميغا', price: 90, color: '#ffffff', core: '#ff3385', trail: ['#ff3355', '#ff8a1f', '#ffe033', '#2bff88', '#00e5ff', '#b86bff'] }
  ];

  // Power-Up Capsules (ON by default!).
  AH.POWERS = [
    { id: 'fire', name: 'كرة اللهب!', color: '#ff6a00' },
    { id: 'multi', name: 'قرص إضافي!', color: '#ffd23f' },
    { id: 'big', name: 'مضرب عملاق!', color: '#2bff88' },
    { id: 'tiny', name: 'درع المرمى!', color: '#00e5ff' },
    { id: 'freeze', name: 'صعقة جليدية!', color: '#70f3ff' }
  ];

  // Trophy Hall Awards (+20 coins each).
  AH.AWARDS = [
    { id: 'goal1', name: 'أول هدف ليزري', desc: 'سجّل هدفك الأول في المرمى' },
    { id: 'win1', name: 'بطل الحلبة', desc: 'اربح أول مباراة ضد الآليين' },
    { id: 'clean', name: 'درع لا يُخترق', desc: 'اربح دون دخول أي هدف بمرماك' },
    { id: 'hat', name: 'ثلاثية الصاعقة', desc: 'سجّل 3 أهداف متتالية بلا رد' },
    { id: 'rocket', name: 'قذيفة خارقة', desc: 'سجّل ضربة بسرعة 110 كم/س أو أكثر' },
    { id: 'keeper', name: 'حارس الليزر', desc: 'تصدَّ لـ 5 تسديدات خطيرة في مباراة' },
    { id: 'comeback', name: 'عودة الأبطال', desc: 'اربح بعد تأخرك بـ 3 أهداف' },
    { id: 'beat_easy', name: 'مروّض فرفور', desc: 'اهزم فرفور الآلي (سهل)' },
    { id: 'beat_medium', name: 'كاسر التيربو', desc: 'اهزم برق التيربو (متوسط)' },
    { id: 'beat_hard', name: 'صائد الصقور', desc: 'اهزم صقر الليزر (بطل)' },
    { id: 'beat_insane', name: 'قاهر الزعيم', desc: 'اهزم التنين المدرّع (الزعيم)' },
    { id: 'chaos', name: 'سيّد أقراص القوة', desc: 'اربح مباراة مع تفعيل أقراص القوة' },
    { id: 'friends', name: 'تحدي الصديقين', desc: 'العب مباراة لاعبين على نفس الجهاز' },
    { id: 'shopper', name: 'مهندس الترسانة', desc: 'افتح 3 معدات من الترسانة' }
  ];
  AH.AWARD_COINS = 20;

  AH.WORDS = {
    goal: ['هدف ليزري!', 'قذيفة في الشباك!', 'هدف ساحق!', 'ضربة معلم!'],
    rocket: ['صاروخ!', 'قذيفة خارقة!', 'سرعة البرق!'],
    save: ['صدّة أسطورية!', 'جدار فولاذي!', 'إنقاذ بطولي!'],
    bank: 'مرتدّة ذكية!',
    hat: 'ثلاثية نارية!',
    matchPoint: 'نقطة الحسم!'
  };
})();
