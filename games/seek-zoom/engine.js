/* Seek and Zoom (ابحث وكبّر) engine: the five places, the things to find, each scene's
 * crowd of little things, the rounds, the camera (zoom around the pointer, pan, clamp),
 * clicks, stars and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (everything is seeded), so
 * tools/tests/seek-zoom-engine.test.mjs loads it with { window: {} }. game.js reads the
 * DDA, feeds the child's wheel, drags and clicks in and turns the results into pictures
 * and sound; art.js draws what this file places. */
(function () {
  'use strict';
  var SZ = window.SZ = window.SZ || {};
  var W = 1280, H = 720;
  SZ.W = W; SZ.H = H;
  // Screen edges covered by the HUD (the zoom column, the timer, the list of things to
  // find): the view may be panned this far past the scene so nothing stays under them.
  SZ.PAD = { l: 92, r: 0, t: 70, b: 118 };
  SZ.MIN_R = 11;       // a thing counts once it is at least this big on screen (radius, px)
  SZ.Z_MAX = 3;
  SZ.WRONG_OK = 3;     // at most this many wrong clicks for the accuracy star
  SZ.ROW = 3;          // wrong clicks in a row that cost the time penalty (when it is on)
  SZ.OPEN_AT = 0.6;    // a cover is open enough to look inside

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, a, b, d) { return typeof v === 'number' && v === v ? clamp(v, a, b) : d; }
  SZ.clamp = clamp;
  // mulberry32: a tiny seeded generator, so a scene is the same every time.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SZ.rng = rng;

  /* ------------------------------------------------------------ things */
  // r: size (world units, about half the picture's width) before a round's scale.
  // v: variants (the first ones are the usual targets, the others their look-alikes).
  // n: the Arabic word, g: its gender for the colour word, nc: no colour word.
  // mv: how it moves in rounds with moving things.
  var COLOR = {
    red: ['أحمر', 'حمراء'], blue: ['أزرق', 'زرقاء'], green: ['أخضر', 'خضراء'], yellow: ['أصفر', 'صفراء'],
    white: ['أبيض', 'بيضاء'], pink: ['وردي', 'وردية'], orange: ['برتقالي', 'برتقالية'], purple: ['بنفسجي', 'بنفسجية'],
    brown: ['بني', 'بنية'], gold: ['ذهبي', 'ذهبية'], silver: ['فضي', 'فضية'], spotted: ['مرقّط', 'مرقّطة']
  };
  SZ.KINDS = {
    kite: { r: 34, n: 'طائرة ورقية', g: 1, v: ['red', 'blue', 'green', 'yellow'] },
    duck: { r: 22, n: 'بطّة', g: 1, v: ['yellow', 'white'] },
    cat: { r: 24, n: 'قطّ', v: ['sleep', 'awake'], lab: { sleep: 'قطّ نائم', awake: 'قطّ مستيقظ' } },
    balloon: { r: 24, n: 'بالون', v: ['red', 'blue', 'green', 'yellow'] },
    dog: { r: 26, n: 'كلب', v: ['brown', 'spotted'] },
    icecream: { r: 20, n: 'آيس كريم', v: ['pink', 'brown'] },
    butterfly: { r: 18, n: 'فراشة', g: 1, v: ['blue', 'orange'], mv: 'fly' },
    ball: { r: 20, n: 'كرة', g: 1, v: ['beach', 'soccer'], lab: { beach: 'كرة شاطئ', soccer: 'كرة قدم' } },
    apple: { r: 18, n: 'تفّاحة', g: 1, v: ['red', 'green'] },
    melon: { r: 26, n: 'بطّيخة', g: 1, v: ['melon'], nc: 1 },
    fish: { r: 24, n: 'سمكة', g: 1, v: ['orange', 'blue'] },
    lantern: { r: 24, n: 'فانوس', v: ['orange', 'blue'] },
    hat: { r: 20, n: 'قبّعة', g: 1, v: ['red', 'blue'] },
    key: { r: 16, n: 'مفتاح', v: ['gold', 'silver'] },
    crab: { r: 20, n: 'سلطعون', v: ['red', 'blue'], mv: 'walk' },
    shell: { r: 16, n: 'صدفة', g: 1, v: ['pink', 'blue'] },
    starfish: { r: 18, n: 'نجم البحر', v: ['orange', 'purple'], nc: 1 },
    gull: { r: 22, n: 'نورس', v: ['white'], nc: 1, mv: 'fly' },
    boat: { r: 30, n: 'قارب', v: ['red', 'blue'], mv: 'sail' },
    teddy: { r: 26, n: 'دبدوب', v: ['brown', 'pink'] },
    car: { r: 22, n: 'سيّارة', g: 1, v: ['red', 'blue'], mv: 'walk' },
    robot: { r: 24, n: 'روبوت', v: ['blue', 'green', 'silver'] },
    rocket: { r: 26, n: 'صاروخ', v: ['red', 'white'] },
    star: { r: 18, n: 'نجمة', g: 1, v: ['gold', 'silver'] },
    book: { r: 20, n: 'كتاب', v: ['red', 'green'] },
    alien: { r: 22, n: 'فضائي', v: ['green', 'purple'] },
    astro: { r: 26, n: 'رائد فضاء', v: ['white', 'orange'], nc: 1, mv: 'float' },
    sat: { r: 26, n: 'قمر صناعي', v: ['gold'], nc: 1, mv: 'orbit' },
    ufo: { r: 26, n: 'صحن طائر', v: ['pink', 'green'], nc: 1, mv: 'fly' },
    planet: { r: 26, n: 'كوكب', v: ['ringed', 'plain'], lab: { ringed: 'كوكب بحلقة', plain: 'كوكب' } }
  };
  // The short Arabic name of one thing (the list adds the count as a number).
  SZ.label = function (k, v) {
    var K = SZ.KINDS[k];
    if (!K) return '';
    if (K.lab && K.lab[v]) return K.lab[v];
    if (K.nc || !COLOR[v]) return K.n;
    return K.n + ' ' + COLOR[v][K.g ? 1 : 0];
  };
  SZ.noun = function (k) { return SZ.KINDS[k] ? SZ.KINDS[k].n : ''; };

  /* ------------------------------------------------------------ scenes */
  // Zones are lists of shapes: [x, y, w, h] rectangles or ['e', cx, cy, rx, ry] ellipses.
  // A filler thing's box at scale 1, around its anchor (the middle of its feet):
  // [left, top, right, bottom]. art.js draws every filler thing inside its box.
  SZ.FB = {
    cloud: [-120, -76, 120, 6], tree: [-84, -214, 84, 10], bush: [-58, -62, 58, 8], flowers: [-38, -34, 38, 6],
    bench: [-64, -56, 64, 6], lamp: [-20, -176, 20, 6], person: [-30, -104, 30, 6], blanket: [-74, -30, 74, 30],
    swing: [-96, -158, 96, 6], slide: [-96, -136, 96, 6], reed: [-16, -66, 16, 4], rock: [-34, -30, 34, 6],
    fence: [-64, -46, 64, 6], house: [-152, -410, 152, 6], garland: [-160, -8, 160, 64], stall: [-152, -236, 152, 6],
    crate: [-38, -50, 38, 6], basket: [-34, -38, 34, 6], sack: [-30, -52, 30, 6], pot: [-28, -44, 28, 6],
    cart: [-76, -88, 76, 8], palm: [-96, -268, 96, 8], umbrella: [-80, -156, 80, 8], sunbather: [-64, -30, 64, 30],
    castle: [-54, -76, 54, 8], bucket: [-22, -34, 22, 6], board: [-20, -116, 20, 6], swimmer: [-24, -26, 24, 8],
    buoy: [-18, -28, 18, 8], books: [-64, -74, 64, 4], frame: [-64, -104, 64, 6], blocks: [-48, -96, 48, 6],
    train: [-126, -66, 126, 8], drum: [-38, -54, 38, 6], cushion: [-54, -34, 54, 10], xylo: [-54, -30, 54, 6],
    plant: [-34, -108, 34, 6], cube: [-24, -46, 24, 4], rug: [-270, -116, 270, 116], module: [-176, -212, 176, 8],
    panel: [-116, -56, 116, 56], antenna: [-24, -96, 24, 6], crater: [-56, -20, 56, 20], flag: [-14, -88, 46, 6],
    comet: [-90, -24, 26, 24], crew: [-30, -110, 30, 6], toylamp: [-30, -150, 30, 6], mat: [-80, -50, 80, 50],
    crayons: [-30, -42, 30, 6], tent: [-108, -172, 108, 6], rover: [-64, -92, 64, 6], dome: [-120, -116, 120, 8]
  };
  // The park's winding path.
  SZ.parkPath = function (x) { return 1140 + 60 * Math.sin(x / 320 + 0.5); };

  var R0 = function (x, y, w, h) { return [x, y, w, h]; };
  SZ.WORLDS = [
    { id: 'park', name: 'الحديقة', w: 2560, h: 1440, seed: 101, color: '#5cc24a', frame: '#2f7a2c',
      zones: { sky: [R0(80, 60, 2400, 300)], pond: [['e', 1880, 820, 330, 165]],
        grass: [R0(80, 520, 1360, 470), R0(2300, 520, 200, 470), R0(80, 1278, 2400, 128)] },
      home: { kite: 'sky', balloon: 'sky', duck: 'pond', cat: 'grass', dog: 'grass', icecream: 'grass', butterfly: 'grass', ball: 'grass' },
      rounds: [
        { f: [['kite', 'red', 1], ['duck', 'yellow', 2], ['cat', 'sleep', 1]], sc: 1.7, lock: 1, par: 40, x: 2 },
        { f: [['balloon', 'red', 2], ['dog', 'brown', 1], ['icecream', 'pink', 1], ['kite', 'blue', 1]], sc: 1.6, lock: 1, par: 45, x: 3 },
        { f: [['duck', 'yellow', 3], ['ball', 'beach', 1], ['cat', 'sleep', 1]], sc: 0.7, zmax: 2, par: 55, x: 4 },
        { f: [['kite', 'green', 1], ['balloon', 'yellow', 2], ['dog', 'spotted', 1], ['icecream', 'pink', 2]], sc: 0.62, zmax: 2.5, par: 65, x: 5 },
        { f: [['butterfly', 'blue', 2], ['duck', 'yellow', 3], ['cat', 'sleep', 1], ['kite', 'red', 1]], sc: 0.55, mv: 1, zmax: 2.5, par: 80, x: 5 }
      ] },
    { id: 'market', name: 'السوق', w: 3200, h: 1800, seed: 202, color: '#ff9f43', frame: '#8a4b16',
      zones: { top: [R0(80, 360, 3040, 120)], stall: [R0(100, 708, 3000, 64), R0(100, 1108, 3000, 64), R0(100, 1508, 3000, 64)],
        aisle: [R0(80, 530, 3040, 84), R0(80, 884, 3040, 132), R0(80, 1284, 3040, 132), R0(80, 1684, 3040, 96)] },
      home: { apple: 'stall', melon: 'stall', fish: 'stall', lantern: 'top', hat: 'aisle', cat: 'aisle', key: 'aisle' },
      rounds: [
        { f: [['apple', 'red', 3], ['lantern', 'orange', 1], ['melon', 'melon', 1]], sc: 0.75, par: 60, x: 5 },
        { f: [['fish', 'blue', 2], ['hat', 'red', 1], ['cat', 'awake', 1], ['key', 'gold', 1]], sc: 0.7, par: 70, x: 6 },
        { f: [['hat', 'blue', 2], ['apple', 'green', 2], ['lantern', 'blue', 1]], sc: 0.6, par: 75, x: 6 },
        { f: [['key', 'gold', 1], ['cat', 'sleep', 1], ['fish', 'orange', 3], ['melon', 'melon', 1]], sc: 0.55, par: 85, x: 7 },
        { f: [['apple', 'red', 2], ['hat', 'red', 1], ['lantern', 'orange', 2], ['key', 'silver', 1], ['cat', 'awake', 1]], sc: 0.5, par: 95, x: 7 }
      ] },
    { id: 'beach', name: 'الشاطئ', w: 3200, h: 1800, seed: 303, color: '#ffc94d', frame: '#1f6fa8',
      zones: { sky: [R0(80, 60, 3040, 250)], sea: [R0(80, 450, 3040, 300)], shore: [R0(80, 832, 3040, 116)], sand: [R0(80, 990, 3040, 750)] },
      home: { crab: 'shore sand', shell: 'shore sand', starfish: 'shore sand', ball: 'sand', gull: 'sky', boat: 'sea', icecream: 'sand', kite: 'sky' },
      rounds: [
        { f: [['crab', 'red', 2], ['shell', 'pink', 2], ['ball', 'beach', 1]], sc: 0.6, mv: 1, par: 70, x: 6 },
        { f: [['gull', 'white', 2], ['starfish', 'orange', 2], ['icecream', 'pink', 1], ['boat', 'red', 1]], sc: 0.55, mv: 1, par: 80, x: 6 },
        { f: [['crab', 'red', 3], ['shell', 'blue', 1], ['kite', 'yellow', 1]], sc: 0.5, mv: 1, par: 80, x: 7 },
        { f: [['starfish', 'purple', 1], ['gull', 'white', 1], ['boat', 'blue', 1], ['ball', 'beach', 2], ['icecream', 'brown', 1]], sc: 0.45, mv: 1, par: 90, x: 7 },
        { f: [['crab', 'red', 2], ['shell', 'pink', 3], ['starfish', 'orange', 1], ['gull', 'white', 1]], sc: 0.42, mv: 1, par: 100, x: 8 }
      ] },
    { id: 'toys', name: 'غرفة الألعاب', w: 3200, h: 1800, seed: 404, color: '#b57bff', frame: '#5b3a8c', cover: 'box',
      zones: { shelf: [R0(150, 262, 2000, 64), R0(150, 552, 2000, 64)], wall: [R0(160, 70, 1980, 150), R0(2300, 610, 780, 170)], floor: [R0(80, 930, 3040, 810)] },
      home: { teddy: 'floor shelf', car: 'floor', robot: 'floor shelf', rocket: 'floor shelf', ball: 'floor', star: 'shelf floor', book: 'shelf floor', duck: 'floor', balloon: 'wall' },
      coverZone: 'floor',
      rounds: [
        { f: [['teddy', 'brown', 1, 1], ['car', 'red', 2], ['star', 'gold', 1]], sc: 0.6, cov: 2, zo: 1.1, par: 75, x: 6 },
        { f: [['robot', 'blue', 1, 1], ['rocket', 'red', 1], ['car', 'blue', 1], ['book', 'green', 2]], sc: 0.55, mv: 1, cov: 2, zo: 1.2, par: 85, x: 6 },
        { f: [['star', 'gold', 2, 1], ['ball', 'soccer', 1], ['teddy', 'pink', 1], ['duck', 'yellow', 1]], sc: 0.5, mv: 1, cov: 3, zo: 1.3, par: 90, x: 7 },
        { f: [['rocket', 'red', 1, 1], ['robot', 'green', 1, 1], ['car', 'red', 2], ['balloon', 'blue', 1]], sc: 0.45, mv: 1, cov: 3, zo: 1.4, par: 95, x: 7 },
        { f: [['teddy', 'brown', 2, 1], ['book', 'red', 1], ['star', 'gold', 1], ['car', 'blue', 1], ['ball', 'soccer', 1]], sc: 0.42, mv: 1, cov: 3, zo: 1.5, par: 105, x: 8 }
      ] },
    { id: 'space', name: 'محطة الفضاء', w: 3200, h: 1800, seed: 505, color: '#4f7bff', frame: '#120c33', cover: 'hatch',
      zones: { space: [R0(80, 60, 3040, 340)], station: [R0(250, 560, 2700, 150), R0(250, 940, 2700, 150)], moon: [R0(80, 1560, 3040, 180)] },
      home: { alien: 'station moon', astro: 'space station', rocket: 'space moon', sat: 'space', star: 'space station', planet: 'space', ufo: 'space', robot: 'station moon', key: 'station moon' },
      coverZone: 'station',
      rounds: [
        { f: [['alien', 'green', 2], ['rocket', 'white', 1], ['star', 'gold', 1]], sc: 0.55, time: 120, par: 60, x: 6 },
        { f: [['astro', 'white', 1], ['ufo', 'pink', 1], ['planet', 'ringed', 1], ['alien', 'purple', 2]], sc: 0.5, mv: 1, time: 120, par: 70, x: 6 },
        { f: [['sat', 'gold', 1], ['alien', 'green', 1, 1], ['robot', 'silver', 1], ['star', 'gold', 2]], sc: 0.48, mv: 1, cov: 2, zo: 1.3, time: 110, par: 75, x: 7 },
        { f: [['ufo', 'green', 1], ['key', 'gold', 1, 1], ['astro', 'orange', 1], ['planet', 'plain', 1], ['alien', 'purple', 1]], sc: 0.45, mv: 1, cov: 3, zo: 1.4, time: 110, par: 80, x: 7 },
        { f: [['alien', 'green', 3], ['rocket', 'red', 1, 1], ['sat', 'gold', 1], ['astro', 'white', 1], ['star', 'silver', 1]], sc: 0.42, mv: 1, cov: 3, zo: 1.5, time: 120, par: 95, x: 8 }
      ] }
  ];
  SZ.PER = 5;  // rounds in each place
  SZ.COUNT = SZ.WORLDS.length * SZ.PER;
  SZ.round = function (i) { return SZ.WORLDS[Math.floor(i / SZ.PER)].rounds[i % SZ.PER]; };

  // A random point inside one shape of a zone (chosen by area), or null.
  function pickShape(shapes, rnd) {
    var tot = 0, i, a = [];
    for (i = 0; i < shapes.length; i++) { var s = shapes[i]; a.push(s[0] === 'e' ? Math.PI * s[3] * s[4] : s[2] * s[3]); tot += a[i]; }
    var x = rnd() * tot;
    for (i = 0; i < shapes.length; i++) { x -= a[i]; if (x <= 0) return shapes[i]; }
    return shapes[shapes.length - 1];
  }
  function inShape(s, x, y, ex, ey) {
    if (s[0] === 'e') {
      var rx = s[3] - ex, ry = s[4] - ey;
      if (rx <= 0 || ry <= 0) return false;
      var dx = (x - s[1]) / rx, dy = (y - s[2]) / ry;
      return dx * dx + dy * dy <= 1;
    }
    return x - ex >= s[0] && x + ex <= s[0] + s[2] && y - ey >= s[1] && y + ey <= s[1] + s[3];
  }
  function pointIn(s, rnd) {
    if (s[0] === 'e') {
      var a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
      return { x: s[1] + Math.cos(a) * s[3] * d, y: s[2] + Math.sin(a) * s[4] * d };
    }
    return { x: s[0] + rnd() * s[2], y: s[1] + rnd() * s[3] };
  }
  SZ.inShape = inShape;

  /* ---------------------------------------------------------- the filler */
  // Each scene is the same every time: its seed places hundreds of little things.
  // An object: { k, x, y, s (scale), c (a colour seed), f (1 or -1, facing), l (layer), b: box }.
  function filler(wi) {
    var Wd = SZ.WORLDS[wi], rnd = rng(Wd.seed), objs = [];
    function put(k, x, y, s, l) {
      var B = SZ.FB[k], f = rnd() < 0.5 ? -1 : 1;
      x = Math.round(x); y = Math.round(y); s = Math.round(s * 100) / 100;
      objs.push({ k: k, x: x, y: y, s: s, c: Math.floor(rnd() * 1000), f: f, l: l || 0,
        b: [Math.round(x + B[0] * s), Math.round(y + B[1] * s), Math.round(x + B[2] * s), Math.round(y + B[3] * s)] });
    }
    // n things of kind k at random in the shapes, scale lo..hi, at least gap apart.
    function scatter(k, n, shapes, lo, hi, l, gap) {
      var mine = [];
      for (var i = 0; i < n; i++) {
        var p = null;
        for (var a = 0; a < 30; a++) {
          p = pointIn(pickShape(shapes, rnd), rnd);
          if (!gap || mine.every(function (q) { return Math.abs(q.x - p.x) + Math.abs(q.y - p.y) >= gap; })) break;
        }
        mine.push(p);
        put(k, p.x, p.y, lo + rnd() * (hi - lo), l);
      }
    }
    function row(k, x0, x1, step, y, s, jit, l) {
      for (var x = x0; x <= x1; x += step) put(k, x + (rnd() - 0.5) * jit, y + (rnd() - 0.5) * jit * 0.3, s * (0.92 + rnd() * 0.16), l);
    }
    var R = R0;
    if (Wd.id === 'park') {
      scatter('cloud', 9, [R(80, 80, 2400, 230)], 0.7, 1.3, 0, 260);
      row('tree', 40, 2560, 120, 470, 0.95, 60, 1);
      scatter('tree', 9, [R(120, 640, 1200, 330)], 0.9, 1.2, 1, 180);
      scatter('bush', 34, [R(60, 500, 1400, 520), R(2300, 520, 240, 520), R(60, 1270, 2440, 150)], 0.6, 1.1, 1, 70);
      scatter('flowers', 70, [R(60, 500, 1400, 520), R(2280, 500, 260, 560), R(60, 1270, 2440, 160)], 0.6, 1.2, 0, 40);
      for (var bx = 180; bx < 2560; bx += 340) put('bench', bx, SZ.parkPath(bx) - 72, 1, 1);
      for (var lx = 360; lx < 2560; lx += 440) put('lamp', lx, SZ.parkPath(lx) - 66, 1, 1);
      for (var px = 60; px < 2560; px += 70) {
        if (rnd() < 0.55) put('person', px + rnd() * 30, SZ.parkPath(px) - 30 + rnd() * 60, 0.75 + rnd() * 0.35, 1);
      }
      scatter('person', 34, [R(80, 540, 1340, 450), R(80, 1280, 2400, 120)], 0.6, 1.0, 1, 70);
      scatter('blanket', 6, [R(160, 600, 1200, 380)], 0.9, 1.1, 0, 300);
      put('swing', 420, 700, 1, 1); put('slide', 760, 720, 1, 1);
      for (var a = 0; a < 18; a++) { var an = a / 18 * Math.PI * 2 + 0.2; put('reed', 1880 + Math.cos(an) * 405, 820 + Math.sin(an) * 205 + 30, 0.8 + rnd() * 0.4, 1); }
      scatter('rock', 12, [R(80, 520, 1360, 470), R(80, 1280, 2400, 120)], 0.6, 1.0, 1, 120);
      row('fence', 60, 2520, 128, 1436, 1, 0, 1);
    } else if (Wd.id === 'market') {
      row('house', 150, 3100, 292, 532, 1, 24, 1);
      row('garland', 296, 2950, 292, 360, 1, 0, 2);
      [860, 1260, 1660].forEach(function (y) { row('stall', 160, 3060, 300, y, 0.96, 10, 1); });
      scatter('person', 150, [R(60, 900, 3080, 130), R(60, 1300, 3080, 130), R(60, 1700, 3080, 90), R(60, 548, 3080, 64)], 0.55, 0.95, 1, 30);
      scatter('crate', 26, [R(60, 890, 3080, 120), R(60, 1290, 3080, 120), R(60, 1690, 3080, 90)], 0.7, 1.0, 1, 90);
      scatter('basket', 22, [R(60, 890, 3080, 120), R(60, 1290, 3080, 120), R(60, 1690, 3080, 90)], 0.7, 1.0, 1, 90);
      scatter('sack', 18, [R(60, 890, 3080, 120), R(60, 1290, 3080, 120)], 0.7, 1.0, 1, 100);
      scatter('pot', 14, [R(60, 890, 3080, 120), R(60, 1290, 3080, 120), R(60, 1690, 3080, 90)], 0.7, 1.0, 1, 120);
      scatter('cart', 4, [R(200, 920, 2800, 100), R(200, 1320, 2800, 100)], 0.9, 1.0, 1, 600);
      scatter('plant', 8, [R(60, 540, 3080, 60)], 0.8, 1.0, 1, 300);
    } else if (Wd.id === 'beach') {
      scatter('cloud', 8, [R(80, 80, 3040, 200)], 0.8, 1.4, 0, 340);
      scatter('swimmer', 26, [R(80, 520, 3040, 280)], 0.7, 1.0, 1, 90);
      scatter('buoy', 9, [R(80, 470, 3040, 300)], 0.8, 1.0, 1, 280);
      row('palm', 120, 3100, 380, 1010, 1, 120, 1);
      scatter('sunbather', 46, [R(80, 1080, 3040, 660)], 0.8, 1.05, 0, 70);
      scatter('umbrella', 34, [R(80, 1100, 3040, 640)], 0.8, 1.05, 1, 120);
      scatter('person', 60, [R(80, 860, 3040, 100), R(80, 1060, 3040, 680)], 0.55, 0.95, 1, 50);
      scatter('castle', 12, [R(80, 1080, 3040, 660)], 0.7, 1.0, 1, 200);
      scatter('bucket', 16, [R(80, 870, 3040, 860)], 0.7, 1.0, 1, 150);
      scatter('rock', 12, [R(80, 850, 3040, 100)], 0.6, 1.0, 1, 200);
      scatter('board', 8, [R(80, 1070, 3040, 640)], 0.8, 1.0, 1, 300);
    } else if (Wd.id === 'toys') {
      row('frame', 280, 2100, 360, 230, 0.9, 40, 1);
      row('books', 230, 2120, 210, 330, 1, 60, 1);
      row('books', 330, 2100, 230, 620, 1, 60, 1);
      row('garland', 300, 2000, 340, 16, 0.9, 0, 2);
      scatter('rug', 3, [R(500, 1150, 2200, 450)], 0.9, 1.1, 0, 800);
      scatter('mat', 7, [R(120, 960, 2960, 760)], 0.9, 1.1, 0, 300);
      scatter('cushion', 12, [R(80, 950, 3040, 790)], 0.8, 1.1, 0, 200);
      scatter('plant', 3, [R(2250, 890, 900, 40)], 0.9, 1.1, 1, 300);
      put('toylamp', 2260, 900, 1, 1);
      scatter('tent', 2, [R(300, 980, 2600, 120)], 0.9, 1.0, 1, 1200);
      scatter('blocks', 28, [R(80, 960, 3040, 780)], 0.7, 1.0, 1, 130);
      scatter('train', 5, [R(300, 1000, 2600, 700)], 0.9, 1.0, 1, 450);
      scatter('drum', 8, [R(80, 960, 3040, 780)], 0.8, 1.0, 1, 260);
      scatter('xylo', 7, [R(80, 960, 3040, 780)], 0.8, 1.0, 1, 260);
      scatter('crayons', 14, [R(80, 960, 3040, 780)], 0.8, 1.0, 1, 200);
      scatter('person', 40, [R(80, 960, 3040, 780)], 0.45, 0.65, 1, 100);
      scatter('cube', 56, [R(80, 940, 3040, 800)], 0.7, 1.0, 1, 70);
    } else {
      scatter('comet', 4, [R(80, 80, 3040, 300)], 0.8, 1.2, 0, 600);
      scatter('panel', 8, [R(150, 440, 2900, 60), R(150, 1260, 2900, 120)], 0.8, 1.0, 0, 330);
      row('module', 330, 2900, 380, 760, 1, 40, 1);
      row('module', 520, 2800, 400, 1140, 0.95, 40, 1);
      scatter('antenna', 8, [R(300, 520, 2600, 20)], 0.8, 1.1, 1, 300);
      scatter('dome', 3, [R(300, 1560, 2600, 40)], 0.9, 1.1, 1, 900);
      scatter('rover', 4, [R(200, 1600, 2800, 140)], 0.8, 1.0, 1, 600);
      scatter('crew', 64, [R(250, 600, 2700, 140), R(250, 980, 2700, 140), R(80, 1580, 3040, 160)], 0.5, 0.75, 1, 45);
      scatter('crate', 22, [R(250, 1000, 2700, 120), R(80, 1580, 3040, 160)], 0.6, 0.9, 1, 140);
      scatter('crater', 22, [R(80, 1520, 3040, 240)], 0.7, 1.4, 0, 150);
      scatter('rock', 26, [R(80, 1560, 3040, 200)], 0.6, 1.0, 1, 120);
      scatter('flag', 3, [R(300, 1560, 2600, 100)], 1, 1, 1, 800);
    }
    // Flat things first, then standing things from the back to the front, then overhead.
    objs.sort(function (a, b) { return a.l - b.l || a.y - b.y || a.x - b.x; });
    return objs;
  }
  // Star dots of the space scene and sand speckles: background specks, seeded too.
  function specks(wi) {
    var Wd = SZ.WORLDS[wi], rnd = rng(Wd.seed + 77), out = [], n = Wd.id === 'space' ? 520 : Wd.id === 'beach' ? 360 : 0;
    for (var i = 0; i < n; i++) {
      var x = Math.round(rnd() * Wd.w), y = Wd.id === 'space' ? Math.round(rnd() * 1500) : Math.round(880 + rnd() * 900);
      out.push([x, y, Math.round((1 + rnd() * (Wd.id === 'space' ? 3 : 2.4)) * 10) / 10]);
    }
    return out;
  }
  var scenes = {};
  SZ.scene = function (wi) {
    if (!scenes[wi]) { var Wd = SZ.WORLDS[wi]; scenes[wi] = { wi: wi, id: Wd.id, w: Wd.w, h: Wd.h, objs: filler(wi), dots: specks(wi) }; }
    return scenes[wi];
  };

  /* ------------------------------------------------------------ rounds */
  // How far a thing reaches when you click it (world units) at zoom z: a bit more than
  // its picture, plus a few screen pixels for small hands, never past 1.7 times its size.
  // A cover (a toy box, a hatch) has its own size cv.r, never smaller than what it hides.
  SZ.hitR = function (it, z) { return Math.max(it.r * 1.2 + Math.min(12 / z, it.r * 0.5), it.cv ? it.cv.r * 1.5 : 0); };
  // The most it ever reaches, for keeping things apart.
  SZ.reach = function (it) { return Math.max(it.r, it.cv ? it.cv.r : 0) * 1.7 + 4; };
  // Where a thing is at time t (moving things follow a seeded path; still things stay).
  SZ.pos = function (it, t, out) {
    out = out || {};
    var m = it.m;
    if (!m) { out.x = it.x; out.y = it.y; out.d = 1; return out; }
    var a = m.w * t + m.ph, s = Math.sin(a), c = Math.cos(a);
    if (m.k === 'orbit') { out.x = it.x + m.ax * c; out.y = it.y + m.ay * s; out.d = s < 0 ? 1 : -1; }
    else if (m.k === 'fly' || m.k === 'float') { out.x = it.x + m.ax * s; out.y = it.y + m.ay * Math.sin(2 * a); out.d = c >= 0 ? 1 : -1; }
    else { out.x = it.x + m.ax * s; out.y = it.y; out.d = c >= 0 ? 1 : -1; }
    return out;
  };
  // How far open a cover is at zoom z: shut below its zoom, wide open a little above it.
  SZ.coverOpen = function (it, z) { return it.cv ? clamp((z - it.cv.zo) / 0.35, 0, 1) : 1; };
  // The zoom a thing needs before it can be picked.
  SZ.needZoom = function (it) { return Math.max(SZ.MIN_R / it.r, it.cv ? it.cv.zo + 0.35 * SZ.OPEN_AT : 0); };

  // The zoom range of a round in place wi.
  SZ.zoomRange = function (wi, d) {
    var Wd = SZ.WORLDS[wi];
    if (d.lock) return [1, 1];
    return [Math.max(W / Wd.w, H / Wd.h), d.zmax || SZ.Z_MAX];
  };

  // Builds round ri of place wi with the difficulty the UI read from Kit.dda:
  //   size: things' size factor (big for the youngest), decoys: look-alikes per thing to
  //   find, speed: how fast moving things go, pen: seconds for wrong clicks in a row (0 = off),
  //   timeK: the time limit's factor in timed rounds, seed: which arrangement (0..2).
  SZ.makeRound = function (wi, ri, p) {
    p = p || {};
    var Wd = SZ.WORLDS[wi], d = Wd.rounds[ri];
    var size = num(p.size, 0.7, 1.4, 1), dec = Math.round(num(p.decoys, 0, 4, 1)), spd = num(p.speed, 0.5, 1.5, 1);
    var seed = Math.round(num(p.seed, 0, 9, 0)), zr = SZ.zoomRange(wi, d);
    var rnd = rng(Wd.seed * 1009 + ri * 131 + seed * 7919 + Math.round(size * 100) * 17 + dec * 3 + 1);
    var R = { wi: wi, ri: ri, i: wi * SZ.PER + ri, d: d, items: [], list: [], t: 0, wrong: 0, row: 0, pen: 0, found: 0, total: 0,
      done: false, over: false, timeUp: false, penalty: Math.round(num(p.pen, 0, 30, 0)),
      limit: d.time ? Math.round(d.time * num(p.timeK, 0.6, 1.6, 1)) : 0, par: d.par, zmin: zr[0], zmax: zr[1], seed: seed, failed: 0 };
    var id = 0;
    function zonesOf(k, override) {
      var names = (override || Wd.home[k] || '').split(' '), out = [];
      names.forEach(function (n) { if (Wd.zones[n]) out = out.concat(Wd.zones[n]); });
      return out;
    }
    function clear(it) {
      var hm = SZ.reach(it);
      for (var i = 0; i < R.items.length; i++) {
        var o = R.items[i], ax = it.m ? it.m.ax : 0, ay = it.m ? it.m.ay : 0, bx = o.m ? o.m.ax : 0, by = o.m ? o.m.ay : 0;
        var dx = Math.max(0, Math.abs(it.x - o.x) - ax - bx), dy = Math.max(0, Math.abs(it.y - o.y) - ay - by);
        if (dx * dx + dy * dy < Math.pow(hm + SZ.reach(o) + 6, 2)) return false;
      }
      return true;
    }
    function place(it, shapes) {
      var K = SZ.KINDS[it.k], moving = d.mv && K && K.mv && !it.cv;
      for (var a = 0; a < 700; a++) {
        var s = pickShape(shapes, rnd), q = pointIn(s, rnd);
        it.x = Math.round(q.x); it.y = Math.round(q.y);
        it.m = null;
        if (moving) {
          var k = K.mv, ax = k === 'orbit' ? 40 + rnd() * 30 : 60 + rnd() * 90, ay = k === 'walk' || k === 'sail' ? 0 : k === 'orbit' ? ax * 0.6 : 18 + rnd() * 22;
          var v = (k === 'sail' ? 16 : k === 'float' ? 14 : k === 'orbit' ? 22 : 30) * spd;
          it.m = { k: k, ax: Math.round(ax), ay: Math.round(ay), w: Math.round(v / ax * 1000) / 1000, ph: Math.round(rnd() * 628) / 100 };
        }
        var big = Math.max(it.r, it.cv ? it.cv.r : 0), ex = big * 1.25 + (it.m ? it.m.ax : 0), ey = big * 1.25 + (it.m ? it.m.ay : 0);
        if (!inShape(s, it.x, it.y, ex, ey)) continue;
        if (clear(it)) { R.items.push(it); return true; }
      }
      return false;
    }
    function item(k, v, r, e, cover) {
      var it = { id: ++id, k: k, v: v, r: Math.round(r * 10) / 10, e: e, got: false, x: 0, y: 0, m: null, cv: null };
      if (cover) it.cv = { k: Wd.cover || 'box', zo: d.zo || 1.2, c: Math.floor(rnd() * 4), r: Math.max(it.r, 22) };
      return it;
    }
    var radii = [];
    // The things to find (covered ones first: they need the most room).
    var order = d.f.map(function (f, e) { return e; }).sort(function (a, b) { return (d.f[b][3] ? 1 : 0) - (d.f[a][3] ? 1 : 0); });
    d.f.forEach(function (f) { R.list.push({ k: f[0], v: f[1], n: f[2], got: 0, hid: !!f[3] }); R.total += f[2]; });
    order.forEach(function (e) {
      var f = d.f[e], K = SZ.KINDS[f[0]];
      for (var n = 0; n < f[2]; n++) {
        var it = item(f[0], f[1], K.r * d.sc * size, e, !!f[3]);
        radii.push(it.r);
        if (!place(it, zonesOf(f[0], f[3] ? Wd.coverZone : null))) R.failed++;
      }
    });
    // Covers with nothing inside (so a peek is a real look).
    var rAvg = radii.reduce(function (a, b) { return a + b; }, 0) / radii.length;
    for (var c = 0; c < (d.cov || 0); c++) place(item('', '', rAvg, -1, true), zonesOf('', Wd.coverZone));
    // Look-alikes: the same thing in another colour.
    d.f.forEach(function (f) {
      var K = SZ.KINDS[f[0]], others = K.v.filter(function (v) { return v !== f[1]; });
      if (!others.length) return;
      for (var n = 0; n < dec; n++) place(item(f[0], others[n % others.length], K.r * d.sc * size, -1, false), zonesOf(f[0]));
    });
    // Other things of the place that are not on the list.
    var pool = Object.keys(Wd.home).filter(function (k) { return !d.f.some(function (f) { return f[0] === k; }); });
    for (var x = 0; x < (d.x || 0) + dec && pool.length; x++) {
      var k = pool[Math.floor(rnd() * pool.length)], K = SZ.KINDS[k];
      place(item(k, K.v[Math.floor(rnd() * K.v.length)], K.r * d.sc * size, -1, false), zonesOf(k));
    }
    return R;
  };

  // The round's clock: game time while the round is on. A timed round ends when its
  // time (minus penalties) runs out.
  SZ.tick = function (R, dt) {
    if (R.done || R.over) return;
    R.t += dt;
    if (R.limit && R.t + R.pen >= R.limit) { R.over = true; R.timeUp = true; }
  };
  SZ.left = function (R) { return R.limit ? Math.max(0, R.limit - R.t - R.pen) : 0; };

  /* ------------------------------------------------------------ camera */
  // The camera's centre (x, y) in the scene, its zoom z and the zoom it eases to (tz).
  // A zoom keeps one scene point (wx, wy) under one screen point (ax, ay): the pointer.
  SZ.camera = function (S, R) {
    var z0 = R.d.lock ? 1 : R.zmin;
    var cam = { x: S.w / 2, y: S.h / 2, z: z0, tz: z0, zmin: R.zmin, zmax: R.zmax, sw: S.w, sh: S.h, an: false, ax: 0, ay: 0, wx: 0, wy: 0, vx: 0, vy: 0 };
    SZ.clampCam(cam);
    return cam;
  };
  SZ.toWorld = function (cam, sx, sy, out) { out = out || {}; out.x = cam.x + (sx - W / 2) / cam.z; out.y = cam.y + (sy - H / 2) / cam.z; return out; };
  SZ.toScreen = function (cam, wx, wy, out) { out = out || {}; out.x = W / 2 + (wx - cam.x) * cam.z; out.y = H / 2 + (wy - cam.y) * cam.z; return out; };
  // The view never leaves the scene, except just enough to bring its edges out from
  // under the HUD (pad: other room, such as none once the HUD is gone).
  SZ.clampCam = function (cam, pad) {
    var z = cam.z, P = pad || SZ.PAD;
    var lo = (W / 2 - P.l) / z, hi = cam.sw - (W / 2 - P.r) / z;
    cam.x = lo > hi ? cam.sw / 2 : clamp(cam.x, lo, hi);
    lo = (H / 2 - P.t) / z; hi = cam.sh - (H / 2 - P.b) / z;
    cam.y = lo > hi ? cam.sh / 2 : clamp(cam.y, lo, hi);
    return cam;
  };
  // Zoom by factor f around screen point (sx, sy). instant: no easing (reduced motion).
  SZ.zoomAt = function (cam, sx, sy, f, instant) {
    if (!(f > 0) || cam.zmax <= cam.zmin) return false;
    var w = SZ.toWorld(cam, sx, sy), tz = clamp(cam.tz * f, cam.zmin, cam.zmax);
    if (tz === cam.tz && tz === cam.z) return false;
    cam.tz = tz; cam.an = true; cam.ax = sx; cam.ay = sy; cam.wx = w.x; cam.wy = w.y;
    cam.vx = cam.vy = 0;
    if (instant) SZ.stepCam(cam, 1, true);
    return true;
  };
  // Move the view by a drag of (dsx, dsy) screen pixels: the scene follows the pointer.
  SZ.pan = function (cam, dsx, dsy) {
    var x = cam.x, y = cam.y;
    cam.x -= dsx / cam.z; cam.y -= dsy / cam.z;
    SZ.clampCam(cam);
    if (cam.an) { cam.wx += cam.x - x; cam.wy += cam.y - y; }
    return cam.x !== x || cam.y !== y;
  };
  // Eases the zoom (in log space, so every step feels the same) and glides a flung view.
  // still: reduced motion, the zoom and the glide stop at once. Returns true if it moved.
  SZ.stepCam = function (cam, dt, still) {
    var moved = false;
    if (cam.z !== cam.tz) {
      var lz = Math.log(cam.z), lt = Math.log(cam.tz), k = still ? 1 : 1 - Math.exp(-dt * 14);
      lz += (lt - lz) * k;
      cam.z = Math.abs(lt - lz) < 0.002 ? cam.tz : Math.exp(lz);
      moved = true;
    }
    if (cam.an) {
      cam.x = cam.wx - (cam.ax - W / 2) / cam.z; cam.y = cam.wy - (cam.ay - H / 2) / cam.z;
      SZ.clampCam(cam);
      if (cam.z === cam.tz) cam.an = false;
      moved = true;
    }
    if (still) { cam.vx = cam.vy = 0; }
    else if (cam.vx || cam.vy) {
      moved = SZ.pan(cam, cam.vx * dt, cam.vy * dt) || moved;
      var f = Math.exp(-dt * 5);
      cam.vx *= f; cam.vy *= f;
      if (Math.abs(cam.vx) + Math.abs(cam.vy) < 20) cam.vx = cam.vy = 0;
    }
    return moved;
  };
  // One wheel event's zoom factor. Browsers report pixels (mode 0), lines (1) or pages (2);
  // a notch is about 100 px (zoom x1.25). Trackpads send many tiny deltas; huge notches are
  // capped so one event never jumps more than x1.7. Wheel up (negative) zooms in.
  SZ.wheelFactor = function (dy, mode) {
    var px = dy * (mode === 1 ? 40 : mode === 2 ? 800 : 1);
    if (typeof px !== 'number' || px !== px) return 1;
    return Math.exp(-clamp(px, -240, 240) * 0.0022);
  };

  /* ------------------------------------------------------------ clicks */
  // What is under screen point (sx, sy): { t: 'found' | 'again' (already found) |
  // 'small' (too small yet: zoom in) | 'closed' (a shut cover: zoom in) | 'decoy' | 'miss', it }.
  var tmp = {};
  SZ.hit = function (R, cam, sx, sy) {
    var w = SZ.toWorld(cam, sx, sy), best = null, bd = Infinity;
    for (var i = 0; i < R.items.length; i++) {
      var it = R.items[i], p = SZ.pos(it, R.t, tmp), hr = SZ.hitR(it, cam.z), dd = Math.hypot(p.x - w.x, p.y - w.y) / hr;
      if (dd <= 1 && dd < bd) { bd = dd; best = it; }
    }
    if (!best) return { t: 'miss', it: null, x: w.x, y: w.y };
    var t = best.got ? 'again' : best.cv && SZ.coverOpen(best, cam.z) < SZ.OPEN_AT ? 'closed' : best.r * cam.z < SZ.MIN_R ? 'small' : best.e < 0 ? 'decoy' : 'found';
    return { t: t, it: best, x: w.x, y: w.y };
  };
  // A click in play. Finds the thing, or counts a wrong click (and, when the penalty is
  // on, wrong clicks in a row add seconds). 'small' and 'closed' are free: they say zoom.
  SZ.click = function (R, cam, sx, sy) {
    var h = SZ.hit(R, cam, sx, sy);
    if (R.done || R.over) { h.t = 'over'; return h; }
    if (h.t === 'found') {
      h.it.got = true; R.list[h.it.e].got++; R.found++; R.row = 0;
      h.entryDone = R.list[h.it.e].got >= R.list[h.it.e].n;
      if (R.found >= R.total) R.done = true;
    } else if (h.t === 'miss' || h.t === 'decoy') {
      R.wrong++; R.row++;
      if (R.penalty && R.row >= SZ.ROW) { R.pen += R.penalty; R.row = 0; h.pen = R.penalty; if (R.limit && R.t + R.pen >= R.limit) { R.over = true; R.timeUp = true; } }
    }
    return h;
  };

  /* ------------------------------------------------------------- stars */
  // 1 star for finding everything, +1 within the round's time, +1 for few wrong clicks.
  SZ.stars = function (R) {
    if (!R.done) return 0;
    return 1 + (R.t + R.pen <= R.par ? 1 : 0) + (R.wrong <= SZ.WRONG_OK ? 1 : 0);
  };
  // 0..1 for Kit.dda.
  SZ.outcome = function (R) { var s = SZ.stars(R); return s === 3 ? 1 : s === 2 ? 0.75 : s === 1 ? 0.4 : 0.1; };
  SZ.tenths = function (R) { return Math.max(1, Math.min(99999, Math.round((R.t + R.pen) * 10))); };

  /* ------------------------------------------------------------- saves */
  // { v: 1, r: [[stars 0..3, best time in tenths of a second], ... one per round],
  //   coach: [dragged once, zoomed once] }. A sticker is a round finished; a shiny one
  // has 3 stars.
  SZ.freshSave = function () {
    var r = [];
    for (var i = 0; i < SZ.COUNT; i++) r.push([0, 0]);
    return { v: 1, r: r, coach: [0, 0] };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Every field is checked: a damaged, hand-edited or future save always loads as a
  // playable one, keeping what is valid.
  SZ.loadSave = function (raw) {
    var s = SZ.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return s;
    var r = Array.isArray(raw.r) ? raw.r : [];
    for (var i = 0; i < SZ.COUNT; i++) {
      var e = r[i];
      if (!Array.isArray(e) || !int(e[0], 1, 3)) continue;
      s.r[i] = [e[0], int(e[1], 1, 99999) ? e[1] : 0];
    }
    var c = Array.isArray(raw.coach) ? raw.coach : [];
    s.coach = [c[0] === 1 ? 1 : 0, c[1] === 1 ? 1 : 0];
    return s;
  };
  // Rounds open one after the other.
  SZ.isOpen = function (s, i) { return int(i, 0, SZ.COUNT - 1) && (i === 0 || s.r[i - 1][0] > 0); };
  SZ.worldOpen = function (s, w) { return SZ.isOpen(s, w * SZ.PER); };
  SZ.totalStars = function (s) { var n = 0; for (var i = 0; i < SZ.COUNT; i++) n += s.r[i][0]; return n; };
  SZ.stickers = function (s) { var n = 0; for (var i = 0; i < SZ.COUNT; i++) if (s.r[i][0]) n++; return n; };
  SZ.worldStars = function (s, w) { var n = 0; for (var i = 0; i < SZ.PER; i++) n += s.r[w * SZ.PER + i][0]; return n; };
  // The round to play next: the first open round not finished yet, else the last open one.
  SZ.nextRound = function (s) {
    var last = 0;
    for (var i = 0; i < SZ.COUNT; i++) { if (!SZ.isOpen(s, i)) break; last = i; if (!s.r[i][0]) return i; }
    return last;
  };
  // Records a finished round. Returns what changed, for the celebration.
  SZ.applyResult = function (s, i, stars, tenths) {
    var e = s.r[i], out = { first: !e[0], best: !!e[0] && (stars > e[0] || (e[1] > 0 && tenths < e[1])), shiny: stars === 3 && e[0] < 3, unlocked: -1 };
    var wasOpen = i + 1 < SZ.COUNT && SZ.isOpen(s, i + 1);
    s.r[i] = [Math.max(e[0], stars), e[1] ? Math.min(e[1], tenths) : tenths];
    if (i + 1 < SZ.COUNT && !wasOpen && SZ.isOpen(s, i + 1)) out.unlocked = i + 1;
    return out;
  };
})();
