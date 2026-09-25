/*
 * Site catalog. Everything the home page shows comes from this file.
 * The site is in Arabic, so titles, blurbs and control descriptions are Arabic.
 *
 * To hide a game: set `hidden: true` on its entry.
 * To feature a game in the "Hot right now" row: set `hot: true`.
 * Plain script (not JSON) so the site also works when opened from a folder.
 */
window.SITE = {
  name: 'ألعاب الفسحة',
  tagline: 'ألعاب مجانية للطلاب المتميزين 🎉'
};

window.CATEGORIES = [
  { id: 'running', label: 'جري', icon: '🏃' },
  { id: 'racing', label: 'سباقات', icon: '🏎️' },
  { id: 'two-player', label: 'لاعبان', icon: '👥' },
  { id: 'sports', label: 'رياضة', icon: '🏀' },
  { id: 'puzzle', label: 'ألغاز', icon: '🧩' },
  { id: 'arcade', label: 'أركيد', icon: '👾' },
  { id: 'idle', label: 'بناء وإدارة', icon: '🏗️' },
  { id: 'battle', label: 'تحدي الروبوتات', icon: '🤖' }
];

// en: English name (only used so searching in English also finds the game)
// controls: [{ keys: ['←', '→'], action: 'توجيه' }, ...]  (shown on the play page)
// Key labels: arrows and letters as printed on the keyboard; 'مسافة' = Space,
// 'انقر' = click, 'الفأرة' = mouse, 'اسحب' = drag.
window.GAMES = [
  { slug: 'rail-rush', title: 'عدّاء السكة', en: 'Rail Rush', cats: ['running'], players: '1', color: '#ff7a1a', hot: true,
    blurb: 'اركض فوق سكة القطار، تفادَ القطارات واجمع كل العملات!',
    controls: [{ keys: ['←', '→'], action: 'تغيير المسار' }, { keys: ['↑'], action: 'قفز' }, { keys: ['↓'], action: 'انزلاق' }] },
  { slug: 'neon-slope', title: 'منحدر النيون', en: 'Neon Slope', cats: ['running', 'arcade'], players: '1', color: '#22e3a1', hot: true,
    blurb: 'تدحرج على منحدر نيون لا ينتهي. إلى أي مدى ستصل؟',
    controls: [{ keys: ['←', '→'], action: 'توجيه' }] },
  { slug: 'tunnel-blitz', title: 'نفق السرعة', en: 'Tunnel Blitz', cats: ['running', 'arcade'], players: '1', color: '#b44dff',
    blurb: 'انطلق بسرعة جنونية داخل نفق يدور!',
    controls: [{ keys: ['←', '→'], action: 'تدوير النفق' }] },
  { slug: 'beat-dash', title: 'قفزة الإيقاع', en: 'Beat Dash', cats: ['running', 'arcade'], players: '1', color: '#00c2ff', hot: true,
    blurb: 'اقفز مع الإيقاع فوق الأشواك. هل تنهي كل المراحل؟',
    controls: [{ keys: ['مسافة', 'انقر'], action: 'قفز' }] },
  { slug: 'swing-hook', title: 'الخطّاف الطائر', en: 'Swing Hook', cats: ['arcade'], players: '1', color: '#ff4fa3',
    blurb: 'تشبّث وتأرجح وانطلق نحو خط النهاية!',
    controls: [{ keys: ['انقر', 'مسافة'], action: 'اضغط مطولًا للتشبث' }] },
  { slug: 'moto-madness', title: 'جنون الدراجات', en: 'Moto Madness', cats: ['racing'], players: '1', color: '#ff3b3b', hot: true,
    blurb: 'قُد دراجتك فوق منحدرات مجنونة ونفّذ الشقلبات.',
    controls: [{ keys: ['↑'], action: 'تسارع' }, { keys: ['↓'], action: 'فرامل' }, { keys: ['←', '→'], action: 'ميلان وشقلبة' }] },
  { slug: 'drift-king', title: 'ملك الانزلاق', en: 'Drift King', cats: ['racing'], players: '1', color: '#ffc21a',
    blurb: 'زر واحد وانزلاق بلا نهاية. لا تسقط عن الطريق!',
    controls: [{ keys: ['مسافة', 'انقر'], action: 'اضغط مطولًا للالتفاف' }] },
  { slug: 'fire-and-ice', title: 'النار والجليد', en: 'Fire & Ice', cats: ['two-player', 'puzzle'], players: '1-2', color: '#ff5a1f', hot: true,
    blurb: 'تعاونا! النار والجليد يجب أن يهربا من المعبد معًا.',
    controls: [{ keys: ['W', 'A', 'D'], action: 'الجليد (قفز / حركة)' }, { keys: ['↑', '←', '→'], action: 'النار (قفز / حركة)' }] },
  { slug: 'tank-splat', title: 'دبابات الألوان', en: 'Paint Tanks', cats: ['two-player', 'battle'], players: '1-3', color: '#4caf50',
    blurb: 'ارمِ كرات الطلاء في المتاهة ولطّخ أصدقاءك!',
    controls: [{ keys: ['W', 'A', 'S', 'D', 'Q'], action: 'الدبابة الخضراء' }, { keys: ['↑', '←', '↓', '→', '/'], action: 'الدبابة الحمراء' }] },
  { slug: 'sumo-bonk', title: 'مصارعة السومو', en: 'Sumo Bonk', cats: ['two-player', 'sports'], players: '1-2', color: '#ff8fb1',
    blurb: 'مصارعة سومو متمايلة. ادفع خصمك خارج الحلبة!',
    controls: [{ keys: ['W', 'S'], action: 'اللاعب 1: قفز / دفعة' }, { keys: ['↑', '↓'], action: 'اللاعب 2: قفز / دفعة' }] },
  { slug: 'air-hockey', title: 'هوكي الهواء', en: 'Air Hockey', cats: ['two-player', 'sports'], players: '1-2', color: '#00d1ff',
    blurb: 'هوكي هوائي سريع جدًا ضد صديق أو ضد الكمبيوتر.',
    controls: [{ keys: ['الفأرة'], action: 'تحريك المضرب (ضد الكمبيوتر)' }, { keys: ['W', 'A', 'S', 'D'], action: 'اللاعب 1' }, { keys: ['↑', '←', '↓', '→'], action: 'اللاعب 2' }] },
  { slug: 'hoop-heads', title: 'سلة الرؤوس الكبيرة', en: 'Hoop Heads', cats: ['sports', 'two-player'], players: '1-2', color: '#ff9f1c', hot: true,
    blurb: 'كرة سلة برؤوس ضخمة! سجّل على الكمبيوتر أو على صديقك.',
    controls: [{ keys: ['A', 'D', 'W'], action: 'حركة / قفز' }, { keys: ['S'], action: 'تصويب' }] },
  { slug: 'wacky-soccer', title: 'كرة القدم المجنونة', en: 'Wacky Soccer', cats: ['sports', 'two-player'], players: '1-2', color: '#2ecc71',
    blurb: 'كرة قدم بزر واحد. فوضى ومرح وأهداف!',
    controls: [{ keys: ['W'], action: 'اللاعب 1: قفز وركل' }, { keys: ['↑'], action: 'اللاعب 2: قفز وركل' }] },
  { slug: 'pool-party', title: 'حفلة البلياردو', en: 'Pool Party', cats: ['sports'], players: '1-2', color: '#1abc9c',
    blurb: 'بلياردو كلاسيكي. صوّب جيدًا وأدخل كل الكرات.',
    controls: [{ keys: ['الفأرة'], action: 'تصويب' }, { keys: ['اسحب'], action: 'اسحب للخلف ثم اترك للضرب' }] },
  { slug: 'critter-mart', title: 'سوق الحيوانات', en: 'Critter Mart', cats: ['idle'], players: '1', color: '#f4b400', hot: true,
    blurb: 'أدِر سوبرماركت خاصًا بك! ازرع ورتّب وبِع واربح.',
    controls: [{ keys: ['W', 'A', 'S', 'D'], action: 'مشي' }] },
  { slug: 'pizza-clicker', title: 'إمبراطورية البيتزا', en: 'Pizza Empire', cats: ['idle'], players: '1', color: '#ff6b35',
    blurb: 'انقر لتصنع البيتزا، وظّف الطهاة وابنِ إمبراطوريتك.',
    controls: [{ keys: ['انقر'], action: 'اصنع بيتزا' }] },
  { slug: 'block-world', title: 'عالم المكعبات', en: 'Block World', cats: ['idle', 'arcade'], players: '1', color: '#5fbf3f', hot: true,
    blurb: 'احفر وابنِ واستكشف عالمًا مصنوعًا من المكعبات.',
    controls: [{ keys: ['A', 'D'], action: 'مشي' }, { keys: ['W', 'مسافة'], action: 'قفز' }, { keys: ['انقر'], action: 'حفر' }, { keys: ['نقرة يمين'], action: 'بناء' }] },
  { slug: 'block-burst', title: 'انفجار المكعبات', en: 'Block Burst', cats: ['puzzle'], players: '1', color: '#4f7cff',
    blurb: 'ضع المكعبات، امسح الصفوف واصنع سلاسل كومبو!',
    controls: [{ keys: ['اسحب'], action: 'ضع المكعبات' }] },
  { slug: 'merge-2048', title: 'دمج 2048', en: '2048', cats: ['puzzle'], players: '1', color: '#edc22e',
    blurb: 'حرّك البلاطات وادمجها حتى تصل إلى 2048!',
    controls: [{ keys: ['←', '↑', '→', '↓'], action: 'تحريك البلاطات' }] },
  { slug: 'candy-rope', title: 'حبل الحلوى', en: 'Munch Rope', cats: ['puzzle'], players: '1', color: '#8bd346',
    blurb: 'اقطع الحبال وأطعم الوحش الجائع حلوته.',
    controls: [{ keys: ['اسحب'], action: 'اقطع الحبال' }] },
  { slug: 'maze-dash', title: 'اندفاع المتاهة', en: 'Maze Dash', cats: ['arcade'], players: '1', color: '#ffe600',
    blurb: 'انطلق في المتاهة، اجمع النقاط واهرب من الهلام الصاعد!',
    controls: [{ keys: ['←', '↑', '→', '↓'], action: 'اندفاع' }] },
  { slug: 'road-hopper', title: 'عبور الطريق', en: 'Road Hopper', cats: ['arcade'], players: '1', color: '#7ed957', hot: true,
    blurb: 'اقفز عبر الطرق المزدحمة والأنهار. احذر السيارات!',
    controls: [{ keys: ['↑', '←', '↓', '→'], action: 'قفز' }] },
  { slug: 'troll-level', title: 'المراحل الماكرة', en: 'Sneaky Levels', cats: ['arcade'], players: '1', color: '#ff4d6d',
    blurb: 'المرحلة تحاول خداعك. توقّع ما لا تتوقعه!',
    controls: [{ keys: ['←', '→'], action: 'حركة' }, { keys: ['↑', 'مسافة'], action: 'قفز' }] },
  { slug: 'blob-battle', title: 'معركة الهلام', en: 'Blob Battle', cats: ['battle'], players: '1', color: '#36cfc9',
    blurb: 'كُل النقاط، كبّر حجمك والتهم الروبوتات.',
    controls: [{ keys: ['الفأرة'], action: 'حركة' }, { keys: ['مسافة'], action: 'انقسام' }] },
  { slug: 'paint-grab', title: 'لوّن الأرض', en: 'Paint Grab', cats: ['battle'], players: '1', color: '#ff5ca8',
    blurb: 'لوّن الخريطة بلونك واستولِ على أرض أكثر من الروبوتات!',
    controls: [{ keys: ['←', '↑', '→', '↓'], action: 'توجيه' }] },
  { slug: 'snake-arena', title: 'ساحة الثعابين', en: 'Snake Arena', cats: ['battle', 'arcade'], players: '1', color: '#8e44ff',
    blurb: 'كن أطول ثعبان في الساحة وحاصر الروبوتات!',
    controls: [{ keys: ['الفأرة'], action: 'توجيه' }, { keys: ['انقر'], action: 'تسريع' }] }
];
