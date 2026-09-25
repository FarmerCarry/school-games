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
    blurb: 'اركض فوق القطارات، تفادَ الحواجز واجمع كل العملات!',
    controls: [{ keys: ['←', '→', 'A', 'D'], action: 'غيّر المسار' }, { keys: ['↑', 'W', 'مسافة'], action: 'اقفز' }, { keys: ['↓', 'S'], action: 'تدحرج (وانزل بسرعة من الهواء)' }, { keys: ['اسحب', 'الفأرة'], action: 'اسحب بالفأرة للتحرك والقفز والتدحرج' }] },
  { slug: 'neon-slope', title: 'منحدر النيون', en: 'Neon Slope', cats: ['running', 'arcade'], players: '1', color: '#22e3a1', hot: true,
    blurb: 'تدحرج بسرعة على منحدر النيون، تفادَ الأحمر واقفز من المنصات!',
    controls: [{ keys: ['←', '→'], action: 'توجيه الكرة' }, { keys: ['A', 'D'], action: 'توجيه الكرة (بديل)' }] },
  { slug: 'tunnel-blitz', title: 'نفق السرعة', en: 'Tunnel Blitz', cats: ['running', 'arcade'], players: '1', color: '#b44dff',
    blurb: 'دوّر النفق ومُرّ من الفتحات بسرعة جنونية واجمع كرات الضوء!',
    controls: [{ keys: ['←', '→', 'A', 'D'], action: 'تدوير النفق' }, { keys: ['الفأرة'], action: 'اضغط مطولًا يمينًا أو يسارًا للتدوير' }] },
  { slug: 'beat-dash', title: 'قفزة الإيقاع', en: 'Beat Dash', cats: ['running', 'arcade'], players: '1', color: '#00c2ff', hot: true,
    blurb: 'اقفز مع الإيقاع، اقلب الجاذبية وطِر بالصاروخ! هل تنهي المراحل الخمس؟',
    controls: [{ keys: ['مسافة', '↑', 'W', 'انقر'], action: 'قفز (اضغط مطولًا لتقفز باستمرار أو لتطير بالصاروخ)' }] },
  { slug: 'swing-hook', title: 'الخطّاف الطائر', en: 'Swing Hook', cats: ['arcade'], players: '1', color: '#ff4fa3',
    blurb: 'تشبّث بالخطّاف وتأرجح وانطلق عبر 24 مرحلة مجنونة واجمع النجوم!',
    controls: [{ keys: ['انقر', 'مسافة'], action: 'اضغط مطولًا لتمسك الخطّاف، واتركه لتطير' }] },
  { slug: 'moto-madness', title: 'جنون الدراجات', en: 'Moto Madness', cats: ['racing'], players: '1', color: '#ff3b3b', hot: true,
    blurb: 'تشقلب بدراجتك فوق اللفّات والمنحدرات والأشواك واسبق الوقت!',
    controls: [{ keys: ['↑', 'W'], action: 'انطلق (بنزين)' }, { keys: ['↓', 'S'], action: 'فرامل / رجوع للخلف' }, { keys: ['←', 'A'], action: 'مِل للخلف (شقلبة خلفية في الهواء)' }, { keys: ['→', 'D'], action: 'مِل للأمام (شقلبة أمامية في الهواء)' }] },
  { slug: 'drift-king', title: 'ملك الانزلاق', en: 'Drift King', cats: ['racing'], players: '1', color: '#ffc21a',
    blurb: 'انزلق بزر واحد فوق الغيوم، اجمع العملات واشترِ سيارات مجنونة!',
    controls: [{ keys: ['مسافة', 'انقر'], action: 'اضغط مطولًا للالتفاف، واترك للعودة' }] },
  { slug: 'fire-and-ice', title: 'النار والجليد', en: 'Fire & Ice', cats: ['two-player', 'puzzle'], players: '1-2', color: '#ff5a1f', hot: true,
    blurb: 'تعاونوا يا نار ويا جليد واهربوا من معبد مليء بالفخاخ!',
    controls: [{ keys: ['W', 'A', 'D'], action: 'الجليد: قفز / يسار / يمين' }, { keys: ['↑', '←', '→'], action: 'النار: قفز / يسار / يمين' }, { keys: ['Tab', 'Shift'], action: 'وضع اللاعب الواحد: بدّل بين النار والجليد' }] },
  { slug: 'tank-splat', title: 'دبابات الألوان', en: 'Paint Tanks', cats: ['two-player', 'battle'], players: '1-3', color: '#4caf50',
    blurb: 'كرات طلاء ترتدّ في المتاهة! لطّخ أصدقاءك وكن آخر دبابة!',
    controls: [{ keys: ['W', 'A', 'S', 'D'], action: 'الدبابة الخضراء: تحرّك' }, { keys: ['Q'], action: 'الخضراء: ارمِ الطلاء' }, { keys: ['↑', '←', '↓', '→'], action: 'الدبابة الحمراء: تحرّك (وللاعب الواحد)' }, { keys: ['/'], action: 'الحمراء: ارمِ الطلاء' }, { keys: ['I', 'J', 'K', 'L', 'U'], action: 'الدبابة الزرقاء: تحرّك وارمِ بـ U' }] },
  { slug: 'sumo-bonk', title: 'مصارعة السومو', en: 'Sumo Bonk', cats: ['two-player', 'sports'], players: '1-2', color: '#ff8fb1',
    blurb: 'اضرب خصمك ببطنك وأوقعه في الماء! مصارعة سومو مضحكة لشخص أو اثنين!',
    controls: [{ keys: ['W'], action: 'اللاعب 1: قفز' }, { keys: ['S'], action: 'اللاعب 1: هجوم بالبطن (وفي الهواء: سقطة البطن)' }, { keys: ['↑'], action: 'اللاعب 2: قفز (وفي وضع لاعب واحد يقفز أيضا)' }, { keys: ['↓'], action: 'اللاعب 2: هجوم بالبطن (وفي وضع لاعب واحد يهاجم أيضا)' }] },
  { slug: 'air-hockey', title: 'هوكي الهواء', en: 'Air Hockey', cats: ['two-player', 'sports'], players: '1-2', color: '#00d1ff',
    blurb: 'هوكي نيون صاروخي! اهزم الروبوتات أو تحدَّ صديقك في وضع الفوضى!',
    controls: [{ keys: ['الفأرة'], action: 'حرّك مضربك (ضد الكمبيوتر)' }, { keys: ['W', 'A', 'S', 'D'], action: 'اللاعب 1 (أو مضربك ضد الكمبيوتر)' }, { keys: ['↑', '←', '↓', '→'], action: 'اللاعب 2 (أو مضربك ضد الكمبيوتر)' }] },
  { slug: 'hoop-heads', title: 'سلة الرؤوس الكبيرة', en: 'Hoop Heads', cats: ['sports', 'two-player'], players: '1-2', color: '#ff9f1c', hot: true,
    blurb: 'دانك بطيء الحركة ورميات نارية! اهزم الكمبيوتر أو صديقك واربح الكأس!',
    controls: [{ keys: ['A', 'D'], action: 'تحرّك (اللاعب 1)' }, { keys: ['W'], action: 'اقفز' }, { keys: ['S'], action: 'امسك للتصويب واترك في الأخضر' }, { keys: ['W', 'S'], action: 'اقفز قرب السلة ثم صوّب = دانك!' }, { keys: ['←', '→', '↑', '↓'], action: 'اللاعب 2 (أو لاعب واحد بالأسهم)' }] },
  { slug: 'wacky-soccer', title: 'كرة القدم المجنونة', en: 'Wacky Soccer', cats: ['sports', 'two-player'], players: '1-2', color: '#2ecc71',
    blurb: 'زرّ واحد، أرجل مجنونة، ومفاجأة غريبة بعد كل هدف!',
    controls: [{ keys: ['W'], action: 'اللاعب 1: قفز وركل' }, { keys: ['↑'], action: 'اللاعب 2: قفز وركل' }, { keys: ['مسافة', 'انقر'], action: 'قفز وركل (لاعب واحد)' }] },
  { slug: 'pool-party', title: 'حفلة البلياردو', en: 'Pool Party', cats: ['sports'], players: '1-2', color: '#1abc9c',
    blurb: 'حطّم المثلث، أدخل الكرات بضربات مذهلة واهزم القرش زعنون!',
    controls: [{ keys: ['الفأرة'], action: 'صوّب' }, { keys: ['اسحب'], action: 'اسحب للخلف ثم اترك لتضرب' }, { keys: ['←', '→'], action: 'تصويب دقيق (مع Shift أبطأ)' }, { keys: ['مسافة', 'Enter'], action: 'اضغط مطوّلًا لشحن القوة ثم اترك للضرب' }, { keys: ['انقر'], action: 'اختر الدوران، أو اسحب الكرة البيضاء عندما تكون بيدك' }] },
  { slug: 'critter-mart', title: 'سوق الحيوانات', en: 'Critter Mart', cats: ['idle'], players: '1', color: '#f4b400', hot: true,
    blurb: 'ازرع وبِع وابنِ أروع سوق للحيوانات في المدينة!',
    controls: [{ keys: ['W', 'A', 'S', 'D'], action: 'امشِ' }, { keys: ['←', '↑', '→', '↓'], action: 'امشِ' }, { keys: ['انقر'], action: 'اضغط بالفأرة مطولًا لتمشي إلى المكان' }] },
  { slug: 'pizza-clicker', title: 'إمبراطورية البيتزا', en: 'Pizza Empire', cats: ['idle'], players: '1', color: '#ff6b35',
    blurb: 'انقر البيتزا الضاحكة، وظّف الطهاة وابنِ إمبراطورية تصل إلى المجرّة!',
    controls: [{ keys: ['انقر'], action: 'اصنع بيتزا (انقر على البيتزا الكبيرة)' }, { keys: ['مسافة'], action: 'اصنع بيتزا' }, { keys: ['انقر'], action: 'اشترِ المباني والترقيات، والتقط البيتزا الذهبية والبيتزا المتساقطة' }] },
  { slug: 'block-world', title: 'عالم المكعبات', en: 'Block World', cats: ['idle', 'arcade'], players: '1', color: '#5fbf3f', hot: true,
    blurb: 'احفر بحثًا عن الألماس، اصنع معاول أقوى وابنِ عالم أحلامك!',
    controls: [{ keys: ['A', 'D'], action: 'مشي (أو ← →)' }, { keys: ['W', 'مسافة'], action: 'قفز / تسلق السلالم / سباحة' }, { keys: ['S'], action: 'نزول السلم / الطيران للأسفل' }, { keys: ['انقر'], action: 'اضغط مطوّلًا لتحفر، وانقر الحيوانات لتداعبها أو تجزّ صوف الخراف' }, { keys: ['نقرة يمين'], action: 'ضع مكعبًا / افتح طاولة الصنع' }] },
  { slug: 'block-burst', title: 'انفجار المكعبات', en: 'Block Burst', cats: ['puzzle'], players: '1', color: '#4f7cff',
    blurb: 'ضع المكعبات، فجّر الصفوف، واصنع كومبو خياليًا!',
    controls: [{ keys: ['اسحب'], action: 'اسحب القطعة وضعها على اللوحة' }, { keys: ['انقر'], action: 'انقر القطعة ثم انقر مكانها على اللوحة' }, { keys: ['نقرة يمين'], action: 'أرجع القطعة إلى مكانها' }] },
  { slug: 'merge-2048', title: 'دمج 2048', en: '2048', cats: ['puzzle'], players: '1', color: '#edc22e',
    blurb: 'ادمج البلاطات، افتح أشكالاً مدهشة ووصل إلى 2048!',
    controls: [{ keys: ['←', '↑', '→', '↓'], action: 'تحريك البلاطات' }, { keys: ['W', 'A', 'S', 'D'], action: 'تحريك البلاطات' }, { keys: ['اسحب'], action: 'تحريك البلاطات بالفأرة' }, { keys: ['U', 'Z'], action: 'تراجع (3 مرات في كل لعبة)' }] },
  { slug: 'candy-rope', title: 'حبل الحلوى', en: 'Munch Rope', cats: ['puzzle'], players: '1', color: '#8bd346',
    blurb: 'اقطع الحبال، اجمع النجوم، وأطعم الوحش قضّوم حلوته اللذيذة!',
    controls: [{ keys: ['اسحب'], action: 'اقطع الحبال' }, { keys: ['انقر'], action: 'فرقع الفقاعة وشغّل النافخ' }] },
  { slug: 'maze-dash', title: 'اندفاع المتاهة', en: 'Maze Dash', cats: ['arcade'], players: '1', color: '#ffe600',
    blurb: 'اندفع كالبرق في المتاهة، اجمع النقاط واهرب من الهلام الصاعد!',
    controls: [{ keys: ['←', '↑', '→', '↓'], action: 'اندفاع حتى الجدار' }, { keys: ['W', 'A', 'S', 'D'], action: 'اندفاع حتى الجدار' }, { keys: ['اسحب'], action: 'اندفاع بالفأرة' }] },
  { slug: 'road-hopper', title: 'عبور الطريق', en: 'Road Hopper', cats: ['arcade'], players: '1', color: '#7ed957', hot: true,
    blurb: 'اقفز عبر الطرق والأنهار والقطارات، واجمع 16 شخصية مضحكة!',
    controls: [{ keys: ['↑', '←', '↓', '→'], action: 'قفز' }, { keys: ['W', 'A', 'S', 'D'], action: 'قفز' }, { keys: ['انقر'], action: 'قفزة للأمام' }] },
  { slug: 'troll-level', title: 'المراحل الماكرة', en: 'Sneaky Levels', cats: ['arcade'], players: '1', color: '#ff4d6d',
    blurb: 'كل مرحلة تخدعك! أرض تنهار وأبواب تهرب... هل تنجو؟',
    controls: [{ keys: ['←', '→'], action: 'حركة' }, { keys: ['A', 'D'], action: 'حركة' }, { keys: ['↑', 'W', 'مسافة'], action: 'قفز' }] },
  { slug: 'blob-battle', title: 'معركة الهلام', en: 'Blob Battle', cats: ['battle'], players: '1', color: '#36cfc9',
    blurb: 'كُل الحبوب، اكبَر، والتهم الروبوتات لتصبح ملك الساحة!',
    controls: [{ keys: ['الفأرة'], action: 'حرّك كرتك' }, { keys: ['مسافة'], action: 'انقسم وانقضّ' }, { keys: ['W'], action: 'اقذف قطعة صغيرة' }] },
  { slug: 'paint-grab', title: 'لوّن الأرض', en: 'Paint Grab', cats: ['battle'], players: '1', color: '#ff5ca8',
    blurb: 'اخرج من أرضك، ارسم دائرة، ولوّن الخريطة قبل الروبوتات!',
    controls: [{ keys: ['←', '↑', '→', '↓'], action: 'توجيه' }, { keys: ['W', 'A', 'S', 'D'], action: 'توجيه' }, { keys: ['الفأرة'], action: 'اتبع المؤشر' }] },
  { slug: 'snake-arena', title: 'ساحة الثعابين', en: 'Snake Arena', cats: ['battle', 'arcade'], players: '1', color: '#8e44ff',
    blurb: 'كُل النقاط المضيئة، اكبر، وحاصر 15 ثعبانًا لتصبح ملك الساحة!',
    controls: [{ keys: ['الفأرة'], action: 'وجّه الثعبان' }, { keys: ['انقر'], action: 'تسريع (اضغط مطولًا)' }, { keys: ['مسافة'], action: 'تسريع' }, { keys: ['←', '→'], action: 'لفّ يسارًا ويمينًا' }, { keys: ['A', 'D'], action: 'لفّ يسارًا ويمينًا' }] }
];
