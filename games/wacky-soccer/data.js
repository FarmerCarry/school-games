/* Wacky Soccer — static data: teams, wacky modifiers, shop items, cups. */
(function () {
  'use strict';
  var WS = window.WS = window.WS || {};

  // pattern: 'solid' | 'vstripes' | 'hband' | 'halves' | 'sash' | 'hoops'
  // emblem: drawn in code (see art.js drawEmblem)
  // players: two looks per team {skin, hair, hairColor}
  WS.TEAMS = [
    { id: 'pancake', name: 'نادي الفطائر', shirt: '#ffb627', shirt2: '#8b4a1c', shorts: '#8b4a1c', socks: '#ffb627', boots: '#3b2413',
      pattern: 'hband', emblem: 'stack', flag: ['#ffb627', '#8b4a1c', '#ffe7a8'], cost: 0,
      players: [{ skin: '#f2c08f', hair: 'spiky', hc: '#6b3b1f', num: 7 }, { skin: '#8d5a3b', hair: 'afro', hc: '#241611', num: 10 }] },
    { id: 'melon', name: 'صواريخ البطيخ', shirt: '#2fbf4a', shirt2: '#ff4d6d', shorts: '#16692a', socks: '#ff4d6d', boots: '#222222',
      pattern: 'vstripes', emblem: 'melon', flag: ['#2fbf4a', '#ff4d6d', '#ffffff'], cost: 0,
      players: [{ skin: '#c98b5e', hair: 'bowl', hc: '#1d1d1d', num: 9 }, { skin: '#f6d3b0', hair: 'pony', hc: '#e0a526', num: 4 }] },
    { id: 'penguin', name: 'بطاريق الثلج', shirt: '#eaf6ff', shirt2: '#1f6fe0', shorts: '#1f6fe0', socks: '#eaf6ff', boots: '#1a2a55',
      pattern: 'sash', emblem: 'flake', flag: ['#1f6fe0', '#eaf6ff', '#8fd3ff'], cost: 0,
      players: [{ skin: '#e8b88f', hair: 'curly', hc: '#3a2a20', num: 1 }, { skin: '#6e4630', hair: 'band', hc: '#1f6fe0', num: 5 }] },
    { id: 'banana', name: 'نمور الموز', shirt: '#ffe14d', shirt2: '#262626', shorts: '#262626', socks: '#ffe14d', boots: '#262626',
      pattern: 'hoops', emblem: 'bolt', flag: ['#ffe14d', '#262626', '#ff9f1c'], cost: 80,
      players: [{ skin: '#f0c7a0', hair: 'mohawk', hc: '#ff7b00', num: 11 }, { skin: '#a8714c', hair: 'spiky', hc: '#1d1d1d', num: 3 }] },
    { id: 'dino', name: 'ديناصورات الجيلي', shirt: '#9b5de5', shirt2: '#b8f25a', shorts: '#5a2d9c', socks: '#b8f25a', boots: '#2d1650',
      pattern: 'halves', emblem: 'spikes', flag: ['#9b5de5', '#b8f25a', '#ffffff'], cost: 120,
      players: [{ skin: '#d9a47a', hair: 'afro', hc: '#5a2d9c', num: 8 }, { skin: '#f7d7bd', hair: 'bowl', hc: '#b85c1e', num: 6 }] },
    { id: 'pizza', name: 'إعصار البيتزا', shirt: '#ff4b2b', shirt2: '#fff3d6', shorts: '#fff3d6', socks: '#ff4b2b', boots: '#5a1a10',
      pattern: 'vstripes', emblem: 'slice', flag: ['#ff4b2b', '#fff3d6', '#2fbf4a'], cost: 160,
      players: [{ skin: '#b87a52', hair: 'curly', hc: '#1d1d1d', num: 2 }, { skin: '#f3c9a6', hair: 'spiky', hc: '#d93a1c', num: 99 }] },
    { id: 'spacecat', name: 'قطط الفضاء', shirt: '#24338f', shirt2: '#ff5fc8', shorts: '#15204f', socks: '#ff5fc8', boots: '#0e1433',
      pattern: 'sash', emblem: 'moon', flag: ['#15204f', '#ff5fc8', '#ffe14d'], cost: 220,
      players: [{ skin: '#e2ae83', hair: 'ears', hc: '#ff5fc8', num: 12 }, { skin: '#7a4c33', hair: 'ears', hc: '#ffe14d', num: 21 }] },
    { id: 'ninja', name: 'سناجب النينجا', shirt: '#3a3f4a', shirt2: '#ff8a1f', shorts: '#23262d', socks: '#ff8a1f', boots: '#111111',
      pattern: 'hband', emblem: 'acorn', flag: ['#3a3f4a', '#ff8a1f', '#ffd9a8'], cost: 300,
      players: [{ skin: '#c2865c', hair: 'band', hc: '#ff8a1f', num: 17 }, { skin: '#f0cfae', hair: 'band', hc: '#ff8a1f', num: 23 }] },
    { id: 'golden', name: 'النجوم الذهبية', shirt: '#ffd23f', shirt2: '#fff6c9', shorts: '#e0a800', socks: '#fff6c9', boots: '#8a6400',
      pattern: 'solid', emblem: 'star', flag: ['#ffd23f', '#e0a800', '#fff6c9'], cost: -1, secret: true,
      players: [{ skin: '#e9b98c', hair: 'crown', hc: '#ffd23f', num: 1 }, { skin: '#91603f', hair: 'crown', hc: '#ffd23f', num: 1 }] }
  ];
  WS.teamById = function (id) { for (var i = 0; i < WS.TEAMS.length; i++) if (WS.TEAMS[i].id === id) return WS.TEAMS[i]; return WS.TEAMS[0]; };

  // Wacky modifiers. apply(P) mutates the physics params.
  WS.MODS = [
    { id: 'normal', name: 'مباراة عادية', desc: 'كرة عادية... حتى الآن!', color: '#3ddc84', icon: 'ball', apply: function () {} },
    { id: 'giant', name: 'كرة عملاقة!', desc: 'الكرة صارت ضخمة جدًا', color: '#ff7a1a', icon: 'bigball',
      apply: function (P) { P.ballR *= 2.2; P.ballMass *= 1.6; } },
    { id: 'tiny', name: 'كرة صغيرة!', desc: 'كرة صغيرة وسريعة... ركّز!', color: '#4fc3f7', icon: 'tinyball',
      apply: function (P) { P.ballR *= 0.55; P.ballMass *= 0.7; } },
    { id: 'beach', name: 'كرة الشاطئ!', desc: 'خفيفة وتطير ببطء في الهواء', color: '#ff5fc8', icon: 'beach',
      apply: function (P) { P.ballR *= 1.6; P.ballMass *= 0.35; P.ballGrav = 0.35; P.ballDrag = 0.9; P.ballRest = 0.85; P.ballSkin = 'beach'; } },
    { id: 'moon', name: 'جاذبية القمر!', desc: 'قفزات عالية جدًا... كأننا على القمر', color: '#b39ddb', icon: 'moon',
      apply: function (P) { P.grav *= 0.42; P.jumpMul = 0.74; P.sky = 'space'; } },
    { id: 'ice', name: 'ملعب جليدي!', desc: 'انتبه... كل شيء ينزلق!', color: '#8fe3ff', icon: 'ice',
      apply: function (P) { P.groundFric = 0.03; P.ballRoll = 0.02; P.ice = true; } },
    { id: 'wind', name: 'رياح قوية!', desc: 'الريح تدفع الكرة يمينًا ويسارًا', color: '#9be15d', icon: 'wind',
      apply: function (P) { P.wind = true; } },
    { id: 'bouncy', name: 'مرمى نطّاط!', desc: 'العارضة صارت مثل الترامبولين', color: '#ff4d6d', icon: 'spring',
      apply: function (P) { P.goalRest = 1.35; P.ballRest = Math.max(P.ballRest, 0.9); P.bouncy = true; } },
    { id: 'tinyp', name: 'لاعبون صغار!', desc: 'الفرق كلها صارت بحجم الفأر', color: '#ffd23f', icon: 'tinyp',
      apply: function (P) { P.pScale = 0.66; } },
    { id: 'giantp', name: 'لاعبون عمالقة!', desc: 'عمالقة يلعبون الكرة!', color: '#ff9f1c', icon: 'giantp',
      apply: function (P) { P.pScale = 1.32; } },
    { id: 'two', name: 'كرتان!', desc: 'ضعف الكرات... ضعف الفوضى', color: '#3ddc84', icon: 'two',
      apply: function (P) { P.ballCount = 2; } },
    { id: 'bowling', name: 'كرة البولينغ!', desc: 'ثقيلة جدًا... اركلها بقوة!', color: '#7e57c2', icon: 'bowling',
      apply: function (P) { P.ballMass *= 4; P.ballRest = 0.25; P.ballR *= 1.05; P.ballSkin = 'bowling'; P.kickMul = 0.7; } },
    { id: 'heads', name: 'رؤوس كبيرة!', desc: 'رؤوس ضخمة للضربات الرأسية', color: '#ff7eb3', icon: 'head',
      apply: function (P) { P.headMul = 1.85; } },
    { id: 'legs', name: 'أرجل طويلة!', desc: 'أرجل مثل المعكرونة!', color: '#00c2a8', icon: 'legs',
      apply: function (P) { P.legMul = 1.5; } }
  ];
  WS.modById = function (id) { for (var i = 0; i < WS.MODS.length; i++) if (WS.MODS[i].id === id) return WS.MODS[i]; return WS.MODS[0]; };

  // Shop: balls and hats. price 0 = owned from the start.
  WS.BALLS = [
    { id: 'classic', name: 'الكلاسيكية', price: 0 },
    { id: 'stripes', name: 'المخططة', price: 40 },
    { id: 'melon', name: 'البطيخة', price: 70 },
    { id: 'smiley', name: 'المبتسمة', price: 90 },
    { id: 'donut', name: 'الدونات', price: 120 },
    { id: 'planet', name: 'الكوكب', price: 150 },
    { id: 'fire', name: 'النارية', price: 220 },
    { id: 'rainbow', name: 'قوس قزح', price: 300 }
  ];
  WS.HATS = [
    { id: 'none', name: 'بدون', price: 0 },
    { id: 'cap', name: 'قبعة رياضية', price: 40 },
    { id: 'party', name: 'قبعة الحفلة', price: 60 },
    { id: 'chef', name: 'قبعة الطاهي', price: 80 },
    { id: 'propeller', name: 'قبعة المروحة', price: 100 },
    { id: 'viking', name: 'خوذة الفايكنج', price: 130 },
    { id: 'tophat', name: 'القبعة الطويلة', price: 160 },
    { id: 'crown', name: 'التاج', price: 250 }
  ];

  // AI skill 0..1 for quick matches.
  WS.DIFFS = [
    { id: 'easy', name: 'سهل', skill: 0.2, reward: 10, color: '#3ddc84' },
    { id: 'normal', name: 'عادي', skill: 0.55, reward: 20, color: '#ffd23f' },
    { id: 'hard', name: 'صعب', skill: 0.88, reward: 35, color: '#ff5a5f' }
  ];

  WS.CUPS = [
    { id: 'bronze', name: 'الكأس البرونزية', color: '#d98a4a', dark: '#8a4f22', skills: [0.15, 0.3, 0.45, 0.58], reward: 100 },
    { id: 'silver', name: 'الكأس الفضية', color: '#cfd8e6', dark: '#6f7d93', skills: [0.45, 0.58, 0.7, 0.8], reward: 200 },
    { id: 'gold', name: 'الكأس الذهبية', color: '#ffd23f', dark: '#b8860b', skills: [0.72, 0.82, 0.9, 1.0], reward: 400 }
  ];
  WS.CUP_ROUNDS = ['المباراة الأولى', 'ربع النهائي', 'نصف النهائي', 'النهائي'];

  WS.WIN_GOALS = 5;       // quick match / 2 players
  WS.CUP_GOALS = 3;       // each cup match (keeps a cup run short)
})();
