/* Air Hockey — content data (bots, skins, tables, pucks, power-ups, awards).
   All player-facing text is Arabic. */
(function () {
  'use strict';
  var AH = window.AH = window.AH || {};

  // CPU opponents. Tuning numbers are read by the AI in game.js.
  AH.BOTS = [
    { id: 'easy', name: 'نعسان', level: 'سهل', lvColor: '#3ddc84', color: '#7cf29a', ring: '#1f9e55', face: 'sleepy',
      coins: 12, naive: true, speed: 430, accel: 2400, react: 0.34, err: 150, attackMax: 380, lead: 0.2, bank: 0, depth: 96, hesitate: 0.55, strike: 0.95 },
    { id: 'medium', name: 'زيزو', level: 'متوسط', lvColor: '#ffd23f', color: '#ffe066', ring: '#d69a00', face: 'happy',
      coins: 22, speed: 720, accel: 4400, react: 0.16, err: 115, attackMax: 700, lead: 0.55, bank: 0.12, depth: 86, hesitate: 0.25, strike: 1.15 },
    { id: 'hard', name: 'البرق', level: 'صعب', lvColor: '#ff8a3d', color: '#ff9a52', ring: '#d9480f', face: 'angry',
      coins: 38, speed: 950, accel: 7000, react: 0.1, err: 92, attackMax: 1100, lead: 0.85, bank: 0.3, depth: 80, hesitate: 0.08, strike: 1.35 },
    { id: 'insane', name: 'الروبوت الخارق', level: 'مستحيل', lvColor: '#ff4d6d', color: '#ff5c7a', ring: '#a4133c', face: 'robot',
      coins: 65, speed: 1250, accel: 11000, react: 0.05, err: 76, attackMax: 1700, lead: 1, bank: 0.45, depth: 76, hesitate: 0, strike: 1.5 }
  ];

  // Mallet skins. kind: solid | melon | donut | rainbow | gold | diamond | galaxy
  AH.MALLETS = [
    { id: 'blue', name: 'أزرق نيون', price: 0, kind: 'solid', color: '#35c8ff', ring: '#0a6fd6' },
    { id: 'pink', name: 'وردي لامع', price: 30, kind: 'solid', color: '#ff6bcb', ring: '#c2187a' },
    { id: 'lime', name: 'ليموني', price: 40, kind: 'solid', color: '#b4ff4a', ring: '#5aa800' },
    { id: 'purple', name: 'بنفسجي', price: 50, kind: 'solid', color: '#b98cff', ring: '#6a2fd6' },
    { id: 'melon', name: 'بطيخة', price: 80, kind: 'melon', color: '#ff5a6e', ring: '#2e9e44' },
    { id: 'donut', name: 'دونات', price: 100, kind: 'donut', color: '#ff9ed2', ring: '#c98a4b' },
    { id: 'galaxy', name: 'مجرّة', price: 130, kind: 'galaxy', color: '#7a5cff', ring: '#2a1a7a' },
    { id: 'rainbow', name: 'قوس قزح', price: 160, kind: 'rainbow', color: '#ffffff', ring: '#ff4d6d' },
    { id: 'gold', name: 'المضرب الذهبي', price: -1, unlock: 'hard', kind: 'gold', color: '#ffd84a', ring: '#b8860b' },
    { id: 'diamond', name: 'مضرب الألماس', price: -1, unlock: 'insane', kind: 'diamond', color: '#bff6ff', ring: '#3fb6d6' }
  ];

  // Table themes. line = wall neon, mid = centre line, a = left side tint, b = right side tint.
  AH.TABLES = [
    { id: 'neon', name: 'ليل النيون', price: 0, bg1: '#0b0f2e', bg2: '#050716', s1: '#10244f', s2: '#0a1636', line: '#35e0ff', mid: '#ff4fd8', a: '#35c8ff', b: '#ff6b6b', dot: 'rgba(120,200,255,0.16)' },
    { id: 'sunset', name: 'غروب الشمس', price: 70, bg1: '#2a0a2e', bg2: '#12041a', s1: '#4a1846', s2: '#2c0d33', line: '#ffb23f', mid: '#ff5fa2', a: '#ffd23f', b: '#ff5f7e', dot: 'rgba(255,190,120,0.16)' },
    { id: 'jungle', name: 'الغابة', price: 90, bg1: '#062116', bg2: '#021009', s1: '#0e3d27', s2: '#082a1a', line: '#7dff6b', mid: '#ffe14d', a: '#7dff6b', b: '#ffa43d', dot: 'rgba(160,255,150,0.15)' },
    { id: 'ice', name: 'مملكة الجليد', price: 110, bg1: '#0b2340', bg2: '#06142a', s1: '#1c4a78', s2: '#12375e', line: '#e4fbff', mid: '#6fe8ff', a: '#9ff0ff', b: '#c9b8ff', dot: 'rgba(230,250,255,0.18)' },
    { id: 'space', name: 'الفضاء', price: 150, bg1: '#12062b', bg2: '#040112', s1: '#1d0b45', s2: '#0e0526', line: '#c77dff', mid: '#48e5c2', a: '#48e5c2', b: '#ff6bd6', dot: 'rgba(210,170,255,0.13)', stars: true }
  ];

  // Puck styles (mostly the trail).
  AH.PUCKS = [
    { id: 'classic', name: 'كلاسيكي', price: 0, color: '#ffffff', trail: ['#9fe8ff'] },
    { id: 'fire', name: 'ذيل النار', price: 50, color: '#fff3d6', trail: ['#ffdd33', '#ff8a1f', '#ff3d1f'] },
    { id: 'frost', name: 'ذيل الثلج', price: 60, color: '#eafcff', trail: ['#ffffff', '#9ff0ff', '#4fc3ff'] },
    { id: 'stars', name: 'ذيل النجوم', price: 90, color: '#fffbe0', trail: ['#fff38a', '#ffd23f', '#ffffff'], star: true },
    { id: 'rainbow', name: 'ذيل قوس قزح', price: 120, color: '#ffffff', trail: ['#ff4d6d', '#ffa43d', '#ffe14d', '#7dff6b', '#35c8ff', '#b98cff'] }
  ];

  // Chaos power-ups.
  AH.POWERS = [
    { id: 'big', name: 'مضرب عملاق!', color: '#3ddc84' },
    { id: 'tiny', name: 'مرماك صغير!', color: '#35c8ff' },
    { id: 'fire', name: 'قرص صاروخي!', color: '#ff7a1f' },
    { id: 'freeze', name: 'تجميد الخصم!', color: '#9ff0ff' },
    { id: 'multi', name: 'قرص إضافي!', color: '#ffd23f' }
  ];

  // Awards: +20 coins each.
  AH.AWARDS = [
    { id: 'goal1', name: 'أول هدف', desc: 'سجّل هدفك الأول' },
    { id: 'win1', name: 'أول فوز', desc: 'اربح أي مباراة ضد الكمبيوتر' },
    { id: 'clean', name: 'شباك نظيفة', desc: 'اربح دون أن يدخل مرماك أي هدف' },
    { id: 'hat', name: 'ثلاثية!', desc: 'سجّل 3 أهداف متتالية في مباراة' },
    { id: 'rocket', name: 'ضربة صاروخية', desc: 'اضرب القرص بسرعة 110 كم/س' },
    { id: 'keeper', name: 'الحارس الجبّار', desc: 'صُدّ 5 كرات في مباراة واحدة' },
    { id: 'comeback', name: 'العودة الكبرى', desc: 'اربح بعد أن كنت متأخرًا بـ 3 أهداف' },
    { id: 'beat_easy', name: 'أيقظت نعسان', desc: 'اهزم نعسان' },
    { id: 'beat_medium', name: 'زيزو يستسلم', desc: 'اهزم زيزو' },
    { id: 'beat_hard', name: 'أسرع من البرق', desc: 'اهزم البرق' },
    { id: 'beat_insane', name: 'قاهر الروبوت', desc: 'اهزم الروبوت الخارق' },
    { id: 'chaos', name: 'ملك الفوضى', desc: 'اربح مباراة في وضع الفوضى' },
    { id: 'friends', name: 'مباراة الأصدقاء', desc: 'العب مباراة لاعبَين' },
    { id: 'shopper', name: 'المتسوّق', desc: 'اشترِ 3 أشياء من المتجر' }
  ];
  AH.AWARD_COINS = 20;

  // Popup words.
  AH.WORDS = {
    goal: ['هدف!', 'هدف رائع!', 'في الشباك!', 'هدف خرافي!'],
    rocket: ['صاروخ!', 'قذيفة!', 'بسرعة البرق!'],
    save: ['صدّة!', 'تصدٍّ رائع!', 'منعتها!'],
    bank: 'ضربة مرتدّة!',
    hat: 'ثلاثية!',
    matchPoint: 'نقطة الفوز!'
  };
})();
