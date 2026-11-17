/* سباق البيض (Egg Rush: Turbo Dino & Robo-Coop Heist!) — Pure Simulation Engine */
(function () {
  'use strict';

  var W = 1280, H = 720, AX0 = 52, AY0 = 88, AX1 = 1228, AY1 = 682;
  var TAU = Math.PI * 2, BONK_DURATION = 0.65;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var DIFFS = {
    easy: { id: 'easy', label: 'سهل', desc: 'حراس نعسانون · خوذة فقاعة مجانية · وقت وفير ومغناطيس بيض!', guardSpeed: 0.72, coneScale: 0.82, timeBonus: 26, magnetBonus: 18, startShield: 1, sleepPause: 1.35, dashCd: 1.1, coinMult: 1.0 },
    normal: { id: 'normal', label: 'متوسط', desc: 'حراس يقظون · سلاسل تيربو ثلاثية · خدع البطة الصفّارة!', guardSpeed: 1.0, coneScale: 1.0, timeBonus: 0, magnetBonus: 0, startShield: 0, sleepPause: 0.45, dashCd: 1.32, coinMult: 1.25 },
    hero: { id: 'hero', label: 'بطل', desc: 'حراس نخبة سريعون · مطاردات زعيم الرابتور · مكافأة عملات مضاعفة!', guardSpeed: 1.18, coneScale: 1.12, timeBonus: -8, magnetBonus: -4, startShield: 0, sleepPause: 0.15, dashCd: 1.42, coinMult: 1.55 }
  };

  var SKINS = [
    { id: 0, name: 'بطل المزرعة', desc: 'خوذة التيربو الكلاسيكية الجاهزة للانطلاق', cost: 0, body: '#2b8cff', trim: '#ffd23f', cape: '#ff5964' },
    { id: 1, name: 'نينجا البيض', desc: 'وشاح الظل الخفي وعصابة النينجا القرمزية', cost: 15, body: '#2d3142', trim: '#ff3b5c', cape: '#00e5ff' },
    { id: 2, name: 'فارس الرابتور', desc: 'درع الديناصور الأخضر مع عرف الرابتور الناري', cost: 30, body: '#22c55e', trim: '#ff9f1c', cape: '#fde047' },
    { id: 3, name: 'رائد الفضاء', desc: 'بدلة المدار الفضائية مع خوذة الليزر الذهبية', cost: 45, body: '#e2e8f0', trim: '#00d4ff', cape: '#8b5cf6' },
    { id: 4, name: 'ثعلب البرق', desc: 'أذنا الثعلب الذهبي وشرارات السرعة الخارقة', cost: 60, body: '#ff7b00', trim: '#ffee32', cape: '#00bbf9' }
  ];

  var WORLDS = [
    { id: 'w1', idx: 0, name: 'مزرعة التيربو', badge: 'العالم 1', sub: 'أنفاق القش · منصات النابض · الديك المدرع', podType: 'hay', eggSpecial: 'gold', color: '#3ecf6e' },
    { id: 'w2', idx: 1, name: 'وادي الديناصورات', badge: 'العالم 2', sub: 'بيض الرابتور العملاق · ينابيع الهواء · زعيم تي ريكس', podType: 'fern', eggSpecial: 'dino', color: '#ff9f1c' },
    { id: 'w3', idx: 2, name: 'قلعة الجليد', badge: 'العالم 3', sub: 'مسارات التزلج التيربو · حارس اليتي الآلي', podType: 'igloo', eggSpecial: 'gold', color: '#38bdf8' },
    { id: 'w4', idx: 3, name: 'المختبر الآلي', badge: 'العالم 4', sub: 'بوابات الانتقال · مفاتيح الليزر · طائرات الحراسة', podType: 'holo', eggSpecial: 'cyber', color: '#a855f7' }
  ];

  var EGG_SPECS = { normal: { pts: 100, coins: 2 }, gold: { pts: 220, coins: 4 }, dino: { pts: 250, coins: 5 }, cyber: { pts: 250, coins: 5 } };
  var GUARD_SPECS = {
    rooster: { name: 'الديك المدرع', r: 24, speed: 122, coneRange: 205, coneHalf: 0.46 },
    dog:     { name: 'الكلب الآلي', r: 25, speed: 142, coneRange: 225, coneHalf: 0.48 },
    trex:    { name: 'تي ريكس الحارس', r: 32, speed: 130, coneRange: 240, coneHalf: 0.52, boss: true },
    yeti:    { name: 'حارس اليتي', r: 28, speed: 134, coneRange: 215, coneHalf: 0.48 },
    drone:   { name: 'طائرة الحراسة', r: 23, speed: 152, coneRange: 230, coneHalf: 0.44 }
  };

  /* 12 Open Stages (3 per World) — Spawn (128, 385) has clear rightward lane x:128..470 */
  var STAGES = [
    { id: 'w1s1', world: 0, stageIdx: 0, title: 'حظيرة الانطلاق', goal: 5, time: 80,
      walls: [{ x: 520, y: 175, w: 120, h: 95, kind: 'barn' }, { x: 520, y: 500, w: 120, h: 95, kind: 'barn' }, { x: 880, y: 335, w: 95, h: 100, kind: 'crate' }],
      hides: [{ x: 390, y: 235 }, { x: 745, y: 495 }],
      pads: [{ kind: 'spring', x: 340, y: 545, dx: 1, dy: -0.35 }, { kind: 'mud', x: 650, y: 340, w: 150, h: 90 }],
      pickups: [{ kind: 'feather', x: 690, y: 200 }],
      eggs: [{ x: 335, y: 385, kind: 'normal' }, { x: 455, y: 155, kind: 'normal' }, { x: 760, y: 215, kind: 'normal' }, { x: 760, y: 575, kind: 'normal' }, { x: 1115, y: 385, kind: 'gold' }, { x: 1060, y: 170, kind: 'normal' }],
      guards: [{ type: 'rooster', pts: [[700, 160], [1020, 160], [1020, 290], [700, 290]] }, { type: 'rooster', pts: [[980, 600], [690, 600], [690, 465], [980, 465]] }] },
    { id: 'w1s2', world: 0, stageIdx: 1, title: 'ممر الكلاب الآلية', goal: 6, time: 84,
      walls: [{ x: 500, y: 295, w: 90, h: 180, kind: 'barn' }, { x: 830, y: 155, w: 110, h: 100, kind: 'crate' }, { x: 830, y: 515, w: 110, h: 100, kind: 'crate' }],
      hides: [{ x: 375, y: 205 }, { x: 685, y: 385 }, { x: 1020, y: 270 }],
      pads: [{ kind: 'spring', x: 330, y: 575, dx: 1, dy: 0 }, { kind: 'spring', x: 1050, y: 575, dx: -1, dy: -0.25 }, { kind: 'mud', x: 580, y: 155, w: 165, h: 80 }],
      pickups: [{ kind: 'shield', x: 675, y: 575 }],
      eggs: [{ x: 355, y: 385, kind: 'normal' }, { x: 650, y: 195, kind: 'normal' }, { x: 650, y: 575, kind: 'normal' }, { x: 1015, y: 165, kind: 'gold' }, { x: 1135, y: 385, kind: 'gold' }, { x: 1015, y: 605, kind: 'normal' }, { x: 430, y: 600, kind: 'normal' }],
      guards: [{ type: 'dog', pts: [[640, 260], [990, 260]] }, { type: 'dog', pts: [[990, 490], [640, 490]] }, { type: 'rooster', pts: [[1120, 200], [1120, 565]] }] },
    { id: 'w1s3', world: 0, stageIdx: 2, title: 'مهرجان التيربو', goal: 7, time: 88,
      walls: [{ x: 485, y: 165, w: 95, h: 115, kind: 'barn' }, { x: 485, y: 490, w: 95, h: 115, kind: 'barn' }, { x: 815, y: 325, w: 105, h: 120, kind: 'barn' }],
      hides: [{ x: 375, y: 525 }, { x: 675, y: 245 }, { x: 1010, y: 385 }],
      pads: [{ kind: 'spring', x: 360, y: 200, dx: 1, dy: 0.2 }, { kind: 'spring', x: 965, y: 585, dx: -1, dy: 0 }, { kind: 'mud', x: 605, y: 345, w: 165, h: 85 }, { kind: 'mud', x: 955, y: 165, w: 155, h: 80 }],
      pickups: [{ kind: 'feather', x: 685, y: 565 }, { kind: 'shield', x: 700, y: 145 }],
      eggs: [{ x: 345, y: 385, kind: 'normal' }, { x: 645, y: 160, kind: 'normal' }, { x: 645, y: 605, kind: 'normal' }, { x: 870, y: 175, kind: 'gold' }, { x: 870, y: 595, kind: 'normal' }, { x: 1145, y: 245, kind: 'gold' }, { x: 1145, y: 525, kind: 'gold' }, { x: 1155, y: 385, kind: 'normal' }],
      guards: [{ type: 'dog', pts: [[625, 225], [990, 225]] }, { type: 'dog', pts: [[990, 535], [625, 535]] }, { type: 'rooster', pts: [[685, 300], [685, 470]] }, { type: 'rooster', pts: [[1095, 175], [1095, 595]] }] },
    { id: 'w2s1', world: 1, stageIdx: 0, title: 'عش الرابتور', goal: 5, time: 82,
      walls: [{ x: 525, y: 175, w: 110, h: 105, kind: 'rock' }, { x: 525, y: 495, w: 110, h: 105, kind: 'rock' }, { x: 890, y: 335, w: 105, h: 105, kind: 'rock' }],
      hides: [{ x: 400, y: 245 }, { x: 750, y: 515 }, { x: 1045, y: 235 }],
      pads: [{ kind: 'boost', x: 500, y: 345, w: 230, h: 80, dx: 1, dy: 0 }, { kind: 'boost', x: 680, y: 595, w: 250, h: 62, dx: -1, dy: 0 }],
      pickups: [{ kind: 'feather', x: 760, y: 175 }],
      eggs: [{ x: 345, y: 385, kind: 'normal' }, { x: 685, y: 225, kind: 'dino' }, { x: 685, y: 545, kind: 'normal' }, { x: 1055, y: 165, kind: 'dino' }, { x: 1135, y: 385, kind: 'gold' }, { x: 1055, y: 595, kind: 'normal' }],
      guards: [{ type: 'trex', pts: [[790, 240], [1075, 240], [1075, 525], [790, 525]] }, { type: 'rooster', pts: [[445, 165], [445, 590]] }] },
    { id: 'w2s2', world: 1, stageIdx: 1, title: 'جسر البراكين', goal: 6, time: 85,
      walls: [{ x: 490, y: 285, w: 95, h: 195, kind: 'rock' }, { x: 810, y: 160, w: 100, h: 110, kind: 'rock' }, { x: 810, y: 505, w: 100, h: 110, kind: 'rock' }],
      hides: [{ x: 375, y: 530 }, { x: 675, y: 385 }, { x: 1015, y: 385 }],
      pads: [{ kind: 'boost', x: 460, y: 165, w: 260, h: 72, dx: 1, dy: 0 }, { kind: 'boost', x: 460, y: 535, w: 260, h: 72, dx: -1, dy: 0 }, { kind: 'spring', x: 960, y: 200, dx: 0, dy: 1 }],
      pickups: [{ kind: 'shield', x: 660, y: 270 }],
      eggs: [{ x: 345, y: 385, kind: 'normal' }, { x: 750, y: 200, kind: 'dino' }, { x: 750, y: 575, kind: 'normal' }, { x: 985, y: 155, kind: 'normal' }, { x: 1140, y: 295, kind: 'dino' }, { x: 1140, y: 485, kind: 'dino' }, { x: 985, y: 615, kind: 'gold' }],
      guards: [{ type: 'trex', pts: [[945, 265], [1110, 265], [1110, 505], [945, 505]] }, { type: 'dog', pts: [[635, 195], [635, 575]] }] },
    { id: 'w2s3', world: 1, stageIdx: 2, title: 'عرين التي ريكس', goal: 8, time: 92,
      walls: [{ x: 485, y: 165, w: 100, h: 105, kind: 'rock' }, { x: 485, y: 500, w: 100, h: 105, kind: 'rock' }, { x: 830, y: 330, w: 105, h: 110, kind: 'rock' }],
      hides: [{ x: 385, y: 255 }, { x: 690, y: 385 }, { x: 1020, y: 215 }, { x: 1020, y: 555 }],
      pads: [{ kind: 'boost', x: 590, y: 150, w: 260, h: 68, dx: 1, dy: 0 }, { kind: 'boost', x: 590, y: 555, w: 260, h: 68, dx: -1, dy: 0 }, { kind: 'spring', x: 350, y: 565, dx: 1, dy: -0.3 }],
      pickups: [{ kind: 'shield', x: 535, y: 385 }, { kind: 'feather', x: 880, y: 205 }],
      eggs: [{ x: 340, y: 385, kind: 'normal' }, { x: 655, y: 235, kind: 'normal' }, { x: 655, y: 535, kind: 'dino' }, { x: 880, y: 145, kind: 'normal' }, { x: 880, y: 625, kind: 'gold' }, { x: 1140, y: 195, kind: 'dino' }, { x: 1150, y: 385, kind: 'dino' }, { x: 1140, y: 575, kind: 'gold' }, { x: 425, y: 150, kind: 'normal' }],
      guards: [{ type: 'trex', pts: [[645, 250], [990, 250]] }, { type: 'trex', pts: [[990, 520], [645, 520]] }, { type: 'rooster', pts: [[1105, 225], [1105, 545]] }] },
    { id: 'w3s1', world: 2, stageIdx: 0, title: 'زحليقة البطريق', goal: 6, time: 82,
      walls: [{ x: 520, y: 295, w: 110, h: 180, kind: 'ice' }, { x: 875, y: 295, w: 110, h: 180, kind: 'ice' }],
      hides: [{ x: 390, y: 255 }, { x: 750, y: 385 }, { x: 1055, y: 500 }],
      pads: [{ kind: 'boost', x: 420, y: 135, w: 560, h: 74, dx: 1, dy: 0 }, { kind: 'boost', x: 420, y: 565, w: 560, h: 74, dx: -1, dy: 0 }, { kind: 'spring', x: 1125, y: 205, dx: 0, dy: 1 }],
      pickups: [{ kind: 'feather', x: 750, y: 225 }],
      eggs: [{ x: 345, y: 385, kind: 'normal' }, { x: 575, y: 170, kind: 'normal' }, { x: 925, y: 170, kind: 'gold' }, { x: 1135, y: 385, kind: 'gold' }, { x: 925, y: 600, kind: 'normal' }, { x: 575, y: 600, kind: 'normal' }, { x: 750, y: 500, kind: 'normal' }],
      guards: [{ type: 'yeti', pts: [[700, 240], [700, 535]] }, { type: 'yeti', pts: [[1055, 235], [1055, 535]] }] },
    { id: 'w3s2', world: 2, stageIdx: 1, title: 'متاهة الكريستال', goal: 7, time: 86,
      walls: [{ x: 495, y: 170, w: 105, h: 105, kind: 'ice' }, { x: 495, y: 495, w: 105, h: 105, kind: 'ice' }, { x: 825, y: 170, w: 105, h: 105, kind: 'ice' }, { x: 825, y: 495, w: 105, h: 105, kind: 'ice' }],
      hides: [{ x: 375, y: 525 }, { x: 710, y: 215 }, { x: 1030, y: 385 }],
      pads: [{ kind: 'boost', x: 465, y: 348, w: 480, h: 74, dx: 1, dy: 0 }, { kind: 'boost', x: 635, y: 560, w: 165, h: 74, dx: -1, dy: 0 }, { kind: 'spring', x: 1135, y: 385, dx: -1, dy: -0.45 }],
      pickups: [{ kind: 'shield', x: 710, y: 545 }],
      eggs: [{ x: 345, y: 385, kind: 'normal' }, { x: 710, y: 150, kind: 'gold' }, { x: 710, y: 385, kind: 'normal' }, { x: 710, y: 615, kind: 'normal' }, { x: 1070, y: 165, kind: 'gold' }, { x: 1070, y: 605, kind: 'gold' }, { x: 1155, y: 270, kind: 'normal' }, { x: 415, y: 155, kind: 'normal' }],
      guards: [{ type: 'yeti', pts: [[645, 295], [990, 295]] }, { type: 'yeti', pts: [[990, 475], [645, 475]] }, { type: 'dog', pts: [[1095, 200], [1095, 570]] }] },
    { id: 'w3s3', world: 2, stageIdx: 2, title: 'عاصفة القمة', goal: 8, time: 92,
      walls: [{ x: 515, y: 330, w: 100, h: 110, kind: 'ice' }, { x: 845, y: 175, w: 100, h: 105, kind: 'ice' }, { x: 845, y: 495, w: 100, h: 105, kind: 'ice' }],
      hides: [{ x: 390, y: 220 }, { x: 695, y: 385 }, { x: 1020, y: 235 }, { x: 1020, y: 535 }],
      pads: [{ kind: 'boost', x: 430, y: 135, w: 370, h: 68, dx: 1, dy: 0 }, { kind: 'boost', x: 430, y: 570, w: 370, h: 68, dx: -1, dy: 0 }, { kind: 'spring', x: 350, y: 545, dx: 1, dy: -0.35 }, { kind: 'spring', x: 1140, y: 385, dx: -1, dy: 0 }],
      pickups: [{ kind: 'feather', x: 695, y: 225 }, { kind: 'shield', x: 695, y: 545 }],
      eggs: [{ x: 340, y: 385, kind: 'normal' }, { x: 565, y: 235, kind: 'normal' }, { x: 565, y: 535, kind: 'normal' }, { x: 780, y: 385, kind: 'gold' }, { x: 990, y: 155, kind: 'gold' }, { x: 990, y: 615, kind: 'gold' }, { x: 1145, y: 235, kind: 'gold' }, { x: 1145, y: 535, kind: 'normal' }, { x: 445, y: 605, kind: 'normal' }],
      guards: [{ type: 'yeti', pts: [[665, 195], [665, 575]] }, { type: 'yeti', pts: [[985, 310], [1120, 310], [1120, 460], [985, 460]] }, { type: 'trex', pts: [[775, 255], [1035, 255]] }] },
    { id: 'w4s1', world: 3, stageIdx: 0, title: 'بوابة الانتقال', goal: 6, time: 84,
      walls: [{ x: 535, y: 170, w: 95, h: 130, kind: 'tech' }, { x: 535, y: 470, w: 95, h: 130, kind: 'tech' }, { x: 875, y: 320, w: 95, h: 130, kind: 'tech' }],
      hides: [{ x: 405, y: 245 }, { x: 745, y: 515 }, { x: 1045, y: 245 }],
      pads: [], portals: [{ x1: 350, y1: 565, x2: 1065, y2: 175, color: '#00e5ff' }], switches: [], lasers: [],
      pickups: [{ kind: 'feather', x: 725, y: 225 }],
      eggs: [{ x: 345, y: 385, kind: 'normal' }, { x: 705, y: 165, kind: 'cyber' }, { x: 705, y: 595, kind: 'normal' }, { x: 1135, y: 175, kind: 'cyber' }, { x: 1135, y: 385, kind: 'gold' }, { x: 1135, y: 585, kind: 'cyber' }, { x: 445, y: 155, kind: 'normal' }],
      guards: [{ type: 'drone', pts: [[695, 255], [1020, 255]] }, { type: 'drone', pts: [[1020, 515], [695, 515]] }] },
    { id: 'w4s2', world: 3, stageIdx: 1, title: 'مفاتيح الليزر', goal: 7, time: 88,
      walls: [{ x: 515, y: 295, w: 90, h: 180, kind: 'tech' }, { x: 870, y: 88, w: 44, h: 155, kind: 'tech' }, { x: 870, y: 525, w: 44, h: 157, kind: 'tech' }],
      hides: [{ x: 385, y: 235 }, { x: 715, y: 385 }, { x: 1035, y: 515 }],
      pads: [{ kind: 'spring', x: 355, y: 565, dx: 1, dy: -0.25 }],
      portals: [{ x1: 420, y1: 165, x2: 1035, y2: 175, color: '#c084fc' }],
      switches: [{ x: 685, y: 215, gateId: 'g1' }, { x: 685, y: 555, gateId: 'g1' }, { x: 955, y: 385, gateId: 'g1' }],
      lasers: [{ id: 'g1', x: 878, y: 248, w: 28, h: 272 }],
      pickups: [{ kind: 'shield', x: 760, y: 165 }],
      eggs: [{ x: 345, y: 385, kind: 'normal' }, { x: 650, y: 155, kind: 'normal' }, { x: 650, y: 615, kind: 'normal' }, { x: 1015, y: 295, kind: 'cyber' }, { x: 1145, y: 205, kind: 'cyber' }, { x: 1145, y: 385, kind: 'gold' }, { x: 1145, y: 565, kind: 'cyber' }, { x: 430, y: 605, kind: 'normal' }],
      guards: [{ type: 'drone', pts: [[665, 275], [820, 275], [820, 495], [665, 495]] }, { type: 'drone', pts: [[1065, 225], [1065, 545]] }, { type: 'dog', pts: [[390, 200], [390, 520]] }] },
    { id: 'w4s3', world: 3, stageIdx: 2, title: 'قلب المختبر', goal: 8, time: 94,
      walls: [{ x: 495, y: 165, w: 95, h: 110, kind: 'tech' }, { x: 495, y: 495, w: 95, h: 110, kind: 'tech' }, { x: 845, y: 330, w: 100, h: 110, kind: 'tech' }],
      hides: [{ x: 380, y: 255 }, { x: 685, y: 385 }, { x: 1015, y: 225 }, { x: 1015, y: 545 }],
      pads: [{ kind: 'boost', x: 585, y: 575, w: 290, h: 66, dx: -1, dy: 0 }],
      portals: [{ x1: 350, y1: 570, x2: 1075, y2: 165, color: '#00e5ff' }, { x1: 665, y1: 165, x2: 1075, y2: 595, color: '#f472b6' }],
      switches: [{ x: 685, y: 270, gateId: 'g2' }, { x: 965, y: 495, gateId: 'g2' }],
      lasers: [{ id: 'g2', x: 880, y: 125, w: 28, h: 195 }],
      pickups: [{ kind: 'feather', x: 750, y: 495 }, { kind: 'shield', x: 440, y: 150 }],
      eggs: [{ x: 340, y: 385, kind: 'normal' }, { x: 645, y: 235, kind: 'cyber' }, { x: 645, y: 535, kind: 'normal' }, { x: 790, y: 165, kind: 'gold' }, { x: 995, y: 165, kind: 'cyber' }, { x: 1150, y: 265, kind: 'cyber' }, { x: 1150, y: 385, kind: 'dino' }, { x: 1150, y: 515, kind: 'cyber' }, { x: 965, y: 615, kind: 'normal' }],
      guards: [{ type: 'drone', pts: [[645, 225], [820, 225]] }, { type: 'drone', pts: [[995, 295], [1110, 295], [1110, 485], [995, 485]] }, { type: 'trex', pts: [[650, 515], [985, 515]] }] }
  ];

  function buildVsTemplate(worldIdx) {
    var wInfo = WORLDS[clamp(worldIdx | 0, 0, 3)];
    var gType = worldIdx === 1 ? 'trex' : worldIdx === 2 ? 'yeti' : worldIdx === 3 ? 'drone' : 'dog';
    var wallKind = worldIdx === 1 ? 'rock' : worldIdx === 2 ? 'ice' : worldIdx === 3 ? 'tech' : 'barn';
    var pads = [], portals = [];
    if (worldIdx === 2) pads.push({ kind: 'boost', x: 470, y: 135, w: 340, h: 68, dx: -1, dy: 0 }, { kind: 'boost', x: 470, y: 565, w: 340, h: 68, dx: 1, dy: 0 });
    else if (worldIdx === 3) portals.push({ x1: 370, y1: 175, x2: 910, y2: 595, color: '#00e5ff' });
    else pads.push({ kind: 'spring', x: 420, y: 565, dx: 1, dy: -0.4 }, { kind: 'spring', x: 860, y: 205, dx: -1, dy: 0.4 });
    return {
      id: wInfo.id + 'vs', world: wInfo.idx, stageIdx: 0, title: 'سباق اللصوص: ' + wInfo.name, goal: 7, time: 68,
      walls: [{ x: 595, y: 215, w: 90, h: 95, kind: wallKind }, { x: 595, y: 460, w: 90, h: 95, kind: wallKind }],
      hides: [{ x: 435, y: 270 }, { x: 845, y: 500 }], pads: pads, portals: portals, switches: [], lasers: [],
      pickups: [{ kind: 'feather', x: 640, y: 145 }, { kind: 'shield', x: 640, y: 625 }],
      eggs: [{ x: 640, y: 385, kind: wInfo.eggSpecial }, { x: 495, y: 185, kind: 'normal' }, { x: 785, y: 185, kind: 'normal' }, { x: 495, y: 585, kind: 'normal' }, { x: 785, y: 585, kind: 'normal' }, { x: 485, y: 385, kind: 'gold' }, { x: 795, y: 385, kind: 'gold' }],
      guards: [{ type: gType, pts: [[515, 345], [765, 345]] }, { type: worldIdx === 0 ? 'rooster' : gType, pts: [[765, 425], [515, 425]] }]
    };
  }

  function getStage(indexOrId) {
    if (typeof indexOrId === 'string') {
      for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === indexOrId) return STAGES[i];
    }
    return STAGES[clamp(indexOrId | 0, 0, STAGES.length - 1)];
  }
  function stageIndexOf(worldIdx, stageIdx) { return clamp(worldIdx | 0, 0, 3) * 3 + clamp(stageIdx | 0, 0, 2); }
  function chainSpeedMult(n) { return n <= 0 ? 1.0 : n === 1 ? 1.07 : n === 2 ? 1.15 : 1.24; }
  function chainScoreMult(n) { return n <= 1 ? 1.0 : n === 2 ? 1.5 : 2.2 + (n - 3) * 0.4; }
  function atHome(p) { return Math.hypot(p.x - p.home.x, p.y - p.home.y) <= p.home.r; }

  function circleVsRect(cx, cy, cr, rx, ry, rw, rh) {
    var nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
    var dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
    if (d2 >= cr * cr) return null;
    if (d2 > 1e-6) { var d = Math.sqrt(d2); return { x: (dx / d) * (cr - d), y: (dy / d) * (cr - d) }; }
    var dl = cx - rx, dr = (rx + rw) - cx, dt = cy - ry, db = (ry + rh) - cy, m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: -(dl + cr), y: 0 };
    if (m === dr) return { x: dr + cr, y: 0 };
    return m === dt ? { x: 0, y: -(dt + cr) } : { x: 0, y: db + cr };
  }

  function segmentIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    var t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1;
    var p = [-dx, dx, -dy, dy], q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-8) { if (q[i] < 0) return false; }
      else {
        var t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
        else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
    }
    return t0 <= t1;
  }

  function clearSight(world, x1, y1, x2, y2) {
    for (var i = 0; i < world.walls.length; i++) {
      var w = world.walls[i];
      if (segmentIntersectsRect(x1, y1, x2, y2, w.x, w.y, w.w, w.h)) return false;
    }
    return true;
  }

  function resolveArenaAndWalls(world, ent) {
    var r = ent.r;
    ent.x = clamp(ent.x, AX0 + r, AX1 - r); ent.y = clamp(ent.y, AY0 + r, AY1 - r);
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < world.walls.length; i++) {
        var w = world.walls[i], push = circleVsRect(ent.x, ent.y, r, w.x, w.y, w.w, w.h);
        if (push) { ent.x += push.x; ent.y += push.y; }
      }
      ent.x = clamp(ent.x, AX0 + r, AX1 - r); ent.y = clamp(ent.y, AY0 + r, AY1 - r);
    }
  }

  function makePlayer(id, x, y, home, skinId, startShield) {
    return {
      id: id, x: x, y: y, spawnX: x, spawnY: y, vx: 0, vy: 0, r: 21,
      facing: id === 1 ? Math.PI : 0, skin: skinId | 0, home: { x: home.x, y: home.y, r: home.r || 64 },
      carry: [], hatched: 0, score: 0, bestChain: 0, bonks: 0, shield: startShield | 0, featherTimer: 0,
      dashTimer: 0, dashCd: 0, dashDx: id === 1 ? -1 : 1, dashDy: 0, decoyCd: 0,
      springTimer: 0, springCd: 0, springVx: 0, springVy: 0, portalCd: 0, bonkTimer: 0, bonkVx: 0, bonkVy: 0, invuln: 0,
      hidden: false, inMud: false, onBoost: false, moved: false, walkCycle: 0
    };
  }

  function safeEggSpot(walls, x, y) {
    for (var r = 0; r <= 120; r += 30) {
      for (var a = 0; a < 8; a++) {
        var ang = a * (Math.PI / 4), tx = clamp(x + Math.cos(ang) * r, AX0 + 40, AX1 - 40), ty = clamp(y + Math.sin(ang) * r, AY0 + 40, AY1 - 40);
        var hit = false;
        for (var i = 0; i < walls.length; i++) if (circleVsRect(tx, ty, 28, walls[i].x, walls[i].y, walls[i].w, walls[i].h)) { hit = true; break; }
        if (!hit) return { x: tx, y: ty };
      }
    }
    return { x: 350, y: 385 };
  }

  function createWorld(opts) {
    opts = opts || {};
    var mode = opts.mode === 'coop' || opts.mode === 'vs' ? opts.mode : 'solo';
    var diffKey = DIFFS[opts.diff] ? opts.diff : 'normal', diff = DIFFS[diffKey];
    var dda = typeof opts.dda === 'number' && Number.isFinite(opts.dda) ? clamp(opts.dda, 0, 1) : 0.35;
    var ddaShift = (dda - 0.35) * 0.16;
    var tpl = mode === 'vs' ? buildVsTemplate(opts.world != null ? opts.world : 0) : getStage(opts.stage != null ? opts.stage : 0);
    var wInfo = WORLDS[tpl.world] || WORLDS[0];
    var rng = makeRng(opts.seed != null ? opts.seed : (tpl.world * 97 + tpl.stageIdx * 31 + 17));
    var guardSpeedScale = clamp(diff.guardSpeed * (1 + ddaShift), 0.62, 1.32);
    var coneScale = clamp(diff.coneScale * (1 + ddaShift * 0.5), 0.75, 1.22);
    var totalTime = Math.max(45, Math.round(tpl.time + diff.timeBonus - ddaShift * 18));
    var goal = mode === 'coop' ? tpl.goal + 2 : tpl.goal;
    var tuning = { baseSpeed: 296, guardSpeedScale: guardSpeedScale, coneScale: coneScale, magnetBonus: diff.magnetBonus, sleepPause: diff.sleepPause, dashCd: diff.dashCd, coinMult: diff.coinMult };

    var players = [], skin0 = clamp(opts.skin | 0, 0, SKINS.length - 1);
    var skin1 = opts.skin2 != null ? clamp(opts.skin2 | 0, 0, SKINS.length - 1) : ((skin0 + 2) % SKINS.length);
    if (mode === 'vs') players.push(makePlayer(0, 120, 385, { x: 120, y: 385, r: 64 }, skin0, diff.startShield), makePlayer(1, 1160, 385, { x: 1160, y: 385, r: 64 }, skin1, diff.startShield));
    else if (mode === 'coop') { var sh = { x: 128, y: 385, r: 68 }; players.push(makePlayer(0, 128, 355, sh, skin0, diff.startShield), makePlayer(1, 128, 415, sh, skin1, diff.startShield)); }
    else players.push(makePlayer(0, 128, 385, { x: 128, y: 385, r: 66 }, skin0, diff.startShield));

    var walls = (tpl.walls || []).map(function (w) { return { x: w.x, y: w.y, w: w.w, h: w.h, kind: w.kind }; });
    var eggs = tpl.eggs.map(function (es, ei) { return { id: ei, x: es.x, y: es.y, nestX: es.x, nestY: es.y, kind: EGG_SPECS[es.kind] ? es.kind : 'normal', state: 'nest', carrier: -1, looseDelay: 0, looseAge: 0, wobble: ei * 1.1 }; });
    if (mode === 'coop') {
      var sp1 = safeEggSpot(walls, 430, 275), sp2 = safeEggSpot(walls, 760, 385);
      eggs.push(
        { id: eggs.length, x: sp1.x, y: sp1.y, nestX: sp1.x, nestY: sp1.y, kind: wInfo.eggSpecial, state: 'nest', carrier: -1, looseDelay: 0, looseAge: 0, wobble: 0.5 },
        { id: eggs.length + 1, x: sp2.x, y: sp2.y, nestX: sp2.x, nestY: sp2.y, kind: 'gold', state: 'nest', carrier: -1, looseDelay: 0, looseAge: 0, wobble: 1.7 }
      );
    }

    var guards = tpl.guards.map(function (gs, gi) {
      var spec = GUARD_SPECS[gs.type] || GUARD_SPECS.rooster, p0 = gs.pts[0], p1 = gs.pts[1 % gs.pts.length];
      return {
        id: gi, type: gs.type, x: p0[0], y: p0[1], r: spec.r,
        pts: gs.pts.map(function (pt) { return [pt[0], pt[1]]; }), wp: 1 % gs.pts.length,
        speed: spec.speed * guardSpeedScale, chaseSpeed: spec.speed * guardSpeedScale * 1.22,
        coneRange: spec.coneRange * coneScale, coneHalf: spec.coneHalf * coneScale,
        look: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), scanPhase: gi * 1.7,
        state: 'patrol', stateTimer: 0, pauseTimer: 0, bonkCd: 0, targetPid: -1, decoyTarget: null, bubble: '', bubbleTimer: 0, boss: !!spec.boss
      };
    });

    return {
      id: tpl.id, title: tpl.title, worldIdx: wInfo.idx, stageIdx: tpl.stageIdx, worldInfo: wInfo,
      mode: mode, diff: diffKey, tuning: tuning, rng: rng, time: 0, maxTime: totalTime, timeLeft: totalTime, goal: goal,
      hatched: 0, score: 0, coinsEarned: 0, bestChain: 0, comboBursts: 0, bonks: 0, over: false, won: false, winner: -1, stars: 0,
      walls: walls,
      hides: (tpl.hides || []).map(function (h) { return { x: h.x, y: h.y, r: h.r || 40, kind: wInfo.podType }; }),
      pads: (tpl.pads || []).map(function (pd) { return { kind: pd.kind, x: pd.x, y: pd.y, w: pd.w || 68, h: pd.h || 68, r: pd.r || 32, dx: pd.dx || 0, dy: pd.dy || 0, cd: 0 }; }),
      portals: (tpl.portals || []).map(function (pt, idx) { return { id: idx, x1: pt.x1, y1: pt.y1, x2: pt.x2, y2: pt.y2, r: 30, color: pt.color || '#00e5ff' }; }),
      switches: (tpl.switches || []).map(function (sw) { return { x: sw.x, y: sw.y, r: 26, gateId: sw.gateId, pressed: false }; }),
      lasers: (tpl.lasers || []).map(function (lz) { return { id: lz.id, x: lz.x, y: lz.y, w: lz.w, h: lz.h, openTimer: 0 }; }),
      pickups: (tpl.pickups || []).map(function (pk, idx) { return { id: idx, kind: pk.kind, x: pk.x, y: pk.y, r: 22, active: true }; }),
      players: players, eggs: eggs, guards: guards, decoys: [], babies: [], events: []
    };
  }

  function isAtStart(world) {
    if (!world || !world.players.length) return true;
    for (var i = 0; i < world.players.length; i++) {
      var p = world.players[i];
      if (p.moved || Math.hypot(p.x - p.spawnX, p.y - p.spawnY) > 2) return false;
    }
    return true;
  }

  function placeLooseEgg(world, px, py, awayX, awayY) {
    var baseAng = Math.atan2(py - awayY, px - awayX);
    if (!Number.isFinite(baseAng)) baseAng = 0;
    for (var k = 0; k < 8; k++) {
      var ang = baseAng + (k === 0 ? 0 : (k % 2 ? 0.55 : -0.55) * Math.ceil(k / 2));
      var tx = clamp(px + Math.cos(ang) * 52, AX0 + 28, AX1 - 28), ty = clamp(py + Math.sin(ang) * 52, AY0 + 28, AY1 - 28);
      var blocked = false;
      for (var wi = 0; wi < world.walls.length; wi++) {
        var w = world.walls[wi];
        if (circleVsRect(tx, ty, 18, w.x, w.y, w.w, w.h)) { blocked = true; break; }
      }
      if (!blocked) return { x: tx, y: ty };
    }
    return { x: clamp(px, AX0 + 28, AX1 - 28), y: clamp(py, AY0 + 28, AY1 - 28) };
  }

  function bonkPlayer(world, p, srcX, srcY, reason) {
    if (p.invuln > 0 || p.bonkTimer > 0 || atHome(p)) return false;
    if (p.shield > 0) {
      p.shield--; p.invuln = 1.5;
      world.events.push({ type: 'shieldPop', pid: p.id, x: p.x, y: p.y });
      return false;
    }
    var dx = p.x - srcX, dy = p.y - srcY, d = Math.hypot(dx, dy) || 1;
    p.bonkTimer = BONK_DURATION; p.invuln = 2.1; p.dashTimer = 0;
    p.bonkVx = (dx / d) * 240; p.bonkVy = (dy / d) * 240;
    p.bonks++; world.bonks++;
    var dropped = null;
    if (p.carry.length > 0) {
      dropped = p.carry.pop();
      var spot = placeLooseEgg(world, p.x, p.y, srcX, srcY);
      dropped.x = spot.x; dropped.y = spot.y; dropped.state = 'loose'; dropped.carrier = -1;
      dropped.looseDelay = 0.3; dropped.looseAge = 0;
    }
    world.events.push({ type: 'bonk', pid: p.id, reason: reason || 'guard', dropped: !!dropped, x: p.x, y: p.y });
    return true;
  }

  function canGuardSee(world, g, p) {
    if (p.hidden || atHome(p) || p.invuln > 0 || p.bonkTimer > 0) return false;
    if (g.state === 'sleep' || g.state === 'decoy' || g.bonkCd > 0) return false;
    var dx = p.x - g.x, dy = p.y - g.y, dist = Math.hypot(dx, dy);
    if (dist > g.coneRange) return false;
    if (dist > g.r + p.r + 12 && Math.abs(wrapAngle(Math.atan2(dy, dx) - g.look)) > g.coneHalf) return false;
    return clearSight(world, g.x, g.y, p.x, p.y);
  }

  function computeStars(world) {
    if (!world.won) return 0;
    if (world.mode === 'vs') return 3;
    var ratio = world.timeLeft / Math.max(1, world.maxTime);
    if ((ratio >= 0.32 || world.bestChain >= 3) && world.bonks <= 2) return 3;
    return (ratio >= 0.14 || world.bonks <= 3) ? 2 : 1;
  }

  function finishWorld(world, won, winnerPid) {
    if (world.over) return;
    world.over = true; world.won = !!won; world.winner = winnerPid == null ? -1 : winnerPid;
    if (won && world.mode !== 'vs') {
      world.score += Math.round(world.timeLeft * 10);
      world.stars = computeStars(world);
      world.coinsEarned += world.stars * 4;
    } else if (world.mode === 'vs') {
      world.stars = 3; world.coinsEarned = Math.max(6, world.coinsEarned);
    } else world.stars = 0;
    world.events.push({ type: won ? 'win' : 'lose', stars: world.stars, score: world.score, coins: world.coinsEarned, winner: world.winner });
  }

  function stepPlayer(world, p, inp, dt) {
    inp = inp || {};
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.featherTimer > 0) p.featherTimer = Math.max(0, p.featherTimer - dt);
    if (p.dashCd > 0) p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.decoyCd > 0) p.decoyCd = Math.max(0, p.decoyCd - dt);
    if (p.springCd > 0) p.springCd = Math.max(0, p.springCd - dt);
    if (p.portalCd > 0) p.portalCd = Math.max(0, p.portalCd - dt);

    var ix = +(inp.x || 0), iy = +(inp.y || 0), mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; } else if (mag < 0.04) { ix = 0; iy = 0; }

    if (inp.dash && p.dashCd <= 0 && p.bonkTimer <= 0) {
      p.dashTimer = 0.28; p.dashCd = world.tuning.dashCd;
      if (ix || iy) { p.dashDx = ix; p.dashDy = iy; p.facing = Math.atan2(iy, ix); }
      else { p.dashDx = Math.cos(p.facing); p.dashDy = Math.sin(p.facing); }
      p.moved = true;
      var droppedDecoy = false;
      if (p.decoyCd <= 0) {
        p.decoyCd = 3.5;
        var decoy = { x: p.x, y: p.y, life: 3.2, maxLife: 3.2, pid: p.id };
        world.decoys.push(decoy); droppedDecoy = true;
        for (var gi = 0; gi < world.guards.length; gi++) {
          var g = world.guards[gi];
          if (Math.hypot(g.x - decoy.x, g.y - decoy.y) <= 285 && g.bonkCd <= 0) {
            g.state = 'decoy'; g.decoyTarget = decoy; g.stateTimer = 2.4; g.bubble = '؟!'; g.bubbleTimer = 2.2;
            world.events.push({ type: 'distract', gid: g.id, x: g.x, y: g.y });
          }
        }
      }
      world.events.push({ type: 'dash', pid: p.id, decoy: droppedDecoy, x: p.x, y: p.y });
    }

    p.inMud = false; p.onBoost = false;
    var boostVx = 0, boostVy = 0;
    for (var pi = 0; pi < world.pads.length; pi++) {
      var pad = world.pads[pi];
      if (pad.kind === 'mud' && p.x >= pad.x && p.x <= pad.x + pad.w && p.y >= pad.y && p.y <= pad.y + pad.h) p.inMud = true;
      else if (pad.kind === 'boost' && p.x >= pad.x && p.x <= pad.x + pad.w && p.y >= pad.y && p.y <= pad.y + pad.h) {
        p.onBoost = true; boostVx += pad.dx * 165; boostVy += pad.dy * 165;
      } else if (pad.kind === 'spring' && p.springCd <= 0 && p.bonkTimer <= 0 && Math.hypot(p.x - pad.x, p.y - pad.y) <= pad.r + p.r * 0.6) {
        var sdx = (ix || iy) ? ix : (pad.dx || Math.cos(p.facing)), sdy = (ix || iy) ? iy : (pad.dy || Math.sin(p.facing));
        var sm = Math.hypot(sdx, sdy) || 1;
        p.springTimer = 0.32; p.springCd = 0.95; p.springVx = (sdx / sm) * 520; p.springVy = (sdy / sm) * 520; p.moved = true;
        world.events.push({ type: 'spring', pid: p.id, x: pad.x, y: pad.y });
      }
    }

    if (p.bonkTimer > 0) {
      p.bonkTimer = Math.max(0, p.bonkTimer - dt);
      var fade = 0.45 + 0.55 * (p.bonkTimer / BONK_DURATION);
      p.vx = p.bonkVx * fade + ix * 90; p.vy = p.bonkVy * fade + iy * 90;
    } else if (p.springTimer > 0) {
      p.springTimer = Math.max(0, p.springTimer - dt);
      p.vx = p.springVx + ix * 110; p.vy = p.springVy + iy * 110;
    } else if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      var dSpd = world.tuning.baseSpeed * chainSpeedMult(p.carry.length) * (p.inMud ? 2.05 : 1.85);
      if (ix || iy) { p.dashDx = ix; p.dashDy = iy; p.facing = Math.atan2(iy, ix); }
      p.vx = p.dashDx * dSpd + boostVx; p.vy = p.dashDy * dSpd + boostVy;
    } else {
      var spd = world.tuning.baseSpeed * chainSpeedMult(p.carry.length) * (p.featherTimer > 0 ? 1.24 : 1);
      if (ix || iy) { p.facing = Math.atan2(iy, ix); p.moved = true; }
      p.vx = ix * spd + (p.moved ? boostVx : 0); p.vy = iy * spd + (p.moved ? boostVx : 0);
    }

    p.x += p.vx * dt; p.y += p.vy * dt;
    resolveArenaAndWalls(world, p);
    var curSpd = Math.hypot(p.vx, p.vy);
    if (curSpd > 15) p.walkCycle += (curSpd / 180) * dt * 8;

    if (p.portalCd <= 0 && p.moved) {
      for (var ti = 0; ti < world.portals.length; ti++) {
        var pt = world.portals[ti], hit1 = Math.hypot(p.x - pt.x1, p.y - pt.y1) <= pt.r;
        var hit2 = !hit1 && Math.hypot(p.x - pt.x2, p.y - pt.y2) <= pt.r;
        if (hit1 || hit2) {
          p.x = hit1 ? pt.x2 : pt.x1; p.y = hit1 ? pt.y2 : pt.y1; p.portalCd = 1.15;
          for (var ci = 0; ci < p.carry.length; ci++) { p.carry[ci].x = p.x; p.carry[ci].y = p.y; }
          world.events.push({ type: 'portal', pid: p.id, x: p.x, y: p.y });
          break;
        }
      }
    }

    for (var si = 0; si < world.switches.length; si++) {
      var sw = world.switches[si];
      if (Math.hypot(p.x - sw.x, p.y - sw.y) <= sw.r + p.r * 0.65) {
        for (var li = 0; li < world.lasers.length; li++) {
          var lz = world.lasers[li];
          if (lz.id === sw.gateId) {
            if (lz.openTimer <= 0.5) world.events.push({ type: 'switch', pid: p.id, x: sw.x, y: sw.y });
            lz.openTimer = 7.5;
          }
        }
      }
    }
    for (var lzi = 0; lzi < world.lasers.length; lzi++) {
      var gate = world.lasers[lzi];
      if (gate.openTimer > 0) continue;
      var lPush = circleVsRect(p.x, p.y, p.r, gate.x, gate.y, gate.w, gate.h);
      if (lPush) { p.x += lPush.x; p.y += lPush.y; bonkPlayer(world, p, gate.x + gate.w / 2, gate.y + gate.h / 2, 'laser'); }
    }

    p.hidden = false;
    for (var hi = 0; hi < world.hides.length; hi++) {
      if (Math.hypot(p.x - world.hides[hi].x, p.y - world.hides[hi].y) <= world.hides[hi].r) { p.hidden = true; break; }
    }
    for (var ki = 0; ki < world.pickups.length; ki++) {
      var pk = world.pickups[ki];
      if (pk.active && Math.hypot(p.x - pk.x, p.y - pk.y) <= pk.r + p.r) {
        pk.active = false;
        if (pk.kind === 'feather') p.featherTimer = Math.max(p.featherTimer, 6.0);
        else if (pk.kind === 'shield') p.shield = Math.min(3, p.shield + 1);
        world.events.push({ type: 'powerup', pid: p.id, kind: pk.kind, x: pk.x, y: pk.y });
      }
    }

    if (p.bonkTimer <= 0 && p.carry.length < 5) {
      var pickR = 38 + world.tuning.magnetBonus + (p.featherTimer > 0 ? 22 : 0);
      for (var ei = 0; ei < world.eggs.length; ei++) {
        var egg = world.eggs[ei];
        if (egg.state !== 'nest' && !(egg.state === 'loose' && egg.looseDelay <= 0)) continue;
        if (Math.hypot(p.x - egg.x, p.y - egg.y) <= pickR) {
          egg.state = 'carried'; egg.carrier = p.id; p.carry.push(egg);
          world.events.push({ type: 'pickup', pid: p.id, eggType: egg.kind, chain: p.carry.length, x: egg.x, y: egg.y });
          if (p.carry.length >= 5) break;
        }
      }
    }
    for (var ci2 = 0; ci2 < p.carry.length; ci2++) {
      var ce = p.carry[ci2]; ce.wobble += dt * 9;
      var anchorX = ci2 === 0 ? p.x : p.carry[ci2 - 1].x, anchorY = ci2 === 0 ? p.y : p.carry[ci2 - 1].y;
      var spacing = ci2 === 0 ? 28 : 24, adx = ce.x - anchorX, ady = ce.y - anchorY, ad = Math.hypot(adx, ady);
      if (ad < 1) { adx = -Math.cos(p.facing); ady = -Math.sin(p.facing); ad = 1; }
      var tx = anchorX + (adx / ad) * spacing + Math.cos(ce.wobble + ci2) * 1.6;
      var ty = anchorY + (ady / ad) * spacing + Math.sin(ce.wobble + ci2) * 1.6;
      var blend = Math.min(1, dt * 18);
      ce.x += (tx - ce.x) * blend; ce.y += (ty - ce.y) * blend;
    }

    if (p.carry.length > 0 && atHome(p)) {
      var cnt = p.carry.length, rawPts = 0, rawCoins = 0;
      for (var di = 0; di < cnt; di++) {
        var de = p.carry[di], es2 = EGG_SPECS[de.kind] || EGG_SPECS.normal;
        rawPts += es2.pts; rawCoins += es2.coins; de.state = 'hatched'; de.carrier = -1;
        var bAng = (world.babies.length * 1.9) % TAU;
        world.babies.push({
          x: p.home.x + Math.cos(bAng) * (20 + (world.babies.length % 3) * 10),
          y: p.home.y + Math.sin(bAng) * (18 + (world.babies.length % 3) * 8),
          kind: de.kind === 'dino' ? 'raptor' : de.kind === 'cyber' ? 'mecha' : 'chick',
          phase: world.babies.length * 0.8, pid: p.id
        });
      }
      p.carry.length = 0;
      var gainedPts = Math.round(rawPts * chainScoreMult(cnt));
      var gainedCoins = Math.max(1, Math.round((rawCoins + (cnt >= 3 ? 4 : cnt === 2 ? 1 : 0)) * world.tuning.coinMult));
      p.hatched += cnt; p.score += gainedPts; p.bestChain = Math.max(p.bestChain, cnt);
      world.hatched += cnt; world.score += gainedPts; world.coinsEarned += gainedCoins;
      world.bestChain = Math.max(world.bestChain, cnt);
      if (cnt >= 3) { p.featherTimer = Math.max(p.featherTimer, 4.5); world.comboBursts++; }
      world.events.push({ type: 'hatch', pid: p.id, count: cnt, points: gainedPts, coins: gainedCoins, mega: cnt >= 3, x: p.home.x, y: p.home.y });
      if (world.mode === 'vs') { if (p.hatched >= world.goal) finishWorld(world, true, p.id); }
      else if (world.hatched >= world.goal) finishWorld(world, true, 0);
    }
  }

  function stepGuards(world, dt) {
    for (var i = 0; i < world.guards.length; i++) {
      var g = world.guards[i]; g.scanPhase += dt * 2.4;
      if (g.bonkCd > 0) g.bonkCd = Math.max(0, g.bonkCd - dt);
      if (g.bubbleTimer > 0 && (g.bubbleTimer = Math.max(0, g.bubbleTimer - dt)) <= 0) g.bubble = '';

      if (g.state !== 'decoy' && g.state !== 'sleep' && g.bonkCd <= 0) {
        for (var pi = 0; pi < world.players.length; pi++) {
          var pl = world.players[pi];
          if (canGuardSee(world, g, pl)) {
            if (g.state !== 'chase') { g.bubble = '!'; g.bubbleTimer = 1.2; world.events.push({ type: 'spot', gid: g.id, pid: pl.id, x: g.x, y: g.y }); }
            g.state = 'chase'; g.targetPid = pl.id; g.stateTimer = 2.0; break;
          }
        }
      }

      var tx = g.x, ty = g.y, spd = g.speed;
      if (g.state === 'decoy') {
        g.stateTimer -= dt;
        if (!g.decoyTarget || g.decoyTarget.life <= 0 || g.stateTimer <= 0) { g.state = 'patrol'; g.decoyTarget = null; }
        else { tx = g.decoyTarget.x; ty = g.decoyTarget.y; spd = g.speed * 0.95; }
      } else if (g.state === 'chase') {
        g.stateTimer -= dt;
        var tgt = world.players[g.targetPid];
        if (!tgt || tgt.hidden || atHome(tgt) || g.stateTimer <= 0) { g.state = 'patrol'; g.bubble = '؟'; g.bubbleTimer = 0.9; }
        else { tx = tgt.x; ty = tgt.y; spd = g.chaseSpeed; }
      } else if (g.state === 'sleep' && (g.pauseTimer -= dt) <= 0) { g.state = 'patrol'; g.bubble = ''; }

      if (g.state === 'patrol') {
        var wp = g.pts[g.wp]; tx = wp[0]; ty = wp[1];
        if (Math.hypot(tx - g.x, ty - g.y) <= 10) {
          g.wp = (g.wp + 1) % g.pts.length;
          if (world.tuning.sleepPause >= 0.4 || g.boss) {
            g.state = 'sleep'; g.pauseTimer = g.boss ? Math.max(0.75, world.tuning.sleepPause) : world.tuning.sleepPause;
            g.bubble = '💤'; g.bubbleTimer = g.pauseTimer;
          }
        }
      }

      if (g.state !== 'sleep') {
        var dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
        if (d > 4) {
          var stepLen = Math.min(d, spd * dt);
          g.x += (dx / d) * stepLen; g.y += (dy / d) * stepLen;
          var wantLook = Math.atan2(dy, dx) + (g.state === 'patrol' ? Math.sin(g.scanPhase) * 0.22 : 0);
          g.look = wrapAngle(g.look + wrapAngle(wantLook - g.look) * Math.min(1, dt * 8));
        }
        resolveArenaAndWalls(world, g);
      }

      for (var hi = 0; hi < world.players.length; hi++) {
        var hm = world.players[hi].home, hdx = g.x - hm.x, hdy = g.y - hm.y, hd = Math.hypot(hdx, hdy), minD = hm.r + g.r + 18;
        if (hd < minD) { var nh = hd || 1; g.x = hm.x + (hdx / nh) * minD; g.y = hm.y + (hdy / nh) * minD; if (g.state === 'chase') g.state = 'patrol'; }
      }

      if (g.bonkCd <= 0 && g.state !== 'sleep' && g.state !== 'decoy') {
        for (var cpi = 0; cpi < world.players.length; cpi++) {
          var cp = world.players[cpi];
          if (cp.hidden || atHome(cp) || cp.invuln > 0 || cp.bonkTimer > 0) continue;
          if (Math.hypot(cp.x - g.x, cp.y - g.y) <= g.r + cp.r - 2) {
            bonkPlayer(world, cp, g.x, g.y, 'guard');
            g.bonkCd = 1.35; g.state = 'patrol'; g.bubble = '!'; g.bubbleTimer = 0.9;
          }
        }
      }
    }
  }

  function stepWorld(world, dt, inputs) {
    if (!world || world.over) return;
    dt = clamp(+dt || 0, 0, 0.05);
    if (dt <= 0) return;

    world.time += dt; world.timeLeft = Math.max(0, world.maxTime - world.time);
    for (var li = 0; li < world.lasers.length; li++) if (world.lasers[li].openTimer > 0) world.lasers[li].openTimer = Math.max(0, world.lasers[li].openTimer - dt);
    for (var di = world.decoys.length - 1; di >= 0; di--) if ((world.decoys[di].life -= dt) <= 0) world.decoys.splice(di, 1);
    for (var ei = 0; ei < world.eggs.length; ei++) {
      var egg = world.eggs[ei];
      if (egg.state === 'loose') {
        if (egg.looseDelay > 0) egg.looseDelay = Math.max(0, egg.looseDelay - dt);
        if ((egg.looseAge += dt) > 20) { egg.x = egg.nestX; egg.y = egg.nestY; egg.state = 'nest'; egg.looseAge = 0; }
      }
    }
    if (world.mode === 'vs') {
      var avail = 0;
      for (var vi = 0; vi < world.eggs.length; vi++) if (world.eggs[vi].state !== 'hatched') avail++;
      if (avail < 4) {
        for (var rvi = 0; rvi < world.eggs.length && avail < 6; rvi++) {
          var re = world.eggs[rvi];
          if (re.state === 'hatched') { re.state = 'nest'; re.x = re.nestX; re.y = re.nestY; re.carrier = -1; avail++; }
        }
      }
    }

    inputs = inputs || [];
    for (var pi = 0; pi < world.players.length; pi++) {
      stepPlayer(world, world.players[pi], inputs[pi], dt);
      if (world.over) return;
    }
    if (world.mode === 'vs' && world.players.length >= 2) {
      var p0 = world.players[0], p1 = world.players[1];
      if (Math.hypot(p0.x - p1.x, p0.y - p1.y) <= p0.r + p1.r + 4) {
        if (p0.dashTimer > 0 && p1.dashTimer <= 0) bonkPlayer(world, p1, p0.x, p0.y, 'rival');
        else if (p1.dashTimer > 0 && p0.dashTimer <= 0) bonkPlayer(world, p0, p1.x, p1.y, 'rival');
      }
    }
    stepGuards(world, dt);
    for (var bi = 0; bi < world.babies.length; bi++) world.babies[bi].phase += dt * 7;

    if (!world.over && world.timeLeft <= 0) {
      if (world.mode === 'vs') {
        var a = world.players[0], b = world.players[1];
        finishWorld(world, true, a.hatched > b.hatched ? 0 : b.hatched > a.hatched ? 1 : (a.score >= b.score ? 0 : 1));
      } else finishWorld(world, world.hatched >= world.goal, -1);
    }
  }

  function loadSave(raw) {
    var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, stars = [], best = [];
    for (var i = 0; i < STAGES.length; i++) {
      var st = Array.isArray(src.stars) ? src.stars[i] : 0, bs = Array.isArray(src.best) ? src.best[i] : 0;
      stars.push(Number.isFinite(st) ? clamp(st | 0, 0, 3) : 0);
      best.push(Number.isFinite(bs) ? clamp(bs | 0, 0, 9999999) : 0);
    }
    var skins = [0];
    if (Array.isArray(src.skins)) {
      for (var k = 0; k < src.skins.length; k++) {
        var sid = src.skins[k] | 0;
        if (sid >= 0 && sid < SKINS.length && skins.indexOf(sid) === -1) skins.push(sid);
      }
    }
    var activeSkin = clamp(src.skin | 0, 0, SKINS.length - 1);
    if (skins.indexOf(activeSkin) === -1) activeSkin = 0;
    return {
      v: 3, coins: Number.isFinite(src.coins) ? clamp(src.coins | 0, 0, 999999) : 0,
      stars: stars, best: best, skins: skins, skin: activeSkin,
      diff: DIFFS[src.diff] ? src.diff : 'normal',
      world: Number.isFinite(src.world) ? clamp(src.world | 0, 0, WORLDS.length - 1) : 0,
      stage: Number.isFinite(src.stage) ? clamp(src.stage | 0, 0, 2) : 0,
      coached: !!src.coached
    };
  }

  function buyOrEquipSkin(save, skinId) {
    var id = clamp(skinId | 0, 0, SKINS.length - 1), spec = SKINS[id];
    if (save.skins.indexOf(id) !== -1) { save.skin = id; return { ok: true, action: 'equip', skin: id }; }
    if (save.coins < spec.cost) return { ok: false, action: 'poor', need: spec.cost - save.coins };
    save.coins -= spec.cost; save.skins.push(id); save.skin = id;
    return { ok: true, action: 'buy', skin: id };
  }

  var EREngine = {
    W: W, H: H, AX0: AX0, AY0: AY0, AX1: AX1, AY1: AY1, BONK_DURATION: BONK_DURATION,
    DIFFS: DIFFS, SKINS: SKINS, WORLDS: WORLDS, STAGES: STAGES, EGG_SPECS: EGG_SPECS, GUARD_SPECS: GUARD_SPECS,
    getStage: getStage, stageIndexOf: stageIndexOf, chainSpeedMult: chainSpeedMult, chainScoreMult: chainScoreMult,
    clearSight: clearSight, atHome: atHome, isAtStart: isAtStart, canGuardSee: canGuardSee,
    createWorld: createWorld, stepWorld: stepWorld, loadSave: loadSave, buyOrEquipSkin: buyOrEquipSkin
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = EREngine;
  if (typeof window !== 'undefined') window.EREngine = EREngine;
})();
